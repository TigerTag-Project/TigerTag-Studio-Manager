# Worklog — v2.61.0

## Added

- Printers board: **Show all cameras** / **Stop all cameras** keys in the bar (#272). Stop all puts every camera back on its play key except the machine open in the side panel, and holds the automatic start until the board is opened again; Show all plays every camera that can be shown. `renderer/inventory.js` (`_camStopAllBoard`, `_camAutoHeld`, `_camPlayAllBoard`, `_syncCamStopBtn`), `renderer/ext-cam/ext-cam.js`, `renderer/css/40-printers.css`. i18n: `boardCamStopAll`, `boardCamPlayAll`.
- Camera wall: the same two keys (cut: every card keeps its place on the eye-off placeholder, session-only). `renderer/inventory.js` (`_camWallCut`, `_camWallStopAll`, `_camWallPlayAll`, `#cwCamPlayAll`, `#cwCamStopAll`).
- Detached camera wall: while its window is open, the main window's wall shows a notice ("The camera wall is open in its own window") with a "Bring the wall back" key instead of a second copy of every feed; the main window receives no camera frames (`_camToSender` in `main.js`) and closes its own Creality sessions, so each feed is carried once. `main.js` (`cam:close-detached`, `cam:detached-closed`), `preload.js` (`closeCamWindow`, `onCamWindowClosed`), `renderer/inventory.js` (`_camDetached`), `FEATURES.md`. i18n: `camWallDetachedTitle`, `camWallDetachedSub`, `camWallReattach`.
- Requests (#331, Ptitlouis6012): each request shows the repository it went to (a tag in its line and in an open conversation's header); "All requests" and "My requests" get a search field, Status / Repository / Type filters and a reset key. i18n: `reportSearchPh`, `reportFltRepo`, `reportFltRepoAll`, `reportFltKind`, `reportFltKindAll`, `reportFltNoMatch`, `reportFltReset`. Files: `renderer/report/index.js`, `renderer/report/report.css`, `renderer/locales/*.json`.
- Requests (#333, Ptitlouis6012): TigerMasters and admins get a notification when the author of an open request writes in it (checked at sign-in and every 30 min while visible, only for those accounts); request notices now belong to one account and leave with it. Keys `tigertag.reportTeamSeen.<uid>`, `tigertag.reportTeamNotifs.<uid>`. i18n: `notifReqAuthor`. Files: `renderer/report/index.js`, `renderer/inventory.js`, `renderer/CODEMAP.md`, `renderer/locales/*.json`.

## Changed

## Fixed

- "Show all cameras" after "Stop all cameras" did not restart Bambu Lab feeds: the cards kept the last frame as if live. `bambuStopCam` now forgets the last frame, so the next start opens the stream again (`renderer/printers/bambulab/index.js`).
- Tiger Scale / Tiger Touch live screen: "Screenshot" opened its window BEHIND the live view (both overlays at the same level, the live one added to the page later). `showScreenshot` now moves its overlay to the end of the page before opening it, so it stands above whichever window asked. File: `renderer/IoT/tigertouch/panel.js`.

- Search bar: the filter's field list (and the bar's other lists) no longer shows above a side card opened over the bar (Report, etc.) — the bar's lists stand at z-index 100, under the side cards (101+), instead of the shared dropdown's 600. File: `renderer/css/70-detail-misc.css`.

- Printers: the Connect / Disconnect button of a printer's side panel no longer makes every camera on the board flicker. It rebuilt the whole board (`renderPrintersView`), so every other machine's live feed was torn down and restarted; it now patches the status dots only (`_patchGridStatus`, `_patchTableStatus` in the table, `_patchCamWall` on the camera wall), as a brand's own status change does. Files: `renderer/inventory.js`, `renderer/CODEMAP.md`.
- Printers board: the cameras no longer flicker while the app starts. The board was rebuilt about 25 times in the first 30 s (each brand's Firestore snapshot, every inventory render, Elegoo ticks, the last-seen seed), each time restarting every live feed. `renderPrintersView` now compares the board's shape (`_boardSig`: machines, names, models, widgets on, unit split, camera offered, job keys, selection, arrange, zoom, language, external cameras) with the one on screen and, when unchanged, only re-lays the positions out — the live values are already patched in place (`_patchGridStatus`, `_patchGridJobs`, `_patchSlotsWidgets`, `_camCatchUp`). Measured after the change: a few rebuilds in the first half-second while the brands' lists arrive, none afterwards; the FlashForge feed is handed back to the mux only on a real rebuild. Files: `renderer/inventory.js`, `renderer/CODEMAP.md`.

## Removed
