/**
 * printers/flashforge/probe.js — Network discovery layer for FlashForge printers.
 *
 * This file contains ONLY network logic: no DOM, no UI, no imports from
 * inventory.js or context.js. It is imported by add-flow.js which wires
 * the UI callbacks (logPush, onCandidate, onProgress) at the call site.
 *
 * Discovery strategy (mirrors Flutter TigerTag Connect):
 *   Phase 0 — UDP Multicast (Adventurer 4 era)
 *             225.0.0.9:19000 "Hello World!" — 2.5 s listen window.
 *             Fast and zero-probe for older models; runs in parallel with phase 1.
 *   Phase 1 — HTTP subnet scan
 *             POST ip:8898/detail with empty credentials, batch=24, timeout=350 ms.
 *             Covers all modern models (AD5X, 5M, 5M Pro, A5).
 *             Extra subnets supplied by the caller via getExtraSubnets().
 *   Identity fallback — TCP port 8899 M115 command (700 ms timeout).
 *             Used when the HTTP response is present but sparse (older firmware).
 *
 * All IPC calls go through window.electronAPI (preload bridge) to route
 * requests through the Node.js main process and bypass Chromium CORS.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const FFG_PORT             = 8898;
const FFG_PROBE_TIMEOUT_MS = 350;   // per-host HTTP probe timeout during scan
const FFG_BATCH_SIZE       = 24;    // parallel probes per subnet batch

// Module-level scan environment — read by add-flow.js for debug exports.
let _ffgScanLastEnv = null;

/**
 * Returns the environment snapshot from the most recent completed scan
 * (subnet list, batch stats, timing). Used by the scan-log export.
 * @returns {object|null}
 */
export function getLastFfgScanEnv() { return _ffgScanLastEnv; }

// ── JSON parsing helpers ──────────────────────────────────────────────────────

/**
 * Flatten one level of FlashForge response envelopes so callers can read
 * any field regardless of nesting depth.
 * Copies `result`, `detail`, `params`, `data`, `msg` siblings to the root.
 * @param {object} map
 * @returns {object}
 */
function ffgFlattenJson(map) {
  if (!map || typeof map !== "object") return {};
  const out = { ...map };
  for (const key of ["result", "detail", "params", "data", "msg"]) {
    if (map[key] && typeof map[key] === "object") Object.assign(out, map[key]);
  }
  return out;
}

/**
 * Return the first non-empty string value from the list of keys.
 * @param {object} obj
 * @param {string[]} keys
 * @returns {string}
 */
function ffgFirstStr(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

// ── Model resolution ──────────────────────────────────────────────────────────

/**
 * Map a raw machineModel / machineName string to the FlashForge printerModelId.
 * Matches the same logic used by the Flutter app.
 *
 * @param {string} model  Raw string from HTTP or M115 response.
 * @returns {string}  "1" AD5X | "2" 5M | "3" 5M Pro | "4" A5 | "0" unknown
 */
export function ffgModelIdFromMachineModel(model) {
  const s = String(model || "").toLowerCase();
  if (s.includes("ad5x"))                                   return "1";
  if (s.includes("5m pro") || s.includes("5mpro") ||
      s.includes("adventurer 5m pro"))                      return "3";
  if ((s.includes("5m") || s.includes("adventurer 5m")) &&
      !s.includes("pro"))                                   return "2";
  if (s.includes(" a5") || s.includes("adventurer a5"))     return "4";
  return "0";
}

// ── Quality score (for result sorting) ───────────────────────────────────────

/**
 * Score how complete a candidate is — higher is better.
 * Sort: score descending, then IP ascending.
 * @param {object} c  Candidate object.
 * @returns {number}
 */
function ffgQualityScore(c) {
  let s = 0;
  if (c.hostName?.trim())     s += 4;
  if (c.machineName?.trim())  s += 4;
  if (c.machineModel?.trim()) s += 3;
  if (c.firmware?.trim())     s += 1;
  if (c.serialNumber?.trim()) s += 5;
  return s;
}

// ── HTTP probe ────────────────────────────────────────────────────────────────

/**
 * Probe a single IP via POST ip:8898/detail (empty credentials).
 * Falls back to TCP M115 on port 8899 if the HTTP response is sparse.
 *
 * Routes through window.electronAPI.ffgHttpPost (main-process bridge) so the
 * POST bypasses Chromium CORS — Chromium would block a cross-origin POST from
 * http://localhost to http://192.168.x.x:8898 without CORS headers.
 *
 * @param {string}   ip
 * @param {object}   [opts]
 * @param {Function} [opts.logPush]  `(kind, summary, raw?) => void` scan-log callback.
 * @returns {Promise<object|null>}  Candidate object or null (no FlashForge found).
 */
export async function ffgProbeIp(ip, { logPush } = {}) {
  if (!ip) return null;
  const url = `http://${ip}:${FFG_PORT}/detail`;

  // ── HTTP probe ────────────────────────────────────────────────────────────
  let httpResult = null;
  try {
    const raw = await window.electronAPI.ffgHttpPost(
      url,
      { serialNumber: "", checkCode: "" },
      FFG_PROBE_TIMEOUT_MS,
    );
    // Network error envelope (code -2) means no FlashForge at this IP.
    if (raw?.code === -2) return null;
    httpResult = raw;
  } catch {
    return null;
  }

  if (!httpResult) return null;

  // Parse the HTTP response.
  const flat = ffgFlattenJson(httpResult);
  const d    = flat.detail && typeof flat.detail === "object" ? flat.detail : flat;

  const hostName     = ffgFirstStr(d, ["printerName", "host_name", "hostname", "deviceName", "name"]);
  const machineModel = ffgFirstStr(d, ["machineModel", "machine_model", "model", "printerModel"]);
  const serialNumber = ffgFirstStr(d, ["serialNumber", "serial_number", "sn"]).replace(/^SN/i, "");
  const firmware     = ffgFirstStr(d, ["firmwareVersion", "firmware", "version"]);
  const macAddress   = ffgFirstStr(d, ["macAddr", "macAddress", "mac_address"]);
  const machineName  = ffgFirstStr(d, ["machineName", "machine_name"]);

  // At least one identity field must be present — otherwise this isn't a
  // FlashForge printer (or it's filtered by firewall).
  const hasIdentity = hostName || machineModel || serialNumber || macAddress || machineName;
  if (!hasIdentity) return null;

  let candidate = { ip, hostName, machineModel, machineName, serialNumber, firmware, macAddress };

  // ── TCP fallback (M115) if HTTP response was sparse ──────────────────────
  const needsEnrich = !machineModel && !serialNumber;
  if (needsEnrich) {
    try {
      const tcp = await window.electronAPI.ffgTcpProbe(ip);
      if (tcp?.ok && tcp.fields) {
        const f = tcp.fields;
        if (f.machineModel && !candidate.machineModel) candidate.machineModel = f.machineModel;
        if (f.machineName  && !candidate.machineName)  candidate.machineName  = f.machineName;
        if (f.firmware     && !candidate.firmware)     candidate.firmware     = f.firmware;
        if (f.serialNumber && !candidate.serialNumber) candidate.serialNumber = f.serialNumber;
        if (f.macAddress   && !candidate.macAddress)   candidate.macAddress   = f.macAddress;
        logPush?.("info", `TCP M115 enriched ${ip}: ${f.machineModel || "(no model)"}`, f);
      }
    } catch {
      // TCP probe is best-effort — ignore errors.
    }
  }

  candidate.modelId = ffgModelIdFromMachineModel(
    candidate.machineModel || candidate.machineName || candidate.hostName || "",
  );

  logPush?.("found", `${ip} → ${candidate.machineModel || candidate.hostName || "(unknown)"}`, candidate);
  return candidate;
}

// ── LAN scan ─────────────────────────────────────────────────────────────────

/**
 * Scan the local network for FlashForge printers.
 *
 * Phase 0: UDP multicast discover (Adventurer 4 era) — runs in parallel.
 * Phase 1: HTTP subnet scan on each /24 block returned by getLocalSubnets.
 *          Probes extra subnets supplied by getExtraSubnets() afterward.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onCandidate]    `(candidate) => void` — called for each find.
 * @param {Function} [opts.onProgress]    `({ done, total, prefixes }) => void`
 * @param {AbortSignal} [opts.signal]     Scan-level abort signal.
 * @param {Function} [opts.logPush]       `(kind, summary, raw?) => void`
 * @param {Function} [opts.getExtraSubnets] `() => string[]` — caller-supplied extra prefixes.
 * @returns {Promise<object[]>}  All candidates found.
 */
export async function ffgScanLan({
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

  /** Report a found candidate — deduplicates by IP. */
  const reportCandidate = (c) => {
    if (!c || seenIps.has(c.ip)) return;
    seenIps.add(c.ip);
    candidates.push(c);
    onCandidate?.(c);
  };

  // ── Phase 0 — UDP multicast (runs in parallel, non-blocking) ─────────────
  const multicastPromise = (async () => {
    try {
      logPush?.("info", "UDP multicast 225.0.0.9:19000 → «Hello World!» (2.5 s listen)…");
      const result = await window.electronAPI.ffgMulticastDiscover();
      if (!result.ok) {
        logPush?.("warn", `Multicast failed: ${result.error || "unknown"}`);
        return;
      }
      if (!result.candidates?.length) {
        logPush?.("info", "Multicast: no replies");
        return;
      }
      logPush?.("info", `Multicast: ${result.candidates.length} reply(ies) — probing…`);
      for (const { ip, printerName } of result.candidates) {
        if (signal?.aborted) break;
        if (seenIps.has(ip)) continue;
        const c = await ffgProbeIp(ip, { logPush });
        if (c) {
          // Prefer the name from the HTTP probe; fall back to multicast name.
          if (!c.hostName && printerName) c.hostName = printerName;
          reportCandidate(c);
        }
      }
    } catch (e) {
      logPush?.("warn", `Multicast error: ${e?.message || e}`);
    }
  })();

  // ── Phase 1 — HTTP subnet scan ────────────────────────────────────────────

  // Get primary subnets from OS network interfaces.
  let primaryPrefixes = [];
  try {
    primaryPrefixes = (await window.electronAPI.getLocalSubnets()) ?? [];
  } catch {
    primaryPrefixes = [];
  }

  // Fallback if the IPC returns nothing useful.
  const FALLBACK_PREFIXES = ["192.168.1", "192.168.40"];
  if (!primaryPrefixes.length) {
    primaryPrefixes = FALLBACK_PREFIXES;
    logPush?.("warn", "getLocalSubnets returned nothing — using fallback prefixes");
  }

  // De-duplicate and label extra subnets.
  const extraPrefixes = (getExtraSubnets?.() ?? []).filter(
    p => p && !primaryPrefixes.includes(p),
  );
  const allPrefixes = [...primaryPrefixes, ...extraPrefixes];

  logPush?.("info",
    `Subnets: [${primaryPrefixes.join(", ")}]` +
    (extraPrefixes.length ? ` + extra [${extraPrefixes.join(", ")}]` : ""),
  );

  /**
   * Scan one /24 subnet in batches of FFG_BATCH_SIZE.
   * @param {string}  prefix   e.g. "192.168.1"
   * @param {number}  batchSz  Parallelism — reduced for extra subnets.
   * @param {number}  gapMs    Sleep between batches (0 for primary, small for extra).
   */
  const scanSubnet = async (prefix, batchSz, gapMs) => {
    const stat = { prefix, found: 0, probed: 0, errors: 0 };
    subnetStats.push(stat);

    const IPs = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);

    for (let i = 0; i < IPs.length; i += batchSz) {
      if (signal?.aborted) break;

      const batch = IPs.slice(i, i + batchSz);
      const done  = Math.min(i + batchSz, IPs.length);
      onProgress?.({ done: done + (IPs.length * allPrefixes.indexOf(prefix)), total: IPs.length * allPrefixes.length, prefixes: allPrefixes });

      await Promise.all(batch.map(async (ip) => {
        if (signal?.aborted) return;
        if (seenIps.has(ip)) return;
        try {
          const c = await ffgProbeIp(ip, { logPush });
          stat.probed++;
          if (c) { stat.found++; reportCandidate(c); }
        } catch {
          stat.errors++;
        }
      }));

      if (gapMs > 0 && i + batchSz < IPs.length) {
        await new Promise(r => setTimeout(r, gapMs));
      }
    }
    return stat;
  };

  // Primary subnets — full batch size, no gap.
  const primaryScans = primaryPrefixes.map(p => scanSubnet(p, FFG_BATCH_SIZE, 0));

  // Extra subnets — smaller batch, small gap to be less disruptive.
  const extraScans   = extraPrefixes.map(p => scanSubnet(p, 4, 50));

  await Promise.all([multicastPromise, ...primaryScans, ...extraScans]);

  // Sort: best score first, then IP ascending.
  candidates.sort((a, b) => {
    const sd = ffgQualityScore(b) - ffgQualityScore(a);
    if (sd !== 0) return sd;
    return a.ip.localeCompare(b.ip, undefined, { numeric: true, sensitivity: "base" });
  });

  _ffgScanLastEnv = {
    prefixes:    allPrefixes,
    subnetStats,
    durationMs:  Date.now() - startMs,
    found:       candidates.length,
  };

  return candidates;
}

// ── Discovery record builder ──────────────────────────────────────────────────

/**
 * Build the `discovery` object that is stored in the Firestore printer document
 * (field `discoveryInfo`) and shown in the debug section of Printer Settings.
 *
 * @param {object} c  Candidate from ffgProbeIp / ffgScanLan.
 * @returns {object}
 */
export function ffgBuildDiscoveryRecord(c) {
  return {
    method:       "lan-scan",
    transport:    "http-8898",
    ip:           c.ip           || null,
    hostName:     c.hostName     || null,
    machineModel: c.machineModel || null,
    machineName:  c.machineName  || null,
    serialNumber: c.serialNumber || null,
    firmware:     c.firmware     || null,
    macAddress:   c.macAddress   || null,
    scannedAt:    Date.now(),
  };
}
