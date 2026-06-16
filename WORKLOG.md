# Worklog — v1.10.4 (in progress)

## Added
- Anycubic: printer error alert. When the printer reports a failed command (`state:"failed"`, e.g. code 10901 "Home the axis before moving"), a dismissible bottom-sheet shows the code + the printer's message — mirrors the slicer's "Error Alert" minus its "Go to Message Center" action. Only pops for the printer whose panel is open. `_acuShowError()` + detection in `_acuMerge`, `printers/anycubic/index.js`; styles in `anycubic.css`.

## Changed

## Fixed
- Anycubic: editing a nozzle/bed temp no longer throws `NotFoundError: replaceWith … no longer a child` (removing the focused input fires `blur` synchronously, re-entering `restore`). `restore`/`confirmTemp` are now idempotent (`done` flag) + `replaceWith` is guarded. Clicking away now **applies** the value (blur → confirm) instead of cancelling; Escape still cancels — `renderer/inventory.js`
- Anycubic (cloud): the light now controls the correct LED. The cloud branch sent `type:1` (the CAMERA light) — the Kobra rejected it with "failed turn on camera light". It now sends `type:3`, the chamber/part LED, same value the LAN path uses (PROTOCOL.md). Diagnosed live via the request log + the slicer's error notification; the temp-refresh fix was unrelated (cloud data was flowing fine the whole time). `printers/anycubic/index.js`
- Anycubic (cloud): **fan / temperature / speed-mode now work at idle** (not only during a print). They previously used REST `sendOrder`/`PRINT_SETTINGS`, which only changes a *project's* settings — at idle the printer ignored them. Now they publish the same MQTT `{type, action, data}` message as the LAN path (`fan/setSpeed`, `tempature/set`, `print/update`) over the cloud broker — exactly what the official slicer does (captured a slicer `fan/setSpeed · done` report with `taskid:""`, proving idle control). Added a cloud MQTT publish path: `anycubic:cloud-publish` IPC → `_cloudClient.publish('…/web/printer/{machineType}/{key}/{endpoint}')` (`main.js`), `cloud.publish` bridge (`preload.js`), and `_publish()` now routes to it when `conn.mode === "cloud"` (`printers/anycubic/index.js`). Light stays on `sendOrder` (order 1233, works). Docs in `PROTOCOL.md`.
- Anycubic (cloud): `sendOrder` omits `project_id` when 0 (an explicit `0` ≠ omitting; matches the slicer, and hass hardcodes `0` for ACE/feed). Light, jog/home, disable-motors, ACE/feed send **no** project. pause/resume/stop use the active job's id. `main.js`, `printers/anycubic/index.js`

## Removed

## i18n
- Added: `acuErrTitle`, `acuErrDismiss` — 9 locales
