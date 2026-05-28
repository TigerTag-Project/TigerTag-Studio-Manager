# Worklog — v1.8.7 (in progress)

## Added

## Changed

## Fixed

- **Bundled ffmpeg not found at runtime on packaged Windows (RTSP camera dead despite v1.8.6)** — `main.js`
  - `_detectFfmpeg` used `require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked')`, which points inside `app.asar` — a path the OS cannot spawn (and `fs.accessSync` can even false-positive on it via the asar shim, so a bogus binary path gets selected). Now keyed on `app.isPackaged`: in a packaged app the binary path is built straight from `process.resourcesPath` (`…/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe`, the real on-disk, spawn-safe location); in dev it uses `require('ffmpeg-static')`. Windows manual-install fallbacks kept.
  - Added diagnostics: `[ffmpeg] using <path>` / `[ffmpeg] NOT FOUND — checked: …` and `[bambu-rtsp:<key>] launching ffmpeg → rtsps://bblp:***@<ip>:322 (bin: …)`, landing in `electron-log` (`%APPDATA%\Tiger Studio Manager\logs\main.log`).

## Removed

## i18n
