# Worklog — v1.10.0 (in progress)

## Added
- Cross-platform Anycubic **cloud login** — sign in through the official Anycubic web page in an Electron window; the workbench token (`localStorage XX-Token`) is read + validated via `userInfo` (which also yields the account email the cloud MQTT login needs). Replaces the Windows-only CDP/bridge-mode token grab — cloud printers can now be added on macOS/Linux too — `main.js` (`anycubic:cloud-web-login`), `preload.js` (`cloud.webLogin`), `renderer/printers/anycubic/add-flow.js`
- Cloud nozzle/bed **temperatures** — polled from the REST `getPrinters` `parameter` blob (`curr_nozzle_temp`/`curr_hotbed_temp`); the cloud doesn't push tempature reports at idle and has no temp-query order — `main.js` (`anycubic:cloud-printer-info`), `preload.js` (`cloud.printerInfo`), `renderer/printers/anycubic/index.js`
- Cloud **job thumbnail** — the active project's signed S3 preview (`getProjects` → `img`) is shown in the job card while printing; falls back to the model render otherwise — `main.js`, `renderer/printers/anycubic/index.js`, `renderer/printers/anycubic/cards.js`
- Dev tool `scripts/acu-file-list.mjs` (queries the local file list over MQTT)

## Changed
- Cloud-add UI button relabelled "Sign in to Anycubic Cloud" (was "Connect to slicer") — i18n `acuCloudConnect`

## Fixed
- Anycubic cloud printer wrongly showed **"Idle"** during auto-leveling at the start of a print: `_acuMerge` had no `status` case, so the `workReport/busy` heartbeat (sent before the first `print` report) was ignored. Now maps busy → "Preparing" without overriding an active state — `renderer/printers/anycubic/index.js`

## Removed

## i18n
- Changed: `acuCloudConnect` → "Sign in to Anycubic Cloud" — 9 locales
