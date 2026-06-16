/**
 * scripts/acu-cam-live.mjs — settle the Kobra X camera transport. Dev tool.
 *
 * CDP showed the slicer, on camera start, (1) MQTT-publishes video/startCapture
 * and (2) GETs http://<ip>:18088/live/<token> — a long-lived response (no body
 * end). No SDP/ICE/api-call appears in the page, so signaling (if WebRTC) rides
 * MQTT, OR /live/<token> is simply the media stream. This probe answers both:
 *   • dumps every MQTT video/report payload in full (token? sdp? url? ice?),
 *   • GETs /live/<token> and reports content-type + first bytes (magic) + how
 *     many bytes stream in ~4s (continuous ⇒ it's the live media).
 *
 * Token: the slicer reused `zg6fRsKc` across sessions (stable). Pass a fresh one
 * as the 2nd arg if needed; otherwise it tries the report-advertised one, then
 * the known default.
 *
 * Usage: node scripts/acu-cam-live.mjs 192.168.1.16 [token]
 */
import mqtt from 'mqtt';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function deob(s) {
  const o = Buffer.from(s, 'base64'); for (let i = 0; i < o.length; i++) o[i] = (o[i] - 5) & 0xff;
  const n = Buffer.from(o.toString('ascii'), 'base64'); for (let i = 0; i < n.length; i++) n[i] = (n[i] - 5) & 0xff;
  return n.toString('utf8');
}
function confs() {
  const l = [];
  if (process.platform === 'win32') { if (process.env.APPDATA) l.push(path.join(process.env.APPDATA, 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf')); }
  else if (process.platform === 'darwin') l.push(path.join(os.homedir(), 'Library', 'Application Support', 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
  else l.push(path.join(os.homedir(), '.config', 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
  return l.flatMap(p => [p, p + '.bak']);
}
function readPrinters() {
  const c = confs().find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (!c) throw new Error('AnycubicSlicerNext.conf not found');
  const m = fs.readFileSync(c, 'utf8').match(/"machine_list_of_LAN"\s*:\s*"([^"]*)"/);
  if (!m || !m[1]) throw new Error('no machine_list_of_LAN');
  return JSON.parse(deob(m[1])).map(p => {
    const b = String(p.broker || '').match(/mqtts?:\/\/([^:]+):(\d+)/);
    return { ip: b ? b[1] : String(p.ip || ''), port: b ? +b[2] : 9883, username: String(p.username || ''),
             password: String(p.password || ''), deviceId: String(p.deviceId || ''),
             modelId: String(p.modeId || p.modelId || ''), name: String(p.name || '') };
  }).filter(p => p.ip && p.username);
}

function classify(buf) {
  if (!buf || !buf.length) return 'empty';
  if (buf[0] === 0x46 && buf[1] === 0x4C && buf[2] === 0x56) return 'FLV (HTTP-FLV → ffmpeg works)';
  if (buf.length > 8 && buf.toString('ascii', 4, 8) === 'ftyp') return 'fMP4/MP4 (ftyp)';
  if (buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x00 || buf[2] === 0x01)) return 'H.264 Annex-B (raw NAL)';
  const head = buf.slice(0, 16).toString('latin1');
  if (/^v=0/.test(head)) return 'SDP (v=0 → WHEP/offer-answer over HTTP)';
  if (/--/.test(head)) return 'multipart (MJPEG boundary?)';
  if (/^\s*[{[]/.test(head)) return 'JSON';
  if (/^<|<!doctype/i.test(head)) return 'HTML';
  return 'unknown';
}
const peekUrl = (ip, pth) => `http://${ip}:18088${pth}`;

async function httpInfo(ip) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
  try { const res = await fetch(`http://${ip}:18910/info`, { signal: ctl.signal }); return `HTTP ${res.status}  ${await res.text()}`; }
  catch (e) { return e.name === 'AbortError' ? 'timeout' : e.message; }
  finally { clearTimeout(t); }
}

async function probeStream(ip, pth, ms = 4000) {
  const url = peekUrl(ip, pth);
  const ctl = new AbortController();
  let total = 0, chunks = 0, first = null, ct = '', status = 0;
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    status = res.status; ct = res.headers.get('content-type') || '';
    if (!res.body) return { url, status, ct, note: 'no body' };
    const reader = res.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) { if (!first) first = Buffer.from(value.slice(0, 32)); total += value.length; chunks++; }
    }
  } catch (e) { if (e.name !== 'AbortError') return { url, status, ct, note: e.message, total, chunks, first }; }
  finally { clearTimeout(t); }
  return { url, status, ct, total, chunks, first };
}

const ip = process.argv[2];
const argToken = process.argv[3];
const p = readPrinters().find(x => !ip || x.ip === ip);
if (!p) { console.error('printer not found in slicer config'); process.exit(1); }
console.log(`Camera transport probe — ${p.name || p.ip} (${p.ip}, model ${p.modelId})\n`);

const CMD = `anycubic/anycubicCloud/v1/web/printer/${p.modelId}/${p.deviceId}/video`;
const REPORT = `anycubic/anycubicCloud/v1/printer/public/${p.modelId}/${p.deviceId}/#`;
const uuid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

let reportToken = null;
const client = mqtt.connect({ host: p.ip, port: p.port, protocol: 'mqtts', username: p.username, password: p.password,
  rejectUnauthorized: false, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2', clientId: `live_${uuid()}`, clean: true, reconnectPeriod: 0 });

client.on('message', (topic, payload) => {
  if (!/video/i.test(topic)) return;
  const leaf = topic.split('/').slice(-2).join('/');
  let body = payload.toString();
  try { body = JSON.stringify(JSON.parse(body)); } catch {}
  console.log(`  << ${leaf}: ${body}`);
  // hunt for a token/url in the report (e.g. .../live/<token> or a "url"/"token" field)
  const m = body.match(/live\/([A-Za-z0-9_-]{4,})/) || body.match(/"(?:token|streamId|url)"\s*:\s*"([^"]+)"/);
  if (m && !reportToken) { reportToken = m[1].includes('/') ? m[1].split('/').pop() : m[1]; }
});

client.on('connect', async () => {
  console.log('GET /info (18910) — does it advertise the stream URL/token?\n  ' + await httpInfo(p.ip) + '\n');

  client.subscribe(REPORT, { qos: 0 });
  console.log('subscribed; publishing video/startCapture — dumping video/report payloads:\n');
  client.publish(CMD, JSON.stringify({ type: 'video', action: 'startCapture', timestamp: Date.now(), msgid: uuid(), data: null }));
  await new Promise(r => setTimeout(r, 4000)); // collect reports + let the stream come up

  const token = argToken || reportToken || 'zg6fRsKc';
  // /flv = Kobra 3 V2 path · /live/<bogus> = is the token even validated? · /live/<real>
  const paths = ['/flv', '/live/zzBogusToken99', `/live/${token}`];
  for (const pth of paths) {
    console.log(`\nprobing ${pth} for 4s…`);
    const r = await probeStream(p.ip, pth);
    console.log(`  ${r.url}`);
    console.log(`  status: ${r.status}   content-type: ${r.ct || '(none)'}`);
    if (r.note) console.log(`  note: ${r.note}`);
    if (r.first) console.log(`  first bytes: ${r.first.toString('hex')}  | ascii: ${r.first.toString('latin1').replace(/[^\x20-\x7e]/g, '.')}`);
    console.log(`  streamed: ${r.total || 0} bytes in ${r.chunks || 0} chunks  → ${r.total > 0 ? classify(r.first) : 'nothing'}`);
  }
  console.log('\n⇒ if /flv streams FLV, no token is needed at all; otherwise we discover /live/<token> via /info or another channel.');

  console.log('\nstopCapture; done.');
  client.publish(CMD, JSON.stringify({ type: 'video', action: 'stopCapture', timestamp: Date.now(), msgid: uuid(), data: null }));
  setTimeout(() => { client.end(true); process.exit(0); }, 1200);
});
client.on('error', e => { console.error('mqtt error:', e.message); process.exit(1); });
