# UI/UX defaults

**Rule.** Apply the established design grammar on every UI task without being told: declutter, show context instead of labels, keep matching components consistent, smooth motion (slide, don't pop or snap), real masked SVG icons sized with presence, visible selected state, light in-context help, tight spacing, shared CSS/JS over repetition. No `title=""` hover tooltips.

**Why.** The founder repeated the same tweaks session after session and asked for autonomy; he finds native hover tooltips ugly and useless.

**Reuse what exists — by default.** A new screen or element is built from the components and CSS the app already has (the same classes, the same markup). The shared blocks are functions in `renderer/quests/ui-kit.js`: `heroHtml` (the banner: eyebrow, title, tagline, a `hero-layers.js` scene, a side card — every Tiger Quests / Tiger Squad view uses it), `filterBarHtml` (the Deals bar: tabs with icon and count, search, extras), `searchHtml` (the search field), `infoTipHtml` (an ⓘ showing the shared `#toolInfoPop` bubble, above it with its tail); a big moment is `backfire` (coin-pull.js). Call them rather than re-typing their markup; a block missing from the kit is added to it, not written inline. Look for the existing one first; never copy its CSS under a new name and never invent a new look. A new style only when the founder asks for one (founder, 2026-11-01).

**How.** Propose refinements proactively with a one-line rationale. For accessibility use `aria-label` (no visual tooltip); `alt` on images is fine.

**Big moments: an animation behind the window.** A rare, rewarding moment (a streak relit, a chest
opened, a trophy unlocked, a legendary reveal…) gets a ceremony. When it happens in a **modal
window** (a card on an overlay), part of it plays *behind* that window, on the overlay — never on
a stage with no window (the chest, a reveal, the secret envelope float on their own: no back layer): the founder loved it on "Relight the flame". Use the shared helper
`backfire(overlayEl, cardEl, artSrc, { at, size, waves })` in `renderer/quests/coin-pull.js`
(`.bk-fire` in `renderer/quests/quests.css`): a fixed layer at `z-index: -1` in the overlay's own
stacking context, placed on the card, where huge translucent copies of the moment's art
(`mix-blend-mode: screen`, blur growing) swell (`at: "bottom"`, a flame) or radiate
(`at: "center"`, a chest, a coin) and fade in staggered waves until the window closes. In use:
relight, friend's coins collected. Pair it with the
in-card beats (build-up, flash + shock ring, counter, particles) and synthesised sounds
(`coin-sound.js`); `prefers-reduced-motion` shows the end state and hides the back layer.
