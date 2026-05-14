/**
 * snapmaker/widget_camera.js — Snapmaker camera banner widget.
 *
 * Exports a single function used by the printer detail side-panel.
 * All Snapmaker camera logic lives here — inventory.js calls this and
 * never builds camera HTML inline.
 *
 * Stream: Crowsnest WebRTC player page (port 80, path /webcam/webrtc).
 * The iframe handles the full WebRTC negotiation internally — no
 * RTCPeerConnection in the renderer.
 */
import { ctx } from '../context.js';
import { snapGetConn, snapKey } from './index.js';

/**
 * Returns the full camera banner HTML for a Snapmaker printer,
 * or "" when the printer is offline / not yet connected.
 *
 * @param  {object} p  — printer record from state.printers
 * @returns {string}   — HTML string (safe to assign to innerHTML)
 */
export function renderSnapCamBanner(p) {
  const conn = snapGetConn(snapKey(p));
  if (!conn || conn.status !== "connected" || !conn.ip) return "";
  return `
    <div class="pp-cam-full pp-cam-loading">
      <iframe class="snap-camera-frame" src="${ctx.esc(`http://${conn.ip}/webcam/webrtc`)}"
              sandbox="allow-scripts allow-same-origin"
              loading="lazy" referrerpolicy="no-referrer"
              allow="autoplay"
              onload="var h=this.closest('.pp-cam-loading');if(h){h.classList.remove('pp-cam-loading');h.querySelector('.pp-cam-loading-overlay')?.remove();}"></iframe>
      <div class="pp-cam-loading-overlay">
        <span class="pp-cam-loading-dots">
          <span></span><span></span><span></span>
        </span>
      </div>
    </div>`;
}
