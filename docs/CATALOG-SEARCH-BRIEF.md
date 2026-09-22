# Catalogue search → create a TigerData+ — implementation brief

**Status: ratified by the founder, not yet implemented.** Frozen decisions; implement as written.

## Goal

Let the user browse/search the **TigerTag+ product catalogue** (which grows daily) from Tiger Studio
Manager, and create from a found product a **TigerData+**: a fully-digital spool, no chip, already
carrying the catalogue product's metadata.

## The TigerData+ concept (new)

> **A TigerData+ is a TigerData that carries a real `id_product`, like a TigerTag+ — but with no UID,
> because it has no chip.**

- It is **NOT a TigerTag+**: no chip, no hardware UID. Do **not** set `id_tigertag` to the TigerTag+
  value (`0xBC0FCB97`) — it keeps the random nonce every chipless spool gets from `saveAddProduct`.
- **Derived, never stored** (CLAUDE.md rule — don't store what you can derive):
  `isCloud === true` **AND** `id_product` is real (≠ `0` and ≠ `4294967295`/`0xFFFFFFFF`).
  A plain TigerData keeps `id_product = 4294967295`.
- Badge: a distinct **"TigerData+"** badge. Today `tierBadgeHTML` returns "TigerData" for any
  `isCloud` row *before* testing `isPlus` (`renderer/inventory.js` ~L7024) — that branch must learn
  the new tier.

## Decisions

| # | Decision |
|---|---|
| **UI** | A new **"+ From Catalogue"** button next to "+ Material", opening a **new modal**. Explicitly a first iteration — a better integration can come later. |
| **Loading** | **Import-all-once into a local cache**, like Tiger Hub: page `product/get/all` with `per_page:1000` following `nextPage` until `null`, store the full list locally, then **all search/filtering happens in-memory, in our own engine**. After the first sync the app is **autonomous** — the API is only ever called to (re)build the local file. |
| **Name→id** | The catalogue returns **names**, not reference ids. Resolve against the bundled reference DB (`assets/db/tigertag/*.json`). Verified working: brand `3DXTech`→`39652`, type `Filament`→`142`, diameter `1.75`→`56`. Materials: match `label` first (`"PLA Marble"`), fall back to `material_type` (`"PLA"`). **Best-effort**: an unresolved name leaves that id at its default — `id_product` is always set, so a later `refresh-api` / promotion reconciles. |
| **Counter** | New telemetry counter to separate TigerData+ from basic TigerData (basic keeps `cloudAddedTotal`). Suggested name `cloudPlusAddedTotal`, beside the existing `cloudAddedTotal` / `cloudToPlusTotal` / `tagToPlusTotal`. ⚠️ **Never rename the stored `TigerCloud` telemetry value.** |

## API shapes (verified live, public, no key)

**List** — `POST https://api.tigertag.io/api:tigertag/product/get/all`, body `{per_page, page}`.
Envelope: `{ itemsReceived, curPage, nextPage, prevPage, offset, itemsTotal, pageTotal, items[] }`.
Item: `{ id, product_type:"Filament", img_src, brand:"3DXTech", title, material:"PLA", sku,
color:"#000000FF", color_info:{type,colors[]}, measure:"750 g" }`.

**Detail** — `GET https://api.tigertag.io/api:tigertag/product/get?uid=<n>&product_id=<id>&lang=<xx>`.
Keys: `id, product_type, title, name, brand, series, color, sku, barcode, description, brand_logo,
brand_url, images, links, active, filament, nozzle, dryer, bed, fan, metadata`, with
`filament{ material, aspect1, aspect2, color, color_info, diameter, shore, grams, measure_value,
measure_unit, refill, recycled, filled, fill_percent, transmission_dist }`.
**No numeric reference ids anywhere** — hence the name→id resolution above.

## Reuse — do not duplicate

- **Detail call**: IPC `rfid:lookup-product` (`main.js` ~L1259) → `window.electronAPI.lookupProduct(id)`.
  Already used by the TigerTag→TigerTag+ flow.
- **Product → doc mapping**: `_convertToPlus` (`renderer/inventory.js` ~L10982) already maps
  `name, sku, barcode, series, url_img, online_color*, Link*, info1/2/3`. Extract a shared helper
  rather than writing a second mapping.
- **Chipless creation**: `saveAddProduct` + `_adpCloudId()` — canonical chip schema, random
  `id_tigertag` nonce, `bumpStudioCounters`. Keep `normalizeRow` / `_isChiplessId` /
  `syncSpoolMirrors` conventions.
- **New IPC needed** for the list (`product/get/all`): the renderer is a browser context and this is
  a cross-origin POST — same reason `rfid:refresh-api` and `rfid:lookup-product` live in the main
  process.

## Field mapping when creating the TigerData+

Fill the canonical chip schema (see `docs/TTAG-FIELDS.md`) from the product detail:

- `id_product` ← the catalogue id (**this is what makes it a TigerData+**).
- `id_brand` / `id_material` / `id_type` / `id_diameter` / `id_aspect1` / `id_aspect2` /
  `id_measure_unit` ← resolved from names against the reference DB.
- Colours ← `color` / `color_info.colors` (hex RGBA) → `color_r/g/b/a` **and**
  `online_color_list` / `online_color_type`.
- `measure` + `id_measure_unit` ← `filament.measure_value` / `measure_unit`; spool starts **full**
  (`measure_gr` / `weight_available` = capacity).
- `data1`–`data7` ← diameter id, nozzle min/max, dry temp/time, bed min/max (from `filament`,
  `nozzle`, `dryer`, `bed`). Per `docs/TTAG-FIELDS.md`, these are the Filament (142) slot meanings.
- `TD` ← `filament.transmission_dist`.
- `lang` for the detail call ← `state.lang`.

## Conventions

`CLAUDE.md` applies: all logic in `inventory.js`, CSS in the matching `renderer/css/` section,
**11-locale i18n via `npm run i18n:add`**, brand voice (register 3) for every user-facing string,
CODEMAP kept in sync, validators before proposing a commit.
