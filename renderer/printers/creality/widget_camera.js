/**
 * creality/widget_camera.js — Creality camera banner widget.
 *
 * The Creality WebRTC page at http://<ip>:8000/webrtc is a bare-bones HTML
 * page with a <video> that has no CSS size constraints — it takes on the
 * intrinsic dimensions of the incoming stream (e.g. 1280×720), making it
 * impossible to embed as a responsive iframe.
 *
 * Instead we replicate the same RTCPeerConnection signaling directly in the
 * renderer and point it at a <video> element we control. This gives us full
 * CSS control: the video is constrained to the sidecard width at 16:9.
 *
 * Multi-surface design
 * ────────────────────
 * The same Creality printer can appear in up to three surfaces simultaneously:
 *   • cam wall card    (.cre-cam-video[data-cre-id="<id>"])
 *   • printer sidecard (#creCamVideo inside #creCamContainer)
 *   • detached cam window (cam.js — its own RTCPeerConnection, separate process)
 *
 * To avoid opening two WebRTC connections to the same printer (firmware only
 * accepts one peer at a time), this module uses a single RTCPeerConnection
 * whose MediaStream is stored in _stream and re-attached to any <video>
 * consumer that registers via addCreCamConsumer().
 *
 * Public API (called by inventory.js):
 *   renderCreCamBanner(p)          — returns HTML with a <video class="cre-cam-video">
 *   startCreCam(ip)                — start or reuse WebRTC, re-attach to all consumers
 *   stopCreCam()                   — close peer connection + clear all consumers
 *   addCreCamConsumer(videoEl)     — register a <video> to receive the live stream
 *   removeCreCamConsumer(videoEl)  — unregister and clear a consumer
 */
import { creGetConn, creKey } from './index.js';

// ── Singleton state ────────────────────────────────────────────────────────────
let _pc       = null;   // active RTCPeerConnection
let _activeIp = null;   // IP of the current session
let _stream   = null;   // live MediaStream (null until ontrack fires)

// All <video> elements currently showing the stream.
const _consumers = new Set();

// ── Consumer helpers ──────────────────────────────────────────────────────────

/** Attach a <video> element to the live stream (or queue it for when it arrives). */
export function addCreCamConsumer(videoEl) {
  if (!videoEl) return;
  _consumers.add(videoEl);
  if (_stream) {
    videoEl.srcObject = _stream;
    videoEl.play().catch(() => {});
  }
}

/** Detach a <video> element and stop its stream. */
export function removeCreCamConsumer(videoEl) {
  if (!videoEl) return;
  _consumers.delete(videoEl);
  try { videoEl.srcObject = null; } catch {}
}

// ── Internal broadcast ────────────────────────────────────────────────────────

function _broadcastStream() {
  _consumers.forEach(el => {
    // Skip elements that have already been removed from the DOM.
    if (!el.isConnected) { _consumers.delete(el); return; }
    if (el.srcObject !== _stream) {
      el.srcObject = _stream;
      el.play().catch(() => {});
    }
  });
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the camera banner HTML for a Creality printer,
 * or "" when the printer is offline / not yet connected.
 *
 * Uses a class + data-cre-id selector instead of id="creCamVideo" so
 * multiple surfaces (cam wall + sidecard) can coexist without ID conflicts.
 *
 * @param  {object} p  — printer record from state.printers
 * @returns {string}   — HTML string (safe to assign to innerHTML)
 */
export function renderCreCamBanner(p) {
  const conn = creGetConn(creKey(p));
  if (!conn || conn.status !== "connected" || !conn.ip) return "";
  return `
    <div class="pp-cam-full">
      <video class="cre-cam-video" data-cre-id="${p.id}"
             autoplay muted playsinline></video>
    </div>`;
}

// ── WebRTC lifecycle ───────────────────────────────────────────────────────────

/**
 * Opens an RTCPeerConnection to the Creality WebRTC server (port 8000).
 * If a connection is already live for the same IP, the stream is re-attached
 * to whatever .cre-cam-video elements are currently in the DOM (handles the
 * "navigate away → come back" case where the DOM is rebuilt but the peer
 * connection never stopped).
 *
 * Signaling: POST /call/webrtc_local with btoa(JSON offer) → btoa(JSON answer).
 * No STUN needed for LAN.
 *
 * @param {string} ip — printer IP address
 */
export async function startCreCam(ip) {
  if (_pc && _activeIp === ip) {
    // Connection is still live — just re-attach to whichever video elements
    // are currently in the DOM (they may have been recreated by a full render).
    _reAttachAll();
    return;
  }

  stopCreCam();
  _activeIp = ip;

  // Scan the DOM for any .cre-cam-video elements that are already present
  // (sidecard open, cam wall rendered) so they receive the stream as soon as
  // ontrack fires — even though _consumers was cleared by stopCreCam().
  reAttachCreCamConsumers();

  const pc = new RTCPeerConnection({ iceServers: [] }); // LAN — no STUN
  _pc = pc;

  pc.ontrack = ev => {
    if (!ev.streams[0]) return;
    _stream = ev.streams[0];
    _broadcastStream();
  };

  pc.addTransceiver("video", { direction: "sendrecv" });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Wait for ICE gathering to finish before sending the offer.
  await new Promise(resolve => {
    if (pc.iceGatheringState === "complete") { resolve(); return; }
    pc.addEventListener("icegatheringstatechange", function handler() {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", handler);
        resolve();
      }
    });
    setTimeout(resolve, 4000); // safety — 4 s max
  });

  if (_pc !== pc) return; // was stopped while waiting

  try {
    const body = btoa(JSON.stringify({ type: "offer", sdp: pc.localDescription.sdp }));
    const res  = await fetch(`http://${ip}:8000/call/webrtc_local`, {
      method:  "POST",
      headers: { "Content-Type": "plain/text" },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const answer = JSON.parse(atob(await res.text()));
    if (_pc !== pc) return; // was stopped while fetching
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (err) {
    console.warn("[cre-cam] signaling failed:", err.message);
    stopCreCam();
  }
}

/**
 * Closes the active RTCPeerConnection and clears all consumer video elements.
 * Safe to call multiple times.
 */
export function stopCreCam() {
  _activeIp = null;
  _stream   = null;
  if (_pc) {
    try { _pc.close(); } catch {}
    _pc = null;
  }
  _consumers.forEach(el => { try { el.srcObject = null; } catch {} });
  _consumers.clear();
}

// ── Re-attach helpers ─────────────────────────────────────────────────────────

/**
 * Scan all .cre-cam-video elements currently in the DOM and register them as
 * consumers. Called after a full cam-wall rebuild so new <video> elements
 * automatically receive the live stream without restarting the peer connection.
 */
export function reAttachCreCamConsumers() {
  document.querySelectorAll(".cre-cam-video").forEach(el => addCreCamConsumer(el));
}

function _reAttachAll() {
  // Prune stale (detached) consumers first.
  _consumers.forEach(el => { if (!el.isConnected) _consumers.delete(el); });
  // Register any new .cre-cam-video elements that appeared after a rebuild.
  reAttachCreCamConsumers();
  // Push the stream to everyone.
  if (_stream) _broadcastStream();
}
