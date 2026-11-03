/**
 * services/demo/faces/snapmaker.js — a demo printer seen as a Snapmaker U1
 * (4 toolheads, one filament each) on its Moonraker.
 *
 * What the Snapmaker driver uses (renderer/printers/snapmaker/PROTOCOL.md), on
 * the printer's OWN loopback address (port 7125 is fixed in the driver):
 *   ws   :7125/websocket  JSON-RPC — objects.subscribe / query / list,
 *                         server.webcams.list (empty → "still" camera),
 *                         camera.start_monitor, printer.gcode.script;
 *                         notify_status_update pushed every second
 *   http :7125            info, file metadata + thumbnails, file list,
 *                         camera/monitor.jpg, print pause / resume / cancel / stop / start
 * The renderer fetch()es the HTTP side, so every answer carries CORS.
 */
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { snapshot, listen, runGcode } = require('./common');

const FILE = id => `${id}.gcode`;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' };
const STATE = {
  idle: 'standby', heating: 'printing', leveling: 'printing', printing: 'printing',
  paused: 'paused', complete: 'complete', cancelled: 'cancelled', error: 'error',
};
const SENSORS = [0, 1, 2, 3].map(i => `filament_motion_sensor e${i}_filament`);
const rgba = c => `${String(c || '').replace(/^#/, '').slice(0, 6).toUpperCase()}FF`;

/** `cavity.vendor` / `cavity.subtype`: what SET_PRINT_FILAMENT_CONFIG last said per head (the Machine keeps material + colour). */
function objects(m, cavity) {
  const active = m.print && m.phase !== 'idle';
  const o = {
    print_stats: {
      state: STATE[m.phase] || 'standby', filename: active ? FILE(m.print.id) : '',
      print_duration: active ? m.elapsedSec : 0, total_duration: active ? m.elapsedSec : 0,
      message: m.message || '',
      info: { current_layer: active ? m.layer : null, total_layer: active ? m.print.layersTotal : null },
    },
    display_status: { progress: active ? m.progress : 0, message: null },
    virtual_sdcard: { progress: active ? m.progress : 0, is_active: m.isBusy && m.phase !== 'paused', file_path: active ? FILE(m.print.id) : null },
    heater_bed: { temperature: +m.heaters.bed.cur.toFixed(2), target: m.heaters.bed.target },
    toolhead: { position: [m.position.x, m.position.y, m.position.z, 0], homed_axes: [...m.homed].sort().join(''), extruder: m.activeTool ? `extruder${m.activeTool}` : 'extruder' },
    fan: { speed: m.fan / 100 },
    'fan_generic cavity_fan': { speed: cavity.fan },
    gcode_move: { speed_factor: m.speedPct / 100 },
    'led cavity_led': { color_data: [[m.light ? 1 : 0, m.light ? 1 : 0, m.light ? 1 : 0, m.light ? 1 : 0]] },
    print_task_config: {
      filament_color_rgba: m.slots.map(s => (s.empty ? '00000000' : rgba(s.color))),
      filament_vendor: m.slots.map((s, i) => (s.empty ? '' : cavity.vendor[i] || 'Generic')),
      filament_type: m.slots.map(s => (s.empty ? '' : s.material)),
      filament_sub_type: m.slots.map((s, i) => (s.empty ? '' : cavity.subtype[i] || '')),
      filament_official: m.slots.map(() => false),
    },
  };
  m.nozzles().forEach((h, i) => { o[i ? `extruder${i}` : 'extruder'] = { temperature: +h.cur.toFixed(2), target: h.target }; });
  SENSORS.forEach((k, i) => { o[k] = { filament_detected: !!m.slots[i] && !m.slots[i].empty, enabled: true }; });
  return o;
}

/** The fields asked for (null / [] = all), like Moonraker. */
function pick(all, want) {
  const status = {};
  for (const [name, fields] of Object.entries(want || {})) {
    const o = all[name];
    if (!o) continue;
    status[name] = Array.isArray(fields) && fields.length ? Object.fromEntries(fields.filter(f => f in o).map(f => [f, o[f]])) : o;
  }
  return status;
}

async function start({ machine: m, address: host, library }) {
  const cavity = { fan: 0, vendor: [], subtype: [] };
  const mode = { relative: false };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://${host}:7125`), p = u.pathname;
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', ...CORS }); res.end(JSON.stringify(body)); };
    req.resume();
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (p === '/server/info') return send(200, { result: { klippy_connected: true, klippy_state: 'ready', moonraker_version: 'v0.9.3-demo', components: ['file_manager', 'webcam'] } });
    if (p === '/printer/info') return send(200, { result: { state: 'ready', state_message: 'Printer is ready', hostname: `U1-DEMO${m.id.slice(0, 4)}`, software_version: 'demo' } });
    if (p === '/machine/system_info') return send(200, { result: { system_info: { product_info: {
      machine_type: 'Snapmaker U1', device_name: `U1-DEMO${m.id.slice(0, 4)}`, serial_number: `DEMO${m.id.slice(0, 10).toUpperCase()}`,
    } } } });
    if (p === '/server/files/list') return send(200, { result: library.list().map((x, i) => ({ path: FILE(x.id), modified: 1760000000 - i * 3600, size: 2_000_000, permissions: 'rw' })) });
    if (p === '/server/files/metadata') {
      const pr = library.get(String(u.searchParams.get('filename') || '').split('/').pop().replace(/\.gcode$/, ''));
      if (!pr) return send(404, { error: { code: 404, message: 'File not found' } });
      return send(200, { result: {
        filename: FILE(pr.id), estimated_time: pr.durationReal, slicer: 'Snapmaker Orca',
        thumbnails: [{ width: 300, height: 300, size: 1, relative_path: `.thumbs/${pr.id}-300x300.png` }],
      } });
    }
    const th = p.match(/^\/server\/files\/gcodes\/(?:.*\/)?\.thumbs\/(.+)-300x300\.png$/);
    if (th) {
      const t = library.thumbnail(decodeURIComponent(th[1]));
      if (!t) return send(404, {});
      res.writeHead(200, { 'Content-Type': 'image/png', ...CORS }); return res.end(t);
    }
    if (p === '/server/files/camera/monitor.jpg') return snapshot(res, library, m, CORS);
    const pa = p.match(/^\/printer\/print\/(pause|resume|cancel|stop|start)$/);
    if (pa) {
      if (pa[1] === 'pause') m.pause();
      else if (pa[1] === 'resume') m.resume();
      else if (pa[1] === 'start') { if (!m.isBusy) m.start(String(u.searchParams.get('filename') || '').split('/').pop().replace(/\.gcode$/, '') || undefined); }
      else m.stop();
      return send(200, { result: 'ok' });
    }
    return send(404, { error: { code: 404, message: `Not found: ${p}` } });
  });

  const wss = new WebSocketServer({ server, path: '/websocket' });
  const subs = new Map();   // socket → subscribed objects
  wss.on('connection', ws => {
    subs.set(ws, null);
    ws.on('close', () => subs.delete(ws));
    ws.on('message', raw => {
      let msg; try { msg = JSON.parse(String(raw)); } catch (_) { return; }
      const reply = body => ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...body }));
      const params = msg.params || {};
      switch (msg.method) {
        case 'printer.objects.subscribe':
          subs.set(ws, params.objects || {});   // replaces the previous subscription, like Moonraker
          return reply({ result: { eventtime: process.uptime(), status: pick(objects(m, cavity), params.objects) } });
        case 'printer.objects.query':
          return reply({ result: { eventtime: process.uptime(), status: pick(objects(m, cavity), params.objects) } });
        case 'printer.objects.list':
          return reply({ result: { objects: Object.keys(objects(m, cavity)) } });
        case 'server.webcams.list':
          return reply({ result: { webcams: [] } });   // → the client's "still" camera (monitor.jpg)
        case 'camera.start_monitor':
          return reply({ result: 'ok' });
        case 'printer.gcode.script':
          try {
            runGcode(m, params.script, mode, (cmd, p) => {
              if (cmd === 'SET_FAN_SPEED' && p.FAN === 'cavity_fan') { cavity.fan = Math.max(0, Math.min(1, Number(p.SPEED) || 0)); return true; }
              if (cmd === 'SET_LED' && p.LED === 'cavity_led') { m.setLight(['RED', 'GREEN', 'BLUE', 'WHITE'].some(k => Number(p[k]) > 0)); return true; }
              if (cmd === 'SET_PRINT_FILAMENT_CONFIG') {
                const c = String(p.FILAMENT_COLOR_RGBA || '').replace(/^#/, '');
                const i = Number(p.CONFIG_EXTRUDER);
                if (!m.setSlot(i, { material: p.FILAMENT_TYPE, ...(c ? { color: `#${c.slice(0, 6).toUpperCase()}` } : {}), empty: false })) throw new Error(`Unknown extruder ${p.CONFIG_EXTRUDER}`);
                if (p.VENDOR != null) cavity.vendor[i] = p.VENDOR;
                if (p.FILAMENT_SUBTYPE != null) cavity.subtype[i] = p.FILAMENT_SUBTYPE;
                return true;
              }
              if (cmd === 'INNER_FILAMENT_UNLOAD') { m.setSlot(m.activeTool, { empty: true }); return true; }
              if (cmd === 'MANUAL_FEEDING') { if (p.STAGE === 'extrude') m.setSlot(Number(p.EXTRUDER), { empty: false }); return true; }
              return false;
            });
            return reply({ result: 'ok' });
          } catch (e) { return reply({ error: { code: 400, message: e.message } }); }
        default:
          return reply({ result: {} });
      }
    });
  });
  const pushT = setInterval(() => {
    const all = objects(m, cavity);
    for (const [ws, want] of subs) {
      if (ws.readyState !== 1 || !want) continue;
      ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'notify_status_update', params: [pick(all, want), process.uptime()] }));
    }
  }, 1000);

  await listen(server, host, 7125);
  return { close() { clearInterval(pushT); for (const c of wss.clients) c.terminate(); wss.close(); server.close(); } };
}

module.exports = {
  brand: 'snapmaker', slotCount: 4, tools: 4, start,
  recordFields: host => ({ ip: host }),
  addressOf: rec => String(rec.ip || ''),
};
