// Dymo M5 USB scale playground — raw HID reader + parser
// Usage: node read.js [--raw] [--seconds N]
//
// The scale is a standard USB HID Scale (usage page 0x8D, usage 0x20).
// It streams 6-byte Scale Data Reports:
//   [0] report id      — always 0x03
//   [1] status         — 1 fault, 2 stable@zero, 3 in motion, 4 stable, 5 negative, 6 over capacity
//   [2] unit           — 0x02 gram, 0x0B ounce, 0x0C pound (HID PoS unit codes)
//   [3] exponent       — signed power of ten applied to the raw value
//   [4] weight LSB
//   [5] weight MSB

const HID = require('node-hid');

const VENDOR_DYMO = 0x0922;
const RAW = process.argv.includes('--raw');
const secIdx = process.argv.indexOf('--seconds');
const SECONDS = secIdx > -1 ? Number(process.argv[secIdx + 1]) : 15;

const STATUS = {
  1: 'FAULT',
  2: 'STABLE (zero)',
  3: 'IN MOTION',
  4: 'STABLE',
  5: 'UNDER ZERO',
  6: 'OVERWEIGHT',
  7: 'CALIBRATE ME',
  8: 'ZERO ME',
};
const UNITS = { 0x02: 'g', 0x0b: 'oz', 0x0c: 'lb' };

const info = HID.devices().find((d) => d.vendorId === VENDOR_DYMO);
if (!info) {
  console.error('No DYMO scale found on USB. Is it powered on?');
  process.exit(1);
}
console.log(`Opening ${info.manufacturer} ${info.product} (vid 0x${info.vendorId.toString(16)}, pid 0x${info.productId.toString(16)})`);

const dev = new HID.HID(info.path);
let last = '';
let frames = 0;

dev.on('data', (buf) => {
  frames++;
  if (RAW) {
    console.log(`[${new Date().toISOString().slice(11, 23)}] ${buf.toString('hex').match(/../g).join(' ')}`);
    return;
  }
  const status = buf[1];
  const unit = UNITS[buf[2]] || `unit?0x${buf[2].toString(16)}`;
  const exp = buf[3] > 127 ? buf[3] - 256 : buf[3]; // signed byte
  const raw = buf[4] | (buf[5] << 8);
  let value = raw * Math.pow(10, exp);
  if (status === 5) value = -value;
  const line = `${STATUS[status] || `status?${status}`}  ${value} ${unit}`;
  if (line !== last) {
    console.log(`[${new Date().toISOString().slice(11, 23)}] ${line}   (raw: ${buf.toString('hex').match(/../g).join(' ')})`);
    last = line;
  }
});

dev.on('error', (e) => {
  console.error('HID error:', e.message);
  process.exit(1);
});

setTimeout(() => {
  console.log(`\nDone — ${frames} frames in ${SECONDS}s (${(frames / SECONDS).toFixed(1)}/s)`);
  dev.close();
  process.exit(0);
}, SECONDS * 1000);
