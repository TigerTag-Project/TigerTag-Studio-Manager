/**
 * renderer/cam/cam.js
 *
 * Logic for the detached camera wall window.
 * No Firebase, no inventory — receives camera descriptors via IPC and
 * builds the appropriate UI for each camera type.
 *
 * Camera descriptor shape (sent by inventory.js via cam:open-detached IPC):
 * {
 *   brand:   "snapmaker" | "creality" | "flashforge" | "bambulab" | "elegoo"
 *   id:      string   — unique printer ID
 *   name:    string   — display name
 *   camType: "iframe" | "webrtc" | "mjpeg" | "bbl_ipc" | "extcam"
 *   url:     string | null   — for iframe / mjpeg
 *   ip:      string | null   — for webrtc (Creality)
 *   bblKey:  string | null   — for bbl_ipc (Bambu Lab)
 *   ext:     { protocol, url, username, password } | null — for extcam: an IP camera of the
 *            account (RTSP / MJPEG read by ffmpeg in main, WebRTC by WHEP here), shown in place
 *            of a printer's own camera or on its own. The login is never drawn into the page.
 * }
 */

// ── Active Creality WebRTC connections (ip → RTCPeerConnection) ─────────────
const _crePeers = new Map();
// ── Cloud Anycubic frames are relayed from the main window's single Agora
//    client over a BroadcastChannel — the acuKeys we currently want frames for
const _acuBcKeys = new Set();

// ── Build UI ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Texts, in the user's language, handed over by the main window with every
// camera list (this window has no locales of its own). English stands in until
// they arrive.
let S = {};
const tr = (k, fallback) => (S && S[k]) || fallback;
function applyStrings(strings) {
  if (!strings) return;
  S = strings;
  if (S.lang) document.documentElement.lang = S.lang;
  document.title = `${tr('title', 'Camera Wall')} — Tiger Studio`;
  const h1 = document.querySelector('#camTitlebar h1');
  if (h1) h1.textContent = tr('title', 'Camera Wall');
}

function buildWall(cameras) {
  const root  = document.getElementById('camRoot');
  const count = document.getElementById('camCount');

  if (!cameras || cameras.length === 0) {
    root.innerHTML = `
      <div class="cam-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
        </svg>
        <p>${esc(tr('empty', 'No cameras online'))}</p>
      </div>`;
    count.textContent = '';
    return;
  }

  count.textContent = tr('count', `${cameras.length} camera${cameras.length > 1 ? 's' : ''}`);

  // Stop any previous Creality peers before full rebuild.
  _stopAllCrePeers();
  _stopAllExt();

  root.innerHTML = `<div class="cam-wall-detached">${cameras.map(buildCard).join('')}</div>`;

  // Wire up live feeds after DOM insertion.
  _acuBcKeys.clear();
  cameras.forEach(cam => {
    if (cam.camType === 'webrtc' && cam.ip) startCrePeer(cam.id, cam.ip);
    if (cam.camType === 'acu_bc' && cam.acuKey) _acuBcKeys.add(cam.acuKey);
    if (cam.camType === 'extcam') startExt(cam);
  });
  _acuBcWantPing(); // ask the main window to start relaying frames now
}

function buildCard(cam) {
  const brandColor = brandAccent(cam.brand);
  return `
    <div class="cam-card" data-cam-id="${esc(cam.id)}" data-cam-type="${esc(cam.camType)}">
      <div class="cam-card-head">
        <span class="cam-card-brand" style="background:${brandColor}22;color:${brandColor}">${esc(cam.brand)}</span>
        <span class="cam-card-name">${esc(cam.name)}</span>
      </div>
      <div class="cam-card-body">
        ${buildFeed(cam)}
      </div>
    </div>`;
}

function buildFeed(cam) {
  switch (cam.camType) {

    // ── Iframe-based (Snapmaker WebRTC, etc.) ───────────────────────────────
    case 'iframe':
      return `
        <iframe src="${esc(cam.url)}"
                sandbox="allow-scripts allow-same-origin"
                referrerpolicy="no-referrer"
                allow="autoplay"
                loading="lazy"
                onload="this.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove()">
        </iframe>
        <div class="cam-loading-overlay">
          <span class="cam-loading-dots"><span></span><span></span><span></span></span>
        </div>`;

    // ── FlashForge via BroadcastChannel relay (mux holds the single connection)
    case 'ffg_bc':
      return `
        <img class="cam-frame ffg-bc-img"
             data-ffg-key="${esc(cam.ffgKey)}"
             src="" alt="" draggable="false" />
        <div class="cam-loading-overlay">
          <span class="cam-loading-dots"><span></span><span></span><span></span></span>
        </div>`;

    // ── Bambu IPC frames (updated via onBambuFrame) ──────────────────────────
    case 'bbl_ipc':
      return `
        <img class="cam-frame bbl-cam-img"
             data-bbl-key="${esc(cam.bblKey)}"
             src=""
             alt=""
             draggable="false" />
        <div class="cam-loading-overlay">
          <span class="cam-loading-dots"><span></span><span></span><span></span></span>
        </div>`;

    // ── Anycubic IPC frames (ffmpeg FLV remux, updated via onAcuFrame) ───────
    case 'acu_ipc':
      return `
        <img class="cam-frame acu-cam-img"
             data-acu-key="${esc(cam.acuKey)}"
             src=""
             alt=""
             draggable="false" />
        <div class="cam-loading-overlay">
          <span class="cam-loading-dots"><span></span><span></span><span></span></span>
        </div>`;

    // ── Direct MJPEG stream (Elegoo and any future brand with no mux) ────────
    case 'mjpeg':
      return `
        <img class="cam-frame mjpeg-img"
             src="${esc(cam.url)}"
             alt="camera"
             referrerpolicy="no-referrer"
             draggable="false"
             onload="this.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove()"
             onerror="this.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove()" />
        <div class="cam-loading-overlay">
          <span class="cam-loading-dots"><span></span><span></span><span></span></span>
        </div>`;

    // ── Creality WebRTC (RTCPeerConnection built in startCrePeer) ────────────
    case 'webrtc':
      return `
        <video class="cre-cam-video"
               data-cre-id="${esc(cam.id)}"
               autoplay muted playsinline>
        </video>
        <div class="cam-loading-overlay">
          <span class="cam-loading-dots"><span></span><span></span><span></span></span>
        </div>`;

    // ── Cloud Anycubic — JPEG frames relayed from the main window's single
    //    Agora client over BroadcastChannel (acu_bc) ──────────────────────────
    case 'acu_bc':
      return `
        <img class="cam-frame acu-bc-img"
             data-acu-key="${esc(cam.acuKey)}"
             src=""
             alt=""
             draggable="false" />
        <div class="cam-loading-overlay">
          <span class="cam-loading-dots"><span></span><span></span><span></span></span>
        </div>`;

    // ── External IP camera of the account (RTSP / MJPEG frames from ffmpeg in
    //    main, or WebRTC via WHEP) — shown in place of a printer's own camera
    //    or on its own. The login is in cam.ext and never drawn here. ─────────
    case 'extcam': {
      const key = extKey(cam);
      const media = cam.ext?.protocol === 'webrtc'
        ? `<video class="cam-frame ext-cam-media" data-ext-key="${esc(key)}" autoplay muted playsinline></video>`
        : `<img class="cam-frame ext-cam-media" data-ext-key="${esc(key)}" src="" alt="camera" draggable="false" />`;
      return `
        ${media}
        <div class="cam-loading-overlay">
          <span class="cam-loading-dots"><span></span><span></span><span></span></span>
        </div>`;
    }

    default:
      return `<div class="cam-loading-overlay"><p style="color:#888">${esc(tr('unknown', 'Unknown camera type'))}</p></div>`;
  }
}

// ── Bambu IPC frame updates ──────────────────────────────────────────────────

// Frame-drop guard — one pending paint rAF, latest raw bytes, and the live
// Blob URL per printer key (revoked when replaced so memory stays flat).
const _bblCamRafs = new Map();
const _bblCamBuf  = new Map();
const _bblCamUrl  = new Map();
window.camAPI.onBambuFrame((key, buf) => {
  _bblCamBuf.set(key, buf);
  if (_bblCamRafs.has(key)) return;   // a paint is already scheduled → newest wins
  _bblCamRafs.set(key, requestAnimationFrame(() => {
    _bblCamRafs.delete(key);
    const latest = _bblCamBuf.get(key);
    if (!latest) return;
    const url = URL.createObjectURL(new Blob([latest], { type: 'image/jpeg' }));
    const prev = _bblCamUrl.get(key);
    if (prev) URL.revokeObjectURL(prev);
    _bblCamUrl.set(key, url);
    document.querySelectorAll(`.bbl-cam-img[data-bbl-key="${CSS.escape(key)}"]`).forEach(img => {
      img.src = url;
      img.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove();
    });
  }));
});

// ── Anycubic IPC frame updates ───────────────────────────────────────────────

window.camAPI.onAcuFrame((key, b64) => {
  document.querySelectorAll(`.acu-cam-img[data-acu-key="${CSS.escape(key)}"]`).forEach(img => {
    img.src = `data:image/jpeg;base64,${b64}`;
    img.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove();
  });
});

// ── Creality WebRTC signaling ─────────────────────────────────────────────────
// Same logic as renderer/printers/creality/widget_camera.js — no STUN (LAN only).

async function startCrePeer(camId, ip) {
  stopCrePeer(camId);

  const videoEl = document.querySelector(`.cre-cam-video[data-cre-id="${CSS.escape(camId)}"]`);
  if (!videoEl) return;

  const pc = new RTCPeerConnection({ iceServers: [] });
  _crePeers.set(camId, pc);

  pc.ontrack = ev => {
    if (ev.streams[0]) {
      videoEl.srcObject = ev.streams[0];
      videoEl.play().catch(() => {});
      videoEl.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove();
    }
  };

  pc.addTransceiver('video', { direction: 'sendrecv' });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering (LAN — no STUN needed, fast).
  await new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    pc.addEventListener('icegatheringstatechange', function h() {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', h);
        resolve();
      }
    });
    setTimeout(resolve, 4000);
  });

  if (_crePeers.get(camId) !== pc) return; // superseded

  try {
    const body = btoa(JSON.stringify({ type: 'offer', sdp: pc.localDescription.sdp }));
    const res  = await fetch(`http://${ip}:8000/call/webrtc_local`, {
      method:  'POST',
      headers: { 'Content-Type': 'plain/text' },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const answer = JSON.parse(atob(await res.text()));
    if (_crePeers.get(camId) !== pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (err) {
    console.warn(`[cam-detach] Creality WebRTC failed for ${ip}:`, err.message);
    stopCrePeer(camId);
    // No WebRTC service (K1 series) → mjpg-streamer on :8080 (issue #38).
    const img = document.createElement('img');
    img.className = 'cam-frame mjpeg-img';
    img.alt = 'camera';
    img.draggable = false;
    img.referrerPolicy = 'no-referrer';
    img.onload = img.onerror = () => img.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove();
    img.src = `http://${ip}:8080/?action=stream`;
    videoEl.replaceWith(img);
  }
}

function stopCrePeer(camId) {
  const pc = _crePeers.get(camId);
  if (pc) { try { pc.close(); } catch (_) {} _crePeers.delete(camId); }
}

function _stopAllCrePeers() {
  _crePeers.forEach((pc, id) => stopCrePeer(id));
}

// ── Cloud Anycubic (Agora) frame relay ────────────────────────────────────────
// The cloud reuses the Agora subscriber uid per cameraOpen, so the detached
// window can't run its own client — it would kick the main window's. Instead the
// main window's single Agora client captures its video to JPEG and relays the
// frames over BroadcastChannel('acu-cam'); we render them as <img> and keep
// asking with periodic 'want' pings (which also tell the main window when to
// start/stop capturing). Same idea as FlashForge's ffg_bc relay.
const _acuBc = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('acu-cam') : null;
if (_acuBc) {
  _acuBc.onmessage = ({ data }) => {
    if (!data || data.type !== 'frame' || !data.key) return;
    document.querySelectorAll(`.acu-bc-img[data-acu-key="${CSS.escape(data.key)}"]`).forEach(img => {
      img.src = data.dataUrl;
      img.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove();
    });
  };
}

function _acuBcWantPing() {
  if (!_acuBc) return;
  _acuBcKeys.forEach(key => _acuBc.postMessage({ type: 'want', key }));
}
setInterval(_acuBcWantPing, 1000);

// ── External IP cameras (RTSP / MJPEG / WebRTC) ─────────────────────────────
// A camera of the account shown here in place of a printer's own (printer settings →
// "Camera shown") or on its own. Same readers as renderer/ext-cam/ext-cam.js: ffmpeg in
// main for RTSP and MJPEG (JPEG frames come back to the window that asked, so this window
// asks with its OWN key — the main window's stream of the same camera is another process),
// WHEP in the page for WebRTC. The login reaches us over IPC and is never drawn or logged.
const _ext = new Map();   // key → { kind: 'ff' | 'rtc', last?, pc?, retry? }
const extKey = cam => `detached:ext:${cam.id}`;
const extEls = key => document.querySelectorAll(`.ext-cam-media[data-ext-key="${CSS.escape(key)}"]`);

function extClearOverlay(el) {
  el.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove();
}
function extShowOffline(el) {
  const body = el.closest('.cam-card-body');
  if (!body) return;
  let o = body.querySelector('.cam-loading-overlay');
  if (!o) { o = document.createElement('div'); o.className = 'cam-loading-overlay'; body.append(o); }
  o.innerHTML = `<p style="color:#888">${esc(tr('offline', 'Camera offline'))}</p>`;
}

let _extWired = false;
function wireExtFeed() {
  if (_extWired || !window.extCam) return;
  _extWired = true;
  window.extCam.onFrame((key, buf) => {
    const r = _ext.get(key);
    if (!r || r.kind !== 'ff') return;
    const url = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
    extEls(key).forEach(img => { img.src = url; extClearOverlay(img); });
    if (r.last) URL.revokeObjectURL(r.last);
    r.last = url;
  });
  window.extCam.onStatus((key, status) => {
    if (!_ext.has(key)) return;
    extEls(key).forEach(el => (status === 'live' ? extClearOverlay(el) : extShowOffline(el)));
  });
}

const extBasicAuth = e => e.username
  ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${e.username}:${e.password || ''}`))) } : {};

/** WHEP: one offer, one answer (same as ext-cam.js). */
async function extWhepConnect(e, onStream) {
  const pc = new RTCPeerConnection();
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.ontrack = ev => onStream(ev.streams[0]);
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); res(); } };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(res, 1500);
  });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8000);
  try {
    const resp = await fetch(e.url, {
      method: 'POST', cache: 'no-store', signal: abort.signal,
      headers: { 'Content-Type': 'application/sdp', ...extBasicAuth(e) },
      body: pc.localDescription.sdp,
    });
    if (!resp.ok) throw new Error(resp.status === 401 || resp.status === 403 ? 'auth' : 'http');
    await pc.setRemoteDescription({ type: 'answer', sdp: await resp.text() });
    return pc;
  } catch (err) {
    try { pc.close(); } catch (_) {}
    throw err;
  } finally { clearTimeout(timer); }
}

function startExtRtc(cam, key) {
  const r = { kind: 'rtc', pc: null, retry: 0 };
  _ext.set(key, r);
  const retryIn = ms => {
    if (_ext.get(key) !== r || r.retry) return;
    extEls(key).forEach(extShowOffline);
    try { r.pc?.close(); } catch (_) {}
    r.pc = null;
    r.retry = setTimeout(() => { r.retry = 0; attempt(); }, ms);
  };
  const attempt = async () => {
    if (_ext.get(key) !== r) return;
    try {
      const pc = await extWhepConnect(cam.ext, stream => extEls(key).forEach(v => { v.srcObject = stream; v.play().catch(() => {}); extClearOverlay(v); }));
      if (_ext.get(key) !== r) { try { pc.close(); } catch (_) {} return; }
      r.pc = pc;
      pc.addEventListener('connectionstatechange', () => {
        if (r.pc === pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) retryIn(4000);
      });
    } catch (_) { retryIn(6000); }
  };
  attempt();
}

function startExt(cam) {
  const key = extKey(cam), e = cam.ext;
  if (!e || !e.url) { extEls(key).forEach(extShowOffline); return; }
  if (e.protocol === 'webrtc') { startExtRtc(cam, key); return; }
  if (!window.extCam) { extEls(key).forEach(extShowOffline); return; }
  wireExtFeed();
  _ext.set(key, { kind: 'ff', last: null });
  window.extCam.start({ key, url: e.url, username: e.username || '', password: e.password || '' });
}

function _stopAllExt() {
  for (const [key, r] of _ext) {
    if (r.kind === 'ff') { try { window.extCam?.stop(key); } catch (_) {} if (r.last) URL.revokeObjectURL(r.last); }
    else { clearTimeout(r.retry); try { r.pc?.close(); } catch (_) {} }
  }
  _ext.clear();
}

// ── Brand accent colours ─────────────────────────────────────────────────────

function brandAccent(brand) {
  const map = {
    bambulab:  '#1db954',
    snapmaker: '#0ea5e9',
    flashforge:'#f97316',
    creality:  '#eab308',
    elegoo:    '#a855f7',
    ipcam:     '#38bdf8',
  };
  return map[brand] || '#888';
}

// ── FlashForge frames via BroadcastChannel ────────────────────────────────────
// The main window's cam_manager.js broadcasts each JPEG frame on 'cam-frames'.
// Both windows share the same localhost origin → BroadcastChannel works natively,
// no IPC or main-process forwarding needed.
{
  const _bc = new BroadcastChannel('cam-frames');
  const _prevUrls = new Map(); // ffgKey → previous blob URL (for revocation)

  _bc.onmessage = ({ data: { key, frame } }) => {
    const els = document.querySelectorAll(`.ffg-bc-img[data-ffg-key="${CSS.escape(key)}"]`);
    if (!els.length) return;
    const url = URL.createObjectURL(new Blob([frame], { type: 'image/jpeg' }));
    els.forEach(img => {
      img.src = url;
      img.closest('.cam-card-body')?.querySelector('.cam-loading-overlay')?.remove();
    });
    const prev = _prevUrls.get(key);
    if (prev) URL.revokeObjectURL(prev);
    _prevUrls.set(key, url);
  };
}

// ── IPC listeners ────────────────────────────────────────────────────────────

window.camAPI.onInit((cameras, strings) => { applyStrings(strings); buildWall(cameras); });
window.camAPI.onUpdate((cameras, strings) => { applyStrings(strings); buildWall(cameras); });
