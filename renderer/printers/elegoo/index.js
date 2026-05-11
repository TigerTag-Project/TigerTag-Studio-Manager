/**
 * printers/elegoo/index.js — Elegoo MQTT live integration.
 *
 * Uses the MQTT bridge exposed as window.elegoo (main-process IPC).
 * Protocol: MQTT plain TCP port 1883 — see PROTOCOL.md for full spec.
 *
 * State groups and method dispatch are documented inline.
 * Self-registers into the brands registry at module evaluation time.
 */
import { ctx } from '../context.js';
import { registerBrand, brands } from '../registry.js';
import { meta, schema, helper } from './settings.js';
import { renderElegooJobCard, renderElegooTempCard, renderElegooFilamentCard } from './cards.js';
import { schemaWidget } from '../modal-helpers.js';

const $ = id => document.getElementById(id);

// ── Per-printer live state ────────────────────────────────────────────────

// key → conn object. Module-scoped, never persisted to Firestore.
const _elegooConns = new Map();

// ── Public key helper ─────────────────────────────────────────────────────

export function elegooKey(p) { return `${p.brand}:${p.id}`; }

export function elegooGetConn(key) { return _elegooConns.get(key) ?? null; }

export function elegooIsOnline(printer) {
  if (printer?.brand !== 'elegoo') return null;
  const conn = _elegooConns.get(elegooKey(printer));
  if (!conn) return null;
  if (conn.status === 'connected') return true;
  if (conn.status === 'disconnected' || conn.status === 'error' || conn.status === 'offline') return false;
  return null; // connecting
}

// ── Print state groups ────────────────────────────────────────────────────

const ELEGOO_ACTIVE = new Set(['printing', 'running', 'busy', 'preparing', 'heating']);
const ELEGOO_PAUSED = new Set(['paused']);
const ELEGOO_DONE   = new Set(['complete', 'completed', 'cancelled', 'canceled', 'standby']);

const STATE_LABELS = {
  printing:  'snapState_printing',  running:   'snapState_printing',
  paused:    'snapState_paused',
  complete:  'snapState_complete',  completed: 'snapState_complete',
  cancelled: 'snapState_cancelled', canceled:  'snapState_cancelled',
  error:     'snapState_error',     failed:    'snapState_error',
  standby:   'snapState_standby',
  busy:      'elgState_busy',
  preparing: 'elgState_preparing',
  heating:   'elgState_heating',
};

// ── Vendor catalogue for filament edit ───────────────────────────────────

const ELG_VENDORS = {
  'Generic': ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'PA', 'PC', 'Resin', 'PVA', 'HIPS'],
  'ELEGOO':  ['PLA', 'PETG', 'ABS', 'TPU', 'ASA', 'Water-washable Resin', 'Standard Resin'],
};
const ELG_VENDOR_NAMES = Object.keys(ELG_VENDORS);

// ── Log helpers ───────────────────────────────────────────────────────────

const ELG_LOG_MAX = 150;

function elgLogPush(conn, dir, raw, summaryOverride = null) {
  if (!conn || conn.logPaused) return;
  if (!conn.log) conn.log = [];
  let summary = summaryOverride || '';
  if (!summary) {
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (obj && typeof obj === 'object') {
        const method = obj.method ?? obj.cmd;
        if (method !== undefined) summary = `method:${method}`;
        if (obj.data?.status) summary += `  ${String(obj.data.status).slice(0, 30)}`;
      }
    } catch (_) {}
  }
  if (!summary) {
    try { summary = String(raw).slice(0, 60); } catch (_) { summary = '(binary)'; }
  }
  const now = new Date();
  const ts = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
  conn.log.push({
    dir, ts, summary,
    raw: typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2),
    expanded: false,
  });
  if (conn.log.length > ELG_LOG_MAX) conn.log.shift();
  // Update count badge without full re-render
  const countEl = $('elgLogCount');
  if (countEl) countEl.textContent = String(conn.log.length);
}

// ── rAF-coalesced re-renders ──────────────────────────────────────────────

let _elgRenderRaf     = null;
let _elgCardRaf       = null;
let _elgRenderStatusFlag = false;

function elgNotifyChange(conn, statusChanged = false) {
  // Always refresh the printer cards grid when connection status changes
  // (Online / Connecting / Offline badge). Independent of which printer is open.
  if (statusChanged && !_elgCardRaf) {
    _elgCardRaf = requestAnimationFrame(() => {
      _elgCardRaf = null;
      ctx.onPrintersViewChange();
    });
  }

  // Detail-panel refresh — only when this printer is open in the sidecard.
  const activePrinter = ctx.getActivePrinter();
  if (!activePrinter) return;
  if (elegooKey(activePrinter) !== conn.key) return;
  if (statusChanged) _elgRenderStatusFlag = true;
  if (_elgRenderRaf) return;
  _elgRenderRaf = requestAnimationFrame(() => {
    _elgRenderRaf = null;
    const fullRerender = _elgRenderStatusFlag;
    _elgRenderStatusFlag = false;
    if (fullRerender) {
      ctx.onFullRender();
    } else {
      const liveHost = $('elgLive');
      if (liveHost) liveHost.innerHTML = renderElegooLiveInner(activePrinter);
      const logHost = $('elgLog');
      if (logHost) logHost.innerHTML = renderElegooLogInner(activePrinter);
      const countEl = $('elgLogCount');
      if (countEl) countEl.textContent = String(conn.log?.length || 0);
    }
  });
}

// ── MQTT topic / payload routing ──────────────────────────────────────────

let _elgGlobalHandlersStarted = false;

function _startGlobalHandlers() {
  if (_elgGlobalHandlersStarted) return;
  _elgGlobalHandlersStarted = true;

  if (!window.elegoo) return;

  window.elegoo.onStatus((key, status) => {
    const conn = _elegooConns.get(key);
    if (!conn) return;
    // Once abandoned (bad IP, 3 failures), ignore all further MQTT callbacks.
    if (conn._abandoned) return;
    const prev = conn.status;

    if (status === 'connected') {
      conn.status = 'connected';
      conn._errorCount = 0; // reset on successful connect
      elgLogPush(conn, '✓', `MQTT connected — SN:${conn.sn}  client:${conn.clientId}`);
      if (!conn._initSnapshotSent) {
        conn._initSnapshotSent = true;
        _sendInitSnapshot(conn);
        // The api_status push (method 6000) only broadcasts temperatures.
        // print_status (progress / layers / remaining) is only in method 1005
        // responses — so we poll every 10 s to keep the progress bar current.
        conn._refreshTimer = setInterval(() => {
          if (!_elegooConns.has(conn.key)) { clearInterval(conn._refreshTimer); return; }
          _elgPublish(conn, 1005, {});
        }, 10_000);
      }
    } else if (status.startsWith('error:') || status === 'offline') {
      conn._errorCount++;
      const MAX = 3;
      if (conn._errorCount >= MAX) {
        // Give up — bad IP or permanently unreachable host.
        // Keep conn in map (for card display) but stop the retry loop.
        conn._abandoned = true;
        conn.status = 'offline';
        if (conn._refreshTimer) { clearInterval(conn._refreshTimer); conn._refreshTimer = null; }
        window.elegoo.disconnect(key); // stops the MQTT client retry loop
        elgLogPush(conn, '✗', `Unreachable after ${MAX} attempts — giving up (check IP)`);
      } else {
        conn.status = status === 'offline' ? 'offline' : 'error';
        elgLogPush(conn, '!', status === 'offline'
          ? `MQTT offline (attempt ${conn._errorCount}/${MAX})`
          : `Error (attempt ${conn._errorCount}/${MAX}): ${status.slice(6)}`);
      }
    } else if (status === 'disconnected') {
      conn.status = 'disconnected';
      elgLogPush(conn, '!', 'MQTT disconnected');
    } else if (status === 'connecting') {
      conn.status = 'connecting';
      if (conn._errorCount > 0) elgLogPush(conn, '…', `Reconnecting… (attempt ${conn._errorCount + 1}/3)`);
    } else {
      conn.status = status;
      elgLogPush(conn, '…', `Status: ${status}`);
    }
    elgNotifyChange(conn, conn.status !== prev);
  });

  window.elegoo.onMessage((key, topic, data) => {
    const conn = _elegooConns.get(key);
    if (!conn) return;
    elgLogPush(conn, '←', data);
    _routeMessage(conn, topic, data);
  });
}

// ── Snapshot burst on connect ─────────────────────────────────────────────

// Snapshot burst on connect — real method IDs verified against live hardware.
// Method 1002 = comprehensive status (temps + print_status + machine_status).
// Method 1005 = print_status only (state / filename / uuid / layers / remaining).
// Method 2005 = filament slots (canvas_info.canvas_list[0].tray_list).
const SNAPSHOT_BURST = [
  { method: 1002, params: {} },   // temps + print_status + machine_status
  { method: 1005, params: {} },   // print_status detail (state / filename / layers)
  { method: 2005, params: {} },   // filament slots
  { method: 1044, params: { storage_media: 'local', offset: 0, limit: 50 } }, // file list → total layers cache
];

function _sendInitSnapshot(conn) {
  SNAPSHOT_BURST.forEach(({ method, params }, i) => {
    setTimeout(() => {
      if (!_elegooConns.has(conn.key)) return;
      _elgPublish(conn, method, params);
    }, i * 50);
  });
}

let _elgReqId = 0;

function _elgPublish(conn, method, params = {}) {
  if (!window.elegoo) return 0;
  // PROTOCOL.md §4 envelope: { id, method, params }
  const payload = { id: ++_elgReqId, method, params };
  // Publish topic: elegoo/{sn}/{clientId}/api_request  (NOT /request)
  const topic = `elegoo/${conn.sn}/${conn.clientId}/api_request`;
  elgLogPush(conn, '→', payload, `→ method:${method}`);
  window.elegoo.publish(conn.key, topic, payload);
  // Force a log re-render so outgoing entries appear even if no reply comes.
  elgNotifyChange(conn, false);
  return payload.id; // caller can use this to correlate the response
}

// ── Message routing by method ─────────────────────────────────────────────

function _routeMessage(conn, topic, data) {
  // api_status — live push broadcast, method is always 6000
  if (topic.endsWith('/api_status')) {
    _mergeStatus(conn, data);
    elgNotifyChange(conn, false);
    return;
  }
  // api_response — Elegoo format: { method, result, ... }
  const method = data?.method ?? data?.cmd;
  switch (method) {
    case 6000: _mergeStatus(conn, data);    break;
    // Method 1002 = comprehensive status snapshot (temps + print_status + machine_status).
    // Method 1005 = print_status only (state/filename/uuid/layer/remaining).
    // Both share the same nested structure → same merge function.
    case 1002: _mergeStatus(conn, data); break;
    case 1005: _mergeStatus(conn, data); break;
    case 2005: _mergeFilaments(conn, data); break;
    case 1036: _mergeHistory(conn, data);  break;
    case 1044: _mergeLayerMap(conn, data);  break;
    case 1045: _mergeThumbnail(conn, data); break;
    default: break;
  }
  elgNotifyChange(conn, false);
}

// ── Data merge handlers ───────────────────────────────────────────────────

function _mergeStatus(conn, data) {
  if (!data || typeof data !== 'object') return;
  const d = conn.data;
  // PROTOCOL.md §5 — message wraps payload in "result"
  // Also accept flat payload as fallback (some firmware variants)
  const r = data.result ?? data;

  // ── Temperatures (PROTOCOL.md §5) ────────────────────────────────────────
  const nozzle      = r?.extruder?.temperature;
  const nozzleTarget = r?.extruder?.target;
  const bed         = r?.heater_bed?.temperature;
  const bedTarget   = r?.heater_bed?.target;
  const chamber     = r?.ztemperature_sensor?.temperature;
  if (nozzle       !== undefined) d.nozzleTemp   = Number(nozzle);
  if (nozzleTarget !== undefined) d.nozzleTarget = Number(nozzleTarget);
  if (bed          !== undefined) d.bedTemp      = Number(bed);
  if (bedTarget    !== undefined) d.bedTarget    = Number(bedTarget);
  if (chamber      !== undefined) d.chamberTemp  = Number(chamber);
  // Flat fallback keys
  if (r.nozzleTemp  !== undefined) d.nozzleTemp  = Number(r.nozzleTemp);
  if (r.bedTemp     !== undefined) d.bedTemp     = Number(r.bedTemp);
  if (r.chamberTemp !== undefined) d.chamberTemp = Number(r.chamberTemp);

  // ── Print status (nested, PROTOCOL.md §5) ───────────────────────────────
  const ps = r?.print_status;
  if (ps) {
    // CRITICAL: 'state' key present but === '' means standby/done (live-observed).
    // Must check 'state' in ps — not truthiness — so empty string resets state correctly.
    if ('state' in ps) {
      const rawState = String(ps.state).toLowerCase().trim();
      d.printState = rawState || 'standby';   // '' → 'standby'
    }
    if (ps.progress !== undefined) {
      let pct = Number(ps.progress);
      if (pct > 1.0001) pct /= 100;
      d.printProgress = Math.max(0, Math.min(1, pct));
    }
    if (ps.current_layer     !== undefined) d.printLayerCur   = Math.round(Number(ps.current_layer));
    if (ps.filename          !== undefined) {
      d.printFilename = String(ps.filename || '') || null;
      // Cross-reference against the layer cache built from method 1044 file_list.
      if (d.printFilename && !d.printLayerTotal) {
        const cached = conn._layerMap.get(d.printFilename);
        if (cached) d.printLayerTotal = cached;
      }
    }
    if (ps.uuid              !== undefined) d.printUuid       = String(ps.uuid        || '') || null;
    if (ps.remaining_time_sec !== undefined) d.printRemainingMs = Number(ps.remaining_time_sec) * 1000;
    if (ps.total_duration    !== undefined) d.printDuration   = Number(ps.total_duration);
  }
  // machine_status — derive state & progress when print_status absent or incomplete
  const ms = r?.machine_status;
  if (ms) {
    // progress fallback
    if (ms.progress !== undefined && !ps?.progress) {
      let pct = Number(ms.progress);
      if (pct > 1.0001) pct /= 100;
      d.printProgress = Math.max(0, Math.min(1, pct));
    }
    // machine status code → printState fallback (live-observed, PROTOCOL.md §6.1)
    // Only apply when print_status gave no usable state
    if (!ps || !('state' in ps)) {
      const machStatus    = Number(ms.status ?? -1);
      const machSubStatus = Number(ms.sub_status ?? 0);
      if      (machStatus === 1)  d.printState = 'standby';
      else if (machStatus === 14) d.printState = 'error';
      else if (machStatus === 3)  d.printState = 'printing';   // finishing sequence still active
      else if (machStatus === 2) {
        // sub_status refines the active state
        if      (machSubStatus === 2901) d.printState = 'heating';
        else if (machSubStatus === 1066) d.printState = 'printing';
        else                             d.printState = 'printing';
      }
    }
    // exception_status — convert to error state
    if (Array.isArray(ms.exception_status) && ms.exception_status.length) {
      d.lastException = ms.exception_status;
    }
  }

  // ── Flat fallback keys (older firmware / snapshot replies) ───────────────
  if (!ps) {
    const rawState = String(r.printStatus || r.status || r.state || '').toLowerCase().trim();
    if (rawState) d.printState = rawState;
    if (r.printProgress !== undefined || r.progress !== undefined) {
      let pct = Number(r.printProgress ?? r.progress ?? 0);
      if (pct > 1.0001) pct /= 100;
      d.printProgress = Math.max(0, Math.min(1, pct));
    }
    if (r.printLayer   !== undefined) d.printLayerCur   = Math.round(Number(r.printLayer));
    if (r.targetLayer  !== undefined) d.printLayerTotal = Math.round(Number(r.targetLayer));
    if (r.totalLayer   !== undefined) d.printLayerTotal = Math.round(Number(r.totalLayer));
    if (r.printFileName !== undefined) d.printFilename  = String(r.printFileName || '') || null;
    if (r.printUuid    !== undefined) d.printUuid       = String(r.printUuid     || '') || null;
    if (r.remainTime   !== undefined) d.printRemainingMs = Number(r.remainTime) * 1000;
    if (r.remainingTime !== undefined) d.printRemainingMs = Number(r.remainingTime) * 1000;
  }

  // ── Thumbnail request on new filename ───────────────────────────────────
  // PROTOCOL.md §8: correct param is file_name + storage_media:"local".
  // uuid param returns error_code:1003 (confirmed live). Trigger on filename
  // change (more reliable than uuid since uuid can be null on some firmware).
  // Skip if history-thumb queue is active — the printer can't correlate IDs,
  // so we must not interleave live and history 1045 requests.
  if (d.printFilename && d.printFilename !== conn._thumbnailLastFilename
      && !conn._historyThumbPendingFn && !conn._historyThumbQueue.length) {
    const now = Date.now();
    if (now - conn._thumbnailLastFetch > 1500) {
      conn._thumbnailLastFilename = d.printFilename;
      conn._thumbnailLastFetch    = now;
      _elgPublish(conn, 1045, { file_name: d.printFilename, storage_media: 'local' });
    }
  }
}

function _mergeFilaments(conn, data) {
  if (!data) return;
  const d = conn.data;
  const r = data.result ?? data;

  // ── Primary path: PROTOCOL.md §7 ────────────────────────────────────────
  // result.canvas_info.canvas_list[0].tray_list
  let trays = r?.canvas_info?.canvas_list?.[0]?.tray_list ?? null;

  // ── Fallback 1: flat arrays in params (PROTOCOL.md §7.1) ────────────────
  if (!Array.isArray(trays) || !trays.length) {
    const p = r?.params ?? data?.params;
    if (p?.filament_type) {
      const colors   = p.filament_color    || [];
      const types    = p.filament_type     || [];
      const vendors  = p.filament_vendor   || [];
      const names    = p.filament_name     || [];
      const minTemps = p.filament_min_temp || [];
      const maxTemps = p.filament_max_temp || [];
      const statuses = p.filament_status   || [];
      trays = types.map((type, i) => ({
        tray_id:         i,
        filament_color:  colors[i]   || null,
        filament_type:   type,
        brand:           vendors[i]  || '',
        filament_name:   names[i]    || '',
        min_nozzle_temp: minTemps[i] || null,
        max_nozzle_temp: maxTemps[i] || null,
        status:          statuses[i] || 0,
      }));
    }
  }

  // ── Fallback 2: legacy flat objects ──────────────────────────────────────
  if (!Array.isArray(trays) || !trays.length) {
    const flat = Array.isArray(r) ? r : (r?.filamentInfo || r?.trayInfo || r?.trays || null);
    if (Array.isArray(flat) && flat.length) trays = flat;
  }

  if (!Array.isArray(trays) || !trays.length) return;

  d.filaments = trays.map((t, i) => ({
    trayId:  t.tray_id      ?? t.trayId      ?? i,
    color:   (t.filament_color || t.color)
               ? `#${String(t.filament_color || t.color).replace(/^#/, '')}` : null,
    type:    String(t.filament_type || t.filamentType || t.type || '').trim() || null,
    vendor:  String(t.brand || t.vendor || '').trim() || null,
    name:    String(t.filament_name || t.filamentName || t.name || '').trim() || null,
    minTemp: t.min_nozzle_temp ?? t.minTemp ?? null,
    maxTemp: t.max_nozzle_temp ?? t.maxTemp ?? null,
    active:  !!(t.status === 1 || t.active === true || t.isActive === true),
  }));
}

function _mergeLayerMap(conn, data) {
  if (!data) return;
  const r = data.result ?? data;
  // Method 1044 file list — Dart source confirms field names: filename + layer (singular)
  // Also accept total_layer / totalLayer / layers for firmware variants.
  const fileList = r?.file_list ?? r?.fileList ?? (Array.isArray(r) ? r : null);
  if (Array.isArray(fileList)) {
    fileList.forEach(f => {
      const fn  = f.filename || f.name;
      const tot = f.layer ?? f.total_layer ?? f.totalLayer ?? f.layers;
      if (fn && tot) conn._layerMap.set(fn, Number(tot));
    });
    // After rebuilding the map, backfill printLayerTotal if we already know the filename.
    const curFn = conn.data.printFilename;
    if (curFn) {
      const cached = conn._layerMap.get(curFn);
      if (cached) conn.data.printLayerTotal = cached;
    }
  }
  // Single-file shape fallback (older firmware variants)
  const fn  = r?.printFileName || r?.filename;
  const tot = r?.totalLayer    || r?.totalLayers || r?.total_layer || r?.layer;
  if (fn && tot) conn._layerMap.set(fn, Number(tot));
  if (tot !== undefined && !conn.data.printLayerTotal) {
    conn.data.printLayerTotal = Number(tot);
  }
}

function _mergeThumbnail(conn, data) {
  if (!data) return;
  const r = data.result ?? data;

  // The Elegoo firmware echoes the method number (1045) as the response "id" —
  // it does NOT echo our incremental request id. So we cannot correlate by id.
  // Instead: if a history thumb is in-flight (_historyThumbPendingFn is set),
  // this response belongs to the history queue; otherwise it's the live-print thumb.
  const isHistoryThumb = conn._historyThumbPendingFn !== null;

  if (r?.error_code === 1003) {
    if (isHistoryThumb) {
      // File not on printer — skip, advance to next in queue
      _elgHistoryThumbAdvance(conn);
    } else {
      // Current-print thumbnail not available yet — reset so we retry on next filename change
      conn._thumbnailLastFilename = null;
    }
    return;
  }

  const b64 = r?.thumbnail ?? r?.thumbData ?? r?.base64 ?? r?.imageData ?? r?.image;
  if (!b64) {
    if (isHistoryThumb) _elgHistoryThumbAdvance(conn);
    return;
  }

  const dataUri = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;

  if (isHistoryThumb) {
    // Store in history cache and re-render the open sheet
    conn._historyThumbs.set(conn._historyThumbPendingFn, dataUri);
    _elgHistoryThumbAdvance(conn);
    _elgUpdateFileSheet(conn);
  } else {
    // Current-print thumbnail
    conn.data.thumbnail = dataUri;
  }
}

// ── Connection lifecycle ──────────────────────────────────────────────────

export function elegooConnect(printer) {
  if (!window.elegoo) return;
  const key = elegooKey(printer);
  const existing = _elegooConns.get(key);
  if (existing && existing.ip === printer.ip) {
    existing.printer = printer;
    return;
  }
  if (existing) elegooDisconnect(key);

  const sn        = String(printer.sn || printer.serialNumber || '').trim();
  const clientId  = `TTG_${Math.floor(1000 + Math.random() * 9000)}`;
  const requestId = `${clientId}_req`;

  const conn = {
    key,
    ip: printer.ip,
    printer,
    sn,
    clientId,
    requestId,
    status: 'connecting',
    data: {
      nozzleTemp: null, nozzleTarget: null, bedTemp: null, bedTarget: null, chamberTemp: null,
      printState: null, printProgress: 0,
      printLayerCur: 0, printLayerTotal: null,
      printFilename: null, printUuid: null, printRemainingMs: null,
      printDuration: null, lastException: [],
      filaments: [],
      thumbnail: null,
      history: [],
      historyLoading: false,
    },
    _layerMap: new Map(),
    _initSnapshotSent: false,
    _thumbnailLastFilename: null,
    _thumbnailLastFetch: 0,
    _refreshTimer: null,
    _errorCount: 0,   // counts failed attempts; gives up after MAX_CONNECT_ERRORS
    _abandoned: false, // true = bad IP, no more retries until IP changes
    // History thumbnail loader — sequential queue (one request at a time)
    // NOTE: Elegoo firmware echoes method number as response id, so we cannot
    // correlate by id. We use _historyThumbPendingFn (non-null = in-flight) instead.
    _historyThumbs: new Map(),        // filename → data-URI
    _historyThumbQueue: [],           // filenames waiting to be fetched
    _historyThumbPendingFn: null,     // filename of in-flight request (null = idle)
    _historyThumbTimer: null,         // timeout if printer doesn't respond
    log: [],
    logExpanded: false,
    logPaused: false,
  };
  _elegooConns.set(key, conn);
  _startGlobalHandlers();

  // Initial log entry — visible immediately so the user knows a connection
  // attempt is underway even before MQTT responds.
  elgLogPush(conn, '…', `Connecting to mqtt://${printer.ip}:1883  SN:${sn || '(missing)'}  client:${clientId}`);

  window.elegoo.connect({
    key,
    host: printer.ip,
    port: 1883,
    sn,
    password: printer.mqttPassword || printer.password || '123456',
    clientId,
    requestId,
  });
  elgNotifyChange(conn, true);
}

export function elegooDisconnect(key) {
  const conn = _elegooConns.get(key);
  if (conn?._refreshTimer) { clearInterval(conn._refreshTimer); conn._refreshTimer = null; }
  if (window.elegoo) window.elegoo.disconnect(key);
  _elegooConns.delete(key);
}

// ── Live inner renderers ──────────────────────────────────────────────────

export function renderElegooLiveInner(p) {
  const conn = _elegooConns.get(elegooKey(p));
  if (!conn) return `
    <div class="snap-empty">
      <span class="icon icon-cloud icon-18"></span>
      <span>${ctx.esc(ctx.t('snapNoConnection'))}</span>
    </div>`;
  const b = brands.get('elegoo');
  const headHtml = conn.status === 'connected' ? `
    <div class="snap-head">
      <button type="button"
              class="cre-action-btn"
              data-elg-open-files="1"
              title="${ctx.esc(ctx.t('elgFilesTitle') || 'Print history')}">
        <span class="icon icon-folder icon-16"></span>
      </button>
    </div>` : '';
  return `
    ${headHtml}
    ${b.renderJobCard(p, conn)}
    ${b.renderTempCard(conn)}
    ${b.renderFilamentCard(p, conn)}`;
}

export function renderElegooLogInner(p) {
  const conn = _elegooConns.get(elegooKey(p));
  const log = conn?.log || [];
  if (!log.length) {
    return `<div class="snap-log-empty">${ctx.esc(ctx.t('snapLogEmpty'))}</div>`;
  }
  const rows = log.slice().reverse().map((e, i) => {
    let pretty = e.raw;
    try { pretty = JSON.stringify(JSON.parse(e.raw), null, 2); } catch (_) {}
    const expanded = !!e.expanded;
    return `
      <div class="snap-log-row snap-log-row--${e.dir === '→' ? 'out' : 'in'}${expanded ? ' snap-log-row--expanded' : ''}"
           data-log-idx="${log.length - 1 - i}">
        <button type="button" class="snap-log-row-head" data-row-toggle="1">
          <span class="snap-log-dir">${ctx.esc(e.dir)}</span>
          <span class="snap-log-ts">${ctx.esc(e.ts)}</span>
          <span class="snap-log-summary">${ctx.esc(e.summary)}</span>
          <span class="snap-log-row-chev icon icon-chevron-r icon-13"></span>
        </button>
        <div class="snap-log-detail"${expanded ? '' : ' hidden'}>
          <button type="button" class="snap-log-detail-copy" data-copy="${ctx.esc(pretty)}" title="${ctx.esc(ctx.t('copyLabel'))}">
            <span class="icon icon-copy icon-13"></span>
            <span>${ctx.esc(ctx.t('copyLabel'))}</span>
          </button>
          <pre class="snap-log-detail-pre">${ctx.esc(pretty)}</pre>
        </div>
      </div>`;
  }).join('');
  return `<div class="snap-log">${rows}</div>`;
}

// ── Filament edit bottom sheet ────────────────────────────────────────────

let _elgFilEdit = null;
let _elgSelectedVendor = 'Generic';
let _elgSelectedMaterial = 'PLA';

function _elgSortMaterials(list) {
  const priority = ['PLA', 'PETG', 'ABS', 'TPU'];
  const upper = list.map(s => s.toUpperCase());
  const used = new Set();
  const head = [];
  for (const p of priority) {
    const idx = upper.findIndex((u, i) => !used.has(i) && u === p);
    if (idx >= 0) { head.push(list[idx]); used.add(idx); }
  }
  const rest = list.filter((_, i) => !used.has(i))
                   .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return [...head, ...rest];
}

function _elgRenderVendorList(selected) {
  return ELG_VENDOR_NAMES.map(v => {
    const isSel = v === selected;
    return `<button type="button" class="sfe-fil-row${isSel ? ' is-selected' : ''}" data-val="${ctx.esc(v)}">${ctx.esc(v)}</button>`;
  }).join('');
}

function _elgRenderMaterialList(vendor, selectedMat) {
  const list = ELG_VENDORS[vendor] || ELG_VENDORS['Generic'];
  const sorted = _elgSortMaterials(list);
  return sorted.map(m => {
    const isSel = m.toLowerCase() === (selectedMat || '').toLowerCase();
    return `<button type="button" class="sfe-fil-row${isSel ? ' is-selected' : ''}" data-val="${ctx.esc(m)}">
              <span class="sfe-fil-row-text">${ctx.esc(m)}</span>
              ${isSel ? `<span class="sfe-fil-row-check">✓</span>` : ''}
            </button>`;
  }).join('');
}

function _elgRenderColorGrid(currentColor) {
  const grid = $('elgColorGrid');
  if (!grid) return;
  const cur = (currentColor || '').toLowerCase();
  const presetCells = ctx.SNAP_FIL_COLOR_PRESETS.map(c => {
    const isSel = c.toLowerCase() === cur;
    return `<button type="button" class="sfe-color-cell${isSel ? ' is-selected' : ''}"
                    data-color="${ctx.esc(c)}"
                    style="background:${ctx.esc(c)}"
                    title="${ctx.esc(c)}"></button>`;
  }).join('');
  const safeColor = currentColor && /^#[0-9a-f]{6}$/i.test(currentColor) ? currentColor : '#888888';
  const customCell = `
    <div class="sfe-color-cell sfe-color-cell--custom" id="elgColorCustomBtn"
         style="background:${ctx.esc(safeColor)}"
         title="${ctx.esc(ctx.t('snapFilEditCustomColor') || 'Custom')}">
      <span class="icon icon-edit icon-13"></span>
      <input type="color" class="sfe-color-cell-native" id="elgColorPickerInline"
             value="${ctx.esc(safeColor)}" aria-label="Custom color"/>
    </div>`;
  grid.innerHTML = presetCells + customCell;
}

function _elgUpdateSummary() {
  const m = _elgSelectedMaterial || '—';
  const valEl = $('elgFilSummaryVal');
  if (valEl) valEl.textContent = m;
  const dot = $('elgColorSummaryDot');
  if (dot) dot.style.background = $('elgColorInput')?.value || '#888';
}

function _elgOpenFilamentSheet() {
  $('elgFilamentSheet')?.classList.add('open');
  $('elgFilamentSheet')?.setAttribute('aria-hidden', 'false');
}
function _elgCloseFilamentSheet() {
  $('elgFilamentSheet')?.classList.remove('open');
  $('elgFilamentSheet')?.setAttribute('aria-hidden', 'true');
}
function _elgOpenColorSheet() {
  $('elgColorSheet')?.classList.add('open');
  $('elgColorSheet')?.setAttribute('aria-hidden', 'false');
}
function _elgCloseColorSheet() {
  $('elgColorSheet')?.classList.remove('open');
  $('elgColorSheet')?.setAttribute('aria-hidden', 'true');
}

export function openElegooFilamentEdit(printer, trayIdx) {
  const conn = _elegooConns.get(elegooKey(printer));
  const fil = conn?.data?.filaments?.[trayIdx] || {};
  _elgFilEdit = { printer, trayIdx, key: elegooKey(printer) };
  _elgSelectedVendor   = (fil.vendor && ELG_VENDOR_NAMES.includes(fil.vendor)) ? fil.vendor : 'Generic';
  _elgSelectedMaterial = fil.type || 'PLA';

  const colorInp = $('elgColorInput');
  if (colorInp) {
    colorInp.value = (fil.color && /^#[0-9a-f]{6}/i.test(fil.color))
      ? fil.color.slice(0, 7)
      : '#FF5722';
  }

  $('elgFilEditSub').textContent = '';
  const errEl = $('elgError');
  if (errEl) errEl.hidden = true;

  const initialColor = (fil.color && /^#[0-9a-f]{6}/i.test(fil.color))
    ? fil.color.slice(0, 7) : '#FF5722';
  _elgRenderColorGrid(initialColor);

  const vendorList = $('elgVendorList');
  if (vendorList) vendorList.innerHTML = _elgRenderVendorList(_elgSelectedVendor);
  const matList = $('elgMaterialList');
  if (matList) matList.innerHTML = _elgRenderMaterialList(_elgSelectedVendor, _elgSelectedMaterial);

  _elgCloseFilamentSheet();
  _elgCloseColorSheet();
  _elgUpdateSummary();

  $('elgFilEditSheet').classList.add('open');
  $('elgFilEditSheet').setAttribute('aria-hidden', 'false');
  $('elgFilEditBackdrop').classList.add('open');
}

export function closeElegooFilamentEdit() {
  $('elgFilEditSheet')?.classList.remove('open');
  $('elgFilEditSheet')?.setAttribute('aria-hidden', 'true');
  $('elgFilEditBackdrop')?.classList.remove('open');
  _elgCloseFilamentSheet();
  _elgCloseColorSheet();
  _elgFilEdit = null;
}

// ── DOM event wiring ──────────────────────────────────────────────────────

$('elgFilEditClose')?.addEventListener('click', closeElegooFilamentEdit);
$('elgFilEditBackdrop')?.addEventListener('click', closeElegooFilamentEdit);

$('elgOpenFilament')?.addEventListener('click', () => {
  _elgOpenFilamentSheet();
  setTimeout(() => {
    const sel = $('elgVendorList')?.querySelector('.is-selected');
    if (sel) sel.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, 0);
});
$('elgOpenColor')?.addEventListener('click', () => {
  _elgOpenColorSheet();
});

$('elgFilamentBack')?.addEventListener('click', () => {
  _elgUpdateSummary();
  _elgCloseFilamentSheet();
});
$('elgFilamentClose')?.addEventListener('click', () => {
  _elgUpdateSummary();
  _elgCloseFilamentSheet();
});
$('elgColorBack')?.addEventListener('click', () => {
  _elgUpdateSummary();
  _elgCloseColorSheet();
});
$('elgColorClose')?.addEventListener('click', () => {
  _elgUpdateSummary();
  _elgCloseColorSheet();
});

$('elgVendorList')?.addEventListener('click', e => {
  const row = e.target.closest('.sfe-fil-row');
  if (!row) return;
  _elgSelectedVendor = row.dataset.val || 'Generic';
  $('elgVendorList').querySelectorAll('.sfe-fil-row').forEach(r =>
    r.classList.toggle('is-selected', r === row));
  const matList = $('elgMaterialList');
  if (matList) matList.innerHTML = _elgRenderMaterialList(_elgSelectedVendor, _elgSelectedMaterial);
  const v = $('elgVendor'); if (v) v.value = '';
});

$('elgMaterialList')?.addEventListener('click', e => {
  const row = e.target.closest('.sfe-fil-row');
  if (!row) return;
  _elgSelectedMaterial = row.dataset.val || 'PLA';
  const m = $('elgMaterial'); if (m) m.value = '';
  $('elgMaterialList').innerHTML = _elgRenderMaterialList(_elgSelectedVendor, _elgSelectedMaterial);
  setTimeout(() => {
    _elgUpdateSummary();
    _elgCloseFilamentSheet();
  }, 180);
});

$('elgColorGrid')?.addEventListener('click', e => {
  if (e.target.closest('#elgColorPickerInline')) return;
  const cell = e.target.closest('.sfe-color-cell:not(.sfe-color-cell--custom)');
  if (!cell) return;
  const c = cell.dataset.color;
  if (!c) return;
  $('elgColorInput').value = c;
  _elgRenderColorGrid(c);
  setTimeout(() => {
    _elgUpdateSummary();
    _elgCloseColorSheet();
  }, 150);
});
$('elgColorGrid')?.addEventListener('input', e => {
  if (!e.target.matches?.('#elgColorPickerInline')) return;
  const c = e.target.value;
  $('elgColorInput').value = c;
  const wrap = e.target.closest('.sfe-color-cell--custom');
  if (wrap) wrap.style.background = c;
});
$('elgColorGrid')?.addEventListener('change', e => {
  if (!e.target.matches?.('#elgColorPickerInline')) return;
  const c = e.target.value;
  $('elgColorInput').value = c;
  _elgRenderColorGrid(c);
  setTimeout(() => {
    _elgUpdateSummary();
    _elgCloseColorSheet();
  }, 100);
});

// Apply — publish method 2003 to the printer
$('elgFilEditSave')?.addEventListener('click', async () => {
  if (!_elgFilEdit) return;
  const conn    = _elegooConns.get(_elgFilEdit.key);
  const errEl   = $('elgError');
  errEl.hidden  = true;

  const rawMaterial = String($('elgMaterial').value || _elgSelectedMaterial || 'PLA').trim();
  // Extract base type only — split on /[\s+\-_\/]+/, take first token
  const materialBase = rawMaterial.split(/[\s+\-_\/]+/)[0] || rawMaterial;

  let rawColor = String($('elgColorInput').value || '#FF5722').trim();
  if (!/^#[0-9a-f]{6}$/i.test(rawColor)) rawColor = '#FF5722';
  const filamentColor = rawColor.toUpperCase();

  const trayIdx  = _elgFilEdit.trayIdx;
  const fil      = conn?.data?.filaments?.[trayIdx] || {};
  const trayId   = fil.trayId ?? trayIdx;

  const payload2003 = {
    tray_id:        trayId,
    canvas_id:      0,
    filament_type:  materialBase,
    filament_color: filamentColor,
    filament_code:  fil.code || '0x0000',
  };

  if (!conn) {
    errEl.textContent = ctx.t('ffgErrNetwork');
    errEl.hidden = false;
    return;
  }

  const btn = $('elgFilEditSave');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    elgLogPush(conn, '→', payload2003, `→ method:2003 tray:${trayId}`);
    _elgPublish(conn, 2003, payload2003);

    // Optimistic local update
    if (conn.data.filaments[trayIdx]) {
      conn.data.filaments = conn.data.filaments.slice();
      conn.data.filaments[trayIdx] = {
        ...conn.data.filaments[trayIdx],
        type:  materialBase,
        color: filamentColor,
      };
      elgNotifyChange(conn, false);
    }

    // Refresh filament list after 1s
    setTimeout(() => {
      if (_elegooConns.has(_elgFilEdit?.key)) _elgPublish(conn, 2005, {});
    }, 1000);

    closeElegooFilamentEdit();
  } catch (e) {
    console.warn('[elg] filament edit failed:', e?.message);
    errEl.textContent = ctx.t('ffgErrNetwork');
    errEl.hidden = false;
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

// ── File history bottom sheet ─────────────────────────────────────────────

// ── History thumbnail queue ───────────────────────────────────────────────
// Fetches thumbnails one at a time for the history sheet.
// Elegoo firmware echoes method number (1045) as response "id" — NOT our
// request id — so correlation by id is impossible. We use _historyThumbPendingFn
// (non-null while in-flight) to route responses, and suppress live-print
// thumbnail requests while the queue is active.

function _elgHistoryThumbAdvance(conn) {
  // Clear in-flight state
  if (conn._historyThumbTimer) { clearTimeout(conn._historyThumbTimer); conn._historyThumbTimer = null; }
  conn._historyThumbPendingFn = null;
  // Process next item immediately (synchronous — no event-loop gap)
  _elgHistoryThumbNext(conn);
}

function _elgHistoryThumbNext(conn) {
  if (!conn._historyThumbQueue.length) return;
  if (conn._historyThumbPendingFn !== null) return; // already in-flight
  const fn = conn._historyThumbQueue.shift();
  if (!fn) return;
  conn._historyThumbPendingFn = fn;
  _elgPublish(conn, 1045, { file_name: fn, storage_media: 'local' });
  // 2 s timeout in case the printer never answers for this file
  conn._historyThumbTimer = setTimeout(() => _elgHistoryThumbAdvance(conn), 2000);
}

function _elgLoadHistoryThumbs(conn) {
  if (!conn?.data.history.length) return;
  // Build queue from history items that don't yet have a cached thumbnail.
  // Limit to 20 to avoid flooding the broker.
  const todo = conn.data.history
    .filter(item => item.task_status === 1 && item.task_name && !conn._historyThumbs.has(item.task_name))
    .slice(0, 20)
    .map(item => item.task_name);
  // Prepend new items (avoid duplicates already queued)
  const alreadyQueued = new Set(conn._historyThumbQueue);
  for (const fn of todo) {
    if (!alreadyQueued.has(fn)) conn._historyThumbQueue.push(fn);
  }
  _elgHistoryThumbNext(conn);
}

// ── History sheet helpers ─────────────────────────────────────────────────

function _elgFmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

function _elgFmtDate(unixSec) {
  if (!unixSec) return '';
  return new Date(unixSec * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function _mergeHistory(conn, data) {
  if (!data) return;
  const r = data.result ?? data;
  if (r?.error_code !== 0 && r?.error_code !== undefined) return;
  const list = r?.history_task_list;
  if (!Array.isArray(list)) return;
  // Most recent first
  conn.data.history = [...list].reverse();
  conn.data.historyLoading = false;
  _elgUpdateFileSheet(conn);
  // Kick off thumbnail loading for newly arrived history items
  _elgLoadHistoryThumbs(conn);
}

function _elgHistoryHtml(conn) {
  const esc = ctx.esc;
  const t   = ctx.t;
  const d   = conn.data;
  if (d.historyLoading && !d.history.length) {
    return `<div class="cre-files-empty">${esc(t('elgFilesLoading') || 'Loading…')}</div>`;
  }
  if (!d.history.length) {
    return `<div class="cre-files-empty">${esc(t('elgFilesEmpty') || 'No print history')}</div>`;
  }
  const activeName = String(d.printFilename || '').replace(/\.gcode$/i, '').trim();
  return `<div class="cre-files">${d.history.map(item => {
    const rawName   = String(item.task_name || '');
    const cleanName = rawName.replace(/\.gcode$/i, '');
    const isActive  = activeName && cleanName === activeName;
    const ok        = item.task_status === 1;
    const dur       = _elgFmtDuration((item.end_time || 0) - (item.begin_time || 0));
    const date      = _elgFmtDate(item.begin_time);
    const thumb     = conn._historyThumbs.get(rawName);
    const thumbHtml = thumb
      ? `<div class="cre-file-thumb" style="background-image:url('${thumb}');background-size:cover;background-position:center"></div>`
      : `<div class="cre-file-thumb cre-file-thumb--placeholder"><span class="icon icon-cube icon-16"></span></div>`;
    return `
      <div class="cre-file-row${isActive ? ' cre-file-row--active' : ''}">
        ${thumbHtml}
        <div class="cre-file-info">
          <span class="cre-file-name" title="${esc(rawName)}">${esc(cleanName)}</span>
          <div class="cre-file-pills">
            ${dur  ? `<span class="cre-file-pill cre-file-pill--dim">${esc(dur)}</span>` : ''}
            ${date ? `<span class="cre-file-pill cre-file-pill--dim">${esc(date)}</span>` : ''}
            <span class="elg-hist-status elg-hist-status--${ok ? 'ok' : 'cancel'}">
              ${ok ? '✓' : '✕'}
            </span>
          </div>
        </div>
      </div>`;
  }).join('')}</div>`;
}

let _elgFileSheetKey = null;

function _elgUpdateFileSheet(conn) {
  const body    = document.getElementById('elgFileSheetBody');
  const refresh = document.getElementById('elgFileSheetRefresh');
  if (!body) return;
  body.innerHTML = _elgHistoryHtml(conn);
  if (refresh) refresh.classList.toggle('cre-file-refresh--loading', !!conn.data.historyLoading);
}

export function openElegooFileSheet(printer) {
  const key = elegooKey(printer);
  _elgFileSheetKey = key;
  const conn = _elegooConns.get(key);
  if (!conn) return;
  _elgUpdateFileSheet(conn);
  // Kick off a fresh load if empty
  if (!conn.data.history.length) {
    conn.data.historyLoading = true;
    _elgPublish(conn, 1036, {});
  }
  document.getElementById('elgFileSheet')?.classList.add('open');
  document.getElementById('elgFileSheet')?.setAttribute('aria-hidden', 'false');
  document.getElementById('elgFileSheetBackdrop')?.classList.add('open');
}

export function closeElegooFileSheet() {
  _elgFileSheetKey = null;
  document.getElementById('elgFileSheet')?.classList.remove('open');
  document.getElementById('elgFileSheet')?.setAttribute('aria-hidden', 'true');
  document.getElementById('elgFileSheetBackdrop')?.classList.remove('open');
}

document.getElementById('elgFileSheetClose')?.addEventListener('click', closeElegooFileSheet);
document.getElementById('elgFileSheetBackdrop')?.addEventListener('click', closeElegooFileSheet);
document.getElementById('elgFileSheetRefresh')?.addEventListener('click', () => {
  if (!_elgFileSheetKey) return;
  const conn = _elegooConns.get(_elgFileSheetKey);
  if (!conn) return;
  conn.data.historyLoading = true;
  _elgUpdateFileSheet(conn);
  _elgPublish(conn, 1036, {});
});

// ── Self-registration ─────────────────────────────────────────────────────

registerBrand('elegoo', {
  meta, schema, helper,
  renderJobCard:        renderElegooJobCard,
  renderTempCard:       renderElegooTempCard,
  renderFilamentCard:   renderElegooFilamentCard,
  renderSettingsWidget: schemaWidget(schema),
});
