/**
 * printers/cam-snapshot.js — photo and video of any printer camera.
 *
 * Every brand draws its camera in the same host, `.pp-cam-full` (side panel and
 * camera wall alike), so one delegated layer serves them all: hovering a camera
 * shows three buttons: record, photo, and the printer's captures folder.
 *
 * Everything is filed per printer by main.js ("Camera captures"):
 * Pictures/Tiger Studio/Captures/<brand>_<MAC|serial|id>/{Photos,Videos}/<date>.<ext>,
 * with a printer.json
 * keeping every name / IP / model the printer had — its history survives a new
 * IP or a rename.
 *
 * PHOTO — the frame at the stream's own resolution (the <img>/<video>/<canvas>
 * drawn into a canvas); a cross-origin stream refuses that copy, and is then cut
 * out of a capture of the window. Saved, then shown in the shared preview
 * (IoT/tigertouch/panel.js `showScreenshot`: Save a copy / Copy / Report / Retake).
 *
 * A camera shown as a page in an <iframe> (Snapmaker U1 on the Paxx firmware) has
 * nothing the page can read: its host carries `data-cam-snap`, the URL of the
 * camera's own JPEG, and `data-cam-stream`, its MJPEG stream. The photo is taken
 * from the JPEG; the video from the stream (ffmpeg copies it), or, when the camera
 * does not serve one, from the JPEG read over and over.
 *
 * VIDEO — from the SOURCE whenever the camera allows it, not re-encoded from the page:
 *   - the camera's own URL (an http MJPEG, a Bambu RTSPS H.264 that main is not
 *     already reading) → ffmpeg in main copies the stream untouched;
 *   - a stream main already reads for the picture (Bambu RTSPS, `liveKey`) → the
 *     MJPEG frames it decodes for display are copied into a .mov as they arrive
 *     (the one exception: a second connection is cut by the printer);
 *   - a camera that only serves refreshed stills (Snapmaker U1 stock firmware)
 *     → main reads it as fast as it refreshes ("poll:" URL), frames untouched;
 *   - original JPEG frames pushed into an <img> as blob: URLs (FlashForge,
 *     Snapmaker, Bambu P1/A1 …) → each frame's bytes, muxed untouched at its
 *     real timing;
 *   - a MediaStream (<video>.srcObject: Creality WebRTC, Anycubic) →
 *     MediaRecorder on the stream itself, at a high bitrate.
 *
 *   initCamSnapshot({ t, printerForHost(host) → printer record | null,
 *                     printerInfo(p) → { brand, id, name, model, ip, mac, serial },
 *                     sourceUrl(p, media) → string | null,
 *                     liveKey(p) → main's live-stream key | null, toast(msg) })
 */
import { showScreenshot } from "../IoT/tigertouch/panel.js";
import { questBump } from "../quests/index.js";

let _ctx = null;
const _recs = new Map();   // host → recording state
const MAX_REC_MS = 10 * 60 * 1000;
// A live still (Paxx) is read at this pace; a stock U1 refreshes its own at ~1 fps.
const SNAP_POLL_MS = 200;

/** Does this URL answer with a real MJPEG stream? Asked of main: a fetch from the
 *  page is cross-origin, and the camera sends no CORS header. */
const probeStream = url => window.camCapture?.probeStream?.(url) ?? Promise.resolve(false);

function mediaOf(host) {
  let best = null, area = 0;
  for (const el of host.querySelectorAll("img, video, canvas")) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height > area && getComputedStyle(el).display !== "none") { best = el; area = r.width * r.height; }
  }
  return best;
}

// ── Photo ──────────────────────────────────────────────────────────────────

/** The camera's own JPEG, as sent. */
async function grabSnapshot(url) {
  // Read by main for the same reason as probeStream (no CORS header on the camera).
  try {
    const r = await window.camCapture?.fetchStill?.(url);
    if (!r?.ok) return { ok: false, error: "nomedia" };
    const img = new Image();
    await new Promise(res => { img.onload = img.onerror = res; img.src = r.dataUrl; });
    return img.naturalWidth ? { ok: true, dataUrl: r.dataUrl, w: img.naturalWidth, h: img.naturalHeight } : { ok: false, error: "nomedia" };
  } catch (_) { return { ok: false, error: "nomedia" }; }
}

async function grab(host) {
  const m = mediaOf(host);
  if (!m && host.dataset.camSnap) return grabSnapshot(host.dataset.camSnap);
  if (!m) return { ok: false, error: "nomedia" };
  const w = m.naturalWidth || m.videoWidth || m.width, h = m.naturalHeight || m.videoHeight || m.height;
  if (w && h) {
    try {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(m, 0, 0, w, h);
      return { ok: true, dataUrl: c.toDataURL("image/png"), w, h };
    } catch (_) { /* cross-origin stream: cut it out of the window instead */ }
  }
  if (typeof window.electronAPI?.captureWindow !== "function") return { ok: false, error: "nomedia" };
  host.classList.add("cam-snap-hide");
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  let shot = null;
  try { shot = await window.electronAPI.captureWindow(); } catch (_) {}
  host.classList.remove("cam-snap-hide");
  if (!shot) return { ok: false, error: "nomedia" };
  const img = new Image();
  await new Promise(r => { img.onload = img.onerror = r; img.src = shot; });
  const r = m.getBoundingClientRect(), k = img.naturalWidth / window.innerWidth;
  const c = document.createElement("canvas");
  c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
  c.getContext("2d").drawImage(img, r.left * k, r.top * k, r.width * k, r.height * k, 0, 0, c.width, c.height);
  return { ok: true, dataUrl: c.toDataURL("image/png"), w: c.width, h: c.height };
}

async function takePhoto(host) {
  const p = _ctx.printerForHost(host);
  const info = p ? _ctx.printerInfo(p) : { brand: "printer", id: "unknown" };
  const first = await grab(host);
  if (first.ok) window.camCapture.saveImage(info, first.dataUrl).then(r => { if (r?.ok) { _ctx.toast?.(_ctx.t("camPhotoSaved")); questBump("cameraPhoto"); } });
  showScreenshot({
    key: `${info.brand}:${info.id}:cam`, name: info.name || "Printer", target: "studio",
    prefix: `camera-${String(info.name || "printer").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "printer"}`,
    aspect: first.ok ? `${first.w} / ${first.h}` : "16 / 9",
    closeHost: () => {},
    // The first shot is the frame of the click (already filed); Retake files a new one.
    capture: (() => {
      let used = false;
      return async () => {
        if (!used) { used = true; return first; }
        const r = await grab(host);
        if (r.ok) window.camCapture.saveImage(info, r.dataUrl);
        return r;
      };
    })(),
  });
}

// ── Video, from the source ─────────────────────────────────────────────────

const recId = () => `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function startRec(host) {
  const p = _ctx.printerForHost(host), m = mediaOf(host), snap = host.dataset.camSnap;
  if (!p || (!m && !snap)) return;
  const info = _ctx.printerInfo(p), id = recId();
  const rec = { id, info, started: Date.now(), stop: null };

  // An iframe's picture: the camera's own stream when it serves one, else its still.
  const stream = host.dataset.camStream;
  const url = m ? _ctx.sourceUrl(p, m)
    : (stream && await probeStream(stream)) ? stream : `poll:${snap}`;
  // A stream main already reads for the picture is recorded from there: a second
  // connection to the same camera is refused or cut by the printer.
  const liveKey = m && _ctx.liveKey?.(p, host);
  const tap = liveKey ? await window.camCapture.recTapStart(id, info, liveKey) : null;
  if (tap?.ok) {
    rec.stop = () => window.camCapture.recStop(id);
  } else if (url?.startsWith("poll:")) {
    const r = await window.camCapture.recPollStart(id, info, url.slice(5), m ? 0 : SNAP_POLL_MS);
    if (!r?.ok) return _ctx.toast?.(_ctx.t("camRecFailed"));
    rec.stop = () => window.camCapture.recStop(id);
  } else if (url) {
    const r = await window.camCapture.recUrlStart(id, info, url);
    if (!r?.ok) return _ctx.toast?.(_ctx.t("camRecFailed"));
    rec.stop = () => window.camCapture.recStop(id);
  } else if (m.tagName === "VIDEO" && m.srcObject) {
    const type = ["video/mp4;codecs=avc1.640033", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
    const mr = new MediaRecorder(m.srcObject, { mimeType: type, videoBitsPerSecond: 25_000_000 });
    const chunks = [];
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.start(1000);
    rec.stop = () => new Promise(res => {
      mr.onstop = async () => {
        const blob = new Blob(chunks, { type });
        res(await window.camCapture.saveRecording(info, await blob.arrayBuffer(), type.startsWith("video/mp4") ? "mp4" : "webm"));
      };
      mr.stop();
    });
  } else if (m.tagName === "IMG") {
    // Original frames: every new blob:/data: source is the camera's JPEG as sent.
    const r = await window.camCapture.recFramesStart(id, info);
    if (!r?.ok) return _ctx.toast?.(_ctx.t("camRecFailed"));
    const t0 = performance.now();
    let last = "";
    const take = async () => {
      const src = m.currentSrc || m.src;
      if (!src || src === last) return;
      last = src;
      const t = (performance.now() - t0) / 1000;
      try {
        const buf = await (await fetch(src)).arrayBuffer();
        await window.camCapture.recFrame(id, t, buf);
      } catch (_) {
        // the producer already revoked that blob: keep the frame as drawn (JPEG, best quality)
        try {
          const c = document.createElement("canvas");
          c.width = m.naturalWidth; c.height = m.naturalHeight;
          c.getContext("2d").drawImage(m, 0, 0);
          const b = await new Promise(res => c.toBlob(res, "image/jpeg", 0.97));
          if (b) await window.camCapture.recFrame(id, t, await b.arrayBuffer());
        } catch (_) {}
      }
    };
    take();
    const mo = new MutationObserver(take);
    mo.observe(m, { attributes: true, attributeFilter: ["src"] });
    rec.stop = () => { mo.disconnect(); return window.camCapture.recStop(id); };
  } else {
    return _ctx.toast?.(_ctx.t("camRecFailed"));
  }
  _recs.set(host, rec);
  host.classList.add("cam-recording");
  rec.timer = setInterval(() => {
    const s = Math.floor((Date.now() - rec.started) / 1000);
    const el = host.querySelector(".cam-rec-time");
    if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    if (Date.now() - rec.started > MAX_REC_MS) stopRec(host);
  }, 500);
  syncButtons(host);
}

async function stopRec(host) {
  const rec = _recs.get(host);
  if (!rec) return;
  _recs.delete(host);
  clearInterval(rec.timer);
  host.classList.remove("cam-recording");
  syncButtons(host);
  const r = await rec.stop();
  if (r?.ok) {
    _ctx.toast?.(_ctx.t("camVideoSaved"));
    questBump("cameraVideo");
    window.camCapture.show(r.file);
  } else _ctx.toast?.(_ctx.t("camRecFailed"));
}

// ── Folder — every photo and video of this printer ─────────────────────────

function openFolder(host) {
  const p = _ctx.printerForHost(host);
  if (p) window.camCapture.openFolder(_ctx.printerInfo(p));
}

// ── Buttons ────────────────────────────────────────────────────────────────

function syncButtons(host) {
  const on = _recs.has(host);
  const b = host.querySelector(":scope > .cam-cap-bar .cam-rec-btn");
  if (!b) return;
  b.classList.toggle("is-on", on);
  b.setAttribute("aria-label", _ctx.t(on ? "camRecStop" : "camRecStart"));
  const time = host.querySelector(".cam-rec-time");
  if (time) { time.hidden = !on; if (!on) time.textContent = "0:00"; }
}

function addButtons(host) {
  if (host.querySelector(":scope > .cam-cap-bar")) return;
  const bar = document.createElement("div");
  bar.className = "cam-cap-bar";
  bar.innerHTML = `
    <span class="cam-rec-time" hidden>0:00</span>
    <button type="button" class="cam-cap-btn cam-rec-btn" data-cam-cap="rec" aria-label="${_ctx.t("camRecStart")}"><span class="cam-rec-dot"></span></button>
    <button type="button" class="cam-cap-btn" data-cam-cap="photo" aria-label="${_ctx.t("camSnapshot")}"><span class="icon icon-camera icon-16" aria-hidden="true"></span></button>
    <button type="button" class="cam-cap-btn" data-cam-cap="folder" aria-label="${_ctx.t("camOpenFolder")}"><span class="icon icon-folder icon-16" aria-hidden="true"></span></button>`;
  host.appendChild(bar);
  syncButtons(host);
}

export function initCamSnapshot(ctx) {
  _ctx = ctx;
  if (typeof window.camCapture?.saveImage !== "function") return;   // web build: no files, no ffmpeg
  // Added on first hover: cameras are rebuilt all the time, and this keeps every
  // brand's own markup untouched.
  document.addEventListener("mouseover", e => {
    const host = e.target.closest?.(".pp-cam-full");
    if (host && (mediaOf(host) || host.dataset.camSnap)) addButtons(host);
  });
  document.addEventListener("click", e => {
    const b = e.target.closest?.("[data-cam-cap]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const host = b.closest(".pp-cam-full");
    if (b.dataset.camCap === "photo") takePhoto(host);
    else if (b.dataset.camCap === "folder") openFolder(host);
    else if (_recs.has(host)) stopRec(host);
    else startRec(host);
  }, true);
}
