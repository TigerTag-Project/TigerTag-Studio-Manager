# Worklog — v2.11.2

## Added

## Changed
- **Twin-field repair now resolves conflicts, not just gaps — the DISPLAYED spool wins.** The v2.11.1 one-shot repair filled a twin's hollow chip but left genuine conflicts (both chips carrying a *different* container or custom image, set on each before mirroring existed) untouched. Real friend data showed 8 such pairs (7 container, 1 image), some with different container *weights* → the displayed net weight depended on which chip the UI happened to show. The reconciler now treats the twin the inventory actually displays (the one `deduplicateTwins` keeps — chosen before the sort, so independent of the user's sort column) as the source of truth: its per-spool fields overwrite the other chip's, resolving conflicts to exactly what the user sees; a hollow displayed chip is still filled from its twin. Flag bumped to `tigertag.twinFix.v2.*` so accounts that already ran the fill-gaps pass get one more pass to settle conflicts; still timestamp-neutral (never writes the chip `timestamp` or `updatedAt`) — `renderer/inventory.js` (`reconcileTwinFields`).

## Fixed

## Removed

## i18n
