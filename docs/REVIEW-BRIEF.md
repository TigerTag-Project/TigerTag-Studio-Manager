# TigerTag / TigerSystem — full project review (READ-ONLY)

> **What this file is.** A standing brief for an AI asked to review the project end to end — code,
> process, and business/IP foundations. It is kept in the repo so a review can be started with one
> line ("read `docs/REVIEW-BRIEF.md` and carry it out") instead of a long pasted prompt. Keep it
> up to date when the ecosystem or the priorities change; it is not tied to a single review.

You are performing a complete review of the TigerTag ecosystem: its code, its process, and its
business/IP foundations. This is a **review only**.

## HARD CONSTRAINT — change nothing

**Do not modify, create, rename or delete any file. No edits, no commits, no pushes, no deploys,
no `npm install`, no `firebase deploy`.** Read files, grep, and run read-only commands (`git log`,
`ls`, `gh repo view`, …). Your entire output is a written report. If you think something must be
changed, describe it in the report — do not do it.

## STEP 0 — ask for every access you need, up front, in one go

**Before reading anything substantial, take stock of everything this review will require, and
request it all in a single message.** Do not discover a missing access halfway through and
interrupt the founder again — he is reviewing a long report, not babysitting a session. One
approval round, then you work uninterrupted to the end.

Work out the full list yourself from the axes below, but it will include at least:

- **Read access to the local repos** listed under *Repositories* — confirm which ones actually
  exist on this machine (`ls ~/Documents | grep -i tiger`) and name the ones you are missing.
- **GitHub CLI access** to the `TigerTag-Project` org (`gh repo list`, `gh repo view`, licence and
  release reads) — check `gh auth status` works before assuming it.
- **Web access** — needed for axis 6: Zigbee Alliance / CSA (Matter) certification structure, and
  public trademark databases (EUIPO, INPI, USPTO). Say so explicitly if you cannot browse, because
  axis 6 is then only partially answerable and the founder must know that in advance.
- Any tool or permission your environment gates (running `npm`/`node` read-only scripts, reading
  outside the working directory, etc.).

Present the list as: **what you need → which axis needs it → what is lost if it is refused.**
Then wait for the answer. If something is denied, continue with the rest and record the gap under
*Open questions* rather than silently producing a thinner report.

## Context

TigerTag is an open protocol for RFID/NFC-tagged 3D-printing filament spools: a chip on the spool
lets software identify the filament (brand, material, colour, diameter, weight). It is run by a
solo founder. The commercial model is to **sell NFC chips to filament manufacturers** and to
**certify** their implementations — explicitly inspired by how the Zigbee Alliance and Matter (CSA)
run certification for home-automation devices.

The ecosystem, all open source:

| Name | What it is |
|---|---|
| **TigerSystem** | umbrella name for the whole ecosystem |
| **TigerTag** | the chip / protocol itself (+ tiers: TigerTag, TigerTag+, and "TigerData" for chipless entries) |
| **Tiger Studio Manager** | Electron desktop app — the reference implementation |
| **TigerPOD** | open-source dual NFC reader/writer stand (3D-printable) |
| **TigerScale** | open-source ESP32 filament scale |
| **Tiger Hub** | the public Next.js website |

## Repositories

Local (read-only). Run `ls ~/Documents | grep -i tiger` first — more may exist than listed:

- `/Users/benglut/Documents/TigerTag_Studio_Manager` — the Electron app (main subject)
- `/Users/benglut/Documents/TigerTag_Firebase_Backend` — `firestore.rules`, `storage.rules`, `functions/`
- `/Users/benglut/Documents/TigerTag_Hub` — public website
- `/Users/benglut/Documents/TigerTag_Firebase_Integration` — third-party integration docs

Also on GitHub, org `TigerTag-Project` (use `gh repo list TigerTag-Project` and `gh repo view`):
TigerPOD, Tiger-Scale, TigerTag-SDK-JS, TigerTag-SDK-Python, the TigerTag RFID Guide, and the
Studio Manager itself.

## Orient yourself first (this saves hours)

In the Studio repo, read **before** grepping anything large:
- `llms.txt` — architecture, Firestore data model, conventions. Recently updated; trustworthy.
- `renderer/CODEMAP.md` + `CODEMAP-main.md` — feature → line-range index for the two big files.
- `CLAUDE.md` — the project's working conventions (they are extensive; judge them, see axis 5).
- `FEATURES.md`, `ROADMAP.md`, `CHANGELOG.md`.

Stack: Electron, **no bundler**, vanilla JS. `renderer/inventory.js` is ~28 500 lines in a single
IIFE; `main.js` ~3 000. CSS is split `renderer/css/00-base.css` → `70-detail-misc.css`. i18n is 9
locales × ~1350 keys. **There is no test suite.** Six printer brands are integrated over their
native protocols (`renderer/printers/<brand>/`).

---

# The six axes

## 1. Security

Highest priority. Concretely:

- **Electron hardening** — `nodeIntegration`, `contextIsolation`, `sandbox`, `webSecurity` in
  `main.js` BrowserWindow options. Any remote content in a privileged context?
- **Preload surface** (`preload.js`) — is `electronAPI` minimal, or does it hand the renderer
  broad primitives (arbitrary fs, shell, arbitrary IPC channel names)?
- **IPC handlers** — argument validation; path traversal; command injection in `exec`/`spawn`;
  SSRF from renderer-supplied URLs.
- **XSS** — the renderer builds HTML with template strings. Find `innerHTML` fed from Firestore
  data, **friend-supplied display names**, custom image URLs or attachment link URLs without the
  `esc()` helper. This is the most plausible real vulnerability class here, because a friend's
  data renders inside the owner's window. Distinguish *reachable by another user's data* from
  *owner's own input only* — the first is a vulnerability, the second is a bug.
- **URL handling** — the `tigertag://` deep-link handler and every `shell.openExternal`. Can a
  hostile link or a stored `buyUrl` reach `javascript:`, `file://`, or a local binary?
- **Firestore rules** — over-broad reads/writes, missing `hasOnly()` field whitelists, anything a
  *friend* or a *public* reader gets beyond intent. Cross-check the rules against the collections
  the renderer actually writes.
- **Secrets** — anything credential-like committed or bundled into the build; `.gitignore` coverage.

For each finding: severity, `file:line`, what an attacker can actually achieve, and the fix.

## 2. Bugs & correctness

Real defects, not style. Prioritise unhandled rejections; errors swallowed by empty `catch (_) {}`
(frequent in this codebase — flag the ones hiding real failures); races between Firestore snapshots
and UI state; leaked listeners/intervals/subscriptions (printer connections, cameras, the NFC
utilityProcess); stale closures. Give a concrete trigger scenario for each.

## 3. Performance & cost

- Renderer: full rebuilds where a surgical patch would do (`CLAUDE.md` documents a "surgical DOM
  updates" rule — find where it is violated), O(n²) passes over inventory, layout thrash,
  unthrottled handlers.
- Startup: what blocks first paint.
- **Firestore read amplification** — unbounded subscriptions, missing query limits, whole-collection
  reads where a filter would do. This is a direct monthly bill for a solo founder; quantify where
  you can.
- Memory: image cache, camera streams, printer telemetry buffers.

## 4. Getting correct UI on the first try  ← read this one carefully

**This is the founder's biggest daily pain and the axis he most wants solved.** He spends a large
share of every session telling the AI how to make the interface visually clean — centre this,
match that size, don't make it jump, use a real icon, tighten that gap. The same corrections recur.

Diagnose *why*, then fix the system rather than the symptom:

- Is there a real **design system**? Audit `renderer/css/` for design tokens (spacing scale, radii,
  type scale, colour roles, elevation, motion durations/easings) versus ad-hoc values scattered per
  component. Count the distinct hard-coded values for the same concept — that number is the answer.
- Are there **reusable component classes**, or is each panel/card/modal styled from scratch? Where
  is the duplication worst?
- The project has recurring visual failure modes: things not centred inside circles, hover states
  not matching the button shape, animations that jump, icons sized inconsistently, dead space.
  For each recurring class of defect, identify whether a **CSS utility or token would make it
  structurally impossible** rather than a rule the AI has to remember.
- `CLAUDE.md` already carries a long list of UI/UX instructions. Assess honestly whether that is
  the right mechanism: prose instructions must be re-read and re-applied by the model every time,
  while a token or a utility class enforces itself. **What should migrate from prose into code?**
- Would a **visual reference page** (a static HTML gallery of every component in its states,
  openable locally) let the AI check its own work before the founder ever sees it? The app is
  Electron and the AI cannot easily screenshot the authenticated app — say whether this is worth
  building and what it would take.
- Concretely: **what would let the AI produce a visually correct panel on the first attempt?**
  Give the specific artefacts to create, ranked by how much correction time each removes.

## 5. Development velocity & token cost

The founder pays per token and works in long AI sessions. Assess:

- Does the repo layout let an AI find things cheaply? Judge whether `CODEMAP.md` / `llms.txt` /
  `CLAUDE.md` actually work for that, and whether they have drifted or bloated.
- `CLAUDE.md` is very long. Is all of it earning its place, or is some of it re-read every session
  for no benefit? What should be trimmed, split, or moved into a validator?
- **Which recurring instructions could become automated checks instead of prose?** The repo already
  has `scripts/check-*.mjs` validators run by a pre-commit hook — extend that idea. A rule enforced
  by a script costs nothing per session; a rule written in prose costs tokens forever and is
  followed inconsistently.
- The 28 500-line `inventory.js`: assess honestly whether it is genuinely hurting, and where. If
  you recommend splitting, name concrete seams and be realistic about refactoring risk **with no
  test suite**. Also state what minimal testing would buy the most safety for the least effort.
- Any workflow step that is repetitive and scriptable but currently done by hand.

## 6. Brand, licensing & certification viability

The commercial plan is selling chips to manufacturers plus a certification programme. Review
whether the legal/IP foundations support that. **You are not a lawyer — flag clearly where a
specialist is required, and never present a conclusion as legal advice.**

- **Licences** — for every repo in the `TigerTag-Project` org: which licence file is present, is it
  consistent across repos, and does it match the intent? Flag the specific tension: a permissive
  licence (MIT/Apache) lets a manufacturer take the protocol and skip certification entirely, while
  a copyleft one may deter adoption. Note that **Apache-2.0 includes an explicit patent grant and
  MIT does not** — relevant when hardware makers are involved. Check third-party dependency licences
  for anything incompatible with commercial distribution.
- **Trademarks** — TigerSystem, TigerTag, TigerPOD, TigerScale. Report what you can verify from
  public sources (EUIPO / INPI / USPTO search results, existing conflicting marks, domain
  ownership) and what needs a professional filing. Key point to address: **the brand, not the code,
  is what makes a certification programme enforceable** — Zigbee and Matter work precisely because
  the specification is open while the *logo* is a registered mark you may only display once
  certified. Assess whether the project is positioned to do the same, and what is missing.
- **Certification model** — study how Zigbee Alliance / CSA (Matter) actually structure this:
  membership tiers, the specification, a compliance test suite, authorised test labs, the
  certification mark and its trademark licence agreement. Then propose a **realistic minimum viable
  version for a solo founder** — what is genuinely necessary at day one versus what is premature.
- **Technical enforceability** — the chips are signed (there is a "TigerTag+" certified tier with a
  factory dump). Assess how strong that is: what stops a manufacturer cloning chips, and what would
  strengthen it without a big infrastructure investment.
- **Governance** — a single-maintainer open protocol is a risk a manufacturer will raise before
  committing. Note what would reassure them (specification versioning, a public changelog for the
  protocol, a stated compatibility policy).

---

# Output format

A single Markdown report, in **English**, structured exactly as follows:

1. **Verdict** — 10 lines max. Overall health of the project, and the single most important thing
   to fix in each of: code, process, business foundations.
2. **Quick wins** — the most valuable section. A ranked table of changes each taking **under ~1
   hour**, with real impact. Columns: rank | axis | what to do (specific: exact file, exact change)
   | why it pays off. Do not fill this with generic advice — every row must be actionable today.
3. **Findings by axis** — one section per axis above. Severity-ranked, `file:line` for every code
   claim.
4. **Medium & long term** — bigger items, each with an explicit cost/benefit judgement and a
   recommendation to do it or not.
5. **What is already good** — be honest. Do not manufacture problems to look thorough; if a
   subsystem is solid, say so and say why. The reader needs to know what *not* to touch.
6. **Open questions** — what you could not determine, and what would be needed to determine it.

Rules for the report: cite `file:line` for every code claim. When you are unsure whether something
is exploitable versus merely ugly, say which. Distinguish *verified* from *suspected*. Do not pad.
State plainly where a lawyer or a security professional is required rather than guessing.
