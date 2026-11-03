/**
 * services/demo/faces/elegoo.js — a demo printer seen as an Elegoo, in its two
 * protocols (renderer/printers/elegoo/PROTOCOL.md), on the printer's OWN
 * loopback address (the driver dials fixed ports — no port in `ip`):
 *
 *   CC2 — Centauri Carbon 2 + Canvas (4 slots), variant "cc2"
 *     mqtt :1883  an MQTT broker (aedes): user "elegoo" + the record's password;
 *                 api_register → register_response, api_request → api_response
 *                 ({ id, method, result }), status pushed on api_status (method 6000)
 *     http :8080  the camera (MJPEG), named by method 1042
 *   CC1 — Centauri Carbon, SDCP v3, variant "cc1" (record `protocol: "sdcp"`)
 *     ws   :3030/websocket  Cmd 0 status / 1 attributes / 386 camera / 129-131 job,
 *                 "ping" → "pong", status pushed on sdcp/status/<MainboardID>
 *     http :3031  the camera (MJPEG), named by Cmd 386
 */
'use strict';

const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Aedes } = require('aedes');
const { mjpeg, snapshot, listen } = require('./common');

const FILE = id => `${id}.gcode`;
const fileId = name => String(name || '').split('/').pop().replace(/\.gcode$/, '');
// CC2 speed modes (0 Normal … 3 Ludicrous) ↔ the engine's speed factor.
const SPEED_PCT = [50, 100, 124, 166];
const speedMode = pct => SPEED_PCT.reduce((best, v, i) => (Math.abs(v - pct) < Math.abs(SPEED_PCT[best] - pct) ? i : best), 1);
const hex6 = c => String(c || '').replace(/^#/, '').slice(0, 6).toUpperCase();

/** A small MJPEG server on host:port (the camera both models name in a reply). */
async function cameraServer(host, port, m, library) {
  const streams = new Set();
  const server = http.createServer((req, res) => {
    req.resume();
    const u = new URL(req.url, `http://${host}:${port}`);
    if (u.searchParams.get('action') === 'snapshot') return snapshot(res, library, m);
    return mjpeg(res, library, m, streams);
  });
  await listen(server, host, port);
  return () => { for (const r of streams) { try { r.destroy(); } catch (_) {} } server.close(); };
}

// ── CC2 — MQTT ────────────────────────────────────────────────────────────────
function cc2Status(m, fans) {
  const n = m.nozzles()[0], bed = m.heaters.bed, ch = m.heaters.chamber;
  const state = { idle: 'standby', heating: 'heating', leveling: 'preparing', printing: 'printing',
    paused: 'paused', complete: 'complete', cancelled: 'cancelled', error: 'error' }[m.phase] || 'standby';
  return {
    print_status: {
      state, filename: m.print ? FILE(m.print.id) : '', uuid: m.print ? `demo-${m.id}-${m.jobId}` : '',
      current_layer: m.phase === 'idle' ? 0 : m.layer, remaining_time_sec: m.remainingSec,
      print_duration: m.elapsedSec, total_duration: m.print ? m.print.durationReal : 0, bed_mesh_detect: false,
    },
    machine_status: { status: m.isBusy ? 2 : m.phase === 'error' ? 14 : 1, sub_status: 0, progress: Math.round(m.progress * 100), exception_status: [] },
    extruder: { temperature: +n.cur.toFixed(1), target: n.target },
    heater_bed: { temperature: +bed.cur.toFixed(1), target: bed.target },
    ztemperature_sensor: { temperature: ch ? +ch.cur.toFixed(1) : 25 },
    fans: { fan: { speed: Math.round(m.fan * 2.55) }, aux_fan: { speed: fans.aux }, box_fan: { speed: fans.box } },
    led: { status: m.light ? 1 : 0 },
    gcode_move: { x: m.position.x, y: m.position.y, z: m.position.z, speed_mode: speedMode(m.speedPct) },
    tool_head: { homed_axes: [...m.homed].sort().join('') },
  };
}

// What a 2003 / 1055 write said per tray beyond material + colour (the Machine keeps those).
const trayInfo = new WeakMap();   // Machine → [{ brand, name, min, max }]
const infoOf = (m, i) => (trayInfo.get(m) || [])[i] || {};

function cc2Canvas(m) {
  return { canvas_info: { canvas_list: [{ canvas_id: 0, connected: 1, tray_list: m.slots.map((s, i) => ({
    tray_id: i, filament_color: s.empty ? '' : hex6(s.color), filament_type: s.empty ? '' : s.material,
    brand: s.empty ? '' : infoOf(m, i).brand || 'ELEGOO', filament_name: s.empty ? '' : infoOf(m, i).name || s.material,
    min_nozzle_temp: infoOf(m, i).min ?? 190, max_nozzle_temp: infoOf(m, i).max ?? 230,
    status: i === m.activeSlot ? 1 : 0,
  })) }] } };
}

/** Answer one api_request: the reply's `result`, or undefined for "no reply needed". */
function cc2Handle(m, method, params, fans, library, host) {
  switch (method) {
    case 1002: case 1005: return cc2Status(m, fans);
    case 2005: return cc2Canvas(m);
    case 1061: return { mono_filament_info: { tray_id: 0, filament_color: 'FFFFFF', filament_type: 'PLA', brand: 'Generic', filament_name: 'PLA', min_nozzle_temp: 190, max_nozzle_temp: 230, filament_code: '0x0000' } };
    case 1042: return { url: `http://${host}:8080/?action=stream` };
    case 1044: return { file_list: params.storage_media === 'u-disk' ? [] : library.list().map(p => ({ filename: FILE(p.id), layer: p.layersTotal, size: 2_000_000, print_time: p.durationReal })) };
    case 1045: {
      const t = library.thumbnail(fileId(params.file_name));
      return t ? { thumbnail: t.toString('base64') } : { error_code: 1003 };
    }
    case 1036: return { error_code: 0, history_task_list: [] };
    case 1021: m.pause(); return { error_code: 0 };
    case 1023: m.resume(); return { error_code: 0 };
    case 1022: m.stop(); return { error_code: 0 };
    case 1020: if (!m.isBusy) m.start(fileId(params.filename) || undefined); return { error_code: 0 };
    case 1028:
      if (params.extruder != null) m.setTarget('nozzle0', params.extruder);
      if (params.heater_bed != null) m.setTarget('bed', params.heater_bed);
      return { error_code: 0 };
    case 1030:
      if (params.fan != null) m.setFan(Number(params.fan) / 2.55);
      if (params.aux_fan != null) fans.aux = Number(params.aux_fan) || 0;
      if (params.box_fan != null) fans.box = Number(params.box_fan) || 0;
      return { error_code: 0 };
    case 1029: m.setLight(Number(params.power) === 1); return { error_code: 0 };
    case 1031: m.setSpeed(SPEED_PCT[Math.max(0, Math.min(3, Number(params.mode) || 0))]); return { error_code: 0 };
    case 1026: m.home(String(params.homed_axes || 'xyz')); return { error_code: 0 };
    case 1027: { const e = m.jog(params.axes, Number(params.distance)); return { error_code: e ? 1 : 0 }; }
    case 2003: case 1055:
    {
      const i = Number(params.tray_id) || 0;
      if (!m.setSlot(i, { material: params.filament_type, color: `#${hex6(params.filament_color)}`, empty: false })) return { error_code: 1 };
      const list = trayInfo.get(m) || [];
      list[i] = { brand: params.brand, name: params.filament_name,
        min: params.filament_min_temp != null ? Number(params.filament_min_temp) : undefined,
        max: params.filament_max_temp != null ? Number(params.filament_max_temp) : undefined };
      trayInfo.set(m, list);
      return { error_code: 0 };
    }
    default: return { error_code: 0 };   // 1001 / 1043 …: acknowledged, nothing to say
  }
}

async function startCC2({ machine: m, address: host, library, record }) {
  const sn = String(record.sn || record.serialNumber || '').trim();
  const pass = String(record.mqttPassword || record.password || '123456');
  const fans = { aux: 0, box: 0 };
  const broker = await Aedes.createBroker();
  const pub = (topic, obj) => broker.publish({ topic, payload: Buffer.from(JSON.stringify(obj)), qos: 0, retain: false }, () => {});
  broker.authenticate = (_c, user, pw, cb) => cb(null, user === 'elegoo' && String(pw || '') === pass);
  broker.on('publish', (pkt, client) => {
    if (!client) return;   // our own publications
    let msg; try { msg = JSON.parse(String(pkt.payload)); } catch (_) { return; }
    const t = pkt.topic.split('/');   // elegoo/{sn}/…
    if (t[0] !== 'elegoo' || t[1] !== sn) return;
    if (t[2] === 'api_register') return pub(`elegoo/${sn}/${msg.request_id || `${msg.client_id}_req`}/register_response`, { client_id: msg.client_id, error: 'ok' });
    if (t[3] === 'api_request') {
      const resTopic = `elegoo/${sn}/${t[2]}/api_response`;
      if (msg.type === 'PING') return pub(resTopic, { type: 'PONG' });
      const result = cc2Handle(m, Number(msg.method), msg.params || {}, fans, library, host);
      if (result !== undefined) pub(resTopic, { id: msg.id, method: Number(msg.method), result });
      if ([2003, 1055].includes(Number(msg.method))) pub(resTopic, { id: 0, method: 2005, result: cc2Canvas(m) });
      // …and, like the printer when its filament changes, the new canvas in the status push every client hears.
      if ([2003, 1055].includes(Number(msg.method))) pub(`elegoo/${sn}/api_status`, { method: 6000, result: cc2Canvas(m) });
    }
  });
  const tcp = net.createServer(broker.handle);
  await listen(tcp, host, 1883);
  const pushT = setInterval(() => pub(`elegoo/${sn}/api_status`, { method: 6000, result: cc2Status(m, fans) }), 2000);
  let closeCam = () => {};
  try { closeCam = await cameraServer(host, 8080, m, library); }
  catch (e) { clearInterval(pushT); tcp.close(); broker.close(); throw e; }
  return { close() { clearInterval(pushT); closeCam(); tcp.close(); broker.close(); } };
}

// ── CC1 — SDCP over WebSocket ─────────────────────────────────────────────────
function cc1Status(m) {
  const n = m.nozzles()[0], bed = m.heaters.bed, ch = m.heaters.chamber;
  const busy = m.isBusy;
  const pi = m.phase === 'paused' ? 6 : m.phase === 'complete' ? 9 : m.phase === 'cancelled' ? 8 : busy ? 3 : 0;
  return {
    CurrentStatus: [busy ? 1 : 0],
    TempOfNozzle: +n.cur.toFixed(1), TempTargetNozzle: n.target,
    TempOfHotbed: +bed.cur.toFixed(1), TempTargetHotbed: bed.target,
    TempOfBox: ch ? +ch.cur.toFixed(1) : 25, TempTargetBox: 0,
    CurrentFanSpeed: { ModelFan: m.fan, AuxiliaryFan: 0, BoxFan: 0 },
    PrintInfo: {
      Status: pi, Filename: m.print && m.phase !== 'idle' ? FILE(m.print.id) : '',
      CurrentLayer: m.layer, TotalLayer: m.print ? m.print.layersTotal : 0, Progress: Math.round(m.progress * 100),
      CurrentTicks: m.elapsedSec, TotalTicks: m.print ? m.print.durationReal : 0, PrintSpeedPct: m.speedPct,
    },
  };
}

async function startCC1({ machine: m, address: host, library, record }) {
  const id = String(record.mainboardId || '');
  const env = (topic, body) => JSON.stringify({ ...body, MainboardID: id, TimeStamp: Math.floor(Date.now() / 1000), Topic: `sdcp/${topic}/${id}` });
  const status = () => env('status', { Status: cc1Status(m) });
  const response = (cmd, req, data = {}) => env('response', { Data: { Cmd: cmd, Data: { Ack: 0, ...data }, RequestID: req, MainboardID: id, TimeStamp: Math.floor(Date.now() / 1000) } });

  const server = http.createServer((req, res) => { res.writeHead(426); res.end(); });
  const wss = new WebSocketServer({ server, path: '/websocket' });
  wss.on('connection', ws => {
    ws.on('message', raw => {
      const text = String(raw);
      if (text === 'ping') return ws.send('pong');
      let msg; try { msg = JSON.parse(text); } catch (_) { return; }
      const d = msg.Data || {}, cmd = Number(d.Cmd), req = d.RequestID;
      if (cmd === 0) { ws.send(response(0, req)); return ws.send(status()); }
      if (cmd === 1) {
        ws.send(response(1, req));
        return ws.send(env('attributes', { Attributes: {
          Name: 'Centauri Carbon', MachineName: 'Centauri Carbon', BrandName: 'ELEGOO', ProtocolVersion: 'V3.0.0',
          FirmwareVersion: 'V1.4.49-demo', MainboardID: id, MainboardIP: host, MainboardMAC: '00:00:00:00:00:00',
        } }));
      }
      if (cmd === 386) return ws.send(response(386, req, { VideoUrl: `${host}:3031/video` }));
      if (cmd === 129) { m.pause(); return ws.send(response(129, req)); }
      if (cmd === 130) { m.stop(); return ws.send(response(130, req)); }
      if (cmd === 131) { m.resume(); return ws.send(response(131, req)); }
      return ws.send(response(cmd, req));
    });
  });
  await listen(server, host, 3030);
  const pushT = setInterval(() => { const s = status(); for (const c of wss.clients) if (c.readyState === 1) c.send(s); }, 2000);
  let closeCam = () => {};
  try { closeCam = await cameraServer(host, 3031, m, library); }
  catch (e) { clearInterval(pushT); wss.close(); server.close(); throw e; }
  return { close() { clearInterval(pushT); closeCam(); for (const c of wss.clients) c.terminate(); wss.close(); server.close(); } };
}

const isCC1 = rec => rec.protocol === 'sdcp';

module.exports = {
  brand: 'elegoo',
  variants: [{ id: 'cc2' }, { id: 'cc1' }],
  // CC2: 4 Canvas slots + a chamber sensor; CC1: no slots.
  shape: rec => (isCC1(rec) ? { slotCount: 0, chamber: true } : { slotCount: 4, chamber: true }),
  start: opts => (isCC1(opts.record) ? startCC1(opts) : startCC2(opts)),
  recordFields: (host, variant) => (variant === 'cc1'
    ? { ip: host, protocol: 'sdcp', mainboardId: crypto.randomBytes(8).toString('hex'), printerModelId: '2' }
    : { ip: host, sn: `DEMO${crypto.randomBytes(5).toString('hex').toUpperCase()}`, password: '123456', printerModelId: '1' }),
  addressOf: rec => String(rec.ip || ''),
};
