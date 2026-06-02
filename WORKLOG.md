# Worklog — v1.8.13 (in progress)

## Added

## Changed

## Fixed
- Grid / Table inventory view: typing in the search bar no longer flashes the whole view at every keystroke. `renderInventory()` used to rebuild every card / row from scratch on each keystroke — `<tbody>.innerHTML = ""` then re-create 100-300 DOM nodes including every `<img>`, which the browser had to re-decode. The render path now renders ALL non-deleted, deduplicated rows once, and `applyInventoryFilter()` toggles `.hidden` on the existing cards / rows when search / brand / material / type changes. Mirrors the rack-view `applyRackSearchDim()` fix from v1.8.12 — `renderer/inventory.js`.
- Printer Grid view: stop the visible "refresh flash" that fired every few seconds while printers were offline. Every brand reconnect retry (2-30 s exponential backoff per printer) emitted a `statusChanged` event that re-ran `renderPrintersView()` → full `host.innerHTML = ...` rebuild of every card, including a fresh `<img>` for each printer thumbnail. Now `onPrinterGridChange` calls a surgical `_patchGridStatus()` that swaps only the `.printer-online` badge inside each card; it falls back to the full rebuild only when the online set actually changed (card needs to move between the CONNECTED and OFFLINE sections) — `renderer/inventory.js`.

## Removed

## i18n
