# Worklog — v1.8.2 (in progress)

## Added

- **Detached Camera Wall window** — standalone `BrowserWindow` showing all online printer cameras simultaneously; opened via "Detach" toolbar button in cam view; receives camera descriptors via IPC `cam:open-detached`; supports all camera types (Bambu MJPEG/IPC, Creality WebRTC, Snapmaker/FlashForge iframe) — `renderer/cam/cam.html`, `renderer/cam/cam.js`, `renderer/cam/cam.css`, `renderer/cam/cam-preload.js`, `main.js`, `preload.js` (`openCamWindow`), `renderer/css/40-printers.css` (`.cam-wall-toolbar`, `.cam-wall-detach-btn`)
- **Camera frame broadcast to detached window** — `cam_manager.js` uses `BroadcastChannel('cam-frames')` to forward MJPEG/Bambu frames to the detached window with zero-copy transfer — `renderer/printers/cam_manager.js`
- **Creality multi-surface WebRTC** — single `RTCPeerConnection` shared across cam wall card, sidecard, and detached window via `addCreCamConsumer` / `removeCreCamConsumer` API; prevents duplicate connections (firmware only accepts one peer) — `renderer/printers/creality/widget_camera.js`, `renderer/printers/creality/index.js`
- **TigerTag+ IPC handlers** — `rfid:refresh-api` (re-fetch product data for an existing chip) and `rfid:lookup-product` (validate product_id without a chip) exposed via main process and preload bridge — `main.js`, `preload.js`
- **Color edit swatch improvements** — swatches now show a pencil edit icon; light color detection (`_ceIsLight`) inverts icon and hover ring to black for legible contrast on light swatches; `openColorEditModal(r, onSave)` accepts optional callback for ADP mode (no Firestore write) — `renderer/IoT/td1s/edit-modals.js`, `renderer/IoT/td1s/td1s.css`
- **TigerPOD numbered feature badges** — replaced SVG icon spans with orange gradient numbered circles (①②③④) on the 4 feature cards — `renderer/inventory.html`, `renderer/css/60-modals.css`
- **TigerPOD CTA bar** — replaced static stats ("⚡12 Boosts · ❤21 Likes · Free") with dynamic "Please ⚡Boost & ❤Like" call-to-action — `renderer/inventory.html`, i18n `tigerPodCta`
- **TigerTag+ product preview enrichment** — after ID check, preview now shows Brand + Series + Name + Weight + Refill label (was: name only); brand sourced from `api.brand` directly (more reliable than local `id_brand` lookup at check time) — `renderer/inventory.js` (`_lookupPlusProduct`)
- **Tiger Scales text badge** — replaced `⚖` emoji with a styled "Tiger Scales" pill badge (gray / green connected / red no-scale states) — `renderer/inventory.html`, `renderer/IoT/tigerscale/tigerscale.css`
- **AutoScan → TigerPOD modal fallback** — clicking "+ Scan" button without a connected RFID reader now opens the TigerPOD modal instead of the removed Pod Scan panel — `renderer/inventory.js`
- **Image skeleton / shimmer animation** — all web-sourced `<img>` elements get a shimmer skeleton while loading; fade-in on completion. Covers TigerTag+ preview, add-from-web, check product image. Auto-applied via `MutationObserver` + capture-phase `load` listener — `renderer/inventory.js`, `renderer/css/00-base.css`
- **Bambu Lab: data preservation across reconnects** — `_prevData` saved before `bambuDisconnect` and restored to new connection object, preventing zeroed-out printer state on reconnect — `renderer/printers/bambulab/index.js`
- **Bambu Lab: null return from `_normState`** — when no state field present in MQTT payload, returns `null` instead of `"idle"`, preventing false idle overwrites mid-print — `renderer/printers/bambulab/index.js`
- **Printer sidecard: document mouseup fallback** — `_pendingPrinterOpen` intent captured on `mousedown`; `document` mouseup + `setTimeout(0)` fires `openPrinterDetail` if DOM rebuild ate the click event — `renderer/inventory.js`

## Changed

- **TigerPOD modal title** — "Build your TigerPOD" → "Print your TigerPOD Now!" — i18n `tigerPodModalTitle`
- **TigerPOD modal description** — "program TigerTag RFID chips" → "Burn TigerTag RFID chips" — i18n `tigerPodModalDesc`
- **TigerPOD modal button** — "Print on MakerWorld" → "Download & Print STL Free" — i18n `tigerPodPrintBtn`
- **TigerPOD hero layout** — title "Tiger POD Free STL" moved above the video; hero height 200 → 240px + `padding-top: 16px`; video height 120 → 156px; body padding enlarged — `renderer/inventory.html`, `renderer/css/60-modals.css`
- **TigerPOD: removed "TigerTag.io" label** — decorative sub-label under video removed — `renderer/inventory.html`
- **TigerPOD: renamed action link** — "Open Spool Pod" → "Tiger POD Free STL" — `renderer/inventory.html`
- **TigerPOD feature card text** — all 4 feature pairs updated:
  - "Dual RFID Reader" / "1 or 2 Reader ACR122U"
  - "Dual Link" / "2 TigerTag in same time"
  - "Print in Place" / "No support optimisation"
  - "1kg Standard spool" / "Boosted fit for 99% of Spools"
  — i18n `tigerPodFeat1-4Title` + `tigerPodFeat1-4Desc`
- **Bambu Lab: `onStatus` rebuild guard** — full `renderPrintersView()` call now only fires when printer crosses the online ↔ offline section boundary (not on every MQTT status event), eliminating the rapid DOM rebuild that was making the sidecard unclickable — `renderer/printers/bambulab/index.js`
- **Printer sidecard: always openable** — removed state guards that blocked `openPrinterDetail` when printer was in connecting/disconnected state — `renderer/inventory.js`
- **Version bump** — 1.8.1 → 1.8.2 — `package.json`, `llms.txt`
- **llms.txt updated** — i18n count 778 → 791 keys; TigerPOD triggers updated; RFID badge description updated; git tag example updated

## Fixed

- **Bambu Lab MQTT data wipe on `pushall`** — receiving `{"pushing":{"command":"pushall"}}` was resetting all printer data to zero. Root cause: two bugs — (1) reconnect created a fresh zeroed `conn.data`, (2) `_normState` returned `"idle"` for payloads with no state field. Both fixed — `renderer/printers/bambulab/index.js`
- **Printer sidecard unclickable** — grid/table sidecard cards couldn't be opened reliably during Bambu connecting phase. Fixed by reducing rebuild frequency + mouseup fallback — `renderer/inventory.js`, `renderer/printers/bambulab/index.js`

## Removed

- **Pod Scan panel** — entire feature deleted: `<aside id="scanPanel">` + `<div id="scanPanelOverlay">` markup, `_openScanPanel` / `_closeScanPanel` / `_updateScanPanel` functions (~80 lines), all event listeners (`scanPanelClose`, `scanPanelOverlay`, `btnOpenPodScan`), `panelOpen` guard in reader update handler, debug button `btnOpenPodScan`, all `.scan-dp` / `.sdnr-*` / `.scan-dp-*` CSS (~145 lines) — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/70-detail-misc.css`

## i18n

- Added: `tigerPodFeat1Title`, `tigerPodFeat1Desc`, `tigerPodFeat2Title`, `tigerPodFeat2Desc`, `tigerPodFeat3Title`, `tigerPodFeat3Desc`, `tigerPodFeat4Title`, `tigerPodFeat4Desc`, `tigerPodCta`, `tigerPodModalTitle`, `tigerPodModalDesc`, `tigerPodPrintBtn` — 9 locales (13 keys)
- Removed: `scanPanelTitle`, `scanPanelWaiting`, `scanPanelNoReader`, `scanPanelNoReaderSub` — 9 locales (4 keys)
- Net: +13 −4 = **791 keys** (was 778)
