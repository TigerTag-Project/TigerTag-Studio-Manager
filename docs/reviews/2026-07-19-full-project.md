# TigerTag / TigerSystem — Full Project Review (READ-ONLY)

*Date: 2026-07-19. Carried out per `docs/REVIEW-BRIEF.md`. Scope: Studio Manager (main
subject), Firebase backend rules, and the `TigerTag-Project` org repos. Read-only — no
project file was modified during the review; this report file was written afterwards at the
founder's explicit request. All code claims cite `file:line`. "VERIFIED" = traced in code;
"SUSPECTED" = inferred but not fully proven. Not legal advice — a trademark attorney and a
security professional are named where required.*

---

## 1. Verdict

The project is in **good health and unusually mature for a solo effort**. The architecture is
disciplined (surgical DOM rule genuinely followed, clean Firestore rules with field whitelists,
signed-UID chip crypto, three working commit validators), and the business/IP foundations are
already far more built-out than the brief assumed — `CERTIFICATION.md` / `TRADEMARK.md` /
`VERSIONING.md` are a competent CSA/Matter clone. It is not a rough prototype.

- **Most important code fix:** two **stored-XSS holes** where another user's data reaches an
  `href` as `javascript:`/`file:` unchecked (`inventory.js:14577` and `:14355`/`:15430`), made
  worse by **no CSP anywhere** and a broad preload IPC surface. Real, not theoretical.
- **Most important process fix:** the first-try-UI pain is a **missing design-system** problem —
  no spacing, motion, z-index or type scale, so the AI re-invents ~500 ad-hoc values every
  session. Fixable by migrating prose rules into tokens/utilities.
- **Most important business fix:** the **"TigerTag®" registration is self-asserted but
  unverified**, and there is a plausible **Class-9 naming collision**. The certification
  programme's enforceability rests on a mark that must actually be registered — get an attorney
  clearance before building further on the name.

---

> **Status — updated 2026-07-19, after working this report.** Quick wins **#1 and #3 are FIXED**
> (commit `909ffc0`: `safeHref()` in the renderer at all 8 href sites — not only the 3 traced here —
> plus `isSafeExternalUrl()` and a `will-navigate` lock in the main process). **#2 (CSP) is
> DEFERRED, not rejected:** the app carries 110 inline `style=` attributes, remote product images and
> four different camera transports, so a strict policy needs a permissive `style-src`/`img-src` and a
> verification pass on real hardware across the six printer brands — otherwise it breaks camera
> streams silently, one brand at a time. Its urgency also dropped once #1 and #3 closed the
> `javascript:` path at both the render and the open end; it is now defence in depth rather than the
> amplifier this report describes.
>
> **Second pass, same day (`ab9922b`): #4, #5 and #6 are FIXED** — the printer-connection leak (all
> six brands now swept, the Creality camera stopped alongside its socket), the `_checkLowStockNotifs`
> products x rows scan (now a single `_stockCountByKey()` pass), and the `img:get` SSRF (public
> http(s) only, hostname resolved before the fetch so a domain the attacker owns cannot point at
> loopback, redirects re-validated per hop rather than refused, 8 s deadline). **#7 and #9 need the
> founder, not the code** (pulling the registry records; the legal-entity string). **#8 is still
> open** (image-cache LRU + debounce).
>
> Six of the nine quick wins are done; the three that remain need a person, a printer, or both.
> Everything outside section 2 is untouched and still open.

## 2. Quick wins (ranked — each under ~1 hour, real impact)

| # | Axis | What to do (specific) | Why it pays off |
|---|------|------------------------|-----------------|
| 1 | Sec | Add a `safeHref(u)` helper reusing the existing `_looksLikeUrl` (`inventory.js:1113`) and apply it at the 3 friend-reachable anchor sites: attachment links `:14577`, datasheet links `:14355` and `:15430`. Render inert text when the scheme isn't http(s). | Closes both HIGH stored-XSS holes. One helper, three call sites. Highest security ROI in the codebase. |
| 2 | Sec | Add a strict CSP to `inventory.html` via `session.defaultSession.webRequest.onHeadersReceived` in `main.js` (`default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://cdn.tigertag.io`). | Turns any future XSS from RCE-adjacent into contained. Single amplifier behind every injection finding. |
| 3 | Sec | Scheme-allowlist `shell.openExternal` at `main.js:1746` and the `setWindowOpenHandler` fallback at `main.js:465` — reject anything not `http/https/mailto`. | Stops a renderer foothold from launching `file://`/app-scheme handlers via the exposed `electronAPI.openExternal`. Stronger defense-in-depth chokepoint than the render-site fix alone. |
| 4 | Bug | In `unsubscribePrinters` (`inventory.js:18086`) add the `snapDisconnect`/`creDisconnect`/`ffgDisconnect` sweep next to the elegoo/bambu/anycubic loops. | Fixes a real leak: FlashForge's 2 s poll loop (`flashforge/index.js:63`) + Snapmaker/Creality sockets keep hitting the *previous* account's printer after every account switch. |
| 5 | Perf | In `_checkLowStockNotifs` (`inventory.js:26128`) call the existing `_stockCountByKey()` (`:10994`) once instead of the nested `rows.filter` per product. | Removes an O(products×rows) pass that runs on *every* render. Self-contained. |
| 6 | Sec | Add an `AbortController` timeout + `https:`-only check to `img:get` at `main.js:2523`. | Neutralises an SSRF-with-readback: a friend's `photoURL` currently makes the main process fetch an arbitrary URL and hand the body back to the renderer. |
| 7 | Biz | Pull the actual registry records (EUIPO / INPI / USPTO) for "TigerTag" in Class 9/42 — or brief an attorney to — before any further "TigerTag Certified" spend. | The `TRADEMARK.md` claim "registered trademark of TigerTag Corp" is unverified; a Class-9 collision (tiger-tags.com trackers) would undermine the whole cert lever. |
| 8 | Perf | Cap `state.imgCache` (LRU ~800) and debounce `saveImgMap` (`inventory.js:6820`). | Stops unbounded localStorage growth + a full re-serialize on every new image resolved. |
| 9 | Proc | Change the entity string in `TRADEMARK.md`/`CERTIFICATION.md` if "TigerTag Corp" is not the registered legal entity (the signing setup names **3D FRANCE**). | A licence/certification agreement signed by a non-existent "TigerTag Corp" is unenforceable. Trivial doc fix, real legal consequence. |

Wins 1–3 are the security core and should ship together.

---

## 3. Findings by axis

### Axis 1 — Security

**HIGH — Stored XSS / dangerous-scheme via attachment links (VERIFIED).** `inventory.js:14577`,
`_attachReadOnlyHTML`: `href="${esc(a.url)}"`. `esc()` (`:1023`) escapes HTML but **does not
validate URL scheme** — `javascript:`/`file://`/`smb://` pass through untouched. Attachments live
on the friend-readable `/products` collection and render in the owner's window in friend-view
(called at `:14409` and `:15434`). `_sanitizeAttachments` (`:7106`) only trims — and a malicious
user can write `attachments:[{url:"javascript:…"}]` **directly to their own Firestore doc**,
bypassing the client sanitizer. On click, `target="_blank"` routes to `shell.openExternal`
(`main.js:465`) with no scheme allowlist; inline `javascript:` runs in the renderer directly (no
CSP). Payload gets the full preload bridge and `state.privateKey`. Fix: quick win #1 (+ #3 chokepoint).

**HIGH — Stored XSS via `javascript:` in chip datasheet links (VERIFIED).** `inventory.js:14355`
(`_renderProductCard`) and `:15430` (`buildPanelHTML`): `href="${esc(r.links[key])}"`. `r.links.*`
comes from friend inventory fields `LinkYoutube/LinkMSDS/…` in `normalizeRow` (`:1538`); only
filter is `!== "--"`. Same exploit path. Fix: quick win #1.

**HIGH — No Content-Security-Policy anywhere (VERIFIED).** `inventory.html` has only
charset+viewport; `main.js` never sets a CSP header. Nothing blocks a `javascript:` URI or an
exfiltration `fetch()`. This is the amplifier that makes the two XSS findings genuinely dangerous.
Fix: quick win #2.

**HIGH — `shell.openExternal` on unvalidated URLs + no navigation lock (VERIFIED).** `main.js:1746`
(`shell:open-external`, only `typeof==='string'`) reachable via `electronAPI.openExternal`
(`preload.js:244`); and the `setWindowOpenHandler` fallback at `main.js:465`. No
`will-navigate`/`web-contents-created` handler exists anywhere. A renderer foothold can pass
`file://` or an OS app-scheme, or navigate the window to an attacker origin that inherits the
bridges. Fix: quick win #3.

**MEDIUM — `img:get` is SSRF with response readback (VERIFIED).** `main.js:2523`: `fetch(url)`
with no scheme/host validation and no timeout, `url` sourced from Firestore image fields (a
malicious friend's `photoURL`). The body is written to the cache dir and served back to the
renderer (`:166`), so internal/localhost responses are exfiltrable. undici caps `file://` but
`http://127.0.0.1:<port>` remains reachable. Fix: quick win #6.

**MEDIUM — Windows auto-update signature verification disabled (VERIFIED).** `package.json:83`
`verifyUpdateCodeSignature:false`, `publisherName:null`; the Windows Trusted-Signing pipeline is
still mid-setup (see the active Azure task in CLAUDE.md). `autoUpdater.checkForUpdatesAndNotify()`
runs on startup (`main.js:1478`). A compromised release/publisher account delivers unsigned code
to every Windows client. macOS path is fine (notarized + hardenedRuntime). Fix: set `true` + a real
`publisherName` once signing is live.

**MEDIUM — `webSecurity:false` on the detached camera window + `webviewTag:true` on main
(VERIFIED).** `main.js:1769` disables SOP to reach LAN cameras, rendering renderer-built
`cameras[]` descriptors cross-origin unrestricted; `main.js:392` enables `webviewTag` with no
`will-attach-webview` guard. Prefer scoping the LAN exception per-request; add a webview guard or
drop the tag if Creality can use an MJPEG `<img>`.

**MEDIUM — Printer HTTP bridges lack host restriction (VERIFIED).** Scheme/path allowlisted but
host is not: `anycubic:http-info` `main.js:3411`, `anycubic:flv-probe` `:3385`, plus
`ffg:http-post`/`snap:http-get`/`cre:http`. A compromised renderer can point these at internal
hosts on the fixed ports (bounded SSRF / port-probe). Constrain `ip` to a private-range IPv4 literal.

**LOW — Cloud MQTT TLS verification off (VERIFIED).** `main.js:3831` `rejectUnauthorized:false` on
Anycubic **cloud** MQTT (`mqtt-universe.anycubic.com`) exposes the account token to MITM (LAN
self-signed ones at `:2171`/`:2250`/etc. are expected). Consider pinning the cloud endpoint.

**LOW — Snapmaker error string unescaped (VERIFIED).** `snapmaker/index.js:1603` interpolates an
exception message into `innerHTML`. Source is a local device/error, not another user — hygiene only.

**LOW — Elegoo thumbnail interpolated into CSS `url()` without escaping (VERIFIED).**
`elegoo/index.js:1369` and `:1420`: `style="background-image:url('${thumb}')"` with no `esc()`.
Source is a locally-built `data:` URI, but a device-supplied string starting with `data:` is passed
through verbatim (`:819`), so a malicious/MITM'd printer could inject a `'` to break out of the CSS
string. CSS-injection only (no script execution), printer-data threat actor not a friend — low.
Fix: wrap in `esc()` to match the Creality path.

**Firestore rules — solid (VERIFIED).** `TigerTag_Firebase_Backend/firestore.rules` reviewed in
full against the collections the renderer writes. Owner-only by default; friend reads correctly
gated on `friends/{reader}` presence; `roles`/`tier` server-only (`:128`); cross-user notification
create is field-whitelisted and relationship-gated (`:253`); secrets defensively re-denied to
friends (`:175`). Two notes: (a) the `attachments` cap is enforced by *count* not *URL scheme*
(`:335`) — the rules cannot stop the XSS payload, so the client fix in quick win #1 is the real
defence; (b) the `inventory`/`racks` list `limit` guards are documented as **not yet deployed**
(`:193`) — a friend/public reader can request an unbounded list (cost + minor abuse). The `note`
field being friend-readable on `/products` is a documented, deliberate trade-off.

**Secrets — clean (VERIFIED).** No credential-like files tracked. The Firebase `apiKey` in
`renderer/firebase.js:6` is the intentionally-public config (security is server-side).
`services/anycubicCloudCerts.js` holds a **third-party** shared identity ported from the public
ACE-RFID slicer, not a TigerTag secret. `scripts/print-github-secrets.sh` only *reads* gitignored
`.env`/`.p12` files and prints — it embeds nothing. `.gitignore` covers `.env*`, the Anycubic RE
captures, and `.claude/`.

### Axis 2 — Bugs & correctness

**MEDIUM — Printer connections leak on account switch / sign-out (VERIFIED).** `unsubscribePrinters`
(`inventory.js:18086`) disconnects only elegoo/bambu/anycubic; snap/cre/ffg are torn down only from
the manual connect button (`:19956`). Trigger: sign in on A, open Printers so a Snapmaker/FlashForge
auto-connects, switch to B → the old FlashForge 2 s poll loop (`flashforge/index.js:63`) and
Snapmaker/Creality sockets keep running against A's printer. Accumulates across switches. Fix: quick
win #4.

**MEDIUM — Printer detail panel full-rebuild clobbers inline edit + flashes camera (VERIFIED
edit-loss / SUSPECTED cam-restart).** `onPrinterStatusChange` (`inventory.js:20032`) →
`refreshOpenPrinterDetail` (`:19984`) whose only surgical fast-path is tags-only; a pure
connect/disconnect transition falls through to a full `renderPrinterDetail()`. `startInlineEdit`
(`:21725`) has no coordination with it (unlike the weight slider's `_patchDetailWeight` guard).
Trigger: rename an *offline* printer while its reconnect backoff flaps status → typed text lost,
camera `<img>`/WebRTC re-created each flap. Fix: bail when `structSig` unchanged or a
`.pp-row-val--editing` input is present.

**LOW — `_printerSeenTimer` never cleared (VERIFIED, benign).** `inventory.js:18699` — single
guarded interval, account-safe; clear on sign-out for tidiness.

**LOW — Weight edit discarded by a mid-debounce snapshot (VERIFIED, partly by-design).**
`inventory.js:13414`+`:12665`: a snapshot arriving inside the 500 ms window cancels the pending write
and overwrites the slider (documented "server authoritative"). Real data-loss window only in a
two-device/twin scenario; acceptable for single-device.

Areas checked and **sound**: `doWeightUpdate` NaN-guarded (`:16155`); container-weight parses fall
back to catalogue; inventory `onSnapshot` has friend-view + account-identity guards (`:5211`);
elegoo/bambu/anycubic auto-reconcile disconnect removed printers; main.js camera ffmpeg procs +
cloud-login poll interval are keyed and killed. The many empty `.catch(()=>{})` on side-writes were
reviewed — none hide user-visible data failures.

### Axis 3 — Performance & cost

**HIGH — `deduplicateTwins()` is O(n²), run ~4× per render (VERIFIED).** `inventory.js:5906` does
`rows.find()` inside a loop over `rows`. Callers per snapshot: `renderStats` (`:5788`),
`filteredRows` (`:6128`), `renderRackView` (`:23762`, `:23935`). ~500 spools ≈ 1M ops/render; janky
at 1000+ and during weight-slider snapshot bursts. Fix: build a twin index once (mirroring
`_markTwinPairs` at `:5889`) or compute the deduped set once per snapshot and reuse.

**HIGH — `_checkLowStockNotifs()` is O(products×rows) every render (VERIFIED).** `inventory.js:26128`,
called from `renderInventory` `:6331`. Fix: quick win #5.

**MEDIUM — First-snapshot write fan-out (VERIFIED magnitude SUSPECTED).** `inventory.js:5267`: on
first live snapshot, per-spool `refreshApiData`/`syncSpoolMirrors`/census/auto-container/twin-reconcile
writes, each echoing back as a billed read. All one-shot/idempotent and render-coalesced, so it's a
one-time per-account/device cost, not steady-state. Verify `syncSpoolMirrors` only writes on real
diff; batch `refreshApiData`.

**MEDIUM — Bootstrap serializes all 9 locales + all reference DBs before first paint, and parses the
TigerTag DB twice (VERIFIED).** `inventory.js:28104` chains `loadLocales → loadLookups → initAuth`;
only the active locale is needed for frame 1. `main.js:3912` awaits `initTigerTagDB()` before
`createWindow`, and the renderer re-fetches the same DB over localhost. All local/ms-scale but on
the critical path. Fix: load only `state.lang`'s locale eagerly; start cache-paint in parallel; serve
lookups from the main-process `db:*` IPC.

**LOW — `subscribeFriendRequests` re-reads every requester profile on each snapshot (VERIFIED).**
`inventory.js:25819`. Fetch only `docChanges()` of type `added`.

**LOW — `imgCache` unbounded + full re-serialize per image (VERIFIED).** `inventory.js:655`/`:6820`.
Fix: quick win #8.

**Not a problem (checked):** grid/table use keyed diff (`_createGridCard`/`_updateGridCard`); detail
panel uses off-DOM `tmp`+`replaceWith` with `_detailStructuralSig` guard + `_rebuildDetailKeepVideo`;
`includeMetadataChanges` does not add billed reads and is short-circuited (`:5256`); `scheduleRender`
coalesces bursts; every subscription has a matching unsubscribe on switch. Crucially, **friends'
inventories are read one-shot** `.get()` (`:24924`), not `onSnapshot` — the single largest possible
read-amplification is correctly avoided. ~15 persistent listeners/session is reasonable (though 5 of
6 printer-brand listeners are usually empty).

### Axis 4 — Getting correct UI on the first try *(the founder's top priority)*

**Diagnosis: this is a missing-design-system problem, not an AI-discipline problem.** The corrections
that recur are exactly the decisions no token exists to make. The CSS has **two excellent shared
primitives** — the `.icon`/`.icon-NN` mask system and `.circle-center` (`00-base.css:58`) — and those
are precisely the two things the founder *rarely* has to correct. Everything else is re-derived from
raw numbers.

Counted gaps (VERIFIED across all 10 CSS files):

| Concept | Distinct hard-coded values | Total declarations | Tokens | Uptake |
|---|---:|---:|---:|---|
| border-radius | ~36 | 700 | 2 (`--radius`, `--radius-sm`) | ~3% |
| transition duration | ~49 | 700+ | 0 | 0% |
| easing | standard curve written **3 ways** | 29 | 0 | 0% |
| colour (hex) | 165 | 768 | 16 roles | heavy bypass |
| colour (rgba) | 285 | 686 | — | ~0% |
| font-size | ~36 (incl. 6 *half-pixel* sizes) | 839 | 0 | 0% |
| z-index | ~35 (active 98→112 "war", `1`/`2` collisions) | 135 | 0 | 0% |

**~500+ distinct hard-coded values** doing the work a few dozen tokens should do. The half-pixel font
sizes (12.5/11.5/10.5px) are the fingerprint of "nudge until it matches." There is **no shared
`.btn`/`.icon-btn`/`.card` base**: 14 parallel `-btn` families (`.adf-btn`×32, `.csel-btn`×20, …),
the flex-centre triplet re-declared in ~136 rule blocks, and the circular icon-button re-implemented
**53×** (`60-modals.css:397`, `:533`, `:696`…).

**Ranked artefacts to create (most correction-time removed first):**
1. **`.icon-btn` utility** (round + square, `place-items:center` + `aspect-ratio:1` + size var) —
   kills "centre the icon in the circle," the single most-repeated block (53×). Model on `.circle-center`.
2. **Radius scale** (`--radius-xs/sm/md/lg/pill`) inherited by a button base — kills "match that
   corner / the hover changed shape."
3. **Motion tokens** (`--dur-fast/base/slow` + `--ease-standard`) — `.15s`/`.12s` are already the
   de-facto standard (337+226 uses), so this is just *naming reality*; kills "don't make it jump."
4. **Spacing scale** (`--sp-1…6`) — kills "tighten that gap / stacked padding / dead space."
5. **z-index scale** — kills the "behind the wrong thing" class and the 98→112 guesswork.
6. **Type scale** (`--fs-xs…xl`) — kills "match that text size"; biggest migration (839 sites) so
   lower rank, not lower value.
7. **Shared `.btn` base** (+ modifiers) to retire the 14 families — do last, once tokens exist.

**Mechanism verdict:** the CLAUDE.md UI/UX prose is re-taught every session *because it names values
the CSS never named*. Each rule maps 1:1 to a missing token. The "don't animate `display`" rule is
*already* enforced (0 occurrences) — proving the thesis. **Migrate the rest from prose into
tokens/utilities and the corresponding correction disappears from the loop.** A static
component-gallery HTML page is worth building *after* the tokens exist (it then becomes a self-check
surface); before tokens it would just document the chaos.

### Axis 5 — Development velocity & token cost

The orientation docs **work and are not drifting**: `docs:check`, `i18n:check`, `codemap:check`
**all pass** (1347 keys × 9 locales; 298+27 codemap anchors; llms.txt matches v2.13.1 / 28551 lines /
6 brands). The three validators are the right model and should be extended.

- **CLAUDE.md is 593 lines re-read every session.** Most earns its place, but the heaviest prose is
  the UI/UX list — which axis 4 shows should become *code*, not prose. Once tokens/utilities exist,
  that block shrinks to a pointer.
- **No test suite (VERIFIED — no test files, no `test` script).** For a 28.5k-line single-IIFE
  renderer with no types, this is the biggest latent risk. Minimal high-value coverage: pure-function
  unit tests on `normalizeRow`, `containerWeightOf`, the twin-dedup logic, `verifySignature`, and the
  URL helpers — the functions where a silent regression corrupts data or money (prices/weights).
- **`inventory.js` at 28.5k lines in one IIFE** is navigable *only because* CODEMAP.md exists. Not yet
  acutely hurting, but it caps how much of the file any agent can safely reason about at once. If you
  split, the cleanest seams are the already-modularized concerns still living inline: the friends
  subsystem, the rack view, the reorder/products panel. Do **not** attempt a big refactor without the
  minimal tests above first.
- **Recurring instructions that should become validators:** a check that every `href="${...}"` uses
  `safeHref` not bare `esc` (would have caught the XSS class); a check that no new CSS literal is added
  where a token exists (enforces axis 4); a check that hold-to-confirm buttons contain a
  `<span class="hold-progress">`.

### Axis 6 — Brand, licensing & certification viability *(not legal advice)*

**Licensing — consistent and correct (VERIFIED).** Direct API confirms: Studio Manager **MIT**, both
SDKs **Apache-2.0** (the explicit patent grant, good for hardware makers), TigerPOD / RFID-Guide /
Firebase-Integration **CC-BY-4.0**, Tiger-Scale **MIT**. (`gh repo list` reports NO-LICENSE for all,
but that field is just unpopulated in that endpoint — the per-repo license API returns them
correctly.) `THIRD_PARTY_LICENSES.md` confirms **no GPL/LGPL/AGPL/copyleft** dependencies — clean for
commercial distribution (the one "proprietary" entry is the vendored Agora SDK, gitignored). The
brief's worry — "a permissive licence lets a manufacturer skip certification" — **does not apply
here**, because the enforcement lever is deliberately *not* the code licence but the trademark. The
founder understands this correctly.

**Certification model — already built, and well (VERIFIED).** `CERTIFICATION.md`, `TRADEMARK.md`,
`VERSIONING.md`, `LICENSE_COMMERCIAL.md`, `SECURITY.md` exist in the RFID-Guide repo and are a
competent CSA/Matter clone: two-mark split ("TigerTag Compatible" free/self-declared vs "TigerTag
Certified" audited/paid), a conformance→audit→declaration→issuance→surveillance→revocation process,
a certified registry (explicitly the DCL analogue), and honest disclosure that third-party labs don't
exist yet. This is **most of the "minimum viable certification"** the brief asks to design. The
day-one MVP it already embodies — a registered "TigerTag Certified" mark + one-page licence +
self-cert checklist + a public certified list — is legally identical *in kind* to CSA, minus the
premature lab/governance machinery.

**Technical enforceability — genuinely strong (VERIFIED).** The TigerTag+ signature is
`ECDSA-P256(SHA-256(uid[7B] ‖ id_tigertag[4B BE] ‖ id_product[4B BE]))`
(`TigerTag-SDK-JS/src/signature.js:100`), i.e. it **binds the chip's factory UID**. A byte-for-byte
clone to a normal NTAG therefore *fails verification* — the signature does not transfer. The private
key is held only by TigerTag Corp; revocation stops signature issuance, so it is technically real,
not merely contractual. The only residual clone vector — chips with a writable UID ("magic" chips) —
is correctly identified and scoped out in `SECURITY.md` as an NFC-hardware-market property, not a
protocol flaw. The hard part is done right.

**Trademark — the real exposure (public-web signal only; registry access blocked).**
- **"TigerTag®" registration is self-asserted but unverified.** `TRADEMARK.md` and tigertag.io state
  it, but USPTO/EUIPO/INPI could not be queried programmatically and no independent registration
  record was surfaced. The "™" denotes a *claim*, not a registration.
- **Plausible Class-9 collision:** "TigerTags" smart trackers (tiger-tags.com — identical string,
  electronic-tag hardware, the same nominal field; domain currently not resolving, so possibly
  dormant). Sub-brands collide in their own fields too: **TigerScale** = an existing Indian
  *weighing-scale* maker (tigerscale.net), **TigerPOD** = iShot's camera-tripod mark. "Tiger Data"
  (ex-Timescale) raises the density of Tiger-family tech marks.
- **Consequence:** the entire certification programme's enforceability rests on the mark being
  *actually registered and defensible* in the right classes. This is the one place to spend on an
  attorney before building further. Quick win #7.

**Governance & entity.** `VERSIONING.md` gives the protocol its own two-axis versioning (spec version
vs on-chip tag-format version, append-only `id_version.json`, key rotation by new version) — exactly
the reassurance a manufacturer wants, and better than most solo projects. **One flag:** the docs are
authored by **"TigerTag Corp,"** but the code-signing / legal setup names **3D FRANCE** (with STARGATE
GROUP deliberately unused). If "TigerTag Corp" is not a registered legal entity, agreements signed
under that name are unenforceable — reconcile the entity name across the legal docs. Quick win #9.

---

## 4. Medium & long term

- **Add a minimal test harness (recommend: DO).** ~1–2 days for a bare `node:test` runner + ~15
  pure-function tests on normalize/weight/twin/signature/URL helpers. The only safety net before any
  `inventory.js` split, and it guards the two things that silently corrupt (money and weights).
  Highest safety-per-effort in the project.
- **Migrate the CSS design-system (recommend: DO, incrementally).** Tokens ~1 day; retiring the 14
  `-btn` families and 53 circular buttons is a longer tail. Directly attacks the founder's #1 daily
  pain and shrinks CLAUDE.md. Do tokens + `.icon-btn` first.
- **Split `inventory.js` (recommend: DEFER until tests exist).** High risk with no tests; CODEMAP.md
  currently makes the monolith manageable. Not worth it before the test net.
- **Deploy the `inventory`/`racks` list `limit` guards (recommend: DO once client migration is
  confirmed).** Removes an unbounded friend/public read.
- **Attorney trademark clearance + mark registration (recommend: DO before further cert spend).** The
  load-bearing external dependency for the whole commercial plan.

## 5. What is already good (do not touch)

- **The chip crypto** — UID-bound ECDSA-P256, offline-verifiable, key custody correct, clone-resistance
  honestly scoped. The commercial moat is sound.
- **The certification/trademark/versioning docs** — a genuine CSA/Matter clone, already ~80% of the
  "MVP certification" the brief asked to design. Rare for a solo founder.
- **Firestore rules** — owner-by-default, relationship-gated cross-writes, field whitelists, defensive
  secret re-denial. Clean and well-commented.
- **The surgical-DOM discipline** — the keyed grid/table diff and the signature-guarded detail-panel
  section swaps are exactly what the CLAUDE.md rule prescribes, and they're actually implemented.
- **Friends' inventories read one-shot, not subscribed** — avoids the single biggest Firestore cost trap.
- **The three commit validators + the `.icon`/`.circle-center` primitives** — proof the "enforce in
  code, not prose" model works here; extend it, don't rebuild it.
- **Electron baseline** — `contextIsolation:true`, `nodeIntegration:false`, no `eval`/`new Function`,
  injection-safe `spawn`, a correctly-built PKCE loopback OAuth, and a safe `tigertag://` deep-link
  handler (scheme-checked, forwarded to renderer only).

## 6. Open questions

- **"TigerTag®" registration status** — could not be verified: USPTO/EUIPO/INPI are JS apps that block
  automated fetch, and the indexers returned HTTP 403. Needs a logged-in registry search or an
  attorney. Everything in the trademark analysis is an open-web signal, not a clearance opinion.
- **Legal entity behind "TigerTag Corp"** — is it registered, or is the operating entity 3D FRANCE?
  Determines whether the certification/licence agreements are enforceable as written.
- **`syncSpoolMirrors` write-on-diff** — could not fully confirm it skips writes when the mirror is
  unchanged; matters for the first-snapshot write-burst cost (Perf). A Firestore write-count during a
  fresh device login would settle it.
- **Camera-window re-create on status flap (Bug M2)** — the edit-clobber is verified; the camera
  stream restart is inferred from the full-rebuild path, not observed live (the authenticated app
  cannot be screenshotted from here).
- **Actual Firestore monthly read volume** — the review located *where* amplification lives but has no
  billing data to rank it in euros; the Firebase console usage tab would turn the estimates into real
  numbers.
