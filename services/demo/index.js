/**
 * services/demo/index.js — the demo-mode printer simulator, main-process side
 * (docs/DEMO-MODE.md).
 *
 * The renderer owns the truth: the account's printer records flagged
 * `demo: true`. Each time that list changes it calls `demo:sync`, and this
 * module makes the running simulator match it — one engine Machine and one
 * brand face per record, bound to the record's own address. No demo printer
 * left → nothing runs, nothing listens.
 *
 * IPC (preload exposes them as window.demoMode):
 *   demo:faces                → [{ brand, variant? }]       what can be added (a brand with
 *                                several models — Elegoo CC2 / CC1 — lists each one)
 *   demo:allocate (brand, records[], variant?) → { …fields }  the record fields of a NEW demo
 *                                printer (its address, credentials…); `records` = the
 *                                account's demo records, whose addresses are taken
 *   demo:sync (records[])     → [{ id, ok, error? }]
 *   demo:state (id)           → the machine's snapshot, or null
 *   demo:set (id, o)          → scripted control: { phase, progress, print, message,
 *                                auto, command: "start"|"pause"|"resume"|"stop" }
 */
'use strict';

const { Machine } = require('./engine');
const { createLibrary } = require('./library');
const addresses = require('./addresses');
const { shapeFor, modelOf } = require('./shapes');

/* A face module exports:
 *   brand, slotCount, tools?, chamber?, variants? ([{ id }] — models it plays)
 *   recordFields(address, variant?) → the fields a new record gets (ip, credentials,
 *                           printerModelId…)
 *   addressOf(record)     → the address its server binds ("127.0.0.x" or "127.0.0.1:port")
 *   start({ machine, address, library, record }) → Promise<{ close() }>          */
const FACES = {
  klipper: require('./faces/klipper'),
  octoprint: require('./faces/octoprint'),
  flashforge: require('./faces/flashforge'),
  prusa: require('./faces/prusa'),
  creality: require('./faces/creality'),
  elegoo: require('./faces/elegoo'),
  anycubic: require('./faces/anycubic'),
  bambulab: require('./faces/bambulab'),
  snapmaker: require('./faces/snapmaker'),
};

function register({ ipcMain, ffmpegPath, log = () => {} }) {
  let library = null;
  const lib = () => {
    if (!library) { library = createLibrary({ ffmpegPath, log }); library.warm(); }
    return library;
  };
  const running = new Map();   // id → { machine, face, address, brand }

  async function stopOne(id) {
    const r = running.get(id);
    if (!r) return;
    running.delete(id);
    try { r.face.close(); } catch (_) {}
    r.machine.dispose();
    log(`[demo] ${r.brand} ${id} stopped`);
  }

  async function startOne(rec) {
    const face = FACES[rec.brand];
    if (!face) return { id: rec.id, ok: false, error: 'no demo face for this brand' };
    const address = face.addressOf(rec);
    // Loopback (Studio only) or one of this computer's own addresses (reachable
    // from the local network, for devices under test).
    if (!/^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(address || '') || !addresses.servable(address)) return { id: rec.id, ok: false, error: 'not a demo address' };
    // The machine is the record's MODEL (shapes.js, from the brand's catalog): the
    // face's defaults, refined by its own per-record rule, then by the catalog.
    const shape = { slotCount: face.slotCount, tools: face.tools, chamber: face.chamber,
      ...(face.shape ? face.shape(rec) : {}), ...shapeFor(rec.brand, rec.printerModelId) };
    const machine = new Machine({ id: rec.id, brand: rec.brand, slotCount: shape.slotCount, tools: shape.tools || 1, chamber: !!shape.chamber }, lib());
    machine.model = { brand: rec.brand, id: String(rec.printerModelId ?? '') };   // its real idle photo (library.js)
    try {
      const handle = await face.start({ machine, address, library: lib(), record: rec, shape, model: modelOf(rec.brand, rec.printerModelId), ffmpegPath });
      running.set(rec.id, { machine, face: handle, address, brand: rec.brand, modelId: String(rec.printerModelId ?? '') });
      log(`[demo] ${rec.brand} ${rec.id} on ${address}`);
      return { id: rec.id, ok: true };
    } catch (e) {
      machine.dispose();
      log(`[demo] ${rec.brand} ${rec.id} could not listen on ${address}: ${e.code || e.message}`);
      return { id: rec.id, ok: false, error: e.code || e.message };
    }
  }

  let queue = Promise.resolve();   // syncs run one after the other
  function sync(records) {
    const job = queue.then(async () => {
      const want = new Map((Array.isArray(records) ? records : []).filter(r => r && r.id).map(r => [String(r.id), r]));
      for (const [id, r] of running) {
        const rec = want.get(id);
        if (!rec || rec.brand !== r.brand || FACES[rec.brand]?.addressOf(rec) !== r.address
            || String(rec.printerModelId ?? '') !== r.modelId) await stopOne(id);
      }
      // Fixed-port brands bind a loopback host of their own: create the missing
      // ones first (macOS asks for the administrator password once).
      const hosts = [...want.values()].filter(r => !running.has(String(r.id)) && FACES[r.brand])
        .map(r => FACES[r.brand].addressOf(r)).filter(a => a && !a.includes(':'));
      if (hosts.length) {
        const res = await addresses.ensureHosts(hosts);
        if (!res.ok) log(`[demo] local addresses not created (${res.missing.join(', ')}) — those demo printers stay offline`);
      }
      const out = [];
      for (const [id, rec] of want) out.push(running.has(id) ? { id, ok: true } : await startOne({ ...rec, id }));
      return out;
    });
    queue = job.catch(() => {});
    return job;
  }

  ipcMain.handle('demo:faces', () => Object.entries(FACES).flatMap(([brand, f]) =>
    f.variants ? f.variants.map(v => ({ brand, variant: v.id })) : [{ brand }]));
  ipcMain.handle('demo:allocate', async (_e, brand, records, variant, modelId) => {
    const face = FACES[brand];
    if (!face) return null;
    const used = (Array.isArray(records) ? records : []).map(r => FACES[r?.brand]?.addressOf(r)).filter(Boolean);
    const address = await addresses.allocate(brand, used);
    return address ? face.recordFields(address, variant, modelId) : null;
  });
  ipcMain.handle('demo:sync', (_e, records) => sync(records));
  // This computer's address on the local network (for demo printers other
  // devices test against): the first private IPv4 found, or null.
  ipcMain.handle('demo:lan-host', () => [...addresses.lanHosts()].find(a => /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(a)) || null);
  ipcMain.handle('demo:state', (_e, id) => running.get(String(id))?.machine.snapshot() ?? null);
  ipcMain.handle('demo:set', (_e, id, o = {}) => {
    const m = running.get(String(id))?.machine;
    if (!m) return null;
    const cmd = o.command;
    if (cmd === 'start') m.start(o.print);
    else if (cmd === 'pause') m.pause();
    else if (cmd === 'resume') m.resume();
    else if (cmd === 'stop') m.stop();
    const { command, ...rest } = o;
    if (Object.keys(rest).length) m.set(rest);
    return m.snapshot();
  });

  return { stopAll: () => Promise.all([...running.keys()].map(stopOne)) };
}

module.exports = { register };
