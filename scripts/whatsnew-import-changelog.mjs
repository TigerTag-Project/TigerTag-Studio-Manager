#!/usr/bin/env node
// whatsnew-import-changelog.mjs — backfill data/whatsnew.json from CHANGELOG.md.
//
// Parses every "## vX.Y.Z — DATE" section and turns its bullets into What's New
// items (English baseline; the in-app modal falls back to EN when a locale is
// missing). Versions that ALREADY exist in whatsnew.json are kept untouched, so
// hand-localised entries (9 locales) are never overwritten. The output is
// ordered newest-first.
//
// Run: npm run whatsnew:import   (then optionally localise recent versions)

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGELOG = resolve(root, "CHANGELOG.md");
const OUT = resolve(root, "data/whatsnew.json");

const MAX_ITEMS = 6;        // cap items per version (history stays digestible)
const MAX_BODY = 240;       // cap body length at a word boundary

// Icon = a name from the app's SVG icon set (rendered as `.icon icon-<name>`),
// never an emoji.
const sectionIcon = (name) => {
  const n = (name || "").toLowerCase();
  if (n.includes("add")) return "sparkle";
  if (n.includes("fix")) return "check";
  if (n.includes("chang")) return "wrench";
  if (n.includes("remov")) return "trash";
  if (n.includes("i18n") || n.includes("lang")) return "info";
  return "sparkle";
};

// Emoji / pictograph / symbol ranges — stripped from text (no emojis in the
// project). Covers misc symbols & dingbats, supplemental pictographs, arrows,
// technical symbols and the variation selector.
const EMOJI_RE = /[\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE0F}]/gu;

// Strip markdown + emojis to plain readable text.
const clean = (s) =>
  s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // [text](url) → text
   .replace(/\*\*/g, "")                       // bold
   .replace(/`/g, "")                          // code
   .replace(/(^|[^a-zA-Z0-9])_([^_]+)_/g, "$1$2") // _italic_
   .replace(EMOJI_RE, "")                      // emojis / pictographs / symbols
   .replace(/\s+/g, " ")
   .trim();

const cap = (s) => {
  if (s.length <= MAX_BODY) return s;
  const cut = s.slice(0, MAX_BODY);
  const at = cut.lastIndexOf(" ");
  return (at > 60 ? cut.slice(0, at) : cut).replace(/[.,;:]$/, "") + "…";
};

const lines = readFileSync(CHANGELOG, "utf8").split("\n");
const parsed = {};            // version → { date, items: [{icon,title,body}] }
let version = null, date = "", section = "", current = null;

const pushCurrent = () => {
  if (!current || !version) return;
  const block = parsed[version];
  if (block.items.length >= MAX_ITEMS) { current = null; return; }
  const titleM = current.text.match(/^\*\*(.+?)\*\*\.?\s*/);
  let title, body;
  if (titleM) {
    title = clean(titleM[1]).replace(/\.$/, "");
    body = clean(current.text.slice(titleM[0].length));
  } else {
    const t = clean(current.text);
    title = t.split(/(?<=[.!?])\s/)[0].slice(0, 60);
    body = t;
  }
  if (title) block.items.push({ icon: current.icon, title: cap(title), body: cap(body) });
  current = null;
};

for (const line of lines) {
  const vM = line.match(/^##\s+v(\d+\.\d+\.\d+)\s+[—-]\s+(.+?)\s*$/);
  if (vM) {
    pushCurrent();
    version = vM[1];
    date = vM[2].trim();
    section = "";
    if (!parsed[version]) parsed[version] = { date, items: [] };
    continue;
  }
  if (!version) continue;
  const sM = line.match(/^###\s+(.+?)\s*$/);
  if (sM) { pushCurrent(); section = sM[1]; continue; }
  const bM = line.match(/^-\s+(.+)$/);
  if (bM) {
    pushCurrent();
    current = { icon: sectionIcon(section), text: bM[1] };
    continue;
  }
  // Continuation / sub-bullet → append to the current item body.
  if (current && /^\s+\S/.test(line)) {
    current.text += " " + line.replace(/^\s*-?\s*/, "");
  }
}
pushCurrent();

// Merge: keep existing whatsnew entries (localised), add missing ones (EN only).
let existing = {};
try { existing = JSON.parse(readFileSync(OUT, "utf8")); } catch {}

const semverDesc = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
};

// An entry is "localised" (hand-written, keep as-is) if any item carries a
// non-EN locale. EN-only baselines are regenerated so re-imports pick up parser
// / icon changes.
const isLocalised = (entry) =>
  Array.isArray(entry?.items) && entry.items.some((it) =>
    ["fr", "de", "es", "it", "zh", "pt", "pt-pt", "pl"].some(
      (l) => (it.title && it.title[l]) || (it.body && it.body[l])));

const merged = {};
let added = 0, kept = 0;
for (const ver of Object.keys(parsed).sort(semverDesc)) {
  if (existing[ver] && isLocalised(existing[ver])) { merged[ver] = existing[ver]; kept++; continue; }
  merged[ver] = {
    date: parsed[ver].date,
    items: parsed[ver].items.map((it) => ({
      icon: it.icon,
      title: { en: it.title },
      body: { en: it.body },
    })),
  };
  added++;
}
// Preserve any localised versions that aren't in the CHANGELOG (defensive).
for (const ver of Object.keys(existing)) if (!merged[ver]) merged[ver] = existing[ver];

writeFileSync(OUT, JSON.stringify(merged, null, 2) + "\n");
console.log(`[whatsnew-import] ${added} version(s) imported (EN), ${kept} existing kept. Total ${Object.keys(merged).length}.`);
