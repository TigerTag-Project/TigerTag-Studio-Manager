# Easter eggs (hidden envelopes)

**Rule.** A hidden envelope in the app is an *easter egg*: an id declared on the server, a spot in
the UI wired through `tapEgg`, glints while it is still to find. Never invent the reward client
side — the server decides, once per account.

**Why.** Each egg pays one common surprise envelope, so it has to be idempotent and tamper-proof;
the wiring is spread over two repos and was re-discovered from scratch more than once.

**How.**
- **Server** — `TigerTag_Firebase_Backend/functions/tigerCoins.js`: the `EGGS` map (id → reward,
  `surprises: 1`, `surpriseWeights: [100, 0, 0, 0, 0]` = one common envelope, `message: EGG_MSG`,
  optional `requires: "<device>"` checked on `users/{uid}.xpBreakdown.<device>.xp`). The action
  `POST { action: "easterEgg", egg }` puts one `kind: "egg"` envelope in the pile and records
  `users/{uid}/easterEggs/{egg}` (server-only); a second find answers `EGG_FOUND`. The status
  returns `eggs: [ids found]`.
- **Client** — `renderer/quests/squad-deals.js` `tapEgg(spot, egg, ctx, store, onFound)`: each click
  shakes the spot (`.is-tapped`, `tch-tap` keyframes) with a tick; three clicks within 900 ms call
  `ctx.easterEgg(egg, onFound)`, then `celebrateEgg` (the envelope flies out); the envelope waits
  in the pile, nothing offers to open it right away. `store` holds the tap counter (the window
  element is fine).
- **ctx** — `easterEgg(egg, onFound)` and `eggFound(egg)` must be on the ctx the window gets: the
  Deals ctx (`renderer/inventory.js`, `_renderDealsView`) and `_coinsCtx` both have them. A ctx
  without `easterEgg` makes `tapEgg` a silent no-op — the "I click and nothing happens" bug.
- **Glints** — `<span class="tch-glints"><i></i>×4</span>` (quests.css) next to the spot, rendered
  only while `!ctx.eggFound(id)`; removed in `onFound`. No pointer cursor on the spot: it stays a
  secret.

**Current eggs.** `envHelp` (envelope of the "How to get envelopes" window), `dealsBanner` (red
envelope in the Deals banner), `wsTigerScale` / `wsTigerSpool` / `wsTigerTouch` / `wsTigerPod`
(Workshop banner, owners only), `leagueTrophy` (League banner cup), `envGive` (envelope of the
Friends panel's "Give an envelope" window — not on the pile stage's give window, where finding it
would stack a second opening stage),
`codeEnvelope` (red envelope beside the tiger in the "Gift code" window), `inviteBanner` (middle
envelope of the right-hand pile in the Invite a friend banner — every envelope there wiggles on click,
only this one counts; `renderer/quests/referrals.js`).

**Adding one.** 1) add the id to `EGGS` (backend), deploy `tigerCoins` on an explicit go
(`.agents/rules/irreversible-actions.md`), commit; 2) wire the spot with `tapEgg` + glints, check
the ctx has `easterEgg` / `eggFound`; 3) add it to the list above.
