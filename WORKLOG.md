# Worklog — v1.8.3 (in progress)

## Added

- **Detail panel — inline editable spool name (`message` field)** — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`
  - Identity block restructured: **Brand · Series · Material on line 1**, the message (name) on its own full-width line below (text left, edit pencil pinned right) — clearer and roomier than sharing the Material line.
  - The editable message is available on **every spool type** (Cloud, basic, TigerTag+) outside friend view. On TigerTag+ the catalogue name (e.g. "Artic Teal") stays read-only on its own line and the editable message renders below it as a lighter secondary label; on Cloud/basic the message IS the spool name. Writes the `message` chip slot; Enter/blur saves, Escape cancels. It's a free-text note (placeholder "Add a note"). Same 28-byte UTF-8 cap as the Add Product colour-name field, with a thin usage bar under the input that fills as the byte budget is consumed (blue → amber ≥80% → red when full; no number shown).
  - Editing the message is a chip change (it lives in the chip's color_name slot): it now flags `needUpdateAt` (twin-aware) just like TD / colour edits, so the chip-update badge + re-burn banner appear. Skipped for Cloud spools (no physical chip).
- **Toolbox — Duplicate spool (×N)** — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`
  - New "Duplicate" tool (first toolbox row, hold-to-confirm 1s) with a − N + quantity stepper (1–50): mint one or many copies in a single batched write. Main label tracks the count ("Duplicate ×N"); in-place confirmation flashes in the label.
  - Each copy is a fresh `CLOUD_` doc, identical to the source (same `id_tigertag`, colour, material…) except a unique Cloud UID. Shown for TigerCloud and basic TigerTag spools; hidden for TigerTag+ (not duplicable). A basic TigerTag necessarily becomes Cloud (a digital clone has no physical chip).
  - No twin link, no rack placement survive the clone (nothing physical exists in a Cloud entry). Twin-conflict avoidance: copies are spaced **+3s** apart on `timestamp` (and past the source's own timestamp) so the 2s-window twin auto-linker never pairs identical copies — the timestamp doubles as the twin-pairing key.
  - Split-row render now supports a hold-to-confirm main button; Duplicate uses a blue (constructive) hold fill instead of the red danger tint.
- **Bambu printer models: `camera_transport` field + X2D** — `data/printers/bbl_printer_models.json`
  - Added `"camera_transport": "rtsp"` / `"jpeg_tcp"` on every entry; single source of truth for JPEG TCP vs RTSP camera detection
  - Added X2D (ID `"12"`, `camera_transport: "rtsp"`, image X1C placeholder)
- **README: TigerPOD section** — dedicated subsection with embedded video, feature table, and MakerWorld download link — `README.md`
- **README: Open source ecosystem section** — table of all 4 open source components (Studio Manager, SDK JS, TigerScale, TigerPOD) with repo links, licenses, and SDK description — `README.md`
- **README: Screenshots section** — 6 app screenshots in 3×2 grid (inventory, printers, racks, cam, TD1S, TigerPOD) replacing "coming soon" — `README.md`, `assets/img/screenshots/`
- **README: TigerPOD video** — replaced `<video>` tag with clickable thumbnail (`screenshot_tigerpod.png`) linking to the mp4 — `README.md`
- **README: TD1S section** — photo (`TD1S_Front.png`) added above feature description — `README.md`
- **README: TigerScale section** — photo (`TigerScale_Photo.png`) added above feature list — `README.md`
- **README: Storage / Racks section** — 4 rack preset photos added (Standard, Extended, Mini, Box 6), feature list expanded with rack presets mention — `README.md`

## Changed

- **ROADMAP: new entry "Printer slot storage — assign filaments to machine slots (dual-location)"** — `ROADMAP.md`
  - Spec'd the feature: on printer connect, materialise virtual storage mirroring the machine's feed slots (Ext./AMS/AMS-HT…); assign inventory spools to slots like racks, but as a second simultaneous location (`mount` field) that never clears the rack home; right-click → printer → slot assignment with eviction-on-occupied; dual-location indicators in the filament list. Data model, sub-features P1–P5, reuses, debug surface, dependencies.
  - Refined: slots are **persisted on the printer device doc** (seeded on connect, reconciled on accessory add/remove, deleted only when the printer is removed), keyed by a **stable hardware id** (AMS serial) for reliable recognition across reconnects, with a `present` flag (absent ≠ deleted) so temporary disconnects don't wipe assignments.
  - Clarified: **slots stay active even when the printer is offline/disconnected** — connection state is orthogonal to slot availability (`present` tracks the accessory, not the link). Assignment menu + slot boards target every printer in inventory regardless of connection; reconciler only runs while connected.
  - Model change: **the printer owns occupancy** — each slot stores the spool UID(s) (`uids`: 1 for a plain spool, 2 for a twin pair) on the printer doc; no `mount` field on the spool. Eviction is intrinsic (overwrite the slot's `uids`); mount state is a derived in-memory `uid → slot` index rebuilt on each `state.printers` snapshot.
  - Firestore-rules note: owner path needs no new rule (own subtree); optional `uids` shape validation as hardening.
  - Added sub-feature **P6 — share printer fleet + slot contents with selected friends**: per-friend `sharePrinters` opt-in on the owner's `friends/{uid}` doc, Firestore read grant on `printers/**` gated by the existing friendship key **plus** `sharePrinters == true`, read-only slot boards in friend view (uids resolved against the friend's already-readable inventory), immediate revocation. Adjusted the Friend-view + Firestore-rules notes accordingly.
- **Rename "TigerTag Cloud" → "TigerCloud"** — across the app (badge labels, stat tile, `protocol`/filter value, comments), all 9 locales (`statCloud`, `toolDuplicateTip`), CSS, and docs (README, ROADMAP, CHANGELOG, DEVLOG). `protocol` and stat `filter` stay matched so the Type quick-filter keeps working.
- **Bambu camera transport: JSON-driven instead of hardcoded** — `renderer/printers/bambulab/index.js`
  - Removed `_SERIAL_PREFIX_MODEL` and `_JPEG_CAM_IDS` hardcoded sets
  - `bambuUsesJpegCam(p)` now reads `camera_transport` from `bbl_printer_models.json` via `ctx.findPrinterModel`
  - `bambuModelId(p)` simplified: returns `parseInt(printerModelId)` with no serial-prefix fallback

## Fixed

- **Printers table — Bambu IP not shown** — `renderer/inventory.js`
  - Bambu printers store their IP in `p.broker` (MQTT broker address), not `p.ip`
  - Table cell and IP sort column now use `p.ip || p.broker` so Bambu IPs appear correctly

## Removed

## i18n

- Added: `toolDuplicate`, `toolDuplicateTip`, `toolDuplicateOk`, `toolDuplicateCount`, `msgEditTip`, `msgEditAdd` — 9 locales
