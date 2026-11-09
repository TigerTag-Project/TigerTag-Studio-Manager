/**
 * printers/bambulab/cards.js — Bambu Lab live-block card widgets.
 *
 * Three card renderers: job, temperature, filament/AMS.
 * All use the existing .snap-* CSS classes so no new stylesheets needed.
 * Read from `ctx` at call time — never destructure at module scope.
 */
import { ctx } from '../context.js';
import { jobBar, jobBarFill } from '../job-bar.js';

/** Bays on one AMS module: 9 on an AMS 3H (H3C), 1 on an AMS HT, otherwise 4. The module's
 *  own tray list tells an HT apart; the 3H is told by its module name (n10a, see
 *  _bblParseModules) or by carrying more than four trays. */
/** A single external spool exists on every Bambu EXCEPT the H3C (catalogue id 14): its nine tools
 *  are fed by the AMS 3H's nine bays, and extra AMS units hang off tool 1 — there is no spool
 *  holder. Show an Ext. tile there only if the machine itself reports one (vt_tray / vir_slot). */
export function bambuHasExt(conn) {
  return Number(conn?.modelId) !== 14 || !!conn?.data?.externalTray;
}

export function bambuBayCount(m, d) {
  const n = (m?.tray || []).length;
  if (d?.amsType?.[String(m?.id)] === '3h' || n > 4) return 9;
  return n === 1 ? 1 : 4;
}

// ── Job card ──────────────────────────────────────────────────────────────

export function renderBambuJobCard(p, conn) {
  if (conn.status !== "connected") return "";
  const d = conn.data;
  const state    = d.printState || "idle";
  const isActive = ["printing", "preparing", "busy", "paused"].includes(state);
  // Blue while running, green at 100 % when done, red frozen at its last % on a failure.
  const bar      = jobBar(conn, state, +(d.progress || 0));
  const pct      = isActive || bar.tone !== "idle" ? bar.pct : 0;
  /* The LAST print's name survives the print, not just the current one: a
     finished or idle machine that still shows what it made reads better than an
     empty slot, and the state badge beside it already says the job is over. */
  const leafName = d.printFilename || "";

  const fallbackImg = ctx.printerImageUrlFor(p.brand, p.printerModelId)
                   || ctx.printerImageUrl(ctx.findPrinterModel(p.brand, "0"));
  /* Show the model preview whenever there is one — including once the job is
     over and the machine has gone quiet. It keeps the card's shape, and the last
     thing a printer made is more use than a stock photo of the printer. The
     printer's own photo remains the fallback when nothing has been printed. */
  const thumbUrl = d.printPreviewUrl || fallbackImg || "";

  const layerText = isActive && (d.layerNum || d.totalLayerNum)
    ? `${d.layerNum || 0}/${d.totalLayerNum || 0}` : "";
  // `remainingTime` is `mc_remaining_time`, which Bambu reports in MINUTES —
  // the formatter takes seconds, so a 32-minute job read as 32 seconds and
  // rendered "0m". (The table column got this right via _getPrinterJob, which
  // is why the two views disagreed.)
  const timeText = isActive ? _bblFmtDuration(d.remainingTime * 60) : "—";
  const stateLabel = ctx.t("snapState_" + state) || state;

  const nameLine = leafName
    ? `<div class="snap-job-name" title="${ctx.esc(leafName)}">${ctx.esc(leafName)}</div>`
    : `<div class="snap-job-name snap-job-name--idle">${ctx.esc(ctx.t("snapJobNoActive") || "—")}</div>`;

  // Pause/Resume/Stop — only while a job is active (reuses the Anycubic /
  // Snapmaker .cre-action-btn styling); wired via data-bbl-print.
  const isPaused = state === "paused";
  const actionBtns = (isActive && !_bblReadOnly(conn)) ? `
        <div class="cre-actions elg-job-actions">
          <button type="button" class="cre-action-btn cre-action-btn--pause"
                  data-bbl-print="${isPaused ? "resume" : "pause"}"
                  title="${isPaused ? ctx.esc(ctx.t("snapPrintResume") || "Resume") : ctx.esc(ctx.t("snapPrintPause") || "Pause")}">
            <span class="icon ${isPaused ? "icon-play" : "icon-pause"} icon-14"></span>
          </button>
          <button type="button" class="cre-action-btn cre-action-btn--stop"
                  data-bbl-print="stop"
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
        <div class="snap-job-bar">${jobBarFill(bar)}</div>
        <div class="snap-job-foot">
          <span class="snap-job-state snap-job-state--${ctx.esc(state)}">${ctx.esc(stateLabel)}</span>
          ${layerText ? `<span class="snap-job-layers">${ctx.esc(layerText)}</span>` : ""}
        </div>
      </div>
    </div>`;
}

// ── Temperature card ──────────────────────────────────────────────────────

/* A CLOUD connection is READ-ONLY. Measured on an X1C: of everything this
   driver can publish through the account broker, only the light answers — the
   setpoints, the jog, the homing, the fans and a slot's filament are all
   ignored, silently, because a refused command is never reported back. A
   control that does nothing is worse than no control, so the cloud cards show
   the machine and offer only what it actually accepts. LAN is unaffected. */
const _bblReadOnly = conn => conn?.cloud === true;

export function renderBambuTempCard(conn, heatedChamber = false) {
  const d = conn.data;
  const ro = _bblReadOnly(conn);
  const pills = [];

  // Nozzle(s) — click a pill to set its target. H2-series have TWO heads
  // (id 0 = right, id 1 = left): one pill each, tagged R/L, the active one
  // highlighted. Single-nozzle models render one pill (no tag, no tool index).
  const nozzles = Array.isArray(d.nozzles) && d.nozzles.length
    ? d.nozzles
    : (d.nozzleCurrent != null || d.nozzleTarget != null)
      ? [{ id: 0, current: d.nozzleCurrent, target: d.nozzleTarget }] : [];
  // H3C "Swaptek" tool changer: nine PrintTools, one pill each (T1…T9) like every other
  // tool changer, the mounted one highlighted. They replace the single legacy nozzle pill —
  // the mounted tool's pill already says the same thing. Each tool takes a setpoint (see below).
  const tools = Array.isArray(d.tools) ? d.tools : [];
  if (tools.length) {
    tools.forEach(t => {
      const heating = typeof t.target === "number" && t.target > 0
                   && typeof t.current === "number" && t.current < t.target - 1;
      // Every tool takes a target, like the two nozzles of an H2C (bambuSetToolTemp).
      const mounted = d.mountedTool === t.addr;
      const canSet = !ro;
      pills.push(`
      <div class="snap-temp${canSet ? " snap-temp--editable" : ""}${heating ? " snap-temp--heating" : ""}${mounted ? " snap-temp--active" : ""}"
           ${canSet ? `data-bbl-set-temp="tool" data-bbl-tool="${t.addr}" data-bbl-temp-target="${Math.max(0, Math.round(Number(t.target) || 0))}" data-bbl-temp-max="300"` : ""}>
        <span class="snap-temp-label">T${t.addr + 1}</span>
        ${ctx.SNAP_ICON_NOZZLE}
        <span class="snap-temp-val">${ctx.esc(_bblFmtTempPair(t.current, t.target))}</span>
      </div>`);
    });
  }
  const dual = nozzles.length > 1;
  // Display order = physical layout: left head (id 1) on the LEFT, right head
  // (id 0) on the RIGHT → render descending by id.
  const ordered = dual ? [...nozzles].sort((a, b) => b.id - a.id) : nozzles;
  (tools.length ? [] : ordered).forEach(n => {
    const heating = typeof n.target === "number" && n.target > 0
                 && typeof n.current === "number" && n.current < n.target - 1;
    const active  = dual && n.id === d.activeNozzle;
    const nozAttr = dual ? ` data-bbl-nozzle="${n.id}"` : "";
    pills.push(`
      <div class="snap-temp${ro ? "" : " snap-temp--editable"}${heating ? " snap-temp--heating" : ""}${active ? " snap-temp--active" : ""}"
           ${ro ? "" : `data-bbl-set-temp="nozzle"${nozAttr} data-bbl-temp-target="${Math.max(0, Math.round(Number(n.target) || 0))}" data-bbl-temp-max="300"`}>
        ${ctx.SNAP_ICON_NOZZLE}
        <span class="snap-temp-val">${ctx.esc(_bblFmtTempPair(n.current, n.target))}</span>
      </div>`);
  });

  // Bed — click pill to set a target.
  if (d.bedCurrent != null || d.bedTarget != null) {
    const heating = typeof d.bedTarget === "number" && d.bedTarget > 0
                 && typeof d.bedCurrent === "number" && d.bedCurrent < d.bedTarget - 1;
    pills.push(`
      <div class="snap-temp snap-temp--bed${ro ? "" : " snap-temp--editable"}${heating ? " snap-temp--heating" : ""}"
           ${ro ? "" : `data-bbl-set-temp="bed" data-bbl-temp-target="${Math.max(0, Math.round(Number(d.bedTarget) || 0))}" data-bbl-temp-max="110"`}>
        ${tools.length ? `<span class="snap-temp-label">BED</span>` : ""}
        ${ctx.SNAP_ICON_BED}
        <span class="snap-temp-val">${ctx.esc(_bblFmtTempPair(d.bedCurrent, d.bedTarget))}</span>
      </div>`);
  }

  // Chamber. On models with an ACTIVELY HEATED chamber (H2 series) the pill is
  // editable → chamber-temperature setpoint. On a passive chamber (X1C) it's
  // read-only. Null on the A1 (no chamber at all).
  if (d.chamberCurrent != null) {
    if (heatedChamber && !ro) {
      const heating = typeof d.chamberTarget === "number" && d.chamberTarget > 0
                   && typeof d.chamberCurrent === "number" && d.chamberCurrent < d.chamberTarget - 1;
      pills.push(`
        <div class="snap-temp snap-temp--chamber snap-temp--editable${heating ? " snap-temp--heating" : ""}"
             data-bbl-set-temp="chamber" data-bbl-temp-target="${Math.max(0, Math.round(Number(d.chamberTarget) || 0))}" data-bbl-temp-max="65">
          ${tools.length ? `<span class="snap-temp-label">CASE</span>` : ""}
          ${ctx.SNAP_ICON_CHAMBER}
          <span class="snap-temp-val">${ctx.esc(_bblFmtTempPair(d.chamberCurrent, d.chamberTarget))}</span>
        </div>`);
    } else {
      pills.push(`
        <div class="snap-temp snap-temp--chamber">
          ${tools.length ? `<span class="snap-temp-label">CASE</span>` : ""}
          ${ctx.SNAP_ICON_CHAMBER}
          <span class="snap-temp-val">${ctx.esc(_bblFmtTemp(d.chamberCurrent))}°C</span>
        </div>`);
    }
  }

  if (!pills.length) return "";
  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapTemperatureTitle"))}</h4>
      <div class="snap-temps">${pills.join("")}</div>
    </section>`;
}

// ── Filament / AMS card ───────────────────────────────────────────────────
//
// Layout mirrors the Creality CFS pattern:
//   Row 1 : [Ext.] [S1] [S2] [S3] [S4]  ← Ext. + first AMS module
//   Row 2+: [    ] [S1] [S2] [S3] [S4]  ← invisible spacer + next AMS
// No AMS  : [Ext.] alone on row 1.

export function renderBambuFilamentCard(_p, conn) {
  // Only when live — offline, the filament/AMS state is unknown (stale/empty),
  // so hide the card entirely (matches the job / control cards).
  if (conn?.status !== "connected") return "";
  const d = conn?.data;
  if (!d) return "";

  // Sort AMS modules by numeric ID so AMS 1 is always row 1.
  const amsMods = [...(d.ams || [])].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

  // ── slot renderer ──────────────────────────────────────────────────────
  const ro = _bblReadOnly(conn);
  const makeSlot = (tag, t, amsId, trayId) => {
    const color  = t?.color ?? null;
    const fg     = color ? _bblTextColor(color) : "var(--text)";
    const active = t?.active ?? false;
    const isEmpty = !color && !t?.type;
    const label  = isEmpty ? "?" : (t?.type || "—");
    const editAttrs = ro ? "" : `data-bbl-fil-edit="1" data-ams-id="${amsId ?? 255}" data-tray-id="${trayId ?? 254}"`;
    return `
      <div class="snap-fil${ro ? "" : " snap-fil--editable"}${active ? " snap-fil--active" : ""}" ${editAttrs}>
        <div class="snap-fil-tag">${ctx.esc(tag)}</div>
        <div class="snap-fil-square${color ? "" : " snap-fil-square--empty"}"
             style="${color ? `background:${ctx.esc(color)};color:${ctx.esc(fg)};border-color:${ctx.esc(color)};` : ""}">
          <span class="snap-fil-main">${ctx.esc(label)}</span>
        </div>
        <div class="snap-fil-meta">
          ${ro ? "" : `<span class="snap-fil-status icon icon-edit icon-13" aria-hidden="true"></span>`}
          ${active ? `<span class="snap-fil-status icon icon-play icon-13"></span>` : ""}
          ${t?.type ? `<div class="snap-fil-sub">${ctx.esc(t.type)}</div>` : ""}
        </div>
      </div>`;
  };

  const hasExt = bambuHasExt(conn);
  // Invisible placeholder that keeps the Ext. column width on rows 2+
  const extSpacer = `<div class="snap-fil cre-fil-spacer" aria-hidden="true"></div>`;

  const rows = [];

  // ── Slot renderer for one AMS module row (always 4 cells) ────────────
  // Mirrors Flutter: `for slotIndex = 0; slotIndex < 4` with empty chips
  // for slots the module doesn't have (AMS HT only has slot 0 = id "0").
  // Fixed count keeps every row at 5 flex children → columns stay aligned.
  const filSpacer = `<div class="snap-fil bbl-fil-spacer" aria-hidden="true"></div>`;

  // The module's OWN id is what `ams_filament_setting` addresses, never its
  // position in the list: an AMS HT reports id 128, so the third unit of a
  // 0 / 1 / 128 setup would otherwise be written to a nonexistent "ams_id 2".
  // `from` = first bay of the row. A row holds five tiles: the Ext. tile + four bays, or — on a
  // machine with no external spool (the H3C) — five bays, so an AMS 3H (9 bays) reads 5 + 4
  // instead of leaving the Ext. column empty. With an Ext. tile it is A1-A4 / A5-A8 / A9.
  const perRow = hasExt ? 4 : 5;
  const makeAmsRow = (mod, rowLetter, from = 0) => {
    const amsId = Number(mod?.id);
    const byId = new Map((mod?.tray || []).map(t => [parseInt(t.id, 10), t]));
    const bays = bambuBayCount(mod, d);
    const cells = [];
    for (let i = from; i < from + perRow; i++) {
      const t = byId.get(i);
      cells.push(i < bays && t ? makeSlot(`${rowLetter}${i + 1}`, t, amsId, i) : filSpacer);
    }
    return cells.join("");
  };
  // Every row of every module: [module index, first bay].
  const amsRowSpecs = [];
  amsMods.forEach((m, mi) => {
    for (let from = 0; from < Math.max(1, bambuBayCount(m, d)); from += perRow) amsRowSpecs.push([mi, from]);
  });

  // ── Row 1: Ext. + first AMS row (or just Ext. if no AMS) ───────────────
  {
    const row1 = hasExt ? [makeSlot("Ext.", d.externalTray ?? null, 255, 254)] : [];
    if (amsRowSpecs.length > 0) {
      const [mi, from] = amsRowSpecs[0];
      row1.push(makeAmsRow(amsMods[mi], String.fromCharCode(65 + mi), from));
    }
    rows.push(`<div class="cre-fil-row">${row1.join("")}</div>`);
  }

  // ── Rows 2+: the rest, Ext. column stays empty (spacer) ────────────────
  for (let ri = 1; ri < amsRowSpecs.length; ri++) {
    const [mi, from] = amsRowSpecs[ri];
    const rowLetter = String.fromCharCode(65 + mi);        // 'A', 'B', …
    rows.push(`<div class="cre-fil-row">${hasExt ? extSpacer : ""}${makeAmsRow(amsMods[mi], rowLetter, from)}</div>`);
  }

  if (!rows.length) return "";

  // AMS humidity / temp meta — shown in the title, PER unit (a machine can carry
  // several AMS: the H2C reports 2). AMS Lite has NO sensor → skipped. Real
  // humidity % comes ONLY from `humidity_raw` (AMS 2 Pro / HT); the `humidity`
  // field is a 1-5 desiccant grade and must never be shown as a %. Temperature
  // is shown only when it's a real reading (> 0). With more than one unit, each
  // segment is prefixed by its row letter (A / B / …) to match the slot rows.
  let meta = "";
  {
    const multi = amsMods.length > 1;
    const segs = [];
    amsMods.forEach((m, i) => {
      if (conn?.data?.amsType?.[m.id] === "lite") return; // no sensor
      // AMS 3H: two drying zones, each with its own humidity / temperature.
      if (Array.isArray(m.zones) && m.zones.length) {
        m.zones.forEach((z, zi) => {
          const zb = [];
          const zh = parseFloat(z.humidityRaw);
          if (!isNaN(zh) && zh > 0) zb.push(`<span class="icon icon-humidity icon-11" style="vertical-align:-1px;margin-right:2px"></span>${Math.round(zh)}%`);
          const zt = parseFloat(z.temp);
          if (!isNaN(zt) && zt > 0) zb.push(`${Math.round(zt)}°C`);
          if (zb.length) segs.push(`Z${zi + 1} ` + zb.join(" "));
        });
        return;
      }
      const bits = [];
      const hr = parseFloat(m.humidityRaw);
      if (!isNaN(hr) && hr > 0) bits.push(`<span class="icon icon-humidity icon-11" style="vertical-align:-1px;margin-right:2px"></span>${Math.round(hr)}%`);
      const tp = parseFloat(m.temp);
      if (!isNaN(tp) && tp > 0) bits.push(`${Math.round(tp)}°C`);
      if (!bits.length) return;
      segs.push((multi ? `${String.fromCharCode(65 + i)} ` : "") + bits.join(" "));
    });
    if (segs.length) meta = `<span class="snap-block-meta">${segs.join(" · ")}</span>`;
  }

  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapFilamentTitle"))}${meta}</h4>
      <div class="cre-fil-rows">${rows.join("")}</div>
    </section>`;
}

// ── Control card (jog pad + light + motors-off + fan + speed) ──────────────
// Mirrors the Anycubic control card and reuses the shared Elegoo/Snapmaker
// jog-pad + fan CSS (.elg-jog-*, .elg-fan-*, .cre-action-btn) — no new
// stylesheet. Commands are wired in inventory.js' delegated handlers via
// data-bbl-jog / data-bbl-home / data-bbl-light / data-bbl-motors-off /
// data-bbl-fan-* / data-bbl-speed; the jog step is read live from #bblCtrlStep.

export function renderBambuControlCard(_p, conn) {
  if (conn?.status !== "connected") return "";
  const d      = conn.data || {};
  const ro     = _bblReadOnly(conn);
  const ledOn  = !!d.lightOn;
  const ledTip = ctx.esc(ledOn ? (ctx.t("creLedOnTip") || "Turn off light")
                               : (ctx.t("creLedOffTip") || "Turn on light"));
  const offTip = ctx.esc(ctx.t("acuMotorsOff") || "Disable motors");
  const fanPct = Math.max(0, Math.min(100, Math.round(Number(d.fanSpeedPct) || 0)));
  const auxPct = Math.max(0, Math.min(100, Math.round(Number(d.auxFanSpeedPct) || 0)));
  const chamberPct = Math.max(0, Math.min(100, Math.round(Number(d.chamberFanSpeedPct) || 0)));
  const fanLbl = ctx.esc(ctx.t("acuFanTitle") || "Fan");
  const auxLbl = ctx.esc(ctx.t("elgCtrlFanAux") || "Aux");
  const chamberLbl = ctx.esc(ctx.t("bblFanChamber") || "Case");
  // Chamber/"case" fan exists only on enclosed printers — gate on chamber temp
  // being reported (null on the A1, present on the X1C), same signal as the
  // chamber temperature pill.
  const hasChamberFan = d.chamberCurrent != null;
  // One fan column (toggle 0↔100 % + −/+ 10 %). num = 1 (part) | 2 (auxiliary).
  // Cloud: the fan still READS — the column keeps its icon and its percentage,
  // and loses only the toggle and the −/+ steps.
  const fanCol = (label, pct, num) => `
          <div class="elg-fan-col">
            <div class="elg-fan-col-head">
              ${ro
                ? `<span class="elg-fan-icon-btn${pct > 0 ? " elg-fan-icon-btn--on" : ""} elg-fan-icon-btn--static">
                     <span class="icon icon-fan icon-16" aria-hidden="true"></span>
                   </span>`
                : `<button type="button" class="elg-fan-icon-btn${pct > 0 ? " elg-fan-icon-btn--on" : ""}"
                        data-bbl-fan-toggle="${num}" aria-label="${label}">
                     <span class="icon icon-fan icon-16" aria-hidden="true"></span>
                   </button>`}
              <span class="elg-fan-col-label">${label}</span>
            </div>
            <div class="elg-fan-col-controls">
              ${ro ? "" : `<button type="button" class="elg-fan-step-btn" data-bbl-fan-step="${num}" data-dist="-10" aria-label="−">−</button>`}
              <span class="elg-fan-pct" data-bbl-fan-pct="${num}">${pct}%</span>
              ${ro ? "" : `<button type="button" class="elg-fan-step-btn" data-bbl-fan-step="${num}" data-dist="10" aria-label="+">+</button>`}
            </div>
          </div>`;
  const speedMode = [1, 2, 3, 4].includes(Number(d.speedMode)) ? Number(d.speedMode) : 2;
  const speedOpts = [
    [1, ctx.t("acuSpeedSilent")    || "Silent"],
    [2, ctx.t("acuSpeedStandard")  || "Standard"],
    [3, ctx.t("acuSpeedSport")     || "Sport"],
    [4, ctx.t("acuSpeedLudicrous") || "Ludicrous"],
  ];

  return `
    <section class="snap-block elg-ctrl acu-ctrl">
      <div class="elg-jog-wrap">

        ${ro ? "" : `
        <!-- LEFT — XYZ homing + disable motors -->
        <div class="acu-jog-side">
          <button type="button" class="cre-action-btn elg-ctrl-action"
                  data-bbl-home="all" data-acu-tip="${ctx.esc(ctx.t("acuHomeXyz") || "XYZ axis homing")}">
            <span class="icon icon-home icon-16" aria-hidden="true"></span>
          </button>
          <button type="button" class="cre-action-btn elg-ctrl-action"
                  data-bbl-motors-off="1" data-acu-tip="${offTip}">
            <span class="icon icon-disable-motor icon-16" aria-hidden="true"></span>
          </button>
        </div>

        <!-- CENTER — XY circle -->
        <div class="elg-jog-xy-circle">
          <button class="elg-jog-xy-btn elg-jog-xy-btn--n" data-bbl-jog="y" data-bbl-dir="+" title="Y+">Y+</button>
          <button class="elg-jog-xy-btn elg-jog-xy-btn--s" data-bbl-jog="y" data-bbl-dir="-" title="Y−">Y−</button>
          <button class="elg-jog-xy-btn elg-jog-xy-btn--w" data-bbl-jog="x" data-bbl-dir="-" title="X−">X−</button>
          <button class="elg-jog-xy-btn elg-jog-xy-btn--e" data-bbl-jog="x" data-bbl-dir="+" title="X+">X+</button>
          <button class="elg-jog-home-btn elg-jog-home-btn--xy" data-bbl-home="xy" data-acu-tip="${ctx.esc(ctx.t("acuHomeXy") || "XY axis homing")}">
            <span class="icon icon-home elg-home-icon" aria-hidden="true"></span>
          </button>
          <div class="elg-jog-sector elg-jog-sector--n" aria-hidden="true"></div>
          <div class="elg-jog-sector elg-jog-sector--s" aria-hidden="true"></div>
          <div class="elg-jog-sector elg-jog-sector--w" aria-hidden="true"></div>
          <div class="elg-jog-sector elg-jog-sector--e" aria-hidden="true"></div>
        </div>

        <!-- RIGHT — Z pill (Z+ / home-Z / Z−) -->
        <div class="elg-jog-z-pill">
          <button class="elg-jog-z-btn" data-bbl-jog="z" data-bbl-dir="-" title="Z+">Z↑</button>
          <button class="elg-jog-home-btn" data-bbl-home="z" data-acu-tip="${ctx.esc(ctx.t("acuHomeZ") || "Z axis homing")}">
            <span class="icon icon-home elg-home-icon" aria-hidden="true"></span>
          </button>
          <button class="elg-jog-z-btn" data-bbl-jog="z" data-bbl-dir="+" title="Z−">Z↓</button>
        </div>
        `}

        <!-- FAR RIGHT — light toggle + jog step + speed mode. The light is the
             one command a cloud connection accepts, so it is all that is left
             there in cloud mode: no jog step to choose, no speed to set. -->
        <div class="acu-jog-extra${ro ? " acu-jog-extra--alone" : ""}">
          <button type="button" class="cre-action-btn cre-action-btn--led elg-ctrl-action${ledOn ? " cre-action-btn--led-on" : ""}"
                  data-bbl-light="1" data-acu-tip="${ledTip}">
            <span class="icon icon-bulb icon-16" aria-hidden="true"></span>
          </button>
          ${ro ? "" : `
          <div class="elg-ctrl-speed-row">
            <span class="elg-ctrl-speed-label" title="${ctx.esc(ctx.t("elgCtrlStep") || "Step")}"><span class="icon icon-step icon-14"></span></span>
            <select class="elg-ctrl-speed-select" id="bblCtrlStep">
              ${[1, 10, 50].map(s => `<option value="${s}"${s === 10 ? " selected" : ""}>${s} mm</option>`).join("")}
            </select>
          </div>
          <div class="elg-ctrl-speed-row">
            <span class="elg-ctrl-speed-label" title="${ctx.esc(ctx.t("acuSpeedMode") || "Speed")}"><span class="icon icon-speed icon-14"></span></span>
            <select class="elg-ctrl-speed-select" data-bbl-speed="1">
              ${speedOpts.map(([v, lbl]) => `<option value="${v}"${v === speedMode ? " selected" : ""}>${ctx.esc(lbl)}</option>`).join("")}
            </select>
          </div>`}
        </div>

      </div>

      <!-- Cooling fans — part (P1) + auxiliary "assist" (P2) -->
      <div class="elg-fan-section">
        <div class="elg-fan-cols">
          ${fanCol(fanLbl, fanPct, 1)}
          ${fanCol(auxLbl, auxPct, 2)}
          ${hasChamberFan ? fanCol(chamberLbl, chamberPct, 3) : ""}
        </div>
      </div>
    </section>`;
}

// ── Private helpers ───────────────────────────────────────────────────────


function _bblFmtTemp(v) {
  return (typeof v === "number" && v >= 0) ? `${Math.round(v)}` : "—";
}
function _bblFmtTempPair(cur, tgt) {
  return `${_bblFmtTemp(cur)}/${_bblFmtTemp(tgt)}°C`;
}
function _bblFmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}
function _bblTextColor(hex) {
  if (!hex || hex.length < 7) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.55 ? "#000" : "#fff";
}
