# Worklog — v1.8.6 (in progress)

## Added

## Changed

- **Encode modal (TigerCloud → TigerTag) UX polish** — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/60-modals.css`
  - Title centred; close ✕ pinned slightly inset with a round grey hover background.
  - Removed the Cancel button (close via the ✕ or a backdrop click — now allowed any time, including mid-burn = abort).
  - Instruction moved **above** the readers and made permanent: "Hold the RFID tags in front of the readers" (`encPlaceChips`, no longer toggled). Exceptional states (failure / same chip / no reader) show in the status line below.
  - Actions row hidden during the burn (no dead button).
  - While the modal is open, presenting a chip no longer pops the spool side-card over it (`_encodeModalOpen()` guard on both scan→`openDetail` paths) — the chip is about to be overwritten, so the auto side-card was just noise.
  - Title given top breathing room (`.cem-header` padding, ✕ stays aligned).
  - Chip cards redesigned to look like the physical reader: a dark device plate carrying the white TigerTag logo (`logo_tigertag.svg` via CSS mask), replacing the NFC-waves icon-in-a-circle. Removed the now-unused `_CEM_CHIP_SVG` constant.
  - The numbered corner badge now works as a status LED — red when no chip is present, green when detected — mirroring the ACR122U's red/green indicator.

- **Header status indicators unified as 3D icons** — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/60-modals.css`, `renderer/IoT/tigerscale/tigerscale.css`, `renderer/IoT/td1s/td1s.css`
  - TigerScale: replaced the "Tiger Scales" text pill with the `icon_tigerscale_3d.svg` icon (CSS mask + state colour: grey idle / green connected / red none).
  - TD1S: header health icon now uses `Icon_td1s_3d.svg` (square 22px) instead of the wide `icon_td1s.svg`.
  - RFID: the two reader badges are replaced by a single `Icon_tigerpod_3d.svg` (red = no reader / green = connected). Hovering reveals one row per reader (RFID #1 / #2) plus the UID of any chip presented. Clicking it while disconnected still opens the TigerPOD discovery modal.
  - All three header indicators now share a consistent square-icon look.
  - All four header SVGs doubled in size: TigerPod / TD1S / TigerScale 22→44px, cloud 20→40px (scoped `#health .icon` override, shared `.icon-20` untouched).

## Changed

- **Storage: "Clear all" now skips locked slots** — `renderer/inventory.js`
  - `emptyRack` leaves spools in locked slots in place (both Clear-all entry points: rack kebab menu + rack-edit modal). The empty-rack fly-out cascade also skips locked slots. A spool in a locked slot can now only be removed by deleting the spool itself.

## Fixed

- **RTSP printer cameras (Bambu X1C/X1E/P2S/H2x) did not work on Windows** — `main.js`, `package.json`
  - Root cause: no ffmpeg shipped with the app and no Windows path candidate, so `_detectFfmpeg` left `_ffmpegBin = null` on Windows (macOS/Linux silently relied on a system ffmpeg). RTSP cameras transcode via ffmpeg, so they were disabled.
  - Bundled `ffmpeg-static` (dependency) so an ffmpeg binary ships on every OS. Added `build.asarUnpack` for it and remapped the `app.asar` path to `app.asar.unpacked` in `_detectFfmpeg` (cannot spawn from inside asar). Also added correctly-escaped Windows fallback paths (`C:\\ffmpeg\\bin`, `C:\\Program Files\\ffmpeg\\bin`). CI builds each OS on its own runner, so each bundles the correct native binary.

- **Update icon tooltip showed raw `<strong>` tags** — `renderer/inventory.js`
  - The `updateDownloading` / `updateReady` i18n values contain `<strong>…</strong>` for the banner (`innerHTML`, bold renders fine), but the same string was set as the update-status icon's `data-tooltip` attribute, which renders as literal CSS text → the tags showed. Now strips tags (`replace(/<[^>]*>/g, "")`) for the tooltip only; the banner keeps the bold.

## Removed

## i18n
