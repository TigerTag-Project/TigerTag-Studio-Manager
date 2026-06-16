# Worklog — v1.10.3 (in progress)

## Added

## Changed

## Fixed
- Bambu Lab manual "Add by IP" no longer fails with "No reply from <ip>" on a reachable printer — the `bambu:tls-probe` handler timed out at 600 ms, but the TLS handshake to a Bambu MCU takes ~1.4 s (measured on a real A1, more across a subnet), so it was cut off mid-handshake. Bumped to 4 s. The probe already auto-fills the serial (cert CN) and resolves the model from the serial prefix (`039` → A1), so manual add now just needs the Access Code — `main.js`. Documented the single-host vs bulk-scan timeout distinction in `printers/bambulab/PROTOCOL.md` §12.2.

## Removed

## i18n
