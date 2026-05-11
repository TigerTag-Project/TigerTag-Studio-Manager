/**
 * renderer/IoT/td1s/index.js — TD1S colour-sensor integration module.
 *
 * Manages the full TD1S lifecycle in Studio Manager:
 *   • Sidebar panel (dark theme, live colour circle + values + log)
 *   • Connect modal   — guides the user to plug in the sensor
 *   • Tester modal    — live colour + TD readout without saving
 *   • Health icon     — header indicator (grey → green on connect)
 *   • Sensor engine   — onLog / onStatus / onSensorData / onClear callbacks
 *                       from the preload `window.td1s` bridge
 *
 * Edit modals (TD Edit + Color Edit) live in ./edit-modals.js.
 * The sensor engine calls them directly via the three exported hooks.
 *
 * Only one coupling point remains in inventory.js (passed as callback via ctx):
 *   onAdpData(data)  — feed the Add-Product panel (ADP) live color + TD sync
 *
 * Usage — call once after DOM is ready, after initEditModals():
 *   import { initTD1S, openTd1sConnectModal, openTd1sTesterModal }
 *     from './IoT/td1s/index.js';
 *
 *   initTD1S({
 *     state, t, $, makePanelResizable,
 *     onAdpData,   // optional — called when sensor data arrives while ADP is open
 *   });
 */

import { editModalsOnData, editModalsOnStatus, editModalsOnClear }
  from './edit-modals.js';

// ── Module-level context (injected by initTD1S) ────────────────────────────
let _ctx = null;

// ── Modal open-state flags (used by the sensor engine) ────────────────────
let _td1sConnectOpen = false;
let _td1sTesterOpen  = false;

// ── Public init ────────────────────────────────────────────────────────────

/**
 * Must be called once during app setup, after the DOM is ready.
 *
 * @param {object} ctx
 * @param {object}   ctx.state             — shared app state (writes .td1sConnected)
 * @param {Function} ctx.t                 — i18n helper
 * @param {Function} ctx.$                 — getElementById shorthand
 * @param {Function} ctx.makePanelResizable — wires the td1sPanel drag-resize handle
 * @param {Function} [ctx.onAdpData]       — optional callback(data) for the Add-Product panel
 */
export function initTD1S(ctx) {
  _ctx = ctx;
  _wirePanelResize();
  _wirePanelHandlers();
  _wireConnectModal();
  _wireTesterModal();
  _wireHealthIcon();
  _startSensorEngine();
}

// ── Public modal openers (called from inventory.js call sites) ─────────────

/**
 * Open the connect modal. Also tells main process the sensor is needed so it
 * starts polling for the USB device (`window.td1s.need()`).
 */
export function openTd1sConnectModal() {
  _td1sConnectOpen = true;
  _ctx.$("td1sConnectModalOverlay").classList.add("open");
  if (!_ctx.state.td1sConnected) window.td1s?.need();
}

/**
 * Open the tester modal with a blank/reset display, request sensor.
 */
export function openTd1sTesterModal() {
  _td1sTesterOpen = true;
  const { $ } = _ctx;
  const circle = $("td1sTesterCircle");
  const hexIn  = $("td1sTesterHex");
  const tdIn   = $("td1sTesterTd");
  if (circle) circle.style.background = "#2a2a2a";
  if (hexIn)  hexIn.value  = "";
  if (tdIn)   tdIn.value   = "";
  $("td1sTesterOverlay").classList.add("open");
  window.td1s?.need();
}

// ── Panel resize ───────────────────────────────────────────────────────────

function _wirePanelResize() {
  const { $, makePanelResizable } = _ctx;
  makePanelResizable($("td1sPanel"), $("td1sResize"), "tigertag.panelWidth.td1s");
}

// ── Sidebar panel open/close ───────────────────────────────────────────────

function _wirePanelHandlers() {
  const { $ } = _ctx;
  $("btnTD1S").addEventListener("click",    _openTD1S);
  $("td1sClose").addEventListener("click",  _closeTD1S);
  $("td1sOverlay").addEventListener("click", _closeTD1S);
}

function _openTD1S() {
  _ctx.$("td1sPanel").classList.add("open");
  _ctx.$("td1sOverlay").classList.add("open");
  window.td1s?.need();
}

function _closeTD1S() {
  _ctx.$("td1sPanel").classList.remove("open");
  _ctx.$("td1sOverlay").classList.remove("open");
  window.td1s?.release();
}

// ── Connect modal ──────────────────────────────────────────────────────────

function _wireConnectModal() {
  const { $ } = _ctx;
  $("td1sConnectClose").addEventListener("click", _closeTd1sConnectModal);
  $("td1sConnectCancelBtn").addEventListener("click", _closeTd1sConnectModal);
  $("td1sConnectModalOverlay").addEventListener("click", e => {
    if (e.target === $("td1sConnectModalOverlay")) _closeTd1sConnectModal();
  });
}

function _closeTd1sConnectModal() {
  _td1sConnectOpen = false;
  _ctx.$("td1sConnectModalOverlay").classList.remove("open");
  window.td1s?.release();
}

// ── Tester modal ───────────────────────────────────────────────────────────

function _wireTesterModal() {
  const { $ } = _ctx;
  $("td1sTesterClose").addEventListener("click", _closeTd1sTesterModal);
  $("td1sTesterOverlay").addEventListener("click", e => {
    if (e.target === $("td1sTesterOverlay")) _closeTd1sTesterModal();
  });
}

function _closeTd1sTesterModal() {
  _td1sTesterOpen = false;
  _ctx.$("td1sTesterOverlay").classList.remove("open");
  window.td1s?.release();
}

// ── Health icon ────────────────────────────────────────────────────────────

function _wireHealthIcon() {
  _ctx.$("td1sHealth")?.addEventListener("click", () => {
    if (_ctx.state.td1sConnected) { openTd1sTesterModal(); return; }
    openTd1sConnectModal();
  });
}

// ── Sensor engine ──────────────────────────────────────────────────────────
// Wires the four preload bridge callbacks. Only runs when `window.td1s`
// is present (Electron environment with the USB bridge loaded).

function _startSensorEngine() {
  if (!window.td1s) return;

  const { $, t, state, onSensorData, onStatusChange, onClear } = _ctx;
  const TD1S_MAX  = 400;
  const td1sLogEl = $("td1sLog");

  // ── Log helper ───────────────────────────────────────────────────────────

  function _esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function _appendLog({ time, type, message }) {
    const line = document.createElement("div");
    line.innerHTML =
      `<span class="log-time">[${time}]</span> ` +
      `<span class="log-${type}">${_esc(message)}</span>`;
    td1sLogEl.appendChild(line);
    while (td1sLogEl.children.length > TD1S_MAX)
      td1sLogEl.removeChild(td1sLogEl.firstChild);
    td1sLogEl.scrollTop = td1sLogEl.scrollHeight;
  }

  window.td1s.onLog(entry => _appendLog(entry));

  // ── Status changes ───────────────────────────────────────────────────────

  window.td1s.onStatus(msg => {
    $("td1sStatus").textContent = msg;
    const connected = msg === "Status: Sensor connected";

    // Update all connected-state indicators
    $("btnTD1S")?.classList.toggle("td1s-connected",    connected);
    $("td1sHealth")?.classList.toggle("td1s-connected", connected);
    $("td1sHealth")?.setAttribute(
      "data-tooltip", t(connected ? "td1sDetected" : "td1sNotDetected"),
    );
    $("adpTd1sBtn")?.classList.toggle("td1s-connected", connected);
    state.td1sConnected = connected;

    // Auto-modal transitions
    if (connected && _td1sConnectOpen) {
      _closeTd1sConnectModal();
      openTd1sTesterModal();
    }
    if (!connected && _td1sTesterOpen) {
      _closeTd1sTesterModal();
    }

    // Propagate to edit modals
    editModalsOnStatus(connected);
  });

  // ── Sensor data ──────────────────────────────────────────────────────────

  window.td1s.onSensorData(data => {
    // Update panel live display
    $("td1sTdVal").textContent  = data.TD  || "−";
    $("td1sHexVal").textContent = data.HEX ? `#${data.HEX}` : "−";
    const hex = (data.HEX || "").replace("#", "");
    $("td1sColorCircle").style.background =
      /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex}` : "#2a2a2a";

    // Update tester modal if open
    if (_td1sTesterOpen) {
      const circle = $("td1sTesterCircle");
      const hexIn  = $("td1sTesterHex");
      const tdIn   = $("td1sTesterTd");
      if (circle) circle.style.background =
        /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex}` : "#2a2a2a";
      if (hexIn)  hexIn.value = hex ? `#${hex.toUpperCase()}` : "";
      if (tdIn)   tdIn.value  = data.TD != null ? data.TD : "";
    }

    // Feed edit modals directly
    editModalsOnData(data);
    // ADP panel — inventory.js callback (optional)
    onAdpData?.(data);
  });

  // ── Clear event ──────────────────────────────────────────────────────────

  window.td1s.onClear(() => {
    // Reset tester modal display
    if (_td1sTesterOpen) {
      const circle = $("td1sTesterCircle");
      const hexIn  = $("td1sTesterHex");
      const tdIn   = $("td1sTesterTd");
      if (circle) circle.style.background = "#2a2a2a";
      if (hexIn)  hexIn.value  = "";
      if (tdIn)   tdIn.value   = "";
    }

    // Reset edit modals
    editModalsOnClear();
  });

  // ── Log toolbar ──────────────────────────────────────────────────────────

  $("td1sCopyBtn").addEventListener("click", () => {
    const text = Array.from(td1sLogEl.children)
      .map(el => el.textContent).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      const btn = $("td1sCopyBtn");
      btn.style.borderColor = "#6ed46e";
      btn.style.color = "#6ed46e";
      setTimeout(() => { btn.style.borderColor = ""; btn.style.color = ""; }, 1500);
    });
  });

  $("td1sClearBtn").addEventListener("click", () => {
    td1sLogEl.innerHTML = "";
  });
}
