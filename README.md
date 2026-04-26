# TigerTag Studio Manager

> Desktop application to manage your 3D printing filament inventory via NFC RFID tags and the TigerTag API.

### ⬇ [Download the latest version](https://github.com/TigerTag-Project/TigerTag_Studio_Manager/releases/latest)
> Available for **macOS** · **Windows** · **Linux** — no installation knowledge required.

---

[![Build & Release](https://github.com/TigerTag-Project/TigerTag_Studio_Manager/actions/workflows/build.yml/badge.svg)](https://github.com/TigerTag-Project/TigerTag_Studio_Manager/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-41-blue)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-green)](https://nodejs.org/)

---

## Features

- **Inventory management** — Load and browse all your filament spools via the TigerTag API
- **Table & Grid views** — Switch between a compact table or a visual card grid
- **NFC RFID reading** — Plug in an ACR122U reader to automatically open a spool's detail panel on scan
- **Weight tracking** — Update spool weight directly from the app (slider or manual entry)
- **Material details** — Print temperatures, bed temps, drying settings, density, MSDS/TDS/RoHS links
- **Multi-language** — English and French UI, easily extensible to other languages
- **Auto-updater** — Receives updates automatically via GitHub Releases
- **Cross-platform** — Windows, macOS (Intel + Apple Silicon), Linux

---

## Download

**[⬇ Download the latest release](https://github.com/TigerTag-Project/TigerTag_Studio_Manager/releases/latest)**

| Platform | File |
|---|---|
| macOS | `.dmg` |
| Windows | `.exe` |
| Linux | `.AppImage` |

---

## Screenshots

> _Screenshots coming soon._

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Electron](https://www.electronjs.org/) 41 |
| UI | Vanilla HTML / CSS / JavaScript (no framework) |
| NFC reading | [nfc-pcsc](https://github.com/pokusew/nfc-pcsc) + ACR122U reader |
| Auto-update | [electron-updater](https://www.electron.build/auto-update) |
| Build & packaging | [electron-builder](https://www.electron.build/) |
| CI / Releases | GitHub Actions |

---

## Requirements

- **Node.js** 24+
- **npm** 10+
- A **TigerTag account** with a valid API key — [tigertag.io](https://tigertag.io)
- _(Optional)_ An **ACR122U** NFC reader for automatic spool scanning

### Linux only

```bash
sudo apt-get install libpcsclite-dev libusb-1.0-0-dev build-essential
```

### macOS / Windows

No extra system dependencies required.

---

## Installation

```bash
git clone https://github.com/TigerTag-Project/TigerTag_Studio_Manager.git
cd TigerTag_Studio_Manager
npm install
```

> `postinstall` automatically runs `electron-rebuild` to compile the native NFC module for your platform.

---

## Running locally

```bash
npm start
```

The app launches and asks for your TigerTag **email** and **API key**. Your credentials are saved locally in `localStorage` and never sent anywhere other than `https://cdn.tigertag.io`.

---

## Building installers

| Platform | Command | Output |
|---|---|---|
| macOS | `npm run build:mac` | `.dmg` (x64 + arm64) |
| Windows | `npm run build:win` | `.exe` NSIS installer |
| Linux | `npm run build:linux` | `.AppImage` |
| All | `npm run build:all` | All three |

Built installers are placed in the `dist/` folder (ignored by git).

---

## Releases via GitHub Actions

Pushing a version tag automatically triggers a build on all three platforms and publishes a GitHub Release with the installers attached.

```bash
git tag v1.2.0
git push origin v1.2.0
```

The workflow file is at [`.github/workflows/build.yml`](.github/workflows/build.yml).

---

## Project Structure

```
TigerTag_Studio_Manager/
├── main.js              # Electron main process (window, NFC, auto-updater)
├── preload.js           # IPC bridge (contextBridge)
├── inventory.html       # Single-page UI (HTML + CSS + JS, no bundler)
├── dada_base/           # Local JSON lookup tables (brands, materials, aspects…)
├── assets/
│   ├── img/             # App icons (icon.ico, icon.icns, icon.png)
│   └── svg/             # TigerTag logo SVG (used as spool image placeholder)
├── .github/
│   └── workflows/
│       └── build.yml    # CI: build + publish on tag push
└── package.json
```

---

## API

The app communicates exclusively with `https://cdn.tigertag.io`. No data is collected or stored by this application beyond your local device.

| Endpoint | Description |
|---|---|
| `GET /pingbyapikey?ApiKey=XXX` | Validate API key, returns display name |
| `GET /exportInventory?ApiKey=XXX&email=XXX` | Fetch full inventory JSON |
| `GET /setSpoolWeightByRfid?ApiKey=XXX&uid=XXX&weight=XXX` | Update spool weight |

**Your API key and email are stored locally only** (browser `localStorage`) and used solely to authenticate requests to the TigerTag API.

---

## Adding a language

All UI strings are defined in the `TRANSLATIONS` object at the top of `inventory.html`.

1. Add a new key (e.g. `es`) with all translated strings
2. Add a button in the header: `<button class="lang-btn" data-lang="es">ES</button>`

That's it — the i18n system picks it up automatically.

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create a branch** for your feature or fix: `git checkout -b feat/my-feature`
3. **Make your changes** — keep the code style consistent (vanilla JS, no frameworks)
4. **Test locally** with `npm start`
5. **Open a Pull Request** with a clear description of what you changed and why

### Guidelines

- Keep the UI vanilla (no React, Vue, etc.) — the goal is zero build step for the renderer
- New strings must be added to **both** `en` and `fr` in `TRANSLATIONS`
- Don't commit `node_modules/`, `dist/`, or any credentials
- One feature / fix per PR

### Reporting issues

Please use [GitHub Issues](https://github.com/TigerTag-Project/TigerTag_Studio_Manager/issues) to report bugs or suggest features. Include your OS, Node.js version, and steps to reproduce.

---

## License

[MIT](LICENSE) — © TigerTag Project

You are free to use, modify, and distribute this software. See the [LICENSE](LICENSE) file for details.
