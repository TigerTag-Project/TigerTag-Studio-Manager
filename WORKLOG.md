# Worklog — v1.8.12 (in progress)

## Added

## Changed

## Fixed
- Storage view: stop the GPU `tile_manager.cc:997 WARNING: tile memory limits exceeded` flood and the visual flash that happened on every search keystroke and when hover-sweeping between racks containing search matches. Five coupled changes:
  - `renderer/css/30-racks.css` — the search-match pulse on `.rp-slot--match` no longer animates `box-shadow` (per-frame GPU repaint that saturated tile memory once ~15+ matches were on screen). It now animates `transform: scale` with `will-change: transform`, keeping the shadow static at the midpoint of the previous keyframe so visibility is preserved.
  - `renderer/css/30-racks.css` — `.rp-row--header` (the column-number row) now reserves its 14px height permanently instead of expanding from 0 → 14px on rack-hover. The hover-driven height change forced a reflow that re-rasterized every match-slot's compositor layer, producing a visible flash between racks. Coords are now revealed via opacity-only on `.rp-col-label`.
  - `renderer/css/30-racks.css` — on hover, `.rp-slot--match` cancels the pulse and snaps back to `scale(1)`. The parent `.rp-slot--filled:hover` rule applies `transform: translateY(-1px)`, which overrode the scale animation and produced a visible flash whenever the mouse swept across multiple animating match-slots in quick succession.
  - `renderer/css/30-racks.css` — `.rp-slot--filled.rp-dim` no longer transitions `filter`. Animating `filter: grayscale` on 100-300 slots whenever the dim set churned (every search keystroke, every filter change) forced a per-frame repaint of the whole grid. Opacity transition stays (compositor-friendly).
  - `renderer/inventory.js` — search/clear listeners (`#searchInv`) no longer call the full `renderInventory()` → `renderRackView()` rebuild in rack view. They now short-circuit to `applyRackSearchDim()` which just toggles `rp-dim`/`rp-slot--match` classes on existing slots. Stats (racks / filled / locked) don't depend on the search, so the class toggle is sufficient.

## Removed

## i18n
