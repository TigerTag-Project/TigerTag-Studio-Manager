# Worklog — v1.8.19 (in progress)

## Added
- Printer connection tutorials — ported the mobile app's step-by-step LAN-mode guides into Studio. New `#printerTutorialOverlay` modal with: a **model picker** that opens first (printer photo + model name only — no clutter), 4-column grid sorted by entry-level → flagship for Bambu (A1 mini → A1 → P1P → P1S → P2S → X1 Carbon → X1E → H2S → H2D → H2D Pro → H2C), tutorial steps displayed as full-width image + caption + step counter + dot nav + Prev / Next / Finish, keyboard nav (Esc / ←→), and auto-resolve from a model-name hint. Surfaced via an inline "📖 Tutoriel de connexion" pill rendered inside the Add Printer brand card (Bambu Lab, FlashForge, Elegoo — brands shipping a `tutorial.json`). 11 Bambu models point at 3 distinct step series (X1/H2/P2 is one tutorial since the procedure is identical), FlashForge 4 models → 1 series (AD5X), Elegoo 1 model → 1 series. 34 illustration images bundled under `assets/img/tutorials/<brand>/`, 16 printer-model thumbnails under `assets/img/tutorials/<brand>/models/`, 3 `tutorial.json` files in `renderer/printers/<brand>/` — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/60-modals.css`, `renderer/css/40-printers.css`, `renderer/printers/{bambulab,flashforge,elegoo}/tutorial.json`.
- ROADMAP — 5 new feature entries authored (no code yet): **🏅 Custom avatar** (Discord-style image upload, Firebase Storage backed), **🏪 Showroom mode** (brand/reseller accounts with square product photos + product URLs + local-reseller lists), **⭐ Favorites** (TigerTag+ wishlist with low-stock alerts + `tigertag://` deep links + QR codes), **🎨 UX polish bundle** (dark/light theme + global keyboard shortcuts + first-run onboarding), **📖 Printer connection tutorials** (the feature now shipped above) — `ROADMAP.md`.

## Changed
- Printer Tableau view — default sort is now `status` descending so **online printers sit at the top** by default (was unsorted) — `renderer/inventory.js`.
- Printer Grille view — removed the grey rounded rectangle behind each printer card thumbnail; photo now renders directly on the card surface for a cleaner, less boxed look — `renderer/css/40-printers.css`.
- Add Printer brand picker — the "📖 Tutoriel de connexion" pill now sits **inside** the brand card (between labels and chevron) rather than below it. Rendered as `<span role="button">` to avoid invalid button-in-button nesting; direct click handler with `stopPropagation` prevents the pill click from also triggering the brand-select action — `renderer/inventory.js`, `renderer/css/60-modals.css`, `renderer/css/40-printers.css`.
- Tutorial model picker cards — model name moved **above** the printer photo (was below), step count chip removed entirely (the count is shown only inside the step view, not in the picker), card background and border made transparent at rest, image background removed — pure printer photo with name on top — `renderer/inventory.js`, `renderer/css/60-modals.css`.

## Fixed

## Removed

## i18n
- Added: tutorial chrome — `tutoStepXOfY` (with `{{n}}`/`{{total}}`), `tutoPrev`, `tutoNext`, `tutoFinish`, `tutoClose`, `tutoOpenBtn`, `tutoTitleFor` (with `{{brand}}`), `tutoPickModel`, `tutoEstimatedMinutes`, `tutoNone`, `tutoStuckLink` — 9 locales (×11 keys)
- Added: tutorial step bodies (×27 keys, 9 locales each) — `tutoBambuX1Step1-7`, `tutoBambuP1Step1-8`, `tutoBambuA1Step1-8`, `tutoFlashforgeAd5xStep1-3`, `tutoElegooStep1`
- Removed: `tutoBambuH2P2Step1-7` (×7 keys, 9 locales) — H2/P2 series uses the X1 step content unchanged after merging X1/X1E/H2/P2 into a single tutorial (text was identical, images come from the X1 set)
