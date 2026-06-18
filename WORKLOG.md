# Worklog — v1.10.9 (in progress)

## Added
- Anycubic: the cloud (Agora) camera now shows in the **cam wall**, not just the side panel — closing a LAN-vs-cloud gap. The wall already started the player (it connects via `acuConnect` without `skipCam`) and renders the shared banner; this adds the missing teardown — new `acuReleaseCloudCameras()` leaves the Agora channels when you exit the cam wall (LAN ffmpeg is local, but staying joined to Agora off-screen burns the account's RTC minutes + bandwidth). `renderer/printers/anycubic/index.js`, `renderer/inventory.js`.
- Anycubic: the cloud (Agora) camera now also works in the **detached cam window** — the last LAN-vs-cloud camera-surface gap. The cloud reuses the same Agora subscriber uid per `cameraOpen`, so a second client in the detached window kicks the main one — so instead the main renderer's **single** Agora client captures its video to JPEG (~6 fps canvas grab) and relays the frames over `BroadcastChannel('acu-cam')`; the detached window's new `acu_bc` cam type (`renderer/cam/cam.js`) renders them as an `<img>`, the same pattern as FlashForge's `ffg_bc`. The detached window pings 'want' periodically, which gate the capture and keep the player alive while detached (`acuAgoraOnRelayWant`/`OnRelayEnd` in `index.js`; `acuReleaseCloudCameras` skips a relaying camera). `_serializeCamerasForDetach` emits `acu_bc` for cloud printers — gated on `renderCamBanner` non-empty so camera-less printers (e.g. a base Kobra 3) no longer get a stuck card (LAN stays `acu_ipc`).
- Anycubic: the cloud (Agora) camera now **renews its RTC token** so long viewing sessions don't drop. The order-1001 `rtc_token` is short-lived; the player refreshes it on Agora's `token-privilege-will-expire` (re-call `cameraOpen` → `client.renewToken`, no interruption) and re-joins on `token-privilege-did-expire`. `agora-cam.js` (`_renewToken` + a `renew` fn passed to `acuAgoraStart`), `index.js` (`_acuCloudCameraCreds`).
- Bambu heated-chamber setpoint. The chamber temperature pill is now editable (click → set target) on actively-heated-chamber models (X1E, H2S, H2D, H2D Pro, H2C, X2D — `bambuModelId` 6/7/8/9/11/12); passive-chamber models (X1C) stay read-only. The command is ported from ha-bambulab (PROTOCOL §16): X1E uses `M141 S{T}`, H2-series/X2D gate the heater behind the airduct mode — `M145 P1`+`M141 S{T}` above 40 °C, `M141 S{T}`+`M145 P0` at/below 40 °C. The chamber target is read back from the packed `device.ctc.info.temp` (`>>16`). `printers/bambulab/cards.js`, `printers/bambulab/index.js`, `printers/bambulab/PROTOCOL.md` (§16)

## Changed

## Fixed
- Bambu AMS humidity/temperature now shows for **every** AMS unit, not just when exactly one is connected. A machine with multiple AMS (e.g. the H2C reports 2) previously showed nothing; the title meta now lists each unit (prefixed A / B / … when there's more than one) using the real `humidity_raw` % + temperature, AMS Lite still skipped. `printers/bambulab/cards.js`

## Removed

## i18n
