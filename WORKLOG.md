# Worklog — v1.10.18 (in progress)

## Added
- **Spool grouping in Grid view (Phase 2).** Identical spools now also collapse in the **Grid**: one "deck"-style card (stacked-paper shadow) with a ×N badge per group. Clicking it opens a **slide-in group panel** (non-modal, with a `»` close tab like the other side cards) listing the member spools as **horizontal list-cards** (image left, name/material·brand/weight right, stacked vertically); clicking a member opens the normal detail panel, which **pushes the group panel left** (stacked side-by-side, same `_syncPanels` mechanism as the printer ↔ material ↔ settings panels) instead of closing it. Reuses the same `groupRows` / `_spoolGroupKey` as the Table; the group toggle now drives both views; search/filter shows a group deck if any member matches. Panel is resizable (`tigertag.panelWidth.group`). **Table groups now also open this side panel on click** (the old inline expand is gone — `_toggleGroupExpanded` removed). `renderer/inventory.js` (`renderGrid`, `_createGroupGridCard`, `_openGroupPanel`), `renderer/inventory.html` (`#groupPanel`), `css/70-detail-misc.css`

## Changed
- **Side-panel push: smooth on open, instant on resize.** The `.25s` `right` transition is kept on side cards + their `»` close tabs so a newly-opened panel **pushes the already-open one progressively** (and the tab follows). During a live resize, a global `body.panel-resizing` class disables that transition so panels/tabs track the dragged edge **instantly** (no lag). Simple global toggle — no per-tab machinery. `css/70-detail-misc.css`, `renderer/inventory.js`
- **Group panel: micro-dashboard header + bigger thumbnails.** The panel opens with a **dashboard** (not a card): a **speedometer gauge** (3/5 arc, gap at bottom, 0% lower-left → 100% lower-right, colour-coded, % in the centre) for the group's remaining filament, plus **brand** (title) / **material + aspect** / combined **remaining/total weight + spool count**. It replaces the panel title (left blank). Updates **live** while a member's weight is dragged (`_patchGroupSummaryWeight`) and on any Firestore/scale change. Member thumbnails enlarged ~30% (50→65px).
- **Group panel member cards restyled + live weight.** Each member list-card now shows the tier badge **under the image** (left column) and the **weight in grams with the quantity bar on the line below it**. The open group panel now reflects weight changes **in real time** — both while dragging the detail slider (`_patchGroupMemberWeight`) and on any Firestore update / scale change (`_refreshGroupPanelIfOpen` on every render). `renderer/inventory.js`, `css/70-detail-misc.css`

## Fixed
- **Group toggle tooltip was untranslated.** `invGroupOn`/`invGroupOff` showed the raw key — the toggle's `data-tooltip` was set once before the locales finished loading and never refreshed. Now re-localised in `applyTranslations` (covers first load + every language switch). `renderer/inventory.js`

## Removed

## i18n
