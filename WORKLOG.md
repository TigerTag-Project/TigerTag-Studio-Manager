# Worklog — v1.10.9 (in progress)

- Bambu heated-chamber setpoint. The chamber temperature pill is now editable (click → set target) on actively-heated-chamber models (X1E, H2S, H2D, H2D Pro, H2C, X2D — `bambuModelId` 6/7/8/9/11/12); passive-chamber models (X1C) stay read-only. The command is ported from ha-bambulab (PROTOCOL §16): X1E uses `M141 S{T}`, H2-series/X2D gate the heater behind the airduct mode — `M145 P1`+`M141 S{T}` above 40 °C, `M141 S{T}`+`M145 P0` at/below 40 °C. The chamber target is read back from the packed `device.ctc.info.temp` (`>>16`). `printers/bambulab/cards.js`, `printers/bambulab/index.js`, `printers/bambulab/PROTOCOL.md` (§16)

## Changed

## Fixed
- Bambu AMS humidity/temperature now shows for **every** AMS unit, not just when exactly one is connected. A machine with multiple AMS (e.g. the H2C reports 2) previously showed nothing; the title meta now lists each unit (prefixed A / B / … when there's more than one) using the real `humidity_raw` % + temperature, AMS Lite still skipped. `printers/bambulab/cards.js`

## Removed

## i18n
