# Worklog — v1.8.21 (in progress)

## Added

## Changed

## Fixed
- No more flashes / disappearing grid / blank side card on Retina built-in displays in fullscreen. Root cause was Chromium's default compositor tile-memory budget (~128 MB) being blown by the inventory grid + side panel + overlays at DPR 2 — thousands of `tile_manager.cc: tile memory limits exceeded` warnings per second, each one producing a visible flash. Lifted the budget to 1 GB via `force-gpu-mem-available-mb=1024` Chromium switch. Tested live on M1 13" / macOS 26.2 Tahoe / Electron 41.3.0: ~3 800 warnings + visible bug → **11 warnings (all at the fullscreen-resize moment), zero visible bug**. External monitors (DPR 1) never tripped the limit and are unaffected. — `main.js`.

## Removed

## i18n
