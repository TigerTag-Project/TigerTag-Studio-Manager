# Worklog — v1.10.14 (in progress)

## Added
- **Shareable friend links.** A new **"Share link"** button in the Friends panel (next to "My code") copies `https://cdn.tigertag.io/friend/<code>`. Opening that link runs the deep link `tigertag://friend/<code>`: the app comes to the front and **pre-fills the Add-friend search** with the code + runs the lookup — the user still presses "Send request" (a link can never auto-add or auto-accept). Registered the `tigertag://` custom protocol in `main.js` (macOS `open-url`, Windows/Linux argv + `second-instance`, cold-start queue flushed once the renderer signals ready / after sign-in). New `electronAPI.onDeepLink`/`deepLinkReady` bridge. The shareable landing page (`public/friend.html` + `/friend/**` rewrite) lives in the **backend repo** (deployed): it redirects to the app or offers a download + the manual code as fallback. `main.js`, `preload.js`, `renderer/inventory.js`, `renderer/inventory.html`, `css` (none) — backend: `TigerTag_Firebase_Backend/public/friend.html`, `firebase.json`

## Changed

## Fixed
- Notification center — a friend request (Accept/Decline/Block) and a general notification (✕) now **disappear the instant you click**, instead of lingering until the Firestore subscription round-tripped. The action rows are removed optimistically (the live subscription reconciles right after); `acceptFriendRequest` takes the request object so the new friend keeps its enriched avatar despite the optimistic removal. `renderer/inventory.js`
- Add-friend modal — the search **preview now shows the found user's real avatar** (photo, not just the initials circle), resolved from their `userProfiles`. `renderer/inventory.js`, `css/60-modals.css`
- Accepting a friend request — the new friend now shows **their avatar immediately** instead of only after an app restart. The optimistic friend object was bare (no `photoURL`) and clobbered what the live `userProfiles` listener resolved; it now carries the avatar/colour already enriched on the friendRequest. `renderer/inventory.js`

## Removed
- Friends panel — the **"Copy" (raw code) button** in the "My code" hero, now redundant with the new "Share link" button (the code itself stays visible). `renderer/inventory.html`, `renderer/inventory.js`

## i18n
- Added: `friendsShareLink` — 9 locales
