/**
 * printers/anycubic/index.js — Anycubic MQTT TLS live integration.
 *
 * Protocol: MQTTS port 9883 directly on the printer (TLS 1.2, self-signed
 * cert ignored), username/password provisioned from AnycubicSlicerNext's
 * on-disk config. See PROTOCOL.md.
 *
 * Subscribe: anycubic/anycubicCloud/v1/printer/public/{modelId}/{deviceId}/multiColorBox/report
 * Publish:   anycubic/anycubicCloud/v1/web/printer/{modelId}/{deviceId}/multiColorBox
 *
 * Live data: the main process subscribes to the printer's whole public
 * report subtree, so alongside the ACE layout (multiColorBox) we receive the
 * print job (`print`), temperatures (`tempature` — sic), fan (`fan`),
 * busy/free (`status`) and online (`lastWill`) report families. Field shapes
 * are documented in PROTOCOL.md §5b (cross-checked against the open-source
 * hass-anycubic_cloud integration, which parses the same report payloads).
 * Filament slots are editable (setInfo, base type + RGB only).
 *
 * Camera: HTTP-FLV on :18088, remuxed to JPEG frames by ffmpeg in the main
 * process ('anycubic:cam-frame' IPC) — same pattern as the Bambu RTSP cam.
 * The stream is ON-DEMAND (PROTOCOL.md §5c): /flv 404s until the printer is
 * told to start capturing, so we PROBE before spawning ffmpeg and only show
 * the feed when it's actually live (otherwise the hero photo stays). We can't
 * yet send the activation command ourselves (that's a future capture) — so
 * the camera "just works" whenever a stream is already live (e.g. opened in
 * the slicer) and stays quietly idle otherwise.
 *
 * Self-registers into the brands registry at module evaluation time.
 */
import { ctx } from '../context.js';
import { registerBrand } from '../registry.js';
import { meta, schema, helper } from './settings.js';
import { renderAcuFilamentCard, renderAcuJobCard, renderAcuTempCard, renderAcuControlCard } from './cards.js';
import { schemaWidget } from '../modal-helpers.js';
import { acuAgoraStart, acuAgoraStop, acuAgoraActive, acuAgoraOnLive } from './agora-cam.js';

const $ = id => document.getElementById(id);

// ── Private connection state ───────────────────────────────────────────────

/** Per-printer live state. Keyed by `${brand}:${id}`. */
const _acuConns = new Map();

// When the cloud (Agora) camera goes live, flip camLive + re-render so the
// banner swaps from the hero photo / loading overlay to the <video>.
acuAgoraOnLive((key) => {
  const conn = _acuConns.get(key);
  if (!conn) return;
  conn.data.camLive = true;
  ctx.onPrinterStatusChange?.(key, "connected");
});

// Re-query the layout this often while connected — keeps the slot colors in
// sync when the user changes filament from the printer / slicer / RFID tag.
const ACU_REFRESH_MS = 30_000;

// ── Public key helpers ─────────────────────────────────────────────────────

export function acuKey(p) { return `${p.brand}:${p.id}`; }
export function acuGetConn(key) { return _acuConns.get(key) ?? null; }

// ── Online status ──────────────────────────────────────────────────────────

export function acuIsOnline(printer) {
  if (printer?.brand !== "anycubic") return null;
  const key = acuKey(printer);
  if (ctx.isForcedOffline?.(key)) return false; // explicitly disconnected
  const conn = _acuConns.get(key);
  if (conn) return conn.status === "connected";
  return null; // no live connection → unknown
}

function _acuRefreshOnlineUI(key) {
  document.querySelectorAll(`[data-printer-key="${key}"] .printer-online`).forEach(el => {
    const p = ctx.getState().printers.find(x => acuKey(x) === key);
    el.outerHTML = renderAcuOnlineBadge(p, "card");
  });
  const active = ctx.getActivePrinter();
  if (active && acuKey(active) === key) {
    const host = $("ppOnlineRow");
    if (host) host.outerHTML = renderAcuOnlineBadge(active, "side");
  }
}

export function renderAcuOnlineBadge(printer, where) {
  if (!printer || printer.brand !== "anycubic") return "";
  const online = acuIsOnline(printer);
  const cls = online === true ? "is-online" : (online === false ? "is-offline" : "is-checking");
  const lbl = online === true  ? ctx.t("snapStatusOnline")
            : online === false ? ctx.t("snapStatusOffline")
            :                    ctx.t("snapStatusConnecting");
  const id  = where === "side" ? ` id="ppOnlineRow"` : "";
  return `<span class="printer-online printer-online--${ctx.esc(where)} ${cls}"${id}>
            <span class="printer-online-dot"></span>
            <span class="printer-online-lbl">${ctx.esc(lbl)}</span>
          </span>`;
}

// ── Request builder ────────────────────────────────────────────────────────

function _acuRequest(action, data, type = "multiColorBox") {
  const req = {
    type,
    action,
    timestamp: Date.now(),
    msgid: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
  };
  if (data) req.data = data;
  return req;
}

// ── Connection lifecycle ───────────────────────────────────────────────────

/**
 * Connect (or reconnect) an Anycubic printer. Idempotent: a live connection
 * with the same IP is left alone.
 *
 * @param {object} printer — printer record from state.printers; needs
 *   ip + acuModelId + deviceId + username + password (all written by the
 *   add flow — see add-flow.js / settings.js).
 * @param {object} [opts]
 * @param {boolean} [opts.skipCam=false] — true for background auto-connects
 *   (camera is neither activated nor streamed; saves printer + CPU resources
 *   when no panel shows the feed). When the sidecard / cam wall needs the
 *   camera, call acuConnect again without skipCam and it activates the stream
 *   (video/startCapture) on the live MQTT session.
 */
/** Fresh per-connection live-data block (shared by LAN + cloud). */
function _acuDefaultData() {
  return {
    boxes:      [],   // [{ id, modelId, temp, slots: [{ index, type, color }] }]
    extShelf:   null, // standalone external spool (no ACE) — { index, type, color }
    lastReport: null, // epoch ms of the last layout report
    // Print job (type:"print" reports — PROTOCOL.md §5b)
    printState:    null,  // printing|preparing|paused|finished|failed|idle
    printFilename: null,
    progress:      0,     // 0-100
    remainTime:    0,     // minutes
    currLayer:     0,
    totalLayers:   0,
    // Temperatures (type:"tempature" + print "updated" reports)
    nozzleCurrent: null, nozzleTarget: null,
    bedCurrent:    null, bedTarget:    null,
    // Misc telemetry
    fanSpeedPct:   null,
    printSpeedPct: null,
    workState:     null,  // "free" | "busy" (type:"status" workReport)
    // Camera (LAN/FLV only — never used for cloud printers)
    camWanted:     false,
    camLive:       false,
    camSupported:  null,
    camUrl:        null,  // FLV stream URL from info/report (data.urls.rtspUrl)
    lastCamFrame:  null,
    // Stored files (PROTOCOL.md §5e) — populated on demand by the Files sheet.
    localFiles:    [],    // [{ filename, timestamp(ms), size(bytes), isDir, plateNumber }]
    udiskFiles:    [],
    localFilesAt:  0, udiskFilesAt:  0,   // epoch ms of the last successful list
    localFilesLoading: false, udiskFilesLoading: false,
    // Cloud-uploaded files (PROTOCOL.md §9c) — cloud mode only, fetched via REST.
    cloudFiles:    [],    // [{ id, filename, timestamp(ms), size, thumbnail, sliceParam, sliceSize }]
    cloudFilesAt:  0, cloudFilesLoading: false,
    // Peripheral presence (type:"peripherie" query) — gates the USB tab. null =
    // not yet queried.
    udiskPresent:  null, cameraPresent: null, mcbPresent: null,
  };
}

/** True for cloud-mode printers (reached through Anycubic's cloud). */
function _acuIsCloud(p) { return p && p.mode === "cloud"; }

export function acuConnect(printer, { skipCam = false } = {}) {
  const key = acuKey(printer);
  const existing = _acuConns.get(key);

  // ── Cloud mode: shared cloud-MQTT subscription + REST getInfo ─────────────
  if (_acuIsCloud(printer)) {
    if (existing && (existing.status === "connected" || existing.status === "connecting")) {
      // Already live — a surface (side panel) opening (skipCam=false) wants the
      // Agora camera; start it if not already running.
      if (!skipCam) _acuCloudRequestCamera(existing);
      return;
    }
    const prev = existing?.data ? { ...existing.data } : null;
    if (existing) acuDisconnect(key);
    const conn = {
      key, ip: "", mode: "cloud", printer,
      status: "connecting", lastError: null, refreshTimer: null,
      log: [], logPaused: false, logExpanded: false,
      data: prev || _acuDefaultData(),
    };
    _acuConns.set(key, conn);
    // Open (idempotent) the shared cloud client, subscribe this printer's topic,
    // and pull a layout snapshot (also the reachability check). Reports arrive
    // on cloud.onMessage and flow through the same _acuMerge as LAN.
    window.anycubic?.cloud?.connect({ email: printer.cloudEmail, token: printer.cloudToken });
    window.anycubic?.cloud?.subscribe({ connKey: key, machineType: String(printer.machineType || printer.acuModelId || ""), key: printer.key });
    _acuCloudGetInfo(conn);
    _scheduleRefresh(conn);
    _acuNotify(conn, /*statusChanged*/ true);
    _acuRefreshOnlineUI(key);
    if (!skipCam) _acuCloudRequestCamera(conn);   // side panel open → Agora camera
    return;
  }

  // ── LAN mode (direct local broker) ────────────────────────────────────────
  const ip  = printer.ip || "";

  // Preserve live data across reconnections so the UI doesn't flicker.
  let _prevData = null;
  if (existing) {
    if ((existing.status === "connected" || existing.status === "connecting") && existing.ip === ip) {
      // Already live — (re)request the camera if a surface wants it and it
      // isn't already streaming. A delivering ffmpeg keeps running across
      // panel close/open, so this won't blank an active feed.
      if (!skipCam && ip && !existing.data?.camLive) {
        existing.data.camWanted = true;
        _acuRequestCamera(existing);
      }
      return;
    }
    if (existing.ip === ip && existing.data) _prevData = { ...existing.data };
    acuDisconnect(key);
  }

  const conn = {
    key,
    ip,
    mode:         "lan",
    status:       "connecting",
    lastError:    null,
    refreshTimer: null,
    log:          [],
    logPaused:    false,
    logExpanded:  false,
    // On reconnect: keep previous layout/job so the UI doesn't flash to
    // empty while the handshake completes. Clear lastCamFrame — the camera
    // stream is being restarted.
    data: _prevData ? { ..._prevData, lastCamFrame: null } : _acuDefaultData(),
  };
  // A fresh reconnect must not inherit a stale camLive (ffmpeg was stopped) or a
  // stale camUrl/token (re-learned from the next info/report within ~5 s).
  if (_prevData) { conn.data.camLive = false; conn.data.camWanted = false; conn.data.camUrl = null; }
  _acuConns.set(key, conn);

  // Camera: mark it wanted; the actual activation (video/startCapture) is sent
  // once MQTT reaches "connected" (see the onStatus handler) — we can't
  // publish before the broker session is up.
  if (!skipCam && ip) conn.data.camWanted = true;

  window.anycubic?.connect({
    key,
    ip,
    port:     Number(printer.port) || 9883,
    modelId:  String(printer.acuModelId || ""),
    deviceId: String(printer.deviceId || ""),
    username: printer.username || "",
    password: printer.password || "",
  });
}

export function acuDisconnect(key) {
  const conn = _acuConns.get(key);
  if (!conn) return;
  if (conn.refreshTimer) { clearTimeout(conn.refreshTimer); conn.refreshTimer = null; }
  // Cloud: leave the Agora camera channel + drop the shared-client subscription.
  if (conn.mode === "cloud") {
    acuAgoraStop(key);
    window.anycubic?.cloud?.unsubscribe(key);
    _acuConns.delete(key);
    return;
  }
  if (conn._camRetry)    { clearTimeout(conn._camRetry);    conn._camRetry = null; }
  // If we activated the camera, tell the printer to stop capturing so it isn't
  // left streaming after we're gone.
  if (conn.data?.camWanted && conn.brokerUp) _acuStopCapture(conn);
  window.anycubic?.camStop(key);
  window.anycubic?.disconnect(key);
  _acuConns.delete(key);
}

// ── Cloud transport helpers (REST sendOrder; reports arrive via cloud MQTT) ──

const ACU_ORDER_GET_INFO = 1206;
const ACU_ORDER_SET_SLOT = 1211;
const ACU_ORDER_GET_EXTFILBOX = 1230; // standalone external spool (no ACE)
const ACU_ORDER_SET_EXTFIL    = 1229; // set the standalone external spool

// Control-command order IDs — the cloud has NO MQTT publish path, so each LAN
// command maps to a REST sendOrder (AnycubicOrderID). Print-state / settings
// orders also need the active job's project_id (= the print taskid).
const ACU_ORD = {
  START_PRINT: 1,                 // print a stored file — {filetype, filename, filepath, …} (§5e)
  PAUSE: 2, RESUME: 3, STOP: 4,   // print control (need project_id)
  PRINT_SETTINGS: 6,              // temps / fan / speed-mode (need project_id) — {settings:{…}}
  LIST_UDISK: 101, DELETE_UDISK: 102,  // USB-stick files (§5e)
  LIST_LOCAL: 103, DELETE_LOCAL: 104,  // on-printer files (§5e)
  MOVE_AXLE: 201,                 // jog / home — {axis, move_type, distance}
  MOVE_AXLE_TURN_OFF: 1213,       // disable motors
  FEED_FILAMENT: 1208,            // load / unload / stop filament
  SET_LIGHT: 1233,                // light — {type, status, brightness}
  QUERY_PERIPHERALS: 1231,        // attached-peripheral query → type:"peripherie" (§5e)
};

// File sources (PROTOCOL.md §5e). Each maps a source to its list/delete order
// pair, the LAN MQTT request action strings (inferred from the response action
// names — confirm against real hardware via the debug log), and the START_PRINT
// `filetype` (1 = on-printer, 2 = USB stick).
const ACU_FILE_SRC = {
  local: { listOrder: ACU_ORD.LIST_LOCAL, delOrder: ACU_ORD.DELETE_LOCAL, listAction: "listLocal", delAction: "deleteLocal", filetype: 1 },
  udisk: { listOrder: ACU_ORD.LIST_UDISK, delOrder: ACU_ORD.DELETE_UDISK, listAction: "listUdisk", delAction: "deleteUdisk", filetype: 2 },
};

// True for a cloud-mode connection (no local broker → must use sendOrder).
function _acuConnIsCloud(conn) { return conn && conn.mode === "cloud"; }

// Send a control command over the cloud (REST sendOrder). `project:true` orders
// (pause/resume/stop, print-settings) carry the active job's project_id.
function _acuCloudOrder(conn, orderId, data, { project = false } = {}) {
  const p = conn && conn.printer;
  if (!p) return;
  // Project orders carry a project_id. PRINT_SETTINGS (temp/fan/speed) are applied
  // by Anycubic even at idle against the LATEST project (active if printing, else
  // the most recent — mirrors hass-anycubic), so fall back to it. pause/resume/stop
  // only make sense on the active job, but jobProjectId is set then anyway.
  const projectId = project ? (conn.data?.jobProjectId || conn.data?.latestProjectId || 0) : 0;
  // Log what's actually sent: main.js only attaches project_id when > 0.
  const logEntry = { orderId, data, via: "cloud" };
  if (projectId > 0) logEntry.projectId = projectId;
  _acuLogPush(conn, "→", logEntry);
  window.anycubic?.cloud?.sendOrder({
    token: p.cloudToken, orderId, printerId: p.cloudPrinterId, projectId, data: data ?? {},
  });
  // Refresh the request-log UI right away so the outgoing command is visible
  // immediately instead of only on the next poll tick.
  _acuNotify(conn);
}

// Strip the query string (S3 signature) so two URLs that point at the same
// object but were signed at different times compare equal.
function _acuThumbPath(u) {
  if (!u) return "";
  const q = u.indexOf("?");
  return q === -1 ? u : u.slice(0, q);
}

async function _acuCloudGetInfo(conn) {
  const p = conn.printer;
  if (!p) return;
  _acuLogPush(conn, "→", { type: "multiColorBox", action: "getInfo", via: "cloud" });
  // Also ask for the standalone external spool (Kobra 3 with no ACE reports it
  // here, not in multiColorBox). Fire-and-forget — harmless on ACE printers.
  try {
    window.anycubic?.cloud?.sendOrder({
      token: p.cloudToken, orderId: ACU_ORDER_GET_EXTFILBOX, printerId: p.cloudPrinterId, data: {},
    });
  } catch (_) {}
  let res;
  try {
    res = await window.anycubic?.cloud?.sendOrder({
      token: p.cloudToken, orderId: ACU_ORDER_GET_INFO, printerId: p.cloudPrinterId,
      data: { multi_color_box: [] },
    });
  } catch (_) { res = null; }
  if (res && res.ok === false) {
    _acuLogPush(conn, "←", { error: res.error, code: res.code });
    // 10001 = the stored token was revoked by a newer slicer login. Recover by
    // re-grabbing a fresh token from a bridge-mode slicer (if one is running).
    if (res.authError) _acuCloudRecover(conn);
  }

  // Current nozzle/bed temps — the cloud doesn't push tempature reports at idle,
  // but the REST printer status carries them in `parameter`. Poll + merge.
  try {
    const info = await window.anycubic?.cloud?.printerInfo(p.cloudToken, p.cloudPrinterId);
    if (info?.ok) {
      const d = conn.data;
      if (info.nozzleCurrent != null) d.nozzleCurrent = info.nozzleCurrent;
      if (info.bedCurrent   != null) d.bedCurrent    = info.bedCurrent;
      // Latest project id — project_id for PRINT_SETTINGS orders (temp/fan/speed)
      // so they work even at idle (against the most recent project).
      if (info.latestProjectId != null) d.latestProjectId = info.latestProjectId;
      // Active-job preview (signed S3 URL) — null when no print is running.
      // The signature changes on every poll even for the same image, so only
      // swap the URL when the underlying object path changes. Otherwise the
      // rendered background-image would reload (visible flicker) each report.
      const newThumb = info.jobThumb || null;
      if (_acuThumbPath(newThumb) !== _acuThumbPath(d.printThumb)) d.printThumb = newThumb;
      _acuNotify(conn);
    } else if (info && info.authError) {
      _acuCloudRecover(conn);
    }
  } catch (_) {}
}

// ── Cloud token recovery (revocation) ───────────────────────────────────────
// The workbench token isn't short-lived (90-day exp) but is REVOKED when a new
// slicer session logs in — so a stored token goes stale across sessions. When
// the cloud rejects it (code 10001), re-grab the current token from a running
// bridge-mode slicer and persist it; if none is reachable, surface the need to
// re-provision instead of silently showing offline.
let _acuCloudRecovering = false;
let _acuCloudStaleToasted = false;

async function _acuCloudRecover(_conn) {
  if (_acuCloudRecovering) return;
  _acuCloudRecovering = true;
  try {
    let r = null;
    try { r = await window.anycubic?.cloud?.cdpToken(9222); } catch (_) { r = null; }
    if (r && r.ok && r.token) {
      const email = r.email || _conn?.printer?.cloudEmail || "";
      // Persist the fresh token to every cloud printer doc + the live conns.
      try { await ctx.updateAnycubicCloudToken?.(email, r.token); } catch (_) {}
      for (const c of _acuConns.values()) {
        if (c.mode === "cloud" && c.printer) {
          c.printer.cloudToken = r.token;
          if (email) c.printer.cloudEmail = email;
          c.lastError = null;
        }
      }
      // Reconnect the shared client with the new token; on 'connected' the
      // status handler re-issues getInfo for every cloud printer → online.
      window.anycubic?.cloud?.connect({ email, token: r.token });
      _acuCloudStaleToasted = false;
      ctx.toast?.(ctx.t("acuCloudTokenRefreshed"), "success");
    } else {
      // No bridge-mode slicer → can't refresh. Mark offline with a reason and
      // tell the user how to fix it (once).
      for (const c of _acuConns.values()) {
        if (c.mode === "cloud") {
          c.status = "error"; c.lastError = "token-revoked";
          _acuNotify(c, /*statusChanged*/ true); _acuRefreshOnlineUI(c.key);
        }
      }
      if (!_acuCloudStaleToasted) { _acuCloudStaleToasted = true; ctx.toast?.(ctx.t("acuCloudTokenStale"), "error"); }
    }
  } finally {
    _acuCloudRecovering = false;
  }
}

function _acuCloudSetInfo(conn, boxId, slot, type, rgb) {
  const p = conn.printer;
  if (!p) return Promise.resolve({ ok: false, error: "no-printer" });
  _acuLogPush(conn, "→", { type: "multiColorBox", action: "setInfo", via: "cloud",
    data: { multi_color_box: [{ id: boxId, slots: [{ index: slot, type, color: rgb }] }] } });
  return window.anycubic?.cloud?.sendOrder({
    token: p.cloudToken, orderId: ACU_ORDER_SET_SLOT, printerId: p.cloudPrinterId,
    data: { multi_color_box: [{ id: Number(boxId), slots: [{ color: rgb, index: Number(slot), type: String(type) }] }] },
  });
}

// Standalone external spool set — its own order (1229), a single spool with just
// {type, color} (captured from the Workbench). No box/slot/index.
function _acuCloudSetExtfil(conn, type, rgb) {
  const p = conn.printer;
  if (!p) return Promise.resolve({ ok: false, error: "no-printer" });
  _acuLogPush(conn, "→", { type: "extfilbox", action: "setInfo", via: "cloud", data: { type, color: rgb } });
  return window.anycubic?.cloud?.sendOrder({
    token: p.cloudToken, orderId: ACU_ORDER_SET_EXTFIL, printerId: p.cloudPrinterId,
    data: { type: String(type), color: rgb },
  });
}

function _acuLanSetExtfil(conn, type, rgb) {
  _publish(conn, _acuRequest("setInfo", { type: String(type), color: rgb }, "extfilbox"), "extfilbox");
}

/**
 * Release the camera without disconnecting — used when the side panel closes
 * but the background MQTT session stays alive. Tells the printer to stop
 * capturing and stops ffmpeg, unless the cam wall is still showing this
 * printer (then the feed must keep running).
 */
export function acuReleaseCamera(printer) {
  const conn = _acuConns.get(acuKey(printer));
  if (!conn) return;
  if (ctx.getState?.()?.viewMode === "printer-cam") return; // cam wall still needs it
  conn.data.camWanted = false;
  conn.data.camLive = false;
  if (conn.mode === "cloud") { acuAgoraStop(conn.key); return; } // leave the Agora channel
  if (conn._camRetry) { clearTimeout(conn._camRetry); conn._camRetry = null; }
  if (conn.brokerUp) _acuStopCapture(conn);
  window.anycubic?.camStop(conn.key);
  conn.data.lastCamFrame = null;
}

/**
 * Start the cloud (Agora) camera for a cloud-mode printer. Fetches the join
 * credentials via order 1001 (REST `cameraOpen`) and hands them to the Agora
 * player (`agora-cam.js`), which renders into the `.acu-cam-agora` container.
 * No-op if already running or the Agora SDK isn't loaded; stays on the hero
 * photo on any failure (cloud camera is best-effort).
 */
async function _acuCloudRequestCamera(conn) {
  if (!conn || conn.mode !== "cloud" || conn.data.camLive) return;
  if (acuAgoraActive(conn.key)) return;                          // already joining/streaming
  if (typeof window === "undefined" || !window.AgoraRTC) return; // SDK missing → hero photo
  const p = conn.printer;
  if (!p || !p.cloudToken || p.cloudPrinterId == null) return;
  conn.data.camWanted = true;
  let res = null;
  try { res = await window.anycubic?.cloud?.cameraOpen?.({ token: p.cloudToken, printerId: p.cloudPrinterId }); }
  catch (_) { res = null; }
  // Released (panel closed) or disconnected while the REST call was in flight.
  if (!_acuConns.has(conn.key) || !conn.data.camWanted) return;
  if (!res || !res.ok || !res.agora) { conn.data.camWanted = false; return; }
  acuAgoraStart(conn.key, res.agora);
  ctx.onPrinterStatusChange?.(conn.key, "connected"); // render the (loading) container
}

// ── Camera (active control: video/startCapture → ffmpeg) ─────────────────────
//
// The FLV stream on :18088 is ON-DEMAND. We activate it by publishing
// {type:"video",action:"startCapture"} to the printer's `video` endpoint
// (captured from the slicer — PROTOCOL.md §5c); the printer confirms with a
// video/report `state:"initSuccess"`, after which /flv serves and we spawn
// ffmpeg. stopCapture (report `pushStopped`) tears it down. We also still
// react to a stream someone ELSE started (e.g. the slicer): its video/report
// initSuccess arrives on our subtree subscription and attaches ffmpeg too.

// Bounded probe used to confirm /flv is actually serving after activation —
// the printer can take several seconds to start serving after initSuccess
// (observed ~6 s on a Kobra 3 V2), so cover ~15 s, then give up (NOT an
// indefinite poll). ffmpeg starts the instant a probe sees the stream.
const ACU_CAM_PROBE_TRIES = 15;
const ACU_CAM_PROBE_GAP_MS = 1000;

/** Publish video/startCapture (idempotent; printer replies with initSuccess). */
function _acuStartCapture(conn) {
  if (!conn || !conn.brokerUp) return;
  _publish(conn, _acuRequest("startCapture", null, "video"), "video");
}

/** Publish video/stopCapture. */
function _acuStopCapture(conn) {
  if (!conn || !conn.brokerUp) return;
  _publish(conn, _acuRequest("stopCapture", null, "video"), "video");
}

// ── Control commands (PROTOCOL.md §5d) ──────────────────────────────────────

/** Pause / resume / stop the active print. `taskid:"-1"` = the current job. */
export function acuPrintControl(conn, action) {
  if (!conn || !["pause", "resume", "stop"].includes(action)) return;
  if (_acuConnIsCloud(conn)) {
    _acuCloudOrder(conn, { pause: ACU_ORD.PAUSE, resume: ACU_ORD.RESUME, stop: ACU_ORD.STOP }[action], null, { project: true });
    return;
  }
  _publish(conn, _acuRequest(action, { taskid: "-1" }, "print"), "print");
}

/** Set a heater target. which = "nozzle" | "bed". The `type` field selects the
 *  heater (0 = nozzle, 1 = bed); the printer ignores the other target. */
export function acuSetTemp(conn, which, value) {
  if (!conn) return;
  const v = Math.max(0, Math.round(Number(value) || 0));
  // Cloud + LAN both use the MQTT `tempature/set` message (`_publish` routes by
  // mode) so the target applies at idle (preheat), like the slicer.
  const data = which === "bed"
    ? { type: 1, target_hotbed_temp: v, target_nozzle_temp: 0 }
    : { type: 0, target_nozzle_temp: v, target_hotbed_temp: 0 };
  _publish(conn, _acuRequest("set", data, "tempature"), "tempature");
}

/** Toggle the chamber/part light (`type:3`). */
export function acuLight(conn, on) {
  if (!conn) return;
  if (_acuConnIsCloud(conn)) {
    // type:3 = the chamber/part LED (same value as LAN — see PROTOCOL.md). The
    // hass default of type:1 is the CAMERA light, which the Kobra rejects with
    // "failed turn on camera light". No project_id needed — the cloud routes
    // and executes this order fine without one (it failed on the type, not the
    // project), so we send it as a base order, like the slicer does.
    _acuCloudOrder(conn, ACU_ORD.SET_LIGHT, { type: 3, status: on ? 1 : 0, brightness: on ? 100 : 0 });
    return;
  }
  _publish(conn, _acuRequest("control",
    { type: 3, status: on ? 1 : 0, brightness: on ? 100 : 0 }, "light"), "light");
}

/** Jog one axis. axis = "x"|"y"|"z"; signed mm (+ → move_type 1, − → 0). */
export function acuMove(conn, axis, distance) {
  if (!conn) return;
  const axisNum = { x: 1, y: 2, z: 3 }[String(axis).toLowerCase()];
  if (!axisNum) return;
  const d = Number(distance) || 0;
  const data = { axis: axisNum, move_type: d >= 0 ? 1 : 0, distance: Math.abs(d) };
  if (_acuConnIsCloud(conn)) { _acuCloudOrder(conn, ACU_ORD.MOVE_AXLE, data); return; }
  _publish(conn, _acuRequest("move", data, "axis"), "axis");
}

/** Home an axis or all. which = "X"|"Y"|"Z"|"all" (move_type 2, distance 0). */
export function acuHome(conn, which) {
  if (!conn) return;
  const axisNum = { x: 1, y: 2, z: 3, xy: 4, all: 5 }[String(which).toLowerCase()];
  if (!axisNum) return;
  const data = { axis: axisNum, move_type: 2, distance: 0 };
  if (_acuConnIsCloud(conn)) { _acuCloudOrder(conn, ACU_ORD.MOVE_AXLE, data); return; }
  _publish(conn, _acuRequest("move", data, "axis"), "axis");
}

/** Disable the steppers. */
export function acuMotorsOff(conn) {
  if (!conn) return;
  if (_acuConnIsCloud(conn)) { _acuCloudOrder(conn, ACU_ORD.MOVE_AXLE_TURN_OFF, null); return; }
  _publish(conn, _acuRequest("turnOff", null, "axis"), "axis");
}

/** Set the part-cooling fan speed (0-100 %). */
export function acuFan(conn, pct) {
  if (!conn) return;
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  // Both LAN and cloud use the MQTT `fan/setSpeed` message (`_publish` routes by
  // mode) — it applies at idle, like the slicer. The cloud REST PRINT_SETTINGS
  // path only changes a running job's fan and does nothing at idle.
  _publish(conn, _acuRequest("setSpeed", { fan_speed_pct: p }, "fan"), "fan");
}

/** Load / unload / stop filament feed on a box slot.
 *  type = 1 (load / feed in) | 2 (unload / retract) | 3 (stop).
 *  boxId -1 = external box; slotIndex 0-3. */
export function acuFeedFilament(conn, boxId, slotIndex, type) {
  if (!conn) return;
  const t = Number(type) || 0;
  if (![1, 2, 3].includes(t)) return;
  const data = { multi_color_box: [{ id: Number(boxId), feed_status: { slot_index: Number(slotIndex) || 0, type: t } }] };
  if (_acuConnIsCloud(conn)) { _acuCloudOrder(conn, ACU_ORD.FEED_FILAMENT, data); return; }
  _publish(conn, _acuRequest("feedFilament", data), "multiColorBox");
}

/** Set the print-speed mode. mode = 1 (Silent) | 2 (Standard) | 3 (Sport). */
export function acuSetSpeedMode(conn, mode) {
  if (!conn) return;
  const m = Number(mode) || 0;
  if (![1, 2, 3].includes(m)) return;
  // MQTT `print/update` via `_publish` (routes LAN/cloud by mode), like the slicer.
  _publish(conn, _acuRequest("update", { taskid: "-1", settings: { print_speed_mode: m } }, "print"), "print");
}

// ── File management — on-printer + USB files (PROTOCOL.md §5e) ───────────────
// Same order IDs on both transports: LAN publishes an MQTT `type:"file"` request,
// cloud sends it via signed REST `sendOrder`. The reply ALWAYS arrives over MQTT
// (`type:"file"`) in both modes → `_acuMerge` → conn.data.localFiles / udiskFiles.

/**
 * Request the stored-file listing for a source. source = "local" (internal
 * storage) | "udisk" (USB stick). Async fire-and-forget — the reply updates
 * conn.data.{local,udisk}Files when it arrives over MQTT; sets the matching
 * *FilesLoading flag so the sheet can show a spinner meanwhile.
 */
export function acuListFiles(conn, source) {
  const s = ACU_FILE_SRC[source];
  if (!conn || !s) return;
  if (source === "udisk") conn.data.udiskFilesLoading = true;
  else                    conn.data.localFilesLoading = true;
  // The firmware rejects a list with no `path` ("path is empty", code 10112) —
  // "/" is the storage root. Confirmed required on a Kobra 3 V2 over LAN; sent
  // on the cloud REST path too (harmless — hass omits it but the firmware needs it).
  const data = { path: "/" };
  if (_acuConnIsCloud(conn)) _acuCloudOrder(conn, s.listOrder, data);
  else                       _publish(conn, _acuRequest(s.listAction, data, "file"), "file");
  _acuNotify(conn);
}

/**
 * Print a stored file. source = "local" | "udisk". The printer confirms by
 * transitioning into a `type:"print"` job (watch printState, not the order ack).
 * `path` defaults to "/" (storage root); records from §5e carry no sub-path.
 */
export function acuPrintFile(conn, source, filename, path = "/") {
  const s = ACU_FILE_SRC[source];
  if (!conn || !s || !filename) return;
  const data = {
    filetype: s.filetype,           // 1 = on-printer · 2 = USB stick
    file_key: "", file_name: "",
    task_settings: { ai_detect: 0, camera_timelapse: 0 },
    filename,
    filepath: path || "/",
  };
  if (_acuConnIsCloud(conn)) _acuCloudOrder(conn, ACU_ORD.START_PRINT, data);
  else                       _publish(conn, _acuRequest("start", data, "print"), "print");
}

/**
 * Delete a stored file. source = "local" | "udisk". On a `state:"success"` reply
 * `_acuMerge` re-lists that source automatically, so the sheet refreshes itself.
 */
export function acuDeleteFile(conn, source, filename) {
  const s = ACU_FILE_SRC[source];
  if (!conn || !s || !filename) return;
  const data = { filename, filetype: -1, path: "/" };
  if (_acuConnIsCloud(conn)) _acuCloudOrder(conn, s.delOrder, data);
  else                       _publish(conn, _acuRequest(s.delAction, data, "file"), "file");
}

/**
 * Query attached peripherals (USB stick / camera / multi-color box presence).
 * Reply: `type:"peripherie"`, action `query`, state `done`, data booleans —
 * parsed in `_acuMerge` into conn.data.{udisk,camera,mcb}Present. Used to gate
 * the USB tab in the Files sheet. The LAN request action ("query") is inferred
 * from the response action — confirm against real hardware via the debug log.
 */
export function acuQueryPeripherals(conn) {
  if (!conn) return;
  if (_acuConnIsCloud(conn)) _acuCloudOrder(conn, ACU_ORD.QUERY_PERIPHERALS, {});
  else                       _publish(conn, _acuRequest("query", null, "peripherie"), "peripherie");
}

/**
 * Normalize one stored-file record (PROTOCOL.md §5e). On real hardware the reply
 * is `{ is_dir, filename, timestamp, size, plate_number }` (plus a `list_mode`
 * wrapper alongside `records`). `timestamp` is epoch MILLISECONDS — a few files
 * carry a bogus tiny value, so coerce defensively. `plate_number` selects a plate
 * inside a multi-plate `.gcode.3mf`.
 */
function _acuNormFileRecord(r) {
  if (!r || typeof r !== "object" || !r.filename) return null;
  return {
    filename:    String(r.filename),
    timestamp:   _acuFileTimeMs(r.timestamp),  // epoch ms (0 = unknown)
    size:        Number(r.size) || 0,          // bytes
    isDir:       !!r.is_dir,
    plateNumber: Number(r.plate_number) || 0,
  };
}

/** Coerce a firmware file timestamp to epoch ms: values are ms (≥1e12); tolerate
 *  seconds (1e9–1e12 → ×1000) and discard implausibly small (pre-2001) values. */
function _acuFileTimeMs(t) {
  const n = Number(t) || 0;
  if (n >= 1e12) return n;          // already ms (year ≥ 2001)
  if (n >= 1e9)  return n * 1000;   // seconds → ms
  return 0;                          // bogus / unknown
}

// ── Cloud-uploaded files (PROTOCOL.md §9c) — cloud mode only ─────────────────
// A separate REST subsystem from §5e: files the user sliced and saved to Anycubic
// Cloud. List + delete via dedicated workbench endpoints; print reuses the cloud
// sendOrder (START_PRINT order 1) with the file's embedded slice_param.

/** Normalize one cloud file record (AnycubicCloudFile). Keeps `sliceParam` /
 *  `sliceSize` raw — the cloud rejects a print without the file's slice_param. */
function _acuNormCloudFile(r) {
  if (!r || typeof r !== "object" || r.id == null) return null;
  return {
    id:          Number(r.id),
    filename:    String(r.filename || ""),
    timestamp:   _acuCloudTimeMs(r.time),  // §9c uses `time` (number or date string)
    size:        Number(r.size) || 0,      // bytes
    thumbnail:   String(r.thumbnail || ""),// signed URL
    sliceParam:  r.slice_param ?? null,    // pass-through for the print payload
    sliceSize:   r.slice_size ?? null,
    // Compatibility signals — a sliced gcode targets one machine type; used to
    // gate which files are printable on the open printer (PROTOCOL.md §9c).
    machineType: r.machine_type ?? null,
    deviceType:  r.device_type ?? null,
    fileType:    r.file_type ?? null,
    printerNames: r.printer_names ?? null,
  };
}

/** Cloud `time` → epoch ms. Accepts a unix number (s/ms) or a date string
 *  (e.g. "2026-06-01 12:00:00"); 0 when unparseable. */
function _acuCloudTimeMs(t) {
  if (t == null) return 0;
  const n = Number(t);
  if (Number.isFinite(n) && String(t).trim() !== "") return _acuFileTimeMs(n);
  const parsed = Date.parse(String(t).replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Fetch ALL the account's cloud-uploaded files (cloud storage is account-level,
 *  shared across printers). We list everything — print is gated per-file to the
 *  open printer's machine type (`machine_type`), deletion is allowed for any.
 *  The server-side `machine_type` filter is intentionally NOT used: it doesn't
 *  restrict results (a 20027-sliced file is returned for a 20030 printer too), so
 *  compatibility is enforced client-side. Async; refreshes an open sheet. */
export async function acuCloudListFiles(conn) {
  const p = conn && conn.printer;
  if (!p || !_acuConnIsCloud(conn)) return;
  conn.data.cloudFilesLoading = true;
  _acuFileSheetOnData(conn);
  _acuLogPush(conn, "→", { type: "cloudFiles", action: "list", via: "cloud" });
  let res;
  try {
    res = await window.anycubic?.cloud?.filesList({ token: p.cloudToken, page: 1, limit: 100 });
  } catch (e) { res = { ok: false, error: e?.message }; }
  if (!_acuConns.has(conn.key)) return;
  conn.data.cloudFilesLoading = false;
  if (res && res.ok && Array.isArray(res.files)) {
    conn.data.cloudFiles   = res.files.map(_acuNormCloudFile).filter(Boolean);
    conn.data.cloudFilesAt = Date.now();
  }
  _acuLogPush(conn, "←", res && res.ok ? { type: "cloudFiles", count: conn.data.cloudFiles.length } : { type: "cloudFiles", error: res?.error });
  _acuFileSheetOnData(conn);
  _acuNotify(conn);
}

/** True when a cloud file was sliced for this connection's printer (machine type
 *  match). Used to gate the print button — printing a slice on a printer it
 *  wasn't sliced for can fail or damage the machine. */
function _acuCloudFileCompatible(conn, file) {
  const pmt = Number(conn?.printer?.machineType);
  const fmt = Number(file?.machineType);
  return Number.isFinite(pmt) && Number.isFinite(fmt) && pmt === fmt;
}

/** Human label for a cloud file's target printer(s) (`printer_names`). Accepts an
 *  array or a JSON-string-encoded array. */
function _acuPrinterNamesLabel(pn) {
  let arr = pn;
  if (typeof pn === "string") { try { arr = JSON.parse(pn); } catch (_) { return pn; } }
  return Array.isArray(arr) ? arr.join(", ") : (pn ? String(pn) : "");
}

/** Delete a cloud-uploaded file by id, then re-list. */
export async function acuCloudDeleteFile(conn, fileId) {
  const p = conn && conn.printer;
  if (!p || !_acuConnIsCloud(conn) || fileId == null) return;
  _acuLogPush(conn, "→", { type: "cloudFiles", action: "delete", fileId, via: "cloud" });
  let res;
  try {
    res = await window.anycubic?.cloud?.fileDelete({ token: p.cloudToken, fileId });
  } catch (e) { res = { ok: false, error: e?.message }; }
  if (!_acuConns.has(conn.key)) return;
  if (res && res.ok) {
    // Optimistic drop so the row disappears immediately; the re-list confirms.
    conn.data.cloudFiles = (conn.data.cloudFiles || []).filter(f => f.id !== Number(fileId));
    _acuFileSheetOnData(conn);
    acuCloudListFiles(conn);
  } else {
    _acuShowError(res?.code, res?.error || "delete failed");
  }
}

/** Print a cloud-uploaded file (START_PRINT order 1, §9c payload). The file's
 *  `sliceParam` must be passed through — the cloud rejects a bare file_id. */
export function acuCloudPrintFile(conn, file) {
  if (!conn || !_acuConnIsCloud(conn) || !file || file.id == null) return;
  // Defense in depth: never dispatch a slice to a printer it wasn't sliced for,
  // even if a stale/disabled button somehow fires (the UI also gates this).
  if (!_acuCloudFileCompatible(conn, file)) {
    _acuShowError(null, ctx.t("acuFileIncompatible") || "This file was sliced for a different printer.");
    return;
  }
  const data = {
    filetype: 0,
    file_key: "", file_name: "",
    task_settings: { ai_detect: 0, camera_timelapse: 0 },
    file_id: Number(file.id),
    slice_param: file.sliceParam ?? null,
    slice_size: file.sliceSize ?? null,
    project_type: 1,
    matrix: "", template_id: 0,
    hollow_param: null, punching_param: null,
    is_delete_file: 0,
  };
  _acuCloudOrder(conn, ACU_ORD.START_PRINT, data);
}

/**
 * Determine whether this printer exposes a pullable local FLV camera. The
 * stream URL (`rtspUrl`) is advertised in one of two places — both an HTTP-FLV
 * stream on :18088, just different paths:
 *   • Kobra 3 V2 — HTTP `/info` (`rtspUrl: …:18088/flv`).
 *   • Kobra X    — MQTT `info/report` (`data.urls.rtspUrl: …:18088/live/<token>`),
 *     captured in `_acuMerge` → `conn.data.camUrl`. Its HTTP `/info` omits it.
 * So we treat the camera as supported once we have a :18088 URL from either
 * source. When neither has surfaced yet we DON'T conclude "unsupported" — the
 * periodic MQTT info/report (~every 5 s) provides it, and the bounded probe in
 * `_acuProbeAndStartCam` self-terminates if no stream ever serves.
 */
async function _acuCheckCamSupported(conn) {
  if (conn.data.camSupported != null) return conn.data.camSupported;
  if (conn.data.camUrl) { conn.data.camSupported = true; return true; } // learned via MQTT info/report
  let url = null;
  try { const r = await window.anycubic?.httpInfo?.(conn.ip); if (r?.ok) url = String(r.info?.rtspUrl || ""); }
  catch (_) { url = null; }
  if (!_acuConns.has(conn.key)) return false;
  if (url) {                              // HTTP /info advertised it (Kobra 3 V2)
    conn.data.camUrl = conn.data.camUrl || url;
    conn.data.camSupported = /:18088\//.test(url);
    return conn.data.camSupported;
  }
  // No rtspUrl from HTTP /info (Kobra X serves it over MQTT). Attempt without
  // caching, so a later info/report can confirm support.
  return true;
}

/** Activate the camera: request capture, then attach ffmpeg once /flv serves. */
async function _acuRequestCamera(conn) {
  if (!conn || conn.data.camLive) return;
  conn.data.camWanted = true;
  if (!(await _acuCheckCamSupported(conn))) return; // WebRTC/no camera → stay on hero
  if (!conn.brokerUp) return;
  _acuStartCapture(conn);
  // The video/report initSuccess will trigger the attach; this probe is the
  // fallback in case that report is missed.
  _acuProbeAndStartCam(conn, ACU_CAM_PROBE_TRIES);
}

/**
 * Probe /flv; on a live stream start ffmpeg and flip the banner from the hero
 * photo to the camera. Retries a bounded number of times to cover the brief
 * race between startCapture and /flv actually serving. Self-terminates on
 * go-live, when no camera surface is open, or on disconnect.
 */
async function _acuProbeAndStartCam(conn, triesLeft = ACU_CAM_PROBE_TRIES) {
  if (!conn || !conn.ip || conn.data.camLive || conn._camProbing) return;
  if (conn._camRetry) { clearTimeout(conn._camRetry); conn._camRetry = null; }
  // Prefer the URL the printer advertised (Kobra X: …/live/<token>); fall back
  // to the Kobra 3 V2 default until the info/report arrives.
  const url = conn.data.camUrl || `http://${conn.ip}:18088/flv`;
  conn._camProbing = true;
  let live = false;
  try { const r = await window.anycubic?.flvProbe(conn.ip, undefined, url); live = !!r?.live; }
  catch (_) { live = false; }
  conn._camProbing = false;
  if (!_acuConns.has(conn.key)) return; // disconnected while probing

  if (live) {
    conn.data.camLive = true;
    window.anycubic?.camStart({ key: conn.key, ip: conn.ip, url });
    // Re-render surfaces showing this printer: the side panel swaps hero →
    // camera, and (in cam view) the wall rebuilds to add the now-live card.
    ctx.onPrinterStatusChange?.(conn.key, "connected");
    return;
  }

  // Not yet serving — retry a few times while a camera surface stays open.
  if (triesLeft > 1 && conn.data.camWanted && _acuCameraSurfaceOpen(conn.key)) {
    conn._camRetry = setTimeout(() => _acuProbeAndStartCam(conn, triesLeft - 1), ACU_CAM_PROBE_GAP_MS);
  }
}

/** True while this printer's side panel is open OR the cam wall is showing. */
function _acuCameraSurfaceOpen(key) {
  const active = ctx.getActivePrinter();
  if (active && acuKey(active) === key) return true;
  return ctx.getState?.()?.viewMode === "printer-cam";
}

// ── MQTT publish ───────────────────────────────────────────────────────────

function _publish(conn, payload, endpoint) {
  if (!conn) return;
  _acuLogPush(conn, "→", payload);
  if (conn.mode === "cloud") {
    // Cloud realtime control: publish over the cloud MQTT broker — same message
    // shape + topic family as LAN. Applies at idle (no project_id needed), which
    // is how the slicer drives the fan/temps. Refresh the log immediately.
    const p = conn.printer || {};
    window.anycubic?.cloud?.publish({
      machineType: String(p.machineType || p.acuModelId || ""),
      key: p.key,
      endpoint: endpoint || "multiColorBox",
      payload,
    });
    _acuNotify(conn);
    return;
  }
  window.anycubic?.publish(conn.key, payload, endpoint);
}

// LAN layout request — the ACE boxes (multiColorBox) PLUS the standalone
// external spool (extfilbox), which a no-ACE printer (e.g. a Kobra 3) reports
// separately. The extfilbox request is harmless on ACE printers.
function _acuLanGetInfo(conn) {
  _publish(conn, _acuRequest("getInfo"));
  _publish(conn, _acuRequest("getInfo", null, "extfilbox"), "extfilbox");
  // Live machine state — the printer only AUTO-pushes temp/fan/light during a
  // print, so poll them explicitly like the slicer does (PROTOCOL.md §5d query
  // commands). Without this, temperatures stay "—/—" on an idle printer.
  _publish(conn, _acuRequest("query", null, "tempature"), "tempature");
  _publish(conn, _acuRequest("query", null, "fan"), "fan");
  _publish(conn, _acuRequest("query", null, "light"), "light");
}

// ── Refresh timer ──────────────────────────────────────────────────────────

function _scheduleRefresh(conn, delayMs = ACU_REFRESH_MS) {
  if (conn.refreshTimer) clearTimeout(conn.refreshTimer);
  conn.refreshTimer = setTimeout(() => {
    conn.refreshTimer = null;
    if (!_acuConns.has(conn.key)) return;
    if (conn.mode === "cloud") _acuCloudGetInfo(conn);
    else                       _acuLanGetInfo(conn);
    _scheduleRefresh(conn);
  }, delayMs);
}

// ── Global IPC listeners (registered once at module load) ─────────────────
// Single global listeners avoid accumulating duplicate handlers when
// acuConnect is called repeatedly (panel open → close → open).

if (typeof window !== "undefined" && window.anycubic) {
  window.anycubic.onStatus((key, status) => {
    const conn = _acuConns.get(key);
    if (!conn) return;
    const wasOnline = conn.status === "connected";
    if (status === "connected") {
      conn.lastError = null;
      conn.brokerUp = true; // MQTT session up — safe to publish now
      // Stay "connecting" (UI) until the first layout report arrives (see
      // onMessage) — only a real report counts as established.
      if (conn.status !== "connected") conn.status = "connecting";
      _acuLanGetInfo(conn);
      _scheduleRefresh(conn);
      // Activate the camera now if a surface asked for it before the broker
      // was up (the common case — panel open triggers connect + camWanted).
      if (conn.data.camWanted && !conn.data.camLive) _acuRequestCamera(conn);
    } else {
      conn.status = status;
      conn.brokerUp = false;
      if (String(status).startsWith("error:")) conn.lastError = String(status).slice(6);
    }
    const isOnline = conn.status === "connected";
    _acuNotify(conn, /*statusChanged*/ wasOnline !== isOnline);
    _acuRefreshOnlineUI(key);
  });

  window.anycubic.onMessage((key, _topic, data) => {
    const conn = _acuConns.get(key);
    if (!conn) return;
    _acuLogPush(conn, "←", data);
    // First real report confirms the connection is truly established.
    if (conn.status !== "connected") {
      conn.status = "connected";
      conn.lastError = null;
      _acuNotify(conn, /*statusChanged*/ true);
      _acuRefreshOnlineUI(key);
    }
    _acuMerge(conn, data);
  });

  window.anycubic.onCamFrame((key, b64) => {
    const conn = _acuConns.get(key);
    if (!conn) return;
    const firstFrame = !conn.data.lastCamFrame;
    conn.data.lastCamFrame = b64;
    // Fan out each frame to ALL imgs with this key — cam wall + sidecard can
    // both display simultaneously off the single ffmpeg process.
    const imgs = document.querySelectorAll(`[data-acu-key="${CSS.escape(key)}"]`);
    if (!imgs.length) return;
    imgs.forEach(img => {
      img.src = `data:image/jpeg;base64,${b64}`;
      if (firstFrame) {
        const wrap = img.closest(".pp-cam-loading");
        if (wrap) {
          wrap.classList.remove("pp-cam-loading");
          wrap.querySelector(".pp-cam-loading-overlay")?.remove();
        }
      }
    });
  });

  window.anycubic.onCamEnded((key) => {
    const conn = _acuConns.get(key);
    if (!conn) return;
    // Stream died (ffmpeg gave up — often the printer timed the FLV out). Drop
    // to idle so the banner shows the hero photo instead of a frozen frame,
    // then, if a surface still wants it, re-request capture (the printer may
    // have stopped streaming) and re-attach.
    conn.data.camLive = false;
    conn.data.lastCamFrame = null;
    ctx.onPrinterStatusChange?.(key, "connected"); // drop banner back to hero
    if (conn.data.camWanted && _acuCameraSurfaceOpen(key)) _acuRequestCamera(conn);
  });
}

// ── Cloud listeners (shared cloud-MQTT; reports tagged with the conn key) ────

if (typeof window !== "undefined" && window.anycubic?.cloud) {
  window.anycubic.cloud.onMessage((connKey, _topic, data) => {
    const conn = _acuConns.get(connKey);
    if (!conn || conn.mode !== "cloud") return;
    _acuLogPush(conn, "←", data);
    // First report confirms the cloud printer is reachable + the token works.
    if (conn.status !== "connected") {
      conn.status = "connected";
      conn.lastError = null;
      _acuNotify(conn, /*statusChanged*/ true);
      _acuRefreshOnlineUI(connKey);
    }
    _acuMerge(conn, data);
  });

  // Shared-client status.
  window.anycubic.cloud.onStatus((status) => {
    if (status === "connected") {
      // The shared MQTT is up and (re)subscribed — (re)request a layout
      // snapshot for every cloud printer. This is what makes a cloud printer
      // flip to "online" on startup: the initial getInfo fired during
      // acuConnect raced the MQTT handshake and its report was missed, so we
      // re-issue it now that we're guaranteed to be subscribed.
      for (const conn of _acuConns.values()) {
        if (conn.mode === "cloud") _acuCloudGetInfo(conn);
      }
      return;
    }
    // On a hard error/disconnect, drop all cloud printers to offline so the
    // badges reflect reality.
    const offline = String(status).startsWith("error:") ? "error" : "disconnected";
    for (const conn of _acuConns.values()) {
      if (conn.mode === "cloud" && conn.status === "connected") {
        conn.status = offline;
        conn.lastError = offline === "error" ? String(status).slice(6) : null;
        _acuNotify(conn, /*statusChanged*/ true);
        _acuRefreshOnlineUI(conn.key);
      }
    }
    // A broker auth failure can mean the stored token was revoked — try to
    // recover with a fresh token from a bridge-mode slicer (no-op if none).
    if (offline === "error") {
      const anyCloud = [..._acuConns.values()].find(c => c.mode === "cloud");
      if (anyCloud) _acuCloudRecover(anyCloud);
    }
  });
}

// ── Report parser ──────────────────────────────────────────────────────────

/**
 * Order-independent flattener for the multiColorBox report. Both ACE Pro
 * (model_id 40001) and ACE Pro 2 (40002) report shapes reduce to the same
 * box list — fields are navigated BY KEY, never by position or pattern
 * (the firmware reorders keys / nests objects freely; PROTOCOL.md §5).
 *
 * @returns {Array<{id:number, modelId:number|null, temp:number|null,
 *                  slots: Array<{index:number, type:string, color:string|null}>}>}
 */
export function acuFlattenReport(report) {
  const out = [];
  const boxes = report?.data?.multi_color_box;
  if (!Array.isArray(boxes)) return out;
  for (const box of boxes) {
    if (!box || typeof box !== "object") continue;
    const id = Number.isFinite(Number(box.id)) ? Number(box.id) : 0;
    const slots = [];
    for (const s of (Array.isArray(box.slots) ? box.slots : [])) {
      if (!s || typeof s !== "object") continue;
      const col = Array.isArray(s.color) ? s.color : null;
      const hex = col
        ? "#" + [0, 1, 2]
            .map(i => Math.max(0, Math.min(255, Number(col[i]) || 0)))
            .map(n => n.toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()
        : null;
      slots.push({
        index: Number.isFinite(Number(s.index)) ? Number(s.index) : 0,
        type:  String(s.type || ""),
        color: hex,
        // ACE slot status — observed: 4 = present/ready, 5 = loaded/feeding.
        // Lower/other values indicate not-mounted (kept raw for the UI to map).
        status: Number.isFinite(Number(s.status)) ? Number(s.status) : null,
      });
    }
    out.push({
      id,
      modelId: Number.isFinite(Number(box.model_id)) ? Number(box.model_id) : null,
      temp:    Number.isFinite(Number(box.temp))     ? Number(box.temp)     : null,
      // Which slot index is fed into the extruder (-1 = none). Used to gate
      // Retract (only the loaded slot can be retracted).
      loadedSlot: Number.isFinite(Number(box.loaded_slot)) ? Number(box.loaded_slot) : -1,
      slots,
    });
  }
  return out;
}

// Merge an incoming multiColorBox report into d.boxes IN PLACE — never wipe.
// Existing boxes/slots are updated field-by-field (only for fields the report
// actually carries); new boxes/slots are appended. This keeps the filament
// card present and stable: a partial report (e.g. a setInfo echo with a single
// slot) updates just that slot instead of replacing the whole layout.
function _acuMergeBoxReport(d, msg) {
  const incoming = acuFlattenReport(msg);
  if (!incoming.length) return;
  if (!Array.isArray(d.boxes)) d.boxes = [];
  for (const inb of incoming) {
    let box = d.boxes.find(b => b.id === inb.id);
    if (!box) { d.boxes.push(inb); continue; }
    if (inb.modelId != null)                box.modelId    = inb.modelId;
    if (Number.isFinite(inb.temp))          box.temp       = inb.temp;
    if (Number.isFinite(inb.loadedSlot))    box.loadedSlot = inb.loadedSlot;
    if (!Array.isArray(box.slots)) box.slots = [];
    for (const ins of inb.slots) {
      let slot = box.slots.find(s => s.index === ins.index);
      if (!slot) { box.slots.push(ins); continue; }
      // Only overwrite a field when the report carries a real value — never
      // blank out a known type/colour because a partial report omitted it.
      if (ins.type)            slot.type   = ins.type;
      if (ins.color != null)   slot.color  = ins.color;
      if (ins.status != null)  slot.status = ins.status;
    }
  }
}

// Map a print report's action/state pair onto the Manager's normalized job
// states (the same set the other brands emit — `snapState_*` i18n keys).
function _acuPrintState(action, state) {
  if (action === "pause"  && (state === "pausing" || state === "paused")) return "paused";
  if (action === "resume" && (state === "resuming" || state === "resumed")) return "printing";
  if (action === "start" || action === "stop") {
    switch (state) {
      case "printing":    return "printing";
      case "downloading":
      case "checking":
      case "preheating":  return "preparing";
      case "finished":    return "finished";
      case "stoped":      // (sic — firmware spelling)
      case "stopping":    return "idle";
      case "failed":      return "failed";
    }
  }
  return null; // not a state transition (e.g. "updated" data ticks)
}

// Merge the print-status fields a `print` report may carry (all optional —
// navigate by key, PROTOCOL.md §5b).
function _acuMergePrintFields(d, data) {
  if (!data || typeof data !== "object") return;
  // taskid == the cloud project_id (needed to target print-control / settings
  // orders at the running job). "-1" = no specific job.
  if (data.taskid != null && String(data.taskid) !== "-1") d.jobProjectId = Number(data.taskid) || 0;
  if (data.filename     != null) d.printFilename = String(data.filename).split("/").pop();
  if (data.progress     != null) d.progress      = Math.max(0, Math.min(100, Number(data.progress) || 0));
  if (data.remain_time  != null) d.remainTime    = Number(data.remain_time)  || 0; // minutes
  if (data.curr_layer   != null) d.currLayer     = Number(data.curr_layer)   || 0;
  if (data.total_layers != null) d.totalLayers   = Number(data.total_layers) || 0;
  if (data.curr_hotbed_temp != null) d.bedCurrent    = Math.round(Number(data.curr_hotbed_temp) || 0);
  if (data.curr_nozzle_temp != null) d.nozzleCurrent = Math.round(Number(data.curr_nozzle_temp) || 0);
  const s = data.settings;
  if (s && typeof s === "object") {
    if (s.target_hotbed_temp != null) d.bedTarget     = Math.round(Number(s.target_hotbed_temp) || 0);
    if (s.target_nozzle_temp != null) d.nozzleTarget  = Math.round(Number(s.target_nozzle_temp) || 0);
    if (s.fan_speed_pct      != null) d.fanSpeedPct   = Number(s.fan_speed_pct)   || 0;
    if (s.print_speed_pct    != null) d.printSpeedPct = Number(s.print_speed_pct) || 0;
    if (s.print_speed_mode   != null) d.speedMode     = Number(s.print_speed_mode) || 0; // 1=Silent 2=Standard 3=Sport
  }
}

// ── Printer error alert ────────────────────────────────────────────────────
// A printer-reported command failure (`state:"failed"`) — e.g. trying to move
// before homing (code 10901). Shows a dismissible bottom-sheet with the code +
// the printer's message. Mirrors the slicer's "Error Alert" minus its "Go to
// Message Center" action (we have no message center).
let _acuErrRoot = null;
function _acuShowError(code, message) {
  if (!_acuErrRoot) {
    _acuErrRoot = document.createElement("div");
    _acuErrRoot.id = "acuErrRoot";
    _acuErrRoot.innerHTML = /* html */`
      <div class="acu-err-backdrop"></div>
      <aside class="acu-err-sheet" role="alertdialog" aria-modal="true">
        <button type="button" class="acu-err-x" aria-label="Close">×</button>
        <div class="acu-err-head">
          <span class="acu-err-warn" aria-hidden="true">⚠</span>
          <span class="acu-err-title">${ctx.esc(ctx.t("acuErrTitle") || "Printer error")}</span>
        </div>
        <div class="acu-err-card">
          <div class="acu-err-code"></div>
          <div class="acu-err-msg"></div>
        </div>
        <button type="button" class="adf-btn adf-btn--primary acu-err-ok">${ctx.esc(ctx.t("acuErrDismiss") || "OK")}</button>
      </aside>`;
    document.body.appendChild(_acuErrRoot);
    const close = () => _acuErrRoot.classList.remove("open");
    _acuErrRoot.querySelector(".acu-err-backdrop").addEventListener("click", close);
    _acuErrRoot.querySelector(".acu-err-x").addEventListener("click", close);
    _acuErrRoot.querySelector(".acu-err-ok").addEventListener("click", close);
  }
  _acuErrRoot.querySelector(".acu-err-code").textContent = (code != null && code !== "") ? `Code: ${code}` : "";
  _acuErrRoot.querySelector(".acu-err-msg").textContent  = String(message || "");
  _acuErrRoot.classList.add("open");
}

function _acuMerge(conn, msg) {
  if (!msg || typeof msg !== "object") return;
  const d      = conn.data;
  const type   = String(msg.type   || "");
  const action = String(msg.action || "");
  const state  = String(msg.state  || "");
  const data   = msg.data;

  // Surface a printer-reported command failure — but only for the printer whose
  // panel is open, so a background printer's error doesn't pop over an unrelated
  // view. (e.g. {type:"axis", state:"failed", code:10901, msg:"Home the axis…"})
  if (state === "failed" && (msg.msg || msg.code != null)) {
    const active = ctx.getActivePrinter?.();
    if (active && acuKey(active) === conn.key) _acuShowError(msg.code, msg.msg);
  }

  switch (type) {
    case "multiColorBox": {
      // Full layout only on getInfo/setInfo/refresh — other actions
      // (autoUpdateDryStatus, feedFilament, …) carry PARTIAL box objects
      // (no slots); re-flattening those would wipe the slot colors.
      if (data?.multi_color_box) {
        // Always merge in place (never wipe). Full-layout actions also stamp
        // lastReport; partial actions (feedFilament, dry, …) just patch temp /
        // loaded_slot / any slot fields they happen to carry.
        _acuMergeBoxReport(d, msg);
        if (action === "getInfo" || action === "setInfo" || action === "refresh") {
          d.lastReport = Date.now();
        }
      }
      break;
    }
    case "extfilbox": {
      // Standalone external spool (no ACE connected — e.g. a Kobra 3). Reported
      // separately from multiColorBox as a single spool object
      // {id, type, color:[r,g,b], loaded, ...} (PROTOCOL.md §5b). We surface it
      // as a synthetic external box (id -1) so the filament card shows it.
      if (action === "reportInfo" && data && typeof data === "object") {
        const col = Array.isArray(data.color) ? data.color : null;
        const hex = col
          ? "#" + [0, 1, 2].map(i => Math.max(0, Math.min(255, Number(col[i]) || 0)).toString(16).padStart(2, "0")).join("").toUpperCase()
          : null;
        d.extShelf = {
          index: Number.isFinite(Number(data.id)) ? Number(data.id) : 0,
          type:  String(data.type || ""),
          color: hex,
        };
        d.lastReport = Date.now();
      }
      break;
    }
    case "print": {
      const st = _acuPrintState(action, state);
      if (st != null) d.printState = st;
      _acuMergePrintFields(d, data);
      if (st === "finished" || st === "idle" || st === "failed") {
        d.remainTime = 0;
      }
      break;
    }
    // Coarse busy/idle heartbeat (`workReport`). The detailed state comes from
    // `print` reports; this only lifts "idle" → "preparing" while the printer
    // is busy with no print tick yet (e.g. auto-leveling at the start of a job)
    // so the card doesn't wrongly read "Idle". Never overrides an active state.
    case "status": {
      // Coarse busy/idle heartbeat (`workReport`). The detailed state comes from
      // `print` reports; this only lifts idle→preparing while busy with no print
      // tick yet, and drops a lingering active state to idle when the printer
      // reports free (job ended while we weren't watching the transition).
      if (action === "workReport" && (state === "free" || state === "busy")) {
        d.workState = state;
        const cur = d.printState || "idle";
        if (state === "busy" && cur === "idle") d.printState = "preparing";
        else if (state === "free" && ["printing", "preparing", "paused"].includes(cur)) d.printState = "idle";
      }
      break;
    }
    case "tempature": { // (sic — firmware spelling)
      // Any action carries the same shape — `auto` (auto-push during a print)
      // AND `done`/`query` (reply to our poll). Parse them all, not just auto,
      // otherwise an idle printer never shows a temperature.
      if (data && typeof data === "object") {
        if (data.curr_hotbed_temp   != null) d.bedCurrent    = Math.round(Number(data.curr_hotbed_temp)   || 0);
        if (data.curr_nozzle_temp   != null) d.nozzleCurrent = Math.round(Number(data.curr_nozzle_temp)   || 0);
        if (data.target_hotbed_temp != null) d.bedTarget     = Math.round(Number(data.target_hotbed_temp) || 0);
        if (data.target_nozzle_temp != null) d.nozzleTarget  = Math.round(Number(data.target_nozzle_temp) || 0);
      }
      break;
    }
    case "fan": {
      if (data && data.fan_speed_pct != null) d.fanSpeedPct = Number(data.fan_speed_pct) || 0;
      break;
    }
    case "light": {
      // Shape not fully reverse-engineered — parse defensively. The control
      // command is `{type:3, status:0|1, brightness}`; the report likely echoes
      // a similar shape. Track on/off for the toggle.
      if (data && typeof data === "object") {
        if (data.status     != null) d.lightOn = !!Number(data.status);
        if (data.brightness != null) d.lightBrightness = Number(data.brightness) || 0;
      }
      break;
    }
    case "video": {
      // Camera stream lifecycle (PROTOCOL.md §5c). initSuccess → /flv is now
      // serving, attach ffmpeg. pushStopped → it stopped (by us or another
      // viewer); drop to idle. We react regardless of who triggered it, so a
      // stream started in the slicer attaches here too.
      if (action === "startCapture" && state === "initSuccess") {
        // Attach ffmpeg once the stream is up. The probe targets conn.data.camUrl
        // (…/live/<token> on a Kobra X, from the info/report) or the /flv default.
        // camSupported===false (a model with no local camera) is skipped; null
        // (unknown) is allowed so a slicer-started stream still attaches.
        if (!d.camLive && d.camSupported !== false) _acuProbeAndStartCam(conn, ACU_CAM_PROBE_TRIES);
      } else if (action === "stopCapture" && state === "pushStopped") {
        if (d.camLive) {
          d.camLive = false;
          d.lastCamFrame = null;
          window.anycubic?.camStop(conn.key);
          ctx.onPrinterStatusChange?.(conn.key, "connected"); // banner → hero
        }
      }
      break;
    }
    case "info": {
      // Periodic full-info report (~every 5 s). data.urls.rtspUrl is the camera
      // stream URL — the ONLY place newer models (Kobra X) advertise it (their
      // HTTP /info omits it). Shape: …:18088/flv (Kobra 3 V2) or
      // …:18088/live/<token> (Kobra X). Used verbatim as the ffmpeg source.
      const rtsp = data && data.urls && typeof data.urls.rtspUrl === "string" ? data.urls.rtspUrl : "";
      if (/:18088\//.test(rtsp)) {
        d.camUrl = rtsp;
        if (d.camSupported == null) d.camSupported = true;
        // URL just arrived and the camera is wanted but not yet live → attach now.
        if (d.camWanted && !d.camLive) _acuProbeAndStartCam(conn, ACU_CAM_PROBE_TRIES);
      }
      break;
    }
    case "file": {
      // Stored-file management (PROTOCOL.md §5e). list* replies carry
      // data.records; delete* replies just ack state:"success" → re-list that
      // source so the sheet refreshes itself.
      if (state === "done" && (action === "listLocal" || action === "listUdisk")) {
        const recs = Array.isArray(data?.records) ? data.records.map(_acuNormFileRecord).filter(Boolean) : [];
        if (action === "listUdisk") { d.udiskFiles = recs; d.udiskFilesAt = Date.now(); d.udiskFilesLoading = false; }
        else                        { d.localFiles = recs; d.localFilesAt = Date.now(); d.localFilesLoading = false; }
      } else if (state === "success" && (action === "deleteLocal" || action === "deleteUdisk")) {
        acuListFiles(conn, action === "deleteUdisk" ? "udisk" : "local");
      }
      _acuFileSheetOnData(conn);
      break;
    }
    case "peripherie": { // (sic — firmware spelling)
      // Attached-peripheral presence (PROTOCOL.md §5e) — gates the USB tab.
      // data = { camera, multiColorBox, udisk } booleans (any subset).
      if (action === "query" && data && typeof data === "object") {
        if ("udisk"         in data) d.udiskPresent  = !!data.udisk;
        if ("camera"        in data) d.cameraPresent = !!data.camera;
        if ("multiColorBox" in data) d.mcbPresent    = !!data.multiColorBox;
      }
      _acuFileSheetOnData(conn);
      break;
    }
    case "lastWill": {
      // online/offline of the printer itself; the broker connection already
      // tracks reachability, so just record it.
      break;
    }
    default:
      // Unknown family (ota, …) — visible in the request log, nothing to merge.
      break;
  }

  _acuNotify(conn);
}

// ── rAF-coalesced re-renders ───────────────────────────────────────────────

let _raf          = null;
let _acuGridRaf   = null;
let _acuStatusRaf = null;

function _acuNotify(conn, statusChanged = false) {
  if (statusChanged) {
    if (!_acuStatusRaf) _acuStatusRaf = requestAnimationFrame(() => { _acuStatusRaf = null; ctx.onPrinterGridChange(); });
    return;
  }
  if (!_acuGridRaf) _acuGridRaf = requestAnimationFrame(() => { _acuGridRaf = null; ctx.onGridJobsChange(); });
  const active = ctx.getActivePrinter();
  if (!active) return;
  if (acuKey(active) !== conn.key) return;
  if (_raf) return; // coalesce bursts
  _raf = requestAnimationFrame(() => {
    _raf = null;
    const liveHost = $("acuLive");
    // Don't rebuild the live block while the user is editing a temp field
    // inline — the innerHTML swap would destroy the open <input> and close
    // the edit on every incoming report. The card refreshes on the next
    // report once the edit is committed/cancelled (input removed).
    const editing = liveHost && liveHost.querySelector(".snap-temp--editing");
    if (liveHost && !editing) liveHost.innerHTML = renderAnycubicLiveInner(active);
    const logHost = $("acuLog");
    if (logHost) logHost.innerHTML = renderAnycubicLogInner(active);
    const countEl = $("acuLogCount");
    if (countEl) countEl.textContent = String(_acuConns.get(acuKey(active))?.log?.length || 0);
  });
}

// ── Request log ────────────────────────────────────────────────────────────

const ACU_LOG_MAX = 100;

function _acuLogPush(conn, dir, raw) {
  if (conn.logPaused) return;
  if (!conn.log) conn.log = [];
  let summary = "";
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (obj?.type && obj?.action) summary = `${obj.type}:${obj.action}${obj.state ? ` · ${obj.state}` : ""}`;
    else if (obj?.state)          summary = `report · ${obj.state}`;
    else { summary = Object.keys(obj || {}).slice(0, 3).join(", ") || "(msg)"; }
  } catch { summary = "(non-json)"; }
  const ts     = new Date().toLocaleTimeString([], { hour12: false });
  const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
  conn.log.push({ dir, ts, summary, raw: rawStr });
  if (conn.log.length > ACU_LOG_MAX) conn.log.splice(0, conn.log.length - ACU_LOG_MAX);
}

// ── Live block renderer ────────────────────────────────────────────────────

export function renderAnycubicLiveInner(p) {
  const conn = _acuConns.get(acuKey(p));
  if (!conn) return `
    <div class="snap-empty">
      <span class="icon icon-cloud icon-18"></span>
      <span>${ctx.esc(ctx.t("snapNoConnection"))}</span>
    </div>`;
  // Head action row — Files browser (mirrors the Creality head button). Only
  // when connected; the light/jog/fan controls live in the Control card.
  const headHtml = conn.status === "connected" ? `
    <div class="snap-head">
      <button type="button" class="cre-action-btn cre-action-btn--files"
              data-acu-open-files="1" title="${ctx.esc(ctx.t("acuFilesTitle") || "Files")}">
        <span class="icon icon-folder icon-16"></span>
      </button>
    </div>` : "";
  const blocks = `
    ${headHtml}
    ${renderAcuJobCard(p, conn)}
    ${renderAcuControlCard(p, conn)}
    ${renderAcuTempCard(conn)}
    ${renderAcuFilamentCard(p, conn)}`;
  return blocks.trim() ? blocks : `
    <div class="snap-empty">
      <span class="icon icon-cloud icon-18"></span>
      <span>${ctx.esc(ctx.t(conn.status === "connected" ? "acuNoLayout" : "snapNoConnection"))}</span>
    </div>`;
}

// ── Log renderer ───────────────────────────────────────────────────────────

export function renderAnycubicLogInner(p) {
  const conn = _acuConns.get(acuKey(p));
  const log  = conn?.log || [];
  if (!log.length) {
    return `<div class="snap-log-empty">${ctx.esc(ctx.t("snapLogEmpty"))}</div>`;
  }
  const rows = log.slice().reverse().map((e, i) => {
    let pretty = e.raw;
    try { pretty = JSON.stringify(JSON.parse(e.raw), null, 2); } catch (_) {}
    const expanded = !!e.expanded;
    return `
      <div class="snap-log-row snap-log-row--${e.dir === "→" ? "out" : "in"}${expanded ? " snap-log-row--expanded" : ""}"
           data-log-idx="${log.length - 1 - i}">
        <button type="button" class="snap-log-row-head" data-row-toggle="1">
          <span class="snap-log-dir">${ctx.esc(e.dir)}</span>
          <span class="snap-log-ts">${ctx.esc(e.ts)}</span>
          <span class="snap-log-summary">${ctx.esc(e.summary)}</span>
          <span class="snap-log-row-chev icon icon-chevron-r icon-13"></span>
        </button>
        <div class="snap-log-detail"${expanded ? "" : " hidden"}>
          <button type="button" class="snap-log-detail-copy" data-copy="${ctx.esc(pretty)}"
                  title="${ctx.esc(ctx.t("copyLabel"))}">
            <span class="icon icon-copy icon-13"></span>
            <span>${ctx.esc(ctx.t("copyLabel"))}</span>
          </button>
          <pre class="snap-log-detail-pre">${ctx.esc(pretty)}</pre>
        </div>
      </div>`;
  }).join("");
  return `<div class="snap-log">${rows}</div>`;
}

// ── Base-type mapping ──────────────────────────────────────────────────────

// Types the ACE accepts on setInfo, offered in the picker. The printer only
// stores a base material name — richer profile data is silently dropped.
export const ACU_FIL_TYPES = [
  "PLA", "PLA+", "PLA-CF", "PETG", "PETG-CF", "PET", "PCTG",
  "ABS", "ASA", "TPU", "PA", "PA-CF", "PC", "HIPS", "PVA", "PP",
];

/**
 * Maps a filament display name (e.g. "PLA Matte", "PETG-CF") to a base type
 * the ACE accepts. Longest / most specific names first.
 */
export function acuBaseType(fullName) {
  const types = [
    "PLA+", "PLA-CF", "PETG-CF", "PET-CF", "PA-CF", "PAHT-CF", "PA6-CF", "PPS-CF",
    "ASA-CF", "PA-GF", "PETG-GF", "PP-CF",
    "PETG", "PCTG", "PEBA", "HIPS", "PVA", "BVOH", "PET", "PLA", "ABS", "ASA",
    "TPU", "PPS", "PC", "PA", "PP", "PBT",
  ];
  const n = String(fullName || "").toUpperCase();
  for (const t of types) if (n.includes(t)) return t;
  const first = String(fullName || "PLA").trim();
  const sp = first.indexOf(" ");
  return sp > 0 ? first.substring(0, sp) : first;
}

// ── Filament edit sheet ────────────────────────────────────────────────────
// Same bottom-sheet UX as the other brands (.sfe-* classes). The DOM is
// created lazily on first open — inventory.html stays untouched.

let _acuFilEdit  = null;        // { printer, boxId, slotId }
let _acuSelType  = "PLA";
let _acuSelColor = "#FF5722";
let _acuSheetDom = false;

function _acuEnsureSheetDOM() {
  if (_acuSheetDom) return;
  _acuSheetDom = true;

  const root = document.createElement("div");
  root.id = "acuFilEditRoot";
  root.innerHTML = /* html */`
<!-- ── Anycubic — filament edit sheet ──────────────────────────────────── -->
<div class="sfe-backdrop" id="acuFilEditBackdrop"></div>
<aside class="sfe-sheet" id="acuFilEditSheet" aria-hidden="true">
  <div class="sfe-grip" aria-hidden="true"></div>
  <header class="sfe-screen-head sfe-screen-head--no-close">
    <div class="sfe-screen-head-text">
      <div class="sfe-title" data-i18n="snapFilEditTitle">Edit filament</div>
      <div class="sfe-sub" id="acuFilEditSub"></div>
    </div>
  </header>
  <div class="sfe-body">
    <button type="button" class="sfe-line" id="acuMaterialTrigger">
      <span class="sfe-line-lbl" data-i18n="snapFilEditPickFilament">Filament</span>
      <span class="sfe-line-val" id="acuMaterialTriggerVal">—</span>
      <span class="sfe-line-chev icon icon-chevron-r icon-13"></span>
    </button>
    <button type="button" class="sfe-line" id="acuColorTrigger">
      <span class="sfe-line-lbl" data-i18n="snapFilEditColor">Color</span>
      <span class="sfe-line-color-dot" id="acuColorTriggerVal"></span>
      <span class="sfe-line-chev icon icon-chevron-r icon-13"></span>
    </button>
    <div class="acu-feed-row">
      <button type="button" class="adf-btn acu-feed-btn" id="acuFeedLoad"
              data-i18n="acuFeedLoad">Load</button>
      <button type="button" class="adf-btn acu-feed-btn" id="acuFeedUnload"
              data-i18n="acuFeedUnload">Unload</button>
      <button type="button" class="adf-btn acu-feed-btn acu-feed-btn--stop" id="acuFeedStop"
              data-i18n="acuFeedStop">Stop</button>
    </div>
  </div>
  <div class="sfe-footer">
    <button class="adf-btn adf-btn--primary sfe-apply" id="acuFilEditSave">
      <span class="label" data-i18n="snapFilEditApply">Apply</span>
      <span class="spinner"></span>
    </button>
  </div>
</aside>

<!-- Anycubic — color sub-sheet -->
<aside class="sfe-sheet sfe-sheet--color" id="acuColorSheet" aria-hidden="true">
  <div class="sfe-grip" aria-hidden="true"></div>
  <header class="sfe-screen-head">
    <button type="button" class="sfe-back" id="acuColorBack" aria-label="Back">
      <span class="icon icon-chevron-l icon-14"></span>
    </button>
    <span class="sfe-title" data-i18n="snapFilSelectColor">Select Color</span>
    <button class="modal-close" id="acuColorClose">✕</button>
  </header>
  <div class="sfe-body sfe-body--picker">
    <div class="sfe-color-grid" id="acuColorGrid"></div>
    <input type="color" id="acuColorInput" style="opacity:0;position:absolute;pointer-events:none" tabindex="-1"/>
  </div>
</aside>

<!-- Anycubic — material (base type) sub-sheet -->
<aside class="sfe-sheet sfe-sheet--filament" id="acuTypeSheet" aria-hidden="true">
  <div class="sfe-grip" aria-hidden="true"></div>
  <header class="sfe-screen-head">
    <button type="button" class="sfe-back" id="acuTypeBack" aria-label="Back">
      <span class="icon icon-chevron-l icon-14"></span>
    </button>
    <span class="sfe-title" data-i18n="snapFilSelectFilament">Select Filament</span>
    <button class="modal-close" id="acuTypeClose">✕</button>
  </header>
  <div class="sfe-body sfe-body--picker">
    <div class="sfe-fil-picker sfe-fil-picker--solo">
      <div class="sfe-fil-mat-col" style="flex:1">
        <div class="sfe-fil-materials" id="acuTypeList" role="listbox" aria-label="Filament"></div>
      </div>
    </div>
  </div>
</aside>

<!-- ── Anycubic — file-management sheet (PROTOCOL.md §5e) ──────────────────── -->
<div class="sfe-backdrop" id="acuFileSheetBackdrop"></div>
<aside class="sfe-sheet sfe-sheet--files" id="acuFileSheet" aria-hidden="true">
  <div class="sfe-grip" aria-hidden="true"></div>
  <header class="sfe-screen-head sfe-screen-head--right">
    <div class="sfe-screen-head-text">
      <div class="sfe-title" data-i18n="acuFilesTitle">Files</div>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <button type="button" class="cre-file-refresh" id="acuFileSheetRefresh" title="">
        <span class="icon icon-refresh icon-13"></span>
      </button>
      <button class="modal-close" id="acuFileSheetClose">✕</button>
    </div>
  </header>
  <div class="acu-fs-tabs" id="acuFileSheetTabs"></div>
  <div class="sfe-body sfe-body--files" id="acuFileSheetBody"></div>
</aside>`;
  document.body.appendChild(root);
  _acuWireSheet();
  ctx.applyTranslations();
}

function _acuRenderTypeList() {
  const host = $("acuTypeList");
  if (!host) return;
  host.innerHTML = ACU_FIL_TYPES.map(tName => {
    const isSel = tName === _acuSelType;
    return `<button type="button" class="sfe-fil-row${isSel ? " is-selected" : ""}" data-acu-type="${ctx.esc(tName)}">
      <span class="sfe-fil-row-text">${ctx.esc(tName)}</span>
      ${isSel ? `<span class="sfe-fil-row-check">✓</span>` : ""}
    </button>`;
  }).join("");
}

function _acuRenderColorGrid(currentColor) {
  const grid = $("acuColorGrid");
  if (!grid) return;
  const cur = (currentColor || "").toLowerCase();
  const presetCells = ctx.SNAP_FIL_COLOR_PRESETS.map(c => {
    const isSel = c.toLowerCase() === cur;
    return `<button type="button"
      class="sfe-color-cell${isSel ? " is-selected" : ""}"
      data-color="${ctx.esc(c)}"
      style="background:${ctx.esc(c)}"></button>`;
  }).join("");
  const customCell = `<button type="button"
    class="sfe-color-cell sfe-color-cell--custom" id="acuColorCustom"
    style="background:${currentColor || "#FF5722"}" title="Custom color">
    <span class="icon icon-edit icon-13" style="background:#fff;opacity:.8"></span>
  </button>`;
  grid.innerHTML = presetCells + customCell;
}

function _acuUpdateSummary() {
  const matVal = $("acuMaterialTriggerVal");
  if (matVal) matVal.textContent = _acuSelType || "—";
  const colorDot = $("acuColorTriggerVal");
  if (colorDot) colorDot.style.background = _acuSelColor || "transparent";
}

function _acuOpenColorSheet() {
  _acuRenderColorGrid(_acuSelColor);
  const inp = $("acuColorInput"); if (inp) inp.value = _acuSelColor;
  $("acuColorSheet")?.classList.add("open");
  $("acuColorSheet")?.setAttribute("aria-hidden", "false");
}
function _acuCloseColorSheet() {
  $("acuColorSheet")?.classList.remove("open");
  $("acuColorSheet")?.setAttribute("aria-hidden", "true");
}
function _acuOpenTypeSheet() {
  _acuRenderTypeList();
  $("acuTypeSheet")?.classList.add("open");
  $("acuTypeSheet")?.setAttribute("aria-hidden", "false");
}
function _acuCloseTypeSheet() {
  $("acuTypeSheet")?.classList.remove("open");
  $("acuTypeSheet")?.setAttribute("aria-hidden", "true");
}

export function openAcuFilamentEdit(printer, boxId, slotId) {
  const conn = _acuConns.get(acuKey(printer));
  if (!conn) return;
  _acuEnsureSheetDOM();
  _acuFilEdit = { printer, boxId: Number(boxId), slotId: Number(slotId) };

  // Pre-fill from the slot's current state.
  const box  = (conn.data?.boxes || []).find(b => b.id === Number(boxId));
  const slot = (box?.slots || []).find(s => s.index === Number(slotId));
  _acuSelColor = slot?.color || "#FF5722";
  _acuSelType  = ACU_FIL_TYPES.includes(slot?.type) ? slot.type
               : (slot?.type ? acuBaseType(slot.type) : "PLA");
  if (!ACU_FIL_TYPES.includes(_acuSelType)) _acuSelType = "PLA";

  const sub = $("acuFilEditSub");
  if (sub) sub.textContent = Number(boxId) === -1
    ? `Ext. · slot ${Number(slotId) + 1}`
    : `ACE #${Number(boxId) + 1} · slot ${Number(slotId) + 1}`;

  // Gate feed buttons on the slot state:
  //   present (status 5)            → Feed + Stop
  //   loaded into extruder          → also Retract
  //   empty (status 4 / no spool)   → nothing
  const present = slot?.status === 5;
  const loaded  = present && box?.loadedSlot === Number(slotId);
  const loadBtn = $("acuFeedLoad"), unloadBtn = $("acuFeedUnload"), stopBtn = $("acuFeedStop");
  if (loadBtn)   loadBtn.disabled   = !present;
  if (unloadBtn) unloadBtn.disabled = !loaded;
  if (stopBtn)   stopBtn.disabled   = !present;

  _acuCloseColorSheet();
  _acuCloseTypeSheet();
  _acuUpdateSummary();

  $("acuFilEditSheet")?.classList.add("open");
  $("acuFilEditSheet")?.setAttribute("aria-hidden", "false");
  $("acuFilEditBackdrop")?.classList.add("open");
}

export function closeAcuFilamentEdit() {
  $("acuFilEditSheet")?.classList.remove("open");
  $("acuFilEditSheet")?.setAttribute("aria-hidden", "true");
  $("acuFilEditBackdrop")?.classList.remove("open");
  _acuCloseColorSheet();
  _acuCloseTypeSheet();
}

function _acuWireSheet() {
  $("acuFilEditBackdrop")?.addEventListener("click", closeAcuFilamentEdit);
  $("acuColorTrigger")?.addEventListener("click", _acuOpenColorSheet);
  $("acuMaterialTrigger")?.addEventListener("click", _acuOpenTypeSheet);

  // File-management sheet — close / backdrop / refresh.
  $("acuFileSheetClose")?.addEventListener("click", closeAcuFileSheet);
  $("acuFileSheetBackdrop")?.addEventListener("click", closeAcuFileSheet);
  $("acuFileSheetRefresh")?.addEventListener("click", () => {
    const conn = _acuFileSheetKey ? _acuConns.get(_acuFileSheetKey) : null;
    if (!conn) return;
    const tab = conn._activeFileTab || "local";
    if (tab === "cloud") {
      acuCloudListFiles(conn);
    } else {
      acuQueryPeripherals(conn);    // refresh USB-tab gate
      acuListFiles(conn, tab);      // reload the active source
    }
    _acuUpdateFileSheet(conn);
  });

  // Load / unload / stop filament feed for the slot being edited.
  const _acuFeed = (type) => {
    if (!_acuFilEdit) return;
    const conn = _acuConns.get(acuKey(_acuFilEdit.printer));
    if (conn) acuFeedFilament(conn, _acuFilEdit.boxId, _acuFilEdit.slotId, type);
  };
  $("acuFeedLoad")?.addEventListener("click",   () => _acuFeed(1));
  $("acuFeedUnload")?.addEventListener("click", () => _acuFeed(2));
  $("acuFeedStop")?.addEventListener("click",   () => _acuFeed(3));

  $("acuColorBack")?.addEventListener("click", () => { _acuUpdateSummary(); _acuCloseColorSheet(); });
  $("acuColorClose")?.addEventListener("click", () => { _acuUpdateSummary(); _acuCloseColorSheet(); });
  $("acuTypeBack")?.addEventListener("click", () => { _acuUpdateSummary(); _acuCloseTypeSheet(); });
  $("acuTypeClose")?.addEventListener("click", () => { _acuUpdateSummary(); _acuCloseTypeSheet(); });

  $("acuColorGrid")?.addEventListener("click", e => {
    const custom = e.target.closest("#acuColorCustom");
    if (custom) { $("acuColorInput")?.click(); return; }
    const cell = e.target.closest(".sfe-color-cell:not(.sfe-color-cell--custom)");
    if (!cell) return;
    _acuSelColor = cell.dataset.color || _acuSelColor;
    _acuRenderColorGrid(_acuSelColor);
    setTimeout(() => { _acuUpdateSummary(); _acuCloseColorSheet(); }, 150);
  });

  $("acuColorInput")?.addEventListener("change", e => {
    _acuSelColor = e.target.value;
    _acuRenderColorGrid(_acuSelColor);
    _acuUpdateSummary();
    _acuCloseColorSheet();
  });
  $("acuColorInput")?.addEventListener("input", e => {
    _acuSelColor = e.target.value;
    _acuRenderColorGrid(_acuSelColor);
    _acuUpdateSummary();
  });

  $("acuTypeList")?.addEventListener("click", e => {
    const row = e.target.closest("[data-acu-type]");
    if (!row) return;
    _acuSelType = row.dataset.acuType || _acuSelType;
    _acuRenderTypeList();
    setTimeout(() => { _acuUpdateSummary(); _acuCloseTypeSheet(); }, 180);
  });

  $("acuFilEditSave")?.addEventListener("click", () => {
    if (!_acuFilEdit || !_acuSelType) return;
    const { printer, boxId, slotId } = _acuFilEdit;
    const conn = _acuConns.get(acuKey(printer));
    if (!conn) return;

    // The ACE shows pure black as transparent — nudge it like the slicer does.
    const hex6 = _acuSelColor.replace("#", "").toUpperCase().slice(0, 6).padEnd(6, "0");
    const safe = hex6 === "000000" ? "010101" : hex6;
    const rgb  = [0, 1, 2].map(i => parseInt(safe.substr(i * 2, 2), 16) || 0);

    // The synthetic external box (-1) that came from the extfilbox channel
    // (no real multiColorBox box -1 — e.g. a Kobra 3 with no ACE) is set with
    // a DIFFERENT order (1229, {type,color}), not multiColorBox setInfo.
    const isExtfilShelf = boxId === -1
      && !(conn.data?.boxes || []).some(b => b.id === -1)
      && conn.data?.extShelf;

    if (isExtfilShelf) {
      if (conn.mode === "cloud") _acuCloudSetExtfil(conn, _acuSelType, rgb);
      else                       _acuLanSetExtfil(conn, _acuSelType, rgb);
    } else {
      // ACE slot (or a real multiColorBox external box -1 like the Kobra X):
      // cloud sets via REST sendOrder; LAN publishes to the local broker. Both
      // honor only {index, type, color}.
      if (conn.mode === "cloud") {
        _acuCloudSetInfo(conn, boxId, slotId, _acuSelType, rgb);
      } else {
        _publish(conn, _acuRequest("setInfo", {
          multi_color_box: [{ id: boxId, slots: [{ index: slotId, type: _acuSelType, color: rgb }] }],
        }));
      }
    }
    // No optimistic write, and NO early confirm-poll: the printer takes ~3 s to
    // commit a setInfo, and a getInfo fired before then returns the OLD value —
    // which caused a new(echo)→old(poll)→new(poll) flicker. The setInfo echo
    // already carries the new value; the regular refresh loop re-confirms later,
    // after the printer has committed. (Verified from captured report logs.)

    closeAcuFilamentEdit();
  });
}

// ── File-management bottom sheet (PROTOCOL.md §5e) ──────────────────────────
// Tabbed sheet (On-printer / USB) mirroring the Elegoo/Creality file sheets;
// reuses the shared .sfe-* + .cre-file-* classes (tabs styled in anycubic.css).
// Print + delete are hold-to-confirm (a print starts a real job). The USB tab is
// gated on the peripheral query (conn.data.udiskPresent). The Cloud tab (§9c)
// is added with the cloud-uploads phase.

let _acuFileSheetKey = null;   // key of the printer whose sheet is open

// Available source tabs for a connection, in display order.
function _acuFileTabs(conn) {
  const tabs = [{ id: "local", label: ctx.t("acuFilesTabLocal") || "On-printer" }];
  if (conn.data.udiskPresent === true) tabs.push({ id: "udisk", label: ctx.t("acuFilesTabUsb") || "USB" });
  if (_acuConnIsCloud(conn))           tabs.push({ id: "cloud", label: ctx.t("acuFilesTabCloud") || "Cloud" });
  return tabs;
}

function _acuFmtFileSize(bytes) {
  const b = Number(bytes) || 0;
  if (b <= 0) return "";
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function _acuFmtFileDate(ms) {
  if (!ms) return "";
  try { return new Date(ms).toLocaleDateString(); } catch (_) { return ""; }
}

// Build the row list HTML for one source tab. Cloud files (§9c) carry an id +
// thumbnail and route to the REST cloud actions; local/udisk (§5e) use filename.
function _acuFileListHtml(conn, source) {
  const d       = conn.data;
  const isCloud = source === "cloud";
  const loading = isCloud ? d.cloudFilesLoading : (source === "udisk" ? d.udiskFilesLoading : d.localFilesLoading);
  const raw     = isCloud ? d.cloudFiles        : (source === "udisk" ? d.udiskFiles        : d.localFiles);
  const files   = (raw || []).filter(f => f && (isCloud || !f.isDir));   // §5e root listing is flat — skip dirs

  if (loading && !files.length) {
    return `<div class="cre-files-empty">${ctx.esc(ctx.t("acuFilesLoading") || "Loading…")}</div>`;
  }
  if (!files.length) {
    return `<div class="cre-files-empty">${ctx.esc(ctx.t("acuFilesEmpty") || "No files found")}</div>`;
  }

  const isPrinting = ["printing", "preparing", "paused", "busy"].includes(d.printState);
  const activeName = String(d.printFilename || "").split("/").pop();

  return `<div class="cre-files">${files.map(f => {
    const full     = String(f.filename || "");
    const name     = full.replace(/\.gcode(\.3mf)?$/i, "");
    const isActive = activeName && (full === activeName || full.endsWith(activeName));
    const idAttr   = isCloud ? ` data-acu-file-id="${ctx.esc(String(f.id))}"` : "";
    const thumb    = isCloud && f.thumbnail
      ? `<div class="cre-file-thumb" style="background-image:url('${ctx.esc(f.thumbnail)}')"></div>`
      : `<div class="cre-file-thumb cre-file-thumb--placeholder"><span class="icon icon-printer icon-16"></span></div>`;
    // Cloud files are account-level (shared across printers): show them all + a
    // target-printer line, but only enable PRINT for files sliced for THIS printer.
    const compatible = !isCloud || _acuCloudFileCompatible(conn, f);
    const target     = isCloud ? _acuPrinterNamesLabel(f.printerNames) : "";
    const metaParts  = [_acuFmtFileSize(f.size), _acuFmtFileDate(f.timestamp)];
    if (isCloud && target) metaParts.push(target);
    const meta       = metaParts.filter(Boolean).join(" · ");
    const printOff   = isPrinting || !compatible;
    const printTitle = !compatible
      ? (ctx.t("acuFileIncompatible") || "Sliced for a different printer")
      : (ctx.t("acuFilePrint") || "Print");
    return `
      <div class="cre-file-row${isActive ? " cre-file-row--active" : ""}${compatible ? "" : " cre-file-row--incompatible"}">
        ${thumb}
        <div class="cre-file-info">
          <span class="cre-file-name" title="${ctx.esc(full)}">${ctx.esc(name)}</span>
          ${meta ? `<span class="cre-file-meta">${ctx.esc(meta)}</span>` : ""}
        </div>
        <div class="cre-file-btns">
          <button type="button" class="cre-file-btn cre-file-btn--print"
                  data-acu-file-print="${ctx.esc(full)}" data-acu-file-source="${source}"${idAttr}
                  title="${ctx.esc(printTitle)}"${printOff ? " disabled" : ""}>
            <span class="icon icon-play icon-13"></span>
            <span class="hold-progress"></span>
          </button>
          <button type="button" class="cre-file-btn cre-file-btn--del"
                  data-acu-file-delete="${ctx.esc(full)}" data-acu-file-source="${source}"${idAttr}
                  title="${ctx.esc(ctx.t("acuFileDelete") || "Delete")}">
            <span class="icon icon-trash icon-13"></span>
            <span class="hold-progress"></span>
          </button>
        </div>
      </div>`;
  }).join("")}</div>`;
}

// Re-render the sheet (tabs + body) and (re)bind tab + hold-to-confirm handlers.
// Safe to call any time — no-ops if the sheet DOM isn't present.
function _acuUpdateFileSheet(conn) {
  const tabsEl  = $("acuFileSheetTabs");
  const body    = $("acuFileSheetBody");
  const refresh = $("acuFileSheetRefresh");
  if (!tabsEl || !body) return;

  const tabs = _acuFileTabs(conn);
  // Active tab no longer available (e.g. USB removed) → fall back to on-printer.
  if (!tabs.some(t => t.id === conn._activeFileTab)) conn._activeFileTab = "local";
  const tab = conn._activeFileTab;

  // Tab bar — hidden when there's only one source.
  tabsEl.innerHTML = tabs.length > 1
    ? tabs.map(t => `<button type="button" class="acu-fs-tab${t.id === tab ? " acu-fs-tab--active" : ""}" data-acu-fs-tab="${t.id}">${ctx.esc(t.label)}</button>`).join("")
    : "";
  tabsEl.querySelectorAll("[data-acu-fs-tab]").forEach(btn =>
    btn.addEventListener("click", () => acuFileSheetSetTab(btn.dataset.acuFsTab)));

  // Body + refresh spinner.
  body.innerHTML = _acuFileListHtml(conn, tab);
  const loading = tab === "cloud" ? conn.data.cloudFilesLoading
                : tab === "udisk" ? conn.data.udiskFilesLoading
                :                    conn.data.localFilesLoading;
  if (refresh) refresh.classList.toggle("cre-file-refresh--loading", !!loading);

  // Hold-to-confirm: print (1200 ms — reversible) + delete (1500 ms — destructive).
  // Cloud rows route to the REST cloud actions (by id); local/udisk by filename.
  body.querySelectorAll("[data-acu-file-print]").forEach(btn => {
    if (btn.disabled) return;
    const src = btn.dataset.acuFileSource || "local";
    if (src === "cloud") {
      const file = (conn.data.cloudFiles || []).find(f => f.id === Number(btn.dataset.acuFileId));
      if (file) ctx.setupHoldToConfirm(btn, 1200, () => { acuCloudPrintFile(conn, file); closeAcuFileSheet(); });
    } else {
      const filename = btn.dataset.acuFilePrint;
      ctx.setupHoldToConfirm(btn, 1200, () => { acuPrintFile(conn, src, filename); closeAcuFileSheet(); });
    }
  });
  body.querySelectorAll("[data-acu-file-delete]").forEach(btn => {
    const src = btn.dataset.acuFileSource || "local";
    if (src === "cloud") {
      const id = Number(btn.dataset.acuFileId);
      ctx.setupHoldToConfirm(btn, 1500, () => acuCloudDeleteFile(conn, id));
    } else {
      const filename = btn.dataset.acuFileDelete;
      ctx.setupHoldToConfirm(btn, 1500, () => acuDeleteFile(conn, src, filename));
    }
  });
}

// Refresh an open sheet when a file/peripherie report lands (called from _acuMerge).
function _acuFileSheetOnData(conn) {
  if (_acuFileSheetKey && _acuFileSheetKey === conn.key) _acuUpdateFileSheet(conn);
}

export function openAcuFileSheet(printer) {
  _acuEnsureSheetDOM();
  const key = acuKey(printer);
  _acuFileSheetKey = key;
  const conn = _acuConns.get(key);
  if (!conn) return;
  if (!conn._activeFileTab) conn._activeFileTab = "local";
  // Refresh the USB-tab gate + load the on-printer listing (and USB if present).
  acuQueryPeripherals(conn);
  acuListFiles(conn, "local");
  if (conn.data.udiskPresent === true) acuListFiles(conn, "udisk");
  _acuUpdateFileSheet(conn);
  $("acuFileSheet")?.classList.add("open");
  $("acuFileSheet")?.setAttribute("aria-hidden", "false");
  $("acuFileSheetBackdrop")?.classList.add("open");
}

export function acuFileSheetSetTab(tab) {
  const conn = _acuFileSheetKey ? _acuConns.get(_acuFileSheetKey) : null;
  if (!conn) return;
  conn._activeFileTab = tab;
  // Lazy-load a source the first time its tab is shown.
  if (tab === "udisk" && !conn.data.udiskFilesAt && !conn.data.udiskFilesLoading) acuListFiles(conn, "udisk");
  if (tab === "local" && !conn.data.localFilesAt && !conn.data.localFilesLoading) acuListFiles(conn, "local");
  if (tab === "cloud" && !conn.data.cloudFilesAt && !conn.data.cloudFilesLoading) acuCloudListFiles(conn);
  _acuUpdateFileSheet(conn);
}

export function closeAcuFileSheet() {
  _acuFileSheetKey = null;
  $("acuFileSheet")?.classList.remove("open");
  $("acuFileSheet")?.setAttribute("aria-hidden", "true");
  $("acuFileSheetBackdrop")?.classList.remove("open");
}

// ── Self-registration ──────────────────────────────────────────────────────

registerBrand("anycubic", {
  meta, schema, helper,
  renderFilamentCard:   renderAcuFilamentCard,
  renderSettingsWidget: schemaWidget(schema),
});
