/**
 * services/demo/faces/bambulab.js — a demo printer seen as a Bambu Lab P1S with
 * an AMS (4 trays), in LAN mode only (renderer/printers/bambulab/PROTOCOL.md),
 * on the printer's OWN loopback address (every port is fixed in the driver):
 *
 *   mqtts :8883  an MQTT broker (aedes) behind TLS — the driver checks no
 *                certificate, so the demo one serves. User "bblp" + the access
 *                code. device/{serial}/request in, device/{serial}/report out:
 *                push_status JSON (full on pushall, then every second), the
 *                get_version module list (AMS type), commands → engine.
 *   tls   :6000  the camera of the P1 / A1 family: an 80-byte auth packet in, then
 *                JPEG frames, each behind a 16-byte header (payload size, LE).
 *   ftps  :990   the file server (bambu-ftps.js): the job's .3mf with its plate
 *                thumbnail, implicit TLS, PASV answering 0.0.0.0 like the firmware.
 */
'use strict';

const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Aedes } = require('aedes');
const { listen, runGcode } = require('./common');
const { startBambuFtps } = require('./bambu-ftps');
const { startBambuRtsp } = require('./bambu-rtsp');

const CERT = path.join(__dirname, '..', 'certs');
const tlsKeys = () => ({ key: fs.readFileSync(path.join(CERT, 'demo-key.pem')), cert: fs.readFileSync(path.join(CERT, 'demo-cert.pem')) });
// spd_lvl 1 Silent … 4 Ludicrous ↔ the engine's speed factor.
const SPEED = { 1: 50, 2: 100, 3: 124, 4: 166 };
const speedLvl = pct => (pct < 75 ? 1 : pct < 112 ? 2 : pct < 145 ? 3 : 4);
const fan15 = pct => String(Math.round(Math.max(0, Math.min(100, pct)) * 15 / 100));
const rgbaHex = c => `${String(c || '').replace(/^#/, '').slice(0, 6).toUpperCase()}FF`;
const STATE = { idle: 'IDLE', heating: 'PREPARE', leveling: 'PREPARE', printing: 'RUNNING', paused: 'PAUSE', complete: 'FINISH', cancelled: 'IDLE', error: 'FAILED' };

// New-firmware temperature: current in the low 16 bits, target in the high 16.
const packed = h => ((Math.max(0, Math.round(h.target)) & 0xFFFF) << 16) | (Math.max(0, Math.round(h.cur)) & 0xFFFF);

// What ams_filament_setting said beyond type + colour, echoed like the printer does.
const trayFields = p => Object.fromEntries(['tray_info_idx', 'nozzle_temp_min', 'nozzle_temp_max']
  .filter(k => p[k] != null).map(k => [k, String(p[k])]));

/** The AMS block — an empty one on a model printing from the external spool only. `info[i]`: trayFields of tray i. */
function amsBlock(m, info = []) {
  if (!m.slots.length) return { ams_exist_bits: '0', tray_exist_bits: '0', tray_now: '255', ams: [] };
  return { ams_exist_bits: '1', tray_exist_bits: ((1 << m.slots.length) - 1).toString(16), tray_now: String(m.activeSlot), ams: [{
    id: '0', humidity: '4', humidity_raw: '28', temp: '25.1',
    tray: m.slots.map((s, i) => (s.empty ? { id: String(i) } : {
      id: String(i), ...info[i],
      tray_color: rgbaHex(s.color), tray_type: s.material, state: i === m.activeSlot && m.isBusy ? 11 : 0,
    })),
  }] };
}

/* The H2 family (two nozzles) reports its temperatures in `device` only — one
   `extruder.info` entry per nozzle (id 0 = right, 1 = left), the active one in
   bits 4-7 of `extruder.state`; bed and chamber move there too. */
function deviceBlock(m) {
  const noz = m.nozzles();
  if (noz.length < 2) return {};
  const ch = m.heaters.chamber;
  return { device: {
    extruder: { state: (m.activeTool & 0xF) << 4, info: noz.map((h, id) => ({ id, temp: packed(h) })) },
    bed: { info: { temp: packed(m.heaters.bed) } },
    ...(ch ? { ctc: { info: { temp: packed(ch) } } } : {}),
  } };
}

// Catalog id → the serial prefix real machines of that model carry. None is
// known for A2L, X2D or the H2 family: they get a neutral "0DM" (demo) prefix.
const SERIAL_PREFIX = { 1: '030', 2: '039', 3: '01P', 4: '01S', 5: '00M', 6: '03W', 10: '22E' };

function report(m, extra, full) {
  const n = m.nozzles()[m.activeTool] || m.nozzles()[0], bed = m.heaters.bed, ch = m.heaters.chamber, active = m.print && m.phase !== 'idle';
  return { print: {
    command: 'push_status', msg: full ? 0 : 1, sequence_id: '0',
    gcode_state: STATE[m.phase] || 'IDLE',
    mc_percent: active ? Math.round(m.progress * 100) : 0,
    mc_remaining_time: active ? Math.round(m.remainingSec / 60) : 0,
    layer_num: active ? m.layer : 0, total_layer_num: active ? m.print.layersTotal : 0,
    subtask_name: active ? m.print.id : '', gcode_file: active ? `/data/Metadata/plate_1.gcode` : '', plate_idx: 1,
    nozzle_temper: +n.cur.toFixed(1), nozzle_target_temper: n.target,
    bed_temper: +bed.cur.toFixed(1), bed_target_temper: bed.target,
    ...(ch ? { chamber_temper: +ch.cur.toFixed(1) } : {}),
    cooling_fan_speed: fan15(m.fan), big_fan1_speed: fan15(extra.aux), big_fan2_speed: fan15(extra.chamberFan),
    spd_lvl: speedLvl(m.speedPct), spd_mag: m.speedPct,
    lights_report: [{ node: 'chamber_light', mode: m.light ? 'on' : 'off' }],
    ipcam: { ipcam_dev: '1', rtsp_url: 'disable_rtsp_jpeg_tcp' },
    ams: amsBlock(m, extra.trays),
    ...deviceBlock(m),
    vt_tray: { id: '254', ...extra.ext.info,
      tray_color: rgbaHex(extra.ext.color), tray_type: extra.ext.material, state: 0 },
  } };
}

async function start({ machine: m, address, library, record, model, ffmpegPath }) {
  // "host" → the printer's own ports (MQTT 8883, camera 6000). "host:port" → MQTT
  // on that port, for several Bambu printers behind one address (clients that
  // honour "host:port", e.g. Tiger Touch); the camera then only if 6000 is free.
  const [host, mqttPort = '8883'] = String(address).split(':');
  const customPort = String(address).includes(':');
  const serial = String(record.serialNumber || ''), code = String(record.password || '');
  const extra = { aux: 0, chamberFan: 0, ext: { material: 'PLA', color: '#00AE42', info: {} }, trays: [] };
  const mode = { relative: false };
  const closers = [];

  const broker = await Aedes.createBroker();
  const pub = obj => broker.publish({ topic: `device/${serial}/report`, payload: Buffer.from(JSON.stringify(obj)), qos: 0, retain: false }, () => {});
  broker.authenticate = (_c, user, pw, cb) => cb(null, user === 'bblp' && String(pw || '') === code);
  broker.on('publish', (pkt, client) => {
    if (!client || pkt.topic !== `device/${serial}/request`) return;
    let msg; try { msg = JSON.parse(String(pkt.payload)); } catch (_) { return; }
    if (msg.info?.command === 'get_version') {
      return pub({ info: { command: 'get_version', sequence_id: msg.info.sequence_id, module: [
        { name: 'ota', sw_ver: '01.08.00.00', product_name: `Bambu Lab ${model?.name || 'P1S'} (demo)` },
        ...(m.slots.length ? [{ name: 'ams/0', sw_ver: '00.00.06.49' }] : []),
      ] } });
    }
    if (msg.pushing?.command === 'pushall') return pub(report(m, extra, true));
    if (msg.system?.command === 'ledctrl') { m.setLight(msg.system.led_mode === 'on'); return pub(report(m, extra)); }
    const p = msg.print;
    if (!p) return;
    switch (p.command) {
      case 'pause': m.pause(); break;
      case 'resume': m.resume(); break;
      case 'stop': m.stop(); break;
      case 'print_speed': m.setSpeed(SPEED[Number(p.param)] || 100); break;
      case 'gcode_line':
        try {
          runGcode(m, p.param, mode, (cmd, _params, line) => {
            if (cmd === 'M145') return true;   // chamber heater on / off: nothing to simulate
            const fan = line.match(/^M106\s+P(\d)\s+S(\d+)/i);
            if (fan) {
              const pct = Number(fan[2]) / 2.55;
              if (fan[1] === '1') m.setFan(pct); else if (fan[1] === '2') extra.aux = pct; else extra.chamberFan = pct;
              return true;
            }
            return false;
          });
        } catch (_) { /* a refused move: the printer just does not move */ }
        break;
      case 'ams_filament_setting': {
        const patch = { material: p.tray_type, color: `#${String(p.tray_color || '').slice(0, 6)}` };
        if (Number(p.ams_id) === 255) Object.assign(extra.ext, patch, { info: trayFields(p) });
        else if (m.setSlot(Number(p.tray_id), { ...patch, empty: false })) extra.trays[Number(p.tray_id)] = trayFields(p);
        break;
      }
      default: return;
    }
    pub(report(m, extra));   // the new state right away, like the printer's next push
  });
  const mqttServer = tls.createServer(tlsKeys(), broker.handle);
  await listen(mqttServer, host, Number(mqttPort));
  closers.push(() => { mqttServer.close(); broker.close(); });
  const pushT = setInterval(() => pub(report(m, extra)), 1000);
  closers.push(() => clearInterval(pushT));

  // ── Camera, port 6000: auth packet in, [16-byte header + JPEG] out ─────────
  const camSockets = new Set();
  const cam = tls.createServer(tlsKeys(), sock => {
    camSockets.add(sock);
    let authed = false, buf = Buffer.alloc(0), t = null;
    sock.on('data', d => {
      if (authed) return;
      buf = Buffer.concat([buf, d]);
      if (buf.length < 80) return;
      const user = buf.subarray(16, 48).toString('utf8').replace(/\0+$/, ''), pw = buf.subarray(48, 80).toString('utf8').replace(/\0+$/, '');
      if (user !== 'bblp' || pw !== code) return sock.destroy();
      authed = true;
      const send = () => {
        const f = library.frameFor(m);
        if (!f || f.type !== 'image/jpeg' || sock.destroyed) return;
        const hdr = Buffer.alloc(16);
        hdr.writeUInt32LE(f.data.length, 0);
        sock.write(Buffer.concat([hdr, f.data]));
      };
      send();
      t = setInterval(send, 200);
    });
    const end = () => { clearInterval(t); camSockets.delete(sock); };
    sock.on('close', end);
    sock.on('error', end);
  });
  try { await listen(cam, host, 6000); }
  catch (e) {
    if (!(customPort && e.code === 'EADDRINUSE')) { closers.forEach(c => c()); throw e; }
    cam.close();   // another Bambu on this host already has the camera port
  }
  closers.push(() => { for (const s of camSockets) s.destroy(); cam.close(); });

  // ── File server, FTPS :990 — where clients fetch the print's thumbnail ─────
  // One per host (the port is fixed): the printer on the host's own ports has it.
  if (!customPort) {
    try { closers.push(await startBambuFtps({ host, library, accessCode: code, keys: tlsKeys() })); }
    catch (_) { /* port 990 unavailable: no thumbnails, everything else works */ }
    // The X1 / X2D / H2 / P2S families stream RTSPS on :322 instead of the :6000 JPEG.
    if (model?.camera_transport === 'rtsp' && ffmpegPath) {
      try { closers.push(await startBambuRtsp({ host, m, library, accessCode: code, keys: tlsKeys(), ffmpegPath })); }
      catch (_) { /* port 322 unavailable: no camera, everything else works */ }
    }
  }

  return { close() { closers.forEach(c => { try { c(); } catch (_) {} }); } };
}

module.exports = {
  brand: 'bambulab', slotCount: 4, chamber: true, start,
  // LAN only: `broker` + serial + access code, no `mode`, an auto id (never
  // "cloud_…"), so no failover / cloud sync ever looks at it. The serial starts
  // with the model's real prefix where one is known (renderer/printers/bambulab/
  // probe.js); default model "3" = P1S (JPEG-over-TLS camera on :6000).
  recordFields: (host, _variant, modelId) => {
    const id = String(modelId || '3');
    return {
      broker: host,
      serialNumber: `${SERIAL_PREFIX[id] || '0DM'}00${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
      password: String(crypto.randomInt(10000000, 99999999)),
      printerModelId: id,
    };
  },
  addressOf: rec => String(rec.broker || rec.ip || ''),
};
