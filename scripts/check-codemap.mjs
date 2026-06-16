#!/usr/bin/env node
// check-codemap.mjs — verifies each CODEMAP doc still matches its source file,
// so the maps never silently rot.
//   • renderer/CODEMAP.md ↔ renderer/inventory.js
//   • CODEMAP-main.md     ↔ main.js
//
// Per target it checks:
//   1. Every backticked anchor in a section table whose header declares a line
//      range `## Title (L123-456)` resolves to a function/const defined inside
//      that range (± TOLERANCE lines). Tokens that aren't bare identifiers
//      (e.g. IPC channels with `:`/`-`) are skipped — they're orientation only.
//   2. The highest mapped line stays within FILE_DRIFT lines of real EOF.
//   3. At least MIN_ANCHORS anchors resolve, else the map/parser is broken.
//
// Run: npm run codemap:check   (also wired into .githooks/pre-commit)

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  { source: "renderer/inventory.js", codemap: "renderer/CODEMAP.md" },
  { source: "main.js", codemap: "CODEMAP-main.md" },
];

const TOLERANCE = 150; // lines an anchor may drift outside its declared range
const FILE_DRIFT = 400; // max gap between highest mapped line and real EOF
const MIN_ANCHORS = 12; // below this the map (or this parser) is broken

// Index every top-level (or indented) function/const definition in a source.
function indexDefs(srcLines) {
  const defs = new Map(); // name → [lineNo, …]
  srcLines.forEach((line, i) => {
    const m = line.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) { if (!defs.has(m[1])) defs.set(m[1], []); defs.get(m[1]).push(i + 1); }
    const c = line.match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\{|async|\()/);
    if (c) { if (!defs.has(c[1])) defs.set(c[1], []); defs.get(c[1]).push(i + 1); }
  });
  return defs;
}

function checkTarget({ source, codemap }) {
  const srcLines = readFileSync(resolve(root, source), "utf8").split("\n");
  const defs = indexDefs(srcLines);
  const mapLines = readFileSync(resolve(root, codemap), "utf8").split("\n");

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
    if (/^#{2,3}\s+/.test(line)) { section = null; continue; }
    if (!section || !line.startsWith("|")) continue;

    for (const tick of line.matchAll(/`([^`]+)`/g)) {
      let name = tick[1].trim();
      const fn = name.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)$/);
      if (fn) name = fn[1];
      name = name.replace(/\(.*$/, ""); // strip `(id)` style suffixes
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      const lines = defs.get(name);
      if (!lines) continue; // not a top-level function (state key, DOM id, channel…)
      checked++;
      const ok = lines.some((l) => l >= section.start - TOLERANCE && l <= section.end + TOLERANCE);
      if (!ok) {
        failures.push(
          `  [${source}] ${name} — defined at L${lines.join("/L")}, ` +
            `but mapped in "${section.title}" (L${section.start}-${section.end})`
        );
      }
    }
  }

  const eof = srcLines.length;
  if (Math.abs(eof - maxMapped) > FILE_DRIFT) {
    failures.push(
      `  [${source}] file length drift — ${eof} lines but the map covers up to ` +
        `L${maxMapped} (allowed gap: ${FILE_DRIFT})`
    );
  }
  if (checked < MIN_ANCHORS) {
    failures.push(`  [${source}] only ${checked} anchors resolved (minimum ${MIN_ANCHORS})`);
  }

  return { source, checked, eof, failures };
}

const results = TARGETS.map(checkTarget);
const failures = results.flatMap((r) => r.failures);

if (failures.length) {
  console.error(`CODEMAP drift detected (${failures.length} issue(s)):\n`);
  console.error(failures.join("\n"));
  console.error(
    "\nFix: update the line ranges in the CODEMAP doc to match its source " +
      "(grep the anchor names for real positions)."
  );
  process.exit(1);
}

console.log(
  results.map((r) => `OK — ${r.checked} anchors verified against ${r.source} (${r.eof} lines)`).join("\n") +
    "\nno drift."
);
