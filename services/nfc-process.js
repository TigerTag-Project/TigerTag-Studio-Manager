'use strict';
// NFC utility process — spawned by main.js via utilityProcess.fork().
// Runs nfc-pcsc / pcsclite in a fully isolated Electron utility process so that
// SCardEstablishContext() can never block the main V8 thread.
//
// IPC uses Electron's utilityProcess channel:
//   → receive from main : process.parentPort 'message' event  (e.data = payload)
//   → send to main      : process.parentPort.postMessage(payload)

const { NFC } = require('nfc-pcsc');

const readers = new Map();

let nfc;
try {
  nfc = new NFC();
} catch (err) {
  process.parentPort.postMessage({ type: 'init-error', message: err.message });
  process.exit(0);
}

nfc.on('reader', (reader) => {
  const name = reader.name;
  readers.set(name, reader);
  process.parentPort.postMessage({ type: 'reader-connected', name });

  reader.on('card', async (card) => {
    const uid = card.uid;
    let rawPagesHex = null;
    try {
      const data = await reader.read(4, 144, 16); // pages 0x04-0x27 × 4 bytes = 144 B, 16-byte READ blocks → 9 APDUs (UID already known from card event)
      rawPagesHex = data.toString('hex');
    } catch (_) { /* read failed — emit uid only, main process falls back gracefully */ }
    process.parentPort.postMessage({ type: 'card', readerName: name, uid, rawPagesHex });
  });
  reader.on('card.off', () => {
    process.parentPort.postMessage({ type: 'card-removed', readerName: name });
  });
  reader.on('error', (err) => {
    process.parentPort.postMessage({ type: 'reader-error', readerName: name, message: err.message });
  });
  reader.on('end', () => {
    readers.delete(name);
    process.parentPort.postMessage({ type: 'reader-disconnected', name });
  });
});

nfc.on('error', (err) => {
  process.parentPort.postMessage({ type: 'nfc-error', message: err.message });
});

// On-demand card read — triggered by main process via rfid:read-now IPC
// On-demand tag write — triggered by main process via rfid:write-now IPC
process.parentPort.on('message', async (e) => {
  const msg = e.data;

  // ── Read ────────────────────────────────────────────────────────────────────
  if (msg.type === 'read-now') {
    const reader = readers.get(msg.readerName);
    if (!reader) {
      process.parentPort.postMessage({
        type: 'read-result', reqId: msg.reqId, ok: false, error: 'Reader not connected',
      });
      return;
    }
    try {
      const data = await reader.read(4, 144, 16); // pages 0x04-0x27 × 4 bytes = 144 B, 16-byte READ blocks → 9 APDUs (UID already known from card event)
      process.parentPort.postMessage({
        type: 'read-result', reqId: msg.reqId, ok: true, rawPagesHex: data.toString('hex'),
      });
    } catch (err) {
      process.parentPort.postMessage({
        type: 'read-result', reqId: msg.reqId, ok: false, error: err.message,
      });
    }
    return;
  }

  // ── Write ───────────────────────────────────────────────────────────────────
  // msg = { type: 'write-now', readerName, reqId, pages: [{ index, hexData }] }
  // pages is a sorted array of { index (absolute page number, e.g. 4), hexData (8 hex chars) }
  // Only the pages that actually need to be written are sent — surgical writes are handled
  // in main.js by comparing old and new bytes and filtering unchanged pages out.
  //
  // NTAG213/215 hardware limit: 4 bytes per WRITE command (0xA2).
  // nfc-pcsc reader.write(blockNum, 4-byte-buf, 4) issues exactly one APDU per call.
  // There is NO multi-page write APDU for NTAG — this is the fastest possible approach.
  if (msg.type === 'write-now') {
    const reader = readers.get(msg.readerName);
    if (!reader) {
      process.parentPort.postMessage({
        type: 'write-result', reqId: msg.reqId, ok: false, error: 'Reader not connected',
      });
      return;
    }
    const pages = msg.pages; // [{ index, hexData }]
    if (!Array.isArray(pages) || pages.length === 0) {
      // Nothing to write (all pages identical to existing chip data)
      process.parentPort.postMessage({
        type: 'write-result', reqId: msg.reqId, ok: true, pagesWritten: 0,
      });
      return;
    }
    try {
      for (const { index, hexData } of pages) {
        const buf = Buffer.from(hexData, 'hex'); // always 4 bytes
        await reader.write(index, buf, 4);
      }
      process.parentPort.postMessage({
        type: 'write-result', reqId: msg.reqId, ok: true, pagesWritten: pages.length,
      });
    } catch (err) {
      process.parentPort.postMessage({
        type: 'write-result', reqId: msg.reqId, ok: false, error: err.message,
      });
    }
    return;
  }
});
