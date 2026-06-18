/**
 * scripts/acu-state-query.mjs — capture the idle query responses for fan +
 * temperature + light (dev tool), to see what the printer actually reports at
 * rest. Sends the EXACT queries the driver fires on connect (_acuLanGetInfo)
 * and dumps every fan/tempature/light/status/info reply.
 *
 * Why: on startup the fan reads 0% and temp TARGETS read unset even after being
 * set — so we need to know whether the idle query replies carry fan_speed_pct /
 * target_*_temp at all, or only current temps.
 *
 * Usage: node scripts/acu-state-query.mjs [ip]
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

const wantIp = process.argv.find(a => /^\d+\.\d+\.\d+\.\d+$/.test(a)) || null;
const printers = readPrinters();
const p = wantIp ? printers.find(x => x.ip === wantIp) : printers[0];
if (!p) { console.error('no paired printer'); process.exit(1); }

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const cmd = (endpoint) => `anycubic/anycubicCloud/v1/web/printer/${p.modelId}/${p.deviceId}/${endpoint}`;
const req = (type, action) => JSON.stringify({ type, action, timestamp: Date.now(), msgid: uid() });

console.log(`Connecting to ${p.name || p.ip} (model ${p.modelId})…`);
const client = mqtt.connect({
  host: p.ip, port: p.port, protocol: 'mqtts',
  username: p.username, password: p.password,
  rejectUnauthorized: false, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
  clientId: `statq_${uid()}`, clean: true, reconnectPeriod: 0,
});

// Exactly what _acuLanGetInfo fires on connect.
const STEPS = [
  ['tempature', 'tempature', 'query'],
  ['fan',       'fan',       'query'],
  ['light',     'light',     'query'],
];
let si = 0;
client.on('connect', () => {
  console.log('connected — firing idle state queries (watch the replies)\n');
  client.subscribe('#', { qos: 0 });
  const fireNext = () => {
    if (si >= STEPS.length) return;
    const [endpoint, type, action] = STEPS[si];
    console.log(`>>> ${endpoint}: ${req(type, action)}`);
    client.publish(cmd(endpoint), req(type, action));
    si++;
    setTimeout(fireNext, 1500);
  };
  setTimeout(fireNext, 400);
});
client.on('message', (topic, payload) => {
  if (!/\/printer\/public\//.test(topic)) return;   // printer replies only
  let body = payload.toString('utf8');
  try { body = JSON.stringify(JSON.parse(body)); } catch {}
  if (/"type":"(fan|tempature|light|status|info)"/.test(body)) console.log(`    <= ${body}\n`);
});
client.on('error', e => console.error('error:', e.message));
setTimeout(() => { console.log('done'); client.end(true); process.exit(0); }, 9000);
