# Worklog — v1.8.16 (in progress)

## Added

## Changed

## Fixed
- Spool detail side panel: stop tearing down the panel on every Firestore snapshot. Editing a different spool elsewhere (mobile app, another device, anything firing a Firestore write) used to flash the open side panel — every image and every SVG icon was destroyed and re-created because `subscribeInventory.onSnapshot` unconditionally called `openDetail(state.selected)` → `panelBody.innerHTML = buildPanelHTML(r)`. The snapshot listener now calls `refreshOpenDetail()` which compares a `_rowSignature` of the displayed spool against the last render and only rebuilds the panel when the displayed spool's visible fields actually changed. Editing the open spool's weight still triggers one rebuild (pending-write echo) instead of two or three, since the server-commit echo carries the same signature and is now skipped — `renderer/inventory.js`.

## Removed

## i18n
