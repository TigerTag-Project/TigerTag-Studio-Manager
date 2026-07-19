#!/usr/bin/env node
/**
 * check-docs-drift.mjs — catches the documentation facts that silently rot.
 *
 * Some docs restate numbers that live in the code: a version, a line count, how
 * many printer brands ship, how many i18n keys exist. Nothing breaks when they
 * drift, so nobody notices — `llms.txt` once claimed v1.8.2 / "~12 000 lines" /
 * "5 brands" while the app was at v2.12.0 / 28 500 lines / 6 brands, and that
 * file is what an AI agent reads first to understand the repo.
 *
 * This checks only facts that can be derived from the source of truth, so it
 * never guesses and never nags about prose. Each finding names the file, what it
 * claims, and what is actually true.
 *
 * Run: npm run docs:check      (also run by .githooks/pre-commit)
 * Exit: 0 clean · 1 drift found
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");
const issues = [];
const fail = (file, claim, actual, fix) =>
  issues.push({ file, claim, actual, fix });

// ── Sources of truth ────────────────────────────────────────────────────
const pkg = JSON.parse(read("package.json"));
const version = pkg.version;
const invLines = read("renderer/inventory.js").split("\n").length;
const cssCount = readdirSync(join(root, "renderer/css")).filter(f => f.endsWith(".css")).length;
const brands = readdirSync(join(root, "renderer/printers"), { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(root, "renderer/printers", d.name, "index.js")))
  .map(d => d.name);
const i18nKeys = Object.keys(JSON.parse(read("renderer/locales/en.json"))).length;

// ── llms.txt — the agent-facing summary, the most drift-prone file ──────
const llms = read("llms.txt");

// Version. package.json is pre-bumped to the NEXT patch right after a release
// (see CLAUDE.md), so llms.txt legitimately trails by one patch — accept either
// the current value or the released one it was bumped from.
const mVer = llms.match(/Current version:\s*\*\*([\d.]+)\*\*/);
if (!mVer) {
  fail("llms.txt", "no 'Current version: **x.y.z**' line", version, "add one");
} else {
  const [maj, min, pat] = version.split(".").map(Number);
  const prevPatch = pat > 0 ? `${maj}.${min}.${pat - 1}` : null;
  if (mVer[1] !== version && mVer[1] !== prevPatch) {
    fail("llms.txt", `version ${mVer[1]}`, version, `set it to ${version}`);
  }
}

// Renderer size, stated as "~28 500 lines" (space-grouped). 15 % tolerance:
// this is a rough order of magnitude, not a running total.
const mLines = llms.match(/~([\d\s ]+)\s*lines/);
if (mLines) {
  const claimed = Number(mLines[1].replace(/[\s ]/g, ""));
  if (Math.abs(claimed - invLines) / invLines > 0.15) {
    fail("llms.txt", `~${claimed} renderer lines`, `${invLines}`,
         `round to ~${(Math.round(invLines / 500) * 500).toLocaleString("fr-FR").replace(/ /g, " ")}`);
  }
}

// CSS file count.
const mCss = llms.match(/\((\d+) files, loaded in numeric order/);
if (mCss && Number(mCss[1]) !== cssCount) {
  fail("llms.txt", `${mCss[1]} CSS files`, `${cssCount}`, `set it to ${cssCount}`);
}

// Printer brands: the stated count AND the protocol table must both be complete.
const mBrands = llms.match(/integration for (\d+) brands/);
if (mBrands && Number(mBrands[1]) !== brands.length) {
  fail("llms.txt", `${mBrands[1]} printer brands`, `${brands.length}`, `set it to ${brands.length}`);
}
const label = { bambulab: "Bambu Lab", flashforge: "FlashForge" };
const missing = brands.filter(b => {
  const name = label[b] || b[0].toUpperCase() + b.slice(1);
  return !new RegExp(`^\\|\\s*${name}\\s*\\|`, "mi").test(llms);
});
if (missing.length) {
  fail("llms.txt", "protocol table missing brands", missing.join(", "),
       "add a row per brand under '## Printer integrations'");
}

// i18n key count. 2 % tolerance — keys move on nearly every commit.
const mKeys = llms.match(/([\d\s ]+)\s*keys × 9 locales/);
if (mKeys) {
  const claimed = Number(mKeys[1].replace(/[\s ]/g, ""));
  if (Math.abs(claimed - i18nKeys) / i18nKeys > 0.02) {
    fail("llms.txt", `${claimed} i18n keys`, `${i18nKeys}`, `set it to ${i18nKeys}`);
  }
}

// ── FEATURES.md — the catalogue states the release it is current as of ──
const feats = read("FEATURES.md");
const mFeat = feats.match(/current as of \*\*v([\d.]+)\*\*/);
if (!mFeat) {
  fail("FEATURES.md", "no 'current as of **vX.Y.Z**' line", version, "add one");
} else {
  const [maj, min, pat] = version.split(".").map(Number);
  const prevPatch = pat > 0 ? `${maj}.${min}.${pat - 1}` : null;
  if (mFeat[1] !== version && mFeat[1] !== prevPatch) {
    fail("FEATURES.md", `current as of v${mFeat[1]}`, `v${version}`,
         `set it to v${version} once this release's features are catalogued`);
  }
}

// ── Docs must not point at paths that no longer exist ───────────────────
// A renamed or deleted folder leaves dangling references behind (the `brand/`
// removal is the live example). Only checks explicit repo-root paths.
for (const file of ["README.md", "llms.txt", "CLAUDE.md", "AGENT.md"]) {
  if (!existsSync(join(root, file))) continue;
  const body = read(file);
  const seen = new Set();
  for (const m of body.matchAll(/`((?:assets|assets-src|data|scripts|services|renderer|build)\/[A-Za-z0-9._\-/]*)`/g)) {
    const p = m[1];
    // Skip templates and globs — `data/release-notes/vX.Y.Z.md`, `renderer/printers/<brand>/…`
    if (seen.has(p) || /[<*{]|X\.Y\.Z|\bNN?\b/.test(p)) continue;
    seen.add(p);
    if (!existsSync(join(root, p))) {
      fail(file, `references \`${p}\``, "path does not exist", "update or remove the reference");
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────
if (!issues.length) {
  console.log(`[docs-check] OK — llms.txt, FEATURES.md and doc paths match the source (v${version}, ${invLines} renderer lines, ${brands.length} brands, ${i18nKeys} i18n keys).`);
  process.exit(0);
}
console.error(`Documentation drift detected (${issues.length} issue(s)):\n`);
for (const i of issues) {
  console.error(`  [${i.file}] claims ${i.claim} — actually ${i.actual}`);
  console.error(`      → ${i.fix}`);
}
console.error(`\nThese numbers are read by humans AND by agents. Fix them, or run with --no-verify if you truly mean to leave them.`);
process.exit(1);
