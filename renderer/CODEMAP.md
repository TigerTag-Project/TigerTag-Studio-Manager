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
L1396-3414     Add Product panel (ADP) — color/brand/material sheets, chip schema, save
L3210-3921     Settings + Friends open/close, TigerScale init, edit-account modal
L3717-4294     Login modal + localStorage accounts + sign-out + legacy migration
L4091-4805     Data migrations (decimal UID → hex, flat rack → nested)
L4595-6210     Firestore inventory subscription + auth orchestration + account list
L6003-6546     Stats, twin auto-link / manual pairing, sort + quick filters
L6339-7380     Inventory render — table/grid keyed-diff, view mode, search
L7170-7795     RFID encode/burn modal (cem)
L7588-8123     TigerTag+ catalogue refresh / convert / duplicate
L7896-9982     Spool detail panel (openDetail, buildPanelHTML, weight update)
L9730-10224     Resizable panels, debug panel, auto-update settings
L10017-10336     Hard delete + container auto-assign + legacy tombstone purge
L10128-10454     Firestore explorer + language save + debug mode
L10246-10752     Friends sidebar quick-list + friends list render
L10543-11250     Racks + printers Firestore subscriptions (+ live friends/notifs)
L11043-12341    Printers views — grid / table / cam wall + drag-drop
L12134-14631   Printer detail side panel (renderPrinterDetail) + inline edit
L14415-15731   Add-printer flow (brand picker, form, tutorials, submit)
L15672-16628   Racks CRUD + slots + locking + auto-fill + masonry + tooltip
L16569-17737   renderRackView + rack drag-drop + rack edit modal
L17678-18226   Friend view + add-friend modal
L18167-18954   Display-name setup + friend requests + blacklist
L18895-19213   Public/private keys + user profile sync
L19154-19522   Custom avatar upload + Discord-style cropper
L19459-20189   syncUserDoc + session telemetry + language sync
L20125-20205   Init bootstrap (loadLocales → loadLookups → runMigration → initAuth)
L20141-20561   Electron RFID integration (readers, dual-scan, NFC processor, chip write)
```

---

## Extracted modules (NOT in inventory.js)

| Module | What | Key exports |
|---|---|---|
| `quests/squad-rankings.js` | TigerSquad → Rankings view (display only): hero with the account's league card, My rank (national / world rank, next rival), Community pulse (publicStats/community + daily history, SVG sparklines), the three leagues with medals and View all. Data from the server board (`squadBoard/*`, `squadRank/{uid}`, backend squadBoard.js), never the member list. Host side: `_loadSquadPulse`, `_squadRankCtx`, `_loadSquadBoard`, `_squadMemberOf`, inline `_openSquadBoard` | `squadHeroHtml`, `squadRankingsHtml`, `toggleLeague` |
| `quests/index.js` + `quests.css` | Tiger Quests (docs/QUESTS.md): batched counters/gauges to `telemetry/studio.quest`, `dailyQuest` check-in (launch, focus, local midnight), live `quests/{daily,journey}`, the Quests views of the main area (`renderQuestsView`, view modes questsToday / questsJourney), celebrations. Host side: `_renderQuestPill`, `_renderProgressChips` (view-bar chips), `_isProgressMode`, `_renderSquadView` (TigerSquad view = `_openSquadBoard(tab, host)` inline), `_questGauges`, `_questPrintEdges` | `initQuests`, `questsSignIn`, `questBump`, `questGauge`, `openQuests` |
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

## Foundation (L170-2003)
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

## Data layer (L1963-2201)
| L | What | Anchors |
|---|---|---|
| 984-992 | `tsToMs()` — Firestore Timestamp → ms (accepts `number`, `Timestamp`, `{_seconds}`) | `tsToMs` |
| 993-1083 | **`normalizeRow(spoolId, data)`** — Firestore doc → flat row used by every view | `normalizeRow` |
| 1084-1113 | Health icon driven by Firestore `metadata.fromCache` | `setHealthLive`, `setHealthOffline`, `setHealthIdle` |

---

## Account dropdown + sidebar states (L2190-2461)
| L | What | Anchors |
|---|---|---|
| 1114-1210 | Connected vs no-account UI states | `setConnected`, `setDisconnected` |
| 1211-1319 | **Account dropdown** (avatar click) — connected accounts, manage profiles, friends section, add friend | `openAccountDropdown`, `renderAccountDropdown` |
| 1320-1360 | Profiles modal | `openProfilesModal` |

---

## Add Product panel — ADP (L2475-3999)
Manual spool creation: full chip-schema editor with bottom-sheets. All helpers prefixed `_adp`.

| L | What | Anchors |
|---|---|---|
| 1361-1456 | Field helpers — cloud id, grams conversion, color presets render | `_adpCloudId`, `_adpToGrams`, `_adpRenderColorPresets` |
| 1457-1650 | **Color sheet + custom colour picker** (HSV math, drag) | `openAdpColorSheet`, `openAdpColorCustomSheet`, `_adpCcRender` |
| 1651-1760 | **Brand bottom-sheet** with favourites | `openAdpBrandSheet`, `_adpRenderBrandList`, `_adpToggleFavBrand` |
| 1761-1861 | **Material bottom-sheet** (mirror of Brand) | `openAdpMaterialSheet`, `_adpRenderMaterialList` |
| 1862-2254 | Multi-colour state, 28-byte colour-name limit, material defaults, RFID preview | `_adpSetColorMode`, `_adpApplyMaterialDefaults`, `_adpRefreshRfidPreview` |
| 2255-2440 | **Panel open/close** | `openAddProductPanel`, `closeAddProductPanel` |
| 2441-2639 | **`saveAddProduct()`** — canonical chip schema (identity, RGBA colours, firmware slots, measure, TD, timestamps) → Firestore write | `saveAddProduct` |
| 2640-3132 | Sheet/search DOM wiring (click delegation, integer-only fields, Escape cascade) | `_adpCloseAllSheetsAndPanel` |

---

## Settings / Friends / Account modals (L4457-7490)
| L | What | Anchors |
|---|---|---|
| 3133-3160 | Settings panel open/close | `openSettings`, `closeSettings` |
| 3161-3174 | Friends panel open/close (auto-generates publicKey first) | `openFriends`, `closeFriends` |
| 3175-3216 | **TigerScale module init** — wires panel, health tick, card delegation into `IoT/tigerscale` | `initTigerScale(` |
| 3217-3324 | API key 6 + eye-toggle / copy-button factories | `getOrCreateApiKey6`, `makeEyeToggle`, `makeCopyBtn` |
| 3325-3443 | **Edit account modal** + account colour save | `openEditAccountModal`, `saveColorToFirestore` |
| 3444-3589 | **Custom avatar menu** (Discord-style edit flow entry) + display-name save | `_toggleAvatarMenu`, `saveDisplayName` |

---

## Login + accounts persistence (L7532-7924)
| L | What | Anchors |
|---|---|---|
| 3590-3809 | **Login modal** (Firebase) — Google sign-in, email/password sign-in + create flow, forgot password | `lmSetMode`, `openAddAccountModal` |
| 3810-3835 | LocalStorage accounts helpers; inventory cache save; legacy API-key account wipe | `getAccounts`, `activeAccount`, `runMigration` |
| 3836-3904 | Per-account `firebase.app(uid).auth().signOut()` | `fbSignOut` |

---

## Data migrations (L7966-8555)
| L | What | Anchors |
|---|---|---|
| 3905-3929 | Decimal spoolId detection + hex conversion — imported from `uid-repair.js` (pure, padded to whole bytes, tested by `scripts/test-uid-repair.mjs`) | `isDecimalSpoolId`, `decimalSpoolIdToHex` |
| 3930-4103 | **Rack-shape migration** — flat fields → nested `rack` object (consent modal + lock-screen sweep) | `maybeMigrateFlatRackToNested`, `drainRackMigrationQueue` |
| 4104-4395 | **UID format migration** — decimal big-endian → hex uppercase (consent modal, progress, queue) | `maybeMigrateDecimalSpoolIds`, `drainUidMigrationQueue`, `migrateOneSpoolDecimalToHex` |
| 7537-7592 | **Truncated NTAG id repair** (issue #146) — silent, idempotent re-key `4…` (13) → `04…` (14), twin pointers, uidMigrationMap; plan = `planTruncatedUidRepair` (uid-repair.js) | `maybeRepairTruncatedSpoolIds`, `repairTruncatedSpoolIds` |

---

## Inventory subscription + auth + account list (L8578-9293)
| L | What | Anchors |
|---|---|---|
| 4396-4504 | **Firestore inventory subscription** — `onSnapshot` with friend-view defense-in-depth | `subscribeInventory`, `unsubscribeInventory` |
| 4505-4654 | **Auth orchestration** — signed-in fast path (cache paint → subs → user doc), named auth setup | `handleSignedIn`, `setupNamedAuth`, `initAuth` |
| 4655-4803 | Account list render + switch + delete | `renderAccountList`, `switchAccountUI`, `deleteAccountUI` |

---

## Stats / twins / filters (L9289-9859)
| L | What | Anchors |
|---|---|---|
| 4804-4852 | Key status, row sort, load action, **stats** | `renderStats`, `loadInventory` |
| 4853-5023 | **Twin auto-link by timestamp** (2 s window) + manual pairing repair | `autoLinkTwinsByTimestamp`, `findTwinCandidates`, `linkTwinPair`, `unlinkTwinPair` |
| 5024-5120 | Sort + search/filter pipeline + quick-filter dropdowns | `sortRows`, `filteredRows`, `populateQuickFilters` |

---

## Inventory render (L10220-15090)
| L | What | Anchors |
|---|---|---|
| 5121-5335 | **`renderInventory()`** — welcome card, rack-view priority, table/grid dispatch | `renderInventory` |
| 5336-5531 | Filter application + colour/thumbnail helpers + image pre-cache | `applyInventoryFilter`, `colorBg`, `thumbHTML`, `preCacheImages` |
| 5643-5703 | **Identical-spool grouping (view-only)** — group key + render-item builder, expanded-keys set. Table only in Phase 1 (Grid = Phase 2) | `_spoolGroupKey`, `groupRows` |
| 5703-6034 | **Keyed-diff render** — row signature, create/update grid card + table row + group header row (no full rebuild) | `_rowSignature`, `_createGridCard`, `_updateGridCard`, `renderGrid`, `_groupHeaderInnerHTML`, `_toggleGroupExpanded`, `renderTable` |
| 6034-6255 | View mode toggle (persisted), group toggle, search clear, filter change, stat-tile quick filter, sort indicators | `setViewMode`, `updateSortIndicators` |
| ~7070-7191 | **Lists / wishlists — Firestore subscriptions + CRUD** — personal lists (`subscribeLists`) and friend lists (read-only, `subscribeFriendLists`); in-memory array + create/add/remove | `subscribeLists`, `unsubscribeLists`, `subscribeFriendLists`, `unsubscribeFriendLists`, `_listsArray`, `_createList`, `_addToList`, `_removeFromList` |

---

## RFID encode / burn modal — cem (L15081-15667)
| L | What | Anchors |
|---|---|---|
| 5947-6037 | **`_burnRfid(r)`** — writes a chip from a row | `_burnRfid` |
| 6038-6182 | Encode modal lifecycle — targets present, blank check, render, presence change | `openEncodeModal`, `_cemBlankCheck`, `_cemRender` |
| 6183-6274 | Burn start + post-burn cloud migration | `_cemStartBurn`, `_cemMigrate` |

---

## TigerTag+ catalogue (L15681-18530)
| L | What | Anchors |
|---|---|---|
| 11076-11169 | Refresh API data for a spool | `_refreshApiData` |
| 11170-11197 | **Catalogue payload → doc fields** — the ONE `product/get` mapping, shared by the conversion and the TigerData+ creation | `_productApiFields` |
| 11198-11244 | TigerTag+ product lookup (validate an id, preview) | `_lookupPlusProduct` |
| 11245-11274 | **Convert TigerTag → TigerTag+** (sets `id_tigertag` to the TigerTag+ id) | `_convertToPlus` |
| 11275-11368 | **Catalogue browser** — import-all-once cache (localStorage) + sync | `_catalogLoadCache`, `_catalogBuildIndex`, `_catalogSync` |
| 11369-11463 | In-memory search engine + incremental (chunked) row render | `_catalogSearch`, `_catalogRenderChunk`, `_catalogRowHTML` |
| 11464-11521 | Catalogue **names → reference-DB ids** (best-effort) + colour parsing | `_catByName`, `_catMaterialId`, `_catHexToRgba`, `_catChiplessNonce` |
| 11522-11643 | **Create a TigerData+** from a product — canonical chip schema, `id_product` set, chipless nonce kept | `_catalogCreate` |
| 11644-11680 | Catalogue modal open/close | `openCatalogModal`, `closeCatalogModal` |
| 15286-15345 | **Catalogue pick** side card — "From the catalogue" of the new-chip window (rfid_protocol/linked): brand + `_catalogFilter`, one tap → `_catalogCreate(id, { msgEl })` | `openCatalogPick`, `closeCatalogPick`, `_catalogPickFill` |
| 11823-11857 | **Search views** — the catalogue as a grid/table view segment (`catalogGrid` / `catalogTable`); own hits + selection, driven by the MAIN search bar | `renderCatalogView`, `_catViewHeadHTML` |
| 11858-11939 | Filters at parity with the public catalogue page — Type · Brand · Material · Series (brand-scoped) · Sort, options carrying counts (rebuilt only when the index / language / brand changes); sort = cached rank per sort key | `CAT_SORTS`, `_catSortRank`, `_catViewFillFacets`, `_catViewSearch` |
| ~13666-13756 | **Catalogue multi-select** — `state.selectedCatalog` + the shared bulk bar (catalogue context in _bulkCtx: ★ / 🛒 / Add to a list, no delete); ids resolved to product rows through the product-card detail cache, 6 at a time, capped at `CAT_BULK_MAX` | `_catBulkClick`, `_catResolveRow`, `_catResolveRows`, `_catSelectedRows` |
| 11870-11947 | Search-view card / row markup; table = chunked append (IntersectionObserver), grid = virtualised window (only visible rows ± 4, padding stands in for the rest) | `_catViewCardHTML`, `_catViewRowHTML`, `_catViewRenderChunk`, `_catViewGridRender` |
| 11948-11993 | Search-view selection + action bar (select ≠ create) | `_catViewSelect`, `_catViewSyncBar` |
| 11681-11836 | Duplicate spool as cloud doc | `duplicateSpoolAsCloud` |
| ~9820-10000 | **Lists / wishlists — UI** — products view (favourites/order tab) + "Add to list" popover menu (one product or a bulk selection, written in one arrayUnion by _addManyToList) | `renderProductsView`, `renderListsView`, `_openAddToListMenu` |
| ~10265 | Message inline edit | `startMessageInlineEdit` |

---

## Spool detail panel (L18563-25300)
| L | What | Anchors |
|---|---|---|
| 6583-6736 | Structural signature (patch vs rebuild), weight patch, saved check | `_detailStructuralSig`, `_patchDetailWeight` |
| 6737-7350 | **`openDetail(spoolId)`** / close / refresh + usage telemetry | `openDetail`, `closeDetail`, `refreshOpenDetail`, `_recordUsage` |
| 21412-21442 | The values a spool link proposes (weight, note): held banner on the spool card, saved in one gesture | `_linkValuesBannerHTML`, `_saveLinkValues` |
| 7401-7463 | **Twin-link picker modal** | `openTwinLinkPicker` |
| 7464-7475 | Ecosystem window — one fixed-grid window, a sheet per device (TigerPOD Mini, TigerScale, TigerSpool, Tiger Touch, NFC Connect, TigerTag) | `ECO_SHEETS`, `openEcoSheet`, `_renderEcoSheet`, `_ecoStep`, `openTigerPodModal` |
| 7476-7531 | **Container picker modal** (46 containers from `data/container_spool/spools_filament.json`) | `openContainerPicker`, `doContainerUpdate` |
| ~19250-19320 | **Video player — the ONE builder** for the spool detail + product card: `parseVideoUrl` (file / YouTube / Google Drive / external), `_productVideosHTML` (chip video + playable attachments, deduped) → `_videoSectionHTML` (inline `<video>`, or poster → in-place iframe on click) | `parseVideoUrl`, `_isPlayableVideo`, `_productVideosHTML`, `_videoSectionHTML` |
| ~19900-20049 | **Inventory → .xlsx** (Settings → Data): a real spreadsheet written with no library — ZIP of XML parts stored uncompressed, columns sized from the data, frozen header + filters, text as strings, numbers and dates typed | `_exportInventoryXlsx`, `_xlsxCells`, `_xlsxSheet`, `_zipStore` |
| ~8197 | **Tags / Balises** — free-form labels, entity-agnostic Shopify-style editor (chips + inline dropdown + "Add tags" modal) driven by a `ctx` (`getTags`/`writeTags`/`allTags`/`readOnly`/`ids`). Two providers: `_spoolTagCtx` (spools, twin-mirrored write) and `_printerTagCtx` (printers, savePrinterField). Spool editor in buildPanelHTML+openDetail; printer editor in renderPrinterDetail (`#ppTag*`, tags-only echo patches chips in place via a structural-signature guard) | `_normalizeTag`, `_allTags`, `_allPrinterTags`, `_writeSpoolTags`, `_writePrinterTags`, `_ctxAddTag`, `_ctxRemoveTag`, `_wireTagEditor`, `openTagsModal` |
| 7573-8263 | **`buildPanelHTML(r)`** — header, colours, print settings, weight slider w/ debounce, storage row, tags, links, container, toolbox, raw JSON | `buildPanelHTML` |
| 8264-8322 | **Weight update** (direct / raw-scale modes, twin propagation) | `doWeightUpdate` |

---

## Panels / debug / auto-update (L25050-26760)
| L | What | Anchors |
|---|---|---|
| 8323-8396 | Resizable panels (detail + debug) — drag handle, persisted width | `makePanelResizable`, `openDebug` |
| 8397-8473 | Product ID help modal | |
| 8474-8560 | Settings → About → auto-update toggle + "Check for updates now" | `readAutoUpdatePref`, `showUpdateStatus` |
| 8561-8716 | **Hard delete** (`batch.delete` doc + twin), container auto-assign on snapshot, legacy tombstone purge | `markSpoolDeleted`, `resolveContainerForBrand`, `autoAssignMissingContainers`, `purgeLegacyTombstones` |
| 8717-8797 | **Firebase Explorer** — dedicated side card (`#fseExplorerPanel`, opened by `openFsExplorer`, mutually exclusive with the API-only debug panel). Breadcrumb nav + clickable doc-id drill-down + collection/doc render | `fseInit`, `fseFetch`, `fseNavigate`, `fseRenderCrumbs`, `openFsExplorer` |
| 8798-8834 | Account language save + debug mode apply | `saveAccountLang`, `applyDebugMode` |

---

## Friends rendering (L26517-27440)
| L | What | Anchors |
|---|---|---|
| 8835-8919 | Sidebar friends quick-list + hover tooltip | `renderSidebarFriends`, `showSbFriendTip` |
| 8920-9036 | Friends list render + avatar colour helpers | `renderFriendsList`, `friendColor`, `readableTextOn` |
| 9037-9130 | Friends list load (profile fetch) + cache hydration | `loadFriendsList`, `_hydrateFriendsCache` |

---

## Racks + printers subscriptions (L27278-27800)
| L | What | Anchors |
|---|---|---|
| 9131-9173 | Racks subscription | `subscribeRacks`, `unsubscribeRacks` |
| 9174-9337 | **3D printers subscription** — per-brand subcollections (`users/{uid}/printers/{brand}/devices`) | `subscribePrinters`, `unsubscribePrinters` |

*(Scales subscription moved to `IoT/tigerscale/index.js`.)*

---

## Printers views (L27671-31850)
| L | What | Anchors |
|---|---|---|
| 9338-9508 | **Job status helpers** + surgical grid patches (job card, online badge, grid signature) | `_getPrinterJob`, `_patchGridJobs`, `_jobCardHtml`, `_isPrinterOnline`, `_patchGridStatus` |
| 9509-9678 | **Grid view** — auto-connect all brands, online/offline partition, cards | `renderPrintersView` |
| 9679-9801 | **Table view** — sortable columns, row click → sidecard | `_renderPrinterTable` |
| 9802-10064 | **Cam wall view** — patch mode, card sizes, detached cam window serializer | `_renderPrinterCam`, `_patchCamWall`, `_serializeCamerasForDetach` |
| 10065-10262 | Printer + cam-wall drag-drop reordering (writes `sortIndex`) | `wirePrinterDnd`, `wireCamWallDnd`, `persistPrinterSortIndices` |
| 23608-23745 | **The board's objects** — one `data-board-id` addresses a machine (`brand:id`), one of its units (`unit:…`) or its units as one widget (`units:…`); position/z read + saved through the same three functions | `_boardObj`, `boardPos`, `boardZ`, `boardSave`, `saveUnitPlanPos`, `savePrinterPlanPos` |
| 23746-23835 | **Clusters** — several board objects bound together for good. The id lives on the members beside the coordinates it binds (`planCluster` / `unitsPlanCluster` / `units.{id}.planPrintersCluster`), so no new collection, no rules block, and deleting a machine takes its membership with it | `_newClusterId`, `_printerBoardIds`, `clusterOf`, `clusterMembers`, `saveBoardCluster` |
| 23894-24056 | **Plan layout** — places every object at its own coordinates, adopts orphans, compacts z to 1..N, sizes the board, then draws one outline per cluster | `layoutPrintersPlan`, `seedPrinterPlan`, `_drawClusterHulls` |
| 24086-24354 | **Selection + drag** — a `Set` of board ids; selecting any member of a cluster expands to the whole of it in `_syncPlanSelection`, so the drag carries clusters without knowing they exist | `_syncPlanSelection`, `_expandPlanSelToClusters`, `_clearPlanSelection`, `wirePrinterMarquee`, `wirePrinterPlanDrag` |
| 24354-24464 | **The board's right-click menu** — group / ungroup the selection; the kebab menu's own component, dropped from the cursor | `openPlanContextMenu`, `closePlanContextMenu`, `wirePlanClusterMenu` |

---

## Printer detail side panel (L31660-34800)
| L | What | Anchors |
|---|---|---|
| 10263-10825 | Open/close lifecycle (connect/disconnect per brand), conn button, refresh | `openPrinterDetail`, `closePrinterDetail`, `refreshOpenPrinterDetail` |
| 10826-10836 | **`renderCamBanner(p)`** — dispatch to per-brand `widget_camera.js` (never builds camera HTML inline) | `renderCamBanner` |
| 10837-11926 | **`renderPrinterDetail()`** — hero + camera banner + status + per-brand live block + control cards + log | `renderPrinterDetail` |
| 11927-12038 | Inline edit for printer name / IP / port (pencil, Enter/Escape) + field persist | `startInlineEdit`, `savePrinterField` |

---

## Add-printer flow (L34628-35620)
Per-brand scan/manual flows live in `printers/<brand>/add-flow.js`; `inventory.js` owns the shell.

| L | What | Anchors |
|---|---|---|
| 12039-12137 | **Brand picker modal** — dispatches to per-brand add-flow | `openPrinterBrandPicker` |
| 31515-31564 | **Demo printers** (debug mode) — section of the brand picker, one-click add of a simulated printer (`docs/DEMO-MODE.md`); `syncDemoPrinters` (printers/demo-badge.js) runs on every printer-list snapshot | `_renderDemoPrinterRows`, `addDemoPrinter` |
| 12138-12219 | Add/edit printer form | `openPrinterAddForm`, `closePrinterAddForm` |
| 12220-12471 | Tutorial image bottom-sheet + **multi-step connection tutorial** | `openTutoSheet`, `openPrinterTutorial`, `_ptRenderStep` |
| 12472-12601 | **`submitPrinterAdd()`** — ADD (auto-id) vs EDIT (preserve id/isActive/sortIndex) | `submitPrinterAdd` |

---

## Racks CRUD + slots (L35719-38400)
| L | What | Anchors |
|---|---|---|
| 12602-12767 | Rack create / update / delete / empty + orphan ref cleanup | `createRack`, `updateRack`, `deleteRack`, `emptyRack` |
| 12768-12904 | Empty-rack cascade, twin resolver, slot assign/unassign, slot fill HTML | `playEmptyRackCascade`, `assignSpoolToSlot`, `unassignSpool`, `findSpoolInSlot` |
| 12905-12985 | **Slot locking** — right-click toggle, lock/unlock all, kebab menu positioning | `isSlotLocked`, `toggleSlotLock`, `positionRackMenu` |
| 12986-13212 | **Auto-fill / auto-store / auto-unstore** + search dim + unranked helpers | `autoFillEmptySlots`, `maybeAutoStoreUnrankedSpools`, `applyRackSearchDim`, `getUnrackedSpools` |
| 13254-13383 | **Skyline-packing masonry** layout + relayout scheduler + rack reorder | `layoutRacksMasonry`, `reorderRacks` |
| 13384-13495 | **Rich hover tooltip** for filled slots (mini puck preview) | `buildRackTooltipHTML`, `wireRackTooltipDelegation` |

---

## Storage view render + DnD (L38281-40180)
| L | What | Anchors |
|---|---|---|
| 13496-14141 | **`renderRackView()`** — biggest function in the file: stats bar + filter chips, two-column layout, masonry, kebab menus, live search, read-only friend mode, rack reorder DnD | `renderRackView` |
| 14142-14359 | Drag sources (slot puck / unranked row) + drop targets + **drop-to-void unassign** | `wireDragSources`, `wireDropTargets`, `clearOtherDropHighlights` |
| 14360-14381 | Unrank cascade animation | `playUnrankAnimation` |
| 14382-14585 | **Rack create/edit modal** — name, presets, rows×columns, delete confirm, field errors | `openRackEditModal`, `renderRackPresets`, `confirmDeleteRack` |

---

## Friend view (L39994-40968)
| L | What | Anchors |
|---|---|---|
| 14586-14667 | Friend inventory open/close (one-shot read, no live updates) | `openFriendInventory`, `closeFriendInventory` |
| 14668-14861 | **Friend banner** + switch to friend view (own inventory/racks listeners stay alive, parked in `_ownStash`; last friends in `_friendCache`, fresh 3 min = no read) / switch back (restores the stash, no re-read) | `renderFriendBanner`, `switchToFriendView`, `switchBackToOwnView`, `prewarmAuthToken` |
| 14862-14916 | Friends section in dropdown + incoming request modal queue | `renderFriendsSection`, `showFriendRequestModal` |
| 14917-15054 | **Add-friend modal** — split XXX-XXX field, live preview lookup | `openAddFriendModal`, `_adfChanged` |
| 40824-40948 | **Deep links** — friend (`tigertag://friend/`, web `?friend=`) pre-fills the add-friend modal; **spool links** (`tigertag://spool/<id>`, web `?spool=&weight=&note=`, a `qr.tigertag.io` link pasted in the search; parsed by `qr-link.js`) open the spool for its owner (inventory → `uidMigrationMap` → another account of the device); the link's values wait on the held linkValuesBanner of the spool card (see the detail panel) | `_handleFriendDeepLink`, `_spoolLinkArrived`, `_openSpoolLink`, `_handleSpoolDeepLink` |

---

## Display name + friend requests (L41123-42590)
| L | What | Anchors |
|---|---|---|
| 15055-15098 | **Display-name setup modal** (first-login pseudo picker) | `openDisplayNameSetup` |
| 15099-15190 | Friend requests subscription + badge + accept/refuse/block/remove (bidirectional batch writes) | `subscribeFriendRequests`, `acceptFriendRequest`, `removeFriend` |
| 15191-15251 | Blacklist load / unblock / render | `loadBlacklist`, `renderBlacklist` |

---

## Keys + profile sync (L42529-42710)
| L | What | Anchors |
|---|---|---|
| 15252-15296 | **`claimPublicKey(uid, oldKey)`** atomic transaction (10 retries) + regenerate + send friend request | `claimPublicKey`, `sendFriendRequest` |
| 15321-15371 | Key generators (`XXX-XXX`, 40-char hex) + `userProfiles/{uid}` sync | `generatePublicKey`, `generatePrivateKey`, `syncUserProfile` |

---

## Custom avatar (L42792-43189)
| L | What | Anchors |
|---|---|---|
| 15859-16033 | File pick, image decode, alpha detection, resize to blob, upload, remove | `uploadCustomAvatar`, `removeCustomAvatar` |
| 16034-16219 | **Discord-style cropper** — crop / zoom / rotate + cropped upload | `openAvatarCropper`, `uploadCroppedAvatar` |

---

## User doc sync + telemetry + bootstrap (L43107-44642)
| L | What | Anchors |
|---|---|---|
| 16512-16927 | **`syncUserDoc(uid)`** — displayName/roles/Debug/keys/isPublic + **client telemetry** (studio* fields + `telemetry/studio` aggregates, fire-and-forget) | `syncUserDoc`, `hydrateUserDocCache` |
| ~18620-18700 | **RFID chip list + tag+ backup** — `users/{uid}/rfidList/{UID_HEX}` upsert (firstSeen once-stamped; tag+ signature backup write-once = TigerTag+ indicator). Dedup via inventory-doc `rfidListed`/`rfidBackup` booleans (no in-memory index). Census once per account on first inventory snapshot; backup on auto-scan | `censusRfidListFromInventory`, `recordRfidChipScan` |
| 16928-16960 | Language sync from Firestore + `applyLang(lang)` | `syncLangFromFirestore`, `applyLang` |
| 16961-16976 | **Init bootstrap** — loadLocales → applyTranslations → loadLookups → loadImgMap → runMigration → initAuth → signalFirstPaint | grep "loadLocales().then" |

---

## Electron RFID integration (L44643-45101)
| L | What | Anchors |
|---|---|---|
| 30494-30581 | Reader indicator (topbar), reader connect/disconnect, card present/removed badge | `renderRfidReaderBadges` |
| 30582-30613 | Dual-scan buffer (2 readers / 1.5 s) | `_flushRfidScans` |
| 30614-30746 | **Main NFC scan processor** | `_processNfcScans` |
| 30747-30856 | **Build and write one chip document** to Firestore (API fields only for TigerTag+) | `_writeChipDoc` |
| 30857-30917 | Auto-update status stream | |
| 30918-30919 | TD1S engine moved to `IoT/td1s/index.js` (closing comment) | |

---

## Local MCP server — tools + Settings card (L45064-46819)
| L | What | Anchors |
|---|---|---|
| 38159-38619 | **Read-only MCP tools** + whole-account read (`data_guide` notice, decoder, `firestore_get` / `firestore_query`, friends, wishlists, history, devices; credential masking `MCP_SECRET_FIELD`, scope `_mcpCheckPath`) — definitions (`search_inventory`, `get_spool`, `inventory_summary`, `list_racks`, `list_printers`), row serialiser, handlers, `mcp:call` → `mcp:result` relay. Server itself: `services/mcpServer.js` | `MCP_TOOLS`, `MCP_HANDLERS`, `_mcpRows`, `_mcpSpool` |
| (inside this block) | **AI assistant window wiring** — the ctx handed to `renderer/ai/assistant.js` (spool names, stock sample for the suggested questions, journal, user undo, glow) | `initAiAssistant`, `_mcpUndo`, `_mcpGuideUrl` |
| 45815-46099 | **Catalogue + print planning MCP tools** — `search_catalog` (EAN / SKU / words / colour over `_catalogIndex`), `lookup_reference` (reference tables + containers), `match_filaments` (material by ID, CIEDE2000 colour, grams + margin, one pick per slot, catalogue suggestions), `identify_spool` (QR link / UID → spool, `parseQrLink`) |
| 46149-46606 | **MCP write tools** — `set_spool_weight`, `update_spool`, `move_spool`, `update_product`, `create_spools`, `list_changes`, `undo_change` (+ `find_free_slots`, `create_rack`, `rename_rack` through the racks CRUD writers, and `get_label` through the labels module's labelFor / saveLabel / qrSvg): write gate (`writeFor`), journal in localStorage `tigertag.agentChanges.<uid>`, twin-mirrored batch, `questsMuted` | `_mcpWriteGate`, `_mcpPatchSpool`, `_mcpJournal`, `_mcpLog`, `_mcpRowFor` | `_mcpLab`, `_mcpDeltaE`, `_mcpMaterialRef`, `_mcpCatalogue`, `_mcpCatalogueByColor` |
| (inside this block) | The account signed in is passed to main (`mcp:set-account`); My profile's card opens the AI assistant page (`#btnEacOpenAi`) | `_mcpSyncAccount` |
| (inside this block) | The public guide for connecting an assistant to the hosted connector, opened by the setup on that assistant's anchor | `_mcpGuideUrl` |

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
