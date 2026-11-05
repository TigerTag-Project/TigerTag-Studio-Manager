# Worklog — v2.51.0 (in progress)

## Added

- Invite a friend banner: every envelope wiggles when clicked, and the middle one of the
  right-hand pile hides a new easter egg `inviteBanner` (three quick clicks, one common
  envelope, once per account). `renderer/quests/referrals.js` (`inviteScene`, `tapEgg`),
  `renderer/quests/referrals.css`, `renderer/inventory.js` (referrals ctx gets `easterEgg` /
  `eggFound` / `toast`), `.agents/rules/easter-eggs.md`; backend `functions/tigerCoins.js` `EGGS`
  (deploy pending).

- Delete my account, from Studio: a "Delete my account" row at the bottom of
  the account window's Sign-in section opens a window (laid out with ChatGPT,
  new art `tigersquad/squad-notice/tiger-goodbye`: the tiger leaving with his
  box) listing what will be deleted, then two steps: 1. confirm it is you
  (password, or Google once more), 2. type the confirm word of the user's
  language (SUPPRIMER, DELETE, LÖSCHEN…); only then the red button arms, held
  2.5 s. It calls the backend `deleteMyAccount` (the same full wipe as the
  admin's, sign-in under 5 min, admin accounts refused), which now answers at
  once: the sign-in is disabled, the wipe runs in the background (backend
  `accountDeletionRun` on `accountDeletions/{uid}`, retried until every step
  went through; deployed); Studio removes the account from this computer right away (`_openDeleteAccount`, `_reauthForDelete`,
  `#eacDeleteAccountBtn`, `.eac-delete-*` in `renderer/css/60-modals.css`).
  i18n: `eacDeleteAccount`, `eacDeleteAccountBtn`, `eacDeleteTitle`,
  `eacDeleteDesc`, `eacDeleteLostTitle`,
  `eacDeleteLost_inventory|friends|squad|lists|login`, `eacDeleteRecreate`,
  `eacDeleteStepVerify`, `eacDeleteVerifyGoogle`, `eacDeleteVerifyBtn`,
  `eacDeleteVerified`, `eacDeleteArmHint`, `eacDeleteKeep`, `eacDeleteHold`,
  `eacDeleteWord`, `eacDeleteTypeWord`, `eacDeleteNeedPassword`,
  `eacDeleteNeedVerify`, `eacDeleteWorking`, `eacDeleteDone`,
  `eacDeleteAdmin`, `eacDeleteFailed` (11 locales).

- Klipper: a Happy Hare gate or an AFC lane in the Filament card opens the
  printers' filament sheet (material chips, colour palette, Apply) and is
  written with the machine's own macro (`MMU_GATE_MAP` / `SET_MATERIAL` +
  `SET_COLOR`), then re-read (`renderer/printers/klipper/filament-edit.js`,
  `cards.js`, `plugin.js`, `klipper.css`, `PROTOCOL.md`).
- Demo printers: the Klipper demo also serves Moonraker's WebSocket
  `/websocket` (JSON-RPC 2.0: identify with the API key, objects list / query /
  subscribe, gcode script, `notify_proc_stat_update` every second) on its HTTP
  address, for the TigerSpool and the Tiger Touch; the Voron 2.4 (model 2) plays
  Klipper + Happy Hare with a 4-gate ERCF (`mmu`, `MMU_GATE_MAP`);
  `services/demo/faces/klipper.js`, `services/demo/shapes.js`.
- Demo printers of a model we filmed show that real printer's camera while not
  printing: ~3 s clips recorded with Studio's camera recording (A1, Ender-3 V4,
  Centauri Carbon 2, U1, Kobra X) looped, stills for the X1C and AD5X
  (`services/demo/idle/`, `library.js` `IDLE_PHOTOS`, `index.js`;
  `package.json` `asarUnpack`).

## Changed

- TigerSquad League: a click on a country of "Ligue des pays" shows that country's league in
  the middle column (its top from `squadBoard/nat_<CC>`, one read, kept 2 min); the picked
  country wears the selected look, a click on your own country goes back. Enter / Space too.
  `renderer/quests/squad-rankings.js` (`pickLeague`, `ctx.natOf`), `renderer/inventory.js`
  (`_squadNatCache`, rankings ctx + click / keydown), `renderer/quests/quests.css`
  (`.sqr-row--pick`).
- Account modal, Ligue des pays: the dropdown is replaced by the current flag and a "Change"
  button (hidden while the flag is locked) that opens a window (openDialog): the tiger holding a
  globe on top (`assets/img/tigersquad/squad-notice/tiger-globe-*.webp`, master
  `assets-src/img/tigersquad/squad-notice/tiger-globe.png`, art ladder), "Your current country" pinned, a search, every country as a round-flag tile in two columns
  (no visible scrollbar, a bottom fade), the 30-day lock card, then "Join the <country> league"
  held 1.5 s like giving an envelope (`holdToFire`: strains, glows, fills; a click shakes "no")
  and "Keep my flag". Nothing is written before the hold completes. `renderer/inventory.html`
  (`#eacSquadCountryCur`, `#eacSquadCountryBtn`), `renderer/inventory.js`
  (`_openSquadCountryPicker`, `_squadCountryOptions`), `renderer/css/60-modals.css`
  (`.eac-country`, `.eac-cpick-*`); keys `squadCountryChange`, `squadCountryPickTitle`,
  `squadCountryPickSub`, `squadCountryCurrent`, `squadCountrySearch`, `squadCountryDetected`,
  `squadCountryLockTitle`, `squadCountryPickWarn`, `squadCountryConfirm`, `squadCountryPickNone`,
  `squadCountryKeep` in 11 locales.

- Spool details, Duplicate: refused on a spool with no container — pressing it opens the
  container picker and the red help bubble (`_showErrorTip`, `#toolInfoPop`) points at its
  search: `toolDuplicateNeedContainer` "Choose a container" (the copies would carry a wrong tare).
  `renderer/inventory.js` (pointerdown guard before `setupHoldToConfirm` on `#btnToolDuplicate`),
  i18n key in 11 locales, `docs/i18n-keys.md`.

- Invite view redone (ChatGPT mockup A): every network at once as icon-only
  brand buttons (the name as aria-label), with WeChat, Messenger, LINE, KakaoTalk, VK and
  SMS added ("Other networks" and the "Show the message" folds gone), "Copy my
  link" joined to the link field in one bar (`.rf-link-bar`), the message shown
  under the grid with a copy icon; the orange "My code" card from the link bar
  down to the message (the title sits above both, `.rf-share-body`); "How it works" and the three steps
  right under the banner (step 1 "Share your link / Or send your code", step 2
  "Through the link, the code is already filled in"), before the sharing, the steps drawn as a metro line (one line, three numbered stations, each step under its stop, `.rf-stop`); "Copy my link" keeps its width when it turns into "Link copied!" (both labels stacked, `.rf-copy-lbls`); "Your invitations" a table (friend, joined, account
  created, e-mail confirmed, envelopes received: an orange check, a dash while
  waiting, a red cross once expired, the words kept as aria-labels).
  Discord, WeChat, Messenger and KakaoTalk copy the message (no desktop share
  URL). `renderer/quests/referrals.js` (`NETS`, `COPY_NETS`, `inviteeRow`),
  `renderer/quests/referrals.css`, `renderer/inventory.js` (`_socialShareUrl`:
  line, vk, sms), `main.js` (`isSafeExternalUrl` allows `mailto:` and `sms:`, so
  E-mail and SMS open), logos `assets/svg/logos/logo_{wechat,messenger,line,kakaotalk,vk}.svg`
  (Simple Icons, CC0), `docs/REFERRALS.md`.

- "My code" card drawn by one helper everywhere, `myCodeCardHtml`
  (`renderer/quests/ui-kit.js`): the Friends panel (`#fpMyCode`, rendered in
  `renderFriendsSection`, clicks delegated) and the Invite view use the same
  markup — QR (click = enlarge, `showInviteQr`), label + code, New code icon,
  two buttons (Friends: Share link | Invite friends; Invite view: Share link |
  Download). `regeneratePublicKey` shows its loading state on every card.
- Invite view: the QR column becomes the orange "My code" card
  (`.rf-mycode`): the QR (click = enlarge) beside "My code" and the code,
  "Share link" | "Download" under them, "New code" as the corner icon.
  "New code" (here and in the Friends card) is confirmed in a window first
  (`_confirmRegenPublicKey`, `openDialog`), then both cards show the new code
  (`refreshReferrals`). The enlarged QR window takes the card's QR
  look: a dark frame with round corners (`.rf-qr-xl`). The
  "Or share your code" line goes (the code is in the card); its note stays under
  the share options (`.rf-code-note`). Dead `.rf-qr*` / `.rf-code-*` rules removed.
  `renderer/quests/referrals.js` (`renderInviteView`), `renderer/quests/referrals.css`.

- Easter eggs: finding a hidden envelope plays the "Secret found!" moment and
  puts the envelope in the pile, without opening the pile right after; it is
  opened later like any other. `renderer/quests/squad-deals.js` (`tapEgg`),
  `renderer/inventory.js` (both `easterEgg` ctx no longer return `open`),
  `renderer/quests/coin-pull.js` comment, `.agents/rules/easter-eggs.md`.

- Friends card, "My code" redone compact: the QR on the left, the label and
  the code on the right (`.fp-hero-top`, the code's size follows the card width),
  "New code" a round refresh icon in the top-right corner (`.fp-hero-regen`,
  aria-label `regenLabel`, turns on hover), "Share link" and "Invite friends" two
  equal buttons side by side, one line each, stacked when the card is under
  300 px (container query). The action rows below are unchanged. `renderer/inventory.html`
  (`#btnRegenPublicKey`), `renderer/css/20-friends.css`.
- Friends cards: the app behind them is no longer darkened; a click outside
  still closes them (`#friendsOverlay` transparent, `renderer/css/20-friends.css`).

- Container picker and Spool details: hovering a container photo shows it at
  220 px beside it, the same hover preview as the table thumbnails, shown whole
  on the card surface (`.thumb-zoom--whole`). `renderer/inventory.js`
  (`_showThumbZoom`, picker rows and the `.cc-body` photo get `data-zoom`),
  `renderer/css/70-detail-misc.css`.
- Treasure hunt album: the "Locked" tab splits in two — "With a hint" (the
  silhouette, name and mission show) and "Hidden" (the "?" ones), each with
  its count (`renderer/quests/trophies.js` `hasHint`, `isHidden`, filters
  `hint` / `hidden`). i18n: `trophyFilter_hint`, `trophyFilter_hidden` added,
  `trophyFilter_locked` removed (11 locales).
- A sticker still to win that shows a hint opens its card too: its silhouette,
  its mission and "Seen at <friend>'s" when a friend revealed it — no gloss,
  no download (`openTrophyCard`, `.trp-card-art.is-locked`); hidden "?" ones
  stay shut. A sticker still to win shows the catalogue's silhouette as it is
  (black shape in its white sticker border, as in a friend's album), no longer
  dimmed to a faint shadow, and as big as a sticker held
  (`renderer/quests/trophies.css` `.is-locked`). "Seen at <friend>'s" shows only in the card, with that friend's avatar
  (`userAvatar`, ctx `friendAvatar`, `.trp-seen-av`, 32 px, not clipped so the
  TigerSquad ring and badge show as in the friends bar); the tile keeps the tier.

- Treasure hunt: every sticker says how many tigers own it ("Owned by n % of
  tigers", its info bubble and its card) — the ones still to win and the
  hidden "?" too (0 % when nobody does). A veiled slot of the catalogue carries
  an opaque key `o` (backend `tool/trophy-art.mjs` `slotKey`, catalogue
  rebuilt); Studio matches it against the ids it holds (`slotKey`, `mapSlots`,
  `statId` in `renderer/quests/trophies.js`), so a held or revealed veiled
  trophy also lands in its own slot. Backend catalogue deployed (hosting:cdn).
- TigerSquad Countries League: the flag moves at most once every 30 days
  (the first flag and the first change are free), so no one hops to a small
  country for its lead. Enforced by the server where the flag is published
  (backend `squadLock.js` `lockedCountry`, `publishSupporter`,
  `userProfiles.tigerSquad.countryAt`, tests); the account window greys the
  picker with the date it opens again (`_fillSquadCountry`,
  `#eacSquadCountryHint`, `.csel-btn:disabled`; a disabled `<select>` now
  disables its custom dropdown). i18n: `squadCountryLockHint`,
  `squadCountryLockedUntil` (11 locales). Backend deployed (publishSupporter).

- Referrals: the friend-invite page (TigerHub) now creates the account and
  records the referrer itself; documented in `docs/REFERRALS.md` ("Sign up on
  the page"). Backend `versionGate.js` lets the Hub's calls through
  (`client=hub`); `referrals` redeployed 2026-11-03.
- Referrals: every invite link Studio shares is now the referral tunnel
  `tigersystem.io/join/<code>` (TigerHub) instead of the friend page: the
  Invite view (`initReferrals` `inviteUrl`), the Friends panel's "Share link"
  and QR code, and the friend-view banner's Share button (`_joinShareUrl`;
  `_friendShareUrl` removed). The tunnel sends an existing account on to
  `/friend/<code>`.

## Fixed

- TigerSquad League, "View all": the full list now scrolls inside the same card, which keeps
  the height of the other columns (opening one dropped the two others to 5 rows).
  `renderer/quests/squad-rankings.js` (`column`, `.is-open` + `--n`), `renderer/quests/quests.css`.

- Friends card back to its intended width (420 px, 92 vw at most) instead of
  300 px: `.detail-panel { width: 300px }`, loaded later, won over
  `.friends-panel`; now a doubled class. `renderer/css/20-friends.css`.

- Friends card on a short window: the code card no longer shrinks (its QR and
  Share / Invite / New code buttons were cut); the card's column scrolls
  instead. `renderer/css/20-friends.css` (`#friendsPanel .friends-body`).

- Demo printers take a filament write the way the real machine does and show
  it on the next read, from Studio or a TigerSpool: FlashForge `/checkCode`
  login; Snapmaker vendor + sub-type kept; Anycubic reports on
  `…/<family>/report`; Creality vendor and external holder kept; Elegoo CC2
  brand / name / temperatures kept and the new canvas pushed to every client
  (6000); Bambu `tray_info_idx` and nozzle temperatures echoed; a slot a client
  wrote is no longer re-drawn by the next print (`services/demo/engine.js`,
  `faces/*.js`; tests `scripts/test-demo-klipper-ws.mjs`,
  `scripts/test-demo-filament-writes.mjs`; `docs/DEMO-MODE.md`).
- Treasure hunt in a friend's view: a filter (All / Earned / With a hint /
  Hidden, family) showed your own stickers instead of the friend's — it
  re-rendered without the friend (`renderTrophiesView(host, friend)`).
- Friends panel: the code card's three buttons (Share link, Invite friends,
  New code) spilled out of the card; icon over a centred label, a third of
  the row each (`renderer/css/20-friends.css` `.fp-hero-btn`).
- "Give an envelope": one window everywhere. The envelopes' opening stage
  ("Give to a friend") opened an older copy without the fanned hand of
  envelopes; both it and the Friends panel now build the window from
  `_giveOptions` (`renderer/inventory.js`: pile, friends, several at once).
- Backend (deployed): `streakFreeze` status reads the friends' tier and bonus
  in two field-masked `getAll` (was 2 full docs per friend); `squadDeal` list
  reads the profile and the deals in parallel, the deals cached 1 min per
  instance (cleared on a claim); `myReports` reads an issue on GitHub at most
  every 2 min (15 min once closed) per instance. Warm calls: requests ~430 →
  ~210 ms, freezes ~315 → ~250 ms, deals ~400 → ~360 ms.

## Removed

## i18n

- Added `referralHowTitle`, `referralColFriend`, `referralColDate`,
  `referralColAccount`, `referralColEmail`, `referralColEnvelopes`,
  `referralCellYes`, `referralCellWaiting`, `referralAppCopied` (11 locales).
- Reworded `referralStep1`, `referralStep1Sub`, `referralStep2Sub` (11 locales).
- Removed `referralShareVia`, `referralMore`, `referralLess`, `referralMsgShow`,
  `referralMsgHide`, `referralCodeInLink`, `referralDiscordCopy`,
  `referralDiscordCopied`, `referralRowValidated`, `referralRowPending`,
  `referralRowExpired` (11 locales).

- Added `regenConfirmTitle`, `regenConfirmText` (11 locales): the "New code" confirmation.

- Removed `referralOrCode`, `referralCopyCode` (11 locales): the Invite view shows the code in its card, with Share link.
