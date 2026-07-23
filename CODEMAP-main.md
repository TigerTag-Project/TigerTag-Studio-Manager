# `main.js` — code map

`main.js` is the **Electron main process** (~3,784 lines): app/window lifecycle,
the static file server, NFC/RFID, TD1S sensor, auto-updater, and the per-brand
printer **discovery probes + MQTT/HTTP/camera bridges** (the renderer can't open
raw TLS/UDP/MQTT sockets, so every printer transport lives here behind IPC).

**Anchor-first navigation**: line numbers drift, anchor names don't. Always
`grep -n "anchorName"` (or `grep -n "ipcMain.*'channel'"`) and trust the grep
over the L-number here — the L-ranges are for orientation only.

Keep in sync: `npm run codemap:check` (pre-commit hook) validates that each
section's function anchors fall inside its declared range.

> **IPC channels** are listed for orientation but are NOT range-checked (they
> contain `:` / `-`, so the checker skips them); only the backticked **function
> names** in the Anchors column are verified.

---

## Bird's-eye structure

```
L1-442       App bootstrap — logging, single-instance, static HTTP server, splash, main window
L443-1137    NFC / RFID — reader lifecycle, chip read/write/burn, cloud-encode
             (USB scale HID transport block inlined at L626-716)
L1138-1379   TD1S color sensor — serial watcher, parse, IPC replay
L1380-1553   Auto-updater + migration gate
L1554-1749   Google-auth loopback, shell open, detached camera-wall window
L1750-2471   Printer discovery probes (FlashForge / Creality / Bambu / Elegoo / Snapmaker)
L2473-2628   Infra IPC — image cache, LAN subnets, mDNS, app info, TigerTag DB
L2629-2765   Elegoo MQTT bridge + timelapse download + ffmpeg detection
L2766-3019   Bambu Lab — MQTT (8883) + JPEG-TCP (6000) & RTSP (322) cameras
L3020-3343   Anycubic LAN — MQTT (9883) + slicer-config provisioning + FLV camera (18088)
L3344-3809   Anycubic cloud — signed REST + shared cloud-MQTT (publish + subscribe)
L3810-3870   App lifecycle (whenReady, window-all-closed, activate)
```

---

## App bootstrap, static server, splash & main window (L1-442)

| L | What | Anchors |
|---|---|---|
| 116-235 | Minimal static file server so `location.protocol === 'http:'` (Firebase Auth needs it) | `startRendererServer` |
| 236-310 | Splash window (data-URL HTML) shown before the main window paints | `createSplash`, `revealMainWindow` |
| 311-335 | UID hex→decimal + TigerTag SDK payload builder | `normalizeUid`, `_sdkPayload` |
| 336-442 | `BrowserWindow` creation, preload wiring, CSP, devtools | `createWindow` |

## NFC / RFID reader + chip write (L443-1137)

| L | What | Anchors / IPC |
|---|---|---|
| 443-625 | Reader connect/disconnect lifecycle, card-present events, auto-read | `_onNfcMessage`, `initNFC` |
| 626-716 | USB scale (Dymo M-series) — HID open + hot-plug poll, frame decode, `usb-scale-update` / `usb-scale-data` events, `usb-scale:state` IPC | `_scaleDecode`, `_tryOpenScale`, `initUsbScale` |
| 717-1137 | IPC: `rfid:read-now` / `rfid:write-now` / `rfid:repair` (restore from backup) / `rfid:format` (reinitialize via `TigerTag.asInit`) / `rfid:encode-cloud` / `rfid:burn-one` / `rfid:refresh-api` / `rfid:lookup-product`; surgical page diff before write | `_pagesFromBytes`, `_pagesToWrite` |

## TD1S color sensor (L1138-1379)

| L | What | Anchors / IPC |
|---|---|---|
| 1138-1379 | Serial-port watcher, TD/color line parse, state replayed to renderer on reload; IPC `td1s:need` / `td1s:release` | `initTD1S` |

## Auto-updater + migration gate (L1380-1553)

| L | What | Anchors / IPC |
|---|---|---|
| 1380-1402 | Auto-update on/off preference (on disk) | `readAutoUpdatePref`, `writeAutoUpdatePref` |
| 1403-1553 | Updater event wiring; IPC: `migration:set-in-flight`, `install-update`, `update:set-auto` | `wireUpdaterEvents`, `initUpdater` |

## Google auth loopback, shell, detached cam window (L1554-1749)

| L | What | IPC |
|---|---|---|
| 1554-1702 | Google OAuth loopback sign-in (`auth:google-loopback`); `shell:open-external` | — |
| 1703-1749 | Detached camera-wall `BrowserWindow` (`cam:open-detached`); `update:check-now` | — |

## Printer discovery probes (L1750-2471)

| L | What | Anchors / IPC |
|---|---|---|
| 1750-1869 | FlashForge — HTTP POST bridge (`ffg:http-post`), UDP multicast (`ffg:multicast-discover`) | — |
| 1870-1971 | FlashForge — UDP identity probe port 19000 (`ffg:udp-probe`, returns model+serial credential-free), TCP M115 probe (`ffg:tcp-probe`) | `_ffgParseUdpIdentity` |
| 1972-2003 | Creality — TCP 9999 open-check (`cre:tcp-probe`) | — |
| 2004-2252 | Bambu Lab — SSDP multicast (`bambu:ssdp-discover`) + TLS cert sniff (`bambu:tls-probe`) + print thumbnail via FTPS | `_parseBambuSsdp` |
| 2253-2370 | Elegoo — UDP discovery/probe (`elegoo:udp-discover` / `elegoo:udp-probe`) | `_parseElegooReply` |
| 2371-2420 | Snapmaker — HTTP GET bridge (`snap:http-get`) | — |
| 2421-2471 | Creality — Moonraker HTTP IPC port 7125, live controls (`cre:http`) | — |

## Infra IPC — image cache, subnets, mDNS, app info, DB (L2473-2628)

| L | What | IPC |
|---|---|---|
| 2473-2527 | Image disk cache (`img:get`) | — |
| 2528-2618 | LAN /24 subnet list (`net:get-local-subnets`), mDNS Snapmaker browse (`mdns:browse-snapmaker`) | — |
| 2618-2628 | App/platform info for diagnostics (`app:info`, `app:renderer-path`); TigerTag DB lookups (`db:*`) | — |

## Elegoo MQTT bridge + timelapse + ffmpeg (L2629-2765)

| L | What | IPC |
|---|---|---|
| 2629-2660 | Timelapse video download (`timelapse:download`) | — |
| 2661-2733 | Elegoo MQTT 1883 bridge (`elegoo:connect` / `disconnect` / `publish`) | — |
| 2734-2765 | Shared `ffmpeg` binary detection (Bambu RTSP + Anycubic FLV cameras) | — |

## Bambu Lab — MQTT + JPEG-TCP/RTSP cameras (L2766-3019)

| L | What | Anchors / IPC |
|---|---|---|
| 2766-2825 | MQTTS 8883 control bus (`bambulab:connect` / `disconnect` / `publish`) | — |
| 2826-2910 | JPEG-TCP camera, port 6000 (`bambulab:cam-start` / `cam-stop`) — 80-byte auth packet, retry/timeout | `_bambuCamAuthPacket` |
| 2911-3019 | RTSP camera via ffmpeg, port 322 (`bambulab:cam-start-rtsp` / `cam-stop-rtsp`) — 30 fps + low-latency flags | — |

## Anycubic LAN — MQTT, provisioning, FLV camera (L3020-3343)

| L | What | Anchors / IPC |
|---|---|---|
| 3020-3106 | MQTTS 9883 control bus, TLS 1.2 (`anycubic:connect` / `disconnect` / `publish`) | — |
| 3107-3212 | FLV camera via ffmpeg, port 18088 (`anycubic:cam-start` / `cam-stop`) — URL-aware (`/flv` or `/live/<token>`) | — |
| 3213-3235 | Slicer on-disk credential reader (`anycubic:read-slicer-config`) — keyless deobfuscation | `_acuDeobfuscate`, `_acuConfCandidates` |
| 3236-3343 | LAN scan: TCP probe (`anycubic:tcp-probe`), FLV liveness (`anycubic:flv-probe`, accepts 200/206), `/info` (`anycubic:http-info`) | — |

## Anycubic cloud — REST + cloud MQTT (L3344-3986)

| L | What | Anchors / IPC |
|---|---|---|
| 3344-3416 | Signed REST helpers (`Xx-Signature` md5, `XX-Token`) | `_cloudHeaders`, `_cloudFetch` |
| 3417-3528 | Web login (`anycubic:cloud-web-login`) + CDP token grab (`anycubic:cloud-cdp-token`) from a bridge-mode slicer | `_cdpEvaluate` |
| 3529-3667 | REST: `cloud-get-printers`, `cloud-printer-info` (temps + thumbnail + latest project), `cloud-verify`, `cloud-send-order`, `cloud-camera-open` (order 1001 → Agora "shengwang" creds) | — |
| 3668-3704 | Cloud-uploaded files (§9c): `cloud-files-list` (POST `/work/index/files`), `cloud-file-delete` (POST `/work/index/delFiles`); print reuses `cloud-send-order` order 1 | — |
| 3705-3809 | Shared cloud-MQTT client (one per user): `cloud-connect` / `subscribe` / `publish` / `unsubscribe`; RSA-encrypted token login | `_buildCloudLogin`, `_routeCloudMessage`, `_ensureCloudClient` |

## App lifecycle (L3810-3870)

| L | What |
|---|---|
| 3810-3870 | `app.whenReady` (img cache dir, server, window, NFC/TD1S/updater init), `window-all-closed`, `activate` |
