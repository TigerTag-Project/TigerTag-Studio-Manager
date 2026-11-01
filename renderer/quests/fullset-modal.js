// "Daily set complete": the window that confirms the day's last quest, wherever
// the member is (quests/index.js onDaily, once, when bonusPaid turns true).
// A big moment in a modal window (.agents/rules/ui-ux-defaults.md "Big moments"):
// the closed chest trembles, bursts open with a flash and a shock ring while the
// open chest swells behind the window (backfire), the bonus XP counts up, the
// streak flame takes its +1 (with the combo, and the palier bonus when one was
// paid at the same time), then the line and a golden "Nice" button. A click on
// the button or outside closes. Reduced motion: the end state at once.
import { backfire } from "./coin-pull.js";
import { sfx } from "./coin-sound.js";

const ART = "../assets/img/quests/";
const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * @param ctx { t, esc }
 * @param data { xp, streak, combo, palierXp }
 */
export function showFullSetWindow(ctx, { xp = 20, streak = 0, combo = 0, palierXp = 0 } = {}) {
  const { t, esc } = ctx;
  const el = document.createElement("div");
  el.className = "tc-reveal tc-envm qfs";
  el.innerHTML = `
    <div class="tc-reveal-card tc-code-card tcx tcx--help tc-env-card qfs-card" role="dialog" aria-modal="true" aria-label="${esc(t("questsFullSet"))}">
      <div class="tcx-main">
        <div class="tcx-plaque"><h3>${esc(t("questsFullSet"))}</h3></div>
        <div class="qfs-stage" aria-hidden="true">
          <span class="qfs-glow"></span><span class="qfs-ring"></span><span class="qfs-sparks"></span>
          <img class="qfs-chest qfs-chest--closed" src="${ART}full-set-chest-closed-v2.webp" alt="">
          <img class="qfs-chest qfs-chest--open" src="${ART}full-set-chest-v2.webp" alt="">
        </div>
        <p class="qfs-xp" role="status"><b>+0 XP</b></p>
        <p class="qfs-streak"><img src="${ART}streak-flame.webp" alt="" aria-hidden="true">
          <span><small>${esc(t("questsStreakTitle"))}</small><b>${esc(t("questsDays", { n: Math.max(0, streak - 1) }))}</b></span>
          ${combo > 1 ? `<em class="qfs-combo">${esc(t("questsComboBadge", { n: combo }))}</em>` : ""}
          ${palierXp ? `<em class="qfs-palier">+${palierXp} XP</em>` : ""}</p>
        <p class="qfs-line">${esc(t("questsFullSetDone"))}</p>
        <div class="tc-reveal-actions"><button type="button" class="sqd-open sqd-wide qfm-go qfs-ok"><span class="qfm-go-txt"><span>${esc(t("questsFullSetOk"))}</span></span></button></div>
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-open"));
  const card = el.querySelector(".qfs-card"), stage = el.querySelector(".qfs-stage");
  const xpEl = el.querySelector(".qfs-xp b"), daysEl = el.querySelector(".qfs-streak b");

  let resolveOut;
  const finish = () => { el.classList.remove("is-open"); setTimeout(() => el.remove(), 200); resolveOut?.(); };
  el.addEventListener("mousedown", e => { if (e.target === el) finish(); });
  el.addEventListener("keydown", e => { if (e.key === "Escape") finish(); });
  el.querySelector(".qfs-ok").addEventListener("click", finish);

  const spark = (to, dur, delay, size = 6 + Math.random() * 6) => {
    const s = document.createElement("i");
    s.style.setProperty("--s", `${size.toFixed(1)}px`);
    el.querySelector(".qfs-sparks").appendChild(s);
    s.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${to[0]}px, ${to[1]}px) scale(.3)`, opacity: 0 },
    ], { duration: dur, delay, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }).finished.then(() => s.remove());
  };

  const play = async () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stage.classList.add("is-open"); card.classList.add("is-done");
      xpEl.textContent = `+${xp} XP`; daysEl.textContent = t("questsDays", { n: streak });
      return;
    }
    await wait(350);
    // 1. The chest trembles, harder and harder.
    stage.classList.add("is-shaking");
    for (let k = 0; k < 6; k++) { sfx.rattle(k / 5); await wait(110); }
    // 2. It bursts open: flash, ring, sparks, the open chest swelling behind the window.
    stage.classList.remove("is-shaking"); stage.classList.add("is-open");
    sfx.burst();
    backfire(el, card, `${ART}full-set-chest-v2.webp`, { size: 560 });
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.7, r = 90 + Math.random() * 120;
      spark([Math.cos(a) * r, Math.sin(a) * r], 800 + Math.random() * 500, Math.random() * 100);
    }
    await wait(420);
    // 3. The bonus XP counts up.
    card.classList.add("is-xp");
    const steps = Math.min(xp, 20);
    for (let k = 1; k <= steps; k++) {
      xpEl.textContent = `+${Math.round(xp * k / steps)} XP`;
      if (k % 2 === 0 || k === steps) sfx.relightDay(k / 2);
      await wait(45);
    }
    // 4. The streak takes its +1 (and the combo / palier, when there is one).
    await wait(250);
    card.classList.add("is-done");
    daysEl.textContent = t("questsDays", { n: streak });
    daysEl.classList.add("is-tick");
    sfx.relightIgnite();
  };
  play();
  setTimeout(() => el.querySelector(".qfs-ok")?.focus({ preventScroll: true }), 300);
  return new Promise(r => { resolveOut = r; });
}
