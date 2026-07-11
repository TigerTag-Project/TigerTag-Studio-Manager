# Worklog — v2.5.1 (in progress)

## Added
- Inventory **Table view**: the Price column now shows an **"Add price"** action for filaments with no price (single rows + group headers), opening the product price editor straight into the input — read-only in a friend view. Reuses `reorderAddPrice` — `renderer/inventory.js` (`_priceCell` + the two table row click handlers), `renderer/css/70-detail-misc.css`
- A **red cart badge** on the "To order" view button showing the number of products currently in the active cart (below min-stock, not set aside). Updated live on inventory / product / order-view changes; hidden at 0, "99+" past 99 — `renderer/inventory.html`, `renderer/inventory.js` (`_cartCount`/`_updateCartBadge`, called from `renderStats`, the products snapshot, and `renderProductsView`), `renderer/css/70-detail-misc.css`

## Changed
- Notification centre reworked toward a **social-style persistent feed** (phase 1): **low-stock alerts are now Firestore events** (`users/{uid}/notifications`, type `low_stock`) instead of ephemeral local notices — they persist, sync across devices, carry a **time-ago**, and stay in history. One event per genuine dip below min (a per-account `localStorage` active-set re-arms on restock and prevents re-firing while below / on restart). The feed is **capped at 40** (newest, `orderBy createdAt desc limit(40)`), notifications are **no longer deletable** (✕ removed), owner-event rows are clickable to their action, and a **"Mark all read"** header button + open-marks-all-read drop the unread badge to 0 (badge now = pending friend requests + unread Firestore only; local device notices — community / paxx / app-update — show but don't inflate it). New `_pushNotif` helper; backend `firestore.rules` gains an owner-`create` branch for types `["low_stock","community","announcement"]` — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/20-friends.css`, `TigerTag_Firebase_Backend/firestore.rules`, i18n `notifMarkAllRead`



## Fixed
- The "Buy me a coffee" notification-centre entry now uses our **official cup SVG** (`logo_buy_me_coffee.svg`) instead of the generic feather glyph — and it's finally a proper community nudge: `"coffee"` was missing from `isCommunity`, so the notif had no yellow chip and, worse, **wasn't clickable** (couldn't open the support page). Now branded + clickable like Discord/Shop — `renderer/inventory.js`, `renderer/css/20-friends.css`

## Removed
- Dead `assets/svg/icons/icon_coffee.svg` (feather cup) + its `.icon-coffee` CSS — the coffee cup everywhere now uses the official brand SVG — `renderer/css/70-detail-misc.css`

## i18n
