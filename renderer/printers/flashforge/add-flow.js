/**
 * printers/flashforge/add-flow.js — Add-printer UI for FlashForge.
 *
 * Architecture (mirrors snapmaker/add-flow.js):
 *
 *   add-flow.js  (this file)     — DOM creation, UI state, event wiring
 *   probe.js                     — network scan logic, no DOM dependency
 *   context.js  (ctx)            — callbacks back into inventory.js
 *
 * Entry point: openFfgAddFlow()
 *   Called by the brand picker in inventory.js when the user selects FlashForge.
 *   Creates all DOM lazily on first call (_ensureDOM), then shows the
 *   Choice modal (Scan / Manual). All three panels live inside a single
 *   overlay so slide animations stay consistent.
 *
 * Back-communication: uses ctx.openPrinterSettings() / ctx.openBrandPicker()
 *   instead of importing inventory.js directly (avoids circular import).
 *
 * i18n: all text elements carry [data-i18n] attributes. _ensureDOM() calls
 *   ctx.applyTranslations() at the end so the newly-injected elements are
 *   translated immediately (applyTranslations() runs at startup before the
 *   DOM exists, so the dynamic injection must re-trigger it).
 *
 * Reused Snapmaker i18n keys (text is identical):
 *   snapAddChoiceSub, snapAddChoiceScan, snapAddChoiceScanHint,
 *   snapAddChoiceManual, snapAddChoiceManualHint,
 *   snapScanTitle, snapScanRestart,
 *   snapManualTitle, snapManualSub, snapManualProbe,
 *   snapScanLogTitle, snapScanLogExport, snapScanLogClear,
 *   snapAddByIpButton, snapAddByIpLabel, snapAddByIpInvalid, snapAddByIpValidate,
 *   printerAddBack, printerLblIP
 *
 * FlashForge-specific i18n keys:
 *   ffgAddChoiceTitle   — "Add FlashForge printer"
 *   ffgScanEmpty        — "No FlashForge printers found on your LAN"
 */

import { ctx } from '../context.js';
import {
  ffgProbeIp,
  ffgScanLan,
  ffgBuildDiscoveryRecord,
  ffgModelIdFromMachineModel,
  getLastFfgScanEnv,
} from './probe.js';

// ── Scan log subsystem ────────────────────────────────────────────────────────
// Lightweight ring-buffer that records probe events so the user (and support)
// can see what happened during a scan. Mirrors the one in snapmaker/add-flow.js.

let _ffgScanLog = [];

/**
 * Append a scan-log entry and refresh the log list in the DOM (if visible).
 * @param {"info"|"warn"|"found"|"err"} kind
 * @param {string} summary
 * @param {object} [raw]  Optional raw data object.
 */
function ffgScanLogPush(kind, summary, raw) {
  _ffgScanLog.push({ ts: Date.now(), kind, summary, raw: raw ?? null });

  const body = document.getElementById("ffgScanLogBody");
  if (!body || body.hidden) return;

  const row = document.createElement("div");
  row.className = `snap-scan-log-row snap-scan-log-row--${kind}`;
  row.innerHTML = `
    <span class="snap-scan-log-ts">${ctx.esc(String(_ffgScanLog.length))}</span>
    <span class="snap-scan-log-kind">${ctx.esc(kind)}</span>
    <span class="snap-scan-log-summary">${ctx.esc(summary)}</span>`;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;

  // Update the count badge in the log header.
  const count = document.getElementById("ffgScanLogCount");
  if (count) count.textContent = String(_ffgScanLog.length);
}

/** Clear the log buffer and DOM list. */
function ffgScanLogClear() {
  _ffgScanLog = [];
  const body = document.getElementById("ffgScanLogBody");
  if (body) body.innerHTML = "";
  const count = document.getElementById("ffgScanLogCount");
  if (count) count.textContent = "0";
}

// ── Extra subnets subsystem ───────────────────────────────────────────────────
// Power-user feature: additional /24 prefixes to include in the scan.

let _ffgExtraSubnets = []; // string[] of "A.B.C" prefixes

/** Return current extra-subnet list (called by ffgScanLan at scan time). */
function ffgLoadExtraSubnets() { return [..._ffgExtraSubnets]; }

/** Add a user-supplied prefix and refresh the chip list. */
function ffgAddExtraSubnet(prefix) {
  const p = prefix.trim();
  if (!p || _ffgExtraSubnets.includes(p)) return;
  _ffgExtraSubnets.push(p);
  _renderExtraSubnetChips();
}

/** Remove a prefix and refresh the chip list. */
function ffgRemoveExtraSubnet(prefix) {
  _ffgExtraSubnets = _ffgExtraSubnets.filter(p => p !== prefix);
  _renderExtraSubnetChips();
}

/** Render the chip list inside #ffgExtraSubnetsChips. */
function _renderExtraSubnetChips() {
  const el = document.getElementById("ffgExtraSubnetsChips");
  if (!el) return;
  el.innerHTML = _ffgExtraSubnets.map(p => `
    <span class="snap-extra-subnets-chip">
      <span class="snap-extra-subnets-chip-text">${ctx.esc(p)}.x</span>
      <button type="button" class="snap-extra-subnets-chip-x" data-prefix="${ctx.esc(p)}" title="Remove">✕</button>
    </span>`).join("");
  el.querySelectorAll(".snap-extra-subnets-chip-x").forEach(btn => {
    btn.addEventListener("click", () => ffgRemoveExtraSubnet(btn.dataset.prefix));
  });
}

// ── Scan state ────────────────────────────────────────────────────────────────

let _ffgScanCtl = null; // AbortController for the running scan

/** Abort any running scan (called on panel close or Restart). */
function ffgAbortScan() {
  if (_ffgScanCtl && !_ffgScanCtl.signal.aborted) _ffgScanCtl.abort();
}

// ── Candidate card ────────────────────────────────────────────────────────────

/**
 * Build the HTML string for one discovered-printer card.
 * Uses ctx.esc() on all data from the printer — field values come from
 * the HTTP response and must be treated as untrusted.
 *
 * Returns an HTML string; caller wraps it in a <div> and extracts
 * firstElementChild to wire click/keydown events — same pattern as
 * snapCandidateCardHtml in snapmaker/add-flow.js.
 *
 * @param {object} c  Candidate from ffgScanLan / ffgProbeIp.
 * @returns {string}
 */
function _ffgCandidateCardHtml(c) {
  const title      = c.hostName || c.machineName || c.machineModel || c.ip;
  const modelLine  = c.machineModel && c.machineModel !== title ? c.machineModel : "";
  const serialLine = c.serialNumber ? `SN · ${c.serialNumber}` : "";

  return `
    <div class="snap-scan-card" role="button" tabindex="0"
         data-ip="${ctx.esc(c.ip)}">
      <span class="snap-scan-card-main">
        <span class="snap-scan-card-title">
          <span class="snap-scan-card-title-text">${ctx.esc(title)}</span>
        </span>
        <span class="snap-scan-card-ip">${ctx.esc(c.ip)}</span>
        ${modelLine  ? `<span class="snap-scan-card-line snap-scan-card-line--model">${ctx.esc(modelLine)}</span>` : ""}
        ${serialLine ? `<span class="snap-scan-card-line snap-scan-card-line--sn">${ctx.esc(serialLine)}</span>` : ""}
      </span>
      <span class="icon icon-chevron-r icon-14 snap-scan-card-chev"></span>
    </div>`;
}

// ── Generic panel helpers ─────────────────────────────────────────────────────

function _openPanel(id)  { document.getElementById(id)?.classList.add("open"); }
function _closePanel(id) { document.getElementById(id)?.classList.remove("open"); }

/** Close all three FlashForge add-flow panels at once. */
function _closeAll() {
  ffgAbortScan();
  _closePanel("ffgChoiceOverlay");
  _closePanel("ffgScanOverlay");
  _closePanel("ffgManualOverlay");
}

// ── Lazy DOM creation ─────────────────────────────────────────────────────────

let _domReady = false;

/**
 * Create all FlashForge add-flow modals and append them to document.body.
 * Idempotent — second call is a no-op. Calls ctx.applyTranslations() so
 * the freshly-injected [data-i18n] elements are translated immediately.
 */
function _ensureDOM() {
  if (_domReady) return;
  _domReady = true;

  const root = document.createElement("div");
  root.id = "ffgAddFlowRoot";
  root.innerHTML = /* html */`

<!-- ═══════════════════════════════════════════════════════════════════════════
     FlashForge — Choice modal (Scan vs Manual)
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="ffgChoiceOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">

    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="ffgAddChoiceTitle">Add FlashForge printer</div>
        <div class="pba-sub"   data-i18n="snapAddChoiceSub">How do you want to find your printer?</div>
      </div>
      <button class="modal-close" id="ffgChoiceClose">✕</button>
    </div>

    <div class="pba-brands">
      <button type="button" class="pba-brand" id="ffgChoiceScan">
        <span class="pba-brand-dot" style="background:#f39c12"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceScan">Scan network</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceScanHint">Auto-discover printers on your LAN</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>

      <button type="button" class="pba-brand" id="ffgChoiceManual">
        <span class="pba-brand-dot" style="background:#f39c12"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceManual">Enter IP address</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceManualHint">Manually enter the printer's local IP</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
    </div>

    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="ffgChoiceBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     FlashForge — LAN Scan modal
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="ffgScanOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">

    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapScanTitle">Scanning network…</div>
        <div class="pba-sub" id="ffgScanSub"></div>
      </div>
      <button class="modal-close" id="ffgScanClose">✕</button>
    </div>

    <div class="snap-scan-body">

      <!-- Progress bar -->
      <div class="snap-scan-progress">
        <div class="snap-scan-bar"><span id="ffgScanBar"></span></div>
        <div class="snap-scan-stats" id="ffgScanStats">0 / 0</div>
      </div>

      <!-- Add by IP — collapsible direct-probe shortcut -->
      <details class="snap-add-ip" id="ffgAddIpDetails">
        <summary class="snap-add-ip-summary">
          <span class="snap-add-ip-summary-icon icon icon-plus icon-13"></span>
          <span class="snap-add-ip-summary-label" data-i18n="snapAddByIpButton">Add by IP</span>
          <span class="snap-add-ip-chev icon icon-chevron-r icon-13"></span>
        </summary>
        <div class="snap-add-ip-body">
          <label class="snap-add-ip-label" data-i18n="snapAddByIpLabel">IP address</label>
          <span class="snap-add-ip-input-wrap">
            <input type="text" inputmode="decimal" class="snap-add-ip-input" id="ffgAddIpInput"
                   placeholder="192.168.1.42" autocomplete="off" autocapitalize="off"
                   spellcheck="false" maxlength="15"/>
            <span class="snap-add-ip-tip" id="ffgAddIpTip" hidden role="alert">
              <span class="icon icon-info icon-13"></span>
              <span data-i18n="snapAddByIpInvalid">Invalid IP address format</span>
            </span>
          </span>
          <button type="button" class="adf-btn adf-btn--primary snap-add-ip-btn"
                  id="ffgAddIpBtn" disabled>
            <span class="icon icon-check icon-13"></span>
            <span class="label" data-i18n="snapAddByIpValidate">Validate</span>
            <span class="spinner"></span>
          </button>
          <div class="snap-add-ip-status" id="ffgAddIpStatus" hidden></div>
        </div>
      </details>

      <!-- Extra subnets (power users on multi-VLAN networks) -->
      <details class="snap-extra-subnets">
        <summary class="snap-extra-subnets-summary">
          <span class="snap-extra-subnets-icon icon icon-cloud icon-14"></span>
          <span class="snap-extra-subnets-label" data-i18n="snapScanExtraSubnetsLabel">Extra subnets to scan</span>
          <span class="snap-extra-subnets-chev icon icon-chevron-r icon-13"></span>
        </summary>
        <div class="snap-extra-subnets-body">
          <div class="snap-extra-subnets-hint" data-i18n="snapScanExtraSubnetsHint">
            Add subnets your Mac can reach via routing but isn't directly on.
          </div>
          <div class="snap-extra-subnets-row">
            <input type="text" class="snap-extra-subnets-input" id="ffgExtraSubnetsInput"
                   placeholder="192.168.40" autocomplete="off" autocapitalize="off" spellcheck="false"/>
            <button type="button" class="snap-extra-subnets-add"
                    id="ffgExtraSubnetsAdd" data-i18n="snapScanExtraSubnetsAdd">Add</button>
          </div>
          <div class="snap-extra-subnets-err" id="ffgExtraSubnetsErr" hidden></div>
          <div class="snap-extra-subnets-chips" id="ffgExtraSubnetsChips"></div>
        </div>
      </details>

      <!-- Scan results (candidate cards appended here) -->
      <div class="snap-scan-results" id="ffgScanResults"></div>

      <!-- Empty state (shown when scan completes with 0 results) -->
      <div class="snap-scan-empty" id="ffgScanEmpty" hidden data-i18n="ffgScanEmpty">
        No FlashForge printers found on your LAN
      </div>

      <!-- Scan log — hidden by default, shown in debug mode -->
      <section class="snap-scan-log" id="ffgScanLog" hidden>
        <header class="snap-scan-log-head">
          <button type="button" class="snap-scan-log-toggle" id="ffgScanLogToggle"
                  aria-expanded="false" aria-label="Scan log" data-i18n-title="snapScanLogTitle"
                  title="Scan log">
            <span class="icon icon-chevron-r icon-13 snap-scan-log-chev"></span>
            <span class="icon icon-list icon-13 snap-scan-log-title-icon"></span>
            <span class="snap-scan-log-count" id="ffgScanLogCount">0</span>
          </button>
          <span class="snap-scan-log-actions">
            <button type="button"
                    class="snap-scan-log-btn snap-scan-log-btn--primary snap-scan-log-btn--icon"
                    id="ffgScanLogExport" data-i18n-title="snapScanLogExport"
                    aria-label="Export" title="Export">
              <span class="icon icon-copy icon-13"></span>
            </button>
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--icon"
                    id="ffgScanLogClear" data-i18n-title="snapScanLogClear"
                    aria-label="Clear" title="Clear">
              <span class="icon icon-trash icon-13"></span>
            </button>
          </span>
        </header>
        <div class="snap-scan-log-body" id="ffgScanLogBody" hidden></div>
      </section>

    </div><!-- /snap-scan-body -->

    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="ffgScanBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--secondary" id="ffgScanRestart">
        <span class="icon icon-refresh icon-13"></span>
        <span data-i18n="snapScanRestart">Restart scan</span>
      </button>
    </div>

  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     FlashForge — Manual IP entry modal
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="ffgManualOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">

    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapManualTitle">Manual add</div>
        <div class="pba-sub"   data-i18n="snapManualSub">Type the printer's local IP — we'll probe it to pre-fill the rest.</div>
      </div>
      <button class="modal-close" id="ffgManualClose">✕</button>
    </div>

    <div class="pba-body">
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="printerLblIP">
          IP address <span class="pba-field-req">*</span>
        </span>
        <input type="text" id="ffgManualIpInput" class="pba-input pba-input--mono"
               placeholder="192.168.1.52" maxlength="15"
               spellcheck="false" autocomplete="off" autocapitalize="off"/>
        <div class="pba-error" id="ffgManualIpError" hidden></div>
      </div>
    </div>

    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="ffgManualBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--primary" id="ffgManualProbeBtn">
        <span class="icon icon-check icon-13"></span>
        <span class="label" data-i18n="snapManualProbe">Probe + continue</span>
        <span class="spinner"></span>
      </button>
    </div>

  </div>
</div>
`;
  document.body.appendChild(root);

  // Wire all events now that the DOM exists.
  _wireDOM();

  // Translate the freshly-injected [data-i18n] elements.
  // (applyTranslations() ran at startup before this DOM was created.)
  ctx.applyTranslations();
}

// ── Event wiring ──────────────────────────────────────────────────────────────

/**
 * Wire all button/input events for the three FlashForge add-flow panels.
 * Called once by _ensureDOM(). All IDs are ffg-prefixed to avoid clashes.
 */
function _wireDOM() {
  const $ = id => document.getElementById(id);

  // ── Choice modal ──────────────────────────────────────────────────────────

  $("ffgChoiceClose")?.addEventListener("click", _closeAll);
  $("ffgChoiceOverlay")?.addEventListener("click", e => {
    if (e.target.id === "ffgChoiceOverlay") _closeAll();
  });
  $("ffgChoiceBack")?.addEventListener("click", () => {
    _closePanel("ffgChoiceOverlay");
    ctx.openBrandPicker();
  });
  $("ffgChoiceScan")?.addEventListener("click", () => {
    _closePanel("ffgChoiceOverlay");
    _openScanPanel();
  });
  $("ffgChoiceManual")?.addEventListener("click", () => {
    _closePanel("ffgChoiceOverlay");
    _openManualPanel();
  });

  // ── Scan modal ────────────────────────────────────────────────────────────

  $("ffgScanClose")?.addEventListener("click", _closeAll);
  $("ffgScanOverlay")?.addEventListener("click", e => {
    if (e.target.id === "ffgScanOverlay") _closeAll();
  });
  $("ffgScanBack")?.addEventListener("click", () => {
    ffgAbortScan();
    _closePanel("ffgScanOverlay");
    _openPanel("ffgChoiceOverlay");
  });
  $("ffgScanRestart")?.addEventListener("click", () => {
    ffgAbortScan();
    _openScanPanel();
  });

  // Add-by-IP: enable the Validate button only when the input looks like
  // a valid IPv4 address (live validation, same pattern as Snapmaker).
  const addIpInput = $("ffgAddIpInput");
  const addIpBtn   = $("ffgAddIpBtn");
  const addIpTip   = $("ffgAddIpTip");
  if (addIpInput) {
    addIpInput.addEventListener("input", () => {
      const valid = /^\d{1,3}(\.\d{1,3}){3}$/.test(addIpInput.value.trim());
      if (addIpBtn)  addIpBtn.disabled = !valid;
      if (addIpTip)  addIpTip.hidden   = valid || !addIpInput.value;
    });
    addIpInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !addIpBtn?.disabled) _handleAddByIp();
    });
    // Reset state when the <details> panel collapses.
    $("ffgAddIpDetails")?.addEventListener("toggle", e => {
      if (!e.target.open) {
        addIpInput.value = "";
        if (addIpBtn)  addIpBtn.disabled = true;
        if (addIpTip)  addIpTip.hidden   = true;
        const status = $("ffgAddIpStatus");
        if (status) { status.hidden = true; status.textContent = ""; }
      }
    });
  }
  $("ffgAddIpBtn")?.addEventListener("click", _handleAddByIp);

  // Extra subnets
  $("ffgExtraSubnetsAdd")?.addEventListener("click", () => {
    const input = $("ffgExtraSubnetsInput");
    if (!input) return;
    const m = input.value.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})(?:\.\d+)?(?:\/\d+)?$/);
    if (m) { ffgAddExtraSubnet(m[1]); input.value = ""; }
  });
  $("ffgExtraSubnetsInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") $("ffgExtraSubnetsAdd")?.click();
  });

  // Scan log — toggle collapse
  $("ffgScanLogToggle")?.addEventListener("click", () => {
    const body   = $("ffgScanLogBody");
    const toggle = $("ffgScanLogToggle");
    if (!body || !toggle) return;
    const open = body.hidden;
    body.hidden = !open;
    toggle.classList.toggle("snap-scan-log-toggle--open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  // Scan log — export
  $("ffgScanLogExport")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({
      log:         _ffgScanLog,
      environment: getLastFfgScanEnv(),
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `ffg-scan-${Date.now()}.json`;
    a.click();
  });
  // Scan log — clear
  $("ffgScanLogClear")?.addEventListener("click", ffgScanLogClear);

  // Show scan log when debug mode is enabled.
  // We check at _openScanPanel time since debugEnabled may change between opens.

  // ── Manual modal ──────────────────────────────────────────────────────────

  $("ffgManualClose")?.addEventListener("click", _closeAll);
  $("ffgManualOverlay")?.addEventListener("click", e => {
    if (e.target.id === "ffgManualOverlay") _closeAll();
  });
  $("ffgManualBack")?.addEventListener("click", () => {
    _closePanel("ffgManualOverlay");
    _openPanel("ffgChoiceOverlay");
  });
  $("ffgManualProbeBtn")?.addEventListener("click", _handleManualProbe);
  $("ffgManualIpInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") _handleManualProbe();
  });
}

// ── Scan panel logic ──────────────────────────────────────────────────────────

/**
 * Open the scan panel and start (or restart) the LAN scan.
 * Resets all scan UI state before launching.
 */
function _openScanPanel() {
  _ensureDOM();

  // Reset UI state.
  const results = document.getElementById("ffgScanResults");
  const empty   = document.getElementById("ffgScanEmpty");
  const bar     = document.getElementById("ffgScanBar");
  const stats   = document.getElementById("ffgScanStats");
  const sub     = document.getElementById("ffgScanSub");
  if (results) results.innerHTML = "";
  if (empty)   empty.hidden = true;
  if (bar)     bar.style.width = "0%";
  if (stats)   stats.textContent = "0 / 0";
  if (sub)     sub.textContent = ctx.t("snapScanStarting") || "Starting scan…";

  ffgScanLogClear();
  _ffgExtraSubnets = [];
  _renderExtraSubnetChips();

  // Show/hide the scan log section based on debug mode.
  const logSection = document.getElementById("ffgScanLog");
  if (logSection) logSection.hidden = !ctx.isDebugEnabled();

  // Collapse the Add-by-IP panel on restart.
  const ipDetails = document.getElementById("ffgAddIpDetails");
  if (ipDetails) ipDetails.open = false;

  _openPanel("ffgScanOverlay");

  // Start the scan.
  _ffgScanCtl = new AbortController();
  const signal   = _ffgScanCtl.signal;
  let found = 0;
  let total = 0;

  ffgScanLan({
    signal,
    logPush:         ffgScanLogPush,
    getExtraSubnets: ffgLoadExtraSubnets,

    onCandidate(c) {
      found++;
      if (empty) empty.hidden = true;

      // Build card element from HTML string (avoids XSS via ctx.esc inside
      // _ffgCandidateCardHtml; using a <div> wrapper is also the pattern used
      // by Snapmaker to work around flex-on-button rendering quirks).
      const wrap = document.createElement("div");
      wrap.innerHTML = _ffgCandidateCardHtml(c);
      const card = wrap.firstElementChild;
      if (!card) return;

      const triggerAdd = () => {
        ffgAbortScan();
        _closePanel("ffgScanOverlay");
        ctx.openPrinterSettings("flashforge", null, {
          ip:           c.ip,
          printerName:  c.hostName || c.machineName || c.machineModel || `FlashForge ${c.ip}`,
          modelId:      c.modelId || ffgModelIdFromMachineModel(c.machineModel || ""),
          serialNumber: c.serialNumber || "",
          discovery:    ffgBuildDiscoveryRecord(c),
        });
      };

      card.addEventListener("click", triggerAdd);
      card.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); triggerAdd(); }
      });

      document.getElementById("ffgScanResults")?.appendChild(card);
    },

    onProgress({ done: d, total: t }) {
      total = t;
      const pct = t > 0 ? Math.round((d / t) * 100) : 0;
      const bar   = document.getElementById("ffgScanBar");
      const stats = document.getElementById("ffgScanStats");
      if (bar)   bar.style.width   = `${Math.min(pct, 100)}%`;
      if (stats) stats.textContent = `${d} / ${t}`;
    },

  }).then(() => {
    const bar   = document.getElementById("ffgScanBar");
    const stats = document.getElementById("ffgScanStats");
    const sub   = document.getElementById("ffgScanSub");
    if (bar)   bar.style.width   = "100%";
    if (stats && total > 0) stats.textContent = `${total} / ${total}`;
    if (sub)   sub.textContent = "";

    if (!signal.aborted && found === 0) {
      const empty = document.getElementById("ffgScanEmpty");
      if (empty) empty.hidden = false;
      ffgScanLogPush("warn", "Scan complete — no FlashForge printers found");
    } else if (!signal.aborted) {
      ffgScanLogPush("info", `Scan complete — ${found} printer(s) found`);
    }
  }).catch(e => {
    if (e?.name !== "AbortError") {
      ffgScanLogPush("err", `Scan error: ${e?.message || e}`);
    }
  });
}

// ── Add-by-IP handler ─────────────────────────────────────────────────────────

/**
 * Probe the IP entered in the "Add by IP" shortcut inside the scan panel.
 * On success: close scan panel, open Printer Settings (prefilled).
 * On failure: show status message inside the expanded panel.
 */
async function _handleAddByIp() {
  const input    = document.getElementById("ffgAddIpInput");
  const btn      = document.getElementById("ffgAddIpBtn");
  const statusEl = document.getElementById("ffgAddIpStatus");
  if (!input || !btn) return;

  const ip = input.value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return;

  btn.disabled = true;
  if (statusEl) { statusEl.hidden = false; statusEl.textContent = `Probing ${ip}…`; }

  ffgScanLogPush("info", `Manual probe: ${ip}…`);
  const c = await ffgProbeIp(ip, { logPush: ffgScanLogPush });

  btn.disabled = false;

  if (c) {
    ffgAbortScan();
    _closePanel("ffgScanOverlay");
    ctx.openPrinterSettings("flashforge", null, {
      ip,
      printerName:  c.hostName || c.machineName || c.machineModel || `FlashForge ${ip}`,
      modelId:      c.modelId || ffgModelIdFromMachineModel(c.machineModel || ""),
      serialNumber: c.serialNumber || "",
      discovery:    ffgBuildDiscoveryRecord(c),
    });
  } else {
    ffgScanLogPush("warn", `No FlashForge response at ${ip}`);
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = `No FlashForge printer responded at ${ip}`;
    }
  }
}

// ── Manual panel logic ────────────────────────────────────────────────────────

/**
 * Probe the IP entered in the manual panel.
 * On success: close panel, open Printer Settings (prefilled).
 * On failure: show inline error.
 */
async function _handleManualProbe() {
  const input = document.getElementById("ffgManualIpInput");
  const errEl = document.getElementById("ffgManualIpError");
  const btn   = document.getElementById("ffgManualProbeBtn");
  if (!input) return;

  const ip      = input.value.trim();
  const validIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);

  if (!validIp) {
    if (errEl) {
      errEl.textContent = ctx.t("snapAddByIpInvalid") || "Invalid IP address format";
      errEl.hidden = false;
    }
    input.focus();
    return;
  }
  if (errEl) errEl.hidden = true;
  if (btn)   btn.disabled = true;

  const c = await ffgProbeIp(ip, { logPush: () => {} });

  if (btn) btn.disabled = false;

  if (c) {
    _closePanel("ffgManualOverlay");
    ctx.openPrinterSettings("flashforge", null, {
      ip,
      printerName:  c.hostName || c.machineName || c.machineModel || `FlashForge ${ip}`,
      modelId:      c.modelId || ffgModelIdFromMachineModel(c.machineModel || ""),
      serialNumber: c.serialNumber || "",
      discovery:    ffgBuildDiscoveryRecord(c),
    });
  } else {
    if (errEl) {
      errEl.textContent = `No FlashForge printer responded at ${ip}`;
      errEl.hidden = false;
    }
  }
}

function _openManualPanel() {
  _ensureDOM();
  const input = document.getElementById("ffgManualIpInput");
  const errEl = document.getElementById("ffgManualIpError");
  if (input) input.value = "";
  if (errEl) errEl.hidden = true;
  _openPanel("ffgManualOverlay");
  setTimeout(() => input?.focus(), 80);
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Open the FlashForge add-printer flow.
 * Called from the brand picker in inventory.js when the user selects FlashForge.
 * Creates the DOM lazily on first call, then shows the Choice modal.
 */
export function openFfgAddFlow() {
  _ensureDOM();
  _openPanel("ffgChoiceOverlay");
}
