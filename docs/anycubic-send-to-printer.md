# Anycubic printers in Tiger Studio Manager

Tiger Studio Manager talks to Anycubic printers as a first-class brand, alongside
Bambu Lab, Creality, Elegoo, FlashForge and Snapmaker. It reads the printer's ACE
box/slot layout, lets you set a slot's filament (type + colour), shows live job /
temperature telemetry, and — on the models that support it — a camera feed. Both
**LAN-mode** and **cloud-mode** printers work, and a mixed fleet coexists in one
list.

A printer is only ever in one mode at a time; the app picks the right channel per
printer automatically. The connection label on each card reads **`MQTT (LAN)`** or
**`Cloud`** so you can tell them apart.

> Implementation lives in `renderer/printers/anycubic/` (`index.js` driver,
> `cards.js`, `probe.js`, `add-flow.js`, `settings.js`, `widget_camera.js`),
> `main.js` (the `anycubic:*` IPC bridge), `preload.js` (`window.anycubic`),
> and `services/anycubicCloudCerts.js`. The deep protocol reference is
> [`anycubic-lan-control-protocol.md`](anycubic-lan-control-protocol.md); the
> concise agent-skill version is `renderer/printers/anycubic/PROTOCOL.md`.

---

## How it works

Anycubic gates "set slot filament" behind a cloud-authenticated, signed channel that
can't be reproduced from scratch. But the operation ultimately lands on the printer
as a plain MQTT message, and the credentials are durable. So the app never reproduces
any secret — it borrows what the slicer already has, then runs on its own:

- **LAN-mode printers** — reached **directly** over your network at
  `mqtts://<printer-ip>:9883` (TLS 1.2 + username/password; no client certificate
  required). Fully local; nothing leaves your network. Credentials are read once from
  AnycubicSlicerNext's on-disk config — **the slicer doesn't even need to be running**.
- **Cloud-mode printers** — reached through Anycubic's cloud (signed REST +
  cloud MQTT), authenticated as you. The session token is read from a **running,
  signed-in slicer** the one time you provision (and refreshed the same way).

The same `multiColorBox` get/set channel carries both modes — only the transport
differs — so the report parser and the filament-card UI are shared.

```
get layout   → web/printer/{modelId}/{deviceId}/multiColorBox  {"type":"multiColorBox","action":"getInfo",…}
report       ← printer/public/{modelId}/{deviceId}/multiColorBox/report  {…,"data":{"multi_color_box":[…]}}
set a slot   → web/printer/{modelId}/{deviceId}/multiColorBox  {"type":"multiColorBox","action":"setInfo",
               "data":{"multi_color_box":[{"id":<box>,"slots":[{"index":<slot>,"type":"PETG","color":[r,g,b]}]}]}}
```

---

## Adding an Anycubic printer

Printers view → **`+` / Add Device** → **Anycubic**. The add flow offers four paths:

### 1. Import from Anycubic Slicer (LAN — the primary path)
Reads every paired LAN printer's durable broker credentials (IP, username, password,
`deviceId`, numeric `modelId`) straight out of AnycubicSlicerNext's on-disk config
(`%APPDATA%\AnycubicSlicerNext\AnycubicSlicerNext.conf`, key `machine_list_of_LAN`).
**The slicer does not need to be running** — it only needs to have paired the printer
(in LAN mode) at least once. One click lists every paired printer; pick one to add it.

### 2. Scan network (LAN)
Scans your subnets for LAN-mode printers (a fast TCP check on port `18910`, then a
`GET /info`). Useful to confirm a printer is reachable or to repair a changed DHCP IP
— scan hits are matched back to the imported credentials by IP.

### 3. Enter IP address (LAN, manual)
Type the printer's local IP; the app probes `/info` to confirm it's an Anycubic FDM
printer and pre-fills the model, then merges in the imported credentials.

### 4. Add a cloud printer
For printers in **cloud mode**. This needs the slicer **running in bridge mode**,
signed in, with the Workbench open (see *Cloud provisioning* below). It lists your
account's cloud printers; pick the online one to add it.

Printers are stored as Firestore docs under `users/{uid}/printers/anycubic/devices`.
LAN docs carry `{ ip, acuModelId, deviceId, username, password }`; cloud docs carry
`{ mode:"cloud", cloudPrinterId, machineType, key, cloudToken, cloudEmail }` (doc id
`cloud_<id>`, so re-provisioning upserts and refreshes the token). They sync across
your devices like every other printer.

---

## LAN provisioning — why the slicer can stay closed

Once AnycubicSlicerNext has paired a LAN printer, it caches the full credentials on
disk under `machine_list_of_LAN`, behind a keyless, reversible obfuscation (nested
base64 with a +5 byte shift) that the app decodes directly. So **Import from Anycubic
Slicer** reads the file with no running slicer, no remote-debugging port, and no
WebView — it just needs the slicer installed and the printer paired once. (First-time
pairing of a brand-new printer still happens in the slicer; that's where the durable
credentials are minted.)

The credentials are long-lived: the matching client certificate is valid ~10 years
and the username/password survive slicer restarts. You only need to re-import a LAN
printer if you re-pair it, reset LAN mode, or its **DHCP IP changes**.

---

## Cloud provisioning — attach-only, the app never launches the slicer

The cloud (workbench) API needs a session token the slicer mints in memory at login.
That token is **not persisted to disk** (the on-disk OAuth token is a different,
rejected one), so the app reads it from the **running** slicer over the Chrome
DevTools Protocol — and **only attaches; it never launches the slicer**. You run the
slicer yourself in bridge mode:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
& "C:\Program Files\AnycubicSlicerNext\AnycubicSlicerNext.exe"
```

…signed in, with the **Workbench** tab open on the cloud printer. Then **Add a cloud
printer** attaches to `127.0.0.1:9222`, reads the workbench token + your email, lists
your cloud printers, and stores the token on the printer doc.

### Token refresh (revocation, not expiry)
The workbench token is a 90-day JWT — but Anycubic **revokes the previous token when a
new slicer session logs in**. So a stored token can go stale across sessions, and a
cloud printer that was online "yesterday" can show offline after a restart. The app
handles this:

- When the cloud rejects the stored token (`10001`), it **automatically re-grabs a
  fresh token from a bridge-mode slicer** (if one is running) and persists it — the
  printer comes back online on its own, no delete/re-add.
- If no bridge-mode slicer is reachable, it surfaces a clear message
  ("Cloud sign-in expired — re-add the printer with the slicer in bridge mode")
  instead of failing silently.

LAN printers are unaffected by any of this.

> **Note — one cloud connection at a time.** The cloud MQTT broker enforces a fixed
> client id per account, so the app and the slicer's Workbench can't both hold a cloud
> connection at once (they'd kick each other). Setting a slot is a REST call and works
> regardless, but for clean live telemetry, don't keep the slicer's Workbench open on a
> cloud printer while using the app on the same printer.

---

## Filament: layout + setting a slot

The printer side panel shows the live ACE layout, fetched directly from the printer
via `multiColorBox/getInfo` (re-queried every 30 s and on open). Each box is its own
row of slots:

- Box **`-1`** = the external / standalone spool box, boxes **`0..N-1`** = ACE units.
  **Every box is a multi-slot unit** — the external box has its own slots too (a Kobra X
  / ACE Pro 2 reports box `-1` with **4** slots; a basic Kobra 3 with no ACE has **1**).
- Slot tags: external → `E1…E4`, ACE units → `A/B/C/D…`.
- `model_id` distinguishes ACE generations (`40001` = ACE Pro, `40002` = ACE Pro 2).

Click a slot → pick a type and colour → **Apply**. The slot updates to the filament's
base type (e.g. "PLA Matte" → `PLA`) and RGB.

### The standalone external spool (no ACE)
A printer with no ACE attached (e.g. a Kobra 3) reports its external spool on a
**separate channel** (`extfilbox`), not `multiColorBox`. The app requests it
(get order `1230`), shows it as the `E1` slot, and **sets** it with its own order
(`1229`, `{type, color}`) — distinct from the `multiColorBox` set used for ACE slots
and the Kobra X's box `-1`.

### What's settable
Whether LAN or cloud, a manual set honours only **type + colour**. Richer fields
(sku/brand/temps/diameter) are silently dropped by the printer — a full filament
profile only lands in a slot when the ACE reads it from an **RFID tag**
(`source: RFID`). Pure black is nudged to `010101` (the ACE renders `0,0,0` as
transparent), matching the slicer.

---

## Camera

ACE-capable printers that expose a local HTTP-FLV stream (port `18088`) show a live
feed in the side panel, the cam wall, and the detached camera window. The feed is
**on-demand**: the app activates it (`video/startCapture`), the printer confirms, and
ffmpeg (bundled) remuxes the FLV to ~5 fps JPEG frames over IPC. It's probe-gated, so
a printer with no active stream just shows its photo — no errors.

Some newer/enclosed models (e.g. the **Kobra X**) stream via **WebRTC/Tencent TRTC**
instead of local FLV; those have **no camera** in the app (the printer advertises no
`rtspUrl`, and the app leaves it on the hero photo). Everything else — slots, job,
temperatures — still works on those printers.

---

## Live telemetry

While connected, the app parses the printer's `print` / `tempature` / `fan` / `status`
reports (the same subtree the layout arrives on) into a **job card** (filename, %,
remaining time, layers, state) and a **temperature card** (nozzle + bed). Cloud and
LAN printers report the same shapes, so the cards are identical across modes. Anycubic
cards also show live job progress in the printers grid and table.

---

## Limitations

- **LAN mode** must be on for the local path; first-time pairing always happens in
  the slicer (that's where durable credentials are minted).
- **Cloud printers** need a bridge-mode slicer at provision/refresh time, and the
  app never holds the cloud MQTT at the same time as the slicer's Workbench.
- **Only type + colour are settable** (full profiles need an RFID tag).
- **Camera** is local-FLV models only; WebRTC/TRTC models (Kobra X) have no camera.
- See [`anycubic-lan-control-protocol.md`](anycubic-lan-control-protocol.md) for the
  full protocol background and the reverse-engineering history.
