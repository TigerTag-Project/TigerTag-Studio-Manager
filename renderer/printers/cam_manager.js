/**
 * printers/cam_manager.js — Generic MJPEG stream multiplexer.
 *
 * One HTTP connection per printer key, N consumer <img> elements.
 * A 2-second grace period on last-consumer-unregister avoids reconnections
 * when the user quickly switches views (sidecard open/close, tab change).
 *
 * Public API:
 *   camStart(key, url)         — start or verify running with same URL
 *   camStop(key)               — immediate stop (explicit disconnect)
 *   camStopAll()               — stop all streams (leave cam view / logout)
 *   camRestart(key, url)       — restart fetch, keep consumers (retry button)
 *   camSubscribe(key, imgEl)   — add consumer; shows latest frame immediately
 *   camUnsubscribe(key, imgEl) — remove consumer; starts grace timer if last
 */

const GRACE_MS = 2000;

// Per-key state: { abort, url, consumers: Set<img>, lastFrame, running, graceTimer }
const _streams = new Map();

// ── Public API ────────────────────────────────────────────────────────────────

export function camStart(key, url) {
  const s = _streams.get(key);
  if (s && s.running && s.url === url) {
    clearTimeout(s.graceTimer);
    s.graceTimer = null;
    return;
  }
  if (s) { clearTimeout(s.graceTimer); s.graceTimer = null; }
  _stopStream(s);
  const stream = { abort: new AbortController(), url, consumers: new Set(),
                   lastFrame: null, running: true, graceTimer: null };
  _streams.set(key, stream);
  _pump(stream).catch(() => {});
}

export function camStop(key) {
  const s = _streams.get(key);
  if (!s) return;
  clearTimeout(s.graceTimer);
  _stopStream(s);
  _streams.delete(key);
}

export function camStopAll() {
  for (const s of _streams.values()) { clearTimeout(s.graceTimer); _stopStream(s); }
  _streams.clear();
}

export function camRestart(key, url) {
  const s = _streams.get(key);
  if (!s) { camStart(key, url); return; }
  clearTimeout(s.graceTimer);
  s.graceTimer = null;
  s.abort.abort();
  s.running = false;
  if (s.lastFrame) { URL.revokeObjectURL(s.lastFrame); s.lastFrame = null; }
  s.abort   = new AbortController();
  s.url     = url;
  s.running = true;
  _pump(s).catch(() => {});
}

export function camSubscribe(key, imgEl) {
  const s = _streams.get(key);
  if (!s) return;
  clearTimeout(s.graceTimer);
  s.graceTimer = null;
  s.consumers.add(imgEl);
  if (s.lastFrame) imgEl.src = s.lastFrame;
}

export function camUnsubscribe(key, imgEl) {
  const s = _streams.get(key);
  if (!s) return;
  s.consumers.delete(imgEl);
  try { imgEl.src = "about:blank"; imgEl.removeAttribute("src"); } catch {}
  if (s.consumers.size === 0 && !s.graceTimer) {
    s.graceTimer = setTimeout(() => camStop(key), GRACE_MS);
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _stopStream(s) {
  if (!s) return;
  s.running = false;
  s.abort.abort();
  if (s.lastFrame) { URL.revokeObjectURL(s.lastFrame); s.lastFrame = null; }
  s.consumers.forEach(el => { try { el.src = "about:blank"; el.removeAttribute("src"); } catch {} });
}

async function _pump(stream) {
  try {
    const res = await fetch(stream.url, { signal: stream.abort.signal, cache: "no-store" });
    if (!res.ok || !res.body) { stream.running = false; return; }

    const ct   = res.headers.get("content-type") || "";
    const bm   = ct.match(/boundary=([^\s;,]+)/i);
    const rawB = bm ? bm[1].replace(/^-+/, "") : "boundary";
    const sep  = _enc("--" + rawB);

    const reader = res.body.getReader();
    let buf = new Uint8Array(0);

    while (stream.running) {
      const { done, value } = await reader.read();
      if (done) break;
      buf = _concat(buf, value);

      let consumed = 0;
      while (true) {
        const b1 = _indexOf(buf, sep, consumed);
        if (b1 === -1) break;
        const b2 = _indexOf(buf, sep, b1 + sep.length + 1);
        if (b2 === -1) break;
        const hdrEnd = _indexOf(buf, _enc("\r\n\r\n"), b1 + sep.length);
        if (hdrEnd !== -1 && hdrEnd < b2) {
          let bodyEnd = b2;
          if (bodyEnd >= 2 && buf[bodyEnd - 2] === 13 && buf[bodyEnd - 1] === 10) bodyEnd -= 2;
          const frame = buf.slice(hdrEnd + 4, bodyEnd);
          if (frame.length > 100) _pushFrame(stream, frame);
        }
        consumed = b2;
      }
      if (consumed > 0) buf = buf.slice(consumed);
      if (buf.length > 2_000_000) buf = new Uint8Array(0);
    }
  } catch (e) {
    if (e?.name !== "AbortError") console.warn("[cam-mgr]", e.message);
  } finally {
    stream.running = false;
  }
}

function _pushFrame(stream, frame) {
  const blobUrl = URL.createObjectURL(new Blob([frame], { type: "image/jpeg" }));
  stream.consumers.forEach(el => { try { el.src = blobUrl; } catch {} });
  if (stream.lastFrame) URL.revokeObjectURL(stream.lastFrame);
  stream.lastFrame = blobUrl;
}

const _te  = new TextEncoder();
const _enc = s => _te.encode(s);

function _concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
}

function _indexOf(arr, pat, from = 0) {
  outer: for (let i = from; i <= arr.length - pat.length; i++) {
    for (let j = 0; j < pat.length; j++) { if (arr[i + j] !== pat[j]) continue outer; }
    return i;
  }
  return -1;
}
