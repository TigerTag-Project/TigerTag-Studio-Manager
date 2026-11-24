# Worklog — v2.61.0

## Added

- **Label card prints straight to a label printer, without the print dialog (#314)**: a Printer list picks the Marklife P15 (Bluetooth, `renderer/labels/p15.js`), a Brother QL on the network (raster over TCP 9100, roll read from the printer or chosen, `services/label-printers.js`) or any installed printer (silent print). Each printer remembers its own label format; formats a printer cannot take are greyed out (the P15 takes labels up to 15 × 30 mm). `main.js` (`label:printers`, `label:bitmap`, `label:print-ql`, `label:ql-roll`, `label:ql-state`, Web Bluetooth device picker), `preload.js`, `renderer/labels/index.js`, `labels.css`, printer pictures in `assets/img/label_printers/`, `docs/LABEL-PRINTERS.md`.
- Requests (#331, Ptitlouis6012): each request shows the repository it went to (a tag in its line and in an open conversation's header); "All requests" and "My requests" get a search field, Status / Repository / Type filters and a reset key. i18n: `reportSearchPh`, `reportFltRepo`, `reportFltRepoAll`, `reportFltKind`, `reportFltKindAll`, `reportFltNoMatch`, `reportFltReset`. Files: `renderer/report/index.js`, `renderer/report/report.css`, `renderer/locales/*.json`.
- Requests (#333, Ptitlouis6012): TigerMasters and admins get a notification when the author of an open request writes in it (checked at sign-in and every 30 min while visible, only for those accounts); request notices now belong to one account and leave with it. Keys `tigertag.reportTeamSeen.<uid>`, `tigertag.reportTeamNotifs.<uid>`. i18n: `notifReqAuthor`. Files: `renderer/report/index.js`, `renderer/inventory.js`, `renderer/CODEMAP.md`, `renderer/locales/*.json`.

## Changed

## Fixed

- Tiger Scale / Tiger Touch live screen: "Screenshot" opened its window BEHIND the live view (both overlays at the same level, the live one added to the page later). `showScreenshot` now moves its overlay to the end of the page before opening it, so it stands above whichever window asked. File: `renderer/IoT/tigertouch/panel.js`.

- Search bar: the filter's field list (and the bar's other lists) no longer shows above a side card opened over the bar (Report, etc.) — the bar's lists stand at z-index 100, under the side cards (101+), instead of the shared dropdown's 600. File: `renderer/css/70-detail-misc.css`.

- Printers: the Connect / Disconnect button of a printer's side panel no longer makes every camera on the board flicker. It rebuilt the whole board (`renderPrintersView`), so every other machine's live feed was torn down and restarted; it now patches the status dots only (`_patchGridStatus`, `_patchTableStatus` in the table, `_patchCamWall` on the camera wall), as a brand's own status change does. Files: `renderer/inventory.js`, `renderer/CODEMAP.md`.
- Printers board: the cameras no longer flicker while the app starts. The board was rebuilt about 25 times in the first 30 s (each brand's Firestore snapshot, every inventory render, Elegoo ticks, the last-seen seed), each time restarting every live feed. `renderPrintersView` now compares the board's shape (`_boardSig`: machines, names, models, widgets on, unit split, camera offered, job keys, selection, arrange, zoom, language, external cameras) with the one on screen and, when unchanged, only re-lays the positions out — the live values are already patched in place (`_patchGridStatus`, `_patchGridJobs`, `_patchSlotsWidgets`, `_camCatchUp`). Measured after the change: a few rebuilds in the first half-second while the brands' lists arrive, none afterwards; the FlashForge feed is handed back to the mux only on a real rebuild. Files: `renderer/inventory.js`, `renderer/CODEMAP.md`.

## Removed

## i18n
- 20 keys for the label printers: `labelPrinter`, `labelPrinterDialog`, `labelPrinterP15`, `labelPrinterConnected`, `labelPrinterNetwork`, `labelPrinterInstalled`, `labelPrinterSearch`, `labelPrinting`, `labelPrinted`, `labelBtConnect`, `labelBtNotConnected`, `labelBtSearching`, `labelBtPick`, `labelBtNoName`, `labelQlRoll`, `labelQlRollAuto`, `labelQlRollContinuous`, `labelQlStateError`, `labelQlStateReady`, `labelQlAddress` (11 locales).
