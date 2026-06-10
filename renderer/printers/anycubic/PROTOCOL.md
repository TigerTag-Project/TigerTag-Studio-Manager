# Anycubic — LAN protocol reference (agent skill)

Self-contained reference for the Anycubic integration. Lets an AI (or human)
work on `printers/anycubic/` without external sources. Distilled from the
ACE-RFID reverse-engineering effort (`ACE-RFID/docs/LAN-Control-Protocol.md`,
validated on a Kobra 3 V2 + ACE Pro and a Kobra X + ACE Pro 2).

## §1 Big picture

Anycubic's own control channel is **signed + encrypted** (secrets baked into
the closed slicer/app binaries) and cannot be reproduced. But every command
ultimately lands on the printer's **own local MQTT broker**, and the broker
only needs TLS + username/password — credentials that are **durable**
(~10-year pairing, survive reboots and slicer restarts) and cached **on disk**
by AnycubicSlicerNext. So the integration:

1. Reads broker credentials from the slicer's config file (one-time import —
   the slicer must have paired the printer once, but does NOT need to run).
2. Talks MQTT directly to `mqtts://<printer-ip>:9883` forever after.

A printer is in **LAN mode** or **cloud mode**, never both. Cloud-mode
printers expose NOTHING locally (no open ports at all) — only LAN-mode
printers are supported here. (A cloud channel exists and was reproduced in
ACE-RFID via the `hass-anycubic_cloud` constants, but it needs an expiring
session token; out of scope for this integration.)

## §2 Port map (LAN mode ON)

| Port  | Protocol        | Purpose                                                    |
|-------|-----------------|------------------------------------------------------------|
| 80    | HTTP (bare-`\n`)| OctoPrint 1.8.7 emulation — gcode upload + print only      |
| 9883  | MQTT over TLS   | **Control bus** — what this integration uses               |
| 18088 | HTTP-FLV        | Camera stream (`http://ip:18088/flv`) — §5c, ffmpeg remux  |
| 18910 | HTTP plaintext  | Discovery `/info` (no auth) + signed `/ctrl` (unusable)    |

With LAN mode OFF the printer opens **no local ports** (it's an outbound
cloud client) — scans find nothing, which is correct behaviour.

## §3 Discovery — `GET http://<ip>:18910/info` (no auth)

CORS-enabled (`Access-Control-Allow-Origin: *`), plain JSON:

```json
{
  "deviceType": "fdm",
  "modelId": "20027",                       // numeric model id (topic part!)
  "modelName": "Anycubic Kobra 3 V2",
  "cn": "9B20-B268-EEDF-8A5C",              // DYNAMIC code — not stable, not creds
  "ctrlType": "lan",
  "ip": "<ip>",
  "deviceName": "Anycubic Kobra 3 V2",
  "usn": "uuid:fdm:70-68-71-9A-FA-00",      // contains the MAC
  "token": "<16-char, rotates>"
}
```

⚠️ `/info` does **NOT** expose the broker `deviceId`, `username` or
`password` — those are cloud-issued and only exist in the slicer's config.
The `cn` and `token` fields are dynamic and **cannot** derive the broker
credentials (exhaustively ruled out in the ACE-RFID research: 252 signature
attempts, all hash/encode combinations). Scan results are therefore matched
to imported credentials **by IP** (or used to update a stale DHCP IP on an
already-imported printer).

Scan strategy (probe.js): TCP open-check on 18910 (650 ms, main process) →
`GET /info` confirm (main-process fetch). `deviceType === "fdm"` + a numeric
`modelId` confirms an Anycubic FDM printer.

## §4 Credentials — the slicer's on-disk cache

**File:** `AnycubicSlicerNext.conf`, key `"machine_list_of_LAN"`.

| OS      | Path |
|---------|------|
| Windows | `%APPDATA%\AnycubicSlicerNext\AnycubicSlicerNext.conf` |
| macOS   | `~/Library/Application Support/AnycubicSlicerNext/AnycubicSlicerNext.conf` (unverified) |
| Linux   | `~/.config/AnycubicSlicerNext/AnycubicSlicerNext.conf` (unverified) |

The value is obfuscated with a **keyless, deterministic** transform:

```
stored  =  base64( shift+5( base64( shift+5( JSON ) ) ) )
decode  =  base64-decode → subtract 5 per byte → base64-decode → subtract 5 → JSON
```

Decoded: a JSON array, one entry per paired LAN printer:

```json
[{ "broker": "mqtts://192.168.1.46:9883", "deviceId": "<32-hex>",
   "modeId": "20027", "username": "userXXXXXXXX", "password": "XXXXXXXXX",
   "name": "Anycubic Kobra 3 V2",
   "devicecrt": "-----BEGIN CERTIFICATE-----…", "devicepk": "…" }]
```

Notes:
- `modeId` (sic) is the numeric model id — same value as `/info.modelId`.
- `devicecrt`/`devicepk` (mTLS client cert+key) exist but are **not needed**:
  the broker accepts plain TLS + username/password.
- Implementation: `main.js` → `anycubic:read-slicer-config` IPC.
- The decode is ~15 lines; if Anycubic changes the obfuscation it's a re-crack
  of a config format, not a protocol wall.

**Hard wall (by design):** a printer that was never paired in the slicer has
no credentials anywhere — first-time pairing always happens in
AnycubicSlicerNext. The import flow must say this honestly.

## §5 MQTT control bus — port 9883

Connection (see `main.js` `anycubic:connect`):
- `mqtts://<ip>:9883`, `rejectUnauthorized: false` (self-signed cert),
  username/password from §4.
- **Force TLS 1.2** (`minVersion`+`maxVersion`). The broker requests an
  *optional* client certificate; TLS 1.3 stacks abort that handshake when no
  cert is supplied. TLS 1.2 handles it gracefully.

Topics (`{modelId}` = numeric model id, `{deviceId}` = 32-hex device id):

```
command  anycubic/anycubicCloud/v1/web/printer/{modelId}/{deviceId}/multiColorBox
report   anycubic/anycubicCloud/v1/printer/public/{modelId}/{deviceId}/multiColorBox/report
```

Request body (both actions):

```json
{ "type": "multiColorBox", "action": "getInfo" | "setInfo",
  "timestamp": <epoch-ms>, "msgid": "<uuid>", "data": { … only for setInfo … } }
```

### getInfo → layout report

```json
{ "state": "success", "code": 200, "data": { "head_tools_model": 0,
  "multi_color_box": [
    { "id": 0, "model_id": 40001, "temp": 33, "slots": [
        { "index": 0, "sku": "", "type": "PLA", "color": [0,0,255], … }, …(4)
    ]}, …
]}}
```

- Box `id` **-1** = external/standalone spool holder; `0..N-1` = ACE units;
  each box has slots `0..3`.
- `model_id` 40001 = ACE Pro, 40002 = ACE Pro 2.
- ACE Pro 2 boxes add `drying_status`, `feed_status`, `auto_feed`, etc.

⚠️ **Parse the report as real JSON, never with patterns.** Field ORDER and
the field SET differ between ACE generations (ACE Pro starts boxes with
`"id"`, ACE Pro 2 buries `id` mid-object and nests sub-objects). Walk
`data.multi_color_box[]` and read `id` / `slots[]` / `index` / `type` /
`color[0..2]` by key — see `flattenReport()` in index.js.

### setInfo — set one slot's filament

```json
"data": { "multi_color_box": [
  { "id": <box>, "slots": [ { "index": <0-3>, "type": "PETG", "color": [r,g,b] } ] }
]}
```

- The printer honors **only `{index, type, color}`** — richer fields (sku,
  brand, temps, diameter) are accepted (`code:200`) but **silently dropped**.
  Full profiles only enter a slot via an Anycubic RFID tag (out of scope).
- `type` must be a base material name the ACE accepts (PLA, PLA+, PETG, TPU,
  ABS, ASA, …) — map display names like "PLA Matte" to a base type first.
- **Pure black `[0,0,0]` renders as transparent/empty** on the ACE display —
  nudge to `[1,1,1]` like the slicer does.
- There is no per-command ACK; a `getInfo` round-trip after `setInfo` (or an
  optimistic local patch) confirms the result.

## §5b Report families — telemetry (print / tempature / fan / status / …)

The integration subscribes to the printer's whole public subtree
(`anycubic/anycubicCloud/v1/printer/public/{modelId}/{deviceId}/#`) — every
report family arrives on `…/{family}/report` with the same envelope:

```json
{ "type": "<family>", "action": "<action>", "state": "<state>",
  "timestamp": …, "msgid": "…", "code": 200, "data": { … } }
```

Field shapes below are cross-checked against the open-source
**hass-anycubic_cloud** integration (`data_models/printer.py →
process_mqtt_update`), which parses these exact payloads from the cloud
broker; the local broker carries the same reports (proven for multiColorBox).
⚠️ Treat as high-confidence but validate on hardware — parse defensively, by
key, and never fail on a missing field.

| `type` | action/state pairs | `data` fields |
|--------|--------------------|----------------|
| `print` | `start`/`printing`·`preheating`·`checking`·`downloading`·`finished`·`failed`·`stoped`(sic)·`stopping`; `pause`/`pausing`·`paused`; `resume`/`resuming`·`resumed`; `start`\|`update`/`updated` (data tick) | `taskid`, `filename`, `progress` (0-100 int), `remain_time` (**minutes**), `print_time`, `curr_layer`, `total_layers`, `supplies_usage`; the `updated` tick also carries `curr_hotbed_temp`, `curr_nozzle_temp` and `settings { target_hotbed_temp, target_nozzle_temp, fan_speed_pct, print_speed_pct, print_speed_mode }` |
| `tempature` (sic) | `auto`/`done` | `curr_hotbed_temp`, `curr_nozzle_temp`, `target_hotbed_temp`, `target_nozzle_temp` |
| `fan` | `auto`/`done` | `fan_speed_pct` |
| `status` | `workReport`/`free`·`busy` | — (printer busy/idle heartbeat) |
| `lastWill` | `onlineReport`/`online`·`offline` | — |
| `multiColorBox` | `getInfo`·`setInfo`·`refresh`/`success` (full layout); `autoUpdateDryStatus`·`setDry`/`success`, `feedFilament`/`done`, `autoUpdateInfo`/`done`, `setAutoFeed`/`done` (**partial** box objects — no `slots`!) | see §5 — only re-flatten the layout on full-layout actions; partial actions carry `temp`, `drying_status`, `loaded_slot`, `feed_status`, `auto_feed` |
| `file` | `listLocal`·`listUdisk`/`done`, `deleteLocal`·`deleteUdisk`/`success` | `records[]` (file lists) — not used yet |
| `ota` | `reportVersion`/`done`, `update`/`start`·`downloading`·`updating` | firmware versions/progress — not used yet |
| `peripherie` | `query`/`done` | `camera`, `multiColorBox`, `udisk` booleans — not used yet |
| `user` | `bindQuery`/`done`, `unbind`/`done` | account binding — not used |

State mapping used by the driver (`_acuPrintState` in index.js):
`printing/resumed → printing`, `preheating/checking/downloading → preparing`,
`pausing/paused → paused`, `finished → finished`, `failed → failed`,
`stoped/stopping → idle`. A `status:workReport:free` while a print state is
still active means we missed the end transition → fall back to `idle`.

## §5c Camera — HTTP-FLV on :18088 (ON-DEMAND)

`http://<ip>:18088/flv` serves an HTTP-FLV stream (H.264, `Content-Type:
text/plain`, a bogus `Content-Length: 99999999999`, body starting with the
`FLV\x01` magic). Chromium can't play FLV natively, so the main process runs
ffmpeg (`-i http://ip:18088/flv -vf fps=5 -f image2pipe -vcodec mjpeg
pipe:1`) and ships JPEG frames to the renderer over the `anycubic:cam-frame`
IPC — the Bambu RTSP camera pattern (incl. forwarding to the detached cam
window). Validated on a Kobra 3 V2: ffmpeg pulls it cleanly at ~5 fps.

**The stream is on-demand — this is the critical gotcha.** When no client has
opened the camera, `/flv` returns **404** (the HTTP server on 18088 is up and
404s every path). It only serves the FLV stream **after the printer is told
to start capturing**. Observed:
- **Kobra 3 V2** advertises `rtspUrl: http://<ip>:18088/flv` in `/info`;
  `/flv` is 404 at rest and `200`+FLV once a stream is active.
- **Kobra X** advertises **no `rtspUrl`** at all — its camera path may differ
  or be WebRTC-only.

### Activation command (captured — we control the stream)

The activation isn't in the open slicer source (it's in the closed network
plugin) or in hass-anycubic_cloud (which only implements the **cloud** camera
— order `CAMERA_OPEN` = 1001 returning **Tencent Cloud STS tokens**, a
WebRTC/TRTC relay marked *WIP/unused*). It was **captured by sniffing the
local broker** (`scripts/acu-mqtt-sniff.mjs`, subscribe `#`, hit Play in the
slicer). It's a plain MQTT publish on a `video` endpoint:

```
publish  anycubic/anycubicCloud/v1/web/printer/{modelId}/{deviceId}/video
         {"type":"video","action":"startCapture","timestamp":…,"msgid":"…","data":null}
report   anycubic/anycubicCloud/v1/printer/public/{modelId}/{deviceId}/video/report
         {"type":"video","action":"startCapture",…,"state":"initSuccess","code":200}

stop:    same topic, "action":"stopCapture"  → report state "pushStopped"
```

(There's also a bare `…/response` ack `{"msgid":…}` echoing each publish.)

**Implemented behaviour (active control + probe-gated):**
1. When a camera surface opens (side panel / cam wall) the driver marks the
   camera *wanted*; once MQTT is connected it publishes `video/startCapture`.
2. The printer's `video/report` `initSuccess` (which we receive on our subtree
   subscription) confirms `/flv` is serving → ffmpeg starts. A bounded
   `flvProbe` retry (≈4 tries, 1 s apart) covers the init race / a missed
   report; it is **not** an indefinite poll.
3. On panel close → `video/stopCapture` + ffmpeg stop (`acuReleaseCamera`),
   unless the cam wall is still showing the printer. On disconnect → stop too.
4. If ffmpeg dies (the printer times the FLV out) → `anycubic:cam-ended`
   drops the banner to the hero photo and, if still wanted, re-requests
   capture and re-attaches.
5. Because we react to `video/report` regardless of origin, a stream started
   in the **slicer** also attaches here automatically.
6. ffmpeg is **never** started from background grid/table connects
   (`skipCam`), and `/flv` is never pulled blindly — the 404-until-active
   endpoint can't cause a retry loop.

### Two camera transports — gate on `/info.rtspUrl`

There are **two** camera transports across the line-up, distinguished by the
`rtspUrl` field in `/info`:

| | Local FLV (supported) | WebRTC/TRTC (out of scope) |
|--|--|--|
| Example | **Kobra 3 V2** (20027) | **Kobra X** (20030), likely Kobra S1 / newer enclosed |
| `/info.rtspUrl` | `http://<ip>:18088/flv` | **absent** |
| `video/report` states on startCapture | `initSuccess` only | `initSuccess` → **`joinSuccess`** → **`pushStarted`** |
| `/flv` after activation | `200` + FLV stream | `400`/`404` (never serves) |
| How it streams | pullable HTTP-FLV on :18088 | joins a Tencent TRTC room (cloud relay) |

The WebRTC path is the same one the cloud uses (hass-anycubic_cloud's
Tencent-token camera, WIP/unused) — reproducing it needs the TRTC SDK + STS
tokens, so it's **not implemented**. The driver therefore checks `/info` for
an `rtspUrl` (`anycubic:http-info`, cached per connection as
`conn.data.camSupported`) **before** activating: FLV models get
`startCapture` + ffmpeg; WebRTC models are left on the hero photo and are
**never** sent `startCapture` (so they don't needlessly join a TRTC room) and
never probe-spammed. If `/info` is briefly unreachable we assume FLV (don't
disable the camera on a hiccup).

Probe window: the printer can take several seconds to start serving `/flv`
after `initSuccess` (~6 s observed on a Kobra 3 V2), so the bounded probe
covers ~15 s before giving up.

## §6 Known model ids

| Numeric `modelId` | Printer            |
|-------------------|--------------------|
| 20027             | Kobra 3 V2         |
| 20030             | Kobra X            |

Other Kobra-family ids exist but were not captured; the catalog mapping in
probe.js falls back to name heuristics on `/info.modelName`. Add ids here as
they are observed (the value appears in both `/info` and the slicer config).

## §7 Field mapping — Firestore printer doc

| Doc field        | Source                            | Used for                      |
|------------------|-----------------------------------|-------------------------------|
| `ip`             | slicer config `broker` host / scan | MQTT host                     |
| `port`           | slicer config `broker` port (9883) | MQTT port (implicit default)  |
| `acuModelId`     | slicer `modeId` / `/info.modelId`  | MQTT topic `{modelId}`        |
| `deviceId`       | slicer config                      | MQTT topic `{deviceId}`       |
| `username`       | slicer config                      | broker auth                   |
| `password`       | slicer config                      | broker auth                   |
| `printerModelId` | catalog match (name heuristics)    | photo + model name in UI      |

## §8 Limitations / honesty notes

- Set is **type + RGB only** (§5). The UI must not promise full profiles.
- A **DHCP IP change** strands the cached `ip` — re-import from the slicer
  config, or use the LAN scan to find the printer and update the doc.
- The §5b telemetry field shapes come from the cloud channel
  (hass-anycubic_cloud) and are **not yet validated against a local broker
  on real hardware** — if a field misbehaves, capture the raw report in the
  debug Request log and adjust the parser (`_acuMerge` in index.js), never
  assume key order or completeness.
- Camera framerate is capped at ~5 fps by the ffmpeg remux (status-cam use
  case); the native FLV stream is full-rate H.264 if a future phase embeds
  a real player (mpegts.js).
