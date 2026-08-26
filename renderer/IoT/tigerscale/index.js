/**
 * renderer/IoT/tigerscale/index.js — TigerScale integration module.
 *
 * Manages the full lifecycle of TigerScale devices in the Studio Manager:
 *   • Firestore real-time subscription (scales/{mac} heartbeats)
 *   • Slide-in sidecard: health icon, panel, scale cards, chips, spool block
 *   • Local WebSocket connection (ws://ip/ws) with auto-reconnect — the
 *     onmessage handler consumes EVERY delta the firmware pushes (no client
 *     throttle; the firmware emits ~4 Hz deltas + a full snapshot every 30 s)
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
// A scale heartbeats every 30 s while its screen is on, but only every 5 min
// once the backlight goes off (power_state "screen_off"). A screen_off scale is
// fully awake — WiFi associated, HTTP answering — so it must NOT be called
// offline on the active-cadence timeout. Each regime allows a few missed beats.
const SCALE_ONLINE_ACTIVE_MS  = 90 * 1000;        // active: 30 s cadence  → offline after ~90 s
const SCALE_ONLINE_STANDBY_MS = 11 * 60 * 1000;   // screen_off: 5 min cadence → offline after ~11 min

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

// mac → { ps, ch } last-seen power_source / is_charging, for the debug-mode
// transition log in the Firestore subscription (plug/unplug latency probe).
const _scalePwrPrev = new Map();

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
      const t0 = (typeof performance !== "undefined") ? performance.now() : 0;
      state.scales = snap.docs.map(d => ({ mac: d.id, ...d.data() }));
      // Diagnostics (debug mode only): timestamp every power_source/is_charging
      // transition on reception, and measure snapshot→render. Lets a physical
      // plug/unplug be timed against when Studio actually reflects it — power
      // fields render on THIS snapshot, never behind the 10 s health-tick.
      if (state.debugEnabled) {
        for (const s of state.scales) {
          const prev = _scalePwrPrev.get(s.mac) || {};
          const cur  = { ps: s.power_source, ch: s.is_charging, pw: s.power_state };
          if (prev.ps !== cur.ps || prev.ch !== cur.ch || prev.pw !== cur.pw) {
            console.log(`[tigerscale] ${new Date().toISOString()} rx ${s.mac} `
              + `power_state ${prev.pw}→${cur.pw} · power_source ${prev.ps}→${cur.ps} · is_charging ${prev.ch}→${cur.ch} `
              + `· battery ${s.battery_percent} · from_cache=${snap.metadata.fromCache}`);
          }
          _scalePwrPrev.set(s.mac, cur);
        }
      }
      renderScaleHealth();
      renderScalesPanel();
      if (state.debugEnabled) {
        const dt = ((typeof performance !== "undefined") ? performance.now() : 0) - t0;
        console.log(`[tigerscale] snapshot→render ${dt.toFixed(1)} ms (${state.scales.length} scale(s))`);
      }
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
 * Update the header status icon (right of the TigerPod glyph) — four tiers:
 *   • (no class)     → no scale paired at all           (grey)
 *   • scale-active   → ≥1 scale active (screen on)       (green, glow + ping)
 *   • scale-standby  → none active but ≥1 in standby     (blue)
 *   • scale-offline  → paired but all offline            (red)
 */
// Battery badge HTML for one scale's glyph (iOS-style mini battery), or "" when
// no cell is fitted / no reading. "XX%" while discharging, "XX" + bolt charging.
function _scaleHealthBattHtml(s) {
  /* An OFFLINE scale has stopped reporting, so its last battery reading is only
     what was true when it went quiet — it could be minutes or days old, and the
     one thing a battery gauge must not do is state a level with confidence it no
     longer has. No signal, no figure: the red glyph already says the scale is
     out of touch, which is the honest answer. */
  if (scaleConnState(s) === "offline") return "";
  if (scaleBatteryPresent(s) === false) return "";
  const p = scaleBatteryPercent(s);
  if (typeof p !== "number" || !isFinite(p)) return "";
  const charging = scaleIsCharging(s) === true;
  const bst = charging ? "charging" : (p < 20 ? "low" : "neutral");
  const pct = Math.max(0, Math.min(100, p));
  return `<span class="scale-health-batt is-${bst}">`
    + `<span class="shb-fill" style="width:${pct}%"></span>`
    + `<span class="shb-txt">${p}${charging ? "" : "%"}</span>`
    + (charging ? `<span class="shb-bolt"></span>` : "")
    + `</span>`;
}

let _scaleHealthSig = "";

export function renderScaleHealth() {
  const { $, state, t, esc } = _ctx;
  const el = $("scaleHealth");
  if (!el) return;
  const scales = state.scales;
  const total  = scales.length;

  // Signature — rebuild only when something visible changes, so the ping
  // animation isn't restarted on every 10 s tick / snapshot.
  const sig = total === 0 ? "none" : scales.map(s =>
    scaleConnState(s) + "/" + (scaleBatteryPresent(s) === false ? "x" : scaleBatteryPercent(s))
      + (scaleIsCharging(s) === true ? "c" : "")).join("|");
  if (sig === _scaleHealthSig) return;
  _scaleHealthSig = sig;

  el.removeAttribute("data-tooltip");   // replaced by the rich hover popover

  if (total === 0) {
    el.innerHTML =
      `<span class="scale-glyphs"><span class="scale-glyph"><span class="scale-health-icon"></span></span></span>`
      + `<div class="scale-health-pop"><div class="shp-row shp-row--empty">${esc(t("scaleHealthNone") || "No scale connected")}</div></div>`;
    return;
  }

  // Up to 2 glyphs (1 scale → 1, 2+ → 2, capped), each coloured by its own state.
  const glyphN = Math.min(total, 2);
  let glyphs = "";
  for (let i = 0; i < glyphN; i++) {
    const cs = scaleConnState(scales[i]);
    glyphs += `<span class="scale-glyph scale-${cs}">`
      + `<span class="scale-health-icon"></span>`
      + (cs === "active" ? `<span class="scale-live" aria-hidden="true"></span>` : "")
      + _scaleHealthBattHtml(scales[i])
      + `</span>`;
  }

  // Popover — one row per scale (all of them): coloured status dot + "Scale #N".
  const rows = scales.map((s, i) => {
    const cs = scaleConnState(s);
    return `<div class="shp-row"><span class="shp-dot shp-dot--${cs}"></span>`
      + `<span class="shp-name">${esc(t("scaleHealthRow", { n: i + 1 }) || `Scale #${i + 1}`)}</span>`
      + `<span class="shp-status">${esc(_scalePillLabel(cs))}</span></div>`;
  }).join("");

  el.innerHTML = `<span class="scale-glyphs">${glyphs}</span><div class="scale-health-pop">${rows}</div>`;
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
        <div class="scales-empty-stage">
          <img class="scales-empty-img" src="../assets/img/TigerScale_Photo.png" alt="TigerScale" />
          <span class="scales-empty-badge">V3</span>
        </div>
        <div class="scales-empty-title" data-i18n="scaleEmptyTitle">${esc(t("scaleEmptyTitle"))}</div>
        <div class="scales-empty-sub" data-i18n="scaleEmptySub">${esc(t("scaleEmptySub"))}</div>
        <ul class="scales-empty-feats">
          <li><span class="ic"><span class="icon icon-nfc"></span></span>
              <span data-i18n="scaleEmptyBullet1">${esc(t("scaleEmptyBullet1"))}</span></li>
          <li><span class="ic"><span class="icon icon-scale"></span></span>
              <span data-i18n="scaleEmptyBullet2">${esc(t("scaleEmptyBullet2"))}</span></li>
          <li><span class="ic"><span class="icon icon-wifi"></span></span>
              <span data-i18n="scaleEmptyBullet3">${esc(t("scaleEmptyBullet3"))}</span></li>
          <li><span class="ic"><span class="icon icon-cloud"></span></span>
              <span data-i18n="scaleEmptyBullet4">${esc(t("scaleEmptyBullet4"))}</span></li>
          <li><span class="ic"><span class="icon icon-bolt"></span></span>
              <span data-i18n="scaleEmptyBullet5">${esc(t("scaleEmptyBullet5"))}</span></li>
          <li><span class="ic"><span class="icon icon-sparkle"></span></span>
              <span data-i18n="scaleEmptyBullet6">${esc(t("scaleEmptyBullet6"))}</span></li>
        </ul>
        <div class="scales-empty-ctas">
          <a class="scales-empty-cta scales-empty-cta--github" id="scaleGithubLink" href="#">
            <span class="icon icon-github icon-14"></span>
            <span data-i18n="scaleEmptyCta">View on GitHub</span>
          </a>
          <a class="scales-empty-cta scales-empty-cta--makerworld" id="scaleModelLink" href="#">
            <span class="icon icon-package icon-14"></span>
            <span data-i18n="scaleEmptyCtaModel">${esc(t("scaleEmptyCtaModel"))}</span>
          </a>
        </div>
        <div class="scales-empty-license" data-i18n="scaleEmptyLicense">${esc(t("scaleEmptyLicense"))}</div>
      </div>`;
    $("scaleGithubLink")?.addEventListener("click", e => {
      e.preventDefault();
      window.open("https://github.com/TigerTag-Project/Tiger-Scale-V3");
    });
    $("scaleModelLink")?.addEventListener("click", e => {
      e.preventDefault();
      window.open("https://makerworld.com/models/3161869-tigerscale-v3-best-smart-filament-scale-with-nfc");
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
            <span class="scale-card-status-pill ${_scalePillClass(scaleConnState(s))}">
              <span class="scale-card-status-dot"></span>
              <span class="scale-card-status-pill-text">${_scalePillLabel(scaleConnState(s))}</span>
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

  // Wi-Fi — colour follows CONNECTIVITY, not raw strength, matching the scale's
  // own screen (green whenever connected, red only when disconnected). A scale
  // that just heartbeated IS connected, so its link shows healthy green even at a
  // modest RSSI — never a red alarm for a working scale. Strength still reads from
  // the bar count (1–4 by RSSI); the exact dBm + quality label are in the tooltip.
  if (typeof wifiDbm === "number" && isFinite(wifiDbm)) {
    const q = wifiQualityLevel(wifiDbm);
    const cls = online ? "ok" : "off";
    chips.push(`<span class="scale-chip scale-chip--wifi scale-chip--wifi-${cls}" title="${esc(q.label)} · ${esc(String(wifiDbm))} dBm">
      <span class="icon icon-wifi icon-13" aria-hidden="true"></span>
    </span>`);
  }

  // Battery — an iOS-style pill: outline coloured by level, a proportional fill,
  // the value INSIDE, and an orange charging bolt to the right when is_charging.
  // battery_percent is null when no cell is fitted (null ≠ 0; a flat fitted cell
  // reads 0 and still shows). battery_present:false is the authoritative "no
  // battery" signal; absent (older firmware) is treated as present so nothing
  // regresses. With no battery we fall back to a plain USB/power chip.
  const hasBattery = scaleBatteryPresent(s) !== false && typeof battery === "number" && isFinite(battery);
  if (hasBattery) {
    // Colour precedence — charging, then low, then neutral. Charging OUTRANKS
    // low: a cell below 20 % on a live charger is being fixed, not a fault, so it
    // shows the charging colour whatever the level (matches the scale's screen).
    const battState = charging === true ? "charging" : (battery < 20 ? "low" : "neutral");
    const pct = Math.max(0, Math.min(100, battery));
    const boltHtml = charging === true ? `<span class="icon icon-bolt icon-10 scale-batt-bolt"></span>` : "";
    const ttl = charging === true ? `${battery}% · ${t("scaleChipCharging")}` : `${battery}%`;
    chips.push(`<span class="scale-chip scale-chip--battery scale-chip--bat-${battState}" title="${esc(ttl)}">
      <span class="scale-batt"><span class="scale-batt-fill" style="width:${pct}%"></span><span class="scale-batt-num">${esc(String(battery))}</span></span>
      ${boltHtml}
    </span>`);
  } else if (power) {
    const isUsb   = String(power).toLowerCase() === "usb";
    const lbl     = isUsb ? t("scaleChipPowerUsb") : t("scaleChipPowerBattery");
    const iconCls = isUsb ? "icon-plug" : "icon-battery";
    chips.push(`<span class="scale-chip scale-chip--power" title="${esc(t("scaleChipPower"))}">
      <span class="icon ${iconCls} icon-12"></span>
      <span class="scale-chip-text">${esc(lbl)}</span>
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
/** Map scaleStatus firmware string → { text, bg } for the send-state badge.
 *  Colours match the firmware's own LVCOL_GREEN/ACCENT/YELLOW/RED/ORANGE
 *  (TigerTagSplashESP32.ino §1) so the badge reads the same as the scale's
 *  own screen: green=ready/done, blue=in-progress, yellow=stabilizing,
 *  orange=remove-spool, red=error. Text goes through t() — idle/ready/
 *  scanning/stable/send/success reuse the existing scaleStatus* keys, the
 *  other three (countdown/error/remove-spool) have their own scaleBadge*
 *  keys, all 9 locales. */
function _scaleStatusBadgeInfo(status, t) {
  if (!status) return null;
  const GREEN = "rgba(59,165,93,0.30)", ACCENT = "rgba(47,127,255,0.30)",
        YELLOW = "rgba(242,183,5,0.30)", RED = "rgba(226,75,74,0.35)",
        ORANGE = "rgba(232,130,30,0.30)", NEUTRAL = "rgba(138,147,166,0.25)";
  if (status === "idle" || status === "ready") return { text: t("scaleStatusReady"),  bg: GREEN };
  if (status.startsWith("scanning:")) return { text: t("scaleStatusScanning"), bg: ACCENT };
  if (status.startsWith("stable:"))   return { text: t("scaleStatusStable"),   bg: YELLOW };
  if (/^\d+$/.test(status)) return { text: t("scaleBadgeSendIn", { n: status }), bg: ACCENT };
  if (status === "send")    return { text: t("scaleStatusSending"),    bg: ACCENT };
  if (status === "success") return { text: t("scaleStatusSuccess"),    bg: GREEN };
  if (status === "error")   return { text: t("scaleBadgeError"),       bg: RED };
  if (status === "done")    return { text: t("scaleBadgeRemoveSpool"), bg: ORANGE };
  return { text: status, bg: NEUTRAL };
}

function _buildScaleLocalBlockHtml(mac) {
  const { esc, t, state } = _ctx;
  const st = _scaleLocalState.get(mac);

  // Pas connecté → card vide → display:none via CSS (.scale-card-local:empty)
  if (!st?.connected) return "";

  const s  = state.scales.find(x => x.mac === mac);
  const name = scaleDisplayName(s) || "TigerScale";

  // ── Status badge ───────────────────────────────────────────────────────
  const badgeInfo = _scaleStatusBadgeInfo(st.scaleStatus, t);
  const badgeHtml = badgeInfo
    ? `<span class="send-status" style="background:${badgeInfo.bg}">${esc(badgeInfo.text)}</span>`
    : `<span class="send-status" style="visibility:hidden">·</span>`;

  // ── Brand/material — données venant du WebSocket ──────────────────────────
  const uidLeft  = st?.uidLeft  ?? null;
  const uidRight = st?.uidRight ?? null;
  const uidTwin  = st?.uidTwin  ?? null;
  const brand    = st?.brand    || "";
  const material = st?.material || "";
  // Extraire #RRGGBB depuis "Red #FF0000" (format firmware) ou chaîne brute
  const hexMatch = (st?.color || "").match(/#([0-9A-Fa-f]{6})\b/);
  const dotColor = hexMatch ? `#${hexMatch[1]}` : "rgba(255,255,255,0.25)";
  const hasInfo  = brand.length > 0 || material.length > 0;
  const brandBlockHtml = hasInfo ? `
      <div class="brand-row">
        <span class="brand-dot" style="background:${esc(dotColor)}"></span>
        <span class="brand-name">${esc(brand || "—")}</span>
      </div>
      ${material ? `<span class="material-name">${esc(material)}</span>` : ""}` : "";

  // ── Weight values (toujours connecté ici grâce au early-return) ──────────
  // Weights are physically ≥ 0; the firmware sends -1 (and sometimes 0) for
  // "unknown" — notably containerWeight = -1 when the tag has no empty-spool
  // weight. Guard with > 0 so an unknown never renders as "-1 g" (per API.md).
  const weightVal    = typeof st.weight === "number" ? Math.round(st.weight) : "—";
  const containerVal = (typeof st.containerWeight === "number" && st.containerWeight > 0) ? Math.round(st.containerWeight) : "—";
  const filamentVal  = (typeof st.netWeight       === "number" && st.netWeight       > 0) ? Math.round(st.netWeight)       : "—";

  // ── Rack location — same resolve as the detail panel's "Storage location"
  // section (r.rackId/rackLevel/rackPos, coord letter+number formatting),
  // for whichever spool is actually on the scale right now. Real Firestore
  // data, not firmware-pushed — the firmware only knows the raw UIDs. ──────
  // Twin badge — mirrors the physical scale's own pairing indicator
  // (TigerTagSplashESP32.ino ~13561-13585): hidden with no chip at all, BLUE
  // when the spool is twinned (both antennas reading a pair, or a single chip
  // whose partner is known from Firestore), GREY when it's a genuine single
  // chip with no twin. Not a plain show/hide — a single chip still gets the
  // badge, just muted.
  const hasAnyChip = !!(uidLeft || uidRight);
  const isTwinned  = !!(uidLeft && uidRight) || !!uidTwin;
  const twinBadgeHtml = hasAnyChip
    ? `<span class="mc-twin-badge card-tl-badge ${isTwinned ? "card-tl-badge--twin" : "card-tl-badge--single"}" title="${esc(t("twinBadge") || "Twin")}"><span class="icon icon-link icon-11"></span></span>`
    : "";

  const scannedUid = uidLeft || uidRight || uidTwin;
  const scannedRow = scannedUid
    ? state.rows.find(x => String(x.uid) === String(scannedUid) || String(x.spoolId) === String(scannedUid))
    : null;
  const rackFor = (scannedRow && scannedRow.rackId && scannedRow.rackLevel != null && scannedRow.rackPos != null)
    ? state.racks.find(x => x.id === scannedRow.rackId) : null;
  const rackCoord = rackFor
    ? String.fromCharCode(65 + scannedRow.rackLevel) + (scannedRow.rackPos + 1)
      + (scannedRow.rackDepth > 0 ? "·" + (scannedRow.rackDepth + 1) : "")
    : null;

  return `<div class="sc2-live-card">
    <div class="top-strip">
      ${badgeHtml}
      <span class="user-name">${esc(name)}</span>
    </div>
    <div class="main-card">
      <div class="mc-left">
        ${twinBadgeHtml}
        <div class="weight-display">
          <span class="sc2-weight-num">${esc(String(weightVal))}</span><span class="weight-unit">g</span>
        </div>
        <div class="brand-block">${brandBlockHtml}</div>
      </div>
      <div class="mc-vdiv"></div>
      <div class="mc-right">
        <div class="mc-row">
          <span class="mc-label">${esc(t("scaleContainerLabel") || "CONTAINER")}</span>
          <span class="mc-value">${containerVal === "—" ? "—" : `${esc(String(containerVal))} g`}</span>
        </div>
        <div class="mc-row">
          <span class="mc-label">${esc(t("scaleFilamentLabel") || "FILAMENT")}</span>
          <span class="mc-value">${filamentVal === "—" ? "—" : `${esc(String(filamentVal))} g`}</span>
        </div>
        <div class="mc-hdiv"></div>
        <div class="mc-loc-row">
          <span class="mc-loc-icon mc-loc-icon--home"></span>
          <span class="mc-loc-value">${esc(rackFor ? rackFor.name : "—")}</span>
        </div>
        <div class="mc-loc-row">
          <span class="mc-loc-icon mc-loc-icon--pin"></span>
          <span class="mc-loc-value">${esc(rackCoord || "—")}</span>
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
 * Open a WebSocket at ws://ip/ws — no pre-ping, we connect directly and let
 * onclose drive the retries. Auto-reconnects on close (5 s). Detects superseded
 * calls (IP changed concurrently) via Map entry checks.
 *
 * Channel split is deliberate and we keep it: live data (weight / tag / phase)
 * rides this WS, persistent state (battery / power / wifi / fw / account) comes
 * from Firestore — reachable from anywhere — and HTTP is used ONLY for actions
 * (tare). We do NOT fall back to the HTTP API to READ state when the WS is down:
 * if the WS is closed there is nothing live to show, and Firestore still carries
 * the persistent state. (Firmware 3.7.0 exposes GET /api/status, but by design
 * we don't poll it.)
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
      // The firmware's OWN on-device pairing badge never trusts the raw
      // uid_left/uid_right/uid_twin fields it broadcasts over WS directly —
      // it keeps a separate, debounced lastUID/lastUID2 pair internally and
      // resets BOTH to empty once the platform is genuinely empty, only
      // repopulating them from confirmed reads (TigerTagSplashESP32.ino
      // §RFID ~line 15191-15329). Mirror that reset here: without it, a
      // single-chip spool can inherit the previous weighing's uid_right and
      // flash the wrong badge colour until the new cycle's own fields happen
      // to overwrite it.
      // NB: "done" ("remove spool" prompt) and "error" are NOT boundaries —
      // the chip is still physically on the platform at that point. Resetting
      // there made the badge vanish the instant "done" fired and only
      // reappear a few seconds later on the next delta, well before the user
      // had actually removed the spool. Only "idle"/"ready" mean an empty
      // platform.
      const prevStatus = st.scaleStatus;
      const CYCLE_BOUNDARY = new Set(["idle", "ready"]);
      const enteringNewScan = typeof data.scaleStatus === "string"
        && data.scaleStatus.startsWith("scanning:")
        && !(typeof prevStatus === "string" && prevStatus.startsWith("scanning:"));
      const atCycleBoundary = typeof data.scaleStatus === "string" && CYCLE_BOUNDARY.has(data.scaleStatus);
      if (enteringNewScan || atCycleBoundary) { st.uidLeft = null; st.uidRight = null; st.uidTwin = null; }
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
      // NFC reader UIDs (prefer _left/_right, fallback to uid/uid2) — applied
      // AFTER the cycle-boundary reset above so a same-message confirmed UID
      // still lands correctly.
      //
      // The firmware broadcasts DELTAS: a field is only included in a message
      // when it actually changed, so "uid_left absent from this message" means
      // "unchanged" (still whatever it was), NOT "this firmware has no
      // uid_left concept". The uid/uid2 fallback below exists for genuinely
      // older single-reader firmware that never sends uid_left/uid_right at
      // all — so it must only ever fire before we've seen either split field
      // from THIS scale, never merely because one is missing from one
      // message. Without st.usesSplitUids, a message carrying uid_right (a
      // single chip, right reader) but omitting the unchanged uid_left wrongly
      // copied uid into uid_left too, faking a twin pair (both sides equal).
      if ("uid_left" in data || "uid_right" in data) st.usesSplitUids = true;
      if ("uid_left"  in data) st.uidLeft  = data.uid_left  || null;
      if ("uid_right" in data) st.uidRight = data.uid_right || null;
      if (!st.usesSplitUids && "uid"  in data) st.uidLeft  = data.uid  || null;
      if (!st.usesSplitUids && "uid2" in data) st.uidRight = data.uid2 || null;
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
  const cstate = scaleConnState(s);
  const online = cstate !== "offline";   // active OR standby = alive
  card.querySelector(".scale-card")?.classList.toggle("is-online", online);

  // Status pill — active (green) / standby (blue) / offline (red)
  const pill = card.querySelector(".scale-card-status-pill");
  if (pill) {
    pill.classList.toggle("is-online",  cstate === "active");
    pill.classList.toggle("is-standby", cstate === "standby");
    pill.classList.toggle("is-offline", cstate === "offline");
    const txt = pill.querySelector(".scale-card-status-pill-text");
    if (txt) txt.textContent = _scalePillLabel(cstate);
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
  // is never interrupted by the live weight refresh (every WS delta re-renders
  // that block).
  function _startTare(btn) {
    const mac = btn?.dataset.tareMac;
    if (!mac || btn.disabled) return;
    const st = _scaleLocalState.get(mac);
    if (!st?.connected || !st?.ip) return;
    btn.classList.add("holding");
    st._tareTimer = setTimeout(async () => {
      btn.classList.remove("holding");
      st._tareTimer = null;
      // Firmware 3.7.0 returns CORS headers, so we can finally READ the tare
      // response: celebrate only on a 2xx. Previously "success" was shown BEFORE
      // the fetch and the error was swallowed, so the button lied even when the
      // scale was unreachable.
      try {
        const res = await fetch(`http://${st.ip}/api/tare`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        btn.classList.add("success");
        setTimeout(() => btn.classList.remove("success"), 600);
      } catch (err) {
        reportError("scale.tare", err);
        btn.classList.add("error");
        setTimeout(() => btn.classList.remove("error"), 900);
      }
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
function scaleWifiSignalDbm(s)    { return s?.wifi_signal_dbm     ?? null; }
function scaleBatteryPercent(s)   { return s?.battery_percent     ?? null; }
function scaleIsCharging(s)       { return s?.is_charging         ?? null; }
function scalePowerSource(s)      { return s?.power_source        ?? null; }
function scalePowerState(s)       { return s?.power_state         ?? null; }
function scaleBatteryPresent(s)   { return s?.battery_present     ?? null; }

// Online = heartbeat seen within the regime's window. Standby (screen_off) beats
// only every 5 min, so it gets the longer grace — otherwise a fully-awake scale
// with its backlight off would be wrongly shown as disconnected after 90 s.
function isScaleOnline(s) {
  const gap = Date.now() - scaleTsToMs(scaleHeartbeatAt(s));
  const standby = scalePowerState(s) === "screen_off";
  return gap < (standby ? SCALE_ONLINE_STANDBY_MS : SCALE_ONLINE_ACTIVE_MS);
}

// Three-way connection state for ONE scale: "active" (online, screen on),
// "standby" (online, backlight off — still fully alive and reachable), or
// "offline". Colours: active→green, standby→blue, offline→red.
function scaleConnState(s) {
  if (!isScaleOnline(s)) return "offline";
  return scalePowerState(s) === "screen_off" ? "standby" : "active";
}
function _scalePillClass(cs) { return cs === "active" ? "is-online" : cs === "standby" ? "is-standby" : "is-offline"; }
function _scalePillLabel(cs) {
  const { t } = _ctx;
  return cs === "active" ? t("scaleStatusOnline") : cs === "standby" ? t("scaleStatusStandby") : t("scaleStatusOffline");
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
// Realistic RSSI buckets for a working ESP32 Wi-Fi link (only the bar COUNT and
// the tooltip label use these — the chip colour is connectivity-based, above).
// The old -50/-60/-70 cut-offs were router-adjacent and made a normal -70 dBm
// link read as "weak". A healthy room signal is roughly -50…-67.
function wifiQualityLevel(dbm) {
  const { t } = _ctx;
  if (dbm >= -67) return { cls: "excellent", bars: 4, label: t("scaleChipWifiQualityExcellent") };
  if (dbm >= -73) return { cls: "good",      bars: 3, label: t("scaleChipWifiQualityGood") };
  if (dbm >= -80) return { cls: "fair",      bars: 2, label: t("scaleChipWifiQualityFair") };
  return              { cls: "weak",      bars: 1, label: t("scaleChipWifiQualityWeak") };
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
