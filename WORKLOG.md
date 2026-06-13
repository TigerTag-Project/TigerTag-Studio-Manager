# Worklog — v1.8.25 (in progress)

## Added
- Studio telemetry v2 — `users/{uid}/telemetry/studio` is now a self-contained Studio-Manager analytics doc. New **current-state snapshot** (overwritten each session): `lang`, `country`, `hasAvatar`, `accountsCount`, `friendsCount`, `spoolsCount`, `racksCount`, `rackSlotsTotal`, `scalesCount`, `printerCount`. New **onboarding funnel** timestamps (stamped once): `firstSeen`, `firstSpoolAt`, `firstRackAt`, `firstPrinterAt`, `firstFriendAt`. Written by a deferred trigger (`recordStudioState`/`scheduleStudioStateRecord`, 7 s debounce) so counts are captured after the inventory/racks/printers/scales subscriptions settle, not at login (which would record 0) — `renderer/inventory.js`. Companion `firestore.rules` whitelist update deployed in the backend repo.
- Offline timezone → country map (`tzToCountry`) — fills `country`/`studioCountry` when the browser locale has no region subtag (`"fr"` → Europe/Paris → `FR`); no IP geolocation — `renderer/tz-country.js`
- `npm run codemap:check` — CODEMAP drift guard: verifies every anchor in `renderer/CODEMAP.md` against its declared line range in `inventory.js` (±150 lines) and that the map covers the whole file — `scripts/check-codemap.mjs`, `package.json`
- Pre-commit JS syntax check — `node --check` on every staged `.js`/`.mjs` file (renderer files checked as ES modules via `--input-type=module`) — `.githooks/pre-commit`
- Pre-commit CODEMAP drift check — runs `codemap:check` whenever `inventory.js` or `CODEMAP.md` is staged — `.githooks/pre-commit`
- ESLint regression guard (`npm run lint`) — minimal config, 2 rules: `no-undef` (error, blocks commit via pre-commit on staged files), `no-unused-vars` (non-blocking warning). Renderer linted as browser ES modules, main/preload/cam-preloads/RFID parser as CommonJS, vendored `renderer/lib/` ignored — `eslint.config.mjs`, `.githooks/pre-commit`, `package.json` (+ `eslint`, `globals` devDependencies)

## Changed
- Debug panel → Firestore explorer: added a `telemetry` quick-access chip (`users/{uid}/telemetry/studio`) next to `user doc`/`prefs` — `renderer/inventory.js`
- `studioCountry` (root doc) + telemetry `country` now fall back to timezone when the locale has no region — previously always `null` for `"fr"`-locale users despite a known timezone — `renderer/inventory.js` (shared `deriveCountry` helper)
- Telemetry `langsUsed`/`countriesUsed` historical arrays no longer written — replaced by current-state `lang`/`country`. Kept in the `firestore.rules` whitelist (legacy) so merge-writes onto docs that still hold them don't fail `hasOnly()` — `renderer/inventory.js`
- `renderer/CODEMAP.md` — full resync with the real `inventory.js` (16.1k lines, was mapping a 12.4k-line IIFE): rebuilt bird's-eye + all section line ranges, added "Extracted modules" table (`printers/*`, `IoT/*`, `rfid_protocol/*`), documented new sections (Add Product panel, RFID encode/burn modal, TigerTag+ catalogue, custom avatar cropper, telemetry, init bootstrap), anchor-first cookbook
- `CLAUDE.md` — file map refreshed: 10 CSS files (added `55-creality.css`, `57-elegoo.css`), `IoT/` + `rfid_protocol/` folders, all 5 printer integrations marked implemented, line counts corrected to ~16k, documented `codemap:check`

## Fixed
- Encoded spool resets to "generic cardboard" + wrong weight on first rescan — `_cemMigrate` wrote the chip's freshly-burned timestamp onto the tag but left the Firestore doc carrying the old cloud-doc timestamp. On the next scan the timestamps mismatched, the scan path treated the chip as "rewritten for a different filament" and hard-deleted the doc (wiping `container_id`/`container_weight`/DB weight), which `autoAssignMissingContainers` then refilled with the generic-cardboard default. Now the migrated doc is stamped with the same burned timestamp so the rescan takes the "same chip" branch and preserves the user's container + weight — `renderer/inventory.js` (reported on macOS v1.8.24)
- Client telemetry silently broken — `syncUserDoc` called undefined `getAppInfo()` instead of `loadAppInfo()`; the surrounding try/catch swallowed the ReferenceError, so no `studio*` fields or `telemetry/studio` aggregates were written since the rename (found by the new ESLint guard). Telemetry write failures now log a `console.warn` instead of being silently swallowed. Companion fix deployed in the Firebase backend repo: `firestore.rules` telemetry whitelist was missing `langsUsed`/`countriesUsed`, which rejected the whole aggregate write (verified live: `sessionsCount` increments again) — `renderer/inventory.js`
- TD1S → Add Product panel live sync crashed on every sensor frame — `onAdpData` was missing from the ctx destructure in the sensor engine, throwing a ReferenceError after the tester display update (found by the new ESLint guard) — `renderer/IoT/td1s/index.js`

## Removed

## i18n
