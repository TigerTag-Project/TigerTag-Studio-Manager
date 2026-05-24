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
 *   camType: "iframe" | "webrtc" | "mjpeg" | "bbl_ipc"
 *   url:     string | null   — for iframe / mjpeg
 *   ip:      string | null   — for webrtc (Creality)
 *   bblKey:  string | null   — for bbl_ipc (Bambu Lab)
 * }
 */

// ── Active Creality WebRTC connections (ip → RTCPeerConnection) ─────────────
const _crePeers = new Map();

// ── Build UI ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
        <p>No cameras online</p>
      </div>`;
    count.textContent = '';
    return;
  }

  count.textContent = `${cameras.length} camera${cameras.length > 1 ? 's' : ''}`;

  // Stop any previous Creality peers before full rebuild.
  _stopAllCrePeers();

  root.innerHTML = `<div class="cam-wall-detached">${cameras.map(buildCard).join('')}</div>`;

  // Wire up live feeds after DOM insertion.
  cameras.forEach(cam => {
    if (cam.camType === 'webrtc' && cam.ip) startCrePeer(cam.id, cam.ip);
  });
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
             alt="Bambu Lab camera"
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

    default:
      return `<div class="cam-loading-overlay"><p style="color:#888">Unknown camera type</p></div>`;
  }
}

// ── Bambu IPC frame updates ──────────────────────────────────────────────────

window.camAPI.onBambuFrame((key, b64) => {
  document.querySelectorAll(`.bbl-cam-img[data-bbl-key="${CSS.escape(key)}"]`).forEach(img => {
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
  }
}

function stopCrePeer(camId) {
  const pc = _crePeers.get(camId);
  if (pc) { try { pc.close(); } catch (_) {} _crePeers.delete(camId); }
}

function _stopAllCrePeers() {
  _crePeers.forEach((pc, id) => stopCrePeer(id));
}

// ── Brand accent colours ─────────────────────────────────────────────────────

function brandAccent(brand) {
  const map = {
    bambulab:  '#1db954',
    snapmaker: '#0ea5e9',
    flashforge:'#f97316',
    creality:  '#eab308',
    elegoo:    '#a855f7',
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

window.camAPI.onInit(cameras => buildWall(cameras));
window.camAPI.onUpdate(cameras => buildWall(cameras));
