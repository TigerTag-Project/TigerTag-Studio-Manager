/**
 * quests/trophies.js — Trophies (spec: docs/TROPHIES.md): the sticker album of
 * Tiger Quests (view mode "questsTrophies") and the unlock celebration.
 *
 * The SERVER awards every trophy (TigerTag_Firebase_Backend functions/trophies.js,
 * catalogue functions/trophyRules.js + trophyCatalog.json) and owns every trophy's art
 * and text: the app ships none of them (see "Catalogue and cards"). This module reads
 *   cdn /trophies/catalog/<lang>.json  the public catalogue (visible trophies, hidden slots)
 *   trophyCards (function)             the art + text of the trophies held
 *   users/{uid}/trophies/{id}  { earnedAt, source, event?, ctx? }  (live)
 *   trophyStats/{id}           { owners } · trophyStats/_accounts { accounts }
 *   trophyEvents/{eventId}     { name, desc, art, year, date, kind, active }
 * and celebrates a trophy the first time THIS device sees it
 * (localStorage tigertag.trophies.<uid> = the ids already celebrated).
 *
 *   initTrophies({ t, esc, lang() → code, db(uid) → firestore, uid() → active uid | null, friendName(uid),
 *                  onChange(), openView(), openCode(), downloaded(trophyId),
 *                  visited(friendUid) — a friend's album opened (once per visit),
 *                  opened(revealed) — the card of a sticker still to win opened in
 *                  one's own album; `revealed`: a friend revealed it })
 *   trophiesSignIn(uid) / trophiesSignOut()
 *   renderTrophiesView(host, friend?) · trophiesProgress() → { got, total } · trophyEarned(id)
 * With `friend` ({ uid, displayName }, a friend's view) the album shows THAT account's
 * stickers, read once (Firestore lets an accepted friend read users/{uid}/trophies):
 * the same album, read-only — no code button, no download.
 */
import { sfx } from "./coin-sound.js";
import { backfire, tilt } from "./coin-pull.js";
import { heroLayersHtml } from "./hero-layers.js";
import { filterBarHtml, heroHtml, infoTipHtml, selectHtml } from "./ui-kit.js";

// The app's own pictures (the banner, the event cup). No trophy art or text ships with the
// app (it is open source: the missions would be one search away) — see "Catalogue and cards".
const ART = "../assets/img/";

// ── Catalogue and cards (backend tool/trophy-art.mjs, functions/trophyCards.js) ──
// The public catalogue, one file per language on the cdn: the families (id + label, in
// album order, "events" last) and every VISIBLE trophy with its name, mission and black
// silhouette; a veiled one only as { hidden, family, tier }.
// The art and text of a trophy HELD come from trophyCards (one card per trophy, kept per
// account: they only change with a new art, which gets a new address).
//   tigertag.trophyCatalog.<lang>  { v, trophies }
//   tigertag.trophyCards.<uid>     { id: { art, family, tier, hidden?, name{}, how{} } }
const CDN = "https://cdn.tigertag.io/trophies/";
const CARDS_URL = "https://us-central1-tigertag-connect.cloudfunctions.net/trophyCards";
const CARDS_MAX = 200;
let _catalog = null, _catalogAsked = null;   // { v, lang, trophies } · the language fetched this session
let _cards = {}, _cardsAsking = null;
// What friends revealed (backend trophyReveals.js): a VEILED trophy — hidden, or rare and up —
// is a "?" with its tier until a friend holds it; then its silhouette, name and mission show
// ("Seen at Léa's"). Re-asked at sign-in and when the album opens, at most every REVEALS_TTL.
//   tigertag.trophyReveals.<uid>  { at, ids: { id: friendUid } }
let _reveals = { at: 0, ids: {} };
let _visited = null;   // the friend whose album is on screen (renderTrophiesView), to count a visit once
const REVEALS_TTL = 10 * 60e3;
const VEILED_TIERS = new Set(["rare", "epic", "legendary"]);
const veiled = c => !!c && (!!c.hidden || VEILED_TIERS.has(c.tier));
const TIER_STEP = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, event: 4 };
const STATS_TTL = 10 * 60e3;

let _ctx = null, _uid = null, _unsub = null;
let _earned = new Map();          // id → { at (ms), event?, ctx? }
let _events = new Map();          // eventId → trophyEvents doc
let _stats = { at: 0, owners: {}, accounts: 0 };
// A veiled trophy's catalogue slot carries `o`, an opaque key (sha-256 of "trophy-slot:<id>",
// 12 hex — backend tool/trophy-art.mjs slotKey). Matched against the ids already held here
// (the owners counters, the cards): a held or revealed trophy fills ITS slot, and a "?" slot
// shows its owners % without its name.
let _slotIds = new Map();         // slot key → trophy id
async function slotKey(id) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`trophy-slot:${id}`));
  return [...new Uint8Array(b)].slice(0, 6).map(x => x.toString(16).padStart(2, "0")).join("");
}
let _slotsFor = "", _slotsReady = Promise.resolve();
// Resolves once _slotIds covers the ids known now: the unlock waits for it, since a veiled
// trophy is only found in the album through its slot.
function mapSlots() {
  const ids = [...new Set([...Object.keys(_stats.owners), ...Object.keys(_cards)])].filter(id => !id.startsWith("_"));
  const sig = ids.length + "|" + ids.join(",").length;
  if (!ids.length || sig === _slotsFor) return _slotsReady;
  _slotsFor = sig;
  _slotsReady = Promise.all(ids.map(async id => [await slotKey(id), id])).then(pairs => { _slotIds = new Map(pairs); _ctx?.onChange?.(); }).catch(() => {});
  return _slotsReady;
}
let _filter = "all", _loaded = false, _query = "", _family = "";
// A friend's album being shown: { uid, name, earned (same shape as _earned), loaded, error, at }.
let _friend = null;
const FRIEND_TTL = 2 * 60e3;
// The albums of the last friends seen (re-visit painted at once, re-read after FRIEND_TTL).
const _friendAlbums = new Map();   // friend uid → { uid, name, earned, loaded, error, at }
const FRIEND_ALBUMS_MAX = 5;
// The stickers of the album on screen: yours, or the friend's.
const held = () => (_friend ? _friend.earned : _earned);
const toEarned = docs => new Map(docs.map(d => [d.id, { at: ms(d.get("earnedAt")) || Date.now(), event: d.get("event") || null, ctx: d.get("ctx") || null }]));

const ms = v => v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : Number(v) || 0;
const loc = (m, lang) => (m && typeof m === "object" ? m[lang] || m.en || Object.values(m)[0] || "" : String(m || ""));
const seenKey = uid => `tigertag.trophies.${uid}`;
function readSeen(uid) { try { return new Set(JSON.parse(localStorage.getItem(seenKey(uid)) || "[]")); } catch (_) { return new Set(); } }
function writeSeen(uid, set) { try { localStorage.setItem(seenKey(uid), JSON.stringify([...set])); } catch (_) {} }

export function initTrophies(ctx) { _ctx = ctx; }

// ── Albums kept on this device (designed for 500,000 accounts) ──────────────
// A trophy is never lost — an album only grows — so yours and your friends'
// are kept locally and only the stickers earned since are read: earnedAt is
// set once by the server (trophies.js, create), so `earnedAt > last sync` is
// exactly what is new (minus SYNC_MARGIN for clock skew). A trophy taken back
// (never planned, but possible) is caught by a COUNT (1 read): a mismatch
// re-reads the whole album.
//   tigertag.trophyAlbum.<uid>    { at, earned: { id: { at, event, ctx } } }  — yours
//   tigertag.friendTrophies.<uid> { <friendUid>: { at, name, earned } }      — your friends' (FRIEND_KEEP newest)
const SYNC_MARGIN = 60 * 60e3, SYNC_MAX_AGE = 30 * 864e5, FRIEND_KEEP = 50;
const albumKey = uid => `tigertag.trophyAlbum.${uid}`, friendsKey = uid => `tigertag.friendTrophies.${uid}`;
const readJson = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
const toPlain = earned => Object.fromEntries(earned);
const fromPlain = o => new Map(Object.entries(o || {}));
const fresh = at => at && Date.now() - at < SYNC_MAX_AGE;
const since = at => window.firebase.firestore.Timestamp.fromMillis(at - SYNC_MARGIN);
// How many trophies users/<owner>/trophies holds (REST COUNT, 1 read) — null when unknown.
async function countAlbum(db, owner) {
  try {
    const app = db.app, token = await app.auth().currentUser?.getIdToken();
    if (!token) return null;
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${app.options.projectId}/databases/(default)/documents/users/${owner}:runAggregationQuery`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: "trophies" }] }, aggregations: [{ alias: "n", count: {} }] } }),
    });
    const n = Number((await res.json())?.[0]?.result?.aggregateFields?.n?.integerValue);
    return Number.isFinite(n) ? n : null;
  } catch (_) { return null; }
}
function saveFriendAlbum(f) {
  if (!_uid || !f?.loaded || f.error) return;
  const all = readJson(friendsKey(_uid)) || {};
  all[f.uid] = { at: f.at, name: f.name, earned: toPlain(f.earned) };
  const keep = Object.entries(all).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, FRIEND_KEEP);
  writeJson(friendsKey(_uid), Object.fromEntries(keep));
}

// The catalogue of the app's language: the copy kept on this device at once, then the
// cdn's (once a session per language; the cdn answers 304 when it has not changed).
const catalogKey = lang => `tigertag.trophyCatalog.${lang}`;
function loadCatalog() {
  const lang = _ctx.lang();
  if (_catalog?.lang !== lang) { const kept = readJson(catalogKey(lang)); _catalog = kept ? { ...kept, lang } : null; }
  if (_catalogAsked === lang) return;
  _catalogAsked = lang;
  fetch(`${CDN}catalog/${lang}.json`, { cache: "no-cache" }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP_${r.status}`)))).then(c => {
    if (_ctx.lang() !== lang || !Array.isArray(c?.trophies)) return;
    writeJson(catalogKey(lang), c);
    if (_catalog?.v === c.v) return;
    _catalog = { ...c, lang };
    _ctx.onChange?.();
  }).catch(() => { if (_catalogAsked === lang) _catalogAsked = null; });
}

// The cards of the trophies held that this device has none for (or only a friend's reveal
// card, without the art), and — at most every REVEALS_TTL — what friends revealed. One call.
const cardsKey = uid => `tigertag.trophyCards.${uid}`, revealsKey = uid => `tigertag.trophyReveals.${uid}`;
function ensureCards(uid = _uid) {
  if (!uid) return Promise.resolve();
  if (_cardsAsking) return _cardsAsking;
  const missing = [..._earned.keys()].filter(id => !id.startsWith("ev.") && !_cards[id]?.art).slice(0, CARDS_MAX);
  const reveals = Date.now() - _reveals.at > REVEALS_TTL;
  if (!missing.length && !reveals) return Promise.resolve();
  _cardsAsking = (async () => {
    const token = await _ctx.db(uid).app.auth().currentUser?.getIdToken();
    if (!token) return;
    const res = await fetch(CARDS_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids: missing, ...(reveals ? { reveals: true, known: Object.keys(_cards) } : {}) }) });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const out = await res.json();
    if (_uid !== uid) return;
    Object.assign(_cards, out.cards || {});
    if (out.reveals) {
      _reveals = { at: Date.now(), ids: Object.fromEntries(Object.entries(out.reveals).map(([id, r]) => [id, r.by])) };
      for (const [id, r] of Object.entries(out.reveals)) if (r.card && !_cards[id]?.art) _cards[id] = r.card;
      writeJson(revealsKey(uid), _reveals);
    }
    writeJson(cardsKey(uid), _cards);
    _ctx.onChange?.();
  })().catch(() => {}).finally(() => { _cardsAsking = null; });
  return _cardsAsking;
}

export function trophiesSignIn(uid) {
  if (!_ctx || uid === _uid) return;
  trophiesSignOut();
  _uid = uid;
  _cards = readJson(cardsKey(uid)) || {};
  // The reveals kept on this device paint at once; they are asked again with the cards.
  _reveals = { ...(readJson(revealsKey(uid)) || { ids: {} }), at: 0 };
  loadCatalog();
  const db = _ctx.db(uid), col = db.collection("users").doc(uid).collection("trophies");
  const kept = readJson(albumKey(uid));
  const save = () => { writeJson(albumKey(uid), { at: Date.now(), earned: toPlain(_earned) }); };
  const failed = () => { _loaded = true; _ctx.onChange?.(); };   // unreadable: the album shows, all locked
  const listenAll = () => {
    _unsub?.();
    // Metadata changes too: the cache → server flip (no document changed) is
    // what tells the album is in step and can be kept.
    _unsub = col.onSnapshot({ includeMetadataChanges: true }, snap => {
      _earned = toEarned(snap.docs);
      _loaded = true;
      if (!snap.metadata.fromCache) save();
      celebrateNew(uid);
      _ctx.onChange?.();
    }, failed);
  };
  ensureCards(uid);
  if (!fresh(kept?.at)) { listenAll(); }
  else {
    // The album kept on this device at once, then only what was earned since.
    _earned = fromPlain(kept.earned); _loaded = true;
    let checked = false;
    _unsub = col.where("earnedAt", ">", since(kept.at)).onSnapshot({ includeMetadataChanges: true }, snap => {
      for (const c of snap.docChanges()) {
        if (c.type === "removed") _earned.delete(c.doc.id);
        else _earned.set(c.doc.id, toEarned([c.doc]).get(c.doc.id));
      }
      if (snap.metadata.fromCache) { _ctx.onChange?.(); return; }
      save();
      celebrateNew(uid);
      _ctx.onChange?.();
      if (checked) return;
      checked = true;
      countAlbum(db, uid).then(n => { if (_uid === uid && n != null && n !== _earned.size) listenAll(); });
    }, failed);
  }
  db.collection("trophyEvents").get().then(s => {
    if (_uid !== uid) return;
    _events = new Map(s.docs.map(d => [d.id, d.data()]));
    _ctx.onChange?.();
  }).catch(() => {});
}

export function trophiesSignOut() {
  _queue = [];
  _unsub?.(); _unsub = null; _uid = null;
  _earned = new Map(); _cards = {}; _reveals = { at: 0, ids: {} }; _events = new Map(); _stats = { at: 0, owners: {}, accounts: 0 }; _loaded = false; _friend = null; _friendAlbums.clear();
}

// The owners counters, read when the album opens (at most every STATS_TTL):
// trophyStats/_all, one document the backend gathers every 10 min
// (communityStats) — not one read per trophy. Before it exists: the collection.
function loadStats() {
  if (!_uid || Date.now() - _stats.at < STATS_TTL) return;
  const uid = _uid, col = _ctx.db(uid).collection("trophyStats");
  _stats.at = Date.now();
  col.doc("_all").get().then(async d => {
    if (_uid !== uid) return;
    let owners = {}, accounts = 0;
    if (d.exists) { owners = d.get("owners") || {}; accounts = Number(d.get("accounts")) || 0; }
    else for (const x of (await col.get()).docs) x.id === "_accounts" ? (accounts = Number(x.get("accounts")) || 0) : (owners[x.id] = Number(x.get("owners")) || 0);
    _stats = { at: Date.now(), owners, accounts };
    mapSlots();
    _ctx.onChange?.();
  }).catch(() => { _stats.at = 0; });
}

// Every trophy the album shows: the catalogue, then the events (newest first).
function allTrophies(have = held()) {
  const evs = [..._events.entries()].map(([id, e]) => ({ id: `ev.${id}`, family: "events", tier: "event", art: e.art || ART + "trophies/cup.webp",
    name: e.name, desc: e.desc, year: Number(e.year) || 0, date: ms(e.date), active: e.active !== false }));
  // An event trophy held but whose card is gone still shows (its id as name).
  for (const [id] of have) if (id.startsWith("ev.") && !_events.has(id.slice(3))) evs.push({ id, family: "events", tier: "event", art: ART + "trophies/cup.webp", name: id.slice(3), year: 0, date: 0 });
  evs.sort((a, b) => b.date - a.date || b.year - a.year);
  return [...catalogTrophies(have), ...evs];
}
// The catalogue's trophies, each with the picture to show: the art when this account holds
// it (its card), else the silhouette. A veiled trophy is a "?" slot of its family and tier
// (the catalogue says no more), filled by one the album's owner holds, else by one a friend
// revealed (its silhouette, `revealed` = that friend's uid). Before any catalogue: the cards alone.
function catalogTrophies(have) {
  const fromCard = id => ({ id, family: _cards[id].family, tier: _cards[id].tier, hidden: veiled(_cards[id]),
    art: _earned.has(id) && _cards[id].art || _cards[id].sil || null, ...(have.has(id) ? {} : { revealed: _reveals.ids[id] }) });
  if (!_catalog) return Object.keys(_cards).filter(id => have.has(id)).map(fromCard);
  mapSlots();
  const shown = id => id && _cards[id] && (have.has(id) || _reveals.ids[id]);
  const slots = new Map();
  // Fallback for a catalogue without slot keys: fill the family|tier slots in order.
  const ids = Object.keys(_cards).filter(id => veiled(_cards[id]) && shown(id));
  for (const id of ids.sort((a, b) => have.has(b) - have.has(a))) {
    const k = `${_cards[id].family}|${_cards[id].tier}`;
    slots.set(k, [...(slots.get(k) || []), id]);
  }
  return _catalog.trophies.map((x, i) => {
    if (!x.hidden) return { ...x, hidden: false, art: _earned.has(x.id) && _cards[x.id]?.art || (x.sil ? CDN + x.sil : null) };
    if (x.o) {
      const id = _slotIds.get(x.o);
      return shown(id) ? fromCard(id) : { id: `hidden.${i}`, family: x.family, tier: x.tier, hidden: true, art: null, statId: id || null };
    }
    const id = slots.get(`${x.family}|${x.tier}`)?.shift();
    return id ? fromCard(id) : { id: `hidden.${i}`, family: x.family, tier: x.tier, hidden: true, art: null };
  });
}
// A trophy's name and mission: the event's card, a card (held or revealed), else the catalogue's.
const textOf = (x, key) => x.family === "events" ? loc(key === "name" ? x.name : x.desc, _ctx.lang())
  : _cards[x.id] ? loc(_cards[x.id][key], _ctx.lang()) : String(x[key] || "");
const nameOf = x => textOf(x, "name");
// A family's label, from the catalogue (Studio ships none); its id until the catalogue is known.
const familyName = f => _catalog?.families?.find(x => x.id === f)?.name || f;
const descOf = x => textOf(x, "how");
// "Seen at <friend>'s": that friend's avatar before the words (the host's userAvatar).
const seenAvatar = uid => { const a = _ctx.friendAvatar?.(uid); return a ? `<span class="trp-seen-av" aria-hidden="true">${a}</span>` : ""; };

// Held already? (a secret gesture stops asking the server once it is.)
export const trophyEarned = id => _earned.has(id);

export function trophiesProgress() {
  const all = allTrophies(_earned);
  return { got: all.filter(x => _earned.has(x.id)).length, total: all.length };
}

function pct(id) {
  if (!id || !_stats.accounts || id.startsWith("ev.") || id.startsWith("hidden.")) return null;
  const n = _stats.owners[id] || 0;
  if (!n) return "0";
  const p = Math.min(100, (n / _stats.accounts) * 100);
  return p < 0.1 ? "<0.1" : p < 10 ? p.toFixed(1) : String(Math.round(p));
}

const fmtDate = d => new Date(d).toLocaleDateString(_ctx.lang(), { day: "numeric", month: "short", year: "numeric" });

function stickerHtml(x) {
  const { t, esc } = _ctx;
  const got = held().get(x.id);
  const secret = !got && x.hidden && !x.revealed || !x.art;
  const missed = !got && x.family === "events" && !x.active;
  const name = secret ? t("trophyHidden") : nameOf(x);
  // Every sticker says how many tigers hold it, the ones still to win and the "?" too.
  // A "?" slot whose key matches no counter: nobody holds it yet.
  const p = x.statId === null && _slotIds.size && _stats.accounts ? "0" : pct(x.statId || x.id);
  // The hint lives in the app's shared info bubble (ui-kit infoTipHtml → #toolInfoPop),
  // above the "i" with its tail on it, so every sticker is the
  // same size whatever its length; the card keeps the name and one line: the date, or the tier.
  const hint = missed ? t("trophyEventOver") : secret ? t("trophyHiddenHow") : descOf(x);
  // The tile says the date or the tier; whose album revealed it shows only in its card.
  const meta = got ? fmtDate(got.at) : t(`trophyTier_${x.tier}`);
  // What the search reads: the name, the hint and the tier (a hidden trophy: its "?" labels only).
  const fam = familyName(x.family);
  const q = `${name} ${hint} ${t(`trophyTier_${x.tier}`)} ${fam}`.toLowerCase();
  return `<button type="button" class="trp-st trp-t--${x.tier}${got ? " is-got" : " is-locked"}${secret ? " is-secret" : ""}" data-trophy="${esc(x.id)}" data-q="${esc(q)}"
      aria-label="${esc(`${name} — ${t(`trophyTier_${x.tier}`)} — ${got ? `${meta} — ` : ""}${hint}`)}">
    ${infoTipHtml(esc, p ? `${hint} · ${t("trophyOwnedPct", { p })}` : hint, { cls: "trp-st-info", size: 14 })}
    <span class="trp-st-art" aria-hidden="true">${secret ? `<span class="trp-st-q">?</span>` : `<img src="${esc(x.art)}" alt="" loading="lazy" draggable="false">`}${got ? `<span class="trp-gloss trp-gloss--tile" style="--art:url('${esc(artUrl(x.art))}');animation-delay:${((x.id.length * 7) % 9) * 0.5}s"></span>` : ""}</span>
    <b class="trp-st-name">${esc(name)}</b>
    <small class="trp-st-sub">${esc(meta)}</small>
  </button>`;
}

// The banner scene (hero-layers.js): the explorer's temple (assets/img/trophies/banner-explorer/,
// generated 2026-11-02 against docs/ART-DIRECTION.md, chosen by the founder over the album and
// pirate concepts). On the wall (behind the desk) a torch and two hanging vines; on the desk the
// tiger with its backpack and flashlight over the treasure map (its body hidden behind the map),
// and the open stone relic full of stickers. The stone blocks are CSS (.trp-hero, trophies.css).
const TROPHY_SCENE = heroLayersHtml(`${ART}trophies/banner-explorer/`, {
  back: ["torch", { name: "vine", cls: "vine1" }, { name: "vine", cls: "vine2" }],
  front: ["tiger-map", "relic"],
});

// A friend's stickers: the album kept on this device paints at once (memory,
// else localStorage — see "Albums kept on this device"), then after FRIEND_TTL
// only the stickers earned since the last visit are read, and a COUNT (1 read)
// catches one taken back (→ the whole album again).
function loadFriend(friend) {
  const seen = _friendAlbums.get(friend.uid);
  if (seen) { _friend = seen; _friendAlbums.delete(friend.uid); _friendAlbums.set(friend.uid, seen); }   // most recent last
  if (_friend?.uid === friend.uid && Date.now() - _friend.at < FRIEND_TTL) return;
  const uid = _uid;
  const kept = _friend?.uid === friend.uid ? { at: _friend.loaded && !_friend.error ? _friend.at : 0, earned: _friend.earned }
    : (() => { const k = (readJson(friendsKey(uid)) || {})[friend.uid]; return k ? { at: k.at, earned: fromPlain(k.earned) } : null; })();
  const delta = fresh(kept?.at);
  _friend = { uid: friend.uid, name: friend.displayName || "", earned: delta ? kept.earned : new Map(), loaded: !!delta, error: false, at: Date.now() };
  _friendAlbums.delete(friend.uid); _friendAlbums.set(friend.uid, _friend);
  while (_friendAlbums.size > FRIEND_ALBUMS_MAX) _friendAlbums.delete(_friendAlbums.keys().next().value);
  const db = _ctx.db(uid), col = db.collection("users").doc(friend.uid).collection("trophies");
  const mine = () => _uid === uid && _friend?.uid === friend.uid;
  const readAll = () => col.get().then(s => { if (!mine()) return; _friend.earned = toEarned(s.docs); });
  (delta
    ? col.where("earnedAt", ">", since(kept.at)).get().then(async s => {
        if (!mine()) return;
        for (const d of s.docs) _friend.earned.set(d.id, toEarned([d]).get(d.id));
        const n = await countAlbum(db, friend.uid);
        if (mine() && n != null && n !== _friend.earned.size) await readAll();
      })
    : readAll()
  ).then(() => {
    if (!mine()) return;
    _friend.loaded = true;
    saveFriendAlbum(_friend);
    _ctx.onChange?.();
  }).catch(() => {
    if (_friend?.uid !== friend.uid) return;
    _friend.loaded = true; _friend.error = true; _friend.at = 0;
    _ctx.onChange?.();
  });
}

export function renderTrophiesView(host, friend = null) {
  if (!_ctx || !host) return;
  const { t, esc } = _ctx;
  loadStats();
  loadCatalog();
  ensureCards();
  if (friend?.uid) loadFriend(friend); else _friend = null;
  if ((friend?.uid || null) !== _visited) { _visited = friend?.uid || null; if (_visited) _ctx.visited?.(_visited); }
  // Loaded: the album read, and the catalogue known (or out of reach: the cards alone then).
  const mine = held(), loaded = (_friend ? _friend.loaded : _loaded) && (!!_catalog || _catalogAsked === null);
  const all = allTrophies();
  const got = all.filter(x => mine.has(x.id));
  // Signature guard (.agents/rules/surgical-dom-updates.md): snapshots repaint often.
  const sig = JSON.stringify([_uid, _friend?.uid, _friend?.error, _filter, _family, [...mine.keys()], [..._events.keys()], _stats.at, _ctx.lang(), loaded, _catalog?.v, Object.keys(_cards).length, Object.keys(_reveals.ids).length]);
  if (host._trpSig === sig && host.childElementCount) return;
  host._trpSig = sig;
  // Not yet earned, in two kinds: with a hint (silhouette, name, mission) and hidden ("?").
  const isHidden = x => !mine.has(x.id) && (x.hidden && !x.revealed || !x.art);
  const hasHint = x => !mine.has(x.id) && !isHidden(x);
  const keep = x => (!_family || x.family === _family) && (_filter === "all" || (_filter === "got" ? mine.has(x.id)
    : _filter === "hint" ? hasHint(x) : isHidden(x)));
  // One album, every sticker together (catalogue order, then the events); the family shows
  // only in the card a sticker opens (founder, 2026-11-01).
  const album = `<div class="trp-grid">${all.filter(keep).map(stickerHtml).join("")}</div>`;
  const tiers = ["common", "uncommon", "rare", "epic", "legendary", "event"].map(tr => {
    const n = got.filter(x => x.tier === tr).length;
    return `<li class="trp-t--${tr}"><i aria-hidden="true"></i><b>${n}</b><span>${esc(t(`trophyTier_${tr}`))}</span></li>`;
  }).join("");
  // The filters are the Deals bar's tabs (quests.css .sqd-tab): icon, label, count.
  const FILTER_ICON = { all: "grid", got: "check", hint: "eye-on", hidden: "question" };
  const filter = (k, n) => ({ attr: `data-trp-filter="${k}"`, on: _filter === k, n, label: t(`trophyFilter_${k}`),
    icon: `<span class="icon icon-${FILTER_ICON[k]} icon-13" aria-hidden="true"></span>` });
  // The banner, built like the Deals one (squad-deals.js dealsViewHtml): the Tiger
  // Squad title block, a scene of layers on the desk, the count card on the right.
  // Laid out like the Deals view: the blocks straight in the host (.sqd-view: column, 14 px gaps).
  host.innerHTML = `
    ${heroHtml(esc, { cls: "sqr-hero trp-hero", eyebrow: t("squadBrand"),
      title: _friend ? t("trophiesFriendTitle", { name: _friend.name }) : t("trophiesTitle"),
      sub: _friend ? t("trophiesFriendTagline", { name: _friend.name }) : t("trophiesTagline"), scene: TROPHY_SCENE,
      side: `<ul class="trp-tiers trp-hero-tiers" aria-label="${esc(t("trophyByTier"))}">${tiers}</ul>
      <div class="sqr-card trp-hero-card" role="group">
        <b class="trp-hero-n">${got.length}</b><span class="trp-hero-lbl">${esc(t("trophyStuckLabel", { n: got.length }))}</span>
      </div>` })}
    ${filterBarHtml(esc, { cls: "trp-toolbar",
      tabs: [filter("all"), filter("got", got.length), filter("hint", all.filter(hasHint).length), filter("hidden", all.filter(isHidden).length)],
      search: { attr: "data-trp-q", value: _query, placeholder: t("trophySearch"), cls: "trp-search" },
      extra: selectHtml(esc, { attr: "data-trp-family", label: t("trophyFamilyAll"), value: _family,
        options: [{ value: "", label: t("trophyFamilyAll") }, ...(_catalog?.families || []).map(f => ({ value: f.id, label: f.name }))] })
        + (_friend ? "" : `<button type="button" class="sqd-tab trp-code" data-trp-code><span class="icon icon-gift icon-14" aria-hidden="true"></span>${esc(t("trophyHaveCode"))}</button>`) })}
    ${_friend?.error ? `<p class="trp-loading">${esc(t("trophiesFriendLocked", { name: _friend.name }))}</p>` : loaded ? album : `<div class="trp-loading">${esc(t("questsLoading"))}</div>`}
    <p class="trp-nomatch" hidden>${esc(t("trophyNoMatch"))}</p>`;
  // The search filters in place (no repaint: the field keeps its focus).
  const field = host.querySelector("[data-trp-q]");
  field?.addEventListener("input", () => { _query = field.value; applySearch(host); });
  applySearch(host);
  // A filter re-renders the SAME album: in a friend's view, keep the friend (else it fell back to your own).
  const again = () => renderTrophiesView(host, friend);
  host.querySelector("[data-trp-family]")?.addEventListener("change", e => { _family = e.target.value; again(); });
  host.querySelectorAll("[data-trp-filter]").forEach(b => b.addEventListener("click", () => { _filter = b.dataset.trpFilter; again(); }));
  host.querySelector("[data-trp-code]")?.addEventListener("click", () => _ctx.openCode?.());
  host.querySelectorAll("[data-trophy]").forEach(b => b.addEventListener("click", () => openTrophyCard(b.dataset.trophy)));
}

// Shows the stickers whose text (name, hint, tier, family) holds every word typed.
function applySearch(host) {
  const words = _query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  host.querySelectorAll(".trp-st").forEach(b => { const ok = words.every(w => b.dataset.q.includes(w)); b.hidden = !ok; shown += ok; });
  const none = host.querySelector(".trp-nomatch");
  if (none) none.hidden = !((_friend ? _friend.loaded : _loaded) && words.length && !shown);
}

// A url() inside a custom property resolves against the stylesheet that uses it
// (renderer/quests/), not the page: the gloss's mask gets the art's absolute URL.
const artUrl = src => { try { return new URL(src, document.baseURI).href; } catch (_) { return src; } };

// ── The detail card ──────────────────────────────────────────────
function openTrophyCard(id) {
  const x = allTrophies().find(y => y.id === id);
  // An earned sticker opens, and so does one still to win that shows a hint (its
  // silhouette and mission, to know what to do); a hidden "?" one stays shut.
  const got = x && held().get(id);
  if (!x || (!got && (x.hidden && !x.revealed || !x.art))) return;
  if (!got && !_friend) _ctx.opened?.(!!x.revealed);
  const { t, esc } = _ctx;
  const p = pct(id);
  // How it was earned, when the server said (a relit 23-day streak, the podium rank).
  const country = cc => { try { return new Intl.DisplayNames([_ctx.lang()], { type: "region" }).of(cc) || cc; } catch (_) { return cc; } };
  const how = got?.ctx?.streak ? t("trophyCtxStreak", { n: got.ctx.streak }) : got?.ctx?.country ? t("trophyCtxCountry", { country: country(got.ctx.country) })
    : got?.ctx?.rank ? t("trophyCtxRank", { n: got.ctx.rank }) : "";
  // The same window frame as the envelopes and the TigerCoins history (tc-reveal +
  // tcx card, title plaque, golden button); the sticker follows the pointer like
  // the envelope (tilt), a gloss cut to its own shape sliding across it.
  const el = document.createElement("div");
  el.className = "tc-reveal tc-envm trp-cardm";
  el.innerHTML = `<div class="tc-reveal-card tc-code-card tcx tcx--help tc-env-card trp-sticker trp-t--${x.tier}" role="dialog" aria-modal="true" aria-label="${esc(nameOf(x))}">
    <div class="tcx-main">
      <div class="tcx-plaque"><h3>${esc(nameOf(x))}</h3></div>
      <span class="trp-card-tier">${esc(t(`trophyTier_${x.tier}`))} · ${esc(familyName(x.family))}</span>
      <span class="trp-card-art${got ? "" : " is-locked"}"><span class="trp-tilt"><img src="${esc(x.art)}" alt="" draggable="false">${got ? `<span class="trp-gloss" style="--art:url('${esc(artUrl(x.art))}')"></span>` : ""}</span></span>
      <p class="trp-sticker-desc">${esc(descOf(x))}</p>
      <p class="trp-card-meta">${got ? `${esc(t("trophyEarnedOn", { date: fmtDate(got.at) }))}${how ? ` · ${esc(how)}` : ""}${p ? ` · ${esc(t("trophyOwnedPct", { p }))}` : ""}`
        : [x.revealed ? `${seenAvatar(x.revealed)}${esc(t("trophySeenAt", { name: _ctx.friendName?.(x.revealed) || "?" }))}` : "",
           p ? esc(t("trophyOwnedPct", { p })) : ""].filter(Boolean).join(" · ")}</p>
      ${_friend || !got ? "" : `<div class="tc-reveal-actions"><button type="button" class="sqd-open sqd-wide qfm-go" data-trp-save><span class="qfm-go-txt"><span>${esc(t("trophyDownload"))}</span></span></button></div>`}
    </div>
  </div>`;
  document.body.appendChild(el);
  el.querySelector("[data-trp-save]")?.addEventListener("click", () => downloadSticker(x));   // your own stickers only
  requestAnimationFrame(() => el.classList.add("is-open"));
  // An earned sticker opens as a moment: its art swells behind the window (a click
  // outside or Escape closes it).
  if (got) backfire(el, el.querySelector(".trp-sticker"), x.art, { at: "center", size: 520, dur: 5, soft: true });
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
  // Its card first (art + text): a trophy whose card could not be read waits for the next try.
  // Asked twice: a call already in flight was made before this trophy arrived, so it may not
  // carry its card (the second ask costs nothing when nothing is missing). Then the veiled
  // slots, mapped from those cards: without them a hidden trophy is not found and never shows.
  ensureCards(uid).then(() => ensureCards(uid)).then(() => _catalog && mapSlots()).then(() => {
    if (_uid !== uid) return;
    const seen = readSeen(uid);
    const all = allTrophies(_earned);
    const fresh = [..._earned.keys()].filter(id => !seen.has(id)).map(id => all.find(y => y.id === id)).filter(x => x && (x.family === "events" || _cards[x.id]?.art));
    if (!fresh.length) return;
    fresh.forEach(x => seen.add(x.id));
    writeSeen(uid, seen);
    _queue.push(...fresh);
    if (!document.querySelector(".trp-unlock")) nextUnlock();
  });
}
function nextUnlock() { const x = _queue.shift(); if (x) overlay(x); }
// The unlock plays out before anything closes it: clicks, Escape and the button wait for the
// sticker's slap and the first wave behind the window, however fast the user clicks around.
const UNLOCK_LOCK_MS = 2200;

function overlay(x) {
  const { t, esc } = _ctx;
  const el = document.createElement("div");
  el.className = `trp-unlock trp-t--${x.tier}`;
  el.innerHTML = `<div class="trp-unlock-card" role="dialog" aria-modal="true" aria-label="${esc(nameOf(x))}">
    <span class="trp-unlock-rays" aria-hidden="true"></span>
    <small>${esc(t("trophyUnlocked"))}</small>
    <span class="trp-card-tier">${esc(t(`trophyTier_${x.tier}`))} · ${esc(familyName(x.family))}</span>
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
  const locked = () => el.classList.contains("is-locked");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.classList.add("is-locked");
    setTimeout(() => el.classList.remove("is-locked"), UNLOCK_LOCK_MS);
  }
  const close = (then = nextUnlock) => {
    if (locked()) return;
    el.classList.remove("is-open"); document.removeEventListener("keydown", onKey, true);
    setTimeout(() => { el.remove(); then(); }, 250);
  };
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  el.addEventListener("mousedown", e => { if (e.target === el) close(); });
  // "See my trophies": the album, where the rest of the queue is on show anyway.
  el.querySelector(".trp-unlock-go").addEventListener("click", () => { if (locked()) return; _queue = []; close(() => {}); _ctx.openView?.(); });
}
