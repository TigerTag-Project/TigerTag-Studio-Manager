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

/** Open the Printer Settings add form prefilled from a candidate. */
function _continueWith(c) {
  const modelId = c.modelId || bambuModelIdFromCode(c.model, c.serial);
  // Bambu form uses `broker` (not `ip`) as the IP field key. The generalised
  // schemaWidget prefill maps any schema field key from the prefill payload.
  ctx.openPrinterSettings('bambulab', null, {
    broker:       c.ip || '',
    serialNumber: c.serial || '',
    printerName:  c.name || (c.serial ? `Bambu ${c.serial}` : `Bambu ${c.ip || ''}`),
    modelId,
    discovery:    bambuBuildDiscoveryRecord(c),
  });
}

// ── Generic panel helpers ────────────────────────────────────────────────────

function _openPanel(id)  { document.getElementById(id)?.classList.add('open'); }
function _closePanel(id) { document.getElementById(id)?.classList.remove('open'); }

function _closeAll() {
  bblAbortScan();
  _closePanel('bblChoiceOverlay');
  _closePanel('bblScanOverlay');
  _closePanel('bblManualOverlay');
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
  $('bblChoiceScan')?.addEventListener('click', () => { _closePanel('bblChoiceOverlay'); _openScanPanel(); });
  $('bblChoiceManual')?.addEventListener('click', () => { _closePanel('bblChoiceOverlay'); _openManualPanel(); });

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

// ── Scan panel logic ─────────────────────────────────────────────────────────

function _openScanPanel() {
  _ensureDOM();

  const results = document.getElementById('bblScanResults');
  const empty   = document.getElementById('bblScanEmpty');
  const bar     = document.getElementById('bblScanBar');
  const stats   = document.getElementById('bblScanStats');
  const sub     = document.getElementById('bblScanSub');
  if (results) results.innerHTML = '';
  if (empty)   empty.hidden = true;
  if (bar)     bar.style.width = '0%';
  if (stats)   stats.textContent = '0 / 100';
  if (sub)     sub.textContent = ctx.t('snapScanStarting') || 'Starting scan…';

  bblScanLogClear();
  const logSection = document.getElementById('bblScanLog');
  if (logSection) logSection.hidden = !ctx.isDebugEnabled();

  const ipDetails = document.getElementById('bblAddIpDetails');
  if (ipDetails) ipDetails.open = false;

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
      const triggerAdd = () => {
        bblAbortScan();
        _closePanel('bblScanOverlay');
        _continueWith(c);
      };
      card.addEventListener('click', triggerAdd);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerAdd(); }
      });
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
