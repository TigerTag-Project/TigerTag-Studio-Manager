# Worklog — v1.10.15 (in progress)

## Added
- **Group identical spools (Table) — view-only.** Identical spools now collapse into one expandable ×N entry in the inventory **Table** (folder/sub-folder metaphor). Grouping is purely a render-time construct — no Firestore change, `state.rows` untouched, physical-spool stats unchanged. Key: cloud → never grouped; TigerTag+ → same `id_product` (purely — `0`/max unset falls through to the attribute key; divergent ids on chips sharing an id_product are corrected by "Refresh from API", not the grouping key); Maker (id_tigertag = max sentinel) → brand + material + exact hex + aspect (finish); other non-plus → brand + material + exact hex. An always-visible **switch** in the inventory toolbar (icon-only + hover bubble, no text) flips it — state persisted in `localStorage` (`tigertag.inv.group`, default ON) **and synced to Firestore** `users/{uid}/prefs/app.groupInv` (cross-device, mirrors the lang pref). Groups are collapsed by default; clicking a header expands its members (indented rows, each still clickable → detail panel). Search/filter auto-expands matching members and keeps a group only if ≥1 member matches. Keyed-diff + surgical weight patch preserved (members keep `data-id=spoolId`). `renderer/inventory.js`, `renderer/inventory.html`, `css/70-detail-misc.css` *(Grid + group panel = Phase 2, not yet done)*
- **App-update notification.** When an update is available (downloading) or **ready**, the notification bell now shows a notice — the "ready" one has a **Restart** button (→ `installUpdate()`). Implemented as a per-install **local** notification (`state.localNotifications`, NOT Firestore; survives account switches), wired from the existing `onUpdateStatus` events and counted in the bell's unread badge. `renderer/inventory.js`, `css/20-friends.css`

## Changed
- **"Refresh from API" now re-syncs the full catalogue identity.** In addition to name/sku/barcode/series/image/colour-list/links/flags, it now also rewrites **brand (`id_brand`), material (`id_material`), aspect1/2 (`id_aspect1/2`), print temperatures (nozzle/bed/dryer → `data2..data7`) and the colour RGBA (`color_r/g/b/a`)** from the TigerTag+ product. The API returns string labels so a reverse lookup (`_dbIdByLabel`) resolves them back to local TigerTag DB ids. This corrects chips whose ids drifted from the catalogue (the root cause of two spools sharing one `id_product` but showing different brand/material). When a chip-stored field actually changes, the spool is flagged `needUpdateAt` (chip-pending badge) so the user knows to re-burn the physical tag — only when a value really differs, never for already-in-sync chips, never for Cloud. `renderer/inventory.js` (`_refreshApiData`, `_dbIdByLabel`, `_hexToRgba`)
- **Fill bar coloured by % remaining (iso with Flutter mobile).** The filament-available bar now changes colour by remaining percentage — `<20%` red `#F44336`, `<50%` orange `#FF9800`, `≥50%` green `#4CAF50` (Material palette, matching the mobile app). Applied everywhere: Table rows, group header (aggregate), Grid cards, and the detail-panel weight bar (static + live slider drag + snapshot patch). `renderer/inventory.js` (`fillBarColor`)

## Fixed

## Removed

## i18n
- Added: `notifUpdateAvailable`, `notifUpdateReady` — 9 locales
- Added: `invGroupToggle`, `invGroupCount`, `invGroupOn`, `invGroupOff` — 9 locales
