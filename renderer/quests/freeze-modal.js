/**
 * quests/freeze-modal.js — the streak-freeze windows (docs/QUESTS.md §7): BUY,
 * GIVE and REPAIR, on the "Give an envelope" frame (squad-deals.js showEnvelope:
 * the art rising from behind the card, the title plaque, the friends grid, a
 * button held 2 s). Nothing is spent or sent before the hold completes; each
 * window shows the situation first (reserve before → after, price, balance).
 *
 *   openFreezeWindow(ctx, mode, data) → Promise<"done" | "back">
 *     ctx  = { t, esc, lang }
 *     mode = "buy" | "give" | "repair"
 *     data = { status (streakFreeze status), own, bonus, friends: [{ uid, name, avatar }],
 *              brokenStreak?, send(action, extra) → Promise<status> (throws Error(code)) }
 */
import { holdToFire, tilt } from "./coin-pull.js";

const ART = { buy: "freeze", give: "freeze-gift", repair: "freeze" };
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
  let target = "me";        // buy: "me" | "friend"
  let picked = null;        // a friend's uid
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
  tilt(el, el.querySelector(".qfm-art"), 18);
  const body = el.querySelector(".qfm-body"), actions = el.querySelector(".qfm-actions"), err = el.querySelector(".tc-code-err");
  const friendOf = uid => (st.friends || []).find(f => f.uid === uid);
  const nameOf = uid => (data.friends || []).find(f => f.uid === uid)?.name || "";

  // A friend tile: the envelope window's tile plus their bonus slots and why they can't receive.
  const tile = (f, why) => {
    const who = (data.friends || []).find(x => x.uid === f.uid); if (!who) return "";
    const free = Math.max(0, f.bonusMax - f.bonus);
    const note = why || t("questsFreezeSlotsFree", { n: free, filled: f.bonus, max: f.bonusMax });
    return `<button type="button" role="radio" aria-checked="${picked === f.uid}" class="tc-give-f qfm-f" data-uid="${esc(f.uid)}" data-name="${esc(who.name)}"${why ? " disabled" : ""}>
        <span class="tc-give-av">${who.avatar}<span class="tc-give-check" aria-hidden="true"><span class="icon icon-check icon-11"></span></span></span>
        <span class="tc-give-name">${esc(who.name)}</span>
        ${slots(f.bonus, f.bonusMax)}
        <small class="qfm-f-note">${esc(note)}</small>
      </button>`;
  };
  const picker = (whyOf) => {
    const list = (st.friends || []).filter(f => (data.friends || []).some(x => x.uid === f.uid));
    if (!list.length) return `<p class="tc-give-left">${esc(t("questsFreezeNoFriends"))}</p>`;
    // Who can receive first, the others after, greyed with their reason.
    const ok = list.filter(f => !whyOf(f)), no = list.filter(f => whyOf(f));
    return `${list.length > 8 ? `<label class="sqd-search tc-give-search"><span class="icon icon-search icon-13" aria-hidden="true"></span><input type="search" data-qfm-q placeholder="${esc(t("friendsSearch"))}" autocomplete="off"></label>` : ""}
      <div class="tc-give-list qfm-list" role="radiogroup" aria-label="${esc(t("envGivePick"))}">${[...ok, ...no].map(f => tile(f, whyOf(f))).join("")}</div>`;
  };
  const row = (label, from, to) => `<div class="qfm-row"><span>${esc(label)}</span><b>${from}${to != null ? ` <span class="qfm-arrow" aria-hidden="true">→</span> ${to}` : ""}</b></div>`;

  // ── The three windows ──────────────────────────────────────────────────────
  const render = () => {
    err.hidden = true;
    const caps = st.caps || { own: 1, bonus: 1 }, price = st.price ?? 5, balance = st.balance ?? 0;
    let html = "", ready = false, label = "", note = "";
    if (mode === "buy") {
      const fullWhy = f => f.bonus >= f.bonusMax ? t("questsFreezeFull") : "";
      html = `<div class="qfm-seg" role="tablist">
          <button type="button" role="tab" data-target="me" aria-selected="${target === "me"}">${esc(t("questsFreezeForMe"))}</button>
          <button type="button" role="tab" data-target="friend" aria-selected="${target === "friend"}">${esc(t("questsFreezeForFriend"))}</button>
        </div>`;
      if (target === "friend") html += picker(fullWhy);
      const f = target === "friend" ? friendOf(picked) : null;
      const recap = [];
      if (target === "me") recap.push(row(t("questsFreezeOwnReserve"), `${slots(own, caps.own)} ${own}/${caps.own}`, own < caps.own ? `${own + 1}/${caps.own}` : null));
      else if (f) recap.push(row(t("questsFreezeTheirReserve", { name: nameOf(picked) }), `${f.bonus}/${f.bonusMax}`, `${f.bonus + 1}/${f.bonusMax}`));
      recap.push(row(t("questsFreezePrice"), `${price} TigerCoins`));
      recap.push(row(t("questsFreezeBalance"), `${balance}`, balance >= price ? `${balance - price}` : null));
      html += `<div class="qfm-recap">${recap.join("")}</div><p class="qfm-hint">${esc(t("questsFreezeUseHint"))}</p>`;
      // Why it can't be bought right now, said before any hold.
      note = !st.tier ? t("questsFreezeErrSquad")
        : balance < price ? t("questsFreezeNeedCoins", { n: price - balance })
        : target === "me" && own >= caps.own ? t("questsFreezeOwnFull")
        : target === "friend" && !f ? t("questsFreezePickFriend") : "";
      ready = !note;
      label = target === "friend" && f ? t("questsFreezeBuyGoFor", { n: price, name: nameOf(picked) }) : t("questsFreezeBuyGo", { n: price });
    } else if (mode === "give") {
      const g = st.toGive;
      const whyOf = f => f.given ? t("questsFreezeGiven") : f.bonus >= f.bonusMax ? t("questsFreezeFull") : "";
      html = g ? `<p class="tc-give-count">${esc(t("questsFreezeToGive", { n: g.n, days: daysUntil(g.until) }))}</p>
          <p class="qfm-hint">${esc(t("questsFreezeGiveRule"))}</p>${picker(whyOf)}`
        : `<p class="tc-give-left is-none">${esc(t("questsFreezeErrNothing"))}</p>`;
      const f = friendOf(picked);
      if (f) html += `<div class="qfm-recap">${row(t("questsFreezeTheirReserve", { name: nameOf(picked) }), `${f.bonus}/${f.bonusMax}`, `${f.bonus + 1}/${f.bonusMax}`)}</div>`;
      note = !g ? " " : !f ? t("questsFreezePickFriend") : "";
      ready = !!g && !!f;
      label = f ? t("questsFreezeGiveGo", { name: nameOf(picked) }) : t("envGiveShort");
    } else {
      const n = data.brokenStreak || st.broken?.streak || 0;
      html = `<div class="qfm-recap">${row(t("questsFreezeStreak"), "0", t("questsDays", { n }))}${row(t("questsFreezeRepairsLeft"), "1", "0")}</div>
        <p class="qfm-hint">${esc(t("questsFreezeRepairHint"))}</p>`;
      ready = !!n; label = t("questsFreezeRepair", { n });
    }
    body.innerHTML = html;
    actions.innerHTML = `
      ${note.trim() ? `<p class="qfm-why">${esc(note)}</p>` : ""}
      <button type="button" class="sqd-open tp-hold tp-ten sqd-wide qfm-go"${ready ? "" : " disabled"}><span class="tp-fill" aria-hidden="true"></span><span>${esc(label)}</span></button>
      <button type="button" class="tc-code-cancel" data-qfm="cancel">${esc(t("cancelLabel"))}</button>`;
    const go = actions.querySelector(".qfm-go");
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

  let resolveOut;
  const finish = how => { el.classList.remove("is-open"); setTimeout(() => el.remove(), 200); resolveOut(how); };
  el.addEventListener("mousedown", e => { if (e.target === el) finish("back"); });
  el.addEventListener("keydown", e => { if (e.key === "Escape") finish("back"); });
  el.addEventListener("click", e => {
    if (e.target.closest("[data-qfm=cancel]")) { finish("back"); return; }
    const seg = e.target.closest("[data-target]");
    if (seg) { target = seg.dataset.target; picked = null; render(); return; }
    const f = e.target.closest(".qfm-f");
    if (f && !f.disabled) { picked = f.dataset.uid; const q = body.querySelector("[data-qfm-q]")?.value || ""; render(); const inp = body.querySelector("[data-qfm-q]"); if (inp && q) { inp.value = q; inp.dispatchEvent(new Event("input")); } }
  });
  render();
  setTimeout(() => el.querySelector(".qfm-go:not(:disabled), .qfm-f:not(:disabled), [data-qfm=cancel]")?.focus(), 220);
  return new Promise(r => { resolveOut = r; });
}
