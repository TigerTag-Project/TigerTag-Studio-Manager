/**
 * report/index.js — "Bug or idea?": report something from inside the app, and
 * it lands as a PUBLIC issue on the Studio GitHub repo — no GitHub account
 * needed. The user writes a title + details, attaches screenshots (capture of
 * the window, paste, drop or file), can draw on them, ticks the box saying they
 * know it is public and put nothing private in it, and sends.
 *
 * The backend function `reportIssue` (TigerTag_Firebase_Backend
 * functions/reportIssue.js) checks the ID token, rate-limits, re-encodes and
 * stores the images, opens the issue and answers { number, url }.
 *
 * It is a SIDE CARD on the left (next to the sidebar), not a modal: the app
 * stays usable behind it, so the user can close it, navigate to the next screen,
 * open it again and snap that one too — the draft (text, screenshots, choices)
 * is kept until it is sent.
 *
 * Public API (called by inventory.js):
 *   initReport(ctx)  — ctx = { t, esc, getIdToken, getMeta, openExternal, onToggle,
 *                              listPrinters, printerReportData, … }
 *   toggleReport()   — open / close the side card (the draft survives)
 *   isReportOpen()   — is it open?
 *
 * "My requests" lists what the user sent; a row opens its CONVERSATION — the
 * request and every comment on the GitHub issue (team replies on the left, the
 * user's own on the right) — where the user answers, with pictures, without a
 * GitHub account (backend `myReports` actions `thread` / `comment`). A team reply
 * or a new status raises a notice and, once per change, an alert window.
 *
 * A third tab, "All requests", lists every request for every member: read-only,
 * except a question ("Ask a question"), which anyone may answer (posted as a
 * community member with their pseudo). TigerMasters (trusted TigerSquad
 * helpers, `roles: "tigermaster"`) and admins answer any request as the team
 * and close it as "done" / "declined"; a reporter can still close their own
 * (backend `myReports` actions `all`, `thread`/`comment` with `as: "team"`,
 * `resolve`, `close`).
 */

import { openAnnotator } from "./annotator.js";
import { repliesSince, seenAll, unseenReplies, alertNews } from "./replies.js";
import { tigerTouchScreensReady, captureTigerTouch } from "../IoT/tigertouch/panel.js";
import { scalesReady } from "../IoT/tigerscale/index.js";
import { spoolsReady, spoolReportDevices } from "../IoT/tigerspool/index.js";
import { touchReportDevices } from "../IoT/tigertouch/index.js";

const ENDPOINT = "https://us-central1-tigertag-connect.cloudfunctions.net/reportIssue";
const MINE_ENDPOINT = "https://us-central1-tigertag-connect.cloudfunctions.net/myReports";
// Request status (backend `statusOf`) → accent; finished ones are muted.
const STATUS = {
  open:        { key: "reportStatus_open",        c: "#1971c2" },
  in_progress: { key: "reportStatus_in_progress", c: "#f08c00" },
  done:        { key: "reportStatus_done",        c: "#2f9e44" },
  declined:    { key: "reportStatus_declined",    c: "#8a8f9c" },
  cancelled:   { key: "reportStatus_cancelled",   c: "#8a8f9c" },
};
const CLOSABLE = new Set(["open", "in_progress"]);
// What the user is asking for — chosen FIRST, like Zonara's requests. Same ids
// as the backend (`KINDS` in reportIssue.js), which maps each to a GitHub label.
// c = the kind's accent elsewhere (form header, My requests); tile / ink = the
// topic picker's muted icon tile and its icon colour.
const KINDS = [
  { id: "bug",      icon: "bug",         c: "#e5322d", tile: "#351D25", ink: "#FF4545" },
  { id: "idea",     icon: "bulb",        c: "#2f9e44", tile: "#15382D", ink: "#20E39A" },
  { id: "improve",  icon: "bars",        c: "#7c4dff", tile: "#2D204B", ink: "#A66BFF" },
  // About the CATALOGUE data, not the app: a wrong barcode, a missing value… —
  // tied to the product it concerns, picked with the catalogue search.
  { id: "catalog",  icon: "tag",         c: "#f0a500", tile: "#3B3016", ink: "#FFC83D" },
  // A materials brand the catalogue does not have yet: its name + website (to verify it).
  { id: "brand",    icon: "plus",        c: "#1971c2", tile: "#152F4D", ink: "#329BFF" },
  { id: "question", icon: "question",    c: "#db2777", tile: "#3B1832", ink: "#FF4DB8" },
].map(k => {
  const K = k.id[0].toUpperCase() + k.id.slice(1);
  return { ...k, label: `reportKind${K}`, hint: `reportHint${K}`, lead: `reportLead_${k.id}`,
           titleLabel: `reportTitleLabel_${k.id}`, title: `reportTitlePh${K}`, body: `reportBodyPh${K}`, send: `reportSend_${k.id}` };
});
const kindOf = id => KINDS.find(k => k.id === id) || null;
// Which product the request is about — it lands as an issue in THAT product's
// repo (backend: TARGETS in reportIssue.js, a closed list). Catalogue fixes and
// new brands are always Studio's, so the choice is not offered for them.
const TARGETS = [
  { id: "studio",     label: "Tiger Studio", icon: "../logos/tigersystem-icon-framed-white.svg" },   // the TigerSystem framed tiger
  { id: "tigertouch", label: "Tiger Touch",  icon: "icon_tigertouch_3d.svg" },
  { id: "tigerpod",   label: "Tiger POD",    icon: "Icon_tigerpod_3d.svg" },
  { id: "tigerscale", label: "Tiger Scale",  icon: "icon_tigerscale_3d.svg" },
  { id: "tigerspool", label: "Tiger Spool",  icon: "icon_tigerspool_3d.svg" },
  // The mobile app's repo is private: its requests are seen by the team only.
  { id: "mobile",     label: "TigerTag RFID Connect", icon: "icon_mobile_app.svg", private: true },
];
const targetable = kind => kind && kind !== "catalog" && kind !== "brand";
// A product's artwork, tinted (resolved against report.css, where var() is used);
// `icon` is relative to assets/svg/icons/.
const targetIco = x => `<span class="rep-target-ico" style="--ico:url('../../assets/svg/icons/${x.icon}')"></span>`;
const MAX_IMAGES = 5;          // images + PDFs + JSON files together
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_WIDTH = 1920;

let ctx = null;
let st = null;           // draft — kept across close / reopen, reset only after a send
let _overlay = null;     // the side card (<aside>)
let _tab = null;
let _clip = null;        // window starting at the sidebar edge: the card slides out from "behind" it
let _view = "new";       // "new" (kind picker / form) | "mine" (my requests) | "all" (TigerMasters: every request)
let _mine = { list: null, loading: false, error: false };   // last "My requests" fetch
let _closeAsk = null;    // report id whose close is awaiting confirmation
let _lastScreen = null;  // last screen painted — a change slides the new one in
// The conversation open in "My requests" / "All requests": { id, team, data, loading, error, text, images, sending, err }.
let _thread = null;
let _all = { list: null, loading: false, error: false, open: true };   // "All requests" (TigerMasters)
let _resolveAsk = null;  // "done" | "declined" awaiting its confirmation in the open conversation
const WATCH_MS = 30 * 60e3;   // re-check open requests for news while the app runs
let _snoozeTimer = 0;         // "Later" on the alert window: it comes back after WATCH_MS

export function initReport(c) {
  ctx = c;
  // Team replies and status changes are read from GitHub on demand: at sign-in, when
  // "My requests" opens, and every WATCH_MS while a request is still open.
  setInterval(() => {
    if (document.visibilityState === "visible" && (_mine.list || []).some(r => CLOSABLE.has(r.status))) syncReports().catch(() => {});
  }, WATCH_MS);
}

const t = (k, p) => ctx.t(k, p);
const esc = s => ctx.esc(String(s == null ? "" : s));

function freshState() {
  return { kind: null, target: "studio", targetPicked: false, title: "", body: "", images: [], pdfs: [], jsons: [], consent: false, withErrors: false,
           product: null, pq: "", brandName: "", brandSite: "",
           sending: false, phase: 0, error: "", done: null, meta: null, infoOpen: false };
}

// ── Images ────────────────────────────────────────────────────────────────────
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
// Any image source → JPEG data URL no wider than MAX_WIDTH (keeps uploads small).
async function normalize(src) {
  const img = await loadImg(src);
  const k = Math.min(1, MAX_WIDTH / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}
// The draft the attachment tools fill: the answer being written in an open
// conversation, else the new request. Both carry images / pdfs / jsons.
const D = () => (_threadActive() ? _thread : st);
const _err = msg => { if (D() === _thread) _thread.err = msg; else if (st) st.error = msg; };
const _attachCount = (d = D()) => d.images.length + d.pdfs.length + (d.jsons?.length || 0);
const isJsonFile = f => f && (f.type === "application/json" || /\.json$/i.test(f.name || ""));
async function addImage(src) {
  const d = D();
  if (!d) return;
  if (_attachCount(d) >= MAX_IMAGES) { _err(t("reportMaxImages", { n: MAX_IMAGES })); render(); return; }
  try { d.images.push(await normalize(src)); _err(""); } catch (_) { _err(t("reportImageBad")); }
  render();
}
function addFiles(files) {
  [...(files || [])].forEach(f => {
    if (/^image\//.test(f.type)) { const r = new FileReader(); r.onload = () => addImage(r.result); r.readAsDataURL(f); }
    else if (f.type === "application/pdf") addPdf(f);
    else if (isJsonFile(f)) addJson(f);
  });
}
// A JSON file (an export, a printer's status, a .ttag…) — checked to be real
// JSON here, sent as text; the issue links it and shows a short one inline.
function addJson(f) {
  const d = D();
  if (_attachCount(d) >= MAX_IMAGES) { _err(t("reportMaxImages", { n: MAX_IMAGES })); render(); return; }
  if (f.size > MAX_JSON_BYTES) { _err(t("reportJsonTooBig", { n: 2 })); render(); return; }
  const r = new FileReader();
  r.onload = () => {
    try { JSON.parse(r.result); } catch (_) { _err(t("reportJsonBad", { name: f.name })); render(); return; }
    (d.jsons ||= []).push({ name: f.name, size: f.size, text: r.result }); _err(""); render();
  };
  r.readAsText(f);
}
// A printer's data (model, connection, its last exchanges — inventory.js
// printerReportData, addresses and codes hidden) attached as one JSON file,
// picked from the account's printers: what a printer bug needs to be read.
function addPrinterData(key) {
  const d = D();
  d.printerPick = false;
  if (_attachCount(d) >= MAX_IMAGES) { _err(t("reportMaxImages", { n: MAX_IMAGES })); render(); return; }
  const p = (ctx.listPrinters?.() || []).find(x => x.key === key);
  const data = p && ctx.printerReportData?.(key);
  if (!data) { render(); return; }
  const slug = String(p.name || p.brand).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "printer";
  let text = JSON.stringify(data, null, 2);
  if (text.length > MAX_JSON_BYTES) { data.log = data.log?.slice(-5); text = JSON.stringify(data, null, 2); }
  (d.jsons ||= []).push({ name: `printer-${slug}.json`, size: text.length, text, printerKey: key });
  _err(""); render();
}
// A PDF (datasheet, invoice, label…) travels as is — no preview, a named chip.
function addPdf(f) {
  const d = D();
  if (_attachCount(d) >= MAX_IMAGES) { _err(t("reportMaxImages", { n: MAX_IMAGES })); render(); return; }
  if (f.size > MAX_PDF_BYTES) { _err(t("reportPdfTooBig", { n: 5 })); render(); return; }
  const r = new FileReader();
  r.onload = () => { d.pdfs.push({ name: f.name, size: f.size, data: r.result }); _err(""); render(); };
  r.readAsDataURL(f);
}

// The window as it is right now — without this dialog on top of it.
async function captureWindow() {
  if (!window.electronAPI?.captureWindow) return;
  _overlay.classList.add("rep-hidden"); _tab.classList.add("rep-hidden");
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));
  let shot = null;
  try { shot = await window.electronAPI.captureWindow(); } catch (_) {}
  _overlay.classList.remove("rep-hidden"); _tab.classList.remove("rep-hidden");
  if (!shot) { _err(t("reportCaptureFail")); render(); return; }
  // Straight into the editor: a capture is almost always taken to point at
  // something on it.
  const d = D(), before = d.images.length;
  await addImage(shot);
  if (d.images.length > before) annotate(d.images.length - 1);
}

/* A Tiger Touch request: its screen, as it is right now, straight into the
   editor like a window capture. */
async function captureTouchScreen(mac) {
  if (st.ttBusy) return;
  st.ttBusy = true; render();
  let res;
  try { res = await captureTigerTouch(mac); } catch (_) { res = { ok: false }; }
  st.ttBusy = false;
  if (!res?.ok) { st.error = t("reportCaptureTigerTouchFail"); render(); return; }
  const before = st.images.length;
  await addImage(res.dataUrl);
  if (st.images.length > before) annotate(st.images.length - 1);
  else render();
}

/* A Tiger Spool request: its screen, one plain GET /screen.bmp away. */
async function captureSpoolScreen(mac) {
  if (st.ttBusy) return;
  const sp = spoolsReady().find(x => x.mac === mac);
  if (!sp) return;
  st.ttBusy = true; render();
  let res;
  try { res = await window.tigerspool.screenshot(sp.ip); } catch (_) { res = { ok: false }; }
  st.ttBusy = false;
  if (!res?.ok) { st.error = t("reportCaptureTigerSpoolFail"); render(); return; }
  const before = st.images.length;
  await addImage(res.dataUrl);
  if (st.images.length > before) annotate(st.images.length - 1);
  else render();
}

/* A Tiger Scale request: one picture of its screen, read from its live view
   with the code the scale publishes in the account. */
async function captureScaleScreen(mac) {
  if (st.ttBusy) return;
  const sc = scalesReady().find(x => x.mac === mac);
  if (!sc) return;
  st.ttBusy = true; render();
  let res;
  try { res = await window.tigerscale.screenshot(sc.url, sc.code, sc.asleep); } catch (_) { res = { ok: false }; }
  st.ttBusy = false;
  if (!res?.ok) { st.error = t("reportCaptureTigerScaleFail"); render(); return; }
  const before = st.images.length;
  await addImage(res.dataUrl);
  if (st.images.length > before) annotate(st.images.length - 1);
  else render();
}

// ── Side card ─────────────────────────────────────────────────────────────────
// Pinned to the sidebar's right edge, which moves when the sidebar collapses or
// expands — followed with a ResizeObserver so the card never overlaps it.
function _pinToSidebar() {
  const sb = document.querySelector(".sidebar");
  const x = sb ? Math.round(sb.getBoundingClientRect().right) : 0;
  _clip.style.left = `${x}px`;
  // The tab rides the card's right edge when open, the sidebar's edge when closed.
  if (_tab) _tab.style.left = `${x + (isReportOpen() ? _overlay.offsetWidth : 0)}px`;
}
// A request is IN PROGRESS once a topic is picked and until it is sent (or the
// user goes back to the topic list = abandoned). While in progress, closing the
// card leaves its "»" tab on the edge, so it reads as "still there, reopen me" —
// to go and snap another screen, then come back.
const _inProgress = () => !!(st && !st.done && kindOf(st.kind));
function _syncTab() {
  if (!_tab) return;
  const open = isReportOpen();
  _tab.hidden = !(open || _inProgress());
  _tab.innerHTML = open ? "&laquo;" : "&raquo;";
  _tab.classList.toggle("is-parked", !open);
  // The sidebar button stays lit exactly as long as the tab is shown: open, or
  // a request in progress parked on the edge.
  ctx.onToggle?.(open || _inProgress());
  _tab.setAttribute("aria-label", t(open ? "tutoClose" : "reportReopen"));
  _pinToSidebar();
}
function _ensureCard() {
  if (_overlay) return;
  _overlay = document.createElement("aside");
  _overlay.className = "rep-panel";
  _overlay.id = "reportPanel";
  _overlay.setAttribute("aria-labelledby", "repHead");
  _tab = document.createElement("button");
  _tab.type = "button";
  _tab.className = "rep-close-tab";
  _tab.id = "reportCloseTab";
  _tab.innerHTML = "&laquo;";
  _tab.hidden = true;
  _tab.addEventListener("click", toggleReport);
  document.body.appendChild(_tab);      // outside the card: it must stay when the card is closed
  const body = document.createElement("div");
  body.className = "rep-scroll";
  _overlay.appendChild(body);
  _overlay.addEventListener("click", onClick);
  _overlay.addEventListener("input", onInput);
  _overlay.addEventListener("change", onInput);
  _overlay.addEventListener("dragover", e => { e.preventDefault(); });
  _overlay.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); reportDragState(false); reportDropFiles(e.dataTransfer?.files); });
  // The drop overlay (shown while files are dragged over the window).
  const drop = document.createElement("div");
  drop.className = "rep-drop";
  drop.setAttribute("aria-hidden", "true");
  _overlay.appendChild(drop);
  // The card lives in a clipping window whose left edge IS the sidebar's right
  // edge: sliding in from translateX(-100%), it appears from behind the menu.
  _clip = document.createElement("div");
  _clip.className = "rep-clip";
  _clip.appendChild(_overlay);
  document.body.appendChild(_clip);
  document.addEventListener("paste", onPaste);
  const sb = document.querySelector(".sidebar");
  if (sb && window.ResizeObserver) new ResizeObserver(_pinToSidebar).observe(sb);
  window.addEventListener("resize", _pinToSidebar);
}
const _body = () => _overlay.querySelector(".rep-scroll");

// POST with the Firebase ID token in its own header (Cloud Run inspects a Bearer
// `Authorization` itself); one retry with a fresh token on 401.
async function authedPost(url, body) {
  const payload = JSON.stringify(body);
  const post = async force => {
    const token = await ctx.getIdToken(force);
    if (!token) throw Object.assign(new Error("auth"), { code: "UNAUTHENTICATED" });
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Firebase-Id-Token": token }, body: payload });
  };
  let res = await post(false);
  if (res.status === 401) res = await post(true);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || res.status), { code: j.error });
  return j;
}

// ── Replies ──────────────────────────────────────────────────
// The backend notifies a CHANGE OF STATUS only. A reply leaves the status alone
// and just raises the request's reply count (`comments`), so the app watches that
// count: when it is above the one remembered from the last time "My requests" was
// open, a local notice says so. Per account, in localStorage; the remembered count
// moves only when the user looks (or closes the request), so an unseen reply is
// announced again at every start. It cannot tell who wrote the comment.
// v2: counts are team `replies` now (v1 held every comment, which would mask
// new replies) — a fresh key gives everyone a silent baseline.
const SEEN_KEY = uid => `tigertag.reportSeen.v2.${uid}`;
const _replyNotifId = id => `req-reply-${id}`;
function _loadSeen(uid) {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY(uid)) || "{}") || {}; } catch (_) { return {}; }
}
function _saveSeen(uid, map) {
  try { localStorage.setItem(SEEN_KEY(uid), JSON.stringify(map)); } catch (_) {}
}
// The status last seen per request, and what the alert window already announced
// ({ [id]: "status:replies" }) — so each change is announced once.
const _store = (key, uid) => ({
  load() { try { return JSON.parse(localStorage.getItem(`${key}.${uid}`) || "{}") || {}; } catch (_) { return {}; } },
  save(m) { try { localStorage.setItem(`${key}.${uid}`, JSON.stringify(m)); } catch (_) {} },
});
const _statusSeen = uid => _store("tigertag.reportStatusSeen", uid);
const _alerted = uid => _store("tigertag.reportAlerted", uid);
/** The user opened this request's conversation: its replies and status are seen. */
function _markSeen(r) {
  const uid = _mine.uid;
  if (!uid || !r) return;
  _saveSeen(uid, { ..._loadSeen(uid), ...seenAll([r]) });
  const s = _statusSeen(uid); s.save({ ...s.load(), [r.id]: r.status });
  ctx.clearNotif?.(_replyNotifId(r.id));
}
/** After a sync: raise a notice for each request that got a reply, and the alert
 *  window for what changed since it was last announced. */
function _checkReplies() {
  const uid = _mine.uid, list = _mine.list;
  if (!uid || !list) return;
  if (_thread && isReportOpen() && _view === "mine") _markSeen(list.find(r => r.id === _thread.id));   // reading it now
  const { fresh, next } = repliesSince(list, _loadSeen(uid));
  _saveSeen(uid, next);
  const freshIds = new Set(fresh.map(r => r.id));
  list.forEach(r => { if (!freshIds.has(r.id)) ctx.clearNotif?.(_replyNotifId(r.id)); });
  fresh.forEach(r => ctx.notifyReply?.({
    id: _replyNotifId(r.id), icon: "suggestion", action: "report",
    title: t("notifReqReply", { n: r.number }), text: r.title || "",
  }));
  const ss = _statusSeen(uid), al = _alerted(uid);
  const { news, statusNext, alertedNext } = alertNews(list, _loadSeen(uid), ss.load(), al.load());
  ss.save(statusNext); al.save(alertedNext);
  const shown = news.filter(n => !(_thread?.id === n.r.id && isReportOpen()));
  if (shown.length) _showAlert(shown);
}

// ── Alert window: "your request moved" ───────────────────────────────────────
// A real modal (not just a notice): a team reply or a new status may need the
// user's answer. One window lists every request that moved; it opens the
// conversation directly when there is only one.
function _showAlert(news) {
  document.getElementById("repAlertOverlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "modal-overlay rep-alert-overlay"; ov.id = "repAlertOverlay";
  ov.innerHTML = `
    <div class="modal-card rep-alert" role="alertdialog" aria-modal="true" aria-labelledby="repAlertTitle">
      <span class="rep-alert-ico" aria-hidden="true"><span class="icon icon-chat icon-32"></span></span>
      <h3 id="repAlertTitle">${esc(t("reportAlertTitle"))}</h3>
      <p class="rep-alert-text">${esc(t("reportAlertText"))}</p>
      <ul class="rep-alert-list">${news.map(({ r, reply, status }) => {
        const sdef = STATUS[r.status] || STATUS.open, k = kindOf(r.kind) || KINDS[0];
        return `<li style="--kc:${k.c}"><span class="rep-kind-ico"><span class="icon icon-${k.icon} icon-14"></span></span>
          <div><b>${r.number ? `#${esc(r.number)} · ` : ""}${esc(r.title || r.brand?.name || "—")}</b>
          <small>${[reply ? esc(t("reportAlertReply")) : "", status ? `<span class="rep-status" style="--sc:${sdef.c}">${esc(t(sdef.key))}</span>` : ""].filter(Boolean).join(" ")}</small></div></li>`;
      }).join("")}</ul>
      <div class="rep-alert-acts">
        <button type="button" class="secondary" data-alert="later">${esc(t("reportAlertLater"))}</button>
        <button type="button" class="primary" data-alert="open">${esc(t("reportAlertOpen"))}</button>
      </div>
    </div>`;
  const close = () => { ov.classList.remove("open"); setTimeout(() => ov.remove(), 250); };
  // "Later" (or a click outside) snoozes: these requests are no longer counted
  // as announced, so the window comes back at the next check — in WATCH_MS, or
  // at the next launch — unless their conversation is opened meanwhile.
  const later = () => {
    close();
    const uid = _mine.uid;
    if (uid) { const al = _alerted(uid), m = al.load(); news.forEach(n => delete m[n.r.id]); al.save(m); }
    clearTimeout(_snoozeTimer);
    _snoozeTimer = setTimeout(() => syncReports().catch(() => {}), WATCH_MS);
  };
  ov.addEventListener("click", e => {
    const b = e.target.closest("[data-alert]");
    if (e.target === ov || b?.dataset.alert === "later") later();
    else if (b?.dataset.alert === "open") { close(); openReport({ tab: "mine", thread: news.length === 1 ? news[0].r.id : null }); }
  });
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("open"));
  setTimeout(() => ov.querySelector('[data-alert="open"]')?.focus(), 50);
}

// ── Conversation ─────────────────────────────────────────────────────────────
async function openThread(id, { team = false } = {}) {
  _thread = { id, team, data: null, loading: true, error: false, body: "", images: [], pdfs: [], jsons: [], printerPick: false, sending: false, err: "" };
  _view = team ? "all" : "mine"; _closeAsk = null; _resolveAsk = null;
  if (!team) _markSeen((_mine.list || []).find(r => r.id === id));
  render();
  try { const j = await authedPost(MINE_ENDPOINT, { action: "thread", reportId: id, ...(team && ctx.isTeam?.() ? { as: "team" } : {}) }); if (_thread?.id === id) _thread.data = j.thread; }
  catch (_) { if (_thread?.id === id) _thread.error = true; }
  if (_thread?.id !== id) return;
  _thread.loading = false;
  render(); _threadToEnd();
}
const _threadToEnd = () => requestAnimationFrame(() => { const b = _body(); if (b) b.scrollTop = b.scrollHeight; });
const _threadActive = () => !!(_thread && isReportOpen() && (_view === "mine" || _view === "all") && _thread.data?.canReply);
// ── All requests (every member reads them; the team acts on them) ────────────
async function syncAll() {
  if (_all.loading) return;
  _all.loading = true; _all.error = false;
  try { _all.list = (await authedPost(MINE_ENDPOINT, { action: "all" })).reports || []; } catch (_) { _all.error = true; }
  // The team also sees the TigerCoins envelope messages their recipients reported.
  if (ctx.isTeam?.()) { try { _all.msgReports = (await authedPost(MINE_ENDPOINT, { action: "messageReports" })).reports || []; } catch (_) { _all.msgReports = null; } }
  _all.loading = false;
  // The list also feeds the open count on the "All requests" tab: repaint any list view.
  if (isReportOpen() && !_thread && (_view !== "new" || !kindOf(st?.kind))) render();
}
async function resolveThread(outcome) {
  const th = _thread;
  if (!th?.data?.team) return;
  _resolveAsk = null; th.sending = true; th.err = ""; render();
  try {
    await authedPost(MINE_ENDPOINT, { action: "resolve", reportId: th.id, outcome });
    const j = await authedPost(MINE_ENDPOINT, { action: "thread", reportId: th.id, as: "team" });
    if (_thread === th) th.data = j.thread;
    const r = (_all.list || []).find(x => x.id === th.id); if (r) r.status = outcome;
  } catch (e) { th.err = t(e.code === "CLOSED" ? "reportReplyErrClosed" : "reportErrSend"); }
  th.sending = false;
  if (_thread === th) { render(); _threadToEnd(); }
}
function allHTML() {
  if (_all.loading && !_all.list) return `<div class="rep-mine-empty">${esc(t("reportMineLoading"))}</div>`;
  if (_all.error && !_all.list) return `<div class="rep-mine-empty">${esc(t("reportMineError"))}</div>`;
  const list = (_all.list || []).filter(r => !_all.open || CLOSABLE.has(r.status));
  const chipsHtml = `<div class="rep-all-filter">
    <button type="button" class="rep-chip${_all.open ? " is-on" : ""}" data-rep="allFilter" data-open="1">${esc(t("reportAllOpen"))}</button>
    <button type="button" class="rep-chip${_all.open ? "" : " is-on"}" data-rep="allFilter" data-open="0">${esc(t("reportAllEverything"))}</button></div>`;
  const hint = ctx.isTeam?.() ? "" : `<div class="rep-hint">${esc(t("reportAllHint"))}</div>`;
  const chips = chipsHtml + msgReportsHTML();
  if (!list.length) return `${chips}<div class="rep-mine-empty">${esc(t("reportAllEmpty"))}</div>${hint}`;
  return `${chips}<div class="rep-mine">${list.map(r => {
    const k = kindOf(r.kind) || KINDS[0], sdef = STATUS[r.status] || STATUS.open;
    const sub = [r.number ? `#${r.number}` : null, r.createdAt ? ctx.timeAgo(r.createdAt) : null,
                 r.replies ? t("reportMineComments", { n: r.replies }) : null, r.mine ? t("reportAllYours") : null].filter(Boolean).join(" · ");
    return `
      <div class="rep-mine-row${CLOSABLE.has(r.status) ? "" : " is-final"}" style="--kc:${k.c}">
        <span class="rep-kind-ico"><span class="icon icon-${k.icon} icon-14"></span></span>
        <button type="button" class="rep-mine-main" data-rep="allThread" data-id="${esc(r.id)}"${r.number ? "" : " disabled"} aria-label="${esc(t("reportMineOpenThread"))}">
          <div class="rep-mine-title">${esc(r.title || r.brand?.name || "—")}</div>
          <div class="rep-mine-sub">${esc(sub)}</div>
        </button>
        <span class="rep-status" style="--sc:${sdef.c}">${esc(t(sdef.key))}</span>
      </div>`;
  }).join("")}</div>${hint}`;
}
/* TigerCoins messages reported by their recipient (team only, backend myReports
   "messageReports"): the open ones first, each with the text, who sent it to whom,
   and "Remove the message" / "Dismiss" (resolveMessageReport). */
function msgReportsHTML() {
  const list = ctx.isTeam?.() ? (_all.msgReports || []) : [];
  if (!list.length) return "";
  const open = list.filter(r => r.status === "open");
  const row = r => `
    <li class="rep-msgrep${r.status === "open" ? "" : " is-final"}">
      <div class="rep-msgrep-txt">“${esc(r.message)}”</div>
      <div class="rep-msgrep-sub">${esc(t("msgReportFromTo", { from: r.from || "—", to: r.to || "—" }))}${r.at ? ` · ${esc(ctx.timeAgo(r.at))}` : ""}</div>
      ${r.status === "open" ? `<div class="rep-msgrep-acts">
          <button type="button" class="rep-back" data-rep="msgRep" data-id="${esc(r.id)}" data-outcome="removed"><span class="icon icon-trash icon-12"></span>${esc(t("msgReportRemove"))}</button>
          <button type="button" class="rep-back" data-rep="msgRep" data-id="${esc(r.id)}" data-outcome="dismissed"><span class="icon icon-close icon-12"></span>${esc(t("msgReportDismiss"))}</button></div>`
        : `<span class="rep-status">${esc(t(r.status === "removed" ? "msgReportRemoved" : "msgReportDismissed"))}</span>`}
    </li>`;
  return `<details class="rep-msgreps"${open.length ? " open" : ""}><summary><span class="icon icon-flag icon-14"></span>${esc(t("msgReportsTitle"))}${open.length ? `<span class="rep-view-count">${open.length}</span>` : ""}</summary>
    <ul>${list.map(row).join("")}</ul></details>`;
}
async function resolveMsgReport(id, outcome) {
  const r = (_all.msgReports || []).find(x => x.id === id); if (!r) return;
  try { await authedPost(MINE_ENDPOINT, { action: "resolveMessageReport", id, outcome }); r.status = outcome; }
  catch (_) { ctx.toast?.(t("reportErrSend")); }
  render();
}
const _replyReady = th => !!(th.body.trim() || _attachCount(th));
async function sendReply() {
  const th = _thread;
  if (!th || th.sending || !_replyReady(th)) return;
  th.sending = true; th.err = ""; render();
  try {
    const j = await authedPost(MINE_ENDPOINT, { action: "comment", reportId: th.id, text: th.body.trim(), images: th.images,
      pdfs: th.pdfs.map(f => ({ name: f.name, data: f.data })), jsons: th.jsons.map(f => ({ name: f.name, text: f.text })), ...(th.data?.team ? { as: "team" } : {}) });
    if (_thread === th) Object.assign(th, { data: j.thread, body: "", images: [], pdfs: [], jsons: [], printerPick: false });
    const r = (_mine.list || []).find(x => x.id === th.id);
    if (r) r.comments = (Number(r.comments) || 0) + 1;
  } catch (e) {
    th.err = t(e.code === "CLOSED" ? "reportReplyErrClosed" : e.code === "TOO_MANY" ? "reportReplyErrTooMany" : "reportErrSend");
  }
  th.sending = false;
  if (_thread === th) { render(); _threadToEnd(); }
}
// Comment text: the little markdown people actually type (bold, code, links), escaped first.
function richText(s) {
  const link = (u, label) => `<a href="#" class="rep-msg-link" data-rep="link" data-url="${u}">${label}</a>`;
  return esc(String(s || "").replace(/^#{1,6}\s*/gm, ""))
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, l, u) => link(u, l))
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, p, u) => p + link(u, u))
    .replace(/\n/g, "<br>");
}
function messageHTML(m, i) {
  if (m.from === "app") return `<div class="rep-msg-note">${esc(t("reportThreadClosedByYou"))}${m.at ? ` · ${esc(ctx.timeAgo(m.at))}` : ""}</div>`;
  const mine = m.from === "you";
  const who = mine ? t("reportThreadYou") : m.from === "reporter" ? t("reportThreadReporter")
    : m.from === "team" ? (m.master ? t("reportThreadMaster", { name: m.name }) : t("reportThreadTeam"))
    : m.from === "helper" ? t("reportThreadHelper", { name: m.name || "—" }) : m.name;
  const ava = mine ? "" : m.avatar ? `<img class="rep-msg-ava" src="${esc(m.avatar)}&s=64" alt="">`
    : `<span class="rep-msg-ava rep-msg-ava--none"><span class="icon icon-user icon-14"></span></span>`;
  return `
    <div class="rep-msg rep-msg--${esc(m.from)}">
      ${ava}
      <div class="rep-msg-bubble">
        <div class="rep-msg-head"><b>${esc(who)}</b>${m.at ? `<span>${esc(ctx.timeAgo(m.at))}</span>` : ""}
          ${m.text ? `<button type="button" class="rep-msg-copy" data-rep="copyMsg" data-i="${i}" aria-label="${esc(t("reportCopyMsg"))}"><span class="icon icon-copy icon-12"></span></button>` : ""}</div>
        ${m.text ? `<div class="rep-msg-text">${richText(m.text)}</div>` : ""}
        ${(m.files || []).length ? `<div class="rep-msg-files">${m.files.map(f => `<button type="button" class="rep-msg-file" data-rep="link" data-url="${esc(f.url)}"><span class="icon icon-${f.json ? "json" : "pdf"} icon-14"></span>${esc(f.name)}</button>`).join("")}</div>` : ""}
        ${(m.images || []).length ? `<div class="rep-msg-imgs">${m.images.map(u => `<button type="button" class="rep-msg-img" data-rep="link" data-url="${esc(u)}" aria-label="${esc(t("reportThreadImage"))}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
      </div>
    </div>`;
}
function threadHTML() {
  const th = _thread, d = th.data;
  const r = (th.team ? _all.list : _mine.list || []).find?.(x => x.id === th.id) || {};
  const k = kindOf(d?.kind || r.kind) || KINDS[0];
  const status = d?.status || r.status || "open", sdef = STATUS[status] || STATUS.open;
  const url = d?.url || r.url;
  const head = `
    ${closeX()}
    <button type="button" class="rep-back" data-rep="threadBack"><span class="icon icon-chevron-l icon-12"></span>${esc(t(th.team ? "reportTabAll" : "reportTabMine"))}</button>
    <div class="rep-thread-head" style="--kc:${k.c}">
      <span class="rep-kind-ico"><span class="icon icon-${k.icon} icon-14"></span></span>
      <div class="rep-mine-main"><div class="rep-thread-title" id="repHead">${esc(d?.title || r.title || r.brand?.name || "—")}</div>
        <div class="rep-mine-sub">${esc([(d?.number || r.number) ? `#${d?.number || r.number}` : "", (d?.createdAt || r.createdAt) ? ctx.timeAgo(d?.createdAt || r.createdAt) : ""].filter(Boolean).join(" · "))}</div></div>
      <span class="rep-status" style="--sc:${sdef.c}">${esc(t(sdef.key))}</span>
      ${url ? `<button type="button" class="rep-mine-btn" data-rep="link" data-url="${esc(url)}" aria-label="${esc(t("reportOpenIssue"))}"><span class="icon icon-github icon-14"></span></button>` : ""}
    </div>`;
  if (th.loading && !d) return `<div class="rep-card rep-thread">${head}<div class="rep-mine-empty">${esc(t("reportThreadLoading"))}</div></div>`;
  if (th.error && !d) return `<div class="rep-card rep-thread">${head}<div class="rep-mine-empty">${esc(t("reportThreadError"))}</div></div>`;
  const msgs = [{ from: d.mine ? "you" : "reporter", text: d.body, images: d.images, at: d.createdAt }, ...d.comments];
  th.msgs = msgs;   // "Copy" reads the text back from here (to paste it into a translator)
  const answered = d.comments.some(c => c.from === "team" || c.from === "helper");
  // Who may close: the team (done / declined), the reporter (their own request);
  // a member reading someone else's request closes nothing.
  const closeActs = d.team ? `<div class="rep-thread-close rep-team-acts">${_resolveAsk
      ? `<button type="button" class="rep-mine-confirm" data-rep="resolveYes" data-outcome="${_resolveAsk}">${esc(t("reportTeamConfirm", { what: t(_resolveAsk === "done" ? "reportTeamDone" : "reportTeamDecline") }))}</button>`
      : `<button type="button" class="rep-back rep-team-done" data-rep="resolve" data-outcome="done"${th.sending ? " disabled" : ""}><span class="icon icon-check icon-12"></span>${esc(t("reportTeamDone"))}</button>
         <button type="button" class="rep-back" data-rep="resolve" data-outcome="declined"${th.sending ? " disabled" : ""}><span class="icon icon-close icon-12"></span>${esc(t("reportTeamDecline"))}</button>`}</div>`
    : d.mine ? `<div class="rep-thread-close">${r.closing ? `<span class="rep-mine-closing">…</span>`
      : _closeAsk === th.id
      ? `<button type="button" class="rep-mine-confirm" data-rep="mineCloseYes" data-id="${esc(th.id)}">${esc(t("reportMineCloseConfirm"))}</button>`
      : `<button type="button" class="rep-back" data-rep="mineClose" data-id="${esc(th.id)}"><span class="icon icon-close icon-12"></span>${esc(t("reportMineClose"))}</button>`}</div>` : "";
  const open = CLOSABLE.has(d.status);
  const composer = d.canReply ? `
    <div class="rep-reply">
      <div class="rep-editor">
        ${toolbarHTML()}
        <textarea id="repReply" class="rep-textarea" maxlength="4000" placeholder="${esc(t("reportReplyPh"))}"${th.sending ? " disabled" : ""}>${esc(th.body)}</textarea>
      </div>
      ${attachHTML(th, { printers: ctx.listPrinters?.() || [] })}
      <div class="rep-reply-bar">
        <span class="rep-reply-public">${esc(t(d.team ? "reportTeamReplyPublic" : d.helper ? "reportHelperReplyPublic" : "reportReplyPublic"))}</span>
        <button type="button" class="rep-btn rep-btn--blue" data-rep="replySend"${th.sending || !_replyReady(th) ? " disabled" : ""}><span class="icon icon-send icon-14"></span>${esc(t(th.sending ? "reportReplySending" : "reportReplySend"))}</button>
      </div>
      ${th.err ? `<div class="rep-error">${esc(th.err)}</div>` : ""}
    </div>
    ${closeActs}`
    : open && d.helper ? `<div class="rep-msg-note rep-msg-note--closed">${esc(t("reportReadOnly"))}</div>`
    : `<div class="rep-msg-note rep-msg-note--closed">${esc(t("reportReplyClosed"))}</div>${open ? closeActs : ""}`;
  return `
    <div class="rep-card rep-thread">
      ${head}
      <div class="rep-msgs">${msgs.map(messageHTML).join("")}
        ${answered ? "" : `<div class="rep-msg-note">${esc(t("reportThreadEmpty"))}</div>`}</div>
      ${composer}
    </div>`;
}

/** Fetch "My requests" — the backend also syncs each with GitHub and raises a
 *  notification for any status change. Called at sign-in and when the tab opens. */
export async function syncReports() {
  if (!ctx) return null;
  const uid = ctx.getUid?.() || null;
  if (_mine.uid !== uid) _mine = { list: null, loading: false, error: false, uid };   // account switched
  if (!uid || _mine.loading) return _mine.list;
  _mine.loading = true; _mine.error = false;
  if (isReportOpen() && _view === "mine" && !_thread) render();
  try { _mine.list = (await authedPost(MINE_ENDPOINT, { action: "list" })).reports || []; _checkReplies(); }
  catch (_) { _mine.error = true; }
  _mine.loading = false;
  if (isReportOpen() && !_thread) render();
  return _mine.list;
}
async function closeMine(id) {
  _closeAsk = null;
  const r = (_mine.list || []).find(x => x.id === id);
  if (r) r.closing = true;
  render();
  try {
    await authedPost(MINE_ENDPOINT, { action: "close", reportId: id });
    if (r) {
      r.status = "cancelled"; r.closing = false;
      // Closed from its conversation: the thread follows (no more answers, the app's note).
      if (_thread?.id === id && _thread.data) Object.assign(_thread.data, { status: "cancelled", canReply: false,
        comments: [..._thread.data.comments, { id: "closed", from: "app", text: "", images: [], at: Date.now() }] });
      // Closing posts a comment from the app's account. The server's `replies`
      // never counts it; only the older `comments` fallback does — skip it there.
      r.comments = (Number(r.comments) || 0) + 1;
      if (r.replies == null) {
        const uid = _mine.uid;
        if (uid) { const m = _loadSeen(uid); m[id] = r.comments; _saveSeen(uid, m); }
      }
    }
  } catch (_) { if (r) { r.closing = false; r.closeFailed = true; } if (_thread?.id === id) _thread.err = t("reportErrSend"); }
  render();
  if (_thread?.id === id) _threadToEnd();
}

export function isReportOpen() { return !!_overlay?.classList.contains("open"); }
// Files dropped anywhere in the window while the card is open land here — the
// .ttag import stands down meanwhile (inventory.js).
export function reportDropFiles(files) { reportDragState(false); if (_threadActive() || (isReportOpen() && st && !st.done)) addFiles(files); }
// Files are being dragged over the window: the card says "drop here" (a big
// overlay on the card) — otherwise nothing hints that a drop would work.
export function reportDragState(on) {
  if (!_overlay) return;
  _overlay.classList.toggle("rep-dragging", !!on && (_threadActive() || (!!st && !st.done && !!kindOf(st.kind))));
}
export function toggleReport() { isReportOpen() ? closeReport() : openReport(); }
// The TigerSquad card follows the account live (joined ↔ left, level change):
// swap just that card, the rest of the panel (a draft, the scroll) stays put.
export function refreshSquadCard() {
  const old = _overlay?.querySelector(".rep-squad"); const coffee = _overlay?.querySelector(".rep-coffee:not(.rep-squad)");
  if (old || coffee) {
    const tmp = document.createElement("div"); tmp.innerHTML = squadHTML();
    const next = tmp.firstElementChild;
    if (old) next ? old.replaceWith(next) : old.remove();
    else if (next) coffee.after(next);
  }
  // …and the form's send gate with it: joining unlocks "Send" at once.
  const gate = _overlay?.querySelector(".rep-squad-gate");
  if (gate) { const g = document.createElement("div"); g.innerHTML = squadGateHTML(); gate.replaceWith(g.firstElementChild); syncSend(); }
}

export async function openReport(opts = {}) {
  if (!ctx) return;
  if (_mine.uid !== (ctx.getUid?.() || null)) _mine = { list: null, loading: false, error: false, uid: ctx.getUid?.() || null };
  if (opts.tab === "mine") { _view = "mine"; if (!opts.thread) _thread = null; syncReports(); }
  const asTeam = opts.tab === "all" && !!ctx.isTeam?.();
  if (asTeam) { _view = "all"; if (!opts.thread) _thread = null; syncAll(); }
  else if (ctx.isTeam?.()) syncAll();   // the team sees how many are open before opening the tab
  _ensureCard();
  const dz = _overlay.querySelector(".rep-drop");
  dz.innerHTML = `<span class="icon icon-download icon-32"></span><span class="rep-drop-title">${esc(t("reportDropHere"))}</span><span class="rep-drop-sub">${esc(t("reportDropSub", { n: MAX_IMAGES }))}</span>`;
  if (!st || st.done) st = freshState();   // after a send, the next open starts clean
  // Opened from a device (e.g. a Tiger Touch screen capture): its product, a
  // kind and a picture already in place.
  if (opts.target && TARGETS.some(x => x.id === opts.target)) { st.target = opts.target; st.targetPicked = true; }
  if (opts.kind && kindOf(opts.kind)) { st.kind = opts.kind; _view = "new"; }
  for (const src of opts.images || []) addImage(src);
  // Refreshed on every open: the view and the printers may have changed since.
  try { st.meta = await ctx.getMeta(); } catch (_) { st.meta = st.meta || {}; }
  _pinToSidebar();
  if (opts.thread) openThread(opts.thread, { team: asTeam }); else render();
  // A card created just now has no computed "closed" position yet: read it
  // first, or the very first open would jump instead of sliding.
  void _overlay.getBoundingClientRect();
  requestAnimationFrame(() => { _overlay.classList.add("open"); _syncTab(); });
  if (st.kind && !st.title && !st.done) setTimeout(() => _overlay.querySelector("#repTitle")?.focus(), 250);
}
function closeReport() {
  if (!_overlay) return;
  _overlay.classList.remove("open");
  _syncTab();
}

function onPaste(e) {
  if (!_overlay?.classList.contains("open") || (st?.done && !_threadActive())) return;
  const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === "file" && (/^image\//.test(i.type) || i.type === "application/pdf" || i.type === "application/json")).map(i => i.getAsFile());
  if (!files.length) return;          // plain text → normal paste into the field
  e.preventDefault();
  addFiles(files);
}

function onInput(e) {
  const el = e.target;
  if (el.id === "repReply") { if (_thread) { _thread.body = el.value; const b = _overlay.querySelector('[data-rep="replySend"]'); if (b) b.disabled = _thread.sending || !_replyReady(_thread); } return; }
  if (el.id === "repFile" && _threadActive()) { addFiles(el.files); el.value = ""; return; }
  if (el.id === "repTitle") st.title = el.value;
  else if (el.id === "repBody") st.body = el.value;
  else if (el.id === "repConsent") { st.consent = el.checked; syncSend(); if (el.checked) _overlay.querySelector(".rep-bubble")?.remove(); }
  else if (el.id === "repErrors") st.withErrors = el.checked;
  else if (el.id === "repFile") { addFiles(el.files); el.value = ""; }
  else if (el.id === "repBrandName") st.brandName = el.value;
  else if (el.id === "repBrandSite") st.brandSite = el.value;
  else if (el.id === "repProdQ") { st.pq = el.value; searchProducts(); }
  if (["repTitle", "repBody", "repBrandName", "repBrandSite"].includes(el.id)) syncSend();
}
const _validSite = u => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`); return /\./.test(x.hostname); } catch { return false; } };
// Sending is for TigerSquad members (free to join) — the server checks it too.
const inSquad = () => !!ctx.squadMember?.();
// The form itself is complete (fields + consent), membership aside.
function formReady() {
  if (st.sending || !kindOf(st.kind) || !st.consent) return false;
  if (st.kind === "brand") return st.brandName.trim().length >= 2 && _validSite(st.brandSite.trim());
  if (st.kind === "catalog" && !st.product) return false;
  return st.title.trim().length >= 3 && st.body.trim().length >= 3;
}
const canSend = () => formReady() && inSquad();

// ── Catalogue product picker (catalogue corrections) ──
// Only the results list is repainted while typing — the field keeps its focus.
let _pqTimer = null;
function searchProducts() {
  clearTimeout(_pqTimer);
  _pqTimer = setTimeout(async () => {
    const box = _overlay?.querySelector("#repProdResults");
    if (!box) return;
    const q = st.pq.trim();
    if (q.length < 2) { box.innerHTML = ""; return; }
    let hits = [];
    try { hits = await ctx.searchCatalog(q, 8); } catch (_) {}
    if (q !== st.pq.trim()) return;                       // typed on meanwhile
    box.innerHTML = hits.length ? hits.map((p, i) => `
      <button type="button" class="rep-prod" data-rep="pick" data-i="${i}">
        ${p.img ? `<img src="${esc(p.img)}" alt="">` : `<span class="rep-prod-noimg"></span>`}
        <span class="rep-prod-txt"><span class="rep-prod-name">${esc(p.title)}</span><span class="rep-prod-sub">${esc([p.brand, p.material].filter(Boolean).join(" · "))}</span></span>
      </button>`).join("") : `<div class="rep-prod-empty">${esc(t("reportProdNone"))}</div>`;
    box._hits = hits;
  }, 160);
}
function productCardHTML(p) {
  return `
    <div class="rep-prod rep-prod--picked">
      ${p.img ? `<img src="${esc(p.img)}" alt="">` : `<span class="rep-prod-noimg"></span>`}
      <span class="rep-prod-txt"><span class="rep-prod-name">${esc(p.title)}</span><span class="rep-prod-sub">${esc([p.brand, p.material, p.barcode && `EAN ${p.barcode}`].filter(Boolean).join(" · "))}</span></span>
      <button type="button" class="rep-prod-x" data-rep="unpick" aria-label="${esc(t("reportProdChange"))}"><span class="icon icon-close icon-12"></span></button>
    </div>`;
}
// Not a member yet: Send stays clickable (dimmed) and opens the squad's
// presentation instead of sending; a member gets the usual enabled/disabled.
const sendLocked = () => !inSquad();
function syncSend() {
  const b = _overlay.querySelector("#repSend");
  if (!b) return;
  // Never truly disabled (except while sending): a click on an incomplete form
  // shows what is missing instead of doing nothing.
  b.disabled = !!st.sending;
  b.classList.toggle("is-locked", sendLocked() || !canSend());
}

/* "Send" on an incomplete form: point at the first thing missing — the empty
   field (focused, outlined) or the consent box (a bubble over it). */
function showMissing() {
  const field = id => _overlay.querySelector(`#${id}`);
  let target = null;
  if (st.kind === "brand") {
    if (st.brandName.trim().length < 2) target = field("repBrandName");
    else if (!_validSite(st.brandSite.trim())) target = field("repBrandSite");
  } else {
    if (st.kind === "catalog" && !st.product) target = field("repProdQ");
    else if (st.title.trim().length < 3) target = field("repTitle");
    else if (st.body.trim().length < 3) target = field("repBody");
  }
  if (target) {
    target.focus();
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.remove("rep-miss"); void target.offsetWidth; target.classList.add("rep-miss");
    setTimeout(() => target.classList.remove("rep-miss"), 1600);
    return;
  }
  if (!st.consent) {
    const box = _overlay.querySelector(".rep-check--public");
    if (!box) return;
    box.scrollIntoView({ block: "center", behavior: "smooth" });
    box.querySelector(".rep-bubble")?.remove();
    box.insertAdjacentHTML("beforeend", `<span class="rep-bubble" role="alert">${esc(t("reportConsentBubble"))}</span>`);
    clearTimeout(showMissing._t);
    showMissing._t = setTimeout(() => box.querySelector(".rep-bubble")?.remove(), 3500);
  }
}

function onClick(e) {
  const a = e.target.closest("[data-rep]");
  if (!a) return;
  const act = a.dataset.rep;
  if (act === "close") closeReport();
  else if (act === "kind") { st.kind = a.dataset.kind; _view = "new"; render(); setTimeout(() => _overlay.querySelector("#repTitle, #repBrandName, #repProdQ")?.focus(), 220); }
  else if (act === "kindReset") { st.kind = null; render(); }
  // Step 1 is the product; catalogue fixes and new brands exist for Studio only.
  else if (act === "target") {
    st.target = a.dataset.target; st.targetPicked = true;
    if (st.target !== "studio" && !targetable(st.kind)) st.kind = null;
    render();
  }
  else if (act === "targetReset") { st.targetPicked = false; st.kind = null; render(); }
  // Cancel = the request is dropped: draft cleared, card closed, no parked tab.
  else if (act === "cancel") { const meta = st.meta; st = freshState(); st.meta = meta; render(); closeReport(); }
  else if (act === "capture") captureWindow();
  else if (act === "ttshot") captureTouchScreen(a.dataset.mac);
  else if (act === "scaleshot") captureScaleScreen(a.dataset.mac);
  else if (act === "spoolshot") captureSpoolScreen(a.dataset.mac);
  else if (act === "printerPick") { const d = D(); d.printerPick = !d.printerPick; render(); }
  else if (act === "printerData") addPrinterData(a.dataset.key);
  else if (act === "file") _overlay.querySelector("#repFile")?.click();
  else if (act === "remove") { D().images.splice(Number(a.dataset.i), 1); render(); }
  else if (act === "removePdf") { D().pdfs.splice(Number(a.dataset.i), 1); render(); }
  else if (act === "removeJson") { D().jsons.splice(Number(a.dataset.i), 1); render(); }
  else if (act === "pick") { const h = _overlay.querySelector("#repProdResults")?._hits?.[Number(a.dataset.i)]; if (h) { st.product = h; render(); setTimeout(() => _overlay.querySelector("#repTitle")?.focus(), 50); } }
  else if (act === "unpick") { st.product = null; render(); setTimeout(() => { _overlay.querySelector("#repProdQ")?.focus(); searchProducts(); }, 50); }
  else if (act === "annotate") annotate(Number(a.dataset.i));
  else if (act === "send") { if (!formReady()) showMissing(); else if (sendLocked()) ctx.openSquad?.(); else send(); }
  else if (act === "issue" && st.done?.url) ctx.openExternal(st.done.url);
  else if (act === "coffee") ctx.openCoffee?.(a);
  else if (act === "squad") ctx.openSquad?.();
  else if (act === "squadWall") (ctx.openSquadBoard ? ctx.openSquadBoard("countries") : ctx.openExternal(a.dataset.url));
  else if (act === "view") { _view = a.dataset.view; _closeAsk = null; _thread = null; render(); if (_view === "mine") syncReports(); else if (_view === "all") syncAll(); }
  else if (act === "mineThread") openThread(a.dataset.id);
  else if (act === "allThread") openThread(a.dataset.id, { team: true });
  else if (act === "allFilter") { _all.open = a.dataset.open === "1"; render(); }
  else if (act === "msgRep") resolveMsgReport(a.dataset.id, a.dataset.outcome);
  else if (act === "resolve") { _resolveAsk = a.dataset.outcome; render(); setTimeout(() => { if (_resolveAsk === a.dataset.outcome) { _resolveAsk = null; render(); } }, 4000); }
  else if (act === "resolveYes") resolveThread(a.dataset.outcome);
  else if (act === "threadBack") { const team = _thread?.team; _thread = null; render(); team ? syncAll() : syncReports(); }
  else if (act === "link") { e.preventDefault(); if (/^https:\/\//.test(a.dataset.url || "")) ctx.openExternal(a.dataset.url); }
  else if (act === "replySend") sendReply();
  else if (act === "mineOpen") { const r = (_mine.list || []).find(x => x.id === a.dataset.id); if (r?.url) ctx.openExternal(r.url); }
  else if (act === "mineClose") { _closeAsk = a.dataset.id; render(); setTimeout(() => { if (_closeAsk === a.dataset.id) { _closeAsk = null; render(); } }, 4000); }
  else if (act === "mineCloseYes") closeMine(a.dataset.id);
  else if (act === "again") { const meta = st.meta; st = freshState(); st.meta = meta; _view = "new"; render(); }
  else if (act === "seeMine") { const meta = st.meta; st = freshState(); st.meta = meta; _view = "mine"; render(); syncReports(); }
  else if (act === "copyMsg") {
    const m = _thread?.msgs?.[Number(a.dataset.i)];
    if (m?.text) navigator.clipboard?.writeText(m.text).catch(() => {});
    const ic = a.querySelector(".icon");
    a.classList.add("is-copied"); ic?.classList.replace("icon-copy", "icon-check");
    setTimeout(() => { a.classList.remove("is-copied"); ic?.classList.replace("icon-check", "icon-copy"); }, 1200);
  }
  else if (act === "copyNum" && st.done?.number) {
    navigator.clipboard?.writeText(`#${st.done.number}`).catch(() => {});
    a.classList.add("is-copied"); setTimeout(() => a.classList.remove("is-copied"), 1200);
  }
  else if (act === "info") { st.infoOpen = !st.infoOpen; _overlay.querySelector(".rep-info")?.classList.toggle("is-open", st.infoOpen); a.setAttribute("aria-expanded", st.infoOpen); }
  else if (act === "fmt") applyFmt(a.dataset.fmt);
  else if (act === "emojis") { const p = _overlay.querySelector(".rep-emojis"); if (p) p.hidden = !p.hidden; }
  else if (act === "emoji") { applyFmt(null, a.dataset.e); const p = _overlay.querySelector(".rep-emojis"); if (p) p.hidden = true; }
}

// ── Screens ───────────────────────────────────────────────────────────────────
// list (topic picker / My requests) → form → sending → done. A move to a deeper
// screen slides in from the right, back to a shallower one from the left.
const DEPTH = { list: 0, form: 1, sending: 2, done: 3 };
function paint(screen, html) {
  const prev = _lastScreen;
  _lastScreen = screen;
  _body().innerHTML = html;
  if (prev && prev !== screen) {
    const card = _body().firstElementChild;
    card?.classList.add(DEPTH[screen] >= DEPTH[prev] ? "rep-in-right" : "rep-in-left");
  }
}
const closeX = () => `<button type="button" class="rep-x" data-rep="close" aria-label="${esc(t("tutoClose"))}"><span class="icon icon-close icon-14"></span></button>`;

// Coffee — under the topic list: the project is built on passion (and caffeine).
function coffeeHTML() {
  return `
    <div class="rep-coffee">
      <img class="rep-coffee-cup" src="../assets/svg/logos/logo_kofi.svg" alt="" aria-hidden="true">
      <div class="rep-coffee-txt">
        <div class="rep-coffee-title">${esc(t("reportCoffeeTitle"))}</div>
        <div class="rep-coffee-sub">${esc(t("reportCoffeeSub"))}</div>
        <button type="button" class="rep-coffee-cta" data-rep="coffee">${esc(t("reportCoffeeCta"))}<span class="icon icon-arrow-up-right icon-12"></span></button>
      </div>
    </div>`;
}

// TigerSquad — under the coffee card, only for an account that hasn't joined;
// opens the full invite (perks, levels, free join) over the panel.
function squadHTML() {
  const member = ctx.squadMember?.();
  if (member) {
    // Filled once the count arrives (cached after the first ask); hidden if it never does.
    ctx.squadMemberCount?.().then(n => {
      _overlay?.querySelectorAll("[data-squad-count]").forEach(el => {
        if (!Number.isFinite(n) || n < 1) return;
        if (!el.dataset.rank) el.querySelector("b").textContent = t("squadMembers", { n });
        el.hidden = false;
      });
    });
    // The member's world rank replaces the plain head count once known.
    ctx.squadRank?.().then(r => {
      if (!r) return;
      _overlay?.querySelectorAll("[data-squad-count]").forEach(el => {
        el.dataset.rank = "1";
        el.querySelector("b").textContent = t("squadRankLine", { rank: r.rank, total: r.total });
        el.hidden = false;
      });
    });
    return `
    <div class="rep-coffee rep-squad rep-squad--in sq-${member.tier}">
      <img class="rep-coffee-cup" src="${esc(member.src)}" alt="" aria-hidden="true">
      <div class="rep-coffee-txt">
        <div class="rep-coffee-title">${esc(t("squadInTitle"))}<span class="rep-squad-tier">${esc(member.label)}</span></div>
        <div class="rep-coffee-sub">${esc(t("squadInBody"))}</div>
        <div class="rep-squad-count" data-squad-count hidden><span class="icon icon-community" aria-hidden="true"></span><b></b></div>
        <button type="button" class="rep-coffee-cta" data-rep="squadWall" data-url="${esc(member.wall)}">${esc(t("squadBoardOpen"))}</button>
      </div>
    </div>`;
  }
  if (!ctx.canJoinSquad?.()) return "";
  return `
    <div class="rep-coffee rep-squad">
      <img class="rep-coffee-cup" src="../assets/img/tigersquad/tigersquad-gold.webp" alt="" aria-hidden="true">
      <div class="rep-coffee-txt">
        <div class="rep-coffee-title">${esc(t("squadInvTitle"))}</div>
        <div class="rep-coffee-sub">${esc(t("squadJoinSubFree"))}</div>
        <button type="button" class="rep-coffee-cta" data-rep="squad">${esc(t("squadReqCta"))}<span class="icon icon-arrow-r icon-12"></span></button>
      </div>
    </div>`;
}

/* Not in the TigerSquad yet: the send button stays locked, and this opens the
   squad's presentation to join (free). Swapped live by refreshSquadCard. */
function squadGateHTML() {
  if (inSquad()) return `<div class="rep-squad-gate" hidden></div>`;
  return `
      <div class="rep-squad-gate">
        <img src="../assets/img/tigersquad/tigersquad-gold.webp" alt="" aria-hidden="true">
        <div class="rep-squad-gate-txt"><b>${esc(t("reportSquadGateTitle"))}</b><span>${esc(t("reportSquadGateSub"))}</span></div>
        <button type="button" class="rep-coffee-cta" data-rep="squad">${esc(t("squadReqCta"))}<span class="icon icon-arrow-r icon-12"></span></button>
      </div>`;
}

function mineHTML() {
  if (_mine.loading && !_mine.list) return `<div class="rep-mine-empty">${esc(t("reportMineLoading"))}</div>`;
  if (_mine.error && !_mine.list) return `<div class="rep-mine-empty">${esc(t("reportMineError"))}</div>`;
  const list = _mine.list || [];
  if (!list.length) return `<div class="rep-mine-empty">${esc(t("reportMineEmpty"))}</div>`;
  const seen = _mine.uid ? _loadSeen(_mine.uid) : {};
  return `<div class="rep-mine">${list.map(r => {
    const k = kindOf(r.kind) || KINDS[0];
    const sdef = STATUS[r.status] || STATUS.open;
    const sub = [r.number ? `#${r.number}` : null, r.createdAt ? ctx.timeAgo(r.createdAt) : null,
                 r.comments ? t("reportMineComments", { n: r.comments }) : null].filter(Boolean).join(" · ");
    const asking = _closeAsk === r.id;
    const unseen = r.number ? unseenReplies(r, seen) : 0;
    return `
      <div class="rep-mine-row${CLOSABLE.has(r.status) ? "" : " is-final"}${unseen ? " has-news" : ""}" style="--kc:${k.c}">
        <span class="rep-kind-ico"><span class="icon icon-${k.icon} icon-14"></span></span>
        <button type="button" class="rep-mine-main" data-rep="mineThread" data-id="${esc(r.id)}"${r.number ? "" : " disabled"} aria-label="${esc(t("reportMineOpenThread"))}">
          <div class="rep-mine-title">${unseen ? `<span class="rep-mine-new">${esc(t("reportMineNewReply"))}</span>` : ""}${esc(r.title || r.brand?.name || "—")}</div>
          <div class="rep-mine-sub">${esc(sub)}</div>
          ${r.closeFailed ? `<div class="rep-error">${esc(t("reportErrSend"))}</div>` : ""}
        </button>
        <span class="rep-status" style="--sc:${sdef.c}">${esc(t(sdef.key))}</span>
        <div class="rep-mine-acts">
          ${r.url ? `<button type="button" class="rep-mine-btn" data-rep="mineOpen" data-id="${esc(r.id)}" aria-label="${esc(t("reportOpenIssue"))}"><span class="icon icon-github icon-14"></span></button>` : ""}
          ${CLOSABLE.has(r.status) ? (r.closing
            ? `<span class="rep-mine-closing">…</span>`
            : asking
            ? `<button type="button" class="rep-mine-confirm" data-rep="mineCloseYes" data-id="${esc(r.id)}">${esc(t("reportMineCloseConfirm"))}</button>`
            : `<button type="button" class="rep-mine-btn" data-rep="mineClose" data-id="${esc(r.id)}" aria-label="${esc(t("reportMineClose"))}"><span class="icon icon-close icon-12"></span></button>`) : ""}
        </div>
      </div>`;
  }).join("")}</div>
  <div class="rep-hint">${esc(t("reportMineHint"))}</div>`;
}

// "Automatic information" — exactly what travels with the report, shown before.
function infoHTML(m) {
  const rows = [
    ["info", "reportInfoVersion", m.appVersion],
    ["grid", "reportInfoPage", m.page],
    ["settings", "reportInfoOs", m.os],
    ["image", "reportInfoScreen", m.screen],
    ["printer", "reportInfoPrinters", m.printers],
    ["community", "reportInfoBadge", m.badge],
    ["star-fill", "reportInfoXp", m.xp],
  ].filter(r => r[2]);
  return `
    <div class="rep-info${st.infoOpen ? " is-open" : ""}">
      <button type="button" class="rep-info-head" data-rep="info" aria-expanded="${st.infoOpen}">
        <span class="icon icon-info icon-14"></span><span>${esc(t("reportAutoInfo"))}</span><span class="icon icon-chevron-r icon-12 rep-info-chev"></span>
      </button>
      <div class="rep-info-body">
        ${rows.map(([ic, k, v]) => `<div class="rep-info-row"><span class="icon icon-${ic} icon-12"></span><span class="rep-info-k">${esc(t(k))}</span><span class="rep-info-v">${esc(v)}</span></div>`).join("")}
      </div>
    </div>`;
}

const EMOJIS = ["🙂", "😅", "😍", "🤔", "😡", "🎉", "👍", "👎", "🐛", "💡", "🔥", "🙏"];
// Pictures, PDFs and JSON files (a printer's data…) — the drop zone of the
// new-request form and of an answer in a conversation. `d` = the draft;
// `extra` = the form's device-capture buttons.
function attachHTML(d, { printers = [], extra = "" } = {}) {
  const shots = d.images.map((src, i) => `
      <div class="rep-shot">
        <button type="button" class="rep-shot-img" data-rep="annotate" data-i="${i}" aria-label="${esc(t("reportAnnotate"))}"><img src="${src}" alt=""><span class="rep-shot-pen"><span class="icon icon-edit icon-12"></span></span></button>
        <button type="button" class="rep-shot-x" data-rep="remove" data-i="${i}" aria-label="${esc(t("reportRemoveImage"))}"><span class="icon icon-close icon-10"></span></button>
      </div>`).join("") + d.pdfs.map((f, i) => `
      <div class="rep-shot rep-shot--pdf">
        <span class="rep-pdf"><span class="icon icon-pdf icon-16"></span><span class="rep-pdf-name">${esc(f.name)}</span></span>
        <button type="button" class="rep-shot-x" data-rep="removePdf" data-i="${i}" aria-label="${esc(t("reportRemoveImage"))}"><span class="icon icon-close icon-10"></span></button>
      </div>`).join("") + (d.jsons || []).map((f, i) => `
      <div class="rep-shot rep-shot--pdf rep-shot--json">
        <span class="rep-pdf"><span class="icon icon-json icon-16"></span><span class="rep-pdf-name">${esc(f.name)}</span></span>
        <button type="button" class="rep-shot-x" data-rep="removeJson" data-i="${i}" aria-label="${esc(t("reportRemoveImage"))}"><span class="icon icon-close icon-10"></span></button>
      </div>`).join("");
  return `
      <label class="rep-label">${esc(t("reportShotLabel"))} <span class="rep-attach-count">${_attachCount(d)}/${MAX_IMAGES}</span></label>
      <div class="rep-dropzone">
        ${shots ? `<div class="rep-shots">${shots}</div>` : ""}
        ${_attachCount(d) < MAX_IMAGES ? `
        <div class="rep-dz-row">
          <span class="rep-dz-ico"><span class="icon icon-image icon-20"></span></span>
          <div class="rep-dz-txt">
            <div>${esc(t("reportDropLine1"))}</div>
            <button type="button" class="rep-dz-browse" data-rep="file">${esc(t("reportDropBrowse"))}</button>
            <button type="button" class="rep-dz-capture" data-rep="capture"><span class="icon icon-camera icon-14"></span>${esc(t("reportCaptureNow"))}</button>
            ${extra}
            ${printers.length ? `
            <button type="button" class="rep-dz-capture rep-dz-capture--printer${d.printerPick ? " is-open" : ""}" data-rep="printerPick" aria-expanded="${d.printerPick ? "true" : "false"}">
              <span class="icon icon-printer icon-14"></span>${esc(t("reportAttachPrinter"))}</button>` : ""}
          </div>
        </div>
        ${d.printerPick && printers.length ? `
        <div class="rep-printer-pick" role="list" aria-label="${esc(t("reportAttachPrinter"))}">
          ${printers.map(x => {
            const taken = (d.jsons || []).some(f => f.printerKey === x.key);
            return `<button type="button" role="listitem" class="rep-printer-row" data-rep="printerData" data-key="${esc(x.key)}"${taken ? " disabled" : ""}>
              <span class="rep-printer-img">${x.img ? `<img src="${esc(x.img)}" alt="">` : `<span class="icon icon-printer icon-16"></span>`}</span>
              <span class="rep-printer-name">${esc(x.name)}</span>
              <span class="rep-printer-dot${x.online ? " is-on" : ""}" aria-hidden="true"></span>
              ${taken ? `<span class="icon icon-check icon-12"></span>` : ""}
            </button>`; }).join("")}
          <p class="rep-printer-note">${esc(t("reportAttachPrinterNote"))}</p>
        </div>` : ""}` : ""}
        <input id="repFile" type="file" accept="image/*,application/pdf,application/json,.json" multiple hidden>
      </div>
      <div class="rep-formats">${esc(t("reportFormats", { n: MAX_IMAGES }))}</div>`;
}

// The new-request form's device captures (a Tiger Touch / Scale / Spool screen).
function deviceCapturesHTML() {
  return `            ${st.target === "tigertouch" ? tigerTouchScreensReady().map((x, _i, all) => `
            <button type="button" class="rep-dz-capture rep-dz-capture--ttc" data-rep="ttshot" data-mac="${esc(x.mac)}"${st.ttBusy ? " disabled" : ""}>
              <span class="rep-ttc-ico"></span>${esc(all.length > 1 ? t("reportCaptureTigerTouchNamed", { name: x.name }) : t("reportCaptureTigerTouch"))}</button>`).join("") : ""}
            ${st.target === "tigerscale" ? scalesReady().map((x, _i, all) => `
            <button type="button" class="rep-dz-capture rep-dz-capture--ttc rep-dz-capture--scale" data-rep="scaleshot" data-mac="${esc(x.mac)}"${st.ttBusy ? " disabled" : ""}>
              <span class="rep-ttc-ico"></span>${esc(all.length > 1 ? t("reportCaptureTigerTouchNamed", { name: x.name }) : t("reportCaptureTigerScale"))}</button>`).join("") : ""}
            ${st.target === "tigerspool" ? spoolsReady().map((x, _i, all) => `
            <button type="button" class="rep-dz-capture rep-dz-capture--ttc rep-dz-capture--spool" data-rep="spoolshot" data-mac="${esc(x.mac)}"${st.ttBusy ? " disabled" : ""}>
              <span class="rep-ttc-ico"></span>${esc(all.length > 1 ? t("reportCaptureTigerTouchNamed", { name: x.name }) : t("reportCaptureTigerSpool"))}</button>`).join("") : ""}`;
}
function toolbarHTML() {
  return `
    <div class="rep-fmt" role="toolbar">
      <button type="button" class="rep-fmt-btn" data-rep="fmt" data-fmt="bold" aria-label="${esc(t("reportFmtBold"))}"><b>B</b></button>
      <button type="button" class="rep-fmt-btn" data-rep="fmt" data-fmt="italic" aria-label="${esc(t("reportFmtItalic"))}"><i>I</i></button>
      <button type="button" class="rep-fmt-btn" data-rep="fmt" data-fmt="list" aria-label="${esc(t("reportFmtList"))}"><span class="icon icon-list icon-14"></span></button>
      <button type="button" class="rep-fmt-btn" data-rep="fmt" data-fmt="link" aria-label="${esc(t("reportFmtLink"))}"><span class="icon icon-link icon-14"></span></button>
      <button type="button" class="rep-fmt-btn" data-rep="emojis" aria-label="${esc(t("reportFmtEmoji"))}"><span class="icon icon-emoji icon-14"></span></button>
      <div class="rep-emojis" hidden>${EMOJIS.map(e => `<button type="button" class="rep-emoji" data-rep="emoji" data-e="${e}">${e}</button>`).join("")}</div>
    </div>`;
}
// Markdown, since the text lands in a GitHub issue: wrap the selection (or insert).
function applyFmt(kind, insert) {
  const ta = _overlay.querySelector(_threadActive() ? "#repReply" : "#repBody");
  if (!ta) return;
  const a = ta.selectionStart, b = ta.selectionEnd, sel = ta.value.slice(a, b);
  let out, caret;
  if (insert != null) { out = insert; caret = a + out.length; }
  else if (kind === "bold")   { out = `**${sel || "…"}**`; caret = a + out.length; }
  else if (kind === "italic") { out = `_${sel || "…"}_`; caret = a + out.length; }
  else if (kind === "link")   { out = `[${sel || "…"}](https://)`; caret = a + out.length - 1; }
  else if (kind === "list")   { const lines = (sel || "").split("\n"); out = lines.map(l => `- ${l}`).join("\n"); caret = a + out.length; if (a > 0 && ta.value[a - 1] !== "\n") { out = "\n" + out; caret++; } }
  ta.setRangeText(out, a, b, "end");
  ta.setSelectionRange(caret, caret);
  ta.focus();
  D().body = ta.value;
  if (D() === _thread) { const b = _overlay.querySelector('[data-rep="replySend"]'); if (b) b.disabled = _thread.sending || !_replyReady(_thread); }
}

function render() {
  if (!_overlay) return;
  queueMicrotask(_syncTab);   // topic picked / sent / abandoned → the tab follows

  // 4 — Confirmation
  if (st.done) {
    paint("done", `
      <div class="rep-card rep-card--center">
        ${closeX()}
        <div class="rep-success">
          <div class="rep-confetti" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
          <svg class="rep-check-svg" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23"/><path d="M15 27l7 7 15-16"/></svg>
        </div>
        <div class="rep-big-title">${esc(t("reportThanksTitle"))}</div>
        <div class="rep-big-sub">${esc(t("reportThanksSub"))}</div>
        ${st.done.number ? `
        <div class="rep-track">
          <span class="icon icon-info icon-16"></span>
          <div class="rep-track-txt"><div class="rep-track-k">${esc(t("reportTrackLabel"))}</div><div class="rep-track-v">#${esc(st.done.number)}</div></div>
          <button type="button" class="rep-track-copy" data-rep="copyNum" aria-label="${esc(t("copyLabel"))}"><span class="icon icon-copy icon-14"></span></button>
        </div>` : ""}
        <div class="rep-big-sub">${esc(t("reportTrackHint"))}</div>
        <button type="button" class="rep-btn rep-btn--blue rep-btn--wide" data-rep="seeMine"><span class="icon icon-clock icon-14"></span>${esc(t("reportSeeMine"))}</button>
        <button type="button" class="rep-btn rep-btn--outline rep-btn--wide" data-rep="again"><span class="icon icon-send icon-14"></span>${esc(t("reportAnother"))}</button>
        <div class="rep-adventure">
          <span class="icon icon-heart-fill icon-24"></span>
          <div><div class="rep-adventure-title">${esc(t("reportAdventureTitle"))}</div><div class="rep-adventure-sub">${esc(t("reportAdventureText"))}</div></div>
        </div>
        ${coffeeHTML()}
        ${squadHTML()}
      </div>`);
    return;
  }

  // 3 — Sending, step by step
  if (st.sending) {
    const steps = ["reportStep1", "reportStep2", "reportStep3", "reportStep4"];
    paint("sending", `
      <div class="rep-card rep-card--center">
        <div class="rep-sending-ring"><span class="icon icon-send icon-32"></span></div>
        <div class="rep-big-title">${esc(t("reportSendingTitle"))}</div>
        <div class="rep-big-sub">${esc(t("reportSendingSub"))}</div>
        <div class="rep-steps">
          ${steps.map((k, i) => `<div class="rep-step${i < st.phase ? " is-done" : i === st.phase ? " is-now" : ""}"><span class="rep-step-dot"></span><span>${esc(t(k))}</span></div>`).join("")}
        </div>
        <div class="rep-didyouknow">
          <span class="icon icon-bulb icon-18"></span>
          <div><div class="rep-dyk-title">${esc(t("reportDidYouKnow"))}</div><div class="rep-dyk-sub">${esc(t("reportDidYouKnowText"))}</div></div>
        </div>
      </div>`);
    return;
  }

  // 1 — Topic list / My requests
  if (!kindOf(st.kind) || _view === "mine" || _view === "all") {
    const openN = (_mine.list || []).filter(r => CLOSABLE.has(r.status)).length;
    const allOpenN = (_all.list || []).filter(r => CLOSABLE.has(r.status)).length;
    const head = `
        ${closeX()}
        <div class="rep-hero">
          <span class="rep-hero-ico"><span class="icon icon-chat icon-32"></span></span>
          <div><div class="rep-hero-title" id="repHead">${esc(t("reportTitle"))}</div><div class="rep-hero-sub">${esc(t("reportIntro"))}</div></div>
        </div>
        <div class="rep-views" role="tablist">
          <button type="button" class="rep-view${_view === "new" ? " is-on" : ""}" data-rep="view" data-view="new" role="tab" aria-selected="${_view === "new"}"><span class="icon icon-suggestion icon-14"></span>${esc(t("reportTabNew"))}</button>
          <button type="button" class="rep-view${_view === "mine" ? " is-on" : ""}" data-rep="view" data-view="mine" role="tab" aria-selected="${_view === "mine"}"><span class="icon icon-clock icon-14"></span>${esc(t("reportTabMine"))}${openN ? `<span class="rep-view-count">${openN}</span>` : ""}</button>
          <button type="button" class="rep-view${_view === "all" ? " is-on" : ""}" data-rep="view" data-view="all" role="tab" aria-selected="${_view === "all"}"><span class="icon icon-community icon-14"></span>${esc(t("reportTabAll"))}${allOpenN ? `<span class="rep-view-count">${allOpenN}</span>` : ""}</button>
        </div>`;
    if ((_view === "mine" || _view === "all") && _thread) { paint("form", threadHTML()); return; }
    if (_view === "all") { paint("list", `<div class="rep-card">${head}${allHTML()}</div>`); return; }
    if (_view === "mine") { paint("list", `<div class="rep-card">${head}${mineHTML()}</div>`); return; }
    // 1a — Which part of the ecosystem (each lands in its own GitHub repo).
    if (!st.targetPicked) {
      paint("list", `
      <div class="rep-card">
        ${head}
        <div class="rep-step-title">${esc(t("reportTargetPickTitle"))}</div>
        <div class="rep-kind-list">
          ${TARGETS.map(x => `
          <button type="button" class="rep-kind-card rep-kind-card--product" data-rep="target" data-target="${x.id}">
            <span class="rep-kind-ico">${targetIco(x)}</span>
            <span class="rep-kind-txt"><span class="rep-kind-name">${esc(x.label)}</span><span class="rep-kind-hint">${esc(t(`reportTargetHint_${x.id}`))}</span></span>
            <span class="icon icon-chevron-r icon-12 rep-kind-chev"></span>
          </button>`).join("")}
        </div>
        ${coffeeHTML()}
        ${squadHTML()}
      </div>`);
      return;
    }
    // 1b — What kind of request, for that product.
    const tg = TARGETS.find(x => x.id === st.target) || TARGETS[0];
    paint("list", `
      <div class="rep-card">
        ${head}
        <button type="button" class="rep-picked" data-rep="targetReset">
          <span class="icon icon-chevron-l icon-14"></span>
          ${targetIco(tg)}
          <span class="rep-picked-name">${esc(tg.label)}</span>
        </button>
        <div class="rep-kind-list">
          ${KINDS.filter(k => st.target === "studio" || targetable(k.id)).map(k => `
          <button type="button" class="rep-kind-card" style="--kc:${k.c};--kt:${k.tile};--ki:${k.ink}" data-rep="kind" data-kind="${k.id}">
            <span class="rep-kind-ico"><span class="icon icon-${k.icon} icon-20"></span></span>
            <span class="rep-kind-txt"><span class="rep-kind-name">${esc(t(k.label))}</span><span class="rep-kind-hint">${esc(t(k.hint))}</span></span>
            <span class="icon icon-chevron-r icon-12 rep-kind-chev"></span>
          </button>`).join("")}
        </div>
        ${coffeeHTML()}
        ${squadHTML()}
      </div>`);
    return;
  }

  // 2 — The form
  const kind = kindOf(st.kind);
  const errs = st.meta?.errors || [];
  const req = `<span class="rep-req">*</span>`;
  // Printer data is for a Studio bug, improvement or question — not a catalogue fix or a brand.
  const printersHere = st.target === "studio" && !["catalog", "brand"].includes(kind.id) ? (ctx.listPrinters?.() || []) : [];
  paint("form", `
    <div class="rep-card" style="--kc:${kind.c}">
      <div class="rep-topbar">
        <button type="button" class="rep-back" data-rep="kindReset"><span class="icon icon-chevron-l icon-14"></span>${esc(t("reportBack"))}</button>
        ${closeX()}
      </div>
      <div class="rep-form-head">
        <span class="rep-kind-ico rep-kind-ico--big"><span class="icon icon-${kind.icon} icon-24"></span></span>
        <div><div class="rep-form-title" id="repHead">${esc(t(kind.label))}</div><div class="rep-form-lead">${esc(t(kind.lead))}</div></div>
      </div>
      ${kind.id === "catalog" ? `
      <label class="rep-label">${esc(t("reportProdLabel"))} ${req}</label>
      ${st.product ? productCardHTML(st.product) : `
      <div class="rep-prod-search">
        <span class="icon icon-search icon-14"></span>
        <input id="repProdQ" class="rep-input" type="text" value="${esc(st.pq)}" placeholder="${esc(t("reportProdPh"))}" autocomplete="off">
      </div>
      <div class="rep-prod-results" id="repProdResults"></div>`}` : ""}
      ${kind.id === "brand" ? `
      <label class="rep-label" for="repBrandName">${esc(t("reportBrandNameLabel"))} ${req}</label>
      <input id="repBrandName" class="rep-input" type="text" maxlength="80" value="${esc(st.brandName)}" placeholder="${esc(t("reportBrandNamePh"))}">
      <label class="rep-label" for="repBrandSite">${esc(t("reportBrandSiteLabel"))} ${req}</label>
      <input id="repBrandSite" class="rep-input" type="url" maxlength="300" value="${esc(st.brandSite)}" placeholder="${esc(t("reportBrandSitePh"))}">` : `
      <label class="rep-label" for="repTitle">${esc(t(kind.titleLabel))} ${req}</label>
      <input id="repTitle" class="rep-input" type="text" maxlength="200" value="${esc(st.title)}" placeholder="${esc(t(kind.title))}">`}
      <label class="rep-label" for="repBody">${esc(t("reportDescLabel"))}${kind.id === "brand" ? "" : ` ${req}`}</label>
      <div class="rep-editor">
        ${toolbarHTML()}
        <textarea id="repBody" class="rep-textarea" maxlength="20000" placeholder="${esc(t(kind.body))}">${esc(st.body)}</textarea>
      </div>
      ${attachHTML(st, { printers: printersHere, extra: deviceCapturesHTML() })}
      ${infoHTML(st.meta || {})}
      ${errs.length ? `<label class="rep-check"><input type="checkbox" id="repErrors"${st.withErrors ? " checked" : ""}><span>${esc(t("reportAttachErrors", { n: errs.length }))}</span></label>` : ""}
      <label class="rep-check rep-check--public"><input type="checkbox" id="repConsent"${st.consent ? " checked" : ""}><span>${esc(t(TARGETS.find(x => x.id === st.target)?.private && targetable(st.kind) ? "reportPrivateConsent" : "reportPublicConsent"))}</span></label>
      ${st.error ? `<div class="rep-error">${esc(st.error)}</div>` : ""}
      ${squadGateHTML()}
      <div class="rep-foot">
        <button type="button" class="rep-btn rep-btn--ghost" data-rep="cancel">${esc(t("btnCancel"))}</button>
        <button type="button" class="rep-btn rep-btn--send${sendLocked() || !canSend() ? " is-locked" : ""}" id="repSend" data-rep="send"${st.sending ? " disabled" : ""}><span class="icon icon-send icon-14"></span>${esc(t(kind.send))}</button>
      </div>
      <div class="rep-anon"><span class="icon icon-lock icon-12"></span>${esc(t("reportAnon"))}</div>
    </div>`);
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function send() {
  if (!canSend()) return;
  st.sending = true; st.error = ""; st.phase = 0; render();
  const step = async (n, min = 300) => { const t0 = Date.now(); return async () => { const d = Date.now() - t0; if (d < min) await wait(min - d); st.phase = n; render(); }; };
  try {
    // 1 — the message
    let next = await step(1);
    const title = st.kind === "brand" ? st.brandName.trim() : st.title.trim();
    await next();
    // 2 — system information, fresh at send time (the card may have been opened
    // before the printers or the view were what they are now)
    next = await step(2);
    try { st.meta = await ctx.getMeta(); } catch (_) {}
    const m = st.meta || {};
    await next();
    // 3 — the request itself
    next = await step(3);
    const j = await authedPost(ENDPOINT, {
      kind: st.kind, target: targetable(st.kind) ? st.target : undefined, publicConsent: true, title, body: st.body.trim(),
      images: st.images,
      pdfs: st.pdfs.map(f => ({ name: f.name, data: f.data })),
      jsons: (st.jsons || []).map(f => ({ name: f.name, text: f.text })),
      product: st.kind === "catalog" && st.product ? st.product : undefined,
      brand: st.kind === "brand" ? { name: st.brandName.trim(), website: st.brandSite.trim() } : undefined,
      meta: { appVersion: m.appVersion, os: m.os, view: m.view, page: m.page, screen: m.screen, lang: m.lang, printers: m.printers,
              errors: st.withErrors ? (m.errors || []) : [],
              // The devices of this product and the printers each one follows.
              devices: targetable(st.kind) && st.target === "tigerspool" ? spoolReportDevices()
                     : targetable(st.kind) && st.target === "tigertouch" ? touchReportDevices() : undefined },
    });
    await next();
    // 4 — wrap up
    await wait(300);
    st.done = { number: j.number, url: j.url };
    syncReports();   // the new one shows up in "My requests"
  } catch (e) {
    st.error = t(e.code === "RATE_LIMITED" ? "reportErrLimit" : e.code === "UNAUTHENTICATED" ? "reportNeedLogin" : e.code === "SQUAD_REQUIRED" ? "reportSquadGateTitle" : "reportErrSend");
  }
  st.sending = false;
  render();
}

// ── Annotator ─────────────────────────────────────────────────────────────────
// The editor itself lives in annotator.js; the edited image replaces the shot.
async function annotate(index) {
  const d = D();
  const out = await openAnnotator({ src: d.images[index], t, esc });
  if (out && d) { d.images[index] = out; render(); }
}
