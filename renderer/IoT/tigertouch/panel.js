/**
 * renderer/IoT/tigertouch/panel.js — what a click on the Tiger Touch glyph opens.
 *
 *   • at least one screen → the side card: each screen (status, Wi-Fi, battery
 *     fitted, firmware, address), its LAN mode (Live view, Screenshot) and the printers it follows — the TigerSpool card's printer rows, with
 *     the dot the SCREEN sees (`printers_online`), never Studio's own link.
 *   • none yet → the Tiger Touch sheet.
 *
 * Screenshot: main.js `tigertouch:screenshot` fetches /screen.bmp?c=CODE from the
 * main process (the screen sends no CORS header, so the renderer cannot), turns
 * it into a PNG, and the preview modal offers Save, Copy, and "Report a problem"
 * — the report card pre-filled with the picture and the Tiger Touch repo.
 *
 * `lan_access_code` / `lan_url` are secrets: never drawn, read from the live
 * document on click only, never logged nor put in the raw-JSON copy.
 */

import { W, H, screenBase, fetchRaw, waitChange, touch as sendTouch, decodeRle565, grabScreen } from "./screen.js";

const PHOTO_CARD = "../assets/img/TigerTouch_card.png";

const BRAND_LABEL = {
  bambulab: "Bambu Lab", creality: "Creality", elegoo: "Elegoo", flashforge: "FlashForge",
  snapmaker: "Snapmaker", anycubic: "Anycubic", prusa: "Prusa", klipper: "Klipper", octoprint: "OctoPrint",
};
const SECRET_KEYS = ["lan_access_code", "lan_url"];

let _ctx = null;
let _helpers = null;
const hasDevice = () => typeof window.tigertouch?.screenshot === "function";   // desktop build only

export function initTigerTouchPanel(ctx, helpers) {
  _ctx = ctx; _helpers = helpers;
  const $ = id => document.getElementById(id);
  $("tigertouchPanelClose")?.addEventListener("click", closeTigerTouchPanel);
  $("tigertouchOverlay")?.addEventListener("click", closeTigerTouchPanel);
  $("tigertouchShotClose")?.addEventListener("click", closeShot);
  $("tigertouchShotOverlay")?.addEventListener("click", e => {
    if (e.target.id === "tigertouchShotOverlay") closeShot();
  });
  $("tigertouchShotBody")?.addEventListener("click", onShotClick);
  $("tigertouchPanelBody")?.addEventListener("click", onPanelClick);
  $("tigertouchLiveClose")?.addEventListener("click", closeLive);
  $("tigertouchLiveOverlay")?.addEventListener("click", e => {
    if (e.target.id === "tigertouchLiveOverlay") closeLive();
  });
  $("tigertouchLiveBody")?.addEventListener("click", e => {
    if (!e.target.closest("[data-live=shot]") || !_live) return;
    const s = docOf(_live.mac);
    if (s) takeShot(s);
  });
}

const docOf = mac => _ctx.state.tigertouchs.find(x => x.mac === mac);

function flash(btn, cls = "pp-copy--ok") {
  btn.classList.add(cls);
  setTimeout(() => btn.classList.remove(cls), 900);
}

function onPanelClick(e) {
  const btn = e.target.closest("[data-ttc-act]");
  if (btn) {
    e.preventDefault(); e.stopPropagation();
    const s = docOf(btn.dataset.mac);
    if (!s) return;
    const act = btn.dataset.ttcAct;
    if (act === "live") {
      openLive(s);
    } else if (act === "shot") {
      takeShot(s);
    } else if (act === "json") {
      // Raw document minus the LAN secrets: a debug copy ends up pasted in issues.
      const clean = { ...s };
      SECRET_KEYS.forEach(k => { if (clean[k] != null) clean[k] = "•••"; });
      try { navigator.clipboard.writeText(JSON.stringify(clean, null, 2)); flash(btn); } catch (_) {}
    }
    return;
  }
  const row = e.target.closest("[data-ttc-printer]");
  if (!row || !row.dataset.brand) return;
  closeTigerTouchPanel();
  _ctx.openPrinterDetail?.(row.dataset.brand, row.dataset.ttcPrinter);
}

/** The glyph's click: the side card when there is a screen, else the Tiger
 *  Touch sheet of the ecosystem window (what it is, how to install it). */
export function openTigerTouch() {
  if (_ctx.state.tigertouchs.length) openTigerTouchPanel();
  else _ctx.openEcoSheet?.("touch");
}

// ── Side card ──────────────────────────────────────────────────────────────

export function isTigerTouchPanelOpen() {
  return !!document.getElementById("tigertouchPanel")?.classList.contains("open");
}

function openTigerTouchPanel() {
  renderTigerTouchPanel(true);
  document.getElementById("tigertouchPanel")?.classList.add("open");
  document.getElementById("tigertouchOverlay")?.classList.add("open");
}

export function closeTigerTouchPanel() {
  document.getElementById("tigertouchPanel")?.classList.remove("open");
  document.getElementById("tigertouchOverlay")?.classList.remove("open");
}

let _panelSig = "";
const _debugOpen = new Set();

export function renderTigerTouchPanel(force = false) {
  const body = document.getElementById("tigertouchPanelBody");
  if (!body) return;
  const { state } = _ctx;
  const list = state.tigertouchs;
  if (!list.length) { closeTigerTouchPanel(); return; }

  const sig = JSON.stringify([state.lang, !!state.debugEnabled, state.debugEnabled ? list : null,
    list.map(s => [s.mac, _helpers.connState(s), s.display_name, s.printer_ids, s.printers_online, s.demo,
      s.wifi_signal_dbm, s.battery_present, s.fw_version, s.ip_address, s.lan_live, s.lan_url, s.lan_access_code]),
    state.printers.map(p => [p.id, p.printerName, p.printerModelId])]);
  if (!force && sig === _panelSig) return;
  _panelSig = sig;

  const rank = { active: 0, standby: 1, offline: 2 };
  const ordered = [...list].sort((a, b) => rank[_helpers.connState(a)] - rank[_helpers.connState(b)]
    || String(a.display_name || a.mac).localeCompare(String(b.display_name || b.mac)));
  body.innerHTML = ordered.map(cardHtml).join("");
  wireRemoveButtons(body);
  body.querySelectorAll("details.scale-debug[data-ttc-debug]").forEach(det => {
    det.addEventListener("toggle", () => {
      if (det.open) _debugOpen.add(det.dataset.ttcDebug); else _debugOpen.delete(det.dataset.ttcDebug);
    });
  });
}

function debugHtml(s) {
  const { state, t, esc, highlight } = _ctx;
  if (!state.debugEnabled) return "";
  const shown = { ...s };
  SECRET_KEYS.forEach(k => { if (shown[k] != null) shown[k] = "•••"; });
  const json = JSON.stringify(shown, null, 2);
  return `<details class="scale-debug" data-ttc-debug="${esc(s.mac)}"${_debugOpen.has(s.mac) ? " open" : ""}>
      <summary class="scale-debug-summary">Raw JSON (debug)</summary>
      <div class="pp-raw-wrap tsp-raw-wrap">
        <button type="button" class="pp-raw-copy pp-copy" data-ttc-act="json" data-mac="${esc(s.mac)}" aria-label="${esc(t("copyLabel"))}">
          <span class="icon icon-copy icon-13"></span><span>${esc(t("copyLabel"))}</span>
        </button>
        <pre class="json scale-debug-pre">${highlight ? highlight(json) : esc(json)}</pre>
      </div>
    </details>`;
}

/* Remove = delete users/{uid}/tigertouchs/{mac}. A screen still signed in writes
   its next beat as an upsert and comes back: this is for a screen that is off,
   sold or reset. */
function wireRemoveButtons(body) {
  const { state, fbDb, setupHoldToConfirm, reportError } = _ctx;
  body.querySelectorAll(".scale-card-btn[data-ttc-remove]").forEach(btn => {
    setupHoldToConfirm?.(btn, 1500, async () => {
      const mac = btn.dataset.ttcRemove;
      const uid = state.activeAccountId;
      if (!mac || !uid) return;
      try {
        await fbDb(uid).collection("users").doc(uid).collection("tigertouchs").doc(mac).delete();
      } catch (e) { reportError?.("tigertouch.delete", e); }
    });
  });
}

function formatMac(raw) {
  const clean = String(raw || "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  return clean ? clean.match(/.{1,2}/g).join(":") : "";
}

function pillClass(cs) { return cs === "active" ? "is-online" : cs === "standby" ? "is-standby" : "is-offline"; }

/** TELEMETRY.md: the TigerScale's bars, 0-5. */
function wifiBars(dbm) { return Math.floor((Math.min(-40, Math.max(-100, dbm)) + 100) * 5 / 60); }

function chipsHtml(s, cs) {
  const { t, esc } = _ctx;
  const online = cs !== "offline";
  const chips = [];
  const dbm = s.wifi_signal_dbm;
  if (typeof dbm === "number" && isFinite(dbm) && dbm !== 0) {
    const bars = wifiBars(dbm);
    chips.push(`<span class="scale-chip scale-chip--wifi scale-chip--wifi-${online ? "ok" : "off"}" data-tooltip="${esc(`${bars}/5 · ${dbm} dBm`)}">`
      + `<span class="icon icon-wifi icon-13" aria-hidden="true"></span></span>`);
  }
  // Declared by the owner, not measured: no level, no charging state.
  if (s.battery_present === true) {
    chips.push(`<span class="scale-chip scale-chip--power"><span class="icon icon-battery icon-12"></span>`
      + `<span class="scale-chip-text">${esc(t("tigertouchBatteryFitted"))}</span></span>`);
  }
  if (s.fw_version) {
    chips.push(`<span class="scale-chip scale-chip--fw"><span class="icon icon-settings icon-12"></span>`
      + `<span class="scale-chip-text">v${esc(String(s.fw_version))}</span></span>`);
  }
  if (s.ip_address) {
    chips.push(`<span class="scale-chip"><span class="scale-chip-text">${esc(String(s.ip_address))}</span></span>`);
  }
  if (!online) {
    const ms = _helpers.tsToMs(s.last_heartbeat_at);
    if (ms) chips.push(`<span class="scale-chip scale-chip--seen"><span class="icon icon-clock icon-12"></span>`
      + `<span class="scale-chip-text">${esc(_helpers.agoString(ms))}</span></span>`);
  }
  return chips.join("");
}

/* Live view + Screenshot — the access code itself is never drawn (founder's call).
   Desktop only: the screen is plain http on the LAN, which the web build (https)
   may not fetch. Available while `lan_live` is true and `lan_url` is set. */
function lanHtml(s, cs) {
  const { t, esc } = _ctx;
  if (!hasDevice()) return "";
  const mac = esc(s.mac);
  if (s.lan_live === false) {
    return `<div class="ttc-lan"><div class="ttc-lan-off"><span class="icon icon-eye-off icon-13"></span>${esc(t("tigertouchLiveOff"))}</div></div>`;
  }
  const ready = cs !== "offline" && !!screenBase(s);
  return `<div class="ttc-lan">
      <div class="ttc-lan-btns">
        <button type="button" class="ttc-btn ttc-btn--primary" data-ttc-act="live" data-mac="${mac}"${ready ? "" : " disabled"}>
          <span class="icon icon-eye-on icon-14"></span><span>${esc(t("tigertouchLiveView"))}</span></button>
        <button type="button" class="ttc-btn" data-ttc-act="shot" data-mac="${mac}"${ready ? "" : " disabled"}>
          <span class="icon icon-camera icon-14"></span><span>${esc(t("tigertouchScreenshot"))}</span></button>
      </div>
    </div>`;
}

function dotHtml(dot) {
  const { t, esc } = _ctx;
  const label = dot === "up" ? t("tigerspoolPrinterUp") : dot === "down" ? t("tigerspoolPrinterDown") : t("tigerspoolPrinterUnknown");
  return `<span class="tsp-dot tsp-dot--${dot}" data-tooltip="${esc(label)}"></span>`;
}

function printerRowHtml(id, dot) {
  const { state, t, esc } = _ctx;
  const p = state.printers.find(x => x.id === id);
  if (!p) {
    return `<div class="tsp-printer is-missing">` + dotHtml(dot)
      + `<span class="tsp-printer-img tsp-printer-img--none"></span>`
      + `<span class="tsp-printer-text"><span class="tsp-printer-name">${esc(t("tigerspoolPrinterMissing"))}</span>`
      + `<span class="tsp-printer-sub">${esc(id)}</span></span></div>`;
  }
  const img = _ctx.printerImageUrlFor?.(p.brand, p.printerModelId);
  const model = _ctx.printerModelName?.(p.brand, p.printerModelId) || "";
  const name = p.printerName || model || BRAND_LABEL[p.brand] || p.brand;
  const sub = [BRAND_LABEL[p.brand] || p.brand, model !== name ? model : ""].filter(Boolean).join(" · ");
  return `<button type="button" class="tsp-printer" data-ttc-printer="${esc(p.id)}" data-brand="${esc(p.brand)}">`
    + dotHtml(dot)
    + (img ? `<img class="tsp-printer-img" src="${esc(img)}" alt="" draggable="false" />`
           : `<span class="tsp-printer-img tsp-printer-img--none"></span>`)
    + `<span class="tsp-printer-text"><span class="tsp-printer-name">${esc(name)}</span>`
    + `<span class="tsp-printer-sub">${esc(sub)}</span></span>`
    + `<span class="tsp-printer-go" aria-hidden="true">›</span></button>`;
}

function cardHtml(s) {
  const { t, esc } = _ctx;
  const cs = _helpers.connState(s);
  const ids = Array.isArray(s.printer_ids) ? s.printer_ids : [];
  const online = (cs !== "offline" && Array.isArray(s.printers_online)) ? s.printers_online : null;
  const dotFor = id => online ? (online.includes(id) ? "up" : "down") : "unknown";
  const printers = s.demo === true
    ? `<div class="tsp-printers-empty ttc-demo">${esc(t("tigertouchDemoNote"))}</div>`
    : ids.length ? ids.map(id => printerRowHtml(id, dotFor(id))).join("")
    : `<div class="tsp-printers-empty">${esc(t("tigertouchNoPrinters"))}</div>`;
  return `<div class="tsp-entry">
    <div class="scale-card${cs !== "offline" ? " is-online" : ""}">
      <div class="scale-card-head">
        <img class="scale-card-photo ttc-card-photo" src="${PHOTO_CARD}" alt="" draggable="false" />
        <div class="scale-card-id">
          <div class="scale-card-name-row">
            <span class="scale-card-name">${esc(s.display_name || "Tiger Touch")}</span>
            <span class="scale-card-status-pill ${pillClass(cs)}">
              <span class="scale-card-status-dot"></span>
              <span class="scale-card-status-pill-text">${esc(_helpers.statusLabel(cs))}</span>
            </span>
          </div>
          <div class="scale-card-mac">${esc(formatMac(s.mac))}</div>
        </div>
        <div class="scale-card-actions">
          <button class="scale-card-btn" data-ttc-remove="${esc(s.mac)}" aria-label="${esc(t("tigertouchRemove"))}">
            <span class="hold-progress"></span>
            <span class="icon icon-trash icon-13"></span>
          </button>
        </div>
      </div>
      <div class="scale-card-chips">${chipsHtml(s, cs)}</div>
      ${lanHtml(s, cs)}
      <div class="tsp-printers">
        <div class="tsp-printers-title">${esc(t("tigerspoolPrintersTitle", { n: s.demo === true ? 0 : ids.length }))}</div>
        ${printers}
      </div>
      ${debugHtml(s)}
    </div>
  </div>`;
}

// ── Live view ──────────────────────────────────────────────────────────────
// Tiger-Touch LAN-MODE.md: the whole screen once (rle565, ≈30 KB), then a
// long-poll that returns when the screen has changed AND settled, then only the
// changed rectangle — no polling interval. A click / drag on the canvas is a tap
// / swipe; its answer comes once the screen settled, so the next rectangle is
// fetched at once. At most two connections (the loop + a touch): the screen
// keeps four. A firmware from before rle565 falls back to main.js's BMP path.

let _live = null;   // { mac, run } while the live view is open

const MSG_KEY = { code: "tigertouchShotErrCode", locked: "tigertouchShotErrLocked", unreachable: "tigertouchShotErrNetwork", off: "tigertouchLiveOff" };

function openLive(s) {
  const { t, esc } = _ctx;
  const body = document.getElementById("tigertouchLiveBody");
  if (!body) return;
  closeLive();
  document.getElementById("tigertouchLiveTitle").textContent = s.display_name || "Tiger Touch";
  body.innerHTML = `<div class="ttc-shot-frame ttc-live-frame"><canvas width="${W}" height="${H}" hidden></canvas>
      <span class="ttc-spinner"></span><span class="ttc-live-msg" hidden></span></div>
    <div class="ttc-shot-actions"><span class="ttc-live-hint">${esc(t("tigertouchLiveHint"))}</span>
      <button type="button" class="ttc-btn" data-live="shot"><span class="icon icon-camera icon-14"></span><span>${esc(t("tigertouchScreenshot"))}</span></button></div>`;
  const run = { stop: false, ctl: null, kicked: false };
  _live = { mac: s.mac, run };
  wireTouch(body.querySelector(".ttc-live-frame"), run);
  document.getElementById("tigertouchLiveOverlay")?.classList.add("open");
  liveLoop(run);
}

function closeLive() {
  if (_live) { _live.run.stop = true; _live.run.ctl?.abort(); }
  _live = null;
  document.getElementById("tigertouchLiveOverlay")?.classList.remove("open");
}

const sleep = (run, ms) => new Promise(r => { const id = setTimeout(r, ms); run.wake = () => { clearTimeout(id); r(); }; });

async function liveLoop(run) {
  const { t } = _ctx;
  const frame = document.querySelector("#tigertouchLiveBody .ttc-live-frame");
  const canvas = frame.querySelector("canvas"), g = canvas.getContext("2d");
  const msg = frame.querySelector(".ttc-live-msg"), spin = frame.querySelector(".ttc-spinner");
  const img = new ImageData(W, H);
  let ver = null, codeRetried = false, misses = 0;
  const show = () => { canvas.hidden = false; spin.hidden = true; msg.hidden = true; frame.classList.remove("is-stale"); };
  const fail = key => { msg.textContent = t(key); msg.hidden = false; spin.hidden = true; frame.classList.add("is-stale"); };

  while (!run.stop && _live?.run === run) {
    const s = docOf(_live.mac);   // read every turn: the code can change on the screen
    if (!s) break;
    run.ctl = new AbortController();
    try {
      if (ver == null) {
        const f = await fetchRaw(s, { signal: run.ctl.signal });
        decodeRle565(f.bytes, img, f.rect.w ? f.rect : { x: 0, y: 0, w: W, h: H });
        g.putImageData(img, 0, 0);
        ver = f.ver;
      } else {
        if (!run.kicked) await waitChange(s, ver, { signal: run.ctl.signal });
        run.kicked = false;
        const f = await fetchRaw(s, { since: ver, signal: run.ctl.signal });
        if (f.rect.w && f.rect.h) {
          decodeRle565(f.bytes, img, f.rect);
          g.putImageData(img, 0, 0, f.rect.x, f.rect.y, f.rect.w, f.rect.h);
        }
        if (f.ver) ver = f.ver;
      }
      show(); codeRetried = false; misses = 0;
    } catch (e) {
      if (run.stop) break;
      const kind = e?.kind || "unreachable";
      if (kind === "aborted") continue;                      // a touch asked for the next picture now
      if (kind === "old") return legacyLoop(run, frame);
      if (kind === "busy") { await sleep(run, 1000); continue; }   // no memory for a picture right now
      if (kind === "code" && !codeRetried) { codeRetried = true; await sleep(run, 1500); continue; }   // re-read the document, once
      fail(MSG_KEY[kind] || "tigertouchShotErrNetwork");
      if (kind === "locked") { await sleep(run, 60000); continue; }
      misses++;
      await sleep(run, Math.min(15000, 1000 * 2 ** Math.min(misses, 4)));   // back off, never a tight loop
      ver = null;
    }
  }
}

/* Firmware without rle565: the 1.1 MB BMP through main.js, a few seconds a frame. */
async function legacyLoop(run, frame) {
  const canvas = frame.querySelector("canvas"), g = canvas.getContext("2d");
  const msg = frame.querySelector(".ttc-live-msg"), spin = frame.querySelector(".ttc-spinner");
  let ver = null;
  run.legacy = true;
  while (!run.stop && _live?.run === run) {
    const s = docOf(_live.mac);
    if (!s) break;
    let res;
    try { res = await window.tigertouch.frame(s.ip_address, s.lan_access_code, ver); }
    catch (_) { res = { ok: false, error: "unreachable" }; }
    if (run.stop) break;
    if (res?.ok) {
      if (res.dataUrl) {
        const im = new Image();
        await new Promise(r => { im.onload = im.onerror = r; im.src = res.dataUrl; });
        g.drawImage(im, 0, 0, W, H);
        canvas.hidden = false;
      }
      ver = res.ver; spin.hidden = true; msg.hidden = true;
      await sleep(run, 200);
    } else {
      msg.textContent = _ctx.t(MSG_KEY[res?.error] || "tigertouchShotErrNetwork"); msg.hidden = false; spin.hidden = true;
      await sleep(run, res?.error === "locked" ? 60000 : 3000);
    }
  }
}

/** Click = tap, drag = swipe, in the screen's own 800×480 pixels. */
function wireTouch(frame, run) {
  let start = null;
  const at = e => {
    const c = frame.querySelector("canvas");
    const r = c.getBoundingClientRect();
    if (c.hidden || !r.width) return null;
    const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    return x < 0 || y < 0 || x > W - 1 || y > H - 1 ? null : { x, y };
  };
  frame.addEventListener("pointerdown", e => {
    const p = at(e);
    if (!p) return;
    start = { ...p, t: performance.now() };
    frame.setPointerCapture(e.pointerId);
  });
  frame.addEventListener("pointerup", async e => {
    if (!start || !_live) { start = null; return; }
    const from = start; start = null;
    const to = at(e) || from;
    const s = docOf(_live.mac);
    if (!s) return;
    const moved = Math.hypot(to.x - from.x, to.y - from.y) > 10;
    const t = moved ? { x: from.x, y: from.y, x2: to.x, y2: to.y, ms: performance.now() - from.t } : { x: from.x, y: from.y };
    frame.classList.add("is-touched");
    setTimeout(() => frame.classList.remove("is-touched"), 160);
    try {
      if (run.legacy) { await window.tigertouch.touch(s.ip_address, s.lan_access_code, t); run.wake?.(); return; }
      await sendTouch(s, t);       // answers once the screen settled
      run.kicked = true;           // → fetch the changed rectangle now
      run.ctl?.abort(); run.wake?.();
    } catch (_) { /* the loop reports the screen's state */ }
  });
  frame.addEventListener("pointercancel", () => { start = null; });
}

// ── Screenshot ─────────────────────────────────────────────────────────────

let _shot = null;   // { key, name, target, prefix, capture, closeHost?, dataUrl } — the picture in the modal

/** The screen as a PNG data URL: rle565 (≈0.2 s), else the BMP path of an older firmware. */
async function captureScreen(s) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { img } = await grabScreen(s);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      c.getContext("2d").putImageData(img, 0, 0);
      return { ok: true, dataUrl: c.toDataURL("image/png") };
    } catch (e) {
      const kind = e?.kind || "unreachable";
      if (kind === "old") return window.tigertouch.screenshot(s.ip_address, s.lan_access_code);
      if (kind === "busy") { await new Promise(r => setTimeout(r, 1000)); continue; }
      if (kind === "code" && attempt === 0) { await new Promise(r => setTimeout(r, 1500)); s = docOf(s.mac) || s; continue; }
      return { ok: false, error: kind };
    }
  }
  return { ok: false, error: "busy" };
}

/* For the report card: the screens a capture can be taken from right now, and
   the capture itself (a PNG data URL) — the same path as the Screenshot button. */
export function tigerTouchScreensReady() {
  if (!_ctx || !hasDevice()) return [];
  return _ctx.state.tigertouchs
    .filter(s => _helpers.connState(s) !== "offline" && screenBase(s))
    .map(s => ({ mac: s.mac, name: s.display_name || "Tiger Touch" }));
}
export async function captureTigerTouch(mac) {
  const s = docOf(mac);
  if (!s) return { ok: false, error: "unreachable" };
  try { return await captureScreen(s); } catch (_) { return { ok: false, error: "unreachable" }; }
}

function takeShot(s) {
  return showScreenshot({
    key: s.mac, name: s.display_name || "Tiger Touch", target: "tigertouch", prefix: "tiger-touch", aspect: "800 / 480",
    capture: () => captureScreen(docOf(s.mac) || s),
  });
}

/* The screenshot preview — Save / Copy / Report a problem / Retake — shared by
   every device with a screen (Tiger Touch here, Tiger Spool from its card):
   `capture()` resolves with { ok, dataUrl } or { ok: false, error }. */
export async function showScreenshot({ key, name, target, prefix, aspect, capture, closeHost }) {
  const { t, esc } = _ctx;
  const body = document.getElementById("tigertouchShotBody");
  if (!body) return;
  const shot = _shot = { key, name, target, prefix, aspect, capture, closeHost, dataUrl: null };
  const frameStyle = `style="aspect-ratio:${esc(aspect || "800 / 480")}"`;
  body.innerHTML = `<div class="ttc-shot-frame ttc-shot-frame--loading" ${frameStyle}><span class="ttc-spinner"></span></div>`;
  /* Above whatever window asked for it. The live screens of the Tiger Touch and
     the Tiger Scale are overlays of the same level, added to the page later than
     this one — the later one wins, so the picture opened BEHIND the live view.
     Moved to the end of the page each time (its listeners go with it). */
  const overlay = document.getElementById("tigertouchShotOverlay");
  if (overlay) {
    if (overlay !== document.body.lastElementChild) document.body.appendChild(overlay);
    overlay.classList.add("open");
  }
  let res;
  try { res = await capture(); }
  catch (_) { res = { ok: false, error: "unreachable" }; }
  if (_shot !== shot) return;   // closed or replaced meanwhile
  if (!res?.ok) {
    body.innerHTML = `<div class="ttc-shot-frame ttc-shot-frame--err" ${frameStyle}><span class="icon icon-wifi icon-20"></span><span>${esc(t(MSG_KEY[res?.error] || "tigertouchShotErrNetwork"))}</span></div>
      <div class="ttc-shot-actions"><button type="button" class="ttc-btn" data-shot="retake"><span class="icon icon-refresh icon-14"></span><span>${esc(t("tigertouchShotRetake"))}</span></button></div>`;
    return;
  }
  shot.dataUrl = res.dataUrl;
  const btn = (act, icon, k, primary) =>
    `<button type="button" class="ttc-btn${primary ? " ttc-btn--primary" : ""}" data-shot="${act}"><span class="icon icon-${icon} icon-14"></span><span>${esc(t(k))}</span></button>`;
  body.innerHTML = `<div class="ttc-shot-frame" ${frameStyle}><img src="${res.dataUrl}" alt="" draggable="false" /></div>
    <div class="ttc-shot-actions">
      ${btn("save", "download", "tigertouchShotSave", true)}
      ${btn("copy", "copy", "copyLabel")}
      ${btn("report", "bug", "tigertouchShotReport")}
      ${btn("retake", "refresh", "tigertouchShotRetake")}
    </div>`;
}

/** <prefix>-YYYYMMDD-HHMMSS.png, local time (tiger-touch-…, tiger-spool-…). */
function shotName(prefix = "tiger-touch") {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}

async function onShotClick(e) {
  const btn = e.target.closest("[data-shot]");
  if (!btn || !_shot) return;
  const act = btn.dataset.shot;
  if (act === "retake") { showScreenshot({ ..._shot }); return; }
  if (!_shot.dataUrl) return;
  if (act === "save") {
    const res = await window.tigertouch.savePng(_shot.dataUrl, shotName(_shot.prefix));
    if (res?.ok) flash(btn, "ttc-btn--ok");
  } else if (act === "copy") {
    try {
      const blob = await (await fetch(_shot.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash(btn, "ttc-btn--ok");
    } catch (_) { /* clipboard refused */ }
  } else if (act === "report") {
    const images = [_shot.dataUrl], target = _shot.target || "tigertouch", closeHost = _shot.closeHost || closeTigerTouchPanel;
    closeShot(); closeHost();
    _ctx.openReport?.({ target, kind: "bug", images });
  }
}

function closeShot() {
  _shot = null;
  document.getElementById("tigertouchShotOverlay")?.classList.remove("open");
}

