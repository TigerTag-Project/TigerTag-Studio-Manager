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
  // A live Agora video proves the printer is reachable. The cloud "connected"
  // status (from the MQTT getInfo) can lag the video, and the cam wall gates
  // each card on acuIsOnline — so without this, going straight to the cam wall
  // (before the side panel made it connect) drops the card. Mark it connected
  // so the re-render below includes it.
  if (conn.status !== "connected") conn.status = "connected";
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
  PAUSE: 2, RESUME: 3, STOP: 4,   // print control (need project_id)
  PRINT_SETTINGS: 6,              // temps / fan / speed-mode (need project_id) — {settings:{…}}
  MOVE_AXLE: 201,                 // jog / home — {axis, move_type, distance}
  MOVE_AXLE_TURN_OFF: 1213,       // disable motors
  FEED_FILAMENT: 1208,            // load / unload / stop filament
  SET_LIGHT: 1233,                // light — {type, status, brightness}
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

/**
 * Stop every cloud (Agora) camera player except the one in the open side panel.
 * Called when leaving the cam wall: unlike LAN ffmpeg (local), staying joined to
 * Agora channels off-screen burns the account's RTC minutes + bandwidth, so we
 * leave the channel as soon as the feed isn't on screen. The side panel (if
 * open) and the cam wall both re-request their cameras on next render.
 */
export function acuReleaseCloudCameras() {
  const active = ctx.getActivePrinter?.();
  const activeKey = active ? acuKey(active) : null;
  for (const conn of _acuConns.values()) {
    if (conn.mode !== "cloud" || conn.key === activeKey) continue;
    conn.data.camWanted = false;
    conn.data.camLive = false;
    acuAgoraStop(conn.key);
  }
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
      // The offline→online transition must re-render the cam wall — `_acuNotify`
      // only fires `onPrinterGridChange`, a no-op there. Without this, going
      // straight to the cam wall drops the cloud camera card: the Agora player
      // started during acuConnect, but each card is gated on acuIsOnline, which
      // only flips true here. (The side panel masked it by making the printer
      // connect first.)
      ctx.onPrinterStatusChange?.(connKey, "connected");
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
      if (action === "workReport") {
        const cur = d.printState || "idle";
        if (state === "busy" && cur === "idle") d.printState = "preparing";
        else if (state === "free" && cur === "preparing") d.printState = "idle";
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
    case "fan": {
      if (data?.fan_speed_pct != null) d.fanSpeedPct = Number(data.fan_speed_pct) || 0;
      break;
    }
    case "status": {
      if (action === "workReport" && (state === "free" || state === "busy")) {
        d.workState = state;
        // "free" with a stale active print state means the job ended while
        // we weren't watching the transition — fall back to idle.
        if (state === "free" && ["printing", "preparing", "paused"].includes(d.printState)) {
          d.printState = "idle";
        }
      }
      break;
    }
    case "lastWill": {
      // online/offline of the printer itself; the broker connection already
      // tracks reachability, so just record it.
      break;
    }
    default:
      // Unknown family (file, ota, peripherie, …) — visible in the request
      // log, nothing to merge.
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
  const blocks = `
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

// ── Self-registration ──────────────────────────────────────────────────────

registerBrand("anycubic", {
  meta, schema, helper,
  renderFilamentCard:   renderAcuFilamentCard,
  renderSettingsWidget: schemaWidget(schema),
});
