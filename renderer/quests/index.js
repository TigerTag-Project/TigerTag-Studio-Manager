/**
 * quests/index.js — Tiger Quests in Studio (spec: docs/QUESTS.md).
 *
 * The SERVER decides everything (TigerTag_Firebase_Backend functions/quests.js):
 * this module only
 *   1. reports what the user did — counters and gauges in
 *      users/{uid}/telemetry/studio.quest (questBump / questGauge, batched);
 *   2. checks in with dailyQuest on launch, on window focus and at local
 *      midnight (the call that starts a day and pays "open the app");
 *   3. shows the result — users/{uid}/quests/{daily,journey} live, the level
 *      table from the check-in answer — in the sidebar and view-bar chips and
 *      the Quests views (main area), and celebrates every mission, full set
 *      and level won.
 *
 *   initQuests({ t, esc, uid() → active uid | null, db(uid) → firestore,
 *                token() → Promise<ID token>, brandName(id), materialName(id),
 *                playTones(notes, opts), onChange(), openView(tab),
 *                friend(uid) → { name, avatar } | null })
 *
 * Streak combo and freezes (docs/QUESTS.md §7): the combo and the freezes used
 * come in the daily doc; the reserves' sizes, the freezes to give and each
 * friend's bonus slots come from the streakFreeze endpoint (status / give / buy /
 * repair) — read again whenever the daily doc's freeze fields move.
 *   questsSignIn(uid) / questsSignOut()
 *   questBump(key, n = 1)   — a counter (FieldValue.increment)
 *   questGauge(key, value)  — a gauge (set when it changed)
 *   questPillLabel() / questDailyProgress() / questCurrentLevel()
 *   openQuests(tab) → ctx.openView(tab); renderQuestsView(host, tab)
 */
const DAILY_QUEST_URL = "https://us-central1-tigertag-connect.cloudfunctions.net/dailyQuest";
const STREAK_FREEZE_URL = "https://us-central1-tigertag-connect.cloudfunctions.net/streakFreeze";
const FLUSH_MS = 1500;                 // bumps within this window land in one write
const FOCUS_CHECKIN_MS = 10 * 60e3;    // a window focus re-checks in at most every 10 min
const RANKS = 20;                      // ranks announced in the app; the server ships 1 and 2
// Rank icons: assets/svg/ranks/rank-NN.svg (1 base camp … 20 the universe), drawn as a
// mask in the current colour — the url() resolves from quests.css (renderer/quests/).
const rankIcon = n => `<span class="qm-rank-ic" style="--ico:url('../../assets/svg/ranks/rank-${String(n).padStart(2, "0")}.svg')" aria-hidden="true"></span>`;
const RANK_IDS = { discovery: 1, explorer: 2 };

import { sfx } from "./coin-sound.js";
import { heroLayersHtml } from "./hero-layers.js";
import { openFreezeWindow } from "./freeze-modal.js";

// The Today banner scene (hero-layers.js): the tiger in the TigerTag cap dreaming,
// one picture standing on the desk with its paw resting on it, its light-bulb thought, the
// plant, the laptop, the printer and the spool shelf on the desk.
const DAILY_SCENE = heroLayersHtml("../assets/img/quests/daily-hero/", {
  front: ["plant", "laptop", { name: "tiger-one", cls: "tiger" }, "bubble", "printer", { name: "shelf-v2", cls: "shelf" }],
});

// The Missions banner scene: the explorer tiger (backpack, map, TigerTag cap)
// on the desk pointing at the cork board of the journey (on the wall, behind), the compass and the
// map scroll on the desk, the printer finishing a trophy.
const MISSIONS_SCENE = heroLayersHtml("../assets/img/quests/missions-hero/", {
  back: ["board"],   // on the wall, behind the tiger's pointing paw
  front: ["tiger", "compass", "scroll", "printer"],
});

let _ctx = null;
let _uid = null;
let _unsubs = [];
let _daily = null, _journey = null, _levels = null, _rewards = null;
// streakFreeze status ({ tier, caps, price, balance, freezes, toGive, broken, friends }).
let _freeze = null, _freezeSig = "";
let _moreOpen = false;   // "Rules and stats" unfolded — kept across re-renders
let _lastCheckIn = 0, _midnightTimer = null, _flushTimer = null;
const _bumps = new Map(), _gauges = new Map(), _gaugeSent = new Map();

export function initQuests(ctx) {
  _ctx = ctx;
  window.addEventListener("focus", () => { if (_uid && Date.now() - _lastCheckIn > FOCUS_CHECKIN_MS) checkIn(); });
}

// ── 1. Counters ──────────────────────────────────────────────────────────────
// `printer`: the machine the action was done on — a Demo printer (simulator)
// never feeds a quest, so its actions are dropped here.
export function questBump(key, n = 1, printer = null) {
  if (!_uid || !key || printer?.demo === true) return;
  _bumps.set(key, (_bumps.get(key) || 0) + n);
  scheduleFlush();
}
export function questGauge(key, value) {
  if (!_uid || !key || !Number.isFinite(value)) return;
  if (_gaugeSent.get(key) === value) return;
  _gauges.set(key, value);
  scheduleFlush();
}
function scheduleFlush() {
  clearTimeout(_flushTimer);
  _flushTimer = setTimeout(flush, FLUSH_MS);
}
function flush() {
  const uid = _uid;
  if (!uid || (!_bumps.size && !_gauges.size)) return;
  const FV = window.firebase.firestore.FieldValue;
  const quest = {};
  for (const [k, n] of _bumps) quest[k] = FV.increment(n);
  for (const [k, v] of _gauges) quest[k] = v;
  const gauges = new Map(_gauges);
  _bumps.clear(); _gauges.clear();
  _ctx.db(uid).collection("users").doc(uid).collection("telemetry").doc("studio")
    .set({ quest }, { merge: true })
    .then(() => { for (const [k, v] of gauges) _gaugeSent.set(k, v); })
    .catch(e => console.warn("[quests] counter write failed:", e.code || e.message));
}

// ── 2. Check-in ──────────────────────────────────────────────────────────────
export function questsSignIn(uid) {
  if (_uid === uid) return;
  questsSignOut();
  _uid = uid;
  const ref = _ctx.db(uid).collection("users").doc(uid).collection("quests");
  _unsubs.push(ref.doc("daily").onSnapshot(s => onDaily(s.data() || null), () => {}));
  _unsubs.push(ref.doc("journey").onSnapshot(s => onJourney(s.data() || null), () => {}));
  checkIn();
}
export function questsSignOut() {
  if (_uid) flush();
  _unsubs.forEach(u => { try { u(); } catch (_) {} });
  _unsubs = []; _uid = null; _daily = _journey = null;
  _freeze = null; _freezeSig = "";
  _bumps.clear(); _gauges.clear(); _gaugeSent.clear();
  clearTimeout(_midnightTimer);
}
async function checkIn() {
  const uid = _uid; if (!uid) return;
  _lastCheckIn = Date.now();
  let tz = "UTC";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) {}
  try {
    const token = await _ctx.token();
    if (!token || uid !== _uid) return;
    const r = await fetch(DAILY_QUEST_URL, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Firebase-Id-Token": token },
      // secretLevels: this app knows secret levels (hidden until revealed);
      // the server leaves them out for older versions.
      body: JSON.stringify({ tz, secretLevels: true }),
    });
    if (!r.ok || uid !== _uid) return;
    const j = await r.json();
    _levels = j.levels || _levels;
    _rewards = j.rewards || _rewards;
    refresh();
  } catch (e) { console.warn("[quests] check-in failed:", e.message); }
  armMidnight();
}
// The next local midnight (+5 s): a window left open starts the new day by itself.
function armMidnight() {
  clearTimeout(_midnightTimer);
  const now = new Date(), next = new Date(now);
  next.setHours(24, 0, 5, 0);
  _midnightTimer = setTimeout(checkIn, Math.min(next - now, 2 ** 31 - 1));
}

// ── Streak freezes ───────────────────────────────────────────────────────────
// One call to streakFreeze; the answer is always the fresh status. A refused
// action throws its code — the window that asked says why (freeze-modal.js ERR).
async function freezeCall(action, extra = {}) {
  const uid = _uid; if (!uid) return;
  try {
    const token = await _ctx.token();
    if (!token || uid !== _uid) return;
    const r = await fetch(STREAK_FREEZE_URL, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...extra }),
    });
    const j = await r.json().catch(() => ({}));
    if (uid !== _uid) return;
    // A refused action throws its code (the window shows why); a refused status is only logged.
    if (!r.ok) { if (action !== "status") throw new Error(j.error || "ERROR"); return; }
    _freeze = j;
    return j;
  } catch (e) {
    if (action !== "status") throw e;
    console.warn("[quests] streakFreeze", action, e.message);
  } finally { refresh(); }
}
// The daily doc's freeze fields moved (a palier, a freeze used, a gift received…): read the status again.
function syncFreezeStatus(d) {
  const sig = JSON.stringify([d?.freezes, d?.toGive, d?.broken, d?.streak]);
  if (sig === _freezeSig) return;
  _freezeSig = sig;
  freezeCall("status");
}
// Buy / give / repair: a window that shows the situation, then a held confirm
// (freeze-modal.js). Opened with the latest status (read first if not there yet).
async function openFreeze(mode) {
  if (!_freeze) { try { await freezeCall("status"); } catch (_) {} }
  if (!_freeze) return;
  const friends = (_freeze.friends || []).map(f => ({ uid: f.uid, ...(_ctx.friend?.(f.uid) || {}) })).filter(f => f.name != null);
  await openFreezeWindow({ t: _ctx.t, esc: _ctx.esc, lang: _ctx.lang?.() }, mode, {
    status: _freeze, own: _daily?.freezes?.own, bonus: _daily?.freezes?.bonus, friends,
    brokenStreak: _daily?.broken?.streak, send: (action, extra) => freezeCall(action, extra),
  });
}
// Once per account and day: "your freeze saved your streak" / "streak broken".
function announceFreeze(d) {
  if (!d?.day || !_uid) return;
  const key = `tigertag.freezeNotice.${_uid}`;
  let seen = ""; try { seen = localStorage.getItem(key) || ""; } catch (_) {}
  const used = d.lastFreezeUsed?.day === d.day, broken = d.broken?.day === d.day;
  if ((!used && !broken) || seen === d.day) return;
  try { localStorage.setItem(key, d.day); } catch (_) {}
  const { t } = _ctx;
  if (used) celebrate("freeze", { label: t("questsFreezeSavedText", { n: d.lastFreezeUsed.streak, days: d.lastFreezeUsed.n }) });
  else celebrate("broken", { label: t("questsStreakBrokenText", { n: d.broken.streak }) });
}

// ── 3. Live state + celebrations ─────────────────────────────────────────────
function onDaily(d) {
  const prev = _daily;
  _daily = d;
  // The daily screen celebrates in place (rows, chest jackpot): no toast or
  // sound on top of it while it is on screen.
  const inPlace = !!document.querySelector(".qd-chest")?.offsetParent;
  if (prev && d && prev.day === d.day && !inPlace) {
    (d.missions || []).forEach((id, k) => {
      if (d.done?.[k] && !prev.done?.[k]) celebrate("mission", { label: missionLabel(id), xp: _rewards?.daily?.mission ?? 5 });
    });
    if (d.bonusPaid && !prev.bonusPaid) celebrate("fullSet", { xp: _rewards?.daily?.fullSet ?? 20 });
    // A palier: the streak bonus, × the combo.
    if ((d.streakBonuses || 0) > (prev.streakBonuses || 0)) {
      const combo = Math.max(1, d.combo || 1);
      celebrate("combo", { label: combo > 1 ? _ctx.t("questsComboBadge", { n: combo }) : _ctx.t("questsStreakTitle"),
        xp: (_rewards?.daily?.streakBonus ?? 100) * combo });
    }
  }
  if (d) { announceFreeze(d); syncFreezeStatus(d); }
  refresh();
}
function onJourney(j) {
  const prev = _journey;
  _journey = j;
  if (prev && j) {
    for (const id of j.bonusesPaid || []) {
      if (!(prev.bonusesPaid || []).includes(id)) {
        const lv = _levels?.find(l => l.id === id);
        celebrate("level", { label: levelName(id), xp: lv?.bonus || 0 });
      }
    }
  }
  refresh();
}
function refresh() {
  _ctx?.onChange?.();
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function celebrate(kind, { label = "", xp = 0 } = {}) {
  const { t, esc } = _ctx;
  const title = { mission: "questsMissionDone", fullSet: "questsFullSetDone", combo: "questsComboDone",
    freeze: "questsFreezeSaved", broken: "questsStreakBroken" }[kind] || "questsLevelDone";
  const el = document.createElement("div");
  el.className = `qst-cel qst-cel--${kind}`;
  el.setAttribute("role", "status");
  el.innerHTML = `
    <span class="qst-cel-burst" aria-hidden="true">${"<i></i>".repeat(10)}</span>
    ${xp ? `<span class="qst-cel-xp">+${xp} XP</span>` : kind === "freeze" ? `<span class="qst-cel-xp qst-cel-ic"><img src="../assets/img/quests/freeze/freeze.webp" alt="" width="34" height="34"></span>`
      : `<span class="qst-cel-xp qst-cel-ic"><span class="icon icon-flame icon-24"></span></span>`}
    <span class="qst-cel-txt"><b>${esc(t(title))}</b>${label ? `<small>${esc(label)}</small>` : ""}</span>`;
  document.body.appendChild(el);
  const tones = kind === "mission"
    ? [{ f: 880, d: 0.10 }, { f: 1318.5, t: 0.08, d: 0.18 }]
    : [{ f: 784, d: 0.12 }, { f: 988, t: 0.1, d: 0.12 }, { f: 1175, t: 0.2, d: 0.14 }, { f: 1568, t: 0.32, d: 0.36 }];
  try { _ctx.playTones?.(tones, { type: "triangle", gain: 0.07 }); } catch (_) {}
  const life = kind === "mission" ? 2600 : 4200;
  setTimeout(() => {
    if (reducedMotion()) { el.remove(); return; }
    el.classList.add("is-out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);
  }, life);
}

// ── Labels ───────────────────────────────────────────────────────────────────
function missionLabel(id) {
  const { t } = _ctx;
  const [base, param] = String(id).split(":");
  if (base === "findBrand") return t("questDaily_findBrand", { brand: _ctx.brandName(Number(param)) || "?" });
  if (base === "filterMaterial") return t("questDaily_filterMaterial", { material: _ctx.materialName(Number(param)) || "?" });
  return t(`questDaily_${base}`);
}
const actionLabel = id => _ctx.t(`questAct_${id.replace(".", "_")}`);
function levelName(id) {
  const { t } = _ctx;
  const lv = _levels?.find(l => l.id === id);
  const n = lv ? RANK_IDS[lv.rank] : null;
  // A secret level has no number of its own: "Discovery ★".
  return `${n ? t(`questRank_${n}`) : ""} ${lv?.secret ? "★" : id.slice(1)} · ${t(`questLevel_${id}`)}`.trim();
}

// ── Today's progress (view-bar chip, sidebar badge) ─────────────────────────
// Today's progress: "open the app" + the 4 missions.
export function questDailyProgress() {
  const today = localDay();
  if (!_daily || _daily.day !== today) return null;
  const done = (_daily.open ? 1 : 0) + (_daily.done || []).filter(Boolean).length;
  return { done, total: 1 + (_daily.missions || []).length, complete: _daily.bonusPaid === true };
}
function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function questPillLabel() {
  const p = questDailyProgress();
  return p ? _ctx.t("questsPillLabel", { n: p.done, total: p.total }) : _ctx.t("questsTitle");
}

// Secret levels (server `secret: true`, e.g. Discovery's bonus "d6") stay out of
// the progression: they never are "the current level", never count in a
// rank's n / 5, and only APPEAR once every other level of their rank is won.
const mainLevels = () => (_levels || []).filter(l => !l.secret);
function secretShown(l) {
  const paid = new Set(_journey?.bonusesPaid || []);
  return mainLevels().filter(m => m.rank === l.rank).every(m => paid.has(m.id));
}
// The level the user is working on: the first one whose bonus is not paid yet.
export function questCurrentLevel() {
  if (!_levels) return null;
  const paid = new Set(_journey?.bonusesPaid || []), a = _journey?.actions || {};
  const main = mainLevels();
  const lv = main.find(l => !paid.has(l.id)) || main[main.length - 1];
  const n = RANK_IDS[lv.rank] || 1;
  return {
    id: lv.id, rank: n, icon: rankIcon(n), name: `${_ctx.t(`questRank_${n}`)} ${lv.id.slice(1)}`,
    done: lv.actions.filter(x => (a[x.id] || 0) >= x.target).length, total: lv.actions.length,
  };
}

// ── Quests view (the main area, like the stock and printer views) ────────────
// The host shows it for the view modes "questsToday" / "questsJourney" and calls
// renderQuestsView(host, tab) on every render.
// Look: the Tiger Quests presentation page — a dark game world, cut-corner
// panels, diamond check boxes, skewed segmented bars (quests.css "Game world").
export function openQuests(tab = "today") { _ctx.openView?.(tab); }
// Jackpot: the full set completing while the daily screen is shown plays a ~2 s
// sequence (bar sweep → chest lights up → particle burst → XP count-up). Data
// refreshes landing meanwhile (the server rewrites the journey right after)
// wait for its end instead of rebuilding the panel mid-animation.
const JACKPOT_MS = 2100;
let _jackpotUntil = 0, _jackpotWait = null, _jackpotReplay = false;
// Clicking the open chest plays the jackpot again — display only, no XP.
function replayJackpot() {
  if (reducedMotion() || Date.now() < _jackpotUntil) return;
  _jackpotReplay = true;
  refresh();
}
export function renderQuestsView(host, tab = "today") {
  if (!host) return;
  if (tab === "today" && Date.now() < _jackpotUntil && host.querySelector(".qd-chest.is-jackpot")) {
    clearTimeout(_jackpotWait);
    _jackpotWait = setTimeout(refresh, _jackpotUntil - Date.now() + 30);
    return;
  }
  if (!host.dataset.wired) {
    host.dataset.wired = "1";
    host.addEventListener("toggle", e => { if (e.target.matches?.(".qd-more")) _moreOpen = e.target.open; }, true);
    host.addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && e.target.closest?.(".qd-chest.is-earned")) { e.preventDefault(); replayJackpot(); }
    });
    host.addEventListener("click", e => {
      // Missions: a built chapter shows its levels; the arrows slide the row of chapters.
      const r = e.target.closest("[data-rank]");
      if (r && !r.disabled) { _missionRank = Number(r.dataset.rank); refresh(); return; }
      const arrow = e.target.closest("[data-chap]");
      if (arrow) { const tr = host.querySelector(".qm-chap-track"); tr?.scrollBy({ left: tr.clientWidth * .8 * Number(arrow.dataset.chap), behavior: reducedMotion() ? "auto" : "smooth" }); return; }
      if (e.target.closest(".qd-chest.is-earned")) { replayJackpot(); return; }
      // Streak freezes (freezeCardHtml).
      const fb = e.target.closest("[data-qf]");
      if (fb && !fb.disabled) openFreeze(fb.dataset.qf);   // "buy" | "give" | "repair"
    });
  }
  // Signature guard: every XP / Firestore / focus update re-renders the view;
  // when the markup is the same, leave the DOM alone — rewriting it restarted
  // the cards' entrance and glow animations (the secret card flashed).
  const html = `<div class="qw">${tab === "today" ? todayHtml() : journeyHtml()}</div>`;
  if (host._qwHtml === html && host.firstElementChild) {
    if (Date.now() - _lastCheckIn > 60e3) checkIn();
    return;
  }
  host._qwHtml = html;
  const keep = host.querySelector(".qm-chap-track")?.scrollLeft;
  host.innerHTML = html;
  const track = host.querySelector(".qm-chap-track");
  if (track) {
    // Keep the row where the user left it; the first time, bring the selected chapter into view.
    if (keep != null) track.scrollLeft = keep;
    else track.querySelector(".qm-chap.is-on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }
  const xpEl = host.querySelector(".qd-chest.is-jackpot .qd-chest-xp");
  if (xpEl) countUp(xpEl, Number(xpEl.dataset.xp) || 0);
  if (Date.now() - _lastCheckIn > 60e3) checkIn();
}

// The rank the user is in: the first one with a level whose bonus is not paid.
function currentRank() {
  if (!_levels) return 1;
  const paid = new Set(_journey?.bonusesPaid || []);
  const main = mainLevels(), open = main.find(l => !paid.has(l.id));
  return open ? RANK_IDS[open.rank] || 1 : RANK_IDS[main[main.length - 1].rank] || 1;
}
const pct = (n, of) => Math.max(0, Math.min(100, Math.round((n / Math.max(1, of)) * 100)));

// ── Today: the daily quests screen ───────────────────────────────────────────
// Banner, today's progress + the full-set chest, one row per quest, and a side
// column (streak, next draw, rewards, stats). Every value comes from the daily
// doc and the server's reward table; nothing here grants XP.
// Presentation only (no rule behind it): an icon and a category per mission.
const MISSION_LOOK = {
  open: ["tigerstudio", "quick"], findBrand: ["search", "exploration"], filterMaterial: ["filter", "exploration"],
  visitFriend: ["community", "exploration"], camera: ["camera", "exploration"], demoPrinter: ["printer", "exploration"],
  shareFriendLink: ["link", "exploration"], favorite: ["heart", "quick"], lightMode: ["bulb", "quick"],
  whatsNew: ["sparkle", "quick"], sortTable: ["list", "quick"], weightMove: ["scale", "challenge"],
  rackSpool: ["rack-grid", "challenge"], note: ["edit", "challenge"], minStock: ["bars", "challenge"], wishlist: ["cart", "challenge"],
};
const localDayOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// The streak still counts when the last full set was today or yesterday; older, it is broken.
function liveStreak() {
  const last = _daily?.lastFullDay; if (!last) return 0;
  const y = new Date(); y.setDate(y.getDate() - 1);
  return last === localDay() || last === localDayOf(y) ? _daily.streak || 0 : 0;
}
function ago(ms) {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60e3);
  const rtf = new Intl.RelativeTimeFormat(_ctx.lang?.() || undefined, { numeric: "auto" });
  return m < 60 ? rtf.format(-Math.max(0, m), "minute") : rtf.format(-Math.round(m / 60), "hour");
}

// The jackpot's XP counts up from 0 (from 1 s in, over 0.5 s) to the value the
// server paid — display only.
function countUp(el, to) {
  const t0 = performance.now() + 1000;
  const step = now => {
    if (!el.isConnected) return;
    const k = Math.max(0, Math.min(1, (now - t0) / 500));
    el.textContent = `+${Math.round(to * k)} XP`;
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = "+0 XP";
  requestAnimationFrame(step);
}
// Particles of the burst: 16 around the chest — gold dots, stars and orange / gold confetti.
const BURST = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 + (i % 2 ? .18 : 0), d = 62 + (i * 37) % 58;
  const kind = ["dot", "star", "conf", "dot"][i % 4];
  return `<i class="qd-p qd-p--${kind}" style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d * .8)}px;--r:${(i * 47) % 360}deg;--dl:${(i % 5) * 30}ms"></i>`;
}).join("");

// What the screen has already shown as done, per day: a part completing while
// the app is open plays its little animation once ("is-new"); re-renders and
// the first view of a day show the state without replaying anything.
let _shownDay = null;
const _shownDone = new Set();
function freshlyDone(key, done) {
  if (!done) return false;
  if (_shownDone.has(key)) return false;
  _shownDone.add(key);
  return _shownDay !== null;   // the first render of a day only records
}
function questRow({ look, title, desc, done, xp, at, fresh }) {
  const { t, esc } = _ctx;
  const [icon, cat] = look;
  const ic = icon === "tigerstudio"
    ? `<span class="qd-mask" style="--ico:url('../../assets/svg/icons/icon_tigerstudio.svg')"></span>`
    : `<span class="icon icon-${icon} icon-20"></span>`;
  return `
    <li class="qd-row qd-cat-${cat}${done ? " is-done" : ""}${fresh ? " is-new" : ""}">
      <span class="qd-ic" aria-hidden="true">${ic}</span>
      <span class="qd-title"><b>${esc(title)}</b><small>${esc(desc)}</small></span>
      <span class="qd-badge">${esc(t(`questsCat_${cat}`))}</span>
      <span class="qd-count">${done ? 1 : 0}/1</span>
      <span class="qd-bar" aria-hidden="true"><i style="width:${done ? 100 : 0}%"></i></span>
      <span class="qd-xp">+${xp} XP</span>
      <span class="qd-status"><span class="qd-check" aria-hidden="true">${done ? `<span class="icon icon-check icon-14"></span>` : ""}</span>
        <span><b>${esc(t(done ? "questsDoneLabel" : "questsTodoLabel"))}</b>${done && at ? `<small>${esc(ago(at))}</small>` : ""}</span></span>
    </li>`;
}

function todayHtml() {
  const { t, esc } = _ctx;
  const p = questDailyProgress();
  if (!p) return (_ctx.loadingHTML?.() || `<p class="qw-empty">${esc(t("questsLoading"))}</p>`);
  const r = { open: 10, mission: 5, fullSet: 20, streakBonus: 0, streakEvery: 5, comboMax: 5, ...(_rewards?.daily || {}) };
  const items = [{ look: MISSION_LOOK.open, title: t("questsOpenApp"), desc: t("questDesc_open"), done: _daily.open, xp: r.open, at: _daily.openAt }]
    .concat((_daily.missions || []).map((id, k) => {
      const base = String(id).split(":")[0];
      return { look: MISSION_LOOK[base] || ["star-fill", "quick"], title: missionLabel(id), desc: t(`questDesc_${base}`),
        done: _daily.done?.[k] === true, xp: r.mission, at: _daily.doneAt?.[k] };
    }));
  // First render of the day records what is already done; later ones flag new completions.
  if (_shownDay !== _daily.day) { _shownDone.clear(); _shownDay = null; }
  items.forEach((x, k) => { x.fresh = freshlyDone(`${k}`, x.done); });
  const freshSet = freshlyDone("set", p.complete);
  const jackpot = (freshSet || (_jackpotReplay && p.complete)) && !reducedMotion();
  _jackpotReplay = false;
  if (jackpot) _jackpotUntil = Date.now() + JACKPOT_MS;
  _shownDay = _daily.day;
  const max = items.reduce((a, x) => a + x.xp, 0) + r.fullSet;
  const earned = items.reduce((a, x) => a + (x.done ? x.xp : 0), 0) + (p.complete ? r.fullSet : 0);
  // What is left to do comes first; done quests follow, shorter (quests.css .qd-row.is-done).
  const rows = [...items.filter(x => !x.done), ...items.filter(x => x.done)].map(questRow).join("");
  const streak = liveStreak(), every = r.streakEvery || 5;
  const lit = streak ? ((streak - 1) % every) + 1 : 0;
  const nextBonusDay = streak - (streak % every) + every;   // the next multiple of `every` after today
  // Combo: the paliers in a row (server-kept); the next palier pays the bonus × its own combo.
  // Shown from the first palier (×1); a doc written before the combo existed has none yet.
  const combo = streak ? Math.max(0, _daily.combo ?? Math.min(r.comboMax || 5, Math.floor(streak / every))) : 0;
  const nextBonusXp = r.streakBonus * Math.min(r.comboMax || 5, nextBonusDay / every);
  // Days bridged by a freeze at today's check-in: shown under the pips (they add no
  // pip — the pips count full days toward the next palier), calm and icy.
  const frozen = streak && _daily.lastFreezeUsed?.day === _daily.day ? _daily.lastFreezeUsed : null;
  const chestState = p.complete ? "earned" : p.done === p.total - 1 ? "near" : "locked";
  const now = new Date(), midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
  const dayPct = 100 - pct(midnight - now, 86400e3);   // the ring charges up to the next draw
  const reset = new Intl.DateTimeFormat(_ctx.lang?.() || undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(2000, 0, 1, 0, 0));
  const stat = (icon, label, value) => value == null ? "" : `<li><span class="icon icon-${icon} icon-14" aria-hidden="true"></span><span>${esc(label)}</span><b>${esc(String(value))}</b></li>`;
  return `
  <div class="qd">
    <section class="qm-hero qd-hero">
      <div class="qm-hero-txt"><span class="qw-eyebrow">${esc(t("questsTitle"))}</span>
        <h2>${esc(t("questsDailyHeading"))}</h2><p>${esc(t("questsCaption"))}</p></div>
      <div class="hero-scene" aria-hidden="true">${DAILY_SCENE}</div>
    </section>
    <div class="qd-grid">
      <div class="qd-main">
        <div class="qd-top">
          <section class="qd-card qd-progress${jackpot ? " is-jackpot" : ""}">
            <div class="qd-progress-head"><h3>${esc(t("questsTodayProgress"))}</h3><span class="qd-progress-n"><b>${p.done}</b> / ${p.total}</span></div>
            <div class="qd-progress-row">
              <span class="qd-seg" aria-hidden="true">${items.map((x, k) => `<i class="${k < p.done ? "on" : ""}${k < p.done && k >= p.done - items.filter(y => y.fresh).length ? " is-new" : ""}"></i>`).join("")}</span>
              <span class="qd-progress-xp"><b>${earned}</b> / ${max} XP</span>
            </div>
          </section>
          <section class="qd-card qd-chest is-${chestState}${jackpot ? " is-jackpot" : ""}"${p.complete ? ` role="button" tabindex="0" aria-label="${esc(t("questsReplayJackpot"))}"` : ""}>
            ${jackpot ? `<span class="qd-burst" aria-hidden="true"><span class="qd-rays"></span>${BURST}</span>` : ""}
            <span class="qd-chest-art"><img class="qd-chest-img" src="../assets/img/quests/full-set-chest${p.complete ? "" : "-closed"}-v2.webp" alt="">
              ${jackpot ? `<img class="qd-chest-img qd-chest-closed" src="../assets/img/quests/full-set-chest-closed-v2.webp" alt="">` : ""}
              ${p.complete ? "" : `<span class="qd-chest-lock" aria-hidden="true"><span class="icon icon-lock icon-10"></span></span>`}</span>
            <div class="qd-chest-txt"><span class="qd-chest-label">${esc(t("questsFullSet"))}</span><b class="qd-chest-xp" data-xp="${r.fullSet}">+${r.fullSet} XP</b>
              <small>${esc(t(p.complete ? "questsChestEarned" : "questsChestLocked"))} · ${p.done}/${p.total}</small></div>
            ${p.complete ? `<span class="qd-chest-check" aria-hidden="true"><span class="icon icon-check icon-20"></span></span>` : ""}
          </section>
        </div>
        <ol class="qd-list">${rows}</ol>
      </div>
      <aside class="qd-side">
        <section class="qd-card qd-streak">
          <span class="qd-flame" aria-hidden="true"><span class="icon icon-flame icon-24"></span></span>
          <div><span class="qd-side-label">${esc(t("questsStreakTitle"))}</span><b class="qd-side-big">${esc(t("questsDays", { n: streak }))}${combo >= 1 ? ` <span class="qd-combo qd-combo--${Math.min(combo, 5)}">${esc(t("questsComboBadge", { n: combo }))}</span>` : ""}</b>
            ${r.streakBonus ? `<small>${esc(t("questsStreakNext", { xp: nextBonusXp, day: nextBonusDay }))}</small>` : ""}</div>
          <span class="qd-pips" aria-hidden="true">${Array.from({ length: every }, (_, i) => `<i class="${i < lit ? "on" : ""}"></i>`).join("")}</span>
          ${frozen ? `<p class="qd-frozen"><img src="../assets/img/quests/freeze/freeze.webp" alt="" aria-hidden="true">${esc(t(frozen.n > 1 ? "questsFrozenDays" : "questsFrozenDay", { n: frozen.n, combo: Math.max(1, combo) }))}</p>` : ""}
        </section>
        ${freezeCardHtml()}
        <section class="qd-card qd-next">
          <span class="icon icon-clock icon-24" aria-hidden="true"></span>
          <div><span class="qd-side-label">${esc(t("questsNextIn"))}</span><b class="qd-side-big">${esc(untilMidnight())}</b></div>
          <svg class="qd-ring" viewBox="0 0 44 44" aria-hidden="true"><circle class="qd-ring-track" cx="22" cy="22" r="18"/>
            <circle class="qd-ring-fill" cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="${dayPct} 100"/></svg>
          <small class="qd-reset">${esc(t("questsResetAt", { time: reset }))}</small>
        </section>
        <details class="qd-card qd-more"${_moreOpen ? " open" : ""}>
          <summary><span>${esc(t("questsRulesStats"))}</span><span class="icon icon-chevron-r icon-14" aria-hidden="true"></span></summary>
        <section class="qd-rewards">
          <h3>${esc(t("questsRewardsTitle"))}</h3>
          <ul>
            <li><span class="qd-gem qd-gem--open" aria-hidden="true"></span><span>${esc(t("questsRewardOpen"))}</span><b>+${r.open} XP</b></li>
            <li><span class="qd-gem" aria-hidden="true"></span><span>${esc(t("questsRewardPer"))}</span><b>+${r.mission} XP</b></li>
            <li><span class="qd-gem qd-gem--gold" aria-hidden="true"></span><span>${esc(t("questsFullSet"))}</span><b>+${r.fullSet} XP</b></li>
            ${r.streakBonus ? `<li><span class="icon icon-flame icon-14" aria-hidden="true"></span><span>${esc(t("questsRewardStreak", { n: every }))}</span><b>+${r.streakBonus}–${r.streakBonus * (r.comboMax || 5)} XP</b></li>` : ""}
          </ul>
        </section>
        <section class="qd-stats">
          <h3>${esc(t("questsStatsTitle"))}</h3>
          <ul>
            ${stat("list-check", t("questsStatMissions"), _daily.missionsDone)}
            ${stat("clock", t("questsStatDays"), _daily.days)}
            ${stat("flame", t("questsStatStreak"), t("questsDays", { n: streak }))}
            ${stat("star-fill", t("questsStatBest"), t("questsDays", { n: _daily.bestStreak || 0 }))}
            ${stat("bars", t("questsStatXp"), `${(_daily.xp || 0).toLocaleString(_ctx.lang?.() || undefined)} XP`)}
          </ul>
        </section>
        </details>
      </aside>
    </div>
  </div>`;
}
// Streak protection (docs/QUESTS.md §7): the own and friends' reserves as ice
// cubes (filled / dashed, as many as the tier allows) with their counts, one line
// on how it works; the freeze(s) to give with the days left (a melting cube on
// the last day); a broken streak to bring back (Gold / Platinum); "Buy…" for
// members. Every action opens its window (openFreeze) — nothing happens on a click.
const FREE_CAPS = { own: 1, bonus: 1, give: 1, repairsPerMonth: 0 };
const ICE = name => `../assets/img/quests/freeze/${name}.webp`;
function slotsHtml(filled, size) {
  return `<span class="qf-slots" aria-hidden="true">${Array.from({ length: size }, (_, i) =>
    `<img src="${ICE(i < filled ? "freeze" : "freeze-empty")}" alt="">`).join("")}</span>`;
}
function freezeCardHtml() {
  const { t, esc } = _ctx;
  const f = _freeze, caps = f?.caps || FREE_CAPS;
  const own = _daily?.freezes?.own ?? f?.freezes?.own ?? 0, bonus = _daily?.freezes?.bonus ?? f?.freezes?.bonus ?? 0;
  const gift = f?.toGive || null;
  const daysLeft = gift ? Math.max(1, Math.round((Date.parse(`${gift.until}T00:00:00`) - Date.now()) / 86400e3)) : 0;
  const broken = _daily?.broken && caps.repairsPerMonth ? _daily.broken : null;
  const reserve = (label, n, size) => `<div class="qf-row"><span>${esc(label)}</span>${slotsHtml(n, size)}<b>${n}/${size}</b></div>`;
  return `
    <section class="qd-card qd-freeze">
      <div class="qf-head"><img src="${ICE("freeze")}" alt="" aria-hidden="true"><h3>${esc(t("questsFreezeTitle"))}</h3></div>
      ${reserve(t("questsFreezeOwn"), own, caps.own)}
      ${reserve(t("questsFreezeBonus"), bonus, caps.bonus)}
      <p class="qf-hint">${esc(t("questsFreezeHint"))}</p>
      ${broken ? `<div class="qf-strip qf-strip--repair"><span class="icon icon-flame icon-18" aria-hidden="true"></span>
        <span>${esc(t("questsStreakBroken"))}<small>${esc(t("questsDays", { n: broken.streak }))}</small></span>
        <button type="button" class="qf-action" data-qf="repair">${esc(t("questsFreezeRepairShort"))}</button></div>` : ""}
      ${gift ? `<div class="qf-strip"><img src="${ICE(daysLeft <= 1 ? "freeze-melt" : "freeze-gift")}" alt="" aria-hidden="true">
        <span>${esc(t("questsFreezeToGiveShort", { n: gift.n }))}<small>${esc(t("questsFreezeMelts", { n: daysLeft }))}</small></span>
        <button type="button" class="qf-action qf-action--give" data-qf="give">${esc(t("questsFreezeGiveBtn"))}</button></div>` : ""}
      ${f?.tier ? `<button type="button" class="qf-action qf-action--buy" data-qf="buy"><span class="icon icon-coins icon-14"></span>${esc(t("questsFreezeBuyBtn"))}</button>` : ""}
    </section>`;
}
function untilMidnight() {
  const now = new Date(), next = new Date(now); next.setHours(24, 0, 0, 0);
  const m = Math.max(1, Math.round((next - now) / 60e3)), h = Math.floor(m / 60);
  return h ? `${h} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
}

// Loot: every XP item the account can own, by rarity — legendary on top
// (Tiger devices). Owned items glow; the rest show what they are worth.
// ctx.loot() → [{ id, label, hint, xp, per, n, got, art?, img?, icon?, rarity? }] from the host
// (rarity forces the rung); `art` is an illustration path (from inventory.html);
// `img` is a file of assets/svg/icons/ drawn as a mask — the url() sits in a CSS
// variable, so it resolves from quests.css (renderer/quests/), hence ../../.
const RARITIES = [["legendary", 800], ["epic", 300], ["rare", 100], ["uncommon", 20], ["common", 0]];
export function questLootHtml() { return lootHtml(); }
// Loot tiles and Feats rows answer the pointer: the art hops (quests.css) and a soft note plays,
// higher with the rarity. One delegated listener for every Workshop render.
const RARITY_STEP = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
document.addEventListener("pointerover", e => {
  const tile = e.target.closest?.(".qw-tile, .qw-row");
  if (!tile || tile.contains(e.relatedTarget)) return;
  sfx.hover(RARITY_STEP[tile.dataset.r] ?? 0);
});
// The Maker's workshop (formerly the Grimoire): two panels side by side — Loot (the physical items: devices,
// chips, printers) and Feats (the rewarded actions: friends, links, updates…).
// Loot is split in three groups (legendary relics as large showcase tiles, gear,
// chips); Feats is one list of rows. The rarity is carried by the card
// itself (colour, chip); only legendary cards glow once owned, so the green of
// Epic stays a rarity, not an "owned" signal.
// The chips always read up the range: TigerTag → TigerTag+ → TigerTag+ Certified.
const CHIP_ORDER = ["chipTag", "chipPlus", "chipCert"];
const CHIP_IDS = new Set(CHIP_ORDER);
function lootHtml() {
  const all = (_ctx.loot?.() || []).map(x => ({ ...x, r: rarityOf(x) }));
  const loot = all.filter(x => x.physical), feats = all.filter(x => !x.physical);
  const a = ladderHtml(loot, "questsLootSub", "questsLoot", "questsUnlocked", [
    ["questsRelics", x => x.r === "legendary", "relics"],
    ["questsGear", x => x.r !== "legendary" && !CHIP_IDS.has(x.id), "gear"],
    ["questsChips", x => CHIP_IDS.has(x.id), "chips"],
  ]);
  const b = ladderHtml(feats, "questsFeatsSub", "questsFeats", "questsAccomplished", [[null, () => true, "rows"]]);
  return a || b ? `<div class="qw-ladders">${a}${b}</div>` : "";
}
const rarityOf = x => x.rarity || (RARITIES.find(([, min]) => (x.per || x.xp) >= min) || RARITIES[RARITIES.length - 1])[0];
const earnedOf = x => (x.per ? (x.n || 0) * x.per : (x.got ? x.xp : 0));
function ladderHtml(items, eyebrowKey, titleKey, countKey, groups) {
  const { t, esc } = _ctx;
  if (!items.length) return "";
  const order = RARITIES.map(r => r[0]);
  const sorted = [...items].sort((p, q) => CHIP_IDS.has(p.id) && CHIP_IDS.has(q.id) ? CHIP_ORDER.indexOf(p.id) - CHIP_ORDER.indexOf(q.id)
    : order.indexOf(p.r) - order.indexOf(q.r) || earnedOf(q) - earnedOf(p));
  const got = sorted.filter(x => x.got).length;
  const xp = sorted.reduce((s, x) => s + earnedOf(x), 0);
  // The XP pill: what the item brought (×N items: their total), or what it is worth.
  const pts = x => x.per ? (x.n ? `+${earnedOf(x).toLocaleString()} XP` : t("xpPerItem", { xp: x.per })) : `+${x.xp.toLocaleString()} XP`;
  // Illustration (`art`), else the svg mask (`img`), else an app icon.
  const art = x => x.art ? `<img src="${x.art}" alt="" loading="lazy" draggable="false">`
    : x.img ? `<span class="qw-item-mask" style="--ico:url('../../assets/svg/icons/${x.img}')"></span>`
    : `<span class="icon icon-${x.icon || "star-fill"} icon-20"></span>`;
  const rar = x => `<span class="qw-rar">${esc(t(`questsRarity_${x.r}`))}</span>`;
  const status = x => x.got ? `<span class="icon icon-check icon-14" aria-hidden="true"></span>` : `<span class="icon icon-lock icon-12" aria-hidden="true"></span>`;
  // Loot: a showcase tile (legendary relics larger); Feats: one row per action,
  // every column always present so the rows line up (an empty ×N cell included).
  const tile = x => `
    <article class="qw-tile qw-r--${x.r}${x.got ? " is-got" : ""}" data-r="${x.r}" aria-label="${esc(`${x.label} — ${x.hint || ""}`)}">
      ${x.per && x.n ? `<span class="qw-n">×${x.n}</span>` : ""}
      <span class="qw-tile-art" aria-hidden="true">${art(x)}</span>
      <b class="qw-tile-name">${esc(x.label)}</b>
      ${x.r === "legendary" ? "" : rar(x)}
      <span class="qw-pts">${x.got ? "" : `<span class="icon icon-lock icon-10" aria-hidden="true"></span>`}${esc(pts(x))}</span>
    </article>`;
  const row = x => `
    <li class="qw-row qw-r--${x.r}${x.got ? " is-got" : ""}" data-r="${x.r}">
      <span class="qw-row-art" aria-hidden="true">${art(x)}</span>
      <span class="qw-row-txt"><b>${esc(x.label)}</b>${x.hint ? `<small>${esc(x.hint)}</small>` : ""}</span>
      <span class="qw-cnt">${x.per && x.n ? `×${x.n}` : ""}</span>
      ${rar(x)}
      <span class="qw-pts">${esc(pts(x))}</span>
      <span class="qw-st">${status(x)}</span>
    </li>`;
  const group = ([key, keep, layout]) => {
    const list = sorted.filter(keep);
    if (!list.length) return "";
    const head = key ? `<h3 class="qw-group-h">${esc(t(key))} <span>· ${list.filter(x => x.got).length} / ${list.length}</span></h3>` : "";
    const body = layout === "rows" ? `<ul class="qw-rows">${list.map(row).join("")}</ul>`
      : `<div class="qw-tiles qw-tiles--${layout}">${list.map(tile).join("")}</div>`;
    return `<div class="qw-group">${head}${body}</div>`;
  };
  const pct = Math.round(got / sorted.length * 100);
  return `
    <section class="qw-panel qw-ladder">
      <div class="qw-quest-head"><div><span class="qw-eyebrow">${esc(t(eyebrowKey))}</span><h2>${esc(t(titleKey))}</h2></div>
        <div class="qw-ladder-sum"><b>${esc(t(countKey, { got, n: sorted.length }))}</b>
          <span class="qw-ladder-bar" style="--p:${pct}%"></span>
          <span>${esc(t("questsXpEarned", { xp: xp.toLocaleString() }))}</span></div></div>
      ${groups.map(group).join("")}
    </section>`;
}

// ── Missions (the journey) ───────────────────────────────────────────────────
// Hero with the current chapter's progress, the chapters in one sliding row
// (a built chapter is selectable), the selected chapter's heading, then its
// levels as illustrated cards. All figures come from the journey doc and the
// server's level table.
let _missionRank = null;   // chapter picked in the row (null = the current one)
const levelState = (l, paid, waiting, locked) => paid.has(l.id) ? "won" : waiting.has(l.id) ? "wait" : locked.has(l.id) ? "lock" : "open";

function missionCard(l) {
  const { t, esc } = _ctx;
  const a = _journey?.actions || {}, paid = new Set(_journey?.bonusesPaid || []);
  const state = levelState(l, paid, new Set(_journey?.waiting || []), new Set(_journey?.locked || []));
  const done = l.actions.filter(x => (a[x.id] || 0) >= x.target).length;
  const [title, theme] = levelName(l.id).split(" · ");
  const won = state === "won";
  const status = won ? t("questsCompleted") : state === "wait" ? t("questsWaiting")
    : state === "lock" ? t("questsLocked", { xp: l.enter.toLocaleString() }) : t("questsInProgress");
  const rows = l.actions.map(x => {
    const c = Math.min(a[x.id] || 0, x.target), full = c >= x.target, part = !full && c > 0;
    return `<li class="qm-row${full ? " is-full" : part ? " is-part" : ""}">
      <span class="qm-dot" aria-hidden="true">${full ? `<span class="icon icon-check icon-10"></span>` : ""}</span>
      <span class="qm-row-label">${esc(actionLabel(x.id))}</span>
      ${x.target > 1 ? `<span class="qm-row-n">${c}/${x.target}</span>` : ""}
      ${(x.xp || _ctx.xpElsewhere?.(x.id)) ? `<span class="qm-row-xp">+${x.xp || _ctx.xpElsewhere(x.id)} XP</span>` : ""}</li>`;
  }).join("");
  return `
    <article class="qm-card is-${state}">
      <header class="qm-card-head">
        <div><h4>${esc(title)}</h4><p>${esc(theme || "")}</p></div>
        ${won ? `<span class="qm-badge"><span class="icon icon-check icon-10" aria-hidden="true"></span>${esc(t("questsCompleted"))}</span>`
          : `<div class="qm-card-n"><b>${done} / ${l.actions.length}</b><span>+${l.bonus} XP</span></div>`}
      </header>
      <span class="qm-bar" aria-hidden="true"><i style="width:${pct(done, l.actions.length)}%"></i></span>
      <div class="qm-art" style="--art:url('../../assets/img/quests/mission-${l.id}.webp')" aria-hidden="true"></div>
      <ul class="qm-rows">${rows}</ul>
      <footer class="qm-card-foot"><b>+${l.bonus} XP${won ? ` <span class="icon icon-check icon-12" aria-hidden="true"></span>` : ""}</b>
        <span class="qm-status">${state === "lock" ? `<span class="icon icon-lock icon-10" aria-hidden="true"></span>` : ""}${esc(status)}</span></footer>
    </article>`;
}

function journeyHtml() {
  const { t, esc } = _ctx;
  if (!_levels) return (_ctx.loadingHTML?.() || `<p class="qw-empty">${esc(t("questsLoading"))}</p>`);
  const paid = new Set(_journey?.bonusesPaid || []);
  const cur = currentRank();
  const built = new Set(_levels.map(l => RANK_IDS[l.rank]).filter(Boolean));
  const rank = built.has(_missionRank) ? _missionRank : cur;
  const levelsOf = n => mainLevels().filter(l => RANK_IDS[l.rank] === n);
  const secretsOf = n => _levels.filter(l => l.secret && RANK_IDS[l.rank] === n && secretShown(l));
  const wonIn = n => levelsOf(n).filter(l => paid.has(l.id)).length;
  const curLv = levelsOf(cur);
  const chapters = Array.from({ length: RANKS }, (_, i) => {
    const n = i + 1, lv = levelsOf(n), ready = lv.length > 0;
    const pips = ready ? lv.map(l => `<i class="${paid.has(l.id) ? "on" : ""}"></i>`).join("") : "<i></i>".repeat(5);
    // Selected AND done keeps its green bars: the two states add up.
    // Every level AND the secret bonus won: the chapter becomes a legendary tile.
    const secrets = _levels.filter(l => l.secret && RANK_IDS[l.rank] === n);
    const legend = ready && wonIn(n) === lv.length && secrets.length > 0 && secrets.every(l => paid.has(l.id));
    const st = !ready ? " is-soon" : `${n === rank ? " is-on" : ""}${wonIn(n) === lv.length ? " is-done" : ""}${legend ? " is-legend" : ""}`;
    return `<button type="button" class="qm-chap${st}" data-rank="${n}"${ready ? "" : " disabled"}>
      <span class="qm-chap-ic">${rankIcon(n)}</span><span class="qm-chap-n">#${n}</span>
      <b>${esc(t(`questRank_${n}`))}</b><small>${esc(ready ? t(`questWorld_${n}`) : t("questsComingSoon"))}</small>
      <span class="qm-pips" aria-hidden="true">${pips}</span>${legend ? `<span class="qm-chap-crown" aria-hidden="true">★</span><span class="qm-chap-shine" aria-hidden="true"></span>` : ""}</button>`;
  }).join("");
  const lv = levelsOf(rank);
  return `
    <section class="qm-hero">
      <div class="qm-hero-txt"><span class="qw-eyebrow">${esc(t("questsTitle"))}</span>
        <h2>${esc(t("questsJourney"))}</h2><p>${esc(t("squadHeroTagline"))}</p></div>
      <div class="hero-scene" aria-hidden="true">${MISSIONS_SCENE}</div>
      <div class="qm-hero-card">
        <b>${rankIcon(cur)} ${esc(t(`questRank_${cur}`))} · ${esc(t(`questWorld_${cur}`))}</b>
        <span>${esc(t("questsLevelsDone", { n: wonIn(cur), total: curLv.length }))}</span>
        <span class="qm-bar" aria-hidden="true"><i style="width:${pct(wonIn(cur), curLv.length || 1)}%"></i></span>
      </div>
    </section>
    <div class="qm-chapters">
      <button type="button" class="qm-arrow" data-chap="-1" aria-label="${esc(t("questsPrevChapter"))}"><span class="icon icon-chevron-l icon-14" aria-hidden="true"></span></button>
      <div class="qm-chap-track" role="group" aria-label="${esc(t("questsJourney"))}">${chapters}</div>
      <button type="button" class="qm-arrow" data-chap="1" aria-label="${esc(t("questsNextChapter"))}"><span class="icon icon-chevron-r icon-14" aria-hidden="true"></span></button>
    </div>
    ${(() => {
      // A revealed secret level follows the others in the same row, as a card of its own kind.
      const sec = secretsOf(rank);
      return `<div class="qm-cards${sec.length ? " has-secret" : ""}">${lv.map(missionCard).join("")}${sec.map(l =>
        `<div class="qm-secret-wrap"><span class="qm-secret-tag">${esc(t("questsSecretTag"))}</span>${missionCard(l)}</div>`).join("")}</div>`;
    })()}`;
}
