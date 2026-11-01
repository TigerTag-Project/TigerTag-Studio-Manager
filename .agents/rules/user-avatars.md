# User avatars

**Rule.** A person is always drawn by `userAvatar(who, sizeClass)` in `renderer/inventory.js` — the
friends bar's look (photo or initials on their colour, the TigerSquad ring and level badge) — and
nothing else changes from one place to another but the size, set by the class. Never call
`avatarMarkup()` directly for a person, never build an avatar by hand.

**Why.** The founder saw the same friend drawn three ways (a bare photo in the bell, a ringed avatar in
the friends bar, initials in a modal): one helper guarantees one look everywhere.

**How.** Pass whatever you have plus the uid (`{ uid, displayName, photoURL, color }`, a friend
record, an account): `userAvatar` takes the freshest record it holds — my own account with my
TigerSquad level (`_ownSquadTier`), else the friend entry in `state.friends`, else what was given.
A module outside `inventory.js` receives it through its ctx (e.g. `ctx.avatar`, `meAvatar`). New
sizes are a CSS class on the avatar, not a new markup; `av-fill` (`renderer/css/10-settings.css`)
fills its container, which sets the size and the initials' font-size — use it rather than borrowing
another component's size class and overriding it.
