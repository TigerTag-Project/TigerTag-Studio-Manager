# `renderer/inventory.js` — code map

`inventory.js` is a ~25,000-line **ES module** holding the core renderer logic. Printer brand integrations, IoT devices (TigerScale, TD1S) and the RFID tester live in **separate modules** (see *Extracted modules* below) and are imported at the top of the file. This map links each feature to its line range and anchor functions so an AI assistant (or human) can jump directly to the right block instead of reading the file linearly.

**Anchor-first navigation**: line numbers drift as the file changes — anchor function names don't. Always `grep -n "anchorName"` and trust the grep result over the L-number written here. The L-ranges are for orientation (which block is where, what's nearby), not for blind `Read offset=N`.

Keep this map in sync: `npm run codemap:check` (also run by the pre-commit hook) verifies that the anchors of each section still fall inside the declared range and fails the commit on major drift.

---

## Bird's-eye structure

```
L1-257          ES-module imports — IoT modules, printer brand registry, RFID tester
L99-1146        Foundation — Firebase helpers, avatar pipeline, state, persistence,
               cold-start trace, rAF coalescer, i18n, helpers, diagnostics, lookups
L992-1276      Data layer (tsToMs, normalizeRow, health icon)
L1120-1523     Account dropdown + connected/disconnected sidebar states
L1367-3270     Add Product panel (ADP) — color/brand/material sheets, chip schema, save
L3114-3757     Settings + Friends open/close, TigerScale init, edit-account modal
L3601-4131     Login modal + localStorage accounts + sign-out + legacy migration
L3976-4628     Data migrations (decimal UID → hex, flat rack → nested)
L4472-5075     Firestore inventory subscription + auth orchestration + account list
L4919-5411     Stats, twin auto-link / manual pairing, sort + quick filters
L5255-6245     Inventory render — table/grid keyed-diff, view mode, search
L6086-6572     RFID encode/burn modal (cem)
L6416-6900     TigerTag+ catalogue refresh / convert / duplicate
L6724-8703     Spool detail panel (openDetail, buildPanelHTML, weight update)
L8502-8945     Resizable panels, debug panel, auto-update settings
L8789-9056     Hard delete + container auto-assign + legacy tombstone purge
L8900-9174     Firestore explorer + language save + debug mode
L9018-9471     Friends sidebar quick-list + friends list render
L9314-9969     Racks + printers Firestore subscriptions (+ live friends/notifs)
L9813-11058    Printers views — grid / table / cam wall + drag-drop
L10902-13331   Printer detail side panel (renderPrinterDetail) + inline edit
L13175-14419   Add-printer flow (brand picker, form, tutorials, submit)
L14420-15310   Racks CRUD + slots + locking + auto-fill + masonry + tooltip
L15311-16421   renderRackView + rack drag-drop + rack edit modal
L16422-16910   Friend view + add-friend modal
L16911-17638   Display-name setup + friend requests + blacklist
L17639-17876   Public/private keys + user profile sync
L17877-18178   Custom avatar upload + Discord-style cropper
L18179-18691   syncUserDoc + session telemetry + language sync
L18692-18707   Init bootstrap (loadLocales → loadLookups → runMigration → initAuth)
L18708-19027   Electron RFID integration (readers, dual-scan, NFC processor, chip write)
```

---

## Extracted modules (NOT in inventory.js)

| Module | What | Key exports |
|---|---|---|
| `printers/registry.js` + `context.js` | Brand registry — each brand module registers itself; import order = brand picker order. `context.js` shares `state`/`t`/`$` with brand modules | `brands`, `ctx` |
| `printers/snapmaker/index.js` | Moonraker WS :7125 — connect, status merge, live block, filament edit, file sheet, print control | `snapConnect`, `snapDisconnect`, `renderSnapmakerLiveInner`, `openSnapFilamentEdit`, `snapSendGcode` |
| `printers/flashforge/index.js` | HTTP polling :8898 — ping, connect, `/detail` parser, live block, filament edit | `ffgConnect`, `ffgPingPrinter`, `renderFlashforgeLiveInner`, `openFlashforgeFilamentEdit` |
| `printers/flashforge/cam_mux.js` | Single-fetch MJPEG multiplexer, blob URLs to all `<img>` consumers | `ffgMuxStart`, `ffgMuxRegister` |
| `printers/creality/index.js` | WS :9999 — heartbeat, CFS boxsInfo, live block, file list, LED/pause/stop | `creConnect`, `renderCrealityLiveInner`, `creActionPrintFile` |
| `printers/bambulab/index.js` | MQTTS :8883 — connect/parse via main-process IPC, AMS, live block | `bambuConnect`, `renderBambuLiveInner`, `openBambuFilamentEdit` |
| `printers/elegoo/index.js` | MQTT/WS — connect, live block, file sheet, timelapse | `elegooConnect`, `renderElegooLiveInner`, `openElegooFileSheet` |
| `printers/anycubic/index.js` | MQTTS :9883 (LAN) + cloud REST/MQTT — ACE box/slots, live block, filament edit. Detailed section below | `acuConnect`, `renderAnycubicLiveInner`, `openAcuFilamentEdit` |
| `printers/prusa/index.js` | PrusaLink HTTP (Digest, via main `prusa:http`) — 2 s status poll, job/thumbnail, MMU / XL-tool slots from job metadata, hold-to-confirm pause/resume/stop, debug request log. Camera (`widget_camera.js`): Buddy3D RTSP or PrusaLink snapshots, one feed per printer. Beta — see its `PROTOCOL.md` | `prusaConnect`, `renderPrusaLiveInner`, `prusaJobControl`, `prusaWireLive`, `renderPrusaCamBanner` |
| `printers/<brand>/widget_camera.js` | Per-brand camera banner (one per brand) — `inventory.js` only dispatches via `renderCamBanner(p)` | `renderSnapCamBanner`, `renderCreCamBanner`, `renderFfgCamBanner`, `renderBambuCamBanner`, `renderElegooCamBanner`, `renderAcuCamBanner` |
| `printers/<brand>/add-flow.js` | Per-brand Add-printer scan/manual flow (Scan choice modal, slide-in panel, manual IP probe) | `openSnapAddFlow`, `openFfgAddFlow`, `openCreAddFlow`, `openBblAddFlow`, `openElgAddFlow` |
| `printers/<brand>/probe.js` | Pure network/data discovery layer (no DOM) | per-brand probes |
| `printers/snapmaker/paxx.js` | Paxx U1 extended-firmware resolver — latest release (GitHub API, 24 h cache + ETag, fallback) + installed-version probe (`GET /firmware-config/api/status`, paxx-only) + build compare. Feeds the add/edit download CTA, the side-card status line, and the update notification | `paxxLatest`, `paxxEnsureLatest`, `paxxProbeInstalled`, `paxxBuildOf`, `paxxUpdateAvailable`, `paxxCleanVersion` |
| `printers/snapmaker/widget_control.js`, `elegoo/widget_control.js` | Control cards (fan, etc.) | `renderSnapControlCard`, `elgFanStep` |
| `printers/cam_manager.js`, `modal-helpers.js`, `extra-subnets.js` | Shared cam lifecycle, modal helpers, user-declared subnets widget | |
| `IoT/tigerscale/index.js` | TigerScale — Firestore subscription, panel render, health tick | `initTigerScale`, `subscribeScales`, `renderScalesPanel`, `renderScaleHealth` |
| `IoT/tigerspool/index.js` | TigerSpool — Firestore presence subscription, header glyph + hover | `initTigerSpool`, `subscribeTigerSpools`, `renderTigerSpoolHealth` |
| `IoT/tigerspool/panel.js` | TigerSpool — side card (boxes + their printers) and the discovery modal | `openTigerSpool`, `renderTigerSpoolPanel`, `openTigerSpoolDiscover` |
| `IoT/td1s/index.js` + `edit-modals.js` | TD1S sensor engine (serial events, panel, modals) + TD/Color edit modals | `initTD1S`, `openTd1sConnectModal`, `openTdEditModal`, `openColorEditModal` |
| `rfid_protocol/tigertag/index.js` | RFID TigerTag tester modal | `initRfidTester` |

Raw socket probes run in the **main process** over IPC (`ffg:tcp-probe`, `cre:tcp-probe`, `net:get-local-subnets`, `snap:http-get`, `mdns:browse-snapmaker`) — the renderer can open WebSockets but not raw TCP/UDP.

### Anycubic integration (`printers/anycubic/`) — LAN + cloud (PR #1, @ennisj)

| File | What |
|------|------|
| `PROTOCOL.md` | Agent skill — MQTTS port 9883 (TLS 1.2 forced), `multiColorBox` getInfo/setInfo, slicer-config credential decode, port map, report-shape pitfalls. **Read it before touching this folder.** |
| `index.js` | MQTT connect/disconnect/parse via `window.anycubic` IPC. Exports: `acuKey`, `acuGetConn`, `acuIsOnline`, `acuConnect` (`{skipCam}`), `acuDisconnect`, `renderAcuOnlineBadge`, `renderAnycubicLiveInner`, `renderAnycubicLogInner`, `openAcuFilamentEdit`, `closeAcuFilamentEdit`. `_acuMerge` routes the report families (`print`/`tempature`/`fan`/`status`/`multiColorBox`/`info` — PROTOCOL.md §5b) into `conn.data`; the `info` report carries the camera stream URL (`data.urls.rtspUrl` → `conn.data.camUrl`). Filament-edit bottom sheet DOM is created lazily here (inventory.html untouched). |
| `cards.js` | `renderAcuJobCard` (filename/%/remaining/layers/state), `renderAcuTempCard` (nozzle+bed), `renderAcuFilamentCard` — ACE units + external spool (box -1), slots 0-3, `data-acu-fil-edit` squares. |
| `probe.js` | `acuReadSlicerCreds` (slicer-config import — the ONLY credential source), `acuProbeIp` / `acuScanLan` (TCP :18910 + `GET /info`), `acuCatalogIdFromModel`. |
| `add-flow.js` | 3-way choice: **Import from Anycubic Slicer** (primary) / Scan / Manual IP. Scan & manual candidates are merged with slicer credentials by IP (DHCP repair included). |
| `settings.js` | Brand meta + schema — fields `ip`, `acuModelId` (numeric topic id, ≠ `printerModelId` catalog id), `deviceId`, `username`, `password`. |
| `widget_camera.js` | `renderAcuCamBanner` — when `camLive`, `<img data-acu-key>` fed by 'anycubic:cam-frame' IPC (ffmpeg remuxes the :18088 HTTP-FLV stream to ~5 fps JPEG in main.js, Bambu-RTSP pattern); when idle, returns "" so the hero photo shows (cam-wall safe). The FLV stream is **on-demand** and the driver **actively controls it**: `_acuRequestCamera`/`_acuStartCapture` publish `video/startCapture`, ffmpeg attaches on the printer's `video/report` `initSuccess` (bounded `flvProbe` covers the race), `acuReleaseCamera` sends `stopCapture` on panel close. Stream URL = `conn.data.camUrl` (from the `info/report` `rtspUrl`): `/flv` on a Kobra 3 V2, `/live/<token>` on a Kobra X — both fed to `flvProbe`/`cam-start`; the probe accepts 200 + 206. Cam wall + detached window (`acu_ipc` type in `renderer/cam/cam.js`) reuse the same frames. CSS in `printers/anycubic/anycubic.css`. |
| `agora-cam.js` | **Cloud-mode camera** (Agora WebRTC, PROTOCOL.md §9b). `acuAgoraStart/Stop(key, creds)`: Agora Web SDK (npm dep `agora-rtc-sdk-ng`, global `AgoraRTC`) `setEncryptionConfig("aes-256-gcm2", key, salt)` → `join(appId, channel, rtcToken, clientUid)` → subscribe to the printer's video `uid` → `track.play()` into the `.acu-cam-agora` banner container. Creds from cloud order 1001 (`anycubic:cloud-camera-open`). Self-heal interval re-attaches the track across re-renders. Side panel + cam wall; `acuReleaseCloudCameras()` leaves the channel on cam-wall exit. Detached window: the cloud reuses the Agora uid, so a 2nd client would kick this one — instead this single client captures its video to JPEG and relays frames over `BroadcastChannel('acu-cam')` (`_relayTick`); the detached window's `acu_bc` cam type renders them. `acuAgoraOnRelayWant/End` keep the player alive while detached. |

Wiring (mirrors Bambu): always-on MQTT in `subscribePrinters` (skipCam), auto-connect in the grid/table (skipCam) and cam views, `_getPrinterJob` job normalization, `openPrinterDetail`/`closePrinterDetail`, `#acuLive` + debug-only `#acuLog` blocks in `renderPrinterDetail`, `data-acu-fil-edit` + `#acuLogPauseBtn`/`#acuLogClearBtn` in the delegated click handler, `openAcuAddFlow` in the brand picker, `acu_ipc` entry in `_serializeCamerasForDetach`. Main-process IPC: `anycubic:connect/disconnect/publish(endpoint)` (+ `status`/`message` events), `anycubic:cam-start/stop` (+ `cam-frame`), `anycubic:read-slicer-config`, `anycubic:tcp-probe`, `anycubic:http-info`.

**Cloud mode** (`mode:"cloud"` docs — PROTOCOL.md §9): cloud-mode printers are reached through Anycubic's cloud. The driver (`index.js`) branches on `printer.mode === "cloud"`: connect = shared cloud-MQTT subscribe + REST `getInfo`; refresh/getInfo/setInfo via REST `sendOrder` (1206/1211); reports reuse `_acuMerge`; **camera = Agora WebRTC** (cloud order 1001 → `agora-cam.js`, PROTOCOL.md §9b — side panel + cam wall). Token is grabbed **attach-only** over CDP from a user-run bridge-mode slicer (never launched by us). Provisioning UI: `add-flow.js` "Add a cloud printer" panel → `ctx.addAnycubicCloudPrinter` (writes `cloud_<id>` doc with token+email denormalised). Connect guards in `inventory.js` are `(p.ip || p.mode === "cloud")`; a cloud-edit guard in `submitPrinterAdd` prevents the LAN form from wiping cloud fields. Certs: `services/anycubicCloudCerts.js`. Main IPC: `anycubic:cloud-cdp-token`, `:cloud-get-printers`, `:cloud-verify`, `:cloud-send-order`, `:cloud-camera-open`, `:cloud-connect/subscribe/unsubscribe` (+ `:cloud-message`/`:cloud-status`). Dev validator: `scripts/acu-cloud-test.mjs`.

---

## Foundation (L124-1592)

| L | What | Anchors |
|---|---|---|
| 92 | `API_BASE` constant | |
| 101-141 | **Firebase helpers** — per-account named app instances (`firebase.app(uid)`), each with its own auth session | `fbAuth(id)`, `fbDb(id)` |
| 142-404 | **Avatar pipeline** (single source of truth) — gradients, parts builder, paint, photo overlay | `hexToGradientPair`, `getAccGradient`, `paintAvatar`, `avatarMarkup`, `applyAvatarStyle` |
| 407-446 | **Local-first persistence layer** — cache-first paint | |
| 447-492 | **Cold-start trace** + first-paint signal + **rAF render coalescer** | `signalFirstPaint`, `scheduleRender` |
| 508-568 | **`state` object declaration** — single source of truth (inventory, rows, selected, lang, racks, friends, isAdmin, db, imgCache, …) | `const state = {` |
| 571-608 | **`t(key, params)`** — i18n lookup with fallback, `{{param}}`, `["array"]` random pick, `{one,other}` plurals; `applyTranslations()` | `function t`, `applyTranslations` |
| 609-700 | **General helpers** — `v()`, `toHex()`, `timeAgo()`, `fmtTs()`, `fmtChipTs()`, `setLoading()`, `setupHoldToConfirm()` | `timeAgo`, `setupHoldToConfirm` |
| 701-719 | `toast()` — top banner with kind (info/error/success) + auto-dismiss | `toast` |
| 720-849 | **Error reporting / diagnostic system** — `reportError()`, app version line, diag badge, report builder, modal; `esc`/`highlight`/`debug` | `reportError`, `buildDiagnosticReport`, `openDiagnosticModal` |
| 850-859 | `apiFetch()` — fetch wrapper feeding the debug panel | `apiFetch` |
| 860-981 | **Lookups** — locales, TigerTag DB (brand/material/aspect/type/diameter/version/containers), printer model catalog helpers | `loadLocales`, `loadLookups`, `findPrinterModel`, `dbFind`, `brandName`, `materialLabel` |

---

## Data layer (L1604-1760)

| L | What | Anchors |
|---|---|---|
| 984-992 | `tsToMs()` — Firestore Timestamp → ms (accepts `number`, `Timestamp`, `{_seconds}`) | `tsToMs` |
| 993-1081 | **`normalizeRow(spoolId, data)`** — Firestore doc → flat row used by every view | `normalizeRow` |
| 1082-1111 | Health icon driven by Firestore `metadata.fromCache` | `setHealthLive`, `setHealthOffline`, `setHealthIdle` |

---

## Account dropdown + sidebar states (L1792-1995)

| L | What | Anchors |
|---|---|---|
| 1112-1208 | Connected vs no-account UI states | `setConnected`, `setDisconnected` |
| 1209-1317 | **Account dropdown** (avatar click) — connected accounts, manage profiles, friends section, add friend | `openAccountDropdown`, `renderAccountDropdown` |
| 1318-1358 | Profiles modal | `openProfilesModal` |

---

## Add Product panel — ADP (L2054-3344)

Manual spool creation: full chip-schema editor with bottom-sheets. All helpers prefixed `_adp`.

| L | What | Anchors |
|---|---|---|
| 1359-1454 | Field helpers — cloud id, grams conversion, color presets render | `_adpCloudId`, `_adpToGrams`, `_adpRenderColorPresets` |
| 1455-1648 | **Color sheet + custom colour picker** (HSV math, drag) | `openAdpColorSheet`, `openAdpColorCustomSheet`, `_adpCcRender` |
| 1649-1758 | **Brand bottom-sheet** with favourites | `openAdpBrandSheet`, `_adpRenderBrandList`, `_adpToggleFavBrand` |
| 1759-1857 | **Material bottom-sheet** (mirror of Brand) | `openAdpMaterialSheet`, `_adpRenderMaterialList` |
| 1858-2204 | Multi-colour state, 28-byte colour-name limit, material defaults, RFID preview | `_adpSetColorMode`, `_adpApplyMaterialDefaults`, `_adpRefreshRfidPreview` |
| 2205-2390 | **Panel open/close** | `openAddProductPanel`, `closeAddProductPanel` |
| 2391-2589 | **`saveAddProduct()`** — canonical chip schema (identity, RGBA colours, firmware slots, measure, TD, timestamps) → Firestore write | `saveAddProduct` |
| 2590-3082 | Sheet/search DOM wiring (click delegation, integer-only fields, Escape cascade) | `_adpCloseAllSheetsAndPanel` |

---

## Settings / Friends / Account modals (L3841-4895)

| L | What | Anchors |
|---|---|---|
| 3083-3110 | Settings panel open/close | `openSettings`, `closeSettings` |
| 3111-3124 | Friends panel open/close (auto-generates publicKey first) | `openFriends`, `closeFriends` |
| 3125-3166 | **TigerScale module init** — wires panel, health tick, card delegation into `IoT/tigerscale` | `initTigerScale(` |
| 3167-3274 | API key 6 + eye-toggle / copy-button factories | `getOrCreateApiKey6`, `makeEyeToggle`, `makeCopyBtn` |
| 3275-3393 | **Edit account modal** + account colour save | `openEditAccountModal`, `saveColorToFirestore` |
| 3394-3539 | **Custom avatar menu** (Discord-style edit flow entry) + display-name save | `_toggleAvatarMenu`, `saveDisplayName` |

---

## Login + accounts persistence (L4769-5246)

| L | What | Anchors |
|---|---|---|
| 3540-3759 | **Login modal** (Firebase) — Google sign-in, email/password sign-in + create flow, forgot password | `lmSetMode`, `openAddAccountModal` |
| 3760-3785 | LocalStorage accounts helpers; inventory cache save; legacy API-key account wipe | `getAccounts`, `activeAccount`, `runMigration` |
| 3786-3854 | Per-account `firebase.app(uid).auth().signOut()` | `fbSignOut` |

---

## Data migrations (L5116-5820)

| L | What | Anchors |
|---|---|---|
| 3855-3879 | Decimal spoolId detection + hex conversion | `isDecimalSpoolId`, `decimalSpoolIdToHex` |
| 3880-4053 | **Rack-shape migration** — flat fields → nested `rack` object (consent modal + lock-screen sweep) | `maybeMigrateFlatRackToNested`, `drainRackMigrationQueue` |
| 4054-4345 | **UID format migration** — decimal big-endian → hex uppercase (consent modal, progress, queue) | `maybeMigrateDecimalSpoolIds`, `drainUidMigrationQueue`, `migrateOneSpoolDecimalToHex` |

---

## Inventory subscription + auth + account list (L5692-6369)
| L | What | Anchors |
|---|---|---|
| 4346-4454 | **Firestore inventory subscription** — `onSnapshot` with friend-view defense-in-depth | `subscribeInventory`, `unsubscribeInventory` |
| 4455-4598 | **Auth orchestration** — signed-in fast path (cache paint → subs → user doc), named auth setup | `handleSignedIn`, `setupNamedAuth`, `initAuth` |
| 4599-4747 | Account list render + switch + delete | `renderAccountList`, `switchAccountUI`, `deleteAccountUI` |

---

## Stats / twins / filters (L6370-6881)
| L | What | Anchors |
|---|---|---|
| 4748-4793 | Key status, row sort, load action, **stats** | `renderStats`, `loadInventory` |
| 4794-4956 | **Twin auto-link by timestamp** (2 s window) + manual pairing repair | `autoLinkTwinsByTimestamp`, `findTwinCandidates`, `linkTwinPair`, `unlinkTwinPair` |
| 4957-5053 | Sort + search/filter pipeline + quick-filter dropdowns | `sortRows`, `filteredRows`, `populateQuickFilters` |

---

## Inventory render (L6927-11867)
| L | What | Anchors |
|---|---|---|
| 5054-5268 | **`renderInventory()`** — welcome card, rack-view priority, table/grid dispatch | `renderInventory` |
| 5269-5464 | Filter application + colour/thumbnail helpers + image pre-cache | `applyInventoryFilter`, `colorBg`, `thumbHTML`, `preCacheImages` |
| 5576-5636 | **Identical-spool grouping (view-only)** — group key + render-item builder, expanded-keys set. Table only in Phase 1 (Grid = Phase 2) | `_spoolGroupKey`, `groupRows` |
| 5636-5967 | **Keyed-diff render** — row signature, create/update grid card + table row + group header row (no full rebuild) | `_rowSignature`, `_createGridCard`, `_updateGridCard`, `renderGrid`, `_groupHeaderInnerHTML`, `_toggleGroupExpanded`, `renderTable` |
| 5967-6188 | View mode toggle (persisted), group toggle, search clear, filter change, stat-tile quick filter, sort indicators | `setViewMode`, `updateSortIndicators` |
| ~6924-7045 | **Lists / wishlists — Firestore subscriptions + CRUD** — personal lists (`subscribeLists`) and friend lists (read-only, `subscribeFriendLists`); in-memory array + create/add/remove | `subscribeLists`, `unsubscribeLists`, `subscribeFriendLists`, `unsubscribeFriendLists`, `_listsArray`, `_createList`, `_addToList`, `_removeFromList` |

---

## RFID encode / burn modal — cem (L11610-12367)
| L | What | Anchors |
|---|---|---|
| 5880-5970 | **`_burnRfid(r)`** — writes a chip from a row | `_burnRfid` |
| 5971-6115 | Encode modal lifecycle — targets present, blank check, render, presence change | `openEncodeModal`, `_cemBlankCheck`, `_cemRender` |
| 6116-6207 | Burn start + post-burn cloud migration | `_cemStartBurn`, `_cemMigrate` |

---

## TigerTag+ catalogue (L11952-15013)
| L | What | Anchors |
|---|---|---|
| 11009-11102 | Refresh API data for a spool | `_refreshApiData` |
| 11103-11130 | **Catalogue payload → doc fields** — the ONE `product/get` mapping, shared by the conversion and the TigerData+ creation | `_productApiFields` |
| 11131-11177 | TigerTag+ product lookup (validate an id, preview) | `_lookupPlusProduct` |
| 11178-11207 | **Convert TigerTag → TigerTag+** (sets `id_tigertag` to the TigerTag+ id) | `_convertToPlus` |
| 11208-11301 | **Catalogue browser** — import-all-once cache (localStorage) + sync | `_catalogLoadCache`, `_catalogBuildIndex`, `_catalogSync` |
| 11302-11396 | In-memory search engine + incremental (chunked) row render | `_catalogSearch`, `_catalogRenderChunk`, `_catalogRowHTML` |
| 11397-11454 | Catalogue **names → reference-DB ids** (best-effort) + colour parsing | `_catByName`, `_catMaterialId`, `_catHexToRgba`, `_catChiplessNonce` |
| 11455-11576 | **Create a TigerData+** from a product — canonical chip schema, `id_product` set, chipless nonce kept | `_catalogCreate` |
| 11577-11613 | Catalogue modal open/close | `openCatalogModal`, `closeCatalogModal` |
| 11756-11790 | **Search views** — the catalogue as a grid/table view segment (`catalogGrid` / `catalogTable`); own hits + selection, driven by the MAIN search bar | `renderCatalogView`, `_catViewHeadHTML` |
| 11791-11872 | Filters at parity with the public catalogue page — Type · Brand · Material · Series (brand-scoped) · Sort, options carrying counts | `CAT_SORTS`, `_catViewFillFacets`, `_catViewSearch` |
| ~13510-13600 | **Catalogue multi-select** — `state.selectedCatalog` + the shared bulk bar (catalogue context in _bulkCtx: ★ / 🛒 / Add to a list, no delete); ids resolved to product rows through the product-card detail cache, 6 at a time, capped at `CAT_BULK_MAX` | `_catBulkClick`, `_catResolveRow`, `_catResolveRows`, `_catSelectedRows` |
| 11803-11880 | Search-view card / row markup + chunked append (IntersectionObserver) | `_catViewCardHTML`, `_catViewRowHTML`, `_catViewRenderChunk` |
| 11881-11926 | Search-view selection + action bar (select ≠ create) | `_catViewSelect`, `_catViewSyncBar` |
| 11614-11769 | Duplicate spool as cloud doc | `duplicateSpoolAsCloud` |
| ~9673-9853 | **Lists / wishlists — UI** — products view (favourites/order tab) + "Add to list" popover menu (one product or a bulk selection, written in one arrayUnion by _addManyToList) | `renderProductsView`, `renderListsView`, `_openAddToListMenu` |
| ~10198 | Message inline edit | `startMessageInlineEdit` |

---

## Spool detail panel (L6133-27330)
| L | What | Anchors |
|---|---|---|
| 6516-6669 | Structural signature (patch vs rebuild), weight patch, saved check | `_detailStructuralSig`, `_patchDetailWeight` |
| 6670-7283 | **`openDetail(spoolId)`** / close / refresh + usage telemetry | `openDetail`, `closeDetail`, `refreshOpenDetail`, `_recordUsage` |
| 7334-7396 | **Twin-link picker modal** | `openTwinLinkPicker` |
| 7397-7408 | TigerPOD modal | `openTigerPodModal` |
| 7409-7464 | **Container picker modal** (46 containers from `data/container_spool/spools_filament.json`) | `openContainerPicker`, `doContainerUpdate` |
| ~19090-19160 | **Video player — the ONE builder** for the spool detail + product card: `parseVideoUrl` (file / YouTube / Google Drive / external), `_productVideosHTML` (chip video + playable attachments, deduped) → `_videoSectionHTML` (inline `<video>`, or poster → in-place iframe on click) | `parseVideoUrl`, `_isPlayableVideo`, `_productVideosHTML`, `_videoSectionHTML` |
| ~8130 | **Tags / Balises** — free-form labels, entity-agnostic Shopify-style editor (chips + inline dropdown + "Add tags" modal) driven by a `ctx` (`getTags`/`writeTags`/`allTags`/`readOnly`/`ids`). Two providers: `_spoolTagCtx` (spools, twin-mirrored write) and `_printerTagCtx` (printers, savePrinterField). Spool editor in buildPanelHTML+openDetail; printer editor in renderPrinterDetail (`#ppTag*`, tags-only echo patches chips in place via a structural-signature guard) | `_normalizeTag`, `_allTags`, `_allPrinterTags`, `_writeSpoolTags`, `_writePrinterTags`, `_ctxAddTag`, `_ctxRemoveTag`, `_wireTagEditor`, `openTagsModal` |
| 7506-8196 | **`buildPanelHTML(r)`** — header, colours, print settings, weight slider w/ debounce, storage row, tags, links, container, toolbox, raw JSON | `buildPanelHTML` |
| 8197-8255 | **Weight update** (direct / raw-scale modes, twin propagation) | `doWeightUpdate` |

---

## Panels / debug / auto-update (L19964-22028)
| L | What | Anchors |
|---|---|---|
| 8256-8329 | Resizable panels (detail + debug) — drag handle, persisted width | `makePanelResizable`, `openDebug` |
| 8330-8406 | Product ID help modal | |
| 8407-8493 | Settings → About → auto-update toggle + "Check for updates now" | `readAutoUpdatePref`, `showUpdateStatus` |
| 8494-8649 | **Hard delete** (`batch.delete` doc + twin), container auto-assign on snapshot, legacy tombstone purge | `markSpoolDeleted`, `resolveContainerForBrand`, `autoAssignMissingContainers`, `purgeLegacyTombstones` |
| 8650-8730 | **Firebase Explorer** — dedicated side card (`#fseExplorerPanel`, opened by `openFsExplorer`, mutually exclusive with the API-only debug panel). Breadcrumb nav + clickable doc-id drill-down + collection/doc render | `fseInit`, `fseFetch`, `fseNavigate`, `fseRenderCrumbs`, `openFsExplorer` |
| 8731-8767 | Account language save + debug mode apply | `saveAccountLang`, `applyDebugMode` |

---

## Friends rendering (L21553-22631)
| L | What | Anchors |
|---|---|---|
| 8768-8852 | Sidebar friends quick-list + hover tooltip | `renderSidebarFriends`, `showSbFriendTip` |
| 8853-8969 | Friends list render + avatar colour helpers | `renderFriendsList`, `friendColor`, `readableTextOn` |
| 8970-9063 | Friends list load (profile fetch) + cache hydration | `loadFriendsList`, `_hydrateFriendsCache` |

---

## Racks + printers subscriptions (L22335-22980)
| L | What | Anchors |
|---|---|---|
| 9064-9106 | Racks subscription | `subscribeRacks`, `unsubscribeRacks` |
| 9107-9270 | **3D printers subscription** — per-brand subcollections (`users/{uid}/printers/{brand}/devices`) | `subscribePrinters`, `unsubscribePrinters` |

*(Scales subscription moved to `IoT/tigerscale/index.js`.)*

---

## Printers views (L22626-26730)
| L | What | Anchors |
|---|---|---|
| 9271-9441 | **Job status helpers** + surgical grid patches (job card, online badge, grid signature) | `_getPrinterJob`, `_patchGridJobs`, `_jobCardHtml`, `_isPrinterOnline`, `_patchGridStatus` |
| 9442-9611 | **Grid view** — auto-connect all brands, online/offline partition, cards | `renderPrintersView` |
| 9612-9734 | **Table view** — sortable columns, row click → sidecard | `_renderPrinterTable` |
| 9735-9997 | **Cam wall view** — patch mode, card sizes, detached cam window serializer | `_renderPrinterCam`, `_patchCamWall`, `_serializeCamerasForDetach` |
| 9998-10195 | Printer + cam-wall drag-drop reordering (writes `sortIndex`) | `wirePrinterDnd`, `wireCamWallDnd`, `persistPrinterSortIndices` |
| 23383-23508 | **The board's objects** — one `data-board-id` addresses a machine (`brand:id`), one of its units (`unit:…`) or its units as one widget (`units:…`); position/z read + saved through the same three functions | `_boardObj`, `boardPos`, `boardZ`, `boardSave`, `saveUnitPlanPos`, `savePrinterPlanPos` |
| 23509-23598 | **Clusters** — several board objects bound together for good. The id lives on the members beside the coordinates it binds (`planCluster` / `unitsPlanCluster` / `units.{id}.planPrintersCluster`), so no new collection, no rules block, and deleting a machine takes its membership with it | `_newClusterId`, `_printerBoardIds`, `clusterOf`, `clusterMembers`, `saveBoardCluster` |
| 23647-23809 | **Plan layout** — places every object at its own coordinates, adopts orphans, compacts z to 1..N, sizes the board, then draws one outline per cluster | `layoutPrintersPlan`, `seedPrinterPlan`, `_drawClusterHulls` |
| 23839-24101 | **Selection + drag** — a `Set` of board ids; selecting any member of a cluster expands to the whole of it in `_syncPlanSelection`, so the drag carries clusters without knowing they exist | `_syncPlanSelection`, `_expandPlanSelToClusters`, `_clearPlanSelection`, `wirePrinterMarquee`, `wirePrinterPlanDrag` |
| 24101-24211 | **The board's right-click menu** — group / ungroup the selection; the kebab menu's own component, dropped from the cursor | `openPlanContextMenu`, `closePlanContextMenu`, `wirePlanClusterMenu` |

---

## Printer detail side panel (L24891-29555)
| L | What | Anchors |
|---|---|---|
| 10196-10758 | Open/close lifecycle (connect/disconnect per brand), conn button, refresh | `openPrinterDetail`, `closePrinterDetail`, `refreshOpenPrinterDetail` |
| 10759-10769 | **`renderCamBanner(p)`** — dispatch to per-brand `widget_camera.js` (never builds camera HTML inline) | `renderCamBanner` |
| 10770-11859 | **`renderPrinterDetail()`** — hero + camera banner + status + per-brand live block + control cards + log | `renderPrinterDetail` |
| 11860-11971 | Inline edit for printer name / IP / port (pencil, Enter/Escape) + field persist | `startInlineEdit`, `savePrinterField` |

---

## Add-printer flow (L27355-30039)
Per-brand scan/manual flows live in `printers/<brand>/add-flow.js`; `inventory.js` owns the shell.

| L | What | Anchors |
|---|---|---|
| 11972-12070 | **Brand picker modal** — dispatches to per-brand add-flow | `openPrinterBrandPicker` |
| 12071-12152 | Add/edit printer form | `openPrinterAddForm`, `closePrinterAddForm` |
| 12153-12404 | Tutorial image bottom-sheet + **multi-step connection tutorial** | `openTutoSheet`, `openPrinterTutorial`, `_ptRenderStep` |
| 12405-12534 | **`submitPrinterAdd()`** — ADD (auto-id) vs EDIT (preserve id/isActive/sortIndex) | `submitPrinterAdd` |

---

## Racks CRUD + slots (L28174-32685)
| L | What | Anchors |
|---|---|---|
| 12535-12700 | Rack create / update / delete / empty + orphan ref cleanup | `createRack`, `updateRack`, `deleteRack`, `emptyRack` |
| 12701-12837 | Empty-rack cascade, twin resolver, slot assign/unassign, slot fill HTML | `playEmptyRackCascade`, `assignSpoolToSlot`, `unassignSpool`, `findSpoolInSlot` |
| 12838-12918 | **Slot locking** — right-click toggle, lock/unlock all, kebab menu positioning | `isSlotLocked`, `toggleSlotLock`, `positionRackMenu` |
| 12919-13136 | **Auto-fill / auto-store / auto-unstore** + search dim + unranked helpers | `autoFillEmptySlots`, `maybeAutoStoreUnrankedSpools`, `applyRackSearchDim`, `getUnrackedSpools` |
| 13178-13307 | **Skyline-packing masonry** layout + relayout scheduler + rack reorder | `layoutRacksMasonry`, `reorderRacks` |
| 13308-13419 | **Rich hover tooltip** for filled slots (mini puck preview) | `buildRackTooltipHTML`, `wireRackTooltipDelegation` |

---

## Storage view render + DnD (L30522-34464)
| L | What | Anchors |
|---|---|---|
| 13420-14065 | **`renderRackView()`** — biggest function in the file: stats bar + filter chips, two-column layout, masonry, kebab menus, live search, read-only friend mode, rack reorder DnD | `renderRackView` |
| 14066-14283 | Drag sources (slot puck / unranked row) + drop targets + **drop-to-void unassign** | `wireDragSources`, `wireDropTargets`, `clearOtherDropHighlights` |
| 14284-14305 | Unrank cascade animation | `playUnrankAnimation` |
| 14306-14509 | **Rack create/edit modal** — name, presets, rows×columns, delete confirm, field errors | `openRackEditModal`, `renderRackPresets`, `confirmDeleteRack` |

---

## Friend view (L32231-35192)
| L | What | Anchors |
|---|---|---|
| 14510-14591 | Friend inventory open/close (one-shot read, no live updates) | `openFriendInventory`, `closeFriendInventory` |
| 14592-14785 | **Friend banner** + switch to friend view (tears down ALL owner subscriptions first) / switch back | `renderFriendBanner`, `switchToFriendView`, `switchBackToOwnView`, `prewarmAuthToken` |
| 14786-14840 | Friends section in dropdown + incoming request modal queue | `renderFriendsSection`, `showFriendRequestModal` |
| 14841-14978 | **Add-friend modal** — split XXX-XXX field, live preview lookup | `openAddFriendModal`, `_adfChanged` |

---

## Display name + friend requests (L33013-36484)
| L | What | Anchors |
|---|---|---|
| 14979-15022 | **Display-name setup modal** (first-login pseudo picker) | `openDisplayNameSetup` |
| 15023-15114 | Friend requests subscription + badge + accept/refuse/block/remove (bidirectional batch writes) | `subscribeFriendRequests`, `acceptFriendRequest`, `removeFriend` |
| 15115-15175 | Blacklist load / unblock / render | `loadBlacklist`, `renderBlacklist` |

---

## Keys + profile sync (L33870-36604)
| L | What | Anchors |
|---|---|---|
| 15176-15220 | **`claimPublicKey(uid, oldKey)`** atomic transaction (10 retries) + regenerate + send friend request | `claimPublicKey`, `sendFriendRequest` |
| 15245-15295 | Key generators (`XXX-XXX`, 40-char hex) + `userProfiles/{uid}` sync | `generatePublicKey`, `generatePrivateKey`, `syncUserProfile` |

---

## Custom avatar (L34098-37045)
| L | What | Anchors |
|---|---|---|
| 15783-15957 | File pick, image decode, alpha detection, resize to blob, upload, remove | `uploadCustomAvatar`, `removeCustomAvatar` |
| 15958-16143 | **Discord-style cropper** — crop / zoom / rotate + cropped upload | `openAvatarCropper`, `uploadCroppedAvatar` |

---

## User doc sync + telemetry + bootstrap (L34413-38007)
| L | What | Anchors |
|---|---|---|
| 16436-16851 | **`syncUserDoc(uid)`** — displayName/roles/Debug/keys/isPublic + **client telemetry** (studio* fields + `telemetry/studio` aggregates, fire-and-forget) | `syncUserDoc`, `hydrateUserDocCache` |
| ~18460-18540 | **RFID chip list + tag+ backup** — `users/{uid}/rfidList/{UID_HEX}` upsert (firstSeen once-stamped; tag+ signature backup write-once = TigerTag+ indicator). Dedup via inventory-doc `rfidListed`/`rfidBackup` booleans (no in-memory index). Census once per account on first inventory snapshot; backup on auto-scan | `censusRfidListFromInventory`, `recordRfidChipScan` |
| 16852-16884 | Language sync from Firestore + `applyLang(lang)` | `syncLangFromFirestore`, `applyLang` |
| 16885-16900 | **Init bootstrap** — loadLocales → applyTranslations → loadLookups → loadImgMap → runMigration → initAuth → signalFirstPaint | grep "loadLocales().then" |

---

## Electron RFID integration (L35550-38497)
| L | What | Anchors |
|---|---|---|
| 30262-30349 | Reader indicator (topbar), reader connect/disconnect, card present/removed badge | `renderRfidReaderBadges` |
| 30350-30381 | Dual-scan buffer (2 readers / 1.5 s) | `_flushRfidScans` |
| 30382-30514 | **Main NFC scan processor** | `_processNfcScans` |
| 30515-30624 | **Build and write one chip document** to Firestore (API fields only for TigerTag+) | `_writeChipDoc` |
| 30625-30685 | Auto-update status stream | |
| 30686-30687 | TD1S engine moved to `IoT/td1s/index.js` (closing comment) | |

---

## Local MCP server — tools + Settings card (L38097-39027)
| L | What | Anchors |
|---|---|---|
| 37891-38351 | **Read-only MCP tools** + whole-account read (`data_guide` notice, decoder, `firestore_get` / `firestore_query`, friends, wishlists, history, devices; credential masking `MCP_SECRET_FIELD`, scope `_mcpCheckPath`) — definitions (`search_inventory`, `get_spool`, `inventory_summary`, `list_racks`, `list_printers`), row serialiser, handlers, `mcp:call` → `mcp:result` relay. Server itself: `services/mcpServer.js` | `MCP_TOOLS`, `MCP_HANDLERS`, `_mcpRows`, `_mcpSpool` |
| 38351-38391 | My profile › AI assistants — per-profile toggle, ⓘ, Claude / Cursor / VS Code tiles, Claude Code copy, new key; follows the signed-in account | `wireMcpProfile`, `_mcpSyncAccount`, `_mcpSettingsRefresh` |
| 38814-38893 | My profile › AI assistants › online — hosted connector (Tiger Hub `mcp.tigersystem.io`): address + Copy, guide link, connected online assistants list (`mcp-grants` via main) with hold-to-cut | `wireMcpHosted`, `_mcpGrantsRefresh`, `MCP_HOSTED_GUIDE` |

## "Find X by feature" cookbook

Most common navigation tasks → grep these anchors first:

| You want to … | Grep / open |
|---|---|
| Add or change an i18n key | `function t` L564; *use `npm run i18n:add` for the actual write* |
| Touch the spool detail panel | `buildPanelHTML` L7523, `openDetail` L6707 |
| Touch the weight slider / weight save | `doWeightUpdate` L8201, `_patchDetailWeight` L6616 |
| Touch the Add Product panel | `openAddProductPanel` L2196, `saveAddProduct` L2382 |
| Touch the RFID encode/burn modal | `openEncodeModal` L6005, `_cemStartBurn` L6150 |
| Touch a modal | Twin link L7351, Container L7426, Rack edit L14875, Login L3531, Edit account L3266 |
| Touch the storage view | `renderRackView` L13996 — biggest function in the file |
| Touch rack drag-drop | `wireDragSources` L14636, `wireDropTargets` L14701, drop-to-void L14788 |
| Touch the printers grid / table / cam wall | `renderPrintersView` L9401, `_renderPrinterTable` L9570, `_renderPrinterCam` L9735 |
| Touch the printer detail card | `renderPrinterDetail` L10728, `openPrinterDetail` L10154 |
| Touch a printer brand integration (WS/MQTT/HTTP, live block, filament edit) | `printers/<brand>/index.js` — NOT in this file |
| Touch the Anycubic MQTT layer (LAN + cloud) | `acuConnect` in `printers/anycubic/index.js` (+ `anycubic:*` IPC in main.js) |
| Touch the Anycubic live block / ACE card | `renderAnycubicLiveInner`, `renderAcuFilamentCard` |
| Touch a printer camera banner | `printers/<brand>/widget_camera.js`; dispatch at `renderCamBanner` L10717 |
| Touch the Add-printer scan flow | `printers/<brand>/add-flow.js`; shell at `openPrinterBrandPicker` L11931 |
| Touch the printer tutorials | `openPrinterTutorial` L12258 |
| Touch the TigerScale panel | `IoT/tigerscale/index.js`; init wiring at L3116 |
| Touch the TD1S sensor / TD-Color edit modals | `IoT/td1s/index.js` + `edit-modals.js` |
| Touch the Friends system | lists L8727, friend view L15079, requests L15590 |
| Touch the custom avatar / cropper | `openAvatarCropper` L16047, `uploadCustomAvatar` L15971 |
| Touch the auth flow | `handleSignedIn` L4445, `initAuth` L4578, login modal L3531 |
| Touch the Firestore subscriptions | inventory L4336, racks L9023, printers L9066, friend reqs L15590 |
| Touch the telemetry | `syncUserDoc` L16247 (studio* fields), `_recordUsage` L7301 |
| Touch the auto-update banner | L8411 |
| Touch the diagnostic / report-problem modal | `reportError` L713, `openDiagnosticModal` L814 |

---

## Notes for AI assistants

- **State** is at L501. Read it first when reasoning about anything cross-cutting.
- **ES module**: `inventory.js` imports printer brands, IoT modules and the RFID tester at L1-257. Brand modules receive `state`/`t`/`$` through `printers/context.js` (`ctx`).
- **Selectors**: `$` is `document.getElementById`. Many DOM nodes have IDs matching the section (e.g. `#detailPanel`, `#friendsPanel`).
- **i18n**: 11 locales (en/fr/de/es/it/zh/pt/pt-pt/pl/ru/nl) under `renderer/locales/`. Never hand-edit — use `npm run i18n:add`. The `npm run i18n:check` pre-commit hook blocks drift.
- **CSS**: 10 themed files under `renderer/css/` (`00-base.css` → `70-detail-misc.css`, plus `55-creality.css` and `57-elegoo.css`). When this file references a UI section, the styles live in the matching CSS module.
- **Per-brand camera widgets**: each printer folder has a `widget_camera.js` that owns all camera HTML + lifecycle. `inventory.js` calls `renderCamBanner(p)` (L10717) which dispatches — it never builds camera HTML inline. To add a brand: create `printers/<brand>/widget_camera.js`, export `render<Brand>CamBanner(p)`, add a case in `renderCamBanner`, CSS in `renderer/css/5X-<brand>.css`.
- **Line numbers drift** — if a range looks wrong, grep the anchor name. `npm run codemap:check` catches major drift at commit time.
