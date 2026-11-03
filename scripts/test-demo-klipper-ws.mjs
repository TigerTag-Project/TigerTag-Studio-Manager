// The demo Klipper printer's Moonraker WebSocket (services/demo/faces/klipper.js):
// the JSON-RPC contract the TigerSpool and the Tiger Touch speak, on the same
// port as the HTTP side, sharing one state with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');
const { Machine } = require('../services/demo/engine.js');
const klipper = require('../services/demo/faces/klipper.js');

const library = { list: () => [], get: () => null, thumbnail: () => null };
let port = 47900 + Math.floor(Math.random() * 90);

/** A demo printer on 127.0.0.1:<port>, its face, and a cleanup. */
async function printer(record = {}) {
  const machine = new Machine({ id: 'demo-ws-test', brand: 'klipper', slotCount: 4, auto: false }, library);
  const address = `127.0.0.1:${port++}`;
  const face = await klipper.start({ machine, address, library, record });
  return { machine, address, close() { face.close(); machine.dispose(); } };
}

/** A client that sends JSON-RPC requests and collects every frame. */
function client(address, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${address}/websocket`, { headers });
    const waiting = new Map(), notes = [];
    let id = 0;
    ws.on('message', raw => {
      const msg = JSON.parse(String(raw));
      if (msg.id !== undefined && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } else notes.push(msg);
    });
    ws.once('error', reject);
    ws.once('open', () => resolve({
      notes,
      call(method, params) {
        const n = ++id;
        return new Promise(r => { waiting.set(n, r); ws.send(JSON.stringify({ jsonrpc: '2.0', id: n, method, params })); });
      },
      close() { ws.close(); },
    }));
  });
}

const http = (address, path, body) => fetch(`http://${address}${path}`, body
  ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'k3y' }, body: JSON.stringify(body) }
  : { headers: { 'X-Api-Key': 'k3y' } }).then(r => r.json());

test('identify, list, query, gcode then query again, unknown lane', async () => {
  const p = await printer();
  const c = await client(p.address);   // no Origin header, like the TigerSpool
  try {
    const id = await c.call('server.connection.identify', { client_name: 'TigerSpool', version: '1.73.0', type: 'other', url: 'https://tigertag.io' });
    assert.equal(id.jsonrpc, '2.0');
    assert.equal(typeof id.result.connection_id, 'number');

    const list = await c.call('printer.objects.list');
    const httpList = await http(p.address, '/printer/objects/list');
    assert.deepEqual(list.result.objects, httpList.result.objects);
    assert.ok(list.result.objects.includes('AFC_stepper lane1'));

    const q = await c.call('printer.objects.query', { objects: { 'AFC_stepper lane2': ['material', 'color'], print_stats: null } });
    assert.deepEqual(Object.keys(q.result.status['AFC_stepper lane2']), ['material', 'color']);
    assert.equal(typeof q.result.status.print_stats.state, 'string');
    assert.equal(typeof q.result.eventtime, 'number');

    const w = await c.call('printer.gcode.script', { script: 'SET_MATERIAL LANE=lane2 MATERIAL=PETG\nSET_COLOR LANE=lane2 COLOR=FF8800' });
    assert.equal(w.result, 'ok');
    const after = await c.call('printer.objects.query', { objects: { 'AFC_stepper lane2': ['material', 'color'] } });
    assert.deepEqual(after.result.status['AFC_stepper lane2'], { material: 'PETG', color: '#FF8800' });
    // One state: the HTTP side sees the WebSocket write.
    const viaHttp = await http(p.address, '/printer/objects/query', { objects: { 'AFC_stepper lane2': ['material'] } });
    assert.equal(viaHttp.result.status['AFC_stepper lane2'].material, 'PETG');
    // …and the other way round.
    await http(p.address, '/printer/gcode/script', { script: 'SET_MATERIAL LANE=lane3 MATERIAL=ASA' });
    const back = await c.call('printer.objects.query', { objects: { 'AFC_stepper lane3': ['material'] } });
    assert.equal(back.result.status['AFC_stepper lane3'].material, 'ASA');

    const bad = await c.call('printer.gcode.script', { script: 'SET_MATERIAL LANE=lane9 MATERIAL=PLA' });
    assert.equal(bad.error.code, 400);
    assert.match(bad.error.message, /lane9/);

    const nope = await c.call('printer.nothing');
    assert.equal(nope.error.code, -32601);
  } finally { c.close(); p.close(); }
});

test('the COSMOS lists its lanes as AFC_stepper and AFC_lane, on WebSocket as on HTTP', async () => {
  const p = await printer({ printerModelId: 166 });
  const c = await client(p.address);
  try {
    await c.call('server.connection.identify', { client_name: 'TigerSpool', version: '1', type: 'other', url: '' });
    const list = (await c.call('printer.objects.list')).result.objects;
    assert.ok(list.includes('AFC_stepper CANVAS_1') && list.includes('AFC_lane CANVAS_1'));
    assert.deepEqual(list, (await http(p.address, '/printer/objects/list')).result.objects);
  } finally { c.close(); p.close(); }
});

test('with an API key: nothing before identify, a wrong key refused, the right one accepted', async () => {
  const p = await printer({ apiKey: 'k3y' });
  const c = await client(p.address);
  try {
    assert.deepEqual((await c.call('printer.objects.list')).error, { code: 401, message: 'Unauthorized' });
    assert.deepEqual((await c.call('server.connection.identify', { client_name: 'x', version: '1', type: 'other', url: '', api_key: 'nope' })).error,
      { code: 401, message: 'Unauthorized' });
    assert.equal((await c.call('printer.objects.list')).error.code, 401);
    assert.equal(typeof (await c.call('server.connection.identify', { client_name: 'x', version: '1', type: 'other', url: '', api_key: 'k3y' })).result.connection_id, 'number');
    assert.ok(Array.isArray((await c.call('printer.objects.list')).result.objects));
  } finally { c.close(); p.close(); }
});

test('subscribe pushes notify_status_update, and notify_proc_stat_update comes every second', async () => {
  const p = await printer();
  const c = await client(p.address);
  try {
    await c.call('server.connection.identify', { client_name: 'x', version: '1', type: 'other', url: '' });
    const sub = await c.call('printer.objects.subscribe', { objects: { heater_bed: ['temperature'] } });
    assert.deepEqual(Object.keys(sub.result.status.heater_bed), ['temperature']);
    await new Promise(r => setTimeout(r, 2300));
    const methods = c.notes.map(n => n.method);
    assert.ok(methods.filter(x => x === 'notify_proc_stat_update').length >= 2);
    const st = c.notes.find(n => n.method === 'notify_status_update');
    assert.deepEqual(Object.keys(st.params[0].heater_bed), ['temperature']);
  } finally { c.close(); p.close(); }
});

test('no API key: list, query, then the TigerSpool\'s two-line write, with no identify at all', async () => {
  const p = await printer({ printerModelId: 166 });
  const c = await client(p.address);
  try {
    const list = (await c.call('printer.objects.list')).result.objects;
    assert.ok(list.includes('AFC_lane CANVAS_3'));
    const q = await c.call('printer.objects.query', { objects: { 'AFC_stepper CANVAS_3': ['material', 'color'] } });
    assert.ok(q.result.status['AFC_stepper CANVAS_3']);
    // Exactly what the TigerSpool sends when it writes a lane.
    const w = await c.call('printer.gcode.script', { script: 'SET_MATERIAL LANE=CANVAS_3 MATERIAL=PLA_High_Speed\nSET_COLOR LANE=CANVAS_3 COLOR=DC123F' });
    assert.equal(w.result, 'ok');
    const after = await c.call('printer.objects.query', { objects: { 'AFC_stepper CANVAS_3': ['material', 'color'], 'AFC_lane CANVAS_3': ['material', 'color'] } });
    assert.deepEqual(after.result.status['AFC_stepper CANVAS_3'], { material: 'PLA_High_Speed', color: '#DC123F' });
    assert.deepEqual(after.result.status['AFC_lane CANVAS_3'], { material: 'PLA_High_Speed', color: '#DC123F' });
  } finally { c.close(); p.close(); }
});

test('Happy Hare (Voron 2.4): the mmu object, no AFC, MMU_GATE_MAP on WebSocket and HTTP, unknown gate', async () => {
  const p = await printer({ printerModelId: 2 });
  const c = await client(p.address);
  try {
    const list = (await c.call('printer.objects.list')).result.objects;
    assert.ok(list.includes('mmu'));
    assert.ok(!list.some(o => o === 'AFC' || o.startsWith('AFC_')));
    assert.deepEqual(list, (await http(p.address, '/printer/objects/list')).result.objects);

    const mmu = (await c.call('printer.objects.query', { objects: { mmu: null } })).result.status.mmu;
    assert.equal(mmu.num_gates, 4);
    assert.equal(mmu.gate_status.length, 4);
    assert.ok(mmu.gate_color.every(x => x === '' || /^[0-9A-F]{6}$/.test(x)));

    const w = await c.call('printer.gcode.script', { script: 'MMU_GATE_MAP GATE=2 MATERIAL=PLA_High_Speed COLOR=dc123f SPOOLID=42' });
    assert.equal(w.result, 'ok');
    let g = (await c.call('printer.objects.query', { objects: { mmu: ['gate_status', 'gate_material', 'gate_color', 'gate_spool_id'] } })).result.status.mmu;
    assert.equal(g.gate_status[2], 1);
    assert.equal(g.gate_material[2], 'PLA_High_Speed');
    assert.equal(g.gate_color[2], 'DC123F');
    assert.equal(g.gate_spool_id[2], 42);

    await http(p.address, '/printer/gcode/script', { script: 'MMU_GATE_MAP GATE=1 AVAILABLE=0\nMMU_GATE_MAP GATE=3 AVAILABLE=-1' });
    g = (await c.call('printer.objects.query', { objects: { mmu: ['gate_status', 'gate_material'] } })).result.status.mmu;
    assert.equal(g.gate_status[1], 0);
    assert.equal(g.gate_material[1], '');
    assert.equal(g.gate_status[3], -1);
    const viaHttp = await http(p.address, '/printer/objects/query', { objects: { mmu: ['gate_material'] } });
    assert.equal(viaHttp.result.status.mmu.gate_material[2], 'PLA_High_Speed');

    for (const bad of ['MMU_GATE_MAP GATE=4 MATERIAL=PLA', 'MMU_GATE_MAP GATE=x MATERIAL=PLA', 'MMU_GATE_MAP MATERIAL=PLA']) {
      const e = await c.call('printer.gcode.script', { script: bad });
      assert.equal(e.error.code, 400, bad);
      assert.match(e.error.message, /gate/i);
    }
    const eh = await fetch(`http://${p.address}/printer/gcode/script`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script: 'MMU_GATE_MAP GATE=9 MATERIAL=PLA' }) });
    assert.equal(eh.status, 400);
  } finally { c.close(); p.close(); }
});
