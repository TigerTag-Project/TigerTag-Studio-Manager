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
  // Don't render an idle job card before any print report ever arrived —
  // the panel stays compact for a printer that is just sitting there.
  if (!isActive && !d.printFilename) return "";

  const pct      = isActive ? Math.round(+(d.progress || 0)) : 0;
  const leafName = isActive && d.printFilename ? d.printFilename : "";

  const fallbackImg = ctx.printerImageUrlFor(p.brand, p.printerModelId)
                   || ctx.printerImageUrl(ctx.findPrinterModel(p.brand, "0"));
  const thumbUrl = fallbackImg || "";

  const layerText = isActive && (d.currLayer || d.totalLayers)
    ? `${d.currLayer || 0}/${d.totalLayers || 0}` : "";
  const timeText = isActive ? _acuFmtDuration((d.remainTime || 0) * 60) : "—";
  const stateLabel = ctx.t("snapState_" + state) || state;

  const nameLine = leafName
    ? `<div class="snap-job-name" title="${ctx.esc(leafName)}">${ctx.esc(leafName)}</div>`
    : `<div class="snap-job-name snap-job-name--idle">${ctx.esc(ctx.t("snapJobNoActive") || "—")}</div>`;

  return `
    <div class="snap-job snap-job--${ctx.esc(state)}">
      ${thumbUrl ? `<div class="snap-job-thumb" style="background-image:url('${ctx.esc(thumbUrl)}')"></div>` : ""}
      <div class="snap-job-info">
        ${nameLine}
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
  const pills = [];

  // Nozzle
  if (d.nozzleCurrent != null || d.nozzleTarget != null) {
    const heating = typeof d.nozzleTarget === "number" && d.nozzleTarget > 0
                 && typeof d.nozzleCurrent === "number" && d.nozzleCurrent < d.nozzleTarget - 1;
    pills.push(`
      <div class="snap-temp${heating ? " snap-temp--heating" : ""}">
        ${ctx.SNAP_ICON_NOZZLE}
        <span class="snap-temp-val">${ctx.esc(_acuFmtTempPair(d.nozzleCurrent, d.nozzleTarget))}</span>
      </div>`);
  }

  // Bed
  if (d.bedCurrent != null || d.bedTarget != null) {
    const heating = typeof d.bedTarget === "number" && d.bedTarget > 0
                 && typeof d.bedCurrent === "number" && d.bedCurrent < d.bedTarget - 1;
    pills.push(`
      <div class="snap-temp snap-temp--bed${heating ? " snap-temp--heating" : ""}">
        ${ctx.SNAP_ICON_BED}
        <span class="snap-temp-val">${ctx.esc(_acuFmtTempPair(d.bedCurrent, d.bedTarget))}</span>
      </div>`);
  }

  if (!pills.length) return "";
  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapTemperatureTitle"))}</h4>
      <div class="snap-temps">${pills.join("")}</div>
    </section>`;
}

// ── Filament / ACE card ───────────────────────────────────────────────────

export function renderAcuFilamentCard(_p, conn) {
  const boxes = conn?.data?.boxes;
  if (!Array.isArray(boxes) || !boxes.length) return "";

  // External spool holder reports as box id -1; ACE units are 0..N-1.
  const extBox  = boxes.find(b => b.id === -1) || null;
  const aceMods = boxes.filter(b => b.id !== -1).sort((a, b) => a.id - b.id);

  // ── slot renderer ──────────────────────────────────────────────────────
  const makeSlot = (tag, s, boxId, slotIdx) => {
    const color   = s?.color ?? null;
    const fg      = color ? _acuTextColor(color) : "var(--text)";
    const isEmpty = !color && !s?.type;
    const label   = isEmpty ? "?" : (s?.type || "—");
    const editAttrs = `data-acu-fil-edit="1" data-box-id="${boxId}" data-slot-id="${slotIdx}"`;
    return `
      <div class="snap-fil snap-fil--editable" ${editAttrs}>
        <div class="snap-fil-tag">${ctx.esc(tag)}</div>
        <div class="snap-fil-square${color ? "" : " snap-fil-square--empty"}"
             style="${color ? `background:${ctx.esc(color)};color:${ctx.esc(fg)};border-color:${ctx.esc(color)};` : ""}">
          <span class="snap-fil-main">${ctx.esc(label)}</span>
        </div>
        <div class="snap-fil-meta">
          <span class="snap-fil-status icon icon-edit icon-13" aria-hidden="true"></span>
          ${s?.type ? `<div class="snap-fil-sub">${ctx.esc(s.type)}</div>` : ""}
        </div>
      </div>`;
  };

  // Invisible placeholders that keep the columns aligned across rows.
  const extSpacer = `<div class="snap-fil cre-fil-spacer" aria-hidden="true"></div>`;
  const filSpacer = `<div class="snap-fil bbl-fil-spacer" aria-hidden="true"></div>`;

  // One ACE unit row — always 4 cells (slots 0..3), empty ones as spacers.
  const makeAceRow = (box, rowLetter) => {
    const byIdx = new Map((box?.slots || []).map(s => [Number(s.index), s]));
    const cells = [];
    for (let i = 0; i < 4; i++) {
      const s = byIdx.get(i);
      cells.push(s ? makeSlot(`${rowLetter}${i + 1}`, s, box.id, i) : filSpacer);
    }
    return cells.join("");
  };

  const rows = [];

  // ── Row 1: Ext. (only if the printer reports box -1) + first ACE ──────
  {
    const row1 = [];
    if (extBox) {
      const extSlot = (extBox.slots || [])[0] || null;
      row1.push(makeSlot("Ext.", extSlot, -1, 0));
    }
    if (aceMods.length > 0) row1.push(makeAceRow(aceMods[0], "A"));
    if (row1.length) rows.push(`<div class="cre-fil-row">${row1.join("")}</div>`);
  }

  // ── Rows 2+: extra ACE units; Ext. column stays empty when present ────
  for (let mi = 1; mi < aceMods.length; mi++) {
    const rowLetter = String.fromCharCode(65 + mi); // 'B', 'C', …
    rows.push(`<div class="cre-fil-row">${extBox ? extSpacer : ""}${makeAceRow(aceMods[mi], rowLetter)}</div>`);
  }

  if (!rows.length) return "";

  // ACE temperature meta — shown in the title only for a single unit.
  let meta = "";
  if (aceMods.length === 1 && Number.isFinite(aceMods[0].temp)) {
    meta = `<span class="snap-block-meta">${ctx.esc(String(aceMods[0].temp))}°C</span>`;
  }

  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapFilamentTitle"))}${meta}</h4>
      <div class="cre-fil-rows">${rows.join("")}</div>
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
