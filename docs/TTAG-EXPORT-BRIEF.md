# `.ttag` export / import — implementation brief

> The reference for building `.ttag` support. Every design point below was decided in conversation
> and is frozen unless this file is changed. Read it before implementing; keep the *Progress* section
> at the bottom current so the work is resumable.

## What a `.ttag` is

A **complete, faithful backup of one or more inventory materials**, so they can live **outside the
cloud**. A `.ttag` is a copy of what's stored in Firebase — nothing stripped — so a user can duplicate
their inventory locally, move it between machines, and restore it even if the cloud is gone. It is the
"own your data" story made concrete, and it fits the open-protocol philosophy: the data belongs to the
user, in a file they hold, not only on a server.

It is **not primarily a share primitive.** Sharing a `.ttag` is possible (it's a file), but the format
is designed for fidelity, not curation — see *Privacy*.

## Frozen identifiers

| Thing | Value |
|---|---|
| Extension | `.ttag` |
| macOS UTI | `io.tigertag.ttag` (conforms to `public.json`) |
| Windows ProgID | `TigerTag.ttag` |
| Content marker | `{ "format": "tigertag", "kind": "ttag", "version": 1 }` |

`.ttag` is effectively free as an extension (checked: no recognised format uses it). Ownership is by
convention: the UTI is namespaced to `tigertag.io`, a domain the founder controls, so no one else can
claim `io.tigertag.*` in good faith. The content marker self-identifies the file, so even a colliding
`.ttag` from another app is rejected on open rather than mis-imported.

## Schema

```json
{
  "format": "tigertag",
  "kind": "ttag",
  "version": 1,
  "exportedAt": "2026-07-19T…Z",
  "records": [ { …full Firestore inventory doc, verbatim… }, … ],
  "rfidBackups": {
    "<chipUid>": { …full rfidList/{chipUid} doc, verbatim… }
  }
}
```

- **`records`** is a flat array of **1 to N** full inventory docs, copied **verbatim** from Firestore.
  There is no identity/instance split, no per-record wrapper — a record *is* the doc.
- The array length covers every case with **no branching**:

  | Export | `records` |
  |---|---|
  | one spool | `[ doc ]` |
  | a twin | `[ docA, docB ]` |
  | whole inventory | `[ …every doc… ]` |

- A real record looks like the doc the founder verified: `id_brand/material/type/aspect1/aspect2/unit`,
  `color_r/g/b/a`, `data1..7` (data1 = diameter, data2/3 = nozzle min/max, data4/5 = dry temp/time,
  data6/7 = bed min/max), `measure`/`measure_gr` (capacity), `weight_available`, `TD`, `uid`,
  `id_tigertag`, `id_product`, `productKey`, `container_id`/`container_weight`, `message`, `protocol`,
  `timestamp`. Kept as-is.
- `exportedAt` is stamped at export (`Date.now()` is available in the renderer). Purely informational.
- **`rfidBackups` — REQUIRED whenever a TigerTag+ chip has a backup. Not optional.** A TigerTag+
  chip's signed factory dump lives in a **separate** Firestore collection,
  `users/{uid}/rfidList/{chipUid}`, *not* in the inventory doc. So a verbatim dump of `records` alone
  would silently drop the certification backup and the "backup" would be incomplete — which defeats
  the point. Every TigerTag+ chip's `rfidList/{chipUid}` doc is therefore carried **verbatim** in the
  top-level `rfidBackups` map, keyed by chip uid. This mirrors the Firestore reality: `.ttag` = the
  `inventory` docs (`records`) **plus** the `rfidList` docs (`rfidBackups`), the two collections that
  make a spool whole.
  - **Present only when needed.** A record with no TigerTag+ backup contributes nothing. `rfidBackups`
    is absent (or `{}`) for a file with no Plus chips.
  - **Twin.** Each chip has its **own** signed backup, so a Plus twin contributes **two** entries,
    one per uid — this is exactly the per-chip data the rejected "master record" form would have lost.
  - Keyed by chip uid, so the importer matches each backup to its record by uid.

## Twins — atomic, detected from the data

- **A twin is never split.** Exporting a spool that has a twin **always** exports both records; one
  side alone is never produced. Enforce this **at export**: when building `records[]`, for every
  selected spool that carries a `twin_tag_uid`, resolve and include the partner doc too (dedup, in
  case both halves were selected). A single-spool export of a twinned material therefore yields **2**
  records.
- **No grouping structure is needed.** The twin link already lives in the data: `docA.twin_tag_uid ===
  docB.uid`. The importer re-pairs by cross-referencing uids within the file — the same relationship
  the POD reconstructs from a two-chip scan.
- Because a twin is atomic, both sides are **always** present in any `.ttag`, so a `twin_tag_uid` never
  dangles and the import remap (below) always resolves. No half-twin edge case exists.
- **Rejected optimisation — do not re-propose.** Storing only one "master" record + the two UIDs and
  expanding to two docs at import was considered and dropped. It saves a few bytes on already-tiny docs
  but adds a transform on **both** sides (dedup at export, expand at import), and it breaks the
  verbatim-backup principle: a backup must restore *exactly*, and the master form assumes the two docs
  are identical, silently losing any per-chip difference (each TigerTag+ chip has its own signed
  `backup`). Verbatim keeps zero transform and full fidelity; the size cost is negligible.

## Export — grouped or individual (ask when more than one)

When the user exports **more than one material**, ask which shape they want:

| Choice | Result |
|---|---|
| **Grouped** | **one** `.ttag` file containing every selected material (all their records in one `records[]`). |
| **Individual** | **one file per material** — N materials → N files. |

The unit is the **material**, never the record. This is where the twin rule matters:

> A twin is 2 records but **one material**. It is always kept together and is **considered
> individual** — in individual mode it produces **one file with 2 records**, never two files, and its
> 2-ness never promotes it to a "group".

So, selecting 5 materials where one is a twin:
- **Grouped** → 1 file with **6** records (the twin contributes 2).
- **Individual** → **5** files; four hold 1 record, the twin's holds 2.

Don't ask when the selection is a single material (one spool, or one twinned spool) — there is only
one file to produce. The prompt only appears for a genuine multi-material export.

**File naming.** Individual files need distinct, human names — derive from the material
(`brand-material-color.ttag`), falling back to the `uid` on collision. A grouped file is one chosen
name (default `tigertag-inventory-<date>.ttag`).

## The `CLOUD_` → `TigerData_` transition (two invariants — do not break)

The chipless id prefix is moving from `CLOUD_` to `TigerData_`. Every reader accepts **both** already
(Studio, mobile, Hub, stats Cloud Function). The transition to eventually retire `CLOUD_` rests on two
invariants that `.ttag` must uphold:

1. **Every creator mints `TigerData_`, never `CLOUD_` — present and future.** Today only Studio's
   Add-Product flow creates chipless spools, and it mints `TigerData_`. This is a **durable rule, not
   a point-in-time fact**: the day the mobile app (or any client) gains a manual-entry / Add-Product
   flow, it must mint `TigerData_` from day one. A single client minting `CLOUD_` reopens the whole
   transition silently.
2. **Studio never exports a `CLOUD_` — in any mode.** The exporter refuses to write a `CLOUD_`-prefixed
   record into a `.ttag`, whether the export is **individual** or **grouped/bulk**. So a `CLOUD_` can
   never leave in a file, which is what lets the `CLOUD_` code branch eventually be dropped (a `.ttag`
   can never re-introduce one). Recommended UX: if a `CLOUD_` is in the export scope, refuse the whole
   export with a clear message ("reconnect to finish preparing these materials") rather than silently
   dropping records — a silent skip lets a user export 50 and get 47 without noticing.

**Why the refusal is almost never seen:** chipless docs are migrated `CLOUD_ → TigerData_` **silently
on Studio login** — a per-user, progressive rename with no bulk operation. A chipless doc has no
cross-references (no twin, no `rfidList` backup, nothing references it by id), so the migration is a
per-doc **atomic batch**: create `TigerData_<suffix>` + delete `CLOUD_<suffix>` in one write (never
leave a duplicate), idempotent (no `CLOUD_` docs → no-op, safe every login). It ships **only after**
all readers are live accepting both prefixes (the deployment done alongside this work). By the time a
migrated user reaches the export, they have zero `CLOUD_`; invariant #2 is the hard backstop.

## Import — two modes, preview then accept

The importer **never auto-adds**. It validates, previews, and waits for an explicit accept.

1. **Validate first.** Check the content marker (`format`/`kind`/`version`) before anything. Reject a
   file that isn't a `.ttag` or is a newer `version` than this build understands. This is untrusted
   input (a file from anywhere), so also:
   - scheme-check every URL field (`buyUrl`, attachment/`Link*` urls) through `safeHref` — the same
     stored-XSS class hardened this session;
   - clamp/sanitise numeric fields to their expected ranges.
2. **Preview.** Show the material(s) as product tiles (reuse `_productThumbHTML` / the product-card
   render), with the tier badge from `chips`/prefix, a `×2 chips` marker for twins, and the count for
   a multi-record file ("47 materials — import all?").
3. **Accept → two modes:**

   | Mode | When | What happens |
   |---|---|---|
   | **Restore** | same account (your own backup) | keep everything verbatim — `uid`, `productKey`, `id_tigertag`, weight, container. Exact copy. |
   | **Import** | different account (someone opened your file) | regenerate instance ids: fresh `uid` (a new `TigerData_…` for chipless, or keep the hex for a real chip you now hold), recompute `productKey` for this account. |

   In **both** modes: set a fresh `updatedAt` (the stored `{seconds,nanoseconds}` is a Firestore
   server type, not re-injectable), and never write `deleted`/`deleted_at`.
4. **Twin remap (import mode only).** When uids are regenerated, `twin_tag_uid` cross-references must be
   rewritten: two passes — assign new uids to all records building an old→new map, then rewrite each
   `twin_tag_uid` through that map. Restore mode keeps uids, so no remap.
5. **Restore the backups.** For each record whose uid has an entry in `rfidBackups`, write that entry
   back to the recipient's `users/{uid}/rfidList/{chipUid}`.
   - **Restore mode** (same account, you own the chip): write it verbatim under the same chip uid — the
     TigerTag+ certification is preserved exactly. This is the whole reason the backup travels.
   - **Import mode** (other account): you do **not** own the physical chip, so the TigerTag+ status
     does not transfer — the record lands as a chipless material and its `rfidBackups` entry is
     dropped (a signed factory dump is bound to a specific chip; it is meaningless on a spool you
     re-created chipless). So `rfidBackups` is effectively a **restore-only** payload; it is always
     *written into the file* (completeness), but only *consumed* on a same-account restore.
6. **Destination.** Offer "Add to my inventory" (full material) and/or "Keep just the filament in a
   list / favourite" (identity only). A backup restore lands in inventory.

## The `CLOUD_` / `TigerData_` prefix (already done)

New chipless spools mint a `TigerData_` id (done this session, across Studio + mobile + Hub + the stats
Cloud Function; both prefixes recognised via `_isChiplessId`). So a new material's `.ttag` never shows a
confusing `CLOUD_` id, and an old backup carrying `CLOUD_` still imports fine — both are chipless
forever, no migration.

## Privacy (a note, not a blocker)

A `.ttag` is a full copy, so it carries personal state: `weight_available`, `container_*`, `message`,
rack placement. That is **correct for a backup** (your data, for you). It only matters if a user
*shares* a backup with a stranger — then everything travels. That is a conscious act, not a format
trap. If a curated "share just the spec" mode is ever wanted, it's a separate lighter export (identity
fields only, personal state stripped) — out of scope here, noted for later.

## What to build on (already in the repo)

- **Payload shape** — `_adpRefreshRfidPreview` already builds the canonical JSON of a material.
- **OS → app → modal plumbing** — the `tigertag://` deep link already does exactly the shape a
  file-open needs: `main.js` `open-url` → `_handleDeepLink` → `deep-link:ready` flush →
  `preload.js onDeepLink` → renderer modal, with cold-start queueing. A `.ttag` `open-file` reuses this.
- **Helpers** — `_isChiplessId` (tier), `safeHref` (URL validation), the product-card render, and the
  Add-Product panel's inventory-write logic.

## Phasing

**Phase 1 — export + import, fully testable without a build (do first).**
- Export button(s): on an inventory spool → export that material (+ twin partner if any) as a `.ttag`
  (Blob → save dialog). On the Add-Product panel → export what's being composed. On a multi-select /
  whole-inventory export → ask **grouped vs individual** first (see *Export* above); individual emits
  one file per material (twin = one file, 2 records).
- Import via a **file-picker button** ("Import a .ttag") → the validate → preview → accept flow above.
  The picker triggers exactly the modal the OS association will later trigger, so the whole UX and all
  logic are built and testable in dev now.

**Phase 2 — OS file association (needs a build; cannot be verified in dev).**
- `electron-builder` `fileAssociations` in `package.json` (declares `.ttag` + the UTI/ProgID), plus the
  `open-file` (macOS) / argv + `second-instance` (Win/Linux) handling in `main.js`, forwarded to the
  renderer through the existing deep-link channel. Double-click a `.ttag` → app opens on the import
  modal.
- **Not testable without a signed build.** The Windows side is entangled with the Azure Trusted Signing
  that is currently blocked (see `CLAUDE.md`), so plan Phase 2 around macOS first.

**Phase 3 — whole-inventory export + offline mirror (later).**
- "Export my whole inventory" → one `.ttag` with N records (the schema already supports it natively).
  The offline-ownership vision: a file the user holds that restores their entire inventory with no cloud.

## Conventions
- All logic in `inventory.js`; CSS in the matching `renderer/css/*`; **9-locale** i18n via
  `npm run i18n:add`. Update `WORKLOG.md` as you go; run `i18n:check` / `node --check` /
  `codemap:check` before proposing a commit. No commit without an explicit order.
- Phase 1 is behaviour-dependent → request a real `npm start` test (export a material, re-import it,
  confirm it round-trips; export a twin, confirm both records; import to a second account, confirm the
  twin remap) before proposing the commit.

---

## Progress

_Nothing implemented yet. Format fully specified and frozen (this file). The `CLOUD_ → TigerData_`
prefix groundwork is done across all four codebases (see `WORKLOG.md`)._
