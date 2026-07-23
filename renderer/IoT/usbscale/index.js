/**
 * renderer/IoT/usbscale/index.js — USB HID scale (Dymo M-series) integration.
 *
 * The main process opens the scale (vid 0x0922, usage page 0x8D) and streams
 * decoded frames over IPC at ~1 Hz: { status, grams }. This module turns those
 * frames into ONE weight write per "pose session":
 *
 *   • POD mode — chip UID(s) sitting on the RFID reader(s) identify the target
 *     spool with certainty (open side card or not). When the weight stabilises
 *     AND the same UIDs are still present, the weight is applied silently via
 *     doWeightUpdate(row, "raw", grams) — gross→net + twin sync included.
 *     If the UID set changes mid-weigh, the session is cancelled.
 *   • Side-card mode — no chip on any reader but a spool's detail panel is
 *     open: the target is only probable, so an inline confirmation appears in
 *     the panel's WEIGHT section; one click applies it.
 *   • Neither → nothing happens (the dock only lives in an open side card).
 *
 * After a write (or a cancel), the session is LATCHED: nothing is written
 * again until the UIDs leave the readers (POD mode) or the scale is emptied
 * (side-card mode). Re-posing re-arms the cycle.
 *
 * UI — the scale renders INSIDE the open side card's WEIGHT section, in the
 * #usbScaleDock placeholder emitted by buildPanelHTML: a live readout row
 * whenever the scale is connected, plus the inline confirm block when a
 * stabilised weight awaits a decision. Clicks are delegated on #panelBody so
 * panel section swaps never orphan the handlers. Styles: usbscale.css.
 *
 * Usage — call once during app init:
 *   initUsbScale({ state, t, esc, $, doWeightUpdate, openContainerPicker, openDetail });
 * After (re)building the detail panel, call usbScaleRefreshDock() for an
 * instant paint (the 1 Hz frame stream repaints it within a second anyway).
 */

// ── Module-level context (injected by initUsbScale) ───────────────────────
let _ctx = null;

// ── Constants ─────────────────────────────────────────────────────────────
const MIN_GRAMS     = 50;  // below this the scale is considered empty (noise / tare quirk)
const STABLE_FRAMES = 3;   // consecutive identical stable frames (~3 s) → stabilised

// ── Module-level state ────────────────────────────────────────────────────
let _connected     = false;
let _everConnected = false; // a scale connected at least once this session —
                            // gates the "asleep" hint (the M-series auto-powers
                            // off after ~3 min; without this we'd hint at a
                            // scale for users who never plugged one in).
let _phase      = "idle";  // idle | tracking | confirm | latched
let _latchMode  = null;    // 'pod' | 'card' — how the latch re-arms
let _stableVal  = null;    // value of the current identical-stable run
let _stableRun  = 0;       // length of that run
let _poseUids   = null;    // Set<uid> snapshot at pose start (POD mode when non-empty)
let _lastGrams  = 0;
let _note       = null;    // transient i18n key (string) or { key, params } shown in the dock
let _confirm    = null;    // { spoolId, grams, mode } while a confirmation is pending

export function initUsbScale(ctx) {
  _ctx = ctx;
  if (!window.electronAPI?.onUsbScaleData) return;
  window.electronAPI.onUsbScaleUpdate(d => _onScaleUpdate(d));
  window.electronAPI.onUsbScaleData(f => _onFrame(f));
  // Re-arm watcher: when chips leave the readers, a POD latch releases.
  // Deferred a tick so inventory.js's own listener updates nfcCardPresent first.
  window.electronAPI.onRfidCardPresent?.(() => setTimeout(_maybeRearmPod, 0));
  // Seed connect state (the device may have been opened before the renderer loaded).
  window.electronAPI.getUsbScaleState?.().then(d => d && _onScaleUpdate(d)).catch(() => {});
  // Delegated clicks on the stable panel parent — survives dock re-renders.
  _ctx.$("panelBody")?.addEventListener("click", _onDockClick);
}

/** Instant dock paint after the detail panel (re)builds. */
export function usbScaleRefreshDock() {
  _dockSig = null;
  _renderDock();
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _uidSet() {
  const { state } = _ctx;
  return new Set([...state.nfcCardPresent.values()].map(c => String(c.uid).toUpperCase()));
}

function _sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function _findRowByUid(uid) {
  const { state } = _ctx;
  return state.rows.find(x =>
    String(x.uid).toUpperCase() === uid || String(x.spoolId).toUpperCase() === uid);
}

// Resolve the UID set to a single target spool row (twin pair = one spool).
// Returns { row } or { errKey }.
function _resolvePodTarget(uids) {
  const rows = [];
  for (const uid of uids) {
    const r = _findRowByUid(uid);
    if (!r) return { errKey: "usbScaleUnknownChip" };
    if (!rows.some(x => x.spoolId === r.spoolId)) rows.push(r);
  }
  if (rows.length === 2) {
    const [a, b] = rows;
    const twins =
      (a.twinUid && (String(a.twinUid) === String(b.uid) || String(a.twinUid) === String(b.spoolId))) ||
      (b.twinUid && (String(b.twinUid) === String(a.uid) || String(b.twinUid) === String(a.spoolId)));
    if (twins) return { row: a };
  }
  if (rows.length > 1) return { errKey: "usbScaleTwoSpools" };
  const row = rows[0];
  if (row.deleted) return { errKey: "usbScaleUnknownChip" };
  return { row };
}

function _resetSession() {
  _phase = "idle"; _latchMode = null; _poseUids = null;
  _stableVal = null; _stableRun = 0;
  _confirm = null;
}

// ── Scale events ──────────────────────────────────────────────────────────

function _onScaleUpdate({ connected }) {
  _connected = !!connected;
  if (_connected) _everConnected = true;
  else { _resetSession(); _note = null; }
  _renderDock();
}

function _onFrame({ status, grams }) {
  const { state } = _ctx;
  _lastGrams = grams;

  if (status === "over") { _note = "usbScaleOver"; _stableVal = null; _stableRun = 0; _renderDock(); return; }

  // Scale emptied → drop any pending confirm; re-arm unless latched in POD
  // mode (that latch only releases when the chips leave the readers).
  if (grams < MIN_GRAMS) {
    if (_phase === "confirm" || _phase === "tracking") _resetSession();
    else if (_phase === "latched" && _latchMode === "card") { _resetSession(); _note = null; }
    _renderDock();
    return;
  }

  // Something is on the scale.
  if (!state.activeAccountId || state.friendView) { _renderDock(); return; }

  if (_phase === "idle") {
    _phase = "tracking";
    _poseUids = _uidSet();
    _note = null;
    _stableVal = null; _stableRun = 0;
  }

  if (_phase !== "tracking") { _renderDock(); return; }

  // POD mode: the UID set must not change between pose start and stabilisation.
  if (_poseUids.size > 0 && !_sameSet(_poseUids, _uidSet())) {
    _phase = "latched"; _latchMode = "pod"; _note = "usbScaleUidMoved";
    _renderDock();
    return;
  }

  // Stability: N consecutive stable frames carrying the same value.
  if (status === "stable" || status === "zero") {
    if (_stableVal === grams) _stableRun++;
    else { _stableVal = grams; _stableRun = 1; }
    if (_stableRun >= STABLE_FRAMES) _onStabilised(grams);
  } else {
    _stableVal = null; _stableRun = 0;
  }
  _renderDock();
}

// ── Stabilised weight → decide & act ──────────────────────────────────────

function _onStabilised(grams) {
  const { state } = _ctx;

  if (_poseUids.size > 0) {
    // POD mode — certain target, silent apply.
    const res = _resolvePodTarget(_poseUids);
    if (res.errKey) { _phase = "latched"; _latchMode = "pod"; _note = res.errKey; return; }
    if (!(Number(res.row.containerWeight) > 0)) {
      // Can't compute net weight without the container — surface the prompt in
      // the spool's own side card (open it if needed: the target is certain).
      if (state.selected !== res.row.spoolId) _ctx.openDetail(res.row.spoolId);
      _showConfirm(res.row, grams, "pod");
      return;
    }
    _apply(res.row, grams, "pod");
    return;
  }

  // Side-card mode — probable target, ask for confirmation.
  const row = state.rows.find(x => x.spoolId === state.selected);
  if (!row || row.deleted) { _phase = "latched"; _latchMode = "card"; return; }
  _showConfirm(row, grams, "card");
}

async function _apply(row, grams, mode) {
  _phase = "latched"; _latchMode = mode;
  try {
    await _ctx.doWeightUpdate(row, "raw", grams);
    // Just a short "Saved" — the net weight already refreshes in the bar above.
    // Kept as an object so _renderDock's `typeof _note === "object"` still flags
    // the green applied styling.
    _note = { key: "usbScaleApplied" };
  } catch (e) {
    console.warn("[usbscale] weight update failed:", e);
    _note = "usbScaleError";
  }
  _renderDock();
}

function _maybeRearmPod() {
  if (_phase === "latched" && _latchMode === "pod" && _uidSet().size === 0) {
    _resetSession();
    _note = null;
    _renderDock();
  }
}

function _showConfirm(row, grams, mode) {
  _phase = "confirm";
  _confirm = { spoolId: row.spoolId, grams, mode };
  _renderDock();
}

// ── Dock UI (inside the side card's WEIGHT section) ───────────────────────

function _onDockClick(e) {
  const btn = e.target.closest("[data-usbscale-action]");
  if (!btn || !_confirm) return;
  const { state } = _ctx;
  const row = state.rows.find(x => x.spoolId === _confirm.spoolId);
  const action = btn.dataset.usbscaleAction;
  if (action === "cancel") {
    _phase = "latched"; _latchMode = _confirm.mode;
    _confirm = null;
    _renderDock();
  } else if (action === "container") {
    if (row) _ctx.openContainerPicker(row);
  } else if (action === "apply") {
    if (!row) { _resetSession(); _renderDock(); return; }
    // Re-read the fresh row: the container may have just been picked.
    if (!(Number(row.containerWeight) > 0)) { _ctx.openContainerPicker(row); return; }
    const { grams, mode } = _confirm;
    _confirm = null;
    _apply(row, grams, mode);
  }
}

function _statusLine() {
  const { t } = _ctx;
  if (_note) {
    if (typeof _note === "object") return t(_note.key, _note.params);
    return t(_note);
  }
  if (_phase === "tracking" && _lastGrams >= MIN_GRAMS) return t("usbScaleWeighing");
  return "";
}

function _confirmHtml() {
  const { t, esc, state } = _ctx;
  const row = state.rows.find(x => x.spoolId === _confirm.spoolId);
  if (!row) return "";
  const cw       = Number(row.containerWeight) || 0;
  const needCont = !(cw > 0);
  const net      = Math.max(0, _confirm.grams - cw);
  return `
    <div class="usbscale-confirm">
      <div class="usbscale-confirm-title">${esc(t("usbScaleConfirmTitle"))}</div>
      <div class="usbscale-math">${needCont
        ? esc(t("usbScaleNeedContainer"))
        : esc(t("usbScaleGrossNet", { g: _confirm.grams, net }))}</div>
      <div class="usbscale-actions">
        ${needCont
          ? `<button class="usbscale-btn usbscale-btn-primary" data-usbscale-action="container">${esc(t("usbScalePickContainer"))}</button>`
          : `<button class="usbscale-btn usbscale-btn-primary" data-usbscale-action="apply">${esc(t("usbScaleConfirmYes"))}</button>`}
        <button class="usbscale-btn" data-usbscale-action="cancel">${esc(t("usbScaleConfirmNo"))}</button>
      </div>
    </div>`;
}

// Structural signature of the last full render. Weight-only changes are
// patched in place (1 Hz frames must never rebuild the confirm mid-click).
let _dockSig = null;

function _renderDock() {
  const { $, esc, state } = _ctx;
  const el = $("usbScaleDock");
  if (!el) { _dockSig = null; return; }   // no own side card open
  if (!_connected) {
    // Only hint "asleep" if a scale was seen this session — otherwise we don't
    // know the user even has one, so the WEIGHT section stays clean.
    if (_everConnected) {
      if (_dockSig !== "asleep") {
        _dockSig = "asleep";
        el.innerHTML = `
          <div class="usbscale-live usbscale-asleep">
            <span class="usbscale-ico" aria-hidden="true"></span>
            <div class="usbscale-readout">
              <span class="usbscale-state">${esc(_ctx.t("usbScaleAsleep"))}</span>
            </div>
          </div>`;
      }
    } else {
      if (el.innerHTML !== "") el.innerHTML = "";
      _dockSig = null;
    }
    return;
  }
  const confirmHere = _confirm && _confirm.spoolId === state.selected;
  const applied  = _phase === "latched" && _note && typeof _note === "object";
  const gramsTxt = _lastGrams >= MIN_GRAMS || _lastGrams < 0 ? `${_lastGrams}` : "0";
  const status   = _statusLine();
  const sig = [applied, status, state.selected,
    confirmHere ? `${_confirm.spoolId}:${_confirm.grams}:${_confirm.mode}` : ""].join("|");
  if (sig === _dockSig && el.firstElementChild) {
    // Structure unchanged → patch the live weight only.
    const g = el.querySelector(".usbscale-grams");
    if (g) g.firstChild.nodeValue = gramsTxt;
    return;
  }
  _dockSig = sig;
  el.innerHTML = `
    <div class="usbscale-live${applied ? " usbscale-ok" : ""}">
      <span class="usbscale-ico" aria-hidden="true"></span>
      <div class="usbscale-readout">
        <span class="usbscale-grams">${esc(gramsTxt)}<span class="usbscale-unit">g</span></span>
        ${status ? `<span class="usbscale-state">${esc(status)}</span>` : ""}
      </div>
    </div>
    ${confirmHere ? _confirmHtml() : ""}`;
}
