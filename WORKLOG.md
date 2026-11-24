# Worklog — v2.61.0

## Added

- Label card on an A4 sheet (#263): a "Sheet" choice for Print and PDF (the label's own size, A4 with the labels from the top-left corner, or A4 on a centred grid) for printer drivers that know no page but A4; the preview shows the whole sheet with every label where it prints, "Copies" (with "Stock (n)": one per spool of that product in stock), spacing and margin (prefs `page`, `sheetGap`, `sheetMargin`), further sheets when one is full, − / + zoom of the preview; a printed or saved document is titled after its file name. Stock selection bar: a "Labels" button opens one label card for every selected spool (twin chips once), one label each, printed in one run or saved as one PDF; the open card follows the selection as spools are ticked or unticked (#269). `renderer/labels/index.js` (`sheetLayout`, `runOf`, `sheetsFor`, `openLabelBatch`, `syncLabelBatch`, `labelsOut`), `renderer/labels/labels.css`, `main.js` (`label:render` `page`, `sheets`, `labels`), `renderer/inventory.js` (`#bulkLabels`, `_labelSelectionRows`, `stockCount`, print_label `Copies`), `renderer/inventory.html`, `renderer/css/70-detail-misc.css`, `CLAUDE.md` (localStorage `tigertag.label`).
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
- Labels on A4 / in a batch: `labelPage`, `labelPageLabel`, `labelPageA4TopLeft`, `labelPageA4Centre`, `labelPageHint`, `labelCopies`, `labelCopiesStock`, `labelCopiesFit`, `labelCopiesSheets`, `labelSheetGap`, `labelSheetMargin`, `labelBatchCount`, `labelCopiesEach`, `bulkLabels` (11 locales).
