# Worklog — v1.10.17 (in progress)

## Added

## Changed

## Fixed
- Creality: the live control card showed all three fans (part/case/side) on every model, but only the enclosed K-series has the case + side fans. Open-frame printers (Hi, Ender-3 V4, SparkX i7) and unknown models now show only the part-cooling fan. Gated by a per-model capability map keyed on `printerModelId` (firmware reports all `*FanPct` fields regardless of hardware, so model is the only reliable signal) — `renderer/printers/creality/index.js`.

## Removed

## i18n
