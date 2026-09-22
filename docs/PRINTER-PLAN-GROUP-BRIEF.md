# Persistent card groups in the printer plan — implementation brief

**Status: IMPLEMENTED in v2.21.2.** Kept as the record of what was agreed and why. The word chosen
was **cluster**; the data model is (b) — a cluster id on each member, beside the coordinates it binds
(`planCluster` / `unitsPlanCluster` / `units.{id}.planPrintersCluster`), so no new collection and no
rules change was needed, and deleting a printer takes its membership with it. Selection expansion
lives in `_syncPlanSelection`, so every way of selecting inherits it; the drag itself never learned
about clusters. Anchors: `clusterOf`, `clusterMembers`, `saveBoardCluster`, `_drawClusterHulls`,
`wirePlanClusterMenu` — see `renderer/CODEMAP.md` → *Printers views*.

## Goal

In the **Printers view, plan (grid) mode**, let the user pick several cards, **right-click → Group**,
and have that set stay bound together from then on: selecting any member selects the whole group, so
dragging one moves them all — the way grouped objects behave in a drawing program. Right-click →
Ungroup dissolves it.

Founder's wording, verbatim: *"le groupement persiste une fois le group des card fait. mais quand on
sélectionne un groupe c'est pas persistant sauf si on fait clic droit 'grouped'"* — i.e. an ordinary
multi-selection stays transient as today; only an explicit **Group** action makes it durable.

## Half of this already exists — do not rebuild it

The plan already behaves like a drawing app for a **transient** selection
(`renderer/inventory.js`, plan drag block ~L23207-23285):

- `_planSel` — a `Set` of selected `boardId`s, with `_syncPlanSelection()` / `_clearPlanSelection()`.
- **Shift+click** toggles a card in and out of the selection (`e.shiftKey`).
- Dragging a **selected** card carries the rest as `followers`, each keeping its own offset.
  Dragging an **unselected** one clears the selection and moves it alone.
- The code comment already states the intent: *"which is how every drawing program behaves"*.
- `is-plan-selected` marks members; `_printerArrange` gates arrange mode; the plan has its own zoom.

So the work is **not** "make a selection move together" — that works. It is: **turn a selection into
a durable group, and make selecting one member select the group.**

## ⚠️ Naming: "group" is already taken THREE times

Pick a different word before writing a single identifier, or this becomes unreadable:

| Existing meaning | Where |
|---|---|
| Identical spools auto-grouped in the inventory | `_spoolGroupKey`, `_openGroupPanel` |
| User-made **Lists** of product identities | the Lists view |
| **`GROUP_PREFIX`** — the units of ONE multi-unit printer shown as a single board (`unit: "*"` = "all of them, as one") | `_boardObj`, plan code |

That last one is the dangerous one: it lives in the very code this feature touches. A set of several
DIFFERENT machines needs its own name — e.g. **cluster**, **bundle**, **set** — never `group` alone.

## Data model — where positions live today

A board is addressed by `boardId`, resolved by `_boardObj()`:

- plain `<printerKey>` → the whole printer
- `UNIT_PREFIX + <printerKey>:<unit>` → one unit of a multi-unit machine
- `GROUP_PREFIX + <printerKey>` → all its units as one board

Positions come from `boardPos()` → `printerPlanPos(p)` for a whole printer, or `planPrinters {x,y}`
on the unit / `unitsPlan` for the grouped form. Persistence therefore already hangs off the printer
documents, not a separate collection.

**Decision needed:** store a cluster as (a) a new per-account doc (e.g.
`users/{uid}/printerClusters/{id}` holding `boardIds[]`), or (b) a `clusterId` field written on each
member. (a) keeps membership atomic and is easier to dissolve; (b) avoids a new collection and a new
security-rules block. Both need a rules change if (a) — see `CLAUDE.md` → *Firestore Security Rules*.

## Behaviour to build

1. **Right-click on a plan card** → context menu with **Group** (when 2+ boards are selected) /
   **Ungroup** (when the card is in a cluster). Note: the app has almost no precedent for a context
   menu — the only `contextmenu` listener today is on a rack slot (~L30246). The rack menu
   (`.rp-menu`, `.rp-menu-item`) is the closest existing component to reuse.
2. **Selecting a member selects the whole cluster** — expand the selection in the pointerdown path
   before `followers` is computed, so the existing drag code carries the cluster with no change.
3. **Visual**: a cluster must be legible at a glance (a shared outline / tint behind the members).
   Follow the app's own UI rules in `CLAUDE.md` (real icons, visible selected state, smooth motion).
4. **Ungroup** clears the binding but leaves every card exactly where it stands.
5. Deleting a printer must not leave a dangling member in a cluster.

## Conventions

`CLAUDE.md` applies: all logic in `inventory.js`, CSS in the matching `renderer/css/` file (plan and
printer styles live in `40-printers.css`), **11-locale i18n via `npm run i18n:add`** for every new
string, brand voice (register 3), CODEMAP kept in sync, validators green before proposing a commit,
and **no commit without an explicit order**.
