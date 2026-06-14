# `renderer/inventory.js` — code map

`inventory.js` is a ~16,100-line **ES module** holding the core renderer logic. Printer brand integrations, IoT devices (TigerScale, TD1S) and the RFID tester live in **separate modules** (see *Extracted modules* below) and are imported at the top of the file. This map links each feature to its line range and anchor functions so an AI assistant (or human) can jump directly to the right block instead of reading the file linearly.

**Anchor-first navigation**: line numbers drift as the file changes — anchor function names don't. Always `grep -n "anchorName"` and trust the grep result over the L-number written here. The L-ranges are for orientation (which block is where, what's nearby), not for blind `Read offset=N`.

Keep this map in sync: `npm run codemap:check` (also run by the pre-commit hook) verifies that the anchors of each section still fall inside the declared range and fails the commit on major drift.

---

## Bird's-eye structure

```
L1-91          ES-module imports — IoT modules, printer brand registry, RFID tester
L92-973        Foundation — Firebase helpers, avatar pipeline, state, persistence,
               cold-start trace, rAF coalescer, i18n, helpers, diagnostics, lookups
L976-1103      Data layer (tsToMs, normalizeRow, health icon)
L1104-1350     Account dropdown + connected/disconnected sidebar states
L1351-3071     Add Product panel (ADP) — color/brand/material sheets, chip schema, save
L3072-3528     Settings + Friends open/close, TigerScale init, edit-account modal
L3529-3843     Login modal + localStorage accounts + sign-out + legacy migration
L3844-4329     Data migrations (decimal UID → hex, flat rack → nested)
L4330-4731     Firestore inventory subscription + auth orchestration + account list
L4732-5037     Stats, twin auto-link / manual pairing, sort + quick filters
L5038-5863     Inventory render — table/grid keyed-diff, view mode, search
L5864-6190     RFID encode/burn modal (cem)
L6191-6498     TigerTag+ catalogue refresh / convert / duplicate
L6499-8192     Spool detail panel (openDetail, buildPanelHTML, weight update)
L8193-8430     Resizable panels, debug panel, auto-update settings
L8431-8541     Hard delete + container auto-assign + legacy tombstone purge
L8542-8659     Firestore explorer + language save + debug mode
L8660-8955     Friends sidebar quick-list + friends list render
L8956-9162     Racks + printers Firestore subscriptions
L9163-10086    Printers views — grid / table / cam wall + drag-drop
L10087-11855   Printer detail side panel (renderPrinterDetail) + inline edit
L11856-12391   Add-printer flow (brand picker, form, tutorials, submit)
L12392-13245   Racks CRUD + slots + locking + auto-fill + masonry + tooltip
L13246-14328   renderRackView + rack drag-drop + rack edit modal
L14329-14795   Friend view + add-friend modal
L14796-14992   Display-name setup + friend requests + blacklist
L14993-15112   Public/private keys + user profile sync
L15113-15485   Custom avatar upload + Discord-style cropper
L15486-15799   syncUserDoc + session telemetry + language sync
L15800-15815   Init bootstrap (loadLocales → loadLookups → runMigration → initAuth)
L15816-16140   Electron RFID integration (readers, dual-scan, NFC processor, chip write)
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
| `printers/anycubic/index.js` | MQTTS :9883 (LAN, TLS 1.2) + cloud — connect/parse via main-process IPC, ACE `multiColorBox` slots, job/temps, on-demand FLV camera, filament edit. `mode:"cloud"` branch routes through Anycubic's cloud (REST `sendOrder` + shared cloud-MQTT). See **§ Anycubic integration** below. | `acuConnect`, `acuDisconnect`, `renderAnycubicLiveInner`, `openAcuFilamentEdit` |
| `printers/<brand>/widget_camera.js` | Per-brand camera banner (one per brand) — `inventory.js` only dispatches via `renderCamBanner(p)` | `renderSnapCamBanner`, `renderCreCamBanner`, `renderFfgCamBanner`, `renderBambuCamBanner`, `renderElegooCamBanner`, `renderAcuCamBanner` |
| `printers/<brand>/add-flow.js` | Per-brand Add-printer scan/manual flow (Scan choice modal, slide-in panel, manual IP probe) | `openSnapAddFlow`, `openFfgAddFlow`, `openCreAddFlow`, `openBblAddFlow`, `openElgAddFlow`, `openAcuAddFlow` |
| `printers/<brand>/probe.js` | Pure network/data discovery layer (no DOM) | per-brand probes |
| `printers/snapmaker/widget_control.js`, `elegoo/widget_control.js` | Control cards (fan, etc.) | `renderSnapControlCard`, `elgFanStep` |
| `printers/cam_manager.js`, `modal-helpers.js`, `extra-subnets.js` | Shared cam lifecycle, modal helpers, user-declared subnets widget | |
| `IoT/tigerscale/index.js` | TigerScale — Firestore subscription, panel render, health tick | `initTigerScale`, `subscribeScales`, `renderScalesPanel`, `renderScaleHealth` |
| `IoT/td1s/index.js` + `edit-modals.js` | TD1S sensor engine (serial events, panel, modals) + TD/Color edit modals | `initTD1S`, `openTd1sConnectModal`, `openTdEditModal`, `openColorEditModal` |
| `rfid_protocol/tigertag/index.js` | RFID TigerTag tester modal | `initRfidTester` |

Raw socket probes run in the **main process** over IPC (`ffg:tcp-probe`, `cre:tcp-probe`, `net:get-local-subnets`, `snap:http-get`, `mdns:browse-snapmaker`) — the renderer can open WebSockets but not raw TCP/UDP.

---

## Foundation (L92-973)

| L | What | Anchors |
|---|---|---|
| 92 | `API_BASE` constant | |
| 94-133 | **Firebase helpers** — per-account named app instances (`firebase.app(uid)`), each with its own auth session | `fbAuth(id)`, `fbDb(id)` |
| 134-396 | **Avatar pipeline** (single source of truth) — gradients, parts builder, paint, photo overlay | `hexToGradientPair`, `getAccGradient`, `paintAvatar`, `avatarMarkup`, `applyAvatarStyle` |
| 399-438 | **Local-first persistence layer** — cache-first paint | |
| 439-484 | **Cold-start trace** + first-paint signal + **rAF render coalescer** | `signalFirstPaint`, `scheduleRender` |
| 500-560 | **`state` object declaration** — single source of truth (inventory, rows, selected, lang, racks, friends, isAdmin, db, imgCache, …) | `const state = {` |
| 563-600 | **`t(key, params)`** — i18n lookup with fallback, `{{param}}`, `["array"]` random pick, `{one,other}` plurals; `applyTranslations()` | `function t`, `applyTranslations` |
| 601-692 | **General helpers** — `v()`, `toHex()`, `timeAgo()`, `fmtTs()`, `fmtChipTs()`, `setLoading()`, `setupHoldToConfirm()` | `timeAgo`, `setupHoldToConfirm` |
| 693-711 | `toast()` — top banner with kind (info/error/success) + auto-dismiss | `toast` |
| 712-841 | **Error reporting / diagnostic system** — `reportError()`, app version line, diag badge, report builder, modal; `esc`/`highlight`/`debug` | `reportError`, `buildDiagnosticReport`, `openDiagnosticModal` |
| 842-851 | `apiFetch()` — fetch wrapper feeding the debug panel | `apiFetch` |
| 852-973 | **Lookups** — locales, TigerTag DB (brand/material/aspect/type/diameter/version/containers), printer model catalog helpers | `loadLocales`, `loadLookups`, `findPrinterModel`, `dbFind`, `brandName`, `materialLabel` |

---

## Data layer (L976-1103)

| L | What | Anchors |
|---|---|---|
| 976-984 | `tsToMs()` — Firestore Timestamp → ms (accepts `number`, `Timestamp`, `{_seconds}`) | `tsToMs` |
| 985-1073 | **`normalizeRow(spoolId, data)`** — Firestore doc → flat row used by every view | `normalizeRow` |
| 1074-1103 | Health icon driven by Firestore `metadata.fromCache` | `setHealthLive`, `setHealthOffline`, `setHealthIdle` |

---

## Account dropdown + sidebar states (L1104-1350)

| L | What | Anchors |
|---|---|---|
| 1104-1200 | Connected vs no-account UI states | `setConnected`, `setDisconnected` |
| 1201-1309 | **Account dropdown** (avatar click) — connected accounts, manage profiles, friends section, add friend | `openAccountDropdown`, `renderAccountDropdown` |
| 1310-1350 | Profiles modal | `openProfilesModal` |

---

## Add Product panel — ADP (L1351-3071)

Manual spool creation: full chip-schema editor with bottom-sheets. All helpers prefixed `_adp`.

| L | What | Anchors |
|---|---|---|
| 1351-1446 | Field helpers — cloud id, grams conversion, color presets render | `_adpCloudId`, `_adpToGrams`, `_adpRenderColorPresets` |
| 1447-1639 | **Color sheet + custom colour picker** (HSV math, drag) | `openAdpColorSheet`, `openAdpColorCustomSheet`, `_adpCcRender` |
| 1640-1747 | **Brand bottom-sheet** with favourites | `openAdpBrandSheet`, `_adpRenderBrandList`, `_adpToggleFavBrand` |
| 1748-1846 | **Material bottom-sheet** (mirror of Brand) | `openAdpMaterialSheet`, `_adpRenderMaterialList` |
| 1847-2193 | Multi-colour state, 28-byte colour-name limit, material defaults, RFID preview | `_adpSetColorMode`, `_adpApplyMaterialDefaults`, `_adpRefreshRfidPreview` |
| 2194-2379 | **Panel open/close** | `openAddProductPanel`, `closeAddProductPanel` |
| 2380-2578 | **`saveAddProduct()`** — canonical chip schema (identity, RGBA colours, firmware slots, measure, TD, timestamps) → Firestore write | `saveAddProduct` |
| 2579-3071 | Sheet/search DOM wiring (click delegation, integer-only fields, Escape cascade) | `_adpCloseAllSheetsAndPanel` |

---

## Settings / Friends / Account modals (L3072-3528)

| L | What | Anchors |
|---|---|---|
| 3072-3099 | Settings panel open/close | `openSettings`, `closeSettings` |
| 3100-3113 | Friends panel open/close (auto-generates publicKey first) | `openFriends`, `closeFriends` |
| 3114-3155 | **TigerScale module init** — wires panel, health tick, card delegation into `IoT/tigerscale` | `initTigerScale(` |
| 3156-3263 | API key 6 + eye-toggle / copy-button factories | `getOrCreateApiKey6`, `makeEyeToggle`, `makeCopyBtn` |
| 3264-3382 | **Edit account modal** + account colour save | `openEditAccountModal`, `saveColorToFirestore` |
| 3383-3528 | **Custom avatar menu** (Discord-style edit flow entry) + display-name save | `_toggleAvatarMenu`, `saveDisplayName` |

---

## Login + accounts persistence (L3529-3843)

| L | What | Anchors |
|---|---|---|
| 3529-3748 | **Login modal** (Firebase) — Google sign-in, email/password sign-in + create flow, forgot password | `lmSetMode`, `openAddAccountModal` |
| 3749-3774 | LocalStorage accounts helpers; inventory cache save; legacy API-key account wipe | `getAccounts`, `activeAccount`, `runMigration` |
| 3775-3843 | Per-account `firebase.app(uid).auth().signOut()` | `fbSignOut` |

---

## Data migrations (L3844-4329)

| L | What | Anchors |
|---|---|---|
| 3844-3868 | Decimal spoolId detection + hex conversion | `isDecimalSpoolId`, `decimalSpoolIdToHex` |
| 3869-4042 | **Rack-shape migration** — flat fields → nested `rack` object (consent modal + lock-screen sweep) | `maybeMigrateFlatRackToNested`, `drainRackMigrationQueue` |
| 4043-4329 | **UID format migration** — decimal big-endian → hex uppercase (consent modal, progress, queue) | `maybeMigrateDecimalSpoolIds`, `drainUidMigrationQueue`, `migrateOneSpoolDecimalToHex` |

---

## Inventory subscription + auth + account list (L4330-4731)

| L | What | Anchors |
|---|---|---|
| 4330-4438 | **Firestore inventory subscription** — `onSnapshot` with friend-view defense-in-depth | `subscribeInventory`, `unsubscribeInventory` |
| 4439-4582 | **Auth orchestration** — signed-in fast path (cache paint → subs → user doc), named auth setup | `handleSignedIn`, `setupNamedAuth`, `initAuth` |
| 4583-4731 | Account list render + switch + delete | `renderAccountList`, `switchAccountUI`, `deleteAccountUI` |

---

## Stats / twins / filters (L4732-5037)

| L | What | Anchors |
|---|---|---|
| 4732-4777 | Key status, row sort, load action, **stats** | `renderStats`, `loadInventory` |
| 4778-4940 | **Twin auto-link by timestamp** (2 s window) + manual pairing repair | `autoLinkTwinsByTimestamp`, `findTwinCandidates`, `linkTwinPair`, `unlinkTwinPair` |
| 4941-5037 | Sort + search/filter pipeline + quick-filter dropdowns | `sortRows`, `filteredRows`, `populateQuickFilters` |

---

## Inventory render (L5038-5863)

| L | What | Anchors |
|---|---|---|
| 5038-5252 | **`renderInventory()`** — welcome card, rack-view priority, table/grid dispatch | `renderInventory` |
| 5253-5448 | Filter application + colour/thumbnail helpers + image pre-cache | `applyInventoryFilter`, `colorBg`, `thumbHTML`, `preCacheImages` |
| 5449-5670 | **Keyed-diff render** — row signature, create/update grid card + table row (no full rebuild) | `_rowSignature`, `_createGridCard`, `_updateGridCard`, `renderGrid`, `renderTable` |
| 5671-5863 | View mode toggle (persisted), search clear, filter change, stat-tile quick filter, sort indicators | `setViewMode`, `updateSortIndicators` |

---

## RFID encode / burn modal — cem (L5864-6190)

| L | What | Anchors |
|---|---|---|
| 5864-5953 | **`_burnRfid(r)`** — writes a chip from a row | `_burnRfid` |
| 5954-6098 | Encode modal lifecycle — targets present, blank check, render, presence change | `openEncodeModal`, `_cemBlankCheck`, `_cemRender` |
| 6099-6190 | Burn start + post-burn cloud migration | `_cemStartBurn`, `_cemMigrate` |

---

## TigerTag+ catalogue (L6191-6498)

| L | What | Anchors |
|---|---|---|
| 6191-6287 | Refresh API data for a spool; TigerTag+ product lookup | `_refreshApiData`, `_lookupPlusProduct` |
| 6288-6346 | **Convert TigerTag → TigerTag+** | `_convertToPlus` |
| 6347-6498 | Duplicate spool as cloud doc; message inline edit | `duplicateSpoolAsCloud`, `startMessageInlineEdit` |

---

## Spool detail panel (L6499-8192)

| L | What | Anchors |
|---|---|---|
| 6499-6652 | Structural signature (patch vs rebuild), weight patch, saved check | `_detailStructuralSig`, `_patchDetailWeight` |
| 6653-7246 | **`openDetail(spoolId)`** / close / refresh + usage telemetry | `openDetail`, `closeDetail`, `refreshOpenDetail`, `_recordUsage` |
| 7297-7359 | **Twin-link picker modal** | `openTwinLinkPicker` |
| 7360-7371 | TigerPOD modal | `openTigerPodModal` |
| 7372-7427 | **Container picker modal** (46 containers from `data/container_spool/spools_filament.json`) | `openContainerPicker`, `doContainerUpdate` |
| 7428-7468 | Video URL parser (YouTube/Vimeo embeds) | `parseVideoUrl` |
| 7469-8133 | **`buildPanelHTML(r)`** — header, colours, print settings, weight slider w/ debounce, storage row, links, container, toolbox, raw JSON | `buildPanelHTML` |
| 8134-8192 | **Weight update** (direct / raw-scale modes, twin propagation) | `doWeightUpdate` |

---

## Panels / debug / auto-update (L8193-8659)

| L | What | Anchors |
|---|---|---|
| 8193-8266 | Resizable panels (detail + debug) — drag handle, persisted width | `makePanelResizable`, `openDebug` |
| 8267-8343 | Product ID help modal | |
| 8344-8430 | Settings → About → auto-update toggle + "Check for updates now" | `readAutoUpdatePref`, `showUpdateStatus` |
| 8431-8541 | **Hard delete** (`batch.delete` doc + twin), container auto-assign on snapshot, legacy tombstone purge | `markSpoolDeleted`, `resolveContainerForBrand`, `autoAssignMissingContainers`, `purgeLegacyTombstones` |
| 8542-8622 | **Firestore explorer** (debug tab) — path fetch, JSON copy | `fseInit`, `fseFetch` |
| 8623-8659 | Account language save + debug mode apply | `saveAccountLang`, `applyDebugMode` |

---

## Friends rendering (L8660-8955)

| L | What | Anchors |
|---|---|---|
| 8660-8744 | Sidebar friends quick-list + hover tooltip | `renderSidebarFriends`, `showSbFriendTip` |
| 8745-8861 | Friends list render + avatar colour helpers | `renderFriendsList`, `friendColor`, `readableTextOn` |
| 8862-8955 | Friends list load (profile fetch) + cache hydration | `loadFriendsList`, `_hydrateFriendsCache` |

---

## Racks + printers subscriptions (L8956-9162)

| L | What | Anchors |
|---|---|---|
| 8956-8998 | Racks subscription | `subscribeRacks`, `unsubscribeRacks` |
| 8999-9162 | **3D printers subscription** — per-brand subcollections (`users/{uid}/printers/{brand}/devices`) | `subscribePrinters`, `unsubscribePrinters` |

*(Scales subscription moved to `IoT/tigerscale/index.js`.)*

---

## Printers views (L9163-10086)

| L | What | Anchors |
|---|---|---|
| 9163-9332 | **Job status helpers** + surgical grid patches (job card, online badge, grid signature) | `_getPrinterJob`, `_patchGridJobs`, `_jobCardHtml`, `_isPrinterOnline`, `_patchGridStatus` |
| 9333-9502 | **Grid view** — auto-connect all brands, online/offline partition, cards | `renderPrintersView` |
| 9503-9625 | **Table view** — sortable columns, row click → sidecard | `_renderPrinterTable` |
| 9626-9888 | **Cam wall view** — patch mode, card sizes, detached cam window serializer | `_renderPrinterCam`, `_patchCamWall`, `_serializeCamerasForDetach` |
| 9889-10086 | Printer + cam-wall drag-drop reordering (writes `sortIndex`) | `wirePrinterDnd`, `wireCamWallDnd`, `persistPrinterSortIndices` |

---

## Printer detail side panel (L10087-12090)

| L | What | Anchors |
|---|---|---|
| 10087-10649 | Open/close lifecycle (connect/disconnect per brand), conn button, refresh | `openPrinterDetail`, `closePrinterDetail`, `refreshOpenPrinterDetail` |
| 10650-10660 | **`renderCamBanner(p)`** — dispatch to per-brand `widget_camera.js` (never builds camera HTML inline) | `renderCamBanner` |
| 10661-11747 | **`renderPrinterDetail()`** — hero + camera banner + status + per-brand live block + control cards + log | `renderPrinterDetail` |
| 11748-11855 | Inline edit for printer name / IP / port (pencil, Enter/Escape) + field persist | `startInlineEdit`, `savePrinterField` |

---

## Add-printer flow (L12091-12654)

Per-brand scan/manual flows live in `printers/<brand>/add-flow.js`; `inventory.js` owns the shell.

| L | What | Anchors |
|---|---|---|
| 12091-12181 | **Brand picker modal** — dispatches to per-brand add-flow | `openPrinterBrandPicker` |
| 12182-12248 | Add/edit printer form | `openPrinterAddForm`, `closePrinterAddForm` |
| 12249-12501 | Tutorial image bottom-sheet + **multi-step connection tutorial** | `openTutoSheet`, `openPrinterTutorial`, `_ptRenderStep` |
| 12502-12654 | **`submitPrinterAdd()`** — ADD (auto-id) vs EDIT (preserve id/isActive/sortIndex); cloud-edit guard keeps the LAN form from wiping `mode:"cloud"` fields | `submitPrinterAdd` |

---

## Anycubic integration (`printers/anycubic/`)

No `inventory.js` line range — the driver lives entirely in the brand subfolder, wired into the printer views/detail/add-flow shells (mirrors Bambu). **Read `printers/anycubic/PROTOCOL.md` before touching this folder.**

| File | What |
|------|------|
| `PROTOCOL.md` | Agent skill — LAN MQTTS :9883 (TLS 1.2 forced) `multiColorBox`/`extfilbox` getInfo/setInfo, slicer-config credential decode, FLV camera :18088, `/info` scan :18910, **§9 cloud mode** (signed REST + cloud-MQTT, attach-only CDP token). |
| `index.js` | Connect/disconnect/parse via `window.anycubic` IPC. Exports: `acuKey`, `acuGetConn`, `acuIsOnline`, `acuConnect` (`{skipCam}`), `acuDisconnect`, `renderAcuOnlineBadge`, `renderAnycubicLiveInner`, `renderAnycubicLogInner`, `openAcuFilamentEdit`, `closeAcuFilamentEdit`. `_acuMerge` routes report families (`print`/`tempature`/`fan`/`status`/`multiColorBox` — PROTOCOL.md §5b) into `conn.data`. `mode:"cloud"` branches to REST `sendOrder` (1206/1211 ACE, 1230/1229 external `extfilbox`) over a shared cloud-MQTT connection; no camera in cloud mode. |
| `cards.js` | `renderAcuJobCard` (filename/%/remaining/layers/state), `renderAcuTempCard` (nozzle+bed), `renderAcuFilamentCard` — every box renders as its own row with all its slots (ACE A/B/C/D…, external box `id -1` → E1–E4), `data-acu-fil-edit` squares. |
| `probe.js` | `acuReadSlicerCreds` (slicer-config import — the LAN credential source), `acuProbeIp` / `acuScanLan` (TCP :18910 + `GET /info`), `acuCatalogIdFromModel`. |
| `add-flow.js` | LAN: 3-way choice (**Import from Anycubic Slicer** / Scan / Manual IP), merged by IP with DHCP repair. Cloud: **Add a cloud printer** panel → `ctx.addAnycubicCloudPrinter` (writes `cloud_<id>` doc, token+email denormalised). |
| `settings.js` | Brand meta + schema — `ip`, `acuModelId` (numeric topic id ≠ `printerModelId` catalog id), `deviceId`, `username`, `password`. |
| `widget_camera.js` | `renderAcuCamBanner` — `<img data-acu-key>` fed by `anycubic:cam-frame` IPC (ffmpeg remuxes the :18088 HTTP-FLV stream to ~5 fps JPEG in `main.js`). The FLV stream is **on-demand**: the driver publishes `video/startCapture`, attaches ffmpeg on the printer's `video/report` `initSuccess` (bounded `flvProbe` covers the race), and sends `stopCapture` on panel close. Detached window uses the `acu_ipc` cam type in `cam/cam.js`. Cloud printers have no camera. |

Wiring (mirrors Bambu): always-on MQTT in the printers subscription (skipCam), grid/table auto-connect (skipCam), `_getPrinterJob` job normalization, `openPrinterDetail`/`closePrinterDetail`, `#acuLive` + debug-only `#acuLog` in `renderPrinterDetail`, `data-acu-fil-edit` + log buttons in the delegated click handler, `openAcuAddFlow` in the brand picker, `acu_ipc` in `_serializeCamerasForDetach`. Connect guards are `(p.ip || p.mode === "cloud")`. Main-process IPC: `anycubic:connect/disconnect/publish`, `:cam-start/stop` (+ `:cam-frame`), `:flv-probe`, `:read-slicer-config`, `:tcp-probe`, `:http-info`; cloud: `:cloud-cdp-token`, `:cloud-get-printers`, `:cloud-verify`, `:cloud-send-order`, `:cloud-connect/subscribe/unsubscribe`. Certs bundled in `services/anycubicCloudCerts.js` (PEM — BoringSSL can't parse the legacy PKCS#12 / `@SECLEVEL=0`).

---

## Racks CRUD + slots (L12655-13508)

| L | What | Anchors |
|---|---|---|
| 12392-12526 | Rack create / update / delete / empty + orphan ref cleanup | `createRack`, `updateRack`, `deleteRack`, `emptyRack` |
| 12527-12663 | Empty-rack cascade, twin resolver, slot assign/unassign, slot fill HTML | `playEmptyRackCascade`, `assignSpoolToSlot`, `unassignSpool`, `findSpoolInSlot` |
| 12664-12744 | **Slot locking** — right-click toggle, lock/unlock all, kebab menu positioning | `isSlotLocked`, `toggleSlotLock`, `positionRackMenu` |
| 12745-12962 | **Auto-fill / auto-store / auto-unstore** + search dim + unranked helpers | `autoFillEmptySlots`, `maybeAutoStoreUnrankedSpools`, `applyRackSearchDim`, `getUnrackedSpools` |
| 13004-13133 | **Skyline-packing masonry** layout + relayout scheduler + rack reorder | `layoutRacksMasonry`, `reorderRacks` |
| 13134-13245 | **Rich hover tooltip** for filled slots (mini puck preview) | `buildRackTooltipHTML`, `wireRackTooltipDelegation` |

---

## Storage view render + DnD (L13509-14619)

| L | What | Anchors |
|---|---|---|
| 13246-13885 | **`renderRackView()`** — biggest function in the file: stats bar + filter chips, two-column layout, masonry, kebab menus, live search, read-only friend mode, rack reorder DnD | `renderRackView` |
| 13886-14102 | Drag sources (slot puck / unranked row) + drop targets + **drop-to-void unassign** | `wireDragSources`, `wireDropTargets`, `clearOtherDropHighlights` |
| 14103-14124 | Unrank cascade animation | `playUnrankAnimation` |
| 14125-14328 | **Rack create/edit modal** — name, presets, rows×columns, delete confirm, field errors | `openRackEditModal`, `renderRackPresets`, `confirmDeleteRack` |

---

## Friend view (L14620-15086)

| L | What | Anchors |
|---|---|---|
| 14329-14410 | Friend inventory open/close (one-shot read, no live updates) | `openFriendInventory`, `closeFriendInventory` |
| 14411-14602 | **Friend banner** + switch to friend view (tears down ALL owner subscriptions first) / switch back | `renderFriendBanner`, `switchToFriendView`, `switchBackToOwnView`, `prewarmAuthToken` |
| 14603-14657 | Friends section in dropdown + incoming request modal queue | `renderFriendsSection`, `showFriendRequestModal` |
| 14658-14795 | **Add-friend modal** — split XXX-XXX field, live preview lookup | `openAddFriendModal`, `_adfChanged` |

---

## Display name + friend requests (L15087-15283)

| L | What | Anchors |
|---|---|---|
| 14796-14839 | **Display-name setup modal** (first-login pseudo picker) | `openDisplayNameSetup` |
| 14840-14931 | Friend requests subscription + badge + accept/refuse/block/remove (bidirectional batch writes) | `subscribeFriendRequests`, `acceptFriendRequest`, `removeFriend` |
| 14932-14992 | Blacklist load / unblock / render | `loadBlacklist`, `renderBlacklist` |

---

## Keys + profile sync (L15284-15511)

| L | What | Anchors |
|---|---|---|
| 14993-15037 | **`claimPublicKey(uid, oldKey)`** atomic transaction (10 retries) + regenerate + send friend request | `claimPublicKey`, `sendFriendRequest` |
| 15062-15112 | Key generators (`XXX-XXX`, 40-char hex) + `userProfiles/{uid}` sync | `generatePublicKey`, `generatePrivateKey`, `syncUserProfile` |

---

## Custom avatar (L15512-15776)

| L | What | Anchors |
|---|---|---|
| 15113-15296 | File pick, image decode, alpha detection, resize to blob, upload, remove | `uploadCustomAvatar`, `removeCustomAvatar` |
| 15297-15485 | **Discord-style cropper** — crop / zoom / rotate + cropped upload | `openAvatarCropper`, `uploadCroppedAvatar` |

---

## User doc sync + telemetry + bootstrap (L15777-16208)

| L | What | Anchors |
|---|---|---|
| 15486-15766 | **`syncUserDoc(uid)`** — displayName/roles/Debug/keys/isPublic + **client telemetry** (studio* fields + `telemetry/studio` aggregates, fire-and-forget) | `syncUserDoc`, `hydrateUserDocCache` |
| 15767-15799 | Language sync from Firestore + `applyLang(lang)` | `syncLangFromFirestore`, `applyLang` |
| 15800-15815 | **Init bootstrap** — loadLocales → applyTranslations → loadLookups → loadImgMap → runMigration → initAuth → signalFirstPaint | grep "loadLocales().then" |

---

## Electron RFID integration (L16209-16542)

| L | What | Anchors |
|---|---|---|
| 15816-15922 | Reader indicator (topbar), auto-add button, reader connect/disconnect, card present/removed badge | |
| 15923-16017 | Dual-scan buffer (2 readers / 1.5 s) + **main NFC scan processor** | |
| 16018-16138 | **Build and write one chip document** to Firestore (API fields only for TigerTag+) | |
| 16139-16140 | TD1S engine moved to `IoT/td1s/index.js` (closing comment) | |

---

## "Find X by feature" cookbook

Most common navigation tasks → grep these anchors first:

| You want to … | Grep / open |
|---|---|
| Add or change an i18n key | `function t` L563; *use `npm run i18n:add` for the actual write* |
| Touch the spool detail panel | `buildPanelHTML` L7469, `openDetail` L6653 |
| Touch the weight slider / weight save | `doWeightUpdate` L8134, `_patchDetailWeight` L6562 |
| Touch the Add Product panel | `openAddProductPanel` L2194, `saveAddProduct` L2380 |
| Touch the RFID encode/burn modal | `openEncodeModal` L5954, `_cemStartBurn` L6099 |
| Touch a modal | Twin link L7297, Container L7372, Rack edit L14125, Login L3529, Edit account L3264 |
| Touch the storage view | `renderRackView` L13246 — biggest function in the file |
| Touch rack drag-drop | `wireDragSources` L13886, `wireDropTargets` L13951, drop-to-void L14038 |
| Touch the printers grid / table / cam wall | `renderPrintersView` L9333, `_renderPrinterTable` L9503, `_renderPrinterCam` L9668 |
| Touch the printer detail card | `renderPrinterDetail` L10661, `openPrinterDetail` L10087 |
| Touch a printer brand integration (WS/MQTT/HTTP, live block, filament edit) | `printers/<brand>/index.js` — NOT in this file |
| Touch a printer camera banner | `printers/<brand>/widget_camera.js`; dispatch at `renderCamBanner` L10650 |
| Touch the Add-printer scan flow | `printers/<brand>/add-flow.js`; shell at `openPrinterBrandPicker` L11856 |
| Touch the printer tutorials | `openPrinterTutorial` L12158 |
| Touch the TigerScale panel | `IoT/tigerscale/index.js`; init wiring at L3114 |
| Touch the TD1S sensor / TD-Color edit modals | `IoT/td1s/index.js` + `edit-modals.js` |
| Touch the Friends system | lists L8660, friend view L14329, requests L14840 |
| Touch the custom avatar / cropper | `openAvatarCropper` L15297, `uploadCustomAvatar` L15221 |
| Touch the auth flow | `handleSignedIn` L4439, `initAuth` L4572, login modal L3529 |
| Touch the Firestore subscriptions | inventory L4330, racks L8956, printers L8999, friend reqs L14840 |
| Touch the telemetry | `syncUserDoc` L15497 (studio* fields), `_recordUsage` L7247 |
| Touch the auto-update banner | L8344 |
| Touch the diagnostic / report-problem modal | `reportError` L712, `openDiagnosticModal` L813 |

---

## Notes for AI assistants

- **State** is at L500. Read it first when reasoning about anything cross-cutting.
- **ES module**: `inventory.js` imports printer brands, IoT modules and the RFID tester at L1-91. Brand modules receive `state`/`t`/`$` through `printers/context.js` (`ctx`).
- **Selectors**: `$` is `document.getElementById`. Many DOM nodes have IDs matching the section (e.g. `#detailPanel`, `#friendsPanel`).
- **i18n**: 9 locales (en/fr/de/es/it/zh/pt/pt-pt/pl) under `renderer/locales/`. Never hand-edit — use `npm run i18n:add`. The `npm run i18n:check` pre-commit hook blocks drift.
- **CSS**: 10 themed files under `renderer/css/` (`00-base.css` → `70-detail-misc.css`, plus `55-creality.css` and `57-elegoo.css`). When this file references a UI section, the styles live in the matching CSS module.
- **Per-brand camera widgets**: each printer folder has a `widget_camera.js` that owns all camera HTML + lifecycle. `inventory.js` calls `renderCamBanner(p)` (L10650) which dispatches — it never builds camera HTML inline. To add a brand: create `printers/<brand>/widget_camera.js`, export `render<Brand>CamBanner(p)`, add a case in `renderCamBanner`, CSS in `renderer/css/5X-<brand>.css`.
- **Line numbers drift** — if a range looks wrong, grep the anchor name. `npm run codemap:check` catches major drift at commit time.
