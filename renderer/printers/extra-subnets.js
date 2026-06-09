/**
 * printers/extra-subnets.js — Shared "extra subnets to scan" store.
 *
 * One global list of `"a.b.c"` /24 prefixes the user has declared as reachable
 * via routing but not directly bound to a Mac interface. Used by every brand's
 * LAN scanner (Bambu / Creality / Elegoo / FlashForge / Snapmaker) so a user
 * on a multi-VLAN home network configures their topology *once* and every
 * scan modal honours it.
 *
 * Storage layers (read in this order):
 *   1. In-memory cache `_list`                            (fastest)
 *   2. localStorage `tigertag.scanExtraSubnets`           (offline / cold-start fallback)
 *   3. Firestore `users/{uid}.scanExtraSubnets`           (canonical, multi-device)
 *
 * inventory.js owns the Firestore wiring — it calls `setPersister()` to
 * inject the write function and `setInitialList()` when the Firestore snapshot
 * arrives. Brand add-flows are pure callers — they never touch Firebase
 * directly.
 *
 * Subscribers (one per visible scan modal) get notified on every list change
 * so chips in a still-open Snapmaker modal update when the user adds a prefix
 * inside a different brand's modal.
 */

const CACHE_KEY = "tigertag.scanExtraSubnets";

// ── In-memory cache + subscribers ────────────────────────────────────────────
let _list = [];
const _subscribers = new Set();
let _persister = null;        // (string[]) => Promise<void> | void — injected by inventory.js

function _notify() {
  for (const fn of _subscribers) { try { fn([..._list]); } catch {} }
}

function _cacheRead() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(p => typeof p === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p))
      : [];
  } catch { return []; }
}
function _cacheWrite(list) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch {}
}

// Hot-load cache on module init so the first render before Firestore arrives
// already shows whatever the user had last session.
_list = _cacheRead();

// ── Public read API ──────────────────────────────────────────────────────────
export function loadList() { return [..._list]; }

// ── Validation ──────────────────────────────────────────────────────────────
/**
 * Validate a typed prefix "a.b.c". Rejects unroutable / multicast /
 * loopback ranges (a==0/127/169 / a>=224). Returns the canonical prefix
 * string on success, null on failure.
 */
export function validatePrefix(s) {
  const m = String(s || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const a = +m[1], b = +m[2], c = +m[3];
  if (a > 255 || b > 255 || c > 255) return null;
  if (a === 0 || a === 127 || a === 169 || a >= 224) return null;
  return `${a}.${b}.${c}`;
}

// ── Mutations ───────────────────────────────────────────────────────────────
/**
 * Add a prefix (validated + de-duplicated). Returns the canonical prefix
 * added, or null if validation failed or the prefix was already present.
 */
export function addPrefix(rawPrefix) {
  const v = validatePrefix(rawPrefix);
  if (!v) return null;
  if (_list.includes(v)) return null;
  _list = [..._list, v];
  _cacheWrite(_list);
  try { _persister?.(_list); } catch {}
  _notify();
  return v;
}

/** Remove a prefix. No-op if not present. */
export function removePrefix(prefix) {
  const next = _list.filter(p => p !== prefix);
  if (next.length === _list.length) return;
  _list = next;
  _cacheWrite(_list);
  try { _persister?.(_list); } catch {}
  _notify();
}

// ── Wiring (called by inventory.js once at auth time) ───────────────────────
/**
 * Inject the Firestore writer. The persister receives the new full list and
 * is expected to write it to `users/{uid}.scanExtraSubnets`. Errors thrown
 * by the persister are swallowed at the call site — the in-memory + cache
 * layers always win locally.
 */
export function setPersister(fn) { _persister = typeof fn === "function" ? fn : null; }

/**
 * Replace the in-memory list (called by inventory.js when the Firestore
 * snapshot arrives). Updates the cache and notifies all subscribers so any
 * open scan modal redraws its chips. Filters out malformed entries
 * defensively.
 */
export function setInitialList(arr) {
  const cleaned = Array.isArray(arr)
    ? arr.filter(p => typeof p === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p))
    : [];
  // Identity check — avoid noisy re-renders when the snapshot echoes our
  // own pending write.
  if (cleaned.length === _list.length && cleaned.every((v, i) => v === _list[i])) return;
  _list = cleaned;
  _cacheWrite(_list);
  _notify();
}

// ── Subscriptions (used by scan modals to redraw their chip list) ───────────
/**
 * Register a callback for list changes. Returns an unsubscribe function.
 * Called immediately with the current list so subscribers don't have to
 * pull separately.
 */
export function subscribe(fn) {
  if (typeof fn !== "function") return () => {};
  _subscribers.add(fn);
  try { fn([..._list]); } catch {}
  return () => _subscribers.delete(fn);
}

// ── Shared chip-render helper ───────────────────────────────────────────────
/**
 * Render the chip list into `<element id={chipsElementId}>`. Each chip is
 * styled with the existing `.snap-extra-subnets-chip` rule (every brand
 * imports the snap-prefixed CSS for this widget already). Calls `tFn` (a
 * function returning the translated "Remove" string) for the chip tooltip.
 *
 * Returns a tear-down function that removes the listeners — call it when
 * the modal closes.
 */
export function renderChipsInto(chipsElementId, escFn, tFn) {
  const el = document.getElementById(chipsElementId);
  if (!el) return () => {};
  const _esc = typeof escFn === "function" ? escFn : (s => String(s));
  const _t   = typeof tFn   === "function" ? tFn   : (k => k);
  const _draw = (list) => {
    el.innerHTML = list.map(p => `
      <span class="snap-extra-subnets-chip">
        <span class="snap-extra-subnets-chip-text">${_esc(p)}.x</span>
        <button type="button" class="snap-extra-subnets-chip-x" data-prefix="${_esc(p)}" title="${_esc(_t("snapScanExtraSubnetsRemove") || "Remove")}">✕</button>
      </span>
    `).join("");
    el.querySelectorAll(".snap-extra-subnets-chip-x").forEach(btn => {
      btn.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        removePrefix(btn.dataset.prefix);
      });
    });
  };
  return subscribe(_draw);
}

// ── One-time migration of legacy per-brand keys ─────────────────────────────
/**
 * v1.8.20 unified the four per-brand keys
 * (snap / cre / elg / ffg ScanExtraSubnets) into a single global list. This
 * runs once on app start: merges any legacy entries into the new list,
 * pushes to Firestore via the persister, and deletes the legacy keys so
 * subsequent reads go straight to the unified store. Idempotent — safe to
 * call multiple times.
 */
const LEGACY_KEYS = [
  "tigertag.snapScanExtraSubnets",
  "tigertag.creScanExtraSubnets",
  "tigertag.elgScanExtraSubnets",
  "tigertag.ffgScanExtraSubnets",
];
export function migrateLegacyKeys() {
  let merged = [..._list];
  let foundAny = false;
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      foundAny = true;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const p of parsed) {
          if (typeof p === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p) && !merged.includes(p)) {
            merged.push(p);
          }
        }
      }
      localStorage.removeItem(key);
    } catch {}
  }
  if (foundAny && merged.length !== _list.length) {
    _list = merged;
    _cacheWrite(_list);
    try { _persister?.(_list); } catch {}
    _notify();
  }
}
