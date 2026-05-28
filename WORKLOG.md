# Worklog — v1.8.8 (in progress)

## Added

## Changed

## Fixed

- **Bambu RTSP camera failed with "Option tls_verify not found" (no stream on bundled ffmpeg)** — `main.js`
  - The RTSP launch passed `-tls_verify 0` before `-i`, applied to the rtsp demuxer. Older ffmpeg (the bundled ffmpeg-static 6.0) has no `tls_verify` on the rtsp demuxer → ffmpeg exits code 1 when it reaches the TLS stage of a reachable printer. Homebrew ffmpeg 8.x has it, which masked the bug in dev before ffmpeg-static was bundled. Removed the flag — the tls protocol defaults to `verify=0`, so the printer's self-signed cert is still accepted (works on ffmpeg 6.0 and 8.x). This was the real reason the P2S camera showed no stream on Windows (and on macOS once it switched to the bundled binary).

## Removed

## i18n
