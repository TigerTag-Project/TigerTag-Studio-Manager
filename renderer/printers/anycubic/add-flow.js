/**
 * printers/anycubic/add-flow.js — Anycubic "add printer" UI flow.
 *
 * Owns the four panels of the add sequence:
 *   1. Choice modal  — Import from Slicer vs Scan vs Manual Add.
 *   2. Import panel  — reads paired LAN printers (with credentials) from
 *                      AnycubicSlicerNext's on-disk config. PRIMARY path:
 *                      it is the ONLY source of the broker credentials.
 *   3. Scan panel    — LAN scan on :18910 with one-click add. Candidates
 *                      carry no credentials; they are merged with the slicer
 *                      config by IP (also repairs a stale DHCP IP).
 *   4. Manual modal  — direct IP entry + /info probe confirmation.
 *
 * Network / data work lives in probe.js. Structure mirrors
 * bambulab/add-flow.js — almost all UI strings reuse the shared `snap*`
 * i18n keys; the brand title, import panel and empty states are
 * Anycubic-specific.
 *
 * Entry point: openAcuAddFlow() — called from the brand picker in inventory.js.
 */

import { ctx } from '../context.js';
import * as extraSubnets from '../extra-subnets.js';
import {
  acuProbeIp,
  acuScanLan,
  acuReadSlicerCreds,
  acuBuildDiscoveryRecord,
  acuCatalogIdFromModel,
  getLastAcuScanEnv,
} from './probe.js';

// ── Scan log ─────────────────────────────────────────────────────────────────

let _acuScanLog = [];

function acuScanLogPush(kind, summary, raw) {
  _acuScanLog.push({ ts: Date.now(), kind, summary, raw: raw ?? null });

  const body = document.getElementById('acuScanLogBody');
  if (!body || body.hidden) {
    const count = document.getElementById('acuScanLogCount');
    if (count) count.textContent = String(_acuScanLog.length);
    return;
  }
  const row = document.createElement('div');
  row.className = `snap-scan-log-row snap-scan-log-row--${kind}`;
  row.innerHTML = `
    <span class="snap-scan-log-ts">${ctx.esc(String(_acuScanLog.length))}</span>
    <span class="snap-scan-log-kind">${ctx.esc(kind)}</span>
    <span class="snap-scan-log-summary">${ctx.esc(summary)}</span>`;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;

  const count = document.getElementById('acuScanLogCount');
  if (count) count.textContent = String(_acuScanLog.length);
}

function acuScanLogClear() {
  _acuScanLog = [];
  const body = document.getElementById('acuScanLogBody');
  if (body) body.innerHTML = '';
  const count = document.getElementById('acuScanLogCount');
  if (count) count.textContent = '0';
}

// ── Scan state ───────────────────────────────────────────────────────────────

let _acuScanCtl = null;
let _acuChipsUnsub = null;

function acuAbortScan() {
  if (_acuScanCtl && !_acuScanCtl.signal.aborted) _acuScanCtl.abort();
}

// ── Credential merge ─────────────────────────────────────────────────────────

/**
 * Open the Printer Settings add form prefilled from a slicer-config entry
 * (full credentials) or a scan candidate (no credentials).
 *
 * `creds` (slicer entry) and `cand` (scan /info candidate) are merged; either
 * may be null. Prefill keys match the schema field keys in settings.js so
 * schemaWidget seeds the form fields directly.
 */
function _continueWith({ creds = null, cand = null }) {
  const acuModelId = creds?.modelId || cand?.acuModelId || '';
  const name = creds?.name || cand?.deviceName || cand?.modelName
            || `Anycubic ${creds?.ip || cand?.ip || ''}`;
  ctx.openPrinterSettings('anycubic', null, {
    ip:          creds?.ip || cand?.ip || '',
    acuModelId:  String(acuModelId),
    deviceId:    creds?.deviceId || '',
    username:    creds?.username || '',
    password:    creds?.password || '',
    printerName: name,
    modelId:     acuCatalogIdFromModel(acuModelId, cand?.modelName || creds?.name),
    discovery:   acuBuildDiscoveryRecord(cand || { ...creds, source: 'slicer' }),
  });
}

/**
 * A scan/manual candidate was picked — silently try to pair it with the
 * slicer config's credentials by IP before opening the form. Without a
 * match the form opens with empty credential fields (the user is told to
 * run the import instead).
 */
async function _continueWithCandidate(cand) {
  let creds = null;
  try {
    const { printers } = await acuReadSlicerCreds({ logPush: acuScanLogPush });
    creds = printers.find(p => p.ip === cand.ip)
      // DHCP repair: same model and exactly one credentialed printer of that
      // model that no longer answers on its recorded IP → likely the same
      // machine with a new address. Conservative: only when unambiguous.
      || (printers.filter(p => p.modelId === cand.acuModelId).length === 1
          ? printers.find(p => p.modelId === cand.acuModelId)
          : null);
    if (creds && creds.ip !== cand.ip) {
      acuScanLogPush('info', `Credential match by model id — updating IP ${creds.ip} → ${cand.ip}`);
      creds = { ...creds, ip: cand.ip };
    }
  } catch (_) { /* no slicer config — open the form without creds */ }
  _continueWith({ creds, cand });
}

// ── Candidate cards ──────────────────────────────────────────────────────────

function _acuCandidateCardHtml(c) {
  const matched   = ctx.findPrinterModel('anycubic', c.catalogId);
  const fallback  = ctx.findPrinterModel('anycubic', '0');
  const modelName = matched && String(matched.id) !== '0' ? matched.name : (c.modelName || null);
  const title     = c.deviceName || modelName || c.ip;
  const modelLine = modelName && modelName !== title ? modelName : '';
  const idLine    = c.acuModelId ? `Model ID · ${c.acuModelId}` : '';

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
        ${idLine    ? `<span class="snap-scan-card-line snap-scan-card-line--sn">${ctx.esc(idLine)}</span>` : ''}
      </span>
      <span class="icon icon-chevron-r icon-14 snap-scan-card-chev"></span>
    </div>`;
}

function _acuImportCardHtml(p) {
  const catalogId = acuCatalogIdFromModel(p.modelId, p.name);
  const matched   = ctx.findPrinterModel('anycubic', catalogId);
  const fallback  = ctx.findPrinterModel('anycubic', '0');
  const title     = p.name || (matched && String(matched.id) !== '0' ? matched.name : `Anycubic ${p.ip}`);
  const imgUrl    = ctx.printerImageUrl(matched) || ctx.printerImageUrl(fallback);
  const thumbHtml = imgUrl
    ? `<img src="${ctx.esc(imgUrl)}" alt="" onerror="this.style.opacity='.15'"/>` : '';

  return `
    <div class="snap-scan-card" role="button" tabindex="0" data-device-id="${ctx.esc(p.deviceId)}">
      <span class="snap-scan-card-thumb">${thumbHtml}</span>
      <span class="snap-scan-card-main">
        <span class="snap-scan-card-title">
          <span class="snap-scan-card-title-text">${ctx.esc(title)}</span>
        </span>
        <span class="snap-scan-card-ip">${ctx.esc(p.ip)}</span>
        <span class="snap-scan-card-line snap-scan-card-line--sn">Model ID · ${ctx.esc(p.modelId)}</span>
      </span>
      <span class="icon icon-chevron-r icon-14 snap-scan-card-chev"></span>
    </div>`;
}

// ── Generic panel helpers ────────────────────────────────────────────────────

function _openPanel(id)  { document.getElementById(id)?.classList.add('open'); }
function _closePanel(id) { document.getElementById(id)?.classList.remove('open'); }

function _closeAll() {
  acuAbortScan();
  _closePanel('acuChoiceOverlay');
  _closePanel('acuImportOverlay');
  _closePanel('acuScanOverlay');
  _closePanel('acuManualOverlay');
  _closePanel('acuCloudOverlay');
}

// ── Lazy DOM creation ────────────────────────────────────────────────────────

let _domReady = false;

function _ensureDOM() {
  if (_domReady) return;
  _domReady = true;

  const root = document.createElement('div');
  root.id = 'acuAddFlowRoot';
  root.innerHTML = /* html */`

<!-- ═══════════════════════════════════════════════════════════════════════════
     Anycubic — Choice modal (Import vs Scan vs Manual)
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="acuChoiceOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="anycubicAddChoiceTitle">Add Anycubic printer</div>
        <div class="pba-sub"   data-i18n="snapAddChoiceSub">How do you want to find your printer?</div>
      </div>
      <button class="modal-close" id="acuChoiceClose">✕</button>
    </div>
    <div class="pba-brands">
      <button type="button" class="pba-brand" id="acuChoiceImport">
        <span class="pba-brand-dot" style="background:#00a9e0"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="acuImportChoice">Import from Anycubic Slicer</span>
          <span class="pba-brand-conn"  data-i18n="acuImportChoiceHint">Reads paired printers + credentials (recommended)</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
      <button type="button" class="pba-brand" id="acuChoiceScan">
        <span class="pba-brand-dot" style="background:#00a9e0"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceScan">Scan network</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceScanHint">Auto-discover printers on your LAN</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
      <button type="button" class="pba-brand" id="acuChoiceManual">
        <span class="pba-brand-dot" style="background:#00a9e0"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceManual">Enter IP address</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceManualHint">Manually enter the printer's local IP</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
      <button type="button" class="pba-brand" id="acuChoiceCloud">
        <span class="pba-brand-dot" style="background:#7b61ff"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="acuCloudChoice">Add a cloud printer</span>
          <span class="pba-brand-conn"  data-i18n="acuCloudChoiceHint">For printers in cloud mode (via the slicer)</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="acuChoiceBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Anycubic — Cloud provisioning modal (CDP token grab → getPrinters)
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="acuCloudOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="acuCloudTitle">Add a cloud printer</div>
        <div class="pba-sub"   data-i18n="acuCloudSub">Cloud printers on your Anycubic account</div>
      </div>
      <button class="modal-close" id="acuCloudClose">✕</button>
    </div>
    <div class="snap-scan-body">
      <div class="snap-scan-results" id="acuCloudResults"></div>
      <div class="snap-scan-empty" id="acuCloudEmpty" hidden></div>
      <!-- Instructional block shown when the bridge-mode slicer isn't reachable -->
      <div class="acu-cloud-help" id="acuCloudHelp" hidden>
        <p data-i18n="acuCloudHelpIntro">Cloud printers are added through AnycubicSlicerNext. Start it with remote debugging, signed in, and open the Workbench:</p>
        <pre class="acu-cloud-help-cmd" id="acuCloudHelpCmd">$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
&amp; "C:\Program Files\AnycubicSlicerNext\AnycubicSlicerNext.exe"</pre>
        <button type="button" class="adf-btn adf-btn--secondary acu-cloud-help-copy" id="acuCloudHelpCopy">
          <span class="icon icon-copy icon-13"></span>
          <span data-i18n="copyLabel">Copy</span>
        </button>
      </div>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="acuCloudBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--primary" id="acuCloudRetry">
        <span class="icon icon-refresh icon-13"></span>
        <span class="label" data-i18n="acuCloudConnect">Connect to slicer</span>
        <span class="spinner"></span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Anycubic — Import-from-slicer modal
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="acuImportOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="acuImportTitle">Import from Anycubic Slicer</div>
        <div class="pba-sub"   data-i18n="acuImportSub">Paired LAN printers found in the slicer's configuration</div>
      </div>
      <button class="modal-close" id="acuImportClose">✕</button>
    </div>
    <div class="snap-scan-body">
      <div class="snap-scan-results" id="acuImportResults"></div>
      <div class="snap-scan-empty" id="acuImportEmpty" hidden></div>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="acuImportBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--secondary" id="acuImportRetry">
        <span class="icon icon-refresh icon-13"></span>
        <span data-i18n="snapScanRestart">Restart scan</span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Anycubic — LAN Scan modal (port 18910 /info)
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="acuScanOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapScanTitle">Scanning network…</div>
        <div class="pba-sub" id="acuScanSub"></div>
      </div>
      <button class="modal-close" id="acuScanClose">✕</button>
    </div>
    <div class="snap-scan-body">

      <div class="snap-scan-progress">
        <div class="snap-scan-bar"><span id="acuScanBar"></span></div>
        <div class="snap-scan-stats" id="acuScanStats">0 / 100</div>
      </div>

      <details class="snap-add-ip" id="acuAddIpDetails">
        <summary class="snap-add-ip-summary">
          <span class="snap-add-ip-summary-icon icon icon-plus icon-13"></span>
          <span class="snap-add-ip-summary-label" data-i18n="snapAddByIpButton">Add by IP</span>
          <span class="snap-add-ip-chev icon icon-chevron-r icon-13"></span>
        </summary>
        <div class="snap-add-ip-body">
          <label class="snap-add-ip-label" data-i18n="snapAddByIpLabel">IP address</label>
          <span class="snap-add-ip-input-wrap">
            <input type="text" inputmode="decimal" class="snap-add-ip-input" id="acuAddIpInput"
                   placeholder="192.168.1.46" autocomplete="off" autocapitalize="off"
                   spellcheck="false" maxlength="15"/>
            <span class="snap-add-ip-tip" id="acuAddIpTip" hidden role="alert">
              <span class="icon icon-info icon-13"></span>
              <span data-i18n="snapAddByIpInvalid">Invalid IP address format</span>
            </span>
          </span>
          <button type="button" class="adf-btn adf-btn--primary snap-add-ip-btn"
                  id="acuAddIpBtn" disabled>
            <span class="icon icon-check icon-13"></span>
            <span class="label" data-i18n="snapAddByIpValidate">Validate</span>
            <span class="spinner"></span>
          </button>
          <div class="snap-add-ip-status" id="acuAddIpStatus" hidden></div>
        </div>
      </details>

      <!-- Extra subnets — shared across all brand scan modals via
           printers/extra-subnets.js. -->
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
            <input type="text" class="snap-extra-subnets-input" id="acuExtraSubnetsInput"
                   placeholder="192.168.40" autocomplete="off" autocapitalize="off" spellcheck="false"/>
            <button type="button" class="snap-extra-subnets-add"
                    id="acuExtraSubnetsAdd" data-i18n="snapScanExtraSubnetsAdd">Add</button>
          </div>
          <div class="snap-extra-subnets-err" id="acuExtraSubnetsErr" hidden></div>
          <div class="snap-extra-subnets-chips" id="acuExtraSubnetsChips"></div>
        </div>
      </details>

      <div class="snap-scan-results" id="acuScanResults"></div>

      <div class="snap-scan-empty" id="acuScanEmpty" hidden data-i18n="anycubicScanEmpty">
        No Anycubic printers found — make sure LAN mode is enabled on the printer
      </div>

      <section class="snap-scan-log" id="acuScanLog" hidden>
        <header class="snap-scan-log-head">
          <button type="button" class="snap-scan-log-toggle" id="acuScanLogToggle"
                  aria-expanded="false" aria-label="Scan log" data-i18n-title="snapScanLogTitle"
                  title="Scan log">
            <span class="icon icon-chevron-r icon-13 snap-scan-log-chev"></span>
            <span class="icon icon-list icon-13 snap-scan-log-title-icon"></span>
            <span class="snap-scan-log-count" id="acuScanLogCount">0</span>
          </button>
          <span class="snap-scan-log-actions">
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--primary snap-scan-log-btn--icon"
                    id="acuScanLogExport" data-i18n-title="snapScanLogExport" aria-label="Export" title="Export">
              <span class="icon icon-copy icon-13"></span>
            </button>
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--icon"
                    id="acuScanLogClear" data-i18n-title="snapScanLogClear" aria-label="Clear" title="Clear">
              <span class="icon icon-trash icon-13"></span>
            </button>
          </span>
        </header>
        <div class="snap-scan-log-body" id="acuScanLogBody" hidden></div>
      </section>

    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="acuScanBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--secondary" id="acuScanRestart">
        <span class="icon icon-refresh icon-13"></span>
        <span data-i18n="snapScanRestart">Restart scan</span>
      </button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Anycubic — Manual IP entry modal
     ═════════════════════════════════════════════════════════════════════════ -->
<div class="modal-overlay" id="acuManualOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapManualTitle">Manual add</div>
        <div class="pba-sub"   data-i18n="snapManualSub">Type the printer's local IP — we'll probe it to pre-fill the rest.</div>
      </div>
      <button class="modal-close" id="acuManualClose">✕</button>
    </div>
    <div class="pba-body">
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="printerLblIP">
          IP address <span class="pba-field-req">*</span>
        </span>
        <input type="text" id="acuManualIpInput" class="pba-input pba-input--mono"
               placeholder="192.168.1.46" maxlength="15"
               spellcheck="false" autocomplete="off" autocapitalize="off"/>
        <div class="pba-error" id="acuManualIpError" hidden></div>
      </div>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="acuManualBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--primary" id="acuManualProbeBtn">
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

  $('acuChoiceClose')?.addEventListener('click', _closeAll);
  $('acuChoiceOverlay')?.addEventListener('click', e => { if (e.target.id === 'acuChoiceOverlay') _closeAll(); });
  $('acuChoiceBack')?.addEventListener('click', () => { _closePanel('acuChoiceOverlay'); ctx.openBrandPicker(); });
  $('acuChoiceImport')?.addEventListener('click', () => { _closePanel('acuChoiceOverlay'); _openImportPanel(); });
  $('acuChoiceScan')?.addEventListener('click', () => { _closePanel('acuChoiceOverlay'); _openScanPanel(); });
  $('acuChoiceManual')?.addEventListener('click', () => { _closePanel('acuChoiceOverlay'); _openManualPanel(); });
  $('acuChoiceCloud')?.addEventListener('click', () => { _closePanel('acuChoiceOverlay'); _openCloudPanel(); });

  $('acuImportClose')?.addEventListener('click', _closeAll);
  $('acuImportOverlay')?.addEventListener('click', e => { if (e.target.id === 'acuImportOverlay') _closeAll(); });
  $('acuImportBack')?.addEventListener('click', () => { _closePanel('acuImportOverlay'); _openPanel('acuChoiceOverlay'); });
  $('acuImportRetry')?.addEventListener('click', () => _runImport());

  $('acuCloudClose')?.addEventListener('click', _closeAll);
  $('acuCloudOverlay')?.addEventListener('click', e => { if (e.target.id === 'acuCloudOverlay') _closeAll(); });
  $('acuCloudBack')?.addEventListener('click', () => { _closePanel('acuCloudOverlay'); _openPanel('acuChoiceOverlay'); });
  $('acuCloudRetry')?.addEventListener('click', () => _runCloudProvision());
  $('acuCloudHelpCopy')?.addEventListener('click', () => {
    const cmd = $('acuCloudHelpCmd')?.textContent || '';
    try { navigator.clipboard.writeText(cmd); } catch (_) {}
  });

  $('acuScanClose')?.addEventListener('click', _closeAll);
  $('acuScanOverlay')?.addEventListener('click', e => { if (e.target.id === 'acuScanOverlay') _closeAll(); });
  $('acuScanBack')?.addEventListener('click', () => { acuAbortScan(); _closePanel('acuScanOverlay'); _openPanel('acuChoiceOverlay'); });
  $('acuScanRestart')?.addEventListener('click', () => { acuAbortScan(); _openScanPanel(); });

  const addIpInput = $('acuAddIpInput');
  const addIpBtn   = $('acuAddIpBtn');
  const addIpTip   = $('acuAddIpTip');
  if (addIpInput) {
    addIpInput.addEventListener('input', () => {
      const valid = /^\d{1,3}(\.\d{1,3}){3}$/.test(addIpInput.value.trim());
      if (addIpBtn) addIpBtn.disabled = !valid;
      if (addIpTip) addIpTip.hidden   = valid || !addIpInput.value;
    });
    addIpInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !addIpBtn?.disabled) _handleAddByIp();
    });
    $('acuAddIpDetails')?.addEventListener('toggle', e => {
      if (!e.target.open) {
        addIpInput.value = '';
        if (addIpBtn) addIpBtn.disabled = true;
        if (addIpTip) addIpTip.hidden   = true;
        const status = $('acuAddIpStatus');
        if (status) { status.hidden = true; status.textContent = ''; }
      }
    });
  }
  $('acuAddIpBtn')?.addEventListener('click', _handleAddByIp);

  // Extra subnets — shared store (printers/extra-subnets.js)
  $('acuExtraSubnetsAdd')?.addEventListener('click', () => {
    const input = $('acuExtraSubnetsInput');
    if (!input) return;
    if (extraSubnets.addPrefix(input.value)) input.value = '';
  });
  $('acuExtraSubnetsInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('acuExtraSubnetsAdd')?.click();
  });

  $('acuScanLogToggle')?.addEventListener('click', () => {
    const body   = $('acuScanLogBody');
    const toggle = $('acuScanLogToggle');
    if (!body || !toggle) return;
    const open = body.hidden;
    body.hidden = !open;
    toggle.classList.toggle('snap-scan-log-toggle--open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  $('acuScanLogExport')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ log: _acuScanLog, environment: getLastAcuScanEnv() }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `acu-scan-${Date.now()}.json`;
    a.click();
  });
  $('acuScanLogClear')?.addEventListener('click', acuScanLogClear);

  $('acuManualClose')?.addEventListener('click', _closeAll);
  $('acuManualOverlay')?.addEventListener('click', e => { if (e.target.id === 'acuManualOverlay') _closeAll(); });
  $('acuManualBack')?.addEventListener('click', () => { _closePanel('acuManualOverlay'); _openPanel('acuChoiceOverlay'); });
  $('acuManualProbeBtn')?.addEventListener('click', _handleManualProbe);
  $('acuManualIpInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleManualProbe(); });
}

// ── Import panel logic ───────────────────────────────────────────────────────

// Machine error code → i18n key for the import empty state.
const _IMPORT_ERR_KEY = {
  'config-not-found':  'acuImportErrNotFound',
  'no-lan-printers':   'acuImportErrNoPrinters',
  'no-complete-creds': 'acuImportErrNoPrinters',
  'bridge-missing':    'acuImportErrBridge',
};

async function _runImport() {
  const results = document.getElementById('acuImportResults');
  const empty   = document.getElementById('acuImportEmpty');
  if (results) results.innerHTML = '';
  if (empty) { empty.hidden = true; empty.textContent = ''; }

  const { printers, error } = await acuReadSlicerCreds({ logPush: acuScanLogPush });

  if (!printers.length) {
    if (empty) {
      const key = _IMPORT_ERR_KEY[error] || 'acuImportErrNotFound';
      empty.textContent = ctx.t(key);
      empty.hidden = false;
    }
    return;
  }

  for (const p of printers) {
    const wrap = document.createElement('div');
    wrap.innerHTML = _acuImportCardHtml(p);
    const card = wrap.firstElementChild;
    if (!card) continue;
    const triggerAdd = () => {
      _closePanel('acuImportOverlay');
      _continueWith({ creds: p });
    };
    card.addEventListener('click', triggerAdd);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerAdd(); }
    });
    results?.appendChild(card);
  }
}

function _openImportPanel() {
  _ensureDOM();
  _openPanel('acuImportOverlay');
  _runImport();
}

// ── Cloud provisioning panel ─────────────────────────────────────────────────
// Attaches to a RUNNING bridge-mode slicer over CDP (port 9222) to read the
// workbench token, lists the account's cloud printers, and writes a Firestore
// cloud doc per pick. We never launch the slicer — if CDP isn't reachable we
// show the one-time bridge-mode launch instructions.

function _acuCloudCardHtml(p) {
  const catalogId = acuCatalogIdFromModel(String(p.machineType), p.name);
  const matched   = ctx.findPrinterModel('anycubic', catalogId);
  const fallback  = ctx.findPrinterModel('anycubic', '0');
  const title     = p.name || (matched && String(matched.id) !== '0' ? matched.name : `Anycubic ${p.id}`);
  const imgUrl    = ctx.printerImageUrl(matched) || ctx.printerImageUrl(fallback);
  const thumbHtml = imgUrl ? `<img src="${ctx.esc(imgUrl)}" alt="" onerror="this.style.opacity='.15'"/>` : '';
  const offline   = !p.online;
  return `
    <div class="snap-scan-card${offline ? ' is-disabled' : ''}" role="button" tabindex="${offline ? -1 : 0}"
         data-cloud-id="${ctx.esc(p.id)}"${offline ? ' aria-disabled="true"' : ''}>
      <span class="snap-scan-card-thumb">${thumbHtml}</span>
      <span class="snap-scan-card-main">
        <span class="snap-scan-card-title">
          <span class="snap-scan-card-title-text">${ctx.esc(title)}</span>
        </span>
        <span class="snap-scan-card-ip">${offline ? ctx.t('snapStatusOffline') : ctx.t('snapStatusOnline')}</span>
        <span class="snap-scan-card-line snap-scan-card-line--sn">Model ID · ${ctx.esc(String(p.machineType))}</span>
      </span>
      <span class="icon icon-chevron-r icon-14 snap-scan-card-chev"></span>
    </div>`;
}

async function _runCloudProvision() {
  const results = document.getElementById('acuCloudResults');
  const empty   = document.getElementById('acuCloudEmpty');
  const help    = document.getElementById('acuCloudHelp');
  const btn     = document.getElementById('acuCloudRetry');
  if (results) results.innerHTML = '';
  if (empty) { empty.hidden = true; empty.textContent = ''; }
  if (help)  help.hidden = true;
  if (btn) { btn.disabled = true; btn.classList.add('loading'); }

  const fail = (key) => {
    if (empty) { empty.textContent = ctx.t(key); empty.hidden = false; }
    if (help) help.hidden = true;   // web-login replaces the old Windows bridge instructions
  };

  // 1. Sign in to the Anycubic cloud (cross-platform): open the official site
  //    in a window, the user logs in, we read the workbench token. No CDP.
  let tok;
  try { tok = await window.anycubic?.cloud?.webLogin(); }
  catch (e) { tok = { ok: false, error: e?.message || 'login' }; }
  if (!tok?.ok) {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    if (help) help.hidden = true;            // no Windows bridge instructions with web login
    if (tok?.error === 'cancelled') { if (empty) empty.hidden = true; return; } // user closed the window — silent
    if (empty) { empty.textContent = ctx.t('acuCloudErrRest'); empty.hidden = false; }
    return;
  }

  // 2. List the account's cloud printers.
  let res;
  try { res = await window.anycubic?.cloud?.getPrinters(tok.token); }
  catch (e) { res = { ok: false, error: e?.message || 'rest' }; }
  if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
  if (!res?.ok) return fail('acuCloudErrRest');

  const printers = Array.isArray(res.printers) ? res.printers : [];
  if (!printers.length) { if (empty) { empty.textContent = ctx.t('acuCloudErrNoPrinters'); empty.hidden = false; } return; }

  for (const p of printers) {
    const wrap = document.createElement('div');
    wrap.innerHTML = _acuCloudCardHtml(p);
    const card = wrap.firstElementChild;
    if (!card) continue;
    if (p.online) {
      const add = async () => {
        card.classList.add('is-busy');
        const r = await ctx.addAnycubicCloudPrinter({
          cloudPrinterId: p.id,
          machineType:    p.machineType,
          key:            p.key,
          cloudToken:     tok.token,
          cloudEmail:     tok.email,
          printerName:    p.name,
          printerModelId: acuCatalogIdFromModel(String(p.machineType), p.name),
        });
        if (r?.ok) { _closeAll(); }
        else { card.classList.remove('is-busy'); ctx.toast?.(ctx.t('acuCloudAddFailed'), 'error'); }
      };
      card.addEventListener('click', add);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(); } });
    }
    results?.appendChild(card);
  }
}

function _openCloudPanel() {
  _ensureDOM();
  _openPanel('acuCloudOverlay');
  _runCloudProvision();
}

// ── Scan panel logic ─────────────────────────────────────────────────────────

function _openScanPanel() {
  _ensureDOM();

  const results = document.getElementById('acuScanResults');
  const empty   = document.getElementById('acuScanEmpty');
  const bar     = document.getElementById('acuScanBar');
  const stats   = document.getElementById('acuScanStats');
  const sub     = document.getElementById('acuScanSub');
  if (results) results.innerHTML = '';
  if (empty)   empty.hidden = true;
  if (bar)     bar.style.width = '0%';
  if (stats)   stats.textContent = '0 / 100';
  if (sub)     sub.textContent = ctx.t('snapScanStarting') || 'Starting scan…';

  acuScanLogClear();
  const logSection = document.getElementById('acuScanLog');
  if (logSection) logSection.hidden = !ctx.isDebugEnabled();

  const ipDetails = document.getElementById('acuAddIpDetails');
  if (ipDetails) ipDetails.open = false;

  if (_acuChipsUnsub) { _acuChipsUnsub(); _acuChipsUnsub = null; }
  _acuChipsUnsub = extraSubnets.renderChipsInto('acuExtraSubnetsChips', ctx.esc, ctx.t);

  _openPanel('acuScanOverlay');

  _acuScanCtl = new AbortController();
  const signal = _acuScanCtl.signal;
  let found = 0;

  acuScanLan({
    signal,
    logPush: acuScanLogPush,
    getExtraSubnets: () => extraSubnets.loadList(),
    onCandidate(c) {
      found++;
      if (empty) empty.hidden = true;
      const wrap = document.createElement('div');
      wrap.innerHTML = _acuCandidateCardHtml(c);
      const card = wrap.firstElementChild;
      if (!card) return;
      const triggerAdd = () => {
        acuAbortScan();
        _closePanel('acuScanOverlay');
        _continueWithCandidate(c);
      };
      card.addEventListener('click', triggerAdd);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerAdd(); }
      });
      document.getElementById('acuScanResults')?.appendChild(card);
    },
    onProgress({ done: d, total: t }) {
      if (bar)   bar.style.width   = `${Math.min(100, Math.round((d / t) * 100))}%`;
      if (stats) stats.textContent = `${d} / ${t}`;
    },
  }).then(() => {
    if (bar)   bar.style.width = '100%';
    if (sub)   sub.textContent = '';
    if (!signal.aborted && found === 0) {
      if (empty) empty.hidden = false;
      acuScanLogPush('warn', 'Scan complete — no Anycubic printers found');
    } else if (!signal.aborted) {
      acuScanLogPush('info', `Scan complete — ${found} printer(s) found`);
    }
  }).catch(e => {
    if (e?.name !== 'AbortError') acuScanLogPush('err', `Scan error: ${e?.message || e}`);
  });
}

// ── Add-by-IP + Manual probe handlers ────────────────────────────────────────

async function _handleAddByIp() {
  const input    = document.getElementById('acuAddIpInput');
  const btn      = document.getElementById('acuAddIpBtn');
  const statusEl = document.getElementById('acuAddIpStatus');
  if (!input || !btn) return;
  const ip = input.value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return;

  btn.disabled = true;
  btn.classList.add('loading');
  if (statusEl) { statusEl.hidden = false; statusEl.textContent = ctx.t('snapManualProbing', { ip }) || `Reaching ${ip}…`; }

  acuScanLogPush('info', `Manual /info probe: ${ip}…`);
  const c = await acuProbeIp(ip, undefined, { logPush: acuScanLogPush, directInfo: true });

  btn.disabled = false;
  btn.classList.remove('loading');

  if (c) {
    acuAbortScan();
    _closePanel('acuScanOverlay');
    _continueWithCandidate(c);
  } else if (statusEl) {
    statusEl.hidden = false;
    statusEl.textContent = ctx.t('snapManualNoReply', { ip }) || `No reply from ${ip}.`;
  }
}

async function _handleManualProbe() {
  const input = document.getElementById('acuManualIpInput');
  const errEl = document.getElementById('acuManualIpError');
  const btn   = document.getElementById('acuManualProbeBtn');
  if (!input) return;
  const ip = input.value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    if (errEl) { errEl.textContent = ctx.t('snapAddByIpInvalid') || 'Invalid IP address format'; errEl.hidden = false; }
    input.focus();
    return;
  }
  if (errEl) errEl.hidden = true;
  if (btn)  { btn.disabled = true; btn.classList.add('loading'); }

  const c = await acuProbeIp(ip, undefined, { logPush: () => {}, directInfo: true });

  if (btn) { btn.disabled = false; btn.classList.remove('loading'); }

  if (c) {
    _closePanel('acuManualOverlay');
    _continueWithCandidate(c);
  } else if (errEl) {
    errEl.textContent = ctx.t('snapManualNoReply', { ip }) || `No reply from ${ip}.`;
    errEl.hidden = false;
  }
}

function _openManualPanel() {
  _ensureDOM();
  const input = document.getElementById('acuManualIpInput');
  const errEl = document.getElementById('acuManualIpError');
  if (input) input.value = '';
  if (errEl) errEl.hidden = true;
  _openPanel('acuManualOverlay');
  setTimeout(() => input?.focus(), 80);
}

// ── Public entry point ───────────────────────────────────────────────────────

export function openAcuAddFlow() {
  _ensureDOM();
  _openPanel('acuChoiceOverlay');
}
