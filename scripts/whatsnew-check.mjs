#!/usr/bin/env node
// whatsnew-check.mjs — validate data/whatsnew.json before a release.
//
// Checks, for every version block:
//   • valid JSON, shape { date, items: [...] }
//   • each item has an `icon` and title/body objects
//   • every locale REQUIRED FOR THAT VERSION is present AND non-empty for
//     title + body — a locale that shipped later is not required on the
//     entries written before it (see LOCALE_SINCE)
//
// Run: npm run whatsnew:check   (also wired into the release ritual)

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LOCALES = ["en", "fr", "de", "es", "it", "zh", "pt", "pt-pt", "pl", "ru", "nl"];
// A locale added later cannot be demanded of the entries written before it —
// Russian and Dutch both ship in v2.28.0, and the 500-odd items already in the
// history would otherwise all read as half-translated. Every late locale
// records the version it arrived in; everything from that version on must
// carry it.
const LOCALE_SINCE = { ru: "2.28.0", nl: "2.28.0" };
const vnum = (v) => String(v).split(".").map(Number);
const gte = (a, b) => {
  const [x, y, z] = vnum(a), [p, q, r] = vnum(b);
  return x !== p ? x > p : y !== q ? y > q : z >= r;
};
const localesFor = (version) =>
  LOCALES.filter((l) => !LOCALE_SINCE[l] || gte(version, LOCALE_SINCE[l]));
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
  const required = localesFor(version);
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
      // half-translated states. If any non-EN locale is filled, every locale
      // this version is expected to carry must be.
      const filledOther = required.filter((l) => l !== "en" && map[l] && String(map[l]).trim());
      if (filledOther.length > 0) {
        for (const loc of required) {
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
console.log(`[whatsnew-check] OK — ${versions} version(s), ${items} item(s), every expected locale filled.`);
