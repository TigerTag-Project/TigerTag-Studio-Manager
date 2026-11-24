/**
 * renderer/labels/p15.js — the Marklife P15 (and its BLE siblings: P15R/P15S,
 * P7, LP15…), printed over Bluetooth LE from Studio, no driver, no app.
 *
 * The printer speaks Marklife's "L11" binary protocol on service 0xFF00:
 * commands are written to 0xFF02 (write without response), answers arrive on
 * 0xFF01 and flow-control credits on 0xFF03 ([0x01, n] = n more packets may be
 * sent). Data goes out in 95-byte packets, one every 30 ms while credits last.
 * The protocol and these values come from the open-source thermoprint project
 * (github.com/tomLadder/thermoprint, MIT), which prints on a real P15.
 *
 * A print job: thickness (10 FF 10 00 TT), wake-up (15 × 00), enable
 * (10 FF F1 02), the bitmap (GS v 0: 1D 76 30 00 wL wH hL hH + rows, 1 = black,
 * MSB first), next gap (1D 0C), stop (10 FF F1 45). The head runs ACROSS the
 * label roll (12-15 mm), so the label is sent turned a quarter turn: its height
 * is the line width (renderer/labels asks main for the bitmap already turned).
 *
 *   p15Connected()           — a P15 is connected (its name) or null
 *   p15Connect()             — finds and connects the printer (must run inside a
 *                              click: Web Bluetooth needs a user gesture); main.js
 *                              picks the printer by its advertised name. Throws
 *                              "noBluetooth" without an adapter, NotFoundError when
 *                              no printer answered
 *   p15Print(bitmap, opts)   — one label; resolves once the printer says it is done
 *                              (or after a grace period when it says nothing)
 *   P15_MAX_MM               — the widest label side the roll takes (15 mm)
 */

const SERVICE = 0xff00, TX = 0xff02, RX = 0xff01, CX = 0xff03;
const PACKET = 95, TICK_MS = 30, STARVE_MS = 1000;
export const P15_MAX_MM = 15;

let dev = null;          // { device, tx, rx, cx, name }
let credits = 0, lastCredit = 0, hasCx = false;
let onRx = null;         // the pending "print finished" waiter

// Let go of the printer when the window goes away: a connection left open by a
// closed or restarted Studio keeps the P15 from advertising until it is switched
// off and on again.
if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("beforeunload", () => { try { dev?.device?.gatt?.disconnect(); } catch (_) {} });

export function p15Connected() { return dev?.device?.gatt?.connected ? dev.name : null; }

export async function p15Connect() {
  if (p15Connected()) return dev.name;
  // No adapter, or Bluetooth switched off: said as such, not as "no printer found".
  if (!navigator.bluetooth || !(await navigator.bluetooth.getAvailability().catch(() => true))) throw new Error("noBluetooth");
  // Reuse the device picked earlier in this session when it is only out of range / asleep.
  let device = dev?.device || null;
  if (!device) {
    // Any device: main.js picks the printer by its advertised name (BT_PRINTER:
    // P15, P7, LP15, Marklife…) and logs every name the scan saw when none matched.
    device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [SERVICE] });
  }
  // Windows often fails the first GATT connection to a printer just found (or
  // one that has only just been let go): tried three times before giving up.
  let svc = null, lastErr = null;
  for (let attempt = 0; attempt < 3 && !svc; attempt++) {
    try {
      const server = await device.gatt.connect();
      svc = await server.getPrimaryService(SERVICE);
    } catch (e) {
      lastErr = e;
      try { device.gatt.disconnect(); } catch (_) {}
      await sleep(600 * (attempt + 1));
    }
  }
  if (!svc) throw lastErr || new Error("connect failed");
  const tx = await svc.getCharacteristic(TX);
  const rx = await svc.getCharacteristic(RX);
  let cx = null;
  try { cx = await svc.getCharacteristic(CX); } catch (_) { cx = null; }
  await rx.startNotifications();
  rx.addEventListener("characteristicvaluechanged", e => handleRx(new Uint8Array(e.target.value.buffer)));
  credits = 0; hasCx = !!cx;
  if (cx) {
    await cx.startNotifications();
    cx.addEventListener("characteristicvaluechanged", e => handleCx(new Uint8Array(e.target.value.buffer)));
    // The printer grants its first credits right after the connection.
    await waitFor(() => credits > 0, 2000);
  }
  device.addEventListener("gattserverdisconnected", () => { credits = 0; }, { once: true });
  dev = { device, tx, rx, cx, name: device.name || "Marklife" };
  return dev.name;
}

function handleCx(d) {
  if (d[0] === 0x01 && d.length >= 2) { credits += d[1]; lastCredit = Date.now(); }
}
// 0xAA, 'O' or 'K' first: the label is printed. [0xFF, code]: a status (out of
// paper 01, cover open 02, overheating 03; low battery 04 still prints).
const STATUS = { 1: "out_of_paper", 2: "cover_open", 3: "overheating" };
function handleRx(d) {
  if (!onRx || !d.length) return;
  if (d[0] === 0xaa || d[0] === 0x4f || d[0] === 0x4b) onRx(null);
  else if (d[0] === 0xff && STATUS[d[1]]) onRx(STATUS[d[1]]);
  else if (d[0] === 0x01 && d.length >= 2) handleCx(d);   // credits sent on the answer channel
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(test, ms) {
  const end = Date.now() + ms;
  while (!test() && Date.now() < end) await sleep(20);
  return test();
}

// One packet per tick while credits last; with no credit for a second, one is
// assumed (the printer's own app does the same), so a missed notification
// never hangs the job.
async function send(bytes) {
  lastCredit = Date.now();
  for (let off = 0; off < bytes.length;) {
    if (hasCx && credits <= 0) {
      if (Date.now() - lastCredit < STARVE_MS) { await sleep(TICK_MS); continue; }
      credits = 1; lastCredit = Date.now();
    }
    const chunk = bytes.subarray(off, off + PACKET);
    await dev.tx.writeValueWithoutResponse(chunk);
    if (hasCx) credits--;
    off += chunk.length;
    await sleep(TICK_MS);
  }
}

const cat = parts => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// `bitmap`: { width, height, bytesPerRow, data } — width across the head.
// `thickness`: print darkness 1-3 (the printer's own default is 2).
export async function p15Print(bitmap, { thickness = 2 } = {}) {
  if (!p15Connected()) await p15Connect();
  const { bytesPerRow, height, data } = bitmap;
  const preamble = cat([
    Uint8Array.from([0x10, 0xff, 0x10, 0x00, thickness & 0xff]),
    new Uint8Array(15),
    Uint8Array.from([0x10, 0xff, 0xf1, 0x02]),
  ]);
  const body = cat([
    Uint8Array.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff]),
    data instanceof Uint8Array ? data : new Uint8Array(data),
    Uint8Array.from([0x1d, 0x0c]),
    Uint8Array.from([0x10, 0xff, 0xf1, 0x45]),
  ]);
  const done = new Promise(resolve => { onRx = resolve; });
  try {
    await send(preamble);
    // Let the head warm up and the credits come back before the bitmap, so it
    // flows without a pause (a pause shows as a white line on the label).
    if (hasCx) await waitFor(() => credits >= 4, 1500);
    await send(body);
    // The printer answers once the label is out; some firmwares never do.
    const status = await Promise.race([done, sleep(8000).then(() => null)]);
    if (status) throw new Error(status);
  } finally {
    onRx = null;
  }
}
