# Tiger Studio Manager — Feature Catalogue

Tiger Studio Manager is the Electron desktop companion to the TigerTag ecosystem: a filament-inventory manager built around RFID/NFC-tagged spools ("TigerTag" chips), a fully-digital "TigerCloud" tier, live 3D-printer integration across six brands, physical storage/rack management, a Firebase-backed social layer (friends, shareable wishlists, public profiles), and companion hardware (TD1S color sensor, TigerScale, TigerPOD dual-reader stand). This document catalogues every **shipped** feature, grouped by domain, current as of **v2.11.2**. Per-version release detail lives in `CHANGELOG.md`; forward-looking / in-progress work lives in `ROADMAP.md`.

---

## Inventory & spools

- Real-time Firestore sync of the inventory — table view + grid view, column sort, full-text search (v1.0+).
- Spool detail side panel — color block, print parameters, weight slider with debounced auto-save, container, links, raw JSON view (v1.0+).
  - **Balance** weight-input mode for kitchen-scale users (type gross weight, container subtracted automatically) (v1.8.17).
  - Editable free-text spool note (28-byte UTF-8 cap with a usage bar) (v1.8.3).
- ACR122U USB NFC reader — auto-opens the matching spool's detail panel on scan (v1.0+).
- Manufacturing date decoding (v1.0+) and twin-tag (dual-chip) detection with auto-link by timestamp (v1.0+/v1.4.x), plus a manual repair tool for orphaned twins filtered by brand/material/type/RGB (v1.4.8).
- TD1S color/TD sensor integration in the detail panel — scan color and TD separately or together (v1.3+; unified color+TD modal v1.8.0).
- Spool toolbox (detail panel) — scan color, scan TD (with a hold-to-confirm "Clear TD" split button, v1.4.13), link/unlink twin, remove from rack, delete (v1.4.8).
  - Every toolbox action gained an ⓘ hover explainer (v1.10.29).
  - **Duplicate ×N** — mint 1–50 copies of a TigerCloud/TigerTag spool in one write, hold-to-confirm (v1.8.3).
  - **Erase / Recycle to NFC / Restore TigerTag+** — reinitialise, wipe, or restore a physical chip's backed-up signature (v1.10.29).
  - **Guided chip update** — step-by-step panel with per-reader UID-match check before the write proceeds (v2.0.0).
- Add Product side panel — Brand/Material picker bottom-sheets, mobile-style HSV color picker (preset grid + custom SV rectangle + hue slider), advanced Type/Diameter/Aspect/temps/TD/unit fields, integer clamping, live RFID-data debug preview (v1.4.11 → v1.4.12; reorganised with always-visible core fields + app-styled dropdowns v2.5.0).
  - Multi-colour picker — Mono / Dual / Tri / Rainbow selector with a live-updating color circle (v1.4.14).
  - Custom product image via external URL for DIY & TigerCloud spools (TigerTag+ stays catalogue-locked) (v1.4.13).
  - TD1S button in the header auto-fills color + TD on scan (v1.4.13).
- **TigerCloud** — fully-digital spools with no physical chip (`CLOUD_<id>`), atomically promoted to a real hex UID (with all fields, twin pointers, rack assignment and friend ACLs carried over) the moment a chip is programmed; dedicated purple tier badge and stat tile (v1.4.12; stat tile v1.4.13).
- **Chip history & backup** — private list of every physical chip ever programmed, with the repairable TigerTag+ signature backed up on first read; a green "Backed up" shield badge marks protected spools (v1.10.28, badge v1.10.29). Product ID shown as a clickable catalogue link (v1.10.29).
- Grouping of identical spools — table view first (v1.10.15), then grid view + a dedicated group side panel with a live speedometer gauge of combined remaining weight (v1.10.18); grouping includes TigerCloud spools (v1.10.16) and distinguishes different colours/aspects within the same brand+material (v1.10.31).
- Multi-select mode (grid + table) — tick spools or printers and delete together with a hold-to-confirm, header master checkbox to select all visible (v2.0.0; header checkbox v2.1.0).
  - Bulk **Tags** editing across a selection (v2.1.0), bulk **Price** editing (v2.2.0, spools v2.2.0 too), bulk ★ Favorite / ❤ Love toggles (v2.3.0), multi-select inside a friend's inventory scoped to ★/❤ only (v2.3.0).
- **Tags** — free-form spool labels with autocomplete, an "All tags" filter, and search-bar integration; twin-mirrored (v1.10.28; type-to-filter/create-on-the-fly rework v1.10.31).
- Product "business card" side card — read-only view of a favorite with no live spool (identity, colours/aspect, weight reference, print params, details, docs) (v2.4.0).
- Aspect filter (matches Aspect 1 or Aspect 2) in the search toolbar (v2.4.0).
- Click-to-copy SKU / EAN (auto ref and editable ref) with a "Copied!" flash (v2.4.0).
- Sortable **Price** column in the inventory table (account currency + HT/TTC mode) (v2.5.0), plus a **Stock Value** header stat tile (v2.5.0) that updates live on price/tax changes.
- Inline **"Add price"** action in the inventory table for unpriced filaments (single rows and group headers) (v2.6.0).
- Header KPI stats count-animate (odometer-style roll on open and on change) (v2.7.0).
- Terminology: every user-facing "RFID" renamed to "NFC" across the UI and all 9 locales (internal identifiers untouched) (v2.5.0).

## Cloud & real-time sync / data layer

- `tigertagDbService` — single IPC-served source of truth for all TigerTag reference JSON (brands, materials, aspects, types, diameters, units, versions), with an API → GitHub-mirror → local-cache fallback chain and atomic validated writes (v1.7.0).
- Hard delete + anti-resurrection (`cloudSync` flag) — spools are hard-deleted from Firestore instead of tombstoned; legacy tombstones auto-purged on first snapshot (v1.7.4).
- `updatedAt` field standardised (`FieldValue.serverTimestamp()`) across writes, ISO with the printer data model (v1.7.4).
- Container auto-assignment — every spool without a `container_id` is matched to one by brand on the next live snapshot (v1.7.4).
- Legacy data migrations: decimal → hex-uppercase UID migration with consent + progress UI (v1.4.5), flat rack fields → nested `rack{}` object migration (v1.4.7).
- Instant cold start — IndexedDB snapshot cache plus an on-disk product-thumbnail cache served over a local HTTP server, so inventory/racks/printers render before the network round-trip completes and the app stays usable offline (v1.8.15; app-wide launch-cache + splash screen v1.8.24).
- Persistent rotating log file via `electron-log` for post-mortem diagnostics (v1.7.5).
- Diagnostic report system — last 50 captured errors + environment info as a copyable Markdown blob (Settings → Debug) (v1.4.1).
- Right-click context menu (native Cut/Copy/Paste/Select-all) on editable fields (v2.7.0).
- Account stock summary (value, weight, currency, spool count) mirrored server-side to `users/{uid}.stock` and `telemetry/studio` (v2.7.0).
- Anonymous usage telemetry — session/version/OS/locale counters, geographic (country/timezone) dimension, spool-lifecycle counts, TigerPOD ownership + reader-count signal (v1.8.4 → v1.8.26 → v2.9.0), no personal data or IP geolocation.

## Accounts, auth & multi-profile

- Firebase Authentication with independent per-account `firebase.app(uid)` instances — true multi-account switching (v1.0+/v1.4+).
- Login / create-account / forgot-password modal; Google sign-in (popup, then loopback OAuth RFC 8252 + PKCE for native Touch ID / passkey support) (v1.4+; loopback flow v1.4.5; broken-fallback fix v1.7.7).
- Email verification required for email/password sign-up, with an inline resend action (Google sign-in exempt) (v2.1.0).
- Profiles modal — manage multiple connected accounts, switch, disconnect (v1.4+; Discord-style account menu with hover switcher redesign v1.10.24).
- Color avatars (13 presets + custom hex) and pseudo (`displayName`) setup flow, with a first-launch prompt when missing.
- Custom profile-picture upload — crop modal with zoom/rotate/pan, auto JPEG/PNG format selection preserving transparency (v1.8.22).
- Migration from legacy API-key accounts to Firebase (auto-wipe on first launch).
- Debug mode toggle (admin-only, `users/{uid}.roles == "admin"`) exposing a Firestore explorer + API inspector panel.
- VAT country picker + HT/TTC price-display preference, driving currency/tax-rate display without rewriting stored prices (v2.1.0).
- Social-profile links — paste any profile URL, auto-detected brand icon (X, Instagram, YouTube, TikTok, Facebook, LinkedIn, Twitch, Discord, GitHub, WhatsApp, or a globe fallback), shown on your own and a friend's banner (v2.8.0).

## Friends & social profiles

- Discovery code (`XXX-XXX`) for O(1) friend lookup, atomically claimed (v1.4+).
- 40-char hex access token (`privateKey`) authorising friend reads via Firestore rules (v1.4+).
- Bidirectional friendship — accepting a request batch-writes both sides' `friends/{uid}` docs (v1.4+).
- Friend inventory view inline in the main UI — read-only banner, one-click swap back to your own account (v1.4+).
- Sidebar friends quick-list with per-friend avatar colours and click-to-open (v1.4+; scrollable Discord-style list v1.8.24).
- Friend request modal — accept / refuse / block, with a blacklist (v1.4+).
- `isPublic` inventory flag for frictionless friend discovery (v1.4+).
- Notification center (bell) surfacing friend requests as actionable items (Accept/Decline/Block) plus "X accepted your request" updates (v1.10.12).
- Invite QR code on the "My code" Friends-panel card (v1.10.24; locally-generated offline v2.9.0, customisable colour presets v2.9.0, downloadable PNG v2.9.0).
- Shareable friend deep link (`.../friend/<code>`) — opens the app with the Add-friend search pre-filled; the user still confirms by pressing "Send request" (v1.10.14; routed through `tigersystem.io` v2.9.0).
- Drag-and-drop friend reordering, synced via `sortRank` (v2.7.0).
- Public favorites shared between friends — first via a dedicated `productShares` projection (v2.3.0), later superseded by reading the friend's `products` collection directly for always-live data (v2.4.0).
- Favorite provenance — "Added from …" identity block with a live-resolved friend avatar/name that survives un-friending (v2.2.0).
- Friend-view relationship badges — green **Public** / **Friend** pill, **Share** badge, and live friend/follower counts, mirrored on your own banner (v2.8.0).
- Public accounts auto-accept incoming friend requests server-side via a Cloud Function, even while the owner is offline (v2.7.0).

## Lists / Wishlists

- **Lists** view — named wishlists with an optional occasion, a free-text message to viewers, and a privacy level; items reference product identities so buy links/prices/images stay live; rows/grid layout toggle; friends see shared lists live in friend-view (v2.7.0).
- List privacy — private / friends / public, with a status badge and Firestore rule enforcement (v2.7.0).
- Lists sidebar grouped by visibility type, with per-type colour badges (Private / Friends / Public) (v2.10.0).
- Drag-and-drop list organisation — reorder your lists and drag a list between the Private / Friends / Public groups to change its type (v2.10.0).
- "Details" recap card in the open-list view — type, item count, event, and message at a glance (v2.10.0).
- Public wishlist web link — public lists mirror to a world-readable `publicLists/{token}` snapshot at `tigersystem.io/wishlist/<token>`, with a share card (QR + copy-link + social-share buttons for Facebook/X/LinkedIn/WhatsApp/Email) (v2.7.0).
- Per-item quantities (Amazon-cart style) — dropdown 1–9 + "10+" free-entry, persisted per item, factored into totals and the public snapshot (v2.9.0).
- Payment-summary card (subtotal, estimated VAT, total) in the Lists view (v2.9.0).
- Downloadable high-res QR PNG for the public-list share card, saved via a native Save dialog (v2.9.0).
- Add a friend's material to one of your own lists from friend-view — the "Add to a list" control (product card, grouped-spools side-card, spool detail panel) imports the friend's product into your account (picture, price, buy link, provenance) then adds it to your list (v2.11.0).

## Reorder & "To order" cart

- Products/Favorites/Reorder system — per-product identity records independent of live spool stock (v2.1.0).
- **"To order"** cart — Shopify draft-order-style layout with editable quantities and a sticky HT/TTC-aware Payment card (v2.1.0), evolved into a two-zone active-cart / "saved for later" shelf with drag-and-drop between zones (v2.5.0).
- Auto-grouping of the active cart by purchase source (buy-link host), with sticky per-group headers and drag reorder constrained within a group (v2.9.0), reworked into one bordered card per source with its own HT/TTC subtotal footer, drag-reorderable source cards (persisted), and an editable personal note per source (v2.11.0).
- "Stop tracking" press-and-hold action on any cart / saved-shelf line — resets the product's minimum stock to 0, clearing its whole reorder state and removing it from the "To order" view (v2.11.0).
- Amazon-style quantity dropdown selector in the cart (replacing the plain number input) (v2.9.0).
- Buy buttons show the destination shop's host name instead of a generic "Buy" (v2.7.0), with subdomains collapsed to the registrable domain (v2.7.1).
- Live cart badge on the "To order" view button showing the current below-minimum item count (v2.6.0).
- Low-stock alerts — local notification the moment a product's live count drops below its minimum (v2.1.0), upgraded to persistent, cross-device-synced Firestore events with re-arm-on-restock and a 40-entry cap (v2.6.0).

## Favorites & product identities

- Per-user `products` collection — one record per product identity (buy link, tax-free price, minimum stock, note, tags, SKU/EAN, ❤/★ flags, display snapshot, sanitised `cloudSeed`) shared by every matching spool and surviving spool deletion (v2.1.0).
- Product-info side card — buy link, price, min stock, note, tags, SKU/EAN, ❤/★, and a "Create a TigerTag Cloud" action, fully auto-saving (v2.1.0).
  - Info (ⓘ) button on a product opens its reorder panel (price / buy-link / min-stock) alongside the product card (v2.10.0).
- Favorites view — Grid, Table and "To order" modes, sortable table (v2.1.0; sortable v2.2.0).
- Grouped-spools side-card exposes the product's flag toggles (add-to-cart ❤, favourite ★, add-to-a-list ＋) as one icon-only row, in own and friend-view (v2.11.0).
- Interest hierarchy — ❤ Love ⊆ ★ Favorite ⊆ tracked-for-reorder, coupled automatically on write (v2.1.0).
- ❤ flag rebranded from "Love" to an "Add to cart" action with a shopping-cart glyph, forcing a minimum stock ≥1 (v2.5.0 forced-min behaviour; icon/label rebrand v2.9.0).

## Notifications

- Notification center (bell) with unread badge, gathering friend requests and app/community updates (v1.10.12).
- Notification sounds — a chime for genuinely new arrivals only (friend request, acceptance, firmware update), never for history replay (v1.10.29).
- Community nudge system — one-time invites to Discord, GitHub star, and MakerWorld 3D files (v1.10.27), plus a "grab some goodies" Shop button nudge (v1.10.31).
- "Buy me a coffee" support nudges at four entry points using the official brand assets (v2.5.0).
- Persistent, cross-device notification feed — Firestore-backed events (starting with low-stock), 40-entry cap, "Mark all read", no delete (v2.6.0).
- App-update notice promoted to a cloud event (persists, syncs across devices, one-click Restart on the downloading device) (v2.7.0).

## QR codes & sharing

- Invite QR code for the friend discovery code (v1.10.24).
- Local, fully offline QR generation (vendored `qrcode-generator`, no third-party network call) for every shareable QR in the app (v2.9.0).
- Customisable QR colour presets, stored per device (v2.9.0).
- Downloadable high-resolution QR PNG via a native Save dialog (v2.9.0).
- Social-share intents (Facebook/X/LinkedIn/WhatsApp/Email) for public wishlist and friend-invite links (v2.7.0).

## Storage / Racks

- Rack create/edit modal with built-in presets, name, grid and total-slots label (v1.4+).
- Drag-and-drop between slots, slots ↔ unranked panel, rack-head reordering (v1.4+; "make room" slide animation everywhere v2.7.0).
- Skyline-packing masonry layout, responsive to window resize (v1.4.3).
- Slot locking (right-click) with distinct empty-slot vs filled-slot states, and Auto-fill / Auto-store / Auto-unstorage automation (merged into one "Auto-organize" toggle, per-account and cross-device, v1.10.21).
- Rich hover tooltip on filled slots — colour swatch, weight bar, brand, coordinates, and (when available) the material's product photo (v1.4.3; product photo v1.8.10).
- "Spools not stored" permanent shelf panel — always-visible drop target, contextual "+ Add Rack" CTA when capacity is short (v1.4.8; permanent-shelf redesign v1.10.20; contextual CTA v1.8.11).
- Drop-to-void unassign with a cascade-out animation (v1.4.8).
- Press-and-hold (1.2 s) confirmation for destructive rack operations (Clear all / Delete), which also respect locked slots (v1.4.3; lock protection v1.8.6).
- Two rack view modes — colour-fill (with remaining-weight bar) or a picture gallery of material illustrations (v1.10.31); public friend inventories land directly in picture-mode gallery (v1.10.31).
- Snap/drop sound effects when placing or removing a spool (v1.10.31).

## 3D printer integration

Live integrations across six brands, each with real-time temperatures, per-slot filament, active print job data, and (where hardware supports it) a camera feed and machine controls:

- **Bambu Lab** — MQTTS 8883 (TLS), LAN mode; job/temp/AMS cards, camera (JPEG-TCP + RTSP by model), full machine controls (jog/home/light/fans/speed/heated chamber where supported), print-plate thumbnails via FTPS+3mf extraction, H2-series dual-nozzle display (v1.6.0; full controls v1.10.7; thumbnails v2.1.0).
- **Creality** — WebSocket 9999 with heartbeat; job/temp cards, CFS colour-box grid, WebRTC camera, full machine controls (jog/home/temps/fans), per-slot CFS load/unload (v1.4.15; controls v1.10.13).
- **Elegoo** — MQTT 1883 + UDP discovery 52700; job/temp/filament (mono + 4-slot Canvas) cards, XY-jog control card, fan cards, files/history sheet, filament edit sheet (v1.6.0).
- **FlashForge** — HTTP polling 8898 + MJPEG camera; 5-slot matlStation grid, tool-changer support (Creator 5 Pro), official 24-swatch colour-palette constraint, lifetime-stats info panel (v1.4.11; monitoring & controls v1.10.10).
- **Snapmaker** — Moonraker WebSocket 7125; job card with thumbnail, temperature pills, 4-slot filament grid with inline editor, WebRTC camera, mDNS + port-scan discovery (v1.4.7; discovery v1.4.8).
- **Anycubic** — LAN (MQTTS 9883 TLS) and cloud (cross-platform web login + cloud-MQTT + signed REST), ACE multi-slot filament box, full controls, HTTP-FLV / Agora WebRTC camera, on-printer + USB + cloud file browser with print/delete (v1.9.0; cloud v1.10.0; file management v1.10.11; cloud camera v1.10.8; integration contributed by [@ennisj](https://github.com/ennisj), John Ennis).
- Per-brand model catalogues with thumbnails, brand logos across list/grid/add-picker (v1.10.11).
- Unified "Add a printer" flow — brand picker, model picker, docked options panel, connection tutorials (LAN-only mode / access code / IP walkthroughs, screenshots, all 9 locales) surfaced from both the add flow and printer settings (v1.8.19; flow redesign v1.10.26).
- LAN discovery per brand — mDNS/SSDP/UDP scans plus a persisted, account-synced shared "extra subnets" list and a manual "Add by IP" path across all six brands (v1.4.8 → v1.10.0; unified extra-subnets store v1.8.20).
- Printer side panel — drag-drop reorder, inline field editing, online/offline indicator via HTTP ping (v1.4.7; "last seen" tracking v1.10.11).
- Printer table/grid — live state pills, progress bar + remaining time, a **Preview** column showing the model currently on the bed, and an **"Ends at"** wall-clock column sortable by soonest finish (v1.7.1; Preview + Ends-at v2.0.0).
- Printer tags, with the same autocomplete UX as spool tags, plus a search bar and Brand/State/Tags filters in the Printers view (v2.0.0).
- Printer error alerts surfacing the machine's own message and code (Anycubic first) (v1.10.4).
- Snapmaker Paxx-firmware helper — always-current download link, up-to-date indicator, per-printer update notification (v1.10.29).

## Printer cameras

- Per-brand camera widget architecture (`renderCamBanner` dispatch, brand-specific `widget_camera.js` modules) supporting MJPEG, WebRTC/RTSP and iframe transports (v1.4.7+).
- Camera wall view — all online printer cameras in one grid, with click-to-open sidecard (v1.7.1).
- Detached Camera Wall — standalone window showing every camera simultaneously, zero-copy frame forwarding via `BroadcastChannel` (v1.8.2).
- Camera-wall size controls (½×/1×/2×/fullscreen) and CSS-`order`-based drag reorder that never interrupts a live stream (v1.7.2).
- Shared MJPEG multiplexer (`cam_manager.js`) — one upstream connection serves every consumer (sidecard + cam wall) simultaneously, respecting single-client firmware limits (v1.7.2; FlashForge-specific precursor v1.7.1).
- Creality single shared `RTCPeerConnection` across every surface that shows its camera (v1.8.2).

## Sensors & devices

- **ACR122U NFC reader** (USB, via `nfc-pcsc`) — plug-and-scan auto-open of the matching spool, with hot-plug detection on Windows (v1.0+; hot-plug fix v1.10.28-era).
- **TD1S** color/TD sensor — auto-detect on USB plug, live viewer, unified color+TD scanning modal with multi-slot (1–3 colour) support, edit-pencil swatch UI (v1.3+; unified modal v1.8.0).
- **TigerScale** — WebSocket heartbeat presence (`users/{uid}/scales/{mac}`), live gradient card matching the mobile app: 56 px weight display, send-status badge (`idle → scanning → stable → send → success`), filament mini-panel pushed from firmware, twin-UID 2-reader grid, hold-to-confirm TARE (v1.5.0).
- **TigerPOD** dual-reader stand — dedicated modal with product video/imagery, MakerWorld STL download, dual-chip simultaneous encode ("Dual Link"), auto-opens when a chip action needs a reader that isn't connected (v1.8.0; redesigns v1.8.2, v2.9.0 hero video); ownership + reader-count telemetry signal (`hasPod`, `rfidReadersMax`) (v2.9.0).

## RFID / NFC & tags

- TigerTag chip reading/writing/verification pipeline (NTAG page-aligned reads, per-reader disambiguation) (v1.8.0).
- Cloud-spool → physical-chip guided encode modal — presence-gated, sequential verified burn, all-or-nothing Firestore migration, dual-reader twin support (v1.8.5).
- Guided chip-update panel for re-writing an existing chip with live UID-match feedback (v2.0.0).
- Chip reuse tools — Erase, Recycle to NFC, Restore TigerTag+ from backup (v1.10.29).
- Physical-chip backup — TigerTag+ signature saved on first read, enabling later restore; "Backed up" badge (v1.10.28, badge v1.10.29).
- Product ID surfaced from the chip with a link to the product catalogue page (v1.10.29).
- Terminology unification: all user-facing "RFID" strings renamed to "NFC" (v2.5.0).

## "What's New" & release UX

- **"What's New" modal** — post-update summary window, movable/resizable, browsable version history via a dropdown, reachable anytime from Settings → About (v1.10.16).
- Apple/Bambu-style version-carousel dot picker with a centred sliding pill, replacing the plain dropdown for browsing (v2.9.0; app-styled dropdown for the picker itself also v2.9.0).
- Update-download progress bar with a rough time-left estimate (v1.10.24).
- Update status icon in the header (spinning while downloading, glowing green when ready to install, click-to-install) (v1.4.13).

## Debug / admin

- Debug mode (admin-only via `users/{uid}.roles == "admin"`) unlocking a dedicated Firebase Explorer — breadcrumb navigation, drill-down, raw-JSON view (v1.10.28).
- API tab — last HTTP request/response inspector for `cdn.tigertag.io`.
- RFID Data debug surface in the Add Product panel, gated to debug-enabled accounts (v1.4.12).
- Diagnostic report generator (last 50 errors + environment) (v1.4.1).

## Distribution, auto-update & installers

- Auto-update via `electron-updater` / GitHub Releases, with a Settings toggle (enable/disable + "Check now") (v1.4.4).
- macOS code signing + notarization (Apple Developer ID + `notarytool`, App Store Connect API Key) in CI (v1.4.2).
- Cross-platform builds — macOS (x64 + arm64, signed), Windows (NSIS, unsigned pending Azure Trusted Signing), Linux (AppImage).
- Dark native window chrome (`nativeTheme.themeSource = 'dark'`) and shadow-less window edges (v1.4.13).
- Launch splash screen shown instantly while the app assembles from cache (v1.8.24).

## Internationalization (i18n)

- **9 locales** shipped and kept in lock-step: English, French, German, Spanish, Italian, Chinese, Portuguese (Brasil), Portuguese (Portugal), Polish.
- Plural inflection (`{one, other}`) applied consistently to every duration key (v1.4.9).
- `npm run i18n:add` — single command that writes a new/updated key across all 9 locale files at once (v1.4.9).
- `npm run i18n:check` + a pre-commit hook blocking any commit that lets the 9 locale files drift apart (v1.4.9).

## Dev tooling

- CSS modularization — the original monolithic `inventory.css` split into themed files (`00-base.css` → `70-detail-misc.css`) loaded in numeric order (v1.4.9).
- `renderer/CODEMAP.md` — feature → line-range index for `inventory.js`, kept in sync via `npm run codemap:check` (post-v1.4.9); `CODEMAP-main.md` mirrors it for `main.js`.
- `npm run whatsnew:add` / `whatsnew:check` / `whatsnew:import` — scaffold, validate, and seed-from-changelog tooling for the "What's New" content pipeline (v2.x era).
- `scripts/extract-changelog.mjs` — publishes the hand-authored release note (or a changelog-derived fallback) verbatim to the GitHub Release page as part of the `prepare-release` CI job.

---

Keep this in sync when shipping a feature (source of truth: `CHANGELOG.md`).
