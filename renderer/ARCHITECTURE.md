# Renderer architecture notes

Short, durable notes on the cross-cutting renderer systems. Feature-level
navigation lives in [`CODEMAP.md`](CODEMAP.md); this file explains the *models*
behind a few systems that touch many call sites.

---

## Avatar — tri-state invariant

Every coloured-circle avatar in Studio (sidebar, header chip, account
dropdown, profiles modal, edit-account modal, friend chips/panel, friend
banner, add-friend preview) is painted by **one pipeline** in `inventory.js`:

- `paintAvatar(el, source)` — imperative, updates an existing DOM node.
- `avatarMarkup(source, className, extraClass)` — template, returns HTML for
  `innerHTML`-built lists.

Both delegate to `_buildAvatarParts(source)`, which resolves a **mode**:

| mode       | when                              | visible child        |
|------------|-----------------------------------|----------------------|
| `empty`    | `source == null` (signed-out)     | `.av-plus` ("+")     |
| `initials` | signed-in, no usable photo        | `.av-initials`       |
| `photo`    | signed-in, has a photo URL        | `.sb-avatar-photo`   |

The host element carries `data-av-mode="empty|initials|photo"`, and a single
global CSS block (`00-base.css`, keyed off the attribute so it applies to
**every** container class) sets `display:none` on the two inactive children.

**Why it's structural, not visual:** the invariant is "exactly one child is
displayed", enforced by `display:none` — *not* by the photo merely covering the
initials. That removes a whole class of bugs (initials bleeding behind/beside
the photo, the "+" leaking as "OM+", sub-pixel / z-index / transparent-PNG
edges).

Rules the pipeline guarantees:
- Initials come **strictly** from `displayName`, never the email prefix.
  Empty `displayName` → empty initials → bare gradient (fine for the ~100 ms
  cold-start window before Firestore resolves).
- Photo URLs are only ever the Firebase Storage URL mirrored in
  `userProfiles/{uid}.photoURL` — never Firebase Auth's Google-CDN `photoURL`.
- A photo `onerror` removes the `<img>` **and** flips `data-av-mode` back to
  `initials`, so a broken photo cleanly falls back to the gradient + letter.

Self-test: `window._avatarTest()` (debug mode) paints all three states through
both entry points and asserts via `getComputedStyle` that exactly one child is
visible per state.

---

## Local-first hydration ("feels like Discord on launch")

The goal: the first visible frame is already populated from the previous
session's cache, with no flicker, then the live Firestore snapshot merges on
top.

### Persistence layer — `Cache`

One registry of every per-uid cache surface plus a uniform API:

```js
Cache.read(surface, uid)        // → parsed value | null
Cache.write(surface, uid, data) // JSON.stringify, swallows quota errors
Cache.clear(surface, uid)
```

Key naming is `tigertag.<surface>.<uid>` (existing `tigertag.inv.<uid>` and
`tigertag.friends.<uid>` keys are preserved verbatim — this is a formalisation,
not a migration). Surfaces:

| surface      | status | shape (minimal)                                   |
|--------------|--------|---------------------------------------------------|
| `inventory`  | live   | `{ [spoolId]: rawDoc }`                            |
| `friends`    | live   | `[{ uid, displayName, color, photoURL }]`         |
| `userdoc`    | live   | `{ roles, Debug, publicKey, privateKey, isPublic, displayName }` |
| `racks`      | L3     | (wired in the diff-only render pass)              |
| `printers`   | L3     | per-brand device list                            |
| `scales`     | L3     | heartbeat snapshot                               |
| `friendReqs` | L3     | incoming request list                            |
| `blocklist`  | L3     | blocked uid list                                 |

Global UI state (`tigertag.view`, `tigertag.lang`, `tigertag.sidebar`,
`tigertag.panelWidth.*`) is not per-uid and is read directly at boot, as before.

### Hydration order at boot (signed-in fast path)

`onAuthStateChanged` →
1. restore language from the cached Account,
2. `hydrateUserDocCache(uid)` — roles / debug / keys / isPublic from cache,
3. `setConnected(...)` — paints the sidebar avatar from the cached Account
   (`displayName`, `color`, `photoURL`) **and** hydrates the friends list
   (`_hydrateFriendsCache`),
4. render the cached inventory,
5. `requestAnimationFrame(signalFirstPaint)` — marks the trace and tells main
   to reveal the window,
6. *then* subscribe to Firestore; each live snapshot merges on top.

`displayName`, `color` and `photoURL` are stored on the `Account` object in
`tigertag.accounts`, so the avatar is correct on frame 1 (no wrong-letter
flash). `syncUserDoc` refreshes from the server and re-writes the `userdoc`
cache for the next launch, but does nothing visible if values didn't change.

### Never block the first paint (images = stale-while-revalidate)

The first paint is painted **synchronously** from the inventory cache — it does
**not** `await` the image precache. Two rules make thumbnails instant:

1. **Deterministic local URL.** `img:get(url)` (main) caches the bytes on disk
   under `{md5(url)}.{ext}` and returns a stable `/img-cache/{file}` URL that
   the renderer's own HTTP server serves straight off disk. Because the URL is
   deterministic, the renderer can reuse it across sessions.
2. **Persisted map.** `state.imgCache` (url → local URL) is mirrored to
   `tigertag.imgmap` and hydrated at boot *before* the first render, so
   `resolvedImg(url)` returns the local file immediately — thumbnails paint in
   the first frame with zero network and zero IPC.

`preCacheImages` then runs in the **background**: it only resolves URLs not
already in the map (new spools), persists the delta, and triggers a coalesced
repaint. Known images are skipped (the catalogue art is immutable), so a warm
launch does no image network at all. If a persisted local file 404s (cache
purged), the `<img>` `onerror` falls back once to the remote URL, which also
re-warms the disk cache.

> Anti-pattern this replaced: `await preCacheImages(rows)` **before** the first
> render forced the window to wait on N network fetches (and, offline, on N
> timeouts) before showing anything.

### Render coalescing — `scheduleRender(key, fn)`

Collapses repeated render requests for the same `key` within one animation
frame into a single call, so a Firestore tick that touches several collections
produces one consistent paint. Currently wired into the inventory subscription;
racks/printers/friends adopt it in the Level 3 diff-only pass.

### Cold-start trace — `window._coldStartTrace()`

`ColdStart.mark(label)` records wall-clock marks across launch:
`module-eval → locales-ready → lookups-ready → first-paint →
firestore-first-snapshot → second-paint`. `_coldStartTrace()` (DevTools) prints
the timeline + per-step deltas and flags whether first paint beat the 300 ms
target.

---

## Splash gate (main process)

`main.js` shows a tiny frameless **splash** window instantly (a self-contained
`data:` URL — no renderer server / Firebase needed), while the main
`BrowserWindow` is created with `show:false` + a dark `backgroundColor` and
loads/hydrates off-screen.

- The renderer calls `window.studio.ready()` (preload → `studio:ready` IPC)
  once `signalFirstPaint()` fires (first usable frame painted).
- `main.js` swaps the main window in for the splash via `revealMainWindow()`
  (idempotent).
- A **6 s hard fallback** (`setTimeout(revealMainWindow, 6000)`) guarantees the
  window is revealed even if the signal is missed (renderer crash, blocked
  script). The auto-updater flow is untouched — it keys off `did-finish-load`,
  which fires regardless of window visibility.

Offline boot: cache hydration still paints the last-known state; the health
cloud icon reflects `metadata.fromCache` and shows the offline affordance.

---

## What's intentionally deferred to Level 3

- Caching + local-first hydration of `racks`, `printers` (per brand), `scales`,
  `friendReqs`, `blocklist`.
- Diff-only re-render of inventory / racks / printers / friends (re-use node
  identity by `data-id`, mutate only changed fields instead of rebuilding big
  `innerHTML` strings), and routing those subscriptions through
  `scheduleRender`.
