// TigerCoins pulls — opening surprise envelopes, "Tiger Arcade Jackpot" style
// (gacha × casino). The result is drawn and recorded by the backend
// (functions/tigerCoins.js) BEFORE anything is shown: the show never decides.
//
// openPullStage: the stage — no panel, a spotlight, the big red envelope
//   (assets/img/tigercoins/envelope.webp). HOLD it to open one, or hold
//   "Open ×N" 2 s for up to ten (a click alone does nothing); the backend draws 1 to 10.
// revealPulls: what a pull, a chest, a gift or a code gave.
//   ×1 — the envelope shakes while its glow runs once through every rarity
//        colour, grey to gold, the same for every draw (nothing gives the result
//        away), cracks, and the card pops out of it in
//        its rarity's MATERIAL: matte paper (common), green enamel (uncommon),
//        blue holo (rare), purple neon (epic), solid gold jackpot (legendary:
//        crown, turning rays, screen flash, coin rain). Coins fly to the balance.
//   ×N — a fan of face-down cards flipped in cascade (150 ms each), a pause on
//        an epic or a legendary, then the total and the best one.
// Sound: coin-sound.js (Web Audio, mutable). prefers-reduced-motion: no
// shake, flight, rain or rays — a short fade, the rarity and the amount.

import { ambientStart, ambientStop, holdRise, setSound, sfx, soundOn, warmSound } from "./coin-sound.js";

const ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const COLORS = ["#9aa3bd", "#3ddc84", "#3d8bff", "#a855f7", "#ffb21a"];
const SPARKS = [4, 8, 14, 26, 44];
const HOLD_MS = 650;
// ×10 asks for a real effort: a 2 s hold, the button straining harder and harder.
const HOLD_TEN_MS = 2000;
const IMG = "../assets/img/tigercoins/";

const wait = ms => new Promise(r => setTimeout(r, ms));
const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const rankOf = x => Math.max(0, ORDER.indexOf(x?.rarity));

// ── The overlay and its frame ──────────────────────────────────────────────

function overlay() {
  warmSound();   // the audio engine is awake before the first hold
  const el = document.createElement("div");
  el.className = "tc-reveal tp";
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-open"));
  return el;
}
function closeOverlay(el) {
  ambientStop();   // the stage's music fades out with it
  el.classList.remove("is-open");
  setTimeout(() => el.remove(), 220);
}
// Closes every open stage at once (the account left the squad, or another account took over).
// A discovery the member did not ask for by clicking it (an easter egg found by
// rapid clicks, a friend's envelope arriving) must not be skipped by the clicks
// still coming: the overlay swallows every pointer and key press for `ms`.
export function guardInput(el, ms = 2000) {
  const until = performance.now() + ms;
  const stop = e => { if (performance.now() < until) { e.stopImmediatePropagation(); e.preventDefault(); } };
  for (const type of ["pointerdown", "mousedown", "mouseup", "click", "pointerup"]) el.addEventListener(type, stop, true);
  const key = e => { if (performance.now() < until && el.isConnected) { e.stopImmediatePropagation(); e.preventDefault(); } };
  document.addEventListener("keydown", key, true);
  setTimeout(() => document.removeEventListener("keydown", key, true), ms + 50);
}
// An easter egg found: a secret's own moment before the pile opens — the room
// dims, golden rays turn, the envelope flies out of its hiding place (`from`, a
// DOMRect) to the centre and swells, sparks burst, "Secret found!" lands with a
// fanfare; ~2.4 s, every click swallowed, then it fades and resolves.
export function celebrateEgg(ctx, from) {
  const { t, esc } = ctx;
  return new Promise(resolve => {
    warmSound();
    const el = document.createElement("div");
    el.className = "egg-fx";
    const x = from ? from.left + from.width / 2 : innerWidth / 2, y = from ? from.top + from.height / 2 : innerHeight / 2;
    el.style.setProperty("--fx", `${x - innerWidth / 2}px`);
    el.style.setProperty("--fy", `${y - innerHeight / 2}px`);
    const sparks = Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${110 + (i % 3) * 40}px;--s:${8 + (i % 4) * 3}px"></i>`).join("");
    el.innerHTML = `
      <div class="egg-fx-rays" aria-hidden="true"></div>
      <div class="egg-fx-stage">
        <span class="egg-fx-sparks" aria-hidden="true">${sparks}</span>
        <img class="egg-fx-env" src="${IMG}envelope.webp" alt="" aria-hidden="true">
      </div>
      <div class="egg-fx-text" role="status"><b>${esc(t("eggFoundTitle"))}</b><small>${esc(t("eggFoundSub"))}</small></div>`;
    document.body.appendChild(el);
    guardInput(el, 2600);
    requestAnimationFrame(() => el.classList.add("is-on"));
    setTimeout(() => { sfx.impact?.(3); }, 450);
    setTimeout(() => { sfx.rarity?.(4); }, 700);
    const quick = reduced() ? 1200 : 2400;
    setTimeout(() => { el.classList.add("is-out"); setTimeout(() => { el.remove(); resolve(); }, 350); }, quick);
  });
}

// Big moments in a modal window — an animation behind the window (.agents/rules/ui-ux-defaults.md;
// not for a stage with no window, like the chest or a reveal):
// huge translucent copies of the moment's art swell from the card and fade in
// staggered waves, drawn on the overlay under everything else (z-index -1 in the
// overlay's own layer), until the overlay goes. `at`: "bottom" rises from under the
// card (a flame), "center" radiates from its middle (a chest, a coin, an envelope).
// Reduced motion: nothing.
// `dur` = one wave's life in seconds; `soft` = a calmer, smoother swell (ease in-out, lighter).
export function backfire(overlayEl, cardEl, src, { at = "center", size = 520, waves = 3, dur = 2.1, soft = false } = {}) {
  if (!overlayEl || !cardEl || !src || reduced()) return null;
  const r = cardEl.getBoundingClientRect(), fire = document.createElement("div");
  fire.className = `bk-fire bk-fire--${at}${soft ? " bk-fire--soft" : ""}`;
  fire.setAttribute("aria-hidden", "true");
  fire.style.left = `${r.left + r.width / 2}px`;
  fire.style.top = `${at === "bottom" ? r.bottom - r.height * .15 : r.top + r.height / 2}px`;
  fire.style.setProperty("--bk-size", `${size}px`);
  fire.style.setProperty("--bk-dur", `${dur}s`);
  fire.innerHTML = Array.from({ length: waves }, (_, i) => `<img src="${src}" alt="" style="animation-delay:${(i * dur / waves).toFixed(2)}s">`).join("");
  overlayEl.insertBefore(fire, overlayEl.firstChild);
  return fire;
}

export function closePullStages() { document.querySelectorAll(".tc-reveal").forEach(closeOverlay); }

// The stage frame (floating over the dimmed app, no panel): the sound toggle,
// the stage with its spotlight and effects canvas, the footer. A click outside
// the envelope, the cards and the buttons leaves (see onOutside).
function frame(el, ctx) {
  const { t, esc } = ctx;
  el.classList.remove("is-recap", "is-leaving");   // a new round shows its banners again
  el.innerHTML = `
    <div class="tpx" role="dialog" aria-modal="true" aria-label="${esc(t("coinsRevealTitle"))}">
      <div class="tpx-head">
        <button type="button" class="tpx-ic tpx-sound${soundOn() ? "" : " is-off"}" aria-pressed="${soundOn()}" aria-label="${esc(t("pullSound"))}"><span class="icon icon-volume icon-14" aria-hidden="true"></span></button>
      </div>
      <div class="tpx-stage"><span class="tpx-spot" aria-hidden="true"></span><canvas class="tpx-fx" aria-hidden="true"></canvas><div class="tpx-body"></div></div>
      <p class="tpx-live" aria-live="polite"></p>
      <div class="tpx-foot"></div>
    </div>`;
  const sound = el.querySelector(".tpx-sound");
  sound.addEventListener("click", () => {
    const on = !soundOn();
    setSound(on);
    if (on && el.dataset.ambient) ambientStart();   // muted when the stage opened: the music starts now
    sound.classList.toggle("is-off", !on);
    sound.setAttribute("aria-pressed", String(on));
  });
  return {
    body: el.querySelector(".tpx-body"),
    foot: el.querySelector(".tpx-foot"),
    stage: el.querySelector(".tpx-stage"),
    live: el.querySelector(".tpx-live"),
    fx: fxCanvas(el.querySelector(".tpx-fx")),
  };
}

// A click on the dimmed backdrop (not on the envelope, a card or a button) → `leave()`.
function onOutside(el, leave) {
  el.onclick = e => { if (!e.target.closest(".tpx-pile, .tpx-one, .tpx-fan, button")) leave(); };
}

// ── Effects canvas: sparks and coin rain ───────────────────────────────────

function fxCanvas(cv) {
  const g = cv.getContext("2d");
  const coin = new Image();
  coin.src = `${IMG}coin.webp`;
  let parts = [], raf = 0;
  const fit = () => {
    const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    g.setTransform(d, 0, 0, d, 0, 0);
    return r;
  };
  const loop = () => {
    if (!cv.isConnected) { parts = []; raf = 0; return; }
    const r = cv.getBoundingClientRect();
    g.clearRect(0, 0, r.width, r.height);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.life -= 1; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.rot += p.vr;
      g.save(); g.globalAlpha = Math.min(1, p.life / 25); g.translate(p.x, p.y); g.rotate(p.rot);
      if (p.coin) {
        if (coin.complete) g.drawImage(coin, -p.s / 2, -p.s / 2, p.s, p.s * (0.35 + 0.65 * Math.abs(Math.cos(p.rot * 2))));
      } else {
        // A four-point star or a diamond, flat colour with a dark edge.
        g.fillStyle = p.c; g.strokeStyle = "rgba(10,12,20,.8)"; g.lineWidth = 1.5;
        g.beginPath();
        const s = p.s;
        if (p.star) { for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? s * 0.35 : s; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } }
        else { g.moveTo(0, -s); g.lineTo(s * 0.6, 0); g.lineTo(0, s); g.lineTo(-s * 0.6, 0); }
        g.closePath(); g.fill(); g.stroke();
      }
      g.restore();
    }
    raf = parts.length ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  return {
    burst(rank, at) {
      if (reduced()) return;
      const r = fit(), cx = at?.x ?? r.width / 2, cy = at?.y ?? r.height / 2;
      for (let i = 0; i < SPARKS[rank]; i++) {
        const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * (3 + rank * 1.4);
        parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.08, rot: Math.random() * 3, vr: (Math.random() - 0.5) * 0.3,
          s: 4 + Math.random() * (4 + rank), c: Math.random() < 0.3 ? "#fff3c4" : COLORS[rank], star: Math.random() < 0.5, life: 55 + Math.random() * 30 });
      }
      kick();
    },
    rain(n = 46) {
      if (reduced()) return;
      const r = fit();
      for (let i = 0; i < n; i++) {
        parts.push({ coin: true, x: Math.random() * r.width, y: -30 - Math.random() * r.height * 0.8, vx: (Math.random() - 0.5) * 0.8, vy: 2 + Math.random() * 2.5,
          g: 0.06, rot: Math.random() * 3, vr: (Math.random() - 0.5) * 0.12, s: 18 + Math.random() * 16, life: 160 });
      }
      kick();
    },
  };
}

// Coins fly from a card to the TigerCoins balance — the header's counter when it
// is on screen, else the Deals view's bar behind the stage (which repaints with
// the new balance). Also cashing in a friend's envelope (squad-deals.js).
const _visible = el => { const r = el?.getBoundingClientRect(); return !!r && r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
export async function flyCoins(fromEl, n = 6) {
  const target = ["#topCoinsBal .tcoin", ".sqd-coins .tcoin--big"].map(s => document.querySelector(s)).find(_visible);
  if (!fromEl || !target || reduced()) return;
  const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement("img");
    c.src = `${IMG}coin.webp`; c.alt = ""; c.className = "tpx-fly";
    document.body.appendChild(c);
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 120, my = Math.min(y0, y1) - 80 - Math.random() * 60;
    c.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${mx}px, ${my}px) scale(1.1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) scale(.5)`, opacity: 0.9 },
    ], { duration: 620, delay: i * 55, easing: "cubic-bezier(.4,.1,.3,1)", fill: "forwards" }).finished.then(() => { c.remove(); sfx.coin(); });
  }
}

// A horizontal friends row: scrolls the picked tile (aria-checked="true")
// into view, centred, when it sits outside the visible part of the row.
export function showPicked(row, smooth = true) {
  const on = row?.querySelector('[aria-checked="true"]:not([hidden])');
  if (!on) return;
  const r = row.getBoundingClientRect(), b = on.getBoundingClientRect();
  if (b.left >= r.left && b.right <= r.right) return;
  row.scrollTo({ left: row.scrollLeft + (b.left - r.left) - (r.width - b.width) / 2, behavior: smooth ? "smooth" : "auto" });
}

// The envelope (or the card) follows the mouse: it tilts in 3D towards the
// pointer and a glare moves with it (--rx / --ry / --gx / --gy on `el`, eased
// by a CSS transition); back to rest when the pointer leaves `area`.
export function tilt(area, el, max = 16) {
  if (reduced() || !el) return;
  const move = e => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.9)));
    const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 0.9)));
    el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(50 + x * 45).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(50 + y * 45).toFixed(1)}%`);
    el.classList.add("is-tilted");
  };
  const rest = () => { ["--rx", "--ry"].forEach(k => el.style.setProperty(k, "0deg")); el.classList.remove("is-tilted"); };
  area.addEventListener("pointermove", move);
  area.addEventListener("pointerleave", rest);
}

// The rarer, the bigger the screen gets (r 2 → 4), from the card (--cx/--cy):
//   rare — a blue shockwave and a small flash;
//   epic — the room dims, purple neon rays and two shockwaves, lightning
//          flickers, a burst of purple sparks, an EPIC banner;
//   legendary — the room goes dark, a white-gold flash, god rays across the
//          viewport, a full-screen fountain of coins and sparks, a LEGENDARY banner.
// The card itself slams in (CSS, .tpx-one[data-r]). Layers live in the overlay
// (fixed, full screen, behind the stage) and go when it closes.
function rarityFx(ctx, overlayEl, cardEl, r) {
  if (r < 2) return;
  sfx.impact(r);
  // In a ×10 an epic and a legendary play together: the earlier layer keeps
  // its rays and dim underneath, only its banner steps aside.
  overlayEl.querySelectorAll(".tpx-legend").forEach(old => old.classList.add("is-under"));
  const fx = document.createElement("div");
  fx.className = `tpx-legend is-r${r}`;
  fx.setAttribute("aria-hidden", "true");
  fx.innerHTML = `
    ${r >= 3 ? `<span class="lg-dim"></span><span class="lg-rays"></span>` : ""}
    <span class="lg-ring"></span>${r >= 3 ? `<span class="lg-ring lg-ring--2"></span>` : ""}
    <span class="lg-flash"></span>${r === 3 ? `<span class="lg-bolt"></span>` : ""}<canvas class="lg-fx"></canvas>
    ${r >= 3 ? `<span class="lg-title"><b>${ctx.esc(ctx.t("questsRarity_" + ORDER[r]))}</b></span>` : ""}`;
  overlayEl.appendChild(fx);
  const c = cardEl?.getBoundingClientRect();
  const at = c ? { x: c.left + c.width / 2, y: c.top + c.height / 2 } : null;
  if (at) { fx.style.setProperty("--cx", `${at.x}px`); fx.style.setProperty("--cy", `${at.y}px`); }
  if (reduced() || r < 3) return;
  const full = fxCanvas(fx.querySelector(".lg-fx"));
  setTimeout(() => {
    full.burst(r, at); full.burst(r, at);
    if (r === 4) full.rain(140); else full.burst(3, at);
  }, 450);
  if (r === 4) setTimeout(() => full.rain(80), 1600);
}

// A click where a hold is needed: the button shakes "no", a bubble says how long to hold.
function nudge(btn, text) {
  btn.classList.remove("is-nudged"); void btn.offsetWidth; btn.classList.add("is-nudged");
  btn.querySelector(".tp-bubble")?.remove();
  const b = document.createElement("span");
  b.className = "tp-bubble";
  b.textContent = text;
  btn.appendChild(b);
  setTimeout(() => b.remove(), 1400);
}

// Press and hold `btn` for `ms` to fire `done` (a click alone does nothing):
// --hold runs 0 → 1, a rising tone follows it.
export function holdToFire(btn, ms, done, hint = null) {
  let t0 = 0, raf = 0, stopTone = null;
  const stop = () => {
    // Let go too soon (a click): the button shakes "no" and says to hold.
    if (raf && hint && performance.now() - t0 < ms * 0.6) nudge(btn, hint);
    cancelAnimationFrame(raf); raf = 0; stopTone?.(); stopTone = null;
    btn.style.setProperty("--hold", 0); btn.classList.remove("is-holding");
  };
  const tick = now => {
    const k = Math.min(1, (now - t0) / ms);
    btn.style.setProperty("--hold", k);
    if (k >= 1) { stop(); sfx.ready(); done(); return; }
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (btn.disabled || raf) return;
    t0 = performance.now(); btn.classList.add("is-holding");
    stopTone = holdRise(ms);
    raf = requestAnimationFrame(tick);
  };
  // The pointer is captured on press: the button shakes and grows while held,
  // and must not lose the hold by sliding from under the cursor — only a
  // release (or a cancel) stops it.
  btn.addEventListener("pointerdown", e => {
    if (e.button > 0) return;
    try { btn.setPointerCapture(e.pointerId); } catch (_) { /* synthetic event */ }
    start();
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => btn.addEventListener(ev, () => { if (raf) stop(); }));
  btn.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } });
  btn.addEventListener("keyup", e => { if ((e.key === "Enter" || e.key === " ") && raf) stop(); });
}

// ── The card of a rarity ───────────────────────────────────────────────────

function cardHtml(ctx, item, { mini = false } = {}) {
  const { t, esc, lang } = ctx;
  const r = rankOf(item);
  return `
    <div class="tpx-card r${r}${mini ? " is-mini" : ""}" style="--rc:${COLORS[r]}">
      <span class="tpx-card-shine" aria-hidden="true"></span>
      ${r === 4 && !mini ? `<img class="tpx-crown" src="${IMG}crown.webp" alt="" aria-hidden="true">` : ""}
      <img class="tpx-card-coin" src="${IMG}coin.webp" alt="" aria-hidden="true">
      <b class="tpx-card-amt">+${(item.coins || 0).toLocaleString(lang)}</b>
      <span class="tpx-card-rar">${esc(t("questsRarity_" + ORDER[r]))}</span>
    </div>`;
}

// ×1: the envelope shakes, its glow runs once through every rarity colour, it
// cracks, the card pops out and tells what it was.
async function revealOne(ctx, f, item, { fast = false } = {}) {
  const r = rankOf(item);
  f.body.innerHTML = `
    <div class="tpx-one" style="--rc:${COLORS[0]}">
      <span class="tpx-rays" aria-hidden="true"></span>
      <img class="tpx-env is-shaking" src="${IMG}envelope.webp" alt="">
      ${cardHtml(ctx, item)}
    </div>`;
  const one = f.body.firstElementChild;
  const quick = fast || reduced();
  // The glow runs through every rarity colour ONCE, grey → gold, always the
  // same sequence and timing whatever was drawn — nothing gives the result
  // away; the card tells it. (The result is already recorded: this only shows it.)
  for (let k = 0; k < (quick ? 0 : 5); k++) {
    one.style.setProperty("--rc", COLORS[k]);
    one.dataset.r = k;
    one.classList.remove("is-step"); void one.offsetWidth; one.classList.add("is-step");
    sfx.step(k);
    await wait(k === 4 ? 420 : 260);
  }
  // At the crack, and only then, the real rarity takes over (with the card).
  one.dataset.r = r;
  one.style.setProperty("--rc", COLORS[r]);
  sfx.crack(); sfx.flap();
  one.classList.remove("is-shaking");
  rarityFx(ctx, f.stage.closest(".tc-reveal"), one, r);
  one.classList.add("is-open");
  f.stage.classList.toggle("is-legend", r === 4);
  f.stage.classList.toggle("is-epic", r === 3);
  f.live.textContent = `${ctx.t("questsRarity_" + ORDER[r])} · +${item.coins} TigerCoins`;
  await wait(quick ? 60 : 260);
  sfx.reveal(); sfx.rarity(r);
  const card = one.querySelector(".tpx-card");
  tilt(f.stage.closest(".tc-reveal"), one, 18);
  const at = card.getBoundingClientRect(), st = f.stage.getBoundingClientRect();
  f.fx.burst(r, { x: at.left - st.left + at.width / 2, y: at.top - st.top + at.height / 2 });
  return card;
}

// ×N: face-down cards flipped in cascade; a pause on an epic or a legendary.
async function revealFan(ctx, f, list) {
  f.body.innerHTML = `<div class="tpx-fan${list.length > 5 ? " is-two" : ""}" style="--n:${Math.min(5, list.length)}">${list.map((x, i) => `
    <div class="tpx-slot" style="--i:${i}"><div class="tpx-slot-tilt">
      <img class="tpx-back" src="${IMG}envelope.webp" alt="" aria-hidden="true">
      ${cardHtml(ctx, x, { mini: true })}
    </div></div>`).join("")}</div>`;
  const slots = [...f.body.querySelectorAll(".tpx-slot")];
  // Every card turns towards the mouse, each from where it sits.
  const area = f.stage.closest(".tc-reveal");
  slots.forEach(sl => tilt(area, sl.firstElementChild, 14));
  await wait(reduced() ? 0 : 380);
  const st = f.stage.getBoundingClientRect();
  for (let i = 0; i < list.length; i++) {
    const r = rankOf(list[i]);
    slots[i].classList.add("is-flipped");
    sfx.flap(); sfx.rarity(Math.min(r, 2));
    const at = slots[i].getBoundingClientRect();
    f.fx.burst(Math.min(r, 3), { x: at.left - st.left + at.width / 2, y: at.top - st.top + at.height / 2 });
    if (r === 2) rarityFx(ctx, f.stage.closest(".tc-reveal"), slots[i], 2);
    if (r >= 3) {
      slots[i].classList.add("is-star");
      sfx.rarity(r);
      rarityFx(ctx, f.stage.closest(".tc-reveal"), slots[i], r);
      await wait(reduced() ? 0 : r === 4 ? 2200 : 1300);
    } else await wait(reduced() ? 0 : 150);
  }
  const best = list.reduce((b, x) => (rankOf(x) > rankOf(b) || (rankOf(x) === rankOf(b) && x.coins > b.coins) ? x : b), list[0]);
  f.live.textContent = `+${list.reduce((n, x) => n + (x.coins || 0), 0)} TigerCoins`;
  return slots[list.indexOf(best)];
}

// After a reveal: no button. A ×N's rarity counts and total pop up below the
// cards and float up above them, staying there until the member moves on —
// out of the layout, so nothing moves (a ×1's amount is on its card already). Then a click anywhere
// moves on — armed a moment later so the click that ends a hold never skips.
async function afterReveal(ctx, f, list) {
  const { t, esc, lang } = ctx;
  if (list.length > 1) {
    const total = list.reduce((n, x) => n + (x.coins || 0), 0);
    const counts = ORDER.map((r, k) => [k, list.filter(x => rankOf(x) === k).length]).filter(([, n]) => n).reverse();
    // The banners make room for the recap (the rays and the dim stay).
    f.stage.closest(".tc-reveal").classList.add("is-recap");
    f.stage.insertAdjacentHTML("beforeend", `
      <div class="tpx-float" aria-hidden="true">
        <p class="tc-reveal-sum tpx-badges">${counts.map(([k, n]) => `<span class="tc-sum tc-sum--${ORDER[k]}"><b>${n}</b> ${esc(t("questsRarity_" + ORDER[k]))}</span>`).join("")}</p>
        <p class="tpx-total">${esc(t("coinsRevealTotal", { n: total.toLocaleString(lang) }))}</p>
      </div>`);
    sfx.reveal();
  }
  await wait(700);
  const el = f.foot.closest(".tc-reveal");
  await new Promise(resolve => { el.onclick = () => { el.onclick = null; resolve(); }; });
  // The reveal fades out before the next envelope comes in (no hard cut).
  el.classList.add("is-leaving");
  await wait(380);
}

/** What a chest, a gift or a code gave (`opened` = [{ rarity, coins }]),
 *  revealed ×1 or as a fan. Resolves when the member collects. */
export async function revealPulls(ctx, opened) {
  const list = opened || [];
  if (!list.length) return "done";
  const el = overlay();
  const f = frame(el, ctx);
  if (list.length === 1) await revealOne(ctx, f, list[0]);
  else await revealFan(ctx, f, list);
  await afterReveal(ctx, f, list);
  closeOverlay(el);
  return "done";
}

/** The pile: the big envelope; hold it to pull one, or "Open ×N" for up to ten.
 *  `pull(n)` asks the backend ({ opened, unopened, balance }). After each
 *  reveal a click goes back to the pile; a click outside the envelope on the
 *  pile leaves; it closes by itself when the pile is empty. */
/* `gift` (gift envelopes in the pile): { count() → n, run() → the new pile size
   or null } — a small "Give to a friend (n)" under the pile; run() opens the
   friend picker over the stage, the stage then redraws its pile. */
export async function openPullStage(ctx, { left, pull, gift = null, guard = 0 }) {
  const { t, esc } = ctx;
  const el = overlay();
  if (guard) guardInput(el, guard);   // opened by an easter egg: the clicks still coming must not skip it
  // The envelope pile has its own background music while the stage is open.
  el.dataset.ambient = "1";
  ambientStart();
  let remaining = left;
  for (;;) {
    if (remaining <= 0) { closeOverlay(el); return; }
    const f = frame(el, ctx);
    let picked = 0;
    {
      const ten = Math.min(10, remaining);
      f.body.innerHTML = `
        <button type="button" class="tpx-pile" data-n="1" aria-label="${esc(t("pullOne"))}">
          <svg class="tpx-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><circle class="tpx-ring-fill" cx="50" cy="50" r="46" pathLength="100"/></svg>
          <span class="tpx-tilt">
            <img class="tpx-env" src="${IMG}envelope.webp" alt="">
            <span class="tpx-env-shine" aria-hidden="true"></span>
            <span class="tpx-glare" aria-hidden="true"></span>
          </span>
        </button>`;
      tilt(el, f.body.querySelector(".tpx-tilt"));
      const gifts = gift?.count() || 0;
      f.foot.innerHTML = `
        <div class="tc-reveal-actions">
          ${ten > 1 ? `<button type="button" class="sqd-open tp-hold tp-ten" data-n="${ten}"><span class="tp-fill" aria-hidden="true"></span><span>${esc(t("pullMany", { n: ten }))}</span></button>` : ""}
        </div>
        ${gifts ? `<div class="tp-gift-row"><button type="button" class="tc-code-cancel tp-gift" data-gift><img src="${IMG}gift-v2.webp" alt="" aria-hidden="true">${esc(t("envGive"))} (${gifts})</button></div>` : ""}`;
      picked = await new Promise(resolve => {
        onOutside(el, () => resolve(0));
        el.querySelector("[data-gift]")?.addEventListener("click", async () => {
          const n = await gift.run();
          if (n != null) remaining = n;
          resolve(-1);   // back to a fresh pile
        });
        el.querySelectorAll("[data-n]").forEach(b => holdToFire(b, Number(b.dataset.n) > 1 ? HOLD_TEN_MS : HOLD_MS, () => resolve(Number(b.dataset.n)),
          t(Number(b.dataset.n) > 1 ? "pullHoldTen" : "pullHoldOne")));
      });
      if (picked === -1) continue;
      if (!picked) { closeOverlay(el); return; }
    }
    f.foot.innerHTML = "";
    el.onclick = null;   // no leaving in the middle of a reveal
    let r;
    try { r = await pull(picked); }
    catch (_) { ctx.toast?.(t("squadDealsErr")); continue; }
    remaining = r.unopened ?? Math.max(0, remaining - (r.opened?.length || 0));
    const list = r.opened || [];
    if (!list.length) continue;
    const card = list.length === 1 ? await revealOne(ctx, f, list[0]) : await revealFan(ctx, f, list);
    flyCoins(card);
    // A click anywhere: back to the pile (or out, when it is empty).
    await afterReveal(ctx, f, list);
  }
}
