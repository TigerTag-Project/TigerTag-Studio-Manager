# Worklog — v1.10.6 (in progress)

## Added
- Anycubic: **cloud-mode camera (Agora WebRTC)**. Cloud printers have no local ports, so their camera isn't the LAN HTTP-FLV stream — it's an **Agora** ("shengwang"/声网) WebRTC stream. Reverse-engineered the slicer (CDP capture hooking `AgoraRTC.join` + the cloud order): camera-open is cloud REST order **1001** with a `shengwang_rtc_support:true` flag, whose response carries the Agora join creds (appId, channel = cloud device id, RTC token, our/printer uids, and AES-256-GCM2 stream-encryption key+salt). New `anycubic:cloud-camera-open` IPC (`main.js`) returns the normalized creds; the renderer runs the **Agora Web SDK** (vendored UMD in `renderer/lib/agora/`) to set encryption, join, subscribe to the printer's video track and render it into the side panel's camera banner — new `renderer/printers/anycubic/agora-cam.js` + cloud branch in `widget_camera.js` + cloud camera lifecycle in `index.js` (start on panel open, stop on close/disconnect), `anycubic.css` `.acu-cam-agora` styles, `preload.js` `cloud.cameraOpen` bridge. **Side panel only** for now (cam wall + detached window stay LAN-FLV; cloud there is a follow-up). The earlier "cloud camera is Tencent TRTC / out of scope" assessment was wrong — corrected in `PROTOCOL.md` §9b. **New dependency: Agora Web SDK** (`agora-rtc-sdk-ng`) — added as an npm dependency (not committed; a `postinstall` step `copy-agora-sdk.mjs` copies the UMD from node_modules into the gitignored `renderer/lib/agora/` for the no-bundler renderer's `<script>` load). It's a commercial SDK; we use it only as a guest client joining Anycubic's Agora project (creds from order 1001), so no Agora account/billing on our side.

## Changed
- Internal/tooling: added `CODEMAP-main.md` — a feature→line-range map for `main.js` (Electron main process: IPC handlers, printer transports, cameras), mirroring `renderer/CODEMAP.md`. `check-codemap.mjs` now validates both maps, and the pre-commit hook runs it when `main.js`/`CODEMAP-main.md` (or the inventory pair) is staged. No user-facing change.

## Fixed

## Removed

## i18n
