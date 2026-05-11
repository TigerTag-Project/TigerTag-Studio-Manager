/**
 * renderer/printers/snapmaker/add-flow.js
 *
 * Snapmaker "add printer" UI flow.
 * Owns the three modals in the add sequence:
 *   1. Choice modal  — Scan vs Manual Add.
 *   2. Scan panel    — live LAN scanner with result cards.
 *   3. Manual modal  — direct IP entry + Moonraker probe.
 *
 * Network / data work (probing, scanning, serialisation) is delegated
 * to probe.js so this file stays focused on DOM and UX logic.
 *
 * All modals are created lazily on first openSnapAddFlow() call and
 * appended to document.body — nothing is hard-coded in inventory.html.
 *
 * Entry point: openSnapAddFlow()
 *   Called from the brand picker in inventory.js when the user picks Snapmaker.
 *
 * Callbacks into inventory.js go through ctx (renderer/printers/context.js)
 * to avoid circular imports.
 */

import { ctx } from '../context.js';
import {
  snapProbeIp,
  snapScanLan,
  snapBuildDiscoveryRecord,
  getLastScanEnv,
} from './probe.js';

const $ = id => document.getElementById(id);

// ── Private state ────────────────────────────────────────────────────────────

let _snapScanAbort = null;     // AbortController for the in-flight scan
let _snapManualAbort = null;   // AbortController for the manual probe
let _snapAddIpAbort = null;    // AbortController for the inline IP probe

// ── User-declared extra subnets ──────────────────────────────────────────────
// For multi-VLAN networks where the Mac can REACH a subnet via routing
// but doesn't have an interface on it. os.networkInterfaces() and the
// WebRTC trick both report only the subnets the Mac is *directly* on,
// so without this list any printer behind a VLAN router is invisible
// to the auto-scan.
//
// Stored as a JSON array of "a.b.c" prefixes in localStorage, keyed
// globally (not per-account) since it describes the user's network
// topology, which is the same regardless of which TigerTag account
// they're signed into.

const SNAP_EXTRA_SUBNETS_KEY = "tigertag.snapScanExtraSubnets";

function snapLoadExtraSubnets() {
  try {
    const raw = localStorage.getItem(SNAP_EXTRA_SUBNETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Defensive: a corrupt/legacy value shouldn't take the scan down.
    // Filter out anything that doesn't look like an "a.b.c" prefix.
    return Array.isArray(parsed)
      ? parsed.filter(p => typeof p === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p))
      : [];
  } catch { return []; }
}
function snapSaveExtraSubnets(list) {
  try {
    localStorage.setItem(SNAP_EXTRA_SUBNETS_KEY, JSON.stringify(list));
  } catch {}
}
// Validate a typed IPv4 address. Accepts "a.b.c.d" with each octet
// 0-255 and rejects unroutable / multicast / loopback ranges. Returns
// the canonicalised IP string on success, null on failure. Used by
// the inline "Add by IP" field in the scan modal.
function snapValidateIp(s) {
  const m = String(s || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const a = +m[1], b = +m[2], c = +m[3], d = +m[4];
  if (a > 255 || b > 255 || c > 255 || d > 255) return null;
  if (a === 0 || a === 127 || a === 169 || a >= 224) return null;
  return `${a}.${b}.${c}.${d}`;
}
// Validate a user-typed prefix. Accepts "a.b.c" with each octet 0-255,
// and rejects unroutable / multicast / loopback ranges.
function snapValidatePrefix(s) {
  const m = String(s || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const a = +m[1], b = +m[2], c = +m[3];
  if (a > 255 || b > 255 || c > 255) return null;
  if (a === 0 || a === 127 || a === 169 || a >= 224) return null;
  return `${a}.${b}.${c}`;
}
function snapRenderExtraSubnetsUI() {
  const chipsEl = $("snapExtraSubnetsChips");
  const countEl = $("snapExtraSubnetsCount");
  if (!chipsEl) return;
  const list = snapLoadExtraSubnets();
  if (countEl) countEl.textContent = String(list.length);
  chipsEl.innerHTML = list.map(p => `
    <span class="snap-extra-subnets-chip">
      <span class="snap-extra-subnets-chip-text">${ctx.esc(p)}.x</span>
      <button type="button" class="snap-extra-subnets-chip-x" data-prefix="${ctx.esc(p)}" title="${ctx.esc(ctx.t("snapScanExtraSubnetsRemove") || "Remove")}">✕</button>
    </span>
  `).join("");
  // Wire each remove button — saves + re-renders + leaves the
  // <details> element open so the user keeps their place.
  chipsEl.querySelectorAll(".snap-extra-subnets-chip-x").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      const p = btn.dataset.prefix;
      const next = snapLoadExtraSubnets().filter(x => x !== p);
      snapSaveExtraSubnets(next);
      snapRenderExtraSubnetsUI();
    });
  });
}
function snapAddExtraSubnetFromInput() {
  const input = $("snapExtraSubnetsInput");
  const errEl = $("snapExtraSubnetsErr");
  if (!input) return;
  const v = snapValidatePrefix(input.value);
  if (!v) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = ctx.t("snapScanExtraSubnetsBadFormat")
                        || "Use format a.b.c (e.g. 192.168.40)";
    }
    input.focus();
    return;
  }
  if (errEl) errEl.hidden = true;
  const list = snapLoadExtraSubnets();
  if (!list.includes(v)) list.push(v);
  snapSaveExtraSubnets(list);
  input.value = "";
  snapRenderExtraSubnetsUI();
  input.focus();
}

// ── Debug scan journal ────────────────────────────────────────────────────────
// A live, in-modal log of everything the scanner does — only visible
// when ctx.isDebugEnabled() is true. Useful for the user to confirm
// which subnets are being walked, what /printer/info actually answers,
// and why a host did or didn't qualify. Lines are appended in order;
// clicking a line copies its raw JSON to the clipboard.

// Cap so a long-running scan can't blow up the DOM. 600 entries covers
// 2 full /24 sweeps with a comfortable safety margin.
const SNAP_SCAN_LOG_MAX = 600;
let _snapScanLog = [];   // [{ ts, kind, summary, raw }]
// Whether the journal SECTION is shown to the user. The scan log is
// a debug-only diagnostic UI; in non-debug mode the panel is hidden
// but the underlying log array is STILL maintained (see push() below)
// so a user who toggles Debug ON after a scan can immediately inspect
// what happened. This decouples scan BEHAVIOUR from debug mode —
// there is exactly one scan workflow, the only thing that varies is
// whether the journal panel is visible.
function snapScanLogVisible() {
  return ctx.isDebugEnabled();
}
function snapScanLogPush(kind, summary, raw) {
  // ALWAYS record to the in-memory log, regardless of debug state.
  // Earlier this function returned early when debug was off, which
  // meant the log array was empty in non-debug runs but ALSO meant
  // that any side-effect downstream of the push (none today, but a
  // good defensive guarantee) wouldn't fire. The UI gate is enforced
  // exclusively by snapScanLogRender().
  const ts = new Date().toLocaleTimeString([], { hour12: false }) + "." +
             String(new Date().getMilliseconds()).padStart(3, "0");
  _snapScanLog.push({ ts, kind, summary, raw: raw == null ? null : raw });
  if (_snapScanLog.length > SNAP_SCAN_LOG_MAX) {
    _snapScanLog.splice(0, _snapScanLog.length - SNAP_SCAN_LOG_MAX);
  }
  snapScanLogRender();
}
function snapScanLogClear() {
  _snapScanLog = [];
  snapScanLogRender();
}

// Build a self-contained JSON dump of the current scan log + the
// environment that produced it (subnets, app version, browser UA,
// timestamp). The result is small enough to paste straight into a
// chat / GitHub issue. Includes raw printer payloads when present so
// a remote diagnosis doesn't need to ask for follow-ups.
async function snapScanLogBuildExport() {
  let appInfo = null;
  try { appInfo = await window.electronAPI?.getAppInfo?.(); } catch {}
  return {
    meta: {
      kind: "tigertag-snapmaker-scan-log",
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: appInfo?.appVersion || null,
      platform:   appInfo?.platform || null,
      electron:   appInfo?.electron || null,
      userAgent:  navigator.userAgent || null,
      language:   document.documentElement.lang || navigator.language || null,
    },
    environment: getLastScanEnv(),
    log: _snapScanLog.map(e => ({
      ts: e.ts, kind: e.kind, summary: e.summary, raw: e.raw
    })),
  };
}
// User-triggered Export action — copies the JSON dump to clipboard
// and flashes the button green for 700ms so the user gets feedback.
// Falls back to a textarea + manual select-all if the Clipboard API
// is unavailable (eg. very old Electron / non-secure context).
async function snapScanLogExport() {
  const btn = $("snapScanLogExport");
  const dump = await snapScanLogBuildExport();
  const text = JSON.stringify(dump, null, 2);
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // Fallback: hidden textarea + execCommand. Old but reliable.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {}
  }
  if (btn) {
    // Flip ONLY the inner label span — the button now contains an
    // SVG icon and a text span, so a textContent flip on the button
    // itself would wipe the icon. We target the [data-i18n] span by
    // name so the icon stays untouched during the feedback flash.
    const labelEl = btn.querySelector("[data-i18n]");
    const orig    = labelEl ? labelEl.textContent : btn.textContent;
    const next    = ok
      ? (ctx.t("snapScanLogExported") || "Copied!")
      : (ctx.t("snapScanLogExportFailed") || "Copy failed");
    if (labelEl) labelEl.textContent = next; else btn.textContent = next;
    btn.classList.add(ok ? "snap-scan-log-btn--ok" : "snap-scan-log-btn--err");
    setTimeout(() => {
      if (labelEl) labelEl.textContent = orig; else btn.textContent = orig;
      btn.classList.remove("snap-scan-log-btn--ok", "snap-scan-log-btn--err");
    }, 1100);
  }
}
function snapScanLogRender() {
  const sec   = $("snapScanLog");
  const body  = $("snapScanLogBody");
  const count = $("snapScanLogCount");
  if (!sec) return;
  // Hide the whole panel when debug is off.
  if (!snapScanLogVisible()) {
    sec.hidden = true;
    return;
  }
  sec.hidden = false;
  if (count) count.textContent = String(_snapScanLog.length);
  if (!body || body.hidden) return;
  // Render incrementally if possible — same DOM elements stay in place
  // so the user's scroll position is preserved when new lines arrive.
  const want = _snapScanLog.length;
  const have = body.children.length;
  if (have > want) {
    // Log was cleared: tear down + re-render.
    body.innerHTML = "";
  }
  for (let i = body.children.length; i < want; i++) {
    const e = _snapScanLog[i];
    const row = document.createElement("button");
    row.type = "button";
    row.className = `snap-scan-log-row snap-scan-log-row--${ctx.esc(e.kind)}`;
    row.title = ctx.t("snapScanLogCopy") || "Click to copy raw JSON";
    row.innerHTML = `
      <span class="snap-scan-log-ts">${ctx.esc(e.ts)}</span>
      <span class="snap-scan-log-kind">${ctx.esc(e.kind)}</span>
      <span class="snap-scan-log-summary">${ctx.esc(e.summary)}</span>`;
    if (e.raw != null) {
      row.addEventListener("click", () => {
        const text = typeof e.raw === "string" ? e.raw : JSON.stringify(e.raw, null, 2);
        navigator.clipboard?.writeText(text).catch(() => {});
        row.classList.add("snap-scan-log-row--copied");
        setTimeout(() => row.classList.remove("snap-scan-log-row--copied"), 700);
      });
    } else {
      row.disabled = true;
    }
    body.appendChild(row);
  }
  // Auto-scroll to bottom so the latest line is always visible.
  body.scrollTop = body.scrollHeight;
}

// Aborts whatever scan is currently running (if any). Safe to call
// multiple times; a second call on an already-aborted controller is a
// no-op. Used both when the user cancels and when they restart.
function snapAbortScan() {
  try { _snapScanAbort?.abort(); } catch {}
  _snapScanAbort = null;
}

// ─── NETWORK / DATA LAYER MOVED TO probe.js ──────────────────────────────────
// snapFlattenJson, snapFirstStr, snapProbeIp, snapDiscoverSubnetsViaWebRTC,
// snapCandidateFromMdns, snapScanLan, snapBuildDiscoveryRecord, getLastScanEnv
// are all imported from ./probe.js at the top of this file.
// ─────────────────────────────────────────────────────────────────────────────


// Resolve a Moonraker `machine_model` string against the local Snapmaker
// catalog so we can pre-fill the model picker with the matching entry
// (and fall back to the placeholder "Select Printer" id=0 when nothing
// matches — e.g. firmware reporting a model we don't have art for yet).
function snapModelIdFromMachineModel(machineModel) {
  if (!machineModel) return "0";
  const list = ctx.getState().db?.printerModels?.snapmaker || [];
  const hay = String(machineModel).toLowerCase().replace(/[\s_-]+/g, "");
  // Try exact / contains match against name OR id, normalised. We strip
  // separators on both sides so "Snapmaker U1" matches catalog entries
  // like "U1", "snapmaker-u1" or "Snapmaker_U1" alike.
  let hit = list.find(m => {
    const mn = String(m.name || "").toLowerCase().replace(/[\s_-]+/g, "");
    const mi = String(m.id   || "").toLowerCase().replace(/[\s_-]+/g, "");
    return mn === hay || mi === hay || (mn && hay.includes(mn)) || (mn && mn.includes(hay));
  });
  return hit ? String(hit.id) : "0";
}

function snapCandidateCardHtml(c) {
  // Title line — prefer the user's nickname (device_name) over the
  // model over the codename hostname over the bare IP. This is the
  // exact same priority we use to pre-fill the form, so the card
  // visibly previews what the form will be seeded with.
  const title = c.deviceName || c.machineModel || c.hostName || c.ip;
  // Model + firmware version — the "what is this printer" line.
  const modelParts = [];
  if (c.machineModel && c.machineModel !== title) modelParts.push(c.machineModel);
  if (c.softwareVersion) modelParts.push(`v${c.softwareVersion}`);
  const modelLine = modelParts.join(" · ");
  // Hostname — only shown when it's not redundant with the title.
  const hostLine  = (c.hostName && c.hostName !== title && c.hostName !== c.machineModel)
                  ? c.hostName : "";
  // Serial number on its own row (formatted with the "S/N" prefix to
  // match how the field is displayed on the printer's own touchscreen
  // and in the support tooling).
  const serialLine = c.serialNumber ? `S/N · ${c.serialNumber}` : "";
  // Confidence tier. With the new scoring (isSnapmaker = +8), a
  // confirmed Snapmaker always lands in the "high" tier, generic
  // Moonraker hosts in low/med depending on what they reveal.
  const score = c.qualityScore || 0;
  const tier  = score >= 10 ? "high" : (score >= 5 ? "med" : "low");
  // Brand badge — only shown when machine_type contained "Snapmaker".
  // Visual confirmation that THIS row is a real Snapmaker, not a
  // Klipper-running NAS or someone's Voron.
  const brandBadge = c.isSnapmaker
    ? `<span class="snap-scan-card-badge" title="${ctx.esc(ctx.t("snapScanCardBrandConfirmed") || "Confirmed Snapmaker (machine_type contains 'Snapmaker')")}">Snapmaker</span>`
    : "";
  // Resolve the model image so the card previews which printer this
  // is. Falls back to the per-brand "Select Printer" entry image
  // (which IS no_printer.png in the catalog) when machine_type didn't
  // match anything we know — keeps the layout stable instead of
  // showing an empty thumbnail box.
  const modelId    = snapModelIdFromMachineModel(c.machineModel || c.hostName);
  const matched    = ctx.findPrinterModel("snapmaker", modelId);
  const fallback   = ctx.findPrinterModel("snapmaker", "0"); // catalog placeholder = no_printer.png
  const imgUrl     = ctx.printerImageUrl(matched) || ctx.printerImageUrl(fallback);
  const thumbHtml  = imgUrl
    ? `<img src="${ctx.esc(imgUrl)}" alt="" onerror="this.style.opacity='.15'"/>`
    : "";
  // Card markup — uses a <div role="button"> rather than a real
  // <button>. Reason: browsers refuse to honour `display: flex` on a
  // <button> with multiple block children predictably; the rendering
  // collapses to inline-block height in some contexts (visible bug:
  // thumbnail bleeding below the visible card box). A div with the
  // proper a11y attributes (role, tabindex, key handler) gives us
  // perfect control over the layout AND keeps the keyboard story
  // working (Enter / Space trigger via the wired keydown handler).
  return `
    <div class="snap-scan-card snap-scan-card--${tier}${c.isSnapmaker ? " snap-scan-card--snap" : ""}"
         role="button" tabindex="0"
         data-ip="${ctx.esc(c.ip)}" data-model="${ctx.esc(c.machineModel || "")}" data-host="${ctx.esc(c.hostName || "")}">
      <span class="snap-scan-card-thumb">${thumbHtml}</span>
      <span class="snap-scan-card-main">
        <span class="snap-scan-card-title">
          <span class="snap-scan-card-title-text">${ctx.esc(title)}</span>
          ${brandBadge}
        </span>
        <span class="snap-scan-card-ip">${ctx.esc(c.ip)}</span>
        ${modelLine  ? `<span class="snap-scan-card-line snap-scan-card-line--model">${ctx.esc(modelLine)}</span>` : ""}
        ${hostLine   ? `<span class="snap-scan-card-line snap-scan-card-line--host" title="${ctx.esc(hostLine)}">${ctx.esc(hostLine)}</span>` : ""}
        ${serialLine ? `<span class="snap-scan-card-line snap-scan-card-line--sn"   title="${ctx.esc(c.serialNumber)}">${ctx.esc(serialLine)}</span>` : ""}
      </span>
      <span class="snap-scan-card-score" title="${ctx.esc(ctx.t("snapScanScore", { n: score }) || `Match score: ${score}`)}">${score}</span>
      <span class="icon icon-chevron-r icon-14 snap-scan-card-chev"></span>
    </div>`;
}

function openSnapmakerScan() {
  // Side-panel pattern (matches scales / printer-detail / friends):
  // two elements driven by `.open` — `#snapScanOverlay` (the dim
  // backdrop) and `#snapScanPanel` (the slide-in card itself).
  const overlay = $("snapScanOverlay");
  const panel   = $("snapScanPanel");
  if (!overlay || !panel) return;
  const sub      = $("snapScanSub");
  const bar      = $("snapScanBar");
  const stats    = $("snapScanStats");
  const results  = $("snapScanResults");
  const empty    = $("snapScanEmpty");
  if (results) results.innerHTML = "";
  if (empty)   empty.hidden = false;
  if (bar)     bar.style.width = "0%";
  if (stats)   stats.textContent = "0 / 0";
  if (sub)     sub.textContent = ctx.t("snapScanStarting") || "Starting scan…";
  // Reset the debug log on every (re)scan so the user sees only the
  // current run's output. Render shows/hides the panel based on the
  // current debugEnabled flag.
  snapScanLogClear();
  // Refresh the user-declared extra-subnets chips every time the modal
  // opens so they reflect the latest localStorage state (e.g. if the
  // user opened settings in another window).
  snapRenderExtraSubnetsUI();
  // Reset the Add-by-IP widget so reopening doesn't carry stale state
  // (a half-typed IP, an "Invalid" tip, etc.) from the previous session.
  // Closing the <details> triggers the `toggle` listener above, which
  // already wipes the input/tip/button/status — so we only need to
  // collapse the wrapper and abort any in-flight probe here.
  const ipDetails = $("snapAddIpDetails");
  if (ipDetails) ipDetails.open = false;
  try { _snapAddIpAbort?.abort(); } catch {}
  _snapAddIpAbort = null;
  // Slide the panel in + dim the backdrop. Both get `.open` so the
  // CSS transitions on each fire in lockstep.
  overlay.classList.add("open");
  panel.classList.add("open");

  // Cancel any previous scan, then start fresh.
  snapAbortScan();
  const ctl = new AbortController();
  _snapScanAbort = ctl;

  let foundCount = 0;
  // Track which IPs we've already rendered so we can update the row in
  // place rather than appending a duplicate when /printer/info answers
  // after /server/info has already produced a (lower-score) candidate.
  const rendered = new Map(); // ip -> { card, score }
  snapScanLan({
    signal:          ctl.signal,
    logPush:         snapScanLogPush,
    getExtraSubnets: snapLoadExtraSubnets,
    onCandidate: (c) => {
      if (empty) empty.hidden = true;
      const wrap = document.createElement("div");
      wrap.innerHTML = snapCandidateCardHtml(c);
      const card = wrap.firstElementChild;
      if (!card) return;
      // Click / Enter → close the scan panel and open the Printer
      // Settings modal pre-filled from the probe data. Firestore write
      // happens only when the user confirms in that form.
      const triggerAdd = () => {
        console.log("[snap-scan] triggerAdd fired for", c.ip);
        // Close the scan panel and open the Printer Settings modal
        // pre-filled with everything we discovered. The user confirms
        // before anything is written to Firestore.
        closeSnapmakerScan();
        ctx.openPrinterSettings("snapmaker", null, {
          ip:          c.ip,
          printerName: c.deviceName || c.machineModel || c.hostName || `Snapmaker ${c.ip}`,
          modelId:     snapModelIdFromMachineModel(c.machineModel || c.hostName),
          discovery:   snapBuildDiscoveryRecord(c),
        });
      };
      card.addEventListener("click", triggerAdd);
      card.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          triggerAdd();
        }
      });
      const prev = rendered.get(c.ip);
      if (prev) {
        // Existing entry — replace it only if the new probe scored
        // higher (more identity fields filled in). Otherwise drop the
        // duplicate so the list stays stable.
        if ((c.qualityScore || 0) > prev.score) {
          prev.card.replaceWith(card);
          rendered.set(c.ip, { card, score: c.qualityScore || 0 });
        }
      } else {
        foundCount++;
        rendered.set(c.ip, { card, score: c.qualityScore || 0 });
        if (results) results.appendChild(card);
      }
      // Re-sort visible rows by score (desc) so the strongest match
      // bubbles to the top as scan results stream in. Tie-break on IP
      // so the order is stable when scores equal.
      if (results) {
        const sorted = Array.from(results.children).sort((a, b) => {
          const sa = +(a.querySelector(".snap-scan-card-score")?.textContent || 0);
          const sb = +(b.querySelector(".snap-scan-card-score")?.textContent || 0);
          if (sb !== sa) return sb - sa;
          return (a.dataset.ip || "").localeCompare(b.dataset.ip || "", undefined, { numeric: true });
        });
        sorted.forEach(el => results.appendChild(el));
      }
    },
    onProgress: ({ done, total, prefixes }) => {
      if (bar)   bar.style.width = total ? `${Math.min(100, (done / total) * 100)}%` : "0%";
      if (stats) stats.textContent = `${done} / ${total}`;
      if (sub) {
        // No active NIC ⇒ os.networkInterfaces() returned nothing
        // useful. Tell the user to check the connection rather than
        // silently spinning at 0/0.
        if (total === 0) {
          sub.textContent = ctx.t("snapScanNoSubnets")
                          || "No active network detected — connect to Wi-Fi or Ethernet.";
          return;
        }
        if (done >= total) {
          sub.textContent = ctx.t("snapScanDone", { n: foundCount }) || `Scan complete — ${foundCount} found`;
          // When the scan finished with 0 Snapmaker hits, swap the
          // generic empty state for a more actionable one if any
          // user-declared subnet looks firewall-blocked. Reads
          // getLastScanEnv().subnetStats which snapScanLan populated.
          if (foundCount === 0 && empty) {
            const blocked = (getLastScanEnv()?.subnetStats || [])
              .filter(s => s.suspicious)
              .map(s => `${s.prefix}.0/24`);
            if (blocked.length) {
              empty.innerHTML = ctx.esc(ctx.t("snapScanEmptyFirewall", { p: blocked.join(", ") })
                || `Your firewall likely dropped probes on ${blocked.join(", ")} — try Manual Add with the printer's exact IP.`);
              empty.classList.add("snap-scan-empty--warn");
            } else {
              empty.textContent = ctx.t("snapScanEmpty")
                || "No Snapmaker found yet — make sure the printer is on the same Wi-Fi network.";
              empty.classList.remove("snap-scan-empty--warn");
            }
          }
        } else {
          sub.textContent = ctx.t("snapScanProgress", { p: prefixes.join(", ") })
                          || `Scanning ${prefixes.join(", ")}…`;
        }
      }
    }
  }).catch(() => {/* aborted or per-host failure already swallowed */});
}
function closeSnapmakerScan() {
  snapAbortScan();
  $("snapScanOverlay")?.classList.remove("open");
  $("snapScanPanel")?.classList.remove("open");
}

// ── Inline "Add by IP" — live IPv4 validation + direct probe ─────────────────
// Drives 4 visual states on the input + button:
//   1. EMPTY     — neutral border, button disabled, no tip
//   2. TYPING    — neutral border (still incomplete), button disabled, no tip
//   3. INVALID   — red border, info bubble visible, button disabled
//   4. VALID     — green border, info bubble hidden, button enabled
// Clicking the button (or pressing Enter on a valid input) probes the
// IP and either pre-fills the add form (success) or shows an error
// state below the row (no reply).

// Validation is now CLICK-DRIVEN, not live. While the user types, the
// input stays neutral (no red border, no bubble) — feedback only fires
// when they hit Validate and the IP doesn't parse. Two responsibilities
// for the input handler:
//   1. Enable the Validate button as soon as there is ANY text (so the
//      user can click to receive validation feedback).
//   2. If a previous click left the input in an error state, clear
//      that state on the next keystroke so the user gets feedback
//      they're "fixing" the problem.
function snapAddIpUpdateState() {
  const inp = $("snapAddIpInput");
  const tip = $("snapAddIpTip");
  const btn = $("snapAddIpBtn");
  const status = $("snapAddIpStatus");
  if (!inp || !tip || !btn) return;
  const raw = (inp.value || "").trim();
  // Drop any sticky error UI as soon as the user resumes typing.
  if (inp.classList.contains("snap-add-ip-input--err")) {
    inp.classList.remove("snap-add-ip-input--err");
    tip.hidden = true;
  }
  // Button is enabled the moment the input is non-empty. We don't try
  // to validate live — the user clicks, THEN we validate.
  btn.disabled = raw.length === 0;
  // Clear any stale probe-status row when the user resumes typing.
  if (status && !status.hidden && !btn.classList.contains("loading")) {
    status.hidden = true;
    status.textContent = "";
    status.className = "snap-add-ip-status";
  }
}

// ── Choice modal (Scan vs Manual) ────────────────────────────────────────────

function openSnapAddChoice() {
  $("snapAddChoiceOverlay")?.classList.add("open");
}
function closeSnapAddChoice() {
  $("snapAddChoiceOverlay")?.classList.remove("open");
}

// ── Manual IP probe modal ─────────────────────────────────────────────────────

function openSnapmakerManual() {
  const overlay = $("snapManualOverlay");
  if (!overlay) return;
  const ip      = $("snapManualIp");
  const status  = $("snapManualStatus");
  const probe   = $("snapManualProbe");
  if (ip)     ip.value = "";
  if (status) { status.hidden = true; status.textContent = ""; status.className = "snap-manual-status"; }
  if (probe)  probe.classList.remove("loading");
  overlay.classList.add("open");
  setTimeout(() => ip?.focus(), 50);
}
function closeSnapmakerManual() {
  try { _snapManualAbort?.abort(); } catch {}
  _snapManualAbort = null;
  $("snapManualOverlay")?.classList.remove("open");
}

// ── DOM creation ─────────────────────────────────────────────────────────────

function _ensureDOM() {
  if (document.getElementById("snapAddChoiceOverlay")) return; // already created
  const wrap = document.createElement("div");
  wrap.innerHTML = `
<!-- Add printer — step 1b: Scan vs Manual choice.
     Shown after the user picks a brand that supports both discovery
     paths. Currently used for Snapmaker only; other brands jump
     straight to openPrinterAddForm. -->
<div class="modal-overlay" id="snapAddChoiceOverlay">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapAddChoiceTitle">Add Snapmaker printer</div>
        <div class="pba-sub" data-i18n="snapAddChoiceSub">How do you want to find your printer?</div>
      </div>
      <button class="modal-close" id="snapAddChoiceClose">✕</button>
    </div>
    <div class="pba-brands">
      <button type="button" class="pba-brand" id="snapAddChoiceScanBtn">
        <span class="icon icon-wifi icon-16" style="background:var(--primary);flex-shrink:0;"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceScan">Scan network</span>
          <span class="pba-brand-conn" data-i18n="snapAddChoiceScanHint">Auto-discover printers on your LAN</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
      <button type="button" class="pba-brand" id="snapAddChoiceManualBtn">
        <span class="icon icon-edit icon-16" style="background:var(--muted);flex-shrink:0;"></span>
        <span class="pba-brand-text">
          <span class="pba-brand-label" data-i18n="snapAddChoiceManual">Enter IP address</span>
          <span class="pba-brand-conn" data-i18n="snapAddChoiceManualHint">Manually enter the printer's local IP</span>
        </span>
        <span class="icon icon-chevron-r icon-13 pba-brand-chev"></span>
      </button>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="snapAddChoiceBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
    </div>
  </div>
</div>

<!-- Snapmaker LAN scanner — slide-in side panel (right). Probes
     /printer/info on every reachable host in the local /24 subnets,
     lists candidates as they're found, lets the user pick one to
     pre-fill the standard add form. Side-panel layout (instead of a
     centred modal) gives a lot more vertical room for the long scan
     log + multiple candidate cards without scrolling. -->
<div class="panel-overlay" id="snapScanOverlay"></div>
<div class="detail-panel snap-scan-panel" id="snapScanPanel">
  <div class="panel-header">
    <div class="snap-scan-panel-titles">
      <span class="panel-title" data-i18n="snapScanTitle">Scanning network…</span>
      <span class="snap-scan-panel-sub" id="snapScanSub"></span>
    </div>
    <!-- Close button removed: panel closes on backdrop click + Escape key. -->
  </div>
    <div class="snap-scan-body">
      <div class="snap-scan-progress">
        <div class="snap-scan-bar"><span id="snapScanBar"></span></div>
        <div class="snap-scan-stats" id="snapScanStats">0 / 0</div>
      </div>
      <!-- Add by IP — collapsible direct-probe path. Default state is
           a single trigger button; clicking it expands the IP input
           with live IPv4 validation, and a "Validate" button below
           that probes the printer to pull its data.                    -->
      <details class="snap-add-ip" id="snapAddIpDetails">
        <summary class="snap-add-ip-summary">
          <span class="snap-add-ip-summary-icon icon icon-plus icon-13"></span>
          <span class="snap-add-ip-summary-label" data-i18n="snapAddByIpButton">Add by IP</span>
          <span class="snap-add-ip-chev icon icon-chevron-r icon-13"></span>
        </summary>
        <div class="snap-add-ip-body">
          <label class="snap-add-ip-label" data-i18n="snapAddByIpLabel">IP address</label>
          <span class="snap-add-ip-input-wrap">
            <input type="text" inputmode="decimal" class="snap-add-ip-input" id="snapAddIpInput"
                   placeholder="192.168.1.42" autocomplete="off" autocapitalize="off" spellcheck="false"
                   maxlength="15" />
            <span class="snap-add-ip-tip" id="snapAddIpTip" hidden role="alert">
              <span class="icon icon-info icon-13"></span>
              <span data-i18n="snapAddByIpInvalid">Invalid IP address format</span>
            </span>
          </span>
          <button type="button" class="adf-btn adf-btn--primary snap-add-ip-btn" id="snapAddIpBtn" disabled>
            <span class="icon icon-check icon-13"></span>
            <span class="label" data-i18n="snapAddByIpValidate">Validate</span>
            <span class="spinner"></span>
          </button>
          <div class="snap-add-ip-status" id="snapAddIpStatus" hidden></div>
        </div>
      </details>
      <!-- Custom subnets — for users on multi-VLAN home networks who can
           reach the printer subnet via inter-VLAN routing but whose Mac
           isn't directly on it. Persisted in localStorage. -->
      <details class="snap-extra-subnets">
        <summary class="snap-extra-subnets-summary">
          <span class="snap-extra-subnets-icon icon icon-cloud icon-14"></span>
          <span class="snap-extra-subnets-label" data-i18n="snapScanExtraSubnetsLabel">Extra subnets to scan</span>
          <span class="snap-extra-subnets-chev icon icon-chevron-r icon-13"></span>
        </summary>
        <div class="snap-extra-subnets-body">
          <div class="snap-extra-subnets-hint" data-i18n="snapScanExtraSubnetsHint">
            Add subnets your Mac can reach via routing but isn't directly on (e.g. another VLAN like 192.168.40).
          </div>
          <div class="snap-extra-subnets-row">
            <input type="text" class="snap-extra-subnets-input" id="snapExtraSubnetsInput"
                   placeholder="192.168.40" autocomplete="off" autocapitalize="off" spellcheck="false"/>
            <button type="button" class="snap-extra-subnets-add" id="snapExtraSubnetsAdd" data-i18n="snapScanExtraSubnetsAdd">Add</button>
          </div>
          <div class="snap-extra-subnets-err" id="snapExtraSubnetsErr" hidden></div>
          <div class="snap-extra-subnets-chips" id="snapExtraSubnetsChips"></div>
        </div>
      </details>
      <div class="snap-scan-results" id="snapScanResults"></div>
      <div class="snap-scan-empty" id="snapScanEmpty" hidden data-i18n="snapScanEmpty">
        No Snapmaker found yet — make sure the printer is on the same Wi-Fi network.
      </div>
      <!-- Debug-only scan journal — what subnets we walk, which IPs answer,
           the raw /printer/info + /server/info JSON for every hit. Hidden
           outside debug mode. Click a line to copy its raw JSON. -->
      <section class="snap-scan-log" id="snapScanLog" hidden>
        <header class="snap-scan-log-head">
          <button type="button" class="snap-scan-log-toggle" id="snapScanLogToggle"
                  aria-expanded="false" aria-label="Scan log" data-i18n-title="snapScanLogTitle"
                  title="Scan log">
            <span class="icon icon-chevron-r icon-13 snap-scan-log-chev"></span>
            <span class="icon icon-list icon-13 snap-scan-log-title-icon"></span>
            <span class="snap-scan-log-count" id="snapScanLogCount">0</span>
          </button>
          <span class="snap-scan-log-actions">
            <!-- Icon-only buttons. Title attribute carries the label for
                 a hover tooltip + screen readers. We localize via the
                 same data-i18n-title attribute used elsewhere in the app
                 so the tooltip follows the user's language. -->
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--primary snap-scan-log-btn--icon"
                    id="snapScanLogExport" data-i18n-title="snapScanLogExport"
                    aria-label="Export" title="Export">
              <span class="icon icon-copy icon-13"></span>
            </button>
            <button type="button" class="snap-scan-log-btn snap-scan-log-btn--icon"
                    id="snapScanLogClear" data-i18n-title="snapScanLogClear"
                    aria-label="Clear" title="Clear">
              <span class="icon icon-trash icon-13"></span>
            </button>
          </span>
        </header>
        <div class="snap-scan-log-body" id="snapScanLogBody" hidden></div>
      </section>
    </div>
    <div class="snap-scan-panel-footer">
      <button class="adf-btn adf-btn--secondary" id="snapScanBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--secondary" id="snapScanRestart">
        <span class="icon icon-refresh icon-13"></span>
        <span data-i18n="snapScanRestart">Restart scan</span>
      </button>
    </div>
</div>

<!-- Snapmaker manual IP entry — types an IP, hits /printer/info to pull
     the machine model + hostname + firmware version, then opens the
     standard add form pre-filled with whatever could be probed. -->
<div class="modal-overlay" id="snapManualOverlay">
  <div class="modal-card pba-card">
    <div class="pba-header">
      <div class="pba-header-text">
        <div class="pba-title" data-i18n="snapManualTitle">Manual add</div>
        <div class="pba-sub" data-i18n="snapManualSub">Type the printer's local IP — we'll probe it to pre-fill the rest.</div>
      </div>
      <button class="modal-close" id="snapManualClose">✕</button>
    </div>
    <div class="pba-body">
      <label class="pba-field">
        <span class="pba-field-label" data-i18n="printerLblIP">IP address <span class="pba-field-req">*</span></span>
        <input type="text" class="pba-input pba-input--mono" id="snapManualIp"
               placeholder="192.168.1.42" autocomplete="off" autocapitalize="off" spellcheck="false"/>
      </label>
      <div class="snap-manual-status" id="snapManualStatus" hidden></div>
    </div>
    <div class="pba-footer">
      <button class="adf-btn adf-btn--secondary" id="snapManualBack">
        <span class="icon icon-chevron-l icon-13"></span>
        <span data-i18n="printerAddBack">Back</span>
      </button>
      <button class="adf-btn adf-btn--primary" id="snapManualProbe">
        <span class="icon icon-search icon-13"></span>
        <span class="label" data-i18n="snapManualProbe">Probe + continue</span>
        <span class="spinner"></span>
      </button>
    </div>
  </div>
</div>
`;
  while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  _wireDOM();
  // Apply translations to the newly-created data-i18n elements.
  // applyTranslations() in inventory.js already ran at startup (before this
  // DOM existed), so we must re-run it now that the elements are in the tree.
  ctx.applyTranslations();
}

function _wireDOM() {
  // ── Choice modal ──────────────────────────────────────────────────────────
  $("snapAddChoiceClose")?.addEventListener("click", closeSnapAddChoice);
  $("snapAddChoiceOverlay")?.addEventListener("click", e => {
    if (e.target.id === "snapAddChoiceOverlay") closeSnapAddChoice();
  });
  $("snapAddChoiceBack")?.addEventListener("click", () => {
    closeSnapAddChoice();
    ctx.openBrandPicker();
  });
  $("snapAddChoiceScanBtn")?.addEventListener("click", () => {
    closeSnapAddChoice();
    openSnapmakerScan();
  });
  $("snapAddChoiceManualBtn")?.addEventListener("click", () => {
    closeSnapAddChoice();
    openSnapmakerManual();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && $("snapAddChoiceOverlay")?.classList.contains("open")) {
      closeSnapAddChoice();
    }
  });

  // ── Scan panel ────────────────────────────────────────────────────────────
  $("snapScanClose")?.addEventListener("click", closeSnapmakerScan);
  // Backdrop click closes the panel (same UX as scales / printer detail).
  $("snapScanOverlay")?.addEventListener("click", closeSnapmakerScan);
  // Escape key — replaces the visible ✕ button (now removed).
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && $("snapScanPanel")?.classList.contains("open")) {
      closeSnapmakerScan();
    }
  });
  // Back navigates to the Scan/Manual choice modal.
  $("snapScanBack")?.addEventListener("click", () => {
    closeSnapmakerScan();
    openSnapAddChoice();
  });
  $("snapScanRestart")?.addEventListener("click", () => {
    // Re-run the scan in-place (don't close + reopen — preserves overlay focus).
    openSnapmakerScan();
  });
  // Debug log: collapsible header (chevron flips), Clear button wipes
  // the in-memory buffer + DOM. Both are no-ops when ctx.isDebugEnabled()
  // is false because the panel is hidden in that case.
  $("snapScanLogToggle")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const body = $("snapScanLogBody");
    const btn  = $("snapScanLogToggle");
    if (!body || !btn) return;
    const open = body.hidden;
    body.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.classList.toggle("snap-scan-log-toggle--open", open);
    if (open) snapScanLogRender(); // flush queued lines on first open
  });
  $("snapScanLogClear")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    snapScanLogClear();
  });
  $("snapScanLogExport")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    snapScanLogExport();
  });
  // Extra-subnets widget: Add button + Enter key submits; the input
  // clears + chip appears immediately. The list is read fresh from
  // localStorage at every snapScanLan() call, so changes take effect
  // on the very next scan with no extra plumbing.
  $("snapExtraSubnetsAdd")?.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    snapAddExtraSubnetFromInput();
  });
  $("snapExtraSubnetsInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      snapAddExtraSubnetFromInput();
    }
  });

  // ── Inline Add by IP ──────────────────────────────────────────────────────
  // Keystroke filter — only digits + dots. Block everything else
  // (letters, spaces, etc.) at input time so the field is always parseable.
  // Toggle reactions on the <details> wrapper:
  //   - on EXPAND: focus the input so the user can type immediately
  //     (saves a click compared to "click trigger → click input").
  //   - on COLLAPSE: clear the input + any stale validation/error UI
  //     so reopening starts fresh.
  $("snapAddIpDetails")?.addEventListener("toggle", () => {
    const details = $("snapAddIpDetails");
    const inp     = $("snapAddIpInput");
    const tip     = $("snapAddIpTip");
    const btn     = $("snapAddIpBtn");
    const status  = $("snapAddIpStatus");
    if (!details) return;
    if (details.open) {
      // Defer focus until after the browser has painted the expanded
      // body — calling focus() before that on Safari/Webkit can race
      // with the open transition and silently no-op.
      setTimeout(() => inp?.focus(), 30);
    } else {
      try { _snapAddIpAbort?.abort(); } catch {}
      _snapAddIpAbort = null;
      if (inp)    { inp.value = ""; inp.classList.remove("snap-add-ip-input--err", "snap-add-ip-input--ok"); }
      if (tip)    tip.hidden = true;
      if (btn)    { btn.disabled = true; btn.classList.remove("loading"); }
      if (status) { status.hidden = true; status.textContent = ""; status.className = "snap-add-ip-status"; }
    }
  });
  $("snapAddIpInput")?.addEventListener("beforeinput", e => {
    if (e.inputType && e.inputType.startsWith("delete")) return; // allow deletions
    const data = e.data;
    if (data == null) return;
    if (!/^[\d.]+$/.test(data)) e.preventDefault();
  });
  $("snapAddIpInput")?.addEventListener("input", snapAddIpUpdateState);
  $("snapAddIpInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      const btn = $("snapAddIpBtn");
      if (btn && !btn.disabled) btn.click();
    }
  });
  $("snapAddIpBtn")?.addEventListener("click", async () => {
    const inp = $("snapAddIpInput");
    const btn = $("snapAddIpBtn");
    const status = $("snapAddIpStatus");
    if (!inp || !btn) return;
    const ip = snapValidateIp(inp.value);
    if (!ip) {
      // Defensive — UI keeps the button disabled when the IP is invalid,
      // but in case some path bypasses the disabled state we still
      // refuse to probe.
      snapAddIpUpdateState();
      return;
    }
    btn.classList.add("loading");
    btn.disabled = true;
    if (status) {
      status.hidden = false;
      status.className = "snap-add-ip-status snap-add-ip-status--info";
      status.textContent = ctx.t("snapManualProbing", { ip }) || `Reaching ${ip}…`;
    }
    try { _snapAddIpAbort?.abort(); } catch {}
    const ctl = new AbortController();
    _snapAddIpAbort = ctl;
    const c = await snapProbeIp(ip, ctl.signal, { logPush: snapScanLogPush });
    btn.classList.remove("loading");
    btn.disabled = false;
    if (!c) {
      // No reply — keep the user on the scan modal so they can fix the
      // IP or try anyway. Reuses the same "Continue anyway" button as
      // the legacy manual modal.
      if (status) {
        status.className = "snap-add-ip-status snap-add-ip-status--err";
        status.innerHTML = `
          <span>${ctx.esc(ctx.t("snapManualNoReply", { ip }) || `No reply from ${ip}.`)}</span>
          <button type="button" class="snap-add-ip-anyway" id="snapAddIpAnyway">${ctx.esc(ctx.t("snapManualContinueAnyway") || "Continue anyway")}</button>
        `;
        $("snapAddIpAnyway")?.addEventListener("click", () => {
          // Close the scan modal first so the add form is on top.
          closeSnapmakerScan();
          ctx.openPrinterSettings("snapmaker", null, {
            ip,
            printerName: `Snapmaker ${ip}`,
            modelId: "0",
          });
        });
      }
      return;
    }
    // Success — open the add form pre-filled, identical priorities to
    // the scan-card click + legacy manual probe path.
    closeSnapmakerScan();
    ctx.openPrinterSettings("snapmaker", null, {
      ip:          c.ip,
      printerName: c.deviceName || c.machineModel || c.hostName || `Snapmaker ${c.ip}`,
      modelId:     snapModelIdFromMachineModel(c.machineModel || c.hostName),
      discovery:   snapBuildDiscoveryRecord(c),
    });
  });

  // ── Manual IP probe modal ─────────────────────────────────────────────────
  $("snapManualClose")?.addEventListener("click", closeSnapmakerManual);
  $("snapManualOverlay")?.addEventListener("click", e => {
    if (e.target.id === "snapManualOverlay") closeSnapmakerManual();
  });
  // Back navigates to the Scan/Manual choice modal.
  $("snapManualBack")?.addEventListener("click", () => {
    closeSnapmakerManual();
    openSnapAddChoice();
  });
  $("snapManualIp")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("snapManualProbe")?.click();
    }
  });
  $("snapManualProbe")?.addEventListener("click", async () => {
    const ipEl    = $("snapManualIp");
    const status  = $("snapManualStatus");
    const probeBt = $("snapManualProbe");
    const ip      = (ipEl?.value || "").trim();
    // Loose IPv4 validation. Snapmaker sits on private LAN so we don't try
    // to be cleverer than .x.x.x.x — we just want to catch typos.
    if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip)) {
      if (status) {
        status.hidden = false;
        status.className = "snap-manual-status snap-manual-status--err";
        status.textContent = ctx.t("snapManualBadIp") || "Please enter a valid IPv4 address.";
      }
      ipEl?.focus();
      return;
    }
    // Live status while we probe so the user knows we didn't freeze.
    if (status) {
      status.hidden = false;
      status.className = "snap-manual-status snap-manual-status--info";
      status.textContent = ctx.t("snapManualProbing", { ip }) || `Reaching ${ip}…`;
    }
    probeBt?.classList.add("loading");

    try { _snapManualAbort?.abort(); } catch {}
    const ctl = new AbortController();
    _snapManualAbort = ctl;
    const c = await snapProbeIp(ip, ctl.signal, { logPush: snapScanLogPush });
    probeBt?.classList.remove("loading");
    if (!c) {
      // Failed probe — keep the user on this modal so they can fix the IP
      // or try anyway (we still let them continue to the empty form).
      if (status) {
        status.className = "snap-manual-status snap-manual-status--err";
        status.innerHTML = `
          <span>${ctx.esc(ctx.t("snapManualNoReply", { ip }) || `No reply from ${ip}.`)}</span>
          <button type="button" class="snap-manual-anyway" id="snapManualAnyway">${ctx.esc(ctx.t("snapManualContinueAnyway") || "Continue anyway")}</button>
        `;
        $("snapManualAnyway")?.addEventListener("click", () => {
          closeSnapmakerManual();
          ctx.openPrinterSettings("snapmaker", null, {
            ip,
            printerName: `Snapmaker ${ip}`,
            modelId: "0",
          });
        });
      }
      return;
    }
    closeSnapmakerManual();
    // Same prefill priority as the scan path: prefer the user nickname
    // (device_name from /machine/system_info) over the model name over
    // the firmware codename hostname.
    ctx.openPrinterSettings("snapmaker", null, {
      ip:          c.ip,
      printerName: c.deviceName || c.machineModel || c.hostName || `Snapmaker ${c.ip}`,
      modelId:     snapModelIdFromMachineModel(c.machineModel || c.hostName),
      discovery:   snapBuildDiscoveryRecord(c),
    });
  });
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Open the Snapmaker add flow.
 * Called from the brand picker in inventory.js when the user picks Snapmaker.
 * Creates DOM lazily on first call, then opens the choice modal.
 */
export function openSnapAddFlow() {
  _ensureDOM();
  openSnapAddChoice();
}
