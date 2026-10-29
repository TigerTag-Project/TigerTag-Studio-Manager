# Tiger Studio Manager — Feature Catalogue

Tiger Studio Manager is the Electron desktop companion to the TigerTag ecosystem: a filament-inventory manager built around RFID/NFC-tagged spools ("TigerTag" chips), a fully-digital "TigerData" tier (and its catalogue-identified "TigerData+" rung), live 3D-printer integration across seven brands plus Klipper and OctoPrint, physical storage/rack management, a Firebase-backed social layer (friends, shareable wishlists, public profiles), and companion hardware (TD1S color sensor, TigerScale, TigerSpool printer reader, TigerPOD dual-reader stand). This document catalogues every **shipped** feature, grouped by domain, current as of **v2.47.0**. Per-version release detail lives in `CHANGELOG.md`; forward-looking / in-progress work lives in `ROADMAP.md`.

---

## Inventory & spools

- **Refill tag** — refill spools (`info1`) wear a green Refill pill on cards, thumbnails, the spool detail and the catalogue product card (v2.37.0).
- Real-time Firestore sync of the inventory — table view + grid view, column sort, full-text search (v1.0+).
- **Remaining filament length** next to a spool's weight ("353 g ≈ 141 m"), from the weight, the density and the diameter — filament only (v2.42.0).
- **Colour range filter** — a rainbow bar plus a white-to-black bar for neutrals, with a draggable window that dims what falls outside it. Shared by Inventory, Favorites, the order list, the Catalogue and Storage, and it keeps its selection across views (v2.21.0). The catalogue picker of "+" has its own mini pair, independent of the views' (v2.47.0).
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
- **Self-maintaining catalogue data** — spools tied to a catalogue product reconcile themselves as the catalogue evolves: a `catalogSyncedAt` stamp is compared against the product's own `updated_at` after each sync and only the ones that actually moved are refreshed, in the background and never in a friend's inventory. A changed product photo marks the spool stale too, read straight from the list's `img_src` (v2.46.2). A TigerData+ updates in complete silence; a TigerTag+ is asked for a chip re-write **only** when the change touched a field the chip physically carries (`TTAG_ON_CHIP_FIELDS`, kept in lockstep with `docs/TTAG-FIELDS.md` by `npm run docs:check`) (v2.16.0).
- **Chip history & backup** — private list of every physical chip ever programmed, with the repairable TigerTag+ signature backed up on first read; a green "Backed up" shield badge marks protected spools (v1.10.28, badge v1.10.29). Product ID shown as a clickable catalogue link (v1.10.29).
- Grouping of identical spools — table view first (v1.10.15), then grid view + a dedicated group side panel with a live speedometer gauge of combined remaining weight (v1.10.18); grouping includes TigerData spools (v1.10.16) and distinguishes different colours/aspects within the same brand+material (v1.10.31).
- **Colour-framed spool photos** — every spool photo (grid, lists, wishlist, catalogue, detail and product cards) sits in a frame of the spool's own colour, replacing the separate colour dots; bicolor spools split on the 135° diagonal (v2.30.0; soft two-tone split and Tricolor colour wheel v2.31.0).
- Grid cards: a name too long for its card scrolls into view on hover (v2.30.0).
- Table thumbnails (inventory, catalogue, lists): hover for a 220 px preview framed in the spool colour (v2.39.0).
- Photos fade out and back in around a scroll instead of blinking, the TigerTag logo crossfading with them (v2.39.0).
- Photos are held back while results scroll or the colour filter moves, and appear already loaded (v2.30.0).
- **Create → chip in one gesture** — after adding a material (manually or from the catalogue) its own card opens; with an NFC reader plugged in the guided burn follows, making a manual entry a TigerTag and a catalogue one a TigerTag+ (v2.31.0).
- Add Product live preview — the colour preview is the exact grid card the spool will have, updated as the form is filled (v2.31.0).
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
- **Right container on a new spool** — the brand's own container is set when there is one; several (or none) → the picker opens narrowed to the candidates with a line saying why; a refill always goes into a MasterSpool, never "Without MasterSpool" (v2.35.0).
- **Favourite MasterSpools** — star the MasterSpools you own: they head the picker, and every refill asks between them and the brand's own (v2.35.0).
- **Container filters** — Cardboard / Plastic / MasterSpool chips in the container picker (v2.35.0).
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
- **Bulk "Add to a list"** — a whole selection of materials, favorites or catalogue products goes into a list in one go (v2.34.0).
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
- **Catalogue multi-select** — tick products in the table or grid (shift-click for a range) and ★ favourite, 🛒 add to order or add to a list the whole selection at once (v2.34.0).
- Sidebar **Downloads** entry (tigersystem.io download page in the user's language) and a redesigned Resources / Support footer with Settings next to the version (v2.36.0).
- **Catalogue product card** — a product opened from the catalogue gets its own card: + Inventory, + Wishlist, + Cart, + Favorite, and a button opening the full product card beside it; spools added from the catalogue keep the full catalogue record (description, documents, slicer profiles, fan, brand site) (v2.35.0).
- **Catalogue "nothing found"** — an empty search offers to create the spool by hand (v2.35.0).
- **Unified product card** — one card instead of two: stock and estimated value, then Info / Documents (with a count) / Notes tabs, product details, stock management and slicer profiles (v2.35.0; merge contributed in PR #39).
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
- Notification centre redesigned — 520 px, tabs with unread counts (Envelopes, Squad, System, Stock), cards grouped by day and tinted by kind that open their destination, every low-stock spool folded into one card, illustrated community nudges (v2.44.0).

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

Live integrations across seven brands, each with real-time temperatures, per-slot filament, active print job data, and (where hardware supports it) a camera feed and machine controls:

- **Bambu Lab** — LAN (MQTTS 8883 TLS) **and cloud**: sign in with a Bambu account and every printer on it is offered with its picture, ticked one or several at a time, arriving with the LAN access code the cloud hands over; cloud machines report from anywhere and learn their own address from telemetry, so their camera starts unattended on the same network (cloud v2.26.0; **China-mainland accounts, phone-number sign-in by SMS** v2.29.0). Job/temp/AMS cards, camera (JPEG-TCP + RTSP by model), full machine controls over LAN (jog/home/light/fans/speed/heated chamber where supported), print-plate thumbnails via FTPS+3mf extraction, H2-series dual-nozzle display (v1.6.0; full controls v1.10.7; thumbnails v2.1.0). A CLOUD connection is read-only — the machine accepts no command but its light, so only that one is offered (v2.27.3).
- **Creality** — WebSocket 9999 with heartbeat; job/temp cards, CFS colour-box grid, WebRTC camera, full machine controls (jog/home/temps/fans), per-slot CFS load/unload (v1.4.15; controls v1.10.13).
  - K1 / K1C / K1 Max camera over mjpg-streamer (:8080), probed first for the K1 series and as the fallback for any model; optional per-printer camera address (v2.36.0).
- **Elegoo** — MQTT 1883 + UDP discovery 52700; job/temp/filament (mono + 4-slot Canvas) cards, XY-jog control card, fan cards, files/history sheet, filament edit sheet (v1.6.0).
- **Elegoo Centauri Carbon 1 (beta)** — the first Centauri Carbon over SDCP v3 (UDP 3000 discovery, WebSocket 3030): live state, progress, layers, temps, fans, MJPEG camera, pause/resume/stop; added by IP alone (v2.35.0).
- **FlashForge** — HTTP polling 8898 + MJPEG camera; 5-slot matlStation grid, tool-changer support (Creator 5 Pro), official 24-swatch colour-palette constraint, lifetime-stats info panel (v1.4.11; monitoring & controls v1.10.10).
- **Snapmaker** — Moonraker WebSocket 7125; job card with thumbnail, temperature pills, 4-slot filament grid with inline editor, WebRTC camera, mDNS + port-scan discovery (v1.4.7; discovery v1.4.8).
- **Anycubic** — LAN (MQTTS 9883 TLS) and cloud (cross-platform web login + cloud-MQTT + signed REST), ACE multi-slot filament box, full controls, HTTP-FLV / Agora WebRTC camera, on-printer + USB + cloud file browser with print/delete (v1.9.0; cloud v1.10.0; file management v1.10.11; cloud camera v1.10.8; integration contributed by [@ennisj](https://github.com/ennisj), John Ennis).
- **Prusa (beta)** — PrusaLink HTTP with Digest auth, every Prusa that runs it (MK4/MK4S, MK3.9, Core One, XL 1/2/5 tools, MINI/MINI+, MK3S+/MK2.5S via Raspberry Pi): live state, temps, progress, preview, fans/speed/flow, pause/resume/stop, MMU 5-slot and XL tool slots filled from the running job, Buddy3D RTSP or PrusaLink camera, network scan + manual IP, re-find after an IP change (v2.35.0).
- **Klipper printers (beta)** — any printer running Klipper + Moonraker (Voron, RatRig, Vzbot, Sovol, Qidi, Elegoo Neptune 4, Creality K1/K2, FLSun, Artillery X4…): live job with thumbnail and layers, pause/resume/stop, temperatures, MJPEG/snapshot camera, jog/home/fan/speed/lights control card, Happy Hare / AFC / extruder filament slots, LAN scan + manual add with optional API key; 161 models with pictures (v2.41.0).
- **Marlin printers through OctoPrint (beta)** — any printer driven by OctoPrint / OctoPi, added without copying a key (OctoPrint *Application Keys*: Tiger Studio asks, you click Allow): live job with thumbnail, pause/resume/stop, temperatures, camera, jog/home/fan/speed, "printer not plugged into OctoPrint" state with a Connect button; 187 models with pictures (v2.41.0).
- **Printer plugins** — Klipper and OctoPrint are self-contained plugins (own connection core, cards, add flow, strings, main-process side), the model for new integrations (`docs/PRINTER-PLUGINS.md`) (v2.41.0).
- **Demo printers** — any of ~400 models across every brand and connector, simulated in the app on the brand's real protocol (Bambu Lab, Creality, Elegoo CC1/CC2, FlashForge, Snapmaker, Anycubic, Prusa, Klipper, OctoPrint): prints on its own, temperatures, filament slots, camera (JPEG, MJPEG, FLV, RTSPS), pause / stop; each demo is its model (AMS or not, two nozzles, five heads…); demo printers can also be served on the computer's network address for devices under test (v2.42.0).
- **Klipper Sensors card** — every `temperature_sensor` / `temperature_fan` / `heater_generic`, settable heaters, and the Mainsail theme logo (v2.42.0, contributed by @storm8488); Klipper and OctoPrint temperatures set with a click, and their add flow lists the models with pictures (v2.42.0).
- **"Find your printer"** — the Add-a-printer card searches every brand and connector at once; a machine reachable several ways (Creality K1: Creality or Klipper) offers the choice, and the picked model and name are filled in (v2.41.0).
- **Bambu Lab Cloud ⇄ LAN** — a switch in a cloud printer's settings, automatic failover to whichever way answers, name / access code / model kept in step with the account, and a notice when the printer is no longer linked to it (v2.41.0).
- Per-brand model catalogues with thumbnails, brand logos across list/grid/add-picker (v1.10.11; searchable model list, Prusa pictures, Elegoo Centauri 2 / 2 Combo / emoji® CC2 Combo v2.41.0).
- Unified "Add a printer" flow — brand picker, model picker, docked options panel, connection tutorials (LAN-only mode / access code / IP walkthroughs, screenshots, all 9 locales) surfaced from both the add flow and printer settings (v1.8.19; flow redesign v1.10.26; **Bambu Lab A2L and X2D** recognised on discovery and given their walkthroughs v2.27.0).
- LAN discovery per brand — mDNS/SSDP/UDP scans plus a persisted, account-synced shared "extra subnets" list and a manual "Add by IP" path across all six brands (v1.4.8 → v1.10.0; unified extra-subnets store v1.8.20; **tick one or several scan results and add them in one go**, each machine's own code asked on its card, v2.29.0).
- Printer side panel — drag-drop reorder, inline field editing, online/offline indicator via HTTP ping (v1.4.7; "last seen" tracking v1.10.11).
- Printer table/grid — live state pills, progress bar + remaining time, a **Preview** column showing the model currently on the bed, and an **"Ends at"** wall-clock column sortable by soonest finish (v1.7.1; Preview + Ends-at v2.0.0); progress bars coloured by outcome — blue printing, green finished, red failed, grey cancelled — and frozen at the last % (v2.34.0).
- Printer tags, with the same autocomplete UX as spool tags, plus a search bar and Brand/State/Tags filters in the Printers view (v2.0.0).
- **Printers follow a new IP on their own** — when a LAN printer stops answering, its brand's network scan finds it again by its serial / MAC, saves the new address, reconnects and says so in a toast; printers record their stable identity on first connect, even when added by IP (v2.34.0).
- Printer error alerts surfacing the machine's own message and code (Anycubic first) (v1.10.4).
- Snapmaker Paxx-firmware helper — always-current download link, up-to-date indicator, per-printer update notification (v1.10.29).
- FlashForge Creator 5 / 5 Pro official "Cloud + LAN" firmware helper — up-to-date indicator in the printer's Info window, per-model download of the latest release, USB install guide, and an update notification when a connected Creator 5 runs an older version (v2.30.0).
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
- **Snapmaker U1 camera on the stock firmware** — no Paxx needed: the printer's own monitor is woken over Moonraker and shown as 1080p stills at ~1 fps on every surface (side card, camera wall, cards); Paxx keeps its WebRTC live video (v2.33.0).
- **Camera photos and videos** — hovering any printer camera (side card or camera wall) offers photo, record (10 min cap) and the printer's capture folder; photos at the stream's native resolution, videos taken from the source without re-encoding where the transport allows (Bambu RTSPS, MJPEG, Snapmaker stills, WebRTC via MediaRecorder); filed per printer under `Pictures/Tiger Studio/Captures/` with a `printer.json` keeping its names and IPs (v2.43.0).
- **Snapmaker U1 on the Paxx firmware** — the camera wall card opens the printer's side card on a click (its player page no longer swallows it), and the photo / record / folder bar appears on it, taking the photo from the camera's own JPEG (`/webcam/snapshot.jpg`) and the video from its MJPEG stream (`/webcam/stream.mjpg`, copied untouched), falling back on the JPEG read every 200 ms.
- **Start the camera automatically** — per-printer setting (`camAutoStart`): an online printer's board camera starts without a click, including one that comes online later (v2.43.0).
- **External IP cameras** — a camera that is not a printer: "Add a 3D printer" → External cameras → IP camera, with a name, a protocol (RTSP, MJPEG or WebRTC/WHEP), an address and an optional login, plus a Test button that fetches one picture before saving; shown as cards of the camera wall like a printer's camera (placed, moved, resized, fullscreen) and as cards on the printers board, moved, selected and zoomed like a machine (grey dot offline, blue while connecting, green live); stored in `users/{uid}/devices` (`type: "camera"`, owner-only rule) (`renderer/ext-cam/ext-cam.js`, v2.45.0).

## Sensors & devices

- **ACR122U NFC reader** (USB, via `nfc-pcsc`) — plug-and-scan auto-open of the matching spool, with hot-plug detection on Windows (v1.0+; hot-plug fix v1.10.28-era).
- **TD1S** color/TD sensor — auto-detect on USB plug, live viewer, unified color+TD scanning modal with multi-slot (1–3 colour) support, edit-pencil swatch UI (v1.3+; unified modal v1.8.0).
- **TigerScale** — WebSocket heartbeat presence (`users/{uid}/scales/{mac}`), live gradient card matching the mobile app: 56 px weight display, send-status badge (`idle → scanning → stable → send → success`), filament mini-panel pushed from firmware, twin-UID 2-reader grid, hold-to-confirm TARE (v1.5.0). Onboarding card for users without a scale, rebuilt around the **V3** machine — lit product shot with a generation badge, six icon-led capability rows, and two destinations: the firmware on GitHub and the printable body on MakerWorld (v2.19.0). Header presence rebuilt as **one glyph per scale** (capped at two), each coloured by its own state — **active** (green) / **standby** (blue) / **offline** (red) / grey when none — with a per-scale hover popover, an **iOS-style battery pill** (charge % + charging bolt) on the glyph, a distinct **standby** state with regime-aware offline detection (90 s active / 11 min screen-off, so a screen-off scale isn't shown disconnected), Wi-Fi coloured by connectivity, and a TARE confirmed only on a real 2xx response (v2.20.0). Live card rebuilt to mirror the scale's own weigh screen — weight and divider on the left, container and filament values plus **the spool's rack location** on the right, on the firmware's own palette — with TARE as a two-line key beneath the screen, inside the card, where it sits on the machine itself (v2.23.1).
- **TigerPOD** dual-reader stand — dedicated modal with product video/imagery, MakerWorld STL download, dual-chip simultaneous encode ("Dual Link"), auto-opens when a chip action needs a reader that isn't connected (v1.8.0; redesigns v1.8.2, v2.9.0 hero video); ownership + reader-count telemetry signal (`hasPod`, `rfidReadersMax`) (v2.9.0); the modal now offers **both Pod models** to print — Standard and Mini (for OpenSpool) — each with its own MakerWorld download (v2.20.0).
- **TigerSpool** — the open-source RFID reader that fills any printer's slot from a spool's chip: header presence (one glyph per box, active / screen-off / offline, battery), a side card per box with Wi-Fi, firmware and the printers it serves (with whether the box can reach each), hold-to-remove; with no box, a launch card presenting the product with its MakerWorld files (spool left / right), wiki and GitHub (v2.34.0).
- **Tiger Touch** — the Panda Touch / K-Touch firmware: header presence, side card (status, Wi-Fi, firmware, the printers it follows with the screen's own online dot), live view on a canvas (rle565 frames, long-poll, dirty rectangles; click = tap, drag = swipe), screenshot preview (save / copy / report), launch card with the web installer (v2.42.0).
- **Device screens** — TigerScale V3 live view (tap to use) and screenshot from its card; TigerSpool screenshot from its card; one shared preview (v2.42.0).
- **USB scale (Dymo M-series)** live weighing — plug a Dymo USB HID scale and spool weights fill themselves in: a chip on the reader (POD mode) saves the weight silently, or an open spool card offers an inline confirm; live grams appear in the spool's weight panel with an "asleep — tap to wake" hint when the scale powers down (v2.14.0; reconnects by itself after its sleep, "Weigh again" without lifting the spool v2.41.0).

## RFID / NFC & tags

- TigerTag chip reading/writing/verification pipeline (NTAG page-aligned reads, per-reader disambiguation) (v1.8.0).
- Cloud-spool → physical-chip guided encode modal — presence-gated, sequential verified burn, all-or-nothing Firestore migration, dual-reader twin support (v1.8.5).
- Guided chip-update panel for re-writing an existing chip with live UID-match feedback (v2.0.0).
- Chip reuse tools — Erase, Recycle to NFC, Restore TigerTag+ from backup (v1.10.29).
- Physical-chip backup — TigerTag+ signature saved on first read, enabling later restore; "Backed up" badge (v1.10.28, badge v1.10.29).
- Product ID surfaced from the chip with a link to the product catalogue page (v1.10.29).
- Terminology unification: all user-facing "RFID" strings renamed to "NFC" (v2.5.0).
- **Linked chips** — a maker's MIFARE Classic chip (Bambu Lab, Creality CFS; QIDI Box and Snapmaker U1 use the same type) is linked by UID to a material of the inventory: placing the spool then opens it; nothing is written into the third-party chip; one held Unlink removes all of a material's chips (`users/{uid}/rfidAliases`, v2.45.0).
- **One window to add a material** — a blank tag, an unknown chip or the search bar's "+" opens the same side card: Add from the catalogue (open at once), Add manually, Link to my inventory (grouped grid, brand / material / tag filters), the chosen view sliding in beside the choices (v2.45.0).
- **Burn in one hold** — "Burn the TigerTag / TigerTag+" held 1.5 s on a material's card opens the burn window, which burns by itself once blank chips are in place; MIFARE chips show as incompatible in the burn window (v2.45.0).
- **Tag index / tag count** (TigerTag protocol v2.2) — every chip says which one of its object it is ("chip 1 of 2"): written by the guided encode (single `0x11`, twin `0x12`/`0x22`), kept intact through weight and colour syncs, stored on each spool on scan, shown on the spool card, carried in `.ttag`; a twin whose partner was never scanned gets a "scan the other chip" banner, and two chips that say they are singles are never paired as a twin (v2.33.0).
- **NFC tools** — a choice of the add window ("+" or a blank chip) during which a scan opens nothing: "Format your RFID chip" (back to TigerTag Init) and "Write in NDEF" — a link (any scheme: web, local address, camera / data stream, app link; checked as typed), Wi‑Fi, contact (name, phone, e‑mail, company, website), e‑mail, phone, SMS or an NDEF reset — on any NFC tag, sized to the chip (NTAG213 / 215 / 216, live byte counter); held 1.5 s, or in **Auto** mode every chip placed is written at once with a beep (inventory spools skipped); the last link and the contact card are remembered (`renderer/rfid_protocol/eraser/`, `services/ndef.js`, v2.46.1).
- **Every MIFARE Classic 1K maker chip** links to a spool — Bambu Lab, Creality, Qidi, Anycubic… — and a spool may carry its 2 TigerTag chips and its 2 maker chips, or only the maker chips (v2.46.1).
- **Upgrade to TigerTag+ / TigerData+ from the catalogue** — the spool card's banner opens the catalogue beside it; the picked product's held banner applies its data to the spool and its twin, a TigerTag only with its own chips on the TigerPOD, rewritten right after (v2.46.1).
- **Burn a TigerTag+ from any catalogue product card** — held "Burn the TigerTag+" banner (v2.46.1).
- **Maker chips linked from every way of adding a spool** — with Bambu Lab / Creality chips on the TigerPOD, the catalogue product card and "Add product" offer a held "Link the proprietary third-party Tag(s)" instead of a burn (spool created, chips linked, nothing written); the Link / Burn banners follow what sits on the TigerPOD live (v2.47.0).
- **Search by chip UID** — the inventory search finds a spool by a linked maker chip's UID, whole or partial (v2.47.0).

## TigerSquad, XP & support

- **TigerSquad** — a free, opt-in public community with a wall of fame on tigersystem.io; joined from an invitation window (accounts older than 3 days, back the next day if closed — v2.38.0), the Support menu, the requests card, the account menu or My profile; +50 XP on joining, with a fanfare and a celebration (v2.37.0, celebration v2.38.0).
- **Levels** — Bronze (joined), Silver (20+ TigerTag chips), Gold (donated), Platinum (donated + 50 certified TigerTag+), computed server-side and shown as a coloured ring, the level badge and level pill on avatars and banners, to friends and on the wall (v2.37.0, badge instead of heart v2.38.0); climbing a level opens a level-up window — live or at the next launch (v2.38.0).
- **XP points** — per physical chip: certified TigerTag+ 10, TigerTag+ 2, TigerTag 1, counted once per UID from the chip census and the inventory, kept for good; shown under the name and in My profile (v2.37.0).
- **XP achievements** — friends, social links, profile photo, public profile, connected printers, TigerScale, TigerSpool (lost again when removed), plus one-time discoveries kept for good: phone app, TigerPOD, RFID reader, TD1S, USB scale (100 XP, v2.41.0), first rack, first list, and 5 XP per sidebar community link opened; every change logged in an XP history (v2.38.0). Tiger Touch: 100 XP (v2.42.0).
- **Rankings** — a window with the Countries League (XP per country, picked in My profile), the Makers, your Achievements (with what it takes to reach the next level) and your XP History; world rank ("#3 worldwide of 9") in My profile, the support menu and a sidebar chip (v2.38.0).
- **XP and level-up notifications** — the day's gains in one row, each level climbed in its own (v2.38.0).
- **Member card** — members see their level, the head count and a link to the wall in the Support menu and the requests card, swapped live on join / leave (v2.37.0).
- **Support the project** — Buy Me a Coffee, Ko-fi or PayPal from every coffee button; donations linked to the account by a fixed supporter code, the payer email or a later claim, with a thank-you notification (v2.37.0).
- **Tiger Quests** — daily quests (open the app + four missions drawn by the server each day, a full-set chest with a jackpot animation, a 5-day streak bonus, next-draw countdown, stats) and tutorial missions (20-chapter map; Discovery and Explorer built, five levels of five missions each with an illustration and a level bonus), counted from the app's batched action counters; Demo printers earn nothing (v2.43.0).
- **TigerSquad view** — a view of the main area: Rankings with three leagues side by side (countries with flag avatars and medal rings, your country, makers worldwide), daily rank arrows from a server baseline, the live Community pulse (total XP, spools, printers with rolling counters and sparklines), and Items, every XP item on a rarity ladder (v2.43.0).
- **XP history page** — total / gained / lost / activities tiles, the XP balance curve over 7D / 30D / 90D / All, the 30-day breakdown ring by category and the full activity log with category, gain / loss filters and search (v2.43.0).
- **Deals** — partner offers for TigerSquad members (`squadDeals`, managed from the TigerHub admin, loaded in one squadDeal `list` call since v2.46.2): shared, single-use or link-only codes, a per-deal countdown once claimed, stock gauges, "I used it" history, All / My codes / Exchange tabs with search, announcements (QR codes for the mobile app), the partner's site clickable for every member with its clicks counted (v2.44.0).
- **TigerCoins and envelopes** — a surprise envelope per TigerTag+ Certified chip, gift envelopes (campaigns, milestones, gift codes, shared red envelopes) and chests, all opened in one animated stage (×1 / ×10, five rarities); coins traded in the Exchange tab; envelopes given to friends with a daily allowance by TigerSquad level; hidden easter-egg envelopes in the banners (v2.44.0).
- **Maker's Workshop** — the Items view redrawn: illustrated loot (legendary relics, gear, chips) and feats rows, a banner with the four legendary devices lit once owned (v2.44.0).
- **XP history scopes** — your curve, your country's league or the top leagues side by side (v2.44.0).
- **TigerCoins in the top bar** — balance (history), envelopes waiting and the gift-code button always in sight for members, each opening its window over the Deals; the history shows envelopes received (green, +1) and given (red, −1) with the friend's avatar (v2.47.0).

## Feedback & requests

- **Improvements & suggestions** — an in-app side card that turns a request into a public GitHub issue, no GitHub account needed: six topics (problem, idea, improvement, question, catalogue correction with the material picked from the catalogue search, new brand with its website), Markdown description, up to 5 attachments (window capture, images, PDFs) dropped anywhere in the window, automatic information shown up front, public-consent check; the draft survives closing the card, whose tab stays parked on the sidebar edge while a request is in progress (v2.36.0).
- **Screenshot editor** — arrows, lines, boxes, circles, pen, highlighter, text, numbered steps and a blur for private details; every mark stays editable until Done, with undo / redo and shortcuts (v2.36.0).
- **My requests** — status of every request (sent, in progress, done, not planned, closed by you), close your own, and a notification when one changes (v2.36.0).
- Reply notifications — a team reply on one of your requests raises a notification; JSON attachments accepted (v2.37.0).
- Reports carry the reporter's TigerSquad badge and XP, read server-side (v2.39.0).
- **Requests by product** — pick Tiger Studio, Tiger Touch, Tiger POD, Tiger Scale, Tiger Spool or TigerTag RFID Connect first; filed on that project's repo; device screen capture in one click, and Tiger Touch / Tiger Spool requests list the printers the device follows (v2.42.0).
- Requests are sent by TigerSquad members (free to join, checked server-side); Send points at what is missing; the screenshot editor opens as a window over the app (v2.42.0).

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

## Tiger Studio Web

- **Studio in the browser** at `studio.tigersystem.io` (`tigersystem.io/studio` redirects there): inventory, racks, favourites, lists, catalogue, friends, notifications and settings from the same code as the desktop app; hardware features (NFC readers, TD1S, USB scale, printers, cameras, updater) stay desktop-only (v2.40.0).
- **Sign in once, stay signed in** — Studio Web has its own sign-in (Google or email) on its own domain, remembered afterwards; Google's account picker names tigersystem.io (v2.40.0, own-domain sign-in v2.40.1).
- **iPad / touch** — the sidebar follows the screen (slim in portrait, full in landscape, follows a rotation), hover-only actions are shown on touch screens and mouse-only helpers hidden (v2.40.1).
- **Installable as an app (PWA)** — "Install the app" in the sidebar (Chrome / Edge / Android), Add-to-Home-Screen hint on iPhone / iPad (v2.40.0).
- **Always the same version as the desktop app** — the web follows the published release and an open page reloads onto a new one (v2.40.0).
- Friend links (`?friend=CODE`) pre-fill Add-friend on the web (v2.40.0).

## Distribution, auto-update & installers

- Auto-update via `electron-updater` / GitHub Releases, with a Settings toggle (enable/disable + "Check now") (v1.4.4).
- macOS code signing + notarization (Apple Developer ID + `notarytool`, App Store Connect API Key) in CI (v1.4.2).
- Cross-platform builds — macOS (x64 + arm64, signed), Windows (NSIS, unsigned pending Azure Trusted Signing), Linux (AppImage).
- **Portable Windows build** — runs with no installation and keeps accounts, cache and logs beside the .exe rather than in `%APPDATA%`, so nothing is left behind on a shared machine (v2.18.0).
- Dark native window chrome (`nativeTheme.themeSource = 'dark'`) and shadow-less window edges (v1.4.13).
- Launch splash screen shown instantly while the app assembles from cache (v1.8.24).
- **Window state memory** — the window reopens at its last size, position and maximized / full-screen state (only on a display still connected); first launch opens maximized (v2.32.0).

## Appearance & theming

- **Dark and Light themes**, dark shipped as the default, chosen in *Edit profile → Theme* (v2.18.0).
- Theme carried by `data-theme` on `<html>`, written statically so the right palette is in force at first paint — no flash of the wrong theme on launch (v2.18.0).
- Native window chrome follows the in-app theme over IPC (`nativeTheme.themeSource`), so a light UI never sits inside a black title bar (v2.18.0).
- Choice persisted three ways, each with its own job: `localStorage` for an offline cold start, `users/{uid}.studioTheme` so it follows the account across machines, and `telemetry/studio.theme` as usage data for the Hub's dark/light split (v2.18.0).
- Design-token layer — ~75 semantic tokens plus a dark override, an "ink ladder" whose polarity flips with the theme, and `--on-accent` for the fixed-polarity case (a label on a filled button stays white in both themes) (v2.18.0).
- `npm run theme:check` guards it: fails on any raw colour or any `var(--x)` naming an undeclared variable (v2.18.0).
- **Edit my profile** window (photo, display name, theme colour, live preview); the theme colour tints the header and the hero banners, and a friend's colour in their view (v2.44.0).

## Internationalization (i18n)

- **11 locales** shipped and kept in lock-step: English, French, German, Spanish, Italian, Chinese, Portuguese (Brasil), Portuguese (Portugal), Polish, Russian and Dutch (both contributed, v2.28.0).
- Plural inflection (`{one, other}`) applied consistently to every duration key (v1.4.9).
- `npm run i18n:add` — single command that writes a new/updated key across all 11 locale files at once (v1.4.9).
- `npm run i18n:check` + a pre-commit hook blocking any commit that lets the 11 locale files drift apart (v1.4.9).

## AI assistants (MCP)

- **Local read-only MCP server** — Claude, Cursor and VS Code can read the account (inventory, racks, printers, devices, wishlists, friends' shared stock, data history) through 14 tools with decoded values and a built-in field notice; per-profile opt-in in *My profile*, one-click install per app, hold-to-renew key, credentials never exposed (v2.32.0).
- **Online connector** — *My profile* presents the Tiger Hub's hosted server (`mcp.tigersystem.io`) for Claude.ai, ChatGPT and phone apps, with no Studio running: address + copy, the guide, and the online assistants connected to the account, each with a hold-to-cut button (v2.34.0).
- Online connector tiles for Claude, ChatGPT, Grok and Le Chat in My profile, each copying the address and opening its section of the setup guide (v2.44.0).

## Dev tooling

- **Tiger Studio Web hotfixes** — `npm run web:hotfix` ships a web-only fix as `X.Y.Z · web N` without a desktop build, the version number staying the desktop's; Web sync checks the live site (v2.40.1).
- CSS modularization — the original monolithic `inventory.css` split into themed files (`00-base.css` → `70-detail-misc.css`) loaded in numeric order (v1.4.9).
- `renderer/CODEMAP.md` — feature → line-range index for `inventory.js`, kept in sync via `npm run codemap:check` (post-v1.4.9); `CODEMAP-main.md` mirrors it for `main.js`.
- `npm run whatsnew:add` / `whatsnew:check` / `whatsnew:import` — scaffold, validate, and seed-from-changelog tooling for the "What's New" content pipeline (v2.x era).
- `scripts/extract-changelog.mjs` — publishes the hand-authored release note (or a changelog-derived fallback) verbatim to the GitHub Release page as part of the `prepare-release` CI job.

---

Keep this in sync when shipping a feature (source of truth: `CHANGELOG.md`).
