/**
 * services/demo/faces/anycubic.js — a demo printer seen as an Anycubic Kobra 3 V2
 * with an ACE Pro (4 slots), in LAN mode only (renderer/printers/anycubic/PROTOCOL.md),
 * on the printer's OWN loopback address:
 *
 *   mqtts :9883  an MQTT broker (aedes) behind TLS 1.2 — the driver insists on
 *                TLS 1.2 but checks no certificate, so the demo one serves.
 *                In:  anycubic/anycubicCloud/v1/web/printer/{model}/{device}/{endpoint}
 *                Out: anycubic/anycubicCloud/v1/printer/public/{model}/{device}/{endpoint}
 *                JSON { type, action, state, data } both ways; the driver reads
 *                type / action / state only, never the topic.
 *   http  :18088 the camera, /flv — a real FLV stream (the driver's probe wants the
 *                "FLV" bytes first, then ffmpeg decodes it), encoded on the fly by
 *                the bundled ffmpeg from the print's frames
 *   http  :18910 /info — what the driver's identity and camera lookups ask for
 */
'use strict';

const http = require('http');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Aedes } = require('aedes');
const { listen } = require('./common');

const CERT = path.join(__dirname, '..', 'certs');
const FILE = id => `${id}.gcode`;
const fileId = name => String(name || '').split('/').pop().replace(/\.gcode$/, '');
const rgb = c => [1, 3, 5].map(i => parseInt(String(c || '#ffffff').padEnd(7, 'f').slice(i, i + 2), 16) || 0);
const hex = a => `#${(Array.isArray(a) ? a : [255, 255, 255]).slice(0, 3).map(v => Math.max(0, Math.min(255, Number(v) || 0)).toString(16).padStart(2, '0')).join('')}`;
const SPEED = { 1: 50, 2: 100, 3: 150 };   // print_speed_mode → speed factor
const speedMode = pct => (pct < 75 ? 1 : pct > 125 ? 3 : 2);

/** The print report in the action / state pair the driver maps to its job state. */
function printReport(m) {
  const pair = {
    heating: ['start', 'preheating'], leveling: ['start', 'preheating'], printing: ['start', 'printing'],
    paused: ['pause', 'paused'], complete: ['start', 'finished'], cancelled: ['stop', 'stoped'], error: ['start', 'failed'],
  }[m.phase];
  if (!pair || !m.print) return null;
  const n = m.nozzles()[0], bed = m.heaters.bed;
  return {
    type: 'print', action: pair[0], state: pair[1],
    data: {
      taskid: String(m.jobId || 1), filename: `/${FILE(m.print.id)}`, progress: Math.round(m.progress * 100),
      remain_time: Math.round(m.remainingSec / 60), curr_layer: m.layer, total_layers: m.print.layersTotal,
      curr_nozzle_temp: Math.round(n.cur), curr_hotbed_temp: Math.round(bed.cur),
      settings: { target_nozzle_temp: n.target, target_hotbed_temp: bed.target, fan_speed_pct: m.fan, print_speed_pct: m.speedPct, print_speed_mode: speedMode(m.speedPct) },
    },
  };
}
const tempReport = (m, action = 'auto') => ({ type: 'tempature', action, state: 'done', data: {
  curr_nozzle_temp: Math.round(m.nozzles()[0].cur), target_nozzle_temp: m.nozzles()[0].target,
  curr_hotbed_temp: Math.round(m.heaters.bed.cur), target_hotbed_temp: m.heaters.bed.target,
} });
// No ACE on this model: an empty box list, like a printer with nothing plugged in.
const aceReport = (m, action = 'getInfo') => ({ type: 'multiColorBox', action, state: 'done', data: { multi_color_box: !m.slots.length ? [] : [{
  id: 0, model_id: 40001, temp: 26, loaded_slot: m.activeSlot,
  slots: m.slots.map((s, i) => ({ index: i, type: s.empty ? '' : s.material, color: s.empty ? [0, 0, 0] : rgb(s.color), status: s.empty ? 0 : 5 })),
}] } });

/** FLV camera: ffmpeg turns the print's JPEG frames into an endless FLV stream. */
function flvStream(res, m, library, ffmpegPath, live) {
  if (!ffmpegPath) { res.writeHead(503); return res.end(); }
  const ff = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'mjpeg', '-framerate', '5', '-i', 'pipe:0',
    '-c:v', 'flv1', '-q:v', '5', '-f', 'flv', 'pipe:1'], { windowsHide: true });
  res.writeHead(200, { 'Content-Type': 'video/x-flv', 'Cache-Control': 'no-cache' });
  ff.stdout.pipe(res);
  const feed = () => {
    const f = library.frameFor(m);
    if (f && f.type === 'image/jpeg' && ff.stdin.writable) ff.stdin.write(f.data);
  };
  feed(); feed();   // two frames at once, so the FLV header leaves right away
  const t = setInterval(feed, 200);
  const stop = () => { clearInterval(t); live.delete(stop); try { ff.stdin.end(); } catch (_) {} try { ff.kill('SIGKILL'); } catch (_) {} };
  live.add(stop);
  ff.stdin.on('error', () => {});
  ff.on('close', () => { stop(); try { res.end(); } catch (_) {} });
  res.on('close', stop);
}

async function start({ machine: m, address: host, library, record, ffmpegPath }) {
  const model = String(record.acuModelId || '20027'), device = String(record.deviceId || '');
  const port = Number(record.port) || 9883;
  const pubBase = `anycubic/anycubicCloud/v1/printer/public/${model}/${device}`;
  const closers = [];
  const broker = await Aedes.createBroker();
  const pub = (endpoint, obj) => broker.publish({ topic: `${pubBase}/${endpoint}/report`, payload: Buffer.from(JSON.stringify({ msgid: crypto.randomUUID(), timestamp: Date.now(), ...obj })), qos: 0, retain: false }, () => {});
  broker.authenticate = (_c, user, pw, cb) => cb(null, user === record.username && String(pw || '') === String(record.password || ''));

  broker.on('publish', (pkt, client) => {
    if (!client || !pkt.topic.startsWith(`anycubic/anycubicCloud/v1/web/printer/${model}/${device}/`)) return;
    let msg; try { msg = JSON.parse(String(pkt.payload)); } catch (_) { return; }
    const d = msg.data || {}, ep = pkt.topic.split('/').pop();
    switch (`${msg.type}/${msg.action}`) {
      case 'multiColorBox/getInfo': return pub(ep, aceReport(m));
      case 'multiColorBox/setInfo':
        for (const box of d.multi_color_box || []) for (const s of box.slots || []) m.setSlot(Number(s.index), { material: s.type, color: hex(s.color), empty: false });
        return pub(ep, aceReport(m, 'setInfo'));
      case 'multiColorBox/feedFilament': return pub(ep, aceReport(m, 'refresh'));
      case 'extfilbox/getInfo': case 'extfilbox/setInfo':
        return pub(ep, { type: 'extfilbox', action: 'reportInfo', state: 'done', data: { id: -1, type: d.type || 'PLA', color: d.color || [255, 255, 255] } });
      case 'tempature/query': return pub(ep, tempReport(m, 'query'));
      case 'tempature/set':
        if (Number(d.type) === 0) m.setTarget('nozzle0', d.target_nozzle_temp);
        else if (Number(d.type) === 1) m.setTarget('bed', d.target_hotbed_temp);
        return pub(ep, tempReport(m, 'done'));
      case 'fan/query': return pub(ep, { type: 'fan', action: 'query', state: 'done', data: { fan_speed_pct: m.fan } });
      case 'fan/setSpeed': m.setFan(d.fan_speed_pct); return pub(ep, { type: 'fan', action: 'setSpeed', state: 'done', data: { fan_speed_pct: m.fan } });
      case 'light/query': return pub(ep, { type: 'light', action: 'query', state: 'done', data: { status: m.light ? 1 : 0, brightness: m.light ? 100 : 0 } });
      case 'light/control': m.setLight(Number(d.status) === 1); return pub(ep, { type: 'light', action: 'control', state: 'done', data: { status: m.light ? 1 : 0, brightness: m.light ? 100 : 0 } });
      case 'axis/move': {
        const axis = Number(d.axis);
        if (Number(d.move_type) === 2) { m.home(['', 'x', 'y', 'z', 'xy', 'xyz'][axis] || 'xyz'); return; }
        const e = m.jog(['', 'x', 'y', 'z'][axis], (Number(d.move_type) === 1 ? 1 : -1) * Number(d.distance));
        if (e) pub(ep, { type: 'axis', action: 'move', state: 'failed', code: 10001, msg: e });
        return;
      }
      case 'axis/turnOff': m.homed.clear(); return;
      case 'print/pause': m.pause(); break;
      case 'print/resume': m.resume(); break;
      case 'print/stop': m.stop(); break;
      case 'print/start': if (!m.isBusy) m.start(fileId(d.filename) || undefined); break;
      case 'print/update': if (d.settings?.print_speed_mode) m.setSpeed(SPEED[d.settings.print_speed_mode] || 100); break;
      case 'file/listLocal': return pub(ep, { type: 'file', action: 'listLocal', state: 'done', data: { records: library.list().map((p, i) => ({ filename: FILE(p.id), timestamp: 1760000000000 - i * 3600000, size: 2_000_000, is_dir: false, plate_number: 1 })) } });
      case 'file/listUdisk': return pub(ep, { type: 'file', action: 'listUdisk', state: 'done', data: { records: [] } });
      case 'peripherie/query': return pub(ep, { type: 'peripherie', action: 'query', state: 'done', data: { udisk: false, camera: true, multiColorBox: m.slots.length > 0 } });
      case 'video/startCapture': return pub(ep, { type: 'video', action: 'startCapture', state: 'initSuccess' });
      case 'video/stopCapture': return pub(ep, { type: 'video', action: 'stopCapture', state: 'pushStopped' });
      default: return;
    }
    const r = printReport(m);   // print commands: the new state right away
    if (r) pub('print', r);
  });

  const tlsServer = tls.createServer({
    key: fs.readFileSync(path.join(CERT, 'demo-key.pem')), cert: fs.readFileSync(path.join(CERT, 'demo-cert.pem')),
    minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
  }, broker.handle);
  await listen(tlsServer, host, port);
  closers.push(() => { tlsServer.close(); broker.close(); });

  // The printer talks on its own: job + temperatures every 2 s, busy / free, camera URL.
  let tick = 0;
  const pushT = setInterval(() => {
    tick++;
    const r = printReport(m);
    if (r) pub('print', r);
    pub('tempature', tempReport(m));
    if (tick % 3 === 0) pub('status', { type: 'status', action: 'workReport', state: m.isBusy ? 'busy' : 'free' });
    if (tick % 3 === 1) pub('info', { type: 'info', action: 'report', state: 'done', data: { urls: { rtspUrl: `http://${host}:18088/flv` } } });
  }, 2000);
  closers.push(() => clearInterval(pushT));

  const live = new Set();
  try {
    const cam = http.createServer((req, res) => {
      req.resume();
      if (new URL(req.url, `http://${host}`).pathname === '/flv') return flvStream(res, m, library, ffmpegPath, live);
      res.writeHead(404); res.end();
    });
    await listen(cam, host, 18088);
    closers.push(() => { for (const s of [...live]) s(); cam.close(); });
    const info = http.createServer((req, res) => {
      req.resume();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ modelId: model, modelName: 'Kobra 3 V2', deviceName: 'Kobra 3 V2 (demo)', deviceType: 'fdm',
        usn: `uuid:fdm:${record.macAddress || '00:00:00:00:00:00'}`, rtspUrl: `http://${host}:18088/flv` }));
    });
    await listen(info, host, 18910);
    closers.push(() => info.close());
  } catch (e) {
    closers.forEach(c => { try { c(); } catch (_) {} });
    throw e;
  }
  return { close() { closers.forEach(c => { try { c(); } catch (_) {} }); } };
}

module.exports = {
  brand: 'anycubic', slotCount: 4, start,
  // LAN only: no `mode`, no cloud fields. A MAC address spares the identity probe.
  recordFields: host => ({
    ip: host, port: 9883, acuModelId: '20027', deviceId: crypto.randomBytes(8).toString('hex'),
    username: 'demo', password: crypto.randomBytes(6).toString('hex'), printerModelId: '2',
    macAddress: `02:00:00:${crypto.randomBytes(3).toString('hex').match(/../g).join(':')}`,
  }),
  addressOf: rec => String(rec.ip || ''),
};
