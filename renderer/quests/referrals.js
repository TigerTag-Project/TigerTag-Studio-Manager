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
import { heroHtml } from "./ui-kit.js";

const URL_BASE = "https://us-central1-tigertag-connect.cloudfunctions.net/referrals";
const ART = "../assets/img/";
// The networks of the share row: [id, icon, colour class (the list share row's .lv-social--*), aria label].
// Discord has no share URL: it copies.
const NETS = [
  ["whatsapp", "whatsapp", "wa", "WhatsApp"], ["x", "x", "x", "X"], ["facebook", "facebook", "fb", "Facebook"],
  ["reddit", "reddit", "reddit", "Reddit"], ["telegram", "telegram", "telegram", "Telegram"], ["bluesky", "bluesky", "bluesky", "Bluesky"],
  ["discord", "discord", "discord", "Discord"], ["email", "mail", "mail", "E-mail"],
];
// Validated referrals → the next trophy (trophyRules.js COUNTERS.referrals; 25 and 50 are hidden).
const STEPS = [1, 5, 10];

let _ctx = null, _uid = null, _status = null, _busy = false, _prefill = "", _celebrating = false, _loading = false;

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

function stateRow(x) {
  const { t, esc } = _ctx;
  const pill = `<span class="rf-pill rf-pill--${esc(x.state)}">${esc(t(`referralState_${x.state}`))}</span>`;
  // What the row is waiting for, in words: the e-mail (and the days left), or when it paid.
  const days = Math.max(0, Math.ceil(((x.expiresAt || 0) - Date.now()) / 86_400_000));
  const why = x.state === "validated"
    ? t("referralRowValidated", { date: x.validatedAt ? new Date(x.validatedAt).toLocaleDateString() : "", n: _status?.cfg?.envelopes || 3 })
    : x.state === "pending" ? t("referralRowPending", { n: days }) : t("referralRowExpired");
  return `<li class="rf-row">${_ctx.avatar(x, "sb-friend-avatar")}
    <span class="rf-row-txt"><b>${esc(x.name || "?")}</b><small>${esc(why)}</small></span>${pill}</li>`;
}

function codeFieldHtml(id, value = "") {
  const { t, esc } = _ctx;
  const [a, b] = (value || "").split("-");
  // The add-friend modal's two XXX — XXX segments (.adf-seg), reused as is.
  return `<div class="adf-code-group rf-code" data-rf-code="${id}">
      <input class="adf-seg" data-rf-seg="a" maxlength="3" value="${esc(a || "")}" aria-label="${esc(t("referralWhoTitle"))}" autocomplete="off" spellcheck="false">
      <span class="adf-sep">—</span>
      <input class="adf-seg" data-rf-seg="b" maxlength="3" value="${esc(b || "")}" aria-label="${esc(t("referralWhoTitle"))}" autocomplete="off" spellcheck="false">
      <button type="button" class="dns-av-act rf-paste" data-rf-paste><span class="icon icon-copy icon-14" aria-hidden="true"></span><span>${esc(t("referralPaste"))}</span></button>
    </div>
    <div class="rf-preview" data-rf-preview hidden></div>
    <p class="rf-err" data-rf-err role="alert" aria-live="polite"></p>`;
}

/* Wires a code field: segments uppercase + auto-advance, Paste, the live preview
   of the code's owner. Answers () → the code typed ("" when incomplete). */
export function wireCodeField(root, onValid) {
  const segs = [...root.querySelectorAll("[data-rf-seg]")];
  const prev = root.querySelector("[data-rf-preview]"), err = root.querySelector("[data-rf-err]");
  const value = () => segs.map(s => s.value).join("-");
  const complete = () => /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(value());
  let seq = 0;
  const changed = async () => {
    err.textContent = ""; prev.hidden = true;
    onValid?.(false);
    if (!complete()) return;
    const mine = ++seq, p = await _ctx.lookupCode(value()).catch(() => null);
    if (mine !== seq) return;
    if (!p) { err.textContent = errText("UNKNOWN_CODE"); return; }
    if (p.uid === _uid) { err.textContent = errText("SELF"); return; }
    prev.innerHTML = `${_ctx.avatar(p, "sb-friend-avatar")}<b>${_ctx.esc(p.displayName || "?")}</b>`;
    prev.hidden = false;
    onValid?.(true);
  };
  const setCode = code => {
    const m = String(code || "").toUpperCase().match(/([A-Z0-9]{3})-?([A-Z0-9]{3})/);
    if (!m) return false;
    segs[0].value = m[1]; segs[1].value = m[2];
    changed();
    return true;
  };
  segs.forEach((s, i) => s.addEventListener("input", () => {
    if (s.value.length > 3 || /-/.test(s.value)) { setCode(s.value); return; }
    s.value = s.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (i === 0 && s.value.length === 3) segs[1].focus();
    changed();
  }));
  segs[1].addEventListener("keydown", e => { if (e.key === "Backspace" && !segs[1].value) segs[0].focus(); });
  root.querySelector("[data-rf-paste]")?.addEventListener("click", async () => {
    // Read only on this tap: the landing page put the code there (docs/REFERRALS.md §2).
    try { if (!setCode(await navigator.clipboard.readText())) err.textContent = errText("UNKNOWN_CODE"); } catch (_) {}
  });
  if (complete()) changed();
  return { value: () => (complete() ? value() : ""), error: text => { err.textContent = text; }, setCode };
}

export function codeFieldMarkup(value) { return codeFieldHtml("onb", value); }

export function renderInviteView(host) {
  if (!_ctx || !host) return;
  const { t, esc } = _ctx;
  const s = _status;
  // No status yet (the launch call failed or is still out): ask again, once at a time.
  if (!s && _uid && !_loading) { _loading = true; call("status").catch(e => console.warn("[referrals] status", e.message)).finally(() => { _loading = false; }); }
  const sig = JSON.stringify([_uid, s, _prefill, _busy, t("referralTitle")]);
  if (host._rfSig === sig && host.childElementCount) return;
  host._rfSig = sig;
  const link = shareLink(), validated = s?.validated || 0;
  const next = STEPS.find(n => n > validated);
  const side = `<div class="sqr-card rf-hero-card" role="group" aria-label="${esc(t("referralCount", { n: validated }))}">
      <b class="trp-hero-n">${validated}</b>
      <span>${esc(t("referralCountLabel", { n: validated }))}</span>
      ${next ? `<small>${esc(t("referralNextTrophy", { n: next - validated }))}</small>` : ""}
    </div>`;
  // Each network as a labelled button (the list share row's colours): the name says where it goes.
  const nets = NETS.map(([id, icon, cls, label]) =>
    `<button type="button" class="rf-net" data-rf-net="${id}"><span class="lv-social lv-social--${cls}" aria-hidden="true"><span class="icon icon-${icon}"></span></span>${esc(label)}</button>`).join("");
  const qr = link ? _ctx.qr(link, { size: 240, margin: 2 }) : "";
  const envs = s?.cfg?.envelopes || 3;
  // "Who invited you?" — only while this account may still claim: a banner on top, apart from the sharing.
  const claimCard = s?.claim?.canClaim ? `
    <section class="rf-card rf-claim">
      <h3><span class="icon icon-gift icon-16" aria-hidden="true"></span>${esc(t("referralWhoTitle"))}</h3>
      <p>${esc(t("referralWhoSub", { n: s.claim.daysLeft, e: envs }))}</p>
      <div data-rf-claim>${codeFieldHtml("view", _prefill)}</div>
      <button type="button" class="primary rf-claim-go" data-rf-claim-go disabled>${esc(t("referralClaim"))}</button>
    </section>` : "";
  const mine = s?.mine ? `
    <section class="rf-card rf-mine">
      ${_ctx.avatar(s.mine.referrer, "sb-friend-avatar")}
      <span class="rf-row-txt"><b>${esc(t("referralInvitedBy", { name: s.mine.referrer?.name || "?" }))}</b>
        <small>${esc(s.mine.state === "pending" ? t("referralVerifyHint") : t(`referralState_${s.mine.state}`))}</small></span>
      <span class="rf-pill rf-pill--${esc(s.mine.state)}">${esc(t(`referralState_${s.mine.state}`))}</span>
    </section>` : "";
  const list = s?.invitees?.length
    ? `<ul class="rf-list">${s.invitees.map(stateRow).join("")}</ul>`
    : `<p class="rf-empty">${esc(t("referralNoInvitees"))}</p>`;
  // How it works, in three steps — what to do and when the envelopes come.
  const steps = [["send", 1], ["download", 2], ["mail", 3]].map(([icon, n]) => `
    <li class="rf-step"><span class="rf-step-ic"><span class="icon icon-${icon} icon-16" aria-hidden="true"></span></span>
      <span class="rf-row-txt"><b>${esc(t(`referralStep${n}`))}</b><small>${esc(t(`referralStep${n}Sub`, { n: envs }))}</small></span></li>`).join("");
  host.innerHTML = `
    ${heroHtml(esc, { cls: "sqr-hero rf-hero", eyebrow: t("squadBrand"), title: t("referralTitle", { n: envs }), sub: t("referralTagline", { n: envs }), side })}
    ${!s ? `<div class="trp-loading">${esc(t("questsLoading"))}</div>` : `
    ${claimCard}${mine}
    <ol class="rf-steps">${steps}</ol>
    <section class="rf-card rf-share">
      <div class="rf-share-main">
        <div class="rf-code-row"><span class="rf-code-lbl">${esc(t("referralYourCode"))}</span>
          <b class="rf-code-big">${esc(s.code || "—")}</b>
          <button type="button" class="lv-public-copy" data-rf-copy-code><span class="icon icon-copy icon-13" aria-hidden="true"></span><span>${esc(t("referralCopy"))}</span></button></div>
        <div class="rf-link-row"><input class="dns-input" readonly value="${esc(link)}" aria-label="${esc(t("referralLinkTitle"))}">
          <button type="button" class="lv-public-copy" data-rf-copy><span class="icon icon-link icon-13" aria-hidden="true"></span><span>${esc(t("referralCopyLink"))}</span></button></div>
        <div class="rf-nets">${nets}</div>
        <p class="rf-msg">${esc(t("referralMsgPreview", { msg: shareText() }))}</p>
      </div>
      ${qr ? `<div class="rf-qr">
        <img class="lv-public-qr" src="${esc(qr)}" alt="">
        <small>${esc(t("referralQrHint"))}</small>
        <button type="button" class="rf-qr-dl" data-rf-qr><span class="icon icon-download icon-13" aria-hidden="true"></span>${esc(t("referralQrDownload"))}</button>
      </div>` : ""}
    </section>
    <section class="rf-card">
      <h3><span class="icon icon-user icon-16" aria-hidden="true"></span>${esc(t("referralMyInvitees"))}</h3>
      ${list}
    </section>`}`;
  host.querySelector("[data-rf-copy-code]")?.addEventListener("click", e => _ctx.copy(s.code, e.currentTarget));
  host.querySelector("[data-rf-copy]")?.addEventListener("click", e => _ctx.copy(link, e.currentTarget));
  host.querySelectorAll("[data-rf-net]").forEach(b => b.addEventListener("click", () => share(b.dataset.rfNet, b)));
  host.querySelector("[data-rf-qr]")?.addEventListener("click", () => {
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
  if (net === "discord") { _ctx.copy(`${text} ${link}`, button, _ctx.t("referralDiscordCopied")); return; }   // no share URL: paste it in a server
  const url = _ctx.shareUrl(net, link, text);
  if (url) _ctx.openExternal(url);
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
