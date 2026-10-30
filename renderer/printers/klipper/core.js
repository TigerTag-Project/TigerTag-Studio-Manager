/**
 * printers/klipper/core.js — Klipper plugin, connection core.
 *
 * Any printer running Klipper + Moonraker, whatever the brand. Everything goes
 * through this plugin's own main-process side (main.cjs) — Moonraker wants CORS
 * origins and may want an API key header:
 *
 *   once   GET  /server/info          klippy_state, components (spoolman?)
 *          GET  /printer/info         hostname, Klipper version
 *          GET  /machine/system_info  stable identity (serial)
 *          GET  /printer/objects/list FEATURE DETECTION: extruders, Happy Hare
 *                                     `mmu`, AFC lanes, chamber sensor
 *          GET  /server/webcams/list  camera
 *   2 s    POST /printer/objects/query { objects: … }  (Home Assistant polls too)
 *   on a new file  GET /server/files/metadata → estimate + thumbnail
 *
 * Filament: one adapter per multi-material system, chosen from the object
 * list — Happy Hare (`mmu` gate lists), AFC (`AFC` + one object per lane), or
 * the plain extruders. Writes are G-code macros (MMU_GATE_MAP, AFC SET_*).
 * Reference: ./PROTOCOL.md. Self-contained: imports host services only.
 */
import { ctx } from '../context.js';
import { ensurePrinterIdentity } from '../identity.js';
import { extraTemperatureObjects, readTemperatureSensors } from './temperature-sensors.js';

export const BRAND = "klipper";
const POLL_MS = 2000;
const PING_EVERY_MS = 30_000;

const _conns = new Map();   // key → live connection (never persisted)
const _pings = new Map();   // key → { online, lastChecked }

export const klipperKey = p => `${p.brand}:${p.id}`;
export const klipperGetConn = p => _conns.get(typeof p === "string" ? p : klipperKey(p)) ?? null;
export const allConns = () => [..._conns.values()];

// ── Transport (main.cjs through the generic plugin bridge) ─────────────────
function bridge() { return window.printerPlugin?.invoke ? window.printerPlugin : null; }

export function hostOf(printer) {
  const raw = String(printer?.ip || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!raw) return null;
  const port = Number(printer?.port) || null;
  return /:\d+$/.test(raw) || !port ? raw : `${raw}:${port}`;
}

/** One Moonraker request. Never throws. → { ok, status, result, error } */
export async function klipperHttp(printer, method, path, extra = {}) {
  const b = bridge();
  const host = hostOf(printer);
  if (!b) return { ok: false, status: 0, error: "bridge unavailable (restart the app)" };
  if (!host) return { ok: false, status: 0, error: "no IP" };
  try {
    return await b.invoke(BRAND, "http", { host, method, path, apiKey: String(printer.apiKey || ""), ...extra });
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  }
}

export async function klipperProbe(host, timeoutMs = 2500) {
  const b = bridge();
  if (!b || !host) return null;
  try { return await b.invoke(BRAND, "probe", host, timeoutMs); } catch (_) { return null; }
}

// ── Online state ────────────────────────────────────────────────────────────
export function klipperIsOnline(printer) {
  if (printer?.brand !== BRAND) return null;
  const k = klipperKey(printer);
  if (ctx.isForcedOffline?.(k)) return false;
  const conn = _conns.get(k);
  if (conn) return conn.status === "connected";
  const ping = _pings.get(k);
  return ping ? ping.online : null;
}

/** Reachability only — no credential leaves. */
export async function klipperPing(printer) {
  if (!printer || printer.brand !== BRAND) return;
  const host = hostOf(printer);
  if (!host) return;
  const k = klipperKey(printer);
  const cached = _pings.get(k);
  const now = Date.now();
  if (cached && now - cached.lastChecked < PING_EVERY_MS) return;
  _pings.set(k, { online: cached?.online ?? null, lastChecked: now });
  const r = await klipperProbe(host, 2500);
  _pings.set(k, { online: !!r?.moonraker, lastChecked: now });
  emit("online", k);
}
setInterval(() => {
  for (const p of ctx.getState?.()?.printers || []) if (p.brand === BRAND && p.ip) klipperPing(p);
}, PING_EVERY_MS);

// ── Change listeners (the plugin's UI files subscribe; the core knows no DOM) ─
const _listeners = new Set();
export function onKlipperChange(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }
function emit(kind, key, extra) { for (const fn of _listeners) { try { fn(kind, key, extra); } catch (_) {} } }

// ── Connection lifecycle ────────────────────────────────────────────────────
export function klipperConnect(printer) {
  const key = klipperKey(printer);
  const existing = _conns.get(key);
  if (existing && existing.intervalId && existing.host === hostOf(printer) && existing.apiKey === (printer.apiKey || "")) {
    existing.printer = printer;
    return;
  }
  if (existing) klipperDisconnect(key);
  const conn = {
    key, printer, host: hostOf(printer), apiKey: printer.apiKey || "",
    status: "connecting",            // connecting | connected | offline | error
    lastError: null, retry: 0, retryTimer: null, intervalId: null,
    ready: false,                    // feature detection done
    features: { extruders: ["extruder"], mmu: false, afcLanes: [], afcObjs: {}, chamber: null, sensors: [], lights: [], spoolman: false, fanMaxPower: 1 },
    camera: null,
    metaFor: null, thumbFor: null,
    log: [],
    data: {
      klippyState: null, stateMessage: null, hostname: null, version: null,
      printState: null, progress: 0, printFilename: null, printDuration: 0, printEstimated: null,
      currentLayer: null, totalLayer: null, printPreviewUrl: null,
      temps: { tools: [], bed: null, bedTarget: null, chamber: null },
      fanPct: null, speedPct: null, activeTool: null, activeSpoolId: null,
      pos: null, homed: "", lights: [],
      filaments: [], slotSystem: "ext",
    },
  };
  _conns.set(key, conn);
  pollOnce(conn);
  conn.intervalId = setInterval(() => pollOnce(conn), POLL_MS);
  emit("status", key);
}

export function klipperDisconnect(keyOrPrinter) {
  const key = typeof keyOrPrinter === "string" ? keyOrPrinter : klipperKey(keyOrPrinter);
  const conn = _conns.get(key);
  if (!conn) return;
  if (conn.intervalId) clearInterval(conn.intervalId);
  if (conn.retryTimer) clearTimeout(conn.retryTimer);
  _conns.delete(key);
  emit("status", key);
}

export function klipperDisconnectAll() { for (const k of [..._conns.keys()]) klipperDisconnect(k); }

function scheduleReconnect(conn) {
  if (conn.retryTimer || !_conns.has(conn.key)) return;
  if (conn.intervalId) { clearInterval(conn.intervalId); conn.intervalId = null; }
  conn.retry = Math.min(conn.retry + 1, 5);
  if (conn.retry >= 3) ctx.requestPrinterRefind?.(BRAND, conn.key);
  const delay = Math.min(2000 * (1 << (conn.retry - 1)), 30000);
  conn.retryTimer = setTimeout(() => {
    conn.retryTimer = null;
    if (!_conns.has(conn.key)) return;
    pollOnce(conn);
    if (!conn.intervalId && _conns.has(conn.key)) conn.intervalId = setInterval(() => pollOnce(conn), POLL_MS);
  }, delay);
}

// ── Debug request log (shown in debug mode) ─────────────────────────────────
const LOG_MAX = 100;
function logPush(conn, dir, raw, summary) {
  if (!conn) return;
  const ts = new Date().toLocaleTimeString([], { hour12: false });
  conn.log.push({ dir, ts, summary: summary || "", raw: typeof raw === "string" ? raw : JSON.stringify(raw) });
  if (conn.log.length > LOG_MAX) conn.log.splice(0, conn.log.length - LOG_MAX);
}
async function call(conn, method, path, extra) {
  logPush(conn, "→", { method, path, body: extra?.body }, `${method} ${path}`);
  const res = await klipperHttp(conn.printer, method, path, extra);
  const shown = extra?.binary ? { ...res, data: res.data ? `(${res.data.length} b64 chars)` : undefined } : res;
  logPush(conn, "←", shown, `${res.status || "—"} ${path.split("?")[0]}${res.error ? `  ${String(res.error).slice(0, 60)}` : ""}`);
  return res;
}

// ── Feature detection ───────────────────────────────────────────────────────
async function detect(conn) {
  const [srv, pinfo, sys, objs, cams] = await Promise.all([
    call(conn, "GET", "/server/info"),
    call(conn, "GET", "/printer/info"),
    call(conn, "GET", "/machine/system_info"),
    call(conn, "GET", "/printer/objects/list"),
    call(conn, "GET", "/server/webcams/list"),
  ]);
  if (!srv.ok) return srv;
  const d = conn.data, f = conn.features;
  d.klippyState = srv.result?.klippy_state || null;
  f.spoolman = (srv.result?.components || []).includes("spoolman");
  d.hostname = pinfo.result?.hostname || null;
  d.version = pinfo.result?.software_version || null;
  d.stateMessage = pinfo.result?.state_message || null;
  const names = Array.isArray(objs.result?.objects) ? objs.result.objects : [];
  f.extruders = names.filter(n => /^extruder\d*$/.test(n)).sort((a, b) => (Number(a.slice(8)) || 0) - (Number(b.slice(8)) || 0));
  if (!f.extruders.length) f.extruders = ["extruder"];
  f.mmu = names.includes("mmu");
  // One slot per AFC lane. A unit may publish the same lane twice — `AFC_stepper
  // <lane>` and `AFC_lane <lane>` (a CANVAS on an OpenCentauri CC1 does, which
  // drew every lane twice): the `AFC_lane` object wins, in the order first met.
  f.afcLanes = []; f.afcObjs = {};
  for (const n of names) {
    const m = n.match(/^(AFC_stepper|AFC_lane) (\S+)$/);
    if (!m) continue;
    if (!(m[2] in f.afcObjs)) f.afcLanes.push(m[2]);
    if (!(m[2] in f.afcObjs) || m[1] === "AFC_lane") f.afcObjs[m[2]] = n;
  }
  f.chamber = ["heater_generic chamber", "temperature_sensor chamber"].find(n => names.includes(n))
           || names.find(n => /^(heater_generic|temperature_sensor) .*chamber/i.test(n)) || null;
  f.sensors = names.filter(n => /^filament_(switch|motion)_sensor /.test(n));
  f.temperatureSensors = extraTemperatureObjects(names, f.chamber);
  // Lights: an LED chain (led / neopixel / dotstar / pca9632…), or a plain pin
  // whose name says it is one (caselight, chamber_light, lamp…).
  f.lights = names.filter(n => /^(led|neopixel|dotstar|pca9533|pca9632) \S+$/.test(n)
                            || /^output_pin \S*(light|led|lamp)\S*$/i.test(n))
    .map(n => ({ obj: n, kind: n.startsWith("output_pin ") ? "pin" : "led", name: n.split(" ")[1] }));
  d.slotSystem = f.mmu ? "mmu" : f.afcLanes.length ? "afc" : "ext";
  const cam = (cams.result?.webcams || []).find(c => c.enabled !== false) || null;
  conn.camera = cam ? {
    name: cam.name || "", service: cam.service || "",
    stream: absUrl(conn, cam.stream_url), snapshot: absUrl(conn, cam.snapshot_url),
    flipH: !!cam.flip_horizontal, flipV: !!cam.flip_vertical, rotation: Number(cam.rotation) || 0,
    fps: Number(cam.target_fps) || 0,
  } : null;
  // Klipper reports `fan.speed` AFTER the `[fan] max_power` ceiling (M106 S255 with max_power 0.8 reads 0.8);
  // Mainsail shows it as a share of that ceiling, and so does the panel. No readable ceiling = 1.
  const cfg = await call(conn, "POST", "/printer/objects/query", { body: { objects: { configfile: ["settings"] } } });
  const ceiling = Number(cfg.result?.status?.configfile?.settings?.fan?.max_power);
  f.fanMaxPower = ceiling > 0 && ceiling <= 1 ? ceiling : 1;
  // Stable identity (ARP MAC) for a re-find after a DHCP change (printers/refind.js).
  d.serial = sys.result?.system_info?.cpu_info?.serial_number || null;
  try { ensurePrinterIdentity(BRAND, conn.key, String(conn.host || "").replace(/:\d+$/, "")); } catch (_) {}
  conn.ready = d.klippyState === "ready";
  return srv;
}

/** A camera URL may be relative ("/webcam/?action=stream" — nginx, port 80). */
function absUrl(conn, u) {
  const s = String(u || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const hostOnly = String(conn.host || "").replace(/:\d+$/, "");
  return `http://${hostOnly}${s.startsWith("/") ? "" : "/"}${s}`;
}

function queryObjects(conn) {
  const f = conn.features;
  const o = {
    webhooks: ["state", "state_message"],
    print_stats: ["state", "filename", "print_duration", "info", "message"],
    display_status: ["progress"],
    virtual_sdcard: ["progress", "is_active"],
    heater_bed: ["temperature", "target"],
    toolhead: ["extruder", "position", "homed_axes"],
    fan: ["speed"],
    gcode_move: ["speed_factor"],
  };
  for (const e of f.extruders) o[e] = ["temperature", "target"];
  if (f.chamber) o[f.chamber] = ["temperature", "target"];
  for (const name of f.temperatureSensors || []) o[name] = name.startsWith("temperature_sensor ") ? ["temperature"] : ["temperature", "target"];
  for (const l of f.lights) o[l.obj] = l.kind === "pin" ? ["value"] : ["color_data"];
  if (f.mmu) o.mmu = ["num_gates", "gate", "tool", "gate_status", "gate_material", "gate_color", "gate_spool_id", "ttg_map"];
  if (f.afcLanes.length) {
    o.AFC = ["current_lane"];
    for (const l of f.afcLanes) o[f.afcObjs[l]] = ["map", "material", "color", "spool_id", "weight", "load", "prep", "tool_loaded", "status", "filament_name"];
  }
  return o;
}

// ── Poll ────────────────────────────────────────────────────────────────────
const _warned = new Set();
function warnOnce(conn, kind, msg) {
  const sig = `${conn.key}:${kind}`;
  if (_warned.has(sig)) return;
  _warned.add(sig);
  try { ctx.toast?.(msg, "error"); } catch (_) {}
}
function clearWarnings(key) { for (const s of [..._warned]) if (s.startsWith(key + ":")) _warned.delete(s); }

async function pollOnce(conn) {
  if (!_conns.has(conn.key) || conn.polling) return;
  conn.polling = true;
  const prev = conn.status;
  try {
    if (!conn.ready) {
      const r = await detect(conn);
      if (!_conns.has(conn.key)) return;
      if (r.status === 401 || r.status === 403) return fail(conn, "error", "auth", prev, () => warnOnce(conn, "auth", ctx.t("klipperErrAuth")));
      if (!r.ok) return fail(conn, "offline", r.error || `HTTP ${r.status}`, prev, () => scheduleReconnect(conn));
      if (!conn.ready) {
        // Moonraker answers but Klippy is not ready (startup / error / shutdown).
        conn.status = "connected";
        conn.retry = 0;
        emit("status", conn.key);
        return;
      }
    }
    const res = await call(conn, "POST", "/printer/objects/query", { body: { objects: queryObjects(conn) } });
    if (!_conns.has(conn.key)) return;
    if (res.status === 401 || res.status === 403) return fail(conn, "error", "auth", prev, () => warnOnce(conn, "auth", ctx.t("klipperErrAuth")));
    if (!res.ok || !res.result?.status) {
      // A Klippy restart answers with an error: re-detect on the next tick.
      if (res.status >= 400 && res.status < 500) { conn.ready = false; return; }
      return fail(conn, "offline", res.error || `HTTP ${res.status}`, prev, () => scheduleReconnect(conn));
    }
    conn.retry = 0;
    if (prev !== "connected") clearWarnings(conn.key);
    conn.status = "connected";
    conn.lastError = null;
    merge(conn, res.result.status);
    await refreshFileMeta(conn);
    emit(prev !== "connected" ? "status" : "data", conn.key);
  } finally {
    conn.polling = false;
  }
}

function fail(conn, status, why, prev, then) {
  conn.status = status;
  conn.lastError = why;
  then?.();
  emit(prev !== status ? "status" : "data", conn.key);
}

const num = v => (typeof v === "number" && isFinite(v) ? v : null);
const STATE = { standby: "idle", printing: "printing", paused: "paused", complete: "complete", cancelled: "cancelled", error: "error" };

function merge(conn, s) {
  const d = conn.data, f = conn.features;
  d.klippyState = s.webhooks?.state || d.klippyState;
  d.stateMessage = s.webhooks?.state_message ?? d.stateMessage;
  if (d.klippyState && d.klippyState !== "ready") conn.ready = false;
  const ps = s.print_stats || {};
  d.printState = STATE[ps.state] || ps.state || "idle";
  d.printFilename = ps.filename || null;
  d.printDuration = num(ps.print_duration) ?? 0;
  d.currentLayer = num(ps.info?.current_layer);
  d.totalLayer = num(ps.info?.total_layer);
  const fileProg = num(s.virtual_sdcard?.progress), dispProg = num(s.display_status?.progress);
  d.progress = Math.max(0, Math.min(1, (s.virtual_sdcard?.is_active ? fileProg : null) ?? dispProg ?? fileProg ?? 0));
  if (d.printState === "complete") d.progress = 1;
  d.temps = {
    tools: f.extruders.map((e, i) => ({ name: e, label: `T${i}`, cur: num(s[e]?.temperature), tgt: num(s[e]?.target) })),
    bed: num(s.heater_bed?.temperature), bedTarget: num(s.heater_bed?.target),
    chamber: f.chamber ? num(s[f.chamber]?.temperature) : null,
    chamberTarget: f.chamber ? num(s[f.chamber]?.target) : null,
    sensors: readTemperatureSensors(f.temperatureSensors || [], s),
  };
  d.fanPct = num(s.fan?.speed) != null ? Math.min(100, Math.round(s.fan.speed / f.fanMaxPower * 100)) : null;
  d.speedPct = num(s.gcode_move?.speed_factor) != null ? Math.round(s.gcode_move.speed_factor * 100) : null;
  d.activeTool = s.toolhead?.extruder || null;
  if (Array.isArray(s.toolhead?.position)) d.pos = s.toolhead.position.slice(0, 3);
  d.homed = String(s.toolhead?.homed_axes ?? d.homed ?? "");
  d.lights = f.lights.map(l => {
    const o = s[l.obj] || {};
    const on = l.kind === "pin" ? Number(o.value) > 0
      : (Array.isArray(o.color_data) ? o.color_data : []).some(c => (c || []).some(v => Number(v) > 0));
    return { ...l, on };
  });
  d.filaments = buildSlots(conn, s);
}

// ── Slots (adapters) ────────────────────────────────────────────────────────
function hex(v) {
  const s = String(v ?? "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s) ? `#${s.slice(0, 6).toUpperCase()}` : null;
}

function buildSlots(conn, s) {
  const f = conn.features, d = conn.data;
  if (f.mmu && s.mmu) {
    const m = s.mmu;
    const n = Number(m.num_gates) || (m.gate_status || []).length;
    const toolOf = g => { const t = (m.ttg_map || []).indexOf(g); return t >= 0 ? `T${t}` : null; };
    return Array.from({ length: n }, (_, g) => {
      const st = (m.gate_status || [])[g];
      const empty = st === 0;
      return {
        key: `g${g}`, gate: g, label: `${g}`, tool: toolOf(g),
        material: empty ? null : ((m.gate_material || [])[g] || null),
        color: empty ? null : hex((m.gate_color || [])[g]),
        spoolId: num((m.gate_spool_id || [])[g]) > 0 ? m.gate_spool_id[g] : null,
        empty, unknown: st === -1, isActive: Number(m.gate) === g,
      };
    });
  }
  if (f.afcLanes.length) {
    const cur = s.AFC?.current_lane || null;
    return f.afcLanes.map((lane, i) => {
      const o = s[f.afcObjs[lane]] || {};
      const empty = o.load === false && o.prep === false;
      return {
        key: `l${lane}`, lane, label: `${i + 1}`, tool: o.map || null,
        material: empty ? null : (o.material || null), color: empty ? null : hex(o.color),
        spoolId: o.spool_id || null, weight: num(o.weight), name: o.filament_name || null,
        empty, isActive: cur === lane || o.tool_loaded === true,
      };
    });
  }
  return f.extruders.map((e, i) => ({
    key: `e${i}`, extruder: e, label: f.extruders.length > 1 ? `T${i}` : "E1", tool: `T${i}`,
    material: null, color: null, spoolId: null, empty: false, isActive: d.activeTool === e,
  }));
}

// ── File metadata: estimate + thumbnail ─────────────────────────────────────
async function refreshFileMeta(conn) {
  const d = conn.data, fn = d.printFilename;
  if (!fn) { d.printEstimated = null; d.printPreviewUrl = null; conn.metaFor = conn.thumbFor = null; return; }
  if (conn.metaFor !== fn) {
    conn.metaFor = fn;
    const r = await call(conn, "GET", `/server/files/metadata?filename=${encodeURIComponent(fn)}`);
    const meta = r.ok ? r.result : null;
    d.printEstimated = num(meta?.estimated_time);
    const thumbs = Array.isArray(meta?.thumbnails) ? meta.thumbnails : [];
    const best = thumbs.slice().sort((a, b) => (b.size || b.width || 0) - (a.size || a.width || 0))[0];
    if (best?.relative_path) {
      // relative_path is relative to the G-code file's own folder.
      const dir = fn.includes("/") ? fn.slice(0, fn.lastIndexOf("/") + 1) : "";
      const path = `/server/files/gcodes/${(dir + best.relative_path).split("/").map(encodeURIComponent).join("/")}`;
      const img = await call(conn, "GET", path, { binary: true });
      d.printPreviewUrl = img.ok && img.data ? `data:${img.contentType || "image/png"};base64,${img.data}` : null;
      conn.thumbFor = fn;
    } else {
      d.printPreviewUrl = null;
    }
  }
}

/** Remaining seconds: slicer estimate minus elapsed, else extrapolated from progress. */
export function remainingSec(d) {
  if (d.printEstimated > 0 && d.printDuration >= 0 && d.printEstimated > d.printDuration) return Math.round(d.printEstimated - d.printDuration);
  if (d.printDuration > 0 && d.progress > 0 && d.progress < 1) return Math.round(d.printDuration * (1 - d.progress) / d.progress);
  return null;
}

// ── Commands ────────────────────────────────────────────────────────────────
/** action: "pause" | "resume" | "stop" → { ok, error? } */
export async function klipperJobControl(printer, action) {
  const conn = _conns.get(klipperKey(printer));
  if (!conn) return { ok: false, error: "not connected" };
  const verb = action === "stop" ? "cancel" : action === "resume" ? "resume" : "pause";
  const res = await call(conn, "POST", `/printer/print/${verb}`);
  if (!res.ok) { try { ctx.toast?.(ctx.t("klipperErrCommand"), "error"); } catch (_) {} }
  setTimeout(() => pollOnce(conn), 400);
  return { ok: !!res.ok, error: res.error };
}

/** G-code parameter values may not carry spaces, newlines or `;`. */
const gv = v => String(v ?? "").replace(/[\s;]+/g, "_").slice(0, 64);

/**
 * Write a slot's filament to the printer — Happy Hare gate or AFC lane.
 * fil: { material?, color? ("#RRGGBB"), spoolId? }. Plain extruders keep no
 * filament identity in Klipper: nothing to write there. → { ok, error? }
 */
export async function klipperWriteSlot(printer, slotKey, fil = {}) {
  const conn = _conns.get(klipperKey(printer));
  if (!conn || conn.status !== "connected") return { ok: false, error: "not connected" };
  const slot = conn.data.filaments.find(s => s.key === slotKey);
  if (!slot) return { ok: false, error: "unknown slot" };
  const color = hex(fil.color)?.slice(1) || null;
  const lines = [];
  if (slot.gate != null) {
    let l = `MMU_GATE_MAP GATE=${slot.gate}`;
    if (fil.material) l += ` MATERIAL=${gv(fil.material)}`;
    if (color) l += ` COLOR=${color}`;
    if (fil.spoolId != null) l += ` SPOOLID=${Number(fil.spoolId) || -1}`;
    lines.push(l);
  } else if (slot.lane) {
    if (fil.material) lines.push(`SET_MATERIAL LANE=${gv(slot.lane)} MATERIAL=${gv(fil.material)}`);
    if (color) lines.push(`SET_COLOR LANE=${gv(slot.lane)} COLOR=${color}`);
    if (fil.spoolId != null) lines.push(`SET_SPOOL_ID LANE=${gv(slot.lane)} SPOOL_ID=${Number(fil.spoolId) || ""}`);
  } else {
    return { ok: false, error: "slot keeps no filament data" };
  }
  if (!lines.length) return { ok: true };
  const res = await call(conn, "POST", "/printer/gcode/script", { body: { script: lines.join("\n") } });
  if (!res.ok) { try { ctx.toast?.(ctx.t("klipperErrCommand"), "error"); } catch (_) {} }
  setTimeout(() => pollOnce(conn), 300);
  return { ok: !!res.ok, error: res.error };
}

/** Run G-code on the printer. Klipper's own refusal ("Must home axis first") is toasted. */
export async function klipperGcode(printer, script) {
  const conn = _conns.get(klipperKey(printer));
  if (!conn || conn.status !== "connected") return { ok: false, error: "not connected" };
  const res = await call(conn, "POST", "/printer/gcode/script", { body: { script } });
  if (!res.ok) {
    const why = String(res.error || "").split("\n")[0];
    try { ctx.toast?.(why && !/^HTTP \d+$/.test(why) ? why : ctx.t("klipperErrCommand"), "error"); } catch (_) {}
  }
  setTimeout(() => pollOnce(conn), 250);
  return { ok: !!res.ok, error: res.error };
}

const FEED_XY = 6000, FEED_Z = 600;   // mm/min
/** Relative jog on one axis; the move is refused by Klipper if the axis is not homed. */
export const klipperJog = (p, axis, dist) => {
  const a = String(axis).toUpperCase();
  if (!/^[XYZ]$/.test(a) || !isFinite(dist)) return Promise.resolve({ ok: false });
  return klipperGcode(p, `G91\nG1 ${a}${Number(dist)} F${a === "Z" ? FEED_Z : FEED_XY}\nG90`);
};
/** axes: "XY" | "Z" | "X" | "Y" | "" (all). */
export const klipperHome = (p, axes = "") => klipperGcode(p, `G28${[...String(axes).toUpperCase()].filter(c => "XYZ".includes(c)).map(c => " " + c).join("")}`);
/** pct 0–100 → M106 S0–255 (M107 at 0). */
export const klipperSetFan = (p, pct) => {
  const v = Math.round(Math.max(0, Math.min(100, Number(pct) || 0)) * 2.55);
  return klipperGcode(p, v > 0 ? `M106 S${v}` : "M107");
};
/** Target temperature of one heater (extruder, extruder1, heater_bed, a heater_generic); 0 = off. */
export const klipperSetTemp = (p, heater, value) =>
  klipperGcode(p, `SET_HEATER_TEMPERATURE HEATER=${gv(heater)} TARGET=${Math.max(0, Math.round(Number(value) || 0))}`);
/** Speed factor, percent (M220). */
export const klipperSetSpeed = (p, pct) => klipperGcode(p, `M220 S${Math.round(Math.max(10, Math.min(300, Number(pct) || 100)))}`);
export function klipperSetLight(p, light, on) {
  const n = gv(light.name);
  return klipperGcode(p, light.kind === "pin"
    ? `SET_PIN PIN=${n} VALUE=${on ? 1 : 0}`
    : `SET_LED LED=${n} RED=${on ? 1 : 0} GREEN=${on ? 1 : 0} BLUE=${on ? 1 : 0} WHITE=${on ? 1 : 0}`);
}

export async function klipperFirmwareRestart(printer) {
  const conn = _conns.get(klipperKey(printer));
  if (!conn) return { ok: false };
  const res = await call(conn, "POST", "/printer/firmware_restart");
  conn.ready = false;
  setTimeout(() => pollOnce(conn), 2000);
  return { ok: !!res.ok };
}
