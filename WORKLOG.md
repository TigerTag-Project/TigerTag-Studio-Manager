# Worklog — v1.10.21 (in progress)

## Added

## Changed
- **Cam view toolbar simplified.** In the printer Cam view the search bar + brand/material/version filters and the "Scan" / "Add device" buttons (none of which apply to the camera wall) are hidden, and the camera-wall "Detach" button moved up into the actions slot in the same orange style as the other action buttons (`#camWallDetachTop`, shown only in Cam via `#card-inv.is-cam-view`). The old in-wall `.cam-wall-toolbar` / detach button + CSS were removed. `renderer/inventory.html`, `renderer/inventory.js`, `css/70-detail-misc.css`, `css/40-printers.css`
- **View selector moved above the search bar** (in every view). The Materials/Printers view-toggle row now sits at the top of the inventory toolbar, with the search + filters below it. `renderer/inventory.html`, `css/70-detail-misc.css`
- **Creality fans rendered as cards with ±10% steppers** (like Snapmaker/Elegoo) instead of sliders. Each fan (Part / Case / Side, gated by model) is a card: toggle icon + label + `[−] [%] [+]` stepper; `±10%` steps go through `creActionFan` (M106, optimistic). Reuses the shared `.elg-fan-*` control-widget styles; the old slider markup, wiring (`data-cre-fan-slider` change/input handlers) and CSS were removed. `renderer/printers/creality/index.js`, `renderer/inventory.js`, `css/55-creality.css`
- **Removed the icons from the "Materials" / "Printers" view-toggle group labels** (kept the text). `renderer/inventory.html`
- **Auto storage + Auto unstorage merged into one "Auto-organize" toggle.** They're a single automation concept (place new spools, free emptied slots), so the two switches became one. With it ON: new spools auto-place, emptied slots auto-free (respecting locks), the bin shows the opt-out affordance and a rack's "Clear all" is hidden. Exceptions are handled by locking a slot. Backed by a single `autoManage` pref — per-account + synced across devices (Firestore `prefs/app`, localStorage cache), with a soft migration from the legacy `autoStorage`/`autoUnstorage` flags (local + Firestore: unified = either-was-on). `renderer/inventory.js`
- **"Spools not stored" header tidied up.** The Add-Rack CTA and the Auto-organize row are compact: long inline help texts replaced by a small `ⓘ` info bubble that reveals the explanation on hover/focus (styled CSS bubble via `data-tip`, not a native `title`); the toggle is single-line (label + `ⓘ` + switch), only the switch is clickable. `renderer/inventory.js`, `css/30-racks.css`

## Fixed
- **Printer table top spacing now matches the materials table.** The printer table wrap (`.pt-wrap`) had no top margin while the inventory `.table-wrap` has `margin-top: 12px`, so the gap below the search bar differed between the two tables. Added the same 12px. `css/40-printers.css`
- **RFID reader badge showed the raw key `rfidNoReader`.** The top-right TigerPod indicator renders synchronously at module load — before the async `loadLocales()` populates `state.i18n` — so `t("rfidNoReader")` fell back to the key, and with no reader ever connected the badge never re-rendered. Added `data-i18n="rfidNoReader"` to the span so `applyTranslations()` (which runs after locales load) translates it. `renderer/inventory.js`
- **Cross-account rack corruption when switching accounts.** Bouncing between two accounts (especially while toggling Auto storage/unstorage) could clear every spool from its rack slot on the account you returned to, leaving the slot locks behind (locked-but-empty). Root causes fixed: (1) the inventory `onSnapshot` now drops buffered callbacks from a previous account (`uid !== state.activeAccountId`) so they can't load stale rows and write to the now-active account; (2) the auto storage/unstorage routines bail unless the signed-in Firebase user matches the active account; (3) Auto unstorage now respects slot locks (`isSlotLocked`) — a 0 g spool in a locked slot is no longer freed, so a locked slot keeps its spool. `renderer/inventory.js`

## Removed

## i18n
- Added: `autoOrganizeTitle`, `autoOrganizeSub`, `camDetach` — 9 locales (the old `autoStorage*`/`autoUnstorage*` strings are kept but no longer used in the panel)
