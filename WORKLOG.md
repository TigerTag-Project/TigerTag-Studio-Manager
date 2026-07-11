# Worklog — v2.6.0 (held for testing — release cancelled, commit on main)

## Added

## Changed
- Notification centre: material/product illustrations now render as a **rounded square** (like the cart's `.pv-thumb`) instead of a circular chip — `renderer/css/20-friends.css` (`.notif-ic--img` border-radius)

## Fixed
- Opening the Product-info card (or the reorder card) while the **notification centre was open** left the notif panel on top, hiding the card behind it. `openProductCard` / `openReorderPanel` now dismiss the notif centre first (like the other right-side cards) — `renderer/inventory.js`

## Removed

## i18n
