# Trophies — how the album works

Collectible trophies, like console trophies: a sticker earned for an action, a milestone or a
moment (an event, with a gift code). This file describes the mechanics only.

**The list of trophies, their conditions, texts and art are not in this repository.** Studio is
open source: a catalogue shipped with the app would give every mission (hidden ones included)
to anyone who reads the code. The full design lives in the private backend repo
`TigerTag_Firebase_Backend` (`docs/TROPHIES.md`).

## Where everything is

| What | Where | Who reads it |
|---|---|---|
| Award rules (id, tier, kind) | backend `functions/trophyRules.js` | the functions |
| Album order, family, hidden flag, name + mission in the 11 languages | backend `functions/trophyCatalog.json` | the functions, `tool/trophy-art.mjs` |
| Art sources (masters, parts) | backend `art/trophies/` | `tool/trophy-art.mjs` |
| Public catalogue | `https://cdn.tigertag.io/trophies/catalog/<lang>.json` | the album (any visitor) |
| Silhouettes | `https://cdn.tigertag.io/trophies/s/<key>-<hash>.webp` (unguessable) | the catalogue (common, uncommon), `trophyCards` (veiled ones a friend holds) |
| Art | `https://cdn.tigertag.io/trophies/a/<key>-<hash>.webp` (unguessable) | handed out by `trophyCards` |
| Trophies earned | `users/{uid}/trophies/{id}` `{ earnedAt, source, event?, ctx? }` | owner + accepted friends |
| Event trophies | `trophyEvents/{eventId}` `{ name, desc, art, year, date, kind, active }` | signed-in |
| Owners counters | `trophyStats/_all` | signed-in |
| Reveals | `users/{uid}/trophyCounters/reveals` `{ ids: { trophyId: friendUid }, init }` | server only, through `trophyCards` |

- **Veiled trophies**: a hidden one, or any **rare, epic or legendary** one. The public catalogue
  lists a common or uncommon trophy with its name, mission, tier, family and silhouette; a veiled
  one only as `{ hidden: true, family, tier }`: no id, no text, no silhouette.
- **A friend reveals it**: as soon as one of your friends holds a veiled trophy, its silhouette,
  name and mission show in your album, with "Seen at <friend>'s" — having friends helps to find the
  stickers. Its art still has to be earned. The backend keeps one reveals doc per account, filled
  when a friend earns one (`trophyRevealsOnTrophy`), when a friendship starts
  (`trophyRevealsOnFriend`) and, once, from the current friends at the account's first call
  (no mass back-fill). A reveal is never taken back.
- **`trophyCards`** (`POST { ids, reveals?, known? }`, ID token) answers the art and text of the
  trophies the caller holds, and with `reveals` every veiled trophy a friend holds (`by`, plus its
  silhouette and text unless `known` lists it). Studio keeps the cards (`tigertag.trophyCards.<uid>`)
  and the reveals (`tigertag.trophyReveals.<uid>`, asked again at sign-in and when the album opens,
  at most every 10 min).
- The album shows a held trophy with its art, a common or uncommon one still to win as its black
  silhouette, a veiled one as "?" with its tier, or as its silhouette once a friend revealed it. A
  veiled trophy held or revealed takes a "?" slot of its family and tier.
- A friend's album: their veiled trophies are revealed to you, so they show as silhouettes.

A gesture detected in the app (an easter egg) still shows its trigger in the code: keep such
trophies few, or let the server detect the action.

## Studio UI (`renderer/quests/trophies.js`, `trophies.css`)

- The album: the view "Trophies" in the Tiger Squad group (`squadTrophies`), every account. The
  last catalogue (`tigertag.trophyCatalog.<lang>`) and album (`tigertag.trophyAlbum.<uid>`) paint
  at once, then update.
- Unlock: each new trophy gets its own window once its card is read, one after the other; the
  device remembers what it already celebrated (`tigertag.trophies.<uid>`).
- A held sticker opens its card (tilt, gloss, download as PNG — the cdn sends CORS headers).
- Generic labels (tiers, families, filters, "Hidden trophy"…) are ordinary i18n keys; no
  `trophy_<id>` key exists in the locales.

## Adding a trophy

All in the backend repo, never in Studio:

1. The award rule in `functions/trophyRules.js` (+ the hook in the function that sees the action).
2. Its entry in `functions/trophyCatalog.json` (family, `hidden`, a new random `key`, name + how in
   the 11 languages) and its art in `art/trophies/<id>.webp` (`docs/ART-DIRECTION.md`).
3. `node tool/trophy-art.mjs`, commit, then deploy hosting and the functions that read the catalogue
   (`trophyCards`).

An id is a Firestore doc id: never renamed or reused.
