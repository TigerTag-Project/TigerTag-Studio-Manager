# Brand assets

Product / marketing artwork kept in version control but **deliberately outside
`assets/`**, because `package.json` → `build.files` bundles `assets/**` into every
installer. Anything here is available for the shop, Tiger Hub, social posts and
press — without adding weight to the app build.

If one of these is ever used **inside the app**, move (or copy) it into
`assets/img/` at that point — that's what makes it ship.

| File | What it is |
|------|------------|
| `hero_tigerpod_rainbow_7.png` | TigerPOD printed in 7 colours (black, blue, green, red, orange, yellow, white), wider arc — the filament spools on top are far more visible, so it shows real usage (POD + spool) better. 1672×941, **no alpha**. |
| `hero-TigerPOD-MirrorEffect-Rainbow-9.png` | The 9-colour line-up shot **with the floor reflection**, uncropped. 1672×941, **no alpha** (white background). Richer//more "studio" than the cut-out banner, but it needs a white surface — that's why the app uses the cut-out version instead. |

**Shipped variant (not here):** `assets/img/hero-TigerPOD-Banner-Lineup-Rainbow-9.png`
— the 9-colour line-up as a **cut-out banner with alpha** (1100×368, ~3:1, 115 KB).
That's the one the app uses: the TigerPOD discovery modal shows it under the title
to sell the "free STL → print it in your own colour" message. Because it has alpha
it needs no background of its own; the opaque versions here would show as a white
block on anything that isn't white.

Note: both are opaque (white background). A transparent (alpha) export would be
needed to place either one over a coloured surface — e.g. the TigerPOD modal's
purple gradient hero.
