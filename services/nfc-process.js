'use strict';
// NFC utility process — spawned by main.js via utilityProcess.fork().
// Runs nfc-pcsc / pcsclite in a fully isolated Electron utility process so that
// SCardEstablishContext() can never block the main V8 thread.
//
// IPC uses Electron's utilityProcess channel:
//   → receive from main : process.parentPort 'message' event  (e.data = payload)
//   → send to main      : process.parentPort.postMessage(payload)
//
// NTAG page layout reminder:
//   - Each NTAG page = 4 bytes.
//   - User memory starts at page 4 (byte offset 0 of the payload).
//   - TigerTag uses pages 4–39 (144 bytes total).
//
// reader.read(startPage, length, blockSize) — nfc-pcsc internals:
//   blockSize controls how many bytes the library treats as one "block".
//   The page-increment formula is: blockNumber += packetSize / blockSize
//   With packetSize=16 (one READ APDU reads 16 bytes = 4 pages):
//     blockSize=16 → increment = 1 page  → WRONG: sliding-window overlap
//     blockSize=4  → increment = 4 pages → CORRECT: sequential non-overlapping reads
//   Always pass blockSize=4 for NTAG chips.

const { NFC } = require('nfc-pcsc');

// ── NTAG read parameters ──────────────────────────────────────────────────────
const READ_START_PAGE = 4;     // first user-memory page (skip UID/lock/CC pages 0-3)
const READ_LENGTH     = 144;   // 36 pages × 4 bytes = 144 bytes  (pages 4–39)
const READ_BLOCK_SIZE = 4;     // NTAG page size in bytes — drives correct page-increment

// ── Reader registry ───────────────────────────────────────────────────────────
const readers = new Map();     // readerName → reader instance

// ── NFC init ─────────────────────────────────────────────────────────────────
let nfc;
try {
  nfc = new NFC();
} catch (err) {
  process.parentPort.postMessage({ type: 'init-error', message: err.message });
  process.exit(0);
}

// ── Reader lifecycle ──────────────────────────────────────────────────────────
nfc.on('reader', (reader) => {
  const name = reader.name;
  readers.set(name, reader);
  process.parentPort.postMessage({ type: 'reader-connected', name });

  // Card placed on reader
  reader.on('card', async (card) => {
    const uid = card.uid;
    let rawPagesHex = null;
    try {
      const data = await reader.read(READ_START_PAGE, READ_LENGTH, READ_BLOCK_SIZE);
      rawPagesHex = data.toString('hex');
    } catch (_) {
      // Read failed — emit uid only; main process handles graceful fallback
    }
    process.parentPort.postMessage({ type: 'card', readerName: name, uid, rawPagesHex });
  });

  // Card removed
  reader.on('card.off', () => {
    process.parentPort.postMessage({ type: 'card-removed', readerName: name });
  });

  // Reader-level error (e.g. card removed mid-read)
  reader.on('error', (err) => {
    process.parentPort.postMessage({ type: 'reader-error', readerName: name, message: err.message });
  });

  // Reader disconnected
  reader.on('end', () => {
    readers.delete(name);
    process.parentPort.postMessage({ type: 'reader-disconnected', name });
  });
});

// Global NFC error (driver / pcsclite level)
nfc.on('error', (err) => {
  process.parentPort.postMessage({ type: 'nfc-error', message: err.message });
});

// ── On-demand messages from main process ─────────────────────────────────────
process.parentPort.on('message', async (e) => {
  const msg = e.data;

  // ── rfid:read-now ───────────────────────────────────────────────────────────
  // Triggered when the renderer requests a fresh read of the current card.
  // msg = { type: 'read-now', readerName, reqId }
  if (msg.type === 'read-now') {
    const reader = readers.get(msg.readerName);
    if (!reader) {
      process.parentPort.postMessage({
        type: 'read-result', reqId: msg.reqId, ok: false, error: 'Reader not connected',
      });
      return;
    }
    try {
      const data = await reader.read(READ_START_PAGE, READ_LENGTH, READ_BLOCK_SIZE);
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

  // ── rfid:write-now ──────────────────────────────────────────────────────────
  // Surgical per-page write — only changed pages are sent.
  // msg = { type: 'write-now', readerName, reqId, pages: [{ index, hexData }] }
  //
  // NTAG hardware constraint: 4 bytes per WRITE command (APDU 0xA2).
  // nfc-pcsc reader.write(blockNum, 4-byte-buf, 4) issues exactly one APDU per call.
  if (msg.type === 'write-now') {
    const reader = readers.get(msg.readerName);
    if (!reader) {
      process.parentPort.postMessage({
        type: 'write-result', reqId: msg.reqId, ok: false, error: 'Reader not connected',
      });
      return;
    }
    const pages = msg.pages; // [{ index: absolutePageNumber, hexData: 8 hex chars }]
    if (!Array.isArray(pages) || pages.length === 0) {
      // Nothing to write — all pages already match the target content
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
