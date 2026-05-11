/**
 * printers/elegoo/widget_camera.js — Elegoo MJPEG camera banner widget.
 *
 * Stream: http://{ip}:8080/?action=stream (fixed port, no auth required).
 * Show when printer is connected. No concurrent-client limit issue (unlike
 * FlashForge mjpg-streamer) so no camSession cache-busting is needed.
 *
 * Public API:
 *   renderElegooCamBanner(p) — full banner HTML or "" when not applicable
 */
import { ctx } from '../context.js';
import { elegooGetConn, elegooKey } from './index.js';

const $ = id => document.getElementById(id);

function _heroUrl(p) {
  return ctx.printerImageUrlFor(p.brand, p.printerModelId)
      || ctx.printerImageUrl(ctx.findPrinterModel(p.brand, '0'));
}

function _modelName(p) {
  const m = ctx.findPrinterModel(p.brand, p.printerModelId);
  return m ? m.name : (p.printerModelId || '');
}

/**
 * Returns the full camera banner HTML for a connected Elegoo printer,
 * or "" when the printer is not connected or has no IP.
 *
 * @param  {object} p — printer record from state.printers
 * @returns {string}  — HTML string safe to assign to innerHTML
 */
export function renderElegooCamBanner(p) {
  const conn = elegooGetConn(elegooKey(p));
  if (!conn || conn.status !== 'connected' || !p.ip) return '';
  const streamUrl = `http://${p.ip}:8080/?action=stream`;
  return `
    <div id="elgCamHost" class="pp-cam-full elg-cam-host">
      <img class="elg-camera-img"
           src="${ctx.esc(streamUrl)}"
           alt="${ctx.esc(ctx.t('ffgCameraAlt') || 'Camera')}"
           loading="lazy"
           referrerpolicy="no-referrer"
           onerror="this.closest('.elg-cam-host').querySelector('.elg-cam-fallback')?.style.removeProperty('display');this.style.display='none'"/>
      <div class="elg-cam-fallback" style="display:none">
        ${_heroUrl(p)
          ? `<img class="elg-cam-fallback-img" src="${ctx.esc(_heroUrl(p))}"
                  alt="${ctx.esc(_modelName(p))}"
                  onerror="this.style.opacity='.15'"/>`
          : `<div class="elg-cam-fallback-img elg-cam-fallback-img--placeholder"></div>`}
        <div class="elg-cam-fallback-overlay">
          <div class="elg-cam-fallback-icon icon icon-warn icon-18" aria-hidden="true"></div>
          <div class="elg-cam-fallback-msg">${ctx.esc(ctx.t('ffgCamFailMsg') || 'Camera unavailable')}</div>
        </div>
      </div>
    </div>`;
}
