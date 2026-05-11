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
  const { $, t, state } = _ctx;
  _tdEditRow = r; _tdEditWaiting = false; _tdEditData = null;
  $("tdEditModalOverlay").classList.add("open");
  window.td1s?.need();
  _setEditState(_tdIds, state.td1sConnected ? "waiting" : "disconnected");
  if (state.td1sConnected) _tdEditWaiting = true;
}

export function closeTdEditModal() {
  const { $, t } = _ctx;
  _tdEditRow = _tdEditData = null; _tdEditWaiting = false;
  [$("tdEditBtnTdOnly"), $("tdEditBtnAll"), $("tdEditManualSaveBtn")].forEach(b => { if (b) b.disabled = false; });
  $("tdEditModalOverlay").classList.remove("open");
  ["tdEditManualInput", "tdEditHexInput", "tdEditTdInput"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  const c = $("tdEditCircle"); if (c) c.style.background = "#2a2a2a";
  const sp = $("tdEditSpinner"); if (sp) sp.classList.remove("td-edit-hidden");
  const msg = $("tdEditWaitMsg"); if (msg) { msg.setAttribute("data-i18n", "tdEditWaitMsg"); msg.textContent = t("tdEditWaitMsg"); }
  window.td1s?.release();
}

export function openColorEditModal(r) {
  const { $, state } = _ctx;
  _colorEditRow = r; _colorEditWaiting = false; _colorEditData = null;
  // Pre-fill swatch + hex input with current spool color
  const cur = (r.colorList && r.colorList[0])
    ? r.colorList[0].replace(/^#/, "").replace(/FF$/i, "").toUpperCase() : "";
  _ceSetSwatch(cur);
  const ci = $("colorEditCircle"); if (ci) ci.style.background = /^[0-9A-Fa-f]{6}$/.test(cur) ? `#${cur}` : "#2a2a2a";
  $("colorEditModalOverlay").classList.add("open");
  window.td1s?.need();
  _setEditState(_ceIds, state.td1sConnected ? "waiting" : "disconnected");
  if (state.td1sConnected) _colorEditWaiting = true;
}

export function closeColorEditModal() {
  const { $, t } = _ctx;
  _colorEditRow = _colorEditData = null; _colorEditWaiting = false;
  [$("colorEditBtnColorOnly"), $("colorEditBtnAll"), $("colorEditManualSaveBtn")].forEach(b => { if (b) b.disabled = false; });
  $("colorEditModalOverlay").classList.remove("open");
  ["colorEditHexInput", "colorEditTdInput"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  const sw = $("colorEditSwatch"); if (sw) sw.style.background = "#2a2a2a";
  const np = $("colorEditNativePicker"); if (np) np.value = "#000000";
  const mh = $("colorEditManualHex"); if (mh) mh.value = "";
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
  const uid = state.activeAccountId; if (!uid) return;
  lockBtns.forEach(b => { if (b) b.disabled = true; });
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
    [$("tdEditBtnTdOnly"), $("tdEditBtnAll")], [$("tdEditBtnTdOnly"), $("tdEditBtnAll")],
    closeTdEditModal, "TD edit");
}

function _tdEditSaveAll() {
  const { $ } = _ctx;
  const tdVal = _tdValClamp($("tdEditTdInput")?.value);
  if (tdVal === null) { $("tdEditTdInput")?.focus(); return; }
  const hexVal = _readHex("tdEditHexInput");
  const update = { TD: tdVal, last_update: Date.now() };
  if (hexVal) update.online_color_list = [hexVal];
  _saveTdHex(_tdEditRow, update,
    [$("tdEditBtnTdOnly"), $("tdEditBtnAll")], [$("tdEditBtnTdOnly"), $("tdEditBtnAll")],
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

// ── Color Edit — swatch + receive + save ──────────────────────────────────

function _ceSetSwatch(hex6) {
  const { $ } = _ctx;
  const sw    = $("colorEditSwatch");
  const np    = $("colorEditNativePicker");
  const hi    = $("colorEditManualHex");
  const valid = /^[0-9A-Fa-f]{6}$/.test(hex6);
  if (sw) sw.style.background = valid ? `#${hex6}` : "#2a2a2a";
  if (np && valid) np.value = `#${hex6}`;
  if (hi) hi.value = valid ? `#${hex6.toUpperCase()}` : "";
}

function _colorEditReceiveData(data) {
  const { $ } = _ctx;
  _colorEditWaiting = false; _colorEditData = data;
  const hex = (data.HEX || "").replace(/^#/, "");
  const ci = $("colorEditCircle");   if (ci) ci.style.background = /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex}` : "#888";
  const hi = $("colorEditHexInput"); if (hi) hi.value = hex ? `#${hex.toUpperCase()}` : "";
  const ti = $("colorEditTdInput");  if (ti) ti.value = data.TD != null ? data.TD : "";
  _setEditState(_ceIds, "result");
}

function _colorEditSaveColorOnly() {
  const { $ } = _ctx;
  const hexVal = _readHex("colorEditHexInput");
  if (!hexVal) { $("colorEditHexInput")?.focus(); return; }
  _saveTdHex(_colorEditRow, { online_color_list: [hexVal], last_update: Date.now() },
    [$("colorEditBtnColorOnly"), $("colorEditBtnAll")], [$("colorEditBtnColorOnly"), $("colorEditBtnAll")],
    closeColorEditModal, "Color edit");
}

function _colorEditSaveAll() {
  const { $ } = _ctx;
  const hexVal = _readHex("colorEditHexInput");
  if (!hexVal) { $("colorEditHexInput")?.focus(); return; }
  const tdVal  = _tdValClamp($("colorEditTdInput")?.value);
  const update = { online_color_list: [hexVal], last_update: Date.now() };
  if (tdVal !== null) update.TD = tdVal;
  _saveTdHex(_colorEditRow, update,
    [$("colorEditBtnColorOnly"), $("colorEditBtnAll")], [$("colorEditBtnColorOnly"), $("colorEditBtnAll")],
    closeColorEditModal, "Color edit");
}

function _colorEditSaveManual() {
  const { $ } = _ctx;
  const hexVal = _readHex("colorEditManualHex");
  if (!hexVal) { $("colorEditManualHex")?.focus(); return; }
  _saveTdHex(_colorEditRow, { online_color_list: [hexVal], last_update: Date.now() },
    [$("colorEditManualSaveBtn")], [$("colorEditManualSaveBtn")],
    closeColorEditModal, "Color edit manual");
}

// ── Event listeners ───────────────────────────────────────────────────────

function _wireListeners() {
  const { $ } = _ctx;

  // ── TD Edit modal ──────────────────────────────────────────────────────
  $("tdEditClose").addEventListener("click", closeTdEditModal);
  $("tdEditBtnTdOnly").addEventListener("click", _tdEditSaveTdOnly);
  $("tdEditBtnAll").addEventListener("click", _tdEditSaveAll);
  $("tdEditManualSaveBtn").addEventListener("click", _tdEditSaveManual);
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
  $("colorEditClose").addEventListener("click", closeColorEditModal);
  $("colorEditBtnColorOnly").addEventListener("click", _colorEditSaveColorOnly);
  $("colorEditBtnAll").addEventListener("click", _colorEditSaveAll);
  $("colorEditManualSaveBtn").addEventListener("click", _colorEditSaveManual);
  // Swatch click → open native color picker
  $("colorEditSwatch").addEventListener("click", () => $("colorEditNativePicker").click());
  // Native picker change → sync swatch + text input
  $("colorEditNativePicker").addEventListener("input", e => {
    const hex = e.target.value.replace(/^#/, "").toUpperCase();
    const sw = $("colorEditSwatch"); if (sw) sw.style.background = `#${hex}`;
    const hi = $("colorEditManualHex"); if (hi) hi.value = `#${hex}`;
  });
  // Text HEX input → sync swatch + native picker
  $("colorEditManualHex").addEventListener("input", () => {
    const hex   = ($("colorEditManualHex").value || "").replace(/^#/, "");
    const valid = /^[0-9A-Fa-f]{6}$/.test(hex);
    const sw = $("colorEditSwatch"); if (sw) sw.style.background = valid ? `#${hex}` : "#2a2a2a";
    const np = $("colorEditNativePicker"); if (np && valid) np.value = `#${hex}`;
  });
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
