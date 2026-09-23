/**
 * printers/bambulab/add-flow.js — Bambu Lab "add printer" UI flow.
 *
 * Owns the three panels of the add sequence:
 *   1. Choice modal  — Scan vs Manual Add.
 *   2. Scan panel    — SSDP discovery on the LAN with one-click add.
 *   3. Manual modal  — direct IP entry + TLS cert sniff confirmation.
 *
 * Network / data work (SSDP, TLS) lives in probe.js. Structure mirrors
 * flashforge/add-flow.js and creality/add-flow.js — almost all UI strings
 * reuse the shared `snap*` i18n keys; only the brand title + empty state
 * are Bambu-specific.
 *
 * Entry point: openBblAddFlow() — called from the brand picker in inventory.js.
 *
 * NOTE: Bambu discovery is SSDP multicast, which does not depend on a per-/24
 * prefix list — the "extra subnets" power-user widget therefore isn't shown
 * here (unlike the unicast scans of Snapmaker / FlashForge / Creality / Elegoo).
 */

import { ctx } from '../context.js';
import { createScanPicker } from '../scan-pick.js';
import * as extraSubnets from '../extra-subnets.js';
import {
  bambuProbeIp,
  bambuScanLan,
  bambuBuildDiscoveryRecord,
  bambuModelIdFromCode,
  getLastBblScanEnv,
} from './probe.js';

// ── Scan log ─────────────────────────────────────────────────────────────────

let _bblScanLog = [];

function bblScanLogPush(kind, summary, raw) {
  _bblScanLog.push({ ts: Date.now(), kind, summary, raw: raw ?? null });

  const body = document.getElementById('bblScanLogBody');
  if (!body || body.hidden) {
    const count = document.getElementById('bblScanLogCount');
    if (count) count.textContent = String(_bblScanLog.length);
    return;
  }
  const row = document.createElement('div');
  row.className = `snap-scan-log-row snap-scan-log-row--${kind}`;
  row.innerHTML = `
    <span class="snap-scan-log-ts">${ctx.esc(String(_bblScanLog.length))}</span>
    <span class="snap-scan-log-kind">${ctx.esc(kind)}</span>
    <span class="snap-scan-log-summary">${ctx.esc(summary)}</span>`;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;

  const count = document.getElementById('bblScanLogCount');
  if (count) count.textContent = String(_bblScanLog.length);
}

function bblScanLogClear() {
  _bblScanLog = [];
  const body = document.getElementById('bblScanLogBody');
  if (body) body.innerHTML = '';
  const count = document.getElementById('bblScanLogCount');
  if (count) count.textContent = '0';
}

// ── Scan state ───────────────────────────────────────────────────────────────

let _bblScanCtl = null;
// Subscription handle for the live chip list bound to the shared extra-subnets
// store. Released on each scan restart so we don't leak subscribers.
let _bblChipsUnsub = null;

function bblAbortScan() {
  if (_bblScanCtl && !_bblScanCtl.signal.aborted) _bblScanCtl.abort();
}

// ── Candidate card ───────────────────────────────────────────────────────────

function _bblCandidateCardHtml(c) {
  const modelId   = c.modelId || bambuModelIdFromCode(c.model, c.serial);
  const matched   = ctx.findPrinterModel('bambulab', modelId);
  const fallback  = ctx.findPrinterModel('bambulab', '0');
  const modelName = matched && String(matched.id) !== '0' ? matched.name : null;
  const title     = c.name || modelName || c.serial || c.ip;
  const modelLine = modelName && modelName !== title ? modelName
                  : (c.model && c.model !== title ? c.model : '');
  const snLine    = c.serial ? `SN · ${c.serial}` : '';

  const imgUrl    = ctx.printerImageUrl(matched) || ctx.printerImageUrl(fallback);
  const thumbHtml = imgUrl
    ? `<img src="${ctx.esc(imgUrl)}" alt="" onerror="this.style.opacity='.15'"/>` : '';

  return `
    <div class="snap-scan-card" role="button" tabindex="0" data-ip="${ctx.esc(c.ip || '')}">
      <span class="snap-scan-card-thumb">${thumbHtml}</span>
      <span class="snap-scan-card-main">
        <span class="snap-scan-card-title">
          <span class="snap-scan-card-title-text">${ctx.esc(title)}</span>
        </span>
        <span class="snap-scan-card-ip">${ctx.esc(c.ip || '')}</span>
        ${modelLine ? `<span class="snap-scan-card-line snap-scan-card-line--model">${ctx.esc(modelLine)}</span>` : ''}
        ${snLine    ? `<span class="snap-scan-card-line snap-scan-card-line--sn">${ctx.esc(snLine)}</span>` : ''}
      </span>
      <span class="icon icon-chevron-r icon-14 snap-scan-card-chev"></span>
    </div>`;
}

/** The Printer Settings prefill for a candidate. */
function _prefillFor(c) {
  const modelId = c.modelId || bambuModelIdFromCode(c.model, c.serial);
  // Bambu form uses `broker` (not `ip`) as the IP field key. The generalised
  // schemaWidget prefill maps any schema field key from the prefill payload.
  return {
    broker:       c.ip || '',
    serialNumber: c.serial || '',
    printerName:  c.name || (c.serial ? `Bambu ${c.serial}` : `Bambu ${c.ip || ''}`),
    modelId,
    discovery:    bambuBuildDiscoveryRecord(c),
  };
}

/** Open the Printer Settings add form prefilled from a candidate. */
function _continueWith(c) {
  ctx.openPrinterSettings('bambulab', null, _prefillFor(c));
}

/* Scan results are tickable: one → the prefilled form, several → added in
   one go (printers/scan-pick.js). */
const _bblScanPick = createScanPicker({
  ctx, brand: 'bambulab', resultsId: 'bblScanResults',
  prefillFor: _prefillFor,
  onSingle: c => { bblAbortScan(); _closePanel('bblScanOverlay'); _continueWith(c); },
  beforeAdd: bblAbortScan,
});

// ── Generic panel helpers ────────────────────────────────────────────────────

function _openPanel(id)  { document.getElementById(id)?.classList.add('open'); }
function _closePanel(id) { document.getElementById(id)?.classList.remove('open'); }

function _closeAll() {
  bblAbortScan();
  _closePanel('bblChoiceOverlay');
  _closePanel('bblScanOverlay');
  _closePanel('bblManualOverlay');
  _closePanel('bblCloudOverlay');
}

// ── Lazy DOM creation ────────────────────────────────────────────────────────

let _domReady = false;

function _ensureDOM() {
  if (_domReady) return;
  _domReady = true;

  const root = document.createElement('div');
  root.id = 'bblAddFlowRoot';
  root.innerHTML = /* html */`

<!-- ═══════════════════════════════════════════════════════════════════════════
     Bambu Lab — Cloud sign-in (email + code → the account's machines)
     One screen, two steps: the code field and the sign-in key only appear once a
     code has actually been sent, so the panel opens asking exactly one thing.
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="bblCloudOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="bblCloudTitle">Sign in to Bambu Lab</div>
        <div class="pba-sub"   data-i18n="bblCloudSub">Your email, a code, and your printers show up.</div>
      </div>
      <button class="modal-close" id="bblCloudClose">✕</button>
    </div>
    <div class="snap-scan-body bbl-cloud-body">
      <div class="bbl-cloud-form" id="bblCloudEmailRow">
        <div class="bbl-cloud-region-row">
          <span class="bbl-cloud-region-lbl" id="bblCloudRegionLbl" data-i18n="bblCloudRegionLabel">Account region</span>
          <div class="bbl-cloud-region" id="bblCloudRegion" role="radiogroup" aria-labelledby="bblCloudRegionLbl">
            <button type="button" class="bbl-cloud-region-opt is-active" data-region="us"
                    role="radio" aria-checked="true" data-i18n="bblCloudRegionGlobal">Global</button>
            <button type="button" class="bbl-cloud-region-opt" data-region="cn"
                    role="radio" aria-checked="false" data-i18n="bblCloudRegionChina">China mainland</button>
          </div>
        </div>
        <input type="text" class="snap-add-ip-input bbl-cloud-input" id="bblCloudEmail"
               autocomplete="username" spellcheck="false" data-i18n-placeholder="bblCloudEmailPh">
        <button type="button" class="adf-btn adf-btn--primary" id="bblCloudSendCode"
                data-i18n="bblCloudSendCode">Send me a code</button>
      </div>
      <div class="bbl-cloud-sent" id="bblCloudSentRow" hidden>
        <span class="bbl-cloud-sent-addr" id="bblCloudSentAddr"></span>
        <button type="button" class="bbl-cloud-change" id="bblCloudChange"
                data-i18n="bblCloudChangeEmail">Change</button>
      </div>
      <div class="bbl-cloud-form" id="bblCloudCodeRow" hidden>
        <input type="text" class="snap-add-ip-input bbl-cloud-input" id="bblCloudCode"
               inputmode="numeric" autocomplete="one-time-code" spellcheck="false"
               data-i18n-placeholder="bblCloudCodePh">
        <button type="button" class="adf-btn adf-btn--primary" id="bblCloudSignIn"
                data-i18n="bblCloudSignIn">Sign in</button>
      </div>
      <div class="bbl-cloud-note" id="bblCloudNote" hidden></div>
      <div class="bbl-cloud-pick" id="bblCloudPick" hidden data-i18n="bblCloudPick">Pick the ones you want</div>
      <div class="snap-scan-results" id="bblCloudResults"></div>
      <div class="bbl-cloud-raw" id="bblCloudRaw" hidden></div>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="bblCloudBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button type="button" class="adf-btn adf-btn--primary" id="bblCloudAddBtn" hidden>
        <span class="icon icon-plus icon-13"></span>
        <span class="label"></span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Bambu Lab — Choice modal (Scan vs Manual)
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="bblChoiceOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="bambuAddChoiceTitle">Add Bambu Lab printer</div>
        <div class="pba-sub"   data-i18n="snapAddChoiceSub">How do you want to find your printer?</div>
      </div>
      <button class="modal-close" id="bblChoiceClose">✕</button>
    </div>
    <div class="pba-brands">
      <button type="button" class="pba-brand" id="bblChoiceCloud">
        <span class="pba-brand-dot" style="background:#1ba84e"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="bblCloudChoice">Use my Bambu Lab account</span>
          <span class="pba-brand-conn"  data-i18n="bblCloudChoiceHint">Finds all your printers on their own</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
      <button type="button" class="pba-brand" id="bblChoiceScan">
        <span class="pba-brand-dot" style="background:#1ba84e"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceScan">Scan network</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceScanHint">Auto-discover printers on your LAN</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
      <button type="button" class="pba-brand" id="bblChoiceManual">
        <span class="pba-brand-dot" style="background:#1ba84e"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceManual">Enter IP address</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceManualHint">Manually enter the printer's local IP</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="bblChoiceBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button type="button" class="pba-brand-tuto-link" id="bblChoiceTuto">
        <span class="icon icon-bulb icon-13"></span>
        <span data-i18n="tutoOpenBtn">Connection tutorial</span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Bambu Lab — LAN Scan modal (SSDP)
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="bblScanOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapScanTitle">Scanning network…</div>
        <div class="pba-sub" id="bblScanSub"></div>
      </div>
      <button class="modal-close" id="bblScanClose">✕</button>
    </div>
    <div class="snap-scan-body">

      <div class="snap-scan-progress">
        <div class="snap-scan-bar"><span id="bblScanBar"></span></div>
        <div class="snap-scan-stats" id="bblScanStats">0 / 100</div>
      </div>

      <details class="snap-add-ip" id="bblAddIpDetails">
        <summary class="snap-add-ip-summary">
          <span class="snap-add-ip-summary-icon icon icon-plus icon-13"></span>
          <span class="snap-add-ip-summary-label" data-i18n="snapAddByIpButton">Add by IP</span>
          <span class="snap-add-ip-chev icon icon-chevron-r icon-13"></span>
        </summary>
        <div class="snap-add-ip-body">
          <label class="snap-add-ip-label" data-i18n="snapAddByIpLabel">IP address</label>
          <span class="snap-add-ip-input-wrap">
            <input type="text" inputmode="decimal" class="snap-add-ip-input" id="bblAddIpInput"
                   placeholder="192.168.1.42" autocomplete="off" autocapitalize="off"
                   spellcheck="false" maxlength="15"/>
            <span class="snap-add-ip-tip" id="bblAddIpTip" hidden role="alert">
              <span class="icon icon-info icon-13"></span>
              <span data-i18n="snapAddByIpInvalid">Invalid IP address format</span>
            </span>
          </span>
          <button type="button" class="adf-btn adf-btn--primary snap-add-ip-btn"
                  id="bblAddIpBtn" disabled>
            <span class="icon icon-check icon-13"></span>
            <span class="label" data-i18n="snapAddByIpValidate">Validate</span>
            <span class="spinner"></span>
          </button>
          <div class="snap-add-ip-status" id="bblAddIpStatus" hidden></div>
        </div>
      </details>

      <!-- Extra subnets — shared across all brand scan modals via
           printers/extra-subnets.js. Note: Bambu's SSDP multicast discovery
           is link-local by nature so adding /24 prefixes here mostly serves
           as a way to manage the *shared* list from this modal (the prefix
           will then be honoured the next time the user scans Snapmaker /
           Creality / Elegoo / FlashForge). Kept here for consistency. -->
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
            <input type="text" class="snap-extra-subnets-input" id="bblExtraSubnetsInput"
                   placeholder="192.168.40" autocomplete="off" autocapitalize="off" spellcheck="false"/>
            <button type="button" class="snap-extra-subnets-add"
                    id="bblExtraSubnetsAdd" data-i18n="snapScanExtraSubnetsAdd">Add</button>
          </div>
          <div class="snap-extra-subnets-err" id="bblExtraSubnetsErr" hidden></div>
          <div class="snap-extra-subnets-chips" id="bblExtraSubnetsChips"></div>
        </div>
      </details>

      <div class="snap-scan-results" id="bblScanResults"></div>

      <div class="snap-scan-empty" id="bblScanEmpty" hidden data-i18n="bambuScanEmpty">
        No Bambu Lab printers found on your LAN
      </div>

      <section class="snap-scan-log" id="bblScanLog" hidden>
        <header class="snap-scan-log-head">
          <button type="button" class="snap-scan-log-toggle" id="bblScanLogToggle"
                  aria-expanded="false" aria-label="Scan log" data-i18n-title="snapScanLogTitle"
                  title="Scan log">
            <span class="icon icon-chevron-r icon-13 snap-scan-log-chev"></span>
            <span class="icon icon-list icon-13 snap-scan-log-title-icon"></span>
            <span class="snap-scan-log-count" id="bblScanLogCount">0</span>
          </button>
          <span class="snap-scan-log-actions">
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--primary snap-scan-log-btn--icon"
                    id="bblScanLogExport" data-i18n-title="snapScanLogExport" aria-label="Export" title="Export">
              <span class="icon icon-copy icon-13"></span>
            </button>
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--icon"
                    id="bblScanLogClear" data-i18n-title="snapScanLogClear" aria-label="Clear" title="Clear">
              <span class="icon icon-trash icon-13"></span>
            </button>
          </span>
        </header>
        <div class="snap-scan-log-body" id="bblScanLogBody" hidden></div>
      </section>

    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="bblScanBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--secondary" id="bblScanRestart">
        <span class="icon icon-refresh icon-13"></span>
        <span data-i18n="snapScanRestart">Restart scan</span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Bambu Lab — Manual IP entry modal
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="bblManualOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapManualTitle">Manual add</div>
        <div class="pba-sub"   data-i18n="snapManualSub">Type the printer's local IP — we'll probe it to pre-fill the rest.</div>
      </div>
      <button class="modal-close" id="bblManualClose">✕</button>
    </div>
    <div class="pba-body">
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="printerLblIP">
          IP address <span class="pba-field-req">*</span>
        </span>
        <input type="text" id="bblManualIpInput" class="pba-input pba-input--mono"
               placeholder="192.168.1.42" maxlength="15"
               spellcheck="false" autocomplete="off" autocapitalize="off"/>
        <div class="pba-error" id="bblManualIpError" hidden></div>
      </div>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="bblManualBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--primary" id="bblManualProbeBtn">
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
  ctx.applyTranslations();
}

// ── Event wiring ─────────────────────────────────────────────────────────────

function _wireDOM() {
  const $ = id => document.getElementById(id);

  $('bblChoiceClose')?.addEventListener('click', _closeAll);
  $('bblChoiceOverlay')?.addEventListener('click', e => { if (e.target.id === 'bblChoiceOverlay') _closeAll(); });
  $('bblChoiceBack')?.addEventListener('click', () => { _closePanel('bblChoiceOverlay'); ctx.openBrandPicker(); });
  $('bblChoiceTuto')?.addEventListener('click', () => ctx.openTutorial('bambulab'));
  $('bblChoiceScan')?.addEventListener('click', () => { _closePanel('bblChoiceOverlay'); _openScanPanel(); });
  $('bblChoiceManual')?.addEventListener('click', () => { _closePanel('bblChoiceOverlay'); _openManualPanel(); });
  $('bblChoiceCloud')?.addEventListener('click', () => { _closePanel('bblChoiceOverlay'); _openCloudPanel(); });

  $('bblCloudClose')?.addEventListener('click', _closeAll);
  $('bblCloudOverlay')?.addEventListener('click', e => { if (e.target.id === 'bblCloudOverlay') _closeAll(); });
  $('bblCloudBack')?.addEventListener('click', () => { _closePanel('bblCloudOverlay'); _openPanel('bblChoiceOverlay'); });
  $('bblCloudSendCode')?.addEventListener('click', _bblCloudSendCode);
  $('bblCloudSignIn')?.addEventListener('click', _bblCloudSignIn);
  $('bblCloudAddBtn')?.addEventListener('click', _bblCloudAddPicked);
  $('bblCloudChange')?.addEventListener('click', () => {
    _bblCloudStep(1); _bblCloudNote(null); $('bblCloudEmail')?.focus();
  });
  /* Enter carries on from whichever field the user is in — asking for a code,
     then signing in. Typing a code and pressing Enter is the whole gesture. */
  $('bblCloudEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); _bblCloudSendCode(); } });
  $('bblCloudRegion')?.addEventListener('click', e => {
    const opt = e.target.closest('[data-region]');
    if (opt) { _bblCloudSetRegion(opt.dataset.region); $('bblCloudEmail')?.focus(); }
  });
  /* A phone number only signs in on the China platform, so typing one moves
     the switch there by itself rather than letting the user hit a wall. */
  $('bblCloudEmail')?.addEventListener('input', e => {
    // Typing again is fixing it: drop the complaint.
    if (e.target.classList.contains('is-invalid')) { e.target.classList.remove('is-invalid'); _bblCloudNote(null); }
    if (_bblCloudPhone(e.target.value)) _bblCloudSetRegion('cn');
  });
  $('bblCloudCode')?.addEventListener('keydown',  e => { if (e.key === 'Enter') { e.preventDefault(); _bblCloudSignIn();  } });

  $('bblScanClose')?.addEventListener('click', _closeAll);
  $('bblScanOverlay')?.addEventListener('click', e => { if (e.target.id === 'bblScanOverlay') _closeAll(); });
  $('bblScanBack')?.addEventListener('click', () => { bblAbortScan(); _closePanel('bblScanOverlay'); _openPanel('bblChoiceOverlay'); });
  $('bblScanRestart')?.addEventListener('click', () => { bblAbortScan(); _openScanPanel(); });

  const addIpInput = $('bblAddIpInput');
  const addIpBtn   = $('bblAddIpBtn');
  const addIpTip   = $('bblAddIpTip');
  if (addIpInput) {
    addIpInput.addEventListener('input', () => {
      const valid = /^\d{1,3}(\.\d{1,3}){3}$/.test(addIpInput.value.trim());
      if (addIpBtn) addIpBtn.disabled = !valid;
      if (addIpTip) addIpTip.hidden   = valid || !addIpInput.value;
    });
    addIpInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !addIpBtn?.disabled) _handleAddByIp();
    });
    $('bblAddIpDetails')?.addEventListener('toggle', e => {
      if (!e.target.open) {
        addIpInput.value = '';
        if (addIpBtn) addIpBtn.disabled = true;
        if (addIpTip) addIpTip.hidden   = true;
        const status = $('bblAddIpStatus');
        if (status) { status.hidden = true; status.textContent = ''; }
      }
    });
  }
  $('bblAddIpBtn')?.addEventListener('click', _handleAddByIp);

  // Extra subnets — shared store (printers/extra-subnets.js)
  $('bblExtraSubnetsAdd')?.addEventListener('click', () => {
    const input = $('bblExtraSubnetsInput');
    if (!input) return;
    if (extraSubnets.addPrefix(input.value)) input.value = '';
  });
  $('bblExtraSubnetsInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('bblExtraSubnetsAdd')?.click();
  });

  $('bblScanLogToggle')?.addEventListener('click', () => {
    const body   = $('bblScanLogBody');
    const toggle = $('bblScanLogToggle');
    if (!body || !toggle) return;
    const open = body.hidden;
    body.hidden = !open;
    toggle.classList.toggle('snap-scan-log-toggle--open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  $('bblScanLogExport')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ log: _bblScanLog, environment: getLastBblScanEnv() }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bbl-scan-${Date.now()}.json`;
    a.click();
  });
  $('bblScanLogClear')?.addEventListener('click', bblScanLogClear);

  $('bblManualClose')?.addEventListener('click', _closeAll);
  $('bblManualOverlay')?.addEventListener('click', e => { if (e.target.id === 'bblManualOverlay') _closeAll(); });
  $('bblManualBack')?.addEventListener('click', () => { _closePanel('bblManualOverlay'); _openPanel('bblChoiceOverlay'); });
  $('bblManualProbeBtn')?.addEventListener('click', _handleManualProbe);
  $('bblManualIpInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleManualProbe(); });
}

// ── Cloud sign-in logic ──────────────────────────────────────────────────────
// Email → code → the account's machines, and every machine arrives carrying its
// own LAN access code, handed over by the cloud. That is what makes this the
// easy way in: nothing has to be read off the printer's screen and typed.
// Protocol + validated pitfalls: docs/bambu_connect_cloud.md.

/* `$` in this file is a local of _wireDOM; these run at module level. */
const _el = (id) => document.getElementById(id);

let _bblCloudEmail = '';        // what the user signs in with: an email, or (China) a phone
let _bblCloudRegion = 'us';     // 'us' = the Global platform, 'cn' = the China-mainland one
let _bblCloudDevices = [];
const _bblCloudPicked = new Set();

function _bblCloudNote(msgKey, isError) {
  const el = _el('bblCloudNote');
  if (!el) return;
  if (!msgKey) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = ctx.t(msgKey);
  el.classList.toggle('is-error', !!isError);
  el.hidden = false;
}

/* Two steps, one at a time: the address, then the code. Showing both at once
   asks a question the user cannot yet answer — the code does not exist until the
   first step is done. The address stays readable, with a way back to it, because
   the commonest reason the code never arrives is a typo in the email. */
function _bblCloudStep(n) {
  const emailRow = _el('bblCloudEmailRow');
  const sentRow  = _el('bblCloudSentRow');
  const codeRow  = _el('bblCloudCodeRow');
  const addr     = _el('bblCloudSentAddr');
  if (emailRow) emailRow.hidden = n !== 1;
  if (sentRow)  sentRow.hidden  = n !== 2;
  if (codeRow)  codeRow.hidden  = n !== 2;
  if (addr && n === 2) addr.textContent = _bblCloudEmail;
}

/* Mainland-China accounts live on a separate Bambu platform, and most of them
   sign in with a phone number rather than an email (issue #33). Returns the
   number as Bambu expects it — digits only, the +86 country code dropped — or
   '' when the input is not a phone number at all. */
function _bblCloudPhone(raw) {
  const v = String(raw || '').trim();
  if (!v || v.includes('@') || !/^\+?[\d\s\-().]{6,}$/.test(v)) return '';
  const digits = v.replace(/\D/g, '');
  return digits.replace(/^(0086|86)(?=1\d{10}$)/, '');
}

function _bblCloudSetRegion(region) {
  _bblCloudRegion = region === 'cn' ? 'cn' : 'us';
  for (const opt of document.querySelectorAll('#bblCloudRegion [data-region]')) {
    const on = opt.dataset.region === _bblCloudRegion;
    opt.classList.toggle('is-active', on);
    opt.setAttribute('aria-checked', String(on));
  }
  const input = _el('bblCloudEmail');
  if (input) input.placeholder = ctx.t(_bblCloudRegion === 'cn' ? 'bblCloudAccountPhCn' : 'bblCloudEmailPh');
}

function _bblCloudBusy(on) {
  _el('bblCloudSendCode')?.toggleAttribute('disabled', on);
  _el('bblCloudSignIn')?.toggleAttribute('disabled', on);
}

async function _bblCloudSendCode() {
  const raw   = String(_el('bblCloudEmail')?.value || '').trim();
  const phone = _bblCloudPhone(raw);
  /* A refusal has to SAY why — a key that does nothing reads as broken. The
     hint depends on the region: only the China platform takes a phone number. */
  if (!phone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    const input = _el('bblCloudEmail');
    input?.classList.add('is-invalid');
    _bblCloudNote(!raw ? 'bblCloudErrEmpty'
      : _bblCloudRegion === 'cn' ? 'bblCloudErrAccountCn' : 'bblCloudErrEmail', true);
    input?.focus();
    return;
  }
  if (phone) _bblCloudSetRegion('cn');
  _bblCloudEmail = phone || raw;
  _bblCloudBusy(true);
  const r = await window.bambulab?.cloud?.sendCode(phone
    ? { phone }
    : { email: raw, region: _bblCloudRegion });
  _bblCloudBusy(false);
  if (!r?.ok) {
    _bblCloudNote(r?.error === 'cloudflare' ? 'bblCloudErrBlocked' : 'bblCloudErrGeneric', true);
    return;
  }
  /* The code is single-use and short-lived, and asking for another one kills the
     previous — so the field is revealed and focused straight away rather than
     left for the user to find. */
  _bblCloudStep(2);
  const code = _el('bblCloudCode');
  if (code) code.placeholder = ctx.t(phone ? 'bblCloudCodePhSms' : 'bblCloudCodePh');
  _bblCloudNote(phone ? 'bblCloudCodeSentSms' : 'bblCloudCodeSent', false);
  _el('bblCloudCode')?.focus();
}

async function _bblCloudSignIn() {
  const code = String(_el('bblCloudCode')?.value || '').trim();
  if (!code || !_bblCloudEmail) return;
  _bblCloudBusy(true);
  const region = _bblCloudRegion;
  const r = await window.bambulab?.cloud?.login({ account: _bblCloudEmail, code, region });

  if (!r?.ok) {
    _bblCloudBusy(false);
    if (r?.error === 'code-expired') {
      /* Expired is not the same as wrong: one needs a new code, the other needs
         a better one. Bambu has already sent a replacement by this point. */
      _bblCloudNote('bblCloudErrExpired', true);
      _el('bblCloudCode').value = '';
    } else if (r?.error === 'code-incorrect') {
      _bblCloudNote('bblCloudErrCode', true);
    } else if (r?.error === 'cloudflare') {
      _bblCloudNote('bblCloudErrBlocked', true);
    } else {
      _bblCloudNote('bblCloudErrGeneric', true);
    }
    return;
  }

  /* The MQTT username has to be asked for: the token is no longer a JWT, so
     there is nothing in it to read. Without the uid the broker refuses the
     connection without ever saying why. */
  const who = await window.bambulab?.cloud?.uid({ token: r.token, region });
  if (!who?.ok) { _bblCloudBusy(false); _bblCloudNote('bblCloudErrGeneric', true); return; }

  await ctx.saveBambuCloudSession?.({
    account: _bblCloudEmail, uid: who.uid, token: r.token,
    expiresIn: r.expiresIn, region,
  });

  const bind = await window.bambulab?.cloud?.bind({ token: r.token, region });
  _bblCloudBusy(false);
  if (!bind?.ok) { _bblCloudNote('bblCloudErrGeneric', true); return; }
  _bblCloudNote(null);
  _bblCloudShowRaw(bind.devices || []);
  _bblCloudRenderDevices(bind.devices || []);
}

/* Built like a scan result, because that is what it is: a machine you are being
   offered, with its picture so you can tell an X1C from a P1P at a glance
   instead of reading serial numbers. The model comes from the code the cloud
   reports, falling back to the serial's prefix. */
function _bblCloudDeviceCardHtml(d) {
  const modelId   = bambuModelIdFromCode(d.modelCode, d.devId);
  const matched   = ctx.findPrinterModel('bambulab', modelId);
  const fallback  = ctx.findPrinterModel('bambulab', '0');
  const imgUrl    = ctx.printerImageUrl(matched) || ctx.printerImageUrl(fallback);
  const thumbHtml = imgUrl
    ? `<img src="${ctx.esc(imgUrl)}" alt="" onerror="this.style.opacity='.15'"/>` : '';
  const title     = d.name || d.devId;
  const modelLine = d.model && d.model !== title ? d.model : '';

  return `
    <div class="snap-scan-card bbl-cloud-device" role="checkbox" aria-checked="false"
         tabindex="0" data-dev-id="${ctx.esc(d.devId)}">
      <span class="snap-scan-card-thumb">${thumbHtml}</span>
      <span class="snap-scan-card-main">
        <span class="snap-scan-card-title">
          <span class="bbl-cloud-dot${d.online ? ' is-online' : ''}"></span>
          <span class="snap-scan-card-title-text">${ctx.esc(title)}</span>
        </span>
        ${modelLine ? `<span class="snap-scan-card-line snap-scan-card-line--model">${ctx.esc(modelLine)}</span>` : ''}
        <span class="snap-scan-card-line snap-scan-card-line--sn">SN · ${ctx.esc(d.devId)}</span>
      </span>
      <span class="bbl-cloud-tick" aria-hidden="true">
        <span class="icon icon-check icon-13"></span>
      </span>
    </div>`;
}

/* The account's machine list, verbatim, for whoever is building on top of it.
   Debug mode only — it is a developer's view of a payload, not something to put
   in front of someone who came here to add a printer. */
function _bblCloudShowRaw(devices) {
  const box = _el('bblCloudRaw');
  if (!box) return;
  if (!ctx.isDebugEnabled?.()) { box.hidden = true; return; }
  const json = JSON.stringify(devices, null, 2);
  box.hidden = false;
  box.innerHTML = `
    <div class="bbl-cloud-raw-head">
      <span>RAW · /iot-service/api/user/bind</span>
      <button type="button" class="snap-log-detail-copy" data-copy="${ctx.esc(json)}">
        <span class="icon icon-copy icon-13"></span>
        <span>${ctx.esc(ctx.t('copyLabel'))}</span>
      </button>
    </div>
    <pre class="bbl-cloud-raw-body">${ctx.esc(json)}</pre>`;
  box.querySelector('[data-copy]')?.addEventListener('click', (e) => {
    navigator.clipboard?.writeText(e.currentTarget.dataset.copy || '');
  });
}

function _bblCloudRenderDevices(devices) {
  const results = _el('bblCloudResults');
  const pick    = _el('bblCloudPick');
  if (!results) return;
  results.innerHTML = '';
  if (!devices.length) { _bblCloudNote('bblCloudNoPrinters', false); return; }
  if (pick) pick.hidden = false;

  _bblCloudDevices = devices;
  _bblCloudPicked.clear();

  let built = 0;
  for (const d of devices) {
    const wrap = document.createElement('div');
    /* Guarded per card: a single machine whose model or picture cannot be
       resolved must not take the whole list down with it — a silently empty list
       after a successful sign-in is the worst possible outcome here. */
    try {
      wrap.innerHTML = _bblCloudDeviceCardHtml(d);
    } catch (err) {
      console.error('[bambu-cloud] cannot build the card for', d?.devId, err);
      continue;
    }
    const card = wrap.firstElementChild;
    if (!card) { console.error('[bambu-cloud] empty card for', d?.devId); continue; }
    built++;
    const toggle = () => {
      const on = !_bblCloudPicked.has(d.devId);
      if (on) _bblCloudPicked.add(d.devId); else _bblCloudPicked.delete(d.devId);
      card.classList.toggle('is-picked', on);
      card.setAttribute('aria-checked', String(on));
      _bblCloudSyncAddBtn();
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    results.appendChild(card);
  }
  /* Sign-in worked but nothing could be drawn — say it rather than showing an
     empty space that reads as "no printers". */
  if (!built) _bblCloudNote('bblCloudAddFailed', true);
  _bblCloudSyncAddBtn();
}

/* ONE key for the whole selection, carrying its own count. Adding a machine per
   click closed the panel each time, so picking three meant signing in three
   times over. */
function _bblCloudSyncAddBtn() {
  const btn = _el('bblCloudAddBtn');
  if (!btn) return;
  const n = _bblCloudPicked.size;
  btn.hidden = n === 0;
  const label = btn.querySelector('.label');
  if (label) label.textContent = ctx.t('bblCloudAddSelected', { n });
}

async function _bblCloudAddPicked() {
  const chosen = _bblCloudDevices.filter(d => _bblCloudPicked.has(d.devId));
  if (!chosen.length) return;
  const btn = _el('bblCloudAddBtn');
  btn?.setAttribute('disabled', '');

  let lastId = null, failed = 0;
  for (const d of chosen) {
    const r = await ctx.addBambuCloudPrinter?.({
      devId:      d.devId,
      name:       d.name,
      accessCode: d.accessCode,
      modelCode:  d.modelCode,
      /* The catalogue entry, resolved from the code the cloud reports (falling
         back to the serial's prefix). It decides the printer's picture AND its
         camera transport, so leaving it unset gave a "?" thumbnail and the wrong
         kind of camera. */
      printerModelId: bambuModelIdFromCode(d.modelCode, d.devId),
    });
    if (r?.ok) lastId = r.id; else failed++;
  }
  btn?.removeAttribute('disabled');

  /* A half-done job is reported, not closed over: the panel stays so the picks
     that failed are still on screen and can be tried again. */
  if (failed) { _bblCloudNote('bblCloudAddFailed', true); return; }
  _closeAll();
  if (lastId) ctx.finishPrinterAdd?.('bambulab', lastId);
}

function _openCloudPanel() {
  _ensureDOM();
  _bblCloudEmail = '';
  _bblCloudStep(1);
  _bblCloudSetRegion(_bblCloudRegion);   // re-applies the placeholder a translation pass reset
  const pick = _el('bblCloudPick');    if (pick) pick.hidden = true;
  const raw  = _el('bblCloudRaw');     if (raw)  { raw.hidden = true; raw.innerHTML = ''; }
  _bblCloudDevices = []; _bblCloudPicked.clear(); _bblCloudSyncAddBtn();
  const res  = _el('bblCloudResults'); if (res)  res.innerHTML = '';
  _bblCloudNote(null);
  const codeInput = _el('bblCloudCode'); if (codeInput) codeInput.value = '';
  _openPanel('bblCloudOverlay');
  _el('bblCloudEmail')?.focus();
}

// ── Scan panel logic ─────────────────────────────────────────────────────────

function _openScanPanel() {
  _ensureDOM();

  const results = document.getElementById('bblScanResults');
  const empty   = document.getElementById('bblScanEmpty');
  const bar     = document.getElementById('bblScanBar');
  const stats   = document.getElementById('bblScanStats');
  const sub     = document.getElementById('bblScanSub');
  if (results) results.innerHTML = '';
  _bblScanPick.reset();
  if (empty)   empty.hidden = true;
  if (bar)     bar.style.width = '0%';
  if (stats)   stats.textContent = '0 / 100';
  if (sub)     sub.textContent = ctx.t('snapScanStarting') || 'Starting scan…';

  bblScanLogClear();
  const logSection = document.getElementById('bblScanLog');
  if (logSection) logSection.hidden = !ctx.isDebugEnabled();

  const ipDetails = document.getElementById('bblAddIpDetails');
  if (ipDetails) ipDetails.open = false;

  // Hot-mount the chip list against the shared subnet store (same store the
  // other 4 brand scan modals read from). Re-bound on every scan start so
  // we don't leak subscribers across re-opens.
  if (_bblChipsUnsub) { _bblChipsUnsub(); _bblChipsUnsub = null; }
  _bblChipsUnsub = extraSubnets.renderChipsInto("bblExtraSubnetsChips", ctx.esc, ctx.t);

  _openPanel('bblScanOverlay');

  _bblScanCtl = new AbortController();
  const signal = _bblScanCtl.signal;
  let found = 0;

  bambuScanLan({
    signal,
    logPush: bblScanLogPush,
    onCandidate(c) {
      found++;
      if (empty) empty.hidden = true;
      const wrap = document.createElement('div');
      wrap.innerHTML = _bblCandidateCardHtml(c);
      const card = wrap.firstElementChild;
      if (!card) return;
      _bblScanPick.attach(card, c);
      document.getElementById('bblScanResults')?.appendChild(card);
    },
    onProgress({ done: d, total: t }) {
      if (bar)   bar.style.width   = `${Math.min(100, Math.round((d / t) * 100))}%`;
      if (stats) stats.textContent = `${d} / ${t}`;
    },
  }).then(() => {
    if (bar)   bar.style.width = '100%';
    if (stats) stats.textContent = '100 / 100';
    if (sub)   sub.textContent = '';
    if (!signal.aborted && found === 0) {
      if (empty) empty.hidden = false;
      bblScanLogPush('warn', 'Scan complete — no Bambu Lab printers found');
    } else if (!signal.aborted) {
      bblScanLogPush('info', `Scan complete — ${found} printer(s) found`);
    }
  }).catch(e => {
    if (e?.name !== 'AbortError') bblScanLogPush('err', `Scan error: ${e?.message || e}`);
  });
}

// ── Add-by-IP + Manual probe handlers ────────────────────────────────────────

async function _handleAddByIp() {
  const input    = document.getElementById('bblAddIpInput');
  const btn      = document.getElementById('bblAddIpBtn');
  const statusEl = document.getElementById('bblAddIpStatus');
  if (!input || !btn) return;
  const ip = input.value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return;

  btn.disabled = true;
  btn.classList.add('loading');
  if (statusEl) { statusEl.hidden = false; statusEl.textContent = ctx.t('snapManualProbing', { ip }) || `Reaching ${ip}…`; }

  bblScanLogPush('info', `Manual TLS probe: ${ip}…`);
  const c = await bambuProbeIp(ip, undefined, { logPush: bblScanLogPush });

  btn.disabled = false;
  btn.classList.remove('loading');

  if (c) {
    bblAbortScan();
    _closePanel('bblScanOverlay');
    _continueWith({ ...c, ip });
  } else if (statusEl) {
    statusEl.hidden = false;
    statusEl.textContent = ctx.t('snapManualNoReply', { ip }) || `No reply from ${ip}.`;
  }
}

async function _handleManualProbe() {
  const input = document.getElementById('bblManualIpInput');
  const errEl = document.getElementById('bblManualIpError');
  const btn   = document.getElementById('bblManualProbeBtn');
  if (!input) return;
  const ip = input.value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    if (errEl) { errEl.textContent = ctx.t('snapAddByIpInvalid') || 'Invalid IP address format'; errEl.hidden = false; }
    input.focus();
    return;
  }
  if (errEl) errEl.hidden = true;
  if (btn)  { btn.disabled = true; btn.classList.add('loading'); }

  const c = await bambuProbeIp(ip, undefined, { logPush: () => {} });

  if (btn) { btn.disabled = false; btn.classList.remove('loading'); }

  if (c) {
    _closePanel('bblManualOverlay');
    _continueWith({ ...c, ip });
  } else if (errEl) {
    errEl.textContent = ctx.t('snapManualNoReply', { ip }) || `No reply from ${ip}.`;
    errEl.hidden = false;
  }
}

function _openManualPanel() {
  _ensureDOM();
  const input = document.getElementById('bblManualIpInput');
  const errEl = document.getElementById('bblManualIpError');
  if (input) input.value = '';
  if (errEl) errEl.hidden = true;
  _openPanel('bblManualOverlay');
  setTimeout(() => input?.focus(), 80);
}

// ── Public entry point ───────────────────────────────────────────────────────

export function openBblAddFlow() {
  _ensureDOM();
  _openPanel('bblChoiceOverlay');
}
