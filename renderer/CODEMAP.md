# `renderer/inventory.js` — code map

`inventory.js` is a ~25,000-line **ES module** holding the core renderer logic. Printer brand integrations, IoT devices (TigerScale, TD1S) and the RFID tester live in **separate modules** (see *Extracted modules* below) and are imported at the top of the file. This map links each feature to its line range and anchor functions so an AI assistant (or human) can jump directly to the right block instead of reading the file linearly.

**Anchor-first navigation**: line numbers drift as the file changes — anchor function names don't. Always `grep -n "anchorName"` and trust the grep result over the L-number written here. The L-ranges are for orientation (which block is where, what's nearby), not for blind `Read offset=N`.

Keep this map in sync: `npm run codemap:check` (also run by the pre-commit hook) verifies that the anchors of each section still fall inside the declared range and fails the commit on major drift.

---

## Bird's-eye structure

```
L1-262          ES-module imports — IoT modules, printer brand registry, RFID tester
L104-1166        Foundation — Firebase helpers, avatar pipeline, state, persistence,
               cold-start trace, rAF coalescer, i18n, helpers, diagnostics, lookups
L1010-1296      Data layer (tsToMs, normalizeRow, health icon)
L1140-1552     Account dropdown + connected/disconnected sidebar states
L1396-3366     Add Product panel (ADP) — color/brand/material sheets, chip schema, save
L3210-3873     Settings + Friends open/close, TigerScale init, edit-account modal
L3717-4246     Login modal + localStorage accounts + sign-out + legacy migration
L4091-4751     Data migrations (decimal UID → hex, flat rack → nested)
L4595-6156     Firestore inventory subscription + auth orchestration + account list
L5997-6492     Stats, twin auto-link / manual pairing, sort + quick filters
L6333-7326     Inventory render — table/grid keyed-diff, view mode, search
L7164-7741     RFID encode/burn modal (cem)
L7582-8069     TigerTag+ catalogue refresh / convert / duplicate
L7890-9928     Spool detail panel (openDetail, buildPanelHTML, weight update)
L9724-10170     Resizable panels, debug panel, auto-update settings
L10011-10282     Hard delete + container auto-assign + legacy tombstone purge
L10122-10400     Firestore explorer + language save + debug mode
L10240-10698     Friends sidebar quick-list + friends list render
L10537-11196     Racks + printers Firestore subscriptions (+ live friends/notifs)
L11037-12287    Printers views — grid / table / cam wall + drag-drop
L12128-14577   Printer detail side panel (renderPrinterDetail) + inline edit
L14409-15677   Add-printer flow (brand picker, form, tutorials, submit)
L15666-16574   Racks CRUD + slots + locking + auto-fill + masonry + tooltip
L16563-17683   renderRackView + rack drag-drop + rack edit modal
L17672-18172   Friend view + add-friend modal
L18161-18900   Display-name setup + friend requests + blacklist
L18889-19159   Public/private keys + user profile sync
L19148-19468   Custom avatar upload + Discord-style cropper
L19453-20135   syncUserDoc + session telemetry + language sync
L20119-20151   Init bootstrap (loadLocales → loadLookups → runMigration → initAuth)
L20135-20507   Electron RFID integration (readers, dual-scan, NFC processor, chip write)
```

---

## Extracted modules (NOT in inventory.js)

| Module | What | Key exports |
|---|---|---|
| `quests/squad-rankings.js` | TigerSquad → Rankings view (display only): hero with the account's league card, My rank (national / world rank, next rival), Community pulse (publicStats/community + daily history, SVG sparklines), the three leagues with medals and View all. Data from the server board (`squadBoard/*`, `squadRank/{uid}`, backend squadBoard.js), never the member list. Host side: `_loadSquadPulse`, `_squadRankCtx`, `_loadSquadBoard`, `_squadMemberOf`, inline `_openSquadBoard` | `squadHeroHtml`, `squadRankingsHtml`, `toggleLeague` |
| `quests/index.js` + `quests.css` | Tiger Quests (docs/QUESTS.md): batched counters/gauges to `telemetry/studio.quest`, `dailyQuest` check-in (launch, focus, local midnight), live `quests/{daily,journey}`, sidebar pill, the Quests views of the main area (`renderQuestsView`, view modes questsToday / questsJourney), celebrations. Host side: `_renderQuestPill`, `_renderProgressChips` (view-bar chips), `_isProgressMode`, `_renderSquadView` (TigerSquad view = `_openSquadBoard(tab, host)` inline), `_questGauges`, `_questPrintEdges` | `initQuests`, `questsSignIn`, `questBump`, `questGauge`, `openQuests` |
| `printers/registry.js` + `context.js` | Brand registry — each brand module registers itself; import order = brand picker order. `context.js` shares `state`/`t`/`$` with brand modules | `brands`, `ctx` |
| `printers/snapmaker/index.js` | Moonraker WS :7128 — connect, status merge, live block, filament edit, file sheet, print control | `snapConnect`, `snapDisconnect`, `renderSnapmakerLiveInner`, `openSnapFilamentEdit`, `snapSendGcode` |
| `printers/flashforge/index.js` | HTTP polling :8901 — ping, connect, `/detail` parser, live block, filament edit | `ffgConnect`, `ffgPingPrinter`, `renderFlashforgeLiveInner`, `openFlashforgeFilamentEdit` |
| `printers/flashforge/cam_mux.js` | Single-fetch MJPEG multiplexer, blob URLs to all `<img>` consumers | `ffgMuxStart`, `ffgMuxRegister` |
| `printers/creality/index.js` | WS :10002 — heartbeat, CFS boxsInfo, live block, file list, LED/pause/stop | `creConnect`, `renderCrealityLiveInner`, `creActionPrintFile` |
| `printers/bambulab/index.js` | MQTTS :8886 — connect/parse via main-process IPC, AMS, live block | `bambuConnect`, `renderBambuLiveInner`, `openBambuFilamentEdit` |
| `printers/elegoo/index.js` | MQTT/WS — connect, live block, file sheet, timelapse | `elegooConnect`, `renderElegooLiveInner`, `openElegooFileSheet` |
| `printers/anycubic/index.js` | MQTTS :9886 (LAN) + cloud REST/MQTT — ACE box/slots, live block, filament edit. Detailed section below | `acuConnect`, `renderAnycubicLiveInner`, `openAcuFilamentEdit` |
| `printers/prusa/index.js` | PrusaLink HTTP (Digest, via main `prusa:http`) — 2 s status poll, job/thumbnail, MMU / XL-tool slots from job metadata, hold-to-confirm pause/resume/stop, debug request log. Camera (`widget_camera.js`): Buddy3D RTSP or PrusaLink snapshots, one feed per printer. Beta — see its `PROTOCOL.md` | `prusaConnect`, `renderPrusaLiveInner`, `prusaJobControl`, `prusaWireLive`, `renderPrusaCamBanner` |
| `printers/<brand>/widget_camera.js` | Per-brand camera banner (one per brand) — `inventory.js` only dispatches via `renderCamBanner(p)` | `renderSnapCamBanner`, `renderCreCamBanner`, `renderFfgCamBanner`, `renderBambuCamBanner`, `renderElegooCamBanner`, `renderAcuCamBanner` |
| `printers/<brand>/add-flow.js` | Per-brand Add-printer scan/manual flow (Scan choice modal, slide-in panel, manual IP probe) | `openSnapAddFlow`, `openFfgAddFlow`, `openCreAddFlow`, `openBblAddFlow`, `openElgAddFlow` |
| `printers/<brand>/probe.js` | Pure network/data discovery layer (no DOM) | per-brand probes |
| `printers/snapmaker/paxx.js` | Paxx U1 extended-firmware resolver — latest release (GitHub API, 24 h cache + ETag, fallback) + installed-version probe (`GET /firmware-config/api/status`, paxx-only) + build compare. Feeds the add/edit download CTA, the side-card status line, and the update notification | `paxxLatest`, `paxxEnsureLatest`, `paxxProbeInstalled`, `paxxBuildOf`, `paxxUpdateAvailable`, `paxxCleanVersion` |
| `printers/snapmaker/widget_control.js`, `elegoo/widget_control.js` | Control cards (fan, etc.) | `renderSnapControlCard`, `elgFanStep` |
| `printers/cam_manager.js`, `modal-helpers.js`, `extra-subnets.js` | Shared cam lifecycle, modal helpers, user-declared subnets widget | |
| `ext-cam/ext-cam.js` | External IP cameras (not printers): `users/{uid}/devices` (`type: "camera"`) subscription, the add / edit side card (`#xcOverlay`), cards of the camera wall like a printer's (`extcam:` keys, `camWallPlan`), the board cards (`extcam:` board ids), and the two readers (ffmpeg in main for RTSP and MJPEG via `extcam:*` IPC — a page fetch of MJPEG is blocked by CORS on most cameras —, WHEP WebRTC) | `extCamSubscribe`, `extCamWallItems`, `extCamWallHtml`, `extCamBoardCardsHtml`, `openExtCamAddFlow` |
| `IoT/tigerscale/index.js` | TigerScale — Firestore subscription, panel render, health tick | `initTigerScale`, `subscribeScales`, `renderScalesPanel`, `renderScaleHealth` |
| `IoT/tigerspool/index.js` | TigerSpool — Firestore presence subscription, header glyph + hover | `initTigerSpool`, `subscribeTigerSpools`, `renderTigerSpoolHealth` |
| `IoT/tigerspool/panel.js` | TigerSpool — side card (boxes + their printers) and the discovery modal | `openTigerSpool`, `renderTigerSpoolPanel`, `openTigerSpoolDiscover` |
| `IoT/td1s/index.js` + `edit-modals.js` | TD1S sensor engine (serial events, panel, modals) + TD/Color edit modals | `initTD1S`, `openTd1sConnectModal`, `openTdEditModal`, `openColorEditModal` |
| `rfid_protocol/tigertag/index.js` | RFID TigerTag tester modal | `initRfidTester` |

Raw socket probes run in the **main process** over IPC (`ffg:tcp-probe`, `cre:tcp-probe`, `net:get-local-subnets`, `snap:http-get`, `mdns:browse-snapmaker`) — the renderer can open WebSockets but not raw TCP/UDP.

### Anycubic integration (`printers/anycubic/`) — LAN + cloud (PR #1, @ennisj)

| File | What |
|------|------|
| `PROTOCOL.md` | Agent skill — MQTTS port 9886 (TLS 1.2 forced), `multiColorBox` getInfo/setInfo, slicer-config credential decode, port map, report-shape pitfalls. **Read it before touching this folder.** |
| `index.js` | MQTT connect/disconnect/parse via `window.anycubic` IPC. Exports: `acuKey`, `acuGetConn`, `acuIsOnline`, `acuConnect` (`{skipCam}`), `acuDisconnect`, `renderAcuOnlineBadge`, `renderAnycubicLiveInner`, `renderAnycubicLogInner`, `openAcuFilamentEdit`, `closeAcuFilamentEdit`. `_acuMerge` routes the report families (`print`/`tempature`/`fan`/`status`/`multiColorBox`/`info` — PROTOCOL.md §5b) into `conn.data`; the `info` report carries the camera stream URL (`data.urls.rtspUrl` → `conn.data.camUrl`). Filament-edit bottom sheet DOM is created lazily here (inventory.html untouched). |
| `cards.js` | `renderAcuJobCard` (filename/%/remaining/layers/state), `renderAcuTempCard` (nozzle+bed), `renderAcuFilamentCard` — ACE units + external spool (box -1), slots 0-3, `data-acu-fil-edit` squares. |
| `probe.js` | `acuReadSlicerCreds` (slicer-config import — the ONLY credential source), `acuProbeIp` / `acuScanLan` (TCP :18922 + `GET /info`), `acuCatalogIdFromModel`. |
| `add-flow.js` | 3-way choice: **Import from Anycubic Slicer** (primary) / Scan / Manual IP. Scan & manual candidates are merged with slicer credentials by IP (DHCP repair included). |
| `settings.js` | Brand meta + schema — fields `ip`, `acuModelId` (numeric topic id, ≠ `printerModelId` catalog id), `deviceId`, `username`, `password`. |
| `widget_camera.js` | `renderAcuCamBanner` — when `camLive`, `<img data-acu-key>` fed by 'anycubic:cam-frame' IPC (ffmpeg remuxes the :18100 HTTP-FLV stream to ~5 fps JPEG in main.js, Bambu-RTSP pattern); when idle, returns "" so the hero photo shows (cam-wall safe). The FLV stream is **on-demand** and the driver **actively controls it**: `_acuRequestCamera`/`_acuStartCapture` publish `video/startCapture`, ffmpeg attaches on the printer's `video/report` `initSuccess` (bounded `flvProbe` covers the race), `acuReleaseCamera` sends `stopCapture` on panel close. Stream URL = `conn.data.camUrl` (from the `info/report` `rtspUrl`): `/flv` on a Kobra 3 V2, `/live/<token>` on a Kobra X — both fed to `flvProbe`/`cam-start`; the probe accepts 200 + 206. Cam wall + detached window (`acu_ipc` type in `renderer/cam/cam.js`) reuse the same frames. CSS in `printers/anycubic/anycubic.css`. |
| `agora-cam.js` | **Cloud-mode camera** (Agora WebRTC, PROTOCOL.md §9b). `acuAgoraStart/Stop(key, creds)`: Agora Web SDK (npm dep `agora-rtc-sdk-ng`, global `AgoraRTC`) `setEncryptionConfig("aes-256-gcm2", key, salt)` → `join(appId, channel, rtcToken, clientUid)` → subscribe to the printer's video `uid` → `track.play()` into the `.acu-cam-agora` banner container. Creds from cloud order 1001 (`anycubic:cloud-camera-open`). Self-heal interval re-attaches the track across re-renders. Side panel + cam wall; `acuReleaseCloudCameras()` leaves the channel on cam-wall exit. Detached window: the cloud reuses the Agora uid, so a 2nd client would kick this one — instead this single client captures its video to JPEG and relays frames over `BroadcastChannel('acu-cam')` (`_relayTick`); the detached window's `acu_bc` cam type renders them. `acuAgoraOnRelayWant/End` keep the player alive while detached. |

Wiring (mirrors Bambu): always-on MQTT in `subscribePrinters` (skipCam), auto-connect in the grid/table (skipCam) and cam views, `_getPrinterJob` job normalization, `openPrinterDetail`/`closePrinterDetail`, `#acuLive` + debug-only `#acuLog` blocks in `renderPrinterDetail`, `data-acu-fil-edit` + `#acuLogPauseBtn`/`#acuLogClearBtn` in the delegated click handler, `openAcuAddFlow` in the brand picker, `acu_ipc` entry in `_serializeCamerasForDetach`. Main-process IPC: `anycubic:connect/disconnect/publish(endpoint)` (+ `status`/`message` events), `anycubic:cam-start/stop` (+ `cam-frame`), `anycubic:read-slicer-config`, `anycubic:tcp-probe`, `anycubic:http-info`.

**Cloud mode** (`mode:"cloud"` docs — PROTOCOL.md §9): cloud-mode printers are reached through Anycubic's cloud. The driver (`index.js`) branches on `printer.mode === "cloud"`: connect = shared cloud-MQTT subscribe + REST `getInfo`; refresh/getInfo/setInfo via REST `sendOrder` (1206/1211); reports reuse `_acuMerge`; **camera = Agora WebRTC** (cloud order 1001 → `agora-cam.js`, PROTOCOL.md §9b — side panel + cam wall). Token is grabbed **attach-only** over CDP from a user-run bridge-mode slicer (never launched by us). Provisioning UI: `add-flow.js` "Add a cloud printer" panel → `ctx.addAnycubicCloudPrinter` (writes `cloud_<id>` doc with token+email denormalised). Connect guards in `inventory.js` are `(p.ip || p.mode === "cloud")`; a cloud-edit guard in `submitPrinterAdd` prevents the LAN form from wiping cloud fields. Certs: `services/anycubicCloudCerts.js`. Main IPC: `anycubic:cloud-cdp-token`, `:cloud-get-printers`, `:cloud-verify`, `:cloud-send-order`, `:cloud-camera-open`, `:cloud-connect/subscribe/unsubscribe` (+ `:cloud-message`/`:cloud-status`). Dev validator: `scripts/acu-cloud-test.mjs`.

---

## Foundation (L170-1955)
| L | What | Anchors |
|---|---|---|
| 92 | `API_BASE` constant | |
| 101-141 | **Firebase helpers** — per-account named app instances (`firebase.app(uid)`), each with its own auth session | `fbAuth(id)`, `fbDb(id)` |
| 142-480 | **Avatar pipeline** (single source of truth) — gradients, parts builder, paint, photo overlay; `userAvatar` = the ONE way to draw a person (own account / friend record enrichment, size by class) | `hexToGradientPair`, `getAccGradient`, `paintAvatar`, `userAvatar`, `avatarMarkup`, `applyAvatarStyle` |
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

## Data layer (L1963-2153)
| L | What | Anchors |
|---|---|---|
| 984-992 | `tsToMs()` — Firestore Timestamp → ms (accepts `number`, `Timestamp`, `{_seconds}`) | `tsToMs` |
| 993-1083 | **`normalizeRow(spoolId, data)`** — Firestore doc → flat row used by every view | `normalizeRow` |
| 1084-1113 | Health icon driven by Firestore `metadata.fromCache` | `setHealthLive`, `setHealthOffline`, `setHealthIdle` |

---

## Account dropdown + sidebar states (L2190-2413)
| L | What | Anchors |
|---|---|---|
| 1114-1210 | Connected vs no-account UI states | `setConnected`, `setDisconnected` |
| 1211-1319 | **Account dropdown** (avatar click) — connected accounts, manage profiles, friends section, add friend | `openAccountDropdown`, `renderAccountDropdown` |
| 1320-1360 | Profiles modal | `openProfilesModal` |

---

## Add Product panel — ADP (L2475-3951)
Manual spool creation: full chip-schema editor with bottom-sheets. All helpers prefixed `_adp`.

| L | What | Anchors |
|---|---|---|
| 1361-1456 | Field helpers — cloud id, grams conversion, color presets render | `_adpCloudId`, `_adpToGrams`, `_adpRenderColorPresets` |
| 1457-1650 | **Color sheet + custom colour picker** (HSV math, drag) | `openAdpColorSheet`, `openAdpColorCustomSheet`, `_adpCcRender` |
| 1651-1760 | **Brand bottom-sheet** with favourites | `openAdpBrandSheet`, `_adpRenderBrandList`, `_adpToggleFavBrand` |
| 1761-1859 | **Material bottom-sheet** (mirror of Brand) | `openAdpMaterialSheet`, `_adpRenderMaterialList` |
| 1860-2206 | Multi-colour state, 28-byte colour-name limit, material defaults, RFID preview | `_adpSetColorMode`, `_adpApplyMaterialDefaults`, `_adpRefreshRfidPreview` |
| 2207-2392 | **Panel open/close** | `openAddProductPanel`, `closeAddProductPanel` |
| 2393-2591 | **`saveAddProduct()`** — canonical chip schema (identity, RGBA colours, firmware slots, measure, TD, timestamps) → Firestore write | `saveAddProduct` |
| 2592-3084 | Sheet/search DOM wiring (click delegation, integer-only fields, Escape cascade) | `_adpCloseAllSheetsAndPanel` |

---

## Settings / Friends / Account modals (L4457-7436)
| L | What | Anchors |
|---|---|---|
| 3085-3112 | Settings panel open/close | `openSettings`, `closeSettings` |
| 3113-3126 | Friends panel open/close (auto-generates publicKey first) | `openFriends`, `closeFriends` |
| 3127-3168 | **TigerScale module init** — wires panel, health tick, card delegation into `IoT/tigerscale` | `initTigerScale(` |
| 3169-3276 | API key 6 + eye-toggle / copy-button factories | `getOrCreateApiKey6`, `makeEyeToggle`, `makeCopyBtn` |
| 3277-3395 | **Edit account modal** + account colour save | `openEditAccountModal`, `saveColorToFirestore` |
| 3396-3541 | **Custom avatar menu** (Discord-style edit flow entry) + display-name save | `_toggleAvatarMenu`, `saveDisplayName` |

---

## Login + accounts persistence (L7526-7870)
| L | What | Anchors |
|---|---|---|
| 3542-3761 | **Login modal** (Firebase) — Google sign-in, email/password sign-in + create flow, forgot password | `lmSetMode`, `openAddAccountModal` |
| 3762-3787 | LocalStorage accounts helpers; inventory cache save; legacy API-key account wipe | `getAccounts`, `activeAccount`, `runMigration` |
| 3788-3856 | Per-account `firebase.app(uid).auth().signOut()` | `fbSignOut` |

---

## Data migrations (L7960-8501)
| L | What | Anchors |
|---|---|---|
| 3857-3881 | Decimal spoolId detection + hex conversion — imported from `uid-repair.js` (pure, padded to whole bytes, tested by `scripts/test-uid-repair.mjs`) | `isDecimalSpoolId`, `decimalSpoolIdToHex` |
| 3882-4055 | **Rack-shape migration** — flat fields → nested `rack` object (consent modal + lock-screen sweep) | `maybeMigrateFlatRackToNested`, `drainRackMigrationQueue` |
| 4056-4347 | **UID format migration** — decimal big-endian → hex uppercase (consent modal, progress, queue) | `maybeMigrateDecimalSpoolIds`, `drainUidMigrationQueue`, `migrateOneSpoolDecimalToHex` |
| 7483-7538 | **Truncated NTAG id repair** (issue #146) — silent, idempotent re-key `4…` (13) → `04…` (14), twin pointers, uidMigrationMap; plan = `planTruncatedUidRepair` (uid-repair.js) | `maybeRepairTruncatedSpoolIds`, `repairTruncatedSpoolIds` |

---

## Inventory subscription + auth + account list (L8572-9239)
| L | What | Anchors |
|---|---|---|
| 4348-4456 | **Firestore inventory subscription** — `onSnapshot` with friend-view defense-in-depth | `subscribeInventory`, `unsubscribeInventory` |
| 4457-4600 | **Auth orchestration** — signed-in fast path (cache paint → subs → user doc), named auth setup | `handleSignedIn`, `setupNamedAuth`, `initAuth` |
| 4601-4749 | Account list render + switch + delete | `renderAccountList`, `switchAccountUI`, `deleteAccountUI` |

---

## Stats / twins / filters (L9283-9805)
| L | What | Anchors |
|---|---|---|
| 4750-4798 | Key status, row sort, load action, **stats** | `renderStats`, `loadInventory` |
| 4799-4969 | **Twin auto-link by timestamp** (2 s window) + manual pairing repair | `autoLinkTwinsByTimestamp`, `findTwinCandidates`, `linkTwinPair`, `unlinkTwinPair` |
| 4970-5066 | Sort + search/filter pipeline + quick-filter dropdowns | `sortRows`, `filteredRows`, `populateQuickFilters` |

---

## Inventory render (L10214-15036)
| L | What | Anchors |
|---|---|---|
| 5067-5281 | **`renderInventory()`** — welcome card, rack-view priority, table/grid dispatch | `renderInventory` |
| 5282-5477 | Filter application + colour/thumbnail helpers + image pre-cache | `applyInventoryFilter`, `colorBg`, `thumbHTML`, `preCacheImages` |
| 5589-5649 | **Identical-spool grouping (view-only)** — group key + render-item builder, expanded-keys set. Table only in Phase 1 (Grid = Phase 2) | `_spoolGroupKey`, `groupRows` |
| 5649-5980 | **Keyed-diff render** — row signature, create/update grid card + table row + group header row (no full rebuild) | `_rowSignature`, `_createGridCard`, `_updateGridCard`, `renderGrid`, `_groupHeaderInnerHTML`, `_toggleGroupExpanded`, `renderTable` |
| 5980-6201 | View mode toggle (persisted), group toggle, search clear, filter change, stat-tile quick filter, sort indicators | `setViewMode`, `updateSortIndicators` |
| ~7016-7137 | **Lists / wishlists — Firestore subscriptions + CRUD** — personal lists (`subscribeLists`) and friend lists (read-only, `subscribeFriendLists`); in-memory array + create/add/remove | `subscribeLists`, `unsubscribeLists`, `subscribeFriendLists`, `unsubscribeFriendLists`, `_listsArray`, `_createList`, `_addToList`, `_removeFromList` |

---

## RFID encode / burn modal — cem (L15075-15613)
| L | What | Anchors |
|---|---|---|
| 5893-5983 | **`_burnRfid(r)`** — writes a chip from a row | `_burnRfid` |
| 5984-6128 | Encode modal lifecycle — targets present, blank check, render, presence change | `openEncodeModal`, `_cemBlankCheck`, `_cemRender` |
| 6129-6220 | Burn start + post-burn cloud migration | `_cemStartBurn`, `_cemMigrate` |

---

## TigerTag+ catalogue (L15675-18476)
| L | What | Anchors |
|---|---|---|
| 11022-11115 | Refresh API data for a spool | `_refreshApiData` |
| 11116-11143 | **Catalogue payload → doc fields** — the ONE `product/get` mapping, shared by the conversion and the TigerData+ creation | `_productApiFields` |
| 11144-11190 | TigerTag+ product lookup (validate an id, preview) | `_lookupPlusProduct` |
| 11191-11220 | **Convert TigerTag → TigerTag+** (sets `id_tigertag` to the TigerTag+ id) | `_convertToPlus` |
| 11221-11314 | **Catalogue browser** — import-all-once cache (localStorage) + sync | `_catalogLoadCache`, `_catalogBuildIndex`, `_catalogSync` |
| 11315-11409 | In-memory search engine + incremental (chunked) row render | `_catalogSearch`, `_catalogRenderChunk`, `_catalogRowHTML` |
| 11410-11467 | Catalogue **names → reference-DB ids** (best-effort) + colour parsing | `_catByName`, `_catMaterialId`, `_catHexToRgba`, `_catChiplessNonce` |
| 11468-11589 | **Create a TigerData+** from a product — canonical chip schema, `id_product` set, chipless nonce kept | `_catalogCreate` |
| 11590-11626 | Catalogue modal open/close | `openCatalogModal`, `closeCatalogModal` |
| 15232-15291 | **Catalogue pick** side card — "From the catalogue" of the new-chip window (rfid_protocol/linked): brand + `_catalogFilter`, one tap → `_catalogCreate(id, { msgEl })` | `openCatalogPick`, `closeCatalogPick`, `_catalogPickFill` |
| 11769-11803 | **Search views** — the catalogue as a grid/table view segment (`catalogGrid` / `catalogTable`); own hits + selection, driven by the MAIN search bar | `renderCatalogView`, `_catViewHeadHTML` |
| 11804-11885 | Filters at parity with the public catalogue page — Type · Brand · Material · Series (brand-scoped) · Sort, options carrying counts (rebuilt only when the index / language / brand changes); sort = cached rank per sort key | `CAT_SORTS`, `_catSortRank`, `_catViewFillFacets`, `_catViewSearch` |
| ~13612-13702 | **Catalogue multi-select** — `state.selectedCatalog` + the shared bulk bar (catalogue context in _bulkCtx: ★ / 🛒 / Add to a list, no delete); ids resolved to product rows through the product-card detail cache, 6 at a time, capped at `CAT_BULK_MAX` | `_catBulkClick`, `_catResolveRow`, `_catResolveRows`, `_catSelectedRows` |
| 11816-11893 | Search-view card / row markup; table = chunked append (IntersectionObserver), grid = virtualised window (only visible rows ± 4, padding stands in for the rest) | `_catViewCardHTML`, `_catViewRowHTML`, `_catViewRenderChunk`, `_catViewGridRender` |
| 11894-11939 | Search-view selection + action bar (select ≠ create) | `_catViewSelect`, `_catViewSyncBar` |
| 11627-11782 | Duplicate spool as cloud doc | `duplicateSpoolAsCloud` |
| ~9766-9946 | **Lists / wishlists — UI** — products view (favourites/order tab) + "Add to list" popover menu (one product or a bulk selection, written in one arrayUnion by _addManyToList) | `renderProductsView`, `renderListsView`, `_openAddToListMenu` |
| ~10211 | Message inline edit | `startMessageInlineEdit` |

---

## Spool detail panel (L18557-25032)
| L | What | Anchors |
|---|---|---|
| 6529-6682 | Structural signature (patch vs rebuild), weight patch, saved check | `_detailStructuralSig`, `_patchDetailWeight` |
| 6683-7296 | **`openDetail(spoolId)`** / close / refresh + usage telemetry | `openDetail`, `closeDetail`, `refreshOpenDetail`, `_recordUsage` |
| 21358-21388 | The values a spool link proposes (weight, note): held banner on the spool card, saved in one gesture | `_linkValuesBannerHTML`, `_saveLinkValues` |
| 7347-7409 | **Twin-link picker modal** | `openTwinLinkPicker` |
| 7410-7421 | Ecosystem window — one fixed-grid window, a sheet per device (TigerPOD Mini, TigerScale, TigerSpool, Tiger Touch, NFC Connect, TigerTag) | `ECO_SHEETS`, `openEcoSheet`, `_renderEcoSheet`, `_ecoStep`, `openTigerPodModal` |
| 7422-7477 | **Container picker modal** (46 containers from `data/container_spool/spools_filament.json`) | `openContainerPicker`, `doContainerUpdate` |
| ~19196-19266 | **Video player — the ONE builder** for the spool detail + product card: `parseVideoUrl` (file / YouTube / Google Drive / external), `_productVideosHTML` (chip video + playable attachments, deduped) → `_videoSectionHTML` (inline `<video>`, or poster → in-place iframe on click) | `parseVideoUrl`, `_isPlayableVideo`, `_productVideosHTML`, `_videoSectionHTML` |
| ~19889-20037 | **Inventory → .xlsx** (Settings → Data): a real spreadsheet written with no library — ZIP of XML parts stored uncompressed, columns sized from the data, frozen header + filters, text as strings, numbers and dates typed | `_exportInventoryXlsx`, `_xlsxCells`, `_xlsxSheet`, `_zipStore` |
| ~8143 | **Tags / Balises** — free-form labels, entity-agnostic Shopify-style editor (chips + inline dropdown + "Add tags" modal) driven by a `ctx` (`getTags`/`writeTags`/`allTags`/`readOnly`/`ids`). Two providers: `_spoolTagCtx` (spools, twin-mirrored write) and `_printerTagCtx` (printers, savePrinterField). Spool editor in buildPanelHTML+openDetail; printer editor in renderPrinterDetail (`#ppTag*`, tags-only echo patches chips in place via a structural-signature guard) | `_normalizeTag`, `_allTags`, `_allPrinterTags`, `_writeSpoolTags`, `_writePrinterTags`, `_ctxAddTag`, `_ctxRemoveTag`, `_wireTagEditor`, `openTagsModal` |
| 7519-8209 | **`buildPanelHTML(r)`** — header, colours, print settings, weight slider w/ debounce, storage row, tags, links, container, toolbox, raw JSON | `buildPanelHTML` |
| 8210-8268 | **Weight update** (direct / raw-scale modes, twin propagation) | `doWeightUpdate` |

---

## Panels / debug / auto-update (L25044-26513)
| L | What | Anchors |
|---|---|---|
| 8269-8342 | Resizable panels (detail + debug) — drag handle, persisted width | `makePanelResizable`, `openDebug` |
| 8343-8419 | Product ID help modal | |
| 8420-8506 | Settings → About → auto-update toggle + "Check for updates now" | `readAutoUpdatePref`, `showUpdateStatus` |
| 8507-8662 | **Hard delete** (`batch.delete` doc + twin), container auto-assign on snapshot, legacy tombstone purge | `markSpoolDeleted`, `resolveContainerForBrand`, `autoAssignMissingContainers`, `purgeLegacyTombstones` |
| 8663-8743 | **Firebase Explorer** — dedicated side card (`#fseExplorerPanel`, opened by `openFsExplorer`, mutually exclusive with the API-only debug panel). Breadcrumb nav + clickable doc-id drill-down + collection/doc render | `fseInit`, `fseFetch`, `fseNavigate`, `fseRenderCrumbs`, `openFsExplorer` |
| 8744-8780 | Account language save + debug mode apply | `saveAccountLang`, `applyDebugMode` |

---

## Friends rendering (L26511-27194)
| L | What | Anchors |
|---|---|---|
| 8781-8865 | Sidebar friends quick-list + hover tooltip | `renderSidebarFriends`, `showSbFriendTip` |
| 8866-8982 | Friends list render + avatar colour helpers | `renderFriendsList`, `friendColor`, `readableTextOn` |
| 8983-9076 | Friends list load (profile fetch) + cache hydration | `loadFriendsList`, `_hydrateFriendsCache` |

---

## Racks + printers subscriptions (L27272-27551)
| L | What | Anchors |
|---|---|---|
| 9077-9119 | Racks subscription | `subscribeRacks`, `unsubscribeRacks` |
| 9120-9283 | **3D printers subscription** — per-brand subcollections (`users/{uid}/printers/{brand}/devices`) | `subscribePrinters`, `unsubscribePrinters` |

*(Scales subscription moved to `IoT/tigerscale/index.js`.)*

---

## Printers views (L27665-31635)
| L | What | Anchors |
|---|---|---|
| 9284-9454 | **Job status helpers** + surgical grid patches (job card, online badge, grid signature) | `_getPrinterJob`, `_patchGridJobs`, `_jobCardHtml`, `_isPrinterOnline`, `_patchGridStatus` |
| 9455-9624 | **Grid view** — auto-connect all brands, online/offline partition, cards | `renderPrintersView` |
| 9625-9747 | **Table view** — sortable columns, row click → sidecard | `_renderPrinterTable` |
| 9748-10010 | **Cam wall view** — patch mode, card sizes, detached cam window serializer | `_renderPrinterCam`, `_patchCamWall`, `_serializeCamerasForDetach` |
| 10011-10208 | Printer + cam-wall drag-drop reordering (writes `sortIndex`) | `wirePrinterDnd`, `wireCamWallDnd`, `persistPrinterSortIndices` |
| 23554-23691 | **The board's objects** — one `data-board-id` addresses a machine (`brand:id`), one of its units (`unit:…`) or its units as one widget (`units:…`); position/z read + saved through the same three functions | `_boardObj`, `boardPos`, `boardZ`, `boardSave`, `saveUnitPlanPos`, `savePrinterPlanPos` |
| 23692-23781 | **Clusters** — several board objects bound together for good. The id lives on the members beside the coordinates it binds (`planCluster` / `unitsPlanCluster` / `units.{id}.planPrintersCluster`), so no new collection, no rules block, and deleting a machine takes its membership with it | `_newClusterId`, `_printerBoardIds`, `clusterOf`, `clusterMembers`, `saveBoardCluster` |
| 23840-24002 | **Plan layout** — places every object at its own coordinates, adopts orphans, compacts z to 1..N, sizes the board, then draws one outline per cluster | `layoutPrintersPlan`, `seedPrinterPlan`, `_drawClusterHulls` |
| 24032-24300 | **Selection + drag** — a `Set` of board ids; selecting any member of a cluster expands to the whole of it in `_syncPlanSelection`, so the drag carries clusters without knowing they exist | `_syncPlanSelection`, `_expandPlanSelToClusters`, `_clearPlanSelection`, `wirePrinterMarquee`, `wirePrinterPlanDrag` |
| 24300-24410 | **The board's right-click menu** — group / ungroup the selection; the kebab menu's own component, dropped from the cursor | `openPlanContextMenu`, `closePlanContextMenu`, `wirePlanClusterMenu` |

---

## Printer detail side panel (L31691-34574)
| L | What | Anchors |
|---|---|---|
| 10209-10771 | Open/close lifecycle (connect/disconnect per brand), conn button, refresh | `openPrinterDetail`, `closePrinterDetail`, `refreshOpenPrinterDetail` |
| 10772-10782 | **`renderCamBanner(p)`** — dispatch to per-brand `widget_camera.js` (never builds camera HTML inline) | `renderCamBanner` |
| 10783-11872 | **`renderPrinterDetail()`** — hero + camera banner + status + per-brand live block + control cards + log | `renderPrinterDetail` |
| 11873-11984 | Inline edit for printer name / IP / port (pencil, Enter/Escape) + field persist | `startInlineEdit`, `savePrinterField` |

---

## Add-printer flow (L34648-35371)
Per-brand scan/manual flows live in `printers/<brand>/add-flow.js`; `inventory.js` owns the shell.

| L | What | Anchors |
|---|---|---|
| 11985-12083 | **Brand picker modal** — dispatches to per-brand add-flow | `openPrinterBrandPicker` |
| 31497-31546 | **Demo printers** (debug mode) — section of the brand picker, one-click add of a simulated printer (`docs/DEMO-MODE.md`); `syncDemoPrinters` (printers/demo-badge.js) runs on every printer-list snapshot | `_renderDemoPrinterRows`, `addDemoPrinter` |
| 12084-12165 | Add/edit printer form | `openPrinterAddForm`, `closePrinterAddForm` |
| 12166-12417 | Tutorial image bottom-sheet + **multi-step connection tutorial** | `openTutoSheet`, `openPrinterTutorial`, `_ptRenderStep` |
| 12418-12547 | **`submitPrinterAdd()`** — ADD (auto-id) vs EDIT (preserve id/isActive/sortIndex) | `submitPrinterAdd` |

---

## Racks CRUD + slots (L35714-38081)
| L | What | Anchors |
|---|---|---|
| 12548-12713 | Rack create / update / delete / empty + orphan ref cleanup | `createRack`, `updateRack`, `deleteRack`, `emptyRack` |
| 12714-12850 | Empty-rack cascade, twin resolver, slot assign/unassign, slot fill HTML | `playEmptyRackCascade`, `assignSpoolToSlot`, `unassignSpool`, `findSpoolInSlot` |
| 12851-12931 | **Slot locking** — right-click toggle, lock/unlock all, kebab menu positioning | `isSlotLocked`, `toggleSlotLock`, `positionRackMenu` |
| 12932-13158 | **Auto-fill / auto-store / auto-unstore** + search dim + unranked helpers | `autoFillEmptySlots`, `maybeAutoStoreUnrankedSpools`, `applyRackSearchDim`, `getUnrackedSpools` |
| 13200-13329 | **Skyline-packing masonry** layout + relayout scheduler + rack reorder | `layoutRacksMasonry`, `reorderRacks` |
| 13330-13441 | **Rich hover tooltip** for filled slots (mini puck preview) | `buildRackTooltipHTML`, `wireRackTooltipDelegation` |

---

## Storage view render + DnD (L38276-39860)
| L | What | Anchors |
|---|---|---|
| 13442-14087 | **`renderRackView()`** — biggest function in the file: stats bar + filter chips, two-column layout, masonry, kebab menus, live search, read-only friend mode, rack reorder DnD | `renderRackView` |
| 14088-14305 | Drag sources (slot puck / unranked row) + drop targets + **drop-to-void unassign** | `wireDragSources`, `wireDropTargets`, `clearOtherDropHighlights` |
| 14306-14327 | Unrank cascade animation | `playUnrankAnimation` |
| 14328-14531 | **Rack create/edit modal** — name, presets, rows×columns, delete confirm, field errors | `openRackEditModal`, `renderRackPresets`, `confirmDeleteRack` |

---

## Friend view (L39989-40914)
| L | What | Anchors |
|---|---|---|
| 14532-14613 | Friend inventory open/close (one-shot read, no live updates) | `openFriendInventory`, `closeFriendInventory` |
| 14614-14807 | **Friend banner** + switch to friend view (own inventory/racks listeners stay alive, parked in `_ownStash`; last friends in `_friendCache`, fresh 3 min = no read) / switch back (restores the stash, no re-read) | `renderFriendBanner`, `switchToFriendView`, `switchBackToOwnView`, `prewarmAuthToken` |
| 14808-14862 | Friends section in dropdown + incoming request modal queue | `renderFriendsSection`, `showFriendRequestModal` |
| 14863-15000 | **Add-friend modal** — split XXX-XXX field, live preview lookup | `openAddFriendModal`, `_adfChanged` |
| 40770-40894 | **Deep links** — friend (`tigertag://friend/`, web `?friend=`) pre-fills the add-friend modal; **spool links** (`tigertag://spool/<id>`, web `?spool=&weight=&note=`, a `qr.tigertag.io` link pasted in the search; parsed by `qr-link.js`) open the spool for its owner (inventory → `uidMigrationMap` → another account of the device); the link's values wait on the held linkValuesBanner of the spool card (see the detail panel) | `_handleFriendDeepLink`, `_spoolLinkArrived`, `_openSpoolLink`, `_handleSpoolDeepLink` |

---

## Display name + friend requests (L41118-42536)
| L | What | Anchors |
|---|---|---|
| 15001-15044 | **Display-name setup modal** (first-login pseudo picker) | `openDisplayNameSetup` |
| 15045-15136 | Friend requests subscription + badge + accept/refuse/block/remove (bidirectional batch writes) | `subscribeFriendRequests`, `acceptFriendRequest`, `removeFriend` |
| 15137-15197 | Blacklist load / unblock / render | `loadBlacklist`, `renderBlacklist` |

---

## Keys + profile sync (L42524-42656)
| L | What | Anchors |
|---|---|---|
| 15198-15242 | **`claimPublicKey(uid, oldKey)`** atomic transaction (10 retries) + regenerate + send friend request | `claimPublicKey`, `sendFriendRequest` |
| 15267-15317 | Key generators (`XXX-XXX`, 40-char hex) + `userProfiles/{uid}` sync | `generatePublicKey`, `generatePrivateKey`, `syncUserProfile` |

---

## Custom avatar (L42787-43135)
| L | What | Anchors |
|---|---|---|
| 15805-15979 | File pick, image decode, alpha detection, resize to blob, upload, remove | `uploadCustomAvatar`, `removeCustomAvatar` |
| 15980-16165 | **Discord-style cropper** — crop / zoom / rotate + cropped upload | `openAvatarCropper`, `uploadCroppedAvatar` |

---

## User doc sync + telemetry + bootstrap (L43102-44588)
| L | What | Anchors |
|---|---|---|
| 16458-16873 | **`syncUserDoc(uid)`** — displayName/roles/Debug/keys/isPublic + **client telemetry** (studio* fields + `telemetry/studio` aggregates, fire-and-forget) | `syncUserDoc`, `hydrateUserDocCache` |
| ~18566-18646 | **RFID chip list + tag+ backup** — `users/{uid}/rfidList/{UID_HEX}` upsert (firstSeen once-stamped; tag+ signature backup write-once = TigerTag+ indicator). Dedup via inventory-doc `rfidListed`/`rfidBackup` booleans (no in-memory index). Census once per account on first inventory snapshot; backup on auto-scan | `censusRfidListFromInventory`, `recordRfidChipScan` |
| 16874-16906 | Language sync from Firestore + `applyLang(lang)` | `syncLangFromFirestore`, `applyLang` |
| 16907-16922 | **Init bootstrap** — loadLocales → applyTranslations → loadLookups → loadImgMap → runMigration → initAuth → signalFirstPaint | grep "loadLocales().then" |

---

## Electron RFID integration (L44638-45046)
| L | What | Anchors |
|---|---|---|
| 30476-30563 | Reader indicator (topbar), reader connect/disconnect, card present/removed badge | `renderRfidReaderBadges` |
| 30564-30595 | Dual-scan buffer (2 readers / 1.5 s) | `_flushRfidScans` |
| 30596-30728 | **Main NFC scan processor** | `_processNfcScans` |
| 30729-30838 | **Build and write one chip document** to Firestore (API fields only for TigerTag+) | `_writeChipDoc` |
| 30839-30899 | Auto-update status stream | |
| 30900-30901 | TD1S engine moved to `IoT/td1s/index.js` (closing comment) | |

---

## Local MCP server — tools + Settings card (L45059-45705)
| L | What | Anchors |
|---|---|---|
| 38105-38565 | **Read-only MCP tools** + whole-account read (`data_guide` notice, decoder, `firestore_get` / `firestore_query`, friends, wishlists, history, devices; credential masking `MCP_SECRET_FIELD`, scope `_mcpCheckPath`) — definitions (`search_inventory`, `get_spool`, `inventory_summary`, `list_racks`, `list_printers`), row serialiser, handlers, `mcp:call` → `mcp:result` relay. Server itself: `services/mcpServer.js` | `MCP_TOOLS`, `MCP_HANDLERS`, `_mcpRows`, `_mcpSpool` |
| 38565-38605 | My profile › AI assistants — per-profile toggle, ⓘ, Claude / Cursor / VS Code tiles, Claude Code copy, new key; follows the signed-in account | `wireMcpProfile`, `_mcpSyncAccount`, `_mcpSettingsRefresh` |
| 39028-39107 | My profile › AI assistants › online — hosted connector (Tiger Hub `mcp.tigersystem.io`): address + Copy, guide link, connected online assistants list (`mcp-grants` via main) with hold-to-cut | `wireMcpHosted`, `_mcpGrantsRefresh`, `MCP_HOSTED_GUIDE` |

## "Find X by feature" cookbook

Most common navigation tasks → grep these anchors first:

| You want to … | Grep / open |
|---|---|
| Add or change an i18n key | `function t` L572; *use `npm run i18n:add` for the actual write* |
| Touch the spool detail panel | `buildPanelHTML` L8568, `openDetail` L7752 |
| Touch the weight slider / weight save | `doWeightUpdate` L9299, `_patchDetailWeight` L7661 |
| Touch the Add Product panel | `openAddProductPanel` L2231, `saveAddProduct` L2417 |
| Touch the RFID encode/burn modal | `openEncodeModal` L6962, `_cemStartBurn` L7107 |
| Touch a modal | Twin link L8396, Container L8471, Rack edit L15987, Login L3586, Edit account L3301 |
| Touch the storage view | `renderRackView` L15108 — biggest function in the file |
| Touch rack drag-drop | `wireDragSources` L15748, `wireDropTargets` L15813, drop-to-void L15900 |
| Touch the printers grid / table / cam wall | `renderPrintersView` L10501, `_renderPrinterTable` L10670, `_renderPrinterCam` L10835 |
| Touch the printer detail card | `renderPrinterDetail` L11828, `openPrinterDetail` L11254 |
| Touch a printer brand integration (WS/MQTT/HTTP, live block, filament edit) | `printers/<brand>/index.js` — NOT in this file |
| Touch the Anycubic MQTT layer (LAN + cloud) | `acuConnect` in `printers/anycubic/index.js` (+ `anycubic:*` IPC in main.js) |
| Touch the Anycubic live block / ACE card | `renderAnycubicLiveInner`, `renderAcuFilamentCard` |
| Touch a printer camera banner | `printers/<brand>/widget_camera.js`; dispatch at `renderCamBanner` L11817 |
| Touch the Add-printer scan flow | `printers/<brand>/add-flow.js`; shell at `openPrinterBrandPicker` L13033 |
| Touch the printer tutorials | `openPrinterTutorial` L13360 |
| Touch the TigerScale panel | `IoT/tigerscale/index.js`; init wiring at L3151 |
| Touch the TD1S sensor / TD-Color edit modals | `IoT/td1s/index.js` + `edit-modals.js` |
| Touch the Friends system | lists L9825, friend view L16191, requests L16702 |
| Touch the custom avatar / cropper | `openAvatarCropper` L17159, `uploadCustomAvatar` L17083 |
| Touch the auth flow | `handleSignedIn` L4508, `initAuth` L4641, login modal L3586 |
| Touch the Firestore subscriptions | inventory L4395, racks L10121, printers L10165, friend reqs L16702 |
| Touch the telemetry | `syncUserDoc` L17359 (studio* fields), `_recordUsage` L8346 |
| Touch the auto-update banner | L9509 |
| Touch the diagnostic / report-problem modal | `reportError` L721, `openDiagnosticModal` L822 |

---

## Notes for AI assistants

- **State** is at L509. Read it first when reasoning about anything cross-cutting.
- **ES module**: `inventory.js` imports printer brands, IoT modules and the RFID tester at L1-259. Brand modules receive `state`/`t`/`$` through `printers/context.js` (`ctx`).
- **Selectors**: `$` is `document.getElementById`. Many DOM nodes have IDs matching the section (e.g. `#detailPanel`, `#friendsPanel`).
- **i18n**: 11 locales (en/fr/de/es/it/zh/pt/pt-pt/pl/ru/nl) under `renderer/locales/`. Never hand-edit — use `npm run i18n:add`. The `npm run i18n:check` pre-commit hook blocks drift.
- **CSS**: 10 themed files under `renderer/css/` (`00-base.css` → `70-detail-misc.css`, plus `55-creality.css` and `57-elegoo.css`). When this file references a UI section, the styles live in the matching CSS module.
- **Per-brand camera widgets**: each printer folder has a `widget_camera.js` that owns all camera HTML + lifecycle. `inventory.js` calls `renderCamBanner(p)` (L11817) which dispatches — it never builds camera HTML inline. To add a brand: create `printers/<brand>/widget_camera.js`, export `render<Brand>CamBanner(p)`, add a case in `renderCamBanner`, CSS in `renderer/css/5X-<brand>.css`.
- **Line numbers drift** — if a range looks wrong, grep the anchor name. `npm run codemap:check` catches major drift at commit time.
