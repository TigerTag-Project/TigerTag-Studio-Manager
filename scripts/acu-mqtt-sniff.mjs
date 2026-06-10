/**
 * scripts/acu-mqtt-sniff.mjs — Anycubic local-broker MQTT sniffer (dev tool).
 *
 * Connects to a paired Anycubic printer's local MQTT broker using the durable
 * credentials cached by AnycubicSlicerNext, subscribes to EVERYTHING (`#`),
 * and prints every topic + payload with a timestamp. Use it to capture the
 * camera/video activation command: run this, then hit Play (and later Stop)
 * on the camera in the slicer's Workbench and watch what appears.
 *
 * Usage:
 *   node scripts/acu-mqtt-sniff.mjs            # first paired printer
 *   node scripts/acu-mqtt-sniff.mjs 192.168.1.26   # pick by IP
 *
 * No app, no Electron — just the `mqtt` dependency already in package.json.
 */
import mqtt from 'mqtt';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── Slicer config credential read (mirror of main.js anycubic:read-slicer-config)
function deobfuscate(stored) {
  const outer = Buffer.from(stored, 'base64');
  for (let i = 0; i < outer.length; i++) outer[i] = (outer[i] - 5) & 0xff;
  const inner = Buffer.from(outer.toString('ascii'), 'base64');
  for (let i = 0; i < inner.length; i++) inner[i] = (inner[i] - 5) & 0xff;
  return inner.toString('utf8');
}

function confCandidates() {
  const list = [];
  if (process.platform === 'win32') {
    if (process.env.APPDATA) list.push(path.join(process.env.APPDATA, 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
  } else if (process.platform === 'darwin') {
    list.push(path.join(os.homedir(), 'Library', 'Application Support', 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
  } else {
    list.push(path.join(os.homedir(), '.config', 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
  }
  return list.flatMap(p => [p, p + '.bak']);
}

function readPrinters() {
  const conf = confCandidates().find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (!conf) throw new Error('AnycubicSlicerNext.conf not found');
  const text = fs.readFileSync(conf, 'utf8');
  const m = text.match(/"machine_list_of_LAN"\s*:\s*"([^"]*)"/);
  if (!m || !m[1]) throw new Error('no machine_list_of_LAN in config');
  const arr = JSON.parse(deobfuscate(m[1]));
  return arr.map(p => {
    const bm = String(p.broker || '').match(/mqtts?:\/\/([^:]+):(\d+)/);
    return {
      ip: bm ? bm[1] : String(p.ip || ''),
      port: bm ? parseInt(bm[2], 10) : 9883,
      username: String(p.username || ''),
      password: String(p.password || ''),
      deviceId: String(p.deviceId || ''),
      modelId: String(p.modeId || p.modelId || ''),
      name: String(p.name || ''),
    };
  }).filter(p => p.ip && p.username && p.password);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const wantIp = process.argv[2] || null;
let printers;
try { printers = readPrinters(); }
catch (e) { console.error('ERROR:', e.message); process.exit(1); }

const p = wantIp ? printers.find(x => x.ip === wantIp) : printers[0];
if (!p) { console.error(`No paired printer${wantIp ? ` for ${wantIp}` : ''}. Found: ${printers.map(x => x.ip).join(', ') || 'none'}`); process.exit(1); }

console.log(`Connecting to ${p.name || p.ip} (mqtts://${p.ip}:${p.port}, model ${p.modelId})…`);

const client = mqtt.connect({
  host: p.ip, port: p.port, protocol: 'mqtts',
  username: p.username, password: p.password,
  rejectUnauthorized: false, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
  clientId: `sniff_${Math.random().toString(16).slice(2)}`,
  clean: true, reconnectPeriod: 0,
});

const ts = () => new Date().toLocaleTimeString([], { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');

client.on('connect', () => {
  console.log(`[${ts()}] connected — subscribing to #  (now hit Play / Stop on the camera in the slicer)\n`);
  client.subscribe('#', { qos: 0 }, (err) => {
    if (err) {
      console.error('subscribe # failed:', err.message, '\n— broker may restrict wildcard; falling back to the printer subtree');
      client.subscribe(`anycubic/anycubicCloud/v1/+/printer/${p.modelId}/${p.deviceId}/#`, { qos: 0 });
      client.subscribe(`anycubic/anycubicCloud/v1/printer/+/${p.modelId}/${p.deviceId}/#`, { qos: 0 });
    }
  });
});

client.on('message', (topic, payload) => {
  let body = payload.toString('utf8');
  try { body = JSON.stringify(JSON.parse(body)); } catch {}
  // Highlight anything camera/video/WebRTC/TRTC related.
  const hot = /video|camera|peer|stream|flv|capture|sdp|ice|candidate|offer|answer|trtc|room|usersig|webrtc|"token"/i.test(topic + body) ? '  <<< CAMERA?' : '';
  console.log(`[${ts()}] ${topic}${hot}\n           ${body}\n`);
});

client.on('error', (e) => console.error(`[${ts()}] error:`, e.message));
client.on('close', () => console.log(`[${ts()}] closed`));

process.on('SIGINT', () => { console.log('\nbye'); client.end(true); process.exit(0); });
