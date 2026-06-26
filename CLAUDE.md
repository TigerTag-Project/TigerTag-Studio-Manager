# Tiger Studio Manager — Claude reference

## ⚡ Token efficiency — read this first

Every file read and grep costs tokens. Follow these rules on every task to keep context lean:

| Do | Don't |
|----|-------|
| Read `CODEMAP.md` → jump to the exact line range | Read `inventory.js` from the top |
| `grep -n "anchorFn"` → read only that range (`offset`/`limit`) | Read an entire 1000-line file to find one function |
| Re-use content already in context this session | Re-read a file you read 2 messages ago |
| `Read` with `offset`+`limit` to fetch the exact slice | `Read` without limits on files > 200 lines |
| `Edit` with the minimal `old_string` that is unique | Rewrite whole sections when only 3 lines change |
| Run `grep` + `Read` in parallel when targets are independent | Sequential read-then-grep round-trips |
| Check `CODEMAP.md` line ranges before any `inventory.js` read | Blind grep across the 16 000-line file |

**Workflow for any `inventory.js` change:**
1. `CODEMAP.md` → find section + anchor function name
2. `grep -n "anchorFn"` → get exact line number
3. `Read offset=N limit=40` → confirm context, draft edit
4. `Edit` minimal diff

**Workflow for any CSS change:**
1. Identify the right file from the file map (00-base → 70-detail-misc)
2. `grep -n "selector"` in that file → get line
3. `Read offset=N limit=20` → confirm, then `Edit`

> Warn the user when context is getting large (> ~60 k tokens used) so they can start a new session before quality degrades.

**Model fit — signal proactively, don't wait to be asked:**
- **Simple task** (CSS tweak, i18n key, value change, short question) → suggest switching to **claude-haiku** or **claude-sonnet** to save tokens. Phrasing: *"This is a simple task — you can run it on Sonnet/Haiku to save tokens."*
- **Complex task** (multi-file refactor, new system, multi-layer debugging, architecture) → if reasoning feels shallow or you keep making mistakes, ask to switch to **claude-opus**. Phrasing: *"This task is complex — switching to Opus will give a better result."*
- Do not wait for the user to notice a problem: signal the mismatch as soon as it is obvious.

---

## 📋 WORKLOG.md — running change log

`WORKLOG.md` at the repo root is the **single source of truth** for everything done since the last commit. It replaces memory and makes commit prep instant.

### Rule 1 — Update immediately after every change

Do not batch updates. The moment you finish editing a file, append the entry to `WORKLOG.md`. If you delete something — write it in `Removed`. If you fix a bug in something you just added — merge into the existing entry. The log must reflect reality at all times.

### File format

```markdown
# Worklog — vX.Y.Z (in progress)

## Added
- Short description — `file.js`, `file.css`

## Changed
- Short description — `file.js` (what and why)

## Fixed
- Bug description — `printers/bambulab/index.js`

## Removed
- What was deleted and why — `file.js`, `file.css`, i18n keys

## i18n
- Added: `key1`, `key2` — 9 locales
- Removed: `oldKey1`, `oldKey2` — 9 locales
```

Rules:
- One bullet = one logical change. Group sub-bullets under it if needed.
- Always name the file(s) touched.
- For removals: state **what** was removed, **why**, and **which files** it touched (JS + CSS + HTML + locales).
- i18n section: always list keys by name, never just a count.

### Rule 2 — Keep it clean as you go

WORKLOG.md is a working draft, not a commit log. Apply these edits in real time:

- **Intermediate steps vanish.** If you added a feature and then changed it three times, the final entry describes the end state only — not the journey.
- **Bugs in the same session collapse.** "Added X" + "Fixed X" → one "Added X (with fix for Y)" entry, not two.
- **Reverts disappear entirely.** If you added something and then removed it in the same session, delete both entries — it never shipped, it has no place in the log.
- **No implementation noise.** WORKLOG describes *what changed for the user / codebase*, not how Claude did it ("updated selector on line 42", "added guard in bambuConnect"). One sentence per logical change.

### Rule 3 — Synthesize at commit time

Before writing the `CHANGELOG.md` entry, do one final editorial pass on WORKLOG:

1. **Merge related items.** Several "TigerPOD modal" entries → one grouped bullet with sub-items.
2. **Drop ephemeral noise.** Version bump, llms.txt update, internal refactors with no user-visible effect → omit or fold into a single "internal" line.
3. **User-facing language.** CHANGELOG is read by end users. Rewrite technical entries in plain language ("Bambu MQTT: fix _normState null return" → "Bambu Lab: printer state no longer resets to idle when receiving a status update mid-print").
4. **Verify i18n delta.** Run `npm run i18n:check` — confirm key count matches WORKLOG before writing the CHANGELOG line.

### At commit time (3 steps, in order)

1. **Synthesize `WORKLOG.md`** (Rule 3 above) → write the new `CHANGELOG.md` entry
2. **Write the "What's New" entry** for the version → `data/whatsnew.json`. Run `npm run whatsnew:add -- <x.y.z> [--items N] [--date YYYY-MM-DD]` to scaffold an empty **9-locale** block, then fill each item's `icon` (emoji) + vulgarised `title`/`body` for **all 9 locales** (history is kept — never delete old versions). Verify with `npm run whatsnew:check` (must pass — no empty locale). This drives the in-app "What's New" modal shown once per version (and re-openable from Settings → About).
3. **Include `WORKLOG.md` in the commit** — it is part of the repo history (future sessions can read it via `git show`)
4. **Reset `WORKLOG.md` AND bump `package.json` to the NEXT version** immediately after committing — both left **uncommitted** (they ship with the next release). Bumping `package.json` here (not only at release time) means the **dev build shows the in-progress version number** (`#sbVersion`) instead of the previous release's — so while working on vN+1 the app reads `vN+1`, not `vN`. Consequence: at the next release `package.json` is **already** at the release version, so the release ritual doesn't re-bump it — it's committed as-is with the `vX.Y.Z —` commit. Replace `WORKLOG.md` with the blank template for the next version (bump the header too):

```markdown
# Worklog — vX.Y.Z (in progress)

## Added

## Changed

## Fixed

## Removed

## i18n
```

**The old data is not lost** — it exists in two permanent places:
- `git show HEAD:WORKLOG.md` — the raw working log, forever in git history
- `CHANGELOG.md` — the synthesized release entry, human-readable

The working file is wiped so it stays clean and unambiguous: whatever is in `WORKLOG.md` right now is *only* what has been done since the last commit, nothing older.

### Before starting any task

`Read WORKLOG.md` at the start of a new session — it tells you exactly what has been done since the last commit, without relying on the conversation summary.

---

## Stack
Electron (no bundler) + vanilla HTML/CSS/JS. Entry: `main.js`. Renderer: `renderer/inventory.html` + modular CSS in `renderer/css/` + `renderer/inventory.js`. Preload bridge: `preload.js`.

> **`renderer/CODEMAP.md`** maps every feature in the ~16k-line `inventory.js` to a line range and key function names. **`CODEMAP-main.md`** (repo root) does the same for the ~3k-line `main.js` (Electron main process — IPC handlers, printer transports, cameras). Read the relevant map BEFORE searching the file — it's faster, cheaper, and less error-prone than grepping. Keep them in sync when you move sections — `npm run codemap:check` (run by the pre-commit hook whenever `inventory.js`, `main.js`, or either CODEMAP is staged) validates both and fails the commit on major drift.
>
> **`ROADMAP.md`** at the repo root holds the "what's done / next / backlog" picture grouped by domain. Read it BEFORE proposing new features — chances are it's already there with a sizing and risk note. Update it when you ship or pick up an item.

## File map
```
renderer/
  inventory.html   — pure markup + modals
  inventory.js     — core renderer logic (ES module, ~16k lines) — see CODEMAP.md for line ranges
  CODEMAP.md       — feature → line range index for inventory.js (read first, grep last)
  css/             — split inventory styles, loaded in order via 10 <link> tags
    00-base.css         — root vars, reset, sidebar, header, app-layout
    10-settings.css     — Settings panel
    20-friends.css      — Friends slide-in panel
    30-racks.css        — Storage / rack inventory view + drag-drop + unranked panel
    40-printers.css     — Printers list view + add/scan/manual modals + side panel
    50-snapmaker.css    — Snapmaker live block + filament edit bottom-sheet
    55-creality.css     — Creality camera (WebRTC video)
    57-elegoo.css       — Elegoo live block
    60-modals.css       — Rack-edit / friend / account / login / alert modals
    70-detail-misc.css  — icons, stats, table/grid, detail panel, debug, twin-link, toolbox, TD edit, TD1S, display-name
  locales/         — en.json fr.json de.json es.json it.json zh.json pt.json pt-pt.json pl.json
  IoT/             — extracted device modules (own CSS inside each folder)
    tigerscale/    — TigerScale: Firestore subscription, panel render, health tick
    td1s/          — TD1S sensor engine + TD/Color edit modals
  rfid_protocol/
    tigertag/      — RFID TigerTag tester modal + chip parser
  printers/        — one sub-folder per brand (PROTOCOL.md + index.js + add-flow.js +
                     probe.js + widget_camera.js + settings.js + tutorial.json …)
                     plus shared: registry.js, context.js, cam_manager.js,
                     modal-helpers.js, extra-subnets.js
    bambulab/
      PROTOCOL.md  — agent skill: MQTTS port 8883, AMS, SSDP+TLS discovery, camera JPEG/RTSP
      index.js     — live integration (implemented — MQTTS via main-process IPC)
    creality/
      PROTOCOL.md  — agent skill: WS port 9999, heartbeat, CFS boxsInfo, WebRTC camera
      RETRO.md     — live SSH observations on real Ender-3 V4 hardware (reference)
      index.js     — live integration (implemented)
    elegoo/
      PROTOCOL.md  — agent skill: MQTT port 1883, UDP discovery port 52700
      index.js     — live integration (implemented)
    flashforge/
      PROTOCOL.md  — agent skill: HTTP port 8898, TCP 8899, UDP multicast discovery, MJPEG camera
      index.js     — live integration (implemented)
    snapmaker/
      PROTOCOL.md  — agent skill: WS port 7125 (Moonraker), JSON-RPC, HTTP discovery
      index.js     — live integration (implemented)
    anycubic/
      PROTOCOL.md  — agent skill: MQTTS port 9883 (TLS 1.2), multiColorBox ACE slots,
                     print/tempature report telemetry, FLV camera 18088,
                     slicer-config credential import, /info discovery port 18910
      index.js     — live integration (implemented — ACE slots + job/temps + camera)
assets/db/tigertag/           — TigerTag reference data (unified in v1.7.0, served via tigertagDbService IPC)
  id_brand.json id_material.json id_aspect.json id_type.json
  id_diameter.json id_measure_unit.json id_version.json
  last_update.json              — bundled data age (used to skip unnecessary downloads on first launch)
data/                           — non-migrated static assets (loaded via direct fetch in renderer)
  container_spool/spools_filament.json
  rack-presets.json
  whatsnew.json                 — "What's New" modal content, keyed by version, 9 locales inline (full history, browsable via the in-modal version picker). EN baseline imported from CHANGELOG via `npm run whatsnew:import`; recent versions hand-localised. Scaffold `npm run whatsnew:add`, validate `npm run whatsnew:check` (EN mandatory; entries are EN-only or fully 9-locale)
  printers/                     — per-brand printer model catalogs (bbl/cre/eleg/ffg/snap)
assets/svg/
  tigertag_logo.svg  tigertag_logo_contouring.svg
```

## Printer agent skills

Each brand under `renderer/printers/<brand>/PROTOCOL.md` is a **self-contained agent skill** — a complete reference that lets an AI implement the integration without reading Flutter source. Read the relevant `PROTOCOL.md` **before** touching any `index.js` in that folder.

| Brand | PROTOCOL.md highlights | index.js status |
|-------|------------------------|-----------------|
| **Bambu Lab** | MQTTS 8883 TLS, AMS 16-slot, SSDP+TLS scan, JPEG TCP 6000 / RTSP 322 | ✅ implemented |
| **Creality** | WS 9999, heartbeat `"ok"`, CFS boxsInfo type 0/1, WebRTC port 8000 | ✅ implemented |
| **Elegoo** | MQTT 1883, UDP spray port 52700, filament 4 slots canvas/tray | ✅ implemented |
| **FlashForge** | HTTP poll 8898, TCP M-codes 8899, UDP multicast 225.0.0.9:19000 | ✅ implemented |
| **Snapmaker** | WS 7125 Moonraker + proprietary, RRGGBBAA color, HTTP scan | ✅ implemented |
| **Anycubic** | LAN: MQTTS 9883 TLS 1.2 direct, ACE slots + print/temp telemetry, FLV cam 18088 via ffmpeg, creds from slicer config, /info scan 18910. Cloud: signed REST + cloud-MQTT (bundled cert), token via attach-only CDP from bridge-mode slicer | ✅ implemented (LAN + cloud) |

> **RETRO.md** (Creality only) — raw live-hardware SSH observations; PROTOCOL.md is the authoritative merge.

## LocalStorage keys
| Key | Content |
|-----|---------|
| `tigertag.accounts` | `Account[]` JSON array |
| `tigertag.activeAccount` | active account id string |
| `tigertag.inv.<id>` | cached inventory JSON for that account |
| `tigertag.view` | `"table"` \| `"grid"` |
| `tigertag.lang` | `"en"` \| `"fr"` \| `"de"` \| `"es"` \| `"it"` \| `"zh"` \| `"pt"` \| `"pt-pt"` \| `"pl"` |
| `tigertag.sidebar` | `"collapsed"` \| `"expanded"` |
| `tigertag.panelWidth.detail` | detail panel width in px (user-resized) |
| `tigertag.panelWidth.debug` | debug panel width in px (user-resized) |
| `tigertag.sort.inv` | inventory table sort `{col,dir}` (default `brand`/`asc`) |
| `tigertag.sort.printer` | printers table sort `{col,dir}` (default `status`/`desc`) |

## Account object shape
```js
{ id: uid, email, displayName, photoURL, lang, color?, customColor? }
```
- `displayName` — user's chosen pseudo (from Firestore `users/{uid}.displayName`), never the Google real name
- `lang` — per-account language preference, synced with Firestore `users/{uid}/prefs/app.lang`

## API base
`https://cdn.tigertag.io` — endpoints: `/healthz/`, `/setSpoolWeightByRfid?ApiKey=&uid=&weight=`

---

## Firebase integration

### SDK config (public)
```
https://tigertag-cdn.web.app/__/firebase/init.json
```
Third-party apps can fetch this URL to get the Firebase project config and call `firebase.initializeApp(config)`. Authentication is required — users must sign in with their TigerTag account. The config is intentionally public (standard Firebase pattern); security is enforced server-side via Firestore Security Rules.

### Firestore Security Rules — where & how (read this before touching rules)

Rules are **NOT in this repo**. They live in the **separate backend repo**, already mounted as an additional working dir:

- **File**: `/Users/benglut/Documents/TigerTag_Firebase_Backend/firestore.rules` (single file, self-documented — its header has the **REFLEX** field-whitelist warning; read that before editing).
- **Project**: `tigertag-connect` (`.firebaserc` default). Storage rules: `storage.rules` in the same repo.
- **Deploy**: `cd /Users/benglut/Documents/TigerTag_Firebase_Backend && firebase deploy --only firestore:rules --project tigertag-connect` (CLI is installed + authenticated; compiles server-side before release). Then commit `firestore.rules` on `main` and push.

**Model (so you usually don't need to open the file):**
- Everything under `users/{uid}/**` is **owner-only** (`isOwner()`) by default.
- **Public reads**: `userProfiles/{uid}` (auth'd) ; `inventory` + `racks` readable by owner / `isPublic` / accepted friend (presence of `users/{uid}/friends/{reader}`).
- **Cross-user writes** are gated by a prior relationship, never open:
  - `friendRequests/{requester}` — requester creates their own (unless blacklisted).
  - `friends/{friendId}` — acceptee writes their entry IFF a `friendRequest` from the owner exists; either party can delete themselves.
  - `notifications/{id}` — create only if **already a friend** of the recipient, `fromUid == auth.uid`, `type` in a whitelist, fields `hasOnly([...])`. Owner reads/updates(read flag)/deletes.
- **Field-whitelisted collections** (`telemetry`, `notifications`, …) reject any unlisted field **silently** on the client → when adding a field, add it to the `hasOnly([...])` list and redeploy (see REFLEX header).

When a feature needs a new cross-user write or field, edit + deploy that file; mirror the existing "relationship must already exist" pattern.

### Firestore data structure
The full collection/field map (publicKeys, userProfiles, users/{uid} + telemetry/inventory/friends/friendRequests/blacklist/prefs) **and** a third-party connect example live in **`docs/firestore-schema.md`** — read it on demand when changing the data model; do not reproduce it here. Security rules live in the backend repo (see *Firestore Security Rules* above).

---

## Debug mode

Debug mode gives access to the **Debug panel** (Firestore explorer + API inspector). It is off by default and can only be activated by users with `roles: "admin"` in their Firestore user document.

### Activating debug mode
1. In the Firestore console, set `users/{uid}.roles = "admin"` for the target user
2. The user opens their account modal (click avatar → edit)
3. A **Debug mode** toggle appears — flip it ON
4. The toggle writes `Debug: true` to `users/{uid}` in Firestore
5. The `⌥ Open debug panel` button appears in the sidebar immediately

### Deactivating debug mode
Same toggle → OFF, or set `users/{uid}.Debug = false` directly in Firestore.

### What debug mode exposes
- **API tab** — last HTTP request & response to `cdn.tigertag.io`
- **Firestore tab** — path explorer: type any Firestore path, click Fetch, copy JSON result to clipboard. Quick-access chips for `user doc`, `prefs`, `inventory`, `printers`, `tags`

### Security note
`roles` and `Debug` fields should only be writable via Firebase Admin SDK / Cloud Function — never by the client. Firestore Security Rules must prevent users from writing these fields themselves. *(Rules live in the backend repo — see [Firestore Security Rules](#firestore-security-rules--where--how-read-this-before-touching-rules) above.)*

---

## Key JS patterns

### i18n
`t(key, params?)` — looks up `state.i18n[state.lang][key]`, falls back to `en`, then key itself.
Supports: plain string, `{{param}}` interpolation, `["array"]` random pick, `{"one":"…","other":"…"}` plurals (`params.n`).
`applyTranslations()` — applies `[data-i18n]`, `[data-i18n-placeholder]`, `.lang-btn.active`.

### Modals
All modals: `.modal-overlay` + `.modal-card`, toggled via `.open` class. Backdrop blur + spring animation.
- `#addAccountModalOverlay` — login / create account (Firebase Auth)
- `#editAccountModalOverlay` — edit active account (openEditAccountModal / closeEditAccountModal)
- `#containerPickerOverlay` — pick a spool container (openContainerPicker / closeContainerPicker)
- `#profilesModalOverlay` — manage multiple accounts
- `#friendsPanel` + `#friendsOverlay` — dedicated Friends slide-in panel (openFriends / closeFriends)
- `#addFriendOverlay` — add friend by code (split field `[XXX]—[XXX]`, auto-advance on 3 chars)
- `#friendRequestOverlay` — incoming request modal (accept / refuse / block)

### Resizable panels
Both `#detailPanel` and `#debugPanel` are resizable via a drag handle on their left edge.
`makePanelResizable(panelEl, handleEl, storageKey)` — handles drag + localStorage persistence.
Width is restored on page load. Min: 280 px, max: 85 vw.

### Health indicator
`#health` cloud icon in the sidebar. State driven by Firestore `{ includeMetadataChanges: true }`:
- `snapshot.metadata.fromCache === false` → green (live)
- `snapshot.metadata.fromCache === true` → red (offline / cache)
- Disconnected → neutral (idle)

Lazy ping: on `mouseenter`, fires one `fetch` to `/healthz/` and updates the tooltip with measured RTT (`Backend: ok — 47 ms`). Zero background polling.

### Weight slider auto-save
The weight slider in the detail panel debounces writes to Firestore: after **500 ms of inactivity** the value is committed automatically. The fill bar pulses (`.wb-saving` class) during the debounce window. Clicking "Update" cancels the pending debounce and saves immediately. Closing the panel cancels any pending save.

### State
```js
state = {
  inventory,        // raw Firestore docs { [spoolId]: data }
  rows,             // normalizeRow() output array
  selected,         // open detail panel spoolId
  keyValid,
  displayName,      // user's pseudo
  showDeleted,
  search,
  viewMode,         // "table" | "grid"
  lang,
  sortCol, sortDir,
  activeAccountId,
  i18n,
  imgCache,
  invLoading,       // true while waiting for first Firestore snapshot
  isAdmin,          // from users/{uid}.roles === "admin"
  debugEnabled,     // from users/{uid}.Debug (admin only)
  publicKey,        // user's discovery code XXX-XXX (from users/{uid}.publicKey)
  privateKey,       // user's 40-char hex access token (from users/{uid}.privateKey)
  isPublic,         // whether inventory is publicly visible (from users/{uid}.isPublic)
  friends,          // [{ uid, displayName, addedAt, key }]
  friendRequests,   // [{ uid, displayName, requestedAt, key }]
  db                // { brand, material, aspect, type, diameter, unit, version, containers }
}
```

### Auth flow
`onAuthStateChanged` → `setConnected()` → load localStorage cache → `subscribeInventory(uid)` → `syncLangFromFirestore(uid)` → `syncUserDoc(uid)`

`syncUserDoc(uid)` reads `users/{uid}`, applies:
- `displayName` (pseudo) → sidebar, localStorage (priority over Google Auth name)
- `roles` → `state.isAdmin`
- `Debug` → `state.debugEnabled` → shows/hides `#btnDebug`
- `publicKey` / `privateKey` → `state.publicKey` / `state.privateKey` (generated via `claimPublicKey` on first login if missing)
- `isPublic` → `state.isPublic`

Google real name (`user.displayName` from Firebase Auth) is saved to Firestore as `googleName` / `firstName` / `lastName` for admin reference but **never displayed in the UI**.

### Friends system
- **`publicKey`** (`XXX-XXX` format) — discovery code shared with friends. Stored in both `users/{uid}.publicKey` and `publicKeys/{key}.uid`. Lookup is O(1) by document ID.
- **`privateKey`** (40-char hex) — access token. Stored in `users/{uid}.privateKey` and copied into each friend's `friends/{uid}.key`. Firestore rules grant inventory read access if `friends/{uid}.key == users/{uid}.privateKey`.
- **`claimPublicKey(uid, oldKey)`** — atomic transaction: generates `XXX-XXX`, checks `publicKeys/{candidate}` doesn't exist, writes it. Retries up to 10 times. Deletes `oldKey` after success.
- **Bidirectional friendship**: when Alice accepts Bob's request, a batch writes to both `users/alice/friends/bob` (key=alice.privateKey) and `users/bob/friends/alice` (key=bob.privateKey from request doc). Removal also deletes from both sides.
- **`openFriends()`** — auto-generates a publicKey if `state.publicKey` is null before opening the panel.
- **Shareable friend links (deep link).** The Friends panel "Share link" button copies `https://cdn.tigertag.io/friend/<publicKey>`. That landing page (`public/friend.html` in the **backend repo** `TigerTag_Firebase_Backend`, served via a `/friend/**` Hosting rewrite) redirects to the custom protocol **`tigertag://friend/<CODE>`**. The app registers that scheme in `main.js` (`setAsDefaultProtocolClient('tigertag')`; macOS `open-url`, Win/Linux argv + `second-instance`, cold-start queued and flushed on `deep-link:ready`), forwards it to the renderer (`electronAPI.onDeepLink`), which **pre-fills** the Add-friend search via `_handleFriendDeepLink` → `_openAddFriendWithCode` (queued in `_pendingFriendCode` and replayed by `setConnected` if not signed in yet). It only PRE-FILLS — the user still presses "Send request" (a link can never auto-add/auto-accept). The landing page is desktop-only-aware (mobile shows a "copy the code" note, no doomed deep link). The page itself is documented in the backend repo (`public/friend.html` header + README → *Static Hosting Pages*).

### Container picker
`openContainerPicker(r)` — opens `#containerPickerOverlay` with all 46 containers from `data/container_spool/spools_filament.json`, filtered by search. Selecting one writes `container_id` + `container_weight` to Firestore `users/{uid}/inventory/{spoolId}`. onSnapshot propagates the change automatically.

---

## i18n — workflow & key reference
All **9 locales** (en/fr/de/es/it/zh/pt/pt-pt/pl) share the same key set. **Don't re-read the locale JSON files** — the full key list is in `docs/i18n-keys.md` (pointer below). The workflow (add keys, consistency check) stays here.

### Adding new keys — use the helper script
**Never edit the 9 locale files by hand.** Use `npm run i18n:add` instead — it writes every locale in one shot, validates JSON, and falls back to the EN value when a translation is missing.

```bash
# Append at end of every locale file
npm run i18n:add -- myKey en="Hello" fr="Bonjour" de="Hallo" es="Hola" it="Ciao" zh="你好" pt="Olá" pt-pt="Olá" pl="Cześć"

# Insert just after an existing key (keeps related keys grouped)
npm run i18n:add -- myKey --after toolboxTitle en="Hello" fr="Bonjour" ...

# JSON payload form (handy for programmatic use)
npm run i18n:add -- myKey --json '{"en":"Hello","fr":"Bonjour"}'
```

Behaviour:
- Updates the value in-place if the key already exists (preserves order).
- Missing locales fall back to the EN value with a stderr warning.
- Re-parses every file after write — aborts the entire run if any output isn't valid JSON.
- Source: `scripts/i18n-add.mjs`.

### Consistency check (auto-run on every commit)
A pre-commit hook runs `npm run i18n:check` automatically — the commit is blocked if the 9 locale files drift apart. Activated by the `prepare` npm script which sets `core.hooksPath=.githooks/`. To run manually:

```bash
npm run i18n:check
# → "OK — 9 locales × N keys, all consistent." (exit 0)
# or a per-file list of missing/extra/empty/type-mismatch issues (exit 1)
```

What it checks:
- Every locale file parses as valid JSON.
- Same key set as `en.json` (no missing, no extras).
- Same value type per key (plural objects stay plural objects, etc.).
- No empty string values.

To bypass once (don't): `git commit --no-verify`.
Source: `scripts/check-i18n-consistency.mjs` + `.githooks/pre-commit`.

### Key reference table → `docs/i18n-keys.md`
The full per-category key list (App/status, Settings, Account, Login, Credentials, Inventory, Stats, Weight, Friends, Detail rows, Time-ago, …) lives in **`docs/i18n-keys.md`** — read it on demand instead of re-reading the locale JSON. When you add keys via `npm run i18n:add`, append them to that doc too.

---

## Rules
- **Language**: Conversation with the user is in French. All project content — code comments, commit messages, documentation, instructions — must be written in English.
- **Brand voice (all user-facing copy)**: every string a user reads — UI labels, buttons, empty states, prompts, nudges, error messages, modals, AND the "What's New" notes (`data/whatsnew.json`) — uses a **playful, deadpan, second-degree voice, Discord-style** (witty, self-aware, talks to you like a mate) — **NOT** Burger-King-style (no aggressive/provocative/troll edge). Lead with the **user benefit** in plain words; **no technical jargon** (avoid "modal", "toggle", "side panel", "header", class names, "TestFlight"…); **never describe what doesn't exist** or our process ("no emoji", "we removed X", "fixed bug Y"). Keep the tone natural in **every locale**. The CHANGELOG stays factual; this voice is for in-app copy + What's New. *(Same rule applies to the mobile app — see its CLAUDE.md.)*
- **i18n**: always add all **9** translations (en/fr/de/es/it/zh/pt/pt-pt/pl) in the same edit batch. **Use `npm run i18n:add` — do NOT hand-edit the locale JSON files.** See the *Adding new keys* section above for syntax.
- **Commits**: no `Co-Authored-By` line. **Never commit without explicit user instruction** — make the change, then stop and wait for the order to commit.
- **JS**: all logic lives in `inventory.js`. Do not inline JS in `inventory.html`.
- **CSS**: split across `renderer/css/00-base.css … 70-detail-misc.css` (loaded in numeric order). Add new rules in the section file that matches the feature — e.g. Snapmaker tweaks go in `50-snapmaker.css`, modal tweaks in `60-modals.css`. Asset URLs use `url('../../assets/svg/icons/…')` (two `..` because we're in `renderer/css/`). Scoped IDs (`#editAccountModalOverlay`, `#addAccountModalOverlay`, etc.) still apply where needed.
- **displayName**: always read from Firestore `users/{uid}.displayName` (pseudo). Never use Firebase Auth `user.displayName` for UI display — it contains the Google real name.
- **Admin fields**: `roles` and `Debug` in `users/{uid}` must only be written via Firebase Admin SDK / Cloud Function. The client toggle is a UX convenience for admins already authenticated.

## CSS coding standards

### SVG icons via `-webkit-mask-image`
Always constrain **one dimension only** and derive the other from the SVG's intrinsic `viewBox` ratio using `aspect-ratio`. Never hard-code both `width` and `height` — doing so silently distorts the icon if the SVG is ever edited.

```css
/* ✅ correct — only height forced, width auto-derived */
.my-icon {
  height: 18px;
  aspect-ratio: 52 / 22; /* viewBox="0 0 52 22" */
  background-color: var(--muted);
  -webkit-mask-image: url('../../assets/svg/icons/icon_foo.svg');
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

/* ❌ wrong — both dimensions hard-coded, ratio broken if SVG changes */
.my-icon { width: 40px; height: 18px; … }
```

To find the ratio: `head -1 assets/svg/icons/icon_foo.svg` → read `viewBox="0 0 W H"` → use `aspect-ratio: W / H`.

### CSS specificity
When a global rule (e.g. `input[type="text"]` — specificity 0,1,1) overrides a class rule (0,1,0), **double the class selector** to reach 0,2,0 rather than adding `!important`:
```css
/* beats input[type="text"] without !important */
.my-sheet .my-input { background: transparent; }
```

### Hold-to-confirm buttons
Use `setupHoldToConfirm(el, durationMs, callback)`. The element must contain a `<span class="hold-progress"></span>` child. Duration guideline: 1200 ms for reversible actions, 1500 ms for hard-destructive (delete/unlink).
