# Tiger Studio Manager — agent reference

## ⏳ ACTIVE TASK — BLOCKED ON US, NOT ON MICROSOFT (check at the start of every session)

**Windows code-signing via Azure Trusted Signing is stalled waiting for a document *we* have not
uploaded.** On **2026-07-10** Microsoft replied to the 3D FRANCE identity validation (subscription
`6e0a91fa-4886-433c-9b75-820bf0cd617d`) asking for **additional documents** — it is not "under
review". Nothing moves until they are supplied. Verified in Gmail on 2026-07-19: two mails from
`azure-noreply@microsoft.com`, *"Action requise : finaliser la validation de votre identité"* and
*"requête de documents supplémentaires"*. **Nine days were lost to reading this as a pending review.**

**What Microsoft asks for — ONE of these four**, uploaded in the Azure Portal (`.pdf`/`.docx`, <5 MB):
1. Assignment letter from an authorized representative of the organization
2. Domain ownership records (Whois)
3. **Domain purchase invoices or registry confirmation records** ← easiest: the OVH invoice for
   `tigertag.io` / `tigersystem.io` is already a PDF
4. A website showing the organization's name, address, contact information and domain

**This is a founder action** — it needs the document and a portal login. Remind him; do not let it
sit again.

**Once the identity is validated**, resume the integration; the full step list and every ID is in
memory **`project-azure-trusted-signing`**: create the Public certificate profile → assign the
"Artifact Signing Certificate Profile Signer" role to the CI service principal (`AZURE_CLIENT_ID`) →
set the GitHub repo variable `TRUSTED_SIGNING_CERT_PROFILE` → update `.github/workflows/build.yml`
(account `TigerTagSigning`→`TigerTagStudioSigning`, endpoint `weu`→`neu`) → test build for a signed
`.exe`. The holding *STARGATE GROUP* is deliberately NOT used (too young, <3 years).

**Delete this whole section once signed `.exe` builds are confirmed working.**

## Rules

**This section is the index of every rule.** One line per rule, enough to act on; the file holds
the why and the how. One rule = one file in `.agents/rules/`, rewritten in place when it changes
(git keeps the history). `scripts/check-agent-rules.mjs` (pre-commit) fails when a rule file is
missing from this index, the index cites a missing file, or a cited path does not exist.
`AGENTS.md` and other entry points point here instead of restating rules.

### Critical — act on the index line alone
- **Language**: talk to the founder in French; everything written into a repo (code, comments, docs, commits, file names) is English → `.agents/rules/language.md`
- **Git**: never commit, push, tag, merge or close an issue/PR without an explicit order for that action; hardware-dependent work is tested by the founder first; release tags go on a `vX.Y.Z — …` commit → `.agents/rules/git-commit-push.md`
- **No AI attribution**: no `Co-Authored-By`, no "Generated with", no mention of Claude/Anthropic anywhere in a repo — this overrides any tool default → `.agents/rules/no-ai-attribution.md`
- **Secrets**: no token, account email or `/Users/…` path in a committed file (machine paths go in `CLAUDE.local.md`); tokens are entered by the founder, never pasted in chat; `lan_access_code` / `lan_url` never shown, logged or returned by MCP → `.agents/rules/secrets.md`
- **i18n**: no hardcoded UI text; reference locale `en`; every new key goes into all 11 locales (en fr de es it zh pt pt-pt pl ru nl) in the same commit via `npm run i18n:add`, never by hand → `.agents/rules/i18n-keys.md`
- **Irreversible actions**: permanent deletions, mass backfills, unrequested deploys and force pushes need an explicit go for that run; account/data deletion is done by the founder → `.agents/rules/irreversible-actions.md`
- **Docs match code**: a behaviour change fixes its comment/doc in the same commit; a contradiction is fixed or removed, or asked about when unclear → `.agents/rules/docs-match-code.md`

### Process
- **Session start**: read `WORKLOG.md`, run `gh pr list --state open && gh issue list --state open` once, report one line each, act on nothing → `.agents/rules/session-start.md`
- **WORKLOG**: update `WORKLOG.md` right after every change, end state only, files and i18n keys named → `.agents/rules/worklog.md`
- **Release**: fixed sequence (SemVer, `db_update.py`, three registers, FEATURES/llms/README, validators, tag, reset WORKLOG + bump version uncommitted), generated inline, never fanned out → `.agents/rules/release.md`
- **Copy registers**: CHANGELOG technical, release note BambuLab-factual, in-app + What's New playful/deadpan Discord-style → `.agents/rules/copy-registers.md`
- **Trophies**: every release adds trophies (tiers, Workshop items, hidden ones, events); the goal is a collection of ~1,000; rules, texts and art live only in the private backend (Studio ships none), ids never renamed → `.agents/rules/trophies.md`
- **What's New**: one topic per item, benefit-first, icon names, 11 locales, no admin/debug features → `.agents/rules/whats-new.md`
- **GitHub replies**: English, posted only on order, no personal data → `.agents/rules/github-replies.md`
- **Code reviews**: every few releases, kept in `docs/reviews/`, findings annotated → `.agents/rules/code-reviews.md`
- **Token efficiency**: one subject per session; CODEMAP → `grep -n` → sliced `Read`; repeatable work to the project agents (`codemap-explorer`, `simple-task`, `theme-fixer`, `i18n-writer`, `release-notes`, `issue-triage`) with short precise briefs; never fan out; text checks before one screenshot; short answers → `.agents/rules/token-efficiency.md`
- **Verify UI**: check renderer changes yourself with dev-drive; don't ask the founder to test routine tweaks → `.agents/rules/verify-ui.md`
- **Firestore changes**: backend repo is the source of truth; rules + `hasOnly` first, deploy, then propagate the docs; `userProfiles` only via `setProfile` → `.agents/rules/firestore-changes.md`
- **Art direction**: every illustration follows `docs/ART-DIRECTION.md` (canon banner attached, prompt block, checklist), shown to the founder before it is integrated; a banner's layers are never reused alone elsewhere → `.agents/rules/art-direction.md`
- **assets-src**: artwork dropped at its root is renamed, optimised into `assets/`, master filed under the shipped name → `.agents/rules/assets-src.md`

### Code
- **IDs, not labels**: conditions compare reference-table IDs (`ASPECT_ID` …), never label strings → `.agents/rules/ids-not-labels.md`
- **Naming**: self-describing names, one state per field, nothing derivable stored → `.agents/rules/naming.md`
- **CSS**: right section file, theme tokens for new colours, icons on one dimension + `aspect-ratio`, doubled class instead of `!important`, no inline JS in HTML → `.agents/rules/css-placement.md`
- **UI/UX defaults**: reuse the existing components and CSS (classes, markup) by default, never a new look unless asked; declutter, consistency, smooth motion, real icons, selected state; no `title=` tooltips (use `aria-label`); big rare moments get a ceremony with an animation behind the window → `.agents/rules/ui-ux-defaults.md`
- **Paint last known values**: header, view bar, menus and badges draw at once from the last session's values (`Cache` `header`: `stats`, `coins`, `bar`), then update in place; nothing pops in late → `.agents/rules/paint-last-known.md`
- **Surgical DOM updates**: signature guard → patch in place → swap one section → full rebuild last → `.agents/rules/surgical-dom-updates.md`
- **Dialogs**: every window is `openDialog()` (`renderer/dialog.js`) — "notice" (Tiger Squad look) or "ceremony" (TigerCoins plaque); no new overlay markup; a touched old window moves onto it → `.agents/rules/dialogs.md`
- **Hold-to-confirm**: `setupHoldToConfirm` with a visible `.hold-progress` fill → `.agents/rules/hold-to-confirm.md`
- **User avatars**: a person is always drawn by `userAvatar(who, sizeClass)` — the friends bar's look, freshest record (own account / friend entry), only the size changes; never `avatarMarkup()` for a person → `.agents/rules/user-avatars.md`
- **User doc fields**: pseudo from Firestore `displayName`; `roles` / `tier` server-only; `Debug` is a client-written preference; avatar colour is `color` → `.agents/rules/user-profile-fields.md`
- **`.ttag` contract**: authored in the fields editor, `docs/TTAG-FIELDS.md` never hand-edited, importer follows the ratified contract → `.agents/rules/ttag-contract.md`
- **Material swatch**: convention owned by TigerSystem-Docs, drawn only through `colorBg()` / `_pieSplit()` → `.agents/rules/material-swatch.md`
- **MCP**: read-only tools, no credential, decoded values → `.agents/rules/mcp-read-only.md`
- **Product images**: `cdnImg(url, cssPx)` asks for the rendition that fits → `.agents/rules/product-images.md`
- **Easter eggs**: a hidden envelope = an id in the backend `EGGS` + `tapEgg` on the spot + glints while `!eggFound`; the ctx must carry `easterEgg` / `eggFound` → `.agents/rules/easter-eggs.md`

## 📍 Machine-local paths → `CLAUDE.local.md` (gitignored)

This file is committed and public. Where the checkouts live, which clone is the live one and which
are stale decoys, and the per-repo commit policy are in **`CLAUDE.local.md`** at the repo root.
Refer to sibling repos by name (`TigerTag_Firebase_Backend`) or relatively
(`../TigerTag_Firebase_Backend`).

---

# Reference

Everything below describes the codebase. It is not a rule list; when it disagrees with the code,
the code wins and this text is fixed (`.agents/rules/docs-match-code.md`).

## Stack
Electron (no bundler) + vanilla HTML/CSS/JS. Entry: `main.js` (main process, ~6k lines). Renderer:
`renderer/inventory.html` + modular CSS in `renderer/css/` + `renderer/inventory.js` (~41k lines)
and its ES-module satellites (`renderer/printers/`, `renderer/IoT/`, `renderer/report/`,
`renderer/rfid_protocol/`). Preload bridge: `preload.js`. Node-side services: `services/`.

> **`renderer/CODEMAP.md`** maps every feature of `inventory.js` to a line range and key function
> names; **`CODEMAP-main.md`** does the same for `main.js`. Read the map before searching either
> file. `npm run codemap:check` (pre-commit when either file or map is staged) fails on drift.
>
> **`ROADMAP.md`** holds the done / next / backlog picture by domain — read it before proposing a
> feature. **`FEATURES.md`** is the shipped-feature catalogue. **`llms.txt`** is the first file an
> agent reads to understand the repo.

## File map
```
renderer/
  inventory.html   — markup + modals (no inline JS)
  inventory.js     — core renderer logic (ES module) — see CODEMAP.md
  CODEMAP.md       — feature → line range index for inventory.js
  css/             — inventory styles, loaded in numeric order
    00-base.css         — root vars, reset, sidebar, header, app-layout
    10-settings.css     — Settings panel
    20-friends.css      — Friends slide-in panel
    30-racks.css        — Storage / rack view + drag-drop + unranked panel
    40-printers.css     — Printers views, add/scan/manual flows, side panel, camera capture
    50-snapmaker.css    — Snapmaker live block + filament edit sheet
    55-creality.css     — Creality camera (WebRTC)
    57-elegoo.css       — Elegoo live block
    60-modals.css       — rack-edit / friend / account / login / alert modals
    70-detail-misc.css  — icons, stats, table/grid, detail panel, debug, toolbox, TD1S …
    72-hero-scene.css   — the ecosystem scene (iMac + flipping devices), shared with the splash
  hero-scene.js    — draws that scene into every [data-hero-scene]
  splash/          — the launch splash page (main.js createSplash), loaded before the main window
  locales/         — en fr de es it zh pt pt-pt pl ru nl (.json, reference: en)
  IoT/             — devices, each with its own CSS
    tigerscale/  tigertouch/  tigerspool/  td1s/  usbscale/
  report/          — in-app reports (target picker, annotator, replies)
  rfid_protocol/tigertag/ — RFID tester modal + chip parser
  rfid_protocol/linked/   — linked chips + the new-chip chooser side card
  rfid_protocol/eraser/   — NFC tools view (format to TigerTag Init, recycle to NDEF, write NDEF content)
  rfid_protocol/restore/  — Restore TigerTag+ view (readers, what the rfidList backup writes back, held banner)
  labels/          — printed spool / product labels (templates, QR in printer dots, PNG · PDF · SVG · print)
  printers/        — one folder per brand (PROTOCOL.md + index.js + add-flow.js + probe.js …)
                     plus plugins (klipper/, octoprint/: plugin.js + main.cjs) registered via
                     plugins.js, and shared: registry.js, context.js, cam_manager.js,
                     cam-snapshot.js, modal-helpers.js, model-list.js, scan-pick.js, extra-subnets.js
services/          — tigertagDbService, MCP server + stdio bridge, NFC process, NDEF encoder (ndef.js), demo/ (printer simulator)
assets/db/tigertag/ — reference tables id_*.json + id_catalog.json + last_update.json (db_update.py)
data/              — static assets fetched by the renderer
  container_spool/spools_filament.json, rack-presets.json, printers/ (model catalogues)
  whatsnew.json    — What's New, keyed by version, 11 locales
  release-notes/   — one vX.Y.Z.md per version (GitHub Release body)
.agents/rules/     — one file per agent rule (indexed above)
docs/              — design docs, firestore-schema.md, i18n-keys.md, MCP.md, reviews/ …
```

## Printer agent skills

Each brand under `renderer/printers/<brand>/PROTOCOL.md` is a self-contained reference for that
integration. Read it before touching that brand's `index.js`.

| Brand | PROTOCOL.md highlights | Status |
|-------|------------------------|--------|
| **Bambu Lab** | LAN: MQTTS 8883 TLS, AMS 16-slot, SSDP+TLS scan, JPEG TCP 6000 / RTSP 322. Cloud (§17): REST behind Cloudflare (Electron `net`) + one account MQTT broker, same `push_status` parser | ✅ LAN + cloud |
| **Creality** | WS 9999, heartbeat `"ok"`, CFS boxsInfo type 0/1, WebRTC port 8000 | ✅ |
| **Elegoo** | CC2: MQTT 1883, UDP 52700, 4 canvas slots. CC1 (§25): SDCP v3 — `M99999` UDP 3000, WebSocket 3030 | ✅ (CC1 🧪 beta) |
| **FlashForge** | HTTP poll 8898, TCP M-codes 8899, UDP multicast 225.0.0.9:19000 | ✅ |
| **Snapmaker** | WS 7125 Moonraker + proprietary, RRGGBBAA colour, HTTP scan | ✅ |
| **Prusa** | PrusaLink HTTP 80 (Digest via main `prusa:http`), MMU 5 slots / XL tools, Buddy3D RTSP or `/cameras/snap` | 🧪 beta |
| **Anycubic** | LAN: MQTTS 9883 TLS 1.2, ACE slots, FLV cam 18088 via ffmpeg, creds from slicer config. Cloud: signed REST + cloud MQTT | ✅ LAN + cloud |

Plugins (`klipper`, `octoprint`) follow `docs/PRINTER-PLUGINS.md`. Klipper stores its address as
ONE `ip` field, `host` or `host:port` (the form Studio and the Tiger Touch firmware read).

## LocalStorage keys
| Key | Content |
|-----|---------|
| `tigertag.accounts` | `Account[]` JSON array |
| `tigertag.activeAccount` | active account id |
| `tigertag.inv.<id>` | cached inventory JSON for that account |
| `tigertag.products.<id>` | cached products JSON for that account (id → data) |
| `tigertag.invSync.<id>` / `tigertag.prodSync.<id>` | `{at: ms}` when that copy was last in step with the server: the next launch listens only to docs with a later `syncAt` (`_listenSynced`) |
| `tigertag.view` | `"table"` \| `"grid"` |
| `tigertag.lang` | one of the 11 locale codes |
| `tigertag.sidebar` | `"collapsed"` \| `"expanded"` |
| `tigertag.panelWidth.detail` / `.debug` | panel widths in px |
| `tigertag.sort.inv` / `tigertag.sort.printer` | table sort `{col,dir}` |
| `tigertag.theme`, `tigertag.catalog` | theme and catalogue view preferences |
| `tigertag.nfc.lastUrl` | last link written to a chip by the NFC tools, offered again |
| `tigertag.nfc.contact` | the NFC tools' contact card as last typed `{name, phone, email, org, url}` |
| `tigertag.label` | the label card's last choices `{template, slots, dpi, kind}` (`renderer/labels`) |
| `tigertag.trophies.<id>` | the trophy ids already celebrated on this device for that account (`renderer/quests/trophies.js`) |
| `tigertag.trophyAlbum.<id>` | that account's album `{at, earned: {id: {at, event, ctx}}}`: painted at once, then only trophies with a later `earnedAt` are read (+ a COUNT catches one taken back) |
| `tigertag.trophyCatalog.<lang>` / `tigertag.trophyCards.<id>` / `tigertag.trophyReveals.<id>` | the public trophy catalogue of that language, that account's cards (art + text of the trophies held or revealed) and what its friends revealed `{at, ids: {trophyId: friendUid}}` (`renderer/quests/trophies.js`, `docs/TROPHIES.md`) |
| `tigertag.friendTrophies.<id>` | the albums of that account's friends last seen `{friendUid: {at, name, earned}}` (50 newest), same delta reads |
| `tigertag.coinlog.<id>` | the TigerCoins history last read for that account (100 newest rows), shown at once when the history opens, then refreshed |
| `tigertag.header.<id>` | the header's and view bar's last figures for that account `{stats: {key: number}, coins: {balance, n}, bar: {daily, level, squad, lists, order, invite}}`, painted at launch before the data arrives, then updated where they differ |

## Account object shape
```js
{ id: uid, email, displayName, photoURL, lang, color }
```
`displayName` is the Firestore pseudo, never the Google name; `lang` is synced with
`users/{uid}/prefs/app.lang`; `color` is `#rrggbb` (legacy `customColor` read only).

## API base
`https://cdn.tigertag.io` — `/healthz/`, `/setSpoolWeightByRfid?ApiKey=&uid=&weight=`, `/img`.

### Product images — ask for the size you are going to paint
`/img?id=<productId>[&v=<n>][&size=<name>]` serves seven square renditions (`SIZES` in the backend
repo's `functions/index.js`). Byte figures are JPEG; Chromium is served AVIF, so they are an upper bound.

| size | px | bytes | typical use |
|---|---|---|---|
| `icon` | 16 | 429 B | |
| `thumb` | 32 | 663 B | |
| `small` | 64 | 1.4 kB | list / table chips (28 px) |
| `compact` | 128 | 3.4 kB | catalogue + reorder thumbs |
| `medium` | 256 | 9.7 kB | grid cards (`GRID_CARD_IMG`) |
| `large` | 512 | 33 kB | the endpoint default |
| `master` | 1024 | 101 kB | zoom / lightbox, on demand only |

- `cdnImg(url, cssPx)` picks the first rendition covering the slot (ladder in `_cdnSizeFor`); it
  only rewrites `cdn.tigertag.io/img` links.
- Every image is two requests (`/img` → 302 to Firebase Storage, `immutable, max-age=1y`).
- Chromium's HTTP cache serves repeat visits (measured: 25/25 disk-cache hits); the app's own
  `preCacheImages` → `img_cache/` only warms the inventory.
- The CDN speaks HTTP/2; the renderer caps concurrency itself (IntersectionObserver + six in
  flight). An unknown `size` returns 400.

## Firebase

### SDK config (public)
`https://tigertag-cdn.web.app/__/firebase/init.json` — public by design; security is enforced by
the Firestore Security Rules.

### Security Rules
Rules live in the backend repo **`TigerTag_Firebase_Backend`** (`firestore.rules`, `storage.rules`,
`functions/`), project `tigertag-connect`. Model:
- `users/{uid}/**` is owner-only by default.
- `userProfiles/{uid}` is readable by signed-in users and **written only by the `setProfile`
  Cloud Function** (pseudo 2-40 chars, colour, photo, links, visibility, friend code).
- `inventory` + `racks` are readable by the owner, when `isPublic`, or by an accepted friend.
- Cross-user writes need an existing relationship: `friendRequests` (requester creates its own),
  `friends` (acceptee writes IFF a request exists), `notifications` (friends only, whitelisted
  `type` and fields).
- Whitelisted collections reject unlisted fields silently → update `hasOnly([...])` and redeploy
  (`.agents/rules/firestore-changes.md`).

### Data structure
Full collection/field map and a third-party connect example: **`docs/firestore-schema.md`**. Keep it
in sync with the backend `README.md` (Firestore Data Structure).

## Debug mode
Opens the Debug panel (Firestore explorer + API inspector). Off by default; **any account can
turn it on** from its account modal — it writes `Debug: true` on `users/{uid}` (a client-written
preference, not a privilege). The panel reads only what the account could already read, through
the same Security Rules. `roles` (Admin badge) stays server-written.

## Key JS patterns

### i18n
`t(key, params?)` looks up `state.i18n[state.lang][key]`, falls back to `en`, then to the key.
Supports plain strings, `{{param}}`, `["array"]` random pick, `{"one","other"}` plurals (`params.n`).
`applyTranslations()` applies `[data-i18n]`, `[data-i18n-placeholder]`, `.lang-btn.active`.
Key reference by category: `docs/i18n-keys.md`.

### Modals
`.modal-overlay` + `.modal-card`, toggled with `.open`. Main ones: `#addAccountModalOverlay`,
`#editAccountModalOverlay`, `#containerPickerOverlay`, `#profilesModalOverlay`, `#friendsPanel`,
`#addFriendOverlay`, `#friendRequestOverlay`. Printer add flows are right side-cards (`.pba-card`).

### Resizable panels
`makePanelResizable(panelEl, handleEl, storageKey)` on `#detailPanel` and `#debugPanel`; width
persisted, min 280 px, max 85 vw.

### Health indicator
`#health` follows Firestore `includeMetadataChanges` (`fromCache` false → green, true → red);
hovering pings `/healthz/` once and shows the RTT. No background polling.

### Weight slider auto-save
Debounced 500 ms write to Firestore (`.wb-saving` pulse); "Update" saves immediately; closing the
panel cancels a pending save.

### State
```js
state = {
  inventory, rows, selected, keyValid, displayName, showDeleted, search,
  viewMode,       // "table" | "grid"
  lang, sortCol, sortDir, activeAccountId, i18n, imgCache,
  invLoading,     // true until the first Firestore snapshot
  isAdmin,        // users/{uid}.roles === "admin"
  debugEnabled,   // users/{uid}.Debug (any account)
  publicKey,      // friend code XXX-XXX
  privateKey,     // 40-char hex access token
  isPublic, friends, friendRequests,
  db              // { brand, material, aspect, type, diameter, unit, version, containers }
}
```

### Auth flow
`onAuthStateChanged` → `setConnected()` → local cache → `subscribeInventory(uid)` →
`syncLangFromFirestore(uid)` → `syncUserDoc(uid)`, which applies `displayName`, `roles`, `Debug`,
`publicKey` / `privateKey` (claimed via `claimPublicKey` on first login) and `isPublic`. When the
pseudo, a valid language or an avatar is missing, the account-setup modal reopens. The Google name
is stored as `googleName` / `firstName` / `lastName` for admin reference, never displayed.

### Friends
- `publicKey` (`XXX-XXX`) is the discovery code, mirrored in `publicKeys/{key}.uid` (O(1) lookup)
  and published to `userProfiles` through `setProfile`.
- `privateKey` (40-char hex) is copied into each friend's `friends/{uid}.key`; rules grant
  inventory reads when it matches.
- `claimPublicKey(uid, oldKey)`: transaction, up to 10 retries, deletes the old key after success.
- Friendship is bidirectional (batch writes both sides; removal deletes both).
- Share link `https://tigersystem.io/join/<code>` (`_joinShareUrl`): the Hub's referral tunnel
  (sign up with the sharer as referrer; an existing account is sent on to `/friend/<code>`).
  `tigertag://friend/<CODE>` (`setAsDefaultProtocolClient`, `_handleFriendDeepLink`) only PRE-FILLS
  the add-friend search; the user still sends the request.

### Container picker
`openContainerPicker(r)` lists `data/container_spool/spools_filament.json`; picking writes
`container_id` + `container_weight` on the spool doc.

## Tools
- **dev-drive** (`scripts/devdrive.mjs`): `npm run start:drive`, then
  `npm run drive -- wait|eval|click|type|shot|logs|reload …` (CDP on 127.0.0.1:9339, dev only).
- **i18n**: `npm run i18n:add -- key [--after k] en="…" fr="…" …` (`scripts/i18n-add.mjs`),
  `npm run i18n:check` (`scripts/check-i18n-consistency.mjs`).
- **Docs**: `npm run docs:check` (`scripts/check-docs-drift.mjs`) — version, line count, brands,
  CSS files, key count, Firestore collections and paths stated in the docs vs the code.
- **CODEMAPs**: `npm run codemap:check` (`scripts/check-codemap.mjs`).
- **What's New**: `npm run whatsnew:add`, `npm run whatsnew:check`.
- **Theme**: `npm run theme:check` (raw colours outside tokens).
- **Art ladder**: `npm run art:build` / `art:check` (`scripts/build-art-ladder.mjs`) — masters ≥ 1024 px → 128/256/512/1024 WebP + `renderer/art-ladder.js`; drawn with `artImg()` (`renderer/art.js`, srcset + `sizes="auto"`). Rules in `docs/ART-DIRECTION.md` "Size".
- **Agent rules**: `node scripts/check-agent-rules.mjs` (index ↔ rule files, cited paths, plugin
  string tables).
- **Pre-commit** (`.githooks/pre-commit`, enabled by `npm prepare`): i18n, syntax, ESLint
  `no-undef`, CODEMAP, docs drift, agent rules, art ladder (when art is staged).
- **MCP**: local Model Context Protocol server, reference `docs/MCP.md`.
