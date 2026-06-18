/**
 * scripts/acu-file-confirm.mjs — confirm the §5e LAN file-management action
 * strings against real hardware (dev tool).
 *
 * Unlike acu-file-list.mjs (which probed `data` shapes), this sends the EXACT
 * payloads the driver emits (PROTOCOL.md §5e) so a clean reply proves the
 * inferred LAN action strings are correct:
 *   • {type:"file",       action:"listLocal"}        (no data)
 *   • {type:"file",       action:"listUdisk"}        (no data)
 *   • {type:"peripherie", action:"query"}            (no data)
 *
 * It does NOT test delete (destructive) — confirm that via the UI later.
 * Topics mirror main.js: publish web/printer/{modelId}/{deviceId}/{endpoint},
 * reports arrive on printer/public/{modelId}/{deviceId}/#.
 *
 * Usage: node scripts/acu-file-confirm.mjs [ip]
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

const args = process.argv.slice(2);
const delProbe = args.includes('delprobe');     // non-destructive deleteLocal action-string probe
const delUdisk = args.includes('deludiskprobe');// non-destructive deleteUdisk action-string probe
const udiskPaths = args.includes('udiskpaths'); // probe candidate USB-stick root paths
const wantIp = args.find(a => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || null;
const printers = readPrinters();
const p = wantIp ? printers.find(x => x.ip === wantIp) : printers[0];
if (!p) { console.error('no paired printer'); process.exit(1); }

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const cmd = (endpoint) => `anycubic/anycubicCloud/v1/web/printer/${p.modelId}/${p.deviceId}/${endpoint}`;
// _acuRequest(action, data, type): omits `data` when null, else includes it.
const req = (type, action, data) => {
  const m = { type, action, timestamp: Date.now(), msgid: uid() };
  if (data) m.data = data;
  return JSON.stringify(m);
};

console.log(`Connecting to ${p.name || p.ip} (model ${p.modelId})…`);
const client = mqtt.connect({
  host: p.ip, port: p.port, protocol: 'mqtts',
  username: p.username, password: p.password,
  rejectUnauthorized: false, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
  clientId: `fileconf_${uid()}`, clean: true, reconnectPeriod: 0,
});

// (endpoint, type, action, data) — sent one at a time, spaced, so each reply maps back.
// `delprobe`: confirm the deleteLocal action string WITHOUT deleting a real file —
// a non-existent name should reply "file not found" (action recognized) rather
// than "unknown action" (action wrong).
const STEPS = delProbe ? [
  ['file', 'file', 'deleteLocal', { filename: '__tigertag_nonexistent_probe__.gcode', filetype: -1, path: '/' }],
] : delUdisk ? [
  ['file', 'file', 'deleteUdisk', { filename: '__tigertag_nonexistent_probe__.gcode', filetype: -1, path: '/' }],
] : udiskPaths ? [
  ['file', 'file', 'listUdisk', { path: '/' }],
  ['file', 'file', 'listUdisk', { path: '/udisk' }],
  ['file', 'file', 'listUdisk', { path: '/usb' }],
  ['file', 'file', 'listUdisk', { path: 'udisk' }],
  ['file', 'file', 'listUdisk', { path: '/mnt/udisk' }],
] : [
  ['file', 'file', 'listLocal', { path: '/' }],
  ['file', 'file', 'listUdisk', { path: '/' }],
  ['peripherie', 'peripherie', 'query'],
];
let si = 0;
client.on('connect', () => {
  console.log('connected — sending exact driver payloads\n');
  client.subscribe('#', { qos: 0 });
  const fireNext = () => {
    if (si >= STEPS.length) return;
    const [endpoint, type, action, data] = STEPS[si];
    console.log(`>>> publish ${endpoint}: ${req(type, action, data)}`);
    client.publish(cmd(endpoint), req(type, action, data));
    si++;
    setTimeout(fireNext, 2000);
  };
  setTimeout(fireNext, 500);
});
client.on('message', (topic, payload) => {
  // Only the printer's replies (report subtree), not our own command echoes.
  if (!/\/printer\/public\//.test(topic)) return;
  let body = payload.toString('utf8');
  try { body = JSON.stringify(JSON.parse(body)); } catch {}
  if (/"type":"(file|peripherie)"/.test(body)) console.log(`    <= ${body}\n`);
});
client.on('error', e => console.error('error:', e.message));
setTimeout(() => { console.log('done'); client.end(true); process.exit(0); }, 9000);
