# Klipper — Moonraker protocol (agent skill)

## Display additions

The temperature card includes discovered `temperature_sensor`, `temperature_fan`
and `heater_generic` objects, excluding the chamber already shown separately.
Each sensor occupies one vertical row in the board and side panel.

Printer cards and the table try `GET /server/files/config/.theme/sidebar-logo.png`
on the configured Moonraker port. The bundled Klipper logo remains the fallback
when the image is missing or requires authentication. API keys are never put in
image URLs; no personal logo asset is bundled or persisted. The optional plugin
`renderLogo(p)` hook keeps this behavior out of the host's brand-specific logic.

Run `node --test scripts/test-klipper-display.mjs` for display regression checks.

Self-contained reference for a **generic** Klipper integration in Tiger Studio
Manager: any printer running Klipper + Moonraker (Mainsail / Fluidd are only web
UIs on top of Moonraker).
Status: **design reference — not implemented yet.** Built from Moonraker's
documentation, the Home Assistant integration, Happy Hare and AFC sources (links
in §13), and Studio's own Snapmaker driver, which already speaks Moonraker. To be
confirmed on real hardware (§12).

## 1. Which printers

One local API — **Moonraker** — for every Klipper machine, whatever the brand:
Voron, RatRig, VzBot, Sovol SV06 / SV07 / SV08, Elegoo Neptune 4 series, Qidi
(X-Plus 3 / X-Max 3 / Q1 Pro / Plus 4), Creality K1 / K2 / Ender-3 V3 once rooted
(stock K-series runs Moonraker too, behind Creality's own socket — see the
Creality driver), Anycubic Kobra on Kobra-Klipper mods, Snapmaker U1, any
printer on a Raspberry Pi / BTT CB1 / Pad 7 with KIAUH or MainsailOS.

Multi-material add-ons that matter to us (§7): **Happy Hare** (ERCF, Tradrack,
Box Turtle via HH, 3MS…), **AFC** (Armored Turtle: Box Turtle, NightOwl,
QuattroBox, OpenAMS…), **Spoolman** (spool database, through Moonraker), and
vendor boxes with no public schema yet (QIDI Box, Creality CFS on a rooted K).

**Snapmaker** stays its own brand (proprietary `print_task_config` filament
data, `SET_PRINT_FILAMENT_CONFIG`, `camera.start_monitor`) but its connection,
status, files and camera code are plain Moonraker — the intended end state is
Snapmaker as a *variant* of this driver (§11).

## 2. Transport

- **WebSocket JSON-RPC 2.0** on `ws://<host>:<port>/websocket` for live data;
  **HTTP** (`/server/…`, `/printer/…`, `/access/…`, `/machine/…`) for one-shots.
- Ports: Moonraker listens on **7125** (SSL 7130). Mainsail / Fluidd put nginx on
  **80** and proxy `/websocket`, `/printer`, `/server`, `/access`, `/machine`
  to it — try 7125 first, then 80. Several instances on one host (KIAUH) use
  **7125, 7126, 7127…** — the identity is `host:port`, never the IP alone.
- **CORS**: Moonraker only answers browsers whose origin is in `cors_domains`.
  Studio desktop sends HTTP from the **main process** (no CORS) through an
  allow-listed IPC handler, like `prusa:http` / `creHttp` — never a generic
  proxy. The renderer may open the WebSocket directly (no CORS on WS, the
  Snapmaker driver does). **Studio Web cannot reach a LAN printer at all** (https
  → `ws:`/`http:` is mixed content; `web-bridge.js` refuses it) — printers on the
  web need a secure relay, out of scope here.

## 3. Authorization

`[authorization]` in `moonraker.conf`:

| Option | Default | Effect |
|---|---|---|
| `trusted_clients` | none | IPs / CIDR ranges with full access, no credentials |
| `enable_api_key` | true | accept `X-Api-Key: <key>` |
| `force_logins` | false | once a user exists, require JWT login even for trusted clients |
| `cors_domains` | none | browser origins allowed |

- **Typical install (KIAUH, MainsailOS, vendor images): every RFC1918 range is a
  trusted client** → a LAN client needs **no credentials**. Design for this
  first.
- Otherwise, in order of preference:
  1. **API key** — user pastes it from Mainsail/Fluidd (*Settings → Moonraker →
     API key*, or `GET /access/api_key` from a trusted host). HTTP header
     `X-Api-Key`; on the socket, `api_key` in `server.connection.identify`.
  2. **Login** — `POST /access/login {username, password, source:"moonraker"}`
     → JWT (`Authorization: Bearer`, 1 h), renewed with
     `POST /access/refresh_jwt`; on the socket, `access_token` in
     `server.connection.identify`.
  3. **Oneshot token** — `GET /access/oneshot_token` (5 s, single use) as
     `?token=` on a WebSocket or download URL.
- A `401` means "not trusted": show the API-key field, never loop.
- Credentials are secrets: store them like the other printers' access codes
  (masked by the MCP server, never logged).

## 4. Connection flow

1. Open `ws://host:port/websocket` (8 s open timeout, as Snapmaker).
2. `server.connection.identify` `{client_name:"Tiger Studio", version, type:"desktop", url:"https://tigersystem.io", api_key?|access_token?}` → `connection_id`. **Once per connection.**
3. `server.info` → `klippy_state`: `ready` | `startup` | `error` | `shutdown` | `disconnected`.
   - `startup` → retry `server.info` every 2 s.
   - `error` / `shutdown` → show `webhooks.state_message`, offer
     `printer.firmware_restart`; do not subscribe.
4. `printer.info` → `hostname`, `software_version`, `state_message`.
5. `printer.objects.list` → the object names this printer has. **Feature
   detection happens here** (§7): which filament adapter, how many extruders,
   which sensors.
6. `printer.objects.subscribe` `{objects:{name: [fields] | null}}` with the
   **whole** set in ONE call — a new subscribe **replaces** the previous one
   (same rule the Snapmaker driver learnt). The reply is a full snapshot.
7. Then `notify_status_update [diff, eventtime]` pushes only changed fields →
   deep-merge into the cached state.
8. Other notifications: `notify_klippy_ready` (**re-run 3–6**: a Klippy restart
   drops subscriptions), `notify_klippy_shutdown`, `notify_klippy_disconnected`,
   `notify_filelist_changed`, `notify_webcams_changed`,
   `notify_active_spool_set`, `notify_spoolman_status_changed`.
9. Reconnect with backoff 2 / 4 / 8 / 16 / 30 s; from the 3rd failure ask
   `ctx.requestPrinterRefind` (IP may have changed — shared refind logic).

Home Assistant polls `printer.objects.query` (30 s idle, 2 s while printing)
instead of subscribing; we subscribe, it is cheaper and live.

## 5. Status objects

| Object | Fields | Use |
|---|---|---|
| `webhooks` | `state`, `state_message` | Klippy health |
| `print_stats` | `state` (standby / printing / paused / complete / cancelled / error), `filename`, `print_duration`, `total_duration`, `filament_used`, `info.current_layer`, `info.total_layer` | job card |
| `display_status` | `progress` (0–1), `message` | progress |
| `virtual_sdcard` | `progress`, `file_path`, `is_active` | progress fallback |
| `extruder`, `extruder1`…`extruderN` | `temperature`, `target`, `power` | temperatures, tool count |
| `heater_bed` | `temperature`, `target` | bed |
| `heater_generic chamber` / `temperature_sensor <name>` | `temperature` | chamber (optional, name varies) |
| `toolhead` | `extruder` (active tool), `homed_axes`, `position` | active tool |
| `fan`, `fan_generic <name>` | `speed` | fans |
| `gcode_move` | `speed_factor`, `extrude_factor` | speed % |
| `filament_switch_sensor <n>` / `filament_motion_sensor <n>` | `filament_detected`, `enabled` | runout / presence |

Missing objects are **silently omitted** from query / subscribe replies — never
treat absence as an error.

The part fan's `fan.speed` is reported **after** the `[fan] max_power` ceiling
(`M106 S255` with `max_power: 0.8` reads `0.8`; Klipper `fan.py`, `get_status`
returns the scaled value). Mainsail shows it as a share of that ceiling
(`speed / max_power`), and so does the panel: `max_power` is read once at
detection (`printer.objects.query {configfile: ["settings"]}` →
`settings.fan.max_power`, 1 when unreadable) and the percentage is capped at 100.

Progress: prefer `virtual_sdcard.progress` (file position) while printing,
`display_status.progress` when a slicer sets M73. Remaining time = estimate from
`print_duration` and progress, or the file's `estimated_time` metadata.

## 6. Print control & files

- `printer.print.start {filename}`, `printer.print.pause`, `printer.print.resume`,
  `printer.print.cancel` (or `POST /printer/print/{start|pause|resume|cancel}`).
- `printer.gcode.script {script}` — newline-separated G-code / macros. This is
  how every filament write in §7 is sent.
- `printer.emergency_stop` (prefer over `M112`), `printer.firmware_restart`,
  `printer.restart`.
- Files: `server.files.list {root:"gcodes"}`, `server.files.metadata {filename}`
  (`estimated_time`, `filament_total`, `filament_type`, `filament_colors`,
  `slicer`, `thumbnails[]`), download `GET /server/files/gcodes/<path>`.
- **Thumbnails**: `thumbnails[].relative_path` is relative to the **G-code
  file's folder** → `/server/files/gcodes/<dir-of-file>/<relative_path>`. Or
  `server.files.thumbnails {filename}` → `thumbnail_path` relative to the gcodes
  root. Pick the largest `size` (HA and Snapmaker both do).

## 7. Filament slots — the part that matters for TigerTag

There is **no standard** "write the filament of slot N" call. One generic driver,
**feature-detected adapters** chosen from `printer.objects.list`, all written
through `printer.gcode.script`. A printer may combine several (e.g. Happy Hare +
Spoolman).

### 7a. Plain extruders (no MMU) — always available

One slot per `extruderN`. Klipper keeps no filament identity of its own: the
slot shows what Studio (or Spoolman, 7b) knows. Writing = Studio-side only, or
Spoolman's active spool.

### 7b. Spoolman (Moonraker `[spoolman]` component)

Detected by `GET /server/spoolman/status` → `{spoolman_connected, pending_reports, spool_id}`
(404 = not configured).

- Active spool: `server.spoolman.get_spool_id`, `server.spoolman.post_spool_id {spool_id | null}`;
  push `notify_active_spool_set {spool_id}`.
- Full Spoolman REST without reaching Spoolman directly:
  `server.spoolman.proxy {request_method, path:"/v1/spool/…", query, body, use_v2_response:true}`.
- **TigerTag opportunity**: a scanned TigerTag can be matched to (or create) a
  Spoolman spool and set as active — the spool id is the one identity every
  Klipper multi-material system also understands (7c, 7d).

### 7c. Happy Hare (object `mmu`)

Read (lists indexed by gate):

| Field | Meaning |
|---|---|
| `gate_status` | -1 unknown, 0 empty, 1 available, 2 available from buffer |
| `gate_material` | material string |
| `gate_color` | `RRGGBB` (no `#`) or a W3C name |
| `gate_color_rgb` | `[r,g,b]` floats 0–1 |
| `gate_spool_id` | Spoolman id, -1 none |
| `ttg_map` | tool → gate |
| `tool`, `gate`, `active_filament` | current selection |

Write: `MMU_GATE_MAP GATE=<n> MATERIAL=PLA COLOR=ff0000 SPOOLID=12 AVAILABLE=1`
(bulk form `GATES=0,1,2`); tool mapping `MMU_TTG_MAP TOOL=<t> GATE=<g>`;
Spoolman sync `MMU_SPOOLMAN`.

### 7d. AFC — Armored Turtle (objects `AFC`, `AFC_stepper <lane>` / `AFC_lane <lane>`)

- `AFC` → `lanes` (names), `units`, `current_lane`, `spoolman`.
- A lane can be listed under both names (`AFC_stepper CANVAS_1` and
  `AFC_lane CANVAS_1` — CANVAS on an OpenCentauri CC1, issue 167): one slot
  per lane name, read from the `AFC_lane` object when it exists.
- Each lane object → `map` (tool, e.g. `T0`), `load`, `prep`, `tool_loaded`,
  `material`, `color` (`#RRGGBB`), `multi_color_hexes`, `spool_id`, `weight`,
  `filament_name`, `extruder_temp`, `bed_temp`, `status`, `td1_td`.
- Write (mux on `LANE`): `SET_MATERIAL LANE=lane1 MATERIAL=PLA [DIAMETER=1.75]`,
  `SET_COLOR LANE=lane1 COLOR=FF0000`, `SET_WEIGHT LANE=lane1 WEIGHT=850`,
  `SET_SPOOL_ID LANE=lane1 SPOOL_ID=12` (pulls the rest from Spoolman),
  `SET_MAP LANE=lane1 MAP=T0`, `SET_NEXT_SPOOL_ID`, `RESET_AFC_MAPPING`.
- `td1_td` — AFC reads a TD1S per lane: same sensor family Studio already
  supports.

### 7e. Vendor boxes — to discover on hardware

- **Snapmaker U1** — handled by the Snapmaker driver (`print_task_config`).
  A third-party source also describes `filament_detect.info[]` (VENDOR,
  MAIN_TYPE, SUB_TYPE, RGB_1 as decimal, WEIGHT, OFFICIAL) — unconfirmed.
- **QIDI Box**, **Creality CFS** on a rooted K1 / K2 — no public schema found.
  Run `printer.objects.list` on a real unit and document here.

### 7f. Colour & material mapping

- Studio colour → Happy Hare `RRGGBB` (no `#`), AFC `RRGGBB`. Read: accept
  `#RRGGBB`, `RRGGBB`, `RRGGBBAA` and W3C names.
- Material: send the TigerTag material **label** (PLA, PETG, ASA…) as the macro
  expects text — but every **decision** in Studio keys on `id_material` (rule:
  conditions on IDs, never labels).
- Escape values for G-code: no spaces / newlines / `;` in a parameter value
  (spaces → `_`, or quote per macro).

## 8. Camera

`server.webcams.list` (or `GET /server/webcams/list`) → entries with `name`,
`service`, `enabled`, `stream_url`, `snapshot_url`, `flip_horizontal`,
`flip_vertical`, `rotation`, `aspect_ratio`, `uid`.

- URLs are **absolute or relative**; a relative `/webcam/?action=stream` is
  served by nginx on **port 80**, not 7125 — resolve against `http://host/`.
- `service`: `mjpegstreamer` (default), `mjpegstreamer-adaptive`, `uv4l-mjpeg`,
  `ipstream`, `webrtc-camerastreamer`, `webrtc-go2rtc`, `webrtc-mediamtx`,
  `webrtc-janus`, `hlsstream`, `jmuxer-stream`, `iframe`.
- `mjpegstreamer-adaptive` is not a stream: Mainsail never opens its `stream_url`,
  it requests `snapshot_url` again and again at the camera's `target_fps`
  (`MjpegstreamerAdaptive.vue`). The driver does the same, at most every 500 ms,
  when a snapshot URL exists; with none it falls back to the stream.
- Universal path: MJPEG `stream_url`, or poll `snapshot_url` (may be empty).
  WebRTC services as a later improvement (the Snapmaker Paxx path already does
  camera-streamer WebRTC).
- Apply `flip_*` / `rotation` in CSS.

## 9. Discovery

- **mDNS** `_moonraker._tcp.local.` (TXT: `uuid`, `https_port`, `version`,
  `route_prefix`) and **SSDP** `urn:arksine.github.io:device:Moonraker:1` exist
  but are **opt-in** (`[zeroconf]`, absent from KIAUH / Mainsail templates).
  Use them when present (main process, like `_snapmaker._tcp`).
- **Fallback (the common case)**: sweep the /24 subnets with
  `GET http://<ip>:7125/server/info` (then `:80/server/info`), short timeout,
  same pattern as Snapmaker / Prusa. A candidate = a JSON reply with
  `klippy_state` / `moonraker_version`.
- Name it with `GET /printer/info` (`hostname`) and `/machine/system_info`
  (`cpu_info`, `distribution`, `product_info` when the vendor fills it).
- **Exclude** hosts another driver claims (Snapmaker `machine_type`, Creality
  9999 socket) so one printer is not added twice.
- Always allow **manual add**: `host[:port]` + optional API key (what HA does).

## 10. Identity & IP changes

Stable id: mDNS `uuid` when advertised; otherwise `/machine/system_info`
(`cpu_info.serial_number` on a Pi, `product_info.serial_number` on vendor
images) + port. Feed it to the shared refind logic (`printers/refind.js`,
`identity.js`) so an IP change re-finds the printer.

## 11. Mapping onto Studio

Klipper is the first **self-contained printer plugin** (contract:
`docs/PRINTER-PLUGINS.md`). Everything lives in this folder and imports host
services only — never another brand's files, not even Snapmaker's Moonraker code:

| File | Role |
|---|---|
| `plugin.js` | Entry point: `registerPrinterPlugin({...})` — manifest (`meta`, `schema`, `helper`), lifecycle hooks, UI hooks, strings (11 locales), CSS, model catalogue |
| `core.js` | Connection core: feature detection, 2 s `objects/query` poll, slot adapters (Happy Hare / AFC / extruders), job control, slot writes (`klipperWriteSlot`), request log |
| `cards.js` | Job / temperature / status / filament cards (host `snap-*` classes) |
| `camera.js` | MJPEG `<img>` stream, or 2 s snapshot refresh for other services |
| `probe.js`, `add-flow.js` | `/server/info` LAN sweep on 7125; choice / scan / manual add |
| `main.cjs` | Main-process side: allow-listed Moonraker HTTP (`printer:klipper:http`) + `printer:klipper:probe` |
| `klipper.css`, `models.json`, `img/` | Styles, catalogue, pictures — resolved relative to the folder |

- Transport: **HTTP polling** (2 s, like Home Assistant's Moonraker integration)
  through `main.cjs`, not the WebSocket — no CORS, the API key in a header, and
  no socket lifecycle to babysit. The WebSocket can come later.
- Firestore `users/{uid}/printers/klipper/devices/{id}` (the generic
  `printers/{brand}` rule covers it); the API key is a `secret` field.
- Beta: the brand picker and the live block show the Beta tag + ⓘ bubble (`beta-badge.js`, text `printerBetaNote`).
- Slot **writes** (`klipperWriteSlot`) are implemented and tested against the
  mock; the UI to push a spool to a gate/lane is the next step.
- Test bench without hardware: `npm run moonraker:mock -- --profile plain|happyhare|afc [--api-key K] [--auto-print]`
  (`scripts/moonraker-mock.mjs`), then add `127.0.0.1` by hand.
- Web: no LAN from https — the plugin bridge does not exist there.

## 12. To confirm on real hardware

- [ ] Default trust on the target images (no credentials) vs API key needed.
- [ ] Port 7125 vs 80 reachable from the LAN; multi-instance hosts.
- [ ] `printer.objects.list` on: plain Voron / Sovol, Happy Hare, AFC Box
      Turtle, QIDI Box, rooted Creality CFS, Snapmaker U1.
- [ ] Happy Hare `MMU_GATE_MAP` and AFC `SET_*` writes reflected back in the
      subscribed objects (and persisted across a Klipper restart).
- [ ] Spoolman: create / match a spool from a TigerTag and set it active.
- [ ] Webcam URLs (relative vs absolute), snapshot availability.
- [ ] Stable identity source per platform (Pi serial, vendor serial, mDNS uuid).

## 13. Sources

- Moonraker API: https://moonraker.readthedocs.io/en/latest/external_api/server/ ·
  …/printer/ · …/jsonrpc_notifications/ · …/authorization/ · …/file_manager/ ·
  …/webcams/ · …/integrations/ (Spoolman)
- Moonraker configuration: https://moonraker.readthedocs.io/en/latest/configuration/
- Zeroconf component: https://github.com/Arksine/moonraker/blob/master/moonraker/components/zeroconf.py
- KIAUH moonraker.conf template: https://github.com/dw-0/kiauh/blob/master/kiauh/components/moonraker/assets/moonraker.conf
- Home Assistant integration: https://github.com/marcolivierarsenault/moonraker-home-assistant
  (client: https://github.com/cmroche/moonraker-api)
- Happy Hare: https://github.com/moggieuk/Happy-Hare/wiki/Printer-Variables ·
  https://github.com/moggieuk/Happy-Hare/wiki/Command-Reference
- AFC: https://github.com/ArmoredTurtle/AFC-Klipper-Add-On (`extras/AFC.py`,
  `AFC_lane.py`, `AFC_spool.py`)
- Creality K2 Moonraker / CFS note: https://docs.printago.io/docs/connecting-printers/creality
