# Worklog — v2.7.1

## Added

## Changed
- Buy-button host label now collapses **subdomains to the registrable domain** — "eu.store.bambulab.com" → "bambulab.com", "www.amazon.fr" → "amazon.fr" — so long shop hostnames stay short. Keeps 3 labels for known two-level public suffixes (e.g. `.co.uk`). New `_registrableDomain` helper used by `_buyHost` — `renderer/inventory.js`.

## Fixed
- Fixed `renderer/CODEMAP.md` section-range drift (`Inventory render`, `RFID encode / burn modal — cem`, `User doc sync + telemetry + bootstrap`) so mapped anchors match their real line numbers in `renderer/inventory.js`; `npm run codemap:check` passes clean again.
- **A friend's lists didn't show in friend-view.** `subscribeFriendLists` did an unconstrained `collection("lists")` query, which the security rules reject for a non-owner (it could return a `private` list) — so the whole query failed and no lists appeared. Now it queries `where("visibility", "!=", "private")` to match what the rule allows; the owner's `subscribeLists` backfills legacy lists missing the `visibility` field to `"friends"` so they're included — `renderer/inventory.js` (`subscribeFriendLists`, `subscribeLists`). No rules change.

## Removed

## i18n
