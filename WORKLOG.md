# Worklog — v1.8.28 (in progress)

## Added

## Changed

## Fixed
- Bambu Lab camera latency — replaced the Base64 frame transport with raw binary + Blob URL (the bug report's "optimal" fix 4.2, full scope). Main process now sends the JPEG `Buffer` instead of `frame.toString('base64')` (no synchronous encode on the main thread, ~25% smaller IPC payload); renderers build a `URL.createObjectURL(Blob)` per painted frame instead of a `data:` URI (no Base64 re-decode), revoking the previous URL so only one object URL is alive per printer key (freed on reconnect + disconnect). Covers all consumers incl. the detached cam window (`cam/cam.js` + `cam/cam-preload.js`) the report missed. Files: `main.js`, `preload.js`, `renderer/cam/cam-preload.js`, `renderer/cam/cam.js`, `renderer/printers/bambulab/index.js`, `renderer/printers/bambulab/widget_camera.js`. Still needs real-hardware verification (X1C RTSP + A1 JPEG-TCP). The `createImageBitmap`+canvas off-main-thread decode is deliberately deferred to a follow-up to keep the regression surface small.

## Removed

## i18n
