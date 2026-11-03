/**
 * services/demo/faces/creality.js — a demo printer seen as a Creality K2 Plus
 * with one CFS (4 slots) on its local protocols.
 *
 * What the Creality driver uses (renderer/printers/creality/PROTOCOL.md), on the
 * printer's OWN loopback address (the driver dials fixed ports — no port in `ip`):
 *   ws  :9999   flat JSON pushes, `{"method":"get"|"set","params":{…}}` in,
 *               the printer's heart_beat (answered "ok")
 *   http :7125  Moonraker, for G-code (temperatures, jog, speed), print start, delete
 *   http :8080  the camera (MJPEG) — named in the record's `cameraUrl`
 *   http :80    thumbnails (shared low-port router, docs/DEMO-MODE.md §3.4)
 */
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { mjpeg, snapshot, listen, routeLowPort, runGcode } = require('./common');

const FILE = id => `${id}.gcode`;
const GCODE_DIR = '/usr/data/printer_data/gcodes';
const cfsColor = c => `#0${String(c || '').replace(/^#/, '').slice(-6).toLowerCase()}`;

function status(m, fans) {
  const n = m.nozzles()[0], bed = m.heaters.bed, ch = m.heaters.chamber, active = m.print && m.phase !== 'idle';
  return {
    nozzleTemp: n.cur.toFixed(2), targetNozzleTemp: n.target,
    bedTemp0: bed.cur.toFixed(2), targetBedTemp0: bed.target,
    boxTemp: ch ? Math.round(ch.cur) : 0,
    state: ['heating', 'leveling', 'printing', 'paused'].includes(m.phase) ? 1 : m.phase === 'complete' ? 2 : 0,
    isPaused: m.phase === 'paused' ? 1 : 0,
    deviceState: m.phase === 'error' ? 1 : 0,
    printProgress: active ? Math.floor(m.progress * 100) : 0,
    dProgress: active ? Math.floor(m.progress * 100) : 0,
    printLeftTime: active ? m.remainingSec : 0, printJobTime: active ? m.elapsedSec : 0,
    layer: active ? m.layer : 0, TotalLayer: active ? m.print.layersTotal : 0,
    printFileName: active ? `${GCODE_DIR}/${FILE(m.print.id)}` : '',
    lightSw: m.light ? 1 : 0, cfsConnect: 1,
    modelFanPct: m.fan, caseFanPct: fans.case, auxiliaryFanPct: fans.aux,
    curFeedratePct: m.speedPct, curFlowratePct: 100,
    curPosition: `X:${m.position.x.toFixed(2)} Y:${m.position.y.toFixed(2)} Z:${m.position.z.toFixed(2)}`,
    maxNozzleTemp: 350, maxBedTemp: 120,
    err: m.phase === 'error' ? { errcode: 1, key: 1, value: m.message || 'Error' } : { errcode: 0, key: 0, value: '' },
  };
}

/** `cfs.vendor[i]` and `cfs.ext` hold what modifyMaterial last wrote (the Machine keeps material + colour of the CFS slots). */
function boxsInfo(m, cfs) {
  return { boxsInfo: { materialBoxs: [
    // The external spool (type 1), then the CFS (type 0) — absent on a model without one.
    { id: 0, type: 1, materials: [{ id: 0, vendor: cfs.ext.vendor, type: cfs.ext.type, color: cfs.ext.color, state: 1, selected: m.slots.length ? 0 : 1 }] },
    ...(m.slots.length ? [{ id: 1, type: 0, temp: 27, humidity: 41, materials: m.slots.map((s, i) => ({
      id: i, vendor: s.empty ? '' : cfs.vendor[i] || 'Generic', type: s.empty ? '' : s.material, color: s.empty ? '' : cfsColor(s.color),
      state: s.empty ? 0 : 1, selected: i === m.activeSlot ? 1 : 0,
    })) }] : []),
  ] } };
}

function fileList(library) {
  return { retGcodeFileInfo2: library.list().map((p, i) => ({
    name: FILE(p.id), path: `${GCODE_DIR}/${FILE(p.id)}`, create_time: 1760000000 - i * 3600, timeCost: p.durationReal,
    material: p.slots.map(s => s.material).join(';'), materialColors: p.slots.map(s => s.color).join(';'),
    filamentWeight: p.slots.map(() => '25.4').join(','), nozzleTemp: p.nozzleTemp * 100, bedTemp: p.bedTemp * 100,
    thumbnail: `/usr/data/creality/upload/humbnail/${p.id}.png`,
  })) };
}

async function start({ machine: m, address: host, library, record = {} }) {
  // The camera port is the one the record names (8080 unless told otherwise).
  const camPort = Number(String(record.cameraUrl || '').match(/:(\d+)\//)?.[1]) || 8080;
  const fans = { case: 0, aux: 0 };
  const cfs = { vendor: [], ext: { vendor: 'Generic', type: 'PLA', color: '#0ffffff' } };
  const mode = { relative: false };
  const closers = [];
  const camStreams = new Set();

  // ── :9999 WebSocket ────────────────────────────────────────────────────────
  const wsHttp = http.createServer((req, res) => { res.writeHead(426); res.end(); });
  const wss = new WebSocketServer({ server: wsHttp });
  const sendAll = obj => { const s = JSON.stringify(obj); for (const c of wss.clients) if (c.readyState === 1) c.send(s); };
  wss.on('connection', ws => {
    ws.on('message', raw => {
      const text = String(raw);
      if (text === 'ok') return;   // the client's heart_beat answer
      let msg; try { msg = JSON.parse(text); } catch (_) { return; }
      const p = msg.params || {};
      if (msg.method === 'get') {
        if (p.printerInfo) {
          ws.send(JSON.stringify({ hostname: `K2Plus-DEMO${m.id.slice(0, 4)}`, model: 'K2 Plus', modelVersion: 'demo', deviceSn: `DEMO${m.id.slice(0, 10).toUpperCase()}`, ...status(m, fans) }));
          return;
        }
        ws.send(JSON.stringify(status(m, fans)));
        if (p.boxsInfo) ws.send(JSON.stringify(boxsInfo(m, cfs)));
        if (p.getGcodeFileInfo2 || p.reqGcodeList) ws.send(JSON.stringify(fileList(library)));
        return;
      }
      if (msg.method !== 'set') return;
      if (p.lightSw != null) m.setLight(Number(p.lightSw) === 1);
      if (p.pause != null) Number(p.pause) === 1 ? m.pause() : m.resume();
      if (p.stop != null && Number(p.stop) === 1) m.stop();
      if (p.gcodeCmd) {
        const g = String(p.gcodeCmd), fan = g.match(/^M106\s+P(\d)\s+S(\d+)/i);
        if (fan) {
          const pct = Math.round(Number(fan[2]) / 2.55);
          if (fan[1] === '0') m.setFan(pct); else if (fan[1] === '1') fans.case = pct; else fans.aux = pct;
        } else { try { runGcode(m, g, mode); } catch (_) {} }
      }
      if (p.modifyMaterial) {
        const mm = p.modifyMaterial;
        const color = `#${String(mm.color || '').replace(/^#/, '').slice(-6)}`;
        if (Number(mm.boxId) >= 1) {
          if (m.setSlot(Number(mm.id), { material: mm.type, color, empty: false }) && mm.vendor != null) cfs.vendor[Number(mm.id)] = mm.vendor;
        } else cfs.ext = { vendor: mm.vendor || 'Generic', type: mm.type || '', color: `#0${color.slice(1).toLowerCase()}` };
      }
      ws.send(JSON.stringify(status(m, fans)));
      if (p.modifyMaterial || p.feedInOrOut) ws.send(JSON.stringify(boxsInfo(m, cfs)));
    });
  });
  // The printer pushes on its own: telemetry every second, the CFS every 5 s, a heart_beat every 10 s.
  let tick = 0;
  const pushT = setInterval(() => {
    tick++;
    sendAll(status(m, fans));
    if (tick % 5 === 0) sendAll(boxsInfo(m, cfs));
    if (tick % 10 === 0) sendAll({ ModeCode: 'heart_beat' });
  }, 1000);
  await listen(wsHttp, host, 9999);
  closers.push(() => { clearInterval(pushT); for (const c of wss.clients) c.terminate(); wss.close(); wsHttp.close(); });

  try {
    // ── :7125 Moonraker (G-code, print start, delete) ─────────────────────────
    const moon = http.createServer((req, res) => {
      const u = new URL(req.url, `http://${host}:7125`), p = u.pathname;
      const ok = r => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ result: r })); };
      const err = msg => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code: 400, message: msg } })); };
      req.resume();
      if (p === '/printer/gcode/script') { try { runGcode(m, u.searchParams.get('script'), mode); return ok('ok'); } catch (e) { return err(e.message); } }
      if (p === '/printer/print/start') {
        if (m.isBusy) return err('Printer is busy');
        m.start(String(u.searchParams.get('filename') || '').split('/').pop().replace(/\.gcode$/, '') || undefined);
        return ok('ok');
      }
      if (req.method === 'DELETE' && p.startsWith('/server/files/gcodes/')) return ok({ item: { path: decodeURIComponent(p.slice(21)) } });
      res.writeHead(404); res.end();
    });
    // On this computer's network address the K2 leaves 7125 to the Snapmaker
    // (whose port is fixed everywhere); its G-code channel is then loopback-only.
    if (host.startsWith('127.')) {
      try { await listen(moon, host, 7125); closers.push(() => moon.close()); }
      catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
    }

    // ── :8080 camera ─────────────────────────────────────────────────────────
    const cam = http.createServer((req, res) => {
      const u = new URL(req.url, `http://${host}:${camPort}`);
      req.resume();
      if (u.searchParams.get('action') === 'stream') return mjpeg(res, library, m, camStreams);
      return snapshot(res, library, m);
    });
    await listen(cam, host, camPort);
    closers.push(() => { for (const r of camStreams) { try { r.destroy(); } catch (_) {} } cam.close(); });
  } catch (e) {
    closers.forEach(c => c());
    throw e;
  }

  // ── :80 thumbnails (optional — the job card falls back to the model picture) ──
  try {
    closers.push(await routeLowPort(80, host, (req, res) => {
      const u = new URL(req.url, `http://${host}`);
      const th = u.pathname.match(/^\/downloads\/humbnail\/(.+)\.png$/);
      const id = th ? decodeURIComponent(th[1]) : u.pathname === '/downloads/original/current_print_image.png' ? m.print?.id : null;
      const t = id && library.thumbnail(id);
      if (!t) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(t);
    }));
  } catch (_) { /* port 80 taken by something else: no thumbnails, everything else works */ }

  return { close() { closers.forEach(c => { try { c(); } catch (_) {} }); } };
}

module.exports = {
  brand: 'creality', slotCount: 4, chamber: true, start,
  // Fixed ports → its own loopback host. The camera is named explicitly.
  recordFields: host => ({ ip: host, cameraUrl: `http://${host}:8080/?action=stream` }),
  addressOf: rec => String(rec.ip || ''),
};
