/**
 * printers/bambulab/index.js — Bambu Lab MQTT TLS live integration.
 *
 * Protocol: MQTTS port 8883 (TLS, cert ignored), username "bblp",
 * password = Access Code printed on the printer screen.
 * Subscribe: device/{serial}/report
 * Publish:   device/{serial}/request
 *
 * Camera:
 *   Transport determined by `camera_transport` in bbl_printer_models.json:
 *   "jpeg_tcp" (A1, A1 Mini, P1P, P1S) → JPEG TCP port 6000 via main process.
 *   "rtsp"     (X1C, X1E, P2S, H2x…)  → rtsps://{ip}:322/... (copy-URL only).
 *
 * Self-registers into the brands registry at module evaluation time.
 */
import { ctx } from '../context.js';
import { registerBrand } from '../registry.js';
import { meta, schema, helper } from './settings.js';
import { renderBambuJobCard, renderBambuTempCard, renderBambuFilamentCard, renderBambuControlCard } from './cards.js';
import { schemaWidget } from '../modal-helpers.js';
import { morphInner } from '../dom-morph.js';

const $ = id => document.getElementById(id);

// ── Private connection state ───────────────────────────────────────────────

/** Per-printer live state. Keyed by `${brand}:${id}`. */
const _bambuConns = new Map();
// One pending camera-paint rAF token per printer key (frame-drop guard).
const _camRafs = new Map();

// ── Model helpers ──────────────────────────────────────────────────────────

/** Returns the numeric model ID stored on the printer object, or 0. */
export function bambuModelId(p) {
  const id = parseInt(p.printerModelId, 10);
  return isNaN(id) ? 0 : id;
}

/**
 * Returns true when the printer uses JPEG TCP (port 6000) for its camera.
 * Source of truth: `camera_transport` field in bbl_printer_models.json,
 * loaded into state.db.printerModels and accessible via ctx.findPrinterModel.
 */
export function bambuUsesJpegCam(p) {
  return ctx.findPrinterModel('bambulab', p.printerModelId)?.camera_transport === 'jpeg_tcp';
}

// ── Public key helpers ─────────────────────────────────────────────────────

export function bambuKey(p) { return `${p.brand}:${p.id}`; }
export function bambuGetConn(key) { return _bambuConns.get(key) ?? null; }

// ── Online status ──────────────────────────────────────────────────────────

export function bambuIsOnline(printer) {
  if (printer?.brand !== "bambulab") return null;
  const key = bambuKey(printer);
  if (ctx.isForcedOffline?.(key)) return false; // explicitly disconnected via button
  const conn = _bambuConns.get(key);
  if (conn) return conn.status === "connected";
  return null; // no live connection → unknown
}

function _bambuRefreshOnlineUI(key) {
  document.querySelectorAll(`[data-printer-key="${key}"] .printer-online`).forEach(el => {
    const p = ctx.getState().printers.find(x => bambuKey(x) === key);
    el.outerHTML = renderBambuOnlineBadge(p, "card");
  });
  const active = ctx.getActivePrinter();
  if (active && bambuKey(active) === key) {
    const host = $("ppOnlineRow");
    if (host) host.outerHTML = renderBambuOnlineBadge(active, "side");
  }
}

export function renderBambuOnlineBadge(printer, where) {
  if (!printer || printer.brand !== "bambulab") return "";
  const online = bambuIsOnline(printer);
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

// ── Sequence ID ────────────────────────────────────────────────────────────

let _seqId = 0;
function _nextSeq() {
  if (_seqId >= 4086) _seqId = 0;
  return String(_seqId++);
}

// ── Connection lifecycle ───────────────────────────────────────────────────

/**
 * Connect (or reconnect) a Bambu Lab printer.
 *
 * @param {object} printer  — printer record from state.printers
 * @param {object} [opts]
 * @param {boolean} [opts.skipCam=false]  — true for background auto-connects
 *   (no camera stream started; saves bandwidth when the sidecard is closed).
 *   When the sidecard opens, call bambuConnect again without skipCam and the
 *   camera will start on the already-live MQTT session.
 */
export function bambuConnect(printer, { skipCam = false } = {}) {
  const key = bambuKey(printer);
  const ip       = printer.broker || printer.ip || "";
  const password = printer.password || "";
  const existing = _bambuConns.get(key);

  // Idempotent: already connected/connecting with the same IP →
  // only (re-)start the camera if the caller wants it AND the stream
  // is not already delivering frames in the background (panel close no
  // longer stops the camera, so lastCamUrl being non-null means the
  // ffmpeg/JPEG-TCP process is alive — restarting it would cause a
  // brief interruption for no benefit).
  // Preserve live data across reconnections so UI doesn't flicker to zero.
  // We only carry it over when the IP hasn't changed (same physical printer).
  let _prevData = null;

  if (existing) {
    if (existing.status === "connected" || existing.status === "connecting") {
      if (existing.ip === ip) {
        if (!skipCam && ip && password && !existing.data?.lastCamUrl && !existing.data?.camDisabled) {
          if (bambuUsesJpegCam(printer)) {
            window.bambulab?.camStart({ key, ip, password });
          } else {
            window.bambulab?.camStartRtsp({ key, ip, password });
          }
        }
        return;
      }
    }
    // Carry data over before tearing down (same IP → reconnect, not a new printer).
    if (existing.ip === ip && existing.data) _prevData = { ...existing.data };
    // The camera stream restarts on reconnect → free the old Blob URL/bytes
    // so they don't outlive the connection (they're nulled below in `data`).
    if (existing.data?.lastCamUrl) URL.revokeObjectURL(existing.data.lastCamUrl);
    bambuDisconnect(key);
  }

  const serial   = printer.serialNumber || "";

  const conn = {
    key,
    ip,
    serial,
    password,
    modelId:      bambuModelId(printer), // numeric id — used to shape model-specific commands
    status:       "connecting",
    lastError:    null,
    refreshTimer: null,
    log:          [],
    logPaused:    false,
    logExpanded:  false,
    // On reconnect: keep previous print state/progress so the UI doesn't
    // flash to zero while the MQTT handshake completes and pushall arrives.
    // Clear the camera frame state — the stream is being restarted.
    data: _prevData ? { ..._prevData, lastCamUrl: null, lastCamBuf: null } : {
      printState:    null,
      printFilename: null,
      progress:      0,
      remainingTime: 0,
      layerNum:      0,
      totalLayerNum: 0,
      nozzleCurrent: null, nozzleTarget: null,
      bedCurrent:    null, bedTarget:    null,
      chamberCurrent: null,
      ams:           [],
      externalTray:  null,
      lastCamUrl:    null,
      lastCamBuf:    null,
    },
  };
  _bambuConns.set(key, conn);

  // Start camera feed — only when the sidecard is open (skipCam = false).
  // JPEG TCP  → A1 / A1 Mini / P1P / P1S (model IDs 1–4), port 6000.
  // RTSP/ffmpeg → X1C / X1E / P2S / H2x  (model IDs 5+),  port 322.
  if (!skipCam && ip && password && !conn.data.camDisabled) {
    if (bambuUsesJpegCam(printer)) {
      window.bambulab?.camStart({ key, ip, password });
    } else {
      window.bambulab?.camStartRtsp({ key, ip, password });
    }
  }

  // Initiate MQTT connection in the main process
  window.bambulab?.connect({ key, ip, serial, password });
}

/** Stop only the camera stream (JPEG TCP + RTSP); keep the MQTT session alive. */
export function bambuStopCam(key) {
  if (!_bambuConns.has(key)) return;
  window.bambulab?.camStop(key);
  window.bambulab?.camStopRtsp(key);
}

export function bambuDisconnect(key) {
  const conn = _bambuConns.get(key);
  if (!conn) return;
  if (conn.refreshTimer) { clearTimeout(conn.refreshTimer); conn.refreshTimer = null; }
  // Cancel any pending camera paint + free the live Blob URL for this key.
  if (_camRafs.has(key)) { cancelAnimationFrame(_camRafs.get(key)); _camRafs.delete(key); }
  if (conn.data?.lastCamUrl) URL.revokeObjectURL(conn.data.lastCamUrl);
  window.bambulab?.camStop(key);
  window.bambulab?.camStopRtsp(key);
  window.bambulab?.disconnect(key);
  _bambuConns.delete(key);
}

// ── MQTT publish ───────────────────────────────────────────────────────────

function _publish(conn, payload) {
  if (!conn) return;
  _bblLogPush(conn, "→", payload);
  window.bambulab?.publish(conn.key, payload);
}

// ── Machine control commands ────────────────────────────────────────────────
// Pause / resume / stop are documented (PROTOCOL.md §5.1-5.3). Light, jog, home,
// motors-off, fan and temperature setpoints use the community-documented
// `system.ledctrl` / `print.gcode_line` / `print.print_speed` payloads
// (PROTOCOL.md §5.6, sourced from OpenBambuAPI) — behaviour can vary per model.

/** Print control: action = "pause" | "resume" | "stop". */
export function bambuPrintControl(conn, action) {
  if (!conn || !["pause", "resume", "stop"].includes(action)) return;
  _publish(conn, { print: { sequence_id: _nextSeq(), command: action } });
}

/** Send one or more raw G-code lines (joined by \n, trailing \n appended). */
function _bblGcode(conn, lines) {
  if (!conn) return;
  const param = (Array.isArray(lines) ? lines : [lines]).join("\n") + "\n";
  _publish(conn, { print: { sequence_id: _nextSeq(), command: "gcode_line", param } });
}

/** Toggle a light. node = "chamber_light" (X1C) | "work_light" (A1 toolhead). */
export function bambuLight(conn, on, node = "chamber_light") {
  if (!conn) return;
  _publish(conn, { system: {
    sequence_id: _nextSeq(), command: "ledctrl",
    led_node: node, led_mode: on ? "on" : "off",
    led_on_time: 500, led_off_time: 500, loop_times: 0, interval_time: 0,
  } });
  if (conn.data) conn.data.lightOn = !!on; // optimistic (telemetry confirms via lights_report)
  _bblNotify(conn); // repaint now — don't wait for the next report
}

/** Jog one axis by a signed distance (mm). axis = "x" | "y" | "z". */
export function bambuMove(conn, axis, distance) {
  if (!conn) return;
  const ax = String(axis).toUpperCase();
  if (!["X", "Y", "Z"].includes(ax)) return;
  const d = Number(distance) || 0;
  const feed = ax === "Z" ? 900 : 3000;
  // Relative move bracketed by G91/G90 so we don't leave the printer in relative mode.
  _bblGcode(conn, ["G91", `G1 ${ax}${d} F${feed}`, "G90"]);
}

/** Home axes. which = "all" | "xy" | "x" | "y" | "z". */
export function bambuHome(conn, which) {
  if (!conn) return;
  const w = String(which).toLowerCase();
  const arg = w === "all" ? "" : w === "xy" ? " X Y" : ` ${w.toUpperCase()}`;
  _bblGcode(conn, `G28${arg}`);
}

/** Disable the steppers. */
export function bambuMotorsOff(conn) {
  if (!conn) return;
  _bblGcode(conn, "M84");
}

// Fan index → the conn.data fields holding its displayed setpoint and the
// two-in-a-row confirm tracker. 1 = part cooling (M106 P1), 2 = auxiliary
// "assist" big fan (P2), 3 = chamber/"case" fan (P3, enclosed models only).
const _BBL_FAN = {
  1: { pct: "fanSpeedPct",        last: "_fanLast" },
  2: { pct: "auxFanSpeedPct",     last: "_auxFanLast" },
  3: { pct: "chamberFanSpeedPct", last: "_chamberFanLast" },
};

/** Set a fan speed 0-100 %. fan = 1 (part) | 2 (auxiliary) | 3 (chamber). */
export function bambuFan(conn, pct, fan = 1) {
  if (!conn) return;
  const f = _BBL_FAN[fan] ? fan : 1;
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  _bblGcode(conn, `M106 P${f} S${Math.round(p * 255 / 100)}`);
  if (conn.data) { // optimistic display + reset the two-in-a-row confirm tracker
    conn.data[_BBL_FAN[f].pct]  = p;
    conn.data[_BBL_FAN[f].last] = undefined;
  }
  _bblNotify(conn); // repaint now — don't wait for the next report
}

/** Current displayed speed (%) of a fan. fan = 1 | 2 | 3. */
export function bambuFanPct(conn, fan) {
  const k = _BBL_FAN[_BBL_FAN[fan] ? fan : 1];
  return Number(conn?.data?.[k.pct]) || 0;
}

/** Set a heater target. which = "nozzle" | "bed" | "chamber". The chamber
 *  setpoint (heated-chamber models, e.g. H2C/H2D) uses `M141`; there is no
 *  chamber target reported in telemetry, so we keep it optimistically. */
export function bambuSetTemp(conn, which, value, nozzleId) {
  if (!conn) return;
  const v = Math.max(0, Math.round(Number(value) || 0));
  if (which === "chamber") {
    // X1E heats the chamber with M141 alone; H2-series / X2D gate the heater
    // behind the airduct mode — M145 P1 = heating path, P0 = cooling — so the
    // chamber setpoint is sent as M145+M141 (ported from ha-bambulab's
    // set_temperature_to_gcode, see PROTOCOL.md §16 H2-series).
    const gc = conn.modelId === 6   ? `M141 S${v}`              // X1E
             : v > 40               ? `M145 P1\nM141 S${v}`      // H2*/X2D — enable heat
             :                        `M141 S${v}\nM145 P0`;     // H2*/X2D — cooling
    _bblGcode(conn, gc);
    if (conn.data) conn.data.chamberTarget = v; // optimistic; telemetry confirms via ctc.temp
    _bblNotify(conn);
    return;
  }
  if (which === "bed") { _bblGcode(conn, `M140 S${v}`); return; }
  // Nozzle — on a dual-head H2 machine, target a specific head (M104 T{id});
  // a single-nozzle machine (no id passed) uses plain M104.
  _bblGcode(conn, (nozzleId === 0 || nozzleId === 1) ? `M104 T${nozzleId} S${v}` : `M104 S${v}`);
}

/** Set the print-speed level. mode = 1 (Silent) | 2 (Standard) | 3 (Sport) | 4 (Ludicrous). */
export function bambuSetSpeedMode(conn, mode) {
  if (!conn) return;
  const m = Number(mode) || 0;
  if (![1, 2, 3, 4].includes(m)) return;
  _publish(conn, { print: { sequence_id: _nextSeq(), command: "print_speed", param: String(m) } });
  if (conn.data) conn.data.speedMode = m; // optimistic
  _bblNotify(conn); // repaint now — don't wait for the next report
}

// ── Refresh timer ──────────────────────────────────────────────────────────

// If no message in 5 s, push a `pushall` to refresh state.
function _scheduleRefresh(conn) {
  if (conn.refreshTimer) clearTimeout(conn.refreshTimer);
  conn.refreshTimer = setTimeout(() => {
    conn.refreshTimer = null;
    if (!_bambuConns.has(conn.key)) return;
    _publish(conn, { pushing: { sequence_id: _nextSeq(), command: "pushall", version: 1, push_target: 1 } });
    _scheduleRefresh(conn);
  }, 5_000);
}

// ── Global IPC listeners (registered once at module load) ─────────────────
// Using single global listeners avoids accumulating duplicate handlers
// when bambuConnect is called repeatedly (e.g. panel open → close → open).

if (typeof window !== "undefined" && window.bambulab) {
  window.bambulab.onStatus((key, status) => {
    const conn = _bambuConns.get(key);
    if (!conn) return;
    // Track the previous online state so we only trigger a full grid rebuild
    // when the printer actually moves between sections (offline ↔ online).
    // Intermediate transitions (e.g. connecting → connecting, error → reconnecting)
    // just update the badge in-place via _bambuRefreshOnlineUI — no full rebuild,
    // no innerHTML wipe that would cause click events to miss their target.
    const wasOnline = conn.status === "connected";
    if (status === "connected") {
      conn.lastError = null;
      // MQTT broker connection is up, but the printer hasn't sent a report
      // yet — stay "connecting" until the first message arrives (see
      // onMessage). Only a real report counts as really established.
      if (conn.status !== "connected") conn.status = "connecting";
      // Init sequence: get_version → pushall (these trigger the first report).
      _publish(conn, { info:    { sequence_id: _nextSeq(), command: "get_version" } });
      _publish(conn, { pushing: { sequence_id: _nextSeq(), command: "pushall" } });
      _scheduleRefresh(conn);
    } else {
      conn.status = status;
    }
    const isOnline  = conn.status === "connected";
    // Full rebuild only when online ↔ offline section membership changes.
    // All other badge-only updates are handled by _bambuRefreshOnlineUI below.
    _bblNotify(conn, /*statusChanged*/ wasOnline !== isOnline);
    _bambuRefreshOnlineUI(key);
  });

  window.bambulab.onMessage((key, _topic, data) => {
    const conn = _bambuConns.get(key);
    if (!conn) return;
    _bblLogPush(conn, "←", data);
    // First real report confirms the connection is truly established — flip
    // from "connecting" to "connected" and re-partition the grid.
    if (conn.status !== "connected") {
      conn.status = "connected";
      conn.lastError = null;
      _bblNotify(conn, /*statusChanged*/ true);
      _bambuRefreshOnlineUI(key);
    }
    _bblParseModules(conn, data);
    _bblMerge(conn, data);
  });

  window.bambulab.onCamFrame((key, buf) => {
    const conn = _bambuConns.get(key);
    if (!conn) return;
    const firstFrame = !conn.data.lastCamUrl;
    // Keep only the newest raw JPEG bytes; the Blob URL is built once per
    // painted frame inside the rAF below (not per incoming frame).
    conn.data.lastCamBuf = buf;
    // Frame-drop via rAF: ffmpeg/JPEG-TCP can push frames faster than the
    // renderer paints them. If a paint is already scheduled for this key, we
    // just keep the newest bytes and let the pending rAF show them — never
    // queue a second paint. This collapses bursts into one paint per
    // animation frame, killing the rafale freezes when the tab is busy.
    if (_camRafs.has(key)) return;
    _camRafs.set(key, requestAnimationFrame(() => {
      _camRafs.delete(key);
      const c = _bambuConns.get(key);
      if (!c || !c.data.lastCamBuf) return;
      // Wrap the latest bytes in a Blob URL (no Base64 re-decode) and revoke
      // the previous one so a single object URL is ever alive per key.
      const url = URL.createObjectURL(new Blob([c.data.lastCamBuf], { type: "image/jpeg" }));
      if (c.data.lastCamUrl) URL.revokeObjectURL(c.data.lastCamUrl);
      c.data.lastCamUrl = url;
      // Fan out to ALL imgs with this key — cam wall + sidecard can display
      // simultaneously. The main process keeps a single JPEG TCP / RTSP
      // connection, so no extra load on the printer.
      const imgs = document.querySelectorAll(`[data-bbl-key="${CSS.escape(key)}"]`);
      if (!imgs.length) return;
      imgs.forEach(img => {
        img.src = url;
        if (firstFrame) {
          const wrap = img.closest(".pp-cam-loading");
          if (wrap) {
            wrap.classList.remove("pp-cam-loading");
            wrap.querySelector(".pp-cam-loading-overlay")?.remove();
          }
        }
      });
    }));
  });
}

// ── Message parser ────────────────────────────────────────────────────────

function _decodePackedTemp32(raw) {
  const v = typeof raw === "number" ? raw : parseInt(raw);
  if (isNaN(v)) return { current: null, target: null };
  return { current: v & 0xFFFF, target: (v >> 16) & 0xFFFF };
}

function _normState(p) {
  const raw = (p.gcode_state || p.print_type || p.state || p.status || "").toLowerCase();
  // No state field present in this message — return null so the caller
  // doesn't overwrite an existing valid state with a false "idle".
  if (!raw) return null;
  if (["failed", "failure", "error"].includes(raw)) {
    const alt = (p.print_type || p.state || p.status || "").toLowerCase();
    if (alt && alt !== raw && ["idle", "finish", "finished"].includes(alt)) return "idle";
  }
  switch (raw) {
    case "running":  case "printing": return "printing";
    case "prepare":  case "preparing": case "heating": return "preparing";
    case "busy":     return "busy";
    case "pause":    case "paused": return "paused";
    case "finish":   case "finished": return "finished";
    case "failed":   case "failure": return "failed";
    case "error":    return "error";
    default:         return "idle";
  }
}

function _parseColor(hex) {
  if (!hex) return null;
  const h = String(hex).replace(/^#/, "").toUpperCase();
  // RRGGBBAA (8) or RRGGBB (6) — drop alpha, return #RRGGBB
  if (h.length === 8 || h.length === 6) return "#" + h.slice(0, 6);
  return null;
}

// Detect each AMS unit's type from the get_version response (PROTOCOL.md §8.3).
// The `module[].name` prefix identifies the hardware: `ams_f1/` = AMS Lite (no
// humidity/temp sensor), `n3s/` = AMS HT, `n3f/` = AMS 2 Pro, `ams/` = standard
// AMS. Stored as conn.data.amsType[unitIndex] and used to decide what the
// filament card shows (AMS Lite shows neither humidity nor temperature).
function _bblParseModules(conn, msg) {
  const mods = msg?.info?.module;
  if (!Array.isArray(mods)) return;
  const types = conn.data.amsType || (conn.data.amsType = {});
  let changed = false;
  for (const m of mods) {
    const mm = String(m?.name || "").match(/^(ams_f1|ams|n3f|n3s)\/(\d+)/);
    if (!mm) continue;
    const type = mm[1] === "ams_f1" ? "lite"
               : mm[1] === "n3s"    ? "ht"
               : mm[1] === "n3f"    ? "pro"
               :                      "standard";
    if (types[mm[2]] !== type) { types[mm[2]] = type; changed = true; }
  }
  if (changed) _bblNotify(conn); // humidity/temp visibility may have changed
}

function _bblMerge(conn, msg) {
  const p = msg?.print;
  if (!p || typeof p !== "object") return;
  const d = conn.data;

  // State
  const st = _normState(p);
  if (st != null) d.printState = st;

  // Progress
  if (p.mc_percent != null) d.progress = +(p.mc_percent) || 0;

  // Time remaining
  const rt = p.mc_remaining_time ?? p.remaining_time;
  if (rt != null) d.remainingTime = +(rt) || 0;

  // Layers
  if (typeof p.layer_num      === "number") d.layerNum      = p.layer_num;
  if (typeof p.total_layer_num === "number") d.totalLayerNum = p.total_layer_num;

  // Filename (first non-empty field wins)
  const fn = p.gcode_file || p.subtask_name || p.project_file
           || p.project_name || p.filename || p.task_name || p.ipcam?.file_name;
  if (fn) {
    try { d.printFilename = decodeURIComponent(String(fn).split("/").pop()); }
    catch { d.printFilename = String(fn).split("/").pop(); }
  }

  // Camera disable flag (PROTOCOL.md §10): when the user turns the LAN camera
  // off on the printer's own screen, pushall reports ipcam.rtsp_url === "disable".
  // Honor it — stop any running stream and gate future starts (see bambuConnect).
  // Only act on the transition so we don't spam camStop on every pushall.
  if (p.ipcam && p.ipcam.rtsp_url != null) {
    const disabled = p.ipcam.rtsp_url === "disable";
    if (disabled && !d.camDisabled) { d.camDisabled = true; bambuStopCam(conn.key); }
    else if (!disabled)             { d.camDisabled = false; }
  }

  // ── Temperatures (new-firmware packed 32-bit first, then fallback) ──
  const dev = p.device;
  if (dev) {
    // Nozzle(s). H2-series report TWO extruders (id 0 = right, id 1 = left);
    // single-nozzle models report one (id 0). Keep them all + the active index
    // (extruder.state bits 4-7), and mirror the active one into the legacy
    // single-nozzle fields for back-compat.
    const ext = dev.extruder;
    if (ext?.info && Array.isArray(ext.info)) {
      const state = typeof ext.state === "number" ? ext.state : null;
      const activeIdx = state !== null ? (state >> 4) & 0xF : null;
      const list = ext.info
        .filter(e => e && (e.id === 0 || e.id === 1) && e.temp != null)
        .map(e => { const t = _decodePackedTemp32(e.temp); return { id: e.id, current: t.current, target: t.target }; })
        .sort((a, b) => a.id - b.id);
      if (list.length) {
        d.nozzles = list;
        d.activeNozzle = activeIdx;
        const act = list.find(n => n.id === activeIdx) || list[0];
        d.nozzleCurrent = act.current; d.nozzleTarget = act.target;
      }
    }
    // Bed
    if (dev.bed?.info?.temp != null) {
      const t = _decodePackedTemp32(dev.bed.info.temp);
      d.bedCurrent = t.current; d.bedTarget = t.target;
    }
    // Chamber (packed current|target — heated-chamber models report a setpoint
    // in the high 16 bits; passive ones report target 0).
    if (dev.ctc?.info?.temp != null) {
      const t = _decodePackedTemp32(dev.ctc.info.temp);
      d.chamberCurrent = t.current;
      d.chamberTarget  = t.target;
    }
  }
  // Fallback: old-firmware float fields — only when the new-firmware `dev`
  // block was absent in this message (avoids freezing temps on partial updates).
  if (!dev) {
    if (p.nozzle_temper        != null) d.nozzleCurrent  = Math.round(+p.nozzle_temper);
    if (p.nozzle_target_temper != null) d.nozzleTarget   = Math.round(+p.nozzle_target_temper);
    if (p.bed_temper           != null) d.bedCurrent     = Math.round(+p.bed_temper);
    if (p.bed_target_temper    != null) d.bedTarget      = Math.round(+p.bed_target_temper);
    if (p.chamber_temper       != null) d.chamberCurrent = Math.round(+p.chamber_temper);
  }

  // ── AMS — merge by module ID, then by tray ID ──────────────────────────
  // Never replace the whole array: partial updates only contain changed
  // modules/trays; untouched entries must be preserved.
  if (p.ams?.ams && Array.isArray(p.ams.ams)) {
    if (!Array.isArray(d.ams)) d.ams = [];
    for (const mod of p.ams.ams) {
      const modId = String(mod.id ?? "");
      let dm = d.ams.find(m => m.id === modId);
      if (!dm) {
        dm = { id: modId, humidity: "", humidityRaw: "", temp: "", tray: [] };
        d.ams.push(dm);
      }
      // `humidity` is a 1-5 desiccant GRADE (not a %); `humidity_raw` is the real
      // humidity % (AMS 2 Pro / AMS HT only — absent on standard AMS / AMS Lite).
      if (mod.humidity     !== undefined) dm.humidity    = String(mod.humidity ?? "");
      if (mod.humidity_raw !== undefined) dm.humidityRaw = String(mod.humidity_raw ?? "");
      if (mod.temp         !== undefined) dm.temp        = String(mod.temp ?? "");
      if (Array.isArray(mod.tray)) {
        for (const t of mod.tray) {
          const trayId = String(t.id ?? "");
          let dt = dm.tray.find(x => x.id === trayId);
          if (!dt) {
            dt = { id: trayId, color: null, type: "", active: false };
            dm.tray.push(dt);
          }
          if (t.tray_color !== undefined) dt.color  = _parseColor(t.tray_color);
          if (t.tray_type  !== undefined) dt.type   = String(t.tray_type || "");
          if (t.is_active  !== undefined || t.state !== undefined)
            dt.active = t.is_active === true || t.state === 11;
        }
      }
    }
  }

  // ── External spool (vt_tray = old fw, vir_slot[0] = new fw) ────────────
  // Merge individual fields — never overwrite an existing value with null.
  const ext2 = (p.vt_tray && typeof p.vt_tray === "object") ? p.vt_tray
             : (Array.isArray(p.vir_slot) && p.vir_slot.length > 0) ? p.vir_slot[0]
             : null;
  if (ext2) {
    if (!d.externalTray) d.externalTray = { color: null, type: "", active: false };
    if (ext2.tray_color !== undefined) d.externalTray.color  = _parseColor(ext2.tray_color);
    if (ext2.tray_type  !== undefined) d.externalTray.type   = String(ext2.tray_type || "");
    if (ext2.is_active  !== undefined || ext2.state !== undefined)
      d.externalTray.active = ext2.is_active === true || ext2.state === 11;
  }

  // If partial update has vt_tray but no AMS → schedule a pushall refresh
  if ((p.vt_tray || p.vir_slot) && !p.ams && !d.ams.length) {
    _scheduleRefresh(conn);
  }

  // ── Control state (light / speed level / part-fan) for the control card ──
  // Light: lights_report = [{ node, mode }]. Prefer chamber_light, else first.
  if (Array.isArray(p.lights_report) && p.lights_report.length) {
    const cl = p.lights_report.find(l => l?.node === "chamber_light") || p.lights_report[0];
    if (cl?.mode) d.lightOn = cl.mode === "on";
  }
  // Speed level (1-4): spd_lvl.
  if (p.spd_lvl != null) {
    const lv = parseInt(p.spd_lvl, 10);
    if ([1, 2, 3, 4].includes(lv)) d.speedMode = lv;
  }
  // Fans: the printer reports only the *actual* speed (cooling_fan_speed = part,
  // big_fan1_speed = aux; 0-15 gears), which ramps/fluctuates while it spins
  // up/down — there is no setpoint field. To show a STABLE value (and still pick
  // up a change made on the printer itself) without flashing through the ramp,
  // we accept a telemetry reading only once it REPEATS: the same value two
  // reports in a row confirms it. Transient ramp values (each different) are
  // ignored. User commands (bambuFan) set the value optimistically for instant
  // feedback and reset the confirm tracker so a stale prior value can't snap back.
  if (p.cooling_fan_speed != null) {
    const g = parseInt(p.cooling_fan_speed, 10);
    if (!isNaN(g)) {
      const pct = Math.round(Math.max(0, Math.min(15, g)) * 100 / 15);
      if (pct === d._fanLast) d.fanSpeedPct = pct; // confirmed (two in a row)
      d._fanLast = pct;
    }
  }
  if (p.big_fan1_speed != null) {
    const g = parseInt(p.big_fan1_speed, 10);
    if (!isNaN(g)) {
      const pct = Math.round(Math.max(0, Math.min(15, g)) * 100 / 15);
      if (pct === d._auxFanLast) d.auxFanSpeedPct = pct; // confirmed (two in a row)
      d._auxFanLast = pct;
    }
  }
  if (p.big_fan2_speed != null) { // chamber/"case" fan (enclosed models, e.g. X1C)
    const g = parseInt(p.big_fan2_speed, 10);
    if (!isNaN(g)) {
      const pct = Math.round(Math.max(0, Math.min(15, g)) * 100 / 15);
      if (pct === d._chamberFanLast) d.chamberFanSpeedPct = pct; // confirmed (two in a row)
      d._chamberFanLast = pct;
    }
  }

  _bblNotify(conn);
}

// ── rAF-coalesced re-renders ───────────────────────────────────────────────

let _raf     = null;
let _bblGridRaf   = null; // data updates  → onGridJobsChange
let _bblStatusRaf = null; // status changes → onPrinterGridChange (separate to avoid coalescing with data RAF)
let _rafStatus = false;

function _bblNotify(conn, statusChanged = false) {
  if (statusChanged) {
    if (!_bblStatusRaf) _bblStatusRaf = requestAnimationFrame(() => { _bblStatusRaf = null; ctx.onPrinterGridChange(); });
    return;
  }
  if (!_bblGridRaf) _bblGridRaf = requestAnimationFrame(() => { _bblGridRaf = null; ctx.onGridJobsChange(); });
  const active = ctx.getActivePrinter();
  if (!active) return;
  if (bambuKey(active) !== conn.key) return;
  if (_raf) return; // coalesce bursts
  _raf = requestAnimationFrame(() => {
    _raf = null;
    const full = _rafStatus;
    _rafStatus = false;
    if (full) {
      ctx.onFullRender();
    } else {
      // Patch in place (never innerHTML) so an incoming report can't close an
      // open inline edit / <select> and there's no flicker. See dom-morph.js.
      const liveHost = $("bblLive");
      if (liveHost) morphInner(liveHost, renderBambuLiveInner(active));
      const logHost  = $("bblLog");
      if (logHost)  morphInner(logHost, renderBambuLogInner(active));
      const countEl  = $("bblLogCount");
      if (countEl) countEl.textContent = String(_bambuConns.get(bambuKey(active))?.log?.length || 0);
    }
  });
}

// ── Request log ────────────────────────────────────────────────────────────

const BBL_LOG_MAX = 100;

function _bblLogPush(conn, dir, raw) {
  if (conn.logPaused) return;
  if (!conn.log) conn.log = [];
  let summary = "";
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if      (obj?.print?.command)   summary = `print:${obj.print.command}`;
    else if (obj?.info?.command)    summary = `info:${obj.info.command}`;
    else if (obj?.pushing?.command) summary = `push:${obj.pushing.command}`;
    else { summary = Object.keys(obj || {}).slice(0, 3).join(", ") || "(msg)"; }
    const gst = obj?.print?.gcode_state || obj?.print?.state || "";
    if (gst) summary += ` · ${gst}`;
  } catch { summary = "(non-json)"; }
  const ts     = new Date().toLocaleTimeString([], { hour12: false });
  const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
  conn.log.push({ dir, ts, summary, raw: rawStr });
  if (conn.log.length > BBL_LOG_MAX) conn.log.splice(0, conn.log.length - BBL_LOG_MAX);
}

// ── Live block renderer ────────────────────────────────────────────────────

export function renderBambuLiveInner(p) {
  const conn = _bambuConns.get(bambuKey(p));
  if (!conn) return `
    <div class="snap-empty">
      <span class="icon icon-cloud icon-18"></span>
      <span>${ctx.esc(ctx.t("snapNoConnection"))}</span>
    </div>`;
  // Actively-heated chamber (ha-bambulab ACTIVE_CHAMBER_HEATER): X1E 6, H2S 7,
  // H2D 8, H2D Pro 9, H2C 11, X2D 12 → chamber pill becomes an editable setpoint.
  // Passive-chamber models (X1C…) stay read-only.
  const heatedChamber = [6, 7, 8, 9, 11, 12].includes(bambuModelId(p));
  return `
    ${renderBambuJobCard(p, conn)}
    ${renderBambuControlCard(p, conn)}
    ${renderBambuTempCard(conn, heatedChamber)}
    ${renderBambuFilamentCard(p, conn)}`;
}

// ── Log renderer ───────────────────────────────────────────────────────────

export function renderBambuLogInner(p) {
  const conn = _bambuConns.get(bambuKey(p));
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

// ── Filament edit sheet ────────────────────────────────────────────────────

let _bblMatCache = null;   // loaded once via IPC, refreshed on sheet open
let _bblFilEdit  = null;   // { printer, amsId, trayId }
let _bblSelMat   = null;   // { label, tray_type, bambuID, tempMin, tempMax }
let _bblSelColor = '#FF5722';

async function _bblLoadMaterials() {
  if (_bblMatCache) return _bblMatCache;
  try {
    const mats = await window.electronAPI?.db?.getBambuMaterials?.();
    _bblMatCache = Array.isArray(mats) ? mats : [];
  } catch (e) {
    console.warn('[BBL] Could not load materials:', e);
    _bblMatCache = [];
  }
  return _bblMatCache;
}

function _bblRenderMaterialList(filter) {
  const mats = _bblMatCache || [];
  const q = (filter || '').trim().toLowerCase();
  const list = q ? mats.filter(m => m.label.toLowerCase().includes(q)) : mats;
  if (!list.length) return `<div class="sfe-fil-empty">${ctx.esc(ctx.t('noMatch') || 'No match')}</div>`;
  return list.map(m => {
    const isSel = _bblSelMat?.bambuID === m.bambuID;
    const tempHint = `<span class="sfe-fil-row-temp">${m.tempMin}–${m.tempMax}°</span>`;
    return `<button type="button" class="sfe-fil-row${isSel ? ' is-selected' : ''}" data-bbl-mat='${JSON.stringify({label:m.label,tray_type:m.tray_type,bambuID:m.bambuID,tempMin:m.tempMin,tempMax:m.tempMax})}'>
      <span class="sfe-fil-row-text">${ctx.esc(m.label)}</span>
      ${tempHint}
      ${isSel ? `<span class="sfe-fil-row-check">✓</span>` : ''}
    </button>`;
  }).join('');
}

function _bblRenderColorGrid(currentColor) {
  const grid = $('bblColorGrid');
  if (!grid) return;
  const cur = (currentColor || '').toLowerCase();
  const presetCells = ctx.SNAP_FIL_COLOR_PRESETS.map(c => {
    const isSel = c.toLowerCase() === cur;
    return `<button type="button"
      class="sfe-color-cell${isSel ? ' is-selected' : ''}"
      data-color="${ctx.esc(c)}"
      style="background:${ctx.esc(c)}"></button>`;
  }).join('');
  const customStyle = `background:${currentColor || '#FF5722'}`;
  const customCell = `<button type="button"
    class="sfe-color-cell sfe-color-cell--custom" id="bblColorCustom"
    style="${customStyle}" title="Custom color">
    <span class="icon icon-edit icon-13" style="background:#fff;opacity:.8"></span>
  </button>`;
  grid.innerHTML = presetCells + customCell;
}

function _bblUpdateSummary() {
  const label = _bblSelMat?.label || '—';
  const matVal = $('bblMaterialTriggerVal');
  if (matVal) matVal.textContent = label;
  const colorDot = $('bblColorTriggerVal');
  if (colorDot) colorDot.style.background = _bblSelColor || 'transparent';
}

function _bblOpenColorSheet() {
  _bblRenderColorGrid(_bblSelColor);
  const inp = $('bblColorInput'); if (inp) inp.value = _bblSelColor;
  $('bblColorSheet')?.classList.add('open');
  $('bblColorSheet')?.setAttribute('aria-hidden', 'false');
}
function _bblCloseColorSheet() {
  $('bblColorSheet')?.classList.remove('open');
  $('bblColorSheet')?.setAttribute('aria-hidden', 'true');
}
function _bblOpenFilamentSheet() {
  const search = $('bblMatSearch'); if (search) search.value = '';
  const matList = $('bblMaterialList');
  if (matList) matList.innerHTML = _bblRenderMaterialList('');
  $('bblFilamentSheet')?.classList.add('open');
  $('bblFilamentSheet')?.setAttribute('aria-hidden', 'false');
}
function _bblCloseFilamentSheet() {
  $('bblFilamentSheet')?.classList.remove('open');
  $('bblFilamentSheet')?.setAttribute('aria-hidden', 'true');
}

export async function openBambuFilamentEdit(printer, amsId, trayId) {
  const conn = _bambuConns.get(bambuKey(printer));
  if (!conn) return;
  _bblFilEdit = { printer, amsId, trayId };

  // Find existing slot data to pre-fill color & material
  let existingTray = null;
  if (amsId === 255) {
    existingTray = conn.data?.externalTray ?? null;
  } else {
    const mod = conn.data?.ams?.[amsId];
    existingTray = mod?.tray?.find(t => parseInt(t.id, 10) === trayId) ?? null;
  }

  const rawColor = existingTray?.color
    ? '#' + String(existingTray.color).slice(0, 6)
    : '#FF5722';
  _bblSelColor = rawColor;

  await _bblLoadMaterials();

  // Pre-select material by tray_type match
  const trayType = existingTray?.type || '';
  _bblSelMat = (_bblMatCache || []).find(m => m.label === trayType)
            || (_bblMatCache || []).find(m => m.tray_type === trayType)
            || _bblMatCache?.[0]
            || null;

  _bblCloseColorSheet();
  _bblCloseFilamentSheet();
  _bblUpdateSummary();

  $('bblFilEditSheet')?.classList.add('open');
  $('bblFilEditSheet')?.setAttribute('aria-hidden', 'false');
  $('bblFilEditBackdrop')?.classList.add('open');
}

export function closeBambuFilamentEdit() {
  $('bblFilEditSheet')?.classList.remove('open');
  $('bblFilEditSheet')?.setAttribute('aria-hidden', 'true');
  $('bblFilEditBackdrop')?.classList.remove('open');
  _bblCloseColorSheet();
  _bblCloseFilamentSheet();
}

// ── Filament sheet event listeners ────────────────────────────────────────

$('bblFilEditBackdrop')?.addEventListener('click', closeBambuFilamentEdit);
$('bblFilEditClose')?.addEventListener('click', closeBambuFilamentEdit);

$('bblColorTrigger')?.addEventListener('click', _bblOpenColorSheet);
$('bblMaterialTrigger')?.addEventListener('click', _bblOpenFilamentSheet);

$('bblColorBack')?.addEventListener('click', () => { _bblUpdateSummary(); _bblCloseColorSheet(); });
$('bblColorClose')?.addEventListener('click', () => { _bblUpdateSummary(); _bblCloseColorSheet(); });
$('bblFilamentBack')?.addEventListener('click', () => { _bblUpdateSummary(); _bblCloseFilamentSheet(); });
$('bblFilamentClose')?.addEventListener('click', () => { _bblUpdateSummary(); _bblCloseFilamentSheet(); });

$('bblColorGrid')?.addEventListener('click', e => {
  const custom = e.target.closest('#bblColorCustom');
  if (custom) { $('bblColorInput')?.click(); return; }
  const cell = e.target.closest('.sfe-color-cell:not(.sfe-color-cell--custom)');
  if (!cell) return;
  _bblSelColor = cell.dataset.color || _bblSelColor;
  _bblRenderColorGrid(_bblSelColor);
  // Auto-close after a brief visual confirmation (same as Snapmaker)
  setTimeout(() => { _bblUpdateSummary(); _bblCloseColorSheet(); }, 150);
});

$('bblColorInput')?.addEventListener('change', e => {
  // Native OS picker closed — commit and return to summary
  _bblSelColor = e.target.value;
  _bblRenderColorGrid(_bblSelColor);
  _bblUpdateSummary();
  _bblCloseColorSheet();
});

$('bblColorInput')?.addEventListener('input', e => {
  // Live preview while dragging the OS picker
  _bblSelColor = e.target.value;
  _bblRenderColorGrid(_bblSelColor);
  _bblUpdateSummary();
});

$('bblMaterialList')?.addEventListener('click', e => {
  const row = e.target.closest('[data-bbl-mat]');
  if (!row) return;
  try { _bblSelMat = JSON.parse(row.dataset.bblMat); } catch (_) { return; }
  const matList = $('bblMaterialList');
  if (matList) matList.innerHTML = _bblRenderMaterialList($('bblMatSearch')?.value || '');
  setTimeout(() => { _bblUpdateSummary(); _bblCloseFilamentSheet(); }, 180);
});

$('bblMatSearch')?.addEventListener('input', e => {
  const matList = $('bblMaterialList');
  if (matList) matList.innerHTML = _bblRenderMaterialList(e.target.value);
});

$('bblFilEditSave')?.addEventListener('click', () => {
  if (!_bblFilEdit || !_bblSelMat) return;
  const { printer, amsId, trayId } = _bblFilEdit;
  const conn = _bambuConns.get(bambuKey(printer));
  if (!conn) return;

  // Color: RRGGBBAA uppercase (add FF alpha)
  const hex6 = _bblSelColor.replace('#', '').toUpperCase().slice(0, 6);
  const trayColor = hex6 + 'FF';

  const isExt = amsId === 255;
  _publish(conn, {
    print: {
      sequence_id: _nextSeq(),
      command: 'ams_filament_setting',
      ams_id:  isExt ? 255 : amsId,
      tray_id: isExt ? 254 : trayId,
      slot_id: isExt ? 0   : trayId,
      tray_color:      trayColor,
      nozzle_temp_min: _bblSelMat.tempMin,
      nozzle_temp_max: _bblSelMat.tempMax,
      tray_type:       _bblSelMat.tray_type,
      tray_info_idx:   _bblSelMat.bambuID,
    },
  });

  // Optimistic local update
  const d = conn.data;
  if (isExt) {
    if (!d.externalTray) d.externalTray = {};
    d.externalTray.color = trayColor;
    d.externalTray.type  = _bblSelMat.label;
  } else {
    const mod = d.ams?.[amsId];
    if (mod?.tray) {
      const slot = mod.tray.find(t => parseInt(t.id, 10) === trayId);
      if (slot) { slot.tray_color = trayColor; slot.type = _bblSelMat.label; }
    }
  }

  closeBambuFilamentEdit();
});

// ── Self-registration ──────────────────────────────────────────────────────

registerBrand('bambulab', {
  meta, schema, helper,
  renderJobCard:        renderBambuJobCard,
  renderTempCard:       renderBambuTempCard,
  renderFilamentCard:   renderBambuFilamentCard,
  renderSettingsWidget: schemaWidget(schema),
});
