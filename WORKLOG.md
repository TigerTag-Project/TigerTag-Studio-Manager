# Worklog — v2.59.1 (in progress)

## Added

- **Trophies for the filter chips and the colour search** (v2.59.0 features): Studio now reports them
  through the `appTrophy` call (backend `trophyRules.APP_REPORTED`, asked once per account and
  launch). Filter chips (`_fbTrophies`, from `_fbSetConds`): first chip, 3 / 5 / 8 chips at once,
  an "is not" chip, a weight range with both ends, a field added by typing its name + Enter
  (`renderer/filter-bar.js` new `onFieldTyped` option), plus a hidden one. Colour search
  (`_catColorSet`, `_catColorApply`): first colour search, a RAL, a photo point, a hit under ΔE 1.
  `_appTrophy` now asks each trophy once per account and launch. Inert until the backend batch is
  deployed (the call answers 400 and is ignored). `renderer/inventory.js`, `renderer/filter-bar.js`,
  `renderer/CODEMAP.md`.

## Changed
- Printer views (grid, table): the Brand / State / Tag dropdowns are gone; the printers filter through the same search-bar chips as the spools — Brand, Model, State (online / offline), Tag, each "is" / "is not" where it makes sense — kept in their own list (`state.printerFilters`, scope `prn` of `FB_FIELDS`, `_fbConds`), so a spool brand never filters the printers. `renderer/inventory.js` (`_fbScope`, `FB_FIELDS`, `_fbBase`, `_fbOptions`, `_fbSetConds`, `_clearSearchFilters`, `_anyFilterActive`, `applyPrinterFilter`; `populatePrinterFilters` and `state.printerBrandFilter` / `printerStatusFilter` / `printerTagFilter` removed), `renderer/inventory.html` (`.inv-filter-group`, `#brandFilter`, `#materialFilter`, `#tagFilter` removed), `renderer/css/40-printers.css`, `renderer/css/70-detail-misc.css`.
- Filter bar: the list of fields opens under the text cursor (where the text starts, following what is typed), not at the left edge of the bar. `renderer/filter-bar.js` (`place`).

## Fixed
- To-order cart: a product with spools in stock no longer reads "0 / min" (#285, PR #291). The stock is counted by the product's identity hash (`p.id`, what the product card counts with) instead of the record's stored `key`, which carries the tier. The cart, the red badge, the favourites table and the low-stock notices use it. `renderer/inventory.js` (`_stockCountByKey`, `_productOrderInfo`, `_checkLowStockNotifs`).
- Storage: spools freed by a smaller rack no longer vanish from both the grid and "Spools not stored" (#278, PR #287). `updateRack` (shrink) also deletes the legacy `rack_id` / `level` / `position`, and `drainRackMigrationQueue` leaves a doc carrying `rack: null` unranked instead of rebuilding `rack` from the leftovers. `renderer/inventory.js`.
- Storage: spools already stuck at a slot their (existing) rack no longer has are freed to "Spools not stored" (#278, PR #288): `_scheduleGhostSweep` / `_runGhostSweep` / `_findGhostSpools`, shared slot test `_slotFitsRack`; own account only, racks confirmed by the server, same picture 8 s later (`GHOST_SWEEP_DELAY_MS`), refused above 60 % of the racked spools (`GHOST_SWEEP_MAX_SHARE`). `renderer/inventory.js`, `renderer/CODEMAP.md` (Keys + profile sync range).
- League flag (#290): the account window shows the flag the league ranks the member under (`userProfiles` `tigerSquad.country`, `state.squadCountryPublished`) instead of a pick the 30-day lock still holds back, and says when that pick takes over (`squadCountryPending`). Backend (TigerTag_Firebase_Backend 0ea0896, `publishSupporter` + `claimSupport` deployed 2026-11-19; the reporter's flag was reset to Belgium with `squadCountryReset`): only a picked flag is locked (`tigerSquad.countryPicked`, `squadLock.js` `lockedCountry`), a detected flag gives way to a pick at once, and admin `claimSupport` `squadCountryReset` puts one member back on their choice. `renderer/inventory.js` (`_fillSquadCountry`), `docs/i18n-keys.md`.
- Bambu camera, EXPERIMENTAL (#271, PR #284): a camera start is not repeated for 20 s (`CAM_ASK_GUARD_MS`) while no first picture has arrived, so a redraw of the camera wall no longer kills a stream that is still starting; `bambuStopCam` resets the wait. Tested on the simulator only (not a real P2S, not Cloud). The code comment and the What's New 2.59.1 item (icon `camera`, 11 locales) say it is experimental. `renderer/printers/bambulab/index.js`, `data/whatsnew.json`.

## Removed

## i18n
- Added `squadCountryPending` (`{{country}}`, `{{date}}`).
- Removed (unused since the printer dropdowns went): `filterAllStates`, `filterAllTags`, `filterAllMaterials`, `filterShortBrand`.
