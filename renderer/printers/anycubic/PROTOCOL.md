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
printers expose NOTHING locally (no open ports at all), so they're reached
through Anycubic's cloud instead — see **§9 Cloud mode**. Both modes are
supported and coexist in one printer list (mixed fleet).

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

- Box `id` **-1** = external/standalone box; `0..N-1` = ACE units. **Every box
  is a multi-slot unit** — the external box is NOT a single slot: an ACE Pro 2
  / Kobra X reports box -1 with **4 slots** (verified: id -1, 4 PLA slots), and
  each ACE unit has slots `0..3`. The UI must render every box (incl. -1) with
  all of its slots — collapsing -1 to one cell loses 3 external slots.
  (Example — Kobra X: box -1 (4 slots) + boxes 0,1,2,3 (4 each) = 20 slots.)
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
- `type` is a material name the ACE accepts. Captured live from the slicer's
  filament dropdown — the slicer sends these **verbatim** (variants included,
  NOT only base types), so the control panel should offer the same list:
  ```
  PLA  PLA +  PLA-CF  PLA Matte  PLA Silk  PLA Galaxy  PLA Glow  PLA Marble
  PLA Metal  PLA SE  PLA Translucent  PLA High Speed
  PETG  PETG-CF  PET  PET-CF  ABS  ASA  PC  PC-CF/GF
  PA  PA6-CF  PACF  TPU  TPU for ACE  PVA  HIPS  PE
  ```
  (Note the exact spellings: `PLA +` has a space, `PC-CF/GF`, `TPU for ACE`.)
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
| `extfilbox` | `reportInfo`/`success` (state) | **Standalone external spool** (a printer with NO ACE — e.g. a Kobra 3 — reports its external spool HERE, not in multiColorBox). `data` is a SINGLE spool `{id, type, color:[r,g,b], loaded, status_type, current_status}`. **Get** = order **1230** (`GET_EXTFILBOX_INFO`, data `{}`). **Set** = order **1229** (`EXTFILBOX`), data **`{type, color:[r,g,b]}`** — just type + color, no box/slot/index (captured from the Workbench). The driver synthesizes a box -1 from this for the filament card, and routes its set to 1229 (not multiColorBox 1211). |
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
- **Kobra 3 V2** advertises `rtspUrl: http://<ip>:18088/flv` in HTTP `/info`;
  `/flv` is 404 at rest and `200`+FLV once a stream is active.
- **Kobra X** does **not** put `rtspUrl` in HTTP `/info`. It advertises a
  **tokenized** URL `http://<ip>:18088/live/<token>` in the periodic **MQTT
  `info/report`** (`data.urls.rtspUrl`) instead — same HTTP-FLV, `206`+FLV once
  active. The 8-char token is validated and device-stable (a bogus token 404s).

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

### Stream URL discovery — `rtspUrl` (HTTP `/info` OR MQTT `info/report`)

Every FDM model so far streams **HTTP-FLV on :18088**. The only differences are
the URL path and where it's advertised — both report it as `rtspUrl`:

| | Kobra 3 V2 (20027) | Kobra X (20030) |
|--|--|--|
| `rtspUrl` source | HTTP `/info` | MQTT `info/report` (`data.urls.rtspUrl`) |
| URL | `http://<ip>:18088/flv` | `http://<ip>:18088/live/<token>` |
| `video/report` on startCapture | `initSuccess` | `initSuccess` → `joinSuccess` → `pushStarted` |
| stream response | `200` + FLV | `206` + FLV |
| token | none | 8-char, validated, device-stable (a bogus token 404s) |

> ⚠️ **Earlier RE wrongly concluded the Kobra X was WebRTC/TRTC and out of
> scope.** Its `joinSuccess`/`pushStarted` states *look* like a Tencent TRTC
> room join, and its HTTP `/info` omits `rtspUrl` — but it is plain HTTP-FLV; the
> URL just rides the periodic MQTT `info/report` (confirmed with `scripts/acu-cam-*`:
> `/live/<token>` returns `206 video/x-flv`). The cloud `CAMERA_OPEN`=1001 Tencent
> path (hass-anycubic_cloud, WIP/unused) is a *separate* thing relevant only to
> cloud-mode printers (§9) — not LAN.

The driver treats the camera as supported once it has a `:18088` `rtspUrl` from
**either** source, stored as `conn.data.camUrl` (captured in `_acuMerge`'s `info`
case, or via the HTTP `/info` probe). It feeds that exact URL to `flvProbe` +
ffmpeg, so `/flv` and `/live/<token>` are handled uniformly. The periodic
`info/report` (~every 5 s) means the URL is usually known before the camera is
even opened. When neither source has surfaced a URL yet, it does **not** disable
the camera — it attempts and lets the bounded probe self-terminate.

Probe window: the printer can take several seconds to start serving after
`initSuccess` (~6 s observed on a Kobra 3 V2), so the bounded probe covers ~15 s
before giving up.

## §5d Control commands — the action/set side

The same envelope as §5 is used to **drive** the printer (not just read it).
Publish to the command topic:

```
command  anycubic/anycubicCloud/v1/web/printer/{modelId}/{deviceId}/{family}
```
```json
{ "type": "<family>", "action": "<action>", "timestamp": <epoch-ms>,
  "msgid": "<uuid>", "data": { … } }
```

There is **no per-command ACK** — the printer reflects the change in the next
`…/{family}/report` tick (§5b). Confirm by that report, or patch optimistically.

Captured live by sniffing AnycubicSlicerNext's control panel
(`scripts/acu-mqtt-sniff.mjs`) on a **Kobra X (20030)** over LAN.
⚠️ High-confidence but model-specific — validate field meanings on other models.

| Function | family | action | `data` |
|----------|--------|--------|--------|
| Set nozzle target | `tempature` | `set` | `{ "type": 0, "target_nozzle_temp": <°C>, "target_hotbed_temp": 0 }` |
| Set bed target | `tempature` | `set` | `{ "type": 1, "target_hotbed_temp": <°C>, "target_nozzle_temp": 0 }` |
| Preheat both | `tempature` | `set` | `{ "type": 2, "target_nozzle_temp": <°C>, "target_hotbed_temp": <°C> }` |
| Cooldown | `tempature` | `set` | same, with the relevant target = `0` (`type` selects nozzle `0` / bed `1` / both `2`) |
| Set slot filament | `multiColorBox` | `setInfo` | `{ "multi_color_box": [ { "id": <box>, "slots": [ { "index": <0-3>, "type": "<material>", "color": [r,g,b] } ] } ] }` — see §5 for the accepted `type` list |
| Set fan speed | `fan` | `setSpeed` | `{ "fan_speed_pct": <0-100> }` |
| Light on/off | `light` | `control` | `{ "type": 3, "status": 0\|1, "brightness": <0-100> }` |
| Jog an axis | `axis` | `move` | `{ "axis": 1\|2\|3, "move_type": 0\|1, "distance": <mm> }` |
| Home axis / combos | `axis` | `move` | `{ "axis": 1=X\|2=Y\|3=Z\|4=XY\|5=XYZ, "move_type": 2, "distance": 0 }` |
| Disable steppers | `axis` | `turnOff` | `null` |
| Load filament | `multiColorBox` | `feedFilament` | `{ "multi_color_box": [ { "id": <box>, "feed_status": { "slot_index": <0-3>, "type": 1 } } ] }` |
| Unload filament | `multiColorBox` | `feedFilament` | `… "feed_status": { "slot_index": <0-3>, "type": 2 }` |
| Stop load/unload | `multiColorBox` | `feedFilament` | `… "feed_status": { "slot_index": <0-3>, "type": 3 }` |
| Camera start/stop | `video` | `startCapture` / `stopCapture` | `null` (see §5c) |
| Pause print | `print` | `pause` | `{ "taskid": "-1" }` |
| Resume print | `print` | `resume` | `{ "taskid": "-1" }` |
| Stop print | `print` | `stop` | `{ "taskid": "-1" }` |
| Set speed mode | `print` | `update` | `{ "taskid": "-1", "settings": { "print_speed_mode": 1\|2\|3 } }` |

**Axis map** (Kobra X): `axis` `1`=X, `2`=Y, `3`=Z (jog uses 1-3); homing also
accepts `4`=XY and `5`=XYZ (all). Confirmed live via slicer capture.
`move_type` `0` = − direction, `1` = + direction, `2` = **home** (always with
`distance:0`). ⚠️ The printer **refuses jogs until homed** — home first.

**Control-button labels** — exact hover tooltips from AnycubicSlicerNext's
"Axis Move" panel (reuse verbatim so our UI matches the slicer the user already
knows):

| Button | Tooltip | Command |
|--------|---------|---------|
| Home-all icon | `XYZ Axis Homing` | `axis:5, move_type:2` |
| XY-circle centre icon | `XY Axis Homing` | `axis:4, move_type:2` |
| Z-pill centre icon | `Z Axis Homing` | `axis:3, move_type:2` |
| Hand icon | `Disable Motors, click to manually move the axis` | `axis/turnOff` |

The jog arrows (`X+ X− Y+ Y− Z+ Z−`) and the Print-Setting fields (Bed/Noz Temp,
Model Fan, Cam Light) carry **no** tooltip in the slicer — their visible label is
the affordance. The panel also shows a persistent warning: *"Please operate in
front of the printer and be aware of the distance between the nozzle and the
hotbed to avoid collisions that may damage the printer."*

**Speed mode**: `print_speed_mode` `1` = Silent, `2` = Standard, `3` = Sport.
The `print/update` report echoes the active mode in `data.settings.print_speed_mode`,
so the current mode can be read back (alongside `fan_speed_pct`, target temps, `z_comp`).

**Filament feed `type`**: `1` = load (feed in), `2` = unload (retract),
`3` = stop. `id` + `slot_index` target the box + slot (box `-1` = external box).

**Slot `status` + box `loaded_slot`** (captured live on a Kobra X ACE):
`status` `5` = filament **present** in the slot, `4` = **empty** (no spool). The
box-level `loaded_slot` is the slot index currently fed into the extruder
(`-1` = none). This gives three UI states per slot:
- empty (`status 4`) → not-mounted (grey + "?", colour kept as border); no feed.
- present, not loaded (`status 5`, `loaded_slot ≠ index`) → Feed only.
- loaded into the extruder (`status 5`, `loaded_slot == index`) → Feed + Retract.

**Temperature `type`**: `0` = nozzle only, `1` = bed only, `2` = **both at once**
(preheat — `{type:2, target_nozzle_temp:N, target_hotbed_temp:M}`, used by the
slicer's filament-change preheat). For 0/1 send only the relevant target; the
other stays `0`.

**Print control `taskid`**: the slicer sends `"-1"` (current/any job) rather than
the real task id — `"-1"` works for the active print. The matching telemetry
state transitions (confirm the command landed) are in §5b: `pause` →
`pausing` → `paused`; `resume` → `resuming` → `resumed`; `stop` → `stopping`
→ `stoped`(sic). Captured live on a running Kobra X job.

## §6 Known model ids

| Numeric `modelId` | Printer            |
|-------------------|--------------------|
| 20027             | Kobra 3 V2         |
| 20030             | Kobra X            |

Other Kobra-family ids exist but were not captured; the catalog mapping in
probe.js falls back to name heuristics on `/info.modelName`. Add ids here as
they are observed (the value appears in both `/info` and the slicer config).

## §7 Field mapping — Firestore printer doc

LAN docs (`mode` absent / `"lan"`):

| Doc field        | Source                            | Used for                      |
|------------------|-----------------------------------|-------------------------------|
| `ip`             | slicer config `broker` host / scan | MQTT host                     |
| `port`           | slicer config `broker` port (9883) | MQTT port (implicit default)  |
| `acuModelId`     | slicer `modeId` / `/info.modelId`  | MQTT topic `{modelId}`        |
| `deviceId`       | slicer config                      | MQTT topic `{deviceId}`       |
| `username`       | slicer config                      | broker auth                   |
| `password`       | slicer config                      | broker auth                   |
| `printerModelId` | catalog match (name heuristics)    | photo + model name in UI      |

Cloud docs (`mode: "cloud"`, doc id `cloud_<cloudPrinterId>`):

| Doc field        | Source                       | Used for                          |
|------------------|------------------------------|-----------------------------------|
| `cloudPrinterId` | cloud `getPrinters[].id`     | REST `sendOrder` `printer_id`     |
| `machineType`    | cloud `getPrinters[].machine_type` | cloud topic `{modelId}` + photo |
| `acuModelId`     | = `machineType` (string)     | catalog/topic parity with LAN     |
| `key`            | cloud `getPrinters[].key`    | cloud topic `{key}`               |
| `cloudToken`     | CDP `GET_TOKEN` (workbench)  | REST + cloud-MQTT auth            |
| `cloudEmail`     | CDP `GET_USER_INFO` / JWT    | cloud-MQTT login                  |
| `printerModelId` | catalog match                | photo + model name in UI          |

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

## §9 Cloud mode — reaching cloud-mode printers

Cloud-mode printers expose no local ports, so they're driven through Anycubic's
cloud (authenticated as the account owner). Auth scheme ported from ACE-RFID's
`CloudApi` (public app constants from the `hass-anycubic_cloud` RE). Validated
end-to-end on a cloud Kobra 3 V2 (token grab → getPrinters → cloud-MQTT getInfo).

### Token acquisition (the only non-trivial part)
The workbench API needs a **session token** the slicer mints in memory at login.
It is **not on disk** (verified): the slicer config's `access_token` is an OAuth
token (`iss: uc.makeronline.com`) that the workbench rejects (`10001`), and the
WebView2 localStorage stores the workbench token as `null`. The OAuth token can't
be exchanged headlessly (`getoauthToken` needs a captcha-gated `code`). So we
read it the way ACE-RFID does — **CDP, attach-only**:
- The user runs AnycubicSlicerNext in **bridge mode** themselves
  (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`), signed
  in, Workbench open. We **never launch the slicer** — `anycubic:cloud-cdp-token`
  attaches to `127.0.0.1:9222`, finds the Workbench page (`url`/`title` matches
  `workbench`/`orca-ac-web`), and `Runtime.evaluate`s `GET_TOKEN` / `GET_USER_INFO`
  from the Vuex store. Token + email are stored on the cloud printer doc(s).
- The token expires (it's a session token, unlike the durable LAN cert) → re-run
  "Add a cloud printer" to refresh. A hard failure surfaces as the shared cloud
  client erroring/disconnecting (`anycubic:cloud-status`).

### REST (signed) — `https://cloud-universe.anycubic.com/p/p/workbench/api`
Every request carries signed headers (Node `https`, **not** `fetch` — the gateway
is case-sensitive on header names and undici lowercases them):
`Xx-Signature = md5(AID + ts + VER + SEC + nonce + AID)` with public constants
`AID=f9b3…`, `SEC=0cf7…`, `VER=V3.0.0`, plus `XX-Token: <session token>`.
- `GET /work/printer/getPrinters?page=1` → `[{id, name, machine_type, key, device_status}]` (1=online, 2=offline).
- `POST /work/operation/sendOrder` `{order_id, printer_id, project_id, data}` — **1206 = getInfo**, **1211 = setSlot** (`{multi_color_box:[{id,slots:[{color:[r,g,b],index,type}]}]}`).
- `GET /work/project/getProjects?page=1&limit=5` → recent projects `[{id, printer_id, print_status, img}]`. `print_status===1` = the **active** print; its `id` is the `project_id` for active-print orders, and its `img` is the live job thumbnail.
- `GET /user/profile/userInfo` → verify token + email.

> ⚠️ **`project_id` semantics.** `sendOrder` only attaches `project_id` when it's a real (`>0`) value — an explicit `project_id:0` is **omitted** from the body (sending `0` is not the same as omitting; the slicer omits it). Three classes of order:
>
> | Order | id | `project_id` | data |
> |---|---|---|---|
> | getInfo / setSlot / feed (ACE) | 1206 / 1211 / 1208 | **none** (omit) | as above — hass hardcodes `project_id:0` for these too |
> | **SET_LIGHT_STATUS** | **1233** | **none** (omit) | `{type:3, status:0\|1, brightness:0\|100}` — **type:3 = chamber/part LED** (same as LAN). `type:1` is the CAMERA light → printer reports "failed turn on camera light". Works at idle; no project needed. |
> | MOVE_AXLE / TURN_OFF (jog/home/motors) | 201 / 1213 | **none** (omit) | `{axis, move_type, distance}` — hass marks 201 "Not handled", so the shape is best-effort. |
> | PAUSE / RESUME / STOP | 2 / 3 / 4 | **active print** | `{}` — acts on the running job (only relevant while printing). |
>
> **Fan / temperature / speed-mode are NOT `sendOrder`** — the slicer (and our LAN path) drive them with realtime **MQTT publish** messages, which apply **at idle** (no project). Publish `{type, action, timestamp, msgid, data}` to the cloud broker topic `anycubic/anycubicCloud/v1/web/printer/{machineType}/{key}/{endpoint}` (same topic family as LAN):
>
> | Control | endpoint | message |
> |---|---|---|
> | Fan | `fan` | `{type:"fan", action:"setSpeed", data:{fan_speed_pct}}` |
> | Nozzle/bed temp | `tempature` | `{type:"tempature", action:"set", data:{type:0\|1, target_nozzle_temp, target_hotbed_temp}}` |
> | Speed mode | `print` | `{type:"print", action:"update", data:{taskid:"-1", settings:{print_speed_mode}}}` |
>
> (`PRINT_SETTINGS` / order 6 changes a *project's* settings only — it does nothing at idle, so it's unused for these.) So: light (sendOrder 1233) + jog/home/feed/ACE (sendOrder, no project) + fan/temp/speed (MQTT publish) all work at idle; pause/stop only matter during a print.

### Cloud MQTT — `mqtt-universe.anycubic.com:8883`
Reports come back here (same `…/multiColorBox/report` + telemetry shapes as LAN,
so the same `_acuMerge` parses them). Connection (`services/anycubicCloudCerts.js`):
- **bundled client cert** (PKCS#12, empty passphrase) presented as mTLS;
- `clientId = md5(email+"pcf")`, `mqttToken = base64(RSA_encrypt(token, CA_pubkey, PKCS1))`,
  `username = "user|pcf|"+email+"|"+md5(clientId+mqttToken+clientId)`, `password = mqttToken`;
- **TLS 1.2 + `ciphers: DEFAULT:@SECLEVEL=0`** — the Anycubic CA chain uses a weak
  (SHA1) digest OpenSSL rejects by default; SECLEVEL=0 allows the handshake
  (matches the slicer/.NET path).
- One **shared** client per signed-in user; subscribe per printer to
  `anycubic/anycubicCloud/v1/+/public/{machineType}/{key}/#`. Reports route back
  to the renderer tagged with the printer's conn key.

### Implementation
`main.js` (cloud block): `anycubic:cloud-cdp-token`, `:cloud-get-printers`,
`:cloud-verify`, `:cloud-send-order`, `:cloud-connect`/`:cloud-subscribe`/
`:cloud-unsubscribe` (+ `:cloud-message`/`:cloud-status`). Renderer driver
(`index.js`) branches on `printer.mode === "cloud"`: connect = shared-MQTT
subscribe + REST getInfo; refresh/getInfo/setInfo via REST; reports reuse
`_acuMerge`; **no camera** (cloud camera is TRTC, §5c). Provisioning UI:
`add-flow.js` "Add a cloud printer" panel (CDP grab → getPrinters → one-click add,
written by `ctx.addAnycubicCloudPrinter` as a `mode:"cloud"` doc).

### Limits (cloud)
- `setInfo` honors only `{index, type, color}` (same as LAN).
- **Token expires** → occasional re-provision (the slicer in bridge mode again).
- **No camera** for cloud printers (TRTC; out of scope — §5c).
- Dev validators: `scripts/acu-cloud-test.mjs` (full path), `acu-mqtt-sniff.mjs`.
