# `renderer/inventory.js` — code map

`inventory.js` is a ~25,000-line **ES module** holding the core renderer logic. Printer brand integrations, IoT devices (TigerScale, TD1S) and the RFID tester live in **separate modules** (see *Extracted modules* below) and are imported at the top of the file. This map links each feature to its line range and anchor functions so an AI assistant (or human) can jump directly to the right block instead of reading the file linearly.

**Anchor-first navigation**: line numbers drift as the file changes — anchor function names don't. Always `grep -n "anchorName"` and trust the grep result over the L-number written here. The L-ranges are for orientation (which block is where, what's nearby), not for blind `Read offset=N`.

Keep this map in sync: `npm run codemap:check` (also run by the pre-commit hook) verifies that the anchors of each section still fall inside the declared range and fails the commit on major drift.

---

## Bird's-eye structure

```
L1-309          ES-module imports — IoT modules, printer brand registry, RFID tester
L105-1214        Foundation — Firebase helpers, avatar pipeline, state, persistence,
               cold-start trace, rAF coalescer, i18n, helpers, diagnostics, lookups
L1058-1344      Data layer (tsToMs, normalizeRow, health icon)
L1188-1600     Account dropdown + connected/disconnected sidebar states
L1444-3462     Add Product panel (ADP) — color/brand/material sheets, chip schema, save
L3258-3971     Settings + Friends open/close, TigerScale init, edit-account modal
L3765-4344     Login modal + localStorage accounts + sign-out + legacy migration
L4141-4857     Data migrations (decimal UID → hex, flat rack → nested)
L4647-6336     Firestore inventory subscription + auth orchestration + account list
L6129-6674     Stats, twin auto-link / manual pairing, sort + quick filters
L6465-7514     Inventory render — table/grid keyed-diff, view mode, search
L7304-7929     RFID encode/burn modal (cem)
L7722-8257     TigerTag+ catalogue refresh / convert / duplicate
L8030-10118     Spool detail panel (openDetail, buildPanelHTML, weight update)
L9866-10360     Resizable panels, debug panel, auto-update settings
L10153-10472     Hard delete + container auto-assign + legacy tombstone purge
L10264-10590     Firestore explorer + language save + debug mode
L10382-10888     Friends sidebar quick-list + friends list render
L10679-11387     Racks + printers Firestore subscriptions (+ live friends/notifs)
L11180-12478    Printers views — grid / table / cam wall + drag-drop
L12271-14773   Printer detail side panel (renderPrinterDetail) + inline edit
L14556-16182   Add-printer flow (brand picker, form, tutorials, submit)
L16123-17079   Racks CRUD + slots + locking + auto-fill + masonry + tooltip
L17020-18192   renderRackView + rack drag-drop + rack edit modal
L18130-18695   Friend view + add-friend modal
L18636-19436   Display-name setup + friend requests + blacklist
L19377-19695   Public/private keys + user profile sync
L19636-20004   Custom avatar upload + Discord-style cropper
L19941-20671   syncUserDoc + session telemetry + language sync
L20607-20687   Init bootstrap (loadLocales → loadLookups → runMigration → initAuth)
L20623-21048   Electron RFID integration (readers, dual-scan, NFC processor, chip write)
```

---

## Extracted modules (NOT in inventory.js)

| Module | What | Key exports |
|---|---|---|
| `quests/squad-rankings.js` | TigerSquad → Rankings view (display only): hero with the account's league card, My rank (national / world rank, next rival), Community pulse (publicStats/community + daily history, SVG sparklines), the three leagues with medals and View all. Data from the server board (`squadBoard/*`, `squadRank/{uid}`, backend squadBoard.js), never the member list. Host side: `_loadSquadPulse`, `_squadRankCtx`, `_loadSquadBoard`, `_squadMemberOf`, inline `_openSquadBoard` | `squadHeroHtml`, `squadRankingsHtml`, `toggleLeague` |
| `quests/index.js` + `quests.css` | Tiger Quests (docs/QUESTS.md): batched counters/gauges to `telemetry/studio.quest`, `dailyQuest` check-in (launch, focus, local midnight), live `quests/{daily,journey}`, the Quests views of the main area (`renderQuestsView`, view modes questsToday / questsJourney), celebrations. Host side: `_renderQuestPill`, `_renderProgressChips` (view-bar chips), `_isProgressMode`, `_renderSquadView` (TigerSquad view = `_openSquadBoard(tab, host)` inline), `_questGauges`, `_questPrintEdges` | `initQuests`, `questsSignIn`, `questBump`, `questGauge`, `openQuests` |
| `filter-bar.js` | **Filter bar** (Shopify admin's pattern, as Galaxy): one chip per condition written in the search field before the text (`#fbBar`); field list under the text cursor (click, filter icon `#fbAddBtn`, ↓, narrowed by the text, Enter on the one field named), value editor (is / is not, ticks, counts, search), range editor, Backspace removes the last chip. Draws and edits only — the host owns the fields and the conditions (`FB_FIELDS`, `state.filters`, the printers' `state.printerFilters`) | `mountFilterBar` |
| `color-search.js` | Colour search side card (#colorSearchPanel): HEX (presets + `color-pop.js`), RAL Classic (`ral-classic.js`), photo (5×5 average, never uploaded), ΔE slider, multicolour toggle; CIEDE2000 + D65 Lab ported from TigerTag_Hub `lib/colorMatch.ts` so Studio and tigersystem.io rank alike. Host side: `openColorSearch`, `_catColorApply` | `mountColorSearch`, `hexToLab`, `deltaE2000`, `ralColor`, `deltaBand` |
| `printers/registry.js` + `context.js` | Brand registry — each brand module registers itself; import order = brand picker order. `context.js` shares `state`/`t`/`$` with brand modules | `brands`, `ctx` |
| `printers/snapmaker/index.js` | Moonraker WS :7125 — connect, status merge, live block, filament edit, file sheet, print control | `snapConnect`, `snapDisconnect`, `renderSnapmakerLiveInner`, `openSnapFilamentEdit`, `snapSendGcode` |
| `printers/flashforge/index.js` | HTTP polling :8898 — ping, connect, `/detail` parser, live block, filament edit | `ffgConnect`, `ffgPingPrinter`, `renderFlashforgeLiveInner`, `openFlashforgeFilamentEdit` |
| `printers/flashforge/cam_mux.js` | Single-fetch MJPEG multiplexer, blob URLs to all `<img>` consumers | `ffgMuxStart`, `ffgMuxRegister` |
| `printers/creality/index.js` | WS :10000 — heartbeat, CFS boxsInfo, live block, file list, LED/pause/stop | `creConnect`, `renderCrealityLiveInner`, `creActionPrintFile` |
| `printers/bambulab/index.js` | MQTTS :8883 — connect/parse via main-process IPC, AMS, live block | `bambuConnect`, `renderBambuLiveInner`, `openBambuFilamentEdit` |
| `printers/elegoo/index.js` | MQTT/WS — connect, live block, file sheet, timelapse | `elegooConnect`, `renderElegooLiveInner`, `openElegooFileSheet` |
| `printers/anycubic/index.js` | MQTTS :9884 (LAN) + cloud REST/MQTT — ACE box/slots, live block, filament edit. Detailed section below | `acuConnect`, `renderAnycubicLiveInner`, `openAcuFilamentEdit` |
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
| `PROTOCOL.md` | Agent skill — MQTTS port 9884 (TLS 1.2 forced), `multiColorBox` getInfo/setInfo, slicer-config credential decode, port map, report-shape pitfalls. **Read it before touching this folder.** |
| `index.js` | MQTT connect/disconnect/parse via `window.anycubic` IPC. Exports: `acuKey`, `acuGetConn`, `acuIsOnline`, `acuConnect` (`{skipCam}`), `acuDisconnect`, `renderAcuOnlineBadge`, `renderAnycubicLiveInner`, `renderAnycubicLogInner`, `openAcuFilamentEdit`, `closeAcuFilamentEdit`. `_acuMerge` routes the report families (`print`/`tempature`/`fan`/`status`/`multiColorBox`/`info` — PROTOCOL.md §5b) into `conn.data`; the `info` report carries the camera stream URL (`data.urls.rtspUrl` → `conn.data.camUrl`). Filament-edit bottom sheet DOM is created lazily here (inventory.html untouched). |
| `cards.js` | `renderAcuJobCard` (filename/%/remaining/layers/state), `renderAcuTempCard` (nozzle+bed), `renderAcuFilamentCard` — ACE units + external spool (box -1), slots 0-3, `data-acu-fil-edit` squares. |
| `probe.js` | `acuReadSlicerCreds` (slicer-config import — the ONLY credential source), `acuProbeIp` / `acuScanLan` (TCP :18911 + `GET /info`), `acuCatalogIdFromModel`. |
| `add-flow.js` | 3-way choice: **Import from Anycubic Slicer** (primary) / Scan / Manual IP. Scan & manual candidates are merged with slicer credentials by IP (DHCP repair included). |
| `settings.js` | Brand meta + schema — fields `ip`, `acuModelId` (numeric topic id, ≠ `printerModelId` catalog id), `deviceId`, `username`, `password`. |
| `widget_camera.js` | `renderAcuCamBanner` — when `camLive`, `<img data-acu-key>` fed by 'anycubic:cam-frame' IPC (ffmpeg remuxes the :18089 HTTP-FLV stream to ~5 fps JPEG in main.js, Bambu-RTSP pattern); when idle, returns "" so the hero photo shows (cam-wall safe). The FLV stream is **on-demand** and the driver **actively controls it**: `_acuRequestCamera`/`_acuStartCapture` publish `video/startCapture`, ffmpeg attaches on the printer's `video/report` `initSuccess` (bounded `flvProbe` covers the race), `acuReleaseCamera` sends `stopCapture` on panel close. Stream URL = `conn.data.camUrl` (from the `info/report` `rtspUrl`): `/flv` on a Kobra 3 V2, `/live/<token>` on a Kobra X — both fed to `flvProbe`/`cam-start`; the probe accepts 200 + 206. Cam wall + detached window (`acu_ipc` type in `renderer/cam/cam.js`) reuse the same frames. CSS in `printers/anycubic/anycubic.css`. |
| `agora-cam.js` | **Cloud-mode camera** (Agora WebRTC, PROTOCOL.md §9b). `acuAgoraStart/Stop(key, creds)`: Agora Web SDK (npm dep `agora-rtc-sdk-ng`, global `AgoraRTC`) `setEncryptionConfig("aes-256-gcm2", key, salt)` → `join(appId, channel, rtcToken, clientUid)` → subscribe to the printer's video `uid` → `track.play()` into the `.acu-cam-agora` banner container. Creds from cloud order 1001 (`anycubic:cloud-camera-open`). Self-heal interval re-attaches the track across re-renders. Side panel + cam wall; `acuReleaseCloudCameras()` leaves the channel on cam-wall exit. Detached window: the cloud reuses the Agora uid, so a 2nd client would kick this one — instead this single client captures its video to JPEG and relays frames over `BroadcastChannel('acu-cam')` (`_relayTick`); the detached window's `acu_bc` cam type renders them. `acuAgoraOnRelayWant/End` keep the player alive while detached. |

Wiring (mirrors Bambu): always-on MQTT in `subscribePrinters` (skipCam), auto-connect in the grid/table (skipCam) and cam views, `_getPrinterJob` job normalization, `openPrinterDetail`/`closePrinterDetail`, `#acuLive` + debug-only `#acuLog` blocks in `renderPrinterDetail`, `data-acu-fil-edit` + `#acuLogPauseBtn`/`#acuLogClearBtn` in the delegated click handler, `openAcuAddFlow` in the brand picker, `acu_ipc` entry in `_serializeCamerasForDetach`. Main-process IPC: `anycubic:connect/disconnect/publish(endpoint)` (+ `status`/`message` events), `anycubic:cam-start/stop` (+ `cam-frame`), `anycubic:read-slicer-config`, `anycubic:tcp-probe`, `anycubic:http-info`.

**Cloud mode** (`mode:"cloud"` docs — PROTOCOL.md §9): cloud-mode printers are reached through Anycubic's cloud. The driver (`index.js`) branches on `printer.mode === "cloud"`: connect = shared cloud-MQTT subscribe + REST `getInfo`; refresh/getInfo/setInfo via REST `sendOrder` (1206/1211); reports reuse `_acuMerge`; **camera = Agora WebRTC** (cloud order 1001 → `agora-cam.js`, PROTOCOL.md §9b — side panel + cam wall). Token is grabbed **attach-only** over CDP from a user-run bridge-mode slicer (never launched by us). Provisioning UI: `add-flow.js` "Add a cloud printer" panel → `ctx.addAnycubicCloudPrinter` (writes `cloud_<id>` doc with token+email denormalised). Connect guards in `inventory.js` are `(p.ip || p.mode === "cloud")`; a cloud-edit guard in `submitPrinterAdd` prevents the LAN form from wiping cloud fields. Certs: `services/anycubicCloudCerts.js`. Main IPC: `anycubic:cloud-cdp-token`, `:cloud-get-printers`, `:cloud-verify`, `:cloud-send-order`, `:cloud-camera-open`, `:cloud-connect/subscribe/unsubscribe` (+ `:cloud-message`/`:cloud-status`). Dev validator: `scripts/acu-cloud-test.mjs`.

---

## Foundation (L171-2248)
| L | What | Anchors |
|---|---|---|
| 92 | `API_BASE` constant | |
| 102-142 | **Firebase helpers** — per-account named app instances (`firebase.app(uid)`), each with its own auth session | `fbAuth(id)`, `fbDb(id)` |
| 143-528 | **Avatar pipeline** (single source of truth) — gradients, parts builder, paint, photo overlay; `userAvatar` = the ONE way to draw a person (own account / friend record enrichment, size by class) | `hexToGradientPair`, `getAccGradient`, `paintAvatar`, `userAvatar`, `avatarMarkup`, `applyAvatarStyle` |
| 455-494 | **Local-first persistence layer** — cache-first paint | |
| 495-540 | **Cold-start trace** + first-paint signal + **rAF render coalescer** | `signalFirstPaint`, `scheduleRender` |
| 556-616 | **`state` object declaration** — single source of truth (inventory, rows, selected, lang, racks, friends, isAdmin, db, imgCache, …) | `const state = {` |
| 619-656 | **`t(key, params)`** — i18n lookup with fallback, `{{param}}`, `["array"]` random pick, `{one,other}` plurals; `applyTranslations()` | `function t`, `applyTranslations` |
| 657-748 | **General helpers** — `v()`, `toHex()`, `timeAgo()`, `fmtTs()`, `fmtChipTs()`, `setLoading()`, `setupHoldToConfirm()` | `timeAgo`, `setupHoldToConfirm` |
| 749-767 | `toast()` — top banner with kind (info/error/success) + auto-dismiss | `toast` |
| 768-897 | **Error reporting / diagnostic system** — `reportError()`, app version line, diag badge, report builder, modal; `esc`/`highlight`/`debug` | `reportError`, `buildDiagnosticReport`, `openDiagnosticModal` |
| 898-907 | `apiFetch()` — fetch wrapper feeding the debug panel | `apiFetch` |
| 908-1029 | **Lookups** — locales, TigerTag DB (brand/material/aspect/type/diameter/version/containers), printer model catalog helpers | `loadLocales`, `loadLookups`, `findPrinterModel`, `dbFind`, `brandName`, `materialLabel` |

---

## Data layer (L2011-2448)
| L | What | Anchors |
|---|---|---|
| 1032-1040 | `tsToMs()` — Firestore Timestamp → ms (accepts `number`, `Timestamp`, `{_seconds}`) | `tsToMs` |
| 1041-1131 | **`normalizeRow(spoolId, data)`** — Firestore doc → flat row used by every view | `normalizeRow` |
| 1132-1161 | Health icon driven by Firestore `metadata.fromCache` | `setHealthLive`, `setHealthOffline`, `setHealthIdle` |

---

## Account dropdown + sidebar states (L2238-2698)
| L | What | Anchors |
|---|---|---|
| 1162-1258 | Connected vs no-account UI states | `setConnected`, `setDisconnected` |
| 1259-1367 | **Account dropdown** (avatar click) — connected accounts, manage profiles, friends section, add friend | `openAccountDropdown`, `renderAccountDropdown` |
| 1368-1408 | Profiles modal | `openProfilesModal` |

---

## Add Product panel — ADP (L2523-4250)
Manual spool creation: full chip-schema editor with bottom-sheets. All helpers prefixed `_adp`.

| L | What | Anchors |
|---|---|---|
| 1409-1504 | Field helpers — cloud id, grams conversion, color presets render | `_adpCloudId`, `_adpToGrams`, `_adpRenderColorPresets` |
| 1505-1698 | **Color sheet + custom colour picker** (HSV math, drag) | `openAdpColorSheet`, `openAdpColorCustomSheet`, `_adpCcRender` |
| 1699-1808 | **Brand bottom-sheet** with favourites | `openAdpBrandSheet`, `_adpRenderBrandList`, `_adpToggleFavBrand` |
| 1809-1909 | **Material bottom-sheet** (mirror of Brand) | `openAdpMaterialSheet`, `_adpRenderMaterialList` |
| 1910-2302 | Multi-colour state, 28-byte colour-name limit, material defaults, RFID preview | `_adpSetColorMode`, `_adpApplyMaterialDefaults`, `_adpRefreshRfidPreview` |
| 2303-2488 | **Panel open/close** | `openAddProductPanel`, `closeAddProductPanel` |
| 2489-2687 | **`saveAddProduct()`** — canonical chip schema (identity, RGBA colours, firmware slots, measure, TD, timestamps) → Firestore write | `saveAddProduct` |
| 2688-3180 | Sheet/search DOM wiring (click delegation, integer-only fields, Escape cascade) | `_adpCloseAllSheetsAndPanel` |

---

## Settings / Friends / Account modals (L4509-7984)
| L | What | Anchors |
|---|---|---|
| 3181-3208 | Settings panel open/close | `openSettings`, `closeSettings` |
| 3209-3222 | Friends panel open/close (auto-generates publicKey first) | `openFriends`, `closeFriends` |
| 3223-3264 | **TigerScale module init** — wires panel, health tick, card delegation into `IoT/tigerscale` | `initTigerScale(` |
| 3265-3372 | Eye-toggle and "Copied!" flash helpers | `makeEyeToggle` |
| 3373-3491 | **Edit account modal** + account colour save | `openEditAccountModal`, `saveColorToFirestore` |
| 3492-3637 | **Identity window** (photo change / remove) + display-name save | `openIdentityModal`, `saveDisplayName` |

---

## Login + accounts persistence (L7666-8584)
| L | What | Anchors |
|---|---|---|
| 3638-3859 | **Login modal** (Firebase) — Google sign-in, email/password sign-in + create flow, forgot password | `lmSetMode`, `openAddAccountModal` |
| 3860-3885 | LocalStorage accounts helpers; inventory cache save; legacy API-key account wipe | `getAccounts`, `activeAccount`, `runMigration` |
| 3886-3954 | Per-account `firebase.app(uid).auth().signOut()` | `fbSignOut` |

---

## Data migrations (L8100-9284)
| L | What | Anchors |
|---|---|---|
| 3955-3979 | Decimal spoolId detection + hex conversion — imported from `uid-repair.js` (pure, padded to whole bytes, tested by `scripts/test-uid-repair.mjs`) | `isDecimalSpoolId`, `decimalSpoolIdToHex` |
| 3980-4153 | **Rack-shape migration** — flat fields → nested `rack` object (consent modal + lock-screen sweep) | `maybeMigrateFlatRackToNested`, `drainRackMigrationQueue` |
| 4154-4447 | **UID format migration** — decimal big-endian → hex uppercase (consent modal, progress, queue) | `maybeMigrateDecimalSpoolIds`, `drainUidMigrationQueue`, `migrateOneSpoolDecimalToHex` |
| 7624-7679 | **Truncated NTAG id repair** (issue #146) — silent, idempotent re-key `4…` (13) → `04…` (14), twin pointers, uidMigrationMap; plan = `planTruncatedUidRepair` (uid-repair.js) | `maybeRepairTruncatedSpoolIds`, `repairTruncatedSpoolIds` |

---

## Inventory subscription + auth + account list (L8712-9786)
| L | What | Anchors |
|---|---|---|
| 4448-4556 | **Firestore inventory subscription** — `onSnapshot` with friend-view defense-in-depth | `subscribeInventory`, `unsubscribeInventory` |
| 4557-4706 | **Auth orchestration** — signed-in fast path (cache paint → subs → user doc), named auth setup | `handleSignedIn`, `setupNamedAuth`, `initAuth` |
| 4707-4855 | Account list render + switch + delete | `renderAccountList`, `switchAccountUI`, `deleteAccountUI` |

---

## Stats / twins / filters (L9423-10586)
| L | What | Anchors |
|---|---|---|
| 4856-4904 | Key status, row sort, load action, **stats** | `renderStats`, `loadInventory` |
| 4905-5075 | **Twin auto-link by timestamp** (2 s window) + manual pairing repair | `autoLinkTwinsByTimestamp`, `findTwinCandidates`, `linkTwinPair`, `unlinkTwinPair` |
| 5076-5172 | Sort + search/filter pipeline; `populateQuickFilters` = redraw the filter bar's chips + the type tiles | `sortRows`, `filteredRows`, `populateQuickFilters` |

---

## Inventory render (L10356-16256)
| L | What | Anchors |
|---|---|---|
| 5173-5387 | **`renderInventory()`** — welcome card, rack-view priority, table/grid dispatch | `renderInventory` |
| 5388-5583 | Filter application + colour/thumbnail helpers + image pre-cache | `applyInventoryFilter`, `colorBg`, `thumbHTML`, `preCacheImages` |
| 5695-5755 | **Identical-spool grouping (view-only)** — group key + render-item builder, expanded-keys set. Table only in Phase 1 (Grid = Phase 2) | `_spoolGroupKey`, `groupRows` |
| 5755-6113 | **Keyed-diff render** — row signature, create/update grid card + table row + group header row (no full rebuild) | `_rowSignature`, `_createGridCard`, `_updateGridCard`, `renderGrid`, `_groupHeaderInnerHTML`, `_toggleGroupExpanded`, `renderTable` |
| 6113-6334 | View mode toggle (persisted), group toggle, search clear, filter change, stat tile → Type chip, sort indicators | `setViewMode`, `updateSortIndicators` |
| ~15163-15398 | **Filter bar fields** — `FB_FIELDS` (brand, series, material, aspect, type, product type, diameter, tag, list, weight, rack) per scope (`inv` spools · `prod` products/Lists · `cat` catalogue · `prn` printers: brand, model, state, tag, kept apart in `state.printerFilters`, applied in the printer views), each reading the record's IDs; `_fbPass` = AND across chips / OR inside; facet counts over what the other chips + search leave; colour bars and colour search as extra chips; mounted after the search field's listeners | `_fbScope`, `_fbConds`, `_fbPass`, `_fbOptions`, `_fbFieldDefs`, `_fbExtraChips`, `_fbSetConds`, `_fbTrophies`, `_clearSearchFilters` |
| ~15487-15606 | **Colour search** (Search views) — the search bar's colour button opens `#colorSearchPanel` (renderer/color-search.js): HEX / RAL / photo + ΔE ceiling into `state.catColor`; `_catColorApply` keeps the catalogue hits within it (CIEDE2000, closest colour, multicolour opt-in, brand-declared RAL first) and sorts them; shown as a filter-bar chip (`_fbExtraChips`), "ΔE x.x" as a badge at the bottom left of each picture (card and table thumbnail) | `openColorSearch`, `closeColorSearch`, `_catColorSet`, `_catColorChipSync`, `_catColorApply`, `_catDeHTML` |
| (same block) | **Catalogue brands** — `state.catBrands` (prefs/app.catalogBrands + `tigertag.catalogBrands.<uid>`): the Search views show only the picked makers, ask for them first (`_catViewAskBrands`), `#catBrandsPanel` side card edits a draft saved on close | `_catBrandShown`, `_catBrandsLoad`, `_catBrandsFromPrefs`, `_catBrandsSave`, `_catAllBrands`, `openCatBrands`, `closeCatBrands` |
| ~7074-7195 | **Lists / wishlists — Firestore subscriptions + CRUD** — personal lists (`subscribeLists`) and friend lists (read-only, `subscribeFriendLists`); in-memory array + create/add/remove | `subscribeLists`, `unsubscribeLists`, `subscribeFriendLists`, `unsubscribeFriendLists`, `_listsArray`, `_createList`, `_addToList`, `_removeFromList` |

---

## RFID encode / burn modal — cem (L16433-17053)
| L | What | Anchors |
|---|---|---|
| 6025-6116 | **`_burnRfid(r)`** — writes a chip from a row | `_burnRfid` |
| 6117-6261 | Encode modal lifecycle — targets present, blank check, render, presence change | `openEncodeModal`, `_cemBlankCheck`, `_cemRender` |
| 6262-6353 | Burn start + post-burn cloud migration | `_cemStartBurn`, `_cemMigrate` |

---

## TigerTag+ catalogue (L16137-19987)
| L | What | Anchors |
|---|---|---|
| 11166-11259 | Refresh API data for a spool | `_refreshApiData` |
| 11260-11287 | **Catalogue payload → doc fields** — the ONE `product/get` mapping, shared by the conversion and the TigerData+ creation | `_productApiFields` |
| 11288-11334 | TigerTag+ product lookup (validate an id, preview) | `_lookupPlusProduct` |
| 11335-11364 | **Convert TigerTag → TigerTag+** (sets `id_tigertag` to the TigerTag+ id) | `_convertToPlus` |
| 11365-11458 | **Catalogue browser** — import-all-once cache (localStorage) + sync | `_catalogLoadCache`, `_catalogBuildIndex`, `_catalogSync` |
| 11459-11553 | In-memory search engine + incremental (chunked) row render | `_catalogSearch`, `_catalogRenderChunk`, `_catalogRowHTML` |
| 11554-11611 | Catalogue **names → reference-DB ids** (best-effort) + colour parsing; a product's material family (`material_type`) for the Material filter | `_catByName`, `_catFamily`, `_catMaterialId`, `_catHexToRgba`, `_catChiplessNonce` |
| 11612-11733 | **Create a TigerData+** from a product — canonical chip schema, `id_product` set, chipless nonce kept | `_catalogCreate` |
| 11734-11770 | Catalogue modal open/close | `openCatalogModal`, `closeCatalogModal` |
| 15385-15449 | **Catalogue pick** side card — "From the catalogue" of the new-chip window (rfid_protocol/linked): brand + `_catalogFilter`, one tap → `_catalogCreate(id, { msgEl })` | `openCatalogPick`, `closeCatalogPick`, `_catalogPickFill` |
| 11913-11947 | **Search views** — the catalogue as a grid/table view segment (`catalogGrid` / `catalogTable`); own hits + selection, driven by the MAIN search bar | `renderCatalogView`, `_catViewHeadHTML` |
| 11948-12029 | Filters = filter-bar chips (Type · Brand · Series · Material families `material_type` · Aspect · colour); an empty result that the chips cause offers to clear them; the sort select (`cvSort`) = cached rank per sort key | `CAT_SORTS`, `_catSortRank`, `_catViewFillFacets`, `_catViewSearch` |
| ~13672-13762 | **Catalogue multi-select** — `state.selectedCatalog` + the shared bulk bar (catalogue context in _bulkCtx: ★ / 🛒 / Add to a list, no delete); ids resolved to product rows through the product-card detail cache, 6 at a time, capped at `CAT_BULK_MAX` | `_catBulkClick`, `_catResolveRow`, `_catResolveRows`, `_catSelectedRows` |
| 11960-12037 | Search-view card / row markup; table = chunked append (IntersectionObserver), grid = virtualised window (only visible rows ± 4, padding stands in for the rest) | `_catViewCardHTML`, `_catViewRowHTML`, `_catViewRenderChunk`, `_catViewGridRender` |
| 12038-12083 | Search-view selection + action bar (select ≠ create) | `_catViewSelect`, `_catViewSyncBar` |
| 11771-11926 | Duplicate spool as cloud doc | `duplicateSpoolAsCloud` |
| ~9825-10005 | **Lists / wishlists — UI** — products view (favourites/order tab) + "Add to list" popover menu (one product or a bulk selection, written in one arrayUnion by _addManyToList) | `renderProductsView`, `renderListsView`, `_openAddToListMenu` |
| ~10266 | Message inline edit | `startMessageInlineEdit` |

---

## Spool detail panel (L19037-26782)
| L | What | Anchors |
|---|---|---|
| 6664-6817 | Structural signature (patch vs rebuild), weight patch, saved check | `_detailStructuralSig`, `_patchDetailWeight` |
| 6818-7437 | **`openDetail(spoolId)`** / close / refresh + usage telemetry | `openDetail`, `closeDetail`, `refreshOpenDetail`, `_recordUsage` |
| 21844-21874 | The values a spool link proposes (weight, note): held banner on the spool card, saved in one gesture | `_linkValuesBannerHTML`, `_saveLinkValues` |
| 7488-7550 | **Twin-link picker modal** | `openTwinLinkPicker` |
| 7551-7562 | Ecosystem window — one fixed-grid window, a sheet per device (TigerPOD Mini, TigerScale, TigerSpool, Tiger Touch, NFC Connect, TigerTag) | `ECO_SHEETS`, `openEcoSheet`, `_renderEcoSheet`, `_ecoStep`, `openTigerPodModal` |
| 7563-7618 | **Container picker modal** (46 containers from `data/container_spool/spools_filament.json`) | `openContainerPicker`, `doContainerUpdate` |
| ~19385-19455 | **Video player — the ONE builder** for the spool detail + product card: `parseVideoUrl` (file / YouTube / Google Drive / external), `_productVideosHTML` (chip video + playable attachments, deduped) → `_videoSectionHTML` (inline `<video>`, or poster → in-place iframe on click) | `parseVideoUrl`, `_isPlayableVideo`, `_productVideosHTML`, `_videoSectionHTML` |
| ~20035-20184 | **Inventory → .xlsx** (Settings → Data): a real spreadsheet written with no library — ZIP of XML parts stored uncompressed, columns sized from the data, frozen header + filters, text as strings, numbers and dates typed | `_exportInventoryXlsx`, `_xlsxCells`, `_xlsxSheet`, `_zipStore` |
| ~8197 | **Tags / Balises** — free-form labels, entity-agnostic Shopify-style editor (chips + inline dropdown + "Add tags" modal) driven by a `ctx` (`getTags`/`writeTags`/`allTags`/`readOnly`/`ids`). Two providers: `_spoolTagCtx` (spools, twin-mirrored write) and `_printerTagCtx` (printers, savePrinterField). Spool editor in buildPanelHTML+openDetail; printer editor in renderPrinterDetail (`#ppTag*`, tags-only echo patches chips in place via a structural-signature guard) | `_normalizeTag`, `_allTags`, `_allPrinterTags`, `_writeSpoolTags`, `_writePrinterTags`, `_ctxAddTag`, `_ctxRemoveTag`, `_wireTagEditor`, `openTagsModal` |
| 7660-8350 | **`buildPanelHTML(r)`** — header, colours, print settings, weight slider w/ debounce, storage row, tags, links, container, toolbox, raw JSON | `buildPanelHTML` |
| 8351-8409 | **Weight update** (direct / raw-scale modes, twin propagation) | `doWeightUpdate` |

---

## Panels / debug / auto-update (L25542-28142)
| L | What | Anchors |
|---|---|---|
| 8410-8483 | Resizable panels (detail + debug) — drag handle, persisted width | `makePanelResizable`, `openDebug` |
| 8484-8560 | Product ID help modal | |
| 8561-8647 | Settings → About → auto-update toggle + "Check for updates now" | `readAutoUpdatePref`, `showUpdateStatus` |
| 8648-8803 | **Hard delete** (`batch.delete` doc + twin), container auto-assign on snapshot, legacy tombstone purge | `markSpoolDeleted`, `resolveContainerForBrand`, `autoAssignMissingContainers`, `purgeLegacyTombstones` |
| 8804-8884 | **Firebase Explorer** — dedicated side card (`#fseExplorerPanel`, opened by `openFsExplorer`, mutually exclusive with the API-only debug panel). Breadcrumb nav + clickable doc-id drill-down + collection/doc render | `fseInit`, `fseFetch`, `fseNavigate`, `fseRenderCrumbs`, `openFsExplorer` |
| 8885-8921 | Account language save + debug mode apply | `saveAccountLang`, `applyDebugMode` |

---

## Friends rendering (L27009-28842)
| L | What | Anchors |
|---|---|---|
| 8922-9006 | Sidebar friends quick-list + hover tooltip | `renderSidebarFriends`, `showSbFriendTip` |
| 9007-9123 | Friends list render + avatar colour helpers | `renderFriendsList`, `friendColor`, `readableTextOn` |
| 9124-9217 | Friends list load (profile fetch) + cache hydration | `loadFriendsList`, `_hydrateFriendsCache` |

---

## Racks + printers subscriptions (L27770-29217)
| L | What | Anchors |
|---|---|---|
| 9218-9260 | Racks subscription | `subscribeRacks`, `unsubscribeRacks` |
| 9261-9424 | **3D printers subscription** — per-brand subcollections (`users/{uid}/printers/{brand}/devices`) | `subscribePrinters`, `unsubscribePrinters` |

*(Scales subscription moved to `IoT/tigerscale/index.js`.)*

---

## Printers views (L28163-33307)
| L | What | Anchors |
|---|---|---|
| 9425-9597 | **Job status helpers** + surgical grid patches (job card, online badge, grid signature) | `_getPrinterJob`, `_patchGridJobs`, `_jobCardHtml`, `_isPrinterOnline`, `_patchGridStatus` |
| 9598-9767 | **Grid view** — auto-connect all brands, online/offline partition, cards | `renderPrintersView` |
| 9768-9890 | **Table view** — sortable columns, row click → sidecard | `_renderPrinterTable` |
| 9891-10153 | **Cam wall view** — patch mode, card sizes, detached cam window serializer | `_renderPrinterCam`, `_patchCamWall`, `_serializeCamerasForDetach` |
| 10154-10351 | Printer plan drag guard (a dragged card's click does not open it) | `_printerJustDragged` |
| 24040-24177 | **The board's objects** — one `data-board-id` addresses a machine (`brand:id`), one of its units (`unit:…`) or its units as one widget (`units:…`); position/z read + saved through the same three functions | `_boardObj`, `boardPos`, `boardZ`, `boardSave`, `saveUnitPlanPos`, `savePrinterPlanPos` |
| 24178-24267 | **Clusters** — several board objects bound together for good. The id lives on the members beside the coordinates it binds (`planCluster` / `unitsPlanCluster` / `units.{id}.planPrintersCluster`), so no new collection, no rules block, and deleting a machine takes its membership with it | `_newClusterId`, `_printerBoardIds`, `clusterOf`, `clusterMembers`, `saveBoardCluster` |
| 24326-24488 | **Plan layout** — places every object at its own coordinates, adopts orphans, compacts z to 1..N, sizes the board, then draws one outline per cluster | `layoutPrintersPlan`, `seedPrinterPlan`, `_drawClusterHulls` |
| 24518-24786 | **Selection + drag** — a `Set` of board ids; selecting any member of a cluster expands to the whole of it in `_syncPlanSelection`, so the drag carries clusters without knowing they exist | `_syncPlanSelection`, `_expandPlanSelToClusters`, `_clearPlanSelection`, `wirePrinterMarquee`, `wirePrinterPlanDrag` |
| 24786-24896 | **The board's right-click menu** — group / ungroup the selection; the kebab menu's own component, dropped from the cursor | `openPlanContextMenu`, `closePlanContextMenu`, `wirePlanClusterMenu` |

---

## Printer detail side panel (L32238-36261)
| L | What | Anchors |
|---|---|---|
| 10352-10914 | Open/close lifecycle (connect/disconnect per brand), conn button, refresh | `openPrinterDetail`, `closePrinterDetail`, `refreshOpenPrinterDetail` |
| 10915-10925 | **`renderCamBanner(p)`** — dispatch to per-brand `widget_camera.js` (never builds camera HTML inline) | `renderCamBanner` |
| 10926-12016 | **`renderPrinterDetail()`** — hero + camera banner + status + per-brand live block + control cards + log | `renderPrinterDetail` |
| 12017-12128 | Inline edit for printer name / IP / port (pencil, Enter/Escape) + field persist | `startInlineEdit`, `savePrinterField` |

---

## Add-printer flow (L35189-37261)
Per-brand scan/manual flows live in `printers/<brand>/add-flow.js`; `inventory.js` owns the shell.

| L | What | Anchors |
|---|---|---|
| 12129-12227 | **Brand picker modal** — dispatches to per-brand add-flow | `openPrinterBrandPicker` |
| 32012-32061 | **Demo printers** (debug mode) — section of the brand picker, one-click add of a simulated printer (`docs/DEMO-MODE.md`); `syncDemoPrinters` (printers/demo-badge.js) runs on every printer-list snapshot | `_renderDemoPrinterRows`, `addDemoPrinter` |
| 12228-12309 | Add/edit printer form | `openPrinterAddForm`, `closePrinterAddForm` |
| 12310-12561 | Tutorial image bottom-sheet + **multi-step connection tutorial** | `openTutoSheet`, `openPrinterTutorial`, `_ptRenderStep` |
| 12562-12691 | **`submitPrinterAdd()`** — ADD (auto-id) vs EDIT (preserve id/isActive/sortIndex) | `submitPrinterAdd` |

---

## Racks CRUD + slots (L36280-40006)
| L | What | Anchors |
|---|---|---|
| 12692-12857 | Rack create / update / delete / empty + orphan ref cleanup | `createRack`, `updateRack`, `deleteRack`, `emptyRack` |
| 12858-12994 | Empty-rack cascade, twin resolver, slot assign/unassign, slot fill HTML | `playEmptyRackCascade`, `assignSpoolToSlot`, `unassignSpool`, `findSpoolInSlot` |
| 12995-13075 | **Slot locking** — right-click toggle, lock/unlock all, kebab menu positioning | `isSlotLocked`, `toggleSlotLock`, `positionRackMenu` |
| 13076-13302 | **Auto-fill / auto-store / auto-unstore** + search dim + unranked helpers | `autoFillEmptySlots`, `maybeAutoStoreUnrankedSpools`, `applyRackSearchDim`, `getUnrackedSpools` |
| 13344-13473 | **Skyline-packing masonry** layout + relayout scheduler + rack reorder | `layoutRacksMasonry`, `reorderRacks` |
| 13474-13585 | **Rich hover tooltip** for filled slots (mini puck preview) | `buildRackTooltipHTML`, `wireRackTooltipDelegation` |

---

## Storage view render + DnD (L38849-41804)
| L | What | Anchors |
|---|---|---|
| 13586-14233 | **`renderRackView()`** — biggest function in the file: stats bar + filter chips, two-column layout, masonry, kebab menus, live search, read-only friend mode, rack reorder DnD | `renderRackView` |
| 14234-14451 | Drag sources (slot puck / unranked row) + drop targets + **drop-to-void unassign** | `wireDragSources`, `wireDropTargets`, `clearOtherDropHighlights` |
| 14452-14475 | Unrank cascade animation | `playUnrankAnimation` |
| 14476-14680 | **Rack create/edit modal** — name, presets, rows×columns, delete confirm, field errors | `openRackEditModal`, `renderRackPresets`, `confirmDeleteRack` |

---

## Friend view (L40600-42604)
| L | What | Anchors |
|---|---|---|
| 14681-14762 | Friend inventory open/close (one-shot read, no live updates) | `openFriendInventory`, `closeFriendInventory` |
| 14763-14956 | **Friend banner** + switch to friend view (own inventory/racks listeners stay alive, parked in `_ownStash`; last friends in `_friendCache`, fresh 3 min = no read) / switch back (restores the stash, no re-read) | `renderFriendBanner`, `switchToFriendView`, `switchBackToOwnView`, `prewarmAuthToken` |
| 14957-15011 | Friends section in dropdown + incoming request modal queue | `renderFriendsSection`, `showFriendRequestModal` |
| 15012-15149 | **Add-friend modal** — split XXX-XXX field, live preview lookup | `openAddFriendModal`, `_adfChanged` |
| 41347-41471 | **Deep links** — friend (`tigertag://friend/`, web `?friend=`) pre-fills the add-friend modal; **spool links** (`tigertag://spool/<id>`, web `?spool=&weight=&note=`, a `qr.tigertag.io` link pasted in the search; parsed by `qr-link.js`) open the spool for its owner (inventory → `uidMigrationMap` → another account of the device); the link's values wait on the held linkValuesBanner of the spool card (see the detail panel) | `_handleFriendDeepLink`, `_spoolLinkArrived`, `_openSpoolLink`, `_handleSpoolDeepLink` |

---

## Display name + friend requests (L41727-44285)
| L | What | Anchors |
|---|---|---|
| 15150-15193 | **Display-name setup modal** (first-login pseudo picker) | `openDisplayNameSetup` |
| 15194-15286 | Friend requests subscription + badge + accept/refuse/block/remove (bidirectional batch writes) | `subscribeFriendRequests`, `acceptFriendRequest`, `removeFriend` |
| 15287-15350 | Blacklist load / unblock / render | `loadBlacklist`, `renderBlacklist` |

---

## Keys + profile sync (L43133-44502)
| L | What | Anchors |
|---|---|---|
| 15351-15400 | **`claimPublicKey(uid, oldKey)`** atomic transaction (10 retries) + regenerate + send friend request | `claimPublicKey`, `sendFriendRequest` |
| 15425-15475 | Key generators (`XXX-XXX`, 40-char hex) + `userProfiles/{uid}` sync | `generatePublicKey`, `generatePrivateKey`, `syncUserProfile` |

---

## Custom avatar (L43396-44984)
| L | What | Anchors |
|---|---|---|
| 16268-16442 | File pick, image decode (HEIC via the main process on macOS), alpha detection, error text, remove | `_readAvatarFile`, `removeCustomAvatar` |
| 16443-16628 | **Discord-style cropper** — crop / zoom / rotate + cropped upload | `openAvatarCropper`, `uploadCroppedAvatar` |

---

## User doc sync + telemetry + bootstrap (L43729-46406)
| L | What | Anchors |
|---|---|---|
| 16921-17336 | **`syncUserDoc(uid)`** — displayName/roles/Debug/keys/isPublic + **client telemetry** (studio* fields + `telemetry/studio` aggregates, fire-and-forget) | `syncUserDoc`, `hydrateUserDocCache` |
| ~18755-18835 | **RFID chip list + tag+ backup** — `users/{uid}/rfidList/{UID_HEX}` upsert (firstSeen once-stamped; tag+ signature backup write-once = TigerTag+ indicator). Dedup via inventory-doc `rfidListed`/`rfidBackup` booleans (no in-memory index). Census once per account on first inventory snapshot; backup on auto-scan | `censusRfidListFromInventory`, `recordRfidChipScan` |
| 17337-17369 | Language sync from Firestore + `applyLang(lang)` | `syncLangFromFirestore`, `applyLang` |
| 17370-17385 | **Init bootstrap** — loadLocales → applyTranslations → loadLookups → loadImgMap → runMigration → initAuth → signalFirstPaint | grep "loadLocales().then" |

---

## Electron RFID integration (L45650-46972)
| L | What | Anchors |
|---|---|---|
| 30994-31081 | Reader indicator (topbar), reader connect/disconnect, card present/removed badge | `renderRfidReaderBadges` |
| 31082-31113 | Dual-scan buffer (2 readers / 1.5 s) | `_flushRfidScans` |
| 31114-31246 | **Main NFC scan processor**; a chip flagged to update (`needUpdateAt`) is rewritten from its record as soon as it is read on the TigerPOD | `_processNfcScans`, `_autoUpdateChip` |
| 31247-31356 | **Build and write one chip document** to Firestore (API fields only for TigerTag+) | `_writeChipDoc` |
| 31357-31417 | Auto-update status stream | |
| 31418-31419 | TD1S engine moved to `IoT/td1s/index.js` (closing comment) | |

---

## Local MCP server — tools + Settings card (L45723-48869)
| L | What | Anchors |
|---|---|---|
| 38645-39106 | **Read-only MCP tools** + whole-account read (`data_guide` notice, decoder, `firestore_get` / `firestore_query`, friends, wishlists, history, devices; credential masking `MCP_SECRET_FIELD`, scope `_mcpCheckPath`) — definitions (`search_inventory`, `get_spool`, `inventory_summary`, `list_racks`, `list_printers`), row serialiser, handlers, `mcp:call` → `mcp:result` relay. Server itself: `services/mcpServer.js` | `MCP_TOOLS`, `MCP_HANDLERS`, `_mcpRows`, `_mcpSpool` |
| (inside this block) | **AI assistant window wiring** — the ctx handed to `renderer/ai/assistant.js` (spool names, stock sample for the suggested questions, journal, user undo, glow) | `initAiAssistant`, `_mcpUndo`, `_mcpGuideUrl` |
| 46390-46687 | **Catalogue + print planning MCP tools** — `search_catalog` (EAN / SKU / words / colour over `_catalogIndex`), `lookup_reference` (reference tables + containers), `match_filaments` (material by ID, CIEDE2000 colour, grams + margin, one pick per slot, catalogue suggestions), `identify_spool` (QR link / UID → spool, `parseQrLink`) |
| 46737-47194 | **MCP write tools** — `set_spool_weight`, `update_spool`, `move_spool`, `update_product`, `create_spools`, `list_changes`, `undo_change` (+ `find_free_slots`, `create_rack`, `rename_rack` through the racks CRUD writers, and `get_label` through the labels module's labelFor / saveLabel / qrSvg): write gate (`writeFor`), journal in localStorage `tigertag.agentChanges.<uid>`, twin-mirrored batch, `questsMuted` | `_mcpWriteGate`, `_mcpPatchSpool`, `_mcpJournal`, `_mcpLog`, `_mcpRowFor` | `_mcpLab`, `_mcpDeltaE`, `_mcpMaterialRef`, `_mcpCatalogue`, `_mcpCatalogueByColor` |
| (inside this block) | The account signed in is passed to main (`mcp:set-account`); My profile's card opens the AI assistant page (`#btnEacOpenAi`) | `_mcpSyncAccount` |
| (inside this block) | The public guide for connecting an assistant to the hosted connector, opened by the setup on that assistant's anchor | `_mcpGuideUrl` |

## "Find X by feature" cookbook

Most common navigation tasks → grep these anchors first:

| You want to … | Grep / open |
|---|---|
| Add or change an i18n key | `function t` L572; *use `npm run i18n:add` for the actual write* |
| Touch the spool detail panel | `buildPanelHTML` L8570, `openDetail` L7754 |
| Touch the weight slider / weight save | `doWeightUpdate` L9301, `_patchDetailWeight` L7663 |
| Touch the Add Product panel | `openAddProductPanel` L2231, `saveAddProduct` L2417 |
| Touch the RFID encode/burn modal | `openEncodeModal` L6964, `_cemStartBurn` L7109 |
| Touch a modal | Twin link L8398, Container L8473, Rack edit L15990, Login L3586, Edit account L3301 |
| Touch the storage view | `renderRackView` L15111 — biggest function in the file |
| Touch rack drag-drop | `wireDragSources` L15751, `wireDropTargets` L15816, drop-to-void L15903 |
| Touch the printers grid / table / cam wall | `renderPrintersView` L10504, `_renderPrinterTable` L10673, `_renderPrinterCam` L10838 |
| Touch the printer detail card | `renderPrinterDetail` L11831, `openPrinterDetail` L11257 |
| Touch a printer brand integration (WS/MQTT/HTTP, live block, filament edit) | `printers/<brand>/index.js` — NOT in this file |
| Touch the Anycubic MQTT layer (LAN + cloud) | `acuConnect` in `printers/anycubic/index.js` (+ `anycubic:*` IPC in main.js) |
| Touch the Anycubic live block / ACE card | `renderAnycubicLiveInner`, `renderAcuFilamentCard` |
| Touch a printer camera banner | `printers/<brand>/widget_camera.js`; dispatch at `renderCamBanner` L11820 |
| Touch the Add-printer scan flow | `printers/<brand>/add-flow.js`; shell at `openPrinterBrandPicker` L13036 |
| Touch the printer tutorials | `openPrinterTutorial` L13363 |
| Touch the TigerScale panel | `IoT/tigerscale/index.js`; init wiring at L3151 |
| Touch the TD1S sensor / TD-Color edit modals | `IoT/td1s/index.js` + `edit-modals.js` |
| Touch the Friends system | lists L9828, friend view L16194, requests L16705 |
| Touch the custom avatar / cropper | `_readAvatarFile`, `openAvatarCropper`, `uploadCroppedAvatar` (grep -n) |
| Touch the auth flow | `handleSignedIn` L4510, `initAuth` L4643, login modal L3586 |
| Touch the Firestore subscriptions | inventory L4397, racks L10124, printers L10168, friend reqs L16705 |
| Touch the telemetry | `syncUserDoc` L17362 (studio* fields), `_recordUsage` L8348 |
| Touch the auto-update banner | L9512 |
| Touch the diagnostic / report-problem modal | `reportError` L721, `openDiagnosticModal` L822 |

---

## Notes for AI assistants

- **State** is at L509. Read it first when reasoning about anything cross-cutting.
- **ES module**: `inventory.js` imports printer brands, IoT modules and the RFID tester at L1-306. Brand modules receive `state`/`t`/`$` through `printers/context.js` (`ctx`).
- **Selectors**: `$` is `document.getElementById`. Many DOM nodes have IDs matching the section (e.g. `#detailPanel`, `#friendsPanel`).
- **i18n**: 11 locales (en/fr/de/es/it/zh/pt/pt-pt/pl/ru/nl) under `renderer/locales/`. Never hand-edit — use `npm run i18n:add`. The `npm run i18n:check` pre-commit hook blocks drift.
- **CSS**: 10 themed files under `renderer/css/` (`00-base.css` → `70-detail-misc.css`, plus `55-creality.css` and `57-elegoo.css`). When this file references a UI section, the styles live in the matching CSS module.
- **Per-brand camera widgets**: each printer folder has a `widget_camera.js` that owns all camera HTML + lifecycle. `inventory.js` calls `renderCamBanner(p)` (L11820) which dispatches — it never builds camera HTML inline. To add a brand: create `printers/<brand>/widget_camera.js`, export `render<Brand>CamBanner(p)`, add a case in `renderCamBanner`, CSS in `renderer/css/5X-<brand>.css`.
- **Line numbers drift** — if a range looks wrong, grep the anchor name. `npm run codemap:check` catches major drift at commit time.
