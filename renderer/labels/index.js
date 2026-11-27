/**
 * renderer/labels — printed spool and product labels (TigerSystem-Docs,
 * docs/developers/spool-ids-and-qr-links.md §3 and §7).
 *
 * Two kinds, one set of templates:
 *   • spool label   — its QR code is the spool link, https://qr.tigertag.io/<id>
 *                     (no QR for a CLOUD_ or legacy decimal id)
 *   • product label — its QR code is the product link, https://qr.tigertag.io/p/<10 digits>
 *                     (only with a real catalogue id_product)
 * A label carries the brand, the series on a black bar, the colour name,
 * its hex code(s), up to four value slots, the protocol pill and the QR
 * code — never a value that goes stale (remaining weight, note, rack, owner).
 * Eight templates (LABEL_TEMPLATES / LAYOUTS), each one SVG laid out in tenths
 * of a millimetre and scaled to PRINTER DOTS (one CSS px of the page is one dot);
 * every QR module covers a whole number of dots. The QR is one lowercase
 * byte-mode segment, ECC M (29 × 29 for every link).
 * main.js `label:render` turns the page into a PNG (at the printer's
 * resolution), a PDF or a print job; the SVG export is the label's own SVG.
 *
 *   initLabels(ctx)          — t, esc, showTip, hideTip, syncPanels, reportError, toast,
 *                              onLabelOut({ row, kind, template, output, dpi }) after a print or a save
 *   openLabelCard(row, { productOnly }) — the label card for a spool row
 *                              (normalizeRow); productOnly: a catalogue product,
 *                              no spool (only its product label)
 *   closeLabelCard() / labelCardOpen()
 *   refreshLabelCard(row)    — the open spool label follows its spool's live row
 *   mountLabel(el, row, { productOnly }) — the same label tools drawn inside
 *                              another card (the product sheet's QR label tab)
 *   labelFor(row, { kind, template, slots, dpi }) — the label the card would draw,
 *                              without the card (the MCP label tool): { lbl, link, kind }
 *   saveLabel(format, lbl, row, kind) — print / PDF / PNG / SVG through the same
 *                              dialogs as the card's buttons
 *   The card's "Bluetooth label printer" button prints on a Niimbot printer
 *   (ble-printer.js, Web Bluetooth; main.js picks the device).
 *   qrSvg(link)              — the label's QR code alone (same encoding), as an SVG with
 *                              its 4-module quiet zone; null without a link
 */

import { spoolLink, productLink } from "../qr-link.js";
import { printLabelBle, printLabelsBle, lastBlePrinter, rememberPrinterTemplate, defaultBlePrinter, choosePrinter, cancelChoose, labelPrinterModel } from "./ble-printer.js";
import { openDialog } from "../dialog.js";
export { spoolLink, productLink };

let ctx = null;
let current = null;   // { row } — the spool the card is for

const $ = id => document.getElementById(id);
const PREFS_KEY = "tigertag.label";

// The nine templates (width × height in mm), laid out like the common spool
// label sizes. `slots`: how many value slots the layout prints (0 = none).
// "qrOnly" prints the QR and its pill alone (same as the Hub's lib/labels).
export const LABEL_TEMPLATES = [
  { id: "classic",         w: 40, h: 30, slots: 4 },
  { id: "expanded",        w: 50, h: 30, slots: 4 },
  { id: "compact",         w: 40, h: 25, slots: 0 },
  { id: "slim",            w: 40, h: 12, slots: 0 },
  { id: "slicer",          w: 40, h: 30, slots: 0 },
  { id: "vertical",        w: 30, h: 40, slots: 4 },
  { id: "verticalBold",    w: 30, h: 40, slots: 0 },
  { id: "verticalCompact", w: 25, h: 40, slots: 0 },
  { id: "qrOnly",          w: 25, h: 30, slots: 0 },
];
// The values a slot can show; all are print constants of the filament.
export const LABEL_SLOTS = ["nozzle", "bed", "dry", "td", "diameter"];
const DEFAULT_PREFS = { template: "classic", slots: ["nozzle", "bed", "dry", "td"], kind: "spool" };
// Print / PDF / PNG / SVG are always laid out at 300 dpi; nothing is asked. A Bluetooth
// label printer gets its own head's resolution instead (ble-printer.js): a 300 dpi layout
// resampled to a 203 dpi head prints a smaller QR (9 mm instead of 10 on the slim label,
// modules of 2 or 3 dots) — no other visible difference (D110-M on paper, 2026-11-27).
const EXPORT_DPI = 300;

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
  out.dpi = EXPORT_DPI;   // an older saved 203 / 300 choice is no longer read
  out.slots = Array.from({ length: 4 }, (_, i) => (LABEL_SLOTS.includes(out.slots?.[i]) || out.slots?.[i] === "none") ? out.slots[i] : DEFAULT_PREFS.slots[i]);
  return out;
}
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (_) {} }


// The QR matrix: one byte-mode segment, ECC M.
function qrMatrix(text) {
  if (!text || !window.qrcode) return null;
  const qr = window.qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return { n, dark: (r, c) => qr.isDark(r, c) };
}

// ── The label page ───────────────────────────────────────────────────────────
// `info`: { brand, logo?: { uri, aspect }, protocol, material, series, name, hexes: ["#RRGGBB"…], values: { slot: text } }.
// Each template is drawn as one SVG in tenths of a millimetre (LAYOUTS below), then
// scaled to PRINTER DOTS; the QR code is placed in dots so that every module covers
// a whole number of dots. The black bar carries the series; the brand is its
// maker's logo when the brand table has one (`info.logo`), else its name; `protocol` is a pill in the top-right corner
// (TigerQR+ when linked to a catalogue product, else TigerQR; TigerQR+ on every
// Filament Label).
const U = 10;   // layout units per millimetre
const LAYOUTS = {
  classic:  { brand: [14, 10, 372, 50], bar: [14, 64, 260, 36, 30, 4, 29], name: [14, 129, 30, 600, 372], hex: [285, 90, 24, 24],
              slots: { y: [209, 233, 257, 281], lx: 14, vx: 142, fs: 20, vw: 92 }, qr: [250, 150, 140] },
  expanded: { brand: [14, 10, 372, 50], bar: [14, 64, 372, 45, 40.5, 4, 36], name: [14, 139, 30, 600, 472], hex: [390, 86, 22, 22],
              slots: { y: [216, 240, 264, 288], lx: 14, vx: 142, fs: 20, vw: 200 }, qr: [350, 150, 140] },
  compact:  { brand: [14, 10, 372, 50], bar: [160, 80, 230, 36, 30, 4, 29], name: [160, 145, 30, 400, 230], hex: [160, 214, 24, 24], qr: [12, 83, 139] },
  slim:     { brand: [124, 8, 270, 32], bar: [124, 46, 270, 24, 21, 4, 18], name: [124, 98, 24, 600, 270], qr: [10, 9, 106] },
  slicer:   { stack: [[48, 42, 700, "brand"], [90, 46, 700, "bar"], [140, 36, 400, "name", 2]], qr: [206, 96, 188] },
  vertical: { brand: [14, 8, 272, 50], bar: [14, 66, 272, 36, 27, 4, 28], name: [14, 140, 48, 400, 272], hex: [14, 207, 24, 24], rule: [14, 222, 286],
              slots: { y: [252, 290, 328, 366], stacked: true, lx: 14, fs: 12, vfs: 15, vw: 130 }, qr: [152, 250, 137] },
  verticalBold:    { brand: [12, 8, 272, 50], bar: [0, 66, 300, 60, 36, 10, 42], name: [12, 170, 42, 600, 276], rule: [12, 225, 288], qr: [81, 242, 139] },
  verticalCompact: { brand: [12, 8, 226, 50], bar: [12, 66, 226, 36, 24, 4, 28], name: [12, 136, 36, 400, 226], hex: [12, 186, 20, 20], rule: [12, 190, 238], qr: [31, 204, 188] },
  // `pill: [y, fontSize, height]` centres the pill instead of placing it top right.
  qrOnly:   { pill: [10, 22, 32], qr: [25, 71, 200] },
};

// Estimated width of a line of Arial (bold runs wider).
const textW = (str, size, weight) => String(str || "").length * size * (weight >= 600 ? 0.6 : 0.55);
// One line of SVG text that never runs past `maxW`: the font shrinks first (down to
// 55 %), then the glyphs are squeezed (textLength) for what still does not fit.
function svgText(str, x, y, size, weight, maxW, fill = "#000") {
  if (!str) return "";
  let fs = size;
  if (maxW && textW(str, fs, weight) > maxW) fs = Math.max(size * 0.55, size * maxW / textW(str, size, weight));
  fs = Math.round(fs * 10) / 10;
  const fit = maxW && textW(str, fs, weight) > maxW ? ` textLength="${Math.round(maxW)}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text x="${x}" y="${y}" font-size="${fs}" font-weight="${weight}" fill="${fill}"${fit}>${ctx.esc(str)}</text>`;
}

// Up to `lines` lines (one under the other, `lh` apart), broken at a space or a
// "/" when the text does not fit `maxW` on one line at 80 % of its size.
function svgLines(str, x, y, size, weight, maxW, lh, lines = 2) {
  const s = String(str || "");
  if (lines < 2 || !s || textW(s, size * 0.8, weight) <= maxW) return svgText(s, x, y, size, weight, maxW);
  const cuts = [...s.matchAll(/[ /]/g)].map(m => m.index + (m[0] === "/" ? 1 : 0));
  if (!cuts.length) return svgText(s, x, y, size, weight, maxW);
  const mid = s.length / 2, at = cuts.reduce((a, b) => Math.abs(b - mid) < Math.abs(a - mid) ? b : a);
  const a = s.slice(0, at).trim(), b = s.slice(at).trim();
  const fs = Math.min(size, size * maxW / Math.max(textW(a, size, weight), textW(b, size, weight)));
  return svgText(a, x, y, fs, weight, maxW) + svgText(b, x, y + lh * fs / size, fs, weight, maxW);
}

export function buildLabel(info, link, { template = "classic", slots = [], dpi = EXPORT_DPI } = {}) {
  const tpl = LABEL_TEMPLATES.find(x => x.id === template) || LABEL_TEMPLATES[0];
  const L = LAYOUTS[tpl.id];
  const f = dpi / 25.4 / U;                         // dots per layout unit
  const W = Math.round(tpl.w * dpi / 25.4), H = Math.round(tpl.h * dpi / 25.4);
  const LW = tpl.w * U, LH = tpl.h * U;             // the label in layout units
  // The bar prints the series alone ("PLA Rainbow"); the material when there is none.
  const barText = info.series || info.material || "";
  const slim = tpl.id === "slim";

  // The QR in dots: whole dots a module, the nearest to filling its box (the same
  // boxes as the common spool labels): rounded up when that stays within 6 % of the
  // box, down otherwise. Centred; the label's white margins are its quiet zone.
  // Placed first: every text line keeps clear of where it really lands.
  const m = qrMatrix(link);
  let qr = "", Q = null;   // Q: the code's box in layout units
  if (m) {
    const [qx, qy, qs] = L.qr;
    const box = qs * f, kr = Math.round(box / m.n), k = Math.max(1, kr * m.n <= box * 1.06 ? kr : Math.floor(box / m.n)), side = m.n * k;
    const x0 = Math.round(qx * f + (box - side) / 2), y0 = Math.round(qy * f + (box - side) / 2);
    Q = { x: x0 / f, y: y0 / f, s: side / f };
    let path = "";
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    qr = `<svg x="${x0}" y="${y0}" width="${side}" height="${side}" viewBox="0 0 ${m.n} ${m.n}" shape-rendering="crispEdges"><path d="${path}" fill="#000"/></svg>`;
  }

  // The protocol pill, top right — or centred where the layout gives it a row (L.pill).
  const pfs = L.pill ? L.pill[1] : slim ? 15 : 18, ph = L.pill ? L.pill[2] : slim ? 22 : 26;
  const pw = info.protocol ? Math.ceil(info.protocol.length * pfs * 0.62 + 16) : 0;
  const px = L.pill ? (LW - pw) / 2 : LW - 10 - pw, py = L.pill ? L.pill[0] : 8;
  const pill = info.protocol ? `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="#fff" stroke="#000" stroke-width="2"/>`
    + `<text x="${px + pw / 2}" y="${py + ph / 2 + pfs * 0.36}" font-size="${pfs}" font-weight="800" text-anchor="middle">${ctx.esc(info.protocol)}</text>` : "";
  // How far right a line starting at x, with this baseline and size, may run: up to
  // the QR when the line is level with it and the code lies to its right, up to the
  // pill on the pill's row, else to the label's edge.
  const room = (x, y, size) => {
    const top = y - size * 0.8, bottom = y + size * 0.2;
    let right = LW - 10;
    if (Q && Q.x > x && bottom > Q.y - 2 && top < Q.y + Q.s) right = Math.min(right, Q.x - 8);
    if (pw && top < 8 + ph + 2) right = Math.min(right, LW - 10 - pw - 8);
    return right - x;
  };

  let g = "";
  // The maker's logo (Manager `logo_url`, made one-colour by the caller) prints in
  // place of the brand name wherever the layout prints the name.
  const logo = info.logo?.uri && info.logo.aspect > 0 ? info.logo : null;
  const logoSvg = (x, y, w, h) => `<image href="${logo.uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMinYMid meet"/>`;
  if (L.stack) {
    const val = { brand: info.brand, bar: barText, name: info.name };
    L.stack.forEach(([y, size, weight, key, lines]) => {
      if (key === "brand" && logo) {
        // The logo stands on the brand line: the line's height, never wider than its room.
        const lw = Math.min(room(14, y, size), size * logo.aspect), lh = lw / logo.aspect;
        g += logoSvg(14, y - size * 0.8 + (size - lh) / 2, lw, lh);
      } else g += svgLines(val[key], 14, y, size, weight, room(14, y, size), size * 1.1, lines || 1);
    });
  } else if (L.brand) {   // a layout without text lines (qrOnly) prints nothing here
    const [bx, by, bw, bh] = L.brand;
    const bfs = Math.round(bh * 0.8), bY = by + bh * 0.5 + bfs * 0.36;
    const beside = Math.min(bw, room(bx, bY, bfs));
    // On a vertical label the brand may also drop below the pill (between the pill
    // and the bar), full width: the band a long name takes rather than being squeezed.
    const vertical = pw && tpl.h > tpl.w;
    const dropTop = 8 + ph + 4, dropBottom = L.bar[1] - 5, dropW = Math.min(bw, LW - bx - 10);
    if (logo) {
      // As tall as it can be: beside the pill (the brand box's height, never wider
      // than the room there) or, on a vertical label, below it when that is taller.
      const sideW = Math.min(beside, bh * logo.aspect), sideH = sideW / logo.aspect;
      const dropH = vertical ? Math.min(dropBottom - dropTop, dropW / logo.aspect) : 0;
      g += dropH > sideH
        ? logoSvg(bx, dropTop + (dropBottom - dropTop - dropH) / 2, dropH * logo.aspect, dropH)
        : logoSvg(bx, by + (bh - sideH) / 2, sideW, sideH);
    } else if (vertical && textW(info.brand, bfs, 700) > beside) {
      g += svgText(info.brand, bx, dropBottom, Math.min(bfs, Math.round((dropBottom - dropTop) * 1.3)), 700, dropW);
    } else g += svgText(info.brand, bx, bY, bfs, 700, beside);
    const [rx, ry, rw, rh, rfs, tdx, tdy] = L.bar;
    if (barText) g += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="#000"/>` + svgText(barText, rx + tdx, ry + tdy, rfs, 700, rw - 2 * tdx, "#fff");
    let hexBox = null;
    if (L.hex) {
      // Every colour's hex code, flowed into the room the template leaves: as many
      // per line as fit the width, as many lines as fit above the rule, the QR (when
      // it lies under them) or the bottom; the text shrinks (to 70 %) to fit.
      const [hx, hy, hfs, hdy] = L.hex;
      const codes = info.hexes || [];
      const maxW = Math.min(LW - hx - 10, room(hx, hy, hfs) + (pw && hy - hfs * 0.8 < 8 + ph + 2 ? pw + 8 : 0));
      const underQr = Q && hx < Q.x + Q.s && hx + maxW > Q.x && hy < Q.y;
      const limit = L.rule && L.rule[1] > hy ? L.rule[1] - 5 : underQr ? Q.y - 6 : LH - 8;
      let lay = null;
      for (let sc = 1; sc >= 0.7 && codes.length; sc -= 0.05) {
        const fs = hfs * sc, cw = 7 * fs * 0.6, gap = fs * 0.5, lh = hdy * sc;
        const per = Math.max(1, Math.floor((maxW + gap) / (cw + gap)));
        const lines = Math.ceil(codes.length / per);
        lay = { fs, cw, gap, lh, per, lines: Math.max(1, Math.min(lines, Math.floor((limit - hy) / lh) + 1)) };
        if (hy + (lines - 1) * lh <= limit) break;
      }
      if (lay) codes.slice(0, lay.per * lay.lines).forEach((h, i) => {
        g += svgText(h, hx + (i % lay.per) * (lay.cw + lay.gap), hy + Math.floor(i / lay.per) * lay.lh, Math.round(lay.fs * 10) / 10, 400, lay.cw + lay.gap / 2);
      });
      if (lay && codes.length) hexBox = { x: hx, top: hy - lay.fs * 0.8, bottom: hy + (Math.ceil(Math.min(codes.length, lay.per * lay.lines) / lay.per) - 1) * lay.lh + lay.fs * 0.2 };
    }
    // The colour name stops before the hex codes when it is level with them.
    const [nx, ny, nfs, nw, nmax] = L.name;
    const nTop = ny - nfs * 0.8, nBottom = ny + nfs * 0.2;
    const byHex = hexBox && hexBox.x > nx && nBottom > hexBox.top && nTop < hexBox.bottom ? hexBox.x - nx - 10 : Infinity;
    g += svgText(info.name, nx, ny, nfs, nw, Math.min(nmax, room(nx, ny, nfs), byHex));
    if (L.rule) g += `<line x1="${L.rule[0]}" y1="${L.rule[1]}" x2="${L.rule[2]}" y2="${L.rule[1]}" stroke="#ccc" stroke-width="1"/>`;
    if (L.slots && tpl.slots) {
      const S = L.slots;
      const used = slots.slice(0, tpl.slots).filter(k => k && k !== "none" && info.values[k]);
      // The values side by side share one size: the smallest any of them needs.
      const vfs = S.stacked || !used.length ? S.fs : Math.max(S.fs * 0.55, Math.min(...used.map((k, i) => {
        const w = Math.min(S.vw, room(S.vx, S.y[i], S.fs));
        return Math.min(S.fs, S.fs * w / textW(info.values[k], S.fs, 400));
      })));
      used.forEach((k, i) => {
        const label = ctx.t(SLOT_LABEL[k]) + ":";
        if (S.stacked) g += svgText(label, S.lx, S.y[i], S.fs, 400, Math.min(S.vw, room(S.lx, S.y[i], S.fs)), "#555")
          + svgText(info.values[k], S.lx, S.y[i] + 17, S.vfs, 400, Math.min(S.vw, room(S.lx, S.y[i] + 17, S.vfs)));
        else g += svgText(label, S.lx, S.y[i], S.fs, 400, S.vx - S.lx - 6)
          + svgText(info.values[k], S.vx, S.y[i], Math.floor(vfs * 10) / 10, 400, Math.min(S.vw, room(S.vx, S.y[i], S.fs)));
      });
    }
  }
  const inner = `<rect width="${W}" height="${H}" fill="#fff"/><g transform="scale(${f})" font-family="Arial, Helvetica, sans-serif">${g}${pill}</g>${qr}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tpl.w}mm" height="${tpl.h}mm" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
  const css = `*{margin:0;padding:0;box-sizing:border-box}html,body{background:#fff}.lbl{width:${W}px;height:${H}px;overflow:hidden}.lbl svg{display:block}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="lbl"><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg></div></body></html>`;
  return { html, svg, wDots: W, hDots: H, mmW: tpl.w, mmH: tpl.h, dpi, template: tpl.id, hasQr: !!m };
}
const SLOT_LABEL = { nozzle: "lbNozzle", bed: "lbBed", dry: "addProductDrying", td: "labelSlotTd", diameter: "detDiameter" };

// ── The card ─────────────────────────────────────────────────────────────────
// `row` is a normalized spool row; ctx.labelInfo(row) gives the printed texts.
export function openLabelCard(row, { productOnly = false } = {}) {
  if (!row) return;
  current = { row, productOnly: productOnly && !!productLink(row.idProduct) };
  followDefaultPrinter();
  $("labelPanel")?.classList.add("open");
  render($("labelBody"), current);
  ctx.syncPanels?.();
}
// SEVERAL LABELS AT ONCE (the bulk bar's "Labels" on a selection of spools): one card,
// one template and the same values for all, the preview browsable label by label,
// printed in one go on the Bluetooth label printer. The Spool / Filament switch makes
// it one label per spool, or one per filament (spools of the same catalogue product
// share one; a spool with no product keeps its own).
export function openLabelBatch(rows) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return;
  if (list.length === 1) { openLabelCard(list[0]); return; }
  current = { batch: true, rows: list, row: list[0], i: 0 };
  followDefaultPrinter();
  $("labelPanel")?.classList.add("open");
  render($("labelBody"), current);
  ctx.syncPanels?.();
}
function batchItems(cur, p) {
  const perProduct = p.kind === "product", seen = new Set(), out = [];
  for (const r of cur.rows) {
    const prod = perProduct && productLink(r.idProduct) ? String(r.idProduct) : null;
    if (!prod) { out.push({ row: r, kind: "spool" }); continue; }
    if (seen.has(prod)) continue;
    seen.add(prod);
    out.push({ row: r, kind: "product" });
  }
  return out;
}

// The spool changed while its label is open (a TD set, a colour renamed…): redraw
// with the live row, only when something the label prints has changed.
export function refreshLabelCard(row) {
  if (!labelCardOpen() || !current || current.batch || !row || row.spoolId !== current.row.spoolId) return;
  const next = { ...row, idProduct: current.row.idProduct };
  if (JSON.stringify(ctx.labelInfo(next)) === JSON.stringify(ctx.labelInfo(current.row))) return;
  current = { ...current, row: next };
  render($("labelBody"), current);
}
// Something the label draws arrived later (a brand logo): draw the open card again.
export function redrawLabelCard() {
  if (labelCardOpen() && current) render($("labelBody"), current);
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

export function labelFor(row, { kind = "spool", template, slots, dpi } = {}) {
  const p = prefs();
  const k = kind === "product" && productLink(row.idProduct) ? "product" : "spool";
  const info = { ...ctx.labelInfo(row), ...(k === "product" ? { protocol: "TigerQR+" } : {}) };
  const opts = { template: template || p.template, slots: slots || p.slots, dpi: dpi || p.dpi };
  return { lbl: buildLabel(info, linkFor(row, k), opts), link: linkFor(row, k), kind: k };
}
export function saveLabel(format, lbl, row, kind) { return exportLabel(format, lbl, row, kind, null); }
export function qrSvg(link) {
  const m = qrMatrix(link);
  if (!m) return null;
  const q = 4, size = m.n + 2 * q;
  let path = "";
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) path += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export function mountLabel(el, row, { productOnly = false } = {}) {
  if (!el || !row) return;
  render(el, { row, productOnly: productOnly && !!productLink(row.idProduct) });
}

// Draws the label tools for `cur` ({ row, productOnly }) into `body`.
function render(body, cur) {
  if (!body || !cur) return;
  const { t, esc } = ctx;
  const p = prefs();
  const items = cur.batch ? batchItems(cur, p) : null;
  const at = items ? Math.max(0, Math.min(cur.i || 0, items.length - 1)) : 0;
  const row = items ? items[at].row : cur.row;
  const hasProduct = items ? cur.rows.some(r => productLink(r.idProduct)) : !!productLink(row.idProduct);
  const kind = items ? items[at].kind : (cur.productOnly || (p.kind === "product" && hasProduct) ? "product" : "spool");
  const link = linkFor(row, kind);
  // A Filament Label is a catalogue product: it always carries the TigerQR+ pill.
  const info = { ...ctx.labelInfo(row), ...(kind === "product" ? { protocol: "TigerQR+" } : {}) };
  const lbl = buildLabel(info, link, p);
  const dp = defaultBlePrinter();
  // Preview: the very page that is printed, scaled to the card.
  const boxW = 340, scale = Math.min(boxW / lbl.wDots, 220 / lbl.hDots);
  const seg = (id, on, label) => `<button type="button" class="lbl-seg-btn${on ? " is-active" : ""}" data-lbl-kind="${id}" aria-pressed="${on}">${esc(label)}</button>`;
  const tplBtn = x => `<button type="button" class="lbl-tpl${x.id === p.template ? " is-active" : ""}" data-lbl-tpl="${x.id}" aria-pressed="${x.id === p.template}">
      <b>${esc(t("labelTpl_" + x.id))}</b><small>${x.w} × ${x.h} mm</small></button>`;
  const tpl = LABEL_TEMPLATES.find(x => x.id === p.template);
  const slotSel = i => `<select class="lbl-slot" data-lbl-slot="${i}"${i >= tpl.slots ? " disabled" : ""}>
      ${["none", ...LABEL_SLOTS].map(s => `<option value="${s}"${p.slots[i] === s ? " selected" : ""}>${esc(s === "none" ? t("labelSlotNone") : t(SLOT_LABEL[s]))}</option>`).join("")}
    </select>`;
  const n = items?.length || 0;
  const batchHead = items ? `<div class="lbl-batch">
      <b>${esc(t("labelBatchCount", { n }))}</b>
      <span class="lbl-batch-nav">
        <button type="button" class="ghost sm" data-lbl-nav="-1" aria-label="‹"${at ? "" : " disabled"}><span class="icon icon-chevron-l icon-14"></span></button>
        <span class="lbl-batch-pos">${at + 1} / ${n}</span>
        <button type="button" class="ghost sm" data-lbl-nav="1" aria-label="›"${at < n - 1 ? "" : " disabled"}><span class="icon icon-chevron-r icon-14"></span></button>
      </span></div>` : "";
  const mainKey = items
    ? `<button type="button" class="primary sm lbl-ble" data-lbl-batch><span class="icon icon-bluetooth icon-14"></span><span>${esc(dp ? t("labelBlePrintN", { n, name: dp.model }) : t("labelBatchPrint", { n }))}</span></button>`
    : `<button type="button" class="primary sm lbl-ble" data-lbl-out="ble"><span class="icon icon-bluetooth icon-14"></span><span>${esc(dp ? t("labelBlePrintTo", { name: dp.model }) : t("labelBle"))}</span></button>`;
  body.innerHTML = `
    ${batchHead}
    <div class="panel-label">${esc(t("labelTemplate"))}</div>
    <div class="lbl-tpls">${LABEL_TEMPLATES.map(tplBtn).join("")}</div>
    ${hasProduct && !cur.productOnly ? `<div class="lbl-seg lbl-seg--kind" role="group">${seg("spool", kind === "spool", t("labelKindSpool"))}${seg("product", kind === "product", t("labelKindProduct"))}</div>` : ""}
    ${link ? "" : `<p class="lbl-hint">${esc(t("labelNoQr"))}</p>`}
    <div class="lbl-preview">${link ? `<button type="button" class="lbl-paper lbl-paper--link" data-lbl-open aria-label="${esc(t("labelOpenLink"))}"` : `<div class="lbl-paper"`} style="width:${Math.round(lbl.wDots * scale)}px;height:${Math.round(lbl.hDots * scale)}px">
      <iframe class="lbl-frame" title="" tabindex="-1" sandbox="" style="width:${lbl.wDots}px;height:${lbl.hDots}px;transform:scale(${scale})"></iframe>
      ${link ? `<span class="lbl-open-hint"><span class="icon icon-arrow-up-right icon-12" aria-hidden="true"></span>${esc(t("labelOpenLink"))}</span></button>` : "</div>"}
    </div>
    ${link && !items ? `<div class="lbl-linkrow"><button type="button" class="ghost sm" data-lbl-copy><span class="icon icon-copy icon-14"></span><span>${esc(t("labelCopyLink"))}</span></button>${link ? `<button type="button" class="ghost sm" data-lbl-share><span class="icon icon-send icon-14"></span><span>${esc(t("productShare"))}</span></button>` : ""}</div>` : ""}
    <div class="panel-label">${esc(t("labelSlots"))}</div><div class="lbl-slots">${[0, 1, 2, 3].map(slotSel).join("")}</div>
    <div class="lbl-actions">
      <div class="lbl-ble-row">
        ${mainKey}
        <button type="button" class="ghost sm lbl-ble-switch" data-lbl-ble-pick aria-label="${esc(t("labelBleChange"))}"><span class="icon icon-bluetooth icon-14" aria-hidden="true"></span></button>
      </div>
      <button type="button" class="lbl-ble-guide" data-lbl-ble-guide>${esc(t("labelBleCompat"))}</button>
      ${items ? "" : `<button type="button" class="ghost sm" data-lbl-out="print"><span class="icon icon-printer icon-14"></span><span>${esc(t("labelPrint"))}</span></button>
      <button type="button" class="ghost sm" data-lbl-out="pdf"><span class="icon icon-download icon-14"></span><span>PDF</span></button>
      <button type="button" class="ghost sm" data-lbl-out="png"><span class="icon icon-download icon-14"></span><span>PNG</span></button>
      <button type="button" class="ghost sm" data-lbl-out="svg"><span class="icon icon-download icon-14"></span><span>SVG</span></button>`}
    </div>
    ${items ? `<p class="lbl-hint">${esc(t("labelBatchBleOnly"))}</p>` : ""}
    <p class="lbl-msg"></p>`;
  // The preview draws inside its frame: a spinner on the paper until it has loaded.
  const frame = body.querySelector(".lbl-frame"), paper = body.querySelector(".lbl-paper");
  paper?.classList.add("is-loading");
  frame.addEventListener("load", () => paper?.classList.remove("is-loading"), { once: true });
  frame.srcdoc = lbl.html;
  body.querySelectorAll(".lbl-slot").forEach(el => ctx.enhanceSelect?.(el));
  body.onclick = e => {
    const k = e.target.closest("[data-lbl-kind]"), tp = e.target.closest("[data-lbl-tpl]"),
          out = e.target.closest("[data-lbl-out]");
    // The kind switch: let its pill slide first, then redraw with the other label.
    if (k) {
      if (k.classList.contains("is-active")) return;
      k.parentElement.querySelectorAll("[data-lbl-kind]").forEach(x => { const on = x === k; x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", String(on)); });
      savePrefs({ ...prefs(), kind: k.dataset.lblKind });
      if (cur.batch) cur.i = 0;
      setTimeout(() => render(body, cur), 200);
    }
    // A template picked is also the roll of the Bluetooth printer used last (ble-printer.js).
    else if (tp) { savePrefs({ ...prefs(), template: tp.dataset.lblTpl }); rememberPrinterTemplate(lastBlePrinter(), tp.dataset.lblTpl); render(body, cur); }
    // A Bluetooth label printer gets the label built for it: its own resolution, and
    // the slim template on the narrow 12 mm heads (ble-printer.js picks both).
    else if (out?.dataset.lblOut === "ble") printBle(({ dpi, template }) => buildLabel(info, link, { ...p, dpi, ...(template ? { template } : {}) }), row, kind, body.querySelector(".lbl-msg"));
    else if (out) exportLabel(out.dataset.lblOut, lbl, row, kind, body.querySelector(".lbl-msg"));
    // A batch: browse its labels, print them all, stop, resume after the last one printed.
    else if (e.target.closest("[data-lbl-nav]")) { cur.i = at + Number(e.target.closest("[data-lbl-nav]").dataset.lblNav); render(body, cur); }
    else if (e.target.closest("[data-lbl-batch]")) printBatch(body, items, p, 0);
    else if (e.target.closest("[data-lbl-resume]")) printBatch(body, items, p, Number(e.target.closest("[data-lbl-resume]").dataset.lblResume));
    else if (e.target.closest("[data-lbl-batch-stop]")) { if (batchRun) batchRun.stop = true; e.target.closest("[data-lbl-batch-stop]").disabled = true; }
    // The wiki's page of the label printers that work (tested models, our pick).
    else if (e.target.closest("[data-lbl-ble-guide]")) openBleGuide();
    // Another label printer becomes the default (a list of the ones in range).
    else if (e.target.closest("[data-lbl-ble-pick]")) pickDefaultPrinter(() => { followDefaultPrinter(); render(body, cur); });
    // What the label's QR holds, shared in the sharer's language (ctx.shareProduct).
    else if (e.target.closest("[data-lbl-share]")) ctx.shareProduct?.(row, kind);
    // The QR's link, copied (the same link the preview opens).
    else if (e.target.closest("[data-lbl-copy]") && link) ctx.copy?.(link, e.target.closest("[data-lbl-copy]"));
    // The label's QR, followed: the page a scan lands on.
    else if (e.target.closest("[data-lbl-open]") && link) {
      if (window.electronAPI?.openExternal) window.electronAPI.openExternal(link); else window.open(link, "_blank", "noopener");
    }
  };
  body.onchange = e => {
    const s = e.target.closest("[data-lbl-slot]");
    if (!s) return;
    const q = prefs(); q.slots[Number(s.dataset.lblSlot)] = s.value; savePrefs(q); render(body, cur);
  };
}

async function exportLabel(format, lbl, row, kind, msg) {
  if (msg) msg.textContent = "";
  const id = kind === "product" ? productLink(row.idProduct).split("/").pop() : String(row.spoolId).replace(/^TigerData_/, "");
  const fileName = `tigertag-${kind}-${id}-${lbl.mmW}x${lbl.mmH}`;
  const svg = format === "svg" ? lbl.svg : undefined;   // the label itself, sized in millimetres
  try {
    const res = await window.electronAPI?.renderLabel?.({ ...lbl, svg, format, fileName });
    if (!res?.ok && res?.reason !== "cancelled" && format !== "print") throw new Error(res?.reason || "render failed");
    // A label actually printed or saved (not a cancelled dialog): counted (print_label).
    if (res?.ok) ctx.onLabelOut?.({ row, kind, template: lbl.template, output: format, dpi: lbl.dpi });
  } catch (e) {
    if (msg) msg.textContent = ctx.t("labelExportFailed");
    ctx.reportError?.("label." + format, e);
  }
}

// A BATCH to the Bluetooth label printer, from label `from` on: one job, the main key
// turned into Stop, "Label 3 / 12…" in the message line; stopped or dropped, the
// message says how far it got and a key resumes from the next one. Every label printed
// is counted as a print (print_label). Several printers in range, or the default one
// not seen: the chooser window, as for one label.
let batchRun = null;
async function printBatch(body, items, p, from) {
  if (batchRun || bleBusy || !items?.length) return;
  const { t, esc } = ctx;
  const total = items.length;
  const run = batchRun = { stop: false };
  const msg = body.querySelector(".lbl-msg");
  const key = body.querySelector("[data-lbl-batch]");
  body.querySelector("[data-lbl-resume]")?.remove();
  const keyHtml = key?.innerHTML;
  if (key) { key.removeAttribute("data-lbl-batch"); key.setAttribute("data-lbl-batch-stop", ""); key.innerHTML = `<span class="icon icon-close icon-14"></span><span>${esc(t("labelBatchStop"))}</span>`; }
  const say = (k, params, info = true) => { if (!msg) return; msg.classList.toggle("is-info", info); msg.textContent = t(k, params); };
  let pick = null;
  const dropPick = () => { pick?.close(); pick = null; };
  const onStep = (step, extra) => {
    if (step === "choose") { say("labelBleChoose"); if (!pick) pick = printerChooser(); pick.show(extra.devices, extra.choose); return; }
    dropPick();
    if (step === "print") say("labelBatchProgress", { done: Math.min(done + 1, total), total });
    else say({ search: "labelBleSearch", connect: "labelBleConnect" }[step]);
  };
  const todo = items.slice(from);
  const makers = todo.map(it => ({ dpi, template }) => {
    const info = { ...ctx.labelInfo(it.row), ...(it.kind === "product" ? { protocol: "TigerQR+" } : {}) };
    return buildLabel(info, linkFor(it.row, it.kind), { ...p, dpi, ...(template ? { template } : {}) });
  });
  let done = from;
  const resumeKey = () => {
    if (done >= total || !msg) return;
    msg.insertAdjacentHTML("afterend", `<button type="button" class="ghost sm lbl-batch-resume" data-lbl-resume="${done}"><span class="icon icon-refresh icon-14"></span><span>${esc(t("labelBatchResume", { n: done + 1 }))}</span></button>`);
  };
  try {
    const res = await printLabelsBle(makers, {
      onStep,
      stop: () => run.stop,
      onProgress: (printed, _n, lbl) => {
        const it = todo[printed - 1];
        done = from + printed;
        ctx.onLabelOut?.({ row: it.row, kind: it.kind, template: lbl?.template, output: "print", dpi: lbl?.dpi });
        if (done < total) say("labelBatchProgress", { done: done + 1, total });
      },
    });
    if (done < total) { say("labelBatchStopped", { done, total }); resumeKey(); }
    else say("labelBatchDone", { n: total, name: res.name || res.model });
  } catch (e) {
    const none = /no printer found|NotFoundError/i.test(String(e?.message || e?.name));
    if (none && done === from) say("labelBleNone", null, false);
    else { say("labelBatchFailed", { done, total }, false); resumeKey(); }
    if (!none) ctx.reportError?.("label.bleBatch", e);
    console.warn("[label] Bluetooth batch:", e);
  } finally {
    dropPick();
    batchRun = null;
    const k = body.querySelector("[data-lbl-batch-stop]");
    if (k) { k.removeAttribute("data-lbl-batch-stop"); k.setAttribute("data-lbl-batch", ""); k.disabled = false; if (keyHtml) k.innerHTML = keyHtml; }
  }
}

// The wiki's Bluetooth label printers page — the models that work, tested — in the app's language.
function openBleGuide() {
  const lang = ctx.lang?.() || "en";
  const url = `https://wiki.tigersystem.io${lang === "en" ? "" : "/" + lang}/compatibility/label-printers/`;
  if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url); else window.open(url, "_blank", "noopener");
}

// The default label printer follows the card: its model's roll is the template shown.
function followDefaultPrinter() {
  const tpl = defaultBlePrinter()?.template;
  if (tpl && tpl !== prefs().template) savePrefs({ ...prefs(), template: tpl });
}

// THE PRINTERS IN RANGE, in one window (openDialog): the default first, each by its
// model and its Bluetooth name. Used to change the default printer, and by a print
// whose default printer was not seen (or when there is none and several answer).
// `choose(id)` hands the pick to main.js; closing the window cancels the search.
function printerChooser() {
  const { t, esc } = ctx;
  let chooseFn = null, picked = false;
  const stop = () => { if (!picked) { picked = true; cancelChoose(); } };
  // The search goes on while the window is open: the spinner line stays under the printers
  // found, outside the list, so a list update never restarts it.
  const waitLine = `<p class="lbl-ble-wait"><span class="ttc-spinner" aria-hidden="true"></span>${esc(t("labelBleSearch"))}</p>`;
  const dlg = openDialog({
    look: "notice", cls: "lbl-ble-dlg", icon: "bluetooth",
    title: t("labelBlePickTitle"),
    body: `<div class="lbl-ble-list" role="listbox"></div>${waitLine}
      <button type="button" class="lbl-ble-guide" data-lbl-ble-guide>${esc(t("labelBleCompat"))}</button>`,
    actions: [{ id: "cancel", label: t("btnCancel") }],
    // Closed without a pick (Cancel, the cross, Escape, a click outside): the search stops.
    onAction: (_id, close) => { stop(); close(); },
    onDismiss: () => stop(),
    wire: card => {
      card.querySelector("[data-lbl-ble-guide]").addEventListener("click", openBleGuide);
      card.querySelector(".lbl-ble-list").addEventListener("click", e => {
        const b = e.target.closest("[data-ble-id]");
        if (!b || picked || !chooseFn) return;
        picked = true;
        chooseFn(b.dataset.bleId);
        dlg?.close();
      });
    },
  });
  const list = dlg.card.querySelector(".lbl-ble-list");
  const cur = defaultBlePrinter()?.name;
  // Chromium reports the printers in range several times a second, and a printer can be
  // missing from one report: a printer seen stays listed while the window is open, and
  // the rows are redrawn only when a new one shows up (nothing moves otherwise).
  const seen = new Map();
  return {
    show(devices, choose) {
      chooseFn = choose;
      const fresh = devices.filter(d => !seen.has(d.id));
      if (!fresh.length) return;
      fresh.forEach(d => seen.set(d.id, d));
      const rows = [...seen.values()].sort((a, b) => (b.name === cur) - (a.name === cur) || a.name.localeCompare(b.name));
      list.innerHTML = rows.map(d => {
        const model = labelPrinterModel(d.name)?.name;
        return `<button type="button" class="lbl-ble-dev${d.name === cur ? " is-default" : ""}" role="option" data-ble-id="${esc(d.id)}">
          <span class="icon icon-bluetooth icon-16" aria-hidden="true"></span>
          <span class="lbl-ble-dev-txt"><b>${esc(model || d.name)}</b><small>${esc(d.name)}</small></span>
          ${d.name === cur ? `<span class="lbl-ble-dev-pill">${esc(t("labelBleDefault"))}</span>` : ""}</button>`;
      }).join("");
    },
    close() { picked = true; dlg?.close(); },
  };
}

// Change the default label printer: the printers in range, one picked.
async function pickDefaultPrinter(after) {
  const ch = printerChooser();
  try { await choosePrinter((devices, choose) => ch.show(devices, choose)); after?.(); }
  catch (_) { ch.close(); }
}

// The label sent to a Bluetooth label printer (ble-printer.js): straight to the
// default printer, each step said in the card's message line, the button held while
// it runs. Default printer not seen (or none, several in range): the chooser window.
// Counted as a print (print_label).
let bleBusy = false;
async function printBle(make, row, kind, msg) {
  if (bleBusy || !msg) return;
  bleBusy = true;
  const btn = msg.parentElement?.querySelector('[data-lbl-out="ble"]');
  if (btn) btn.disabled = true;
  msg.classList.remove("is-info");
  let pick = null;
  const dropPick = () => { pick?.close(); pick = null; };
  const say = (key, params) => { msg.classList.add("is-info"); msg.textContent = ctx.t(key, params); };
  const onStep = (step, extra) => {
    if (step !== "choose") { dropPick(); say({ search: "labelBleSearch", connect: "labelBleConnect", print: "labelBlePrinting" }[step]); return; }
    say("labelBleChoose");
    if (!pick) pick = printerChooser();
    pick.show(extra.devices, extra.choose);
  };
  try {
    const res = await printLabelBle(make, { onStep });
    // Another printer, another roll: the card follows the template it printed with.
    if (!res.turned && res.template && res.template !== prefs().template) {
      savePrefs({ ...prefs(), template: res.template });
      const body = msg.parentElement;
      if (current && body === $("labelBody")) { render(body, current); msg = body.querySelector(".lbl-msg"); }
    }
    say("labelBleDone", { name: res.name || res.model });
    ctx.onLabelOut?.({ row, kind, template: res.template, output: "print", dpi: res.dpi });
  } catch (e) {
    const none = /no printer found|NotFoundError/i.test(String(e?.message || e?.name));
    msg.classList.remove("is-info");
    msg.textContent = ctx.t(none ? "labelBleNone" : "labelExportFailed");
    if (!none) ctx.reportError?.("label.ble", e);
    console.warn("[label] Bluetooth print:", e);
  } finally {
    dropPick();
    bleBusy = false;
    if (btn) btn.disabled = false;
  }
}
