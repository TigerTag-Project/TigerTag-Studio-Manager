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

  reader.on('card', (card) => {
    process.parentPort.postMessage({ type: 'card', readerName: name, uid: card.uid });
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
process.parentPort.on('message', async (e) => {
  const msg = e.data;
  if (msg.type !== 'read-now') return;

  const reader = readers.get(msg.readerName);
  if (!reader) {
    process.parentPort.postMessage({
      type: 'read-result', reqId: msg.reqId, ok: false, error: 'Reader not connected',
    });
    return;
  }
  try {
    const data = await reader.read(0, 180, 4); // 45 pages × 4 bytes
    process.parentPort.postMessage({
      type: 'read-result', reqId: msg.reqId, ok: true, rawPagesHex: data.toString('hex'),
    });
  } catch (err) {
    process.parentPort.postMessage({
      type: 'read-result', reqId: msg.reqId, ok: false, error: err.message,
    });
  }
});
