/**
 * renderer/IoT/td1s/edit-modals.js — TD Edit ("Set TD Value") + Color Edit ("Set Color Value")
 *
 * Both modals are fed by the TD1S colour sensor (window.td1s) and let the user
 * write TD and/or HEX colour values back to Firestore for a spool.
 *
 * Context injected by initEditModals():
 *   ctx.state  — shared app state (reads activeAccountId, rows, td1sConnected)
 *   ctx.t      — i18n helper
 *   ctx.$      — getElementById shorthand
 *   ctx.fbDb   — function() → active Firestore db instance
 *
 * Public openers (called from inventory.js toolbox + detail panel):
 *   openTdEditModal(r)
 *   openColorEditModal(r)
 *
 * Sensor engine hooks (called directly by IoT/td1s/index.js):
 *   editModalsOnData(data)
 *   editModalsOnStatus(connected)
 *   editModalsOnClear()
 */

// ── Module-level context ──────────────────────────────────────────────────
let _ctx = null;

// ── TD Edit state ─────────────────────────────────────────────────────────
let _tdEditRow     = null;
let _tdEditWaiting = false;
let _tdEditData    = null;

const _tdIds = {
  disc:    "tdEditStateDisconnected",
  active:  "tdEditStateActive",
  waitRow: "tdEditWaitRow",
  spinner: "tdEditSpinner",
  waitMsg: "tdEditWaitMsg",
};

// ── Color Edit state ──────────────────────────────────────────────────────
let _colorEditRow     = null;
let _colorEditWaiting = false;
let _colorEditData    = null;
let _colorEditOnSave  = null;  // optional callback(update) — set by openColorEditModal callers that don't have a real spoolId (e.g. ADP)
let _ceNumColors      = 1;    // 1, 2, or 3 — driven by r.colorList.length
let _ceActiveSlot     = 0;    // currently selected slot in TD1S mode
let _ceSlotValues     = [];   // hex6 strings per slot (no #, no alpha), init from colorList

const _ceIds = {
  disc:    "colorEditStateDisconnected",
  active:  "colorEditStateActive",
  waitRow: "colorEditWaitRow",
  spinner: "colorEditSpinner",
  waitMsg: "colorEditWaitMsg",
};

// ── Chip fields ───────────────────────────────────────────────────────────
// Fields that live on the physical RFID chip — editing them requires re-tagging the spool
const CHIP_FIELDS = ["TD", "online_color_list"];

// ── Public init ───────────────────────────────────────────────────────────

/**
 * Must be called once during app setup, after the DOM is ready and before any
 * sensor events fire. Should be called before initTD1S().
 *
 * @param {object} ctx
 * @param {object}   ctx.state  — shared app state
 * @param {Function} ctx.t      — i18n helper
 * @param {Function} ctx.$      — getElementById shorthand
 * @param {Function} ctx.fbDb   — function() → active Firestore db
 */
export function initEditModals(ctx) {
  _ctx = ctx;
  _wireListeners();
}

// ── Public openers ────────────────────────────────────────────────────────

export function openTdEditModal(r) {
  // TD-only editor — writes the TD value, never the colour (the colour+TD modal
  // is openColorEditModal, used for filament creation / colour scanning). The
  // HEX shown here is display-only, echoing what the sensor reads.
  const { $, state } = _ctx;
  _tdEditRow = r; _tdEditWaiting = false; _tdEditData = null;

  // Prefill: manual TD (State 1) + State 2 circle/hex/TD from current spool values
  // (a TD1S scan overrides State 2 when it fires).
  const firstHex = (r.colorList && r.colorList[0]) || r.colorHex || "";
  const hex6 = String(firstHex).replace(/^#/, "").slice(0, 6).toUpperCase();
  const okHex = /^[0-9A-F]{6}$/.test(hex6);
  const mi = $("tdEditManualInput"); if (mi) mi.value = r.td != null ? r.td : "";
  const ci = $("tdEditCircle");   if (ci) ci.style.background = okHex ? `#${hex6}` : "#2a2a2a";
  const hi = $("tdEditHexInput"); if (hi) hi.value = okHex ? `#${hex6}` : "";
  const ti = $("tdEditTdInput");  if (ti) ti.value = r.td != null ? r.td : "";

  // "Clear TD value" footer — only when there's actually a TD to remove.
  const clr = $("tdEditClearBtn");
  if (clr) { clr.classList.toggle("td-edit-hidden", r.td == null); clr.classList.remove("is-holding", "is-confirming"); }

  $("tdEditModalOverlay").classList.add("open");
  window.td1s?.need();
  _setEditState(_tdIds, state.td1sConnected ? "waiting" : "disconnected");
  if (state.td1sConnected) _tdEditWaiting = true;
}

export function closeTdEditModal() {
  const { $, t } = _ctx;
  _tdEditRow = _tdEditData = null; _tdEditWaiting = false;
  [$("tdEditBtnTdOnly"), $("tdEditManualSaveBtn")].forEach(b => { if (b) b.disabled = false; });
  const clr = $("tdEditClearBtn");
  if (clr) { clr.classList.remove("is-holding", "is-confirming"); const f = clr.querySelector(".hold-progress"); if (f) { f.style.transition = "width 0s"; f.style.width = "0%"; } }
  $("tdEditModalOverlay").classList.remove("open");
  ["tdEditManualInput", "tdEditHexInput", "tdEditTdInput"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  const c = $("tdEditCircle"); if (c) c.style.background = "#2a2a2a";
  const sp = $("tdEditSpinner"); if (sp) sp.classList.remove("td-edit-hidden");
  const msg = $("tdEditWaitMsg"); if (msg) { msg.setAttribute("data-i18n", "tdEditWaitMsg"); msg.textContent = t("tdEditWaitMsg"); }
  window.td1s?.release();
}

export function openColorEditModal(r, onSave = null) {
  const { $, state } = _ctx;
  _colorEditRow = r; _colorEditWaiting = false; _colorEditData = null;
  _colorEditOnSave = onSave || null;
  _ceActiveSlot = 0;

  // Determine color sources:
  //   1. online_color_list (r.colorList) — set by API enrichment or previous save
  //   2. chip RGB fields (r.colorHex / colorHex2 / colorHex3) — always present for physical spools
  // Filter out null (missing field) and pure black #000000 (unset slot).
  let colorSources;
  if (r.colorList && r.colorList.length > 0) {
    colorSources = r.colorList;
  } else {
    const chipColors = [r.colorHex, r.colorHex2, r.colorHex3]
      .filter(h => h && h !== "#000000");
    colorSources = chipColors.length > 0 ? chipColors : [""];
  }

  _ceNumColors  = Math.max(1, colorSources.length);

  // Parse each source to a clean 6-char hex string (no # prefix, no alpha)
  _ceSlotValues = colorSources.map(raw => {
    const h = (raw || "").replace(/^#/, "").toUpperCase();
    // Strip alpha channel only when the string is 8 chars (RRGGBBAA format)
    const hex6 = h.length === 8 ? h.slice(0, 6) : h;
    return /^[0-9A-Fa-f]{6}$/.test(hex6) ? hex6 : "";
  });

  // Build manual-mode slot rows (State 1)
  _ceBuildManualSlots();

  // Build TD1S slot selector tabs (State 2, hidden when numColors === 1)
  _ceBuildSlotSelector();

  // Pre-fill manual TD input (State 1)
  const mti = document.getElementById("ceManualTdInput");
  if (mti) mti.value = r.td != null ? r.td : "";

  // Pre-fill State 2 circle + HEX + TD with current spool values
  // (TD1S scan will override these when it fires)
  const ci = $("colorEditCircle");
  if (ci) ci.style.background = _ceSlotValues[0] ? `#${_ceSlotValues[0]}` : "#2a2a2a";
  const hi = $("colorEditHexInput");
  if (hi) hi.value = _ceSlotValues[0] ? `#${_ceSlotValues[0]}` : "";
  const ti = $("colorEditTdInput");
  if (ti) ti.value = r.td != null ? r.td : "";

  $("colorEditModalOverlay").classList.add("open");
  window.td1s?.need();
  _setEditState(_ceIds, state.td1sConnected ? "waiting" : "disconnected");
  if (state.td1sConnected) _colorEditWaiting = true;
}

export function closeColorEditModal() {
  const { $, t } = _ctx;
  _colorEditRow = _colorEditData = null; _colorEditWaiting = false; _colorEditOnSave = null;
  _ceNumColors = 1; _ceActiveSlot = 0; _ceSlotValues = [];
  [$("colorEditBtnTdOnly"), $("colorEditBtnColorOnly"), $("colorEditBtnAll"),
   ..._ceManualBtns()]
    .forEach(b => { if (b) b.disabled = false; });
  $("colorEditModalOverlay").classList.remove("open");
  ["colorEditHexInput", "colorEditTdInput"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  const mti = document.getElementById("ceManualTdInput"); if (mti) mti.value = "";
  const ci = $("colorEditCircle"); if (ci) ci.style.background = "#2a2a2a";
  const sp = $("colorEditSpinner"); if (sp) sp.classList.remove("td-edit-hidden");
  const msg = $("colorEditWaitMsg"); if (msg) { msg.setAttribute("data-i18n", "tdEditWaitMsg"); msg.textContent = t("tdEditWaitMsg"); }
  window.td1s?.release();
}

// ── Sensor engine hooks (called directly by IoT/td1s/index.js) ────────────

export function editModalsOnData(data) {
  const { $ } = _ctx;
  if (_tdEditWaiting && $("tdEditModalOverlay")?.classList.contains("open")) {
    _tdEditReceiveData(data);
  }
  if (_colorEditWaiting && $("colorEditModalOverlay")?.classList.contains("open")) {
    _colorEditReceiveData(data);
  }
}

export function editModalsOnStatus(connected) {
  const { $ } = _ctx;
  if ($("tdEditModalOverlay")?.classList.contains("open")) {
    if (connected  && !_tdEditData) { _setEditState(_tdIds, "waiting");      _tdEditWaiting = true;  }
    if (!connected && !_tdEditData) { _setEditState(_tdIds, "disconnected"); _tdEditWaiting = false; }
  }
  if ($("colorEditModalOverlay")?.classList.contains("open")) {
    if (connected  && !_colorEditData) { _setEditState(_ceIds, "waiting");      _colorEditWaiting = true;  }
    if (!connected && !_colorEditData) { _setEditState(_ceIds, "disconnected"); _colorEditWaiting = false; }
  }
}

export function editModalsOnClear() {
  const { $ } = _ctx;
  if ($("tdEditModalOverlay")?.classList.contains("open") && _tdEditData) {
    _tdEditData = null; _tdEditWaiting = true;
    const c  = $("tdEditCircle");    if (c)  c.style.background = "#2a2a2a";
    const hi = $("tdEditHexInput");  if (hi) hi.value = "";
    const ti = $("tdEditTdInput");   if (ti) ti.value = "";
    _setEditState(_tdIds, "waiting");
  }
  if ($("colorEditModalOverlay")?.classList.contains("open") && _colorEditData) {
    _colorEditData = null; _colorEditWaiting = true;
    const ci = $("colorEditCircle");   if (ci) ci.style.background = "#2a2a2a";
    const hi = $("colorEditHexInput"); if (hi) hi.value = "";
    const ti = $("colorEditTdInput");  if (ti) ti.value = "";
    _setEditState(_ceIds, "waiting");
  }
}

// ── Private helpers ───────────────────────────────────────────────────────

function _tdValClamp(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return Math.min(100, Math.max(0.1, n));
}

function _tdClampInput(el) {
  if (!el || el.value === "") return;
  const clamped = _tdValClamp(el.value);
  if (clamped !== null) el.value = clamped;
}

function _tdClampLive(el) {
  if (!el) return;
  // Strip any character that isn't a digit, dot, or comma; then convert comma → dot.
  const cleaned = el.value
    .replace(/[^\d.,]/g, "")
    .replace(/,/g, ".")
    .replace(/(\..*)\./g, "$1");
  if (cleaned !== el.value) {
    const pos = el.selectionStart;
    el.value = cleaned;
    try { el.setSelectionRange(pos, pos); } catch (_) {}
  }
  if (el.value === "") return;
  const n = parseFloat(el.value);
  if (!isNaN(n) && n > 100) el.value = 100;
}

function _readHex(inputId) {
  const { $ } = _ctx;
  const raw = ($(`${inputId}`)?.value || "").replace(/^#/, "").trim();
  return /^[0-9A-Fa-f]{6}$/.test(raw) ? raw.toUpperCase() : null;
}

const _blockBadKeys = (e, saveFn) => {
  if (["e", "E", "+", "-"].includes(e.key)) { e.preventDefault(); return; }
  if (e.key === "Enter") saveFn();
};

// Generic modal-state setter reused by both TD and Color modals
function _setEditState(ids, s) {
  const { $, t } = _ctx;
  $(ids.disc).classList.toggle("td-edit-hidden",   s !== "disconnected");
  $(ids.active).classList.toggle("td-edit-hidden", s === "disconnected");
  if (s !== "disconnected") {
    $(ids.waitRow).classList.remove("td-edit-hidden");
    const sp = $(ids.spinner);
    if (sp) sp.classList.toggle("td-edit-hidden", s === "result");
    const msg = $(ids.waitMsg);
    if (msg) {
      if (s === "result") { msg.removeAttribute("data-i18n"); msg.textContent = t("tdEditScannedMsg"); }
      else { msg.setAttribute("data-i18n", "tdEditWaitMsg"); msg.textContent = t("tdEditWaitMsg"); }
    }
  }
}

// Generic Firestore save: writes TD and/or HEX color to a spool + its twin
async function _saveTdHex(row, update, lockBtns, unlockBtns, closeFn, tag) {
  const { state, fbDb } = _ctx;
  if (!row) return;
  // If an onSave callback was registered (e.g. ADP "add product" mode), bypass Firestore.
  if (_colorEditOnSave && row === _colorEditRow) {
    _colorEditOnSave(update);
    closeFn();
    return;
  }
  const uid = state.activeAccountId; if (!uid) return;
  lockBtns.forEach(b => { if (b) b.disabled = true; });
  // A colour edit is stored as `online_color_list` (hex, used for display), but
  // the physical chip colour lives in the RGB fields color_r/g/b (+ 2/3), which
  // is what SDK `fromCloudDoc().toBytes()` writes back onto the chip. Mirror the
  // edited hex list into those RGB fields so an "update RFID" actually re-writes
  // the new colour — otherwise the chip keeps its old (baked) colour.
  if (Array.isArray(update.online_color_list)) {
    const toRgb = (h) => {
      const s = String(h || "").replace(/^#/, "");
      if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
      const n = parseInt(s, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    };
    const list = update.online_color_list;
    const c1 = toRgb(list[0]);
    if (c1) { update.color_r = c1.r; update.color_g = c1.g; update.color_b = c1.b; }
    const c2 = toRgb(list[1]);
    update.color_r2 = c2 ? c2.r : 0; update.color_g2 = c2 ? c2.g : 0; update.color_b2 = c2 ? c2.b : 0;
    const c3 = toRgb(list[2]);
    update.color_r3 = c3 ? c3.r : 0; update.color_g3 = c3 ? c3.g : 0; update.color_b3 = c3 ? c3.b : 0;
  }
  if (CHIP_FIELDS.some(f => f in update)) update.needUpdateAt = Date.now();
  const invRef = fbDb().collection("users").doc(uid).collection("inventory");
  try {
    const batch = fbDb().batch();
    batch.update(invRef.doc(row.spoolId), update);
    let twin = false;
    if (row.twinUid) {
      const tr = state.rows.find(r =>
        r.spoolId !== row.spoolId &&
        (String(r.uid) === String(row.twinUid) || String(r.spoolId) === String(row.twinUid))
      );
      if (tr) { batch.update(invRef.doc(tr.spoolId), { ...update }); twin = true; }
    }
    await batch.commit();
    closeFn();
    console.log(`[${tag}] saved`, update, twin ? "(twin)" : "");
  } catch (err) {
    console.error(`[${tag}] save error:`, err);
    unlockBtns.forEach(b => { if (b) b.disabled = false; });
  }
}

// ── TD Edit — receive + save ──────────────────────────────────────────────

function _tdEditReceiveData(data) {
  const { $ } = _ctx;
  _tdEditWaiting = false; _tdEditData = data;
  const hex = (data.HEX || "").replace(/^#/, "");
  const c  = $("tdEditCircle");   if (c)  c.style.background = /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex}` : "#888";
  const hi = $("tdEditHexInput"); if (hi) hi.value = hex ? `#${hex.toUpperCase()}` : "";
  const ti = $("tdEditTdInput");  if (ti) ti.value = data.TD != null ? data.TD : "";
  _setEditState(_tdIds, "result");
}

function _tdEditSaveTdOnly() {
  const { $ } = _ctx;
  const tdVal = _tdValClamp($("tdEditTdInput")?.value);
  if (tdVal === null) { $("tdEditTdInput")?.focus(); return; }
  _saveTdHex(_tdEditRow, { TD: tdVal, last_update: Date.now() },
    [$("tdEditBtnTdOnly")], [$("tdEditBtnTdOnly")],
    closeTdEditModal, "TD edit");
}

function _tdEditSaveManual() {
  const { $ } = _ctx;
  const tdVal = _tdValClamp($("tdEditManualInput")?.value);
  if (tdVal === null) { $("tdEditManualInput")?.focus(); return; }
  _saveTdHex(_tdEditRow, { TD: tdVal, last_update: Date.now() },
    [$("tdEditManualSaveBtn")], [$("tdEditManualSaveBtn")],
    closeTdEditModal, "TD edit manual");
}

// ── Color Edit — slot builder + receive + save ────────────────────────────

// Returns true if the 6-char hex color is perceptually light (needs dark icon + dark hover ring).
function _ceIsLight(hex) {
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
}

// Apply background color + matching icon color + light/dark class to a swatch button.
function _ceUpdateSwatch(swatchEl, hex) {
  const valid = /^[0-9A-Fa-f]{6}$/.test(hex);
  swatchEl.style.background = valid ? `#${hex}` : "#2a2a2a";
  const light = valid && _ceIsLight(hex);
  swatchEl.classList.toggle("ce-swatch--light", light);
  const ic = swatchEl.querySelector(".ce-swatch-edit");
  if (ic) ic.style.background = light ? '#000' : '#fff';
}

// Build N picker rows in #ceManualSlots (State 1, manual / no TD1S)
function _ceBuildManualSlots() {
  const container = document.getElementById("ceManualSlots");
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < _ceNumColors; i++) {
    const hex   = _ceSlotValues[i] || "";
    const valid = /^[0-9A-Fa-f]{6}$/.test(hex);
    const row   = document.createElement("div");
    row.className   = "ce-slot-row";
    row.dataset.slot = i;
    row.innerHTML = `
      ${_ceNumColors > 1 ? `<span class="ce-slot-label">${i + 1}</span>` : ""}
      <button class="ce-swatch${valid && _ceIsLight(hex) ? " ce-swatch--light" : ""}" id="ceSlot${i}Swatch" type="button"
        style="background:${valid ? `#${hex}` : "#2a2a2a"}">
        <span class="icon icon-edit icon-12 ce-swatch-edit" aria-hidden="true"
          style="background:${valid && _ceIsLight(hex) ? '#000' : '#fff'}"></span>
      </button>
      <input type="color" id="ceSlot${i}Native" tabindex="-1"
        style="position:absolute;opacity:0;width:0;height:0;pointer-events:none"
        ${valid ? `value="#${hex}"` : ""}>
      <input type="text" id="ceSlot${i}Hex" class="td-edit-val-input ce-hex-input"
        placeholder="#RRGGBB" maxlength="7" spellcheck="false"
        value="${valid ? `#${hex}` : ""}">
    `;
    container.appendChild(row);
    // Swatch → open native picker
    row.querySelector(`#ceSlot${i}Swatch`).addEventListener("click", () => {
      row.querySelector(`#ceSlot${i}Native`).click();
    });
    // Native picker → sync swatch + hex text
    row.querySelector(`#ceSlot${i}Native`).addEventListener("input", e => {
      const h = e.target.value.replace(/^#/, "").toUpperCase();
      _ceUpdateSwatch(row.querySelector(`#ceSlot${i}Swatch`), h);
      row.querySelector(`#ceSlot${i}Hex`).value = `#${h}`;
    });
    // Hex text → sync swatch + native picker
    row.querySelector(`#ceSlot${i}Hex`).addEventListener("input", () => {
      const h = (row.querySelector(`#ceSlot${i}Hex`).value || "").replace(/^#/, "");
      const v = /^[0-9A-Fa-f]{6}$/.test(h);
      _ceUpdateSwatch(row.querySelector(`#ceSlot${i}Swatch`), v ? h : "");
      if (v) row.querySelector(`#ceSlot${i}Native`).value = `#${h}`;
    });
  }
}

// Build slot selector tabs in #ceSlotSelector (State 2, TD1S mode)
function _ceBuildSlotSelector() {
  const sel = document.getElementById("ceSlotSelector");
  if (!sel) return;
  if (_ceNumColors <= 1) { sel.classList.add("td-edit-hidden"); return; }
  sel.classList.remove("td-edit-hidden");
  sel.innerHTML = "";
  for (let i = 0; i < _ceNumColors; i++) {
    const btn = document.createElement("button");
    btn.className   = `ce-slot-tab${i === 0 ? " active" : ""}`;
    btn.dataset.slot = i;
    const hex = _ceSlotValues[i];
    btn.innerHTML = hex
      ? `<span class="ce-slot-dot" style="background:#${hex}"></span>${i + 1}`
      : `${i + 1}`;
    btn.addEventListener("click", () => _ceSetSlot(i));
    sel.appendChild(btn);
  }
}

// Switch active TD1S slot
function _ceSetSlot(idx) {
  _ceActiveSlot = idx;
  const sel = document.getElementById("ceSlotSelector");
  if (sel) sel.querySelectorAll(".ce-slot-tab").forEach((b, i) => b.classList.toggle("active", i === idx));
  // Show current collected value for this slot
  const { $ } = _ctx;
  const hex = _ceSlotValues[idx] || "";
  const ci  = $("colorEditCircle");   if (ci) ci.style.background = hex ? `#${hex}` : "#2a2a2a";
  const hi  = $("colorEditHexInput"); if (hi) hi.value = hex ? `#${hex}` : "";
}

// Read all hex values from manual-mode slot rows → ["RRGGBB", …] or null per slot
function _ceGetAllHex() {
  return Array.from({ length: _ceNumColors }, (_, i) => {
    const raw = (document.getElementById(`ceSlot${i}Hex`)?.value || "").replace(/^#/, "").trim();
    return /^[0-9A-Fa-f]{6}$/.test(raw) ? raw.toUpperCase() : null;
  });
}

function _colorEditReceiveData(data) {
  const { $ } = _ctx;
  _colorEditWaiting = false; _colorEditData = data;
  const hex = (data.HEX || "").replace(/^#/, "").toUpperCase();
  // Store in active slot
  if (hex && _ceActiveSlot < _ceNumColors) {
    _ceSlotValues[_ceActiveSlot] = hex;
    // Update slot tab dot
    const sel = document.getElementById("ceSlotSelector");
    if (sel) {
      const tab = sel.querySelectorAll(".ce-slot-tab")[_ceActiveSlot];
      if (tab) {
        let dot = tab.querySelector(".ce-slot-dot");
        if (!dot) { dot = document.createElement("span"); dot.className = "ce-slot-dot"; tab.prepend(dot); }
        dot.style.background = `#${hex}`;
      }
    }
  }
  const ci = $("colorEditCircle");   if (ci) ci.style.background = /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex}` : "#888";
  const hi = $("colorEditHexInput"); if (hi) hi.value = hex ? `#${hex}` : "";
  const ti = $("colorEditTdInput");  if (ti) ti.value = data.TD != null ? data.TD : "";
  _setEditState(_ceIds, "result");
}

// Shared button list for State 2 — lock/unlock all 3 save buttons together
function _ceState2Btns() {
  const { $ } = _ctx;
  return [$("colorEditBtnTdOnly"), $("colorEditBtnColorOnly"), $("colorEditBtnAll")].filter(Boolean);
}

function _colorEditSaveTdOnly() {
  const { $ } = _ctx;
  const tdVal = _tdValClamp($("colorEditTdInput")?.value);
  if (tdVal === null) { $("colorEditTdInput")?.focus(); return; }
  const btns = _ceState2Btns();
  _saveTdHex(_colorEditRow, { TD: tdVal, last_update: Date.now() },
    btns, btns, closeColorEditModal, "Color+TD edit — TD only");
}

function _colorEditSaveColorOnly() {
  const { $ } = _ctx;
  const hexVal = _readHex("colorEditHexInput");
  if (!hexVal) { $("colorEditHexInput")?.focus(); return; }
  const list = [..._ceSlotValues];
  list[_ceActiveSlot] = hexVal;
  const btns = _ceState2Btns();
  _saveTdHex(_colorEditRow, { online_color_list: list.map(h => h || hexVal), last_update: Date.now() },
    btns, btns, closeColorEditModal, "Color+TD edit — color only");
}

function _colorEditSaveAll() {
  const { $ } = _ctx;
  const hexVal = _readHex("colorEditHexInput");
  if (!hexVal) { $("colorEditHexInput")?.focus(); return; }
  const tdVal  = _tdValClamp($("colorEditTdInput")?.value);
  const list   = [..._ceSlotValues];
  list[_ceActiveSlot] = hexVal;
  const update = { online_color_list: list.map(h => h || hexVal), last_update: Date.now() };
  if (tdVal !== null) update.TD = tdVal;
  const btns = _ceState2Btns();
  _saveTdHex(_colorEditRow, update, btns, btns, closeColorEditModal, "Color+TD edit — all");
}

function _ceManualBtns() {
  return [
    document.getElementById("colorEditManualBtnTdOnly"),
    document.getElementById("colorEditManualBtnColorOnly"),
    document.getElementById("colorEditManualSaveBtn"),
  ].filter(Boolean);
}

function _colorEditManualSaveTdOnly() {
  const tdVal = _tdValClamp(document.getElementById("ceManualTdInput")?.value);
  if (tdVal === null) { document.getElementById("ceManualTdInput")?.focus(); return; }
  const btns = _ceManualBtns();
  _saveTdHex(_colorEditRow, { TD: tdVal, last_update: Date.now() },
    btns, btns, closeColorEditModal, "Color+TD edit manual — TD only");
}

function _colorEditManualSaveColorOnly() {
  const hexValues = _ceGetAllHex();
  const firstInvalid = hexValues.indexOf(null);
  if (firstInvalid !== -1) { document.getElementById(`ceSlot${firstInvalid}Hex`)?.focus(); return; }
  const btns = _ceManualBtns();
  _saveTdHex(_colorEditRow, { online_color_list: hexValues, last_update: Date.now() },
    btns, btns, closeColorEditModal, "Color+TD edit manual — color only");
}

function _colorEditSaveManual() {
  const hexValues = _ceGetAllHex();
  const firstInvalid = hexValues.indexOf(null);
  if (firstInvalid !== -1) {
    document.getElementById(`ceSlot${firstInvalid}Hex`)?.focus();
    return;
  }
  const update = { online_color_list: hexValues, last_update: Date.now() };
  // Also save TD if the user filled in the manual TD field
  const tdVal = _tdValClamp(document.getElementById("ceManualTdInput")?.value);
  if (tdVal !== null) update.TD = tdVal;
  const btns = _ceManualBtns();
  _saveTdHex(_colorEditRow, update, btns, btns, closeColorEditModal, "Color+TD edit manual — save all");
}

// ── Event listeners ───────────────────────────────────────────────────────

function _wireListeners() {
  const { $ } = _ctx;

  // ── TD Edit modal ──────────────────────────────────────────────────────
  $("tdEditClose").addEventListener("click", closeTdEditModal);
  $("tdEditBtnTdOnly").addEventListener("click", _tdEditSaveTdOnly);
  $("tdEditManualSaveBtn").addEventListener("click", _tdEditSaveManual);
  // "Clear TD value" footer — hold-to-confirm (helper + clear callback come from
  // inventory.js via ctx). Removes the TD entirely, then closes the modal.
  if ($("tdEditClearBtn") && _ctx.setupHoldToConfirm) {
    _ctx.setupHoldToConfirm($("tdEditClearBtn"), 1200, () => {
      const row = _tdEditRow;
      Promise.resolve(_ctx.clearTd?.(row)).finally(() => closeTdEditModal());
    });
  }
  $("tdEditManualInput").addEventListener("keydown", e => _blockBadKeys(e, _tdEditSaveManual));
  $("tdEditManualInput").addEventListener("blur",  () => _tdClampInput($("tdEditManualInput")));
  $("tdEditManualInput").addEventListener("input", () => _tdClampLive($("tdEditManualInput")));
  $("tdEditHexInput").addEventListener("input", () => {
    const hex = ($("tdEditHexInput").value || "").replace(/^#/, "");
    const c = $("tdEditCircle");
    if (c) c.style.background = /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex}` : "#2a2a2a";
  });
  $("tdEditTdInput").addEventListener("keydown", e => _blockBadKeys(e, _tdEditSaveTdOnly));
  $("tdEditTdInput").addEventListener("blur",  () => _tdClampInput($("tdEditTdInput")));
  $("tdEditTdInput").addEventListener("input", () => _tdClampLive($("tdEditTdInput")));
  $("tdEditModalOverlay").addEventListener("click", e => {
    if (e.target === $("tdEditModalOverlay")) closeTdEditModal();
  });

  // ── Color Edit modal ───────────────────────────────────────────────────
  // Slot rows are built dynamically in _ceBuildManualSlots() — no static swatch/picker listeners here.
  $("colorEditClose").addEventListener("click", closeColorEditModal);
  // State 2 (TD1S) buttons
  $("colorEditBtnTdOnly").addEventListener("click", _colorEditSaveTdOnly);
  $("colorEditBtnColorOnly").addEventListener("click", _colorEditSaveColorOnly);
  $("colorEditBtnAll").addEventListener("click", _colorEditSaveAll);
  // State 1 (manual) buttons
  document.getElementById("colorEditManualBtnTdOnly").addEventListener("click", _colorEditManualSaveTdOnly);
  document.getElementById("colorEditManualBtnColorOnly").addEventListener("click", _colorEditManualSaveColorOnly);
  document.getElementById("colorEditManualSaveBtn").addEventListener("click", _colorEditSaveManual);
  // Manual TD input — clamp + Enter to save
  const mti = document.getElementById("ceManualTdInput");
  if (mti) {
    mti.addEventListener("blur",  () => _tdClampInput(mti));
    mti.addEventListener("input", () => _tdClampLive(mti));
    mti.addEventListener("keydown", e => _blockBadKeys(e, _colorEditManualSaveTdOnly));
  }
  // State 2: HEX result input live-updates big circle
  $("colorEditHexInput").addEventListener("input", () => {
    const hex = ($("colorEditHexInput").value || "").replace(/^#/, "");
    const ci = $("colorEditCircle");
    if (ci) ci.style.background = /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex}` : "#2a2a2a";
  });
  $("colorEditTdInput").addEventListener("keydown", e => _blockBadKeys(e, _colorEditSaveColorOnly));
  $("colorEditTdInput").addEventListener("blur",  () => _tdClampInput($("colorEditTdInput")));
  $("colorEditTdInput").addEventListener("input", () => _tdClampLive($("colorEditTdInput")));
  $("colorEditModalOverlay").addEventListener("click", e => {
    if (e.target === $("colorEditModalOverlay")) closeColorEditModal();
  });
}
