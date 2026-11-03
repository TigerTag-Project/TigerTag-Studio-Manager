/**
 * printers/klipper/cards.js — Klipper plugin, side-card widgets.
 *
 * Uses the host's shared card classes (snap-job / snap-temp / snap-fil, the
 * job bar) so a Klipper printer reads like every other brand. Reads ctx at
 * call time — never destructured at module scope.
 */
import { ctx } from '../context.js';
import { tempEditAttrs } from '../temp-edit.js';
import { jobBar, jobBarFill } from '../job-bar.js';
import { remainingSec } from './core.js';

export const KLIPPER_ACTIVE_STATES = new Set(["printing", "paused"]);

const fmtTempPair = (cur, tgt) => {
  const c = typeof cur === "number" && isFinite(cur) ? `${Math.round(cur)}` : "—";
  return typeof tgt === "number" && tgt > 0 ? `${c}/${Math.round(tgt)}°C` : `${c}°C`;
};
const fmtDuration = sec => {
  const s = Math.max(0, Math.floor(sec || 0)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

export function klipperStateLabel(s) {
  const key = { printing: "snapState_printing", paused: "snapState_paused", complete: "snapState_complete",
                cancelled: "snapState_cancelled", error: "snapState_error", idle: "snapState_standby" }[s];
  const lbl = key ? ctx.t(key) : null;
  return lbl && lbl !== key ? lbl : (s || "—");
}

export function renderKlipperJobCard(p, conn) {
  if (conn.status !== "connected" || !conn.ready) return "";
  const d = conn.data;
  const st = d.printState || "idle";
  const isActive = KLIPPER_ACTIVE_STATES.has(st), isDone = st === "complete";
  const bar = jobBar(conn, st, (d.progress || 0) * 100);
  const pct = isActive || bar.tone !== "idle" ? bar.pct : 0;
  const fallbackImg = ctx.printerImageUrlFor(p.brand, p.printerModelId) || ctx.printerImageUrl(ctx.findPrinterModel(p.brand, "0"));
  const thumb = (isActive || isDone) && d.printPreviewUrl ? d.printPreviewUrl : (fallbackImg || "");
  const leaf = (isActive || isDone) && d.printFilename ? String(d.printFilename).split("/").pop() : "";
  const rem = isActive ? remainingSec(d) : null;
  const paused = st === "paused";
  const nameLine = leaf
    ? `<div class="snap-job-name" title="${ctx.esc(leaf)}">${ctx.esc(leaf)}</div>`
    : `<div class="snap-job-name snap-job-name--idle">${ctx.esc(ctx.t("snapJobNoActive") || "—")}</div>`;
  const btns = isActive ? `
      <button type="button" class="cre-action-btn cre-action-btn--pause" data-klipper-job="${paused ? "resume" : "pause"}"
              aria-label="${ctx.esc(paused ? ctx.t("snapPrintResume") : ctx.t("snapPrintPause"))}">
        <span class="icon ${paused ? "icon-play" : "icon-pause"} icon-14"></span><span class="hold-progress"></span>
      </button>
      <button type="button" class="cre-action-btn cre-action-btn--stop" data-klipper-job="stop" aria-label="${ctx.esc(ctx.t("snapPrintCancel"))}">
        <span class="icon icon-stop icon-14"></span><span class="hold-progress"></span>
      </button>` : "";
  const layer = isActive && d.currentLayer != null && d.totalLayer
    ? `<span class="snap-job-layer">${d.currentLayer}/${d.totalLayer}</span>` : "";
  return `
    <div class="snap-job snap-job--${ctx.esc(st)}">
      <div class="snap-job-thumb"${thumb ? ` style="background-image:url('${ctx.esc(thumb)}')"` : ""}></div>
      <div class="snap-job-info">
        <div class="elg-job-name-row elg-job-name-row--with-btns">
          ${nameLine}
          <div class="cre-actions elg-job-actions">${btns}</div>
        </div>
        <div class="snap-job-stats">
          <span class="snap-job-pct">${pct}%</span>
          <span class="snap-job-time">${ctx.SNAP_ICON_CLOCK} <span>${ctx.esc(rem != null ? fmtDuration(rem) : isActive ? "—" : "0m")}</span></span>
          ${layer}
        </div>
        <div class="snap-job-bar">${jobBarFill(bar)}</div>
        <div class="snap-job-foot">
          <span class="snap-job-state snap-job-state--${ctx.esc(st)}">${ctx.esc(klipperStateLabel(st))}</span>
        </div>
      </div>
    </div>`;
}

export function renderKlipperTempCard(conn) {
  if (!conn?.ready) return "";
  const t = conn.data?.temps || {};
  // heater = the Klipper heater the pill sets (SET_HEATER_TEMPERATURE); none → read-only.
  const pill = (label, icon, cur, tgt, cls = "", heater = null, max = 300) => {
    const heating = typeof tgt === "number" && tgt > 0 && typeof cur === "number" && cur < tgt - 1;
    return `
      <div class="snap-temp${cls}${heater ? " snap-temp--editable" : ""}${heating ? " snap-temp--heating" : ""}"${heater ? tempEditAttrs(heater, tgt, max) : ""}>
        <span class="snap-temp-label">${ctx.esc(label)}</span>${icon}
        <span class="snap-temp-val">${ctx.esc(fmtTempPair(cur, tgt))}</span>
      </div>`;
  };
  const tools = t.tools || [];
  const pills = tools.filter(x => typeof x.cur === "number")
    .map(x => pill(tools.length > 1 ? x.label : "E1", ctx.SNAP_ICON_NOZZLE, x.cur, x.tgt, "", x.name, 300));
  if (typeof t.bed === "number") pills.push(pill("BED", ctx.SNAP_ICON_BED, t.bed, t.bedTarget, " snap-temp--bed", "heater_bed", 120));
  // A chamber is settable only when it is a heater (heater_generic), not a bare sensor.
  const chamberHeater = /^heater_generic /.test(conn.features?.chamber || "") ? conn.features.chamber.slice(15) : null;
  if (typeof t.chamber === "number") pills.push(pill("CASE", ctx.SNAP_ICON_CHAMBER, t.chamber, t.chamberTarget, " snap-temp--chamber", chamberHeater, 70));
  if (!pills.length) return "";
  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapTemperatureTitle"))}</h4>
      <div class="snap-temps">${pills.join("")}</div>
    </section>`;
}

/* Every other temperature the printer reports — MCU, host, temperature fans,
   generic heaters such as a dryer (discovered since PR #93) — folded in a card
   of its own under Temperature, so that one stays identical to the other
   brands'. Closed by default; open / closed is kept per printer for the session.
   A generic heater takes a new target on click, like the pills above. */
const _sensorsOpen = new Set();
export function renderKlipperSensorsCard(conn) {
  const list = conn?.ready ? (conn.data?.temps?.sensors || []) : [];
  if (!list.length) return "";
  const rows = list.map(x => {
    const heater = x.name.startsWith("heater_generic ") ? x.name.slice(15) : null;
    return `
      <div class="klipper-sensor${heater ? " snap-temp--editable" : ""}"${heater ? tempEditAttrs(heater, x.tgt, 120) : ""}>
        <span class="klipper-sensor-name">${ctx.esc(x.label)}</span>
        <span class="snap-temp-val">${ctx.esc(fmtTempPair(x.cur, x.tgt))}</span>
      </div>`;
  }).join("");
  return `
    <details class="snap-block klipper-sensors" data-klp-sensors="${ctx.esc(conn.key)}"${_sensorsOpen.has(conn.key) ? " open" : ""}>
      <summary class="klipper-sensors-head">
        <span class="snap-block-title">${ctx.esc(ctx.t("klipperSensorsTitle"))}</span>
        <span class="klipper-sensors-count">${list.length}</span>
        <span class="icon icon-chevron-r icon-12 klipper-sensors-chev" aria-hidden="true"></span>
      </summary>
      <div class="klipper-sensors-list">${rows}</div>
    </details>`;
}
/** Remember the card's open state (delegated on the live block, once). */
export function wireKlipperSensors(root) {
  if (!root || root.dataset.klpSensorsWired) return;
  root.dataset.klpSensorsWired = "1";
  root.addEventListener("toggle", e => {
    const d = e.target;
    if (!d?.dataset?.klpSensors) return;
    if (d.open) _sensorsOpen.add(d.dataset.klpSensors); else _sensorsOpen.delete(d.dataset.klpSensors);
  }, true);   // toggle does not bubble
}

const SYSTEM_TAG = { mmu: "Happy Hare", afc: "AFC" };

export function renderKlipperFilamentCard(p, conn) {
  if (!conn?.ready) return "";
  const fils = conn.data?.filaments || [];
  if (!fils.length) return "";
  const cards = fils.map(f => {
    const style = f.color ? `background:${ctx.esc(f.color)};color:${ctx.esc(ctx.snapTextColor(f.color))};` : "";
    const main = f.empty ? "—" : (f.material || (f.unknown ? "?" : "—"));
    // A Happy Hare gate or an AFC lane keeps its filament: click to edit it (filament-edit.js).
    const edit = f.gate != null || f.lane ? ` snap-fil--editable" data-klp-fil="${ctx.esc(f.key)}" role="button" tabindex="0` : "";
    return `
      <div class="snap-fil${f.isActive ? " snap-fil--active" : ""}${edit}">
        <div class="snap-fil-tag">${ctx.esc(f.label)}</div>
        <div class="snap-fil-square ${f.color ? "snap-fil-square--filled" : "snap-fil-square--empty"}" style="${style}">
          <span class="snap-fil-main">${ctx.esc(main)}</span>
        </div>
        <div class="snap-fil-meta"><div class="snap-fil-sub">${ctx.esc(f.tool || f.material || "—")}</div></div>
      </div>`;
  });
  const tag = SYSTEM_TAG[conn.data.slotSystem];
  return `
    <section class="snap-block">
      <h4 class="snap-block-title">${ctx.esc(ctx.t("snapFilamentTitle"))}${tag ? ` <span class="klipper-sys-tag">${ctx.esc(tag)}</span>` : ""}</h4>
      <div class="snap-fil-grid">${cards.join("")}</div>
    </section>`;
}
