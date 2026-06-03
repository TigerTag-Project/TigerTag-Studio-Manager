# Worklog — v1.8.15 (in progress)

## Added
- Firestore IndexedDB offline persistence on every Firebase app instance (default + per-account named apps). Snapshot listeners now replay from the local cache on cold start and only deltas hit the network — cuts cold-start reads from ~130 (100 spools + 10 racks + 5×printer brands + scales + friends) to near-zero on repeat boots and makes the UI usable while offline. Implemented via `enablePersistence({ synchronizeTabs: true })` right next to `firebase.initializeApp` so it runs before any other Firestore call — `renderer/firebase.js`.

## Changed
- Image cache no longer returns base64 `data:` URLs to the renderer. The main-process `img:get` IPC now returns a stable HTTP URL (`/img-cache/<md5>.<ext>`) served by the local dev server straight from the on-disk cache. With a stable HTTP URL, Chromium can keep the decoded bitmap alive across DOM operations — destroying and re-creating an `<img>` element no longer forces a re-decode, so view switches and full rebuilds no longer flash the product thumbnails. The HTTP response carries a 1-day Cache-Control header for good measure — `main.js`.

## Fixed

## Removed

## i18n
