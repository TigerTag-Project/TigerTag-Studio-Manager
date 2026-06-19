# Worklog — v1.10.13 (in progress)

## Added

## Changed
- Creality filament card: the **Selected label + Feed / Unload buttons moved up onto the "Filament" title row** (right-aligned, shown when a CFS slot is selected) instead of sitting in a footer below the slots. `renderer/printers/creality/index.js`, `renderer/css/55-creality.css`.

## Fixed
- Creality: filament-slot hover-lift **bounced** while the mouse stayed over a slot (and a fan-slider drag could be interrupted). Every ~1.5 s telemetry push rebuilt the entire `#creLive` panel, recreating the hovered element so it dropped and re-lifted. The live panel now refreshes **block-by-block** (`_creUpdateLive`: head / job / temp / control / filament each replaced only when its HTML actually changed), so a push that only moves temperatures no longer touches the slot you're hovering or the slider you're dragging. `renderer/printers/creality/index.js`.

## Removed
- Creality control card: the general **Extrude / Retract** buttons (hotend `M83 / G1 E` nudge) — superseded by the CFS Feed / Unload flow. Dropped the `data-cre-ctrl-extrude` handler (`renderer/inventory.js`), the buttons (`renderer/printers/creality/index.js`), and `.cre-ctrl-extrude` / `.cre-ctrl-ebtn` CSS (`renderer/css/55-creality.css`).

## i18n
- Removed: `creExtrude`, `creRetract` — 9 locales
