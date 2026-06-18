# Worklog — v1.10.11 (in progress)

## Added
- Brand logos in the "Printers Settings" manufacturer picker — each row now shows the brand's logo (masked single-path SVG) instead of a plain colour dot, each tinted with its own brand colour: Bambu green, Anycubic cyan, Elegoo royal blue, Creality neon green (`#2ee65c`), and FlashForge / Snapmaker as black wordmarks (via `var(--text)` so they stay visible in dark mode). Added the missing `logo_anycubic.svg` (the other 5 logos already existed but were unused). `assets/svg/icons/logo_anycubic.svg`, `renderer/inventory.js`, `css/40-printers.css`

## Changed
- Printers **grid & side-card** — the Online/Offline status is now shown as a **dot left of the printer name** (pulsing green when online, flat grey when offline); the separate Online/Offline pill badge was **removed** as redundant in both views. `renderer/inventory.js`, `renderer/inventory.html`, `css/40-printers.css`, `css/70-detail-misc.css`
- Printers **grid** — the **printer name is now above the image** (card order: name → image → brand pill → job → footer). `renderer/inventory.js`
- Printers **grid** — card footer now shows **"Last seen · …"** (last time the printer was seen online, `"just now"` while connected) instead of the printer-doc **"Updated · …"** — same source as the table column. `renderer/inventory.js`
- Printers **grid** — brand logo shown as a white chip on the thumbnail's top-left corner, now ~**2× larger**; the brand pill stays in the card head. Logo tinted per brand, shared with the brand picker. `renderer/inventory.js`, `css/40-printers.css`
- Printers **table** — brand logo moved into its **own dedicated column** before the printer-image column (the on-image overlay was dropped); the Brand text-badge column stays. `renderer/inventory.js`, `css/40-printers.css`
- Printers **table** — same finish as the inventory table: the table now scrolls inside a **rounded, bordered box** with a pinned header (`surface-2` background, uppercase labels), and the last row's border is dropped. `css/40-printers.css`
- Printers table — last column **"Updated" → "Last seen"**: the printer-doc `updatedAt` was replaced by the last time the printer was seen **online** — shows **"just now"** while connected, then the elapsed time once offline. Persisted in Firestore under a **separate** `users/{uid}/printerSeen/{brand:id}` collection (NOT the live-subscribed devices doc, so the writes don't churn the grid): seeded once on load, then refreshed by a 60 s heartbeat that stamps every online printer. Survives reloads/restarts. Sort + surgical table patch updated accordingly. `renderer/inventory.js`
- Printers table — IP column now shows **"Cloud"** (instead of "—") for cloud-mode printers (e.g. an Anycubic connected via cloud has no local IP). `renderer/inventory.js`
- Connection-type labels now always state **"(LAN)"** for local connections, for consistency: Creality + Snapmaker **"WebSocket (LAN)"**, Elegoo **"MQTT (LAN)"**, FlashForge **"HTTP (LAN)"** (Bambu already had it). `printers/creality/settings.js`, `printers/elegoo/settings.js`, `printers/flashforge/settings.js`, `printers/snapmaker/settings.js`
- Anycubic brand-picker description now reads **"MQTT (LAN / Cloud)"** instead of just "MQTT (LAN)" — it supports both modes. The per-printer card chip stays mode-accurate: **"MQTT (LAN)"** in LAN mode (new `connLan` meta field) and the Cloud label in cloud mode, rather than the dual capability string. `printers/anycubic/settings.js`, `renderer/inventory.js`
- Snapmaker connection tutorial: bumped the Paxx U1 Extended Firmware download to **v1.4.1-paxx12-19** (URL + button label). `printers/snapmaker/index.js`
- Bambu dual-nozzle temperature pills now render in **physical order** (left head on the left, right head on the right) and the R/L labels were dropped — position makes it obvious, the active head stays highlighted. `printers/bambulab/cards.js`, `css/50-snapmaker.css`

- Table sort is now **persisted** across restarts (localStorage): the inventory table (`tigertag.sort.inv`) and the printers table (`tigertag.sort.printer`) each remember the last clicked column + direction. Defaults: inventory sorts by **Brand** ascending, printers by **status** (online at top). `renderer/inventory.js`

## Fixed
- Bambu side-card no longer shows the filament/AMS card when the printer is **offline** (it rendered an empty "Ext. ?" slot). Now gated on `status === "connected"`, like the job and control cards. `printers/bambulab/cards.js`

## Removed
- Snapmaker connection tutorial: dropped **step 4 "Configure openrfid_user.cfg"** (and its auto-config/upload/firmware-restart logic) — no longer needed with the new Paxx firmware. The wizard is now 3 steps (firmware → install → enable OpenRFID). `printers/snapmaker/index.js`

## i18n
- Added: `printersLastSeen` — 9 locales
