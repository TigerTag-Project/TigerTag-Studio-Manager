# Printer filament storage — the words we use

One shared vocabulary for the thing a printer keeps its filament in. Every brand
names it differently and each one's firmware invents its own wire format, so
without an agreed set of words the same object gets four names in four files and
a conversation about it never converges. These are the words used in the code,
in the docs, and between the maintainers.

**Nothing here is a brand's marketing name.** "AMS" and "ACE" are what Bambu Lab
and Anycubic call their boxes; they are *values*, not concepts. The concepts are
`slot` and `unit`.

## The two concepts

| Term | What it is |
|---|---|
| **slot** | One place for **one** spool. The atom. A slot can be empty, can hold what the machine reports, and can have a spool of the user's inventory assigned to it. |
| **unit** | One **physical object** that groups slots and that the machine manages as a whole: an AMS box, a CFS box, an ACE box, a pair of side holders, or the single external spool arm. A unit has a kind, a number and a place in the room. |

A machine has one or more units. A unit has one or more slots. Nothing else.

> Earlier drafts of this feature called a slot a "bay". That word is retired —
> it named the atom and the group interchangeably, which is exactly the
> confusion this file exists to end.

## Fields

| Field | Values | Notes |
|---|---|---|
| `unitKind` | `ams` · `amsHt` · `ams3h` · `cfs` · `ace` · `holder` · `ext` | What sort of object it is. `holder` is a plain spool arm or pair of arms with no brand name of its own; `ext` is the single external spool position many machines have. |
| `unitIndex` | `0, 1, 2, …` | Which one, when a machine has several of the same kind. Displayed **one-based**: unit index 0 is "AMS 1". |
| `unitLabel` | `AMS 1`, `ACE 2`, `CFS 1`, `Ext.`, `Left`, `Right` | What the user reads. Follows the brand's own wording, because that is what is printed on the box in front of them. |
| `slotLabel` | `A1`, `1`, `Ext.` | The slot inside its unit, in the brand's own numbering. |

**A unit may have no name at all.** The Snapmaker U1's holders are not branded
and are not called anything — its four positions are simply numbered `1`–`4`. An
unnamed unit is labelled by the slots it holds (`1–2`, `3–4`); inventing "Left"
and "Right" would put words on the machine that are not on the machine.

## Per brand

| Brand | Units | Slots per unit | Label |
|---|---|---|---|
| **Bambu Lab** | AMS, several possible | 4 | `AMS 1`, `AMS 2`, … |
| **Bambu Lab** | AMS HT | 1 | `AMS HT 1`, … |
| **Creality** | CFS, several possible | 4 | `CFS 1`, `CFS 2`, … |
| **Anycubic** | ACE, several possible | 4 | `ACE 1`, `ACE 2`, … |
| **Snapmaker** (U1) | two holder pairs, unnamed | 2 + 2 | — (see below) |
| **Elegoo** | one holder block, on the right | 4 | `Right` |
| **FlashForge** | one holder block, on the right | 4 | `Right` |
| *most brands* | the external spool position | 1 | `Ext.` |

Slot counts are what the hardware ships with today, not a limit: a machine may
report more, and the code must take what it is told rather than what this table
says.

## A unit is what the USER says it is

The firmware is the first draft, not the last word. A Snapmaker U1 reports four
positions; in the room those are **two pairs**, one on each side of the machine.
A machine with three AMS reports twelve positions; in the room those are **three
boxes**, which may be stacked in one cabinet or scattered across three shelves.

So the unit layout is **seeded** from what the machine reports and is then the
user's to correct:

- **Split** — one reported unit becomes several. The U1's four become `1–2` and
  `3–4`, two slots each. This is structural: it changes how many racks exist, so
  it has to carry the spool assignments across with it (a spool references its
  slot by `rack.id`; a split that forgot them would empty the shelf).
- **Merge** — several reported units become one, for a machine whose boxes are
  genuinely one block to its owner.

Seeding again later must never undo a correction: once a machine's units have
been arranged, the firmware may add or remove units but it may not re-cut the
ones already there.

## A unit has a SHAPE, not just a count

How many slots is not enough — where they are relative to each other is part of
the hardware, and a rack already carries it as rows × columns:

| Unit | Shape | Because |
|---|---|---|
| AMS / CFS / ACE | **1 × 4** | the four positions sit side by side inside the box |
| AMS HT / Ext. | **1 × 1** | one position |
| Snapmaker U1, one pair | **2 × 1** | the two are **stacked**: `1` above `2` on the left, `3` above `4` on the right |

A U1 pair drawn as a row of two would be wrong on the shelf — the whole point of
letting the user lay the room out is that the drawing matches what they see. So
a unit's default shape comes from the hardware, per brand, and is not assumed to
be a row.

## Grouping is placement, not a mode

"Show the three AMS and the AMS HT as one line" needs no display mode and no
second concept: it is four racks placed side by side, and the board's magnetism
already snaps them flush. They stay four objects, so any one of them can be
pulled out onto its own shelf later without dismantling a group.

A display mode would have been a second, parallel truth about the same hardware
— two things to keep in step, and a user able to see a layout that matches
nothing in the room. Placement is already the layout.

## Widgets — the board holds more than storage

A rack bound to a unit is one **widget** on the board. It is not meant to be the
only kind: the board addresses everything through a single `data-board-id`
(`brand:id` = the machine, `slots:brand:id` = its storage), so temperature, the
current job, a camera or anything else become further kinds without the board
learning about them one at a time. The end state is a dashboard the user lays
out, not a fixed page.

## Where it is stored

**A `units` MAP on the machine's own document**, keyed by unit id.

```
users/{uid}/printers/{brand}/devices/{deviceId}.units.{unitId}
```

A **map**, not an array, because Firestore updates a map's keys individually:
writing `units.ams_0.planRacks` leaves the neighbouring units untouched. An
array can only be rewritten whole, which would let a refresh of one unit flatten
another the user is moving at that moment.

**On** the document rather than in a subcollection beside it, because the units
are few (one to five), are always read WITH the machine and always written
together. A subcollection would have cost a query or a listener per printer for
no gain, and — the part that decided it — the data would have been invisible to
anyone reading the printer document, including our own Firestore explorer.

```jsonc
"units": { "ams_0": {
  "kind":  "ams",              // ams | amsHt | ams3h | cfs | ace | holder | ext
  "index": 0,                  // the n-th of that kind on this machine
  "label": "AMS 1",            // the user may rename it
  "rows": 1, "cols": 4,        // the shape — 2 x 1 for a stacked pair
  "hwId": "3DF1A2",            // the machine's own id for the unit, when it has one
  "present": true,             // the ACCESSORY is plugged in — not: the machine is online

  "planPrinters": { "x": 0, "y": 0, "z": 1 },
  "planRacks":    { "x": 0, "y": 0, "z": 1 },

  "slots": [
    {
      "index": 0,
      "label": "A1",
      "hw":   { "amsId": 0, "trayId": 0 },   // strictly what addresses it on the wire
      "uids": [],                             // what the USER put there

      "seenAt":   1787603880334,              // when the contents below were last confirmed
      "color":    "E8384F",
      "material": "PLA",
      "subType":  "Basic",
      "vendor":   "R3D",
      "tempMin":  190,
      "tempMax":  240,

      "bambuTrayInfoIdx": "GFL98"             // brand specifics, NAMED, only where they exist
    }
  ]
} }
```

**Slots stay inside the unit document.** A unit holds one, four, maybe eight one
day — never enough to justify a read per slot, and writing them together keeps
them consistent with each other.

**Brand specifics are named fields, never a bag.** `bambuTrayInfoIdx`, not a
`meta` blob: a field whose meaning has to be guessed is unreadable six months
later. A Bambu slot carries its own; the others do not carry it at all.

**The contents ARE stored, and `seenAt` says from when.** This is not a cache of
the live feed — it is the record: an offline machine still shows what is in it,
and other devices (an ESP32 wired to a machine) are meant to keep it current
remotely for people who want the data online. It is refreshed whenever the
machine is connected, and on every reconnection. Without `seenAt` nobody could
tell whether what is displayed is ten seconds or three weeks old.

`uids` is an array because a twin spool carries two chips for one physical
object.

## Seeding, per brand

What the machine reports on first connection, turned into units. **Counts are
what today's hardware ships, never an assumption** — every brand here has
already announced or shipped more.

**The authority for each row is that brand's own
`renderer/printers/<brand>/PROTOCOL.md`**, not this table: those files are the
distilled, hardware-validated reference for what a machine reports and how. Read
the relevant one before writing a seeder, and correct it there — not here — when
the hardware says otherwise.

| Brand | Units seeded |
|---|---|
| **Bambu Lab** — every model | `ext` (1 slot) + one `ams` per reported unit (4 slots), or `amsHt` (1 slot), or `ams3h` (9 slots, the H3C's — and no `ext` there, it has no external spool). Up to four AMS. **One rule for the whole range**: every Bambu speaks the same MQTT, so an A1, a P2, an X1 or an H2 needs no special case. |
| **Creality** | `ext` (1) + one `cfs` per reported box (4) |
| **Anycubic** | one unit per reported box: box `-1` is the external box and is itself **multi-slot** (a Kobra X / ACE Pro 2 reports it with **4** slots — collapsing it to one cell loses three), boxes `0..N-1` are `ace` units of 4 |
| **Snapmaker U1** | one `holder` of 4 — the machine's own interface shows a single row of four, though physically `1`/`2` are on the left and `3`/`4` on the right, stacked. Splittable by the user into two 2 x 1 units. Snapmaker plans one AMS of four **per print head**, so this machine will report four units of four, or more, or a mix — the seeder must take what it is told. |
| **Elegoo** | `holder` of 4 **and** `ext` of 1, but never both `present` at once: unplugging the Canvas hub swaps which is live. Both documents are kept, and `present` flips — deleting the absent one would throw away what the user had assigned in it. |
| **FlashForge** (AD5X) | `ext` (1) + `holder` station of 4 |

The Elegoo case is why `present` exists and why an absent unit is never deleted:
the accessory comes back, and the assignments have to still be there.

## Why units are the unit of arrangement

Printer interfaces draw every slot in one long line because a line is easy to
draw. **A workshop is not a line.** The boxes sit on top of the machine, beside
it, under the bench, on a shelf behind — wherever they fit. A user who has two
AMS stacked to the left of an X1C and one on the shelf above should be able to
lay them out that way.

That is the whole reason a unit — not a machine, and not a slot — is the thing
Studio makes movable:

- **One unit = one rack.** A bound rack (`racks/{rackId}.printer = { brand, id, unit }`)
  mirrors exactly one unit, so each can be placed where its box really stands.
- A machine with three AMS therefore owns **three** racks, not one rack of
  twelve slots. Twelve slots in a row is the printer interface's compromise, and
  reproducing it would throw away the only thing the user actually wants to
  express.
- A rack bound to a unit is **not resizable**: its shape is the hardware's.
- Deleting the printer deletes every rack bound to it — they describe hardware
  that is no longer there.
