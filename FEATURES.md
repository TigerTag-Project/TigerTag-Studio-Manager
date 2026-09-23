# Tiger Studio Manager — Feature Catalogue

Tiger Studio Manager is the Electron desktop companion to the TigerTag ecosystem: a filament-inventory manager built around RFID/NFC-tagged spools ("TigerTag" chips), a fully-digital "TigerData" tier (and its catalogue-identified "TigerData+" rung), live 3D-printer integration across six brands, physical storage/rack management, a Firebase-backed social layer (friends, shareable wishlists, public profiles), and companion hardware (TD1S color sensor, TigerScale, TigerPOD dual-reader stand). This document catalogues every **shipped** feature, grouped by domain, current as of **v2.29.0**. Per-version release detail lives in `CHANGELOG.md`; forward-looking / in-progress work lives in `ROADMAP.md`.

---

## Inventory & spools

- Real-time Firestore sync of the inventory — table view + grid view, column sort, full-text search (v1.0+).
- **Colour range filter** — a rainbow bar plus a white-to-black bar for neutrals, with a draggable window that dims what falls outside it. Shared by Inventory, Favorites, the order list, the Catalogue and Storage, and it keeps its selection across views (v2.21.0).
- Type-to-filter inside the Brand / Material / Aspect / Type / Tag dropdowns, matching anywhere in the name and ignoring case and accents (v2.21.0).
- One add button, inside the search field, dispatching by view — material sources, printer brands or a new rack (v2.21.0).
- One reset that clears the search, every filter and the colour window at once (v2.21.0).
- A chime when a new spool joins the inventory, however it arrived (v2.21.0).
- Spool detail side panel — color block, print parameters, weight slider with debounced auto-save, container, links, raw JSON view (v1.0+).
  - **Balance** weight-input mode for kitchen-scale users (type gross weight, container subtracted automatically) (v1.8.17).
  - Editable free-text spool note (28-byte UTF-8 cap with a usage bar) (v1.8.3).
- ACR122U USB NFC reader — auto-opens the matching spool's detail panel on scan (v1.0+).
- Manufacturing date decoding (v1.0+) and twin-tag (dual-chip) detection with auto-link by timestamp (v1.0+/v1.4.x), plus a manual repair tool for orphaned twins filtered by brand/material/type/RGB (v1.4.8).
- TD1S color/TD sensor integration in the detail panel — scan color and TD separately or together (v1.3+; unified color+TD modal v1.8.0).
- Spool toolbox (detail panel) — scan color, scan TD (with a hold-to-confirm "Clear TD" split button, v1.4.13), link/unlink twin, remove from rack, delete (v1.4.8).
  - Every toolbox action gained an ⓘ hover explainer (v1.10.29).
  - **Duplicate ×N** — mint 1–50 copies of a TigerData/TigerTag spool in one write, hold-to-confirm (v1.8.3; quantity dropdown with a 10+ free field v2.27.2).
  - **Erase / Recycle to NFC / Restore TigerTag+** — reinitialise, wipe, or restore a physical chip's backed-up signature (v1.10.29; erase and recycle through the guided chip window, which shows whether the right chips are on the readers and holds the action until they are, v2.27.2).
  - **Guided chip update** — step-by-step panel with per-reader UID-match check before the write proceeds (v2.0.0).
- **Add-material source picker** — `+ Material` opens a side card offering the two sources rather than one of them: *From Catalogue* (jumps to the catalogue grid, yields a **TigerData+**) or *Manually* (the Add Product form, yields a **TigerData**), each row showing the tier pair its path leads to so the outcome — chipless now, and once burned to a chip — is named before you commit. Replaces the separate "From Catalogue" toolbar button, so adding a material has one entry point (v2.19.0).
- Add Product side panel — Brand/Material picker bottom-sheets, mobile-style HSV color picker (preset grid + custom SV rectangle + hue slider), advanced Type/Diameter/Aspect/temps/TD/unit fields, integer clamping, live RFID-data debug preview (v1.4.11 → v1.4.12; reorganised with always-visible core fields + app-styled dropdowns v2.5.0).
  - Multi-colour picker — Mono / Dual / Tri / Rainbow selector with a live-updating color circle (v1.4.14).
  - Custom product image via external URL for DIY & TigerData spools (TigerTag+ stays catalogue-locked) (v1.4.13).
  - TD1S button in the header auto-fills color + TD on scan (v1.4.13).
- Per-account **container-weight calibration** — correct a container's empty weight against your own scale, with a guided "how to measure" step (a Masterspool keeps its cardboard core, other types do not), a catalogue-vs-yours comparison, and a choice of whether the spools already using that container adopt the new value. Stored in `users/{uid}/containerOverrides/{containerId}` and applied over the bundled catalogue at read time — the shipped JSON is never modified (v2.13.0).
- **TigerData** — fully-digital spools with no physical chip (`CLOUD_<id>`), atomically promoted to a real hex UID (with all fields, twin pointers, rack assignment and friend ACLs carried over) the moment a chip is programmed; dedicated purple tier badge and stat tile (v1.4.12; stat tile v1.4.13).
- **TigerData+** — the catalogue-identified rung of the digital tier: a chipless spool carrying a real `id_product`, so it knows the exact brand, colour, material, temperatures, diameter, SKU and EAN of a product in the official catalogue instead of only what was typed into it. Derived from the data, never stored; explicitly not a TigerTag+ (no chip, no UID) and given its own badge and stat tile so the two are never confused (v2.15.0).
- **Catalogue** — a dedicated view (grid + table) over the whole official TigerTag+ product catalogue, with Type · Brand · Series · Material filters and sorting at parity with the public catalogue page. The catalogue is imported once into a local cache and searched entirely in memory (self-refreshing after 24 h, plus a *Re-sync the catalogue* button in Settings → Tools); selecting a product previews it in the standard product card, and one `+` turns it into a TigerData+. Every product type is browsable, filament is creatable (v2.15.0). The catalogue also **ships inside the app** (`assets/db/tigertag/id_catalog.json`, refreshed by `db_update.py`), so it works on first launch, offline, before any sync has run (v2.16.0). The view was labelled "Search" until **v2.27.0**, when it took the name of the thing it shows. The index reaches the whole record — series and colour name on their own, both aspects, product type, SKU and EAN — and weight is matched as whole gram tokens, so "1 kg", "1000" and "500 g" find the actual weight rather than codes containing those digits (v2.17.0). A query shaped like a code is matched EXACTLY first, so a barcode gun lands on one product instead of every product sharing that prefix — the same rule now applies in the inventory search, which also names SKU and barcode in its placeholder (v2.27.0).
- **Barcode / SKU lookup** — a query that is a single code (6+ characters carrying a digit) matching a product's `barcode`, `sku` or `id` exactly returns only that product, so a barcode gun firing digits + Enter lands on one result instead of a list of coincidental cousins; codes live in an index field kept separate from the words, and an unmatched code falls through to the ordinary search so a typo still finds something (v2.17.0).
- **Self-maintaining catalogue data** — spools tied to a catalogue product reconcile themselves as the catalogue evolves: a `catalogSyncedAt` stamp is compared against the product's own `updated_at` after each sync and only the ones that actually moved are refreshed, in the background and never in a friend's inventory. A TigerData+ updates in complete silence; a TigerTag+ is asked for a chip re-write **only** when the change touched a field the chip physically carries (`TTAG_ON_CHIP_FIELDS`, kept in lockstep with `docs/TTAG-FIELDS.md` by `npm run docs:check`) (v2.16.0).
- **Chip history & backup** — private list of every physical chip ever programmed, with the repairable TigerTag+ signature backed up on first read; a green "Backed up" shield badge marks protected spools (v1.10.28, badge v1.10.29). Product ID shown as a clickable catalogue link (v1.10.29).
- Grouping of identical spools — table view first (v1.10.15), then grid view + a dedicated group side panel with a live speedometer gauge of combined remaining weight (v1.10.18); grouping includes TigerData spools (v1.10.16) and distinguishes different colours/aspects within the same brand+material (v1.10.31).
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
- **`.ttag` inventory interchange** — export a spool, a selection, or a whole batch to a portable `.ttag` file (keep it, carry it on a USB stick, share it) and import it back anywhere. Works for TigerData, TigerTag and TigerTag+ alike, keeps twins atomic, and imports through a validate → preview table → accept flow with a per-material include picker. Two modes: **Restore** (verbatim, keeps ids/TigerTag+/backups) or **Import** (fresh chipless `TigerData_` spools you own, weight reset to full). Multi-file import via browse, paste-a-link, or drag-and-drop anywhere on the window (v2.14.0). Import enforces the ratified record contract — a material missing any of the 24 chip-payload fields is refused whole (twins all-or-nothing) and counted back to you rather than silently dropped (v2.15.0).

## Cloud & real-time sync / data layer

- `tigertagDbService` — single IPC-served source of truth for all TigerTag reference JSON (brands, materials, aspects, types, diameters, units, versions), with an API → GitHub-mirror → local-cache fallback chain and atomic validated writes (v1.7.0).
- Hard delete + anti-resurrection (`cloudSync` flag) — spools are hard-deleted from Firestore instead of tombstoned; legacy tombstones auto-purged on first snapshot (v1.7.4).
- `updatedAt` field standardised (`FieldValue.serverTimestamp()`) across writes, ISO with the printer data model (v1.7.4).
- Container auto-assignment — every spool without a `container_id` is matched to one by brand on the next live snapshot (v1.7.4).
- **Refill** container for a spool kept with no masterspool at all — a zero-weight generic entry pinned to the top of the picker, so the weight shown is the filament's own (v2.23.1).
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
- "My profile" editor as a left side card — pinned header + identity hero + grouped one-row-per-setting sections, sign-out pinned in a footer; social links listed with their detected platform and a note that they are public (v2.18.0).
- Color avatars (13 presets + custom hex) and pseudo (`displayName`) setup flow, with a first-launch prompt when missing.
- Two-step first-connection onboarding — language, then display name + avatar (generated colour or imported photo). Version-gated on `users/{uid}/apps/studio.onboardingVersion`, so every account runs it once and a bumped constant re-runs everyone (v2.12.0).
- Per-application state doc `users/{uid}/apps/{appId}` — owner-only, for state read per-user by a single ecosystem app (v2.12.0).
- Random HSL avatar colour generated once per new account, with auto-contrasted initials text, and a shared initials contract mirrored in the mobile app and Tiger Hub (v2.12.0).
- Custom profile-picture upload — crop modal with zoom/rotate/pan, auto JPEG/PNG format selection preserving transparency (v1.8.22; wheel/pinch zoom, free rotation, keyboard shortcuts v2.12.0).
- Migration from legacy API-key accounts to Firebase (auto-wipe on first launch).
- Debug mode toggle (admin-only, `users/{uid}.roles == "admin"`) exposing a Firestore explorer + API inspector panel.
- VAT country picker + HT/TTC price-display preference, driving currency/tax-rate display without rewriting stored prices (v2.1.0; **Canada with a per-province rate** — all 13 provinces and territories, combined GST/HST/PST/QST, `CA$` v2.27.0; **custom rate** — enter your own rate, ISO 4217 currency code and symbol for a country the list does not carry, a reduced rate or an exemption, v2.27.0).
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
- **One card per tier, one deck per product** — the card key is the product plus the tier, so a TigerTag spool and a chipless TigerData one of the same filament get their own card and their own unambiguous badge (they are not interchangeable: only a chipped spool can be written, weighed on a TigerScale or proven), while the deck behind either card is keyed on the product alone and gathers every tier. Product state — buy link, price, minimum stock, ❤/★, note — hangs off the product key, so it is shared across tiers and "in stock" counts them together (v2.17.0).
- Product-info side card — buy link, price, min stock, note, tags, SKU/EAN, ❤/★, and a "+ Material" action minting a chipless TigerData spool of this exact filament, fully auto-saving (v2.1.0; action renamed v2.2.0).
  - Info (ⓘ) button on a product opens its reorder panel (price / buy-link / min-stock) alongside the product card (v2.10.0; present and left-aligned on all three product side-cards, and toggling, v2.12.0).
  - The product card, the spool detail and the grouped-spools deck expose the SAME action row — ⓘ, "+ Material", shopping, add-to-a-list, ❤, ★ — in the same order, whichever card you opened (v2.15.0).
  - Shopping button — one control, two jobs: shop-green and opening the store when the product has a buy link, plain and landing on the buy-link field when it has none (v2.15.0).
- Product web-link attachments — datasheets, tutorials or videos attached to a product identity and shared by every spool of it, tier-capped free 1 / plus 2 / premium 5 and enforced server-side (v2.12.0).
- Favorites view — Grid, Table and "To order" modes, sortable table (v2.1.0; sortable v2.2.0).
- Grouped-spools side-card exposes the product's flag toggles (add-to-cart ❤, favourite ★, add-to-a-list ＋) as one icon-only row, in own and friend-view (v2.11.0).
- Grouped-spools deck stamps each member with when it was added ("just now", "3 days ago", "2 months ago", exact date on hover) — the only thing distinguishing otherwise identical spools (v2.15.0).
- Interest hierarchy — ❤ Love ⊆ ★ Favorite ⊆ tracked-for-reorder, coupled automatically on write (v2.1.0).
- ❤ flag rebranded from "Love" to an "Add to cart" action with a shopping-cart glyph, forcing a minimum stock ≥1 (v2.5.0 forced-min behaviour; icon/label rebrand v2.9.0).

## Notifications

- Notification center (bell) with unread badge, gathering friend requests and app/community updates (v1.10.12).
- Notification sounds — a chime for genuinely new arrivals only (friend request, acceptance, firmware update), never for history replay (v1.10.29).
- Community nudge system — one-time invites to Discord, GitHub star, and MakerWorld 3D files (v1.10.27), plus a "grab some goodies" Shop button nudge (v1.10.31) and a **Wiki** button (v2.27.0, contributed). One shared table drives the badge, the notification and the per-account "seen" flag for every entry.
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

- Rack create/edit as a right side-card in three numbered steps — identity, layout (− / + steppers), and a live preview grid that shows an existing rack's real contents (v1.4+ as a modal with presets; side-card + presets removed + preview v2.12.0).
- Optional rack subtitle — a second descriptive line under the rack name (v2.12.0).
- Rack grid reads top-down: A1 is the top-left slot and new levels append at the bottom (v2.12.0).
- Drag-and-drop between slots, slots ↔ unranked panel, rack-head reordering (v1.4+; "make room" slide animation everywhere v2.7.0).
- Skyline-packing masonry layout, responsive to window resize (v1.4.3); superseded by a hand-arranged **storage plan** where each rack keeps the position and stacking layer you gave it, with edge magnetism, snap guides and overlap allowed but outlined — packing now only runs on "Tidy up" (v2.21.0).
- **Rack depth** — up to four rows of spools one behind the other, drawn in perspective, with an account-wide setting for how far apart the rows are spaced (v2.21.0, four deep v2.27.0).
- Slot locking (right-click) with distinct empty-slot vs filled-slot states, and Auto-fill / Auto-store / Auto-unstorage automation (merged into one "Auto-organize" toggle, per-account and cross-device, v1.10.21).
- Rich hover tooltip on filled slots — colour swatch, weight bar, brand, coordinates, and (when available) the material's product photo (v1.4.3; product photo v1.8.10).
- "Spools not stored" permanent shelf panel — always-visible drop target, contextual "+ Add Rack" CTA when capacity is short (v1.4.8; permanent-shelf redesign v1.10.20; contextual CTA v1.8.11).
- Drop-to-void unassign with a cascade-out animation (v1.4.8).
- Press-and-hold (1.2 s) confirmation for destructive rack operations (Clear all / Delete), which also respect locked slots (v1.4.3; lock protection v1.8.6).
- Two rack view modes — colour-fill (with remaining-weight bar) or a picture gallery of material illustrations (v1.10.31); public friend inventories land directly in picture-mode gallery (v1.10.31).
- Snap/drop sound effects when placing or removing a spool (v1.10.31); a tick and a thunk when a rack is picked up and set down on the plan (v2.21.0).
- "Spools not stored" lists the most recently added spool first (v2.21.0).

## 3D printer integration

Live integrations across six brands, each with real-time temperatures, per-slot filament, active print job data, and (where hardware supports it) a camera feed and machine controls:

- **Bambu Lab** — LAN (MQTTS 8883 TLS) **and cloud**: sign in with a Bambu account and every printer on it is offered with its picture, ticked one or several at a time, arriving with the LAN access code the cloud hands over; cloud machines report from anywhere and learn their own address from telemetry, so their camera starts unattended on the same network (cloud v2.26.0; **China-mainland accounts, phone-number sign-in by SMS** v2.29.0). Job/temp/AMS cards, camera (JPEG-TCP + RTSP by model), full machine controls over LAN (jog/home/light/fans/speed/heated chamber where supported), print-plate thumbnails via FTPS+3mf extraction, H2-series dual-nozzle display (v1.6.0; full controls v1.10.7; thumbnails v2.1.0). A CLOUD connection is read-only — the machine accepts no command but its light, so only that one is offered (v2.27.3).
- **Creality** — WebSocket 9999 with heartbeat; job/temp cards, CFS colour-box grid, WebRTC camera, full machine controls (jog/home/temps/fans), per-slot CFS load/unload (v1.4.15; controls v1.10.13).
- **Elegoo** — MQTT 1883 + UDP discovery 52700; job/temp/filament (mono + 4-slot Canvas) cards, XY-jog control card, fan cards, files/history sheet, filament edit sheet (v1.6.0).
- **FlashForge** — HTTP polling 8898 + MJPEG camera; 5-slot matlStation grid, tool-changer support (Creator 5 Pro), official 24-swatch colour-palette constraint, lifetime-stats info panel (v1.4.11; monitoring & controls v1.10.10).
- **Snapmaker** — Moonraker WebSocket 7125; job card with thumbnail, temperature pills, 4-slot filament grid with inline editor, WebRTC camera, mDNS + port-scan discovery (v1.4.7; discovery v1.4.8).
- **Anycubic** — LAN (MQTTS 9883 TLS) and cloud (cross-platform web login + cloud-MQTT + signed REST), ACE multi-slot filament box, full controls, HTTP-FLV / Agora WebRTC camera, on-printer + USB + cloud file browser with print/delete (v1.9.0; cloud v1.10.0; file management v1.10.11; cloud camera v1.10.8; integration contributed by [@ennisj](https://github.com/ennisj), John Ennis).
- Per-brand model catalogues with thumbnails, brand logos across list/grid/add-picker (v1.10.11).
- Unified "Add a printer" flow — brand picker, model picker, docked options panel, connection tutorials (LAN-only mode / access code / IP walkthroughs, screenshots, all 9 locales) surfaced from both the add flow and printer settings (v1.8.19; flow redesign v1.10.26; **Bambu Lab A2L and X2D** recognised on discovery and given their walkthroughs v2.27.0).
- LAN discovery per brand — mDNS/SSDP/UDP scans plus a persisted, account-synced shared "extra subnets" list and a manual "Add by IP" path across all six brands (v1.4.8 → v1.10.0; unified extra-subnets store v1.8.20; **tick one or several scan results and add them in one go**, each machine's own code asked on its card, v2.29.0).
- Printer side panel — drag-drop reorder, inline field editing, online/offline indicator via HTTP ping (v1.4.7; "last seen" tracking v1.10.11).
- Printer table/grid — live state pills, progress bar + remaining time, a **Preview** column showing the model currently on the bed, and an **"Ends at"** wall-clock column sortable by soonest finish (v1.7.1; Preview + Ends-at v2.0.0).
- Printer tags, with the same autocomplete UX as spool tags, plus a search bar and Brand/State/Tags filters in the Printers view (v2.0.0).
- Printer error alerts surfacing the machine's own message and code (Anycubic first) (v1.10.4).
- Snapmaker Paxx-firmware helper — always-current download link, up-to-date indicator, per-printer update notification (v1.10.29).
- **Printer board** — the Printers view is a hand-arranged plan like Storage: machines placed on a permanent grid with magnetism and guides, wheel zoom from 30 %, middle-drag panning, position saved per account. Replaces the Connected/Offline partition, so a machine never changes place when its link drops (v2.22.0).
- **Filament storage as units on the board** — one named block per physical unit (Ext., AMS 1, AMS 2, CFS, ACE, holder pair), shown from the record at startup and dimmed until the link comes up, kept grouped beside the machine or split into individually placeable objects. Slots are drawn at a rack slot's exact size and scale, with four states (unknown, assigned-not-loaded, colour-only, loaded) and hover naming bay, brand and variant (v2.22.0).
- **Units stored on the machine** — a `units` map on the device document, one entry per physical unit carrying its shape, user-renamable label, a position on each board, and its slots (user assignments plus the machine's last report, stamped with `seenAt`). A unit that stops being reported is marked absent rather than deleted (v2.22.0).
- **Temperature widget on the board** — the machine's own temperature card, placed like any other object, staying visible and dimmed when the printer is silent (v2.22.0).
- **Permanent card clusters** — select several cards, right-click and group them so moving one carries the whole set at its existing offsets; the binding lives on the members and is released where they stand (v2.22.0).
- **Per-machine widget switches** in the card's ⋮, each widget appearing in the first free place down its own machine's column (v2.22.0).
- **Rubber-band selection and group moves on both boards**, plus a move handle on every card that is the only grab point outside Arrange mode (v2.22.0).
- **Print widget** on the printer board — preview, file, percentage and bar, state, remaining time, finish clock and layer count, from the same normalised job the table and the card read (v2.24.0).
- **Camera widget and camera on the machine card** — a play key over the printer's photo swaps it for the live feed; off by default and silent until asked, since a camera costs one connection per machine. Board, camera wall and side panel share a single upstream stream (v2.24.0).
- **Pause and stop on a machine's board card while it prints**, stop guarded by hold-to-confirm. Every brand answers one `controlJob(printer, action)`, so a card acts on the machine it belongs to rather than on whichever side panel is open (v2.24.0).

## Printer cameras

- Per-brand camera widget architecture (`renderCamBanner` dispatch, brand-specific `widget_camera.js` modules) supporting MJPEG, WebRTC/RTSP and iframe transports (v1.4.7+).
- Camera view as a free plan — each camera placed by hand on a pan/zoom surface and resized freely by a corner grip, with an Arrange mode carrying the storage plan's mesh, magnetism, alignment guides and sweep-selection; a placed camera keeps its spot and size while its machine is offline (v1.7.1 as a grid, free plan v2.25.0).
- Detached Camera Wall — standalone window showing every camera simultaneously, zero-copy frame forwarding via `BroadcastChannel` (v1.8.2).
- True fullscreen for a single camera via the Fullscreen API — fills the screen rather than the app window, and never recreates the card, so the live stream survives (v1.7.2 as a window-filling card, real fullscreen v2.25.0).
- Shared MJPEG multiplexer (`cam_manager.js`) — one upstream connection serves every consumer (sidecard + cam wall) simultaneously, respecting single-client firmware limits (v1.7.2; FlashForge-specific precursor v1.7.1).
- Creality single shared `RTCPeerConnection` across every surface that shows its camera (v1.8.2).

## Sensors & devices

- **ACR122U NFC reader** (USB, via `nfc-pcsc`) — plug-and-scan auto-open of the matching spool, with hot-plug detection on Windows (v1.0+; hot-plug fix v1.10.28-era).
- **TD1S** color/TD sensor — auto-detect on USB plug, live viewer, unified color+TD scanning modal with multi-slot (1–3 colour) support, edit-pencil swatch UI (v1.3+; unified modal v1.8.0).
- **TigerScale** — WebSocket heartbeat presence (`users/{uid}/scales/{mac}`), live gradient card matching the mobile app: 56 px weight display, send-status badge (`idle → scanning → stable → send → success`), filament mini-panel pushed from firmware, twin-UID 2-reader grid, hold-to-confirm TARE (v1.5.0). Onboarding card for users without a scale, rebuilt around the **V3** machine — lit product shot with a generation badge, six icon-led capability rows, and two destinations: the firmware on GitHub and the printable body on MakerWorld (v2.19.0). Header presence rebuilt as **one glyph per scale** (capped at two), each coloured by its own state — **active** (green) / **standby** (blue) / **offline** (red) / grey when none — with a per-scale hover popover, an **iOS-style battery pill** (charge % + charging bolt) on the glyph, a distinct **standby** state with regime-aware offline detection (90 s active / 11 min screen-off, so a screen-off scale isn't shown disconnected), Wi-Fi coloured by connectivity, and a TARE confirmed only on a real 2xx response (v2.20.0). Live card rebuilt to mirror the scale's own weigh screen — weight and divider on the left, container and filament values plus **the spool's rack location** on the right, on the firmware's own palette — with TARE as a two-line key beneath the screen, inside the card, where it sits on the machine itself (v2.23.1).
- **TigerPOD** dual-reader stand — dedicated modal with product video/imagery, MakerWorld STL download, dual-chip simultaneous encode ("Dual Link"), auto-opens when a chip action needs a reader that isn't connected (v1.8.0; redesigns v1.8.2, v2.9.0 hero video); ownership + reader-count telemetry signal (`hasPod`, `rfidReadersMax`) (v2.9.0); the modal now offers **both Pod models** to print — Standard and Mini (for OpenSpool) — each with its own MakerWorld download (v2.20.0).
- **USB scale (Dymo M-series)** live weighing — plug a Dymo USB HID scale and spool weights fill themselves in: a chip on the reader (POD mode) saves the weight silently, or an open spool card offers an inline confirm; live grams appear in the spool's weight panel with an "asleep — tap to wake" hint when the scale powers down (v2.14.0).

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
- **Portable Windows build** — runs with no installation and keeps accounts, cache and logs beside the .exe rather than in `%APPDATA%`, so nothing is left behind on a shared machine (v2.18.0).
- Dark native window chrome (`nativeTheme.themeSource = 'dark'`) and shadow-less window edges (v1.4.13).
- Launch splash screen shown instantly while the app assembles from cache (v1.8.24).

## Appearance & theming

- **Dark and Light themes**, dark shipped as the default, chosen in *Edit profile → Theme* (v2.18.0).
- Theme carried by `data-theme` on `<html>`, written statically so the right palette is in force at first paint — no flash of the wrong theme on launch (v2.18.0).
- Native window chrome follows the in-app theme over IPC (`nativeTheme.themeSource`), so a light UI never sits inside a black title bar (v2.18.0).
- Choice persisted three ways, each with its own job: `localStorage` for an offline cold start, `users/{uid}.studioTheme` so it follows the account across machines, and `telemetry/studio.theme` as usage data for the Hub's dark/light split (v2.18.0).
- Design-token layer — ~75 semantic tokens plus a dark override, an "ink ladder" whose polarity flips with the theme, and `--on-accent` for the fixed-polarity case (a label on a filled button stays white in both themes) (v2.18.0).
- `npm run theme:check` guards it: fails on any raw colour or any `var(--x)` naming an undeclared variable (v2.18.0).

## Internationalization (i18n)

- **11 locales** shipped and kept in lock-step: English, French, German, Spanish, Italian, Chinese, Portuguese (Brasil), Portuguese (Portugal), Polish, Russian and Dutch (both contributed, v2.28.0).
- Plural inflection (`{one, other}`) applied consistently to every duration key (v1.4.9).
- `npm run i18n:add` — single command that writes a new/updated key across all 11 locale files at once (v1.4.9).
- `npm run i18n:check` + a pre-commit hook blocking any commit that lets the 11 locale files drift apart (v1.4.9).

## Dev tooling

- CSS modularization — the original monolithic `inventory.css` split into themed files (`00-base.css` → `70-detail-misc.css`) loaded in numeric order (v1.4.9).
- `renderer/CODEMAP.md` — feature → line-range index for `inventory.js`, kept in sync via `npm run codemap:check` (post-v1.4.9); `CODEMAP-main.md` mirrors it for `main.js`.
- `npm run whatsnew:add` / `whatsnew:check` / `whatsnew:import` — scaffold, validate, and seed-from-changelog tooling for the "What's New" content pipeline (v2.x era).
- `scripts/extract-changelog.mjs` — publishes the hand-authored release note (or a changelog-derived fallback) verbatim to the GitHub Release page as part of the `prepare-release` CI job.

---

Keep this in sync when shipping a feature (source of truth: `CHANGELOG.md`).
