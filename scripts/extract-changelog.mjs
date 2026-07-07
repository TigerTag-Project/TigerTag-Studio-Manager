#!/usr/bin/env node
// Produce the GitHub Release body for a given version and print it to stdout.
// Used by the Build & Release workflow (prepare-release job) to auto-fill the
// release description.
//
// Usage: node scripts/extract-changelog.mjs 1.10.31   (leading "v" is tolerated)
//
// SOURCE PRIORITY (the "release note" is register 2 of three — see CLAUDE.md
// "Three copy registers"):
//   1. data/release-notes/v<version>.md   — the hand-written BambuLab-style
//      release note. Printed VERBATIM (it already carries its own footer).
//      This is the source of truth for the public release page.
//   2. Fallback — the matching "## vX.Y.Z" section of CHANGELOG.md (register 1,
//      technical), with a footer appended. Used only when no dedicated release
//      note exists, so a release is never left with an empty body.
//
// Exits 0 with a generic line if neither source is found (never fails a release).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHANGELOG = join(ROOT, 'CHANGELOG.md');

const raw = (process.argv[2] || '').trim().replace(/^v/i, '');
if (!raw) {
  console.error('Usage: extract-changelog.mjs <version>');
  process.exit(2);
}

const FOOTER =
  `\n\n---\n\n📖 **[Full changelog](https://github.com/TigerTag-Project/TigerTag-Studio-Manager/blob/main/CHANGELOG.md)** · ` +
  `⬇️ Grab the installer for your OS from the **Assets** below (macOS \`.dmg\`, Windows \`Setup .exe\`, Linux \`.AppImage\`).`;

// ── 1. Dedicated release note (register 2) — printed verbatim. ────────────────
for (const name of [`v${raw}.md`, `${raw}.md`]) {
  const p = join(ROOT, 'data', 'release-notes', name);
  if (existsSync(p)) {
    process.stdout.write(readFileSync(p, 'utf8').trimEnd() + '\n');
    process.exit(0);
  }
}

// ── 2. Fallback — extract the CHANGELOG.md section (register 1) + footer. ──────
const lines = readFileSync(CHANGELOG, 'utf8').split(/\r?\n/);

// A version header looks like: "## v1.10.31 — 2026-07-06" (em dash or plain dash).
const isVersionHeader = (l) => /^##\s+v\d+\.\d+\.\d+\b/.test(l);
const matchesTarget = (l) =>
  new RegExp(`^##\\s+v${raw.replace(/\./g, '\\.')}\\b`).test(l);

let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (matchesTarget(lines[i])) { start = i; break; }
}

if (start === -1) {
  // Graceful fallback — keep the release readable even if the entry is missing.
  process.stdout.write(
    `Release v${raw}.\n\nSee the [full changelog](https://github.com/TigerTag-Project/TigerTag-Studio-Manager/blob/main/CHANGELOG.md).\n`
  );
  process.exit(0);
}

// Collect from the line after the header up to the next version header.
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (isVersionHeader(lines[i])) { end = i; break; }
}

let body = lines.slice(start + 1, end).join('\n');
// Drop the trailing "---" separator and surrounding blank lines.
body = body.replace(/\n*\s*---\s*$/, '').trim();

process.stdout.write(body + FOOTER + '\n');
