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
L1380-1668   Auto-updater + migration gate
L1669-1931   Google-auth loopback, shell open, detached camera-wall window
L1932-2653   Printer discovery probes (FlashForge / Creality / Bambu / Elegoo / Snapmaker)
L2655-2810   Infra IPC — image cache, LAN subnets, mDNS, app info, TigerTag DB
L2811-2947   Elegoo MQTT bridge + timelapse download + ffmpeg detection
L2948-3201   Bambu Lab — MQTT (8883) + JPEG-TCP (6000) & RTSP (322) cameras
L5736-6060   Anycubic LAN — MQTT (9883) + slicer-config provisioning + FLV camera (18088)
L6061-6472   Anycubic cloud — signed REST + shared cloud-MQTT (publish + subscribe)
L4308-4368   App lifecycle (whenReady, window-all-closed, activate)
```

---

## App bootstrap, static server, splash & main window (L180-418)

| L | What | Anchors |
|---|---|---|
| 116-235 | Minimal static file server so `location.protocol === 'http:'` (Firebase Auth needs it) | `startRendererServer` |
| 236-310 | Splash window (`renderer/splash/`: the ecosystem scene, a loading line in the saved language, a bar fed by the real startup steps, a fade into the main window) shown before the main window paints | `createSplash`, `splashStep`, `_splashLang`, `revealMainWindow` |
| 311-335 | UID hex→decimal + TigerTag SDK payload builder | `normalizeUid`, `_sdkPayload` |
| 336-442 | `BrowserWindow` creation, preload wiring, CSP, devtools | `createWindow` |

## NFC / RFID reader + chip write (L563-1837)

| L | What | Anchors / IPC |
|---|---|---|
| 443-625 | Reader connect/disconnect lifecycle, card-present events, auto-read | `_onNfcMessage`, `initNFC` |
| 626-716 | USB scale (Dymo M-series) — HID open + hot-plug poll, frame decode, `usb-scale-update` / `usb-scale-data` events, `usb-scale:state` IPC | `_scaleDecode`, `_tryOpenScale`, `initUsbScale` |
| 717-1137 | IPC: `rfid:read-now` / `rfid:write-now` / `rfid:repair` (restore from backup) / `rfid:format` (reinitialize via `TigerTag.asInit`) / `rfid:erase` (blank NDEF) / `rfid:write-ndef` + `rfid:ndef-size` + `rfid:ndef-capacity` (link, Wi-Fi, contact… via services/ndef.js; chip room from the capability container, `_ndefCapacity`) / `rfid:encode-cloud` / `rfid:burn-one` / `rfid:refresh-api` / `rfid:lookup-product`; surgical page diff before write | `_pagesFromBytes`, `_pagesToWrite` |
| 1281-1333 | IPC `catalog:fetch-all` — pages the WHOLE product catalogue (`product/get/all`, `per_page` 1000, follows `nextPage`) so the renderer can cache and search it offline | `XANO_PRODUCT_ALL_URL` |

## TD1S color sensor (L1533-1915)

| L | What | Anchors / IPC |
|---|---|---|
| 1505-1813 | Serial-port watcher, TD/color line parse, state replayed to renderer on reload; IPC `td1s:need` / `td1s:release` | `initTD1S` |

## Auto-updater + migration gate (L2146-2284)

| L | What | Anchors / IPC |
|---|---|---|
| 2044-2066 | Auto-update on/off preference (on disk) | `readAutoUpdatePref`, `writeAutoUpdatePref` |
| 2067-2182 | Updater event wiring; IPC: `migration:set-in-flight`, `install-update`, `update:set-auto` | `wireUpdaterEvents`, `initUpdater` |

## Google auth loopback, shell, detached cam window (L1656-1918)

| L | What | IPC |
|---|---|---|
| 1554-1769 | Google OAuth loopback sign-in (`auth:google-loopback`); `shell:open-external` | — |
| 1960-2006 | Detached camera-wall `BrowserWindow` (`cam:open-detached`); `update:check-now` | — |

## Local MCP server — prefs, renderer relay, IPC (L1863-2049)

| L | What | IPC |
|---|---|---|
| 1761-1947 | Read-only MCP server for AI assistants: `<userData>/mcp.json` prefs (enabledFor [uid] / port 5795 / token; server follows the signed-in account via `mcp:set-account`), stdio bridge copied to `<userData>/mcp/`, `tools/call` relayed to the renderer, started by `initMcp()` at boot. Protocol: `services/mcpServer.js` | `mcp:get-config`, `mcp:set-account`, `mcp:set-enabled`, `mcp:new-token`, `mcp:register-tools`, `mcp:call` / `mcp:result`, `mcp:hosted-grants` (Hub hosted-connector grants list / revoke, CORS-exempt) |

## Printer discovery probes (L2564-3299)

| L | What | Anchors / IPC |
|---|---|---|
| 2462-2598 | FlashForge — HTTP POST bridge (`ffg:http-post`), UDP multicast (`ffg:multicast-discover`) | — |
| 2599-2682 | FlashForge — UDP identity probe port 19000 (`ffg:udp-probe`, returns model+serial credential-free), TCP M115 probe (`ffg:tcp-probe`) | `_ffgParseUdpIdentity` |
| 2683-2767 | Creality — TCP 9999 open-check (`cre:tcp-probe`) | — |
| 2768-2967 | Bambu Lab — SSDP multicast (`bambu:ssdp-discover`) + TLS cert sniff (`bambu:tls-probe`) + print thumbnail via FTPS | `_parseBambuSsdp` |
| 2968-3082 | Elegoo — UDP discovery/probe (`elegoo:udp-discover` / `elegoo:udp-probe`) | `_parseElegooReply` |
| 3083-3132 | Snapmaker — HTTP GET bridge (`snap:http-get`) | — |
| 3206-3317 | Prusa — PrusaLink HTTP IPC (`prusa:http`: Digest auth, cached challenge, path allowlist, binary for thumbnails/snapshots) + discovery probe (`prusa:probe`, one unauthenticated `GET /api/version`) | — |
| 3133-3197 | Creality — Moonraker HTTP IPC port 7125, live controls (`cre:http`) | — |

## Infra IPC — image cache, subnets, mDNS, app info, DB (L2832-2987)

| L | What | IPC |
|---|---|---|
| 2730-2784 | Image disk cache (`img:get`) | — |
| 2785-2875 | LAN /24 subnet list (`net:get-local-subnets`), MAC behind a LAN IP from the OS ARP cache, directly attached subnets only (`net:arp-mac`), mDNS Snapmaker browse (`mdns:browse-snapmaker`) | — |
| 2875-2885 | App/platform info for diagnostics (`app:info`, `app:renderer-path`); TigerTag DB lookups (`db:*`) | — |

## Elegoo MQTT bridge + timelapse + ffmpeg (L2988-3124)

| L | What | IPC |
|---|---|---|
| 3426-3455 | Timelapse video download (`timelapse:download`) | — |
| 3456-3528 | Elegoo MQTT 1883 bridge (`elegoo:connect` / `disconnect` / `publish`) | — |
| 3529-3583 | Shared `ffmpeg` binary detection (Bambu RTSP + Anycubic FLV cameras) — each candidate is PROBED, not just stat'ed | — |

## Camera captures — photo/video from printer camera sources, filed per printer under Pictures/Tiger Studio/Captures (cam:* IPC) (L4392-4584)

## Demo mode — printer simulator (L4585-4593)

Registers `services/demo` (`demo:faces`, `demo:allocate`, `demo:sync`, `demo:state`, `demo:set`) with the detected ffmpeg; stops every face on `will-quit`. The simulator itself lives in `services/demo/` — see `docs/DEMO-MODE.md`.

## Bambu Lab — MQTT + JPEG-TCP/RTSP cameras (L4594-4961)

| L | What | Anchors / IPC |
|---|---|---|
| 3584-3644 | MQTTS 8883 control bus (`bambulab:connect` / `disconnect` / `publish`) | — |
| 3645-3792 | JPEG-TCP camera, port 6000 (`bambulab:cam-start` / `cam-stop`) — 80-byte auth packet, retry/timeout | `_bambuCamAuthPacket` |
| 3793-3910 | RTSP camera via ffmpeg, port 322 (`bambulab:cam-start-rtsp` / `cam-stop-rtsp`) — 30 fps + low-latency flags; the spawn is guarded (it throws synchronously on a bad CPU type) | — |
| 4135-4202 | Prusa Buddy3D camera — plain RTSP `rtsp://<camera-ip>/live` via the same ffmpeg pipeline, 15 fps (`prusa:cam-start-rtsp` / `prusa:cam-stop-rtsp`, frames on `prusa:cam-frame`) | — |

## Bambu Lab cloud — REST + shared cloud MQTT (L4962-5542)

| L | What | Anchors / IPC |
|---|---|---|
| 3911-4003 | Tolerant REST helper over ELECTRON's `net` — Chromium's stack on purpose, because the login sits behind Cloudflare, which reads the TLS fingerprint | `_bblFetch`, `_bblHeaders` |
| 4004-4127 | Auth: `cloud-send-code`, `cloud-login` (code / password, `verifyCode` + `tfa` branches), `cloud-tfa` (token arrives in a COOKIE), `cloud-uid` (token is NOT a JWT), `cloud-bind` (machines + their LAN access codes), `cloud-device-version` | — |
| 4128-4297 | ONE cloud-MQTT client per ACCOUNT: `cloud-connect` (us→eu fallback), `cloud-subscribe` (+ `pushall`), `cloud-publish`, `cloud-unsubscribe`, `cloud-disconnect`. Telemetry is emitted on the LAN `bambulab:message` channel — same payload, same parser | `_bblCloudOpen`, `_bblCloudPushAll` |

## Anycubic LAN — MQTT, provisioning, FLV camera (L5654-5978)

| L | What | Anchors / IPC |
|---|---|---|
| 5505-5581 | MQTTS 9883 control bus, TLS 1.2 (`anycubic:connect` / `disconnect` / `publish`) | — |
| 5582-5675 | FLV camera via ffmpeg, port 18088 (`anycubic:cam-start` / `cam-stop`) — URL-aware (`/flv` or `/live/<token>`) | — |
| 5676-5741 | Slicer on-disk credential reader (`anycubic:read-slicer-config`) — keyless deobfuscation | `_acuDeobfuscate`, `_acuConfCandidates` |
| 5742-5806 | LAN scan: TCP probe (`anycubic:tcp-probe`), FLV liveness (`anycubic:flv-probe`, accepts 200/206), `/info` (`anycubic:http-info`) | — |

## Anycubic cloud — REST + cloud MQTT (L5979-6459)

| L | What | Anchors / IPC |
|---|---|---|
| 3771-3843 | Signed REST helpers (`Xx-Signature` md5, `XX-Token`) | `_cloudHeaders`, `_cloudFetch` |
| 3844-3955 | Web login (`anycubic:cloud-web-login`) + CDP token grab (`anycubic:cloud-cdp-token`) from a bridge-mode slicer | `_cdpEvaluate` |
| 3956-4094 | REST: `cloud-get-printers`, `cloud-printer-info` (temps + thumbnail + latest project), `cloud-verify`, `cloud-send-order`, `cloud-camera-open` (order 1001 → Agora "shengwang" creds) | — |
| 4095-4131 | Cloud-uploaded files (§9c): `cloud-files-list` (POST `/work/index/files`), `cloud-file-delete` (POST `/work/index/delFiles`); print reuses `cloud-send-order` order 1 | — |
| 4132-4305 | Shared cloud-MQTT client (one per user): `cloud-connect` / `subscribe` / `publish` / `unsubscribe`; RSA-encrypted token login | `_buildCloudLogin`, `_routeCloudMessage`, `_ensureCloudClient` |

## App lifecycle (L6200-6265)

| L | What |
|---|---|
| 5565-5629 | `app.whenReady` (img cache dir, server, window, NFC/TD1S/updater init), `window-all-closed`, `activate` |
