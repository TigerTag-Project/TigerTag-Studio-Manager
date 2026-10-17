/**
 * printers/elegoo/sdcp.js — Elegoo printers that speak SDCP v3 (Centauri
 * Carbon 1; Saturn/Mars resin range use the same protocol). BETA.
 *
 * The Centauri Carbon 2 speaks MQTT (index.js). The CC1 does not: it answers
 * `M99999` on UDP 3000 (main: `elegoo:sdcp-discover` / `elegoo:sdcp-probe`) and
 * talks SDCP over a plain WebSocket, no authentication:
 *
 *   ws://<ip>:3030/websocket
 *   request  { Id, Data: { Cmd, Data, RequestID, MainboardID, TimeStamp, From: 0 },
 *              Topic: "sdcp/request/<MainboardID>" }
 *   replies  sdcp/response/<id> (Ack), sdcp/status/<id> (pushed), sdcp/attributes/<id>
 *
 * Verified on CC1 firmware V1.4.49 (issue #41): discovery, connection, Cmd 0
 * (status) and Cmd 1 (attributes). NOT yet verified on that firmware: 129 pause,
 * 130 stop, 131 resume — taken from the OpenCentauri API doc. 386 (camera) is
 * confirmed since. 324 (Canvas slots, see canvas.js) comes from the Home Assistant
 * integration and is NOT verified on a real CC1 with a Canvas.
 *
 * Same `conn.data` field names as the MQTT driver where they overlap
 * (printState, printProgress 0..1, printRemainingMs, printFilename,
 * printLayerCur/Total, cameraUrl), so the printers table, the board and the
 * camera widget read either driver the same way. index.js routes every
 * exported entry point here when `printer.protocol === "sdcp"`.
 */
import { ctx } from '../context.js';
import { betaBadgeHtml } from '../beta-badge.js';
import { jobBar, jobBarFill } from '../job-bar.js';
import { CMD_GET_CANVAS_STATUS, sdcpCanvasPresent, sdcpParseCanvas, sdcpCanvasSlots } from './canvas.js';

const WS_PORT = 3030;
const STATUS_EVERY_MS = 5000;     // the printer also pushes on its own (~2 s)
const PING_EVERY_MS = 10000;
const CANVAS_EVERY_MS = 30000;    // the Canvas changes when a spool does: no need to ask more often
const MAX_FAILS_BEFORE_REFIND = 3;

const _conns = new Map();          // `${brand}:${id}` → conn

export function sdcpIsPrinter(p) {
  return !!p && (p.protocol === 'sdcp' || p.discovery?.protocol === 'sdcp');
}
export function sdcpKey(p) { return `${p.brand}:${p.id}`; }
export function sdcpGetConn(key) { return _conns.get(key) ?? null; }
export function sdcpOwns(key) { return _conns.has(key); }

/* The printer answers Cmd 386 with a bare "host:port/path" — no scheme (seen on a
   CC1 V1.4.49: "<ip>:3031/video"). Put into an <img>, that reads as a path
   relative to the app and never loads, so the camera failed with the printer
   perfectly healthy. Give it the scheme it lacks, and never trust a host the
   printer cannot know about: an empty / 0.0.0.0 / loopback host means "the
   address you reached me on". Anything that is not http(s) is refused — the
   result ends up in a `src`. Returns null when nothing usable is left. */
export function sdcpVideoUrl(raw, printerIp) {
  let u = String(raw ?? '').trim();
  if (!u) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'http://' + u.replace(/^\/+/, '');
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (printerIp && ['', '0.0.0.0', 'localhost', '127.0.0.1'].includes(url.hostname)) url.hostname = printerIp;
    return url.toString();
  } catch (_) { return null; }
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Math.random()).slice(2));

// ── Debug request log (shown in debug mode) ──────────────────────────────
const LOG_MAX = 100;
function logPush(conn, dir, raw, summary) {
  if (!conn || conn.logPaused) return;
  const ts = new Date().toLocaleTimeString([], { hour12: false });
  conn.log.push({ dir, ts, summary: summary || '', raw: typeof raw === 'string' ? raw : JSON.stringify(raw) });
  if (conn.log.length > LOG_MAX) conn.log.splice(0, conn.log.length - LOG_MAX);
}

// ── Connection ───────────────────────────────────────────────────────────

export function sdcpConnect(printer) {
  const key = sdcpKey(printer);
  const existing = _conns.get(key);
  if (existing && existing.ip === printer.ip && existing.ws) { existing.printer = printer; return; }
  if (existing) sdcpDisconnect(key);
  const conn = {
    key, ip: printer.ip, printer,
    mainboardId: printer.mainboardId || printer.discovery?.mainboardId || null,
    status: 'connecting', lastError: null, ws: null, fails: 0,
    retryTimer: null, statusTimer: null, pingTimer: null, closed: false,
    data: {
      printState: null, printProgress: 0, printRemainingMs: null, printFilename: null,
      printLayerCur: 0, printLayerTotal: null, printDuration: null,
      nozzleTemp: null, nozzleTarget: null, bedTemp: null, bedTarget: null, chamberTemp: null, chamberTarget: null,
      fanModel: null, fanAux: null, fanBox: null, speedPct: null,
      thumbnail: null, filaments: [{}],
      // Canvas hub (canvas.js): `canvasPresent` comes from the status push, `canvas` from command 324.
      canvasPresent: null, canvas: null, canvasAskedAt: 0, canvasRefused: false,
      // MJPEG on :3031 — Cmd 386 returns the exact URL; this is its documented default.
      cameraUrl: printer.ip ? `http://${printer.ip}:3031/video` : null,
      attributes: null,
    },
    log: [], logPaused: false, logExpanded: false,
  };
  _conns.set(key, conn);
  open(conn);
  notify(conn, true);
}

export function sdcpDisconnect(key) {
  const conn = _conns.get(key);
  if (!conn) return;
  conn.closed = true;
  clearTimeout(conn.retryTimer); clearInterval(conn.statusTimer); clearInterval(conn.pingTimer);
  try { conn.ws?.close(); } catch (_) {}
  _conns.delete(key);
}

async function ensureMainboardId(conn) {
  if (conn.mainboardId) return true;
  // Older records (or a printer whose board changed): ask it again.
  try {
    const r = await window.electronAPI?.elegooSdcpProbe?.(conn.ip);
    if (r?.ok && r.candidate?.mainboardId) {
      conn.mainboardId = r.candidate.mainboardId;
      ctx.savePrinterField?.('elegoo', conn.printer.id, 'mainboardId', conn.mainboardId);
      return true;
    }
  } catch (_) {}
  return false;
}

async function open(conn) {
  if (conn.closed || !_conns.has(conn.key)) return;
  if (!(await ensureMainboardId(conn))) {
    // No answer to M99999 — the printer is off or elsewhere.
    fail(conn, 'no SDCP answer on UDP 3000');
    return;
  }
  const url = `ws://${conn.ip}:${WS_PORT}/websocket`;
  logPush(conn, '…', { url }, `Connecting to ${url}  MainboardID:${conn.mainboardId}`);
  let ws;
  try { ws = new WebSocket(url); } catch (e) { fail(conn, e?.message || 'WebSocket error'); return; }
  conn.ws = ws;
  // A dead address makes the OS wait ~75 s; give up after 8 s instead.
  const openTimeout = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) { try { ws.close(); } catch (_) {} } }, 8000);
  ws.onopen = () => {
    clearTimeout(openTimeout);
    if (conn.ws !== ws) return;
    conn.fails = 0;
    conn.data.canvasAskedAt = 0; conn.data.canvasRefused = false;   // a new link starts over
    send(conn, 1);   // attributes
    send(conn, 0);   // status
    send(conn, 386, { Enable: 1 });   // camera on → VideoUrl
    askCanvas(conn);                  // Canvas slots (a printer without one answers "not connected" or refuses)
    clearInterval(conn.statusTimer);
    conn.statusTimer = setInterval(() => send(conn, 0), STATUS_EVERY_MS);
    clearInterval(conn.pingTimer);
    conn.pingTimer = setInterval(() => { try { ws.send('ping'); } catch (_) {} }, PING_EVERY_MS);
  };
  ws.onmessage = (ev) => onMessage(conn, ev.data);
  ws.onerror = () => {};
  ws.onclose = () => {
    clearTimeout(openTimeout);
    if (conn.ws !== ws) return;
    conn.ws = null;
    clearInterval(conn.statusTimer); clearInterval(conn.pingTimer);
    if (!conn.closed) fail(conn, 'WebSocket closed');
  };
}

function fail(conn, why) {
  if (conn.closed) return;
  const prev = conn.status;
  conn.status = 'offline';
  conn.lastError = why;
  conn.fails++;
  logPush(conn, '←', { error: why }, why);
  notify(conn, prev !== 'offline');
  if (conn.fails >= MAX_FAILS_BEFORE_REFIND) ctx.requestPrinterRefind?.('elegoo', conn.key);
  const delay = Math.min(2000 * (1 << Math.min(conn.fails - 1, 4)), 30000);
  clearTimeout(conn.retryTimer);
  conn.retryTimer = setTimeout(() => open(conn), delay);
}

function send(conn, cmd, data = {}) {
  const ws = conn.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN || !conn.mainboardId) return false;
  const msg = {
    Id: uuid(),
    Data: { Cmd: cmd, Data: data, RequestID: uuid(), MainboardID: conn.mainboardId, TimeStamp: Math.floor(Date.now() / 1000), From: 0 },
    Topic: `sdcp/request/${conn.mainboardId}`,
  };
  try { ws.send(JSON.stringify(msg)); } catch (_) { return false; }
  if (cmd !== 0) logPush(conn, '→', msg, `Cmd ${cmd}`);
  return true;
}

// ── Messages ─────────────────────────────────────────────────────────────

const num = v => (typeof v === 'number' && isFinite(v) ? v : null);

function onMessage(conn, raw) {
  if (raw === 'pong') return;
  let m; try { m = JSON.parse(raw); } catch (_) { return; }
  const topic = String(m.Topic || '');
  const prev = conn.status;
  if (topic.startsWith('sdcp/status/') && m.Status) {
    mergeStatus(conn, m.Status);
  } else if (topic.startsWith('sdcp/attributes/') && m.Attributes) {
    conn.data.attributes = m.Attributes;
    logPush(conn, '←', m, `attributes · ${m.Attributes.MachineName || ''} ${m.Attributes.FirmwareVersion || ''}`);
    const mac = m.Attributes.MainboardMAC;
    if (mac && conn.printer && !conn.printer.macAddress) ctx.savePrinterField?.('elegoo', conn.printer.id, 'macAddress', String(mac).toUpperCase());
  } else if (topic.startsWith('sdcp/response/')) {
    const d = m.Data || {};
    if (d.Cmd === 386 && d.Data?.VideoUrl) {
      const u = sdcpVideoUrl(d.Data.VideoUrl, conn.ip);
      if (u) conn.data.cameraUrl = u;   // else keep the default built from the address we reached it on
    }
    if (d.Cmd === CMD_GET_CANVAS_STATUS) {
      if (d.Data?.Ack === 0) { const c = sdcpParseCanvas(d.Data); if (c) conn.data.canvas = c; }
      else conn.data.canvasRefused = true;   // this firmware does not know the command: stop asking
    }
    if (d.Cmd !== 0) logPush(conn, '←', m, `Cmd ${d.Cmd} · Ack ${d.Data?.Ack ?? '?'}`);
    if ([129, 130, 131].includes(d.Cmd) && d.Data?.Ack !== 0) {
      try { ctx.toast(ctx.t('elgSdcpCmdRefused'), 'error'); } catch (_) {}
    }
  } else if (topic.startsWith('sdcp/error/') || topic.startsWith('sdcp/notice/')) {
    logPush(conn, '←', m, topic.split('/')[1]);
  } else {
    return;
  }
  if (conn.status !== 'connected') { conn.status = 'connected'; conn.lastError = null; }
  notify(conn, prev !== 'connected');
}

// PrintInfo.Status (SDCP v3): 0 idle, 1 homing, 2 dropping, 3 exposing, 4 lifting,
// 5 pausing, 6 paused, 7 stopping, 8 stopped, 9 complete, 10 file checking.
// CurrentStatus: 0 idle, 1 printing, 2 file transfer, 3 calibrating, 4 device test.
// While idle the printer keeps the LAST job's totals with Status 8 and an empty
// Filename, so "a job" is decided from CurrentStatus + Filename, never the totals.
function mergeStatus(conn, st) {
  const d = conn.data;
  const cur = Array.isArray(st.CurrentStatus) ? st.CurrentStatus : [st.CurrentStatus];
  const pi = st.PrintInfo || {};
  const sub = Number(pi.Status);
  const file = String(pi.Filename || '');
  let state;
  if (cur.includes(1)) state = sub === 6 || sub === 5 ? 'paused' : sub === 7 ? 'cancelled' : 'printing';
  else if (cur.includes(3)) state = 'busy';
  else if (cur.includes(2)) state = 'busy';
  else if (file && sub === 9) state = 'complete';
  else if (file && sub === 8) state = 'cancelled';
  else state = 'standby';
  d.printState = state;
  const running = state === 'printing' || state === 'paused';
  d.printFilename = file || null;
  d.printLayerCur = running ? (num(pi.CurrentLayer) ?? 0) : 0;
  d.printLayerTotal = running ? num(pi.TotalLayer) : null;
  const pct = num(pi.Progress) ?? (num(pi.TotalLayer) ? (num(pi.CurrentLayer) || 0) / pi.TotalLayer * 100 : 0);
  d.printProgress = state === 'complete' ? 1 : running ? Math.max(0, Math.min(1, pct / 100)) : 0;
  // Ticks are seconds (a 125-layer job reports TotalTicks 6513).
  const total = num(pi.TotalTicks), now = num(pi.CurrentTicks);
  d.printRemainingMs = running && total && now != null && total > now ? (total - now) * 1000 : null;
  d.printDuration = running ? now : null;
  d.nozzleTemp = num(st.TempOfNozzle); d.nozzleTarget = num(st.TempTargetNozzle);
  d.bedTemp = num(st.TempOfHotbed);   d.bedTarget = num(st.TempTargetHotbed);
  d.chamberTemp = num(st.TempOfBox);  d.chamberTarget = num(st.TempTargetBox);
  const f = st.CurrentFanSpeed || {};
  d.fanModel = num(f.ModelFan); d.fanAux = num(f.AuxiliaryFan); d.fanBox = num(f.BoxFan);
  d.speedPct = num(pi.PrintSpeedPct) ?? num(pi.PrintSpeed);
  // The status push says whether a Canvas is plugged in (when it says). Unless it says "none"
  // or the firmware refused the command, the slots are asked for again now and then.
  const hub = sdcpCanvasPresent(st);
  if (hub !== null) { d.canvasPresent = hub; if (!hub) d.canvas = null; }
  if (d.canvasPresent !== false && !d.canvasRefused && Date.now() - d.canvasAskedAt >= CANVAS_EVERY_MS) askCanvas(conn);
}

function askCanvas(conn) {
  conn.data.canvasAskedAt = Date.now();
  send(conn, CMD_GET_CANVAS_STATUS);
}

// ── Job control (BETA — not yet confirmed on firmware 1.4.x) ──────────────

/** action: "pause" | "resume" | "stop". */
export function sdcpJobControl(printer, action) {
  const conn = _conns.get(sdcpKey(printer));
  if (!conn) return false;
  const cmd = action === 'pause' ? 129 : action === 'resume' ? 131 : 130;
  const ok = send(conn, cmd);
  setTimeout(() => send(conn, 0), 600);
  return ok;
}

export function sdcpWireLive(root, printer) {
  if (!root || !printer) return;
  root.querySelectorAll('[data-sdcp-job]').forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    const action = btn.dataset.sdcpJob;
    ctx.setupHoldToConfirm(btn, action === 'stop' ? 1500 : 1200, () => sdcpJobControl(printer, action));
  });
}

// ── Board helpers ────────────────────────────────────────────────────────
// A Canvas (canvas.js) gives its trays; without one — or until it has answered —
// the lone external arm is one unknown slot.
export function sdcpGetSlots(printer) {
  const conn = _conns.get(sdcpKey(printer));
  if (!conn || conn.status !== 'connected') return [];
  const trays = sdcpCanvasSlots(conn.data.canvas);
  if (trays.length) return trays;
  return [{ key: 't0', label: 'Ext.', color: null, material: null, detail: null, vendor: null, empty: true }];
}
export function sdcpGetUnits(printer) {
  const slots = sdcpGetSlots(printer);
  if (!slots.length) return [];
  const hub = sdcpCanvasSlots(_conns.get(sdcpKey(printer))?.data.canvas).length > 0;
  /* Same two units as the CC2: the Canvas hub or the lone external arm, never both. */
  if (hub) return [{ kind: 'holder', index: 0, label: '', hwId: null, rows: 1, cols: slots.length,
    slots: slots.map((s, i) => ({ ...s, index: i, hw: { canvasId: 0, trayId: i } })) }];
  return [{ kind: 'ext', index: 0, label: '', hwId: null, rows: 1, cols: 1,
    slots: slots.map((s, i) => ({ ...s, index: i, hw: { external: true } })) }];
}

// ── Rendering (shared .snap-* markup, like every other brand) ────────────

const pair = (c, t) => {
  const a = typeof c === 'number' ? `${Math.round(c)}` : '—';
  return typeof t === 'number' ? `${a}/${Math.round(t)}°C` : `${a}°C`;
};
function fmtDuration(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
const STATE_KEYS = {
  printing: 'snapState_printing', paused: 'snapState_paused', complete: 'snapState_complete',
  cancelled: 'snapState_cancelled', standby: 'snapState_standby', busy: 'elgState_busy',
};

export function sdcpTempHtml(conn) {
  const d = conn.data;
  const pills = [];
  const pill = (label, icon, c, t, cls = '') => {
    const heating = typeof t === 'number' && t > 0 && typeof c === 'number' && c < t - 1;
    return `<div class="snap-temp${cls}${heating ? ' snap-temp--heating' : ''}"><span class="snap-temp-label">${label}</span>${icon}<span class="snap-temp-val">${ctx.esc(pair(c, t))}</span></div>`;
  };
  if (d.nozzleTemp != null) pills.push(pill('E1', ctx.SNAP_ICON_NOZZLE, d.nozzleTemp, d.nozzleTarget));
  if (d.bedTemp != null) pills.push(pill('BED', ctx.SNAP_ICON_BED, d.bedTemp, d.bedTarget, ' snap-temp--bed'));
  if (d.chamberTemp != null) pills.push(pill('CASE', ctx.SNAP_ICON_CHAMBER, d.chamberTemp, d.chamberTarget, ' snap-temp--chamber'));
  if (!pills.length) return '';
  return `<section class="snap-block"><h4 class="snap-block-title">${ctx.esc(ctx.t('snapTemperatureTitle'))}</h4><div class="snap-temps">${pills.join('')}</div></section>`;
}

function jobHtml(p, conn) {
  const d = conn.data;
  const state = d.printState || 'standby';
  const running = state === 'printing' || state === 'paused';
  const bar = jobBar(conn, state, (d.printProgress || 0) * 100);
  const pct = running || bar.tone !== 'idle' ? bar.pct : 0;
  const img = ctx.printerImageUrlFor(p.brand, p.printerModelId) || ctx.printerImageUrl(ctx.findPrinterModel(p.brand, '0'));
  const name = (running || state === 'complete') && d.printFilename ? String(d.printFilename).split('/').pop() : '';
  const paused = state === 'paused';
  const btns = running ? `
      <button type="button" class="cre-action-btn cre-action-btn--pause" data-sdcp-job="${paused ? 'resume' : 'pause'}" aria-label="${ctx.esc(ctx.t(paused ? 'snapPrintResume' : 'snapPrintPause'))}">
        <span class="icon ${paused ? 'icon-play' : 'icon-pause'} icon-14"></span><span class="hold-progress"></span>
      </button>
      <button type="button" class="cre-action-btn cre-action-btn--stop" data-sdcp-job="stop" aria-label="${ctx.esc(ctx.t('snapPrintCancel'))}">
        <span class="icon icon-stop icon-14"></span><span class="hold-progress"></span>
      </button>` : '';
  const layers = running && d.printLayerTotal ? `<span class="snap-job-layers">${d.printLayerCur || 0}/${d.printLayerTotal}</span>` : '';
  const lbl = ctx.t(STATE_KEYS[state] || '') || state;
  return `
    <div class="snap-job snap-job--${ctx.esc(state)}">
      <div class="snap-job-thumb"${img ? ` style="background-image:url('${ctx.esc(img)}')"` : ''}></div>
      <div class="snap-job-info">
        <div class="elg-job-name-row elg-job-name-row--with-btns">
          ${name ? `<div class="snap-job-name" title="${ctx.esc(name)}">${ctx.esc(name)}</div>` : `<div class="snap-job-name snap-job-name--idle">${ctx.esc(ctx.t('snapJobNoActive') || '—')}</div>`}
          <div class="cre-actions elg-job-actions">${btns}</div>
        </div>
        <div class="snap-job-stats">
          <span class="snap-job-pct">${pct}%</span>
          <span class="snap-job-time">${ctx.SNAP_ICON_CLOCK} <span>${ctx.esc(running && d.printRemainingMs != null ? fmtDuration(d.printRemainingMs) : running ? '—' : '0m')}</span></span>
        </div>
        <div class="snap-job-bar">${jobBarFill(bar)}</div>
        <div class="snap-job-foot"><span class="snap-job-state snap-job-state--${ctx.esc(state)}">${ctx.esc(lbl)}</span>${layers}</div>
      </div>
    </div>`;
}

function fansHtml(conn) {
  const d = conn.data;
  const chip = (icon, label, v) => `<div class="ffg-chip"><span class="icon icon-${icon} icon-13"></span><span>${ctx.esc(label)} ${Math.round(v)}%</span></div>`;
  const chips = [];
  if (d.fanModel != null) chips.push(chip('fan', ctx.t('ffgFanCooling') || 'Fan', d.fanModel));
  if (d.fanBox != null)   chips.push(chip('fan', ctx.t('ffgFanChamber') || 'Chamber', d.fanBox));
  if (d.speedPct != null) chips.push(chip('speed', ctx.t('prusaSpeed') || 'Speed', d.speedPct));
  return chips.length ? `<section class="snap-block ffg-status-block"><div class="ffg-status-row">${chips.join('')}</div></section>` : '';
}

export function sdcpLiveInner(p) {
  const conn = _conns.get(sdcpKey(p));
  if (!conn) return `<div class="snap-empty"><span class="icon icon-cloud icon-18"></span><span>${ctx.esc(ctx.t('snapNoConnection'))}</span></div>`;
  const beta = betaBadgeHtml();
  if (conn.status !== 'connected') return beta;
  return `${beta}${jobHtml(p, conn)}${fansHtml(conn)}${sdcpTempHtml(conn)}`;
}

export function sdcpLogInner(p) {
  const log = _conns.get(sdcpKey(p))?.log || [];
  if (!log.length) return `<div class="snap-log-empty">${ctx.esc(ctx.t('snapLogEmpty'))}</div>`;
  return log.slice().reverse().map((e, i) => {
    let pretty = e.raw;
    try { pretty = JSON.stringify(JSON.parse(e.raw), null, 2); } catch (_) {}
    return `
      <div class="snap-log-row snap-log-row--${e.dir === '→' ? 'out' : 'in'}${e.expanded ? ' snap-log-row--expanded' : ''}" data-log-idx="${log.length - 1 - i}">
        <button type="button" class="snap-log-row-head" data-row-toggle="1">
          <span class="snap-log-dir">${ctx.esc(e.dir)}</span><span class="snap-log-ts">${ctx.esc(e.ts)}</span>
          <span class="snap-log-summary">${ctx.esc(e.summary)}</span><span class="snap-log-row-chev icon icon-chevron-r icon-13"></span>
        </button>
        <div class="snap-log-detail"${e.expanded ? '' : ' hidden'}><pre>${ctx.esc(pretty)}</pre></div>
      </div>`;
  }).join('');
}

// ── Change propagation ───────────────────────────────────────────────────
let _statusRaf = null, _gridRaf = null, _renderRaf = null;
function notify(conn, statusChanged) {
  if (statusChanged) {
    if (!_statusRaf) _statusRaf = requestAnimationFrame(() => { _statusRaf = null; ctx.onPrinterGridChange(); });
    ctx.onPrinterStatusChange?.(conn.key, conn.status);
  }
  if (!_gridRaf) _gridRaf = requestAnimationFrame(() => { _gridRaf = null; ctx.onGridJobsChange(); });
  const active = ctx.getActivePrinter();
  if (!active || sdcpKey(active) !== conn.key || _renderRaf) return;
  _renderRaf = requestAnimationFrame(() => {
    _renderRaf = null;
    const live = document.getElementById('elgLive');
    if (live) { live.innerHTML = sdcpLiveInner(active); sdcpWireLive(live, active); }
    const logHost = document.getElementById('elgLog');
    if (logHost) logHost.innerHTML = sdcpLogInner(active);
    const count = document.getElementById('elgLogCount');
    if (count) count.textContent = String(conn.log.length);
  });
}
