# Worklog — v2.59.2 (in progress)

## Added

## Changed

## Fixed
- Bambu Lab A2L added by IP is recognised from its serial prefix `26A` instead of falling back to "Select printer" (#244, PR #306); the DevModel code `N9` still wins. Prefix read off a reporter's serial, no real A2L tested. `renderer/printers/bambulab/probe.js` (`BBL_SERIAL_PREFIX_TO_ID`), `renderer/printers/bambulab/PROTOCOL.md`.
- Catalogue auto-refresh no longer floods `product/get` (#309: ~450 000 calls a day since 2.59.0, the API went down). The spools are reconciled only after a sync that downloaded a CHANGED mirror (`_catalogSignature`, localStorage `tigertag.catalogSig`), not on every inventory snapshot or window focus; every answered call stamps the spool with the mirror entry it was asked for (`tigertag.catalogAsked.<uid>`, kept across restarts), so a spool the API is behind on is not asked again until that entry moves; a 5xx / timeout / network failure stops the run and pauses every automatic ask (`tigertag.catalogBackoff`, 30 min doubling up to 8 h, also honoured by the check on opening a spool); at most 10 spools per run (`CATALOG_REFRESH_MAX`, was 40). The launch refresh of TigerTag+ spools without a photo goes through the same runner (sequential, capped, once a week per spool). Simulated: 30 spools that stay behind cost 30 calls once, then none; a 503 stops after one call. `renderer/inventory.js` (`_catalogAskBatch`, `_catalogRefreshStale`, `_catalogAutoSync`, `_catalogSync`, `_refreshApiData` `report`, `_catalogCheckOnOpen`), `CLAUDE.md` (localStorage keys), `renderer/CODEMAP.md`.

## Removed

## i18n
