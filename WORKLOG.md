# Worklog — v2.48.1 (in progress)

## Added

- Referrals (design `docs/REFERRALS.md`, validated 2026-11-01; backend not
  deployed): an Invite view in the Tiger Squad group (button `#vtgSquadInvite`
  after Trophies, view mode `squadInvite`, `renderer/quests/referrals.js|css`)
  — the friend link + Copy, share buttons (WhatsApp, X, Facebook, Reddit,
  Telegram, Bluesky, Discord = copy, e-mail; logos `assets/svg/logos/
  logo_{reddit,telegram,bluesky}.svg`), the QR + download, "Who invited you?"
  while the account is under 7 days old, the recruits with their state; also
  reached from the Friends panel, the sidebar friends list's "+ Invite" chip,
  the account dropdown and the empty friends list. Onboarding step 2 gets the
  optional "Who invited you?" field (prefilled by a friend link, Paste); a
  friend link opened by an account that can still claim goes there instead of
  Add friend. Validation = the invitee's verified e-mail within 7 days: 3 gift
  envelopes each, a ceremony window (backfire) per side, notifications
  `referral_joined` / `referral_validated`. Trophies `referral1/5/10`,
  hidden `referral25/50`, `invited` (placeholder art). i18n: `referral*`,
  `notifReferral*`, `trophy_/trophyHow_` for those ids (54 keys).
  Backend: `functions/referrals.js` (claim / status / seen), rule
  `referrals/{inviteeUid}`, `trophyRules.js` COUNTERS.referrals, tests
  `test/referrals.test.js`. Hub: invite page gift card + code copied on
  download, admin TigerCoins → Referrals tab (`config/referrals`).

- Trophies (design `docs/TROPHIES.md`, validated 2026-11-01): a sticker album
  in the Tiger Squad view group (new button after the Workshop, view mode
  `squadTrophies`, every account) — 55 action trophies in six families (the
  flame and the freezes, TigerCoins, Squad and friends, the chips — TigerTag,
  TigerTag+, TigerTag+ Certified —, the workshop — TD1S, RFID reader, USB
  scale, mobile app, first printer / rack / list, updates —, the Tiger
  devices — shown in one grid, the family only in the card a sticker opens;
  every Workshop loot and feat has one; 1st of one's country and 1st
  in the world at a daily ranking; a secret "Master of time": the XP
  history banner's hourglass turned 50 times within 30 s) plus
  the event trophies (`trophyEvents`, newest first); earned stickers die-cut
  from the app's art with a ring in their tier colour, the date and "owned by
  n % of tigers", locked ones as silhouettes, hidden ones as "?", missed events
  dated; a Tiger Squad banner like the Deals one (eyebrow, big title,
  tagline, its own desk scene generated in the house style — the cheering
  tiger behind the desk, a rosette, a sticker sheet, a gold cup, an open
  sticker album, sparkles: `assets/img/trophies/banner/*.webp`, masters in
  `assets-src/img/trophies/banner/` — and the n / total card on the right), then the Deals
  bar (same tabs: All / Earned n / Locked n, the search, a family filter —
  the inventory's filter list, ui-kit `selectHtml` —, "Have a code?"); every sticker the same size (name + date or tier), how to earn it in
  the app's shared info bubble (above the "i" of the card's top-right corner,
  its tail on the icon); an earned card takes its rarity colour, no ring,
  a bigger sticker; an earned card has "Download the sticker" (the picture as
  shipped; the server counts each one once, 5 / 15 / 30 different = three
  hidden trophies); a loot / feat trophy has the Workshop item's rarity;
  tier trophies with pop-culture names for TigerCoins sent / received (100 /
  1,000 / 10,000), envelopes sent / received (10 / 50 / 100), freezes sent /
  received (5 / 25 / 100) and a secret 140-character message;
  brand trophies for the brands selling TigerTag+ Certified spools (Rosa3D,
  eSun, Sunlu, Jamg He, R3D, Landu, Lotactree, Smart3DPT — 1 / 10 / 50 /
  100 certified chips, family "Brands"; `XP_COUNT_VERSION` 3 so each
  account recounts once and its certified chips get their brand); the sticker
  downloads as a PNG;
  stickers and the banner use whole pictures only, never a banner layer;
  37 new stickers generated in the house flat style (no gradients), each
  checked one by one at full size and at 40 px, so every non-brand trophy has
  its own picture: `assets/img/trophies/stickers/<trophyId>.webp` (256 px),
  masters `assets-src/img/trophies/stickers/<trophyId>.png`;
  the 32 brand stickers (`cert_<brand>_<n>`), one die-cut piece each: level 1
  the brand's full logo redrawn in the house style (Smart3DPT: its symbol),
  10 / 50 / 100 a themed object behind it, different per brand and tier (masters
  in `assets-src/img/trophies/brands/` and `tiers/`, model in docs/TROPHIES.md); TigerTag+ = the TigerTag chip
  with a green "+" badge; a "TigerMaster" trophy (the role, or admin);
  110 trophies, 110 different pictures; the flat gold cup
  `assets/img/trophies/cup.webp` replaces the gradient `trophy.svg` for events
  and the trophy notification; "Have a code?" opens the TigerCoins code window (open to every account for
  event codes); a click opens the sticker's card. Every trophy
  won opens its unlock window once per device (rays, the sticker's art
  swelling behind the window with `backfire`, stamp or impact sound), several
  queued one after the other; the sticker card has no X, an earned one gets
  the same art behind it; a search field filters the stickers in place, the
  count per rarity sits on the banner's desk; the bell gets a "trophy" notice that opens the album. The code window no
  longer toasts "0 TigerCoins" for a trophy-only code and explains
  TROPHY_OWNED / NOT_IN_SQUAD. `renderer/quests/trophies.js`,
  `renderer/quests/trophies.css`, `renderer/inventory.js` (initTrophies, `_DOC_TIP_SEL` +
  `.trp-st-info`,
  sign-in/out, `squadTrophies` view, notification "trophy", `_hourglassTaps`),
  `renderer/inventory.html` (`#vtgSquadTrophies`, `#invTrophiesView`),
  `renderer/quests/squad-deals.js` (code window), `renderer/css/00-base.css`
  (`--tier-*`, `--sticker-edge`), `renderer/css/70-detail-misc.css`
  (`.icon-trophy`), `assets/svg/icons/icon_trophy.svg`; docs
  `docs/firestore-schema.md`, `CLAUDE.md` (localStorage key). i18n
  `trophiesTitle`, `trophiesTagline`, `trophyHaveCode`, `trophyCount`,
  `trophyFilter_*`, `trophyFamily_*`, `trophyTier_*`, `trophyHidden`,
  `trophyHiddenHow`, `trophyEventOver`, `trophyOwnedPct`, `trophyEarnedOn`,
  `trophyCtxStreak`, `trophyCtxRank`, `trophyUnlocked`,
  `trophySeeAll`, `trophySearch`, `trophyNoMatch`, `trophyByTier`, `trophyCodeOwned`, `trophyCodeMembers`, `notifTrophy`,
  `notifTrophyText`, `trophyCtxCountry`, `trophyFamily_chips`, `trophyFamily_gear`,
  `trophy_<id>` and `trophyHow_<id>` for the 110 trophies, `trophyFamily_brands`, `trophyDownload` (258 keys, 11 locales). Needs the backend (TigerTag_Firebase_Backend:
  `functions/trophyRules.js`, `functions/trophies.js`, rules) deployed.

- A friend's TigerCoins envelope with a message opens as a LETTER (designed,
  then refined after a ChatGPT motion / sound review, ≈ 2.5 s): closed, the
  friend's avatar sits on the seal and "{name} slipped a word inside";
  opening, the wax seal snaps, the envelope slips down and fades, a parchment
  unrolls with a warm sheen, the message is written in by a left-to-right
  wipe, the signature appears and the friend's avatar stamp is pressed, then
  the coin rises with a glow pulse and the amount counts up, with a few small
  coins; each beat has its own synthesised sound (seal crack, flap, paper,
  stamp, bell over a soft chord). "Collect" is held 2 s: the coin lifts while
  held, then the coins fly to the header's TigerCoins counter (a tick as each
  lands, the counter pulses, "✓ 50 TigerCoins collected") and the window
  closes. "Report this message" sits in the card's bottom-right corner; the
  TigerCoin rises behind the card's top once opened. `renderer/quests/
  squad-deals.js` (`showEnvelope` isLetter / playLetter, collect hold),
  `renderer/quests/coin-sound.js` (`waxSnap`, `flapOpen`, `unroll`, `stamp`,
  `letterCoins`, `depositTick`, `deposited`), `renderer/quests/coin-pull.js`
  (`flyCoins` exported, to the header counter when visible),
  `renderer/quests/quests.css` (`.tc-env-scroll*`, `.tc-env-coin`,
  `.tc-env-collect`, `#topCoinsBal.is-pulse`). i18n `envLetterTeaser`,
  `envCollecting`, `envCollected` (11 locales).

- Report a friend's TigerCoins message: the envelope window offers "Report
  this message" under a friend's message; the recipient confirms, and "Also
  block {name} and remove them from my friends" is ticked by default (the
  Friends panel's own remove + block). TigerMasters and admins see "Reported
  messages" at the top of "All requests" (the text, from → to, when) and
  resolve each one: "Remove the message" (deleted from the recipient's
  envelope) or "Dismiss". `renderer/quests/squad-deals.js` (`showEnvelope`
  report box), `renderer/inventory.js` (`_coinsCtx.reportMessage`),
  `renderer/report/index.js` (`msgReportsHTML`, `resolveMsgReport`, `syncAll`),
  `renderer/quests/quests.css` (`.tc-env-report*`), `renderer/report/report.css`
  (`.rep-msgreps`), new icon `assets/svg/icons/icon_flag.svg` (`.icon-flag`).
  i18n `envReportBtn`, `envReportAsk`, `envReportBlock`, `envReportGo`,
  `envReportDone`, `envReportDoneBlocked`, `envReportAlready`,
  `msgReportsTitle`, `msgReportFromTo`, `msgReportRemove`, `msgReportDismiss`,
  `msgReportRemoved`, `msgReportDismissed` (11 locales). Backend (not
  deployed): `functions/tigerCoins.js` `reportMessage` (→ server-only
  `messageReports/{toUid_envelopeId}`; `status` envelopes carry `fromUid`),
  `functions/reportIssue.js` `myReports` `messageReports` /
  `resolveMessageReport` (team only), README.

- Friends panel: each friend shows their streak-freeze slots received from
  friends (filled / free); a free slot I can fill (a freeze to give not yet
  given to them, or a purchase as a TigerSquad member) is a button ("+" on
  hover) that opens the freeze window on that friend. New "Give freezes" entry
  under "Give an envelope" (a freeze to give if I have one, else buy one for a
  friend). `renderer/inventory.js` (`renderFriendsList`, `#btnGiveFreeze`),
  `renderer/inventory.html`, `renderer/quests/index.js` (`questFreezeStatus`,
  `questFriendFreeze`, `openFreezeFor`, `openFreezeGift`),
  `renderer/quests/freeze-modal.js` (`preselect`, `forFriend`),
  `renderer/css/20-friends.css` (`.fp-freeze`). i18n `friendGiveFreeze`,
  `friendGiveFreezeSub`, `questsFreezeSendTo` (11 locales).

- Every member now sees "All requests" in the feedback panel: everyone's
  requests and their conversations, read-only. A question ("Ask a question")
  is open to everyone's answers — posted with the member's pseudo as
  "Community", 10 per hour per question, and it reaches the reporter as a
  reply. Only TigerMasters and admins close a request (done / declined); a
  reporter can still close their own. Studio `renderer/report/index.js`
  (tab for all, `threadHTML` close actions by role, helper messages, read-only
  note). i18n `reportThreadHelper`, `reportHelperReplyPublic`, `reportReadOnly`,
  `reportAllHint` (11 locales). Backend (not deployed):
  `functions/reportIssue.js` `myReports` (`all` open to every member, `thread`
  read-only for others, `comment` for helpers on questions with
  `helperCommentBody` / `HELPER_MARK_RE`, helper answers counted as replies),
  `test/reportThread.test.js`.

- New achievement "Chests opened": +200 XP for each TigerCoins chest opened,
  kept for good (an opened chest stays opened). Shown in Tiger Squad → My XP,
  the achievements ladder (the open-chest art) and the XP history (Bonus).
  Studio `renderer/inventory.js` (`XP_ACHIEVEMENTS`, loot `ART` / `ICON`),
  `renderer/quests/xp-history.js` (`XP_CATS`), `docs/QUESTS.md` §4. In the
  achievements list every repeatable action shows its ×N count from ×0
  (`renderer/quests/index.js` `ladderHtml`). i18n
  `xpAch_chest`, `xpAchHint_chest` (11 locales). Backend (not deployed):
  `functions/xpRules.js` `ACH_XP.chest`, `functions/supportWebhooks.js`
  (`achievementParts` counts opened chests, new trigger `xpChests` on a chest
  going from unopened to opened), `tool/xp-doc.mjs` + regenerated
  `docs/XP-SYSTEM.html`.
- Send TigerCoins to a friend: "Send TigerCoins" in the Friends panel (under
  "Give an envelope") opens the envelope window's frame — the week's
  allowance by TigerSquad level (bronze 50 / silver 100 / gold 250 / platinum
  500), the friends (members first, the others greyed "Not in the
  TigerSquad"), the amount (10 / 25 / 50 / 100 / Max or typed), an optional
  message, then the recap: my balance before → after, the postage fee
  (0 % to start, destroyed), what the friend receives, the week's allowance
  before → after; a 2 s held button sends. The friend gets an envelope of the
  coins (opened like any gift envelope) and the usual notification. The coin
  history shows "Sent to <friend>" in red with the friend's avatar and the
  fee, and bought streak freezes. Backend `tigerCoins.js` `sendCoins`
  (friends for 7 days, both members, settings in `config/tigerCoins.transfer`,
  editable in the TigerHub admin), not deployed yet (`showSendCoins` in
  `renderer/quests/squad-deals.js`, `_sendCoinsTo` + `#btnSendCoins` in
  `renderer/inventory.js` / `inventory.html`, `.tcs-*` in `quests.css`).
  Checked in the app against a patched status (CDP), nothing sent.
- Lotactree masterspool containers in the container picker — White (150 g) and
  Transparent (194 g), brand 38533, pictures in `assets/img/spool_filament/`
  (`data/container_spool/spools_filament.json`, PR 168 by Ptitlouis6012,
  issue 165).
- Demo printer "Elegoo Centauri Carbon (OpenCentauri COSMOS)" — a new Klipper
  model (id 166, `renderer/printers/klipper/models.json`, picture
  `img/elegoo-centauri-carbon-cosmos.png`) that the demo simulator plays as the
  machine of issue 167: a CANVAS of four lanes `CANVAS_1`–`4` published under
  both `AFC_stepper` and `AFC_lane`, chamber as `temperature_sensor chamber`,
  sensors `mcu_toolhead` / `mcu_bed` / `Mcu_canvas`, `temperature_fan
  mainboard`, lights `led case` (SET_LED) and `led hotend`
  (`services/demo/faces/klipper.js`, `services/demo/shapes.js`,
  `docs/DEMO-MODE.md`).

- My requests: each request opens its conversation — the request and every
  comment on its GitHub issue (team replies on the left with their avatar, the
  user's own on the right, the app's notes centred) — and the user answers from
  the app, text + up to 3 pictures (pasted, dropped or picked), without a GitHub
  account; the user can close their own request from its conversation too
  (asks once); closed requests show they take no more replies. Rows flag an unseen
  team reply ("New reply"). A team reply or a new status opens an alert window
  once per change ("Your request moved", the requests listed with what changed,
  "See my requests" goes straight to the conversation when there is one); open
  requests are re-checked every 30 minutes while the app runs, and a request /
  reply notification opens its conversation. Backend `myReports` actions
  `thread` and `comment` (`renderer/report/index.js` `openThread`, `threadHTML`,
  `sendReply`, `_showAlert`; `replies.js` `unseenReplies`, `alertNews`;
  `report.css`; `renderer/inventory.js` notification `arg`).

- TigerMasters — trusted TigerSquad members who help with the requests
  (`users/{uid}.roles: "tigermaster"`, server-only, given by the owner from the
  TigerHub admin) — and admins get an "All requests" tab in the feedback card:
  every request (Open / Everything), its conversation with the reporter's
  messages labelled "Reporter", an answer posted as the team with their pseudo
  ("Ptitlouis · TigerMaster"), and "Mark as done" / "Decline" (asks once).
  Backend `myReports` actions `all`, `as: "team"`, `resolve`
  (`renderer/report/index.js` `allHTML`, `syncAll`, `resolveThread`;
  `renderer/inventory.js` `state.isTigerMaster`, ctx `isTeam`).
- The answer box in a conversation is the request form's: formatting toolbar,
  drop zone (drag & drop, browse, paste), window capture, PDFs, JSON files and
  "Attach a printer's data" — 5 files per message, shown as chips in the thread
  (`attachHTML`, `deviceCapturesHTML`, attachment tools fill the open draft).

- Opening a chest is now a moment: the chest (new art, closed · base · lid ·
  lock layers in `assets/img/tigercoins/chest/`, sheet in
  `assets-src/img/tigercoins/chest/`) drops in on a stage lit in its type's
  colour and floats with light leaking from the lid; "Open the chest" is held
  2 s — it rattles harder and the seam glows; then the lock pops, the lid flies
  off, flash and god rays, a fountain of TigerCoins, the envelopes rise out one
  by one before their reveal. The plaque shows only the chest's name — how
  many envelopes it holds stays a surprise. Its own music plays while it waits
  (a slow treasure-cave theme in D minor: drone, held chords, harp arpeggio,
  heartbeat drum, music-box sparkle; `chestMusicStart`, muted with the coins
  sound) and fades out as the lock gives. New synthesised sounds thud / rattle /
  unlock / burst / pop (`renderer/quests/squad-deals.js` `showChest`,
  `coin-sound.js`, `quests.css` `.tcc-*`). i18n `chestKicker`, `chestMore`
  (11 locales); `chestInside` removed (11 locales).

- My profile has a Sign-in card (issue 176): the account's email and how it
  signs in (Google, email and password); an email + password account changes
  its address (a link goes to the new address, the change happens when it is
  clicked, the old one works until then) or its password, both after the
  current password; a Google-only account is told its address is Google's. The
  address is re-read from Auth on each open and the local account follows
  (`renderer/inventory.html` `#eacSigninGroup`, `renderer/inventory.js`
  `_paintSignin`, `_signinReauth`, `renderer/css/60-modals.css` `.eac-signin-*`).
  i18n `eacGroupSignIn`, `eacSignInMethod`, `eacSignInPassword`,
  `eacSignInGoogleNote`, `eacChangeEmail`, `eacChangePassword`, `eacNewEmail`,
  `eacCurrentPassword`, `eacNewPassword`, `eacSendLink`, `eacEmailSent`,
  `eacPasswordChanged`, `eacErrWrongPassword`, `eacErrEmailUsed`,
  `eacErrEmailInvalid`, `eacErrSameEmail`, `eacErrPasswordShort`,
  `eacErrPasswordMatch`, `eacErrTooMany`, `eacErrNetwork`, `eacErrGeneric`
  (11 locales).

## Changed

- Shared UI kit for the Tiger Quests / Tiger Squad views, so a new view is
  assembled instead of re-typed: `renderer/quests/ui-kit.js` — `heroHtml`
  (banner: eyebrow, title, tagline, layered scene, side card), `filterBarHtml`
  (the Deals bar: tabs with icon and count, search, extras), `searchHtml`,
  `selectHtml` (the inventory's `.inv-brand-filter`, bar-sized), `infoTipHtml` (an ⓘ on the shared `#toolInfoPop` bubble, wired once in
  `renderer/inventory.js` on `.ui-info[data-tip]`). The seven banners (Daily
  quests, Missions, League, Workshop, XP history, Deals, Trophies), the Deals
  and Trophies bars and the friend-search fields of the send / give windows
  now use it — same markup and look as before. `renderer/quests/index.js`,
  `squad-rankings.js`, `xp-history.js`, `squad-deals.js`, `trophies.js`;
  rule `.agents/rules/ui-ux-defaults.md` ("Reuse what exists").

- Agent rule `.agents/rules/trophies.md` (indexed in `CLAUDE.md`, cited by
  `release.md`): every release adds trophies, the goal is a collection of
  about 1,000.

- Mending a broken streak becomes "Relight the flame": the account's TigerSquad
  badge floats above the window, a dead flame lights up again with the days it
  brings back, and the perk is said plainly ("As a Gold member of the
  TigerSquad, you can bring back a broken streak within 2 days — once a
  month"); the button reads "Relight the flame · 1 day back" (real plural)
  and the streak card's strip "Relight it" (`renderer/quests/freeze-modal.js`
  repair, `REPAIR_DAYS`; `renderer/quests/quests.css` `.qfm-mend`, `.qfm-flame`).
  i18n `questsFreezeRepairWhy` added, `questsFreezeRepair` (plural),
  `questsFreezeRepairTitle`, `questsFreezeRepairShort` reworded,
  `questsFreezeStreak` removed (11 locales).

- Streak flames drawn as art: a big lively flame and a small weak one
  (`assets/img/quests/streak-flame.webp`, `streak-flame-small.webp`, masters in
  `assets-src/img/quests/streak/`). "Current streak" shows the big flame (the
  small one, dimmed, at 0 days); "Relight the flame" goes from the small flame
  to the big one with the days on it, while a fireplace crackles (synthesised
  roar, wood pops and sparks, faded out when the window closes); the "Streak
  broken · Relight it" strip moved from the freezes card to the foot of the
  streak card, with the big flame, and the whole strip is one button that
  glows (a pulsing orange halo, a light sweep, the flame flickering; still
  under reduced motion) — the one chance to save the streak; its button reads
  "Relight the flame", and the fireplace starts crackling as soon as the
  pointer is on the strip, carrying on into the window (i18n
  `questsFreezeRepairShort` removed, 11 locales) (`renderer/quests/index.js` `.qd-flame`,
  `repairStripHtml`; `renderer/quests/freeze-modal.js`;
  `renderer/quests/coin-sound.js` `fireStart`; `renderer/quests/quests.css`
  `.qd-flame`, `.qf-repair-flame`, `.qfm-flame img`).

- Freezes to give melt as drawn art: five stages of the gift cube melting in
  place on the ground into its puddle, the orange ribbon always there
  (`assets/img/quests/freeze/freeze-melt-1.webp` … `-5.webp`, masters and the
  generated sheet in `assets-src/img/quests/freeze/melt/`), one per day before
  the next palier, replacing the CSS squash and puddle; stage 4 illustrates
  the melt rule in the ⓘ bubble, stage 5 the "nothing to give" window
  (`renderer/quests/index.js` `freezeCardHtml`, `freezeRuleHtml`;
  `renderer/quests/freeze-modal.js`; `renderer/quests/quests.css` `.qf-gift`).
  `freeze-melt.webp` is no longer used. With none to give, the row shows the
  gift cube as a dashed outline (same shape, ribbon and bow) instead of the
  plain empty cube (`assets/img/quests/freeze/freeze-gift-empty.webp`, master
  and generated source in `assets-src/img/quests/freeze/`).

- Finishing the day's set opens a "Daily set complete" window wherever you are
  (it used to be a small toast, or nothing when the Quests window was open):
  the closed chest trembles, bursts open with a flash, a shock ring and sparks
  while the open chest swells behind the window, the bonus XP counts up, then
  the streak flame takes its +1 with the combo and the palier bonus when one
  came at the same time (then no separate palier toast), the line "Daily set
  complete. Show-off." and a golden "Nice" button; reduced motion shows the
  end state (`renderer/quests/fullset-modal.js` new, `renderer/quests/index.js`
  `onDaily`, `renderer/quests/quests.css` `.qfs-*`, `docs/QUESTS.md`). i18n
  `questsFullSetOk` added (11 locales).

- Big moments in a modal window get the animation behind the window (one shared
  helper, `renderer/quests/coin-pull.js` `backfire`; `.bk-fire` in
  `renderer/quests/quests.css`): huge translucent copies of the moment's art
  swell and fade in waves on the overlay — the flame rising when the streak is
  relit, the TigerCoin when a friend's coins are collected, the open chest when
  the day's set is complete. Not on stages with
  no window (chest, reveals, secret envelope). Reduced motion: none.
  `.agents/rules/ui-ux-defaults.md` ("Big moments") points to the helper.

- The relight copy says what really happens: "As a Gold member of the
  TigerSquad, your broken streak comes back in full if you relight it today or
  tomorrow — once a month", and the button "Relight my 12-day streak" (i18n
  `questsFreezeRepairWhy` now a plain string, `questsFreezeRepair` reworded,
  11 locales).

- Relighting the flame gets a ceremony once the hold succeeds: embers are drawn
  into the small dead flame, it trembles and warms up, catches with a flash and
  a shock ring, the big flame bursts up and breathes, the card glows orange,
  the days come back one by one on a counter with a tick each, and embers keep
  rising, while huge translucent copies of the flame swell and fade in waves
  behind the window (the fire spreading); the badge floats; a click or ~4 s closes; reduced motion shows the
  end state. Sounds: a rising rush, a deep "fwoomp" with a warm chord, a tick
  per day, over the fireplace (`renderer/quests/freeze-modal.js` `relight`;
  `renderer/quests/coin-sound.js` `sfx.relightRise`, `relightIgnite`,
  `relightDay`; `renderer/quests/quests.css` `.qfm-relight`, `.qfm-rl-*`, `.qfm-rl-backfire`).

- Streak freezes card: the "0/3" counts after the cube rows are gone (the cubes
  say it), and "To give" is a plain row like "Mine" / "From friends", no dashed
  box (`renderer/quests/index.js` `freezeCardHtml`; `renderer/quests/quests.css`
  `.qf-row`, `.qf-strip--give`).

- Freeze and send windows opened on a friend (from the friends panel) scroll
  the friends row so that friend is in view, and keep the pick in view when the
  row is refreshed (`renderer/quests/coin-pull.js` `showPicked`,
  `renderer/quests/freeze-modal.js`, `renderer/quests/squad-deals.js`).

- Streak freezes: with none to give, the card says when the next batch comes
  as a delivery — "Delivery in 4 days", and on the last day the hours and
  minutes left before midnight ("Delivery in 20 h 47") — instead of "Next
  batch: 2 on day 5"; today's set still open counts as the first of the sets
  left (`renderer/quests/index.js` `freezeCardHtml` `deliveryText`). i18n
  `questsFreezeDeliveryDays`, `questsFreezeDeliveryHours` added,
  `questsFreezeNextGift` removed (11 locales).

- Streak-freeze windows (buy / give / repair) redone in the "Send TigerCoins"
  style: the friends who can receive in one horizontal row (search past 8;
  their free slots as small cubes; the one picked grows in gold, the others
  step back; a friend whose slots are all full, or who already got this
  palier's freeze, is left out and cannot be picked), the cube floating above
  the card and again right above the button (the gift cube when it goes to a
  friend), no text under the friends, one big golden button held 2 s — always pressable, a red bubble on what is missing — and no
  "Cancel" (a click outside or Escape closes). In the send window too, the
  friend picked now grows and the others dim (`renderer/quests/freeze-modal.js`,
  `renderer/quests/index.js` `errorTip`, `renderer/inventory.js` quests ctx
  `errorTip`, `renderer/quests/quests.css` `.qfm-hero`, `.qfm-line`, `.qfm-go`,
  `.tcs-f[aria-checked]`). i18n `questsFreezeUseHint`, `questsFreezeGiveRule`,
  `questsFreezeRepairHint`, `questsFreezeTheirReserve`, `questsFreezeOwnReserve`,
  `questsFreezeRepairsLeft`, `questsFreezePrice`, `questsFreezeBalance` removed
  (11 locales).

- Tiger Squad loot ladder: the four legendary devices (TigerScale, TigerSpool,
  Tiger Touch, TigerPOD) are clickable (mouse or keyboard) and open their
  ecosystem slideshow, like the header's device icons (`renderer/inventory.js`
  loot `eco` + a `[data-eco-open]` listener; `renderer/quests/index.js` tile;
  `renderer/quests/quests.css` `.qw-tile.is-eco`).

- A friend's envelope opens right where it is announced: the envelope window
  itself (the friend's avatar on the gold seal, turning with the envelope as
  it tilts toward the mouse; their message; "Open it"), and opening it pops
  the seal off, sends the envelope away and shows the coins received in the
  same window — instead of a "You got an envelope!" card that only led to the
  Deals view (that card stays as the fallback when the envelope is not in the
  pile) (`renderer/inventory.js` `_announceEnvelopeGifts`;
  `renderer/quests/squad-deals.js` `showEnvelope` `sealAvatar`, tilt on the
  whole envelope; `renderer/quests/quests.css` `.tch-env-seal`).
  i18n `envGiftSee`, `notifEnvelopeGiftText` reworded (11 locales).

- TigerCoins windows open at once on what is already known, then update in
  place: the history shows the log last read (Cache `coinlog` → localStorage
  `tigertag.coinlog.<id>`, 100 newest) and repaints only if the fresh read
  differs; the send window opens on the friends list and the last TigerCoins
  status (this session's or the cached one, `tigertag.header.<id>` now keeps
  the allowance too), the server's status and any friend profile still unread
  update it without losing the amount, the pick or the message. The friends
  cache keeps each friend's TigerSquad membership, so the members are listed
  from the first second; a friend whose profile was not read yet is read before
  the list is trusted (`_ensureFriendProfiles`) — opened right after launch the
  window no longer said "none of your friends is in the TigerSquad"
  (`renderer/inventory.js` `_coinLog`, `_sendCoinsTo`, `_cacheFriends`,
  `_paintDealsBadge`; `renderer/quests/squad-deals.js` `openCoinsHistory`,
  `showSendCoins` `fresh`; CLAUDE.md localStorage table).

- The header shows the account's last figures at once at launch — the stat
  cards (spools, stock, stock value, tiers) and the TigerCoins balance and
  envelopes — then moves only what the fresh data changes (the cards tween
  from the cached figure instead of rolling up from zero each launch; the
  stock value keeps its last figure until the prices arrive). One cache per
  account, `Cache` surface `header` → localStorage `tigertag.header.<id>`
  (listed in CLAUDE.md) (`renderer/inventory.js` `renderStats`,
  `_paintDealsBadge`, sign-in).

- "Send TigerCoins" window redesigned after a ChatGPT mockup
  (`assets-src/img/tigercoins/mockups/coins-send-mockup.png`): the friend
  picked shown big, the eligible friends (TigerSquad members) in one row with a
  search, the AMOUNT as the hero (a big embossed gold number beside the tiger
  coin, glow and light streak, quick picks 10 / 25 / 50 / 100 / Max), one line
  "Balance · left this week · tier", a REQUIRED message written on a paper
  card (140 characters, counter, centred, growing with the text), the friend
  picked only ringed in the row (the window never grows), and one big
  golden button held 2 s right under it — always pressable: pressed with
  something missing it does not hold, the part to fix shakes and a red bubble
  says what to do (pick a friend, an amount, a message) — no "Cancel" (a click outside or
  Escape closes); compact enough to fit the screen (~640 px, ~710 px once a
  friend is picked) ("Send
  50 TigerCoins to RP3D"); the fee is said only when there is one; nothing is
  repeated (`renderer/quests/squad-deals.js` `showSendCoins`,
  `renderer/quests/quests.css` `.tcs-*`). Backend (not deployed):
  `functions/tigerCoins.js` `sendCoins` refuses a transfer without a message
  (MESSAGE_REQUIRED). i18n `coinsSendBtn`, `coinsSendMsgLabel`,
  `coinsSendRequired`, `coinsSendMessagePh`, `coinsSendNeedMessage`,
  `coinsSendAvail`, `coinsSendNoMember` added; `coinsSendWeek`,
  `coinsSendQuota`, `coinsSendMessage`, `coinsSendAddNote` removed (11 locales).
- TigerCoins history: the "Earned" and "Spent" totals are gone and the
  balance is the hero of the window — a big embossed gold number beside the
  tiger coin, a warm glow, a light streak and twinkling sparks (after a
  ChatGPT mockup, `assets-src/img/tigercoins/mockups/coins-balance-mockup.png`),
  with a golden "Send" pill and the red envelope beside it that opens the send
  window (`coins-history-send-mockup.png`; ctx `sendCoins` in `_coinsCtx`)
  (`renderer/quests/squad-deals.js` `openCoinsHistory`,
  `renderer/quests/quests.css` `.tch-sum`, `.tch-bal*`).
  i18n `coinHistEarned`, `coinHistSpent` removed (11 locales).

- Daily Quests: buying a freeze is done by clicking an empty slot of "Mine"
  (members; a "+" shows on hover and keyboard focus) — it opens the buy window
  (for me / for a friend); the separate "Buy a freeze…" button is gone
  (`renderer/quests/index.js` `slotsHtml`, `freezeCardHtml`;
  `renderer/quests/quests.css` `.qf-slot-buy`).

- Daily Quests: freezes to give are shown as the gift cubes themselves,
  melting day after day until they are gone at the next palier (they sink,
  flatten, lose their shine and leave a growing puddle; the last days show the
  melted art) with "Melts in N d" and the Give button; with none, the tier's
  empty slots and when the next ones come — no more "0 to give"
  (`renderer/quests/index.js` `freezeCardHtml` `giveStrip`,
  `renderer/quests/quests.css` `.qf-strip--give`, `.qf-gift`).

- Daily Quests: once the full set is won, the chest card no longer adds
  "Earned · 5/5" under its XP (the check says it); the "Finish every quest ·
  3/5" line stays while it is locked (`renderer/quests/index.js`). i18n
  `questsChestEarned` removed (11 locales).

- Daily Quests: the streak freezes' rule moves from a paragraph into an ⓘ
  popover beside the "Streak freezes" title (hover or keyboard focus): the
  rule, then a table with one row per TigerSquad badge (its art) and the
  counts drawn as ice cubes — "My slots" (earned · received) and "To give"
  at each palier (no badge 1 · 1 · 1, Bronze 2 · 2 · 1, Silver 3 · 2 · 1, Gold and
  Platinum 3 · 3 · 2 — `FREEZE_CAPS`, the backend's FREEZE.caps); the
  member's own badge is highlighted, and a closing line says a freeze to
  give melts after 5 days if nobody gets it (`renderer/quests/index.js`
  `freezeRuleHtml`, `freezeCardHtml`; `renderer/quests/quests.css` `.qfp*`).
  i18n `questsFreezeCapsTitle`, `questsFreezeNoBadge` ("None"),
  `questsFreezeBadgeCol`, `questsFreezeSlotsCol`, `questsFreezeEarnedCol`,
  `questsFreezeReceivedCol`, `questsFreezeGiveCol`, `questsFreezeMeltRule`
  (11 locales).

- Daily Quests: a finished quest keeps its full progress bar and "1/1"
  (the row stays compact) — they were hidden (`renderer/quests/quests.css`
  `.qd-row.is-done`).

- "Later" on the requests' alert window (or a click outside it) now snoozes
  it: the window comes back 30 minutes later — or at the next launch — unless
  the conversation was opened meanwhile. The "My requests" hint says so
  (`renderer/report/index.js` `_showAlert`, `_snoozeTimer`; i18n
  `reportMineHint` reworded, 11 locales).

- The TigerCoins history shows an opened chest with its own art (open chest
  spilling coins, same style as the chest stage) instead of the red envelope:
  `assets/img/tigercoins/chest-open.webp` (master
  `assets-src/img/tigercoins/chest-open.png`, generated original
  `chest-open-source.png`), `renderer/quests/squad-deals.js` `ART.chest`.
- The feedback panel ("Raconte-nous tout !") is wider (470 → 540 px), so its
  three tabs and the request titles fit (`renderer/report/report.css`
  `.rep-panel`, `.rep-clip`).
- Tiger Quests, streak combo and freezes (`docs/QUESTS.md` §7; backend deployed
  2026-10-31): Daily Quests reworked after a ChatGPT review. Streak pips are
  full-size flames (the icon's flame fills only half its box: the mask is drawn
  at twice the pip and anchored at the bottom, the big flame too); the streak
  card shows "Combo ×n" from the first palier (×1), the next palier's real bonus and
  "Yesterday protected · Combo ×n kept" when a freeze was used. A "Streak
  freezes" card with the reserves as ice cubes (new art, 4 states:
  `assets/img/quests/freeze/freeze{,-empty,-gift,-melt}.webp`, masters and the
  generated sheet in `assets-src/img/quests/freeze/`, described in
  `docs/ART-DIRECTION.md`), a "to give · melts in n d" strip, a repair strip
  (Gold / Platinum), "Buy a freeze…". Buy, Give and Repair open windows on the
  "Give an envelope" frame (`renderer/quests/freeze-modal.js`): the situation
  first (reserve before → after, price, balance before → after, each friend's
  bonus slots, full or already-given friends greyed with why), then a 2 s held
  button; Give stays open while freezes are left. Quests left to do come
  first, done ones are shorter; rewards and stats fold under "Rules and
  stats". With nothing to give, the card still says so: "0 to give · Next
  batch: 2 on day 10" (the tier's count at the next palier, key
  `questsFreezeNextGift`). A missed day now takes a friends' bonus freeze
  first, then an own one, freeing that friend slot (backend `quests.js`,
  not deployed yet). Toasts for a freeze used (with the ice cube), a broken streak and
  each palier; a `freeze_gift` notification opening Tiger Quests
  (`freezeCardHtml`, `openFreeze`, `announceFreeze` in
  `renderer/quests/index.js`, `.qf-*` / `.qfm-*` / `.qd-frozen` / `.qd-more` in
  `quests.css`, `friend` in the quests ctx and `freeze_gift` in the
  notification center in `renderer/inventory.js`). Checked in the app against
  a faked `streakFreeze` (CDP): card, buy for me / a friend, give with the
  hold.

- Daily Quests streak card: the current week, Monday to Sunday, as seven pills
  (lit = full set, icy = bridged by a freeze, dashed = today still to play, dim =
  days to come) with the day initials, replacing the five flames toward the next
  palier. Read from the server's new `quests/daily.history` (last 14 days); an
  older doc is rebuilt from the streak and the last freeze bridge
  (`renderer/quests/index.js` `streakWeek`, `quests.css` `.qd-pip`). The combo
  badge now sits above the pills (`.qd-week`).

- Feedback card: requests drawn as pills like the spool cards — the kind's
  colour fills a full-height tile on the left with its icon large and white;
  topic tiles and the product chip use white icons too (`report.css`).

## Fixed

- Avatars without a photo keep their initials centred in the send and freeze
  windows' friends rows, on a friend's envelope seal and on the letter's
  stamp (they were pushed to the top-left): every one is now `userAvatar(…,
  "av-fill")` — one size class that fills its container — instead of other
  components' size classes patched with overrides (`renderer/css/10-settings.css`
  `.av-fill`, `renderer/inventory.js`, `renderer/quests/quests.css`;
  `.agents/rules/user-avatars.md` names it).

- A new account with nothing in it sees the header's cards (Spools, Stock,
  Stock value, TigerData… at 0) instead of an empty header; they hide only
  while the first snapshot loads or for an empty friend view
  (`renderer/inventory.js` `renderStats`).
- The header's TigerCoins card (balance, envelopes, gift) appears as soon as
  the account joins the TigerSquad — it was read only once, 6 s after sign-in —
  and hides on leaving
  (`renderer/inventory.js` `_refreshTopCoins`, `_paintDealsBadge`,
  `_setSupportPublicly`, `syncUserDoc`).

- Daily Quests: the week's pills light up for every day of the current
  streak even when the server's day history is empty or partial (an account
  whose streak began before the history was recorded showed every day dim) —
  the live streak fills the days the history lacks
  (`renderer/quests/index.js` `streakWeek`).

- Singular / plural follow each language's own rule: `t()` picks the form
  with `Intl.PluralRules` (one / few / many / other — Polish and Russian get
  their "few" and "many" forms, French says "1 coffre"), falling back to one /
  other. The TigerCoins history and a few texts now have real plural forms:
  `coinLog_chest`, `coinLog_surprises`, `coinLog_chests`, `questsStreak`,
  `squadDealsClaimDays`, `coinsSendErrRecent`, `questsFreezeSlotsFree`
  ("1 libre", "3 libres" in the freeze window) (11 locales)
  (`renderer/inventory.js` `t`).
- A spool already linked to its own maker chips (Bambu Lab, Creality…) is no
  longer offered "Link the N proprietary third-party Tags" when other maker
  chips sit on the TigerPOD, and it is greyed in Grouped spools while they
  wait, so the chips go to one of the others (`renderer/inventory.js` spool
  card banner, `_createGroupMemberCard`, `_refreshChipBanners`;
  `renderer/css/70-detail-misc.css` `.gp-member--linked`).

- **Feedback panel topic cards lose the thin colour stripe on their left edge** — left over from the muted-tile design, it showed as a seam beside the now colour-filled tile. `renderer/report/report.css` (`.rep-kind-card`).
- The "Turn on debug mode" quest only counted at the next launch: the debug
  switch in the account window now records it the moment it is turned on
  (`questGauge("debugMode", 1)` in the `eacDebugToggle` handler,
  `renderer/inventory.js`).
- Klipper with an AFC unit that lists each lane twice (`AFC_stepper CANVAS_1`
  and `AFC_lane CANVAS_1` — a CANVAS on an Elegoo CC1 running OpenCentauri
  COSMOS) showed every filament twice, 8 slots for 4 lanes (issue 167): one
  slot per lane name now, read from the `AFC_lane` object when there is one
  (`f.afcLanes` / `f.afcObjs` in `renderer/printers/klipper/core.js`,
  `PROTOCOL.md` §7d).

## Removed

## i18n
- `coinsSendTitle`, `coinsSendSub`, `coinsSendQuota`, `coinsSendAmount`,
  `coinsSendMax`, `coinsSendMessage`, `coinsSendFee`, `coinsSendGets`,
  `coinsSendWeek`, `coinsSendPickAmount`, `coinsSendErrLimit`,
  `coinsSendErrRecent`, `coinsSendNotMember`, `coinsSendGo`, `coinsSendDone`,
  `coinLog_sent`, `coinLog_freeze`, `coinLog_freezeFor`, `coinLog_fee`,
  `questsFreezeNextGift` added (11 locales).
- `questsComboBadge`, `questsComboDone`, `questsFreezeSaved`,
  `questsFreezeSavedText`, `questsStreakBroken`, `questsStreakBrokenText`,
  `questsFreezeTitle`, `questsFreezeOwn`, `questsFreezeBonus`,
  `questsFreezeHint`, `questsFreezeToGive`, `questsFreezeFriends`,
  `questsFreezeBuy`, `questsFreezeRepair`, `questsFreezeGiveTo`,
  `questsFreezeBuyFor`, `questsFreezeFull`, `questsFreezeGiven`,
  `questsFreezeNoFriends`, `questsFreezeErr*` (8), `notifFreezeGift`,
  `notifFreezeGiftText` added (11 locales).
- `reportAttachPrinter`, `reportAttachPrinterNote` added (11 locales).
- `reportMineOpenThread`, `reportMineNewReply`, `reportThreadYou`,
  `reportThreadTeam`, `reportThreadLoading`, `reportThreadError`,
  `reportThreadEmpty`, `reportThreadClosedByYou`, `reportThreadImage`,
  `reportReplyPh`, `reportReplyAttach`, `reportReplyPublic`, `reportReplySend`,
  `reportReplySending`, `reportReplyClosed`, `reportReplyErrClosed`,
  `reportReplyErrTooMany`, `reportReplyMaxImages`, `reportAlertTitle`,
  `reportAlertText`, `reportAlertReply`, `reportAlertOpen`, `reportAlertLater`
  added; `reportMineHint` reworded (11 locales).
- `reportTabAll`, `reportAllOpen`, `reportAllEverything`, `reportAllEmpty`,
  `reportAllYours`, `reportThreadReporter`, `reportThreadMaster`,
  `reportTeamReplyPublic`, `reportTeamDone`, `reportTeamDecline`,
  `reportTeamConfirm` added; `reportReplyAttach`, `reportReplyMaxImages`
  removed (11 locales).
