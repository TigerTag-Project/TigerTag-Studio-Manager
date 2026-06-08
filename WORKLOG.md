# Worklog — v1.8.18 (in progress)

## Added

## Changed

## Fixed
- Auto-update URLs were pointing at `TigerTag_Studio_Manager` (underscores) instead of the canonical `TigerTag-Studio-Manager` (hyphens). GitHub silently 301-redirected each request, doubling the round-trip chain and making every electron-updater check more fragile (every redirect is a chance for an edge 504 to abort the whole check). Renamed across `package.json` (electron-builder `publish.repo` — most critical, controls auto-update), `main.js` (About → website), `renderer/inventory.js` (sidebar + sign-in GitHub buttons) and `TRADEMARK.md` (badge URLs). Takes effect from v1.8.18 onwards — `package.json`, `main.js`, `renderer/inventory.js`, `TRADEMARK.md`.

## Removed

## i18n
