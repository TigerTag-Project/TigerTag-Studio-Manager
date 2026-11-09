# Adding a widget to the printer board

The printer board holds **objects**, not machines. Each one is addressed by a
single `data-board-id`, and placement, snapping, selection, group binding and
dragging all key off that — none of them knows what an object *is*. Adding a new
kind of widget is therefore meant to be a case, not a second copy of the board.

It is. **Adding one is a single entry in `BOARD_WIDGETS` plus its CSS.** It was
thirteen edits in eleven places until an attempt to add two widgets at once broke
the view badly enough to be rolled back; that is what the table below exists to
prevent. Read *The trap* before you write the entry — the table removes the
scattered edits, not the ways a widget can misbehave.

## The model

| Board id | What it is | Where its position lives |
|---|---|---|
| `brand:id` | the machine's card | `plan` on the device |
| `units:brand:id` | its storage, grouped | `unitsPlan` |
| `unit:brand:id:unitKey` | one storage unit, when split | `units.{key}.planPrinters` |
| `temp:brand:id` | its temperatures | `tempPlan` |

Group membership is a `…Cluster` field beside each position (`planCluster`,
`unitsPlanCluster`, `tempPlanCluster`). It lives on the machine's document on
purpose: no new collection, no rules change, and deleting a machine takes its
memberships with it.

Whether a widget is shown at all is `widgets.{kind}` on the device — **absent
means shown**, so only a deliberate choice is ever written.

## Adding one

One entry in `BOARD_WIDGETS`:

```js
{ kind: "note", labelKey: "boardNoteTitle", simple: true,
  prefix: "note:", unitTag: "#note",
  planField: "notePlan", clusterField: "notePlanCluster",
  render: p => …,            // "" when there is nothing to show
  refresh: (el, p) => …,     // OPTIONAL — see "live media" below
  wire:    container => …,   // OPTIONAL — listeners the widget needs
}
```

Then an i18n key for `labelKey`, and CSS for `.note-card` / `.note-card-body`. The
frame — head, name, owner, move handle, board id — comes from `_widgetFrame`, so
a widget only ever supplies its **body**.

That entry alone gives it: a switch in the machine's ⋮, a position of its own, a
place in the group binding, the stacking order, the placement walk, and both the
render and the patch paths. Eleven places read the table; none of them knows a
widget's name.

**Prefix collisions are real.** `unit:` is a prefix of `units:`. Prefixes are
matched longest-first for exactly that reason — but prefer disjoint ones.

Storage (`units`) is deliberately NOT in the table: its units are a map with
their own keys, so it owns two prefixes and a position per unit. It has no
`simple: true` and every loop skips it. Forcing it in would make the table worse,
not the storage better.

## The trap

Everything below was learned the hard way, in one evening.

**The board is assembled before it is assigned.** `renderPrintersView` builds
every card and widget into one string and only then sets `host.innerHTML`. A
widget that throws means the assignment never happens: the view keeps whatever
it had and looks like it simply refused to switch, with nothing on screen to say
why. Each builder is wrapped in `_safe` for exactly this reason — keep it that
way, and never assume your builder cannot throw.

**Live media must not be re-rendered.** A camera is an `<img>` streaming or a
video element; replacing the element restarts the stream. A widget holding media
is created once and only ever touched when the thing it shows genuinely changes
(online ↔ offline), never on a tick.

**Firestore's dot notation needs `update`, not `set`.** A patch written as
`{ "widgets.temp": false }` is a path into a nested map only for `update`. `set`
takes it literally and creates a field whose *name* contains a dot, leaving the
real map untouched — the write succeeds, the record never changes, and the
switch springs back on. `update` creates the parent map by itself.

**The echo can revert an optimistic write.** The printers subscription rebuilds
`state.printers` wholesale from every snapshot, and one already in flight still
carries the old value. Anything the user just set — a position, a switch — is
held (`_planJustSet`, `_widgetJustSet`) and released only when the SERVER agrees,
never when the local patch agrees, because the local patch agrees instantly.

**A deferral must never be able to last.** Nothing rebuilds the board while an
object is held or a menu is open, which is right. But every one of those guards
could hold the view hostage, and a frozen screen is far worse than the flicker it
avoided. `_deferPrinterRender` forces the rebuild after two seconds whatever the
reason. Any new guard must go through it.

**A widget switched off forgets where it was.** Otherwise it returns wherever it
last stood, which after any arranging is somewhere off the visible board.

**Placement only looks at its own machine.** A new widget goes flush under its
machine, or under the lowest of that machine's own widgets. Another printer's
card sitting there is NOT an obstacle: pushing past it would send the widget far
from what it describes, and staying near its machine is the point. A card that
overlaps is one gesture to move; one that landed three rows away has to be hunted
for.

## Live media

A widget whose body holds a stream — a camera — must **not** have that body
replaced on a tick: the default patch swaps the body whenever it differs, and
replacing an `<img>` or a `<video>` restarts the stream. Such a widget supplies
its own `refresh(el, p)` and touches the element only when what it shows
genuinely changes (online ↔ offline), leaving it alone otherwise.
