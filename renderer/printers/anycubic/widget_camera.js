/**
 * printers/anycubic/widget_camera.js — Anycubic camera banner widget.
 *
 * The printer serves HTTP-FLV on port 18088 (`http://<ip>:18088/flv` —
 * PROTOCOL.md §2/§5c). Chromium can't play FLV natively, so ffmpeg in the
 * main process remuxes the stream to JPEG frames delivered over the
 * 'anycubic:cam-frame' IPC channel (same pattern as the Bambu RTSP camera).
 *
 * The stream is ON-DEMAND: /flv 404s until the printer starts capturing, so
 * index.js probes before spawning ffmpeg and only flips `camLive` true when a
 * stream is actually serving. This widget therefore:
 *   • camLive  → renders the JPEG <img data-acu-key> (frames fan out from
 *                index.js's onCamFrame handler)
 *   • idle     → returns "" so the panel shows its normal hero photo (no error,
 *                no broken player). index.js keeps re-probing while the panel
 *                is open, so a stream started elsewhere (e.g. the slicer)
 *                attaches automatically within a few seconds.
 */
import { ctx } from '../context.js';
import { acuGetConn, acuKey } from './index.js';

export function renderAcuCamBanner(p) {
  const conn = acuGetConn(acuKey(p));
  if (!conn) return "";

  const d = conn.data || {};
  // Idle (no live stream) → "" so the hero photo shows instead.
  if (!d.camLive && !d.lastCamFrame) return "";

  const imgSrc  = d.lastCamFrame ? `data:image/jpeg;base64,${d.lastCamFrame}` : "";
  const loading = !d.lastCamFrame; // ffmpeg started, first frame still pending
  const key = acuKey(p);
  return `
    <div class="pp-cam-full acu-cam-flv${loading ? " pp-cam-loading" : ""}">
      <img class="acu-camera-img"
           data-acu-key="${ctx.esc(key)}"
           src="${ctx.esc(imgSrc)}"
           alt="Anycubic camera"
           draggable="false"/>
      ${loading ? `<div class="pp-cam-loading-overlay">
        <span class="pp-cam-loading-dots"><span></span><span></span><span></span></span>
      </div>` : ""}
    </div>`;
}
