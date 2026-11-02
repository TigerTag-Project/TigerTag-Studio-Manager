/**
 * dialog.js — THE window of the app (.agents/rules/dialogs.md). Every new small window
 * goes through openDialog(); the older families move onto it one by one.
 *
 * Two looks, both already in the app:
 *   "notice"   — the Tiger Squad window (.squad-invite.squad-notice, 10-settings.css): a
 *                picture on top, a kicker, the title, one or two lines, optional cards, then
 *                the actions stacked full width — the orange one first. Information,
 *                confirmation, warning.
 *   "ceremony" — the TigerCoins window (.tc-reveal + .tcx card with the title plaque,
 *                quests.css): big rare moments and showing something big (a QR to scan).
 *
 *   openDialog({
 *     look: "notice" | "ceremony",
 *     cls,                         extra class(es) on the card (its own tweaks)
 *     art,                         an artImg() key (renderer/art.js) drawn on top
 *     icon,                        or an icon name in a tinted tile, when there is no art yet
 *     kicker, title, text,         plain strings (escaped here)
 *     body,                        markup between the text and the actions (already escaped)
 *     actions: [{ id, label, kind: "primary" | "secondary" | "danger", focus }],
 *     onAction(id, close),         a button was pressed; call close() to close
 *     onDismiss(),                 closed by the cross, Escape or a click outside
 *     wire(card, close),           anything else to bind (a hold-to-confirm, a field…)
 *     role: "dialog" | "alertdialog",
 *   }) → { card, close }
 *
 * The cross, Escape and a click outside close it (onDismiss); the focus goes to the
 * action marked `focus` (else the first one) and comes back where it was on close.
 */
import { artImg } from "./art.js";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let _seq = 0, _t = k => k;
// The app's t() (inventory.js), for the cross's label.
export function initDialogs({ t }) { _t = t; }

const ACTION_CLS = {
  notice: { primary: "tsq-join", secondary: "tsq-later", danger: "sqn-leave" },
  ceremony: { primary: "sqd-open sqd-wide qfm-go", secondary: "tsq-later", danger: "sqn-leave" },
};

function actionsHtml(look, actions) {
  return actions.map(a => {
    const label = look === "ceremony" && a.kind === "primary" ? `<span class="qfm-go-txt"><span>${esc(a.label)}</span></span>` : esc(a.label);
    // A danger action is held to confirm (.agents/rules/hold-to-confirm.md): its fill comes with it.
    const fill = a.kind === "danger" ? `<span class="hold-progress" aria-hidden="true"></span>` : "";
    return `<button type="button" class="dlg-act ${ACTION_CLS[look][a.kind || "secondary"]}" data-dlg="${esc(a.id)}">${fill}<span class="dlg-act-txt">${label}</span></button>`;
  }).join("");
}

function topHtml({ art, icon }) {
  if (art) return artImg(art, { cls: "sqn-art dlg-art" });
  return icon ? `<span class="dlg-ico" aria-hidden="true"><span class="icon icon-${esc(icon)}"></span></span>` : "";
}

export function openDialog(opts = {}) {
  const { look = "notice", cls = "", kicker = "", title = "", text = "", body = "", actions = [], role = "dialog" } = opts;
  const opener = document.activeElement;
  const labelId = `dlgTitle${++_seq}`;
  const parts = `
    ${topHtml(opts)}
    ${kicker ? `<span class="sqn-kicker">${esc(kicker)}</span>` : ""}
    ${title ? `<h2 class="tsq-title" id="${labelId}">${esc(title)}</h2>` : ""}
    ${text ? `<p class="tsq-desc">${esc(text)}</p>` : ""}
    ${body}`;
  let root, card;
  if (look === "ceremony") {
    root = document.createElement("div");
    root.className = "tc-reveal tc-envm qfs dlg dlg--ceremony";
    root.innerHTML = `
      <div class="tc-reveal-card tc-code-card tcx tcx--help tc-env-card qfs-card is-done${cls ? ` ${esc(cls)}` : ""}" role="${role}" aria-modal="true" aria-labelledby="${labelId}">
        <button type="button" class="dlg-x" data-dlg-x aria-label="${esc(_t("tutoClose"))}"><span class="icon icon-close icon-14" aria-hidden="true"></span></button>
        <div class="tcx-main">
          ${title ? `<div class="tcx-plaque"><h3 id="${labelId}">${esc(title)}</h3></div>` : ""}
          ${topHtml(opts)}
          ${body}
          ${text ? `<p class="qfs-line">${esc(text)}</p>` : ""}
          ${actions.length ? `<div class="tc-reveal-actions">${actionsHtml(look, actions)}</div>` : ""}
        </div>
      </div>`;
    card = root.querySelector(".tc-reveal-card");
    document.body.appendChild(root);
    requestAnimationFrame(() => root.classList.add("is-open"));
  } else {
    const bd = document.createElement("div");
    bd.className = "support-backdrop dlg-backdrop";
    card = document.createElement("div");
    card.className = `squad-invite squad-notice dlg dlg--notice${cls ? ` ${cls}` : ""}`;
    card.setAttribute("role", role);
    card.setAttribute("aria-modal", "true");
    if (title) card.setAttribute("aria-labelledby", labelId);
    card.innerHTML = `<button type="button" class="squad-invite-x" data-dlg-x aria-label="${esc(_t("tutoClose"))}"><span class="icon icon-close icon-14" aria-hidden="true"></span></button>
      <div class="tsq-scroll">${parts}${actions.length ? `<div class="dlg-acts">${actionsHtml(look, actions)}</div>` : ""}</div>`;
    document.body.append(bd, card);
    root = { remove: () => { card.remove(); bd.remove(); }, bd };
  }
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    document.removeEventListener("keydown", onKey, true);
    const done = () => { root.remove(); try { opener?.focus?.({ preventScroll: true }); } catch (_) {} };
    if (reduced()) { done(); return; }
    if (look === "ceremony") { root.classList.remove("is-open"); setTimeout(done, 220); }
    else { card.classList.add("is-closing"); root.bd.classList.add("is-closing"); setTimeout(done, 160); }
  };
  const dismiss = () => { if (closed) return; close(); opts.onDismiss?.(); };
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); dismiss(); } };
  document.addEventListener("keydown", onKey, true);
  card.querySelector("[data-dlg-x]").addEventListener("click", dismiss);
  if (look === "ceremony") root.addEventListener("mousedown", e => { if (e.target === root) dismiss(); });
  else root.bd.addEventListener("click", dismiss);
  card.querySelectorAll(".dlg-act").forEach(b => {
    const a = actions.find(x => x.id === b.dataset.dlg);
    if (a?.kind !== "danger") b.addEventListener("click", () => (opts.onAction ? opts.onAction(a.id, close) : close()));
  });
  opts.wire?.(card, close);
  const first = actions.find(a => a.focus) || actions.find(a => a.kind !== "danger");
  setTimeout(() => card.querySelector(first ? `[data-dlg="${first.id}"]` : "[data-dlg-x]")?.focus({ preventScroll: true }), 60);
  return { card, close };
}
