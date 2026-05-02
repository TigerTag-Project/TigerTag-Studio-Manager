#!/usr/bin/env node
/**
 * Regenerate `dist/latest.yml` after a post-build signature pass.
 *
 * Why this exists
 * ───────────────
 * `electron-builder` writes `latest.yml` (the auto-updater manifest) at the
 * end of the build, before any external code-signing step runs. When we sign
 * the resulting `.exe` with Microsoft Trusted Signing post-build, the PE
 * authenticode signature is embedded into the binary, which changes its
 * SHA-512 and its byte size. The `latest.yml` written by electron-builder is
 * now stale: any auto-updater client that fetches the new release will
 * download the signed `.exe`, compute its SHA-512, mismatch against the value
 * in `latest.yml`, and refuse the update with a "checksum mismatch" error.
 *
 * This script reads each `*.exe` in `dist/`, recomputes SHA-512 + size, and
 * patches `dist/latest.yml` (and `dist/latest-mac.yml` / `dist/latest-linux.yml`
 * if present, though they normally aren't on a Windows runner) so that the
 * manifest matches the actually-uploaded binaries.
 *
 * Run from the repo root:
 *   node scripts/regen-latest-yml.mjs
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIST = "dist";

/**
 * Compute base64-encoded SHA-512 of a file (the format electron-updater expects).
 */
async function sha512Base64(filePath) {
  const buf = await readFile(filePath);
  return createHash("sha512").update(buf).digest("base64");
}

/**
 * In-place patch a single YAML manifest. We use string replacement rather than
 * a YAML parse → re-emit because electron-builder's emitted YAML has subtle
 * formatting we want to preserve (indentation, key order, single-quoted ISO
 * dates) and any round-trip through a generic YAML library would re-shuffle it.
 *
 * Replaces every `sha512: <value>` and `size: <value>` line for a given file
 * basename. The `latest.yml` shape is roughly:
 *
 *   version: 1.4.4
 *   files:
 *     - url: TigerTag-Studio-Manager-Setup-1.4.4.exe
 *       sha512: <base64>
 *       size: <bytes>
 *   path: TigerTag-Studio-Manager-Setup-1.4.4.exe
 *   sha512: <base64>
 *   releaseDate: '...'
 *
 * Both the `files[].sha512` (under the `url` block) and the top-level `sha512`
 * for the matching `path:` need to be kept in sync.
 */
async function patchManifest(manifestPath, exeMap) {
  let yaml;
  try {
    yaml = await readFile(manifestPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
  const lines = yaml.split("\n");

  // First pass — find which exe each block belongs to so we can patch
  // sha512/size that follow it. We track the most recent `url:` and `path:`
  // values as we walk the file.
  let currentBlockExe = null; // last `url:` seen inside `files:`
  let topLevelExe = null;     // value of top-level `path:`

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const urlMatch = line.match(/^\s+-\s*url:\s*(.+?)\s*$/);
    if (urlMatch) {
      currentBlockExe = urlMatch[1].trim();
      continue;
    }

    const pathMatch = line.match(/^path:\s*(.+?)\s*$/);
    if (pathMatch) {
      topLevelExe = pathMatch[1].trim();
      // After top-level `path:`, sha512/size lines refer to it.
      currentBlockExe = topLevelExe;
      continue;
    }

    // sha512 line — replace if we know which exe owns it.
    const shaMatch = line.match(/^(\s*)sha512:\s*.*$/);
    if (shaMatch && currentBlockExe && exeMap.has(currentBlockExe)) {
      const indent = shaMatch[1];
      const newSha = exeMap.get(currentBlockExe).sha512;
      lines[i] = `${indent}sha512: ${newSha}`;
      continue;
    }

    // size line — replace if we know which exe owns it.
    const sizeMatch = line.match(/^(\s*)size:\s*.*$/);
    if (sizeMatch && currentBlockExe && exeMap.has(currentBlockExe)) {
      const indent = sizeMatch[1];
      const newSize = exeMap.get(currentBlockExe).size;
      lines[i] = `${indent}size: ${newSize}`;
      continue;
    }
  }

  await writeFile(manifestPath, lines.join("\n"));
  return true;
}

async function main() {
  // 1. Enumerate signed .exe files in dist/ and compute fresh sha512 + size.
  const entries = await readdir(DIST);
  const exeMap = new Map(); // basename → { sha512, size }
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".exe")) continue;
    const full = join(DIST, name);
    const [sha512, st] = await Promise.all([
      sha512Base64(full),
      stat(full),
    ]);
    exeMap.set(name, { sha512, size: st.size });
    console.log(`  ${name} → sha512=${sha512.slice(0, 24)}…  size=${st.size}`);
  }

  if (exeMap.size === 0) {
    console.log("No .exe found in dist/ — nothing to patch.");
    return;
  }

  // 2. Patch latest.yml (and the other variants if they happen to be present
  //    in the same folder, though normally only one per platform per runner).
  const candidates = ["latest.yml", "latest-mac.yml", "latest-linux.yml"];
  for (const m of candidates) {
    const full = join(DIST, m);
    const patched = await patchManifest(full, exeMap);
    if (patched) console.log(`Patched ${m}`);
  }

  console.log("Done. dist/latest.yml is now in sync with the signed binaries.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
