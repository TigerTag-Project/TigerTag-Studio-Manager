# Worklog — v1.8.30 (in progress)

## Added
- Anycubic Kobra X control panel in the side card (matches Snapmaker layout: Job → Control → Temperature → Filament) — `renderer/printers/anycubic/cards.js`, `renderer/printers/anycubic/index.js`, `renderer/inventory.js`
  - Job card always visible with pause/resume/stop buttons
  - Control card jog pad mirrors AnycubicSlicerNext "Axis Move", spread across the full card width: left = round XYZ-homing + disable-motors buttons, centre = XY circle (Home XY), Z pill (Z+ / Home Z / Z−), far-right column with the light toggle pinned top-right + step selector (1/10/50 mm) below it; part-cooling fan section (toggle + −/+ by 10) at the bottom. Jog row wraps on narrow panels
  - Temperature card always visible; nozzle/bed pills are click-to-edit (set target)
- Control commands exported in index.js: `acuPrintControl`, `acuSetTemp`, `acuLight`, `acuMove`, `acuHome`, `acuMotorsOff`, `acuFan`, `acuSetSpeedMode`, `acuFeedFilament` — `renderer/printers/anycubic/index.js`
- Filament load / unload / stop buttons in the per-slot edit sheet (`feedFilament` type 1/2/3), gated on slot state: Feed when filament present (`status` 5), Retract only for the slot loaded into the extruder (box `loaded_slot`), both disabled when empty — `renderer/printers/anycubic/index.js`, `renderer/printers/anycubic/anycubic.css`
- Print-speed mode control (Silent/Standard/Sport) — dropdown under the Step selector; reads the live mode from `print/update` report and sends `print/update {settings:{print_speed_mode}}` — `renderer/printers/anycubic/cards.js`, `renderer/printers/anycubic/index.js`, `renderer/inventory.js`
- PROTOCOL.md §5d "Control commands" — full LAN MQTT command reference reverse-engineered from slicer capture, plus exact slicer hover-tooltip labels for the control buttons — `renderer/printers/anycubic/PROTOCOL.md`
- Instant hover tooltips on the control card icon buttons (homing XYZ/XY/Z, disable motors, light), matching AnycubicSlicerNext's wording — `renderer/printers/anycubic/cards.js`, `renderer/inventory.js`, `renderer/printers/anycubic/anycubic.css`
  - Custom `<body>`-level floating bubble (`.acu-tip-pop`, `[data-acu-tip]`) instead of the native `title` attribute: appears immediately and escapes the XY-circle `overflow:hidden` clip

## Changed
- Anycubic filament slots E1–E4 now fill the full card width (multi-slot rows uncapped, like Elegoo) — `renderer/printers/anycubic/cards.js`, `renderer/printers/anycubic/anycubic.css`
- Not-mounted filament slots (ACE `status` ≠ 5) render grey + "?" with the real colour kept as the border and the material still shown below — `renderer/printers/anycubic/cards.js`, `renderer/printers/anycubic/index.js` (captures slot `status`), `renderer/printers/anycubic/anycubic.css`
- Control card left buttons (XYZ homing, disable motors): primary-fill hover with white icon, matching the homing buttons — `renderer/printers/anycubic/anycubic.css`
- `_acuLanGetInfo` now polls `tempature/query`, `fan/query`, `light/query` (not only box getInfo) so temperature/fan/light report immediately — `renderer/printers/anycubic/index.js`
- Removed the "Control" title from the Anycubic control card to match Snapmaker (no heading) — `renderer/printers/anycubic/cards.js`

## Fixed
- Anycubic homing axis map was wrong (`4`=all) — corrected via live slicer capture: `4`=XY, `5`=XYZ — `renderer/printers/anycubic/index.js`, `renderer/printers/anycubic/PROTOCOL.md`
- `tempature` report parser handled only `action:"auto"`; now parses any action so idle temps show — `renderer/printers/anycubic/index.js`
- Motors-off icon rendered as a solid square (`icon-power` missing) → swapped to `icon-bolt` — `renderer/printers/anycubic/cards.js`
- Anycubic filament card no longer disappears/rebuilds when editing a slot: multiColorBox reports merge into `d.boxes` IN PLACE (slots patched field-by-field, never wiped) instead of replacing the whole layout; the edit Apply no longer writes optimistically — it waits for the printer's report — `renderer/printers/anycubic/index.js`

## Removed

## i18n
- Added: `snapPrintPause`, `snapPrintResume`, `snapPrintCancel`, `snapTempEditTip`, `acuMotorsOff`, `acuFanTitle`, `acuHomeXyz`, `acuHomeXy`, `acuHomeZ`, `acuSpeedMode`, `acuSpeedSilent`, `acuSpeedStandard`, `acuSpeedSport`, `acuFeedLoad`, `acuFeedUnload`, `acuFeedStop` — 9 locales
- Changed: EN tooltip values to Title Case to match AnycubicSlicerNext (`acuHomeXyz`, `acuHomeXy`, `acuHomeZ`, `acuMotorsOff`)
- Unused (kept, reserved): `acuControlTitle` — title removed from UI to match Snapmaker
