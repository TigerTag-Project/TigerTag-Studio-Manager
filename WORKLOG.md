# Worklog — v1.10.6 (in progress)

## Added

## Changed
- Internal/tooling: added `CODEMAP-main.md` — a feature→line-range map for `main.js` (Electron main process: IPC handlers, printer transports, cameras), mirroring `renderer/CODEMAP.md`. `check-codemap.mjs` now validates both maps, and the pre-commit hook runs it when `main.js`/`CODEMAP-main.md` (or the inventory pair) is staged. No user-facing change.

## Fixed

## Removed

## i18n
