# Worklog — v1.10.22 (in progress)

## Added

## Changed
- **QR codes are no longer clickable** (they're for scanning, not clicking). Removed the sidebar QR `#sbQrWrap` click-to-open handler and its `cursor:pointer` + hover affordance. The empty-state card QRs were already non-clickable. `renderer/inventory.js`, `css/10-settings.css`
- **Empty-inventory hero now shows the product mockup** (`assets/img/tiger_studio_and_tiger_rfid_connect_mockup.png`, laptop + phone) instead of the small framed `icon.png`, with the title + subtitle moved **above** the image. `.inv-welcome-logo--framed` (180×180 square) replaced by `.inv-welcome-logo--mockup` (wide, ratio preserved, `min(460px, 72vw)`). `renderer/inventory.js`, `css/70-detail-misc.css`
- **Mobile beta link/QR updated to the universal `taap.it/nX7QSrz`.** It auto-routes to the iOS (TestFlight) or Android beta based on the scanning phone. Replaced the sidebar "Mobile Apps" QR + click and the empty-state beta card. The beta card now **mirrors** the production "App Store & Google Play" card (same header text + two App Store / Google Play pills + same "scan to install" foot note) — the only differences are the orange header, the BETA badge, and the beta QR/link. The production card (`taap.it/DF1Aqt`) is unchanged. `renderer/inventory.html`, `renderer/inventory.js`
- **Add/change avatar from the top-left avatar.** Hovering your own header avatar reveals a small edit badge (bottom-right) — clicking it launches pick → crop → upload directly (reuses `uploadCroppedAvatar`) and refreshes the header; the rest of the avatar still opens the account menu, which also got an "Add a photo" / "Change photo" first item. Both blocked in friend view (the swap-back badge shows there instead). `renderer/inventory.js`, `renderer/inventory.html`, `css/00-base.css`
- **The Cam "Detach" button is hidden in a friend's view.** It detaches the owner's own camera wall, so it has no place when viewing a friend — gated on `!state.friendView` in both visibility paths. `renderer/inventory.js`

## Fixed

## Removed
- `invQrBetaNote` i18n key — the beta card now reuses `invQrScanHint` (identical foot note to the store card) — 9 locales

## i18n
- Added: `addAvatar`, `changeAvatar` — 9 locales
- Changed: `invWelcomeTitle` — 9 locales (now mentions scanning + 3D printers)
- Removed: `invQrBetaNote` — 9 locales
