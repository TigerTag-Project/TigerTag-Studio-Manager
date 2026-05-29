# Worklog — v1.8.9 (in progress)

## Added
- Creality LAN discovery in the "Add printer → Scan" flow — mirrors the mobile Flutter scanner and the existing Snapmaker/FlashForge desktop flows. Choice modal (Scan vs Manual), live LAN scan panel with one-click add, and manual-IP probe. Two-stage probe: fast TCP `:9999` port-open filter in the main process, then a renderer WebSocket handshake (`get printerInfo`, heartbeat-aware frame accumulation, `isCrealityLike` validation) — unconfirmed hosts are dropped. Common Creality subnets (192.168.1, 192.168.40) always scanned; user extra subnets persisted in localStorage so they survive a Restart scan. Logs a clear error in the debug scan log when the IPC bridge isn't loaded (app needs a full relaunch). `cre:tcp-probe` IPC + `creTcpProbe` preload bridge — `main.js`, `preload.js`, `renderer/printers/creality/probe.js`, `renderer/printers/creality/add-flow.js`, `renderer/inventory.js`

## Changed
- Creality printer settings: `Root` account + password are now optional (were required). Most Creality printers — incl. the Ender-3 V4 — expose the WebSocket without auth and the live driver connects fine with empty credentials — `renderer/printers/creality/settings.js`
- Friend (read-only) view now hides the write-action buttons (`+ Scan` and `Add product` / `Add device`) — they can't act on a friend's docs — `renderer/inventory.js` (`renderFriendBanner`)

## Fixed

## Removed

## i18n
- Added: `creAddChoiceTitle`, `creScanEmpty` — 9 locales (all other scan UI strings reuse the shared `snap*` keys)
