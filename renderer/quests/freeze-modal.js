/**
 * quests/freeze-modal.js — the streak-freeze windows (docs/QUESTS.md §7): BUY,
 * GIVE and REPAIR, on the "Give an envelope" frame (squad-deals.js showEnvelope:
 * the art rising from behind the card, the title plaque, the friends grid, a
 * button held 2 s). Nothing is spent or sent before the hold completes; the
 * window is only the friends row (buy for a friend, give) and that button.
 *
 *   openFreezeWindow(ctx, mode, data) → Promise<"done" | "back">
 *     ctx  = { t, esc, lang }
 *     mode = "buy" | "give" | "repair"
 *     data = { status (streakFreeze status), own, bonus, friends: [{ uid, name, avatar }],
 *              brokenStreak?, preselect? (a friend's uid), forFriend?, send(action, extra) → Promise<status> (throws Error(code)) }
 */
import { backfire, holdToFire, showPicked, tilt } from "./coin-pull.js";
import { ambientStop, fireStart, sfx } from "./coin-sound.js";

const ART = { buy: "freeze", give: "freeze-gift", repair: "freeze" };
// A broken streak can be mended for this many days (the backend's quests.js FREEZE.repairDays).
const REPAIR_DAYS = 2;
const img = name => `../assets/img/quests/freeze/${name}.webp`;
// One reserve as slots: a cube per filled place, a dashed cube per free one.
const slots = (filled, size) => `<span class="qfm-slots" aria-hidden="true">${Array.from({ length: size }, (_, i) =>
  `<img src="${img(i < filled ? "freeze" : "freeze-empty")}" alt="">`).join("")}</span>`;
const daysUntil = until => Math.max(1, Math.round((Date.parse(`${until}T00:00:00`) - Date.now()) / 86400e3));
// Refusal codes → copy (quests/index.js FREEZE_ERR keeps the same keys).
const ERR = {
  RESERVE_FULL: "questsFreezeErrFull", NOT_ENOUGH_COINS: "questsFreezeErrCoins", ALREADY_GIVEN: "questsFreezeErrGiven",
  NOTHING_TO_GIVE: "questsFreezeErrNothing", NOT_FRIENDS: "questsFreezeErrFriends", REPAIR_LIMIT: "questsFreezeErrRepair",
  NOTHING_TO_REPAIR: "questsFreezeErrRepair", NOT_IN_SQUAD: "questsFreezeErrSquad",
};

export function openFreezeWindow(ctx, mode, data) {
  const { t, esc } = ctx;
  let st = data.status || {};
  let own = data.own ?? st.freezes?.own ?? 0;
  // `data.preselect` (a friend's uid, from the friends panel): opens on that friend.
  // `data.forFriend` (the friends panel's "Give freezes"): opens on "for a friend".
  let target = (data.preselect || data.forFriend) && mode === "buy" ? "friend" : "me";   // buy: "me" | "friend"
  let picked = data.preselect || null;        // a friend's uid
  const title = t({ buy: "questsFreezeBuyTitle", give: "questsFreezeGiveTitle", repair: "questsFreezeRepairTitle" }[mode]);
  const el = document.createElement("div");
  el.className = "tc-reveal tc-envm qfm";
  el.innerHTML = `
    <div class="tc-reveal-card tc-code-card tcx tcx--help tc-env-card qfm-card qfm--${mode}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <span class="tch-env-tilt"><img class="tch-env qfm-art" src="${img(ART[mode])}" alt="" aria-hidden="true"></span>
      <div class="tcx-main">
        <div class="tcx-plaque"><h3>${esc(title)}</h3></div>
        <div class="qfm-body"></div>
        <p class="tc-code-err" role="alert" hidden></p>
        <div class="tc-reveal-actions qfm-actions"></div>
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-open"));
  if (mode === "repair") fireStart();   // a fireplace crackles while the flame waits to be lit
  tilt(el, el.querySelector(".qfm-art"), 18);
  const body = el.querySelector(".qfm-body"), actions = el.querySelector(".qfm-actions"), err = el.querySelector(".tc-code-err");
  const friendOf = uid => (st.friends || []).find(f => f.uid === uid);
  const nameOf = uid => (data.friends || []).find(f => f.uid === uid)?.name || "";

  // The friends who can receive, in one row like the send window (search past 8):
  // avatar, name and their free slots as ice cubes; the one picked grows in gold.
  // Friends who cannot receive now (full, already given) are left out.
  const tile = f => {
    const who = (data.friends || []).find(x => x.uid === f.uid); if (!who) return "";
    return `<button type="button" role="radio" aria-checked="${picked === f.uid}" class="tcs-f qfm-f" data-uid="${esc(f.uid)}" data-name="${esc(who.name)}">
        <span class="tcs-f-av">${who.avatar}</span><span class="tcs-f-name">${esc(who.name)}</span>${slots(f.bonus, f.bonusMax)}</button>`;
  };
  const picker = whyOf => {
    const list = (st.friends || []).filter(f => (data.friends || []).some(x => x.uid === f.uid) && !whyOf(f));
    if (!list.length) return `<p class="tc-give-left">${esc(t("questsFreezeNoFriends"))}</p>`;
    return `${list.length > 8 ? `<label class="sqd-search tc-give-search"><span class="icon icon-search icon-13" aria-hidden="true"></span><input type="search" data-qfm-q placeholder="${esc(t("friendsSearch"))}" autocomplete="off"></label>` : ""}
      <div class="tcs-row qfm-row-f" role="radiogroup" aria-label="${esc(t("envGivePick"))}">${list.map(tile).join("")}</div>`;
  };
  // The art floating above the card follows what is bought or given: the gift cube
  // for a friend, the plain cube for oneself. Nothing else is said under the friends.
  // …and the same cube, floating, right above the button.
  const hero = art => `<div class="qfm-hero"><img src="${img(art)}" alt="" aria-hidden="true"></div>`;
  const setArt = art => { const a = el.querySelector(".qfm-art"); if (a && !a.src.endsWith(`${art}.webp`)) a.src = img(art); };
  const arrow = `<span class="qfm-arrow" aria-hidden="true">→</span>`;

  // ── The three windows ──────────────────────────────────────────────────────
  // "why": what is missing — the button stays pressable and says it in a bubble.
  let why = "", whySpot = () => body;
  const render = () => {
    err.hidden = true;
    const caps = st.caps || { own: 1, bonus: 1 }, price = st.price ?? 5, balance = st.balance ?? 0;
    let html = "", label = "";
    if (mode === "buy") {
      const fullWhy = f => f.bonus >= f.bonusMax ? t("questsFreezeFull") : "";
      const f = target === "friend" ? friendOf(picked) : null;
      html = `<div class="qfm-seg" role="tablist">
          <button type="button" role="tab" data-target="me" aria-selected="${target === "me"}">${esc(t("questsFreezeForMe"))}</button>
          <button type="button" role="tab" data-target="friend" aria-selected="${target === "friend"}">${esc(t("questsFreezeForFriend"))}</button>
        </div>
        ${target === "friend" ? picker(fullWhy) : ""}
        ${hero(target === "friend" ? "freeze-gift" : "freeze")}`;
      setArt(target === "friend" ? "freeze-gift" : "freeze");
      why = !st.tier ? t("questsFreezeErrSquad")
        : target === "friend" && !f ? t("questsFreezePickFriend")
        : balance < price ? t("questsFreezeNeedCoins", { n: price - balance })
        : target === "me" && own >= caps.own ? t("questsFreezeOwnFull") : "";
      whySpot = () => target === "friend" && !f ? body.querySelector(".qfm-row-f") || body : actions.querySelector(".qfm-go") || body;
      label = target === "friend" && f ? t("questsFreezeBuyGoFor", { n: price, name: nameOf(picked) }) : t("questsFreezeBuyGo", { n: price });
    } else if (mode === "give") {
      const g = st.toGive;
      const whyOf = f => f.given ? t("questsFreezeGiven") : f.bonus >= f.bonusMax ? t("questsFreezeFull") : "";
      const f = friendOf(picked);
      html = g ? `${picker(whyOf)}${hero("freeze-gift")}` : `<p class="tc-give-left is-none">${esc(t("questsFreezeErrNothing"))}</p>`;
      setArt(g ? "freeze-gift" : "freeze-melt-5");
      why = !g ? t("questsFreezeErrNothing") : !f ? t("questsFreezePickFriend") : "";
      whySpot = () => !f ? body.querySelector(".qfm-row-f") || body : body;
      label = f ? t("questsFreezeGiveGo", { name: nameOf(picked) }) : t("envGiveShort");
    } else {
      const n = data.brokenStreak || st.broken?.streak || 0;
      // A member's perk (Gold / Platinum): the account's TigerSquad badge floats above
      // the card, the broken flame is lit again, and the perk is said plainly.
      const tierName = st.tier ? st.tier[0].toUpperCase() + st.tier.slice(1) : "";
      if (st.tier) { const a = el.querySelector(".qfm-art"); if (a) { a.src = `../assets/img/tigersquad/tigersquad-${st.tier}.webp`; a.classList.add("qfm-art--badge"); } }
      html = `<div class="qfm-mend" aria-hidden="true"><span class="qfm-flame is-out"><img src="../assets/img/quests/streak-flame-small.webp" alt=""></span>
          <span class="qfm-mend-arrow">${arrow}</span><span class="qfm-flame"><img src="../assets/img/quests/streak-flame.webp" alt=""><b>${n}</b></span></div>
        <p class="qfm-why-perk">${esc(t("questsFreezeRepairWhy", { n: REPAIR_DAYS, days: REPAIR_DAYS, tier: tierName }))}</p>`;
      why = n ? "" : t("questsFreezeErrRepair");
      label = t("questsFreezeRepair", { n });
    }
    body.innerHTML = html;
    // One big golden button, held 2 s, always pressable; no "Cancel" (a click outside or Escape closes).
    actions.innerHTML = `
      <button type="button" class="sqd-open tp-hold tp-ten sqd-wide qfm-go"><span class="tp-fill" aria-hidden="true"></span><span class="qfm-go-txt"><span>${esc(label)}</span><small>${esc(t("pullHoldTen"))}</small></span></button>`;
    const go = actions.querySelector(".qfm-go");
    const stopIfIncomplete = e => {
      if (!why) return;
      e.stopImmediatePropagation(); e.preventDefault();
      const spot = whySpot();
      data.errorTip?.(spot, why);
      spot.classList.remove("tcs-shake"); void spot.offsetWidth; spot.classList.add("tcs-shake");
    };
    go.addEventListener("pointerdown", stopIfIncomplete, true);
    go.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") stopIfIncomplete(e); }, true);
    holdToFire(go, 2000, confirm, t("pullHoldTen"));
    body.querySelector("[data-qfm-q]")?.addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      body.querySelectorAll(".qfm-f").forEach(b => { b.hidden = !!q && !b.dataset.name.toLowerCase().includes(q); });
    });
  };

  // The hold completed: the one server call, then what changed.
  const confirm = async () => {
    const go = actions.querySelector(".qfm-go"); if (go) go.disabled = true;
    try {
      const forFriend = mode === "give" || target === "friend";
      st = await data.send(mode === "give" ? "give" : mode, forFriend ? (mode === "give" ? { to: picked } : { for: picked }) : {});
      const who = picked ? nameOf(picked) : "";
      if (mode === "buy" && !forFriend) own = Math.min((st.caps || {}).own || own + 1, own + 1);
      const msg = mode === "repair" ? t("questsFreezeRepaired")
        : mode === "buy" && !forFriend ? t("questsFreezeBought", { n: own, max: (st.caps || {}).own || own })
        : t("questsFreezeSent", { name: who });
      // Giving: the window stays open while freezes are left to give, the next friend to pick.
      if (mode === "give" && st.toGive?.n > 0) {
        picked = null; render();
        body.insertAdjacentHTML("afterbegin", `<p class="qfm-ok" role="status">${esc(msg)}</p>`);
        return;
      }
      if (mode === "repair") { await relight(msg); finish("done"); return; }
      body.innerHTML = `<p class="qfm-ok qfm-ok--big" role="status">${esc(msg)}</p>`;
      actions.innerHTML = "";
      el.querySelector(".qfm-card").classList.add("is-given");
      setTimeout(() => finish("done"), 1600);
    } catch (e) {
      err.textContent = t(ERR[e?.message] || "questsFreezeErrGeneric");
      err.hidden = false;
      if (go) go.disabled = false;
    }
  };

  // The streak saved — a moment few members ever see, so it gets a ceremony:
  // embers are drawn into the small dead flame, it catches with a flash and a
  // shock ring, the big flame rises while huge translucent flames swell behind
  // the window (the fire spreading), the days come back one by one on a counter
  // and embers keep rising; a click (or ~4 s) closes. Reduced motion: the end state.
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const relight = async msg => {
    const n = data.brokenStreak || st.broken?.streak || st.streak || 0;
    const card = el.querySelector(".qfm-card");
    actions.innerHTML = ""; err.hidden = true;
    body.innerHTML = `<div class="qfm-relight" aria-hidden="true">
        <span class="qfm-rl-glow"></span><span class="qfm-rl-ring"></span><span class="qfm-rl-embers"></span>
        <img class="qfm-rl-small" src="../assets/img/quests/streak-flame-small.webp" alt="">
        <img class="qfm-rl-big" src="../assets/img/quests/streak-flame.webp" alt="">
      </div>
      <p class="qfm-rl-days" role="status"><b>${esc(t("questsDays", { n: 0 }))}</b><span>${esc(msg)}</span></p>`;
    const stage = body.querySelector(".qfm-relight"), embers = body.querySelector(".qfm-rl-embers"), days = body.querySelector(".qfm-rl-days b");
    card.classList.add("is-relighting");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stage.classList.add("is-lit"); days.textContent = t("questsDays", { n }); card.classList.add("is-relit");
      await wait(2200); return;
    }
    const ember = (from, to, dur, delay = 0, size = 6 + Math.random() * 7) => {
      const e = document.createElement("i");
      e.style.setProperty("--s", `${size.toFixed(1)}px`);
      embers.appendChild(e);
      e.animate([
        { transform: `translate(${from[0]}px, ${from[1]}px) scale(1)`, opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(${to[0]}px, ${to[1]}px) scale(.3)`, opacity: 0 },
      ], { duration: dur, delay, easing: "cubic-bezier(.3,.1,.4,1)", fill: "forwards" }).finished.then(() => e.remove());
    };
    // 1. Drawn in.
    sfx.relightRise();
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, r = 110 + Math.random() * 70;
      ember([Math.cos(a) * r, Math.sin(a) * r * .7], [0, 6], 650 + Math.random() * 250, Math.random() * 250);
    }
    stage.classList.add("is-charging");
    await wait(900);
    // 2. It catches.
    sfx.relightIgnite();
    stage.classList.remove("is-charging"); stage.classList.add("is-lit");
    card.classList.add("is-relit");
    // Behind the window: the same flame, huge and translucent, rising and fading in waves.
    backfire(el, card, "../assets/img/quests/streak-flame.webp", { at: "bottom" });
    for (let i = 0; i < 30; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.6, r = 90 + Math.random() * 110;
      ember([0, 0], [Math.cos(a) * r, Math.sin(a) * r], 900 + Math.random() * 600, Math.random() * 120);
    }
    // 3. The days come back, embers keep rising.
    const rise = setInterval(() => ember([(Math.random() - .5) * 50, 10], [(Math.random() - .5) * 90, -110 - Math.random() * 60], 1400 + Math.random() * 600, 0, 4 + Math.random() * 5), 110);
    await wait(450);
    const step = Math.max(70, Math.min(260, 1300 / Math.max(1, n)));
    for (let k = 1; k <= n; k++) {
      days.textContent = t("questsDays", { n: k });
      days.classList.remove("is-tick"); void days.offsetWidth; days.classList.add("is-tick");
      sfx.relightDay(k);
      await wait(step);
    }
    // 4. Held a moment; a click closes earlier.
    await Promise.race([wait(2400), new Promise(r => el.addEventListener("pointerdown", r, { once: true }))]);
    clearInterval(rise);
  };

  let resolveOut;
  const finish = how => { if (mode === "repair") ambientStop(); el.classList.remove("is-open"); setTimeout(() => el.remove(), 200); resolveOut(how); };
  el.addEventListener("mousedown", e => { if (e.target === el) finish("back"); });
  el.addEventListener("keydown", e => { if (e.key === "Escape") finish("back"); });
  el.addEventListener("click", e => {
    const seg = e.target.closest("[data-target]");
    if (seg) { target = seg.dataset.target; picked = null; render(); return; }
    const f = e.target.closest(".qfm-f");
    if (f && !f.disabled) {
      picked = f.dataset.uid;
      const row = body.querySelector(".qfm-row-f"), scroll = row?.scrollLeft || 0, q = body.querySelector("[data-qfm-q]")?.value || "";
      render();
      const inp = body.querySelector("[data-qfm-q]"); if (inp && q) { inp.value = q; inp.dispatchEvent(new Event("input")); }
      const row2 = body.querySelector(".qfm-row-f"); if (row2) { row2.scrollLeft = scroll; showPicked(row2); }   // the row stays where it was, the pick in view
    }
  });
  render();
  // Opened on a friend: the focus goes to that tile (focusing the first one would
  // scroll the row back to the start) and the row brings it into view.
  setTimeout(() => {
    (el.querySelector('.qfm-f[aria-checked="true"]') || el.querySelector(".qfm-f, .qfm-go"))?.focus({ preventScroll: true });
    showPicked(body.querySelector(".qfm-row-f"), false);
  }, 220);
  return new Promise(r => { resolveOut = r; });
}
