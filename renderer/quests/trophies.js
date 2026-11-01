/**
 * quests/trophies.js — Trophies (spec: docs/TROPHIES.md): the sticker album of
 * Tiger Quests (view mode "questsTrophies") and the unlock celebration.
 *
 * The SERVER awards every trophy (TigerTag_Firebase_Backend functions/trophies.js,
 * catalogue functions/trophyRules.js — mirrored in TROPHIES below, same ids and
 * tiers): this module only reads
 *   users/{uid}/trophies/{id}  { earnedAt, source, event?, ctx? }  (live)
 *   trophyStats/{id}           { owners } · trophyStats/_accounts { accounts }
 *   trophyEvents/{eventId}     { name, desc, art, year, date, kind, active }
 * and celebrates a trophy the first time THIS device sees it
 * (localStorage tigertag.trophies.<uid> = the ids already celebrated).
 *
 *   initTrophies({ t, esc, lang() → code, db(uid) → firestore, uid() → active uid | null,
 *                  onChange(), openView(), openCode(), downloaded(trophyId) })
 *   trophiesSignIn(uid) / trophiesSignOut()
 *   renderTrophiesView(host) · trophiesProgress() → { got, total } · trophyEarned(id)
 */
import { sfx } from "./coin-sound.js";
import { backfire, tilt } from "./coin-pull.js";
import { heroLayersHtml } from "./hero-layers.js";
import { filterBarHtml, heroHtml, infoTipHtml, selectHtml } from "./ui-kit.js";

const ART = "../assets/img/";
// Album order: family by family, as the user reads them.
export const TROPHY_FAMILIES = ["flame", "coins", "squad", "chips", "brands", "gear", "devices"];
// [id, family, tier, art (under assets/img/), hidden]. A trophy of a Workshop loot or feat
// has that item's rarity (quests/index.js RARITIES, from its XP). Art = a WHOLE standalone picture,
// never a layer cut from a banner (docs/ART-DIRECTION.md); a placeholder until its own sticker.
const ROWS = [
  ["firstFlame", "flame", "common", "quests/streak-flame-small.webp"],
  ["streak7", "flame", "uncommon", "quests/streak-flame.webp"],
  ["streak30", "flame", "rare", "trophies/stickers/streak30.webp"],
  ["streak100", "flame", "epic", "trophies/stickers/streak100.webp"],
  ["streak365", "flame", "legendary", "trophies/stickers/streak365.webp"],
  ["comboMax", "flame", "epic", "trophies/stickers/comboMax.webp"],
  ["freezeSaved", "flame", "common", "quests/freeze/freeze.webp"],
  ["freezeSent", "flame", "common", "quests/freeze/freeze-gift.webp"],
  ["freezeReceived", "flame", "common", "quests/freeze/freeze-gift.webp"],
  ["freezeMelted", "flame", "uncommon", "quests/freeze/freeze-melt-5.webp", true],
  ["flameRelit", "flame", "rare", "trophies/stickers/flameRelit.webp"],
  ["freezeSent5", "flame", "uncommon", "trophies/stickers/freezeSent5.webp"],
  ["freezeSent25", "flame", "rare", "trophies/stickers/freezeSent25.webp"],
  ["freezeSent100", "flame", "epic", "trophies/stickers/freezeSent100.webp"],
  ["freezeRecv5", "flame", "uncommon", "trophies/stickers/freezeRecv5.webp"],
  ["freezeRecv25", "flame", "rare", "trophies/stickers/freezeRecv25.webp"],
  ["freezeRecv100", "flame", "epic", "trophies/stickers/freezeRecv100.webp"],
  ["firstEnvelope", "coins", "common", "tigercoins/envelope.webp"],
  ["firstChest", "coins", "rare", "tigercoins/chest-open.webp"],
  ["chests10", "coins", "epic", "tigercoins/chest/closed.webp"],
  ["chests50", "coins", "legendary", "trophies/stickers/chests50.webp"],
  ["envelopeSent", "coins", "common", "tigercoins/gift-v2.webp"],
  ["envelopeReceived", "coins", "common", "trophies/stickers/envelopeReceived.webp"],
  ["legendaryPull", "coins", "legendary", "tigercoins/crown.webp", true],
  ["luckiest", "coins", "epic", "trophies/stickers/luckiest.webp", true],
  ["firstCode", "coins", "common", "tigercoins/code-chest.webp"],
  ["firstEgg", "coins", "uncommon", "tigercoins/code-tiger.webp", true],
  ["allEggs", "coins", "epic", "trophies/stickers/allEggs.webp", true],
  ["firstDeal", "coins", "uncommon", "tigersquad/deals-partner.webp"],
  ["coinsSent100", "coins", "uncommon", "trophies/stickers/coinsSent100.webp"],
  ["coinsSent1000", "coins", "epic", "trophies/stickers/coinsSent1000.webp"],
  ["coinsSent10000", "coins", "legendary", "trophies/stickers/coinsSent10000.webp"],
  ["coinsRecv100", "coins", "uncommon", "trophies/stickers/coinsRecv100.webp"],
  ["coinsRecv1000", "coins", "epic", "trophies/stickers/coinsRecv1000.webp"],
  ["coinsRecv10000", "coins", "legendary", "trophies/stickers/coinsRecv10000.webp"],
  ["envSent10", "coins", "uncommon", "trophies/stickers/envSent10.webp"],
  ["envSent50", "coins", "rare", "trophies/stickers/envSent50.webp"],
  ["envSent100", "coins", "epic", "trophies/stickers/envSent100.webp"],
  ["envRecv10", "coins", "uncommon", "trophies/stickers/envRecv10.webp"],
  ["envRecv50", "coins", "rare", "trophies/stickers/envRecv50.webp"],
  ["envRecv100", "coins", "epic", "trophies/stickers/envRecv100.webp"],
  ["tweet140", "coins", "rare", "trophies/stickers/tweet140.webp", true],
  ["timeMaster", "squad", "epic", "tigercoins/xp-v2.webp", true],
  ["stickerFan", "squad", "uncommon", "trophies/stickers/stickerFan.webp", true],
  ["stickerBook", "squad", "rare", "trophies/stickers/stickerBook.webp", true],
  ["curator", "squad", "epic", "trophies/stickers/curator.webp", true],
  ["squadJoin", "squad", "rare", "tigersquad/tigersquad-bronze.webp"],
  ["squadSilver", "squad", "epic", "tigersquad/tigersquad-silver.webp"],
  ["squadGold", "squad", "epic", "tigersquad/tigersquad-gold.webp"],
  ["squadPlatinum", "squad", "legendary", "tigersquad/tigersquad-platinum.webp"],
  ["firstFriend", "squad", "common", "tigersquad/feats/friends.webp"],
  ["friends10", "squad", "rare", "trophies/stickers/friends10.webp"],
  ["photo", "squad", "common", "tigersquad/feats/photo.webp"],
  ["social", "squad", "common", "tigersquad/feats/social.webp"],
  ["firstLink", "squad", "common", "trophies/stickers/firstLink.webp"],
  ["allLinks", "squad", "uncommon", "tigersquad/feats/community.webp"],
  // Referrals (docs/REFERRALS.md) — placeholders until their own stickers.
  ["referral1", "squad", "common", "tigersquad/feats/friends.webp"],
  ["referral5", "squad", "rare", "trophies/stickers/friends10.webp"],
  ["referral10", "squad", "epic", "tigersquad/feats/community.webp"],
  ["referral25", "squad", "epic", "tigercoins/gift-v2.webp", true],
  ["referral50", "squad", "legendary", "tigercoins/crown.webp", true],
  ["invited", "squad", "common", "tigercoins/envelope.webp"],
  ["countryFirst", "squad", "rare", "tigersquad/rank-medal-1.webp"],
  ["podium", "squad", "epic", "tigersquad/rank-medal-3.webp"],
  ["tigerMaster", "squad", "legendary", "trophies/stickers/tigerMaster.webp"],
  ["worldFirst", "squad", "legendary", "trophies/stickers/worldFirst.webp"],
  ["tigerScale", "devices", "legendary", "tigersquad/loot/tigerscale.webp"],
  ["tigerSpool", "devices", "legendary", "tigersquad/loot/tigerspool.webp"],
  ["tigerTouch", "devices", "legendary", "tigersquad/loot/tigertouch.webp"],
  ["tigerPod", "devices", "legendary", "tigersquad/loot/tigerpod.webp"],
  ["fullKit", "devices", "legendary", "trophies/stickers/fullKit.webp"],
  ["chipTag", "chips", "common", "tigersquad/loot/chip.webp"],
  ["chipPlus", "chips", "common", "trophies/stickers/chipPlus.webp"],
  ["chipCert", "chips", "uncommon", "tigersquad/loot/chip-cert.webp"],
  ["certified50", "chips", "rare", "trophies/stickers/certified50.webp"],
  ["firstPrinter", "gear", "uncommon", "tigersquad/loot/printer.webp"],
  ["firstRack", "gear", "uncommon", "tigersquad/feats/first-rack.webp"],
  ["firstList", "gear", "uncommon", "tigersquad/feats/first-list.webp"],
  ["rfidReader", "gear", "rare", "tigersquad/loot/rfid-reader.webp"],
  ["usbScale", "gear", "rare", "tigersquad/loot/usb-scale.webp"],
  ["mobileApp", "gear", "epic", "tigersquad/feats/mobile-app.webp"],
  ["td1s", "gear", "epic", "tigersquad/loot/td1s.webp"],
  ["appUpdate", "gear", "uncommon", "notifications/update.webp"],
  ["speedrun", "gear", "uncommon", "tigersquad/feats/speedrun.webp"],
];
// Brands that sell TigerTag+ Certified spools (backend trophyRules BRAND_TROPHIES):
// certified chips of the brand, 1 / 10 / 50 / 100.
const BRAND_KEYS = ["rosa3d", "esun", "sunlu", "jamghe", "r3d", "landu", "lotactree", "smart3dpt"];
const BRAND_STEPS = { 1: "uncommon", 10: "rare", 50: "epic", 100: "legendary" };
// Each one its own sticker: the brand's logo redrawn in the house style (alone at 1), with a
// themed object behind it at 10 / 50 / 100, different for every brand.
for (const key of BRAND_KEYS) for (const [n, tier] of Object.entries(BRAND_STEPS)) ROWS.push([`cert_${key}_${n}`, "brands", tier, `trophies/stickers/cert_${key}_${n}.webp`]);
export const TROPHIES = ROWS.map(([id, family, tier, art, hidden]) => ({ id, family, tier, art: ART + art, hidden: !!hidden }));
const BY_ID = new Map(TROPHIES.map(x => [x.id, x]));
const TIER_STEP = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, event: 4 };
const STATS_TTL = 10 * 60e3;

let _ctx = null, _uid = null, _unsub = null;
let _earned = new Map();          // id → { at (ms), event?, ctx? }
let _events = new Map();          // eventId → trophyEvents doc
let _stats = { at: 0, owners: {}, accounts: 0 };
let _filter = "all", _loaded = false, _query = "", _family = "";

const ms = v => v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : Number(v) || 0;
const loc = (m, lang) => (m && typeof m === "object" ? m[lang] || m.en || Object.values(m)[0] || "" : String(m || ""));
const seenKey = uid => `tigertag.trophies.${uid}`;
function readSeen(uid) { try { return new Set(JSON.parse(localStorage.getItem(seenKey(uid)) || "[]")); } catch (_) { return new Set(); } }
function writeSeen(uid, set) { try { localStorage.setItem(seenKey(uid), JSON.stringify([...set])); } catch (_) {} }

export function initTrophies(ctx) { _ctx = ctx; }

export function trophiesSignIn(uid) {
  if (!_ctx || uid === _uid) return;
  trophiesSignOut();
  _uid = uid;
  const db = _ctx.db(uid);
  _unsub = db.collection("users").doc(uid).collection("trophies").onSnapshot(snap => {
    _earned = new Map(snap.docs.map(d => [d.id, { at: ms(d.get("earnedAt")) || Date.now(), event: d.get("event") || null, ctx: d.get("ctx") || null }]));
    _loaded = true;
    celebrateNew(uid);
    _ctx.onChange?.();
  }, () => { _loaded = true; _ctx.onChange?.(); });   // unreadable: the album shows, all locked
  db.collection("trophyEvents").get().then(s => {
    if (_uid !== uid) return;
    _events = new Map(s.docs.map(d => [d.id, d.data()]));
    _ctx.onChange?.();
  }).catch(() => {});
}

export function trophiesSignOut() {
  _queue = [];
  _unsub?.(); _unsub = null; _uid = null;
  _earned = new Map(); _events = new Map(); _stats = { at: 0, owners: {}, accounts: 0 }; _loaded = false;
}

// The owners counters, read when the album opens (at most every STATS_TTL).
function loadStats() {
  if (!_uid || Date.now() - _stats.at < STATS_TTL) return;
  const uid = _uid;
  _stats.at = Date.now();
  _ctx.db(uid).collection("trophyStats").get().then(s => {
    if (_uid !== uid) return;
    const owners = {};
    let accounts = 0;
    for (const d of s.docs) d.id === "_accounts" ? (accounts = Number(d.get("accounts")) || 0) : (owners[d.id] = Number(d.get("owners")) || 0);
    _stats = { at: Date.now(), owners, accounts };
    _ctx.onChange?.();
  }).catch(() => { _stats.at = 0; });
}

// Every trophy the album shows: the catalogue, then the events (newest first).
function allTrophies() {
  const evs = [..._events.entries()].map(([id, e]) => ({ id: `ev.${id}`, family: "events", tier: "event", art: e.art || ART + "trophies/cup.webp",
    name: e.name, desc: e.desc, year: Number(e.year) || 0, date: ms(e.date), active: e.active !== false }));
  // An event trophy held but whose card is gone still shows (its id as name).
  for (const [id] of _earned) if (id.startsWith("ev.") && !_events.has(id.slice(3))) evs.push({ id, family: "events", tier: "event", art: ART + "trophies/cup.webp", name: id.slice(3), year: 0, date: 0 });
  evs.sort((a, b) => b.date - a.date || b.year - a.year);
  return [...TROPHIES, ...evs];
}
const nameOf = x => x.family === "events" ? loc(x.name, _ctx.lang()) : _ctx.t(`trophy_${x.id}`);
const descOf = x => x.family === "events" ? loc(x.desc, _ctx.lang()) : _ctx.t(`trophyHow_${x.id}`);

// Held already? (a secret gesture stops asking the server once it is.)
export const trophyEarned = id => _earned.has(id);

export function trophiesProgress() {
  const all = allTrophies();
  return { got: all.filter(x => _earned.has(x.id)).length, total: all.length };
}

function pct(id) {
  const n = _stats.owners[id] || 0;
  if (!_stats.accounts || !n) return null;
  const p = Math.min(100, (n / _stats.accounts) * 100);
  return p < 0.1 ? "<0.1" : p < 10 ? p.toFixed(1) : String(Math.round(p));
}

const fmtDate = d => new Date(d).toLocaleDateString(_ctx.lang(), { day: "numeric", month: "short", year: "numeric" });

function stickerHtml(x) {
  const { t, esc } = _ctx;
  const got = _earned.get(x.id);
  const secret = !got && x.hidden;
  const missed = !got && x.family === "events" && !x.active;
  const name = secret ? t("trophyHidden") : nameOf(x);
  const p = got ? pct(x.id) : null;
  // The hint lives in the app's shared info bubble (ui-kit infoTipHtml → #toolInfoPop),
  // above the "i" with its tail on it, so every sticker is the
  // same size whatever its length; the card keeps the name and one line: the date, or the tier.
  const hint = missed ? t("trophyEventOver") : secret ? t("trophyHiddenHow") : descOf(x);
  const meta = got ? fmtDate(got.at) : t(`trophyTier_${x.tier}`);
  // What the search reads: the name, the hint and the tier (a hidden trophy: its "?" labels only).
  const fam = t(`trophyFamily_${x.family}`);
  const q = `${name} ${hint} ${t(`trophyTier_${x.tier}`)} ${fam}`.toLowerCase();
  return `<button type="button" class="trp-st trp-t--${x.tier}${got ? " is-got" : " is-locked"}${secret ? " is-secret" : ""}" data-trophy="${esc(x.id)}" data-q="${esc(q)}"
      aria-label="${esc(`${name} — ${t(`trophyTier_${x.tier}`)} — ${got ? `${meta} — ` : ""}${hint}`)}">
    ${infoTipHtml(esc, p ? `${hint} · ${t("trophyOwnedPct", { p })}` : hint, { cls: "trp-st-info", size: 14 })}
    <span class="trp-st-art" aria-hidden="true">${secret ? `<span class="trp-st-q">?</span>` : `<img src="${esc(x.art)}" alt="" loading="lazy" draggable="false">`}${got ? `<span class="trp-gloss trp-gloss--tile" style="--art:url('${esc(artUrl(x.art))}');animation-delay:${((x.id.length * 7) % 9) * 0.5}s"></span>` : ""}</span>
    <b class="trp-st-name">${esc(name)}</b>
    <small class="trp-st-sub">${esc(meta)}</small>
  </button>`;
}

// The banner scene (hero-layers.js), its own layers (assets/img/trophies/banner/, generated
// 2026-11-01 against docs/ART-DIRECTION.md): BEHIND the desk the cheering tiger (cut at the
// waist), ON it a rosette, a sticker sheet, the gold cup, the open sticker album, sparkles.
const TROPHY_SCENE = heroLayersHtml(`${ART}trophies/banner/`, {
  back: ["tiger"],
  front: ["rosette", "sticker-sheet", "cup", "album", { name: "sparkle", cls: "spark hl--spark1" }, { name: "sparkle", cls: "spark hl--spark2" }],
});

export function renderTrophiesView(host) {
  if (!_ctx || !host) return;
  const { t, esc } = _ctx;
  loadStats();
  const all = allTrophies();
  const got = all.filter(x => _earned.has(x.id));
  // Signature guard (.agents/rules/surgical-dom-updates.md): snapshots repaint often.
  const sig = JSON.stringify([_uid, _filter, _family, [..._earned.keys()], [..._events.keys()], _stats.at, _ctx.lang(), _loaded]);
  if (host._trpSig === sig && host.childElementCount) return;
  host._trpSig = sig;
  const keep = x => (!_family || x.family === _family) && (_filter === "all" || (_filter === "got" ? _earned.has(x.id) : !_earned.has(x.id)));
  // One album, every sticker together (catalogue order, then the events); the family shows
  // only in the card a sticker opens (founder, 2026-11-01).
  const album = `<div class="trp-grid">${all.filter(keep).map(stickerHtml).join("")}</div>`;
  const tiers = ["common", "uncommon", "rare", "epic", "legendary", "event"].map(tr => {
    const n = got.filter(x => x.tier === tr).length;
    return `<li class="trp-t--${tr}"><i aria-hidden="true"></i><b>${n}</b><span>${esc(t(`trophyTier_${tr}`))}</span></li>`;
  }).join("");
  // The filters are the Deals bar's tabs (quests.css .sqd-tab): icon, label, count.
  const FILTER_ICON = { all: "grid", got: "check", locked: "lock" };
  const filter = (k, n) => ({ attr: `data-trp-filter="${k}"`, on: _filter === k, n, label: t(`trophyFilter_${k}`),
    icon: `<span class="icon icon-${FILTER_ICON[k]} icon-13" aria-hidden="true"></span>` });
  const pctGot = all.length ? Math.round((got.length / all.length) * 100) : 0;
  // The banner, built like the Deals one (squad-deals.js dealsViewHtml): the Tiger
  // Squad title block, a scene of layers on the desk, the count card on the right.
  // Laid out like the Deals view: the blocks straight in the host (.sqd-view: column, 14 px gaps).
  host.innerHTML = `
    ${heroHtml(esc, { cls: "sqr-hero trp-hero", eyebrow: t("squadBrand"), title: t("trophiesTitle"), sub: t("trophiesTagline"), scene: TROPHY_SCENE,
      side: `<ul class="trp-tiers trp-hero-tiers" aria-label="${esc(t("trophyByTier"))}">${tiers}</ul>
      <div class="sqr-card trp-hero-card" role="group" aria-label="${esc(t("trophyCount", { n: got.length, total: all.length }))}">
        <b class="trp-hero-n">${got.length}<small>/ ${all.length}</small></b>
        <span class="trp-bar" aria-hidden="true"><i style="width:${pctGot}%"></i></span>
      </div>` })}
    ${filterBarHtml(esc, { cls: "trp-toolbar",
      tabs: [filter("all"), filter("got", got.length), filter("locked", all.length - got.length)],
      search: { attr: "data-trp-q", value: _query, placeholder: t("trophySearch"), cls: "trp-search" },
      extra: selectHtml(esc, { attr: "data-trp-family", label: t("trophyFamilyAll"), value: _family,
        options: [{ value: "", label: t("trophyFamilyAll") }, ...[...TROPHY_FAMILIES, "events"].map(f => ({ value: f, label: t(`trophyFamily_${f}`) }))] }) + `<button type="button" class="sqd-tab trp-code" data-trp-code><span class="icon icon-gift icon-14" aria-hidden="true"></span>${esc(t("trophyHaveCode"))}</button>` })}
    ${_loaded ? album : `<div class="trp-loading">${esc(t("questsLoading"))}</div>`}
    <p class="trp-nomatch" hidden>${esc(t("trophyNoMatch"))}</p>`;
  // The search filters in place (no repaint: the field keeps its focus).
  const field = host.querySelector("[data-trp-q]");
  field?.addEventListener("input", () => { _query = field.value; applySearch(host); });
  applySearch(host);
  host.querySelector("[data-trp-family]")?.addEventListener("change", e => { _family = e.target.value; renderTrophiesView(host); });
  host.querySelectorAll("[data-trp-filter]").forEach(b => b.addEventListener("click", () => { _filter = b.dataset.trpFilter; renderTrophiesView(host); }));
  host.querySelector("[data-trp-code]")?.addEventListener("click", () => _ctx.openCode?.());
  host.querySelectorAll("[data-trophy]").forEach(b => b.addEventListener("click", () => openTrophyCard(b.dataset.trophy)));
}

// Shows the stickers whose text (name, hint, tier, family) holds every word typed.
function applySearch(host) {
  const words = _query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  host.querySelectorAll(".trp-st").forEach(b => { const ok = words.every(w => b.dataset.q.includes(w)); b.hidden = !ok; shown += ok; });
  const none = host.querySelector(".trp-nomatch");
  if (none) none.hidden = !(_loaded && words.length && !shown);
}

// A url() inside a custom property resolves against the stylesheet that uses it
// (renderer/quests/), not the page: the gloss's mask gets the art's absolute URL.
const artUrl = src => { try { return new URL(src, document.baseURI).href; } catch (_) { return src; } };

// ── The detail card ──────────────────────────────────────────────
function openTrophyCard(id) {
  const x = allTrophies().find(y => y.id === id);
  // Only an earned sticker opens: one still to win stays a silhouette in the album.
  const got = x && _earned.get(id);
  if (!got) return;
  const { t, esc } = _ctx;
  const p = pct(id);
  // How it was earned, when the server said (a relit 23-day streak, the podium rank).
  const country = cc => { try { return new Intl.DisplayNames([_ctx.lang()], { type: "region" }).of(cc) || cc; } catch (_) { return cc; } };
  const how = got.ctx?.streak ? t("trophyCtxStreak", { n: got.ctx.streak }) : got.ctx?.country ? t("trophyCtxCountry", { country: country(got.ctx.country) })
    : got.ctx?.rank ? t("trophyCtxRank", { n: got.ctx.rank }) : "";
  // The same window frame as the envelopes and the TigerCoins history (tc-reveal +
  // tcx card, title plaque, golden button); the sticker follows the pointer like
  // the envelope (tilt), a gloss cut to its own shape sliding across it.
  const el = document.createElement("div");
  el.className = "tc-reveal tc-envm trp-cardm";
  el.innerHTML = `<div class="tc-reveal-card tc-code-card tcx tcx--help tc-env-card trp-sticker trp-t--${x.tier}" role="dialog" aria-modal="true" aria-label="${esc(nameOf(x))}">
    <div class="tcx-main">
      <div class="tcx-plaque"><h3>${esc(nameOf(x))}</h3></div>
      <span class="trp-card-tier">${esc(t(`trophyTier_${x.tier}`))} · ${esc(t(`trophyFamily_${x.family}`))}</span>
      <span class="trp-card-art"><span class="trp-tilt"><img src="${esc(x.art)}" alt="" draggable="false"><span class="trp-gloss" style="--art:url('${esc(artUrl(x.art))}')"></span></span></span>
      <p class="trp-sticker-desc">${esc(descOf(x))}</p>
      <p class="trp-card-meta">${esc(t("trophyEarnedOn", { date: fmtDate(got.at) }))}${how ? ` · ${esc(how)}` : ""}${p ? ` · ${esc(t("trophyOwnedPct", { p }))}` : ""}</p>
      <div class="tc-reveal-actions"><button type="button" class="sqd-open sqd-wide qfm-go" data-trp-save><span class="qfm-go-txt"><span>${esc(t("trophyDownload"))}</span></span></button></div>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.querySelector("[data-trp-save]").addEventListener("click", () => downloadSticker(x));
  requestAnimationFrame(() => el.classList.add("is-open"));
  // An earned sticker opens as a moment: its art swells behind the window (a click
  // outside or Escape closes it).
  backfire(el, el.querySelector(".trp-sticker"), x.art, { at: "center", size: 520, dur: 5, soft: true });
  tilt(el, el.querySelector(".trp-tilt"), 18);   // the whole overlay: it follows the pointer outside the card too
  const close = () => { el.classList.remove("is-open"); document.removeEventListener("keydown", onKey, true); setTimeout(() => el.remove(), 200); };
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.addEventListener("mousedown", e => { if (e.target === el) close(); });
}

// Saves an earned sticker as a PNG (the common format; the app ships WebP / SVG),
// drawn through a canvas at its full size (at least 1024 px for an SVG), then tells
// the server, which counts each sticker once for the download trophies. A picture
// the canvas cannot read (a remote event art without CORS) is saved as it is.
const pngOf = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const scale = /\.svg(\?|$)/i.test(src) ? Math.max(1, 1024 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)) : 1;
    const c = document.createElement("canvas");
    c.width = Math.round((img.naturalWidth || 512) * scale); c.height = Math.round((img.naturalHeight || 512) * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => (b ? resolve(b) : reject(new Error("png"))), "image/png");
  };
  img.onerror = reject;
  img.src = src;
});
async function downloadSticker(x) {
  const base = `tigertag-trophy-${x.id.replace(/[^\w.-]/g, "-")}`;
  let href = x.art, name = `${base}.${(x.art.split("?")[0].match(/\.(\w+)$/) || [, "png"])[1]}`, blobUrl = null;
  try { blobUrl = URL.createObjectURL(await pngOf(x.art)); href = blobUrl; name = `${base}.png`; } catch (_) { /* kept as shipped */ }
  const a = document.createElement("a");
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  _ctx.downloaded?.(x.id);
}

// ── Unlock ───────────────────────────────────────────────────────
// Every trophy won gets its own window; several at once (a recompute, a back-fill)
// come one after the other, each when the previous one closes.
let _queue = [];
function celebrateNew(uid) {
  const seen = readSeen(uid);
  const fresh = [..._earned.keys()].filter(id => !seen.has(id));
  if (!fresh.length) return;
  fresh.forEach(id => seen.add(id));
  writeSeen(uid, seen);
  const all = allTrophies();
  _queue.push(...fresh.map(id => all.find(y => y.id === id) || BY_ID.get(id)).filter(Boolean));
  if (!document.querySelector(".trp-unlock")) nextUnlock();
}
function nextUnlock() { const x = _queue.shift(); if (x) overlay(x); }

function overlay(x) {
  const { t, esc } = _ctx;
  const el = document.createElement("div");
  el.className = `trp-unlock trp-t--${x.tier}`;
  el.innerHTML = `<div class="trp-unlock-card" role="dialog" aria-modal="true" aria-label="${esc(nameOf(x))}">
    <span class="trp-unlock-rays" aria-hidden="true"></span>
    <small>${esc(t("trophyUnlocked"))}</small>
    <span class="trp-card-tier">${esc(t(`trophyTier_${x.tier}`))} · ${esc(t(`trophyFamily_${x.family}`))}</span>
    <span class="trp-unlock-art"><img src="${esc(x.art)}" alt="" draggable="false"></span>
    <h3>${esc(nameOf(x))}</h3>
    <p>${esc(descOf(x))}</p>
    <button type="button" class="trp-unlock-go">${esc(t("trophySeeAll"))}</button>
  </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-open"));
  // A big moment in a window: the sticker's art swells behind it (.agents/rules/ui-ux-defaults.md).
  backfire(el, el.querySelector(".trp-unlock-card"), x.art, { at: "center", size: 560 });
  const step = TIER_STEP[x.tier] || 0;
  if (step >= 2) sfx.impact?.(step); else sfx.stamp?.();
  // Closed: the next trophy of the queue, if any.
  const close = (then = nextUnlock) => {
    el.classList.remove("is-open"); document.removeEventListener("keydown", onKey, true);
    setTimeout(() => { el.remove(); then(); }, 250);
  };
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.addEventListener("mousedown", e => { if (e.target === el) close(); });
  // "See my trophies": the album, where the rest of the queue is on show anyway.
  el.querySelector(".trp-unlock-go").addEventListener("click", () => { _queue = []; close(() => {}); _ctx.openView?.(); });
}
