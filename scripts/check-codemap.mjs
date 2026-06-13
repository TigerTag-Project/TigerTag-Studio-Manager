#!/usr/bin/env node
// check-codemap.mjs — verifies that renderer/CODEMAP.md still matches
// renderer/inventory.js, so the map never silently rots again.
//
// What it checks:
//   1. Every backticked anchor in a section table whose header declares a
//      line range `## Title (L123-456)` must resolve to a function defined
//      inside that range (± TOLERANCE lines).
//   2. The highest mapped line must stay within FILE_DRIFT lines of the
//      actual file length (catches large unmapped additions/removals).
//   3. Sanity: at least MIN_ANCHORS anchors must resolve, otherwise the
//      map (or this parser) is broken and the check fails loudly.
//
// Run: npm run codemap:check   (also wired into .githooks/pre-commit)

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CODEMAP = resolve(root, "renderer/CODEMAP.md");
const SOURCE = resolve(root, "renderer/inventory.js");

const TOLERANCE = 150; // lines an anchor may drift outside its declared range
const FILE_DRIFT = 400; // max gap between highest mapped line and real EOF
const MIN_ANCHORS = 20; // below this the map is considered unparseable

// ── Index every top-level function definition in inventory.js ───────────
const srcLines = readFileSync(SOURCE, "utf8").split("\n");
const defs = new Map(); // name → [lineNo, …]
srcLines.forEach((line, i) => {
  const m = line.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (m) {
    if (!defs.has(m[1])) defs.set(m[1], []);
    defs.get(m[1]).push(i + 1);
  }
  const c = line.match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|async|\()/);
  if (c) {
    if (!defs.has(c[1])) defs.set(c[1], []);
    defs.get(c[1]).push(i + 1);
  }
});

// ── Parse CODEMAP sections + their anchors ───────────────────────────────
const mapLines = readFileSync(CODEMAP, "utf8").split("\n");
let section = null; // { title, start, end }
let maxMapped = 0;
let checked = 0;
const failures = [];

for (const line of mapLines) {
  const head = line.match(/^#{2,3}\s+(.*)\(L(\d+)[-–+]?(\d+)?\)\s*$/);
  if (head) {
    section = {
      title: head[1].trim(),
      start: parseInt(head[2], 10),
      end: head[3] ? parseInt(head[3], 10) : parseInt(head[2], 10),
    };
    maxMapped = Math.max(maxMapped, section.end);
    continue;
  }
  if (/^#{2,3}\s+/.test(line)) {
    section = null; // section without a range (cookbook, notes, modules)
    continue;
  }
  if (!section || !line.startsWith("|")) continue;

  // collect backticked tokens in table rows, e.g. `openDetail`, `function t`
  for (const tick of line.matchAll(/`([^`]+)`/g)) {
    let name = tick[1].trim();
    const fn = name.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)$/);
    if (fn) name = fn[1];
    name = name.replace(/\(.*$/, ""); // strip `(id)` style suffixes
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    const lines = defs.get(name);
    if (!lines) continue; // not a top-level function (state key, DOM id, …)
    checked++;
    const ok = lines.some(
      (l) => l >= section.start - TOLERANCE && l <= section.end + TOLERANCE
    );
    if (!ok) {
      failures.push(
        `  ${name} — defined at L${lines.join("/L")}, ` +
          `but mapped in "${section.title}" (L${section.start}-${section.end})`
      );
    }
  }
}

// ── File-length drift ────────────────────────────────────────────────────
const eof = srcLines.length;
if (Math.abs(eof - maxMapped) > FILE_DRIFT) {
  failures.push(
    `  file length drift — inventory.js has ${eof} lines but the map ` +
      `covers up to L${maxMapped} (allowed gap: ${FILE_DRIFT})`
  );
}

if (checked < MIN_ANCHORS) {
  failures.push(
    `  only ${checked} anchors resolved (minimum ${MIN_ANCHORS}) — ` +
      `CODEMAP.md structure changed or parser is broken`
  );
}

if (failures.length) {
  console.error(`CODEMAP drift detected (${failures.length} issue(s)):\n`);
  console.error(failures.join("\n"));
  console.error(
    "\nFix: update the line ranges in renderer/CODEMAP.md to match " +
      "renderer/inventory.js (grep the anchor names for real positions)."
  );
  process.exit(1);
}

console.log(
  `OK — ${checked} anchors verified against inventory.js (${eof} lines), no drift.`
);
