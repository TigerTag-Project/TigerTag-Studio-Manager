#!/usr/bin/env node
/**
 * check-theme-tokens.mjs — guards the dark/light theme.
 *
 * Every colour in the renderer must resolve through a design token declared in
 * `00-base.css` (`:root` + `:root[data-theme="dark"]`). A raw hex or rgba()
 * elsewhere cannot follow the theme: it is the exact defect that makes a card
 * stay white on a near-black page.
 *
 * Two failure modes are reported:
 *   1. RAW    — a literal colour where a token belongs.
 *   2. GHOST  — `var(--foo)` naming a variable nothing declares. Without a
 *               fallback the declaration is simply invalid, so the element
 *               renders with NO background/colour at all — a silent bug.
 *
 * Legitimately exempt (see ALLOW below): brand identity colours (a printer
 * maker's logo is its own colour in any theme), the material swatch (that is
 * DATA — the actual filament colour — not chrome), and variables written from
 * JS as inline style slots.
 */
import { readFileSync, globSync } from 'fs';

const TOKENS_FILE = 'renderer/css/00-base.css';

/* Colours that are identity, not theme. */
const ALLOW = [
  /logo_[a-z]+\.svg/,                 // brand logo masks carry the brand colour
  /--brand-accent/,                   // set per-printer-brand from JS
  /--cc-hue|--sw|--sc|--slots|--tail-x|--sf-top-offset|--vc|--adp-|--icon-bg/, // JS-written slots
  /transparent|currentColor|inherit/,
];

/* A third party's colour is that company's identity — Discord blurple stays
   blurple on a light page. These are exempt, but counted and reported so the
   exemption stays visible rather than quietly growing. */
const BRAND = /discord|reddit|telegram|bluesky|github|makerworld|shopify|coffee|bambu|creality|elegoo|flashforge|snapmaker|anycubic|google|prusa|qidi|klipper|octoprint|fluidd|mainsail/i;

/* Shadows are dark in BOTH themes — a shadow is an absence of light, not a
   surface. --shadow / --shadow-lg cover the common cases; bespoke ones stay
   literal on purpose. Reported separately so they never hide a real defect. */
const SHADOW = /box-shadow|text-shadow|drop-shadow/;

const RAW = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;
const VAR = /var\(\s*(--[a-z0-9-]+)/gi;

/* Declarations are collected from EVERY stylesheet, not just the token file:
   a rule may legitimately declare a local custom property for its own geometry
   (`--op-size`, `--img-h`, a grid span). Only a var() that nothing anywhere
   declares is a ghost. */
const declared = new Set();
for (const f of globSync('renderer/**/*.css')) {
  // Not anchored to line-start: a one-liner rule declares mid-line, e.g.
  // `.rec-panel { --rec-side-padding: 20px; }`.
  for (const m of readFileSync(f, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/gim)) declared.add(m[1]);
}

let raw = 0, ghost = 0, shadows = 0, brands = 0;
const byFile = {};
for (const f of globSync('renderer/**/*.css').sort()) {
  const lines = readFileSync(f, 'utf8').split('\n');
  let inTokens = false;
  lines.forEach((line, i) => {
    // A :root block is where literals belong — that IS the token declaration.
    // Besides 00-base.css this covers renderer/cam/cam.css, the standalone
    // camera window: it loads no shared stylesheet, so it carries its own
    // (deliberately always-dark) token set.
    if (/:root/.test(line)) inTokens = true;
    else if (inTokens && /^\s*\}/.test(line)) inTokens = false;
    if (inTokens) return;
    const code = line.replace(/\/\*.*?\*\//g, '');
    if (ALLOW.some(re => re.test(code))) return;

    for (const m of code.matchAll(RAW)) {
      if (SHADOW.test(code)) { shadows++; continue; }
      if (BRAND.test(code))  { brands++;  continue; }
      (byFile[f] ??= { raw: [], ghost: [] }).raw.push(`${i + 1}: ${m[0]}  ${code.trim().slice(0, 72)}`);
      raw++;
    }
    for (const m of code.matchAll(VAR)) {
      if (!declared.has(m[1]) && !ALLOW.some(re => re.test(m[1]))) {
        (byFile[f] ??= { raw: [], ghost: [] }).ghost.push(`${i + 1}: ${m[1]}`);
        ghost++;
      }
    }
  });
}

const detail = process.argv.includes('--detail');
const only = process.argv.find(a => a.startsWith('--file='))?.slice(7);

console.log(`\n  Theme tokens — ${declared.size} declared in ${TOKENS_FILE}\n`);
for (const [f, v] of Object.entries(byFile).sort((a, b) => (b[1].raw.length + b[1].ghost.length) - (a[1].raw.length + a[1].ghost.length))) {
  if (only && !f.includes(only)) continue;
  console.log(`  ${String(v.raw.length).padStart(4)} raw  ${String(v.ghost.length).padStart(3)} ghost   ${f}`);
  if (detail || only) {
    v.ghost.forEach(g => console.log(`         GHOST ${g}`));
    v.raw.forEach(r => console.log(`         ${r}`));
  }
}
console.log(`\n  TOTAL: ${raw} raw colours, ${ghost} ghost variables`);
console.log(`  exempt: ${shadows} in shadows, ${brands} third-party brand colours\n`);
process.exit(raw + ghost === 0 ? 0 : 1);
