/**
 * quests/ui-kit.js — the shared building blocks of the Tiger Quests / Tiger Squad
 * views, so a new view is assembled from them instead of re-typing (and drifting
 * from) the markup (.agents/rules/ui-ux-defaults.md, "Reuse what exists").
 * Pure markup; the CSS lives where it always has (quests.css).
 *
 *   heroHtml(esc, { cls, eyebrow, title, sub, scene, sceneCls, side })
 *     the banner: eyebrow pill, big title, spaced tagline, a scene of layers
 *     (hero-layers.js) on the desk, an optional card on the right. `cls` picks
 *     the family and the scene's placements: "sqr-hero sqd-hero" (Tiger Squad),
 *     "qm-hero qd-hero" (Tiger Quests)…
 *   filterBarHtml(esc, { tabs, search, extra, cls, attrs })
 *     the Deals bar: tabs (icon, label, count) + a search field + anything after.
 *     tab = { attr: 'data-x="id"', icon: markup, label, n?, on }
 *   searchHtml(esc, { attr, value, placeholder, cls })
 *     the search field (.sqd-search) — `attr` names the input for its handler.
 *   selectHtml(esc, { attr, label, options: [{ value, label }], value })
 *     a filter list — the inventory's (.inv-brand-filter), sized for the bar.
 *   infoTipHtml(esc, text, { cls, size })
 *     an ⓘ that shows `text` in the app's shared bubble (#toolInfoPop, above it,
 *     its tail on the icon) — wired once by the host on `.ui-info[data-tip]`.
 */

export function heroHtml(esc, { cls, eyebrow, title, sub, scene = "", sceneCls = "hero-scene", side = "" }) {
  return `
    <section class="${cls}">
      <div class="qm-hero-txt"><span class="qw-eyebrow">${esc(eyebrow)}</span>
        <h2>${esc(title)}</h2><p>${esc(sub)}</p></div>
      ${scene ? `<div class="${sceneCls}" aria-hidden="true">${scene}</div>` : ""}
      ${side}
    </section>`;
}

export function searchHtml(esc, { attr, value = "", placeholder, cls = "" }) {
  return `<label class="sqd-search${cls ? ` ${cls}` : ""}"><span class="icon icon-search icon-13" aria-hidden="true"></span><input type="search" ${attr} value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
}

export function filterBarHtml(esc, { tabs = [], search = null, extra = "", cls = "", attrs = "" }) {
  const tab = x => `<button type="button" role="tab" class="sqd-tab${x.on ? " is-on" : ""}" ${x.attr} aria-selected="${!!x.on}">${x.icon || ""}${esc(x.label)}${x.n ? `<b>${x.n}</b>` : ""}</button>`;
  return `
    <div class="sqd-bar${cls ? ` ${cls}` : ""}" role="search"${attrs ? ` ${attrs}` : ""}>
      <div class="sqd-tabs" role="tablist">${tabs.map(tab).join("")}</div>
      ${search ? searchHtml(esc, search) : ""}
      ${extra}
    </div>`;
}

export function selectHtml(esc, { attr, label, options = [], value = "" }) {
  return `<select class="inv-brand-filter${value ? " is-active" : ""}" ${attr} aria-label="${esc(label)}">${options
    .map(o => `<option value="${esc(o.value)}"${o.value === value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
}

export function infoTipHtml(esc, text, { cls = "", size = 13 } = {}) {
  // .tool-info gives it the app's ⓘ look (70-detail-misc.css).
  return `<span class="tool-info ui-info${cls ? ` ${cls}` : ""}" data-tip="${esc(text)}" aria-label="${esc(text)}"><span class="icon icon-info icon-${size}" aria-hidden="true"></span></span>`;
}
