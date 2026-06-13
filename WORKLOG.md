# Worklog — v1.8.26 (in progress)

## Added
- Two spool containers — Anycubic masterspool (Black, 218 g) + DEEPLEE cardboard (Standard, 143 g) — `data/container_spool/spools_filament.json`, `assets/img/spool_filament/anycubic_masterspool_black.png`, `assets/img/spool_filament/deeplee_cardboard.png`
- Lifetime spool-lifecycle telemetry counters in `telemetry/studio` (increment-only, count SPOOLS — a twin pair = 1): `cloudAddedTotal`, `tagAddedTotal`, `plusAddedTotal`, `cloudToTagTotal`, `cloudToPlusTotal`, `tagToPlusTotal`. Trace how many spools of each type a user creates over time + the conversion flows (cloud→tag burn, cloud→plus, tag→plus). Hooked into `saveAddProduct`, `duplicateSpoolAsCloud`, the NFC new-chip scan branch (twin-deduped), `_cemMigrate`, `_convertToPlus` (source-classified). No backfill — counts from now on. `firestore.rules` whitelist updated + deployed — `renderer/inventory.js`

## Changed

## Fixed

## Removed

## i18n
