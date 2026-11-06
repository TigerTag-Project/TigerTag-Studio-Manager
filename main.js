const { app, BrowserWindow, ipcMain, shell, session, nativeTheme, utilityProcess, Menu, autoUpdater: nativeAutoUpdater } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const crypto = require('crypto');

// Right-click context-menu labels, translated in the RENDERER (which owns the app
// language) and pushed here via IPC so the native menu matches the in-app language
// rather than the OS locale. Null until the first push → role defaults are used.
let _ctxMenuLabels = null;
// The renderer owns the theme (Settings → Appearance); the window chrome is
// ours, so it has to be told. Called on boot and on every change.
ipcMain.on('app:native-theme', (_e, theme) => {
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark';
});

ipcMain.on('app:ctx-menu-labels', (_e, labels) => {
  if (labels && typeof labels === 'object') _ctxMenuLabels = labels;
});

// ── Portable build — keep EVERYTHING on the stick ──────────────────────────
// The Windows `portable` target runs the app straight from a USB key or an
// external drive, with no installation (for machines where installing is not
// allowed). electron-builder sets PORTABLE_EXECUTABLE_DIR to the folder the
// .exe was launched from.
//
// Without this block a "portable" build is only half portable: Electron would
// still write accounts, cache, IndexedDB and logs to %APPDATA% on the HOST
// machine — so the user would leave a signed-in session behind on a shared PC
// AND would not find their inventory again on the next computer, which is the
// whole point of carrying the app around.
//
// Must run BEFORE electron-log is required (it resolves its file path from
// userData) and before anything else touches an app path.
const _portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
if (_portableDir) {
  try {
    const dataDir = path.join(_portableDir, 'TigerStudioData');
    fs.mkdirSync(dataDir, { recursive: true });
    app.setPath('userData', dataDir);
    app.setPath('sessionData', dataDir);
    app.setPath('logs', path.join(dataDir, 'logs'));
  } catch (e) {
    // A read-only stick or a locked-down folder: fall back to the default
    // location rather than refusing to start. The app still works, it just
    // stores its data on the host.
    console.warn('[portable] cannot use the executable folder, falling back:', e.message);
  }
}

// ── Persistent logging ─────────────────────────────────────────────────────
// Writes to:
//   Windows : %APPDATA%\tigertag-inventory\logs\main.log
//   macOS   : ~/Library/Logs/tigertag-inventory/main.log
//   Linux   : ~/.config/tigertag-inventory/logs/main.log
//   (the app name is package.json "name"; productName only names the installer)
//   Portable: <stick>\TigerStudioData\logs\main.log   (see the block above)
const log = require('electron-log');
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB max, auto-rotated
log.transports.file.format  = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
Object.assign(console, log.functions); // console.log/warn/error → log file
autoUpdater.logger = log;               // download / install steps land in main.log too
log.info(`Tiger Studio Manager starting — v${require('./package.json').version}`);
const db = require('./services/tigertagDbService');

// ── App display name (macOS menu bar, About dialog, Dock, etc.)
// package.json `name` is "tigertag-inventory" (npm-friendly slug). Force the
// human-readable product name so macOS shows "Tiger Studio Manager" in:
//   - app menu (Apple menu → "About Tiger Studio Manager", "Quit Tiger Studio Manager")
//   - Dock tooltip
//   - Window menu items
// Must be called BEFORE app.whenReady() / before any window is created.
app.setName('Tiger Studio Manager');

// ── Chromium compositor tile budget (Retina + macOS Tahoe mitigation) ────────
// On the built-in Retina display (DPR 2) at fullscreen, the default tile-memory
// budget (~128 MB) is blown by the inventory grid + side panel + overlays,
// triggering thousands of `tile memory limits exceeded` warnings per second
// and producing the visible flashes the user reported. External monitors
// (DPR 1) stay under the budget and are unaffected.
//
// `force-gpu-mem-available-mb=1024` widens the GPU memory ceiling reported to
// the cc/tiles compositor → 8× more raster tiles fit before eviction. Tested
// live on M1 13" / macOS 26.2 Tahoe / Electron 41.3.0:
//   - Without the switch: ~3 800 warnings per session, grid disappears when
//     opening the side panel, sidecard renders without background, hover
//     flashes the whole grid.
//   - With the switch: 11 warnings at the fullscreen-resize moment only,
//     side panel opens cleanly over an intact grid, zero hover flashes.
//
// 512 MB is NOT enough on a 16 GB M1 with 4 displays attached (tested);
// 1024 MB is the right level for this workload.
// Must run BEFORE app.whenReady().
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '1024');
// Dev-drive (test harness): `npm run start:drive` opens Chromium's DevTools
// protocol on 127.0.0.1 so scripts/devdrive.mjs can drive the renderer.
// Opt-in AND dev-only: a packaged build never opens the port.
if (!app.isPackaged && process.env.TIGER_DEVDRIVE) {
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  app.commandLine.appendSwitch('remote-debugging-port', process.env.TIGER_DEVDRIVE_PORT || '9339');
}

// ── Single-instance lock ────────────────────────────────────────────────────
// Prevent multiple Electron processes from sharing the same userData directory
// (which would deadlock IndexedDB / LevelDB — Firebase Auth, image cache, etc.).
// If a 2nd launch is attempted, focus the existing window and quit immediately.
const _hasInstanceLock = app.requestSingleInstanceLock();
if (!_hasInstanceLock) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  // Windows / Linux: a `tigertag://…` click while the app is already running
  // launches a 2nd instance whose argv carries the URL. Route it.
  const url = _extractDeepLink(argv);
  if (url) _handleDeepLink(url);
});

// ── Custom protocol — deep links (tigertag://friend/<code>) ─────────────────
// Lets a shared friend link (the tigersystem.io/friend/<code> landing page
// redirects to tigertag://friend/<code>) open the app and pre-fill the
// add-friend flow. The renderer parses the URL and only PRE-FILLS the code —
// the user still confirms, so a link can never auto-add or auto-accept anyone.
const DEEPLINK_SCHEME = 'tigertag';
if (process.defaultApp) {
  // Dev (electron launched with a script path): the scheme must point at the
  // electron binary + this script so the OS can relaunch us with the URL.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(DEEPLINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(DEEPLINK_SCHEME);
}
let _pendingDeepLink = null;   // queued until the renderer signals it's ready
let _rendererDeepLinkReady = false;
function _extractDeepLink(argv) {
  return (argv || []).find((a) => typeof a === 'string' && a.startsWith(DEEPLINK_SCHEME + '://')) || null;
}
function _handleDeepLink(url) {
  if (!url) return;
  if (_rendererDeepLinkReady && mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('deep-link', url);
  } else {
    _pendingDeepLink = url;   // flushed on 'deep-link:ready'
  }
}
// macOS delivers the URL here whether the app was already running or just
// launched by the click.
app.on('open-url', (event, url) => { event.preventDefault(); _handleDeepLink(url); });
// Renderer is ready to receive deep links → flush any that arrived early.
ipcMain.on('deep-link:ready', () => {
  _rendererDeepLinkReady = true;
  if (_pendingDeepLink) { const u = _pendingDeepLink; _pendingDeepLink = null; _handleDeepLink(u); }
});
// Cold start on Windows/Linux: the launch URL is in our own argv.
{
  const _coldLink = _extractDeepLink(process.argv);
  if (_coldLink) _pendingDeepLink = _coldLink;
}

// ── Minimal static file server so location.protocol === 'http:' (required by Firebase Auth)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
};
let _devServer;
let _devPort;
// Port fixe = même origin à chaque démarrage → Firebase Auth + localStorage persistent
const RENDERER_PORT = 5784;

function startRendererServer(rendererDir) {
  // Returns Promise<{ port }> — never rejects (all error paths resolve).
  //
  // The server always binds to 127.0.0.1 (explicit IPv4 loopback) to avoid
  // the Windows 10 / Node.js 17+ pitfall where 'localhost' resolves to ::1
  // (IPv6) and fails with EADDRNOTAVAIL when IPv6 is disabled on the machine.
  //
  // The BrowserWindow always loads from http://localhost:PORT (not 127.0.0.1)
  // so Firebase Authentication sees a named host and Google sign-in works.
  // Chromium resolves 'localhost' to 127.0.0.1 at TCP level, so the two
  // sides always connect correctly.
  const handler = (req, res) => {
    let urlPath = req.url.split('?')[0];

    // Image cache route — serves cached product thumbnails straight from
    // imgCacheDir as real HTTP responses (proper Content-Type, browser
    // HTTP cache, decoded-bitmap retention). Previously `img:get` returned
    // a `data:base64,...` URL stored in `state.imgCache` and pasted into
    // `<img src="data:...">`, which forced the browser to re-decode the
    // bitmap every time the `<img>` was destroyed and re-created (full
    // grid rebuild). With a stable HTTP URL, Chromium can keep the decoded
    // bitmap alive across DOM operations → no visible flash on view
    // switches, no flash on Firestore push.
    if (urlPath.startsWith('/img-cache/')) {
      const filename = urlPath.slice('/img-cache/'.length);
      // Defence: only allow the {md5}.{ext} shape we write ourselves, no
      // traversal, no arbitrary path read.
      if (/^[a-f0-9]{32}\.[a-z0-9]+$/i.test(filename) && imgCacheDir) {
        const filePath = path.join(imgCacheDir, filename);
        try {
          const data = fs.readFileSync(filePath);
          const ext  = path.extname(filename).toLowerCase();
          res.writeHead(200, {
            'Content-Type':  MIME[ext] || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
          });
          res.end(data);
          return;
        } catch {
          res.writeHead(404); res.end('Not found'); return;
        }
      }
      res.writeHead(403); res.end('Forbidden'); return;
    }

    if (urlPath === '/' || urlPath === '') urlPath = '/inventory.html';
    const filePath = path.join(rendererDir, urlPath);
    try {
      const data = fs.readFileSync(filePath);
      const ext  = path.extname(filePath).toLowerCase();
      // `no-cache` = revalidate every load. The files come off the local disk, so
      // it costs nothing — and without it a reload (Cmd+R) could run a stale ES
      // module from Chromium's cache after an edit, hiding the change.
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  };

  function tryBind(port) {
    return new Promise((resolve) => {
      const srv = http.createServer(handler);
      srv.once('error', (err) => {
        srv.close();
        if (err.code === 'EADDRINUSE' && port !== 0) {
          // Fixed port taken → retry on any available port
          tryBind(0).then(resolve);
        } else {
          // Should never happen on 127.0.0.1 — resolve safely so the process
          // keeps running rather than crashing with an unhandled rejection.
          console.error(`[Renderer] bind failed: ${err.message}`);
          resolve({ port: 0 });
        }
      });
      srv.listen(port, '127.0.0.1', () => {
        _devServer = srv;
        _devPort   = srv.address().port;
        console.log(`[Renderer] http://127.0.0.1:${_devPort} (loadURL: localhost)`);
        resolve({ port: _devPort });
      });
    });
  }

  return tryBind(RENDERER_PORT);
}

let imgCacheDir;

let mainWindow;
let splashWindow = null; // lightweight launch splash, closed once renderer is ready
let _mainRevealed = false; // guard so revealMainWindow() runs exactly once
let _camWindow = null; // detached camera wall window (optional)

// macOS: the red-button close should HIDE the main window (keeping the app +
// its whole renderer state — Firebase session, inventory, cameras — alive),
// not destroy it. `activate` (dock-click) then re-shows it instantly, with no
// reload and no re-login. `_isQuitting` distinguishes a genuine quit (Cmd+Q,
// updater, app.quit) — where the window must actually close — from a window
// close. Set true on `before-quit`; the migration guard resets it if it
// blocks that quit (see its handler below).
let _isQuitting = false;
app.on('before-quit', () => { _isQuitting = true; });
// autoUpdater.quitAndInstall() (Squirrel) emits `before-quit-for-update`, NOT the
// regular `before-quit`. Without latching here, the macOS `close` handler below
// sees `_isQuitting === false`, hides the window instead of closing it, the app
// never actually quits, and the downloaded update is never installed.
app.on('before-quit-for-update', () => { _isQuitting = true; });

// ── Splash gate ────────────────────────────────────────────────────────────
// Discord-style launch: a small frameless splash shows INSTANTLY (a local page,
// renderer/splash/: no server, no Firebase), while the hidden main window loads
// and hydrates from cache off-screen. It draws the welcome page's ecosystem scene
// (renderer/hero-scene.js), one loading line in the user's language and a bar fed
// by the real startup steps (splashStep). The renderer signals `studio:ready` once
// its first usable frame is painted; the splash then fades out while the main
// window fades in. A hard fallback timer guarantees the main window is always
// revealed even if the signal never arrives.
const SPLASH_STEPS = 5;   // shown · reference data · window loading · page loaded · first paint
const SPLASH_LANGS = ['en', 'fr', 'de', 'es', 'it', 'zh', 'pt', 'pt-pt', 'pl', 'ru', 'nl'];
// <userData>/splash.json = { lang }: the app's language, written by the renderer at
// each launch (studio:ready), read here before anything else has loaded.
const _splashPrefsPath = () => path.join(app.getPath('userData'), 'splash.json');
function _splashLang() {
  try {
    const { lang } = JSON.parse(fs.readFileSync(_splashPrefsPath(), 'utf8'));
    if (SPLASH_LANGS.includes(lang)) return lang;
  } catch (_) {}
  const sys = String(app.getLocale() || 'en').toLowerCase();
  if (sys === 'pt-pt') return 'pt-pt';
  const base = sys.split('-')[0];
  return SPLASH_LANGS.includes(base) ? base : 'en';
}
// The loading lines (locale key splashLoading, an array: one is picked at random).
function _splashLines(lang) {
  const read = l => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'renderer', 'locales', `${l}.json`), 'utf8')).splashLoading; } catch (_) { return null; } };
  const v = read(lang) || read('en');
  return Array.isArray(v) ? v : v ? [String(v)] : [];
}
function _saveSplashLang(lang) {
  if (!SPLASH_LANGS.includes(lang)) return;
  try {
    let was = null;
    try { was = JSON.parse(fs.readFileSync(_splashPrefsPath(), 'utf8')).lang; } catch (_) {}
    if (was !== lang) fs.writeFileSync(_splashPrefsPath(), JSON.stringify({ lang }));
  } catch (e) { console.warn('[splash] lang save failed:', e.message); }
}
let _splashDone = 0;
function splashStep(n) {
  _splashDone = Math.max(_splashDone, n);
  try { splashWindow?.webContents.executeJavaScript(`window.splashStep?.(${_splashDone}, ${SPLASH_STEPS})`).catch(() => {}); } catch (_) {}
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 600, height: 470,
    frame: false, transparent: true, resizable: false, movable: true,
    center: true, show: true, hasShadow: false, alwaysOnTop: true,
    skipTaskbar: true, focusable: false,
    // backgroundThrottling:false — the splash is non-focusable, and Chromium's
    // throttling heuristics can clamp an unfocused window's animations to a low
    // frame rate exactly while startup loads the CPU. Keep it at full rate.
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  _splashDone = 0;
  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash', 'splash.html'), {
    query: { v: app.getVersion(), msg: JSON.stringify(_splashLines(_splashLang())) },
  }).then(() => splashStep(Math.max(1, _splashDone))).catch(() => {});
  const w = splashWindow;
  w.on('closed', () => { if (splashWindow === w) splashWindow = null; });
}

// The swap: the bar full, the splash fades out (splash.css .is-out, 220 ms) while the
// main window fades in from transparent (setOpacity: macOS / Windows; Linux shows it at once).
const SPLASH_FADE_MS = 220;
function revealMainWindow() {
  if (_mainRevealed) return;
  _mainRevealed = true;
  const splash = splashWindow;
  splashWindow = null;
  if (splash && !splash.isDestroyed()) {
    try {
      splash.webContents.executeJavaScript(`window.splashStep?.(${SPLASH_STEPS}, ${SPLASH_STEPS}); window.splashOut?.()`).catch(() => {});
    } catch (_) {}
    setTimeout(() => { try { if (!splash.isDestroyed()) splash.close(); } catch (_) {} }, SPLASH_FADE_MS + 40);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Come back the way the user left it: maximized / full screen are applied
    // here, at reveal, because doing it on the hidden window would show it early.
    const win = mainWindow;
    const st = win._restoreState || {};
    const fade = !st.fullScreen && process.platform !== 'linux';
    if (fade) win.setOpacity(0);
    if (st.maximized) win.maximize();
    win.show();
    if (st.fullScreen) win.setFullScreen(true);
    win.focus();
    if (fade) {
      const t0 = Date.now();
      const tick = setInterval(() => {
        if (win.isDestroyed()) return clearInterval(tick);
        const k = Math.min(1, (Date.now() - t0) / SPLASH_FADE_MS);
        win.setOpacity(k);
        if (k >= 1) clearInterval(tick);
      }, 16);
    }
  }
}

// NFC state — replayed to renderer on every (re)load
const _nfcReaders     = new Map();  // name → reader object
const _nfcCardPresent = new Map();  // name → { uid, rawUid }

// ── Convert hex UID (e.g. "1D895E7C004A80") to decimal string used by TigerTag
// Normalise a raw UID string from nfc-pcsc to clean uppercase hex, matching
// the SDK's tag.uidHex format (e.g. "04:AB:CD" → "04ABCD").
function normalizeUid(raw) {
  return raw ? raw.replace(/[:\s]/g, '').toUpperCase() : raw;
}

// ── TigerTag JS SDK ───────────────────────────────────────────────────────────
// The SDK (≥1.2.0) can lazily build a TigerTagDB that checks api.tigertag.io once
// a day and writes to the OS cache folder. Studio has its own reference-data
// service (services/tigertagDbService.js) and only uses the SDK to encode/decode
// bytes — so it runs strictly offline: no hidden network call, no stray cache.
process.env.TIGERTAG_OFFLINE = '1';
const { TigerTag } = require('tigertag');
const { ndefImage, ndefSize, USER_BYTES: NDEF_USER_BYTES } = require('./services/ndef');

// IPC payload — toRawDict() first, then rawApi() if TigerTag+.
/* The chip carries ONE unit byte for BOTH of its quantities — a real 1 kg tag
   reads `measure: 1, measure_available: 1, id_unit: 35`. Our Firestore doc does
   not follow that convention: `measure` is in the product's unit but
   `weight_available` is always in GRAMS. The SDK's fromCloudDoc takes one of
   each and stamps the doc's unit on both, so a kg spool went onto the chip with
   its remaining weight multiplied by a thousand — and read back as 1 000 000 g.
   Converted here, at the one boundary where a document becomes a chip.
   The field is ALWAYS set, never dropped: fromCloudDoc falls back to
   `doc.measure_gr` when it is missing, and that value is in grams too — leaving
   it out reintroduced the very bug through the back door. A unit coarser than
   the value rounds (1303 g on a kg tag becomes 1 kg); the resolution is the
   format's, not ours, and the next weighing corrects it. */
const CHIP_GRAMS_PER_UNIT = { 10: 0.001, 21: 1, 35: 1000 };   // mg / g / kg
function _docForChip(doc) {
  if (!doc) return doc;
  const per = CHIP_GRAMS_PER_UNIT[doc.id_unit];
  if (!per) return doc;                              // volume / size / area: not a weight
  /* `measure_gr` is the fallback the SDK reaches for when the remaining weight
     is absent — and it is in grams as well, so leaving the field unset put the
     same thousandfold error on the chip by another route. Both candidates are
     converted here; nothing gets to the SDK still expressed in grams. */
  const grams = Number(doc.weight_available ?? doc.measure_gr);
  if (!Number.isFinite(grams)) return doc;           // nothing to convert
  const inUnit = grams / per;
  if (!Number.isInteger(inUnit)) {
    console.warn(`[NFC] remaining weight ${grams} g rounds to ${Math.round(inUnit)} in unit ${doc.id_unit} — the chip cannot hold it exactly`);
  }
  return { ...doc, weight_available: Math.round(inUnit) };
}

async function _sdkPayload(tag, readerName = null) {
  const raw = tag.toRawDict();
  if (readerName) raw._readerName = readerName;
  // A TigerTag+ whose factory signature checks out — the exact test the backend
  // uses to certify a chip (functions/supportWebhooks.js chipValue). Lets the
  // renderer count certified chips apart in its creation counters.
  try { raw._certified = !!tag.isPlus && tag.verify().ok === true; } catch (_) { raw._certified = false; }
  if (tag.apiUrl) {
    try {
      const api = await tag.rawApi();
      raw._api = api; // attach full API response under _api key
    } catch (e) {
      console.warn('[NFC] rawApi() failed, chip data only:', e.message);
    }
  }
  return raw;
}
// True only for an http(s) URL. Every path that hands a URL to the OS shell or
// to a new window goes through this; a scheme that is not provably http(s) is
// refused rather than blocked by name, so a scheme nobody thought of still fails
// closed.
function isSafeExternalUrl(u) {
  try {
    // The web, plus the two schemes that only open a message to write (share by e-mail / SMS).
    const p = new URL(String(u)).protocol;
    return p === 'http:' || p === 'https:' || p === 'mailto:' || p === 'sms:';
  } catch { return false; }
}


// ── Main window size / position memory ─────────────────────────────────────
// <userData>/window-state.json = { x, y, width, height, maximized, fullScreen }.
// Saved whenever the window moves or resizes (debounced) and on close; restored
// at creation — but only if those bounds still land on a connected display
// (a monitor unplugged since last time would otherwise open the app off-screen).
const _winStatePath = () => path.join(app.getPath('userData'), 'window-state.json');
// First launch (nothing saved yet): open maximized — the app wants the room.
const WIN_DEFAULT = { width: 1280, height: 820, maximized: true };
function _readWindowState() {
  let st = null;
  try { st = JSON.parse(fs.readFileSync(_winStatePath(), 'utf8')); } catch (_) { return { ...WIN_DEFAULT }; }
  const ok = n => Number.isFinite(n);
  if (!st || !ok(st.width) || !ok(st.height)) return { ...WIN_DEFAULT };
  const out = { width: Math.max(900, st.width), height: Math.max(600, st.height),
                maximized: !!st.maximized, fullScreen: !!st.fullScreen };
  if (ok(st.x) && ok(st.y)) {
    const { screen } = require('electron');
    // Visible if at least 100×50 px of the title-bar region overlaps a display.
    const onScreen = screen.getAllDisplays().some(({ workArea: d }) =>
      st.x + st.width - 100 > d.x && st.x + 100 < d.x + d.width &&
      st.y + 50 > d.y && st.y < d.y + d.height - 50);
    if (onScreen) { out.x = st.x; out.y = st.y; }
  }
  return out;
}
let _winStateTimer = null;
function _saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    // getNormalBounds() = the size to come back to when un-maximized.
    const b = (win.isMaximized() || win.isFullScreen()) ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(_winStatePath(), JSON.stringify({
      ...b, maximized: win.isMaximized(), fullScreen: win.isFullScreen(),
    }));
  } catch (e) { console.warn('[window] state save failed:', e.message); }
}
function _trackWindowState(win) {
  const later = () => { clearTimeout(_winStateTimer); _winStateTimer = setTimeout(() => _saveWindowState(win), 400); };
  ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'].forEach(ev => win.on(ev, later));
  win.on('close', () => { clearTimeout(_winStateTimer); _saveWindowState(win); });
}

// ── Create main window
function createWindow() {
  // Reset the reveal latch so a window recreated from `activate` (macOS
  // dock-click after the red-button close destroyed the previous one)
  // runs its own splash→reveal cycle. Without this the new window stays
  // hidden forever — `revealMainWindow` short-circuits on the stale flag.
  _mainRevealed = false;
  const winState = _readWindowState();
  mainWindow = new BrowserWindow({
    width: winState.width,
    height: winState.height,
    ...(winState.x != null ? { x: winState.x, y: winState.y } : {}),
    minWidth: 900,
    minHeight: 600,
    title: 'Tiger Studio Manager 2',
    hasShadow: false,
    // Splash gate: start hidden + dark so there's no white flash, then
    // reveal only once the renderer signals its first usable paint
    // (studio:ready) — or the safety fallback below fires.
    show: false,
    backgroundColor: '#0e0e10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,    // required for <webview> Creality camera (cross-origin JS injection)
    },
  });

  mainWindow._restoreState = winState;   // applied at reveal (maximize would show it early)
  _trackWindowState(mainWindow);

  // macOS: red-button close hides the window instead of destroying it, so the
  // renderer (auth session, inventory, live cameras) survives and a dock-click
  // brings it straight back. A real quit (Cmd+Q / updater) sets `_isQuitting`
  // and is let through. Other platforms keep the default close→quit behaviour.
  if (process.platform === 'darwin') {
    mainWindow.on('close', (e) => {
      if (!_isQuitting) {
        e.preventDefault();
        mainWindow.hide();
      }
    });
  }

  // Right-click context menu — native Cut/Copy/Paste/Select-all on any editable
  // field (text/number/url inputs, textareas, contenteditable), plus Copy on any
  // selected text. Uses `role`s for built-in behaviour, but OVERRIDES each label
  // with the app-language string pushed from the renderer (`_ctxMenuLabels`), so the
  // menu matches the in-app language rather than the OS locale. `editFlags` disable
  // actions that don't apply (e.g. Paste with an empty clipboard, Cut with no selection).
  mainWindow.webContents.on('context-menu', (_e, params) => {
    const ef = params.editFlags || {};
    const hasSel = !!(params.selectionText && params.selectionText.trim());
    const L = _ctxMenuLabels || {};   // app-language labels; a falsy label → role default
    const tpl = [];
    if (params.isEditable) {
      tpl.push({ role: 'cut',   label: L.cut,   enabled: !!ef.canCut });
      tpl.push({ role: 'copy',  label: L.copy,  enabled: !!ef.canCopy });
      tpl.push({ role: 'paste', label: L.paste, enabled: !!ef.canPaste });
      tpl.push({ type: 'separator' });
      tpl.push({ role: 'selectAll', label: L.selectAll, enabled: ef.canSelectAll !== false });
    } else if (hasSel) {
      tpl.push({ role: 'copy', label: L.copy, enabled: !!ef.canCopy });
    }
    if (tpl.length) Menu.buildFromTemplate(tpl).popup({ window: mainWindow });
  });

  // Primary reveal signal — renderer posts this after hydrating from cache.
  ipcMain.once('studio:ready', (_e, info) => { _saveSplashLang(info?.lang); revealMainWindow(); });
  // Safety fallback — never leave the app invisible if the signal is missed
  // (renderer crash, blocked script, etc.). 6 s is well past a normal cold
  // start; the studio:ready path almost always wins far sooner.
  setTimeout(revealMainWindow, 6000);

  startRendererServer(__dirname).then(({ port }) => {
    // Always load via 'localhost' (not '127.0.0.1') so Firebase Auth
    // sees a named host and Google sign-in works on all platforms.
    mainWindow.loadURL(`http://localhost:${port}/renderer/inventory.html`);
  });

  // Only http(s) may ever be handed to the OS shell. `javascript:`, `file://`,
  // `smb://` and OS app-schemes are rejected: a renderer foothold — see the
  // stored-XSS class in docs/reviews/ — would otherwise reach the shell through
  // this channel and run something local. Paired with safeHref() in the
  // renderer, which blocks the same schemes at render time; this is the second
  // chokepoint, so a value that slips past the first one still cannot execute.
  // Deliberately not a blocklist: anything not provably http(s) is refused.

  // Navigation lock. The renderer never navigates itself (no location writes,
  // no reloads), so any attempt to leave the app's own origin is either an
  // injected link or a redirect — and the destination would inherit the preload
  // bridge. Same-origin navigation stays allowed; an external http(s) target is
  // handed to the browser instead; anything else is dropped.
  mainWindow.webContents.on('will-navigate', (evt, url) => {
    const here = mainWindow.webContents.getURL();
    let sameOrigin = false;
    try { sameOrigin = new URL(url).origin === new URL(here).origin; } catch { sameOrigin = false; }
    if (sameOrigin) return;
    evt.preventDefault();
    if (isSafeExternalUrl(url)) shell.openExternal(url);
  });

  // Firebase auth popup → ouvrir en interne (postMessage doit fonctionner)
  // Tous les autres liens → navigateur système
  const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://tigertag-connect.firebaseapp.com/__/auth/')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 700,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // nécessaire pour que window.opener.postMessage fonctionne
          },
        },
      };
    }
    if (isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Appliquer un vrai user-agent Chrome sur la fenêtre popup
  // pour que Google ne bloque pas le webview Electron
  mainWindow.webContents.on('did-create-window', (win) => {
    win.webContents.setUserAgent(CHROME_UA);
    // Aussi bloquer les redirections externes depuis le popup auth
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

// ── NFC / RFID reader
// nfc-pcsc wraps @pokusew/pcsclite which calls SCardEstablishContext() at init.
// On Windows machines without an active Smart Card service this call blocks the
// main V8 thread, preventing loadURL() from running and causing "Not Responding".
// On macOS, running pcsclite inside a Worker Thread crashes with SIGABRT because
// the native addon is not thread-safe (it stores the Node env pointer from the
// thread it was initialised on and asserts it is non-null in async callbacks).
//
// Solution: spawn nfc-pcsc in an Electron utilityProcess — a completely isolated
// process (separate heap, separate libuv loop) with no thread-safety concerns.

let _nfcChild = null;
const _nfcReadResolvers  = new Map(); // reqId → { resolve, timeout }
const _nfcWriteResolvers = new Map(); // reqId → { resolve, timeout }

async function _onNfcMessage(msg) {
  switch (msg.type) {
    case 'init-error':
      console.warn('[NFC] not available:', msg.message);
      break;
    case 'reader-connected':
      console.log(`[NFC] Reader connected: ${msg.name}`);
      _nfcReaders.set(msg.name, true);
      mainWindow?.webContents.send('rfid-reader-update', { name: msg.name, connected: true });
      break;
    case 'reader-disconnected':
      console.log(`[NFC] Reader disconnected: ${msg.name}`);
      _nfcReaders.delete(msg.name);
      _nfcCardPresent.delete(msg.name);
      mainWindow?.webContents.send('rfid-reader-update', { name: msg.name, connected: false });
      break;
    case 'card': {
      const uid = normalizeUid(msg.uid); // clean uppercase hex, matches SDK uidHex
      _nfcCardPresent.set(msg.readerName, { uid });
      mainWindow?.webContents.send('rfid-uid', uid);
      mainWindow?.webContents.send('rfid-card-present', { readerName: msg.readerName, uid });
      // Parse chip and send full tag data when pages were auto-read
      // rawPagesHex starts at page 0x04 (UID already known from card event, no need to re-read pages 0-3)
      if (msg.rawPagesHex) {
        try {
          const rawBytes = Buffer.from(msg.rawPagesHex, 'hex');
          const uidBuf   = Buffer.from(uid, 'hex'); // 7 bytes — provided natively by the reader
          const tag      = TigerTag.fromPages(uidBuf, rawBytes);
          console.log(`[NFC] Card present on ${msg.readerName} — uid: ${tag.uidHex}`);
          const payload = await _sdkPayload(tag, msg.readerName);
          // Attach the raw user pages (0x04-0x27) so the renderer's chip census
          // can back up a TigerTag+ signature on auto-read, without a 2nd scan.
          payload._rawPagesHex = msg.rawPagesHex;
          mainWindow?.webContents.send('rfid-tag-scanned', payload);
        } catch (e) {
          console.warn('[NFC] SDK parse failed:', e.message);
        }
      } else {
        console.log(`[NFC] Card present on ${msg.readerName} — uid: ${uid} (no dump)`);
        // Not a TigerTag (a maker's MIFARE Classic chip — Bambu Lab, Creality…): the
        // renderer may have it linked to a spool (docs/LINKED-CHIPS.md).
        const atr = String(msg.atr || '').toLowerCase();
        const card = atr.length >= 30 ? atr.slice(26, 30) : '';
        const chip = card === '0001' ? 'mifare1k' : card === '0002' ? 'mifare4k' : 'unknown';
        mainWindow?.webContents.send('rfid-foreign-chip', { readerName: msg.readerName, uid, chip });
      }
      break;
    }
    case 'card-removed':
      console.log(`[NFC] Card removed from ${msg.readerName}`);
      _nfcCardPresent.delete(msg.readerName);
      mainWindow?.webContents.send('rfid-card-present', { readerName: msg.readerName, uid: null, rawUid: null });
      break;
    case 'reader-error':
      console.error(`[NFC] Reader error on ${msg.readerName}:`, msg.message);
      break;
    case 'nfc-error':
      console.error('[NFC] NFC error:', msg.message);
      break;
    case 'read-result': {
      const entry = _nfcReadResolvers.get(msg.reqId);
      if (!entry) break;
      clearTimeout(entry.timeout);
      _nfcReadResolvers.delete(msg.reqId);
      entry.resolve(msg.ok
        ? { ok: true, rawPagesHex: msg.rawPagesHex }
        : { ok: false, error: msg.error });
      break;
    }
    case 'write-result': {
      const entry = _nfcWriteResolvers.get(msg.reqId);
      if (!entry) break;
      clearTimeout(entry.timeout);
      _nfcWriteResolvers.delete(msg.reqId);
      entry.resolve(msg.ok
        ? { ok: true, pagesWritten: msg.pagesWritten, verified: msg.verified, mismatchPages: msg.mismatchPages }
        : { ok: false, error: msg.error });
      break;
    }
  }
}

// TigerTag chip epoch = 2000-01-01 UTC. The chip timestamp field stores
// seconds since this epoch; passing Unix seconds would decode ~30 years late.
const _TT_EPOCH_MS = Date.UTC(2000, 0, 1);
function _nowChipTs() {
  return Math.max(0, Math.floor((Date.now() - _TT_EPOCH_MS) / 1000));
}

function initNFC() {
  const scriptPath = path.join(__dirname, 'services', 'nfc-process.js');
  try {
    _nfcChild = utilityProcess.fork(scriptPath);
  } catch (err) {
    console.warn('[NFC] utilityProcess not available:', err.message);
    return;
  }

  _nfcChild.on('message', _onNfcMessage);

  _nfcChild.on('exit', (code) => {
    if (code !== 0) console.warn(`[NFC] Utility process exited with code ${code}`);
    _nfcChild = null;
  });
}

// ── USB scale (Dymo M-series) ──────────────────────────────────────────────
// Standard USB HID Scale (usage page 0x8D): 6-byte data reports at ~1 Hz —
// [reportId, status, unit, signed exponent, weight LSB, weight MSB].
// node-hid has no hot-plug events, so we poll the device list every 5 s while
// disconnected and rely on the read-error callback to detect unplug.
//
// SLEEP: an M-series powers itself off after a few idle minutes. On macOS it keeps
// reporting zero frames while off (measured on an M5, "M25" firmware), so nothing
// breaks. On some other machines it stays on the USB bus but goes silent — the
// handle stays open, no error ever fires, and once the scale is switched back on
// it talks on a fresh handle we never opened (issues #74 / #76: "unplug and
// replug to get it back"). So a scale is only
// announced connected on its first REAL frame, and a silence longer than
// SCALE_SILENCE_MS closes the handle and goes back to polling.

let _scaleDev       = null;
let _scalePollTimer = null;
let _scaleInfo      = null;   // { product } while connected (= frames are flowing)
let _scaleLastFrame = 0;      // ms of the last data report
let _scaleWatchdog  = null;
const SCALE_SILENCE_MS = 5000; // the scale reports ~1/s while awake

const SCALE_VENDOR_DYMO = 0x0922;
const SCALE_STATUS = { 1:'fault', 2:'zero', 3:'motion', 4:'stable', 5:'negative', 6:'over' };
const SCALE_OZ_TO_G = 28.3495;

function _scaleBroadcast(channel, payload) {
  mainWindow?.webContents.send(channel, payload);
}

function _scaleDecode(buf) {
  if (!buf || buf.length < 6) return null;
  const status = SCALE_STATUS[buf[1]] || 'unknown';
  const unit   = buf[2]; // 0x02 g, 0x0B oz, 0x0C lb (0x00 on the first frame after tare)
  const exp    = buf[3] > 127 ? buf[3] - 256 : buf[3];
  let   value  = (buf[4] | (buf[5] << 8)) * Math.pow(10, exp);
  let grams;
  if      (unit === 0x02) grams = value;
  else if (unit === 0x0b) grams = value * SCALE_OZ_TO_G;
  else if (unit === 0x0c) grams = value * SCALE_OZ_TO_G * 16;
  else grams = 0; // unit 0x00 quirk right after tare — always a zero frame anyway
  if (status === 'negative') grams = -grams;
  return { status, grams: Math.round(grams) };
}

function _scaleDisconnected() {
  clearInterval(_scaleWatchdog); _scaleWatchdog = null;
  try { _scaleDev?.close(); } catch (_) { /* already gone */ }
  _scaleDev = null;
  if (_scaleInfo) {
    console.log('[Scale] Disconnected');
    _scaleInfo = null;
    _scaleBroadcast('usb-scale-update', { connected: false, product: null });
  }
  if (!_scalePollTimer) _scalePollTimer = setInterval(_tryOpenScale, 5000);
}

/* The HID enumeration MUST be the async one. `HID.devices()` is synchronous and
   ran every 5 s on the main thread; on some Windows machines (slow HID / Bluetooth
   drivers) one call takes seconds, so the whole app froze — every click, even a
   window resize, waited minutes. `devicesAsync()` enumerates on a worker thread,
   and `_scaleScanning` keeps a slow scan from stacking up behind the next tick. */
let _scaleScanning = false;
let _scaleSlowPoll = false;   // polling slowed after a slow HID enumeration
async function _tryOpenScale() {
  if (_scaleDev || _scaleScanning) return;
  let HID;
  try { HID = require('node-hid'); } catch (e) {
    console.warn('[Scale] node-hid unavailable:', e.message);
    clearInterval(_scalePollTimer); _scalePollTimer = null;
    return;
  }
  let info;
  _scaleScanning = true;
  const t0 = Date.now();
  try {
    info = (await HID.devicesAsync()).find(d =>
      d.vendorId === SCALE_VENDOR_DYMO && (d.usagePage === undefined || d.usagePage === 0x8d));
  } catch (_) { return; }
  finally {
    _scaleScanning = false;
    const ms = Date.now() - t0;
    /* A machine whose HID enumeration takes seconds would spend its whole life
       enumerating at a 5 s cadence (one user measured 10 s per scan). Back off
       to once a minute there — plugging a scale in is rare, and still seen. */
    if (ms > 2000) {
      console.warn(`[Scale] USB scan took ${ms} ms — polling slowed to 60 s`);
      if (_scalePollTimer && !_scaleSlowPoll) {
        clearInterval(_scalePollTimer);
        _scalePollTimer = setInterval(_tryOpenScale, 60000);
        _scaleSlowPoll = true;
      }
    }
  }
  if (!info || _scaleDev) return;
  try {
    _scaleDev = new HID.HID(info.path);
  } catch (e) {
    console.warn('[Scale] open failed:', e.message);
    return;
  }
  clearInterval(_scalePollTimer); _scalePollTimer = null;
  const product = info.product || 'USB scale';
  // What the scale says about itself (no serial number on the M-series): maker,
  // USB product id (the reliable model key), firmware release as "1.00".
  const details = {
    manufacturer: info.manufacturer || null,
    productId: Number.isFinite(info.productId) ? `0x${info.productId.toString(16).padStart(4, '0')}` : null,
    firmware: Number.isFinite(info.release) ? `${info.release >> 8}.${String(info.release & 0xff).padStart(2, '0')}` : null,
  };
  _scaleLastFrame = Date.now();
  _scaleDev.on('data', (buf) => {
    _scaleLastFrame = Date.now();
    // Announced on the first real frame — an open handle on a sleeping scale is not a scale.
    if (!_scaleInfo) {
      _scaleInfo = { product, ...details };
      console.log(`[Scale] Connected: ${product} (${details.productId}, fw ${details.firmware})`);
      _scaleBroadcast('usb-scale-update', { connected: true, ..._scaleInfo });
    }
    const frame = _scaleDecode(buf);
    if (frame) _scaleBroadcast('usb-scale-data', frame);
  });
  _scaleDev.on('error', () => _scaleDisconnected()); // unplug or read failure
  // Silence = asleep or replugged elsewhere: drop the handle, poll again.
  clearInterval(_scaleWatchdog);
  _scaleWatchdog = setInterval(() => {
    if (_scaleDev && Date.now() - _scaleLastFrame > SCALE_SILENCE_MS) {
      if (_scaleInfo) console.log(`[Scale] No frame for ${SCALE_SILENCE_MS / 1000} s — closing the handle, scanning again`);
      _scaleDisconnected();
    }
  }, 1000);
}

function initUsbScale() {
  _tryOpenScale();
  if (!_scaleDev && !_scalePollTimer) _scalePollTimer = setInterval(_tryOpenScale, 5000);
  // COMPUTER sleep (issue #138, Windows): the handle opened before the sleep can
  // come back dead without an error or a silence the watchdog would see in time.
  // On wake, drop it and open the scale afresh rather than trust it.
  require('electron').powerMonitor.on('resume', () => {
    console.log('[Scale] System resumed — reopening the scale');
    if (_scaleDev) _scaleDisconnected(); else _tryOpenScale();
  });
}

// Renderer seeds its state on startup (events may have fired before it loaded).
ipcMain.handle('usb-scale:state', () => ({
  connected: !!_scaleInfo,
  product: _scaleInfo?.product || null,
  manufacturer: _scaleInfo?.manufacturer || null,
  productId: _scaleInfo?.productId || null,
  firmware: _scaleInfo?.firmware || null,
}));

// On-demand card read — called by renderer "Read" button in RFID tester.
// Delegates to the NFC utility process and parses the result here in the main process.
ipcMain.handle('rfid:read-now', async (_evt, readerName) => {
  if (!_nfcChild)                      return { ok: false, error: 'NFC process not running' };
  if (!_nfcReaders.has(readerName))    return { ok: false, error: 'Reader not connected' };
  const card = _nfcCardPresent.get(readerName);
  if (!card)                           return { ok: false, error: 'No card present' };

  const reqId = Date.now() + Math.random();
  const result = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      _nfcReadResolvers.delete(reqId);
      resolve({ ok: false, error: 'Read timed out' });
    }, 5000);
    _nfcReadResolvers.set(reqId, { resolve, timeout });
    _nfcChild.postMessage({ type: 'read-now', readerName, reqId });
  });

  if (!result.ok) return result;
  let tagData = null;
  try {
    const rawBytes = Buffer.from(result.rawPagesHex, 'hex'); // pages 0x04-0x27, UID already in card.uid
    const uidBuf   = Buffer.from(card.uid, 'hex');           // 7-byte UID, provided natively by reader
    const tag      = TigerTag.fromPages(uidBuf, rawBytes);
    tagData        = await _sdkPayload(tag);
    console.log('[NFC] read-now result: is_maker=%s is_plus=%s is_signed=%s', tag.isMaker, tag.isPlus, tag.isSigned);
  } catch (e) {
    console.warn('[NFC] read-now parse failed:', e.message);
  }
  return { ok: true, uid: card.uid, rawPagesHex: result.rawPagesHex, tagData };
});

// Tag write — called by the renderer to program a TigerTag chip.
//
// opts = {
//   readerName : string          — which reader holds the chip
//   cloudDoc   : object          — Firestore cloud doc shape (id_brand, id_material, data1-data7, TD, …)
//   patch      : object | null   — optional snake_case overrides applied AFTER fromCloudDoc()
//                                  e.g. { td_raw: 5, custom_message: "Hello" }
//   surgical   : boolean         — default true: only write pages that differ from current chip data
//                                  false: always write all 20 user pages (0x04-0x17)
// }
//
// Returns { ok, pagesWritten } | { ok: false, error }
//
// Hardware note — NTAG213/215 page write limit:
//   The WRITE command (0xA2) writes exactly 4 bytes (1 page) per APDU. There is no
//   multi-page WRITE APDU for NTAG. "Bulk" in nfc-pcsc means calling write() in a
//   loop internally — still 1 APDU per page. Surgical mode minimises round-trips by
//   skipping pages whose bytes haven't changed.
ipcMain.handle('rfid:write-now', async (_evt, opts) => {
  const { readerName, cloudDoc, patch = null, surgical = true } = opts || {};
  if (!_nfcChild)                    return { ok: false, error: 'NFC process not running' };
  if (!_nfcReaders.has(readerName))  return { ok: false, error: 'Reader not connected' };
  const card = _nfcCardPresent.get(readerName);
  if (!card)                         return { ok: false, error: 'No card present' };

  // ── 1. Build the 80-byte payload from cloud doc ─────────────────────────────
  let newBytes;
  try {
    let tag = TigerTag.fromCloudDoc(_docForChip(cloudDoc)).patch(_tagInfoPatch(cloudDoc));
    if (patch && Object.keys(patch).length > 0) tag.patchFromRawDict(patch);
    newBytes = tag.toBytes(); // 80 bytes covering pages 0x04-0x17
  } catch (e) {
    return { ok: false, error: `SDK build failed: ${e.message}` };
  }

  // ── 2. Surgical diff — read current chip, skip unchanged pages ───────────────
  let pages; // [{ index, hexData }] — page indices are absolute (4 = page 0x04)
  if (surgical) {
    // Read current chip bytes to compare
    const reqId = Date.now() + Math.random();
    const readResult = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        _nfcReadResolvers.delete(reqId);
        resolve({ ok: false, error: 'Read timed out' });
      }, 5000);
      _nfcReadResolvers.set(reqId, { resolve, timeout });
      _nfcChild.postMessage({ type: 'read-now', readerName, reqId });
    });

    if (!readResult.ok) {
      // Fall back to full write if read fails
      console.warn('[NFC] write surgical read failed, falling back to full write:', readResult.error);
      pages = _pagesToWrite(newBytes, null);
    } else {
      // rawPagesHex now starts at page 0x04 — first 80 bytes are pages 0x04-0x17 (toBytes() range)
      const oldUserBytes = Buffer.from(readResult.rawPagesHex, 'hex').slice(0, 80);
      pages = _pagesToWrite(_keepChipIdentity(newBytes, oldUserBytes), oldUserBytes);
    }
  } else {
    pages = _pagesToWrite(newBytes, null); // full write — all 20 pages
  }

  if (pages.length === 0) {
    console.log('[NFC] write-now: chip already up-to-date, 0 pages written');
    return { ok: true, pagesWritten: 0 };
  }

  console.log(`[NFC] write-now: writing ${pages.length}/20 pages to ${readerName} (${surgical ? 'surgical' : 'full'})`);

  // ── 3. Send pages to NFC utility process ────────────────────────────────────
  const reqId = Date.now() + Math.random();
  const result = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      _nfcWriteResolvers.delete(reqId);
      resolve({ ok: false, error: 'Write timed out' });
    }, 10000);
    _nfcWriteResolvers.set(reqId, { resolve, timeout });
    _nfcChild.postMessage({ type: 'write-now', readerName, reqId, pages });
  });

  if (result.ok) {
    console.log(`[NFC] write-now: OK — ${result.pagesWritten} page(s) written`);
  } else {
    console.error('[NFC] write-now failed:', result.error);
  }
  return result;
});

// Build the page-write list from RAW bytes (pages start at `startPage`, 4 bytes
// each). Surgical: skip pages whose 4 bytes already match the chip's content.
function _pagesFromBytes(newBytes, oldBytes, startPage) {
  const pages = [];
  const n = Math.floor(newBytes.length / 4);
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    const np = newBytes.slice(off, off + 4);
    if (oldBytes && off + 4 <= oldBytes.length && np.equals(oldBytes.slice(off, off + 4))) continue;
    pages.push({ index: startPage + i, hexData: np.toString('hex') });
  }
  return pages;
}

// Repair / restore a chip from its rfidList backup — write the raw payload
// (pages 0x04-0x27) straight back. NO TigerTag SDK: we already hold the exact
// original bytes, so nothing is rebuilt from the cloud doc. Hard-guarded to
// only ever write onto the chip whose UID matches the backup (never clone one
// chip's signed payload onto another). Surgical: only pages that differ from the
// chip's current content are rewritten (locked-but-matching identity/signature
// pages are skipped). The write path reads back + reports `verified`.
//   opts = { readerName, uid, hex }   // uid = the backup's own chip UID
//   → { ok, pagesWritten, verified, mismatchPages } | { ok:false, error }
ipcMain.handle('rfid:repair', async (_evt, opts) => {
  const { readerName, uid, hex } = opts || {};
  if (!_nfcChild)                   return { ok: false, error: 'NFC process not running' };
  if (!_nfcReaders.has(readerName)) return { ok: false, error: 'Reader not connected' };
  const card = _nfcCardPresent.get(readerName);
  if (!card)                        return { ok: false, error: 'No card present' };
  // UID guard — the chip on THIS reader must be the backup's own chip.
  if (!uid || normalizeUid(card.uid) !== normalizeUid(uid))
    return { ok: false, error: 'uid-mismatch' };
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 8 !== 0)
    return { ok: false, error: 'invalid-backup' };
  const newBytes = Buffer.from(hex, 'hex'); // pages 0x04.., 4 bytes/page

  // Surgical diff — read current chip pages 0x04-0x27, skip matching pages.
  let oldBytes = null;
  const rReq = Date.now() + Math.random();
  const rRes = await new Promise((resolve) => {
    const to = setTimeout(() => { _nfcReadResolvers.delete(rReq); resolve({ ok: false }); }, 5000);
    _nfcReadResolvers.set(rReq, { resolve, timeout: to });
    _nfcChild.postMessage({ type: 'read-now', readerName, reqId: rReq });
  });
  if (rRes.ok) oldBytes = Buffer.from(rRes.rawPagesHex, 'hex');

  const pages = _pagesFromBytes(newBytes, oldBytes, 0x04);
  if (pages.length === 0) return { ok: true, pagesWritten: 0, verified: true };

  const wReq = Date.now() + Math.random();
  const result = await new Promise((resolve) => {
    const to = setTimeout(() => { _nfcWriteResolvers.delete(wReq); resolve({ ok: false, error: 'Write timed out' }); }, 15000);
    _nfcWriteResolvers.set(wReq, { resolve, timeout: to });
    _nfcChild.postMessage({ type: 'write-now', readerName, reqId: wReq, pages });
  });
  console.log(`[NFC] repair ${uid}: ${result.ok ? result.pagesWritten + ' page(s), verified=' + result.verified : 'FAILED ' + result.error}`);
  return result;
});

// Write a fixed 144-byte user-memory image onto one or more chips. Shared by the
// two chip-reset actions below — the only thing that differs is the image:
//   • rfid:format → TigerTag Init payload (SDK `TigerTag.asInit`)
//   • rfid:erase  → blank NDEF          (SDK `TigerTag.erase`)
// `buildImage(uidBuf)` returns the 144-byte target for a given chip UID. Each
// target is UID-guarded (the chip on the reader must match the UID the renderer
// expects, so with two readers/two chips present we never touch the wrong one),
// surgical (skips pages already matching) + read-back verify.
//   → { ok, results: [{ readerName, uid, ok, pagesWritten?, verified?, error? }] }
async function _writeChipImage(targets, buildImage, logLabel) {
  const results = [];
  for (const { readerName, uid } of (Array.isArray(targets) ? targets : [])) {
    const fail = (error) => results.push({ readerName, uid, ok: false, error });
    if (!_nfcReaders.has(readerName)) { fail('Reader not connected'); continue; }
    const card = _nfcCardPresent.get(readerName);
    if (!card) { fail('No card present'); continue; }
    if (uid && normalizeUid(card.uid) !== normalizeUid(uid)) { fail('uid-mismatch'); continue; }

    // 144 bytes (the TigerTag region) — more for an NDEF message on a NTAG215/216.
    let newBytes;
    try { newBytes = await buildImage(Buffer.from(normalizeUid(card.uid), 'hex'), readerName); }
    catch (e) { fail(e.message); continue; }

    // Surgical diff — read current user pages, skip the ones already matching.
    let oldBytes = null;
    const rReq = Date.now() + Math.random();
    const rRes = await new Promise((resolve) => {
      const to = setTimeout(() => { _nfcReadResolvers.delete(rReq); resolve({ ok: false }); }, 5000);
      _nfcReadResolvers.set(rReq, { resolve, timeout: to });
      _nfcChild.postMessage({ type: 'read-now', readerName, reqId: rReq, ...(newBytes.length > 144 ? { length: newBytes.length } : {}) });
    });
    if (rRes.ok) oldBytes = Buffer.from(rRes.rawPagesHex, 'hex');

    const pages = _pagesFromBytes(newBytes, oldBytes, 0x04);
    if (pages.length === 0) {
      results.push({ readerName, uid: normalizeUid(card.uid), ok: true, pagesWritten: 0, verified: true });
      continue;
    }
    const wReq = Date.now() + Math.random();
    const wRes = await new Promise((resolve) => {
      const to = setTimeout(() => { _nfcWriteResolvers.delete(wReq); resolve({ ok: false, error: 'Write timed out' }); }, 15000);
      _nfcWriteResolvers.set(wReq, { resolve, timeout: to });
      _nfcChild.postMessage({ type: 'write-now', readerName, reqId: wReq, pages, verify: true });
    });
    console.log(`[NFC] ${logLabel} ${normalizeUid(card.uid)}: ${wRes.ok ? wRes.pagesWritten + ' page(s), verified=' + wRes.verified : 'FAILED ' + wRes.error}`);
    results.push({ readerName, uid: normalizeUid(card.uid), ...wRes });
  }
  return { ok: results.some(r => r.ok), results };
}

// Reset one or more chips to the official TigerTag Init state (SDK
// `TigerTag.asInit()`, id_tigertag = TIGER_TAG_INIT, id_product = 0, fresh
// timestamp) so the chip is reserved-for-TigerTag and ready to receive new data.
// An Init chip carries no material/brand, so it does NOT parse as a spool —
// re-reading it never resurrects the previous one. The 80-byte Init payload goes
// over pages 0x04-0x17; the rest of the user region (0x18-0x27, any residual
// TigerTag+ signature) is zeroed → a clean 144-byte Init image.
//   opts = { targets: [{ readerName, uid }] }
ipcMain.handle('rfid:format', async (_evt, { targets } = {}) => {
  if (!_nfcChild) return { ok: false, error: 'NFC process not running' };
  return _writeChipImage(targets, (uidBuf) => {
    const initBytes = TigerTag.asInit(uidBuf).toBytes(false); // 80 bytes
    return Buffer.concat([initBytes, Buffer.alloc(144 - initBytes.length)]);
  }, 'init');
});

// Erase one or more chips back to blank NDEF (SDK `TigerTag.erase()` — a zeroed
// 80-byte user-data payload). This drops the chip out of the TigerTag format
// entirely (id_tigertag = 0 = uninitialized), turning it back into a plain blank
// NFC tag. The whole 144-byte user region is zeroed (Init's 80 bytes + signature
// region) so nothing of the old spool remains.
//   opts = { targets: [{ readerName, uid }] }
ipcMain.handle('rfid:erase', async (_evt, { targets } = {}) => {
  if (!_nfcChild) return { ok: false, error: 'NFC process not running' };
  return _writeChipImage(targets, () => {
    const eraseBytes = TigerTag.erase(); // 80 zero bytes — blank NDEF
    return Buffer.concat([eraseBytes, Buffer.alloc(144 - eraseBytes.length)]);
  }, 'erase');
});

// The NDEF room of the chip on a reader, from its capability container (page 3,
// byte 2 × 8): 144 bytes on a NTAG213, 496 on a NTAG215, 872 on a NTAG216. A chip
// without a valid container (no 0xE1 magic) counts as the 144-byte TigerTag region.
async function _ndefCapacity(readerName) {
  if (!_nfcCardPresent.get(readerName)) return NDEF_USER_BYTES;
  const reqId = Date.now() + Math.random();
  const res = await new Promise((resolve) => {
    const to = setTimeout(() => { _nfcReadResolvers.delete(reqId); resolve({ ok: false }); }, 5000);
    _nfcReadResolvers.set(reqId, { resolve, timeout: to });
    _nfcChild.postMessage({ type: 'read-now', readerName, reqId, start: 3, length: 4 });
  });
  const cc = res.ok ? Buffer.from(res.rawPagesHex, 'hex') : null;
  return cc && cc[0] === 0xE1 && cc[2] ? cc[2] * 8 : NDEF_USER_BYTES;
}

// Write an NDEF message (a link, Wi-Fi, a contact, e-mail / phone / SMS) onto one
// or more NTAGs, the way a phone reads it (services/ndef.js): at least the 144-byte
// TigerTag region is rewritten, so any TigerTag data on the chip goes; a longer
// message uses the room a NTAG215/216 has (`_ndefCapacity`), checked per chip.
// The content itself (a Wi-Fi password…) is never logged.
//   opts = { targets: [{ readerName, uid }], message: { type, … } }
//   → { ok, results } — a chip too small fails with 'ndef-too-long'
ipcMain.handle('rfid:write-ndef', async (_evt, { targets, message } = {}) => {
  if (!_nfcChild) return { ok: false, error: 'NFC process not running' };
  try { ndefImage(message, Infinity); }
  catch (e) { return { ok: false, error: e.message }; }
  return _writeChipImage(targets, async (_uid, readerName) => ndefImage(message, await _ndefCapacity(readerName)), 'ndef');
});
// Bytes an NDEF content takes on the chip (live counter in the NFC tools form).
ipcMain.handle('rfid:ndef-size', (_evt, message) => ndefSize(message));
// NDEF room of the chip on a reader, in bytes (the counter's maximum).
ipcMain.handle('rfid:ndef-capacity', (_evt, readerName) => _nfcChild ? _ndefCapacity(readerName) : NDEF_USER_BYTES);

// Cloud → chip encoding — called when the user wants to program a Cloud spool onto
// one or two physical RFID chips.
//
// opts = {
//   cloudDoc : Firestore doc (id_material, data1-7, color_*, weight_available, …)
//   targets  : [{ readerName, uid }]  — readers holding one of THIS spool's chips
//              UID is known by the renderer from state.nfcCardPresent
// }
//
// The payload is built ONCE (toBytes() called once) so that both chips receive
// the same data and timestamp; each chip keeps its own tag index/count byte
// (offset 39) through `_keepChipIdentity`.
//
// Returns { ok, results: [{ readerName, uid, ok, pagesWritten?, error? }] }
ipcMain.handle('rfid:encode-cloud', async (_evt, { cloudDoc, targets }) => {
  if (!_nfcChild) return { ok: false, error: 'NFC process not running' };
  if (!Array.isArray(targets) || targets.length === 0)
    return { ok: false, error: 'No target readers provided' };

  // ── Build payload ONCE — same bytes → same timestamp for all chips ──────────
  // Twins pair on the timestamp, so it is stamped once here (not per chip).
  // Used both as the write source and the diff reference.
  let newBytes;
  try {
    // KEEP the doc's timestamp. Both callers of this handler update a chip that
    // already has a Firestore document — creation goes through `rfid:burn-one`,
    // which is handed its timestamp and records it on the doc. Stamping a fresh
    // one here left the chip and its own document disagreeing, so the next read
    // saw "timestamp changed" — the test for a chip reprogrammed ELSEWHERE — and
    // deleted the document to start clean, taking the user's weight, masterspool
    // and rack with it. This is only the best value to START from: whenever the
    // chip can be read, `_keepChipIdentity` overlays the chip's own before the
    // diff, so the creation date and the tag index/count are never rewritten
    // even by a drifted document.
    const _keepTs = Number(cloudDoc?.timestamp) > 0 ? Number(cloudDoc.timestamp) : _nowChipTs();
    let tag = TigerTag.fromCloudDoc(_docForChip(cloudDoc)).patch({ timestamp: _keepTs, ..._tagInfoPatch(cloudDoc) });
    // The displayed colour lives in `online_color_list` (hex) and is what the
    // user edits — the doc's baked color_r/g/b can lag behind it. So when a
    // colour list is present, it is the source of truth: patch the chip colour
    // bytes from it. Otherwise fromCloudDoc's color_r/g/b are used as-is.
    const _list = Array.isArray(cloudDoc.online_color_list) ? cloudDoc.online_color_list : [];
    const _rgb = (h) => {
      const s = String(h || '').replace(/^#/, '');
      if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
      const n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    if (_list.length && _rgb(_list[0])) {
      const c1 = _rgb(_list[0]), c2 = _rgb(_list[1]), c3 = _rgb(_list[2]);
      tag = tag.patch({
        color1R: c1[0], color1G: c1[1], color1B: c1[2],
        color2R: c2 ? c2[0] : 0, color2G: c2 ? c2[1] : 0, color2B: c2 ? c2[2] : 0,
        color3R: c3 ? c3[0] : 0, color3G: c3 ? c3[1] : 0, color3B: c3 ? c3[2] : 0,
      });
    }
    newBytes = tag.toBytes(false); // 80 bytes, pages 0x04-0x17
  } catch (e) {
    return { ok: false, error: `SDK build failed: ${e.message}` };
  }

  // Surgical read of the current chip (pages 0x04-…) so we only rewrite the
  // pages that actually changed — never touch locked identity/signature pages
  // that already match (they'd fail the write and are unchanged anyway).
  const _readChip = (readerName) => new Promise((resolve) => {
    const reqId = Date.now() + Math.random();
    const timeout = setTimeout(() => { _nfcReadResolvers.delete(reqId); resolve({ ok: false, error: 'Read timed out' }); }, 5000);
    _nfcReadResolvers.set(reqId, { resolve, timeout });
    _nfcChild.postMessage({ type: 'read-now', readerName, reqId });
  });
  // Write with read-back verification so we only report success (and let the
  // renderer clear the "needs update" flag) once the chip really holds the bytes.
  const _writeChip = (readerName, pages) => new Promise((resolve) => {
    const reqId = `encode-${Date.now()}-${Math.random()}`;
    const timeout = setTimeout(() => { _nfcWriteResolvers.delete(reqId); resolve({ ok: false, error: 'Write timed out' }); }, 10000);
    _nfcWriteResolvers.set(reqId, { resolve, timeout });
    _nfcChild.postMessage({ type: 'write-now', readerName, reqId, pages, verify: true });
  });

  const results = [];
  for (const { readerName, uid } of targets) {
    if (!_nfcReaders.has(readerName)) {
      results.push({ readerName, uid, ok: false, error: 'Reader not connected' });
      continue;
    }
    const card = _nfcCardPresent.get(readerName);
    if (!card) {
      results.push({ readerName, uid, ok: false, error: 'No card present' });
      continue;
    }
    // ── UID guard ──────────────────────────────────────────────────────────
    // NEVER write this spool's doc onto a chip that isn't the requested one.
    // The renderer only sends targets that belong to the open spool; this is
    // the last-line check against a chip swap between the click and the write.
    if (uid && card.uid && normalizeUid(String(card.uid)) !== normalizeUid(String(uid))) {
      results.push({ readerName, uid, ok: false, error: 'UID mismatch — chip on reader is not the target' });
      console.warn(`[NFC] encode-cloud: ${readerName} UID mismatch (present ${card.uid} ≠ target ${uid}) — skipped`);
      continue;
    }

    // ── Surgical diff — read current chip, write only changed pages ──────────
    let pages;
    const rd = await _readChip(readerName);
    if (rd.ok && rd.rawPagesHex) {
      const oldUserBytes = Buffer.from(rd.rawPagesHex, 'hex').slice(0, 80);
      pages = _pagesToWrite(_keepChipIdentity(newBytes, oldUserBytes), oldUserBytes);
    } else {
      console.warn(`[NFC] encode-cloud: ${readerName} surgical read failed, full write:`, rd.error);
      pages = _pagesToWrite(newBytes, null);
    }

    if (pages.length === 0) {
      // Chip already carries the new bytes — nothing to write, already in sync.
      results.push({ readerName, uid, ok: true, verified: true, pagesWritten: 0 });
      console.log(`[NFC] encode-cloud: ${readerName} (${uid}) — already up-to-date`);
      continue;
    }

    const result = await _writeChip(readerName, pages);
    const verified = result.ok === true && result.verified === true;
    results.push({ readerName, uid, ok: result.ok === true, verified, pagesWritten: result.pagesWritten, mismatchPages: result.mismatchPages || [], error: result.error || null });
    if (verified) {
      console.log(`[NFC] encode-cloud: ${readerName} (${uid}) — ${result.pagesWritten} pages written + verified`);
    } else {
      console.error(`[NFC] encode-cloud: ${readerName} failed/unverified:`, result.error || `mismatch ${JSON.stringify(result.mismatchPages || [])}`);
    }
  }

  // Overall success = at least one chip written AND verified (or already in sync).
  return { ok: results.some(r => r.ok && r.verified === true), results };
});

// ── Burn ONE chip with read-back verification ─────────────────────────────────
// Drives the guided dual-chip encode modal: the renderer orchestrates the
// sequence (one call per chip, 100 ms gap, presence re-check) and passes a
// SINGLE fixed `timestamp` (chip-epoch seconds) — the twin pairing key — plus
// `tagCount` (chips in the sequence) and `tagIndex` (this chip's rank, from 1),
// stamped at offset 39 (0x11 single, 0x12 / 0x22 twin). Twins therefore differ
// in that one byte: they pair on the timestamp, never on identical bytes. Returns { ok, verified, uid, pagesWritten,
// mismatchPages, error }. Success for the caller = ok && verified.
ipcMain.handle('rfid:burn-one', async (_evt, { cloudDoc, timestamp, readerName, tagCount, tagIndex }) => {
  if (!_nfcChild)                     return { ok: false, error: 'NFC process not running' };
  if (!readerName || !_nfcReaders.has(readerName))
    return { ok: false, error: 'Reader not connected' };
  const card = _nfcCardPresent.get(readerName);
  if (!card)                          return { ok: false, error: 'No card present' };

  let pages;
  try {
    const ts  = Number.isFinite(timestamp) ? (timestamp >>> 0) : _nowChipTs();
    const info = _tagInfoPatch({ tag_count: tagCount, tag_index: tagIndex });
    const tag = TigerTag.fromCloudDoc(_docForChip(cloudDoc)).patch({ timestamp: ts, ...info });
    pages = _pagesToWrite(tag.toBytes(false), null); // full write — blank chip
  } catch (e) {
    return { ok: false, error: `SDK build failed: ${e.message}` };
  }

  const reqId = `burn-${Date.now()}-${Math.random()}`;
  const result = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      _nfcWriteResolvers.delete(reqId);
      resolve({ ok: false, error: 'Write timed out' });
    }, 10000);
    _nfcWriteResolvers.set(reqId, { resolve, timeout });
    _nfcChild.postMessage({ type: 'write-now', readerName, reqId, pages, verify: true });
  });

  // Capture the UID actually on the reader at write time (the doc id to create).
  const uid = (_nfcCardPresent.get(readerName) || card).uid || null;
  const verified = result.ok === true && result.verified === true;
  if (verified) {
    console.log(`[NFC] burn-one: ${readerName} (${uid}) — ${result.pagesWritten} pages, verified`);
  } else {
    console.error(`[NFC] burn-one: ${readerName} failed:`, result.error || `unverified pages ${JSON.stringify(result.mismatchPages || [])}`);
  }
  return {
    ok: result.ok === true,
    verified,
    uid,
    pagesWritten: result.pagesWritten,
    mismatchPages: result.mismatchPages || [],
    error: result.error || null,
  };
});

// ── Refresh TigerTag+ API data from product catalogue ─────────────────────────
// Takes an existing Firestore raw doc (must have id_product + id_tigertag set),
// builds a TigerTag via fromCloudDoc(), calls rawApi(), returns the _api payload.
// Returns { ok: true, api } | { ok: false, error }
ipcMain.handle('rfid:refresh-api', async (_evt, rawDoc) => {
  try {
    if (!rawDoc.id_product || !rawDoc.uid) return { ok: false, error: 'missing_fields' };
    // fromCloudDoc() doesn't forward uid → uidHex is null → apiUrl has no uid= param → HTTP 400.
    // Build the URL ourselves: uid must be passed as decimal (BigInt of the hex UID).
    const uidDecimal = BigInt('0x' + rawDoc.uid).toString();
    const url = `https://api.tigertag.io/api:tigertag/product/get?uid=${uidDecimal}&product_id=${rawDoc.id_product}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    let api;
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      api = await resp.json();
    } finally {
      clearTimeout(timer);
    }
    return { ok: true, api };
  } catch (e) {
    console.error('[NFC] refresh-api failed:', e.message);
    return { ok: false, error: e.message };
  }
});

// ── Xano chip-event analytics ─────────────────────────────────────────────────
// Reports physical-chip events (read / write / reset / recycle) and every spool's
// create / edit / delete
// (any format, chipless included) to the TigerTag Xano analytics table, mirroring what the mobile app (Tiger RFID Connect,
// lib/services/analytics_service.dart) already sends — so both apps land in the
// same table with the same shape.
//
// TRANSPORT — deliberately odd, and NOT ours to change: it is a **GET** whose
// payload is the JSON, base64-encoded, carried in the `X-TigerTag-Analytics`
// header. Xano decodes that header. (Not a POST body.) Endpoint is
// unauthenticated.
//
// WHY FROM THE MAIN PROCESS. The renderer is a browser context: a cross-origin
// GET carrying a custom header would trigger a CORS preflight, which this
// endpoint does not answer. Node has no CORS — so the renderer hands us the
// payload over IPC and we do the request. (Same reason `rfid:refresh-api` and
// `rfid:lookup-product` live here.)
//
// Fire-and-forget by construction (`ipcMain.on`, not `handle`): a failed or
// offline event is dropped, never retried, and can never block or slow a chip
// action. Server-side counts are therefore a lower bound — same contract as the
// mobile app.
//
// The renderer builds the domain payload (operation, chip fields, UID in DECIMAL
// — Xano keys on decimal — plus Country / Locale / Timezone). We add only what
// the main process knows: the platform, the app version, and `App`, which tags
// the row as coming from Studio rather than mobile.
//
// NOTE ON `Location`: the renderer always sends "0.0,0.0" — the convention
// shared with the mobile app for "no position". Studio does NOT collect a
// position. A desktop machine doesn't move, so a precise coordinate would reveal
// the user's home address and answer no analytical question that `Country`
// (derived offline from the timezone, no IP lookup) doesn't already answer.
// Seeing "0.0,0.0", Xano locates the event itself from the request's IP, to the
// city, on its own side. Studio sends no IP and must not.
const XANO_ANALYTICS_URL = 'https://api.tigertag.io/api:tigertag/analytics/tag';
const XANO_PRODUCT_URL   = 'https://api.tigertag.io/api:tigertag/product/get';

// Node's platform names are kernel names, not product names: "darwin" is macOS and
// "win32" is ALL Windows (64-bit included — it's a legacy name, not a bitness). Next
// to the mobile app's plain "ios" / "android" in the same Xano column, they'd read
// like noise and "win32" would be actively misleading. Send the product name.
const XANO_PLATFORM = { darwin: 'macos', win32: 'windows', linux: 'linux' };

// TWO endpoints, ONE header — the Operation decides which, because only one of them
// can record the catalogue product id:
//
//  • `online` (a TigerTag+ whose chip carries a catalogue product) → product/get.
//    That endpoint takes `product_id` as a QUERY input and forwards it to the same
//    `Analytics Header Data to DB` function, so the row lands WITH the product. It
//    also returns the product payload, which we ignore (Studio fetches that on its
//    own path) — here we only want the analytics side-effect, and Xano records it
//    in a Post-Process block, i.e. AFTER responding, so it costs the user nothing.
//    Xano only records it when `product_id > 500`: ids below that are the reserved
//    range for internal/demo chips, deliberately kept out of the analytics.
//
//  • everything else (`read` on a maker chip, `write`, `reset`, `nfc_init`) →
//    analytics/tag, which has no product_id input at all.
//
// BOTH read the SAME base64 `X-Tigertag-Analytics` header: it is literally how
// product/get detects an app call, and the function aborts on its `DATA != null`
// precondition without it. (The mobile has a second, header-per-field variant for
// `online` that sends no such header — so that path writes nothing. Worth fixing
// on the mobile side.)
//
// FAILURES ARE COUNTED, never retried. A rejected event is logged at `warn`
// with Xano's `{ code, message }`, and `_analyticsStats` keeps the session's
// outcomes for `app:info` (diagnostic report, in-app report errors), so a
// support report shows at once when analytics are failing. (From 2026-09-18
// Xano rejected almost every Studio event with HTTP 400 for 48 days, logged at
// `info` with the status only, and nobody saw it.)
// Only analytics/tag failures reach us: `online` is recorded in product/get's
// Post-Process step, AFTER it answered, so product/get still says 200 when that
// write fails.
//
// ONE QUEUE, PACED. Every event — a single scan or the 500 `create` of a `.ttag`
// import — goes through `_analyticsQueue`, sent at most 4 a second. It lives in
// memory and holds 5 000 events at most; past that an event is counted in
// `overflow` instead of being dropped unseen. Nothing waits on it: the IPC
// returns at once, the chip action and the UI never see the queue. On quit, what
// is left gets up to 1.5 s to go (`will-quit`), then the rest is lost — same
// lower-bound contract as above.
const ANALYTICS_RATE_MS = 250;        // 4 requests a second
const ANALYTICS_QUEUE_MAX = 5000;
const _analyticsQueue = [];
const _analyticsStats = { sent: 0, failed: 0, queued: 0, overflow: 0, lastError: null };
function _analyticsFailed(operation, status, code, message) {
  _analyticsStats.failed++;
  _analyticsStats.lastError = { at: new Date().toISOString(), operation, status, code, message };
}

function _analyticsSend(payload) {
  const body = {
    ...payload,
    Platform: XANO_PLATFORM[process.platform] || process.platform,
    AppVersion: app.getVersion(),
    App: 'studio',                     // tells Studio rows apart from mobile ones
  };
  const url = body.Operation === 'online'
    ? `${XANO_PRODUCT_URL}?uid=${encodeURIComponent(body.Uid)}&product_id=${encodeURIComponent(body.IdProduct)}`
    : XANO_ANALYTICS_URL;
  const json = JSON.stringify(body);
  const encoded = Buffer.from(json, 'utf8').toString('base64');
  const who = body.Uid || body.SpoolId || '';

  // Log BOTH forms: the readable payload (what Xano will see once it decodes the
  // header) and the exact base64 that goes on the wire — so a wrong field can be
  // spotted without decoding anything by hand.
  log.info(`[analytics] → ${json}`);
  log.info(`[analytics] X-TigerTag-Analytics: ${encoded}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  return fetch(url, {
    headers: { 'Content-Type': 'application/json', 'X-TigerTag-Analytics': encoded },
    signal: controller.signal,
  })
    .then(async (resp) => {
      _analyticsStats.sent++;
      if (resp.ok) { log.info(`[analytics] ${body.Operation} ${who} → HTTP ${resp.status}`); return; }
      // Xano answers `{ code, message, payload }`; anything else is kept raw, cut short.
      const text = await resp.text().catch(() => '');
      let code = null, message = text.slice(0, 300);
      try { const j = JSON.parse(text); code = j.code ?? null; message = String(j.message ?? message).slice(0, 300); } catch (_) {}
      _analyticsFailed(body.Operation, resp.status, code, message);
      log.warn(`[analytics] ${body.Operation} rejected → HTTP ${resp.status}${code ? ` ${code}` : ''}: ${message}`);
    })
    .catch((e) => {
      _analyticsFailed(body.Operation, null, e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', e.message);
      log.warn(`[analytics] ${body.Operation} dropped: ${e.message}`);
    })
    .finally(() => clearTimeout(timer));
}

let _analyticsTimer = null;
function _analyticsPump() {
  if (_analyticsTimer) return;
  const next = () => {
    const payload = _analyticsQueue.shift();
    _analyticsStats.queued = _analyticsQueue.length;
    if (!payload) { _analyticsTimer = null; return; }
    _analyticsSend(payload);
    _analyticsTimer = setTimeout(next, ANALYTICS_RATE_MS);
  };
  next();
}

ipcMain.on('analytics:tag', (_evt, payload) => {
  if (!payload || typeof payload !== 'object' || !payload.Operation) return;
  if (_analyticsQueue.length >= ANALYTICS_QUEUE_MAX) { _analyticsStats.overflow++; return; }
  _analyticsQueue.push(payload);
  _analyticsStats.queued = _analyticsQueue.length;
  _analyticsPump();
});

// Quit: the renderer has flushed its pending `edit` events while closing; give
// what is still queued one short burst, then let the quit go on.
let _analyticsDrained = false;
app.on('will-quit', (event) => {
  if (_analyticsDrained || !_analyticsQueue.length) return;
  _analyticsDrained = true;
  event.preventDefault();
  clearTimeout(_analyticsTimer);
  const batch = _analyticsQueue.splice(0, 20);
  _analyticsStats.overflow += _analyticsQueue.splice(0).length;   // not sent this session
  _analyticsStats.queued = 0;
  Promise.race([Promise.allSettled(batch.map(_analyticsSend)), new Promise((r) => setTimeout(r, 1500))])
    .finally(() => app.quit());
});

// A TigerTag+ is "Certified" when its factory signature checks out — the test the
// backend applies to the rfidList backup to certify a chip (chipValue in
// functions/supportWebhooks.js). The renderer hands the backup it read; null when
// it cannot be parsed (the protocol is then reported "unknown", never guessed).
ipcMain.handle('analytics:chip-certified', (_evt, uidHex, backupHex) => {
  try {
    if (!/^[0-9A-Fa-f]{14}$/.test(String(uidHex)) || typeof backupHex !== 'string') return null;
    const tag = TigerTag.fromPages(Buffer.from(uidHex, 'hex'), Buffer.from(backupHex, 'hex'));
    return !!tag.isPlus && tag.verify().ok === true;
  } catch (_) { return null; }
});

// ── Lookup a product by id_product — validate it exists in the TigerTag catalogue ──
// Uses a fake UID (same pattern as the SDK playground) since no chip is present.
// Returns { ok: true, api } | { ok: false, error }
ipcMain.handle('rfid:lookup-product', async (_evt, productId) => {
  try {
    if (!productId || productId === 0xFFFFFFFF) return { ok: false, error: 'invalid_id' };
    const url = `https://api.tigertag.io/api:tigertag/product/get?uid=123456789&product_id=${productId}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    let api;
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
      api = await resp.json();
    } finally {
      clearTimeout(timer);
    }
    return { ok: true, api };
  } catch (e) {
    console.error('[NFC] lookup-product failed:', e.message);
    return { ok: false, error: e.message };
  }
});

// ── Catalogue list — pull the WHOLE TigerTag+ product catalogue ─────────────
// The FALLBACK source since the snapshot above: used only when GitHub fails.
// The renderer is a browser context and this is a cross-origin POST, so it has
// to live here (same reason as `rfid:refresh-api` / `rfid:lookup-product`).
//
// Paged with `per_page: 1000`, following the envelope's `nextPage` until it
// comes back null — the catalogue grows daily, so nothing about its size is
// hard-coded. The renderer caches the result and searches it in memory; this
// endpoint is only ever hit to (re)build that local cache.
//
// `PAGE_CAP` is a runaway guard, not a catalogue limit: at 1000 items a page it
// allows 100 000 products, far beyond today's ~19 000, and only exists so a
// server-side paging bug can't spin here forever.
//
// Pages are fetched one after the other on purpose: the endpoint serves them one
// at a time anyway (measured at 18 845 products: ~11 s a page alone, six in
// parallel all answer after ~64 s), so parallel requests only add load. A page is
// given 60 s and two retries — at 20 s with none, one slow page out of 19 threw
// the whole sync away and the stale cache stayed in place.
// Returns { ok: true, items, itemsTotal } | { ok: false, error }
const XANO_PRODUCT_ALL_URL = 'https://api.tigertag.io/api:tigertag/product/get/all';
const PAGE_TIMEOUT_MS = 60000;
const PAGE_RETRIES = 2;
async function _fetchCatalogPage(page, perPage) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const resp = await fetch(XANO_PRODUCT_ALL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ per_page: perPage, page }),
      signal: controller.signal,
    });
    if (!resp.ok) return { httpStatus: resp.status };
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}
// ── Catalogue snapshot — the primary source ─────────────────────────────────
// The RFID-Guide repo carries the same catalogue as ONE file, re-exported by an
// auto-sync job several times a day (measured: identical to `get/all`, 1 000 of
// 1 000 items field for field). Served by GitHub's CDN: 1.6 MB gzip in ~0.2 s
// against ~3.5 min for the 19 API pages, and no load on Xano at all. The last
// copy and its ETag are kept on disk, so an unchanged catalogue costs one `304`
// and no download. Any failure falls through to `get/all` below.
//
// A copy on disk without `series` was written while the export lacked it
// (2026-09-01 → 2026-11-06, TigerTag-Manager#98). Its ETag is not trusted: the
// file is downloaded in full once, whatever the server would answer to it.
const CATALOG_SNAPSHOT_URL = 'https://raw.githubusercontent.com/TigerTag-Project/TigerTag-RFID-Guide/refs/heads/main/database/id_catalog.json';
// How many products carry each field the catalogue lost for two months — logged
// on every sync, so a regression of the export shows up in the log at once.
function _catalogFieldCounts(items) {
  const n = (k) => items.reduce((c, p) => c + (p?.[k] != null && p[k] !== '' ? 1 : 0), 0);
  return `series ${n('series')}, name ${n('name')}, aspect1 ${n('aspect1')}, aspect2 ${n('aspect2')}, updated_at ${n('updated_at')}`;
}
async function _fetchCatalogSnapshot({ ignoreEtag = false } = {}) {
  const dir  = app.getPath('userData');
  const body = path.join(dir, 'catalog-snapshot.json');
  const meta = path.join(dir, 'catalog-snapshot.etag');
  let etag = null;
  try { if (!ignoreEtag && fs.existsSync(body)) etag = fs.readFileSync(meta, 'utf8').trim() || null; } catch {}
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(CATALOG_SNAPSHOT_URL, {
      headers: etag ? { 'If-None-Match': etag } : {},
      signal: controller.signal,
    });
    let text;
    if (resp.status === 304) text = fs.readFileSync(body, 'utf8');
    else if (resp.ok) text = await resp.text();
    else throw new Error(`HTTP ${resp.status}`);
    const items = JSON.parse(text);
    // Shape check before trusting it: a list of products with an id each.
    if (!Array.isArray(items) || !items.length || items[0]?.id == null) throw new Error('bad_snapshot');
    if (resp.status === 304 && !items.some(p => p?.series)) {
      clearTimeout(timer);
      log.info('[catalog] snapshot on disk predates series/name — downloading it again');
      return _fetchCatalogSnapshot({ ignoreEtag: true });
    }
    if (resp.status !== 304) {
      fs.writeFileSync(body, text);
      const tag = resp.headers.get('etag');
      if (tag) fs.writeFileSync(meta, tag); else fs.rmSync(meta, { force: true });
    }
    log.info(`[catalog] snapshot ${resp.status === 304 ? 'unchanged (304)' : 'downloaded'}: ${items.length} products (${_catalogFieldCounts(items)})`);
    return items;
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle('catalog:fetch-all', async () => {
  try {
    const items = await _fetchCatalogSnapshot();
    return { ok: true, items, itemsTotal: items.length };
  } catch (e) {
    log.warn(`[catalog] snapshot failed (${e.message}) — falling back to get/all`);
  }
  const PAGE_CAP = 100;
  const PER_PAGE = 1000;
  try {
    const items = [];
    let page = 1;
    let itemsTotal = 0;
    for (let guard = 0; guard < PAGE_CAP; guard++) {
      let env;
      for (let attempt = 0; ; attempt++) {
        try {
          env = await _fetchCatalogPage(page, PER_PAGE);
          break;
        } catch (e) {
          if (attempt >= PAGE_RETRIES) throw e;
          log.warn(`[catalog] page ${page} failed (${e.message}) — retry ${attempt + 1}/${PAGE_RETRIES}`);
        }
      }
      if (env.httpStatus) return { ok: false, error: `HTTP ${env.httpStatus}` };
      if (!env || !Array.isArray(env.items)) return { ok: false, error: 'bad_envelope' };
      items.push(...env.items);
      if (Number.isFinite(env.itemsTotal)) itemsTotal = env.itemsTotal;
      // `nextPage` is null on the last page — the only stop condition that
      // survives the catalogue growing between two syncs.
      if (env.nextPage == null) break;
      page = env.nextPage;
    }
    log.info(`[catalog] fetched ${items.length}/${itemsTotal || items.length} products (${_catalogFieldCounts(items)})`);
    return { ok: true, items, itemsTotal: itemsTotal || items.length };
  } catch (e) {
    log.warn(`[catalog] fetch-all failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// Helper — force the chip's OWN creation timestamp into an outgoing payload.
// The timestamp (payload offset 32, u32 BE — exactly one 4-byte page) is stamped
// once when a tag is burned and NEVER again: it is the chip's creation date and,
// under the name `twin_tag_pairing_id`, the key that pairs a twin with its other
// half. Rewriting it therefore destroys the pairing. Overlaying the chip's value
// before the surgical diff makes that page identical by construction, so it can
// never end up among the pages written — whatever the document happens to hold.
//
// Same rule for the TAG INFO byte (offset 39, protocol v2.2): high nibble = which
// chip of the object this is (from 1), low nibble = how many chips the object
// carries (0x12 / 0x22 = twin 1 of 2 / 2 of 2, 0x11 = single, 0x00 = unknown).
// It is written once at burn time; a document rebuilt through fromCloudDoc does
// not carry it reliably, so the chip's own byte always wins. Not covered by the
// TigerTag+ signature, so keeping it never invalidates a signed chip.
function _keepChipIdentity(newUserBytes, oldUserBytes) {
  if (!oldUserBytes || oldUserBytes.length < 40) return newUserBytes;
  const out = Buffer.from(newUserBytes);
  oldUserBytes.copy(out, 32, 32, 36);   // creation timestamp = twin pairing key
  out[39] = oldUserBytes[39];           // tag index / tag count
  return out;
}

// Tag index / count recorded on the Firestore doc (`tag_index` / `tag_count`),
// as a SDK patch — used when the chip itself cannot be read before a full write.
// Anything outside a nibble is ignored (the SDK would throw a RangeError).
function _tagInfoPatch(doc) {
  const nib = v => (Number.isInteger(+v) && +v >= 0 && +v <= 15) ? +v : 0;
  const tagCount = nib(doc?.tag_count), tagIndex = nib(doc?.tag_index);
  return { tagCount, tagIndex };
}

// Helper — split 80-byte user-data buffer into page descriptors.
// If oldUserBytes is provided, only includes pages where bytes differ (surgical mode).
// Page index is absolute (starts at 4 = chip page 0x04).
function _pagesToWrite(newUserBytes, oldUserBytes) {
  const pages = [];
  for (let i = 0; i < 20; i++) {
    const offset = i * 4;
    const newPage = newUserBytes.slice(offset, offset + 4);
    if (oldUserBytes) {
      const oldPage = oldUserBytes.slice(offset, offset + 4);
      if (newPage.equals(oldPage)) continue; // identical — skip
    }
    pages.push({ index: 4 + i, hexData: newPage.toString('hex') });
  }
  return pages;
}


// ── TD1S color sensor ────────────────────────────────────────────────────────
function initTD1S() {
  // Lazy require — same pattern as initNFC(), non-fatal if unavailable
  let SerialPort, ReadlineParser;
  try {
    SerialPort    = require('serialport').SerialPort;
    ReadlineParser = require('@serialport/parser-readline').ReadlineParser;
  } catch (err) {
    console.warn('[TD1S] serialport not available:', err.message);
    return;
  }

  const TD1S_VID  = 'e4b2';
  const TD1S_PID  = '0045';
  const TD1S_BAUD = 115200;

  let td1sPort      = null;
  let td1sConnected = false;
  let td1sLastPair  = null;
  let td1sReconnect = null;
  let td1sNeedCount = 0;   // how many UI panels currently need TD1S

  // ── State replayed to renderer on every page (re)load ────────────────────
  let currentStatus  = 'Status: Starting…';
  let currentTd      = null;
  let currentHex     = null;
  const logBuffer    = [];   // ring buffer – last 80 entries
  const LOG_BUF_MAX  = 80;

  function td1sTs() {
    const d = new Date();
    return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function td1sLog(type, message) {
    const entry = { time: td1sTs(), type, message };
    logBuffer.push(entry);
    if (logBuffer.length > LOG_BUF_MAX) logBuffer.shift();
    mainWindow?.webContents.send('td1s-log', entry);
    console.log(`[TD1S:${type.toUpperCase()}] ${message}`);
  }

  function td1sStatus(msg) {
    currentStatus = msg;
    mainWindow?.webContents.send('td1s-status', msg);
  }

  function td1sData(td, hex) {
    currentTd  = td;
    currentHex = hex;
    mainWindow?.webContents.send('td1s-data', { TD: td, HEX: hex });
  }

  // On every renderer (re)load: replay the log buffer + push current state
  mainWindow.webContents.on('did-finish-load', () => {
    for (const entry of logBuffer) {
      mainWindow.webContents.send('td1s-log', entry);
    }
    mainWindow.webContents.send('td1s-status', currentStatus);
    if (currentTd !== null) {
      mainWindow.webContents.send('td1s-data', { TD: currentTd, HEX: currentHex });
    }
    // Replay NFC reader + card state — needed when reader was already connected at startup
    for (const name of _nfcReaders.keys()) {
      mainWindow.webContents.send('rfid-reader-update', { name, connected: true });
    }
    for (const [name, card] of _nfcCardPresent.entries()) {
      mainWindow.webContents.send('rfid-card-present', { readerName: name, uid: card.uid });
    }
  });

  function extractTdHex(rawLine) {
    const parts = rawLine.split(',').map(p => p.trim()).filter(p => p.length > 0);
    let scanTd = null, scanHex = null, hexIndex = null;

    for (let i = 0; i < parts.length; i++) {
      if (parts[i].toLowerCase().startsWith('td:')) {
        if (i + 1 < parts.length) {
          const v = parseFloat(parts[i + 1].replace(',', '.'));
          if (!isNaN(v)) scanTd = v;
        }
        break;
      }
    }
    for (let i = 0; i < parts.length; i++) {
      const cleaned = parts[i].replace(/\s/g, '');
      if (cleaned.length === 6 && /^[0-9A-Fa-f]{6}$/.test(cleaned)) {
        scanHex = cleaned.toUpperCase(); hexIndex = i; break;
      }
    }
    if (scanTd === null && hexIndex !== null) {
      for (let i = 0; i < hexIndex; i++) {
        const v = parseFloat(parts[i].replace(',', '.'));
        if (!isNaN(v) && v >= 0 && v <= 100) { scanTd = v; break; }
      }
    }
    if (scanTd !== null && scanHex !== null) return { td: scanTd.toFixed(1), hex: scanHex };
    return null;
  }

  let td1sDevice = null;   // USB identity of the TD1S found by td1sFind
  async function td1sFind() {
    td1sLog('debug', `Scan serial ports (VID=${TD1S_VID} PID=${TD1S_PID})...`);
    const ports = await SerialPort.list();
    if (ports.length === 0) { td1sLog('debug', 'No serial ports detected'); return null; }
    td1sLog('debug', `${ports.length} port(s) found:`);
    for (const p of ports) {
      const vid = (p.vendorId || '').toLowerCase();
      const pid = (p.productId || '').toLowerCase();
      const label = p.manufacturer ? ` [${p.manufacturer}]` : '';
      const match = vid === TD1S_VID && pid === TD1S_PID;
      td1sLog(match ? 'success' : 'debug',
        `  ${p.path}  VID=${vid || '----'} PID=${pid || '----'}${label}${match ? '  ← MATCH TD1S' : ''}`
      );
      if (match) {
        // Who this sensor is — recorded on the account once it streams (td1s/{serial}).
        td1sDevice = { serialNumber: p.serialNumber || null, manufacturer: p.manufacturer || null,
                       vendorId: vid, productId: pid };
        return p.path;   // use path as-is (tty.* works, no cu.* conversion needed)
      }
    }
    return null;
  }

  function td1sClose() {
    if (td1sPort) { if (td1sPort.isOpen) td1sPort.close(() => {}); td1sPort = null; }
    td1sConnected = false;
  }

  // Cancel any pending poll timer
  function td1sStopWatcher() {
    if (td1sReconnect) { clearTimeout(td1sReconnect); td1sReconnect = null; }
  }

  // Schedule one connect attempt in 1.5 s (called only when a UI panel needs TD1S)
  function td1sStartPolling() {
    if (td1sReconnect || td1sConnected || app.isQuitting) return;
    td1sLog('info', 'TD1S needed by UI — polling...');
    td1sReconnect = setTimeout(() => { td1sReconnect = null; td1sConnect(); }, 1500);
  }

  // IPC: renderer tells us a TD1S-dependent panel opened / closed
  ipcMain.on('td1s:need', () => {
    td1sNeedCount++;
    if (!td1sConnected) td1sStartPolling();
  });
  ipcMain.on('td1s:release', () => {
    td1sNeedCount = Math.max(0, td1sNeedCount - 1);
    if (td1sNeedCount === 0 && !td1sConnected) {
      td1sStopWatcher();
      td1sLog('info', 'No UI needs TD1S — polling stopped.');
      td1sStatus('Status: Sensor not detected');
    }
  });

  async function td1sConnect() {
    if (td1sConnected || app.isQuitting) return;
    td1sStopWatcher();
    const portPath = await td1sFind();
    if (!portPath) {
      td1sStatus('Status: Sensor not detected');
      if (td1sNeedCount > 0) { td1sStartPolling(); } else { td1sLog('info', 'TD1S not found.'); }
      return;
    }
    td1sLog('info', `Port found: ${portPath} — opening at ${TD1S_BAUD} baud...`);
    td1sStatus(`Status: Connecting to ${portPath}...`);
    try {
      td1sPort = new SerialPort({ path: portPath, baudRate: TD1S_BAUD, autoOpen: false });
      await new Promise((resolve, reject) => { td1sPort.open(err => err ? reject(err) : resolve()); });
      td1sLog('success', `Port ${portPath} opened`);

      const parser = td1sPort.pipe(new ReadlineParser({ delimiter: '\n' }));
      let state = 'WAITING_READY';

      td1sLog('info', 'Handshake → sending "connect"');
      td1sPort.write('connect\n');

      parser.on('data', line => {
        const raw = line.toString().trim();
        if (state === 'WAITING_READY') {
          td1sLog('debug', `← received: "${raw}"`);
          if (raw === 'ready') {
            td1sLog('success', 'Sensor ready — sending "P" (start stream)');
            td1sPort.write('P\n');
            state = 'WAITING_FIRST';
          } else {
            td1sLog('warn', `Unexpected response (expected "ready"): "${raw}"`);
          }
          return;
        }
        if (state === 'WAITING_FIRST') {
          td1sLog('debug', `← first line discarded: "${raw}"`);
          state = 'READING'; td1sConnected = true;
          td1sLog('success', 'Stream active — reading data');
          td1sStatus('Status: Sensor connected');
          if (td1sDevice) mainWindow?.webContents.send('td1s-device', td1sDevice);
          return;
        }
        // READING
        td1sLog('debug', `← raw: "${raw}"`);
        if (raw === 'clearScreen') {
          td1sLog('debug', `  ↳ screen clear — filament removed`);
          td1sLastPair = null;   // reset dedup so same value fires again on re-insert
          mainWindow?.webContents.send('td1s-clear');
          return;
        }
        const result = extractTdHex(raw);
        if (!result) { td1sLog('debug', `  ↳ unparseable, ignored`); return; }
        const pairKey = `${result.td}-${result.hex}`;
        if (pairKey === td1sLastPair) { td1sLog('debug', `  ↳ duplicate (TD=${result.td} HEX=${result.hex}), ignored`); return; }
        td1sLastPair = pairKey;
        td1sLog('data', `  ↳ NEW value  TD=${result.td}  HEX=#${result.hex}`);
        td1sData(result.td, result.hex);
      });

      td1sPort.on('close', () => {
        td1sConnected = false; td1sPort = null;
        if (!app.isQuitting) {
          td1sLog('warn', `Port ${portPath} closed (disconnected?)`);
          td1sStatus('Status: Sensor not detected');
          if (td1sNeedCount > 0) td1sStartPolling();
        }
      });
      td1sPort.on('error', err => {
        td1sLog('error', `Serial error: ${err.message}`);
        td1sConnected = false; td1sClose();
        td1sStatus('Status: Sensor not detected');
        if (td1sNeedCount > 0) td1sStartPolling();
      });
    } catch (err) {
      td1sLog('error', `Cannot open ${portPath}: ${err.message}`);
      td1sClose();
      td1sStatus('Status: Sensor not detected');
      if (td1sNeedCount > 0) td1sStartPolling();
    }
  }

  app.on('before-quit', () => {
    td1sStopWatcher();
    td1sClose();
  });

  // Start immediately — logs before first did-finish-load go into the buffer
  // and are replayed when the renderer is ready
  td1sLog('info', `TD1S bridge ready — Electron ${process.versions.electron}`);
  td1sLog('info', `Target: VID=0x${TD1S_VID.toUpperCase()} PID=0x${TD1S_PID.toUpperCase()} @ ${TD1S_BAUD} baud`);
  /* No serial scan at launch. On some Windows machines enumerating the serial
     ports takes 10 s to minutes (a slow virtual-COM / Bluetooth driver), and the
     launch waited on it: a black window flagged "not responding", every time,
     for users who do not even own a TD1S. The scan now runs only when a panel
     that reads the sensor opens (`td1s:need`). */
}

// ── Local MCP server (AI assistants, read-only) ───────────────────────────
// services/mcpServer.js speaks the protocol; the tools run in the renderer,
// where the inventory lives. Prefs in <userData>/mcp.json: { enabledFor: [uid],
// port, token }. PER ACCOUNT, off by default — each profile turns it on from
// "My profile"; the server runs only while the signed-in account opted in, so
// switching to an account that did not never exposes its data.
const MCP_DEFAULT_PORT = 5795;
const _mcpPrefsPath  = () => path.join(app.getPath('userData'), 'mcp.json');
let _mcp = null;
let _mcpTools = [];                       // tool definitions registered by the renderer
let _mcpActiveUid = null;                 // account signed in in the renderer (mcp:set-account)
const _mcpPending = new Map();            // call id → { resolve, reject, timer }

function _mcpReadPrefs() {
  let p = {};
  try { p = JSON.parse(fs.readFileSync(_mcpPrefsPath(), 'utf8')); } catch (_) {}
  const prefs = {
    enabledFor: Array.isArray(p.enabledFor) ? p.enabledFor.filter(x => typeof x === 'string') : [],
    port: Number.isInteger(p.port) ? p.port : MCP_DEFAULT_PORT,
    token: typeof p.token === 'string' && p.token.length >= 32 ? p.token : crypto.randomBytes(24).toString('hex'),
  };
  if (prefs.token !== p.token) _mcpWritePrefs(prefs);
  return prefs;
}
function _mcpWritePrefs(prefs) {
  try { fs.writeFileSync(_mcpPrefsPath(), JSON.stringify(prefs, null, 2), { mode: 0o600 }); }
  catch (e) { console.warn('[mcp] failed to write prefs:', e.message); }
}
function _mcpCallRenderer(name, args) {
  return new Promise((resolve, reject) => {
    if (!mainWindow || mainWindow.isDestroyed()) return reject(new Error('Tiger Studio Manager has no open window.'));
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { _mcpPending.delete(id); reject(new Error('Studio did not answer in time.')); }, 15000);
    _mcpPending.set(id, { resolve, reject, timer });
    mainWindow.webContents.send('mcp:call', { id, name, args });
  });
}
ipcMain.on('mcp:register-tools', (_evt, tools) => { if (Array.isArray(tools)) _mcpTools = tools; });
ipcMain.on('mcp:result', (_evt, { id, ok, result, error } = {}) => {
  const p = _mcpPending.get(id);
  if (!p) return;
  _mcpPending.delete(id); clearTimeout(p.timer);
  ok ? p.resolve(result) : p.reject(new Error(error || 'Tool failed'));
});
function _mcpConfig() {
  const prefs = _mcpReadPrefs();
  const st = _mcp ? _mcp.status() : { running: false, error: null };
  return {
    enabled: !!_mcpActiveUid && prefs.enabledFor.includes(_mcpActiveUid),
    port: prefs.port, token: prefs.token,
    url: `http://127.0.0.1:${prefs.port}/mcp`,
    running: st.running, error: st.error,
  };
}
async function _mcpApply() {
  const prefs = _mcpReadPrefs();
  if (!_mcp) {
    const { createMcpServer } = require('./services/mcpServer');
    _mcp = createMcpServer({
      serverVersion: app.getVersion(),
      listTools: () => _mcpTools,
      callTool: _mcpCallRenderer,
      log: (m) => console.log(m),
    });
  }
  if (!_mcpActiveUid || !prefs.enabledFor.includes(_mcpActiveUid)) { await _mcp.stop(); return; }
  await _mcp.start({ port: prefs.port, token: prefs.token });
}
// Nothing to start at boot: the server waits for the renderer to say which
// account is signed in (mcp:set-account), then follows that account's choice.
function initMcp() {}
ipcMain.handle('mcp:set-account', async (_evt, uid) => {
  _mcpActiveUid = typeof uid === 'string' && uid ? uid : null;
  await _mcpApply();
  return _mcpConfig();
});
ipcMain.handle('mcp:get-config', () => _mcpConfig());
ipcMain.handle('mcp:set-enabled', async (_evt, enabled) => {
  if (!_mcpActiveUid) return _mcpConfig();
  const prefs = _mcpReadPrefs();
  const set = new Set(prefs.enabledFor);
  enabled ? set.add(_mcpActiveUid) : set.delete(_mcpActiveUid);
  _mcpWritePrefs({ ...prefs, enabledFor: [...set] });
  await _mcpApply();
  return _mcpConfig();
});
// ── One-click install into an AI client ──────────────────────────────────
// Claude Desktop installs a `.mcpb` bundle (a zip: manifest.json + server/),
// which it runs with its own Node — so the bundle carries the stdio bridge with
// this install's URL + token baked in. Cursor and VS Code take an install link
// holding the HTTP config. A new token means reinstalling (Settings says so).
const _crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function _crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = _crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
// Minimal zip writer (deflate, no dependency) — enough for a handful of files.
function _zip(files) {
  const zlib = require('zlib');
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = _crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
function _mcpBuildBundle(cfg) {
  const { nativeImage } = require('electron');
  const manifest = {
    manifest_version: '0.3',
    name: 'tiger-studio-manager',
    display_name: 'Tiger Studio Manager',
    version: app.getVersion(),
    description: 'Ask about your TigerTag filament inventory, storage racks and 3D printers — read-only.',
    long_description: 'Reads the inventory open in Tiger Studio Manager on this computer: spools, remaining weight, colours, storage location, racks and printers. Read-only. Tiger Studio Manager must be running with AI assistants turned on in Settings.',
    author: { name: 'TigerTag Project', url: 'https://tigersystem.io' },
    homepage: 'https://tigersystem.io',
    icon: 'icon.png',
    server: {
      type: 'node',
      entry_point: 'server/index.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/server/index.js'],
        env: { TIGER_MCP_URL: cfg.url, TIGER_MCP_TOKEN: cfg.token },
      },
    },
    tools: _mcpTools.map(t => ({ name: t.name, description: t.description })),
    keywords: ['tigertag', '3d printing', 'filament', 'inventory'],
    license: 'Proprietary',
  };
  const files = [
    { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { name: 'server/index.js', data: fs.readFileSync(path.join(__dirname, 'services', 'mcpStdioBridge.js')) },
  ];
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'img', 'icon.png'));
    if (!icon.isEmpty()) files.push({ name: 'icon.png', data: icon.resize({ width: 256, quality: 'best' }).toPNG() });
  } catch (_) {}
  // The bundle carries the token: private to this user (a default 0755 / 0644
  // left it readable by every other account on a shared Linux machine).
  // chmod as well — `mode` only applies when the file / folder is created.
  const out = path.join(app.getPath('userData'), 'mcp', 'Tiger Studio Manager.mcpb');
  const dir = path.dirname(out);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch (_) {}
  fs.writeFileSync(out, _zip(files), { mode: 0o600 });
  try { fs.chmodSync(out, 0o600); } catch (_) {}
  // The loose bridge copy the retired "copy setup" button used — gone with it.
  try { fs.rmSync(path.join(dir, 'tiger-mcp-bridge.js'), { force: true }); } catch (_) {}
  return out;
}
ipcMain.handle('mcp:install', async (_evt, target) => {
  const cfg = _mcpConfig();
  if (!cfg.enabled || !cfg.running) return { ok: false, error: 'not-running' };
  const headers = { Authorization: `Bearer ${cfg.token}` };
  try {
    if (target === 'claude-desktop') {
      const file = _mcpBuildBundle(cfg);
      const err = await shell.openPath(file);   // Claude Desktop owns .mcpb → its install dialog
      if (err) { shell.showItemInFolder(file); return { ok: false, error: err, file }; }
      return { ok: true };
    }
    if (target === 'cursor') {
      const conf = Buffer.from(JSON.stringify({ url: cfg.url, headers })).toString('base64');
      await shell.openExternal(`cursor://anysphere.cursor-deeplink/mcp/install?name=tiger-studio&config=${encodeURIComponent(conf)}`);
      return { ok: true };
    }
    if (target === 'vscode') {
      const conf = { name: 'tiger-studio', type: 'http', url: cfg.url, headers };
      await shell.openExternal(`vscode:mcp/install?${encodeURIComponent(JSON.stringify(conf))}`);
      return { ok: true };
    }
    return { ok: false, error: 'unknown-target' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('mcp:new-token', async () => {
  _mcpWritePrefs({ ..._mcpReadPrefs(), token: crypto.randomBytes(24).toString('hex') });
  await _mcpApply();
  return _mcpConfig();
});

// ── Hosted MCP connector — the online assistants connected to the account ──
// The Tiger Hub serves its own MCP server (mcp.tigersystem.io, OAuth). Each
// assistant a user connects there is a grant; this lists them and cuts one.
// The Hub route sends no CORS headers, so a renderer fetch() with an
// Authorization header dies on the preflight — Node's fetch() here in main is
// CORS-exempt. Fixed URL, two verbs: never a generic outbound proxy.
// The renderer passes the signed-in account's Firebase ID token.
// Returns { ok, status, json? } | { ok:false, status:0, error }.
const MCP_GRANTS_URL = 'https://tigersystem.io/api/account/mcp-grants';
ipcMain.handle('mcp:hosted-grants', async (_evt, idToken, revokeId) => {
  if (!idToken || typeof idToken !== 'string') return { ok: false, status: 0, error: 'no token' };
  const del = revokeId != null;
  if (del && (typeof revokeId !== 'string' || !/^[\w-]{1,128}$/.test(revokeId))) {
    return { ok: false, status: 0, error: 'invalid id' };
  }
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), 10000);
  try {
    const url = del ? `${MCP_GRANTS_URL}?id=${encodeURIComponent(revokeId)}` : MCP_GRANTS_URL;
    const res = await fetch(url, {
      method: del ? 'DELETE' : 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
      signal: ctl.signal,
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  } finally {
    clearTimeout(tm);
  }
});

// ── Auto-updater preference ─────────────────────────────────────────────
// Persisted in <userData>/auto-update.json so it survives across launches
// and is read at startup BEFORE the renderer has had a chance to send its
// localStorage value. Renderer can override at runtime via 'update:set-auto'.
const _autoUpdatePrefsPath = () => path.join(app.getPath('userData'), 'auto-update.json');
function readAutoUpdatePref() {
  try {
    const raw = fs.readFileSync(_autoUpdatePrefsPath(), 'utf8');
    const obj = JSON.parse(raw);
    return obj.enabled !== false;     // default ON if file missing or malformed
  } catch (_) {
    return true;
  }
}
function writeAutoUpdatePref(enabled) {
  try {
    fs.writeFileSync(_autoUpdatePrefsPath(),
      JSON.stringify({ enabled: !!enabled }, null, 2));
  } catch (e) {
    console.warn('[updater] failed to write pref:', e.message);
  }
}

// ── Auto-updater
// Lifecycle events are wired ONCE here; the actual check is gated by the
// stored preference and can be re-triggered manually via 'update:check-now'.
let _updaterEventsWired = false;
// macOS: Squirrel.Mac holds the downloaded update (see 'update-downloaded' below).
let _macSquirrelReady = false;
let _macReadyInfo = null;
function wireUpdaterEvents() {
  if (_updaterEventsWired) return;
  _updaterEventsWired = true;
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-status', { status: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-status', { status: 'available', version: info?.version });
  });
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-status', { status: 'up-to-date' });
  });
  autoUpdater.on('download-progress', (p) => {
    mainWindow?.webContents.send('update-status', {
      status: 'downloading',
      percent: p?.percent,
      bytesPerSecond: p?.bytesPerSecond,
      transferred: p?.transferred,
      total: p?.total,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    // macOS: electron-updater says "downloaded" as soon as the zip is cached, but
    // Squirrel.Mac then fetches it again from a local proxy and checks its
    // signature (~30 s for a 300 MB zip). "Install" is only offered once Squirrel
    // has it — a quit before that left nothing installed.
    if (process.platform === 'darwin' && !_macSquirrelReady) {
      _macReadyInfo = info;
      mainWindow?.webContents.send('update-status', { status: 'downloading', percent: 100 });
      return;
    }
    mainWindow?.webContents.send('update-status', { status: 'ready', version: info?.version });
  });
  if (process.platform === 'darwin') {
    nativeAutoUpdater.on('update-downloaded', () => {
      _macSquirrelReady = true;
      log.info('[updater] Squirrel.Mac has the update — ready to install');
      if (_macReadyInfo) mainWindow?.webContents.send('update-status', { status: 'ready', version: _macReadyInfo.version });
    });
  }
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-status', { status: 'error', error: err?.message || String(err) });
  });
}

function initUpdater() {
  wireUpdaterEvents();
  if (!readAutoUpdatePref()) {
    console.log('[updater] auto-update disabled by user preference — skipping startup check');
    return;
  }
  // A check that times out (GitHub unreachable, a proxy) must not surface as an
  // unhandled rejection; the 'error' event already informs the renderer.
  autoUpdater.checkForUpdatesAndNotify().catch(err => log.warn('[updater] check failed:', err?.message || err));
}

// IPC: renderer asks to install downloaded update
// ─────────────────────────────────────────────────────────────────────────
// UID migration — block accidental app quit during the initial sweep
// ─────────────────────────────────────────────────────────────────────────
//
// Tiger Studio Manager migrates legacy decimal-format inventory ids to hex
// uppercase in the background (see renderer/inventory.js). On the first
// launch after the new mobile-app-version cutover, a user with a large
// pre-existing inventory may have several hundred docs to migrate, taking
// 30–120 seconds. The renderer puts up a lock-screen modal saying "do not
// close the app", but a determined user can still hit Cmd+Q.
//
// The renderer signals via the `migration:set-in-flight` IPC when the
// sweep starts/ends. While in flight, we intercept `before-quit` and
// `mainWindow.close` events and pop a confirm dialog: leaving mid-sweep
// is safe (next launch resumes), but we want the user to KNOW that.
let _migrationInFlight = false;
ipcMain.on('migration:set-in-flight', (_evt, inFlight) => {
  _migrationInFlight = !!inFlight;
});

const { dialog } = require('electron');
let _quitConfirmedDuringMigration = false;
app.on('before-quit', (event) => {
  if (!_migrationInFlight || _quitConfirmedDuringMigration) return;
  // Block this quit attempt and ask the user to confirm. Clear the quit
  // latch set by the top-level before-quit handler so a later red-button
  // close still hides (rather than destroys) the window if the user waits.
  event.preventDefault();
  _isQuitting = false;
  if (mainWindow) mainWindow.show();
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type:    'warning',
    title:   'Migration in progress',
    message: 'Inventory upgrade is still running.',
    detail:  'Closing now is safe — the migration will resume the next time you open Tiger Studio Manager — but for the cleanest experience, please let it finish (it usually takes less than a minute).\n\nQuit anyway?',
    buttons: ['Wait for it to finish', 'Quit anyway'],
    defaultId: 0,
    cancelId:  0,
  });
  if (choice === 1) {
    _quitConfirmedDuringMigration = true;
    app.quit();   // re-trigger the quit, this time we let it through
  }
});

ipcMain.on('install-update', () => {
  _isQuitting = true;   // let the macOS close handler actually close the window (not hide it)
  log.info('[updater] install requested — quitting to run the installer');
  autoUpdater.quitAndInstall();
  /* The installer waits for this process to be gone. A quit that stalls — a
     renderer that never finishes unloading (the window turns black and Windows
     flags it "not responding"), a native handle that will not close — leaves it
     waiting forever and the update never lands. On Windows the installer is
     already spawned at this point, so a hard exit loses nothing. On macOS the
     fallback is armed only once Squirrel.Mac holds the update: killed before,
     it installs nothing (v2.46.0 → the update never landed). */
  const armForcedExit = () => setTimeout(() => {
    log.warn('[updater] quit did not complete in 6 s — forcing exit so the installer can run');
    for (const w of BrowserWindow.getAllWindows()) { try { w.destroy(); } catch (_) {} }
    app.exit(0);
  }, 6000).unref?.();
  if (process.platform === 'darwin' && !_macSquirrelReady) nativeAutoUpdater.once('update-downloaded', armForcedExit);
  else armForcedExit();
});

// IPC: renderer flips the auto-update preference (persisted to disk)
ipcMain.on('update:set-auto', (_evt, enabled) => {
  writeAutoUpdatePref(enabled);
  console.log(`[updater] auto-update preference set to ${!!enabled}`);
});

// ─────────────────────────────────────────────────────────────────────────
// Google sign-in via loopback OAuth (RFC 8252) + PKCE (RFC 7636)
// ─────────────────────────────────────────────────────────────────────────
//
// Why we don't use firebase.auth().signInWithPopup() in Electron
// ─────────────────────────────────────────────────────────────
// signInWithPopup spawns a Chromium BrowserWindow inside Electron. When
// Google's auth flow hits a passkey step (now the default for many users),
// Chromium's WebAuthn implementation tries to talk to the macOS authd
// daemon to invoke Touch ID. In a stock Electron BrowserWindow that path
// is broken — the user sees the "Use your passkey" UI but the button is
// inert, leaving Google sign-in stuck.
//
// The loopback OAuth pattern fixes this by NOT opening a popup. Instead:
//   1. main spawns a tiny http.Server on 127.0.0.1:<random-port>
//   2. main builds a Google OAuth URL with code_challenge=S256(verifier)
//      and redirect_uri = http://127.0.0.1:<port>/callback
//   3. main calls shell.openExternal(url) → Safari (or default browser)
//      opens. Touch ID / passkeys work there NATIVELY because Safari
//      has full WebAuthn integration with the OS keychain.
//   4. After auth, Google redirects to localhost:<port>/callback?code=…
//   5. The loopback server captures the code, POSTs it to Google's token
//      endpoint with the PKCE verifier (no client_secret needed for
//      Desktop OAuth clients), receives id_token + access_token.
//   6. Renderer turns those into a firebase.auth.GoogleAuthProvider
//      credential and signs in via signInWithCredential — same end state
//      as signInWithPopup would have produced.
//
// Configuration — Desktop OAuth Client ID (REQUIRED)
// ──────────────────────────────────────────────────
// You MUST create a "Desktop app" OAuth Client in Google Cloud Console
// for the tigertag-connect project. Steps:
//   1. https://console.cloud.google.com/apis/credentials?project=tigertag-connect
//   2. + CREATE CREDENTIALS → OAuth client ID
//   3. Application type: "Desktop app"
//   4. Name: "Tiger Studio Manager"
//   5. Save and copy the Client ID (no secret needed thanks to PKCE).
//   6. Paste it below as GOOGLE_DESKTOP_CLIENT_ID, or set the
//      TIGERTAG_GOOGLE_DESKTOP_CLIENT_ID env var at launch.
//
// Note on Firebase audience: an id_token minted for the Desktop client
// has aud = Desktop_Client_ID, which Firebase Auth may reject. We pass
// BOTH id_token and access_token to GoogleAuthProvider.credential(...);
// when the id_token audience check fails, Firebase falls back to using
// the access_token against Google's userinfo endpoint, which has no
// audience constraint. This dual-token call is what makes the flow
// portable across project setups.
// The env var still wins (CI / local override), but the hardcoded fallback below is
// what makes the loopback flow work in a SHIPPED build: main.js reads this at RUNTIME,
// on the user machine, where a build-time env var does not exist. Removing the fallback
// (commit a94b4aa, v1.10.0) silently disabled the flow and fell back to signInWithPopup,
// which Google refuses from an embedded Electron webview.
// Google Desktop OAuth credentials, written by scripts/gen-oauth-config.mjs and
// packed into the app. Read at RUNTIME — a build-time env var does not survive
// into the shipped binary, which is exactly what broke sign-in from v1.10.0.
const _oauthCfg = (() => {
  try { return require("./oauth-config.json"); } catch { return {}; }
})();

const GOOGLE_DESKTOP_CLIENT_ID =
  process.env.TIGERTAG_GOOGLE_DESKTOP_CLIENT_ID ||
  _oauthCfg.googleDesktopClientId ||
  // Desktop OAuth client created in Google Cloud Console for the
  // tigertag-connect project on 2026-05-03 ("Tiger Studio Manager"). This
  // value is PUBLIC by design: an installed app cannot keep a secret
  // (RFC 8252 §8.5), which is why PKCE exists — each sign-in generates a
  // fresh code_verifier only this process knows. Extracting these strings
  // from the binary does not let an attacker impersonate the app.
  '298062874545-c3d61latpmhp6qn9l1q87hvhmng8aadi.apps.googleusercontent.com';

// Google REQUIRES this for the Desktop client token exchange (see the
// client_secret note further down). Deliberately NO hardcoded fallback: unlike
// the client id, this must never land in the public repository. It comes from
// the environment (CI secret / local export) or from the gitignored
// oauth-config.json — run `npm run oauth:config` to write that file.
const GOOGLE_DESKTOP_CLIENT_SECRET =
  process.env.TIGERTAG_GOOGLE_DESKTOP_CLIENT_SECRET ||
  _oauthCfg.googleDesktopClientSecret ||
  "";

ipcMain.handle('auth:google-loopback', async () => {
  // Check BOTH up front. Missing either one used to surface only at the token
  // exchange — after the whole browser round-trip — and the renderer then fell
  // back to signInWithPopup, which Google blocks. Fail fast and say which.
  if (!GOOGLE_DESKTOP_CLIENT_ID || !GOOGLE_DESKTOP_CLIENT_SECRET) {
    const missing = !GOOGLE_DESKTOP_CLIENT_ID
      ? 'GOOGLE_DESKTOP_CLIENT_ID'
      : 'GOOGLE_DESKTOP_CLIENT_SECRET';
    log.error(`[auth.google-loopback] ${missing} is not configured — see main.js`);
    return { ok: false, error: `${missing} is not configured. See main.js header.` };
  }

  // PKCE: verifier is a high-entropy random string, challenge is its
  // SHA-256 (base64url-encoded). Server requires us to present the
  // verifier at code-exchange time, proving we're the same app that
  // initiated the flow.
  const codeVerifier  = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256')
    .update(codeVerifier).digest('base64url');
  // Random state for CSRF protection — Google echoes it back on the
  // redirect, we verify the round-trip before trusting the code.
  const state = crypto.randomBytes(16).toString('base64url');

  // Spawn the loopback HTTP server on an ephemeral port. We bind to
  // 127.0.0.1 explicitly (not 0.0.0.0) so the listener is unreachable
  // from the local network — only the user's own browser can hit it.
  const { server, port } = await new Promise((resolve, reject) => {
    const s = http.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => resolve({ server: s, port: s.address().port }));
  });
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  try {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id',             GOOGLE_DESKTOP_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri',          redirectUri);
    authUrl.searchParams.set('response_type',         'code');
    authUrl.searchParams.set('scope',                 'openid email profile');
    authUrl.searchParams.set('code_challenge',        codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state',                 state);
    // NO `prompt` parameter on purpose. `prompt=select_account` forced Google to
    // re-authenticate on EVERY sign-in — that is what made the flow long: an
    // account chooser plus a full identity challenge (passkey / security key /
    // password) even when the browser already held a live Google session.
    // Without it, an existing session completes the round-trip almost instantly.
    // Multi-account users are not stranded: Google shows the chooser by itself
    // whenever the browser holds more than one session.

    // Wait for the OAuth redirect to land on /callback. 5-minute timeout
    // — beyond that we assume the user abandoned the flow.
    const codePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('OAuth timeout: no callback received in 5 minutes'));
      }, 5 * 60 * 1000);

      server.on('request', (req, res) => {
        const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(404); res.end(); return;
        }
        clearTimeout(timeout);

        const code          = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        const oauthError    = reqUrl.searchParams.get('error');

        // Always answer the browser — never leave the tab spinning. We
        // serve a tiny HTML page that auto-closes after 1.5s so the user
        // immediately knows they can return to the desktop app.
        const renderPage = (title, body, color) => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Tiger Studio Manager — ${title}</title></head><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#0f1117;color:#fff;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px"><div style="font-size:48px;color:${color}">${title === 'Signed in' ? '✓' : '×'}</div><h1 style="font-weight:600;margin:0;font-size:22px">${title}</h1><p style="margin:0;color:rgba(255,255,255,.6);font-size:14px">${body}</p><script>setTimeout(()=>window.close(),1500)</script></body></html>`);
        };

        if (oauthError) {
          renderPage('Sign-in cancelled', 'You can close this tab and try again.', '#ef4444');
          reject(new Error(`OAuth error: ${oauthError}`));
          return;
        }
        if (returnedState !== state) {
          renderPage('Security check failed', 'State mismatch — please try again.', '#ef4444');
          reject(new Error('OAuth state mismatch — possible CSRF attempt'));
          return;
        }
        if (!code) {
          renderPage('No code received', 'Something went wrong on Google\'s side.', '#ef4444');
          reject(new Error('OAuth: no authorization code returned'));
          return;
        }

        renderPage('Signed in', 'Returning to Tiger Studio Manager…', '#10b981');
        resolve(code);
      });
    });

    // Hand off to the system browser — Touch ID / passkey works there.
    await shell.openExternal(authUrl.toString());

    const code = await codePromise;

    // Bring the Electron app to the foreground the instant the OAuth
    // hand-shake lands. Safari can't close its own tab via window.close()
    // (the tab wasn't opened by a JS window.open(), so the browser
    // sandbox blocks the close), but raising our window means the user
    // is immediately back in the app — the dangling Safari tab becomes
    // a non-issue, they can close it whenever. `app.focus({ steal })`
    // on macOS actually pulls focus from Safari; on Win/Linux it's a
    // no-op or polite focus request.
    try {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      if (process.platform === 'darwin') app.focus({ steal: true });
      else app.focus();
    } catch { /* focus is best-effort, never block the auth flow */ }

    // Exchange the code for tokens. Desktop clients use PKCE instead of
    // a client_secret, so we don't need to ship anything truly secret in
    // the binary — the verifier is regenerated per flow and never leaves
    // this process.
    /* Electron's `net.fetch` (Chromium's network stack), not Node's `fetch`:
       it honours the system proxy, the OS certificate store and the same DNS as
       the browser that just reached Google's consent page. Node's undici
       ignores all three, so behind a proxy / HTTPS-inspecting antivirus the
       exchange died with a bare "fetch failed" and the user could not sign in. */
    const tokenResp = await require('electron').net.fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     GOOGLE_DESKTOP_CLIENT_ID,
        // REQUIRED, despite PKCE. Google's token endpoint rejects this Desktop
        // client without it: `invalid_request / client_secret is missing.` It is
        // not a real secret (RFC 8252 §8.5 — an installed app cannot keep one,
        // and Google documents it as such); PKCE is what actually protects the
        // exchange. Do not "clean it up" — it breaks sign-in, silently, because
        // the renderer then falls back to signInWithPopup, which Google blocks.
        client_secret: GOOGLE_DESKTOP_CLIENT_SECRET,
        code,
        code_verifier: codeVerifier,
        grant_type:    'authorization_code',
        redirect_uri:  redirectUri,
      }).toString(),
    });
    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      throw new Error(`Google token exchange failed (${tokenResp.status}): ${txt}`);
    }
    const tokens = await tokenResp.json();
    return {
      ok: true,
      idToken:     tokens.id_token     || null,
      accessToken: tokens.access_token || null,
    };
  } catch (e) {
    // `fetch failed` alone says nothing — the real reason (DNS, TLS, proxy, timeout) is in `cause`.
    console.error('[auth.google-loopback] failed:', e?.message || String(e), e?.cause ? `— ${e.cause.code || ''} ${e.cause.message || e.cause}` : '');
    return { ok: false, error: e?.message || String(e) };
  } finally {
    server.close();
  }
});

// IPC: renderer triggers a manual update check (regardless of the
// auto-update preference — explicit user action). Resolves with the
// outcome so the UI can show "Checking…" / "Up to date" / etc.
ipcMain.on('shell:open-external', (_evt, url) => {
  if (isSafeExternalUrl(url)) shell.openExternal(url);
});

// ── Detached camera wall window ──────────────────────────────────────────────
// Opens (or focuses) a standalone window that shows all online printer cameras.
// The window uses its own preload (cam-preload.js) — no Firebase, no inventory.
// webSecurity:false lets the window reach local-network camera URLs (192.168.x.x)
// without CORS errors from the localhost origin.
ipcMain.handle('cam:open-detached', (_evt, cameras) => {
  if (_camWindow && !_camWindow.isDestroyed()) {
    _camWindow.focus();
    _camWindow.webContents.send('cam:update', cameras);
    return;
  }
  _camWindow = new BrowserWindow({
    width:     1280,
    height:    720,
    minWidth:  640,
    minHeight: 360,
    title:     'Camera Wall — Tiger Studio',
    hasShadow: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload:          path.join(__dirname, 'renderer/cam/cam-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      false, // allow local-network camera URLs (cross-origin iframes / MJPEG)
    },
  });
  _camWindow.loadURL(`http://localhost:${_devPort}/renderer/cam/cam.html`);
  _camWindow.webContents.once('did-finish-load', () => {
    _camWindow?.webContents.send('cam:init', cameras);
  });
  _camWindow.on('closed', () => { _camWindow = null; });
});

ipcMain.handle('update:check-now', async () => {
  wireUpdaterEvents();
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// ── FlashForge HTTP — main-process bridge (CORS bypass) ───────────────────
// Why this can't run in the renderer: Electron renderers ARE Chromium, so
// an HTTP POST from `http://localhost:5784` to `http://192.168.40.107:8898`
// is treated as a cross-origin request. Sending JSON triggers a CORS
// preflight (OPTIONS) that the FlashForge firmware doesn't handle — the
// browser blocks the request before the actual POST is even sent. Node's
// fetch (here in main) is not subject to CORS, so it goes through cleanly.
// Mirrors the Flutter monolith's `http.post()` exactly:
//   url   → http://<ip>:8898/{detail|control}
//   body  → { serialNumber, checkCode, … }   (already JSON-encoded by caller)
//   headers → Content-Type: application/json, Accept: */*
// Returns the parsed JSON body, or { code:-1|-2, message } envelopes that
// match what the Flutter side produces on parse / network errors. The
// renderer treats those exactly like a regular FlashForge error code.
const FFG_TIMEOUT_MS = 4000;
ipcMain.handle('ffg:http-post', async (_evt, url, body, timeoutMs) => {
  if (!url || typeof url !== 'string') {
    return { code: -2, message: 'Network error: missing url' };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { code: -2, message: 'Network error: invalid url scheme' };
  }
  // Tight allowlist on the path so a renderer compromise can't pivot
  // this IPC into a generic outbound HTTP proxy. All FlashForge HTTP API
  // endpoints take the same auth body (+ optional fields): live data
  // (/detail), commands (/control), and file management (/gcodeList,
  // /gcodeThumb, /printGcode) — see PROTOCOL §13.8.
  const ok = /\/(detail|control|gcodeList|gcodeThumb|printGcode)$/i.test(new URL(url).pathname);
  if (!ok) {
    return { code: -2, message: 'Network error: path not allowed' };
  }
  const timeout = (typeof timeoutMs === 'number' && timeoutMs > 0 && timeoutMs <= 10000)
    ? timeoutMs : FFG_TIMEOUT_MS;
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
      body: typeof body === 'string' ? body : JSON.stringify(body || {}),
    });
    let parsed;
    try {
      parsed = await res.json();
    } catch (_) {
      parsed = { code: -1, message: 'Invalid JSON', httpStatus: res.status };
    }
    return parsed;
  } catch (e) {
    return { code: -2, message: `Network error: ${e?.message || e}` };
  } finally {
    clearTimeout(tm);
  }
});

// ── FlashForge UDP Multicast discovery (Adventurer 4 era) ────────────────────
// Older FlashForge printers (Adventurer 4 and earlier) don't respond reliably
// to HTTP probes but DO answer a UDP multicast "Hello World!" broadcast on the
// standard FlashForge group 225.0.0.9:19000. The reply body is the printer
// name (null-terminated UTF-8). We collect all replies for 2.5 s then return
// the IP+name list; the renderer probes each IP via ffg:http-post for details.
// Runs in parallel with the HTTP subnet scan — complements it for old models.
ipcMain.handle('ffg:multicast-discover', async () => {
  const dgram = require('dgram');
  const MULTICAST_GROUP = '225.0.0.9';
  const MULTICAST_PORT  = 19000;
  const BIND_PORT       = 8002;
  const LISTEN_MS       = 2500;
  const PAYLOAD         = Buffer.from('Hello World!');

  return new Promise((resolve) => {
    const candidates = new Map(); // dedupe by source IP
    let done = false;

    const finish = () => {
      if (done) return; done = true;
      try { socket.close(); } catch {}
      resolve({ ok: true, candidates: Array.from(candidates.values()) });
    };

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('error', (err) => {
      console.warn('[ffg-multicast] socket error:', err.message);
      if (!done) { done = true; resolve({ ok: false, error: err.message, candidates: [] }); }
    });

    socket.on('message', (buf, rinfo) => {
      const ip = rinfo.address;
      if (candidates.has(ip)) return;
      const end = buf.indexOf(0); // null-terminator in printer name
      const printerName = buf.slice(0, end >= 0 ? end : buf.length).toString('utf8').trim();
      candidates.set(ip, { ip, printerName: printerName || null });
    });

    socket.bind({ port: BIND_PORT, address: '0.0.0.0' }, () => {
      try {
        // Match Flutter's RawDatagramSocket options exactly so behaviour is
        // identical: TTL=4, loopback=false, then join the group, then send.
        socket.setMulticastTTL(4);
        socket.setMulticastLoopback(false);
        socket.addMembership(MULTICAST_GROUP);
        // Send TWO packets (50 ms apart) — first one is occasionally dropped
        // by a router warming up its IGMP snoop table on a fresh socket.
        const send = () => socket.send(PAYLOAD, MULTICAST_PORT, MULTICAST_GROUP, (err) => {
          if (err) console.warn('[ffg-multicast] send error:', err.message);
        });
        send();
        setTimeout(send, 50);
      } catch (e) {
        console.warn('[ffg-multicast] setup failed:', e.message);
        finish();
        return;
      }
      setTimeout(finish, LISTEN_MS);
    });
  });
});

// ── FlashForge UDP identity probe — port 19000 ───────────────────────────────
// Modern FlashForge models (5M, AD5X, Creator 5 / 5 Pro) answer a direct UDP
// datagram on port 19000 with a fixed identity record: the model name at offset
// 0 (ASCII, NUL-padded), an 18-byte binary header, then the serial number
// (ASCII, NUL-padded). This is THE mechanism FlashPrint / Orca-FlashForge use to
// identify a printer before asking for only the access code — the serial never
// appears in the HTTP /detail payload, so this is the only credential-free way
// to obtain it. Any payload triggers the reply; we send "Hello World!" for
// parity with the multicast path. Works via unicast (known IP) or broadcast.
function _ffgParseUdpIdentity(buf) {
  if (!buf || buf.length < 32) return null;
  const nul = buf.indexOf(0);
  const machineModel = buf.slice(0, nul >= 0 ? nul : 0).toString('utf8').trim();
  // Serial = first printable-ASCII run (>=4 chars) after the binary header.
  let serialNumber = '';
  const m = buf.slice(128).toString('latin1').match(/[\x20-\x7e]{4,}/);
  if (m) serialNumber = m[0].trim().replace(/^SN/i, '');
  if (!machineModel && !serialNumber) return null;
  return { machineModel: machineModel || null, serialNumber: serialNumber || null };
}

ipcMain.handle('ffg:udp-probe', async (_evt, ip) => {
  if (!ip || typeof ip !== 'string') return { ok: false, error: 'missing ip' };
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { ok: false, error: 'invalid ip' };

  const dgram = require('dgram');
  const PORT       = 19000;
  const TIMEOUT_MS = 1200;
  const PAYLOAD    = Buffer.from('Hello World!');

  return new Promise((resolve) => {
    let done = false;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const finish = (res) => { if (done) return; done = true; try { socket.close(); } catch {} resolve(res); };

    socket.on('error', (e) => finish({ ok: false, error: e.message }));
    socket.on('message', (buf, rinfo) => {
      if (rinfo.address !== ip) return;            // ignore stray broadcast replies
      const id = _ffgParseUdpIdentity(buf);
      if (id) finish({ ok: true, ...id });
    });

    socket.bind({ port: 0, address: '0.0.0.0' }, () => {
      try { socket.send(PAYLOAD, PORT, ip, (err) => { if (err) finish({ ok: false, error: err.message }); }); }
      catch (e) { finish({ ok: false, error: e.message }); return; }
      setTimeout(() => finish({ ok: false, error: 'timeout' }), TIMEOUT_MS);
    });
  });
});

// ── FlashForge TCP probe — port 8899, M115 identity command ──────────────────
// The ~M115 command returns machine type, name, firmware, serial, MAC even when
// the printer's HTTP /detail response is incomplete. Used as an identity fallback
// when the HTTP probe returns sparse data (e.g. older firmware with partial JSON).
// Allowlisted to port 8899 only — not a generic TCP proxy.
ipcMain.handle('ffg:tcp-probe', async (_evt, ip) => {
  if (!ip || typeof ip !== 'string') return { ok: false, error: 'missing ip' };
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { ok: false, error: 'invalid ip' };

  const net = require('net');
  const TIMEOUT_MS = 700;

  return new Promise((resolve) => {
    let buffer = '';
    let resolved = false;

    const finish = (result) => {
      if (resolved) return; resolved = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };

    const socket = new net.Socket();
    socket.setTimeout(TIMEOUT_MS);

    socket.on('connect', () => { socket.write('~M115\r\n'); });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!buffer.includes('ok')) return; // wait for end marker
      const fields = {};
      for (const line of buffer.split('\r\n')) {
        const m = line.match(/^([^:]+):\s*(.+)$/);
        if (!m) continue;
        const key = m[1].trim();
        const val = m[2].trim();
        if      (key === 'Machine Type') fields.machineModel  = val;
        else if (key === 'Machine Name') fields.machineName   = val;
        else if (key === 'Firmware')     fields.firmware      = val;
        else if (key === 'SN')           fields.serialNumber  = val.replace(/^SN/i, '');
        else if (key === 'Mac Address')  fields.macAddress    = val;
      }
      finish({ ok: true, fields });
    });

    socket.on('timeout', () => finish({ ok: false, error: 'timeout' }));
    socket.on('error',   (e) => finish({ ok: false, error: e.message }));

    socket.connect(8899, ip);
  });
});

// ── Creality TCP probe — port 9999 open/closed fast filter ───────────────────
// Mirrors ffg:tcp-probe above but is a pure reachability check: it only
// reports whether the WebSocket control port (9999) accepts a TCP
// connection. The renderer then opens a real WebSocket on each open host to
// run the Creality JSON handshake (isCrealityLike) — the browser WebSocket
// API works cross-origin without CORS, so that part stays in the renderer.
// Returns { ok: true } when the port is open, { ok: false, error } otherwise.
ipcMain.handle('cre:tcp-probe', async (_evt, ip) => {
  if (!ip || typeof ip !== 'string') return { ok: false, error: 'missing ip' };
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { ok: false, error: 'invalid ip' };

  const net = require('net');
  const TIMEOUT_MS = 650;
  const CRE_WS_PORT = 9999;

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (resolved) return; resolved = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };

    const socket = new net.Socket();
    socket.setTimeout(TIMEOUT_MS);
    socket.on('connect', () => finish({ ok: true }));
    socket.on('timeout', () => finish({ ok: false, error: 'timeout' }));
    socket.on('error',   (e) => finish({ ok: false, error: e.message }));
    socket.connect(CRE_WS_PORT, ip);
  });
});

// ── Bambu Lab SSDP discovery — multicast 239.255.255.250:1900 ─────────────────
// Bambu printers advertise themselves on the SSDP multicast group (and also
// respond to an explicit M-SEARCH). Both modern and older firmwares expose
// the same custom DevModel/DevName/DevVersion headers — we parse them all and
// keep whichever provides the most identity. The single-shot 4 s listen window
// catches both unsolicited NOTIFYs and replies to our two paced M-SEARCH probes.
// Returns { ok, candidates: [{ip, serial, model, name, firmware, connect, bind, signal, source:'ssdp'}] }.
const BBL_SSDP_ADDR = '239.255.255.250';
const BBL_SSDP_PORT = 1900;
const BBL_SSDP_LISTEN_MS = 4000;
const BBL_SSDP_ST = 'urn:bambulab-com:device:3dprinter:1';
const BBL_MSEARCH = [
  'M-SEARCH * HTTP/1.1',
  `HOST: ${BBL_SSDP_ADDR}:${BBL_SSDP_PORT}`,
  'MAN: "ssdp:discover"',
  'MX: 1',
  `ST: ${BBL_SSDP_ST}`,
  '', ''
].join('\r\n');

function _parseBambuSsdp(body, srcIp) {
  // Split headers; skip the request/status line.
  const lines = String(body || '').split(/\r?\n/).slice(1);
  const h = {};
  let hasDevHeader = false;
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    h[key] = val;
    if (key.startsWith('dev')) hasDevHeader = true;
  }
  const first = (...keys) => {
    for (const k of keys) { const v = h[k]; if (v) return v; }
    return null;
  };
  // Serial: usn → strip "uuid:" prefix and anything after "::"; then strip non-alphanumeric.
  let serial = first('usn', 'serial') || '';
  serial = serial.replace(/^uuid:/i, '').split('::')[0];
  serial = serial.replace(/[^a-z0-9]/gi, '');
  // IP: location header (parse URI host), else datagram source.
  let ip = srcIp || null;
  const loc = first('location');
  if (loc) {
    try { const u = new URL(loc); if (u.hostname) ip = u.hostname; } catch {}
  }
  const model    = first('devmodel.bambu.com', 'devmodel', 'model');
  const name     = first('devname.bambu.com', 'devname', 'friendlyname', 'friendly_name');
  const firmware = first('devversion.bambu.com', 'devversion', 'firmware', 'version');
  const connect  = first('devconnect.bambu.com', 'devconnect');
  const bind     = first('devbind.bambu.com', 'devbind');
  const signal   = first('devsignal.bambu.com', 'devsignal');
  // Validity gate: at least one identity field AND (any "dev*" header OR a usable serial).
  const hasIdentity = !!(serial || model || name);
  if (!hasIdentity) return null;
  if (!hasDevHeader && !serial) return null;
  // Simple quality score for dedupe; the renderer doesn't have to compute it.
  let score = 0;
  if (serial)   score += 5;
  if (model)    score += 4;
  if (name)     score += 5;
  if (firmware) score += 1;
  if (connect)  score += 1;
  if (bind)     score += 1;
  if (signal)   score += 1;
  return { ip, serial: serial || null, model: model || null, name: name || null,
           firmware: firmware || null, connect: connect || null, bind: bind || null,
           signal: signal || null, source: 'ssdp', score };
}

ipcMain.handle('bambu:ssdp-discover', async () => {
  const dgram = require('dgram');
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const candidates = new Map(); // key (serial-or-ip) → candidate
    let done = false;
    const finish = (extra = {}) => {
      if (done) return; done = true;
      try { sock.close(); } catch {}
      resolve({ ok: true, candidates: [...candidates.values()], ...extra });
    };
    sock.on('error', (e) => { if (done) return; done = true;
      try { sock.close(); } catch {}
      resolve({ ok: false, error: e?.message || String(e), candidates: [] });
    });
    sock.on('message', (msg, rinfo) => {
      const cand = _parseBambuSsdp(msg.toString('utf8'), rinfo.address);
      if (!cand) return;
      const key = (cand.serial || cand.ip || '').toLowerCase();
      if (!key) return;
      const prev = candidates.get(key);
      if (!prev || (cand.score || 0) > (prev.score || 0)) candidates.set(key, cand);
    });
    sock.bind(0, () => {
      try { sock.addMembership(BBL_SSDP_ADDR); } catch {}
      const buf = Buffer.from(BBL_MSEARCH);
      const send = () => { try { sock.send(buf, 0, buf.length, BBL_SSDP_PORT, BBL_SSDP_ADDR); } catch {} };
      send();
      setTimeout(send, 120);
      setTimeout(finish, BBL_SSDP_LISTEN_MS);
    });
  });
});

// ── Bambu Lab TLS cert sniff on :8883 — per-IP brand confirmation ────────────
// Used by the manual "Add by IP" path to confirm a typed IP is actually a
// Bambu printer (the TLS cert subject/issuer contains "bambu" or "bbl").
// Returns { ok, serial?, raw: { subject, issuer } } — `ok` true only when
// the cert confirms a Bambu device. CN may be the serial; we normalize it.
ipcMain.handle('bambu:tls-probe', async (_evt, ip) => {
  if (!ip || typeof ip !== 'string') return { ok: false, error: 'missing ip' };
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { ok: false, error: 'invalid ip' };
  const tls = require('tls');
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true;
      try { sock.destroy(); } catch {}
      resolve(r);
    };
    // 4 s timeout: the TLS handshake to a Bambu MCU (especially an A1 / A1 Mini,
    // and more so across a subnet) routinely takes ~1.4 s. The old 600 ms cut it
    // off mid-handshake and surfaced as "No reply from <ip>" even though the
    // printer was reachable and port 8883 was open.
    const sock = tls.connect({ host: ip, port: 8883, rejectUnauthorized: false, timeout: 4000 }, () => {
      let cert; try { cert = sock.getPeerCertificate(); } catch {}
      const subjStr = JSON.stringify(cert?.subject || {});
      const issStr  = JSON.stringify(cert?.issuer  || {});
      const hay = (subjStr + issStr).toLowerCase();
      const isBambu = hay.includes('bambu') || hay.includes('bbl');
      const cn = cert?.subject?.CN || '';
      const serial = isBambu ? String(cn).replace(/[^a-z0-9]/gi, '') : '';
      finish({ ok: isBambu, serial: serial || null, raw: { subject: cert?.subject || null, issuer: cert?.issuer || null } });
    });
    sock.on('timeout', () => finish({ ok: false, error: 'timeout' }));
    sock.on('error',   (e) => finish({ ok: false, error: e?.message || 'tls error' }));
  });
});

// ── Bambu Lab print thumbnail (FTPS) — see bambulab/PROTOCOL.md §11 ───────────
// Fetch the current print's model preview: FTPS (implicit :990, user bblp, pass =
// Access Code, self-signed cert ignored) → find the current .3mf (the actively-
// printing slice lives in /model, older jobs in /cache, manual uploads at root) →
// extract Metadata/plate_N.png (a .3mf is a ZIP). Bambu answers PASV with host
// 0.0.0.0, which basic-ftp rejects — rewrite it to the control host (printer IP).
const _bblBasename  = (p) => String(p || '').split(/[\\/]/).pop() || '';
const _bblBaseNoExt = (p) => _bblBasename(p).replace(/\.[^.]+$/, '');

// Directories a print's .3mf can live in, most-likely-first for a job seen live:
// /model holds the actively-printing slice, /cache older jobs, / manual/slicer
// uploads (A1/P1), /data + /data/Metadata on some firmware/models. (bambuddy #972)
const _BBL_3MF_DIRS = ['/model', '/cache', '', '/data', '/data/Metadata'];

// Build the plausible on-printer filenames for the current print from its
// gcode_file/subtask hint. Firmware reports it inconsistently — bare stem, .3mf,
// or .gcode.3mf — and Bambu Studio normalizes spaces to underscores. Mirror
// bambuddy's variant set so the exact-name lookup hits before any fuzzy scan.
function _bblCandidateNames(fileHint) {
  const base = _bblBasename(fileHint);
  const stem = base.replace(/\.gcode\.3mf$/i, '').replace(/\.gcode$/i, '').replace(/\.3mf$/i, '');
  const names = [];
  if (/\.3mf$/i.test(base)) names.push(base);        // already a .3mf name — trust it first
  if (stem) { names.push(`${stem}.gcode.3mf`); names.push(`${stem}.3mf`); }
  for (const n of names.slice()) if (n.includes(' ')) names.push(n.replace(/ /g, '_'));
  return [...new Set(names)];                          // dedup, order-preserving
}

function _bblExtractPlatePng(zipBuf, plateIdx) {
  return new Promise((resolve) => {
    let yauzl; try { yauzl = require('yauzl'); } catch { return resolve(null); }
    yauzl.fromBuffer(zipBuf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return resolve(null);
      const want = Number(plateIdx) || 1;
      const plateNum = (name) => { const m = name.match(/plate_(\d+)\.png$/i); return m ? Number(m[1]) : null; };
      let best = null, bestRank = 1e9, done = false;
      const finish = (buf) => { if (done) return; done = true; try { zip.close(); } catch {} resolve(buf); };
      const readEntryToBuf = (entry, cb) => zip.openReadStream(entry, (e, rs) => {
        if (e || !rs) return cb(null);
        const c = []; rs.on('data', d => c.push(d)); rs.on('end', () => cb(Buffer.concat(c))); rs.on('error', () => cb(null));
      });
      zip.on('entry', (entry) => {
        const num = /^metadata\/plate_\d+\.png$/i.test(entry.fileName) ? plateNum(entry.fileName) : null;
        if (num === want) return readEntryToBuf(entry, (b) => b ? finish(b) : zip.readEntry()); // exact plate → take it now
        if (num != null) { const rank = num === 1 ? 0 : num; if (rank < bestRank) { bestRank = rank; best = entry; } }
        zip.readEntry();
      });
      zip.on('end', () => best ? readEntryToBuf(best, finish) : finish(null));
      zip.readEntry();
    });
  });
}

ipcMain.handle('bambulab:fetch-thumbnail', async (_evt, { ip, accessCode, fileHint, plateIdx } = {}) => {
  if (!ip || !accessCode) return { ok: false, error: 'missing ip/accessCode' };
  let FTP; try { FTP = require('basic-ftp'); } catch { return { ok: false, error: 'basic-ftp not installed' }; }
  const { Writable } = require('stream');
  const client = new FTP.Client(15000);
  const dl = async (path) => {
    const chunks = [];
    await client.downloadTo(new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } }), path);
    return Buffer.concat(chunks);
  };
  try {
    await client.access({ host: ip, port: 990, user: 'bblp', password: accessCode, secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
    // PASV 0.0.0.0 → control host rewrite (Bambu quirk).
    const ctrl = String(client.ftp.socket?.remoteAddress || ip).replace(/^::ffff:/i, '').split('.');
    const origRequest = client.ftp.request.bind(client.ftp);
    client.ftp.request = async (cmd) => {
      const res = await origRequest(cmd);
      if (typeof cmd === 'string' && cmd.toUpperCase() === 'PASV' && /\(0,0,0,0,/.test(res.message)) {
        res.message = res.message.replace('(0,0,0,0,', `(${ctrl.join(',')},`);
      }
      return res;
    };
    // 1) Direct hit by exact name. Try every plausible filename variant against
    //    every candidate dir (/model first — that's the actively-printing slice).
    let zipBuf = null;
    for (const name of _bblCandidateNames(fileHint)) {
      for (const dir of _BBL_3MF_DIRS) {
        try { zipBuf = await dl(`${dir}/${name}`); } catch { zipBuf = null; }
        if (zipBuf && zipBuf.length) break;
      }
      if (zipBuf && zipBuf.length) break;
    }
    // 2) Fuzzy fallback: list the candidate dirs and match a .3mf by basename,
    //    normalizing spaces↔underscores (Bambu Studio does). Never pick an
    //    arbitrary file — a wrong-model thumbnail is worse than none.
    if (!zipBuf || !zipBuf.length) {
      const norm = (s) => _bblBaseNoExt(s).toLowerCase().replace(/ /g, '_');
      const target = norm(fileHint);
      const paths = [];
      for (const dir of _BBL_3MF_DIRS) {
        const d = dir || '/';
        try { (await client.list(d)).forEach(f => { if (/\.3mf$/i.test(f.name)) paths.push(dir + '/' + f.name); }); } catch {}
      }
      const pick = target ? paths.find(p => { const f = norm(p); return f === target || f.includes(target) || target.includes(f); }) : null;
      if (pick) { try { zipBuf = await dl(pick); } catch { zipBuf = null; } }
    }
    if (!zipBuf || !zipBuf.length) return { ok: false, error: 'no .3mf found on printer' };
    const png = await _bblExtractPlatePng(zipBuf, plateIdx);
    if (!png) return { ok: false, error: 'no plate thumbnail in .3mf' };
    return { ok: true, dataUri: `data:image/png;base64,${png.toString('base64')}` };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    try { client.close(); } catch {}
  }
});

// ── Elegoo UDP discovery — unicast spray on :52700 ───────────────────────────
// Elegoo printers (Centauri/SDCP family) answer the discovery JSON-RPC
// `{"id":0,"method":7000}` over UDP. The Flutter scanner sends one datagram
// per host across each /24 (NOT a broadcast) and listens for replies on the
// same ephemeral socket. We accept the prefix list from the renderer.
// Returns { ok, candidates: [{ip, sn, machineModel, hostName, ...}] }.
const ELG_UDP_PORT = 52700;
const ELG_UDP_LISTEN_MS = 2400;
const ELG_UDP_PAYLOAD = Buffer.from('{"id":0,"method":7000}');

function _parseElegooReply(body, srcIp) {
  const raw = String(body || '').trim();
  if (!raw) return null;
  let obj = null;
  try { obj = JSON.parse(raw); } catch {
    // Non-JSON fallback: only keep it if the text clearly looks Elegoo.
    const low = raw.toLowerCase();
    if (low.includes('elegoo') || low.includes('centauri')) {
      return { ip: srcIp, sn: null, machineModel: null, hostName: null, message: raw, source: 'udp' };
    }
    return null;
  }
  // Flatten one nesting level so callers can read fields uniformly.
  const flat = { ...obj };
  for (const k of ['result', 'params', 'data', 'msg']) {
    if (flat[k] && typeof flat[k] === 'object' && !Array.isArray(flat[k])) Object.assign(flat, flat[k]);
  }
  const first = (...keys) => { for (const k of keys) { const v = flat[k]; if (v && String(v).trim()) return String(v).trim(); } return null; };
  const hostName     = first('host_name', 'hostName', 'hostname');
  const machineModel = first('machine_model', 'machineModel', 'model');
  const sn           = first('sn', 'serial', 'serial_number');
  const protoVer     = first('protocol_version', 'protocolVersion');
  const tokenStatus  = flat.token_status ?? flat.tokenStatus ?? null;
  const lanStatus    = flat.lan_status ?? flat.lanStatus ?? null;
  const otaVersion   = flat?.software_version?.ota_version || flat?.softwareVersion?.otaVersion || null;
  if (!hostName && !machineModel && !sn) return null;
  let score = 0;
  if (hostName)     score += 4;
  if (machineModel) score += 3;
  if (sn)           score += 5;
  if (protoVer)     score += 1;
  if (otaVersion)   score += 1;
  if (tokenStatus != null) score += 1;
  if (lanStatus   != null) score += 1;
  return { ip: srcIp, sn: sn || null, machineModel, hostName, protocolVersion: protoVer,
           otaVersion, tokenStatus, lanStatus, source: 'udp', score };
}

ipcMain.handle('elegoo:udp-discover', async (_evt, prefixes) => {
  const list = Array.isArray(prefixes) ? prefixes.filter(p => /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p)) : [];
  if (!list.length) return { ok: true, candidates: [] };
  const dgram = require('dgram');
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const candidates = new Map(); // ip → candidate
    let done = false, sendsLeft = list.length * 254;
    const finish = () => { if (done) return; done = true;
      try { sock.close(); } catch {}
      resolve({ ok: true, candidates: [...candidates.values()] });
    };
    sock.on('error', (e) => { if (done) return; done = true;
      try { sock.close(); } catch {}
      resolve({ ok: false, error: e?.message || String(e), candidates: [] });
    });
    sock.on('message', (msg, rinfo) => {
      const cand = _parseElegooReply(msg.toString('utf8'), rinfo.address);
      if (!cand) return;
      const prev = candidates.get(cand.ip);
      if (!prev || (cand.score || 0) > (prev.score || 0)) candidates.set(cand.ip, cand);
    });
    sock.bind(0, async () => {
      // Spray one datagram per host, yielding to the event loop every 16
      // sends so reply messages get processed mid-spray.
      let i = 0;
      for (const prefix of list) {
        for (let host = 1; host <= 254; host++) {
          if (done) return;
          const ip = `${prefix}.${host}`;
          try { sock.send(ELG_UDP_PAYLOAD, 0, ELG_UDP_PAYLOAD.length, ELG_UDP_PORT, ip); } catch {}
          sendsLeft--;
          i++;
          if ((i & 15) === 0) await new Promise(r => setImmediate(r));
        }
      }
      // Listen window starts after the last send.
      setTimeout(finish, ELG_UDP_LISTEN_MS);
    });
  });
});

// Targeted single-IP UDP probe used by manual "Add by IP".
// Two sends 60 ms apart, 1400 ms listen.
ipcMain.handle('elegoo:udp-probe', async (_evt, ip) => {
  if (!ip || typeof ip !== 'string') return { ok: false, error: 'missing ip' };
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { ok: false, error: 'invalid ip' };
  const dgram = require('dgram');
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let done = false, hit = null;
    const finish = () => { if (done) return; done = true;
      try { sock.close(); } catch {}
      resolve({ ok: !!hit, candidate: hit });
    };
    sock.on('error', () => finish());
    sock.on('message', (msg, rinfo) => {
      if (rinfo.address !== ip) return;
      const cand = _parseElegooReply(msg.toString('utf8'), rinfo.address);
      if (cand) hit = cand;
    });
    sock.bind(0, () => {
      const send = () => { try { sock.send(ELG_UDP_PAYLOAD, 0, ELG_UDP_PAYLOAD.length, ELG_UDP_PORT, ip); } catch {} };
      send();
      setTimeout(send, 60);
      setTimeout(finish, 1400);
    });
  });
});

// ── Elegoo SDCP discovery (Centauri Carbon 1, Saturn/Mars range) ────────────
// SDCP printers do not answer the CC2's method-7000 probe on 52700 and run no
// MQTT broker. They answer the text `M99999` on UDP 3000 with
// { Id, Data: { Name, MachineName, BrandName, MainboardIP, MainboardID,
//   ProtocolVersion, FirmwareVersion } } — confirmed unicast AND broadcast on
// CC1 firmware V1.4.49 (issue #41). The live link is then a plain WebSocket
// on :3030 opened by the renderer (printers/elegoo/sdcp.js).
const SDCP_UDP_PORT = 3000;
const SDCP_PROBE = Buffer.from('M99999');
function _parseSdcpReply(text, srcIp) {
  let j; try { j = JSON.parse(text); } catch { return null; }
  const d = j?.Data || j?.data;
  if (!d || !d.MainboardID) return null;
  return {
    ip: d.MainboardIP || srcIp, protocol: 'sdcp',
    mainboardId: String(d.MainboardID), machineModel: d.MachineName || d.Name || null,
    hostName: d.Name || null, brandName: d.BrandName || null,
    protocolVersion: d.ProtocolVersion || null, firmwareVersion: d.FirmwareVersion || null,
    source: 'sdcp-udp',
  };
}
// Sweep: a unicast spray of every host of each /24 (what works through Wi-Fi
// isolation and routed VLANs) plus one directed broadcast per /24.
ipcMain.handle('elegoo:sdcp-discover', async (_evt, prefixes) => {
  const list = Array.isArray(prefixes) ? prefixes.filter(p => /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p)) : [];
  if (!list.length) return { ok: true, candidates: [] };
  const dgram = require('dgram');
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const candidates = new Map();
    let done = false;
    const finish = () => { if (done) return; done = true; try { sock.close(); } catch {} resolve({ ok: true, candidates: [...candidates.values()] }); };
    sock.on('error', (e) => { if (done) return; done = true; try { sock.close(); } catch {} resolve({ ok: false, error: e?.message || String(e), candidates: [] }); });
    sock.on('message', (msg, rinfo) => {
      const c = _parseSdcpReply(msg.toString('utf8'), rinfo.address);
      if (c) candidates.set(c.ip, c);
    });
    sock.bind(0, async () => {
      try { sock.setBroadcast(true); } catch {}
      let i = 0;
      for (const prefix of list) {
        try { sock.send(SDCP_PROBE, 0, SDCP_PROBE.length, SDCP_UDP_PORT, `${prefix}.255`); } catch {}
        for (let host = 1; host <= 254; host++) {
          if (done) return;
          try { sock.send(SDCP_PROBE, 0, SDCP_PROBE.length, SDCP_UDP_PORT, `${prefix}.${host}`); } catch {}
          if ((++i & 15) === 0) await new Promise(r => setImmediate(r));
        }
      }
      setTimeout(finish, 2400);
    });
  });
});
// One address (manual "Add by IP"): two sends, 1.4 s listen.
ipcMain.handle('elegoo:sdcp-probe', async (_evt, ip) => {
  if (!ip || typeof ip !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { ok: false, error: 'invalid ip' };
  const dgram = require('dgram');
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let done = false, hit = null;
    const finish = () => { if (done) return; done = true; try { sock.close(); } catch {} resolve({ ok: !!hit, candidate: hit }); };
    sock.on('error', () => finish());
    sock.on('message', (msg, rinfo) => {
      if (rinfo.address !== ip) return;
      const c = _parseSdcpReply(msg.toString('utf8'), rinfo.address);
      if (c) hit = c;
    });
    sock.bind(0, () => {
      const send = () => { try { sock.send(SDCP_PROBE, 0, SDCP_PROBE.length, SDCP_UDP_PORT, ip); } catch {} };
      send(); setTimeout(send, 60); setTimeout(finish, 1400);
    });
  });
});

// ── Snapmaker HTTP GET — main-process bridge (CORS bypass) ───────────────────
// Mirrors the FlashForge bridge above. The renderer's Chromium engine treats
// requests from http://localhost:<port> to http://192.168.x.x:7125 as cross-
// origin, so direct fetch() from probe.js fails silently (no CORS headers on
// Moonraker). Node's fetch() here in main is not subject to CORS, so it goes
// through cleanly — exactly like the Flutter http.get() calls.
//
// Allowed paths: /printer/info  /server/info  /machine/system_info
// Returns: { ok: true, status, json } | { ok: false, status, error }
const SNAP_HTTP_TIMEOUT_MS = 3500;
ipcMain.handle('snap:http-get', async (_evt, url, timeoutMs) => {
  if (!url || typeof url !== 'string') {
    return { ok: false, status: 0, error: 'missing url' };
  }
  let parsed;
  try { parsed = new URL(url); } catch {
    return { ok: false, status: 0, error: 'invalid url' };
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { ok: false, status: 0, error: 'url scheme not allowed' };
  }
  // Tight allowlist — the three Moonraker probe paths used by snapProbeIp()
  // plus the paxx extended-firmware status API (installed-version probe).
  // Prevents this IPC from becoming a generic HTTP proxy if the renderer
  // is ever compromised.
  const ALLOWED = ['/printer/info', '/server/info', '/machine/system_info',
                   '/firmware-config/api/status'];
  if (!ALLOWED.includes(parsed.pathname)) {
    return { ok: false, status: 0, error: 'path not allowed' };
  }
  const timeout = (typeof timeoutMs === 'number' && timeoutMs > 0 && timeoutMs <= 10000)
    ? timeoutMs : SNAP_HTTP_TIMEOUT_MS;
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json' },
    });
    let json = null;
    try { json = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  } finally {
    clearTimeout(tm);
  }
});

// ── Prusa — PrusaLink HTTP IPC (port 80) ──────────────────────────────────────
// Every Prusa that runs PrusaLink (MK4/MK4S, MK3.9, Core One, XL, MINI/MINI+ on
// Buddy firmware; MK3S+/MK2.5S through a Raspberry Pi) answers the same local
// REST API. It sends no CORS headers and wants HTTP DIGEST auth (user `maker`,
// password shown on the printer), so the renderer goes through here: Node's
// fetch() is CORS-exempt, and the digest handshake lives in one place.
// An `X-Api-Key` is sent instead when the printer was set up with an API key
// (older PrusaLink builds). Reference: renderer/printers/prusa/PROTOCOL.md.
//
// Tight path allowlist: this must never become a generic outbound proxy.
// Returns { ok, status, json?, data? (base64), contentType?, error? }.
const PRUSA_HTTP_TIMEOUT_MS = 6000;
const PRUSA_ALLOWED = [
  /^\/api\/version$/,
  /^\/api\/v1\/(status|info|storage|job|cameras)$/,
  /^\/api\/v1\/job\/\d+(\/(pause|resume|continue))?$/,
  /^\/api\/v1\/cameras\/snap$/,
  /^\/api\/v1\/cameras\/[\w-]{1,64}\/snap$/,
  /^\/api\/v1\/files\/[\w.-]+(\/[^?#]*)?$/,
  /^\/api\/thumbnails\/[^?#]+$/,
  /^\/thumb\/[sl]\/[^?#]+$/,
];
const _prusaDigest = new Map();   // host → { realm, nonce, opaque, qop, algorithm, nc }

function _prusaDigestHeader(host, method, uri, user, pass) {
  const d = _prusaDigest.get(host);
  if (!d) return null;
  const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
  d.nc = (d.nc || 0) + 1;
  const nc = d.nc.toString(16).padStart(8, '0');
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = md5(`${user}:${d.realm}:${pass}`);
  const ha2 = md5(`${method}:${uri}`);
  const qop = d.qop ? (d.qop.split(',').map(s => s.trim()).includes('auth') ? 'auth' : d.qop.split(',')[0].trim()) : null;
  const response = qop ? md5(`${ha1}:${d.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${d.nonce}:${ha2}`);
  let h = `Digest username="${user}", realm="${d.realm}", nonce="${d.nonce}", uri="${uri}", response="${response}"`;
  if (d.algorithm) h += `, algorithm=${d.algorithm}`;
  if (d.opaque) h += `, opaque="${d.opaque}"`;
  if (qop) h += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  return h;
}
function _prusaParseChallenge(header) {
  if (!header || !/^\s*Digest\b/i.test(header)) return null;
  const out = {};
  for (const m of header.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3];
  return out.nonce ? { realm: out.realm || '', nonce: out.nonce, opaque: out.opaque || null, qop: out.qop || null, algorithm: out.algorithm || null, nc: 0 } : null;
}

ipcMain.handle('prusa:http', async (_evt, opts) => {
  const { host, method = 'GET', path: p = '', user = 'maker', password = '', apiKey = '', body = null, binary = false, timeoutMs } = opts || {};
  if (!host || typeof host !== 'string' || !/^[\w.\-]+(:\d{1,5})?$/.test(host)) return { ok: false, status: 0, error: 'invalid host' };
  const m = String(method).toUpperCase();
  if (!['GET', 'PUT', 'DELETE', 'HEAD'].includes(m)) return { ok: false, status: 0, error: 'method not allowed' };
  const uri = String(p);
  if (!PRUSA_ALLOWED.some(rx => rx.test(uri.split('?')[0]))) return { ok: false, status: 0, error: 'path not allowed' };

  const send = async (auth) => {
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), Math.min(Number(timeoutMs) || PRUSA_HTTP_TIMEOUT_MS, 20000));
    try {
      const headers = {};
      if (apiKey) headers['X-Api-Key'] = apiKey;
      else if (auth) headers.Authorization = auth;
      if (body != null) headers['Content-Type'] = 'application/json';
      return await fetch(`http://${host}${uri}`, { method: m, headers, body: body != null ? JSON.stringify(body) : undefined, signal: ctl.signal });
    } finally { clearTimeout(tm); }
  };
  try {
    // A cached challenge saves the 401 round-trip on every poll; a stale nonce
    // costs one retry.
    let res = await send(apiKey ? null : _prusaDigestHeader(host, m, uri, user, password));
    if (res.status === 401 && !apiKey) {
      const ch = _prusaParseChallenge(res.headers.get('www-authenticate'));
      if (ch) { _prusaDigest.set(host, ch); res = await send(_prusaDigestHeader(host, m, uri, user, password)); }
    }
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 204 || m === 'HEAD') return { ok: res.ok, status: res.status, contentType };
    if (binary && res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { ok: true, status: res.status, contentType, data: buf.toString('base64') };
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    return { ok: res.ok, status: res.status, contentType, json, error: res.ok ? undefined : (json?.title || json?.message || text.slice(0, 200) || `HTTP ${res.status}`) };
  } catch (e) {
    return { ok: false, status: 0, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e)) };
  }
});

// Discovery probe — ONE unauthenticated GET /api/version. A PrusaLink printer
// answers 401 with a Digest challenge (Buddy realm "Printer API"), or 200 with
// `{ text: "PrusaLink …" }` when auth is off; the `Server` header often says
// PrusaLink too. Nothing is sent but the path, so it is safe on a scan.
ipcMain.handle('prusa:probe', async (_evt, host, timeoutMs) => {
  if (!host || typeof host !== 'string' || !/^[\w.\-]+(:\d{1,5})?$/.test(host)) return { prusa: false };
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), Math.min(Number(timeoutMs) || 800, 5000));
  try {
    const res = await fetch(`http://${host}/api/version`, { signal: ctl.signal });
    const server = res.headers.get('server') || '';
    const wwwAuth = res.headers.get('www-authenticate') || '';
    let json = null;
    if (res.ok) { try { json = await res.json(); } catch (_) {} }
    const prusa = /prusa/i.test(server) || /printer api|prusa/i.test(wwwAuth)
      || (!!json && (/prusa/i.test(String(json.text || '')) || (json.api && json.printer && json.firmware)));
    return { prusa, status: res.status, server, needsAuth: res.status === 401, version: json };
  } catch (e) {
    return { prusa: false, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e)) };
  } finally { clearTimeout(tm); }
});

// ── Printer plugins (main-process side) ───────────────────────────────────
// A printer integration is a self-contained folder, renderer/printers/<id>/
// (docs/PRINTER-PLUGINS.md). When it needs the main process — LAN requests
// without CORS, a credential in a header — it ships a `main.cjs` exporting
// register({ ipcMain, channel }). Every such file is loaded here at start-up;
// `channel(name)` namespaces its handlers as `printer:<id>:<name>`, which is
// the only shape preload's generic bridge (window.printerPlugin.invoke) will
// forward. A plugin that fails to load is logged and skipped — never fatal.
(function loadPrinterPlugins() {
  const dir = path.join(__dirname, 'renderer', 'printers');
  let ids = [];
  try { ids = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch (_) {}
  for (const id of ids) {
    if (!/^[a-z0-9-]+$/.test(id)) continue;
    const file = path.join(dir, id, 'main.cjs');
    if (!fs.existsSync(file)) continue;
    try {
      require(file).register({ ipcMain, channel: name => `printer:${id}:${name}` });
      log.info(`[printer-plugin] ${id} — main side loaded`);
    } catch (e) {
      log.warn(`[printer-plugin] ${id} failed to load: ${e?.message || e}`);
    }
  }
})();

// ── Creality Moonraker HTTP IPC (port 7125) ───────────────────────────────────
// The K-series runs Klipper + Moonraker, which sends NO CORS headers. A renderer
// fetch() is therefore blocked: a JSON-body / non-GET request triggers a preflight
// OPTIONS that Moonraker answers with 405, and even a "simple" request's response
// is unreadable (no Access-Control-Allow-Origin). Node's fetch() here in main is
// CORS-exempt — same rationale as snap:http-get. Used for live controls
// (/printer/gcode/script), print-start and file delete.
// `query` is an optional object appended as a query string (e.g. { script }).
// Returns { ok, status, json } | { ok:false, status:0, error }.
const CRE_HTTP_TIMEOUT_MS = 10000;
ipcMain.handle('cre:http', async (_evt, ip, method, path, query, timeoutMs) => {
  if (!ip || typeof ip !== 'string' || !/^[\w.\-]+$/.test(ip)) {
    return { ok: false, status: 0, error: 'invalid ip' };
  }
  const m = String(method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'DELETE'].includes(m)) {
    return { ok: false, status: 0, error: 'method not allowed' };
  }
  // Tight path allowlist — keeps this IPC from becoming a generic outbound HTTP
  // proxy if the renderer is ever compromised. Only the Moonraker endpoints the
  // Creality integration actually calls.
  const p = String(path || '');
  const ALLOWED = [
    /^\/printer\/gcode\/script$/,
    /^\/printer\/print\/start$/,
    /^\/server\/files\/gcodes\/.+/,
  ];
  if (!ALLOWED.some((rx) => rx.test(p))) {
    return { ok: false, status: 0, error: 'path not allowed' };
  }
  let url = `http://${ip}:7125${p}`;
  if (query && typeof query === 'object') {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += `?${qs}`;
  }
  // Homing (G28) blocks until done, so allow a generous cap.
  const timeout = (typeof timeoutMs === 'number' && timeoutMs > 0 && timeoutMs <= 120000)
    ? timeoutMs : CRE_HTTP_TIMEOUT_MS;
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { method: m, signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
    let json = null;
    try { json = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || String(e) };
  } finally {
    clearTimeout(tm);
  }
});

// ── Image cache IPC handler ───────────────────────────────────────────────────
// Returns a stable HTTP URL (`/img-cache/<md5>.<ext>`) served by the local
// renderer dev server, NOT a `data:base64,...` URL. The HTTP URL lets
// Chromium keep the decoded bitmap alive across DOM operations — destroying
// and re-creating the `<img>` element no longer forces a re-decode, which
// is what produced the visible flash on every full rebuild before.
// Returns null when the source URL can't be fetched and isn't already cached.
// Guard for `img:get`. The URLs it fetches are product-image fields read out of
// Firestore — including a friend's custom image URL, which they control. Without
// a check that is a server-side request forgery with readback: the main process
// fetches whatever it is given and hands the body back to the renderer, so an
// internal service answering on loopback becomes readable. Rejecting private,
// loopback and link-local destinations is what actually closes that; the DNS
// lookup matters because a hostname the attacker owns can resolve to 127.0.0.1,
// which a check on the literal host string would miss.
const _PRIVATE_IP = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,   // loopback, RFC1918, link-local
  /^172\.(1[6-9]|2\d|3[01])\./,                       // 172.16–31
  /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // this-network, CGNAT
];
async function _imgUrlIsFetchable(url) {
  if (!isSafeExternalUrl(url)) return false;
  let host;
  try { host = new URL(String(url)).hostname; } catch { return false; }
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return false;
  try {
    const { address } = await require('dns').promises.lookup(host);
    if (address === '::1' || /^f[cd]/i.test(address)) return false;         // IPv6 loopback / ULA
    if (_PRIVATE_IP.some(re => re.test(address))) return false;
  } catch { return false; }                                                 // unresolvable → refuse
  return true;
}

// Fetch an image's bytes, null when it cannot be had. Redirects are followed by
// hand so every hop is validated: letting fetch follow them would re-open the
// hole from the other side — a public URL that 302s to http://127.0.0.1 passes
// the first check and lands internally anyway. Refusing redirects outright would
// be safe too, but silently breaks the CDNs and short links real image URLs use.
async function _fetchImageBuffer(url, timeoutMs = 8000) {
  const ac  = new AbortController();
  const ctl = setTimeout(() => ac.abort(), timeoutMs);   // no timeout = a slow host pins the caller
  try {
    let resp = null, next = String(url);
    for (let hop = 0; hop < 4; hop++) {
      if (!(await _imgUrlIsFetchable(next))) return null;
      resp = await fetch(next, { signal: ac.signal, redirect: 'manual' });
      if (resp.status < 300 || resp.status > 399) break;
      const loc = resp.headers.get('location');
      if (!loc) return null;
      try { next = new URL(loc, next).toString(); } catch { return null; }
      resp = null;                                    // not a final response — keep going
    }
    return resp && resp.ok ? Buffer.from(await resp.arrayBuffer()) : null;
  } finally {
    clearTimeout(ctl);
  }
}

ipcMain.handle('img:get', async (_, url) => {
  if (!url || url === '--') return null;
  const hash     = crypto.createHash('md5').update(url).digest('hex');
  const ext      = (url.match(/\.(jpe?g|png|webp|gif|avif)/i) || [])[1] || 'jpg';
  const filename = `${hash}.${ext}`;
  const file     = path.join(imgCacheDir, filename);
  const httpUrl  = `/img-cache/${filename}`;
  try {
    const buf = await _fetchImageBuffer(url);
    if (buf) {
      fs.writeFileSync(file, buf);
      return httpUrl;
    }
    if (fs.existsSync(file)) return httpUrl;
    return null;
  } catch {
    if (fs.existsSync(file)) return httpUrl;
    return null;
  }
});

// Delete every cached image the renderer's map no longer points at (`keep` is
// its list of `/img-cache/<file>` values). Only names this cache writes
// (md5.ext) are ever touched.
ipcMain.handle('img:prune', async (_, keep) => {
  const keepSet = new Set((Array.isArray(keep) ? keep : []).map(u => String(u).replace(/^\/img-cache\//, '')));
  if (!keepSet.size) return { removed: 0, bytes: 0 };   // an empty map never empties the disk
  let removed = 0, bytes = 0;
  for (const f of fs.readdirSync(imgCacheDir)) {
    if (!/^[a-f0-9]{32}\.[a-z0-9]+$/i.test(f) || keepSet.has(f)) continue;
    try {
      const file = path.join(imgCacheDir, f);
      bytes += fs.statSync(file).size;
      fs.unlinkSync(file);
      removed++;
    } catch {}
  }
  if (removed) log.info(`[img-cache] pruned ${removed} file(s), ${Math.round(bytes / 1e6)} MB`);
  return { removed, bytes };
});

// ── Network — list active LAN /24 subnets for printer scanning. ──────────
// Used by the Snapmaker LAN-scan flow (Add Printer → Scan). Returns a
// deduplicated array of "<a>.<b>.<c>" prefixes, derived from every
// non-internal IPv4 interface that's currently up. The renderer then
// iterates 1..254 on each prefix to probe Moonraker `/printer/info` +
// `/server/info`. Falls back to a small set of common defaults so the
// scan still works on machines where `os.networkInterfaces()` returns
// nothing useful (eg. behind weird VPN setups).
ipcMain.handle('net:get-local-subnets', () => {
  const ifaces = require('os').networkInterfaces();
  const prefixes = new Set();
  for (const list of Object.values(ifaces)) {
    for (const ni of list || []) {
      if (ni.internal) continue;
      if (ni.family !== 'IPv4' && ni.family !== 4) continue;
      const parts = String(ni.address).split('.');
      if (parts.length !== 4) continue;
      const a = +parts[0];
      // Skip loopback, link-local, multicast, broadcast.
      if (a === 0 || a === 127 || a === 169 || a >= 224) continue;
      prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
    }
  }
  return Array.from(prefixes);
});

// ── ARP — the MAC address behind a LAN IP, read from the OS neighbour cache.
// A printer's IP changes with DHCP; its MAC does not, and the OS learns it the
// moment we talk to the printer — whatever the brand, however it was added.
// Only meaningful on a DIRECTLY attached subnet: across a router the cache
// holds the ROUTER's MAC, so an IP outside every local interface's network
// returns null rather than a wrong answer. Never throws.
function _ipToInt(ip) {
  const p = String(ip).split('.').map(Number);
  return p.length === 4 && p.every(n => n >= 0 && n <= 255) ? ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0 : null;
}
function _isOnLocalSubnet(ip) {
  const n = _ipToInt(ip);
  if (n == null) return false;
  for (const list of Object.values(require('os').networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.internal || (ni.family !== 'IPv4' && ni.family !== 4)) continue;
      const a = _ipToInt(ni.address), m = _ipToInt(ni.netmask);
      if (a != null && m != null && ((a & m) >>> 0) === ((n & m) >>> 0)) return true;
    }
  }
  return false;
}
ipcMain.handle('net:arp-mac', async (_e, ip) => {
  if (!_isOnLocalSubnet(ip)) return null;
  const { execFile } = require('child_process');
  const cmd = process.platform === 'win32' ? ['arp', ['-a', ip]]
            : process.platform === 'darwin' ? ['/usr/sbin/arp', ['-n', ip]]
            : ['ip', ['neigh', 'show', ip]];
  const out = await new Promise(res =>
    execFile(cmd[0], cmd[1], { timeout: 2000, windowsHide: true }, (err, stdout) => res(err ? '' : String(stdout || ''))));
  // macOS prints "0:e0:4c:…" (no leading zeros), Windows "00-e0-4c-…".
  const m = out.match(/(?:^|[\s(])((?:[0-9a-f]{1,2}[:-]){5}[0-9a-f]{1,2})(?=[\s)]|$)/im);
  if (!m) return null;
  const mac = m[1].split(/[:-]/).map(h => h.padStart(2, '0')).join(':').toUpperCase();
  return (mac === '00:00:00:00:00:00' || mac === 'FF:FF:FF:FF:FF:FF') ? null : mac;
});

// ── mDNS — browse for `_snapmaker._tcp.local.` (gold-standard discovery).
// Snapmaker firmware advertises this service on every printer (hardcoded in
// u1-moonraker/components/zeroconf.py: ZC_SERVICE_TYPE = "_snapmaker._tcp.local.").
// The TXT record carries everything we need to pre-fill the add form
// without ANY HTTP probe:
//   - ip            (e.g. "192.168.20.118")
//   - machine_type  (e.g. "Snapmaker U1")
//   - device_name   (user nickname, e.g. "U1-showroom")
//   - sn            (serial number)
//   - version       (firmware version)
//   - link_mode     (lan|cloud)
// This is dramatically faster than a port-scan and works across VLANs IF
// the network has an mDNS reflector (Avahi bridge / OPNsense / UniFi
// site-to-site mDNS). Single-VLAN networks (the common case) get
// instant discovery (≤ 2 sec) with zero probes.
ipcMain.handle('mdns:browse-snapmaker', async () => {
  // Lazy require so a failed install doesn't take down the whole app —
  // browse silently returns [] and the renderer falls back to port-scan.
  let Bonjour;
  try { ({ Bonjour } = require('bonjour-service')); }
  catch (e) {
    console.warn('[mdns] bonjour-service not available:', e.message);
    return { ok: false, error: 'bonjour-service not installed', candidates: [] };
  }
  const bj = new Bonjour();
  const seen = new Map(); // dedupe by fqdn (handles re-broadcasts during the browse window)
  // 2.5s is enough for any printer that's announced in the last 60s to
  // reply to our query — bonjour fires the question immediately and
  // collects answers continuously. Snapmakers reply within ~50ms on a
  // healthy LAN.
  const BROWSE_MS = 2500;
  return await new Promise((resolve) => {
    let browser;
    let resolved = false;
    const finish = () => {
      if (resolved) return; resolved = true;
      try { browser?.stop(); } catch {}
      try { bj.destroy(); } catch {}
      resolve({ ok: true, candidates: Array.from(seen.values()) });
    };
    try {
      browser = bj.find({ type: 'snapmaker' }, (svc) => {
        // svc shape (bonjour-service):
        //   { name, host, port, fqdn, addresses: [...], txt: {...} }
        // We keep both `addresses` (the actual A records resolved during
        // the browse — the most reliable IP source) and `txt.ip` (what
        // the firmware itself thinks its IP is — sanity check).
        if (!svc) return;
        const fqdn = svc.fqdn || svc.name;
        if (seen.has(fqdn)) return;
        seen.set(fqdn, {
          name:      svc.name      || null,
          host:      svc.host      || null,
          port:      svc.port      || null,
          fqdn:      svc.fqdn      || null,
          addresses: Array.isArray(svc.addresses) ? svc.addresses : [],
          txt:       svc.txt       || {},
        });
      });
      browser.on?.('error', (err) => {
        console.warn('[mdns] browse error:', err?.message || err);
      });
    } catch (e) {
      console.warn('[mdns] browse setup failed:', e?.message || e);
      finish();
      return;
    }
    setTimeout(finish, BROWSE_MS);
  });
});

// ── App info (used by the diagnostic / error report panel) ─────────────────
// In-app bug report: a screenshot of the window that asked, as a JPEG data URL
// (the renderer hides its report dialog first). Full window, current DPI.
ipcMain.handle('report:capture', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const img = await win.webContents.capturePage();
  return img.isEmpty() ? null : `data:image/jpeg;base64,${img.toJPEG(88).toString('base64')}`;
});

ipcMain.handle('app:info', () => {
  const os = require('os');
  return {
    appVersion:  app.getVersion(),
    electron:    process.versions.electron,
    chrome:      process.versions.chrome,
    node:        process.versions.node,
    platform:    process.platform,
    arch:        process.arch,
    osRelease:   os.release(),
    osVersion:   os.version(),   // human-readable: "macOS 15.4", "Windows 11 Pro", etc.
    systemVersion: process.getSystemVersion(),   // "26.0.1" on macOS, "10.0.26100" on Windows
    analytics:   { ..._analyticsStats },   // this session's Xano chip events (see analytics:tag)
  };
});

// Expose the absolute renderer directory path so the renderer can build
// a file:// preload path for <webview> elements (e.g. Creality camera).
ipcMain.handle('app:renderer-path', () => path.join(__dirname, 'renderer'));

// ── DB IPC handlers ──────────────────────────────────────────────────────────
ipcMain.handle('db:getLookups',              ()           => db.getLookups());
ipcMain.handle('db:getLabel',                (_, cat, id) => db.getLabel(cat, id));
ipcMain.handle('db:getMaterialLabel',        (_, id)      => db.getMaterialLabel(id));
ipcMain.handle('db:getBambuMaterials',       ()           => db.getBambuMaterials());
ipcMain.handle('db:getPublicKeyForId',       (_, id)      => db.getPublicKeyForId(id));
ipcMain.handle('db:getAllLastUpdateTimestamps', ()         => db.getAllLastUpdateTimestamps());
ipcMain.handle('db:isUpdateAvailable',       ()           => db.isUpdateAvailable());
ipcMain.handle('db:updateIfNeeded',          ()           => db.updateIfNeeded());
ipcMain.handle('db:downloadAndSaveLatestData', ()         => db.downloadAndSaveLatestData());

// ── Timelapse download ───────────────────────────────────────────────────────
// Shows a native Save dialog then streams the video from the printer over HTTP.
// Save an image to disk via a native Save dialog. Accepts a `data:` URL (locally
// generated QR — decoded + written directly) or a remote http(s) URL (streamed).
ipcMain.handle('image:download', async (_evt, imageUrl, suggestedFilename) => {
  const https = require('https');
  const defaultName = suggestedFilename || 'qr-code.png';
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save QR code',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  });
  if (canceled || !filePath) return { ok: false, reason: 'cancelled' };
  // Locally-generated QR arrives as a base64 data URL → decode and write directly.
  if (String(imageUrl).startsWith('data:')) {
    try {
      const b64 = String(imageUrl).split(',')[1] || '';
      fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
      return { ok: true, path: filePath };
    } catch (e) { return { ok: false, reason: e?.message || 'error' }; }
  }
  const mod = String(imageUrl).startsWith('http:') ? http : https;
  return new Promise((resolve) => {
    const dest = fs.createWriteStream(filePath);
    const cleanup = (err) => {
      dest.destroy();
      try { fs.unlinkSync(filePath); } catch (_) {}
      resolve({ ok: false, reason: err?.message || 'error' });
    };
    mod.get(imageUrl, { timeout: 20000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return cleanup(new Error(`HTTP ${res.statusCode}`)); }
      res.pipe(dest);
      dest.on('finish', () => { dest.close(); resolve({ ok: true, path: filePath }); });
      dest.on('error', cleanup);
    }).on('error', cleanup).on('timeout', function () { this.destroy(); cleanup(new Error('timeout')); });
  });
});

ipcMain.handle('timelapse:download', async (_evt, videoUrl, suggestedFilename) => {
  const defaultName = suggestedFilename || 'timelapse.mp4';
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Timelapse',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  if (canceled || !filePath) return { ok: false, reason: 'cancelled' };

  return new Promise((resolve) => {
    const dest = fs.createWriteStream(filePath);
    const cleanup = (err) => {
      dest.destroy();
      try { fs.unlinkSync(filePath); } catch (_) {}
      resolve({ ok: false, reason: err?.message || 'error' });
    };
    // URL is: http://<ip>/download?X-Token=<pwd>&file_name=<encoded_path>
    // Pass the full URL string directly — no path manipulation needed.
    http.get(videoUrl, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return cleanup(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(dest);
      dest.on('finish', () => { dest.close(); resolve({ ok: true, path: filePath }); });
      dest.on('error', cleanup);
    }).on('error', cleanup).on('timeout', function() { this.destroy(); cleanup(new Error('timeout')); });
  });
});

// ── Elegoo MQTT bridge ───────────────────────────────────────────────────────
// Each connected printer gets its own mqtt.Client stored in _elegooClients.
// The renderer sends connect/disconnect/publish; this bridge forwards
// incoming messages back via webContents.send.
{
  const mqtt = require('mqtt');
  const _elegooClients = new Map(); // key → { client, webContents }

  ipcMain.on('elegoo:connect', (event, opts) => {
    const { key, host, port, sn, password, clientId, requestId } = opts || {};
    if (!key || !host || !sn) {
      event.sender.send('elegoo:status', key, 'error:missing-params');
      return;
    }
    // Tear down any existing client for this key
    const existing = _elegooClients.get(key);
    if (existing) { try { existing.client.end(true); } catch (_) {} _elegooClients.delete(key); }

    const client = mqtt.connect({
      host, port: port || 1883,
      protocol: 'mqtt',
      username: 'elegoo',
      password: password || '123456',
      clientId: clientId || `TTG_${Math.floor(1000 + Math.random() * 9000)}`,
      keepalive: 60,
      connectTimeout: 8000,
    });
    _elegooClients.set(key, { client, webContents: event.sender, sn, clientId, requestId });

    client.on('connect', () => {
      const topics = [
        `elegoo/${sn}/api_status`,
        `elegoo/${sn}/${clientId}/api_response`,
        `elegoo/${sn}/${clientId}_req/register_response`,
        `elegoo/${sn}/${requestId}/register_response`,
      ];
      client.subscribe(topics, (err) => {
        if (err) { event.sender.send('elegoo:status', key, 'error:subscribe'); return; }
        event.sender.send('elegoo:status', key, 'connected');
        // Send registration
        client.publish(`elegoo/${sn}/api_register`,
          JSON.stringify({ client_id: clientId, request_id: requestId }));
      });
    });

    client.on('message', (topic, payload) => {
      let data;
      try { data = JSON.parse(payload.toString()); }
      catch (_) { data = { _raw: payload.toString() }; }
      if (!event.sender.isDestroyed()) event.sender.send('elegoo:message', key, topic, data);
    });

    client.on('error', (err) => {
      if (!event.sender.isDestroyed()) event.sender.send('elegoo:status', key, `error:${err?.message || err}`);
    });
    client.on('close',   () => { if (!event.sender.isDestroyed()) event.sender.send('elegoo:status', key, 'disconnected'); });
    client.on('offline', () => { if (!event.sender.isDestroyed()) event.sender.send('elegoo:status', key, 'offline'); });
    client.on('reconnect', () => { if (!event.sender.isDestroyed()) event.sender.send('elegoo:status', key, 'connecting'); });
  });

  ipcMain.on('elegoo:disconnect', (_evt, key) => {
    const entry = _elegooClients.get(key);
    if (entry) { try { entry.client.end(true); } catch (_) {} _elegooClients.delete(key); }
  });

  ipcMain.on('elegoo:publish', (_evt, key, topic, payload) => {
    const entry = _elegooClients.get(key);
    if (!entry) return;
    try { entry.client.publish(topic, typeof payload === 'string' ? payload : JSON.stringify(payload)); }
    catch (_) {}
  });
}

// ── ffmpeg detection — shared by the Bambu RTSP camera and the Anycubic FLV
//    camera below. Tries the bundled ffmpeg-static binary first (ships on every
//    OS, so Windows works out of the box), then common system paths.
/* Cuts ffmpeg's `-f image2pipe -vcodec mjpeg` output (JPEGs one after the other)
   into frames: from a start marker (FF D8) to the next end marker (FF D9), the
   LAST start before that end being the frame's. Shared by every camera that reads
   ffmpeg's stdout (Bambu RTSPS, Prusa RTSP, Anycubic FLV).

   It used to walk the buffer byte by byte in JavaScript, from its first byte, on
   EVERY chunk: a frame arriving in several chunks was scanned again from the start
   each time, and a stream that stalled mid-frame (the camera's connection cut
   while a recording stopped) grew the buffer without limit and made each new chunk
   dearer — the main process sat at 100 % until the window stopped answering.
   Now the search is native (Buffer.indexOf), resumes where the last chunk ended,
   and the buffer is capped. */
const _SOI = Buffer.from([0xFF, 0xD8]), _EOI = Buffer.from([0xFF, 0xD9]);
const _JPEG_TRIM = 2 * 1024 * 1024;   // a frame is far smaller: past this, what precedes the last start is junk
const _JPEG_BUF_MAX = 4 * 1024 * 1024;
function _jpegSplitter(onFrame) {
  let buf = Buffer.alloc(0);
  let from = 0;                      // where the end-marker search resumes
  return chunk => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      const e = buf.indexOf(_EOI, from);
      if (e < 0) {
        // No complete frame yet. A normal frame is well under 1 MB; a buffer past
        // _JPEG_TRIM holds a stalled or garbled stream: keep only from its last start.
        if (buf.length > _JPEG_TRIM) {
          const s = buf.lastIndexOf(_SOI);
          buf = s > 0 ? buf.subarray(s) : s < 0 ? Buffer.alloc(0) : buf;
          if (buf.length > _JPEG_BUF_MAX) buf = Buffer.alloc(0);
        }
        from = Math.max(0, buf.length - 1);   // one byte back: a marker may be split across chunks
        return;
      }
      const s = buf.lastIndexOf(_SOI, e);
      if (s >= 0) onFrame(buf.subarray(s, e + 2));
      buf = buf.subarray(e + 2);
      from = 0;
    }
  };
}

/* Live camera streams that main reads itself (Bambu RTSPS), by camera key
   ("bambulab:<id>"). A recording TAPS the stream already open for the picture instead
   of opening a second connection to the camera: the printer allows one, cut the second
   after ~10 s and the picture with it (ffmpeg of the live view then sat at 50 % CPU). */
const _camLive = new Set();   // keys whose ffmpeg is running
const _camTaps = new Map();   // key → Set of (frame) => void, each one a recording

let _ffmpegBin = null;
(function _detectFfmpeg() {
  const candidates = [];
  // Bundled binary (ffmpeg-static). In a packaged app the binary is unpacked
  // beside the asar (build.asarUnpack) — build its REAL on-disk path from
  // resourcesPath. We must NOT use the require('ffmpeg-static') path there: it
  // points inside app.asar, which fs.accessSync may resolve via the asar shim
  // but the OS cannot actually spawn. In dev, require() returns the real path.
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', exe));
  } else {
    try { const s = require('ffmpeg-static'); if (s) candidates.push(s); } catch (_) {}
  }
  candidates.push(
    '/opt/homebrew/bin/ffmpeg',                    // macOS Homebrew (Apple Silicon)
    '/usr/local/bin/ffmpeg',                       // macOS Homebrew (Intel)
    '/usr/bin/ffmpeg',                             // Linux
    'C:\\ffmpeg\\bin\\ffmpeg.exe',                 // Windows (manual install)
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',  // Windows (manual install)
    'ffmpeg',                                      // PATH fallback
  );
  /* ACCESSIBLE IS NOT RUNNABLE. `accessSync(X_OK)` answers "is this file
     executable", never "can THIS cpu execute it" — so on an Intel Mac the
     bundled arm64 binary passed the test, was adopted, and every fallback below
     it (Homebrew's, the one on PATH) was never reached. spawn then failed with
     EBADARCH, errno -86, "bad CPU type in executable".

     So each candidate is asked to run before it is trusted. One short
     synchronous probe at startup, and it also catches the cases an arch check
     would miss: a missing shared library, a quarantined file, a broken
     download. */
  const _runnable = (p) => {
    try {
      const r = require('child_process').spawnSync(p, ['-version'],
        { timeout: 4000, stdio: 'ignore', windowsHide: true });
      return !r.error && r.status === 0;
    } catch (_) { return false; }
  };
  for (const p of candidates) {
    // A bare name ('ffmpeg') is resolved against PATH by spawn, but accessSync
    // resolves it against the CWD — so testing it here would reject the PATH
    // fallback every time. Let the probe answer for it.
    const isBareName = !p.includes('/') && !p.includes('\\');
    if (!isBareName) { try { fs.accessSync(p, fs.constants.X_OK); } catch (_) { continue; } }
    if (!_runnable(p)) { console.warn(`[ffmpeg] ${p} is present but will not run here — skipping`); continue; }
    _ffmpegBin = p; break;
  }
  if (_ffmpegBin) console.log(`[ffmpeg] using ${_ffmpegBin}`);
  else console.warn(`[ffmpeg] NOT FOUND — checked: ${candidates.join(' · ')}`);
})();

// ── Tiger Touch — the screen's picture and its live view ────────────────────
// A Tiger Touch (Panda Touch / K-Touch running the Tiger Touch firmware) serves
// its own screen on the local network behind a six-character code
// (Tiger-Touch docs/LAN-MODE.md): GET /screen.ver?c=CODE is a frame counter,
// GET /screen.bmp?c=CODE the 800×480 picture, POST /api/tap and /api/swipe a
// finger. The firmware serves no page of its own, so Studio draws the live view
// (renderer/IoT/tigertouch/panel.js) and main does the fetching — the renderer
// cannot reach a LAN device across origins, and BMP → PNG/JPEG happens here.
{
  const { nativeImage } = require('electron');
  // Only addresses on the local network (and loopback, for tests) — this is a
  // screen on the user's network, not a door to the Internet.
  const isLocalHost = h => /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || /\.local$/i.test(h);
  const localAddr = a => typeof a === 'string' && /^[\w.\-]+(:\d{1,5})?$/.test(a) && isLocalHost(a.split(':')[0]);

  /** 24- or 32-bit uncompressed BMP (bottom-up or top-down) → PNG buffer. */
  function bmpToPng(buf) {
    if (buf.length < 54 || buf.toString('ascii', 0, 2) !== 'BM') throw new Error('not a BMP');
    const off = buf.readUInt32LE(10), w = buf.readInt32LE(18), hRaw = buf.readInt32LE(22);
    const bpp = buf.readUInt16LE(28), comp = buf.readUInt32LE(30);
    if (![24, 32].includes(bpp) || ![0, 3].includes(comp)) throw new Error(`BMP ${bpp} bpp / compression ${comp} not handled`);
    const h = Math.abs(hRaw), topDown = hRaw < 0, stride = Math.ceil(bpp * w / 32) * 4, px = bpp / 8;
    const out = Buffer.alloc(w * h * 4);   // BGRA, what nativeImage takes
    for (let y = 0; y < h; y++) {
      const row = off + (topDown ? y : h - 1 - y) * stride;
      for (let x = 0; x < w; x++) {
        const s = row + x * px, d = (y * w + x) * 4;
        out[d] = buf[s]; out[d + 1] = buf[s + 1]; out[d + 2] = buf[s + 2]; out[d + 3] = 255;
      }
    }
    return { img: nativeImage.createFromBitmap(out, { width: w, height: h }), width: w, height: h };
  }

  const validCode = c => /^[A-Za-z0-9]{4,12}$/.test(String(c || ''));
  /** One request to the screen, with its error mapped to what the UI says. */
  async function screenFetch(ip, pathAndQuery, { method = 'GET', timeout = 10000 } = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(`http://${ip}${pathAndQuery}`, { method, signal: ctl.signal, cache: 'no-store' });
      if (res.status === 403) return { ok: false, error: 'code' };
      if (res.status === 429) return { ok: false, error: 'locked' };
      if (!res.ok) return { ok: false, error: `http ${res.status}` };
      return { ok: true, res };
    } catch (e) {
      return { ok: false, error: e?.name === 'AbortError' || e?.cause?.code ? 'unreachable' : (e?.message || 'error') };
    } finally { clearTimeout(timer); }
  }

  ipcMain.handle('tigertouch:screenshot', async (_e, { ip, code } = {}) => {
    if (!localAddr(ip)) return { ok: false, error: 'address' };
    if (!validCode(code)) return { ok: false, error: 'code' };
    const r = await screenFetch(ip, `/screen.bmp?c=${encodeURIComponent(code)}`);
    if (!r.ok) return r;
    try {
      const { img, width, height } = bmpToPng(Buffer.from(await r.res.arrayBuffer()));
      return { ok: true, dataUrl: `data:image/png;base64,${img.toPNG().toString('base64')}`, width, height };
    } catch (e) { return { ok: false, error: e?.message || 'error' }; }
  });

  // Live view and touches for a firmware from before rle565 (no CORS, BMP only):
  // the renderer talks to a current firmware directly (IoT/tigertouch/screen.js)
  // and falls back here. The counter first, the 1.1 MB picture only when it moved.
  ipcMain.handle('tigertouch:frame', async (_e, { ip, code, since } = {}) => {
    if (!localAddr(ip)) return { ok: false, error: 'address' };
    if (!validCode(code)) return { ok: false, error: 'code' };
    const q = `c=${encodeURIComponent(code)}`;
    const v = await screenFetch(ip, `/screen.ver?${q}`, { timeout: 4000 });
    if (!v.ok) return v;
    const ver = (await v.res.text()).trim();
    if (since != null && ver === String(since)) return { ok: true, ver, same: true };
    const b = await screenFetch(ip, `/screen.bmp?${q}`);
    if (!b.ok) return b;
    try {
      const { img } = bmpToPng(Buffer.from(await b.res.arrayBuffer()));
      return { ok: true, ver, dataUrl: `data:image/jpeg;base64,${img.toJPEG(85).toString('base64')}` };
    } catch (e) { return { ok: false, error: e?.message || 'error' }; }
  });

  // A finger on the screen: a tap, or a swipe over `ms` (the firmware clamps it).
  ipcMain.handle('tigertouch:touch', async (_e, { ip, code, x, y, x2, y2, ms } = {}) => {
    if (!localAddr(ip)) return { ok: false, error: 'address' };
    if (!validCode(code)) return { ok: false, error: 'code' };
    const n = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
    const q = `c=${encodeURIComponent(code)}`;
    const path = x2 == null
      ? `/api/tap?${q}&x=${n(x, 799)}&y=${n(y, 479)}`
      : `/api/swipe?${q}&x1=${n(x, 799)}&y1=${n(y, 479)}&x2=${n(x2, 799)}&y2=${n(y2, 479)}&ms=${Math.max(60, Math.min(2000, Math.round(Number(ms) || 200)))}`;
    const r = await screenFetch(ip, path, { method: 'POST', timeout: 4000 });
    return r.ok ? { ok: true } : r;
  });

  // ── TigerScale V3 — one picture of its screen (for a report) ──────────────
  // Its live view (Tiger-Scale-V3 docs/TELEMETRY.md § LAN live view) is a raw
  // stream at `{lan_url}/stream?c=CODE` (lan_url = "http://<ip>:81"; the code is
  // case-sensitive, sent as stored): [u8 kind][payload] messages — 1 HELLO
  // (u16 w, h, bandCols), 2 FRAME_BEGIN, 5 BAND (u8 index, u16 len, rle565),
  // 4 FRAME_END, 3 PING. A new viewer gets every band in its first frame, so
  // one FRAME_END after a FRAME_BEGIN is the whole screen: read it, hang up —
  // the scale serves two viewers at most. A screen asleep is black: one tap in
  // the middle wakes it (a press on a dark screen is swallowed, it opens
  // nothing), then ~1.5 s before reading.
  // Within a band, memory runs down a column and columns run right to left.
  ipcMain.handle('tigerscale:screenshot', async (_e, { url, code, wake } = {}) => {
    let u; try { u = new URL(String(url)); } catch { return { ok: false, error: 'address' }; }
    if (u.protocol !== 'http:' || !localAddr(u.host)) return { ok: false, error: 'address' };
    if (!/^[A-Za-z0-9]{6}$/.test(String(code || ''))) return { ok: false, error: 'code' };
    const q = `c=${encodeURIComponent(code)}`;
    if (wake) {
      const r = await screenFetch(u.host, `/tap?${q}&x=240&y=160`, { method: 'POST', timeout: 4000 });
      if (!r.ok) return r;
      await new Promise(res => setTimeout(res, 1500));
    }
    return readScaleFrame(u.hostname, Number(u.port) || 80, q);
  });
  const readScaleFrame = (host, port, q) => new Promise(resolve => {
    const http = require('http');
    let done = false, req = null;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); try { req?.destroy(); } catch (_) {} resolve(r); };
    const timer = setTimeout(() => finish({ ok: false, error: 'unreachable' }), 10000);
    req = http.get({ host, port, path: `/stream?${q}`, agent: false }, res => {
      if (res.statusCode === 403) return finish({ ok: false, error: 'code' });
      if (res.statusCode !== 200) return finish({ ok: false, error: `http ${res.statusCode}` });
      let W = 480, H = 320, BC = 16, out = null, begun = false, buf = Buffer.alloc(0);
      const alloc = () => { out = Buffer.alloc(W * H * 4); for (let i = 3; i < out.length; i += 4) out[i] = 255; };
      const band = (idx, rle) => {
        // pixel i of band `idx` → column (idx*BC + BC-1 - floor(i/H)), row i % H
        let p = 0, i = 0;
        const put = v => {
          const r = Math.floor(i / H), y = i % H, x = idx * BC + (BC - 1 - r);
          i++;
          if (x >= W) return;
          const o = (y * W + x) * 4;   // BGRA for nativeImage
          out[o + 2] = Math.round(((v >> 11) & 31) * 255 / 31);
          out[o + 1] = Math.round(((v >> 5) & 63) * 255 / 63);
          out[o]     = Math.round((v & 31) * 255 / 31);
        };
        while (p < rle.length) {
          const t = rle[p++];
          if (t < 0x80) { for (let k = 0; k <= t; k++, p += 2) put(rle[p] | (rle[p + 1] << 8)); }
          else {
            let n;
            if (t < 0xFF) n = t - 0x80 + 2; else { n = rle[p] | (rle[p + 1] << 8); p += 2; }
            const v = rle[p] | (rle[p + 1] << 8); p += 2;
            for (let k = 0; k < n; k++) put(v);
          }
        }
      };
      alloc();
      res.on('data', chunk => {
        buf = Buffer.concat([buf, chunk]);
        for (;;) {
          if (!buf.length) break;
          const k = buf[0];
          if (k === 3) { buf = buf.subarray(1); continue; }
          if (k === 1) { if (buf.length < 7) break; W = buf.readUInt16LE(1); H = buf.readUInt16LE(3); BC = buf.readUInt16LE(5); alloc(); buf = buf.subarray(7); continue; }
          if (k === 2) { begun = true; buf = buf.subarray(1); continue; }
          if (k === 5) {
            if (buf.length < 4) break;
            const l = buf.readUInt16LE(2);
            if (buf.length < 4 + l) break;
            band(buf[1], buf.subarray(4, 4 + l)); buf = buf.subarray(4 + l); continue;
          }
          if (k === 4) {
            buf = buf.subarray(1);
            if (!begun) continue;
            const png = nativeImage.createFromBitmap(out, { width: W, height: H }).toPNG();
            return finish({ ok: true, dataUrl: `data:image/png;base64,${png.toString('base64')}`, width: W, height: H });
          }
          return finish({ ok: false, error: 'stream' });   // out of step
        }
      });
      res.on('end', () => finish({ ok: false, error: 'unreachable' }));
    });
    req.on('error', () => finish({ ok: false, error: 'unreachable' }));
  });

  // ── TigerSpool — one picture of its screen (for a report) ─────────────────
  // `GET /screen.bmp`, no code: the panel as is, 240×320 24-bit BMP (~225 KB).
  ipcMain.handle('tigerspool:screenshot', async (_e, { ip } = {}) => {
    if (!localAddr(ip)) return { ok: false, error: 'address' };
    const r = await screenFetch(ip, '/screen.bmp');
    if (!r.ok) return r;
    try {
      const { img, width, height } = bmpToPng(Buffer.from(await r.res.arrayBuffer()));
      return { ok: true, dataUrl: `data:image/png;base64,${img.toPNG().toString('base64')}`, width, height };
    } catch (e) { return { ok: false, error: e?.message || 'error' }; }
  });

  ipcMain.handle('tigertouch:save-png', async (_e, dataUrl, suggestedName) => {
    if (!String(dataUrl || '').startsWith('data:image/png;base64,')) return { ok: false, reason: 'data' };
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Tiger Touch',
      defaultPath: path.join(app.getPath('downloads'), String(suggestedName || 'tiger-touch.png').replace(/[\\/:*?"<>|]/g, '-')),
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    });
    if (canceled || !filePath) return { ok: false, reason: 'cancelled' };
    try { fs.writeFileSync(filePath, Buffer.from(String(dataUrl).split(',')[1], 'base64')); return { ok: true, path: filePath }; }
    catch (e) { return { ok: false, reason: e?.message || 'error' }; }
  });
}

// ── Camera captures — photos and videos, filed per printer ──────────────────
// Pictures/Tiger Studio/<brand>_<hardware id>/YYYYMMDD-HHMMSS.<ext>, the hardware
// id being the printer's MAC, else its serial, else its record id — so a
// printer keeps its history whatever its IP or name becomes. printer.json in
// each folder records who it is and every name / IP / model it has had.
// Videos are taken from the SOURCE whenever the camera allows it:
//   url    — ffmpeg reads the camera itself and copies its stream untouched
//            (rtsp/rtsps H.264 → .mp4, http MJPEG → .mov)
//   tap    — the exception: the MJPEG frames main already decodes for the picture
//            (Bambu RTSPS) are copied into a .mov as they go, i.e. what is displayed,
//            not the camera's H.264. A camera allows ONE connection: a second one for
//            the recording was cut by the printer and disturbed the picture
//   frames — original JPEG frames pushed one by one, muxed untouched at their
//            real timing (.mov, MJPEG)
//   blob   — a recording made in the renderer from a MediaStream (WebRTC / FLV)
{
  const { shell } = require('electron');
  const { spawn } = require('child_process');
  // Pictures/Tiger Studio/Captures/<printer>/{Photos,Videos}/
  const capRoot = () => path.join(app.getPath('pictures'), 'Tiger Studio', 'Captures');
  const sub = (dir, kind) => { const d = path.join(dir, kind); fs.mkdirSync(d, { recursive: true }); return d; };
  const safe = v => String(v || '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  /** The printer's folder (created) + its printer.json kept up to date. */
  function capDir(pr = {}, { capture = true } = {}) {
    // A placeholder MAC (all zeros / all FF, sent by some firmwares) names nothing.
    if (pr.mac && /^(0{1,2}[:-]?){5}0{1,2}$|^(ff[:-]?){5}ff$/i.test(String(pr.mac))) pr.mac = null;
    const hw = pr.mac ? safe(String(pr.mac).toUpperCase().replace(/:/g, '-')) : pr.serial ? safe(pr.serial) : `id-${safe(pr.id)}`;
    const dir = path.join(capRoot(), `${safe(pr.brand) || 'printer'}_${hw || 'unknown'}`);
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'printer.json');
    let info = {};
    try { info = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) {}
    const seen = (list, v) => (v && !(list || []).includes(v) ? [...(list || []), v] : (list || []));
    info = { brand: pr.brand || info.brand, mac: pr.mac || info.mac || null, serial: pr.serial || info.serial || null, id: pr.id || info.id,
      name: pr.name || info.name, model: pr.model || info.model,
      names: seen(info.names, pr.name), ips: seen(info.ips, pr.ip), models: seen(info.models, pr.model),
      lastCaptureAt: capture ? new Date().toISOString() : (info.lastCaptureAt || null) };
    fs.writeFileSync(f, JSON.stringify(info, null, 2));
    return dir;
  }
  const okUrl = u => { try { const x = new URL(u); return /^(rtsps?|https?):$/.test(x.protocol) && /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.local$/i.test(x.hostname); } catch { return false; } };
  const recs = new Map();   // id → { proc?, dir, file, frames? }

  ipcMain.handle('cam:save-image', (_e, { printer, dataUrl } = {}) => {
    const m = /^data:image\/(png|jpeg);base64,/.exec(String(dataUrl || ''));
    if (!m) return { ok: false, error: 'data' };
    const dir = capDir(printer);
    const file = path.join(sub(dir, 'Photos'), `${stamp()}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`);
    fs.writeFileSync(file, Buffer.from(dataUrl.slice(m[0].length), 'base64'));
    return { ok: true, file, dir };
  });

  // url: ffmpeg copies the camera's own stream.
  ipcMain.handle('cam:rec-url-start', (_e, { id, printer, url } = {}) => {
    if (!_ffmpegBin) return { ok: false, error: 'ffmpeg' };
    if (!okUrl(url) || recs.has(id)) return { ok: false, error: 'url' };
    const rtsp = /^rtsps?:/.test(url);
    const dir = capDir(printer), file = path.join(sub(dir, 'Videos'), `${stamp()}.${rtsp ? 'mp4' : 'mov'}`);
    const args = rtsp
      ? ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-i', url, '-map', '0:v', '-c', 'copy', '-movflags', '+faststart', '-y', file]
      : ['-hide_banner', '-loglevel', 'error', '-use_wallclock_as_timestamps', '1', '-f', 'mjpeg', '-i', url, '-c', 'copy', '-y', file];
    const proc = spawn(_ffmpegBin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', d => { err += d; });
    proc.on('error', () => {});
    recs.set(id, { proc, dir, file, err: () => err });
    return { ok: true };
  });

  // tap: the live stream main already reads for the picture (Bambu RTSPS). Its frames are
  // piped into ffmpeg, which copies them into a .mov; no second connection to the camera.
  ipcMain.handle('cam:rec-tap-start', (_e, { id, printer, key } = {}) => {
    if (!_ffmpegBin) return { ok: false, error: 'ffmpeg' };
    if (recs.has(id)) return { ok: false, error: 'busy' };
    if (!_camLive.has(key)) return { ok: false, error: 'nostream' };
    const dir = capDir(printer), file = path.join(sub(dir, 'Videos'), `${stamp()}.mov`);
    let proc;
    try {
      proc = spawn(_ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-use_wallclock_as_timestamps', '1', '-f', 'mjpeg', '-i', 'pipe:0', '-c', 'copy', '-y', file],
        { stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (_) { return { ok: false, error: 'ffmpeg' }; }
    let err = '';
    proc.stderr.on('data', d => { err += d; });
    proc.on('error', () => {});
    proc.stdin.on('error', () => {});
    // A slow disk drops pictures rather than filling the memory.
    const tap = frame => { if (proc.stdin.writableLength < 8 * 1024 * 1024) proc.stdin.write(frame); };
    const taps = _camTaps.get(key) || new Set();
    taps.add(tap);
    _camTaps.set(key, taps);
    const untap = () => { taps.delete(tap); if (!taps.size && _camTaps.get(key) === taps) _camTaps.delete(key); };
    proc.on('close', untap);
    recs.set(id, { proc, dir, file, err: () => err, tap: true, untap });
    return { ok: true };
  });

  // frames: original JPEGs, written as they come, muxed at their real timing.
  ipcMain.handle('cam:rec-frames-start', (_e, { id, printer } = {}) => {
    if (recs.has(id)) return { ok: false, error: 'busy' };
    const dir = capDir(printer), tmp = fs.mkdtempSync(path.join(app.getPath('temp'), 'tt-rec-'));
    recs.set(id, { dir, tmp, frames: [], file: path.join(sub(dir, 'Videos'), `${stamp()}.mov`) });
    return { ok: true };
  });
  ipcMain.handle('cam:rec-frame', (_e, { id, t, data } = {}) => {
    const r = recs.get(id);
    if (!r?.frames || !data) return false;
    const f = path.join(r.tmp, `f${String(r.frames.length).padStart(6, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(data));
    r.frames.push([f, t]);
    return true;
  });

  // poll: a camera that only serves refreshed stills (Snapmaker U1 stock
  // firmware, monitor.jpg) — read here as fast as it refreshes, each new frame
  // kept untouched with its real time (what the page shows is slower).
  // `everyMs` (optional): a camera whose still is LIVE (Paxx) would otherwise be read in a
  // tight loop; the stock U1 refreshes at ~1 fps and needs none.
  ipcMain.handle('cam:rec-poll-start', (_e, { id, printer, url, everyMs } = {}) => {
    const pace = Number.isFinite(everyMs) ? Math.min(Math.max(everyMs, 0), 2000) : 0;
    if (!okUrl(url) || !/^https?:/.test(url) || recs.has(id)) return { ok: false, error: 'url' };
    const dir = capDir(printer), tmp = fs.mkdtempSync(path.join(app.getPath('temp'), 'tt-rec-'));
    const r = { dir, tmp, frames: [], file: path.join(sub(dir, 'Videos'), `${stamp()}.mov`), polling: true };
    recs.set(id, r);
    const t0 = Date.now();
    let last = '';
    (async () => {
      while (r.polling) {
        try {
          const ctl = new AbortController(); const k = setTimeout(() => ctl.abort(), 4000);
          const buf = Buffer.from(await (await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { signal: ctl.signal })).arrayBuffer());
          clearTimeout(k);
          const h = require('crypto').createHash('md5').update(buf).digest('hex');
          if (h !== last && buf.length > 1000) {
            last = h;
            const f = path.join(tmp, `f${String(r.frames.length).padStart(6, '0')}.jpg`);
            fs.writeFileSync(f, buf);
            r.frames.push([f, (Date.now() - t0) / 1000]);
          }
          if (pace) await new Promise(res => setTimeout(res, pace));
        } catch (_) { await new Promise(res => setTimeout(res, 200)); }
      }
    })();
    return { ok: true };
  });

  // A camera's own still / stream read HERE, not in the page: a fetch from the page
  // is cross-origin and most cameras send no CORS header (Paxx's nginx does not),
  // so it failed — the photo never came and the stream was never found, which is
  // what left the video on the slow still fall-back.
  ipcMain.handle('cam:fetch-still', async (_e, { url } = {}) => {
    if (!okUrl(url) || !/^https?:/.test(url)) return { ok: false };
    const ctl = new AbortController(); const k = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) return { ok: false };
      const buf = Buffer.from(await res.arrayBuffer());
      const type = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
      return buf.length > 100 ? { ok: true, dataUrl: `data:${type};base64,${buf.toString('base64')}` } : { ok: false };
    } catch (_) { return { ok: false }; }
    finally { clearTimeout(k); }
  });
  ipcMain.handle('cam:probe-stream', async (_e, { url } = {}) => {
    if (!okUrl(url) || !/^https?:/.test(url)) return false;
    const ctl = new AbortController(); const k = setTimeout(() => ctl.abort(), 4000);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      return res.ok && /multipart|mjpe?g|image\/jpeg/i.test(res.headers.get('content-type') || '');
    } catch (_) { return false; }
    finally { clearTimeout(k); ctl.abort(); }
  });

  // blob: a MediaRecorder file from the renderer.
  ipcMain.handle('cam:save-recording', (_e, { printer, data, ext } = {}) => {
    if (!data || !/^(mp4|webm)$/.test(ext)) return { ok: false, error: 'data' };
    const dir = capDir(printer), file = path.join(sub(dir, 'Videos'), `${stamp()}.${ext}`);
    fs.writeFileSync(file, Buffer.from(data));
    return { ok: true, file, dir };
  });

  ipcMain.handle('cam:rec-stop', async (_e, { id } = {}) => {
    const r = recs.get(id);
    if (!r) return { ok: false, error: 'none' };
    recs.delete(id);
    if (r.polling) { r.polling = false; await new Promise(res => setTimeout(res, 300)); }
    if (r.proc) {
      // A tap's stdin carries the pictures: closing it ends the file; for the others 'q' asks ffmpeg to finish.
      // Unhooked first, so no picture is written after the end.
      try { if (r.tap) { r.untap(); r.proc.stdin.end(); } else r.proc.stdin.write('q'); } catch (_) {}
      await new Promise(res => { const k = setTimeout(() => { try { r.proc.kill('SIGINT'); } catch (_) {} res(); }, 6000); r.proc.on('close', () => { clearTimeout(k); res(); }); });
      const ok = fs.existsSync(r.file) && fs.statSync(r.file).size > 1000;
      if (!ok) { try { fs.unlinkSync(r.file); } catch (_) {} return { ok: false, error: (r.err() || 'empty').slice(0, 200) }; }
      return { ok: true, file: r.file, dir: r.dir };
    }
    // frames → concat list with each frame's real duration → MJPEG copied into .mov
    if (!r.frames.length) { fs.rmSync(r.tmp, { recursive: true, force: true }); return { ok: false, error: 'empty' }; }
    const end = r.frames.at(-1)[1] + 0.2;
    const lines = [];
    r.frames.forEach(([f, t], i) => { lines.push(`file '${f.replace(/'/g, "'\\''")}'`); lines.push(`duration ${Math.max(0.01, (r.frames[i + 1]?.[1] ?? end) - t).toFixed(3)}`); });
    lines.push(`file '${r.frames.at(-1)[0].replace(/'/g, "'\\''")}'`);
    const list = path.join(r.tmp, 'list.txt');
    fs.writeFileSync(list, lines.join('\n'));
    const run = args => new Promise(res => { const p = spawn(_ffmpegBin, args, { stdio: 'ignore' }); p.on('close', c => res(c)); p.on('error', () => res(-1)); });
    let code = await run(['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-y', r.file]);
    if (code !== 0) code = await run(['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-y', r.file.replace(/\.mov$/, '.mp4')]);
    fs.rmSync(r.tmp, { recursive: true, force: true });
    const file = fs.existsSync(r.file) ? r.file : r.file.replace(/\.mov$/, '.mp4');
    return code === 0 && fs.existsSync(file) ? { ok: true, file, dir: r.dir, frames: r.frames.length } : { ok: false, error: 'mux' };
  });

  // The printer's own captures folder, opened in the file manager.
  ipcMain.handle('cam:open-folder', async (_e, { printer } = {}) => {
    if (!printer) return false;
    return (await shell.openPath(capDir(printer, { capture: false }))) === '';
  });
  ipcMain.handle('cam:show', (_e, { file } = {}) => {
    const root = capRoot();
    if (typeof file !== 'string' || !path.resolve(file).startsWith(root)) return false;
    shell.showItemInFolder(file);
    return true;
  });
  app.on('will-quit', () => { for (const r of recs.values()) { try { r.proc?.kill('SIGINT'); } catch (_) {} } });
}

// ── Demo mode — the printer simulator (docs/DEMO-MODE.md) ───────────────────
// Answers each brand's protocol on local addresses for the account's demo
// printers, so the drivers connect to them exactly as to real ones. Idle until
// the renderer syncs a demo record; stopped with the app.
{
  const demo = require('./services/demo').register({ ipcMain, ffmpegPath: _ffmpegBin, log: m => log.info(m) });
  app.on('will-quit', () => { demo.stopAll(); });
}

// ── Bambu Lab MQTT (TLS mqtts port 8883) + JPEG-TCP camera (port 6000)
//    + RTSP camera (X1C / X1E / P2S / H2x — port 322) via ffmpeg
{
  const mqtt  = require('mqtt');
  const tls   = require('tls');
  const { spawn } = require('child_process');

  const _bambuClients    = new Map(); // key → { client, wc }
  const _bambuCamSockets = new Map(); // key → net.Socket
  /* One generation number per camera key, bumped by every start and stop. A retry
     waits on a timer while no socket/process is alive, so a stop (or a newer
     start) could not reach it — it then woke up and ran a SECOND loop beside the
     new one, and the two kept kicking each other off a printer that serves one
     camera client. A loop whose generation is stale now simply ends. */
  const _bambuCamGen = new Map();   // key → number (JPEG + RTSP share it)
  const _bambuCamNextGen = key => { const g = (_bambuCamGen.get(key) || 0) + 1; _bambuCamGen.set(key, g); return g; };

  // ── MQTT ──────────────────────────────────────────────────────────────
  ipcMain.on('bambulab:connect', (event, { key, ip, serial, password }) => {
    if (!key || !ip || !serial || !password) {
      event.sender.send('bambulab:status', key, 'error:missing-params');
      return;
    }
    const existing = _bambuClients.get(key);
    if (existing) { try { existing.client.end(true); } catch (_) {} _bambuClients.delete(key); }

    const client = mqtt.connect({
      host: ip, port: 8883,
      protocol: 'mqtts',
      rejectUnauthorized: false,
      username: 'bblp',
      password,
      clientId: `studio_${Date.now()}`,
      keepalive: 20,
      clean: true,
      connectTimeout: 10000,
    });
    _bambuClients.set(key, { client, wc: event.sender, serial });

    client.on('connect', () => {
      if (event.sender.isDestroyed()) return;
      client.subscribe(`device/${serial}/report`, { qos: 1 });
      event.sender.send('bambulab:status', key, 'connected');
    });
    client.on('message', (topic, payload) => {
      if (event.sender.isDestroyed()) return;
      try { event.sender.send('bambulab:message', key, topic, JSON.parse(payload.toString())); }
      catch (_) {}
    });
    client.on('error',    (err) => { if (!event.sender.isDestroyed()) event.sender.send('bambulab:status', key, `error:${err?.message || err}`); });
    client.on('close',    ()    => { if (!event.sender.isDestroyed()) event.sender.send('bambulab:status', key, 'disconnected'); });
    client.on('offline',  ()    => { if (!event.sender.isDestroyed()) event.sender.send('bambulab:status', key, 'offline'); });
    client.on('reconnect',()    => { if (!event.sender.isDestroyed()) event.sender.send('bambulab:status', key, 'connecting'); });
  });

  ipcMain.on('bambulab:disconnect', (_evt, key) => {
    const e = _bambuClients.get(key);
    if (e) { try { e.client.end(true); } catch (_) {} _bambuClients.delete(key); }
  });

  ipcMain.on('bambulab:publish', (_evt, key, payload) => {
    const e = _bambuClients.get(key);
    if (!e) return;
    try { e.client.publish(`device/${e.serial}/request`, JSON.stringify(payload), { qos: 1 }); }
    catch (_) {}
  });

  // ── JPEG TCP camera (A1 / A1 Mini / P1P / P1S — port 6000) ──────────
  function _bambuCamAuthPacket(password) {
    const buf = Buffer.alloc(80, 0);
    buf.writeUInt32LE(0x40, 0);
    buf.writeUInt32LE(0x3000, 4);
    Buffer.from('bblp', 'utf8').copy(buf, 16);
    Buffer.from(password, 'utf8').slice(0, 32).copy(buf, 48);
    return buf;
  }

  ipcMain.on('bambulab:cam-start', (event, { key, ip, password }) => {
    // Mark the previous socket as an intentional stop so its close handler
    // doesn't fire a retry while we open a fresh one for the same key.
    const prev = _bambuCamSockets.get(key);
    if (prev) { prev._stopped = true; try { prev.destroy(); } catch (_) {} _bambuCamSockets.delete(key); }
    const gen = _bambuCamNextGen(key);

    let restarts = 0;
    const MAX_RESTARTS = 10;

    const launch = () => {
      if (event.sender.isDestroyed() || _bambuCamGen.get(key) !== gen) return;

      // Explicit 10 s connect timeout: a filtered/closed port 6000 would
      // otherwise hang on the OS TCP timeout (30–75 s) with the loading
      // spinner spinning the whole time and no way for the user to know.
      const sock = tls.connect({ host: ip, port: 6000, rejectUnauthorized: false, timeout: 10000 }, () => {
        sock.write(_bambuCamAuthPacket(password));
      });
      sock._stopped = false;
      _bambuCamSockets.set(key, sock);

      sock.on('timeout', () => { try { sock.destroy(); } catch (_) {} }); // → 'close' → retry

      let buf = Buffer.alloc(0);
      sock.on('data', chunk => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 16) {
          const payloadSize = buf.readUInt32LE(0);
          if (payloadSize <= 0 || payloadSize > 8 * 1024 * 1024) { buf = Buffer.alloc(0); break; }
          if (buf.length < 16 + payloadSize) break;
          const payload = buf.slice(16, 16 + payloadSize);
          buf = buf.slice(16 + payloadSize);
          if (payload[0] === 0xFF && payload[1] === 0xD8 &&
              payload[payload.length - 2] === 0xFF && payload[payload.length - 1] === 0xD9) {
            restarts = 0; // healthy stream — reset the backoff counter
            // Send the raw JPEG Buffer (no Base64): skips a synchronous encode
            // on the main thread, ~25% smaller IPC payload, and the renderer
            // wraps it directly in a Blob URL (no re-decode).
            if (!event.sender.isDestroyed())
              event.sender.send('bambulab:cam-frame', key, payload);
            // Forward to detached cam window if open
            if (_camWindow && !_camWindow.isDestroyed())
              _camWindow.webContents.send('bambulab:cam-frame', key, payload);
          }
        }
      });

      // Retry with exponential backoff — mirrors the RTSP path. A transient
      // blip (printer reboot, Wi-Fi drop, slow start) otherwise left the camera
      // black forever until the user reopened the sidecard. 'error' is swallowed
      // (a 'close' always follows it); the retry lives on 'close' and is skipped
      // when the stop was intentional (cam-stop, or a newer cam-start for this key).
      sock.on('error', () => {});
      sock.on('close', () => {
        if (_bambuCamSockets.get(key) === sock) _bambuCamSockets.delete(key);
        if (sock._stopped || _bambuCamGen.get(key) !== gen) return;
        if (restarts < MAX_RESTARTS) {
          restarts++;
          const delay = Math.min(1500 * restarts, 12000); // 1.5 s → 12 s backoff
          console.log(`[bambu-cam:${key}] closed, retry ${restarts}/${MAX_RESTARTS} in ${delay} ms`);
          setTimeout(launch, delay);
        } else {
          console.warn(`[bambu-cam:${key}] gave up after ${MAX_RESTARTS} restarts`);
        }
      });
    };

    launch();
  });

  ipcMain.on('bambulab:cam-stop', (_evt, key) => {
    _bambuCamNextGen(key);   // cancels a retry waiting on its timer
    const s = _bambuCamSockets.get(key);
    if (s) { s._stopped = true; try { s.destroy(); } catch (_) {} _bambuCamSockets.delete(key); }
  });

  // ── RTSP camera (X1C / X1E / P2S / H2x — port 322 TLS) ─────────────
  // ffmpeg pulls the rtsps:// stream and outputs MJPEG frames to stdout.
  // Frames are parsed (SOI=FF D8 … EOI=FF D9) and sent via the same
  // 'bambulab:cam-frame' IPC channel as the JPEG TCP camera above.
  const _bambuRtspProcs = new Map(); // key → ChildProcess
  // A child is not killed with its parent on Windows: a live ffmpeg.exe outlives
  // the app, keeps its file under app.asar.unpacked locked, and the updater's
  // installer then cannot replace it. Stop every stream before quitting.
  app.on('will-quit', () => {
    for (const p of _bambuRtspProcs.values()) { p._stopped = true; try { p.kill(); } catch (_) {} }
    _bambuRtspProcs.clear();
  });

  ipcMain.on('bambulab:cam-start-rtsp', (event, { key, ip, password }) => {
    // Kill any existing process for this key (mark as intentionally stopped)
    const prev = _bambuRtspProcs.get(key);
    if (prev) { prev._stopped = true; try { prev.kill('SIGTERM'); } catch (_) {} _bambuRtspProcs.delete(key); _camLive.delete(key); }
    const gen = _bambuCamNextGen(key);

    if (!_ffmpegBin) {
      console.warn('[bambu-rtsp] ffmpeg not found — RTSP camera disabled');
      return;
    }

    let restarts = 0;
    const MAX_RESTARTS = 10;

    const launch = () => {
      if (event.sender.isDestroyed() || _bambuCamGen.get(key) !== gen) return;

      // Never URL-encode the access code — Bambu codes are alphanumeric hex.
      // encodeURIComponent can corrupt them when ffmpeg parses the URL.
      const rtspUrl = `rtsps://bblp:${password}@${ip}:322/streaming/live/1`;
      console.log(`[bambu-rtsp:${key}] launching ffmpeg → rtsps://bblp:***@${ip}:322 (bin: ${_ffmpegBin})`);

      /* GUARDED, because spawn can throw SYNCHRONOUSLY. The `proc.on('error')`
         handler below only catches failures reported as an event; a bad CPU
         type, a vanished binary or a permission refusal throws right here, on
         the assignment — before that handler exists. Unguarded, it reached the
         main process as an uncaught exception and Electron put a crash dialog in
         front of the user, for a camera that simply could not start. */
      let proc;
      try {
      proc = spawn(_ffmpegBin, [
        '-loglevel', 'error',          // show errors in main-process console
        '-rtsp_transport', 'tcp',
        // Low-latency input: by default ffmpeg buffers/probes the stream for
        // several seconds before emitting the first frame, which is what makes
        // the live view lag behind reality. Disable buffering, drop the probe
        // window to the minimum and start decoding immediately.
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-probesize', '32',
        '-analyzeduration', '0',
        /* Pictures are dated by the moment they ARRIVE, not by the printer's RTP clock.
           Measured on Windows with a P2S (never seen on macOS, an X1C there is fine): after a recording, the `fps=30` below began to write 110 MB/s
           (a normal stream is 2-4) at 45-50 % of the processor, minutes on end, filling
           the main process with duplicates — `fps` repeats frames to fill a jump forward
           in the stream's timestamps, so one jump in the camera's clock became thousands
           of copies. Dated on arrival, a gap can never be longer than the real stall. */
        '-use_wallclock_as_timestamps', '1',
        // No -tls_verify: the rtsp demuxer in older ffmpeg (e.g. the bundled
        // ffmpeg-static 6.0) doesn't expose it → "Option tls_verify not found".
        // The tls protocol defaults to verify=0 anyway, so the printer's
        // self-signed cert is accepted without it (works on ffmpeg 6.0 and 8.x).
        '-i', rtspUrl,
        '-vf', 'fps=30',               // smooth live view (parity with Bambu Studio)
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-qscale:v', '3',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] }); // pipe stderr for logging
      } catch (err) {
        /* The camera is unavailable — that is all. The window is told so it can
           show its own fallback, and the app carries on: a printer whose video
           will not start is not a reason to interrupt the person using it. */
        console.error(`[bambu-rtsp:${key}] cannot start ffmpeg (${_ffmpegBin}):`, err?.message || err);
        return;   // the window keeps its own placeholder; nothing else is disturbed
      }

      proc._stopped = false;
      _bambuRtspProcs.set(key, proc);
      _camLive.add(key);

      // Forward ffmpeg errors to the main-process console so we can debug.
      proc.stderr.on('data', chunk => {
        const msg = chunk.toString().trim();
        if (msg) console.error(`[bambu-rtsp:${key}]`, msg);
      });

      // Parse raw stdout for JPEG frames: SOI (FF D8) → EOI (FF D9).
      // ffmpeg -f image2pipe -vcodec mjpeg outputs raw JPEG files concatenated.
      proc.stdout.on('data', _jpegSplitter(frame => {
        _camTaps.get(key)?.forEach(tap => tap(frame));   // the recordings of this camera
        if (!event.sender.isDestroyed())
          event.sender.send('bambulab:cam-frame', key, frame);
        // Forward to detached cam window if open
        if (_camWindow && !_camWindow.isDestroyed())
          _camWindow.webContents.send('bambulab:cam-frame', key, frame);
      }));

      proc.on('close', (code) => {
        if (_bambuRtspProcs.get(key) === proc) { _bambuRtspProcs.delete(key); _camLive.delete(key); }
        if (proc._stopped || _bambuCamGen.get(key) !== gen) return; // intentional stop — do not restart
        if (restarts < MAX_RESTARTS) {
          restarts++;
          const delay = Math.min(1500 * restarts, 12000); // 1.5 s → 12 s backoff
          console.log(`[bambu-rtsp:${key}] exited (code=${code}), retry ${restarts}/${MAX_RESTARTS} in ${delay} ms`);
          setTimeout(launch, delay);
        } else {
          console.warn(`[bambu-rtsp:${key}] gave up after ${MAX_RESTARTS} restarts`);
        }
      });

      proc.on('error', (err) => {
        console.error(`[bambu-rtsp:${key}] spawn error:`, err.message);
        if (_bambuRtspProcs.get(key) === proc) { _bambuRtspProcs.delete(key); _camLive.delete(key); }
      });
    };

    launch();
  });

  ipcMain.on('bambulab:cam-stop-rtsp', (_evt, key) => {
    _bambuCamNextGen(key);   // cancels a retry waiting on its timer
    const p = _bambuRtspProcs.get(key);
    if (p) { p._stopped = true; try { p.kill('SIGTERM'); } catch (_) {} _bambuRtspProcs.delete(key); }
    _camLive.delete(key);
  });

  // ── Prusa Buddy3D camera — plain RTSP on the camera's OWN address ──────────
  // `rtsp://<camera-ip>/live` once "RTSP stream on local network" is switched
  // on in the Prusa app / Prusa Connect. No credentials, no TLS. Same ffmpeg
  // → MJPEG-pipe pipeline as the Bambu stream above, on its own channel.
  const _prusaRtspProcs = new Map();
  app.on('will-quit', () => {
    for (const p of _prusaRtspProcs.values()) { p._stopped = true; try { p.kill(); } catch (_) {} }
    _prusaRtspProcs.clear();
  });
  ipcMain.on('prusa:cam-start-rtsp', (event, { key, host }) => {
    const prev = _prusaRtspProcs.get(key);
    if (prev) { prev._stopped = true; try { prev.kill('SIGTERM'); } catch (_) {} _prusaRtspProcs.delete(key); }
    if (!_ffmpegBin || !host || !/^[\w.\-]+(:\d{1,5})?$/.test(String(host))) return;
    let restarts = 0;
    const MAX_RESTARTS = 10;
    const launch = () => {
      if (event.sender.isDestroyed()) return;
      const rtspUrl = `rtsp://${host}/live`;
      let proc;
      try {
        proc = spawn(_ffmpegBin, [
          '-loglevel', 'error', '-rtsp_transport', 'tcp',
          '-fflags', 'nobuffer', '-flags', 'low_delay', '-probesize', '32', '-analyzeduration', '0',
          '-i', rtspUrl, '-vf', 'fps=15', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-qscale:v', '4', 'pipe:1',
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        console.error(`[prusa-rtsp:${key}] cannot start ffmpeg:`, err?.message || err);
        return;
      }
      proc._stopped = false;
      _prusaRtspProcs.set(key, proc);
      proc.stderr.on('data', chunk => { const msg = chunk.toString().trim(); if (msg) console.error(`[prusa-rtsp:${key}]`, msg); });
      proc.stdout.on('data', _jpegSplitter(frame => {
        if (!event.sender.isDestroyed()) event.sender.send('prusa:cam-frame', key, frame);
        if (_camWindow && !_camWindow.isDestroyed()) _camWindow.webContents.send('prusa:cam-frame', key, frame);
      }));
      proc.on('close', (code) => {
        if (_prusaRtspProcs.get(key) === proc) _prusaRtspProcs.delete(key);
        if (proc._stopped) return;
        if (restarts < MAX_RESTARTS) {
          restarts++;
          setTimeout(launch, Math.min(1500 * restarts, 12000));
        } else {
          console.warn(`[prusa-rtsp:${key}] gave up after ${MAX_RESTARTS} restarts (last code ${code})`);
        }
      });
      proc.on('error', (err) => {
        console.error(`[prusa-rtsp:${key}] spawn error:`, err.message);
        if (_prusaRtspProcs.get(key) === proc) _prusaRtspProcs.delete(key);
      });
    };
    launch();
  });
  ipcMain.on('prusa:cam-stop-rtsp', (_evt, key) => {
    const p = _prusaRtspProcs.get(key);
    if (p) { p._stopped = true; try { p.kill('SIGTERM'); } catch (_) {} _prusaRtspProcs.delete(key); }
  });

  // ── External IP cameras (renderer/ext-cam) — NOT printers ───────────────────
  // Any RTSP(S) or MJPEG/HTTP stream is read by ffmpeg and cut into JPEG frames,
  // same pipeline as the Prusa camera above (MJPEG too: a fetch from the page is
  // blocked by CORS on most cameras).
  // The address is checked here (rtsp/rtsps/http/https only, ffmpeg gets an
  // argument array, never a shell) and the login is put into the URL here so it
  // never travels anywhere else. ffmpeg's messages echo the URL: they are
  // masked before they reach the log, and the URL itself is never logged.
  const _extCamProcs = new Map();
  app.on('will-quit', () => {
    for (const p of _extCamProcs.values()) { p._stopped = true; try { p.kill(); } catch (_) {} }
    _extCamProcs.clear();
  });
  const _extCamUrl = (url, username, password) => {
    try {
      const u = new URL(String(url || '').trim());
      if (!/^(rtsp|rtsps|http|https):$/.test(u.protocol) || !u.hostname) return null;
      if (username) { u.username = String(username); u.password = String(password || ''); }
      return u.toString();
    } catch (_) { return null; }
  };
  // RTSP describes its streams in the SDP, so — like the Bambu and Prusa readers —
  // ffmpeg is told not to probe: probing waits for ~0.5 s of video before the
  // first picture. A plain HTTP stream has no such description and still needs it.
  // -flush_packets 1 hands each JPEG to the pipe as it is finished instead of
  // when the next one starts filling the buffer.
  // RTSP over TCP delivers the pictures in bursts (a lost packet holds up everything
  // behind it): measured on a Tapo C110, gaps up to 585 ms against 142 ms over UDP.
  // So a plain rtsp:// stream starts on UDP and falls back to TCP if nothing arrives.
  // -protocol_whitelist: ffmpeg follows what a stream answers (redirects, HLS
  // playlists…); a user-typed address must never let it open a local file or
  // another protocol — only the transports these cameras actually use.
  const _extCamArgs = (url, tail, transport = 'tcp') => [
    '-loglevel', 'error',
    '-protocol_whitelist', /^rtsps?:/i.test(url) ? 'rtsp,rtsps,rtp,srtp,udp,tcp,tls' : 'http,https,tcp,tls,crypto',
    ...(/^rtsps?:/i.test(url)
      // max_delay / reorder_queue_size 0: no RTP jitter buffer (ffmpeg's default holds ~0.5 s
      // of UDP packets back to put them in order — a LAN camera does not need it).
      ? ['-rtsp_transport', transport, '-probesize', '32', '-analyzeduration', '0', '-max_delay', '0', '-reorder_queue_size', '0']
      : ['-probesize', '500000', '-analyzeduration', '500000']),
    '-fflags', 'nobuffer', '-flags', 'low_delay',
    '-i', url, '-an', ...tail, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-qscale:v', '4', '-flush_packets', '1', 'pipe:1',
  ];
  const _extCamMask = s => String(s).replace(/\/\/[^/@\s]*@/g, '//***@');
  // A page reload keeps the same webContents (not destroyed), so its readers
  // would go on decoding for nobody: kill this page's readers when it reloads.
  const _extCamHooked = new WeakSet();
  const _extCamHookSender = sender => {
    if (_extCamHooked.has(sender)) return;
    _extCamHooked.add(sender);
    sender.on('did-start-loading', () => {
      for (const [k, p] of _extCamProcs) {
        if (p._sender !== sender) continue;
        p._stopped = true; try { p.kill('SIGTERM'); } catch (_) {}
        _extCamProcs.delete(k);
      }
    });
  };
  ipcMain.on('extcam:start', (event, { key, url, username, password }) => {
    _extCamHookSender(event.sender);
    const prev = _extCamProcs.get(key);
    if (prev) { prev._stopped = true; try { prev.kill('SIGTERM'); } catch (_) {} _extCamProcs.delete(key); }
    const full = _extCamUrl(url, username, password);
    if (!_ffmpegBin || !full || typeof key !== 'string') { if (!event.sender.isDestroyed()) event.sender.send('extcam:status', key, 'error'); return; }
    let restarts = 0, gotFrame = false;
    let transport = /^rtsp:/i.test(full) ? 'udp' : 'tcp';
    const MAX_RESTARTS = 10;
    const launch = () => {
      if (event.sender.isDestroyed()) return;
      let proc;
      try { proc = spawn(_ffmpegBin, _extCamArgs(full, ['-vf', "fps=10,scale='min(1280,iw)':-2"], transport), { stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (err) { console.error(`[ext-cam:${key}] cannot start ffmpeg:`, err?.message || err); return; }
      proc._stopped = false;
      proc._sender = event.sender;
      _extCamProcs.set(key, proc);
      if (transport === 'udp') {
        // UDP can be silently blocked (firewall, VPN): no picture in 6 s → TCP.
        proc._udpTimer = setTimeout(() => {
          if (gotFrame || proc._stopped || _extCamProcs.get(key) !== proc) return;
          proc._stopped = true; try { proc.kill('SIGTERM'); } catch (_) {}
          transport = 'tcp';
          launch();
        }, 6000);
      }
      proc.stderr.on('data', chunk => {
        const msg = _extCamMask(chunk.toString().trim());
        if (msg) console.error(`[ext-cam:${key}]`, msg);
        if (/401 Unauthorized|403 Forbidden/i.test(msg)) proc._refused = true;
      });
      proc.stdout.on('data', _jpegSplitter(frame => {
        if (event.sender.isDestroyed()) return;
        proc._hadFrame = true;
        if (!gotFrame) { gotFrame = true; restarts = 0; clearTimeout(proc._udpTimer); event.sender.send('extcam:status', key, 'live'); }
        event.sender.send('extcam:frame', key, frame);
      }));
      proc.on('close', code => {
        clearTimeout(proc._udpTimer);
        if (_extCamProcs.get(key) === proc) _extCamProcs.delete(key);
        if (proc._stopped || event.sender.isDestroyed()) return;
        gotFrame = false;
        if (!proc._refused) event.sender.send('extcam:status', key, 'error');   // offline now; the retries go on
        // A refused login is never retried: cameras lock an address out after a few
        // wrong attempts, and trying again with the same login can only make it worse.
        if (proc._refused) { event.sender.send('extcam:status', key, 'error'); return; }
        // UDP that ended before its first picture (blocked, or ffmpeg gave up before
        // the 6 s timer) → the next try goes over TCP, instead of ten more on UDP.
        if (transport === 'udp' && !proc._hadFrame) transport = 'tcp';
        if (restarts < MAX_RESTARTS) { restarts++; setTimeout(launch, Math.min(1500 * restarts, 12000)); }
        else { console.warn(`[ext-cam:${key}] gave up after ${MAX_RESTARTS} restarts (last code ${code})`); event.sender.send('extcam:status', key, 'error'); }
      });
      proc.on('error', err => {
        console.error(`[ext-cam:${key}] spawn error:`, err.message);
        if (_extCamProcs.get(key) === proc) _extCamProcs.delete(key);
      });
    };
    launch();
  });
  ipcMain.on('extcam:stop', (_evt, key) => {
    const p = _extCamProcs.get(key);
    if (p) { p._stopped = true; try { p.kill('SIGTERM'); } catch (_) {} _extCamProcs.delete(key); }
  });
  // One frame, to tell the user whether the address and login work BEFORE the
  // camera is saved. Answers with a short code the renderer turns into words.
  ipcMain.handle('extcam:test', (_evt, { url, username, password }) => new Promise(resolve => {
    const full = _extCamUrl(url, username, password);
    if (!full) return resolve({ ok: false, code: 'badUrl' });
    if (!_ffmpegBin) return resolve({ ok: false, code: 'noFfmpeg' });
    let proc, out = Buffer.alloc(0), err = '', done = false;
    const finish = r => { if (done) return; done = true; clearTimeout(timer); try { proc?.kill('SIGKILL'); } catch (_) {} resolve(r); };
    const timer = setTimeout(() => finish({ ok: false, code: 'timeout' }), 12000);
    try { proc = spawn(_ffmpegBin, _extCamArgs(full, ['-frames:v', '1']), { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (_) { return finish({ ok: false, code: 'noFfmpeg' }); }
    proc.stdout.on('data', c => { if (out.length < 8 * 1024 * 1024) out = Buffer.concat([out, c]); });
    proc.stderr.on('data', c => { if (err.length < 4000) err += c.toString(); });
    proc.on('error', () => finish({ ok: false, code: 'noFfmpeg' }));
    proc.on('close', () => {
      if (out.length > 2 && out.indexOf(_SOI) >= 0 && out.indexOf(_EOI) > 0) return finish({ ok: true });
      const e = err.toLowerCase();
      finish({ ok: false, code: /401|unauthori|403|forbidden|authorization/.test(e) ? 'auth'
        : /404|not found/.test(e) ? 'notFound'
        : /refused|timed out|no route|unreachable|could not resolve|name or service|network is/.test(e) ? 'unreachable'
        : 'noImage' });
    });
  }));
}

// ── Bambu Lab CLOUD — REST (api.bambulab.com) + ONE shared cloud MQTT client ──
//    Protocol notes: docs/bambu_connect_cloud.md.
//
//    The cloud broker delivers the VERY SAME `print.push_status` the LAN broker
//    does, so cloud messages are emitted on the SAME `bambulab:message` channel
//    as LAN ones and the renderer's parser, cards, job block and controls are
//    reused untouched. Only two things differ: the broker is per-ACCOUNT, so
//    there is one client for every printer rather than one each, and the
//    credential is an account access token instead of a per-printer LAN code.
//
//    REST goes through ELECTRON'S `net` — not node's `https`, not global fetch —
//    and that is not a detail. api.bambulab.com sits behind Cloudflare, which
//    reads the TLS fingerprint of whoever calls: plain HTTP clients are answered
//    with a 403 challenge page, which is why the reference Python implementation
//    reaches for `cloudscraper` / `curl_cffi` impersonation. Electron's `net` IS
//    Chromium's network stack, so the fingerprint is a real browser's and no
//    impersonation is needed.
{
  const bblNet = require('electron').net;
  const mqtt   = require('mqtt');   // required per block, as the other brands do

  /* Two platforms, not one. A mainland-China account lives on a SEPARATE Bambu
     platform — every host is the `.cn` twin of the `.com` one (api, TFA, MQTT),
     and its accounts sign in with a PHONE NUMBER, the code arriving by SMS.
     Nothing is shared between the two: a Global token means nothing on `.cn`.
     So the region is chosen at sign-in and every later call carries it.
     Hosts as in the maintained Home Assistant integration (pybambu). */
  const _bblUrls = (region) => {
    const tld = region === 'cn' ? 'cn' : 'com';
    const api = `https://api.bambulab.${tld}`;
    return {
      login:      `${api}/v1/user-service/user/login`,
      emailCode:  `${api}/v1/user-service/user/sendemail/code`,
      // China only — the phone-number platform. Note the host: the web domain,
      // under /api, not the api. subdomain.
      smsCode:    'https://bambulab.cn/api/v1/user-service/user/sendsmscode',
      tfaLogin:   `https://bambulab.${tld}/api/sign-in/tfa`,
      bind:       `${api}/v1/iot-service/api/user/bind`,
      // NOT /v1/user-service/my/preference — that one 404s with a NON-JSON body.
      preference: `${api}/v1/design-user-service/my/preference`,
      version:    `${api}/v1/iot-service/api/user/device/version`,
      // The account's print history; each entry carries the plate image URL.
      tasks:      `${api}/v1/user-service/my/tasks`,
    };
  };

  /* The slicer's own network-agent headers: Bambu's edge treats a client that
     looks like one of theirs far better than an anonymous one, and these are
     what the maintained Python implementation sends. */
  const _bblOsType = process.platform === 'win32' ? 'windows'
                   : process.platform === 'darwin' ? 'macos' : 'linux';
  const _bblHeaders = () => ({
    'User-Agent': 'bambu_network_agent/01.09.05.01',
    'X-BBL-Client-Name': 'OrcaSlicer',
    'X-BBL-Client-Type': 'slicer',
    'X-BBL-Client-Version': '01.09.05.51',
    'X-BBL-Language': 'en-US',
    'X-BBL-OS-Type': _bblOsType,
    'X-BBL-Agent-Version': '01.09.05.01',
    'X-BBL-Executable-info': '{}',
    'X-BBL-Agent-OS-Type': _bblOsType,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  });

  /* Every REST answer is parsed TOLERANTLY. Bambu's failures are frequently not
     JSON at all — a 404 returns prose, a Cloudflare block returns HTML — and a
     naive JSON.parse turns a handled error into a crash. */
  function _bblFetch(url, { method = 'GET', body = null, token = null } = {}) {
    return new Promise((resolve) => {
      let req;
      try {
        req = bblNet.request({ method, url, useSessionCookies: false });
      } catch (err) {
        resolve({ ok: false, status: 0, json: null, text: '', error: String(err?.message || err) });
        return;
      }
      const headers = _bblHeaders();
      if (token) headers.Authorization = `Bearer ${token}`;
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);

      req.on('response', (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch (_) { /* not JSON — expected on errors */ }
          const status = res.statusCode;
          const setCookie = res.headers['set-cookie'] || [];
          const cookies = {};
          for (const line of [].concat(setCookie)) {
            const m = /^([^=]+)=([^;]*)/.exec(String(line).trim());
            if (m) cookies[m[1]] = m[2];
          }
          /* Cloudflare answers 403/429 with an HTML challenge. Naming it is what
             lets the UI say "try again shortly" instead of "wrong password". */
          const blocked = (status === 403 || status === 429) && /cloudflare/i.test(text);
          resolve({ ok: status >= 200 && status < 300, status, json, text, cookies, blocked });
        });
      });
      req.on('error', (err) => {
        resolve({ ok: false, status: 0, json: null, text: '', error: String(err?.message || err) });
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  /* Ask Bambu to email a login code. This is the ONLY way in for an account
     linked to Google SSO — there is no password to offer. The code is single-use
     and short-lived, and each new request invalidates the previous one, so it is
     asked for once and used straight away. */
  ipcMain.handle('bambulab:cloud-send-code', async (_evt, { email, phone, region } = {}) => {
    if (!email && !phone) return { ok: false, error: 'missing-account' };
    /* A phone number only exists on the China platform, so it always goes there,
       whatever region the caller thought it was in. */
    const r = phone
      ? await _bblFetch(_bblUrls('cn').smsCode, {
          method: 'POST', body: { phone, type: 'codeLogin' },
        })
      : await _bblFetch(_bblUrls(region).emailCode, {
          method: 'POST', body: { email, type: 'codeLogin' },
        });
    if (r.blocked) return { ok: false, error: 'cloudflare' };
    return r.ok ? { ok: true } : { ok: false, error: r.json?.message || `http-${r.status}` };
  });

  /* Log in, by code or by password. Bambu answers in one of three shapes and
     only the first is a success: a token outright, or a demand for an emailed
     code, or a demand for a second factor (which is completed elsewhere, against
     a DIFFERENT host, and hands the token back in a COOKIE rather than a body). */
  ipcMain.handle('bambulab:cloud-login', async (_evt, { account, code, password, region } = {}) => {
    // `account` is the email, or on the China platform the phone number.
    if (!account || (!code && !password)) return { ok: false, error: 'missing-credentials' };
    const body = code ? { account, code }
                      : { account, password, apiError: '' };
    const r = await _bblFetch(_bblUrls(region).login, { method: 'POST', body });
    if (r.blocked) return { ok: false, error: 'cloudflare' };

    /* A rejected CODE comes back as a 400 that distinguishes expired from wrong.
       Telling those apart is the difference between "ask for a new one" and
       "type it again", so they are not flattened into one failure. */
    if (r.status === 400) {
      const c = r.json?.code;
      if (c === 1) return { ok: false, error: 'code-expired' };
      if (c === 2) return { ok: false, error: 'code-incorrect' };
      return { ok: false, error: r.json?.message || 'login-refused' };
    }
    if (!r.ok) return { ok: false, error: r.json?.message || `http-${r.status}` };

    const token = r.json?.accessToken || '';
    if (token) return { ok: true, token, expiresIn: r.json?.expiresIn || 0 };

    const loginType = r.json?.loginType || null;
    if (loginType === 'verifyCode') return { ok: false, need: 'code' };
    if (loginType === 'tfa')        return { ok: false, need: 'tfa', tfaKey: r.json?.tfaKey || '' };
    return { ok: false, error: 'login-not-understood' };
  });

  /* Second factor. Note the different host, and that the token arrives as a
     COOKIE — reading it from the body returns nothing at all. */
  ipcMain.handle('bambulab:cloud-tfa', async (_evt, { tfaKey, code, region } = {}) => {
    if (!tfaKey || !code) return { ok: false, error: 'missing-credentials' };
    const r = await _bblFetch(_bblUrls(region).tfaLogin, {
      method: 'POST', body: { tfaKey, tfaCode: code },
    });
    if (r.blocked) return { ok: false, error: 'cloudflare' };
    const token = r.cookies?.token || '';
    if (!token) return { ok: false, error: r.ok ? 'tfa-no-token' : `http-${r.status}` };
    return { ok: true, token };
  });

  /* The MQTT username is `u_<uid>`, and the uid has to be ASKED FOR: the access
     token is no longer a JWT (it is an opaque `AQC…` string), so nothing can be
     read out of it. A JWT is still accepted, for the day Bambu changes back. */
  ipcMain.handle('bambulab:cloud-uid', async (_evt, { token, region } = {}) => {
    if (!token) return { ok: false, error: 'missing-token' };
    const parts = String(token).split('.');
    if (parts.length === 3) {
      try {
        const claims = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (claims?.username) return { ok: true, mqttUsername: claims.username, uid: claims.username.replace(/^u_/, '') };
      } catch (_) { /* not a JWT after all — ask the API */ }
    }
    const r = await _bblFetch(_bblUrls(region).preference, { token });
    if (r.blocked) return { ok: false, error: 'cloudflare' };
    const uid = r.json?.uid;
    if (!uid) return { ok: false, error: r.ok ? 'uid-missing' : `http-${r.status}` };
    return { ok: true, uid: String(uid), mqttUsername: `u_${uid}` };
  });

  /* Every printer bound to the account — AND its LAN access code, which the
     cloud simply hands over. That is what makes the setup effortless: the camera
     and any local connection are derivable from the login, with nothing for the
     user to find on the machine's screen and type in. */
  ipcMain.handle('bambulab:cloud-bind', async (_evt, { token, region } = {}) => {
    if (!token) return { ok: false, error: 'missing-token' };
    const r = await _bblFetch(_bblUrls(region).bind, { token });
    if (r.blocked) return { ok: false, error: 'cloudflare' };
    if (!r.ok) return { ok: false, error: r.json?.message || `http-${r.status}` };
    const devices = (r.json?.devices || []).map(d => ({
      devId:        d.dev_id,
      name:         d.name || '',
      online:       !!d.online,
      model:        d.dev_product_name || '',
      modelCode:    d.dev_model_name || '',
      structure:    d.dev_structure || '',
      nozzle:       d.nozzle_diameter || null,
      accessCode:   d.dev_access_code || '',
      printStatus:  d.print_status || '',
    }));
    return { ok: true, devices };
  });

  /* The account's recent print tasks. Each carries `cover` — a plain HTTPS URL
     to the plate image on Bambu's CDN, needing no auth of its own — which is the
     only way to show what is on the bed when you are not on the printer's
     network: the local route is FTPS, and FTPS does not leave the house.

     Endpoint and shape taken from the maintained Home Assistant integration
     (pybambu), not guessed: `hits[]`, each with `deviceId`, `title`, `cover` and
     `startTime`. The list is the ACCOUNT's, roughly 20 recent entries out of
     hundreds, so the caller must pick its own machine's current one. */
  ipcMain.handle('bambulab:cloud-tasks', async (_evt, { token, region } = {}) => {
    if (!token) return { ok: false, error: 'missing-token' };
    const r = await _bblFetch(_bblUrls(region).tasks, { token });
    if (r.blocked) return { ok: false, error: 'cloudflare' };
    if (!r.ok) return { ok: false, error: r.json?.message || `http-${r.status}` };
    return { ok: true, hits: Array.isArray(r.json?.hits) ? r.json.hits : [] };
  });

  /* The plate image, brought back as a data-URI rather than a URL.
     The FTPS route always returned bytes, so the renderer's preview field held
     something instant and self-contained. Handing it a remote URL instead made
     every DOM rebuild re-request the image from Bambu's CDN, and the picture
     blinked out for as long as that took — the media-reload trap the surgical
     update rules warn about. Fetched once per URL and kept, so both routes
     deliver the same thing and the card can be redrawn as often as it likes. */
  const _bblCoverCache = new Map();          // url → data URI
  ipcMain.handle('bambulab:cloud-cover', async (_evt, { url } = {}) => {
    if (!url || !/^https:\/\//i.test(url)) return { ok: false, error: 'bad-url' };
    const hit = _bblCoverCache.get(url);
    if (hit) return { ok: true, dataUri: hit };
    return new Promise((resolve) => {
      let req;
      try { req = bblNet.request({ method: 'GET', url }); }
      catch (err) { resolve({ ok: false, error: String(err?.message || err) }); return; }
      req.on('response', (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume(); resolve({ ok: false, error: `http-${res.statusCode}` }); return;
        }
        const type = String(res.headers['content-type'] || 'image/png').split(';')[0].trim();
        const chunks = [];
        let bytes = 0;
        res.on('data', (c) => {
          bytes += c.length;
          /* A cover is a small render. Anything this large is not one, and it is
             not worth holding in memory to find out. */
          if (bytes > 4 * 1024 * 1024) { try { req.abort(); } catch (_) {} return; }
          chunks.push(c);
        });
        res.on('end', () => {
          if (!chunks.length) { resolve({ ok: false, error: 'empty' }); return; }
          const dataUri = `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`;
          if (_bblCoverCache.size > 64) _bblCoverCache.clear();   // a board, not an album
          _bblCoverCache.set(url, dataUri);
          resolve({ ok: true, dataUri });
        });
      });
      req.on('error', (err) => resolve({ ok: false, error: String(err?.message || err) }));
      req.end();
    });
  });

  ipcMain.handle('bambulab:cloud-device-version', async (_evt, { token, devId, region } = {}) => {
    if (!token || !devId) return { ok: false, error: 'missing-params' };
    const r = await _bblFetch(`${_bblUrls(region).version}?dev_id=${encodeURIComponent(devId)}`, { token });
    if (!r.ok) return { ok: false, error: `http-${r.status}` };
    return { ok: true, devices: r.json?.devices || [] };
  });

  // ── Shared cloud MQTT ──────────────────────────────────────────────────────
  //    ONE client for the whole account, not one per printer: the broker is the
  //    user's, and every machine is a topic on it. Subscriptions are kept in a
  //    map so a reconnect can restore them — mqtt.js reconnects on its own, and
  //    a silent reconnection that forgot its topics is a board that quietly
  //    stops updating.
  let _bblCloudClient = null;                 // the live client, or null
  let _bblCloudWc     = null;                 // the window to report to
  const _bblCloudSubs = new Map();            // devId → key

  function _bblCloudSend(channel, ...args) {
    if (_bblCloudWc && !_bblCloudWc.isDestroyed()) _bblCloudWc.send(channel, ...args);
  }

  /* A full state is asked for on every (re)connection. The X1 repeats its whole
     object on each message, but the P1 sends only what CHANGED — so without this
     first full push there is nothing to apply the deltas to. It is sent once per
     connection and never on a timer: asking a P1 repeatedly makes it lag. */
  function _bblCloudPushAll(devId) {
    try {
      _bblCloudClient?.publish(`device/${devId}/request`, JSON.stringify({
        pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 },
      }), { qos: 1 });
    } catch (_) {}
  }

  function _bblCloudOpen(uid, token, region, event) {
    const host = `${region}.mqtt.bambulab.com`;
    const client = mqtt.connect({
      host, port: 8883,
      protocol: 'mqtts',
      rejectUnauthorized: false,
      username: `u_${uid}`,
      password: token,
      /* Unique per device on purpose: the same account may be connected from the
         phone and from another machine, and a shared client id makes the broker
         kick the previous connection. */
      clientId: `studio_${uid}_${Date.now().toString(36)}`,
      keepalive: 30,
      clean: true,
      connectTimeout: 15000,
      reconnectPeriod: 5000,
    });
    _bblCloudClient = client;
    _bblCloudWc = event.sender;

    client.on('connect', () => {
      _bblCloudSend('bambulab:cloud-status', 'connected', region);
      for (const devId of _bblCloudSubs.keys()) {
        try { client.subscribe(`device/${devId}/report`, { qos: 0 }); } catch (_) {}
        _bblCloudPushAll(devId);
      }
    });

    client.on('message', (topic, payload) => {
      const devId = /^device\/([^/]+)\/report$/.exec(topic)?.[1];
      const key = devId && _bblCloudSubs.get(devId);
      if (!key) return;
      try {
        /* Emitted on the LAN channel deliberately: same payload, same parser. */
        _bblCloudSend('bambulab:message', key, topic, JSON.parse(payload.toString()));
      } catch (_) {}
    });

    client.on('error', (err) => {
      const msg = String(err?.message || err);
      /* A broker that refuses the credentials on one region usually accepts them
         on the other: the account is pinned to a region and there is no way to
         ask which one beforehand. So the refusal is not an error yet — it is the
         signal to try the other side, once, and report which one worked so it
         can be remembered. */
      const notAuthorized = /not authorized|Connection refused/i.test(msg);
      /* Not for China: `cn` is a separate platform with a single broker, so a
         refusal there is a real one — the Global brokers would not know the
         account either. */
      if (notAuthorized && region === 'us') {
        try { client.end(true); } catch (_) {}
        _bblCloudClient = null;
        _bblCloudSend('bambulab:cloud-status', 'switching-region', 'eu');
        _bblCloudOpen(uid, token, 'eu', event);
        return;
      }
      _bblCloudSend('bambulab:cloud-status', `error:${msg}`, region);
    });
    client.on('close',   () => _bblCloudSend('bambulab:cloud-status', 'disconnected', region));
    client.on('offline', () => _bblCloudSend('bambulab:cloud-status', 'offline', region));
  }

  ipcMain.on('bambulab:cloud-connect', (event, { uid, token, region } = {}) => {
    if (!uid || !token) { event.sender.send('bambulab:cloud-status', 'error:missing-params', ''); return; }
    if (_bblCloudClient) {
      /* Already up — but the window asking may be a NEW one (the renderer
         reloads; this process does not). Re-point the sender, or telemetry would
         keep being posted to a page that no longer exists. */
      _bblCloudWc = event.sender;
      return;                                 // idempotent: one client per account
    }
    /* Guarded: this runs in the MAIN process, where an uncaught exception is a
       crash dialog in front of the user. A broker that will not open is a
       printer that stays offline — never a reason to take the app down. */
    try {
      _bblCloudOpen(uid, token, ['eu', 'cn'].includes(region) ? region : 'us', event);
    } catch (err) {
      console.error('[bambu-cloud] cannot open the cloud broker:', err?.message || err);
      _bblCloudClient = null;
      if (!event.sender.isDestroyed()) {
        event.sender.send('bambulab:cloud-status', `error:${err?.message || err}`, region || '');
      }
    }
  });

  ipcMain.on('bambulab:cloud-subscribe', (_evt, { key, devId } = {}) => {
    if (!key || !devId) return;
    _bblCloudSubs.set(devId, key);
    if (!_bblCloudClient?.connected) return;  // the connect handler will catch up
    try { _bblCloudClient.subscribe(`device/${devId}/report`, { qos: 0 }); } catch (_) {}
    _bblCloudPushAll(devId);
  });

  ipcMain.on('bambulab:cloud-unsubscribe', (_evt, { devId } = {}) => {
    if (!devId) return;
    _bblCloudSubs.delete(devId);
    try { _bblCloudClient?.unsubscribe(`device/${devId}/report`); } catch (_) {}
  });

  ipcMain.on('bambulab:cloud-publish', (_evt, { devId, payload } = {}) => {
    if (!devId || !payload) return;
    try { _bblCloudClient?.publish(`device/${devId}/request`, JSON.stringify(payload), { qos: 1 }); }
    catch (_) {}
  });

  ipcMain.on('bambulab:cloud-disconnect', () => {
    if (_bblCloudClient) { try { _bblCloudClient.end(true); } catch (_) {} }
    _bblCloudClient = null;
    _bblCloudSubs.clear();
  });
}

// ── Anycubic LAN — MQTT TLS (port 9883) + slicer-config provisioning
//    Protocol notes: renderer/printers/anycubic/PROTOCOL.md.
//    The printer's local broker uses a self-signed cert and requests an
//    OPTIONAL client certificate; TLS 1.3 stacks fail that handshake when no
//    cert is supplied, so the connection is pinned to TLS 1.2. Credentials are
//    durable, cloud-issued per pairing, and read from AnycubicSlicerNext's
//    on-disk config (keyless obfuscation, decoded below) — the slicer never
//    needs to run for day-to-day communication.
{
  const mqtt   = require('mqtt');
  const net    = require('net');
  const crypto = require('crypto');

  const _acuClients = new Map(); // key → { client, wc, modelId, deviceId }

  // Command topics are per-endpoint (multiColorBox, print, …); reports all
  // arrive under the printer's public prefix — subscribe to the whole subtree
  // so print/tempature/fan/status/lastWill telemetry streams in alongside the
  // multiColorBox reports (family taxonomy: PROTOCOL.md §5b).
  const _acuCmdTopic     = (m, d, endpoint) => `anycubic/anycubicCloud/v1/web/printer/${m}/${d}/${endpoint || 'multiColorBox'}`;
  const _acuReportSubtree = (m, d) => `anycubic/anycubicCloud/v1/printer/public/${m}/${d}/#`;

  // ── MQTT ──────────────────────────────────────────────────────────────
  ipcMain.on('anycubic:connect', (event, { key, ip, port, modelId, deviceId, username, password }) => {
    if (!key || !ip || !modelId || !deviceId || !username || !password) {
      event.sender.send('anycubic:status', key, 'error:missing-params');
      return;
    }
    const existing = _acuClients.get(key);
    if (existing) { try { existing.client.end(true); } catch (_) {} _acuClients.delete(key); }

    const client = mqtt.connect({
      host: ip, port: Number(port) || 9883,
      protocol: 'mqtts',
      // Self-signed broker cert — identity is proven by username/password.
      rejectUnauthorized: false,
      // TLS 1.2 required (broker's optional client-cert request breaks 1.3).
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.2',
      username, password,
      clientId: `studio_${crypto.randomUUID()}`,
      keepalive: 20,
      clean: true,
      connectTimeout: 10000,
    });
    _acuClients.set(key, { client, wc: event.sender, modelId, deviceId });

    client.on('connect', () => {
      if (event.sender.isDestroyed()) return;
      // Emit 'connected' only AFTER the subscription is acked — the renderer
      // fires its state queries (tempature/fan/light) the instant it sees
      // 'connected', and at idle the printer doesn't auto-push those, so the
      // replies arrive exactly once. Announcing before SUBACK raced the
      // subscription and dropped them (fan stuck at 0 %, temp target blank until
      // the 30 s refresh). Subscribe first, announce in the callback.
      client.subscribe(_acuReportSubtree(modelId, deviceId), { qos: 0 }, (err) => {
        if (event.sender.isDestroyed()) return;
        if (err) { event.sender.send('anycubic:status', key, `error:subscribe-${err?.message || err}`); return; }
        event.sender.send('anycubic:status', key, 'connected');
      });
    });
    client.on('message', (topic, payload) => {
      if (event.sender.isDestroyed()) return;
      try { event.sender.send('anycubic:message', key, topic, JSON.parse(payload.toString())); }
      catch (_) {}
    });
    client.on('error',    (err) => { if (!event.sender.isDestroyed()) event.sender.send('anycubic:status', key, `error:${err?.message || err}`); });
    client.on('close',    ()    => { if (!event.sender.isDestroyed()) event.sender.send('anycubic:status', key, 'disconnected'); });
    client.on('offline',  ()    => { if (!event.sender.isDestroyed()) event.sender.send('anycubic:status', key, 'offline'); });
    client.on('reconnect',()    => { if (!event.sender.isDestroyed()) event.sender.send('anycubic:status', key, 'connecting'); });
  });

  ipcMain.on('anycubic:disconnect', (_evt, key) => {
    const e = _acuClients.get(key);
    if (e) { try { e.client.end(true); } catch (_) {} _acuClients.delete(key); }
  });

  // Publishes a request for this printer. The renderer builds the JSON body;
  // the command topic is derived here from the connect-time modelId/deviceId
  // plus the endpoint (defaults to multiColorBox for back-compat).
  ipcMain.on('anycubic:publish', (_evt, key, payload, endpoint) => {
    const e = _acuClients.get(key);
    if (!e) return;
    try { e.client.publish(_acuCmdTopic(e.modelId, e.deviceId, endpoint), JSON.stringify(payload), { qos: 0 }); }
    catch (_) {}
  });

  // ── FLV camera (port 18088) via ffmpeg ────────────────────────────────
  // The printer serves HTTP-FLV at http://<ip>:18088/flv; Chromium can't play
  // FLV natively, so ffmpeg pulls the stream and outputs MJPEG frames to
  // stdout (same pattern as the Bambu RTSP camera). Frames are parsed
  // (SOI=FF D8 … EOI=FF D9) and sent via 'anycubic:cam-frame'.
  const { spawn: _acuSpawn } = require('child_process');
  const _acuCamProcs = new Map(); // key → ChildProcess
  // Same reason as the Bambu RTSP camera: never leave ffmpeg.exe behind.
  app.on('will-quit', () => {
    for (const p of _acuCamProcs.values()) { p._stopped = true; try { p.kill(); } catch (_) {} }
    _acuCamProcs.clear();
  });

  ipcMain.on('anycubic:cam-start', (event, { key, ip, url }) => {
    const prev = _acuCamProcs.get(key);
    if (prev) { prev._stopped = true; try { prev.kill('SIGTERM'); } catch (_) {} _acuCamProcs.delete(key); }

    if (!_ffmpegBin) {
      console.warn('[acu-cam] ffmpeg not found — Anycubic camera disabled');
      return;
    }
    if (!ip) return;

    // The renderer only calls cam-start AFTER an flv-probe returned live, so a
    // repeated exit means the stream genuinely dropped — give up fast rather
    // than hammering a dead endpoint (the renderer re-probes on next open).
    let restarts = 0;
    const MAX_RESTARTS = 2;

    const launch = () => {
      if (event.sender.isDestroyed()) return;

      // Stream URL: newer models (Kobra X) advertise a tokenized path
      // (…:18088/live/<token>) via the MQTT info/report; the renderer passes it
      // here. Falls back to the Kobra 3 V2 default (/flv) when none was learned.
      const flvUrl = url || `http://${ip}:18088/flv`;
      console.log(`[acu-cam:${key}] launching ffmpeg → ${flvUrl} (bin: ${_ffmpegBin})`);

      /* Guarded like the Bambu RTSP spawn above: spawn throws SYNCHRONOUSLY on a
         bad CPU type or a missing binary, so proc.on('error') never sees it. */
      let proc;
      try {
      proc = _acuSpawn(_ffmpegBin, [
        '-loglevel', 'error',
        '-i', flvUrl,
        '-vf', 'fps=5',                // ~5 fps is plenty for a status cam
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-qscale:v', '3',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        console.error(`[acu-cam:${key}] cannot start ffmpeg (${_ffmpegBin}):`, err?.message || err);
        return;   // camera unavailable; the app carries on
      }

      proc._stopped = false;
      _acuCamProcs.set(key, proc);

      proc.stderr.on('data', chunk => {
        const msg = chunk.toString().trim();
        if (msg) console.error(`[acu-cam:${key}]`, msg);
      });

      // Parse raw stdout for JPEG frames: SOI (FF D8) → EOI (FF D9).
      proc.stdout.on('data', _jpegSplitter(frame => {
        if (!event.sender.isDestroyed())
          event.sender.send('anycubic:cam-frame', key, frame.toString('base64'));
        // Forward to detached cam window if open
        if (_camWindow && !_camWindow.isDestroyed())
          _camWindow.webContents.send('anycubic:cam-frame', key, frame.toString('base64'));
      }));

      proc.on('close', (code) => {
        if (_acuCamProcs.get(key) === proc) _acuCamProcs.delete(key);
        if (proc._stopped) return; // intentional stop — do not restart
        if (restarts < MAX_RESTARTS) {
          restarts++;
          const delay = Math.min(1000 * restarts, 3000); // 1 s → 3 s backoff
          console.log(`[acu-cam:${key}] exited (code=${code}), retry ${restarts}/${MAX_RESTARTS} in ${delay} ms`);
          setTimeout(launch, delay);
        } else {
          // Tell the renderer the stream died so it drops back to the idle
          // state (hero photo) instead of freezing on the last frame.
          if (!event.sender.isDestroyed()) event.sender.send('anycubic:cam-ended', key);
          console.warn(`[acu-cam:${key}] gave up after ${MAX_RESTARTS} restarts`);
        }
      });

      proc.on('error', (err) => {
        console.error(`[acu-cam:${key}] spawn error:`, err.message);
        if (_acuCamProcs.get(key) === proc) _acuCamProcs.delete(key);
      });
    };

    launch();
  });

  ipcMain.on('anycubic:cam-stop', (_evt, key) => {
    const p = _acuCamProcs.get(key);
    if (p) { p._stopped = true; try { p.kill('SIGTERM'); } catch (_) {} _acuCamProcs.delete(key); }
  });

  // ── Slicer on-disk credential reader ──────────────────────────────────
  // AnycubicSlicerNext caches every paired LAN printer's full broker
  // credentials in its config under "machine_list_of_LAN", obfuscated with a
  // keyless transform: stored = base64( +5( base64( +5( JSON ) ) ) ).
  function _acuDeobfuscate(stored) {
    const outer = Buffer.from(stored, 'base64');
    for (let i = 0; i < outer.length; i++) outer[i] = (outer[i] - 5) & 0xff;
    const inner = Buffer.from(outer.toString('ascii'), 'base64');
    for (let i = 0; i < inner.length; i++) inner[i] = (inner[i] - 5) & 0xff;
    return inner.toString('utf8');
  }

  function _acuConfCandidates() {
    const os = require('os');
    const list = [];
    if (process.platform === 'win32') {
      if (process.env.APPDATA) list.push(path.join(process.env.APPDATA, 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
    } else if (process.platform === 'darwin') {
      list.push(path.join(os.homedir(), 'Library', 'Application Support', 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
    } else {
      list.push(path.join(os.homedir(), '.config', 'AnycubicSlicerNext', 'AnycubicSlicerNext.conf'));
    }
    return list.flatMap(p => [p, p + '.bak']);
  }

  // Returns { ok:true, printers:[{ip,port,username,password,deviceId,modelId,name}], confPath }
  // or { ok:false, error } with a user-readable reason.
  ipcMain.handle('anycubic:read-slicer-config', async () => {
    try {
      const conf = _acuConfCandidates().find(p => { try { return fs.existsSync(p); } catch { return false; } });
      if (!conf) return { ok: false, error: 'config-not-found' };

      const text = fs.readFileSync(conf, 'utf8');
      const m = text.match(/"machine_list_of_LAN"\s*:\s*"([^"]*)"/);
      if (!m || m[1].length === 0) return { ok: false, error: 'no-lan-printers' };

      let arr;
      try { arr = JSON.parse(_acuDeobfuscate(m[1])); }
      catch (e) { return { ok: false, error: `decode-failed:${e.message}` }; }
      if (!Array.isArray(arr)) return { ok: false, error: 'decode-failed:not-a-list' };

      const printers = [];
      for (const p of arr) {
        if (!p || typeof p !== 'object') continue;
        const broker = String(p.broker || '');
        const bm = broker.match(/mqtts?:\/\/([^:]+):(\d+)/);
        const printer = {
          ip:       bm ? bm[1] : String(p.ip || ''),
          port:     bm ? parseInt(bm[2], 10) : parseInt(p.port, 10) || 9883,
          username: String(p.username || ''),
          password: String(p.password || ''),
          deviceId: String(p.deviceId || ''),
          // Slicer config uses "modeId" (sic) — accept both spellings.
          modelId:  String(p.modeId || p.modelId || ''),
          name:     String(p.name || ''),
        };
        if (printer.ip && printer.username && printer.password && printer.deviceId && printer.modelId) {
          printers.push(printer);
        }
      }
      if (!printers.length) return { ok: false, error: 'no-complete-creds' };
      return { ok: true, printers, confPath: conf };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // ── TCP probe — port 18910 open/closed fast filter for the LAN scan ──
  // Port 18910 is the printer's plaintext LAN-control/discovery API; it is
  // only open when the printer is in LAN mode.
  ipcMain.handle('anycubic:tcp-probe', async (_evt, ip) => {
    return new Promise((resolve) => {
      const sock = new net.Socket();
      let settled = false;
      const finish = (ok, error) => {
        if (settled) return; settled = true;
        try { sock.destroy(); } catch (_) {}
        resolve(error ? { ok, error } : { ok });
      };
      sock.setTimeout(650);
      sock.once('connect', () => finish(true));
      sock.once('timeout', () => finish(false, 'timeout'));
      sock.once('error', (err) => finish(false, err?.code || err?.message || 'error'));
      try { sock.connect(18910, ip); } catch (e) { finish(false, e?.message || 'connect-throw'); }
    });
  });

  // ── FLV liveness probe on :18088 ─────────────────────────────────────
  // The camera stream is on-demand: GET /flv 404s until the printer is told
  // to start capturing, and returns 200 + an FLV stream once it is live
  // (PROTOCOL.md §5c). We probe before spawning ffmpeg so we never loop on a
  // dead endpoint. Reads only the first chunk (the live response advertises a
  // bogus 99999999999 Content-Length) then aborts. Returns { ok, live }.
  ipcMain.handle('anycubic:flv-probe', async (_evt, ip, timeoutMs, url) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Number(timeoutMs) || 2500);
    try {
      const res = await fetch(url || `http://${ip}:18088/flv`, { signal: ctl.signal });
      // /flv (Kobra 3 V2) answers 200; the tokenized /live/<token> (Kobra X)
      // answers 206 Partial Content — both are live FLV.
      if (res.status !== 200 && res.status !== 206) { try { ctl.abort(); } catch (_) {} return { ok: true, live: false, status: res.status }; }
      // Confirm the FLV signature in the first bytes, then stop pulling.
      let live = false;
      try {
        const reader = res.body.getReader();
        const { value } = await reader.read();
        live = !!value && value.length >= 3 && value[0] === 0x46 && value[1] === 0x4C && value[2] === 0x56; // "FLV"
      } catch (_) { /* aborted mid-read — treat below */ }
      try { ctl.abort(); } catch (_) {}
      return { ok: true, live };
    } catch (e) {
      return { ok: false, live: false, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e)) };
    } finally {
      clearTimeout(timer);
    }
  });

  // ── HTTP /info — unauthenticated device descriptor on :18910 ─────────
  // Main-process fetch (no CORS). Returns { ok, info } | { ok:false, error }.
  ipcMain.handle('anycubic:http-info', async (_evt, ip, timeoutMs) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Number(timeoutMs) || 2500);
    try {
      const res = await fetch(`http://${ip}:18910/info`, { signal: ctl.signal });
      if (!res.ok) return { ok: false, error: `http-${res.status}` };
      const info = await res.json();
      return { ok: true, info };
    } catch (e) {
      return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e)) };
    } finally {
      clearTimeout(timer);
    }
  });
}

// ── Anycubic CLOUD — REST control + cloud MQTT (cloud-mode printers)
//    Reaches printers that are in CLOUD mode (no local ports) via Anycubic's
//    cloud, authenticated as the account owner. Auth/scheme ported from
//    ACE-RFID's CloudApi (public app constants from the hass-anycubic_cloud RE).
//    The user JWT is read from the slicer config on disk (key "access_token",
//    plaintext, ~90-day validity, email embedded) — same provisioning model as
//    the LAN creds, no running slicer needed. See PROTOCOL.md §7.
{
  const mqtt   = require('mqtt');
  const crypto = require('crypto');
  const https  = require('https');
  const certs  = require('./services/anycubicCloudCerts');

  const AID = 'f9b3528877c94d5c9c5af32245db46ef';
  const SEC = '0cf75926606049a3937f56b0373b99fb';
  const VER = 'V3.0.0';
  const API_ROOT  = 'https://cloud-universe.anycubic.com/p/p/workbench/api';
  const MQTT_HOST = 'mqtt-universe.anycubic.com';
  const MQTT_PORT = 8883;

  const _md5hex = (s) => crypto.createHash('md5').update(String(s), 'utf8').digest('hex');

  function _cloudHeaders(token) {
    const nonce = crypto.randomUUID();
    const ts = Date.now();
    return {
      'Xx-Device-Type': 'pcf',
      'Xx-Is-Cn': '1',
      'Xx-Nonce': nonce,
      'Xx-Signature': _md5hex(AID + ts + VER + SEC + nonce + AID),
      'Xx-Timestamp': String(ts),
      'Xx-Version': VER,
      'XX-LANGUAGE': 'US',
      'XX-Token': token || '',
    };
  }

  // Uses Node https (NOT fetch): the cloud gateway is case-sensitive on header
  // names (Xx-Signature / XX-Token), and undici/fetch lowercases them, which the
  // gateway rejects ("request error"). https preserves the case as given.
  function _cloudFetch(token, method, reqPath, bodyObj, timeoutMs) {
    return new Promise((resolve) => {
      let url;
      try { url = new URL(API_ROOT + reqPath); } catch (e) { return resolve({ status: 0, json: null, text: e.message }); }
      const headers = _cloudHeaders(token);
      let body = null;
      if (bodyObj != null) { body = JSON.stringify(bodyObj); headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
      const req = https.request({
        hostname: url.hostname, port: 443, path: url.pathname + url.search, method, headers,
        timeout: Number(timeoutMs) || 25000,
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { let json = null; try { json = JSON.parse(d); } catch (_) {} resolve({ status: res.statusCode, json, text: d }); });
      });
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, json: null, text: 'timeout' }); });
      req.on('error', (e) => resolve({ status: 0, json: null, text: e.message }));
      if (body) req.write(body);
      req.end();
    });
  }


  // ── CDP token grab — read the workbench session token from a RUNNING slicer ──
  // The workbench API needs a session token the slicer mints in memory at login
  // (the on-disk access_token is an OAuth token the workbench rejects, and the
  // workbench token is never persisted — verified). So we read it the way
  // ACE-RFID does: attach over the Chrome DevTools Protocol to a slicer the user
  // is already running in bridge mode (--remote-debugging-port) and evaluate the
  // Workbench Vuex store. We ATTACH ONLY — never launch the slicer.
  const FIND_STORE_JS =
    "function findStore(){try{var a=document.getElementById('app');if(a&&a.__vue__&&a.__vue__.$store)return a.__vue__.$store;}catch(e){}" +
    "try{var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var v=all[i].__vue__;if(v&&v.$store)return v.$store;}}catch(e){}return null;}";

  function _cdpEvaluate(wsUrl, expression, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false, ws;
      const done = (v) => { if (settled) return; settled = true; try { ws && ws.close(); } catch (_) {} resolve(v); };
      try { ws = new WebSocket(wsUrl); } catch (e) { return resolve({ error: 'ws-failed:' + e.message }); }
      const timer = setTimeout(() => done({ error: 'timeout' }), Number(timeoutMs) || 9000);
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true, userGesture: true } }));
      });
      ws.addEventListener('message', (ev) => {
        let msg; try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
        if (msg.id !== 1) return; // skip async CDP events
        clearTimeout(timer);
        if (msg.result && msg.result.exceptionDetails) return done({ error: 'js-exception' });
        done({ value: msg.result && msg.result.result ? msg.result.result.value : undefined });
      });
      ws.addEventListener('error', () => { clearTimeout(timer); done({ error: 'ws-error' }); });
      ws.addEventListener('close', () => { clearTimeout(timer); done({ error: 'ws-closed' }); });
    });
  }

  // Cross-platform cloud login — open the official Anycubic cloud site in a
  // window, let the user sign in, then read the workbench token the site mints
  // into localStorage ('XX-Token') — the very token _cloudFetch sends. No CDP,
  // no slicer, no platform restriction; we never see the password (login runs
  // on Anycubic's own page). A persistent partition keeps the session so repeat
  // logins are one-click. Returns { ok, token, email } | { ok:false, error }.
  ipcMain.handle('anycubic:cloud-web-login', async () => {
    return new Promise((resolve) => {
      let win, done = false, timer = null;
      const finish = (result) => {
        if (done) return; done = true;
        if (timer) clearInterval(timer);
        try { if (win && !win.isDestroyed()) win.destroy(); } catch (_) {}
        resolve(result);
      };
      try {
        win = new BrowserWindow({
          width: 460, height: 760, title: 'Anycubic Cloud — Sign in',
          autoHideMenuBar: true,
          webPreferences: { partition: 'persist:anycubic-cloud', nodeIntegration: false, contextIsolation: true },
        });
      } catch (e) { return resolve({ ok: false, error: e?.message || 'window-failed' }); }

      win.loadURL('https://cloud-universe.anycubic.com/file').catch(() => {});
      win.on('closed', () => finish({ ok: false, error: 'cancelled' }));

      const poll = async () => {
        if (!win || win.isDestroyed()) return finish({ ok: false, error: 'cancelled' });
        let tok = null;
        try { tok = await win.webContents.executeJavaScript("window.localStorage.getItem('XX-Token')", true); } catch (_) { return; }
        if (!tok || String(tok).length < 20) return;
        // VALIDATE before accepting: the persisted session can hold a STALE /
        // expired XX-Token (the site shows the login form, but the old token
        // lingers in localStorage). Only a token userInfo accepts is good — and
        // that same call gives us the account email the cloud MQTT login needs
        // (clientId = md5(email+'pcf'), username = user|pcf|email|sig). A bad
        // token → keep polling until the user signs in fresh.
        let email = '';
        try {
          const r = await _cloudFetch(String(tok), 'GET', '/user/profile/userInfo', null);
          if (!r.json || Number(r.json.code) !== 1) return; // stale/expired — wait for fresh login
          email = String((r.json.data && (r.json.data.user_email || r.json.data.email)) || '');
        } catch (_) { return; }
        finish({ ok: true, token: String(tok), email });
      };
      timer = setInterval(poll, 1200);
      // Safety cap — give up after 4 min if the user never finishes signing in.
      setTimeout(() => finish({ ok: false, error: 'cancelled' }), 240000);
    });
  });

  // Attach to a running bridge-mode slicer and read the cloud token + email.
  // Returns { ok, token, email } | { ok:false, error } where error is a machine
  // code for the renderer to translate: "cdp-unreachable" | "workbench-not-found"
  // | "no-token" | "no-store" | anything else.
  ipcMain.handle('anycubic:cloud-cdp-token', async (_evt, port) => {
    const cdpPort = Number(port) || 9222;
    try {
      // 1. Find the Workbench page among the CDP targets (plain HTTP, no header
      //    case issue — fetch is fine here).
      let targets;
      try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, { signal: AbortSignal.timeout(5000) });
        targets = await res.json();
      } catch (_) { return { ok: false, error: 'cdp-unreachable' }; }
      const wb = (Array.isArray(targets) ? targets : []).find(t =>
        /workbench|orca-ac-web/i.test(String(t.url || '') + ' ' + String(t.title || '')) && t.webSocketDebuggerUrl);
      if (!wb) return { ok: false, error: 'workbench-not-found' };

      // 2. Evaluate the store read in the page.
      const js =
        "(()=>{try{" + FIND_STORE_JS +
        "var s=findStore(); if(!s) return JSON.stringify({err:'no-store'});" +
        "var g=s.getters; var u=g.GET_USER_INFO||{};" +
        "return JSON.stringify({token:g.GET_TOKEN||'', email:(u.email||u.user_email||'')});" +
        "}catch(e){return JSON.stringify({err:String(e)});}})()";
      const r = await _cdpEvaluate(wb.webSocketDebuggerUrl, js, 9000);
      if (r.error) return { ok: false, error: r.error };
      let parsed = null; try { parsed = JSON.parse(r.value); } catch (_) {}
      if (!parsed) return { ok: false, error: 'bad-eval' };
      if (parsed.err) return { ok: false, error: parsed.err === 'no-store' ? 'no-store' : `workbench:${parsed.err}` };
      if (!parsed.token) return { ok: false, error: 'no-token' };
      return { ok: true, token: parsed.token, email: parsed.email || '' };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // List the account's cloud printers. Returns { ok, email, printers:[{id,name,
  // machineType,key,online}] } | { ok:false, error }.
  ipcMain.handle('anycubic:cloud-get-printers', async (_evt, token) => {
    try {
      const r = await _cloudFetch(token, 'GET', '/work/printer/getPrinters?page=1', null);
      if (!r.json) return { ok: false, error: 'no-response' };
      if (Number(r.json.code) !== 1) return { ok: false, error: r.json.msg || 'getPrinters-failed', code: r.json.code };
      const printers = (Array.isArray(r.json.data) ? r.json.data : []).map(p => {
        const ds = Number(p.device_status || 0);
        const reason = String(p.reason || '');
        const online = ds === 1 || (ds !== 2 && !/offline/i.test(reason));
        return {
          id: String(p.id || ''),
          name: String(p.name || ''),
          machineType: Number(p.machine_type || 0),
          key: String(p.key || ''),
          online,
        };
      });
      return { ok: true, printers };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // Per-printer live status via REST — the cloud getPrinters response carries a
  // `parameter` blob with the CURRENT temps (the printer does NOT push print/
  // tempature reports over cloud while idle, and there's no temp-query order).
  // So we poll this to surface nozzle/bed temps even at idle.
  // Also surfaces the active-job thumbnail: the cloud "project" for the running
  // task carries a signed S3 preview URL in `img`.
  // Returns { ok, online, nozzleCurrent, bedCurrent, jobThumb } | { ok:false }.
  ipcMain.handle('anycubic:cloud-printer-info', async (_evt, { token, printerId }) => {
    try {
      const r = await _cloudFetch(token, 'GET', '/work/printer/getPrinters?page=1', null);
      if (!r.json) return { ok: false, error: 'no-response' };
      if (Number(r.json.code) !== 1) return { ok: false, code: Number(r.json.code), authError: Number(r.json.code) === 10001, error: r.json.msg || 'failed' };
      const p = (Array.isArray(r.json.data) ? r.json.data : []).find(x => String(x.id) === String(printerId));
      if (!p) return { ok: false, error: 'not-found' };
      const param = p.parameter || {};
      const num = (v) => (v == null || v === '' ? null : Math.round(Number(v)));

      // Active-job preview thumbnail + latest project id. The latest project
      // (active print if any, else the most recent one — even completed) is the
      // project_id used for PRINT_SETTINGS orders (temps/fan/speed). Anycubic
      // applies those to the printer even at idle, mirroring hass-anycubic's
      // `printer.latest_project` (its HA fan/temperature entities work at idle
      // this way). A printer that has never printed has no project → can't set.
      let jobThumb = null;
      let latestProjectId = 0;
      try {
        const pr = await _cloudFetch(token, 'GET', '/work/project/getProjects?page=1&limit=5', null);
        if (pr.json && Number(pr.json.code) === 1 && Array.isArray(pr.json.data)) {
          const mine = pr.json.data.filter(x => String(x.printer_id) === String(printerId));
          const active = mine.find(x => Number(x.print_status) === 1);
          if (active && active.img) jobThumb = String(active.img);
          const latest = active || mine.slice().sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0];
          if (latest && latest.id != null) latestProjectId = Number(latest.id) || 0;
        }
      } catch (_) {}

      return {
        ok: true,
        online: Number(p.device_status || 0) === 1,
        nozzleCurrent: num(param.curr_nozzle_temp),
        bedCurrent:    num(param.curr_hotbed_temp),
        jobThumb,
        latestProjectId,
      };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // Verify a token (and fetch the email) via userInfo. { ok, email } | { ok:false }.
  /* Anycubic's shared cloud-MQTT TLS identity (CA + the client cert/key every
     Anycubic slicer ships), for DEVICES that connect to the broker themselves —
     a TigerSpool reads them off the printer's Firestore doc. Handed over as-is,
     never logged. */
  ipcMain.handle('anycubic:cloud-certs', async () => ({
    caDerB64:      certs.CA_DER_B64,
    clientCertPem: certs.CLIENT_CERT_PEM,
    clientKeyPem:  certs.CLIENT_KEY_PEM,
    // The slicer's app id, secret and version that sign a REST call (_cloudHeaders):
    // a Tiger Touch sends pause / resume / stop / light with them (sendOrder).
    appId:         AID,
    appSecret:     SEC,
    appVersion:    VER,
  }));

  ipcMain.handle('anycubic:cloud-verify', async (_evt, token) => {
    try {
      const r = await _cloudFetch(token, 'GET', '/user/profile/userInfo', null);
      if (!r.json || Number(r.json.code) !== 1) return { ok: false, error: 'invalid-or-expired' };
      return { ok: true, email: String((r.json.data && (r.json.data.user_email || r.json.data.email)) || '') };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // Send an ACE order via REST (1206 = getInfo, 1211 = setSlot). The report
  // comes back over cloud MQTT (see below). { ok } | { ok:false, error }.
  // code 10001 = "Login information has expired" (the token was revoked by a
  // newer slicer login). Surface code/msg so the renderer can recover (re-grab
  // the token from a bridge-mode slicer) rather than silently going offline.
  ipcMain.handle('anycubic:cloud-send-order', async (_evt, { token, orderId, printerId, projectId, data }) => {
    try {
      // Only attach project_id when it's a real (>0) project. Sending an
      // explicit `project_id: 0` is not the same as omitting it — base orders
      // (and the light) work without it; project orders fill it from the
      // latest project. Omitting the 0 keeps the payload like the slicer's.
      const body = { order_id: Number(orderId), printer_id: Number(printerId), data: data ?? {} };
      const pid = Number(projectId) || 0;
      if (pid > 0) body.project_id = pid;
      const r = await _cloudFetch(token, 'POST', '/work/operation/sendOrder', body);
      const code = r.json ? Number(r.json.code) : 0;
      if (code === 1) return { ok: true };
      return { ok: false, code, authError: code === 10001, error: (r.json && r.json.msg) || `send-failed-${r.status}` };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // ── Cloud camera open (order 1001) → Agora ("shengwang") credentials ──────
  // The cloud camera is an Agora WebRTC stream. CAMERA_OPEN with the
  // `shengwang_rtc_support` flag returns the channel + RTC token + the
  // publisher/subscriber uids + the stream-encryption material (PROTOCOL.md §9).
  // Unlike sendOrder above we must return the response DATA, not just ok/fail.
  ipcMain.handle('anycubic:cloud-camera-open', async (_evt, { token, printerId }) => {
    try {
      const body = { order_id: 1001, printer_id: Number(printerId), shengwang_rtc_support: true };
      const r = await _cloudFetch(token, 'POST', '/work/operation/sendOrder', body);
      const code = r.json ? Number(r.json.code) : 0;
      if (code !== 1) return { ok: false, code, authError: code === 10001, error: (r.json && r.json.msg) || `order-failed-${r.status}` };
      const sw = r.json.data && r.json.data.shengwang;
      if (!sw || !sw.appid || !sw.channel) return { ok: false, error: 'no shengwang creds in response (camera unavailable)' };
      return { ok: true, agora: {
        appId:     String(sw.appid),
        channel:   String(sw.channel),
        rtcToken:  String(sw.rtc_token || ''),
        clientUid: Number(sw.client_uid),   // the uid WE join as
        peerUid:   Number(sw.uid),           // the printer's publisher uid (subscribe target)
        encKey:    sw.encryption_key || '',
        encSalt:   sw.encryption_kdf_salt || '',  // base64 (32-byte KDF salt)
        encMode:   String(sw.encryption_mode || ''),
      } };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // ── Cloud-uploaded files (PROTOCOL.md §9c) — a SEPARATE REST subsystem from
  //    the on-printer/USB files of §5e (which ride sendOrder + MQTT). List +
  //    delete go straight through the signed workbench API (POST, the params as
  //    a JSON body); printing reuses anycubic:cloud-send-order (order 1) with the
  //    §9c payload. Same {code,msg,data} envelope as the rest — code 1 = success.
  ipcMain.handle('anycubic:cloud-files-list', async (_evt, { token, page, limit, machineType, printable }) => {
    try {
      const body = { page: Number(page) || 1, limit: Number(limit) || 50 };
      const mt = Number(machineType);
      if (Number.isFinite(mt) && mt > 0) body.machine_type = mt;   // omit → list all
      if (printable != null) body.printable = Number(printable);
      const r = await _cloudFetch(token, 'POST', '/work/index/files', body);
      const code = r.json ? Number(r.json.code) : 0;
      if (code !== 1) return { ok: false, code, authError: code === 10001, error: (r.json && r.json.msg) || `list-failed-${r.status}` };
      const files = Array.isArray(r.json.data) ? r.json.data : [];
      return { ok: true, files };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // Delete a cloud-uploaded file by id. Success returns data:"" (code 1).
  ipcMain.handle('anycubic:cloud-file-delete', async (_evt, { token, fileId }) => {
    try {
      const body = { idArr: [Number(fileId)] };
      const r = await _cloudFetch(token, 'POST', '/work/index/delFiles', body);
      const code = r.json ? Number(r.json.code) : 0;
      if (code === 1) return { ok: true };
      return { ok: false, code, authError: code === 10001, error: (r.json && r.json.msg) || `delete-failed-${r.status}` };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // ── Shared cloud MQTT — one client per signed-in user; reports for every
  //    subscribed cloud printer arrive on 'anycubic:cloud-message' tagged with
  //    the renderer conn key set at subscribe time.
  let _cloudClient = null;
  let _cloudClientEmail = '';
  let _cloudClientToken = '';
  const _cloudSubs = new Map(); // connKey → { machineType, key, wc }

  function _buildCloudLogin(email, token) {
    const clientId = _md5hex(email + 'pcf');
    const caDer = Buffer.from(certs.CA_DER_B64, 'base64');
    const pub = new crypto.X509Certificate(caDer).publicKey;
    const mqttToken = crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(token, 'utf8')).toString('base64');
    const sig = _md5hex(clientId + mqttToken + clientId);
    return { clientId, username: `user|pcf|${email}|${sig}`, password: mqttToken };
  }

  function _routeCloudMessage(topic, payload) {
    // topic: anycubic/anycubicCloud/v1/{src}/public/{machineType}/{key}/...
    const parts = topic.split('/');
    const mt = parts[5], key = parts[6];
    let data = null;
    try { data = JSON.parse(payload.toString('utf8')); } catch (_) { return; }
    for (const [connKey, sub] of _cloudSubs) {
      if (String(sub.machineType) === String(mt) && sub.key === key) {
        if (sub.wc && !sub.wc.isDestroyed()) sub.wc.send('anycubic:cloud-message', connKey, topic, data);
      }
    }
  }

  function _ensureCloudClient(email, token, wc) {
    // Rebuild when the token changes too — the MQTT password is derived from
    // the token, so a refreshed (post-revocation) token must reconnect.
    if (_cloudClient && _cloudClientEmail === email && _cloudClientToken === token) return;
    if (_cloudClient) { try { _cloudClient.end(true); } catch (_) {} _cloudClient = null; }
    _cloudClientEmail = email;
    _cloudClientToken = token;
    // Wrap the whole setup: a malformed cert / TLS option throws synchronously
    // from mqtt.connect (BoringSSL), and an uncaught throw here crashes the app
    // — report it as a cloud-status error instead.
    let client;
    try {
      const login = _buildCloudLogin(email, token);
      client = mqtt.connect({
        host: MQTT_HOST, port: MQTT_PORT, protocol: 'mqtts',
        clientId: login.clientId, username: login.username, password: login.password,
        // mTLS client identity as PEM cert + key. Two BoringSSL realities drive
        // this (Electron's main process is BoringSSL, not OpenSSL):
        //  1. The source PKCS#12 uses legacy (SHA1/RC2) encryption BoringSSL
        //     can't parse — so we ship the extracted PEM and pass cert/key.
        //  2. The cert is SHA1-signed; OpenSSL gates that behind SECLEVEL (and
        //     rejects the `…@SECLEVEL=0` cipher string anyway — INVALID_COMMAND),
        //     but BoringSSL has no such gate, so it loads with no cipher tweak.
        //     (The slicer itself is Chromium/BoringSSL talking to this broker.)
        cert: certs.CLIENT_CERT_PEM, key: certs.CLIENT_KEY_PEM,
        rejectUnauthorized: false, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
        keepalive: 30, clean: true, connectTimeout: 12000, reconnectPeriod: 5000,
      });
    } catch (e) {
      _cloudClient = null; _cloudClientEmail = ''; _cloudClientToken = '';
      if (!wc.isDestroyed()) wc.send('anycubic:cloud-status', `error:${e?.message || e}`);
      return;
    }
    _cloudClient = client;
    client.on('connect', () => {
      // Subscribe everything currently registered FIRST, then announce
      // 'connected' — the renderer re-issues getInfo on that event, and the
      // subscription must already be active so the reply report isn't missed.
      for (const sub of _cloudSubs.values()) {
        client.subscribe(`anycubic/anycubicCloud/v1/+/public/${sub.machineType}/${sub.key}/#`, { qos: 0 });
      }
      if (!wc.isDestroyed()) wc.send('anycubic:cloud-status', 'connected');
    });
    client.on('message', _routeCloudMessage);
    client.on('error',   (err) => { if (!wc.isDestroyed()) wc.send('anycubic:cloud-status', `error:${err?.message || err}`); });
    client.on('close',   ()    => { if (!wc.isDestroyed()) wc.send('anycubic:cloud-status', 'disconnected'); });
  }

  ipcMain.on('anycubic:cloud-connect', (event, { email, token }) => {
    if (!email || !token) { event.sender.send('anycubic:cloud-status', 'error:missing-auth'); return; }
    _ensureCloudClient(email, token, event.sender);
  });

  ipcMain.on('anycubic:cloud-subscribe', (event, { connKey, machineType, key }) => {
    if (!connKey || !key) return;
    _cloudSubs.set(connKey, { machineType, key, wc: event.sender });
    if (_cloudClient && _cloudClient.connected) {
      _cloudClient.subscribe(`anycubic/anycubicCloud/v1/+/public/${machineType}/${key}/#`, { qos: 0 });
    }
  });

  // Publish a realtime control command over the shared cloud MQTT client — same
  // {type, action, data} message shape and `web/printer/{m}/{key}/{endpoint}`
  // topic family as LAN. This is how the slicer drives fan/temp/etc.: they apply
  // even at idle (no project_id), unlike the REST sendOrder/PRINT_SETTINGS path
  // which only changes a project's settings.
  ipcMain.on('anycubic:cloud-publish', (_evt, { machineType, key, endpoint, payload }) => {
    if (!_cloudClient || !_cloudClient.connected || !key) return;
    const topic = `anycubic/anycubicCloud/v1/web/printer/${machineType}/${key}/${endpoint || 'multiColorBox'}`;
    try { _cloudClient.publish(topic, JSON.stringify(payload), { qos: 0 }); } catch (_) {}
  });

  ipcMain.on('anycubic:cloud-unsubscribe', (_evt, connKey) => {
    const sub = _cloudSubs.get(connKey);
    if (sub && _cloudClient && _cloudClient.connected) {
      try { _cloudClient.unsubscribe(`anycubic/anycubicCloud/v1/+/public/${sub.machineType}/${sub.key}/#`); } catch (_) {}
    }
    _cloudSubs.delete(connKey);
    // Drop the shared client when nothing is left subscribed.
    if (_cloudSubs.size === 0 && _cloudClient) { try { _cloudClient.end(true); } catch (_) {} _cloudClient = null; _cloudClientEmail = ''; _cloudClientToken = ''; }
  });
}

// ── App lifecycle
app.whenReady().then(async () => {
  imgCacheDir = path.join(app.getPath('userData'), 'img_cache');
  fs.mkdirSync(imgCacheDir, { recursive: true });

  // Dark window chrome (title bar, traffic lights) is the DEFAULT, matching the
  // app's default theme — set here so the frame is right before the renderer
  // has said anything. If the user picked Light, the renderer corrects this via
  // 'app:native-theme' as soon as it boots.
  nativeTheme.themeSource = 'dark';

  // macOS native "About Tiger Studio Manager" menu (Apple menu → About)
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName:    'Tiger Studio Manager',
      applicationVersion: app.getVersion(),
      version:            `Electron ${process.versions.electron}`,
      copyright:          '© TigerTag Project',
      website:            'https://github.com/TigerTag-Project/TigerTag-Studio-Manager',
    });
  }

  // Show the splash IMMEDIATELY — it's a self-contained data: URL, so it
  // appears before the DB init / renderer server / Firebase even start.
  createSplash();

  await db.initTigerTagDB();
  splashStep(2);

  createWindow();
  splashStep(3);
  mainWindow.webContents.once('did-finish-load', () => splashStep(4));
  initMcp();   // local read-only MCP server — only if the user turned it on
  initNFC();   // spawns isolated utility process — never blocks the main V8 thread
  initTD1S();
  initUsbScale();

  // Check for updates only after the renderer has fully painted its first frame,
  // then wait an additional 6 s so Firebase can connect and the inventory can
  // load before we fire a background network request. This prevents the updater
  // from competing with the critical startup traffic on slow connections.
  // Never runs in dev (npm start) — app.isPackaged is false there.
  if (app.isPackaged) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(initUpdater, 6000);
    });
  }

  // Sync DB in background — non-blocking, no crash if offline
  db.updateIfNeeded().then(n => {
    if (n > 0) console.log(`[DB] ${n} dataset(s) updated from API`);
  });

  app.on('activate', () => {
    // Dock-click / re-activation: the window is normally just hidden (macOS
    // close-to-hide above), so re-show it with its state intact. Only rebuild
    // if it was genuinely destroyed (e.g. a non-darwin edge case).
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
