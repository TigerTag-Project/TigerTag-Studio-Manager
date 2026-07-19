# Asset sources — full resolution, never bundled

Every image kept at its **original size**: the masters behind what ships in
`assets/`, plus the product / marketing artwork the app never loads at all.

Nothing here reaches users. `package.json` → `build.files` is an **allowlist**
(`main.js`, `preload.js`, `renderer/**`, `services/**`, `data/**`, `assets/**`);
any folder missing from it is skipped at packaging. No exclude rule needed — and
adding `assets-src` to that list is the one thing that would break the contract.

The copies in `assets/` are downsized and compressed for their actual display
size. Once one has been optimised, the original is gone unless it was archived
here first — **archive before you optimise.**

## Layout

Mirror the path the asset has under `assets/`, so finding a master is mechanical:

```
assets/img/spool_filament/oem_carton_core.png      ← shipped, 320², 37 KB
assets-src/img/spool_filament/oem_carton_core.png  ← master,  1080², 1.1 MB
```

Artwork the app never loads has no counterpart under `assets/`; file it by what
it is (`img/` for stills) and note it in the table below.

## Workflow — this folder is the exchange point

The founder drops new artwork **at the root of `assets-src/`**, under whatever
name it was exported with. Everything else is Claude's job, every time:

1. **Take what is needed** from the root.
2. **Rename** to the project convention (`snake_case`, matching the sibling files
   in the destination folder) and fix any typo in the original filename.
3. **Ship an optimised copy** under `assets/`: trim transparent margins, square it
   when it sits in a grid of equal tiles, resize to ~2× its largest on-screen size,
   palettise PNGs.
4. **File the master** under the mirrored `assets-src/` path, **under the same name
   as the shipped file** — never the original export name, or the pair can't be
   matched later.
5. **Leave the root empty** (README aside). A file still sitting there means the
   handover isn't finished.

Re-exporting later — a bigger display size, a different crop, a retina variant —
starts from the master here rather than from an already-compressed file.

## Contents

| Path | Size | Ships as |
|------|------|----------|
| `img/spool_filament/oem_carton_core.png` | 1080², 1.1 MB | `assets/img/spool_filament/oem_carton_core.png` — 226×220, 20 KB |
| `img/spool_filament/oem_kitchen_scale.png` | 1536×1024, 2.1 MB | `assets/img/spool_filament/oem_kitchen_scale.png` — 364×220, 15 KB |
| `img/Hero-TigerSystem-ecosystem.png` | 2000×1414, 1.6 MB | `assets/img/Hero-TigerSystem-ecosystem.png` — 1200×848, 151 KB |
| `img/hero_tigerpod_rainbow_7.png` | 1672×941, 1.4 MB | — not loaded by the app (shop / Hub / social / press) |
| `img/hero-TigerPOD-MirrorEffect-Rainbow-9.png` | 1672×941, 1.4 MB | — not loaded by the app (shop / Hub / social / press) |

### Missing masters

Optimised in place before this folder existed — the originals are gone and need
re-adding from wherever they were first exported:

| Shipped asset | Was | Now |
|---------------|-----|-----|
| `assets/img/hero-TigerPOD-Banner-Lineup-Rainbow-9.png` | 1672×560 | 1100×368, 115 KB |
