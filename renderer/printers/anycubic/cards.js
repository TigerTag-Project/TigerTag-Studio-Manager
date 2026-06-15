/**
 * printers/anycubic/cards.js — Anycubic live-block card widgets.
 *
 * Three card renderers: job, temperature, ACE filament — fed by the print /
 * tempature / multiColorBox report families parsed in index.js
 * (PROTOCOL.md §5b). Uses the existing .snap-* / .cre-fil-* CSS classes so
 * no new stylesheets are needed. Reads from `ctx` at call time — never
 * destructured at module scope.
 *
 * Filament layout mirrors the Bambu/Creality pattern:
 *   Row 1 : [Ext.] [A1] [A2] [A3] [A4]  ← external spool (box -1) + first ACE
 *   Row 2+: [    ] [B1] [B2] [B3] [B4]  ← spacer + next ACE unit
 * Slots are clickable (data-acu-fil-edit) → setInfo bottom sheet.
 */
import { ctx } from '../context.js';

// ── Job card ──────────────────────────────────────────────────────────────

export function renderAcuJobCard(p, conn) {
  if (conn.status !== "connected") return "";
  const d = conn.data;
  const state    = d.printState || "idle";
  const isActive = ["printing", "preparing", "busy", "paused"].includes(state);
  const isPaused = state === "paused";
  // Always render the Print card (even idle) so its controls stay available —
  // pause/resume/stop only appear while a job is active.
  const pct      = isActive ? Math.round(+(d.progress || 0)) : 0;
  const leafName = isActive && d.printFilename ? d.printFilename : "";

  const fallbackImg = ctx.printerImageUrlFor(p.brand, p.printerModelId)
                   || ctx.printerImageUrl(ctx.findPrinterModel(p.brand, "0"));
  // Active-job preview (cloud signed S3 URL) when printing; else the model render.
  const thumbUrl = d.printThumb || fallbackImg || "";

  const layerText = isActive && (d.currLayer || d.totalLayers)
    ? `${d.currLayer || 0}/${d.totalLayers || 0}` : "";
  const timeText = isActive ? _acuFmtDuration((d.remainTime || 0) * 60) : "—";
  const stateLabel = ctx.t("snapState_" + state) || state;

  const nameLine = leafName
    ? `<div class="snap-job-name" title="${ctx.esc(leafName)}">${ctx.esc(leafName)}</div>`
    : `<div class="snap-job-name snap-job-name--idle">${ctx.esc(ctx.t("snapJobNoActive") || "—")}</div>`;

  // Pause/Resume/Stop — only while a job is active. Mirrors the Snapmaker /
  // Elegoo job-card buttons (reuses .cre-action-btn styling); wired in the
  // delegated click handler via data-acu-print.
  const actionBtns = isActive ? `
        <div class="cre-actions elg-job-actions">
          <button type="button" class="cre-action-btn cre-action-btn--pause"
                  data-acu-print="${isPaused ? "resume" : "pause"}"
                  title="${isPaused ? ctx.esc(ctx.t("snapPrintResume") || "Resume") : ctx.esc(ctx.t("snapPrintPause") || "Pause")}">
            <span class="icon ${isPaused ? "icon-play" : "icon-pause"} icon-14"></span>
          </button>
          <button type="button" class="cre-action-btn cre-action-btn--stop"
                  data-acu-print="stop"
                  title="${ctx.esc(ctx.t("snapPrintCancel") || "Cancel")}">
            <span class="icon icon-stop icon-14"></span>
          </button>
        </div>` : "";

  return `
    <div class="snap-job snap-job--${ctx.esc(state)}">
      ${thumbUrl ? `<div class="snap-job-thumb" style="background-image:url('${ctx.esc(thumbUrl)}')"></div>` : ""}
      <div class="snap-job-info">
        <div class="elg-job-name-row${actionBtns ? " elg-job-name-row--with-btns" : ""}">
          ${nameLine}
          ${actionBtns}
        </div>
        <div class="snap-job-stats">
          <span class="snap-job-pct">${pct}%</span>
          <span class="snap-job-time">${ctx.SNAP_ICON_CLOCK} <span>${ctx.esc(timeText)}</span></span>
        </div>
        <div class="snap-job-bar"><span style="width:${pct}%"></span></div>
        <div class="snap-job-foot">
          <span class="snap-job-state snap-job-state--${ctx.esc(state)}">${ctx.esc(stateLabel)}</span>
          ${layerText ? `<span class="snap-job-layers">${ctx.esc(layerText)}</span>` : ""}
        </div>
      </div>
    </div>`;
}

// ── Temperature card ──────────────────────────────────────────────────────

export function renderAcuTempCard(conn) {
  if (conn.status !== "connected") return "";
  const d = conn.data;
  const tip = ctx.t("snapTempEditTip") || "Click to set target temperature";

  // Always render both pills (even with no reading yet) so the controls stay
  // available. Each pill is clickable → inline target input (wired in the
  // delegated handler via data-acu-set-temp), mirroring the Snapmaker UX.
  const nozzleHeating = typeof d.nozzleTarget === "number" && d.nozzleTarget > 0
                     && typeof d.nozzleCurrent === "number" && d.nozzleCurrent < d.nozzleTarget - 1;
  const nozzleTgt = typeof d.nozzleTarget === "number" ? Math.round(d.nozzleTarget) : 0;
  const bedHeating = typeof d.bedTarget === "number" && d.bedTarget > 0
                  && typeof d.bedCurrent === "number" && d.bedCurrent < d.bedTarget - 1;
  const bedTgt = typeof d.bedTarget === "number" ? Math.round(d.bedTarget) : 0;

  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapTemperatureTitle"))}</h4>
      <div class="snap-temps">
        <div class="snap-temp snap-temp--editable${nozzleHeating ? " snap-temp--heating" : ""}"
             data-acu-set-temp="nozzle" data-acu-temp-target="${nozzleTgt}" data-acu-temp-max="300"
             title="${ctx.esc(tip)}">
          ${ctx.SNAP_ICON_NOZZLE}
          <span class="snap-temp-val">${ctx.esc(_acuFmtTempPair(d.nozzleCurrent, d.nozzleTarget))}</span>
        </div>
        <div class="snap-temp snap-temp--bed snap-temp--editable${bedHeating ? " snap-temp--heating" : ""}"
             data-acu-set-temp="bed" data-acu-temp-target="${bedTgt}" data-acu-temp-max="110"
             title="${ctx.esc(tip)}">
          ${ctx.SNAP_ICON_BED}
          <span class="snap-temp-val">${ctx.esc(_acuFmtTempPair(d.bedCurrent, d.bedTarget))}</span>
        </div>
      </div>
    </section>`;
}

// ── Filament / ACE card ───────────────────────────────────────────────────

export function renderAcuFilamentCard(_p, conn) {
  const d = conn?.data || {};
  const realBoxes = Array.isArray(d.boxes) ? d.boxes : [];

  // A printer with NO ACE (e.g. a Kobra 3) reports only a standalone external
  // spool, via the `extfilbox` channel, not multiColorBox. Synthesize a box -1
  // for it so it shows — but only if multiColorBox didn't already report an
  // external box -1 (ACE printers put their external box there).
  const hasExtBox = realBoxes.some(b => b.id === -1);
  let boxes = realBoxes;
  if (!hasExtBox && d.extShelf) {
    boxes = [{ id: -1, modelId: null, temp: null,
               slots: [{ index: 0, type: d.extShelf.type, color: d.extShelf.color }] }, ...realBoxes];
  }
  if (!boxes.length) return "";

  // Each box is its own row with all of its slots. The "external" box reports
  // as id -1 and is itself a multi-slot unit (e.g. the Kobra X / ACE Pro 2
  // external box has 4 slots) — so it must NOT be collapsed to a single cell.
  // Order: external (-1) first, then ACE units 0,1,2,… ascending.
  const sorted = [...boxes].sort((a, b) => {
    if (a.id === b.id) return 0;
    if (a.id === -1) return -1;
    if (b.id === -1) return 1;
    return a.id - b.id;
  });

  // ── slot renderer ──────────────────────────────────────────────────────
  const makeSlot = (tag, s, boxId, slotIdx) => {
    const color   = s?.color ?? null;
    const fg      = color ? _acuTextColor(color) : "var(--text)";
    const hasCfg  = !!(color || s?.type);
    const isEmpty = !hasCfg;
    // ACE slot status — 5 = mounted/loaded, anything else (e.g. 4) = configured
    // but NOT mounted. A not-mounted slot keeps its colour as the border, but
    // the fill turns grey with a "?"; the material still shows under the edit
    // icon. status === null (e.g. synthesized external box) stays "mounted".
    const notMounted = hasCfg && s?.status != null && s.status !== 5;
    const label   = (isEmpty || notMounted) ? "?" : (s?.type || "—");
    const editAttrs = `data-acu-fil-edit="1" data-box-id="${boxId}" data-slot-id="${slotIdx}"`;
    let squareCls = "snap-fil-square";
    let squareStyle = "";
    if (notMounted) {
      squareCls += " snap-fil-square--unmounted";
      if (color) squareStyle = `border-color:${ctx.esc(color)};`;   // real colour as contour, grey fill from CSS
    } else if (color) {
      squareStyle = `background:${ctx.esc(color)};color:${ctx.esc(fg)};border-color:${ctx.esc(color)};`;
    } else {
      squareCls += " snap-fil-square--empty";
    }
    return `
      <div class="snap-fil snap-fil--editable" ${editAttrs}>
        <div class="snap-fil-tag">${ctx.esc(tag)}</div>
        <div class="${squareCls}" style="${squareStyle}">
          <span class="snap-fil-main">${ctx.esc(label)}</span>
        </div>
        <div class="snap-fil-meta">
          <span class="snap-fil-status icon icon-edit icon-13" aria-hidden="true"></span>
          ${s?.type ? `<div class="snap-fil-sub">${ctx.esc(s.type)}</div>` : ""}
        </div>
      </div>`;
  };

  // Invisible placeholder for a slot the box doesn't have (keeps rows aligned).
  const filSpacer = `<div class="snap-fil bbl-fil-spacer" aria-hidden="true"></div>`;

  // Per-box label prefix on each slot tag: external box → "E", ACE units →
  // A / B / C / … by id. (Box -1 = external, 0 = first ACE, 1 = second, …)
  const tagPrefix = (boxId) => boxId === -1 ? "E" : String.fromCharCode(65 + boxId);

  // One box row. ACE units always show their 4 slots (spacers for any missing);
  // the external box (id -1) shows its ACTUAL slot count — 4 on a Kobra X, just
  // 1 on a Kobra 3 — so we don't paint phantom empty external slots.
  const makeBoxRow = (box) => {
    const slots = box?.slots || [];
    const byIdx = new Map(slots.map(s => [Number(s.index), s]));
    const pre = tagPrefix(box.id);
    const count = box.id === -1 ? Math.max(1, slots.length) : 4;
    const cells = [];
    for (let i = 0; i < count; i++) {
      const s = byIdx.get(i);
      cells.push(s ? makeSlot(`${pre}${i + 1}`, s, box.id, i) : filSpacer);
    }
    // Multi-slot rows (ACE unit, or the Kobra X 4-slot external box) fill the
    // full width; a lone external spool keeps the capped width.
    const rowCls = count > 1 ? "cre-fil-row cre-fil-row--fill" : "cre-fil-row";
    return `<div class="${rowCls}">${cells.join("")}</div>`;
  };

  const rows = sorted.map(makeBoxRow);
  if (!rows.length) return "";

  // Temperature meta — show the highest ACE-unit temp (external box has no
  // heater). Kept compact in the title.
  let meta = "";
  const temps = sorted.filter(b => b.id !== -1 && Number.isFinite(b.temp)).map(b => b.temp);
  if (temps.length) {
    meta = `<span class="snap-block-meta">${ctx.esc(String(Math.max(...temps)))}°C</span>`;
  }

  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapFilamentTitle"))}${meta}</h4>
      <div class="cre-fil-rows">${rows.join("")}</div>
    </section>`;
}

// ── Control card (jog pad + light + motors-off + fan) ──────────────────────
// Reuses the Elegoo/Snapmaker jog-pad + fan CSS (.elg-jog-*, .elg-fan-*,
// .cre-action-btn) so no new stylesheet is needed. Commands wired in the
// delegated click handler via data-acu-jog / data-acu-home / data-acu-light /
// data-acu-motors-off / data-acu-fan-*; the jog step is read live from the
// #acuCtrlStep <select> at click time (no re-render).

export function renderAcuControlCard(_p, conn) {
  if (conn?.status !== "connected") return "";
  const d      = conn.data || {};
  const ledOn  = !!d.lightOn;
  const ledTip = ctx.esc(ledOn ? (ctx.t("creLedOnTip") || "Turn off light")
                               : (ctx.t("creLedOffTip") || "Turn on light"));
  const offTip = ctx.esc(ctx.t("acuMotorsOff") || "Disable motors");
  const fanPct = Math.max(0, Math.min(100, Math.round(Number(d.fanSpeedPct) || 0)));
  const fanLbl = ctx.esc(ctx.t("acuFanTitle") || "Fan");
  const speedMode = [1, 2, 3].includes(Number(d.speedMode)) ? Number(d.speedMode) : 2;
  const speedOpts = [
    [1, ctx.t("acuSpeedSilent")   || "Silent"],
    [2, ctx.t("acuSpeedStandard") || "Standard"],
    [3, ctx.t("acuSpeedSport")    || "Sport"],
  ];

  return `
    <section class="snap-block elg-ctrl acu-ctrl">
      <div class="elg-jog-wrap">

        <!-- LEFT — XYZ homing + disable motors (mirrors slicer "Axis Move") -->
        <div class="acu-jog-side">
          <button type="button" class="cre-action-btn elg-ctrl-action"
                  data-acu-home="all" data-acu-tip="${ctx.esc(ctx.t("acuHomeXyz") || "XYZ axis homing")}">
            <span class="icon icon-home icon-16" aria-hidden="true"></span>
          </button>
          <button type="button" class="cre-action-btn elg-ctrl-action"
                  data-acu-motors-off="1" data-acu-tip="${offTip}">
            <span class="icon icon-bolt icon-16" aria-hidden="true"></span>
          </button>
        </div>

        <!-- CENTER — XY circle -->
        <div class="elg-jog-xy-circle">
          <button class="elg-jog-xy-btn elg-jog-xy-btn--n" data-acu-jog="y" data-acu-dir="+" title="Y+">Y+</button>
          <button class="elg-jog-xy-btn elg-jog-xy-btn--s" data-acu-jog="y" data-acu-dir="-" title="Y−">Y−</button>
          <button class="elg-jog-xy-btn elg-jog-xy-btn--w" data-acu-jog="x" data-acu-dir="-" title="X−">X−</button>
          <button class="elg-jog-xy-btn elg-jog-xy-btn--e" data-acu-jog="x" data-acu-dir="+" title="X+">X+</button>
          <button class="elg-jog-home-btn elg-jog-home-btn--xy" data-acu-home="xy" data-acu-tip="${ctx.esc(ctx.t("acuHomeXy") || "XY axis homing")}">
            <span class="icon icon-home elg-home-icon" aria-hidden="true"></span>
          </button>
          <div class="elg-jog-sector elg-jog-sector--n" aria-hidden="true"></div>
          <div class="elg-jog-sector elg-jog-sector--s" aria-hidden="true"></div>
          <div class="elg-jog-sector elg-jog-sector--w" aria-hidden="true"></div>
          <div class="elg-jog-sector elg-jog-sector--e" aria-hidden="true"></div>
        </div>

        <!-- RIGHT — Z pill (Z+ / home-Z / Z−) -->
        <div class="elg-jog-z-pill">
          <button class="elg-jog-z-btn" data-acu-jog="z" data-acu-dir="+" title="Z+">Z↑</button>
          <button class="elg-jog-home-btn" data-acu-home="Z" data-acu-tip="${ctx.esc(ctx.t("acuHomeZ") || "Z axis homing")}">
            <span class="icon icon-home elg-home-icon" aria-hidden="true"></span>
          </button>
          <button class="elg-jog-z-btn" data-acu-jog="z" data-acu-dir="-" title="Z−">Z↓</button>
        </div>

        <!-- FAR RIGHT — light toggle (top) + jog step (below) -->
        <div class="acu-jog-extra">
          <button type="button" class="cre-action-btn cre-action-btn--led elg-ctrl-action${ledOn ? " cre-action-btn--led-on" : ""}"
                  data-acu-light="1" data-acu-tip="${ledTip}">
            <span class="icon icon-bulb icon-16" aria-hidden="true"></span>
          </button>
          <div class="elg-ctrl-speed-row">
            <span class="elg-ctrl-speed-label">${ctx.esc(ctx.t("elgCtrlStep") || "Step")}</span>
            <select class="elg-ctrl-speed-select" id="acuCtrlStep">
              ${[1, 10, 50].map(s => `<option value="${s}"${s === 10 ? " selected" : ""}>${s} mm</option>`).join("")}
            </select>
          </div>
          <div class="elg-ctrl-speed-row">
            <span class="elg-ctrl-speed-label">${ctx.esc(ctx.t("acuSpeedMode") || "Speed")}</span>
            <select class="elg-ctrl-speed-select" data-acu-speed="1">
              ${speedOpts.map(([v, lbl]) => `<option value="${v}"${v === speedMode ? " selected" : ""}>${ctx.esc(lbl)}</option>`).join("")}
            </select>
          </div>
        </div>

      </div>

      <!-- Part-cooling fan — toggle + −/+ (PROTOCOL.md §5d fan/setSpeed). -->
      <div class="elg-fan-section">
        <div class="elg-fan-cols">
          <div class="elg-fan-col">
            <div class="elg-fan-col-head">
              <button type="button" class="elg-fan-icon-btn${fanPct > 0 ? " elg-fan-icon-btn--on" : ""}"
                      data-acu-fan-toggle="1" aria-label="${fanLbl}">
                <span class="icon icon-fan icon-16" aria-hidden="true"></span>
              </button>
              <span class="elg-fan-col-label">${fanLbl}</span>
            </div>
            <div class="elg-fan-col-controls">
              <button type="button" class="elg-fan-step-btn" data-acu-fan-step="1" data-dist="-10" aria-label="−">−</button>
              <span class="elg-fan-pct" data-acu-fan-pct="1">${fanPct}%</span>
              <button type="button" class="elg-fan-step-btn" data-acu-fan-step="1" data-dist="10" aria-label="+">+</button>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

// ── Private helpers ───────────────────────────────────────────────────────

function _acuFmtTemp(v) {
  return (typeof v === "number" && v >= 0) ? `${Math.round(v)}` : "—";
}
function _acuFmtTempPair(cur, tgt) {
  return `${_acuFmtTemp(cur)}/${_acuFmtTemp(tgt)}°C`;
}
function _acuFmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

function _acuTextColor(hex) {
  if (!hex || hex.length < 7) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.55 ? "#000" : "#fff";
}
