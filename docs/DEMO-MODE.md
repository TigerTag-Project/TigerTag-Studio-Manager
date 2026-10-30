# Demo mode — a printer simulator inside Tiger Studio

**Status: steps 0–4 built (2026-10-15)** — the engine, the print library with its video pipeline, the debug-mode add flow and the Demo badge, and a face for every brand: Klipper, OctoPrint, FlashForge, Prusa, Creality, Snapmaker, Elegoo (CC2 and CC1), Bambu Lab and Anycubic (both LAN only); the Klipper face also plays the Elegoo CC1 on OpenCentauri COSMOS with a CANVAS (Klipper model 166, lanes published as both `AFC_stepper` and `AFC_lane`, as reported in issue 167). Step 5's tooling is built (filmed-loop import, still photos, booth events) and waits for the founder's footage; step 6 (tutorial) is still a plan. Per-brand contracts surveyed from the client code the same day.

Fake printers that look and behave like real ones — for trade-show booths, for
screenshots, for testing the interface, and later for a first-run tutorial that
lets a new user try the printer side of Studio with no machine at hand.

## 1. The rule that shapes everything

**The protocol cores are never changed.** Each brand's driver
(`renderer/printers/<brand>/`, its main-process handlers in `main.js`, the plugins'
`main.cjs`) connects to a demo printer exactly as it connects to a real one: same
ports, same handshake, same messages. What is new is on the OTHER side of the wire —
a **printer simulator** running in Studio's main process that answers each brand in
its own protocol.

So a demo printer is just a printer record whose address points at the simulator.
Every screen, every board widget, every command path is exercised for real.

## 2. Who can use it

- **Now:** every account (desktop app) gets an extra choice in the
  Add-a-printer card — *Select a demo printer* — which opens a side card listing
  every model of every brand the simulator plays (searchable): one click on a
  model, no address to type, and it runs on that brand's own protocol. Several
  demo printers of the same brand are allowed.
- **Later:** the first-run tutorial creates one by itself; demo printers then open to
  everyone (hence: a clear *Demo* badge and an easy delete, from day one).

## 3. The pieces

```
main process — services/demo/
├─ index.js              the simulator: IPC demo:faces|allocate|sync|state|set; one
│                        Machine + one face per demo record
├─ addresses.js          where each demo printer lives; the macOS alias prompt
├─ engine.js             the shared print engine — one Machine per demo printer
├─ library.js            the print library + its camera frames (bundled ffmpeg)
├─ prints/<id>/          the generic prints (shared by every brand)
└─ faces/<brand>.js      one "face" per brand: serves that brand's protocol on the
                         printer's address, reads/writes the Machine
   faces/common.js       listening, MJPEG / snapshot, the shared G-code interpreter,
                         the low-port router (port 80)
renderer
├─ printers/demo-badge.js  Demo tag + syncDemoPrinters() (records → simulator)
└─ inventory.js            "Demo printers" section of the Add-a-printer card
                           (_renderDemoPrinterRows, addDemoPrinter)
scripts/demo-render-prints.mjs   draws the placeholder prints (thumbnail + timelapse)
```

Window bridge: `window.demoMode.{faces, allocate, sync, state, set}` (preload).
`set(id, { command: "start"|"pause"|"resume"|"stop", print, phase, progress, message, auto })`
is the scripted mode — the tutorial and tests drive a demo printer through it.

### 3.1 The engine (brand-agnostic)

One state per demo printer, the same shape whatever the brand:

```
{ id, brand, model, address,
  phase: idle | heating | leveling | printing | paused | complete | cancelled | error,
  print: { id, name, thumbnail, layersTotal, durationReal, filamentSlots[] } | null,
  progress 0..1, layer, elapsed, remaining,
  temps: { nozzle[], nozzleTarget[], bed, bedTarget, chamber, chamberTarget },
  fans: { part, aux, chamber }, speedPct, light,
  slots: [{ material, color, remainingPct, empty }],   // AMS / CFS / Canvas / ACE / gates / lanes
  event: null | { kind: "runout" | "colorChange" | "error", at } }
```

- **Cycle — a demo printer prints all the time:** heating (temperatures climb on a
  realistic curve) → leveling → printing (layers, progress, remaining time) →
  complete (the finished object on camera for 4 s) → the next print at once. The
  first print starts right after start-up; each next print is drawn at random from
  the library (never the same twice in a row), so a room of demo printers never runs
  in step. Only the user stops one: **Stop** cancels and leaves it idle until a print
  is started again; **Pause** holds until Resume. Time is **accelerated**: a print plays in 1/20 of its
  declared duration, between 2.5 and 8 min; elapsed and remaining times are reported
  in the print's own scale, so the screens read like the real job.
- **Filament colours** are drawn from the app's preset palette (the 24 colours of the
  "Select Color" sheet, `COLOR_PALETTE` in `engine.js`, kept in step with
  `SNAP_FIL_COLOR_PRESETS`): every slot at start-up (material weighted towards PLA),
  and the slots a print uses at each new print (its materials kept). Distinct within
  one printer. A **filmed** print (`videoMode: "loop"`) keeps the colours declared in
  its `print.json` for the slots it uses — they are on camera; only the other slots
  are drawn.
- **Colour changes**: the active slot follows the print's `slotStarts` (a 4-colour
  tower walks through four slots).
- **Booth events** (opt-in, `set(id, { events: true })` — off by default, since a demo
  printer must only stop when the user stops it): about one print in three
  runs out of filament somewhere between 25 % and 75 % — the active slot goes empty,
  the print pauses with the message "Filament runout" (PrusaLink shows ATTENTION,
  Klipper / Snapmaker carry the message), and 15 s later the spool is "swapped" and the
  print resumes. Resuming by hand also swaps it. Scripted mode can fire one:
  `set(id, { event: "runout" })`; `set(id, { events: false })` turns them off.
- **Commands** from any face land here: pause / resume, **stop = cancel the print**
  (phase `cancelled`, heaters off, temperatures fall slowly, back to `idle` after a
  short while), light, fan, speed, filament edit of a slot, and a **temperature
  setpoint change** on any heater (nozzle(s), bed, chamber where the model has one):
  the target moves at once, the actual temperature ramps towards it on the same
  curve as the heating phase (up or down), the pill shows "heating" until it gets
  there. Each face translates its brand's command into this one engine call
  (Klipper `SET_HEATER_TEMPERATURE`, OctoPrint `/api/printer/tool|bed`, Bambu
  `gcode_line` M104/M140, Anycubic `tempature/set`; the others read from each
  driver when its face is built).
- **Two driving modes:** *automatic* (the booth: the cycle loops by itself) and
  *scripted* (the tutorial and tests: the next print waits to be started; any state
  can be set directly, temperature targets included — the same scenario idea as the `/mock/…` API of
  `docs/PRINTER-MOCKS.md`).

### 3.2 The print library (generic, shared)

A print is defined once and plays on any brand:

```
services/demo/prints/<id>/
  print.json      { name, durationReal, layersTotal, nozzleTemp, bedTemp,
                    slots: [{ material, color }], slotStarts: [0, …], videoMode }
  thumbnail.png   what the job card and the board show
  video.mp4       the camera picture
```

`videoMode`:
- `"loop"` — ~1 minute of a REAL print, filmed, played in a loop by time (the booth set).
- `"progress"` — a timelapse: the frame shown is the one matching the print's
  progress, so the object grows on screen as the print advances.

Optional stills, for filmed loops (whose last frame is mid-print, not the result):
`empty.jpg` (shown idle / heating / leveling) and `finished.jpg` (shown when complete).

**Adding a filmed print** — no code, one command (bundled ffmpeg):

```bash
npm run demo:add-print -- --video ~/Movies/benchy.mov --id benchy \
  --duration 1h25m --layers 240 --slots "PLA:#E8452C" \
  --start 12 --thumb plate_1.png --finished done.jpg --empty plate.jpg
```

It cuts a 60 s loop from `--start`, re-encodes everything to what the simulator serves
(640×480 letterboxed, 10 fps H.264, JPEG stills, a 300×300 thumbnail — a frame of the
loop when no `--thumb`), writes `print.json` (`videoMode: "loop"`, colour changes spread
evenly over `--slots`) and the demo printers pick it up at the next start.
`npm run demo:render-prints` redraws the four placeholders.

Today the library holds four **placeholders** drawn by `scripts/demo-render-prints.mjs`
(calibration cube, spiral vase, 4-colour tower, two-colour planter; 640×480, 120
frames, `progress` mode, ~40 kB each). The founder's filmed loops and objects (with
their slicer thumbnails) replace them for the booth set — drop a folder in, no code.

### 3.3 Camera — the video follows the print

Each print has its **own** video loop, so the picture matches what is printing.
The bundled ffmpeg decodes it into JPEG frames served to each face in the form its
brand's client expects (JPEG over TLS, MJPEG over HTTP, snapshots…).

| Phase | Picture |
|---|---|
| printing | the print's loop plays |
| **paused** | **the loop stops on the current frame**, resumes from there |
| heating / leveling | the loop's first frame, held |
| complete | the loop's last frame (the finished object on the plate) |
| **cancelled (Stop)** | frozen where it was |
| idle | the first frame of the next print (the empty plate) |

Frames are decoded once per print (ffmpeg → JPEG at 10 fps, kept in memory) and
served as MJPEG at 5 frames a second; until a video is decoded the thumbnail
stands in.

### 3.4 Addresses — one local address per demo printer

The cores connect to fixed ports (Bambu 8883, Creality 9999…), so two demo printers
of the same brand need two addresses. Each demo printer gets its own **127.0.0.x**
(`addresses.js` hands them out and records the pairing).

- Windows, Linux: every 127.0.0.x answers already.
- **macOS:** only 127.0.0.1 exists by default. Starting demo mode asks once, through
  macOS's own administrator prompt, to create the needed aliases
  (`ifconfig lo0 alias 127.0.0.x`); they vanish at reboot and are asked for again.
  Without them, one demo printer per brand (all on 127.0.0.1).
- **Brands whose record takes a port** need no alias at all: every demo printer is
  `127.0.0.1:<port>`, one port each — Klipper 47101+, OctoPrint 47201+, Prusa 47301+,
  FlashForge 47401+ (its `ip` is a full URL, `http://127.0.0.1:<port>`).
- **Fixed-port brands** (Creality 9999 / 7125 / 8080, Snapmaker 7125, Elegoo 1883 /
  8080 or 3030 / 3031, Bambu Lab 8883 / 6000, Anycubic 9883 / 18088 / 18910) get a host of
  their own, `127.0.0.10` and up — never 127.0.0.1, so two brands sharing a port
  (Creality's Moonraker and Snapmaker both use 7125) or a dev mock on the wildcard
  never collide. `addresses.ensureHosts` creates the missing aliases in ONE macOS
  administrator prompt (`osascript … with administrator privileges` →
  `ifconfig lo0 alias`) before those faces start; declined → those printers stay
  offline, the others run. Verified: the prompt, then 127.0.0.10 / .11 in `ifconfig lo0`.

**Measured on macOS 26 (step 0):**

| Test, as a normal user | Result |
|---|---|
| bind `127.0.0.1:9999` (TCP) / `:52700` (UDP) | ok |
| bind `127.0.0.2:…` without an alias | `EADDRNOTAVAIL` — the alias is required |
| connect to `127.0.0.2` while a server listens on `0.0.0.0` | times out — no alias, no route |
| bind `127.0.0.1:80` or `:990` | `EACCES` |
| bind `0.0.0.0:80` | **ok** — macOS lets a user bind a low port on the wildcard only |

So a face that needs port 80 or 990 (Creality thumbnails, Prusa, Elegoo timelapse,
Bambu FTPS) listens ONCE on `0.0.0.0:<port>` and routes each connection by its
`socket.localAddress` to the right demo printer — and refuses any connection whose
remote address is not loopback, so nothing is exposed to the network.

### 3.5 The records

A demo printer is a normal record in the user's own account,
`users/{uid}/printers/{brand}/devices/{id}`, with its address set to its 127.0.0.x
and a `demo: true` flag (for the badge and for the simulator to know what to serve).
The simulator starts when the signed-in account holds at least one demo printer and
stops when none is left. Opened on a computer where the simulator does not run, a
demo printer is simply offline — nothing breaks.

## 4. The faces, brand by brand

Read from the client code (2026-10-15 survey; file:line references are the client's,
`main.js` and `renderer/printers/<brand>/`). A face has to satisfy exactly this.

### 4.0 Constraints common to every face

- **Add by record, not by scan.** Subnet sweeps drop 127.x (`net:get-local-subnets`,
  `extra-subnets.js`), so demo printers are written straight into the account by the
  *Demo printer* flow, with every field the driver needs (below). No discovery needed.
- **UDP replies must come FROM the printer's address** — Elegoo (:52700, :3000) and
  FlashForge (:19000) check `rinfo.address === ip`: bind each UDP socket to its
  127.0.0.x, never 0.0.0.0.
- **CORS:** the main window keeps `webSecurity` on — any endpoint the renderer
  `fetch()`es and reads (Snapmaker especially) answers `Access-Control-Allow-Origin: *`.
  `<img>`, `<iframe>` and WebSocket need nothing.
- **Ports below 1024** (80, 990): whether a non-root process may bind them on a
  127.0.0.x on macOS is to be verified first; avoid them where the record allows a
  port (Prusa `ip:port`, FlashForge full URL, Creality `cameraUrl`).
- **Keep faces up** while their printers exist: repeated failures trigger the
  re-find (`requestPrinterRefind`), which would go looking for the printer elsewhere.

### 4.1 Contract per brand

| Brand | Transport the client opens | Auth / identity | "Connected" when | Camera to serve | Record fields the demo flow writes |
|---|---|---|---|---|---|
| **Creality** | WS `:9999` (+ Moonraker HTTP `:7125` for jog/temps) | none | first frame that is not `ok`; answer `{"ModeCode":"heart_beat"}` with `ok` | MJPEG via `printer.cameraUrl` (skip WebRTC) | `ip`, `cameraUrl` |
| **Elegoo CC2** | MQTT `:1883` | user `elegoo`, password (default `123456`), SN in topics | first message on `elegoo/{sn}/…` | MJPEG URL from method 1042 | `ip`, `serialNumber`, `password` |
| **Elegoo CC1** | WS `:3030/websocket` (SDCP) | `MainboardID` | first `sdcp/status|attributes|response/…` | MJPEG from Cmd 386 `VideoUrl` (`:3031/video`) | `ip`, `mainboardId`, `protocol: "sdcp"` |
| **FlashForge** | HTTP POST `/detail` `/control` (`:8898` or a full URL in `ip`) | `serialNumber` (`SN…`) + `checkCode` in the body | `code:0` + `detail` | MJPEG `detail.cameraStreamUrl` | `ip`, `serialNumber`, `password` |
| **Snapmaker** | WS `:7125/websocket` JSON-RPC + renderer `fetch` (CORS) | none | first frame | still mode: `camera.start_monitor` + `monitor.jpg` | `ip` |
| **Prusa** | HTTP (PrusaLink `/api/v1/…`), `ip:port` allowed | **HTTP Digest** `maker` / password | `200` on `/api/v1/status` | `/api/v1/cameras/snap` | `ip` (with port), `password` |
| **Anycubic** | MQTT over **TLS 1.2 only** `:9883` + HTTP `:18910/info` | `username`, `password`, `acuModelId`, `deviceId` in topics (all non-empty) | first message after SUBACK | FLV `:18088/flv` → needs a canned FLV / ffmpeg | `ip`, `port`, `username`, `password`, `acuModelId`, `deviceId` |
| **Bambu Lab** | MQTT over TLS `:8883` (cert not verified) | `bblp` / access code, serial in topics | first report after `pushall` | **JPEG-over-TLS `:6000`** (80-byte auth, 16-byte header + JPEG) for P1/A1 models; RTSPS `:322` for X1/H2 | `broker`/`ip`, `serialNumber` (prefix picks the model, e.g. `01P` P1S), `password`, `printerModelId` |
| Klipper / OctoPrint | HTTP (existing mocks) | optional `X-Api-Key` | as the mocks | MJPEG / snapshot | `ip` (with port), `apiKey` |

What each face must publish (keys the drivers parse) and accept (commands):

- **Creality** — flat JSON push: `state` (0 idle / 1 printing / 2 finished), `printProgress`, `printLeftTime` (s), `layer`, `TotalLayer`, `printFileName`, `nozzleTemp` / `targetNozzleTemp`, `bedTemp0` / `targetBedTemp0`, `boxTemp`, fan `%`s, `lightSw`; CFS `boxsInfo.materialBoxs[{id, type, materials[{color "#0rrggbb", type, state, selected}]}]` (box `id:0` = external). Accepts `{"method":"set","params":{pause, stop, lightSw, gcodeCmd, feedInOrOut, modifyMaterial}}`.
- **Elegoo CC2** — `result.print_status{state, progress, current_layer, filename, remaining_time_sec, print_duration}`, `machine_status`, `extruder` / `heater_bed` `{temperature, target}`, fans, `led.status`; Canvas via method 2005 `canvas_info.canvas_list[0].tray_list[]`; total layers from the 1044 file list. Accepts methods 1021 / 1023 / 1022 (pause / resume / cancel), 1026–1031, 2003 / 1055 (filament).
- **Elegoo CC1** — `Status{CurrentStatus[], PrintInfo{Status, Filename, CurrentLayer, TotalLayer, Progress, CurrentTicks, TotalTicks}, TempOfNozzle…}`; Cmd 129 / 130 / 131 with `Ack: 0`; answers `ping` with `pong`.
- **FlashForge** — `detail{status, printProgress, printLayer, targetPrintLayer, estimatedTime, printFileName, printFileThumbUrl, rightTemp…, platTemp…, chamberTemp…, fans, matlStationInfo{currentSlot, slotCnt, slotInfos[]}, cameraStreamUrl}`; `/control` `jobCtl_cmd`, `lightControl_cmd`, `msConfig_cmd`. Wrong code → `code:1` with the exact messages.
- **Snapmaker** — Moonraker objects (`print_stats`, `display_status`, `extruder`…`extruder3`, `heater_bed`, `toolhead`, `fan`, `fan_generic cavity_fan`, `led cavity_led`, `print_task_config{filament_color_rgba[4], filament_type…}`) via `printer.objects.subscribe` + `notify_status_update`; `printer.gcode.script`; `server.webcams.list` empty → still camera.
- **Prusa** — `/api/v1/status{printer{state, temp_*, target_*, fan_*, speed, flow}, job{id, progress, time_remaining, time_printing}}`, `/api/v1/info`, `/api/version`, `/api/v1/job{file{display_name, refs.thumbnail, meta}}`; `PUT …/pause|resume`, `DELETE /api/v1/job/{id}`.
- **Anycubic** — topic `…/printer/public/{modelId}/{deviceId}/…`, messages `{type, action, state, data}`: `print` (`progress`, `remain_time` min, `curr_layer`, `total_layers`, temps, `settings`), `multiColorBox` (`slots[{index, type, color:[r,g,b], status}]`), `tempature`, `fan`, `light`; accepts `print` pause / resume / stop, `light/control`, `axis/move`, `fan/setSpeed`, box `setInfo`.
- **Bambu Lab** — `device/{serial}/report` → `print{gcode_state, mc_percent, mc_remaining_time (min), layer_num, total_layer_num, subtask_name, nozzle_temper / bed_temper / chamber_temper (+ targets; or the packed `device.*` form), ams.ams[{tray[{tray_color "RRGGBBAA", tray_type, state}]}], vt_tray, lights_report, spd_lvl, fan speeds (0–15)}` plus `info.module[]` (AMS type); accepts `print.command` pause / resume / stop, `gcode_line`, `system.ledctrl`, `print_speed`, `ams_filament_setting`. Thumbnails over FTPS `:990` are optional (the job card falls back to the model picture).

### 4.2 Difficulty → order

Easy: **Creality, Elegoo (CC2 + CC1), FlashForge, Snapmaker, Prusa**, Klipper, OctoPrint.
Medium: **Bambu Lab** (MQTT over TLS + the JPEG-over-TLS camera; serial prefixes pick
the model), **Anycubic** (TLS 1.2 pin, FLV camera).

### 4.2b The machine is the model (`services/demo/shapes.js`)

A demo record's `printerModelId` decides the machine the simulator plays, read
from the brand's printer catalog (`data/printers/*_printer_models.json`, the
Klipper / OctoPrint `models.json`): feeders (AMS / CFS / ACE / IFS → 4 slots,
MMU → 5), heads (`tools`), chamber (`Enclosed`, where the catalog fills it in).
What the catalogs do not say sits in `OVERRIDES` (H2 dual nozzle, U1 heads,
Elegoo Canvas). Each face reports that shape as the real machine would; the
Bambu RTSP models also get their RTSPS camera on :322 (`bambu-rtsp.js`) — on
their own loopback host only, not behind a `host:port` address.

### 4.3 Demo printers on the network (`demoLan: true`)

For devices that test against the simulator from the local network (Tiger Touch, the
mobile app), a demo record can sit on this computer's own network address instead of
a loopback one. The simulator serves any address that is loopback or one of this
computer's IPv4 addresses (`addresses.servable`); clients are not filtered.

- Fixed-port brands use their real ports on the bare address (Bambu Lab 8883 / 6000,
  Creality 9999 + camera 8081 via `cameraUrl`, Elegoo 1883 / 8080 and 3030 / 3031,
  FlashForge 8898, Snapmaker 7125, Anycubic 9883 / 18088 / 18910) — so one printer per
  brand per address. Klipper, OctoPrint and Prusa take `ip:port`.
- On a network address the Creality K2 does not open 7125 (left to the Snapmaker):
  its G-code channel (temperature targets, jog from Studio) is loopback-only.
- The computer's address can change (DHCP): records flagged `demoLan: true` are
  rewritten by Studio to the current one at every printer snapshot
  (`repointLanDemos`, IPC `demo:lan-host`), the port kept. A DHCP reservation for the
  computer avoids the churn on the devices' side.
- The printers only answer while Studio runs with that account active.
- Firmware that hard-codes each brand's port (Tiger Touch today) can reach one printer
  per brand this way; several printers of one brand need "host:port" support in the
  client.

## 5. Delivery, step by step

0. ✅ **Verified** (§3.4): aliases need the admin prompt; low ports only on the
   wildcard. The prompt itself is built with the first fixed-port brand (step 2).
1. ✅ **Built**: engine, print library + video pipeline, the debug-mode *Demo printer*
   add flow, the *Demo* badge, address allocation, faces **Klipper and OctoPrint**.
   The dev mocks (`scripts/*-mock.mjs`) stay as they are: dependency-free tools for
   another device on the LAN; the faces listen on loopback only.
2. ✅ **Built**: **FlashForge** (AD5X, 4-slot station; serial + access code checked),
   **Prusa** (CORE One + MMU3; HTTP Digest checked), **Creality** (K2 Plus + CFS;
   ws 9999, Moonraker 7125 for G-code, MJPEG 8080 via `cameraUrl`, thumbnails on the
   shared port 80), **Snapmaker** (U1, 4 toolheads; JSON-RPC over ws 7125, still
   camera `monitor.jpg`, CORS on every HTTP answer). Each face is told its fields by
   `recordFields(address)` (address, serial, access code, password…) so the
   renderer's add flow stays brand-agnostic.
3. ✅ **Built**: **Elegoo**, one face with two variants (the Add-a-printer card shows
   one row per variant):
   - **CC2** (Centauri Carbon 2 + Canvas) — an `aedes` MQTT broker on :1883 (user
     `elegoo` + the record's password, refused otherwise), `api_register` →
     `register_response`, `api_request` → `api_response` routed by method (1002 / 1005
     status, 2005 Canvas, 1042 camera URL, 1044 files with layers, 1045 thumbnail in
     base64, 1020-1031 commands, 2003 / 1055 filament), status pushed on `api_status`
     every 2 s, `PING` → `PONG`; MJPEG camera on :8080.
   - **CC1** (Centauri Carbon, SDCP v3, record `protocol: "sdcp"` + `mainboardId`, so no
     UDP probe) — WebSocket :3030/websocket, Cmd 0 / 1 / 386 / 129-131 acknowledged,
     status pushed every 2 s, `ping` → `pong`; MJPEG camera on :3031 (Cmd 386 names
     it with the printer's own host — 127.0.0.1 would be rewritten by the driver).
4. ✅ **Built**, LAN mode only (no cloud field on the records, an auto id never
   `cloud_…`, so failover / cloud sync / "unbound" never look at them). Both drivers
   speak MQTT over TLS but verify no certificate: the faces present the demo one
   (`services/demo/certs/`, public on purpose — it protects nothing, loopback only)
   in front of an `aedes` broker carrying the brands' plain JSON.
   - **Bambu Lab** — a P1S + AMS (serial `01P…`, model id 3): MQTT :8883 (`bblp` +
     access code, refused otherwise), `get_version` → module list (`ams/0`), `pushall`
     → full `push_status`, a delta every second, commands (pause / resume / stop,
     `gcode_line`, `ledctrl`, `print_speed`, `ams_filament_setting`) echoed in the next
     push; camera :6000 — 80-byte auth in, `[16-byte header + JPEG]` frames out (the
     P1 / A1 transport; the X1 / H2 RTSPS one is not simulated); file server FTPS :990
     (`bambu-ftps.js`): implicit TLS, `bblp` + access code, PASV answering `0.0.0.0` and
     no EPSV like the firmware, every library print as `/model|/cache/<id>.gcode.3mf` — a
     ZIP with `Metadata/plate_1.png` — so the job card shows the real thumbnail. Port 990
     goes through a shared raw-TCP router (`routeLowPortTcp`); one per host.
   - **Anycubic** — a Kobra 3 V2 + ACE Pro (`acuModelId` 20027): MQTT :9883 over TLS
     1.2 only, `{type, action, state, data}` both ways (getInfo / query answered,
     print / temperature / status / info pushed every 2 s, commands echoed); camera
     :18088/flv — a real FLV stream the bundled ffmpeg encodes on the fly from the
     print's frames (the driver's probe wants the `FLV` bytes first); `/info` on :18910.
5. **Booth content** — ✅ tooling built (`demo:add-print`, the stills, the booth
   events); ⏳ waiting for the founder's filmed loops and objects. Filming tips: a fixed
   camera, the nozzle in frame, 60–90 s of steady printing (no first layer, no
   finish), plus one photo of the empty plate and one of the finished part from the
   same spot.
6. Later: the first-run tutorial on top of the scripted mode — parked with its open
   decisions in GitHub issue #88 (TigerTag-Project/TigerTag-Studio-Manager).

Each step ships on its own and is checked in the real app against every screen
(side card, board widgets, camera wall, commands).

## 6. Decided

- Integrated in Studio (main process), not a separate machine — booths have bad Wi-Fi.
- Multi-brand; prints generic and shared by every model.
- Protocol cores never changed; the simulator owns the fake connections and the data.
- Several demo printers per brand, one local address each.
- One ~1-minute filmed loop per print; pause / stop freeze it as in §3.3.
- Stop cancels the print.
- Demo printers in the user's own account, open to every user of the desktop app.
- MQTT broker: `aedes` 1.2.0 (MIT) — `const { Aedes } = require('aedes'); await Aedes.createBroker()`.
- Later use: a first-run tutorial for new users.
