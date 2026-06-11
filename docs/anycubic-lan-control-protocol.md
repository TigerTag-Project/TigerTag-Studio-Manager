# Anycubic control protocol — reference & reverse-engineering notes

How Tiger Studio Manager talks to Anycubic printers (LAN + cloud), and the
reverse-engineering history behind it. The original investigation was done in the
ACE-RFID project; this document is the Tiger Studio Manager version — the protocol
facts are the same, the implementation references point at this app's code.

**TL;DR.** Anycubic's *local* control endpoint (`/ctrl` on port 18910) is signed +
encrypted with secrets baked into the closed slicer/app binaries, so it can't be
reproduced from a network capture. The app sidesteps that entirely:

- **LAN mode** — read the printer's **durable local-MQTT credentials** from
  AnycubicSlicerNext's on-disk config, then publish `multiColorBox` get/set **directly
  to the printer's own broker** (`mqtts://printer:9883`, TLS 1.2 + username/password,
  no client cert). No slicer needed at run time.
- **Cloud mode** — reproduce the cloud channel using the public app constants from the
  open-source `hass-anycubic_cloud` integration: signed REST (`getPrinters`/`sendOrder`)
  + cloud MQTT (bundled client cert + token-derived creds). The per-user session token
  is read from a **running** slicer over CDP (attach only — the app never launches it).

The same `multiColorBox` command/report shapes carry both modes, so the report parser
and the UI are shared. Implementation map is at the end of each section.

---

## Implementation map (Tiger Studio Manager)

| Concern | Where |
|--------|-------|
| Driver (connect, parse reports, set slots, camera) | `renderer/printers/anycubic/index.js` |
| Filament / job / temp cards | `renderer/printers/anycubic/cards.js` |
| Discovery + slicer-config import | `renderer/printers/anycubic/probe.js` |
| Add-printer UI (import / scan / manual / cloud) | `renderer/printers/anycubic/add-flow.js` |
| Camera banner | `renderer/printers/anycubic/widget_camera.js` |
| Main-process bridge (LAN MQTT, cloud REST/MQTT, CDP, ffmpeg) | `main.js` (`anycubic:*` IPC) |
| Renderer↔main bridge | `preload.js` (`window.anycubic`, `window.anycubic.cloud`) |
| Bundled cloud certs (PEM client cert+key, CA DER) | `services/anycubicCloudCerts.js` |
| Firestore persistence | `users/{uid}/printers/anycubic/devices` |
| Dev/RE tools | `scripts/acu-mqtt-sniff.mjs`, `acu-cam-test.mjs`, `acu-cam-paths.mjs`, `acu-cloud-test.mjs`, `acu-lan-layout.mjs`, `acu-cloud-extfil.mjs`, `acu-capture-set.mjs` |

---

## Port map (LAN mode ON)

| Port | Protocol | Purpose |
|------|----------|---------|
| **80** | HTTP (bare-`\n` headers) | OctoPrint 1.8.7 emulation — gcode upload & print only |
| **9883** | MQTT over TLS | Control bus (Bambu-style). Cloud-issued username/password. Self-signed cert, not verified |
| **18088** | HTTP-FLV | Camera stream (`http://ip:18088/flv`) — **on-demand** (see *Camera*) |
| **18910** | HTTP (plaintext) | Discovery `/info` (no auth) + signed `/ctrl` (unusable) + gcode upload |

> With LAN mode **off** the printer opens **no** local ports — it's an outbound cloud
> client. LAN mode is what exposes the local API. Cloud-mode printers are reached over
> the *Cloud path* below.

### `GET /info` on :18910 (no auth) — discovery descriptor
```json
{ "deviceType":"fdm", "modelId":"20027", "modelName":"Anycubic Kobra 3 V2",
  "cn":"9B20-…",            // DYNAMIC code — not stable, not creds
  "ctrlType":"lan", "ip":"<ip>", "deviceName":"…",
  "usn":"uuid:fdm:70-68-…", // contains the MAC
  "rtspUrl":"http://<ip>:18088/flv",   // ONLY on local-FLV camera models
  "token":"<16-char, rotates>" }
```
`deviceType:"fdm"` + a numeric `modelId` confirms an Anycubic FDM printer (used by the
scan/manual probe). Note `/info` does **not** expose the broker credentials or the
`deviceId` — those are cloud-issued and only in the slicer config.

### The local wall: `POST /ctrl` is signed + encrypted (unusable)
`/ctrl` requires `?ts=<ms>&nonce=<rand>&did=<32hex>&sign=<md5>`; the `sign` uses an app
secret baked into the closed network plugin, and the response `info` payload is
encrypted. 252 brute-force signature attempts (every key/canonicalization/HMAC combo)
all failed, and the creds are not derivable from any local field. So the local control
*endpoint* is a dead end — which is why we use the printer's own MQTT broker instead.

---

## LAN path — direct to the printer's broker (port 9883)

### Credentials, off disk (no running slicer)
Once AnycubicSlicerNext has paired a LAN printer it caches the full connection set in
`%APPDATA%\AnycubicSlicerNext\AnycubicSlicerNext.conf`, key `machine_list_of_LAN`:
`broker` (`mqtts://<ip>:9883`), `deviceId`, `modeId`/`modelId`, `username`, `password`,
plus the mTLS `devicecrt`/`devicepk` (we only need broker+username+password). The value
is obfuscated with a **keyless, deterministic** transform:

```
stored  =  base64( +5( base64( +5( JSON ) ) ) )
decode  =  base64-decode → subtract 5 per byte → base64-decode → subtract 5 → JSON
```

`main.js` (`anycubic:read-slicer-config`) reads and decodes this directly — no CDP, no
WebView, no running slicer. The credentials are durable (the client cert is valid ~10
years; username/password survive restarts), so this is the primary provisioning path
(see `probe.js → acuReadSlicerCreds`, add-flow "Import from Anycubic Slicer").

> The acquisition wall is unchanged: the printer must have been paired in the slicer
> once (that mints the cloud-issued creds). The creds are **not** locally derivable
> from `/info` fields — confirmed exhaustively. But *reading* them needs only the
> on-disk config, not a running slicer/bridge.

### Connecting
`mqtts://<ip>:9883`, `rejectUnauthorized:false` (self-signed cert), username/password
from the config. **TLS 1.2 forced** — the broker requests an *optional* client cert and
TLS-1.3 stacks abort that handshake when none is supplied; TLS 1.2 handles it. (The
broker does not require the client cert.) See `main.js` `anycubic:connect`.

### Get / set the layout (`multiColorBox`)
```
command  anycubic/anycubicCloud/v1/web/printer/{modelId}/{deviceId}/multiColorBox
report   anycubic/anycubicCloud/v1/printer/public/{modelId}/{deviceId}/multiColorBox/report
```
- **getInfo** → report with `data.multi_color_box[]`. Box `id -1` = external box,
  `0..N-1` = ACE units; `model_id` `40001` = ACE Pro, `40002` = ACE Pro 2.
- **setInfo** → `{multi_color_box:[{id:<box>,slots:[{index:<slot>,type,color:[r,g,b]}]}]}`.
  Honours only `{index, type, color}`; richer fields are silently dropped (full profile
  only via an RFID tag). Pure black is nudged to `010101`.

#### Parse reports as JSON, never regex
The report's field set **and key order differ between ACE generations** (ACE Pro starts
a box with `"id"`; ACE Pro 2 buries `id` mid-object and nests sub-objects, and reorders
slot keys). An order-independent flattener (`acuFlattenReport` in `index.js`) walks
`data.multi_color_box[]` and pulls `id`/`slots[]`/`index`/`type`/`color[0..2]` **by
key**. Validated: Kobra 3 V2 → 8 slots (2 ACE Pro boxes), Kobra X → 20 slots (external
box `-1` with 4 slots + four ACE Pro 2 units). **Lesson: deserialize and navigate by
key — the firmware reorders/nests freely.**

---

## Cloud path — reaching cloud-mode printers

A printer in cloud mode exposes nothing locally, so it's driven through Anycubic's
cloud, authenticated as the account owner. The scheme is documented by the open-source
`hass-anycubic_cloud` integration; reusing its **public app constants** lets the app
issue the same `multiColorBox` orders. Validated end-to-end on a cloud Kobra 3 V2.

### Auth (signed REST)
- REST root `https://cloud-universe.anycubic.com/p/p/workbench/api`.
- Every request carries `Xx-Signature = md5(AID + ts + VER + SEC + nonce + AID)` with
  **public** constants (`AID=f9b3…`, `SEC=0cf7…`, `VER=V3.0.0`) + `XX-Token: <session>`.
- **Use Node `https`, not `fetch`** — the gateway is **case-sensitive on header names**
  and undici/fetch lowercases them (returns `"request error"`); `https` preserves case.

Orders: `POST /work/operation/sendOrder` `{order_id, printer_id, project_id:0, data}` —
**1206** getInfo, **1211** setSlot (`multi_color_box`), **1230** getExtfilbox,
**1229** setExtfilbox. `GET /work/printer/getPrinters?page=1` lists the account's
printers (`device_status` 1=online, 2=offline). See `main.js` `anycubic:cloud-*`.

### Cloud MQTT (reports)
`mqtt-universe.anycubic.com:8883` with a **bundled client cert** (mTLS) +
token-derived creds: `clientId = md5(email+"pcf")`,
`mqttToken = base64(RSA_encrypt(token, CA_pubkey, PKCS1))`,
`username = "user|pcf|"+email+"|"+md5(clientId+mqttToken+clientId)`, `password = mqttToken`.
Subscribe `anycubic/anycubicCloud/v1/+/public/{machineType}/{key}/#`; reports use the
same `multiColorBox/report` (+ telemetry) shapes as LAN, so the same parser handles
them. One **shared** client per signed-in user.

#### BoringSSL gotcha (Electron main process)
The bundled identity is a **legacy PKCS#12** (SHA1/RC2) signed by a SHA1 CA. Electron's
main process is **BoringSSL**, which (a) rejects the OpenSSL `@SECLEVEL=0` cipher string
(`INVALID_COMMAND`) and (b) can't parse the legacy PKCS#12. So we ship the identity as
**PEM cert + key** (`CLIENT_CERT_PEM`/`CLIENT_KEY_PEM` in `anycubicCloudCerts.js`) and
pass `cert`/`key` with **no cipher tweak** — BoringSSL has no SECLEVEL weak-digest gate
(the slicer itself is Chromium/BoringSSL on this same broker). Plain Node (OpenSSL) dev
scripts still use the `.pfx` with `ciphers:'DEFAULT:@SECLEVEL=0'`.

### Token acquisition — attach-only CDP (the app never launches the slicer)
The workbench API needs a **session token** the slicer mints in memory at login. We
verified it is **not persisted anywhere on disk**: the config's `access_token` is an
**OAuth** token (`iss: uc.makeronline.com`) the workbench rejects with `10001`, and the
WebView2 localStorage stores the workbench token as `null`. The OAuth token can't be
exchanged headlessly (`getoauthToken` needs a captcha-gated authorization code). So the
app reads it the way ACE-RFID does — over the **Chrome DevTools Protocol** — but
**attaches only**:

- The user runs the slicer in bridge mode themselves
  (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`), signed in,
  Workbench open. `main.js` `anycubic:cloud-cdp-token` attaches to `127.0.0.1:9222`,
  finds the Workbench page (`url`/`title` matches `workbench`/`orca-ac-web`), and
  `Runtime.evaluate`s `GET_TOKEN` / `GET_USER_INFO` from the Vuex store. **It never
  spawns the slicer** — the auto-launch fallback ACE-RFID had is intentionally not ported.

### Token revocation + recovery (not expiry)
The workbench token is a 90-day JWT (`exp` ~3 months out) — but Anycubic **revokes the
previous token when a new slicer session logs in**, so a stored token goes stale across
sessions. Handling (`index.js`):
- `cloud-send-order` reports the `10001` auth error; on it the driver **re-grabs a fresh
  token from a bridge-mode slicer** (if reachable), persists it to all cloud printer docs
  (`ctx.updateAnycubicCloudToken`), and reconnects the shared MQTT (which rebuilds when
  the token changes). The printer recovers to online on its own.
- If no bridge slicer is reachable, cloud printers drop to offline with a clear
  "re-provision" message instead of silently failing.

### One connection at a time
The cloud broker enforces a **fixed clientId per account** (`md5(email+pcf)`); unique
clientIds are rejected (`Not authorized`). So the app and the slicer's Workbench can't
both hold a cloud MQTT connection simultaneously — they'd kick each other. Setting a
slot is REST and works regardless; live telemetry wants the slicer's Workbench closed.

### Headless login — not pursued
Reproducing email/password login in-app to drop the slicer entirely is walled: the
workbench API has no password login (needs an interactive OAuth code), and the mobile
app's login signs with a secret in obfuscated native code (`ACKeyApp::getCNCodeSecretKey`
in `libac_common_app.so`) that needs runtime extraction on real arm64 hardware. Given
the attach-only token-grab works, this is parked — see the ACE-RFID notes for the full
Frida/Raspberry-Pi-5 record.

---

## Camera — HTTP-FLV (on-demand), and the WebRTC split

Local-FLV models serve an H.264 HTTP-FLV stream on `http://<ip>:18088/flv`. Chromium
can't play FLV, so `main.js` runs **ffmpeg** (bundled `ffmpeg-static`) to remux it to
~5 fps JPEG frames over the `anycubic:cam-frame` IPC (the Bambu-RTSP pattern).

**The stream is on-demand.** `/flv` returns `404` until the printer is told to start
capturing. The activation command was captured from the slicer over the local broker:
publish `{type:"video",action:"startCapture"}` to the `…/video` endpoint; the printer
confirms with a `video/report` `state:"initSuccess"`, after which `/flv` serves. The
driver activates it itself (so the camera works with no slicer), probes `/flv` before
spawning ffmpeg (never loops on the 404), and stops capture on panel close.

**Two transports, gated on `/info.rtspUrl`:**

| | Local FLV (supported) | WebRTC/TRTC (out of scope) |
|--|--|--|
| Example | Kobra 3 V2 (20027) | Kobra X (20030), likely Kobra S1 |
| `/info.rtspUrl` | `http://ip:18088/flv` | absent |
| `video/report` states | `initSuccess` only | `initSuccess`→`joinSuccess`→`pushStarted` |
| `/flv` after activation | `200` + FLV | `400`/`404` (never serves) |
| How it streams | pullable HTTP-FLV | joins a Tencent TRTC room (cloud relay) |

WebRTC/TRTC needs the Tencent SDK + STS tokens (the `CAMERA_OPEN` order returns Tencent
creds; the open integration marks it WIP/unused), so it's **not implemented**. The
driver checks `/info` for `rtspUrl` before activating: WebRTC models stay on the hero
photo, are never sent `startCapture`, and aren't probe-spammed.

---

## External spool with no ACE — the `extfilbox` channel

A printer with **no ACE** attached (e.g. a Kobra 3) reports its standalone external
spool on a **separate channel**, not `multiColorBox`:

```
type "extfilbox", action "reportInfo"  →  data = { id, type, color:[r,g,b], loaded, … }  (single spool)
get  = order 1230 (GET_EXTFILBOX_INFO), data {}
set  = order 1229 (EXTFILBOX),          data { type, color:[r,g,b] }   ← just type+color, no box/slot
```

The set shape was captured from the Workbench (`scripts/acu-capture-set.mjs`, hooking
the page's requests over CDP). The driver requests `extfilbox` alongside `multiColorBox`,
parses the report into a synthetic box `-1` so the filament card shows it, and routes its
set to **1229** (not `multiColorBox` 1211). When `multiColorBox` already reports a real
box `-1` (a Kobra X's 4-slot external box), that path is used instead.

---

## Telemetry families (same subtree, both modes)

Subscribing to the printer's whole public subtree streams the rest of the report
families, parsed in `index.js` `_acuMerge` (field shapes cross-checked against
`hass-anycubic_cloud`):

| `type` | drives |
|--------|--------|
| `print` | job state, filename, progress %, remaining (min), layers, nozzle/bed temps, fan/speed |
| `tempature` (sic) | nozzle/bed current+target |
| `fan` | fan % |
| `status` | busy/free heartbeat |
| `lastWill` | printer online/offline |
| `multiColorBox` | ACE box/slot layout (full on getInfo/setInfo/refresh; partial on dry/feed actions) |
| `extfilbox` | standalone external spool |

The same broker carries a much richer surface (axis move, drying, OTA, light, resin —
`mach_mqtt.dll`'s response model enumerates them all over this one channel). Only the
families above are used today; the rest are a natural extension (same broker, different
`type`/`action`).

---

## Background: why no secret was reproduced

The closed pieces (the `/ctrl` request signing + payload encryption, the cloud login
signing) live cert-tied in the slicer's main executable / an unexposed module, not in
any copyable DLL — inspecting the install shows `AnycubicSlicer.dll` *is* the OrcaSlicer
engine (mangled internal symbols, no bridge API), and the clean `mach_mqtt.dll` /
`MachMQTT.dll` are only protocol + transport (no auth). So provisioning genuinely needs
the real app once (LAN: to mint durable creds; cloud: to mint the session token), which
is exactly the model here — borrow from the slicer once, then run independently (LAN
forever; cloud until the next token revocation).

Capture tooling from the original RE (HTTP/MQTT MITM proxies, the CDP launcher) lives in
the ACE-RFID repo; the Tiger Studio Manager equivalents are the `scripts/acu-*.mjs` dev
tools listed in the implementation map.
