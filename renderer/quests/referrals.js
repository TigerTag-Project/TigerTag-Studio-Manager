/**
 * quests/referrals.js — invite a friend, both get envelopes (spec: docs/REFERRALS.md).
 *
 * The SERVER decides everything (TigerTag_Firebase_Backend functions/referrals.js):
 * the claim ("Who invited you?", within 7 days of the account's creation), the
 * validation (the invitee's e-mail verified, within 7 days of the claim), the
 * envelopes and the trophies. This module shows it:
 *   - the Invite view (view mode "squadInvite"): the link, the share buttons,
 *     the QR, the "Who invited you?" card while the account may still claim,
 *     the list of invitees and their state;
 *   - the field of the onboarding's step 2 (claimReferral);
 *   - the ceremony when a referral validates, once per side (server `seen`).
 *
 *   initReferrals({ t, esc, token() → ID token, uid() → active uid | null,
 *                   avatar(who, cls) → markup, qr(url, opts) → data URL,
 *                   shareUrl(net, url, text) → URL | null, inviteUrl(code), openExternal(url),
 *                   copy(text, button, message?) — copies, flashes "Copied" on the button (+ a snackbar), lookupCode(code) → Promise<{ uid, displayName, photoURL, color } | null>,
 *                   openEnvelopes(), onChange() })
 *   referralsSignIn(uid) / referralsSignOut()
 *   renderInviteView(host) · referralStatus() → the last status | null
 *   claimReferral(code) → status (throws the server's code) · referralWantsCode(code) → Promise<bool>
 */
import { backfire } from "./coin-pull.js";
import { sfx } from "./coin-sound.js";
import { heroHtml, infoTipHtml, myCodeCardHtml } from "./ui-kit.js";
import { heroLayersHtml } from "./hero-layers.js";
import { tapEgg } from "./squad-deals.js";
import { artImg } from "../art.js";
import { openDialog } from "../dialog.js";

const URL_BASE = "https://us-central1-tigertag-connect.cloudfunctions.net/referrals";
const ART = "../assets/img/";
// Every network of the share grid, all shown: [id, icon, colour class (.lv-social--*), brand name].
// The ones with no share URL on a desktop (Discord, WeChat, Messenger, KakaoTalk) copy the
// message instead (COPY_NETS), with a snackbar saying where to paste it.
const NETS = [
  ["whatsapp", "whatsapp", "wa", "WhatsApp"], ["wechat", "wechat", "wechat", "WeChat"], ["telegram", "telegram", "telegram", "Telegram"],
  ["messenger", "messenger", "messenger", "Messenger"], ["discord", "discord", "discord", "Discord"],
  ["x", "x", "x", "X"], ["facebook", "facebook", "fb", "Facebook"], ["reddit", "reddit", "reddit", "Reddit"],
  ["bluesky", "bluesky", "bluesky", "Bluesky"], ["line", "line-app", "line", "LINE"],
  ["kakaotalk", "kakaotalk", "kakao", "KakaoTalk"], ["vk", "vk", "vk", "VK"], ["sms", "chat", "sms", "SMS"], ["email", "mail", "mail", "E-mail"],
];
const COPY_NETS = ["discord", "wechat", "messenger", "kakaotalk"];
// The banner scene (docs/ART-DIRECTION.md, one layer per object): one tiger hands the envelope to the
// other behind the desk, a spool and a printed tiger between them, three envelopes on each side.
// Every envelope wiggles when clicked; the middle one on the right hides the inviteBanner easter egg
// (tapEgg, .agents/rules/easter-eggs.md) until it is found.
const EGG = "inviteBanner";
const ENVS = (side, egg) => ({ html: `<span class="hl hl--envs hl--envs-${side}">${[0, 1, 2].map(i =>
  `<img src="${ART}tigercoins/envelope.webp"${egg && i === 1 ? ` data-egg="${EGG}"` : ""} alt="" draggable="false">`).join("")}</span>` });
// Laddered pictures (renderer/art.js): Chromium loads the rendition that fits the rendered size.
const LAYER = name => ({ html: artImg(`tigersquad/invite-hero/${name}`, { cls: `hl hl--${name}` }) });
const inviteScene = egg => heroLayersHtml(`${ART}tigersquad/invite-hero/`, {
  back: [LAYER("tiger-give"), LAYER("tiger-take")],
  front: [ENVS("a"), LAYER("spool"), LAYER("figurine"), ENVS("b", egg)],
});
// Validated referrals → the next trophy (trophyRules.js COUNTERS.referrals; 25 and 50 are hidden).
const STEPS = [1, 5, 10];

let _ctx = null, _uid = null, _status = null, _busy = false, _prefill = "", _celebrating = false, _loading = false, _noCode = false;

export function initReferrals(ctx) { _ctx = ctx; }
export const referralStatus = () => _status;

async function call(action, extra = {}) {
  const uid = _uid;
  if (!uid || !_ctx) return null;
  const token = await _ctx.token();
  if (!token || uid !== _uid) return null;
  const r = await fetch(URL_BASE, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...extra }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "ERROR");
  if (uid !== _uid) return null;
  if (action !== "seen") { _status = j; _ctx.onChange?.(); celebrate(); }
  return j;
}

export async function referralsSignIn(uid) {
  _uid = uid; _status = null; _prefill = "";
  try { await call("status"); } catch (e) { console.warn("[referrals] status", e.message); }
}
export function referralsSignOut() { _uid = null; _status = null; _prefill = ""; }
/** Read the status again (the friend code changed: the Invite view shows the new one). */
export const refreshReferrals = () => call("status").catch(e => console.warn("[referrals] status", e.message));

export async function claimReferral(code) {
  const j = await call("claim", { code: String(code || "").toUpperCase() });
  _prefill = "";
  return j;
}

/* A friend link opened by this account: true when it can still declare a referrer
   (the code waits in the "Who invited you?" field), false = an ordinary friend link. */
export async function referralWantsCode(code) {
  if (!_status) { try { await call("status"); } catch (_) { return false; } }
  if (!_status?.claim?.canClaim) return false;
  _prefill = code;
  _ctx.onChange?.();
  return true;
}
export const referralPrefill = () => _prefill;

const shareText = () => _ctx.t("referralShareText", { n: _status?.cfg?.envelopes || 3 });
const shareLink = () => (_status?.code ? _ctx.inviteUrl(_status.code) : "");

export const errText = code => {
  const k = `referralErr_${code}`, s = _ctx.t(k);
  return s === k ? _ctx.t("referralErr_ERROR") : s;
};

/* One invitee, one table row: the friend, the day they joined, then each stage —
   account created (always, they are listed once they have one), e-mail confirmed,
   envelopes received (paid on the confirmation) — as done, waiting or expired. */
function inviteeRow(x) {
  const { t, esc } = _ctx;
  // An orange check when done, a dash while waiting, a red cross once expired (the words stay for screen readers).
  const cell = st => st === "yes"
    ? `<td class="rf-st rf-st--yes"><span class="icon icon-check icon-16" role="img" aria-label="${esc(t("referralCellYes"))}"></span></td>`
    : st === "expired"
      ? `<td class="rf-st rf-st--expired"><span class="icon icon-close icon-14" role="img" aria-label="${esc(t("referralState_expired"))}"></span></td>`
      : `<td class="rf-st rf-st--wait"><span role="img" aria-label="${esc(t("referralCellWaiting"))}">—</span></td>`;
  const done = x.state === "validated" ? "yes" : x.state === "expired" ? "expired" : "wait";
  return `<tr><td><span class="rf-who">${_ctx.avatar(x, "sb-friend-avatar")}<b>${esc(x.name || "?")}</b></span></td>
    <td class="rf-date">${x.claimedAt ? esc(new Date(x.claimedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })) : "—"}</td>
    ${cell("yes")}${cell(done)}${cell(done)}</tr>`;
}

function codeFieldHtml(id, value = "", label = true) {
  const { t, esc } = _ctx;
  // One field for the whole code (pasted or typed, with or without the dash) + Paste inside it.
  return `${label ? `<label class="rf-code-lbl" for="rfCode-${id}">${esc(t("referralCodeLabel"))}</label>` : ""}
    <div class="rf-code" data-rf-code="${id}">
      <input class="dns-input rf-code-in" id="rfCode-${id}" data-rf-in aria-label="${esc(t("referralCodeLabel"))}" value="${esc(value || "")}" placeholder="${esc(t("referralCodePh"))}" autocomplete="off" spellcheck="false">
      <button type="button" class="rf-paste" data-rf-paste><span class="icon icon-copy icon-14" aria-hidden="true"></span><span>${esc(t("referralPaste"))}</span></button>
    </div>
    <div class="rf-preview" data-rf-preview hidden></div>
    <p class="rf-err" data-rf-err role="alert" aria-live="polite"></p>`;
}

/* Wires a code field: uppercase, the dash added after three characters, Paste, the
   live preview of the code's owner. Answers () → the code typed ("" when incomplete). */
export function wireCodeField(root, onValid) {
  const input = root.querySelector("[data-rf-in]");
  const prev = root.querySelector("[data-rf-preview]"), err = root.querySelector("[data-rf-err]");
  const norm = v => { const c = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c; };
  const complete = () => /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(input.value);
  let seq = 0;
  const changed = async () => {
    err.textContent = ""; prev.hidden = true;
    onValid?.(false);
    if (!complete()) return;
    const mine = ++seq, p = await _ctx.lookupCode(input.value).catch(() => null);
    if (mine !== seq) return;
    if (!p) { err.textContent = errText("UNKNOWN_CODE"); return; }
    if (p.uid === _uid) { err.textContent = errText("SELF"); return; }
    prev.innerHTML = `${_ctx.avatar(p, "sb-friend-avatar")}<b>${_ctx.esc(p.displayName || "?")}</b>`;
    prev.hidden = false;
    onValid?.(true);
  };
  const setCode = code => {
    // A pasted link ends with the code: the dashed form first, then six characters on their own.
    const v = String(code || "").toUpperCase().trim();
    const m = v.match(/([A-Z0-9]{3})-([A-Z0-9]{3})(?![A-Z0-9])/) || v.match(/^([A-Z0-9]{3})([A-Z0-9]{3})$/);
    if (!m) return false;
    input.value = `${m[1]}-${m[2]}`;
    changed();
    return true;
  };
  input.addEventListener("input", () => {
    if (input.value.length > 7) { if (!setCode(input.value)) input.value = norm(input.value); return; }
    input.value = norm(input.value);
    changed();
  });
  root.querySelector("[data-rf-paste]")?.addEventListener("click", async () => {
    // Read only on this tap: the landing page put the code there (docs/REFERRALS.md §2).
    try { if (!setCode(await navigator.clipboard.readText())) err.textContent = errText("UNKNOWN_CODE"); } catch (_) {}
  });
  input.value = norm(input.value);
  if (complete()) changed();
  return { value: () => (complete() ? input.value : ""), error: text => { err.textContent = text; }, setCode };
}

export function codeFieldMarkup(value) { return codeFieldHtml("onb", value, false); }   // its label is the step's own

export function renderInviteView(host) {
  if (!_ctx || !host) return;
  const { t, esc } = _ctx;
  const s = _status;
  // No status yet (the launch call failed or is still out): ask again, once at a time.
  if (!s && _uid && !_loading) { _loading = true; call("status").catch(e => console.warn("[referrals] status", e.message)).finally(() => { _loading = false; }); }
  const sig = JSON.stringify([_uid, s, _prefill, _busy, _noCode, t("referralTitle")]);
  if (host._rfSig === sig && host.childElementCount) return;
  host._rfSig = sig;
  const link = shareLink(), validated = s?.validated || 0, envs = s?.cfg?.envelopes || 3;
  const next = STEPS.find(n => n > validated);
  const pct = next ? Math.round((validated / next) * 100) : 100;
  // Right of the banner: the progress card — confirmed friends and the bar to the next trophy (the Workshop's .sqr-bar).
  const side = `
    <div class="sqr-card rf-hero-card" role="group" aria-label="${esc(t("referralCardTitle", { n: validated }))}">
      <span class="rf-hero-lbl">${esc(t("referralCardTitle", { n: validated }))}${infoTipHtml(esc, t("referralCardHint"), { size: 12 })}</span>
      <b class="trp-hero-n">${validated}</b>
      <span class="sqr-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
      ${next ? `<small>${esc(t("referralCardNext", { a: validated, b: next }))}</small>` : ""}
    </div>`;
  // Every network at once, as its logo alone (the name is the aria-label: the logo says it).
  const nets = NETS.map(([id, icon, cls, label]) =>
    `<button type="button" class="rf-net" data-rf-net="${id}" aria-label="${esc(label)}"><span class="lv-social lv-social--${cls}" aria-hidden="true"><span class="icon icon-${icon}"></span></span></button>`).join("");
  // The QR stays in view: the friend standing next to you scans the screen.
  const qr = link ? _ctx.qr(link, { size: 280, margin: 2 }) : "";
  // "A friend invited you?" — only while this account may still claim: a card on top, apart from
  // the sharing. "I have no code" folds it to one line, which opens it again until the deadline.
  const canClaim = !!s?.claim?.canClaim;
  const claimCard = !canClaim ? "" : _noCode ? `
    <button type="button" class="rf-card rf-claim-fold" data-rf-nocode><span class="icon icon-gift icon-16" aria-hidden="true"></span>${esc(t("referralWhoTitle"))}
      <span class="rf-days">${esc(t("referralDaysLeft", { n: s.claim.daysLeft }))}</span></button>` : `
    <section class="rf-card rf-claim">
      <div class="rf-claim-head"><span class="rf-claim-ic"><span class="icon icon-gift icon-18" aria-hidden="true"></span></span>
        <span class="rf-row-txt"><b class="rf-claim-title">${esc(t("referralWhoTitle"))}</b><small>${esc(t("referralWhoSub", { e: envs }))}</small></span>
        <span class="rf-days"><span class="icon icon-clock icon-12" aria-hidden="true"></span>${esc(t("referralDaysLeft", { n: s.claim.daysLeft }))}</span></div>
      <div class="rf-claim-row"><div class="rf-claim-field" data-rf-claim>${codeFieldHtml("view", _prefill)}</div>
        <button type="button" class="sqd-open rf-claim-go" data-rf-claim-go disabled>${esc(t("referralClaim"))}</button>
        <button type="button" class="rf-nocode" data-rf-nocode>${esc(t("referralNoCode"))}</button></div>
    </section>`;
  const mine = s?.mine ? `
    <section class="rf-card rf-mine">
      ${_ctx.avatar(s.mine.referrer, "sb-friend-avatar")}
      <span class="rf-row-txt"><b>${esc(t("referralInvitedBy", { name: s.mine.referrer?.name || "?" }))}</b>
        <small>${esc(s.mine.state === "pending" ? t("referralVerifyHint") : t(`referralState_${s.mine.state}`))}</small></span>
      <span class="rf-pill rf-pill--${esc(s.mine.state)}">${esc(t(`referralState_${s.mine.state}`))}</span>
    </section>` : "";
  const cols = ["referralColFriend", "referralColDate", "referralColAccount", "referralColEmail", "referralColEnvelopes"];
  const list = `${s?.invitees?.length ? `<div class="rf-table-wrap"><table class="rf-table">
      <thead><tr>${cols.map(k => `<th>${esc(t(k))}</th>`).join("")}</tr></thead>
      <tbody>${s.invitees.map(inviteeRow).join("")}</tbody></table></div>`
    : `<p class="rf-empty"><b>${esc(t("referralNoInvitees"))}</b> ${esc(t("referralNoInviteesSub"))}</p>`}`;
  // How it works, as a metro line: three numbered stations on one line, each step under its stop.
  // Shown first, under the banner ("How it works": the banner already says what you both get), before the sharing.
  const steps = [["send", 1], ["user", 2], ["mail", 3]].map(([icon, n]) => `
    <li class="rf-stop"><span class="rf-stop-dot" aria-hidden="true">${n}</span>
      <b><span class="icon icon-${icon} icon-14" aria-hidden="true"></span>${esc(t(`referralStep${n}`))}</b>
      <small>${esc(t(`referralStep${n}Sub`, { n: envs }))}</small></li>`).join("");
  host.innerHTML = `
    ${heroHtml(esc, { cls: "sqr-hero rf-hero", eyebrow: t("squadBrand"), title: t("referralTitle"), sub: t("referralTagline", { n: envs }), scene: inviteScene(!_ctx.eggFound?.(EGG)), side })}
    ${!s ? `<div class="trp-loading">${esc(t("questsLoading"))}</div>` : `
    <p class="rf-friend-gets"><span class="icon icon-gift icon-16" aria-hidden="true"></span>${esc(t("referralHowTitle"))}</p>
    <ol class="rf-steps">${steps}</ol>
    ${claimCard}${mine}
    <section class="rf-card rf-share">
      <h3><span class="icon icon-link icon-16" aria-hidden="true"></span>${esc(t(canClaim ? "referralLinkTitleToo" : "referralLinkTitle"))}</h3>
      <div class="rf-share-body">
      <div class="rf-share-main">
      <div class="rf-link-bar"><input class="dns-input rf-link" readonly value="${esc(link)}" aria-label="${esc(t("referralLinkTitle"))}">
        <button type="button" class="rf-link-copy" data-rf-copy><span class="icon icon-copy icon-14" aria-hidden="true"></span><span class="rf-copy-lbls"><span>${esc(t("referralCopyMyLink"))}</span><span aria-hidden="true">${esc(t("referralLinkCopied"))}</span></span></button></div>
      <div class="rf-net-grid">${nets}</div>
      <div class="rf-msg-row"><span class="rf-msg-lbl"><span class="icon icon-chat icon-14" aria-hidden="true"></span>${esc(t("referralMsgTitle"))}</span>
        <p class="rf-msg">${esc(shareText())} ${esc(link)}</p>
        <button type="button" class="rf-msg-copy" data-rf-msg-copy aria-label="${esc(t("referralMsgCopy"))}"><span class="icon icon-copy icon-14" aria-hidden="true"></span></button></div>
      </div>
      ${qr ? myCodeCardHtml(esc, { cls: "rf-mycode", label: t("friendsMyCode"), code: s.code, qr,
        zoomLabel: t("referralQrBig"), regenLabel: t("regenLabel"),
        actions: [{ act: "share", icon: "link", label: t("friendsShareLink") }, { act: "download", icon: "download", label: t("referralQrDownload") }] }) : ""}
      </div>
    </section>
    <section class="rf-card">
      <h3><span class="icon icon-user icon-16" aria-hidden="true"></span>${esc(t("referralMyInvitees"))}</h3>
      ${list}
    </section>`}`;
  // The banner's envelopes: each one wiggles; the egg one counts the three quick clicks (tapEgg).
  host.querySelectorAll(".rf-hero .hl--envs img").forEach(img => img.addEventListener("click", () => {
    if (img.dataset.egg) return tapEgg(img, img.dataset.egg, _ctx, host, () => img.removeAttribute("data-egg"));
    img.addEventListener("animationend", () => img.classList.remove("is-tapped"), { once: true });
    img.classList.remove("is-tapped"); void img.offsetWidth; img.classList.add("is-tapped");
    sfx.tick();
  }));
  host.querySelector('[data-mc-act="share"]')?.addEventListener("click", e => _ctx.copy(link, e.currentTarget));
  // The main button says it worked, in place ("Link copied!"), then goes back. Both labels
  // are stacked in the button, so it keeps the width of the longer one: it never resizes.
  host.querySelector("[data-rf-copy]")?.addEventListener("click", async e => {
    const b = e.currentTarget;
    await _ctx.copy(link, b);
    b.classList.add("is-done");
    clearTimeout(b._rfT); b._rfT = setTimeout(() => b.classList.remove("is-done"), 1600);
  });
  host.querySelector("[data-rf-nocode]")?.addEventListener("click", () => { _noCode = !_noCode; renderInviteView(host); });
  host.querySelector("[data-rf-msg-copy]")?.addEventListener("click", e => _ctx.copy(`${shareText()} ${link}`, e.currentTarget));
  // The QR opens it big; the corner icon asks for a new code (confirmed first, host side).
  host.querySelector("[data-mc-zoom]")?.addEventListener("click", () => showQrWindow(link));
  host.querySelector("[data-mc-regen]")?.addEventListener("click", () => _ctx.regenCode?.());
  host.querySelectorAll("[data-rf-net]").forEach(b => b.addEventListener("click", () => share(b.dataset.rfNet, b)));
  host.querySelector('[data-mc-act="download"]')?.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = _ctx.qr(link, { size: 640, margin: 4 }); a.download = `tigertag-invite-${s.code}.png`; a.click();
  });
  const claimRoot = host.querySelector("[data-rf-claim]");
  if (claimRoot) {
    const go = host.querySelector("[data-rf-claim-go]");
    const field = wireCodeField(claimRoot, ok => { go.disabled = !ok || _busy; });
    go.addEventListener("click", async () => {
      const code = field.value(); if (!code) return;
      _busy = true; go.disabled = true;
      try { await claimReferral(code); } catch (e) { field.error(errText(e.message)); } finally { _busy = false; go.disabled = false; }
    });
  }
}

function share(net, button) {
  const link = shareLink(), text = shareText();
  if (!link) return;
  // No share URL on a desktop: the message is copied, to paste in the app.
  if (COPY_NETS.includes(net)) { _ctx.copy(`${text} ${link}`, button, _ctx.t("referralAppCopied", { app: NETS.find(n => n[0] === net)?.[3] || "" })); return; }
  const url = _ctx.shareUrl(net, link, text);
  if (url) _ctx.openExternal(url);
}

/* "Enlarge": the QR big enough to scan from across a table — openDialog's ceremony look. */
export function showInviteQr(link) { showQrWindow(link); }
function showQrWindow(link) {
  const { t, esc } = _ctx;
  openDialog({
    look: "ceremony", cls: "rf-qr-win", title: t("referralQrTitle"), text: t("referralQrHint"),
    body: `<img class="lv-public-qr rf-qr-xl" src="${esc(_ctx.qr(link, { size: 640, margin: 3 }))}" alt="">`,
    actions: [{ id: "ok", label: t("tutoClose"), kind: "primary" }],
  });
}

/* The ceremony (.agents/rules/ui-ux-defaults.md "Big moments"): a validated
   referral this account has not celebrated, one window at a time, then `seen`. */
async function celebrate() {
  if (_celebrating || !_status?.celebrate?.length) return;
  _celebrating = true;
  try {
    for (const c of _status.celebrate.slice()) {
      await showReferralWindow(c);
      await call("seen", { id: c.id, role: c.role }).catch(() => {});
    }
    _status.celebrate = [];
  } finally { _celebrating = false; }
}

function showReferralWindow(c) {
  const { t, esc } = _ctx;
  const n = c.role === "referrer" && !c.paid ? 0 : (_status?.cfg?.envelopes || 3);
  const name = c.who?.name || "?";
  const title = c.role === "invitee" ? t("referralWelcomeTitle") : t("referralJoinedTitle", { name });
  const line = c.role === "invitee" ? t("referralWelcomeLine", { name, n }) : t("referralJoinedLine", { n });
  const el = document.createElement("div");
  el.className = "tc-reveal tc-envm qfs rf-win";
  el.innerHTML = `
    <div class="tc-reveal-card tc-code-card tcx tcx--help tc-env-card qfs-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="tcx-main">
        <div class="tcx-plaque"><h3>${esc(title)}</h3></div>
        <div class="rf-win-pair" aria-hidden="true">${_ctx.avatar({ uid: _uid }, "sb-friend-avatar")}<span class="icon icon-gift icon-22"></span>${_ctx.avatar(c.who || {}, "sb-friend-avatar")}</div>
        ${n ? `<div class="rf-win-envs" aria-hidden="true">${`<img src="${ART}tigercoins/envelope.webp" alt="">`.repeat(n)}</div>` : ""}
        <p class="qfs-line rf-win-line">${esc(line)}</p>
        <div class="tc-reveal-actions"><button type="button" class="sqd-open sqd-wide qfm-go qfs-ok"><span class="qfm-go-txt"><span>${esc(t(n ? "referralOpenEnvelopes" : "questsFullSetOk"))}</span></span></button></div>
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-open"));
  const card = el.querySelector(".qfs-card");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setTimeout(() => { sfx.burst?.(); backfire(el, card, `${ART}tigercoins/envelope.webp`, { size: 560 }); card.classList.add("is-done"); }, 350);
  } else card.classList.add("is-done");
  return new Promise(resolve => {
    const finish = go => {
      el.classList.remove("is-open"); setTimeout(() => el.remove(), 200);
      if (go && n) _ctx.openEnvelopes?.();
      resolve();
    };
    el.addEventListener("mousedown", e => { if (e.target === el) finish(false); });
    el.addEventListener("keydown", e => { if (e.key === "Escape") finish(false); });
    el.querySelector(".qfs-ok").addEventListener("click", () => finish(true));
    setTimeout(() => el.querySelector(".qfs-ok")?.focus({ preventScroll: true }), 300);
  });
}
