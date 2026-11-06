# Worklog — v2.52.0

## Added

- Tiger Quests rank 3, **Mountaineer** (5 levels × 5 actions, 25 XP each, bonuses 50 → 150, from
  2 500 XP): envelopes, freezes and TigerCoins between friends, hidden envelopes, the sticker album,
  the Makers League, the purchase price and buy links. Spec in `docs/QUESTS.md`. What an account did
  before counts (server side, from `coinLog` and the trophy data).
  - Rank shown by the app (`RANK_IDS.mountaineer`), the check-in declares `ranks: 3` so the server
    sends it only to this version on (`renderer/quests/index.js`, `questActionCount`).
  - New counters: `inviteNetworkShare` (+ `friendLinkShare` for every Invite view share, which
    Discovery 5 missed until now — `shared` ctx of `renderer/quests/referrals.js`),
    `friendAlbumVisit`, `stickerHintOpen`, `revealedCardOpen` (`visited` / `opened` ctx of
    `renderer/quests/trophies.js`), `league_<cc>` (another country's league picked, only until
    Mountaineer 4 is done — the quest map is capped at 300 keys); gauges `pricedProducts`,
    `buyLinkProducts` (`_questGauges`, also after every products snapshot).
  - Backend (`TigerTag_Firebase_Backend`): `functions/quests.js` (rank table),
    `functions/questSocial.js` (retroactive social signals, read only for actions not done yet),
    `storeTotals` + `dailyQuest` `ranks` filter in `functions/supportWebhooks.js`, tests,
    `docs/XP-SYSTEM.html` and `docs/CODEMAP.md` regenerated, `README.md`. Deployed 2026-11-06.
  - Level pictures `assets/img/quests/mission-m1.webp` … `mission-m5.webp` (1024 px), masters in
    `assets-src/img/quests/missions/` (`mission-m<n>.png`; `-source.png` = the generated scene).
    The envelopes and TigerCoins on them are the real `assets-src/img/tigercoins/envelope.png` /
    `coin.png`, composited unchanged on scenes generated without any (a generated copy never
    matched the design).

## Changed

- Catalogue grid and list show the Refill badge before the side card opens: a refill product
  (`info1`, in the catalogue list itself) gets the same top-left badge as an inventory spool —
  the "Refill" pill on the card, the round icon on the list thumbnail. `_catViewAsRow`
  (`isRefill`), `_catThumbHTML` (`badges`), `_catViewRowHTML` in `renderer/inventory.js`.
- Badges sit in the same corners on every illustration (grid card, table thumb, spool panel,
  product card): top-left = Refill, twin, backup (under the tier badge on a panel), top-right =
  pending-chip dot, bottom-left = TD, bottom-right = ❤/★/🛍. The spool panel (`buildPanelHTML`)
  and the product card (`_productHeroParts`) had Refill, twin and backup top-right; they now stack
  top-left (`.panel-img-badge-group` / `.panel-img-badge-item` in `renderer/css/70-detail-misc.css`,
  replacing `-tr-group` / `-tr-item`).

- Releases publish themselves: a `publish-release` job in `.github/workflows/build.yml` runs
  after every build succeeded, checks each platform's installer and update manifest are on the
  draft, then publishes it as Latest (a missing file keeps it in draft). `.agents/rules/release.md`
  updated.

## Fixed

- A spool thumbnail shows the spool colour while its photo loads (group window, tables, lists),
  instead of a grey square inside the colour frame: the photo's own fill is transparent in the
  frame (`.thumb-wrap > img.thumb` in `renderer/css/70-detail-misc.css`).

- Hidden trophies get their "Trophy unlocked" window again: the unlock looked a veiled trophy up
  through its catalogue slot before the slots were mapped from its new card, missed it, and never
  asked again (e.g. `envPileRecv5`, held but never celebrated). The unlock now waits for the slots
  (`mapSlots` returns when they are ready) and asks for missing cards a second time, since a call
  already in flight was made before the trophy arrived. `renderer/quests/trophies.js`
  (`mapSlots`, `celebrateNew`).
- A trophy sticker is ONE die-cut piece: its white backing is a single shape behind the whole art
  (the `#trpDieCut` SVG filter at the end of `renderer/inventory.html`, a blurred alpha cut at a
  low threshold), instead of four stacked drop-shadows drawing an outline round each loose piece,
  which made an art with stars, whiskers or a cloud look like several stickers piled up, its stars
  cut. Album tiles, detail card and unlock window (`renderer/quests/trophies.css`).

- `.ttag` import, Import mode: a real `id_product` (not `0`, not `0xFFFFFFFF`) is kept, so a
  TigerData+ stays a TigerData+ and a TigerTag+ arrives as the TigerData+ of the same product;
  since v2.15.0 the product was always unset and both arrived as a plain TigerData.
  `_ttagBuildWrites` + the `.ttag IMPORT` header comment in `renderer/inventory.js`,
  `docs/TTAG-EXPORT-BRIEF.md`; spec fixed in TigerSystem-Docs (`ttag-format.md`, EN + FR).

- The catalogue has its series, colour names, aspects and change dates again. From 2026-09-01 to
  2026-11-06 the `get/all` export lacked `series`, `name`, `aspect1/2` and `updated_at`
  (TigerTag-Manager#98), so the catalogue's series filter, card names and spool refreshes worked
  on empty fields.
  - Bundled catalogue regenerated with `db_update.py` (`assets/db/tigertag/id_catalog.json`,
    `last_update.json` gains `products`).
  - Installed caches refresh once: the renderer cache goes to schema v3 (`CATALOG_CACHE_V`,
    `_catalogLoadCache`), and a `userData/catalog-snapshot.json` without `series` is downloaded
    again in full, ignoring its ETag (`_fetchCatalogSnapshot` in `main.js`).
  - Field counts are logged for the bundled catalogue, the snapshot and the `get/all` fallback
    (`_catalogFieldCounts`).
  - `_catSeriesName` reads `series` / `name`, and falls back to splitting `title` on its first
    " - " when they are missing.
  - Spools tied to a product are refreshed on the catalogue's `updated_at`, so any change is
    caught (name, temperatures, links, colours, photo). The `img_src` comparison is kept only for
    a product without `updated_at` (`_catalogStaleRows`). `FEATURES.md` updated.
  - `CODEMAP-main.md`: the NFC section's range now reaches `_pagesToWrite` (L563-1735).

## Removed

## i18n
- Tiger Quests rank 3 (Mountaineer) journey: `questLevel_m1`…`questLevel_m5` and 25 `questAct_m<level>_<action>` keys (after `questAct_e6_slotLock`), 11 locales.
