# Trophies grow with every release

**Rule.** The trophy collection is never finished: every release adds trophies, and the long-term goal is a very large collection — around **1,000 trophies**. A new feature, screen, device, gesture or event comes with its trophies (milestones, tiers, a hidden one) as part of the work, not as an afterthought.

**Why.** Founder, 2026-11-01: trophies are the album users fill over time, like console trophies; a big, steadily growing catalogue keeps people coming back and turns every asset of the app into a sticker to collect.

**How.**
- Each release: add a batch (propose them while building the feature; list them in WORKLOG and the release copy — never name a hidden one in a public text).
- Ideas that scale: tiers on every countable action (1 / 10 / 50 / 100 / 1,000…), one trophy per Workshop loot or feat (same rarity as the item), hidden gestures and easter eggs, pop-culture names, event trophies per year (codes `XXXX-XXXX-XXXX`, Hub admin).
- Where: everything in the private backend repo `TigerTag_Firebase_Backend`, never in Studio (it is open source: a shipped list would give away every mission) — award rule in `functions/trophyRules.js`, family / hidden / name + mission in the 11 languages in `functions/trophyCatalog.json`, art in `art/trophies/<id>.webp` (a whole standalone picture, never a banner layer, `art-direction.md`), then `node tool/trophy-art.mjs` and a hosting deploy. State trophies are retroactive, action ones count from their release (back-fill only on an explicit go). Design: backend `docs/TROPHIES.md`; mechanics: Studio `docs/TROPHIES.md`.
- No `trophy_<id>` / `trophyHow_<id>` key in the Studio locales, no trophy art in `assets/`.
- An id is a Firestore doc id: never renamed or reused.
