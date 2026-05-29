/**
 * printers/creality/probe.js — Network discovery layer for Creality printers.
 *
 * This file contains ONLY network logic: no DOM, no UI, no imports from
 * inventory.js or context.js. It is imported by add-flow.js which wires the
 * UI callbacks (logPush, onCandidate, onProgress) at the call site.
 *
 * Discovery strategy (ported from the Flutter scanner creality_scan_printers.dart,
 * see renderer/printers/creality/PROTOCOL.md §3):
 *   Phase 1 — subnet enumeration
 *             os.networkInterfaces() via getLocalSubnets() + the common
 *             Creality home subnets (192.168.1.x, 192.168.40.x) + user extras.
 *   Phase 2 — two-stage per-host probe (64 parallel on local subnets):
 *             a. TCP :9999 open? (650 ms) — cheap reject of dead hosts.
 *                Runs in the main process (window.electronAPI.creTcpProbe).
 *             b. WebSocket handshake on the open hosts — send
 *                {"method":"get","params":{"printerInfo":1}}, accumulate frames
 *                (stop at hasStrongId && frameCount>=2, or frameCount>=5, or
 *                2200 ms), then validate with isCrealityLike(). The browser
 *                WebSocket API is not subject to CORS, so this stays in the
 *                renderer (same transport the live driver uses).
 *
 * Hosts with :9999 open but no validated Creality JSON are silently dropped
 * (skipUnconfirmed = true) — avoids NAS / Nagios / home-automation false
 * positives that happen to sit on port 9999.
 *
 * Unauthenticated handshake only. Creality printers that don't require auth
 * (the common case, incl. the Ender-3 V4) answer straight away; the saved-
 * credential Basic-auth path the Flutter scanner adds is intentionally not
 * ported until real hardware proves it's needed.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const CRE_WS_PORT                = 9999;
const CRE_TCP_TIMEOUT_MS         = 650;   // matches the TCP probe in main.js
const CRE_WS_TIMEOUT_MS          = 2200;  // global handshake budget per host
const CRE_SCAN_BATCH_LOCAL       = 64;    // parallel probes on local subnets (PROTOCOL §3)
const CRE_SCAN_BATCH_EXTRA       = 4;     // throttled batch for routed/firewalled extras
const CRE_SCAN_BATCH_GAP_MS_EXTRA = 80;   // inter-batch pause on extra subnets

// Common home-router subnets the mobile scanner always probes (PROTOCOL §3 step 2),
// merged in even when the machine isn't directly on them.
const CRE_COMMON_SUBNETS = ["192.168.1", "192.168.40"];

// Telemetry keys that, combined with a strong identity, confirm Creality JSON.
const CRE_TELEMETRY_KEYS = new Set([
  "printerStatus", "printProgress", "printJobTime", "nozzleTemp", "targetNozzleTemp",
  "bedTemp0", "bedTemp", "targetBedTemp0", "targetBedTemp", "boxTemp", "chamberTemp",
  "boxsInfo", "cfsConnected", "retMaterials", "lightSw", "webrtcSupport", "ModeCode",
  "curPosition", "workingLayer", "totalLayers", "filename",
]);

// Documented Creality model codes → printer-catalog id (PROTOCOL §3).
const CRE_MODEL_CODE_TO_ID = { "F009": "10", "F022": "11" };

// Module-level scan environment — read by add-flow.js for debug exports.
let _creScanLastEnv = null;

/**
 * Returns the environment snapshot from the most recent completed scan
 * (subnet list, batch stats, timing). Used by the scan-log export.
 * @returns {object|null}
 */
export function getLastCreScanEnv() { return _creScanLastEnv; }

// ── Validation rule ─────────────────────────────────────────────────────────

/**
 * Returns true when an aggregated WebSocket handshake looks like a Creality
 * printer. Mirrors isCrealityLike() from the Flutter scanner:
 *   (strong identity OR hostname match) AND at least one telemetry key.
 *
 * @param {Set<string>} keys     - All JSON keys aggregated across frames.
 * @param {string|null} hostname - Reported hostname, if any.
 * @returns {boolean}
 */
export function isCrealityLike(keys, hostname) {
  const hasStrongId = keys.has("model") || keys.has("modelVersion") || keys.has("deviceSn");
  const hostnameHit = !!hostname && /creality|k1|k2|ender|hi-|hi_/i.test(hostname);
  const hasTelemetry = [...keys].some(k => CRE_TELEMETRY_KEYS.has(k));
  return (hasStrongId || hostnameHit) && hasTelemetry;
}

// ── Model resolution ──────────────────────────────────────────────────────────

/**
 * Map a Creality model code / hostname to the printer-catalog id used by the
 * add form (data/printers/cre_printer_models.json). Falls back to "0"
 * (Select Printer placeholder) when nothing matches — the user then picks
 * the model manually.
 *
 * @param {string|null} model    - `model` field from the handshake (e.g. "F009").
 * @param {string|null} hostname - Reported hostname (e.g. "Ender-3V4-xxxx").
 * @returns {string} Catalog id.
 */
export function creModelIdFromModel(model, hostname) {
  const code = String(model || "").trim().toUpperCase();
  if (CRE_MODEL_CODE_TO_ID[code]) return CRE_MODEL_CODE_TO_ID[code];

  // Name heuristics — most specific first so "K2 Plus" wins over "K2".
  const hay = `${model || ""} ${hostname || ""}`.toLowerCase();
  if (/k2\s*plus/.test(hay))                 return "2";
  if (/k2\s*pro/.test(hay))                  return "3";
  if (/k2\s*se/.test(hay))                   return "5";
  if (/k2/.test(hay))                        return "4";
  if (/k1\s*se/.test(hay))                   return "6";
  if (/k1\s*max/.test(hay))                  return "9";
  if (/k1\s*c|k1c/.test(hay))                return "8";
  if (/k1/.test(hay))                        return "7";
  if (/ender/.test(hay))                     return "10";
  if (/sparkx/.test(hay))                    return "11";
  if (/(^|\s)hi[-_\s]/.test(hay))            return "1";
  return "0";
}

// ── WebSocket handshake ─────────────────────────────────────────────────────

/**
 * Open a WebSocket to ip:9999, request a printerInfo snapshot and accumulate
 * frames until the printer's identity is established. Resolves with the
 * aggregated handshake, or null if the socket never opened.
 *
 * Stop conditions (whichever comes first):
 *   - hasStrongId && frameCount >= 2  (identity confirmed early)
 *   - frameCount >= 5                 (upper bound)
 *   - CRE_WS_TIMEOUT_MS elapsed       (global budget)
 *
 * @param {string}      ip
 * @param {AbortSignal} [signal]
 * @returns {Promise<{hostname:string|null, model:string|null, modelVersion:string|null, deviceSn:string|null, keys:Set<string>}|null>}
 */
function creWsHandshake(ip, signal) {
  return new Promise((resolve) => {
    let ws;
    let settled = false;
    let opened  = false;
    let frameCount = 0;
    const keys = new Set();
    let hostname = null, model = null, modelVersion = null, deviceSn = null;

    const complete = (gotHandshake) => {
      if (settled) return; settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      try { ws?.close(); } catch {}
      resolve(gotHandshake ? { hostname, model, modelVersion, deviceSn, keys } : null);
    };

    const onAbort = () => complete(false);
    const timer = setTimeout(() => complete(opened), CRE_WS_TIMEOUT_MS);

    if (signal) {
      if (signal.aborted) { resolve(null); return; }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    try { ws = new WebSocket(`ws://${ip}:${CRE_WS_PORT}`); }
    catch { complete(false); return; }

    ws.addEventListener("open", () => {
      opened = true;
      // Prod the firmware for a full identity + telemetry snapshot.
      try {
        ws.send(JSON.stringify({ method: "get", params: { printerInfo: 1 } }));
      } catch {}
    });

    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      // Literal "ok" is an ACK to our send — ignore (don't count as a frame).
      if (ev.data === "ok") return;
      frameCount += 1;
      try {
        const decoded = JSON.parse(ev.data);
        // Heartbeat: the firmware sends {ModeCode:"heart_beat"} and waits for a
        // literal "ok" before streaming more. Without the reply some models
        // send only the heartbeat (no identity), which would fail validation.
        if (decoded?.ModeCode === "heart_beat") { try { ws.send("ok"); } catch {} }
        if (decoded && typeof decoded === "object") {
          for (const k of Object.keys(decoded)) keys.add(k);
          // Some firmwares nest the payload — lift nested keys too.
          for (const nestedKey of ["params", "msg", "data", "result"]) {
            const nested = decoded[nestedKey];
            if (nested && typeof nested === "object" && !Array.isArray(nested)) {
              for (const k of Object.keys(nested)) keys.add(k);
            }
          }
          hostname     ??= decoded.hostname     != null ? String(decoded.hostname)     : null;
          model        ??= decoded.model        != null ? String(decoded.model)        : null;
          modelVersion ??= decoded.modelVersion != null ? String(decoded.modelVersion) : null;
          deviceSn     ??= decoded.deviceSn     != null ? String(decoded.deviceSn)     : null;
        }
      } catch {}

      const hasStrongId = model != null || modelVersion != null;
      if (hasStrongId && frameCount >= 2) complete(true);
      else if (frameCount >= 5)           complete(true);
    });

    // Error / close before any data → not a usable WS host. After open with
    // some frames, complete with whatever we aggregated so isCrealityLike can rule.
    ws.addEventListener("error", () => complete(opened && frameCount > 0));
    ws.addEventListener("close", () => complete(opened && frameCount > 0));
  });
}

// ── Per-host probe ────────────────────────────────────────────────────────────

/**
 * Probe a single IP: TCP :9999 open check, then WebSocket handshake +
 * isCrealityLike() validation. Returns a candidate object or null.
 *
 * @param {string}      ip
 * @param {AbortSignal} [signal]
 * @param {object}      [opts]
 * @param {Function}    [opts.logPush]  - `(kind, summary, raw?) => void`
 * @param {boolean}     [opts.directWs] - Skip the TCP pre-filter and open the
 *                                        WebSocket directly. Use for targeted
 *                                        single-IP probes (manual / add-by-IP):
 *                                        the handshake itself proves reachability
 *                                        and this path doesn't depend on the
 *                                        main-process IPC bridge being loaded.
 * @returns {Promise<object|null>}
 */
export async function creProbeIp(ip, signal, { logPush, directWs = false } = {}) {
  if (!ip) return null;
  if (signal?.aborted) return null;

  // Stage A — fast TCP port-open filter (main process). The bulk LAN scan
  // uses it to avoid opening a WebSocket to all 254 hosts per subnet; a
  // targeted probe (directWs) skips it and goes straight to the handshake.
  if (!directWs) {
    let portOpen = false;
    try { portOpen = !!(await window.electronAPI?.creTcpProbe?.(ip))?.ok; }
    catch { portOpen = false; }
    if (!portOpen || signal?.aborted) return null;
  }

  // Stage B — WebSocket handshake validation (renderer).
  const hello = await creWsHandshake(ip, signal);
  if (!hello) {
    logPush?.("ambiguous", `${ip} — :9999 open but no WebSocket handshake`, null);
    return null;
  }
  if (!isCrealityLike(hello.keys, hello.hostname)) {
    logPush?.("ambiguous",
      `${ip} — :9999 open but not Creality JSON (keys: ${[...hello.keys].slice(0, 8).join(", ") || "none"})`,
      { keys: [...hello.keys] });
    return null;
  }

  const model        = (hello.model        || "").trim() || null;
  const modelVersion = (hello.modelVersion || "").trim() || null;
  const deviceSn     = (hello.deviceSn     || "").trim() || null;
  const hostName     = (hello.hostname     || "").trim() || null;
  const modelId      = creModelIdFromModel(model, hostName);

  const candidate = {
    ip, model, modelVersion, deviceSn, hostName, modelId,
    source: "ws",
    keys: [...hello.keys],
  };
  logPush?.("found", `${ip} → ${model || hostName || "Creality"}`, candidate);
  return candidate;
}

// ── LAN scan ─────────────────────────────────────────────────────────────────

/**
 * Scan the local network for Creality printers.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onCandidate]    `(candidate) => void` — called for each find.
 * @param {Function} [opts.onProgress]    `({ done, total, prefixes }) => void`
 * @param {AbortSignal} [opts.signal]     Scan-level abort signal.
 * @param {Function} [opts.logPush]       `(kind, summary, raw?) => void`
 * @param {Function} [opts.getExtraSubnets] `() => string[]` — caller-supplied extra prefixes.
 * @returns {Promise<object[]>} All candidates found.
 */
export async function creScanLan({
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

  // The TCP probe bridge ships in main.js + preload.js — both require a FULL
  // app relaunch (not a renderer reload) to take effect. If it's missing,
  // every host fails the port check and nothing is ever found, so flag it loudly.
  if (typeof window.electronAPI?.creTcpProbe !== "function") {
    logPush?.("err",
      "creTcpProbe IPC bridge missing — fully quit and relaunch the app to enable the Creality LAN scan");
  }

  // ── Phase 1 — subnet enumeration ──────────────────────────────────────────
  let primary = [];
  try { primary = (await window.electronAPI.getLocalSubnets()) ?? []; }
  catch { primary = []; }

  // Always probe the common Creality home subnets (mobile-scanner parity).
  for (const p of CRE_COMMON_SUBNETS) if (!primary.includes(p)) primary.push(p);
  if (!primary.length) {
    primary = [...CRE_COMMON_SUBNETS];
    logPush?.("warn", "getLocalSubnets returned nothing — using common Creality subnets");
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
   * @param {number} gapMs   Inter-batch pause (0 for local, throttled for extras).
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
          const c = await creProbeIp(ip, signal, { logPush });
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

  const primaryScans = primary.map(p => scanSubnet(p, CRE_SCAN_BATCH_LOCAL, 0));
  const extraScans   = extra.map(p => scanSubnet(p, CRE_SCAN_BATCH_EXTRA, CRE_SCAN_BATCH_GAP_MS_EXTRA));
  await Promise.all([...primaryScans, ...extraScans]);

  candidates.sort((a, b) =>
    a.ip.localeCompare(b.ip, undefined, { numeric: true, sensitivity: "base" }));

  _creScanLastEnv = {
    prefixes:     allPrefixes,
    subnetStats,
    durationMs:   Date.now() - startMs,
    found:        candidates.length,
    tcpTimeoutMs: CRE_TCP_TIMEOUT_MS,
    wsTimeoutMs:  CRE_WS_TIMEOUT_MS,
    batchLocal:   CRE_SCAN_BATCH_LOCAL,
    batchExtra:   CRE_SCAN_BATCH_EXTRA,
  };

  return candidates;
}

// ── Discovery record builder ──────────────────────────────────────────────────

/**
 * Build the `discovery` object stored on the Firestore printer document.
 * @param {object} c  Candidate from creProbeIp / creScanLan.
 * @returns {object}
 */
export function creBuildDiscoveryRecord(c) {
  return {
    method:       "lan-scan",
    transport:    "ws-9999",
    ip:           c.ip           || null,
    model:        c.model        || null,
    modelVersion: c.modelVersion || null,
    deviceSn:     c.deviceSn     || null,
    hostName:     c.hostName     || null,
    keys:         Array.isArray(c.keys) ? c.keys : null,
    scannedAt:    Date.now(),
  };
}
