# Idle camera views — real printers, not printing

One still per model, taken from the real printer's own camera while it was not
printing (2026-10-19, from Tiger Studio's camera wall; the Elegoo frame straight
from its MJPEG stream). Native resolution of each camera.

Clips (`<name>.mp4`, 640×480 letterboxed, 10 fps, ~3 s): recorded 2026-11-04 with
Studio's own camera recording (from the camera's source), printers at rest, played in
a loop by the simulator. A model with a clip uses it; the still is the fallback. The
X1C keeps its still (its light was off for the clip); the A1 camera sends about one
image a second, so its clip is two frames; the AD5X camera was off.

Uses:
- the demo simulator's camera while a demo printer of that model is not printing
  (idle, heating, leveling: `library.js` `IDLE_PHOTOS`, keyed "brand/catalog id",
  decoded to 640×480 frames on first use — the size of the print frames);
- mockups (store pages, docs, slides).

| File | Printer | Camera |
|---|---|---|
| `bambulab-x1c.jpg` | Bambu Lab X1C | 1760×1080 (RTSPS) |
| `bambulab-a1.jpg` | Bambu Lab A1 | 1536×1080 (JPEG over TLS) — a part was left on the plate |
| `elegoo-centauri-carbon-2.jpg` | Elegoo Centauri Carbon 2 | 640×360 (MJPEG) |
| `creality-ender-3-v4.jpg` | Creality Ender-3 V4 | 1280×720 (WebRTC) |
| `flashforge-ad5x.jpg` | FlashForge AD5X | 640×480 (MJPEG) |
| `snapmaker-u1.jpg` | Snapmaker U1 | 1920×1080 (stills, stock firmware) |
| `anycubic-kobra-x.jpg` | Anycubic Kobra X | 1280×720 (FLV, cloud) |
