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
L443-1051    NFC / RFID — reader lifecycle, chip read/write/burn, cloud-encode
L1052-1293   TD1S color sensor — serial watcher, parse, IPC replay
L1294-1467   Auto-updater + migration gate
L1468-1663   Google-auth loopback, shell open, detached camera-wall window
L1664-2385   Printer discovery probes (FlashForge / Creality / Bambu / Elegoo / Snapmaker)
L2387-2542   Infra IPC — image cache, LAN subnets, mDNS, app info, TigerTag DB
L2543-2679   Elegoo MQTT bridge + timelapse download + ffmpeg detection
L2680-2933   Bambu Lab — MQTT (8883) + JPEG-TCP (6000) & RTSP (322) cameras
L2934-3257   Anycubic LAN — MQTT (9883) + slicer-config provisioning + FLV camera (18088)
L3258-3723   Anycubic cloud — signed REST + shared cloud-MQTT (publish + subscribe)
L3724-3784   App lifecycle (whenReady, window-all-closed, activate)
```

---

## App bootstrap, static server, splash & main window (L1-442)

| L | What | Anchors |
|---|---|---|
| 116-235 | Minimal static file server so `location.protocol === 'http:'` (Firebase Auth needs it) | `startRendererServer` |
| 236-310 | Splash window (data-URL HTML) shown before the main window paints | `createSplash`, `revealMainWindow` |
| 311-335 | UID hex→decimal + TigerTag SDK payload builder | `normalizeUid`, `_sdkPayload` |
| 336-442 | `BrowserWindow` creation, preload wiring, CSP, devtools | `createWindow` |

## NFC / RFID reader + chip write (L443-1051)

| L | What | Anchors / IPC |
|---|---|---|
| 443-557 | Reader connect/disconnect lifecycle, card-present events, auto-read | `_onNfcMessage`, `initNFC` |
| 558-1051 | IPC: `rfid:read-now` / `rfid:write-now` / `rfid:repair` (restore from backup) / `rfid:format` (reinitialize via `TigerTag.asInit`) / `rfid:encode-cloud` / `rfid:burn-one` / `rfid:refresh-api` / `rfid:lookup-product`; surgical page diff before write | `_pagesFromBytes`, `_pagesToWrite` |

## TD1S color sensor (L1052-1293)

| L | What | Anchors / IPC |
|---|---|---|
| 1052-1293 | Serial-port watcher, TD/color line parse, state replayed to renderer on reload; IPC `td1s:need` / `td1s:release` | `initTD1S` |

## Auto-updater + migration gate (L1294-1467)

| L | What | Anchors / IPC |
|---|---|---|
| 1294-1316 | Auto-update on/off preference (on disk) | `readAutoUpdatePref`, `writeAutoUpdatePref` |
| 1317-1467 | Updater event wiring; IPC: `migration:set-in-flight`, `install-update`, `update:set-auto` | `wireUpdaterEvents`, `initUpdater` |

## Google auth loopback, shell, detached cam window (L1468-1663)

| L | What | IPC |
|---|---|---|
| 1468-1616 | Google OAuth loopback sign-in (`auth:google-loopback`); `shell:open-external` | — |
| 1617-1663 | Detached camera-wall `BrowserWindow` (`cam:open-detached`); `update:check-now` | — |

## Printer discovery probes (L1664-2385)

| L | What | Anchors / IPC |
|---|---|---|
| 1664-1783 | FlashForge — HTTP POST bridge (`ffg:http-post`), UDP multicast (`ffg:multicast-discover`) | — |
| 1784-1885 | FlashForge — UDP identity probe port 19000 (`ffg:udp-probe`, returns model+serial credential-free), TCP M115 probe (`ffg:tcp-probe`) | `_ffgParseUdpIdentity` |
| 1886-1917 | Creality — TCP 9999 open-check (`cre:tcp-probe`) | — |
| 1918-2166 | Bambu Lab — SSDP multicast (`bambu:ssdp-discover`) + TLS cert sniff (`bambu:tls-probe`) + print thumbnail via FTPS | `_parseBambuSsdp` |
| 2167-2284 | Elegoo — UDP discovery/probe (`elegoo:udp-discover` / `elegoo:udp-probe`) | `_parseElegooReply` |
| 2285-2334 | Snapmaker — HTTP GET bridge (`snap:http-get`) | — |
| 2335-2385 | Creality — Moonraker HTTP IPC port 7125, live controls (`cre:http`) | — |

## Infra IPC — image cache, subnets, mDNS, app info, DB (L2387-2542)

| L | What | IPC |
|---|---|---|
| 2387-2441 | Image disk cache (`img:get`) | — |
| 2442-2532 | LAN /24 subnet list (`net:get-local-subnets`), mDNS Snapmaker browse (`mdns:browse-snapmaker`) | — |
| 2532-2542 | App/platform info for diagnostics (`app:info`, `app:renderer-path`); TigerTag DB lookups (`db:*`) | — |

## Elegoo MQTT bridge + timelapse + ffmpeg (L2543-2679)

| L | What | IPC |
|---|---|---|
| 2543-2574 | Timelapse video download (`timelapse:download`) | — |
| 2575-2647 | Elegoo MQTT 1883 bridge (`elegoo:connect` / `disconnect` / `publish`) | — |
| 2648-2679 | Shared `ffmpeg` binary detection (Bambu RTSP + Anycubic FLV cameras) | — |

## Bambu Lab — MQTT + JPEG-TCP/RTSP cameras (L2680-2933)

| L | What | Anchors / IPC |
|---|---|---|
| 2680-2739 | MQTTS 8883 control bus (`bambulab:connect` / `disconnect` / `publish`) | — |
| 2740-2824 | JPEG-TCP camera, port 6000 (`bambulab:cam-start` / `cam-stop`) — 80-byte auth packet, retry/timeout | `_bambuCamAuthPacket` |
| 2825-2933 | RTSP camera via ffmpeg, port 322 (`bambulab:cam-start-rtsp` / `cam-stop-rtsp`) — 30 fps + low-latency flags | — |

## Anycubic LAN — MQTT, provisioning, FLV camera (L2934-3257)

| L | What | Anchors / IPC |
|---|---|---|
| 2934-3020 | MQTTS 9883 control bus, TLS 1.2 (`anycubic:connect` / `disconnect` / `publish`) | — |
| 3021-3126 | FLV camera via ffmpeg, port 18088 (`anycubic:cam-start` / `cam-stop`) — URL-aware (`/flv` or `/live/<token>`) | — |
| 3127-3149 | Slicer on-disk credential reader (`anycubic:read-slicer-config`) — keyless deobfuscation | `_acuDeobfuscate`, `_acuConfCandidates` |
| 3150-3257 | LAN scan: TCP probe (`anycubic:tcp-probe`), FLV liveness (`anycubic:flv-probe`, accepts 200/206), `/info` (`anycubic:http-info`) | — |

## Anycubic cloud — REST + cloud MQTT (L3258-3723)

| L | What | Anchors / IPC |
|---|---|---|
| 3258-3330 | Signed REST helpers (`Xx-Signature` md5, `XX-Token`) | `_cloudHeaders`, `_cloudFetch` |
| 3331-3442 | Web login (`anycubic:cloud-web-login`) + CDP token grab (`anycubic:cloud-cdp-token`) from a bridge-mode slicer | `_cdpEvaluate` |
| 3443-3581 | REST: `cloud-get-printers`, `cloud-printer-info` (temps + thumbnail + latest project), `cloud-verify`, `cloud-send-order`, `cloud-camera-open` (order 1001 → Agora "shengwang" creds) | — |
| 3582-3618 | Cloud-uploaded files (§9c): `cloud-files-list` (POST `/work/index/files`), `cloud-file-delete` (POST `/work/index/delFiles`); print reuses `cloud-send-order` order 1 | — |
| 3619-3723 | Shared cloud-MQTT client (one per user): `cloud-connect` / `subscribe` / `publish` / `unsubscribe`; RSA-encrypted token login | `_buildCloudLogin`, `_routeCloudMessage`, `_ensureCloudClient` |

## App lifecycle (L3724-3784)

| L | What |
|---|---|
| 3724-3784 | `app.whenReady` (img cache dir, server, window, NFC/TD1S/updater init), `window-all-closed`, `activate` |
