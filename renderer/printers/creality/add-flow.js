/**
 * printers/creality/add-flow.js — Creality "add printer" UI flow.
 *
 * Owns the three panels of the add sequence:
 *   1. Choice modal  — Scan vs Manual Add.
 *   2. Scan panel    — live LAN scanner with result cards.
 *   3. Manual modal  — direct IP entry + WebSocket probe.
 *
 * Network / data work (TCP+WS probing, scanning, serialisation) lives in
 * probe.js so this file stays focused on DOM and UX. Structure mirrors
 * flashforge/add-flow.js — almost all UI strings reuse the shared snap*
 * i18n keys; only the brand title + empty state are Creality-specific.
 *
 * Entry point: openCreAddFlow() — called from the brand picker in inventory.js.
 *
 * Callbacks into inventory.js go through ctx (printers/context.js) to avoid
 * circular imports.
 */

import { ctx } from '../context.js';
import * as extraSubnets from '../extra-subnets.js';
import {
  creProbeIp,
  creScanLan,
  creBuildDiscoveryRecord,
  creModelIdFromModel,
  getLastCreScanEnv,
} from './probe.js';

// ── Scan log subsystem ────────────────────────────────────────────────────────
// Lightweight ring-buffer that records probe events for the user / support.
// Mirrors the one in flashforge/add-flow.js.

let _creScanLog = [];

function creScanLogPush(kind, summary, raw) {
  _creScanLog.push({ ts: Date.now(), kind, summary, raw: raw ?? null });

  const body = document.getElementById("creScanLogBody");
  if (!body || body.hidden) {
    const count = document.getElementById("creScanLogCount");
    if (count) count.textContent = String(_creScanLog.length);
    return;
  }
  const row = document.createElement("div");
  row.className = `snap-scan-log-row snap-scan-log-row--${kind}`;
  row.innerHTML = `
    <span class="snap-scan-log-ts">${ctx.esc(String(_creScanLog.length))}</span>
    <span class="snap-scan-log-kind">${ctx.esc(kind)}</span>
    <span class="snap-scan-log-summary">${ctx.esc(summary)}</span>`;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;

  const count = document.getElementById("creScanLogCount");
  if (count) count.textContent = String(_creScanLog.length);
}

function creScanLogClear() {
  _creScanLog = [];
  const body = document.getElementById("creScanLogBody");
  if (body) body.innerHTML = "";
  const count = document.getElementById("creScanLogCount");
  if (count) count.textContent = "0";
}

// ── Extra subnets subsystem ───────────────────────────────────────────────────
// Power-user feature: additional /24 prefixes to include in the scan.
// Persisted in localStorage (keyed globally, not per-account) so the list
// survives a "Restart scan" and an app relaunch — it describes the user's
// network topology, which is independent of the signed-in account.

// Shared with all brand scan modals via printers/extra-subnets.js
// (Firestore-synced). This file just adapts the shared store to Creality's
// UI ids.
function creLoadExtraSubnets() { return extraSubnets.loadList(); }

let _creChipsUnsub = null;
function _renderExtraSubnetChips() {
  if (_creChipsUnsub) { _creChipsUnsub(); _creChipsUnsub = null; }
  _creChipsUnsub = extraSubnets.renderChipsInto("creExtraSubnetsChips", ctx.esc, ctx.t);
}

// ── Scan state ────────────────────────────────────────────────────────────────

let _creScanCtl = null; // AbortController for the running scan

function creAbortScan() {
  if (_creScanCtl && !_creScanCtl.signal.aborted) _creScanCtl.abort();
}

// ── Candidate card ────────────────────────────────────────────────────────────

/**
 * Build the HTML for one discovered-printer card. All printer-reported values
 * are escaped — they come from the WebSocket handshake and are untrusted.
 * Returns an HTML string; the caller wraps it in a <div> and extracts
 * firstElementChild to wire click/keydown (flex-on-button rendering quirk).
 *
 * @param {object} c  Candidate from creScanLan / creProbeIp.
 * @returns {string}
 */
function _creCandidateCardHtml(c) {
  const modelId   = c.modelId || creModelIdFromModel(c.model, c.hostName);
  const matched   = ctx.findPrinterModel("creality", modelId);
  const fallback  = ctx.findPrinterModel("creality", "0");
  const modelName = matched && String(matched.id) !== "0" ? matched.name : null;
  const title     = c.hostName || modelName || c.model || c.ip;
  const modelLine = modelName && modelName !== title ? modelName
                  : (c.model && c.model !== title ? c.model : "");
  const snLine    = c.deviceSn ? `SN · ${c.deviceSn}` : "";

  const imgUrl    = ctx.printerImageUrl(matched) || ctx.printerImageUrl(fallback);
  const thumbHtml = imgUrl
    ? `<img src="${ctx.esc(imgUrl)}" alt="" onerror="this.style.opacity='.15'"/>` : "";

  return `
    <div class="snap-scan-card" role="button" tabindex="0" data-ip="${ctx.esc(c.ip)}">
      <span class="snap-scan-card-thumb">${thumbHtml}</span>
      <span class="snap-scan-card-main">
        <span class="snap-scan-card-title">
          <span class="snap-scan-card-title-text">${ctx.esc(title)}</span>
        </span>
        <span class="snap-scan-card-ip">${ctx.esc(c.ip)}</span>
        ${modelLine ? `<span class="snap-scan-card-line snap-scan-card-line--model">${ctx.esc(modelLine)}</span>` : ""}
        ${snLine    ? `<span class="snap-scan-card-line snap-scan-card-line--sn">${ctx.esc(snLine)}</span>` : ""}
      </span>
      <span class="icon icon-chevron-r icon-14 snap-scan-card-chev"></span>
    </div>`;
}

/** Open the Printer Settings add form prefilled from a candidate. */
function _continueWith(c) {
  const modelId = c.modelId || creModelIdFromModel(c.model, c.hostName);
  ctx.openPrinterSettings("creality", null, {
    ip:          c.ip,
    printerName: c.hostName || c.model || `Creality ${c.ip}`,
    modelId,
    discovery:   creBuildDiscoveryRecord(c),
  });
}

// ── Generic panel helpers ─────────────────────────────────────────────────────

function _openPanel(id)  { document.getElementById(id)?.classList.add("open"); }
function _closePanel(id) { document.getElementById(id)?.classList.remove("open"); }

/** Close all three Creality add-flow panels at once. */
function _closeAll() {
  creAbortScan();
  _closePanel("creChoiceOverlay");
  _closePanel("creScanOverlay");
  _closePanel("creManualOverlay");
}

// ── Lazy DOM creation ─────────────────────────────────────────────────────────

let _domReady = false;

function _ensureDOM() {
  if (_domReady) return;
  _domReady = true;

  const root = document.createElement("div");
  root.id = "creAddFlowRoot";
  root.innerHTML = /* html */`

<!-- ═══════════════════════════════════════════════════════════════════════════
     Creality — Choice modal (Scan vs Manual)
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="creChoiceOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">

    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="creAddChoiceTitle">Add Creality printer</div>
        <div class="pba-sub"   data-i18n="snapAddChoiceSub">How do you want to find your printer?</div>
      </div>
      <button class="modal-close" id="creChoiceClose">✕</button>
    </div>

    <div class="pba-brands">
      <button type="button" class="pba-brand" id="creChoiceScan">
        <span class="pba-brand-dot" style="background:#e22a2a"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceScan">Scan network</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceScanHint">Auto-discover printers on your LAN</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>

      <button type="button" class="pba-brand" id="creChoiceManual">
        <span class="pba-brand-dot" style="background:#e22a2a"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceManual">Enter IP address</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceManualHint">Manually enter the printer's local IP</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
    </div>

    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="creChoiceBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button type="button" class="pba-brand-tuto-link" disabled aria-disabled="true" data-i18n-title="tutoUnavailable">
        <span class="icon icon-bulb icon-13"></span>
        <span data-i18n="tutoOpenBtn">Connection tutorial</span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Creality — LAN Scan modal
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="creScanOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">

    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapScanTitle">Scanning network…</div>
        <div class="pba-sub" id="creScanSub"></div>
      </div>
      <button class="modal-close" id="creScanClose">✕</button>
    </div>

    <div class="snap-scan-body">

      <div class="snap-scan-progress">
        <div class="snap-scan-bar"><span id="creScanBar"></span></div>
        <div class="snap-scan-stats" id="creScanStats">0 / 0</div>
      </div>

      <!-- Add by IP — collapsible direct-probe shortcut -->
      <details class="snap-add-ip" id="creAddIpDetails">
        <summary class="snap-add-ip-summary">
          <span class="snap-add-ip-summary-icon icon icon-plus icon-13"></span>
          <span class="snap-add-ip-summary-label" data-i18n="snapAddByIpButton">Add by IP</span>
          <span class="snap-add-ip-chev icon icon-chevron-r icon-13"></span>
        </summary>
        <div class="snap-add-ip-body">
          <label class="snap-add-ip-label" data-i18n="snapAddByIpLabel">IP address</label>
          <span class="snap-add-ip-input-wrap">
            <input type="text" inputmode="decimal" class="snap-add-ip-input" id="creAddIpInput"
                   placeholder="192.168.1.50" autocomplete="off" autocapitalize="off"
                   spellcheck="false" maxlength="15"/>
            <span class="snap-add-ip-tip" id="creAddIpTip" hidden role="alert">
              <span class="icon icon-info icon-13"></span>
              <span data-i18n="snapAddByIpInvalid">Invalid IP address format</span>
            </span>
          </span>
          <button type="button" class="adf-btn adf-btn--primary snap-add-ip-btn"
                  id="creAddIpBtn" disabled>
            <span class="icon icon-check icon-13"></span>
            <span class="label" data-i18n="snapAddByIpValidate">Validate</span>
            <span class="spinner"></span>
          </button>
          <div class="snap-add-ip-status" id="creAddIpStatus" hidden></div>
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
            <input type="text" class="snap-extra-subnets-input" id="creExtraSubnetsInput"
                   placeholder="192.168.40" autocomplete="off" autocapitalize="off" spellcheck="false"/>
            <button type="button" class="snap-extra-subnets-add"
                    id="creExtraSubnetsAdd" data-i18n="snapScanExtraSubnetsAdd">Add</button>
          </div>
          <div class="snap-extra-subnets-err" id="creExtraSubnetsErr" hidden></div>
          <div class="snap-extra-subnets-chips" id="creExtraSubnetsChips"></div>
        </div>
      </details>

      <div class="snap-scan-results" id="creScanResults"></div>

      <div class="snap-scan-empty" id="creScanEmpty" hidden data-i18n="creScanEmpty">
        No Creality printers found on your LAN
      </div>

      <!-- Scan log — hidden by default, shown in debug mode -->
      <section class="snap-scan-log" id="creScanLog" hidden>
        <header class="snap-scan-log-head">
          <button type="button" class="snap-scan-log-toggle" id="creScanLogToggle"
                  aria-expanded="false" aria-label="Scan log" data-i18n-title="snapScanLogTitle"
                  title="Scan log">
            <span class="icon icon-chevron-r icon-13 snap-scan-log-chev"></span>
            <span class="icon icon-list icon-13 snap-scan-log-title-icon"></span>
            <span class="snap-scan-log-count" id="creScanLogCount">0</span>
          </button>
          <span class="snap-scan-log-actions">
            <button type="button"
                    class="snap-scan-log-btn snap-scan-log-btn--primary snap-scan-log-btn--icon"
                    id="creScanLogExport" data-i18n-title="snapScanLogExport"
                    aria-label="Export" title="Export">
              <span class="icon icon-copy icon-13"></span>
            </button>
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--icon"
                    id="creScanLogClear" data-i18n-title="snapScanLogClear"
                    aria-label="Clear" title="Clear">
              <span class="icon icon-trash icon-13"></span>
            </button>
          </span>
        </header>
        <div class="snap-scan-log-body" id="creScanLogBody" hidden></div>
      </section>

    </div><!-- /snap-scan-body -->

    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="creScanBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--secondary" id="creScanRestart">
        <span class="icon icon-refresh icon-13"></span>
        <span data-i18n="snapScanRestart">Restart scan</span>
      </button>
    </div>

  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Creality — Manual IP entry modal
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="creManualOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">

    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapManualTitle">Manual add</div>
        <div class="pba-sub"   data-i18n="snapManualSub">Type the printer's local IP — we'll probe it to pre-fill the rest.</div>
      </div>
      <button class="modal-close" id="creManualClose">✕</button>
    </div>

    <div class="pba-body">
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="printerLblIP">
          IP address <span class="pba-field-req">*</span>
        </span>
        <input type="text" id="creManualIpInput" class="pba-input pba-input--mono"
               placeholder="192.168.1.50" maxlength="15"
               spellcheck="false" autocomplete="off" autocapitalize="off"/>
        <div class="pba-error" id="creManualIpError" hidden></div>
      </div>
    </div>

    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="creManualBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--primary" id="creManualProbeBtn">
        <span class="icon icon-check icon-13"></span>
        <span class="label" data-i18n="snapManualProbe">Probe + continue</span>
        <span class="spinner"></span>
      </button>
    </div>

  </div>
</div>
`;
  document.body.appendChild(root);
  _wireDOM();
  // applyTranslations() ran at startup before this DOM existed — re-run it so
  // the freshly-injected [data-i18n] elements are translated immediately.
  ctx.applyTranslations();
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function _wireDOM() {
  const $ = id => document.getElementById(id);

  // ── Choice modal ──────────────────────────────────────────────────────────
  $("creChoiceClose")?.addEventListener("click", _closeAll);
  $("creChoiceOverlay")?.addEventListener("click", e => {
    if (e.target.id === "creChoiceOverlay") _closeAll();
  });
  $("creChoiceBack")?.addEventListener("click", () => {
    _closePanel("creChoiceOverlay");
    ctx.openBrandPicker();
  });
  $("creChoiceScan")?.addEventListener("click", () => {
    _closePanel("creChoiceOverlay");
    _openScanPanel();
  });
  $("creChoiceManual")?.addEventListener("click", () => {
    _closePanel("creChoiceOverlay");
    _openManualPanel();
  });

  // ── Scan modal ────────────────────────────────────────────────────────────
  $("creScanClose")?.addEventListener("click", _closeAll);
  $("creScanOverlay")?.addEventListener("click", e => {
    if (e.target.id === "creScanOverlay") _closeAll();
  });
  $("creScanBack")?.addEventListener("click", () => {
    creAbortScan();
    _closePanel("creScanOverlay");
    _openPanel("creChoiceOverlay");
  });
  $("creScanRestart")?.addEventListener("click", () => {
    creAbortScan();
    _openScanPanel();
  });

  // Add-by-IP: enable Validate only on a well-formed IPv4.
  const addIpInput = $("creAddIpInput");
  const addIpBtn   = $("creAddIpBtn");
  const addIpTip   = $("creAddIpTip");
  if (addIpInput) {
    addIpInput.addEventListener("input", () => {
      const valid = /^\d{1,3}(\.\d{1,3}){3}$/.test(addIpInput.value.trim());
      if (addIpBtn) addIpBtn.disabled = !valid;
      if (addIpTip) addIpTip.hidden   = valid || !addIpInput.value;
    });
    addIpInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !addIpBtn?.disabled) _handleAddByIp();
    });
    $("creAddIpDetails")?.addEventListener("toggle", e => {
      if (!e.target.open) {
        addIpInput.value = "";
        if (addIpBtn) addIpBtn.disabled = true;
        if (addIpTip) addIpTip.hidden   = true;
        const status = $("creAddIpStatus");
        if (status) { status.hidden = true; status.textContent = ""; }
      }
    });
  }
  $("creAddIpBtn")?.addEventListener("click", _handleAddByIp);

  // Extra subnets — shared store handles validation + dedup
  $("creExtraSubnetsAdd")?.addEventListener("click", () => {
    const input = $("creExtraSubnetsInput");
    if (!input) return;
    if (extraSubnets.addPrefix(input.value)) input.value = "";
  });
  $("creExtraSubnetsInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") $("creExtraSubnetsAdd")?.click();
  });

  // Scan log — toggle collapse
  $("creScanLogToggle")?.addEventListener("click", () => {
    const body   = $("creScanLogBody");
    const toggle = $("creScanLogToggle");
    if (!body || !toggle) return;
    const open = body.hidden;
    body.hidden = !open;
    toggle.classList.toggle("snap-scan-log-toggle--open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  // Scan log — export
  $("creScanLogExport")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({
      log:         _creScanLog,
      environment: getLastCreScanEnv(),
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = `cre-scan-${Date.now()}.json`;
    a.click();
  });
  // Scan log — clear
  $("creScanLogClear")?.addEventListener("click", creScanLogClear);

  // ── Manual modal ──────────────────────────────────────────────────────────
  $("creManualClose")?.addEventListener("click", _closeAll);
  $("creManualOverlay")?.addEventListener("click", e => {
    if (e.target.id === "creManualOverlay") _closeAll();
  });
  $("creManualBack")?.addEventListener("click", () => {
    _closePanel("creManualOverlay");
    _openPanel("creChoiceOverlay");
  });
  $("creManualProbeBtn")?.addEventListener("click", _handleManualProbe);
  $("creManualIpInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") _handleManualProbe();
  });
}

// ── Scan panel logic ──────────────────────────────────────────────────────────

function _openScanPanel() {
  _ensureDOM();

  const results = document.getElementById("creScanResults");
  const empty   = document.getElementById("creScanEmpty");
  const bar     = document.getElementById("creScanBar");
  const stats   = document.getElementById("creScanStats");
  const sub     = document.getElementById("creScanSub");
  if (results) results.innerHTML = "";
  if (empty)   empty.hidden = true;
  if (bar)     bar.style.width = "0%";
  if (stats)   stats.textContent = "0 / 0";
  if (sub)     sub.textContent = ctx.t("snapScanStarting") || "Starting scan…";

  creScanLogClear();
  // Render the persisted extra-subnet chips — never reset them on restart.
  _renderExtraSubnetChips();

  // Show/hide the scan log section based on debug mode.
  const logSection = document.getElementById("creScanLog");
  if (logSection) logSection.hidden = !ctx.isDebugEnabled();

  // Collapse the Add-by-IP panel on restart.
  const ipDetails = document.getElementById("creAddIpDetails");
  if (ipDetails) ipDetails.open = false;

  _openPanel("creScanOverlay");

  _creScanCtl  = new AbortController();
  const signal = _creScanCtl.signal;
  let found = 0;
  let total = 0;

  creScanLan({
    signal,
    logPush:         creScanLogPush,
    getExtraSubnets: creLoadExtraSubnets,

    onCandidate(c) {
      found++;
      if (empty) empty.hidden = true;

      const wrap = document.createElement("div");
      wrap.innerHTML = _creCandidateCardHtml(c);
      const card = wrap.firstElementChild;
      if (!card) return;

      const triggerAdd = () => {
        creAbortScan();
        _closePanel("creScanOverlay");
        _continueWith(c);
      };
      card.addEventListener("click", triggerAdd);
      card.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); triggerAdd(); }
      });

      document.getElementById("creScanResults")?.appendChild(card);
    },

    onProgress({ done: d, total: t }) {
      total = t;
      const pct = t > 0 ? Math.round((d / t) * 100) : 0;
      if (bar)   bar.style.width   = `${Math.min(pct, 100)}%`;
      if (stats) stats.textContent = `${d} / ${t}`;
    },

  }).then(() => {
    if (bar)   bar.style.width = "100%";
    if (stats && total > 0) stats.textContent = `${total} / ${total}`;
    if (sub)   sub.textContent = "";

    if (!signal.aborted && found === 0) {
      if (empty) empty.hidden = false;
      creScanLogPush("warn", "Scan complete — no Creality printers found");
    } else if (!signal.aborted) {
      creScanLogPush("info", `Scan complete — ${found} printer(s) found`);
    }
  }).catch(e => {
    if (e?.name !== "AbortError") {
      creScanLogPush("err", `Scan error: ${e?.message || e}`);
    }
  });
}

// ── Add-by-IP handler ─────────────────────────────────────────────────────────

async function _handleAddByIp() {
  const input    = document.getElementById("creAddIpInput");
  const btn      = document.getElementById("creAddIpBtn");
  const statusEl = document.getElementById("creAddIpStatus");
  if (!input || !btn) return;

  const ip = input.value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return;

  btn.disabled = true;
  btn.classList.add("loading");
  if (statusEl) { statusEl.hidden = false; statusEl.textContent = ctx.t("snapManualProbing", { ip }) || `Reaching ${ip}…`; }

  creScanLogPush("info", `Manual probe: ${ip}…`);
  const c = await creProbeIp(ip, undefined, { logPush: creScanLogPush, directWs: true });

  btn.disabled = false;
  btn.classList.remove("loading");

  if (c) {
    creAbortScan();
    _closePanel("creScanOverlay");
    _continueWith(c);
  } else {
    creScanLogPush("warn", `No Creality response at ${ip}`);
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = ctx.t("snapManualNoReply", { ip }) || `No reply from ${ip}.`;
    }
  }
}

// ── Manual panel logic ────────────────────────────────────────────────────────

async function _handleManualProbe() {
  const input = document.getElementById("creManualIpInput");
  const errEl = document.getElementById("creManualIpError");
  const btn   = document.getElementById("creManualProbeBtn");
  if (!input) return;

  const ip = input.value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    if (errEl) {
      errEl.textContent = ctx.t("snapAddByIpInvalid") || "Invalid IP address format";
      errEl.hidden = false;
    }
    input.focus();
    return;
  }
  if (errEl) errEl.hidden = true;
  if (btn)  { btn.disabled = true; btn.classList.add("loading"); }

  const c = await creProbeIp(ip, undefined, { logPush: () => {}, directWs: true });

  if (btn) { btn.disabled = false; btn.classList.remove("loading"); }

  if (c) {
    _closePanel("creManualOverlay");
    _continueWith(c);
  } else if (errEl) {
    errEl.textContent = ctx.t("snapManualNoReply", { ip }) || `No reply from ${ip}.`;
    errEl.hidden = false;
  }
}

function _openManualPanel() {
  _ensureDOM();
  const input = document.getElementById("creManualIpInput");
  const errEl = document.getElementById("creManualIpError");
  if (input) input.value = "";
  if (errEl) errEl.hidden = true;
  _openPanel("creManualOverlay");
  setTimeout(() => input?.focus(), 80);
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Open the Creality add-printer flow.
 * Called from the brand picker in inventory.js when the user selects Creality.
 * Creates the DOM lazily on first call, then shows the Choice modal.
 */
export function openCreAddFlow() {
  _ensureDOM();
  _openPanel("creChoiceOverlay");
}
