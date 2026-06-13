// eslint.config.mjs — minimal regression guard, NOT a style linter.
// Two rules only:
//   no-undef       (error, blocks commit) — typo'd or renamed-but-not-updated
//                  identifiers, the #1 runtime regression class in a
//                  no-bundler vanilla codebase.
//   no-unused-vars (warning, non-blocking) — dead code, usually the leftover
//                  half of an incomplete rename.
// Wired into .githooks/pre-commit on staged files via `npm run lint`.

import globals from "globals";

const rules = {
  "no-undef": "error",
  "no-unused-vars": [
    "warn",
    { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" },
  ],
};

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "assets/**",
      "data/**",
      "docs/**",
      "renderer/lib/**", // vendored Firebase compat SDK (minified, not ours)
    ],
  },

  // Renderer — ES modules running in Chromium (<script type="module">)
  {
    files: ["renderer/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        // Classic <script> tags in inventory.html expose these as globals:
        firebase: "readonly", // firebase-*-compat.js
        ensureFirebaseApp: "readonly", // firebase.js (per-account named apps)
      },
    },
    rules,
  },

  // Main process + preload — CommonJS under Node/Electron.
  // Also: cam-window preloads and the RFID chip parser (shared with main).
  // Listed AFTER the renderer group so sourceType commonjs wins for them.
  {
    files: [
      "main.js",
      "preload.js",
      "renderer/**/cam-preload.js",
      "renderer/rfid_protocol/tigertag/parser.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser },
    },
    rules,
  },

  // Repo scripts — Node ES modules
  {
    files: ["scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules,
  },
];
