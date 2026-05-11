/**
 * renderer/IoT/tigerscale/index.js — TigerScale integration module.
 *
 * Manages the full lifecycle of TigerScale devices in the Studio Manager:
 *   • Firestore real-time subscription (scales/{mac} heartbeats)
 *   • Slide-in sidecard: health icon, panel, scale cards, chips, spool block
 *   • Local WebSocket connection (ws://ip/ws at 10 Hz) with auto-reconnect
 *   • RTDB command bridge (refresh_heartbeat via PUT)
 *   • Tare button (POST /api/tare)
 *
 * All DOM IDs and CSS classes are defined in:
 *   renderer/IoT/tigerscale/tigerscale.css
 *   renderer/inventory.html  (static shell: #scalesPanel, #scalesOverlay, #scaleHealth)
 *
 * Usage — call once during app init after Firebase is ready:
 *   import { initTigerScale, subscribeScales, unsubscribeScales,
 *            renderScalesPanel, renderScaleHealth } from './IoT/tigerscale/index.js';
 *
 *   initTigerScale({
 *     state, t, esc, highlight, $, reportError,
 *     fbDb, firebase, setupHoldToConfirm, colorBg, slotFillInnerHTML, tsToMs,
 *   });
 *   // then: subscribeScales(uid) / unsubscribeScales() as auth state changes.
 */

// ── Module-level context (injected by initTigerScale) ─────────────────────
let _ctx = null;

/** Must be called once before any other export. */
export function initTigerScale(ctx) {
  _ctx = ctx;
  _wirePanelHandlers();
  _startHealthTick();
}

// ── Constants ─────────────────────────────────────────────────────────────
const SCALE_ONLINE_THRESHOLD_MS = 90 * 1000;   // 90 s without heartbeat → offline

// ── Module-level state ────────────────────────────────────────────────────

// Signature of the last-rendered scale set (MAC IDs joined). Used to
// distinguish a full rebuild (MAC set changed) from an in-place patch
// (data-only heartbeat — the common case). In-place patching keeps
// <details> element instances alive so any open "Raw JSON" section
// survives heartbeats natively.
let _lastRenderedScalesSig = null;

// Tracks which scale-debug <details> are open. Only used on the rare
// full-rebuild path to restore open state after cards are torn down.
const _scalesDebugOpen = new Set();

// Per-scale local WebSocket state. key = mac string.
// Each entry: { ws, connected, weight, netWeight, scaleStatus, retryTimer, ip }
const _scaleLocalState = new Map();

// AbortController for the delegated tare listener on the panel body.
// Replaced on every full rebuild so we never accumulate duplicate listeners.
let _scaleTareAbortCtrl = null;

// ── Firestore subscription ─────────────────────────────────────────────────

/**
 * Subscribe to real-time Firestore updates for all scales belonging to uid.
 * Renders the panel and health icon on every snapshot.
 */
export function subscribeScales(uid) {
  unsubscribeScales();
  const { state, fbDb } = _ctx;
  state.unsubScales = fbDb(uid)
    .collection("users").doc(uid).collection("scales")
    .onSnapshot(snap => {
      if (uid !== state.activeAccountId) return;
      state.scales = snap.docs.map(d => ({ mac: d.id, ...d.data() }));
      renderScaleHealth();
      renderScalesPanel();
    }, err => console.warn("[tigerscale]", err.code, err.message));
}

/**
 * Unsubscribe from Firestore and close all local WebSocket connections.
 */
export function unsubscribeScales() {
  const { state } = _ctx;
  if (state.unsubScales) { state.unsubScales(); state.unsubScales = null; }
  _scaleLocalState.forEach((_, mac) => disconnectScaleWs(mac));
  _scaleLocalState.clear();
}

// ── Panel open / close ─────────────────────────────────────────────────────

function _wirePanelHandlers() {
  const { $ } = _ctx;
  $("scaleHealth")?.addEventListener("click", openScalesPanel);
  $("scalesPanelClose")?.addEventListener("click", closeScalesPanel);
  $("scalesOverlay")?.addEventListener("click", closeScalesPanel);
}

function openScalesPanel() {
  renderScalesPanel();
  _ctx.$("scalesPanel").classList.add("open");
  _ctx.$("scalesOverlay").classList.add("open");
}

function closeScalesPanel() {
  _ctx.$("scalesPanel").classList.remove("open");
  _ctx.$("scalesOverlay").classList.remove("open");
}

// ── Health icon ────────────────────────────────────────────────────────────

/**
 * Update the header status icon — three visual tiers:
 *   • scale-none      → no scale paired at all      (red, pulsing)
 *   • scale-connected → ≥1 paired AND online         (green, glow)
 *   • (default)       → paired but all offline       (muted grey)
 */
export function renderScaleHealth() {
  const { $, state, t } = _ctx;
  const el = $("scaleHealth");
  if (!el) return;
  const total  = state.scales.length;
  const online = state.scales.filter(isScaleOnline).length;
  el.classList.toggle("scale-none",      total === 0);
  el.classList.toggle("scale-connected", online > 0);
  if (total === 0)       el.dataset.tooltip = t("scaleHealthNone")    || "No scale connected";
  else if (online === 0) el.dataset.tooltip = t("scaleHealthOffline", { n: total }) || `${total} scale(s) — all offline`;
  else                   el.dataset.tooltip = t("scaleHealthOnline",  { n: online, total }) || `${online}/${total} scale(s) online`;
}

// ── Panel render ───────────────────────────────────────────────────────────

/**
 * Render (or refresh) the scales slide-in panel.
 *
 * Two-path strategy:
 *   MAC set changed  → full innerHTML rebuild + re-wire events.
 *   Same MAC set     → in-place patch of each existing card (heartbeat path).
 *
 * In-place patching preserves the <details> element instances so any
 * user-expanded "Raw JSON" section stays open across heartbeats.
 */
export function renderScalesPanel() {
  const { $, state, t, esc } = _ctx;
  const body = $("scalesPanelBody");
  if (!body) return;

  if (!state.scales.length) {
    body.innerHTML = `
      <div class="scales-empty-card">
        <img class="scales-empty-img" src="../assets/img/TigerScale_Photo.png" alt="TigerScale" />
        <div class="scales-empty-title" data-i18n="scaleEmptyTitle">${esc(t("scaleEmptyTitle"))}</div>
        <div class="scales-empty-sub" data-i18n="scaleEmptySub">${esc(t("scaleEmptySub"))}</div>
        <ul class="scales-empty-bullets">
          <li data-i18n="scaleEmptyBullet1">${esc(t("scaleEmptyBullet1"))}</li>
          <li data-i18n="scaleEmptyBullet2">${esc(t("scaleEmptyBullet2"))}</li>
          <li data-i18n="scaleEmptyBullet3">${esc(t("scaleEmptyBullet3"))}</li>
        </ul>
        <a class="scales-empty-cta" id="scaleGithubLink" href="#">
          <span class="icon icon-github icon-14"></span>
          <span data-i18n="scaleEmptyCta">View on GitHub</span>
        </a>
        <div class="scales-empty-license" data-i18n="scaleEmptyLicense">${esc(t("scaleEmptyLicense"))}</div>
      </div>`;
    $("scaleGithubLink")?.addEventListener("click", e => {
      e.preventDefault();
      window.open("https://github.com/TigerTag-Project/TigerTag-Scale");
    });
    return;
  }

  const sig          = state.scales.map(s => s.mac).sort().join("|");
  const macSetChanged = sig !== _lastRenderedScalesSig;

  if (macSetChanged) {
    body.innerHTML = state.scales.map(_buildScaleCardHtml).join("");
    _wireScaleCardEvents(body);
  } else {
    state.scales.forEach(s => {
      const card = body.querySelector(
        `.scale-entry[data-scale-mac="${_cssEscape(s.mac)}"]`
      );
      if (card) _patchScaleCardInPlace(card, s);
    });
  }
  _lastRenderedScalesSig = sig;
}

// ── Scale card HTML builders ───────────────────────────────────────────────

function _buildScaleCardHtml(s) {
  const { esc, state, t } = _ctx;
  const online    = isScaleOnline(s);
  const dispName  = scaleDisplayName(s) || "TigerScale";
  const macFmt    = formatMacAddress(s.mac);
  const localSt   = _scaleLocalState.get(s.mac);
  const wsOn      = !!localSt?.connected;
  const wsBtnTitle = wsOn ? (t("scaleWsDisconnect") || "Disconnect") : (t("scaleWsConnect") || "Connect");
  const debugOpen = _scalesDebugOpen.has(s.mac) ? " open" : "";
  const debugJson = state.debugEnabled
    ? `<details class="scale-debug" data-debug-mac="${esc(s.mac)}"${debugOpen}>
         <summary class="scale-debug-summary">Raw JSON (debug)</summary>
         <pre class="json scale-debug-pre">${_ctx.highlight(JSON.stringify(s, null, 2))}</pre>
       </details>`
    : "";

  return `<div class="scale-entry" data-scale-mac="${esc(s.mac)}">
    <div class="scale-card${online ? " is-online" : ""}">
      <div class="scale-card-head">
        <img class="scale-card-photo" src="../assets/img/TigerScale_Photo.png" alt="" draggable="false" />
        <div class="scale-card-id">
          <div class="scale-card-name-row">
            <span class="scale-card-name">${esc(dispName)}</span>
            <span class="scale-card-status-pill ${online ? "is-online" : "is-offline"}">
              <span class="scale-card-status-dot"></span>
              <span class="scale-card-status-pill-text">${online ? t("scaleStatusOnline") : t("scaleStatusOffline")}</span>
            </span>
          </div>
          <div class="scale-card-mac">${esc(macFmt)}</div>
        </div>
        <div class="scale-card-actions">
          ${s.ip_address ? `<button class="scale-card-btn scale-card-btn--ws${wsOn ? ' is-ws-on' : ''}" data-action="ws-toggle" title="${esc(wsBtnTitle)}">
            <span class="icon icon-plug icon-13"></span>
          </button>` : ""}
          <button class="scale-card-btn" data-action="refresh" title="${t("scaleRefresh")}">
            <span class="icon icon-refresh icon-13"></span>
          </button>
          <button class="scale-card-btn" data-action="delete" title="${t("scaleRemove")}">
            <span class="hold-progress"></span>
            <span class="icon icon-trash icon-13"></span>
          </button>
        </div>
      </div>
      <div class="scale-card-chips">${_buildScaleChipsHtml(s)}</div>
      <div class="scale-card-spool-host">${_buildScaleSpoolBlockHtml(s)}</div>
    </div>
    <div class="scale-card-local" data-local-mac="${esc(s.mac)}">${_buildScaleLocalBlockHtml(s.mac)}</div>
    <button class="tare-hold-btn" data-tare-mac="${esc(s.mac)}"${wsOn ? "" : " disabled"}>
      <span class="tare-text">${t("scaleTareBtn") || "TARE"}</span>
      <span class="tare-progress"></span>
    </button>
    <div class="scale-card-log" data-log-mac="${esc(s.mac)}">${_buildScaleLogHtml(s.mac)}</div>
    ${debugJson}
  </div>`;
}

// Build the chips strip inner HTML (without the wrapper div).
function _buildScaleChipsHtml(s) {
  const { esc, t } = _ctx;
  const online     = isScaleOnline(s);
  const lastSeenMs = scaleTsToMs(scaleHeartbeatAt(s));
  const lastSeenStr = lastSeenMs ? _agoString(lastSeenMs) : "—";
  const battery    = scaleBatteryPercent(s);
  const charging   = scaleIsCharging(s);
  const power      = scalePowerSource(s);
  const wifiDbm    = scaleWifiSignalDbm(s);
  const fw         = s.fw_version;

  const chips = [];

  if (typeof wifiDbm === "number" && isFinite(wifiDbm)) {
    const q = wifiQualityLevel(wifiDbm);
    chips.push(`<span class="scale-chip scale-chip--wifi scale-chip--wifi-${q.cls}" title="${esc(q.label)}">
      <span class="icon icon-wifi icon-12"></span>
      <span class="scale-chip-text">${esc(String(wifiDbm))} dBm</span>
    </span>`);
  }

  if (power) {
    const isUsb   = String(power).toLowerCase() === "usb";
    const lbl     = isUsb ? t("scaleChipPowerUsb") : t("scaleChipPowerBattery");
    const iconCls = isUsb ? "icon-plug" : "icon-battery";
    const boltHtml = (charging === true)
      ? `<span class="icon icon-bolt icon-10 scale-chip-bolt"></span>`
      : "";
    chips.push(`<span class="scale-chip scale-chip--power" title="${esc(t("scaleChipPower"))}">
      <span class="icon ${iconCls} icon-12"></span>
      <span class="scale-chip-text">${esc(lbl)}</span>
      ${boltHtml}
    </span>`);
  }

  if (typeof battery === "number" && isFinite(battery)) {
    const lvl = battery >= 60 ? "high" : battery >= 25 ? "mid" : "low";
    chips.push(`<span class="scale-chip scale-chip--battery scale-chip--bat-${lvl}" title="${esc(t("scaleChipPowerBattery"))}">
      <span class="icon icon-battery icon-12"></span>
      <span class="scale-chip-text">${esc(String(battery))}%</span>
    </span>`);
  }

  if (fw) {
    chips.push(`<span class="scale-chip scale-chip--fw" title="${esc(t("scaleChipFwTooltip"))}">
      <span class="icon icon-settings icon-12"></span>
      <span class="scale-chip-text">v${esc(String(fw))}</span>
    </span>`);
  }

  if (!online && lastSeenMs) {
    chips.push(`<span class="scale-chip scale-chip--seen" title="${esc(t("scaleChipLastSeen"))}">
      <span class="icon icon-clock icon-12"></span>
      <span class="scale-chip-text">${esc(lastSeenStr)}</span>
    </span>`);
  }

  return chips.join("");
}

// Build the current-spool block inner HTML.
// v2 schema: current_spool_uid_1 / _2 are plain UID strings cross-referenced
// against state.rows for the friendly label / colour / weight.
function _buildScaleSpoolBlockHtml(s) {
  const { esc, state } = _ctx;
  const uid1 = scaleCurrentSpoolUid1(s);
  const uid2 = scaleCurrentSpoolUid2(s);
  const findRowByUid = uid => state.rows.find(x =>
    String(x.uid) === String(uid) || String(x.spoolId) === String(uid));

  const renderSpool = (uid) => {
    if (!uid) return "";
    const r       = findRowByUid(uid);
    const fillBg  = r ? _ctx.colorBg(r) : "rgba(150,150,150,.2)";
    const fillHtml = r ? _ctx.slotFillInnerHTML(r) : "";
    const titleLn = r?.colorName && r.colorName !== "-" ? r.colorName : (r?.material || uid);
    const subLn   = r ? [r.brand, r.material].filter(Boolean).join(" · ") : `uid=${uid}`;
    const wAvail  = r?.weightAvailable ?? "—";
    return `
      <div class="scale-last-spool">
        <div class="scale-last-puck" style="background:${fillBg}">${fillHtml}</div>
        <div class="scale-last-meta">
          <div class="scale-last-name">${esc(String(titleLn))}</div>
          <div class="scale-last-sub">${esc(subLn)}</div>
        </div>
        <div class="scale-last-w">${esc(String(wAvail))}<span class="scale-last-w-unit">g</span></div>
      </div>`;
  };

  if (!uid1 && !uid2) {
    return `<div class="scale-last-empty">${esc(_ctx.t("scaleNoActivity"))}</div>`;
  }
  if (uid1 && uid2) {
    const r1 = findRowByUid(uid1);
    const r2 = findRowByUid(uid2);
    const isTwinPair = r1?.twinUid && (String(r1.twinUid) === String(uid2)) ||
                       r2?.twinUid && (String(r2.twinUid) === String(uid1));
    return isTwinPair ? renderSpool(uid1) : (renderSpool(uid1) + renderSpool(uid2));
  }
  return renderSpool(uid1 || uid2);
}

// ── WebSocket local live block ─────────────────────────────────────────────

/**
 * Translate a raw firmware status string to a localised label.
 *   ""/"ready"   → Ready
 *   "scanning:N" → Scanning Ns
 *   "stable:N"   → Stable Ns
 *   "send"       → Sending
 *   "success"    → Success
 */
function _scaleLocalStatusText(status) {
  const { t } = _ctx;
  if (!status || status === "ready") return t("scaleStatusReady");
  if (status.startsWith("scanning:")) {
    const n = status.split(":")[1] || "";
    return `${t("scaleStatusScanning")} ${n}s`;
  }
  if (status.startsWith("stable:")) {
    const n = status.split(":")[1] || "";
    return `${t("scaleStatusStable")} ${n}s`;
  }
  if (status === "send")    return t("scaleStatusSending");
  if (status === "success") return t("scaleStatusSuccess");
  return status || t("scaleStatusReady");
}

/**
 * Build the inner HTML of a scale's local WebSocket live block.
 * Returns "" when no IP is known yet (host div stays empty → hidden via CSS).
 */
/** Map scaleStatus firmware string → { text, bg } for the send-state badge. */
function _scaleStatusBadgeInfo(status) {
  if (!status) return null;
  if (status === "idle")    return { text: "🟢 Ready",               bg: "rgba(72,187,120,0.35)" };
  if (status === "ready")   return { text: "🟢 Ready for next spool",bg: "rgba(72,187,120,0.35)" };
  if (status.startsWith("scanning:")) return { text: "📡 Scanning RFID…",  bg: "rgba(100,160,255,0.30)" };
  if (status.startsWith("stable:"))   return { text: "⚖️ Stabilizing…",    bg: "rgba(255,200,80,0.30)"  };
  if (/^\d+$/.test(status)) return { text: `⏳ Send in ${status}s`,  bg: "rgba(255,255,255,0.22)" };
  if (status === "send")    return { text: "⏳ Sending…",             bg: "rgba(255,255,255,0.22)" };
  if (status === "success") return { text: "✅ Sent",                 bg: "rgba(72,187,120,0.40)"  };
  if (status === "error")   return { text: "❌ Error",                bg: "rgba(245,101,101,0.40)" };
  if (status === "done")    return { text: "🗑️ Remove spool",         bg: "rgba(255,160,50,0.35)"  };
  return { text: status, bg: "rgba(255,255,255,0.18)" };
}

function _buildScaleLocalBlockHtml(mac) {
  const { esc, t, state } = _ctx;
  const st = _scaleLocalState.get(mac);

  // Pas connecté → card vide → display:none via CSS (.scale-card-local:empty)
  if (!st?.connected) return "";

  const s  = state.scales.find(x => x.mac === mac);
  const name = scaleDisplayName(s) || "TigerScale";

  // ── Status badge (top-left overlay) ───────────────────────────────────────
  const badgeInfo = _scaleStatusBadgeInfo(st.scaleStatus);
  const badgeHtml = badgeInfo
    ? `<div class="send-status" style="background:${badgeInfo.bg}">${badgeInfo.text}</div>`
    : `<div class="send-status" style="display:none"></div>`;

  // ── Filament panel — données venant du WebSocket ──────────────────────────
  const uidLeft  = st?.uidLeft  ?? null;
  const uidRight = st?.uidRight ?? null;
  const uidTwin  = st?.uidTwin  ?? null;
  const brand    = st?.brand    || "";
  const material = st?.material || "";
  // Extraire #RRGGBB depuis "Red #FF0000" (format firmware) ou chaîne brute
  const hexMatch = (st?.color || "").match(/#([0-9A-Fa-f]{6})\b/);
  const dotColor = hexMatch ? `#${hexMatch[1]}` : "rgba(255,255,255,0.25)";
  const hasInfo  = brand.length > 0 || material.length > 0;
  const filamentPanelHtml = `<div class="filament-panel"${hasInfo ? "" : ' style="display:none"'}>
      <div class="filament-color-dot" style="background:${esc(dotColor)}"></div>
      <div class="filament-panel-row">
        <span class="filament-panel-label">BRAND</span>
        <span class="filament-panel-value">${esc(brand || "—")}</span>
      </div>
      <div class="filament-panel-row">
        <span class="filament-panel-label">MATERIAL</span>
        <span class="filament-panel-value">${esc(material || "—")}</span>
      </div>
    </div>`;

  // ── Weight values (toujours connecté ici grâce au early-return) ──────────
  const weightVal    = typeof st.weight === "number" ? Math.round(st.weight) : "—";
  const containerVal = (typeof st.containerWeight === "number" && st.containerWeight !== 0) ? Math.round(st.containerWeight) : "—";
  const filamentVal  = (typeof st.netWeight       === "number" && st.netWeight       !== 0) ? Math.round(st.netWeight)       : "—";

  // ── UIDs — resolve() décide quoi afficher dans chaque slot ──────────────
  const readerLbl = t("scaleReader") || "Reader";
  const resolve = (physical, otherPhysical) => {
    if (physical)                      return { text: physical, twin: false };
    if (otherPhysical && uidTwin)      return { text: uidTwin,  twin: true  };
    if (otherPhysical)                 return { text: '🔗 Twin', twin: true };
    return                                    { text: '—',       twin: false };
  };
  const L = resolve(uidLeft,  uidRight);
  const R = resolve(uidRight, uidLeft);

  return `<div class="sc2-live-card">
    ${badgeHtml}
    ${filamentPanelHtml}
    <div class="sc2-inner">
      <div class="user-name">${esc(name)}</div>
      <div class="weight-display">
        <span class="sc2-weight-num">${esc(String(weightVal))}</span><span class="weight-unit">g</span>
      </div>
      <div class="weight-meta-row">
        <div class="weight-meta-item">
          <span class="weight-meta-label">${esc(t("scaleContainerLabel") || "CONTAINER")}</span>
          <span class="weight-meta-value">${containerVal === "—" ? "—" : `${esc(String(containerVal))} g`}</span>
        </div>
        <div class="weight-meta-sep"></div>
        <div class="weight-meta-item">
          <span class="weight-meta-label">${esc(t("scaleFilamentLabel") || "FILAMENT")}</span>
          <span class="weight-meta-value">${filamentVal === "—" ? "—" : `${esc(String(filamentVal))} g`}</span>
        </div>
      </div>
      <div class="uid-rows">
        <div class="uid-row">
          <span class="uid-chip-label" data-tooltip="Left">◀ ${esc(readerLbl)}</span>
          <span class="uid-value${L.twin ? " uid-value--twin" : ""}">${esc(L.text)}</span>
        </div>
        <div class="uid-row">
          <span class="uid-chip-label" data-tooltip="Right">${esc(readerLbl)} ▶</span>
          <span class="uid-value${R.twin ? " uid-value--twin" : ""}">${esc(R.text)}</span>
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * Update the DOM for one scale's local block without touching the card shell.
 * Safe to call from WS message callbacks (main thread).
 */
function _refreshScaleLocalBlock(mac) {
  const host = document.querySelector(`.scale-card-local[data-local-mac="${_cssEscape(mac)}"]`);
  if (host) host.innerHTML = _buildScaleLocalBlockHtml(mac);
}

/**
 * Close an existing WS + cancel any pending retry timer for `mac`.
 * Does NOT delete the entry from _scaleLocalState.
 */
export function disconnectScaleWs(mac) {
  const st = _scaleLocalState.get(mac);
  if (!st) return;
  if (st.retryTimer) { clearTimeout(st.retryTimer); st.retryTimer = null; }
  if (st.ws) {
    st.ws.onopen = st.ws.onmessage = st.ws.onclose = st.ws.onerror = null;
    try { st.ws.close(); } catch { /* ignore */ }
    st.ws = null;
  }
  st.connected = false;
}

/**
 * Ping the scale at GET /api/ping, then open a WebSocket at ws://ip/ws.
 * Auto-reconnects on close (5 s). Falls back to 30 s retry when ping fails.
 * Detects superseded calls (IP changed concurrently) via Map entry checks.
 *
 * @param {string} mac  Raw MAC string (Firestore document ID).
 * @param {string} ip   IPv4 address from s.ip_address heartbeat field.
 */
// ── WS log helpers ────────────────────────────────────────────────────────

const SCALE_LOG_MAX = 80;

/**
 * Push one entry to st.log and refresh the log DOM for this mac.
 * dir: '←' received  '→' sent/connect  '·' status event
 */
function _scaleLogPush(st, mac, dir, text) {
  if (!st.log) st.log = [];
  st.log.push({ dir, text, ts: Date.now() });
  if (st.log.length > SCALE_LOG_MAX) st.log.splice(0, st.log.length - SCALE_LOG_MAX);
  _refreshScaleLog(mac);
}

/** Rebuild the log panel for one mac (called after every log push). */
function _refreshScaleLog(mac) {
  const host = document.querySelector(`.scale-card-log[data-log-mac="${_cssEscape(mac)}"]`);
  if (!host) return;
  host.innerHTML = _buildScaleLogHtml(mac);
}

function _buildScaleLogHtml(mac) {
  const st = _scaleLocalState.get(mac);
  if (!st?.log?.length) return "";
  const lines = st.log.slice(-40).map(e => {
    const t = new Date(e.ts);
    const hms = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`;
    const dirCls = e.dir === '←' ? 'rx' : e.dir === '→' ? 'tx' : 'ev';
    return `<span class="swl-line"><span class="swl-dir swl-dir--${dirCls}">${e.dir}</span><span class="swl-ts">${hms}</span> ${_ctx.esc(e.text)}</span>`;
  }).join('\n');
  return `<details class="scale-ws-log"${st.logOpen ? ' open' : ''}>
    <summary class="swl-summary">WS Log <span class="swl-count">${st.log.length}</span></summary>
    <pre class="swl-pre">${lines}</pre>
  </details>`;
}

export function connectScaleWs(mac, ip) {
  if (!mac || !ip) return;

  // Tear down any previous connection for this mac.
  disconnectScaleWs(mac);

  if (!_scaleLocalState.has(mac)) _scaleLocalState.set(mac, {});
  const st  = _scaleLocalState.get(mac);
  // Preserve log and logOpen across reconnects
  if (!st.log)     st.log     = [];
  if (st.logOpen === undefined) st.logOpen = false;
  st.ip                 = ip;
  st.connected          = false;
  st.ws                 = null;
  st.manuallyDisconnected = false; // connecting → clear manual-off flag

  _patchWsToggleBtn(mac);
  _scaleLogPush(st, mac, '→', `Connecting → ws://${ip}/ws`);

  // No pre-ping: fetch() is blocked by CORS in Electron's renderer (firmware
  // returns no Access-Control-Allow-Origin). WebSocket handshakes bypass CORS,
  // so we connect directly and let onclose handle retries.
  const ws = new WebSocket(`ws://${ip}/ws`);
  st.ws = ws;

  ws.onopen = () => {
    if (_scaleLocalState.get(mac)?.ws !== ws) { try { ws.close(); } catch {} return; }
    st.connected = true;
    _scaleLogPush(st, mac, '→', `WebSocket open`);
    _refreshScaleLocalBlock(mac);
    _patchWsToggleBtn(mac);
  };

  ws.onmessage = (e) => {
    if (_scaleLocalState.get(mac)?.ws !== ws) return;
    try {
      const data = JSON.parse(e.data);
      // Firmware uses camelCase (not snake_case)
      if (typeof data.weight          === "number") st.weight          = data.weight;
      if (typeof data.netWeight       === "number") st.netWeight       = data.netWeight;
      if (typeof data.containerWeight === "number") st.containerWeight = data.containerWeight;
      if (data.scaleStatus !== undefined)           st.scaleStatus     = data.scaleStatus;
      // Filament info (firmware envoie "--" quand vide)
      const _clean = v => (v === "--" || v === "-" ? "" : v);
      if (typeof data.brand    === "string") st.brand    = _clean(data.brand);
      if (typeof data.material === "string") st.material = _clean(data.material);
      if (typeof data.color    === "string") st.color    = data.color;
      // Spool retiré → effacer le panneau filament
      if (data.scaleStatus === "ready") { st.brand = ""; st.material = ""; st.color = ""; }
      // NFC reader UIDs (prefer _left/_right, fallback to uid/uid2)
      if ("uid_left"  in data) st.uidLeft  = data.uid_left  || null;
      if ("uid_right" in data) st.uidRight = data.uid_right || null;
      if ("uid"      in data && !("uid_left"  in data)) st.uidLeft  = data.uid      || null;
      if ("uid2"     in data && !("uid_right" in data)) st.uidRight = data.uid2     || null;
      if ("uid_twin" in data)                           st.uidTwin  = data.uid_twin || null;
      _scaleLogPush(st, mac, '←', e.data);
    } catch {
      _scaleLogPush(st, mac, '←', `[raw] ${e.data}`);
    }
    _refreshScaleLocalBlock(mac);
  };

  ws.onclose = (ev) => {
    if (_scaleLocalState.get(mac)?.ws !== ws) return;
    st.ws        = null;
    st.connected = false;
    _scaleLogPush(st, mac, '·', `WebSocket closed (code ${ev.code}${ev.reason ? ' ' + ev.reason : ''})`);
    _refreshScaleLocalBlock(mac);
    _patchWsToggleBtn(mac);
    if (!st.manuallyDisconnected) {
      _scaleLogPush(st, mac, '·', 'Retry in 5 s…');
      st.retryTimer = setTimeout(() => {
        if (_scaleLocalState.get(mac)?.ip === ip && !_scaleLocalState.get(mac)?.manuallyDisconnected)
          connectScaleWs(mac, ip);
      }, 5000);
    }
  };

  ws.onerror = (ev) => {
    _scaleLogPush(st, mac, '·', `WebSocket error`);
    /* onclose fires after onerror — reconnect handled there */
  };
}

/**
 * Manually disconnect a scale's WebSocket and suppress auto-reconnect.
 * The user clicked "Disconnect" — we won't retry until they click "Connect".
 */
function _manualDisconnectScaleWs(mac) {
  if (!_scaleLocalState.has(mac)) _scaleLocalState.set(mac, {});
  const st = _scaleLocalState.get(mac);
  st.manuallyDisconnected = true;
  _scaleLogPush(st, mac, '·', 'Disconnected by user');
  disconnectScaleWs(mac);
  _refreshScaleLocalBlock(mac);
  _patchWsToggleBtn(mac);
}

/**
 * Update only the WS toggle button in an existing card without re-rendering the card.
 * Called after any WS state change (connect, disconnect, open, close).
 */
function _patchWsToggleBtn(mac) {
  const { t } = _ctx;
  const card = document.querySelector(`.scale-entry[data-scale-mac="${_cssEscape(mac)}"]`);
  if (!card) return;
  const btn = card.querySelector("[data-action='ws-toggle']");
  if (!btn) return;
  const st = _scaleLocalState.get(mac);
  const connected = !!st?.connected;
  btn.classList.toggle("is-ws-on", connected);
  btn.title = connected ? (t("scaleWsDisconnect") || "Disconnect") : (t("scaleWsConnect") || "Connect");
  // Also update tare button disabled state
  const tareBtn = card.querySelector(".tare-hold-btn");
  if (tareBtn && !tareBtn.classList.contains("holding")) tareBtn.disabled = !connected;
}

// ── In-place patch ─────────────────────────────────────────────────────────

/**
 * Update a card's dynamic parts WITHOUT recreating its <details> element.
 * This is the path used at every Firestore heartbeat (most common).
 * Preserves the user's expanded Raw JSON section natively.
 */
function _patchScaleCardInPlace(card, s) {
  const { state, t } = _ctx;
  const online = isScaleOnline(s);
  card.querySelector(".scale-card")?.classList.toggle("is-online", online);

  // Status pill
  const pill = card.querySelector(".scale-card-status-pill");
  if (pill) {
    pill.classList.toggle("is-online",  online);
    pill.classList.toggle("is-offline", !online);
    const txt = pill.querySelector(".scale-card-status-pill-text");
    if (txt) txt.textContent = online ? t("scaleStatusOnline") : t("scaleStatusOffline");
  }

  // Display name (rarely changes)
  const nameEl = card.querySelector(".scale-card-name");
  if (nameEl) {
    const dispName = scaleDisplayName(s) || "TigerScale";
    if (nameEl.textContent !== dispName) nameEl.textContent = dispName;
  }

  // Chips strip
  const chipsHost = card.querySelector(".scale-card-chips");
  if (chipsHost) chipsHost.innerHTML = _buildScaleChipsHtml(s);

  // Spool block
  const spoolHost = card.querySelector(".scale-card-spool-host");
  if (spoolHost) spoolHost.innerHTML = _buildScaleSpoolBlockHtml(s);

  // Live gradient block — refresh on every heartbeat too
  _refreshScaleLocalBlock(s.mac);

  // Debug JSON — update only the <pre> so the <details> open state survives
  if (state.debugEnabled) {
    const debugPre = card.querySelector(".scale-debug-pre");
    if (debugPre) debugPre.innerHTML = _ctx.highlight(JSON.stringify(s, null, 2));
  }

  // Reconnect when ip_address changes (but not if user manually disconnected)
  if (s.ip_address) {
    const localSt = _scaleLocalState.get(s.mac);
    if (s.ip_address !== localSt?.ip && !localSt?.manuallyDisconnected)
      connectScaleWs(s.mac, s.ip_address);
  }
  _patchWsToggleBtn(s.mac);
}

// ── Event wiring ───────────────────────────────────────────────────────────

/**
 * Wire card-level event listeners after a full rebuild.
 * NOT called on in-place patch renders.
 */
function _wireScaleCardEvents(body) {
  const { state, fbDb, firebase, setupHoldToConfirm, reportError } = _ctx;

  // ── WS connect / disconnect toggle ──────────────────────────────────────
  body.querySelectorAll(".scale-card-btn[data-action='ws-toggle']").forEach(btn => {
    btn.addEventListener("click", () => {
      const mac   = btn.closest("[data-scale-mac]")?.dataset.scaleMac;
      if (!mac) return;
      const st    = _scaleLocalState.get(mac);
      const scale = state.scales.find(s => s.mac === mac);
      if (st?.connected) {
        _manualDisconnectScaleWs(mac);
      } else {
        const ip = scale?.ip_address;
        if (!ip) return;
        connectScaleWs(mac, ip);
      }
    });
  });

  // ── Refresh heartbeat ────────────────────────────────────────────────────
  body.querySelectorAll(".scale-card-btn[data-action='refresh']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const mac = btn.closest("[data-scale-mac]")?.dataset.scaleMac;
      if (!mac) return;
      btn.disabled = true;
      btn.style.opacity = "0.4";
      try {
        const token = await firebase.app(state.activeAccountId).auth().currentUser?.getIdToken();
        const url   = `https://tigertag-connect-default-rtdb.firebaseio.com/scales/${mac}/cmd.json?auth=${token}`;
        await fetch(url, { method: "PUT", body: JSON.stringify("refresh_heartbeat") });
        console.log(`[tigerscale] refresh_heartbeat → ${mac}`);
      } catch (e) {
        reportError("scale.refresh", e);
      } finally {
        setTimeout(() => { btn.disabled = false; btn.style.opacity = ""; }, 2000);
      }
    });
  });

  // ── Delete (hold-to-confirm) ─────────────────────────────────────────────
  body.querySelectorAll(".scale-card-btn[data-action='delete']").forEach(btn => {
    setupHoldToConfirm(btn, 1500, async () => {
      const card = btn.closest("[data-scale-mac]");
      const mac  = card?.dataset.scaleMac;
      if (!mac) return;
      try {
        // Clean up WS before Firestore delete so reconnect logic doesn't fire.
        disconnectScaleWs(mac);
        _scaleLocalState.delete(mac);
        const uid = state.activeAccountId;
        await fbDb(uid).collection("users").doc(uid).collection("scales").doc(mac).delete();
        _scalesDebugOpen.delete(mac);
      } catch (e) { reportError("scale.delete", e); }
    });
  });

  // ── Debug JSON toggle ────────────────────────────────────────────────────
  body.querySelectorAll("details.scale-debug[data-debug-mac]").forEach(det => {
    det.addEventListener("toggle", () => {
      const mac = det.getAttribute("data-debug-mac");
      if (!mac) return;
      if (det.open) _scalesDebugOpen.add(mac);
      else          _scalesDebugOpen.delete(mac);
    });
  });

  // AbortController prevents duplicate listeners on subsequent full rebuilds.
  if (_scaleTareAbortCtrl) _scaleTareAbortCtrl.abort();
  _scaleTareAbortCtrl = new AbortController();

  // ── Log <details> open-state persistence ─────────────────────────────────
  body.addEventListener("toggle", (e) => {
    if (!e.target.classList.contains("scale-ws-log")) return;
    const mac = e.target.closest("[data-scale-mac]")?.dataset.scaleMac;
    if (!mac) return;
    const st = _scaleLocalState.get(mac);
    if (st) st.logOpen = e.target.open;
  }, { capture: true, signal: _scaleTareAbortCtrl.signal });

  // ── TARE — hold 1 s to confirm ────────────────────────────────────────────
  // The tare button lives outside .scale-card-local so its animation
  // is never interrupted by the 10 Hz weight refresh.
  function _startTare(btn) {
    const mac = btn?.dataset.tareMac;
    if (!mac || btn.disabled) return;
    const st = _scaleLocalState.get(mac);
    if (!st?.connected || !st?.ip) return;
    btn.classList.add("holding");
    st._tareTimer = setTimeout(async () => {
      btn.classList.remove("holding");
      btn.classList.add("success");
      try { await fetch(`http://${st.ip}/api/tare`, { method: "POST" }); }
      catch (err) { reportError("scale.tare", err); }
      setTimeout(() => btn.classList.remove("success"), 600);
      st._tareTimer = null;
    }, 1000);
  }
  function _cancelTare(btn) {
    const mac = btn?.dataset.tareMac;
    if (!mac) return;
    const st = _scaleLocalState.get(mac);
    if (st?._tareTimer) { clearTimeout(st._tareTimer); st._tareTimer = null; }
    btn?.classList.remove("holding");
  }

  body.addEventListener("mousedown", e => {
    const btn = e.target.closest(".tare-hold-btn");
    if (btn) _startTare(btn);
  }, { signal: _scaleTareAbortCtrl.signal });
  body.addEventListener("mouseup",    e => _cancelTare(e.target.closest(".tare-hold-btn") ?? document.querySelector(".tare-hold-btn.holding")), { signal: _scaleTareAbortCtrl.signal });
  body.addEventListener("mouseleave", e => { if (e.target.closest?.("#scalesPanelBody")) document.querySelectorAll(".tare-hold-btn.holding").forEach(_cancelTare); }, { signal: _scaleTareAbortCtrl.signal });
  body.addEventListener("touchstart", e => {
    const btn = e.target.closest(".tare-hold-btn");
    if (btn) { e.preventDefault(); _startTare(btn); }
  }, { passive: false, signal: _scaleTareAbortCtrl.signal });
  body.addEventListener("touchend", e => {
    document.querySelectorAll(".tare-hold-btn.holding").forEach(_cancelTare);
  }, { signal: _scaleTareAbortCtrl.signal });

  // ── WebSocket connections ────────────────────────────────────────────────
  // Start (or resume) connections for all visible scales.
  // Respect manual disconnects — don't auto-reconnect if user clicked "Disconnect".
  state.scales.forEach(s => {
    if (!s.ip_address) return;
    const localSt = _scaleLocalState.get(s.mac);
    if (localSt?.manuallyDisconnected) return;
    if (s.ip_address !== localSt?.ip) connectScaleWs(s.mac, s.ip_address);
  });
}

// ── 10 s health tick ───────────────────────────────────────────────────────

function _startHealthTick() {
  const { state, $ } = _ctx;
  setInterval(() => {
    if (!state.scales.length) return;
    renderScaleHealth();
    if ($("scalesPanel")?.classList.contains("open")) renderScalesPanel();
  }, 10 * 1000);
}

// ── Scale v2 field accessors ───────────────────────────────────────────────
// Studio Manager reads scale documents using the v2 schema only.
// Firmwares still on v1 names (last_seen, last_spool, name, rssi,
// battery_pct) will appear OFFLINE / unnamed until they update to v2.
// This is intentional — no dual-read shims.

function scaleHeartbeatAt(s)      { return s?.last_heartbeat_at   ?? null; }
function scaleDisplayName(s)      { return s?.display_name        ?? null; }
function scaleCurrentSpoolUid1(s) { return s?.current_spool_uid_1 ?? null; }
function scaleCurrentSpoolUid2(s) { return s?.current_spool_uid_2 ?? null; }
function scaleWifiSignalDbm(s)    { return s?.wifi_signal_dbm     ?? null; }
function scaleBatteryPercent(s)   { return s?.battery_percent     ?? null; }
function scaleIsCharging(s)       { return s?.is_charging         ?? null; }
function scalePowerSource(s)      { return s?.power_source        ?? null; }

function isScaleOnline(s) {
  return Date.now() - scaleTsToMs(scaleHeartbeatAt(s)) < SCALE_ONLINE_THRESHOLD_MS;
}

// ── Timestamp helper ───────────────────────────────────────────────────────

/**
 * Convert a Firestore Timestamp (or number, or seconds object) to milliseconds.
 * Falls back to the shared tsToMs from ctx for legacy shapes.
 */
function scaleTsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.seconds != null) return ts.seconds * 1000 + Math.round((ts.nanoseconds || 0) / 1e6);
  return _ctx.tsToMs(ts) || 0;
}

// ── Utility helpers ────────────────────────────────────────────────────────

/**
 * Format a raw MAC address string to colon-separated upper-case.
 *   "34987ab31f94"      → "34:98:7A:B3:1F:94"
 *   "34:98:7a:b3:1f:94" → "34:98:7A:B3:1F:94"  (idempotent)
 */
function formatMacAddress(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "";
  const clean = raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (clean.length === 0) return raw;
  return clean.match(/.{1,2}/g).join(":");
}

/**
 * Map a Wi-Fi RSSI value (negative dBm) to a quality label + CSS class suffix.
 *   ≥ -50 → "excellent"   ≥ -60 → "good"   ≥ -70 → "fair"   < -70 → "weak"
 */
function wifiQualityLevel(dbm) {
  const { t } = _ctx;
  if (dbm >= -50) return { cls: "excellent", label: t("scaleChipWifiQualityExcellent") };
  if (dbm >= -60) return { cls: "good",      label: t("scaleChipWifiQualityGood") };
  if (dbm >= -70) return { cls: "fair",      label: t("scaleChipWifiQualityFair") };
  return              { cls: "weak",      label: t("scaleChipWifiQualityWeak") };
}

/**
 * CSS.escape polyfill — ensures a MAC can be safely interpolated into
 * a CSS attribute selector even if the value contains unusual characters.
 */
function _cssEscape(s) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * Format a timestamp (ms) as a relative "N m/h/d ago" string.
 * Uses the shared i18n keys: agoNow, agoMin, agoHour, agoDay.
 */
function _agoString(ms) {
  const { t } = _ctx;
  const dt = Math.max(0, Date.now() - ms);
  const m  = Math.floor(dt / 60000);
  if (m < 1)  return t("agoNow")   || "just now";
  if (m < 60) return t("agoMin",  { n: m }) || `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return t("agoHour", { n: h }) || `${h}h`;
  const d = Math.floor(h / 24);
  return t("agoDay", { n: d }) || `${d}d`;
}
