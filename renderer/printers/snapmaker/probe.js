/**
 * renderer/printers/snapmaker/probe.js
 *
 * Pure network / data layer for Snapmaker printer discovery.
 * No DOM, no UI, no imports from context.js.
 *
 * Responsibilities:
 *   - Probe a single host via Moonraker HTTP   → snapProbeIp()
 *   - Discover LAN subnets via WebRTC ICE      → snapDiscoverSubnetsViaWebRTC()
 *   - Build a candidate from a mDNS answer     → snapCandidateFromMdns()
 *   - Walk all subnets in parallel batches     → snapScanLan()
 *   - Serialise a candidate for Firestore      → snapBuildDiscoveryRecord()
 *
 * All functions that need to emit log entries accept an optional `logPush`
 * callback so the caller (add-flow.js) can wire its own scan-log subsystem
 * without creating a circular dependency:
 *
 *   snapScanLan({ ..., logPush: snapScanLogPush, getExtraSubnets: snapLoadExtraSubnets })
 *
 * The last-scan environment snapshot (_snapScanLastEnv) is kept as module
 * state and exposed via getLastScanEnv() so add-flow.js can include it in
 * the debug export without importing a mutable variable directly.
 */

// ── Network constants ─────────────────────────────────────────────────────────

/** Moonraker HTTP port — fixed by Snapmaker firmware. */
const SNAP_MOONRAKER_PORT = 7125;

/**
 * Per-host probe timeout (ms).
 * ~350 ms matches the Flutter scanner: long enough for a sleeping printer's
 * stack to wake, short enough that 254 dead hosts don't drag a /24 scan
 * past ~4 s.
 */
const SNAP_PROBE_TIMEOUT_MS = 350;

/**
 * Parallel probe batch size for subnets the Mac is directly on.
 * 24 simultaneous fetches → a /24 finishes in ≈ 3–5 s on a healthy LAN.
 */
const SNAP_SCAN_BATCH_LOCAL = 24;

/**
 * Parallel probe batch size for user-declared EXTRA subnets (typically
 * reached via inter-VLAN routing through a firewall). A large burst on an
 * OPNsense / UniFi IDS will be silently dropped, so we throttle to 4.
 * A /24 with batch=4 takes ≈ 25 s — slow but reliable.
 */
const SNAP_SCAN_BATCH_EXTRA = 4;

/**
 * Inter-batch pause (ms) on EXTRA subnets.
 * Gives the firewall rate-limiter time to forget the previous burst.
 */
const SNAP_SCAN_BATCH_GAP_MS_EXTRA = 80;

/**
 * Wall-clock threshold (ms) below which an EXTRA subnet that returned 0
 * hits is flagged as "probably firewall-blocked". A healthy /24 at
 * batch=4 takes ≥ 25 s; anything under 4 s means all probes were dropped.
 */
const SNAP_FIREWALL_BLOCK_HINT_MS = 4000;

// ── Last-scan environment snapshot ───────────────────────────────────────────

/**
 * Populated at the start of each snapScanLan() run and updated as phases
 * complete. Surfaced via getLastScanEnv() for the debug export in add-flow.js.
 * @type {object|null}
 */
let _snapScanLastEnv = null;

/**
 * Returns the environment snapshot captured during the most recent
 * snapScanLan() call (subnets used, source of each, scan parameters, …).
 * Returns null before the first scan runs.
 * @returns {object|null}
 */
export function getLastScanEnv() {
  return _snapScanLastEnv;
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

/**
 * Flatten a Moonraker JSON-RPC envelope by lifting nested wrapper objects
 * (`result`, `detail`, `params`, `data`, `msg`) onto the top level.
 *
 * Moonraker wraps responses differently across versions; this mirrors the
 * Flutter scanner so the same field-name lookup works regardless of which
 * wrapper a given firmware version chose. Top-level keys take precedence
 * over nested ones (no-op on conflict).
 *
 * @param {object|null} map - Raw parsed JSON, or null.
 * @returns {object} Flattened key-value map; empty object when input is falsy.
 */
export function snapFlattenJson(map) {
  if (!map || typeof map !== "object") return {};
  const out = { ...map };
  for (const key of ["result", "detail", "params", "data", "msg"]) {
    const nested = map[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      for (const k of Object.keys(nested)) {
        // Top-level keys win — same semantics as Dart's `{...serverFlat, ...printerFlat}` merge.
        if (!(k in out)) out[k] = nested[k];
      }
    }
  }
  return out;
}

/**
 * Return the first non-empty string found among the given keys in `map`.
 * Trims values and rejects the literal string `"null"` (a firmware quirk
 * that writes the word "null" instead of omitting the field).
 *
 * @param {object|null} map  - Key-value map to search.
 * @param {string[]}    keys - Ordered list of keys to try.
 * @returns {string|null} First non-empty value, or null if none found.
 */
export function snapFirstStr(map, keys) {
  for (const k of keys) {
    const v = map?.[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== "null") return s;
  }
  return null;
}

// ── HTTP probe ────────────────────────────────────────────────────────────────

/**
 * Probe a single host on Moonraker's HTTP API.
 *
 * Hits three endpoints in parallel:
 *   - `/printer/info`       — Klipper state + klippy_state, api_version
 *   - `/server/info`        — Moonraker version
 *   - `/machine/system_info`— product_info (machine_type, device_name, sn,
 *                             nozzle_diameter) — the gold-standard source
 *
 * Returns a candidate object when ANY recognisable identity field is present,
 * null otherwise. Intentionally lenient — a generic Moonraker host (Voron,
 * Bambu-Klipper) will pass; `isSnapmaker` flags confirmed Snapmakers. The
 * Flutter app uses the same rule: surface-then-filter is better than
 * silently missing a printer whose firmware omits `machine_model`.
 *
 * @param {string}      ip          - IPv4 address to probe.
 * @param {AbortSignal} [signal]    - Caller's abort signal (scan-level cancel).
 * @param {object}      [opts]
 * @param {Function}    [opts.logPush] - Optional `(kind, summary, raw) => void`
 *                                       callback for the scan-log journal.
 * @returns {Promise<object|null>} Candidate object or null.
 */
export async function snapProbeIp(ip, signal, { logPush } = {}) {
  if (!ip) return null;
  const base = `http://${ip}:${SNAP_MOONRAKER_PORT}`;

  // Per-request timeout separate from the scan-level abort signal so a hung
  // host times out without killing the rest of the scan.
  const localCtl   = new AbortController();
  const localTimer = setTimeout(() => localCtl.abort(), SNAP_PROBE_TIMEOUT_MS);

  // Forward the caller's abort to our local controller.
  const onParentAbort = () => localCtl.abort();
  if (signal) {
    if (signal.aborted) localCtl.abort();
    else signal.addEventListener("abort", onParentAbort, { once: true });
  }

  /**
   * Fetch one JSON endpoint; returns `{ flat, raw, status }`.
   *
   * Routes through the Electron main process (electronAPI.snapHttpGet) to
   * bypass Chromium CORS. A direct fetch() from http://localhost:<port> to
   * http://192.168.x.x:7125 is treated as cross-origin and blocked — the
   * Moonraker server doesn't send CORS headers. Node's fetch() in the main
   * process is not subject to browser CORS, so it succeeds exactly like the
   * Flutter http.get() calls.
   *
   * Never throws — connection errors and non-2xx responses both return nulls.
   */
  const fetchJson = async (url) => {
    // Respect the per-request abort controller before issuing the IPC call.
    if (localCtl.signal.aborted) return { flat: null, raw: null, status: 0, err: "AbortError" };
    try {
      const result = await window.electronAPI.snapHttpGet(url, SNAP_PROBE_TIMEOUT_MS);
      // If the scan was cancelled while the IPC was in-flight, discard result.
      if (localCtl.signal.aborted) return { flat: null, raw: null, status: 0, err: "AbortError" };
      if (!result.ok) return { flat: null, raw: null, status: result.status || 0 };
      return {
        flat:   result.json ? snapFlattenJson(result.json) : null,
        raw:    result.json,
        status: result.status,
      };
    } catch (e) {
      return { flat: null, raw: null, status: 0, err: e?.name || "error" };
    }
  };

  try {
    const [pi, si, mi] = await Promise.all([
      fetchJson(`${base}/printer/info`),
      fetchJson(`${base}/server/info`),
      // /machine/system_info — Snapmaker-specific gold-standard endpoint.
      // Returns product_info.machine_type, device_name, serial_number,
      // nozzle_diameter[]. Generic Moonraker hosts (Voron, Bambu-Klipper)
      // typically don't expose this route, which itself is a useful signal.
      fetchJson(`${base}/machine/system_info`),
    ]);

    const printerFlat = pi.flat;
    const serverFlat  = si.flat;
    const sysFlat     = mi.flat;

    // No endpoint replied → not a Moonraker host.
    if (!printerFlat && !serverFlat && !sysFlat) return null;

    // Stock Snapmaker firmware nests product_info one level below the
    // JSON-RPC `result` envelope that snapFlattenJson already unwrapped:
    //   result.system_info.product_info
    // We dive the remaining two levels manually.
    const sysRoot     = sysFlat?.system_info || sysFlat || {};
    const productInfo = sysRoot.product_info || {};

    // Fuse all sources into one lookup map (lowest priority first).
    const combined = {
      ...(serverFlat  || {}),
      ...(printerFlat || {}),
      ...productInfo,       // highest: product_info from system_info
    };

    // Field extraction — priority order documented inline.
    const machineModel    = snapFirstStr(combined, ["machine_type", "machine_model", "machineModel", "model", "printer_model"]);
    const deviceName      = snapFirstStr(productInfo, ["device_name"]);
    const hostName        = snapFirstStr(combined, ["hostname", "host_name", "device_name", "name"]);
    const softwareVersion = snapFirstStr(combined, ["firmware_version", "software_version", "softwareVersion", "version"]);
    const klippyState     = snapFirstStr(combined, ["klippy_state", "state"]);
    const moonrakerVersion= snapFirstStr(combined, ["moonraker_version", "moonrakerVersion"]);
    const serialNumber    = snapFirstStr(productInfo, ["serial_number", "serialNumber"]);
    let   apiVersion      = snapFirstStr(combined, ["api_version_string", "apiVersion"]);
    if (!apiVersion && Array.isArray(combined.api_version)) {
      apiVersion = combined.api_version.join(".");
    }
    const nozzleCount = Array.isArray(productInfo.nozzle_diameter)
      ? productInfo.nozzle_diameter.length : 0;

    // Brand check — machine_type containing "Snapmaker" (case-insensitive)
    // confirms the brand. Covers U1, U2, J1, A350, Artisan, future models.
    const isSnapmaker = !!machineModel &&
                        machineModel.toLowerCase().includes("snapmaker");

    // Accept when ANY identity field is present (matches Flutter's hasIdentity).
    const hasIdentity = !!(hostName || machineModel || softwareVersion ||
                           klippyState || moonrakerVersion || apiVersion);
    if (!hasIdentity) {
      logPush?.("ambiguous", `${ip} — Moonraker replied without identity fields`,
        { printerInfo: pi.raw, serverInfo: si.raw, systemInfo: mi.raw });
      return null;
    }

    // Quality score — weights the UI sort (higher = more reliable match).
    const qualityScore =
        (isSnapmaker      ? 8 : 0) +  // confirmed brand — biggest weight
        (deviceName       ? 3 : 0) +  // user-given nickname → high signal
        (machineModel     ? 4 : 0) +
        (hostName         ? 2 : 0) +  // hostname is weakest of the three name fields
        (softwareVersion  ? 2 : 0) +
        (klippyState      ? 1 : 0) +
        (moonrakerVersion ? 1 : 0) +
        (apiVersion       ? 1 : 0) +
        (serialNumber     ? 1 : 0);

    const summary = `${ip} · ${machineModel || deviceName || hostName || "(no model)"}${isSnapmaker ? " ✓" : ""} · score ${qualityScore}`;
    logPush?.("hit", summary, {
      printerInfo: pi.raw,
      serverInfo:  si.raw,
      systemInfo:  mi.raw,
      derived: {
        isSnapmaker, machineModel, deviceName, hostName,
        softwareVersion, klippyState, moonrakerVersion, apiVersion,
        serialNumber, nozzleCount, qualityScore,
      },
    });

    return {
      ip, isSnapmaker, machineModel, deviceName, hostName,
      softwareVersion, klippyState, moonrakerVersion, apiVersion,
      serialNumber, nozzleCount, qualityScore,
      source: "http",
      // Full raw payloads — carried through the prefill into the Firestore
      // device doc under `discovery`. Invaluable for future model-detection
      // improvements and support triage without a re-scan.
      raw: {
        mdns: null, // merged by snapScanLan when mDNS + HTTP both fired for the same IP
        http: {
          printerInfo: pi.raw || null,
          serverInfo:  si.raw || null,
          systemInfo:  mi.raw || null,
        },
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(localTimer);
    if (signal) signal.removeEventListener?.("abort", onParentAbort);
  }
}

// ── Subnet discovery (WebRTC fallback) ───────────────────────────────────────

/**
 * Discover the local IPv4 /24 subnets reachable from this machine by
 * opening a dummy RTCPeerConnection and parsing ICE candidate strings.
 *
 * Used as a fallback when the Electron main-process IPC bridge
 * (`getLocalSubnets`) isn't available (e.g. old preload) or when the
 * machine has unusual routing that os.networkInterfaces() misses.
 *
 * Returns an array of "a.b.c" prefix strings (no trailing ".0/24").
 * Returns [] when RTCPeerConnection is unavailable (non-Chromium context).
 *
 * @returns {Promise<string[]>} Array of /24 subnet prefixes.
 */
export async function snapDiscoverSubnetsViaWebRTC() {
  if (typeof RTCPeerConnection === "undefined") return [];
  const found = new Set();
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel("snap-discover");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // Gather ICE candidates for ≤ 600 ms — enough to enumerate every active
    // route, short enough not to delay the scan launch.
    await new Promise(resolve => {
      const tm = setTimeout(resolve, 600);
      pc.onicecandidate = (e) => {
        if (!e.candidate) { clearTimeout(tm); resolve(); return; }
        // Candidate string format: "candidate:1 1 UDP 1686052607 192.168.20.131 51632 typ host …"
        // We extract the IPv4 between the type-preference and port tokens.
        // mDNS `.local` candidates hide the real IP — skip them.
        const s = String(e.candidate.candidate || "");
        const m = s.match(/(?:^|\s)((?:\d{1,3}\.){3}\d{1,3})(?=\s)/);
        if (!m) return;
        const ip = m[1];
        const parts = ip.split(".");
        const a = +parts[0];
        // Discard loopback, link-local, multicast, unspecified.
        if (a === 0 || a === 127 || a === 169 || a >= 224) return;
        found.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
      };
    });
  } catch {} finally {
    try { pc?.close(); } catch {}
  }
  return Array.from(found);
}

// ── mDNS candidate builder ────────────────────────────────────────────────────

/**
 * Build a Snapmaker candidate object directly from a mDNS service answer,
 * without an HTTP probe.
 *
 * Snapmaker firmware advertises `_snapmaker._tcp.local.` with a TXT record
 * that contains everything needed to pre-fill the add form (ip, machine_type,
 * device_name, sn, version). When mDNS works (single VLAN or VLAN with a
 * reflector) this returns the printer in ≤ 2 s with zero HTTP round-trips.
 *
 * Returns null when the service is not recognisably a Snapmaker (strict
 * machine_type check) or when no usable IP could be resolved.
 *
 * @param {object} svc - mDNS service record from electronAPI.mdnsBrowseSnapmaker().
 * @returns {object|null} Candidate object, or null if not a valid Snapmaker.
 */
export function snapCandidateFromMdns(svc) {
  if (!svc) return null;
  const txt = svc.txt || {};

  const machineModel    = (txt.machine_type || "").trim() || null;
  const deviceName      = (txt.device_name  || "").trim() || null;
  const serialNumber    = (txt.sn           || "").trim() || null;
  const softwareVersion = (txt.version      || "").trim() || null;

  // Prefer the wire-resolved address (more authoritative on multi-homed hosts)
  // over the self-reported TXT.ip field.
  let ip = null;
  if (Array.isArray(svc.addresses)) {
    ip = svc.addresses.find(a => /^(\d{1,3}\.){3}\d{1,3}$/.test(a)) || null;
  }
  if (!ip && txt.ip) ip = String(txt.ip).trim();
  if (!ip) return null;

  // Strict brand filter — machine_type must contain "Snapmaker" (case-insensitive).
  // In practice the _snapmaker._tcp service type is unique to Snapmaker firmware,
  // but defence-in-depth is cheap.
  const isSnapmaker = !!machineModel && machineModel.toLowerCase().includes("snapmaker");
  if (!isSnapmaker) return null;

  // mDNS hits max out the quality score — the TXT record is the most
  // authoritative possible source (no inference required).
  const qualityScore = 8 /* confirmed brand */
                     + (deviceName      ? 3 : 0)
                     + (machineModel    ? 4 : 0)
                     + (softwareVersion ? 2 : 0)
                     + (serialNumber    ? 1 : 0)
                     + 1; /* mDNS bonus — confirms the LAN-broadcast identity */

  return {
    ip, isSnapmaker, machineModel, deviceName,
    hostName: svc.host || null,
    softwareVersion, klippyState: null,
    moonrakerVersion: null, apiVersion: null,
    serialNumber, nozzleCount: 0,
    qualityScore,
    source: "mdns",
    // Full raw payload — kept verbatim so the add flow can persist everything
    // the printer told us onto the Firestore device doc under `discovery`.
    raw: {
      mdns: {
        name:      svc.name      || null,
        host:      svc.host      || null,
        port:      svc.port      || null,
        fqdn:      svc.fqdn      || null,
        addresses: Array.isArray(svc.addresses) ? svc.addresses.slice() : [],
        txt:       svc.txt ? { ...svc.txt } : {},
      },
      http: null, // may be merged later if the port-scan phase also probes this IP
    },
  };
}

// ── LAN scanner ───────────────────────────────────────────────────────────────

/**
 * Walk all reachable /24 subnets and probe each host on Moonraker's port.
 *
 * Discovery happens in two phases:
 *
 *   Phase 0 — mDNS browse (`_snapmaker._tcp.local.`)
 *     Instant on single-VLAN networks. Candidates arrive before the
 *     port-scan even starts. Skipped (gracefully) if the IPC handler
 *     isn't registered in the Electron main process.
 *
 *   Phase 1 — subnet enumeration
 *     Sources (deduplicated, union):
 *       a. IPC `getLocalSubnets` — os.networkInterfaces() from main process.
 *       b. WebRTC ICE candidates — cheap fallback for old preload / odd routing.
 *       c. User-declared extras via `getExtraSubnets()` — multi-VLAN setups.
 *     Each prefix is tagged "local" or "extra" to pick the right batch size.
 *
 *   Phase 2 — parallel port-scan
 *     Probes 254 hosts per /24 in parallel batches. LOCAL uses batch=24
 *     (fast); EXTRA uses batch=4 with an inter-batch pause (firewall-safe).
 *     mDNS-found IPs are skipped to avoid duplicates.
 *
 * All log entries are forwarded via the optional `logPush` callback so
 * add-flow.js can display them in the debug journal without a hard dependency.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onCandidate]    - Called with each new candidate as it's found.
 * @param {Function} [opts.onProgress]    - Called with `{ done, total, prefixes }` after each batch.
 * @param {AbortSignal} [opts.signal]     - Abort signal to cancel the scan mid-run.
 * @param {Function} [opts.logPush]       - `(kind, summary, raw) => void` scan-log callback.
 * @param {Function} [opts.getExtraSubnets] - `() => string[]` returns user-declared extra prefixes.
 * @returns {Promise<void>}
 */
export async function snapScanLan({ onCandidate, onProgress, signal, logPush, getExtraSubnets } = {}) {
  // Environment snapshot — populated as we go so an export mid-scan
  // includes every layer tried so far, not just the final results.
  _snapScanLastEnv = {
    startedAt:      new Date().toISOString(),
    mdnsHits:       null,
    ipcSubnets:     null,
    webrtcSubnets:  null,
    userExtras:     null,
    prefixes:       null,
    probeTimeoutMs: SNAP_PROBE_TIMEOUT_MS,
    batchSizeLocal: SNAP_SCAN_BATCH_LOCAL,
    batchSizeExtra: SNAP_SCAN_BATCH_EXTRA,
    port:           SNAP_MOONRAKER_PORT,
  };

  // Track surfaced IPs so the port-scan doesn't re-probe mDNS hits.
  const seenIps = new Set();
  let hits = 0;

  // ── Phase 0: mDNS browse ─────────────────────────────────────────────────
  try {
    const mdnsRes = await window.electronAPI?.mdnsBrowseSnapmaker?.();
    const cands   = Array.isArray(mdnsRes?.candidates) ? mdnsRes.candidates : [];
    if (_snapScanLastEnv) _snapScanLastEnv.mdnsHits = cands.length;

    if (mdnsRes?.ok === false) {
      logPush?.("error",
        `mDNS browse failed: ${mdnsRes.error || "unknown"} — falling back to port-scan only`,
        { source: "mdns", error: mdnsRes.error });
    } else {
      logPush?.("info",
        `mDNS browse → ${cands.length} _snapmaker._tcp instance${cands.length === 1 ? "" : "s"}`,
        { source: "mdns", raw: cands });
    }

    for (const svc of cands) {
      const c = snapCandidateFromMdns(svc);
      if (!c || seenIps.has(c.ip)) continue;
      seenIps.add(c.ip);
      hits++;
      logPush?.("hit",
        `mDNS · ${c.ip} · ${c.machineModel} · score ${c.qualityScore} (no HTTP probe)`,
        { source: "mdns", service: svc, derived: c });
      onCandidate?.(c);
    }
  } catch (e) {
    logPush?.("error", `mDNS browse threw: ${e?.message || e}`, null);
  }

  // ── Phase 1: subnet enumeration ──────────────────────────────────────────
  /** @type {Array<{ prefix: string, source: "local"|"extra" }>} */
  const queue        = [];
  const seenPrefixes = new Set();
  const pushPrefix   = (p, source) => {
    if (!p || seenPrefixes.has(p)) return;
    seenPrefixes.add(p);
    queue.push({ prefix: p, source });
  };

  // 1a. Main-process IPC — os.networkInterfaces() from the Electron main process.
  let ipcWorked = false;
  try {
    const got = await window.electronAPI?.getLocalSubnets?.();
    if (Array.isArray(got)) {
      ipcWorked = true;
      if (_snapScanLastEnv) _snapScanLastEnv.ipcSubnets = got;
      got.forEach(p => pushPrefix(p, "local"));
      logPush?.("info",
        `IPC getLocalSubnets → [${got.join(", ") || "(empty)"}]`,
        { source: "ipc", subnets: got });
    } else {
      logPush?.("info",
        `IPC getLocalSubnets unavailable (returned ${typeof got}) — falling back to WebRTC. Restart Electron to enable the native IPC bridge.`,
        null);
    }
  } catch (e) {
    logPush?.("error", `getLocalSubnets failed: ${e?.message || e}`, null);
  }

  // 1b. WebRTC ICE candidates — free fallback, works even on old preloads.
  try {
    const webrtc = await snapDiscoverSubnetsViaWebRTC();
    if (_snapScanLastEnv) _snapScanLastEnv.webrtcSubnets = webrtc;
    const fresh  = webrtc.filter(p => !seenPrefixes.has(p));
    if (fresh.length || (!ipcWorked && webrtc.length)) {
      logPush?.("info",
        `WebRTC discovery → [${webrtc.join(", ")}]${fresh.length ? ` (added: ${fresh.join(", ")})` : " (already known)"}`,
        { source: "webrtc", subnets: webrtc, added: fresh });
    } else if (!ipcWorked) {
      logPush?.("info", "WebRTC discovery returned no candidates", null);
    }
    fresh.forEach(p => pushPrefix(p, "local"));
  } catch (e) {
    logPush?.("error", `WebRTC discovery failed: ${e?.message || e}`, null);
  }

  // 1c. User-declared extra subnets (multi-VLAN setups).
  const extras = getExtraSubnets?.() ?? [];
  if (_snapScanLastEnv) _snapScanLastEnv.userExtras = extras;
  if (extras.length) {
    const fresh = extras.filter(p => !seenPrefixes.has(p));
    logPush?.("info",
      `User extras → [${extras.join(", ")}]${fresh.length ? ` (added: ${fresh.join(", ")})` : " (already known)"}`,
      { source: "user", subnets: extras, added: fresh });
    fresh.forEach(p => pushPrefix(p, "extra"));
  }

  if (_snapScanLastEnv) _snapScanLastEnv.prefixes = queue.slice();
  logPush?.("info",
    `Port-scan starting — ${queue.length} subnet${queue.length === 1 ? "" : "s"}: ${queue.map(q => `${q.prefix}(${q.source})`).join(", ") || "(none)"}`,
    { queue, batchLocal: SNAP_SCAN_BATCH_LOCAL, batchExtra: SNAP_SCAN_BATCH_EXTRA });

  // ── Phase 2: port-scan ───────────────────────────────────────────────────
  const total = queue.length * 254;
  let   done  = 0;
  onProgress?.({ done, total, prefixes: queue.map(q => q.prefix) });

  const scanStart = performance.now();
  /** @type {Array<{ prefix:string, source:string, hits:number, elapsedMs:number, suspicious:boolean }>} */
  const subnetStats = [];

  for (const { prefix, source } of queue) {
    if (signal?.aborted) {
      logPush?.("info", "Scan aborted by user", null);
      return;
    }

    const isExtra = source === "extra";
    const batch   = isExtra ? SNAP_SCAN_BATCH_EXTRA : SNAP_SCAN_BATCH_LOCAL;
    const gapMs   = isExtra ? SNAP_SCAN_BATCH_GAP_MS_EXTRA : 0;

    logPush?.("info",
      `Scanning ${prefix}.1–254 (source=${source}, batch=${batch}${gapMs ? `, gap=${gapMs}ms` : ""})`,
      null);

    const subnetStart = performance.now();
    let   subnetHits  = 0;

    for (let start = 1; start <= 254; start += batch) {
      if (signal?.aborted) {
        logPush?.("info", "Scan aborted by user", null);
        return;
      }

      const end = Math.min(start + batch - 1, 254);
      const ips = [];
      for (let i = start; i <= end; i++) {
        const ip = `${prefix}.${i}`;
        // Skip IPs already surfaced via mDNS — avoids duplicates and saves
        // probe time (up to a few seconds shaved off when mDNS was effective).
        if (seenIps.has(ip)) { done++; continue; }
        ips.push(ip);
      }

      // Forward logPush into probeIp so per-host results appear in the journal.
      const results = await Promise.all(ips.map(ip =>
        snapProbeIp(ip, signal, { logPush }).catch(() => null)
      ));

      for (const r of results) {
        done++;
        if (!r) continue;
        // Only confirmed Snapmakers reach the UI. Other Moonraker hosts
        // (Voron, Bambu-Klipper, Creality K1 …) are logged as "ambiguous"
        // in the journal so the user can inspect them in debug mode, but
        // they don't pollute the result list.
        if (!r.isSnapmaker) {
          logPush?.("ambiguous",
            `${r.ip} — Moonraker host but not a Snapmaker (machine_type=${r.machineModel || "?"}) — skipped`,
            { ip: r.ip, machineModel: r.machineModel, derived: r });
          continue;
        }
        if (seenIps.has(r.ip)) continue;
        seenIps.add(r.ip);
        hits++;
        subnetHits++;
        onCandidate?.(r);
      }

      onProgress?.({ done, total, prefixes: queue.map(q => q.prefix) });

      // Inter-batch pause on EXTRA subnets only — gives the firewall's
      // rate-limiter time to reset between bursts.
      if (gapMs && start + batch <= 254) {
        await new Promise(r => setTimeout(r, gapMs));
      }
    }

    const subnetElapsedMs = Math.round(performance.now() - subnetStart);

    // Heuristic: an EXTRA subnet completing in < 4 s with 0 hits almost
    // certainly means the firewall silently dropped every SYN. We surface
    // a hint pointing the user at Manual Add rather than leaving them
    // wondering why the scan returned nothing.
    const suspicious = isExtra && subnetHits === 0 &&
                       subnetElapsedMs < SNAP_FIREWALL_BLOCK_HINT_MS;
    subnetStats.push({ prefix, source, hits: subnetHits, elapsedMs: subnetElapsedMs, suspicious });

    if (suspicious) {
      logPush?.("error",
        `${prefix}.0/24 finished in ${(subnetElapsedMs / 1000).toFixed(1)}s with 0 hits — your firewall likely blocked the scan. Try Manual Add with the printer's exact IP.`,
        { prefix, elapsedMs: subnetElapsedMs, hits: 0, hint: "firewall_block_suspected" });
    }
  }

  const elapsedMs = Math.round(performance.now() - scanStart);
  logPush?.("info",
    `Scan complete — ${hits} Snapmaker hit${hits === 1 ? "" : "s"} in ${(elapsedMs / 1000).toFixed(1)}s (${total} probes)`,
    { hits, totalProbes: total, elapsedMs, subnetStats });

  if (_snapScanLastEnv) _snapScanLastEnv.subnetStats = subnetStats;
}

// ── Firestore serialisation ───────────────────────────────────────────────────

/**
 * Serialise a candidate's discovery data into the shape persisted on the
 * Firestore device document under the `discovery` field.
 *
 * Includes:
 *   - `discoveredAt` — ISO timestamp so we know when the scan ran.
 *   - `source`       — `"mdns"` | `"http"`.
 *   - `derived`      — parsed identity fields (model, name, SN, firmware …).
 *   - `raw`          — verbatim mDNS service + HTTP response payloads.
 *
 * Storing raw payloads alongside derived fields means future features
 * (firmware-version-aware logic, model-detection improvements) can re-parse
 * the same source without a new scan, and is invaluable for support triage.
 *
 * @param {object|null} c - Candidate object from snapProbeIp / snapCandidateFromMdns.
 * @returns {object|null} Firestore-ready discovery record, or null.
 */
export function snapBuildDiscoveryRecord(c) {
  if (!c) return null;
  return {
    discoveredAt: new Date().toISOString(),
    source: c.source || null,
    derived: {
      ip:              c.ip              || null,
      isSnapmaker:     !!c.isSnapmaker,
      machineModel:    c.machineModel    || null,
      deviceName:      c.deviceName      || null,
      hostName:        c.hostName        || null,
      softwareVersion: c.softwareVersion || null,
      klippyState:     c.klippyState     || null,
      moonrakerVersion:c.moonrakerVersion|| null,
      apiVersion:      c.apiVersion      || null,
      serialNumber:    c.serialNumber    || null,
      nozzleCount:     c.nozzleCount     || 0,
      qualityScore:    c.qualityScore    || 0,
    },
    raw: c.raw || null,
  };
}
