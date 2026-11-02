# Art direction — Tiger Studio illustrations

The single reference for every illustration Studio ships: hero banners, scenes, icons, badges,
notification art, deal pictures. Any new asset is generated **against this file** and checked
against it before it is integrated. When an asset drifts, it is redone — not "close enough".

## Reference assets (the canon)

These four banners define the style. Attach at least one of them to every generation request.

| File | What it shows |
|---|---|
| `assets-src/img/quests/missions-scene.png` | tiger with map + backpack, cork board, compass, printer |
| `assets-src/img/quests/daily-quests-scene.png` | tiger at a laptop, printer, spool shelf, plants |
| `assets-src/img/tigersquad/deals-scene.png` | tiger with a gift, shopping bag, coins, coupons, globe |
| `assets-src/img/quests/xp-history-scene.png` | tiger pointing at a chart screen, coins, book, hourglass |

Approved small assets in the same style: `assets/img/tigercoins/xp-v2.webp`,
`assets/img/tigercoins/gift-v2.webp`, `assets/img/tigercoins/envelope.webp`,
`assets/img/tigercoins/coin.webp`.

## The style in one sentence

**Flat cartoon vector, like a clean SVG drawn by a person: thick dark outline, flat fills, one
hard-edged shadow tone, tiny white glints — chunky, rounded, friendly, readable at 40 px.**

## Rules

### Line
- One **near-black outline** (`#140c0a`–`#1a1210`) around every shape, **thick and even**:
  about 3–4 % of the object's width (≈ 6–8 px on a 200 px object). Never thin, never tapered.
- Inner details (stripes, seams, folds, screen bezel) use the same colour, thinner (about half).

### Fill and shading (cel shading)
- **Flat solid fills.** No gradients, no airbrush, no texture, no noise, no photo detail.
- **One shadow tone per shape**: a darker flat version of the fill, hard edge, on the
  **lower-right** side (light comes from the **top-left**).
- **Glints**: one or two small pure-white flat shapes (an oval, a short curved stroke) top-left
  on shiny things (coins, screens, plastic). Never a glossy reflection band, never a lens flare.
- **No 3D render look**: no bevels, no emboss, no specular gradients, no gem facets, no metallic
  shading, no realistic lighting, no ambient occlusion.
- Shadows on the ground: none (assets sit on a transparent background).

### Shapes
- Chunky, rounded, slightly simplified: corners softened, proportions a little "toy-like".
- At most **2–3 elements per icon**; one main object, optionally one badge.
- Badges (alert, download, check): a small round or triangular disc with the same outline,
  bottom-right or top-right of the main object, about 35–45 % of its size.

### Palette (sampled from the canon)

| Role | Hex |
|---|---|
| Outline | `#140c0a` |
| Tiger orange | `#ff7800` · shadow `#f06000` |
| Cream / white | `#ffffff` · shadow `#d8d8d8` |
| Hoodie / brand blue | `#0060f0` · shadow `#0048f0` |
| Red (alerts, envelopes, tickets) | `#ff4830` · shadow `#d8261f` |
| Gold (coins, stars, trophies) | `#ffc000` · light `#ffd800` |
| Green (XP, plants, success) | `#3ddc84` · shadow `#1f9e55` |
| Dark plastic (printers, screens, spools) | `#2a2f3a` · shadow `#1a1e26` |
| Wood (shelves, desk) | `#c8743a` · shadow `#8a4a26` |

Use these colours; a new colour is a desaturated or shadow variant of one of them.

### Recurring objects — draw them like this
- **The tiger mascot**: blue hoodie with orange drawstrings and ALWAYS the **merch cap** — black
  baseball cap, white TigerTag logo on the front panel (line-art tiger head in a rounded badge with
  circuit lines left and right), no text. Reference: `assets-src/img/tigersquad/deals-hero/tiger.png`.
  A plain cap is a drift (founder, 2026-11-02).
- **The theme of the space**: an asset belongs to its space. A TigerSquad-only feature (squad windows,
  requests/tickets, which only squad members can file) uses the Tiger Squad look: navy, orange,
  the tiger mascot.
- **Filament spool**: grey plastic flanges with **hexagonal honeycomb holes** and a solid central
  band across the flange with the hub hole (pokéball-like), filament wound in the spool's colour,
  three-quarter view. Empty/low = only a thin band of filament left.
- **Printer**: dark cubic frame, coloured spool holders on both sides (red left, blue right),
  small blue screen.
- **Laptop**: light grey shell, dark screen.
- **Coin**: gold disc, tiger face embossed in a darker gold, thick outline.
- **Sparkles**: 4-point stars, gold with the dark outline, 1–3 around the object, never more.
- **Streak freeze (ice cube)**: a chunky rounded ice cube in three-quarter view, flat ice blue
  `#8fd3ff` (shadow `#5fb4ec`), white glints top-left, a tiger-paw IMPRINT melted into the front face
  (a hollow pad and four toes in the darker ice blue, outlined, a glint on each rim — no orange in the ice).
  States: full · empty slot (the same silhouette as a light-grey dashed outline `#8f97b3`, no fill —
  readable on the navy UI) · gift (orange ribbon and bow) · melting (slumped corners, one drop; only
  for a freeze to give about to expire, never for a reserve). `assets/img/quests/freeze/`, masters
  and the generated sheet in `assets-src/img/quests/freeze/`.

### Composition and output
- **Icons**: square 1:1, the object centred, about 8 % transparent margin, readable at 40 px
  (test by shrinking it).
- **Scenes / banners**: objects grouped on one invisible floor line at the bottom, characters cut
  at the waist behind the desk (see the generate-asset skill for the banner format).
- **Banners are delivered as separate elements**: one transparent PNG per object (the tiger, the
  bag, the coins…), each generated on its own image at ≥ 1024 px (see "Size"; a first sheet of
  all the elements is fine to agree on the scene, never as the shipped masters), then placed and lightly animated in CSS — reference: the Deals banner
  (`assets/img/tigersquad/deals-hero/`), assembled by `renderer/quests/hero-layers.js` (`heroLayersHtml`: a back plane behind the desk for a waist-cut character, a front plane for what stands on it) and placed per banner in `quests.css` (`.<hero> .hl--<name>`). An object a character
  holds or leans on stays in the character's layer.
- **A banner's layers belong to that banner only.** Never take a piece of a banner (a layer, a
  cropped part of a picture) to use it alone elsewhere — a sticker, an icon, a notification,
  another view: a waist-cut tiger or its paws read as a broken picture (founder, 2026-11-01,
  after the Trophies used the Workshop banner's paws as a sticker). Elsewhere, use a whole
  standalone picture, or generate a new one.
- **Always a real transparent background** (alpha 0) — check with `sharp(...).stats()`
  (`isOpaque: false`). No checkerboard, no white box, no floor band.
- **No text** in the art (titles are HTML, translated in 11 locales). Exception: "XP" on the XP badge.

## Size — generate big, ship a ladder

- **One element per generation.** Never a sheet of several elements: on a 2172 px sheet four
  tigers get ~500 px each, too soft on a 2× screen. Ask for ONE element on a square canvas,
  filling ~90 % of it (ChatGPT returns 1254 × 1254).
- **Master ≥ 1024 px wide**, transparent PNG, in `assets-src/img/<area>/<name>.png` (the
  generated original next to it as `<name>-source.png` when it was cut from a sheet).
- **The ladder**: list the folder in `scripts/build-art-ladder.mjs` (`LADDER_DIRS`) and run
  `npm run art:build`. It writes `assets/img/<area>/<name>-{128,256,512,1024}.webp` and indexes
  the master's size in `renderer/art-ladder.js` (generated). A master under 1024 px is
  upscaled and reported: regenerate it. `npm run art:check` (pre-commit, when art is staged)
  fails on a missing rendition.
- **In the app**: `artImg("<area>/<name>", { cls })` (`renderer/art.js`) writes the `<img>` with
  every rendition in `srcset` and `sizes="auto"`: Chromium loads the one that covers the
  rendered width × the screen density (measured: 60 px → 128, 121 px → 256, 240 px → 512 on a
  2× screen). No size is chosen view by view. A layer in a hero scene goes through
  `{ html: artImg(...) }`; its CSS must leave `width: auto` (the `<img>` carries the master's
  width / height for its proportions).

## Prompt block — paste it into every request

> Style reference attached (our real art direction). Match it exactly: flat cartoon vector like a
> clean hand-drawn SVG; thick even near-black outline on every shape; flat solid fills; ONE
> hard-edged darker shadow tone per shape on the lower-right (light from top-left); one or two
> tiny white glints on shiny parts; NO gradients, NO gloss bands, NO bevel, NO gem facets, NO
> 3D render, NO texture. Chunky rounded friendly shapes, at most 2–3 elements, readable at 40 px.
> Palette: tiger orange #ff7800, white, brand blue #0060f0, red #ff4830, gold #ffc000, green
> #3ddc84, dark plastic #2a2f3a, outline #140c0a. PNG with a fully TRANSPARENT background (real
> alpha), square 1:1, centred, small margin, no text. Subject: …

## Acceptance checklist (before integrating)

1. Put the new asset next to a canon banner at the same scale: same outline weight? same shading?
2. Any gradient, gloss band, bevel or facet? → redo.
3. Shrunk to 40 px, is it still readable? → else simplify.
4. `isOpaque: false` and alpha min 0?
5. Shown to the founder **before** it replaces anything in the app.

## Drift we already had (don't repeat)

- First XP medallion: emerald gem facets, glossy bevel, arrows and sparkles — too busy, 3D.
- First gift box: glossy highlights and gradients.
- First spool icons: generic "icon pack" spools, not our honeycomb spool.
- Each fixed by attaching a canon banner and the prompt block above.
