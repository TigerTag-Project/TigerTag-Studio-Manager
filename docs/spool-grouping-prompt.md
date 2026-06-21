# Spool grouping ("assemble identical spools") — implementation brief

> Self-contained brief for a fresh session. Implements a VIEW-ONLY grouping of
> identical spools in the inventory Table and Grid: identical spools collapse
> into one entry with a count (×N), expandable to see the individual spools —
> folder / sub-folder metaphor. **No Firestore change** — each spool stays its
> own document; the group is computed at render time.

Repo: `#studio` = `/Users/benglut/Documents/TigerTag_Studio_Manager` (Electron;
read `CLAUDE.md` + `renderer/CODEMAP.md` first — jump to line ranges, don't read
the 17k-line `inventory.js` top-to-bottom).

## Locked design decisions (already agreed with the user — do NOT re-litigate)

1. **Grouped by default**, with a **toggle to flatten** ("Group identical spools").
2. **Grid expand** = a **group panel** (slide-in, reuse the detail-panel pattern)
   that lists the group's spools; selecting one opens the normal **detail panel**
   (material card). NOT in-place fan-out.
3. **Maker/DIY color match** = **exact hex** (`colorHex`), plus same brand + material.
4. **Scope = Table + Grid only.** Storage/rack view unchanged for now.

## Grouping key (resolved — confirmed against the twin-link logic)

```js
// View-level key. null = never grouped (renders as a normal single row/card).
function _spoolGroupKey(r) {            // r = a normalizeRow() row
  if (r.isCloud) return null;          // cloud spools: random id_tigertag nonce, catalogue-only → stay solo
  if (r.isPlus && r.raw?.id_tigertag != null)
    return "tt:" + r.raw.id_tigertag;  // TigerTag+ : same product (twin-link groups by this same field)
  return "diy:" + r.brand + "|" + r.material + "|" + r.colorHex;  // Maker/DIY: brand + material + exact hex
}
```

Data-model facts (from `normalizeRow`, `inventory.js` L1030):
- `r.isPlus` = `versionName(data.id_tigertag) === "TigerTag+"` (TigerTag+ vs Maker/DIY).
- `r.isCloud` = `spoolId` starts with `"CLOUD_"` (catalogue entry, no physical chip).
- `r.raw.id_tigertag` = on-chip product identity for TigerTag+ (the twin auto-link
  at L4870 `autoLinkTwinsByTimestamp` pairs spools by the SAME `id_tigertag`, which
  proves it's the per-product identity). Maker chips have it 0 or max.
- `r.colorHex` = primary colour hex (`toHex(color_r/g/b)`). `r.brand`, `r.material`
  are display labels.
- A group of **1** member renders exactly like today (no ×N pill, no chevron).

## Phased plan (deliver + let the user test each phase before the next)

### Phase 1 — Grouping logic + TABLE
- `_spoolGroupKey(r)` + `groupRows(rows)` → `[{ key, members:[…rows], rep, count,
  totalAvail, totalCap }]` where `rep` is a representative member (e.g. most-recent
  or highest weight). Singletons (`key===null` or count 1) pass through as normal rows.
- A **toggle** "Group identical spools" persisted in `localStorage`
  (`tigertag.inv.group`, default ON), placed in the inventory toolbar next to the
  Grid/Table buttons (`btnViewTable`/`btnViewGrid`, wired near `setViewMode` L5731).
- **Table render** (`renderTable(rows)` L5710): when grouping is on, render one
  **group header row** per group (shared brand/material/colour/name + a **×N pill**
  + **aggregate weight** `totalAvail`/`totalCap` with a combined fill bar + a
  **chevron**). Expanded → the N member rows render **indented** below (subtle inset
  background) with their own UID/weight/updated, each still clickable → `openDetail`.
  Track expanded group keys in a `Set` (in-memory; collapsed by default).
- **Sort** (`sortRows` L5001) sorts the GROUPS by the chosen column (use `rep`);
  members sort within. **Search/filter** (`filteredRows` L5015): a group is kept if
  ANY member matches; expanding shows matching members.
- The surgical patch path that updates rows in place (`#invBody tr`, see L5320)
  must keep working — re-render or patch group rows consistently.

### Phase 2 — GRID + group panel
- **Grid render** (`renderGrid(rows)` L5648): a group = a **stacked card** (deck
  effect: 1–2 offset layers/shadows behind) + a **×N badge** in a corner. Clicking
  it opens the **group panel**.
- **Group panel**: a new slide-in panel (mirror the existing detail/friends panel
  pattern + `makePanelResizable`) listing the group's member spools as rows;
  clicking a member opens the existing **detail panel** (`openDetail` L6775).
- Singleton cards render exactly like today.

## Constraints
- **View-only**: never write to Firestore for grouping; never mutate `state.rows`.
  Group structures are derived on each render.
- **CSS** in the right split file: inventory table/grid styles live in
  `renderer/css/70-detail-misc.css` (table, `.thumb`, grid `#invGrid`, detail panel).
  Add group styles there; panel styles can mirror `20-friends.css`/`60-modals.css`.
- **i18n**: every new string in all **9** locales via `npm run i18n:add` (never
  hand-edit locale JSON). Likely keys: `invGroup` (toggle), `invGroupCount`
  (`{{n}} spools`), group panel title, etc.
- **CODEMAP**: keep `renderer/CODEMAP.md` in sync — the pre-commit hook runs
  `npm run codemap:check` (and `i18n:check`); fix drift, never `--no-verify`.
  Relevant sections: "Inventory render (L5038-5863)", "Spool detail panel
  (L6499-8192)".
- **Stats unchanged**: the SPOOLS / stock / TigerTag counters keep counting
  PHYSICAL spools — grouping is purely visual.

## Project rules (inherited)
Conversation in French; code/comments/commits in English. Never commit without an
explicit order. Ask for a real test before proposing a commit. Update `WORKLOG.md`
as you go (current version header in it). Suggest running on Sonnet/Haiku for the
trivial bits and Opus for the tricky table/grid render work.

## First deliverable
Don't code yet: read `CLAUDE.md` + `CODEMAP.md` + the anchors above (`normalizeRow`,
`sortRows`, `filteredRows`, `renderInventory` L5098, `renderTable`, `renderGrid`,
`openDetail`, `setViewMode`), confirm the exact integration points, then propose
Phase 1 (grouping logic + Table).
