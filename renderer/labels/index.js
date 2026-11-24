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
 * Eleven templates (LABEL_TEMPLATES / LAYOUTS), each one SVG laid out in tenths
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
 *   qrSvg(link)              — the label's QR code alone (same encoding), as an SVG with
 *                              its 4-module quiet zone; null without a link
 */

import { spoolLink, productLink } from "../qr-link.js";
import { p15Connect, p15Connected, p15Print, P15_MAX_MM } from "./p15.js";
export { spoolLink, productLink };

let ctx = null;
let current = null;   // { row } — the spool the card is for

const $ = id => document.getElementById(id);
const PREFS_KEY = "tigertag.label";

// The eleven templates (width × height in mm), laid out like the common spool
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
  { id: "p15",             w: 25, h: 12, slots: 0 },   // fits the Marklife P15's 12 × 30 mm labels with a margin
  { id: "ql62x29",         w: 58, h: 23, slots: 4 },   // the printable area of the Brother QL's DK-11209 62 × 29 mm labels
];
// The values a slot can show; all are print constants of the filament.
export const LABEL_SLOTS = ["nozzle", "bed", "dry", "td", "diameter"];
// `templateBy`: the format last picked with each printer, brought back when that
// printer is picked again.
// `printer`: where Print sends the label — "dialog" (the system print dialog),
// "p15" (a Marklife P15 over Bluetooth), "sys:<name>" (an installed printer,
// silently through its driver) or "net:<address>" (a Brother QL on the network).
// `qlRoll`: the roll loaded in the Brother QL ("62x0" continuous, "29x90" die-cut…,
// services/label-printers.js QL_MEDIA), "" = ask the printer.
// `qlHost`: { "sys:<name>": address } — the network address typed for an installed
// Brother QL, printed directly on its raw port (none found on its Windows port).
const DEFAULT_PREFS = { template: "classic", slots: ["nozzle", "bed", "dry", "td"], dpi: 203, kind: "spool", printer: "dialog", qlRoll: "", qlHost: {} };
// The Brother DK rolls offered in the card (QL_MEDIA keys), continuous first.
const QL_ROLLS = ["62x0", "29x0", "38x0", "50x0", "54x0", "12x0", "102x0", "29x90", "62x29", "62x100", "17x54", "17x87", "23x23", "29x42", "38x90", "39x48", "52x29", "102x51", "102x152"];

export function initLabels(c) {
  ctx = c;
  $("labelClose")?.addEventListener("click", closeLabelCard);
  // While Studio looks for the P15, every Bluetooth device the scan sees is listed
  // in the card: the printer can be picked by hand when its name is not a Marklife one.
  window.electronAPI?.onLabelBtDevices?.(list => drawBtDevices(list));
}

// The Bluetooth devices seen by the running scan (main.js select-bluetooth-device),
// drawn into the open card's .lbl-bt; null hides the list (the scan is over).
function drawBtDevices(list) {
  document.querySelectorAll(".lbl-bt").forEach(box => {
    if (!list) { box.hidden = true; box.innerHTML = ""; return; }
    const { t, esc } = ctx;
    box.hidden = false;
    box.innerHTML = `<p class="lbl-hint">${esc(t("labelBtPick"))}</p>
      <div class="lbl-bt-list">${list.map(d => `<button type="button" class="ghost sm" data-lbl-bt="${esc(d.id)}">${esc(d.name || t("labelBtNoName"))}</button>`).join("")}</div>
      <button type="button" class="ghost sm" data-lbl-bt="">${esc(t("btnCancel"))}</button>`;
  });
}

export function labelCardOpen() { return !!$("labelPanel")?.classList.contains("open"); }

function prefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (_) {}
  const out = { ...DEFAULT_PREFS, ...p };
  if (!LABEL_TEMPLATES.some(x => x.id === out.template)) out.template = DEFAULT_PREFS.template;
  if (![203, 300].includes(Number(out.dpi))) out.dpi = 203;
  if (typeof out.printer !== "string" || !out.printer) out.printer = "dialog";
  if (!QL_ROLLS.includes(out.qlRoll)) out.qlRoll = "";
  out.qlHost = out.qlHost && typeof out.qlHost === "object" ? out.qlHost : {};
  // `templateBy`: { printer id: template id } — the format last picked for each printer.
  const by = out.templateBy && typeof out.templateBy === "object" ? out.templateBy : {};
  out.templateBy = Object.fromEntries(Object.entries(by).filter(([, v]) => LABEL_TEMPLATES.some(x => x.id === v)));
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
  // `pillAt: [x, y]` places the pill there (under the name) instead of top right.
  ql62x29:  { brand: [10, 6, 400, 40], bar: [10, 48, 400, 34, 30, 4, 26], name: [10, 106, 26, 600, 410], hex: [418, 72, 20, 20],
              slots: { y: [146, 169, 192, 215], lx: 10, vx: 120, fs: 18, vw: 300 }, qr: [446, 96, 124] },
  p15:      { brand: [129, 6, 110, 26], bar: [129, 29, 110, 34, 19, 0, 14], barPlain: true, name: [129, 79, 18, 600, 110], pillAt: [129, 90], qr: [11, 8, 104] },
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

export function buildLabel(info, link, { template = "classic", slots = [], dpi = 203 } = {}) {
  const tpl = LABEL_TEMPLATES.find(x => x.id === template) || LABEL_TEMPLATES[0];
  const L = LAYOUTS[tpl.id];
  const f = dpi / 25.4 / U;                         // dots per layout unit
  const W = Math.round(tpl.w * dpi / 25.4), H = Math.round(tpl.h * dpi / 25.4);
  const LW = tpl.w * U, LH = tpl.h * U;             // the label in layout units
  // The bar prints the series alone ("PLA Rainbow"); the material when there is none.
  const barText = info.series || info.material || "";
  const slim = tpl.id === "slim" || tpl.id === "p15";   // the narrow ones: a smaller pill

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
  const px = L.pill ? (LW - pw) / 2 : L.pillAt ? L.pillAt[0] : LW - 10 - pw, py = L.pill ? L.pill[0] : L.pillAt ? L.pillAt[1] : 8;
  const pill = info.protocol ? `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${ph / 2}" fill="#fff" stroke="#000" stroke-width="2"/>`
    + `<text x="${px + pw / 2}" y="${py + ph / 2 + pfs * 0.36}" font-size="${pfs}" font-weight="800" text-anchor="middle">${ctx.esc(info.protocol)}</text>` : "";
  // How far right a line starting at x, with this baseline and size, may run: up to
  // the QR when the line is level with it and the code lies to its right, up to the
  // pill on the pill's row, else to the label's edge.
  const room = (x, y, size) => {
    const top = y - size * 0.8, bottom = y + size * 0.2;
    let right = LW - 10;
    if (Q && Q.x > x && bottom > Q.y - 2 && top < Q.y + Q.s) right = Math.min(right, Q.x - 8);
    if (pw && px > x && bottom > py - 2 && top < py + ph + 2) right = Math.min(right, px - 8);
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
    // `barPlain`: the series as bold black text, no black band — white text that
    // small fills in on a 203 dpi thermal head (the P15).
    // It takes two lines rather than shrink when it is long ("PETG Standard HS");
    // one that fits on a line sits midway between the brand and the name.
    if (barText && L.barPlain) {
      const one = textW(barText, rfs * 0.8, 700) <= rw - 2 * tdx;
      g += one ? svgText(barText, rx + tdx, ry + rh / 2 + rfs * 0.35, rfs, 700, rw - 2 * tdx)
        : svgLines(barText, rx + tdx, ry + tdy, rfs, 700, rw - 2 * tdx, rfs * 0.95, 2);
    }
    else if (barText) g += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="#000"/>` + svgText(barText, rx + tdx, ry + tdy, rfs, 700, rw - 2 * tdx, "#fff");
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

// ── Printers ─────────────────────────────────────────────────────────────────
// What Print can send a label to, besides the system dialog: a Marklife P15
// (Bluetooth, renderer/labels/p15.js), the printers installed on this computer
// (silently, through their driver) and the Brother QL printers announced on the
// network (their raw port, no driver). Searched once when the card first opens,
// again on the search button; the last answer is kept for the session.
let found = { installed: [], network: [] }, searched = false, searching = null;
function searchPrinters() {
  if (!window.electronAPI?.listLabelPrinters) return Promise.resolve(found);
  if (!searching) {
    searching = window.electronAPI.listLabelPrinters()
      .then(r => { found = { installed: r?.installed || [], network: (r?.network || []).filter(n => n.ql) }; })
      .catch(() => {})
      .finally(() => { searched = true; searching = null; });
  }
  return searching;
}
// The chosen printer: { id, kind: "dialog" | "p15" | "sys" | "net", name, dpi?, … }.
// One no longer found (switched off) stays listed under its last name, so the
// choice survives a restart until a search answers.
function printerFor(id) {
  if (id === "p15") return { id, kind: "p15", name: "Marklife P15", dpi: 203 };
  if (id.startsWith("sys:")) {
    const p = found.installed.find(x => x.id === id);
    const name = p?.name || id.slice(4);
    // An installed Brother QL goes straight to its raw port when its address is
    // known (its Windows port, or typed in the card): same path as a network QL.
    const ql = /\bQL-?\d/i.test(name);
    const host = ql ? (String(prefs().qlHost[id] || "").trim() || p?.host || "") : "";
    if (host) return { id, kind: "net", ql: true, sys: true, name, host, port: 9100, model: name.replace(/^Brother\s+/i, ""), dpi: 300, deviceName: p?.deviceName || id.slice(4) };
    return { id, kind: "sys", ql, name, deviceName: p?.deviceName || id.slice(4) };
  }
  if (id.startsWith("net:")) {
    const p = found.network.find(x => x.id === id);
    return { id, kind: "net", name: p?.model || p?.name || id.slice(4), host: p?.host || id.slice(4), port: p?.port || 9100, model: p?.model || "", dpi: 300 };
  }
  return { id: "dialog", kind: "dialog", name: "" };
}
// The printers' pictures, shown in the Printer list (assets/img/label_printers).
// A QL-5xx is drawn as the QL-580N, any other QL as the QL-800.
const PRINTER_THUMB = { p15: "marklife_p15.png", ql5: "brother_ql580n.png", ql: "brother_ql800.png" };
const thumbOf = (key, name = "") => {
  const k = key === "ql" && /\bQL-?5\d\d/i.test(name) ? "ql5" : key;
  return PRINTER_THUMB[k] ? `../assets/img/label_printers/${PRINTER_THUMB[k]}` : "";
};
function printerOptions(sel) {
  const { t } = ctx;
  const isQl = name => /\bQL-?\d/i.test(name || "");
  const opts = [["dialog", t("labelPrinterDialog"), ""], ["p15", t("labelPrinterP15") + (p15Connected() ? " · " + t("labelPrinterConnected") : ""), thumbOf("p15")]];
  found.network.forEach(p => opts.push([p.id, `${p.model || p.name} · ${t("labelPrinterNetwork")}`, isQl(p.model || p.name) ? thumbOf("ql", p.model || p.name) : ""]));
  found.installed.forEach(p => opts.push([p.id, `${p.name} · ${t("labelPrinterInstalled")}`, isQl(p.name) ? thumbOf("ql", p.name) : ""]));
  if (!opts.some(o => o[0] === sel)) { const pr = printerFor(sel); opts.push([sel, pr.name, pr.kind === "p15" ? thumbOf("p15") : pr.ql || isQl(pr.name) ? thumbOf("ql", pr.model || pr.name) : ""]); }
  return opts;
}
// A label fits the P15 when its short side is no wider than the roll and its
// long side no longer than one of the roll's 30 mm labels: a 40 × 12 label is
// narrow enough but runs past the end of the label it is printed on.
const P15_LABEL_MM = 30;
const fitsP15 = tpl => Math.min(tpl.w, tpl.h) <= P15_MAX_MM && Math.max(tpl.w, tpl.h) <= P15_LABEL_MM;
// A label fits a printer's roll: the P15's 15 mm roll; a Brother QL's roll as
// picked in the card — a continuous roll by its width, a die-cut one by its label,
// either way round (5 % leeway: the job is scaled to the printable area). Any
// other printer, or a QL whose roll is not known, takes every size.
function fitsPrinter(printer, tpl, roll = prefs().qlRoll) {
  if (!tpl) return false;
  if (printer.kind === "p15") return fitsP15(tpl);
  if (printer.kind !== "net" || !roll) return true;
  const [w, l] = roll.split("x").map(Number), k = 1.05;
  const short = Math.min(tpl.w, tpl.h), long = Math.max(tpl.w, tpl.h);
  if (!l) return short <= w * k;
  return (tpl.w <= w * k && tpl.h <= l * k) || (tpl.h <= w * k && tpl.w <= l * k) || (short <= Math.min(w, l) * k && long <= Math.max(w, l) * k);
}
// The template to fall back to when the current one does not fit: the printer's
// own (P15, Brother 62 × 29), else the first one that fits.
// A Brother QL is asked once a session which roll it holds (SNMP, main.js
// label:ql-roll); its answer becomes the card's roll, and its template follows.
const rollAsked = new Set();
function askRoll(printer, body, cur) {
  if (printer.kind !== "net" || rollAsked.has(printer.host) || !window.electronAPI?.labelQlRoll) return;
  rollAsked.add(printer.host);
  window.electronAPI.labelQlRoll(printer.host).then(key => {
    const q = prefs();
    if (!key || key === q.qlRoll || q.printer !== printer.id) return;
    q.qlRoll = key;
    q.template = key === "62x29" ? "ql62x29" : fittingTemplate(printer, q.template, key);
    savePrefs(q);
    if (body.isConnected) render(body, cur);
  }).catch(() => {});
}
function fittingTemplate(printer, current, roll) {
  const cur = LABEL_TEMPLATES.find(x => x.id === current);
  if (fitsPrinter(printer, cur, roll)) return current;
  const own = LABEL_TEMPLATES.find(x => x.id === (printer.kind === "p15" ? "p15" : "ql62x29"));
  if (fitsPrinter(printer, own, roll)) return own.id;
  return (LABEL_TEMPLATES.find(x => fitsPrinter(printer, x, roll)) || cur || LABEL_TEMPLATES[0]).id;
}

// ── The card ─────────────────────────────────────────────────────────────────
// `row` is a normalized spool row; ctx.labelInfo(row) gives the printed texts.
export function openLabelCard(row, { productOnly = false } = {}) {
  if (!row) return;
  current = { row, productOnly: productOnly && !!productLink(row.idProduct) };
  $("labelPanel")?.classList.add("open");
  render($("labelBody"), current);
  ctx.syncPanels?.();
}
// The spool changed while its label is open (a TD set, a colour renamed…): redraw
// with the live row, only when something the label prints has changed.
export function refreshLabelCard(row) {
  if (!labelCardOpen() || !current || !row || row.spoolId !== current.row.spoolId) return;
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
  const row = cur.row;
  const hasProduct = !!productLink(row.idProduct);
  const kind = cur.productOnly || (p.kind === "product" && hasProduct) ? "product" : "spool";
  const link = linkFor(row, kind);
  // A Filament Label is a catalogue product: it always carries the TigerQR+ pill.
  const info = { ...ctx.labelInfo(row), ...(kind === "product" ? { protocol: "TigerQR+" } : {}) };
  // A direct printer prints at its own resolution (P15 203 dpi, Brother QL 300 dpi).
  const printer = printerFor(p.printer);
  const lbl = buildLabel(info, link, { ...p, dpi: printer.dpi || p.dpi });
  const tplNow = LABEL_TEMPLATES.find(x => x.id === p.template);
  const noFit = !fitsPrinter(printer, tplNow, p.qlRoll);
  askRoll(printer, body, cur);
  watchQlState(printer, body);
  // Preview: the very page that is printed, scaled to the card.
  const boxW = 340, scale = Math.min(boxW / lbl.wDots, 220 / lbl.hDots);
  const seg = (id, on, label) => `<button type="button" class="lbl-seg-btn${on ? " is-active" : ""}" data-lbl-kind="${id}" aria-pressed="${on}">${esc(label)}</button>`;
  // A size the chosen printer's roll cannot take is greyed out and cannot be picked.
  const tplBtn = x => `<button type="button" class="lbl-tpl${x.id === p.template ? " is-active" : ""}" data-lbl-tpl="${x.id}" aria-pressed="${x.id === p.template}"${fitsPrinter(printer, x, p.qlRoll) ? "" : " disabled"}>
      <b>${esc(t("labelTpl_" + x.id))}</b><small>${x.w} × ${x.h} mm</small></button>`;
  const tpl = LABEL_TEMPLATES.find(x => x.id === p.template);
  const slotSel = i => `<select class="lbl-slot" data-lbl-slot="${i}"${i >= tpl.slots ? " disabled" : ""}>
      ${["none", ...LABEL_SLOTS].map(s => `<option value="${s}"${p.slots[i] === s ? " selected" : ""}>${esc(s === "none" ? t("labelSlotNone") : t(SLOT_LABEL[s]))}</option>`).join("")}
    </select>`;
  body.innerHTML = `
    <div class="panel-label">${esc(t("labelTemplate"))}</div>
    <div class="lbl-tpls">${LABEL_TEMPLATES.map(tplBtn).join("")}</div>
    ${hasProduct && !cur.productOnly ? `<div class="lbl-seg lbl-seg--kind" role="group">${seg("spool", kind === "spool", t("labelKindSpool"))}${seg("product", kind === "product", t("labelKindProduct"))}</div>` : ""}
    ${link ? "" : `<p class="lbl-hint">${esc(t("labelNoQr"))}</p>`}
    <div class="lbl-preview">${link ? `<button type="button" class="lbl-paper lbl-paper--link" data-lbl-open aria-label="${esc(t("labelOpenLink"))}"` : `<div class="lbl-paper"`} style="width:${Math.round(lbl.wDots * scale)}px;height:${Math.round(lbl.hDots * scale)}px">
      <iframe class="lbl-frame" title="" tabindex="-1" sandbox="" style="width:${lbl.wDots}px;height:${lbl.hDots}px;transform:scale(${scale})"></iframe>
      ${link ? `<span class="lbl-open-hint"><span class="icon icon-arrow-up-right icon-12" aria-hidden="true"></span>${esc(t("labelOpenLink"))}</span></button>` : "</div>"}
    </div>
    ${link ? `<div class="lbl-linkrow"><button type="button" class="ghost sm" data-lbl-copy><span class="icon icon-copy icon-14"></span><span>${esc(t("labelCopyLink"))}</span></button>${link ? `<button type="button" class="ghost sm" data-lbl-share><span class="icon icon-send icon-14"></span><span>${esc(t("productShare"))}</span></button>` : ""}</div>` : ""}
    <div class="panel-label">${esc(t("labelSlots"))}</div><div class="lbl-slots">${[0, 1, 2, 3].map(slotSel).join("")}</div>
    <div class="panel-label">${esc(t("labelPrinter"))}</div>
    <div class="lbl-printer">
      <select class="lbl-printer-sel" data-lbl-printer>${printerOptions(p.printer).map(([v, txt, img]) => `<option value="${esc(v)}"${img ? ` data-thumb="${esc(img)}"` : ""}${v === p.printer ? " selected" : ""}>${esc(txt)}</option>`).join("")}</select>
      <button type="button" class="ghost sm lbl-printer-search${searching ? " is-busy" : ""}" data-lbl-search aria-label="${esc(t("labelPrinterSearch"))}"><span class="icon icon-refresh icon-14"></span></button>
    </div>
    ${printer.kind === "p15" ? `<div class="lbl-p15">
      <span>${esc(p15Connected() ? t("labelPrinterConnected") + " : " + p15Connected() : t("labelBtNotConnected"))}</span>
      ${p15Connected() ? "" : `<button type="button" class="ghost sm" data-lbl-connect><span class="icon icon-refresh icon-14"></span><span>${esc(t("labelBtConnect"))}</span></button>`}
    </div><div class="lbl-bt" hidden></div>` : ""}
    ${printer.ql && printer.id.startsWith("sys:") ? `<div class="lbl-printer"><span class="lbl-roll-label">${esc(t("labelQlAddress"))}</span>
      <input type="text" class="lbl-host" data-lbl-host inputmode="decimal" spellcheck="false" placeholder="192.168.1.20" value="${esc(String(p.qlHost[printer.id] || found.installed.find(x => x.id === printer.id)?.host || ""))}"></div>` : ""}
    ${printer.kind === "net" ? `<div class="lbl-printer"><span class="lbl-roll-label">${esc(t("labelQlRoll"))}</span>
      <select class="lbl-roll-sel" data-lbl-roll>${["", ...QL_ROLLS].map(r => {
        const [w, l] = r.split("x");
        const txt = !r ? t("labelQlRollAuto") : l === "0" ? t("labelQlRollContinuous", { w }) : `${w} × ${l} mm`;
        return `<option value="${r}"${r === p.qlRoll ? " selected" : ""}>${esc(txt)}</option>`;
      }).join("")}</select></div>
      <div class="lbl-printer lbl-ql"><span class="lbl-ql-state" data-lbl-ql-state></span></div>` : ""}
    <p class="lbl-msg"></p>
    ${noFit ? `<p class="lbl-hint">${esc(t(printer.kind === "p15" ? "labelP15NoFit" : "labelQlNoFit"))}</p>` : ""}
    ${printer.dpi ? "" : `<div class="lbl-dpi"><span>${esc(t("labelDpi"))}</span>${[203, 300].map(d => `<button type="button" class="lbl-seg-btn${p.dpi === d ? " is-active" : ""}" data-lbl-dpi="${d}" aria-pressed="${p.dpi === d}">${d} dpi</button>`).join("")}</div>`}
    <div class="lbl-actions">
      <button type="button" class="primary sm" data-lbl-out="print"${noFit ? " disabled" : ""}><span class="icon icon-printer icon-14"></span><span>${esc(t("labelPrint"))}</span></button>
      <button type="button" class="ghost sm" data-lbl-out="pdf"><span class="icon icon-download icon-14"></span><span>PDF</span></button>
      <button type="button" class="ghost sm" data-lbl-out="png"><span class="icon icon-download icon-14"></span><span>PNG</span></button>
      <button type="button" class="ghost sm" data-lbl-out="svg"><span class="icon icon-download icon-14"></span><span>SVG</span></button>
    </div>
`;
  // The preview draws inside its frame: a spinner on the paper until it has loaded.
  const frame = body.querySelector(".lbl-frame"), paper = body.querySelector(".lbl-paper");
  paper?.classList.add("is-loading");
  frame.addEventListener("load", () => paper?.classList.remove("is-loading"), { once: true });
  frame.srcdoc = lbl.html;
  body.querySelectorAll(".lbl-slot, .lbl-printer-sel, .lbl-roll-sel").forEach(el => ctx.enhanceSelect?.(el));
  // The printers are searched once, the first time a card opens: redrawn when they answer.
  if (!searched && !searching) searchPrinters().then(() => { if (body.isConnected) render(body, cur); });
  body.onclick = e => {
    const k = e.target.closest("[data-lbl-kind]"), tp = e.target.closest("[data-lbl-tpl]"),
          d = e.target.closest("[data-lbl-dpi]"), out = e.target.closest("[data-lbl-out]");
    // The kind switch: let its pill slide first, then redraw with the other label.
    if (k) {
      if (k.classList.contains("is-active")) return;
      k.parentElement.querySelectorAll("[data-lbl-kind]").forEach(x => { const on = x === k; x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", String(on)); });
      savePrefs({ ...prefs(), kind: k.dataset.lblKind });
      setTimeout(() => render(body, cur), 200);
    }
    else if (tp) {
      // The format is remembered for the printer it was picked with.
      const q = prefs();
      savePrefs({ ...q, template: tp.dataset.lblTpl, templateBy: { ...q.templateBy, [q.printer]: tp.dataset.lblTpl } });
      render(body, cur);
    }
    else if (d) { savePrefs({ ...prefs(), dpi: Number(d.dataset.lblDpi) }); render(body, cur); }
    else if (out) {
      if (out.dataset.lblOut === "print" && printer.kind !== "dialog") printDirect(printer, lbl, row, kind, body, cur);
      else exportLabel(out.dataset.lblOut, lbl, row, kind, body.querySelector(".lbl-msg"));
    }
    else if (e.target.closest("[data-lbl-bt]")) window.electronAPI?.pickLabelBtDevice?.(e.target.closest("[data-lbl-bt]").dataset.lblBt);
    else if (e.target.closest("[data-lbl-connect]")) connectP15(body, cur);
    else if (e.target.closest("[data-lbl-search]")) {
      const b = e.target.closest("[data-lbl-search]");
      b.classList.add("is-busy");
      searchPrinters().then(() => { if (body.isConnected) render(body, cur); });
    }
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
    const roll = e.target.closest("[data-lbl-roll]");
    if (roll) {
      // A roll with its own template brings it (62 × 29 mm: the Brother template).
      const q = { ...prefs(), qlRoll: roll.value };
      if (roll.value === "62x29") q.template = "ql62x29";
      else q.template = fittingTemplate(printerFor(q.printer), q.template, roll.value);
      savePrefs(q); render(body, cur); return;
    }
    const hostEl = e.target.closest("[data-lbl-host]");
    if (hostEl) {
      const q = prefs(), v = hostEl.value.trim();
      q.qlHost = { ...q.qlHost, [q.printer]: v };
      if (!v) delete q.qlHost[q.printer];
      savePrefs(q); render(body, cur); return;
    }
    const pr = e.target.closest("[data-lbl-printer]");
    if (pr) {
      // Each printer brings back the format last printed on it; the P15 starts on its
      // own 25 × 12 mm template, and never keeps a label too wide for its roll.
      const q = { ...prefs(), printer: pr.value };
      const mine = q.templateBy[pr.value];
      if (mine) q.template = mine;
      else if (pr.value === "p15") q.template = "p15";
      else if (printerFor(pr.value).kind === "net" || printerFor(pr.value).ql) q.template = "ql62x29";
      q.template = fittingTemplate(printerFor(pr.value), q.template, q.qlRoll);
      savePrefs(q); render(body, cur); return;
    }
    const s = e.target.closest("[data-lbl-slot]");
    if (!s) return;
    const q = prefs(); q.slots[Number(s.dataset.lblSlot)] = s.value; savePrefs(q); render(body, cur);
  };
}

// What a failed P15 connection says: a printer not found or a computer without
// Bluetooth is said plainly (and not reported); anything else is an error.
const p15Error = e => Object.assign(new Error(e?.name === "NotFoundError" ? "notFound" : e?.message || "bluetooth"), { p15: true });
const p15Known = e => e?.p15 && { notFound: "labelP15NotFound", noBluetooth: "labelBtUnavailable", needRoll: "labelQlNeedRoll" }[e.message];

// The card's message, as a coloured pill: "busy" (blue: printing, searching),
// "ok" (green: sent, connected) or "error" (red). Empty text hides it.
function setMsg(msg, text, state = "error") {
  if (!msg) return;
  msg.textContent = text || "";
  msg.classList.remove("is-busy", "is-ok", "is-error");
  if (text) msg.classList.add("is-" + state);
}

// The P15's Connect button: the scan starts inside the click (Web Bluetooth needs it).
async function connectP15(body, cur) {
  const msg = body.querySelector(".lbl-msg");
  const conn = p15Connect();
  setMsg(msg, ctx.t("labelBtSearching"), "busy");
  try {
    await conn;
    if (body.isConnected) render(body, cur);
  } catch (err) {
    const e = p15Error(err), known = p15Known(e);
    setMsg(msg, ctx.t(known || "labelExportFailed"));
    if (!known) ctx.reportError?.("label.connect.p15", e);
  }
}

// The QL's state, read over SNMP every 5 s while its card is open: "In error"
// when the printer says ERROR, "Ready" when it says READY, nothing otherwise.
let qlStateTimer = null;
function watchQlState(printer, body) {
  clearTimeout(qlStateTimer);
  if (printer.kind !== "net" || !window.electronAPI?.labelQlState) return;
  const tick = async () => {
    const el = body.querySelector("[data-lbl-ql-state]");
    if (!el || !body.isConnected || !$("labelPanel")?.classList.contains("open")) return;
    const st = await window.electronAPI.labelQlState(printer.host).catch(() => null);
    if (!el.isConnected) return;
    const err = /error/i.test(st || ""), ready = /ready/i.test(st || "");
    el.textContent = err ? ctx.t("labelQlStateError") : ready ? ctx.t("labelQlStateReady") : "";
    el.classList.toggle("is-error", err);
    el.classList.toggle("is-ok", ready && !err);
    qlStateTimer = setTimeout(tick, 5000);
  };
  tick();
}

// Print without the dialog. The P15's Bluetooth connection is asked for FIRST,
// before anything is awaited: Web Bluetooth only opens inside the click.
async function printDirect(printer, lbl, row, kind, body, cur) {
  const msg = body.querySelector(".lbl-msg"), btn = body.querySelector('[data-lbl-out="print"]');
  const say = (text, state) => setMsg(msg, text, state);
  const conn = printer.kind === "p15" ? p15Connect() : null;
  conn?.catch(() => {});   // reported below, once awaited
  say(ctx.t("labelPrinting", { printer: printer.name }), "busy");
  if (btn) btn.disabled = true;
  try {
    let res;
    if (printer.kind === "p15") {
      try { await conn; } catch (e) { throw p15Error(e); }
      // The head runs across the roll: the label goes turned when its height is the short side.
      const bm = await window.electronAPI.labelBitmap({ html: lbl.html, wDots: lbl.wDots, hDots: lbl.hDots, rotate: lbl.mmH <= lbl.mmW });
      if (!bm?.ok) throw new Error(bm?.reason || "render failed");
      await p15Print(bm);
      res = { ok: true };
    } else if (printer.kind === "net") {
      res = await window.electronAPI.printLabelQl({ html: lbl.html, wDots: lbl.wDots, hDots: lbl.hDots, host: printer.host, port: printer.port, model: printer.model, roll: prefs().qlRoll });
      // The printer does not say which roll it holds: asked for, nothing sent.
      if (res?.needRoll) throw Object.assign(new Error("needRoll"), { p15: true });
    } else {
      res = await window.electronAPI.renderLabel({ ...lbl, format: "print", deviceName: printer.deviceName });
    }
    if (!res?.ok) throw new Error(res?.reason || "print failed");
    say(ctx.t("labelPrinted", { printer: printer.name }), "ok");
    ctx.onLabelOut?.({ row, kind, template: lbl.template, output: "print", dpi: lbl.dpi });
  } catch (e) {
    // Nothing to report for a printer switched off or a computer without Bluetooth: said plainly.
    const known = p15Known(e);
    say(ctx.t(known || "labelExportFailed"), "error");
    if (!known) ctx.reportError?.("label.print." + printer.kind, e);
  } finally {
    if (btn) btn.disabled = false;
    // "· connected" in the list once the P15 answered.
    if (printer.kind === "p15") { const sel = body.querySelector("[data-lbl-printer]"); const o = sel?.querySelector('option[value="p15"]'); if (o) o.textContent = ctx.t("labelPrinterP15") + (p15Connected() ? " · " + ctx.t("labelPrinterConnected") : ""); }
  }
}

async function exportLabel(format, lbl, row, kind, msg) {
  setMsg(msg, "");
  const id = kind === "product" ? productLink(row.idProduct).split("/").pop() : String(row.spoolId).replace(/^TigerData_/, "");
  const fileName = `tigertag-${kind}-${id}-${lbl.mmW}x${lbl.mmH}`;
  const svg = format === "svg" ? lbl.svg : undefined;   // the label itself, sized in millimetres
  try {
    const res = await window.electronAPI?.renderLabel?.({ ...lbl, svg, format, fileName });
    if (!res?.ok && res?.reason !== "cancelled" && format !== "print") throw new Error(res?.reason || "render failed");
    // A label actually printed or saved (not a cancelled dialog): counted (print_label).
    if (res?.ok) ctx.onLabelOut?.({ row, kind, template: lbl.template, output: format, dpi: lbl.dpi });
  } catch (e) {
    setMsg(msg, ctx.t("labelExportFailed"));
    ctx.reportError?.("label." + format, e);
  }
}
