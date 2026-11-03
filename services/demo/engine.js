/**
 * services/demo/engine.js — the demo mode's print engine (docs/DEMO-MODE.md §3.1).
 *
 * One Machine per demo printer, the same state whatever the brand. The faces
 * (faces/<brand>.js) read it to answer their protocol and turn the commands
 * they receive into Machine calls. Nothing here knows about a protocol.
 *
 * Time is accelerated: a print declared 2 h (print.json `durationReal`) plays in
 * a few minutes, but every duration the faces report (elapsed, remaining) is in
 * the print's own scale, so the screens read like a real 2-hour job.
 */
'use strict';

const { EventEmitter } = require('events');

const AMBIENT = 24;
const TICK_MS = 500;
// Heating is a ramp (°C/s, like a real heater at full power), cooling an
// exponential decay towards the room (fraction per second).
const HEAT_RATE = { nozzle: 7, bed: 1.6, chamber: 0.25 };
const COOL_RATE = { nozzle: 0.05, bed: 0.018, chamber: 0.01 };
const LEVELING_MS = 8000;
// A demo printer prints all the time: the finished object stays on screen a
// moment, then the next print starts. Only the user stops it — Stop leaves it
// idle until a print is started again; Pause holds until Resume.
const COMPLETE_HOLD_MS = 4000;
const CANCELLED_HOLD_MS = 15000;    // "cancelled" on screen, then idle (and stays idle)
const IDLE_BEFORE_NEXT_MS = 1500;   // on start-up: the first print begins almost at once
// Booth events (automatic mode): about one print in three runs out of filament
// somewhere between 25 % and 75 %; the spool is "swapped" and the print resumes.
const RUNOUT_CHANCE = 1 / 3;
const RUNOUT_SWAP_MS = 15000;

/** Real duration in the demo: 1/20 of the declared one, between 2.5 and 8 min. */
const demoMs = print => Math.min(480, Math.max(150, (print.durationReal || 1800) / 20)) * 1000;

// Filament colours are drawn at random — but from the app's own preset palette
// (the "Select Color" sheet, SNAP_FIL_COLOR_PRESETS in
// renderer/printers/snapmaker/index.js, same as the mobile app), so a room of demo
// printers looks varied without looking random. Keep the two lists in step.
const COLOR_PALETTE = [
  '#000000', '#808080', '#CDCDCD', '#FFFFFF', '#135E7E',
  '#B6C3CB', '#4AB1F0', '#2641E9', '#2CDCA6', '#157F5F',
  '#1CB01C', '#C2E58C', '#FFE600', '#FF9933', '#6E4519',
  '#B58137', '#F0E6D6', '#D4C8AA', '#ED1C24', '#EC5A85',
  '#FF00FF', '#C8A4D6', '#8526D3', '#4B1F97',
];
// Materials for the slots a print does not use, weighted towards what people load.
const MATERIALS = ['PLA', 'PLA', 'PLA', 'PLA', 'PETG', 'PETG', 'ABS', 'ASA', 'TPU'];

/** n distinct colours from the palette, in random order. */
function drawColors(n) {
  const pool = [...COLOR_PALETTE];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return Array.from({ length: n }, (_, i) => pool[i % pool.length]);
}
const drawMaterial = () => MATERIALS[Math.floor(Math.random() * MATERIALS.length)];

class Machine extends EventEmitter {
  /**
   * @param {object} o  { id, brand, tools=1, chamber=false, slotCount=4, auto=true }
   * @param {object} library  { list(): print[], get(id): print }
   */
  constructor(o, library) {
    super();
    this.id = o.id; this.brand = o.brand; this.library = library;
    this.auto = o.auto !== false;
    this.events = o.events === true;    // booth events (runout) — off unless asked: a demo printer only stops when the user stops it
    this.userStopped = false;           // Stop pressed: stay idle until a print is started
    this.event = null;                  // { kind: "runout", slot, at } while one is under way
    this._runoutAt = null;              // the progress at which this print runs out, or null
    this.phase = 'idle';
    this.print = null;          // the print.json of the current / last print, + its id
    this.progress = 0;          // 0..1
    this.message = '';          // error text
    this.phaseSince = Date.now();
    // The next print is drawn at random (and the idle camera already shows its
    // plate), so a booth full of demo printers never prints the same thing in step.
    this.nextIndex = Math.floor(Math.random() * Math.max(1, library.list().length));
    this.heaters = {};
    for (let i = 0; i < Math.max(1, o.tools || 1); i++) this.heaters[`nozzle${i}`] = { kind: 'nozzle', cur: AMBIENT + Math.random(), target: 0 };
    this.heaters.bed = { kind: 'bed', cur: AMBIENT - 0.6, target: 0 };
    if (o.chamber) this.heaters.chamber = { kind: 'chamber', cur: AMBIENT + 1, target: 0 };
    this.fan = 0;               // part fan, 0..100
    this.speedPct = 100;
    this.light = true;
    const n = Math.max(0, o.slotCount ?? 4), colors = drawColors(n);
    this.slots = Array.from({ length: n }, (_, i) => ({ material: drawMaterial(), color: colors[i], empty: false }));
    this.activeSlot = this.slots.length ? 0 : -1;
    this.told = new Set();      // slots a client wrote: no longer redrawn by a new print
    this.position = { x: 0, y: 0, z: 0 };
    this.homed = new Set();
    this._timer = setInterval(() => this.tick(TICK_MS / 1000), TICK_MS);
  }

  dispose() { clearInterval(this._timer); this.removeAllListeners(); }

  // ── Read side (what faces publish) ─────────────────────────────────────────
  get layer() { return this.print ? Math.max(this.phase === 'printing' || this.phase === 'paused' ? 1 : 0, Math.round(this.print.layersTotal * this.progress)) : 0; }
  get elapsedSec() { return this.print ? Math.round(this.print.durationReal * this.progress) : 0; }
  get remainingSec() { return this.print && this.progress < 1 ? Math.round(this.print.durationReal * (1 - this.progress)) : 0; }
  get isBusy() { return ['heating', 'leveling', 'printing', 'paused'].includes(this.phase); }
  nozzles() { return Object.keys(this.heaters).filter(k => k.startsWith('nozzle')).map(k => this.heaters[k]); }
  /** The tool printing now: on a tool changer, the one of the active slot. */
  get activeTool() { const n = this.nozzles().length; return n > 1 ? Math.max(0, Math.min(this.activeSlot, n - 1)) : 0; }

  // ── Clock ─────────────────────────────────────────────────────────────────
  tick(dt) {
    for (const h of Object.values(this.heaters)) {
      const goal = h.target > 0 ? h.target : AMBIENT;
      if (goal > h.cur) h.cur = Math.min(goal, h.cur + HEAT_RATE[h.kind] * dt);
      else h.cur = goal + (h.cur - goal) * Math.pow(1 - COOL_RATE[h.kind], dt);
      if (Math.abs(goal - h.cur) < 1.5) h.cur = goal + (Math.random() - 0.5) * 0.4;   // sensor noise once settled
    }
    const inPhase = Date.now() - this.phaseSince;
    switch (this.phase) {
      case 'heating':
        if (this.nozzles().every(n => n.cur >= n.target - 2) && this.heaters.bed.cur >= this.heaters.bed.target - 1.5) this._setPhase('leveling');
        break;
      case 'leveling':
        if (inPhase >= LEVELING_MS) { this._setPhase('printing'); this.fan = 100; }
        break;
      case 'printing': {
        this.progress = Math.min(1, this.progress + (dt * 1000 / demoMs(this.print)) * (this.speedPct / 100));
        this._followSlots();
        if (this._runoutAt != null && this.progress >= this._runoutAt) this._runout();
        else if (this.progress >= 1) this._finish('complete');
        break;
      }
      case 'paused':
        // A runout ends on its own: the spool is swapped, the print resumes.
        if (this.event?.kind === 'runout' && this.auto && inPhase >= RUNOUT_SWAP_MS) {
          this.setSlot(this.event.slot, { empty: false });
          this.event = null;
          this.resume();
        }
        break;
      case 'complete':
        if (this.auto && inPhase >= COMPLETE_HOLD_MS) this.start();   // straight into the next print
        break;
      case 'cancelled':
        if (inPhase >= CANCELLED_HOLD_MS) this._setPhase('idle');
        break;
      case 'idle':
        if (this.auto && !this.userStopped && inPhase >= IDLE_BEFORE_NEXT_MS) this.start();
        break;
    }
    this.emit('change');
  }

  _setPhase(p) { this.phase = p; this.phaseSince = Date.now(); this.emit('phase', p); }

  /** The active spool runs dry: empty slot, print paused, message — like the sensor would. */
  _runout() {
    this._runoutAt = null;
    const slot = Math.max(0, this.activeSlot);
    if (this.slots[slot]) this.slots[slot].empty = true;
    this.event = { kind: 'runout', slot, at: Date.now() };
    this.message = 'Filament runout';
    this._pausedFrom = 'printing';
    this._setPhase('paused');
  }

  _finish(phase) {
    for (const h of Object.values(this.heaters)) h.target = 0;
    this.fan = 0;
    this._setPhase(phase);
  }

  /** The active slot follows the print's colour bands (print.json slotStarts). */
  _followSlots() {
    const starts = this.print?.slotStarts;
    if (!starts || !this.slots.length) return;
    let i = 0;
    starts.forEach((s, k) => { if (this.progress >= s) i = k; });
    this.activeSlot = Math.min(i, this.slots.length - 1);
  }

  // ── Commands (from any face) ─────────────────────────────────────────────
  /** Start a print — by library id or file name, else the next one in the library. */
  start(which) {
    this.userStopped = false;   // a print started (by the cycle or by the user) resumes the cycle
    const list = this.library.list();
    if (!list.length) return false;
    let pr = which ? list.find(p => p.id === which || p.name === which) : null;
    if (!pr) pr = list[this.nextIndex % list.length];
    this._drawNext(list, pr);
    this.print = pr; this.progress = 0; this.message = ''; this.event = null;
    this._runoutAt = this.auto && this.events && Math.random() < RUNOUT_CHANCE ? 0.25 + Math.random() * 0.5 : null;
    this.jobId = (this.jobId || 0) + 1;   // a new job number per print (PrusaLink's job id)
    // The operator loaded the print's materials in the first slots. A FILMED print
    // (videoMode "loop") keeps the colours declared for it — the camera shows them;
    // a drawn placeholder gets colours from the palette, so it never looks the same twice.
    const colors = pr.videoMode === 'loop' ? pr.slots.map(s => s.color) : drawColors(pr.slots.length);
    // A slot a client has told what it holds (Studio, a TigerSpool…) keeps it, like a real printer.
    pr.slots.forEach((s, i) => { if (this.slots[i] && !this.told.has(i)) this.slots[i] = { material: s.material, color: colors[i], empty: false }; });
    this.activeSlot = this.slots.length ? 0 : -1;
    // A tool changer heats one nozzle per colour of the print; a single head heats its one.
    this.nozzles().forEach((n, i) => { n.target = i < Math.max(1, pr.slots.length) ? pr.nozzleTemp : 0; });
    this.heaters.bed.target = pr.bedTemp;
    if (this.heaters.chamber) this.heaters.chamber.target = 0;
    this.speedPct = 100;
    this.homed = new Set(['x', 'y', 'z']);
    this._setPhase('heating');
    return true;
  }
  /** Draw the following print at random — never the one just started (when there is a choice). */
  _drawNext(list, current) {
    const others = list.map((p, i) => i).filter(i => list.length < 2 || list[i].id !== current?.id);
    this.nextIndex = others[Math.floor(Math.random() * others.length)];
  }
  pause() { if (['heating', 'leveling', 'printing'].includes(this.phase)) { this._pausedFrom = this.phase; this._setPhase('paused'); return true; } return false; }
  resume() {
    if (this.phase !== 'paused') return false;
    // Resuming a runout by hand means the spool was swapped.
    if (this.event?.kind === 'runout') { this.setSlot(this.event.slot, { empty: false }); this.event = null; }
    this.message = '';
    this._setPhase(this._pausedFrom || 'printing');
    return true;
  }
  /** Stop = cancel the print. */
  stop() { if (this.isBusy) { this.userStopped = true; this._finish('cancelled'); return true; } return false; }

  /** heater: "nozzle0".. | "bed" | "chamber". Returns false for an unknown heater. */
  setTarget(heater, value) {
    const h = this.heaters[heater];
    if (!h) return false;
    h.target = Math.max(0, Math.min(h.kind === 'nozzle' ? 320 : h.kind === 'bed' ? 120 : 70, Math.round(Number(value) || 0)));
    return true;
  }
  setFan(pct) { this.fan = Math.max(0, Math.min(100, Math.round(Number(pct) || 0))); }
  setSpeed(pct) { this.speedPct = Math.max(10, Math.min(300, Math.round(Number(pct) || 100))); }
  setLight(on) { this.light = !!on; }
  setSlot(i, patch) {
    const s = this.slots[i];
    if (!s) return false;
    if (patch.material != null || patch.color != null) this.told.add(i);   // kept across the next prints
    if (patch.material != null) s.material = String(patch.material);
    if (patch.color != null) s.color = String(patch.color);
    if (patch.empty != null) s.empty = !!patch.empty;
    return true;
  }
  home(axes = 'xyz') { for (const a of String(axes).toLowerCase()) if ('xyz'.includes(a)) { this.homed.add(a); this.position[a] = 0; } }
  /** Relative move; refused (returns an error text) on an axis not homed or out of the bed. */
  jog(axis, dist) {
    const a = String(axis).toLowerCase();
    if (!'xyz'.includes(a)) return 'Unknown axis';
    if (!this.homed.has(a)) return 'Must home axis first';
    const next = this.position[a] + Number(dist);
    if (next < 0 || next > (a === 'z' ? 250 : 300)) return 'Move out of range';
    this.position[a] = +next.toFixed(3);
    return null;
  }

  /**
   * Scripted mode / tests: put the machine in any state directly.
   * { phase, progress (0..1), print (id), message, auto, events, event: "runout" }
   */
  set(o = {}) {
    if (o.auto != null) this.auto = !!o.auto;
    if (o.events != null) this.events = !!o.events;
    if (o.event === 'runout' && this.phase === 'printing') this._runout();
    if (o.print) this.start(o.print);
    if (o.progress != null && this.print) { this.progress = Math.max(0, Math.min(1, Number(o.progress))); this._followSlots(); }
    if (o.message != null) this.message = String(o.message);
    if (o.phase) {
      if (['complete', 'cancelled', 'idle'].includes(o.phase)) this._finish(o.phase);
      else this._setPhase(o.phase);
      if (o.phase === 'complete') this.progress = 1;
    }
    this.emit('change');
  }

  snapshot() {
    return {
      id: this.id, brand: this.brand, phase: this.phase, auto: this.auto, events: this.events, event: this.event, message: this.message,
      print: this.print ? { id: this.print.id, name: this.print.name } : null,
      progress: +this.progress.toFixed(4), layer: this.layer, elapsedSec: this.elapsedSec, remainingSec: this.remainingSec,
      heaters: Object.fromEntries(Object.entries(this.heaters).map(([k, h]) => [k, { cur: +h.cur.toFixed(1), target: h.target }])),
      fan: this.fan, speedPct: this.speedPct, light: this.light, slots: this.slots, activeSlot: this.activeSlot,
      position: this.position, homed: [...this.homed].join(''),
    };
  }
}

module.exports = { Machine, AMBIENT };
