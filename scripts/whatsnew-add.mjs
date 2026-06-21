#!/usr/bin/env node
// whatsnew-add.mjs — scaffold a "What's New" entry for a release.
//
// Adds (or resets) a version block in data/whatsnew.json with N empty,
// fully-localised item skeletons (all 9 locales present, empty strings) so the
// release author only has to fill in the text. Existing versions are kept
// untouched (history is preserved).
//
// Usage:
//   npm run whatsnew:add -- 1.10.16                  # 4 items, today undated
//   npm run whatsnew:add -- 1.10.16 --items 3 --date 2026-07-01
//   npm run whatsnew:add -- 1.10.16 --force          # overwrite an existing block
//
// After running, edit data/whatsnew.json: set each item's `icon` (emoji) and
// fill the title/body strings for every locale. Run `npm run whatsnew:check`
// to verify completeness before release.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LOCALES = ["en", "fr", "de", "es", "it", "zh", "pt", "pt-pt", "pl"];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(root, "data/whatsnew.json");

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--"));
const force = args.includes("--force");
const itemsIdx = args.indexOf("--items");
const dateIdx = args.indexOf("--date");
const nItems = itemsIdx >= 0 ? parseInt(args[itemsIdx + 1], 10) || 4 : 4;
const date = dateIdx >= 0 ? args[dateIdx + 1] : "";

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run whatsnew:add -- <x.y.z> [--items N] [--date YYYY-MM-DD] [--force]');
  process.exit(1);
}

const emptyLocaleMap = () => Object.fromEntries(LOCALES.map((l) => [l, ""]));
// icon = a name from the app's SVG icon set (rendered as `.icon icon-<name>`),
// e.g. "sparkle", "folder", "palette", "bell", "wrench". Never an emoji.
const emptyItem = () => ({ icon: "sparkle", title: emptyLocaleMap(), body: emptyLocaleMap() });

let data;
try {
  data = JSON.parse(readFileSync(FILE, "utf8"));
} catch (e) {
  console.error(`[whatsnew-add] cannot read ${FILE}: ${e.message}`);
  process.exit(1);
}

if (data[version] && !force) {
  console.error(`[whatsnew-add] version ${version} already exists — pass --force to overwrite.`);
  process.exit(1);
}

data[version] = {
  date,
  items: Array.from({ length: nItems }, emptyItem),
};

writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
console.log(`[whatsnew-add] scaffolded ${version} with ${nItems} item(s) in data/whatsnew.json — now fill the text.`);
