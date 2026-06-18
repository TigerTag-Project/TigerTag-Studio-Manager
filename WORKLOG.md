# Worklog — v1.10.8 (in progress)

## Added
- Anycubic: the cloud (Agora) camera now shows in the **cam wall**, not just the side panel — closing a LAN-vs-cloud gap. The wall already started the player (it connects via `acuConnect` without `skipCam`) and renders the shared banner; this adds the missing teardown — new `acuReleaseCloudCameras()` leaves the Agora channels when you exit the cam wall (LAN ffmpeg is local, but staying joined to Agora off-screen burns the account's RTC minutes + bandwidth). `renderer/printers/anycubic/index.js`, `renderer/inventory.js`.
- Anycubic: **cloud-mode camera (Agora WebRTC)**. Cloud printers have no local ports, so their camera isn't the LAN HTTP-FLV stream — it's an **Agora** ("shengwang"/声网) WebRTC stream. Reverse-engineered the slicer (CDP capture hooking `AgoraRTC.join` + the cloud order): camera-open is cloud REST order **1001** with a `shengwang_rtc_support:true` flag, whose response carries the Agora join creds (appId, channel = cloud device id, RTC token, our/printer uids, and AES-256-GCM2 stream-encryption key+salt). New `anycubic:cloud-camera-open` IPC (`main.js`) returns the normalized creds; the renderer runs the **Agora Web SDK** (vendored UMD in `renderer/lib/agora/`) to set encryption, join, subscribe to the printer's video track and render it into the side panel's camera banner — new `renderer/printers/anycubic/agora-cam.js` + cloud branch in `widget_camera.js` + cloud camera lifecycle in `index.js` (start on panel open, stop on close/disconnect), `anycubic.css` `.acu-cam-agora` styles, `preload.js` `cloud.cameraOpen` bridge. **Side panel only** for now (cam wall + detached window stay LAN-FLV; cloud there is a follow-up). The earlier "cloud camera is Tencent TRTC / out of scope" assessment was wrong — corrected in `PROTOCOL.md` §9b. **New dependency: Agora Web SDK** (`agora-rtc-sdk-ng`) — added as an npm dependency (not committed; a `postinstall` step `copy-agora-sdk.mjs` copies the UMD from node_modules into the gitignored `renderer/lib/agora/` for the no-bundler renderer's `<script>` load). It's a commercial SDK; we use it only as a guest client joining Anycubic's Agora project (creds from order 1001), so no Agora account/billing on our side.

## Changed
- Adding a printer now opens the freshly-added printer's side-card automatically. After "Add printer" writes the doc, the form closes and the new printer's side-panel opens once the Firestore listener has propagated it into `state.printers` (`_openPrinterWhenReady` polls up to 3 s). `renderer/inventory.js`
- Closing a printer's side-card now also closes its open Printer Settings panel (it edits that printer — no orphan form left floating). `renderer/inventory.js`

## Fixed
- 3-panel z-index fix: with the material card + Printer Settings + printer panel all open, the material card painted over the Settings panel's `»` close tab (both were z-index 101). Re-laddered the side-panel stacking — panels 101/103/105 (material < settings < printer), tabs 102/104/106 — so each close tab sits above the panel to its left and tucks behind the one to its right. `css/70-detail-misc.css`

## Removed

## i18n
