# Worklog — v1.8.24 (in progress)

## Added
- Avatar tri-state invariant — `data-av-mode="empty|initials|photo"` stamped on every avatar host by the central pipeline; CSS shows exactly ONE child (`.av-initials` | `.av-plus` | `.sb-avatar-photo`) per mode, so initials/"+" can never leak behind or beside the photo — `renderer/inventory.js`, `renderer/css/00-base.css`, `renderer/inventory.html`
- `window._avatarTest()` dev-only self-test (debug mode) — paints all 3 states through both `avatarMarkup` and `paintAvatar` and asserts via getComputedStyle that one child shows and two are hidden — `renderer/inventory.js`
- Local-first persistence layer `Cache` — one registry of per-uid cache surfaces (`inventory`, `friends`, `userdoc`, + declared L3 surfaces) with uniform `read/write/clear`; existing keys preserved verbatim — `renderer/inventory.js`
- `hydrateUserDocCache(uid)` — applies cached roles/debug/keys/isPublic synchronously before first paint (debug button + public flag correct on frame 1); `syncUserDoc` now mirrors the user doc to the `userdoc` cache — `renderer/inventory.js`
- `scheduleRender(key, fn)` rAF coalescer — collapses repeated render requests in one frame to a single paint; wired into the inventory subscription — `renderer/inventory.js`
- Cold-start trace — `ColdStart.mark()` + `window._coldStartTrace()` prints the launch timeline (module-eval → locales → first-paint → firestore-first-snapshot → second-paint) and flags the <300 ms first-paint target — `renderer/inventory.js`
- Splash gate — instant frameless launch splash (self-contained data: URL) showing the inlined TigerTag SVG logo (white, with a lettermark fallback if the file can't be read) at a large size, plus the app version (`app.getVersion()`); main window starts hidden and is revealed on `studio:ready` (renderer first usable paint) with a 6 s hard fallback — `main.js`, `preload.js`, `renderer/inventory.js`
- `renderer/ARCHITECTURE.md` — documents the avatar invariant, local-first hydration model, cache key naming, render coalescing, cold-start trace and splash gate — `renderer/ARCHITECTURE.md`
- Persisted image map (`tigertag.imgmap`, url→local `/img-cache/*`) hydrated at boot — thumbnails paint from local disk files in the first frame with zero network; `preCacheImages` warms only NEW images in the background and repaints the delta — `renderer/inventory.js`
- Thumbnail `onerror` fallback to the remote URL when a persisted local cache file 404s (cache purged), which also re-warms the disk cache — `renderer/inventory.js`

## Changed
- Sidebar friend list now scrolls (Discord-style) when it outgrows the available height — flex cascade (`.sb-user` → `.sb-actions` → `.sb-friends-list`, all shrinkable with `min-height:0`) makes only the friend list scroll while the avatar row, Refresh/Friends buttons and community footer stay fixed; the scrollbar is hidden (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`) so it scrolls with no visible bar — `renderer/css/00-base.css`
- `_buildAvatarParts` now returns a `mode`; `paintAvatar` / `avatarMarkup` / `_renderAvatarPhotoOverlay` keep `data-av-mode` in sync (photo onerror falls back to initials mode) — `renderer/inventory.js`
- `setDisconnected` paints the empty avatar via `paintAvatar(el, null)` instead of hand-building the "+" SVG — `renderer/inventory.js`

## Fixed
- Initials "OM" bleeding behind / beside the avatar photo, and the spurious "+" badge in the signed-in state — the invariant is now structural (`display:none`), not reliant on the photo covering the text — `renderer/inventory.js`, `renderer/css/00-base.css`
- Cold start no longer waits on Firestore to show the inventory: the cached inventory is now painted instantly. Two root causes fixed — (1) `state.invLoading` stayed true so `renderInventory()` short-circuited to the spinner and never painted the cache before the first snapshot; (2) the first paint `await`-ed `preCacheImages` (N network fetches, N timeouts when offline). Now cache paints synchronously, images warm in the background. `subscribeInventory` uses an explicit first-snapshot flag instead of `invLoading` — `renderer/inventory.js`
- Sidebar friend chips now paint from the hydrated cache in the first frame (`setConnected` calls `renderSidebarFriends()`), instead of popping in after `loadFriendsList()`'s Firestore round-trip — `renderer/inventory.js`
- Header banner avatar (the inventory-stats chip) no longer flashes 2-3× on cold start — `renderFriendBanner()` now rebuilds its innerHTML only when a content signature changes, so identical re-renders keep the existing `<img>` instead of destroying/recreating it — `renderer/inventory.js`
- Sidebar friend-chip avatars no longer flash 2-3× on cold start — `renderSidebarFriends()` gets the same content-signature guard, so repeated re-renders (setConnected → dropdown → loadFriendsList) keep the existing `<img>`s — `renderer/inventory.js`

## Removed
- Hand-rolled `.sb-avatar-plus` SVG path + its `.sb-user--empty .sb-avatar .sb-avatar-plus` CSS rules (replaced by the tri-state `.av-plus` glyph) — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/00-base.css`
- Global image "loading shine" shimmer — the body-wide `MutationObserver` that stamped `.img-skeleton` on every loading `<img>` plus the `.img-skeleton` / `img-shimmer` / `img-fade-in` / `img.img-loaded` CSS. Images now hydrate from the disk cache and just appear; the gliding effect was noisy and redundant — `renderer/inventory.js`, `renderer/css/00-base.css`

## i18n
