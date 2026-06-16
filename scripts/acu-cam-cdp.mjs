/**
 * scripts/acu-cam-cdp.mjs — capture HOW AnycubicSlicerNext pulls a printer's
 * camera (Kobra X). Dev tool. Decides whether we can reproduce it natively.
 *
 * The slicer's control panel shows the Kobra X camera; it's WebView2/Chromium.
 * The camera runs in a SEPARATE frame/target (an iframe served by the printer),
 * so we attach over CDP and instrument EVERY target + EVERY execution context,
 * and inject persistently (addScriptToEvaluateOnNewDocument) so a freshly-opened
 * camera frame is hooked from the first line. Each context records into
 * window.__acuCam2:
 *   • fetch/XHR — request + RESPONSE body (the /live/<token> handshake, SDP).
 *   • RTCPeerConnection — config (iceServers), local/remote SDP, ICE, tracks.
 *   • WebSocket — signaling frames.
 *   • Loaded SDKs / globals — WebRtcStreamer / webrtcstreamer.js / trtc / etc.
 *
 * Prereq: slicer in bridge mode (--remote-debugging-port=9222), signed in, the
 * printer control panel open. Run this, then STOP+START the camera so a fresh
 * handshake runs under the hook.
 *
 * Usage: node scripts/acu-cam-cdp.mjs [captureSeconds=45]
 */
import { writeFileSync } from 'node:fs';

// Injected (once per execution context). Buffers events into window.__acuCam2.
const HOOK = `(() => {
  window.__acuCam2 = window.__acuCam2 || [];
  var B = window.__acuCam2;
  var T = function(s){ if (s==null) return null; if (typeof s!=='string'){ try{ s = JSON.stringify(s); }catch(e){ s = String(s); } } return s.length>8000 ? s.slice(0,8000)+'…[+'+(s.length-8000)+' chars]' : s; };
  var P = function(kind, url, body){ try{ B.push({ t:Date.now(), kind:kind, url:String(url||''), body:T(body) }); if (B.length>200) B.splice(0, B.length-200); }catch(e){} };
  var SKIP = /\.(?:js|css|png|jpe?g|gif|svg|woff2?|ttf|otf|map|ico|mp3|wav|webp)(?:\\?|$)/i;
  var done = [];

  if (!window.__c2_fetch) { window.__c2_fetch = 1; var of = window.fetch;
    if (of) { window.fetch = function(){ var a = arguments, u=''; try{ u = a[0] && (a[0].url||a[0]); }catch(e){} var b = a[1] && a[1].body;
      if (!SKIP.test(String(u))) P('fetch>', u, b);
      var pr = of.apply(this, arguments);
      try { if (!SKIP.test(String(u))) pr.then(function(res){ try{ res.clone().text().then(function(tx){ P('fetch<', u+' ['+res.status+']', tx); }).catch(function(){}); }catch(e){} }).catch(function(){}); }catch(e){}
      return pr; }; done.push('fetch'); } }

  if (!window.__c2_xhr) { window.__c2_xhr = 1; var oo = XMLHttpRequest.prototype.open, ose = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m,u){ this.__u=u; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function(b){ var self=this; try{ if (!SKIP.test(String(self.__u))){ P('xhr>', self.__u, b); self.addEventListener('load', function(){ try{ P('xhr<', self.__u+' ['+self.status+']', self.responseText); }catch(e){} }); } }catch(e){} return ose.apply(this, arguments); }; done.push('xhr'); }

  if (!window.__c2_rtc && window.RTCPeerConnection) { window.__c2_rtc = 1; var ORTC = window.RTCPeerConnection;
    var H = function(cfg){ try{ P('rtc.new', '', cfg); }catch(e){} var pc = new ORTC(cfg);
      try {
        var l = pc.setLocalDescription.bind(pc); pc.setLocalDescription = function(d){ try{ P('rtc.localSDP','', d&&d.sdp); }catch(e){} return l.apply(pc, arguments); };
        var r = pc.setRemoteDescription.bind(pc); pc.setRemoteDescription = function(d){ try{ P('rtc.remoteSDP','', d&&d.sdp); }catch(e){} return r.apply(pc, arguments); };
        pc.addEventListener('icecandidate', function(e){ if (e.candidate) P('rtc.ice','', e.candidate.candidate); });
        pc.addEventListener('track', function(e){ try{ P('rtc.track','', e.track && e.track.kind); }catch(x){} });
      } catch(e){}
      return pc; };
    H.prototype = ORTC.prototype;
    try { Object.getOwnPropertyNames(ORTC).forEach(function(k){ try{ if (!(k in H)) H[k]=ORTC[k]; }catch(e){} }); } catch(e){}
    window.RTCPeerConnection = H; window.webkitRTCPeerConnection = H; done.push('rtc'); }

  if (!window.__c2_ws && window.WebSocket) { window.__c2_ws = 1; var OWS = window.WebSocket;
    var WH = function(url, protos){ var ws = protos!==undefined ? new OWS(url, protos) : new OWS(url);
      try{ P('ws.open', url, null); ws.addEventListener('message', function(e){ try{ if (typeof e.data==='string') P('ws<', url, e.data); }catch(x){} }); }catch(x){}
      return ws; };
    WH.prototype = OWS.prototype;
    try { ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(function(k){ WH[k]=OWS[k]; }); } catch(e){}
    window.WebSocket = WH;
    var ows = OWS.prototype.send; OWS.prototype.send = function(d){ try{ if (typeof d==='string') P('ws>', this.url, d); }catch(x){} return ows.apply(this, arguments); }; done.push('ws'); }

  return 'hooks:['+done.join(',')+']';
})()`;

const READ = `JSON.stringify({
  events: (window.__acuCam2||[]),
  loc: String(location.href).slice(0,120),
  sdkGlobals: Object.keys(window).filter(function(k){ return /^(WebRtc|TRTC|TXLive|TXUGC|Tencent|WebRTC|trtc|liteav)/i.test(k); }),
  sdkScripts: (performance.getEntriesByType('resource')||[]).map(function(e){return e.name;}).filter(function(n){ return /webrtcstreamer|trtc|tencent|webrtc|liteav|txugc/i.test(n); })
})`;

// ── minimal CDP session over one WebSocket (id-matched calls + event stream) ──
function cdpSession(wsUrl) {
  let id = 0; const pending = new Map(); const handlers = [];
  const ws = new WebSocket(wsUrl);
  const ready = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', () => rej(new Error('ws'))); });
  ws.addEventListener('message', ev => { let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id != null && pending.has(m.id)) { const cb = pending.get(m.id); pending.delete(m.id); cb(m); }
    else if (m.method) handlers.forEach(fn => { try { fn(m); } catch {} }); });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res);
    try { ws.send(JSON.stringify({ id: i, method, params })); } catch { res({ error: 'send-failed' }); } });
  return { ready, send, on: fn => handlers.push(fn), close: () => { try { ws.close(); } catch {} } };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const seconds = Math.max(10, parseInt(process.argv[2] || '45', 10));
const port = 9222;

let targets;
try { targets = await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(5000) })).json(); }
catch { console.error('CDP not reachable on 9222 — launch the slicer in bridge mode (--remote-debugging-port=9222)'); process.exit(1); }

const insta = (targets || []).filter(t => t.webSocketDebuggerUrl
  && !/^devtools:/.test(t.url || '') && t.type !== 'browser' && t.type !== 'service_worker');
if (!insta.length) { console.error('No instrumentable targets — open the printer control panel'); process.exit(1); }
console.log(`hooking ${insta.length} target(s):`);

const sessions = [];
for (const t of insta) {
  const s = cdpSession(t.webSocketDebuggerUrl);
  try { await Promise.race([s.ready, sleep(3000).then(() => { throw new Error('timeout'); })]); }
  catch { console.log(`  ✗ ${(t.title || t.url || t.type).slice(0, 60)} (unreachable)`); s.close(); continue; }
  const contexts = new Set();
  s.on(m => {
    if (m.method === 'Runtime.executionContextCreated') { const cid = m.params.context.id; contexts.add(cid);
      s.send('Runtime.evaluate', { expression: HOOK, contextId: cid, returnByValue: true }); }
    else if (m.method === 'Runtime.executionContextsCleared') contexts.clear();
  });
  await s.send('Page.enable');
  await s.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  await s.send('Runtime.enable');                                 // fires *Created for existing contexts
  await s.send('Runtime.evaluate', { expression: HOOK, returnByValue: true }); // main world too
  console.log(`  ✓ ${(t.title || t.url || t.type).slice(0, 60)}`);
  sessions.push({ t, s, contexts });
}
if (!sessions.length) { console.error('No targets could be hooked'); process.exit(1); }

console.log(`\n>>> In the slicer: STOP the camera, then START it again (or close the camera`);
console.log(`    view and reopen) so a fresh handshake runs under the hook. Capturing ${seconds}s…\n`);
await sleep(seconds * 1000);

// ── read every context of every session, merge + dedup ───────────────────────
const seen = new Set(); const events = []; const sdkGlobals = new Set(); const sdkScripts = new Set();
async function harvest(s, params) {
  const m = await s.send('Runtime.evaluate', { ...params, expression: READ, returnByValue: true });
  const v = m && m.result && m.result.result ? m.result.result.value : null;
  if (!v) return;
  let d; try { d = JSON.parse(v); } catch { return; }
  (d.sdkGlobals || []).forEach(x => sdkGlobals.add(x));
  (d.sdkScripts || []).forEach(x => sdkScripts.add(x));
  for (const e of (d.events || [])) {
    const key = e.t + '|' + e.kind + '|' + e.url + '|' + (e.body || '').slice(0, 80);
    if (seen.has(key)) continue; seen.add(key);
    events.push({ ...e, loc: d.loc });
  }
}
for (const { s, contexts } of sessions) {
  await harvest(s, {});                                  // default/main world
  for (const cid of contexts) await harvest(s, { contextId: cid });
}
events.sort((a, b) => a.t - b.t);

console.log('════════ camera SDKs detected ════════');
console.log('globals:', sdkGlobals.size ? [...sdkGlobals].join(', ') : '(none)');
console.log('scripts:', sdkScripts.size ? '\n  ' + [...sdkScripts].join('\n  ') : '(none)');

// Full dump to a file (the terminal buffer can't hold it); console shows only camera events.
const dumpPath = 'acu-cam-dump.json';
try { writeFileSync(dumpPath, JSON.stringify(events, null, 2)); } catch (e) { console.error('dump write failed:', e.message); }

console.log(`\n════════ captured ${events.length} event(s) — full dump → ${dumpPath} ════════`);
if (!events.length) {
  console.log('Nothing captured. Make sure you STOP+START the camera during the window,');
  console.log('and that the control panel is actually open. Re-run if needed.');
  for (const { s } of sessions) s.close();
  process.exit(0);
}
const t0 = events[0].t;

// Compact index of ALL events (one short line each — safe for the buffer).
console.log('\n──── all events (compact) ────');
for (const e of events) console.log(`[+${((e.t - t0) / 1000).toFixed(1)}s] ${e.kind} ${e.url}`.slice(0, 160));

// Detailed bodies for camera-relevant events only.
const CAM = /^rtc\.|^ws|\/live\/|\/api\/call|getIceServers|getIceCandidate|addIceCandidate|candidate|webrtc|peerconn|:18088|sdp|whep/i;
const cam = events.filter(e => CAM.test(e.kind + ' ' + e.url));
console.log(`\n──── camera-relevant events (${cam.length}) ────`);
for (const e of cam) {
  console.log(`\n[+${((e.t - t0) / 1000).toFixed(1)}s] ${e.kind} ${e.url}   ⟨${(e.loc || '').replace(/^https?:\/\//, '')}⟩`);
  if (e.body != null) console.log(e.body);
}

console.log('\n──────── what to look for ────────');
console.log('• the /live/<token> request: method + body (SDP offer?) and its response (SDP answer?)');
console.log('• whatever request MINTS the token (precedes /live/<token>)');
console.log('• rtc.new config.iceServers → empty ⇒ pure-LAN; populated ⇒ STUN/TURN needed');
console.log('• rtc.remoteSDP m=video recvonly + H264 → we subscribe to one video track');
console.log('• ws> / ws< frames → if signaling rides a WebSocket instead of HTTP');

for (const { s } of sessions) s.close();
process.exit(0);
