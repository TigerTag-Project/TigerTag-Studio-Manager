// The Canvas of an SDCP Elegoo printer (renderer/printers/elegoo/canvas.js).
// The sample frames are written by hand after the Home Assistant integration's
// "CC1 format" test data — NOT captured from a real Canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sdcpCanvasPresent, sdcpParseCanvas, sdcpCanvasSlots, CMD_GET_CANVAS_STATUS } from '../renderer/printers/elegoo/canvas.js';

const tray = (id, extra = {}) => ({ tray_id: id, brand: 'ELEGOO', filament_type: 'PLA', filament_name: 'PLA',
  filament_code: '0x00000', filament_color: '#2850DF', min_nozzle_temp: 190, max_nozzle_temp: 230, status: 1, ...extra });
const answer = (extra = {}) => ({ Ack: 0, active_canvas_id: 0, active_tray_id: 2, auto_refill: 1,
  canvas_list: [{ canvas_id: 0, connected: 1, tray_list: [
    tray(0), tray(1, { filament_color: 'FF5733', filament_type: 'PETG', filament_name: 'PETG Silk', brand: 'Acme' }),
    tray(2, { filament_color: '#00ff88' }), tray(3, { filament_color: '', filament_type: '', brand: '', filament_name: '', status: 0 })] }], ...extra });

test('the command is 324', () => assert.equal(CMD_GET_CANVAS_STATUS, 324));

test('a Canvas is announced by the status push, and only when the printer says so', () => {
  assert.equal(sdcpCanvasPresent({ AmsConnectStatus: 1 }), true);
  assert.equal(sdcpCanvasPresent({ AmsConnectStatus: true }), true);
  assert.equal(sdcpCanvasPresent({ AmsConnectStatus: 0 }), false);
  assert.equal(sdcpCanvasPresent({ AmsConnectStatus: false }), false);
  for (const s of [{}, null, undefined, { AmsConnectStatus: 'yes' }, { AmsConnectStatus: 2 }]) assert.equal(sdcpCanvasPresent(s), null);
});

test('four trays: colour, material, brand, name, temperatures, active tray', () => {
  const c = sdcpParseCanvas(answer());
  assert.equal(c.connected, true);
  assert.equal(c.autoRefill, true);
  assert.equal(c.activeTray, 2);
  assert.equal(c.trays.length, 4);
  assert.deepEqual(c.trays[0], { trayId: 0, color: '#2850DF', type: 'PLA', vendor: 'ELEGOO', name: 'PLA', minTemp: 190, maxTemp: 230, active: false });
  assert.equal(c.trays[1].color, '#FF5733');          // no "#" in the frame → added
  assert.equal(c.trays[1].type, 'PETG');
  assert.equal(c.trays[2].color, '#00FF88');          // normalised to upper case
  assert.equal(c.trays[2].active, true);
});

test('slots are what the board reads, in the same shape as the CC2', () => {
  const slots = sdcpCanvasSlots(sdcpParseCanvas(answer()));
  assert.equal(slots.length, 4);
  assert.deepEqual(slots[0], { key: 't0', label: '1', color: '#2850DF', material: 'PLA', detail: 'PLA', vendor: 'ELEGOO', empty: false });
  assert.equal(slots[3].empty, true);
  assert.equal(slots[3].color, null);
  assert.equal(slots[3].material, null);
});

test('an unplugged Canvas has no slots, so the board keeps its single external slot', () => {
  const c = sdcpParseCanvas({ Ack: 0, canvas_list: [{ canvas_id: 0, connected: 0, tray_list: [tray(0, { filament_color: '', filament_type: '' })] }] });
  assert.deepEqual(c, { connected: false, trays: [] });
  assert.deepEqual(sdcpCanvasSlots(c), []);
});

test('a refused or unusable answer changes nothing', () => {
  assert.equal(sdcpParseCanvas(answer({ Ack: 1 })), null);
  const noAck = answer(); delete noAck.Ack;
  assert.equal(sdcpParseCanvas(noAck), null);
  for (const bad of [null, undefined, 'x', 42, [], {}, { Ack: 0 }, { Ack: 0, canvas_list: [] }, { Ack: 0, canvas_list: [null] }, { Ack: 0, canvas_list: 'no' }]) {
    assert.equal(sdcpParseCanvas(bad), null);
  }
  assert.deepEqual(sdcpCanvasSlots(null), []);
  assert.deepEqual(sdcpCanvasSlots(undefined), []);
});

test('placeholders are not shown, and nothing but a hex colour reaches a style attribute', () => {
  const c = sdcpParseCanvas(answer({ canvas_list: [{ canvas_id: 0, connected: 1, tray_list: [
    tray(0, { brand: '—', filament_type: '?', filament_name: '—', filament_color: 'red; background:url(x)' }),
    tray(1, { filament_color: '#12345' }),
    tray(2, { filament_color: '0xAABBCC' }),
    tray(3, { filament_color: '#11223344', min_nozzle_temp: 0, max_nozzle_temp: 'hot' })] }] }));
  assert.equal(c.trays[0].vendor, null);
  assert.equal(c.trays[0].type, null);
  assert.equal(c.trays[0].name, null);
  assert.equal(c.trays[0].color, null);
  assert.equal(c.trays[1].color, null);
  assert.equal(c.trays[2].color, '#AABBCC');
  assert.equal(c.trays[3].color, '#11223344');
  assert.equal(c.trays[3].minTemp, null);
  assert.equal(c.trays[3].maxTemp, null);
});

test('a missing or negative active tray means none is active', () => {
  assert.equal(sdcpParseCanvas(answer({ active_tray_id: -1 })).activeTray, null);
  const none = answer(); delete none.active_tray_id;
  const c = sdcpParseCanvas(none);
  assert.equal(c.activeTray, null);
  assert.ok(c.trays.every(t => t.active === false));
});
