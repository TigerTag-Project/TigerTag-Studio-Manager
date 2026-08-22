<div align="center">

# Tiger Studio Manager 2

<img src="assets/img/icon.png" width="140" alt="Tiger Studio Manager" />

**Desktop companion for the [TigerTag](https://tigersystem.io) RFID filament-tracking ecosystem.**<br>
Manage your spool inventory, connect your 3D printers, and keep everything in sync — across devices, accounts, and friends.

<br>

<a href="https://github.com/TigerTag-Project/TigerTag-Studio-Manager/releases">
  <img src="assets/svg/download_macos.svg" width="420" height="68" alt="Download for macOS">
</a>
<br>
<a href="https://github.com/TigerTag-Project/TigerTag-Studio-Manager/releases">
  <img src="assets/svg/download_windows.svg" width="420" height="68" alt="Download for Windows">
</a>
<br>
<a href="https://github.com/TigerTag-Project/TigerTag-Studio-Manager/releases">
  <img src="assets/svg/download_linux.svg" width="420" height="68" alt="Download for Linux">
</a>

<br><br>

[![Latest release](https://img.shields.io/github/v/release/TigerTag-Project/TigerTag-Studio-Manager?label=Latest&color=FF6B00)](https://github.com/TigerTag-Project/TigerTag-Studio-Manager/releases/latest)

*Intel + Apple Silicon · macOS: Signed & Notarized · No installation knowledge required.*

<br>

[![Build & Release](https://github.com/TigerTag-Project/TigerTag-Studio-Manager/actions/workflows/build.yml/badge.svg)](https://github.com/TigerTag-Project/TigerTag-Studio-Manager/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-41-blue)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-green)](https://nodejs.org/)

</div>

---

## What is it?

**[TigerTag](https://tigersystem.io)** is an open RFID standard for tracking 3D-printing filament spools. Each spool carries an NFC chip with its full profile — brand, material, color, print settings — readable by any compatible app or reader. The ecosystem includes the mobile app, an open-source scale, a color sensor, and this desktop companion.

Tiger Studio Manager is an Electron desktop app that bridges your physical filament collection with the TigerTag cloud. Scan a spool's NFC chip, see its full profile (material, color, weight, print settings), update its weight on the scale, and push filament data directly to your connected printers — all in one window.

Since **2.15.0** it does not even need a chip to know what a spool is: the official product catalogue is searchable
from inside the app, and any product in it can be added as a **TigerData+** — a fully-digital spool carrying that
product's real identity. Buy a chip when you want one on the shelf; until then, the app is no longer guessing.

It works standalone (no reader needed), but unlocks its full potential with:
- an **ACR122U NFC reader** for automatic spool identification, chip encoding and Cloud-to-chip promotion
- a **TigerScale** ESP32 scale for live weight tracking
- one or more **3D printers** from the 6 supported brands

<img src="assets/img/Hero-TigerSystem-ecosystem.png" width="100%" alt="The TigerTag system — Tiger Studio Manager on desktop, a TigerPOD reader with a tagged spool, and the mobile app" />

<p align="center"><em>…and the same thing on a real bench:</em></p>

<img src="assets/img/screenshots/screenshot_setup_tiger_project.png" width="100%" alt="TigerTag ecosystem setup — Tiger Studio Manager, TigerScale, TD1S, ACR122U and TigerPOD" />

> 🌐 **[tigersystem.io](https://tigersystem.io)** — the ecosystem site: browse the filament catalogue, manage your account, get the apps.<br>
> 🛒 **[tigertag.io](https://tigertag.io)** — the shop: TigerTag chips, readers and sensors.

---

## A sandbox, not the product

Tiger Studio Manager is one piece of **TigerSystem**, the open ecosystem built around
the TigerTag protocol — and it is deliberately **a laboratory, not the destination**.

Everything you see here is a demonstration of what open, documented technology makes
possible once a filament spool can identify itself: live printer telemetry across six
brands, physical rack mapping, sensors, shared wishlists, chipless tracking. Some of it
will mature, some of it exists to prove a point, and all of it is readable, forkable and
free to copy.

The approach is **neutral and agnostic by design**. TigerTag takes no side between
filament brands, printer makers or distributors. It is not a walled garden with a
partner list — it is a format anyone can read and write.

> **Build your own.** TigerTag is an open protocol, not a platform you have to join.
> Nothing here is a prerequisite: read the [chip format](https://github.com/TigerTag-Project/TigerTag-RFID-Guide),
> pick up an [SDK](https://github.com/TigerTag-Project/TigerTag-SDK-JS), and build the
> software, the ecosystem or the business you actually want. This app is what *we*
> wanted — yours can be something else entirely, and it will still speak the same chips.

---

## Open source ecosystem

Everything around TigerTag is open — the hardware, the firmware, the SDK, and this app.

| Project | What it is | License |
|---|---|---|
| **[Tiger Studio Manager](https://github.com/TigerTag-Project/TigerTag-Studio-Manager)** | This app — desktop companion for filament management | MIT |
| **[TigerTag SDK for JavaScript](https://github.com/TigerTag-Project/TigerTag-SDK-JS)** | Parse, verify, and encode TigerTag NFC chips — used internally by this app | MIT |
| **[TigerTag SDK for Python](https://github.com/TigerTag-Project/TigerTag-SDK-Python)** | Parse, verify, and encode TigerTag NFC chips in Python — for scripts, tools, and automation | MIT |
| **[TigerScale V3](https://github.com/TigerTag-Project/Tiger-Scale-V3)** | ESP32-S3 firmware + hardware for the open-source filament scale — 3.5" touchscreen, dual NFC readers, battery | MIT |
| **[TigerPOD](https://github.com/TigerTag-Project/TigerPOD)** | Open-source dual NFC reader/writer stand for spools — 3D-printable shell + two USB readers (free STL on MakerWorld: [Standard](https://makerworld.com/en/models/1289152-tigerpod-for-openspool-tigertag-rfid-filament#profileId-1318958) · [Mini](https://makerworld.com/en/models/3190348-tigerpod-mini-for-openspool-tigertag-rfid-filament#profileId-3609236)) | CC BY 4.0 |

The **TigerTag SDK** is the low-level library that handles all NFC chip operations — reading the 144-byte NTAG payload, verifying the TigerTag format, and encoding new chip data. It is published as an npm package (`tigertag`) and can be used independently to build custom TigerTag-compatible tools.

---

## Features

> The highlights below are a curated subset. See **[FEATURES.md](./FEATURES.md)** for the complete, always-current catalogue of every shipped feature — grouped by domain, with the version each one landed.

### 🗂 Inventory
- Real-time Firestore sync — table view + grid view, column sort, full-text search
- Detail side panel — color, print settings, weight slider with auto-save, container, raw JSON
- Weight tracking — slider or manual entry; instant cloud sync after update
- **Container weight calibration** — correct a container's empty weight against your own scale, with a guided "how to measure" step; kept on your account and applied to every spool in that container (the bundled catalogue is never modified)
- **TigerData** — create fully-digital spools with no chip; promote to a real chip later, atomically
- **TigerData+** *(new in 2.15.0)* — a fully-digital spool that is nonetheless tied to a **real product in the official catalogue**: the exact brand, colour, material, temperatures, diameter, SKU and EAN, straight from the source instead of from whatever you typed. No chip to buy, nothing to stick on — and it is not a TigerTag+, so it carries its own badge and never pretends to be one
- **Catalogue search** *(new in 2.15.0)* — browse the whole official TigerTag+ catalogue from inside the app, in grid or list, filtered by type, brand, series and material. Pick a product to see its real spec sheet, then add it as a TigerData+ in one click, already filled in. The catalogue is downloaded once and searched locally, so it is instant and works offline
- **The catalogue travels with the app** *(new in 2.16.0)* — nearly 5 000 filaments ship inside the installer, so search works on the very first launch, offline, without waiting for a download. It still refreshes itself in the background
- **Find a filament by its barcode** *(new in 2.17.0)* — scan the EAN on the box with a barcode reader, or type it in, and the catalogue opens that product. The search also covers the reference, the series, the colour name, the finish, the product type and the weight
- **Spools that keep themselves current** *(new in 2.16.0)* — when a brand corrects a temperature, a diameter or a colour name, the spools you own follow along on their own. Only a TigerTag+ can ever ask you for anything, and only when the change concerns something written on the chip itself
- Custom product image for DIY & Cloud spools
- Manufacturing date, twin-tag detection and manual repair
- Spool toolbox — scan color (TD1S), scan TD, link twin, remove from rack, delete
- **One action row on every card** — the product card, the spool detail and the stack of identical spools all offer the same buttons, including a shopping button that opens the shop when the filament has a buy link (and takes you to where you'd add one when it hasn't)
- **Multi-select** — tick several spools (or printers) and delete them together, with a hold-to-confirm
- **Guided chip update** — a step-by-step panel to re-write an existing chip: place it on the reader, UID-match check, verified write
- **Export / import `.ttag` files** — back up a spool or a whole selection to a portable file, keep it, carry it on a USB stick or share it, then import it back anywhere. Works for TigerData, TigerTag and TigerTag+ alike; import through a validate → preview → accept flow and choose **Restore** (put everything back exactly as it was) or **Import** (fresh spools you own). Pull in several files at once by browsing, pasting a link, or dragging them onto the window

### 🖨 3D Printer integration
Live integrations for 6 brands — real-time temperatures, filament per slot, active print job, camera:

| Brand | Protocol | Status |
|---|---|---|
| **Anycubic** | MQTTS 9883 (TLS) / cloud + ACE | ✅ Live |
| **Bambu Lab** | MQTTS 8883 (TLS) + AMS | ✅ Live |
| **Creality** | WebSocket 9999 + CFS | ✅ Live |
| **Elegoo** | MQTT 1883 + Canvas | ✅ Live |
| **FlashForge** | HTTP polling 8898 + matlStation | ✅ Live |
| **Snapmaker** | Moonraker WebSocket 7125 | ✅ Live |

Each brand supports: filament edit per slot, printer discovery (mDNS + port-scan + Add by IP), camera widget.

The **printers table** shows, per printer: a live **print preview** (the model on the bed), the current job, and an **"Ends at"** column with the wall-clock finish time — plus per-printer **tags** and a search bar with **Brand / State / Tags** filters to manage a whole fleet.

Some brands also expose a **live control panel** (Snapmaker, Elegoo, Anycubic): home / jog the axes, set nozzle & bed targets, toggle the light, control the part-cooling fan, pick the print-speed mode, and load / unload filament per slot.

### 📦 Storage / Racks

<p align="center"><img src="assets/img/Panda_Feed_Rack.png" width="480" alt="A filament rack in Tiger Studio Manager" /></p>

Organize your filament collection into physical racks — drag spools onto slots, auto-fill from inventory, and always know where each spool sits:
- **Drag-and-drop rack editor** — Skyline masonry layout, slot locking, auto-fill / auto-store
- **Rack builder** — a three-step side card: name and subtitle, levels and slots per level with − / + steppers, and a live preview that shows an existing rack's real contents while you resize it
- **Unranked panel** — spools not yet assigned to a rack, always visible at a glance
- **Rich hover tooltip** on filled slots — color swatch, weight bar, brand, and coordinates

### 🤝 Friends & Sharing
- Discovery code `XXX-XXX` — share with friends for O(1) lookup
- Send / accept / refuse / block friend requests
- View a friend's inventory in read-only mode, inline in the same UI
- Public inventory toggle for frictionless sharing

### ⚖ Sensors & Devices

#### ACR122U NFC reader
Plug in a USB ACR122U reader and the app automatically opens the matching spool's detail panel the moment you scan a chip — no button, no search, instant access.

#### 🐯 TigerPOD — free 3D-printable dual reader stand

<img src="assets/img/screenshots/screenshot_tigerpod.png" width="100%" alt="TigerPOD Free STL — Standard and Mini" />

<img src="assets/img/hero-TigerPOD-Banner-Lineup-Rainbow-9.png" width="100%" alt="TigerPOD printed in nine filament colours" />

The **TigerPOD** ([repository](https://github.com/TigerTag-Project/TigerPOD)) is a free 3D-printable stand designed to hold up to **two ACR122U readers** side by side. Place one or two TigerTag chips on it and encode both in a single click directly from Tiger Studio Manager — no manual positioning, no juggling readers.

| | |
|---|---|
| **Print** | No supports needed — print in place, fits 99 % of 1 kg standard spools |
| **Readers** | 1 or 2 × ACR122U — encode two chips simultaneously (Dual Link) |
| **License** | Free — download, print, use |

<p align="center">
  <a href="https://makerworld.com/en/models/1289152-tigerpod-for-openspool-tigertag-rfid-filament#profileId-1318958"><img src="https://img.shields.io/badge/TigerPod_Standard-Download%20free%20STL-FF6B00?style=for-the-badge" alt="Download TigerPod Standard" /></a>
  <a href="https://makerworld.com/en/models/3190348-tigerpod-mini-for-openspool-tigertag-rfid-filament#profileId-3609236"><img src="https://img.shields.io/badge/TigerPod_Mini-Download%20free%20STL-FF6B00?style=for-the-badge" alt="Download TigerPod Mini" /></a>
</p>

#### TD1S color sensor

<p align="center"><img src="assets/img/TD1S_Front.png" width="320" alt="TD1S USB filament color and TD sensor" /></p>

The [TD1S](https://tigertag.io/products/biqu-ajax-td1s-v1-0) is TigerTag's USB filament color and transmission density sensor. Place the filament in the sensor and it reads:
- **Color** — precise HEX value written directly to the spool's `online_color_list`
- **TD value** — Transmission Density, a measure of filament transparency used by compatible slicers

The TD1S auto-opens a live viewer when plugged in. In the spool detail panel, scan color and TD separately or together. In the **Add Product** panel, the TD1S icon in the header glows green when connected — scanning auto-fills both fields in the form.

#### TigerScale

<p align="center"><img src="assets/img/TigerScale_Photo.png" width="480" alt="TigerScale ESP32 filament scale" /></p>

The [TigerScale](https://github.com/TigerTag-Project/Tiger-Scale-V3) is an open-source ESP32 filament scale — now in its **V3** generation (ESP32-S3, 3.5" touchscreen, dual PN532 readers, battery). Tiger Studio Manager connects to it over WebSocket and shows a live card per scale:
- **56 px live weight display** with container / filament split
- **Send-status badge** — tracks the firmware lifecycle: `idle → scanning → stable → send → success`
- **Filament mini-panel** — color dot, brand, and material pushed directly from the scale firmware
- **Twin UID reader grid** — two NFC readers (left / right); the empty slot auto-fills with the Firestore-resolved twin tag in green
- **TARE** — hold-to-confirm button (1 s) that POSTs `/api/tare` to the scale firmware

#### USB scale (Dymo M-series)

Plug in a **Dymo USB scale** and your spool weights fill themselves in — no typing. Set a spool on the scale and, with a chip on the reader, its weight is saved automatically (gross → net, twin synced); with a spool's card open, a quick confirm does it. The live reading appears right inside the spool's weight panel, and a dimmed "asleep — tap to wake" hint shows when the scale powers itself down.

### 📱 TigerTag RFID Connect — mobile app
Tiger Studio Manager is the desktop companion to **TigerTag RFID Connect**, the iOS/Android mobile app. Both apps share the same Firebase backend (Firestore inventory, friends, racks) so changes made on one device appear immediately on the other.

The mobile app handles chip programming, NFC scanning on the go, and catalogue browsing. Tiger Studio Manager adds the desktop-class surfaces: multi-account management, rack organization, live printer integration, TD1S and TigerScale hardware, and bulk operations.

A QR code to download the mobile app is always accessible in the sidebar.

### 🌗 Dark & Light
- **Dark by default**, Light one click away in *Edit profile → Theme*
- Your choice follows your account onto every machine you sign in from
- The native window chrome follows the theme too — no white UI in a black title bar

### 🌍 Accounts & i18n
- Multi-account — switch between multiple TigerTag accounts
- **9 locales** — EN · FR · DE · ES · IT · PL · PT (Brasil) · PT (Portugal) · 中文
- Per-account language preference synced with Firestore
- Google sign-in via loopback OAuth (RFC 8252 + PKCE) — Touch ID / passkey native support

---

## Screenshots

<div>

| Inventory | Printers |
|---|---|
| ![Inventory](assets/img/screenshots/screenshot_inventory.png) | ![Printers](assets/img/screenshots/screenshot_printers.png) |

| Storage Racks | Camera Wall |
|---|---|
| ![Racks](assets/img/screenshots/screenshot_racks.png) | ![Camera Wall](assets/img/screenshots/screenshot_cam.png) |

| TD1S color sensor | TigerPOD |
|---|---|
| ![TD1S](assets/img/screenshots/screenshot_td1s.png) | ![TigerPOD](assets/img/screenshots/screenshot_tigerpod.png) |

</div>

---

## Getting started

### Requirements

- **Node.js** 24+
- **npm** 10+
- A **TigerTag account** — [tigersystem.io](https://tigersystem.io)
- _(Optional)_ An **ACR122U** NFC reader for chip read/write

#### Linux only

```bash
sudo apt-get install libpcsclite-dev libusb-1.0-0-dev build-essential
```

### Install & run

```bash
git clone --recurse-submodules https://github.com/TigerTag-Project/TigerTag-Studio-Manager.git
cd TigerTag-Studio-Manager
npm install   # also runs electron-rebuild for native NFC module
npm start
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | [Electron](https://www.electronjs.org/) 41 |
| UI | Vanilla HTML / CSS / JavaScript (no framework, no bundler) |
| Auth & data | [Firebase](https://firebase.google.com/) (Auth + Firestore) |
| NFC reading | [nfc-pcsc](https://github.com/pokusew/nfc-pcsc) + ACR122U |
| NFC parsing | [TigerTag SDK for JavaScript](https://github.com/TigerTag-Project/TigerTag-SDK-JS) — parse, verify, write TigerTag chips |
| Auto-update | [electron-updater](https://www.electron.build/auto-update) via GitHub Releases |
| Build & packaging | [electron-builder](https://www.electron.build/) |
| macOS signing | Apple Developer ID + `notarytool` (App Store Connect API Key) |
| Windows signing | Not yet signed (planned — Microsoft Trusted Signing) |
| CI / Releases | GitHub Actions — triggered on `v*` tag push |

---

## Building installers

Push a `v*` tag to trigger a parallel build on all three platforms and publish a GitHub Release automatically:

```bash
git tag v1.7.0
git push origin v1.7.0
```

| Platform | Command | Output | Signed |
|---|---|---|---|
| macOS (signed) | `npm run build:mac` | `.dmg` + `.zip` (x64 + arm64) | ✅ Developer ID + Notarized |
| macOS (fast, local) | `npm run build:mac:unsigned` | `.dmg` | ❌ |
| Windows | `npm run build:win` | `.exe` NSIS | ❌ Not yet signed |
| Linux | `npm run build:linux` | `.AppImage` | N/A |
| All | `npm run build:all` | All three | — |

Built artifacts go to `dist/` (git-ignored).

> `npm run build:mac` requires Apple Developer credentials in a local `.env` file (see `.env.example`). The signing + notarization pipeline is documented in `docs/code-signing.md`.

---

## i18n tooling

UI strings live in `renderer/locales/<lang>.json`. Never edit the 9 locale files by hand — use the helper instead:

```bash
# Add a new key across all 9 locales
npm run i18n:add -- myKey en="Hello" fr="Bonjour" de="Hallo" \
  es="Hola" it="Ciao" zh="你好" pt="Olá" pt-pt="Olá" pl="Cześć"

# Insert after an existing key (keeps related keys grouped)
npm run i18n:add -- myKey --after toolboxTitle en="Hello" ...

# Check consistency (also runs automatically as a pre-commit hook)
npm run i18n:check
```

The pre-commit hook blocks any commit that leaves locale files inconsistent (missing keys, type mismatches, empty strings). It is activated automatically by `npm install` via the `prepare` script.

---

## Multi-vendor RFID (planned)

The app currently reads only TigerTag chips. Per-vendor spec sheets for extending support are in `docs/rfid-vendors/`:

| Vendor | Tag type | Auth | Spec |
|---|---|---|---|
| 🐯 TigerTag | NTAG/NDEF | None | [tigertag.md](./docs/rfid-vendors/tigertag.md) |
| 🟢 Bambu Lab | Mifare Classic 1K | HKDF-SHA256 | [bambu.md](./docs/rfid-vendors/bambu.md) |
| 🟠 Creality | Mifare Classic 1K | AES-128-ECB | [creality.md](./docs/rfid-vendors/creality.md) |
| 🔴 Anycubic | Mifare Ultralight | None | [anycubic.md](./docs/rfid-vendors/anycubic.md) |
| ⚫ Elegoo | Mifare Ultralight | Magic bytes | [elegoo.md](./docs/rfid-vendors/elegoo.md) |
| 🟣 Snapmaker | Mifare Classic 1K | HKDF + RSA-2048 | [snapmaker.md](./docs/rfid-vendors/snapmaker.md) |
| 🟡 Qidi | Mifare Classic 1K | Default key | [qidi.md](./docs/rfid-vendors/qidi.md) |
| 🌐 Openspool | NFC Type 2 NDEF | None | [openspool.md](./docs/rfid-vendors/openspool.md) |

The [OpenRFID](https://github.com/suchmememanyskill/OpenRFID) project is vendored as a Git submodule under `OpenRFID/` as a read-only reference.

---

## Project structure

```
TigerTag-Studio-Manager/
├── main.js                  # Electron main process (IPC, printer transports, NFC, cameras) — see CODEMAP-main.md
├── preload.js               # contextBridge IPC
├── CODEMAP-main.md          # Line-range index for main.js
├── ROADMAP.md               # Done / next / backlog by domain
├── services/
│   ├── nfc-process.js       # NFC utilityProcess — nfc-pcsc read/write, isolated from the main process
│   ├── tigertagDbService.js # Reference data layer (API → GitHub mirror → userData → assets)
│   └── anycubicCloudCerts.js
├── renderer/
│   ├── inventory.html       # Single-page UI markup
│   ├── inventory.js         # Core renderer logic (~21k-line ES module — see CODEMAP.md)
│   ├── CODEMAP.md           # Line-range index for inventory.js (read first, grep last)
│   ├── firebase.js          # Firebase init (public config)
│   ├── css/                 # 10 themed files, loaded in order (00-base → 10-settings → … → 70-detail-misc)
│   ├── locales/             # i18n JSON — en fr de es it zh pt pt-pt pl (9 locales, edit via npm run i18n:add)
│   ├── IoT/                 # Extracted device modules (own CSS inside each)
│   │   ├── tigerscale/      # TigerScale — Firestore subscription, panel, health tick
│   │   └── td1s/            # TD1S color/TD sensor engine + TD/Color edit modals
│   ├── rfid_protocol/
│   │   └── tigertag/        # RFID TigerTag tester modal + chip parser
│   ├── cam/                 # Detached camera-wall window
│   └── printers/            # Per-brand live integrations + PROTOCOL.md agent skills
│       ├── anycubic/  bambulab/  creality/  elegoo/  flashforge/  snapmaker/
│       └── registry.js  context.js  cam_manager.js  modal-helpers.js  extra-subnets.js   # shared
├── assets/
│   ├── db/tigertag/         # Bundled reference JSONs (id_brand, id_material, …)
│   ├── img/                 # App icons + printer photos
│   └── svg/                 # UI icons + TigerTag logos
├── data/
│   ├── container_spool/     # Spool container catalog
│   ├── printers/            # Per-brand printer model catalogs
│   ├── rack-presets.json    # Built-in rack templates
│   ├── whatsnew.json        # "What's New" modal content (9 locales, full history)
│   └── release-notes/       # Per-version GitHub Release body (BambuLab-style)
├── scripts/                 # i18n add/check, whatsnew add/check, codemap check, changelog extract, …
├── docs/
│   ├── firestore-schema.md  # Full Firestore collection/field map
│   ├── i18n-keys.md         # i18n key reference
│   └── rfid-vendors/        # Per-vendor RFID spec sheets
├── OpenRFID/                # Git submodule — upstream multi-vendor parsers (read-only)
└── .github/workflows/
    └── build.yml            # CI: prepare-release (draft + notes) → parallel build → attach assets, on tag push
```

---

## Contributing

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feat/my-feature`
3. **Make your changes** — vanilla JS, no frameworks
4. **Run**: `npm start` to test locally
5. **Open a Pull Request**

Guidelines: keep the renderer vanilla (no React/Vue), add i18n strings with `npm run i18n:add` (all 9 locales), don't commit `node_modules/` or `dist/`.

**Reporting issues** — use [GitHub Issues](https://github.com/TigerTag-Project/TigerTag-Studio-Manager/issues). Use **Settings → Debug → Report a problem** in the app to copy a self-contained diagnostic report (version, platform, last 50 errors) to paste into your issue.

---

## Changelog · Roadmap

- 📚 **[FEATURES.md](./FEATURES.md)** — complete catalogue of every shipped feature, grouped by domain (current as of the latest release)
- 📋 **[CHANGELOG.md](./CHANGELOG.md)** — full version history
- 🗺 **[ROADMAP.md](./ROADMAP.md)** — planned features, in-flight work, and backlog

---

## License

[MIT](LICENSE) — © TigerTag Project

You are free to use, modify, and distribute Tiger Studio Manager — including commercially.
The **"TigerTag"** name is a trademark of the TigerTag Project — see [TRADEMARK.md](TRADEMARK.md) for usage conditions.
All npm dependencies are permissive (MIT / ISC / BSD / Apache) — see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
