/**
 * printers/flashforge/cards.js — FlashForge live-block card widgets.
 *
 * All functions read from ctx at call time — never destructure ctx at
 * module scope, so inventory.js can populate it after import resolution.
 *
 * Local helpers (ffgFmtTempSolo, ffgIsActiveState, ffgStateLabel,
 * ffgFmtDuration) moved here from inventory.js — they are only used
 * by these card renderers.
 */
import { ctx } from '../context.js';

// ── Local helpers ─────────────────────────────────────────────────────────────

function ffgFmtTempSolo(v) {
  return (typeof v === "number" && isFinite(v)) ? `${Math.round(v)}°C` : "—";
}

// "30 / 215°C" — always shows the setpoint when the firmware reports one
// (matches snapFmtTempPair on the other brands; idle reads "30 / 0°C"). Falls
// back to current-only when no target is reported at all (older models).
function ffgFmtTempPair(cur, tgt) {
  const c = (typeof cur === "number" && isFinite(cur)) ? `${Math.round(cur)}` : "—";
  return (typeof tgt === "number" && isFinite(tgt))
    ? `${c}/${Math.round(tgt)}°C`
    : `${c}°C`;
}

// Print state mapping — FlashForge ships its own vocabulary that we
// surface with our own (i18n-able) labels. Active = the print-job
// card should render and progress / layer counters are meaningful.
const FFG_ACTIVE_STATES = new Set([
  "printing", "preparing", "heating", "busy", "paused"
]);

function ffgIsActiveState(s) {
  return FFG_ACTIVE_STATES.has(String(s || "").toLowerCase().trim());
}

function ffgStateLabel(s) {
  const norm = String(s || "").toLowerCase().trim();
  // We deliberately reuse the snapState_* keys for shared states so the
  // user reads the same label across brands. FlashForge introduces a
  // few extras (preparing, heating, busy, ready) we map to bespoke
  // ffgState_* keys.
  const aliases = {
    "printing":  "snapState_printing",
    "paused":    "snapState_paused",
    "complete":  "snapState_complete",
    "completed": "snapState_complete",
    "cancelled": "snapState_cancelled",
    "canceled":  "snapState_cancelled",
    "error":     "snapState_error",
    "standby":   "snapState_standby",
    "idle":      "snapState_standby",
    "ready":     "ffgState_ready",
    "preparing": "ffgState_preparing",
    "heating":   "ffgState_heating",
    "busy":      "ffgState_busy"
  };
  const key = aliases[norm];
  if (!key) return norm || "—";
  const lbl = ctx.t(key);
  return lbl && lbl !== key ? lbl : (norm || "—");
}

function ffgFmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

// ── Card renderers ────────────────────────────────────────────────────────────

export function renderFfgJobCard(p, conn) {
  const d = conn.data;
  if (conn.status !== "connected") return "";
  const jobState  = d.printState || "idle";
  const isActive  = ffgIsActiveState(jobState);
  const pct       = isActive ? Math.round((d.progress || 0) * 100) : 0;
  const leafName  = isActive && d.printFilename
                  ? String(d.printFilename).split("/").pop()
                  : "";
  const fallbackImg = ctx.printerImageUrlFor(p.brand, p.printerModelId)
                   || ctx.printerImageUrl(ctx.findPrinterModel(p.brand, "0"));
  const thumbUrl  = (isActive && d.printPreviewUrl) ? d.printPreviewUrl : (fallbackImg || "");
  const layerText = isActive && (d.currentLayer || d.totalLayer)
                  ? `${d.currentLayer || 0}/${d.totalLayer || 0}` : "";
  const timeText = isActive
                 ? (d.printEstimated ? ffgFmtDuration(d.printEstimated) : "—")
                 : "0m";
  const stateLabel = ffgStateLabel(jobState);
  const isPaused   = String(jobState).toLowerCase() === "paused";
  const nameLine = leafName
    ? `<div class="snap-job-name" title="${ctx.esc(leafName)}">${ctx.esc(leafName)}</div>`
    : `<div class="snap-job-name snap-job-name--idle">${ctx.esc(ctx.t("snapJobNoActive") || "—")}</div>`;

  // Controls row — chamber/case light toggle (always, when connected) +
  // pause/resume + stop (only while a job is active). The stop button is
  // hold-to-confirm (carries .hold-progress). See PROTOCOL §13.6 / §13.7.
  const lightOn  = String(d.lightStatus || "").toLowerCase() === "open";
  const lightTip = ctx.esc(lightOn ? (ctx.t("creLedOnTip") || "Turn off light")
                                   : (ctx.t("creLedOffTip") || "Turn on light"));
  const lightBtn = `
    <button type="button" class="cre-action-btn ffg-light-btn${lightOn ? " is-on" : ""}"
            data-ffg-light="1" title="${lightTip}">
      <span class="icon icon-bulb icon-14"></span>
    </button>`;
  const infoBtn = `
    <button type="button" class="cre-action-btn ffg-info-btn"
            data-ffg-info="1" title="${ctx.esc(ctx.t("ffgInfoTitle") || "Printer info")}">
      <span class="icon icon-info icon-14"></span>
    </button>`;
  const filesBtn = `
    <button type="button" class="cre-action-btn ffg-files-btn"
            data-ffg-open-files="1" title="${ctx.esc(ctx.t("ffgFilesTitle") || "Files")}">
      <span class="icon icon-folder icon-14"></span>
    </button>`;
  const jobBtns = isActive ? `
        <button type="button" class="cre-action-btn cre-action-btn--pause"
                data-ffg-print-pause="1"
                title="${isPaused ? ctx.esc(ctx.t("snapPrintResume") || "Resume") : ctx.esc(ctx.t("snapPrintPause") || "Pause")}">
          <span class="icon ${isPaused ? "icon-play" : "icon-pause"} icon-14"></span>
          <span class="hold-progress"></span>
        </button>
        <button type="button" class="cre-action-btn cre-action-btn--stop"
                data-ffg-print-cancel="1"
                title="${ctx.esc(ctx.t("snapPrintCancel") || "Cancel")}">
          <span class="icon icon-stop icon-14"></span>
          <span class="hold-progress"></span>
        </button>` : "";
  const actionBtns = `<div class="cre-actions elg-job-actions">${filesBtn}${infoBtn}${lightBtn}${jobBtns}</div>`;

  return `
    <div class="snap-job snap-job--${ctx.esc(jobState)}">
      <div class="snap-job-thumb"${thumbUrl ? ` style="background-image:url('${ctx.esc(thumbUrl)}')"` : ""}></div>
      <div class="snap-job-info">
        <div class="elg-job-name-row elg-job-name-row--with-btns">
          ${nameLine}
          ${actionBtns}
        </div>
        <div class="snap-job-stats">
          <span class="snap-job-pct">${pct}%</span>
          <span class="snap-job-time">${ctx.SNAP_ICON_CLOCK} <span>${ctx.esc(timeText)}</span></span>
        </div>
        <div class="snap-job-bar"><span style="width:${pct}%"></span></div>
        <div class="snap-job-foot">
          <span class="snap-job-state snap-job-state--${ctx.esc(jobState)}">${ctx.esc(stateLabel)}</span>
          ${layerText ? `<span class="snap-job-layers">${ctx.esc(layerText)}</span>` : ""}
        </div>
      </div>
    </div>`;
}

export function renderFfgTempCard(conn) {
  const d = conn.data;
  // All temperatures in ONE wrapping row so they sit side by side and wrap
  // (E1 + BED together on the AD5X; T1…Tn + BED + CASE wrap on the Creator 5 Pro).
  const pills = [];
  // Nozzles — like Snapmaker: one labelled pill per nozzle with its temp.
  // Tool-changer (Creator 5 Pro) → one pill per tool (T1…Tn), active highlighted.
  // Single-nozzle models → one "E1" pill.
  if (d.toolChanger && Array.isArray(d.filaments)) {
    for (const fil of d.filaments) {
      if (fil.slotKind !== "tool") continue;
      const cur = fil.nozzleTemp, tgt = fil.nozzleTarget;
      if (typeof cur !== "number" && typeof tgt !== "number") continue;
      const heating = (typeof tgt === "number" && tgt > 0 && typeof cur === "number" && cur < tgt - 1);
      pills.push(`
        <div class="snap-temp${heating ? " snap-temp--heating" : ""}${fil.isActive ? " snap-temp--active" : ""}">
          <span class="snap-temp-label">T${ctx.esc(fil.slotId)}</span>
          ${ctx.SNAP_ICON_NOZZLE}
          <span class="snap-temp-val">${ctx.esc(ffgFmtTempPair(cur, tgt))}</span>
        </div>`);
    }
  } else if (typeof d.temps.e1_temp === "number") {
    pills.push(`
      <div class="snap-temp">
        <span class="snap-temp-label">E1</span>
        ${ctx.SNAP_ICON_NOZZLE}
        <span class="snap-temp-val">${ctx.esc(ffgFmtTempPair(d.temps.e1_temp, d.temps.e1_target))}</span>
      </div>`);
  }
  if (typeof d.temps.bed_temp === "number") {
    pills.push(`
      <div class="snap-temp snap-temp--bed">
        <span class="snap-temp-label">BED</span>
        ${ctx.SNAP_ICON_BED}
        <span class="snap-temp-val">${ctx.esc(ffgFmtTempPair(d.temps.bed_temp, d.temps.bed_target))}</span>
      </div>`);
  }
  // Always show the chamber (CASE), even on open-frame models (it just reads
  // 0/0°C there) — per user preference.
  if (typeof d.temps.chamber_temp === "number") {
    pills.push(`
      <div class="snap-temp snap-temp--chamber">
        <span class="snap-temp-label">CASE</span>
        ${ctx.SNAP_ICON_CHAMBER}
        <span class="snap-temp-val">${ctx.esc(ffgFmtTempPair(d.temps.chamber_temp, d.temps.chamber_target))}</span>
      </div>`);
  }

  if (!pills.length) return "";
  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapTemperatureTitle"))}</h4>
      <div class="snap-temps">${pills.join("")}</div>
    </section>`;
}

// Status / control strip — fans + door. Rendered ABOVE the temperature card
// (with the controls), like the Bambu Lab control card. FlashForge exposes no
// fan-control command, so the −/+ are shown disabled (grey) — display only.
export function renderFfgStatusCard(conn) {
  if (conn.status !== "connected") return "";
  const d = conn.data;
  const fans = d.fans || {};
  const fanCol = (labelKey, fallback, pct) => `
    <div class="ffg-fan-col">
      <div class="ffg-fan-col-head">
        <span class="icon icon-fan icon-16${pct > 0 ? " ffg-fan-on" : ""}"></span>
        <span class="ffg-fan-col-label">${ctx.esc(ctx.t(labelKey) || fallback)}</span>
      </div>
      <div class="ffg-fan-col-controls">
        <button type="button" class="ffg-fan-step-btn" disabled aria-disabled="true">−</button>
        <span class="ffg-fan-pct">${Math.round(pct)}%</span>
        <button type="button" class="ffg-fan-step-btn" disabled aria-disabled="true">+</button>
      </div>
    </div>`;
  // Each item is gated on ITS OWN data, not a chamber heuristic: chamber fan
  // only when chamberFanSpeed is reported, door only when doorStatus is.
  const fanCols = [];
  if (typeof fans.cooling === "number") fanCols.push(fanCol("ffgFanCooling", "Fan", fans.cooling));
  if (typeof fans.chamber === "number") fanCols.push(fanCol("ffgFanChamber", "Chamber", fans.chamber));

  let doorChip = "";
  if (d.doorStatus === "open" || d.doorStatus === "close") {
    const open = d.doorStatus === "open";
    const lbl = open ? (ctx.t("ffgDoorOpen") || "Door open") : (ctx.t("ffgDoorClosed") || "Door closed");
    doorChip = `
      <div class="ffg-chip ffg-door-chip${open ? " is-open" : ""}" title="${ctx.esc(lbl)}">
        <span class="icon icon-lock icon-13"></span>
        <span>${ctx.esc(lbl)}</span>
      </div>`;
  }

  if (!fanCols.length && !doorChip) return "";
  return `
    <section class="snap-block ffg-status-block">
      ${fanCols.length ? `<div class="ffg-fan-row">${fanCols.join("")}</div>` : ""}
      ${doorChip ? `<div class="ffg-status-row">${doorChip}</div>` : ""}
    </section>`;
}

export function renderFfgFilamentCard(p, conn) {
  const d = conn.data;
  const filCards = [];
  const fils = Array.isArray(d.filaments) ? d.filaments : [];
  for (let i = 0; i < fils.length; i++) {
    const fil  = fils[i] || {};
    const has  = !!fil.hasFilament;
    const color = fil.color || null;
    const hasMeta = !!(color || fil.type);
    const isMulti = fils.length > 1;
    if (!has && !hasMeta && !isMulti) continue;
    const fg    = (has && color) ? ctx.snapTextColor(color) : "var(--text)";
    const slotId = fil.slotId || (i + 1);
    const squareLabel = has
      ? (fil.type || ctx.t("snapNoFilament"))
      : (hasMeta ? (ctx.t("ffgSlotEmpty") || "Empty") : ctx.t("snapNoFilament"));
    const typeAndSub = fil.type || "—";
    let squareCls = "snap-fil-square";
    let squareStyle = "";
    if (has && color) {
      squareCls += " snap-fil-square--filled";
      squareStyle = `background:${ctx.esc(color)};color:${ctx.esc(fg)};`;
    } else if (hasMeta && color) {
      squareCls += " snap-fil-square--configured";
      squareStyle = `box-shadow: inset 0 0 0 4px ${ctx.esc(color)};`;
    } else {
      squareCls += " snap-fil-square--empty";
    }
    const vendorRow = fil.vendor
      ? `<div class="snap-fil-vendor">${ctx.esc(fil.vendor)}</div>`
      : "";
    const slotTag = fil.slotKind === "ext"
      ? "Ext."
      : fil.slotKind === "tool"
      ? `T${slotId}`                               // tool-changer nozzle (Creator 5 Pro)
      : fil.slotKind === "ms"
      ? `1${"ABCD"[(slotId - 1) | 0] || ""}`
      : "E1";
    // Per-tool nozzle temperature now lives in the Temperature block (T1…Tn
    // pills, like Snapmaker) — not duplicated on the filament card.
    filCards.push(`
      <div class="snap-fil snap-fil--editable${fil.isActive ? " snap-fil--active" : ""}"
           data-ffg-fil-edit="1"
           data-extruder-idx="${i}"
           data-slot-id="${slotId}"
           data-slot-kind="${ctx.esc(fil.slotKind || "ext")}"
           title="${ctx.esc(ctx.t("snapFilEditableTip"))}">
        <div class="snap-fil-tag">${ctx.esc(slotTag)}</div>
        <div class="${squareCls}" style="${squareStyle}">
          <span class="snap-fil-main">${ctx.esc(squareLabel)}</span>
        </div>
        <div class="snap-fil-meta">
          <span class="snap-fil-status icon icon-edit icon-13" aria-hidden="true"></span>
          ${vendorRow}
          <div class="snap-fil-sub">${ctx.esc(typeAndSub)}</div>
        </div>
      </div>`);
  }
  if (!filCards.length) return "";
  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapFilamentTitle"))}</h4>
      <div class="snap-fil-grid">${filCards.join("")}</div>
    </section>`;
}

// On-board file management moved to a bottom-sheet (openFlashforgeFiles in
// index.js), opened by the folder button on the job card — mirrors Creality.
