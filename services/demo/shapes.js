/**
 * services/demo/shapes.js — what machine a demo printer is, from its model.
 *
 * A demo record carries `printerModelId`, an id in its brand's printer catalog
 * (the same catalogs the add flow and the board read). The simulator sizes the
 * machine from that entry, so an A1 mini has no AMS, an X1C has one, a Prusa XL
 * has five heads and a Voron prints from a single spool:
 *
 *   slotCount  AMS / CFS / ACE / IFS feeders → 4 · MMU → 5 · several heads and no
 *              feeder → one spool per head · nothing → the external spool alone (0)
 *   tools      the catalog's `tools` (Prusa XL, Klipper / OctoPrint tool changers)
 *   chamber    `Enclosed` — for the catalogs that say it; the others keep the face's
 *
 * What the catalogs do not carry lives in OVERRIDES (dual-nozzle Bambu H2, the
 * Snapmaker U1's four heads, the Elegoo Canvas, the CC1's lack of one, the CC1
 * on OpenCentauri COSMOS with its CANVAS).
 * A face may still refine the result with its own `shape(rec)`.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CATALOG_FILE = {
  bambulab: 'data/printers/bbl_printer_models.json',
  creality: 'data/printers/cre_printer_models.json',
  elegoo: 'data/printers/eleg_printer_models.json',
  flashforge: 'data/printers/ffg_printer_models.json',
  snapmaker: 'data/printers/snap_printer_models.json',
  anycubic: 'data/printers/acu_printer_models.json',
  prusa: 'data/printers/prusa_printer_models.json',
  klipper: 'renderer/printers/klipper/models.json',
  octoprint: 'renderer/printers/octoprint/models.json',
};
// Catalogs whose `Enclosed` flag is filled in; elsewhere its absence says nothing.
const ENCLOSURE_KNOWN = new Set(['bambulab', 'creality', 'flashforge', 'anycubic', 'prusa']);
const FEEDERS = new Set(['AMS', 'AMS Optional', 'CFS', 'CFS Lite', 'ACE']);

// brand → model id → fields the catalog does not say.
const OVERRIDES = {
  bambulab: { 8: { tools: 2 }, 9: { tools: 2 }, 11: { tools: 2 } },   // H2D, H2D Pro, H2C: two nozzles
  snapmaker: { 1: { tools: 4, slotCount: 4 } },                        // U1: four heads, one spool each
  elegoo: { 1: { slotCount: 4 }, 3: { slotCount: 4 }, 4: { slotCount: 4 }, 5: { slotCount: 4 },   // Canvas
            2: { slotCount: 0, chamber: true } },                      // Centauri Carbon (CC1): no Canvas
  flashforge: { 1: { slotCount: 4 } },                                 // AD5X: IFS station
  klipper: { 166: { slotCount: 4, chamber: true } },                    // CC1 on OpenCentauri COSMOS + CANVAS
};

const _catalogs = new Map();
function catalog(brand) {
  if (!_catalogs.has(brand)) {
    let list = [];
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ROOT, CATALOG_FILE[brand] || ''), 'utf8'));
      list = Array.isArray(j) ? j : (j.models || []);
    } catch (_) { /* unknown brand or unreadable: the face's defaults apply */ }
    _catalogs.set(brand, list);
  }
  return _catalogs.get(brand);
}

/** The catalog entry of a model, or null. */
function modelOf(brand, modelId) {
  return catalog(brand).find(m => String(m.id) === String(modelId)) || null;
}

/**
 * The machine a record stands for: { slotCount, tools, chamber } — each field
 * only when known (undefined → the face's default).
 */
function shapeFor(brand, modelId) {
  const m = modelOf(brand, modelId);
  const out = {};
  if (m && String(m.id) !== '0') {
    const f = new Set(m.features || []);
    const tools = Math.max(1, Number(m.tools) || 1);
    out.tools = tools;
    out.slotCount = f.has('MMU') ? 5 : [...f].some(x => FEEDERS.has(x)) ? 4 : tools > 1 ? tools : 0;
    if (ENCLOSURE_KNOWN.has(brand)) out.chamber = f.has('Enclosed');
  }
  return { ...out, ...(OVERRIDES[brand]?.[modelId] || {}) };
}

module.exports = { shapeFor, modelOf };
