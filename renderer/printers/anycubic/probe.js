/**
 * printers/anycubic/probe.js — Discovery + provisioning data layer.
 *
 * This file contains ONLY network/data logic: no DOM, no UI. It is imported
 * by add-flow.js which wires the UI callbacks (logPush, onCandidate,
 * onProgress) at the call site.
 *
 * Two complementary sources (PROTOCOL.md §3–§4):
 *
 *  A. Slicer-config import (the PRIMARY path) — reads every paired LAN
 *     printer's durable broker credentials from AnycubicSlicerNext's on-disk
 *     cache via the `anycubic:read-slicer-config` IPC. This is the only
 *     source of username/password/deviceId; a scan can never produce them.
 *
 *  B. LAN scan — two-stage per-host probe like the Creality scanner:
 *     TCP :18910 open? (650 ms, main process) → GET /info confirm (main-
 *     process fetch, no CORS). Finds live LAN-mode printers; used to confirm
 *     reachability and to repair a stale DHCP IP on imported credentials.
 *     Candidates are matched to imported creds by IP at the add-flow level.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const ACU_SCAN_BATCH_LOCAL        = 48;  // parallel probes on local subnets
const ACU_SCAN_BATCH_EXTRA        = 4;   // throttled batch for routed extras
const ACU_SCAN_BATCH_GAP_MS_EXTRA = 80;  // inter-batch pause on extra subnets
const ACU_INFO_TIMEOUT_MS         = 2500;

// Common home-router subnets, merged in even when the machine isn't directly
// on them (parity with the other brand scanners).
const ACU_COMMON_SUBNETS = ["192.168.1", "192.168.40"];

// Module-level scan environment — read by add-flow.js for debug exports.
let _acuScanLastEnv = null;

/** Returns the env snapshot captured during the most recent scan. */
export function getLastAcuScanEnv() { return _acuScanLastEnv; }

// ── Model resolution ──────────────────────────────────────────────────────────
// Map Anycubic's numeric model id (or the human model name) onto the local
// printer-catalog id used by the add form (data/printers/acu_printer_models.json).
// Known numeric ids are listed in PROTOCOL.md §6; names cover the rest.

const ACU_MODEL_ID_TO_CATALOG = {
  "20027": "2",   // Kobra 3 V2
  "20030": "5",   // Kobra X
};

/**
 * Resolve a numeric model id / model name to a catalog id. Returns "0"
 * (Select Printer placeholder) when nothing matches.
 *
 * @param {string|null} acuModelId - numeric id, e.g. "20027".
 * @param {string|null} modelName  - e.g. "Anycubic Kobra 3 V2".
 * @returns {string} Catalog id.
 */
export function acuCatalogIdFromModel(acuModelId, modelName) {
  const idKey = String(acuModelId || "").trim();
  if (ACU_MODEL_ID_TO_CATALOG[idKey]) return ACU_MODEL_ID_TO_CATALOG[idKey];

  // Name heuristics — most specific first.
  const hay = String(modelName || "").toLowerCase();
  if (/kobra\s*3\s*v2/.test(hay))  return "2";
  if (/kobra\s*3\s*max/.test(hay)) return "3";
  if (/kobra\s*s1/.test(hay))      return "4";
  if (/kobra\s*x/.test(hay))       return "5";
  if (/kobra\s*3/.test(hay))       return "1";
  return "0";
}

// ── Slicer-config import ──────────────────────────────────────────────────────

/**
 * Read every paired LAN printer's credentials from the slicer's on-disk
 * config (PROTOCOL.md §4). The slicer does NOT need to be running.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.logPush] - `(kind, summary, raw?) => void`
 * @returns {Promise<{ printers: object[], confPath: string|null, error: string|null }>}
 *   `printers` entries: { ip, port, username, password, deviceId, modelId, name }.
 *   `error` is a machine code for add-flow.js to translate:
 *   "config-not-found" | "no-lan-printers" | "no-complete-creds" |
 *   "decode-failed:…" | "bridge-missing" | anything else (raw message).
 */
export async function acuReadSlicerCreds({ logPush } = {}) {
  if (typeof window.anycubic?.readSlicerConfig !== "function") {
    logPush?.("err", "anycubic.readSlicerConfig IPC bridge missing — fully quit and relaunch the app");
    return { printers: [], confPath: null, error: "bridge-missing" };
  }
  let res;
  try { res = await window.anycubic.readSlicerConfig(); }
  catch (e) {
    logPush?.("err", `Slicer config read failed: ${e?.message || e}`);
    return { printers: [], confPath: null, error: e?.message || String(e) };
  }
  if (!res?.ok) {
    logPush?.("warn", `Slicer config: ${res?.error || "unknown error"}`);
    return { printers: [], confPath: null, error: res?.error || "unknown" };
  }
  logPush?.("found", `Slicer config: ${res.printers.length} paired LAN printer(s)`, res.printers.map(p => ({ ip: p.ip, name: p.name })));
  return { printers: res.printers, confPath: res.confPath || null, error: null };
}

// ── Single-IP probe (scan stage B + manual "Add by IP") ───────────────────────

/**
 * Probe one IP: TCP :18910 open check (skippable), then GET /info confirm.
 * Returns a candidate or null. Candidates carry NO credentials (see header).
 *
 * @param {string}      ip
 * @param {AbortSignal} [signal]
 * @param {object}      [opts]
 * @param {Function}    [opts.logPush]
 * @param {boolean}     [opts.directInfo] - Skip the TCP pre-filter (targeted
 *                                          single-IP probes; /info itself
 *                                          proves reachability).
 * @returns {Promise<object|null>} { ip, acuModelId, modelName, deviceName,
 *                                   cn, usn, catalogId, source } | null
 */
export async function acuProbeIp(ip, signal, { logPush, directInfo = false } = {}) {
  if (!ip) return null;
  if (signal?.aborted) return null;

  if (typeof window.anycubic?.httpInfo !== "function") {
    logPush?.("err", "anycubic.httpInfo IPC bridge missing — fully quit and relaunch the app");
    return null;
  }

  // Stage A — fast TCP port-open filter (main process).
  if (!directInfo) {
    let portOpen = false;
    try { portOpen = !!(await window.anycubic?.tcpProbe?.(ip))?.ok; }
    catch { portOpen = false; }
    if (!portOpen || signal?.aborted) return null;
  }

  // Stage B — /info descriptor confirm.
  let res;
  try { res = await window.anycubic.httpInfo(ip, ACU_INFO_TIMEOUT_MS); }
  catch (e) { logPush?.("err", `${ip} — /info failed: ${e?.message || e}`); return null; }
  if (signal?.aborted) return null;
  if (!res?.ok || !res.info || typeof res.info !== "object") {
    if (!directInfo) logPush?.("ambiguous", `${ip} — :18910 open but no /info answer (${res?.error || "?"})`, res);
    return null;
  }

  const info = res.info;
  const acuModelId = String(info.modelId || "").trim();
  // Gate: an Anycubic FDM descriptor has a numeric modelId + deviceType "fdm".
  if (!/^\d+$/.test(acuModelId) || String(info.deviceType || "").toLowerCase() !== "fdm") {
    logPush?.("ambiguous", `${ip} — /info answered but doesn't look like an Anycubic FDM printer`, info);
    return null;
  }

  const candidate = {
    ip,
    acuModelId,
    modelName:  String(info.modelName  || "").trim() || null,
    deviceName: String(info.deviceName || "").trim() || null,
    cn:         String(info.cn  || "").trim() || null,
    usn:        String(info.usn || "").trim() || null,
    catalogId:  acuCatalogIdFromModel(acuModelId, info.modelName),
    source:     "info",
  };
  logPush?.("found", `${ip} → ${candidate.modelName || "Anycubic"} (modelId ${acuModelId})`, candidate);
  return candidate;
}

// ── LAN scan ─────────────────────────────────────────────────────────────────

/**
 * Scan the local network for LAN-mode Anycubic printers.
 * Same orchestration shape as the Creality scanner.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onCandidate]     `(candidate) => void`
 * @param {Function} [opts.onProgress]      `({ done, total, prefixes }) => void`
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.logPush]         `(kind, summary, raw?) => void`
 * @param {Function} [opts.getExtraSubnets] `() => string[]`
 * @returns {Promise<object[]>} All candidates found.
 */
export async function acuScanLan({
  onCandidate,
  onProgress,
  signal,
  logPush,
  getExtraSubnets,
} = {}) {
  const startMs     = Date.now();
  const candidates  = [];
  const seenIps     = new Set();
  const subnetStats = [];

  const reportCandidate = (c) => {
    if (!c || seenIps.has(c.ip)) return;
    seenIps.add(c.ip);
    candidates.push(c);
    onCandidate?.(c);
  };

  if (typeof window.anycubic?.tcpProbe !== "function") {
    logPush?.("err",
      "anycubic.tcpProbe IPC bridge missing — fully quit and relaunch the app to enable the Anycubic LAN scan");
  }

  // ── Phase 1 — subnet enumeration ──────────────────────────────────────────
  let primary = [];
  try { primary = (await window.electronAPI.getLocalSubnets()) ?? []; }
  catch { primary = []; }

  for (const p of ACU_COMMON_SUBNETS) if (!primary.includes(p)) primary.push(p);
  if (!primary.length) {
    primary = [...ACU_COMMON_SUBNETS];
    logPush?.("warn", "getLocalSubnets returned nothing — using common home subnets");
  }

  const extra = (getExtraSubnets?.() ?? []).filter(p => p && !primary.includes(p));
  const allPrefixes = [...primary, ...extra];

  logPush?.("info",
    `Subnets: [${primary.join(", ")}]` + (extra.length ? ` + extra [${extra.join(", ")}]` : ""));

  const total = allPrefixes.length * 254;
  let done = 0;
  onProgress?.({ done, total, prefixes: allPrefixes });

  /**
   * Scan one /24 subnet in parallel batches.
   * @param {string} prefix  e.g. "192.168.1"
   * @param {number} batchSz Parallelism.
   * @param {number} gapMs   Inter-batch pause (0 local, throttled extras).
   */
  const scanSubnet = async (prefix, batchSz, gapMs) => {
    const stat = { prefix, found: 0, probed: 0 };
    subnetStats.push(stat);
    const IPs = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);

    for (let i = 0; i < IPs.length; i += batchSz) {
      if (signal?.aborted) break;
      const batch = IPs.slice(i, i + batchSz);
      await Promise.all(batch.map(async (ip) => {
        if (signal?.aborted) { done++; return; }
        if (seenIps.has(ip)) { done++; onProgress?.({ done, total, prefixes: allPrefixes }); return; }
        try {
          const c = await acuProbeIp(ip, signal, { logPush });
          stat.probed++;
          if (c) { stat.found++; reportCandidate(c); }
        } catch {}
        done++;
        onProgress?.({ done, total, prefixes: allPrefixes });
      }));
      if (gapMs > 0 && i + batchSz < IPs.length) {
        await new Promise(r => setTimeout(r, gapMs));
      }
    }
    return stat;
  };

  const primaryScans = primary.map(p => scanSubnet(p, ACU_SCAN_BATCH_LOCAL, 0));
  const extraScans   = extra.map(p => scanSubnet(p, ACU_SCAN_BATCH_EXTRA, ACU_SCAN_BATCH_GAP_MS_EXTRA));
  await Promise.all([...primaryScans, ...extraScans]);

  candidates.sort((a, b) =>
    a.ip.localeCompare(b.ip, undefined, { numeric: true, sensitivity: "base" }));

  _acuScanLastEnv = {
    prefixes:   allPrefixes,
    subnetStats,
    durationMs: Date.now() - startMs,
    found:      candidates.length,
    batchLocal: ACU_SCAN_BATCH_LOCAL,
    batchExtra: ACU_SCAN_BATCH_EXTRA,
  };

  return candidates;
}

// ── Discovery record builder ──────────────────────────────────────────────────

/**
 * Build the `discovery` object stored on the Firestore printer document.
 * @param {object} c  Candidate from acuProbeIp / slicer import.
 * @returns {object}
 */
export function acuBuildDiscoveryRecord(c) {
  return {
    method:     c.source === "slicer" ? "slicer-import" : "lan-scan",
    transport:  "mqtts-9883",
    ip:         c.ip         || null,
    acuModelId: c.acuModelId || null,
    modelName:  c.modelName  || null,
    deviceName: c.deviceName || null,
    cn:         c.cn         || null,
    usn:        c.usn        || null,
    scannedAt:  Date.now(),
  };
}
