/**
 * printers/context.js — Shared rendering context for brand card widgets.
 *
 * This object is populated by inventory.js early in its initialisation
 * (after all helpers are defined). Brand card files import it and read
 * from it lazily at call time — never at module evaluation time — so the
 * timing is always correct.
 *
 * No dependencies on any other file in this project.
 */
export const ctx = {
  // HTML escape — populated immediately; fallback is a safe no-op.
  esc: s => String(s),

  // i18n lookup — reads state.i18n / state.lang at call time.
  t: k => k,

  // Format helpers (pure functions)
  snapFmtTempPair: (cur, tgt) => `${cur ?? "—"}/${tgt ?? "—"}°C`,
  snapFmtDuration: s => `${Math.floor((s || 0) / 60)}m`,
  snapTextColor: () => "#fff",

  // Normalised live job for a printer — the SAME reading the printers table
  // uses (state, pct, remainSec…), so a card never has to re-derive it and
  // drift from the table. Returns null when the printer isn't connected.
  getPrinterJob: () => null,

  // Printer model helpers (read state.db.printerModels at call time)
  findPrinterModel: () => null,
  printerImageUrl: () => null,
  printerImageUrlFor: () => null,

  // Snapmaker-specific
  snapFilenameRel: s => String(s || ""),

  // SVG icon strings — set to empty strings until populated
  SNAP_ICON_NOZZLE: "",
  SNAP_ICON_BED: "",
  SNAP_ICON_CHAMBER: "",
  SNAP_ICON_CLOCK: "",

  // Callbacks injected by inventory.js — used by brand files to call back
  // into the main renderer without creating circular imports.
  getActivePrinter:      () => null,
  getState:              () => ({}),
  onFullRender:          () => {},   // calls renderPrinterDetail()
  onPrinterStatusChange: (_key, _status) => {}, // calls refreshOpenPrinterDetail() + cam rebuild if available
  onPrintersViewChange:  () => {},   // calls renderPrintersView()
  onPrinterGridChange:   () => {},   // renderPrintersView() only when NOT in cam view
  onGridJobsChange:      () => {},   // surgical patch of job blocks in grid cards
  // Hold-to-confirm helper — bound to setupHoldToConfirm() in inventory.js.
  // Brand modules call this after injecting dynamic buttons into the DOM.
  setupHoldToConfirm: () => {},

  // Add-flow bridge — populated by inventory.js. Used by brand add-flow
  // modules to open the global Printer Settings modal and return to the
  // brand picker without creating circular imports.
  openPrinterSettings: (brand, printer, prefill) => {},
  openBrandPicker:     () => {},
  printerRequiredFields: (_brand) => [],                        // scan-pick.js
  addScannedPrinters:    async (_brand, _prefills) => ({ ok: false, error: "not-wired" }),
  isDebugEnabled:      () => false,
  // Persist an Anycubic cloud printer (provisioned via the slicer). Returns
  // { ok, id } | { ok:false, error }. Implemented in inventory.js.
  addAnycubicCloudPrinter: async (_rec) => ({ ok: false, error: "not-wired" }),
  // Refresh the cloud token on all Anycubic cloud printers (after a re-grab).
  updateAnycubicCloudToken: async (_email, _token) => ({ ok: false, error: "not-wired" }),
  /* Bambu Lab cloud. The account session (token, uid, region) is stored ONCE,
     apart from the machines, and every cloud printer reads it — see
     docs/bambu_connect_cloud.md §6. It is deliberately not a field on the
     printer: Firestore reads a document whole, so a secret sitting in a machine's
     record would travel with that record the day printers become friend-visible.
     Implemented in inventory.js. */
  saveBambuCloudSession: async (_session) => ({ ok: false, error: "not-wired" }),
  getBambuCloudSession:  async () => null,
  addBambuCloudPrinter:  async (_rec) => ({ ok: false, error: "not-wired" }),
  // A cloud printer's LAN access code, and its address once telemetry reveals it.
  getBambuDeviceSecret:  async (_devId) => null,
  saveBambuLanAddress:   async (_printer, _ip) => {},
  saveBambuAccessCode:   async (_printer, _code) => {},
  // Persist a printer's resolved model id (printerModelId) to Firestore.
  // Used by brand drivers to auto-correct the model after the first
  // authenticated connection, when the add-by-IP probe couldn't identify it.
  updatePrinterModel: async (_printer, _modelId) => {},

  // Re-applies data-i18n translations across the whole document.
  // Call after dynamically injecting elements that carry data-i18n attributes.
  applyTranslations:   () => {},

  // Creality camera — wired by inventory.js to avoid circular imports between
  // creality/index.js and creality/widget_camera.js.
  creCamStart: _ip => {},
  creCamStop:  _ip => {},
};
