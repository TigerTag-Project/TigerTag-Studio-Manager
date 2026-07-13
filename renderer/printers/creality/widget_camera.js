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
 * Multi-printer, multi-surface design
 * ───────────────────────────────────
 * Several DISTINCT Creality printers can be shown at once (the cam wall), and
 * the same printer can appear in up to three surfaces simultaneously:
 *   • cam wall card    (.cre-cam-video[data-cre-id="<id>"][data-cre-ip="<ip>"])
 *   • printer sidecard (.cre-cam-video inside #creCamContainer)
 *   • detached cam window (cam.js — its own RTCPeerConnection, separate process)
 *
 * Each printer's firmware only accepts ONE WebRTC peer at a time, but different
 * printers (different IPs) are independent peers. So state is kept PER IP in
 * `_sessions` (one RTCPeerConnection + one MediaStream + its own set of <video>
 * consumers each). A <video> consumer is routed to the session matching its
 * `data-cre-ip`, so printer A's cards never receive printer B's stream.
 *
 * Public API (called by inventory.js):
 *   renderCreCamBanner(p)          — returns HTML with a <video class="cre-cam-video">
 *   startCreCam(ip)                — start or reuse the WebRTC session for that IP
 *   stopCreCam(ip?)                — close one IP's session (or ALL when ip omitted)
 *   addCreCamConsumer(videoEl)     — register a <video> to its IP's live stream
 *   removeCreCamConsumer(videoEl)  — unregister and clear a consumer
 *   reAttachCreCamConsumers()      — (re)register every .cre-cam-video to its session
 */
import { creGetConn, creKey } from './index.js';

// ── Per-IP session state ────────────────────────────────────────────────────────
// ip → { pc: RTCPeerConnection|null, stream: MediaStream|null, consumers: Set<video> }
const _sessions = new Map();

function _sess(ip) {
  let s = _sessions.get(ip);
  if (!s) { s = { pc: null, stream: null, consumers: new Set() }; _sessions.set(ip, s); }
  return s;
}

// The IP a given <video> element should display (stamped by renderCreCamBanner /
// the sidecard markup). No IP → the element can't be routed to a session.
function _ipOf(videoEl) { return videoEl?.dataset?.creIp || null; }

// ── Consumer helpers ──────────────────────────────────────────────────────────

/** Attach a <video> element to ITS printer's live stream (or queue it). */
export function addCreCamConsumer(videoEl) {
  const ip = _ipOf(videoEl);
  if (!videoEl || !ip) return;
  const s = _sess(ip);
  s.consumers.add(videoEl);
  if (s.stream) {
    videoEl.srcObject = s.stream;
    videoEl.play().catch(() => {});
  }
}

/** Detach a <video> element and stop its stream. */
export function removeCreCamConsumer(videoEl) {
  if (!videoEl) return;
  const ip = _ipOf(videoEl);
  const s = ip ? _sessions.get(ip) : null;
  if (s) s.consumers.delete(videoEl);
  try { videoEl.srcObject = null; } catch {}
}

// ── Internal broadcast ────────────────────────────────────────────────────────

function _broadcast(s) {
  s.consumers.forEach(el => {
    // Skip elements that have already been removed from the DOM.
    if (!el.isConnected) { s.consumers.delete(el); return; }
    if (el.srcObject !== s.stream) {
      el.srcObject = s.stream;
      el.play().catch(() => {});
    }
  });
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the camera banner HTML for a Creality printer,
 * or "" when the printer is offline / not yet connected.
 *
 * Uses class + data-cre-id/data-cre-ip selectors (not id="creCamVideo") so
 * multiple surfaces AND multiple printers can coexist without ID conflicts and
 * so each <video> can be routed to its own printer's stream.
 *
 * @param  {object} p  — printer record from state.printers
 * @returns {string}   — HTML string (safe to assign to innerHTML)
 */
export function renderCreCamBanner(p) {
  const conn = creGetConn(creKey(p));
  if (!conn || conn.status !== "connected" || !conn.ip) return "";
  return `
    <div class="pp-cam-full">
      <video class="cre-cam-video" data-cre-id="${p.id}" data-cre-ip="${conn.ip}"
             autoplay muted playsinline></video>
    </div>`;
}

// ── WebRTC lifecycle ───────────────────────────────────────────────────────────

/**
 * Opens an RTCPeerConnection to a Creality WebRTC server (port 8000) for `ip`.
 * If a session is already live for that IP, its stream is re-attached to
 * whatever .cre-cam-video[data-cre-ip="<ip>"] elements are currently in the DOM
 * (handles the "navigate away → come back" case where the DOM is rebuilt but the
 * peer connection never stopped). Independent IPs run independent sessions, so
 * calling this for several printers shows several distinct cameras.
 *
 * Signaling: POST /call/webrtc_local with btoa(JSON offer) → btoa(JSON answer).
 * No STUN needed for LAN.
 *
 * @param {string} ip — printer IP address
 */
export async function startCreCam(ip) {
  if (!ip) return;
  const s = _sess(ip);

  if (s.pc) {
    // Session already live — just re-attach whichever video elements for this IP
    // are currently in the DOM (they may have been recreated by a full render).
    _reAttach(ip);
    return;
  }

  // Register any .cre-cam-video for this IP already present so they receive the
  // stream as soon as ontrack fires.
  _reAttachForIp(ip);

  const pc = new RTCPeerConnection({ iceServers: [] }); // LAN — no STUN
  s.pc = pc;

  pc.ontrack = ev => {
    if (!ev.streams[0]) return;
    s.stream = ev.streams[0];
    _broadcast(s);
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

  if (s.pc !== pc) return; // session was stopped/replaced while waiting

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
    if (s.pc !== pc) return; // was stopped while fetching
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (err) {
    console.warn("[cre-cam] signaling failed:", err.message);
    stopCreCam(ip);
  }
}

/**
 * Closes the WebRTC session for a single IP and clears its consumers.
 * With no argument, closes EVERY session (full teardown). Safe to call
 * multiple times.
 *
 * @param {string} [ip] — IP to stop; omit to stop all sessions
 */
export function stopCreCam(ip) {
  if (ip == null) {
    Array.from(_sessions.keys()).forEach(k => stopCreCam(k));
    return;
  }
  const s = _sessions.get(ip);
  if (!s) return;
  if (s.pc) {
    try { s.pc.close(); } catch {}
  }
  s.consumers.forEach(el => { try { el.srcObject = null; } catch {} });
  _sessions.delete(ip);
}

// ── Re-attach helpers ─────────────────────────────────────────────────────────

/**
 * Scan all .cre-cam-video elements currently in the DOM and register each as a
 * consumer of ITS OWN printer's session (routed by data-cre-ip). Called after a
 * full cam-wall rebuild so new <video> elements automatically receive the right
 * live stream without restarting any peer connection.
 */
export function reAttachCreCamConsumers() {
  document.querySelectorAll(".cre-cam-video").forEach(el => addCreCamConsumer(el));
}

/** Register the DOM's .cre-cam-video elements that belong to a specific IP. */
function _reAttachForIp(ip) {
  document.querySelectorAll(`.cre-cam-video[data-cre-ip="${ip}"]`).forEach(el => addCreCamConsumer(el));
}

function _reAttach(ip) {
  const s = _sessions.get(ip);
  if (!s) return;
  // Prune stale (detached) consumers first.
  s.consumers.forEach(el => { if (!el.isConnected) s.consumers.delete(el); });
  // Register any new .cre-cam-video elements for this IP that appeared after a rebuild.
  _reAttachForIp(ip);
  // Push the stream to everyone on this session.
  if (s.stream) _broadcast(s);
}
