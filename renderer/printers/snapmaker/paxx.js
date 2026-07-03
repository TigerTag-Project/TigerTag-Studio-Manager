/**
 * renderer/printers/snapmaker/paxx.js
 *
 * Paxx U1 Extended Firmware — latest-release resolver.
 *
 * The Snapmaker add/edit form recommends the community "Paxx" extended
 * firmware and offers a direct download of the .bin. The asset filename
 * embeds the version (U1_extended_<ver>_upgrade.bin), so a hardcoded URL
 * goes stale on every release. This module resolves the CURRENT latest
 * release through the public GitHub API and keeps it cached:
 *
 *   GET https://api.github.com/repos/paxx12-snapmaker-u1/
 *       SnapmakerU1-Extended-Firmware/releases/latest
 *
 * Design:
 *   - paxxLatest()       — sync; returns the cached record, or the
 *                          build-time fallback when nothing is cached yet.
 *   - paxxEnsureLatest() — async; refreshes the cache when older than 24 h.
 *                          Sends If-None-Match so an unchanged release
 *                          costs a 304 (which GitHub doesn't count against
 *                          the unauthenticated 60 req/h rate limit).
 *                          In-flight calls are deduplicated. Never rejects —
 *                          on any failure it resolves with the best known
 *                          record so callers can use the result directly.
 *
 * Callers (both gated on actual Snapmaker interest — no background polling):
 *   - inventory.js subscribePrinters() — a Snapmaker exists in the device list
 *   - add-flow.js openSnapAddFlow()    — user picked Snapmaker in the brand picker
 *
 * It also probes the version INSTALLED on a machine (paxxProbeInstalled):
 * the stock Moonraker endpoints only report the base version ("1.4.1") —
 * the paxx build number lives in the extended firmware's own config API.
 */

const PAXX_LATEST_API =
  'https://api.github.com/repos/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/releases/latest';

/** localStorage key holding the cached release record. */
const PAXX_LS_KEY = 'tigertag.paxx.latest';

/** Re-check the API at most once per 24 h. */
const PAXX_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Build-time fallback — last release known when this file was written.
 * Used before the first successful API fetch (fresh install, offline,
 * rate-limited). The download button always works, worst case it points
 * at this version instead of the very latest.
 */
const PAXX_FALLBACK = {
  tag: 'v1.4.1-paxx12-20',
  binName: 'U1_extended_1.4.1-paxx12-20_upgrade.bin',
  binUrl: 'https://github.com/paxx12-snapmaker-u1/SnapmakerU1-Extended-Firmware/releases/download/v1.4.1-paxx12-20/U1_extended_1.4.1-paxx12-20_upgrade.bin',
  publishedAt: null,
  etag: null,
  fetchedAt: 0,
};

/** Single in-flight fetch shared by concurrent callers. */
let _paxxInflight = null;

function _paxxReadCache() {
  try {
    const rec = JSON.parse(localStorage.getItem(PAXX_LS_KEY) || 'null');
    if (rec && rec.tag && rec.binUrl) return rec;
  } catch {}
  return null;
}

/**
 * Best currently-known release record (cached or fallback). Synchronous —
 * safe to call from render code.
 * @returns {{tag:string, binName:string, binUrl:string}}
 */
export function paxxLatest() {
  return _paxxReadCache() || PAXX_FALLBACK;
}

/**
 * Ensure the cached release record is fresh (≤ 24 h old), fetching the
 * GitHub API when it isn't. Resolves with the freshest record available;
 * never rejects.
 * @returns {Promise<{tag:string, binName:string, binUrl:string}>}
 */
export function paxxEnsureLatest() {
  const cached = _paxxReadCache();
  if (cached && Date.now() - (cached.fetchedAt || 0) < PAXX_TTL_MS) {
    return Promise.resolve(cached);
  }
  if (_paxxInflight) return _paxxInflight;

  _paxxInflight = (async () => {
    const prev = cached || PAXX_FALLBACK;
    try {
      const headers = { Accept: 'application/vnd.github+json' };
      if (prev.etag) headers['If-None-Match'] = prev.etag;
      const res = await fetch(PAXX_LATEST_API, { headers });

      // 304 — release unchanged since last fetch; just refresh the clock.
      if (res.status === 304) {
        const rec = { ...prev, fetchedAt: Date.now() };
        localStorage.setItem(PAXX_LS_KEY, JSON.stringify(rec));
        return rec;
      }
      if (!res.ok) return prev; // rate-limited / GitHub down — keep what we have

      const json = await res.json();
      // The upgrade image is the asset ending in "_upgrade.bin" — its full
      // name changes every release, the suffix is the stable part.
      const bin = (json.assets || []).find(a => /_upgrade\.bin$/i.test(a.name || ''));
      if (!json.tag_name || !bin?.browser_download_url) return prev;

      const rec = {
        tag: json.tag_name,
        binName: bin.name,
        binUrl: bin.browser_download_url,
        publishedAt: json.published_at || null,
        etag: res.headers.get('etag') || null,
        fetchedAt: Date.now(),
      };
      localStorage.setItem(PAXX_LS_KEY, JSON.stringify(rec));
      return rec;
    } catch {
      return prev; // offline — keep what we have
    } finally {
      _paxxInflight = null;
    }
  })();
  return _paxxInflight;
}

// ── Installed-version probe (paxx machines only) ──────────────────────────────

/**
 * Read the paxx firmware version INSTALLED on a machine.
 *
 *   GET http://<ip>/firmware-config/api/status
 *   → { version: { items: [ { label: "Version",
 *                             value: "1.4.1-paxx12-19-24e1594" }, … ] } }
 *
 * The endpoint only exists on paxx firmware — stock machines 404, which is
 * itself the "runs paxx?" detector. Routed through the snap:http-get IPC
 * (path allowlisted in main.js) because the printer's nginx sends no CORS
 * headers, so a renderer fetch would be blocked.
 *
 * @param {string} ip - Printer IPv4 address.
 * @returns {Promise<string|null>} Installed version string, or null when the
 *   machine is unreachable, on stock firmware, or the payload is unexpected.
 */
export async function paxxProbeInstalled(ip) {
  if (!ip || !window.electronAPI?.snapHttpGet) return null;
  try {
    const res = await window.electronAPI.snapHttpGet(`http://${ip}/firmware-config/api/status`, 2500);
    if (!res?.ok || !res.json) return null;
    const items = res.json?.version?.items;
    if (!Array.isArray(items)) return null;
    const v = items.find(i => i?.label === "Version")?.value;
    return (typeof v === "string" && v.trim()) ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Extract the paxx build pair from any version string:
 *   "1.4.1-paxx12-19-24e1594" → [12, 19]   (installed, with commit suffix)
 *   "v1.4.1-paxx12-20"        → [12, 20]   (release tag)
 * @returns {[number, number]|null} null when the string carries no paxx build
 *   (stock firmware, unexpected format).
 */
export function paxxBuildOf(s) {
  const m = /paxx(\d+)-(\d+)/i.exec(String(s || ""));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Trim a version string to a clean, human-readable paxx label — drops the
 * trailing git-commit hash the installed value carries:
 *   "1.4.1-paxx12-19-24e1594" → "1.4.1-paxx12-19"
 *   "v1.4.1-paxx12-20"        → "v1.4.1-paxx12-20" (unchanged)
 * Returns the input untouched when it carries no paxx build.
 */
export function paxxCleanVersion(s) {
  const m = /^(.*?paxx\d+-\d+)/i.exec(String(s || ""));
  return m ? m[1] : String(s || "");
}

/**
 * True when `installed` carries a paxx build strictly older than `latestTag`'s.
 * False when either side has no paxx build (stock machines are never nagged).
 */
export function paxxUpdateAvailable(installed, latestTag) {
  const a = paxxBuildOf(installed);
  const b = paxxBuildOf(latestTag);
  if (!a || !b) return false;
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}
