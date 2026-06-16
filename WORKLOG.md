# Worklog — v1.10.5 (in progress)

## Added
- Anycubic: **Kobra X camera support** (and any model that advertises its stream the same way). The Kobra X streams plain HTTP-FLV like the Kobra 3 V2, but at a tokenized path (`http://<ip>:18088/live/<token>`) advertised in the periodic MQTT `info/report` (`data.urls.rtspUrl`) rather than in HTTP `/info` — so it was wrongly gated off as "no local camera" (earlier RE mis-read its `joinSuccess`/`pushStarted` states as a Tencent TRTC relay). The driver now learns the stream URL from the `info/report` (new `info` case in `_acuMerge` → `conn.data.camUrl`) and feeds that exact URL to the liveness probe + ffmpeg, so `/flv` (Kobra 3 V2) and `/live/<token>` (Kobra X) are handled uniformly; `camSupported` no longer disables a model just because HTTP `/info` omits `rtspUrl`. `flvProbe`/`cam-start` now take an optional URL and the probe accepts `206` (the tokenized path's response) as well as `200`. **LAN only** (cloud-mode camera stays out of scope). PR #2 by @ennisj — `renderer/printers/anycubic/index.js`, `main.js`, `preload.js`, `PROTOCOL.md`.

## Changed

## Fixed

## Removed

## i18n
