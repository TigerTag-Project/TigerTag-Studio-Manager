# Dialogs — one helper for every window

**Rule.** Every new small window (information, confirmation, warning, celebration, "show this
big") is opened with `openDialog()` from `renderer/dialog.js`. No new overlay markup, no new
backdrop class, no new close logic. An older window that is touched moves onto it.

**Why.** The app grew eleven window families (static `.modal-overlay` cards, the squad notice,
the TigerCoins stage, the report alert, the trophy unlock…), each with its own classes, close
timing and buttons, so no two windows looked alike (founder, 2026-11-02: "les modales ne se
ressemblent jamais").

**How.**
- `look: "notice"` (default) — the Tiger Squad window: picture on top (`art`: an `artImg()` key,
  else `icon`), optional `kicker`, `title`, `text`, `body` (cards: reuse `.sqn-lost`, `.sqn-when`,
  `.sqn-keep`), then `actions` stacked full width: one `primary` (orange) first, `secondary`
  after, `danger` = held to confirm (wire `setupHoldToConfirm` in `wire`).
- `look: "ceremony"` — the TigerCoins window with the title plaque: rare big moments and
  showing something big (the invite QR). Add the behind-the-window animation in `wire`
  (`.agents/rules/ui-ux-defaults.md`).
- The helper owns the cross, Escape, the click outside (`onDismiss`), focus in and back, and
  the open/close motion. Strings come from `t()`; `initDialogs({ t })` runs once in inventory.js.
- A window's picture follows `docs/ART-DIRECTION.md` (the tiger with the merch cap, ≥ 1024 px
  master on the art ladder) and is shown to the founder before it ships.
- On it today: leaving the TigerSquad, perks return, "Your request moved", the invite QR.
  Still on their own markup (move them when touched): the static `.modal-overlay` cards of
  `inventory.html`, the TigerCoins stage windows (`quests/squad-deals.js`, `fullset-modal.js`,
  `freeze-modal.js`), the trophy unlock and card, the referral ceremony, the squad invite,
  level-up and board.
