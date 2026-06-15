/**
 * scripts/acu-file-list.mjs — query the Anycubic local file list (dev tool).
 *
 * Connects to a paired printer's local MQTT broker (same creds as the sniffer),
 * publishes `file/listLocal` + `file/listUdisk`, and prints every `file` report
 * it receives — to discover the `records[]` shape and whether a per-file
 * thumbnail/preview reference is exposed.
 *
 * Usage: node scripts/acu-file-list.mjs [ip]
 */
import mqtt from 'mqtt';
import fs from 'fs';
import os from 'os';
import path from 'path';

function deobfuscate(stored) {
  const outer = Buffer.from(stored, 'base64');
  for (let i = 0; i < outer.length; i++) outer[i] = (outer[i] - 5) & 0xff;
  const inner = Buffer.from(outer.toString('ascii'), 'base64');
  for (let i = 0; i < inner.length; i++) inner[i] = (inner[i] - 5) & 0xff;
  return inner.toString('utf8');
}
function confCandidates() {
  const list = [];
  if (process.platform === 'darwin') list.push(path.join(os.homedir(), 'Library', 'Application Support', 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
  else if (process.platform === 'win32' && process.env.APPDATA) list.push(path.join(process.env.APPDATA, 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
  else list.push(path.join(os.homedir(), '.config', 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
  return list.flatMap(p => [p, p + '.bak']);
}
function readPrinters() {
  const conf = confCandidates().find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (!conf) throw new Error('AnycubicSlicerNext.conf not found');
  const m = fs.readFileSync(conf, 'utf8').match(/"machine_list_of_LAN"\s*:\s*"([^"]*)"/);
  if (!m || !m[1]) throw new Error('no machine_list_of_LAN');
  return JSON.parse(deobfuscate(m[1])).map(p => {
    const bm = String(p.broker || '').match(/mqtts?:\/\/([^:]+):(\d+)/);
    return {
      ip: bm ? bm[1] : String(p.ip || ''), port: bm ? parseInt(bm[2], 10) : 9883,
      username: String(p.username || ''), password: String(p.password || ''),
      deviceId: String(p.deviceId || ''), modelId: String(p.modeId || p.modelId || ''), name: String(p.name || ''),
    };
  }).filter(p => p.ip && p.username && p.password);
}

const wantIp = process.argv[2] || null;
const printers = readPrinters();
const p = wantIp ? printers.find(x => x.ip === wantIp) : printers[0];
if (!p) { console.error('no paired printer'); process.exit(1); }

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const cmd = (family) => `anycubic/anycubicCloud/v1/web/printer/${p.modelId}/${p.deviceId}/${family}`;
const req = (action, data = null, type) => JSON.stringify({ type, action, timestamp: Date.now(), msgid: uid(), data });

console.log(`Connecting to ${p.name || p.ip} (model ${p.modelId})…`);
const client = mqtt.connect({
  host: p.ip, port: p.port, protocol: 'mqtts',
  username: p.username, password: p.password,
  rejectUnauthorized: false, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
  clientId: `filels_${uid()}`, clean: true, reconnectPeriod: 0,
});

// Candidate `data` shapes for listLocal — fired one at a time, spaced, so the
// response that follows each publish maps to it.
const VARIANTS = [
  { filetype: -1, path: '/' },
  { filetype: 0, path: '/' },
  { filename: '', filetype: -1, path: '/' },
  { path: '/', filetype: -1, page: 1, count: 50 },
  { filetype: -1 },
];
let vi = 0;
client.on('connect', () => {
  console.log('connected — probing file/listLocal data shapes\n');
  client.subscribe('#', { qos: 0 });
  const fireNext = () => {
    if (vi >= VARIANTS.length) return;
    const data = VARIANTS[vi];
    console.log(`>>> listLocal data = ${JSON.stringify(data)}`);
    client.publish(cmd('file'), req('listLocal', data, 'file'));
    vi++;
    setTimeout(fireNext, 1400);
  };
  setTimeout(fireNext, 400);
});
client.on('message', (topic, payload) => {
  let body = payload.toString('utf8');
  try { body = JSON.stringify(JSON.parse(body)); } catch {}
  if (/\/file\/report|"type":"file"/.test(topic)) {
    // only show the printer's replies (report topic), not our own echoes
    if (/\/report/.test(topic)) console.log(`    <= ${body}\n`);
  }
});
client.on('error', e => console.error('error:', e.message));
setTimeout(() => { console.log('done'); client.end(true); process.exit(0); }, 13000);
