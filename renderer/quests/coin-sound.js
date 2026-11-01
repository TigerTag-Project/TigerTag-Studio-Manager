// TigerCoins pull sounds — synthesised with the Web Audio API (no audio file):
// hold beeps (faster and higher, with an echo), seal crack, flap, card reveal, one jingle per rarity, coin ticks, a coin flip,
// the stage's background music (ambientStart / ambientStop), the chest's (chestMusicStart) and a fireplace (fireStart).
// One AudioContext, created on the first sound (a user gesture has happened by
// then), a master gain at a modest level behind a compressor. Muted state in
// localStorage `tigertag.coinsSound` ("off" = muted), toggled from the stage.

const KEY = "tigertag.coinsSound";
let ac = null, master = null;

export function soundOn() {
  try { return localStorage.getItem(KEY) !== "off"; } catch (_) { return true; }
}
export function setSound(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_) { /* private window */ }
  if (!on && master) master.gain.setTargetAtTime(0, ac.currentTime, 0.01);
  if (on && master) master.gain.setTargetAtTime(0.25, ac.currentTime, 0.01);
}

function ctx() {
  if (!soundOn()) return null;
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    master = ac.createGain();
    master.gain.value = 0.25;
    master.connect(comp).connect(ac.destination);
  }
  if (ac.state === "suspended") ac.resume();
  return ac;
}

// One note: oscillator `type` from f0 to f1 (Hz) over `dur` s, attack/decay envelope.
function tone(type, f0, f1, dur, { at = 0, vol = 0.5, attack = 0.005 } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

// Filtered noise: a crack, a flap, a cymbal-like shimmer.
function noise(dur, { at = 0, vol = 0.4, from = 1800, to = 400, type = "bandpass" } = {}) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf;
  f.type = type;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t); src.stop(t + dur);
}

/** Wakes the audio engine up ahead of time (the stage opening is a user
 *  gesture), so the first sound of a hold starts on the press, not late. */
export function warmSound() { ctx(); }

// The hold: beeps from the very first instant, faster, higher and louder as
// the hold goes on (a countdown to the opening), each one with a soft echo for
// a little mystery — no drone underneath. Returns a stop function (released
// early → the beeps still to come are cancelled and the echo fades).
export function holdRise(ms) {
  const a = ctx(); if (!a) return () => {};
  const t = a.currentTime + 0.005, d = ms / 1000;
  const out = a.createGain(), echo = a.createDelay(0.5), fb = a.createGain(), wet = a.createGain();
  out.gain.value = 1;
  echo.delayTime.value = 0.11; fb.gain.value = 0.35; wet.gain.value = 0.45;
  out.connect(master);
  out.connect(echo); echo.connect(fb).connect(echo); echo.connect(wet).connect(master);
  const beeps = [];
  // The gap shrinks from 170 ms to 45 ms; the pitch climbs an octave.
  for (let x = 0; x < d; ) {
    const k = x / d, at = t + x;
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(660 * Math.pow(2, k), at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16 + k * 0.22, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    o.connect(g).connect(out); o.start(at); o.stop(at + 0.08);
    beeps.push(o);
    x += 0.17 - k * 0.125;
  }
  return () => {
    const now = a.currentTime;
    beeps.forEach(o => { try { o.stop(now); } catch (_) { /* already played */ } });
    fb.gain.setTargetAtTime(0, now, 0.05);
  };
}

// The stage's background music (the envelope pile is open): a slow lounge
// loop — four soft held chords (Am9 · Fmaj7 · Cmaj7 · G6), a bell arpeggio in
// eighths at 96 BPM with an echo, a faint hi-hat — faded in on start and out on
// stop. Scheduled a little ahead on the audio clock (lookahead), so it stays in
// time when the page is busy. Goes through the master gain: muting mutes it.
let amb = null;
export function ambientStart() {
  const a = ctx(); if (!a || amb) return;
  const out = a.createGain(), lp = a.createBiquadFilter(), echo = a.createDelay(1), fb = a.createGain(), wet = a.createGain();
  out.gain.setValueAtTime(0.0001, a.currentTime);
  out.gain.exponentialRampToValueAtTime(1, a.currentTime + 1.6);
  lp.type = "lowpass"; lp.frequency.value = 2400;
  echo.delayTime.value = 0.375; fb.gain.value = 0.3; wet.gain.value = 0.35;
  lp.connect(out); lp.connect(echo); echo.connect(fb).connect(echo); echo.connect(wet).connect(out); out.connect(master);
  const CHORDS = [[220, 261.6, 329.6, 392, 493.9], [174.6, 220, 261.6, 329.6, 392], [130.8, 196, 246.9, 329.6, 392], [196, 246.9, 293.7, 329.6, 440]];
  const ARP = [0, 2, 4, 3, 1, 4, 2, 3], STEP = 60 / 96 / 2;   // eighth notes at 96 BPM
  const voice = (type, f, t, dur, vol, att) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(lp); o.start(t); o.stop(t + dur + 0.05);
  };
  const hat = t => {
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.05), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = "highpass"; f.frequency.value = 7000;
    g.gain.setValueAtTime(0.012, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 0.06);
  };
  let next = a.currentTime + 0.1, step = 0;
  const tick = () => {
    while (next < a.currentTime + 0.4) {
      const ch = CHORDS[Math.floor(step / 16) % CHORDS.length], s = step % 16;
      if (s === 0) ch.slice(0, 4).forEach(f => { voice("triangle", f, next, STEP * 16 + 0.8, 0.028, 0.9); voice("sine", f / 2, next, STEP * 16 + 0.8, 0.018, 0.9); });
      if (s % 2 === 0 || s === 7 || s === 15) voice("sine", ch[ARP[(s >> 1) % 8] % ch.length] * 2, next, 0.5, 0.04, 0.005);
      if (s % 4 === 2) hat(next);
      next += STEP; step++;
    }
  };
  tick();
  const id = setInterval(tick, 100);
  amb = {
    stop() {
      clearInterval(id);
      const t = a.currentTime;
      out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      setTimeout(() => out.disconnect(), 1200);
    },
  };
}
export function ambientStop() { amb?.stop(); amb = null; }

// The chest's music (squad-deals.js showChest, until the lid bursts): a slow
// treasure-cave theme at 72 BPM in D minor — a low drone, soft held chords
// (Dm9 · B♭maj7 · Gm9 · A, two bars each), a plucked harp arpeggio
// rising in eighths, a muffled heartbeat drum on beats 1 and 3, a music-box
// sparkle now and then — through a warm low-pass and a long echo. Same slot as
// ambientStart: it replaces the stage's music, and ambientStop ends it (0.8 s fade).
export function chestMusicStart() {
  ambientStop();
  const a = ctx(); if (!a) return;
  const out = a.createGain(), lp = a.createBiquadFilter(), echo = a.createDelay(1.5), fb = a.createGain(), wet = a.createGain();
  out.gain.setValueAtTime(0.0001, a.currentTime);
  out.gain.exponentialRampToValueAtTime(1, a.currentTime + 2.2);
  lp.type = "lowpass"; lp.frequency.value = 2000; lp.Q.value = 0.4;
  echo.delayTime.value = 0.625; fb.gain.value = 0.38; wet.gain.value = 0.4;
  lp.connect(out); lp.connect(echo); echo.connect(fb).connect(echo); echo.connect(wet).connect(out); out.connect(master);
  // Root + chord tones (Hz); the last one is the arpeggio's top note.
  const CHORDS = [
    [73.4, 146.8, 174.6, 220, 261.6, 329.6],   // Dm9
    [58.3, 116.5, 146.8, 174.6, 220, 293.7],   // B♭maj7
    [49, 98, 116.5, 146.8, 174.6, 220],        // Gm9
    [55, 110, 138.6, 164.8, 220, 277.2],       // A (the dominant, back to Dm)
  ];
  const ARP = [1, 2, 3, 4, 5, 4, 3, 2], STEP = 60 / 72 / 2;   // eighth notes at 72 BPM
  const voice = (type, f, t, dur, vol, att, dest = lp) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  };
  const drum = (t, vol) => {
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(78, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.5);
  };
  let next = a.currentTime + 0.15, step = 0;
  const tick = () => {
    while (next < a.currentTime + 0.5) {
      const bar = Math.floor(step / 8), ch = CHORDS[Math.floor(bar / 2) % CHORDS.length], s = step % 16;
      // Drone + pad, held over the chord's two bars.
      if (s === 0) {
        voice("sine", ch[0], next, STEP * 16 + 1.2, 0.05, 1.2);
        ch.slice(1, 5).forEach(f => { voice("triangle", f, next, STEP * 16 + 1.2, 0.02, 1.4); voice("sine", f * 1.004, next, STEP * 16 + 1.2, 0.012, 1.6); });
      }
      // Harp: a plucked rising/falling arpeggio, one octave up.
      voice("triangle", ch[ARP[step % 8]] * 2, next, 0.9, 0.035, 0.004);
      // Heartbeat drum on beats 1 and 3, the first one stronger.
      if (s % 4 === 0) drum(next, s % 8 === 0 ? 0.16 : 0.08);
      // A music-box sparkle once every two bars, on an off-beat.
      if (s === 11) voice("sine", ch[5] * 4, next, 0.6, 0.018, 0.003, out);
      next += STEP; step++;
    }
  };
  tick();
  const id = setInterval(tick, 100);
  amb = {
    stop() {
      clearInterval(id);
      const t = a.currentTime;
      out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      setTimeout(() => out.disconnect(), 1200);
    },
  };
}

// A fireplace (freeze-modal.js "Rallumer la flamme", while it is open): a low
// roar of filtered noise that breathes slowly, wood crackles at random (short
// band-passed bursts, now and then a louder pop with a few sparks after it) and
// a faint hiss. Same slot as ambientStart: ambientStop ends it (0.8 s fade).
export function fireStart() {
  if (amb?.fire) return;   // already crackling (the hover on the strip, then its window): goes on
  ambientStop();
  const a = ctx(); if (!a) return;
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, a.currentTime);
  out.gain.exponentialRampToValueAtTime(1, a.currentTime + 1.2);
  out.connect(master);
  // Two seconds of noise, looped: the roar (low-pass) and the hiss (high-pass).
  const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }   // brown-ish noise
  const bed = a.createBufferSource(), lp = a.createBiquadFilter(), roar = a.createGain(), lfo = a.createOscillator(), lfoG = a.createGain();
  bed.buffer = buf; bed.loop = true; lp.type = "lowpass"; lp.frequency.value = 420; roar.gain.value = 0.5;
  lfo.frequency.value = 0.23; lfoG.gain.value = 0.18; lfo.connect(lfoG).connect(roar.gain);
  bed.connect(lp).connect(roar).connect(out); bed.start(); lfo.start();
  const white = a.createBuffer(1, a.sampleRate, a.sampleRate), w = white.getChannelData(0);
  for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
  const hissSrc = a.createBufferSource(), hp = a.createBiquadFilter(), hiss = a.createGain();
  hissSrc.buffer = white; hissSrc.loop = true; hp.type = "highpass"; hp.frequency.value = 5000; hiss.gain.value = 0.012;
  hissSrc.connect(hp).connect(hiss).connect(out); hissSrc.start();
  const crack = (t, vol, f) => {
    const len = 0.006 + Math.random() * 0.02;
    const src = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
    src.buffer = white; bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 1.2;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp).connect(g).connect(out); src.start(t, Math.random() * 0.9); src.stop(t + len + 0.01);
  };
  let next = a.currentTime + 0.2;
  const tick = () => {
    while (next < a.currentTime + 0.4) {
      if (Math.random() < 0.12) {   // a pop, then a few sparks
        crack(next, 0.5, 900 + Math.random() * 900);
        for (let k = 1; k < 2 + Math.random() * 4; k++) crack(next + k * (0.02 + Math.random() * 0.05), 0.15, 2500 + Math.random() * 3000);
      } else crack(next, 0.06 + Math.random() * 0.14, 1500 + Math.random() * 3500);
      next += 0.04 + Math.random() * Math.random() * 0.45;
    }
  };
  tick();
  const id = setInterval(tick, 100);
  amb = {
    fire: true,
    stop() {
      clearInterval(id);
      const t = a.currentTime;
      out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      setTimeout(() => { bed.stop(); lfo.stop(); hissSrc.stop(); out.disconnect(); }, 1200);
    },
  };
}

export const sfx = {
  tick() { tone("sine", 520, 520, 0.04, { vol: 0.15 }); },
  // Hovering a Workshop item: a short rising note, higher with the rarity (0 common → 4 legendary);
  // a legendary one gets a sparkle on top.
  hover(r = 0) {
    const f = [392, 440, 523, 659, 784][r] || 392;
    tone("sine", f, f * 1.5, 0.08, { vol: 0.12 });
    if (r >= 4) tone("sine", f * 2, f * 2, 0.12, { at: 0.06, vol: 0.06 });
  },
  ready() { tone("triangle", 620, 620, 0.09, { vol: 0.3 }); tone("triangle", 930, 930, 0.09, { vol: 0.2 }); },
  crack() { noise(0.11, { vol: 0.5, from: 2400, to: 600, type: "lowpass" }); tone("sine", 110, 70, 0.11, { vol: 0.5 }); },
  flap() { noise(0.18, { vol: 0.25, from: 900, to: 300 }); },
  // One step of the rarity climb, higher each step.
  step(k) { tone("triangle", [330, 392, 494, 587, 698][k] || 698, [330, 392, 494, 587, 698][k] || 698, 0.12, { vol: 0.28 }); },
  reveal() { tone("sine", 440, 660, 0.16, { vol: 0.35 }); },
  // The impact of a rare-or-better reveal, harder with the rarity (r 2 → 4):
  // a rushing riser, then a boom (deeper and longer), a shimmer tail.
  impact(r) {
    const k = r - 2;                                  // 0 rare · 1 epic · 2 legendary
    noise(0.35 + k * 0.08, { vol: 0.2 + k * 0.12, from: 500, to: 4000 + k * 1500, type: "bandpass" });
    const at = 0.35 + k * 0.08;
    tone("sine", 110 - k * 25, 45 - k * 7, 0.45 + k * 0.25, { at, vol: 0.45 + k * 0.2, attack: 0.008 });
    noise(0.3 + k * 0.2, { at, vol: 0.25 + k * 0.15, from: 2500, to: 200, type: "lowpass" });
    noise(0.7 + k * 0.5, { at: at + 0.05, vol: 0.06 + k * 0.05, from: 7000, to: 10000, type: "highpass" });
  },
  coin(i = 0) { tone("sine", 880, 1320, 0.075, { at: i * 0.045, vol: 0.18 }); },
  // ── The chest (squad-deals.js showChest) ──
  // It lands: a wooden thud and a little dust.
  thud() { tone("sine", 120, 55, 0.22, { vol: 0.55, attack: 0.004 }); noise(0.16, { vol: 0.22, from: 900, to: 200, type: "lowpass" }); },
  // Held: the lid rattles in its frame, harder as the hold goes on (k 0 → 1).
  rattle(k = 0) {
    noise(0.05, { vol: 0.12 + k * 0.22, from: 1400 + k * 1600, to: 500, type: "bandpass" });
    tone("square", 180 + k * 160, 140 + k * 120, 0.04, { vol: 0.04 + k * 0.06 });
  },
  // The lock gives: a metallic clack and a spring.
  unlock() {
    tone("square", 1200, 900, 0.05, { vol: 0.18 }); noise(0.06, { vol: 0.3, from: 5000, to: 2000, type: "highpass" });
    tone("triangle", 600, 1500, 0.18, { at: 0.06, vol: 0.12 });
  },
  // The lid flies open: a creak, a whoosh of air, a bright golden chord and a shimmer.
  burst() {
    tone("sawtooth", 220, 150, 0.22, { vol: 0.07 });
    noise(0.45, { at: 0.04, vol: 0.3, from: 400, to: 6000, type: "bandpass" });
    tone("sine", 90, 40, 0.5, { at: 0.08, vol: 0.45, attack: 0.006 });
    [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.9, { at: 0.12 + i * 0.05, vol: 0.13, attack: 0.02 }));
    noise(1.2, { at: 0.15, vol: 0.08, from: 6500, to: 9500, type: "highpass" });
  },
  // ── Relight the flame (freeze-modal.js repair, once the hold succeeds) ──
  // Embers drawn in: a rising rush of air and a low swell.
  relightRise() {
    noise(0.9, { vol: 0.22, from: 250, to: 3200, type: "bandpass" });
    tone("sine", 70, 140, 0.9, { vol: 0.18, attack: 0.3 });
  },
  // The flame catches: a deep "fwoomp", a burst of fire and a warm rising chord.
  relightIgnite() {
    tone("sine", 95, 38, 0.7, { vol: 0.6, attack: 0.006 });
    noise(0.6, { vol: 0.4, from: 3000, to: 250, type: "lowpass" });
    noise(0.35, { at: 0.02, vol: 0.18, from: 600, to: 5000, type: "bandpass" });
    [262, 330, 392, 523, 659].forEach((f, i) => tone("triangle", f, f, 1.3, { at: 0.1 + i * 0.07, vol: 0.11, attack: 0.03 }));
    noise(1.4, { at: 0.15, vol: 0.06, from: 6500, to: 9500, type: "highpass" });
  },
  // Each day coming back on the counter: a small bright tick, higher each time.
  relightDay(i = 0) { tone("sine", 660 + Math.min(i, 12) * 45, 990 + Math.min(i, 12) * 60, 0.08, { vol: 0.16 }); },
  // ── A friend's letter (squad-deals.js showEnvelope, a friend's envelope) ──
  // A friend's letter — short, soft, synchronised beats (designed with a ChatGPT review).
  // The wax seal: a dry, intimate crack — a band-passed noise burst and a small drop.
  waxSnap() { noise(0.035, { vol: 0.4, from: 2200, to: 2200, type: "bandpass" }); tone("triangle", 180, 110, 0.055, { vol: 0.3, attack: 0.003 }); },
  // The flap: filtered air, its brightness sweeping down.
  flapOpen() { noise(0.18, { vol: 0.14, from: 4000, to: 1500, type: "lowpass" }); },
  // The parchment unrolls: two overlapping paper swishes, low and high.
  unroll() {
    noise(0.55, { vol: 0.1, from: 900, to: 900, type: "bandpass" });
    noise(0.45, { at: 0.12, vol: 0.08, from: 2800, to: 2800, type: "bandpass" });
  },
  // The avatar stamp pressed on the parchment: a soft thump.
  stamp() { tone("sine", 140, 85, 0.065, { vol: 0.4, attack: 0.003 }); noise(0.012, { vol: 0.2, from: 1200, to: 1200, type: "lowpass" }); },
  // The gift: a bell (880 / 1760 / 2640 Hz partials) over a quiet C major chord.
  letterCoins() {
    [[880, 1, 0.35], [1760, 0.25, 0.18], [2640, 0.08, 0.09]].forEach(([f, g, d]) => tone("sine", f, f, d, { vol: 0.28 * g, attack: 0.003 }));
    [523, 659, 784].forEach((f, i) => tone("triangle", f, f, 0.45, { at: i * 0.025, vol: 0.09, attack: 0.01 }));
  },
  // Cashed in: a delicate tick per coin landing, then C6 + G6.
  depositTick(i = 0) { tone("sine", 1200 + i * 180, 1200 + i * 180, 0.035, { vol: 0.14, attack: 0.003 }); },
  deposited() { [1047, 1568].forEach(f => tone("sine", f, f, 0.18, { vol: 0.16, attack: 0.004 })); },
  // An envelope pops out of the chest.
  pop(i = 0) { tone("sine", 500 + i * 70, 900 + i * 90, 0.09, { vol: 0.22 }); noise(0.05, { vol: 0.08, from: 3000, to: 1500 }); },
  // A coin flicked into a spin (the history's coin, ~1.1 s): a bright metallic
  // ping (inharmonic partials), then quick ticks slowing down as it turns.
  coinFlip() {
    [2093, 3135, 4700].forEach((f, i) => tone("sine", f, f * 0.998, 0.5 - i * 0.12, { vol: 0.14 - i * 0.03 }));
    let at = 0.08;
    for (let k = 0; k < 9; k++) { tone("triangle", 3400, 3200, 0.03, { at, vol: 0.06 }); at += 0.05 + k * 0.016; }
  },
  rarity(r) {
    const notes = (fs, step, type = "triangle", vol = 0.35, len = 0.18, at = 0) => fs.forEach((f, i) => tone(type, f, f, len, { at: at + i * step, vol }));
    const chord = (fs, at, len, vol, type = "triangle") => fs.forEach(f => { tone(type, f, f, len, { at, vol, attack: 0.02 }); tone("sine", f * 2.003, f * 2.003, len * 0.8, { at, vol: vol * 0.35, attack: 0.02 }); });
    if (r === 0) { tone("sine", 392, 392, 0.12, { vol: 0.3 }); tone("sine", 784, 784, 0.08, { at: 0.03, vol: 0.08 }); }
    else if (r === 1) { notes([523, 659], 0.08, "triangle", 0.32); tone("sine", 1319, 1319, 0.2, { at: 0.16, vol: 0.1 }); }
    else if (r === 2) {
      notes([523, 659, 784, 1047], 0.06, "sine", 0.34, 0.22);
      chord([523, 784], 0.28, 0.6, 0.12);
      noise(0.5, { at: 0.2, vol: 0.05, from: 6000, to: 9000, type: "highpass" });
    } else if (r === 3) {
      // Epic: a dark minor turn resolving bright, over a low pulse.
      notes([440, 523, 659], 0.07, "sawtooth", 0.14, 0.14);
      notes([587, 740, 880, 1175], 0.08, "triangle", 0.34, 0.24, 0.24);
      chord([587, 740, 880], 0.58, 1.1, 0.13);
      tone("sine", 73, 73, 0.9, { at: 0.2, vol: 0.32, attack: 0.03 });
    } else {
      // Legendary: the fanfare, then a long golden chord and a shimmer.
      notes([523, 659, 784, 1047], 0.11, "triangle", 0.4, 0.28);
      notes([784, 1047, 1319, 1568], 0.09, "sine", 0.16, 0.22, 0.42);
      chord([523, 659, 784, 1047], 0.62, 1.8, 0.14);
      noise(1.6, { at: 0.6, vol: 0.1, from: 6000, to: 9000, type: "highpass" });
    }
  },
};
