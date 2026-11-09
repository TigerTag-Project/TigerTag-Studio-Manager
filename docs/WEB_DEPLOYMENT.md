# Tiger Studio Web — deployment

Tiger Studio runs in a browser at **`https://studio.tigersystem.io`**, from the
same code as the desktop app — served at the root of that host, the address never
changes. `https://tigersystem.io/studio` redirects to it.
Because it is its own origin, Studio Web keeps its own sign-in (one login, then
remembered) instead of sharing the Hub's.
Decisions and the audit behind them: [`STUDIO-WEB-PLAN.md`](STUDIO-WEB-PLAN.md).

## Architecture

```
TigerTag-Studio-Manager (this repo)            TigerTag_Hub (Next.js on Vercel)
  renderer/  data/  assets/                      prebuild: scripts/fetch-studio-web.mjs
  scripts/build-web.mjs  ── static folder ──▶      → shallow clone of a Studio tag
                                                   → build-web.mjs --base /studio/
                                                   → public/studio/   (gitignored)
                                                 middleware.ts (host studio.tigersystem.io)
                                                   /  (and /studio)   → rewrite to /studio/index.html
                                                   /studio/…          → the app's files, as is
                                                   anything else      → redirect to tigersystem.io
                                                 next.config.mjs
                                                   tigersystem.io/studio → redirect to studio.tigersystem.io
                                                 fetch-studio-web.mjs: manifest id / start_url / scope → "/"
```

- **No bundler, no second codebase.** The renderer is plain ES modules + the
  Firebase compat SDK; the web build is a filtered copy of `renderer/`, `data/`
  and `assets/`. `index.html` is `renderer/inventory.html` with a
  `<base href="/studio/renderer/">`, so every relative URL resolves as on desktop.
- **`renderer/web-bridge.js`** stands in for the Electron preload in a browser:
  it defines a web `window.electronAPI` (`isWeb: true`) with the methods a
  browser can honour — external links, app info, product lookup / refresh, full
  catalogue (the TigerTag API answers CORS), image download. In Electron it does
  nothing. Native features stay absent and are feature-detected by the renderer.
- **`HAS_NATIVE`** (`renderer/inventory.js`) is the one "is this the desktop app"
  test. Never use `!!window.electronAPI` for that any more — it is true on the web.
- **`data-desktop-only`** on an element hides it in a browser (`html.is-web`
  rule in `renderer/css/00-base.css`). Hidden today: NFC readers bar + tester,
  TD1S, updater (card, icon, banner), printer views, camera detach.

## What works on the web

| Works | Desktop only (for now) |
|---|---|
| Sign-in (Google popup, email + password), several accounts | NFC / RFID readers (ACR122U, TigerPOD), chip encode |
| Inventory grid / table / detail, edit, weight, add product | TD1S sensor, USB scale |
| Racks, favourites, lists / wishlists, cart | LAN printers (all brands), cameras |
| Catalogue, product lookup | Auto-update, local AI-assistant (MCP) server |
| Friends, friend link `?friend=XXX-YYY`, notifications | Native file dialogs (downloads go through the browser) |
| TigerScale / TigerSpool state (cloud) | |
| **Install as an app** (PWA): sidebar button on Chrome / Edge / Android, Share → Add to Home Screen on iPhone / iPad | |

Printers are planned for the web too — through the brands' cloud APIs or a relay;
see the plan.

## Install as an app (PWA)

The build writes `manifest.webmanifest` (name, standalone display, icons from
`assets/favicon/`) and the iOS home-screen tags into `index.html`. Its scope is the
served folder **without** the trailing slash (`/studio`); the Hub's
`fetch-studio-web.mjs` then widens `id` / `start_url` / `scope` to `/`, because on
`studio.tigersystem.io` the page lives at the root. `web-bridge.js` keeps Chrome's `beforeinstallprompt`; the sidebar
"Install the app" button (`#sbInstallBtn`, `data-web-only`) replays it, or on iOS
unfolds the Share → Add to Home Screen hint. There is deliberately **no service
worker**: Chrome no longer needs one to install, and an offline cache would keep
serving the previous version after each release.

## Sign-in

On `studio.tigersystem.io` Studio is its own origin, so it does **not** share the
Hub's Firebase session: the user signs in once, and the session is remembered.
`_adoptSharedWebSession` (adopt the Hub's signed-in user on a first visit) only
fires when both run on the same origin — e.g. `tigersystem.io/studio/…` opened
directly — and is harmless otherwise.

## Commands

```bash
npm run web:build                                   # → dist-web/ (base /)
npm run web:serve                                   # build + http://localhost:5181
node scripts/build-web.mjs --out <dir> --base /studio/
```

In the Hub repo: `npm run studio:fetch` (runs automatically as `prebuild`).

| Hub env var | Effect |
|---|---|
| `STUDIO_WEB_REF` | Studio tag or branch to ship instead of the latest release (previews / tests only — skips the version check) |

No secret is involved in the build: the Firebase web config is public by design
(already in `renderer/firebase.js`); security is the Firestore / Storage rules,
unchanged. No `.env` is needed.

## Same version as the desktop app — always

Desktop and web follow **one** source of truth: the **published "latest" GitHub
Release** (drafts and pre-releases never count). The desktop auto-updater installs
it; the Hub builds it into `/studio`. Three guards keep them together:

1. **Release publish → Hub deploy.** `.github/workflows/web-sync.yml` runs on
   `release: published` (a release published by hand). The release workflow's
   `publish-release` job publishes with `GITHUB_TOKEN`, which raises no such event,
   so that job starts Web sync itself (`gh workflow run web-sync.yml`). It then calls the Hub's Vercel deploy hook `studio-release`
   (secret `HUB_DEPLOY_HOOK_URL`), then waits until
   `https://tigersystem.io/studio/version.json` equals the release — a **red run
   means desktop and web are out of sync**. Re-run it by hand (*Run workflow*).
2. **The Hub build refuses to drift.** `fetch-studio-web.mjs` reads the latest
   release from github.com's own `/releases/latest` redirect (not the rate-limited
   REST API), builds it, checks the built `version.json` equals the tag, and
   **fails the build** otherwise — Vercel then keeps the previous deployment live.
   Only a release older than the web build (≤ v2.39.0) is skipped.
3. **Open pages follow.** A tab or installed app compares `version.json` with its
   own version whenever it comes back into view (at most every 10 min) and reloads
   onto the new release — never while a window is open or a field is focused.

⚠️ **Vercel only deploys a commit whose Git author has access to the team.** The
Hub's `main` must therefore end on an authorised commit — today a
`chore: trigger production deploy` empty commit authored by the `TigerTag-Project`
account follows every personal commit. A deploy hook builds the branch head, so it
is blocked the same way when the head is a personal commit (web-sync then goes red).
The permanent fix is to link the personal GitHub account to the Vercel member
account (Vercel → Account Settings → Authentication).

## No LAN from the web

A browser cannot reach a printer the way the desktop does, and an https page that
opens `ws://` / `http://` connections is mixed content: Chrome flags the site "Not
secure" and asks for local-network access. `renderer/web-bridge.js` therefore
refuses any insecure `WebSocket` / `fetch` on https (the Creality and Snapmaker
modules talk to printers from the page; they treat the refusal as "printer
unreachable"). Printers on the web will come through a secure relay.

## Web-only fixes

`npm run web:hotfix` ships a fix to the web as `X.Y.Z · web N` with no desktop
build — see [`WEB_HOTFIX.md`](WEB_HOTFIX.md).

## Shipping a new Studio Web version

Nothing extra: release Studio as usual (tag → CI → **publish** the draft as
latest). Publishing triggers the web deploy; watch the *Web sync* run.

## One-time setup (done 2026-10-12)

1. **Vercel** — `studio.tigersystem.io` added to the `tiger-tag-hub` project
   (team Tiger-Project); deploy hook `studio-release` on `main`.
2. **DNS (OVH)** — `studio` `CNAME` the project-specific target Vercel shows
   (`…vercel-dns-016.com.`; the legacy `cname.vercel-dns.com` also works).
3. **GitHub** — secret `HUB_DEPLOY_HOOK_URL` on this repo.
4. **Firebase Auth** — `studio.tigersystem.io` must be an **authorised domain**
   (Authentication → Settings → Authorized domains), or the Google sign-in popup
   is refused there; email / password works regardless. Vercel preview URLs
   (`*.vercel.app`) must be added one by one to test sign-in on a preview.

## Known limits

- **iPad / touch**: the layout is desktop-first; the tablet pass is still to do.
- **Size**: the build is ~144 MB, mostly printer and tutorial images; a browser
  only downloads what it shows.
- **iOS Safari** may evict the offline cache (IndexedDB) after about a week of
  no use — the next visit simply reloads from the network.
