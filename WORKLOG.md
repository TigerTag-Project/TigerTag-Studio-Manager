# Worklog — v1.8.14 (in progress)

## Added

## Changed

## Fixed
- Filaments Grid and Table views no longer flash when a single spool changes in Firestore (e.g. weight slider edit, container assign, twin link, color change). `renderGrid()` and `renderTable()` were wiping their host element (`grid.innerHTML = ""` / `tbody.innerHTML = ""`) and re-creating every card / row from scratch on every Firestore snapshot — every `<img>` was destroyed and the GPU had to re-decode all 100-300 thumbnails. They now do keyed-diff updates: existing cards are reused, only the spool that actually changed is touched, and the affected card's `<img>` overlay is preserved (the URL is updated in place when it changes, not the whole node) — `renderer/inventory.js`.
- Printer Grid view: the per-card job block (state pill / progress bar / filename) no longer rebuilds on every brand poll tick when nothing actually changed. `_patchGridJobs` now compares a per-card job signature (state + isActive + pct + remainSec + filename) against the previous tick and returns without touching the DOM if identical — this is the steady-state case for any printer that's idle or offline. Brand-agnostic: same guard helps FlashForge (2 s poll), Bambu (5 s pushall), Elegoo (10 s refresh), Snapmaker and Creality (WS heartbeats) — `renderer/inventory.js`.

## Removed

## i18n
