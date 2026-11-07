/**
 * renderer/labels — printed spool and product labels (TigerSystem-Docs,
 * docs/developers/spool-ids-and-qr-links.md §3 and §7).
 *
 * Two kinds, one set of templates:
 *   • spool label   — its QR code is the spool link, https://qr.tigertag.io/<id>
 *                     (no QR for a CLOUD_ or legacy decimal id)
 *   • product label — its QR code is the product link, https://qr.tigertag.io/p/<8 hex>
 *                     (only with a real catalogue id_product)
 * A label carries the brand, `material · series`, the colour name and swatch,
 * up to four value slots and the QR code — never a value that goes stale
 * (remaining weight, note, rack, owner), nothing in clear next to the code.
 *
 * The label is laid out in PRINTER DOTS: one CSS px of the page is one dot, so
 * every QR module covers a whole number of dots (the largest that fits, with
 * the 4-module quiet zone). The QR is one lowercase byte-mode segment, ECC M
 * (29 × 29 for every link). The swatch is drawn by the app's colorBg().
 * main.js `label:render` turns the page into a PNG (at the printer's
 * resolution), a PDF or a print job; the SVG wraps the same page.
 *
 *   initLabels(ctx)          — t, esc, colorBg, showTip, hideTip, syncPanels, reportError, toast
 *   openLabelCard(row)       — the label card for a spool row (normalizeRow)
 *   closeLabelCard() / labelCardOpen()
 */

let ctx = null;
let current = null;   // { row } — the spool the card is for

const $ = id => document.getElementById(id);
const PREFS_KEY = "tigertag.label";

// Templates of the contract (width × height in mm). `slots`: how many value
// slots fit; `qr`: where the code sits ("right" or "bottom").
export const LABEL_TEMPLATES = [
  { id: "classic",  w: 40, h: 30, slots: 4, qr: "right" },
  { id: "expanded", w: 50, h: 30, slots: 4, qr: "right", big: true },
  { id: "compact",  w: 40, h: 25, slots: 2, qr: "right" },
  { id: "slim",     w: 40, h: 12, slots: 0, qr: "right" },
  { id: "vertical", w: 30, h: 40, slots: 4, qr: "bottom" },
  { id: "verticalCompact", w: 25, h: 40, slots: 2, qr: "bottom" },
];
// The values a slot can show; all are print constants of the filament.
export const LABEL_SLOTS = ["nozzle", "bed", "dry", "td", "diameter"];
const DEFAULT_PREFS = { template: "classic", slots: ["nozzle", "bed", "dry", "td"], dpi: 203, kind: "spool" };

export function initLabels(c) {
  ctx = c;
  $("labelClose")?.addEventListener("click", closeLabelCard);
}

export function labelCardOpen() { return !!$("labelPanel")?.classList.contains("open"); }

function prefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (_) {}
  const out = { ...DEFAULT_PREFS, ...p };
  if (!LABEL_TEMPLATES.some(x => x.id === out.template)) out.template = DEFAULT_PREFS.template;
  if (![203, 300].includes(Number(out.dpi))) out.dpi = 203;
  out.slots = Array.from({ length: 4 }, (_, i) => (LABEL_SLOTS.includes(out.slots?.[i]) || out.slots?.[i] === "none") ? out.slots[i] : DEFAULT_PREFS.slots[i]);
  return out;
}
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (_) {} }

// ── Links (contract §3 and §5) ───────────────────────────────────────────────
const HEX14 = /^[0-9A-F]{14}$/i;
export function spoolLink(spoolId) {
  const id = String(spoolId || "");
  const m = /^TigerData_(\d{17}|\d{10})$/.exec(id);
  if (m) return "https://qr.tigertag.io/" + m[1];
  if (HEX14.test(id)) return "https://qr.tigertag.io/" + id.toLowerCase();
  return null;   // CLOUD_…, legacy decimal: printed without a QR code
}
export function productLink(idProduct) {
  const n = Number(idProduct);
  if (!Number.isFinite(n) || n <= 0 || n >= 0xFFFFFFFF) return null;
  return "https://qr.tigertag.io/p/" + (n >>> 0).toString(16).padStart(8, "0");
}

// The QR matrix: one byte-mode segment, ECC M.
function qrMatrix(text) {
  if (!text || !window.qrcode) return null;
  const qr = window.qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return { n, dark: (r, c) => qr.isDark(r, c) };
}
// The QR as inline SVG, `k` dots a module, quiet zone included.
function qrSvg(m, k) {
  const q = 4, side = (m.n + 2 * q) * k;
  let path = "";
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) {
    if (m.dark(r, c)) path += `M${c + q} ${r + q}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${m.n + 2 * q} ${m.n + 2 * q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// ── The label page ───────────────────────────────────────────────────────────
// `info`: { brand, line2, name, swatch (CSS background), values: { slot: text } }.
export function buildLabel(info, link, { template = "classic", slots = [], dpi = 203 } = {}) {
  const tpl = LABEL_TEMPLATES.find(x => x.id === template) || LABEL_TEMPLATES[0];
  const dot = mm => Math.round(mm * dpi / 25.4);
  const W = dot(tpl.w), H = dot(tpl.h), pad = dot(tpl.h <= 12 ? 0.8 : 1.4);
  const esc = ctx.esc;
  const m = qrMatrix(link);
  // QR box: the largest whole number of dots a module that fits its share.
  let k = 0, side = 0;
  if (m) {
    const box = tpl.qr === "bottom" ? Math.min(W * 0.78, H * 0.46) : Math.min(H, W * (tpl.h <= 12 ? 0.3 : 0.46));
    k = Math.max(1, Math.floor(box / (m.n + 8)));
    side = (m.n + 8) * k;
  }
  const fs = mm => dot(tpl.big ? mm * 1.12 : mm);   // font sizes in dots
  const used = slots.slice(0, tpl.slots).filter(s => s && s !== "none" && info.values[s]);
  const slotHtml = used.length ? `<div class="s">${used.map(s =>
    `<div><span>${esc(ctx.t(SLOT_LABEL[s]))}</span><b>${esc(info.values[s])}</b></div>`).join("")}</div>` : "";
  const sw = `<i class="w" style="background:${info.swatch}"></i>`;
  const qr = m ? `<div class="q">${qrSvg(m, k)}</div>` : "";
  const slim = tpl.h <= 12;
  const text = `<div class="t">
      <div class="b">${esc(info.brand || "")}</div>
      ${info.line2 ? `<div class="l">${esc(info.line2)}</div>` : ""}
      <div class="n">${sw}<span>${esc(info.name || "")}</span></div>
      ${slim ? "" : slotHtml}
    </div>`;
  const layout = tpl.qr === "bottom"
    ? `.lbl{flex-direction:column;align-items:stretch}.q{align-self:center;margin-top:auto}`
    : `.lbl{flex-direction:row}.q{margin-left:auto;align-self:flex-end}`;
  const css = `*{margin:0;padding:0;box-sizing:border-box}html,body{background:#fff}
    .lbl{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#fff;color:#000;display:flex;
      font-family:Arial,Helvetica,sans-serif;padding:${pad}px}
    ${layout}
    .q{flex:none;width:${side}px;height:${side}px;margin-right:-${pad}px;margin-bottom:-${pad}px}
    .q svg{display:block}
    .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:${dot(0.4)}px}
    .b{font-size:${fs(slim ? 2.6 : 3.4)}px;font-weight:800;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .l{font-size:${fs(slim ? 2 : 2.4)}px;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .n{display:flex;align-items:center;gap:${dot(0.8)}px;font-size:${fs(slim ? 2.2 : 3)}px;font-weight:700;line-height:1.1}
    .n span{min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:${slim ? 1 : 2};-webkit-box-orient:vertical}
    .w{flex:none;width:${fs(slim ? 2.2 : 3.2)}px;height:${fs(slim ? 2.2 : 3.2)}px;border-radius:50%;border:${Math.max(1, dot(0.15))}px solid #000}
    .s{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:${dot(0.3)}px ${dot(1)}px;font-size:${fs(1.9)}px;line-height:1.15}
    .s div{display:flex;flex-direction:column;min-width:0}.s span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .s b{font-weight:800;white-space:nowrap}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="lbl">${qr && tpl.qr === "bottom" ? text + qr : text + qr}</div></body></html>`;
  return { html, wDots: W, hDots: H, mmW: tpl.w, mmH: tpl.h, dpi, k, qrSide: side, hasQr: !!m };
}
const SLOT_LABEL = { nozzle: "lbNozzle", bed: "lbBed", dry: "addProductDrying", td: "labelSlotTd", diameter: "detDiameter" };

// ── The card ─────────────────────────────────────────────────────────────────
// `row` is a normalized spool row; ctx.labelInfo(row) gives the printed texts.
export function openLabelCard(row) {
  if (!row) return;
  current = { row };
  $("labelPanel")?.classList.add("open");
  render();
  ctx.syncPanels?.();
}
export function closeLabelCard() {
  if (!labelCardOpen()) return;
  ctx.hideTip?.();
  $("labelPanel").classList.remove("open");
  current = null;
  ctx.syncPanels?.();
}

function linkFor(row, kind) {
  return kind === "product" ? productLink(row.idProduct) : spoolLink(row.spoolId);
}

function render() {
  const body = $("labelBody");
  if (!body || !current) return;
  const { t, esc } = ctx;
  const p = prefs();
  const row = current.row;
  const hasProduct = !!productLink(row.idProduct);
  const kind = p.kind === "product" && hasProduct ? "product" : "spool";
  const link = linkFor(row, kind);
  const info = ctx.labelInfo(row);
  const lbl = buildLabel(info, link, p);
  // Preview: the very page that is printed, scaled to the card.
  const boxW = 340, scale = Math.min(boxW / lbl.wDots, 220 / lbl.hDots);
  const seg = (id, on, label) => `<button type="button" class="lbl-seg-btn${on ? " is-active" : ""}" data-lbl-kind="${id}" aria-pressed="${on}">${esc(label)}</button>`;
  const tplBtn = x => `<button type="button" class="lbl-tpl${x.id === p.template ? " is-active" : ""}" data-lbl-tpl="${x.id}" aria-pressed="${x.id === p.template}">
      <i class="lbl-tpl-shape" style="aspect-ratio:${x.w}/${x.h}"></i><b>${esc(t("labelTpl_" + x.id))}</b><small>${x.w} × ${x.h} mm</small></button>`;
  const tpl = LABEL_TEMPLATES.find(x => x.id === p.template);
  const slotSel = i => `<select class="lbl-slot" data-lbl-slot="${i}"${i >= tpl.slots ? " disabled" : ""}>
      ${["none", ...LABEL_SLOTS].map(s => `<option value="${s}"${p.slots[i] === s ? " selected" : ""}>${esc(s === "none" ? t("labelSlotNone") : t(SLOT_LABEL[s]))}</option>`).join("")}
    </select>`;
  body.innerHTML = `
    ${hasProduct ? `<div class="lbl-seg" role="group">${seg("spool", kind === "spool", t("labelKindSpool"))}${seg("product", kind === "product", t("labelKindProduct"))}</div>` : ""}
    <p class="lbl-hint">${esc(t(kind === "product" ? "labelKindProductHint" : link ? "labelKindSpoolHint" : "labelNoQr"))}</p>
    <div class="lbl-preview"><div class="lbl-paper" style="width:${Math.round(lbl.wDots * scale)}px;height:${Math.round(lbl.hDots * scale)}px">
      <iframe class="lbl-frame" title="" tabindex="-1" sandbox="" style="width:${lbl.wDots}px;height:${lbl.hDots}px;transform:scale(${scale})"></iframe>
    </div></div>
    <div class="panel-label">${esc(t("labelTemplate"))}</div>
    <div class="lbl-tpls">${LABEL_TEMPLATES.map(tplBtn).join("")}</div>
    ${tpl.slots ? `<div class="panel-label">${esc(t("labelSlots"))}</div><div class="lbl-slots">${[0, 1, 2, 3].filter(i => i < tpl.slots).map(slotSel).join("")}</div>` : ""}
    <div class="lbl-dpi"><span>${esc(t("labelDpi"))}</span>${[203, 300].map(d => `<button type="button" class="lbl-seg-btn${p.dpi === d ? " is-active" : ""}" data-lbl-dpi="${d}" aria-pressed="${p.dpi === d}">${d} dpi</button>`).join("")}</div>
    <div class="lbl-actions">
      <button type="button" class="primary sm" data-lbl-out="print"><span class="icon icon-printer icon-14"></span><span>${esc(t("labelPrint"))}</span></button>
      <button type="button" class="ghost sm" data-lbl-out="pdf"><span class="icon icon-download icon-14"></span><span>PDF</span></button>
      <button type="button" class="ghost sm" data-lbl-out="png"><span class="icon icon-download icon-14"></span><span>PNG</span></button>
      <button type="button" class="ghost sm" data-lbl-out="svg"><span class="icon icon-download icon-14"></span><span>SVG</span></button>
    </div>
    <p class="lbl-msg" id="labelMsg"></p>`;
  body.querySelector(".lbl-frame").srcdoc = lbl.html;
  body.querySelectorAll(".lbl-slot").forEach(el => ctx.enhanceSelect?.(el));
  body.onclick = e => {
    const k = e.target.closest("[data-lbl-kind]"), tp = e.target.closest("[data-lbl-tpl]"),
          d = e.target.closest("[data-lbl-dpi]"), out = e.target.closest("[data-lbl-out]");
    if (k) { savePrefs({ ...prefs(), kind: k.dataset.lblKind }); render(); }
    else if (tp) { savePrefs({ ...prefs(), template: tp.dataset.lblTpl }); render(); }
    else if (d) { savePrefs({ ...prefs(), dpi: Number(d.dataset.lblDpi) }); render(); }
    else if (out) exportLabel(out.dataset.lblOut, lbl, row, kind);
  };
  body.onchange = e => {
    const s = e.target.closest("[data-lbl-slot]");
    if (!s) return;
    const q = prefs(); q.slots[Number(s.dataset.lblSlot)] = s.value; savePrefs(q); render();
  };
}

async function exportLabel(format, lbl, row, kind) {
  const msg = $("labelMsg");
  if (msg) msg.textContent = "";
  const fileName = `tigertag-${kind}-${String(row.spoolId).replace(/^TigerData_/, "")}-${lbl.mmW}x${lbl.mmH}`;
  // The SVG wraps the same page (foreignObject), sized in millimetres.
  const svg = format !== "svg" ? undefined : `<svg xmlns="http://www.w3.org/2000/svg" width="${lbl.mmW}mm" height="${lbl.mmH}mm" viewBox="0 0 ${lbl.wDots} ${lbl.hDots}"><foreignObject width="${lbl.wDots}" height="${lbl.hDots}">${
    lbl.html.replace(/^<!doctype html>/i, "").replace("<html>", '<html xmlns="http://www.w3.org/1999/xhtml">')}</foreignObject></svg>`;
  try {
    const res = await window.electronAPI?.renderLabel?.({ ...lbl, svg, format, fileName });
    if (!res?.ok && res?.reason !== "cancelled" && format !== "print") throw new Error(res?.reason || "render failed");
  } catch (e) {
    if (msg) msg.textContent = ctx.t("labelExportFailed");
    ctx.reportError?.("label." + format, e);
  }
}
