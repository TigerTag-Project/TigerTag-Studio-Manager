/**
 * scripts/acu-cam-test.mjs — Anycubic camera activation tester (dev tool).
 *
 * Connects to a paired printer's local broker, subscribes to its video
 * report, publishes {type:"video",action:"startCapture"}, then polls
 * http://<ip>:18088/flv to see whether the stream goes live. Sends
 * stopCapture and exits. Use it to check whether a model that advertises no
 * `rtspUrl` (e.g. Kobra X) still supports the same camera activation.
 *
 * Usage: node scripts/acu-cam-test.mjs 192.168.1.16
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
  if (process.platform === 'win32') { if (process.env.APPDATA) list.push(path.join(process.env.APPDATA, 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf')); }
  else if (process.platform === 'darwin') list.push(path.join(os.homedir(), 'Library', 'Application Support', 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
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
    return { ip: bm ? bm[1] : String(p.ip || ''), port: bm ? +bm[2] : 9883,
             username: String(p.username || ''), password: String(p.password || ''),
             deviceId: String(p.deviceId || ''), modelId: String(p.modeId || p.modelId || ''), name: String(p.name || '') };
  }).filter(p => p.ip && p.username);
}

const wantIp = process.argv[2];
const p = readPrinters().find(x => !wantIp || x.ip === wantIp);
if (!p) { console.error('printer not found'); process.exit(1); }
console.log(`Testing camera on ${p.name || p.ip} (model ${p.modelId}, ${p.ip})`);

const cmdTopic    = `anycubic/anycubicCloud/v1/web/printer/${p.modelId}/${p.deviceId}/video`;
const reportTopic = `anycubic/anycubicCloud/v1/printer/public/${p.modelId}/${p.deviceId}/#`;
const uuid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function probeFlv() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const res = await fetch(`http://${p.ip}:18088/flv`, { signal: ctl.signal });
    if (res.status !== 200) { ctl.abort(); return `HTTP ${res.status}`; }
    const { value } = await res.body.getReader().read();
    ctl.abort();
    const isFlv = value && value[0] === 0x46 && value[1] === 0x4C && value[2] === 0x56;
    return isFlv ? 'LIVE (FLV)' : `200 but not FLV (${value ? value.slice(0,4).toString('hex') : 'empty'})`;
  } catch (e) { return e.name === 'AbortError' ? 'timeout' : e.message; }
  finally { clearTimeout(t); }
}

const client = mqtt.connect({ host: p.ip, port: p.port, protocol: 'mqtts', username: p.username, password: p.password,
  rejectUnauthorized: false, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2', clientId: `camtest_${uuid()}`, clean: true, reconnectPeriod: 0 });

client.on('connect', async () => {
  console.log('connected; subscribing to reports + publishing video/startCapture…');
  client.subscribe(reportTopic, { qos: 0 });
  console.log(`cold /flv probe: ${await probeFlv()}`);
  client.publish(cmdTopic, JSON.stringify({ type: 'video', action: 'startCapture', timestamp: Date.now(), msgid: uuid(), data: null }));
  for (let i = 1; i <= 12; i++) {
    await new Promise(r => setTimeout(r, 1000));
    console.log(`  +${i}s  /flv: ${await probeFlv()}`);
  }
  console.log('publishing video/stopCapture; done.');
  client.publish(cmdTopic, JSON.stringify({ type: 'video', action: 'stopCapture', timestamp: Date.now(), msgid: uuid(), data: null }));
  setTimeout(() => { client.end(true); process.exit(0); }, 1500);
});
client.on('message', (topic, payload) => {
  const leaf = topic.split('/').slice(-2).join('/');
  let body = payload.toString(); try { body = JSON.stringify(JSON.parse(body)); } catch {}
  if (/video|response/i.test(topic)) console.log(`  << ${leaf}: ${body}`);
});
client.on('error', e => console.error('mqtt error:', e.message));
