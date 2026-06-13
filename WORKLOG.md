# Worklog — v1.8.27 (in progress)

## Added

## Changed
- Storage racks — a locked slot now has two distinct states with their own visual and behaviour — `renderer/inventory.js`, `renderer/css/30-racks.css`:
  - **Locked + empty (unusable)** — grey diagonal hatch, no icon; treated as dead space and **removed from the rack's usable capacity** — both the global and per-rack `filled / total` denominators drop (e.g. 130/198 → 130/197), and the EMPTY/available count follows (drag-in was already blocked).
  - **Locked + filled (pinned)** — keeps the spool colour, amber border + corner lock badge; material can't be moved or cleared (drag-out + Clear all were already protected). Slot count unchanged.

## i18n
- Added: `rackUnusableTip`, `rackPinnedTip` — 9 locales
- `rackLockedTip` no longer referenced in code (kept in locales)

## Fixed
- Bambu Lab camera micro-freezes — added a requestAnimationFrame frame-drop guard to the cam-frame handlers so bursts of JPEG frames collapse into one paint per animation frame instead of queuing up and stuttering when the renderer is busy. Applied to both the main window (`renderer/printers/bambulab/index.js`) and the detached cam window (`renderer/cam/cam.js`). (Quick win from the camera-latency bug report; the deeper Base64→ArrayBuffer/Blob-URL transport rework is still pending — needs real Bambu RTSP hardware to test.)

## Removed

## i18n
