# Worklog — v2.58.0

## Added
- Printed labels draw the maker's logo in place of the brand name when the brand table has one (`logo_url`, served by the Manager from the CDN `img?type=brand`): read once through the main-process image cache (`img:get`, the CDN's last hop sends no CORS header), made one-colour black (near-white pixels become paper), drawn in the brand box in proportion; the brand text stays while it loads or when there is none — #242. `_brandLogoFor` + `labelInfo.logo` (`renderer/inventory.js`), `buildLabel` + `redrawLabelCard` (`renderer/labels/index.js`).
- Creality K3 (`F039`, catalogue id 12): picture, detection by model code / default host name, four nozzle pills (E1–E4, only the active one editable), CFS Nano boxes, no external spool — PR #253 (`renderer/printers/creality/index.js`, `probe.js`, `PROTOCOL.md`, `data/printers/cre_printer_models.json`, `assets/img/cre_printers/k3.png`). Not seen on a real K3.
- Creality SparkX i8 (`F030`, catalogue id 13): picture, detection (`F030`, `i8-XXXX`, before the i7 rule), four-slot rack, no external spool — PR #255 (same files, `assets/img/cre_printers/sparkx_i8.png`). Not seen on a real i8.

## Changed
- Snapmaker filament sheet: vendor Polymaker added with its own list from the Snapmaker app — PLA, PETG, ABS, TPU, ASA, PC, PA, PCTG, PE, PHA, PVA, BVOH, HIPS, EVA (`SNAP_FIL_VENDOR_MATERIALS`, `renderer/printers/snapmaker/index.js`).
- A chip flagged to update (`needUpdateAt`: the catalogue reconcile or an edit changed a field the chip carries) is rewritten automatically as soon as it is read on the TigerPOD — the same verified page-by-page write as the "Please update NFC" window (`rfid:encode-cloud`: identity, timestamp and signature kept, so a TigerTag+ Certified stays certified), then that chip's flag is cleared and a toast says so; the old bytes just read are no longer written back over the record. Not while that window is open or in a friend's view. `_autoUpdateChip` + `_processNfcScans` (`renderer/inventory.js`), CODEMAP. Needs a real-chip test.

## Fixed
- Catalogue Material filter lists material FAMILIES only (`material_type` of the product's `id_material`, read from the bundled `id_material.json`): "PLA Silk", "PLA+ Silk"… are PLA, so a silk spool filed as PLA + aspect Silk (Geeetech) is no longer missed — #217 (`_catFamily`, `_catalogFilter`, `_catViewFillFacets`, `_catViewSearch`; the material-family loader shared with the MCP is now `_loadMaterialFamilies` / `_matFamilies`, `renderer/inventory.js`; CODEMAP).
- Catalogue empty state: when the search finds products that the selectors hide, "It's there — your filters are hiding it" + "Clear the filters" (keeps the search) instead of "create it by hand" — #217.
- Bambu Lab cloud: Studio sends its own client identity (`tiger-studio-manager`) instead of OrcaSlicer's, which Bambu's edge now answers with 403 — the print thumbnail shows again — PR #251 (`_bblHeaders`, `main.js`; `renderer/printers/bambulab/PROTOCOL.md` headers block updated).
- Creality temperature pills: `aria-label` instead of `title=` tooltips; comments name the SparkX i8 beside the K3 (`renderer/printers/creality/index.js`).

## Removed
- Settings → Data → "Copy API URL" (the 6-character API key export URL): the API key is set aside for now, data is reached by signing in to the account — button `btnCopyApiUrl` + `stgApiUrlWarn` (`renderer/inventory.html`), `getOrCreateApiKey6` and its click handler (`renderer/inventory.js`), CODEMAP row; closes #235. The backend `createAccessKey6` / `exportInventory` are left as they are.

## i18n
- Added (11 locales): `chipAutoUpdated`.
- Added (11 locales): `catEmptyFilteredTitle`, `catEmptyFilteredCta`.
- Removed (11 locales): `stgCopyApiUrl`, `stgCopyApiUrlOk`, `stgCopyApiUrlNoKey`, `stgCopyApiUrlErr`, `stgCopyApiUrlGenerating`.
