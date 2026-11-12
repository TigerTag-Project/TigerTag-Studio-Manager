/**
 * renderer/qr-scan.js — read a TigerQR label with the computer's camera.
 * The search bar's scan button opens a window with the live camera; the
 * spool (or product) shown to it opens as if its link had been pasted
 * (inventory.js _qrLinkOpen, reader "camera"). Decoding: the browser's own
 * BarcodeDetector where it reads QR codes (macOS), else jsQR
 * (renderer/lib/jsqr, Apache-2.0), loaded on first use only.
 *
 *   mountQrScanner(root, { t, parseQrLink, onLink, onFound }) → { stop }   — onFound: the read beep
 *
 * Drawn in ONE side card, #qrScanPanel (inventory.js openQrScanPanel): the
 * search bar's scan button and the add chooser's "Add from QR code".
 */

const JSQR_SRC = "lib/jsqr/jsQR.js";
const FRAME_MS = 120;      // one decode every ~8th of a second
const MAX_W = 640;         // frames are scaled down before jsQR
const WRONG_MS = 1000;     // how long a QR code that is not ours shows red
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

// The scanner itself, built into `root`: the live picture with its overlay (four
// corner brackets, a dot grid and a sweeping laser over the target, the rest
// dimmed; a status pill in its top right corner) and a message line. On a read
// the brackets snap tight and turn green ("found"), the camera stops, then
// onLink(link) runs; a QR code that is not ours shows red for WRONG_MS.
// Returns { stop } — stop() also runs on its own once a link is read.
export function mountQrScanner(root, { t, parseQrLink, onLink, onFound }) {
  let stream = null, timer = null, done = false;
  const stop = () => {
    done = true;
    clearTimeout(timer);
    stream?.getTracks().forEach(tr => tr.stop());
    stream = null;
  };
  root.innerHTML = `<div class="qrs-view"><video class="qrs-video" playsinline muted></video>
      <span class="qrs-target" aria-hidden="true"><span class="qrs-grid"></span><span class="qrs-laser"></span>
        <i class="qrs-c qrs-c--tl"></i><i class="qrs-c qrs-c--tr"></i><i class="qrs-c qrs-c--bl"></i><i class="qrs-c qrs-c--br"></i></span>
      <div class="qrs-status"><span class="qrs-dot" aria-hidden="true"></span><span class="qrs-status-txt">${t("qrScanScanning")}</span></div></div>
    <p class="qrs-msg" role="status" aria-live="polite"></p>`;
  const video = root.querySelector(".qrs-video"), msg = root.querySelector(".qrs-msg");
  const say = text => { msg.textContent = text; };
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
    } catch (e) {
      say(t(e?.name === "NotFoundError" || e?.name === "OverconstrainedError" ? "qrScanNoCamera" : "qrScanDenied"));
      return;
    }
    if (done) { stop(); return; }
    video.srcObject = stream;
    // A camera the OS has not granted to the app can open without ever sending
    // a frame (on macOS, an app started from another one inherits its access):
    // say so after a few seconds instead of leaving a black square.
    const noPicture = setTimeout(() => { if (!done && !video.videoWidth) say(t("qrScanNoPicture")); }, 4000);
    video.addEventListener("loadeddata", () => { clearTimeout(noPicture); say(""); }, { once: true });
    video.play().catch(() => {});   // not awaited: play() never settles while no frame comes
    let decode;
    try { decode = await makeDecoder(); } catch (_) { say(t("qrScanDenied")); return; }
    const tick = async () => {
      if (done) return;
      let text = null;
      try { text = await decode(video); } catch (_) {}
      if (done) return;
      if (text) {
        const link = parseQrLink(text);
        if (link) {
          // The "found" beat: a beep, green brackets snapped on the code (the last
          // picture held), then the camera stops and the link is handed on.
          done = true;
          try { onFound?.(); } catch (_) {}
          root.querySelector(".qrs-view")?.classList.add("is-found");
          root.querySelector(".qrs-status")?.classList.add("is-found");
          const st = root.querySelector(".qrs-status-txt");
          if (st) st.textContent = t("qrScanFound");
          setTimeout(() => { stop(); onLink(link); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 650);
          return;
        }
        // Not one of ours: red brackets and the error for a second, then back to scanning.
        root.querySelector(".qrs-view")?.classList.add("is-wrong");
        root.querySelector(".qrs-status")?.classList.add("is-wrong");
        msg.classList.add("is-wrong");
        say(t("qrScanNotOurs"));
        timer = setTimeout(() => {
          root.querySelectorAll(".is-wrong").forEach(el => el.classList.remove("is-wrong"));
          say("");
          tick();
        }, WRONG_MS);
        return;
      }
      timer = setTimeout(tick, FRAME_MS);
    };
    tick();
  })();
  return { stop };
}
