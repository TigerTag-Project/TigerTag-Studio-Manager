/**
 * renderer/qr-scan.js — read a TigerQR label with the computer's camera.
 * The search bar's scan button opens a window with the live camera; the
 * spool (or product) shown to it opens as if its link had been pasted
 * (inventory.js _qrLinkOpen, reader "camera"). Decoding: the browser's own
 * BarcodeDetector where it reads QR codes (macOS), else jsQR
 * (renderer/lib/jsqr, Apache-2.0), loaded on first use only.
 *
 *   openQrCameraScan({ t, openDialog, parseQrLink, onLink })
 */

const JSQR_SRC = "lib/jsqr/jsQR.js";
const FRAME_MS = 120;      // one decode every ~8th of a second
const MAX_W = 640;         // frames are scaled down before jsQR
let _jsqr = null;

function loadJsQr() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (_jsqr) return _jsqr;
  _jsqr = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = JSQR_SRC;
    s.onload = () => (window.jsQR ? resolve(window.jsQR) : reject(new Error("jsQR missing")));
    s.onerror = () => { _jsqr = null; reject(new Error("jsQR failed to load")); };
    document.head.appendChild(s);
  });
  return _jsqr;
}

// A decoder for video frames: (video) => Promise<string|null>.
async function makeDecoder() {
  try {
    if ("BarcodeDetector" in window && (await window.BarcodeDetector.getSupportedFormats()).includes("qr_code")) {
      const det = new window.BarcodeDetector({ formats: ["qr_code"] });
      return async video => (await det.detect(video))[0]?.rawValue || null;
    }
  } catch (_) { /* fall back to jsQR */ }
  const jsQR = await loadJsQr();
  const canvas = document.createElement("canvas"), g = canvas.getContext("2d", { willReadFrequently: true });
  return async video => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return null;
    const k = Math.min(1, MAX_W / w);
    canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
    g.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = g.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || null;
  };
}

export function openQrCameraScan({ t, openDialog, parseQrLink, onLink }) {
  let stream = null, timer = null, done = false, warned = false;
  const stop = () => {
    done = true;
    clearTimeout(timer);
    stream?.getTracks().forEach(tr => tr.stop());
    stream = null;
  };
  openDialog({
    cls: "qr-scan-win", icon: "qr", title: t("qrScanTitle"), text: t("qrScanHint"),
    body: `<div class="qrs-view"><video class="qrs-video" playsinline muted></video><span class="qrs-frame" aria-hidden="true"></span></div>
      <p class="qrs-msg" role="status" aria-live="polite"></p>`,
    onDismiss: stop,   // ✕ and Escape stop the camera
    wire: async (card, close) => {
      const video = card.querySelector(".qrs-video"), msg = card.querySelector(".qrs-msg");
      const say = text => { msg.textContent = text; };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      } catch (e) {
        say(t(e?.name === "NotFoundError" || e?.name === "OverconstrainedError" ? "qrScanNoCamera" : "qrScanDenied"));
        return;
      }
      if (done) { stop(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      let decode;
      try { decode = await makeDecoder(); } catch (_) { say(t("qrScanDenied")); return; }
      const tick = async () => {
        if (done) return;
        let text = null;
        try { text = await decode(video); } catch (_) {}
        if (text) {
          const link = parseQrLink(text);
          if (link) { stop(); close(); onLink(link); return; }
          if (!warned) { warned = true; say(t("qrScanNotOurs")); }
        }
        timer = setTimeout(tick, FRAME_MS);
      };
      tick();
    },
  });
}
