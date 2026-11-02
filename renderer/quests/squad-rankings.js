/**
 * quests/squad-rankings.js — the TigerSquad → Rankings view (main area).
 *
 * Display only. The host (inventory.js `_openSquadBoard`, inline mode) owns the
 * data and calls these with it:
 *   board    — the leagues as the server builds them (backend functions/squadBoard.js):
 *              { world, nat: [member] — the tops, XP highest first; countries:
 *              [{ cc, xp, n, base }]; me: member + { worldRank, natRank } | null;
 *              rival: { world, nat } — the nearest member above `me` when they
 *              rank below a top (null = none, undefined = unknown) }
 *              member = { uid, name, profile, tier, xp, country, bw, bn } (bw / bn:
 *              world / national rank 7 days ago, 0 = none; base: same for a country)
 *   pulse    — publicStats/community (xpTotal, accounts, spools {…}, printers {total, byBrand}, updatedAt)
 *   history  — publicStats/community/history/{day}, oldest first ({ day, xpTotal, spools, printers })
 * Nothing here writes, counts XP or ranks differently from the existing board.
 *
 *   squadHeroHtml(ctx, board)         — banner + the account's rank card (every tab)
 *   squadRankingsHtml(ctx, data)      — Community pulse strip, the three leagues
 *   (the account's rank lives in the hero card only)
 *   ctx = { uid, t, esc, fmt, cname, flagOf, avatar(member) → html, tierLabel(tier),
 *           brandLabel(id), lang, squadXp (number|null), myCountry }
 */
import { FLAG_COLORS } from './flag-colors.js';
import { heroLayersHtml } from './hero-layers.js';
import { heroHtml } from './ui-kit.js';
import { sfx } from './coin-sound.js';

// THE rank number ("#4"), one look wherever a rank is written: league rank
// columns, the national "#1" beside a maker's flag, the rank card, the full
// list and the header chip (inventory.js imports it).
export const rankNo = n => `<span class="sqr-no">#${n}</span>`;
const MEDAL = n => `<img class="sqr-medal" src="../assets/img/tigersquad/rank-medal-${n}.webp" alt="#${n}">`;
const PREVIEW = 5;                // fewest rows shown before "View all"
// Rows per league column — at least PREVIEW, more when the view has room
// (set by the host after measuring, see setLeagueRows).
let _rows = PREVIEW;
export function leagueRows() { return _rows; }
export function setLeagueRows(n) {
  const v = Math.max(PREVIEW, Math.min(40, n | 0));
  if (v === _rows) return false;
  _rows = v;
  return true;
}
const _expanded = new Set();      // league columns opened with "View all" (kept across renders)

export function toggleLeague(key) {
  if (_expanded.has(key)) _expanded.delete(key); else _expanded.add(key);
}

// The ranked lists and the viewer's ranks the panels share. `me` is the row of
// a top when the viewer is in it (live rank), else the board's own (nightly rank).
function ranks(ctx, board) {
  const { world, nat, countries } = board;
  const me = world.find(m => m.uid === ctx.uid) || nat.find(m => m.uid === ctx.uid) || board.me || null;
  const cc = me?.country || ctx.myCountry || null;
  return { world, me, cc, nat: cc ? nat : [], countries, rival: board.rival || {},
    worldRank: board.me?.worldRank || 0, natRank: board.me?.natRank || 0 };
}
// Rank movement over 7 rolling days: the nightly job files every member's
// ranks (squadRank/{uid}) and the board rows carry the one held 7 days ago
// (bw world, bn national, base for a country); a row that moved shows the
// difference with its live rank: ▲ / ▼ with the places, the meaning in a hover
// bubble. Same place, or no rank then (joined since) → nothing shown.
const rankMove = (before, now) => (before && now ? before - now : null);
const ARROW = up => `<svg viewBox="0 0 10 8" aria-hidden="true"><path d="${up ? "M5 0 10 8H0z" : "M5 8 0 0h10z"}"/></svg>`;
const moveHtml = (t, d) => !d ? ""
  : `<small class="sqr-move ${d > 0 ? "is-up" : "is-down"}" data-tip="${t(d > 0 ? "squadMoveUp" : "squadMoveDown", { n: Math.abs(d) })}" tabindex="0">${ARROW(d > 0)}${Math.abs(d)}</small>`;

// A country shown like a member: a round "avatar" with its flag inside
// (assets/svg/flags, flag-icons 1x1), instead of an emoji.
// `podium` (1-3) rings it gold / silver / bronze, like the medal next to it.
// The World: the globe picture, drawn like a country's round flag.
const worldAv = size => `<span class="sqr-flagav" style="--s:${size}px"><img src="../assets/img/tigersquad/world-avatar.webp" alt="" decoding="async"></span>`;
const flagAv = (cc, size, podium = 0) => /^[a-z]{2}$/i.test(cc || "")
  ? `<span class="sqr-flagav${podium >= 1 && podium <= 3 ? ` sqr-flagav--p${podium}` : ""}" style="--s:${size}px"><img src="../assets/svg/flags/${cc.toLowerCase()}.svg" alt="" loading="lazy" decoding="async"></span>`
  : "";

// ── Items hero ───────────────────────────────────────────────────────────────
// The Items view's banner (hero-layers.js): the tiger in the TigerTag cap, arms
// open, still behind the desk (assets/img/tigersquad/workshop-hero/), and the four
// LEGENDARY devices on the desk (assets/img/tigersquad/legendary/*-flat*.webp),
// each a black silhouette until the account owns it, then lit. Behind each OWNED
// device an easter-egg envelope peeks out (ws<Device>, three quick clicks — the
// host's tapEgg; the server checks the device is owned); `eggFound(id)` hides the
// found ones, and no envelope is drawn until it is known (null).
// `owned` = { tigerScale, tigerSpool, tigerTouch, tigerPod } booleans.
const LEGENDARY = [
  { id: "tigerScale", img: "tigerscale-flat2", side: "l" }, { id: "tigerSpool", img: "tigerspool-flat2", side: "l" },
  { id: "tigerTouch", img: "tigertouch-flat3", side: "r" }, { id: "tigerPod", img: "tigerpod-flat2", side: "r" },
];
export function squadItemsHeroHtml(ctx, owned = {}, nextCard = "", eggFound = null) {
  const { t, esc } = ctx;
  const n = LEGENDARY.filter(x => owned[x.id]).length;
  const item = x => ({ html: `<img class="hl hl--${x.img} sqi-item${owned[x.id] ? " is-on" : ""}" src="../assets/img/tigersquad/legendary/${x.img}.webp" alt=""
      aria-label="${esc(t(`xpAch_${x.id}`))}${owned[x.id] ? "" : " — " + esc(t("questsLocked2"))}" draggable="false">` });
  return heroHtml(esc, { cls: "sqr-hero sqi-hero", eyebrow: t("squadBrand"), title: t("squadGrimoireSub"),
    sub: t("squadLegendaryCount", { n, total: LEGENDARY.length }), sceneCls: "sqi-scene", scene: heroLayersHtml("../assets/img/tigersquad/", {
        back: [{ name: "workshop-hero/tiger", cls: "ws-tiger" }],
        front: LEGENDARY.flatMap(x => {
          const egg = `ws${x.id[0].toUpperCase()}${x.id.slice(1)}`;
          const hidden = owned[x.id] && eggFound && !eggFound(egg)
            ? [{ html: `<img class="hl hl--egg hl--egg-${x.img}" data-egg="${egg}" src="../assets/img/tigercoins/envelope.webp" alt="" draggable="false">` }] : [];
          return [...hidden, item(x)];   // drawn first: the device covers most of it
        }),
      }),
    side: nextCard ? `<div class="sqr-card sqi-next">${nextCard}</div>` : "" });
}

// ── Hero ─────────────────────────────────────────────────────────────────────
export function squadHeroHtml(ctx, board, eggFound = null) {
  const { t, esc, fmt } = ctx;
  const r = ranks(ctx, board);
  // The account's rank card (the one place the page shows it): who, league, XP,
  // national + world rank, and the next rival with the real XP gap.
  // The next rival: the nearest member above with MORE XP (ties are not a target) —
  // from the top when the account is in it, else the board's own pick.
  const rivalIn = (list, far) => {
    const i = r.me ? list.findIndex(m => m.uid === r.me.uid) : -1;
    return i >= 0 ? list.slice(0, i).reverse().find(m => m.xp > r.me.xp) || null : far;
  };
  const above = rivalIn(r.world, r.rival.world), aboveNat = r.cc ? rivalIn(r.nat, r.rival.nat) : null;
  const MEDAL1 = `<img class="sqr-rival-medal" src="../assets/img/tigersquad/rank-medal-1.webp" alt="">`;
  // One rival line per league: its badge (flag / globe), then the rival — or the medal when you lead it.
  const rivalRow = (badge, rival, label) => rival === undefined ? "" : rival ? `
      <div class="sqr-rival-row" aria-label="${esc(label)}">${badge}${ctx.avatar(rival)}
        <span class="sqr-rival-txt"><b>${esc(rival.name)}</b><small>${esc(t("squadXpToGo", { xp: fmt(rival.xp - r.me.xp) }))}</small></span>
        <span class="sqr-bar" aria-hidden="true"><i style="width:${Math.max(2, Math.min(100, Math.round(r.me.xp / Math.max(1, rival.xp) * 100)))}%"></i></span>
      </div>` : `
      <div class="sqr-rival-row is-top" aria-label="${esc(label)}">${badge}${MEDAL1}<b>${esc(t("squadTopShort"))}</b></div>`;
  const card = r.me ? `
      <div class="sqr-card sq-${r.me.tier}">
        <div class="sqr-card-me">
          <span class="sqr-card-av">${ctx.avatar(r.me)}</span>
          <span class="sqr-card-head"><b class="sqr-card-name">${esc(r.me.name)}</b>
            <span class="sqr-card-league">${esc(t("squadLeagueName", { tier: ctx.tierLabel(r.me.tier) }))}</span>
            <b class="sqr-card-xp">${esc(fmt(r.me.xp))} XP</b></span>
        </div>
        <div class="sqr-card-ranks">
          ${r.natRank ? `<span class="sqr-card-ic" aria-hidden="true">${flagAv(r.cc, 20)}</span>
            <span class="sqr-card-rank" aria-label="#${r.natRank} ${esc(t("squadInCountry", { country: ctx.cname(r.cc) }))}">${rankNo(r.natRank)}</span>` : ""}
          ${/* No rank filed yet (joined today, before the nightly run): no number. */""}
          ${r.worldRank ? `<span class="sqr-card-ic" aria-hidden="true">${worldAv(20)}</span>
          <span class="sqr-card-rank" aria-label="#${r.worldRank} ${esc(t("squadWorldwide"))}">${rankNo(r.worldRank)}</span>` : ""}
        </div>
        <div class="sqr-card-rival">
          <span class="sqr-me-label">${esc(t("squadNextRival"))}</span>
          ${/* Always one line per league — country then world — leader or not: the
               leader's line shows the medal and "Number one" in place of a rival. */""}
          ${r.natRank ? rivalRow(`<span class="sqr-rival-badge">${flagAv(r.cc, 20)}</span>`, aboveNat, t("squadInCountry", { country: ctx.cname(r.cc) })) : ""}
          ${rivalRow(`<span class="sqr-rival-badge">${worldAv(20)}</span>`, above, t("squadWorldwide"))}
        </div>
      </div>`
    : `
      <div class="sqr-card sqr-card--out">
        <div class="sqr-card-me"><b class="sqr-card-name">${esc(t("squadNotRanked"))}</b>
          ${typeof ctx.squadXp === "number" ? `<b class="sqr-card-xp">${esc(fmt(ctx.squadXp))} XP</b>` : ""}
          <p class="sqr-muted">${esc(t("squadNotRankedHow"))}</p>
          ${ctx.friend ? "" : `<button type="button" class="sqr-join" data-next="join">${esc(t("squadJoin"))}</button>`}</div>
      </div>`;
  return heroHtml(esc, { cls: "sqr-hero", eyebrow: t("squadBrand"), title: t("squadHeroSub"), sub: t("squadHeroTagline"),
    scene: leagueScene(eggFound), side: board.world.length || board.me ? card : "" });
}

// The League banner scene (hero-layers.js): three tigers with their silver, gold
// and bronze medals, each one picture standing on the desk (still), paws on it,
// the trophy, the printer and the stars on the desk. The trophy is also an easter
// egg (leagueTrophy, no envelope shown: three quick clicks on the cup — the host's
// tapEgg); `eggFound(id)` drops its data-egg once found, unknown → none (null).
const leagueScene = eggFound => heroLayersHtml("../assets/img/tigersquad/league-hero/", {
  front: ["tiger-silver", { name: "tiger-gold-one", cls: "tiger-gold" }, { name: "tiger-bronze-one", cls: "tiger-bronze" },
    { html: `<img class="hl hl--trophy" data-trophy${eggFound && !eggFound("leagueTrophy") ? ` data-egg="leagueTrophy"` : ""} src="../assets/img/tigersquad/league-hero/trophy.webp" alt="" draggable="false">` }, "printer", ...[1, 2, 3, 4].map(i => ({ name: "star", cls: `spark hl--spark${i}` }))],
});

// The League trophy celebrates on a click: it jumps and shines (quests.css
// .is-cheering) with a little fanfare. One delegated listener, every render.
document.addEventListener("click", e => {
  const cup = e.target.closest?.("[data-trophy]");
  if (!cup || cup.classList.contains("is-cheering")) return;
  cup.classList.add("is-cheering");
  sfx.rarity(2);
  cup.addEventListener("animationend", () => cup.classList.remove("is-cheering"), { once: true });
});

// ── Rankings tab ─────────────────────────────────────────────────────────────
export function squadRankingsHtml(ctx, { board, loading, pulse, history }) {
  return `${pulseHtml(ctx, pulse, history)}${leaguesHtml(ctx, board, loading)}`;
}

// ── Community pulse ──────────────────────────────────────────────────────────
// Sparkline from the daily history (real points only; none → no line).
function spark(values) {
  const v = values.filter(x => Number.isFinite(x));
  if (v.length < 2) return "";
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((y, i) => [i / (v.length - 1) * 100, 34 - (y - min) / span * 30]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  return `<svg class="sqr-spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
    <path class="sqr-spark-area" d="${line} L100 36 L0 36 Z"/><path class="sqr-spark-line" d="${line}"/></svg>`;
}
// One compact strip: what it is, then three stats (icon, label, value, a line
// of context, a small sparkline over the real daily history when there is one).
export function pulseHtml(ctx, pulse, history) {
  const { t, esc, fmt } = ctx;
  // The intro carries the context: what it is, how many accounts, when it was updated.
  const intro = `<div class="sqr-pulse-intro"><span aria-hidden="true">${worldAv(30)}</span>
    <div><h3>${esc(t("squadPulse"))}</h3><p>${esc(t("squadPulseSub"))}</p>
      ${pulse ? `<p class="sqr-pulse-meta">${esc(t("squadPulseXpSub", { n: fmt(pulse.accounts) }))}${pulse.updatedAt ? ` · <span class="sqr-updated">${esc(t("squadPulseUpdated", { ago: ctx.ago(pulse.updatedAt) }))}</span>` : ""}</p>` : ""}</div></div>`;
  if (!pulse) return `<section class="sqr-pulse">${intro}<p class="sqr-muted sqr-unavail">${esc(t(pulse === null ? "squadPulseUnavailable" : "questsLoading"))}</p></section>`;
  const h = history || [];
  // The XP curve starts with the TigerSquad (older days carry no XP).
  const xpH = h.filter(d => Number.isFinite(d.xpTotal) && d.xpTotal > 0).map(d => d.xpTotal);
  const spools = h.map(d => d.spools?.total), printers = h.map(d => typeof d.printers === "number" ? d.printers : d.printers?.total);
  // data-roll / data-v: the host rolls each number to its value and pops the
  // gain ("+40 XP") when it goes up — see _rollPulse in inventory.js.
  const stat = (cls, icon, label, value, sub, series, unit = "") => `
    <article class="sqr-stat sqr-stat--${cls}">
      <span class="icon icon-${icon} icon-24" aria-hidden="true"></span>
      <div class="sqr-stat-txt"><span class="sqr-stat-label">${esc(label)}</span><b class="sqr-stat-n" data-roll="${cls}" data-v="${Number(value) || 0}" data-unit="${unit}">${esc(fmt(value))}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>
      ${spark(series)}
    </article>`;
  return `
    <section class="sqr-pulse">${intro}
      ${stat("xp", "bolt", t("squadPulseXp"), pulse.xpTotal, "", xpH, "XP")}
      ${stat("spools", "package", t("squadPulseSpools"), pulse.spools?.total, "", spools)}
      ${stat("printers", "printer", t("squadPulsePrinters"), pulse.printers?.total, "", printers)}
    </section>`;
}

// ── Leagues ──────────────────────────────────────────────────────────────────
// Each column shows its top rows, plus the account's own row when it ranks
// lower; "View all" opens the full list in place.
// The column icon already shows the flag: drop the {{flag}} slot's leftover space.
const noFlag = text => text.replace(/\s+/g, " ").trim();
function rankCell(i) { return i < 3 ? MEDAL(i + 1) : `<span class="sqr-rank">${rankNo(i + 1)}</span>`; }
// No subtitle: the account's own ranks are in the hero card.
// `outside` = [row, index] of the account when it ranks below the top the
// column holds (the board keeps the first 100), drawn as the last row.
function column(ctx, key, title, icon, rows, isMe, rowHtml, outside = null) {
  const { t, esc } = ctx;
  const open = _expanded.has(key);
  let meAt = rows.findIndex(isMe);
  if (meAt < 0 && outside) meAt = outside[1];
  // When the account ranks below the cut, its row takes the last slot, so all
  // three columns keep the same number of rows (and the same height).
  const far = meAt >= 0 && (open ? meAt >= rows.length : meAt >= _rows);
  const shown = open ? rows.map((r, i) => [r, i]) : rows.slice(0, far ? _rows - 1 : _rows).map((r, i) => [r, i]);
  const meRow = meAt < rows.length ? rows[meAt] : outside?.[0];
  const tail = far && meRow ? rowHtml(meRow, meAt).replace('class="sqr-row', 'class="sqr-row sqr-row--far') : "";
  return `
    <section class="sqr-board">
      <header class="sqr-board-head"><span class="sqr-board-ic" aria-hidden="true">${icon}</span>
        <div><h3>${esc(title)}</h3></div>
        ${rows.length > _rows ? `<button type="button" class="sqr-all" data-sqr-all="${key}" aria-expanded="${open}">${esc(t(open ? "squadShowLess" : "squadViewAll"))}</button>` : ""}
      </header>
      <ol class="sqr-rows">${shown.map(([r, i]) => rowHtml(r, i)).join("")}${tail}</ol>
    </section>`;
}
function leaguesHtml(ctx, board, loading) {
  const { t, fmt, esc } = ctx;
  if (loading) return `<div class="sqr-boards">${[0, 1, 2].map(() => `<section class="sqr-board"><div class="sqr-skel sqr-skel--board"></div></section>`).join("")}</div>`;
  const r = ranks(ctx, board);
  const mvW = (m, i) => rankMove(m.bw, i + 1), mvN = (m, i) => rankMove(m.bn, i + 1);
  // A world row's national rank: everyone with more XP than a member of the
  // world top is in it too, so it is their place among their country there;
  // the account's own row below the top takes its filed rank.
  const natIn = m => { const i = r.world.filter(x => x.country === m.country).indexOf(m); return i >= 0 ? i + 1 : r.natRank; };
  // Each maker's row wears their theme colour (the avatar colour they picked).
  const memberRow = (withFlag, mv) => (m, i) => {
    const mc = ctx.memberColor?.(m);
    return `
    <li class="sqr-row${m.uid === ctx.uid ? " is-me" : ""}${mc ? " has-mc" : ""}"${mc ? ` style="--mc:${mc}"` : ""}>${rankCell(i)}
      <span class="sqr-av">${ctx.avatar(m)}</span>
      <span class="sqr-name"><b>${esc(m.name)}${withFlag && m.country ? ` <span class="sqr-mini">${flagAv(m.country, 14)}<small>${rankNo(natIn(m))}</small></span>` : ""}</b>
        <small class="sq-${m.tier}">${esc(ctx.tierLabel(m.tier))}</small></span>
      <span class="sqr-xp">${esc(fmt(m.xp))} XP${moveHtml(t, mv(m, i))}</span></li>`;
  };
  // A country's row in its flag's colours (FLAG_COLORS, read from the bundled flags).
  const flagVars = cc => {
    const f = FLAG_COLORS[cc]; if (!f) return "";
    const [a, b = a, c = b] = f;
    return ` style="--f1:${a};--f2:${b};--f3:${c}"`;
  };
  const countryRow = (c, i) => `
    <li class="sqr-row${c.cc === r.cc ? " is-me" : ""}${FLAG_COLORS[c.cc] ? " has-flag" : ""}"${flagVars(c.cc)}>${rankCell(i)}
      <span class="sqr-av" aria-hidden="true">${flagAv(c.cc, 34, i + 1)}</span>
      <span class="sqr-name"><b>${esc(ctx.cname(c.cc))}</b><small>${esc(t("squadMembers", { n: c.n }))}</small></span>
      <span class="sqr-xp">${esc(fmt(c.xp))} XP${moveHtml(t, rankMove(c.base, i + 1))}</span></li>`;
  const globe = worldAv(36);
  return `
    <div class="sqr-boards">
      ${column(ctx, "countries", t("squadCountryLabel"), globe, r.countries, c => c.cc === r.cc, countryRow)}
      ${r.cc ? column(ctx, "national", noFlag(t("squadColNational", { flag: "", country: ctx.cname(r.cc) })),
        flagAv(r.cc, 36), r.nat, m => m.uid === ctx.uid, memberRow(false, mvN), r.natRank > r.nat.length ? [r.me, r.natRank - 1] : null) : ""}
      ${column(ctx, "world", t("squadColWorld"), globe, r.world, m => m.uid === ctx.uid, memberRow(true, mvW), r.worldRank > r.world.length ? [r.me, r.worldRank - 1] : null)}
    </div>`;
}
