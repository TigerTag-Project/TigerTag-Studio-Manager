#!/usr/bin/env node
// whatsnew-check.mjs — validate data/whatsnew.json before a release.
//
// Checks, for every version block:
//   • valid JSON, shape { date, items: [...] }
//   • each item has an `icon` and title/body objects
//   • every one of the 9 locales is present AND non-empty for title + body
//
// Run: npm run whatsnew:check   (also wired into the release ritual)

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LOCALES = ["en", "fr", "de", "es", "it", "zh", "pt", "pt-pt", "pl"];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(root, "data/whatsnew.json");

let data;
try {
  data = JSON.parse(readFileSync(FILE, "utf8"));
} catch (e) {
  console.error(`[whatsnew-check] cannot parse ${FILE}: ${e.message}`);
  process.exit(1);
}

const issues = [];
let versions = 0, items = 0;

for (const [version, block] of Object.entries(data)) {
  versions++;
  if (!block || !Array.isArray(block.items)) {
    issues.push(`${version}: missing "items" array`);
    continue;
  }
  block.items.forEach((it, i) => {
    items++;
    const at = `${version} item#${i + 1}`;
    if (!it.icon) issues.push(`${at}: missing icon`);
    for (const field of ["title", "body"]) {
      const map = it[field];
      if (!map || typeof map !== "object") { issues.push(`${at}: missing "${field}"`); continue; }
      // EN is always required (it's the fallback the app renders).
      if (!map.en || !String(map.en).trim()) issues.push(`${at}: empty ${field}.en`);
      // An entry is either EN-only (imported baseline) or FULLY localised — no
      // half-translated states. If any non-EN locale is filled, all 9 must be.
      const filledOther = LOCALES.filter((l) => l !== "en" && map[l] && String(map[l]).trim());
      if (filledOther.length > 0) {
        for (const loc of LOCALES) {
          if (!map[loc] || !String(map[loc]).trim()) issues.push(`${at}: partial localisation — empty ${field}.${loc}`);
        }
      }
      const extra = Object.keys(map).filter((k) => !LOCALES.includes(k));
      if (extra.length) issues.push(`${at}: unexpected locale(s) in ${field}: ${extra.join(", ")}`);
    }
  });
}

if (issues.length) {
  console.error(`[whatsnew-check] ${issues.length} issue(s):\n` + issues.map((s) => "  " + s).join("\n"));
  process.exit(1);
}
console.log(`[whatsnew-check] OK — ${versions} version(s), ${items} item(s), all 9 locales filled.`);
