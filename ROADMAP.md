# Tiger Studio Manager — Roadmap

A single, opinionated map of what's done, what's coming, and what's parked.

- **Source of truth** for "what's next" — keep it in sync when picking up or finishing items.
- **Per-version detail** lives in [`README.md` → Changelog](./README.md#changelog). This file groups by domain instead of by date.
- **Handoff docs** for in-progress topics live in `docs/<topic>/NEXT_STEPS.md` (e.g. [`docs/rfid-vendors/NEXT_STEPS.md`](docs/rfid-vendors/NEXT_STEPS.md) for the multi-vendor RFID port).

Sizes: **S** = a few hours · **M** = a day · **L** = several days · **XL** = a week+

---

## ✅ Done

Grouped by domain. Versions in parentheses are the release that landed the feature; the changelog has the detail.

### Inventory & spools
- ✅ **Hard delete + anti-resurrection (cloudSync)** — spools deleted from Tiger Studio are hard-deleted from Firestore (no tombstone). Flutter's `cloudSync` flag prevents resurrection on reconnect. Legacy `deleted: true` tombstones auto-purged on first live snapshot. ISO with the printer pattern. (v1.7.4)
- ✅ **`updatedAt` rename** — `last_update` → `updatedAt` (ISO with printer model). All writes use `FieldValue.serverTimestamp()`. Legacy docs handled via `normalizeRow` fallback. (v1.7.4)
- ✅ **Container auto-assignment** — `resolveContainerForBrand` + `autoAssignMissingContainers`: every spool without a `container_id` gets one automatically on the next live snapshot, matched to its brand. (v1.7.4)
- ✅ Real-time Firestore sync of inventory · table + grid views · column sort · search filter (v1.0+)
- ✅ Spool detail side panel — color block, print settings, weight slider with debounced auto-save, links, container, raw JSON (v1.0+)
- ✅ NFC RFID reading via ACR122U (`nfc-pcsc`) — auto-opens the matching spool (v1.0+)
- ✅ Manufacturing date (TigerTag standard only) · TD1S sensor for color + TD value · color editing modal (v1.3+)
- ✅ **Twin-pair auto-link** by timestamp (factory programmer < 2 s window) (v1.4.x)
- ✅ **Twin-pair manual repair** — picker filtered by brand/material/type/RGB (v1.4.8)
- ✅ **Spool toolbox** in detail panel — Scan colour / Scan TD / Twin link / Remove from rack / Delete (v1.4.8)
- ✅ **Image cache** for spool photos — local persistence, color-fallback if remote dies
- ✅ **Add Product side panel** — full TigerTag creator iso to the mobile app: Brand / Material picker bottom-sheets with favourites pinned and persisted, mobile-style HSV colour picker (preset grid + custom 2D SV rectangle + rainbow hue slider), advanced mode revealing Type / Diameter / Aspect 1+2 / temps / TD / weight unit, live RFID Data preview (debug only), 28-byte UTF-8 cap on the colour-name field, integer-only fields with live clamp (v1.4.11 + v1.4.12)
- ✅ **TigerCloud — 100 % digital filaments** — Add Product writes a doc with id `CLOUD_<10-digit>` and the new "TigerCloud" tier badge (purple) when there's no physical chip yet. Promoted in place to a real 7-byte hex UID via the existing `uidMigrationMap` rename pipeline the moment the user programs a chip — every field, twin pointer, rack assignment and friend ACL follows the doc through the rename. Atomic, idempotent. Mobile companion ships the same label in the inventory bottom-sheet header AND the search index (v1.4.12)
- ✅ **Custom product image** (`url_img` + `url_img_user: true`) — DIY and TigerCloud spools can carry a product image from any external URL. Edit trigger in the colour square (or toolbox when an image is already set); also available in the Add Product advanced section. Broken URLs fall back to the colour placeholder; `isPlus` stays false so the spool keeps its DIY/Cloud identity. TigerTag+ images (from catalogue) are read-only. (v1.4.13)
- ✅ **Toolbox — Clear TD split-button** — hold-to-confirm trash button (1 200 ms) on the "Scan TD" toolbox row, visible only when `r.td != null`. Deletes the `TD` field via `FieldValue.delete()`. Row hidden entirely when no TD is set. (v1.4.13)
- ✅ **TigerCloud stat tile** — purple tile in the inventory header always showing the count of `CLOUD_` spools; DIY count now correctly excludes Cloud entries. (v1.4.13)

### Multi-account & auth
- ✅ Firebase auth with **per-account `firebase.app(uid)` instances** (independent sessions) (v1.4+)
- ✅ Login / Create / Forgot-password modal (Firebase) · Google sign-in via popup (v1.4+)
- ✅ Profiles modal · color avatars (13 presets + custom hex) · pseudo (`displayName`) flow
- ✅ **Migration from API-key accounts** to Firebase (auto-wipe of legacy entries on first launch)
- ✅ **UID format migration** — decimal big-endian → hex uppercase (with consent modal + lock-screen sweep) (v1.4.x)
- ✅ **Rack-shape migration** — flat fields → nested `rack` object (consent + progress UI) (v1.4.x)
- ✅ **Display-name setup modal** on first launch when pseudo is missing
- ✅ Debug mode toggle (admin-only via `users/{uid}.roles == "admin"`) — exposes Firestore explorer + API tab

### Friends & sharing
- ✅ **Discovery code `XXX-XXX`** (`publicKey`) — atomic claim with 10-retry transaction (v1.4+)
- ✅ **Access token** (`privateKey`, 40-char hex) used by Firestore rules to authorise friend reads
- ✅ **Bidirectional friendship** — accept writes both `friends/{uid}` docs in a single batch
- ✅ **Friend inventory view** in main interface — read-only banner, swap-back, defense-in-depth against owner-data bleed-through (v1.4.x)
- ✅ **Sidebar friends quick-list** with per-friend avatar colors + click-to-open
- ✅ Friend request modal (accept / refuse / **block**) · blacklist render
- ✅ **`isPublic` flag** in user doc (frictionless friend discovery) — *flag persists, public discovery page itself is in 🌱 backlog*

### Storage / racks
- ✅ **Rack create/edit modal** — presets + name + grid + total-slots label (v1.4+)
- ✅ **Drag-and-drop** between slots, slots ↔ unranked panel, rack head reordering (v1.4+)
- ✅ **Skyline-packing masonry** layout for rack cards
- ✅ **Slot locking** (right-click) · **Auto-fill / Auto-store / Auto-unstorage**
- ✅ **Rich hover tooltip** for filled slots (mini puck preview)
- ✅ **Drop-to-void unassign** — drop outside any rack card, cascade-out animation (v1.4.8)
- ✅ **Empty-spool handling** — visible in unranked, excluded from counts (v1.4.8)
- ✅ Press-and-hold (1.2 s) for destructive rack ops (Clear all / Delete) (v1.4+)

### Data layer
- ✅ **`tigertagDbService` — unified reference data layer** — single IPC service for all TigerTag lookup tables (brands, materials, aspects, types, diameters, units, versions). Renderer loads via `window.electronAPI.db.getLookups()`; no direct `fetch()` to JSON files. API → GitHub mirror (≤6 h stale) → `userData/db/tigertag/` → `assets/db/tigertag/` fallback chain. Atomic writes with JSON validation before overwrite. First-launch metadata seeding from `assets/db/tigertag/last_update.json`. (v1.7.0)

### 3D printer integration
- ✅ **Per-brand subcollections** under `users/{uid}/printers/{brand}/devices/{id}`
- ✅ **5 brands wired** in the brand picker: Bambu Lab · Creality · Elegoo · FlashForge · Snapmaker
- ✅ **Per-brand model picker** with thumbnails (`data/printers/<brand>_printer_models.json`)
- ✅ Printer side panel · drag-drop reorder · inline edit · online/offline indicator (HTTP ping) (v1.4.7)
- ✅ **Snapmaker Live integration** (Moonraker WebSocket) — live temperatures, filament per slot, print job card with thumbnail + progress + state + layer counter (v1.4.7)
- ✅ **Camera banner architecture** — per-brand `widget_camera.js` widgets; `inventory.js` calls `renderCamBanner(p)` dispatch only, never builds camera HTML inline
  - ✅ **Snapmaker** — iframe Crowsnest WebRTC player (port 80 `/webcam/webrtc`)
  - ✅ **FlashForge** — MJPEG `<img>` with single-stream error overlay + Retry (port 8898)
  - ✅ **Creality** — direct `RTCPeerConnection` + `<video>` (port 8000); probed on real Ender-3 V4 hardware; CSS in `55-creality.css`
- ✅ **Snapmaker LAN discovery** — mDNS browse + parallel port-scan + per-source batch sizing + brand-confirm filter + one-click add (v1.4.8)
- ✅ **Add by IP** collapsible widget — live IPv4 validation + Validate probe (v1.4.8)
- ✅ **Manual filament edit bottom-sheet** — Filament + Color sub-pickers (v1.4.8)
- ✅ **Read-only filament sheet** for RFID-locked extruders — same layout, native `disabled` controls (v1.4.8)
- ✅ **Settings reconnect** — saving an IP change tears down + reconnects WebSocket (v1.4.8)
- ✅ **FlashForge live integration** — HTTP polling port 8898, MJPEG camera, 5-slot matlStation grid (`Ext.` + `1A`–`1D`), click-to-edit per slot via HTTP API (v1.4.x)
- ✅ **Creality live integration** — WebSocket port 9999, heartbeat, live temps, CFS colour grid, WebRTC camera (v1.4.15)
- ✅ **Elegoo live integration** — MQTT port 1883, UDP discovery port 52700; job card, temp card, mono + 4-slot Canvas filament card, control card (XY circle jog pad + Z pill + X/Y home pill + fans + LED + files button), filament edit sheet (colour + material + vendor pickers), Files/History sheet, camera; surgical DOM patch on control card to eliminate MQTT-tick flash (v1.6.0)
- ✅ **Bambu Lab live integration** — MQTTS port 8883 TLS, LAN mode; job card, temp card, AMS filament grid (Ext. + module rows), camera widget, online badge (v1.6.0); filament edit bottom-sheet redesigned ISO with Snapmaker/Elegoo/FlashForge (2 rows, auto-close on color pick, "Edit filament" title) (v1.7.0)
- ✅ **Anycubic live integration** — **LAN**: MQTTS port 9883 (TLS 1.2), broker credentials imported from AnycubicSlicerNext config; ACE multi-box/slot grid (incl. external box), control panel (jog / home / disable-motors / light / fan / nozzle+bed temp / speed-mode), filament edit sheet, HTTP-FLV camera via ffmpeg (Kobra 3 V2 `/flv`; **Kobra X** tokenized `/live/<token>` learned from MQTT `info/report` — PR #2 by @ennisj). **Cloud**: cross-platform web-login (token + email), live status / temps / ACE slots / job thumbnail, realtime device controls (fan / temp / speed) via cloud-MQTT publish + light & pause/resume/stop via signed REST `sendOrder`, printer error alerts (e.g. code 10901). Cloud camera is gated server-side by Anycubic (out of scope). (v1.9.0 → v1.10.5)
  - ⚠️ **Known issue — Kobra X camera sleep/wake**: the printer's camera appears to go to sleep after a while; our `video/startCapture` then isn't enough to wake it (the `/flv` stays 404/no-push). Launching **AnycubicSlicerNext** wakes it — so the slicer sends an extra activation/keep-alive command we haven't reverse-engineered yet (Kobra X handshake is `initSuccess → joinSuccess → pushStarted`, vs just `initSuccess` on the Kobra 3 V2). A printer reboot also wakes it. **TODO**: sniff the slicer↔printer MQTT (MQTT Explorer on the printer broker, or `scripts/acu-cam-cdp.mjs`) while activating the camera, find the wake command, replay it in `_acuStartCapture`. Tracked in `printers/anycubic/PROTOCOL.md` §5c.
- ✅ **Printer grid & table — live status pills** — every connected printer shows its live state directly in the grid card and table row without opening the sidecard. ISO visual style: same `snap-job-state` pill classes as the sidecard (spinner on printing, colour-coded per state). Progress bar + `XX% · Nh Nm` for active jobs; filename truncated below the bar. Online badge in cards now matches the sidecard pill (coloured background + border). (v1.7.1)
- ✅ **Grid Online/Offline partition — fixed for all brands** — `ctx.onPrinterGridChange` referenced an out-of-scope variable (`_printerSub`) causing a silent ES-module `ReferenceError` that swallowed every re-partition call. Also fixed: shared RAF coalescing flag across `statusChanged=true/false` paths blocked the grid re-partition on fast LANs. Both fixed in all 4 brand drivers. (v1.7.1)
- ✅ **Cam wall card → click → sidecard** — clicking a camera wall card opens the sidecard for that printer; CSS hover feedback on `.cam-wall-card`. (v1.7.1)
- ✅ **FlashForge MJPEG multiplexer** (`cam_mux.js`) — single `fetch()` stream shared across cam wall tile + sidecard simultaneously, respecting FlashForge's 1-client limit. Auto-stops when the last consumer unregisters. (v1.7.1)
- ✅ **Creality camera persistence** — `_activeIp` guard prevents WebRTC restart on WS reconnect; `#creCamContainer` persists in DOM with CSS visibility toggle. (v1.7.1)

### Sensors & devices
- ✅ **ACR122U NFC reader** (USB) via `nfc-pcsc` — `main.js` ↔ renderer IPC bridge
- ✅ **TD1S sensor** integration — TD + color reading, auto-detect on USB plug, log panel
- ✅ **TigerScale heartbeat** — `users/{uid}/scales/{mac}` with 90s online threshold, scale panel render
- ✅ **TigerScale live WebSocket panel** — connect/disconnect toggle, WS event log, gradient live card matching mobile app, send-status badge, filament mini-panel (WS-driven: brand/material/color from firmware), 56 px weight display, UID reader 2-col grid with `resolve()` twin logic (vert = cloud, blanc = physique), TARE hold-to-confirm 1 s → POST `/api/tare`, card + button hidden on disconnect. (v1.5.0)
- ✅ **TD1S button in Add Product panel** — icon in the ADP header: disconnected → opens connect modal; connected → glows green and auto-fills colour HEX + TD value fields on scan. State syncs on every `onStatus` event and `openAddProductPanel()` call. (v1.4.13)

### Distribution & i18n
- ✅ **9 locales** — en · fr · de · es · it · zh · pt (Brasil) · pt-pt · pl
- ✅ **Plural inflection** for all duration keys (`{one, other}` everywhere) (v1.4.9)
- ✅ **Auto-updater** via GitHub Releases (electron-builder)
- ✅ **macOS code signing + notarization** (App Store Connect API Key path)
- ✅ **Windows code signing** via Microsoft Trusted Signing (Azure)
- ✅ **Cross-platform builds** — macOS (x64 + arm64), Windows (NSIS), Linux (AppImage)
- ✅ **Diagnostic report** — last 50 errors + env in a copyable Markdown blob
- ✅ **Dark window chrome** — `nativeTheme.themeSource = 'dark'` forces the native macOS/Windows title bar to dark mode (dark background, white text). `hasShadow: false` removes the OS-level drop shadow along the window edges. (v1.4.13)
- ✅ **Update status icon** — icon to the right of the cloud health indicator: orange spinning refresh while downloading, green glowing dot when ready to install. Tooltip via the existing `.health[data-tooltip]` system. Click when ready → `installUpdate()`. (v1.4.13)

### Dev tooling
- ✅ **`npm run i18n:add`** — one command updates all 9 locales (v1.4.9)
- ✅ **`npm run i18n:check`** + **pre-commit hook** (.githooks/) — blocks commits on locale drift (v1.4.9)
- ✅ **CSS modularization** — split 8047-line `inventory.css` into 8 themed files under `renderer/css/` (v1.4.9)
- ✅ **`renderer/CODEMAP.md`** — feature → line range index for the 12k-line `inventory.js` (post-v1.4.9)
- ✅ **Panel shadow bleed fix** — `detail-panel`, `sfe-sheet` (Snapmaker filament edit) and `rp-side` (rack side panel) were leaking `box-shadow` into the viewport when translated off-screen. Shadow now applied only on `.open` / `.is-open`; transitions include `box-shadow .25s`. (v1.4.13)

---

## 🚧 Next up — concrete work

Items where the spec is written and we know roughly how to do it. Ranked by ratio (impact / effort × risk).

> ### 🐿️🐿️ Sprint mode — days, not months
>
> The 3 top-tier items below (POD + Multi-brand live + Printer control panel) total ~**XXL on paper for a single developer over months**. We don't have months; we have **a few days**, working as a duo (Tic & Tac).
>
> **What this changes**:
> - **Pair on every non-trivial sub-feature**. Pair-programming roughly doubles single-developer speed on tricky parts and catches subtle bugs immediately (much cheaper than fixing them post-merge). Trivial stuff (rename, mechanical refactor) one of us takes solo while the other moves the next ticket forward.
> - **Maximize reuse, minimize new code**. Every sub-feature has a `♻️ Reuses` section — read it FIRST. The estimate sizes already assume aggressive reuse; if a path looks like "this is going to be 2k lines from scratch", **stop and find what to reuse instead**.
> - **MVP first, scope expansion later**. Each sub-feature has a `🐿️ Sprint scope` line: the minimum that ships in a single day session vs. the full version. Ship the MVP, mark the rest as Phase 2 in the same entry, **don't let perfect block good**.
> - **Debug interfaces matter from day 1**. Every new code path gets a debug surface (raw log, force-X toggle, inspector) — see the `🐛 Debug surface` block in each entry. We've been bitten enough by silent failures (the i18n-check hook found 24 silent ones in v1.4.9 alone) to know that debug-from-day-1 is cheaper than debug-when-things-break.
> - **Ship daily**. Even partial work merges to `main` daily (gated behind a feature flag if not user-facing yet). Long-lived branches kill velocity at this pace.
>
> **Prioritisation in days-not-months mode**:
> - Day 1: highest-reuse / lowest-risk items (POD A, F1 driver extraction, G1 print job control)
> - Day 2-3: dependents of day 1 (POD B/E, F2 Creality driver, G2/G3/G4 control)
> - Day 4-5: bigger lifts that benefit from day 1-3 foundations (POD C/D, F3 Bambu, G5 files)
> - Beyond: F4 FlashForge, F5 Elegoo (gated), G6 advanced
>
> Effort sizes (S/M/L/XL) below are still based on single-developer convention so they stay comparable to historical estimates — **mentally divide by ~1.7×** for pair-work output.
>
> #### 🗓️ Day-by-day Tic-and-Tac plan (illustrative — adjust as we ship)
>
> Items chosen for ratio (existing-code reuse × user value × low risk). Cross-references point to sub-feature IDs in the entries below.
>
> | Day | What lands | Why this slot |
> |---|---|---|
> | **D1** AM | **POD A** (multi-reader IPC) | ~30 min of edits across 3 files; unblocks B/C/D/E |
> | **D1** AM | **F1** (extract `drivers/snapmaker.js`) | Pure refactor of L5557-7216 + L8030-8226. Pair on it — one reads, one moves blocks. CODEMAP gets a fresh entry. |
> | **D1** PM | **G1** (print job control: pause/resume/cancel/cooldown/E-stop) | `snapSendGcode` already exists, `setupHoldToConfirm` already exists — pure UI assembly + 5 IPC wrappers. Big user value. |
> | **D1** PM | **POD E (UX half)** — diff modal for chip-pending changes | ~80% of UX already shipped (`needUpdateAt`, banner, badges, i18n, twin-aware batch clear). Stub the chip-write call, ship the diff modal. |
> | **D2** AM | **POD B** (scan → inventory + twin auto-detect) | Requires the TigerTag JS parser at `renderer/lib/rfid/tigertag.js`. Spec is 386 lines so the parser writes itself. Plug into `normalizeRow` shape. |
> | **D2** AM | **F2** (`drivers/creality.js`) | Built **in parallel** with snapmaker.js — Rule of Three. Test on real Creality K-series hardware if available; otherwise stub the deltas + ship as opt-in. |
> | **D2** PM | **G3** (temp & filament) | The Snapmaker bottom-sheet already does the temp-and-load dance — extract the helper, wire it to per-printer config + material lookup table chips. |
> | **D2** PM | **G2** (homing + jog) | All `snapSendGcode` wrappers + 4-direction pad UI. Mid-print lockout reads existing `printer.status`. |
> | **D3** AM | **POD C** (write fresh chip) | New `nfc:write-pages` IPC handler + wizard UI. Spec has the byte layout — translation is mechanical. **Pair on this one** — it's irreversible and benefits from 4-eye review. |
> | **D3** AM | **POD D** (recycle to NDEF) | Reuses C's `nfc:write-pages` + new NDEF builder. Independent of which sub-feature ships first; pick based on which printer you have on hand. |
> | **D3** PM | **G4** (live tuning sliders) | S-effort, fast win. Reuses the weight-slider debounce pattern. |
> | **D3** PM | **F6** (brand picker UX cleanup) | Required so Creality (and future brands) become clickable with the right per-brand forms. |
> | **D4** AM | **POD E (write half)** — wire actual chip-write into the diff modal | Now that POD C exists, plug its write helper in behind the modal's "Apply" button. |
> | **D4** all | **F3** (Bambu MQTT driver) | Biggest single-day item. Pair work strongly recommended — one drives MQTT lib + protocol, the other adapts the live block UI to Bambu's status shape. |
> | **D5** AM | **G5** (file browser + custom G-code console) | Reuses thumbnail pipeline (`snapBestThumb` etc.) + drag-drop pattern from racks. |
> | **D5** PM | **F2b** (`klipper-generic.js` + planned extraction of `_moonraker-base.js`) | With three Klipper-class implementations now shipped, the empirical common surface is clear — refactor with confidence. |
> | **D6+** | F4 FlashForge, G6 advanced, F5 Elegoo (research-gated) | Long-tail items, ship as reach permits. |
>
> **Stretch goals if any day finishes early**: README screenshots (🎖️), Firestore Security Rules for `roles`/`Debug` (🏅, S-effort), pre-commit hook extensions (🏅).
>
> **Re-plan checkpoints**: end of D2 and end of D4. Move items between days based on what's actually shipping vs blocking.

### 🥇 TigerTag POD — dual-reader scan / write / recycle workstation

The TigerTag POD is a desktop hardware unit with **two ACR122U USB NFC readers**. It turns the desktop app into a one-stop tool for the full chip lifecycle — read into inventory, write fresh chips, repurpose chips that are no longer needed.

Today, only **one** reader is supported (single-card detail-panel-open flow). The POD use case requires a richer model: identify which slot fired, treat both slots as a coordinated workstation, and add **surgical page-level write** capability (never erase-and-rewrite — see *Cross-cutting: surgical page-level writes* below).

#### 🔧 Sub-feature A — Multi-reader detection  ·  **Effort: S**  ·  **Risk: low**
The IPC payload from `main.js` doesn't carry a stable reader id, so when 2 readers are connected the renderer overwrites slot 1 with slot 2 on every `reader-status` message. Fix: include `reader.name` (or a hashed `slotId`) in every IPC payload, and the renderer keeps a `Map<slotId, status>` instead of one global state.

♻️ **Reuses (mostly already done)**:
- `main.js` L154-200 (`initNFC()`) — `nfc.on('reader', …)` already fires per reader, just need to add `reader.name` to the IPC payload (~5 lines).
- `preload.js` L20-24 — `onReaderStatus` / `onRfid` callbacks already in place; payload just gets one extra field.
- `inventory.js` L12214-12266 — Renderer-side handler already wired; needs to switch from "single global status" to "Map keyed by slot id" (~30 lines).

**UI**: dual-status pill in the header (`POD slot 1 ✓ · POD slot 2 ✓`) replacing the single `#rfidStatus`.
**Persistence**: assign each reader a stable role (`primary` / `secondary`) on first plug-in, persist in `localStorage` keyed by the reader name so the same physical reader keeps the same slot across launches.

#### 🔧 Sub-feature B — Spool scan workflow → inventory  ·  **Effort: M**  ·  **Risk: low**
**Trigger**: chip detected on either slot. If a matching `state.rows` entry exists → open detail panel (current behaviour, kept).

**New**: if the UID is unknown (not yet in Firestore inventory), open a **new "Add spool from scan" sheet** prefilled with the parsed TigerTag fields (TAG_ID, PRODUCT_ID, MATERIAL_ID, ASPECT, TYPE, DIAMETER, color RGB, …). One-click "Add to inventory" writes to `users/{uid}/inventory/{spoolId}`.

**Twin auto-detect**: if a chip is detected on slot 2 within ≤ 5 s of a chip on slot 1, AND both share the same `id_brand` + `id_material` + `id_type` + RGB, propose a "These are twins → link?" inline confirmation.

♻️ **Reuses (substantial — most of the parsing + matching logic exists)**:
- `inventory.js` L503-576 — `normalizeRow(spoolId, data)` already maps the parser output to the renderer's row shape. Reusable verbatim.
- `inventory.js` L2410-2558 — `findTwinCandidates()` (filter compatible spools by brand/material/type/RGB) + `linkTwinPair()` (atomic batch write of `twin_tag_uid` cross-references). The 5s-window detection is new logic, but the linking step is a 1-line call.
- `inventory.js` L8241-8633 — `snapAddDiscoveredPrinter()` is the architectural twin of "Add spool from scan" — same one-click write-to-Firestore-and-open-detail pattern. Copy as a starting template.
- [`docs/rfid-vendors/tigertag.md`](docs/rfid-vendors/tigertag.md) — full byte-layout spec (offsets, field types, lookup tables). Need to write the actual byte parser (no `renderer/lib/rfid/tigertag.js` exists yet — `normalizeRow` works on Firestore docs, not raw bytes).
- The TigerTag spec sheet contains pseudo-code transcribed verbatim from the Python OpenRFID reference — most of the JS port is mechanical translation.

#### 🔧 Sub-feature C — Write fresh TigerTag chip  ·  **Effort: M**  ·  **Risk: low-medium**
**Goal**: blank NTAG → fully-formatted TigerTag chip with brand/material/color/RGB metadata, ready to be put on a new spool.

**`nfc-pcsc` API**: supports `reader.write(blockNumber, buffer)` and `reader.transmit(cmd, responseLen)` — raw APDU available. Need a new `ipcMain.handle('nfc:write-pages', …)` channel in main.js that runs the read-diff-write-verify loop (see *Cross-cutting: surgical page-level writes*).

**UI**: a new "Create chip" wizard in the spool detail panel (visible only when the POD is detected and a blank chip is on slot 2). Steps: pick brand/material/type/diameter → pick color (TD1S sensor, color picker, or copy from another chip) → confirm → write all 4-byte chunks per [tigertag.md](docs/rfid-vendors/tigertag.md). Show a per-page progress bar.

**Signature** *(non-issue by design)*:
- **TigerTag (basic)** chips are unsigned — write freely.
- **TigerTag+ (premium)** chips carry a factory ECDSA signature computed only over **pages 4 & 5** of the chip — the `TAG_ID` + `PRODUCT_ID` immutable identity. Every other field (`MATERIAL_ID` onwards, color, TD, aspect, etc.) is on later pages and is **freely rewritable without invalidating the signature**. The signature stays valid because we never touch pages 4-5.
- **Implementation guard**: refuse any write whose target page < 6. The write path should refuse to touch the identity region as a safety net even if a future bug computes the wrong offset.

♻️ **Reuses (mostly new code, but spec is comprehensive)**:
- [`docs/rfid-vendors/tigertag.md`](docs/rfid-vendors/tigertag.md) — 386-line spec with full byte layout, field types, lookup table references. The encoder is mechanical translation.
- `inventory.js` L399-491 — existing lookup tables (`brandName`, `materialLabel`, `typeName`, `dbFind`) that resolve display labels back to IDs for chip encoding. Reuse for the wizard's pickers.
- `data/id_brand.json` / `id_material.json` / `id_aspect.json` / `id_type.json` / `id_diameter.json` — the same lookup files used at parse time, used in reverse at encode time.
- TD1S sensor reading code (`inventory.js` L12267-12389) — reusable for the "pick color via TD1S" wizard step.
- Output of Sub-feature A (multi-reader detection) — without it, the wizard can't know which slot has the blank chip.

**Risk**: low-medium — surgical page-level writes cut the failure surface, but chip writes are still non-reversible at the byte level. Stage on disposable NTAGs first.

#### 🔧 Sub-feature D — Recycle TigerTag → plain NFC
- **Goal**: a chip the user is done with (broken spool, weight depleted, sold) gets repurposed as a normal NFC tag — keychain, badge, business card, URL launcher.
- **Record types offered**:
  - 🌐 **Web URL** — text input with auto-https prefix
  - 👤 **vCard** — name, email, phone, company; renders as standard vCard 3.0
  - 📝 **Plain text** — short note (≤ 100 chars)
  - 📞 **Tel** — `tel:` URI
  - ✉️ **Email** — `mailto:` URI with subject/body
  - 🔗 **Wi-Fi** — SSID + password + auth type (WPA2 default)
- **Steps** (all chip writes obey the surgical page-level rule, see *Cross-cutting* below):
  1. **Read** — confirm it's a TigerTag (so we don't accidentally repurpose someone else's tag), and confirm the current Firestore spool is either deleted or has `weight_available <= 0`.
  2. **Compute target layout** — build the full NDEF byte layout for the chosen record type. Pages 4-5 (`TAG_ID` + `PRODUCT_ID`) stay as-is — even on recycle, the immutable identity is never touched, so a "former TigerTag" remains identifiable as such.
  3. **Diff against current chip pages** — page-by-page comparison; build the minimal write list. Pages that already hold the target bytes get skipped.
  4. **Write only the diff pages** — using the cross-cutting `nfc:write-pages` helper. No blanket "erase to 0x00" pass.
**Confirmation**: hold-to-confirm 1.5 s pattern (same as Delete spool) before triggering the write sequence. Show "This action cannot be undone — chip data will be replaced."

**Where in code**: new file `renderer/lib/rfid/tigertag-recycle.js` for the byte-level operations, `renderer/lib/rfid/ndef-builder.js` for the NDEF record generation. UI lives in a new "Recycle" tab inside the existing toolbox of the spool detail panel (visible only for empty/deleted spools when a chip is on the POD).

♻️ **Reuses**:
- `inventory.js` toolbox section in the spool detail panel (visible at L4096-4283 per CODEMAP) — the new "Recycle" entry slots in next to the existing Delete tool with the same hold-to-confirm CSS.
- The `nfc:write-pages` IPC handler from Sub-feature C (centralized read-diff-write-verify loop). E and D both call through it.
- NDEF record format is widely documented (NFC Forum spec) — no existing code, but plenty of JS reference implementations (`ndef-lib`, `@ndef/web`) to study.

**Effort**: M  ·  **Risk**: low — surgical writes mean the immutable identity stays intact and the user can always tell the chip was originally a TigerTag.

#### 🔧 Sub-feature E — Sync edits back to chip (write-when-present)  ·  **Effort: S**  ·  **Risk: low**
The user can already edit TD and color from the spool detail panel today (TD modal + Color modal → Firestore). The chip is **not** updated automatically — instead, the spool gets flagged `needUpdateAt = Date.now()`, a refresh badge appears in the table / grid / detail panel, and a banner offers a "Updated" button which the user clicks **after** re-programming the chip with a separate tool. With the POD, this last step becomes automatic.

♻️ **Reuses (~80% of the UX exists already)**:
- `inventory.js` L3351 — `CHIP_FIELDS = ["TD", "online_color_list"]` already lists chip-bound fields.
- `inventory.js` L3358 — `_saveTdHex()` already sets `needUpdateAt = Date.now()` when a `CHIP_FIELDS` member is in the update. Twin-aware (writes both spools in a single batch).
- `inventory.js` L3263-3294 — existing "Updated" button click handler already does the batch-clear of `needUpdateAt` on spool + twin. The new POD flow just triggers the same code path programmatically.
- `inventory.js` L572 — `normalizeRow` already exposes `needUpdateAt` on the row shape.
- `inventory.js` L2852, L2901, L3777, L4068 — existing badges + banner DOM rendering for chip-pending state. Zero CSS work needed.
- `chipPendingHint` / `btnChipDone` i18n keys — already translated in 9 locales.
- The `nfc:write-pages` IPC handler from Sub-feature C — same write infrastructure.

What changes with the POD:
- **Detect-on-slot logic**: when a chip lands on the POD AND `state.rows.find(r.uid==chipUid).needUpdateAt != null`, instead of opening the detail panel, open a **"Sync changes" modal** showing a diff (`color: #6e6e6e → #d83b3b`, `TD: 1.85 → 2.10`) with a single "Apply to chip" button.
- **Batched diff write**: on confirm, the renderer asks main.js to write all diff fields in one APDU sequence (fewer writes = lower risk of partial state). On success → batch-clear `needUpdateAt` on the spool + its twin (already wired by the existing "Updated" button code path — just trigger it programmatically).
- **Read-back-and-verify** after every write — refuse to clear `needUpdateAt` if any byte didn't take.
- **Multi-pending UX**: if 3 fields were edited since the last sync, the modal shows all 3 in one list — same chip write, one round trip. (The existing `needUpdateAt` is just a timestamp, but at sync time we re-parse the chip and compare to the Firestore doc, so the diff is automatically the union of all pending edits — no need to track per-field flags.)
- **Writable field set**: the spec at [`docs/rfid-vendors/tigertag.md`](docs/rfid-vendors/tigertag.md) suggests we could expand `CHIP_FIELDS` beyond `TD` + `online_color_list` to include `MATERIAL_ID`, `ASPECT1_ID`, `ASPECT2_ID`, `TYPE_ID`, `DIAMETER_ID`. Out of scope for first ship — keep the existing 2-field set, then expand. All these fields live on pages ≥ 6, safely away from the signature.
- **Signature**: not an issue (see Sub-feature C). The TigerTag+ factory signature is computed only over pages 4-5 (`TAG_ID` + `PRODUCT_ID` — immutable identity), and Sub-feature E never touches those pages. Basic TigerTag chips are unsigned. The signature stays valid through any number of edit cycles.

**Dependency**: Sub-feature C (write capability). E can ship the **diff modal + UX** independently and stub the actual write to no-op until C lands; that gives users a clearer "what changed" view today even without the chip-write path.

#### 🐛 Debug surface — POD
The existing app already gates a `🐛 Debug` panel on `users/{uid}.Debug = true` (admin-set), with a Firestore explorer + last-API-request inspector. The POD work doubles the surface area of NFC code, so it gets dedicated debug interfaces:

- **🔬 NFC log tab** (new tab in the Debug panel) — every `card`, `card.off`, `error`, and `end` event from every connected reader, with raw UID hex, parsed UID, parser output (or "unknown format" + raw bytes), reader name, slot id, timestamp. Newest first; clearable; copy-to-clipboard for support tickets. Reuses the existing debug log scroll/copy CSS from the Snapmaker WS log.
- **🔬 Chip pages dump** — when a chip is on either slot, debug-only "Read all pages" button shows the full byte dump (page 0 to N) with offsets, hex, and the parser's interpretation side-by-side. Lets the user spot field-decode mismatches at a glance.
- **🔬 Write log tab** — every `nfc:write-pages` invocation: `{slotId, pages: [{index, before, after}]}` plus the read-back-and-verify result page-by-page. Failed verifies stay in the log highlighted red. Critical for debugging Sub-features C / D / E.
- **🔬 Force POD mode toggle** in Settings → Debug — surfaces the dual-slot UI even with 1 reader plugged in. Already mentioned in *Cross-cutting: POD detection model* below; wire it as a debug-only setting.
- **🔬 Twin-pair candidate inspector** (Sub-feature B) — when a chip lands on slot 1, show a debug-only banner listing every `findTwinCandidates()` match with the matched fields. Helps catch the "should have matched but didn't" class of bugs.
- **🔬 Pending diff inspector** (Sub-feature E) — debug-only "Show pending changes" link in the chip-update banner, expanding to the full Firestore-vs-chip diff with all field types (not just the simplified UI view).

**Reuses**: existing `inventory.js` L4355-4365 (debug panel toggle), L4697-4777 (Firestore explorer pattern), L6681-7130 (Snapmaker WS request log — same UI shape, just a different feed). Most of the debug surfaces are new tabs + new feeds plugged into the existing debug panel chrome.

#### 📐 Cross-cutting: POD detection model
- The app is **not** POD-aware today — it just sees N readers. Detection rule: if the user has ≥ 2 ACR122U readers connected at the same time, surface the "POD mode" UI; otherwise stay in single-reader mode (current behaviour, kept identical).
- A user-visible toggle in Settings → POD lets them force POD mode even with 1 reader (for testing/debug).

#### 📐 Cross-cutting: surgical page-level writes (never erase-and-rewrite)
**Hard rule for every chip-write code path** (B's twin link doesn't write the chip; C writes fresh; D recycles; E syncs edits):
1. **Read first** — every write operation begins with a fresh chip read.
2. **Diff at page granularity** — MIFARE Ultralight pages are 4 bytes each. Build the target byte layout, compare page-by-page with the current chip read, produce a list of `{page, bytes}` only for pages whose 4-byte content differs.
3. **Write only the diff pages** — never blanket-overwrite a region. Each page written = one APDU, one write cycle. Skipping unchanged pages saves write-cycle endurance and rules out partial-state corruption on the unchanged regions.
4. **Pages 4 & 5 are sacred** — `TAG_ID` + `PRODUCT_ID` (the factory-signed identity). The write helper rejects any `{page < 6}` entry as a defensive guard, even if upstream code asked for it by mistake.
5. **Read-back-and-verify** — after each write, re-read the page and bit-compare to the intended bytes. If any byte differs, abort the sequence and surface a clear error in the UI (don't pretend the write succeeded).
6. **No "erase"** — the recycle flow (D) is implemented as "compute the NDEF target layout, diff against current pages, write only the differing pages". The pages that happen to already hold the target bytes get skipped. There's no separate erase pass that overwrites with `0x00`.

Implementation home: `main.js` exposes one IPC handler `nfc:write-pages` that takes `{slotId, pages: [{index, bytes}]}` and runs the read-diff-write-verify loop. All four sub-features (C / D / E and any future write) call through it. Centralising the code path means the safety rules above live in one place.

#### 🧮 Total effort
- A: S, B: M, C: M, D: M, E: S — **~L combined** (was XL before the signing-question removal cut C from L to M).

#### 🎯 Recommended sequence
1. **A — multi-reader IPC fix** (clears the way, no UX surface)
2. **B — scan → inventory + twin auto-detect** (immediate user value; reuses existing parser + twin-link code)
3. **E (UX half) — diff modal for pending chip changes** (the existing `needUpdateAt` flag already drives the UX; the new modal shows *what* would change, even before the chip-write side exists — replace the manual "Updated" button with this richer view)
4. **D — recycle to NDEF** (popular feature, low risk; useful even before write-chip lands)
5. **C — write fresh chip** (no longer blocked on signing — pages 4-5 stay untouched, factory signature stays valid)
6. **E (write half)** — once C lands, plug the actual chip-write call in behind the diff modal's "Apply" button. The `needUpdateAt` clear already exists; just promote it from manual to automatic on successful write.

---

### 🥈 Multi-brand live integration — Snapmaker-parity for the other brands

Today only **Snapmaker** has a live block (real-time temps, filament per slot, print-job card, camera). The four other brands in the picker (Bambu Lab · Creality · Elegoo · FlashForge) render as **read-only cards** with an HTTP ping for online/offline. This entry brings them — plus a generic Klipper bucket and Wondermaker — to feature parity.

#### 🏗️ Architectural prerequisite — Driver layer
The Snapmaker code (renderer/inventory.js L5533-7216 per CODEMAP) is monolithic. Before adding new brands, extract a small `LiveDriver` interface so each protocol slots in cleanly:

```js
interface LiveDriver {
  connect(printer, callbacks)   // open transport, start streaming
  disconnect(printer)
  sendGcode(printer, script)
  getStatus(printer)            // sync getter, reads cached snapshot
  getCameraStream(printer)      // optional — returns URL or null
}
```

##### Rule of Three — no premature `moonraker.js`
The current Snapmaker code talks Moonraker, but it carries Snapmaker-isms that are NOT generic Moonraker behaviour:
- `/machine/system_info` filter on `machine_type` containing `"Snapmaker"` (in the LAN scan flow)
- Filament bottom-sheet wired to U1's 4-extruder layout + Snapmaker material/vendor palette
- Camera URL pattern (Snapmaker custom WebRTC stream)
- Per-printer macros for filament load/unload (Snapmaker firmware specific)

Extracting a `drivers/moonraker.js` from a single implementation = textbook leaky abstraction. The implementation looks generic, then breaks when the second Klipper-class printer lands and expects a different camera path / material palette / macro set.

**Discipline**:
1. **1st impl** (Snapmaker, the existing code) → `drivers/snapmaker.js`. All current behaviour preserved verbatim.
2. **2nd impl** (e.g. Creality K1) → `drivers/creality.js`. Built in parallel, even if 80% of the code looks like a copy of `snapmaker.js`. We **resist** extracting common parts at this stage.
3. **3rd impl** (e.g. Wondermaker or generic Klipper) → THEN we have enough comparison points to identify what's truly common, and extract a `drivers/_moonraker-base.js` that the brand drivers compose with.

Cost: ~20% temporary duplication across drivers 1 & 2. Benefit: zero forced re-refactor when the 3rd brand reveals a Snapmaker-only assumption that wasn't visible from the Snapmaker code alone.

##### Driver map (post-3rd-impl factoring)
| Driver | Protocol | Brands / models |
|---|---|---|
| `drivers/snapmaker.js` | Moonraker WS (`:7125`) + Snapmaker-specifics | Snapmaker (today) |
| `drivers/creality.js` | Moonraker WS (`:7125`) + Creality-specifics | **All Creality printers in scope** — K1, K1 Max, K2 Plus, current-gen Enders running Klipper. One driver covers every model on the Creality side because they share the same Moonraker-Klipper stack. **Per-model specialization is a future concern** — only forked into `creality-k2.js` etc. if/when a specific model needs different behaviour (UI/macros) that pollutes the base. |
| `drivers/klipper-generic.js` | Moonraker WS (`:7125`) — assumed-vanilla path | Wondermaker, generic Klipper machines (any printer running Moonraker that's not one of the named brands) |
| `drivers/_moonraker-base.js` | shared primitives (WS lifecycle, gcode, status subscribe) | extracted only after 3 implementations exist and the common surface is empirically clear |
| `drivers/bambu-mqtt.js` | MQTTS on `:8883` | Bambu Lab (entire range — same MQTT API across X1/P1/A1/H2D) |
| `drivers/flashforge-http.js` | HTTP polling on `/control/*` | FlashForge (AD5X / 5M / 5M Pro) |

**Per-brand vs per-model rule of thumb**: one driver per **brand** unless a specific model breaks the brand's protocol contract. Most brands have one stack across their lineup (Bambu MQTT, Creality Klipper); the per-model split is for outliers.

A `drivers/index.js` dispatcher routes by `printer.brand` (with a `printer.protocol` override for "generic Klipper" printers that need explicit Moonraker selection without being one of the named brands).

A possible 7th driver later: `drivers/elegoo-mqtt.js` for Centauri — **research-gated** (see F5 below).

#### Per-brand status

| Brand | Protocol | Discovery | Driver | Status |
|---|---|---|---|---|
| **Snapmaker** | Moonraker WS (`:7125`) | mDNS `_snapmaker._tcp.local.` | `snapmaker` | ✅ shipping (lives in `inventory.js` today, extracted to its own driver in F1) |
| **Bambu Lab** | MQTTS (`:8883`) — LAN mode + Cloud bridge | mDNS `_bambu._tcp.local.` (broadcasts model + serial) | `bambu-mqtt` | New driver. Auth = printer access code (printed on device, user enters once). LAN mode requires "Local print" enabled on the printer. |
| **Creality** (K1, K1 Max, K2 Plus, current-gen Enders running Klipper) | Moonraker WS (`:7125`) | mDNS `_octoprint._tcp.local.` (when present) or hostname-based | `creality` (single driver across all current models — see *Per-brand vs per-model rule of thumb* above) | New driver — built **in parallel** with `snapmaker.js`, even if much of the code looks similar. We resist extracting a shared `_moonraker-base.js` until the 3rd Klipper-class brand lands (Rule of Three above). |
| **Elegoo Centauri** | MQTTS — Chitu cloud bridge | TBD (research) | `elegoo-mqtt` (research-gated) | Lower priority — research first whether LAN mode exists or if cloud-only. |
| **FlashForge** (AD5X, 5M, 5M Pro) | HTTP polling on `:8898` for status; WebSocket on `:8899` for live updates on newer firmware | UDP broadcast on `48899` with magic byte | `flashforge-http` | New driver. Less rich than Moonraker (no temperature stream — poll every 2s). |
| **Generic Klipper / Wondermaker** | Moonraker WS (`:7125`) | mDNS varies; falls back to manual IP | `klipper-generic` | New driver — at this point we have 3 Klipper-class implementations (Snapmaker + Creality K + Generic) and the empirical common surface is clear, so this is the right moment to extract `_moonraker-base.js`. New brand entry "Klipper machine" with a manual-IP-only flow (auto-discovery is hit-or-miss across Klipper distros). |
| (Future) Prusa MK4 / MINI | PrusaLink HTTP (`:80`) | mDNS `_prusalink._tcp.local.` | `prusa-http` | Out of scope for first ship; add to the model JSON files later. |

#### 🔎 Multi-brand LAN discovery — unified "Scan network" *(can ship before the live drivers)*  ·  **Effort: M**  ·  **Risk: low**

Mirrors the mobile Flutter scanners on the desktop. Today **+ Add printer → Scan** only finds **Snapmaker** (mDNS `_snapmaker._tcp` + port-scan). Generalize it so a single scan surfaces printers of **every** brand on the LAN, each ready for one-click add — independent of whether that brand has a live driver yet (discovery → add → read-only card is already useful, and the live block lights up later as F2-F5 land).

**Per-brand discovery probe** — all already documented in `renderer/printers/<brand>/PROTOCOL.md` (those specs were derived from the Flutter scanners, e.g. `creality_scan_printers.dart`), so each one is a straight Dart→Node translation:

| Brand | Probe | Spec |
|---|---|---|
| Snapmaker | mDNS `_snapmaker._tcp.local.` (✅ done) | — |
| Bambu Lab | SSDP `M-SEARCH ssdp:discover` → UDP multicast `239.255.255.250:1900` + active TLS cert sniff on `:8883` (cert subject/issuer contains `bambu`/`bbl`) | bambulab PROTOCOL §12 |
| Creality | TCP `:9999` open → WS handshake → confirm `isCrealityLike` JSON (drop unconfirmed hosts) | creality PROTOCOL §scan |
| Elegoo | UDP datagram to `:52700` per host → parse reply | elegoo PROTOCOL §13 |
| FlashForge | HTTP `POST :8898/detail` probe + UDP multicast `225.0.0.9:19000` payload `"Hello World!"` (older Adventurer-era models) | flashforge PROTOCOL §2.1 / §2.6 |

> ⚠️ Spec drift to resolve from the Flutter source: the per-brand status table above lists FlashForge discovery as "UDP broadcast `48899` magic byte", while flashforge PROTOCOL §2.6 says multicast `225.0.0.9:19000` "Hello World!". Confirm against the Flutter scanner before implementing.

**Where the code goes** — all probes run in the **main process** (the Chromium renderer can't open raw UDP/TCP sockets), exposed to the renderer over IPC, exactly like the Snapmaker scan + Bambu MQTT already do:
- UDP (SSDP, Elegoo, FlashForge multicast): Node `dgram`.
- TCP / TLS cert sniff (Creality, Bambu): Node `net` / `tls`.
- mDNS: `bonjour-service` (already a dependency since v1.4.8).

♻️ **Reuses (existing, exploitable)**:
- `inventory.js` L8030-8226 — subnet enumeration + batched port-scan engine. Already brand-agnostic; feed it the union of brand ports and dispatch the matching probe per open port.
- `bonjour-service` mDNS in `main.js` — browse extra service types (`_bambu._tcp`, `_octoprint._tcp`, …) alongside `_snapmaker._tcp`.
- `snapAddDiscoveredPrinter()` (L8241-8633) — the one-click "write printer doc to Firestore + open detail" pattern; generalize to set `brand` from the matched probe.
- Scan UI panel (`openSnapmakerScan` & friends, L8410+) — rename to a brand-neutral "Scan network" panel grouping candidates by brand.

**Merge / dedupe**: key by serial number when the probe returns one (Bambu SSDP, FlashForge), else by IP. Run all probes in parallel; merge into one list with a per-candidate confidence score (mDNS/SSDP > raw port-open). Same logic as the Bambu §12 dedupe (serial-or-IP, keep highest score).

#### Sub-features — recommended ship order

##### F1 — Driver interface extraction *(refactor)*  ·  **Effort: M**  ·  **Risk: low**
Create `renderer/lib/drivers/index.js` + `snapmaker.js`. Move all `snap*` functions out of `inventory.js` into the Snapmaker driver verbatim — no behaviour change. The `renderPrinterDetail()` codepath calls `drivers[printer.brand].getStatus()` instead of `snapMergeStatus()` directly. Result: Snapmaker logic is in its own driver, ready for the 2nd parallel implementation in F2.

♻️ **Reuses (existing, exploitable)**:
- `inventory.js` L5557-7216 — the entire `snap*` block. WS lifecycle (`snapConnect` L5640, `snapOpenSocket` L5674, `snapScheduleReconnect` L5767, `snapDisconnect` L5781), status merge (`snapMergeStatus` L5793), gcode (`snapSendGcode` L5932), filament edit bottom-sheet (L5971-6343), Moonraker file/thumbnail helpers (L6344-6486), live block render (`renderSnapmakerLiveInner` L6520), WS request log (L6681-7130).
- `inventory.js` L8030-8226 — Phase 0/1/2 LAN discovery (mDNS browse + subnet enumeration + port-scan).
- `inventory.js` L8634-8777 — Add by IP widget.
- Goes WITH a CODEMAP refresh (the giant `Snapmaker Live` section in `renderer/CODEMAP.md` becomes a 3-line "see drivers/snapmaker.js" stub).

**Win**: `inventory.js` loses ~1700 lines, code-map shrinks meaningfully. Partial down-payment on the long-parked *modularize inventory.js* item from the 🌱 Internal section.

##### F2 — Second-impl Klipper-class brand (Creality K-series)  ·  **Effort: L**  ·  **Risk: low-medium**
Build `drivers/creality.js` **in parallel** with `snapmaker.js`. Even though Moonraker's WS protocol is the same on the wire, **resist extracting a shared base** — the goal is to **discover empirically** what's actually common vs Snapmaker-specific by having two real implementations side-by-side. Expected behaviour deltas (educated guesses, to validate by implementing):
- Camera URL pattern (Creality K1 has its own MJPEG endpoint; Snapmaker uses WebRTC)
- `machine_type` filter ("Creality" vs "Snapmaker")
- Multi-extruder layout (K1 = 1 extruder, K1 Max = 1, K2 Plus = up to 4)
- Filament macros (K1 ships with `LOAD_FILAMENT` / `UNLOAD_FILAMENT` macros, but the syntax/parameters differ from Snapmaker)
- Print-job thumbnail location

♻️ **Reuses**:
- `drivers/snapmaker.js` (output of F1) — copy as a starting point, then strip Snapmaker-specifics
- `inventory.js` brand picker plumbing (`PRINTER_BRANDS` L5130, `PRINTER_BRAND_META` L5217, `openPrinterBrandPicker` L7321) — Creality entry already exists, need to wire the live driver
- `data/printers/cre_printer_models.json` — model picker data already populated
- The dual-extraction question: **only after F2 is done and battle-tested**, decide whether to refactor a `_moonraker-base.js` containing the empirically-common parts. Don't decide it before the second implementation ships.

**Note**: F2's effort is **L (not M)** because building a parallel implementation responsibly (testing on a real K1, validating the deltas, wiring the brand picker) is more than mechanical reuse. The discipline of "build twice before extracting" costs effort upfront and pays back at F3+ when there's no leaky-abstraction debt to fix.

##### F2b — Generic Klipper / Wondermaker driver  ·  **Effort: M**  ·  **Risk: low**
With Snapmaker and Creality K both shipping, build `drivers/klipper-generic.js` for any Klipper printer not specifically wired (manual IP entry, no auto-discovery, no model picker — single "IP / hostname" field).

After this third implementation, perform the **planned extraction**: identify the genuinely common code across all three drivers and lift it into `drivers/_moonraker-base.js`. The three brand drivers become thin specializations that compose the base.

♻️ **Reuses**:
- `drivers/snapmaker.js` + `drivers/creality.js` — diff them to find the genuinely common parts
- The result becomes the architectural decision deferred from F1 — backed by 3 concrete data points instead of 1.

##### ✅ F3 — Bambu Lab MQTT driver *(shipped v1.6.0)*  ·  **Effort: L**  ·  **Risk: medium**
New driver hitting `mqtts://{ip}:8883` with username `bblp`, password = printer access code, topic `device/{serial}/report` for telemetry, `device/{serial}/request` for commands. **Reuses the Snapmaker live block UI** — filament grid, temps, print-job card. Bambu's protocol carries the same shape of data, just under different field names.

♻️ **Reuses**:
- `inventory.js` L6520-6680 (`renderSnapmakerLiveInner`) — same DOM structure, just feed it the Bambu-derived status object. Most of this can move into a shared "live-block-renderer" helper (rename `renderSnapmakerLiveInner` to something brand-agnostic during F1's refactor).
- `main.js` `bonjour-service` integration (added in v1.4.8 for Snapmaker mDNS) — works for `_bambu._tcp.local.` with no change.
- The mDNS UI panels from `inventory.js` L8410+ (`openSnapmakerScan` and friends) — generalize during F6.
- npm: needs `mqtt` package (well-maintained MQTT client). Check existing `package.json` deps before adding.

**Camera**: Bambu uses an RTSP stream — known cross-platform pain point. First ship probably skips camera and shows the "Photo card" fallback. Phase 2 if a JS RTSP→MJPEG bridge proves stable.

**Bambu firmware risk**: Bambu has rolled out sudden firmware changes that broke 3rd-party tools historically — keep the parser defensive (every field optional, every numeric range-checked).

##### F4 — FlashForge HTTP driver  ·  **Effort: M**  ·  **Risk: low-medium**
Polling design: every 2s call `/control/getStatus` and equivalent. Newer firmware exposes a WebSocket — opportunistic upgrade after first poll succeeds.

♻️ **Reuses**:
- Same shared "live-block-renderer" helper extracted in F1
- `inventory.js` brand picker plumbing — FlashForge entry already in `PRINTER_BRANDS`, `data/printers/ffg_printer_models.json` already populated
- Discovery: UDP broadcast on port 48899 — needs a small `dgram` socket helper in `main.js` (no existing equivalent; fully new code, ~30 lines)

**Live block scope**: temps + active job. No mid-print filament editing (Snapmaker's bottom-sheet stays a unique capability — Flashforge's HTTP API doesn't expose the equivalent endpoints today).

##### ✅ F5 — Elegoo MQTT driver *(shipped v1.6.0)*  ·  **Effort: L**  ·  **Risk: medium**
LAN MQTT confirmed on port 1883 (no cloud bridge required). Full implementation shipped: MQTT connect/disconnect, UDP discovery, job card, temp card, filament card (mono + Canvas 4-slot), control card (jog pad, fans, LED, files), filament edit sheet, Files/History sheet, camera.
- Research confirmed: Elegoo Neptune / Centauri range exposes a plain TCP MQTT endpoint on the LAN — no Chitu cloud relay needed.
- Surgical DOM patch on control card (fan %, LED state, XYZ position updated in-place) eliminates the per-tick flash.

♻️ **Reuses** (only if LAN exists):
- `drivers/bambu-mqtt.js` (output of F3) as a starting point — both are MQTT, payload schemas differ
- Same `mqtt` npm dep as F3

##### F6 — Brand picker + discovery flow polish  ·  **Effort: M**  ·  **Risk: low**
Per-brand discovery panels analogous to the Snapmaker scan side panel: mDNS browse, port-scan fallback, "Add by IP" widget. Generic-Klipper gets only "Add by IP" (no auto-discovery).

Per-brand settings form — different fields per brand: Bambu wants `ip` + `accessCode` + `serial`, Klipper just wants `ip`, FlashForge `ip` only.

♻️ **Reuses**:
- `inventory.js` L8410+ — `openSnapmakerScan` and the entire scan side-panel UI (mDNS phase, port-scan phase, results list, one-click add). Refactor into a generic `openPrinterScan(brand, config)` taking a per-brand config (mDNS service name, scan port, brand-confirm filter, etc.).
- `inventory.js` L8634-8777 — `openPrinterAddByIp` collapsible widget. Already brand-agnostic in shape; just needs per-brand validation rules.
- `inventory.js` L7521-8029 — Debug scan journal. Brand-agnostic UI; passes through.
- `data/printers/<brand>_printer_models.json` — model JSON files already in place for the 5 named brands.

#### 🧮 Total effort
F1: M  ·  F2: L  ·  F2b: M (includes the deferred `_moonraker-base.js` extraction)  ·  F3: L  ·  F4: M  ·  F5: ~S+L (gated)  ·  F6: M → **~XXL combined**.

The F2 → L bump (vs. the original M estimate) reflects the *Rule of Three* discipline: building a parallel `creality.js` instead of refactoring Snapmaker into a forced abstraction. The cost is real (extra implementation work) but the saving is also real (no leaky-abstraction debt to fix when F2b lands).

#### 🎯 Recommended sequence
1. **F1** — extract `drivers/snapmaker.js` from inventory.js (no new functionality, refactor only).
2. **F2** — second parallel implementation: `drivers/creality.js`. **Resist** any extraction urge; the goal is to discover what's truly common by having two real impls side-by-side.
3. **F6** — brand picker UX cleanup so the new brands are clickable with the right per-brand forms.
4. **F2b** — third Klipper-class implementation (`drivers/klipper-generic.js`) + planned extraction of `drivers/_moonraker-base.js` from the empirically-common parts of all three.
5. **F3** — Bambu Lab MQTT (headline feature, biggest user base after Snapmaker).
6. **F4** — FlashForge HTTP.
7. **F5** — Elegoo Centauri (research first, build only if LAN mode is reachable).

#### 🐛 Debug surface — Multi-brand live
Snapmaker already has a debug-only WS request log (`inventory.js` L6681-7130). Generalising to multi-brand means the debug surface multiplies — each driver gets its own log feed, plus brand-agnostic inspectors:

- **🔬 Per-driver request log** (one tab per active driver) — every command sent + response received, wire-format. Moonraker WS frames, MQTT topic+payload, FlashForge HTTP status. Same UI shape as today's WS log; the feed source changes per driver.
- **🔬 Live status inspector** — debug-only side panel that shows the **parsed** status object the driver hands back to the renderer, in real time. Lets us catch field-name mismatches and stale-data bugs without reading wire protocol traces.
- **🔬 Connection state machine** — visualizes `idle → connecting → connected → reconnecting → disconnected` per printer. Shows last error, retry count, ms since last frame. Cures the "why does this printer keep disconnecting" black hole.
- **🔬 Force-connect-to-IP** debug button — bypasses discovery entirely; types in an IP + protocol and starts a session. Critical for testing Bambu / Creality / FlashForge during F3-F4 development.
- **🔬 Driver dispatch trace** — shows which driver was selected for each printer in `state.printers`, and **why** (brand match, protocol override, fallback). Helps diagnose F2/F2b extraction edge cases.
- **🔬 Discovery scan journal** — already exists for Snapmaker (`inventory.js` L7521-8029); generalise to per-brand journals during F6 so any brand's scan can be exported as a JSON dump for support tickets.
- **🔬 Raw frame replay** — paste a captured wire frame back into the active driver to test the parser in isolation. Lower priority but very useful for regression-testing after Bambu firmware updates.

**Reuses**: existing `inventory.js` L7521-8029 (Snapmaker scan journal — generalise during F6), L6681-7130 (WS log UI), L4697-4777 (debug panel tab pattern). Most of the multi-brand debug surfaces are mechanical extensions of patterns already shipped for Snapmaker.

#### 📐 Cross-cutting note
After F1, the CODEMAP entry for the Snapmaker section needs a rewrite (it'll point to `renderer/lib/drivers/snapmaker.js` instead of an inline range in `inventory.js`). Update CODEMAP.md as part of F1's commit. The same applies to F2 (add Creality), F2b (add Klipper-generic + base), F3 (add Bambu), F4 (add FlashForge): every driver added bumps the CODEMAP.

---

### 🥉 Printer control panel — beyond monitoring, into commanding

Today the printer detail panel is **read-only** — it shows live temperatures, the loaded filament per slot, the active print job, and the camera feed. The only command surface is the bottom-sheet filament edit (which sends a single `M104` + filament-load macro). The user wants what OrcaSlicer / Mainsail / Fluidd offer: **interactive controls** to pause/resume, home, jog axes, load/unload filament, set temperatures, run macros, browse the printer's file list, etc.

The primitive exists already: `snapSendGcode(conn, script)` (renderer/inventory.js, in the Snapmaker live block) wraps the Moonraker `printer.gcode.script` JSON-RPC. What's missing is the UI surface, the per-action handlers, the safety patterns, and the per-brand portability.

#### Driver interface extension
This entry **extends** the `LiveDriver` interface from F1 of *Multi-brand live integration* with control methods. Strict prerequisite: F1 must land first so the same UI calls `drivers[brand].pause()` regardless of the underlying transport.

```js
interface LiveDriver {
  // (from F1 — already planned)
  connect, disconnect, sendGcode, getStatus, getCameraStream

  // print job control
  pause()
  resume()
  cancel()
  emergencyStop()

  // movement
  home(axes = ['x', 'y', 'z'])
  jog(axis, distance, speed?)
  disableSteppers()

  // temperature
  setNozzleTemp(temp, extruder = 0)
  setBedTemp(temp)
  setChamberTemp?(temp)
  cooldown()

  // filament
  loadFilament(extruder = 0, profile?)
  unloadFilament(extruder = 0)

  // live tuning
  setPrintSpeedFactor(percent)
  setFlowRate(percent, extruder = 0)
  setFanSpeed(speed, fanIndex = 0)

  // files (Phase D)
  listFiles?()
  startPrint?(filename)
  uploadFile?(buffer, filename)
  deleteFile?(filename)

  // macros (Phase D)
  listMacros?()
  runMacro?(name)
}
```

Per-protocol implementation:
- **Moonraker** — most actions are `sendGcode(<script>)` wrappers (e.g. `pause` → `PAUSE`, `home` → `G28`); files via `server.files.*` JSON-RPC; uploads via HTTP POST to `/server/files/upload`. Full feature surface available.
- **Bambu MQTT** — commands go through `device/{serial}/request` with brand-specific JSON payloads (`{"print": {"command": "pause"}}` etc.). Filament macros are baked into the printer firmware. File API exists but uploads are FTP, not MQTT. Phase A-C reachable; Phase D partial.
- **Flashforge HTTP** — `/control/*` endpoints cover Phase A and most of B; live tuning more limited; no file upload via the official API on most firmwares.

#### Sub-features by ship phase

##### G1 — Print job control *(safety-critical, biggest user value)*  ·  **Effort: M**  ·  **Risk: medium**
- **Pause / Resume** — single button that swaps role based on `printer.status`. Disabled when no print active.
- **Cancel print** — hold-to-confirm 1.5s pattern. Modal with "Are you sure?" + the active filename for clarity.
- **Cooldown all** — sets nozzle + bed (and chamber if supported) to 0. Always available.
- **Emergency stop** — hold-to-confirm 2.5s. Warning copy: "Hardware will halt immediately. Mid-print stop may damage the part or extruder."

♻️ **Reuses**:
- `inventory.js` L5932 — `snapSendGcode(conn, script)` already wraps Moonraker's `printer.gcode.script`. Pause/Resume/Cancel are one-line calls (`PAUSE`, `RESUME`, `CANCEL_PRINT`). Cooldown = `M104 S0` + `M140 S0`. Emergency = `M112` + `FIRMWARE_RESTART`.
- `inventory.js` `setupHoldToConfirm()` (L194-240) — exact pattern already used by Delete spool and Recycle. Same CSS, same UX.
- `inventory.js` L6520+ (`renderSnapmakerLiveInner`) — print-job card header is where the controls bar lands.

##### G2 — Movement *(homing + jog)*  ·  **Effort: M**  ·  **Risk: low-medium**
- **Home all / X / Y / Z** — disabled mid-print (firmware would refuse anyway, but better UX to grey out the buttons).
- **Jog axes** — 4-direction pad for X/Y, up/down for Z. Step picker: 0.1 / 1 / 10 / 100 mm (clamped to printer's max-jog config). Optional speed override.
- **Disable steppers** — for manually moving the bed/head.
- **Mid-print lockout** — all jog + home disabled, with a tooltip explaining why.

♻️ **Reuses**:
- `snapSendGcode` again (`G28`, `G91`+`G1 X<step>`, `M84`).
- `data/printers/<brand>_printer_models.json` model files — needs new `max_jog_speed` / `max_jog_distance` fields for input clamps (soft dependency noted in the "soft dependency" section).
- Status-aware UI gating — `printer.status` already in the Snapmaker WS subscribe data; just add a `state.printers[id].canMove` derived boolean.

##### G3 — Temperature & filament  ·  **Effort: M**  ·  **Risk: medium**
- **Set nozzle / bed / chamber temp** — number inputs with clamps from per-printer config. Quick-set chips: PLA (215/60), PETG (240/80), ABS (250/100) — pulled from existing material lookup tables.
- **Load / Unload filament** — per-extruder. Confirms target temp is reached before extruding. Default macros tied to the active filament's material when known.
- **Mid-print behaviour**: temp adjustments allowed (live tuning), but load/unload disabled.

♻️ **Reuses**:
- `inventory.js` L5971-6343 — the Snapmaker filament bottom-sheet already does the temp-and-load dance for filament edits. Extract the "wait for target reached, then run load macro" logic into a reusable helper.
- `inventory.js` L399-491 — material lookup tables (`materialLabel`, `materialFull`) drive the quick-set chips.
- `data/id_material.json` — already populated with material names and reference temperatures; quick-set values pull from here.
- `snapSendGcode` for `M104` / `M140` / `M141` (chamber).

##### G4 — Live tuning *(during print)*  ·  **Effort: S**  ·  **Risk: low**
- **Print speed factor** — slider 50-200%, sends `M220 S<percent>`. Persists across sessions per printer.
- **Flow rate** — per-extruder, slider 80-120%, sends `M221`.
- **Fan speed** — part cooling fan slider 0-100%. Auxiliary fan if the printer reports one.

♻️ **Reuses**:
- `snapSendGcode` for `M220` / `M221` / `M106`.
- `inventory.js` weight-slider auto-save debounce pattern (`_sliderDebounce` at L3290 + CLAUDE.md "Weight slider auto-save" section) — exact same UX (slider + 500ms debounce) for the print-speed and flow sliders. Copy + adapt.

##### G5 — Files & macros  ·  **Effort: L**  ·  **Risk: medium**
- **File browser** — list `gcode_files/` (Moonraker) or printer-specific roots. Show filename, modtime, est. duration, thumbnail.
- **Start print from file** — single click + confirm modal showing filename + thumbnail.
- **Upload G-code** — drag-drop onto the file browser. Requires a free-space check first.
- **Delete file** — hold-to-confirm.
- **Custom G-code input** — textarea + Send. History dropdown of last 20 sent commands per printer.
- **User-defined macros** — saved per printer (Firestore `users/{uid}/printers/{brand}/devices/{id}/macros/{slug}`). Each macro is `{ name, gcode, color, icon? }`. Renders as a row of one-click buttons.

♻️ **Reuses**:
- `inventory.js` L6344-6486 — `snapNormalizePath`, `snapJoinPath`, `snapFilenameRel`, `snapBestThumb`, `snapThumbUrl`, `snapFileUrl`. The thumbnail rendering pipeline is fully built — just need to feed it a list of files.
- `inventory.js` L6720 — `snapSendCustomJson()` already supports custom JSON-RPC — extend to wrap `server.files.list`, `server.files.delete`, `printer.print.start`.
- `inventory.js` rack drag-drop (L10886+) — drag-drop wiring pattern already established. Reuse for the G-code upload drop zone.
- The Custom G-code input is essentially the existing `inventory.js` L6720+ debug log "Send" widget promoted to a first-class UI element — already there in debug mode.

##### G6 — Multi-tool & advanced  ·  **Effort: M**  ·  **Risk: low**
- **Tool selection** — for printers with multiple extruders, a tool picker (T0/T1/T2/…) above the load/unload area. Sends the appropriate `T<n>` before subsequent commands.
- **Skip current object** — Klipper `SKIP_CURRENT_OBJECT` (with object list browser).
- **Firmware restart** — `FIRMWARE_RESTART` for Klipper, brand-specific for others. Hold-to-confirm 2.5s.

♻️ **Reuses**:
- `snapSendGcode` for everything.
- `inventory.js` L6618-6680 — Snapmaker's per-extruder filament grid already iterates extruders 0-3 with click handlers. The tool selection chip strip slots in above it with the same pattern.
- The current Snapmaker WS subscription already includes `extruder.position` and `print_stats.objects` — no additional subscriptions needed.

#### 🐛 Debug surface — Printer control panel
Printer control is the highest-risk feature surface (a misclick can damage hardware), so the debug interfaces are also the most important. They're not optional polish — they're a precondition for shipping confidently.

- **🔬 Action audit log** — every command issued via the control panel: `{ts, printer, brand, action, payload, gcode, response, durationMs}`. Newest first; persistent (Firestore `users/{uid}/printers/{brand}/devices/{id}/actionLog/{auto}` with a 30-day retention rule) so multi-day debugging works. Filterable by action type. Critical for "what command did I send before the print failed?".
- **🔬 Custom G-code console** (already partially shipped in Snapmaker debug — promote it) — textarea + Send + history of last 50 commands sent on this printer (per-printer, persisted to localStorage). Each sent command shows its response inline. Use this to test new control bindings before wiring them to UI buttons.
- **🔬 Mid-print lockout bypass** — debug-only toggle that disables the "is printing" gate on home/jog/load-filament/etc. **Strictly debug** — leaves a banner at the top of the panel reminding "Lockout bypassed" and the audit log records every command sent in this mode.
- **🔬 Macro execution trace** — when a user-defined macro runs, debug shows the expansion: which gcode lines fired, the response after each, the elapsed time. Helps debug macros that mostly-but-not-quite work.
- **🔬 Live status diff** — when a state change is expected (e.g. pause → paused), debug shows the printer state before / after / delta-ms. Surfaces optimistic-rollback misfires (Sub-feature G1's "if printer doesn't transition in 5s, revert").
- **🔬 Temperature target / actual graph** (small) — last 5 minutes of nozzle + bed target vs actual, plotted. Spot temp-control oscillations before they cause print issues.
- **🔬 File operation log** — every `listFiles`/`uploadFile`/`deleteFile`/`startPrint` call with bytes-transferred + duration. File API is the most likely source of brand-specific bugs; this catches them.

**Reuses**: existing `inventory.js` L4355-4365 (debug panel toggle), L6681-7130 (Snapmaker WS log shape), L4524-4696 (deleted-spools list — same "debug-tab with filters" pattern). New tabs in the existing debug panel chrome — no new chrome needed.

**Sprint scope**: ship the Action audit log + Custom G-code console + Mid-print lockout bypass with G1. The rest can land progressively as the corresponding G-feature ships (e.g. File operation log alongside G5).

#### 🛡️ Cross-cutting: safety patterns
1. **Hold-to-confirm gradients** by danger level:
   - 1.5s: Cancel print, Delete file, Unload filament (low risk if cold)
   - 2.5s: Emergency stop, Firmware restart (irreversible / disruptive)
   - No hold: Pause, Resume, temp adjustments, jog (instantly reversible)
2. **Mid-print lockout** — every method declares which states it's allowed in. The UI greys out unavailable actions and shows a tooltip explaining the lockout reason ("Print active — pause first to home").
3. **Sane temp defaults** — load filament defaults to the active filament's material temp when known (from `state.rows[…].nozzleTemp`); falls back to PLA 215°C with a warning toast.
4. **Visual feedback** — every command button shows a `loading` state during transit, then a transient success/error toast based on the printer's response (Moonraker returns the `klippy_state` after every script).
5. **Optimistic UI rollback** — if a `pause` request is sent and the printer doesn't transition to paused within 5s, revert the button state and show an error.

#### Per-brand support level (initial ship)

| Brand | G1 (job) | G2 (move) | G3 (temp/fil) | G4 (tune) | G5 (files) | G6 (advanced) |
|---|---|---|---|---|---|---|
| Snapmaker | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Klipper-class (Creality K, Wondermaker, generic) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bambu Lab | ✅ | ✅ | ✅ | ✅ | partial | ✅ |
| FlashForge | ✅ | ✅ | ✅ | partial | ❌ (no upload API) | ❌ |
| Elegoo | ✅ | ✅ | ✅ | ✅ | ✅ | partial |

#### 🎯 Recommended sequence
1. **G1 — Print job control** for Snapmaker (uses existing `snapSendGcode`). Ship to validate the safety patterns + UX before generalizing.
2. **G3 — Temperature & filament** for Snapmaker. Replaces the bottom-sheet filament edit's duplicate temp logic with the shared driver method.
3. **G2 — Movement** for Snapmaker.
4. **G4 — Live tuning** for Snapmaker.
5. **(After F1 of Multi-brand live integration ships)** Port G1-G4 to the Moonraker driver interface — automatically lights up Klipper-class brands.
6. **G5 — Files & macros** for Moonraker drivers (Snapmaker + Klipper-class).
7. **(After F3 of Multi-brand live integration ships)** Add Bambu MQTT command paths for G1-G4. Bambu G5 partial. Bambu G6 advanced features.
8. **G6 — Multi-tool & advanced** features for Snapmaker first, then ported.

#### 🧮 Total effort
G1: M, G2: M, G3: M, G4: S, G5: L, G6: M  ·  **~XL combined** for Snapmaker; multiplier per brand is small once F1 of *Multi-brand live integration* is in (each new brand reuses the UI + safety patterns; only the driver methods need a per-protocol implementation).

#### 📐 Dependency
**Strict prerequisite**: F1 of *🥈 Multi-brand live integration* (driver layer extraction). Without it, this work would all be locked into the Snapmaker codepath and would have to be ported again afterwards.

**Soft dependency**: the per-printer config in `data/printers/<brand>_printer_models.json` should grow new fields (`max_jog_speed`, `max_nozzle_temp`, `extruder_count`, `has_chamber_heater`) so the UI can clamp inputs and hide unavailable controls per model.

---

### 🏵️ Printer slot storage — assign filaments to machine slots (dual-location)

Today a spool lives in **one** place: its rack slot (`rack: { id, level, position }`). When the user actually mounts that spool in a printer (Ext. spool holder, an AMS bay, an AMS-HT bay…), the app has no concept of it — the printer live block shows what the *firmware* detected, but there's no link back to the user's TigerTag inventory.

**The idea**: when we connect to a printer, materialise a **virtual storage** that mirrors the machine's detected feed slots, then let the user assign their inventory spools to those slots **exactly like racks** — same drag-drop / right-click grammar. Crucially this is a **second, simultaneous location**: assigning a spool to *Bambu Lab → AMS slot A2* must **not** clear its rack assignment. The rack is the spool's **home** (where it physically returns); the printer slot is a **provisional mount** layered on top. So a spool can read as *"Rack B · level 2 · slot 3 — currently loaded in Bambu Lab X1C / AMS A2"* at the same time.

> **Why dual-location and not a move?** Physically a spool is either in the rack or on the printer — but the user wants the home slot remembered so unmounting sends it back to the right place, and so the rack view doesn't "lose" a spool just because it's printing right now. The printer mount is therefore an **overlay**, never a relocation.

#### 🗃️ Data model

- **The PRINTER owns the occupancy — the slot stores the spool UID(s), not a field on the spool.** The printer knows what it contains, not the other way round (this is how an AMS itself reasons). Each slot on the printer doc carries a `uids` array: **empty = free, 1 UID = a plain spool, 2 UIDs = a twin pair** (a single physical spool with two linked tags — both stored so a scan of *either* tag resolves to the slot, without needing the twin link at read time). The spool doc gets **no `mount` field**; mount state is purely derived from the printers.
- **Slots persisted on the printer doc — NOT recomputed from the live feed.** Live detection is volatile (a powered-off AMS vanishes from the stream), so we never derive the slot list on the fly. Each printer device doc carries a persisted `slots` array, **seeded on first connect**, **updated when the user adds/removes a filament-storage accessory** (AMS / AMS-HT unit, CFS, Canvas…), and **only ever deleted when the printer itself is removed from inventory**. Slots are tied to the printer's lifetime, like rack slots are tied to a rack.
  ```jsonc
  // users/{uid}/printers/{brand}/devices/{deviceId}.slots
  [
    { "key": "ext",          "kind": "external", "label": "Ext.",     "hwId": null,     "present": true,  "uids": [] },
    { "key": "ams:3DF1A2:A", "kind": "ams",      "label": "AMS 1 · A", "hwId": "3DF1A2", "present": true,  "uids": ["041E2A8B5C6F80"] },
    { "key": "ams:3DF1A2:B", "kind": "ams",      "label": "AMS 1 · B", "hwId": "3DF1A2", "present": true,  "uids": ["04AABBCC112233", "04DDEEFF445566"] }, // twin pair
    { "key": "ams:3DF1A2:C", "kind": "ams",      "label": "AMS 1 · C", "hwId": "3DF1A2", "present": false, "uids": ["CLOUD_4480517985"] } // unit unplugged — occupant kept
  ]
  ```
- **Single-occupancy is intrinsic + eviction is free** — a slot's `uids` IS its occupant, so assigning a spool onto an occupied slot just **overwrites** that slot's `uids`. The displaced spool is no longer referenced by any slot, so its "mounted" indicator clears automatically — **no second write to the old spool**. One write, on the printer doc, per assignment.
- **Derived in-memory index for fast lookup** — rebuild a `uid → { brand, deviceId, slotKey }` map on every `state.printers` snapshot (already subscribed), inserting **both** UIDs of a twin pair. It's a pure **derived cache** (source of truth stays the slots' `uids`), so it never desyncs and needs no manual upkeep. **Why an index and not a scan:** the filament list re-renders on every search keystroke / sort / filter; a per-render scan would be `O(rows × printers × slots)` (≈ thousands of checks per keystroke on a big inventory), whereas the index makes each row an `O(1)` lookup and is built just once per (rare) printers snapshot. Rule of thumb: **frequent reads (render) → index; one-off writes (assignment) → a direct `state.printers` scan is fine.**
- **Stable hardware keys for reliable recognition across reconnects** — the slot `key` is anchored to a **stable hardware identifier** (e.g. a Bambu AMS reports a serial/UUID) so the same physical AMS is recognised on every reconnect even if the user reorders units or plugs a second one in. Use `hwId` when the firmware exposes it; fall back to a positional index (`ams:0:A`) only when it doesn't. Anchoring to `hwId` prevents "added a 2nd AMS → all occupants shifted by one bay".
- **Slots stay ACTIVE even when the printer is offline / disconnected.** Connection state is **orthogonal** to slot availability: a powered-off / asleep / not-currently-connected printer keeps its full last-known slot set (and occupants) **active and assignable**. The user can plan and re-assign filaments to a machine that's off — slots reflect the persisted config, not the live link. (Hence persisting on the doc rather than deriving from the feed.)
- **Present / absent tracks the ACCESSORY, not the connection.** `present: false` means an accessory (e.g. a specific AMS unit) was **detected as physically removed while connected** — not that the printer is offline. A whole-printer disconnect leaves every slot `present: true` (last-known). A `present: false` accessory's slots — **and their `uids`** — are kept on the doc (so a re-plug restores the occupancy); hard removal happens **only** when the printer is deleted.
- **Reconciliation runs only while connected** — on a live connection the driver yields the *currently detected* slots and we **merge** into the persisted `slots`: new hardware → appended (`uids: []`), known hardware → `present: true` (+ label refresh, **occupancy preserved**), missing hardware → `present: false` (occupancy preserved). One write per change (no-op when nothing changed), same discipline as `autoAssignMissingContainers`. **While offline we never touch the persisted set.**
- **Slot identity is logical, not physical RFID** — `uids` is the *user's* intent (which TigerTag spool they put in a bay), independent of whatever RFID the firmware reads there. Reconciling "Studio says A2 = my red PLA" vs "firmware reports A2 = some other tag" is a **Phase 2** concern (highlight mismatches); Phase 1 just stores intent.
- **Slot taxonomy per brand** — each driver already enumerates its feed slots for the live block; formalise that into a `getSlots(printer)` returning `[{ key, kind, label, hwId }]` from live data, which the reconciler then merges into the persisted set:
  | Brand | Slots | Stable `hwId` source |
  |---|---|---|
  | Bambu Lab | `ext` (external spool) + `ams:<serial>:<A..D>` per AMS / AMS-HT unit | AMS serial/UUID from the MQTT report |
  | Snapmaker | per-extruder slots (U1 = 4) | extruder index (fixed hardware) |
  | Creality | `ext` + CFS bays | CFS unit id if exposed, else index |
  | Elegoo | mono `ext` + Canvas 4 slots | Canvas id if exposed, else index |
  | FlashForge | `ext` (`1A`) + matlStation `1A`–`1D` | matlStation index |

#### 🔧 Sub-features — recommended ship order

##### P1 — Persisted slots (with occupancy) on the printer doc + per-driver `getSlots()` + reconciler + derived index  ·  **Effort: M**  ·  **Risk: low**
Add `getSlots(printer)` to the `LiveDriver` interface (F1 of *Multi-brand live*) returning the live-detected slot descriptors (with `hwId`). Add the persisted `slots` array (each with a `uids` occupant list) to the printer device doc and a **reconciler** that, on connect / on accessory change, merges detected slots into the persisted set (append new, `present` toggling, **occupancy preserved**, never silent-delete). Write helpers operate on the **printer doc**: `assignToSlot(brand, deviceId, slotKey, uids)` overwrites that slot's `uids` (intrinsic eviction — no write to the displaced spool) and `clearSlot(brand, deviceId, slotKey)` empties it; `uids` is 1 entry for a plain spool, 2 for a twin pair. Build the derived `uid → { brand, deviceId, slotKey }` index on every `state.printers` snapshot.

##### P2 — Right-click filament → printer → slot assignment  ·  **Effort: M**  ·  **Risk: low**
Context menu on any inventory row / grid card / detail panel: **"Send to printer →"** → submenu listing **every printer in inventory** (connected or not — slots stay active offline) → submenu of that printer's slots (with the slot's current occupant shown; offline printers may show an online/offline dot but remain selectable). Picking a slot writes the spool's UID(s) into that slot's `uids` (overwriting any previous occupant, which is thereby evicted). Only disabled when the inventory has no printers at all.

##### P3 — Printer-slot storage view (drag-drop parity with racks)  ·  **Effort: M**  ·  **Risk: low**
Render **every printer in inventory** as a **slot board** (like a small rack card) in the Storage view — or as a drop zone inside the printer detail panel — regardless of connection state (an offline machine still shows its boards, optionally dimmed with an offline marker but fully droppable). Drag a spool from the unranked panel / a rack slot onto a printer slot to mount it; drag it off (or "unmount") to drop the overlay and reveal it back in its rack. Reuses the rack masonry + drag-drop wholesale.

##### P4 — Dual-location indicators in the filament list  ·  **Effort: S**  ·  **Risk: low**
In table + grid + detail panel, show **both** locations: the rack home (existing) **and** a "mounted in …" pill (printer name + slot), derived from the in-memory index (a spool is mounted if either of its UIDs appears in a slot). A spool mounted in a printer stays visible in its rack slot with a subtle "on printer" marker so the rack view never appears to lose it.

##### P5 (Phase 2) — Firmware reconciliation  ·  **Effort: L**  ·  **Risk: medium**
Compare the user's slot `uids` mapping against what the printer firmware actually reports in each bay (AMS RFID, Snapmaker slot data…). Flag mismatches ("you mapped red PLA to A2 but the printer reads an empty bay"), offer one-click "adopt firmware state". Research-gated per brand.

##### P6 — Share printer fleet + slot contents with selected friends  ·  **Effort: M**  ·  **Risk: low-medium**
Let the owner authorise **specific friends** to see their printer fleet and what filament sits in each slot — granular, per-friend, opt-in (not all-or-nothing, not the global `isPublic`).
- **Per-friend grant** — add `sharePrinters: boolean` (default `false`) on the owner's `friends/{friendUid}` doc. UI: a per-friend toggle in the friends panel ("Show my printers to this friend"). Optional convenience: a "share with all friends" master switch that bulk-sets the flag.
- **Firestore rule** — a friend may read `users/{ownerUid}/printers/**` **iff** their own entry `users/{ownerUid}/friends/{request.auth.uid}` exists, its `.key == owner.privateKey` (existing friendship gate), **and** `.sharePrinters == true`. This is the rule the *🔒 Firestore rules* section flagged — required for this sub-feature, not deferred.
- **Friend's app** — in the existing friend-view mode, if authorised, subscribe to the friend's `printers` and render their slot boards **read-only**. Resolve each slot's `uids` against the friend's inventory (already readable via the existing inventory grant) to show the filament puck (colour / material / name) per slot. UIDs that don't resolve (a spool the friend can't see) → generic "occupied" placeholder, never leak data.
- **Read-only everywhere** — no assignment / drag-drop in friend view; the boards are purely informational.
- **Revocation** — flipping `sharePrinters` back off (or removing the friend) immediately cuts read access via the rule; the friend's open view falls back to empty on the next snapshot.

♻️ **Reuses**: the friends panel per-friend row UI + toggles, the friend-view subscription/swap-back machinery, the P3 slot-board render (just fed the friend's data, controls stripped), and the existing `privateKey`-gated friend read pattern.

#### ♻️ Reuses
- **Rack engine** — `wireDragSources` / `wireDropTargets` / drop-to-void / slot-fill HTML / masonry layout / search-dim. The printer board is "just another rack" whose slots come from the printer doc's persisted `slots` array (filtered to `present: true`) instead of the rack doc.
- **Eviction logic** — even simpler than racks here: overwriting a slot's `uids` evicts intrinsically (no displaced-occupant write needed).
- **Per-brand slot enumeration** — the live blocks (`renderBambuFilamentCard`, Snapmaker / Elegoo / FlashForge filament grids) already know each machine's slots; `getSlots()` formalises that into one return shape.
- **Context-menu pattern** — the rack slot right-click (lock/unlock) menu (`positionRackMenu`) is the template for the "Send to printer" menu.
- **Printer subscription** — `subscribePrinters` already keeps `state.printers` live; the derived `uid → slot` index just rebuilds in its existing snapshot callback.

#### 🐛 Debug surface
- **🔬 Slot occupancy inspector** — debug-only dump of every printer's `slots` with their `uids`, plus the derived `uid → slot` index, plus any **orphan UIDs** (a slot references a UID that's no longer in inventory).
- **🔬 Studio-vs-firmware diff** per connected printer — `{ slot → uids }` from the Studio mapping side-by-side with firmware-detected state (feeds P5).
- **🔬 Force-assign / clear** — debug buttons to write/clear a slot's `uids` directly, surfaced in the existing debug log so test assignments are traceable.

#### 📐 Cross-cutting notes
- **Slot lifetime = printer lifetime** — persisted `slots` (and their occupancy) live and die with the printer device doc. Deleting the printer removes its slots; nothing else does. Disconnecting an accessory only flips its slots to `present: false` (occupancy kept).
- **Orphan cleanup** — deleting a printer simply removes its slots (occupancy goes with it, no spool-side write needed). When a spool is **hard-deleted**, sweep the printers and strip its UID(s) from any slot's `uids`. A UID sitting in a `present: false` slot is kept (re-lights when the accessory returns). Same sweep shape as the legacy-tombstone purge.
- **Friend view** — read-only, no assignment actions. Printer boards + the "mounted in …" pill appear only for friends the owner explicitly authorised (per-friend `sharePrinters`, see **P6**). Unauthorised friends see neither — their view is identical to today.
- **Cloud spools** — fully eligible (a digital spool can still be "the one I'm pretending is loaded"); no special-casing needed.

#### 🔒 Firestore rules (`#firebase` → `firestore.rules`)
- **Owner path — no new rule needed.** Slots + `uids` live under `users/{uid}/printers/{brand}/devices/{deviceId}`, the user's own subtree, already covered by the "user manages their own docs" rule. Assignment is just a field write on a doc they own.
- **Friend read of `printers` — required by P6, gated per-friend.** Friends today get read on `inventory` (via the `privateKey` match) but **not** on `printers`. P6 adds a read grant on `users/{ownerUid}/printers/**` that requires the existing friendship gate (`friends/{request.auth.uid}.key == owner.privateKey`) **plus** that friend's `sharePrinters == true`. So the fleet is visible only to explicitly-authorised friends; revoking the flag cuts access immediately. (Until P6 ships, hide printer boards/pills in friend view — zero rule change.)
- **Optional hardening** — a validation rule on `slots[*].uids` (array of strings, length ≤ 2) to reject malformed client writes. Defensive, low priority; pairs naturally with the parked *🏅 Firestore Security Rules for `roles` + `Debug`* item.

#### 🧮 Total effort
P1: M · P2: M · P3: M · P4: S · P5: L (gated) · P6: M → **~L combined** for Phase 1 (P1–P4); P6 (friend sharing) and P5 (firmware reconcile) are independent add-ons on top.

#### 📐 Dependency
**Soft prerequisite**: F1 of *🥈 Multi-brand live integration* (driver layer) so `getSlots()` has a clean home. Can ship Phase 1 against the current per-brand live code if F1 isn't done yet, then fold into the driver interface during F1.

---

### ✅ 🔥 Cloud → chip encode — guided dual-chip burn modal *(shipped v1.8.5)*

**Shipped**: the guarded modal flow below is implemented — modal (`#cloudEncodeOverlay`) + `openEncodeModal`/`_cemStartBurn`/`_cemMigrate` in `inventory.js`, the new `rfid:burn-one` IPC (`main.js`) with read-back verification in `services/nfc-process.js`, and the chip-epoch timestamp fix. The old one-shot `_encodeCloud` was removed.

Previously `_encodeCloud(r)` + the `rfid:encode-cloud` IPC promoted a TigerCloud spool in a single click: same payload to every reader with a card, then migrate Firestore **if ≥1 chip succeeded** — too loose for an irreversible operation. Replaced with a **guarded, modal-driven flow** — confirm → presence-gate → sequential burn with per-chip read-back verification → **all-or-nothing** migration.

#### Requirements (decided)
1. **Confirmation modal before any write.** Triggering "Encode" opens a modal first — it never burns immediately. Lets the user position the spool so the chip(s) sit on the reader(s).
2. **Presence gate + live slot status.** "Burn" stays disabled until **every detected reader has a card present** (2 readers → **both** chips; 1 reader → 1 chip). The chips that count are the ones present **at the moment Burn is launched** — before that the user can swap chips freely. The modal shows **real-time** slot status (e.g. slot 1 ✓ ready · slot 2 ⏳ waiting), updating as chips are placed/removed.
3. **Per-chip visual.** One **SVG per chip** (slot 1 / slot 2 — we can't tell which physical reader is which) + a **progress bar** each. States: waiting (grey) → writing → **green** (verified OK) → **red** (fail).
4. **Sequential burn + 100 ms gap.** Burn chip 1, wait **100 ms**, burn chip 2 (hardware breathing room). Add the delay in the `for…of` loop of `rfid:encode-cloud`. Payload built **once** (same bytes, same timestamp → twins). Single pass — never re-burn within one attempt.
5. **Read-back verification = the success criterion.** After writing a chip, **re-read its written pages** and compare the **byte list** to the payload sent — same byte count, same starting offset → a match means OK. A chip turns **green only on a verified read-back match**; a "write command returned OK" is not enough. **Exclude the signature pages**: a home-made TigerTag / TigerTag+ never sets the factory signature (we don't know it, or there's simply none), so we never write, read, or compare the signature region — it's factory-only data (filament manufacturer). Compare only the pages we actually wrote.
6. **Per-chip ok/fail** surfaced live in the modal.
7. **Immutable N-chip contract.** Whatever count is present at launch is binding: start with 2 → must verify on **both**; start with 1 → must verify on that 1. Anything less = **failure**. Chips may be read/write-locked or in an unknown state — if a planned write doesn't verify, it's a failure and the user is told **which** chip(s) failed (1, 2, or both).
8. **Presence loss = failure.** A chip leaving its reader mid-sequence = failure for that chip → sequence failed. (This also keeps the captured UIDs correct: if the user swaps a chip mid-burn it goes non-present → automatic failure; only chips present at launch are written, with their real UID captured from the write result.)
9. **Overwrite guard.** Before writing, if a chip already holds data (already a TigerTag / non-blank), **warn** the user it will be erased and ask confirmation. Provide an **"accept overwrite" toggle** (persisted) so advanced users who do this routinely can skip the prompt.
10. **Anti self-twin.** If the two chips report the **same UID** (one chip seen twice / buggy reader), refuse → failure (a twin needs two distinct UIDs).
11. **Firestore migration only after full verified success.** Order: burn+verify chip 1 → 100 ms → burn+verify chip 2; **only if all verified OK**, duplicate the Cloud data into the physical doc(s) and **delete the Cloud doc**. On any failure → **no doc created, Cloud doc untouched**. (A failed chip may carry partial bytes physically, but the user has been told it failed.)
12. **Retry restarts from zero.** From the failed state, retry re-runs the **whole** sequence (presence gate → all chips) — never "retry just the failed chip", because that would let the user swap out an already-succeeded chip between attempts. Always start from 0.
13. **Modal persistence.** Closes **only** on full verified success or explicit user abort; stays open on failure for retry.
14. **Debug — show detected UIDs** in the confirm modal (debug mode) so the user can sanity-check which chips are about to be written.
15. **Sound/feedback** — discreet success chime / error tone.

#### Flow (state machine)
`confirm` (live slot status; Burn enabled only when the presence gate is satisfied; overwrite prompt if a chip is non-blank) → `burning` (chip 1 write→read-back-verify → 100 ms → chip 2 write→read-back-verify, with live presence watch) → `success` (all verified OK → migrate Firestore: create physical doc(s) + delete Cloud doc → close modal, open the new spool) **or** `failed` (any chip unverified / presence lost / same-UID → red, **no Firestore change**, Retry-from-zero / Abort).

#### ♻️ Reuses
- `_encodeCloud(r)` Firestore migration batch (`inventory.js` ~L5094-5135) — the create-physical-docs + delete-cloud-doc logic is reused **verbatim**, just gated behind full success and moved after the modal's burn step. Twin cross-link (`twin_tag_uid` both ways) already handled there.
- `rfid:encode-cloud` (`main.js` L444) — already sequential + builds the payload once; add the **100 ms** inter-chip delay, a **read-back of the written pages** after each write (compare byte list vs `pages`, excluding the signature region), and return per-chip `{ ok, verified, uid, error }`. The NFC child already does page I/O for writes, so reading the same pages back is the same channel.
- `state.nfcCardPresent` (Map: readerName → `{ uid }`), `state.nfcReaders`, `state.nfcReaderCount` — drive the chip count, the presence gate, and the mid-burn presence watch.
- Modal chrome (`.modal-overlay` + `.modal-card`), and the `btnEncodeCloud` toolbox row + `cloudEncodeBanner` triggers — they open this modal instead of calling `_encodeCloud` directly.
- i18n: new keys (modal title, "place both chips", per-chip waiting/writing/ok/fail, sequence failed, retry, abort, success).

#### ⚠️ Fix to fold in
`main.js` L452 stamps the chip timestamp as `Math.floor(Date.now()/1000)` (Unix seconds) — but the TigerTag chip epoch is **seconds since 2000**, so a compliant reader would decode the physical chip's manufacturing date ~30 years in the future (same class of bug just fixed for Cloud docs). Use a chip-epoch timestamp here (verify what the SDK's `toBytes()` expects first).

#### 🐛 Debug surface
- Per-chip write log (reader name, slot, pages written, error) shown in the modal in debug mode + pushed to the existing NFC debug feed.
- **Read-back diff** (debug): the sent vs read-back byte lists side by side, highlighting any mismatching page — the evidence behind a green/red verdict.
- Detected UIDs shown in the confirm modal (debug).
- Presence-watch trace (card appear/disappear per reader during the sequence).

#### 🧮 Effort & risk
**Effort: M** · **Risk: low-medium** (irreversible chip writes — but the confirm step, presence gate, mid-burn watch and all-or-nothing migration make it materially safer than today's one-shot path).

---

### 🏅 Custom avatar — user-uploaded image (Discord-style, simple)
Today's avatar is **initials on a colour gradient** (preset or custom hex). Personalisation stops at "pick a colour". Add the ability to upload a custom image — visible to the user and to their friends — while keeping the current colour gradient as the fallback when no image is set.

#### What "simple" means here
*Like Discord, but no animated avatars, no badges, no Nitro tiers.* One image per account. PNG / JPG / WebP. Auto-cropped to a square, displayed in a circle (CSS clip). Server-side max 1 MB to keep Storage bill at zero.

#### 🗃️ Data model
- `users/{uid}.avatarUrl` *(string)* — public download URL of the active avatar, or `null` for the colour fallback. Mirrored to `userProfiles/{uid}.avatarUrl` so friends discovered via the friend-system see the same image without read access to the owner's `users` doc.
- Storage path: `avatars/{uid}/avatar.<ext>` in **Firebase Storage** (this would be the first feature using Storage — see infrastructure note below).
- Optional `users/{uid}.avatarUpdatedAt` *(timestamp)* so cached image URLs can be busted with a query-string `?v=<ts>`.

#### 🔧 Sub-features — recommended ship order

##### V1 — Upload + crop + store  ·  **Effort: M**  ·  **Risk: low**
Edit-account modal grows an "Upload avatar" button next to the colour swatches. File picker → in-browser crop to 1:1 (reuse a tiny lib or hand-roll with `<canvas>` since we only need centre-crop + resize to 256×256). Upload to Storage. Write `avatarUrl` + `avatarUpdatedAt` to `users/{uid}` and mirror to `userProfiles/{uid}`.

##### V2 — Display surfaces  ·  **Effort: M**  ·  **Risk: low**
Every site that calls `getInitials(acc)` + `getAccGradient(acc)` today grows a "if `acc.avatarUrl` then `<img>` else current code" branch. **At least 6 places** to touch:
- Top-header chip (`renderer/inventory.js` L775)
- Sidebar account drop row (L860)
- Profiles modal account rows (L4101, L4126)
- Edit-account modal preview (L2889, L2913)
- Friends panel rows + incoming-request modal (existing `friendsList` render)
- Friend-view banner ("Viewing X's inventory") — `state.friendView.avatarColor` becomes `avatarColor || avatarUrl`

##### V3 — Remove / reset to colour  ·  **Effort: S**  ·  **Risk: low**
A "Remove image" button in the edit-account modal that deletes the Storage object, nulls `avatarUrl`, falls back to colour rendering everywhere.

##### V4 (optional) — Drag-and-drop straight onto the current avatar tile  ·  **Effort: S**  ·  **Risk: low**
Quality-of-life: drop a file on the avatar circle, same flow as the picker. Matches the rack-drag UX users already know.

#### ♻️ Reuses
- **Cropping**: only need 1:1 centre-crop + resize. The `data/container_spool/*` image flow already does `<canvas>`-based resizes in `_resizeImage` (services or main side, search before reimplementing).
- **Storage upload**: zero existing code — this is the **first feature** using Firebase Storage. Adds `firebase-storage-compat.js` to the v8 compat bundle and roughly 30 lines of upload helper.
- **Display fallback**: 100 % reuse — `getInitials` + `getAccGradient` stay the source of truth when `avatarUrl` is null. The `<img>` tag is only added on top.

#### 🐛 Debug surface
- Debug panel → Storage tab (NEW) with: own avatar URL, file size, last-updated timestamp, "Re-upload" button that re-runs the same write to test the path.
- Console log of every upload attempt with size + content-type — to spot users hitting the 1 MB cap.

#### 📐 Cross-cutting — infrastructure
- **Firebase Storage activation** — needs a `storage.rules` file alongside `firestore.rules` in `TigerTag_Firebase_Integration/rules/`. Default-deny everything except `read: if true` on `avatars/**` and `write: if request.auth.uid == userId && request.resource.size < 1*1024*1024 && request.resource.contentType.matches('image/.*')` on `avatars/{userId}/**`.
- **CSP** — current Electron CSP would need to allow `img-src https://firebasestorage.googleapis.com`. Check the security-headers section in `main.js`.
- **CDN-cache busting** — append `?v=${avatarUpdatedAt}` to every `<img src>` so a re-upload doesn't show the old cached image for ~1 h (Firebase Storage's default `Cache-Control: max-age=3600`).

#### 🔒 Firestore + Storage rules
- Firestore: `users/{uid}.avatarUrl` writable only by `request.auth.uid == uid` (already covered by the general per-user rule, just confirm it doesn't blacklist `avatarUrl`).
- Storage: see infrastructure note above. Test in Firebase emulator before deploying.

#### 🧮 Total effort
~**M + S buffer** for V1 + V2 + V3. V4 is a 1-hour nice-to-have on top.

#### 📐 Dependency
- Migration to Firebase v9 modular SDK (🌱 dev-experience item) is **not** a blocker — Storage works fine on the v8 compat layer too. But if v9 migration ships first, the upload helper gets cleaner.

---

### 🏪 Showroom mode — brand & reseller accounts (read-only catalogue, not stock)
Showroom accounts represent **filament brands or stores** that want to expose their catalogue inside Tiger Studio — **not** to track personal stock and consumption, but to present products aesthetically as a virtual storefront. Users add a showroom's friend code to browse its catalogue exactly like a friend's inventory, with two UX shifts when viewing a showroom: (1) the rack / Storage view shows square product photos in place of consumption fill bars, (2) the detail side panel grows a "Where to buy" section listing local resellers and a direct product URL.

#### What changes — and what does NOT change
**Changes (only when viewing a showroom):**
- Account type marker on `users/{uid}` (`accountType: "showroom"` vs default `"personal"`)
- Storage view renders square product photos, no weight fill bar, no consumption %, no "X g left" indicators — meant to feel like a virtual visit of the furniture displaying the spools
- Detail side panel grows a "Where to buy" section: product URL CTA + showroom-level resellers list
- Friend system: showroom code adds the storefront as a discoverable entity (showroom inventory is `isPublic: true` by default — no bidirectional friendship needed since the showroom doesn't need to read the user's inventory)

**Does NOT change** *(explicit user spec — "il ne faudrai rien changer a ce qui existe deja")*:
- Personal account behaviour (zero impact on stock management, consumption tracking, racks of own inventory)
- Existing friend-view technical detail rendering when viewing a showroom — material, colour, temperatures, links, all unchanged. The showroom additions are **purely additive** in the side panel.
- The current avatar / colour flow (a showroom uses the same Custom Avatar feature above for its logo)

#### 🗃️ Data model
```
users/{uid}/
  ... existing fields ...
  accountType:    string   "personal" (default) | "showroom"
  showroomInfo:   map?     // populated only when accountType == "showroom"
    storeName:    string   public-facing brand / store name
    website:      string   homepage URL
    countries:    string[] ISO-3166-1 alpha-2 codes the showroom serves
                           (used to bias the reseller list shown to the user)
    resellers:    map[]    [{ name, url, country?, city? }]
    socialLinks:  map[]    [{ platform, url }]  // instagram, x, facebook, youtube…

users/{uid}/inventory/{spoolId}/
  ... existing fields ...
  productUrl:     string?  // "Buy this filament" CTA — surfaced only in showroom side panel
```

Mirror `accountType` + `showroomInfo.storeName` + showroom avatar to `userProfiles/{uid}` so the friend-discovery preview can render the showroom badge before any inventory is read.

#### 🔧 Sub-features — recommended ship order

##### SR1 — `accountType` flag + `showroomInfo` schema *(plumbing)*  ·  **Effort: S**  ·  **Risk: low**
Add the field to `users/{uid}` with default `"personal"`, mirror to `userProfiles/{uid}`, gate who can flip it (see SR9). No UI yet.

##### SR2 — Edit-account modal: showroom form  ·  **Effort: M**  ·  **Risk: low**
Behind an "Account type → Showroom" switch in the edit-account modal, surface the `showroomInfo` form (storeName, website, countries multiselect, resellers list with add/remove rows, social links list). Hidden by default for personal accounts to keep the modal uncluttered.

##### SR3 — Storage view: showroom rendering mode  ·  **Effort: M**  ·  **Risk: low-medium**
When `state.friendView?.accountType === "showroom"` (or when the active account is a showroom), the Storage view swaps:
- Square product photo fills the cell (use the spool `imgUrl` or container image; fall back to colour swatch + brand logo if neither exists)
- Weight fill bar hidden via a `.rack--showroom` class on the rack root
- Consumption % / "X g left" / `wb-fill` overlays hidden by the same class
- Rack/level/position labels stay (G1, R2, etc.) — the virtual-tour feel needs the spatial layout preserved
- No drag-drop in showroom mode (read-only)

##### SR4 — Side panel "Where to buy" section  ·  **Effort: S**  ·  **Risk: low**
When the side panel renders a showroom spool, append a new section between the existing "Aspects" chips and the container card:
- Primary CTA button "Buy this filament" → `spool.productUrl` (hidden if not set)
- Secondary "Find a local reseller" list — `showroomInfo.resellers`, biased by user's locale (`navigator.language` country code highlighted first)
- Showroom website + social links as a small footer row
Nothing else in the side panel changes — the technical info (material, colours, temps, links) renders exactly as in friend-view today.

##### SR5 — Spool edit: `productUrl` field  ·  **Effort: S**  ·  **Risk: low**
When the active account is a showroom, the inline spool-edit modal grows a "Product URL" input. Hidden for personal accounts (irrelevant for stock).

##### SR6 — Showroom logo via Custom Avatar  ·  **Effort: 0 (reuse)**  ·  **Risk: low**
Showroom uses the Custom Avatar feature above. No new code — just wire `avatarUrl` into the showroom-specific surfaces (friends row, friend-view banner, side panel header). Friend-view banner text becomes "Viewing **X's catalogue**" instead of "**X's inventory**" when `accountType === "showroom"`.

##### SR7 — Friend system: discovery + badge  ·  **Effort: S**  ·  **Risk: low**
- Friend-code lookup preview shows a "Showroom" badge + brand name when the target's `accountType === "showroom"`
- Friends panel rows display the same badge + use `storeName` instead of `displayName`
- One-way subscribe: adding a showroom doesn't write to the showroom's `friends/` subcollection — it just adds the showroom to the user's friends list. `users/{uid}/inventory/**` is already readable thanks to `isPublic: true` defaulting on for showroom accounts.

##### SR8 — Showroom directory *(optional, nice-to-have)*  ·  **Effort: M**  ·  **Risk: low**
A dedicated "Showrooms" section in the friends panel (separated from personal friends), listed alphabetically with logo + storeName. Bonus: a "Featured showrooms" public list curated by admins, surfaced for first-time users.

##### SR9 — Gating: who can become a showroom?  ·  **Effort: S**  ·  **Risk: medium (policy)**
Decision pending — recommended path:
- **Phase 1**: admin-only flip (`users/{uid}.roles === "admin"` writes `accountType: "showroom"` from a separate admin tool or the Debug panel). Keeps the early stage clean while we onboard official brands.
- **Phase 2**: self-service "Apply to become a showroom" with terms acceptance + manual review queue.

#### ♻️ Reuses
- **Friend-view rendering path** — already read-only, already hides edit affordances. Showroom mode is a superset: add `.is-showroom` class to the panel root and rack root, the CSS does the show/hide work.
- **`isPublic` field** — already in the data model, currently unused for inventory rendering. Defaulting it to `true` on showroom accounts uses the existing plumbing.
- **Friend system publicKey lookup** — zero new code for discovery, showrooms are just "friends with a different badge".
- **Custom Avatar** — showroom logo is the same upload + display flow.
- **Side panel section structure** — "Where to buy" reuses the panel-section markup pattern (every section in the side panel already uses it).

#### 🐛 Debug surface
- Debug panel grows a "Showroom mode" tab showing: own `accountType`, `showroomInfo`, list of showroom friends with their `storeName` + `countries`. Useful to spot a broken / missing `showroomInfo` on a friend.
- A `?showroomDebug=1` query string forces showroom rendering on the active account regardless of `accountType`, so we can test the visual swap without flipping accounts.

#### 📐 Cross-cutting notes
- **i18n**: `accountTypeShowroom`, `viewingCatalogueOf`, `whereToBuy`, `buyThisFilament`, `findLocalReseller`, `localResellers`, `showroomBadge`, `applyToBecomeShowroom` (×9 locales)
- **CSS**: a single `.is-showroom` modifier on the rack root + side panel root handles 90% of the show/hide. Add a `.rack-cell--showroom` for the square-product-photo cells.
- **Side panel ordering**: the "Where to buy" section sits between Aspects and Container — high priority for showroom users, low intrusion for personal accounts (it doesn't render at all when not a showroom view).
- **Search**: showroom inventory should be searchable from the unified search bar — the existing search already runs against `state.rows`, no extra code needed.

#### 🔒 Firestore rules
- `users/{uid}.accountType` writable only by `request.auth.uid == uid && (resource.data.accountType == null || resource.data.accountType == "personal")` — i.e. user can flip themselves once, then a downgrade requires admin (prevents accidentally turning a personal account into a showroom and getting stuck). Initially gate even the first flip behind admin (SR9 Phase 1).
- `users/{uid}.showroomInfo.*` writable only by owner.
- `users/{uid}/inventory/**` already gated by friend / `isPublic` rule — no new rule needed if showroom accounts default `isPublic: true`.

#### 🧮 Total effort
~**M + S buffer** for SR1 + SR2 + SR3 + SR4 + SR5 + SR7. SR6 is free (depends on Custom Avatar shipping first). SR8 is +M nice-to-have. SR9 is a policy decision, not effort.

#### 📐 Dependency
- **Custom Avatar feature above** — strong reuse for the showroom logo. Ship Custom Avatar first, then showroom plugs into it. If Custom Avatar is delayed, showroom falls back to the colour-gradient avatar with a "🏪" emoji on top.

---

### ⭐ Favorites — long-term product memory (TigerTag+ only)
Today a spool's metadata disappears the moment the user consumes the last gram and deletes the doc. The user can't remember "I loved that Polymaker PolyTerra Charcoal — what was the typical price? What temp tower result did I get?". Favourites turn a TigerTag+ **product** (not a physical spool) into a long-lived entity with user-defined metadata that survives every restock cycle.

#### Why TigerTag+ only — and what to do about non-Plus
**TigerTag+** spools carry a stable `id_product` (32-bit integer, registered in the central API via `lookupProduct(productId)`). Two physical Polymaker PLA Black 1 kg spools share the same `id_product` — perfect primary key for "this product".

**TigerTag (DIY) / TigerCloud** carry user-encoded data with no stable product identity. A user who hand-writes "Polymaker PLA Black" on one chip and "Polymaker · PLA · Black" on another would create two distinct "products" that should logically be one — and we can't auto-merge without parsing brand + material + colour heuristics that will be wrong half the time.

**Decision**: V1 only supports TigerTag+ favourites. The "♥ Favorite" button is hidden on DIY/Cloud spools, with a tooltip *"Favourites need a registered product ID — available on TigerTag+ chips"*. A V2 could add a free-form "wishlist" for DIY (just notes, no auto-link), but it's a different feature — track separately.

**Barcode fallback considered + rejected** for V1: no public GTIN → TigerTag mapping exists, users won't manually type SKUs, and a community-maintained mapping is a separate sub-project. Revisit if a partner gives us their barcode database.

#### 🗃️ Data model
```
users/{uid}/
  favorites/{id_product}/                 // doc id = TigerTag+ product id (integer as string)
    addedAt:           timestamp
    addedFrom:         string             // "spool" | "showroom" | "deep-link" | "qr"
    minStockAlert:     number?            // grams — alert when sum(weight_available) across owned spools of this product < N
    purchasePrice:     number?
    purchaseCurrency:  string?            // ISO 4217 (EUR, USD, …)
    tags:              string[]
    notes:             string
    typicalReseller:   string?            // URL where the user usually buys
    lastInStockAt:     timestamp?         // auto-set when owned spool count > 0
    inStockNow:        boolean            // derived & cached for fast list-render
    inStockGrams:      number             // derived: sum(weight_available) across owned spools
    sourceShowroomUid: string?            // when added from a showroom, remember which one (for "buy from same brand" suggestions)
```

Product reference data (name, brand, material, colour, image) stays in the central TigerTag API + bundled `assets/db/tigertag/*.json`. Favourites only store the `id_product` + user-private metadata.

#### 🔧 Sub-features — recommended ship order

##### FA1 — Schema + "♥ Favorite" toggle on spool detail  ·  **Effort: S**  ·  **Risk: low**
Heart icon next to the existing "TigerTag+" tier badge in the spool detail side panel. Tap to add/remove from favorites. Hidden when `!r.isPlus`. Writes `users/{uid}/favorites/{id_product}` with `addedFrom: "spool"`. Tooltip explains the Plus-only restriction for DIY users.

##### FA2 — Favourites page  ·  **Effort: M**  ·  **Risk: low**
New sidebar entry "⭐ Favorites" between Filaments and Storage. Grid + table view (reuse `_createGridCard` / table render). Each card / row shows: product image, brand, material, colour swatch, "in stock now" badge (green if `inStockGrams > 0`, grey otherwise), min-stock alert chip if set, user tags, last-seen-in-stock timestamp. Sortable by name / brand / addedAt / inStockGrams. Filterable by tag.

##### FA3 — Per-favorite metadata edit  ·  **Effort: S**  ·  **Risk: low**
Side panel (reuse the existing detail panel pattern) when a favourite is selected: editable fields for `minStockAlert`, `purchasePrice` + currency, `tags`, `notes`, `typicalReseller`. Live-saved with the same debounce + ✓ check pattern just shipped for weight.

##### FA4 — Auto-link spools to favourites + stock aggregation  ·  **Effort: S**  ·  **Risk: low**
On every Firestore snapshot, for each favourite, sum `weight_available` across owned spools where `id_product === favoriteId`. Cache as `inStockGrams` + `inStockNow` on the favourite doc. Update `lastInStockAt` when transition to `inStockNow: true`. Pure derived data — kept in Firestore for fast list-render without re-summing on every UI update.

##### FA5 — Low-stock alerts  ·  **Effort: S** *(depends on FA4)*  ·  **Risk: low**
When `inStockGrams` drops below `minStockAlert`, fire an in-app banner + (if Notifications feature ships) a native push. Banner sits in the Favorites page header: *"⚠️ 3 favourites below their min-stock threshold"* with a click-through to the filtered list.

##### FA6 — Deep link from reseller sites  ·  **Effort: M**  ·  **Risk: low-medium**
Register `tigertag://` as a custom protocol via `app.setAsDefaultProtocolClient('tigertag')` (electron-builder handles installer registration on Win/Mac/Linux). Reseller embeds:
```html
<a href="tigertag://favorite/add?id=12345&source=polymerearth.com">Add to TigerTag favourites</a>
```
Tiger Studio launches (or focuses) and shows a confirm modal: product preview (via `lookupProduct(12345)`), source domain badge, "Add to favourites" button. `addedFrom: "deep-link"`, `typicalReseller` pre-filled with the source URL.

##### FA7 — QR code generator for showrooms / packaging  ·  **Effort: S** *(depends on FA6)*  ·  **Risk: low**
Showroom owners (and TigerTag admins) get a "Generate QR code" button on each product in their catalogue: encodes the same `tigertag://favorite/add?id=…` URL into a downloadable PNG. Users scan with their phone → mobile companion or system browser opens → custom protocol launches Tiger Studio → confirm modal.

##### FA8 — Showroom catalogue integration  ·  **Effort: S** *(depends on Showroom + FA1)*  ·  **Risk: low**
Inside a showroom's catalogue view, every spool gets the same "♥ Favorite" heart. Adds the product with `addedFrom: "showroom"` and `sourceShowroomUid: <showroomUid>` — lets us later suggest "buy from the same brand you favourited X from".

##### FA9 — Import / export favourites  ·  **Effort: S**  ·  **Risk: low**
JSON dump of the user's favourites collection — sharable, backup-able, importable into another account. Format documented so partners (resellers, dryer firmware) can generate compatible files.

#### ♻️ Reuses
- **`lookupProduct(productId)` IPC** — already exists, gives us brand / name / images / series / refill flag for any TigerTag+ product. Zero new API code needed.
- **`tigertagDbService`** — bundled `id_brand.json` / `id_material.json` / etc. — same lookup tables, no new data.
- **Detail side panel** — reuse the same flexbox layout + section pattern; the favourites panel is structurally identical to the current spool panel, just different fields.
- **Grid / table render** — `_createGridCard`, `_updateGridCard`, and the table row builder all work as-is by feeding them a "favourite" shape that mimics a spool row.
- **Custom protocol handler infrastructure** — needs a `protocol` registration block in `main.js` (~30 lines). Once in place, future deep-link features get it for free.
- **In-app banner system** — already exists for the "update available" notice; reuse for low-stock alerts.

#### 🐛 Debug surface
- Debug panel → "Favourites" tab: own favourites count, sum of `inStockGrams` across all, list of products below their `minStockAlert`. Force-trigger an alert via a "Test low-stock alert" button.
- `?favDebug=1` query string logs every snapshot's per-favourite aggregation to console.

#### 📐 Cross-cutting
- **i18n** — `favoritesTitle`, `addToFavorites`, `removeFromFavorites`, `minStockAlertLabel`, `purchasePriceLabel`, `tagsLabel`, `notesLabel`, `typicalResellerLabel`, `lowStockBannerOne`, `lowStockBannerMany`, `favoritesEmpty`, `favoritePlusOnly` (the explainer tooltip) (×9 locales)
- **Notifications dependency** — FA5 in-app banner ships standalone; native push is a bonus when the Notifications feature lands.
- **Deep link safety** — confirm modal is mandatory; never silently add a favourite. Source domain shown so the user spots a phishing attempt.

#### 🔒 Firestore rules
- `users/{uid}/favorites/**` — read/write only by `request.auth.uid == uid`. No public read (privacy: user's wishlist is sensitive — could reveal purchasing intent).
- Optional public-favourites in V2: gated by an explicit `users/{uid}.favoritesPublic == true` flag.

#### 🧮 Total effort
~**M + S buffer** for FA1 → FA5 (the core loop). FA6 + FA7 = additional **S+M** (deep link is the bigger piece). FA8 = trivial once Showroom + FA1 exist. FA9 = S nice-to-have.

#### 📐 Dependency
- **Showroom mode** — FA8 needs it; FA1-FA7 stand alone
- **Notifications feature** *(in backlog)* — FA5 ships with an in-app banner without it; native push is the bonus when it lands

---

### 🎨 UX polish — theme, keyboard shortcuts, first-run onboarding
Three independent quality-of-life items that share a "small effort, big user-love" profile. Each ships standalone — but they cluster naturally because they all touch the chrome / shell rather than any domain feature.

#### UX1 — Dark / Light theme  ·  **Effort: M**  ·  **Risk: low**
Today the app is light-only. The hardware crowd skews heavily nocturnal — print farms running overnight, garage workshops with low ambient light — so a dark theme is a high-frequency feature request.

- **Detection**: `window.matchMedia('(prefers-color-scheme: dark)')` for system default + manual override in Settings (`tigertag.theme = "auto" | "light" | "dark"`, persisted in localStorage + synced to `users/{uid}/prefs/app.theme`).
- **CSS work**: most colours already in `var(--…)` form (see `renderer/css/00-base.css` `:root` block). Audit pass to find the hardcoded ones (`color: #1c2030`, `background: #fff`, etc.) and replace with vars. Add a `[data-theme="dark"]` selector that overrides the root vars.
- **Smooth swap**: 300 ms ease on `body` `transition: background-color .3s, color .3s` so the theme change isn't jarring.
- **Surface coverage**: side panel, modals, sidebar, racks, printer cards, debug panel, friend-view. Friend view inherits without per-user state since the theme is local (you read someone else's inventory in YOUR theme, not theirs).
- **Reuses**: existing CSS var system 90 % done; the i18n select pattern in Settings for the auto/light/dark switch.
- **Risk note**: SVG icons that use `currentColor` for the mask work as-is; the few inline-`fill` SVGs need a sweep. The toast / alert greens-and-reds need a dark-mode-adjusted palette so they stay accessible.

#### UX2 — Global keyboard shortcuts + cheat-sheet  ·  **Effort: S**  ·  **Risk: low**
Power-users currently click through menus for the same handful of actions every session. A small shortcut layer covers 80 % of those clicks.

- **Bindings** (Mac shown; Ctrl on Win/Linux):
  - `⌘K` — focus search bar (overlay if not visible)
  - `⌘N` — add spool / scan
  - `⌘B` — toggle scan mode
  - `⌘,` — open Settings
  - `⌘D` — open Debug panel (admin only)
  - `⌘/` — open cheat-sheet overlay listing every shortcut
  - `⌘1`-`⌘5` — switch view (Filaments / Storage / Printers / Friends / Favourites)
  - `Esc` — close any open modal / overlay (already partial)
- **Implementation**: one `keydown` listener on `document` with modifier checks. Skip when `document.activeElement` is an `<input>`, `<textarea>`, or `[contenteditable]` to avoid stealing user typing.
- **Cheat-sheet overlay**: same modal style as the existing Help overlay (`#productIdHelpOverlay` pattern). Lists all bindings with platform-aware modifier symbols.
- **Reuses**: existing modal overlay pattern; `applyTranslations` for the cheat-sheet content.

#### UX3 — First-run onboarding tour  ·  **Effort: M**  ·  **Risk: low**
New sign-in goes from "you're authenticated" straight to an empty inventory. A 3-4 step walkthrough demystifies the core flows and bumps day-1 retention.

- **Steps** (skippable, replayable from Settings):
  1. Header + avatar — *"Set a custom avatar and pick your colour"* (links to Custom Avatar feature if shipped)
  2. Scan button — *"Place a TigerTag chip on your reader to add a spool"*
  3. Storage view — *"Drop spools into a rack to track where each one lives"*
  4. Friends panel — *"Share your inventory by adding a friend's code XXX-XXX"*
  5. Optional: *"Settings → import from Spoolman if you're migrating"*
- **Positioning**: `getBoundingClientRect()` of the target element + absolute-positioned tooltip card with arrow. Skip / Back / Next / Finish controls.
- **State**: `users/{uid}/prefs/app.onboardingCompleted = true` (Firestore-synced so a second device skips it).
- **Restart**: a "Replay onboarding" button in Settings → Help so users who skipped can come back.
- **Reuses**: i18n strings (already-translated keys for most labels); modal overlay z-index; the same `setupHoldToConfirm` cancel-on-Esc pattern for the skip button.
- **i18n**: `onboardStep1Title`, `onboardStep1Body`, …, `onboardSkip`, `onboardNext`, `onboardFinish`, `onboardReplay` (×9 locales)

#### 🧮 Total effort
~**M + S** for the bundle. Ship in any order; UX2 is the fastest win and can land in an afternoon. UX1 is the most visible. UX3 has the highest impact on first-time conversion.

---

### 📖 Printer connection tutorials — guided setup per brand
Every brand needs a different LAN-mode dance before Tiger Studio can talk to it: Snapmaker is "just enter the IP", FlashForge is "flip LAN mode then enter the IP", Bambu Lab wants the IP **plus** an 8-digit access code **plus** the serial number, Creality K-series varies by firmware vintage, Elegoo needs LAN + MQTT bridge enabled. New users hit a wall on the printers with multi-step prerequisites and assume the integration is broken when it's actually their printer waiting for a menu toggle. The mobile app already has these step-by-step tutorials — port them to desktop with screen-size adaptation.

#### Why this matters
- **Day-1 retention** for hardware-heavy brands (Bambu, Creality). Users who can't connect within 5 minutes churn.
- **Support deflection**: every brand's connect tutorial answers ~80 % of the support tickets we see for that brand.
- **Trust signal**: a brand with a polished, illustrated tutorial reads as "officially supported"; a brand without one reads as "experimental".

#### 🗃️ Data model
```
No new Firestore docs needed — tutorials are static content bundled with the app.
Optional, sync-friendly:
  users/{uid}/prefs/app.tutorialsCompleted: string[]   // ["bambu", "snapmaker", …]
```

Tutorial content lives at `renderer/printers/<brand>/tutorial.json` alongside `PROTOCOL.md`. Same JSON shape as the mobile app so a single source of truth can feed both clients.

```jsonc
// renderer/printers/bambulab/tutorial.json
{
  "brand": "bambulab",
  "estimatedMinutes": 5,
  "prerequisites": ["bambuPrereq1", "bambuPrereq2"],   // i18n keys
  "steps": [
    {
      "id": "lan-mode",
      "title": "bambuStep1Title",                       // i18n key
      "body":  "bambuStep1Body",
      "image": "assets/img/tutorials/bambulab/01-lan-mode.png",
      "verify": { "type": "ping", "host": "{{userIp}}", "port": 8883 }
    },
    {
      "id": "access-code",
      "title": "bambuStep2Title",
      "body":  "bambuStep2Body",
      "image": "assets/img/tutorials/bambulab/02-access-code.png",
      "verify": { "type": "input-format", "field": "accessCode", "regex": "^[0-9]{8}$" }
    },
    …
  ]
}
```

#### 🔧 Sub-features — recommended ship order

##### T1 — Tutorial schema + content port from mobile  ·  **Effort: M**  ·  **Risk: low**
Define the JSON shape (sub-feature data model above). Port the existing mobile-app tutorial content for the 5 brands: Snapmaker (~3 steps), FlashForge (~4 steps), Elegoo (~5 steps), Creality (~6 steps, possibly 2 variants for K-series vs older), Bambu Lab (~7 steps). Each step's `title` + `body` becomes 5-10 i18n keys; total ~150 new keys × 9 locales (volume but mechanical via the existing `npm run i18n:add` helper).

##### T2 — Tutorial modal UI  ·  **Effort: M**  ·  **Risk: low**
A slide-over modal (reuse `.modal-overlay` + `.modal-card`) with:
- Step indicator (e.g. *"Step 3 of 7"*) + progress dots
- Large illustration (the bundled PNG)
- Step title + body
- Optional `verify` block: a small status pill that runs the check (e.g. *"Pinging your printer on port 8883…"* → ✓ / ✗ with retry)
- Prev / Next / Finish controls + Esc to close
- "I'm stuck" link → opens the brand's Discord channel / official support URL

##### T3 — Trigger points  ·  **Effort: S**  ·  **Risk: low**
- **From Add Printer modal**: a "📖 Tutorial — connect a {{brand}}" link under each brand card (5 trigger points, one per brand)
- **From Settings**: a "Printer connection tutorials" entry that lists all 5 brands with their estimated time + completion checkmark
- **From an error state**: when the connection attempt fails repeatedly (e.g. 3 timeouts in a row on the same IP), surface a banner *"Need help connecting? Open the {{brand}} tutorial"*
- **From the empty state**: when the user has zero printers, the empty Printers view shows *"Connect your first printer →"* with the brand picker + tutorial CTA

##### T4 — Live verification hints  ·  **Effort: M**  ·  **Risk: low-medium**
Per-step `verify` block — different types:
- `type: "ping"` — TCP / WS / MQTT probe on the IP+port the step requires. Reuses each brand's `probe.js` discovery code.
- `type: "input-format"` — regex check on the field the user is filling (e.g. Bambu access code = `^[0-9]{8}$`). Live feedback as they type.
- `type: "lan-discovery"` — runs the brand's LAN scan, surfaces detected devices as clickable rows so the user doesn't have to manually copy the IP.

Each verifier returns `{ ok: boolean, hint: i18nKey }` so the modal can show a localised next-action.

##### T5 — Per-brand quick-tip card *(TL;DR for power users)*  ·  **Effort: S**  ·  **Risk: low**
A compact 1-paragraph summary shown at the top of the add-printer form for each brand — *"Bambu: enable LAN-only mode → grab access code from screen → serial number is on the bottom sticker"*. Users who already know what they're doing skip the full tutorial; those who don't see the link to T2.

##### T6 — Video embeds *(optional, deferred)*  ·  **Effort: S**  ·  **Risk: low**
Optional `videoUrl` field on the tutorial JSON — embeds a YouTube thumbnail (reuse the existing `panelVideoBtn` pattern) for brands where a 60-second video explains a menu navigation better than a screenshot.

##### T7 — Shared tutorial source with the mobile app  ·  **Effort: S**  ·  **Risk: low**
Move the tutorial JSONs to a shared submodule or CDN-served bundle so a content fix lands on both apps without dual maintenance. Initial implementation can keep tutorials inlined for simplicity; refactor to shared source when the second client (mobile) needs an update.

#### ♻️ Reuses
- **`PROTOCOL.md` per brand** — already documents the technical prerequisites. T1 mines these for the user-facing steps.
- **`probe.js` per brand** — already does LAN discovery for T4's `lan-discovery` verifier.
- **Add Printer modal** — T3 adds links inside the existing modal, no new entry point.
- **Modal overlay pattern + `applyTranslations`** — T2 plugs into the existing modal infrastructure.
- **YouTube thumbnail pattern** — `panelVideoBtn` from the spool detail panel works as-is for T6.
- **Bambu / Creality `add-flow.js`** — already collects access code + serial for Bambu, IP for Creality. The tutorial just narrates these existing flows.

#### 🐛 Debug surface
- Debug panel → "Tutorials" tab: per-brand completion status, last verify result per step, force-replay any tutorial. Useful when the user reports *"the tutorial says ✓ but the printer still doesn't connect"* — gives us the exact probe output to diagnose from.
- A `?tutorial=<brand>` query-string deep link forces-open a tutorial for screenshot capture in the README + support docs.

#### 📐 Cross-cutting
- **i18n volume**: ~150 keys × 9 locales = ~1350 string additions. Mechanical via `npm run i18n:add`. Pre-commit hook (`i18n:check`) catches any drift.
- **Image assets**: bundled PNGs at `assets/img/tutorials/<brand>/NN-step.png`. Compress aggressively (TinyPNG / squoosh) — tutorials add ~5-10 MB to the installer if not careful. Lazy-load (image only fetched when the step is shown).
- **Trademark caveat**: screenshots of competitor printer UIs are fine for instructional use (fair use / educational), but mention "Screens shown are from manufacturer firmware; trademarks belong to their respective owners" in a one-time footer.
- **Update flow**: when a brand changes their menu structure (firmware update), the tutorial needs revision. Track per-brand "last updated" in the JSON; show a small "tutorial verified for firmware ≥ X.Y" footer.

#### 🧮 Total effort
~**M + M buffer** for T1 + T2 + T3 + T5 — the user-visible core. T4 is +M for the verifier framework. T6 is +S. T7 is housekeeping for later.

#### 📐 Dependency
- **None blocking**. Snapmaker / FlashForge / Creality / Bambu / Elegoo live integrations all already shipped (or stubbed) — the tutorial is purely additive content + UI.
- **i18n helper** (`npm run i18n:add`) — already in place.

#### Per-brand estimated complexity (for content authoring)
| Brand | Steps | Has access code / serial | Multiple sub-tutorials |
|---|---|---|---|
| **Snapmaker** | ~3 | no | no |
| **FlashForge** | ~4 | no | no |
| **Elegoo** | ~5 | sometimes (MQTT broker on some models) | maybe (Centauri vs Saturn) |
| **Creality** | ~6 | no, but firmware variance | yes (K-series vs older) |
| **Bambu Lab** | ~7 | **yes** (8-digit code + 16-char serial) | no |

---

### 🏅 Multi-vendor RFID parsers — 7 vendors remaining
- **Spec**: [`docs/rfid-vendors/NEXT_STEPS.md`](docs/rfid-vendors/NEXT_STEPS.md) is a complete handoff doc — read it first.
- **What's there**: OpenRFID submodule + 8 self-contained spec sheets. ACR122U reader stack already done.
- **What's missing**: JS parsers under `renderer/lib/rfid/<vendor>.js`. Only TigerTag is decoded today.
- **Recommended order** (easy → hard): Openspool → Anycubic → Elegoo → Qidi → Creality → Bambu → Snapmaker.
- **Open questions**: where parsed-but-not-in-inventory tags live, conflict resolution with TigerTag tags, lookup-table delivery (bundled vs CDN-served).
- **Effort**: M (Openspool / Anycubic / Elegoo / Qidi each), L (Creality), XL (Bambu, Snapmaker — crypto).
- **Risk**: low (parsers are pure functions, no UI changes until dispatcher hooks them in).

### 🏅 Firestore Security Rules for `roles` + `Debug` fields
- **Where**: per [CLAUDE.md L175](CLAUDE.md#debug-mode), the `roles` and `Debug` fields in `users/{uid}` should be writable only via Firebase Admin SDK / Cloud Functions, never by the client. Today's UI toggle is a UX convenience but a malicious client could grant itself `roles: "admin"`.
- **Action**: add a Firestore Security Rule denying writes to those two fields except by admin SDK. Optionally a Cloud Function exposed to a separate admin tool to flip them.
- **Effort**: S (rules), M (Cloud Function setup if going that route).
- **Risk**: medium — bad rule = lockout. Test in Firebase emulator first.

### 🏅 Phase 2 Snapmaker — NFC scan from the printer
- **Spec**: code at [`renderer/inventory.js` L5542](renderer/inventory.js) leaves a Phase 2 marker: *"manual filament edit ✅, NFC scan, thumbnail metadata."* Manual filament edit shipped in v1.4.8 — what's left is reading filament tags via the printer's own NFC reader (Snapmaker U1 has one) instead of forcing the user to scan via ACR122U.
- **Approach unknown**: the Moonraker WebSocket likely doesn't expose NFC scan natively — would require a Snapmaker-specific G-code or HTTP endpoint. Research before scoping.
- **Effort**: L (research-heavy).
- **Risk**: high — depends on what Snapmaker exposes.

### 🏅 Pre-commit hook extensions
- Hook is at `.githooks/pre-commit`. Currently runs only `npm run i18n:check`.
- **Could add** when the project gains the corresponding tools:
  - `eslint --max-warnings 0` on staged `.js` (project has zero JS lint config today)
  - `prettier --check` (zero formatter config today)
  - `tsc --noEmit` (project is plain JS, no TS step today)
- **Effort**: S each, but each requires onboarding the corresponding tool first.
- **Risk**: low.

### 🎖️ README screenshots
- README has the line *"Screenshots coming soon"* in the Distribution section.
- **Action**: capture 4-6 screenshots (inventory, rack view, printer detail, friends modal, login, debug panel) at consistent window sizes, drop into `assets/img/screenshots/`, embed in README.
- **Effort**: S.
- **Risk**: zero.

---

## 🏅 Backlog — ideas worth keeping

No commitment, no ETA. Listed roughly by likely impact.

- **Public inventory page** — `state.isPublic` already persists in `users/{uid}.isPublic`, but no public read-only view renders it. Would let a maker share their stash via a public URL. Needs: separate route/page, Firestore rule allowing `read` on `isPublic == true`, link generation in the friends panel.
- **Other-brand live integration** — Bambu Lab (MQTT LAN), Creality (Klipper WS), Elegoo (MQTT), FlashForge (HTTP) currently render as **read-only cards** with online ping. Each could grow a live block matching Snapmaker's Phase 1 (temps + active job). Bambu MQTT first probably (largest user base). Each = L.
- **Print history per spool** — track which printer used which spool over time. Needs: schema decision (top-level `printJobs/` collection? embedded in spool doc?), capture hook in Snapmaker WS layer (the print job card already has the data we'd need), history UI in spool detail panel.
- **Spool predictions** — *"this spool will run out around X day"* based on historical usage. Depends on print history existing first.
- **Filament cost tracking** — per-spool cost field, aggregate by month / by printer / by material in stats. Pure UI + schema addition.
- **TigerScale — auto weight transfer** — after a successful TARE + send cycle, auto-update the matched spool's `weight_available` in Firestore from `netWeight`.
- **Marketplace / shared filament profiles** — share a `(material, brand, optimal_settings)` triple to a public registry; users could pull recommended print profiles for a given spool.
- **Web build** — multiple comments in `inventory.js` mention *"future web build hosted on tigertag-cdn"*. Sidesteps Electron's NFC requirement (no NFC = no scan, but read-only inventory works fine in browser). Needs: Electron-API polyfills/stubs, build target split.
- **Mobile companion app deep-linking** — the desktop app shows a QR for the mobile app; mobile could deep-link back into a specific spool / printer / friend on desktop.

---

## 🌱 Internal / dev-experience

Lower priority but worth noting.

- **Migrate to Firebase v9 modular SDK** — the current app uses the v8 compat bundle (`firebase-app-compat.js` etc.) which calls `eval()` internally. This forces `unsafe-eval` in any Content-Security-Policy, triggering an Electron security warning in dev. Migrating to the v9 modular API (`import { getAuth } from 'firebase/auth'`) eliminates `eval()` usage entirely → a proper restrictive CSP becomes possible → warning disappears. **Effort**: L. **Risk**: medium (v8 `firebase.auth()` / `firebase.firestore()` call style changes significantly to functional API). Has no user-visible impact; purely a dev-quality and security hardening item.
- **Modularize `inventory.js`** — split the 12k-line IIFE into ES modules (auth, inventory, racks, snapmaker, friends, ui-helpers, …). XL effort, medium risk (every cross-file dep needs an import). Discussed but parked because the CODEMAP gives most of the navigation benefit at zero risk.
- **TypeScript port** — only worth it after modularization. Would catch a real class of bugs (type mismatches in Firestore schemas, plural-object inconsistencies the i18n hook now catches manually). XL.
- **Unit tests** — zero unit tests today. Project is UI-heavy so e2e would matter more (Playwright / Spectron). Start with auth flow + i18n consistency + rack drag-drop (the bug-prone bits). L.
- **Storybook for CSS** — with the new `renderer/css/*.css` split, individual modules could be previewed in isolation. M, useful when introducing visual regressions.

---

## 🤝 Conventions

When picking up a 🚧 item:
1. Read the corresponding `docs/<topic>/NEXT_STEPS.md` first if one exists.
2. Move it from 🚧 to ✅ when shipped, with the version it landed in.
3. Add the changelog entry to README.md (under the new version section).
4. If the work uncovers new TODOs, add them here — don't let them rot in a code comment.

When adding to 🏅 / 🌱:
- Be specific. Vague ideas (*"improve UX"*) get pruned.
- If you have a rough approach, write a one-liner. If not, leave it as a question.

When pruning:
- Items here for >12 months with no movement → either move to ✅ ("decided not to do") or to a separate `docs/parked/` doc with the reasoning.
