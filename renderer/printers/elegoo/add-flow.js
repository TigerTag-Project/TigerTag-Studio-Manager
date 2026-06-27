/**
 * printers/elegoo/add-flow.js — Elegoo "add printer" UI flow.
 *
 * Owns the three panels of the add sequence:
 *   1. Choice modal  — Scan vs Manual Add.
 *   2. Scan panel    — UDP unicast spray on :52700 across local /24 prefixes,
 *                      with one-click add and a power-user "extra subnets" widget.
 *   3. Manual modal  — direct IP entry + targeted UDP probe.
 *
 * Network / data work (UDP discovery) lives in probe.js. Structure mirrors
 * creality/add-flow.js — almost all UI strings reuse the shared `snap*`
 * i18n keys; only the brand title + empty state are Elegoo-specific.
 *
 * Entry point: openElgAddFlow() — called from the brand picker in inventory.js.
 */

import { ctx } from '../context.js';
import * as extraSubnets from '../extra-subnets.js';
import {
  elegooProbeIp,
  elegooScanLan,
  elegooBuildDiscoveryRecord,
  elegooModelIdFromMachineModel,
  getLastElgScanEnv,
} from './probe.js';

// ── Scan log ─────────────────────────────────────────────────────────────────

let _elgScanLog = [];

function elgScanLogPush(kind, summary, raw) {
  _elgScanLog.push({ ts: Date.now(), kind, summary, raw: raw ?? null });

  const body = document.getElementById('elgScanLogBody');
  if (!body || body.hidden) {
    const count = document.getElementById('elgScanLogCount');
    if (count) count.textContent = String(_elgScanLog.length);
    return;
  }
  const row = document.createElement('div');
  row.className = `snap-scan-log-row snap-scan-log-row--${kind}`;
  row.innerHTML = `
    <span class="snap-scan-log-ts">${ctx.esc(String(_elgScanLog.length))}</span>
    <span class="snap-scan-log-kind">${ctx.esc(kind)}</span>
    <span class="snap-scan-log-summary">${ctx.esc(summary)}</span>`;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;

  const count = document.getElementById('elgScanLogCount');
  if (count) count.textContent = String(_elgScanLog.length);
}

function elgScanLogClear() {
  _elgScanLog = [];
  const body = document.getElementById('elgScanLogBody');
  if (body) body.innerHTML = '';
  const count = document.getElementById('elgScanLogCount');
  if (count) count.textContent = '0';
}

// ── Extra subnets — shared store (printers/extra-subnets.js, Firestore-synced) ─
function elgLoadExtraSubnets() { return extraSubnets.loadList(); }

let _elgChipsUnsub = null;
function _renderExtraSubnetChips() {
  if (_elgChipsUnsub) { _elgChipsUnsub(); _elgChipsUnsub = null; }
  _elgChipsUnsub = extraSubnets.renderChipsInto("elgExtraSubnetsChips", ctx.esc, ctx.t);
}

// ── Scan state ───────────────────────────────────────────────────────────────

let _elgScanCtl = null;
function elgAbortScan() { if (_elgScanCtl && !_elgScanCtl.signal.aborted) _elgScanCtl.abort(); }

// ── Candidate card ───────────────────────────────────────────────────────────

function _elgCandidateCardHtml(c) {
  const modelId   = c.modelId || elegooModelIdFromMachineModel(c.machineModel);
  const matched   = ctx.findPrinterModel('elegoo', modelId);
  const fallback  = ctx.findPrinterModel('elegoo', '0');
  const modelName = matched && String(matched.id) !== '0' ? matched.name : null;
  const title     = c.hostName || modelName || c.machineModel || c.ip;
  const modelLine = modelName && modelName !== title ? modelName
                  : (c.machineModel && c.machineModel !== title ? c.machineModel : '');
  const snLine    = c.sn ? `SN · ${c.sn}` : '';

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

function _continueWith(c) {
  const modelId = c.modelId || elegooModelIdFromMachineModel(c.machineModel);
  ctx.openPrinterSettings('elegoo', null, {
    ip:          c.ip || '',
    sn:          c.sn || '',
    printerName: c.hostName || c.machineModel || (c.ip ? `Elegoo ${c.ip}` : 'Elegoo'),
    modelId,
    discovery:   elegooBuildDiscoveryRecord(c),
  });
}

// ── Generic panel helpers ────────────────────────────────────────────────────

function _openPanel(id)  { document.getElementById(id)?.classList.add('open'); }
function _closePanel(id) { document.getElementById(id)?.classList.remove('open'); }
function _closeAll() {
  elgAbortScan();
  _closePanel('elgChoiceOverlay');
  _closePanel('elgScanOverlay');
  _closePanel('elgManualOverlay');
}

// ── Lazy DOM creation ────────────────────────────────────────────────────────

let _domReady = false;

function _ensureDOM() {
  if (_domReady) return;
  _domReady = true;

  const root = document.createElement('div');
  root.id = 'elgAddFlowRoot';
  root.innerHTML = /* html */`

<div class="modal-overlay" id="elgChoiceOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="elegooAddChoiceTitle">Add Elegoo printer</div>
        <div class="pba-sub"   data-i18n="snapAddChoiceSub">How do you want to find your printer?</div>
      </div>
      <button class="modal-close" id="elgChoiceClose">✕</button>
    </div>
    <div class="pba-brands">
      <button type="button" class="pba-brand" id="elgChoiceScan">
        <span class="pba-brand-dot" style="background:#00a3e0"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceScan">Scan network</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceScanHint">Auto-discover printers on your LAN</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
      <button type="button" class="pba-brand" id="elgChoiceManual">
        <span class="pba-brand-dot" style="background:#00a3e0"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceManual">Enter IP address</span>
          <span class="pba-brand-conn"  data-i18n="snapAddChoiceManualHint">Manually enter the printer's local IP</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="elgChoiceBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button type="button" class="pba-brand-tuto-link" id="elgChoiceTuto">
        <span class="icon icon-bulb icon-13"></span>
        <span data-i18n="tutoOpenBtn">Connection tutorial</span>
      </button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="elgScanOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapScanTitle">Scanning network…</div>
        <div class="pba-sub" id="elgScanSub"></div>
      </div>
      <button class="modal-close" id="elgScanClose">✕</button>
    </div>
    <div class="snap-scan-body">

      <div class="snap-scan-progress">
        <div class="snap-scan-bar"><span id="elgScanBar"></span></div>
        <div class="snap-scan-stats" id="elgScanStats">0 / 100</div>
      </div>

      <details class="snap-add-ip" id="elgAddIpDetails">
        <summary class="snap-add-ip-summary">
          <span class="snap-add-ip-summary-icon icon icon-plus icon-13"></span>
          <span class="snap-add-ip-summary-label" data-i18n="snapAddByIpButton">Add by IP</span>
          <span class="snap-add-ip-chev icon icon-chevron-r icon-13"></span>
        </summary>
        <div class="snap-add-ip-body">
          <label class="snap-add-ip-label" data-i18n="snapAddByIpLabel">IP address</label>
          <span class="snap-add-ip-input-wrap">
            <input type="text" inputmode="decimal" class="snap-add-ip-input" id="elgAddIpInput"
                   placeholder="192.168.1.51" autocomplete="off" autocapitalize="off"
                   spellcheck="false" maxlength="15"/>
            <span class="snap-add-ip-tip" id="elgAddIpTip" hidden role="alert">
              <span class="icon icon-info icon-13"></span>
              <span data-i18n="snapAddByIpInvalid">Invalid IP address format</span>
            </span>
          </span>
          <button type="button" class="adf-btn adf-btn--primary snap-add-ip-btn"
                  id="elgAddIpBtn" disabled>
            <span class="icon icon-check icon-13"></span>
            <span class="label" data-i18n="snapAddByIpValidate">Validate</span>
            <span class="spinner"></span>
          </button>
          <div class="snap-add-ip-status" id="elgAddIpStatus" hidden></div>
        </div>
      </details>

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
            <input type="text" class="snap-extra-subnets-input" id="elgExtraSubnetsInput"
                   placeholder="192.168.40" autocomplete="off" autocapitalize="off" spellcheck="false"/>
            <button type="button" class="snap-extra-subnets-add"
                    id="elgExtraSubnetsAdd" data-i18n="snapScanExtraSubnetsAdd">Add</button>
          </div>
          <div class="snap-extra-subnets-err" id="elgExtraSubnetsErr" hidden></div>
          <div class="snap-extra-subnets-chips" id="elgExtraSubnetsChips"></div>
        </div>
      </details>

      <div class="snap-scan-results" id="elgScanResults"></div>
      <div class="snap-scan-empty" id="elgScanEmpty" hidden data-i18n="elegooScanEmpty">
        No Elegoo printers found on your LAN
      </div>

      <section class="snap-scan-log" id="elgScanLog" hidden>
        <header class="snap-scan-log-head">
          <button type="button" class="snap-scan-log-toggle" id="elgScanLogToggle"
                  aria-expanded="false" aria-label="Scan log" data-i18n-title="snapScanLogTitle"
                  title="Scan log">
            <span class="icon icon-chevron-r icon-13 snap-scan-log-chev"></span>
            <span class="icon icon-list icon-13 snap-scan-log-title-icon"></span>
            <span class="snap-scan-log-count" id="elgScanLogCount">0</span>
          </button>
          <span class="snap-scan-log-actions">
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--primary snap-scan-log-btn--icon"
                    id="elgScanLogExport" data-i18n-title="snapScanLogExport" aria-label="Export" title="Export">
              <span class="icon icon-copy icon-13"></span>
            </button>
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--icon"
                    id="elgScanLogClear" data-i18n-title="snapScanLogClear" aria-label="Clear" title="Clear">
              <span class="icon icon-trash icon-13"></span>
            </button>
          </span>
        </header>
        <div class="snap-scan-log-body" id="elgScanLogBody" hidden></div>
      </section>

    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="elgScanBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--secondary" id="elgScanRestart">
        <span class="icon icon-refresh icon-13"></span>
        <span data-i18n="snapScanRestart">Restart scan</span>
      </button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="elgManualOverlay" role="dialog" aria-modal="true">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapManualTitle">Manual add</div>
        <div class="pba-sub"   data-i18n="snapManualSub">Type the printer's local IP — we'll probe it to pre-fill the rest.</div>
      </div>
      <button class="modal-close" id="elgManualClose">✕</button>
    </div>
    <div class="pba-body">
      <div class="pba-field">
        <span class="pba-field-label" data-i18n="printerLblIP">
          IP address <span class="pba-field-req">*</span>
        </span>
        <input type="text" id="elgManualIpInput" class="pba-input pba-input--mono"
               placeholder="192.168.1.51" maxlength="15"
               spellcheck="false" autocomplete="off" autocapitalize="off"/>
        <div class="pba-error" id="elgManualIpError" hidden></div>
      </div>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="elgManualBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--primary" id="elgManualProbeBtn">
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

  $('elgChoiceClose')?.addEventListener('click', _closeAll);
  $('elgChoiceOverlay')?.addEventListener('click', e => { if (e.target.id === 'elgChoiceOverlay') _closeAll(); });
  $('elgChoiceBack')?.addEventListener('click', () => { _closePanel('elgChoiceOverlay'); ctx.openBrandPicker(); });
  $('elgChoiceTuto')?.addEventListener('click', () => ctx.openTutorial('elegoo'));
  $('elgChoiceScan')?.addEventListener('click', () => { _closePanel('elgChoiceOverlay'); _openScanPanel(); });
  $('elgChoiceManual')?.addEventListener('click', () => { _closePanel('elgChoiceOverlay'); _openManualPanel(); });

  $('elgScanClose')?.addEventListener('click', _closeAll);
  $('elgScanOverlay')?.addEventListener('click', e => { if (e.target.id === 'elgScanOverlay') _closeAll(); });
  $('elgScanBack')?.addEventListener('click', () => { elgAbortScan(); _closePanel('elgScanOverlay'); _openPanel('elgChoiceOverlay'); });
  $('elgScanRestart')?.addEventListener('click', () => { elgAbortScan(); _openScanPanel(); });

  const addIpInput = $('elgAddIpInput');
  const addIpBtn   = $('elgAddIpBtn');
  const addIpTip   = $('elgAddIpTip');
  if (addIpInput) {
    addIpInput.addEventListener('input', () => {
      const valid = /^\d{1,3}(\.\d{1,3}){3}$/.test(addIpInput.value.trim());
      if (addIpBtn) addIpBtn.disabled = !valid;
      if (addIpTip) addIpTip.hidden   = valid || !addIpInput.value;
    });
    addIpInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !addIpBtn?.disabled) _handleAddByIp();
    });
    $('elgAddIpDetails')?.addEventListener('toggle', e => {
      if (!e.target.open) {
        addIpInput.value = '';
        if (addIpBtn) addIpBtn.disabled = true;
        if (addIpTip) addIpTip.hidden   = true;
        const status = $('elgAddIpStatus');
        if (status) { status.hidden = true; status.textContent = ''; }
      }
    });
  }
  $('elgAddIpBtn')?.addEventListener('click', _handleAddByIp);

  $('elgExtraSubnetsAdd')?.addEventListener('click', () => {
    const input = $('elgExtraSubnetsInput');
    if (!input) return;
    if (extraSubnets.addPrefix(input.value)) input.value = '';
  });
  $('elgExtraSubnetsInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('elgExtraSubnetsAdd')?.click();
  });

  $('elgScanLogToggle')?.addEventListener('click', () => {
    const body   = $('elgScanLogBody');
    const toggle = $('elgScanLogToggle');
    if (!body || !toggle) return;
    const open = body.hidden;
    body.hidden = !open;
    toggle.classList.toggle('snap-scan-log-toggle--open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  $('elgScanLogExport')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ log: _elgScanLog, environment: getLastElgScanEnv() }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `elg-scan-${Date.now()}.json`;
    a.click();
  });
  $('elgScanLogClear')?.addEventListener('click', elgScanLogClear);

  $('elgManualClose')?.addEventListener('click', _closeAll);
  $('elgManualOverlay')?.addEventListener('click', e => { if (e.target.id === 'elgManualOverlay') _closeAll(); });
  $('elgManualBack')?.addEventListener('click', () => { _closePanel('elgManualOverlay'); _openPanel('elgChoiceOverlay'); });
  $('elgManualProbeBtn')?.addEventListener('click', _handleManualProbe);
  $('elgManualIpInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleManualProbe(); });
}

// ── Scan panel logic ─────────────────────────────────────────────────────────

function _openScanPanel() {
  _ensureDOM();

  const results = document.getElementById('elgScanResults');
  const empty   = document.getElementById('elgScanEmpty');
  const bar     = document.getElementById('elgScanBar');
  const stats   = document.getElementById('elgScanStats');
  const sub     = document.getElementById('elgScanSub');
  if (results) results.innerHTML = '';
  if (empty)   empty.hidden = true;
  if (bar)     bar.style.width = '0%';
  if (stats)   stats.textContent = '0 / 100';
  if (sub)     sub.textContent = ctx.t('snapScanStarting') || 'Starting scan…';

  elgScanLogClear();
  _renderExtraSubnetChips();
  const logSection = document.getElementById('elgScanLog');
  if (logSection) logSection.hidden = !ctx.isDebugEnabled();

  const ipDetails = document.getElementById('elgAddIpDetails');
  if (ipDetails) ipDetails.open = false;

  _openPanel('elgScanOverlay');

  _elgScanCtl = new AbortController();
  const signal = _elgScanCtl.signal;
  let found = 0;

  elegooScanLan({
    signal,
    logPush: elgScanLogPush,
    getExtraSubnets: elgLoadExtraSubnets,
    onCandidate(c) {
      found++;
      if (empty) empty.hidden = true;
      const wrap = document.createElement('div');
      wrap.innerHTML = _elgCandidateCardHtml(c);
      const card = wrap.firstElementChild;
      if (!card) return;
      const triggerAdd = () => { elgAbortScan(); _closePanel('elgScanOverlay'); _continueWith(c); };
      card.addEventListener('click', triggerAdd);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerAdd(); } });
      document.getElementById('elgScanResults')?.appendChild(card);
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
      elgScanLogPush('warn', 'Scan complete — no Elegoo printers found');
    } else if (!signal.aborted) {
      elgScanLogPush('info', `Scan complete — ${found} printer(s) found`);
    }
  }).catch(e => {
    if (e?.name !== 'AbortError') elgScanLogPush('err', `Scan error: ${e?.message || e}`);
  });
}

async function _handleAddByIp() {
  const input    = document.getElementById('elgAddIpInput');
  const btn      = document.getElementById('elgAddIpBtn');
  const statusEl = document.getElementById('elgAddIpStatus');
  if (!input || !btn) return;
  const ip = input.value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return;

  btn.disabled = true;
  btn.classList.add('loading');
  if (statusEl) { statusEl.hidden = false; statusEl.textContent = ctx.t('snapManualProbing', { ip }) || `Reaching ${ip}…`; }

  elgScanLogPush('info', `Manual UDP probe: ${ip}…`);
  const c = await elegooProbeIp(ip, undefined, { logPush: elgScanLogPush });

  btn.disabled = false;
  btn.classList.remove('loading');

  if (c) {
    elgAbortScan();
    _closePanel('elgScanOverlay');
    _continueWith(c);
  } else if (statusEl) {
    statusEl.hidden = false;
    statusEl.textContent = ctx.t('snapManualNoReply', { ip }) || `No reply from ${ip}.`;
  }
}

async function _handleManualProbe() {
  const input = document.getElementById('elgManualIpInput');
  const errEl = document.getElementById('elgManualIpError');
  const btn   = document.getElementById('elgManualProbeBtn');
  if (!input) return;
  const ip = input.value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    if (errEl) { errEl.textContent = ctx.t('snapAddByIpInvalid') || 'Invalid IP address format'; errEl.hidden = false; }
    input.focus();
    return;
  }
  if (errEl) errEl.hidden = true;
  if (btn)  { btn.disabled = true; btn.classList.add('loading'); }

  const c = await elegooProbeIp(ip, undefined, { logPush: () => {} });

  if (btn) { btn.disabled = false; btn.classList.remove('loading'); }

  if (c) {
    _closePanel('elgManualOverlay');
    _continueWith(c);
  } else if (errEl) {
    errEl.textContent = ctx.t('snapManualNoReply', { ip }) || `No reply from ${ip}.`;
    errEl.hidden = false;
  }
}

function _openManualPanel() {
  _ensureDOM();
  const input = document.getElementById('elgManualIpInput');
  const errEl = document.getElementById('elgManualIpError');
  if (input) input.value = '';
  if (errEl) errEl.hidden = true;
  _openPanel('elgManualOverlay');
  setTimeout(() => input?.focus(), 80);
}

// ── Public entry point ───────────────────────────────────────────────────────

export function openElgAddFlow() {
  _ensureDOM();
  _openPanel('elgChoiceOverlay');
}
