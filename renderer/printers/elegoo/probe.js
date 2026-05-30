/**
 * printers/elegoo/probe.js — Network discovery layer for Elegoo printers.
 *
 * Pure data layer — no DOM, no UI. Calls main-process IPC:
 *   - elegooUdpDiscover(prefixes) — single-shot UDP unicast spray of
 *     {"id":0,"method":7000} to ip:52700 across each /24 prefix. Returns all
 *     candidates after the 2.4 s listen window. Mirrors the Flutter scanner.
 *   - elegooUdpProbe(ip)          — targeted single-IP probe (two sends 60 ms
 *     apart, 1.4 s listen) for manual "Add by IP".
 *
 * Discovery is keyed on the source IP of the reply; the sn (mainboard serial)
 * is REQUIRED for MQTT connection later, so we surface it in the candidate.
 */

const ELG_SCAN_EXPECTED_MS = 3500;   // for the smooth progress animation
const ELG_COMMON_SUBNETS   = ['192.168.1', '192.168.40'];

let _elgScanLastEnv = null;

/** Returns the env snapshot captured during the most recent scan. */
export function getLastElgScanEnv() { return _elgScanLastEnv; }

// ── Model resolution ────────────────────────────────────────────────────────
// The Elegoo catalog (data/printers/eleg_printer_models.json) only has the
// Centauri Carbon 2 (id "1") + placeholder (id "0"). Discovery returns the
// model name as a string; substring-match "centauri" / "centaury" (the
// catalog itself spells it "Centaury" — typo).

/**
 * @param {string|null} model - `machine_model` from the discovery reply.
 * @returns {string} Catalog id.
 */
export function elegooModelIdFromMachineModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('centauri') || m.includes('centaury')) return '1';
  return '0';
}

// ── Single-IP probe (manual "Add by IP") ─────────────────────────────────────

export async function elegooProbeIp(ip, _signal, { logPush } = {}) {
  if (!ip) return null;
  if (typeof window.electronAPI?.elegooUdpProbe !== 'function') {
    logPush?.('err', 'elegooUdpProbe IPC bridge missing — fully quit and relaunch the app');
    return null;
  }
  let res;
  try { res = await window.electronAPI.elegooUdpProbe(ip); }
  catch (e) { logPush?.('err', `UDP probe failed: ${e?.message || e}`); return null; }
  if (!res?.ok || !res.candidate) {
    logPush?.('ambiguous', `${ip} — no Elegoo response on :52700`, res);
    return null;
  }
  const c = res.candidate;
  const modelId = elegooModelIdFromMachineModel(c.machineModel);
  const candidate = { ...c, modelId };
  logPush?.('found', `${ip} → ${c.machineModel || c.hostName || 'Elegoo'}${c.sn ? ' (sn:' + c.sn + ')' : ''}`, candidate);
  return candidate;
}

// ── LAN scan (UDP spray) ─────────────────────────────────────────────────────

export async function elegooScanLan({ onCandidate, onProgress, signal, logPush, getExtraSubnets } = {}) {
  if (typeof window.electronAPI?.elegooUdpDiscover !== 'function') {
    logPush?.('err', 'elegooUdpDiscover IPC bridge missing — fully quit and relaunch the app to enable the Elegoo LAN scan');
    onProgress?.({ done: 100, total: 100, prefixes: [] });
    return [];
  }
  const startMs = Date.now();

  // Build prefix list — local NIC subnets + always-include Elegoo common subnets + user extras.
  let primary = [];
  try { primary = (await window.electronAPI.getLocalSubnets()) ?? []; }
  catch { primary = []; }
  for (const p of ELG_COMMON_SUBNETS) if (!primary.includes(p)) primary.push(p);
  if (!primary.length) primary = [...ELG_COMMON_SUBNETS];
  const extras = (getExtraSubnets?.() ?? []).filter(p => p && !primary.includes(p));
  const prefixes = [...primary, ...extras];
  logPush?.('info', `UDP spray :52700 — subnets [${primary.join(', ')}]${extras.length ? ` + extra [${extras.join(', ')}]` : ''}`);

  // Progress animation — the IPC is single-shot.
  let progressTimer = null;
  const stopProgress = () => { if (progressTimer) clearInterval(progressTimer); progressTimer = null; };
  onProgress?.({ done: 0, total: 100, prefixes });
  progressTimer = setInterval(() => {
    if (signal?.aborted) { stopProgress(); return; }
    const elapsed = Date.now() - startMs;
    const pct = Math.min(95, Math.round((elapsed / ELG_SCAN_EXPECTED_MS) * 100));
    onProgress?.({ done: pct, total: 100, prefixes });
  }, 120);

  let result;
  try { result = await window.electronAPI.elegooUdpDiscover(prefixes); }
  catch (e) {
    stopProgress();
    logPush?.('err', `UDP discovery failed: ${e?.message || e}`);
    onProgress?.({ done: 100, total: 100, prefixes });
    return [];
  }
  stopProgress();
  if (signal?.aborted) return [];

  const raw = Array.isArray(result?.candidates) ? result.candidates : [];
  if (result?.ok === false) logPush?.('warn', `UDP error: ${result.error || 'unknown'}`);

  const out = raw.map(c => ({
    ...c,
    modelId: elegooModelIdFromMachineModel(c.machineModel),
  })).sort((a, b) => (b.score || 0) - (a.score || 0) ||
    String(a.ip || '').localeCompare(String(b.ip || ''), undefined, { numeric: true, sensitivity: 'base' }));

  for (const c of out) {
    if (signal?.aborted) break;
    onCandidate?.(c);
  }
  onProgress?.({ done: 100, total: 100, prefixes });
  logPush?.('info', `UDP scan complete — ${out.length} Elegoo printer(s) in ${Math.round((Date.now() - startMs) / 100) / 10}s`);

  _elgScanLastEnv = {
    method: 'udp-spray', port: 52700, prefixes,
    durationMs: Date.now() - startMs, found: out.length,
  };
  return out;
}

// ── Discovery record builder ─────────────────────────────────────────────────

export function elegooBuildDiscoveryRecord(c) {
  return {
    method:          'lan-scan',
    transport:       'udp-52700',
    ip:              c?.ip              || null,
    sn:              c?.sn              || null,
    machineModel:    c?.machineModel    || null,
    hostName:        c?.hostName        || null,
    protocolVersion: c?.protocolVersion || null,
    otaVersion:      c?.otaVersion      || null,
    tokenStatus:     c?.tokenStatus     ?? null,
    lanStatus:       c?.lanStatus       ?? null,
    scannedAt:       Date.now(),
  };
}
