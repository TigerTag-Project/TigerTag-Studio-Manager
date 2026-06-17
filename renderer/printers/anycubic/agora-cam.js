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

function _container(key) {
  const sel = (window.CSS && CSS.escape) ? CSS.escape(key) : key;
  return document.querySelector(`.acu-cam-agora[data-acu-key="${sel}"]`);
}

// Play the remote track into the current container if it isn't already there.
function _attach(key) {
  const st = _players.get(key);
  if (!st || !st.track) return;
  const el = _container(key);
  if (!el || el.querySelector('video')) return;   // no surface, or already attached
  try { st.track.play(el, { fit: 'cover' }); } catch (_) { return; }
  if (!st.live) { st.live = true; try { _onLive && _onLive(key); } catch (_) {} }
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
  try { st.track && st.track.stop(); } catch (_) {}
  try { await st.client.leave(); } catch (_) {}
  if (_players.size === 0 && _heal) { clearInterval(_heal); _heal = null; }
}

/** True while a player exists for `key` (camera requested). */
export function acuAgoraActive(key) { return _players.has(key); }
/** True once a remote video track is actually playing for `key`. */
export function acuAgoraLive(key) { const st = _players.get(key); return !!(st && st.live); }
