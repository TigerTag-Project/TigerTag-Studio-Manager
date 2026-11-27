/**
 * renderer/labels/ble-printer.js — prints a label on a Bluetooth label printer
 * (Niimbot, Phomemo M-series, Marklife P15) through Web Bluetooth. Model by model
 * it follows the mobile app (tigertag_connect1 `lib/services/label_printer.dart`),
 * where each sequence was checked on paper.
 *
 *   printLabelsBle(makers, { onStep, onProgress, stop }) — several labels in one go,
 *       one make({ dpi, template }) → buildLabel(…) each, for the printer found (its
 *       resolution; the slim 40 × 12 template on the narrow 12 mm heads).
 *       onStep(step, extra): "search", "choose" (extra = { devices: [{ id, name }],
 *       choose(id) }), "connect", "print"; onProgress(printed, total, label) after
 *       each label; stop() ends after the current one. Resolves { name, model,
 *       template, dpi, turned, printed, total }; an error carries `printed` (resume from the
 *       next one). The default printer is asked for first; not seen in 6 s, the ones
 *       in range are listed through onStep("choose").
 *   printLabelBle(make, { onStep }) — one label: a batch of one.
 *   labelPrinterModel(bleName) — the model behind a Bluetooth name, or null.
 *   lastBlePrinter() — the default printer: the one used (or chosen) last; a print
 *       goes straight to it (main.js takes it the moment it is seen).
 *   defaultBlePrinter() → { name, model, template } | null; setDefaultBlePrinter(name).
 *   choosePrinter(onList) — lists the printers in range (onList(devices, choose) as
 *       they appear, the default first) until one is picked; resolves its Bluetooth
 *       name, made the default. Nothing is connected or printed. cancelChoose().
 *   rememberPrinterTemplate(name, template) / modelTemplate(name) — each MODEL keeps
 *       the template of its roll (tigertag.blePrinter `templates`, keyed by the model's
 *       name; an older entry keyed by the Bluetooth name is still read): a print takes
 *       it, else the template picked last; picking a template stores it for the
 *       default printer's model. The narrow heads always print the slim template.
 *
 * main.js answers Chromium's device chooser (`select-bluetooth-device`): the default
 * printer the moment it is seen, else one printer in range at once; several are
 * offered through onStep("choose").
 *
 * Niimbot (service e7810a71…, one characteristic, packets `55 55 cmd len data… xor
 * AA AA`, NiimBlue github.com/MultiMote/niimbluelib): connect `C1 01`, then one of
 * three forms —
 *   v4  (D110_M from protocol 300, B1 Pro, B21 Pro): label type, density, 9-byte
 *       print start, print status one-way, 13-byte page size, no page start
 *   b1  (B1, B3S, B18, D110_M before protocol 300): density, label type, 7-byte
 *       print start, page start, 6-byte page size
 *   old (D110, D11, D101, B21): 1-byte print start, print clear, page start,
 *       4-byte page size, copies
 * then the rows (0x85 ink / 0x84 blank, identical rows sent once with a repeat),
 * page end, status poll until the page is out, print end. The D110_M on protocol
 * v4 ACKs the old form but feeds blank labels: only v4 inks it (2026-11-25).
 * A batch on v4 / b1 is ONE connection and ONE job of N pages (the count in print
 * start, each page sized, sent and ended in turn, then the status until N are out —
 * checked on paper on the B1, B1 Pro and D110_M, 2026-11-26); the old form repeats
 * its one-page job on the same connection.
 *
 * Phomemo M-series (service FF00, write FF02): one ESC/POS-style stream — speed,
 * density, gap labels, `1D 76 30` raster, feed to the gap. One label per connection
 * in a batch (not checked on paper in a batch).
 *
 * Marklife P15 (Pristar P15; service FF00: FF02 writes, FF03 credits `01 n` = n more
 * writes of ≤ 90 bytes): speed LOW `1F 60 01 00`, density `10 FF 10 00 01`, then
 * `10 FF FE 01`, `1D 76 30` raster, `1D 0C` (next label), `10 FF FE 45`, then 3 s
 * before disconnecting. ONE job per connection: a batch connects again for each
 * label (about 6 s a label); without the low speed one label of a batch comes out
 * smudged (2026-11-26). Its newer `1F C0 …` / zlib form is ACKed but blank.
 */

const NIIM_SERVICE = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const NIIM_CHAR = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";
const FF00 = 0xff00;
const PREFS_KEY = "tigertag.blePrinter";

// Known models by the start of their Bluetooth name ("B1-I820…", "B1 Pro-I820…",
// "D110_M-I905…", "P15R_09B8_BLE"), longest prefixes first. head = dots across,
// turned = a narrow head on 12 mm rolls: the label goes through turned a quarter.
const MODELS = [
  ["B21_PRO", { brand: "niimbot",  name: "Niimbot B21 Pro", head: 591, dpi: 300, form: "v4" }],
  ["B1_PRO",  { brand: "niimbot",  name: "Niimbot B1 Pro",  head: 591, dpi: 300, form: "v4" }],
  ["B3S",     { brand: "niimbot",  name: "Niimbot B3S",     head: 576, dpi: 203, form: "b1" }],
  ["B18",     { brand: "niimbot",  name: "Niimbot B18",     head: 120, dpi: 203, form: "b1", turned: true }],
  ["B21",     { brand: "niimbot",  name: "Niimbot B21",     head: 384, dpi: 203, form: "old" }],
  ["B1",      { brand: "niimbot",  name: "Niimbot B1",      head: 384, dpi: 203, form: "b1" }],
  ["D110_M",  { brand: "niimbot",  name: "Niimbot D110-M",  head: 96,  dpi: 203, form: "ask", turned: true }],
  ["D110",    { brand: "niimbot",  name: "Niimbot D110",    head: 96,  dpi: 203, form: "old", turned: true }],
  ["D101",    { brand: "niimbot",  name: "Niimbot D101",    head: 192, dpi: 203, form: "old", turned: true }],
  ["D11",     { brand: "niimbot",  name: "Niimbot D11",     head: 96,  dpi: 203, form: "old", turned: true }],
  ["M110",    { brand: "phomemo",  name: "Phomemo M110",    head: 384, dpi: 203 }],
  ["M120",    { brand: "phomemo",  name: "Phomemo M120",    head: 384, dpi: 203 }],
  ["M200",    { brand: "phomemo",  name: "Phomemo M200",    head: 576, dpi: 203 }],
  ["M220",    { brand: "phomemo",  name: "Phomemo M220",    head: 576, dpi: 203 }],
  ["M221",    { brand: "phomemo",  name: "Phomemo M221",    head: 576, dpi: 203 }],
  ["Q199",    { brand: "phomemo",  name: "Phomemo M110",    head: 384, dpi: 203 }],
  ["P15",     { brand: "marklife", name: "Marklife P15",    head: 96,  dpi: 203, turned: true }],
];

export function labelPrinterModel(bleName) {
  // "B1 Pro-…" is the B1_PRO; "B1" must not take "B18-…", nor "D11" take "D110-…".
  const n = String(bleName || "").trim().toUpperCase().replace(/ /g, "_");
  for (const [prefix, m] of MODELS) {
    if (n.startsWith(prefix) && (n.length === prefix.length || !/\d/.test(n[prefix.length]))) return m;
  }
  return null;
}

// tigertag.blePrinter: { name: the default printer (used or chosen last),
// templates: { modelName: templateId } } — older entries keyed by a Bluetooth name are still read.
function memo() { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (_) { return {}; } }
function saveMemo(m) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(m)); } catch (_) {} }
export function lastBlePrinter() { return memo().name || ""; }
export function setDefaultBlePrinter(name) { if (labelPrinterModel(name)) saveMemo({ ...memo(), name }); }
export function modelTemplate(name) {
  const model = labelPrinterModel(name);
  if (!model) return null;
  if (model.turned) return "slim";
  const t = memo().templates || {};
  return t[model.name] || t[name] || null;
}
export function defaultBlePrinter() {
  const name = lastBlePrinter(), model = labelPrinterModel(name);
  return model ? { name, model: model.name, template: modelTemplate(name), turned: !!model.turned } : null;
}
export function rememberPrinterTemplate(name, template) {
  const model = labelPrinterModel(name);
  if (!model || !template || model.turned) return;
  const m = memo();
  m.templates = { ...(m.templates || {}), [model.name]: template };
  saveMemo(m);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hi = n => (n >> 8) & 0xff, lo = n => n & 0xff;

// ── Writes ───────────────────────────────────────────────────────────────────
// With response when the characteristic allows it (it paces the stream), else
// without and a short gap; cut into pieces of `chunk` bytes.
async function writeAll(ch, bytes, chunk = 180) {
  const withResponse = ch.properties.write;
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.slice(i, i + chunk);
    if (withResponse) await ch.writeValueWithResponse(part);
    else { await ch.writeValueWithoutResponse(part); await sleep(8); }
  }
}

async function connectGatt(device) {
  let err;
  for (let i = 0; i < 3; i++) {   // Web Bluetooth sometimes drops right after connect: try again
    try { return await device.gatt.connect(); }
    catch (e) { err = e; try { device.gatt.disconnect(); } catch (_) {} await sleep(500); }
  }
  throw err;
}

// ── The label as print-head rows ─────────────────────────────────────────────
// Draws the label's SVG at the printer's dots, turned a quarter clockwise for a
// narrow head (the label's left edge first). Every Bluetooth print keeps a safety
// margin on each side of the label, on both axes, on top of the template's own (a
// roll off by a hair must not print past the edge; founder's rule, 2026-11-26):
// 0.5 mm on every printer. The drawing is scaled by
// min(1, (min(across, head) − 2 m) / across, (length − 2 m) / length) and centred;
// the label keeps its full length in rows.
// Rows are the head rounded up to whole bytes (591 dots → 74 bytes, as NiimBlue
// and the mobile app send), MSB first, 1 = ink.
async function rasterize(lbl, head, turned) {
  const W = lbl.wDots, H = lbl.hDots;
  const svg = lbl.svg.replace(/width="[^"]*mm" height="[^"]*mm"/, `width="${W}" height="${H}"`);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const cols = Math.ceil(head / 8) * 8;
  const w = turned ? H : W, h = turned ? W : H;            // across the head, along the feed
  const inset = 0.5 * (lbl.dpi || 203) / 25.4;
  const k = Math.min(1, (Math.min(w, head) - 2 * inset) / w, (h - 2 * inset) / h);
  const rows = Math.max(1, Math.round(h));
  const canvas = document.createElement("canvas");
  canvas.width = cols; canvas.height = rows;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, cols, rows);
  g.translate((head - w * k) / 2, (h - h * k) / 2);
  if (turned) { g.translate(w * k, 0); g.rotate(Math.PI / 2); }
  g.drawImage(img, 0, 0, W * k, H * k);
  const px = g.getImageData(0, 0, cols, rows).data;
  const rb = cols / 8, bits = new Uint8Array(rb * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (px[i + 3] > 127 && lum < 128) bits[y * rb + (x >> 3)] |= 0x80 >> (x & 7);
  }
  // dots: the head's real width, the page size Niimbot is told (591 on the B1 Pro,
  // with 74-byte rows: printed edge to edge on a 50 × 30 label, 2026-11-26).
  return { cols, dots: head, rows, rb, bits, row: y => bits.subarray(y * rb, (y + 1) * rb) };
}

// The ESC/POS raster both FF00 brands take: `GS v 0`, width in bytes, height in rows.
const gsv0 = bm => [0x1d, 0x76, 0x30, 0x00, lo(bm.rb), hi(bm.rb), lo(bm.rows), hi(bm.rows), ...bm.bits];

// ── Niimbot ──────────────────────────────────────────────────────────────────
function niimPacket(cmd, data = [1]) {
  let x = cmd ^ data.length;
  for (const b of data) x ^= b;
  return new Uint8Array([0x55, 0x55, cmd, data.length, ...data, x & 0xff, 0xaa, 0xaa]);
}

// 0x84 for a run of blank rows, 0x85 for a run of identical inked rows (row u16,
// black dots in each third of the row ≤ 255 — the printer's power budget — repeat, bytes).
function niimRows(bm) {
  const out = [], third = Math.max(1, Math.floor(bm.rb / 3));
  const same = (a, b) => a.every((v, i) => v === b[i]);
  for (let y = 0; y < bm.rows;) {
    const r = bm.row(y);
    let n = 1;
    while (y + n < bm.rows && n < 255 && same(bm.row(y + n), r)) n++;
    if (!r.some(Boolean)) out.push(niimPacket(0x84, [hi(y), lo(y), n]));
    else {
      const parts = [0, 0, 0];
      r.forEach((b, i) => { let c = 0; for (let v = b; v; v >>= 1) c += v & 1; const p = Math.min(2, Math.floor(i / third)); parts[p] = Math.min(255, parts[p] + c); });
      out.push(niimPacket(0x85, [hi(y), lo(y), ...parts, n, ...r]));
    }
    y += n;
  }
  return out;
}

class NiimLink {
  constructor(ch) { this.ch = ch; this.buf = []; this.waiter = null; }
  async open() {
    this.ch.addEventListener("characteristicvaluechanged", e => this.feed(new Uint8Array(e.target.value.buffer)));
    await this.ch.startNotifications();
  }
  // Notifications can split or join packets: rebuilt from 55 55 … AA AA.
  feed(bytes) {
    this.buf.push(...bytes);
    for (;;) {
      let s = -1;
      for (let i = 0; i + 1 < this.buf.length; i++) if (this.buf[i] === 0x55 && this.buf[i + 1] === 0x55) { s = i; break; }
      if (s < 0 || this.buf.length < s + 4) return;
      if (s) this.buf.splice(0, s);
      const total = 4 + this.buf[3] + 3;
      if (this.buf.length < total) return;
      const p = this.buf.splice(0, total);
      const cmd = p[2], data = p.slice(4, 4 + p[3]);
      if (this.waiter && (cmd === this.waiter.answer || cmd === 0xdb)) {
        const w = this.waiter; this.waiter = null; clearTimeout(w.timer); w.resolve({ cmd, data });
      }
    }
  }
  send(p) { return writeAll(this.ch, p); }
  // A command and its answer's data (3 s); a printer error (0xDB) ends the job.
  async cmd(code, data, answer) {
    const wait = new Promise((resolve, reject) => {
      this.waiter = { answer, resolve, timer: setTimeout(() => { this.waiter = null; reject(new Error(`no answer to 0x${code.toString(16)}`)); }, 3000) };
    });
    await this.send(niimPacket(code, data));
    const res = await wait;
    if (res.cmd === 0xdb) throw new Error(`printer error ${res.data[0] ?? ""} on 0x${code.toString(16)}`);
    return res.data;
  }
}

// ONE connection, ONE job of N pages on the b1 and v4 forms (checked on paper on the
// B1, B1 Pro and D110_M, 2026-11-26): print start carries the page count (u16 BE),
// then each page — b1: page start — its size, its rows, page end (E3 → E4, retried
// while it answers 00: the printer holds a page until the previous one is out); after
// the last one, status (A3 → B3: printed pages u16) until all N are out, then print
// end (+ DC on v4). The old form (D11, D101, D110, B21) runs its one-page job per page
// on the same connection. `done()` after each page is accepted; `stop()` ends the job
// after the current page.
async function niimbotRun(server, model, lbls, onStep, done, stop) {
  const svc = await server.getPrimaryService(NIIM_SERVICE);
  const ch = await svc.getCharacteristic(NIIM_CHAR);
  const link = new NiimLink(ch);
  await link.open();
  await link.cmd(0xc1, [1], 0xc2);                                         // connect
  let form = model.form;
  if (form === "ask") {   // the D110_M: v4 from protocol 300 (status data bytes 11–12), else the B1 form
    form = "b1";
    try {
      const d = await link.cmd(0xa5, [1], 0xb5);
      if (d.length >= 13 && d[11] * 100 + d[12] >= 300) form = "v4";
    } catch (_) {}
  }
  const pages = [];
  for (const lbl of lbls) pages.push(await rasterize(lbl, model.head, model.turned));
  const started = d => { if (d.length && d[0] === 0) throw new Error("print start refused"); };
  // Page end: "not yet" (00) while the printer still holds the previous page (15 s).
  const pageEnd = async () => {
    const until = Date.now() + 15000;
    for (;;) {
      const d = await link.cmd(0xe3, [1], 0xe4);
      if (!d.length || d[0] !== 0 || Date.now() > until) return;
      await sleep(150);
    }
  };
  // Until `n` pages are out (B3: printed pages u16, print %, feed %).
  const outCount = async (n, ms) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const d = await link.cmd(0xa3, [1], 0xb3).catch(() => []);
      if (d.length >= 2 && ((d[0] << 8) | d[1]) >= n) return;
      await sleep(300);
    }
  };
  onStep?.("print");
  if (form === "old") {
    for (const bm of pages) {
      const r = bm.rows, c = bm.dots;
      await link.cmd(0x21, [3], 0x31);
      await link.cmd(0x23, [1], 0x33);
      started(await link.cmd(0x01, [1], 0x02));
      await link.cmd(0x20, [1], 0x30).catch(() => {});                    // print clear: some firmwares stay silent
      await link.cmd(0x03, [1], 0x04);
      await link.cmd(0x13, [hi(r), lo(r), hi(c), lo(c)], 0x14);
      await link.cmd(0x15, [0, 1], 0x16);                                  // copies
      for (const p of niimRows(bm)) await link.send(p);
      await pageEnd();
      await outCount(1, 20000);
      await link.cmd(0xf3, [1], 0xf4);                                     // print end
      done();
      if (stop?.()) break;
    }
    return;
  }
  const n = pages.length;
  if (form === "v4") {
    await link.cmd(0x23, [1], 0x33);                                       // label type: with gaps
    await link.cmd(0x21, [3], 0x31);                                       // density (1–5)
    started(await link.cmd(0x01, [hi(n), lo(n), 0, 0, 0, 0, 0, 0, 0], 0x02)); // print start, n pages
    await link.send(niimPacket(0xa3, [1]));                                // status, not awaited
  } else {
    await link.cmd(0x21, [3], 0x31);
    await link.cmd(0x23, [1], 0x33);
    started(await link.cmd(0x01, [hi(n), lo(n), 0, 0, 0, 0, 0], 0x02));
  }
  let sent = 0;
  for (const bm of pages) {
    const r = bm.rows, c = bm.dots;
    if (form === "b1") await link.cmd(0x03, [1], 0x04);                    // page start
    await link.cmd(0x13, form === "v4" ? [hi(r), lo(r), hi(c), lo(c), 0, 1, 0, 0, 0, 0, 0, 0, 0] : [hi(r), lo(r), hi(c), lo(c), 0, 1], 0x14);
    for (const p of niimRows(bm)) await link.send(p);
    await pageEnd();
    sent++;
    done();
    if (sent < n && stop?.()) break;
  }
  await outCount(sent, 6000 + sent * 3000);                                // ~36 s for a dozen
  await link.cmd(0xf3, [1], 0xf4);                                         // print end
  if (form === "v4") await link.send(niimPacket(0xdc, [1]));               // heartbeat, closes the job
}

// ── Phomemo M-series ─────────────────────────────────────────────────────────
// One label per connection (not checked in a batch: the safe way, as the P15).
async function phomemoOne(server, model, lbl, onStep) {
  const svc = await server.getPrimaryService(FF00);
  const tx = await svc.getCharacteristic(0xff02);
  try { await (await svc.getCharacteristic(0xff03)).startNotifications(); } catch (_) {}
  const bm = await rasterize(lbl, model.head, model.turned);
  onStep?.("print");
  await writeAll(tx, new Uint8Array([
    0x1b, 0x4e, 0x0d, 0x05,          // speed
    0x1b, 0x4e, 0x04, 10,            // density (1–15)
    0x1f, 0x11, 0x0a,                // media: labels with gaps
    ...gsv0(bm),
    0x1f, 0xf0, 0x05, 0x00,
    0x1f, 0xf0, 0x03, 0x00,          // feed to the gap
  ]));
  await sleep(500);
}

// ── Marklife P15 ─────────────────────────────────────────────────────────────
// It prints ONE job per Bluetooth connection (a second one on the same link is
// dropped, 2026-11-26): each label connects, sets the LOW speed (`1F 60 01 00` —
// without it one label of a batch comes out fast and smudged) and a medium density
// (`10 FF 10 00 01`), sends its job, waits 3 s (its status answers "idle" even while
// printing, so it cannot pace) and disconnects. About 6 s a label.
async function marklifeOne(server, model, lbl, onStep) {
  const svc = await server.getPrimaryService(FF00);
  const [tx, flow] = await Promise.all([0xff02, 0xff03].map(u => svc.getCharacteristic(u)));
  // Credits (FF03): `01 n` = n more writes of ≤ 90 bytes; a write waits for one (10 s).
  let credits = 0, wake = null;
  flow.addEventListener("characteristicvaluechanged", e => {
    const d = new Uint8Array(e.target.value.buffer);
    if (d[0] === 0x01 && d.length >= 2) { credits += d[1]; wake?.(); }
  });
  await flow.startNotifications();
  const bm = await rasterize(lbl, model.head, true);
  const write = async bytes => {
    for (let i = 0; i < bytes.length; i += 90) {
      while (credits <= 0) {
        const got = await Promise.race([new Promise(r => { wake = () => r(true); }), sleep(10000).then(() => false)]);
        wake = null;
        if (!got) throw new Error("no write credit from the printer");
      }
      credits--;
      await tx.writeValueWithoutResponse(bytes.slice(i, i + 90));
    }
  };
  onStep?.("print");
  await write(new Uint8Array([0x1f, 0x60, 0x01, 0x00, 0x10, 0xff, 0x10, 0x00, 0x01]));   // speed low, density medium
  await sleep(300);
  await write(new Uint8Array([0x10, 0xff, 0xfe, 0x01, ...gsv0(bm), 0x1d, 0x0c, 0x10, 0xff, 0xfe, 0x45]));
  await sleep(3000);
}

// ── The print ────────────────────────────────────────────────────────────────
// navigator.bluetooth.requestDevice, with main.js choosing: the default printer is
// taken as soon as it is seen; else one printer in range is taken, several are handed
// to onStep("choose") (the default first). `list`: always list (choosePrinter).
async function requestPrinter(onStep, { list = false } = {}) {
  const last = lastBlePrinter();
  const api = window.electronAPI;
  await api?.blePrefer?.({ prefer: last, list });
  let offDevices = null, offGaveUp = null;
  const gaveUp = new Promise((_, reject) => { offGaveUp = api?.onBleGaveUp?.(() => reject(new Error("no printer found"))); });
  offDevices = api?.onBleDevices?.(list => {
    const devices = list.filter(d => labelPrinterModel(d.name))
      .sort((a, b) => (b.name === last) - (a.name === last) || a.name.localeCompare(b.name));
    onStep?.("choose", { devices, choose: id => api.bleChoose(id) });
  });
  try {
    const prefixes = [...new Set(MODELS.map(([p]) => p.split("_")[0]))];
    return await Promise.race([
      navigator.bluetooth.requestDevice({ filters: prefixes.map(namePrefix => ({ namePrefix })), optionalServices: [NIIM_SERVICE, FF00] }),
      gaveUp,
    ]);
  } finally {
    offDevices?.(); offGaveUp?.();
  }
}

// Labels to the default printer (else the one picked), in order. `makers`: one
// make({ dpi, template }) per label. onProgress(printed, total, label) after each one;
// stop() ends after the current one. An error carries `printed` (how many went
// through), so a batch can resume from the next one.
export async function printLabelsBle(makers, { onStep, onProgress, stop } = {}) {
  if (!navigator.bluetooth) throw new Error("Web Bluetooth unavailable");
  if (!makers?.length) throw new Error("nothing to print");
  onStep?.("search");
  const device = await requestPrinter(onStep);
  const model = labelPrinterModel(device.name);
  if (!model) throw new Error(`unsupported printer ${device.name}`);
  // The model's own template (its roll), else the one picked last; slim on a narrow head.
  const template = modelTemplate(device.name);
  saveMemo({ ...memo(), name: device.name });
  const lbls = makers.map(mk => mk({ dpi: model.dpi, ...(template ? { template } : {}) }));
  let printed = 0;
  const done = () => { printed++; onProgress?.(printed, lbls.length, lbls[printed - 1]); };
  const disconnect = () => { try { device.gatt.disconnect(); } catch (_) {} };
  try {
    if (model.brand === "niimbot") {
      onStep?.("connect");
      const server = await connectGatt(device);
      try { await niimbotRun(server, model, lbls, onStep, done, stop); await sleep(300); }
      finally { disconnect(); }
    } else {
      const one = model.brand === "phomemo" ? phomemoOne : marklifeOne;
      for (const lbl of lbls) {
        onStep?.("connect");
        const server = await connectGatt(device);
        try { await one(server, model, lbl, onStep); }
        finally { disconnect(); }
        done();
        if (printed < lbls.length && stop?.()) break;
        await sleep(400);   // the link really down before the next one
      }
    }
  } catch (e) {
    e.printed = printed;
    throw e;
  }
  rememberPrinterTemplate(device.name, lbls[0].template);
  return { name: device.name, model: model.name, template: lbls[0].template, dpi: lbls[0].dpi, turned: !!model.turned, printed, total: lbls.length };
}
export function printLabelBle(make, opts) { return printLabelsBle([make], opts); }

// The printers in range, to pick the default one: nothing is connected or printed.
export async function choosePrinter(onList) {
  if (!navigator.bluetooth) throw new Error("Web Bluetooth unavailable");
  const device = await requestPrinter((step, extra) => { if (step === "choose") onList?.(extra.devices, extra.choose); }, { list: true });
  setDefaultBlePrinter(device.name);
  return device.name;
}
export function cancelChoose() { window.electronAPI?.bleCancel?.(); }

export { rasterize as labelRows };   // the rows a print would send (dev checks)
