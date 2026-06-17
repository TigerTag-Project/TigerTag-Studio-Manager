#!/usr/bin/env node
/**
 * scripts/copy-agora-sdk.mjs — vendor the Agora Web SDK from node_modules into
 * the renderer at install time. Run by `postinstall`.
 *
 * The cloud-mode Anycubic camera (Agora WebRTC) needs the SDK loaded as a plain
 * <script> in the no-bundler renderer. Rather than commit Agora's ~1.6 MB
 * closed-source UMD into the repo (it's a commercial SDK — npm dep instead),
 * we copy it out of node_modules on install. The destination is gitignored, so
 * the blob never enters source control, but the renderer keeps a stable
 * relative path (`lib/agora/AgoraRTC_N-production.js`) that ships via
 * electron-builder's `renderer/**` files glob.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/agora-rtc-sdk-ng/AgoraRTC_N-production.js');
const dest = resolve(root, 'renderer/lib/agora/AgoraRTC_N-production.js');

if (!existsSync(src)) {
  // Not fatal: a deps-only or --ignore-scripts install may run before the
  // package is present. The cloud camera just won't load until a full install.
  console.warn('[copy-agora-sdk] agora-rtc-sdk-ng not found in node_modules — skipping (run `npm install`).');
  process.exit(0);
}
try {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log('[copy-agora-sdk] vendored Agora Web SDK → renderer/lib/agora/');
} catch (e) {
  console.warn('[copy-agora-sdk] copy failed:', e.message);
  process.exit(0); // never break the install over this
}
