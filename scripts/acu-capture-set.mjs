/**
 * scripts/acu-capture-set.mjs — capture what the Workbench sends when you set a
 * filament. Hooks fetch/XHR in the bridge-mode slicer's Workbench page (CDP),
 * waits for you to change a slot, then prints the captured request(s).
 *
 * Prereq: slicer in bridge mode (--remote-debugging-port=9222), Workbench open
 * on the target printer. Run this, then change the EXTERNAL SPOOL filament in
 * the Workbench within ~30 s.
 *
 * Usage: node scripts/acu-capture-set.mjs
 */
function cdpEval(wsUrl, expr, awaitP = false) {
  return new Promise((resolve) => {
    let done = false, ws;
    const fin = v => { if (done) return; done = true; try { ws && ws.close(); } catch {} resolve(v); };
    try { ws = new WebSocket(wsUrl); } catch (e) { return fin({ error: e.message }); }
    const t = setTimeout(() => fin({ error: 'timeout' }), 12000);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true, awaitPromise: awaitP } })));
    ws.addEventListener('message', ev => { let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id !== 1) return; clearTimeout(t);
      if (m.result && m.result.exceptionDetails) return fin({ error: 'js-exception' });
      fin({ value: m.result && m.result.result ? m.result.result.value : undefined }); });
    ws.addEventListener('error', () => { clearTimeout(t); fin({ error: 'ws' }); });
  });
}

const HOOK = [
  "(() => {",
  "  window.__acuCap = [];", // reset buffer each run
  "  window.__acuPush = function(kind, url, body){ try { window.__acuCap.push({ t: Date.now(), kind: kind, url: String(url||''), body: body!=null ? (typeof body==='string'?body:JSON.stringify(body)) : null }); } catch(e){} };",
  "  var done = [];",
  "  if (!window.__acuFetchHooked && !window.__acuHooked) { window.__acuFetchHooked = 1; var of = window.fetch; if (of) window.fetch = function(){ try { var a = arguments; var u = a[0] && (a[0].url || a[0]); var b = a[1] && a[1].body; window.__acuPush('fetch', u, b); } catch(e){} return of.apply(this, arguments); }; var oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.open = function(m,u){ this.__acuU = u; return oo.apply(this, arguments); }; XMLHttpRequest.prototype.send = function(b){ try { window.__acuPush('xhr', this.__acuU, b); } catch(e){} return os.apply(this, arguments); }; done.push('fetch'); }",
  "  if (!window.__acuPmHooked) { window.__acuPmHooked = 1; try { var w = window.chrome && window.chrome.webview; if (w && w.postMessage) { var op = w.postMessage.bind(w); w.postMessage = function(m){ try { window.__acuPush('webview', '', m); } catch(e){} return op(m); }; done.push('webview'); } } catch(e){} }",
  "  if (!window.__acuWsHooked) { window.__acuWsHooked = 1; try { var oWS = window.WebSocket && window.WebSocket.prototype.send; if (oWS) { window.WebSocket.prototype.send = function(d){ try { window.__acuPush('ws', this.url, d); } catch(e){} return oWS.apply(this, arguments); }; done.push('ws'); } } catch(e){} }",
  "  return 'reset; new hooks: [' + done.join(',') + ']';",
  "})()",
].join("\n");

// Return everything captured (we filter visually). Cap to the last 60.
const READ = "JSON.stringify((window.__acuCap||[]).slice(-60))";

const port = 9222;
let targets;
try { targets = await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(5000) })).json(); }
catch { console.error('CDP not reachable on 9222 — launch the slicer in bridge mode'); process.exit(1); }
const wb = (targets || []).find(t => /workbench|orca-ac-web/i.test((t.url || '') + (t.title || '')) && t.webSocketDebuggerUrl);
if (!wb) { console.error('Workbench page not found — open the Workbench tab'); process.exit(1); }

const h = await cdpEval(wb.webSocketDebuggerUrl, HOOK);
console.log('hook:', h.value || h.error);
console.log('\n>>> Now change the EXTERNAL SPOOL filament (type/color) in the Workbench. Waiting 30 s…\n');
await new Promise(r => setTimeout(r, 30000));
const r = await cdpEval(wb.webSocketDebuggerUrl, READ);
let caps = []; try { caps = JSON.parse(r.value || '[]'); } catch {}
if (!caps.length) { console.log('No matching requests captured. (Did the change go through? Try again.)'); process.exit(0); }
console.log('captured ' + caps.length + ' request(s):\n');
for (const c of caps) {
  console.log('URL :', c.url);
  console.log('BODY:', c.body);
  console.log('---');
}
