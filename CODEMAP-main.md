# `main.js` — code map

`main.js` is the **Electron main process** (~3,180 lines): app/window lifecycle,
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
L1-344       App bootstrap — logging, single-instance, static HTTP server, splash, main window
L345-924     NFC / RFID — reader lifecycle, chip read/write/burn, cloud-encode
L755-996     TD1S color sensor — serial watcher, parse, IPC replay
L997-1158    Auto-updater + migration gate
L1159-1354   Google-auth loopback, shell open, detached camera-wall window
L1355-1861   Printer discovery probes (FlashForge / Creality / Bambu / Elegoo / Snapmaker)
L1862-2017   Infra IPC — image cache, LAN subnets, mDNS, app info, TigerTag DB
L2018-2154   Elegoo MQTT bridge + timelapse download + ffmpeg detection
L2155-2408   Bambu Lab — MQTT (8883) + JPEG-TCP (6000) & RTSP (322) cameras
L2409-2723   Anycubic LAN — MQTT (9883) + slicer-config provisioning + FLV camera (18088)
L2724-3127   Anycubic cloud — signed REST + shared cloud-MQTT (publish + subscribe)
L3128-3180   App lifecycle (whenReady, window-all-closed, activate)
```

---

## App bootstrap, static server, splash & main window (L135-327)

| L | What | Anchors |
|---|---|---|
| 67-176 | Minimal static file server so `location.protocol === 'http:'` (Firebase Auth needs it) | `startRendererServer` |
| 177-251 | Splash window (data-URL HTML) shown before the main window paints | `createSplash`, `revealMainWindow` |
| 252-277 | UID hex→decimal + TigerTag SDK payload builder | `normalizeUid`, `_sdkPayload` |
| 278-344 | `BrowserWindow` creation, preload wiring, CSP, devtools | `createWindow` |

## NFC / RFID reader + chip write (L409-988)

| L | What | Anchors / IPC |
|---|---|---|
| 345-512 | Reader connect/disconnect lifecycle, card-present events, auto-read | `initNFC`, `_onNfcMessage` |
| 458-924 | IPC: `rfid:read-now` / `rfid:write-now` / `rfid:repair` (restore from backup) / `rfid:format` (reinitialize via `TigerTag.asInit`) / `rfid:encode-cloud` / `rfid:burn-one` / `rfid:refresh-api` / `rfid:lookup-product`; surgical page diff before write | `_pagesToWrite`, `_pagesFromBytes` |

## TD1S color sensor (L1004-1004)

| L | What | Anchors / IPC |
|---|---|---|
| 755-996 | Serial-port watcher, TD/color line parse, state replayed to renderer on reload; IPC `td1s:need` / `td1s:release` | `initTD1S` |

## Auto-updater + migration gate (L1250-1301)

| L | What | Anchors / IPC |
|---|---|---|
| 997-1053 | Auto-update on/off preference (on disk) + updater event wiring | `readAutoUpdatePref`, `writeAutoUpdatePref`, `wireUpdaterEvents`, `initUpdater` |
| 1070-1158 | IPC: `migration:set-in-flight`, `install-update`, `update:set-auto` | — |

## Google auth loopback, shell, detached cam window (L1167-1362)

| L | What | IPC |
|---|---|---|
| 1159-1311 | Google OAuth loopback sign-in (`auth:google-loopback`); `shell:open-external` | — |
| 1312-1354 | Detached camera-wall `BrowserWindow` (`cam:open-detached`); `update:check-now` | — |

## Printer discovery probes (L1741-2015)

| L | What | Anchors / IPC |
|---|---|---|
| 1355-1580 | FlashForge — HTTP POST bridge (`ffg:http-post`), UDP multicast (`ffg:multicast-discover`), UDP identity probe port 19000 (`ffg:udp-probe`, returns model+serial credential-free), TCP M115 probe (`ffg:tcp-probe`) | `_ffgParseUdpIdentity` |
| 1525-1556 | Creality — TCP 9999 open-check (`cre:tcp-probe`) | — |
| 1557-1695 | Bambu Lab — SSDP multicast (`bambu:ssdp-discover`) + TLS cert sniff (`bambu:tls-probe`) | `_parseBambuSsdp` |
| 1696-1813 | Elegoo — UDP discovery/probe (`elegoo:udp-discover` / `elegoo:udp-probe`) | `_parseElegooReply` |
| 1814-1861 | Snapmaker — HTTP GET bridge (`snap:http-get`) | — |

## Infra IPC — image cache, subnets, mDNS, app info, DB (L1870-2025)

| L | What | IPC |
|---|---|---|
| 1862-1987 | Image disk cache (`img:get`), LAN /24 subnet list (`net:get-local-subnets`), mDNS Snapmaker browse (`mdns:browse-snapmaker`) | — |
| 1988-2017 | App/platform info for diagnostics (`app:info`, `app:renderer-path`); TigerTag DB lookups (`db:*`) | — |

## Elegoo MQTT bridge + timelapse + ffmpeg (L2026-2162)

| L | What | IPC |
|---|---|---|
| 2018-2049 | Timelapse video download (`timelapse:download`) | — |
| 2050-2122 | Elegoo MQTT 1883 bridge (`elegoo:connect` / `disconnect` / `publish`) | — |
| 2123-2154 | Shared `ffmpeg` binary detection (Bambu RTSP + Anycubic FLV cameras) | — |

## Bambu Lab — MQTT + JPEG-TCP/RTSP cameras (L2579-2579)

| L | What | Anchors / IPC |
|---|---|---|
| 2165-2214 | MQTTS 8883 control bus (`bambulab:connect` / `disconnect` / `publish`) | — |
| 2215-2299 | JPEG-TCP camera, port 6000 (`bambulab:cam-start` / `cam-stop`) — 80-byte auth packet, retry/timeout | `_bambuCamAuthPacket` |
| 2300-2408 | RTSP camera via ffmpeg, port 322 (`bambulab:cam-start-rtsp` / `cam-stop-rtsp`) — 30 fps + low-latency flags | — |

## Anycubic LAN — MQTT, provisioning, FLV camera (L2965-2973)

| L | What | Anchors / IPC |
|---|---|---|
| 2431-2486 | MQTTS 9883 control bus, TLS 1.2 (`anycubic:connect` / `disconnect` / `publish`) | — |
| 2487-2588 | FLV camera via ffmpeg, port 18088 (`anycubic:cam-start` / `cam-stop`) — URL-aware (`/flv` or `/live/<token>`) | — |
| 2589-2655 | Slicer on-disk credential reader (`anycubic:read-slicer-config`) — keyless deobfuscation | `_acuDeobfuscate`, `_acuConfCandidates` |
| 2656-2723 | LAN scan: TCP probe (`anycubic:tcp-probe`), FLV liveness (`anycubic:flv-probe`, accepts 200/206), `/info` (`anycubic:http-info`) | — |

## Anycubic cloud — REST + cloud MQTT (L3118-3479)

| L | What | Anchors / IPC |
|---|---|---|
| 2746-2824 | Signed REST helpers (`Xx-Signature` md5, `XX-Token`) | `_cloudHeaders`, `_cloudFetch` |
| 2786-2908 | Web login (`anycubic:cloud-web-login`) + CDP token grab (`anycubic:cloud-cdp-token`) from a bridge-mode slicer | `_cdpEvaluate` |
| 2909-3097 | REST: `cloud-get-printers`, `cloud-printer-info` (temps + thumbnail + latest project), `cloud-verify`, `cloud-send-order`, `cloud-camera-open` (order 1001 → Agora "shengwang" creds) | — |
| 3098-3125 | Cloud-uploaded files (§9c): `cloud-files-list` (POST `/work/index/files`), `cloud-file-delete` (POST `/work/index/delFiles`); print reuses `cloud-send-order` order 1 | — |
| 3126-3239 | Shared cloud-MQTT client (one per user): `cloud-connect` / `subscribe` / `publish` / `unsubscribe`; RSA-encrypted token login | `_buildCloudLogin`, `_routeCloudMessage`, `_ensureCloudClient` |

## App lifecycle (L3248-3300)

| L | What |
|---|---|
| 3240-3292 | `app.whenReady` (img cache dir, server, window, NFC/TD1S/updater init), `window-all-closed`, `activate` |
