# Worklog — v1.10.25 (in progress)

## Added
- **Active-view indicator that slides (Discord-style) in the sidebar.** A single bar pinned to the sidebar's left (window) edge glides vertically — Pong-style — to line up with the avatar of the view you're currently browsing: your own when on your inventory, the friend's when previewing theirs. Positioned in JS (`_positionActiveViewPill`, found via `data-friend-uid`), re-aimed on view change (`renderFriendBanner`), chip rebuild (`renderSidebarFriends`), friends-list scroll, sidebar collapse, and window resize; the CSS `top` transition does the glide. `renderer/inventory.html`, `renderer/inventory.js`, `css/00-base.css`
- **UI sounds on account switch + friend view.** Synthesised on the fly with the Web Audio API (no asset files): a bright ascending blip when switching between your own logged-in accounts (`switchAccountUI`), and a softer, lower, distinct two-note when peeking into a friend's inventory (`switchToFriendView`). `renderer/inventory.js`

## Changed
- **Removed the orange ring around the active friend's sidebar avatar** — the sliding active-view pill is now the only "which view is active" cue (the ring also showed inconsistently). `css/00-base.css`
- **Inventory table: the weight fill bar now sits UNDER the value** (full column width) instead of cramped beside it at 64px. Scoped to `#invBody .bar`. `css/70-detail-misc.css`
- **Group header rows are white again, so hover is visible.** A group header used the same `--surface-2` background as the row-hover colour, so it always looked pre-hovered and the hover did nothing. It now sits on the default background (just bolder); hovering shows the surface-2 highlight like any other row. `css/70-detail-misc.css`
- **Table sort indicator is now a charte chevron** instead of the `⇅`/`▲`/`▼` glyphs. A masked chevron icon rotates (down by default, up when ascending, down when descending) and turns primary when the column is active — applied to both the Materials and Printers tables. `css/70-detail-misc.css`, `css/40-printers.css`

## Fixed
- **Re-clicking the friend you're already viewing is now a no-op.** It used to toggle back to your own inventory; clicking the active friend's sidebar chip now does nothing, and `switchToFriendView` short-circuits when the target is already the current friend (no re-subscribe, no repeated sound). To return to your own view, use the swap-back badge on your sidebar avatar. `renderer/inventory.js`
- **Scanning a twin spool no longer pops the detail card twice — including on close.** A twin spool has two RFID chips, so the pod reports two scans. `_consumeScanOpen` skips opening when the detail card already shows that spool or its twin (matched via `uid`/`twinUid`); and `closeDetail` now clears any queued `_scanOpenUid`, so the twin's pending open can't fire the moment you close the card (when `state.selected` is null and the twin guard no longer applies). `renderer/inventory.js`
- **Grouped rows now sort by their combined value, not an individual spool.** When sorting the inventory by Weight available or Capacity, a group (several identical spools collapsed into one row) shows the COMBINED weight/capacity but used to be ordered by one member's individual value — so the list looked out of order. `groupRows` now re-sorts the grouped items with an aggregate-aware comparator (`totalAvail` / `totalCap` for groups; representative spool for the other columns), fixing both the table and the grid. `renderer/inventory.js`

## Removed

## Internal
- **Slimmed `CLAUDE.md` (783 → 461 lines, −28%)** by moving two big always-loaded reference blocks to on-demand docs: the full i18n key table → `docs/i18n-keys.md`, and the Firestore schema + third-party connect example → `docs/firestore-schema.md`. CLAUDE.md keeps the operational bits (i18n helper/check workflow, security-rules model) and points to the docs. Also added the post-release rule: bump `package.json` to the next version right after the release commit (uncommitted) so the dev build shows the in-progress version. `CLAUDE.md`, `docs/i18n-keys.md`, `docs/firestore-schema.md`, `package.json`

## i18n
- Brand-voice pass (Lot 1) — rewrote empty states / loading / disconnect-confirmation copy in the playful, tongue-in-cheek voice + informal "tu" (9 locales): `noInventory`, `noMatch`, `invLoading`, `friendsEmpty`, `friendsEmptySub`, `noAccounts`, `delModalTitle`, `delModalWarn`
