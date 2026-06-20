// Throwaway decoder for a pktmon/Wireshark pcapng capture of the Creality CFS
// reverse-engineering session. Extracts TCP port-9999 streams, reassembles them,
// strips the WebSocket HTTP handshake, and decodes the WS text frames (unmasking
// client→printer frames) — printing the JSON commands Creality Print sent.
//   node scripts/cfs-decode.mjs <capture.pcapng>
import fs from 'fs';

const file = process.argv[2];
if (!file) { console.error('usage: node cfs-decode.mjs <capture.pcapng>'); process.exit(1); }
const buf = fs.readFileSync(file);
const INTERESTING = /box|material|cfs|feed|tube|retMaterials|change|load|unload|extrud|filament|"set"/i;

// ── pcapng walk ────────────────────────────────────────────────────────────
let le = true;
const r32 = (o) => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
const streams = new Map(); // 4-tuple key -> { dstPort, segs:[{seq,data}] }

let off = 0;
while (off + 12 <= buf.length) {
  const type = buf.readUInt32LE(off);          // block type is endianness-agnostic enough for SHB magic check
  if (type === 0x0a0d0d0a) {                    // Section Header Block — read byte-order magic
    le = buf.readUInt32LE(off + 8) === 0x1a2b3c4d;
  }
  const len = r32(off + 4);
  if (len < 12 || off + len > buf.length) break;
  const btype = r32(off);
  if (btype === 0x00000006) {                   // Enhanced Packet Block
    const capLen = r32(off + 20);
    parseEth(buf.subarray(off + 28, off + 28 + capLen));
  } else if (btype === 0x00000003) {            // Simple Packet Block
    const capLen = r32(off + 8);
    parseEth(buf.subarray(off + 12, off + 12 + capLen));
  }
  off += (len + 3) & ~3;                         // blocks are 4-byte aligned
}

function parseEth(pkt) {
  if (pkt.length < 14) return;
  let etherType = pkt.readUInt16BE(12), ipOff = 14;
  while (etherType === 0x8100 && pkt.length >= ipOff + 4) { // VLAN tag(s)
    etherType = pkt.readUInt16BE(ipOff + 2); ipOff += 4;
  }
  if (etherType !== 0x0800) return;             // IPv4 only
  const ihl = (pkt[ipOff] & 0x0f) * 4;
  if (pkt[ipOff + 9] !== 6) return;             // TCP only
  const ipTotal = pkt.readUInt16BE(ipOff + 2);
  const src = pkt.subarray(ipOff + 12, ipOff + 16).join('.');
  const dst = pkt.subarray(ipOff + 16, ipOff + 20).join('.');
  const tcpOff = ipOff + ihl;
  if (tcpOff + 20 > pkt.length) return;
  const sp = pkt.readUInt16BE(tcpOff), dp = pkt.readUInt16BE(tcpOff + 2);
  if (sp !== 9999 && dp !== 9999) return;
  const seq = pkt.readUInt32BE(tcpOff + 4);
  const dataOff = (pkt[tcpOff + 12] >> 4) * 4;
  const payStart = tcpOff + dataOff, payEnd = ipOff + ipTotal;
  if (payEnd <= payStart) return;
  const data = pkt.subarray(payStart, Math.min(payEnd, pkt.length));
  if (!data.length) return;
  const key = `${src}:${sp}->${dst}:${dp}`;
  if (!streams.has(key)) streams.set(key, { dstPort: dp, segs: [] });
  streams.get(key).segs.push({ seq, data: Buffer.from(data) });
}

// ── WS frame decode ──────────────────────────────────────────────────────────
function decodeWs(bytes, onText) {
  let b = bytes;
  const i = b.indexOf('\r\n\r\n');               // skip the WS upgrade handshake
  if (i !== -1) b = b.subarray(i + 4);
  let p = 0;
  while (p + 2 <= b.length) {
    const b1 = b[p + 1], masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, o = p + 2;
    if (len === 126) { if (b.length < o + 2) break; len = b.readUInt16BE(o); o += 2; }
    else if (len === 127) { if (b.length < o + 8) break; len = Number(b.readBigUInt64BE(o)); o += 8; }
    let mask;
    if (masked) { if (b.length < o + 4) break; mask = b.subarray(o, o + 4); o += 4; }
    if (b.length < o + len) break;
    let pay = b.subarray(o, o + len);
    if (masked) { const x = Buffer.allocUnsafe(len); for (let k = 0; k < len; k++) x[k] = pay[k] ^ mask[k & 3]; pay = x; }
    if ((b[p] & 0x0f) === 0x1) { try { onText(pay.toString('utf8')); } catch {} }
    p = o + len;
  }
}

// ── Reassemble + decode each stream ─────────────────────────────────────────
console.log(`streams on :9999 → ${streams.size}`);
for (const [key, s] of streams) {
  s.segs.sort((a, b) => a.seq - b.seq);
  let out = Buffer.alloc(0), next = s.segs.length ? s.segs[0].seq : 0;
  for (const g of s.segs) {
    if (g.seq + g.data.length <= next) continue;
    const skip = next > g.seq ? next - g.seq : 0;
    out = Buffer.concat([out, g.data.subarray(skip)]);
    next = g.seq + g.data.length;
  }
  const dir = s.dstPort === 9999 ? 'C->P' : 'P->C';
  let n = 0;
  decodeWs(out, (txt) => {
    if (txt.trim() === 'ok') return;
    if (dir === 'C->P' || INTERESTING.test(txt)) { console.log(`\n[${dir}] ${key}\n  ${txt.slice(0, 4000)}`); n++; }
  });
  if (n === 0) console.log(`[${dir}] ${key} — ${out.length}B, no notable frames`);
}
