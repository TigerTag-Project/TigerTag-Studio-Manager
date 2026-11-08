/**
 * ext-cam/ext-cam.js — External IP cameras. A camera here is NOT a printer: it
 * has no connection, no job, no model — it only shows its picture.
 *
 *   • Storage  — Firestore `users/{uid}/devices/{id}` with `type: "camera"`
 *                (owner-only, fixed shape — backend firestore.rules): { name,
 *                protocol, url, username, password, boardPlan }. `devices/` is the
 *                home of the account's non-printer devices; a camera is not under
 *                `printers/`, so it never counts as one.
 *   • Add/edit — one side card (`#xcOverlay`), opened from the brand picker's
 *                "External cameras" row or from a camera's gear on the wall.
 *   • Display  — cards of the camera wall like any printer's (`extCamWallItems`,
 *                `extCamWallHtml`; place `camWallPlan`) and cards on the printers
 *                board (`extCamBoardCardsHtml`, moved like a machine; place
 *                `boardPlan`) — both on the camera's own document.
 *   • Streams  — three readers, picked by `protocol`:
 *       rtsp, mjpeg → ffmpeg in main (`extcam:*` IPC, JPEG frames back). MJPEG
 *                too: read from the page, a camera that sends no CORS header —
 *                most IP cameras, the Elegoo CC2's — is blocked by the browser
 *                ("Failed to fetch"); ffmpeg in main has no such limit.
 *       webrtc → WHEP in the renderer (POST an SDP offer, read the SDP answer)
 *
 * The login is stored in clear in the camera's (owner-only) document — the user
 * must be able to see what they typed: the editor shows it behind an eye toggle.
 * Anywhere else it is never rendered into the page, a title, an attribute or a
 * log line.
 *
 * Entry points (called by inventory.js): initExtCam, extCamSubscribe,
 * extCamUnsubscribe, openExtCamAddFlow, extCamWallItems / extCamWallHtml / wireExtCamWall.
 */
import { ctx } from "../printers/context.js";

const PROTOCOLS = ["rtsp", "mjpeg", "webrtc"];
const PLACEHOLDER = {
  rtsp:   "rtsp://192.168.1.50:554/stream1",
  mjpeg:  "http://192.168.1.50:8080/video",
  webrtc: "http://192.168.1.50:1984/api/webrtc?src=camera",
};
const SCHEMES = { rtsp: /^rtsps?:$/, mjpeg: /^https?:$/, webrtc: /^https?:$/ };

// linkedIds(): the cameras a printer shows in place of its own (printer.camSource).
// Such a camera is drawn inside that printer, so it gets no card of its own.
let _api = { db: null, uid: () => null, onChange: () => {}, linkedIds: () => new Set() };
let _cams = [];
let _unsub = null;

export function initExtCam(api) { _api = { ..._api, ...api }; }

// ── Storage ──────────────────────────────────────────────────────────────────
const colRef = () => {
  const uid = _api.uid();
  return uid ? _api.db(uid).collection("users").doc(uid).collection("devices") : null;
};

export function extCamSubscribe(uid) {
  extCamUnsubscribe();
  const col = colRef();
  if (!col) return;
  _unsub = col.where("type", "==", "camera").onSnapshot(snap => {
    if (uid !== _api.uid()) return;
    _cams = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    // A position change (a card dragged, here or on another device) moves that
    // card in place; only a change of WHAT is shown redraws the view.
    const sig = shapeSig();
    if (sig === _shapeSig) { placeBoardCards(); return; }
    _shapeSig = sig;
    _api.onChange();
  }, err => console.warn("[ext-cam]", err.code, err.message));
}

export function extCamUnsubscribe() {
  if (_unsub) { try { _unsub(); } catch (_) {} _unsub = null; }
  releaseAll();
  _cams = [];
  _shapeSig = "";
}

// Everything a view draws, minus the board position — and minus the login,
// which only the reader needs (compared through streamSig, never stored).
let _shapeSig = "";
const shapeSig = () => _cams.map(c => [c.id, c.name, c.protocol, c.url, !!c.username].join("|")).join("\n");

function placeBoardCards() {
  for (const c of _cams) {
    const el = document.querySelector(`.xc-board-card[data-id="${CSS.escape(c.id)}"]`);
    const p = c.boardPlan;
    if (!el || el.classList.contains("is-plan-dragging") || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    el.style.left = Math.max(0, Math.round(p.x)) + "px";
    el.style.top  = Math.max(0, Math.round(p.y)) + "px";
    if (Number.isFinite(p.z)) el.style.zIndex = String(p.z);
  }
}

// ── Readers ──────────────────────────────────────────────────────────────────
// key → { kind: "ff" | "rtc", els: Set<HTMLElement>, pc?, last?, retry? }
const _run = new Map();
let _sweeper = 0;
const camKey = id => `ext:${id}`;

function setState(el, state) {
  // Shown inside a printer (`.xc-embed`): that wrapper carries the state, even on the wall.
  const card = el.closest(".xc-embed") || el.closest(".xc-board-card, .cam-wall-card");
  if (card) card.dataset.state = state;
}

/** Every element showing this camera takes the state, and the stream remembers it. */
function setAll(r, state) {
  r.state = state;
  r.live = state === "live";
  r.els.forEach(el => setState(el, state));
}

/* A camera that has shown nothing 10 s after it was asked is OFFLINE as far as
   the card is concerned (grey); it keeps trying, and the first picture makes it
   live. Without this a camera that is switched off stayed "connecting" for ever
   — ffmpeg and WHEP both retry silently. */
function armWatch(key, r) {
  r.watch = setTimeout(() => { if (_run.get(key) === r && !r.live) setAll(r, "error"); }, 10000);
}

function ensureSweeper() {
  if (_sweeper) return;
  // A card that left the page or is no longer shown (view change, rebuild) takes
  // its stream with it; the next render attaches it again.
  _sweeper = setInterval(() => {
    for (const [key, r] of _run) {
      r.els.forEach(el => { if (!el.isConnected || !el.getClientRects().length) r.els.delete(el); });
      if (!r.els.size) stopKey(key);
    }
    if (!_run.size) { clearInterval(_sweeper); _sweeper = 0; }
  }, 4000);
}

function stopKey(key) {
  const r = _run.get(key);
  if (!r) return;
  _run.delete(key);
  clearTimeout(r.retry);
  clearTimeout(r.watch);
  clearTimeout(r.discT);
  if (r.kind === "ff")  { try { window.extCam?.stop(key); } catch (_) {} if (r.last) URL.revokeObjectURL(r.last); if (r.next) URL.revokeObjectURL(r.next); }
  if (r.kind === "rtc") { try { r.pc?.close(); } catch (_) {} r.els.forEach(el => { el.srcObject = null; }); }
}

export function releaseAll() { [..._run.keys()].forEach(stopKey); }

let _ffWired = false;
function wireFfmpegFeed() {
  if (_ffWired || !window.extCam) return;
  _ffWired = true;
  window.extCam.onFrame((key, buf) => {
    const r = _run.get(key);
    if (!r || r.kind !== "ff") return;
    const url = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
    // A frame still waiting is already out of date: the newest one replaces it.
    if (r.next) URL.revokeObjectURL(r.next);
    r.next = url;
    if (!r.decoding) paintNext(key, r);
  });
  window.extCam.onStatus((key, status) => {
    const r = _run.get(key);
    if (r) setAll(r, status === "live" ? "live" : "error");
  });
}

/* ONE DECODE AT A TIME. Pointing the <img> at each frame the moment it arrives
   cancels the decode of the one before it, and a network burst (several frames
   within a few ms) then shows only the last — a camera sending 10 pictures a
   second was drawn at 7. The frame is decoded off to the side first, then put on
   screen already decoded; the one waiting behind it is always the newest. */
function paintNext(key, r) {
  const url = r.next;
  r.next = null;
  r.decoding = true;
  const probe = new Image();
  probe.src = url;
  const done = () => {
    r.decoding = false;
    if (_run.get(key) !== r) { URL.revokeObjectURL(url); return; }   // stopped meanwhile
    r.els.forEach(el => { if (el.isConnected) el.src = url; else r.els.delete(el); });
    if (r.last) URL.revokeObjectURL(r.last);
    r.last = url;
    if (r.next) paintNext(key, r);
  };
  probe.decode().then(done, done);
}

const basicAuth = cam => cam.username
  ? { Authorization: "Basic " + btoa(unescape(encodeURIComponent(`${cam.username}:${cam.password || ""}`))) } : {};

/** WHEP: one offer, one answer. Resolves once the browser has the answer set. */
async function whepConnect(cam, onStream) {
  const pc = new RTCPeerConnection();
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.ontrack = e => onStream(e.streams[0]);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  // The offer is sent whole: wait for local candidates, but never for long.
  await new Promise(res => {
    if (pc.iceGatheringState === "complete") return res();
    const done = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", done); res(); } };
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(res, 1500);
  });
  // A host that takes the connection but never answers must not hang the Test
  // button or the reconnect loop: 8 s, then it counts as unreachable.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8000);
  try {
    const resp = await fetch(cam.url, {
      method: "POST", cache: "no-store", signal: abort.signal,
      headers: { "Content-Type": "application/sdp", ...basicAuth(cam) },
      body: pc.localDescription.sdp,
    });
    if (!resp.ok) throw new Error(resp.status === 401 || resp.status === 403 ? "auth" : "http");
    await pc.setRemoteDescription({ type: "answer", sdp: await resp.text() });
    return pc;
  } catch (e) {
    try { pc.close(); } catch (_) {}
    throw e;
  } finally { clearTimeout(timer); }
}

function startRtc(cam, r) {
  const key = camKey(cam.id);
  const show = stream => {
    r.stream = stream;
    r.els.forEach(el => { el.srcObject = stream; el.play().catch(() => {}); });
  };
  // ONE retry at a time, and the dead connection is closed before the next one:
  // "disconnected" then "failed" used to schedule two, each opening its own peer
  // connection while the old one stayed open — cameras take only 1–2 clients.
  const retryIn = ms => {
    if (_run.get(key) !== r || r.retry) return;
    r.failed = true;
    setAll(r, "error");
    try { r.pc?.close(); } catch (_) {}
    r.pc = null;
    r.retry = setTimeout(() => { r.retry = 0; attempt(); }, ms);
  };
  const attempt = async () => {
    if (_run.get(key) !== r) return;
    if (!r.failed) setAll(r, "connecting");
    try {
      const pc = await whepConnect(cam, show);
      if (_run.get(key) !== r) { try { pc.close(); } catch (_) {} return; }
      r.pc = pc;
      pc.addEventListener("connectionstatechange", () => {
        if (r.pc !== pc) return;
        const st = pc.connectionState;
        clearTimeout(r.discT);
        if (st === "failed" || st === "closed") retryIn(4000);
        // "disconnected" often heals by itself: give it 5 s first.
        else if (st === "disconnected") r.discT = setTimeout(() => { if (r.pc === pc && pc.connectionState !== "connected") retryIn(0); }, 5000);
      });
    } catch (_) { retryIn(6000); }
  };
  attempt();
}

const streamSig = c => [c.protocol, c.url, c.username, c.password].join("|");

/**
 * Shows camera `cam` on `el`. The reader is started only when that camera is not
 * already running with the same settings: the printers board is rebuilt whenever
 * its shape changes, and a rebuild must not restart ffmpeg — the new picture
 * element is attached to the stream that is already there.
 */
function attachStream(cam, el) {
  const key = camKey(cam.id);
  ensureSweeper();
  let r = _run.get(key);
  if (r && r.sig !== streamSig(cam)) { stopKey(key); r = null; }
  if (r) {
    r.els.add(el);
    if (r.kind === "ff" && r.last) el.src = r.last;
    else if (r.kind === "rtc" && r.stream) { el.srcObject = r.stream; el.play().catch(() => {}); }
    setState(el, r.state || "connecting");
    return;
  }
  if (cam.protocol === "webrtc") {
    r = { kind: "rtc", sig: streamSig(cam), els: new Set([el]), pc: null, stream: null, retry: 0, live: false, state: "connecting" };
    _run.set(key, r);
    armWatch(key, r);
    startRtc(cam, r);
    return;
  }
  if (!window.extCam) { setState(el, "error"); return; }
  wireFfmpegFeed();
  const f = { kind: "ff", sig: streamSig(cam), els: new Set([el]), last: null, live: false, state: "connecting" };
  _run.set(key, f);
  armWatch(key, f);
  window.extCam.start({ key, url: cam.url, username: cam.username || "", password: cam.password || "" });
}

/** Stops the readers of cameras that were deleted or whose settings changed. */
function pruneStreams() {
  for (const [key, r] of _run) {
    const cam = _cams.find(c => camKey(c.id) === key);
    if (!cam || r.sig !== streamSig(cam)) stopKey(key);
  }
}

/** The picture arriving is what turns "connecting" into "live". */
function watchLive(cam, el) {
  if (el.dataset.xcWired) return;
  el.dataset.xcWired = "1";
  el.addEventListener(el.tagName === "VIDEO" ? "playing" : "load", () => {
    const r = _run.get(camKey(cam.id));
    if (r) setAll(r, "live"); else setState(el, "live");
  });
}

function wireCards(root) {
  root.querySelectorAll(".xc-board-card").forEach(card => {
    const cam = _cams.find(c => c.id === card.dataset.id);
    const el = card.querySelector(".xc-media");
    if (!cam || !el) return;
    watchLive(cam, el);
    attachStream(cam, el);
  });
  root.querySelectorAll("[data-xc-edit]").forEach(b =>
    b.addEventListener("click", () => openExtCamEditor(_cams.find(c => c.id === b.dataset.xcEdit))));
}

const protoLabel = p => (p === "rtsp" ? "RTSP" : p === "mjpeg" ? "MJPEG" : "WebRTC");

// ── On the camera wall ───────────────────────────────────────────────────────
/* An external camera is a card of the wall like any printer's: the wall draws
   it, places it, moves it, resizes it and puts it fullscreen through the same
   code, given an item shaped like a printer — `brand: "extcam"`, so its key is
   `extcam:<id>`. Its place is `camWallPlan` on the camera's own document. */
export const EXTCAM_BRAND = "extcam";
export const extCamWallItems = () => _cams.filter(c => !_api.linkedIds().has(c.id)).map(c => ({
  brand: EXTCAM_BRAND, id: c.id, printerName: c.name || "", camWallPlan: c.camWallPlan,
  protocol: c.protocol,
}));
export const extCamProtoLabel = item => protoLabel(item?.protocol);

/** The picture part of a wall card (the wall draws the card around it). */
export function extCamWallHtml(item) {
  const { esc, t } = ctx;
  const media = item.protocol === "webrtc"
    ? `<video class="xc-media" muted playsinline autoplay></video>`
    : `<img class="xc-media" alt="" draggable="false"/>`;
  return `
    <div class="xc-view xc-wall-view" data-xc-id="${esc(item.id)}">
      ${media}
      <div class="xc-overlay xc-overlay--connecting">${esc(t("extCamConnecting"))}</div>
      <div class="xc-overlay xc-overlay--error"><span class="icon icon-eye-off icon-24"></span>${esc(t("extCamNoSignal"))}</div>
    </div>`;
}

/** After the wall is drawn or patched: attach every external camera's stream. */
export function wireExtCamWall(container) {
  if (!container) return;
  container.querySelectorAll(".xc-wall-view[data-xc-id]").forEach(v => {
    const cam = _cams.find(c => c.id === v.dataset.xcId);
    const el = v.querySelector(".xc-media");
    if (!cam || !el) return;
    const card = v.closest(".xc-embed") ? null : v.closest(".cam-wall-card");
    if (card && !card.dataset.state) card.dataset.state = "connecting";
    watchLive(cam, el);
    attachStream(cam, el);
  });
  pruneStreams();
}

export async function extCamWallSave(id, plan) {
  const live = _cams.find(c => c.id === id);
  if (live) live.camWallPlan = plan;               // optimistic: no render wait
  const col = colRef();
  if (!col) return;
  try { await col.doc(id).set({ camWallPlan: plan }, { merge: true }); }
  catch (e) { console.warn("[ext-cam] wall position save failed:", e?.code || e?.message); }
}

// ── On the printers board ────────────────────────────────────────────────────
/* A camera is a board OBJECT like a machine: it has an id (`extcam:<id>`), a
   position, a depth, and is carried by the board's own drag, selection and
   zoom. Everything the board asks of "an object" is answered here, so the
   board's code only has to ask — it never learns what a camera is. The position
   lives on the camera's document (`boardPlan`), never on a printer. */
const BOARD_PREFIX = "extcam:";

export function extCamBoardObj(boardId) {
  if (typeof boardId !== "string" || !boardId.startsWith(BOARD_PREFIX)) return null;
  const cam = _cams.find(c => c.id === boardId.slice(BOARD_PREFIX.length));
  return cam ? { cam, p: null, unit: null } : null;
}

export const extCamMaxZ = () =>
  _cams.reduce((m, c) => Math.max(m, Number.isFinite(c.boardPlan?.z) ? c.boardPlan.z : 0), 0);

export async function extCamBoardSave(cam, x, y, z) {
  const live = _cams.find(c => c.id === cam.id);
  if (live) live.boardPlan = { x, y, z };          // optimistic: no render wait
  const col = colRef();
  if (!col) return;
  try { await col.doc(cam.id).set({ boardPlan: { x, y, z } }, { merge: true }); }
  catch (e) { console.warn("[ext-cam] board position save failed:", e?.code || e?.message); }
}

function boardCardHtml(c) {
  const { esc, t } = ctx;
  const media = c.protocol === "webrtc"
    ? `<video class="xc-media" muted playsinline autoplay></video>`
    : `<img class="xc-media" alt="" draggable="false"/>`;
  return `
    <div class="xc-board-card" data-board-id="${esc(BOARD_PREFIX + c.id)}" data-id="${esc(c.id)}" data-state="connecting">
      <div class="rp-rack-head printer-card-head">
        <div class="rp-rack-info">
          <div class="printer-card-name">
            <span class="printer-card-name-dot" aria-hidden="true"></span>
            <span class="printer-card-name-txt">${esc(c.name || "")}</span>
          </div>
        </div>
        <div class="rp-rack-actions">
          <button class="rp-rack-btn rp-rack-move" data-action="move" aria-label="${esc(t("actionMove"))}"><span class="icon icon-move icon-18"></span></button>
          <button class="rp-rack-btn xc-gear" data-xc-edit="${esc(c.id)}" aria-label="${esc(t("extCamEditTitle"))}"><span class="icon icon-settings icon-18"></span></button>
        </div>
      </div>
      <div class="xc-view">
        ${media}
        <div class="xc-overlay xc-overlay--connecting">${esc(t("extCamConnecting"))}</div>
        <div class="xc-overlay xc-overlay--error"><span class="icon icon-eye-off icon-24"></span>${esc(t("extCamNoSignal"))}</div>
      </div>
    </div>`;
}

/** The cameras' cards, to be appended to the board's own cards. */
export const extCamBoardCardsHtml = () => _cams.filter(c => !_api.linkedIds().has(c.id)).map(boardCardHtml).join("");

/** The cameras, for the printer settings to offer one as a printer's picture. */
export const extCamList = () => _cams.map(c => ({ id: c.id, name: c.name || "", protocol: c.protocol }));

/**
 * A camera's picture, to be drawn INSIDE a printer's own card / panel / wall card
 * in place of the printer's camera (printer.camSource = this camera's id). Same
 * element the wall uses; `wireExtCamWall` attaches the stream afterwards.
 * "" when the camera no longer exists.
 */
export function extCamEmbedHtml(camId, printerKey = "") {
  const c = _cams.find(x => x.id === camId);
  if (!c) return "";
  // data-cam-key: the printer it is drawn in, so the photo / video bar files what it captures under that printer.
  const key = printerKey ? ` data-cam-key="${ctx.esc(printerKey)}"` : "";
  return `<div class="pp-cam-full xc-embed"${key} data-state="connecting">${extCamWallHtml({ id: c.id, protocol: c.protocol })}</div>`;
}

/** After the board is drawn: gear buttons, and the streams (attached, not restarted). */
export function wireExtCamBoard(container) {
  if (!container) return;
  wireCards(container);
  pruneStreams();
}

// ── Add / edit card ──────────────────────────────────────────────────────────
let _domReady = false;
let _editId = null;
let _protocol = "rtsp";
const $ = id => document.getElementById(id);

function ensureDOM() {
  if (_domReady) return;
  _domReady = true;
  const root = document.createElement("div");
  root.id = "extCamRoot";
  root.innerHTML = `
<div class="modal-overlay" id="xcOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" id="xcTitle" data-i18n="extCamTitle">External cameras</div>
        <div class="pba-sub" id="xcSub" data-i18n="extCamSub">Add any IP camera: RTSP, MJPEG, WebRTC, not just the printer's built-in one.</div>
      </div>
      <button class="modal-close" id="xcClose">✕</button>
    </div>
    <div class="pba-body">
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="extCamName">Name</span>
        <input type="text" id="xcName" class="pba-input" maxlength="40" autocomplete="off" data-i18n-placeholder="extCamNamePh" placeholder="Workshop"/>
      </div>
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="extCamProtocol">Protocol</span>
        <div class="xc-seg" id="xcProto" role="radiogroup">
          ${PROTOCOLS.map(p => `<button type="button" role="radio" data-proto="${p}">${protoLabel(p)}</button>`).join("")}
        </div>
      </div>
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="extCamUrl">Stream address</span>
        <input type="text" id="xcUrl" class="pba-input pba-input--mono" spellcheck="false" autocomplete="off" autocapitalize="off"/>
      </div>
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="extCamUser">Username (optional)</span>
        <input type="text" id="xcUser" class="pba-input" spellcheck="false" autocomplete="off" autocapitalize="off"/>
      </div>
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="extCamPass">Password (optional)</span>
        <div class="pba-input-wrap">
          <input type="password" id="xcPass" class="pba-input" autocomplete="new-password"/>
          <button type="button" class="pba-input-eye" id="xcPassEye" data-i18n-aria="extCamShowPass" aria-label="Show password" aria-pressed="false">
            <span class="pba-eye-stack" aria-hidden="true">
              <span class="icon icon-eye-on icon-14 pba-eye-icon pba-eye-icon--on"></span>
              <span class="icon icon-eye-off icon-14 pba-eye-icon pba-eye-icon--off"></span>
            </span>
          </button>
        </div>
      </div>
      <div class="pba-error" id="xcError" hidden></div>
      <div class="xc-test" id="xcTest" hidden></div>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="xcBack">
        <span class="icon icon-chevron-l icon-13"></span><span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--secondary xc-delete" id="xcDelete" hidden>
        <span class="hold-progress"></span>
        <span class="icon icon-trash icon-13"></span><span data-i18n="extCamDelete">Delete camera</span>
      </button>
      <button class="adf-btn adf-btn--secondary" id="xcTestBtn">
        <span class="icon icon-check icon-13"></span><span class="label" data-i18n="extCamTestBtn">Test</span>
      </button>
      <button class="adf-btn adf-btn--primary" id="xcSave">
        <span class="icon icon-plus icon-13"></span><span class="label" id="xcSaveLabel" data-i18n="extCamAdd">Add camera</span>
      </button>
    </div>
  </div>
</div>`;
  document.body.appendChild(root);
  wireDOM();
  ctx.applyTranslations();
}

function setProtocol(p) {
  _protocol = PROTOCOLS.includes(p) ? p : "rtsp";
  $("xcProto").querySelectorAll("[data-proto]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.proto === _protocol)));
  $("xcUrl").placeholder = PLACEHOLDER[_protocol];
  showTest(null);
}

function showError(msg) { const e = $("xcError"); e.textContent = msg || ""; e.hidden = !msg; }
function showTest(state, msg) {
  const el = $("xcTest");
  el.hidden = !state;
  el.dataset.state = state || "";
  el.textContent = msg || "";
}

/** The address as typed, with the scheme added when the user left it out. */
function normalisedUrl() {
  let u = $("xcUrl").value.trim();
  if (u && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = (_protocol === "rtsp" ? "rtsp://" : "http://") + u;
  return u;
}

function readForm() {
  const url = normalisedUrl();
  let ok = false;
  try { const p = new URL(url); ok = SCHEMES[_protocol].test(p.protocol) && !!p.hostname; } catch (_) {}
  return {
    name: $("xcName").value.trim(), protocol: _protocol, url, urlOk: ok,
    username: $("xcUser").value.trim(), password: $("xcPass").value,
  };
}

const ERR_CODES = ["badUrl", "noFfmpeg", "timeout", "auth", "notFound", "unreachable", "noImage"];
const errText = code => ctx.t("extCamErr_" + (ERR_CODES.includes(code) ? code : "noImage"));

async function testConnection() {
  const f = readForm();
  showError(null);
  if (!f.urlOk) { showError(errText("badUrl")); return; }
  const btn = $("xcTestBtn");
  btn.disabled = true;
  showTest("busy", ctx.t("extCamTesting"));
  try {
    if (f.protocol === "webrtc") {
      const video = document.createElement("video");
      let pc;
      try {
        pc = await whepConnect(f, stream => { video.srcObject = stream; });
        await new Promise((res, rej) => {
          const to = setTimeout(() => rej(new Error("noImage")), 8000);
          video.addEventListener("loadeddata", () => { clearTimeout(to); res(); }, { once: true });
        });
        showTest("ok", ctx.t("extCamTestOk"));
      } finally { try { pc?.close(); } catch (_) {} }
    } else {
      const r = await window.extCam.test({ url: f.url, username: f.username, password: f.password });
      if (r.ok) showTest("ok", ctx.t("extCamTestOk"));
      else showTest("fail", errText(r.code));
    }
  } catch (e) {
    showTest("fail", errText(e?.message === "auth" || e?.message === "noImage" ? e.message : "unreachable"));
  } finally { btn.disabled = false; }
}

async function save() {
  const f = readForm();
  showError(null);
  if (!f.name) { showError(ctx.t("extCamErrName")); $("xcName").focus(); return; }
  if (!f.urlOk) { showError(errText("badUrl")); $("xcUrl").focus(); return; }
  const col = colRef();
  if (!col) return;
  const btn = $("xcSave");
  btn.disabled = true;
  try {
    const ref = _editId ? col.doc(_editId) : col.doc();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    await ref.set({
      type: "camera",
      name: f.name, protocol: f.protocol, url: f.url, username: f.username, password: f.password,
      updatedAt: now, ...(_editId ? {} : { createdAt: now }),
    }, { merge: true });
    closeCard();
  } catch (e) {
    console.warn("[ext-cam] save failed:", e?.code || e?.message);
    showError(ctx.t("extCamErrSave"));
  } finally { btn.disabled = false; }
}

async function remove() {
  const col = colRef();
  if (!col || !_editId) return;
  try { await col.doc(_editId).delete(); closeCard(); }
  catch (e) { console.warn("[ext-cam] delete failed:", e?.code || e?.message); showError(ctx.t("extCamErrSave")); }
}

function setPassVisible(on) {
  $("xcPass").type = on ? "text" : "password";
  const eye = $("xcPassEye");
  eye.setAttribute("aria-pressed", String(on));
  eye.classList.toggle("pba-input-eye--on", on);
}

function closeCard() { $("xcOverlay")?.classList.remove("open"); if ($("xcPass")) { setPassVisible(false); $("xcPass").value = ""; } }

function wireDOM() {
  $("xcOverlay").addEventListener("click", e => { if (e.target.id === "xcOverlay") closeCard(); });
  $("xcClose").addEventListener("click", closeCard);
  $("xcBack").addEventListener("click", () => { closeCard(); if (!_editId) ctx.openBrandPicker(); });
  $("xcProto").addEventListener("click", e => { const b = e.target.closest("[data-proto]"); if (b) setProtocol(b.dataset.proto); });
  $("xcTestBtn").addEventListener("click", testConnection);
  $("xcSave").addEventListener("click", save);
  ["xcName", "xcUrl", "xcUser", "xcPass"].forEach(id =>
    $(id).addEventListener("keydown", e => { if (e.key === "Enter") save(); }));
  $("xcUrl").addEventListener("input", () => showTest(null));
  // What was typed is the user's: one tap shows it, another hides it again.
  $("xcPassEye").addEventListener("click", () => setPassVisible($("xcPass").type === "password"));
  ctx.setupHoldToConfirm($("xcDelete"), 1500, remove);
}

function open(cam) {
  ensureDOM();
  _editId = cam?.id || null;
  $("xcName").value = cam?.name || "";
  $("xcUrl").value = cam?.url || "";
  $("xcUser").value = cam?.username || "";
  $("xcPass").value = cam?.password || "";
  setPassVisible(false);
  setProtocol(cam?.protocol || "rtsp");
  showError(null);
  showTest(null);
  $("xcTitle").textContent = ctx.t(cam ? "extCamEditTitle" : "extCamTitle");
  $("xcSub").hidden = !!cam;
  $("xcSaveLabel").textContent = ctx.t(cam ? "extCamSave" : "extCamAdd");
  $("xcDelete").hidden = !cam;
  $("xcBack").hidden = !!cam;
  $("xcOverlay").classList.add("open");
  setTimeout(() => $("xcName").focus(), 80);
}

export function openExtCamAddFlow() { open(null); }
/** By the camera itself, or by its id (a wall card only knows the id). */
export function openExtCamEditor(camOrId) {
  const cam = typeof camOrId === "string" ? _cams.find(c => c.id === camOrId) : camOrId;
  if (cam) open(cam);
}
