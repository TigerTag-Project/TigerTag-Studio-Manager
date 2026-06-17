# Worklog — v1.10.8 (in progress)

## Added

## Changed
- Adding a printer now opens the freshly-added printer's side-card automatically. After "Add printer" writes the doc, the form closes and the new printer's side-panel opens once the Firestore listener has propagated it into `state.printers` (`_openPrinterWhenReady` polls up to 3 s). `renderer/inventory.js`

## Fixed

## Removed

## i18n
