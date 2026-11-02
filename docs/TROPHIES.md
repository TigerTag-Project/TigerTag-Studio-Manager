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
| Silhouettes | `https://cdn.tigertag.io/trophies/s/<id>-<hash>.webp` | the album (visible trophies only) |
| Art | `https://cdn.tigertag.io/trophies/a/<key>-<hash>.webp` (unguessable) | handed out by `trophyCards` |
| Trophies earned | `users/{uid}/trophies/{id}` `{ earnedAt, source, event?, ctx? }` | owner + accepted friends |
| Event trophies | `trophyEvents/{eventId}` `{ name, desc, art, year, date, kind, active }` | signed-in |
| Owners counters | `trophyStats/_all` | signed-in |

- **The public catalogue** lists every visible trophy with its name, mission, tier, family and
  silhouette. A hidden trophy appears only as `{ hidden: true, family, tier }`: no id, no text.
- **`trophyCards`** (`POST { ids }`, ID token) answers the art and the text of the trophies the
  caller holds, and nothing for the others. Studio keeps the cards per account
  (`tigertag.trophyCards.<uid>`) and asks only for a trophy it has no card for.
- The album shows a held trophy with its art, a visible one still to win as its black silhouette,
  a hidden one still to win as "?". A hidden trophy held takes a "?" slot of its family and tier.
- A friend's album: the friend's trophies you hold too show their art; the others stay
  silhouettes or "?" (your cards only).

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
