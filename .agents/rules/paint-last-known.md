# Paint the last known values at once

**Rule.** Nothing in the app's chrome (header, view bar, menus, badges, counters) appears late: every entry is drawn at once with the values of the last session, then updated in place when the live data lands. A view that needs data shows its last known content (or its loader inside the view), never an empty or missing control.

**Why.** Founder order (2026-11-02): the Tiger Quests "journey" button popped in seconds after start-up, once its data arrived — controls that appear late make the app feel slow and move under the cursor.

**How.**
- Per-account cache in `Cache` (`renderer/inventory.js`), key `header` (`tigertag.header.<uid>`): `stats` (header cards, `renderStats`), `coins` (TigerCoins, `_paintDealsBadge`), `bar` (view bar: quests daily / level, squad group, lists / cart / invite badges — `_barCache`, `_barCachePatch`). Add new fields there rather than a new key.
- Write the cache only from live data and only for the own account (never in a friend's view); read it while the source is still loading (`invLoading`, `productsLoading`, `listsLoading`, quests not read yet…). A loading source must not overwrite the cache with 0.
- Paint from the cache at sign-in, before the subscriptions answer; the live render then patches only what differs (`.agents/rules/surgical-dom-updates.md`).
- Values tied to a day (daily quests) carry their day and fall back to a fresh start when it changed.
- Views: a repeat visit paints from memory at once and refreshes behind, patching what changed. Live listeners stay alive across view switches and friend visits (the own inventory / racks listeners park their snapshots in `_ownStash` during a visit); a friend's data lives in the bounded memory `_friendCache` (fresh = no read), never in the own account's caches; HTTP calls and heavy one-shot reads get a short per-account TTL (`_coinStatus`, `SQUAD_BOARD_FRESH_MS`, `TAB_FRESH_MS`), data that moves once a day is read once a day.
