# Worklog — v2.49.1 (in progress)

## Added

- Forced update for the TigerSquad: when `config/studio.minSquadVersion` is
  newer than this build, the TigerSquad and Tiger Quests views and actions are
  locked and open "The TigerSquad has evolved" (update / restart, or later);
  every Cloud Functions call carries the build's version as `?v=` (a global
  `fetch` wrapper, `cloudfunctions.net` only) and a 426 `UPDATE_REQUIRED`
  locks it too (`renderer/inventory.js` `_squadOutdated`,
  `_loadSquadMinVersion`, `_squadUpdateRequired`, `_openSquadUpdate`, gates in
  `_squadGate`, `_squadOnly`, `_enforceSquadGate`, `setViewMode`). Backend
  (not deployed): `functions/versionGate.js` on tigerCoins, streakFreeze,
  squadDeal, dailyQuest, referrals; rule `config/studio` public read. i18n:
  `squadUpdateKicker`, `squadUpdateTitle`, `squadUpdateText`, `squadUpdateBtn`
  (11 locales). Art: the tiger pointing at a laptop with the update arrow
  (`assets-src/img/tigersquad/squad-notice/tiger-update.png` →
  `assets/img/tigersquad/squad-notice/tiger-update-{128,256,512,1024}.webp`).
- Streak / freeze "how it works" windows moved onto `openDialog` (ceremony)
  with their picture (flame / freeze cube) swelling behind the window from its
  top (`backfire` `at: "top"`, `coin-pull.js`, `.bk-fire--top`); each streak
  rule shows the real thing it talks about — the day's orange pill, the
  streak flame, the combo badge, the freeze cube, the flame gone out for the
  Gold / Platinum relight (`questsStreakRuleRepair` reworded, 11 locales).
  `renderer/quests/rules-modal.js` removed. The relight rule sits in the list
  with the "Relight the flame" trophy's match
  (`assets/img/trophies/stickers/flameRelit.webp`), rule text at 12.5 px, the milestone
  table's header clean and centred (`.qsr-table`). Combo badges take the
  rarity colours: ×1 common, ×2 uncommon, ×3 rare, ×4 epic, ×5 legendary
  (`.qd-combo--1…5`, `--tier-*`). The freeze rules window follows the same
  layout: the rule with its freeze cube, the melt rule with the melting gift,
  then the slots table with a single centred header and cubes only (no
  numbers) (`freezeRuleHtml`, `.qsr-table--freeze`); `questsFreezeSlotsCol`
  removed (11 locales). The freeze card has no "Give" button any more: each
  cube still to give is the button (lifts on hover, opens the give window,
  `.qf-gift[data-qf="give"]`); the window is titled "Give a freeze"
  (`questsFreezeGiveTitle` reworded, `questsFreezeGiveBtn` removed, 11 locales).
  The streak card's Combo badge sits under the week's pills (`.qd-week`). The
  streak and freeze cards share one head (`.qd-card-head` on `.qf-head`): the
  card's picture at 44 px (flame / freeze cube), the title in white display
  type, the ⓘ at the end; the streak count and the week below it
  (`.qd-streak-body`).

- Give envelopes: choose which, and several at once. The give window
  (`showEnvelope` give picker, `renderer/quests/squad-deals.js`) shows up to 10
  envelopes picked at random from the pile (`_givePile`: gift envelopes by
  origin — a friend's name, easter egg, milestone, gift — and the chips'
  "Surprise"), contents never shown, the first one checked; check up to the
  day's allowance, then a friend, then hold Give. The backend's `tigerCoins`
  `giveEnvelope` takes `ids` (≤ 10; not deployed — must go out before this
  build). CSS `.tc-give-envs` / `.tc-give-env` in `renderer/quests/quests.css`.
  The envelopes are a hand of cards (`--r` / `--y` per envelope: angle and
  drop), a checked one rises in place, a hovered one lifts a little.
  Received several at once: the backend sends ONE `envelope_gift` notice
  with `data.count`; `_announceEnvelopeGifts` then shows `showEnvelopeGift`
  with `count` — three envelopes fanned behind the card, turning toward
  the mouse (`.tch-env-pile` / `.tch-env-stack`, coin-pull.js `tilt`, which
  now also sets the unitless `--tx` / `--ty`), the middle one higher and
  casting its shadow on the two behind, away from the pointer —
  and "Open them all" opens the pile; the bell reads `notifEnvelopeGiftMany`.
  i18n: `envGivePickEnv`, `envGiveSentMany`, `envGiveChip`, `envGiveEgg`,
  `envGiveGift`, `envGiftTitleMany`, `envGiftTextMany`, `envGiftSeeMany`,
  `notifEnvelopeGiftMany` (11 locales).

- Tiger Quests: the ⓘ of the streak-freeze card and a new ⓘ on the streak
  card open a "how it works" window (the full-set window's frame): freezes —
  the rule, the slots by TigerSquad badge, the melt rule; streaks — a day =
  the full set, a milestone every 5 days × the combo, the combo up to ×5, a
  missed day without a freeze resets both, the milestone table with the
  member's combo highlighted, the Gold / Platinum repair
  (`renderer/quests/rules-modal.js` `showRulesWindow`, `index.js`
  `streakRulesHtml`, `freezeRuleHtml`, `[data-qrules]`; `quests.css`
  `.qrules`, `.qsr-*`). i18n: `questsRulesOk`, `questsRulesHow`,
  `questsStreakRule{Day,Palier,Combo,Miss,Repair}`, `questsStreakTableTitle`,
  `questsStreakCol{Day,Combo,Bonus}` (11 locales).

- Leaving the TigerSquad now costs 30 days: switching it off opens a window
  that lists what goes (TigerCoins actions, streak freezes, +150 XP, badge and
  level, the TigerSquad space) and what stays, "I'm staying" or hold to leave;
  a member who rejoins within the 30 days is in the squad but its views and
  actions open "Your access is back in N days" (date + day-of-30 bar) instead
  (`renderer/inventory.js` `_openSquadLeaveWarning`, `_openSquadLockInfo`,
  `_openSquadNotice`, `_squadActive`, `_squadLockDays`; `10-settings.css`
  `.squad-notice`, `.sqn-*`). Backend: `users/{uid}.squadLockedUntil`
  (server-only, rules), written on leaving by `publishSupporter`, cleared
  hourly by `squadLockSweep`; `squadActive` (`functions/squadLock.js`) gates
  the badge, the +150 XP, TigerCoins (`SQUAD_LOCKED`), freezes and tiers.

- Requests (issue 181): a Copy button on every message of a conversation (to
  paste it into a translator), shown on hover (`renderer/report/index.js`
  `copyMsg`, `report.css` `.rep-msg-copy`); the "All requests" tab counts the
  open ones, loaded as soon as a TigerMaster / admin opens the window; the
  team gets a "Requests" tab in the notification centre (six tabs then sit
  in two rows of three, `.nc-tabs--grid`) with a "New request #n" card that
  opens it in the team view (`renderer/inventory.js` `request_new`,
  `teamReport`; `openReport({ tab: "all" })`; backend `reportIssue` notifies
  every TigerMaster / admin).

## Changed

- Trophies banner: the count card shows only what you have ("51 stickers
  collected", `trophyStuckLabel`, 11 locales), no total and no progress bar —
  some stickers are out of reach (hidden, events) (`renderer/quests/trophies.js`,
  `trophies.css` `.trp-hero-lbl`); `trophyCount` removed (11 locales). The
  banner becomes an explorer's temple (the founder's pick among album, pirate
  and explorer concepts): stone blocks drawn in CSS over the account's wall
  colour (SVG pattern on `.trp-hero`), a torch and two swaying vines on the
  wall, the tiger with backpack and flashlight over the treasure map, the open
  stone relic full of stickers (`assets-src/img/trophies/banner-explorer/*.png`
  → `assets/img/trophies/banner-explorer/*.webp`, `TROPHY_SCENE`,
  `.trp-hero .hl--*`). The view is renamed "Treasure hunt" ("Chasse au
  trésor"; `trophiesTitle`, `trophiesFriendTitle`, 11 locales). Locked stickers lose their dashed disc
  (silhouette only, `.trp-st.is-locked .trp-st-art`).

- Trophy albums kept on this device, only new stickers read (500k-user
  audit; a trophy is never lost, an album only grows). Yours
  (`tigertag.trophyAlbum.<id>`) paints at once and listens only to trophies
  with `earnedAt` after the last sync (minus 1 h); friends' albums
  (`tigertag.friendTrophies.<id>`, 50 newest) paint at once on a visit and read
  only what was earned since; a REST COUNT (1 read) catches a trophy taken back
  and re-reads the whole album. The owners' percentages read one doc,
  `trophyStats/_all`, gathered by the backend's `communityStats` every 10 min
  (not deployed; before it exists the collection is read as before) instead
  of one doc per trophy. Files: `renderer/quests/trophies.js`, `CLAUDE.md`.

- Cold launch reads only what changed (500k-user audit). A listener started
  more than 30 min after the last one was billed for the whole inventory and
  products again (~450 reads for a 225-spool account). `_listenSynced` keeps
  the local copy (`tigertag.inv.<id>`, new `tigertag.products.<id>`) and its
  sync time (`tigertag.invSync.<id>` / `tigertag.prodSync.<id>`), and listens
  only to docs with `syncAt` after it (minus 1 h for clock skew), plus one REST
  COUNT per collection and launch (a mismatch → full re-read). Studio stamps
  `syncAt` (client clock) on its own inventory / products writes
  (DocumentReference / WriteBatch / Transaction set + update wrapped once);
  the backend's `statsOnInventoryWrite` / `statsOnProductWrite` stamp server
  time on any other writer's (not deployed — must go out BEFORE this Studio
  build). Copies older than 30 days, or never saved (full localStorage), are
  re-read in full. Files: `renderer/inventory.js`, `CLAUDE.md`,
  `docs/firestore-schema.md`.

- Fewer backend XP recomputes per session (500k-user audit). Every write to
  `users/{uid}/telemetry/studio` and every `dailyQuest` check-in runs the
  backend's `storeTotals` (≈ 60 reads). `_recordUsage` now batches the
  telemetry fields of 4 s into one write (a field already waiting sends the
  pile first; blur / unload send at once) and the community-link click,
  `hasPod` and spool-lifecycle counters go through it; quest counters flush
  after 8 s (was 1.5 s) and on blur; a window focus re-checks in at most every
  hour (was 10 min). Files: `renderer/inventory.js`, `renderer/quests/index.js`.
  Backend (`TigerTag_Firebase_Backend`, not deployed): the TigerScale /
  TigerSpool XP triggers and the scale stats trigger fire on add / remove only
  (`xpScaleAdded`/`Removed`, `xpTigerSpoolAdded`/`Removed`,
  `statsOnScaleAdded`/`Removed` replace `xpScales`, `xpTigerSpools`,
  `statsOnScaleWrite`: a scale beats every 30 s); `xpTelemetry` recomputes only
  when a field the XP read moved; a repeat same-day `dailyQuest` answers from
  the stored quest docs; `tigerCoins` reads only the chip envelopes still in
  the pile (`countedChips.inPile`, set by `syncChip`, cleared on open / give;
  `status` COUNTs them) and the easter eggs from `users/{uid}.tigerCoins.eggs`
  — each account is brought to it once (`tigerCoins.pileV`); `communityStats` publishes the pulse every minute from a full count every
  10 min (was every minute) + live counters in between (`communityLive.js`:
  XP, spools and printers as increments on 50 shards, fed by `storeTotals`,
  `statsOnInventoryWrite`, `statsOnPrinterWrite`), and it now also builds
  the TigerSquad boards (`refreshBoards` in `squadBoard.js`; the separate
  `squadBoardRefresh` function is gone), so totals and leagues move together.

- TigerSquad leagues read the server's board instead of every member (built
  for 500,000 users). Before: each open read every member's `userProfiles`
  doc (≈ 350 today, 500k at scale), plus 60 history rows; the XP history page
  did the same for the live league curves, and the header rank ran a COUNT over
  the members. Now `_loadSquadBoard` reads `squadBoard/world`,
  `squadBoard/countries`, `squadBoard/nat_<CC>`, the viewer's profile and
  `squadRank/{uid}` (+ one read per rival when the viewer ranks below a top):
  ≈ 6 reads + 20 history rows. Rows below the top 100 show the account's
  nightly rank as the last row; arrows come from the rows' `bw` / `bn` / `base`
  (rank 7 days ago) — `squadRanks/current` is no longer read. `_squadRank`
  takes the live rank from the world top or the nightly file; `_squadMemberCount`
  reads `publicStats/community.members.count`; `_loadLeagues` takes today's
  totals from `squadBoard/countries`. Backend (`TigerTag_Firebase_Backend`,
  not deployed): new `functions/squadBoard.js` (boards every 10
  min, `squadRanksNightly` 00:05 Paris — ranks, league history and ranking
  trophies moved out of `communityStats`), rules for `squadBoard` / `squadRank`,
  two `userProfiles` indexes (`tigerSquad.country` + `tigerSquad.xp` asc/desc).
  Files: `renderer/inventory.js`, `renderer/quests/squad-rankings.js`,
  `docs/firestore-schema.md`, `llms.txt`, `renderer/CODEMAP.md`.

- Navigation draws at once and reads less (stale-while-revalidate). A friend
  visit no longer tears down the own listeners: the own inventory and racks
  listeners stay alive and write into `_ownStash`, restored at once on the way
  back (no re-read; friends / notifications are no longer re-subscribed). The
  last 5 friends visited stay in memory (`_friendCache`: stock, racks,
  products, lists, profile; keyed to the reading account, never written to the
  own caches): a re-visit paints at once and reads nothing for 3 min
  (`FRIEND_FRESH_MS`), later it paints the last copy and re-reads behind. A
  first visit reads stock and racks in parallel and paints before the images
  are warmed. TigerCoins `status`: one call in flight per account, reused 30 s,
  dropped by any other action / a deal action / a gift (`_coinStatus`). The
  TigerSquad board is not re-read while under 2 min old
  (`SQUAD_BOARD_FRESH_MS`, reset when the own XP moves); the community history
  and the league day curves are read once a day (30 min at most); the XP log
  is kept 10 min while `xpPoints` has not moved; a friend's sticker album is
  kept for the last 5 friends (`renderer/quests/trophies.js` `_friendAlbums`);
  a requests tab opened again within 20 s keeps its list
  (`renderer/report/index.js` `TAB_FRESH_MS`). Measured on the founder's
  account (grid → lists → squad → deals → friend → friend's squad → back →
  friend → friend 2 → friend → back → squad → grid): 4,232 Firestore reads →
  1,736; friend re-visit ~900 ms → ~200 ms and 927 reads → 0; back home 321
  reads → 0; a friend's squad view 321 reads → 0 (`renderer/inventory.js`
  `switchToFriendView`, `switchBackToOwnView`, `_friendCachePut`,
  `_sortRacks`, `_tigerCoins`, `_openSquadBoard`, `_loadSquadPulse`,
  `_loadXpLog`, `_loadLeagues`).


- View bar: every entry shows at start-up with the last session's figures,
  then updates — the Tiger Quests group (today + journey bars), the Tiger
  Squad group, and the Lists, Cart and Invite badges no longer pop in late
  (`renderer/inventory.js` `_barCache`, `_barCachePatch` → header cache
  `bar`; `_renderProgressChips`, `_updateListsBadge`, `_updateCartBadge`,
  referral `onChange`). New rule `.agents/rules/paint-last-known.md`.

- Friend view header: a friend's stock weight and stock value are no longer
  shown (their counts only), and my own TigerCoins, RFID readers, scales,
  TigerSpool and Tiger Touch icons step aside (`renderer/inventory.js`
  `FRIEND_HIDDEN_STATS`, `body.is-friend-view` in `renderFriendBanner`;
  `60-modals.css`).

- Agent rules: `.agents/rules/token-efficiency.md` now asks for one subject per
  session, short precise agent briefs, text checks before one screenshot, and
  names the project agents to use (`theme-fixer`, `i18n-writer`,
  `release-notes`, `issue-triage` beside `codemap-explorer` / `simple-task`);
  `release.md` names `release-notes` as the one agent a release may use;
  `CLAUDE.md` index line updated.

- Game UI tokens: the Tiger Quests views, every TigerSquad view and window, the
  Trophies and the chest/envelope stages now take their colours from one shared
  set instead of local always-dark palettes, so both themes work from one place.
  New tokens in `renderer/css/00-base.css` (light in `:root`, dark in the dark
  block): `--game-bg`, `-bg-2`, `-card`, `-card-2`, `-line`, `-line-2`, `-text`,
  `-text-2`, `-muted`, `--game-win-bg/-bg-2/-card/-line` (floating windows),
  accents `--game-gold/-gold-hi/-gold-deep/-orange/-orange-hi/-ok/-ice/-ice-deep/
  -danger` with `-text` twins for small text on light, `--game-on-gold`, and
  `-soft` tints; `.tc-reveal` stages keep the dark set in both themes. The local
  `--tsq-*` / `--qw-*` / `--sqr-*` palettes in `renderer/quests/quests.css` and
  `renderer/css/10-settings.css` (`.squad-invite`, `.squad-notice`, `.tsq-*`,
  `.sqn-*`, `.sqb-*`) now alias them and the raw hex/rgba were replaced by
  tokens; `renderer/quests/xp-history.js` donut track uses `--game-line`.
  Header note in `00-base.css`, one-line pointer in
  `.agents/rules/css-placement.md`. Dark unchanged; light visual check pending.

- Invite view made clearer (founder: "pas clair"): the title states the
  reward ("Invite a friend: 3 envelopes each"), three steps (send your link →
  they install and type your code → they confirm their e-mail), one sharing
  card with the friend code in big + Copy, the link + "Copy the link",
  networks as named buttons, the message that is sent, the QR "scan with a
  phone"; "Who invited you?" moved to the top (new accounts only); each
  recruit says what it waits for (e-mail, days left) or when it paid; a "+3"
  badge on the Tiger Squad Invite button while nobody joined
  (`renderer/quests/referrals.js|css`, `#viewInviteBadge`). i18n: new
  `referralStep1–3(Sub)`, `referralYourCode`, `referralCopyLink`,
  `referralMsgPreview`, `referralQrHint`, `referralRow{Pending,Validated,Expired}`;
  `referralTitle` / `referralTagline` reworded.
- Invite view, second pass (UI/UX review against the other Tiger Squad
  views): one main action — the orange "Copy my link" (`.sqd-open`, says
  "Link copied!" in place); WhatsApp / "Copy for Discord" / E-mail, the rest
  (other networks, the message sent, the QR) under "More"; the code second
  ("Or share your code", "the code is already in the link"); the banner reads
  "Invite a friend" with the envelope picture ×3 each, its card "Friends who
  joined" + a bar to the next trophy (`.sqr-bar`); compact steps under the
  sharing; "Your invitations" with pills "E-mail to confirm" / "Reward
  received" and the empty state "The squad is waiting for backup"; the shared
  message now says the envelopes come with the e-mail confirmation. i18n:
  new `referralEnvsEach`, `referralCardTitle`, `referralCardNext`,
  `referralCopyMyLink`, `referralLinkCopied`, `referralShareVia`,
  `referralDiscordCopy`, `referralMore`, `referralLess`, `referralOrCode`,
  `referralCopyCode`, `referralCodeInLink`, `referralNoInviteesSub`; reworded
  steps, states, title and share text; removed `referralYourCode`,
  `referralCopyLink`, `referralCount`, `referralCountLabel`,
  `referralNextTrophy`, `referralCopy`.
- Invite view, third pass: the QR stays in view in a narrow right column of
  the share card ("Friend right here?", "They scan it: the sign-up page opens
  on their phone", Enlarge → the QR big on the celebration window frame,
  Download as a quiet link); "Other networks" only adds a second row of
  buttons; "See the message" shows "Message to share" in plain text with
  "Copy the message"; the shared text no longer says "with my code"; the
  banner card reads "Confirmed friends" with an ⓘ "Counted once they confirm
  their e-mail"; steps numbered 1-3, step 2 "The code is already filled in";
  the envelopes centred in the banner. i18n: new `referralCardHint`,
  `referralQrTitle`, `referralQrBig`, `referralMsgShow`, `referralMsgHide`,
  `referralMsgTitle`, `referralMsgCopy`; reworded `referralShareText`,
  `referralMore`, `referralLess`, `referralQrDownload`, `referralQrHint`,
  `referralStep2Sub`, `referralCardTitle`; removed `referralMsgPreview`.
- Invite view, fourth pass (mockups): "A friend invited you?" as one card —
  gift icon, the days left as a pill, ONE dark code field "Your friend's code"
  (e.g. 4ZS-8AG, accepts the code without the dash or a pasted link, Paste
  inside the field; also used at onboarding), an orange "Validate the code"
  enabled once the code is known, "I don't have a code" folding the card to
  one line that opens it again; the share card then reads "Invite in your
  turn"; invitation rows separated by a rule; the enlarged QR gets a close
  cross and "Close". i18n: new `referralCodeLabel`, `referralCodePh`,
  `referralDaysLeft`, `referralNoCode`, `referralLinkTitleToo`; reworded
  `referralWhoTitle`, `referralWhoSub`, `referralClaim`.
- Invite banner scene: one tiger hands a red envelope to the other behind the
  desk, a spool and a printed tiger between them, three envelopes on each side
  (`INVITE_SCENE` via `heroLayersHtml` in `referrals.js`, `.rf-hero .hl--*` in
  `referrals.css`); layers `assets/img/tigersquad/invite-hero/{tiger-give,tiger-take,spool,figurine}.webp`,
  masters + sheet in `assets-src/img/tigersquad/invite-hero/`; the envelopes
  reuse `assets/img/tigercoins/envelope.webp`. The "×3 each" label is gone
  (removed `referralEnvsEach`).
- Illustrations at the size they are painted: masters ≥ 1024 px (one element per
  generation) → `npm run art:build` (`scripts/build-art-ladder.mjs`, sharp as a
  devDependency) writes `<name>-{128,256,512,1024}.webp` and `renderer/art-ladder.js`;
  `artImg()` (`renderer/art.js`) draws them with srcset + `sizes="auto"` so Chromium
  loads the rendition that covers the rendered size × screen density (checked in the
  app: 121 px → 256, 240 px → 512 on a 2× screen); `art:check` in the pre-commit when
  art is staged; `.hl` gets `width: auto`. First pictures on it: the Invite banner layers
  and the two TigerSquad window tigers, regenerated one per image at 1254 px (merch cap).
  Rules: `docs/ART-DIRECTION.md` "Size", `CLAUDE.md` Tools.
- `docs/ART-DIRECTION.md`: the tiger always wears the merch cap (reference
  `assets-src/img/tigersquad/deals-hero/tiger.png`); an asset takes the theme of its
  space (TigerSquad-only features, requests included, use the Tiger Squad look).
- Every illustration in HD (182 under 1024 px in quests/, tigercoins/, tigersquad/,
  trophies/): masters in `assets-src/img/` rebuilt (21 from an existing HD master, the
  rest upscaled ×4 with a local Real-ESRGAN, anime model, dev-only, outside the repo; the
  smallest ones twice), the app's `.webp` rewritten at up to 1024 px under the same
  name and proportions (no code change). Checked one by one against HEAD on before/after
  sheets; fixed via ChatGPT with the reference models: the TigerCoin face on the chest
  base, closed chest and lock (layers kept aligned: only the coin face pasted back) and
  on the coinsSent100 and luckiest stickers (`assets-src/img/tigercoins/coin.png`
  as reference); the TigerSquad coffee cup (text) and the two-tigers friends feat redrawn.
- The chests50 sticker redrawn whole via ChatGPT (same three chests, clean geometry, the
  TigerCoin tiger head on every visible coin face): `assets-src/img/trophies/stickers/chests50.png`
  (1240 px master) → `assets/img/trophies/stickers/chests50.webp` (1024 px).
- The four TigerSquad rank badges redrawn in the art direction via ChatGPT, each from its
  original (same silhouette and parts, sharp angles, flat fills and outline instead of 3D
  metal and faceted gems, navy field): `assets-src/img/tigersquad/tigersquad-{bronze,silver,gold,platinum}.png`
  (1536 px masters) → `assets/img/tigersquad/tigersquad-*.webp` (1024 px, each badge at its
  old size in the square so the ranks still grow bronze → platinum).
- Community milestone trophies: `communityXp1M` / `5M` (epic), `10M` / `15M` (legendary),
  `communityXpTrio` "3 × 5 = 15" (hidden, legendary: the 5, 10 and 15 million together),
  `communityPrinters5k` (epic) / `10k` (legendary). Given to every account in the TigerSquad at
  the minute the community total (`publicStats/community.xpTotal`, `printers.total`) crossed the
  mark (`userProfiles/{uid}.tigerSquad.since` ≤ that minute); later members never get it.
  Backend (committed, deployed): `functions/communityMilestones.js` (state in
  `statsInternal/communityMilestones`, 300 members a minute), called by `communityStats`
  (`supportWebhooks.js`), ids in `trophyRules.js`, unit test in `test/trophies.test.js`.
  Studio: rows in `renderer/quests/trophies.js` (family squad), spec in `docs/TROPHIES.md` 2.3,
  stickers generated via ChatGPT in the art direction, then redrawn lighter on the founder's
  ask (one XP medallion + ribbon, one star on top of 5M / 10M / 15M, three on the trio; one
  printer + ribbon on 5k and 10k; no paws, no crowds): `assets-src/img/trophies/stickers/community*.png`
  → `assets/img/trophies/stickers/community*.webp` (768 px, q82: 370 kB for the seven, was 1.05 MB).
- Printer brand trophies `printer_{bambulab,creality,elegoo,flashforge,snapmaker,anycubic,prusa,klipper,octoprint}`
  (common like `firstPrinter`, state, retroactive): the first real printer (not a demo) of that brand or plugin
  connected. Backend (committed, deployed to the 13 XP-recomputing functions): `supportWebhooks.js` `achievementParts` keeps
  `printer.brands` (per-brand count, > 0 only) in the XP breakdown, `trophyRules.js` builds the ids
  from `xpRules.PRINTER_BRANDS` and `stateTrophies` gives them, test in `test/trophies.test.js`.
  Studio: rows after `firstPrinter` in `renderer/quests/trophies.js` (family gear), spec line in
  `docs/TROPHIES.md`, keys `trophy_printer_*` / `trophyHow_printer_*` (11 locales). Stickers via
  on the founder's ask: each brand's own logo SVG from the app (`assets/svg/icons/logo_*.svg`, the
  plugins' `img/logo.svg`) raised in charcoal on one blank off-white plate drawn by ChatGPT in the art
  direction, no plug badge: `assets-src/img/trophies/stickers/printer_*.png` →
  `assets/img/trophies/stickers/printer_*.webp` (768 px, 276 kB for the nine). Numbers in the fr / pt-pt / pl / ru
  strings use a no-break space so "5 000" never splits.
- Trophies off the open-source app: Studio ships no trophy art and no trophy text any more (the
  missions, hidden ones included, were readable in the repo). Backend (committed, hosting + trophyCards deployed):
  `functions/trophyCatalog.json` (family, hidden, key, name + how × 11), `art/trophies/` (sources,
  parts), `tool/trophy-art.mjs` → `public/trophies/{a,s,catalog}` on the cdn hosting (art under an
  unguessable name, black silhouettes for visible trophies, catalogue per language with hidden ones
  as `{hidden, family, tier}` only) + `functions/trophyFiles.json`, function `trophyCards` (art +
  text of the trophies held), cdn headers in `firebase.json`, check in `tool/check.sh`, tests,
  full spec moved to backend `docs/TROPHIES.md`. Studio: `renderer/quests/trophies.js` reads the
  catalogue (`tigertag.trophyCatalog.<lang>`) and the cards (`tigertag.trophyCards.<uid>`), the
  276 keys `trophy_<id>` / `trophyHow_<id>` removed from the 11 locales, `assets/img/trophies/stickers|badges`
  and `assets-src/img/trophies/stickers|brands|tiers|badges` removed (pictures the UI shows elsewhere
  stay), the freeze modal's match now `assets/img/quests/match.webp`, `docs/TROPHIES.md` rewritten
  (mechanics only), `docs/i18n-keys.md`, `.agents/rules/trophies.md`, CLAUDE.md index line.
  Hidden trophies no longer described in public texts: `CHANGELOG.md` v2.49.0 (hidden ones and
  referral tiers left unnamed), `docs/REFERRALS.md` §7 (points to the backend), the hourglass
  comment in `renderer/inventory.js` (the gesture itself still shows in the code).
- Veiled trophies, revealed by friends: a hidden trophy and every rare / epic / legendary one show
  as "?" + tier only, until a friend holds it — then its silhouette, name and mission show with
  "Seen at <friend>'s" (the art still has to be earned). Backend (committed, deployed: hosting, trophyCards, both triggers):
  `trophyRules.isVeiled`, `functions/trophyReveals.js` (doc `users/{uid}/trophyCounters/reveals`,
  triggers `trophyRevealsOnTrophy` / `trophyRevealsOnFriend`, once-per-account `ensureInit`),
  `trophyCards` `reveals` / `known`, `tool/trophy-art.mjs` (veiled ones out of the catalogue,
  silhouettes renamed by key), tests. Studio: `renderer/quests/trophies.js` (`_reveals`,
  `tigertag.trophyReveals.<uid>`, `friendName` ctx in `inventory.js`), keys `trophySeenAt` (new),
  `trophyHiddenHow` (reworded) in 11 locales, `docs/TROPHIES.md`, CLAUDE.md storage table.
- Trophy family labels off the app too: backend `functions/trophyFamilies.json` (8 families × 11
  languages, album order) published in the cdn catalogue as `families: [{id, name}]` by
  `tool/trophy-art.mjs`; Studio `renderer/quests/trophies.js` `familyName()` and the family filter
  read it (`TROPHY_FAMILIES` removed); the 8 keys `trophyFamily_<family>` removed from the 11
  locales (`trophyFamilyAll` stays); `docs/TROPHIES.md`, `docs/i18n-keys.md`, `.agents/rules/trophies.md`. Committed, cdn deployed.
- Envelope pile trophies (a pile given to one friend in a single go, `giveEnvelopes`):
  `envPileSent3` (uncommon, "Bulk delivery": give 3 at once), `envPileRecv2` (common, "Double helping"),
  `envPileRecv4` (uncommon, "Four of a kind"), `envPileRecv5` (rare, "Full hand"); a pile of 5 gives
  2 and 4 too. Backend: `trophyRules.js` `PILE_SENT` / `PILE_RECV` /
  `pileTrophies`, awarded in `tigerCoins.js` `giveEnvelopes`, test in `test/trophies.test.js`. Studio:
  rows after `envRecv100` in `renderer/quests/trophies.js`, `docs/TROPHIES.md`, keys
  `trophy_envPile*` / `trophyHow_envPile*` (11 locales), stickers in a Chinese New Year
  series, chibi animals holding fanned red envelopes with the gold tiger seal (Ratome guest star
  with 2, monkey offering 3, the tiger without cap with 4, a green Chinese dragon with 5)
  `assets-src/img/trophies/stickers/envPile*.png` (1024) → `assets/img/trophies/stickers/*.webp` (768).
- Trophy tiers: the first-printer trophies (`firstPrinter` and every `printer_<brand>`) are
  common; the four TigerSquad badges climb one tier each — `squadJoin` common, `squadSilver`
  uncommon, `squadGold` rare, `squadPlatinum` epic (legendary kept for later). Backend
  `trophyRules.js` + Studio `renderer/quests/trophies.js` + `docs/TROPHIES.md` (committed, deployed).
- Bambu Lab by transport: `printer_bambulab_lan` (epic, "I take control": the first real
  Bambu Lab on the local network, Developer mode — device doc `mode` not `"cloud"`) and
  `printer_bambulab_cloud` (common, "Head in the cloud": `mode == "cloud"`), on top of
  `printer_bambulab`. Backend (committed, deployed): `supportWebhooks.js` `achievementParts`
  counts the real cloud Bambus and stores `printer.bambu {lan, cloud}`, `trophyRules.js` gives the
  two, test in `test/trophies.test.js`. Studio: two rows after the brand rows in
  `renderer/quests/trophies.js`, `docs/TROPHIES.md`, keys `trophy_printer_bambulab_{lan,cloud}` /
  `trophyHow_printer_bambulab_{lan,cloud}` (11 locales); stickers = one die-cut piece drawn by ChatGPT (the
  plate and a round green Wi-Fi (LAN) or cloud (Cloud) sticker at the bottom right, one continuous
  white border) with the app's Bambu Lab logo raised on the plate (`printer_bambulab_{lan,cloud}.png/.webp`);
  the two round stickers alone are separate assets, `assets-src/img/trophies/badges/{lan,cloud}.png`
  → `assets/img/trophies/badges/{lan,cloud}.webp` (512 px).
- One window helper: `openDialog()` (`renderer/dialog.js`, rule `.agents/rules/dialogs.md`)
  with two looks — "notice" (the Tiger Squad window: picture, kicker, title, text, cards,
  orange action first, secondary, held danger action) and "ceremony" (the TigerCoins window
  with its plaque); it owns the cross, Escape, outside click, focus and motion. Moved onto it:
  the leave-the-TigerSquad and perks-return windows (`_openSquadNotice` removed), "Your
  request moved" (`report/index.js _showAlert`, now in the Tiger Squad look with a tiger
  holding a ticket: `assets-src/img/tigersquad/requests/tiger-request.png`, laddered; the old
  `.rep-alert*` CSS removed from `report.css`) and the invite's big QR (`.rf-qr-x` removed).
  Shared CSS in `60-modals.css` (`.dlg-*`).
- A friend's sticker album: in a friend's view the TigerSquad group keeps its
  Trophies tab and shows THAT friend's album ("{{name}}'s trophies", read once,
  kept 2 min, read-only: no code button, no download; an album that cannot be
  read says so) — `renderTrophiesView(host, friend)` in `renderer/quests/trophies.js`,
  wired in `inventory.js`. Needs the backend rule `users/{uid}/trophies`
  readable by an accepted friend (`TigerTag_Firebase_Backend/firestore.rules`,
  deployed 2026-11-02, not committed yet; checked in the app: a friend's album
  loads, 23 / 116). i18n: new `trophiesFriendTitle`,
  `trophiesFriendTagline`, `trophiesFriendLocked`. The four new tigers wear the
  merch cap (TigerTag logo), regenerated from `assets-src/img/tigersquad/tigers-merch-cap-source.png`.
- Trophy unlock window: clicks, Escape and "See my trophies" wait 2.2 s
  (`UNLOCK_LOCK_MS`, `.trp-unlock.is-locked`, the button fades in after) so
  the unlock is always seen (`renderer/quests/trophies.js`, `trophies.css`).
- Leave-the-TigerSquad and perks-return windows reworked (`_openSquadLeaveWarning`,
  `_openSquadLockInfo` in `inventory.js`, `.sqn-*` in `10-settings.css`): the
  rule first ("perks stop at once, locked 30 days even if you come back"), the
  bouncer joke gone, "During these 30 days" rows separated by rules without
  strike-through, "Member bonus — the 150 XP bonus is removed", what stays in
  its own card, "Hold 1.5 s to leave"; the return window says "Welcome back!",
  "Your perks return in N days", the 30-day wait unchanged, the return date
  with its year in a card above the bar, "N days gone / 30 days". A tiger on top
  of each replaces the lock / clock icon (`.sqn-art`, `.sqn-ico` removed):
  `assets/img/tigersquad/squad-notice/tiger-{leave,back}.webp` (masters in
  `assets-src/img/tigersquad/squad-notice/`). i18n: new `squadLockKicker`,
  `squadLockDateLbl`, `squadLockTotal`; reworded `squadLeaveDesc`,
  `squadLeaveLostTitle`, `squadLost_freezeSub`, `squadLost_xp`,
  `squadLost_xpSub`, `squadLost_badgeSub`, `squadLost_spaceSub`,
  `squadLeaveKeep`, `squadLeaveHold`, `squadLockTitle`, `squadLockDesc`,
  `squadLockProgress`.
- Send TigerCoins: at least 20 coins per envelope (`minAmount`, set in the
  TigerHub admin) and one envelope a day to the same friend — the friend can
  still send one back; friends already sent to today are greyed with "Sent
  today", quick amounts start at 20, errors `SEND_MIN` / `SENT_TODAY`
  (`renderer/quests/squad-deals.js` `showSendCoins`, `quests.css`
  `.tcs-f.is-sent-today`; backend `functions/tigerCoins.js` `sendCoins`,
  `sentToday`).
- Trophies album: a band of light sweeps across every earned sticker,
  staggered across the page (`renderer/quests/trophies.js`, `trophies.css`
  `.trp-gloss--tile`, `trp-gloss-tile`).

## Fixed

- Tutorial missions on a narrower window: the level cards squeezed six to a row
  (titles, "Done" badges and rows broken word by word) because the columns
  followed the window, not the view beside the sidebar. `.inv-quests-view` is
  now a container (`quests`) and the grid follows it: six cards from 1500 px of
  view, three below, two under 820 px; the banner title shrinks under 1300 px
  and the banner's level card keeps one line (`renderer/quests/quests.css`
  `.qm-cards`, `.qm-hero-txt`, `.qm-hero-card b`). The banners' tagline stays
  on one line (`.qm-hero-txt p` nowrap); "Tutorial missions" is now just
  "Missions" (`questsJourney`, 11 locales).

- Light theme: the daily-quest icons were white on the light rows (they used
  the "label on a filled button" white); they now take the text colour; the
  category badges' words (Quick, Exploration) use the deep "-text" shade; the
  Combo pills' fills no longer depend on the view's local palette
  (`renderer/quests/quests.css` `.qd-ic`, `.qd-badge`, `.qd-combo`); the
  "Open Tiger Studio" quest shows the framed TigerSystem logo
  (`assets/svg/logos/tigersystem-icon-framed.svg`, `.qd-logo`). Hero banners
  had a dark frame in Light (their corner ring took the dark page colour of
  their token scope) — it now uses `--page-bg`, resolved on the view. Rankings
  rows (countries' flag bands, makers' colours) become pale tints with dark
  words in Light, level names in a deep shade; the Workshop rarity words, the
  XP history filters, the deals' "Code available" and "Offered" badge read in
  Light (`.sqr-row.has-flag` / `.has-mc`, `.qw-rar`, `.xph-filters select`,
  `.sqd-card-state.is-free`, `.sqd-card-badge.is-free`).

- Light theme readability pass: new text-twin tokens `--primary-text`, `--success-text`, `--warning-text`, `--danger-text`, `--info-text`, `--neutral-text`, `--buy-text`, `--favorite-text`, `--success-hover-text` (deepened in Light so text in those hues keeps 4.5:1; in Dark each equals its accent) and every `color: var(--accent)` in the CSS now uses the twin; Light-only fixes for white-on-white or pale text: sidebar settings button, cloud stat tile, ticker up/down, account menu (was a hard-coded dark panel), notification tile detail, MCP/settings warn status, byte counter, brand star, RFID copy flash, Elegoo download hover, rack lock hint, TD1S slot tab / ghost / clear hover, toolbox confirm, Prusa MMU tag, requests window links; `.bulk-hidden` ground now `--warning-soft` (`renderer/css/00-base.css`, `10-settings.css`, `20-friends.css`, `30-racks.css`, `40-printers.css`, `50-snapmaker.css`, `55-creality.css`, `57-elegoo.css`, `60-modals.css`, `70-detail-misc.css`, `renderer/report/report.css`, `renderer/IoT/*/*.css`, `renderer/printers/*/*.css`, `renderer/rfid_protocol/*/*.css`).
- Streak freezes card: the "Give" button no longer squeezes the "To give" row
  — it sits in the card's head beside the ⓘ; a freeze already given this batch
  leaves its slot drawn as a dashed gift cube (batch = the tier's `give` cap)
  (`renderer/quests/index.js` `freezeCardHtml`, `quests.css` `.qf-head-give`,
  `.qf-gift-given`).

- Light theme readability: grey text was too pale — light `--muted`
  #6b7287 → #4f566b, `--faint` #8b93a7 → #697087, `--neutral` #8b91a3 →
  #737a8f, `--game-muted` #5a6277 → #4f566b, `--ink-40…85` raised; the hero
  banners, the game stages and the header banner on the account colour now
  take the dark token set in both themes (title, "5 / 5 levels done", pseudo)
  (`renderer/css/00-base.css`, `renderer/quests/quests.css`,
  `renderer/inventory.js` `has-theme-tint`). Hover names of the view bar are
  names only ("Daily quests", "Tutorial missions"), never figures
  (`_renderProgressChips`, `vtgDaily` → `questsDailyHeading`); removed
  `questPillLabel` and the `questsPillLabel` key (11 locales).

- Tiger Quests journey: the "Secret mission" card was unreadable in the Light
  theme (dark ground, dark text); it now has a light purple ground there, same
  look in Dark (`renderer/quests/quests.css`, `.qm-secret-wrap > .qm-card`);
  the name on a completed ("legendary") chapter tile was pale gold on light
  purple, now deep gold-to-purple in Light (`.qm-chap.is-legend b`).

- "All requests" showed requests closed on GitHub as still open (issue 181):
  their status only refreshed when their author opened "My requests"; the
  list now re-reads the open ones on GitHub (backend `myReports` `all`,
  `syncReport`, at most every 2 min per instance).
- The light across a sticker never showed (album and open sticker): its mask
  pointed at the art relative to the stylesheet (404); it now gets the art's
  absolute URL (`renderer/quests/trophies.js` `artUrl`).
- The "Time master" trophy (`timeMaster`) showed the XP coin; it now shows
  the hourglass it is earned on (`quests/xph-hero/hourglass.webp`,
  `renderer/quests/trophies.js`).
- The "Ice delivery" trophy (`freezeReceived`) showed the empty dashed cube;
  it now shows the ice cube with the bow (`quests/freeze/freeze-gift.webp`,
  `renderer/quests/trophies.js`).

## Removed

## i18n
- `coinsSendMin`, `coinsSendErrToday`, `coinsSendTodayDone` added (11 locales).
- `reportCopyMsg`, `notifReqNew`, `notifTabRequests` added (11 locales).
- `squadLeave*`, `squadLost_*`, `squadLock*` added (11 locales).
- `trophy_communityXp{1M,5M,10M,15M,Trio}`, `trophy_communityPrinters{5k,10k}` and their `trophyHow_*` added after `trophyHow_worldFirst` (14 keys, 11 locales).
- Launch splash redone: a local page `renderer/splash/` (`splash.html`, `splash.css`, `splash.js`)
  instead of the data-URL card. It draws the welcome page's ecosystem scene (iMac, the TigerPOD
  flipping into the TigerScale then the TigerSpool, Tiger Touch, iPhone), now shared: CSS moved
  from `70-detail-misc.css` to `renderer/css/72-hero-scene.css` (linked in `inventory.html`),
  markup moved from `inventory.js` to `renderer/hero-scene.js` (`fillHeroScenes`). One loading line
  picked at random in the user's language (key `splashLoading`, an array, 11 locales); the language
  is saved by the renderer at each launch (`studio.ready(lang)` in `preload.js` → `main.js`
  `_saveSplashLang`, `<userData>/splash.json`), else the system language. The bar follows the real
  steps (`main.js` `splashStep`: shown, reference data, window loading, page loaded, first paint);
  the reveal fades the splash out (`.is-out`) while the main window fades in (`setOpacity`, not on
  Linux or full screen). `CLAUDE.md` file map, `llms.txt` CSS count, `CODEMAP-main.md`. The splash
  reads "Tiger Studio Manager 2" (the 2 in orange); its devices turn as fast as on the welcome page but rest 0.6 s
  between turns instead of ~5 s (`splash.css` `splFace1-3`, a 4.05 s round).

