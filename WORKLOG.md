# Worklog — v1.10.2 (in progress)

## Added

## Changed
- Bambu Lab RTSP camera (P2S/H2C/X1C…): smoother + lower-latency live view — ffmpeg now outputs 30 fps (was 5) and runs with low-latency input flags (`-fflags nobuffer -flags low_delay -probesize 32 -analyzeduration 0`), which also removes the ~5 s startup buffer. Renderer already coalesces to one paint per animation frame and revokes the previous Blob URL, so no backlog/leak at 30 fps — `main.js`

## Fixed
- Bambu Lab JPEG TCP camera (A1/A1 Mini/P1P/P1S, port 6000): no longer stays black/spinning after a transient issue — `main.js`:
  - **Auto-reconnect**: the socket now retries with exponential backoff (10 tries, 1.5 s→12 s), mirroring the RTSP path. A printer reboot / Wi-Fi drop / slow start previously left the camera black until the user reopened the sidecard. Intentional stops (cam-stop, or a newer cam-start for the same key) are flagged so they don't trigger a reconnect loop.
  - **Connect timeout**: `tls.connect` on port 6000 now has an explicit 10 s timeout — a firewalled/closed port used to hang on the OS TCP timeout (30–75 s) with an infinite spinner.
- Bambu Lab: honor `ipcam.rtsp_url === "disable"` (PROTOCOL.md §10) — when the LAN camera is turned off on the printer's screen, `_bblMerge` now sets `camDisabled`, stops any running stream and `bambuConnect` skips starting it (both JPEG TCP and RTSP). Previously the field was never read, so the app kept trying to open the camera — `renderer/printers/bambulab/index.js`
- Anycubic: editing a nozzle/bed temp inline no longer closes on every incoming report — `_acuNotify` now skips the live-block rebuild while a temp `<input>` is open (`.snap-temp--editing` guard), same pattern as Snapmaker — `printers/anycubic/index.js`
- Anycubic (cloud): job thumbnail no longer reloads/flickers on every poll — `printThumb` is only swapped when the image's object path changes (the S3 signature query string is ignored), so the rendered `background-image` stays identical between reports — `printers/anycubic/index.js`
- Printers Table view: the whole row now updates live instead of freezing until a manual refresh — `renderer/inventory.js`:
  - **Job cell**: `onGridJobsChange` runs `_patchTableJobs()`, a surgical refresh of each row's `.pt-td--job` cell (progress %, time, state). Job-cell HTML extracted into a shared `_jobCellHtml()` so table render + patch never drift.
  - **Status + Updated**: `onPrinterGridChange` runs `_patchTableStatus()`, refreshing the online dot, status label, `pt-row--online` class and the Updated cell in place — no full `renderPrintersView()` rebuild (sort + scroll preserved). The table is a flat sorted list with no CONNECTED/OFFLINE sections, so a status flip never needs a rebuild (the row re-sorts on the next render).
  - Both callbacks now route by view mode (`printer-table` → table patch, else grid patch). Previously only the grid patchers ran; they key off `[data-printer-key]` (grid cards only), so table rows (`data-brand`/`data-id`) were never touched. Affected Bambu/Creality/FlashForge/Snapmaker; Elegoo was already OK via its full-rebuild path.

## Removed

## i18n
