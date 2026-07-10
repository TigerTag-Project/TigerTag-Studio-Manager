# Side-card z-index & docking reference

Every right-side "side card" (spool detail, printer panel, reorder, product card, …)
is a `position: fixed` panel that slides in from the right edge. When several are open
they **cascade to the left** (each pushed left of the next by `_syncPanels`) so they
never physically overlap — **but each panel's `»` close tab sits at the panel's own
left edge**, i.e. on the seam with its left-hand neighbour, so a **tab** does overlap
that neighbour. That single fact drives the whole z-index scheme.

> **TL;DR before touching a z-index:** panels and tabs share one ladder. A tab must
> paint **above the panel to its left** (be visible on the seam) yet **below the panel
> to its right** (tuck behind it while sliding closed). That's why each stack leaves a
> **free slot between panels** (101 / 103 / 105 …) for the tabs (102 / 104 / 106 …).
> Never collapse those gaps.

All values below live in `renderer/css/70-detail-misc.css` unless noted. The docking
math (which card pushes which) lives in `_syncPanels()` /
`_layoutSettingsStack()` / `_syncPrinterAddPanels()` in `renderer/inventory.js`.

---

## Master table — every side card

Ordered by z-index. "Dock" = where it sits horizontally when multiple are open.

| Panel (id / class)            | Panel z | Close tab (id)         | Tab z | Width  | Dock (right → left)                                   | File |
|-------------------------------|:------:|------------------------|:-----:|--------|--------------------------------------------------------|------|
| `#printerCloseTab` (tab)      |   —    | `#printerPanel`        | **106** | —     | front-most tab                                         | 70 |
| `.detail-panel.printer-panel` | **105** | —                     |   —   | 300px  | printer panel = **front** card, owns right edge        | 70 |
| `#printerAddCloseTab` (tab)   |   —    | `#printerAddPanel`     | **104** | —     | over material, behind printer                          | 70 |
| `#settingsCloseTab` (tab)     |   —    | `#settingsPanel`       | **104** | —     | settings stack (front tab)                             | 70 |
| `#printerAddPanel`            | **103** | `#printerAddCloseTab` | 104   | —      | printer **settings/add** form, left of printer panel   | 70 |
| `#settingsPanel`             | **103** | `#settingsCloseTab`    | 104   | —      | settings stack **anchor** (right edge)                 | 70 |
| `.pp-close-tab` (base)        | **103** | (generic)             |   —   | —      | base for any close tab before its id override          | 70 |
| `#detailCloseTab` (tab)       |   —    | `#detailPanel`         | **102** | —     | material tab — behind settings + printer               | 70 |
| `#debugCloseTab` (tab)        |   —    | `#debugPanel`          | **102** | —     | tucks behind Settings                                  | 70 |
| `#fseCloseTab` (tab)          |   —    | `#fseExplorerPanel`    | **102** | —     | Firebase Explorer tab                                  | 70 |
| `.detail-panel` (material/spool)| **101** | `#detailCloseTab`   | 102   | 300px  | spool/material card = **back** card, keeps right edge  | 70 |
| `#debugPanel`                | **101** | `#debugCloseTab`       | 102   | —      | left of Settings                                       | 70 |
| `#fseExplorerPanel`          | **102** | `#fseCloseTab`         | 102   | —      | Firebase Explorer, left of Settings                    | 70 |
| `#fseRawPanel`               | **101** | `#fseRawCloseTab`      | **101** | —     | Raw JSON, back-most of the FSE stack                   | 70 |
| `.detail-panel.group-panel` (`#groupPanel`)| **100** | `#groupCloseTab` | **100** | — | group **deck**, left of detail (+container)          | 70 |
| `#containerPanel`            | **100** | `#containerCloseTab`   | **100** | 250px | container picker, left of the spool card               | 70 |
| `#productCardPanel`          | **100** | `#productCardCloseTab` | **100** | 300px | product "business card", **right of** reorder          | 70 |
| `.detail-ghost` (slide-swap clone) | **100** `!important` | — | — | —  | inert clone, one slot behind the real panel            | 70 |
| `#reorderPanel`              | **99**  | `#reorderCloseTab`     | **99**  | 300px | reorder / "Infos produit", **left of** product card    | 70 |
| `#notifCloseTab` (tab)       |   —    | (notifications panel)  | **99**  | —     | opens ALONE — kept below all so a card covers it        | 70 |

### The odd ones out
- **`.sfe-backdrop`** (Snapmaker filament-edit bottom sheet) — `z-index: 111`, deliberately
  **above the printer panel ladder** (max 106) so the sheet + its backdrop sit over the
  printer panel it belongs to (`renderer/css/50-snapmaker.css:946`).
- **`.detail-ghost`** is the slide-swap ghost: a static clone of the outgoing card one slot
  **behind** the real panel (100), removed once the new card slides over it. Inert
  (`pointer-events:none`). See the slide-swap transition in `inventory.js`.

---

## The stacks (independent z-index ladders)

Panels in different stacks never coexist (opening one closes the others), so their
ladders are independent and can reuse the same numbers.

### 1. Inventory cascade (the main one) — back → front
```
reorder (99)  <  product card / container / group deck (100)  <  material/spool (101)  <  printer settings (103)  <  printer panel (105)
tabs:  reorder 99, product/container/group 100, material 102, settings 104, printer 106
```
- **Interleave rule:** panels on odd slots 101/103/105, tabs on even slots 102/104/106,
  so every tab paints above the panel to its left and below the panel to its right.
- Reorder (99) & product card (100) sit **below** the material card on purpose: the
  reorder card tucks the furthest left, the product card sits to its right (and above it,
  100 > 99) so it reads as the front of that pair.

### 2. Settings + Debug / Firebase Explorer stack — right → front
```
Raw JSON (101)  <  Firebase Explorer (102) / Debug (101)  <  Settings (103)
tabs:  raw 101, explorer/debug 102, settings 104
```
Settings is the anchor at the right edge; Debug **xor** Firebase Explorer tucks to its
left; the Raw JSON card is back-most. Laid out by `_layoutSettingsStack()`.

### 3. Printer add-flow (brand picker + choice card)
Two `.pba-card`s shown side by side inside transparent `.modal-overlay`s; the choice
card docks at the right edge, the brand picker is pushed to its left. Laid out by
`_syncPrinterAddPanels()`. (These are modal-hosted cards, not `.detail-panel`s.)

---

## Docking order in `_syncPanels()` (right edge → left)

The **printer stack owns the right edge**; every inventory side card cascades to its
LEFT. Order in which `right` offsets accumulate:

```
printer panel  →  printer add/config  →  [right edge starts here for inventory cards]
material/spool  →  container picker  →  group deck  →  product card  →  reorder card
```
`baseRight = printerW + configW`, then each card adds the previous card's width:
`matRight = baseRight`, `cppRight = baseRight + detailW`,
`groupRight = baseRight + detailW + cppW`,
`pcRight = baseRight + detailW + cppW + gpW`,
`roRight = baseRight + detailW + cppW + gpW + pcW`.

> **Product card is computed BEFORE the reorder card** so the reorder ("Infos produit")
> card can dock to the LEFT of it. Result: when both are open the product card is on the
> RIGHT and layered above (100 > 99).

---

## Layers ABOVE all side cards (reference)

Not side cards, but useful to know what floats over them:

| Element                              | z-index | File |
|--------------------------------------|:------:|------|
| Full-screen modal overlays (`.modal-overlay`) | 9999 | 60-modals.css |
| Teach/emergency fullscreen overlay   | 9999   | 70-detail-misc.css |
| `.acct-menu` overflow / whatsnew-ish popovers | ~10000 | 60-modals.css |
| Debug JSON copy popover / large tooltip | 9000 | 70-detail-misc.css |
| Tool-info popover (`ⓘ` tips)         | 600    | 70-detail-misc.css |
| Account/lang dropdown menu           | 500    | 60-modals.css |
| Toasts / bottom center notice        | 200    | 70-detail-misc.css |
| Custom select dropdown popup (`.csel-pop`) | 30 | 70-detail-misc.css |

---

## Adding a new side card — checklist

1. **Pick the stack.** Almost always the inventory cascade (§1). Reuse an existing slot
   if the new card is mutually exclusive with a peer; otherwise claim the next
   panel/tab pair **without collapsing the interleave gap**.
2. **Panel z on an odd/base slot, tab z one above it** — so the tab clears the panel to
   its left but tucks under the panel to its right.
3. **Dock it in `_syncPanels()`** — compute its `right` from the accumulated widths of the
   cards to its right, in the correct order (see §"Docking order"), and add a
   `_setTab(...)` line pinning its close tab to `right + width`.
4. **If it opens ALONE** (like notifications), keep its tab **below** the others (≤ 99) so a
   card opening in its place covers the tab as it slides out.
5. **Update this doc** (the master table + the relevant stack) so the ladder stays legible.
