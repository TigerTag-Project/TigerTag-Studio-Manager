/*
 * quests/xp-history.js — the XP history page (view mode "xpHistory"): the totals
 * across the top, then the balance curve beside the breakdown ring by category,
 * then the whole activity log (filters, search, pages) beside the last transactions. Pure markup from the server's log
 * (users/{uid}/xpHistory: { key, delta, total, n, at }); the host
 * (renderer/inventory.js, _renderXpHistView) loads the log,
 * renders, and wires the controls through the data-xph-* attributes.
 */
import { heroLayersHtml } from './hero-layers.js';
import { heroHtml } from './ui-kit.js';

// The log's keys (the xpBreakdown parts) grouped into the categories the user
// reads. Losses are shown in their category in the log; the breakdown ring
// sums them apart, as "Adjustments", so a removed printer does not shrink
// "Inventory" into a confusing net figure.
export const XP_CATS = [
  { id: "daily",   color: "#ff7a1a", icon: "list-check", keys: ["daily"] },
  { id: "missions", color: "#3d8bff", icon: "compass",   keys: ["journey"] },
  { id: "squad",   color: "#ffc53d", icon: "star-fill", keys: ["squad"] },
  { id: "social",  color: "#a855f7", icon: "community",  keys: ["friend", "social", "link", "publicProfile", "photo"] },
  { id: "gear",    color: "#22d3ee", icon: "plug",       keys: ["tigerTouch", "tigerSpool", "tigerScale", "tigerPod", "usbScale", "rfidReader", "td1s", "mobileApp"] },
  { id: "stock",   color: "#f472b6", icon: "package",    keys: ["chips", "printer", "firstRack", "firstList"] },
  { id: "bonus",   color: "#3ddc84", icon: "gift",       keys: ["updates", "chest"] },
];
const ADJUST = { id: "adjust", color: "#ef4444", icon: "undo" };
const OTHER = { id: "bonus", color: "#3ddc84", icon: "gift" };
const CAT_OF = new Map(XP_CATS.flatMap(c => c.keys.map(k => [k, c])));
export const catOf = key => CAT_OF.get(key) || OTHER;

export const msOf = h => (h.at?.toMillis ? h.at.toMillis() : h.at?.seconds ? h.at.seconds * 1000 : Number(h.at) || 0);
const DAY = 86400e3;

// "TigerTag chips · 148" — the same wording as the rest of the XP UI.
function label(ctx, h) {
  const { t, fmt } = ctx;
  const name = h.key === "chips" ? t("xpPart_chips") : h.key === "squad" ? t("xpPart_squad") : t("xpAch_" + h.key);
  return h.n != null && h.key !== "squad" ? `${name} · ${fmt(h.n)}` : name;
}
// Big solid arrows for the gained / lost tiles (the icon set has none).
const BIG_ARROW = up => `<svg class="xph-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="${up
  ? "M12 2.5 21.5 12.5H15.5V21.5H8.5V12.5H2.5Z" : "M12 21.5 2.5 11.5H8.5V2.5H15.5V11.5H21.5Z"}"/></svg>`;
const BOLT = `<svg class="xph-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 1.5 4 13.5h6.5L9.5 22.5 20 9.5h-6.5z"/></svg>`;
const icon = (c, size = 16) => c.svg ? `<span class="xph-ic" style="--c:${c.color}">${c.svg}</span>` : `<span class="xph-ic" style="--c:${c.color}"><span class="icon icon-${c.icon} icon-${size}" aria-hidden="true"></span></span>`;
const signed = (ctx, d) => `${d > 0 ? "+" : "−"}${ctx.fmt(Math.abs(d))}`;

// ── Breakdown ring ───────────────────────────────────────────────
export function breakdownHtml(ctx, log, days = 30) {
  const { t, esc } = ctx;
  const since = Date.now() - days * DAY;
  // Gains only: the losses (taken-back XP) are not shown in the ring or legend.
  const sums = new Map();
  for (const h of log) {
    if (msOf(h) < since || !h.delta || h.delta < 0) continue;
    const c = catOf(h.key);
    sums.set(c.id, (sums.get(c.id) || 0) + h.delta);
  }
  const parts = XP_CATS.filter(c => sums.get(c.id)).map(c => ({ c, v: sums.get(c.id) })).sort((a, b) => b.v - a.v);
  const span = parts.reduce((a, p) => a + Math.abs(p.v), 0);
  // The ring: one arc per category, sized by its share of the XP gained, with a
  // hairline gap between arcs.
  const R = 46, C = 2 * Math.PI * R;   // a thick ring: 28 wide, its outer edge where it always was
  let at = 0;
  // Hovering an arc or its legend row lifts that arc and dims the others
  // (quests.css .xph-ring-row, matched by data-i).
  const arcs = span ? parts.map((p, i) => {
    const len = Math.abs(p.v) / span * C, gap = parts.length > 1 ? Math.min(3, len / 3) : 0;
    const arc = `<circle data-i="${i}" style="color:${p.c.color}" r="${R}" cx="64" cy="64" fill="none" stroke="${p.c.color}" stroke-width="28"
      stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-at}" transform="rotate(-90 64 64)"/>`;
    at += len;
    return arc;
  }).join("") : `<circle r="${R}" cx="64" cy="64" fill="none" stroke="#262c3d" stroke-width="28"/>`;
  const legend = parts.map((p, i) => `
    <li data-i="${i}"><span class="xph-dot" style="--c:${p.c.color}"></span><span>${esc(t("xpCat_" + p.c.id))}</span>
      <b class="${p.v < 0 ? "is-down" : "is-up"}">${signed(ctx, p.v)}</b></li>`).join("");
  return `
    <section class="xph-card">
      <header class="xph-head">${icon({ color: "#ff7a1a", icon: "bars" }, 18)}
        <div><h3>${esc(t("xpBreakdown"))}</h3><p>${esc(t("xpBreakdownSub"))}</p></div></header>
      <div class="xph-ring-row">
        <div class="xph-ring"><svg viewBox="0 0 128 128" aria-hidden="true">${arcs}</svg></div>
        ${parts.length ? `<ul class="xph-legend">${legend}</ul>` : `<p class="xph-empty">${esc(t("xpHistoryEmpty"))}</p>`}
      </div>
    </section>`;
}

// ── Full page ────────────────────────────────────────────────────────────────
export const PAGE_SIZE = 12;
const RANGES = { "7d": 7, "30d": 30, "90d": 90, all: 0 };

export function filteredLog(log, f) {
  const q = (f.q || "").trim().toLowerCase();
  // "Adjustments" = every loss; any other category = its source keys, gains and losses.
  const inCat = h => !f.cat || (f.cat === "adjust" ? h.delta < 0 : catOf(h.key).id === f.cat);
  return log.filter(h => inCat(h)
    && (!f.dir || (f.dir === "gain" ? h.delta > 0 : h.delta < 0))
    && (!q || f.labelOf(h).toLowerCase().includes(q)));
}

export function pageHtml(ctx, s) {
  const { t, esc, fmt } = ctx;
  const log = s.log, since30 = Date.now() - 30 * DAY;
  const last30 = log.filter(h => msOf(h) >= since30);
  const gained = last30.reduce((a, h) => a + Math.max(0, h.delta), 0);
  const lostSum = last30.reduce((a, h) => a + Math.min(0, h.delta), 0);
  const tile = (cls, ic, title, value, unit, sub) => `
    <article class="xph-tile xph-tile--${cls}">${icon(ic, 22)}
      <div><span class="xph-tile-t">${esc(title)}</span><b>${value}${unit ? ` <small>${unit}</small>` : ""}</b><span class="xph-tile-s">${esc(sub)}</span></div></article>`;
  const labelOf = h => label(ctx, h);
  const rows = filteredLog(log, { ...s.filter, labelOf });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, s.page), pages);
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const catOpts = [...XP_CATS, ADJUST].map(c => `<option value="${c.id}"${s.filter.cat === c.id ? " selected" : ""}>${esc(t("xpCat_" + c.id))}</option>`).join("");
  const tr = slice.map(h => {
    const c = h.delta < 0 ? ADJUST : catOf(h.key), src = catOf(h.key);
    return `<tr>
      <td class="xph-date">${esc(ctx.when(msOf(h)))}</td>
      <td><span class="xph-act">${icon(c)}<span>${esc(labelOf(h))}</span></span></td>
      <td><span class="xph-chip" style="--c:${src.color}">${esc(t("xpCat_" + src.id))}</span></td>
      <td class="xph-num ${h.delta < 0 ? "is-down" : "is-up"}">${signed(ctx, h.delta)} XP</td>
      <td class="xph-num">${fmt(h.total)} XP</td></tr>`;
  }).join("");
  // Pages: first, last, the current one and its neighbours, gaps as "…".
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const pager = nums.map((n, i) => `${i && n - nums[i - 1] > 1 ? `<span class="xph-gap">…</span>` : ""}
    <button type="button" class="xph-pg${n === page ? " is-on" : ""}" data-xph-page="${n}">${n}</button>`).join("");
  const from = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0, to = Math.min(rows.length, page * PAGE_SIZE);
  return `
    ${heroHtml(esc, { cls: "qm-hero xph-hero", eyebrow: t("squadBrand"), title: t("xpHistoryTitle"), sub: t("xpHistorySub"),
      scene: heroLayersHtml("../assets/img/quests/xph-hero/", {
        // The tiger (one picture) on the desk, its paw resting on it; still.
        front: ["monitor", { name: "tiger-one", cls: "tiger" }, "coins", "book",
          // Clickable: it turns over (the host toggles .is-flipped, quests.css).
          { html: `<img class="hl hl--hourglass" data-xph-hourglass src="../assets/img/quests/xph-hero/hourglass.webp" alt="" draggable="false">` }, ...[1, 2, 3].map(i => ({ name: "sparkle", cls: `spark hl--spark${i}` }))],
      }) })}
    <div class="xph-board">
    <div class="xph-tiles">
      ${tile("total", { color: "#ffc53d", icon: "star-fill" }, t("xpTotalTitle"), fmt(s.total), "XP", t("xpCurrentBalance"))}
      ${tile("gain", { color: "#3ddc84", svg: BIG_ARROW(true) }, t("xpGainedTitle"), `+${fmt(gained)}`, "XP", t("xpLast30"))}
      ${tile("loss", { color: "#ef4444", svg: BIG_ARROW(false) }, t("xpLostTitle"), lostSum ? `−${fmt(-lostSum)}` : "0", "XP", t("xpLast30"))}
      ${tile("acts", { color: "#ffc53d", svg: BOLT }, t("xpActivitiesTitle"), fmt(last30.length), "", t("xpLast30"))}
    </div>
    <section class="xph-card xph-chart-card">
      <header class="xph-head">${icon({ color: "#ff7a1a", icon: "bars" }, 18)}
        <div><h3>${esc(t("xpEvolution"))}</h3><p>${esc(t(SCOPE_SUB[s.scope] || "xpEvolutionSub"))}</p></div>
        ${scopeDisplays(ctx, s)}
        <div class="xph-ranges" role="group">${Object.keys(RANGES).map(r => `<button type="button" class="xph-range${s.range === r ? " is-on" : ""}" data-xph-range="${r}">${esc(r === "all" ? t("xpRangeAll") : r.toUpperCase())}</button>`).join("")}</div>
      </header>
      <div class="xph-chart" data-xph-chart>${scopeChart(ctx, s)}</div>
    </section>
    ${breakdownHtml(ctx, log).replace('class="xph-card"', 'class="xph-card xph-break-card"')}
    <section class="xph-card xph-log-card">
      <header class="xph-head">${icon({ color: "#ff7a1a", icon: "list" }, 18)}
        <div><h3>${esc(t("xpActivityHistory"))}</h3><p>${esc(t("xpActivitySub"))}</p></div>
        <div class="xph-filters">
          <select data-xph-filter="cat" aria-label="${esc(t("xpAllCategories"))}"><option value="">${esc(t("xpAllCategories"))}</option>${catOpts}</select>
          <select data-xph-filter="dir" aria-label="${esc(t("xpAllTransactions"))}"><option value="">${esc(t("xpAllTransactions"))}</option>
            <option value="gain"${s.filter.dir === "gain" ? " selected" : ""}>${esc(t("xpOnlyGains"))}</option>
            <option value="loss"${s.filter.dir === "loss" ? " selected" : ""}>${esc(t("xpOnlyLosses"))}</option></select>
          <label class="xph-search"><span class="icon icon-search icon-14" aria-hidden="true"></span>
            <input type="search" data-xph-filter="q" value="${esc(s.filter.q || "")}" placeholder="${esc(t("xpSearchActivities"))}"></label>
        </div>
      </header>
      ${tr ? `<div class="xph-table-wrap"><table class="xph-table"><thead><tr>
          <th>${esc(t("xpColDate"))}</th><th>${esc(t("xpColActivity"))}</th><th>${esc(t("xpColCategory"))}</th>
          <th class="xph-num">XP</th><th class="xph-num">${esc(t("xpColBalance"))}</th></tr></thead><tbody>${tr}</tbody></table></div>`
        : `<p class="xph-empty">${esc(t("xpHistoryEmpty"))}</p>`}
      <footer class="xph-pager">
        <button type="button" class="xph-pg xph-pg-nav" data-xph-page="${page - 1}"${page <= 1 ? " disabled" : ""}><span class="icon icon-chevron-l icon-12" aria-hidden="true"></span>${esc(t("xpPrev"))}</button>
        ${pager}
        <button type="button" class="xph-pg xph-pg-nav" data-xph-page="${page + 1}"${page >= pages ? " disabled" : ""}>${esc(t("xpNext"))}<span class="icon icon-chevron-r icon-12" aria-hidden="true"></span></button>
        <span class="xph-count">${esc(t("xpShowing", { from, to, n: rows.length }))}</span>
      </footer>
    </section>
    </div>`;
}

// ── Balance curve ────────────────────────────────────────────────────────────
// The balance after each transaction (the log's `total`), oldest first, over the
// chosen range; one dot per transaction, green for a gain and red for a loss,
// and the data each dot carries for the host's tooltip (data-i).
export function chartPoints(log, range) {
  const days = RANGES[range] ?? 30;
  const since = days ? Date.now() - days * DAY : 0;
  return log.filter(h => msOf(h) >= since && Number.isFinite(h.total)).slice().reverse();
}
/* The curve is the balance sampled at even steps over the range (like the
   TigerSquad pulse's one point a day), not one point per transaction — a
   transaction-by-transaction line is a staircase. Each sample carries the
   balance at its end and what changed during it. */
const SAMPLES = { "7d": 28, "30d": 30, "90d": 45, all: 60 };
export function chartSeries(log, range) {
  const tx = chartPoints(log, range);
  if (tx.length < 2) return tx;
  const days = RANGES[range] ?? 30, now = Date.now();
  const t0 = days ? now - days * DAY : msOf(tx[0]), n = SAMPLES[range] || 30, step = (now - t0) / n;
  // Balance before the range opens: the oldest transaction's total minus its delta.
  let bal = tx[0].total - (tx[0].delta || 0), j = 0;
  const out = [{ ms: t0, total: bal, delta: 0, n: 0 }];
  for (let k = 1; k <= n; k++) {
    const end = t0 + step * k; let delta = 0, cnt = 0;
    while (j < tx.length && msOf(tx[j]) <= end) { bal = tx[j].total; delta += tx[j].delta || 0; cnt++; j++; }
    out.push({ ms: end, total: bal, delta, n: cnt });
  }
  return out;
}
export function chartSvg(ctx, log, range, width = 1000) {
  return seriesSvg(ctx, chartSeries(log, range), range, width);
}
// One curve of { ms, total } points (the balance, or a league's summed XP).
function seriesSvg(ctx, pts, range, width = 1000) {
  if (pts.length < 2) return `<p class="xph-empty">${ctx.esc(ctx.t("xpHistoryEmpty"))}</p>`;
  // Drawn at the real pixel width (the host measures it), so text and dots keep their shape.
  const W = Math.max(320, Math.round(width)), H = 230, L = 56, R = 14, T = 14, B = 28;
  const t0 = pts[0].ms, t1 = pts[pts.length - 1].ms || t0 + 1;
  const vs = pts.map(p => p.total);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  const pad = Math.max(10, (hi - lo) * .08); lo = Math.max(0, lo - pad); hi += pad;
  const x = ms => L + (W - L - R) * ((ms - t0) / Math.max(1, t1 - t0));
  const y = v => T + (H - T - B) * (1 - (v - lo) / Math.max(1, hi - lo));
  const P = pts.map(p => [x(p.ms), y(p.total)]);
  const line = smoothPath(P);
  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = lo + (hi - lo) * i / ticks, yy = y(v).toFixed(1);
    return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="xph-grid"/><text x="${L - 8}" y="${yy}" class="xph-ylab">${ctx.fmt(Math.round(v))}</text>`;
  }).join("");
  const days = Math.max(2, Math.min(8, Math.floor(W / 140)));
  const xl = Array.from({ length: days + 1 }, (_, i) => {
    const ms = t0 + (t1 - t0) * i / days;
    return `<text x="${x(ms).toFixed(1)}" y="${H - 6}" class="xph-xlab">${ctx.esc(ctx.day(ms))}</text>`;
  }).join("");
  const [ex, ey] = P[P.length - 1];
  // No dot per transaction: the hover finds the nearest point from data-xs and
  // moves ONE guide + focus dot there (wired in inventory.js).
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="xph-svg" data-xph-range-now="${range}"
      data-xs="${P.map(q => q[0].toFixed(1)).join(",")}" data-ys="${P.map(q => q[1].toFixed(1)).join(",")}">
    <defs>
      <linearGradient id="xphFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff8c28" stop-opacity=".38"/><stop offset=".6" stop-color="#ff8c28" stop-opacity=".08"/><stop offset="1" stop-color="#ff8c28" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="xphStroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#ff7a1a"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${line} L${ex.toFixed(1)} ${H - B} L${P[0][0].toFixed(1)} ${H - B} Z" class="xph-area"/>
    <path d="${line}" class="xph-line"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="9" class="xph-end-halo"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" class="xph-end"/>
    <line class="xph-guide" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <circle class="xph-focus" r="5" cx="0" cy="0" visibility="hidden"/>
    ${xl}</svg>
    <div class="xph-tip" hidden></div>`;
}
// ── League curves ────────────────────────────────────────────────────────────
// The leagues' daily totals (squadLeagueHistory/{day}.countries, server-written
// at the end of each Paris day) plus today's live totals, as one series per
// country: { ms, total, n } with ms ≈ the end of that day.
const SCOPE_SUB = { me: "xpEvolutionSub", country: "xpCountrySub", leagues: "xpLeaguesSub" };
const LEAGUE_COLORS = ["#3da4f0", "#3ddc84", "#a78bfa", "#f472b6", "#ffc53d"];
export function leagueSeries(days, live, range) {
  const since = RANGES[range] ? Date.now() - RANGES[range] * DAY : 0;
  const rows = days.map(d => ({ ms: Date.parse(`${d.day}T21:59:00Z`), countries: d.countries || {} }));   // 22:59 or 23:59 in Paris: still that day
  if (live) rows.push({ ms: Date.now(), countries: live });
  const kept = rows.filter(r => r.ms >= since);
  const by = {};
  for (const r of kept) for (const [cc, c] of Object.entries(r.countries)) (by[cc] ||= []).push({ ms: r.ms, total: Number(c.xp) || 0, n: Number(c.n) || 0 });
  return by;
}
function scopeChart(ctx, s) {
  if (s.scope === "me") return chartSvg(ctx, s.log, s.range, s.chartW);
  if (!s.league) return `<p class="xph-empty">…</p>`;
  const { by, country, names } = s.league;
  if (s.scope === "country") {
    if (!country) return `<p class="xph-empty">${ctx.esc(ctx.t("xpNoCountry"))}</p>`;
    return seriesSvg(ctx, by[country] || [], s.range, s.chartW);
  }
  return multiSvg(ctx, leagueLines(s), s.chartW);
}
// The three scopes as clickable avatars beside the title — me (my avatar),
// my league (its round flag), the World (a globe picture) — the selected one ringed.
// No text: each says its name and XP to screen readers (aria-label).
function scopeDisplays(ctx, s) {
  const { t, esc, fmt } = ctx;
  const lg = s.league, last = cc => lg?.by[cc]?.[lg.by[cc].length - 1];
  const mine = lg?.country, all = lg ? Object.keys(lg.by).map(last).filter(Boolean) : null;
  const av = (k, name, xp, inner) => `<button type="button" class="xph-av${s.scope === k ? " is-on" : ""}" data-xph-scope="${k}" aria-pressed="${s.scope === k}"
      aria-label="${esc(xp == null ? name : `${name} · ${fmt(xp)} XP`)}">${inner}</button>`;
  return `<div class="xph-avs" role="group">
    ${av("me", t("xpScopeMe"), s.total, ctx.meAvatar?.() || "")}
    ${av("country", mine ? lg.names(mine) : t("xpScopeCountry"), mine ? last(mine)?.total : null,
      mine ? `<img src="../assets/svg/flags/${mine.toLowerCase()}.svg" alt="" decoding="async">` : `<span class="icon icon-pin icon-16" aria-hidden="true"></span>`)}
    ${av("leagues", t("xpWorld"), all ? all.reduce((a, p) => a + p.total, 0) : null, `<img src="../assets/img/tigersquad/world-avatar.webp" alt="" decoding="async">`)}
  </div>`;
}
// Leagues: the five best (by their last total) and mine, mine drawn in orange.
function leagueLines(s) {
  const { by, country, names } = s.league;
  const last = cc => by[cc][by[cc].length - 1]?.total || 0;
  const top = Object.keys(by).sort((a, b) => last(b) - last(a)).slice(0, 5);
  if (country && by[country] && !top.includes(country)) top.push(country);
  let k = 0;
  return top.map(cc => ({ cc, name: names(cc), pts: by[cc], mine: cc === country, color: cc === country ? "#ff7a1a" : LEAGUE_COLORS[k++ % LEAGUE_COLORS.length] }))
    .filter(l => l.pts.length >= 2);
}
// The tooltip of the curve's i-th point (the host finds i from data-xs).
export function chartTipHtml(ctx, s, i) {
  if (s.scope === "me" || !s.league) { const p = chartSeries(s.log, s.range)[i]; return p ? sampleTipHtml(ctx, p) : ""; }
  const { by, country, names } = s.league;
  if (s.scope === "country") { const p = by[country]?.[i]; return p ? leagueTipHtml(ctx, p, names(country)) : ""; }
  const lines = leagueLines(s); if (!lines.length) return "";
  const ref = lines.reduce((a, l) => (l.pts.length > a.pts.length ? l : a)), ms = ref.pts[i]?.ms;
  if (!ms) return "";
  const rows = lines.map(l => ({ cc: l.cc, name: l.name, color: l.color, total: l.pts.find(p => p.ms === ms)?.total }))
    .filter(r => r.total != null).sort((a, b) => b.total - a.total);
  return leaguesTipHtml(ctx, ms, rows);
}
// Several curves on one scale (same days); the tooltip names them (flag + colour).
function multiSvg(ctx, lines, width = 1000) {
  if (!lines.length) return `<p class="xph-empty">${ctx.esc(ctx.t("xpHistoryEmpty"))}</p>`;
  const W = Math.max(320, Math.round(width)), H = 230, L = 56, R = 14, T = 14, B = 28;
  const all = lines.flatMap(l => l.pts);
  const t0 = Math.min(...all.map(p => p.ms)), t1 = Math.max(...all.map(p => p.ms));
  let lo = Math.min(...all.map(p => p.total)), hi = Math.max(...all.map(p => p.total));
  const pad = Math.max(10, (hi - lo) * .08); lo = Math.max(0, lo - pad); hi += pad;
  const x = ms => L + (W - L - R) * ((ms - t0) / Math.max(1, t1 - t0));
  const y = v => T + (H - T - B) * (1 - (v - lo) / Math.max(1, hi - lo));
  const grid = Array.from({ length: 5 }, (_, i) => {
    const v = lo + (hi - lo) * i / 4, yy = y(v).toFixed(1);
    return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="xph-grid"/><text x="${L - 8}" y="${yy}" class="xph-ylab">${ctx.fmt(Math.round(v))}</text>`;
  }).join("");
  const days = Math.max(2, Math.min(8, Math.floor(W / 140)));
  const xl = Array.from({ length: days + 1 }, (_, i) => {
    const ms = t0 + (t1 - t0) * i / days;
    return `<text x="${x(ms).toFixed(1)}" y="${H - 6}" class="xph-xlab">${ctx.esc(ctx.day(ms))}</text>`;
  }).join("");
  // Mine last, so it is drawn over the others.
  const order = [...lines.filter(l => !l.mine), ...lines.filter(l => l.mine)];
  const paths = order.map(l => {
    const P = l.pts.map(p => [x(p.ms), y(p.total)]), [ex, ey] = P[P.length - 1];
    return `<path d="${smoothPath(P)}" class="xph-mline${l.mine ? " is-mine" : ""}" style="--c:${l.color}"/>
      <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${l.mine ? 4 : 3}" class="xph-mend" style="--c:${l.color}"/>`;
  }).join("");
  // The hover walks the longest line's days; the tooltip lists every league that day.
  const ref = lines.reduce((a, l) => (l.pts.length > a.pts.length ? l : a));
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="xph-svg xph-svg--multi"
      data-xs="${ref.pts.map(p => x(p.ms).toFixed(1)).join(",")}" data-ys="${ref.pts.map(p => y(p.total).toFixed(1)).join(",")}">
    ${grid}${paths}
    <line class="xph-guide" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <circle class="xph-focus" r="0" cx="0" cy="0" visibility="hidden"/>
    ${xl}</svg>
    <div class="xph-tip" hidden></div>`;
}
// Tooltips of the league curves: one league at a point, or every league that day.
function leagueTipHtml(ctx, p, name) {
  return `<small>${ctx.esc(name ? `${name} · ` : "")}${ctx.esc(ctx.day(p.ms))}</small><b>${ctx.esc(ctx.fmt(p.total))} XP</b><span>${ctx.esc(ctx.t("xpLeagueMembers", { n: p.n }))}</span>`;
}
function leaguesTipHtml(ctx, ms, rows) {
  return `<small>${ctx.esc(ctx.day(ms))}</small>${rows.map(r => `<span class="xph-tip-row" style="--c:${r.color}"><i></i><img class="xph-flag" src="../assets/svg/flags/${r.cc.toLowerCase()}.svg" alt="" decoding="async">${ctx.esc(r.name)}<b>${ctx.esc(ctx.fmt(r.total))}</b></span>`).join("")}`;
}

/* Smooth curve through the points that never overshoots them (monotone cubic,
   Fritsch–Carlson): a balance that only steps up must not dip between two
   steps. Points sharing an x (same timestamp) are passed straight through. */
function smoothPath(P) {
  const n = P.length;
  if (n < 3) return P.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { const dx = P[i + 1][0] - P[i][0]; d.push(dx > 0 ? (P[i + 1][1] - P[i][1]) / dx : 0); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (!d[i]) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  let out = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[i + 1], dx = (x1 - x0) / 3;
    if (dx <= 0) { out += ` L${x1.toFixed(1)} ${y1.toFixed(1)}`; continue; }
    out += ` C${(x0 + dx).toFixed(1)} ${(y0 + m[i] * dx).toFixed(1)} ${(x1 - dx).toFixed(1)} ${(y1 - m[i + 1] * dx).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return out;
}
// Tooltip of one sample: when, what changed in it, the balance at its end.
export function sampleTipHtml(ctx, p) {
  const chg = p.delta ? `<span class="${p.delta < 0 ? "is-down" : "is-up"}">${signed(ctx, p.delta)} XP</span>` : "";
  return `<small>${ctx.esc(ctx.when(p.ms))}</small><b>${ctx.esc(ctx.t("xpBalanceAt", { xp: ctx.fmt(p.total) }))}</b>${chg}`;
}
