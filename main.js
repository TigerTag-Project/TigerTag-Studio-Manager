const { app, BrowserWindow, ipcMain, shell, session, nativeTheme, utilityProcess, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const crypto = require('crypto');

// Right-click context-menu labels, translated in the RENDERER (which owns the app
// language) and pushed here via IPC so the native menu matches the in-app language
// rather than the OS locale. Null until the first push → role defaults are used.
let _ctxMenuLabels = null;
ipcMain.on('app:ctx-menu-labels', (_e, labels) => {
  if (labels && typeof labels === 'object') _ctxMenuLabels = labels;
});

// ── Persistent logging ─────────────────────────────────────────────────────
// Writes to:
//   Windows : %APPDATA%\Tiger Studio Manager\logs\main.log
//   macOS   : ~/Library/Logs/Tiger Studio Manager/main.log
//   Linux   : ~/.config/Tiger Studio Manager/logs/main.log
const log = require('electron-log');
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB max, auto-rotated
log.transports.file.format  = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
Object.assign(console, log.functions); // console.log/warn/error → log file
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
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
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
// Discord-style launch: a tiny frameless splash shows INSTANTLY (it's a
// self-contained data: URL, no server / Firebase needed), while the hidden
// main window loads + hydrates from cache off-screen. The renderer signals
// `studio:ready` once its first usable frame is painted; we then swap the
// main window in for the splash. A hard fallback timer guarantees the main
// window is always revealed even if the signal never arrives.
//
// Inline the TigerTag logo (white fill, transparent bg) so it paints with
// zero extra requests. Strip the XML prolog so it embeds cleanly in HTML;
// fall back to a lettermark if the file can't be read.
let _splashLogo = '';
try {
  _splashLogo = fs.readFileSync(path.join(__dirname, 'assets', 'svg', 'logos', 'logo_tigertag.svg'), 'utf8')
    .replace(/<\?xml[^>]*\?>/i, '')
    .trim();
} catch (_) { _splashLogo = ''; }
const _splashMark = _splashLogo
  ? `<div class="logo">${_splashLogo}</div>`
  : `<div class="mark">T</div>`;
function splashDataURL() {
  return `data:text/html;charset=utf-8,` + encodeURIComponent(`
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-user-select:none;cursor:default}
  .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
    background:#0e0e10;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.06)}
  .mark{width:120px;height:120px;border-radius:28px;background:linear-gradient(135deg,#ff7a18,#ffb056);
    display:flex;align-items:center;justify-content:center;font-weight:800;font-size:56px;color:#0e0e10;letter-spacing:-1px;
    box-shadow:0 8px 28px rgba(255,122,24,.35)}
  .logo{display:flex;align-items:center;justify-content:center}
  .logo svg{height:180px;width:auto;display:block;filter:drop-shadow(0 10px 30px rgba(255,122,24,.30))}
  .name{color:#fff;font-size:16px;font-weight:600;letter-spacing:.2px}
  .ver{color:rgba(255,255,255,.45);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin-top:-10px}
  .sub{color:rgba(255,255,255,.38);font-size:11px}
  .bar{width:140px;height:3px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:2px}
  .bar i{display:block;width:40%;height:100%;border-radius:3px;background:linear-gradient(90deg,#ff7a18,#ffb056);
    animation:slide 1s ease-in-out infinite}
  @keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}
</style></head><body><div class="card">
  ${_splashMark}
  <div class="name">Tiger Studio Manager</div>
  <div class="ver">v${app.getVersion()}</div>
  <div class="sub">Loading your studio…</div>
  <div class="bar"><i></i></div>
</div></body></html>`);
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480, height: 460,
    frame: false, transparent: true, resizable: false, movable: true,
    center: true, show: true, hasShadow: false, alwaysOnTop: true,
    skipTaskbar: true, focusable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadURL(splashDataURL());
  splashWindow.on('closed', () => { splashWindow = null; });
}

function revealMainWindow() {
  if (_mainRevealed) return;
  _mainRevealed = true;
  try { if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close(); } catch (_) {}
  splashWindow = null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
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
const { TigerTag } = require('tigertag');

// IPC payload — toRawDict() first, then rawApi() if TigerTag+.
async function _sdkPayload(tag, readerName = null) {
  const raw = tag.toRawDict();
  if (readerName) raw._readerName = readerName;
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

// ── Create main window
function createWindow() {
  // Reset the reveal latch so a window recreated from `activate` (macOS
  // dock-click after the red-button close destroyed the previous one)
  // runs its own splash→reveal cycle. Without this the new window stays
  // hidden forever — `revealMainWindow` short-circuits on the stale flag.
  _mainRevealed = false;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Tiger Studio Manager',
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
  ipcMain.once('studio:ready', revealMainWindow);
  // Safety fallback — never leave the app invisible if the signal is missed
  // (renderer crash, blocked script, etc.). 6 s is well past a normal cold
  // start; the studio:ready path almost always wins far sooner.
  setTimeout(revealMainWindow, 6000);

  startRendererServer(__dirname).then(({ port }) => {
    // Always load via 'localhost' (not '127.0.0.1') so Firebase Auth
    // sees a named host and Google sign-in works on all platforms.
    mainWindow.loadURL(`http://localhost:${port}/renderer/inventory.html`);
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
    shell.openExternal(url);
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
    let tag = TigerTag.fromCloudDoc(cloudDoc);
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
      pages = _pagesToWrite(newBytes, oldUserBytes);
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

    const newBytes = buildImage(Buffer.from(normalizeUid(card.uid), 'hex')); // 144 bytes

    // Surgical diff — read current user pages, skip the ones already matching.
    let oldBytes = null;
    const rReq = Date.now() + Math.random();
    const rRes = await new Promise((resolve) => {
      const to = setTimeout(() => { _nfcReadResolvers.delete(rReq); resolve({ ok: false }); }, 5000);
      _nfcReadResolvers.set(rReq, { resolve, timeout: to });
      _nfcChild.postMessage({ type: 'read-now', readerName, reqId: rReq });
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

// Cloud → chip encoding — called when the user wants to program a Cloud spool onto
// one or two physical RFID chips.
//
// opts = {
//   cloudDoc : Firestore doc (id_material, data1-7, color_*, weight_available, …)
//   targets  : [{ readerName, uid }]  — readers that currently hold a blank chip
//              UID is known by the renderer from state.nfcCardPresent
// }
//
// The payload is built ONCE (toBytes() called once) so that both chips receive
// identical bytes — same timestamp guaranteed.
//
// Returns { ok, results: [{ readerName, uid, ok, pagesWritten?, error? }] }
ipcMain.handle('rfid:encode-cloud', async (_evt, { cloudDoc, targets }) => {
  if (!_nfcChild) return { ok: false, error: 'NFC process not running' };
  if (!Array.isArray(targets) || targets.length === 0)
    return { ok: false, error: 'No target readers provided' };

  // ── Build payload ONCE — same bytes → same timestamp for all chips ──────────
  // Twins must share identical bytes to pair, so the timestamp is stamped once
  // here (not per chip). Used both as the write source and the diff reference.
  let newBytes;
  try {
    let tag = TigerTag.fromCloudDoc(cloudDoc).patch({ timestamp: _nowChipTs() });
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
      pages = _pagesToWrite(newBytes, oldUserBytes);
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
// SINGLE fixed `timestamp` (chip-epoch seconds) so both chips get identical
// bytes → they pair as twins. Returns { ok, verified, uid, pagesWritten,
// mismatchPages, error }. Success for the caller = ok && verified.
ipcMain.handle('rfid:burn-one', async (_evt, { cloudDoc, timestamp, readerName }) => {
  if (!_nfcChild)                     return { ok: false, error: 'NFC process not running' };
  if (!readerName || !_nfcReaders.has(readerName))
    return { ok: false, error: 'Reader not connected' };
  const card = _nfcCardPresent.get(readerName);
  if (!card)                          return { ok: false, error: 'No card present' };

  let pages;
  try {
    const ts  = Number.isFinite(timestamp) ? (timestamp >>> 0) : _nowChipTs();
    const tag = TigerTag.fromCloudDoc(cloudDoc).patch({ timestamp: ts });
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
      if (match) return p.path;   // use path as-is (tty.* works, no cu.* conversion needed)
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
  td1sConnect();
}

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
    mainWindow?.webContents.send('update-status', { status: 'ready', version: info?.version });
  });
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
  autoUpdater.checkForUpdatesAndNotify();
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
  autoUpdater.quitAndInstall();
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
// Injected at build time via GitHub Actions secrets TIGERTAG_GOOGLE_DESKTOP_CLIENT_ID
// and TIGERTAG_GOOGLE_DESKTOP_CLIENT_SECRET. For local dev, set them in your shell
// or in a .env file (never commit these values to the repository).
const GOOGLE_DESKTOP_CLIENT_ID     = process.env.TIGERTAG_GOOGLE_DESKTOP_CLIENT_ID     || '';
const GOOGLE_DESKTOP_CLIENT_SECRET = process.env.TIGERTAG_GOOGLE_DESKTOP_CLIENT_SECRET || '';

ipcMain.handle('auth:google-loopback', async () => {
  if (!GOOGLE_DESKTOP_CLIENT_ID) {
    return {
      ok: false,
      error: 'GOOGLE_DESKTOP_CLIENT_ID is not configured. See main.js header.',
    };
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
    // `prompt=select_account` mirrors the existing popup behaviour so users
    // with multiple Google accounts see the chooser every time.
    authUrl.searchParams.set('prompt',                'select_account');

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
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     GOOGLE_DESKTOP_CLIENT_ID,
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
    console.error('[auth.google-loopback] failed:', e?.message || String(e));
    return { ok: false, error: e?.message || String(e) };
  } finally {
    server.close();
  }
});

// IPC: renderer triggers a manual update check (regardless of the
// auto-update preference — explicit user action). Resolves with the
// outcome so the UI can show "Checking…" / "Up to date" / etc.
ipcMain.on('shell:open-external', (_evt, url) => {
  if (url && typeof url === 'string') shell.openExternal(url);
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
ipcMain.handle('img:get', async (_, url) => {
  if (!url || url === '--') return null;
  const hash     = crypto.createHash('md5').update(url).digest('hex');
  const ext      = (url.match(/\.(jpe?g|png|webp|gif|avif)/i) || [])[1] || 'jpg';
  const filename = `${hash}.${ext}`;
  const file     = path.join(imgCacheDir, filename);
  const httpUrl  = `/img-cache/${filename}`;
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
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
  for (const p of candidates) {
    try { fs.accessSync(p, fs.constants.X_OK); _ffmpegBin = p; break; } catch (_) {}
  }
  if (_ffmpegBin) console.log(`[ffmpeg] using ${_ffmpegBin}`);
  else console.warn(`[ffmpeg] NOT FOUND — checked: ${candidates.join(' · ')}`);
})();

// ── Bambu Lab MQTT (TLS mqtts port 8883) + JPEG-TCP camera (port 6000)
//    + RTSP camera (X1C / X1E / P2S / H2x — port 322) via ffmpeg
{
  const mqtt  = require('mqtt');
  const tls   = require('tls');
  const { spawn } = require('child_process');

  const _bambuClients    = new Map(); // key → { client, wc }
  const _bambuCamSockets = new Map(); // key → net.Socket

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

    let restarts = 0;
    const MAX_RESTARTS = 10;

    const launch = () => {
      if (event.sender.isDestroyed()) return;

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
        if (sock._stopped) return;
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
    const s = _bambuCamSockets.get(key);
    if (s) { s._stopped = true; try { s.destroy(); } catch (_) {} _bambuCamSockets.delete(key); }
  });

  // ── RTSP camera (X1C / X1E / P2S / H2x — port 322 TLS) ─────────────
  // ffmpeg pulls the rtsps:// stream and outputs MJPEG frames to stdout.
  // Frames are parsed (SOI=FF D8 … EOI=FF D9) and sent via the same
  // 'bambulab:cam-frame' IPC channel as the JPEG TCP camera above.
  const _bambuRtspProcs = new Map(); // key → ChildProcess

  ipcMain.on('bambulab:cam-start-rtsp', (event, { key, ip, password }) => {
    // Kill any existing process for this key (mark as intentionally stopped)
    const prev = _bambuRtspProcs.get(key);
    if (prev) { prev._stopped = true; try { prev.kill('SIGTERM'); } catch (_) {} _bambuRtspProcs.delete(key); }

    if (!_ffmpegBin) {
      console.warn('[bambu-rtsp] ffmpeg not found — RTSP camera disabled');
      return;
    }

    let restarts = 0;
    const MAX_RESTARTS = 10;

    const launch = () => {
      if (event.sender.isDestroyed()) return;

      // Never URL-encode the access code — Bambu codes are alphanumeric hex.
      // encodeURIComponent can corrupt them when ffmpeg parses the URL.
      const rtspUrl = `rtsps://bblp:${password}@${ip}:322/streaming/live/1`;
      console.log(`[bambu-rtsp:${key}] launching ffmpeg → rtsps://bblp:***@${ip}:322 (bin: ${_ffmpegBin})`);

      const proc = spawn(_ffmpegBin, [
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

      proc._stopped = false;
      _bambuRtspProcs.set(key, proc);

      // Forward ffmpeg errors to the main-process console so we can debug.
      proc.stderr.on('data', chunk => {
        const msg = chunk.toString().trim();
        if (msg) console.error(`[bambu-rtsp:${key}]`, msg);
      });

      // Parse raw stdout for JPEG frames: SOI (FF D8) → EOI (FF D9).
      // ffmpeg -f image2pipe -vcodec mjpeg outputs raw JPEG files concatenated.
      let buf = Buffer.alloc(0);
      proc.stdout.on('data', chunk => {
        buf = Buffer.concat([buf, chunk]);
        let start = -1;
        for (let i = 0; i < buf.length - 1; i++) {
          if (buf[i] === 0xFF && buf[i + 1] === 0xD8) { start = i; }
          if (start !== -1 && buf[i] === 0xFF && buf[i + 1] === 0xD9) {
            const frame = buf.slice(start, i + 2);
            buf = buf.slice(i + 2);
            if (!event.sender.isDestroyed())
              event.sender.send('bambulab:cam-frame', key, frame);
            // Forward to detached cam window if open
            if (_camWindow && !_camWindow.isDestroyed())
              _camWindow.webContents.send('bambulab:cam-frame', key, frame);
            start = -1;
            i = -1; // restart scan from new buf[0]
          }
        }
      });

      proc.on('close', (code) => {
        if (_bambuRtspProcs.get(key) === proc) _bambuRtspProcs.delete(key);
        if (proc._stopped) return; // intentional stop — do not restart
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
        if (_bambuRtspProcs.get(key) === proc) _bambuRtspProcs.delete(key);
      });
    };

    launch();
  });

  ipcMain.on('bambulab:cam-stop-rtsp', (_evt, key) => {
    const p = _bambuRtspProcs.get(key);
    if (p) { p._stopped = true; try { p.kill('SIGTERM'); } catch (_) {} _bambuRtspProcs.delete(key); }
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

      const proc = _acuSpawn(_ffmpegBin, [
        '-loglevel', 'error',
        '-i', flvUrl,
        '-vf', 'fps=5',                // ~5 fps is plenty for a status cam
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-qscale:v', '3',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      proc._stopped = false;
      _acuCamProcs.set(key, proc);

      proc.stderr.on('data', chunk => {
        const msg = chunk.toString().trim();
        if (msg) console.error(`[acu-cam:${key}]`, msg);
      });

      // Parse raw stdout for JPEG frames: SOI (FF D8) → EOI (FF D9).
      let buf = Buffer.alloc(0);
      proc.stdout.on('data', chunk => {
        buf = Buffer.concat([buf, chunk]);
        let start = -1;
        for (let i = 0; i < buf.length - 1; i++) {
          if (buf[i] === 0xFF && buf[i + 1] === 0xD8) { start = i; }
          if (start !== -1 && buf[i] === 0xFF && buf[i + 1] === 0xD9) {
            const frame = buf.slice(start, i + 2);
            buf = buf.slice(i + 2);
            if (!event.sender.isDestroyed())
              event.sender.send('anycubic:cam-frame', key, frame.toString('base64'));
            // Forward to detached cam window if open
            if (_camWindow && !_camWindow.isDestroyed())
              _camWindow.webContents.send('anycubic:cam-frame', key, frame.toString('base64'));
            start = -1;
            i = -1; // restart scan from new buf[0]
          }
        }
      });

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

  // Force dark window chrome (title bar, traffic lights) on all platforms
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

  createWindow();
  initNFC();   // spawns isolated utility process — never blocks the main V8 thread
  initTD1S();

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
