# Worklog — v2.29.0

## Added
- Printer LAN scan, every brand: results are tickable — tick one or several, then "Add these N printers". One ticked → the prefilled settings form, as before; several → added in one batch, and a required field the scan could not read (Bambu/Elegoo access code, FlashForge check code or serial, Anycubic credentials without a slicer match) is asked for on each ticked card. Shared module `renderer/printers/scan-pick.js`; each brand's form prefill extracted into a `_prefillFor` builder; new `ctx.printerRequiredFields` / `ctx.addScannedPrinters` (same doc shape as the form's Save) — `renderer/printers/*/add-flow.js`, `renderer/printers/context.js`, `renderer/inventory.js`, `renderer/css/40-printers.css`
- Debug mode: the per-card view badge (copy-ref chip) now also appears on the add-printer flow — brand picker, add/edit form, and every per-brand card (choice / scan / manual / cloud / import); per-brand cards are named from their id and point at their own `add-flow.js`. Internal / debug-only — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`, `renderer/CODEMAP.md`
- Bambu Lab cloud: China-mainland accounts (issue #33) — an "Account region" row with a Global / China mainland segmented switch in the sign-in panel; China accounts can sign in with a phone number (SMS code, `+86` stripped), typing a number flips the switch by itself; an empty or malformed entry is refused with a message saying why (field ringed red). Every cloud call (login, TFA, uid, bind, tasks, firmware) goes to the `.cn` twin hosts and the broker to `cn.mqtt.bambulab.com` (no us/eu fallback). Hosts taken from ha-bambulab/pybambu — not yet validated on a real China account — `main.js`, `renderer/printers/bambulab/add-flow.js`, `renderer/printers/bambulab/index.js`, `renderer/css/40-printers.css`, `renderer/printers/bambulab/PROTOCOL.md` (§17.3b)

## Changed
- Bambu cloud session doc (`users/{uid}/printers/bambulab/secrets/cloud_session`): `email` renamed `account` (it can now be a phone number; the old field is deleted on the next sign-in), `region` now `"us"|"eu"|"cn"` — `renderer/inventory.js`, `docs/bambu_connect_cloud.md`

## Fixed
- Add-printer flow: switching from one brand card to the next (e.g. Bambu Lab choice → cloud sign-in) slid the new card in BEHIND the old one; the outgoing card is now held underneath during the swap — `renderer/css/40-printers.css`

## Removed

## i18n
- Changed: `bblCloudEmailPh` — plain "Email" instead of an example address — 11 locales
- Added: `printerScanAddSelected`, `printerScanFillMissing`, `printerScanAddFailed` — 11 locales
- Added: `bblCloudRegionLabel`, `bblCloudRegionGlobal`, `bblCloudRegionChina`, `bblCloudAccountPhCn`, `bblCloudCodePhSms`, `bblCloudCodeSentSms`, `bblCloudErrEmpty`, `bblCloudErrEmail`, `bblCloudErrAccountCn` — 11 locales
- Pending cleanup, carried over from v2.23.1: `scaleNoActivity` and `scaleReader` are orphaned — still shipped in all 11 locales, no longer referenced anywhere in `renderer/`
