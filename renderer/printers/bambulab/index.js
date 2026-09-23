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
import { bambuModelIdFromCode } from './probe.js';

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

/* Reached through Bambu's cloud instead of the local network. `serialNumber`
   doubles as the cloud's `dev_id` — they are the same string.

   The record carries NO credentials: the account token, uid and region live once
   in `printers/bambulab/secrets/cloud_session`, read through
   `ctx.getBambuCloudSession()`. Unlike Anycubic, which denormalises its token
   onto every machine, nothing secret is written on a document meant to be
   displayed. See docs/bambu_connect_cloud.md §6. */
export function bambuIsCloud(p) { return p?.mode === "cloud"; }
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
      /* A CLOUD connection does not depend on the address at all — it runs on the
         account's broker, and the address is only ever used for the camera. So a
         cloud printer is "already connected" whatever its IP says, and an address
         that has just been learned can never be read as a different machine. */
      if (existing.ip === ip || existing.cloud) {
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
    /* Reached through Bambu's cloud rather than the local network. Everything
       downstream — parser, cards, controls — is shared; only the transport and
       the credential differ. */
    cloud:        bambuIsCloud(printer),
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
      printPreviewUrl: null,   // current print's model preview (data-URI), fetched via FTPS
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

  // Initiate the MQTT connection in the main process.
  if (conn.cloud) {
    /* Cloud mode: the broker belongs to the ACCOUNT, not to this machine, so the
       client is opened once (the call is idempotent) and this printer merely
       adds its own topic to it. Its telemetry comes back on the very same
       channel a LAN printer's does — see the cloud bridge in preload.js.
       The credentials are NOT on the printer: one account session serves every
       cloud machine, and a secret has no business sitting in a record meant to
       be displayed (docs/bambu_connect_cloud.md §6). */
    (async () => {
      const sess = await ctx.getBambuCloudSession?.();
      if (!sess?.accessToken || !sess?.bambuUid) {
        conn.status = "error:no-cloud-session";
        _bblNotify(conn, /*statusChanged*/ true);
        return;
      }
      if (!_bambuConns.has(key)) return;   // disconnected while we were reading
      window.bambulab?.cloud?.connect({
        uid: sess.bambuUid, token: sess.accessToken, region: sess.region,
      });
      window.bambulab?.cloud?.subscribe({ key, devId: serial });
    })();
  } else {
    window.bambulab?.connect({ key, ip, serial, password });
  }
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
  /* A cloud printer drops its topic; the account's client stays up for the
     others. Tearing the shared client down here would disconnect every other
     cloud machine along with this one. */
  if (conn.cloud) window.bambulab?.cloud?.unsubscribe({ devId: conn.serial });
  else            window.bambulab?.disconnect(key);
  _bambuConns.delete(key);
}

// ── MQTT publish ───────────────────────────────────────────────────────────

function _publish(conn, payload) {
  if (!conn) return;
  _bblLogPush(conn, "→", payload);
  if (conn.cloud) window.bambulab?.cloud?.publish({ devId: conn.serial, payload });
  else            window.bambulab?.publish(conn.key, payload);
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

/* Debug handle. The driver's live state is module-private, so when a machine
   misbehaves there is no way to ask it what it actually holds — every diagnosis
   becomes guesswork about code that looks correct. Read-only, costs nothing. */
if (typeof window !== "undefined") window.__bbl = { conns: _bambuConns };

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

  /* The account's broker reports once for every cloud printer at once, so the
     LAN init sequence is run per cloud connection when it comes up. The main
     process already asks for a full state on subscribe; what is added here is
     the version query and the refresh schedule, so a cloud machine behaves
     exactly like a local one. */
  window.bambulab.cloud?.onStatus?.((status) => {
    if (status !== "connected") return;
    for (const conn of _bambuConns.values()) {
      if (!conn.cloud) continue;
      conn.lastError = null;
      _publish(conn, { info: { sequence_id: _nextSeq(), command: "get_version" } });
      _scheduleRefresh(conn);
    }
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

/* Only STRING candidates count. `print.state` is a NUMBER on this firmware
   (7 on the X1C), and calling `.toLowerCase()` on it threw — from the very first
   line of the merge, so nothing after it ran: no temperatures, no AMS, no job.
   The board then showed the external spool alone, and the layer that stores
   units believed it and wrote the AMS down as absent, in Firestore, for good.
   It only fires when the printer reports FAILED or ERROR, which is why it lay
   dormant for months and surfaced the day a print failed. */
function _pickState(...vals) {
  for (const v of vals) if (typeof v === "string" && v) return v.toLowerCase();
  return "";
}

function _normState(p) {
  const raw = _pickState(p.gcode_state, p.print_type, p.state, p.status);
  // No state field present in this message — return null so the caller
  // doesn't overwrite an existing valid state with a false "idle".
  if (!raw) return null;
  if (["failed", "failure", "error"].includes(raw)) {
    const alt = _pickState(p.print_type, p.state, p.status);
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

// Bambu print states that count as "an active job" (mirror of inventory.js
// _ACTIVE_STATES for the values _normState can emit).
const _BBL_ACTIVE = new Set(["printing", "preparing", "busy", "paused"]);

// Fetch the current print's model preview via FTPS (main process, PROTOCOL.md §11).
// Throttled: at most one fetch per (file, plate) key, retried every ~10 s until it
// lands. Needs an address and an access code — which a CLOUD printer now has too,
// having learned the first from its telemetry and been handed the second by the
// cloud, so its preview works whenever it is on the same network as you. On success the
// data-URI is stored on conn.data.printPreviewUrl and the UI is re-rendered.
/* The plate image for a CLOUD printer, from the account's task list.
   The local route is FTPS straight to the machine, which is unreachable the
   moment you are not on its network — so a cloud printer, whose whole point is
   reporting from anywhere, had no preview at all outside the house.

   The list is the ACCOUNT's most recent tasks, not this machine's current one,
   so it is filtered by device and then narrowed: the job's own name first, since
   we already know it from telemetry, and the most recently started otherwise.
   Taking the first match would eventually show a previous print. */
function _bblFetchCloudCover(conn) {
  if (!conn?.cloud || !conn.serial) return;
  const now = Date.now();
  if (conn._coverAt && now - conn._coverAt < 15000) return;   // the list is the whole account's
  conn._coverAt = now;

  (async () => {
    const sess = await ctx.getBambuCloudSession?.();
    if (!sess?.accessToken) return;
    const res = await window.bambulab?.cloud?.tasks({ token: sess.accessToken, region: sess.region });
    if (!res?.ok || !res.hits?.length) return;

    const mine = res.hits.filter(t => String(t?.deviceId || "") === String(conn.serial));
    if (!mine.length) return;
    const wanted = conn.data?.printFilename || "";
    const byName = wanted && mine.find(t => String(t?.title || "") === wanted);
    const latest = mine.slice().sort((a, b) =>
      String(b?.startTime || "").localeCompare(String(a?.startTime || "")))[0];

    const task = byName || latest;
    if (!task || !_bambuConns.has(conn.key)) return;

    /* The name comes from the cloud too. Telemetry names the job only while it
       runs; the task list names it afterwards, which is exactly when the card
       would otherwise have nothing to say. A running job's own name wins — it is
       the more immediate truth. */
    let changed = false;
    /* Compared by SOURCE URL, not by what is stored: what is stored is the
       decoded image, so comparing the two would re-fetch on every pass. */
    if (task.cover && conn._coverUrl !== task.cover) {
      /* Decoded bytes are preferred — they survive a redraw without blinking —
         but the URL itself is a working image. Falling back to it means the
         worst case is the flicker we set out to remove, never a blank card:
         degrading to "works, imperfectly" beats degrading to nothing. */
      let img = null;
      try { img = await window.bambulab?.cloud?.cover({ url: task.cover }); } catch (_) {}
      if (!_bambuConns.has(conn.key)) return;
      conn._coverUrl = task.cover;
      conn.data.printPreviewUrl = (img?.ok && img.dataUri) ? img.dataUri : task.cover;
      changed = true;
    }
    const title = String(task.title || "").trim();
    if (title && !_BBL_ACTIVE.has(conn.data.printState) && conn.data.printFilename !== title) {
      conn.data.printFilename = title; changed = true;
    }
    if (changed) _bblNotify(conn);
  })().catch(() => {});
}

function _bblFetchThumbnail(conn, rawFile, plateIdx) {
  if (!window.bambulab?.fetchThumbnail || !conn?.ip || !conn?.password || !rawFile) return;
  const key = `${rawFile}|${plateIdx ?? ""}`;
  if (conn._thumbKey === key && conn.data.printPreviewUrl) return; // already have it
  if (conn._thumbInFlight) return;
  const now = Date.now();
  if (conn._thumbTryKey === key && now - (conn._thumbTryAt || 0) < 10000) return; // retry throttle
  conn._thumbTryKey = key; conn._thumbTryAt = now; conn._thumbInFlight = true;
  window.bambulab.fetchThumbnail({ ip: conn.ip, accessCode: conn.password, fileHint: rawFile, plateIdx })
    .then((res) => {
      conn._thumbInFlight = false;
      if (res?.ok && res.dataUri) {
        conn._thumbKey = key;
        conn.data.printPreviewUrl = res.dataUri;
        _bblNotify(conn);
      }
    })
    .catch(() => { conn._thumbInFlight = false; });
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

  // Filename (first non-empty field wins). Keep the RAW path too — it's the FTPS
  // hint for the thumbnail fetch (exact name looked up in /model, then /cache, /).
  /* The PROJECT name first, not the gcode path. `gcode_file` is a path INSIDE
     the archive — `/data/Metadata/plate_1.gcode` — while the `.3mf` sitting on
     the printer is named after the job: `TigerPod_Mini_A1.3mf`. Hinting with the
     former made the thumbnail lookup search for `plate_1.3mf`, which exists
     nowhere, so no preview was ever found; and it put `plate_1.gcode` on the
     card where Bambu's own app shows the project's name. */
  const fn = p.subtask_name || p.gcode_file || p.project_file
           || p.project_name || p.filename || p.task_name || p.ipcam?.file_name;
  if (fn) {
    try { d.printFilename = decodeURIComponent(String(fn).split("/").pop()); }
    catch { d.printFilename = String(fn).split("/").pop(); }
  }
  // Plate index (which plate_N.png to pull from the .3mf).
  const plate = p.plate_idx ?? p.plate_index ?? p.cur_plate;
  if (plate != null && Number.isFinite(+plate)) d.plateIdx = +plate;

  // Model preview (FTPS → .3mf): fetch once per file while a job is active OR
  // finished — the finished plate keeps showing "what just printed" (the .3mf
  // stays in /model until the next job). Only drop it once the printer goes back
  // to idle (plate cleared) or the job failed/errored. The table + side card
  // read conn.data.printPreviewUrl.
  if (fn && (_BBL_ACTIVE.has(d.printState) || d.printState === "finished")) {
    if (!conn.cloud) _bblFetchThumbnail(conn, fn, d.plateIdx);
  } else if (d.printState === "idle" || d.printState === "failed" || d.printState === "error") {
    /* A LAN printer loses its preview when it goes quiet: the .3mf it was read
       from stays only until the next job, so keeping the image would eventually
       be a lie. A CLOUD printer keeps it — the account's task list still holds
       what it last made, so there is nothing to go stale, and an idle card that
       shows its last print reads better than a stock photo. */
    if (!conn.cloud && d.printPreviewUrl) { d.printPreviewUrl = null; conn._thumbKey = null; }
  }
  /* Asked for whatever the machine is doing, precisely so an idle one still has
     something to show. FTPS could not do this — it reads the job on the printer
     — but the cloud remembers. */
  if (conn.cloud) _bblFetchCloudCover(conn);

  /* A cloud printer tells us where it lives. The cloud handed over its access
     code and its serial when it was added; the address is the one thing missing,
     and the machine reports it itself — so a printer added with nothing but an
     email ends up with everything one added by hand on the network has, and its
     camera comes up without a single question asked. Done once per connection:
     the address is worth a Firestore write when it is learned, not on every
     status push. */
  /* Correct the model once the machine has spoken. A printer whose catalogue
     entry never resolved shows a "?" for a picture and would be given the wrong
     kind of camera; the serial says what it is, and the mechanism to write it
     back already exists for the add-by-IP flow that cannot identify a model
     either. Once, and only when it is genuinely unset. */
  if (!conn._modelFixed) {
    conn._modelFixed = true;
    const printer = ctx.getState?.().printers?.find(x => bambuKey(x) === conn.key);
    if (printer && (!printer.printerModelId || printer.printerModelId === "0")) {
      const resolved = bambuModelIdFromCode(printer.modelCode, conn.serial);
      if (resolved && resolved !== "0") ctx.updatePrinterModel?.(printer, resolved);
    }
  }

  if (conn.cloud) {
    const found = _bblIpFromTelemetry(p);
    /* Compared on EVERY report, not adopted once: a printer's address is a DHCP
       lease, and it changes. Adopting it a single time meant the day the router
       handed out a different one, the stored address went stale for good and the
       camera stayed broken — nothing would ever look again. The comparison is a
       string compare against what we already hold, so the steady state costs
       nothing and only a real change does any work. */
    if (found && found !== conn.ip) _bblAdoptLanAddress(conn, found);
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

  /* `msg: 0` is a complete state, `msg: 1` a delta (validated on an X1C, both
     over LAN and cloud). Some firmwares omit the field, so an AMS block is taken
     as proof of a full picture too. */
  if (msg.print?.msg === 0 || p.ams?.ams) conn._sawFullState = true;

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

/* Where the printer lives, read from its own telemetry. Two sources, in order
   of trust: the camera URL it advertises, which carries the address literally,
   and failing that its network block — where the address is a LITTLE-ENDIAN
   integer, so the first byte of the address is the low byte of the number. */
function _bblIpFromTelemetry(p) {
  const url = p?.ipcam?.rtsp_url;
  if (typeof url === "string" && url !== "disable") {
    const m = /rtsps?:\/\/(?:[^@/]*@)?(\d{1,3}(?:\.\d{1,3}){3})/.exec(url);
    if (m) return m[1];
  }
  const n = p?.net?.info?.[0]?.ip;
  if (typeof n === "number" && n > 0) {
    return `${n & 255}.${(n >> 8) & 255}.${(n >> 16) & 255}.${(n >>> 24) & 255}`;
  }
  return null;
}

/* Adopt the address: remember it, fetch the access code the cloud filed away
   when this printer was added, persist the pair so it survives a restart, and
   start the camera — which could not run before for want of exactly these two
   values. The printer keeps talking over the cloud; what it gains is everything
   local that needs an address. */
async function _bblAdoptLanAddress(conn, ip) {
  const moved = !!conn.ip && conn.ip !== ip;
  conn.ip = ip;                 // set FIRST: the next report must see it and stay quiet
  /* The stream points at the old address, so it is torn down before the new one
     starts — otherwise the camera keeps failing against a machine that is no
     longer there. */
  if (moved) {
    window.bambulab?.camStop(conn.key);
    window.bambulab?.camStopRtsp(conn.key);
  }
  const printer = ctx.getState?.().printers?.find(x => bambuKey(x) === conn.key);
  /* Written only when it differs from the record — the address is re-derived on
     every report, and writing an unchanged value would be one Firestore write
     per status push. */
  if (printer && (printer.broker || "") !== ip) ctx.saveBambuLanAddress?.(printer, ip);

  /* Repair a record written before the access code moved onto the machine's own
     document: it was filed apart at first, which left the settings form showing
     an empty required field. Read it back once and put it where it belongs. */
  if (!conn.password) {
    const secret = await ctx.getBambuDeviceSecret?.(conn.serial);
    if (secret?.devAccessCode) {
      conn.password = secret.devAccessCode;
      if (printer) ctx.saveBambuAccessCode?.(printer, secret.devAccessCode);
    }
  }
  if (!conn.password || conn.data?.camDisabled) return;
  if (!_bambuConns.has(conn.key)) return;      // disconnected while we were reading
  if (bambuUsesJpegCam(printer || { printerModelId: "0" })) {
    window.bambulab?.camStart({ key: conn.key, ip, password: conn.password });
  } else {
    window.bambulab?.camStartRtsp({ key: conn.key, ip, password: conn.password });
  }
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
    // By id, not by array position — an AMS HT is id 128 in a 3-module list.
    const mod = (conn.data?.ams || []).find(m => Number(m.id) === amsId);
    existingTray = mod?.tray?.find(t => parseInt(t.id, 10) === trayId) ?? null;
  }

  // `_parseColor` already returns "#RRGGBB", so prefixing another "#" made
  // "##2850E" — an invalid colour that the picker silently turns into black and
  // that paints no swatch at all. Strip whatever "#" is there, keep six hex.
  const hex6 = String(existingTray?.color || '').replace(/^#/, '').slice(0, 6);
  _bblSelColor = /^[0-9a-fA-F]{6}$/.test(hex6) ? '#' + hex6.toUpperCase() : '#FF5722';

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

  // NO optimistic local update. What a slot holds is the PRINTER's to state,
  // not ours to guess: the request above can be refused, land on another slot,
  // or be overridden by the machine, and a swatch that changed on click would
  // then be showing something that was never true. The display follows the
  // machine's own report, and only that — it arrives within a second or two.
  //
  // Predicting it here is what an earlier version did, badly enough that it had
  // no visible effect at all (it wrote the wire's `tray_color` into a shape that
  // reads `.color`); repairing that mechanism was the wrong call — the mechanism
  // should not exist.

  closeBambuFilamentEdit();
});

// ── Self-registration ──────────────────────────────────────────────────────


/* ── Feed slots, normalised ───────────────────────────────────────────────
   What the machine is holding, in the ONE shape the rest of the app reads:
   `[{ key, label, color, material, vendor, empty }]`. Every brand keeps its
   own wire format — an AMS tray, a CFS material, an ACE slot and a tool-changer
   nozzle are all different objects — and until now each one was unpacked inline,
   inside the markup of its own filament card. That made the slots impossible to
   show anywhere else without copying the unpacking with it.
   Empty while disconnected: these describe what is loaded RIGHT NOW. */
export function bambuGetSlots(printer) {
  const conn = _bambuConns.get(bambuKey(printer));
  if (!conn || conn.status !== 'connected') return [];
  const d = conn.data || {};
  const slot = (key, label, t) => ({
    key, label,
    color: t?.color || null,
    material: t?.type || null,
    vendor: t?.vendor || t?.brand || null,
    empty: !t?.color && !t?.type,
  });
  /* The spool holder on the side of the machine is NOT part of any AMS — it is
     its own object, and reading only the AMS modules dropped it silently. It
     comes first here, exactly as it does on the machine's own panel. */
  const out = [slot('ext', 'Ext.', d.externalTray ?? null)];
  const mods = [...(d.ams || [])].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  mods.forEach((m, mi) => {
    // Four bays per unit, ONE for an AMS HT — the same count `bambuGetUnits`
    // derives from the module's own tray list, so the board and the units it
    // draws cannot disagree. A module reports only the trays it has seen, so
    // the loop indexes rather than maps: a short list would renumber the bays
    // after a gap.
    const bays = (m?.tray || []).length === 1 ? 1 : 4;
    for (let ti = 0; ti < bays; ti++) {
      const t = (m?.tray || [])[ti] ?? null;
      out.push(slot(`ams${m?.id ?? mi}:${t?.id ?? ti}`, `${'ABCDEFGH'[mi] || mi + 1}${ti + 1}`, t));
    }
  });
  return out;
}


/* ── Storage units ────────────────────────────────────────────────────────
   One rule for the whole range: every Bambu speaks the same MQTT, so an A1, a
   P2, an X1 or an H2 needs no special case here. */
export function bambuGetUnits(printer) {
  const conn = _bambuConns.get(bambuKey(printer));
  if (!conn || conn.status !== 'connected') return [];
  const d = conn.data || {};
  /* TWO ways to be allowed to answer, and one of them is required.
     Either we HOLD AMS data — then it exists, say so — or we have seen a FULL
     state, which is the only thing that makes "there is no AMS" a fact rather
     than an assumption.

     Anything else stays silent, and that silence matters: a printer sends one
     complete picture and then DELTAS, and a delta carries no filament. A
     connection questioned in between would answer with the external spool alone,
     which reads as authoritative — and the layer above PERSISTS what it is told,
     writing `present: false` onto the AMS in Firestore, where it survives every
     reload. The stored record is shown meanwhile, marked stale. */
  if (!d.ams?.length && !conn._sawFullState) return [];
  const slot = (label, t, hw) => ({
    label, hw,
    color: t?.color || null,
    material: t?.type || null,
    vendor: t?.vendor || t?.brand || null,
    empty: !t?.color && !t?.type,
  });
  const units = [{
    kind: 'ext', index: 0, label: '', hwId: null, rows: 1, cols: 1,
    // 255/254 is how Bambu addresses the spool holder on the side.
    slots: [{ ...slot('Ext.', d.externalTray ?? null, { amsId: 255, trayId: 254 }), index: 0 }],
  }];
  const mods = [...(d.ams || [])].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  mods.forEach((m, mi) => {
    // An AMS HT holds one spool; every other unit holds four. The module tells
    // us which by how many trays it carries.
    const n = (m?.tray || []).length === 1 ? 1 : 4;
    const amsId = Number(m?.id ?? mi);
    units.push({
      kind: n === 1 ? 'amsHt' : 'ams', index: mi, label: '',
      // The AMS's own id — what makes the same physical box recognisable after
      // a reconnect, however the user reorders them.
      hwId: m?.id != null ? String(m.id) : null,
      rows: 1, cols: n,
      slots: Array.from({ length: n }, (_, ti) => ({
        ...slot(`${'ABCDEFGH'[mi] || mi + 1}${ti + 1}`, (m?.tray || [])[ti] ?? null,
                { amsId, trayId: ti }),
        index: ti,
      })),
    });
  });
  return units;
}


/* ── Temperature, for the board ───────────────────────────────────────────
   The machine's own temperature card, rendered as-is. Reusing it rather than
   normalising into a seventh shape is deliberate: the pills already carry the
   current/target pair, the heating state and the active-tool highlight, and a
   parallel version would drift from the panel the first time either changed.
   Read-only on the board — the setpoint editors are the panel's. */
/* Cloud = look, don't touch. Measured on an X1C: of everything published
   through the account broker only the light answers, and a refused command is
   never reported back — so a control that cannot work must not be drawn. The
   cards decide this themselves; the board asks through the registry. */
export function bambuIsReadOnly(printer) {
  return _bambuConns.get(bambuKey(printer))?.cloud === true;
}

export function bambuGetTempHtml(printer) {
  const conn = _bambuConns.get(bambuKey(printer));
  if (!conn || conn.status !== 'connected') return "";
  // Same chamber rule the panel applies: only the actively-heated models get an
  // editable setpoint, and passing it keeps the two views telling one story.
  const heatedChamber = [6, 7, 8, 9, 11, 12].includes(bambuModelId(printer));
  return renderBambuTempCard(conn, heatedChamber);
}

registerBrand('bambulab', {
  /* Pause / resume / stop THIS printer, named explicitly. The panel's own
     buttons reach the same code through `_activePrinter` — the machine whose
     panel is open — which is right there and wrong anywhere else: the board
     shows every machine at once, so a card has to say which one it means. */
  controlJob: (p, a) => { const c = bambuGetConn(bambuKey(p)); if (c) bambuPrintControl(c, a); },
  /* A cloud connection accepts no command but the light, so the views that
     offer job controls ask before drawing them. Optional on a brand: a driver
     that never says so is treated as controllable, which every LAN one is. */
  isReadOnly:           bambuIsReadOnly,
  getTempHtml:          bambuGetTempHtml,
  getUnits:             bambuGetUnits,
  getSlots:             bambuGetSlots,
  meta, schema, helper,
  renderJobCard:        renderBambuJobCard,
  renderTempCard:       renderBambuTempCard,
  renderFilamentCard:   renderBambuFilamentCard,
  renderSettingsWidget: schemaWidget(schema),
});
