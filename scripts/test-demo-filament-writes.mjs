// Demo printers take a filament write the way the real machine does, and show it
// on the next read: the exact commands the TigerSpool sends (TigerSpool-RFID),
// for the Snapmaker U1 (Moonraker WebSocket) and the Anycubic ACE (MQTT over TLS,
// reports on …/<family>/report like a real printer).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const mqtt = require('mqtt');
const { Machine } = require('../services/demo/engine.js');

const library = { list: () => [], get: () => null, thumbnail: () => null };
const machine = (brand, o = {}) => new Machine({ id: `demo-${brand}-test`, brand, slotCount: 4, auto: false, ...o }, library);

function rpc(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url), waiting = new Map();
    let id = 0;
    ws.on('message', raw => { const m = JSON.parse(String(raw)); if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
    ws.once('error', reject);
    ws.once('open', () => resolve({
      call: (method, params) => new Promise(r => { waiting.set(++id, r); ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })); }),
      close: () => ws.close(),
    }));
  });
}

test('Snapmaker: SET_PRINT_FILAMENT_CONFIG keeps type, vendor, sub-type and colour per head', async () => {
  const m = machine('snapmaker', { tools: 4 });
  const face = await require('../services/demo/faces/snapmaker.js').start({ machine: m, address: '127.0.0.1', library });
  const c = await rpc('ws://127.0.0.1:7125/websocket');
  try {
    const w = await c.call('printer.gcode.script', { script: 'SET_PRINT_FILAMENT_CONFIG CONFIG_EXTRUDER=2 VENDOR=Rosa3D FILAMENT_TYPE=PLA FILAMENT_SUBTYPE=High_Speed FILAMENT_COLOR_RGBA=DC123FFF' });
    assert.equal(w.result, 'ok');
    const cfg = (await c.call('printer.objects.query', { objects: { print_task_config: null } })).result.status.print_task_config;
    assert.equal(cfg.filament_type[2], 'PLA');
    assert.equal(cfg.filament_vendor[2], 'Rosa3D');
    assert.equal(cfg.filament_sub_type[2], 'High_Speed');
    assert.equal(cfg.filament_color_rgba[2], 'DC123FFF');
    const bad = await c.call('printer.gcode.script', { script: 'SET_PRINT_FILAMENT_CONFIG CONFIG_EXTRUDER=9 FILAMENT_TYPE=PLA' });
    assert.equal(bad.error.code, 400);
  } finally { c.close(); face.close(); m.dispose(); }
});

test('Anycubic ACE: multiColorBox setInfo, read back on …/multiColorBox/report (black sent as 1,1,1)', async () => {
  const m = machine('anycubic');
  const record = { acuModelId: '20027', deviceId: 'd3m0', username: 'demo', password: 'pw', port: 9883 };
  const face = await require('../services/demo/faces/anycubic.js').start({ machine: m, address: '127.0.0.1', library, record });
  const cl = mqtt.connect('mqtts://127.0.0.1:9883', { username: 'demo', password: 'pw', rejectUnauthorized: false, reconnectPeriod: 0 });
  try {
    await new Promise((res, rej) => { cl.once('connect', res); cl.once('error', rej); });
    const report = 'anycubic/anycubicCloud/v1/printer/public/20027/d3m0/multiColorBox/report';
    await new Promise(r => cl.subscribe(report, r));
    const next = () => new Promise(r => cl.once('message', (topic, buf) => r({ topic, msg: JSON.parse(String(buf)) })));
    const got = next();
    cl.publish('anycubic/anycubicCloud/v1/web/printer/20027/d3m0/multiColorBox', JSON.stringify({ type: 'multiColorBox', action: 'setInfo',
      data: { multi_color_box: [{ id: 0, slots: [{ index: 2, type: 'PETG', color: [1, 1, 1] }] }] } }));
    const { topic, msg } = await got;
    assert.equal(topic, report);
    const slot = msg.data.multi_color_box[0].slots[2];
    assert.equal(slot.type, 'PETG');
    assert.deepEqual(slot.color, [1, 1, 1]);
  } finally { cl.end(true); face.close(); m.dispose(); }
});

test('FlashForge: /checkCode logs in (0 / 5 wrong serial / 1 wrong code), then msConfig_cmd writes a slot', async () => {
  const m = machine('flashforge');
  const record = { serialNumber: 'SNDEMO1234', password: 'C0DE' };
  const face = await require('../services/demo/faces/flashforge.js').start({ machine: m, address: '127.0.0.1:18898', library, record });
  const post = (path, body) => fetch(`http://127.0.0.1:18898${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  try {
    assert.equal((await post('/checkCode', { serialNumber: 'SNDEMO1234', checkCode: 'C0DE' })).code, 0);
    assert.equal((await post('/checkCode', { serialNumber: 'DEMO1234', checkCode: 'C0DE' })).code, 0);   // "SN" prefix optional
    assert.equal((await post('/checkCode', { serialNumber: 'SNOTHER', checkCode: 'C0DE' })).code, 5);
    assert.equal((await post('/checkCode', { serialNumber: 'SNDEMO1234', checkCode: 'nope' })).code, 1);
    const w = await post('/control', { serialNumber: 'SNDEMO1234', checkCode: 'C0DE', payload: { cmd: 'msConfig_cmd', args: { slot: 2, mt: 'PETG', rgb: '#FF9933' } } });
    assert.equal(w.code, 0);
    const d = (await post('/detail', { serialNumber: 'SNDEMO1234', checkCode: 'C0DE' })).detail;
    const slot = d.matlStationInfo.slotInfos.find(s => Number(s.slotId) === 2);
    assert.equal(slot.materialName, 'PETG');
    assert.equal(String(slot.materialColor).toUpperCase(), '#FF9933');
  } finally { face.close(); m.dispose(); }
});

test('Creality: modifyMaterial on the CFS and on the external holder, read back in boxsInfo', async () => {
  const m = machine('creality');
  const record = { cameraUrl: 'http://127.0.0.1:18081/?action=stream' };
  const face = await require('../services/demo/faces/creality.js').start({ machine: m, address: '127.0.0.1', library, record });
  const ws = new WebSocket('ws://127.0.0.1:9999');
  const boxes = () => new Promise(r => { const on = raw => { const msg = JSON.parse(String(raw)); if (msg.boxsInfo) { ws.off('message', on); r(msg.boxsInfo.materialBoxs); } }; ws.on('message', on); });
  try {
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    const mm = (o) => JSON.stringify({ method: 'set', params: { modifyMaterial: { rfid: '01001', name: 'Hyper PLA', minTemp: 190.0, maxTemp: 230.0, pressure: 0.04, selected: 1, percent: 100, editStatus: 1, state: 1, ...o } } });
    let got = boxes();
    ws.send(mm({ id: 1, boxId: 1, type: 'PLA', vendor: 'Creality', color: '#0dc123f' }));
    let b = await got;
    const cfsSlot = b.find(x => x.id === 1).materials[1];
    assert.equal(cfsSlot.type, 'PLA');
    assert.equal(cfsSlot.vendor, 'Creality');
    assert.equal(cfsSlot.color.toLowerCase(), '#0dc123f');
    got = boxes();
    ws.send(mm({ id: 0, boxId: 0, type: 'PETG', vendor: 'Sunlu', color: '#0ff9933' }));
    b = await got;
    assert.deepEqual(b.find(x => x.id === 0).materials[0].type, 'PETG');
    assert.equal(b.find(x => x.id === 0).materials[0].color, '#0ff9933');
  } finally { ws.close(); face.close(); m.dispose(); }
});
