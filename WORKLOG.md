# Worklog — v1.10.6 (in progress)

## Added

## Changed
- Detail side-cards (spool + printer) are now **non-modal**: no dimming overlay behind them, so the list stays clickable — clicking another spool/printer switches in place instead of forcing close-then-reselect. Covers grid / table / storage (materials) + printers. Both cards now get the same prominent **`»` close tab** protruding from their left edge (orange/`--primary`, larger so it's easy to spot) — they had no close button once the overlay click was removed + Escape-to-close for the printer panel; real modals (settings, brand picker) keep their overlay. The tabs are viewport-fixed siblings pinned to each panel's left edge by JS (`_syncPanels`, re-run on open/close + a `ResizeObserver` on both panels + window resize) so the panels' `overflow:hidden`/`transform` can't clip them. The tab slides **glued to its panel** on open/close (its `right` animates over the same .25s as the panel's slide, travelling the panel's width) instead of popping in at its final spot. On hover the tab stretches taller (slight overshoot) for feedback. Also hid the spool card's scrollbar (`#panelBody`, scroll still works). `renderer/inventory.js`, `inventory.html`, `css/70-detail-misc.css`
- Side-by-side panels: when a spool card AND a printer panel are both open, the printer keeps the right edge and is the **front** card (z-index 102); the spool card is pushed to its left and passes behind it (no awkward overlap, smooth transition) — sets up dragging a spool straight into a printer slot. `_syncDetailOffset()` on open/close + a `ResizeObserver` on the printer panel. `renderer/inventory.js`, `css/70-detail-misc.css`
- Internal/tooling: added `CODEMAP-main.md` — a feature→line-range map for `main.js` (Electron main process: IPC handlers, printer transports, cameras), mirroring `renderer/CODEMAP.md`. `check-codemap.mjs` now validates both maps, and the pre-commit hook runs it when `main.js`/`CODEMAP-main.md` (or the inventory pair) is staged. No user-facing change.

## Fixed
- Buttons no longer "drop" on click. The global `button:active { transform: translateY(1px) }` *replaced* the centering `transform: translateY(-50%)` of positioned buttons (password-eye toggles, etc.), making them jump down ~14 px on press — which forced a per-button `:active { translateY(calc(-50% + 1px)) }` hack everywhere. Switched the global press feedback to `filter: brightness(.92)` (no transform → can't disturb any button's own transform) and removed the now-useless eye-toggle hacks (`.lm-eye:active`, `.pba-input-eye:active`). `css/70-detail-misc.css`, `40-printers.css`, `60-modals.css`
- Spool side-card's `»` close tab no longer sweeps in front of the printer card while the spool slides closed — the tab now sits on the spool card's layer (z-index 101, below the printer card's 102) so it passes behind the printer like its card. `css/70-detail-misc.css`

## Removed

## i18n
