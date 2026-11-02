# Trophies — design (validated 2026-11-01, recommended choices)

Collectible trophies, in the spirit of console trophies: a sticker earned for an exclusive action
or moment (relighting the flame, opening a chest, a freeze from a friend…) or for being somewhere
(Christmas 2026, 3D Print Lyon, Formnext). The collection slowly gathers every piece of the app's
art, like a sticker album to fill.

Validated by the founder on 2026-11-01 with the recommended choice for every open point (R1–R5,
marked **✅** below).

## 0. Principles

- **Server-written only.** A trophy is a document the client cannot write: no account can grant
  itself one. The Cloud Functions that already run the action award it, in the same transaction
  when they have one.
- **A memory, not a currency.** XP is the progress ladder (achievements, quests); trophies are the
  record of moments. Most trophies mirror something that already pays XP, so by default they pay
  nothing (§5).
- **Two families.** *Action trophies* are defined in code (a rule table, like `xpRules.js`) and
  ship with the app's art. *Event trophies* are data: created in the Hub admin, each with its own
  art and year, earned only with a code `XXXX-XXXX-XXXX`.
- **Earned once, kept for good.** A trophy never goes away, even if what earned it does (a friend
  removed, a device unpaired).

## 1. Rarity

Two separate things, both shown:

1. **Rarity tier — fixed by design**, the frame colour of the sticker. The app's existing scale
   (TigerCoins draws, XP achievements), same five colours:
   common · uncommon · rare · epic · legendary — plus **event**, a sixth frame (holographic) for
   event trophies, which are exclusive by nature.
2. **Owned by n % of accounts — live**, like PSN. Shown under the sticker ("Owned by 3.2 % of
   tigers"). Computed from `trophyStats/{id}.owners` ÷ `trophyStats/_accounts.accounts` (§3).

**✅ R1** — The tier stays fixed (a sticker never changes colour) and the % is information only.
Rejected: deriving the tier from the % (a trophy would change frame, and a new one has no meaningful
% on day one).

## 2. Catalogue — action trophies (first batch)

**The tier of a Workshop loot or feat trophy is that item's rarity** (founder, 2026-11-01): the one
the Workshop shows, from its XP (`RARITIES` in `renderer/quests/index.js`: legendary ≥ 800, epic ≥ 300,
rare ≥ 100, uncommon ≥ 20, else common) — TigerScale / Spool / Touch / POD legendary, mobile app and
TD1S epic, USB scale, RFID reader, a first chest and the TigerSquad rare, a first printer / rack /
list, TigerTag+ Certified and an update uncommon, TigerTag and TigerTag+ common. The source of truth
is `functions/trophyRules.js` (mirrored in `renderer/quests/trophies.js`); the tables below give the
idea, the code wins.

`id` is stable (never renamed: it is the doc id). *Hidden* = shown as "?" until earned, the
condition stays secret (console "hidden trophies"). Art = existing asset first; **new** = to
generate (`docs/ART-DIRECTION.md`, shown before integration).

### 2.1 The flame and the freezes (Tiger Quests streak, `docs/QUESTS.md` §7)

| id | Name (en) | Condition | Tier | Art |
|---|---|---|---|---|
| `firstFlame` | First spark | First full daily set | common | `quests/streak-flame-small.webp` |
| `streak7` | A week on fire | Best streak ≥ 7 | uncommon | `quests/streak-flame.webp` |
| `streak30` | Eternal flame | Best streak ≥ 30 | rare | flame, orange variant **new** |
| `streak100` | Hundred-day blaze | Best streak ≥ 100 | epic | flame, violet **new** |
| `streak365` | One year, every day | Best streak ≥ 365 | legendary | flame, gold **new** |
| `freezeSaved` | Saved by the ice | A freeze bridged a missed day | common | `quests/freeze/freeze.webp` |
| `freezeSent` | Cool gift | Give (or buy) a freeze for a friend | common | `quests/freeze/freeze-gift.webp` |
| `freezeReceived` | Ice delivery | Receive a freeze from a friend | common | `quests/freeze/freeze-gift-empty.webp` |
| `freezeMelted` | Let it melt | A freeze to give melted, ungiven (hidden) | uncommon | `quests/freeze/freeze-melt-5.webp` |
| `flameRelit` | Relight the flame | Mend a broken streak (repair) | rare | relit flame — the art of the "Relight the flame" animation (other session) |
| `comboMax` | Max combo | Reach combo ×5 | epic | flame + ×5 **new** |

### 2.2 TigerCoins (`functions/tigerCoins.js`)

| id | Name (en) | Condition | Tier | Art |
|---|---|---|---|---|
| `firstEnvelope` | Paper cut | Open a first envelope | common | `tigercoins/envelope.webp` |
| `firstChest` | Treasure! | Open a first chest | uncommon | `tigercoins/chest-open.webp` |
| `chests10` | Chest collector | Open 10 chests | rare | `tigercoins/chest/closed.webp` |
| `chests50` | Pirate tiger | Open 50 chests | epic | chest stack **new** |
| `envelopeSent` | Special delivery | Give an envelope or send coins to a friend | common | `tigercoins/gift-v2.webp` |
| `envelopeReceived` | You've got mail | Receive an envelope from a friend | common | `tigercoins/envelope.webp` (sealed variant **new**) |
| `legendaryPull` | Jackpot | Draw a legendary envelope (500 coins) (hidden) | legendary | `tigercoins/crown.webp` |
| `luckiest` | Luckiest tiger | First place on a shared red envelope (hidden) | epic | red envelope **new** |
| `firstCode` | Secret word | Redeem a first gift code | common | `tigercoins/code-chest.webp` |
| `firstEgg` | Curious cat | Find a first hidden envelope (easter egg) (hidden) | uncommon | `tigercoins/code-tiger.webp` |
| `allEggs` | Treasure hunter | Find every easter egg of `EGGS` (hidden) | epic | **new** |
| `firstDeal` | Big spender | Spend TigerCoins on a deal | uncommon | `tigersquad/deals-partner.webp` |
| `stickerFan` / `stickerBook` / `curator` | Sticker fan / Sticker book / Curator | Download 5 / 15 / 30 different stickers from the album (hidden; the card's "Download the sticker", counted once each server-side in `users/{uid}/trophyDownloads`) | uncommon / rare / epic | placeholders |
| `coinsSent100/1000/10000` | Robin Hood / Make it rain / The Great Gatsby | TigerCoins sent to friends, all told | uncommon / epic / legendary | coin |
| `coinsRecv100/1000/10000` | Maneki-neko / Scrooge's dive / Smaug's hoard | TigerCoins received from friends, all told | uncommon / epic / legendary | coin |
| `envSent10/50/100` | Postman Pat / Hedwig / Santa's sleigh | Envelopes sent (given or coins) | uncommon / rare / epic | gift |
| `envRecv10/50/100` | Fan mail / Letters from Hogwarts / Message in a Bottle | Envelopes received | uncommon / rare / epic | envelope |
| `freezeSent5/25/100` | Let it go / Sub-Zero / Mr. Freeze | Freezes given or bought for friends | uncommon / rare / epic | freeze gift |
| `freezeRecv5/25/100` | Ice Ice Baby / Winter is coming / Fortress of Solitude | Freezes received | uncommon / rare / epic | freeze |
| `tweet140` | Old-school tweet | TigerCoins sent with a message of the full 140 characters (hidden) | rare | envelope |

| `cert_<brand>_1/10/50/100` | "<Brand> — first chip" / "<Brand> fan" / "<Brand> collector" / "<Brand> legend" | Certified TigerTag+ chips of a brand selling them: Rosa3D, eSun, Sunlu, Jamg He, R3D, Landu, Lotactree, Smart3DPT (`BRAND_TROPHIES`, ids from `id_brand.json`) | uncommon / rare / epic / legendary | the brand's logo redrawn in the house style, alone at 1, a themed object behind it at 10 / 50 / 100 |

The brand trophies are state trophies: `countedChips/{uid}.brand` (the certified chip's brand, decoded
by `chipValue`) counted by brand on every recompute (one count query per brand). Chips recorded
before 2026-11-01 get their brand at the account's next full recount (`XP_COUNT_VERSION` 3, asked by
Studio once).

The tier trophies are pop-culture references (founder, 2026-11-01), named per locale with the
local title of the reference. Their running totals live in `users/{uid}/trophyCounters/main`
(server-only, `trophies.js` `bump`), counted from 2026-11-01; the past can be back-filled from
`coinLog` on an explicit go.

| `tigerMaster` | TigerMaster | Be a TigerMaster (`users/{uid}.roles` "tigermaster", or "admin"), state trophy | legendary | gold shield, paw, crown |
| `timeMaster` | Master of time | Turn the XP history banner's hourglass over 50 times within 30 s (hidden; the app reports it, `tigerCoins` `secretTrophy`, every account) | epic | `quests/xph-hero/hourglass.webp` |

### 2.3 TigerSquad and community

| id | Name (en) | Condition | Tier | Art |
|---|---|---|---|---|
| `squadJoin` | Welcome to the Squad | Join the TigerSquad | uncommon | `tigersquad/tigersquad-bronze.webp` |
| `squadSilver` / `squadGold` / `squadPlatinum` | Silver / Gold / Platinum tiger | Reach that tier | rare / epic / legendary | `tigersquad/tigersquad-{silver,gold,platinum}.webp` |
| `firstFriend` | Pack animal | First friend | common | `tigersquad/feats/friends.webp` |
| `friends10` | The whole pack | 10 friends | rare | friends, crowded variant **new** |
| `allLinks` | Explorer | Open every community link of the sidebar | uncommon | `tigersquad/feats/community.webp` |
| `podium` | On the podium | Top 3 of the world League (7 rolling days) at a daily ranking | epic | `tigersquad/rank-medal-3.webp` |
| `countryFirst` | Local legend | First of one's country at a daily ranking | rare | `tigersquad/rank-medal-1.webp` |
| `worldFirst` | Top of the world | First in the world at a daily ranking | legendary | `tigersquad/league-hero/trophy.webp` |
| `photo` / `social` / `firstLink` | Say cheese / Social butterfly / Say hi | A profile photo / a social network / a first community link | common | `tigersquad/feats/{photo,social,community}.webp` |
| `referral1` / `referral5` / `referral10` | Plus one / Squad goals / Recruiter | 1 / 5 / 10 validated referrals (`docs/REFERRALS.md`, counter `referrals`) | common / rare / epic | placeholders, stickers **new** |
| `referral25` / `referral50` (hidden) | Influencer, apparently / Friendly cult leader | 25 / 50 validated referrals | epic / legendary | placeholders, stickers **new** |
| `invited` | Came with a friend | Joined through a friend's invite, e-mail verified | common | placeholder, sticker **new** |
| `communityXp1M` / `communityXp5M` | One million roar / Five million roar | In the TigerSquad when the community's XP (`publicStats/community.xpTotal`) passed 1 / 5 million | epic | `trophies/stickers/communityXp{1M,5M}.webp` |
| `communityXp10M` / `communityXp15M` | Ten million roar / Fifteen million roar | Same at 10 / 15 million | legendary | `trophies/stickers/communityXp{10M,15M}.webp` |
| `communityXpTrio` (hidden) | 3 × 5 = 15 | Hold the 5, 10 and 15 million stickers | legendary | `trophies/stickers/communityXpTrio.webp` |
| `communityPrinters5k` / `communityPrinters10k` | 5,000 printers / 10,000 printers | In the TigerSquad when the community's printers (`printers.total`) passed 5,000 / 10,000 | epic / legendary | `trophies/stickers/communityPrinters{5k,10k}.webp` |

**Community milestones** (backend `communityMilestones.js`, run by `communityStats` every minute):
when a total crosses a mark, the minute is recorded in `statsInternal/communityMilestones`
(server-only) and every account whose `userProfiles/{uid}.tigerSquad.since` is at or before it gets
the trophy, 300 members a minute. A member who joins later never gets it: the sticker marks the
moment. The trio comes with the 5, 10 or 15 million sticker that completes the set.

### 2.4 The Tiger devices (legendary)

| id | Name (en) | Condition | Tier | Art |
|---|---|---|---|---|
| `tigerScale` / `tigerSpool` / `tigerTouch` / `tigerPod` | — | First pairing of that device | epic | `tigersquad/legendary/*-flat*.webp` |
| `fullKit` | The full kit | All four devices owned at once | legendary | `tigersquad/legendary/tiger-front.webp` + the four **new** composite |

### 2.5 The chips

| id | Name (en) | Condition | Tier | Art |
|---|---|---|---|---|
| `chipTag` / `chipPlus` / `chipCert` | TigerTag / TigerTag+ / TigerTag+ Certified (product names, never translated) | A first chip of that type | common / uncommon / rare | `tigersquad/loot/chip.webp`, `chip-cert.webp` |
| `certified50` | Certified hoarder | 50 certified TigerTag+ chips | rare | `tigersquad/loot/chip-cert.webp` |

### 2.6 The workshop

| id | Name (en) | Condition | Tier | Art |
|---|---|---|---|---|
| `firstPrinter` / `firstRack` / `firstList` | Printer tamer / Tidy tiger / List maker | A first printer, rack, list | common | `loot/printer`, `feats/first-rack`, `feats/first-list` |
| `rfidReader` / `usbScale` / `mobileApp` | Mind reader / Heavyweight / Pocket tiger | An RFID reader, a USB scale, Tiger NFC Connect | uncommon | `loot/rfid-reader`, `loot/usb-scale`, `feats/mobile-app` |
| `td1s` | TD1S | A TD1S sensor | rare | `loot/td1s` |
| `appUpdate` / `speedrun` | Fresh install / Speedrun | An update installed / within 3 days of its release | common / uncommon | `notifications/update`, `feats/speedrun` |

**Every loot and feat of the Workshop has its trophy** (founder, 2026-11-01): each XP item of
`ACH_XP`, the three chip types, the TigerSquad and the update bonuses.

110 trophies to start (78 + 32 brand); the table lives in code (`functions/trophyRules.js`), so adding one
later is one row + one award call + its i18n keys.

## 3. Data (backend `TigerTag_Firebase_Backend`)

```
users/{uid}/trophies/{trophyId}   { earnedAt, source, event?, ctx? }      owner + accepted friends read · server write
trophyStats/{trophyId}            { owners }                              signed-in read · server write
trophyEvents/{eventId}            { name: {11 locales}, desc: {…}, art,   signed-in read · admin write (Hub)
                                    year, date, kind: "season"|"show",
                                    active }
trophyStats/_accounts             { accounts, active, at }                 signed-in read · server write
```

- **Rules** (`firestore.rules`): `match /trophies/{id} { allow read: if isOwner(); }` (no write =
  server-only, like `coinLog`); `trophyStats` and `trophyEvents` readable by any signed-in user,
  no client write. No `hasOnly` change on `users/{uid}`: nothing goes on the user doc.
- **Event trophies** use the same `trophies/{id}` collection, id `ev.<eventId>`, with `event`
  copied — one listener reads the whole collection.
- **Award helper** `functions/trophies.js` → `award(tx, uid, id, { source, ctx })`: creates the
  doc only if absent (idempotent), increments `trophyStats/{id}.owners`, adds a `trophy`
  notification (bell, §6). Called inside the existing transaction, so a trophy and its action land
  together or not at all.
- **Accounts count**: the `communityStats` schedule (daily), which already counts the accounts, also writes `trophyStats/_accounts`
  — **✅ R2** accounts active in the last 90 days (not every account ever, which would flatter the %).
- **Friends' trophies** ✅: readable by an accepted friend through the same friend rule as the
  inventory (`exists(users/{uid}/friends/{reader})`). In a friend's view the TigerSquad group keeps
  its Trophies tab: the friend's album ("{{name}}'s trophies"), read once and kept 2 min, read-only —
  no code button, no download (`renderTrophiesView(host, friend)`).

## 4. How each trophy is awarded

Two kinds of trigger:

- **State-derived** (best streak, chests opened, friends, devices, tier, certified chips): checked
  in `recomputeXp` / `storeTotals` (`supportWebhooks.js`), which already reads all of it and runs
  on every relevant change (`xpChests`, `xpFriends`, `xpScales`, …). **Retroactive for free**: an
  account that already has a 40-day best streak gets `streak7` + `streak30` at its next recompute.
- **Action-only** (sent, received, melted, relit, jackpot…): awarded where the action happens.

| Where | Trophies |
|---|---|
| `tigerCoins.js` `open` / `openChest` / `openEnvelope` | `firstEnvelope`, `firstChest`, `legendaryPull` (a drawn rarity = legendary) |
| `tigerCoins.js` `giveEnvelope`, `sendCoins` | `envelopeSent` (sender), `envelopeReceived` (friend) |
| `tigerCoins.js` `redeem` | `firstCode`, `luckiest` (split rank 1), **event trophies** (§5) |
| `tigerCoins.js` `easterEgg` | `firstEgg`, `allEggs` |
| `squadDeals.js` | `firstDeal` |
| `streakFreeze.js` `give` / `buy` for a friend | `freezeSent`, `freezeReceived` |
| `streakFreeze.js` `repair` | `flameRelit` |
| `quests.js` `advanceDaily` (pure) → caller `storeTotals` | `freezeSaved` (a bridge), `freezeMelted` (a palier replaced an ungiven `toGive`), `firstFlame`, `comboMax` |
| `recomputeXp` | streaks, chests counts, friends, links, squad tiers, devices, `fullKit`, `certified50` |
| `communityStats` daily ranking (`squadLeagueHistory`) | `podium` |

`advanceDaily` stays pure: it returns `trophies: [id]` with the new day, and `storeTotals` awards
them — the unit tests check the list like they check the XP.

**Back-fill** of action-only trophies that already happened (coinLog `sent`, `envelopeGiven`,
`envelopeReceived`, `freeze` with `to`, chips drawn legendary): a one-off script, run only on the
founder's explicit go (`.agents/rules/irreversible-actions.md`).

## 5. Event trophies with a code `XXXX-XXXX-XXXX`

Reuses the gift codes (`coinCodes/{CODE}`, `redeem`, the Hub "Gift code" wizard
`features/admin/TigerCoinsCodes.tsx` → `createCode` in `lib/admin/coins.ts`):

- `coinCodes/{CODE}` gains an optional **`trophy: "<eventId>"`**. A code can give a trophy alone,
  or a trophy **plus** its usual reward (coins / envelopes / chest) — "Formnext 2026: the trophy
  and a chest".
- **Hub admin**: a new "Trophies → Events" page creates the event (names in 11 locales, art
  uploaded to Storage, date, kind). The gift-code wizard's first step "What it gives" gets a
  **Trophy** option (pick an event) and keeps the reward as optional.
- **Distribution** — both already supported by `maxUses`, `expiresAt` and batches:
  - *Season* (Christmas 2026, New Year 2027, Halloween): one shared code, unlimited, valid during
    the season window (e.g. 24 Dec → 6 Jan, Paris time), posted in the newsletter / Discord.
  - *Show* (3D Print Lyon, Formnext): a **batch of single-use codes** printed on cards (or a QR)
    handed out at the booth — **✅ R3** (a shared code would leak on Discord the same evening).
- **Members-only gate**: `redeem` answers `NOT_IN_SQUAD` today. A **trophy-only** code is open to
  every account (a visitor met at a show is not a member yet); a code with coins stays
  members-only for its coins part — **✅ R4**: a non-member gets the trophy and the coins part is
  skipped (the answer says `coinsSkipped: true`); the code is not refused.
- **Where to type it**: the existing code box (Deals → TigerCoins) and a "Have a code?" field on
  the Trophies view, open to all accounts.
- **Yearly**: each year is a new event (`xmas2026`, `xmas2027`) with its own art — collecting every
  Christmas is part of the game. A missed year stays locked forever (dated silhouette).

## 6. Do trophies pay anything? — no

- **Action trophies: no XP, no coins.** They mirror things that already pay (`ACH_XP.chest` 200,
  daily quest XP, `tigerScale` 1000 …): paying again would double the ladder.
- **Event trophies: no XP** either; the code can carry a TigerCoins reward if wanted (§5).
- **A collection score** instead, like the console trophy level: `n / total` plus the count per
  tier, on the Trophies view and (later) on the profile.
- **✅ R5** — No XP. Rejected: a small XP bonus per tier paid through `recomputeXp` (it would
  double-pay what the XP ladder already pays).

## 7. Studio UI

### 7.1 The collection — "Trophies" in the Tiger Squad group

A button of the Tiger Squad view group (Rankings · Workshop · **Trophies** · History · Deals,
founder's call 2026-11-01), view mode `squadTrophies`, open to every account (no squad gate);
module `renderer/quests/trophies.js` + `renderer/quests/trophies.css`, tier colours
`--tier-*` in `00-base.css`.

- **Banner**: the Deals banner's frame (Tiger Squad eyebrow, big title, tagline, a desk scene of
  existing layers, the n / total card on the right — founder's call 2026-11-01); under it the
  filters, the count per tier and the "Have a code?" button.
- **Album**: every sticker in one grid (catalogue order, then the events, newest first) — no
  section per family; the family shows only in the card a sticker opens, beside the tier
  (founder, 2026-11-01); the bar's family filter narrows it. A grid of stickers:
  - **Earned** — the art die-cut as a sticker (white outline, slight tilt, soft shadow, a shine on
    hover), ringed in its tier colour; under it the name and the date.
  - **Locked** — the same art as a dark silhouette (no new art needed), the name and its tier.
  - Every sticker has the same size: the name (two lines at most) and one line (the date, or the
    tier); how to earn it — and "owned by n %" once earned — is in the app's shared info bubble
    (`#toolInfoPop`, above the "i" in the card's top-right corner, its tail on the icon) —
    founder's call 2026-11-01. An earned card takes its rarity colour (no ring) and a bigger
    sticker; an event one gets a slowly turning holographic edge.
  - **Hidden** — a "?" sticker, "Hidden trophy".
  - **Event, missed** — the silhouette with its date ("Christmas 2026 — over").
- **Click** a sticker → the detail card (the art large, tier, %, date, how it was earned:
  "Relit a 23-day streak", from `ctx`).
- Filters: All · Earned · Locked. Sorting: the album order (designed), then by date in "Earned".

### 7.2 Unlock

- The client listens to `users/{uid}/trophies` and compares with the ids it already celebrated
  (`tigertag.trophies.<uid>` in localStorage — one celebration per device). While the collection
  cannot be read (rules not deployed), the album shows, every sticker locked.
- **Every trophy won opens its unlock window** (founder's call 2026-11-01): the sticker slaps in
  over rays in its tier colour, its art swelling behind the window (`backfire`, coin-pull.js),
  the tier, the name, how it was earned, "See my trophies"; the sound is the stamp (common,
  uncommon) or the impact (rare and up). Several at once (a recompute, a back-fill) come one
  after the other, each when the previous closes; "See my trophies" drops the rest of the queue.
- The sticker's own card (a click in the album) has no X: a click outside or Escape closes it;
  an earned one has the same art swelling behind it.
- The bell keeps a `trophy` notification (it opens the collection), for the device that did not
  celebrate.

### 7.3 Art

- The sticker look (outline, tilt, ring, silhouette) is **CSS on the existing art** — most
  trophies need no new picture.
- Every non-brand trophy has its own sticker: an existing whole picture (Workshop loot and feats,
  TigerCoins art) or one generated for it, `assets/img/trophies/stickers/<trophyId>.webp` (master in
  `assets-src/img/trophies/stickers/`), each checked one by one against `docs/ART-DIRECTION.md`
  (flat, no gradient) at full size and at 40 px. Brand stickers: one die-cut piece per
  tier; level 1 is the brand's full logo redrawn in the house style, alone (Smart3DPT: its symbol);
  levels 10 / 50 / 100 put a themed object behind the logo, different for every brand and every tier
  (R3D medal / cup / diamond; eSun lantern / lion head / dragon; Sunlu rocket / ingot / firework;
  Jamg He bamboo / panda / pagoda; Landu koi / knot / jade disc; Rosa3D rose / amber / golden rose;
  Lotactree, from Porto: rabelo boat / Torre dos Clérigos / Dom Luís I bridge; Smart3DPT Barcelos rooster / pastel de nata / azulejo).
  Masters: logos in `assets-src/img/trophies/brands/`, objects in `assets-src/img/trophies/tiers/`.
  110 trophies, 110 pictures.
- New art (~10, listed "new" in §2, plus each event) follows `docs/ART-DIRECTION.md`, generated
  through the founder's ChatGPT (generate-asset skill), shown before integration, filed in
  `assets/img/trophies/`.

## 8. Later

- **Profile showcase**: three trophies chosen by the user, shown on `userProfiles` (via
  `setProfile`) and in the friends bar card.
- **Compare with a friend**: their album next to yours (seeing a friend's album ships; side by side is still to do).
- **Tiger NFC Connect** (`#mobile`): the same collection, read-only.
- **Trophy for scanning at a show**: a booth TigerTag chip that awards the event trophy when
  scanned with the mobile app (no code to type).

## 9. Build order (after validation) — 1 to 3 written 2026-11-01, not deployed

1. Backend: `trophyRules.js`, `trophies.js` (award + stats), rules, the hooks of §4, `coinCodes.trophy`
   + the open gate, unit tests. Deploy on the founder's go.
2. Studio: the Trophies view (Tiger Squad group), the unlock toast and overlay, the code field, i18n (11 locales, via
   `npm run i18n:add`), verified with dev-drive.
3. Hub: Trophies → Events, the Trophy option of the gift-code wizard.
4. Art: the "new" stickers, then the first event (Christmas 2026).
5. Back-fill of past actions — on an explicit go.
