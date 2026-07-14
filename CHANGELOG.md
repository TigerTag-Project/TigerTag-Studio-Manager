# Changelog

All notable changes to Tiger Studio Manager are documented here.
Versions follow [Semantic Versioning](https://semver.org/).

---

## v2.11.0 — 2026-07-14

### Added

- **"To order" line — "Stop tracking" action to drop an item from the reorder list.** Each cart / saved-shelf line gains a press-and-hold "Stop tracking" button (1 s, red fill sweep) that resets the product's `minStockSpools` to 0, which clears the whole reorder state (`minStockSpools` / `savedForLater` / `orderQty` via `FieldValue.delete`) and removes the line from the To-order view entirely. Hold-to-confirm (a plain click is swallowed) since it discards the min-stock setting — `renderer/inventory.js` (`_orderLineHTML` `stopLink` + `.hold-progress`, wired via `setupHoldToConfirm(btn, 1000, → _writeProductField(hash, { minStockSpools: 0 }))`), `renderer/css/70-detail-misc.css` (`.pv-move-link--stop`).
- **"To order" cart — each purchase source is its own card with a subtotal footer.** The cart, previously one continuous list with sticky source headers, now renders each purchase source (buy-link host) as a separate bordered card: header (source + count), its lines, then a subtotal footer (Σ unit price × qty over its priced items, in the account's HT/TTC mode, shown only when the group has ≥1 priced item) tagged with a localised HT / TTC label (`reorderHT` / `reorderTTC`). Complements the global Payment card — `renderer/inventory.js` (`_renderOrderTab`: `.pv-cart-card` + `.pv-cart-card-foot`, cart zone → `.pv-cart-cards`), `renderer/css/70-detail-misc.css`.
- **"To order" cart — reorder the purchase-source cards by drag-and-drop.** Each source card's header carries a grip; dragging it reorders the source groups (persisted in `localStorage tigertag.cartSrcOrder`). The no-link card stays pinned last; new sources appear after the saved ones (alphabetical). Reuses the shared make-room DnD helper gated to `.pv-cart-grip` so it never collides with the within-card line reorder (`.pv-grip`) — `renderer/inventory.js` (`_getCartSrcOrder` / `_setCartSrcOrder`, `_cartKeys` sort, `_wireMakeRoomDnd` on `#invProductsView`), `renderer/css/70-detail-misc.css`.
- **"To order" cart — a personal note per purchase source.** Each source card gains an editable free-text note under its header (amber strip when set, a quiet "Add a note" prompt when empty). Inline edit (Enter saves, Shift+Enter newline, Escape cancels); stored locally keyed by host (`tigertag.cartSrcNotes`) so it follows a reordered card. Owner-only (read-only in friend-view) — `renderer/inventory.js` (`_getCartSrcNotes` / `_setCartSrcNote` / `_startCartNoteEdit`), `renderer/css/70-detail-misc.css` (`.pv-cart-note*`). New `cartAddNote` / `cartNotePh` i18n.
- **Loading spinner on the Favorites / To-order, Lists and Storage views.** These views read Firestore subscriptions, so before the first snapshot they briefly flashed "nothing here" / "no lists yet" / "no racks yet". Added `state.productsLoading` / `state.listsLoading` / `state.racksLoading` (default true; set true again whenever the matching subscription (re)starts, until its first snapshot); the render functions now show the shared `.inv-loading` spinner while loading and fall through to the data / empty illustration only once it has arrived. Storage gates on `state.racksLoading` (own) / `state.invLoading` (friend, racks come with the one-shot friend read). A denied/errored read drops the spinner instead of spinning forever — `renderer/inventory.js` (`subscribeProducts` / `subscribeLists` / `subscribeRacks` + friend variants, `renderProductsView`, `renderListsView`, `renderRackView`, `switchBackToOwnView`). New `loadingGeneric` i18n.

### Changed

- **Grouped-spools side-card — one icon-only action row with favourite + to-order toggles; shown in friend-view too.** The deck panel now exposes the same flag toggles as the product card: Product-info (left), then add-to-cart (❤ "to order"), favourite (★) and add-to-a-list (＋) grouped on the right, each a `.flag-toggle` reflecting/writing via `_toggleProductFlag`. The three toggles also render in friend-view (importing the friend's product into your account — provenance + price/link carried by `_toggleProductFlag`), without the Product-info button (owner-only, as are the below-min-stock alert + read-only note); with no info button they stay right-aligned (`justify-content: flex-end`). The old text "Add to a list" row and the standalone Buy button are gone — `renderer/inventory.js` (`_renderGroupPanelContents`), `renderer/css/70-detail-misc.css` (`.gp-actions--flags`).
- **"Add to a list" works in friend-view — it adds a friend's material to one of your own lists.** The lists flow was owner-gated. The "Add to a list" popup now always targets your own lists (new `_ownLists` / `_ownListsArray` / `_ownListHas`, used for the popup rows + tick state instead of `_listsSource()` which flips to the friend's lists in friend-view), and picking a list imports the friend's product into your account first (carrying their price / buy link / SKU-EAN + stamping provenance, like favouriting) before `arrayUnion`-ing its key to your list; creating a new list on the spot works too. Removed the `state.friendView` early-returns on `_addToList` / `_removeFromList` / `_createList` / `openCreateListModal` / `_submitCreateList` / `_openAddToListMenu` (all write to your own account via `getActiveId`; the Lists-view edit/new controls stay unrendered in friend-view, so no friend list can be mutated). The ＋ button now shows in friend-view on the grouped-spools side-card and the spool detail panel too, not just the product card — `renderer/inventory.js` (`_flagTogglesHTML`, `_renderGroupPanelContents`, `_addToList`, `_openAddToListMenu`).
- **Loading animation restyled to a comet-trail loader + playful phrase carousel.** The shared `.inv-loading-spin` is now a rotating comet (five `box-shadow` dots forming a fading tail; `load6` + a dedicated `round` 0°→360° keyframe, adapted from Luke Haas' css-loaders, MIT; brand-orange). Under it, a carousel of playful phrases slides in from the right and out to the left, one at a time, edges fading through a gradient mask; phrase order shuffled (Fisher-Yates) each time the loader first appears. All loading states share one `_loadingHTML()` helper, shown via `_showLoading(host)` which only builds the loader when absent — so a re-render while still loading no longer restarts the spinner + carousel — `renderer/inventory.js` (`_loadingHTML` + render sites), `renderer/css/70-detail-misc.css` (`.inv-loading-spin`, `load6`, `.ld-phrases`), `renderer/css/40-printers.css`. New `loadingFun1`–`loadingFun4` i18n.
- **Product card — the buy link sits under the price, styled like the reorder card's shop button.** The buy link, previously a detached grey button below the price section, now lives inside the same price section (directly under the price line) and adopts the reorder / To-order card's active-shop-button look — Shopify green with a white cart icon + shop name — for a consistent buy affordance across the two side-cards — `renderer/inventory.js` (`_renderProductCard`), `renderer/css/70-detail-misc.css` (`.pc-buy`, `.pc-rows`).
- **"To order" view — the Payment card top-aligns with the first source card** (a `margin-top` matching the "Panier" section-title height, reset in the stacked mobile layout) — `renderer/css/70-detail-misc.css` (`.pv-order-side`).
- **Open-list Details card — the Event (gift) and Message (mail) icons are larger** (`icon-16` instead of `icon-12`) — `renderer/inventory.js` (`infoCardHTML`).

### Fixed

- **Right-click menu (Cut / Copy / Paste / Select All) now follows the in-app language, not the OS locale.** The native context menu was built in the main process from Electron `role`s, whose labels come from the OS locale. The renderer now pushes the translated labels to the main process on startup and on every language change (new `app:ctx-menu-labels` IPC + `electronAPI.setContextMenuLabels`), and the menu overrides each role's label with them (role default until the first push) — `main.js`, `preload.js`, `renderer/inventory.js` (`applyTranslations`). New `ctxCut` / `ctxCopy` / `ctxPaste` / `ctxSelectAll` i18n.
- **Lists count badge lingered on the wrong context (own ↔ friend).** The context-aware count pill was only refreshed by the lists snapshots — which don't fire on a view switch, and never fire when a friend's lists read is denied or arrives empty — so it kept the previous count (your own when opening such a friend; the friend's after returning). Recomputed at both transitions: `switchBackToOwnView` from your own lists after clearing friend-view, and `subscribeFriendLists` up front from the reset friend context before the async snapshot — `renderer/inventory.js`.
- **Friend with an empty inventory — the decorative rack lingered after leaving the Storage view.** Switching from the Storage view to table/grid on a friend with no stock left the empty-rack illustration (+ its stats pill and unranked side-panel, all inside `#invRackView`) visible behind the empty state. The friend-view empty-inventory branch of `renderInventory` hid the table/grid containers but not `#invRackView` (nor the printer/products/lists containers); it now hides them all, mirroring the own-view branch — `renderer/inventory.js` (`renderInventory`).
- **Sidebar "Mobile Apps" QR flashed a broken-image icon on cold start.** The QR `<img>` ships with no `src` (generated locally and set after the module loads), so the browser's broken-image placeholder + "QR" alt text flashed for a beat on launch. The image is now hidden until it has a `src` (`.sb-qr-img:not([src])`), its fixed box keeping the layout stable — `renderer/css/10-settings.css`.

## v2.10.0 — 2026-07-13

### Added

- **Drag-and-drop organisation of the "Your lists" sidebar.** Owners can reorder their lists by dragging (persisted `sortRank`) AND drag a list from one visibility group to another (Private / Friends / Public) to **change its type** — the drop reconciles the public snapshot automatically (publish on → public / tear down on → private, via the existing lists-snapshot sync). All three groups always render as drop zones (grab-grip per row; an empty group shows a dashed "Drop a list here" hint that lights up while dragging). Three-zone "make-room" DnD mirroring the cart, optimistic re-render + batched Firestore write (`_applyListDrop` / `_persistListOrder` / `_listZoneIdsFromDom`, delegated on `#invListsView`). Friend-view stays read-only — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`. New `listTypeDropHint` i18n (9 locales).
- **Info button in the product side-card → opens the in-app reorder / To-order side-card.** The product business card (`openProductCard`) gains an info button next to add-to-list / cart / favourite that opens the product's reorder side-card (`openReorderPanel` — editable price / buy-link / min-stock) **alongside the card, without closing it** (both stack via `_syncPanels`). Owner-only. The external TigerTag catalogue link stays as a clickable "Product ID" row — `renderer/inventory.js` (`_renderProductCard`, `#productCardBody` wiring), `renderer/css/70-detail-misc.css` (`.flag-toggle--info`). New `productInfoPage` i18n (9 locales).
- **Debug "copy view ref" tool (admin debug mode only).** With debug mode on, ⌥(Alt)-clicking any card / panel / view copies a paste-ready descriptor to the clipboard — the current view mode (+ friend-view), the surface (human name · DOM id · render function · file, via a `_DBG_SURFACES` registry tagging every side-card panel), the data ids in scope (product hash, list id, selected spool/list), one `openCard:` line per open side-card, and the clicked element. A hint pill (`#dbgRefHint`) plus a per-panel `.dbg-card-btn` (kept alive by a MutationObserver) copy the current/that card's ref; confirmed with the shared "Copied!" flash. Admin-only, English-only — `renderer/inventory.js` (`_dbgBuildRef` / `_dbgRefHintSync` in `applyDebugMode`), `renderer/css/70-detail-misc.css`.

### Changed

- **Open-list view reworked into a "Details" recap card + a slimmer header.** A right-rail `.lv-info-card` above the Payment summary now consolidates the list's meta: a header ("Details" + an icon-only **Manage list** button), a two-up strip with the **type** (a gradient pill badge) and the **item count**, then **event** and **message** rows. Fields use bare coloured accent icons (no rounded-square icon boxes). The view header is reduced to the list name — the type badge, item-count pill and edit action all moved into the card. Removed the now-unused `.lv-actions` / `.lv-act` / `.lv-count` / `.lv-occasion` / `.lv-message` — `renderer/inventory.js` (`renderListsView`, `infoCardHTML`), `renderer/css/70-detail-misc.css`.
- **A single gradient "type badge" identifies list visibility everywhere.** One pill badge family (like the TigerTag+ / TigerCloud badges — gradient fill, white icon + label, one colour per type: purple Private / blue Friends / green Public) is used across the sidebar group headers, the Details card, and (as coloured cards) the create/edit type selector. The Private glyph is the eye-off used elsewhere (the padlock read as "encrypted"); Friends = person; Public = globe — `renderer/inventory.js` (`_listVisMeta`), `renderer/css/70-detail-misc.css`, `renderer/css/60-modals.css` (per-type `--vc`), `renderer/inventory.html`.
- **The "Your lists" sidebar is grouped by visibility** (Private / Friends / Public), each group a badge header + drop zone; the "Create a list" button moved to the top. The **Public** icon changed from an eye to a globe across the group header, the title badge and the public-share card — `renderer/inventory.js` (`renderListsView`), `renderer/css/70-detail-misc.css`.
- **Create/edit-list modal reworked around the list type.** The visibility choice moved from a bottom dropdown to a prominent 3-card segmented selector (icon + title + description) under the name; new-list default is now **Private** (was Friends). The message field is always shown but reframes by type — "Message for your friends" (shared) vs "A note to future you" (private). The old `<select id="clmVisibility">` became a hidden input driven by the cards — `renderer/inventory.html`, `renderer/inventory.js` (`_clmSetVis`, `_submitCreateList`), `renderer/css/60-modals.css`.
- **"To order" view: clicking a material opens the product side-card.** A click on the material (thumbnail / name / row body) now opens the product business card (`openProductCard`), the same entry point as a wishlist row (before, a line-body click did nothing). The ⓘ button still opens the reorder side-card; the quantity selector, drag grip, buy / add-price / copy-SKU and set-aside controls keep their behaviour — `renderer/inventory.js` (`.pv-order-line` branch of the `#invProductsView` handler).
- **List row layout tightened — per-item actions moved to the right of the row.** The quantity selector + buy-link + remove button used to stack as a fourth line under the thumbnail/title/price block (~140px rows); they now sit on the right, vertically centred on one line, so height is driven by the thumbnail (~113px, ‑20%). No element resized — `.lv-row-actions` lifted out of `.lv-row-body`, `.lv-row` gets `align-items:center` — `renderer/inventory.js` (`_listRowHTML`), `renderer/css/70-detail-misc.css`.
- **List grid card: the buy-link button moved below the quantity** (own full-width row) and a long shop domain now ellipsizes inside the button instead of overflowing (`.lv-buy-txt` `min-width:0` + `text-overflow:ellipsis`; `.lv-card-buybar` stacks) — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **Disambiguated the two meanings of "items" on the open-list screen.** The Details card counts distinct products while the Payment summary sums quantities — the shared word made "3" and "17" look contradictory. The Payment quantity counter (`pvItems`, used by the list and To-order summaries) is renamed to **"units"** (unités / Einheiten / unidades / unità / szt. …) — `renderer/inventory.js`, 9 locales.

### Fixed

- **Cam view showed the same Creality camera for every connected Creality.** The Creality WebRTC widget was a global singleton — one peer connection, one stream, and a consumer set populated by `document.querySelectorAll(".cre-cam-video")` regardless of which printer each `<video>` belonged to; the cam wall also only started the stream for `crePrinters[0]`. So every Creality card received the first/last-started printer's feed (the sidecard looked correct only because it shows one video at a time). Reworked to keep **one WebRTC session per printer IP** (`_sessions` map), route each `<video>` to its session via a new `data-cre-ip` tag, start a session for **every** online Creality, and stop sessions per-IP (disconnecting one no longer tears down the others); the reconnect path stamps `data-cre-ip` on the sidecard video (the panel isn't rebuilt on reconnect) — `renderer/printers/creality/widget_camera.js` (rewrite), `renderer/inventory.js`, `renderer/printers/creality/index.js`, `renderer/printers/context.js`.
- **Lists view couldn't scroll with many items — each column now scrolls on its own.** The open-list view grew with its content but `#card-inv` clips overflow, so a long list (or tall right rail) was cut off. The view now fills the remaining height and splits into three independently-scrolling columns (sidebar, item list with a pinned header, right rail), mirroring the products view's `flex:1; min-height:0; overflow-y:auto` pattern; the rail's `position:sticky` is dropped for its own scroll, and scrollbars are hidden (`scrollbar-width:none`) — `renderer/css/70-detail-misc.css`.
- **Two spools could end up assigned to the same rack slot — now auto-healed + prevented.** Rack-slot uniqueness was client-side only, so a cross-device race or Auto-organize against an incomplete/cache snapshot could drop a second spool onto an occupied slot. Added `healDuplicateSlots(uid)` — on each authoritative, settled SERVER snapshot it detects any slot holding >1 spool-unit (a linked twin pair counts as one) and evicts extras to `rack: null` deterministically (keeps the smallest spoolId) and idempotently. GUARD: auto-store now only runs on a SERVER snapshot (never cache/partial). The evicted spool re-files on the next pass — `renderer/inventory.js` (`healDuplicateSlots` + `subscribeInventory`).
- **Lists view — grid cards now open the product side-card on click, like the rows do.** The click handler only matched `.lv-row[data-hash]`; grid cards (`.lv-card[data-hash]`) fell through. Extended the selector to match both — `renderer/inventory.js`.

### Removed

- **Public-list share card: dropped the "Public link" header row** — the "Copy link" button moved up into its place (top of the card, above the QR) since it already names the action. Dead `.lv-public-title` CSS + the unused `listSharePublicTitle` i18n key removed — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`, 9 locales.

---

## v2.9.1 — 2026-07-13

### Fixed

- **macOS: the "Restart" button after an update download hid the window instead of installing the update.** `autoUpdater.quitAndInstall()` (Squirrel.Mac) emits the `before-quit-for-update` app event, not the regular `before-quit`, so the `_isQuitting` latch stayed `false`; the macOS `close` handler (which hides the window rather than destroying it, to keep the auth/inventory/camera session alive on a red-button close) then called `mainWindow.hide()` instead of letting the window close — the app kept running in the dock and the downloaded update was never applied. `_isQuitting` is now latched on `before-quit-for-update` and set in the `install-update` IPC before `quitAndInstall()`, so the window actually closes and Squirrel installs the update — `main.js`. (The fix only takes effect from the *next* update: a client already on the broken 2.9.0 must quit/relaunch once for 2.9.1 to install.)

### Changed

- **The "What's New" entry for 2.9.1 resurfaces the 2.9.0 highlights** so users the broken macOS updater skipped straight past 2.9.0 still see the wishlist-quantities / per-list totals / cart-by-store / offline-QR / TigerPOD news — `data/whatsnew.json`.

---

## v2.9.0 — 2026-07-13

### Added

- **Per-item quantities in wishlists (Amazon-cart style).** Each list item gains an Amazon-style quantity selector (owner) / read-only `× N` (friend): a dropdown 1–9 + "10+", where picking "10+" swaps to a hand-typed number input (no spinner arrows). The dropdown is a body-appended `#qselPop` positioned in JS (`position: fixed`) so it overlays everything and never clips inside / grows the card; it closes on outside-click, scroll or resize, and blocks drag-reorder while a value is being edited (re-enabled on the next pointer-up). Shared `_qtySelHTML` / `_commitQty` / `_qselOpen` / `_qselClose` widget, reused by the "To order" cart. Quantities persist in a new `itemQty` map (`keyHash → n`, default 1) on the list doc — deep-merged so items don't clobber each other; the payment total and article count multiply by quantity, and the public snapshot (`publicLists/{token}.items[].qty`) carries it. Backend: `itemQty` added to the `lists` `hasOnly()` whitelist (deployed).
- **Payment-summary card in the Lists view** — a right-rail card (Subtotal · N articles, estimated VAT, Total), identical to the "To order" cart's payment card (reuses `.pv-summary` + `pvPayment`/`pvSubtotal`/`pvItems`/`pvTax`/`reorderVat`/`pvOrderTotal`). Total = Σ `buyPriceHt × qty` over priced items, in the account's HT/TTC mode + currency; only rendered when at least one item has a price. Stacked above the public-share card in a new `.lv-rail` right column (works in friend-view). `renderListsView`.
- **The "To order" cart is auto-grouped by purchase source.** The active cart splits into one group per buy-link host (sticky header labelled "atome3d.com", "amazon.fr", … + per-group count); link-less items fall into a "No buy link" group shown last. One drag zone (headers ignored by the make-room reorder), but a drag-reorder inside the cart is constrained to its own group's index range — an item can only be re-ordered among items sharing the same buy source. Cart⇄saved moves (set aside / bring back) and reordering within the saved shelf are unchanged. `_renderOrderTab`. New `reorderNoLink` i18n.
- **QR codes are generated locally (offline) — no external service.** Replaced every `api.qrserver.com` call (public-list card + downloadable PNG, friend-invite card, sidebar mobile-apps QR, onboarding QR cards) with local generation via the vendored `qrcode-generator` (MIT, `renderer/lib/qrcode/qrcode.js`, loaded before `inventory.js`). New `_makeQrDataUrl()` renders the module matrix to a canvas → PNG data URL, no network / no third-party dependency. Sidebar QR init deferred via `queueMicrotask` to avoid a module-init TDZ on the `tigertag.qrStyle` constant.
- **Customisable QR style** — the "Public link" card (owner) gains a 5-preset colour-swatch row; the choice is stored per device (`localStorage tigertag.qrStyle`) and applied to all shareable QRs (public list + friend invite). `_qrStyle` / `_setQrStyle`. New `qrCustomizeLabel` / `qrLogoToggle` i18n. (A centre tiger-head logo option — contouring mark on a white backing, ECC bumped to H — is built but disabled for now: the toggle is hidden and `_qrStyle().logo` is forced `false`; code + `assets/svg/logos/logo_tigertag_head.svg` kept for later.)
- **Download button on the public-list QR code** — a square download button beside "Copy link" on the "Public link" card saves the QR as a high-res PNG via a native Save dialog. The `image:download` IPC now also accepts a `data:` URL (locally-generated QR, decoded + written directly) alongside the remote-URL path. `main.js`, `preload.js`. New `listShareDownloadQr` i18n (aria-label).
- **TigerPOD-owner census — dual ownership signal in `telemetry/studio`.** `hasPod` (boolean): owns a Pod — set by a new "I own a TigerPOD" toggle in the TigerPOD modal, OR auto on the first successful RFID read (not derivable — a declaration can precede any scan). `rfidReadersMax` (1|2): reader count kept at lifetime max. Both seeded at login (`hydratePodSignal`) so the toggle reflects reality and the session never overwrites a stored higher reader count. The RFID badge now opens the TigerPOD modal whether or not a reader is connected. `saveHasPod`; new `tigerPodOwnLabel` / `tigerPodOwnSub` i18n. (Backend rule: `hasPod` added to the `telemetry` `hasOnly()` whitelist with a `is bool` guard — already deployed.)
- **Apple/Bambu-style version carousel in the "What's New" modal** — a page-control of round dots (one per version) in the footer where the active dot is an elongated orange capsule kept permanently centred: the whole track slides under it (animated `translateX`) so browsing back/forth never drifts the pill to an edge, at any position. Fixed 7-slot viewport with faded edges (mask gradient); each dot is a 20×30 px hit target with a small round `::before`. Clicking a dot jumps; the title-bar picker still jumps anywhere; browsing doesn't change the acknowledged version. `_wnRenderDots` / `_wnGoTo`.

### Changed

- **`rfidReadersMax` is recorded on a real read + never lowers.** The Pod reader count is measured on a SUCCESSFUL RFID read (not on reader plug/unplug), and `_telRfidMax` is seeded from the persisted `telemetry/studio.rfidReadersMax` at login so a fresh session can't overwrite a stored higher count.
- **The "To order" cart's quantity control is now the same Amazon-style dropdown selector as the wishlist** (replaced the number input) — dropdown 1–9 + "10+" (→ free-entry input), persisting an explicit `orderQty` override. Removed the old `.pv-qty-input` + its change handler. The cart buy button reverted to a green icon-only square (the shop domain now lives in the group header); removed the `.pv-buy-host` domain label. New `pvQty` i18n.
- **Hover tooltips are now comic-style speech bubbles.** The shared `#toolInfoPop` (detail-panel action buttons — add-to-list / cart / favourite — and the ⓘ icons) gained a tail that points at the hovered control (flips up when the bubble sits below), rounder corners, bolder centred text, a pop-in animation; `_showToolInfoTip` sets `--tail-x` so the tail tracks the control even when the bubble is clamped to the viewport edge. Product-card flags moved from native `title=` to `data-tip=` so they get the bubble too. Still no native `title` tooltips.
- **Switching the top view SEGMENT resets the active search + filters.** Moving between Inventory / Favorites / Lists / Printers clears the search box and Brand/Material/Aspect/Tag/flag filters (they belong to the segment you left); switching WITHIN a segment (grid↔table↔cart) keeps them. `_clearSearchFilters` now also refreshes each filter's custom dropdown button (`sel._cselRefresh()`) so the styled `.csel-btn` label resets too.
- **The "What's New" version picker now uses the app's custom dropdown** (`_enhanceSelect`) instead of the OS-native `<select>` — same app-styled option list as the inventory filters; compact titlebar pill, list opens right-aligned so it isn't clipped by the window's rounded overflow, label refreshes when the version list is (re)populated.
- **The "Public link" share card now also shows when viewing a friend's public list** — the public snapshot link is world-readable, so a friend's public list exposes the same QR + copy-link + download + social-share card (dropped the `!ro` gate).
- **Friend-invite share link now points to `tigersystem.io/friend/<code>`** (was `cdn.tigertag.io/friend/<code>`) — the TigerHub public web landing page. All three link sites (Friends-panel share button, banner Share badge, social-share intent + QR) route through a single `_friendShareUrl()`; renamed `LIST_PUBLIC_BASE` → `PUBLIC_WEB_BASE` (shared host for `/wishlist/<token>` and `/friend/<code>`).
- **The banner "Share" badge shows the same "Copied!" flash pill as copying a SKU / EAN** (`_flashCopied`) instead of swapping its own label; `.fvb-badge--share` is now `position: relative` to anchor the flash.
- **The ❤ "Like/Love" product flag is now an "Add to cart" action** with the shopping-cart glyph — same behaviour (adds to the "To order" cart, forces min stock ≥1 via `_coupleFlags`), rebranded to match the "To order" view selector. Every `liked` render swapped `icon-heart`/`icon-heart-fill` → `icon-cart` (detail toggle, product-card toggle, illustration badge, sidebar quick-filter, bulk button); on-state conveyed via the `.active` tint. Active/badge/filter colour is cart green `#5e8e3e` (off the heart-pink and off the To-order red, which now stays only on the cart count badge). Labels reworded to the add-to-cart concept.

### Fixed

- **False "low stock" notification fired at launch even when the spool was in stock.** `_checkLowStockNotifs()` runs on every `renderInventory()`, including the initial loading pass — before the first snapshot `state.rows` is empty, so every product with a minimum counted as 0-in-stock and a persisted "low stock 0/min" notification was pushed (and stayed, since notifications aren't deleted). The check now bails while `state.invLoading` is true or `state.inventory` is null.
- **Friend / follower count didn't update live when someone added you.** `_renderFriendsEverywhere()` repainted the friends list + badge but never the header banner where the count lives, so gaining a friend/follower (e.g. auto-accept on a public account) left the number stale until an unrelated repaint. It now also calls `renderFriendBanner()` (signature-guarded).

### Removed

- **The cart "has a buy link" badge on product illustrations** — the small `prod-badge--shop` cart icon overlaid on a thumbnail whenever it had a `buyUrl` (cluttered the illustrations; the buy link still shows as the "amazon.fr"-style buy button). Dropped from `_productBadgesHTML`; removed the `.prod-badge--shop` CSS and the `reorderHasLink` i18n key.

### i18n

- Added: `listShareDownloadQr`, `pvQty`, `qrCustomizeLabel`, `qrLogoToggle`, `reorderNoLink`, `tigerPodOwnLabel`, `tigerPodOwnSub` — 9 locales.
- Removed: `reorderHasLink` — 9 locales.
- Changed: `productLike` ("Liked" → "To order"), `bulkLike` ("Love" → "To order"), `productLikeTip` (reworded to the add-to-cart concept) — 9 locales.

---

## v2.8.0 — 2026-07-12

### Added

- **Social-profile links on the account.** The edit-account panel gains a social-links editor (paste any profile URL, add/remove rows, auto-saved). Links are stored as an ordered `socials` array on the private `users/{uid}` doc and mirrored to the public `userProfiles/{uid}.socials` (both owner-write, no rules change). The brand icon is inferred from the URL host (X, Instagram, YouTube, TikTok, Facebook, LinkedIn, Twitch, Discord, GitHub, WhatsApp; globe fallback) — no fixed platform enum. A row of brand-coloured icon links renders on your own banner and a visited friend's banner, and the owner's links ride along in the public wishlist snapshot (`publicLists/{token}.ownerSocials`). New brand SVGs + `.icon-*` classes; `_socialMeta` / `_cleanSocials` / `_socialsRowHTML` helpers + `_renderSocialsEditor` / `_saveSocials` / `_wireSocialsEditor`. New `editSocialsLabel` / `editSocialsPlaceholder` i18n.
- **Friend / follower count on profiles (social proof).** Each account publishes its accepted-friends count to `userProfiles/{uid}.friendsCount`. Friendship is bidirectional, so this equals the number of people who have the account as a friend. A visited friend's banner and the add-friend preview show it; for a public account it reads "followers" (`followerCount`), otherwise "friends" (`friendCount`). Written by the owner's client when the friends list changes, and recounted + written server-side by the `autoAcceptFriendRequestForPublic` Cloud Function for public accounts (offline owner) — `_syncFriendsCountToProfile`.
- **Own account banner shows Public / Private + Share + count.** Your own header now carries the same relationship badges as a friend banner — a green **Public** or a **Private** pill so you see your own status — plus a **Share** badge that copies your invite link, and your own follower/friend count.
- **Friend-view relationship badge + shareable public link.** A visited friend's banner shows one pill next to the name: green **Public** if their inventory is public, else **Friend**. For public accounts a **Share** badge copies that person's invite link (`cdn.tigertag.io/friend/<code>`) to pass on. The visited friend's `publicKey` is read from `userProfiles` on entering the view. New `friendViewPublic` / `friendViewFriend` / `friendShareInvite` i18n; removed the unused `friendViewReadOnly` key.
- **Wishlist count pill on the "Lists" view button** — a small brand-orange badge shows how many lists you have (the friend's shared-list count in friend-view), live-updated from the lists subscription (mirrors the "To order" cart badge) — `_updateListsBadge`.

### Changed

- Split the v2.7.1 "What's New" entry into two topic-scoped items (friends' lists showing / buy-button label) — `data/whatsnew.json`.
- Re-synced `renderer/CODEMAP.md` section line ranges after the social-links additions shifted `inventory.js`.

### Fixed

- **A public friend showed as "Friend" on a cold-start quick-click.** `switchToFriendView` seeded `isPublic` from `state.friends[].isPublic` (populated asynchronously at startup, still empty on a fast click), and the follow-up `userProfiles` read updated `publicKey` / `friendsCount` / `socials` but not `isPublic`, so the banner stayed "Friend" until a manual back-and-forth. The `userProfiles` read now reconciles `isPublic` authoritatively: fixes the banner, heals the cached friend record (next click is instant), and corrects the landing view mode while still loading.
- **Public accounts' follower count was never updated (offline owner).** The count was only published by the owner's client on a friends-list change, but a public account is auto-friended server-side while offline, so its `userProfiles.friendsCount` stayed stale. The `autoAcceptFriendRequestForPublic` Cloud Function now recounts both sides (via a `count()` aggregation) and writes `friendsCount` after every auto-accept; Studio also force-publishes the count when the account is flipped to public.
- **Couldn't reorder friends while viewing a friend.** A too-broad `state.friendView` guard blocked the friends drag-reorder (sidebar chips + Friends panel) in friend-view. Reordering your own friends writes to your own account, so it's now allowed there; the cart / printers / racks reorder stays blocked (friend's read-only data).

## v2.7.1 — 2026-07-12

### Changed

- **Buy-button host label collapses subdomains to the registrable domain** — "eu.store.bambulab.com" → "bambulab.com", "www.amazon.fr" → "amazon.fr" — so long shop hostnames stay short (keeps three labels for known two-level suffixes like `.co.uk`). New `_registrableDomain` helper used by `_buyHost`.

### Fixed

- **A friend's shared lists didn't show in friend-view.** `subscribeFriendLists` ran an unconstrained `collection("lists")` query, which the security rules reject for a non-owner (it could return a `private` list), so the whole query failed and no lists appeared. It now queries `where("visibility", "!=", "private")` to match what the rule allows; the owner's `subscribeLists` backfills legacy lists missing the `visibility` field to `"friends"` so they're included. No rules change.

## v2.7.0 — 2026-07-12

### Added

- **Lists — shareable wishlists.** A new **Lists** view (segment in the view selector): create several named lists, each with an optional **occasion**, a free-text **message to viewers** (≤500 chars), and a **privacy** level. A list stores product identities (`users/{uid}/lists/{listId}`, `itemKeys` → product `keyHash`), so buy links / prices / images come from `products` for free and a list can hold a filament you don't own. Amazon-style layout: a left sidebar of lists (name + count + visibility icon) and a main column of items with a per-view **rows / grid** toggle (persisted in `tigertag.listLayout`). Add filaments to a list from the **Material card**, **Product card** and the **grouped (deck) card** via a shared "Add to a list" popup (`_openAddToListMenu`). Friends see your lists **live** in friend-view (read-only). New `subscribeLists` / `subscribeFriendLists` + CRUD (`_createList` / `_renameList` / `_deleteList` / `_addToList` / `_removeFromList`), `renderListsView`. Backend: `users/{uid}/lists/{listId}` rules block (owner / public / friend read, owner write + `hasOnly` whitelist).
- **List privacy (`visibility`): private / friends / public.** Per-list dropdown in the Manage-list panel, stored as `visibility` on the list. Backend read rule respects it: `private` = owner only, `public` = any signed-in user (+ world via the public snapshot below), `friends`/absent = friends + `isPublic` profiles. A colour-coded status badge (🔒 / 👤 / 👁) shows next to the list title and on each sidebar list; clicking it opens the edit modal.
- **Public wishlist web link (Phase 2 write side).** Setting a list to *Public* mirrors it into a world-readable top-level `publicLists/{token}` snapshot (denormalised, display-only, **no personal note**), so a visitor with **no account** can open it on the web. The token is minted + stored on the list (`publicToken`); the snapshot is kept in sync from the lists **and** products `onSnapshot` (signature-cached — only writes on real change) and deleted when the list leaves Public. The Lists view shows a right-rail **share card**: QR + "Copy link" (no raw URL) + **social share buttons** (Facebook / X / LinkedIn / WhatsApp / Email) that open each network's share intent (or a pre-filled `mailto:`). Base URL is the config const `LIST_PUBLIC_BASE = "https://tigersystem.io"` → links are `https://tigersystem.io/wishlist/<token>`; tokens are 13-char base36. Backend: world-readable `publicLists/{token}` rule (owner-only writes via `ownerUid == auth.uid` + `hasOnly`, existing-owner check on update) + `publicToken` added to the lists whitelist.
- **Public account auto-accepts friends.** A Firestore-trigger Cloud Function (`autoAcceptFriendRequestForPublic`, backend repo) accepts incoming friend requests to a public account **instantly, server-side** (owner offline OK): writes both `friends/{…}` entries, deletes the request, and notifies both sides (`friend_accepted` to the requester, `friend_added` to the owner). Studio suppresses the accept/refuse modal on a public account and renders the new `friend_added` notification.
- **Reorder friends by drag & drop.** The Friends panel rows and the sidebar friend chips are draggable; the order persists as `sortRank` on each `users/{uid}/friends/{fid}` doc and applies everywhere (panel + sidebar kept in sync, cached with the friends list).
- **"Make room" drag animation everywhere.** A shared `_wireMakeRoomDnd(host, opts)` helper: the dragged item is lifted (OS drag image follows) and the others slide (2D `translate`) to open the drop gap. Used by the wishlist items (rows + grid), the reorder cart (two zones — source closes, target opens), the **printers grid**, the **camera wall** (CSS-`order` only — live WebRTC/iframe streams keep running), the **racks** (drag from the head grip via a `handleSel` option; spools stay draggable for storage), and the friends lists. Items are ordered by on-screen position each drag, so it handles wrapping grids and CSS-`order` layouts alike.
- **Right-click context menu** on any editable field (native Cut / Copy / Paste / Select-all, plus Copy on a selection) — `main.js` (`webContents 'context-menu'`).
- **Account stock summary stored server-side.** `recordStudioState` writes the aggregate stock (`valueHt`, `weightG`, `currency`, `spools`) to a `stock` object on the shared root `users/{uid}` doc (for TigerSystem / TigerHub roll-up) as well as `telemetry/studio` (3 new whitelisted fields: `stockValueHt`, `stockWeightG`, `stockCurrency`).

### Changed

- **Buy buttons show the shop's host** (cart icon + e.g. "amazon.fr", "atome3d.com") instead of a generic "Buy", so the destination is visible before clicking. Applied across the wishlist (rows + grid), the Product card, the grouped deck buy button and the Reorder card's shop button (shared `_buyHost()`, hostname minus `www.`).
- **Header stats count-animate** (ticker/odometer roll): on app open they roll up from zero, and later changes tween from the previous value with a brief green (up) / red (down) tint. Respects `prefers-reduced-motion`. The **Stock** weight now shows 2 decimals (locale-aware).
- **Material & Product cards** now put **📋 add-to-list / ❤ like / ★ favorite** in a single right-aligned inline row between the illustration and the name (list button first; above the "Burn/Update NFC" banner on the material card).
- **Material (spool) card** shows the **price + buy link** both as a prominent "Price & buy" block and as Details rows — from the owner's product record or a friend's shared slice.
- **View selector** buttons are **icon-only** (text dropped; a custom hover bubble names each view after a 1 s dwell via a new `data-i18n-aria` attribute); each group's label sits **above** its toggle.
- **Filter dropdowns** show the **short field name** ("Brand", "Material", "Aspect", "Protocol", "Tag", printer "State") when nothing is selected, and a bare **"All" / "Toutes" / "Tous"** reset row (via `data-csel-short` in `_enhanceSelect`).
- **App-update notification is now a cloud event** (`type: "announcement"`, doc id `update-<version>`): it persists, syncs across devices, sits in the feed, opens What's New, and gets a **Restart** button only on the device where the update is downloaded.
- **Removing a wishlist item is hold-to-confirm** (row trash + grid ✕, 1200 ms) so a misclick can't silently drop a product. **Delete-list** is a compact hold-to-confirm trash icon in the modal footer.
- Detail row label `detTwin` renamed "Twin tag" → **"Dual NFC"** to match the `addProductDualLink` button (9 locales).

### Fixed

- **Friend drag order was lost when opening the Friends panel** — `loadFriendsList` rebuilt `state.friends` in Firestore doc-id order, wiping `sortRank`. It now sorts by `sortRank`, and the localStorage cache carries + re-sorts it (no pre-snapshot flash).
- **Lists view didn't hide when switching to Printers/Rack** — the printer & rack branches of both render dispatchers hid the Products view but not the newer Lists view.
- **Side-card z-index** — the Product card painted in front of the group deck (both `z 100`). Re-numbered the cascade to match `_syncPanels` order: detail (101) > container/group (100) > Product (99) > reorder (98).
- **"To order" reorder state got stuck** — un-favoriting kept the min-stock (item stuck in the cart), and a sticky `savedForLater`/`orderQty` kept a re-favorited item out of the cart. Un-favoriting (★ off) now stops reorder tracking; clearing the min (→0) clears the reorder-only fields. `_healProductReorderState` self-heals already-affected accounts on the first products snapshot.
- Changing a material's **image** now also updates its **Favorites grid/table illustration** + product card (syncs `label.imgUrl` + `cloudSeed` on the product doc).
- The header **"Stock value"** stat updates live on a price change and on the **HT↔TTC** switch; added an ⓘ bubble explaining the weight-prorated value.
- Editing a filament's **price or buy link** refreshes the open **material card live** (surgical swap of the "Price & buy" block + Details rows, media preserved).
- Long-pressing the Friends panel's `»` close tab now closes it (the hold action didn't include the Friends slide-in).

### Removed

- Ephemeral local app-update notice (superseded by the cloud notification).

## v2.6.0 — 2026-07-11

Notifications become a persistent, social-style feed (starting with low-stock alerts synced across devices), the inventory table gains an inline "Add price", and the "To order" button gets a live cart badge.

### Added

- **"Add price" in the inventory Table view.** The Price column now shows an inline **Add price** action for filaments with no price (single rows *and* group headers) that opens the product price editor straight into the input; read-only in a friend view.
- **Live cart badge on the "To order" view button** — a red bubble with the number of products currently in the active cart (below min-stock, not set aside), updated on inventory / product / order-view changes (hidden at 0, "99+" past 99).

### Changed

- **Notification centre → persistent, social-style feed (phase 1).** **Low-stock alerts are now Firestore events** (`users/{uid}/notifications`, type `low_stock`) instead of ephemeral local notices: they **persist, sync across devices, carry a time-ago, and stay in history**. One event per genuine dip below min — a per-account `localStorage` active-set re-arms on restock and prevents re-firing while still below (or on app restart). The feed is **capped at 40** (newest first), notifications are **no longer deletable**, event rows are clickable to their action, and a **"Mark all read"** button + open-marks-all-read drop the unread badge to 0 (badge = pending friend requests + unread Firestore; local device notices — community / paxx / app-update — show but don't inflate it). New `_pushNotif` helper; backend `firestore.rules` gains an owner-`create` branch for `["low_stock","community","announcement"]` (deployed). Community/announcement sources land in a later phase.
- Notification centre: material/product illustrations now render as a **rounded square** (matching the cart thumbnails) instead of a circular chip.

### Fixed

- The "Buy me a coffee" notification now uses the official cup SVG and is a proper community nudge — `"coffee"` was missing from the community set, so the entry had no yellow chip and **wasn't clickable** (couldn't open the support page). Now branded + clickable like Discord/Shop.
- Opening the Product-info card (or reorder card) while the notification centre was open no longer leaves the panel on top hiding the card — the notif centre is dismissed first, like the other right-side cards.

### Removed

- Dead `assets/svg/icons/icon_coffee.svg` (feather cup) + its `.icon-coffee` CSS — the coffee cup everywhere now uses the official brand SVG.

## v2.5.0 — 2026-07-11

The reorder list becomes a proper shopping cart (active cart + a "saved for later" shelf, drag-and-drop), filament pricing surfaces across the app (a **Stock Value** stat and a **sortable Price** column), the Add-product panel is reorganised with app-styled dropdowns, every user-facing **"RFID" becomes "NFC"**, and **"Buy me a coffee"** support lands. Plus a batch of fixes.

### Added

- **Reorder "To order" view is now a two-zone cart.** An **active cart** (products below their min-stock) plus a **"saved for later" shelf**. A non-destructive `savedForLater` flag moves a line between zones — either via a text action ("Buy later" / "Add to cart", no ambiguous icon beside the buy-cart) or by **drag-and-drop**: a grip handle reorders within a zone or drags a line across to the other, persisting a per-product `sortRank` (native HTML5 DnD). Both zones stay droppable even when empty; the payment total counts the active cart only.
- **"Stock Value" header stat card** (after "Stock" kg) — the total worth of the current stock in the account's currency: each spool valued at its product's `buyPriceHt`, prorated by remaining-weight fraction, shown in the account's HT/TTC mode.
- **Sortable "Price" column in the inventory Table view** (after Capacity), showing each spool's product price in the account's currency + HT/TTC mode ("-" when unpriced); sortable asc/desc (`sortRows` + `_sortGroupedItems` read the price off the product) with a matching "Price" option in the grid sort select.
- **"Buy me a coffee" support** at four entry points (sidebar button, Settings → About, What's New footer, and a delayed nudge after 3 days of use), using the official Buy Me a Coffee brand assets and the existing community-nudge system (per-account, Firestore-synced).

### Changed

- **Loving a product (❤) forces a minimum stock of ≥1** so it's automatically tracked for reorder and lands in the cart once out of stock. Coupled in `_coupleFlags`; never lowers an existing higher min, and the forced min is carried into the persisted patch so it survives the Firestore echo.
- **Add-product panel reorganised:** Type, Diameter, Weight and Unit are now always visible (below the Nozzle/Drying cards) instead of buried in Advanced; the duplicate advanced Type select was removed (single canonical `adpType`). The plain identity dropdowns (Type, Aspect 1/2, Diameter, Unit) now use the app-styled popup (`_enhanceSelect`) instead of the native OS menu; the "None" material and the TigerTag banner were dropped.
- **Terminology: every user-facing "RFID" is now "NFC"** (the tech is NFC/NTAG) across all 9 locales + the hardcoded UI labels; internal identifiers (i18n keys, IPC channels, Firestore fields, icons, comments) are untouched, and the `OpenRFID` firmware name is preserved verbatim.
- **Header device indicators rebranded + unified:** the NFC-reader pod hover reads **"TigerPOD not connected"**, the scale **"TigerScale not connected"**; the four header status hovers now share one bubble style with a state-coloured dot + full text.
- Windows code-signing CI now targets the rebuilt Azure Trusted Signing account (`TigerTagStudioSigning`, North Europe endpoint); signing stays a no-op until `TRUSTED_SIGNING_CERT_PROFILE` is set (pending Microsoft identity validation of 3D FRANCE).
- The "created" toast now says **TigerCloud** (matching the stats badge).

### Fixed

- Add-product: picking a bicolor/tricolor/rainbow colour mode now updates the visible **Aspect 2** dropdown in real time (the app-styled dropdown's button label wasn't refreshed after a programmatic value set; same fix for the Aspect 1 mirror).
- Add-product: the Material selector now shows **PLA** (the real default) on open instead of a stale **ABS**.
- Reorder: removing a line no longer **deletes the whole product doc** (favorite, buy link, price, SKU/EAN, min-stock) — it moves to "saved for later" instead. The destructive delete path is gone.
- macOS: closing the window with the red button now hides it (Firebase session, inventory and cameras kept alive); a Dock-click brings it straight back instead of leaving an invisible window.
- Opening the Friends panel now closes every other side card instead of stacking them underneath.

### Removed

- The TD1S status icon from the header — TigerPod and TigerScale now sit side by side (TD1S stays reachable via its panel button).
- The "RFID" banner image at the top of the Add-product side card.
- The destructive `_deleteProductByHash()` product-delete path from the reorder view.

## v2.4.0 — 2026-07-10

A read-only Product "business card" for out-of-stock favorites, an Aspect filter, épuré click-to-copy for SKU/EAN, app-styled dropdowns, and a data-model refactor: friends' favorites are now read straight from their `products` (the `productShares` projection is gone). Plus a batch of Product-info card refinements.

### Added

- **Product "business card" side card (`#productCardPanel`).** Clicking a favorite that has **no live spool** (e.g. a friend's favorite they don't stock) opens a read-only card mirroring the **Materials** side card: illustration, identity, **★/❤**, **Colours & Aspect** (56 px circle + aspect chips), a full **Weight** bar (1 kg / 100 %), **Print parameters** (nozzle / bed / drying / TD / density) and **Details** (Product ID, Type, Brand, Series, Name, Material, Diameter, SKU, Barcode) — omitting spool-only fields and all RFID/weight-edit actions. It also surfaces the material **video** + **document links** (MSDS / TDS / RoHS / REACH / food) from the seed's `LinkXXX`. Rendered from the product's **`cloudSeed`** via `normalizeRow` (`openProductCard`/`_renderProductCard`). The **★/❤ are tied to MY account** (`_toggleProductCardFlag` → `_toggleProductFlag`): they reflect/import whether *I* favorited it. Docked in `_syncPanels` to the RIGHT of the reorder card (which tucks left) and layered above it; no title bar (closed via the `»` tab). New i18n `pcNoStock`.
- **Aspect filter in the search toolbar.** A new "All aspects" selector (between Material and Version) filters by finish/aspect, matching **either Aspect 1** (Matte, Silk, Carbon…) **or Aspect 2** (Bicolor, Tricolor, Rainbow…). The list is the union of both aspect columns present (empty `-`/`None` dropped); works in grid/table/rack and the Favorites views (scoped to favorites via `label.aspect` + new `label.aspect2`), hidden in printer views. New i18n `filterAllAspects`.
- **Click-to-copy SKU & EAN in the Product-info card (no button chrome).** The read-only auto TigerTag+ ref is itself the click target (faint copy glyph on hover + floating "Copied!"); an editable ref shows a click-to-copy value plus a **single toggle button** flipping a grey edit pencil ⇄ a green ✓ (no separate input, no separate validate) — commit with Enter or the ✓, click an empty value to jump into edit. Shared `_wireRef` + `_reorderUpdateRefDisplay` + `_flashCopied`. New i18n `reorderEditRef`.
- **Click-to-copy SKU in the "To order" list.** The SKU value is the click target (hover glyph + "Copied!" flash), no persistent per-line button (`[data-copysku]` → `_flashCopied`). New i18n `copiedFlash`.
- **The "To order" ⓘ button toggles the Product-info card** (reclick on the same product closes it) and is sized 34×34 to match the cart/× actions.

### Changed

- **Friends' favorites are read DIRECTLY from their `products`.** `products` is now friend-readable (owner/public/friend, same policy as inventory & racks), so browsing a friend subscribes to their real product docs (`subscribeFriendProducts` → `state.friendProducts`) and everything — the favorites grid/table, price/buy link, the Product card, and import — reads their live doc, always in sync. Removed the entire `productShares` projection and its mirroring (`_syncProductShare`, `_backfillProductShares`, `subscribeFriendShares`). **Tradeoff (user-chosen):** the product `note` now lives in a friend-readable doc (never displayed). **Backend:** `products` read opened to owner/public/friend (deployed); `productShares` rule deprecated. Mirror docs updated (`docs/firestore-schema.md`, backend README, public integration repo).
- **Toolbar filter dropdowns + grid Sort are app-styled** (custom, not the OS-native menu). Brand / Material / Aspect / Version / Tag and the grid **Sort** (`#gridSort`) keep their `<select>` (value + populate/change logic) but are driven by a styled button + popup (`_enhanceSelect`); the label resyncs on programmatic sort (`_syncGridSort`) and language switch (`applyTranslations` refreshes every `.csel`).
- **Favorites-view filters list only what's in the favorites.** In the Products views the Brand / Material / Aspect / Tag selectors are populated from the favorites (own or the friend's, liked/favorite only) via `_favesForFilters`, not the whole inventory.
- **A friend's favorite opens the Product card first** (whether or not in stock), and the Product-info identity header **toggles** that Product card for the same product (`_openProductCardFromRow` keyed on `_productCardData.id`).
- **Cleaner Product-info (reorder) card header** — text column truncates each line cleanly, colour name gets a real swatch (`colorCircleHTML`, handles bi/tri/rainbow), the open-card chevron became a round button, 58 px thumbnail, and the separator line under the title was dropped.
- **Simpler stock line in "To order"** — "5 required · 2 in stock" → compact "Stock: 2 / 5" (new i18n `pvStockRatio`).
- **Bulk ★/❤ buttons** match the other bulk buttons (icon + label, same height).
- **Product card provenance** uses the prominent "Added from …" block (avatar + name, clickable) and shows the product's own `importedFrom` (who its owner grabbed it from), not the friend currently viewed.

### Fixed

- **Importing a friend's favorite no longer duplicates / loses provenance** — the Product card's ★/❤ stored the product WITHOUT its `cloudSeed`, so a later write from your own favorites re-derived a different keyHash (from the lossy label) and created a second, provenance-less product. It now delegates to the shared `_toggleProductFlag` (full row from `cloudSeed` → matching keyHash, cloudSeed stored, provenance stamped, price/link/SKU-EAN carried).
- **Own favorite with no spool now opens the editable Product-info card** — synthesises the row from `cloudSeed` (else label) via `_productAsRow` so price / min / note / link / tags stay editable even with no live spool.
- **Favorites Material filter lists plain materials** (not "PLA Basic") — populated from the raw material (`_faveMaterialRaw`: new `label.materialRaw`, else `cloudSeed.id_material`, else label) instead of the aspect-suffixed `label.material`.
- **Favorites grid & table show prices in the user's tax mode** — `_favePriceHTML` derives the TTC figure from the country VAT when TTC is selected (was always the stored HT).
- **Switching favorite closes a stale Product card** — `openReorderPanel` closes the Product card when it's open for a different product identity.
- **Editable SKU/EAN input no longer stays always-visible** — `[hidden]` guards on the display/editor (a `display:flex` rule had been overriding the `hidden` attribute).
- **Product-info header hover glitch** — clean full-bleed hover (`box-sizing:border-box`, margins = the body padding) instead of overflowing negative margins.

### Removed

- **`productShares` projection** and its client mirroring (superseded by direct friend-readable `products`).
- i18n keys `pvRequired`, `pvInStock` (folded into `pvStockRatio`).

### Docs

- **`docs/sidecard-zindex.md`** — reference for every right-side panel's z-index, close-tab z-index, width and docking order, the interleaved panel/tab ladder, the three stacks, the `_syncPanels` math, and a checklist for adding a new card.

## v2.3.0 — 2026-07-09

Friends can now see each other's favorites (with price + buy link), bulk-favorite spools, and manage favorites while browsing a friend — plus a sliding view-selector, a cart icon for reorder actions, and fixes.

### Added

- **Public favorites shared between friends (`productShares`).** Favoriting a product now publishes a friend-readable slice to a new `users/{uid}/productShares/{keyHash}` collection (`favorite, liked, key, label, sku, ean, buyUrl, buyPriceHt`). In a friend's view the **Favorites grid & table** show that friend's ★/❤ materials read-only (their stock via `_stockCountByKey`, price in the viewer's tax mode, clickable buy link), each material's details show the friend's price + buy link + manual SKU/EAN, and importing (favoriting) a friend's material carries those over. Because a Firestore read is all-or-nothing per doc, `/products` stays owner-only (the **note is never exposed**). Mirrored on every product write (`_syncProductShare` from `_writeProduct`/`_writeProductField`/delete; removed when no longer a favorite nor carrying price/link/code) + a one-time backfill (`_backfillProductShares`); read live via `subscribeFriendShares` → `state.friendShares`; imported via `_carryFriendShare`. **Backend:** new `productShares` rule (read owner/public/friend, write owner + field-whitelist) deployed.
- **Bulk ★ Favorite / ❤ Love.** With spools multi-selected (grid or table), two icon-only `.flag-toggle`-style buttons add or remove the flag across the whole selection at once — a real toggle keyed on the selection's aggregate state (`_bulkApplyFlag`/`_syncBulkFlagButtons`), deduped by group key. In a friend view, adding imports with provenance.
- **Multi-select in a friend's inventory.** Checkboxes + the Select button are enabled in a friend view for bulk ★/❤ only (Tags/Price/Delete hidden via `is-friendview`; `_bulkDeleteSelected` hard-guards a friend's spools). Removed the friend-view early-returns in `_enterSelectMode`/`_toggleSelectAllVisible`.
- **New masterspool:** PrintoMax 3D — Grey (195 g) in the container picker.

### Changed

- **Favorites views available inside a friend's view.** The Favorites group (Grid + Table) stays visible while browsing a friend; only "To order" is hidden there.
- **Sliding selection bubble in the view selector.** Within a segment (Inventory / Favorites / Printers) the active highlight slides between buttons (`_positionViewIndicators`, one absolutely-positioned `.view-toggle-ind` per segment, re-fit on first paint / language switch / resize).
- **Reorder actions use the cart icon.** Buy-link buttons (Product-info card, deck header, favorites grid/table, buy-link badge, toolbox reorder-buy, "To order" empty state) and the "To order" view-selector entry switch `icon-shopify` → `icon-cart`; the goodies-shop buttons keep the Shopify icon.
- **"Product info" button toggles the card** (`_toggleReorderPanel`, compared by `_spoolGroupKey`).
- **Product-info "+ Material" button** rendered as a real `.toolbox-row` (icon + label + trailing ⓘ), matching the toolbox; `_wireReorderInfoTips` swallows the ⓘ press.
- **Clicking your name in the sidebar** now runs the same identity action as the avatar (`_onSidebarIdentityClick`).

### Fixed

- **In-stock count double-counted twin pairs** — a twin pair (two chips, one physical spool) counted as 2. `_countPhysicalSpools` now collapses twins for the stock badge (`_filamentStockCount`), favorites/"To order" (`_stockCountByKey`) and the low-stock notification.
- **"Detach" button leaked into non-cam views** (incl. friend view) — `.inv-add-btn { display:inline-flex }` overrode the UA `[hidden]`; added `.inv-add-btn[hidden] { display:none }` so the attribute hides it again.

---

## v2.2.0 — 2026-07-09

Follow-up to the Products/Favorites release: friend-import provenance (with live profile resolution that survives un-friending), a reworked Product-info card, and cross-view bulk price editing.

### Added

- **Favorite provenance.** Favoriting a friend's material (from a friend view) now stamps `importedFrom {uid,name}` on the product once at import time (never overwritten) via `_toggleProductFlag`, persisted by `_writeProduct`. The Product-info card renders an "Added from" identity block: the friend's avatar + pseudo are resolved LIVE — `state.friends` first (carries the inventory key), else a direct `userProfiles/{uid}` subscription (`_subscribeImportedProfile`, world-readable to any signed-in user) so name/photo stay current **even after the friendship ends**; the stored `name` is only a last-resort frozen fallback. The block is clickable → `switchToFriendView` when still a friend or the inventory is public, otherwise inert; it greys only when even the profile is unreadable (deleted account). `_refreshReorderProvenance` swaps just the block on any friends/profile change (no panel rebuild).
- **Bulk price from the Inventory view.** The bulk bar's Price action now shows for a materials (spool) selection, not just the Products table; applying writes the price to each selected spool's product identity (deduped by `_spoolGroupKey`, created through `_writeProduct`). `_bulkEnterPriceMode`/`_bulkApplyPrice` are context-aware (`is-materials` vs `is-products`; printers excluded).
- **Sortable Favorites table.** Clicking a header (Brand · Material · Name · Stock · Min. qty · To order · Price) sorts asc/desc with the shared chevron indicator; persisted via `state.favesSortCol`/`favesSortDir` (`tigertag.sort.faves`), wired through a delegated `th[data-fsort]` handler on `#invProductsView`.
- **9 new illustration SVG icons** (`mail`, `tag`, `list-check`, `cart`, `coins`, `bug`, `filter`, `gift`, `shield-check`) with `.icon-<name>` mask classes (24×24), for wider What's New / general use.

### Changed

- **Product-info card reworked.** The material illustration is larger (64 px); the colour name moved to its own line below the material (no longer truncated inline); the ❤ Liked / ★ Favorite toggles moved into the panel header, left of the ✕ (the delegated flag handler now resolves the reorder row from the whole `#reorderPanel`). The "Create a TigerTag Cloud" button is relabelled **"+ Material"** with an ⓘ info affordance whose hover tooltip (`_wireReorderInfoTips`, delegated on `#reorderPanelBody`, reusing the toolbox tooltip) explains it adds a spool of the exact filament without an RFID chip.
- **Low-stock reorder notification** now opens the "To order" list (`setViewMode("order")`) instead of the single product's card.
- **What's New illustrations use real icon names.** The modal renders `it.icon` as a masked `.icon-<name>` and strips non-class tokens, so the emoji icons used previously silently fell back to `sparkle`; the v2.1.0 entries and every older emoji entry (🏷️🖼️🛍️👀🎨⏰🗑️ → `tag`/`image`/`shopify`/`eye-on`/`palette`/`clock`/`trash`) were remapped so each item shows its own illustration.

### Fixed

- **Renaming a rack updates the Storage view immediately.** `_rackStructureSig` didn't include the rack name, so a name-only change let the no-op slot patch skip the header rebuild while advancing the render signature; the name is now part of the signature.
- **The grouped deck no longer hides behind the printer side card.** `_syncPanels` positioned the group/container/reorder cards off the spool-detail width only; with a printer panel open but no spool detail they opened at `right:0`, behind the printer panel. They now cascade off the printer stack width (`printerW + configW`).

---

## v2.1.0 — 2026-07-09

A big release built around a new **Products / Favorites / Reorder** system: turn a filament into a long-lived product you track (min stock, buy link, price) independently of whether a physical spool is currently in your inventory. Plus bulk editing, Bambu print thumbnails, email verification at sign-up, and a stack of fixes.

### Added

- **Per-product records (`products` collection).** A new per-user `users/{uid}/products/{keyHash}` table stores, once per **product identity** (keyed by a cyrb53 hash of `_spoolGroupKey` — TigerTag+ `tt:<id>`, else `diy:brand|material|id_type|colourSig|aspects`, now including the Type so filament and resin never collide) and shared by every identical spool (surviving spool deletion): a buy link, a purchase price (**always stored tax-free**, `buyPriceHt`), a minimum stock (in spools), a free note, tags, SKU + EAN, `liked`/`favorite` flags, a display snapshot (`label` incl. product image) and a sanitized `cloudSeed` (so a TigerTag Cloud can be minted with no source spool). Owner-only Firestore rule; `_writeProduct` does a partial merge so each slice updates independently. Live-synced into `state.products` via `subscribeProducts`.
- **"Product info" side card** — per-product management (buy link, price, stock/min, note, tags, SKU/EAN, ❤/★, "Create a TigerTag Cloud"). Opens from a toolbox row in the spool detail and from a button atop the group deck; docks as a distinct 3rd card. Everything auto-saves (no Save button). The buy link is edited via a Shopify button that never shows the URL as text; the price shows in the account's HT/TTC mode and is edited inline.
- **VAT country + HT/TTC price mode** in the account modal — a country picker (`users/{uid}.vatCountry`, drives rate + currency from `data/vat-rates.json`, 30 entries) and a HT/TTC price-entry preference (`users/{uid}.priceInputMode`). Prices are stored HT; the TTC figure is derived at display time (`_vatPrices`), so changing country never rewrites the DB.
- **Favorites view** — a dedicated header group (renamed from "Products") next to Inventory, with **Grid**, **Table** and **To order** buttons (view modes `favesGrid`/`favesTable`/`order`). Favorites Grid reuses the inventory spool-card (stripped of chip-only markers, price in the footer); the Table is a spreadsheet-style view (illustration · Brand · Material · Color swatch · Name · Stock · Min. qty · To order · Price · Shop) with an always-on selection column. **To order** is a Shopify draft-order-style cart (identity on one line, editable order qty, unit/line total, a sticky Payment card on the right with Subtotal / Estimated tax / Total that follow the HT/TTC mode).
- **Bulk product editing** — the products table's selection column feeds the shared bulk bar with **Delete** (removes product records only, decoupled from spools), **Tags** (writes `products/{keyHash}.tags`) and **Price** (one HT/TTC value applied to every selected product, converted to HT). Min. qty is pencil-editable inline; "Add a price" / the greyed Shopify button open the card straight into the matching editor with the input focused.
- **Low-stock alerts** — a product whose live spool count drops below its minimum shows an amber pill on its group deck and raises a local notification (product illustration, "X/min left", chimes once, clears on restock, clickable to open the product card).
- **Bulk tag editing** from the multi-select bar (spools + printers) — a **Tags** button opens the tags modal for the whole selection; save applies the diff (added-to-all / removed-from-all, per-item extras untouched).
- **Header master checkbox** in both tables (materials + printers) — selects/deselects all currently-visible (filtered) rows, with checkmark / dash states.
- **Bambu Lab print thumbnails** — the current (or just-finished) print's plate preview now shows in the printer table and Bambu side card, fetched over FTPS + `.3mf` (ZIP) extraction (`basic-ftp` + `yauzl`), with the PASV `0.0.0.0` rewrite and a fuzzy filename match. Validated against a real A1.
- **Email verification for email/password sign-up (strict)** — sign-up now sends a verification email and does not open a session; sign-in is gated on `emailVerified` with an inline "resend" action. Google sign-in is exempt. Closes the long-standing gap where no verification email was ever sent.

### Changed

- **Inventory grid/table click opens the grouped deck first — even for a lone spool** (`_openGroupPanel(..., { keepSingletons: true })`); picking a member inside the deck opens its detail. Bulk-select clicks are unaffected.
- **Interest hierarchy ❤ Love ⊆ ★ Favorite ⊆ tracked** (`_coupleFlags`, applied in both product write paths): setting a min auto-favorites; loving auto-favorites; un-favoriting drops the Love but **preserves the min** (a mis-click must never wipe a typed threshold).
- **Products views are driven by the shared search bar + selectors** (Brand / Material / Tag / ❤); the materials-only Version filter and the redundant ★ filter are hidden there.
- **To-order prices follow the account HT/TTC mode**; the Payment card subtotal shows HT or TTC accordingly (tax math always on the HT base). The Payment card moved to the right of the list and is sticky.
- **Editing a spool's TD** now opens a dedicated "Update TD" modal that changes only the TD (never the colour), with a hold-to-confirm "Clear TD value".
- **Print preview persists when a job is finished** (not just active) across every brand.
- **Native-app feel** — the UI is no longer text-selectable (except form fields / code blocks / opted-in `.selectable`), so clicking never leaves a blue highlight.
- README refreshed to the v2 title + structure; a SemVer bump policy was documented in `CLAUDE.md`.
- The ❤/★ toggles now explain themselves on hover.

### Fixed

- A faint **dark shadow leaked onto the window's right edge** at all times — the always-in-DOM Firebase-explorer panels applied their `box-shadow` unconditionally while parked off-screen right; gated on `.open`.
- **Slot-lock padlocks no longer show when browsing a friend's Storage** (`isSlotLocked` returns false in friend view).
- Storage view's **"Auto-organize"** label now localises correctly.
- The rack view's ⓘ info tips no longer get clipped (reuse the body-appended `#toolInfoPop`).
- FlashForge open-frame printers no longer show a bogus "Door closed" badge (gated on the model's `Enclosed` feature).
- Printer table **"Ends at"** is no longer blank for Snapmaker / FlashForge (derived from the slicer estimate / firmware remaining time).
- Printer table Preview column keeps consistent padding on finished vs printing rows.
- The multi-select **Delete** button now shows a visible hold-to-confirm sweep (was red-on-red).
- Launching straight into a printer view now shows the printer filters, not the materials ones.
- GitHub Release name drops the leading `v` (`2.1.0`, not `v2.1.0`).

### Removed

- Multi-select bar slimmed to **Delete + ×** (dropped the "Clear" and "Select all" buttons; their i18n keys removed).
- The detail panel's colour circle is no longer an edit trigger (colour editing stays via TD edit / TD1S / cloud encode).

---

## v2.0.0 — 2026-07-07

Tiger Studio Manager turns **2.0** — a big round of printer-table upgrades, a proper guided flow for updating a chip, and a pile of fixes.

### Added

- **See what's printing, right in the table.** The Printers table now has a **Preview** column showing the model on the bed for whatever's currently printing — pulled live from each printer.
- **Know when the printer's free.** A new **"Ends at"** column shows the wall-clock time the current job finishes (e.g. `21:23`), so you know exactly when to come back. Click the header to sort by soonest finish.
- **Tags for your printers.** Give your printers labels the same way you tag spools — chips, autocomplete, the works — right in each printer's side card.
- **Search & filter your printers.** The search bar now works in the Printers view (name, brand, model, IP…), and the filters next to it become **Brand · State (online/offline) · Tags** so you can zero in fast.
- **Delete several at once.** A new multi-select mode lets you tick a bunch of spools — or printers — and remove them together, with a press-and-hold confirm. In the table, the tick column is always there (Shopify-style); click, shift-click a range, or Select all.

### Changed

- **Updating a chip is now guided.** Tapping "Please update RFID" opens a clear panel that shows your reader(s) waiting for the chip: place the right one and it lights up green, a wrong chip lights up red with a heads-up, and the update only runs once everything matches — no more guessing, and never a write to the wrong chip.
- **Fresh chip, straight to work.** Scan a blank TigerTag chip and the "+ Material" panel opens right away so you can set it up on the spot.

### Fixed

- **Editing a filament's colour now actually reaches the chip.** Changing a colour and hitting Update used to leave the chip on its old colour (a rescan proved it) — the new colour is now written for real, and reads back correctly.
- **Elegoo progress behaves.** The print percentage no longer jumps around between wild values mid-print — it climbs smoothly like it should.
- **"Storage location" lights up again.** Clicking a spool's storage location jumps to Storage and highlights its slot, with everything else dimmed — as it used to.
- **The "not stored" panel keeps up.** Recolour a spool that isn't in a rack and its picture refreshes immediately.
- **Snapmaker firmware guide, in your language.** The recommended-firmware setup steps for the Snapmaker U1 are now translated across all 9 languages.

### Removed

- The redundant "N selected" label in the multi-select bar — the Delete (N) button already shows the count.

---

## v1.10.31 — 2026-07-06

### Added

- **Grab some goodies.** A new Shop button — in the sidebar and at the bottom of Friends — opens the official TigerTag store in your browser: RFID makers, merch and more, to support the project. Like the GitHub / 3D Files / Discord buttons, it gives you a little heads-up once until you've had a look.
- **Tags, reworked.** Adding tags to a spool now works the way you'd expect: start typing to filter your existing tags (tick the ones you want) or create a new one on the fly, with the chips sitting neatly below. A pencil opens a full editor when you'd rather manage them all in one place.
- **Two ways to see your racks.** A new switch in Storage flips each slot between the usual colour fill (with the remaining-weight bar) and a clean **picture** view — big square tiles showing each material's illustration, or its colour, for a gallery-like overview that's easy on the eyes.
- **Little sounds when you organise.** Dropping a spool into a rack gives a crisp "snap into place"; pulling one back out to "not stored" gives a gentle downward cue.
- **Public inventories look their best.** Open a friend who's made their inventory public and you land straight on a clean picture-mode gallery of their racks.

### Changed

- **Friend view is tidier.** Viewing a friend no longer shows the Printers view switch — their printers aren't shared. It's back on your own inventory.
- **Rack swaps read better.** Drag a spool onto an occupied slot and the ⇄ swap arrow now shows on both spools that will trade places, not just the one underneath.
- **Cleaner notifications.** Printer notices (like the Snapmaker firmware alert) now show the brand's logo on its own, without the white circle around it.

### Fixed

- **Multi-colour swatches are round again.** Bicolour, tricolour and rainbow filaments were showing a broken square poking out of their colour dot — the pie / rainbow now renders as a clean circle everywhere: table, details, grid cards, groups.
- **Grouping is smarter.** Identical spools still group together, but a white, a red and a rainbow spool of the same brand and material no longer get lumped into one group.
- **The Storage view no longer flickers.** Moving spools around, adding a tag, or any background change no longer rebuilds the whole rack view or jumps it back to the top.
- **The table matches the grid.** A grouped set of spools shows as a single line in the table, just as it shows as a single card in the grid.
- **The notifications tab stays put.** Its close handle no longer briefly floats over a panel you open right after.

### Removed

- The little orange dot next to the friend you're viewing — the accent bar already shows it, and the dot sometimes got stuck on the wrong friend.

---

## v1.10.30 — 2026-07-04

### Added

- **See what a TigerTag Player unlocks.** A spool's chip actions (write, restore, erase, recycle) now always appear in its toolbox — active when the right chip is on your reader, greyed out otherwise. With no reader plugged in, clicking a greyed action shows you what a TigerTag Player would let you do. For a twin-tagged spool (two chips), those actions only light up when both chips are on readers, since they act on the pair.

### Changed

- **Tidier spool details.** The tag type (TigerTag+, TigerTag, TigerCloud) now shows as its badge at the top of the Details, instead of being repeated as plain text lower down.

### Fixed

- **Windows: readers are detected the moment you plug them in.** ACR122U / TigerPOD readers connected while the app is already open are now picked up automatically within a few seconds — no more restarting Tiger Studio to make them appear.
- **The notifications panel steps aside** when you open a spool, a printer, Friends, Settings, or any other side panel, so they never overlap.
- **Twin chips stay linked** even when you scan just one of the pair — a single-chip scan no longer breaks the pairing.
- **The material video keeps playing** when you place or lift a chip while a spool is open — the card no longer flashes or restarts the clip.
- **Scanning a spool that's already open** no longer pops a second card on top.

---

## v1.10.29 — 2026-07-03

### Added

- **Reuse your RFID chips.** Three new toolbox actions for a spool's physical chip: **Erase** reinitialises it to a fresh blank TigerTag (a TigerTag+ becomes a plain reusable TigerTag), **Recycle to NFC** wipes it back to a generic NFC tag, and **Restore TigerTag+** rewrites a backed-up TigerTag+ exactly as it was. Each is guarded to the exact chip on the reader, verifies what it wrote, and needs a press-and-hold to confirm.
- **Snapmaker firmware helper.** For the community Paxx firmware on the Snapmaker U1: the download button always points at the latest release, the printer's settings show whether it's up to date, and you get a notification — named after your printer — when a newer firmware is out. One click jumps straight to that printer.
- **Notification sounds.** A soft chime plays when something actually arrives — a friend request, a friend accepting yours, or a firmware update — never for the history that loads when you open the app. Notifications coming from a printer now show that brand's logo, the way a friend's notice shows their avatar.
- **Every tool explains itself.** Each action in a spool's toolbox now has a small ⓘ that, on hover, tells you in plain words what it does — no more guessing.
- **"Backed up" badge.** A green shield marks each TigerTag+ whose signature is safely backed up, on grid cards, thumbnails and the storage view.
- **Product ID.** A TigerTag+ detail panel now shows its on-chip product ID, as a link to the product page.

### Changed

- **Clearer rack tooltips.** Hovering a spool in a rack shows its remaining-filament bar in the usual red / orange / green, matching the rest of the app.

### Fixed

- **Twin and backup icons appear instantly** on a freshly-scanned TigerTag+, without having to close and reopen the card.
- **Chip actions update live** — toolbox actions that need a chip on the reader now appear and disappear as you place or remove the chip, while the panel stays open.
- **Honest wording** on "Remove from inventory": it's a permanent delete, and your physical chip keeps its data (erase or recycle it to reuse).

---

## v1.10.28 — 2026-06-29

### Added

- **Tags.** Label your spools with free-form tags. Add or remove them from a spool's detail panel (with autocomplete from tags you already use), filter the inventory with the new **All tags** dropdown, and find them from the search bar. A spool's tags stay in sync across both chips of a twin pair.
- **Grid view sorting.** The grid now has its own sort menu (brand, material, name, type, weight, capacity, updated) with an ascending/descending toggle — previously only the table view could sort.
- **Your chip history, kept safe.** The app now keeps a private list of every physical chip you've programmed — to count your unique chips — and backs up the repairable signature of each TigerTag+ the first time it's read.

### Changed

- **The notifications panel no longer blocks the rest of the app** — you can keep clicking around while it's open, it has a chevron to close it, and opening it tidies away any other open side panel.
- **Cleaner grouped spools in the grid** — a group now looks like a normal card with its ×N count badge, without the stacked-paper effect.
- **Clearer wording when pairing chips** — "Link a second RFID chip" instead of "Link to a twin spool", since you're linking two chips of one spool.
- **New Firebase Explorer (admin).** For debug-enabled accounts, a dedicated dark tool to browse your own Firestore data — breadcrumb navigation, clickable drill-down, readable values and a raw-JSON view.

### Fixed

- **"Show in Storage" now just highlights the spool's slot** instead of filling the search bar; clicking anywhere clears the highlight.
- **The chip list builds for everyone now**, including accounts whose inventory loads from cache (it previously skipped them).

---

## v1.10.27 — 2026-06-28

### Added

- **A nudge to join the community.** A little badge and a friendly notification invite you to join our Discord, drop a star on the project's GitHub, and discover our free 3D files on MakerWorld — each shows once, and clicking through is enough (it never nags again).

### Changed

- **The printer control panel got a visual refresh.** Cleaner, dedicated icons for the nozzle / bed / chamber temperatures, fan, homing and disable-motors, plus the Step and Speed selectors (now compact icons instead of text). All the control icons share one consistent colour.
- **Creality printers can set their print speed** from the control panel now, like the other brands.
- **Notifications are easier to read.** Each one shows an icon, a title and a one-line message, and the whole notification is clickable — no more cramped, cut-off text next to a tiny button.
- **Tidier sidebar community buttons** (GitHub / 3D Files / Discord) — same size, square when the sidebar is collapsed, with bigger logos.
- **"Spools not stored" lists empty spools last**, so the rolls you still need to rack stay at the top.

### Fixed

- **No more flash of placeholder text** in the sidebar as the app loads — labels show their final wording on the very first frame.
- **Notifications no longer cut off** — friend-request and app notifications wrap to show the full text.
- **Elegoo:** the chamber temperature no longer shows the bed icon.

---

## v1.10.26 — 2026-06-27

### Added

- **Add Anycubic cloud printers without leaving the app.** Signing in to your Anycubic account now happens right inside the add-printer panel — no separate window pops up. Once you're in, your cloud printers show up ready to add.
- **A little "welcome back" sound** when you return from a friend's inventory to your own — the upbeat counterpart to the sound you hear peeking into a friend's.

### Changed

- **The whole "Add a printer" flow is calmer and more consistent.** Pick a brand and its options dock neatly beside the list instead of replacing it; every brand now looks and behaves the same, with a tidy header carrying a Back button and a Connection tutorial. Adding a printer drops you straight onto it.
- **Anycubic: "Add from Anycubic Cloud" is the recommended, top option** when you add an Anycubic printer.
- **Sidebar footer tidy-up.** The Mobile Apps QR code sits above the GitHub / 3D Files / Discord buttons, the whole block stays pinned to the bottom, and everything keeps its size and place smoothly whether the sidebar is open or collapsed.

### Fixed

- **Anycubic's Files button is back where it belongs** — tucked next to the light in the controls, like the other printers, instead of floating off on its own.
- **No more tiny size jumps in the sidebar** — the version number, the community buttons, and the notifications bell stay the same size whether the sidebar is open or collapsed, and the avatar no longer hops around when you toggle it.
- **Buttons that are working show just a spinner now**, not a spinner next to a leftover icon.
- **Opening a friend's inventory no longer leaves a previous spool or group card hanging around** from a different view.

---

## v1.10.25 — 2026-06-26

### Added

- **See whose inventory you're viewing at a glance.** A bright bar on the left edge slides to the avatar of the view you're currently in — your own, or a friend's — so you always know where you are.
- **Little sounds when you switch.** A quick blip when you hop between your own accounts, and a softer, distinct one when you peek into a friend's inventory.

### Changed

- **Friendlier wording** across a few empty states and confirmations.
- **Clearer inventory table.** The remaining-weight bar now sits under the value with room to breathe, grouped rows highlight properly on hover again, and the sort arrow is a cleaner chevron.

### Fixed

- **Clicking the friend you're already viewing now does nothing** — it used to bounce you back to your own inventory.
- **Scanning a two-chip (twin) spool no longer opens its card twice.**
- **Grouped rows now sort by their combined weight and capacity**, so the order matches what you see.

---

## v1.10.24 — 2026-06-26

### Added

- **Invite QR code.** The Friends panel's "My code" card now shows a QR of your shareable invite link — a friend can scan it to add you.
- **A friendly nudge to add an avatar.** If you haven't set a profile avatar, a playful prompt (plus a notification) invites you to add one; both disappear the moment you do.
- **Update download progress.** The auto-update toast now shows a filling progress bar (with a rough time-left estimate) while a new version downloads.

### Changed

- **Account menu reimagined (Discord-style).** It now shows you at the top, with a hover **Switch account** fly-out listing your connected accounts, plus Edit profile, Friends and Settings. **Manage accounts** opens a redesigned dark modal where each account has a Switch button and a "…" menu to disconnect.
- **Friends panel refresh.** The friends list moved to its own companion card that opens beside the Friends panel, each friend row has a clear chevron to view their inventory, and removing a friend now asks for confirmation (showing their avatar).
- **Cleaner sidebar.** The avatar and friend chips stay the same size whether the sidebar is collapsed or expanded (no more vertical jump), stray separator lines are gone, and the community buttons are simplified to **GitHub / 3D Files / Discord**.
- **Tidier views.** Scrollbars are hidden across the Materials and Printers grids/tables, the "My printers" header is gone, and the empty-printers screen now invites you to add your first printer.
- **Live "ready to scan" indicator.** A small pulsing green dot shows when a TigerPod reader or a TigerScale is connected — the old "+ Auto Scan" button is gone (scanning is automatic).
- **Edit your avatar from the header** — hover your avatar next to your name to change it.
- Toolbar "+" button labels shortened to **Material / Device**.

### Fixed

- **Scanning a spool while viewing a friend** now returns you to your own inventory and opens the scanned spool's card.
- **Buttons no longer turn invisible (white-on-white) on hover** — fixed at the root, so every coloured button stays readable.
- **Cross-account rack safety.** Auto-organize now waits for your racks to load and never rewrites a spool whose rack is still loading — no more spools "leaving" their slots when bouncing between accounts.
- The blocked-users list now refreshes when you open the Friends panel.

---

## v1.10.23 — 2026-06-25

### Fixed

- **Switching between two signed-in accounts could knock your spools out of their racks.** If you placed spools in a rack on one account, then jumped to another account and came back, Auto-organize could mistakenly treat those spools as "not stored" and even reassign them to the wrong slots. Fixed — the app now fully resets the previous account's racks on every switch, so your storage layout stays exactly where you put it.

---

## v1.10.22 — 2026-06-25

### Changed

- **Refreshed the "empty inventory" welcome screen.** It now shows a product mockup (Studio + the TigerTag RFID app) with the headline above the image, and the wording highlights that you can scan and manage both your inventory and your 3D printers from your phone.
- **One beta install card for everyone.** The beta card now mirrors the App Store & Google Play card and carries a single universal link — scanning it sends iPhone users to TestFlight and Android users to the Android beta automatically.
- **Change your avatar straight from the header.** Hover your own avatar (top-left) and click the little edit badge to pick, crop and upload a new photo — or use the new "Add/Change photo" entry in the account menu.
- **QR codes are no longer clickable** — they're there to be scanned with your phone camera.
- The camera **"Detach"** button is now hidden when viewing a friend.

---

## v1.10.21 — 2026-06-25

### Added

### Changed

- **Auto storage and Auto unstorage merged into one "Auto-organize" toggle.** It's a single automation: new spools are auto-placed and emptied slots are auto-freed. Lock a slot to make an exception. The setting is now per-account and follows you across devices.
- **Creality fan controls are now cards with −/+ 10% steppers** (like the other printers), instead of sliders — one card per fan the printer actually has.
- **Tidier toolbar.** The view switcher (Materials / Printers) sits above the search bar in every view, and the "Spools not stored" header is more compact with hover info bubbles instead of long help text.
- **Cleaner Cam view.** The search bar and the Scan / Add-device buttons (which don't apply to the camera wall) are hidden, and "Detach" moved up next to the other actions.

### Fixed

- **Switching between accounts could empty your racks.** Bouncing between two accounts while toggling the automation could clear every spool from its rack on the account you came back to, leaving the slot locks behind. Fixed — stale background updates from the previous account are now ignored, the automation only writes to the matching account, and Auto-organize never frees a spool that's in a locked slot.
- The RFID reader indicator no longer shows a raw text key in its tooltip, and the printer table now lines up with the materials table under the search bar.

---

## v1.10.20 — 2026-06-24

### Added

- **Bambu Lab A2L** added to the printer catalog, so you can add and track the new A-series machine.

### Changed

- **"Spools not stored" is now a permanent shelf.** In Storage it's a fixed, always-visible column on the right (it no longer slides in and out as you drag) — a clear "bin" for spools that aren't in a rack. Drop a rack spool onto it to take it out of its rack; while you drag, it lights up to show it accepts the drop, and when empty it shows a "Drop a spool here" zone so it's obvious where un-stored spools go. The Storage header now stays put while the racks scroll.
- **Clearer view switcher.** The two Grid/Table button groups are now labelled **Materials** and **Printers**, so it's obvious which one switches your filament inventory and which one switches your printers.
- **Friends always open on the Materials grid.** Opening a friend — or switching between friends — now lands on their materials in Grid view instead of a leftover Storage/printer view. Your own preferred view is restored when you go back to your account.
- **Smarter automation guards.** With **Auto storage** on, a rack's "Clear all" is hidden (it would just re-scatter everything) and dropping a spool into the bin now simply turns Auto storage off so the spool actually stays there. With **Auto unstorage** on, empty (0 g) spools in the bin are locked with a lock badge and a tooltip, since they can't be stored anyway.
- The "Not stored" counter only turns orange when there's actually a backlog, the printer settings gear now toggles its panel closed, and the container picker / detail card sizing got minor polish.

---

## v1.10.19 — 2026-06-23

### Added

- **Smoother card transitions.** Switching from one spool — or one printer — to another now slides the new card in over the old one instead of swapping instantly, with the previous card frozen underneath until the new one settles. Spool cards also open scrolled to the top.

### Changed

- **Grouped view is now the default.** Identical spools are collapsed together by default. The on/off switch has moved out of the toolbar into **Settings → Data** ("Group identical spools") for anyone who prefers a flat list.
- **"Choose a container" is now a side panel** instead of a pop-up: it slides in beside the spool card, with bigger container images and the weight shown under each container type.
- **Inventory "Refresh" moved to Settings → Data** ("Resync inventory"). Your inventory already syncs live, so the manual refresh is now a discreet safety net rather than a prominent sidebar button.
- **Tidier Settings.** Cleaner buttons and hover states, emoji-free tool icons, and the Debug panel now opens neatly to the left of Settings instead of on top of it.
- **"Spools not stored" entries redesigned** to match the group panel — product image and tier badge on the left; name, material, brand, and a colour-coded weight bar on the right.

### Fixed

- **"Spools not stored" panel handle.** The chevron now follows the panel at a consistent speed however it's opened or closed, no longer lags when the panel reopens after a drag-and-drop, reliably closes the panel when clicked, and dragging a spool now grabs the whole row (with a clean square thumbnail) instead of just the image.

---

## v1.10.18 — 2026-06-22

### Added

- **Spool grouping in the Grid + a group panel.** Identical spools now also collapse in **Grid** view into one "deck" card with a count badge. Clicking a group (in Grid or Table) opens a side panel: a **dashboard overview** — a speedometer gauge of the group's remaining filament, brand, material, combined weight and spool count — above the list of the individual spools. Opening a spool from there slides its detail card in beside the panel.
- **Live group totals.** A group's weight (gauge, totals, deck card and table row) now updates in **real time** as you change a spool's weight from the slider or a connected scale.
- **Close all side panels at once.** Press and hold any panel's `»` close tab for half a second to dismiss every open side card (a vertical fill shows the progress).

### Fixed

- **Group toggle tooltip is now translated** in every language (it previously showed a raw key on first launch).

---

## v1.10.17 — 2026-06-22

### Fixed

- **Creality: fan controls now match each printer's hardware.** The live control card was showing the part-cooling, case, and side fan sliders on every Creality model, but only the enclosed K-series (K1 and K2 families) actually has all three. Open-frame printers — **Hi, Ender-3 V4, SparkX i7** — and any unidentified model now show only the **part-cooling fan**, so you no longer get sliders for fans the machine doesn't have.

---

## v1.10.16 — 2026-06-22

### Added

- **"What's New" screen.** After an update, a tidy floating window shows what's new in plain language — move it around, resize it, and browse the notes of any past version from the dropdown. Reopen it anytime from **Settings → About → "What's New"**.

### Changed

- **Cleaner, emoji-free interface.** Emojis across the app are now crisp SVG icons (or removed where they were purely decorative), for a more consistent, professional look.

### Fixed

- **Grouping now includes cloud spools.** A TigerCloud spool and a TigerTag (Maker) spool of the same filament now collapse into the same group, instead of the cloud one staying on its own.
- **The "Set Color & TD Value" dialog can be moved.** Drag it by its header to reposition it.

---

## v1.10.15 — 2026-06-21

### Added

- **Group identical spools.** The inventory **Table** can now fold identical spools into a single expandable row with a count badge — a shelf full of the same filament reads as one line instead of many. Click a group to open its spools (each still opens its own detail card); searching auto-opens matching groups. A switch in the toolbar turns grouping on/off, and your choice is remembered across your devices. TigerTag+ spools group by product; your own spools group by brand + material + colour + finish. Display-only — nothing in your data changes.
- **Update notifications.** When an app update is downloading or ready to install, you now get a notice in the notification bell — the "ready" one has a one-click **Restart** button.

### Changed

- **"Refresh from API" now updates everything.** Refreshing a TigerTag+ spool from the catalogue now also corrects its **brand, material, finish, print temperatures and colour** — not just the name, image and documents — fixing spools whose details had drifted from the catalogue. If a value stored on the physical tag changes, the spool is flagged so you know to re-write the chip.
- **Colour-coded filament gauge.** The "weight available" bar now changes colour with how much filament is left — red below 20%, orange below 50%, green above — matching the mobile app. Applied across the table, grid, groups and the spool detail panel.

### Fixed

- **No more blinking weight bar.** The weight gauge in the spool detail panel no longer pulses while you drag the slider.

---

## v1.10.14 — 2026-06-21

### Added

- **Shareable friend links.** The Friends panel has a new **"Share link"** button — it copies a link (`cdn.tigertag.io/friend/…`) you can send anywhere. When a friend opens it on their computer, Tiger Studio Manager pops to the front with the **Add-friend search already filled in** — they just press **Send request**. (A link can never add or accept anyone on its own — you always confirm.) If they don't have the app yet, the page offers a download; on a phone it shows the code to add manually.

### Fixed

- **Friend avatars show up right away.** The add-friend search preview — and a friend you just accepted — now display their real profile photo immediately, instead of only after restarting the app.
- **The notification center responds instantly.** Accepting / declining / blocking a friend request, or dismissing a notification, now clears it the moment you click instead of lingering for a second.

---

## v1.10.13 — 2026-06-19

### Added

- **Creality: live machine controls.** The Creality side panel can now drive the printer, not just monitor it. Tap a temperature to set the **nozzle, bed, or chamber** target; **jog** X/Y/Z and **home** the axes; **disable the motors**; and control the **part-cooling, case, and side fans** with 1%-precision sliders. The motion pad is hidden during an active print so a stray move can't disturb a job (temperatures stay adjustable). _Tested on a real K2 Plus._
- **Creality: filament slot selection + CFS load/unload.** Click a filament slot to select it as the active filament — it's highlighted, and **Feed** and **Unload** buttons appear that load or unload that slot through the CFS (the printer auto-heats, cuts and feeds). Slots now clearly show three states — identified (coloured), loaded-but-unidentified, and empty — and RFID-identified slots are locked from editing (the tag defines them); editing moved to a dedicated pencil button, so clicking a slot selects it instead of opening the editor.

### Fixed

- **Creality: starting a print and deleting on-printer files from the app now work** on K-series printers. These actions were silently failing; they now reach the printer correctly.

---

## v1.10.12 — 2026-06-19

### Added

- **Notification center.** A new **bell** in the sidebar (with an unread badge) gathers your incoming friend requests and updates in one place. Friend requests shown there are actionable — **Accept / Decline / Block** — and stay until you choose one, so a request is never lost. First update type: **"X accepted your friend request."**
- **Friend requests are easier to handle.** Pending requests now also appear in the **Friends panel** and the notification center (not just the popup), each showing the requester's real avatar with Accept / Decline / Block.

### Changed

- **Friends list updates live.** Accepting or removing a friend now appears **instantly for both people** without reopening the panel, and a friend's avatar / name / colour changes show up live too.
- **Friends button** now shows your **number of friends** (or a **"+"** when you have none) instead of the pending-request count — requests moved to the bell.
- **Friend request popup**: added a **close (✕)** button to dismiss it for later (the request stays pending and can be handled from the bell or Friends panel), and it now shows the requester's **real avatar immediately** — no initials flash.

---

## v1.10.11 — 2026-06-19

### Added

- **Anycubic: file management.** The Anycubic printer panel now has a **Files** button that opens a browser for the printer's stored files. Browse **on-printer storage** and a **USB stick** (the USB tab appears once a stick is detected), and — for cloud-connected printers — a **Cloud** tab listing the files you saved to Anycubic Cloud, complete with thumbnails. From any tab you can **start a print** or **delete** a file (both press-and-hold to confirm). Cloud files are shared across all your printers, so a sliced file is only printable on the model it was made for: incompatible files show which printer they belong to and their Print button is disabled (you can still delete them). Works on both LAN- and cloud-connected Anycubic printers. _(Tested on a Kobra 3 V2 and a Kobra X.)_
- **Printer brand logos.** The printer list, grid, and the "add a printer" picker now show each manufacturer's logo (Bambu Lab, Anycubic, Creality, Elegoo, FlashForge, Snapmaker).

### Changed

- **Clearer online status.** A printer's online/offline state is now a small coloured dot next to its name — pulsing green when online, flat grey when offline — in both the grid and the side panel. The old "Online / Offline" badge has been removed as redundant.
- **"Last seen" instead of "Updated".** The printers list and grid now show when each printer was last seen **online** ("just now" while connected, otherwise how long ago), and it's remembered across restarts.
- **Tables remember your sort.** The filament and printer tables now keep your last sort column and direction across restarts. By default filaments sort by **Brand** and printers by **status** (online first).
- **Printers table polish.** The printers table now has the same rounded, scrollable finish — with a pinned header — as the filament table.
- **Connection labels** now always note **"(LAN)"** for local connections (e.g. "WebSocket (LAN)", "MQTT (LAN)", "HTTP (LAN)").
- **Snapmaker setup:** updated the Paxx U1 Extended firmware link to **v1.4.1-paxx12-19** and removed the now-unnecessary `openrfid_user.cfg` configuration step.

### Fixed

- **Anycubic: fan speed and target temperatures now load on startup.** On a LAN-connected Anycubic printer the cooling fan always read 0% and the nozzle/bed targets showed blank right after launch even when they were actually set — they now appear immediately on connect.
- **File browser close button no longer cut off.** The ✕ in the file sheet header was rendered partly off the right edge of the window.
- **Bambu Lab: the filament/AMS card no longer appears empty when the printer is offline.**

---

## v1.10.10 — 2026-06-18

### Added

- **FlashForge: live monitoring & machine controls.** The FlashForge side panel now shows per-nozzle temperatures (tool-changers like the Creator 5 Pro list each tool **T1…Tn** with the active one highlighted; single-nozzle models show **E1**), plus bed and — on enclosed models — chamber, each as current/target. There's a fan strip, a door open/closed indicator, and a red error banner. You can toggle the **chamber light**, **pause / resume / stop** an active print, and open an on-board **file browser** (with thumbnails) to start a stored print. A new **printer-info button (ⓘ)** opens lifetime stats (filament used, total print time, free disk) and machine specs (model, firmware, nozzle, build volume, …). _Tested on real AD5X + Creator 5 Pro hardware._
- **FlashForge Creator 5 / 5 Pro: official colour palette.** Setting a filament slot's colour now offers only the printer's 24 built-in "Color Library" swatches — the firmware silently rejects anything else (the slot reverts to white) — so every pick is one the printer actually keeps. Other models keep the free colour picker.

### Changed

- **Bambu Lab H2-series dual nozzle.** Printers with two heads (H2C / H2D / X2D) now show **both** nozzles — tagged **R** (right) and **L** (left), with the active head highlighted — each with its own temperature you can tap to set, instead of only the active head.

### Fixed

- **Filament colour/material editor no longer opens hidden behind the printer panel.** A recent layering change had pushed the printer side-panel above the edit sheet; the sheet now sits above it again. Affects all brands (Snapmaker / Creality / Elegoo / FlashForge).

### Notes

- **FlashForge temperatures and fans are read-only** — the firmware doesn't expose a command to set them, so they're shown for monitoring only.

---

## v1.10.9 — 2026-06-18

### Added

- **Anycubic cloud camera — everywhere now.** The cloud (Agora) camera shows in the **camera wall** and the **detached camera window** too, not just the printer's side panel, and it keeps streaming through long sessions (automatic RTC-token refresh). _Thanks to [@ennisj](https://github.com/ennisj) (PR #4)._
- **Bambu Lab heated-chamber control.** On models with an actively heated chamber (X1E, the H2 series, X2D), the chamber temperature is now a setpoint you can tap to set — like the nozzle and bed. Passive-chamber models (X1C) stay read-only.

### Fixed

- **Bambu Lab AMS humidity & temperature now show for every AMS unit.** Machines with more than one AMS (e.g. the H2C, which has two) previously showed nothing; each unit's real humidity % and temperature now appear (labelled A / B / … when there are several). AMS Lite has no sensor and stays blank.

---

## v1.10.8 — 2026-06-18

### Added

- **Anycubic cloud-mode camera.** Printers connected in **cloud mode** now show their live camera in the side panel (an Agora WebRTC stream), not just LAN-connected printers. _Thanks to [@ennisj](https://github.com/ennisj) (PR #3)._

### Changed

- **Adding a printer opens its panel automatically.** Once you finish adding a printer, its side-card now opens straight away instead of leaving you on the list.
- **Closing a printer also closes its settings.** If a printer's Settings form was open, closing the printer now closes that form too — no leftover panel floating on the side.

### Fixed

- **Settings close tab no longer hidden.** With a spool card, a printer's Settings, and a printer panel all open side by side, the spool card painted over the Settings panel's close tab — the tab is now always reachable.

---

## v1.10.7 — 2026-06-17

### Added

- **Bambu Lab: full machine controls in the printer panel.** The Bambu side-card now has the same live controls as the other brands — pause / resume / stop the current print, jog the X/Y/Z axes, home any axis, toggle the chamber light, disable the motors, set nozzle and bed target temperatures (preheat while idle), choose the print-speed level (Silent / Standard / Sport / Extreme), and control the cooling fans: part-cooling, the auxiliary "assist" fan, and the chamber ("Case") fan on enclosed models such as the X1C. _Pause / resume / stop use Bambu's documented commands; the other controls rely on community-documented commands and may behave differently on some models._
- **FlashForge Creator 5 & Creator 5 Pro support.** Both models are now recognised. Network discovery and "Add by IP" read the printer's serial number automatically, and the exact model is detected on first connection so the correct name and picture appear without picking them by hand. The Creator 5 Pro is shown as a tool-changer — each of its tools (T1–T4) appears with its own filament slot and its own hotend temperature — and assigning filament to a slot works. _(Tested on real hardware.)_

### Changed

- **Bambu Lab: smoother, flicker-free live cards.** The printer card no longer rebuilds itself every time the printer sends an update — only the values that actually changed are refreshed. Editing a field (temperature, a dropdown…) is no longer interrupted when new data arrives, and the light / fan / speed buttons now react instantly.
- **Printer settings open beside the printer card.** Opening a printer's settings (gear) now slides the form in next to the printer panel instead of hidden behind it, without dimming the rest of the app, and it has the same `»` close tab as the other side-cards. Switching to another printer closes a leftover settings form.

### Fixed

- **Bambu Lab: correct AMS humidity & temperature.** The A1's AMS Lite has no humidity/temperature sensor, so it no longer shows made-up values. On AMS units that do have a sensor (AMS HT, AMS 2 Pro), humidity now shows the real percentage instead of the internal 1–5 dryness grade, and the temperature is shown as a whole number.
- **FlashForge: newer models are no longer dropped during discovery.** Printers that don't reveal their identity to the first probe (e.g. Creator 5) now appear in the scan and can be set up via "Add by IP".
- **FlashForge Creator 5 Pro: filament slots no longer disappear,** and the enclosure ("Case") temperature now uses the correct icon. Fixed the Creator 5 Pro catalog image.

### Notes

- **FlashForge Creator 5 / 5 Pro filament colour** follows the printer's built-in colour palette: a colour outside the manufacturer's official set is rejected by the firmware (it reverts to white). This is a printer-side constraint, not an app issue.

---

## v1.10.6 — 2026-06-17

### Changed

- **Spool and printer side-cards no longer dim the screen.** Opening a spool's or printer's detail card used to drop a dark overlay behind it that you had to dismiss first. Now the list stays fully usable — click another spool or printer and the card switches in place, no close-then-reselect. Each card has a clear orange `»` tab on its left edge to close it, and the tab slides in and out attached to the card instead of popping into place.
- **Spool and printer cards can now sit side by side.** Open a spool's card and a printer's card at the same time and the printer keeps the right edge while the spool card tucks in just to its left (passing neatly behind it), instead of one replacing the other — groundwork for dragging a spool straight onto a printer slot.

### Fixed

- **Buttons no longer jump down when clicked.** Some buttons — most visibly the show/hide-password eye — shifted downward on press. Fixed everywhere.
- **Spool card's close tab now slides behind the printer card.** When both cards were open and you closed the spool card, its orange `»` tab briefly swept in front of the printer card instead of behind it like the card itself. Fixed.

---

## v1.10.5 — 2026-06-16

### Added

- **Anycubic Kobra X: live camera now works (LAN).** The Kobra X's camera is now supported over the local network, reusing the same video pipeline as the Kobra 3 V2 — it was previously left off because the Kobra X advertises its stream differently. _Thanks to [@ennisj](https://github.com/ennisj) (PR #2)._

---

## v1.10.4 — 2026-06-16

### Added

- **Anycubic: printer error alerts.** When the printer refuses a command (for example "Home the axis before moving" if you jog before homing), an alert now pops up with the printer's message and error code, so you know why nothing happened.

### Fixed

- **Anycubic (cloud): the fan, temperatures and speed mode now work at any time** — not only while a print is running. They were previously sent in a way the printer only applied to an active job, so at idle nothing happened. They now use the same realtime channel as the official slicer.
- **Anycubic (cloud): the light now turns on the right LED.** It was toggling the camera light (which the printer rejects); it now controls the chamber/part light.
- **Anycubic: editing a nozzle/bed temperature is fixed.** The input no longer errors out, and clicking away now applies the value (Escape still cancels).

---

## v1.10.3 — 2026-06-16

### Fixed

- **Bambu Lab: adding a printer by IP now works reliably.** Typing your printer's IP could fail with "No reply from …" even when the printer was online and reachable — the check gave up too quickly before the printer finished answering. It now waits long enough, and it also fills in the serial number and detects the model automatically, so you only need to enter the Access Code.

---

## v1.10.2 — 2026-06-16

### Changed

- **Bambu Lab camera is smoother and more responsive** on RTSP models (X1C, X1E, P2S, H2x…). The live view now runs at 30 fps instead of 5 and starts almost instantly — the several-second delay before the first image is gone.

### Fixed

- **Bambu Lab camera no longer gets stuck on a black screen / spinner** on A1, A1 Mini, P1P and P1S. It now reconnects on its own after a printer reboot, a Wi-Fi drop or a slow start, and gives up quickly (a few seconds instead of up to a minute) when the camera port is blocked or unreachable.
- **Bambu Lab: the camera stays off when you disable it on the printer.** If you turn the LAN camera off from the printer's own screen, the app no longer keeps trying to open it.
- **Anycubic: setting a nozzle or bed temperature no longer closes the input.** The value field used to close every time the printer sent a status update; it now stays open while you type.
- **Anycubic (cloud): the job preview thumbnail no longer flickers.** It no longer reloads on every refresh — the preview stays steady.
- **Printer Table view: print progress, status and "Updated" now refresh live.** The table used to stay frozen until you clicked Refresh; each row now updates on its own (progress %, remaining time, online status). Affects Bambu Lab, Creality, FlashForge and Snapmaker.

---

## v1.10.1 — 2026-06-16

### Added

- **Anycubic control panel now works in cloud mode too.** Homing, jogging, disabling the motors, the light, nozzle/bed temperatures, the fan, the speed mode and pause/resume/stop now reach cloud-connected printers (they previously only worked over the local network). Temperature, fan, speed and pause/stop apply to the printer's **active job**, so use them while a print is running.

### Fixed

- **Anycubic: editing a filament slot no longer flickers.** When changing a slot's material or colour, the square briefly flashed back to the old value before settling on the new one. It now switches once, cleanly.

---

## v1.10.0 — 2026-06-15

### Added

- **Anycubic cloud mode now works everywhere — including macOS and Linux.** Adding a cloud printer used to need a Windows-only trick (running the slicer in a special debug mode); now you just click **Sign in to Anycubic Cloud**, log in on Anycubic's own page in a pop-up window, and your cloud printers appear. Once added, a cloud printer shows live status, print progress and layers, **nozzle & bed temperatures**, the ACE filament slots, and — while printing — a **preview thumbnail of the actual job**. Your password is never seen by the app (you sign in on Anycubic's page) and only the session token is kept.

### Fixed

- **Anycubic (cloud): no longer stuck on "Idle" at the start of a print.** While the printer was auto-levelling before the first layer, the card wrongly showed "Idle"; it now shows "Preparing" until printing begins.

> ℹ️ The live **camera** is not available over the cloud — Anycubic gated their video service behind a newer slicer ("Video service upgraded. Update the slicer to enable.").

---

## v1.9.0 — 2026-06-15

### Added

- **Anycubic printers are now supported** — the 6th brand, alongside Bambu Lab, Creality, Elegoo, FlashForge and Snapmaker. Connect over your local network **or** through Anycubic's cloud (a mixed fleet works in one list), see the ACE multi-colour box and its slots, set a slot's filament (type + colour), and follow live job and temperature info — plus a camera feed on models that expose a local stream. Catalog: Kobra 3 / 3 Combo / 3 V2 / 3 Max / S1 / X. The Anycubic integration was contributed by **[@ennisj](https://github.com/ennisj)** (John Ennis) — huge thanks 🙌 — and extended into the full control panel below.

- **Anycubic live control panel** — drive a connected Anycubic printer straight from its side card, like Snapmaker and Elegoo: home the axes (XYZ / XY / Z) or disable the motors to move them by hand, jog X/Y/Z by 1 / 10 / 50 mm, set the nozzle and bed targets, toggle the light, control the part-cooling fan, and choose the print-speed mode (Silent / Standard / Sport). Every icon button shows an instant hover bubble that mirrors Anycubic Slicer's own wording.

- **Anycubic filament management.** Each ACE slot now reflects its real state: a present spool keeps its colour, while an empty (not-mounted) slot shows a grey “?” with the colour kept as an outline so it stays recognisable, and the material name still shows underneath. From a slot you can **Load**, **Unload** or **Stop** the filament feed — and each action is enabled only when it applies (Unload only for the spool currently in the extruder, Load only when a spool is present). The E1–E4 slots now span the full width of the card. Editing a slot no longer makes the filament card flash — it stays in place and updates only when the printer reports the change.

---

## v1.8.28 — 2026-06-14

### Fixed

- **Bambu Lab camera: smoother, lower-latency video.** The camera stream now carries frames as raw binary instead of Base64 text — that removes image-encoding work from the app's main thread (which also handles the printer connection) and shrinks the data passed around internally, so the picture updates faster and stutters less. Most noticeable on the RTSP models (X1, H2, P2S…). Builds on the frame-smoothing already added in v1.8.27.

---

## v1.8.27 — 2026-06-14

### Added

- **Locked storage slots now have two clear states.** Locking an *empty* slot marks it as unusable — it gets a grey hatched look and is removed from the rack's available capacity (so `130/198` becomes `130/197`). Locking a *filled* slot pins the material in place — it keeps the spool's colour with an amber lock badge, and is protected from moving and from "Clear all", without changing the slot count.

### Fixed

- **Bambu Lab camera: fewer micro-freezes.** Camera frames are now coalesced to one repaint per frame instead of piling up when the app is busy, which removes the stutter bursts on the printer camera view (P2S, H2C, X1 and the rest of the RTSP range, plus the JPEG models).

---

## v1.8.26 — 2026-06-13

### Added

- **Two new spool containers** in the container picker: **Anycubic** masterspool (Black, 218 g) and **DEEPLEE** cardboard spool (Standard, 143 g).

### Changed

- **Internal:** anonymous usage statistics now track spool-lifecycle counts over time (how many TigerCloud / TigerTag / TigerTag+ spools are created, and conversions between them). No personal data, no IP geolocation — same privacy-preserving, aggregate approach as before. No user-facing changes.

---

## v1.8.25 — 2026-06-13

### Fixed

- **Encoding a custom or third-party spool no longer resets it on the next scan.** When you wrote a tag for a custom spool — or a spool from another manufacturer — and then read it again, the spool reverted to the generic cardboard container and its weight changed back to the value stored on the chip. The app now keeps the container and the weight you set when you re-read an encoded tag.

---

## v1.8.24 — 2026-06-12

### Changed

- **The app now opens already populated — like Discord or Slack.** On launch, your inventory, your friends and your avatar appear in the very first frame, painted instantly from the previous session's local cache; the live data from the server then merges on top silently, repainting only what actually changed. Before, the window waited on the network — the inventory showed a spinner until the server replied, and the friends list popped in late. Product thumbnails are now served from a local on-disk cache too, so they no longer re-download on every launch.
- **New launch splash screen.** A small TigerTag splash with the logo and the app version shows the instant you open the app, and the main window only appears once it's ready to display fully — no more watching the interface assemble itself piece by piece.
- **Your sidebar friends list now scrolls** when you have more friends than fit on screen, with no visible scrollbar (Discord-style). The avatar, the Refresh / Friends buttons and the community footer stay fixed in place.

### Fixed

- **No more flickering avatars on launch.** Your avatar in the inventory header and your friends' avatars in the sidebar used to flash / reload 2–3 times on every cold start. They now paint once and stay put.
- **No more "loading shine" sweeping across every image.** A shimmer animation used to glide left-to-right over every image while it loaded (avatars, inventory, printers). Since images now load instantly from the local cache, that effect was removed — images simply appear.
- **Your initials can no longer show behind or beside your avatar photo,** and the "+" sign-in badge can no longer leak next to your initials. The avatar now always shows exactly one of: the "+" (signed out), your initials (no photo), or your photo — never a mix.

---

## v1.8.23 — 2026-06-12

### Fixed

- **No more flicker on app open — your avatar (and your friends' avatars) now appear in the very first frame.** Previously the sidebar avatar went through "empty circle → wrong letter from your email → real letter from your name → photo" on every cold start, and the friends list in the sidebar dropdown showed up empty until Firestore round-tripped. Now the app paints the cached state (your photo, your name initials, your friends with their photos and colours) instantly from local storage, and only repaints if Firestore returns something genuinely different. Same approach Discord and Slack use.
- **No more "B" or random wrong letter in your avatar circle.** Before this fix, until Firestore loaded your display name, the avatar fell back to the first letter of your email address — so for `benoit@…` the sidebar briefly showed a "B" in your colour, then jumped to your real "OM" (or whatever your initials are). The avatar now waits silently — gradient only, no letter — until your real display name is known. Cleaner and faster.
- **No more Google placeholder photo overwriting your custom avatar.** A long-standing bug was overwriting your uploaded avatar with Google's auto-generated profile picture (the "letter on coloured circle" you see when a Google account has no photo) on every sign-in. If you saw a stranger letter / colour combination instead of your uploaded photo, this is fixed; a one-time cleanup runs the next time the app opens for affected users.
- **No more "+" badge bleeding next to your initials.** A CSS specificity bug was causing the "sign in" plus-icon to show next to your initials in the sidebar avatar when you were already signed in.
- **Avatar upload on Windows 10 now opens the crop modal reliably.** A race between the file-picker's `focus` and `change` events on Windows 10's I/O scheduler was silently resolving the picker with no file, so the crop modal never opened and the upload silently failed. Switched to the modern `cancel` event for dismiss detection (kept the `focus` listener with a longer grace window as a backstop). macOS and Windows 11 were never affected.

### Changed

- **Avatar rendering centralised.** All eight places in the UI that show a coloured-circle avatar (sidebar, the "OM" header chip, dropdown, profile-management modal, edit-account modal, sidebar friend chips, friends panel, friend-view header) now go through a single rendering pipeline. The visible result: every avatar everywhere matches what's in your account exactly, with no inconsistencies between the same avatar in two places.
- **Friend chips now use a proper gradient,** matching the look of your own avatar (instead of a flat colour) — cosmetic-only, no behavioural change.

---

## v1.8.22 — 2026-06-11

### Added

- **Custom profile picture — upload your own avatar.** The colour-circle + initials avatar everywhere in Studio (sidebar, top "OM" header chip, edit-account modal, account dropdown, profiles modal, friends list, friends panel, friend banner when previewing a friend's inventory) now shows your uploaded photo when you set one. The edit flow lives in the edit-account modal: hover the avatar circle to see an edit pen overlay, click to open a menu with **Change avatar** and **Remove avatar** — same UX as Discord. Picking a file opens a dedicated "Edit image" modal with a circular preview where you can **zoom (1×–3×), rotate by 90°, and drag-to-pan** the source image until the framing is right, then Apply. The cropper auto-picks the best format on Apply: photos go out as JPEG ~30–50 KB, transparent memojis / illustrations go out as PNG that preserves the source's transparent areas (so the avatar's coloured gradient bleeds through, just like Slack and Discord). Removing the photo reverts to the legacy colour circle + your initials. Visible to your friends and to anyone previewing your friend code before sending a request (consistent with how your display name is already shown in that flow). Server-side cap at 500 KB rejects raw multi-megabyte phone photos.

---

## v1.8.21 — 2026-06-11

### Fixed

- **No more flashes or disappearing grid on the built-in Retina display.** On a MacBook's built-in Retina screen in full-screen, opening a spool side card used to make the grid flicker, lose its cards, or leave the side card as a blank rectangle — every interaction in the inventory area would trigger another wave of flashes. The cause was Chromium's compositor running out of tile memory while painting the dense grid + side panel + overlays at 2× pixel density (external monitors at 1× density never tripped the limit). The app now requests a 1 GB compositor budget from the GPU on launch, eight times the default — flashes disappear and the side card opens cleanly over an intact grid. No change for users on external monitors, on Windows, or on Linux; they were already fine.

---

## v1.8.20 — 2026-06-10

### Added

- **Open the connection tutorial straight from the printer settings.** The pencil/configure panel for a Bambu Lab, FlashForge or Elegoo printer now has a "📖 Tutoriel de connexion" button at the top — for the moment you realise you skipped the tutorial during the scan and still need to find the access code or flip LAN-only mode. The tutorial that opens follows whichever model you have selected in the dropdown, so changing from "X1 Carbon" to "P1S" to "A1 mini" walks you through three different procedures.
- **Scan results show the printer photo.** A FlashForge tile in the scan results now shows the printer's product photo on the left, like the mobile app — easier to recognise your AD5X vs your 5M Pro at a glance.

### Changed

- **One shared "extra subnets" list across every brand, synced to your account.** The Power-user "Autres réseaux à scanner" widget that appeared inside Snapmaker, Creality, Elegoo and FlashForge now also appears in Bambu Lab, and the list is the **same one** everywhere — declared once, honoured by every scan. The list is saved in your Firebase account so it's there on any device you sign in to. Existing entries from the four old per-brand stores are merged automatically on first launch.

### Fixed

- **FlashForge LAN scan finds printers on routed subnets again.** If your FlashForge sits on a different /24 than your Mac (typical multi-VLAN home network), Studio now finds it the same way the mobile app does. Three small fixes stack: the probe now talks to the printer's TCP `~M115` identity endpoint as a fallback when the HTTP probe returns the firmware's "SN is different" placeholder; the per-host timeout for user-declared subnets jumped from 350 ms to 900 ms (cross-VLAN RTT was clipping replies); and the per-subnet sweep is back to a sensible 16-probe parallelism instead of the over-engineered 4-with-50ms-gap that made a single /24 take 25 s. Live-tested against an AD5X at `192.168.20.141`: now found in seconds.
- **Connection tutorial in the printer settings now follows the selected model.** Was always opening the same tutorial regardless of the model dropdown — most visible on Bambu Lab where 11 models share 3 different tutorials.

---

## v1.8.19 — 2026-06-09

### Added

- **Printer connection tutorials, brought over from the mobile app.** Connecting a Bambu Lab — LAN-only mode, developer mode, IP + serial + access code — takes seven steps and a lot of context. The mobile app already walked users through it; the desktop app now does too. Open the Add Printer panel, and any brand with a tutorial (Bambu Lab, FlashForge, Elegoo) shows a "📖 Tutoriel de connexion" pill on its card. Click it and pick your model from the visual grid (A1 mini, A1, P1P, P1S, P2S, X1 Carbon, X1E, H2S, H2D, H2D Pro, H2C — sorted entry-level → flagship) — Studio matches your model to the right step series, walks you through each step with a screenshot and a one-sentence explanation, and lets you navigate with Prev/Next, the dots, or the arrow keys. Localised in all nine languages.

### Changed

- **Printer table sorts by status by default.** Open the Printers view as Tableau and the connected printers come up first, offline ones at the bottom. Click any column header to sort differently, like before.
- **Cleaner printer cards.** Removed the grey rectangle behind the printer photo in the Printers Grille view — the photo now sits directly on the card.

---

## v1.8.18 — 2026-06-08

### Fixed

- **Auto-update is now more robust against transient GitHub outages.** The app was hitting GitHub with the old project URL (`TigerTag_Studio_Manager`, with underscores) and relying on GitHub to silently redirect to the canonical URL (`TigerTag-Studio-Manager`, with hyphens). Every check therefore made two round-trips instead of one — and any GitHub edge hiccup on the redirect aborted the whole update check. The app now talks to the canonical URL directly, halving the requests and removing a frequent failure surface. Same fix applied to the "GitHub" buttons in the sidebar and the About dialog.

---

## v1.8.17 — 2026-06-08

### Added

- **New "Balance" weight input mode for kitchen-scale users.** Open the spool detail panel, click the pencil next to the weight, and a small **Net / Balance** toggle now sits next to the ✓/✕ buttons. In Balance mode you type the value your scale shows (filament + container); Studio subtracts the container weight automatically and writes the net to the cloud — no mental math. Hovering the Balance pill shows the live conversion ("= 736 g net (contenant : 165 g)") and the math updates as you type. The chosen mode is remembered across sessions, and you can never type a value that exceeds the spool's capacity: the input is hard-clamped at the spool's max (Net) or the spool's max + container (Balance), on every keystroke.

### Changed

- **Saving a weight no longer reloads the side panel.** Editing the weight from the slider or the manual input used to flash the product image, the "Mettre à jour le RFID" banner, the TigerTag SVG badges, and every other icon for a fraction of a second because the panel rebuilt itself after every save. The visible state now updates in place and the rest of the panel stays exactly where it was.
- **The verbose green save toast is gone.** Instead of "✓ N g disponibles (G g − C g contenant) · jumeau mis à jour" sitting under the weight bar for a full second, a small green check now pops to the right of the "POIDS" section title and gently fades out. The new value is already on the slider and in the displayed number — the math doesn't need to be spelled out every time.
- **The weight slider waits for you to actually release before saving to the cloud.** Pausing mid-drag for half a second (still holding the slider) used to burn a Firestore write at every pause; now the write only fires once you release the thumb, and re-grabbing the slider within 500 ms cancels the pending request. Fewer cloud writes, less risk of overwriting an in-progress edit from another device.
- **If someone else edits the same spool while you're dragging, the server wins.** If your phone — or another logged-in device — updates the weight on the same spool while you have the desktop slider held down, the slider now releases your grip and snaps to the value that just arrived from the cloud (and your pending save is cancelled). The display, the fill bar, and the slider thumb all line up on the new value instead of fighting each other.
- **Container card layout — the container name now sits in the same column as "Customizable" and the weight in grams**, beside the container thumbnail, instead of sitting on its own line above the card.

### Fixed

- **The "X g — hors plage" error toast can no longer get stuck under the weight bar.** Trying to type a value larger than the spool's capacity used to flash a red error message that had no auto-dismiss and just sat there until you reopened the panel. The input is now clamped at the spool's maximum on the fly — type "9999" on a 1 kg spool and the field sticks at "1000" (or "1165" in Balance mode if your container weighs 165 g). The error toast is gone for good.
- **The manual-edit input is no longer silently overwritten while you're typing.** Opening the pencil, typing "234", and having the mobile app or another device push an edit to the same spool used to silently replace your "234" with the server's value mid-keystroke; pressing ✓ would then submit the wrong number. The input now keeps what you typed until you confirm or cancel.
- **The slider thumb no longer jumps out from under your finger.** A remote weight update arriving mid-drag used to make the thumb snap to the server's value while you were still pressing it.
- **The "Mise à jour" date in the side panel now refreshes after a weight save** instead of showing an old timestamp until the next unrelated change.

---

## v1.8.16 — 2026-06-03

### Fixed

- **Spool detail side panel no longer flashes when something else changes in Firestore.** Editing a different spool — from the mobile app, from another device, or even just a write echo coming back — used to tear down and rebuild the entire side panel, flashing the product photo and every SVG icon (badges, twin link, chip status). The panel now compares the displayed spool against the last render and skips the rebuild when the visible fields haven't changed. Editing the open spool's own weight still triggers one rebuild instead of two or three, because the server-commit echo carries the same signature as the pending-write update and is now ignored.

---

## v1.8.15 — 2026-06-03

### Changed

- **Cold start is now instant from cache.** Tiger Studio now stores every Firestore snapshot in a local IndexedDB cache, so on the next launch your inventory, racks and printers appear immediately — even before the network round-trip completes — and the app stays usable when offline. Only the actual changes since your last session hit the network, which also drops your Firebase read bill close to zero on repeat boots.
- **Product thumbnails no longer flash on view switches.** Cached product images are now served as proper HTTP responses from the local app server instead of being inlined as base64 data URLs. The browser keeps the decoded bitmap alive across DOM operations, so clicking Grid, opening the detail panel, or any Firestore push no longer makes every thumbnail blink while the GPU re-decodes it.

---

## v1.8.14 — 2026-06-03

### Fixed

- **Filaments Grid and Table views no longer flash when one spool changes.** Editing a single field on a spool — moving the weight slider, picking a container, linking a twin, changing the color — used to flash the whole Filaments view because every card or row was destroyed and rebuilt from scratch on every Firestore push. Now only the spool that actually changed is touched, the product image of every other spool stays exactly where it was, and even the affected card keeps its product image intact (only the value that changed is updated). The visible flash on save is gone.
- **Printer Grid view: the per-printer job block (state pill, progress bar, filename) stops rebuilding on every brand poll tick when nothing actually changed.** FlashForge polls every 2 seconds, Bambu every 5, Elegoo every 10 — and the job block was being destroyed and re-created on every one of those, even when the printer was idle or offline. Now the block is only touched when state, progress, remaining time or filename actually changes — eliminating the residual micro-flash on the printer card.

---

## v1.8.13 — 2026-06-02

### Fixed

- **Filaments Grid and Table views no longer flash on every search keystroke.** Typing in the search bar with the Filaments view open (in Grid mode or Table mode) used to flash the whole view at every letter — every spool card or row was destroyed and rebuilt from scratch, and every `<img>` had to be re-decoded by the browser. The search now toggles a `.hidden` class on the existing cards / rows instead, so the images stay put and the filter feels instant. The same instant behaviour now also applies to the Brand / Material / Version dropdown filters and to the TigerTag / TigerTag+ / TigerCloud stat tiles.
- **Printer Grid view no longer refreshes constantly when printers are offline.** Every printer reconnect retry (every 2 to 30 seconds, per printer) used to rebuild the whole printer grid — every card image was destroyed and re-decoded, producing a visible refresh flash several times per minute on a 10-printer setup. The grid now updates only the small "online / offline" badge inside each card and leaves the rest of the card alone; the full rebuild only happens when a card actually needs to move between the "Connected" and "Offline" sections.

---

## v1.8.12 — 2026-05-31

### Fixed

- **Storage view no longer flashes on every search keystroke or rack hover.** Typing in the search bar with the Storage view open used to flash the whole grid at every letter, and sweeping the mouse between racks that both contained search matches produced a visible flash too — most noticeably on large inventories like a friend's read-only view. Both issues are now gone. The root causes were CSS animations on properties that force a per-frame GPU repaint (the orange "match" ring pulse), a hover-triggered reflow that decaled every match-slot by 14 px (the column-number coords row used to expand from 0 to 14 px on rack hover), and a full DOM rebuild of all rack slots on every keystroke. Side effect: each rack reserves a small space above the first shelf for the column-number coords in permanence (they still only become visible when you hover the rack), so racks are ever-so-slightly taller than before.

---

## v1.8.11 — 2026-05-31

### Added

- **Contextual "+ Add Rack" inside the "Spools not stored" side panel.** When you have more unstored spools than free slots — i.e. you actually need more rack capacity — an orange-accented CTA appears right inside the side panel with a short explanation. Hidden when there's still room to drag spools into existing racks, so it doesn't pollute the panel when it isn't needed.

### Changed

- **"+ Add Rack" moved into the main header.** The small "+ New Rack" tile that lived inside the rack stats bar is gone — the standard header "Add" button (which says "Add Product" in inventory views and "Add Device" in printer views) now says **"Add Rack"** when you're in Storage, and clicking it opens the new-rack modal. One consistent place to add things, whichever view you're in. The empty-state CTA when you have zero racks is unchanged.

### Fixed

- **Storage stats no longer count ghost spools.** Both the global header (filled / total slots, free) and the per-rack header (filled/total) used to include any spool that still had a rackId set — even if the rack had been deleted or the spool's level/position were out of bounds. That allowed the filled count to exceed total capacity (e.g. "130/117 slots", "0 free") and per-rack numbers to be larger than what was actually visible in the slots. Stats now require the rackId to match a current rack and the level/position to fall inside its grid, so the numbers always match what you see.
- **Deleting a rack now fully unassigns the spools that were inside it.** The old code only nulled the new-style `rack` field, leaving the legacy flat `rack_id` / `level` / `position` fields intact — so the spool stayed ghost-assigned to a rack that no longer existed and silently inflated the storage stats. Both shapes are now cleared on rack deletion. Pre-existing orphans from older deletions are also auto-cleaned the first time you open the Storage view, and they show up in **"Spools not stored"** in the meantime so you can see and re-assign them immediately.
- **Cam view empty state was showing raw key names** ("camWallEmptyTitle" / "camWallEmptySub") instead of localized text after switching back and forth between Cam and Printer Grid. The two missing translations were added across all 9 locales — the empty state now reads "No cameras online — Add a printer with a camera to see live feeds here." in English (and the equivalent in every other language).

---

## v1.8.10 — 2026-05-30

### Added

- **Bambu Lab and Elegoo printers now show up in the network scan.** *Add printer → Bambu Lab → Scan network* discovers Bambu printers via SSDP — they announce themselves on the LAN, no setup needed. *Add printer → Elegoo → Scan network* discovers Elegoo printers (Centauri Carbon 2 and later) by sending a quick UDP probe to every host on your local subnets. Each scan offers one-click add with the serial number, model, IP and name already filled in. There's also a manual *Enter IP address* path and an inline *Add by IP* shortcut for printers the scan can't reach directly; the common Elegoo subnets (192.168.1.x, 192.168.40.x) are always scanned, and any extra subnets you add persist across a *Restart scan*. With Creality, Snapmaker and FlashForge already shipping discovery, every supported brand now has it.
- **Storage view: the hover tooltip on a rack slot now shows the spool's material image** as a full-height left column (for TigerTag+ spools that have a product photo). The bubble keeps everything that was already there — brand, material, color, weight bar, coordinate, lock indicator — on the right. Falls back to the previous single-column layout when no image is available.

### Changed

- **Printers are reported online only once the connection is really established** — i.e. after the first real frame/report/heartbeat arrives — not the instant the network socket opens. Previously Snapmaker and Creality flipped to "online" the moment the WebSocket connected, and Bambu / Elegoo the moment the MQTT broker accepted them, even before the printer itself had answered. Now every brand waits for real data first, so a printer that's reachable but not yet responding stays "offline" exactly as you'd expect. Elegoo printers in "connecting" state are also correctly shown offline instead of "checking", in line with the other brands.
- **Elegoo: the MQTT credential field is now required and properly named.** What used to be labelled "MQTT password (optional)" in *Printer Settings → Elegoo* is now **"Access code"** and is required — matching the label the printer itself uses on its network settings screen. The hint tells you where to find it (factory default is still `123456`).
- **Cleaner Printer Settings form.** The small-caps "Credentials" section header and the horizontal divider line between sections are gone across all brands. The form now reads as one continuous block of connection fields instead of looking like several separate cards stacked on each other.
- **Read-only mode in a friend's inventory hides the write-action buttons.** The *+ Scan* and *Add* buttons no longer appear when you're viewing a friend's inventory — they can't act on someone else's collection anyway. They reappear automatically when you return to your own view.
- **Header backend-health indicator** uses a new 3D cloud icon design (the other cloud icons elsewhere in the app are unchanged).

### Fixed

- **RFID rescan no longer erases your spool data, and the chip weight now syncs automatically to the database value.** Re-scanning a spool used to silently wipe every Firestore field that wasn't on the chip — container assignment, custom note, capacity, etc. — and replace the current weight with whatever the chip held, which is almost always stale because the weight slider only writes to the database and nothing was ever updating the chip back. Three-part fix: user-edited fields are now preserved on rescan; the weight is no longer rolled back to the chip's value on a regular rescan; and when the database weight differs from what the chip shows, the app writes the new value directly onto the chip while it's still on the reader (only the 3 bytes that hold "Measure Available" are touched). Chip and database now converge every time you tap a spool. New chips and chip-rewrite flows are unchanged.
- **Password-eye and clear-input buttons no longer jump down** when clicked — a global CSS rule was overriding the absolute-positioning transform on these icon buttons, making them drop ~14 px on every click in Printer Settings, the login modal, and the Add printer form.
- **Printer Settings inputs no longer change size when you click the eye toggle** to show/hide a password — the field now stays the exact same dimension regardless of whether the password is hidden or shown (was jumping from 36 → 40 px tall and 13 → 14 px text on every toggle).

---

## v1.8.9 — 2026-05-29

### Added

- **Creality printers now show up in the network scan** — *Add printer → Creality → Scan network* discovers Creality machines on your LAN (K-series, K2, and current-gen Enders running Klipper, e.g. the Ender-3 V4) and adds them in one click, just like Snapmaker and FlashForge. There's also a manual *Enter IP address* path and an inline *Add by IP* shortcut for printers the scan can't reach directly. The common Creality home subnets (192.168.1.x, 192.168.40.x) are always scanned, and any extra subnets you add now persist across a *Restart scan*. Verified live against an Ender-3 V4.

### Changed

- **Adding a Creality printer no longer requires a username/password** — the *Root* account and password fields are now optional. Most Creality printers expose their control channel without authentication, so you can add and connect to them without entering anything; only fill them in if your printer's firmware enforces a login.
- **A friend's inventory is cleaner in read-only mode** — when viewing a friend's inventory, the *+ Scan* and *Add* buttons are now hidden, since those actions can't apply to someone else's collection.

---

## v1.8.8 — 2026-05-29

### Fixed

- **Bambu RTSP cameras (X1C / X1E / P2S / H2x) now actually stream** — the camera launched ffmpeg with `-tls_verify 0`, an option the bundled ffmpeg doesn't recognise, so it errored out and showed nothing as soon as it reached a reachable printer. Removed the flag — TLS verification is off by default, so the printer's self-signed certificate is still accepted. This completes the cross-platform camera fix (Windows + macOS), verified live against a P2S.

---

## v1.8.7 — 2026-05-29

### Fixed

- **Bambu RTSP cameras (X1C / X1E / P2S / H2x) now actually work on Windows** — v1.8.6 bundled ffmpeg, but the app resolved its path inside the read-only `app.asar` archive, which Windows can't launch, so the live camera stayed black. The app now uses the real on-disk binary, so the stream works. (macOS / Linux were unaffected.)

---

## v1.8.6 — 2026-05-29

### Fixed

- **3D-printer RTSP cameras now work on Windows** (Bambu X1C / X1E / P2S / H2x) — ffmpeg is now bundled with the app on every platform, so the live camera works out of the box with nothing extra to install. Previously Windows had no ffmpeg available, so the RTSP camera stayed disabled.
- **Update notification tooltip showed raw HTML** — the auto-update status icon no longer displays literal `<strong>` tags in its tooltip.

### Changed

- **Encode modal (TigerCloud → TigerTag) — cleaner and safer**
  - Centred title; the redundant Cancel button is gone (close via the ✕ or a backdrop click — allowed any time, including mid-burn to abort); a permanent instruction sits above the readers.
  - Each reader is now drawn as a TigerTag "reader plate" carrying the white logo, with a corner status LED (red = no chip · green = chip detected), mirroring the ACR122U.
  - Presenting a chip while the modal is open no longer pops a spool side-card over it.
- **Header status icons unified** — TigerScale, TD1S and the RFID readers now share larger, consistent 3D icons. The two RFID reader badges are replaced by a single TigerPod icon (red = no reader · green = connected); hovering reveals each reader (RFID #1 / #2) and the UID of any chip presented.
- **Storage — "Clear all" now protects locked slots** — spools in a locked slot stay put when you clear a rack; the only way to remove one is to delete the spool itself.

---

## v1.8.5 — 2026-05-28

### TigerCloud → TigerTag — guided encode

- Encoding a TigerCloud spool to a physical chip now opens a **guided modal** (titled by the migration itself, *TigerCloud → TigerTag*) instead of a one-shot click.
- **Presence-gated**: the burn stays locked until every connected reader holds a chip; each reader's state is shown live by colour (no clutter text), with a single global progress bar.
- **Sequential, verified burn**: chips are written one after another (100 ms apart) and **each write is read back and verified byte-for-byte** — a chip only turns green on a confirmed match.
- **All-or-nothing**: the Firestore migration (create the physical spool, delete the Cloud one) runs **only after every chip verifies**. Any failure — including a chip moved off the reader mid-write — fails the whole sequence with nothing written to the cloud, and the modal stays open to retry from scratch.
- Safety: warns before overwriting a non-blank chip (with an "I understand" toggle), refuses two identical chips, and a single chip-epoch timestamp is shared so a twin pair is written identically.

### Fixed

- **Physical chip "Manufactured" date wrong (~2056) on burn** — the chip timestamp was written as Unix seconds instead of the TigerTag chip epoch (seconds since 2000); now corrected, so a freshly-burned chip reports the right manufacturing date.

---

## v1.8.4 — 2026-05-28

### Fixed

- **TigerCloud "Manufactured" date wrong (~2056)** — Cloud spools stored their creation time as a Unix timestamp instead of the TigerTag chip epoch (seconds since 2000), so the decoded manufacturing date overshot by ~30 years. Fixed at creation (Add Product, Duplicate); the display also defensively corrects already-created spools. The stored value is now correct when a Cloud spool is later burned to a physical chip.
- **Storage — linked (twin) spools counted twice** — a twin pair (one physical spool, two tags) now shows and counts **once** in the "not stored" list, the not-stored count, the free-slot count, and each rack's header count (no more over-capacity like `28/27`). Auto-fill no longer scatters the two tags of a twin into separate slots.

### Changed

- **View toggles — consistent icons + order** — the materials toggle is now **Grid · Table · Storage**; both toggle groups share the same Grid (`⊞`) and Table (list) icons and the same translations (fixes the FR mismatch where the printer "Table" stayed untranslated). The printer "Cam" label is now localised.

### Added

- **Usage telemetry — geographic dimension** — alongside the existing version / OS / language / session metrics, the app now records a locale-derived country code and IANA timezone (offline, no IP geolocation), plus lifetime `langsUsed` / `countriesUsed` aggregates, for future usage statistics.

---

## v1.8.3 — 2026-05-28

### Spool detail — Duplicate (×N)

- New **Duplicate** tool at the top of the spool toolbox (hold 1 s to confirm) with a **− N + quantity stepper** (1–50): mint one or many copies in a single write. The button label tracks the count ("Duplicate ×N").
- Available for **TigerCloud** and basic **TigerTag** spools; **TigerTag+** can't be duplicated. A basic TigerTag necessarily becomes TigerCloud (a digital clone has no physical chip), so each copy gets a fresh Cloud UID.
- Copies are identical to the source but carry **no twin link and no rack placement** (nothing physical exists in a Cloud entry). Copy timestamps are staggered **+3 s** apart so identical copies are never auto-paired as twins.

### Spool detail — editable note

- The spool's `message` is now an **inline-editable free-text note**: click the name in the detail panel, type, Enter/blur to save, Escape to cancel. Placeholder "Add a note" when empty.
- Available on **every spool type** (TigerCloud, basic, TigerTag+) — on TigerTag+ the catalogue name (e.g. "Artic Teal") stays read-only with the editable note below it; on TigerCloud/basic the note is the spool's name.
- **28-byte UTF-8 cap** (the chip's name slot) with a thin usage bar that fills as the budget is consumed (blue → amber → red), no number shown.
- Editing the note is a **chip change**: it now flags the spool (and its twin) for re-burn — the chip-update badge + banner appear, exactly like editing TD or colour. Skipped for TigerCloud (no physical chip).
- Identity block restructured: **Brand · Series · Material on one line**, the note on its own full-width line below.

### TigerCloud — renamed from "TigerTag Cloud"

- The third tier is now called **TigerCloud** everywhere (badge, stat tile, filters).

### Bambu Lab — camera transport

- Camera transport (JPEG-TCP vs RTSP) is now driven by a `camera_transport` field in the printer model catalogue instead of hardcoded serial/ID sets — more robust across the lineup. Added the **X2D** model.

### Fixed

- **Bambu printers — IP now shows in the printers table** (it's stored as the MQTT broker address, which the table/sort now read).

---

## v1.8.2 — 2026-05-24

### TigerPOD modal — full visual redesign

- **Hero video** — replaced the NFC SVG icon with the product helper video (`assets/video/tiger_pod/helper_tiger_pod_movies.mp4`); plays on modal open, pauses on close. Rings animation kept behind the video.
- **Layout** — title "Tiger POD Free STL" moved above the video; hero `padding-top: 16px` for breathing room; hero height 240 px (was 200 px); video height 156 px (+30 %).
- **Copy overhaul** (all 9 locales):
  - Modal title: "Build your TigerPOD" → "Print your TigerPOD Now !"
  - Description: "program" → "Burn TigerTag RFID chips"
  - CTA button: "Print on MakerWorld" → "Download & Print STL Free"
  - Stats bar (⚡12 Boosts · ❤21 Likes · Free) → "Please ⚡Boost & ❤Like"
  - Brand label "TigerTag.io" removed; product name "Open Spool Pod" → "Tiger POD Free STL"
  - Print spec strip (`0.2 mm · 8% infill · ~7 h`) removed
- **Feature cards** — icons replaced by numbered orange gradient badges ①②③④; updated copy: Dual RFID Reader / Dual Link / Print in Place / 1kg Standard spool with matching sub-labels.
- **AutoScan without reader** — `+ Scan` button now opens the TigerPOD modal when no reader is connected (previously opened the Pod Scan panel).

### Pod Scan side-panel — removed

- `<aside id="scanPanel">`, overlay, and all associated DOM were removed — the panel had no remaining triggers.
- JS: `_openScanPanel`, `_closeScanPanel`, `_updateScanPanel` and their listeners deleted.
- CSS: full `.scan-dp` / `.sdnr-*` block removed from `70-detail-misc.css`.
- i18n: 4 orphan keys removed (`scanPanelTitle`, `scanPanelWaiting`, `scanPanelNoReader`, `scanPanelNoReaderSub`). **791 keys × 9 locales.**
- Debug panel: "⌥ Open Pod Scan" button removed.

### Bambu Lab MQTT — stability fixes

- **No more data wipe on reconnect** — `bambuConnect` preserves `conn.data` when reconnecting to the same IP; the UI no longer flashes to zero while the MQTT handshake completes.
- **No more false "idle" overwrite** — `_normState` returns `null` (not `"idle"`) when the message contains no state field; `_bblMerge` only updates `d.printState` when a real state is present (`!= null`).
- **AMS / external tray merge already correct** — merge-by-ID loop introduced in v1.8.0 preserved; old-firmware temp fallback gated on `!dev`.

### Printer grid/table — click reliability

- **Bambu status changes no longer cause full grid rebuild** — `_bblNotify` only passes `statusChanged=true` (→ `renderPrintersView()`) when the printer actually crosses the online/offline section boundary; intermediate connecting-state transitions just update the badge in-place via `_bambuRefreshOnlineUI`. Eliminates the DOM-rebuild race that swallowed clicks during connection.
- **Document-level mouseup fallback** — if a DOM rebuild happens between `mousedown` and the `click` event (causing the click to land on a detached element that doesn't bubble), `_pendingPrinterOpen` is consumed by a `document mouseup` + `setTimeout(0)` safety net. Works for both grid and table views.

### Color edit modal (TD1S) — swatch pencil icon

- Edit pencil always visible at 65 % opacity, 95 % on hover.
- **Light-color detection** (`_ceIsLight`) — perceptual luminance formula `(0.299R + 0.587G + 0.114B)/255 > 0.55`; black icon + dark hover ring applied via `ce-swatch--light` class when the swatch background is light.
- `_ceUpdateSwatch(swatchEl, hex)` centralises background + icon color + class updates.

### Add Product modal — TD1S integration

- TD1S button in ADP now opens "Set Color & TD Value" modal (was the tester modal).
- Save writes back to `_adpColorSlots` + `adpTd` input (not Firestore) via the `onSave` callback on `openColorEditModal`.

### Product ID help modal

- ✕ close button removed (backdrop click remains the close affordance).
- "Explore the TigerTag+ material list" button closes the modal after opening the external link.
- Label updated: "Browse the TigerTag material list" → "Explore the TigerTag+ material list" (all 9 locales).

### Mini dashboard — badge labels

- Stat chip labels now render actual badge HTML (`<span class="tag-diy">`, `<span class="tag-plus">`, `<span class="tag-cloud">`) instead of plain text.
- TigerCloud chip styled identically to the other chips (removed purple override).

### RFID reader badges — filled pill redesign

- **Disconnected** — filled red gradient `#be2d2d→#d83b3b`, white text, `opacity: .85`.
- **Connected** — subtle green tint background, `color: var(--success)`.
- **Card present** — filled green gradient `#0d8a52→#1aaf6c`, white text.

### Tiger Scales — header badge

- `⚖` emoji replaced by a "Tiger Scales" text pill badge in the header status bar.
- Three CSS states: gray/transparent (no scale), green tinted (connected), red tinted (no scale paired).

### TigerTag+ product preview

- After clicking "Check" with a product ID, the preview now shows the full label: **Brand · Series · Name · Weight · Refill** (e.g. "R3D PLA High Speed Orange 1kg Refill").
- Brand name sourced from `api.brand` (catalogue field) — more reliable than the local numeric `id_brand` lookup at check time.
- "Refill" token only shown when `api.filament.refill === true`.
- Thumbnail enlarged (44 × 44 px, border added).

### Detached Camera Wall

- New standalone window (`renderer/cam/`) showing all online printer cameras simultaneously — open via the "Detach" toolbar button in the cam view.
- Supports all camera types: Bambu Lab (MJPEG over IPC), Creality (WebRTC), Snapmaker / FlashForge (iframe).
- MJPEG and Bambu frames forwarded to the detached window via `BroadcastChannel('cam-frames')` with zero-copy `ArrayBuffer` transfer.
- Creality WebRTC uses a single `RTCPeerConnection` shared across the cam wall card, the printer sidecard, and the detached window — prevents duplicate connections (firmware only accepts one peer at a time).

### Image loading — skeleton animation

- All web-sourced images now display a shimmer skeleton while loading (TigerTag+ preview, add-from-web, product check, etc.).
- Auto-applied via `MutationObserver` — no per-site instrumentation needed.
- Smooth fade-in once the image loads.

---

## v1.8.1 — 2026-05-23

### Build fix
- Rebuild to fix CI artifact mismatch (v1.8.0 GitHub release had stale `latest-mac.yml` checksums from an earlier partial build — auto-updater would have failed checksum verification)
- No code changes from v1.8.0

---

## v1.8.0 — 2026-05-23

### Cloud spool → physical chip encoding

- **`rfid:encode-cloud` IPC handler** — builds the TigerTag payload once from a Cloud spool Firestore doc, then writes the same bytes (same timestamp) to every target reader. Up to 2 readers (one per TigerPOD slot) receive identical chips atomically.
- **`_encodeCloud(r)` in renderer** — on success, promotes the Cloud spool: replaces the `CLOUD_…` spoolId with the first chip UID, establishes a twin link when two chips were written, and hard-deletes the Cloud doc. Inventory refreshes via onSnapshot.
- **`_burnRfid(r)`** — writes updated data (weight, color, …) back to a physical chip that is already linked to a spool. Clears `needUpdateAt` on success.

### NFC process — NTAG page-read fix

- **`blockSize=4`** — the nfc-pcsc `reader.read()` increment formula was producing overlapping pages with `blockSize=16`. Setting it to 4 (one NTAG page = 4 bytes) makes reads fully sequential (pages 4–39, 144 bytes). All chips now parse correctly from first insertion.
- Reader registry refactored to a `Map` for cleaner per-reader lifecycle.
- `readerName` forwarded with every `rfid-tag-scanned` event for multi-reader disambiguation.

### TD1s — unified color + TD modal

- `openTdEditModal` now redirects to `openColorEditModal` — a single flow handles both color and TD scanning.
- Multi-slot support (1–3 colors): slot-switching UI, per-slot hex values, active-slot indicator.

### Telemetry — professional two-level architecture

- **`users/{uid}` (last-known client state)** — `studioVersion`, `studioElectron`, `studioPlatform`, `studioArch`, `studioOsRelease`, `studioOsVersion`, `studioLang`, `studioLocale`, `studioLastSeen`. Overwritten on every session.
- **`users/{uid}/telemetry/studio` (lifetime aggregates)** — `sessionsCount` (`FieldValue.increment`), `versionsUsed` / `platformsUsed` (`FieldValue.arrayUnion`), `lastSeen`, `td1sUsed` (latched to `true` on first TD1s connection), `rfidReadersMax` (high-water mark of simultaneous readers). Never decremented.
- `app:info` IPC extended with `osVersion` (human-readable via `os.version()`).
- Firestore Security Rules updated: `users/{uid}/telemetry/{docId}` enforces `hasOnly()` field guard, `td1sUsed == true` constraint, `rfidReadersMax in [1, 2]` constraint. Deployed.

### TigerPOD modal — complete redesign

- Content sourced from the real MakerWorld page ([#1289152](https://makerworld.com/fr/models/1289152)).
- **Hero** — gradient purple, animated pulsing rings, "TIGERTAG.IO" brand + "Open Spool Pod" product name.
- **Stats bar** — `⚡ 12 Boosts · ❤ 21 Likes · Free` overlay at hero bottom.
- **Feature grid 2×2** — Dual reader slots / Encode 2 chips / No supports / Any 1 kg spool; each cell has an icon + title + subtitle.
- **Print spec strip** — `🖨 0.2 mm · 8% infill · ~7 h`.
- **CTA button** — orange primary "Print on MakerWorld" with printer icon. Card width 400 px (was 340 px).
- **Three triggers** — modal opens from: cloud banner (no reader), "Please update RFID" banner (no reader), red RFID disconnected badge in header.

### RFID badge — always visible

- Badge is always rendered; **disconnected state** shows a red pulsing dot, `cursor: pointer`; clicking opens TigerPOD.
- Connected states unchanged (green dot; card-present variant for chip-on-reader).

### Banners — fully clickable + smart routing

- **Cloud encode banner** and **chip update banner** are now fully clickable (whole row, not just the button).
- When no reader is connected, both banners route to the TigerPOD modal instead of silently no-op-ing.

### i18n — 13 new keys (TigerPOD redesign)

`tigerPodBoosts` · `tigerPodLikes` · `tigerPodFree` · `tigerPodFeat1Title/Desc` · `tigerPodFeat2Title/Desc` · `tigerPodFeat3Title/Desc` · `tigerPodFeat4Title/Desc` · `tigerPodPrintSpec`. All 9 locales. `tigerPodModalDesc` updated to shorter copy. Total: 778 keys.

---

## v1.7.7 — 2026-05-20

### Google sign-in — no more broken passkey popup on loopback failure

- When the loopback OAuth flow fails (user closed the browser tab, network error, etc.), the app no longer silently falls back to `signInWithPopup`. That popup opens a Chromium BrowserWindow which cannot talk to the macOS authd daemon — Google's "Use your passkey" UI appears but is inert, leaving the user stuck.
- Instead a clear error toast is shown: **"Google sign-in via browser failed — please try again or use email/password."** The user stays on the login form and can retry the loopback flow or switch to email/password.

---

## v1.7.6 — 2026-05-20

### Windows — renderer server bind fix (definitive)

- **Root cause**: `startRendererServer` tried to bind to `'localhost'` first. On Windows 10/11 with Node.js 17+ (Electron 41+), `localhost` can resolve to `::1` (IPv6). If IPv6 is disabled on the machine, `server.listen` fails with `EADDRNOTAVAIL`. The v1.7.2 / v1.7.3 fallback logic partially addressed this but still sent `http://127.0.0.1:PORT` to `loadURL`, breaking Firebase Google sign-in (`auth/unauthorized-domain`).
- **Fix**: the server now **always binds to `127.0.0.1`** (explicit IPv4 loopback — never ambiguous, works on all Windows versions regardless of IPv6 state). `BrowserWindow.loadURL` always uses **`http://localhost:PORT`** (Chromium resolves `localhost` → `127.0.0.1` at TCP level, Firebase Auth accepts the named host). The two responsibilities — server bind address and browser origin — are now cleanly separated.
- `tryBind` simplified: no more host parameter, no more localhost→127.0.0.1 fallback branch. Only the EADDRINUSE (port taken) case is handled, by retrying on port 0.

---

## v1.7.5 — 2026-05-20

### Persistent logging

- **`electron-log`** added — all `console.log / warn / error` calls are now automatically written to a rotating log file (5 MB max):
  - **Windows** : `%APPDATA%\Tiger Studio Manager\logs\main.log`
  - **macOS**   : `~/Library/Logs/Tiger Studio Manager/main.log`
  - **Linux**   : `~/.config/Tiger Studio Manager/logs/main.log`
- First log line on every launch: `Tiger Studio Manager starting — vX.Y.Z`
- Useful for diagnosing launch failures on user machines (e.g. Windows IPv6 issues) without requiring users to run from a terminal.

---

## v1.7.4 — 2026-05-20

### Spool sync — ISO with printer pattern

- **Hard delete for spools** — `markSpoolDeleted` now issues a Firestore `batch.delete()` instead of writing a `deleted: true` tombstone. Twin is hard-deleted in the same batch. No resurrection possible once the doc is gone.
- **Anti-resurrection guard** — `cloudSync` flag (local-only, never pushed to Firestore) marks every spool that has ever reached the cloud. If Tiger Studio later hard-deletes it and Flutter reconnects, Flutter's push path skips the entry instead of sending it back. ISO with the existing printer pattern.
- **`purgeLegacyTombstones`** — on every live Firestore snapshot, any remaining `deleted: true` docs (written by pre-v1.7.4 clients) are automatically hard-deleted. One-shot migration; no-op once migration is complete.
- **Removed "Show deleted" feature** — spools are now always hard-deleted; the debug panel "Deleted" tab and its HTML/CSS/JS were removed entirely. Cleaner architecture, no stale data accumulation.
- **`updatedAt` field** — renamed `last_update` → `updatedAt` (ISO with the printer data model). All Firestore writes now use `FieldValue.serverTimestamp()` for `updatedAt`. `normalizeRow` reads `updatedAt` first with fallback to `last_update` for legacy documents already in Firestore.

### Container auto-assignment

- **`resolveContainerForBrand(brandId)`** — mirrors Flutter `_resolveSpoolForBrand`: (1) brand-specific match, (2) Generic fallback (`brandId == 0` → `custom_cardboard`), (3) first catalog entry.
- **`autoAssignMissingContainers(uid, inventoryRaw)`** — called on every live Firestore snapshot. Finds spools without `container_id`, resolves the container from brand, and batch-writes `container_id` + `container_weight` + `updatedAt`. Self-healing: new spools added via "Add Product" get a container automatically on the next snapshot. No-op once all spools have a container.

---

## v1.7.3 — 2026-05-19

### Hotfix — Firebase Auth broken after v1.7.2 Windows fix

The v1.7.2 fix bound the renderer HTTP server to `127.0.0.1` instead of `localhost`. Firebase Authentication only authorises named hosts — `localhost` is whitelisted by default, raw IP addresses are not. Every user on v1.7.2 received `auth/unauthorized-domain` on Google sign-in.

**Root cause / v1.7.2 mistake**: both the server *bind* host and the `loadURL` origin were changed to `127.0.0.1`. The server bind change was correct; the URL origin change was not.

**Fix**: `startRendererServer` now implements a proper multi-step bind strategy and returns `{ port, host }` instead of just the port number:

1. Try `localhost:5784` — preferred. Origin = `http://localhost:5784`, which Firebase recognises → Google sign-in works.
2. If `EADDRINUSE` → retry `localhost:0` (any available port, same origin hostname).
3. If `localhost` bind fails altogether (Windows 10 + IPv6 disabled → `EADDRNOTAVAIL`) → fall back to `127.0.0.1:0`. Google sign-in won't work on this configuration, but the process no longer crashes and email/password auth is unaffected.

`createWindow` uses the actual `host` returned by the server (`http://${host}:${port}/…`) so the two are always in sync.

---

## v1.7.2 — 2026-05-18

### Camera wall — size controls & stream stability

- **½× compact size mode** — new first button in every cam-wall card header. A ½× card spans one sub-column (~160 px min), so four compact cameras fit in the horizontal space of one 2× card. The card header adapts automatically (smaller padding, brand pill hidden, reduced button size).
- **Overlay headers** — cam-wall card headers are now `position: absolute` and float over the top of the camera feed with a dark gradient, hidden at rest and revealed on hover. This removes the fixed header height from the card's layout, so card height is determined purely by the 16:9 camera content. Two ½× cameras stacked no longer exceed the height of one 2× camera.
- **`align-items: start` on the cam wall grid** — cards are sized to their content only; cards in the same grid row no longer stretch to match the tallest neighbour (which caused large black voids below 1× cameras placed next to 2× ones).
- **Patch-mode render — no stream restart on size/order change** — `_renderPrinterCam` now detects when only `camSize` or `camSortIndex` changed (Firestore echo after a button click or DnD drop). It updates CSS classes and `style.order` in-place on the existing DOM nodes, never touching `host.innerHTML`. iframe WebRTC sessions and MJPEG streams survive size changes and reordering completely.
- **CSS `order`-based DnD reorder** — drag-and-drop reorder now reassigns `card.style.order` values instead of moving DOM nodes (`insertBefore` / `insertAdjacentElement`). Browsers reload iframes on any DOM detach+reattach; the CSS `order` approach keeps every node in its original DOM position so WebRTC and MJPEG streams are never interrupted.
- **Fullscreen header** — in `--fs` mode the header reverts to normal document flow (visible, background `--surface`, border-bottom) so the flex column layout fills the viewport correctly.
- **i18n** — 4 new keys across all 9 locales: `camSizeCompact`, `camSizeNormal`, `camSizeWide`, `camSizeFullscreen`.

### Windows 10 — crash on launch fix

- **Root cause**: `startRendererServer` bound the dev HTTP server to `'localhost'`. On Windows 10 with Node.js 17+ (bundled in Electron 41), `localhost` resolves to `::1` (IPv6). If IPv6 is disabled on the machine, `server.listen` fails with `EADDRNOTAVAIL` — not `EADDRINUSE` — which hit the `else { reject(err); }` branch and raised an unhandled promise rejection. In Node.js 15+, unhandled rejections terminate the process, causing the app to crash silently at every launch.
- **Fix**: the server now binds to `'127.0.0.1'` explicitly across all code paths (initial listen, EADDRINUSE fallback, other-error fallback). All error branches now call `resolve()` with a fallback random port — the process can never be crashed by a server-bind failure. Added `.catch()` on the `startRendererServer().then()` call in `createWindow()`.

### MJPEG cam_manager — generic mux module

- **`renderer/printers/cam_manager.js`** (new) — brand-agnostic MJPEG stream multiplexer extracted from `flashforge/cam_mux.js`. One `fetch()` per printer key, N consumer `<img>` elements receive each JPEG frame as a `blob:` URL. A 2-second grace period on last-consumer-unregister avoids unnecessary reconnections when the user switches between views (sidecard open/close, cam wall / grid toggle).
- **`flashforge/cam_mux.js`** now delegates entirely to `cam_manager` via six re-exported aliases (`camStart` → `ffgMuxStart`, etc.). The FlashForge-named public API is preserved for callers.

### Creality — connection stability

- **`creConnect` IP guard** — early-return if no `printer.ip` is configured (avoids silently opening a WebSocket to an empty string).
- **Abandoned connection fast-path** — `crePingPrinter` skips the HTTP probe and immediately returns `offline` for connections flagged `_abandoned` (3+ consecutive failures), avoiding redundant network round-trips.
- **Already-managed IP** — `creConnect` now treats any existing conn with the same IP as "already managing" (even if `_abandoned`), deferring to an explicit user reconnect instead of silently replacing it.

---

## v1.7.1 — 2026-05-17

### Printer grid & table — live status and progress

- **Status pills in grid cards and table** — every connected printer now shows its live state (Idle, Printing, Paused, Preparing, Complete, Error, …) directly in the grid card and table row without opening the sidecard. Offline printers show nothing; connected-but-idle printers show a muted grey pill; active jobs show the progress bar + `XX% · 1h 23m`.
- **ISO visual style** — the state pills in cards and table use the exact same `snap-job-state snap-job-state--{state}` classes as the sidecard, scaled via `.snap-job-state--compact`. Spinning ring animation on `printing` and `preparing`, colour-coded per state (blue=printing, amber=paused/preparing, green=complete/finished, red=error/failed, grey=idle/standby/ready).
- **Online badge pill** in grid cards now matches the sidecard pill: rounded background + coloured border (green for online, amber for connecting, grey for offline).
- **Filename + remaining time** — when a job is active, the truncated filename appears below the progress bar and remaining time is shown alongside the percentage (`42% · 1h 23m`). BambuLab, Elegoo, and Creality expose remaining time; all brands expose the filename when printing.
- **Cross-brand normalisation** — `_getPrinterJob` now returns a uniform `{ state, pct, isActive, filename, remainSec }` for all five brands. Creality's numeric `d.state` is normalised to `idle`/`printing`/`complete`; remaining time converted from brand-specific units (BambuLab minutes, Elegoo ms, Creality seconds).
- **New i18n keys** across all 9 locales: `snapState_finished`, `snapState_preparing`, `snapState_failed`, `snapState_ready`.

### Printer grid — Online/Offline partition fix (all brands)

- **Root cause**: `ctx.onPrinterGridChange` referenced `_printerSub`, a `const` scoped inside `renderPrintersView()`. In strict mode (ES modules) this threw a silent `ReferenceError` on every RAF tick, swallowing the re-partition call — printers that connected after the initial render were stuck in the Offline section indefinitely. Fixed: `state.viewMode !== "printer-cam"`.
- **RAF coalescing race** (all 4 brand drivers): the shared RAF flag for `statusChanged=true` (re-partition) and `statusChanged=false` (surgical job patch) could block the connected-status RAF on a fast LAN. Fixed by splitting into two independent flags (`_xxxStatusRaf` / `_xxxGridRaf`) per brand.

### Camera improvements

- **Cam wall card → click → sidecard** — clicking any camera wall card opens the sidecard for that printer. CSS `cursor: pointer` + `border-color` hover feedback on `.cam-wall-card`.
- **FlashForge MJPEG multiplexer** (`cam_mux.js`) — a single `fetch()` reads the MJPEG stream and distributes JPEG frames to all registered `<img>` consumers (cam wall + sidecard simultaneously) with zero extra connections. Respects FlashForge's 1-client limit. Stream auto-stops when the last consumer unregisters.
- **Creality camera persistence** — `_activeIp` tracking prevents redundant WebRTC restarts on WS reconnect. `#creCamContainer` persists in the DOM; `.cre-cam-hidden` toggled by CSS instead of DOM removal.

---

## v1.7.0 — 2026-05-15

### DB pipeline — unified reference data layer
- **`tigertagDbService`** is now the single source of truth for all TigerTag reference JSON files (brands, materials, aspects, types, diameters, units, versions). The renderer loads these via IPC (`window.electronAPI.db.getLookups()`) instead of direct `fetch()` calls, so both the inventory view and the live printer integrations draw from the same data.
- **`assets/db/tigertag/`** — reference files relocated to `assets/db/tigertag/id_*.json` (official TigerTag naming). A `last_update.json` timestamp file is bundled alongside so the app knows the embedded data's age from day one.
- **GitHub mirror fallback** — `tigertagDbService` tries the TigerTag API first; if unreachable it falls back to the auto-synced GitHub mirror (≤ 6 h stale). Offline users still get their last cached copy from `userData/db/tigertag/`.
- **Atomic writes with JSON validation** — every dataset is validated (non-empty array, each entry has `id`) before overwriting the local cache file. A truncated or malformed API response is rejected; the previous good file is kept intact.
- **First-launch seed** — on a fresh install, `tigertagDbService` reads `last_update.json` bundled in `assets/db/tigertag/` and seeds the metadata store so the app skips unnecessary network downloads for data that shipped with the installer.

### Bambu Lab — filament edit sheet redesign
- **ISO layout** — the Bambu filament edit bottom-sheet now matches the Snapmaker / FlashForge / Elegoo design: two rows only (Filament + Color), no summary bar, no close ✕ button, no horizontal separators.
- **Auto-close on color select** — picking a color from the preset grid or the OS color picker closes the color sub-sheet automatically (150 ms delay, same behavior as other brands).
- **Title corrected** — sheet is now labeled "Edit filament" instead of the previous "Change filament".

### i18n
- Added **`snapState_idle`** key across all 9 locales (EN/FR/DE/ES/IT/ZH/PT/PT-PT/PL) — resolves the raw-key label that was showing in the Bambu Lab printer state badge.

---

## v1.6.0 — 2026-05-14

### Elegoo — full MQTT live integration
- **Real-time MQTT connection** on port 1883 (plain TCP). UDP discovery on port 52700 auto-detects Elegoo printers; manual IP entry is the fallback.
- **Job card** — active filename, progress bar + percentage, estimated remaining time, layer counter (`current / total`), print thumbnail, and state badge (`printing`, `paused`, `complete`, `standby`, …).
- **Temperature card** — nozzle `current / target°C`, bed `current / target°C`, chamber temperature; heating indicator when target is set and sensor is below threshold.
- **Filament card** — mono-extruder mode (`Ext.`) and Canvas hub 4-slot mode (`S1`–`S4`); each slot shows colour square, material type, vendor, and filament name. Partial MQTT updates (method 6000 `mono_filament_info`) merge only the fields present in the payload — existing data is preserved.
- **Control card** — jog pad with XY circle (4-direction buttons + sector highlight + centre home-XY), Z pill (Z↑ / home-Z / Z↓), X/Y home pill, step selector (0.1 / 1 / 10 / 30 mm), print-speed selector (Silent / Normal / Sport / Ludicrous), current-position display (X / Y / Z), LED toggle, and folder button.
- **Fan cards** — Model / Aux / Case fans as three compact column cards each with icon toggle, − / % / + step buttons (±10% per step).
- **Files sheet** — two tabs: Print History (thumbnails + filename + duration) and Files (printer-side file list). Refresh reloads the active tab without closing the sheet.
- **Filament edit sheet** — colour preset grid + custom hex picker, material type list, vendor picker, summary preview, sends correct MQTT payloads (method 1055 for mono, method 2003 for Canvas).
- **No-flash control card** — surgical DOM patch on every MQTT tick: fan percentages, LED state, and XYZ position are updated in-place without re-creating the control card DOM.
- **i18n** — all UI strings covered across 9 locales (EN / FR / DE / ES / IT / ZH / PT / PT-PT / PL).

### Bambu Lab — live integration
- **MQTTS connection** on port 8883 (TLS). Auth via printer access code (entered once). Requires "LAN mode" enabled on the printer.
- **Job card** — filename, progress bar, estimated remaining time, layer counter, and print state.
- **Temperature card** — nozzle, bed, and chamber temperatures with heating indicators.
- **Filament / AMS card** — row 1 is `[Ext.] [A1][A2][A3][A4]`; additional rows for extra AMS units. AMS humidity and temperature shown when a single module is connected.
- **Camera widget** — JPEG stream from the printer's built-in camera.
- **Online badge** — driven by the MQTT connection state, shown in the printer grid and side panel.

### UI polish — printer live blocks
- Elegoo control card — borders removed for a cleaner look; home buttons keep orange hover/active state.
- Fan cards — columns layout (one card per fan), no borders, 8 px gap between cards.
- Filament mono slot — `Ext.` alone capped to `max-width: calc((100% - 32px) / 5)` so it renders at the same size as one slot in a full Ext. + AMS row.

---

## v1.5.0 — 2026-05-11

### TigerScale — live WebSocket panel
- **Connect / disconnect toggle** on each scale card. Manual disconnect suppresses auto-reconnect.
- **WS event log** — collapsible strip showing the last 80 events (connect, raw frames, errors, retries) with direction arrows and per-line timestamps.
- **CORS fix** — removed the pre-connect `fetch()` ping (blocked by Chromium CORS in Electron). `connectScaleWs` now opens the WebSocket directly; `onclose` handles retries.
- **Field-name fix** — WS parser corrected from snake_case to the actual camelCase fields the firmware sends (`netWeight`, `scaleStatus`).
- **Gradient live card** — shows live data with a purple gradient matching the TigerScale mobile app. Hidden when WS is disconnected; reappears on reconnect.
- **Send-status badge** — maps `scaleStatus` firmware values (`idle`, `scanning:N`, `stable:N`, `send`, `success`, `error`, `done`, `ready`) to emoji + text with per-state background colours.
- **Filament mini-panel** — colour dot, brand, and material. Appears only when the firmware sends non-empty brand or material; clears automatically when `scaleStatus` becomes `"ready"`.
- **Weight display** — 56 px bold weight number with unit.
- **UID reader grid** — 2-column grid (Left reader / Right reader). `resolve()` fills the empty slot with the twin UID in green.
- **TARE hold-to-confirm** — 1-second press fills a white progress bar then POSTs `/api/tare`. Button hidden when disconnected.

### Elegoo — thumbnail correlation fix
- History thumbnail responses are now correlated by `_historyThumbPendingFn !== null` rather than by request ID. The Elegoo firmware echoes the method number (1045) as the response `id` — not our incremental request ID — so ID-based matching never worked and thumbnails were silently dropped.

---

## v1.4.15 — 2026-05-09

### Creality live integration
- Real-time WebSocket connection on port 9999 with automatic heartbeat (polling every 2 s).
- Live nozzle, bed, and enclosure temperatures; print state (`idle` / `printing` / `finished`), job progress bar, layer counter, estimated duration.
- **CFS colour grid** — activated when `cfsConnect=1` and `materialBoxs[]` is non-empty; shows each slot's assigned colour pill and material label.
- **WebRTC camera** — inline `<iframe>` at `http://$ip/webcam/webrtc` when `webrtcSupport=1`.
- **Print thumbnail** — fetched from `http://$ip/downloads/original/current_print_image.png` while a job is active.
- WS event log with Pause / Clear / row-expand, same UI as Snapmaker and FlashForge.
- Online / Offline badge driven by a lightweight WS probe (30 s TTL).

---

## v1.4.14 — 2026-05-08

### Add Product — multi-colour picker (Mono / Dual / Tri / Rainbow)
- New **Mono / Dual / Tri / Rainbow** selector in the colour picker bottom-sheet. Tap a colour square to switch the active slot, then pick its colour.
- The colour circle updates in real time: solid (Mono), hard half-split (Dual), conic-gradient sectors (Tri), smooth linear-gradient (Rainbow).
- Selecting a mode auto-sets `id_aspect2` to the matching aspect. The link is bidirectional — changing the aspect2 dropdown also flips the mode selector.
- `color_r2/g2/b2` and `color_r3/g3/b3` now written from the actual slot colours picked.

### Version / protocol filter
- The **Type** quick-filter in the inventory toolbar now filters by **protocol version** (TigerTag / TigerTag+ / TigerCloud / TigerTag Init / …) instead of filament product type.

### Search & filter reset on instance switch
- The search bar and all quick-filters are now automatically cleared when switching between accounts or entering / leaving a friend's inventory view.

---

## v1.4.13 — 2026-05-07

### Custom product image for DIY & Cloud spools
- **`url_img` + `url_img_user: true`** — DIY and Cloud spools can now carry a product image from an external URL. TigerTag+ spools are not editable.
- **Edit pill in the colour square** — expands rightward on click to reveal the URL input and a confirm button. `Enter` = confirm, `Escape` = dismiss.
- **Toolbox entry** — when a valid user image is already set, the edit action moves to the spool toolbox.
- **Broken-link recovery** — `onerror` handler detects failed image loads, swaps in the colour placeholder, and surfaces the edit trigger.
- **Add Product integration** — the ADP advanced section has an image URL field.

### Toolbox — Clear TD value
- New split-button on the "Scan TD" toolbox row: a hold-to-confirm trash button (1 200 ms) appears to the right when `r.td != null`. Holding it deletes the `TD` field via `FieldValue.delete()`.

### Add Product panel — TD1S sensor button
- TD1S icon added to the ADP header. **Not connected** → opens the TD1S connect modal. **Connected** → glows green; scanning a filament auto-fills the colour HEX and TD value fields.

### Stats bar — TigerCloud counter
- New purple stat tile ("TigerCloud") always visible in the inventory header bar. DIY count now correctly excludes Cloud entries.

### Window chrome
- **Dark title bar** — `nativeTheme.themeSource = 'dark'` forces the native macOS/Windows title bar to dark mode.
- **No window shadow** — `hasShadow: false` removes the OS-level drop shadow along window edges.
- **Update status icon** — sits to the right of the cloud health indicator. Orange + spinning during download; green + glow when ready. Clicking the green icon triggers the install.
- **Panel shadow bleed fix** — `detail-panel`, `sfe-sheet`, and `rp-side` were leaking `box-shadow` outside the viewport when off-screen. Shadow now applied only on `.open` / `.is-open` state.

---

## v1.4.12 — 2026-05-06

> 🌥️ **The big one: TigerTag goes Cloud.** Create a filament in your inventory without owning an RFID chip. When you eventually program a chip, the doc is atomically renamed to its real hex UID — all fields, twins, rack assignments, and friend ACLs follow with no manual effort.

### TigerCloud — third tier
- **100 % digital filaments** — the Add Product side panel writes a complete inventory entry with a `CLOUD_<10-digit>` doc id. Same schema, same fields, same display surfaces, same friend-sharing rules as chip-backed spools.
- **Promotion path** — when a physical chip is programmed, the `uidMigrationMap` rename pipeline carries the document over atomically. Twin pointers, rack assignments, weight history, friend ACLs — everything follows the rename. Idempotent.
- **New tier label "TigerCloud"** — sits alongside TigerTag+ (orange) and TigerTag (grey). Cloud takes precedence when both signals would apply. Shown across table row, grid card, panel image overlay, and panel details footer.
- New CSS class `.tag-cloud` — purple gradient (`#7c4dff → #a37bff`).

### Add Product — full HSV colour picker
- Anthracite preset sheet matching the Brand / Material sheets.
- Custom slot shows the current colour as background.
- Custom-colour bottom-sheet rebuilt as an HSV picker: hex input row, saturation × value rectangle, hue slider, colour preview circle, OK button.
- Live main-circle update while dragging the SV thumb / hue slider / typing.

### Add Product — RFID Data debug surface
- Gated to `state.debugEnabled` (admin only). Non-admin users never see the section.
- Moved out of Advanced mode — always visible to debug users.
- Switched to the canonical `<details class="debug">` pattern with `pre.json` dark theme.

---

## v1.4.11 — 2026-05-05

### FlashForge live integration
- **HTTP polling** — 2 s tick on `POST /detail`, bridged through the Electron main process to bypass CORS. Capped exponential backoff on network errors (2 s → 30 s).
- **Camera (MJPEG)** — edge-to-edge `<img>` stream. Handles mjpg-streamer's 1-client limit: cache-buster on open, explicit tear-down on close, graceful fallback + Retry button on error.
- **5-slot matlStation grid** — `[Ext.] [1A] [1B] [1C] [1D]`. Ext. → `indepMatlInfo`; bays → `slotInfos[1..4]`. Three visual states per slot: filled (solid fill), configured-but-empty (coloured inset ring), unconfigured (grey hatch).
- **Auto SN-prefix** — auto-prefixes `SN` when the entered serial is missing it. Idempotent.
- **Request log (debug mode)** — every poll pushes an outbound + inbound entry. Click to expand JSON; Pause / Clear toolbar; capped at 100 entries (FIFO).

### UX — Inventory toolbar redesign
- **View selector moved below the search bar** — own dedicated row under the search, keeping its full width regardless of how wide the filters above end up.
- **Search input — clear button (✕)** — appears on the left of the magnifier icon as soon as the input contains a value.

---

## v1.4.10 — 2026-05-05

Hot-fix release for the Windows auto-updater.

- **Windows auto-update fixed.** `build.publish.publisherName: null` set to skip publisher-name verification on Windows (the SHA-512 hash check from `latest.yml` still enforces integrity). Fixes the `Could not check: New version is not signed by the application owner` error that blocked v1.4.9 auto-updates.
- **Mobile-app prerequisite warning** added to the inventory format upgrade consent modal — a small amber banner reminds the user to update their TigerTag mobile app to v1.0.3+ before continuing.

---

## v1.4.9 — 2026-05-04

Quality-of-life release. Three internal-tooling improvements and one user-visible bug fix found by the new tooling on its first run.

### i18n bug fixes
- `autoUnstorageTitle` and `autoUnstorageSub` were missing from `zh.json` and `pt-pt.json`.
- Five duration keys (`agoMin`, `agoHour`, `agoDay`, `agoMonth`, `agoYear`) now use the same plural-object structure (`{one, other}`) across all 9 locales.

### Internal tooling
- **`npm run i18n:add`** — single command adds or updates one i18n key across all 9 locale files.
- **`npm run i18n:check` + pre-commit hook** — validates locale consistency on every commit. Wired automatically via `core.hooksPath=.githooks/` from the `prepare` script.
- **CSS modularization** — the 8047-line monolithic `inventory.css` split into 8 themed files under `renderer/css/` (`00-base.css` through `70-detail-misc.css`).

---

## v1.4.8 — 2026-05-04

Discovery, repair & ergonomics release.

### Snapmaker LAN discovery
- **Side-panel scan** — slides in from the right. mDNS browse of `_snapmaker._tcp.local.` via `bonjour-service` (IPC bridge `mdns:browse-snapmaker`), plus port-scan fallback on Moonraker port 7125.
- **Per-source batch sizing** — local subnets with batch=24, user-declared extra subnets with batch=4 + 80 ms inter-batch gap.
- **One-click add** — writes the printer doc to Firestore and opens the new printer's detail card with the WebSocket already connecting.
- **Add by IP** collapsible — live IPv4 validation, "Validate" probe, "Continue anyway" fallback.
- **Debug-only scan log** — full journal exportable as JSON.
- **Settings reconnect** — saving an IP change tears down the old WebSocket and reconnects.

### Twin-pair manual repair
- **Repair tool** in the spool detail panel toolbox when the spool isn't paired AND at least one compatible candidate exists.
- **Strict candidate filter** — same `id_brand` + `id_material` + `id_type` + `id_tigertag` + exact RGB. Excludes already-paired and tombstoned rows.
- **Atomic batch write** — `twin_tag_uid` cross-referenced on both docs in a single Firestore batch.
- **Debug-only Unlink** — hold-to-confirm "Unlink" tool when Debug mode is on.

### Spool toolbox (detail panel)
- Bundles: Scan colour (TD1S), Scan TD (TD1S), Link/Unlink twin, Remove from rack, Delete.
- Apple-style row design — borderless soft surface, capsule shapes, hold-to-confirm fill animation for destructive actions.

### Rack management
- **Drop-to-void unassign** — dragging a spool outside any rack card sends it back to the unranked panel.
- **Eject animation** reuses `rp-slot-cascade-out`, matching auto-store / auto-fill visual grammar.
- **Empty-spool handling in unranked** — visible but excluded from every count.
- **Per-spool "Remove from rack"** in the toolbox (hold 1.5 s).

### Filament slot UI (Snapmaker live block)
- Cleaner colour square layout — BASE material only in the square, full identity below.
- **Read-only filament sheet** — same layout as editable mode; `<select>` and "Apply" are `disabled`.

---

## v1.4.7 — 2026-05-04

Major release — 3D Printer integration as a first-class citizen.

### Printer management
- **New "Printers" tab** — drag & drop grid of all printers across 5 brands. Per-card: photo, brand pill, model, online/offline indicator (HTTP ping every 30 s).
- **Side card** — slides from the right; hero shows static photo or live WebRTC camera for Snapmaker.
- **"Add a printer" flow** — brand picker → form. Brand-aware model picker with thumbnails. Written to `users/{uid}/printers/{brand}/devices/{auto-id}` in Firestore.
- **Inline editing in the side card** — every field editable on click; Enter / blur saves to Firestore.

### Snapmaker live integration (Moonraker WebSocket)
- WebSocket to `ws://{ip}:7125/websocket`, JSON-RPC subscribe, capped exponential backoff.
- **Camera** — full-width WebRTC iframe at the top of the side card.
- **Print job card** — preview thumbnail, filename, percentage, elapsed time, progress bar, state pill, layer counter.
- **Temperature row** — compact pills per extruder + bed, red when heating.
- **Filament grid** — 4 large coloured squares (one per extruder), tap-to-edit with pencil / eye icon.
- **Inline filament editor** — bottom sheet: Summary, Filament picker (vendor × material), Color picker (5×5 grid + OS-native custom), Sub-type `<select>`.
- **Request log** (debug mode) — every WS frame in / out, pause / clear, custom JSON send.

### Storage data — schema migration
- `rack_id` / `level` / `position` top-level fields repackaged into a nested `rack: { id, level, position }` sub-object. Same UX pattern as the v1.4.5 UID migration. Twin-aware — every rack write mirrors to the linked twin's doc in the same atomic batch.

---

## v1.4.6 — 2026-05-03

Hot-fix — Windows packaging.

- **Windows artifact name standardised.** `win.artifactName` set to `Tiger-Studio-Manager-Setup-${version}.${ext}` (space-free). Fixes the auto-updater 404 that resulted from GitHub's space→dot rewrite disagreeing with electron-builder's dash encoding in `latest.yml`.
- **Windows code-signature check temporarily disabled.** `nsis.publisherName: []` added. electron-builder was auto-deriving the publisher name from the macOS Apple Developer ID, which never matches the unsigned `.exe`. SHA-512 + size check from `latest.yml` is still enforced.

---

## v1.4.5 — 2026-05-03

- **Google sign-in via Touch ID / passkey.** Loopback OAuth flow (RFC 8252 + PKCE) — the system browser opens for auth so Touch ID, passkeys, and hardware keys work natively. System browser brought back to foreground automatically after the handshake.
- **Lazy on-the-fly migration of legacy decimal spool ids → hex uppercase.** Idempotent, atomic per spool (single Firestore batch per migration), polite (250-500 ms gap between writes). `users/{uid}/uidMigrationMap/{decimal_uid}` serves as a bridge for in-flight legacy UIDs.
- **Migration consent + progress UI.** Consent modal shows spool count + estimated duration; lock-screen progress modal during the sweep. Cmd+Q during migration intercepted by main process — native dialog asks for confirmation before quitting.
- **TigerScale v2 schema cutover.** New field names: `last_heartbeat_at`, `display_name`, `current_spool_uid_1/2`, `wifi_signal_dbm`, `power_source`, `battery_percent`, `is_charging`, `hardware_revision`.
- **Twin-pair display on the TigerScale side-card.** Two tags that reference each other via `twin_tag_uid` render as a single physical spool card.
- **Friend banner repositioned** — the READ-ONLY pill now lives in the top header (left of KPI stats). Own-user mode shows a random welcome greeting instead.
- **Sidebar avatar — swap-back affordance** — a ⇄ badge appears when a friend's inventory is being previewed. The whole avatar acts as a one-click "return to my own inventory" button.

---

## v1.4.4 — 2026-05-02

- **Auto-update toggle.** New "Updates" section in Settings — enable / disable automatic update downloads, and a "Check for updates now" button. Preference persisted to `<userData>/auto-update.json`.
- **Settings panel rebuilt.** Flat panel with hairline-separated sections — Updates / Data / Tools / About — replacing the old card-in-card layout.
- **Top header KPI stats.** 4 stat tiles (Spools / Stock / TigerTag / TigerTag+) moved from the sidebar to the top of the main pane.
- **Storage — `EMPTY` stat for depleted spools.** Slot "Empty" → "Free"; spool "Depleted" → "Empty".
- **Spool detail — Storage location row.** Shows `Rack name · A3` for placed spools; **Auto-assign** button for unplaced spools.
- **Auto Storage + Auto Unstorage** toggles — snapshot-driven, `_inFlight` flag prevents loops.
- **Sidebar — friends quick-access list.** Friends appear under the Friends button as flat rows (avatar + name); click switches the inventory view to that friend's read-only inventory.
- **Readable initials on light avatar colours.** `readableTextOn(bg)` helper computes WCAG relative luminance and switches initials to `#1a1a1a` on light backgrounds.

---

## v1.4.3 — 2026-05-02

Storage view major UX overhaul.

- **Stats bar** — pill tiles: total racks, filled-vs-total slots (mini progress bar), empty count, locked count, clickable "Not Stored" tile. Empty / Locked tiles double as filter chips.
- **Inline rack header** — `Rack 4 · 5/5` on a single line.
- **Kebab menu (⋮)** — per-rack actions: Edit · Auto-fill · Lock all / Unlock all · Clear all · Delete.
- **Press-and-hold for destructive actions** — 1.2-second hold for Clear all and Delete.
- **Visible drop zones during drag** — valid slots pulse, locked slots dim, target slot pops with orange ring + scale-up. Swap targets show `⇄` glyph overlay.
- **Slot animations** — bounce-in on land, staggered 30 ms auto-fill wave, cascade-out for clear-all.
- **Skyline masonry layout** — racks pack tightly into available width; recomputes on resize via `ResizeObserver`.
- **Rich hover tooltip on filled slots** — brand, material · color name, coordinate badge, weight bar.
- **+ New Rack as a stat tile** — first tile of the stats bar, dashed border, `+` glyph.

---

## v1.4.2 — 2026-05-02

- **CI — macOS code signing + notarization.** Releases signed with Apple Developer ID Application + notarized via `notarytool`. No Gatekeeper warning on download. Certificate and App Store Connect API Key decoded from GitHub Secrets at build time.
- **Native modules** (`@pokusew/pcsclite`, `@serialport/bindings-cpp`) correctly signed inside the bundle via `entitlementsInherit` and `cs.disable-library-validation`.
- New `build:mac:unsigned` script for fast local builds without Apple credentials.

---

## v1.4.1 — 2026-05-01

- **Fix — silent login failure on email/password** sign-in. Auth listener was gated on `getActiveId()` matching the new uid, but `setActiveId()` only ran inside the listener. Reordered: `setActiveId` runs after `updateCurrentUser` and before `setupNamedAuth`.
- **Diagnostic report system.** Every caught auth/network error and every `window.error` / `unhandledrejection` captured into a circular buffer. Copy a Markdown report from **Settings → Debug → Report a problem** — includes app version, Electron/Chrome/Node, OS, locale, account count, and the last 50 errors with stack traces.
- Storage / Rack feature gated off in this build until the visualisation skeleton is finalised.
