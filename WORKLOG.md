# Worklog — v2.11.3 (in progress)

## Added

## Changed

## Changed
- Twin-tag reconciliation source of truth is now the **most-recently-updated chip** (`max updatedAt`), not the displayed/smaller-UID spool — the master is evolutive, following whichever chip you touched last (fresh weigh-in, just-set container…). On a tie it falls back to the displayed spool for determinism. This fixes conflicts where the displayed chip held a stale value that the old rule would have wrongly kept. `updatedAt` parsing handles a live Firestore Timestamp, the serialized `{seconds}`/`{_seconds}` forms and a raw epoch. — `reconcileTwinFields`, `renderer/inventory.js`
- Twin reconciliation now guards on **same product identity** and **breaks bad links**: a pair is force-synced only when both chips share the same `_spoolGroupKey` (id_product for Tag+, brand/material/colour/aspect for maker). A pair whose two chips are *different* products was mis-linked — the pass now clears `twin_tag_uid` on both docs so they become independent spools again (timestamp-neutral), counted as `unlinked` and surfaced in the Debug repair line. This prevents one spool's fields from overwriting an unrelated one's, and fixes two genuinely-different products being shown (and valued) as one — `reconcileTwinFields`, `renderer/inventory.js`

## Changed
- Detail panel "Emplacement": the **auto-store button is now icon-only** — a larger (16 px) sparkle icon with `aria-label` (no text label, no title), and a clear hover state (soft primary background + border, icon turns primary and scales up) so it's obvious the cursor is on it; hovering the button also **lights up the whole location card** (border + fill + label + box icon in primary, via `:has()`) so the user sees what the action will fill. The not-stored status is a short one-word label ("Unracked" / "Non rangée" / …) instead of the long "Pas rangée dans un rack" phrase — `renderer/inventory.js`, `renderer/css/10-settings.css`
- `icon_sparkle.svg` redrawn as a filled **3-star "AI" sparkle** (was a magic-wand + sparkles) — the conventional AI-action glyph; shared by the detail-panel auto-store button and the rack autofill menu item — `assets/svg/icons/icon_sparkle.svg`

## Fixed
- Detail panel now reflects an **auto-store** ("Ranger auto") immediately **and surgically**: the location section is patched in place, never a full rebuild. `refreshOpenDetail`'s early-return was gated on `_rowSignature` alone (which omits the rack slot), so an auto-store — writing only `rack`, no timestamp — never repainted the "Emplacement" section until reopened; a naive fix rebuilt the whole panel, which reset the scroll (a visible "jump to top") and reloaded the image/video. Now the structural signature is split into a core (everything except the slot) + a location signature: a location-only change swaps just the `.panel-storage-loc` node and re-wires it (`_patchDetailLocation` / `_wireStorageLoc`, mirroring the toolbox surgical pattern), keeping scroll + media intact — `renderer/inventory.js`
- Twin auto-linker (`autoLinkTwinsByTimestamp`) no longer pairs two chips that are **different products**: it linked by `id_tigertag` + chip-timestamp proximity (≤2 s) alone, so two unrelated spools programmed seconds apart got merged into one twin (and re-merged on every snapshot, undoing the reconciler's unlink). It now also requires an identical `_spoolGroupKey` — the root cause of the mis-linked pairs — `renderer/inventory.js`
- Twin reconciliation is now **idempotent on rack**: the field compared the `rack` object AND the legacy flat `rack_id`, but `copy` only ever wrote the object — so a pair with mixed rack shapes never converged and the repair re-wrote it on every pass (visible as the "docs filled" count ping-ponging on repeated Repair clicks). Comparison now uses a canonical slot key (`_twinRackSlot`) tolerant of both shapes — `renderer/inventory.js`
- Twin-tag spools now keep their **remaining weight** and **container weight** in sync between the two chips — the repair pass (`reconcileTwinFields` / `_TWIN_FIELDS`) previously mirrored box/picture/rack/tags/note but not weight, so the two chips of one physical spool could report different grams (e.g. 194 g vs 1000 g). This made the stock value swing depending on which chip was displayed, and diverge between own-view and friend-view. Now the two docs align to the freshest chip's weight (timestamp-neutral); the container field also compares `container_weight` (not just `container_id`) so a weight-only drift is repaired. Repair flag bumped `twinFix.v2 → v3` so accounts re-run the pass once — `renderer/inventory.js`

## Removed

## i18n
- Changed: `storageNotPlaced` shortened to a one-word label ("Unracked" / "Non rangée" / …) — 9 locales
