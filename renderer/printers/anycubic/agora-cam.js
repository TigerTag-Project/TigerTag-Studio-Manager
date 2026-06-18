/**
 * printers/anycubic/agora-cam.js — cloud-mode Anycubic camera (Agora WebRTC).
 *
 * Cloud-mode printers have no local ports, so their camera is an **Agora**
 * ("shengwang"/声网) WebRTC stream, not the LAN HTTP-FLV path. The cloud order
 * 1001 (`window.anycubic.cloud.cameraOpen`) returns the join credentials —
 * { appId, channel, rtcToken, clientUid, peerUid, encKey, encSalt, encMode }
 * (PROTOCOL.md §9). This module runs the Agora Web SDK (npm dependency
 * `agora-rtc-sdk-ng`, exposed as the global `AgoraRTC`) in the renderer to join
 * the channel, subscribe to the printer's published video track, and render it
 * into the camera banner's
 * `.acu-cam-agora[data-acu-key]` container.
 *
 * The side panel re-renders on every data tick (rebuilding the container), so a
 * lightweight self-heal interval re-attaches the track whenever a fresh, empty
 * container appears — mirroring how the LAN <img> path repaints per frame.
 */

const _players = new Map(); // key → { client, track, live }
let _heal = null;
let _onLive = null;

/** The driver registers a callback fired once the video is actually playing. */
export function acuAgoraOnLive(cb) { _onLive = cb; }

function _sdk() {
  const A = (typeof window !== 'undefined') ? window.AgoraRTC : null;
  if (A && !A.__acuInit) {
    A.__acuInit = 1;
    try { A.setLogLevel(2); } catch (_) {}        // 2 = warning
    try { A.disableLogUpload(); } catch (_) {}    // don't ship diagnostics to Agora
  }
  return A;
}

// base64 → Uint8Array (the GCM2 KDF salt is a base64-encoded 32-byte value)
function _b64ToBytes(b64) {
  try { const s = atob(String(b64 || '')); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  catch (_) { return null; }
}

function _containers(key) {
  const sel = (window.CSS && CSS.escape) ? CSS.escape(key) : key;
  return document.querySelectorAll(`.acu-cam-agora[data-acu-key="${sel}"]`);
}

// Render the remote track into EVERY container for this printer — the side panel
// AND the cam wall simultaneously. A WebRTC track can't be Agora-`.play()`-ed
// into more than one element, so we feed the underlying MediaStreamTrack to a
// <video srcObject> in each container — mirroring how the LAN <img> path fans
// frames out to all matching elements (so the camera shows in both places).
function _attach(key) {
  const st = _players.get(key);
  if (!st || !st.track) return;
  const mst = st.track.getMediaStreamTrack ? st.track.getMediaStreamTrack() : null;
  if (!mst) return;
  const containers = _containers(key);
  if (!containers.length) return;
  let shown = false;
  containers.forEach(container => {
    let video = container.querySelector('video');
    if (!video) {
      video = document.createElement('video');
      video.autoplay = true; video.muted = true;
      video.setAttribute('playsinline', '');
      container.appendChild(video);
    }
    const cur = video.srcObject;
    const already = cur && cur.getVideoTracks && cur.getVideoTracks().indexOf(mst) !== -1;
    if (!already) {
      try { video.srcObject = new MediaStream([mst]); const pr = video.play && video.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (_) {}
    }
    shown = true;
  });
  if (shown && !st.live) { st.live = true; try { _onLive && _onLive(key); } catch (_) {} }
}

function _ensureHeal() {
  if (_heal) return;
  _heal = setInterval(() => { for (const key of _players.keys()) _attach(key); }, 800);
}

/** Join the Agora channel for `key` and start rendering. Idempotent per key. */
export async function acuAgoraStart(key, creds) {
  const A = _sdk();
  if (!A) { console.warn('[acu-agora] AgoraRTC SDK not loaded — cloud camera unavailable'); return false; }
  if (_players.has(key)) return true;
  if (!creds || !creds.appId || !creds.channel) return false;

  const client = A.createClient({ mode: 'rtc', codec: 'vp8' });
  const st = { client, track: null, live: false };
  _players.set(key, st);
  _ensureHeal();

  const onPub = async (user, mediaType) => {
    if (mediaType !== 'video' || _players.get(key) !== st) return;
    try { await client.subscribe(user, mediaType); } catch (_) { return; }
    st.track = user.videoTrack; _attach(key);
  };
  client.on('user-published', onPub);
  client.on('user-unpublished', (user, mediaType) => { if (mediaType === 'video' && _players.get(key) === st) st.track = null; });

  try {
    if (creds.encKey && creds.encMode) {
      const mode = String(creds.encMode).toLowerCase().replace(/_/g, '-'); // AES_256_GCM2 → aes-256-gcm2
      const salt = _b64ToBytes(creds.encSalt);
      try { client.setEncryptionConfig(mode, creds.encKey, salt || undefined); } catch (e) { console.warn('[acu-agora] setEncryptionConfig:', e && e.message); }
    }
    await client.join(creds.appId, creds.channel, creds.rtcToken || null, creds.clientUid);
    // The printer is usually already publishing when we join — subscribe to it.
    for (const u of client.remoteUsers) {
      if (u.hasVideo && _players.get(key) === st) {
        try { await client.subscribe(u, 'video'); st.track = u.videoTrack; _attach(key); } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[acu-agora] join failed:', e && e.message);
    acuAgoraStop(key);
    return false;
  }
  return true;
}

/** Leave the channel and tear down the player for `key`. */
export async function acuAgoraStop(key) {
  const st = _players.get(key);
  if (!st) return;
  _players.delete(key);
  _relayDropVideo(key);
  try { st.track && st.track.stop(); } catch (_) {}
  try { await st.client.leave(); } catch (_) {}
  if (_players.size === 0 && _heal) { clearInterval(_heal); _heal = null; }
}

/** True while a player exists for `key` (camera requested). */
export function acuAgoraActive(key) { return _players.has(key); }
/** True once a remote video track is actually playing for `key`. */
export function acuAgoraLive(key) { const st = _players.get(key); return !!(st && st.live); }

// ── Detached-window frame relay (single client → JPEG over BroadcastChannel) ──
// A second Agora client (in the detached window) would reuse the same subscriber
// uid the cloud hands out and kick THIS one. So instead we capture this client's
// video to JPEG and broadcast it; the detached window renders the frames. It asks
// via periodic 'want' pings, which gate the capture and — via the callbacks below
// — start the player when the wall isn't open and stop it when nothing needs it.
const _relayBC = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('acu-cam') : null;
const _relayWant = new Map();    // key → last 'want' timestamp
const _relayVideos = new Map();  // key → hidden <video> capture source
let _relayCanvas = null;
let _relayTimer = null;
let _onRelayWant = null, _onRelayEnd = null;
const RELAY_TTL = 2500;

/** Register: detached window wants `key` but no player exists → start one. */
export function acuAgoraOnRelayWant(cb) { _onRelayWant = cb; }
/** Register: detached window stopped wanting `key` → stop the player if unneeded. */
export function acuAgoraOnRelayEnd(cb)  { _onRelayEnd = cb; }
/** True while the detached window is actively asking for this printer's frames. */
export function acuAgoraRelaying(key) { const t = _relayWant.get(key); return !!t && (Date.now() - t) < RELAY_TTL; }

if (_relayBC) {
  _relayBC.onmessage = ({ data }) => {
    if (!data || data.type !== 'want' || !data.key) return;
    const fresh = !acuAgoraRelaying(data.key);
    _relayWant.set(data.key, Date.now());
    if (fresh && !_players.has(data.key)) { try { _onRelayWant && _onRelayWant(data.key); } catch (_) {} }
    if (!_relayTimer) _relayTimer = setInterval(_relayTick, 160); // ~6 fps
  };
}

function _relayCapVideo(key, track) {
  let v = _relayVideos.get(key);
  if (v) return v;
  const mst = track && track.getMediaStreamTrack ? track.getMediaStreamTrack() : null;
  if (!mst) return null;
  v = document.createElement('video');
  v.muted = true; v.autoplay = true; v.setAttribute('playsinline', '');
  v.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  try { v.srcObject = new MediaStream([mst]); v.play().catch(() => {}); } catch (_) { return null; }
  document.body.appendChild(v);
  _relayVideos.set(key, v);
  return v;
}

function _relayDropVideo(key) {
  const v = _relayVideos.get(key);
  if (v) { try { v.srcObject = null; v.remove(); } catch (_) {} _relayVideos.delete(key); }
}

function _relayTick() {
  const now = Date.now();
  let active = false;
  for (const key of [..._relayWant.keys()]) {
    if ((now - _relayWant.get(key)) >= RELAY_TTL) {   // detached window stopped asking
      _relayWant.delete(key); _relayDropVideo(key);
      try { _onRelayEnd && _onRelayEnd(key); } catch (_) {}
      continue;
    }
    active = true;
    const st = _players.get(key);
    if (!st || !st.track) continue;                   // player not (yet) live
    const v = _relayCapVideo(key, st.track);
    if (!v || v.readyState < 2 || !v.videoWidth) continue;
    if (!_relayCanvas) _relayCanvas = document.createElement('canvas');
    if (_relayCanvas.width !== v.videoWidth)   _relayCanvas.width  = v.videoWidth;
    if (_relayCanvas.height !== v.videoHeight) _relayCanvas.height = v.videoHeight;
    try {
      _relayCanvas.getContext('2d').drawImage(v, 0, 0);
      _relayBC.postMessage({ type: 'frame', key, dataUrl: _relayCanvas.toDataURL('image/jpeg', 0.55) });
    } catch (_) {}
  }
  if (!active) { clearInterval(_relayTimer); _relayTimer = null; }
}
