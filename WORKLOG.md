# Worklog — v1.8.4 (in progress)

## Added

- **Telemetry — country + timezone + language aggregates** — `renderer/inventory.js`, `CLAUDE.md`
  - Added `studioCountry` (locale region, e.g. "FR" — derived offline from `navigator.language`, no IP geolocation) and `studioTimezone` (IANA tz) to the per-session `users/{uid}` telemetry write.
  - Added lifetime aggregates `langsUsed` + `countriesUsed` (arrayUnion) to `users/{uid}/telemetry/studio`.
  - Note: language was already persisted (`prefs/app.lang` cross-device + `studioLang`/`studioLocale` per session); OS / version / arch / sessions were already tracked. This adds the missing geo dimension.

## Changed

- **View toggles — consistent icons + materials order** — `renderer/inventory.html`, locales
  - Materials toggle reordered to **Grid · Table · Storage** (was Table · Grid · Storage). Printer toggle order unchanged.
  - Unified the icons across both groups: the **Grid** button now shows the same `⊞` glyph in both (printer Grid switched from the printer icon to `⊞`), and the **Table** button uses the same `icon-list` SVG in both (materials Table switched from the `☰` glyph to `icon-list`).
  - i18n `btnViewTable` no longer carries the `☰` glyph (now rendered as an SVG icon) — 9 locales.
  - i18n consistency: both groups now **share the same keys** (no double translation) — Grid → `btnViewGrid`, Table → `btnViewTable`. Fixed the FR mismatch where the printer Table was hardcoded "Table" while materials showed "Tableau". Printer Cam is now translated via a new `btnViewCam` key (was hardcoded). The leftover orphan key `btnViewPrinter` ("Imprimantes") is unused (left as-is — no i18n remove script).

## Fixed

- **TigerCloud "Manufactured" date wrong (~2056)** — `renderer/inventory.js`
  - Cloud docs were created with a Unix timestamp (seconds since 1970), but the TigerTag standard + `fmtChipTs` use seconds since 2000 — so the decoded date over-shot by ~30 years. Added `nowChipTs()` (chip-epoch seconds) and use it on every Cloud `timestamp` write (Add Product preview + save, Duplicate). This also makes the value correct when the Cloud doc is later burned to a physical chip.
  - `fmtChipTs` now defensively folds a stray Unix-epoch value back to the 2000 epoch (threshold ~year 2044), so already-created buggy docs display the correct date too. Duplicate normalises a legacy source timestamp before staggering.
- **Storage — twin pairs double-counted** — `renderer/inventory.js`
  - `getUnrackedSpools()` now collapses twin pairs (`deduplicateTwins`): a linked spool (one physical spool, two tags) shows once in the "not stored" list and counts once (not-stored count + side count + auto-fill pool).
  - Slot counts deduped too: total filled slots (→ correct "free" count) and per-rack header count (no more `28/27` over-capacity).
  - Side effect fixed: auto-fill no longer places the two tags of a twin into two separate slots (the pool is now deduped, and assignment already mirrors the rack to both docs via `writeWithTwin`).

## Removed

## i18n

- Added: `btnViewCam` — 9 locales
- Changed: `btnViewTable` dropped the leading `☰` glyph (now an SVG icon) — 9 locales
