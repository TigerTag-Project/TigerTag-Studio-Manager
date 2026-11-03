/**
 * printers/klipper/filament-edit.js — tell a Klipper slot what it holds.
 *
 * Clicking a Happy Hare gate or an AFC lane in the Filament card opens the
 * printers' bottom sheet (the same .sfe-* look as the Snapmaker / FlashForge /
 * Elegoo editors): a material, a colour, Apply. Apply goes through
 * klipperWriteSlot (core.js), which sends the machine's own macro —
 * `MMU_GATE_MAP GATE= MATERIAL= COLOR=` or `SET_MATERIAL` + `SET_COLOR LANE=` —
 * and polls right after, so the card shows the new filament. The sheet's
 * markup is the plugin's own, created on first use.
 */
import { ctx } from '../context.js';
import { klipperGetConn, klipperWriteSlot } from './core.js';

// The Generic material list of the other editors, plus what Klipper users run.
const MATERIALS = ["PLA", "PETG", "ABS", "ASA", "TPU", "PA", "PC", "PLA-CF", "PETG-CF", "ABS-CF", "ASA-CF", "PA-CF", "PVA", "HIPS"];
// The colour palette of the other editors (Snapmaker SNAP_FIL_COLOR_PRESETS).
const COLORS = [
  "#000000", "#808080", "#CDCDCD", "#FFFFFF", "#135E7E",
  "#B6C3CB", "#4AB1F0", "#2641E9", "#2CDCA6", "#157F5F",
  "#1CB01C", "#C2E58C", "#FFE600", "#FF9933", "#6E4519",
  "#B58137", "#F0E6D6", "#D4C8AA", "#ED1C24", "#EC5A85",
  "#FF00FF", "#C8A4D6", "#8526D3", "#4B1F97",
];

let _edit = null;   // { printer, key, material, color }
const $ = id => document.getElementById(id);

function ensureSheet() {
  if ($("klpFilEditSheet")) return;
  const t = ctx.t, esc = ctx.esc;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="sfe-backdrop" id="klpFilEditBackdrop"></div>
    <aside class="sfe-sheet klp-fil-edit" id="klpFilEditSheet" aria-hidden="true" role="dialog" aria-labelledby="klpFilEditTitle">
      <div class="sfe-grip" aria-hidden="true"></div>
      <section class="sfe-screen sfe-screen--summary">
        <header class="sfe-screen-head sfe-screen-head--right">
          <div class="sfe-screen-head-text">
            <div class="sfe-title" id="klpFilEditTitle">${esc(t("snapFilEditTitle"))}</div>
            <div class="sfe-sub" id="klpFilEditSub"></div>
          </div>
          <button type="button" class="modal-close" id="klpFilEditClose" aria-label="${esc(t("Close"))}">✕</button>
        </header>
        <div class="sfe-body">
          <div class="sfe-line-lbl">${esc(t("snapFilEditPickFilament"))}</div>
          <div class="sfe-fil-materials" id="klpMaterialList" role="listbox" aria-label="${esc(t("snapFilEditPickFilament"))}"></div>
          <div class="sfe-line-lbl">${esc(t("snapFilEditColor"))}</div>
          <div class="sfe-color-grid" id="klpColorGrid"></div>
          <div class="sfe-error" id="klpFilEditError" hidden></div>
        </div>
        <div class="sfe-footer">
          <button type="button" class="adf-btn adf-btn--primary sfe-apply" id="klpFilEditSave">
            <span class="label">${esc(t("snapFilEditApply"))}</span>
            <span class="spinner"></span>
          </button>
        </div>
      </section>
    </aside>`);
  $("klpFilEditClose").addEventListener("click", closeKlipperFilamentEdit);
  $("klpFilEditBackdrop").addEventListener("click", closeKlipperFilamentEdit);
  $("klpMaterialList").addEventListener("click", e => {
    const row = e.target.closest(".sfe-fil-row");
    if (!row || !_edit) return;
    _edit.material = row.dataset.val;
    renderMaterials();
  });
  $("klpColorGrid").addEventListener("click", e => {
    if (e.target.closest(".sfe-color-cell--custom")) return;
    const cell = e.target.closest(".sfe-color-cell");
    if (!cell || !_edit) return;
    _edit.color = cell.dataset.color;
    renderColors();
  });
  $("klpColorGrid").addEventListener("input", e => {
    if (!e.target.matches?.(".sfe-color-cell-native") || !_edit) return;
    _edit.color = e.target.value.toUpperCase();
    e.target.closest(".sfe-color-cell--custom").style.background = _edit.color;
  });
  $("klpFilEditSave").addEventListener("click", save);
}

function renderMaterials() {
  const cur = _edit.material || "";
  const list = cur && !MATERIALS.some(m => m.toLowerCase() === cur.toLowerCase()) ? [cur, ...MATERIALS] : MATERIALS;
  $("klpMaterialList").innerHTML = list.map(m => {
    const sel = m.toLowerCase() === cur.toLowerCase();
    return `<button type="button" class="sfe-fil-row${sel ? " is-selected" : ""}" data-val="${ctx.esc(m)}" role="option" aria-selected="${sel}">
              <span class="sfe-fil-row-text">${ctx.esc(m)}</span>${sel ? `<span class="sfe-fil-row-check">✓</span>` : ""}
            </button>`;
  }).join("");
}

function renderColors() {
  const cur = String(_edit.color || "").toLowerCase();
  const custom = /^#[0-9a-f]{6}$/i.test(_edit.color || "") ? _edit.color : "#888888";
  $("klpColorGrid").innerHTML = COLORS.map(c =>
    `<button type="button" class="sfe-color-cell${c.toLowerCase() === cur ? " is-selected" : ""}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join("") + `
    <div class="sfe-color-cell sfe-color-cell--custom${COLORS.some(c => c.toLowerCase() === cur) ? "" : " is-selected"}" style="background:${ctx.esc(custom)}">
      <span class="icon icon-edit icon-13"></span>
      <input type="color" class="sfe-color-cell-native" value="${ctx.esc(custom)}" aria-label="${ctx.esc(ctx.t("snapFilEditCustomColor"))}"/>
    </div>`;
}

/** Open the editor on one slot (`key` from the connection's filaments). */
export function openKlipperFilamentEdit(printer, key) {
  const slot = klipperGetConn(printer)?.data?.filaments?.find(s => s.key === key);
  if (!slot) return;
  ensureSheet();
  _edit = { printer, key, material: slot.material || "PLA", color: (slot.color || "#FFFFFF").toUpperCase() };
  // "Happy Hare · 2" / "AFC · 3": which changer, which slot.
  const sys = { mmu: "Happy Hare", afc: "AFC" }[klipperGetConn(printer)?.data?.slotSystem];
  $("klpFilEditSub").textContent = [sys, slot.label].filter(Boolean).join(" · ");
  $("klpFilEditError").hidden = true;
  renderMaterials();
  renderColors();
  $("klpFilEditSheet").classList.add("open");
  $("klpFilEditSheet").setAttribute("aria-hidden", "false");
  $("klpFilEditBackdrop").classList.add("open");
}

export function closeKlipperFilamentEdit() {
  $("klpFilEditSheet")?.classList.remove("open");
  $("klpFilEditSheet")?.setAttribute("aria-hidden", "true");
  $("klpFilEditBackdrop")?.classList.remove("open");
  _edit = null;
}

async function save() {
  if (!_edit) return;
  const btn = $("klpFilEditSave"), err = $("klpFilEditError");
  btn.classList.add("loading"); btn.disabled = true; err.hidden = true;
  const res = await klipperWriteSlot(_edit.printer, _edit.key, { material: _edit.material, color: _edit.color });
  btn.classList.remove("loading"); btn.disabled = false;
  if (res.ok) return closeKlipperFilamentEdit();
  err.textContent = ctx.t("klipperErrCommand");
  err.hidden = false;
}
