'use strict';
// NFC utility process — spawned by main.js via utilityProcess.fork().
// Runs nfc-pcsc / pcsclite in a fully isolated Electron utility process so that
// SCardEstablishContext() can never block the main V8 thread.
//
// IPC uses Electron's utilityProcess channel:
//   → receive from main : process.parentPort 'message' event  (e.data = payload)
//   → send to main      : process.parentPort.postMessage(payload)
//
// ── Windows hot-plug recovery ──────────────────────────────────────────────
// On Windows the Smart Card service (SCardSvr) is *trigger-started*: it runs
// only while a reader is present and stops a few seconds after the LAST reader
// is unplugged. When it stops, pcsclite's reader-monitor gets a service error
// and STOPS — it never re-arms — so a reader plugged in AFTER that is never
// detected until the whole app is restarted. We work around it by re-creating
// the NFC context whenever the monitor errors, retrying on a timer until a
// reader appears (which itself restarts SCardSvr). Guarded to win32 so the
// working macOS/Linux path (pcscd is a persistent daemon) is untouched.
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

// ── NFC context + Windows watchdog ─────────────────────────────────────────────
let nfc = null;
let _restartTimer  = null;
let _downReported  = false;    // so we log the context-down once, not every retry
const _autoRecover = process.platform === 'win32';
const _RESTART_MS  = 3000;

function _scheduleRestart() {
  if (!_autoRecover || _restartTimer) return;   // one pending restart at a time
  _restartTimer = setTimeout(() => { _restartTimer = null; startNFC(); }, _RESTART_MS);
}

function _teardownNFC() {
  if (!nfc) return;
  try { nfc.removeAllListeners(); } catch (_) {}
  try { nfc.close(); } catch (_) {}   // may throw on an already-dead context — ignore
  nfc = null;
}

function startNFC() {
  _teardownNFC();
  try {
    nfc = new NFC();
  } catch (err) {
    if (!_downReported) { _downReported = true; process.parentPort.postMessage({ type: 'init-error', message: err.message }); }
    _scheduleRestart();
    return;
  }

  // ── Reader lifecycle ──────────────────────────────────────────────────────
  nfc.on('reader', (reader) => {
    // A reader appeared → the context is healthy again; cancel any pending
    // recovery and re-arm error reporting.
    if (_restartTimer) { clearTimeout(_restartTimer); _restartTimer = null; }
    _downReported = false;

    const name = reader.name;
    // Some USB devices present a PC/SC smart-card interface without being a
    // filament NFC reader — a YubiKey is the common one: over USB it exposes a
    // CCID interface, so nfc-pcsc enumerates it exactly like an ACR122U and the
    // app would treat it as a reader (and attempt card reads on it). Skip known
    // security keys by name so they never become a reader. Kept deliberately
    // tight (Yubico only) to avoid excluding a real reader with an unusual name;
    // the general, user-controlled override is the reader-management panel
    // (see docs/READER-SELECTION-BRIEF.md).
    if (/yubico|yubikey/i.test(name)) return;
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

  // Global NFC error (driver / pcsclite context level). On Windows this is where
  // "SCardSvr stopped because no reader is present" surfaces — the monitor is
  // now dead, so re-establish the context and keep retrying until a reader shows.
  nfc.on('error', (err) => {
    if (!_downReported) { _downReported = true; process.parentPort.postMessage({ type: 'nfc-error', message: err.message }); }
    _scheduleRestart();
  });
}

startNFC();

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
      // Read-back verification (when msg.verify): re-read the user pages and
      // confirm every page we just wrote matches byte-for-byte. We only
      // compare the pages we actually wrote — the factory signature region is
      // never written here, so it is implicitly excluded.
      let verified = null;
      const mismatchPages = [];
      if (msg.verify) {
        verified = true;
        try {
          const back = await reader.read(READ_START_PAGE, READ_LENGTH, READ_BLOCK_SIZE);
          for (const { index, hexData } of pages) {
            const off = (index - READ_START_PAGE) * 4;
            const got = (off >= 0 && off + 4 <= back.length)
              ? back.slice(off, off + 4).toString('hex')
              : '';
            if (got.toLowerCase() !== String(hexData).toLowerCase()) {
              verified = false;
              mismatchPages.push(index);
            }
          }
        } catch (e) {
          verified = false;
          mismatchPages.push(-1); // read-back itself failed
        }
      }
      process.parentPort.postMessage({
        type: 'write-result', reqId: msg.reqId, ok: true, pagesWritten: pages.length, verified, mismatchPages,
      });
    } catch (err) {
      process.parentPort.postMessage({
        type: 'write-result', reqId: msg.reqId, ok: false, error: err.message,
      });
    }
    return;
  }
});
