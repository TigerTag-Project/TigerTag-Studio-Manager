/**
 * services/demo/faces/klipper.js — a demo printer seen as Klipper + Moonraker.
 *
 * Serves the Moonraker HTTP endpoints the Klipper plugin uses
 * (renderer/printers/klipper/PROTOCOL.md), built from the engine's Machine on
 * every request. A machine with several slots shows them as an AFC unit
 * (Box Turtle lanes). Commands go back to the Machine.
 *
 * The same server also answers Moonraker's WebSocket, `/websocket` (JSON-RPC 2.0),
 * for devices that speak it (TigerSpool, Tiger Touch): server.connection.identify
 * (with the API key when the record has one), printer.objects.list / query /
 * subscribe (notify_status_update every second), printer.gcode.script,
 * printer.print.*, server.info, printer.info, and one notify_proc_stat_update a
 * second like the real Moonraker. HTTP and WebSocket read and write the same
 * Machine: a write on one shows in the next read on the other. No Origin check
 * (devices send none).
 *
 * The model "Elegoo Centauri Carbon (OpenCentauri COSMOS)" (catalog id 166) plays
 * that machine as reported in issue 167: a CANVAS whose four lanes `CANVAS_n` are
 * published twice, as `AFC_stepper` AND `AFC_lane`; the chamber as a plain
 * `temperature_sensor`; the sensors `mcu_toolhead`, `mcu_bed`, `Mcu_canvas`, the
 * `mainboard` fan; the lights `led case` and `led hotend`.
 *
 * The model "Voron 2.4" (catalog id 2), the classic ERCF machine, plays Klipper +
 * Happy Hare instead: its four gates are the `mmu` object (num_gates, gate,
 * gate_status 1 / 0 / -1, gate_material, gate_color "RRGGBB", gate_spool_id,
 * ttg_map), no AFC, written with MMU_GATE_MAP GATE= MATERIAL= COLOR= SPOOLID=
 * AVAILABLE=; a gate that does not exist is an error.
 */
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { mjpeg, snapshot, runGcode } = require('./common');

const STATE = {   // engine phase → Moonraker print_stats.state
  idle: 'standby', heating: 'printing', leveling: 'printing', printing: 'printing',
  paused: 'paused', complete: 'complete', cancelled: 'cancelled', error: 'error',
};
const FILE = id => `${id}.gcode`;
const COSMOS_MODEL = '166';
const isCosmos = rec => String(rec?.printerModelId ?? '') === COSMOS_MODEL;
const HAPPY_HARE_MODEL = '2';   // Voron 2.4 → Klipper + Happy Hare (ERCF)
const isHappyHare = rec => String(rec?.printerModelId ?? '') === HAPPY_HARE_MODEL;
const laneNames = (m, cosmos, hh) => !hh && m.slots.length > 1 ? m.slots.map((_, i) => cosmos ? `CANVAS_${i + 1}` : `lane${i + 1}`) : [];
const wave = (base, busy, period) => +(base + busy + Math.sin(Date.now() / period)).toFixed(2);

/**
 * `hh` is the Happy Hare gate state the Machine's slots do not hold
 * ({ unknown: Set of gates, spool: [] }), or null on a machine without it.
 */
function objects(m, cosmos = false, hh = null) {
  const tools = m.nozzles();
  const lanes = laneNames(m, cosmos, hh);
  const o = {
    webhooks: { state: 'ready', state_message: 'Printer is ready' },
    print_stats: {
      state: STATE[m.phase] || 'standby', filename: m.print && m.phase !== 'idle' ? FILE(m.print.id) : '',
      print_duration: m.phase === 'idle' ? 0 : m.elapsedSec, total_duration: m.phase === 'idle' ? 0 : m.elapsedSec,
      filament_used: 0, message: m.message || '',
      info: { current_layer: m.phase === 'idle' ? null : m.layer, total_layer: m.print && m.phase !== 'idle' ? m.print.layersTotal : null },
    },
    display_status: { progress: m.phase === 'idle' ? 0 : m.progress, message: null },
    virtual_sdcard: { progress: m.phase === 'idle' ? 0 : m.progress, file_path: m.print ? FILE(m.print.id) : null, is_active: m.isBusy && m.phase !== 'paused' },
    heater_bed: { temperature: +m.heaters.bed.cur.toFixed(2), target: m.heaters.bed.target, power: m.heaters.bed.target > 0 ? 0.5 : 0 },
    toolhead: { extruder: m.activeTool ? `extruder${m.activeTool}` : 'extruder', homed_axes: [...m.homed].sort().join(''), position: [m.position.x, m.position.y, m.position.z, 0] },
    fan: { speed: m.fan / 100 },
    gcode_move: { speed_factor: m.speedPct / 100, extrude_factor: 1 },
  };
  const busy = m.isBusy ? 4 : 0;
  if (cosmos) {
    Object.assign(o, {
      'temperature_sensor mcu_toolhead': { temperature: wave(29.8, busy, 9000) },
      'temperature_sensor mcu_bed': { temperature: wave(36.6, busy, 8000) },
      'temperature_fan mainboard': { temperature: wave(54.8, busy, 7000), target: 60 },
      'temperature_sensor Mcu_canvas': { temperature: wave(25.7, 0, 11000) },
      'led case': { color_data: [[m.light ? 1 : 0, m.light ? 1 : 0, m.light ? 1 : 0, 1]] },
      'led hotend': { color_data: [[0, 0, 0, 0]] },
    });
  } else {
    Object.assign(o, {
      'filament_switch_sensor runout': { filament_detected: true, enabled: true },
      'output_pin caselight': { value: m.light ? 1 : 0 },
      // The extra temperatures a real Klipper box reports (shown in the Sensors card).
      'temperature_sensor mcu_temp': { temperature: wave(38, busy, 9000) },
      'temperature_sensor raspberry_pi': { temperature: wave(46, m.isBusy ? 3 : 0, 7000) },
    });
  }
  tools.forEach((h, i) => { o[i ? `extruder${i}` : 'extruder'] = { temperature: +h.cur.toFixed(2), target: h.target, power: h.target > 0 ? 0.6 : 0 }; });
  if (m.heaters.chamber) {
    if (cosmos) o['temperature_sensor chamber'] = { temperature: +m.heaters.chamber.cur.toFixed(2), target: null };
    else o['heater_generic chamber'] = { temperature: +m.heaters.chamber.cur.toFixed(2), target: m.heaters.chamber.target, power: 0 };
  }
  if (hh && m.slots.length) {
    const n = m.slots.length;
    o.mmu = {
      enabled: true, num_gates: n, gate: m.activeSlot, tool: m.activeSlot,
      gate_status: m.slots.map((s, g) => (hh.unknown.has(g) ? -1 : s.empty ? 0 : 1)),
      gate_material: m.slots.map(s => (s.empty ? '' : s.material)),
      gate_color: m.slots.map(s => (s.empty ? '' : String(s.color).replace(/^#/, '').toUpperCase())),
      gate_spool_id: m.slots.map((_, g) => hh.spool[g] ?? -1),
      ttg_map: m.slots.map((_, g) => g),
    };
  }
  if (lanes.length) {
    const unit = cosmos ? 'CANVAS' : 'Turtle_1';
    o.AFC = { lanes, units: [unit], current_lane: m.activeSlot >= 0 ? lanes[m.activeSlot] : null, spoolman: null };
    lanes.forEach((l, i) => {
      const s = m.slots[i];
      const lane = {
        name: l, unit, map: `T${i}`, load: !s.empty, prep: !s.empty, tool_loaded: i === m.activeSlot,
        material: s.empty ? '' : s.material, color: s.empty ? '' : s.color, multi_color_hexes: null,
        spool_id: null, weight: s.empty ? 0 : 1000, filament_name: s.empty ? '' : `Demo ${s.material}`,
        extruder_temp: 210, bed_temp: 60, status: s.empty ? 'None' : (i === m.activeSlot ? 'Tooled' : 'Loaded'), td1_td: null,
      };
      o[`AFC_stepper ${l}`] = lane;
      if (cosmos) o[`AFC_lane ${l}`] = lane;   // the same lane under its second name
    });
  }
  return o;
}

/** Klipper's own commands on top of the shared G-code (lights, AFC lanes, Happy Hare gates). */
function gcode(m, script, mode, cosmos = false, hh = null) {
  runGcode(m, script, mode, (cmd, p) => {
    if (cmd === 'SET_PIN' && String(p.PIN) === 'caselight') { m.setLight(Number(p.VALUE) > 0); return true; }
    if (cmd === 'SET_LED' && String(p.LED) === 'case') { m.setLight(['RED', 'GREEN', 'BLUE', 'WHITE'].some(k => Number(p[k]) > 0)); return true; }
    if (cmd === 'MMU_GATE_MAP' && hh) {
      const g = /^\d+$/.test(String(p.GATE ?? '')) ? Number(p.GATE) : -1;
      if (g < 0 || g >= m.slots.length) throw new Error(`Invalid gate ${p.GATE ?? ''}`);
      const patch = {};
      if (p.MATERIAL != null) patch.material = p.MATERIAL;
      if (p.COLOR != null) patch.color = `#${String(p.COLOR).replace(/^#/, '').toUpperCase()}`;
      if (p.SPOOLID != null) hh.spool[g] = Number(p.SPOOLID) || -1;
      const avail = p.AVAILABLE != null ? Number(p.AVAILABLE) : 1;   // a mapped gate is loaded unless told otherwise
      patch.empty = avail === 0;
      if (avail === -1) hh.unknown.add(g); else hh.unknown.delete(g);
      m.setSlot(g, patch);
      return true;
    }
    if (/^SET_(COLOR|MATERIAL)$/.test(cmd)) {
      const i = laneNames(m, cosmos, hh).indexOf(String(p.LANE || ''));
      if (!m.setSlot(i, cmd === 'SET_COLOR' ? { color: `#${String(p.COLOR).replace(/^#/, '')}` } : { material: p.MATERIAL })) throw new Error(`Unknown lane ${p.LANE}`);
      return true;
    }
    return false;   // SET_WEIGHT, SET_SPOOL_ID, SET_MAP, FIRMWARE_RESTART… accepted, ignored
  });
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

/**
 * Start the face. `address` is "127.0.0.x:port" (the record's ip).
 * Returns a Promise<{ close() }>; rejects when the port cannot be bound.
 */
function start({ machine: m, address, library, record = {} }) {
  const apiKey = record.apiKey || '';
  const cosmos = isCosmos(record);
  const hh = isHappyHare(record) ? { unknown: new Set(), spool: [] } : null;
  const [host, port] = address.split(':');
  const mode = { relative: false };
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const ok = (res, result) => json(res, 200, { result });
  const err = (res, code, message) => json(res, code, { error: { code, message } });
  const streams = new Set();
  // What HTTP and the WebSocket both answer, from the one Machine.
  const serverInfo = () => ({
    klippy_connected: true, klippy_state: 'ready', moonraker_version: 'v0.9.3-demo', api_version: [1, 5, 0],
    components: ['database', 'file_manager', 'klippy_apis', 'machine', 'webcam', 'history'], failed_components: [], warnings: [],
  });
  const printerInfo = () => ({ state: 'ready', state_message: 'Printer is ready', hostname: `demo-${m.id.slice(0, 6)}`, software_version: 'v0.12.0-demo' });
  const objectList = () => ({ objects: Object.keys(objects(m, cosmos, hh)) });
  const query = want => ({ eventtime: process.uptime(), status: pick(objects(m, cosmos, hh), want) });
  const printAction = (a, filename) => {
    if (a === 'start') m.start(String(filename || '').replace(/\.gcode$/, '') || undefined);
    else if (a === 'pause') m.pause(); else if (a === 'resume') m.resume(); else m.stop();
  };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, `http://${req.headers.host || address}`), p = u.pathname;
    if (apiKey && !p.startsWith('/webcam') && req.headers['x-api-key'] !== apiKey) return err(res, 401, 'Unauthorized');
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch (_) {}
      if (p === '/server/info') return ok(res, serverInfo());
      if (p === '/printer/info') return ok(res, printerInfo());
      if (p === '/machine/system_info') return ok(res, { system_info: { product_info: { machine_type: 'Demo printer', serial_number: `DEMO-${m.id}` } } });
      if (p === '/printer/objects/list') return ok(res, objectList());
      if (p === '/printer/objects/query') {
        let want = body.objects;
        if (!want) { want = {}; for (const [k, v] of u.searchParams) want[k] = v ? v.split(',') : null; }
        return ok(res, query(want));
      }
      const pr = p.match(/^\/printer\/print\/(start|pause|resume|cancel)$/);
      if (pr) { printAction(pr[1], u.searchParams.get('filename') || body.filename); return ok(res, 'ok'); }
      if (p === '/printer/gcode/script') {
        try { gcode(m, u.searchParams.get('script') || body.script, mode, cosmos, hh); return ok(res, 'ok'); }
        catch (e) { return err(res, 400, e.message); }
      }
      if (p === '/printer/firmware_restart') return ok(res, 'ok');
      if (p === '/server/webcams/list') return ok(res, { webcams: [{
        name: 'Demo cam', service: 'mjpegstreamer', enabled: true, target_fps: 5,
        stream_url: `http://${address}/webcam/?action=stream`, snapshot_url: `http://${address}/webcam/?action=snapshot`,
        flip_horizontal: false, flip_vertical: false, rotation: 0, aspect_ratio: '4:3', source: 'config', uid: `demo-${m.id}`,
      }] });
      if (p === '/webcam/' || p === '/webcam') {
        if (u.searchParams.get('action') === 'stream') return mjpeg(res, library, m, streams);
        return snapshot(res, library, m);
      }
      if (p === '/server/files/list') return ok(res, library.list().map(x => ({ path: FILE(x.id), modified: 1760000000, size: 2_000_000, permissions: 'rw' })));
      if (p === '/server/files/metadata') {
        const pr2 = library.get(String(u.searchParams.get('filename') || '').replace(/\.gcode$/, ''));
        if (!pr2) return err(res, 404, 'File not found');
        return ok(res, {
          filename: FILE(pr2.id), slicer: 'OrcaSlicer', estimated_time: pr2.durationReal, layer_height: 0.2,
          filament_type: pr2.slots.map(s => s.material).join(';'), filament_colors: pr2.slots.map(s => s.color),
          thumbnails: [{ width: 300, height: 300, size: 1, relative_path: `.thumbs/${pr2.id}-300x300.png` }],
        });
      }
      const th = p.match(/^\/server\/files\/gcodes\/\.thumbs\/(.+)-300x300\.png$/);
      if (th) {
        const t = library.thumbnail(decodeURIComponent(th[1]));
        if (!t) return err(res, 404, 'No thumbnail');
        res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(t);
      }
      return err(res, 404, `Not found: ${p}`);
    });
  });
  // Moonraker's WebSocket on the same server and port. A connection is trusted
  // once identify carried the key (or the upgrade request had it in X-Api-Key).
  const wss = new WebSocketServer({ server, path: '/websocket' });
  const subs = new Map();   // socket → { authed, want }
  let nextConn = 1000 + Math.floor(Math.random() * 9000);
  wss.on('connection', (ws, req) => {
    const st = { authed: !apiKey || req.headers['x-api-key'] === apiKey, want: null };
    subs.set(ws, st);
    ws.on('close', () => subs.delete(ws));
    ws.on('error', () => {});
    ws.on('message', raw => {
      let msg; try { msg = JSON.parse(String(raw)); } catch (_) { return; }
      if (msg.id === undefined) return;   // a notification from the client: nothing to answer
      const reply = body => { if (ws.readyState === 1) ws.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...body })); };
      const fail = (code, message) => reply({ error: { code, message } });
      const params = msg.params || {};
      if (msg.method === 'server.connection.identify') {
        const key = params.api_key ?? params.access_token;
        if (apiKey && key !== apiKey && !st.authed) return fail(401, 'Unauthorized');
        st.authed = true;
        return reply({ result: { connection_id: nextConn++ } });
      }
      if (!st.authed) return fail(401, 'Unauthorized');
      switch (msg.method) {
        case 'server.info': return reply({ result: serverInfo() });
        case 'printer.info': return reply({ result: printerInfo() });
        case 'printer.objects.list': return reply({ result: objectList() });
        case 'printer.objects.query': return reply({ result: query(params.objects) });
        case 'printer.objects.subscribe':
          st.want = params.objects || null;   // replaces the previous subscription, like Moonraker
          return reply({ result: query(params.objects) });
        case 'printer.gcode.script':
          try { gcode(m, params.script, mode, cosmos, hh); return reply({ result: 'ok' }); }
          catch (e) { return fail(400, e.message); }
        case 'printer.print.start': case 'printer.print.pause': case 'printer.print.resume': case 'printer.print.cancel':
          printAction(msg.method.split('.').pop(), params.filename); return reply({ result: 'ok' });
        case 'printer.firmware_restart': return reply({ result: 'ok' });
        default: return fail(-32601, `Method not found: ${msg.method}`);
      }
    });
  });
  // Every second: the subscribed objects, and Moonraker's process stats (which
  // clients receive whether they want them or not).
  const pushT = setInterval(() => {
    if (!subs.size) return;
    const all = objects(m, cosmos, hh), t = process.uptime();
    const proc = JSON.stringify({ jsonrpc: '2.0', method: 'notify_proc_stat_update', params: [{
      moonraker_stats: { time: Date.now() / 1000, cpu_usage: +(1.5 + Math.random()).toFixed(2), memory: 42000, mem_units: 'kB' },
      cpu_temp: wave(46, m.isBusy ? 3 : 0, 7000), network: { wlan0: { rx_bytes: 0, tx_bytes: 0, bandwidth: 0 } },
      system_cpu_usage: { cpu: +(4 + Math.random() * 3).toFixed(2) }, system_memory: { total: 3884356, available: 2900000, used: 984356 },
      websocket_connections: subs.size,
    }] });
    for (const [ws, st] of subs) {
      if (ws.readyState !== 1) continue;
      ws.send(proc);
      if (st.authed && st.want) ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'notify_status_update', params: [pick(all, st.want), t] }));
    }
  }, 1000);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port), host, () => resolve({
      close() {
        clearInterval(pushT);
        for (const c of wss.clients) c.terminate();
        wss.close();
        for (const r of streams) { try { r.destroy(); } catch (_) {} }
        server.close();
      },
    }));
  });
}

module.exports = {
  brand: 'klipper', slotCount: 4, start,
  recordFields: address => ({ ip: address }),
  addressOf: rec => String(rec.ip || ''),
};
