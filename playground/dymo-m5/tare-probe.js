// Probe v2: can we TARE the Dymo over USB? — exhaustive retest.
// usbscale sends {0x02,0x02} (Zero Scale bit) as an OUT interrupt transfer.
// node-hid write() is the equivalent HID output-report path. We sweep every
// payload on report IDs 1 and 2, plus feature reports, and watch whether the
// live reading changes. Weight unchanged after all of them = firmware ignores.
const HID = require('node-hid');
const info = HID.devices().find(d => d.vendorId === 0x0922);
if (!info) { console.log('Scale OFF — turn it on with something on the pan.'); process.exit(0); }
const dev = new HID.HID(info.path);

let last = null, frames = 0;
dev.on('data', b => { last = (b[4] | (b[5] << 8)); frames++; });
dev.on('error', e => console.log('read error:', e.message));

const wait = ms => new Promise(r => setTimeout(r, ms));
const w = () => last;

(async () => {
  await wait(1800);
  const before = w();
  console.log(`baseline: ${before} raw units (frames=${frames})`);
  if (before < 20) console.log('  ⚠ pan looks near-empty — a tare would be invisible. Put a spool on it for a real test.');

  // Every OUT write payload the HID Scale page could use for zero/tare.
  const writes = [
    [0x02, 0x01], [0x02, 0x02], [0x02, 0x03],  // report id 2, both control bits
    [0x01, 0x01], [0x01, 0x02], [0x01, 0x03],  // report id 1 as OUT (long shot)
  ];
  for (const p of writes) {
    let r; try { r = dev.write(p); } catch (e) { r = 'ERR ' + e.message; }
    await wait(1300);
    const now = w();
    const moved = Math.abs((now ?? 0) - (before ?? 0)) > 3;
    console.log(`write ${JSON.stringify(p)} → ${r} bytes | weight ${now} ${moved ? '‹— CHANGED!' : '(unchanged)'}`);
  }

  // Feature reports on both IDs.
  for (const p of [[0x01, 0x02], [0x02, 0x02]]) {
    try { dev.sendFeatureReport(p); await wait(1200);
      console.log(`feature ${JSON.stringify(p)} → weight ${w()}`);
    } catch (e) { console.log(`feature ${JSON.stringify(p)} → ERR ${e.message}`); }
  }

  console.log(`\nfinal: ${w()} vs baseline ${before} → ${Math.abs((w()??0)-(before??0))>3 ? 'TARE WORKED' : 'NO EFFECT — firmware ignores tare'}`);
  dev.close();
})();
