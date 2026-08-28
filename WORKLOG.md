# Worklog — v2.23.2 (in progress)

## Added
- Two board widgets on the Printers grid, following the existing extension point in `docs/printer-board-widgets.md` (`BOARD_WIDGETS` entries `job` and `ctrl`): "Time remaining" shows the same remaining-time / ends-at values as the table view's Impression/Fini à columns (`_getPrinterJob`/`_fmtRemain`/`_fmtEndClock`, reused as-is); "Print control" adds Pause/Resume + Stop buttons per printer, dispatching to each brand's own control function (Bambu Lab, Snapmaker, FlashForge, Creality, Anycubic — Elegoo has no such API and shows nothing to control). Both widgets follow every existing machine, greyed with a "—" placeholder rather than disappearing, when idle or unsupported.

## Changed

## Fixed

## Removed

## i18n
- Added: `boardJobTitle`, `boardJobRemainLabel`, `boardJobCtrlTitle` — 9 locales
- Pending cleanup, carried over from v2.23.1: `scaleNoActivity` and `scaleReader` are orphaned — still shipped in all 9 locales, no longer referenced anywhere in `renderer/`
