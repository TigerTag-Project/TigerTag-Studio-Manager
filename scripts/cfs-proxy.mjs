// Throwaway transparent raw-TCP proxy for reverse-engineering the Creality CFS
// feed/retract command on port 9999. Unlike a WebSocket-aware proxy, this forwards
// every byte verbatim, so Creality Print's non-WS probe + the WS upgrade both reach
// the real printer and it answers authentically — Creality Print sees a normal
// printer. We tap the byte streams and decode WebSocket text frames (unmasking the
// client→printer frames) to log the exact commands. ws://9999 is plaintext.
//   node scripts/cfs-proxy.mjs <printer-ip> [listenPort]
import net from 'net';

const PRINTER = process.argv[2] || '192.168.1.4';
const PORT    = parseInt(process.argv[3] || '9999', 10);
const t0 = Date.now();
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
// Printer→client telemetry is noisy; only surface CFS/command-looking frames.
// Every client→printer frame is logged (those are the commands we want).
const INTERESTING = /box|material|cfs|feed|tube|retMaterials|change|load|unload|extrud|filament/i;

// Decode a stream of WebSocket frames, calling onText(payload) for each text frame.
// Handles masked (client) and unmasked (server) frames + segmentation across chunks.
function frameDecoder(onText) {
  let buf = Buffer.alloc(0);
  let httpDone = false; // each stream opens with the WS upgrade handshake (HTTP) — skip it first
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!httpDone) {
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;          // still inside the HTTP headers
      buf = buf.subarray(idx + 4);     // discard headers; WS frames follow
      httpDone = true;
    }
    for (;;) {
      if (buf.length < 2) return;
      const b0 = buf[0], b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      let mask;
      if (masked) { if (buf.length < off + 4) return; mask = buf.subarray(off, off + 4); off += 4; }
      if (buf.length < off + len) return; // wait for the rest of the frame
      let payload = buf.subarray(off, off + len);
      if (masked) { const o = Buffer.allocUnsafe(len); for (let i = 0; i < len; i++) o[i] = payload[i] ^ mask[i & 3]; payload = o; }
      buf = buf.subarray(off + len);
      if (opcode === 0x1) { try { onText(payload.toString('utf8')); } catch {} }
    }
  };
}

let nconn = 0;
const server = net.createServer((client) => {
  const id = ++nconn;
  console.log(`${ts()} [conn#${id} ${client.remoteAddress} -> ${PRINTER}:${PORT}]`);
  const up = net.connect(PORT, PRINTER);

  const decC = frameDecoder((s) => { if (s.trim() !== 'ok') console.log(`${ts()} #${id} C->P  ${s.slice(0, 4000)}`); });
  const decP = frameDecoder((s) => { if (INTERESTING.test(s)) console.log(`${ts()} #${id} P->C  ${s.slice(0, 1500)}`); });

  client.on('data', (d) => { decC(d); up.write(d); });
  up.on('data',     (d) => { decP(d); client.write(d); });

  const end = () => { try { client.destroy(); } catch {} try { up.destroy(); } catch {} };
  client.on('close', end); up.on('close', end);
  client.on('error', (e) => console.log(`${ts()} #${id} [client err] ${e.message}`));
  up.on('error',     (e) => console.log(`${ts()} #${id} [upstream err] ${e.message}`));
});

server.listen(PORT, '0.0.0.0', () =>
  console.log(`${ts()} [proxy] transparent TCP 0.0.0.0:${PORT} -> ${PRINTER}:${PORT} — point Creality Print at this machine`));
