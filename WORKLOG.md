# Worklog — v1.8.11 (in progress)

## Added

## Changed
- Storage view: the in-stats "+ New Rack" tile is gone — the header **+ Add Rack** button (same one that becomes "Add Product" in inventory views and "Add Device" in printer views) is now the primary "add a rack" entry point. The header button label and click handler dispatch by current view mode (inventory / printer / storage). The empty-state CTA when the user has zero racks still works — `renderer/inventory.js` (`setViewMode`, `btnAddProduct` handler, `renderRackView`), `renderer/locales/*.json` (new `addRackBtn` key)
- Storage view "not stored" side panel: contextual **+ Add Rack** CTA with a short hint, shown only when the active unranked spool count exceeds the number of free slots (i.e. the user genuinely needs more rack capacity). Orange accent to echo the "not stored" pill in the stats bar — `renderer/inventory.js` (`renderRackView`, click handler), `renderer/css/30-racks.css` (`.rp-side-add-rack*`), `renderer/locales/*.json` (new `rackNoSpaceHint` key)

## Fixed
- Storage view: rack stats no longer count "ghost" spools — both the global header (`filled / total slots`, `free`) and the per-rack header (`filled/total`) used to include any spool that still had a `rackId` set, even when the rack had been deleted or the spool's `rackLevel`/`rackPos` were out of bounds. That allowed the filled count to exceed total capacity (e.g. `130/117 slots`, `0 free`) and per-rack numbers to be larger than what was actually rendered. A shared `_isInValidSlot()` helper now requires the rackId to match a current rack and the level/position to fall inside its grid, so stats match what's visible in the slots — `renderer/inventory.js` (`renderRackView`)
- Deleting a rack now fully unassigns the spools that were inside it (both modern `rack: null` and the legacy flat `rack_id` / `level` / `position` fields are cleared via `FV.delete()`). The old code only nulled the modern field, leaving the legacy ones intact — `normalizeRow` then resolved `rackId` via the flat fallback and the spool stayed ghost-assigned to the deleted rack forever. Pre-existing orphan references are also auto-cleaned on first opening the Storage view (one-shot batch, guarded against concurrent fires) — `renderer/inventory.js` (`deleteRack`, `_cleanupOrphanRackRefs`)
- Storage view "not stored" panel now also surfaces spools whose `rackId` points to a rack that no longer exists (orphans). Until the background cleanup nulls their stale rackId, they're shown as unranked so the user can immediately see and re-assign them — `renderer/inventory.js` (`getUnrackedSpools`)

## Removed

## i18n
- Added: `addRackBtn`, `rackNoSpaceHint`, `camWallEmptyTitle`, `camWallEmptySub` — 9 locales. The two cam-wall keys were referenced in code but missing from all locales, so the cam view's empty state was showing the raw key names ("camWallEmptyTitle" / "camWallEmptySub") instead of localized text.
