#!/usr/bin/env node
//
// scripts/i18n-add.mjs — Add (or update) a single i18n key across every
// locale file in `renderer/locales/`. Inspired by the friction of
// editing 9 JSON files by hand for every new feature.
//
// Usage:
//   node scripts/i18n-add.mjs <key> [--after <anchorKey>] <locale>=<text> [...]
//   node scripts/i18n-add.mjs <key> [--after <anchorKey>] --json '{"fr":"…","en":"…"}'
//
// Supported locales: en fr de es it zh pt pt-pt pl
//                    (anything else triggers an error with the list)
//
// Behaviour
// ─────────
//  • The key is inserted *just after* `--after <anchorKey>` if given,
//    otherwise appended at the end of each file (before the final `}`).
//    The anchor's location is independent in every locale file — we
//    look it up locally per file. If the anchor is missing in a file,
//    we fall back to the end-of-file insertion for that file only.
//
//  • If a key with the same name already exists, its value is updated
//    in-place (same line, same comma) — the file order is preserved.
//
//  • Locales not provided on the CLI default to the English value with
//    a `[i18n-add] missing translation: …` warning printed to stderr,
//    so the run is never silently incomplete.
//
//  • The file is preserved as text — we don't re-stringify the entire
//    JSON. That keeps existing formatting / order / comments-stripped
//    state intact across runs.
//
//  • After every write the file is re-parsed with JSON.parse() to make
//    sure no run produced invalid JSON. A failure aborts the run with
//    an error before any file is committed to disk (we write to a temp
//    string first, parse, then commit).
//
// Exit codes
//   0  success (every locale written)
//   1  bad CLI args
//   2  invalid JSON would have been produced (no file modified)
//   3  unknown locale on the CLI
//

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, "..", "renderer", "locales");

// Hard-coded list — same set the renderer ships with. Adding a new
// locale to the renderer = update this array and ship a new file.
const LOCALES = ["en", "fr", "de", "es", "it", "zh", "pt", "pt-pt", "pl"];

// ── CLI parsing ───────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0].startsWith("-")) usage(1);
  const key = args.shift();
  const result = { key, anchor: null, values: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--after") {
      result.anchor = args[++i];
      if (!result.anchor) {
        console.error("[i18n-add] --after needs an anchor key");
        process.exit(1);
      }
      continue;
    }
    if (a === "--json") {
      const raw = args[++i];
      try {
        const obj = JSON.parse(raw);
        for (const [k, v] of Object.entries(obj)) result.values[k] = String(v);
      } catch (e) {
        console.error("[i18n-add] --json payload is not valid JSON:", e.message);
        process.exit(1);
      }
      continue;
    }
    if (a === "-h" || a === "--help") usage(0);
    // KEY=VALUE form. The value may contain "=" (it's everything after
    // the FIRST "="), so we don't split on every occurrence.
    const eqIdx = a.indexOf("=");
    if (eqIdx <= 0) {
      console.error(`[i18n-add] unrecognised arg: "${a}"`);
      usage(1);
    }
    const locale = a.slice(0, eqIdx);
    const text   = a.slice(eqIdx + 1);
    if (!LOCALES.includes(locale)) {
      console.error(`[i18n-add] unknown locale "${locale}" — supported: ${LOCALES.join(", ")}`);
      process.exit(3);
    }
    result.values[locale] = text;
  }
  return result;
}

function usage(code) {
  console.log(
`Usage:
  node scripts/i18n-add.mjs <key> [--after <anchorKey>] <locale>=<text> [...]
  node scripts/i18n-add.mjs <key> [--after <anchorKey>] --json '{"fr":"…","en":"…"}'

Examples:
  node scripts/i18n-add.mjs toolboxNew \\
    fr="Nouveau" en="New" de="Neu" \\
    es="Nuevo" it="Nuovo" zh="新建" \\
    pt="Novo" pt-pt="Novo" pl="Nowy"

  node scripts/i18n-add.mjs toolboxNew --after toolboxTitle \\
    --json '{"fr":"Nouveau","en":"New"}'

Supported locales: ${LOCALES.join(", ")}
`);
  process.exit(code);
}

// ── JSON-string escape (matches what JSON.stringify would do for a
//    primitive string), so values with quotes / newlines / unicode
//    survive. We don't trust the user's input to be safe.
function jsonEscape(str) {
  return JSON.stringify(String(str));
}

// ── Insert / update a key in a locale file ────────────────────────────
//   text  : full file as a string (with \n line endings)
//   key   : the key to add or update
//   value : the localized string
//   anchor: optional key to anchor insertion AFTER. If null/missing in
//           this file, we append before the closing `}`.
//
// We work on the raw text (not on JSON.parse → JSON.stringify) to keep
// the file's existing key order and any cosmetic formatting intact.
// Returns the new text.
function upsertKey(text, key, value, anchor) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const indent     = "  ";              // every locale file uses 2-space
  const newLine    = `${indent}${jsonEscape(key)}: ${jsonEscape(value)}`;

  // 1. Key already exists — update in place. Match the whole line
  //    (the value can contain commas, escaped quotes, etc.).
  const existingRe = new RegExp(
    `^([ \\t]*)${escapedKey.replace(/(["\\])/g, "\\$1")
      .replace(/^/, '"').replace(/$/, '"')}\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"(,?)`,
    "m"
  );
  // ↑ that regex is pretty hairy, let's go simpler with a line split
  //   approach instead:
  const lines = text.split("\n");
  const keyToken = jsonEscape(key);
  for (let i = 0; i < lines.length; i++) {
    // Look for `  "key": ` at the start of the line (after the file's
    // 2-space indent). Use a substring check so we don't have to
    // re-engineer the regex above.
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith(`${keyToken}:`) || trimmed.startsWith(`${keyToken} :`)) {
      const hadComma = lines[i].trimEnd().endsWith(",");
      lines[i] = `${indent}${keyToken}: ${jsonEscape(value)}${hadComma ? "," : ""}`;
      return lines.join("\n");
    }
  }

  // 2. Key doesn't exist — INSERT.
  //
  //    a) `--after <anchor>` provided AND that anchor exists in this
  //       file: insert immediately after the anchor line. We make sure
  //       the anchor line ends with a comma (it always does in the
  //       middle of a JSON object), and we add a trailing comma to
  //       OUR new line if there's another key after us.
  //    b) Otherwise append before the final `}`.

  if (anchor) {
    const anchorToken = jsonEscape(anchor);
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (trimmed.startsWith(`${anchorToken}:`) || trimmed.startsWith(`${anchorToken} :`)) {
        // Anchor's line: make sure it ends with a comma.
        const trimEnd = lines[i].trimEnd();
        if (!trimEnd.endsWith(",")) {
          lines[i] = trimEnd + ",";
        }
        // Look at the line AFTER the anchor to decide if our new line
        // needs a trailing comma. If it's the closing `}`, skip the
        // comma; otherwise add one.
        const after = (lines[i + 1] ?? "").trimStart();
        const trailingComma = after.startsWith("}") ? "" : ",";
        lines.splice(i + 1, 0, `${indent}${keyToken}: ${jsonEscape(value)}${trailingComma}`);
        return lines.join("\n");
      }
    }
    // Anchor missing → fall through to end-of-file append.
    console.warn(`[i18n-add] anchor "${anchor}" not found — appending instead`);
  }

  // c) Default: append before the closing `}`. Find the LAST line that
  //    contains a closing brace at column 0. Make sure the line just
  //    before it ends with a comma, then insert our new key before `}`.
  let closeIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === "}") { closeIdx = i; break; }
  }
  if (closeIdx === -1) {
    throw new Error("could not find the closing brace");
  }
  // Ensure the line directly before `}` ends with a comma.
  for (let i = closeIdx - 1; i >= 0; i--) {
    if (lines[i].trim() === "") continue;
    const trimEnd = lines[i].trimEnd();
    if (!trimEnd.endsWith(",")) {
      lines[i] = trimEnd + ",";
    }
    break;
  }
  lines.splice(closeIdx, 0, `${indent}${keyToken}: ${jsonEscape(value)}`);
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────
function main() {
  const { key, anchor, values } = parseArgs(process.argv);
  if (!values.en && !values["en-us"] && !values["en-gb"]) {
    // Soft warning — not an error. We need at least ONE value to fall
    // back on for missing locales.
    if (Object.keys(values).length === 0) {
      console.error("[i18n-add] no translations provided — pass at least <locale>=<text>");
      process.exit(1);
    }
  }
  const fallback = values.en || values[Object.keys(values)[0]];

  // Plan the writes — build the new text for each locale BEFORE
  // touching disk, so a JSON-parse error in any file aborts the whole
  // run with no partial state.
  const planned = []; // [{ file, locale, newText }]
  for (const locale of LOCALES) {
    const file = path.join(LOCALES_DIR, `${locale}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`[i18n-add] missing file: ${file} — skipped`);
      continue;
    }
    const original = fs.readFileSync(file, "utf8");
    const value    = (locale in values) ? values[locale] : fallback;
    if (!(locale in values)) {
      console.warn(`[i18n-add] missing translation for "${locale}" — falling back to "${fallback}"`);
    }
    const updated = upsertKey(original, key, value, anchor);
    // Validate JSON parses.
    try {
      JSON.parse(updated);
    } catch (e) {
      console.error(`[i18n-add] would produce invalid JSON for ${locale}.json: ${e.message}`);
      console.error("Run aborted, no file written.");
      process.exit(2);
    }
    planned.push({ file, locale, newText: updated, changed: updated !== original });
  }

  // Commit the writes.
  let written = 0;
  for (const p of planned) {
    if (p.changed) {
      fs.writeFileSync(p.file, p.newText, "utf8");
      written++;
    }
  }
  console.log(`[i18n-add] "${key}" — ${written}/${planned.length} files updated${anchor ? ` (after "${anchor}")` : ""}`);
}

main();
