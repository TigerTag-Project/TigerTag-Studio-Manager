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
import { renderAcuFilamentCard, renderAcuJobCard, renderAcuTempCard } from './cards.js';
import { schemaWidget } from '../modal-helpers.js';

const $ = id => document.getElementById(id);

// ── Private connection state ───────────────────────────────────────────────

/** Per-printer live state. Keyed by `${brand}:${id}`. */
const _acuConns = new Map();

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
export function acuConnect(printer, { skipCam = false } = {}) {
  const key = acuKey(printer);
  const ip  = printer.ip || "";
  const existing = _acuConns.get(key);

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
    status:       "connecting",
    lastError:    null,
    refreshTimer: null,
    log:          [],
    logPaused:    false,
    logExpanded:  false,
    // On reconnect: keep previous layout/job so the UI doesn't flash to
    // empty while the handshake completes. Clear lastCamFrame — the camera
    // stream is being restarted.
    data: _prevData ? { ..._prevData, lastCamFrame: null } : {
      boxes:      [],   // [{ id, modelId, temp, slots: [{ index, type, color }] }]
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
      // Camera (on-demand, probe-gated — see header)
      camWanted:     false, // a panel wants the feed
      camLive:       false, // probe said live + ffmpeg started
      camSupported:  null,  // null=unknown, true=local FLV, false=WebRTC/none
      lastCamFrame:  null,
    },
  };
  // A fresh reconnect must not inherit a stale camLive (ffmpeg was stopped).
  if (_prevData) { conn.data.camLive = false; conn.data.camWanted = false; }
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
  if (conn._camRetry)    { clearTimeout(conn._camRetry);    conn._camRetry = null; }
  // If we activated the camera, tell the printer to stop capturing so it isn't
  // left streaming after we're gone.
  if (conn.data?.camWanted && conn.brokerUp) _acuStopCapture(conn);
  window.anycubic?.camStop(key);
  window.anycubic?.disconnect(key);
  _acuConns.delete(key);
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
  if (conn._camRetry) { clearTimeout(conn._camRetry); conn._camRetry = null; }
  if (conn.brokerUp) _acuStopCapture(conn);
  window.anycubic?.camStop(conn.key);
  conn.data.camLive = false;
  conn.data.lastCamFrame = null;
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

/**
 * Determine whether this printer exposes a pullable local FLV camera. Only
 * models that advertise an `rtspUrl` (…:18088/flv) in /info do — e.g. the
 * Kobra 3 V2. Models that stream via WebRTC/TRTC (e.g. Kobra X) advertise no
 * rtspUrl and their /flv never serves (it 400s); activating them would just
 * push to a TRTC room we can't consume. Cached on the conn for its lifetime.
 * Defaults to "supported" when /info is unreachable so a transient hiccup
 * doesn't disable the camera on an FLV model.
 */
async function _acuCheckCamSupported(conn) {
  if (conn.data.camSupported != null) return conn.data.camSupported;
  let url = null;
  try { const r = await window.anycubic?.httpInfo?.(conn.ip); if (r?.ok) url = String(r.info?.rtspUrl || ""); }
  catch (_) { url = null; }
  if (!_acuConns.has(conn.key)) return false;
  if (url == null) return true; // /info unreachable — assume FLV, don't cache
  conn.data.camSupported = /\/flv\b/i.test(url) || /:18088\//.test(url);
  return conn.data.camSupported;
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
  conn._camProbing = true;
  let live = false;
  try { const r = await window.anycubic?.flvProbe(conn.ip); live = !!r?.live; }
  catch (_) { live = false; }
  conn._camProbing = false;
  if (!_acuConns.has(conn.key)) return; // disconnected while probing

  if (live) {
    conn.data.camLive = true;
    window.anycubic?.camStart({ key: conn.key, ip: conn.ip });
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
  window.anycubic?.publish(conn.key, payload, endpoint);
}

// ── Refresh timer ──────────────────────────────────────────────────────────

function _scheduleRefresh(conn, delayMs = ACU_REFRESH_MS) {
  if (conn.refreshTimer) clearTimeout(conn.refreshTimer);
  conn.refreshTimer = setTimeout(() => {
    conn.refreshTimer = null;
    if (!_acuConns.has(conn.key)) return;
    _publish(conn, _acuRequest("getInfo"));
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
      _publish(conn, _acuRequest("getInfo"));
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
      });
    }
    out.push({
      id,
      modelId: Number.isFinite(Number(box.model_id)) ? Number(box.model_id) : null,
      temp:    Number.isFinite(Number(box.temp))     ? Number(box.temp)     : null,
      slots,
    });
  }
  return out;
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
  }
}

function _acuMerge(conn, msg) {
  if (!msg || typeof msg !== "object") return;
  const d      = conn.data;
  const type   = String(msg.type   || "");
  const action = String(msg.action || "");
  const state  = String(msg.state  || "");
  const data   = msg.data;

  switch (type) {
    case "multiColorBox": {
      // Full layout only on getInfo/setInfo/refresh — other actions
      // (autoUpdateDryStatus, feedFilament, …) carry PARTIAL box objects
      // (no slots); re-flattening those would wipe the slot colors.
      if (data?.multi_color_box) {
        if (action === "getInfo" || action === "setInfo" || action === "refresh") {
          d.boxes = acuFlattenReport(msg);
          d.lastReport = Date.now();
        } else {
          for (const box of data.multi_color_box) {
            const known = d.boxes.find(b => b.id === Number(box?.id));
            if (known && Number.isFinite(Number(box.temp))) known.temp = Number(box.temp);
          }
        }
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
    case "tempature": { // (sic — firmware spelling)
      if (action === "auto" && data) {
        if (data.curr_hotbed_temp   != null) d.bedCurrent    = Math.round(Number(data.curr_hotbed_temp)   || 0);
        if (data.curr_nozzle_temp   != null) d.nozzleCurrent = Math.round(Number(data.curr_nozzle_temp)   || 0);
        if (data.target_hotbed_temp != null) d.bedTarget     = Math.round(Number(data.target_hotbed_temp) || 0);
        if (data.target_nozzle_temp != null) d.nozzleTarget  = Math.round(Number(data.target_nozzle_temp) || 0);
      }
      break;
    }
    case "video": {
      // Camera stream lifecycle (PROTOCOL.md §5c). initSuccess → /flv is now
      // serving, attach ffmpeg. pushStopped → it stopped (by us or another
      // viewer); drop to idle. We react regardless of who triggered it, so a
      // stream started in the slicer attaches here too.
      if (action === "startCapture" && state === "initSuccess") {
        // Don't chase /flv on WebRTC models (camSupported === false). null
        // (unknown) is allowed through — only a confirmed WebRTC model is
        // skipped, so a slicer-started stream on an FLV model still attaches.
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
    if (liveHost) liveHost.innerHTML = renderAnycubicLiveInner(active);
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

    _publish(conn, _acuRequest("setInfo", {
      multi_color_box: [{ id: boxId, slots: [{ index: slotId, type: _acuSelType, color: rgb }] }],
    }));

    // Optimistic local update so the slot square changes immediately…
    const box  = (conn.data?.boxes || []).find(b => b.id === boxId);
    const slot = (box?.slots || []).find(s => s.index === slotId);
    if (slot) { slot.type = _acuSelType; slot.color = "#" + safe; }
    _acuNotify(conn);
    // …then confirm against the printer (there is no per-command ack).
    _scheduleRefresh(conn, 1500);

    closeAcuFilamentEdit();
  });
}

// ── Self-registration ──────────────────────────────────────────────────────

registerBrand("anycubic", {
  meta, schema, helper,
  renderFilamentCard:   renderAcuFilamentCard,
  renderSettingsWidget: schemaWidget(schema),
});
