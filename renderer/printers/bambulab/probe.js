/**
 * printers/bambulab/probe.js — Network discovery layer for Bambu Lab printers.
 *
 * Pure data layer — no DOM, no UI. All raw network work runs in the Electron
 * main process and is exposed via window.electronAPI:
 *   - bambulabSsdpDiscover() — multicast SSDP burst (4 s window) returning
 *     all candidates at once. Mirrors the Flutter mobile scanner.
 *   - bambulabTlsProbe(ip)   — per-IP TLS cert sniff on :8883, used by the
 *     manual "Add by IP" path to confirm a typed host is a Bambu printer.
 *
 * Validation rules (gates applied by the parser in main.js) and field mapping
 * are documented in renderer/printers/bambulab/PROTOCOL.md §12.
 */

const BBL_SSDP_LISTEN_MS = 4000;

let _bblScanLastEnv = null;

/** Returns the env snapshot captured during the most recent scan. */
export function getLastBblScanEnv() { return _bblScanLastEnv; }

// ── Model resolution ────────────────────────────────────────────────────────
// Map the printer's DevModel code (or its serial prefix) onto the local
// printer catalog id used by the add form (data/printers/bbl_printer_models.json).

const BBL_CODE_TO_ID = {
  N1: '1',         // A1 Mini
  N2S: '2',        // A1
  C11: '4',        // P1P
  C12: '3',        // P1S
  C13: '6',        // X1E
  N7: '10',        // P2S
  O1S: '7',        // H2S
  O1D: '8',        // H2D
  O1E: '9',        // H2D Pro
  O1C: '11',       // H2C
  '00M': '5',      // X1C
  'BL-P002': '5',  // X1C (legacy code)
  '3DPRINTER-X1': '5',
  '3DPRINTER-X1-CARBON': '5',
};

const BBL_SERIAL_PREFIX_TO_ID = {
  '030': '1', // N1   → A1 Mini
  '039': '2', // N2S  → A1
  '01P': '3', // C12  → P1S
  '01S': '4', // C11  → P1P
  '00M': '5', // X1C
  '03W': '6', // C13  → X1E
  '22E': '10',// N7   → P2S
};

/**
 * Resolve a discovered Bambu candidate to a catalog id. Tries the explicit
 * DevModel code first, then the serial prefix as a fallback. Returns "0"
 * (Select Printer placeholder) when nothing matches.
 *
 * @param {string|null} code   - DevModel.* value, e.g. "C11", "00M".
 * @param {string|null} serial - Normalized serial number (digits + letters).
 * @returns {string} Catalog id.
 */
export function bambuModelIdFromCode(code, serial) {
  const c = String(code || '').trim().toUpperCase();
  if (BBL_CODE_TO_ID[c]) return BBL_CODE_TO_ID[c];
  const prefix = String(serial || '').slice(0, 3).toUpperCase();
  if (BBL_SERIAL_PREFIX_TO_ID[prefix]) return BBL_SERIAL_PREFIX_TO_ID[prefix];
  return '0';
}

// ── Single-IP probe (manual "Add by IP") ─────────────────────────────────────

/**
 * Confirm a typed IP is a Bambu printer via a TLS cert sniff on :8883.
 * Used by the manual flow — the bulk scan uses SSDP instead.
 *
 * Returns a partial candidate when confirmed (the cert subject may carry the
 * serial as CN; otherwise the user enters it manually).
 *
 * @param {string} ip
 * @param {AbortSignal} [_signal] - unused, reserved for parity with other brands
 * @param {object}      [opts]
 * @param {Function}    [opts.logPush]
 * @returns {Promise<object|null>}
 */
export async function bambuProbeIp(ip, _signal, { logPush } = {}) {
  if (!ip) return null;
  if (typeof window.electronAPI?.bambulabTlsProbe !== 'function') {
    logPush?.('err', 'bambulabTlsProbe IPC bridge missing — fully quit and relaunch the app');
    return null;
  }
  let res;
  try { res = await window.electronAPI.bambulabTlsProbe(ip); }
  catch (e) { logPush?.('err', `TLS probe failed: ${e?.message || e}`); return null; }
  if (!res?.ok) {
    logPush?.('ambiguous', `${ip} — not a Bambu printer (TLS cert mismatch)`, res);
    return null;
  }
  const serial = res.serial || null;
  const modelId = bambuModelIdFromCode(null, serial);
  const candidate = {
    ip, serial, model: null, name: null,
    firmware: null, connect: null, bind: null, signal: null,
    modelId, source: 'tls', raw: res.raw || null,
  };
  logPush?.('found', `${ip} → Bambu confirmed (TLS) — serial: ${serial || '?'}`, candidate);
  return candidate;
}

// ── LAN scan (SSDP) ──────────────────────────────────────────────────────────

/**
 * Run a Bambu Lab LAN scan via the main-process SSDP IPC. The single 4 s
 * listen window catches both unsolicited NOTIFYs and replies to the two
 * paced M-SEARCH probes — main.js handles the protocol details.
 *
 * Progress is animated client-side (the IPC is single-shot) so the bar moves
 * smoothly up to ~95 %, then jumps to 100 % when the IPC resolves.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onCandidate]
 * @param {Function} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.logPush]
 * @returns {Promise<object[]>}
 */
export async function bambuScanLan({ onCandidate, onProgress, signal, logPush } = {}) {
  if (typeof window.electronAPI?.bambulabSsdpDiscover !== 'function') {
    logPush?.('err', 'bambulabSsdpDiscover IPC bridge missing — fully quit and relaunch the app to enable the Bambu LAN scan');
    onProgress?.({ done: 100, total: 100, prefixes: ['ssdp'] });
    return [];
  }
  const startMs = Date.now();
  let progressTimer = null;
  const stopProgress = () => { if (progressTimer) clearInterval(progressTimer); progressTimer = null; };

  logPush?.('info', 'SSDP M-SEARCH → 239.255.255.250:1900 (urn:bambulab-com:device:3dprinter:1, 4 s listen)…');
  onProgress?.({ done: 0, total: 100, prefixes: ['ssdp'] });

  progressTimer = setInterval(() => {
    if (signal?.aborted) { stopProgress(); return; }
    const elapsed = Date.now() - startMs;
    const pct = Math.min(95, Math.round((elapsed / (BBL_SSDP_LISTEN_MS + 500)) * 100));
    onProgress?.({ done: pct, total: 100, prefixes: ['ssdp'] });
  }, 120);

  let result;
  try { result = await window.electronAPI.bambulabSsdpDiscover(); }
  catch (e) {
    stopProgress();
    logPush?.('err', `SSDP failed: ${e?.message || e}`);
    onProgress?.({ done: 100, total: 100, prefixes: ['ssdp'] });
    return [];
  }
  stopProgress();
  if (signal?.aborted) return [];

  const raw = Array.isArray(result?.candidates) ? result.candidates : [];
  if (result?.ok === false) logPush?.('warn', `SSDP error: ${result.error || 'unknown'}`);

  const out = raw.map(c => ({
    ...c,
    modelId: bambuModelIdFromCode(c.model, c.serial),
  })).sort((a, b) => (b.score || 0) - (a.score || 0) ||
    String(a.ip || '').localeCompare(String(b.ip || ''), undefined, { numeric: true, sensitivity: 'base' }));

  for (const c of out) {
    if (signal?.aborted) break;
    logPush?.('found', `${c.ip} · ${c.name || c.model || 'Bambu'}${c.serial ? ' · sn:' + c.serial : ''} · score ${c.score || 0}`, c);
    onCandidate?.(c);
  }
  onProgress?.({ done: 100, total: 100, prefixes: ['ssdp'] });
  logPush?.('info', `SSDP scan complete — ${out.length} Bambu printer(s) in ${Math.round((Date.now() - startMs) / 100) / 10}s`);

  _bblScanLastEnv = {
    method: 'ssdp', listenMs: BBL_SSDP_LISTEN_MS, durationMs: Date.now() - startMs,
    found: out.length,
  };
  return out;
}

// ── Discovery record builder ─────────────────────────────────────────────────

/**
 * Serialise a Bambu candidate for the Firestore device doc's `discovery` field.
 */
export function bambuBuildDiscoveryRecord(c) {
  return {
    method:    'lan-scan',
    transport: c?.source === 'tls' ? 'tls-8883' : 'ssdp-1900',
    ip:        c?.ip       || null,
    serial:    c?.serial   || null,
    model:     c?.model    || null,
    name:      c?.name     || null,
    firmware:  c?.firmware || null,
    connect:   c?.connect  || null,
    bind:      c?.bind     || null,
    signal:    c?.signal   || null,
    scannedAt: Date.now(),
  };
}
