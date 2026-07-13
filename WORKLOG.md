# Worklog — v2.9.1

## Added

## Changed
- **The "What's New" 2.9.1 entry resurfaces the 2.9.0 highlights** so users the broken macOS updater skipped straight past 2.9.0 still see them — `data/whatsnew.json`.

## Fixed
- **macOS: the "Restart" button after an update download didn't install the update.** `autoUpdater.quitAndInstall()` (Squirrel) emits `before-quit-for-update`, not the regular `before-quit`, so `_isQuitting` stayed `false` and the macOS `close` handler hid the window instead of closing it — the app kept running in the dock and the downloaded update was never applied. Now `_isQuitting` is latched on `before-quit-for-update` and set in the `install-update` IPC before `quitAndInstall()`, so the window really closes and the update installs — `main.js`.

## Removed

## i18n
