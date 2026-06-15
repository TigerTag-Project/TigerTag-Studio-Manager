# Worklog — v1.10.1 (in progress)

## Added
- Anycubic **control-panel commands now work in cloud mode** — each command routes to the right cloud REST `sendOrder` order_id instead of the (cloud-absent) local MQTT publish: jog/home (`MOVE_AXLE` 201), disable motors (1213), light (`SET_LIGHT` 1233), temps/fan/speed-mode (`PRINT_SETTINGS` 6 → `{settings:{…}}`), pause/resume/stop (2/3/4), filament feed (1208). Print-state/settings orders carry the active job's `project_id` (from the print report taskid) — `renderer/printers/anycubic/index.js`, `main.js` (`cloud-send-order` now takes `projectId`)

## Changed

## Fixed
- Filament edit no longer flickers new→old→new. Root cause (confirmed from captured report logs): the post-edit `_scheduleRefresh(conn, 1500)` polled `getInfo` during the printer's ~3 s setInfo-commit window, so it returned the OLD value before settling to the new one. Removed the early confirm-poll — the setInfo echo already carries the new value and the regular refresh loop re-confirms after commit — `renderer/printers/anycubic/index.js`

## Removed

## i18n
