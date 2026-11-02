// "How it works" window for a Tiger Quests card (the ⓘ of the streak and freeze
// cards): the full-set window's frame (.tc-reveal · .tcx plaque), a body of
// rules, one "Got it" button. Click outside, Esc or the button closes.

/**
 * @param ctx { t, esc }
 * @param opts { title, body (HTML, already escaped), art? (image path) }
 */
export function showRulesWindow(ctx, { title, body, art = "" }) {
  const { t, esc } = ctx;
  if (document.querySelector(".qrules")) return;
  const opener = document.activeElement;
  const el = document.createElement("div");
  el.className = "tc-reveal tc-envm qrules";
  el.innerHTML = `
    <div class="tc-reveal-card tc-code-card tcx tcx--help qrules-card" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
      <div class="tcx-main">
        <div class="tcx-plaque"><h3>${esc(title)}</h3></div>
        ${art ? `<img class="qrules-art" src="${esc(art)}" alt="" aria-hidden="true">` : ""}
        <div class="qrules-body">${body}</div>
        <div class="tc-reveal-actions"><button type="button" class="sqd-open sqd-wide qfm-go qrules-ok"><span class="qfm-go-txt"><span>${esc(t("questsRulesOk"))}</span></span></button></div>
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.classList.add("is-open"); el.querySelector(".qrules-ok")?.focus(); });
  const close = () => {
    document.removeEventListener("keydown", onKey);
    el.classList.remove("is-open");
    setTimeout(() => { el.remove(); try { opener?.focus?.(); } catch (_) {} }, 200);
  };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  el.addEventListener("mousedown", e => { if (e.target === el) close(); });
  el.querySelector(".qrules-ok").addEventListener("click", close);
}
