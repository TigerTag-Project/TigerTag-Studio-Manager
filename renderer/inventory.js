// ── RFID TigerTag tester modal ────────────────────────────────────────────
import { initRfidTester } from './rfid_protocol/tigertag/index.js';

// ── Offline timezone → country (telemetry, no IP geolocation) ──────────────
import { tzToCountry } from './tz-country.js';

// ── TigerScale IoT module ─────────────────────────────────────────────────
import {
  initTigerScale,
  subscribeScales,
  unsubscribeScales,
  renderScalesPanel,
  renderScaleHealth,
} from './IoT/tigerscale/index.js';

// ── TD1S colour-sensor module ─────────────────────────────────────────────
import {
  initTD1S,
  openTd1sConnectModal,
  openTd1sTesterModal,
} from './IoT/td1s/index.js';
import {
  initEditModals,
  openTdEditModal,
  openColorEditModal,
} from './IoT/td1s/edit-modals.js';

// ── Printer brand modules — each registers itself into the brands registry.
// Import order determines registration order (affects brand picker list).
import { ctx as _printerCtx } from './printers/context.js';
import { brands } from './printers/registry.js';
import {
  bambuKey, bambuGetConn, bambuIsOnline,
  bambuConnect, bambuDisconnect, bambuStopCam,
  renderBambuOnlineBadge,
  renderBambuLiveInner, renderBambuLogInner,
  openBambuFilamentEdit, closeBambuFilamentEdit,
  bambuPrintControl, bambuLight, bambuMove, bambuHome,
  bambuMotorsOff, bambuFan, bambuFanPct, bambuSetTemp, bambuSetSpeedMode,
} from './printers/bambulab/index.js';
import { renderBambuCamBanner } from './printers/bambulab/widget_camera.js';
import {
  ffgKey, ffgGetConn, ffgIsOnline,
  ffgPingPrinter,
  ffgConnect, ffgDisconnect, ffgTearDownCamera,
  renderFfgOnlineBadge,
  renderFlashforgeLiveInner, renderFlashforgeLogInner,
  openFlashforgeFilamentEdit, closeFlashforgeFilamentEdit,
} from './printers/flashforge/index.js';
import { renderFfgCamBanner, renderFfgCamWallBanner, ffgRefreshCamBanner, ffgCamBaseUrl } from './printers/flashforge/widget_camera.js';
import { ffgMuxStart, ffgMuxStop, ffgMuxStopAll, ffgMuxRestart, ffgMuxRegister, ffgMuxUnregister } from './printers/flashforge/cam_mux.js';
import { renderSnapCamBanner } from './printers/snapmaker/widget_camera.js';
import { openSnapAddFlow } from './printers/snapmaker/add-flow.js';
import { snapFanPct, snapFanStep, renderSnapControlCard } from './printers/snapmaker/widget_control.js';
import { openFfgAddFlow }  from './printers/flashforge/add-flow.js';
import { openCreAddFlow }  from './printers/creality/add-flow.js';
import { openBblAddFlow }  from './printers/bambulab/add-flow.js';
import { openElgAddFlow }  from './printers/elegoo/add-flow.js';
import { openAcuAddFlow }  from './printers/anycubic/add-flow.js';
import {
  acuKey, acuGetConn, acuIsOnline,
  acuConnect, acuDisconnect, acuReleaseCamera, acuReleaseCloudCameras,
  renderAcuOnlineBadge,
  renderAnycubicLiveInner, renderAnycubicLogInner,
  openAcuFilamentEdit, closeAcuFilamentEdit,
  acuPrintControl, acuSetTemp,
  acuLight, acuMove, acuHome, acuMotorsOff, acuFan, acuSetSpeedMode,
} from './printers/anycubic/index.js';
import { renderAcuCamBanner } from './printers/anycubic/widget_camera.js';
import { renderCreCamBanner, startCreCam, stopCreCam, reAttachCreCamConsumers, addCreCamConsumer, removeCreCamConsumer } from './printers/creality/widget_camera.js';
import {
  snapKey, snapGetConn, snapIsOnline,
  snapPingPrinter,
  snapConnect, snapDisconnect,
  renderSnapOnlineBadge,
  renderSnapmakerLiveInner, renderSnapmakerLogInner,
  openSnapFilamentEdit, closeSnapFilamentEdit,
  snapPrintControl, openSnapFileSheet, closeSnapFileSheet,
  snapSendGcode, snapSendCustomJson,
  snapFmtTempPair, snapFmtDuration, snapTextColor, snapFilenameRel,
  SNAP_FIL_COLOR_PRESETS,
  SNAP_ICON_NOZZLE, SNAP_ICON_BED, SNAP_ICON_CHAMBER, SNAP_ICON_CLOCK,
} from './printers/snapmaker/index.js';
import {
  creKey, creIsOnline, crePingPrinter,
  creConnect, creDisconnect,
  renderCrealityLiveInner, renderCreLogInner,
  creRefreshOnlineUI, renderCreOnlineBadge,
  creGetConn,
  openCreFilamentEdit, closeCreFilamentEdit,
  openCreFileSheet, closeCreFileSheet,
  creActionLed, creActionPause, creActionStop,
  creLoadFileList, creActionPrintFile, creActionDeleteFile,
} from './printers/creality/index.js';
import {
  elegooKey, elegooGetConn, elegooIsOnline,
  elegooConnect, elegooDisconnect,
  elegooSendCmd,
  elegooStartPrint, elegooTimelapseDl,
  elegooFileSheetSetTab,
  renderElegooLiveInner, renderElegooLogInner,
  openElegooFilamentEdit, closeElegooFilamentEdit,
  openElegooFileSheet, closeElegooFileSheet,
} from './printers/elegoo/index.js';
import { renderElegooCamBanner } from './printers/elegoo/widget_camera.js';
import { elgFanStep } from './printers/elegoo/widget_control.js';

  const API_BASE         = "https://cdn.tigertag.io";

  // ── Firebase helpers — one named app instance per account ────────────────
  // Each account has its own firebase.app(uid) with independent auth session.
  // Falls back to the DEFAULT app only during the sign-in flow (uid not known yet).
  const fbAuth = (id) => {
    const appId = id || state.activeAccountId;
    if (appId) { try { return firebase.app(appId).auth(); } catch (_) {} }
    return firebase.auth();
  };
  const fbDb = (id) => {
    const appId = id || state.activeAccountId;
    if (appId) { try { return firebase.app(appId).firestore(); } catch (_) {} }
    return firebase.firestore();
  };
  // Cloud Storage handle, same per-account scoping as fbAuth / fbDb. Used
  // today only for custom avatars (`avatars/{uid}`). The default-bucket
  // ref is fine — `storageBucket` is set in firebase.js' FIREBASE_CONFIG.
  const fbStorage = (id) => {
    const appId = id || state.activeAccountId;
    if (appId) { try { return firebase.app(appId).storage(); } catch (_) {} }
    return firebase.storage();
  };
  let _unsubInventory  = null; // active Firestore onSnapshot unsubscribe handle
  let _sliderDebounce  = null; // pending auto-save timer for weight slider

  const ACCOUNT_COLORS = {
    orange: ["#f97316","#fb923c"],   // orange vif
    amber:  ["#d97706","#f59e0b"],   // ambre doré
    yellow: ["#ca8a04","#eab308"],   // jaune
    lime:   ["#65a30d","#84cc16"],   // vert citron
    green:  ["#16a34a","#22c55e"],   // vert nature
    teal:   ["#0d9488","#14b8a6"],   // bleu-vert
    sky:    ["#0284c7","#0ea5e9"],   // bleu ciel
    blue:   ["#2563eb","#3b82f6"],   // bleu roi
    violet: ["#7c3aed","#8b5cf6"],   // violet
    fuchsia:["#c026d3","#d946ef"],   // fuchsia
    rose:   ["#e11d48","#f43f5e"],   // rose vif
    red:    ["#dc2626","#ef4444"],   // rouge
    slate:  ["#475569","#64748b"],   // ardoise
  };
  // Compute a two-stop gradient from a single hex colour
  function hexToGradientPair(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const mix = (c) => Math.min(255, c + Math.round((255-c)*0.38));
    const h = n => n.toString(16).padStart(2,"0");
    return [hex, `#${h(mix(r))}${h(mix(g))}${h(mix(b))}`];
  }
  function getAccGradient(acc) {
    if (acc?.color === "custom" && acc.customColor) {
      const [c1,c2] = hexToGradientPair(acc.customColor);
      return `linear-gradient(135deg,${c1},${c2})`;
    }
    const [c1,c2] = ACCOUNT_COLORS[acc?.color] || ACCOUNT_COLORS.orange;
    return `linear-gradient(135deg,${c1},${c2})`;
  }
  function getAccShadow(acc) {
    if (acc?.color === "custom" && acc.customColor) return acc.customColor;
    return (ACCOUNT_COLORS[acc?.color] || ACCOUNT_COLORS.orange)[0];
  }
  // ─── Avatar rendering — single source of truth ─────────────────────
  //
  // Every coloured-circle avatar in Studio (sidebar, header chip,
  // dropdown, profiles modal, edit-account modal, friend chips,
  // friend panel) is now painted through ONE pipeline so the
  // gradient + initials + photo overlay are always computed and
  // applied atomically. This eliminates the historical class of
  // "the initial flickered to a wrong letter / the photo was wiped
  // by a textContent update / back-and-forth between OM and B"
  // bugs — every site uses the same input → output transform.
  //
  // Two public entry points (both delegate to `_buildAvatarParts`):
  //
  //   - `paintAvatar(el, source)` — imperative form. Updates an
  //     existing DOM element in place. Used by code paths that hold
  //     a stable element reference (sb-avatar, eac-avatar) and want
  //     to push updates without rebuilding markup.
  //
  //   - `avatarMarkup(source, className, extraClass)` — template
  //     form. Returns the full `<span class="…"> … </span>` HTML
  //     used inside innerHTML-built lists (dropdown items, friend
  //     chips, profiles modal rows, friend banner).
  //
  // `source` is anything with the shape
  //   { displayName?, photoURL?, color?, color_r/g/b?, customColor? }
  // — typically an `Account` from localStorage, a `Friend` from
  // state.friends, or for the live active user, an object that
  // mixes state.* and acc.* (see `_avatarSubject` below).
  //
  // INVARIANT — initials are derived STRICTLY from `displayName`,
  // never the email. Empty displayName → empty string → gradient
  // shown without a letter for ~100 ms until syncUserDoc resolves
  // and refreshes. This avoids the "B from benoit@…" wrong-letter
  // flash that the legacy email-fallback paths produced.

  // Resolve the FRESHEST view of an avatar's properties. For the
  // active account, `state.*` may hold a just-uploaded photo URL or
  // a just-renamed displayName that hasn't yet been mirrored to
  // localStorage; pull those first.
  //
  // Friend objects carry colour as a single hex string (e.g.
  // "#ff7a18") instead of an account-style named-or-RGB triplet —
  // translate that to the `customColor` shape so getAccGradient /
  // getAccShadow handle it the same as a custom-coloured account.
  // This makes friend chips render with the same 135° gradient as
  // own avatars, instead of a flat colour fallback.
  function _avatarSubject(source) {
    if (!source) return { displayName: "", photoURL: null };
    if (source.id && source.id === state.activeAccountId) {
      return {
        displayName: state.displayName || source.displayName || "",
        photoURL:    state.photoURL    || source.photoURL    || null,
        color: source.color, color_r: source.color_r,
        color_g: source.color_g, color_b: source.color_b,
        customColor: source.customColor,
      };
    }
    // Friend / friendView shape with a single hex colour — promote
    // to a "custom"-flavoured subject so the same gradient pipeline
    // applies.
    if (source.color && typeof source.color === "string" && source.color.startsWith("#")) {
      return Object.assign({}, source, { color: "custom", customColor: source.color });
    }
    return source;
  }

  // The "+" glyph for the empty (no-account) avatar state. Inline SVG —
  // NOT a mask `.icon` — so it carries no dependency on the global
  // `.icon` cascade (which historically leaked it as "OM+" next to the
  // initials). It inherits `currentColor` from the host's `color`.
  const AV_PLUS_SVG =
    '<svg class="av-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  function _makeAvatarPlus() {
    const tpl = document.createElement("template");
    tpl.innerHTML = AV_PLUS_SVG;
    return tpl.content.firstChild;
  }

  // Compute the styling + content parts once, reused by both the
  // imperative and template forms.
  //
  // The crucial output is `mode` ∈ { "empty", "initials", "photo" } —
  // the single decision the whole tri-state invariant hinges on:
  //   • `source == null`  → "empty"     (signed-out → the "+" glyph)
  //   • a usable photoURL → "photo"     (photo only, nothing behind)
  //   • otherwise         → "initials"  (initials, possibly "" → bare gradient)
  // The host gets `data-av-mode` stamped on it and CSS hides the two
  // inactive children with `display:none` — so leakage can never happen
  // through sub-pixel rounding, z-index ambiguity or transparent-PNG
  // edges. We never again rely on the photo merely "covering" the text.
  function _buildAvatarParts(source) {
    const subject  = _avatarSubject(source);
    const photoURL = subject.photoURL || null;
    const initials = getInitials(subject);
    const mode = !source ? "empty" : (photoURL ? "photo" : "initials");
    if (mode === "empty") {
      // Neutral, style-less — the gradient/shadow/colour come from the
      // `[data-av-mode="empty"]` CSS rule (so :hover keeps working,
      // which an inline background would defeat). Empty strings clear
      // any inline styles a previous paint left on the element.
      return { mode, subject, photoURL: null, initials: "", bg: "", fg: "", boxShadow: "" };
    }
    const gradient = getAccGradient(subject);
    const shadowCol = getAccShadow(subject);
    return {
      mode, subject, photoURL, initials,
      bg:       gradient,
      fg:       readableTextOn(shadowCol),
      boxShadow: `0 0 0 3px ${shadowCol}40,0 4px 20px ${shadowCol}33`,
    };
  }

  // Imperative paint — used by sb-avatar (sidebar) and eac-avatar
  // (edit-account modal). Ensures the three tri-state children exist
  // (`.av-initials`, `.av-plus`, optional `.sb-avatar-photo`), updates
  // them, then stamps `data-av-mode` LAST so the CSS invariant resolves
  // to exactly one visible child. We never write the container's own
  // textContent (that would nuke the photo / swap badge siblings).
  function paintAvatar(el, source) {
    if (!el) return;
    const p = _buildAvatarParts(source);
    el.style.background = p.bg;
    el.style.boxShadow  = p.boxShadow;
    el.style.color      = p.fg;
    let initEl = el.querySelector(":scope > .av-initials");
    if (!initEl) {
      initEl = document.createElement("span");
      initEl.className = "av-initials";
      el.insertBefore(initEl, el.firstChild);
    }
    initEl.textContent = p.initials;
    if (!el.querySelector(":scope > .av-plus")) el.appendChild(_makeAvatarPlus());
    _renderAvatarPhotoOverlay(el, p.photoURL);
    el.dataset.avMode = p.mode;
  }

  // Template form — returns the full HTML for innerHTML-built lists.
  // Mirrors `paintAvatar`: all three children present, `data-av-mode`
  // on the host drives the invariant.
  function avatarMarkup(source, className, extraClass) {
    const p = _buildAvatarParts(source);
    const cls = className + (extraClass ? ' ' + extraClass : '');
    const style = p.bg || p.fg ? ` style="${p.bg ? `background:${p.bg};` : ""}${p.fg ? `color:${p.fg}` : ""}"` : "";
    return `<span class="${cls}" data-av-mode="${p.mode}"${style}>` +
      `<span class="av-initials">${esc(p.initials)}</span>` +
      AV_PLUS_SVG +
      _avatarPhotoTag(p.photoURL) +
      `</span>`;
  }

  // Backward-compatibility shim — existing call sites still invoke
  // `applyAvatarStyle(acc)` for the sidebar avatar. Delegate to the
  // new pipeline so they get the centralised behaviour for free.
  function applyAvatarStyle(acc) {
    paintAvatar($("sbAvatar"), acc);
  }
  // Inline template form of the photo overlay — used by `innerHTML`-built
  // avatar variants (dropdown, sidebar friend chips, profiles modal,
  // friend banner). On decode-fail the <img> removes itself AND flips the
  // host back to "initials" mode, so the colour-circle + initials reappear
  // (the tri-state invariant would otherwise keep them hidden).
  function _avatarPhotoTag(url) {
    if (!url) return "";
    return `<img class="sb-avatar-photo" src="${esc(url)}" alt="" ` +
      `onerror="this.remove();if(this.parentNode)this.parentNode.dataset.avMode='initials'" />`;
  }
  // Insert/update/remove the `<img class="sb-avatar-photo">` overlay on
  // any avatar container, and keep `data-av-mode` consistent (so direct
  // callers — the edit-account upload/remove flows — don't have to).
  // Idempotent: same URL twice doesn't reload, missing URL strips the
  // overlay and returns the host to "initials" mode.
  function _renderAvatarPhotoOverlay(container, url) {
    if (!container) return;
    let img = container.querySelector(":scope > .sb-avatar-photo");
    if (url) {
      if (!img) {
        img = document.createElement("img");
        img.className = "sb-avatar-photo";
        img.alt = "";
        // On decode-fail: drop the <img> and fall back to initials mode.
        img.addEventListener("error", () => {
          img.remove();
          container.dataset.avMode = "initials";
        }, { once: true });
        container.appendChild(img);
      }
      if (img.src !== url) img.src = url;
      container.dataset.avMode = "photo";
    } else if (img) {
      img.remove();
      container.dataset.avMode = "initials";
    }
  }

  // Dev-only self-test (DevTools: `_avatarTest()`). Paints all three
  // states through BOTH public entry points (`avatarMarkup` template +
  // `paintAvatar` imperative) into an off-screen host and asserts, via
  // getComputedStyle, that exactly ONE child is visible per state and the
  // other two are `display:none`. Returns true on full pass. Gated behind
  // debug mode so it never runs for end users.
  function _avatarTest() {
    if (!state.debugEnabled) { console.warn("[_avatarTest] enable debug mode first"); return false; }
    const PX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    document.body.appendChild(host);
    const cases = [
      { mode: "empty",    source: null,                                              show: "av-plus",         hide: ["av-initials", "sb-avatar-photo"] },
      { mode: "initials", source: { id: "_t", displayName: "Olivia Mars" },          show: "av-initials",     hide: ["av-plus", "sb-avatar-photo"] },
      { mode: "photo",    source: { id: "_t", displayName: "Olivia Mars", photoURL: PX }, show: "sb-avatar-photo", hide: ["av-plus", "av-initials"] },
    ];
    const shown = (av, cls) => { const n = av.querySelector(":scope > ." + cls); return !!n && getComputedStyle(n).display !== "none"; };
    const rows = [];
    let pass = true;
    for (const form of ["markup", "paint"]) {
      for (const c of cases) {
        const wrap = document.createElement("div");
        if (form === "markup") {
          wrap.innerHTML = avatarMarkup(c.source, "sb-avatar");
        } else {
          const el = document.createElement("span");
          el.className = "sb-avatar";
          wrap.appendChild(el);
          paintAvatar(el, c.source);
        }
        host.appendChild(wrap);
        const av = wrap.querySelector("[data-av-mode]");
        const modeOk = av && av.dataset.avMode === c.mode;
        const showOk = av && shown(av, c.show);
        const hideOk = av && c.hide.every(cl => !shown(av, cl));
        const ok = !!(modeOk && showOk && hideOk);
        pass = pass && ok;
        rows.push({ form, expect: c.mode, mode: av && av.dataset.avMode, visible: c.show, showOk, hideOk, ok });
      }
    }
    console.table(rows);
    host.remove();
    console[pass ? "log" : "error"]("[_avatarTest] " + (pass ? "PASS — exactly one child visible in all 6 cases ✓" : "FAIL ✗"));
    return pass;
  }
  if (typeof window !== "undefined") window._avatarTest = _avatarTest;

  const STORAGE_ACCOUNTS = "tigertag.accounts";
  const STORAGE_ACTIVE   = "tigertag.activeAccount";

  // ── Local-first persistence layer ───────────────────────────────────
  // ONE registry of every per-uid cache surface + a uniform read/write.
  // The whole "feels like Discord on launch" behaviour rests on this: a
  // surface mirrored here can be hydrated SYNCHRONOUSLY before the first
  // paint (no Firestore round-trip), then the live snapshot merges on top.
  //
  // Existing keys are preserved verbatim (`tigertag.inv.<uid>`,
  // `tigertag.friends.<uid>`) so this is a formalisation, not a migration.
  // Surfaces marked "L3" are declared now and wired into their subscribe
  // paths in the diff-only render pass (Level 3). See ARCHITECTURE.md.
  const Cache = {
    _key: {
      inventory:  uid => `tigertag.inv.${uid}`,
      friends:    uid => `tigertag.friends.${uid}`,
      userdoc:    uid => `tigertag.userdoc.${uid}`,
      racks:      uid => `tigertag.racks.${uid}`,      // L3
      printers:   uid => `tigertag.printers.${uid}`,   // L3
      scales:     uid => `tigertag.scales.${uid}`,     // L3
      friendReqs: uid => `tigertag.friendReqs.${uid}`, // L3
      blocklist:  uid => `tigertag.blocklist.${uid}`,  // L3
    },
    read(surface, uid) {
      const k = uid && this._key[surface];
      if (!k) return null;
      try { return JSON.parse(localStorage.getItem(k(uid)) || "null"); } catch { return null; }
    },
    write(surface, uid, data) {
      const k = uid && this._key[surface];
      if (!k) return;
      try { localStorage.setItem(k(uid), JSON.stringify(data)); } catch {}
    },
    clear(surface, uid) {
      const k = uid && this._key[surface];
      if (!k) return;
      try { localStorage.removeItem(k(uid)); } catch {}
    },
  };
  // Back-compat alias — the inventory key builder predates the Cache layer.
  const invKey = id => Cache._key.inventory(id);

  // ── Cold-start trace ────────────────────────────────────────────────
  // Records wall-clock marks across the launch timeline so we can prove
  // the "first usable paint < 300 ms" target. Zero cost in normal use;
  // `window._coldStartTrace()` (DevTools) prints the table + deltas.
  const ColdStart = {
    marks: [],
    _firstPaintDone: false,
    mark(label) { try { this.marks.push({ label, t: performance.now() }); } catch {} },
  };
  ColdStart.mark("module-eval");
  // Idempotent — records "first-paint" exactly once and tells the main
  // process (via the splash gate) that the first usable frame is ready,
  // so it can swap the hidden main window in. Safe to call from several
  // boot paths (signed-in fast path, signed-out, slow auth); the first
  // call wins, the rest are no-ops.
  function signalFirstPaint() {
    if (ColdStart._firstPaintDone) return;
    ColdStart._firstPaintDone = true;
    ColdStart.mark("first-paint");
    try { window.studio?.ready(); } catch {}
  }
  function _coldStartTrace() {
    const m = ColdStart.marks;
    if (!m.length) { console.warn("[_coldStartTrace] no marks yet"); return; }
    const t0 = m[0].t;
    const rows = m.map((x, i) => ({
      step: x.label,
      "t (ms)": Math.round(x.t - t0),
      "Δ prev (ms)": i ? Math.round(x.t - m[i - 1].t) : 0,
    }));
    console.table(rows);
    const fp = m.find(x => x.label === "first-paint");
    if (fp) console.log(`[_coldStartTrace] first paint @ ${Math.round(fp.t - t0)} ms ` +
      ((fp.t - t0) < 300 ? "✓ under 300 ms target" : "✗ over 300 ms"));
    return rows;
  }
  if (typeof window !== "undefined") window._coldStartTrace = _coldStartTrace;

  // ── rAF render coalescer ────────────────────────────────────────────
  // When a single Firestore tick delivers several collections, naive code
  // re-renders N times in one frame. `scheduleRender(key, fn)` collapses
  // repeated requests for the same key into ONE call on the next animation
  // frame → the user sees one consistent paint per tick. Reusable across
  // every render site.
  const _rafPending = new Map();
  let _rafScheduled = false;
  function scheduleRender(key, fn) {
    _rafPending.set(key, fn);
    if (_rafScheduled) return;
    _rafScheduled = true;
    requestAnimationFrame(() => {
      _rafScheduled = false;
      const jobs = [..._rafPending.values()];
      _rafPending.clear();
      for (const job of jobs) { try { job(); } catch (e) { console.warn("[scheduleRender]", e); } }
    });
  }

  const LOGO_PATH          = "../assets/svg/logos/logo_tigertag.svg";
  const LOGO_PATH_OUTLINE  = "../assets/svg/logos/logo_tigertag_contouring.svg";

  const state = {
    inventory: null,
    rows: [],
    selected: null,
    keyValid: null,
    displayName: null,
    search: "",
    brandFilter: "",                  // exact brand name to keep, "" = all
    materialFilter: "",               // exact material name to keep, "" = all
    typeFilter: "",                   // exact product type to keep, "" = all

    viewMode: localStorage.getItem("tigertag.view") || "table",
    lang: localStorage.getItem("tigertag.lang") || "en",
    sortCol: null,
    sortDir: "asc",
    printerSortCol: "status",   // default: online printers at top
    printerSortDir: "desc",      // status=1 (online) sorts above status=0 (offline)
    activeAccountId: null,
    i18n: {},
    imgCache: new Map(),
    invLoading: false,
    // True between subscribePrinters() and the first snapshot from any
    // of the 5 brand subcollections firing. Drives the "loading…" UI
    // in the printers view so we don't flash the empty state while
    // Firestore is still on its way back.
    printersLoading: false,
    isAdmin: false,
    debugEnabled: false,
    publicKey: null,
    privateKey: null,
    // Cloud Storage download URL of the user's custom avatar (or null
    // when they're still on the colour-circle + initials default).
    // Mirrored from `userProfiles/{uid}.photoURL`, populated by
    // syncUserDoc and consumed by `applyAvatarStyle`. The token in the
    // URL rotates on every upload so we get cache-busting for free.
    photoURL: null,
    isPublic: false,
    friends: [],             // [{ uid, displayName, addedAt, key }]
    friendRequests: [],      // [{ uid, displayName, requestedAt }]
    blacklist: [],           // [{ uid, displayName, blockedAt }]
    racks: [],               // [{ id, name, level, position, order, createdAt, lastUpdate }]
    rackPresets: [],         // loaded from data/rack-presets.json
    unsubRacks: null,        // Firestore unsubscribe handle for racks
    scales: [],              // [{ mac, name, last_seen, last_spool, fw_version, ... }]
    unsubScales: null,       // Firestore unsubscribe handle for scales
    printers: [],            // [{ id, brand, printerName, printerModelId, isActive, updatedAt, sortIndex, ... }]
    unsubPrinters: [],       // array of Firestore unsubscribe handles (one per brand subcollection)
    unsubFriendRequests: null,
    friendView: null,        // { uid, displayName, avatarColor } — set when viewing a friend's inventory
    td1sConnected: false,
    scanMode: false,        // true = "+ Scan" active, auto-add on unknown chip
    nfcReaderCount: 0,      // number of connected NFC readers
    nfcReaders: new Set(),  // names of currently connected NFC readers (for sequential burn)
    nfcCardPresent: new Map(), // readerName → { uid } — tracks which reader currently holds a card
    rendererPath: null,  // absolute path to renderer/ dir — used as file:// preload base for <webview>
    db: { brand: [], material: [], aspect: [], type: [], diameter: [], unit: [], version: [], containers: [] }
  };

  const $ = id => document.getElementById(id);

  // t(key, params?) — looks up a translation key in the loaded locale.
  // Supports: plain strings, {{param}} interpolation, ["array"] random pick,
  // and {"one": "…", "other": "…"} plurals (uses params.n to select form).
  function t(key, params = {}) {
    const lang = state.i18n[state.lang] || {};
    const en   = state.i18n.en || {};
    const val  = (key in lang) ? lang[key] : (key in en ? en[key] : key);
    if (Array.isArray(val)) {
      return val[Math.floor(Math.random() * val.length)];
    }
    if (val && typeof val === "object" && ("one" in val || "other" in val)) {
      const n = params.n ?? 0;
      const str = n === 1 ? (val.one ?? val.other) : (val.other ?? val.one);
      return (str || "").replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? "");
    }
    if (typeof val === "string") {
      return val.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? "");
    }
    return key;
  }

  function applyTranslations() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    // data-i18n-title — used for icon-only buttons that need a localised
    // tooltip + accessible label without any visible text.
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
      const v = t(el.dataset.i18nTitle);
      el.setAttribute("title", v);
      // Mirror the same value to aria-label so screen readers get the
      // localised name too (the static aria-label in the markup is
      // English-only, this keeps it in sync with the user's language).
      el.setAttribute("aria-label", v);
    });
    if ($("langSelect")) $("langSelect").value = state.lang;
    // Refresh dynamic tooltips
    $("td1sHealth")?.setAttribute("data-tooltip", t(state.td1sConnected ? "td1sDetected" : "td1sNotDetected"));
  }

  /* ── helpers ── */
  function v(val) { return (val === undefined || val === null || val === "" || val === "--") ? "-" : val; }
  function toHex(r, g, b) {
    if ([r,g,b].some(c => typeof c !== "number")) return null;
    const h = n => Math.max(0,Math.min(255,n|0)).toString(16).padStart(2,"0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  function timeAgo(secOrMs) {
    if (!secOrMs) return "-";
    const ms = secOrMs > 1e12 ? secOrMs : secOrMs * 1000;
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60)                    return t("agoNow");
    const m = Math.floor(s / 60);  if (m < 60)   return t("agoMin",   {n: m});
    const h = Math.floor(m / 60);  if (h < 24)   return t("agoHour",  {n: h});
    const d = Math.floor(h / 24);  if (d < 30)   return t("agoDay",   {n: d});
    const mo = Math.floor(d / 30); if (mo < 12)  return t("agoMonth", {n: mo});
    return t("agoYear", {n: Math.floor(mo / 12)});
  }
  function fmtTs(secOrMs) {
    if (!secOrMs) return "-";
    const ms = secOrMs > 1e12 ? secOrMs : secOrMs * 1000;
    const d = new Date(ms); return isNaN(d.getTime()) ? "-" : d.toLocaleString();
  }
  // TigerTag chip timestamps use epoch = Jan 1 2000 (946684800 s offset from Unix)
  const CHIP_EPOCH_OFFSET = 946684800;
  // "Now" as a TigerTag chip timestamp: SECONDS SINCE 2000-01-01 GMT — the
  // standard the chip + fmtChipTs use. Writing plain Unix seconds (since 1970)
  // here would over-shoot the decoded "Manufactured" date by ~30 years.
  function nowChipTs() {
    return Math.floor(Date.now() / 1000) - CHIP_EPOCH_OFFSET;
  }
  function fmtChipTs(ts) {
    if (!ts) return null;
    // Defensive: some Cloud docs were created with a plain Unix timestamp
    // (seconds since 1970) instead of the chip epoch (seconds since 2000).
    // A genuine chip timestamp stays well under ~1.4e9 (year 2044) for
    // decades, so a larger value is a misencoded Unix one → fold it back.
    if (ts > 1400000000) ts -= CHIP_EPOCH_OFFSET;
    const d = new Date((ts + CHIP_EPOCH_OFFSET) * 1000);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString();
  }
  function setLoading(btn, on) { if (!btn) return; btn.classList.toggle("loading", !!on); btn.disabled = !!on; }

  /* Press-and-hold "destructive action" pattern — replaces a confirm() popup.
     User must hold the button for `durationMs` ms; the inner .hold-progress
     fills left→right during the hold. Releasing early cancels & rolls back. */
  function setupHoldToConfirm(btn, durationMs, onConfirm) {
    if (!btn) return;
    const fill = btn.querySelector(".hold-progress");
    let timer = null;
    function start(e) {
      e.preventDefault();
      if (btn.disabled) return;
      btn.classList.add("is-holding");
      if (fill) {
        fill.style.transition = "width 0s";
        fill.style.width = "0%";
        // Force a reflow so the next transition takes effect from 0%
        // eslint-disable-next-line no-unused-expressions
        fill.offsetWidth;
        fill.style.transition = `width ${durationMs}ms linear`;
        fill.style.width = "100%";
      }
      timer = setTimeout(() => {
        timer = null;
        btn.classList.remove("is-holding");
        btn.classList.add("is-confirming");
        if (fill) { fill.style.width = "100%"; }
        try { onConfirm(); } finally {
          // Reset visual state shortly after — the modal usually closes anyway
          setTimeout(() => {
            btn.classList.remove("is-confirming");
            if (fill) { fill.style.transition = "width 0s"; fill.style.width = "0%"; }
          }, 300);
        }
      }, durationMs);
    }
    function cancel() {
      if (timer == null) return;
      clearTimeout(timer);
      timer = null;
      btn.classList.remove("is-holding");
      if (fill) {
        fill.style.transition = "width .15s ease-out";
        fill.style.width = "0%";
      }
    }
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup",     cancel);
    btn.addEventListener("pointerleave",  cancel);
    btn.addEventListener("pointercancel", cancel);
  }
  // toast(el, kind, msg, opts?) — opts.err + opts.context add a "Details" link that opens the diagnostic panel
  function toast(el, kind, msg, opts) {
    if (!el) return; el.innerHTML = "";
    const div = document.createElement("div"); div.className = `alert ${kind}`; div.textContent = msg;
    if (opts && opts.err) {
      const sep = document.createElement("span"); sep.textContent = " — "; sep.style.opacity = ".7"; div.appendChild(sep);
      const link = document.createElement("button");
      link.type = "button"; link.className = "alert-link";
      link.textContent = t("errDetailsLink");
      link.addEventListener("click", e => { e.preventDefault(); openDiagnosticModal(); });
      div.appendChild(link);
    }
    el.appendChild(div);
  }

  /* ── Error reporting / diagnostic system ───────────────────────────────────
     reportError(context, err) records errors in a circular buffer so users
     who hit a problem can copy a full diagnostic report and send it back. */
  const _errorLog = []; // [{ ts, context, code, message, stack }]
  const _ERR_LOG_MAX = 50;
  function reportError(context, err) {
    const entry = {
      ts: Date.now(),
      context: String(context || "unknown"),
      code: (err && (err.code || err.name)) || "",
      message: (err && err.message) || String(err),
      stack: (err && err.stack) || null,
    };
    _errorLog.unshift(entry);
    if (_errorLog.length > _ERR_LOG_MAX) _errorLog.length = _ERR_LOG_MAX;
    try { console.error(`[reportError] ${entry.context}`, err); } catch {}
    // Update badge in settings panel if mounted
    try { renderDiagBadge(); } catch {}
  }
  // Capture globally — anything that bubbles up unhandled lands in the report
  window.addEventListener("error", e => {
    reportError("window.error", e.error || { message: e.message, stack: `${e.filename}:${e.lineno}:${e.colno}` });
  });
  window.addEventListener("unhandledrejection", e => {
    reportError("unhandledrejection", e.reason || { message: String(e) });
  });

  // App / platform info — fetched once via the preload bridge (Electron) or stubbed (browser)
  let _appInfo = null;
  async function loadAppInfo() {
    if (_appInfo) return _appInfo;
    try {
      if (window.electronAPI && window.electronAPI.getAppInfo) {
        _appInfo = await window.electronAPI.getAppInfo();
      }
    } catch {}
    if (!_appInfo) _appInfo = { appVersion: "?", platform: navigator.platform || "?", electron: "n/a" };
    renderAppVersion(_appInfo);
    return _appInfo;
  }

  // Populate the sidebar footer version + the Settings → About block.
  function renderAppVersion(info) {
    const v = info?.appVersion || "?";
    const sb = document.getElementById("sbVersion");
    if (sb) sb.textContent = `v${v}`;
    const sv = document.getElementById("stgAboutVersion");
    if (sv) sv.textContent = `v${v}`;
    const st = document.getElementById("stgAboutTech");
    if (st) {
      const parts = [];
      if (info?.platform) parts.push(`${info.platform}${info.arch ? " " + info.arch : ""}`);
      if (info?.electron && info.electron !== "n/a") parts.push(`Electron ${info.electron}`);
      st.textContent = parts.join(" · ") || "—";
    }
  }

  function renderDiagBadge() {
    const el = document.getElementById("btnReportProblem");
    const elLogin = document.getElementById("btnReportProblemLogin");
    const n = _errorLog.length;
    [el, elLogin].forEach(b => {
      if (!b) return;
      let badge = b.querySelector(".diag-badge");
      if (n > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "diag-badge";
          b.appendChild(badge);
        }
        badge.textContent = String(n);
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function buildDiagnosticReport() {
    const info = _appInfo || {};
    const acc = (function(){ try { return JSON.parse(localStorage.getItem("tigertag.accounts") || "[]"); } catch { return []; } })();
    const lines = [];
    lines.push("# Tiger Studio Manager — diagnostic report");
    lines.push("");
    lines.push(`- Generated: ${new Date().toISOString()}`);
    lines.push(`- App version: ${info.appVersion || "?"}`);
    lines.push(`- Electron: ${info.electron || "n/a"}  ·  Chrome: ${info.chrome || "n/a"}  ·  Node: ${info.node || "n/a"}`);
    lines.push(`- Platform: ${info.platform || navigator.platform || "?"} ${info.arch || ""}  (${info.osRelease || ""})`);
    lines.push(`- Locale: ${state.lang}  ·  UA: ${navigator.userAgent}`);
    lines.push(`- Accounts (local): ${acc.length}  ·  Active: ${state.activeAccountId ? state.activeAccountId.slice(0,6)+"…" : "none"}`);
    lines.push(`- Online: ${navigator.onLine ? "yes" : "no"}`);
    lines.push("");
    lines.push(`## Errors captured (${_errorLog.length})`);
    if (!_errorLog.length) { lines.push("_(none)_"); }
    else {
      _errorLog.forEach((e, i) => {
        lines.push("");
        lines.push(`### ${i+1}. [${new Date(e.ts).toISOString()}] ${e.context}${e.code ? " · " + e.code : ""}`);
        lines.push("```");
        lines.push(e.message || "(no message)");
        if (e.stack) { lines.push(""); lines.push(e.stack); }
        lines.push("```");
      });
    }
    return lines.join("\n");
  }

  function openDiagnosticModal() {
    loadAppInfo().then(() => {
      const overlay = document.getElementById("diagModalOverlay");
      if (!overlay) return;
      const body = document.getElementById("diagBody");
      if (body) body.value = buildDiagnosticReport();
      overlay.classList.add("open");
    });
  }
  function closeDiagnosticModal() {
    const overlay = document.getElementById("diagModalOverlay");
    if (overlay) overlay.classList.remove("open");
  }
  // Expose for inline handlers / external use
  window.openDiagnosticModal = openDiagnosticModal;
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  }
  function highlight(json) {
    if (typeof json !== "string") json = JSON.stringify(json, null, 2);
    json = esc(json);
    return json.replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, m => {
      let c = "n";
      if (/^"/.test(m)) c = /:$/.test(m) ? "k" : "s";
      else if (/true|false|null/.test(m)) c = "b";
      return `<span class="${c}">${m}</span>`;
    });
  }
  function debug(meta, body) { $("debugMeta").textContent = meta; $("debugBody").innerHTML = highlight(body); }
  async function apiFetch(url, opts = {}) {
    const t0 = performance.now(); let res, text, body;
    try { res = await fetch(url, opts); text = await res.text(); }
    catch (e) { debug(`${opts.method||"GET"} ${url}\n${e.message}`, {error: String(e)}); throw e; }
    try { body = JSON.parse(text); } catch { body = text; }
    debug(`${opts.method||"GET"} ${url}\n→ ${res.status} ${res.statusText}  ·  ${Math.round(performance.now()-t0)} ms`, body);
    return { ok: res.ok, status: res.status, body };
  }

  /* ── lookups ── */
  async function loadLocales() {
    await Promise.all(["en", "fr", "de", "es", "it", "zh", "pt", "pt-pt", "pl"].map(async lang => {
      try {
        const r = await fetch(`locales/${lang}.json`);
        if (r.ok) state.i18n[lang] = await r.json();
      } catch {}
    }));
  }

  async function loadLookups() {
    // 1. Try IPC (main process — userData/db/tigertag/ → assets/db/tigertag/ fallback)
    let ipcOk = false;
    try {
      const lookups = await window.electronAPI?.db?.getLookups?.();
      if (lookups && Object.values(lookups).some(v => Array.isArray(v) && v.length > 0)) {
        Object.assign(state.db, lookups);
        ipcOk = true;
      }
    } catch (e) {
      console.warn('[loadLookups] IPC failed:', e);
    }

    // 2. Fallback: fetch directly from the embedded assets (always present on disk)
    if (!ipcOk) {
      console.warn('[loadLookups] falling back to direct fetch from assets/db/tigertag/');
      const files = [
        ["id_brand.json",        "brand"],
        ["id_material.json",     "material"],
        ["id_aspect.json",       "aspect"],
        ["id_type.json",         "type"],
        ["id_diameter.json",     "diameter"],
        ["id_measure_unit.json", "unit"],
        ["id_version.json",      "version"],
      ];
      await Promise.all(files.map(async ([f, key]) => {
        try {
          const r = await fetch(`../assets/db/tigertag/${f}`);
          if (r.ok) state.db[key] = await r.json();
        } catch {}
      }));
    }

    try {
      const r = await fetch('../data/container_spool/spools_filament.json');
      if (r.ok) state.db.containers = await r.json();
    } catch {}
    try {
      const r = await fetch('../data/rack-presets.json');
      if (r.ok) state.rackPresets = await r.json();
    } catch {}
    // Printer model catalogs — one per brand, keyed by the same brand id
    // we use in Firestore (`bambulab`, `creality`, `elegoo`, `flashforge`,
    // `snapmaker`). The `printerModelId` field on each printer doc matches
    // either the `id` (preferred) or the `name` of one of these entries.
    try {
      const printerCatalogs = [
        ["bambulab",   "../data/printers/bbl_printer_models.json"],
        ["creality",   "../data/printers/cre_printer_models.json"],
        ["elegoo",     "../data/printers/eleg_printer_models.json"],
        ["flashforge", "../data/printers/ffg_printer_models.json"],
        ["snapmaker",  "../data/printers/snap_printer_models.json"],
        ["anycubic",   "../data/printers/acu_printer_models.json"]
      ];
      state.db.printerModels = {};
      await Promise.all(printerCatalogs.map(async ([brand, url]) => {
        try {
          const r = await fetch(url);
          if (r.ok) state.db.printerModels[brand] = await r.json();
          else state.db.printerModels[brand] = [];
        } catch { state.db.printerModels[brand] = []; }
      }));
    } catch {}
    // Renderer path — needed to build the file:// preload URL for the Creality
    // camera <webview>. Fetched once here so renderPrinterDetail() can use it
    // synchronously when building the webview HTML string.
    if (window.electronAPI?.getRendererPath) {
      try { state.rendererPath = await window.electronAPI.getRendererPath(); } catch {}
    }
  }

  /* ── Printer model lookup ──────────────────────────────────────────────
     Resolve a Firestore `printerModelId` against the local brand catalog
     so we can show the human-readable model name + the photo. The catalog
     `id` is the canonical key, but we accept `name` as a fallback because
     the data-model spec leaves both shapes valid.                          */
  function findPrinterModel(brand, modelId) {
    if (!modelId) return null;
    const list = state.db.printerModels?.[brand] || [];
    const wanted = String(modelId).trim();
    const wantedLower = wanted.toLowerCase();
    return list.find(m => String(m.id) === wanted)
        || list.find(m => String(m.name || "").toLowerCase() === wantedLower)
        || null;
  }
  // Catalog paths use "assets/images/<brand>_printers/<file>.png" but the
  // actual folder on disk is "assets/img/...". This mapper bridges that
  // gap. Renderer paths are relative to renderer/inventory.html so we
  // prepend "../" for the file:// fetch.
  function printerImageUrl(model) {
    if (!model || !model.image) return null;
    return "../" + String(model.image).replace(/^assets\/images\//, "assets/img/");
  }
  function printerImageUrlFor(brand, modelId) {
    const m = findPrinterModel(brand, modelId);
    return printerImageUrl(m);
  }
  function printerModelName(brand, modelId) {
    const m = findPrinterModel(brand, modelId);
    return m ? m.name : (modelId || "—");
  }
  function printerModelFeatures(brand, modelId) {
    const m = findPrinterModel(brand, modelId);
    return Array.isArray(m?.features) ? m.features.filter(f => f && f !== "No") : [];
  }
  function dbFind(key, id) { return state.db[key].find(x => x.id === id) || null; }
  function containerFind(id) { return (state.db.containers || []).find(c => c.id === id) || null; }
  function brandName(id) { const b = dbFind("brand", id); return b ? b.name : "-"; }
  function materialLabel(id) { const m = dbFind("material", id); return m ? m.label : "-"; }
  function aspectLabel(id) { const a = dbFind("aspect", id); return a ? a.label : null; }
  function diamLabel(id) { const d = dbFind("diameter", id); return d ? d.label + " mm" : null; }
  function versionName(id) { const vv = dbFind("version", id); return vv ? vv.name : null; }
  function materialFull(id) { return dbFind("material", id); }
  function typeName(id) { const tp = dbFind("type", id); return tp ? tp.label : null; }

  /* ── Firestore Timestamp → epoch ms (accepts number, Timestamp, or {_seconds}) ── */
  function tsToMs(v) {
    if (!v) return null;
    if (typeof v === "number") return v > 1e12 ? v : v * 1000;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (v._seconds != null) return v._seconds * 1000;
    return null;
  }

  /* ── normalize ── */
  function normalizeRow(spoolId, data) {
    const hex  = toHex(data.color_r,  data.color_g,  data.color_b);
    const hex2 = toHex(data.color_r2, data.color_g2, data.color_b2);
    const hex3 = toHex(data.color_r3, data.color_g3, data.color_b3);
    // isPlus = true when the chip type is TigerTag+ (id_tigertag resolves to
    // a version whose name is "TigerTag+"). The old url_img heuristic was
    // unreliable — the chip type is the authoritative source.
    const isPlus = versionName(data.id_tigertag) === "TigerTag+";
    // Cloud-only entry: doc id starts with `CLOUD_` (the prefix written by
    // _adpCloudId() in the Add Product flow). When the user later programs
    // a physical chip, the doc gets renamed to a real 7-byte hex UID and
    // this flag flips to false automatically — no extra signal needed.
    const isCloud = String(spoolId).startsWith("CLOUD_");
    const mat = materialFull(data.id_material);
    return {
      spoolId: String(spoolId),
      uid: data.uid != null ? String(data.uid) : String(spoolId),
      material: mat ? mat.label : (data.material || data.series || "-"),
      materialData: mat,
      brand: brandName(data.id_brand),
      colorName: data.color_name || data.name || data.message || "-",
      colorHex: hex,
      colorHex2: hex2,
      colorHex3: hex3,
      colorList: Array.isArray(data.online_color_list) ? data.online_color_list : [],
      colorType: data.online_color_type || null,
      aspect1: aspectLabel(data.id_aspect1),
      aspect2: aspectLabel(data.id_aspect2),
      diameter: diamLabel(data.data1),
      tagType: versionName(data.id_tigertag),
      // Protocol / version shown in the filter bar and detail panel.
      // Cloud spools carry a random id_tigertag so we derive the label
      // from the spoolId prefix instead of the version table.
      protocol: isCloud ? "TigerCloud" : (versionName(data.id_tigertag) || null),
      weightAvailable: data.weight_available,
      containerWeight: data.container_weight,
      capacity: data.measure_gr || data.measure,
      imgUrl: data.url_img && data.url_img !== "--" && data.url_img !== "" ? data.url_img : null,
      userImg: !!data.url_img_user,
      isPlus,
      isCloud,
      series: data.series || null,
      label: data.label && data.label !== "--" ? data.label : null,
      productName: data.name && data.name !== "--" ? data.name : null,
      sku: data.sku && data.sku !== "--" ? data.sku : null,
      barcode: data.barcode && data.barcode !== "--" ? data.barcode : null,
      isRefill:   !!data.info1,
      isRecycled: !!data.info2,
      isFilled:   !!data.info3,
      temps: {
        nozzleMin: data.data2 || null,
        nozzleMax: data.data3 || null,
        dryTemp:   data.data4 || null,
        dryTime:   data.data5 || null,
        bedMin:    data.data6 || null,
        bedMax:    data.data7 || null,
      },
      links: {
        youtube: data.LinkYoutube && data.LinkYoutube !== "--" ? data.LinkYoutube : null,
        msds:    data.LinkMSDS    && data.LinkMSDS    !== "--" ? data.LinkMSDS    : null,
        tds:     data.LinkTDS     && data.LinkTDS     !== "--" ? data.LinkTDS     : null,
        rohs:    data.LinkROHS    && data.LinkROHS    !== "--" ? data.LinkROHS    : null,
        reach:   data.LinkREACH   && data.LinkREACH   !== "--" ? data.LinkREACH   : null,
        food:    data.LinkFOOD    && data.LinkFOOD    !== "--" ? data.LinkFOOD    : null,
      },
      td: data.TD != null ? data.TD : null,
      twinUid: data.twin_tag_uid || null,
      containerId: data.container_id || null,
      // Storage location — new shape is `rack: { id, level, position }`,
      // legacy docs still have flat `rack_id` / `level` / `position`. We
      // read both so the migration window doesn't blank-out placements.
      rackId:    (data.rack && typeof data.rack === "object" && data.rack.id) || data.rack_id || null,
      rackLevel: (data.rack && Number.isInteger(data.rack.level))    ? data.rack.level
               : (Number.isInteger(data.level)    ? data.level    : null),
      rackPos:   (data.rack && Number.isInteger(data.rack.position)) ? data.rack.position
               : (Number.isInteger(data.position) ? data.position : null),
      lastUpdate: tsToMs(data.updatedAt) || tsToMs(data.last_update) || tsToMs(data.updated_at),
      // Only `deleted === true` counts as a tombstone (matches Flutter mobile
       // semantics). `deleted_at` alone is treated as historical metadata and
       // does NOT hide the spool.
      deleted: data.deleted === true,
      productType: typeName(data.id_type),
      chipTimestamp: data.timestamp || null,
      needUpdateAt: isCloud ? null : (data.needUpdateAt || null),
      raw: data,
    };
  }

  /* ── health (driven by Firestore metadata) ── */
  function setHealthLive(ms)  {
    $("health").classList.add("ok"); $("health").classList.remove("bad");
    $("health").dataset.tooltip = ms != null ? `${t("backendOk")} — ${ms} ms` : t("backendOk");
  }
  function setHealthOffline() { $("health").classList.remove("ok"); $("health").classList.add("bad");    $("health").dataset.tooltip = t("backendOffline"); }
  function setHealthIdle()    { $("health").classList.remove("ok","bad");                                $("health").dataset.tooltip = t("backendIdle"); }

  // Lazy ping: only fires when user hovers the cloud icon
  let _pingInFlight = false;
  $("health").addEventListener("mouseenter", async () => {
    if (_pingInFlight) return;
    _pingInFlight = true;
    try {
      const t0 = performance.now();
      const r  = await fetch(`${API_BASE}/healthz/`);
      const ms = Math.round(performance.now() - t0);
      if (r.ok) setHealthLive(ms);
      else { $("health").classList.add("bad"); $("health").classList.remove("ok"); $("health").dataset.tooltip = `${t("backendErr", {n: r.status})} — ${ms} ms`; }
    } catch {
      setHealthOffline();
    } finally {
      _pingInFlight = false;
    }
  });

  /* ── Display-name helpers ── */
  // Returns name if set, otherwise the part before @ in email (never shows a
  // raw email address or "—" to the user — everyone has an email).
  // Returns a human-friendly display name — never a raw email address.
  // If name is already an email (stored as fallback), trims it to the prefix.
  function _shortName(name, email) {
    if (name) return name.includes("@") ? name.split("@")[0] : name;
    if (email) return email.split("@")[0];
    return "—";
  }

  /* ── connected state ── */
  function setConnected(displayName, email) {
    state.displayName = displayName; // raw value — empty if not yet chosen by user
    const shown = _shortName(displayName, email);
    // One-time migration: older builds of onAuthStateChanged
    // overwrote acc.photoURL with Firebase Auth's `user.photoURL`
    // (the Google profile-picture CDN URL on lh3.googleusercontent.com),
    // clobbering any custom Firebase Storage avatar the user had
    // uploaded. The visible symptom was a Google-generated "B-on-
    // violet-circle" placeholder in the sidebar avatar. Clear that
    // legacy URL here so syncUserDoc can re-hydrate from
    // userProfiles.photoURL with the correct value.
    {
      const accs = getAccounts();
      let dirty = false;
      for (const a of accs) {
        if (a.photoURL && /(googleusercontent\.com|googleapis\.com\/.*\/google)/i.test(a.photoURL)) {
          a.photoURL = null;
          dirty = true;
        }
      }
      if (dirty) saveAccounts(accs);
    }
    // Hydrate state.photoURL synchronously from the cached Account
    // BEFORE the first paint, so the very first render shows the
    // avatar (not initials → flicker → avatar). This matches the
    // Discord pattern: the URL is already in localStorage from the
    // previous session, browser image cache holds the pixels, paint
    // is instant. syncUserDoc still refreshes from userProfiles in
    // the background to catch any change, but does nothing visible
    // if the URL didn't move.
    state.photoURL = activeAccount()?.photoURL || null;
    // Same Discord-style hydration for the friends list — the cached
    // entries (name + colour + photoURL) drive the first render of
    // the dropdown / sidebar friend chips; loadFriendsList runs
    // afterwards and pushes the live delta.
    _hydrateFriendsCache(state.activeAccountId);
    $("sbWelcome").textContent = t("welcomeBack");
    $("sbName").textContent = shown;
    $("sbUser").classList.remove("sb-user--empty");
    // Single source-of-truth paint — gradient, initials (STRICT from
    // displayName, never email), and photo overlay all applied
    // atomically. No more textContent-then-applyAvatarStyle dance
    // that could leak the wrong state between calls.
    paintAvatar($("sbAvatar"), activeAccount());
    // Render the top-header chip (own user variant — avatar + display name
    // + random welcome greeting) so the chip appears immediately on connect.
    renderFriendBanner();
    // Paint the sidebar friend chips from the hydrated cache RIGHT NOW, so
    // the friends list is on screen in the first frame instead of popping
    // in after loadFriendsList()'s Firestore round-trip. The live fetch
    // re-renders the delta afterwards.
    renderSidebarFriends();
    $("signInPlaceholder").classList.add("hidden");
    $("card-inv").classList.add("hidden");
    $("card-welcome").classList.add("hidden");
    state.invLoading = true;
    renderInventory(); // show spinner immediately, before first Firestore snapshot
  }
  function setDisconnected() {
    state.displayName = null; state.keyValid = null;
    state.photoURL = null;  // clear custom avatar → sign-in placeholder shows
    // Single source-of-truth paint of the EMPTY state: passing `null`
    // resolves to data-av-mode="empty" → the "+" glyph, neutral gradient,
    // no shadow, photo stripped — all via the central pipeline + CSS.
    paintAvatar($("sbAvatar"), null);
    $("sbUser").classList.add("sb-user--empty");
    $("sbStats").classList.add("hidden");
    // Hide the top-header user/friend chip when not signed in.
    $("friendViewBanner")?.classList.add("hidden");
    // Reset migration consent flags so the next sign-in / account switch
    // re-prompts the user. We deliberately do NOT clear the localStorage
    // snooze — that's a per-machine, time-bounded preference that should
    // outlive a sign-out.
    _uidMigrationUserAccepted = false;
    _uidMigrationDeferredThisSession = false;
    _uidMigrationInitialSweepDone = false;
    // Same reset for the rack-shape migration so its consent prompt
    // re-fires on the next sign-in.
    _rackMigrationUserAccepted = false;
    _rackMigrationDeferredThisSession = false;
    _rackMigrationInitialSweepDone = false;
    _rackMigrationQueue = [];
    _rackMigrationStats = { migrated: 0, failed: 0 };
    $("signInPlaceholder").classList.remove("hidden");
    $("card-inv").classList.add("hidden");
    $("card-welcome").classList.add("hidden");
    state.invLoading = false;
    setHealthIdle();
  }
  /* ── account dropdown ── */
  function openAccountDropdown() {
    renderAccountDropdown();
    const dropdown  = $("acctDropdown");
    const sidebar   = document.querySelector(".sidebar");
    const rect      = $("sbAvatar").getBoundingClientRect();
    dropdown.classList.add("dropdown-fixed");
    // toujours collé au bord droit du sidebar, aligné sur l'avatar
    const sbRect = sidebar ? sidebar.getBoundingClientRect() : rect;
    dropdown.style.left = (sbRect.right + 8) + "px";
    dropdown.style.top  = rect.top + "px";
    dropdown.classList.add("open");
    $("sbAvatar").style.opacity = ".8";
    setTimeout(() => document.addEventListener("click", _dropOutside), 0);
  }
  function closeAccountDropdown() {
    const dropdown = $("acctDropdown");
    dropdown.classList.remove("open", "dropdown-fixed");
    dropdown.style.left = "";
    dropdown.style.top  = "";
    $("sbAvatar").style.opacity = "";
    document.removeEventListener("click", _dropOutside);
  }
  function _dropOutside(e) {
    if (!$("acctDropdown").contains(e.target) && e.target !== $("sbAvatar")) closeAccountDropdown();
  }
  function renderAccountDropdown() {
    // Mirror the friend list to the sidebar quick-access chips on every
    // dropdown re-render — same data, just a second presentation.
    renderSidebarFriends();
    const accounts = getAccounts();
    const activeId = state.activeAccountId;
    const list = $("acctDropdownList");

    // ── Connected accounts ──
    let html = accounts.map(acc => `
      <button class="acct-drop-item${acc.id===activeId?' active':''}" data-drop-id="${esc(acc.id)}">
        ${avatarMarkup(acc, "acct-drop-avatar")}
        <span class="acct-drop-name">${esc(_shortName(acc.displayName, acc.email))}</span>
        ${acc.id===activeId ? '<span class="acct-drop-check">✓</span>' : ''}
      </button>`).join("");

    // ── Manage profiles action — right under connected accounts ──
    html += `<div class="acct-drop-sep"></div>
      <button class="acct-drop-action" data-drop-action="manage-profiles">
        <span class="icon icon-user icon-13"></span>
        <span>${t("btnManageProfiles")}</span>
      </button>
      <button class="acct-drop-action" data-drop-action="open-settings">
        <span class="icon icon-settings icon-13"></span>
        <span>${t("settingsOpenBtn")}</span>
      </button>`;

    // ── Friends section ──
    if (state.friends && state.friends.length) {
      html += `<div class="acct-drop-sep"></div>
        <div class="acct-drop-section-label">${t("friendsList")}</div>`;
      html += state.friends.map(f => {
        const initials = (f.displayName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
        const color = friendColor(f);
        const fg = readableTextOn(color);
        const isActive = state.friendView?.uid === f.uid;
        return `<button class="acct-drop-item${isActive ? ' acct-drop-friend-active' : ''}" data-drop-friend-uid="${esc(f.uid)}" data-drop-friend-name="${esc(_shortName(f.displayName, f.uid))}" data-drop-friend-color="${esc(color)}">
          ${avatarMarkup(f, "acct-drop-avatar")}
          <span class="acct-drop-name">${esc(_shortName(f.displayName, f.uid))}</span>
          ${isActive ? '<span class="acct-drop-check">✓</span>' : '<span class="acct-drop-eye"><span class="icon icon-eye-on icon-11"></span></span>'}
        </button>`;
      }).join("");
    }

    // ── Add friend action — always visible at the bottom ──
    html += `<div class="acct-drop-sep"></div>
      <button class="acct-drop-action" data-drop-action="add-friend">
        <span class="icon icon-plus icon-13"></span>
        <span>${t("friendsAdd")}</span>
      </button>`;

    list.innerHTML = html;

    list.querySelectorAll("[data-drop-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.dropId;
        closeAccountDropdown();
        if (id !== activeId) {
          switchAccountUI(id);
        } else if (state.friendView) {
          // Clicking the already-active account while viewing a friend's stock
          // → exit friend-view and return to own inventory.
          switchBackToOwnView();
        }
      });
    });
    list.querySelectorAll("[data-drop-friend-uid]").forEach(btn => {
      btn.addEventListener("click", () => {
        closeAccountDropdown();
        switchToFriendView(btn.dataset.dropFriendUid, btn.dataset.dropFriendName, btn.dataset.dropFriendColor);
      });
    });
    list.querySelectorAll("[data-drop-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.dropAction;
        closeAccountDropdown();
        if (action === "manage-profiles") openProfilesModal();
        else if (action === "open-settings") openSettings();
        else if (action === "add-friend") openAddFriendModal();
      });
    });
  }

  /* ── profiles modal ── */
  function openProfilesModal() {
    closeAccountDropdown();
    renderAccountList();
    $("profilesModalOverlay").classList.add("open");
    // Refresh friends list so the friends section stays up-to-date
    loadFriendsList().then(() => renderAccountList());
  }
  function closeProfilesModal() {
    $("profilesModalOverlay").classList.remove("open");
  }

  /* ══════════════════════════════════════════════════════════════════
     Add Product side panel — full TigerTag creator
     ══════════════════════════════════════════════════════════════════
     Slide-in side card (right) mirroring the printer detail panel.
     Builds an inventory entry with the SAME field shape a real RFID
     chip carries: id_brand / id_material / id_type / id_aspect1+2 /
     id_diameter / id_measure_unit / measure_gr / data1..7 (legacy
     bag of int slots used by the firmware mapper) / color_r/g/b /
     online_color_list / TD / message / weight_available.

     Until a physical chip is programmed the doc id uses
     `CLOUD_<HEX_TIMESTAMP>` so:
       1. The underscore makes it impossible to confuse with a real
          7-byte hex RFID UID (the rest of the app expects pure hex)
       2. The `CLOUD_` prefix is self-documenting: this entry is in
          Firestore only, not on a chip yet
       3. When the user later programs a chip, a single uidMigrationMap
          rename (CLOUD_xxx → 1D895E7C004A80) promotes the doc with
          its full content — same pattern as the legacy decimal→hex
          migration that already ships in this app.

     Auto-prefills nozzle / bed / dry temps from the chosen material's
     `recommended` block in id_material.json, so the user gets sensible
     defaults without consulting a datasheet — mirrors what the mobile
     companion app does.                                                */

  // Cloud-only doc id — `CLOUD_` prefix + 10 random decimal digits
  // (per the canonical schema spec). The 10-digit nonce gives ~10^10
  // unique ids per second of clock; combined with `CLOUD_` it's
  // impossible to confuse with a real 7-byte hex RFID UID.
  function _adpCloudId() {
    let n = "";
    for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10);
    return "CLOUD_" + n;
  }

  // Weight unit conversion — always returns grams regardless of the
  // unit the user picked. Reads `state.db.unit` to resolve the label
  // (mg / g / kg) and applies the matching factor. Used by save +
  // preview so `measure_gr` and `weight_available` are guaranteed
  // canonical (grams) regardless of UI input.
  function _adpToGrams(value, unitId) {
    if (!isFinite(value)) return null;
    const unit = (state.db.unit || []).find(u => u.id === unitId);
    const lbl = String(unit?.label || "g").toLowerCase().trim();
    switch (lbl) {
      case "mg": return value / 1000;
      case "kg": return value * 1000;
      case "g":
      default:   return value;
    }
  }

  function _adpHexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
    if (!m) return { r: 128, g: 128, b: 128 };
    return {
      r: parseInt(m[1], 16),
      g: parseInt(m[2], 16),
      b: parseInt(m[3], 16)
    };
  }

  // Best-effort label lookups — return "" when the id isn't found so
  // the RFID Data preview just shows the id rather than crashing.
  function _adpLabel(category, id) {
    const list = state.db?.[category] || [];
    const e = list.find(x => x.id === id);
    return e ? (e.label || e.name || "") : "";
  }

  // Render the 24-preset palette (+ custom slot) into the colour
  // bottom-sheet grid. Mirrors the layout used by Snapmaker / FlashForge
  // filament-edit colour sheets so the visual grammar is uniform. The
  // host is `#adpColorGrid` inside `.sfe-sheet--color` — `.sfe-color-*`
  // styles already apply, no extra CSS needed.
  function _adpRenderColorPresets(selectedHex) {
    const host = $("adpColorGrid");
    if (!host) return;
    const sel = String(selectedHex || "").toUpperCase();
    // Fallback for the custom slot when nothing is set yet — same
    // default the OS picker opens on (orange-red, easy to spot).
    const customBg = sel || "#FF5722";
    const cells = SNAP_FIL_COLOR_PRESETS.map(c => {
      const isSel = c.toUpperCase() === sel;
      return `<button type="button"
                       class="sfe-color-cell${isSel ? " is-selected" : ""}"
                       data-color="${c}"
                       style="background:${c}"
                       title="${c}"></button>`;
    });
    // Custom slot — last cell of the grid. Paints its background with
    // the currently-selected hex so the user sees which colour the
    // picker will reopen on; the edit pencil sits on top to advertise
    // "click here to tweak" (cf. .sfe-sheet--color.adp-color-sheet
    // .sfe-color-cell--custom .icon for the legibility halo).
    cells.push(`<button type="button"
                         class="sfe-color-cell sfe-color-cell--custom"
                         data-color-custom="1"
                         style="background:${customBg}"
                         title="${esc(t("addProductColorCustom"))}">
                  <span class="icon icon-edit icon-13"></span>
                </button>`);
    host.innerHTML = cells.join("");
  }

  // Sync the colour bottom-sheet AND its backdrop's width to the Add
  // product panel so the two surfaces read as one cohesive UI block.
  // The panel itself either uses the user-resized width
  // (`tigertag.panelWidth.detail`) or the CSS default (300 px) — we
  // read whichever ended up applied and stamp it inline.
  // The backdrop stops at the panel's left edge so the rest of the
  // viewport (the inventory grid behind) keeps the panel-overlay's
  // normal dim — and clicks there go through to the panel-overlay
  // handler, which cascades the close.
  function _adpSyncColorSheetWidth(sheetId, backdropId) {
    const sheet = $(sheetId);
    const panel = $("addProductPanel");
    if (!sheet || !panel) return;
    const w = Math.round(panel.getBoundingClientRect().width);
    if (w >= 200) sheet.style.width = w + "px";
    if (backdropId) {
      const bd = $(backdropId);
      if (bd && w >= 200) bd.style.width = w + "px";
    }
  }
  function openAdpColorSheet() {
    // Sync count selector state
    $("adpColorCountRow")?.querySelectorAll(".adp-color-count-btn").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.mode === _adpColorMode);
    });
    _adpRenderSlotRow();
    _adpRenderColorPresets(_adpColorSlots[_adpActiveSlot]);
    _adpSyncColorSheetWidth("adpColorSheet", "adpColorBackdrop");
    $("adpColorSheet")?.classList.add("open");
    $("adpColorSheet")?.setAttribute("aria-hidden", "false");
    $("adpColorBackdrop")?.classList.add("open");
  }
  function closeAdpColorSheet() {
    $("adpColorSheet")?.classList.remove("open");
    $("adpColorSheet")?.setAttribute("aria-hidden", "true");
    $("adpColorBackdrop")?.classList.remove("open");
  }

  // ── Custom colour bottom-sheet ─────────────────────────────────
  // Mobile-style HSV picker: 2D saturation × value rectangle on top,
  // hue slider + preview circle in the middle, hex input at the top
  // with a paste-from-clipboard affordance. Drives a single piece of
  // state — `_adpCcState = { h, s, v }` — that every input writes
  // into and every visual reads from. `_adpCcRender()` is the single
  // redraw entry point so we never desync the SV thumb, hue thumb,
  // hex input, preview circle and the SV gradient hue.
  const _adpCcState = { h: 0, s: 1, v: 1 };

  // ─ Colour-space helpers (no library — hot path, keep tight) ─
  // hex "#RRGGBB" / "RRGGBB" → {r,g,b} 0..255 or null on parse error.
  function _adpCcParseHex(raw) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(raw || "").trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function _adpCcRgbToHex(r, g, b) {
    const c = (n) => Math.max(0, Math.min(255, Math.round(n)))
      .toString(16).padStart(2, "0").toUpperCase();
    return "#" + c(r) + c(g) + c(b);
  }
  function _adpCcRgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r: h = ((g - b) / d) % 6; break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
  }
  function _adpCcHsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if      (h <  60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  // Pure-hue hex (S=1, V=1) — used for the hue thumb's fill colour.
  function _adpCcHueHex(h) {
    const { r, g, b } = _adpCcHsvToRgb(h, 1, 1);
    return _adpCcRgbToHex(r, g, b);
  }

  // Single redraw — reads `_adpCcState` and updates: hex input,
  // native bridge, preview circle, SV background hue, SV thumb
  // position, hue slider thumb position + colour. The hex input
  // skips its own writeback if `skipHexInput` is set (e.g. when
  // the user is currently typing — we don't want to overwrite
  // their cursor mid-keystroke).
  function _adpCcRender(opts) {
    const { h, s, v } = _adpCcState;
    const { r, g, b } = _adpCcHsvToRgb(h, s, v);
    const hex = _adpCcRgbToHex(r, g, b);

    const sv = $("adpCcSv");
    if (sv) sv.style.setProperty("--cc-hue", String(Math.round(h)));

    const svThumb = $("adpCcSvThumb");
    if (svThumb) {
      svThumb.style.left = (s * 100) + "%";
      svThumb.style.top  = ((1 - v) * 100) + "%";
    }

    const hueThumb = $("adpCcHueThumb");
    if (hueThumb) {
      hueThumb.style.left = ((h / 360) * 100) + "%";
      hueThumb.style.setProperty("--cc-hue-thumb", _adpCcHueHex(h));
    }

    const prev = $("adpCcPreview");
    if (prev) prev.style.background = hex;

    const native = $("adpCcNative");
    if (native) native.value = hex;

    // Live preview on the main panel — paint the big colour circle
    // (`#adpColorSquare`) as the user drags so they see the change
    // happen in real time without committing yet. The full sync
    // (preset re-render + RFID preview refresh + hidden hex input)
    // still runs only on OK click via `_adpSyncColor`.
    const panelCircle = $("adpColorSquare");
    if (panelCircle) panelCircle.style.background = hex;

    if (!opts || !opts.skipHexInput) {
      const inp = $("adpCcHex");
      // Display value drops the leading `#` — the visual prefix
      // already shows the hash so the input only needs the digits.
      if (inp) inp.value = hex.slice(1);
    }
  }

  // Seed the picker state from a hex string (called when the sheet
  // opens or when the user pastes / types a complete hex value).
  // Preserves the current hue when the input is greyscale (S=0)
  // so a "back to white" round trip doesn't reset the rainbow.
  function _adpCcSetFromHex(hex, opts) {
    const rgb = _adpCcParseHex(hex);
    if (!rgb) return false;
    const { h, s, v } = _adpCcRgbToHsv(rgb.r, rgb.g, rgb.b);
    if (s > 0) _adpCcState.h = h;     // keep last hue when achromatic
    _adpCcState.s = s;
    _adpCcState.v = v;
    _adpCcRender(opts);
    return true;
  }

  function openAdpColorCustomSheet() {
    const hex = String($("adpColorHex")?.value || "#FF5722").toUpperCase();
    _adpCcSetFromHex(hex);
    _adpSyncColorSheetWidth("adpColorCustomSheet", "adpColorCustomBackdrop");
    $("adpColorCustomSheet")?.classList.add("open");
    $("adpColorCustomSheet")?.setAttribute("aria-hidden", "false");
    $("adpColorCustomBackdrop")?.classList.add("open");
    // Re-render after the sheet is visible so the SV thumb's
    // percentage-based positioning resolves against the final
    // rectangle width (not the off-screen 0×0 one).
    requestAnimationFrame(_adpCcRender);
  }
  function closeAdpColorCustomSheet() {
    $("adpColorCustomSheet")?.classList.remove("open");
    $("adpColorCustomSheet")?.setAttribute("aria-hidden", "true");
    $("adpColorCustomBackdrop")?.classList.remove("open");
  }

  // Pointer-driven drag for both the SV rectangle and the hue slider.
  // `onMove(fractionX, fractionY)` receives normalised coords in
  // [0..1] for each axis — the caller maps them to S/V or hue and
  // calls `_adpCcRender()`. Captures the pointer so dragging outside
  // the element keeps tracking until release.
  function _adpCcAttachDrag(el, onMove) {
    if (!el) return;
    const handle = (ev) => {
      const rect = el.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const fy = Math.max(0, Math.min(1, (ev.clientY - rect.top)  / rect.height));
      onMove(fx, fy);
    };
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      el.setPointerCapture(ev.pointerId);
      handle(ev);
    });
    el.addEventListener("pointermove", (ev) => {
      // Buttons bitfield: 1 = primary mouse, 0 when not pressed.
      if (ev.buttons === 0) return;
      handle(ev);
    });
    el.addEventListener("pointerup", (ev) => {
      try { el.releasePointerCapture(ev.pointerId); } catch (_) {}
    });
  }
  // ── Brand bottom-sheet ────────────────────────────────────────
  // Replaces the native <select> dropdown with a styled picker that
  // shows favourites first (starred → pinned to the top), supports
  // a live search filter at the top, and persists favs in
  // localStorage so they carry across sessions per user.
  const ADP_FAV_BRANDS_KEY = "tigertag.adp.favoriteBrands";
  function _adpLoadFavBrands() {
    try {
      const raw = localStorage.getItem(ADP_FAV_BRANDS_KEY);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed.map(n => parseInt(n, 10)).filter(isFinite) : [];
    } catch { return []; }
  }
  function _adpSaveFavBrands(ids) {
    try { localStorage.setItem(ADP_FAV_BRANDS_KEY, JSON.stringify(ids)); }
    catch (_) { /* swallow quota / disabled-storage errors */ }
  }
  function _adpToggleFavBrand(id) {
    const favs = _adpLoadFavBrands();
    const i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1);
    else favs.push(id);
    _adpSaveFavBrands(favs);
    return i < 0;  // returns true when newly-favourited
  }

  function _adpRenderBrandList(filter) {
    const host = $("adpBrandList");
    if (!host) return;
    const q = String(filter || "").trim().toLowerCase();
    const all = (state.db.brand || []).slice();
    const favs = new Set(_adpLoadFavBrands());
    const activeId = parseInt($("adpBrand")?.value, 10);

    // Match by name (case-insensitive) — empty filter = all.
    const matches = q
      ? all.filter(b => String(b.name || "").toLowerCase().includes(q))
      : all;

    // Split into favourites (top) + rest (alphabetical).
    const fav = matches.filter(b => favs.has(b.id))
                       .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    const rest = matches.filter(b => !favs.has(b.id))
                        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    if (matches.length === 0) {
      host.innerHTML = `<div class="adp-brand-empty">${esc(t("addProductBrandNoMatch") || "No brand matches")}</div>`;
      return;
    }

    const rowFor = b => {
      const isFav = favs.has(b.id);
      const isAct = b.id === activeId;
      return `<button type="button" class="adp-brand-row${isAct ? " is-active" : ""}" data-brand-id="${b.id}">
        <span class="adp-brand-row-name">${esc(b.name || `#${b.id}`)}</span>
        <span class="adp-brand-star${isFav ? " is-fav" : ""}" data-fav-id="${b.id}" role="button"
              aria-label="${esc(isFav ? (t("addProductBrandUnfav") || "Unfavourite") : (t("addProductBrandFav") || "Favourite"))}">
          <span class="icon ${isFav ? "icon-star-fill" : "icon-star"} icon-14"></span>
        </span>
      </button>`;
    };

    let html = "";
    if (fav.length) {
      html += `<div class="adp-brand-section-label">${esc(t("addProductBrandFavorites") || "Favourites")}</div>`;
      html += fav.map(rowFor).join("");
    }
    if (rest.length) {
      if (fav.length) {
        html += `<div class="adp-brand-section-label">${esc(t("addProductBrandAll") || "All brands")}</div>`;
      }
      html += rest.map(rowFor).join("");
    }
    host.innerHTML = html;
  }

  function openAdpBrandSheet() {
    _adpSyncColorSheetWidth("adpBrandSheet", "adpBrandBackdrop");
    const search = $("adpBrandSearch");
    if (search) search.value = "";
    _adpRenderBrandList("");
    // Hide the clear ✕ on open — the input is empty so there's
    // nothing to clear yet.
    const clr = $("adpBrandSearchClear");
    if (clr) clr.hidden = true;
    $("adpBrandSheet")?.classList.add("open");
    $("adpBrandSheet")?.setAttribute("aria-hidden", "false");
    $("adpBrandBackdrop")?.classList.add("open");
    setTimeout(() => $("adpBrandSearch")?.focus(), 80);
  }
  function closeAdpBrandSheet() {
    $("adpBrandSheet")?.classList.remove("open");
    $("adpBrandSheet")?.setAttribute("aria-hidden", "true");
    $("adpBrandBackdrop")?.classList.remove("open");
  }

  // Pick a brand: stamp the hidden <select> + the visible label, fire
  // a `change` event so the rest of the panel (RFID preview, material
  // defaults, etc.) reacts as if the user used the native dropdown.
  function _adpPickBrand(id) {
    const sel = $("adpBrand");
    const lbl = $("adpBrandLabel");
    if (!sel) return;
    sel.value = String(id);
    const name = (state.db.brand || []).find(b => b.id === id)?.name || "";
    if (lbl) lbl.textContent = name || "—";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ── Material bottom-sheet ─────────────────────────────────────
  // 1:1 with the Brand picker above — same anthracite sheet, same
  // search row, same favourites-on-top behaviour. Different storage
  // key so brand and material favs don't collide.
  const ADP_FAV_MATERIALS_KEY = "tigertag.adp.favoriteMaterials";
  function _adpLoadFavMaterials() {
    try {
      const raw = localStorage.getItem(ADP_FAV_MATERIALS_KEY);
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed.map(n => parseInt(n, 10)).filter(isFinite) : [];
    } catch { return []; }
  }
  function _adpSaveFavMaterials(ids) {
    try { localStorage.setItem(ADP_FAV_MATERIALS_KEY, JSON.stringify(ids)); }
    catch (_) {}
  }
  function _adpToggleFavMaterial(id) {
    const favs = _adpLoadFavMaterials();
    const i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1);
    else favs.push(id);
    _adpSaveFavMaterials(favs);
    return i < 0;
  }

  function _adpRenderMaterialList(filter) {
    const host = $("adpMaterialList");
    if (!host) return;
    const q = String(filter || "").trim().toLowerCase();
    const all = (state.db.material || []).slice();
    const favs = new Set(_adpLoadFavMaterials());
    const activeId = parseInt($("adpMaterial")?.value, 10);

    const matches = q
      ? all.filter(m => String(m.label || "").toLowerCase().includes(q))
      : all;

    const fav = matches.filter(m => favs.has(m.id))
                       .sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
    const rest = matches.filter(m => !favs.has(m.id))
                        .sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));

    if (matches.length === 0) {
      host.innerHTML = `<div class="adp-brand-empty">${esc(t("addProductMaterialNoMatch") || "No material matches")}</div>`;
      return;
    }

    const rowFor = m => {
      const isFav = favs.has(m.id);
      const isAct = m.id === activeId;
      return `<button type="button" class="adp-brand-row${isAct ? " is-active" : ""}" data-mat-id="${m.id}">
        <span class="adp-brand-row-name">${esc(m.label || `#${m.id}`)}</span>
        <span class="adp-brand-star${isFav ? " is-fav" : ""}" data-mat-fav-id="${m.id}" role="button"
              aria-label="${esc(isFav ? (t("addProductMaterialUnfav") || "Unfavourite") : (t("addProductMaterialFav") || "Favourite"))}">
          <span class="icon ${isFav ? "icon-star-fill" : "icon-star"} icon-14"></span>
        </span>
      </button>`;
    };

    let html = "";
    if (fav.length) {
      html += `<div class="adp-brand-section-label">${esc(t("addProductBrandFavorites") || "Favourites")}</div>`;
      html += fav.map(rowFor).join("");
    }
    if (rest.length) {
      if (fav.length) {
        html += `<div class="adp-brand-section-label">${esc(t("addProductMaterialAll") || "All materials")}</div>`;
      }
      html += rest.map(rowFor).join("");
    }
    host.innerHTML = html;
  }

  function openAdpMaterialSheet() {
    _adpSyncColorSheetWidth("adpMaterialSheet", "adpMaterialBackdrop");
    const search = $("adpMaterialSearch");
    if (search) search.value = "";
    _adpRenderMaterialList("");
    const clr = $("adpMaterialSearchClear");
    if (clr) clr.hidden = true;
    $("adpMaterialSheet")?.classList.add("open");
    $("adpMaterialSheet")?.setAttribute("aria-hidden", "false");
    $("adpMaterialBackdrop")?.classList.add("open");
    setTimeout(() => $("adpMaterialSearch")?.focus(), 80);
  }
  function closeAdpMaterialSheet() {
    $("adpMaterialSheet")?.classList.remove("open");
    $("adpMaterialSheet")?.setAttribute("aria-hidden", "true");
    $("adpMaterialBackdrop")?.classList.remove("open");
  }

  function _adpPickMaterial(id) {
    const sel = $("adpMaterial");
    const lbl = $("adpMaterialLabel");
    if (!sel) return;
    sel.value = String(id);
    const name = (state.db.material || []).find(m => m.id === id)?.label || "";
    if (lbl) lbl.textContent = name || "—";
    // `change` event → triggers _adpApplyMaterialDefaults which
    // overwrites Type + temp presets per the user's "always reset"
    // policy.
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function _adpCcCurrentHex() {
    // The picker is fully driven by `_adpCcState` (HSV) — the hex
    // input is just a display + manual-entry surface. Derive the
    // canonical "#RRGGBB" from state so SV/hue dragging that hasn't
    // round-tripped through the hex input is captured correctly.
    const { h, s, v } = _adpCcState;
    const { r, g, b } = _adpCcHsvToRgb(h, s, v);
    return _adpCcRgbToHex(r, g, b);
  }

  // ── Multi-colour state ────────────────────────────────────────────
  // _adpColorMode: "mono" | "dual" | "tri" | "rainbow"
  //   mono    → 1 slot,  id_aspect2 untouched (reset to 255/None)
  //   dual    → 2 slots, id_aspect2 = 252 (Bicolor)
  //   tri     → 3 slots, id_aspect2 = 24  (Tricolor)
  //   rainbow → 3 slots, id_aspect2 = 145 (Rainbow)
  // _adpColorSlots[0..2] hold the hex for each colour slot.
  // _adpActiveSlot is the 0-based index the grid is currently editing.
  let _adpColorMode   = "mono";
  let _adpColorSlots  = ["#FF5722", "#FFFFFF", "#2196F3"];
  let _adpActiveSlot  = 0;

  // Slot count derived from the current mode.
  function _adpSlotCount() {
    return _adpColorMode === "dual" ? 2 : (_adpColorMode === "mono" ? 1 : 3);
  }

  // Map a raw aspect2 id → colour mode string.
  function _adpModeForAspect2(id) {
    const n = Number(id);
    if (n === 252) return "dual";
    if (n === 24)  return "tri";
    if (n === 145) return "rainbow";
    return "mono";
  }

  // Map a colour mode → the aspect2 id to auto-write (null = leave as-is).
  const _ADP_MODE_TO_ASPECT2 = { dual: 252, tri: 24, rainbow: 145, mono: 0 };

  // Update the circle preview to show a solid colour (mono), half-split
  // (dual) or three-way conic gradient (tri / rainbow).
  function _adpUpdateCircle() {
    const sq = $("adpColorSquare");
    if (!sq) return;
    const n = _adpSlotCount();
    if (n === 1) {
      sq.style.background = _adpColorSlots[0];
    } else if (n === 2) {
      sq.style.background =
        `linear-gradient(90deg, ${_adpColorSlots[0]} 50%, ${_adpColorSlots[1]} 50%)`;
    } else if (_adpColorMode === "rainbow") {
      // Smooth linear gradient — mirrors colorBg() in the inventory.
      sq.style.background =
        `linear-gradient(90deg, ${_adpColorSlots[0]}, ${_adpColorSlots[1]}, ${_adpColorSlots[2]})`;
    } else {
      // Tri — hard conic sectors (120° each).
      sq.style.background =
        `conic-gradient(${_adpColorSlots[0]} 0deg 120deg, ` +
        `${_adpColorSlots[1]} 120deg 240deg, ${_adpColorSlots[2]} 240deg 360deg)`;
    }
  }

  // Render (or hide) the row of coloured slot indicator squares.
  function _adpRenderSlotRow() {
    const row = $("adpColorSlotsRow");
    if (!row) return;
    const n = _adpSlotCount();
    row.classList.toggle("hidden", n <= 1);
    if (n <= 1) { row.innerHTML = ""; return; }
    row.innerHTML = Array.from({ length: n }, (_, i) =>
      `<button type="button"
               class="adp-color-slot-btn${i === _adpActiveSlot ? " is-active" : ""}"
               data-slot="${i}"
               style="background:${_adpColorSlots[i]}"
               aria-label="Slot ${i + 1}"></button>`
    ).join("");
  }

  // Switch the colour mode. Updates the selector buttons, auto-syncs
  // adpAspect2, refreshes the slot row, preset ring, circle, preview.
  // Pass skipAspect2:true when called FROM the aspect2 listener to
  // avoid an update loop.
  function _adpSetColorMode(mode, { skipAspect2 = false } = {}) {
    _adpColorMode  = mode;
    _adpActiveSlot = 0;
    // Selector buttons
    $("adpColorCountRow")?.querySelectorAll(".adp-color-count-btn").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.mode === mode);
    });
    // Sync aspect2 dropdown
    if (!skipAspect2) {
      const asp2Id = _ADP_MODE_TO_ASPECT2[mode];
      const sel    = $("adpAspect2");
      if (sel && asp2Id != null) sel.value = String(asp2Id);
    }
    _adpRenderSlotRow();
    _adpRenderColorPresets(_adpColorSlots[_adpActiveSlot]);
    _adpUpdateCircle();
    _adpRefreshRfidPreview();
  }

  // Refresh both the big square + the hex label + the preset selection
  // ring so the trio reads as a single colour state.
  function _adpSyncColor(hex) {
    const value = String(hex || "#FF5722").toUpperCase();
    _adpColorSlots[_adpActiveSlot] = value;
    _adpUpdateCircle();
    // Keep the hidden native picker in sync with the active slot so
    // the custom sheet opens on the right colour.
    const native = $("adpColorHex");
    if (native) native.value = value;
    const lbl = $("adpColorHexLabel");
    if (lbl) lbl.textContent = value;
    _adpRenderColorPresets(value);
    _adpRenderSlotRow();   // refresh slot square backgrounds
    _adpRefreshRfidPreview();
  }

  // ── 28-byte UTF-8 limit on the colour-name field ───────────────
  // The RFID chip stores `color_name` in a fixed 28-byte slot — the
  // wire format is UTF-8, so an emoji or a multi-byte CJK character
  // counts as 3-4 bytes. HTML's `maxlength` counts CHARACTERS not
  // bytes so we enforce the byte limit ourselves: every input event
  // truncates to the longest prefix that still fits in 28 bytes, and
  // the counter pill on the right turns amber at 80% / red at 100%.
  const ADP_COLOR_NAME_MAX_BYTES = 28;
  function _adpByteLength(str) {
    return new TextEncoder().encode(String(str || "")).length;
  }
  function _adpTruncateToBytes(str, maxBytes) {
    const enc = new TextEncoder();
    const buf = enc.encode(String(str || ""));
    if (buf.length <= maxBytes) return String(str || "");
    // TextDecoder in fatal mode rejects an over-budget cut that lands
    // in the middle of a multi-byte sequence — walk back one byte at
    // a time until we hit a valid UTF-8 boundary. Worst case: 3 retries
    // (4-byte char). Returns the decoded prefix.
    const dec = new TextDecoder("utf-8", { fatal: true });
    for (let n = maxBytes; n > 0; n--) {
      try { return dec.decode(buf.slice(0, n)); }
      catch (_) { /* try the next shorter prefix */ }
    }
    return "";
  }
  function _adpRefreshColorNameCounter() {
    const inp = $("adpColorName");
    const tag = $("adpColorNameBytes");
    const used = $("adpColorNameBytesUsed");
    if (!inp || !tag) return;
    const n = _adpByteLength(inp.value);
    if (used) used.textContent = String(n);
    // Visual progression: green / muted by default, amber > 80%, red
    // at the cap. The cap itself is enforced by the input handler so
    // "full" only flashes during paste-truncate UX.
    let state = "ok";
    if (n >= ADP_COLOR_NAME_MAX_BYTES) state = "full";
    else if (n >= Math.floor(ADP_COLOR_NAME_MAX_BYTES * 0.8)) state = "warn";
    tag.dataset.byteState = state;
  }
  // Show / hide the inline ✕ clear button on the colour-name field.
  function _adpToggleClearVisibility(value) {
    const btn = $("adpColorNameClear");
    if (!btn) return;
    btn.hidden = !value || !String(value).length;
  }

  // Sync the basic-view readout spans with the editable inputs in
  // the advanced section. Called after every material change AND
  // after every manual edit in the advanced inputs so the basic
  // display stays in lock-step with whatever the user picked.
  function _adpUpdateBasicReadouts() {
    const pairs = [
      ["adpNozzleMin", "adpNozzleMinDisplay", "°C"],
      ["adpNozzleMax", "adpNozzleMaxDisplay", "°C"],
      ["adpDryTemp",   "adpDryTempDisplay",   "°C"],
      ["adpDryTime",   "adpDryTimeDisplay",   "h"]
    ];
    for (const [inputId, displayId, unit] of pairs) {
      const inp = $(inputId);
      const dsp = $(displayId);
      if (!inp || !dsp) continue;
      const v = String(inp.value || "").trim();
      dsp.textContent = v ? (v + unit) : ("--" + unit);
    }
  }

  // Apply a material's `recommended` defaults to the print-preset
  // inputs. Selecting a material is treated as an EXPLICIT reset —
  // any user-edited values in the advanced form are overwritten
  // with the material's canonical presets from id_material.json.
  // The previous behaviour (preserve user edits via
  // `data-user-edited`) was confusing because it left stale values
  // hanging around when the user picked a different material to
  // start over.
  function _adpApplyMaterialDefaults(materialId) {
    const mat = (state.db.material || []).find(x => x.id === materialId);
    const rec = mat?.recommended || {};
    const fields = [
      ["adpNozzleMin", rec.nozzleTempMin],
      ["adpNozzleMax", rec.nozzleTempMax],
      ["adpBedMin",    rec.bedTempMin],
      ["adpBedMax",    rec.bedTempMax],
      ["adpDryTemp",   rec.dryTemp],
      ["adpDryTime",   rec.dryTime]
    ];
    for (const [id, val] of fields) {
      const el = $(id);
      if (!el) continue;
      el.value = val != null ? String(val) : "";
      // Clear the user-edited flag — picking a material wipes the
      // slate clean for these temp fields.
      delete el.dataset.userEdited;
    }
    // Type also resets from the material's product_type_id (142 =
    // Filament, 173 = Resin). Both basic and advanced mirrors flip.
    const typeSel = $("adpType");
    const typeAdv = $("adpTypeAdv");
    if (mat?.product_type_id != null) {
      const tv = String(mat.product_type_id);
      if (typeSel) typeSel.value = tv;
      if (typeAdv) typeAdv.value = tv;
      if (typeSel) delete typeSel.dataset.userEdited;
      if (typeAdv) delete typeAdv.dataset.userEdited;
    }
    _adpUpdateBasicReadouts();
    _adpRefreshRfidPreview();
  }

  // Build the read-only RFID Data block. Renders a structured JSON
  // object — same visual presentation as the Raw JSON debug surfaces
  // elsewhere in the app (canonical `pre.json` + `highlight()` helper:
  // dark `#0e1422` background, syntax-coloured keys/strings/numbers).
  // Each field includes both the raw id AND the resolved label so the
  // block is self-documenting — e.g. `"id_brand": 65535` next to
  // `"brand": "Generic"`. Mirrors the per-field layout the mobile app
  // shows under its "RFID Data" expandable card.
  function _adpRefreshRfidPreview() {
    const pre = $("adpRfidPreview");
    if (!pre) return;
    // The whole block is gated to debug mode (`state.debugEnabled` flips
    // the `[hidden]` attribute on `#adpRfidSection` at panel-open time).
    // Skip the JSON build when the section is hidden — nothing reads
    // the pre's innerHTML in that state, so it's pure waste.
    const section = $("adpRfidSection");
    if (section && section.hasAttribute("hidden")) return;
    const get = id => $(id)?.value;
    // Decimal-aware parsers — see the same helpers in saveAddProduct.
    const intOrNull = v => {
      const n = parseInt(String(v || "").trim(), 10);
      return isFinite(n) ? n : null;
    };
    const floatOrNull = v => {
      const n = parseFloat(String(v || "").replace(",", "."));
      return isFinite(n) ? n : null;
    };
    const { r, g, b } = _adpHexToRgb(_adpColorSlots[0]);
    const brandId  = intOrNull(get("adpBrand"));
    const matId    = intOrNull(get("adpMaterial"));
    const typeId   = intOrNull(get("adpType"));
    const aspect1  = intOrNull(get("adpAspect1"));
    const aspect2  = intOrNull(get("adpAspect2"));
    const diamId   = intOrNull(get("adpDiameter"));
    const unitId   = intOrNull(get("adpUnit"));
    const weight   = floatOrNull(get("adpWeight"));
    const nozzMin  = floatOrNull(get("adpNozzleMin"));
    const nozzMax  = floatOrNull(get("adpNozzleMax"));
    const bedMin   = floatOrNull(get("adpBedMin"));
    const bedMax   = floatOrNull(get("adpBedMax"));
    const dryTemp  = intOrNull(get("adpDryTemp"));
    const dryTime  = intOrNull(get("adpDryTime"));
    // TD is OPTIONAL. Empty input → null (mirrors the save path so
    // the JSON preview shows exactly what will hit Firestore).
    const tdRaw    = String(get("adpTd") || "").trim();
    const td       = tdRaw === "" ? null : floatOrNull(get("adpTd"));
    const message  = String(get("adpMessage") || "");
    const colorName = String(get("adpColorName") || "");

    // Mirror the canonical chip schema field-for-field so what the
    // user sees in the RFID Data block IS exactly what hits Firestore
    // (and a future RFID burn). Only the fields in the user-provided
    // spec — no extras (TD / Link* / manual_entry / cloud_only stay
    // off the canonical preview). See saveAddProduct for the matching
    // write block.
    const ID_PRODUCT_UNSET = 4294967295;
    const aspect2Resolved = aspect2 != null ? aspect2 : 255;
    // Stable preview tigertag id — derived from the cloud id so
    // re-renders during a single open don't churn the number. The
    // ACTUAL value written is `Math.random()` at save time (also a
    // u32) — preview is for UX only.
    const previewTt = _pendingCloudId
      ? Math.abs(parseInt(String(_pendingCloudId).replace(/\D/g, "").slice(0, 9), 10)) % ID_PRODUCT_UNSET
      : 0;
    const obj = {
      uid: _pendingCloudId || "(generated on save)",
      id_brand:    brandId,
      id_material: matId,
      id_type:     typeId    != null ? typeId    : 142,
      id_aspect1:  aspect1   != null ? aspect1   : 104,
      id_aspect2:  aspect2Resolved,
      id_unit:     unitId    != null ? unitId    : 21,
      id_product:  ID_PRODUCT_UNSET,
      id_tigertag: previewTt,
      color_r: r, color_g: g, color_b: b, color_a: 255,
      data1: diamId    != null ? diamId    : 56,
      data2: nozzMin   != null ? nozzMin   : 0,
      data3: nozzMax   != null ? nozzMax   : 0,
      data4: dryTemp   != null ? dryTemp   : 0,
      data5: dryTime   != null ? dryTime   : 0,
      data6: bedMin    != null ? bedMin    : 0,
      data7: bedMax    != null ? bedMax    : 0,
      // `measure` = user-entered raw value, `measure_gr` =
      // converted to grams (mg → /1000, kg → ×1000, g → identity).
      // `weight_available` mirrors measure_gr (full at creation).
      measure:          weight != null ? weight : 0,
      measure_gr:       weight != null ? _adpToGrams(weight, unitId) : 0,
      weight_available: weight != null ? _adpToGrams(weight, unitId) : 0,
      message: colorName || message || "",
      // TD — null when empty (optional field), otherwise clamped
      // to 0.1-100 — matches the save path so the JSON preview
      // shows exactly what will hit Firestore.
      TD: td === null
            ? null
            : Math.max(0.1, Math.min(100, isFinite(td) && td > 0 ? td : 0.1)),
      timestamp:   nowChipTs(),
      deleted:     null,
      deleted_at:  null
    };
    // Conditional multi-colour fields — driven by the mode selector.
    if (_adpSlotCount() >= 2) {
      const { r: r2, g: g2, b: b2 } = _adpHexToRgb(_adpColorSlots[1]);
      obj.color_r2 = r2; obj.color_g2 = g2; obj.color_b2 = b2;
    }
    if (_adpSlotCount() >= 3) {
      const { r: r3, g: g3, b: b3 } = _adpHexToRgb(_adpColorSlots[2]);
      obj.color_r3 = r3; obj.color_g3 = g3; obj.color_b3 = b3;
    }
    // The `highlight()` helper returns HTML — caller injects via
    // innerHTML. The container has `class="json"` and lives inside a
    // `<details class="debug">`, both styled by 70-detail-misc.css —
    // dark JSON theme, syntax-coloured spans, chevron summary.
    pre.innerHTML = highlight(obj);
  }

  // Stash the cloud id at open time so it stays stable while the user
  // edits — only rotates on next open. Cleared on close.
  let _pendingCloudId = null;

  function openAddProductPanel() {
    if (!state.activeAccountId) {
      try { toast(t("invalidKey", { r: "no account" }), "error"); } catch (_) {}
      return;
    }

    _pendingCloudId = _adpCloudId();

    // Populate dropdowns. Brand by name asc, material by label asc;
    // type / aspect / diameter sorted by label too. The `value` is the
    // numeric id so the save path can recover it directly.
    const optList = (arr, valueKey, labelKey) => arr
      .slice()
      .sort((a, b) => String(a[labelKey] || "").localeCompare(String(b[labelKey] || "")))
      .map(e => `<option value="${e[valueKey]}">${esc(e[labelKey] || `#${e[valueKey]}`)}</option>`)
      .join("");

    const brandSel    = $("adpBrand");
    const matSel      = $("adpMaterial");
    const typeSel     = $("adpType");        // basic view (cog row)
    const typeAdv     = $("adpTypeAdv");     // advanced mirror
    const aspect1Sel  = $("adpAspect1");     // basic view (color row)
    const aspect1Adv  = $("adpAspect1Adv");  // advanced mirror
    const aspect2Sel  = $("adpAspect2");
    const diamSel     = $("adpDiameter");
    const unitSel     = $("adpUnit");

    const brandList    = optList(state.db.brand    || [], "id", "name");
    const matList      = optList(state.db.material || [], "id", "label");
    const typeList     = optList(state.db.type     || [], "id", "label");
    // Aspect 1 = surface finish only (Basic, Mat, Clear, etc.).
    // Filter: keep only `color_count === 1` — drops both the "-"
    // placeholder (color_count 0) AND bicolor/tricolor/rainbow
    // (color_count ≥ 2). Aspect 1 is a required pick, no "no aspect"
    // affordance.
    const aspect1Pool  = (state.db.aspect || []).filter(a => (a.color_count || 0) === 1);
    const aspect1List  = optList(aspect1Pool, "id", "label");
    // Aspect 2 keeps the full list (None + multi-colour aspects).
    const aspectList   = optList(state.db.aspect   || [], "id", "label");
    const diamList     = optList(state.db.diameter || [], "id", "label");
    // Unit list — restrict to weight units (`type === "weight"` in the
    // catalogue) so users don't accidentally pick "ml" or similar.
    const unitWeights  = (state.db.unit || []).filter(u => !u.type || u.type === "weight");
    const unitList     = unitWeights
      .slice()
      .sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")))
      .map(u => `<option value="${u.id}">${esc(u.label || `#${u.id}`)}</option>`)
      .join("");

    if (brandSel)    brandSel.innerHTML    = brandList;
    if (matSel)      matSel.innerHTML      = matList;
    if (typeSel)     typeSel.innerHTML     = typeList;
    if (typeAdv)     typeAdv.innerHTML     = typeList;
    // Aspect 1 uses the filtered pool (mono / "-" only); Aspect 2
    // gets the full list (incl. bicolor / tricolor / rainbow).
    if (aspect1Sel)  aspect1Sel.innerHTML  = aspect1List;
    if (aspect1Adv)  aspect1Adv.innerHTML  = aspect1List;
    if (aspect2Sel)  aspect2Sel.innerHTML  = aspectList;
    if (diamSel)     diamSel.innerHTML     = diamList;
    if (unitSel)     unitSel.innerHTML     = unitList;

    // Default selections — sensible starting points for a fresh entry.
    const findId = (cat, predicate) =>
      (state.db[cat] || []).find(predicate)?.id;
    // Generic brand if it exists
    const genericBrand = findId("brand", b => /generic/i.test(b.name || ""));
    if (genericBrand != null && brandSel) brandSel.value = String(genericBrand);
    // Sync the visible Brand + Material trigger labels with the
    // resolved selections — hidden <select>s carry the values, the
    // buttons show the resolved names.
    const brandLbl = $("adpBrandLabel");
    if (brandLbl && brandSel) {
      const id = parseInt(brandSel.value, 10);
      const name = (state.db.brand || []).find(b => b.id === id)?.name || "—";
      brandLbl.textContent = name;
    }
    const matLbl = $("adpMaterialLabel");
    if (matLbl && matSel) {
      const id = parseInt(matSel.value, 10);
      const name = (state.db.material || []).find(m => m.id === id)?.label || "—";
      matLbl.textContent = name;
    }
    // PLA material as the default canvas
    const plaId = findId("material", m =>
      String(m.label || "").trim().toUpperCase() === "PLA"
    );
    if (plaId != null && matSel) matSel.value = String(plaId);
    // 1.75 diameter
    const d175 = findId("diameter", d => String(d.label || "").startsWith("1.75"));
    if (d175 != null && diamSel) diamSel.value = String(d175);
    // Aspect 1 — first non-"-" entry (often "Basic" / "Mat" / etc.)
    const basic = findId("aspect", a => /basic/i.test(a.label || ""));
    if (basic != null) {
      if (aspect1Sel) aspect1Sel.value = String(basic);
      if (aspect1Adv) aspect1Adv.value = String(basic);
    }
    // Aspect 2 — "-" / "None" by default
    const noneAspect = findId("aspect", a => a.label === "-");
    if (noneAspect != null && aspect2Sel) aspect2Sel.value = String(noneAspect);
    // Unit — default to grams (id 21 per the canonical schema).
    if (unitSel) unitSel.value = "21";

    // Color resets to the same warm orange that's a friendly default.
    $("adpColorName") && ($("adpColorName").value = "");
    $("adpWeight")    && ($("adpWeight").value    = "1000");
    $("adpTd")        && ($("adpTd").value        = "");
    $("adpImgUrl")    && ($("adpImgUrl").value    = "");
    $("adpMessage")   && ($("adpMessage").value   = "");
    _adpRefreshColorNameCounter();
    // Reset user-edited flags so material defaults seed the temps.
    ["adpType", "adpTypeAdv", "adpAspect1Adv", "adpTd",
     "adpNozzleMin", "adpNozzleMax", "adpBedMin", "adpBedMax",
     "adpDryTemp", "adpDryTime"].forEach(id => {
      const el = $(id);
      if (el) delete el.dataset.userEdited;
    });

    // Reset multi-colour state — always opens in Mono with a fresh orange.
    _adpColorMode   = "mono";
    _adpColorSlots  = ["#FF5722", "#FFFFFF", "#2196F3"];
    _adpActiveSlot  = 0;
    _adpSyncColor("#FF5722");
    if (matSel) _adpApplyMaterialDefaults(parseInt(matSel.value, 10));
    _adpToggleClearVisibility($("adpColorName")?.value);

    // Advanced toggle — off by default (matches the mobile basic view).
    // The basic Nozzle / Drying cards stay as display-only readouts;
    // editing only happens after the user flips the cog toggle.
    const advTog = $("adpAdvancedToggle");
    const advBody = $("adpAdvancedBody");
    if (advTog && advBody) {
      advTog.dataset.on = "false";
      advTog.setAttribute("aria-checked", "false");
      advBody.hidden = true;
    }
    // Dual Link toggle — off by default. Reset every open so the
    // panel never opens with a stale-positive switch.
    const dualTog = $("adpDualLinkToggle");
    if (dualTog) {
      dualTog.dataset.on = "false";
      dualTog.setAttribute("aria-checked", "false");
    }

    const errEl = $("adpError");
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }

    // Match the spool detail panel width — same UX as the rest of
    // the app. The user-resized value from `tigertag.panelWidth.detail`
    // is reused so this panel always feels familiar regardless of
    // how wide the user has set their inventory side card.
    const panel = $("addProductPanel");
    if (panel) {
      const persisted = parseInt(localStorage.getItem("tigertag.panelWidth.detail"), 10);
      const adpMin = 400; // Add Product panel is wider than the spool detail panel
      if (isFinite(persisted) && persisted >= 280) {
        panel.style.width = Math.min(Math.max(persisted, adpMin), Math.round(window.innerWidth * 0.85)) + "px";
      } else {
        panel.style.width = adpMin + "px"; // enforce minimum — never fall back to the 300px CSS default
      }
    }

    // RFID Data panel — admin/debug surface. Show only when the user
    // is in debug mode (cf. CLAUDE.md "Debug mode" section). Hidden
    // attribute is the visibility gate; `_adpRefreshRfidPreview` also
    // early-returns when the section is hidden so the JSON build is
    // skipped for non-debug users.
    const rfidSection = $("adpRfidSection");
    if (rfidSection) {
      if (state.debugEnabled) rfidSection.removeAttribute("hidden");
      else                    rfidSection.setAttribute("hidden", "");
    }

    // Sync TD1S button state at open time so the icon reflects the
    // current connection without waiting for the next onStatus event.
    $("adpTd1sBtn")?.classList.toggle("td1s-connected", !!state.td1sConnected);
    $("addProductPanel")?.classList.add("open");
    $("addProductOverlay")?.classList.add("open");
    setTimeout(() => $("adpBrand")?.focus(), 80);
  }

  function closeAddProductPanel() {
    $("addProductPanel")?.classList.remove("open");
    $("addProductOverlay")?.classList.remove("open");
    _pendingCloudId = null;
  }

  async function saveAddProduct() {
    const errEl = $("adpError");
    const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
    if (errEl) errEl.hidden = true;

    const uid = state.activeAccountId;
    if (!uid) return showErr(t("invalidKey", { r: "no account" }));

    const get = id => $(id)?.value;
    const { r, g, b } = _adpHexToRgb(_adpColorSlots[0]);

    // Decimal-aware parsers — comma separators (`0,5`) are accepted
     // alongside dot-decimals so the user can paste localised values
     // without a manual conversion step.
    const numF = v => {
      const n = parseFloat(String(v || "").replace(",", "."));
      return isFinite(n) ? n : NaN;
    };
    const numI = v => {
      const n = parseInt(String(v || "").trim(), 10);
      return isFinite(n) ? n : NaN;
    };

    const brandId   = numI(get("adpBrand"));
    const matId     = numI(get("adpMaterial"));
    const typeId    = numI(get("adpType"));
    const aspect1Id = numI(get("adpAspect1"));
    const aspect2Id = numI(get("adpAspect2"));
    const diamId    = numI(get("adpDiameter"));
    const unitId    = numI(get("adpUnit"));
    const weight    = numF(get("adpWeight"));      // decimal
    const nozzleMin = numF(get("adpNozzleMin"));   // decimal
    const nozzleMax = numF(get("adpNozzleMax"));   // decimal
    const bedMin    = numF(get("adpBedMin"));      // decimal
    const bedMax    = numF(get("adpBedMax"));      // decimal
    const dryTemp   = numI(get("adpDryTemp"));     // 0-130 int
    const dryTime   = numI(get("adpDryTime"));     // 0-24  int
    // TD is optional. Empty input stays as `null` here so the save
    // path can write `null` straight through (versus the canonical
    // 0.1-100 clamp when the user actually typed a value).
    const tdRaw     = String(get("adpTd") || "").trim();
    const td        = tdRaw === "" ? null : numF(get("adpTd"));
    const colorName = String(get("adpColorName") || "").trim();
    const message   = String(get("adpMessage")   || "").trim();

    if (!isFinite(brandId) || !isFinite(matId)) {
      return showErr(t("addProductErrMissing"));
    }
    // Required integer fields — Weight, Nozzle Min/Max, Bed Min/Max
    // can never be empty. The browser's `required` attribute would
    // catch this on a real form submit, but this panel uses a manual
    // save click so we validate here. Empty / non-numeric values
    // surface a clear error and focus the offending input.
    const required = [
      ["adpWeight",    weight,    "addProductErrCapacity"],
      ["adpNozzleMin", nozzleMin, "addProductErrMissingTemp"],
      ["adpNozzleMax", nozzleMax, "addProductErrMissingTemp"],
      ["adpBedMin",    bedMin,    "addProductErrMissingTemp"],
      ["adpBedMax",    bedMax,    "addProductErrMissingTemp"]
    ];
    for (const [fieldId, value, errKey] of required) {
      if (!isFinite(value) || value < 0 || (fieldId === "adpWeight" && value < 1)) {
        try { $(fieldId)?.focus(); } catch (_) {}
        return showErr(t(errKey) || t("addProductErrCapacity"));
      }
    }
    // Aspect 1 ≠ Aspect 2 — they share an id pool, but with the
    // post-filter Aspect 1 = mono only, the only collision is when
    // both equal a real selection (the "-" placeholder is fine
    // since it shouldn't end up the same in both sides; if it does
    // — both empty — block too so the user picks at least one).
    if (isFinite(aspect1Id) && isFinite(aspect2Id) && aspect1Id === aspect2Id) {
      try { $("adpAspect2")?.focus(); } catch (_) {}
      return showErr(t("addProductErrAspectSame") || "Aspect 1 and Aspect 2 can't be the same.");
    }

    const cloudId  = _pendingCloudId || _adpCloudId();

    // ── Canonical chip schema ──────────────────────────────────────
    // Strictly the fields the user spec'd, no extras. Anything not on
    // the canonical list (TD, Link*, manual_entry, cloud_only,
    // online_color_*) was removed so a future chip-burn is a straight
    // copy of the doc — nothing to filter, nothing extra to clear.
    //
    //   id_unit       21          → grams
    //   id_product    0xFFFFFFFF  → unset (real chips overwrite)
    //   id_tigertag   random u32  → cloud-only nonce, real chip id
    //                              replaces this on programming
    //   color_a       255          → opaque
    //   color_2 / 3                 ONLY written when dual (id_aspect2
    //                              ∈ {252, 145}) or tri (id_aspect2
    //                              ∈ {24, 145}). Mono = omitted.
    //   data1..7      firmware slot map (diameter / nozzle min/max /
    //                 dry temp/time / bed min/max)
    //   timestamp     unix seconds → chip programming time; stamped
    //                              now for cloud-only, overwritten at
    //                              burn time.
    //   deleted /     null         → tombstone fields kept null on
    //   deleted_at                  fresh entries.
    const ID_PRODUCT_UNSET = 4294967295;       // 0xFFFFFFFF
    const data = {
      uid: cloudId,

      // ── Identity ────────────────────────────────────────────────
      id_brand:    brandId,
      id_material: matId,
      id_type:     isFinite(typeId)    ? typeId    : 142,  // default Filament
      id_aspect1:  isFinite(aspect1Id) ? aspect1Id : 104,
      id_aspect2:  isFinite(aspect2Id) ? aspect2Id : 255,
      // Unit — pulled from the advanced Unit picker. Falls back to
      // grams (id 21) when the user hasn't opened Advanced.
      id_unit:     isFinite(unitId)    ? unitId    : 21,
      id_product:  ID_PRODUCT_UNSET,
      // Random 32-bit TigerTag ID for cloud-only entries — the real
      // chip replaces this at programming time.
      id_tigertag: Math.floor(Math.random() * ID_PRODUCT_UNSET),

      // ── Colour 1 (RGBA) — always written ───────────────────────
      color_r: r, color_g: g, color_b: b, color_a: 255,

      // ── Firmware data slots ─────────────────────────────────────
      data1: isFinite(diamId)    ? diamId    : 56,        // default 1.75
      data2: isFinite(nozzleMin) ? nozzleMin : 0,
      data3: isFinite(nozzleMax) ? nozzleMax : 0,
      data4: isFinite(dryTemp)   ? dryTemp   : 0,
      data5: isFinite(dryTime)   ? dryTime   : 0,
      data6: isFinite(bedMin)    ? bedMin    : 0,
      data7: isFinite(bedMax)    ? bedMax    : 0,

      // ── Measure ─────────────────────────────────────────────────
      // `measure` keeps the raw user-entered value in their chosen
      // unit (kg / g / mg). `measure_gr` is the same value converted
      // to GRAMS, regardless of the unit picked — so the rest of
      // the app can read "how many grams in this spool" without
      // worrying about the unit. `weight_available` mirrors
      // measure_gr at creation since the spool is full out of the
      // box; it'll diverge later as filament gets used.
      measure:          weight,
      measure_gr:       _adpToGrams(weight, unitId),
      weight_available: _adpToGrams(weight, unitId),

      // ── Misc text ──────────────────────────────────────────────
      // The colour-name input doubles as the message in the mobile
      // creator UI — surface its value here so the round-trip stays
      // 1:1 with what the user typed.
      message: colorName || message || "",

      // ── TD (HueForge) — OPTIONAL. Null when the user left the
      // field empty; otherwise clamped to the spec'd 0.1-100 range.
      TD: td === null
            ? null
            : Math.max(0.1, Math.min(100, isFinite(td) && td > 0 ? td : 0.1)),

      // ── Timestamps + tombstone ─────────────────────────────────
      timestamp:   nowChipTs(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      deleted:     null,
      deleted_at:  null
    };
    // User-provided product image URL — optional. When set, also writes
    // url_img_user:true so normalizeRow keeps isPlus=false for DIY/Cloud.
    const imgUrlRaw = String(get("adpImgUrl") || "").trim();
    if (imgUrlRaw) {
      data.url_img      = imgUrlRaw;
      data.url_img_user = true;
    }
    // Colours 2 / 3 — written when mode is dual / tri / rainbow.
    // Values come directly from _adpColorSlots (set by the in-sheet
    // colour picker). id_aspect2 is already set correctly by _adpSetColorMode.
    if (_adpSlotCount() >= 2) {
      const { r: r2, g: g2, b: b2 } = _adpHexToRgb(_adpColorSlots[1]);
      data.color_r2 = r2; data.color_g2 = g2; data.color_b2 = b2;
    }
    if (_adpSlotCount() >= 3) {
      const { r: r3, g: g3, b: b3 } = _adpHexToRgb(_adpColorSlots[2]);
      data.color_r3 = r3; data.color_g3 = g3; data.color_b3 = b3;
    }

    const btn = $("adpSave");
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      await fbDb()
        .collection("users").doc(uid)
        .collection("inventory").doc(cloudId)
        .set(data);
      bumpStudioCounters({ cloudAddedTotal: 1 });
      closeAddProductPanel();
      try { toast(t("addProductOk"), "success"); } catch (_) {}
    } catch (e) {
      console.warn("[addProduct] save failed:", e?.code, e?.message);
      showErr(`${t("addProductErrSave")} ${e?.message || ""}`.trim());
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = t("addProductSave"); }
    }
  }

  // Helper — close any open colour sub-sheet alongside the panel.
  // Used by every "close everything" affordance (✕ button on the
  // panel header, Cancel button, panel-overlay click) so a click
  // outside the side card always tears down the whole cascade.
  function _adpCloseAllSheetsAndPanel() {
    closeAdpMaterialSheet();
    closeAdpBrandSheet();
    closeAdpColorCustomSheet();
    closeAdpColorSheet();
    closeAddProductPanel();
  }

  // Brand trigger → open the dedicated bottom sheet (search + favs).
  $("adpBrandTrigger")?.addEventListener("click", openAdpBrandSheet);
  $("adpBrandBackdrop")?.addEventListener("click", closeAdpBrandSheet);
  // Show / hide the inline ✕ on the brand search field — only
  // surfaced when there's a value to clear, mirroring the main
  // inventory search bar's UX.
  function _adpBrandSearchClearVisibility(value) {
    const btn = $("adpBrandSearchClear");
    if (!btn) return;
    btn.hidden = !value || !String(value).length;
  }
  // Live filter — re-render on every keystroke. Cheap because the
  // brand list is small (~50 entries) and HTML is rebuilt fully.
  $("adpBrandSearch")?.addEventListener("input", e => {
    _adpRenderBrandList(e.target.value);
    _adpBrandSearchClearVisibility(e.target.value);
  });
  // Click ✕ → wipe the input, refocus, re-render the list unfiltered.
  $("adpBrandSearchClear")?.addEventListener("click", () => {
    const inp = $("adpBrandSearch");
    if (!inp) return;
    inp.value = "";
    _adpRenderBrandList("");
    _adpBrandSearchClearVisibility("");
    inp.focus();
  });
  // List click delegation — handles both brand-row pick AND star toggle.
  $("adpBrandList")?.addEventListener("click", e => {
    // Star toggle takes priority — even though the row click would also
    // catch it, we want star = "favourite, don't pick".
    const star = e.target.closest("[data-fav-id]");
    if (star) {
      e.stopPropagation();
      const id = parseInt(star.dataset.favId, 10);
      if (!isFinite(id)) return;
      _adpToggleFavBrand(id);
      // Re-render in place — keeps the search filter and scroll position
      // (the list rebuild reuses the same scroll container).
      _adpRenderBrandList($("adpBrandSearch")?.value || "");
      return;
    }
    const row = e.target.closest("[data-brand-id]");
    if (!row) return;
    const id = parseInt(row.dataset.brandId, 10);
    if (!isFinite(id)) return;
    _adpPickBrand(id);
    closeAdpBrandSheet();
  });

  // ── Material trigger + sheet wiring (mirror of Brand) ─────────
  function _adpMaterialSearchClearVisibility(value) {
    const btn = $("adpMaterialSearchClear");
    if (!btn) return;
    btn.hidden = !value || !String(value).length;
  }
  $("adpMaterialTrigger")?.addEventListener("click", openAdpMaterialSheet);
  $("adpMaterialBackdrop")?.addEventListener("click", closeAdpMaterialSheet);
  $("adpMaterialSearch")?.addEventListener("input", e => {
    _adpRenderMaterialList(e.target.value);
    _adpMaterialSearchClearVisibility(e.target.value);
  });
  $("adpMaterialSearchClear")?.addEventListener("click", () => {
    const inp = $("adpMaterialSearch");
    if (!inp) return;
    inp.value = "";
    _adpRenderMaterialList("");
    _adpMaterialSearchClearVisibility("");
    inp.focus();
  });
  $("adpMaterialList")?.addEventListener("click", e => {
    const star = e.target.closest("[data-mat-fav-id]");
    if (star) {
      e.stopPropagation();
      const id = parseInt(star.dataset.matFavId, 10);
      if (!isFinite(id)) return;
      _adpToggleFavMaterial(id);
      _adpRenderMaterialList($("adpMaterialSearch")?.value || "");
      return;
    }
    const row = e.target.closest("[data-mat-id]");
    if (!row) return;
    const id = parseInt(row.dataset.matId, 10);
    if (!isFinite(id)) return;
    _adpPickMaterial(id);
    closeAdpMaterialSheet();
  });

  $("btnAddProduct")?.addEventListener("click", () => {
    // The header Add button is multi-purpose, dispatching by current view:
    //   - Printer modes (grid / table / cam) → brand picker → add printer
    //   - Storage (rack) mode                 → new rack modal
    //   - Inventory (table / grid)            → add product side panel
    if (_isPrinterMode(state.viewMode))      openPrinterBrandPicker();
    else if (state.viewMode === "rack")       openRackEditModal(null);
    else                                      openAddProductPanel();
  });
  $("addProductClose")?.addEventListener("click", _adpCloseAllSheetsAndPanel);
  // TD1S button in ADP header: open "Set Color & TD Value" modal pre-filled
  // with the current ADP color slots. The callback writes the result back
  // into _adpColorSlots / adpTd instead of Firestore (no real spoolId yet).
  $("adpTd1sBtn")?.addEventListener("click", () => {
    const colorList = _adpColorSlots.slice(0, _adpSlotCount()).map(h => h.replace(/^#/, ""));
    const r = { colorList, td: parseFloat($("adpTd")?.value) || null };
    openColorEditModal(r, update => {
      if (Array.isArray(update.online_color_list) && update.online_color_list.length) {
        update.online_color_list.forEach((hex, i) => {
          if (i < _adpColorSlots.length) _adpColorSlots[i] = `#${hex.replace(/^#/, "")}`;
        });
        _adpUpdateCircle();
        _adpRenderSlotRow();
      }
      if (update.TD != null) {
        const inp = $("adpTd"); if (inp) inp.value = update.TD;
      }
    });
  });
  $("adpCancel")?.addEventListener("click", _adpCloseAllSheetsAndPanel);
  $("adpSave")?.addEventListener("click", saveAddProduct);
  // Panel-overlay click — outside-the-card region. Closes any open
  // colour sheet first, then the panel, so a single click in the
  // "outside" area dismisses the whole cascade.
  $("addProductOverlay")?.addEventListener("click", _adpCloseAllSheetsAndPanel);

  // Color square click → open the bottom-sheet palette (24 presets +
  // custom eyedropper slot). Same pattern as the Snapmaker / FlashForge
  // filament-edit colour pickers, so the visual grammar is uniform
  // across "I'm picking a filament colour" surfaces in the app.
  $("adpColorSquare")?.addEventListener("click", () => {
    openAdpColorSheet();
  });
  // Native colour input — used as the OS picker target when the user
  // clicks the eyedropper slot. Update every input event so the live
  // preview as the user drags the OS picker reflects on the square.
  $("adpColorHex")?.addEventListener("input", e => {
    _adpSyncColor(e.target.value);
  });

  // Bottom-sheet close — backdrop click is the only affordance now
  // (no ✕ button, no grip, matching the mobile creator UX).
  $("adpColorBackdrop")?.addEventListener("click", closeAdpColorSheet);
  // Preset cell click delegation — fixed swatches close the sheet
  // immediately on pick (same UX as Snapmaker's). The CUSTOM cell
  // (eyedropper) opens a SECOND bottom-sheet dedicated to dialing
  // a precise hex, rather than spawning the OS dialog directly.
  $("adpColorGrid")?.addEventListener("click", e => {
    const btn = e.target.closest(".sfe-color-cell");
    if (!btn) return;
    if (btn.dataset.colorCustom === "1") {
      openAdpColorCustomSheet();
      return;
    }
    const c = btn.dataset.color;
    if (!c) return;
    _adpSyncColor(c);
    // In Mono mode close immediately (quick-pick UX).
    // In Dual / Tri / Rainbow the sheet stays open so the user can pick
    // each slot without reopening.
    if (_adpColorMode === "mono") closeAdpColorSheet();
  });

  // Slot indicator click — switch the active slot and refresh the grid.
  $("adpColorSlotsRow")?.addEventListener("click", e => {
    const slotBtn = e.target.closest(".adp-color-slot-btn");
    if (!slotBtn) return;
    _adpActiveSlot = Number(slotBtn.dataset.slot);
    _adpRenderSlotRow();
    _adpRenderColorPresets(_adpColorSlots[_adpActiveSlot]);
    const native = $("adpColorHex");
    if (native) native.value = _adpColorSlots[_adpActiveSlot];
  });

  // Count selector click — Mono / Dual / Tri / Rainbow.
  $("adpColorCountRow")?.addEventListener("click", e => {
    const btn = e.target.closest(".adp-color-count-btn");
    if (!btn || !btn.dataset.mode) return;
    _adpSetColorMode(btn.dataset.mode);
  });

  // aspect2 change → sync colour mode (bidirectional link).
  // Uses skipAspect2:true to avoid a feedback loop.
  $("adpAspect2")?.addEventListener("change", e => {
    const newMode = _adpModeForAspect2(e.target.value);
    if (newMode !== _adpColorMode) _adpSetColorMode(newMode, { skipAspect2: true });
  });

  // Custom-colour sheet wiring — HSV picker drag + hue slider drag +
  // hex input two-way bind + paste-from-clipboard + OK commit.
  // Backdrop click is the only close affordance (no ✕, no grip).
  $("adpColorCustomBackdrop")?.addEventListener("click", closeAdpColorCustomSheet);

  // Hex input — accept "RRGGBB" or "#RRGGBB". Pass `skipHexInput` so
  // the redraw doesn't clobber what the user is currently typing
  // (would jump the caret to the end on every keystroke).
  $("adpCcHex")?.addEventListener("input", e => {
    _adpCcSetFromHex(e.target.value, { skipHexInput: true });
  });
  // On blur, reformat the input so partial / unparseable values snap
  // back to the canonical 6-digit upper-case form derived from state.
  $("adpCcHex")?.addEventListener("blur", () => _adpCcRender());

  // Paste icon — pull from the clipboard and treat it as a hex input.
  // Tolerant: trims whitespace and accepts an optional leading `#`.
  $("adpCcPaste")?.addEventListener("click", async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (_adpCcSetFromHex(txt)) return;
    } catch (_) { /* clipboard denied / unavailable — silent */ }
  });

  // SV rectangle drag — fx = saturation, fy = inverted value.
  _adpCcAttachDrag($("adpCcSv"), (fx, fy) => {
    _adpCcState.s = fx;
    _adpCcState.v = 1 - fy;
    _adpCcRender();
  });

  // Hue slider drag — fx = hue / 360, fy ignored (1D control).
  _adpCcAttachDrag($("adpCcHue"), (fx) => {
    _adpCcState.h = fx * 360;
    _adpCcRender();
  });

  // OK — commits the current colour to the panel + cascades both
  // sheets closed (preset + custom). Reuses _adpSyncColor so the
  // colour name input + RFID preview pick up the change too.
  $("adpCcApply")?.addEventListener("click", () => {
    const c = _adpCcCurrentHex();
    if (!c) return; // shouldn't happen — state always yields a valid hex
    _adpSyncColor(c);
    closeAdpColorCustomSheet();
    closeAdpColorSheet();
  });

  // Copy-RFID-JSON button (debug only) — same UX as the spool detail
  // panel's `#btnCopyRaw`: grabs the pre's textContent (strips the
  // `highlight()` HTML wrappers automatically) and writes it to the
  // clipboard, with a `.copied` class flash for feedback.
  $("adpBtnCopyRfid")?.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    const pre = $("adpRfidPreview");
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
      const btn = $("adpBtnCopyRfid");
      if (!btn) return;
      btn.classList.add("copied");
      setTimeout(() => btn.classList.remove("copied"), 1800);
    }).catch(() => {});
  });

  // Material change → seed defaults (unless the user has overridden
  // the target field) + refresh the RFID preview.
  $("adpMaterial")?.addEventListener("change", e => {
    _adpApplyMaterialDefaults(parseInt(e.target.value, 10));
  });
  // Brand / type / aspect / diameter / weight / unit / TD / message
  // — every input refreshes the RFID Data preview so the user sees
  // their changes reflected in the read-only block in real time.
  // Including `adpUnit` is critical because changing the unit alone
  // re-derives `measure_gr` (e.g. flipping from g to kg multiplies
  // the gram value by 1000) — without this listener the preview
  // would show stale grams until the user touched another field.
  ["adpBrand", "adpType", "adpAspect1", "adpAspect2", "adpDiameter",
   "adpWeight", "adpUnit", "adpTd", "adpMessage",
   "adpNozzleMin", "adpNozzleMax", "adpBedMin", "adpBedMax",
   "adpDryTemp", "adpDryTime"].forEach(id => {
    const el = $(id);
    if (!el) return;
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, () => {
      el.dataset.userEdited = "1";
      _adpRefreshRfidPreview();
    });
  });

  // Colour name has its own handler — enforces the 28-byte UTF-8 limit
  // (`maxlength` HTML attr counts CHARACTERS, not bytes, so we'd allow
  // a 28-character string of CJK / emoji that's 84-112 bytes wide and
  // would overflow the chip slot). Every keystroke truncates to the
  // longest prefix that still fits, refreshes the counter pill, and
  // bubbles into the RFID Data preview.
  $("adpColorName")?.addEventListener("input", e => {
    const el = e.target;
    const before = el.value;
    if (_adpByteLength(before) > ADP_COLOR_NAME_MAX_BYTES) {
      // Preserve the caret position relative to the truncated tail —
      // truncation always cuts the END of the string so we keep the
      // caret where the user is typing.
      const cut = _adpTruncateToBytes(before, ADP_COLOR_NAME_MAX_BYTES);
      el.value = cut;
    }
    _adpRefreshColorNameCounter();
    _adpToggleClearVisibility(el.value);
    _adpRefreshRfidPreview();
  });
  // Defend against pasted input — the `paste` event fires before
  // `input` so we re-run the truncation in case the platform emits
  // them in an unusual order on this OS.
  $("adpColorName")?.addEventListener("paste", () => {
    queueMicrotask(() => {
      const el = $("adpColorName");
      if (!el) return;
      if (_adpByteLength(el.value) > ADP_COLOR_NAME_MAX_BYTES) {
        el.value = _adpTruncateToBytes(el.value, ADP_COLOR_NAME_MAX_BYTES);
      }
      _adpRefreshColorNameCounter();
      _adpToggleClearVisibility(el.value);
      _adpRefreshRfidPreview();
    });
  });

  // Advanced toggle — pill switch (cog row, right side). Mirrors the
  // mobile creator screen: toggle ON reveals the full editable form
  // (Type / Diameter / Aspect 1+2 / Weight+Unit / Nozzle/Bed/Drying
  // temps / TD / RFID Data preview). Basic view's stat cards stay
  // as display-only readouts and don't need any read-only toggling
  // since they're <span>s, not <input>s.
  $("adpAdvancedToggle")?.addEventListener("click", () => {
    const tog = $("adpAdvancedToggle");
    const body = $("adpAdvancedBody");
    if (!tog || !body) return;
    const next = tog.dataset.on !== "true";
    tog.dataset.on = next ? "true" : "false";
    tog.setAttribute("aria-checked", next ? "true" : "false");
    body.hidden = !next;
    if (next) {
      _adpRefreshRfidPreview();
      _adpUpdateBasicReadouts();
    }
  });

  // Type basic ↔ advanced sync — the basic Type select sits in the
  // cog row, the advanced one is part of the full Advanced form.
  // Both write to each other so the value is always consistent.
  $("adpType")?.addEventListener("change", e => {
    const adv = $("adpTypeAdv");
    if (adv) adv.value = e.target.value;
    _adpRefreshRfidPreview();
  });
  $("adpTypeAdv")?.addEventListener("change", e => {
    const sel = $("adpType");
    if (sel) sel.value = e.target.value;
    e.target.dataset.userEdited = "1";
    _adpRefreshRfidPreview();
  });
  // Same for Aspect 1.
  $("adpAspect1")?.addEventListener("change", e => {
    const adv = $("adpAspect1Adv");
    if (adv) adv.value = e.target.value;
    _adpRefreshRfidPreview();
  });
  $("adpAspect1Adv")?.addEventListener("change", e => {
    const sel = $("adpAspect1");
    if (sel) sel.value = e.target.value;
    e.target.dataset.userEdited = "1";
    _adpRefreshRfidPreview();
  });

  // Integer-only fields (.adp-int-only) — strip every non-digit
  // (signs, commas, dots, letters) AND live-clamp to the input's
  // own `max` attribute. Browser <input type="number"> usually
  // handles this but is inconsistent across locales / accepts
  // negatives or huge values. Manual filter = guaranteed clean +
  // never above the chip's real upper bound.
  document.querySelectorAll(".adp-int-only").forEach(el => {
    el.addEventListener("input", () => {
      const raw = String(el.value || "");
      // 1. Strip non-digits (no minus sign — these fields can't be
      //    negative; also strips comma/dot/letters in one pass).
      let cleaned = raw.replace(/[^\d]/g, "");
      // 2. Read the max attribute; live-clamp to it. Lets a single
      //    keystroke ("1234") collapse to "500" instead of letting
      //    the user end up with "1234" and surprise on save.
      const maxAttr = parseInt(el.getAttribute("max") || "", 10);
      if (cleaned !== "" && isFinite(maxAttr)) {
        const v = parseInt(cleaned, 10);
        if (isFinite(v) && v > maxAttr) cleaned = String(maxAttr);
      }
      if (cleaned !== raw) {
        el.value = cleaned;
        // Caret to the end since we may have truncated mid-string.
        try { el.setSelectionRange(cleaned.length, cleaned.length); }
        catch (_) {}
      }
      el.dataset.userEdited = "1";
      _adpUpdateBasicReadouts();
      _adpRefreshRfidPreview();
    });
  });

  // TD (HueForge) — decimal field, comma → dot conversion live.
  // Upper bound clamped IN-LINE on every keystroke (so the user
  // can't end up with "99999999"); lower bound enforced on blur so
  // they can still type "0.5" without hitting the 0.1 floor while
  // mid-stroke at "0".
  $("adpTd")?.addEventListener("input", e => {
    const raw = String(e.target.value || "");
    // Swap commas for dots, then strip anything that isn't a digit
    // or a single dot — permissive during typing.
    let cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
    const firstDot = cleaned.indexOf(".");
    if (firstDot >= 0) {
      cleaned = cleaned.slice(0, firstDot + 1) +
                cleaned.slice(firstDot + 1).replace(/\./g, "");
    }
    // Upper-bound clamp — if the partial value already exceeds 100,
    // truncate to "100". This catches "1000" right after the third
    // zero, and "99.5" only when it crosses 100 (which it never
    // does, so 99.5 stays). Lets the user keep typing decimals.
    const numVal = parseFloat(cleaned);
    if (isFinite(numVal) && numVal > 100) cleaned = "100";
    if (cleaned !== raw) {
      e.target.value = cleaned;
      // Push the caret to the end since we may have truncated mid-string.
      try { e.target.setSelectionRange(cleaned.length, cleaned.length); }
      catch (_) {}
    }
    e.target.dataset.userEdited = "1";
    _adpRefreshRfidPreview();
  });
  // Blur normalisation — TD is OPTIONAL. Empty stays empty (so the
  // field never auto-fills when the user doesn't care about
  // HueForge). When non-empty: clamp to [0.1, 100] and normalise
  // any leading-zero / partial-decimal noise (e.g. "01.5" → "1.5").
  $("adpTd")?.addEventListener("blur", e => {
    const raw = String(e.target.value || "").trim();
    if (raw === "") return;                 // empty → leave empty
    const v = parseFloat(raw);
    if (!isFinite(v))         e.target.value = "";
    else if (v < 0.1)         e.target.value = "0.1";
    else if (v > 100)         e.target.value = "100";
    else                      e.target.value = String(v);
    _adpRefreshRfidPreview();
  });

  // Dual Link toggle — tracked locally on the panel for now (the wire
  // schema doesn't yet have a dedicated field, but mirroring the
  // mobile UI keeps the visual parity). Read via dataset on save.
  $("adpDualLinkToggle")?.addEventListener("click", () => {
    const tog = $("adpDualLinkToggle");
    if (!tog) return;
    const next = tog.dataset.on !== "true";
    tog.dataset.on = next ? "true" : "false";
    tog.setAttribute("aria-checked", next ? "true" : "false");
  });

  // Inline ✕ on the colour-name field — visibility synced with the
  // input value (only shown when there's something to clear).
  $("adpColorNameClear")?.addEventListener("click", () => {
    const inp = $("adpColorName");
    if (!inp) return;
    inp.value = "";
    _adpRefreshColorNameCounter();
    _adpRefreshRfidPreview();
    _adpToggleClearVisibility("");
    inp.focus();
  });

  // Escape — peel one layer at a time: custom-colour sheet → preset
  // sheet → material sheet → brand sheet → side panel. Same
  // nested-close UX as the Snapmaker filament edit cascade.
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("adpColorCustomSheet")?.classList.contains("open")) {
      closeAdpColorCustomSheet();
      return;
    }
    if ($("adpColorSheet")?.classList.contains("open")) {
      closeAdpColorSheet();
      return;
    }
    if ($("adpMaterialSheet")?.classList.contains("open")) {
      closeAdpMaterialSheet();
      return;
    }
    if ($("adpBrandSheet")?.classList.contains("open")) {
      closeAdpBrandSheet();
      return;
    }
    if ($("addProductPanel")?.classList.contains("open")) {
      closeAddProductPanel();
    }
  });

  /* ── settings panel ── */
  const SVG_COPY = `<span class="icon icon-copy icon-13"></span>`;
  function openSettings() {
    if ($("langSelect")) $("langSelect").value = state.lang;
    $("settingsPanel").classList.add("open"); $("settingsOverlay").classList.add("open");
  }
  function closeSettings() {
    $("settingsPanel").classList.remove("open"); $("settingsOverlay").classList.remove("open");
  }
  // (Sidebar Settings button removed — Settings is reached from the
  // account dropdown, just under "Manage profiles". The dropdown's
  // delegated handler dispatches `data-drop-action="open-settings"`
  // → openSettings().)
  $("settingsClose").addEventListener("click", closeSettings);
  $("settingsOverlay").addEventListener("click", closeSettings);

  // Settings → collapsible cards (Data / Tools).  Click the header to
  // expand / collapse the body. State lives in `data-collapsed` on the
  // card, mirrored on `aria-expanded` of the header button. Pure CSS
  // animation via max-height transition on .stg-card-body--collapsible.
  document.querySelectorAll("#settingsPanel .stg-card--collapsible").forEach(card => {
    const head = card.querySelector(".stg-card-head--btn");
    if (!head) return;
    head.addEventListener("click", () => {
      const collapsed = card.dataset.collapsed === "true";
      card.dataset.collapsed = collapsed ? "false" : "true";
      head.setAttribute("aria-expanded", collapsed ? "true" : "false");
    });
  });

  async function openFriends() {
    // Auto-generate public key on first open if missing
    if (!state.publicKey) await regeneratePublicKey();
    loadFriendsList();
    renderFriendsSection();
    $("friendsPanel").classList.add("open"); $("friendsOverlay").classList.add("open");
  }
  function closeFriends() {
    $("friendsPanel").classList.remove("open"); $("friendsOverlay").classList.remove("open");
  }
  $("btnOpenFriends").addEventListener("click", openFriends);
  $("friendsPanelClose").addEventListener("click", closeFriends);
  $("friendsOverlay").addEventListener("click", closeFriends);

  // ── TigerScale module init ─────────────────────────────────────────────
  // Wires panel open/close, health tick, and card event delegation.
  initTigerScale({
    state,
    t,
    esc,
    highlight,
    $,
    reportError,
    fbDb,
    firebase,
    setupHoldToConfirm,
    colorBg,
    slotFillInnerHTML,
    tsToMs,
  });

  const SVG_CHECK = `<span class="icon icon-check icon-13"></span>`;

  $("btnStgExport").addEventListener("click", () => {
    if (!state.inventory) return;
    const blob = new Blob([JSON.stringify(state.inventory,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `tigertag-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // Settings → Data → "Copy API URL"
  // Builds and copies a self-contained URL that scripts (HA, cron, Spoolman
  // bridge, etc.) can curl to fetch this user's inventory remotely.
  //
  // Endpoint shape: cdn.tigertag.io/exportInventory?ApiKey=<key6>&email=<email>
  // The Key6 is a 6-char HTTP API key (different from `state.privateKey` which
  // is for friend-system Firestore rules — DON'T confuse them).
  //
  // Flow:
  //   1. Try to read the existing Key6 from `users/{uid}/apiKeys/apiKey1`
  //      (stored in plaintext as field `keyId`; rules allow owner-read).
  //   2. If none exists, call the Cloud Function `createAccessKey6`
  //      (POST + idToken) which generates one and stores it.
  //   3. Build the URL with `ApiKey` + `email` (the Cloud Function rejects
  //      requests with mismatching email = anti-tampering).
  //   4. Copy to clipboard, display a short warning that the URL is sensitive.
  async function getOrCreateApiKey6() {
    const user = fbAuth().currentUser;
    if (!user) throw new Error("not signed in");
    // Try existing
    try {
      const snap = await fbDb().collection("users").doc(user.uid)
        .collection("apiKeys").doc("apiKey1").get();
      if (snap.exists) {
        const d = snap.data() || {};
        if (d.keyId && d.active !== false) return d.keyId;
      }
    } catch (e) {
      console.warn("[apiKey] read failed:", e?.message);
    }
    // Create via Cloud Function (will rotate, but we just confirmed there's
    // nothing to rotate)
    const idToken = await user.getIdToken();
    const r = await fetch(`${API_BASE}/createAccessKey6`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: { action: "create", label: "tiger-studio" } }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json?.result?.key) {
      throw new Error(json?.error?.message || `createAccessKey6 HTTP ${r.status}`);
    }
    return json.result.key;
  }

  $("btnCopyApiUrl")?.addEventListener("click", async () => {
    const warn = $("stgApiUrlWarn");
    const btn  = $("btnCopyApiUrl");
    const lbl  = btn?.querySelector("[data-i18n='stgCopyApiUrl']");
    const origLabel = lbl?.textContent;
    function setStatus(msg, kind) {
      if (!warn) return;
      warn.textContent = msg;
      warn.dataset.kind = kind || "info";
      warn.hidden = false;
    }
    function flashLabel(text) {
      if (!lbl || !origLabel) return;
      lbl.textContent = text;
      setTimeout(() => { lbl.textContent = origLabel; }, 1500);
    }

    const user = fbAuth().currentUser;
    if (!user) {
      setStatus(t("stgCopyApiUrlNoKey") || "Sign in first.", "err");
      return;
    }
    const email = (user.email || "").trim().toLowerCase();
    if (!email) {
      setStatus(t("stgCopyApiUrlNoKey") || "Email not set on this account.", "err");
      return;
    }
    if (btn) btn.disabled = true;
    setStatus(t("stgCopyApiUrlGenerating") || "Generating URL…", "info");
    try {
      const key = await getOrCreateApiKey6();
      const url = `${API_BASE}/exportInventory?ApiKey=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`;
      await navigator.clipboard.writeText(url);
      setStatus(t("stgCopyApiUrlOk") || "Copied — keep this URL private; anyone with it can read your inventory.", "warn");
      flashLabel(t("settingsCopied") || "Copied!");
    } catch (e) {
      setStatus((t("stgCopyApiUrlErr") || "Copy failed") + ": " + (e?.message || e), "err");
    } finally {
      if (btn) setTimeout(() => { btn.disabled = false; }, 800);
    }
  });

  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeSettings(); closeFriends(); } });
  $("btnSbReload").addEventListener("click", () => loadInventory());

  const SVG_EYE_OFF = `<span class="icon icon-eye-off icon-14"></span>`;
  const SVG_EYE_ON  = `<span class="icon icon-eye-on icon-14"></span>`;
  function makeEyeToggle(btnId, fieldId) {
    const btn = $(btnId), field = $(fieldId);
    if (!btn || !field) return;
    // preventDefault sur mousedown : garde le focus sur l'input → pas de reflow → pas de saut
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => {
      const reveal = !field.classList.contains("revealed");
      field.classList.toggle("revealed", reveal);
      // style direct = repaint immédiat (quirk Chromium avec valeurs définies programmatiquement)
      field.style.webkitTextSecurity = reveal ? "none" : "disc";
      btn.innerHTML = reveal ? SVG_EYE_ON : SVG_EYE_OFF;
    });
  }
  function makeCopyBtn(btnId, fieldId) {
    const btn = $(btnId), field = $(fieldId);
    if (!btn || !field) return;
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => {
      const val = field.value; if (!val) return;
      navigator.clipboard.writeText(val).then(() => {
        btn.innerHTML = SVG_CHECK; btn.classList.add("copied");
        setTimeout(() => { btn.innerHTML = SVG_COPY; btn.classList.remove("copied"); }, 1800);
      });
    });
  }

  /* ── modal: disconnect account ── */
  /* ── modal: edit account ── */
  let _editingAccount = null;
  function openEditAccountModal(acc) {
    _editingAccount = acc || activeAccount(); if (!_editingAccount) return;
    // Atomic paint via the centralised pipeline — gradient,
    // .av-initials text and the photo overlay all in one shot. No
    // textContent on #eacAvatar itself (that would wipe the hover
    // overlay + the avatar menu children, breaking the click flow).
    paintAvatar($("eacAvatar"), _editingAccount);
    $("eacName").textContent    = _editingAccount.displayName || "";
    $("eacName").style.display  = _editingAccount.displayName ? "" : "none";
    $("eacEmail").textContent   = _editingAccount.email || "";
    $("eacAvatarResult").textContent = "";
    $("eacDisplayNameInput").value = _editingAccount.displayName || "";
    $("eacNameResult").textContent = "";
    $("eacAdminBadge").classList.toggle("hidden", !state.isAdmin);
    $("eacDebugRow").classList.toggle("hidden",   !state.isAdmin);
    $("eacDebugToggle").checked = state.debugEnabled;
    const isCustom = _editingAccount?.color === "custom";
    if (isCustom && _editingAccount.customColor) {
      $("eacCustomColor").value = _editingAccount.customColor;
      $("eacSwatchCustom").style.background = getAccGradient(_editingAccount);
    }
    $("eacSwatches").querySelectorAll(".eac-swatch[data-color]").forEach(sw =>
      sw.classList.toggle("active", !isCustom && sw.dataset.color === (_editingAccount?.color || "orange"))
    );
    $("eacSwatchCustom").classList.toggle("active", isCustom);
    $("editAccountModalOverlay").classList.add("open");
  }
  function closeEditAccountModal() {
    $("editAccountModalOverlay").classList.remove("open");
  }
  // avatar dropdown
  $("sbAvatar").addEventListener("click", e => {
    e.stopPropagation();
    if ($("sbUser").classList.contains("sb-user--empty")) {
      openAddAccountModal();
      return;
    }
    // When the user is currently viewing a friend's inventory, the avatar
    // acts as a one-click "return to my own inventory" shortcut. The swap
    // badge overlay (.sb-avatar-swap) is the visual hint — the whole tile
    // is clickable and toggles back to ownership in a single tap.
    if (state.friendView) {
      // Make sure no dropdown is left half-open after the swap.
      if ($("acctDropdown").classList.contains("open")) closeAccountDropdown();
      switchBackToOwnView();
      return;
    }
    $("acctDropdown").classList.contains("open") ? closeAccountDropdown() : openAccountDropdown();
  });
  $("btnAddFirstAccount").addEventListener("click", openAddAccountModal);
  // btnManageProfiles is now rendered dynamically in renderAccountDropdown — listener attached there

  // profiles modal
  $("profilesModalClose").addEventListener("click", closeProfilesModal);
  $("profilesModalOverlay").addEventListener("click", e => { if (e.target === $("profilesModalOverlay")) closeProfilesModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("profilesModalOverlay").classList.contains("open")) closeProfilesModal(); });

  // preset color swatches
  // Resolve the primary hex of an account's chosen colour
  function accPrimaryHex(acc) {
    if (acc?.color === "custom" && acc.customColor) return acc.customColor;
    return (ACCOUNT_COLORS[acc?.color] || ACCOUNT_COLORS.orange)[0];
  }

  // Persist avatar colour as RGB integers in users/{uid} so any surface can read it,
  // and sync the single hex field to userProfiles/{uid} so friends see it immediately.
  function saveColorToFirestore(acc) {
    try {
      const user = fbAuth().currentUser;
      if (!user || user.uid !== acc.id) return;
      const primaryHex = accPrimaryHex(acc);
      const hex = primaryHex.replace(/^#/, "");
      const r = parseInt(hex.slice(0,2), 16);
      const g = parseInt(hex.slice(2,4), 16);
      const b = parseInt(hex.slice(4,6), 16);
      fbDb(user.uid).collection("users").doc(user.uid).set({ color_r: r, color_g: g, color_b: b }, { merge: true });
      syncUserProfile(user.uid, { color: primaryHex });
    } catch (e) { /* non-blocking */ }
  }

  $("eacSwatches").querySelectorAll(".eac-swatch[data-color]").forEach(sw => {
    sw.addEventListener("click", () => {
      if (!_editingAccount) return;
      const color = sw.dataset.color;
      $("eacSwatches").querySelectorAll(".eac-swatch").forEach(s => s.classList.remove("active"));
      sw.classList.add("active");
      const accounts = getAccounts();
      const idx = accounts.findIndex(a => a.id === _editingAccount.id);
      if (idx >= 0) { accounts[idx].color = color; delete accounts[idx].customColor; saveAccounts(accounts); _editingAccount = accounts[idx]; }
      $("eacAvatar").style.background = getAccGradient(_editingAccount);
      $("eacAvatar").style.color = readableTextOn(getAccShadow(_editingAccount));
      if (_editingAccount.id === state.activeAccountId) applyAvatarStyle(_editingAccount);
      renderAccountDropdown();
      saveColorToFirestore(_editingAccount);
    });
  });
  // custom color picker — debounce Firestore write, apply UI instantly
  let _colorDebounce = null;
  $("eacCustomColor").addEventListener("input", () => {
    if (!_editingAccount) return;
    const hex = $("eacCustomColor").value;
    const accounts = getAccounts();
    const idx = accounts.findIndex(a => a.id === _editingAccount.id);
    if (idx >= 0) { accounts[idx].color = "custom"; accounts[idx].customColor = hex; saveAccounts(accounts); _editingAccount = accounts[idx]; }
    $("eacSwatches").querySelectorAll(".eac-swatch").forEach(s => s.classList.remove("active"));
    $("eacSwatchCustom").classList.add("active");
    $("eacSwatchCustom").style.background = getAccGradient(_editingAccount);
    $("eacAvatar").style.background = getAccGradient(_editingAccount);
    $("eacAvatar").style.color = readableTextOn(getAccShadow(_editingAccount));
    if (_editingAccount.id === state.activeAccountId) applyAvatarStyle(_editingAccount);
    renderAccountDropdown();
    clearTimeout(_colorDebounce);
    _colorDebounce = setTimeout(() => saveColorToFirestore(_editingAccount), 600);
  });

  $("editAccountModalClose").addEventListener("click", closeEditAccountModal);
  $("editAccountModalOverlay").addEventListener("click", e => { if (e.target === $("editAccountModalOverlay")) closeEditAccountModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("editAccountModalOverlay").classList.contains("open")) closeEditAccountModal(); });

  // ── Custom avatar — Discord-style edit flow in edit-account modal ──
  // Click on the avatar opens a small popover menu (Change / Remove),
  // wired further down. Hover state (the pen icon) is pure CSS, no JS.
  $("eacAvatar")?.addEventListener("click", e => {
    e.stopPropagation();
    _toggleAvatarMenu();
  });
  // Close the menu on outside click or Escape — standard popover UX.
  document.addEventListener("click", e => {
    if (!$("avatarMenu")?.classList.contains("open")) return;
    if (e.target.closest("#avatarMenu") || e.target.closest("#eacAvatar")) return;
    _closeAvatarMenu();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && $("avatarMenu")?.classList.contains("open")) {
      _closeAvatarMenu();
    }
  });

  // Menu actions. `stopPropagation` is critical — without it the click
  // bubbles up through #avatarMenu to #eacAvatar, whose own handler
  // would re-toggle the menu open immediately after we close it.
  $("avatarMenuChange")?.addEventListener("click", async e => {
    e.stopPropagation();
    _closeAvatarMenu();
    const res = $("eacAvatarResult");
    // Pick + crop + upload — failures surface in the result line.
    const file = await _pickAvatarFile();
    if (!file) return;
    let bitmap;
    try { bitmap = await _decodeImageBlob(file); }
    catch { res.style.color = "var(--danger)"; res.textContent = t("avatarUploadFailed"); return; }
    const cropped = await openAvatarCropper(bitmap);
    if (!cropped) return;  // user cancelled in cropper
    res.style.color = "var(--muted)"; res.textContent = t("avatarUploading");
    try {
      const url = await uploadCroppedAvatar(cropped.blob, cropped.contentType);
      _renderAvatarPhotoOverlay($("eacAvatar"), url);
      res.style.color = "var(--success)"; res.textContent = t("avatarUploadOk");
      setTimeout(() => { res.textContent = ""; }, 2000);
    } catch (e) {
      console.warn("[avatar.upload]", e);
      res.style.color = "var(--danger)";
      res.textContent = t(e.message === "too-large" ? "avatarTooLarge" : "avatarUploadFailed");
    }
  });
  $("avatarMenuRemove")?.addEventListener("click", async e => {
    e.stopPropagation();
    _closeAvatarMenu();
    const res = $("eacAvatarResult");
    res.style.color = "var(--muted)"; res.textContent = t("avatarRemoving");
    try {
      await removeCustomAvatar();
      _renderAvatarPhotoOverlay($("eacAvatar"), null);
      res.style.color = "var(--success)"; res.textContent = t("avatarRemoveOk");
      setTimeout(() => { res.textContent = ""; }, 2000);
    } catch (e) {
      console.warn("[avatar.remove]", e);
      res.style.color = "var(--danger)"; res.textContent = t("avatarRemoveFailed");
    }
  });

  // Open/close the popover. "Remove" is gated on state.photoURL so the
  // menu shows only the relevant options. If there's no photo, only
  // "Change" appears — same UX as Discord.
  function _toggleAvatarMenu() {
    const menu = $("avatarMenu");
    if (!menu) return;
    if (menu.classList.contains("open")) { _closeAvatarMenu(); return; }
    $("avatarMenuRemove").hidden = !state.photoURL;
    menu.classList.add("open");
  }
  function _closeAvatarMenu() { $("avatarMenu")?.classList.remove("open"); }

  // Save display name
  async function saveDisplayName() {
    if (!_editingAccount) return;
    const newName = $("eacDisplayNameInput").value.trim();
    const res = $("eacNameResult");
    if (!newName) { res.style.color = "var(--danger)"; res.textContent = "—"; return; }
    if (newName === (_editingAccount.displayName || "")) {
      res.style.color = "var(--muted)"; res.textContent = "✓";
      setTimeout(() => { res.textContent = ""; }, 1200); return;
    }
    res.style.color = "var(--muted)"; res.textContent = "Saving…";
    try {
      // 1. Firebase Auth profile
      const user = fbAuth().currentUser;
      if (user) await user.updateProfile({ displayName: newName });
      // 2. Firestore users/{uid}
      if (user) await fbDb().collection("users").doc(user.uid).set({ displayName: newName }, { merge: true });
      // 3. localStorage account
      const accounts = getAccounts();
      const idx = accounts.findIndex(a => a.id === _editingAccount.id);
      if (idx >= 0) { accounts[idx].displayName = newName; saveAccounts(accounts); _editingAccount = accounts[idx]; }
      // 4. Sync public profile so friends see the new name immediately
      if (user) syncUserProfile(user.uid, { displayName: newName });
      // 5. Refresh UI through the centralised avatar pipeline so
      //    gradient + initials + photo overlay stay in sync.
      $("eacName").textContent = newName; $("eacName").style.display = "";
      paintAvatar($("eacAvatar"), _editingAccount);
      if (_editingAccount.id === state.activeAccountId) {
        state.displayName = newName;
        $("sbName").textContent = newName;
        paintAvatar($("sbAvatar"), _editingAccount);
        renderFriendBanner();
      }
      renderAccountDropdown();
      res.style.color = "var(--primary)"; res.textContent = "✓ Saved";
      setTimeout(() => { res.textContent = ""; }, 2000);
    } catch (e) {
      res.style.color = "var(--danger)"; res.textContent = e.message || "Error";
    }
  }
  $("btnSaveDisplayName").addEventListener("click", saveDisplayName);
  $("eacDisplayNameInput").addEventListener("keydown", e => { if (e.key === "Enter") saveDisplayName(); });

  $("eacDebugToggle").addEventListener("change", async () => {
    const enabled = $("eacDebugToggle").checked;
    state.debugEnabled = enabled;
    applyDebugMode();
    // Re-render any open detail / side panel so the Raw + Log sections
    // appear / disappear immediately without forcing the user to close
    // and reopen them.
    if (state.selected && $("detailPanel")?.classList.contains("open")) {
      try { openDetail(state.selected); } catch (_) {}
    }
    if (_activePrinter && $("printerPanel")?.classList.contains("open")) {
      try { renderPrinterDetail(); } catch (_) {}
    }
    const uid = state.activeAccountId; if (!uid) return;
    try {
      await fbDb().collection("users").doc(uid).set({ Debug: enabled }, { merge: true });
    } catch (e) { console.warn("[Firestore] debug toggle:", e.message); }
  });

  // Disconnect = Firebase sign-out
  $("btnEditModalDisconnect").addEventListener("click", async () => {
    if (!_editingAccount) return;
    closeEditAccountModal();
    await fbSignOut();
  });

  /* ── modal: login (Firebase) ── */
  let _lmMode = "signin"; // "signin" | "create"

  function lmSetMode(mode) {
    _lmMode = mode;
    const create = mode === "create";
    $("lmConfirmWrap").classList.toggle("hidden", !create);
    $("lmSignInExtras").classList.toggle("hidden", create);
    $("stgPassword").setAttribute("autocomplete", create ? "new-password" : "current-password");
    // Update dynamic labels (data-i18n + textContent)
    const set = (id, key) => { $(id).dataset.i18n = key; $(id).textContent = t(key); };
    set("lmTitle",          create ? "loginCreateTitle"    : "loginSignInTitle");
    set("lmSubtitle",       create ? "loginCreateSubtitle" : "loginSignInSubtitle");
    set("lmSubmitLabel",    create ? "loginCreateAccount"  : "btnSignIn");
    set("lmToggleText",     create ? "loginHaveAccount"    : "loginNoAccount");
    set("btnToggleAuthMode",create ? "btnSignIn"           : "loginCreateAccount");
    $("addModalResult").innerHTML = "";
  }

  function openAddAccountModal() {
    $("stgEmail").value = "";
    $("stgPassword").value = "";
    $("stgConfirmPassword").value = "";
    $("stgPassword").classList.remove("revealed");
    $("stgConfirmPassword").classList.remove("revealed");
    $("btnToggleStgPassword").innerHTML = SVG_EYE_OFF;
    $("btnToggleConfirmPassword").innerHTML = SVG_EYE_OFF;
    $("addModalResult").innerHTML = "";
    $("stgRememberMe").checked = true;
    lmSetMode("signin");
    // Sync language select to current app language
    $("lmLangSelect").value = state.lang;
    $("addAccountModalOverlay").classList.add("open");
    setTimeout(() => $("stgEmail").focus(), 180);
  }

  function closeAddAccountModal() {
    $("addAccountModalOverlay").classList.remove("open");
  }

  $("addModalClose").addEventListener("click", closeAddAccountModal);
  $("addAccountModalOverlay").addEventListener("click", e => { if (e.target === $("addAccountModalOverlay")) closeAddAccountModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("addAccountModalOverlay").classList.contains("open")) closeAddAccountModal(); });

  // Eye toggles for both password fields
  makeEyeToggle("btnToggleStgPassword", "stgPassword");
  makeEyeToggle("btnToggleConfirmPassword", "stgConfirmPassword");

  // Language switcher inside the login modal
  $("lmLangSelect").addEventListener("change", () => {
    const lang = $("lmLangSelect").value;
    saveAccountLang(lang);
    applyLang(lang);
  });

  // Mode toggle: sign-in ↔ create account
  $("btnToggleAuthMode").addEventListener("click", () => {
    lmSetMode(_lmMode === "signin" ? "create" : "signin");
  });

  // Forgot password
  $("btnForgotPassword").addEventListener("click", async () => {
    const email = $("stgEmail").value.trim();
    if (!email) { $("stgEmail").focus(); return; }
    $("addModalResult").innerHTML = "";
    try {
      await fbAuth().sendPasswordResetEmail(email);
      toast($("addModalResult"), "ok", t("loginResetSent"));
    } catch (err) {
      reportError("auth.resetPassword", err);
      toast($("addModalResult"), "bad", err.message || t("networkError"), { err, context: "auth.resetPassword" });
    }
  });

  // Google sign-in.
  //
  // In Electron we use the loopback OAuth flow (RFC 8252 + PKCE) — the
  // system browser handles the actual auth, which means Touch ID / passkey
  // / hardware keys work NATIVELY (Safari has full WebAuthn integration
  // with the macOS keychain; the Chromium popup spawned by
  // signInWithPopup does not).
  //
  // Outside Electron (future web build hosted on tigertag-cdn) we fall
  // back to signInWithPopup — that one works fine in real browsers.
  //
  // Either path produces the same end state: a signed-in firebase.User
  // we can hand to ensureFirebaseApp / setActiveId / setupNamedAuth.
  $("btnGoogleSignIn").addEventListener("click", async () => {
    setLoading($("btnGoogleSignIn"), true);
    $("addModalResult").innerHTML = "";
    try {
      let result;
      const loopback = window.electronAPI?.signInWithGoogleLoopback;
      if (loopback) {
        // Native Electron flow — opens Safari, returns once the user
        // completes the auth. The renderer stays unblocked but waits on
        // the IPC promise (the system browser is the real UI here).
        const r = await loopback();
        if (!r?.ok) {
          // Loopback failed (user closed the browser tab, network error, etc.).
          // Fall back to signInWithPopup — it may hit the passkey screen but
          // the user can click "Try another method" → password to proceed.
          console.warn("[auth.google] loopback failed, falling back to popup:", r?.error);
          const provider = new firebase.auth.GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          result = await firebase.auth().signInWithPopup(provider);
        } else {
          // Build a Firebase credential from the tokens Google returned.
          // We pass BOTH idToken and accessToken: if the idToken's audience
          // doesn't match a Firebase-known OAuth client, Firebase falls
          // back to using the accessToken against Google's userinfo
          // endpoint (no audience constraint there).
          const credential = firebase.auth.GoogleAuthProvider.credential(r.idToken, r.accessToken);
          result = await firebase.auth().signInWithCredential(credential);
        }
      } else {
        // Non-Electron environments (future web build) — popup works
        // because the host browser owns the WebAuthn UI.
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        result = await firebase.auth().signInWithPopup(provider);
      }
      const uid = result.user.uid;
      // Transfer session to named instance, mark active, register listener,
      // then call handleSignedIn EXPLICITLY so the UI updates even if the
      // named-app onAuthStateChanged doesn't re-fire (Electron popup quirk).
      ensureFirebaseApp(uid);
      await firebase.app(uid).auth().updateCurrentUser(result.user);
      setActiveId(uid);
      setupNamedAuth(uid);
      await firebase.auth().signOut();
      closeAddAccountModal();
      await handleSignedIn(result.user, uid);   // ← explicit UI refresh
    } catch (err) {
      const code = err.code || "";
      if (code !== "auth/popup-closed-by-user") {
        reportError("auth.google", err);
        toast($("addModalResult"), "bad", t("addAccountAuthError"), { err, context: "auth.google" });
      }
    } finally { setLoading($("btnGoogleSignIn"), false); }
  });

  // Email/password sign-in or create account
  $("btnStgSave").addEventListener("click", async () => {
    const email    = $("stgEmail").value.trim();
    const password = $("stgPassword").value;
    if (!email || !password) return;
    setLoading($("btnStgSave"), true);
    $("addModalResult").innerHTML = "";
    try {
      const remember = $("stgRememberMe").checked;
      const persistence = remember
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
      if (_lmMode === "create") {
        const confirm = $("stgConfirmPassword").value;
        if (password !== confirm) {
          toast($("addModalResult"), "bad", t("loginPasswordMismatch"));
          setLoading($("btnStgSave"), false);
          return;
        }
        if (password.length < 6) {
          toast($("addModalResult"), "bad", t("loginPasswordTooShort"));
          setLoading($("btnStgSave"), false);
          return;
        }
        // Create on DEFAULT, transfer to named instance, register listener,
        // then call handleSignedIn EXPLICITLY for guaranteed UI refresh.
        const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const uid = result.user.uid;
        ensureFirebaseApp(uid);
        await firebase.app(uid).auth().setPersistence(persistence);
        await firebase.app(uid).auth().updateCurrentUser(result.user);
        setActiveId(uid);
        setupNamedAuth(uid);
        await firebase.auth().signOut();
        toast($("addModalResult"), "ok", t("loginAccountCreated"));
        setTimeout(closeAddAccountModal, 1400);
        await handleSignedIn(result.user, uid);
      } else {
        // Sign in on DEFAULT, transfer to named instance, register listener,
        // then call handleSignedIn EXPLICITLY for guaranteed UI refresh.
        const result = await firebase.auth().signInWithEmailAndPassword(email, password);
        const uid = result.user.uid;
        ensureFirebaseApp(uid);
        await firebase.app(uid).auth().setPersistence(persistence);
        await firebase.app(uid).auth().updateCurrentUser(result.user);
        setActiveId(uid);
        setupNamedAuth(uid);
        await firebase.auth().signOut();
        closeAddAccountModal();
        await handleSignedIn(result.user, uid);
      }
    } catch (err) {
      const code = err.code || "";
      const msg = (code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-credential")
        ? t("addAccountAuthError")
        : code === "auth/email-already-in-use"
          ? t("loginEmailInUse")
          : (err.message || t("networkError"));
      reportError(_lmMode === "create" ? "auth.create" : "auth.signin", err);
      toast($("addModalResult"), "bad", msg, { err, context: _lmMode === "create" ? "auth.create" : "auth.signin" });
    }
    setLoading($("btnStgSave"), false);
  });

  // Allow Enter key in either password field to submit
  $("stgPassword").addEventListener("keydown", e => { if (e.key === "Enter") $("btnStgSave").click(); });
  $("stgConfirmPassword").addEventListener("keydown", e => { if (e.key === "Enter") $("btnStgSave").click(); });

  /* ── sidebar collapse toggle ── */
  (function() {
    const sidebar = $("sidebar");
    if (localStorage.getItem("tigertag.sidebar") === "collapsed") {
      sidebar.classList.add("collapsed");
    }
    $("btnSidebarToggle").addEventListener("click", () => {
      const collapsed = sidebar.classList.toggle("collapsed");
      localStorage.setItem("tigertag.sidebar", collapsed ? "collapsed" : "expanded");
    });
  })();

  /* ── account storage helpers ── */
  function getAccounts() { try { return JSON.parse(localStorage.getItem(STORAGE_ACCOUNTS) || "[]"); } catch { return []; } }
  function saveAccounts(arr) { localStorage.setItem(STORAGE_ACCOUNTS, JSON.stringify(arr)); }
  function getActiveId() { return localStorage.getItem(STORAGE_ACTIVE) || null; }
  function setActiveId(id) { localStorage.setItem(STORAGE_ACTIVE, id); state.activeAccountId = id; }
  function activeAccount() { const id = getActiveId(); return getAccounts().find(a => a.id === id) || null; }

  /* ── persistence ── */
  function saveInventory(raw) {
    if (!state.activeAccountId) return;
    try { localStorage.setItem(invKey(state.activeAccountId), JSON.stringify(raw)); } catch {}
  }

  /* ── forced migration: wipe pre-Firebase accounts (those that have apiKey field) ── */
  function runMigration() {
    const accounts = getAccounts();
    const hasLegacy = accounts.some(a => "apiKey" in a);
    if (!hasLegacy) return;
    accounts.forEach(a => localStorage.removeItem(invKey(a.id)));
    localStorage.removeItem(STORAGE_ACCOUNTS);
    localStorage.removeItem(STORAGE_ACTIVE);
    localStorage.removeItem("tigertag.creds");
    localStorage.removeItem("tigertag.inventory");
    console.info("[Migration] Legacy API-key accounts wiped. Please sign in with Firebase Auth.");
  }

  /* ── Firebase sign-out (named instance of active account) ── */
  async function fbSignOut() {
    unsubscribeInventory();
    const id = state.activeAccountId;
    if (id) { try { await firebase.app(id).auth().signOut(); } catch (_) {} }
    try { await firebase.auth().signOut(); } catch (_) {} // clean up DEFAULT too
  }

  /* ── UID format migration — decimal big-endian → hex uppercase ─────────
     The legacy mobile app (still in production at the time this code was
     written) creates `inventory/{spoolId}` doc ids in DECIMAL big-endian
     form, e.g. "8307741719072896". The canonical format going forward is
     HEX uppercase, no separators, e.g. "1D895E7C004A80". Both forms decode
     to the same integer.

     SHARED RESPONSIBILITY — every TigerTag client that has write access and
     sees a decimal-format inventory doc converts it to hex on the fly:
       - Tiger Studio Manager (here)
       - The new mobile app version (once deployed) — same algorithm, ported
       - TigerScale firmware writes hex from day one; for old decimal docs it
         encounters, it does a fallback lookup via `uidMigrationMap` (see
         tigerscale-doc-schema.md §"Mixed-format tolerance").

     The lookup table `users/{uid}/uidMigrationMap/{decimal_uid}` →
     `{ hex_uid, migrated_at }` lets external clients holding old decimal
     ids resolve them to the new hex doc ids without scanning the inventory.

     Properties of this implementation:
       1. Idempotent. If the hex doc already exists (re-run, partial
          migration, or another client beat us to it), we just clean up
          the decimal stub and write the map entry.
       2. Atomic per spool. One Firestore batch handles: SET hex doc,
          UPDATE every other doc whose `twin_tag_uid` pointed at this
          decimal id, SET map entry, DELETE decimal doc. All-or-nothing.
       3. Safe vs concurrent mobile-app writes. If the mobile app PATCHes
          the just-deleted decimal doc, Firestore creates a stub with
          partial data; the next snapshot re-queues it, we merge it back
          into the hex doc with `{merge: true}`, no data loss.
       4. Background, polite. Drains one spool every ~200 ms so we don't
          burst Firestore quota during a big initial sweep.
       5. Owner-only. Never runs while previewing a friend's inventory
          (state.friendView short-circuit).
  */
  const _uidMigrationQueue = [];        // [decimalId, ...] — pending
  let   _uidMigrationDraining = false;
  const _uidMigrationStats = { migrated: 0, skipped: 0, failed: 0 };
  // ── UI state for the migration flow ─────────────────────────────────
  // Two modals coordinate the experience:
  //   1. Confirm modal — shown ONCE per session when decimal docs are
  //      first detected. The user picks "Update now" / "Remind me later"
  //      / "Later". Until they choose "Update now", we never queue a
  //      migration.
  //   2. Progress lock-screen — shown only after consent, while the
  //      backlog is being drained. Once that initial sweep completes,
  //      subsequent migrations (mobile app creating one new decimal doc
  //      here and there) run silently — they're too quick to bother.
  let   _uidMigrationInitialSweepDone = false;
  let   _uidMigrationModalOpen        = false;
  let   _uidMigrationInitialTotal     = 0;
  // User-consent gating — read at the start of every snapshot. Reset on
  // every sign-out / account switch / app launch, which is exactly what
  // we want: "Remind me later" defers for the current session only and
  // re-prompts on the next launch. No persistent snooze.
  let   _uidMigrationUserAccepted     = false;
  let   _uidMigrationDeferredThisSession = false;
  let   _uidMigrationConfirmOpen      = false;
  // Pure decimal string check. We exclude leading zeros (other than the
  // standalone "0") because a real BigInt's toString() never has them —
  // a leading zero would mean someone wrote a malformed id we shouldn't
  // touch.
  function isDecimalSpoolId(id) {
    return typeof id === "string" && /^\d+$/.test(id) && (id === "0" || id[0] !== "0");
  }
  function decimalSpoolIdToHex(decimal) {
    try { return BigInt(decimal).toString(16).toUpperCase(); }
    catch { return null; }
  }

  /* ── Rack-shape migration — flat → nested `rack` object ────────────────
     Same UX pattern as the UID migration: consent modal (Update now /
     Remind me later) → progress modal with bar → silent done state.
     Studio Manager is the SOLE client that touches rack data (the
     Flutter mobile app and TigerScale firmware ignore these fields)
     so the migration is safe to be destructive — we drop the legacy
     `rack_id`/`level`/`position` keys via FieldValue.delete().         */
  let _rackMigrationConfirmOpen        = false;
  let _rackMigrationDeferredThisSession = false;
  let _rackMigrationUserAccepted       = false;
  let _rackMigrationModalOpen          = false;
  let _rackMigrationInitialSweepDone   = false;
  let _rackMigrationInitialTotal       = 0;
  let _rackMigrationDraining           = false;
  let _rackMigrationStats              = { migrated: 0, failed: 0 };
  let _rackMigrationQueue              = []; // array of { spoolId, data }

  function maybeMigrateFlatRackToNested(ownerUid) {
    if (state.friendView) return;
    if (!ownerUid || !state.inventory) return;
    if (_rackMigrationDeferredThisSession) return;
    // Don't pile a second consent / progress modal on top of the UID
    // migration — wait for that one to finish first.
    if (_uidMigrationConfirmOpen || _uidMigrationModalOpen) return;

    // Find every doc still using the flat schema in the current snapshot.
    const flatDocs = [];
    for (const [spoolId, data] of Object.entries(state.inventory)) {
      if (!data) continue;
      const alreadyNested = data.rack && typeof data.rack === "object" && data.rack.id;
      if (alreadyNested) continue;
      if (!data.rack_id) continue;
      flatDocs.push({ spoolId, data });
    }
    if (flatDocs.length === 0) return;

    if (_rackMigrationUserAccepted) {
      // Already accepted — enqueue any newly-discovered flat docs and
      // (re-)kick the drain.
      let added = 0;
      for (const item of flatDocs) {
        if (_rackMigrationQueue.some(q => q.spoolId === item.spoolId)) continue;
        _rackMigrationQueue.push(item);
        added++;
      }
      if (!_rackMigrationInitialSweepDone &&
          !_rackMigrationModalOpen &&
          _rackMigrationQueue.length >= 3) {
        _rackMigrationInitialTotal = _rackMigrationQueue.length;
        showRackMigrationModal(_rackMigrationInitialTotal);
        _rackMigrationModalOpen = true;
      }
      if (_rackMigrationModalOpen && added > 0) {
        const completed = _rackMigrationStats.migrated + _rackMigrationStats.failed;
        _rackMigrationInitialTotal = Math.max(
          _rackMigrationInitialTotal,
          completed + _rackMigrationQueue.length
        );
        updateRackMigrationModalProgress(completed, _rackMigrationInitialTotal);
      }
      drainRackMigrationQueue(ownerUid);
      return;
    }
    // Not asked yet — show the consent modal.
    if (!_rackMigrationConfirmOpen) {
      showRackMigrationConfirmModal(flatDocs.length, ownerUid);
    }
  }

  // Consent modal — re-uses the UID migration overlay but rewrites the
  // title / message text from the rackMigr* i18n keys.
  function showRackMigrationConfirmModal(flatCount, ownerUid) {
    const overlay = $("uidMigrationConfirmOverlay");
    if (!overlay) return;
    _rackMigrationConfirmOpen = true;
    const titleEl   = $("uidMigrationConfirmTitle");
    const msgEl     = $("uidMigrationConfirmMsg");
    const remindBtn = $("uidMigrationConfirmRemind");
    const acceptBtn = $("uidMigrationConfirmAccept");
    const duration = formatMigrationDuration(flatCount);
    // Generic title/message — same as the UID migration prompt so the
    // user gets a consistent, reassuring experience whichever migration
    // is queued.
    if (titleEl)   titleEl.textContent   = t("migrationConfirmTitle");
    if (msgEl)     msgEl.textContent     = t("migrationConfirmMsg", { count: flatCount, duration });
    if (remindBtn) remindBtn.textContent = t("uidMigrConfirmRemind");
    if (acceptBtn) acceptBtn.textContent = t("uidMigrConfirmAccept");
    overlay.classList.add("open");

    const rebind = (id, handler) => {
      const old = $(id);
      if (!old) return;
      const fresh = old.cloneNode(true);
      old.parentNode.replaceChild(fresh, old);
      fresh.addEventListener("click", handler);
    };
    rebind("uidMigrationConfirmAccept", () => {
      _rackMigrationConfirmOpen = false;
      _rackMigrationUserAccepted = true;
      overlay.classList.remove("open");
      maybeMigrateFlatRackToNested(ownerUid);
    });
    rebind("uidMigrationConfirmRemind", () => {
      _rackMigrationConfirmOpen = false;
      _rackMigrationDeferredThisSession = true;
      overlay.classList.remove("open");
    });
  }

  // Progress modal — same overlay, rack-flavoured text.
  function showRackMigrationModal(total) {
    const overlay = $("uidMigrationOverlay");
    if (!overlay) return;
    overlay.classList.add("open");
    const card = overlay.querySelector(".uid-migr-card");
    card?.classList.remove("uid-migr--done");
    const titleEl = $("uidMigrationTitle");
    const msgEl   = $("uidMigrationMsg");
    const warnEl  = $("uidMigrationWarn");
    if (titleEl) titleEl.textContent = t("migrationProgressTitle");
    if (msgEl)   msgEl.textContent   = t("migrationProgressMsg");
    if (warnEl)  warnEl.textContent  = t("migrationProgressWarn");
    updateRackMigrationModalProgress(0, total);
    try { window.electronAPI?.setMigrationInFlight?.(true); } catch {}
  }
  function updateRackMigrationModalProgress(done, total) {
    const countEl = $("uidMigrationCount");
    const barEl   = $("uidMigrationBar");
    if (!countEl || !barEl) return;
    countEl.textContent = `${done} / ${total}`;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    barEl.style.width = `${pct}%`;
  }
  function hideRackMigrationModalWithSuccess() {
    const overlay = $("uidMigrationOverlay");
    if (!overlay) return;
    const card = overlay.querySelector(".uid-migr-card");
    card?.classList.add("uid-migr--done");
    updateRackMigrationModalProgress(_rackMigrationInitialTotal, _rackMigrationInitialTotal);
    try { window.electronAPI?.setMigrationInFlight?.(false); } catch {}
    setTimeout(() => {
      overlay.classList.remove("open");
      card?.classList.remove("uid-migr--done");
    }, 1800);
  }

  async function drainRackMigrationQueue(ownerUid) {
    if (_rackMigrationDraining) return;
    _rackMigrationDraining = true;
    const FV = firebase.firestore.FieldValue;
    const invRef = fbDb().collection("users").doc(ownerUid).collection("inventory");
    try {
      while (_rackMigrationQueue.length > 0) {
        if (state.activeAccountId !== ownerUid) break;
        if (state.friendView) break;
        const { spoolId, data } = _rackMigrationQueue.shift();
        try {
          const rack = {
            id: data.rack_id,
            level:    Number.isInteger(data.level)    ? data.level    : null,
            position: Number.isInteger(data.position) ? data.position : null
          };
          await invRef.doc(spoolId).update({
            rack,
            rack_id:  FV.delete(),
            level:    FV.delete(),
            position: FV.delete()
          });
          _rackMigrationStats.migrated++;
        } catch (e) {
          console.warn(`[rackMigration] ${spoolId} failed:`, e?.code, e?.message);
          _rackMigrationStats.failed++;
        }
        if (_rackMigrationModalOpen) {
          const completed = _rackMigrationStats.migrated + _rackMigrationStats.failed;
          updateRackMigrationModalProgress(completed, _rackMigrationInitialTotal);
        }
        const gapMs = _rackMigrationQueue.length > 50 ? 500 : 250;
        await new Promise(r => setTimeout(r, gapMs));
      }
    } finally {
      _rackMigrationDraining = false;
      if (_rackMigrationModalOpen && _rackMigrationQueue.length === 0) {
        _rackMigrationInitialSweepDone = true;
        _rackMigrationModalOpen = false;
        hideRackMigrationModalWithSuccess();
        console.log(`[rackMigration] initial sweep done — migrated:${_rackMigrationStats.migrated} failed:${_rackMigrationStats.failed}`);
      }
    }
  }

  function maybeMigrateDecimalSpoolIds(ownerUid) {
    if (state.friendView) return;
    if (!ownerUid || !state.inventory) return;
    // Consent gating — never enqueue or migrate without explicit user
    // acceptance. The user can defer this session ("Remind me later")
    // or accept ("Update now"). The deferred flag resets on sign-out /
    // account switch / app relaunch, so the prompt re-fires next session.
    if (_uidMigrationDeferredThisSession) return;
    // Count decimal docs visible in the current snapshot
    const decimalIds = [];
    for (const docId of Object.keys(state.inventory)) {
      if (isDecimalSpoolId(docId)) decimalIds.push(docId);
    }
    if (decimalIds.length === 0) return;
    // Branch 1 — user already accepted earlier in this session: just
    // enqueue any newly-discovered decimal docs (mobile app concurrent
    // writes) and let the drain run.
    if (_uidMigrationUserAccepted) {
      let queuedNow = 0;
      for (const docId of decimalIds) {
        if (_uidMigrationQueue.includes(docId)) continue;
        _uidMigrationQueue.push(docId);
        queuedNow++;
      }
      // First-sweep heuristic — only show the progress modal when the
      // backlog is non-trivial. Subsequent single-doc concurrent
      // migrations during the same session run silently.
      if (!_uidMigrationInitialSweepDone &&
          !_uidMigrationModalOpen &&
          _uidMigrationQueue.length >= 3) {
        _uidMigrationInitialTotal = _uidMigrationQueue.length;
        showUidMigrationModal(_uidMigrationInitialTotal);
        _uidMigrationModalOpen = true;
      }
      if (_uidMigrationModalOpen && queuedNow > 0) {
        const completed = _uidMigrationStats.migrated + _uidMigrationStats.skipped + _uidMigrationStats.failed;
        _uidMigrationInitialTotal = Math.max(
          _uidMigrationInitialTotal,
          completed + _uidMigrationQueue.length
        );
        updateUidMigrationModalProgress(completed, _uidMigrationInitialTotal);
      }
      drainUidMigrationQueue(ownerUid);
      return;
    }
    // Branch 2 — first time we discover decimal docs this session and
    // the user hasn't been asked yet: pop the consent modal. Until they
    // click "Update now", we don't enqueue anything.
    if (!_uidMigrationConfirmOpen) {
      showUidMigrationConfirmModal(decimalIds.length, ownerUid);
    }
  }

  // ── Phase 1 — consent modal ──────────────────────────────────────────
  // Estimated migration duration based on observed throughput (~0.75 s
  // per spool when the queue is small enough for the 250 ms politeness
  // gap, ~1.0 s per spool above the 50-spool threshold which triggers
  // the 500 ms gap). The estimate is rounded to a humane unit (whole
  // seconds below 60, whole minutes above) and pluralised via i18n.
  function estimateMigrationDurationSeconds(spoolCount) {
    if (spoolCount <= 0) return 0;
    if (spoolCount <= 50) return Math.round(spoolCount * 0.75);
    return Math.round(50 * 0.75 + (spoolCount - 50) * 1.0);
  }
  function formatMigrationDuration(spoolCount) {
    const sec = estimateMigrationDurationSeconds(spoolCount);
    if (sec < 60) {
      const n = Math.max(1, sec);   // never display "0 seconds"
      return t("uidMigrDurationSeconds", { n });
    }
    const minutes = Math.max(1, Math.round(sec / 60));
    return t("uidMigrDurationMinutes", { n: minutes });
  }

  function showUidMigrationConfirmModal(decimalCount, ownerUid) {
    const overlay = $("uidMigrationConfirmOverlay");
    if (!overlay) return;
    _uidMigrationConfirmOpen = true;
    // Title + buttons get translated from data-i18n via applyTranslations(),
    // but the message carries a `{{count}}` and a `{{duration}}` that we
    // can only resolve once we know the spool count, so we render it here.
    const titleEl = $("uidMigrationConfirmTitle");
    const msgEl   = $("uidMigrationConfirmMsg");
    const remindBtn = $("uidMigrationConfirmRemind");
    const acceptBtn = $("uidMigrationConfirmAccept");
    const duration = formatMigrationDuration(decimalCount);
    // Generic title/message — same wording whatever the migration. The
    // user only needs reassurance that data stays put + a count + an
    // ETA; what's actually being repackaged is irrelevant.
    if (titleEl)   titleEl.textContent   = t("migrationConfirmTitle");
    if (msgEl)     msgEl.textContent     = t("migrationConfirmMsg", { count: decimalCount, duration });
    if (remindBtn) remindBtn.textContent = t("uidMigrConfirmRemind");
    if (acceptBtn) acceptBtn.textContent = t("uidMigrConfirmAccept");
    overlay.classList.add("open");

    // Re-bind buttons every time we open. We replace the nodes with a
    // clone to drop any previously attached listener — simpler than
    // tracking handler references across multiple opens.
    const rebind = (id, handler) => {
      const old = $(id);
      if (!old) return;
      const fresh = old.cloneNode(true);
      old.parentNode.replaceChild(fresh, old);
      fresh.addEventListener("click", handler);
    };

    rebind("uidMigrationConfirmAccept", () => {
      _uidMigrationConfirmOpen = false;
      _uidMigrationUserAccepted = true;
      overlay.classList.remove("open");
      // Re-trigger the snapshot path so we enqueue + drain right away.
      maybeMigrateDecimalSpoolIds(ownerUid);
    });
    rebind("uidMigrationConfirmRemind", () => {
      _uidMigrationConfirmOpen = false;
      // Defer this session only — the prompt will re-fire on the next
      // app launch / sign-in (no persistent snooze).
      _uidMigrationDeferredThisSession = true;
      overlay.classList.remove("open");
    });
  }

  // ── Modal helpers — full lock-screen during the initial sweep ────────
  function showUidMigrationModal(total) {
    const overlay = $("uidMigrationOverlay");
    if (!overlay) return;
    overlay.classList.add("open");
    const card = overlay.querySelector(".uid-migr-card");
    card?.classList.remove("uid-migr--done");
    // Translate the static text via i18n on every open so a language
    // switch between sessions takes effect.
    const titleEl = $("uidMigrationTitle");
    const msgEl   = $("uidMigrationMsg");
    const warnEl  = $("uidMigrationWarn");
    // Generic progress copy — same modal whatever the underlying migration.
    if (titleEl) titleEl.textContent = t("migrationProgressTitle");
    if (msgEl)   msgEl.textContent   = t("migrationProgressMsg");
    if (warnEl)  warnEl.textContent  = t("migrationProgressWarn");
    updateUidMigrationModalProgress(0, total);
    // Tell main we're in flight so Cmd+Q gets a confirm dialog. Ignored
    // gracefully if running outside Electron (web build).
    try { window.electronAPI?.setMigrationInFlight?.(true); } catch {}
  }
  function updateUidMigrationModalProgress(done, total) {
    const countEl = $("uidMigrationCount");
    const barEl   = $("uidMigrationBar");
    if (!countEl || !barEl) return;
    countEl.textContent = `${done} / ${total}`;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    barEl.style.width = `${pct}%`;
  }
  function hideUidMigrationModalWithSuccess() {
    const overlay = $("uidMigrationOverlay");
    if (!overlay) return;
    const card = overlay.querySelector(".uid-migr-card");
    // Show "done" state for ~1.8 s so the user gets a clear "OK it's
    // finished" cue before we whisk the modal away.
    card?.classList.add("uid-migr--done");
    updateUidMigrationModalProgress(_uidMigrationInitialTotal, _uidMigrationInitialTotal);
    // Release the quit-block so future Cmd+Q goes through immediately.
    try { window.electronAPI?.setMigrationInFlight?.(false); } catch {}
    setTimeout(() => {
      overlay.classList.remove("open");
      card?.classList.remove("uid-migr--done");
    }, 1800);
  }

  async function drainUidMigrationQueue(ownerUid) {
    if (_uidMigrationDraining) return;
    _uidMigrationDraining = true;
    try {
      while (_uidMigrationQueue.length > 0) {
        // Bail out cleanly if the user switched account / signed out
        // mid-sweep — never write to a different user's data.
        if (state.activeAccountId !== ownerUid) break;
        if (state.friendView) break;
        const decimalId = _uidMigrationQueue.shift();
        try {
          await migrateOneSpoolDecimalToHex(ownerUid, decimalId);
        } catch (e) {
          console.warn("[uidMigration] failed", decimalId, e?.message || e);
          _uidMigrationStats.failed++;
        }
        // Live progress update on the modal (if it's up). Total may have
        // grown since we started thanks to mobile-app concurrent writes;
        // maybeMigrateDecimalSpoolIds bumped the total in that case.
        if (_uidMigrationModalOpen) {
          const completed = _uidMigrationStats.migrated + _uidMigrationStats.skipped + _uidMigrationStats.failed;
          updateUidMigrationModalProgress(completed, _uidMigrationInitialTotal);
        }
        // Politeness — small gap between writes so we don't burst the
        // user's per-second Firestore quota during initial backfill.
        // Adaptive: slow down further if the backlog is huge (the user
        // can't tell the difference between 50 spools/min and 100, but
        // we don't want to blow past Firestore's per-document write
        // throughput cap or the project's daily write quota).
        //
        // Per-migration cost: 1 doc.get() + 1 limit(2) query + 1 batch
        // commit (3-5 ops). Default cadence ≈ 4 spools/sec, halved when
        // the queue exceeds 50 to keep large user backlogs well-behaved.
        const gapMs = _uidMigrationQueue.length > 50 ? 500 : 250;
        await new Promise(r => setTimeout(r, gapMs));
      }
    } finally {
      _uidMigrationDraining = false;
      // First-sweep done — close the modal with a success state. Future
      // single-doc migrations during the same session run silently.
      if (_uidMigrationModalOpen && _uidMigrationQueue.length === 0) {
        _uidMigrationInitialSweepDone = true;
        _uidMigrationModalOpen = false;
        hideUidMigrationModalWithSuccess();
        console.log(`[uidMigration] initial sweep done — migrated:${_uidMigrationStats.migrated} skipped:${_uidMigrationStats.skipped} failed:${_uidMigrationStats.failed}`);
      }
    }
  }

  async function migrateOneSpoolDecimalToHex(ownerUid, decimalId) {
    const hexId = decimalSpoolIdToHex(decimalId);
    if (!hexId) {
      console.warn("[uidMigration] cannot convert", decimalId);
      _uidMigrationStats.failed++;
      return;
    }
    const db          = fbDb(ownerUid);
    const invRef      = db.collection("users").doc(ownerUid).collection("inventory");
    const mapRef      = db.collection("users").doc(ownerUid).collection("uidMigrationMap");
    const decimalRef  = invRef.doc(decimalId);
    const hexRef      = invRef.doc(hexId);

    // Re-read the decimal doc — it may have been migrated by another
    // client (mobile app on another device, etc.) since we queued it.
    const decimalSnap = await decimalRef.get();
    if (!decimalSnap.exists) {
      // Already deleted — just make sure the map entry is there in case
      // the previous migrator didn't write it, then move on.
      await mapRef.doc(decimalId).set({
        hex_uid:     hexId,
        migrated_at: firebase.firestore.FieldValue.serverTimestamp(),
        migrated_by: "studio-manager",
      }, { merge: true }).catch(() => {});
      _uidMigrationStats.skipped++;
      return;
    }

    const data = decimalSnap.data();
    // If twin_tag_uid is decimal, convert it too. The other side's doc
    // will get its own twin_tag_uid retargeted via the reverseTwins query
    // below, so the pair stays consistent.
    const newData = { ...data, uid: hexId };
    if (data.twin_tag_uid && isDecimalSpoolId(String(data.twin_tag_uid))) {
      newData.twin_tag_uid = decimalSpoolIdToHex(String(data.twin_tag_uid));
    }

    // Find every OTHER inventory doc whose twin_tag_uid pointed at this
    // decimal id — typically one (the twin partner) but theoretically zero
    // or more. limit(2) keeps the query polite vs. the soft-rollout
    // `request.query.limit` rule in firestore.rules and detects the
    // anomaly case where >1 docs reference the same id (data corruption).
    const reverseTwins = await invRef
      .where("twin_tag_uid", "==", decimalId)
      .limit(2)
      .get();

    const batch = db.batch();
    // merge:true so a partial decimal stub re-written by the mobile app
    // doesn't wipe fields we already migrated to hex. The hex doc keeps
    // the union of fields.
    batch.set(hexRef, newData, { merge: true });
    batch.set(mapRef.doc(decimalId), {
      hex_uid:     hexId,
      migrated_at: firebase.firestore.FieldValue.serverTimestamp(),
      migrated_by: "studio-manager",
    }, { merge: true });
    reverseTwins.forEach(twin => {
      // Skip the doc we're about to delete (would race with the delete)
      if (twin.id === decimalId) return;
      batch.update(twin.ref, { twin_tag_uid: hexId });
    });
    batch.delete(decimalRef);

    await batch.commit();
    _uidMigrationStats.migrated++;
    console.log(`[uidMigration] ${decimalId} → ${hexId}` +
      (reverseTwins.size > 0 ? ` (twins retargeted: ${reverseTwins.size})` : ""));
  }

  /* ── Firestore inventory subscription ── */
  function subscribeInventory(uid) {
    unsubscribeInventory();
    // Tracks the first snapshot of THIS subscription. Previously the code
    // used `state.invLoading` as that proxy, but local-first hydration now
    // clears invLoading early (cache already painted), so we need an
    // explicit flag — reset on every (re)subscribe (e.g. account switch).
    let _firstSnapDone = false;
    _unsubInventory = fbDb()
      .collection("users").doc(uid)
      .collection("inventory")
      .onSnapshot({ includeMetadataChanges: true }, snapshot => {
        // ── Defense-in-depth — ignore any owner-inventory snapshot that
        // arrives WHILE we're previewing a friend's inventory. Without this
        // guard, a snapshot buffered before the user clicked a friend chip
        // can fire mid-switch and overwrite state.inventory / state.rows
        // with the owner's data, making the previous (read-write) view
        // bleed through into the friend's (read-only) view. The primary
        // protection is unsubscribing in switchToFriendView, but Firestore
        // can deliver one last in-flight callback before the unsub takes
        // effect, hence this belt-and-braces check.
        if (state.friendView) return;
        // Native connection detection — no ping needed
        if (snapshot.metadata.fromCache) {
          setHealthOffline();
        } else {
          setHealthLive();
        }

        // Skip data re-processing on metadata-only updates (but never skip the first snapshot)
        const isFirstSnap = !_firstSnapDone;
        _firstSnapDone = true;
        state.invLoading = false;
        if (isFirstSnap) ColdStart.mark("firestore-first-snapshot");
        if (!isFirstSnap && snapshot.docChanges().length === 0 && !snapshot.metadata.hasPendingWrites) return;
        const raw = {};
        snapshot.forEach(doc => { raw[doc.id] = doc.data(); });
        state.inventory = raw;
        state.rows = snapshot.docs.map(doc => normalizeRow(doc.id, doc.data()));

        // On first live snapshot: silently refresh API data for every TigerTag+
        // spool that has no product image yet. Fire-and-forget — each write
        // triggers a new snapshot that re-renders the panel automatically.
        if (isFirstSnap && !snapshot.metadata.fromCache && window.electronAPI?.refreshApiData) {
          state.rows
            .filter(r => r.isPlus && !r.isCloud && !raw[r.spoolId]?.url_img)
            .forEach(r => _refreshApiData(r, { silent: true }));
        }

        // One-time migration: remove any legacy soft-delete tombstones
        // (deleted: true) left over from the pre-v1.7.4 scheme.
        // Fire-and-forget — errors logged, never blocking.
        if (!snapshot.metadata.fromCache) {
          purgeLegacyTombstones(uid, raw).catch(e =>
            console.warn("[subscribeInventory] legacy tombstone purge failed:", e)
          );
          autoAssignMissingContainers(uid, raw).catch(e =>
            console.warn("[subscribeInventory] container auto-assign failed:", e)
          );
        }
        // Factory-bug fix: link twin pairs whose chip timestamps drifted ≤ 2s.
        // Fire-and-forget — the resulting Firestore writes will trigger a fresh
        // snapshot which will then see twin_tag_uid filled on both sides.
        autoLinkTwinsByTimestamp(state.rows);
        // Auto-unstorage runs FIRST so depleted spools leave their slot
        // before auto-storage tries to re-place anyone there. Otherwise we'd
        // create a loop: unstore → snapshot → auto-store re-places same 0g
        // spool. Both paths are fire-and-forget; their resulting writes
        // trigger a fresh snapshot that re-renders.
        maybeAutoUnstoreDepletedSpools();
        maybeAutoStoreUnrankedSpools();
        // Lazy migration of decimal-format spool ids → hex uppercase.
        // Picks up any decimal doc the mobile app may have just created
        // and migrates it in the background. Idempotent + safe vs
        // concurrent mobile-app writes (see the function header).
        maybeMigrateDecimalSpoolIds(uid);
        // Lazy migration of flat `rack_id` / `level` / `position` →
        // grouped `rack: { id, level, position }` sub-object. Same
        // streaming pattern: idempotent, polite, twin-aware.
        maybeMigrateFlatRackToNested(uid);
        saveInventory(raw);
        preCacheImages(state.rows).then(() => {
          // Coalesce: if several snapshots land in the same frame (e.g.
          // inventory + a pending-write echo), collapse them to one paint.
          scheduleRender("inventory", () => {
            sortStateRows(); renderStats(); renderInventory();
            // Refresh open detail panel — short-circuits when the displayed
            // spool hasn't actually changed (no flash on unrelated edits).
            refreshOpenDetail();
            // Refresh racks panel if open (positions/fills may have changed)
            if ($("racksPanel")?.classList.contains("open")) renderRacksList();
            if (!ColdStart._secondPaintDone) { ColdStart._secondPaintDone = true; ColdStart.mark("second-paint"); }
          });
          // Re-arm the deferred telemetry snapshot now that inventory data is in.
          scheduleStudioStateRecord();
        });
        setLoading($("btnSbReload"), false);
      }, err => {
        console.error("[Firestore] onSnapshot error:", err.code, err.message);
        state.invLoading = false;
        setHealthOffline();
        setLoading($("btnSbReload"), false);
      });
  }
  function unsubscribeInventory() {
    if (_unsubInventory) { _unsubInventory(); _unsubInventory = null; }
  }

  /* ── Firebase auth state → app state ── */

  // Common handler called when a named-instance user session becomes active.
  // uid must equal user.uid and be the current active account.
  async function handleSignedIn(user, uid) {
    unsubscribeInventory(); unsubscribeFriendRequests(); unsubscribeRacks(); unsubscribeScales(); unsubscribePrinters();
    // Always reset friend-view mode on account change — the new account's own inventory is what we want to show.
    // We also clear the inventory/rows so the previous (friend) data isn't briefly shown as if it belonged to the new account.
    if (state.friendView) {
      state.friendView = null;
      state.inventory  = null;
      state.rows       = [];
      renderFriendBanner();
      // Close any open detail panel — its content was rendered for the friend and is now stale
      if ($("detailPanel")?.classList.contains("open")) closeDetail();
    }
    const email    = user.email       || "";
    const authName = user.displayName || "";
    // Firebase Auth's user.photoURL is the Google profile picture URL —
    // typically a Google-generated "B"-on-violet-circle image for users
    // who haven't set a Google photo. We DELIBERATELY don't use it as
    // the avatar source. The custom avatar (Firebase Storage URL
    // mirrored to userProfiles.photoURL) is the source of truth, fed
    // into acc.photoURL by syncUserDoc. Overwriting acc.photoURL with
    // user.photoURL here would clobber the user's uploaded avatar on
    // every signin — that's the bug that caused the "B in violet
    // circle" flash in the sidebar.

    // Upsert account in localStorage
    const accounts = getAccounts();
    let acc = accounts.find(a => a.id === uid);
    if (!acc) {
      // First time we see this user — start with a null photoURL.
      // syncUserDoc will populate it from userProfiles a moment later
      // if the user has a custom avatar.
      acc = { id: uid, email, displayName: "", photoURL: null, lang: state.lang };
      accounts.push(acc);
      saveAccounts(accounts);
    }
    // Existing accounts: leave acc.photoURL untouched here. Refresh
    // happens through syncUserDoc → userProfiles.photoURL only.
    setActiveId(uid);

    // Save Google real name to Firestore (admin reference, never shown in UI)
    if (authName || email) {
      const parts = authName.trim().split(/\s+/);
      fbDb(uid).collection("users").doc(uid).set(
        { googleName: authName, firstName: parts[0]||"", lastName: parts.slice(1).join(" ")||"", email },
        { merge: true }
      ).catch(() => {});
    }

    // Restore language preference
    if (acc.lang && state.i18n[acc.lang]) {
      state.lang = acc.lang;
      localStorage.setItem("tigertag.lang", acc.lang);
      applyTranslations();
    }

    // Local-first hydration of the user doc (roles / debug / keys /
    // isPublic) BEFORE the first paint, so the debug button + public flag
    // are correct on frame 1 instead of popping in after the Firestore
    // round-trip. syncUserDoc() still refreshes from the server and is the
    // authoritative source; this only primes the cache.
    hydrateUserDocCache(uid);

    setConnected(acc.displayName, email); // _shortName fallback applied inside

    // Show cached inventory while Firestore connects.
    // CRITICAL: paint SYNCHRONOUSLY from cache — never await the image
    // precache here. Thumbnails resolve through the persisted img map
    // (hydrated at boot) to the local /img-cache/* files the renderer's
    // own HTTP server serves straight off disk, so they're on screen in
    // the first frame with ZERO network. preCacheImages then warms/refreshes
    // any NEW images in the background and repaints the delta (coalesced).
    try {
      const raw = Cache.read("inventory", uid);
      // Only show the cache if it actually has spools — an empty/missing
      // cache keeps the spinner up until the authoritative snapshot lands
      // (avoids an "empty → filled" flash on first-ever login).
      if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
        state.inventory = raw;
        state.rows = Object.entries(raw).map(([k,vv]) => normalizeRow(k, vv || {}));
        // CRITICAL: leave the loading state — otherwise renderInventory()
        // short-circuits to the spinner and the cache is never painted
        // until the first Firestore snapshot (this was THE thing making
        // the user wait on every launch).
        state.invLoading = false;
        sortStateRows(); renderStats(); renderInventory();           // ← instant paint
        preCacheImages(state.rows).then(refreshed => {                // ← background warm
          if (refreshed) scheduleRender("inventory", renderInventory);
        });
      }
    } catch {}
    // First usable frame is on screen (cached avatar + inventory). Mark
    // the trace and tell main.js to swap in the window. rAF so the mark
    // lands right after the browser actually paints.
    requestAnimationFrame(signalFirstPaint);

    subscribeInventory(uid);
    syncLangFromFirestore(uid);
    syncUserDoc(uid);
    subscribeFriendRequests(uid);
    loadFriendsList();  // populate state.friends early so dropdown + profiles modal show friends immediately
    loadBlacklist();    // populate state.blacklist for the Friends panel
    subscribeRacks(uid);// live-sync the user's storage racks
    subscribeScales(uid);// live-sync the user's TigerScale heartbeats
    subscribePrinters(uid);// live-sync the user's 3D printers across all 5 brand subcollections
  }

  // Track which account ids already have an onAuthStateChanged listener set up.
  const _namedAuthSetup = new Set();

  // Set up an independent Firebase auth listener for one account (named instance).
  function setupNamedAuth(uid) {
    if (_namedAuthSetup.has(uid)) return;
    _namedAuthSetup.add(uid);
    ensureFirebaseApp(uid);
    firebase.app(uid).auth().onAuthStateChanged(async user => {
      if (user && user.uid === uid) {
        // Session active or restored from IndexedDB
        if (uid === getActiveId()) await handleSignedIn(user, uid);
      } else if (uid === getActiveId()) {
        // Active account's session expired → show login
        unsubscribeInventory(); unsubscribeFriendRequests(); unsubscribeRacks(); unsubscribeScales(); unsubscribePrinters();
        state.inventory = null; state.rows = [];
        state.isAdmin = false; state.debugEnabled = false;
        state.publicKey = null; state.privateKey = null;
        state.friends = []; state.friendRequests = []; state.blacklist = []; state.racks = []; state.printers = [];
        applyDebugMode(); renderStats(); renderInventory();
        renderAccountDropdown();
        setDisconnected();
        setTimeout(() => openAddAccountModal(), 300);
      }
    });
  }

  function initAuth() {
    // Restore named instances for all saved accounts (sessions auto-reload from IndexedDB)
    const accounts = getAccounts();
    for (const acc of accounts) setupNamedAuth(acc.id);

    // If no saved accounts, show login immediately
    if (!accounts.length) setTimeout(() => openAddAccountModal(), 300);
  }


  /* ── account section UI ── */
  function getInitials(a) {
    // STRICTLY from displayName — never the email prefix. Falling back
    // to email produced a wrong letter (e.g. "B" from "benoit@…") on
    // the very first boot before Firestore's authoritative displayName
    // resolved, then flipped to the real initials a moment later. The
    // empty-string return lets every consumer render an avatar with
    // just the colour gradient (and photo, if any) until the real
    // name arrives — invisible to the user, no jarring letter swap.
    const src = (a.displayName || "").trim();
    if (!src) return "";
    return src.split(/\s+/).filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }

  function renderAccountList() {
    const el = $("profilesList"); if (!el) return;
    const accounts = getAccounts();
    const activeId = state.activeAccountId;
    const sorted = [...accounts].sort((a, b) => (b.id === activeId ? 1 : 0) - (a.id === activeId ? 1 : 0));
    const SVG_PLUS = `<span class="icon icon-plus icon-11"></span>`;
    const SVG_CHEVRON = `<span class="icon icon-chevron-r icon-14"></span>`;

    let html = "";
    if (!sorted.length) {
      html = `<div style="font-size:12px;color:var(--muted);padding:12px 0;text-align:center">${t("noAccounts")}</div>`;
    } else {
      html = `<div class="prf-list">${sorted.map(acc => {
        const name = esc(acc.displayName || acc.email.split("@")[0]);
        return `
        <button class="prf-account-card" data-prf-id="${esc(acc.id)}">
          ${avatarMarkup(acc, "prf-account-avatar")}
          <span class="prf-account-info">
            <span class="prf-account-name">${name}</span>
            <span class="prf-account-email">${esc(acc.email)}</span>
          </span>
          <span class="prf-account-chevron">${SVG_CHEVRON}</span>
        </button>`;
      }).join("")}</div>`;
    }
    html += `<button class="stg-add-btn" id="btnShowAddAccount">${SVG_PLUS} ${t("addAccountLabel")}</button>`;

    // ── Friends section ───────────────────────────────────────────────────────
    const SVG_EYE = `<span class="icon icon-eye-on icon-13"></span>`;
    html += `<div class="prf-section-sep"></div>
      <div class="prf-section-label">${t("friendsList")}</div>`;
    if (state.friends && state.friends.length) {
      html += `<div class="prf-list">${state.friends.map(f => {
          const name = esc(_shortName(f.displayName, f.uid));
          const color = friendColor(f);
          const fg = readableTextOn(color);
          const initials = (f.displayName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
          const isActive = state.friendView?.uid === f.uid;
          return `
          <button class="prf-account-card prf-friend-card${isActive ? " prf-friend-active" : ""}"
                  data-fv-uid="${esc(f.uid)}" data-fv-name="${esc(_shortName(f.displayName, f.uid))}" data-fv-color="${esc(color)}">
            ${avatarMarkup(f, "prf-account-avatar")}
            <span class="prf-account-info">
              <span class="prf-account-name">${name}</span>
              <span class="prf-account-email prf-friend-sub">${t("friendViewInv")}</span>
            </span>
            <span class="prf-account-chevron">${SVG_EYE}</span>
          </button>`;
        }).join("")}</div>`;
    } else {
      html += `<div class="prf-friends-empty">${t("friendsEmpty")}</div>`;
    }
    // Always show the "Add a friend" button under the friends list
    html += `<button class="stg-add-btn" id="btnPrfAddFriend">${SVG_PLUS} ${t("friendsAdd")}</button>`;

    el.innerHTML = html;

    el.querySelectorAll("[data-prf-id]").forEach(card => {
      card.addEventListener("click", () => {
        const acc = getAccounts().find(a => a.id === card.dataset.prfId);
        if (acc) { closeProfilesModal(); openEditAccountModal(acc); }
      });
    });
    el.querySelectorAll("[data-fv-uid]").forEach(card => {
      card.addEventListener("click", () => {
        switchToFriendView(card.dataset.fvUid, card.dataset.fvName, card.dataset.fvColor);
      });
    });
    $("btnShowAddAccount").addEventListener("click", () => { closeProfilesModal(); openAddAccountModal(); });
    $("btnPrfAddFriend")?.addEventListener("click", () => { closeProfilesModal(); openAddFriendModal(); });
  }

  async function switchAccountUI(id) {
    if (id === state.activeAccountId) {
      // Even if active account didn't change, exit friend-view if user is in it
      if (state.friendView) switchBackToOwnView();
      closeProfilesModal(); closeSettings(); return;
    }
    // Always exit friend-view before switching accounts
    if (state.friendView) {
      state.friendView = null;
      renderFriendBanner();
    }
    _clearSearchFilters();
    // Check if the target account has an active named Firebase session
    let targetUser = null;
    try { targetUser = firebase.app(id).auth().currentUser; } catch (_) {}

    if (targetUser && targetUser.uid === id) {
      // Session alive — switch instantly, no re-authentication needed
      setActiveId(id);
      closeProfilesModal(); closeSettings();
      await handleSignedIn(targetUser, id);
    } else {
      // Session missing or expired — pre-select the account and ask for credentials
      setActiveId(id);
      closeProfilesModal(); closeSettings();
      setTimeout(() => openAddAccountModal(), 250);
    }
  }

  function deleteAccountUI(id) {
    let accounts = getAccounts();
    const wasActive = state.activeAccountId === id;
    accounts = accounts.filter(a => a.id !== id);
    saveAccounts(accounts);
    localStorage.removeItem(invKey(id));
    _namedAuthSetup.delete(id);
    // Sign out the named instance so its IndexedDB session is cleared
    try { firebase.app(id).auth().signOut(); } catch (_) {}
    if (wasActive) {
      unsubscribeInventory(); unsubscribeFriendRequests(); unsubscribeRacks(); unsubscribeScales(); unsubscribePrinters();
      state.inventory = null; state.rows = [];
      state.isAdmin = false; state.debugEnabled = false;
      state.publicKey = null; state.privateKey = null;
      state.friends = []; state.friendRequests = []; state.blacklist = []; state.racks = []; state.printers = [];
      applyDebugMode(); renderStats(); renderInventory();
      setDisconnected();
      // Switch to another account if available, otherwise show login
      const remaining = getAccounts();
      if (remaining.length) {
        setActiveId(remaining[0].id);
        setupNamedAuth(remaining[0].id);
        const u = firebase.app(remaining[0].id).auth().currentUser;
        if (u) handleSignedIn(u, remaining[0].id);
        else setTimeout(() => openAddAccountModal(), 300);
      } else {
        state.activeAccountId = null;
        setTimeout(() => openAddAccountModal(), 300);
      }
    } else {
      renderAccountList();
    }
  }

  /* ── key status (state only — no DOM badge) ── */
  function setKeyStatus(s) {
    state.keyValid = (s === "ok") ? true : (s === "bad") ? false : null;
  }

  /* ── inventory load ── */
  function sortStateRows() {
    state.rows.sort((a, b) => {
      if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
      return a.uid.localeCompare(b.uid);
    });
  }
  // loadInventory: re-attaches the Firestore listener (called by the Refresh button).
  // The listener itself calls renderInventory/renderStats via onSnapshot.
  function loadInventory() {
    const uid = state.activeAccountId;
    if (!uid) return;
    setLoading($("btnSbReload"), true);
    subscribeInventory(uid); // re-subscribe; listener calls setLoading(false) on first snapshot
  }

  /* ── stats ── */
  function renderStats() {
    const all = deduplicateTwins(state.rows.slice()); const active = all.filter(r => !r.deleted);
    const plus  = active.filter(r => r.isPlus);
    const cloud = active.filter(r => r.isCloud);
    const diy   = active.length - plus.length - cloud.length;
    const totalW = active.reduce((s, r) => s + (Number(r.weightAvailable)||0), 0);
    const el = $("sbStats");
    if (!all.length) { el.classList.add("hidden"); return; }
    const kgFull = `${Math.round(totalW / 1000)} kg`;
    const kgMini = kgFull;
    const tf = state.typeFilter;
    el.innerHTML = [
      { label: t("statActive"), mini: t("statActiveMini"), value: active.length, miniVal: active.length, filter: "reset" },
      { label: t("statTotal"),  mini: t("statTotalMini"),  value: kgFull,         miniVal: kgMini,        filter: "reset" },
      { label: '<span class="tag-diy">TigerTag</span>',          mini: t("statDiyMini"),   value: diy,          miniVal: diy,          filter: "TigerTag" },
      { label: '<span class="tag-plus">TigerTag+</span>',        mini: t("statPlusMini"),  value: plus.length,  miniVal: plus.length,  filter: "TigerTag+" },
      { label: '<span class="tag-cloud">TigerCloud</span>',  mini: t("statCloudMini"), value: cloud.length, miniVal: cloud.length, filter: "TigerCloud", cloud: true },
    ].map(s => {
      const isActive = s.filter !== "reset" && tf === s.filter;
      return `<div class="sb-stat${s.cloud ? " sb-stat--cloud" : ""}${isActive ? " is-active" : ""}" data-filter="${s.filter}" data-mini="${s.mini}" data-mini-val="${s.miniVal}"><div class="value">${s.value}</div><div class="label">${s.label}</div></div>`;
    }).join("");
    el.classList.remove("hidden");
  }

  /* ── filter ── */
  function deduplicateTwins(rows) {
    const skip = new Set();
    const result = [];
    for (const row of rows) {
      if (skip.has(row.spoolId)) continue;
      if (row.twinUid) {
        const twinId = String(row.twinUid);
        const twin = rows.find(r =>
          !skip.has(r.spoolId) &&
          r.spoolId !== row.spoolId &&
          (String(r.uid) === twinId || String(r.spoolId) === twinId)
        );
        if (twin) {
          row.hasTwinPair = true;
          skip.add(twin.spoolId);
        }
      }
      skip.add(row.spoolId);
      result.push(row);
    }
    return result;
  }

  /* ── Auto-link twin pairs broken by a known factory programmer bug ─────────
     The factory wrote thousands of chips where the two halves of a twin pair
     ended up with timestamps drifting by ≤ 2 seconds instead of being identical,
     which prevented twin_tag_uid from being set. We patch it client-side: when
     two unlinked rows share the same `id_tigertag` and their chip timestamps
     are within 2s, we write twin_tag_uid on BOTH docs in a single Firestore
     batch. Pairs already linked are left untouched (idempotent, breaks the
     snapshot→write→snapshot loop on the second pass). */
  const _twinAutoLinkAttempted = new Set();   // session memo: "uidA|uidB" sorted
  async function autoLinkTwinsByTimestamp(rows) {
    // Hard guards
    if (state.friendView) return;                // never write to a friend's docs
    const user = fbAuth().currentUser;
    if (!user) return;

    // Candidates: not deleted, no twin yet, must have both id_tigertag and timestamp
    const cand = rows.filter(r =>
      !r.deleted && !r.twinUid &&
      r.raw && r.raw.id_tigertag != null &&
      typeof r.chipTimestamp === "number"
    );
    if (cand.length < 2) return;

    // Group by id_tigertag
    const groups = new Map();
    for (const r of cand) {
      const k = String(r.raw.id_tigertag);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }

    // Walk consecutive pairs in time order; pair if |Δt| ≤ 2s and neither was paired yet
    const pairs = [];
    const usedSpoolIds = new Set();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.chipTimestamp - b.chipTimestamp);
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], b = list[i + 1];
        if (usedSpoolIds.has(a.spoolId) || usedSpoolIds.has(b.spoolId)) continue;
        const dt = Math.abs(b.chipTimestamp - a.chipTimestamp);
        if (dt > 2) continue;
        // Memoization key — sorted UID pair, never re-attempt this session
        const memoKey = [a.uid, b.uid].sort().join("|");
        if (_twinAutoLinkAttempted.has(memoKey)) continue;
        pairs.push({ a, b, dt, idtt: list[0].raw.id_tigertag });
        usedSpoolIds.add(a.spoolId); usedSpoolIds.add(b.spoolId);
        _twinAutoLinkAttempted.add(memoKey);
      }
    }
    if (!pairs.length) return;

    // Single batched write — twin_tag_uid on both sides + lastUpdate timestamp
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    const batch  = fbDb().batch();
    const ts     = firebase.firestore.FieldValue.serverTimestamp();
    for (const { a, b, dt, idtt } of pairs) {
      batch.update(invRef.doc(a.spoolId), { twin_tag_uid: b.uid, updatedAt: ts });
      batch.update(invRef.doc(b.spoolId), { twin_tag_uid: a.uid, updatedAt: ts });
      console.log(`[twinAutoLink] paired uid=${a.uid} ↔ uid=${b.uid}  (id_tigertag=${idtt}, Δt=${dt}s)`);
    }
    try {
      await batch.commit();
      console.log(`[twinAutoLink] committed ${pairs.length} pair(s)`);
    } catch (err) {
      reportError("twinAutoLink", err);
      // Roll back the memo so a future snapshot can retry
      for (const { a, b } of pairs) {
        const memoKey = [a.uid, b.uid].sort().join("|");
        _twinAutoLinkAttempted.delete(memoKey);
      }
    }
  }

  /* ── Manual twin pairing — user-assisted repair tool ───────────────────
     The auto-linker (autoLinkTwinsByTimestamp) only pairs spools whose
     chip timestamps differ by ≤ 2 s. When the factory programmer left
     a wider gap, both halves of a real twin pair end up as separate
     inventory entries — and they stay separate forever because no
     batch above can prove they belong together. This trio of helpers
     gives the user a manual repair path:
       - findTwinCandidates(row)  → list of compatible peers (same
         brand / material / type / version / colour, not already paired,
         not deleted, not the source itself)
       - linkTwinPair(rowA, rowB) → write twin_tag_uid both ways in a
         single batch (same shape as the auto-linker, so the rest of
         the app — writeWithTwin, hasTwinPair, etc. — picks them up
         immediately on the next snapshot)
       - unlinkTwinPair(row)      → debug-only inverse operation,
         clears twin_tag_uid on both docs                           */
  function findTwinCandidates(row) {
    if (!row || !row.raw) return [];
    const src = row.raw;
    return state.rows.filter(r => {
      if (r.spoolId === row.spoolId) return false;     // not self
      if (r.deleted) return false;                     // not tombstoned
      if (r.twinUid) return false;                     // already paired (excluded per UX spec)
      if (!r.raw) return false;
      const o = r.raw;
      // Identity quartet — must all match for it to be the SAME spool model.
      if (o.id_brand    !== src.id_brand)    return false;
      if (o.id_material !== src.id_material) return false;
      if (o.id_type     !== src.id_type)     return false;
      if (o.id_tigertag !== src.id_tigertag) return false;
      // Colour — exact RGB triplet match. The factory writes identical
      // R/G/B on both halves of a twin pair so this is safe; a soft
      // tolerance would only invite false positives.
      if (o.color_r !== src.color_r) return false;
      if (o.color_g !== src.color_g) return false;
      if (o.color_b !== src.color_b) return false;
      return true;
    });
  }
  async function linkTwinPair(rowA, rowB) {
    if (!rowA || !rowB || rowA.spoolId === rowB.spoolId) return;
    const user = fbAuth().currentUser;
    if (!user) return;
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    const batch  = fbDb().batch();
    const ts     = firebase.firestore.FieldValue.serverTimestamp();
    batch.update(invRef.doc(rowA.spoolId), { twin_tag_uid: rowB.uid, updatedAt: ts });
    batch.update(invRef.doc(rowB.spoolId), { twin_tag_uid: rowA.uid, updatedAt: ts });
    await batch.commit();
    console.log(`[twinManualLink] paired uid=${rowA.uid} ↔ uid=${rowB.uid}`);
  }
  async function unlinkTwinPair(row) {
    if (!row) return;
    const user = fbAuth().currentUser;
    if (!user) return;
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    const twinId = twinSpoolIdOf(row);
    const batch  = fbDb().batch();
    const ts     = firebase.firestore.FieldValue.serverTimestamp();
    const clear  = { twin_tag_uid: firebase.firestore.FieldValue.delete(), updatedAt: ts };
    batch.update(invRef.doc(row.spoolId), clear);
    if (twinId) batch.update(invRef.doc(twinId), clear);
    await batch.commit();
    console.log(`[twinManualLink] unpaired spoolId=${row.spoolId}${twinId ? " ↔ " + twinId : ""}`);
  }

  function sortRows(rows) {
    if (!state.sortCol) return rows;
    const dir = state.sortDir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      let va = a[state.sortCol], vb = b[state.sortCol];
      if (va == null && vb == null) return 0;
      if (va == null) return dir;
      if (vb == null) return -dir;
      if (typeof va === "boolean") return dir * ((va ? 1 : 0) - (vb ? 1 : 0));
      if (typeof va === "number" && typeof vb === "number") return dir * (va - vb);
      return dir * String(va).localeCompare(String(vb), undefined, { sensitivity: "base" });
    });
  }

  function filteredRows() {
    let rows = state.rows.slice();
    rows = rows.filter(r => !r.deleted); // hard-deleted docs never appear in state.rows
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(r =>
        r.uid.toLowerCase().includes(q) ||
        String(r.material).toLowerCase().includes(q) ||
        String(r.brand).toLowerCase().includes(q) ||
        String(r.colorName).toLowerCase().includes(q)
      );
    }
    if (state.brandFilter) {
      rows = rows.filter(r => String(r.brand) === state.brandFilter);
    }
    if (state.materialFilter) {
      rows = rows.filter(r => String(r.material) === state.materialFilter);
    }
    if (state.typeFilter) {
      rows = rows.filter(r => String(r.protocol) === state.typeFilter);
    }
    return sortRows(deduplicateTwins(rows));
  }

  // Refresh quick-filter dropdowns (brand + material) from the current inventory.
  // Preserves the user's current selection if it still exists.
  function populateQuickFilters() {
    populateOneQuickFilter({
      sel: $("brandFilter"),
      currentKey: "brandFilter",
      labelKey: "filterAllBrands",
      defaultLabel: "All brands",
      pickValue: r => r.brand,
    });
    populateOneQuickFilter({
      sel: $("materialFilter"),
      currentKey: "materialFilter",
      labelKey: "filterAllMaterials",
      defaultLabel: "All materials",
      pickValue: r => r.material,
    });
    populateOneQuickFilter({
      sel: $("typeFilter"),
      currentKey: "typeFilter",
      labelKey: "filterAllVersions",
      defaultLabel: "All versions",
      pickValue: r => r.protocol,
    });
  }
  function populateOneQuickFilter({ sel, currentKey, labelKey, defaultLabel, pickValue }) {
    if (!sel) return;
    const values = Array.from(new Set(
      state.rows
        .filter(r => !r.deleted)
        .map(pickValue)
        .filter(v => v && v !== "-")
        .map(v => String(v))
    )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const current = state[currentKey];
    const allLabel = t(labelKey) || defaultLabel;
    sel.innerHTML = `<option value="" data-i18n="${labelKey}">${esc(allLabel)}</option>`
      + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if (current && values.includes(current)) sel.value = current;
    else { sel.value = ""; state[currentKey] = ""; }
    sel.classList.toggle("is-active", !!state[currentKey]);
  }
  // Backwards-compat alias used in renderInventory()
  const populateBrandFilter = populateQuickFilters;

  /* ── render ── */
  const _isPrinterMode = m => m === "printer" || m === "printer-table" || m === "printer-cam";

  // All rows that should ever be present in the grid / table DOM — i.e.
  // everything EXCEPT hard-deleted docs and the secondary tag of a twin pair.
  // Search / brand / material / type filters are applied later via
  // applyInventoryFilter() which just toggles `.hidden` on existing nodes,
  // so each keystroke no longer rebuilds 100-300 DOM elements (which flashed
  // the whole grid because every `<img>` was destroyed and re-decoded).
  function allDisplayRows() {
    let rows = state.rows.slice().filter(r => !r.deleted);
    return sortRows(deduplicateTwins(rows));
  }

  function renderInventory() {
    populateBrandFilter();      // refresh dropdown options on every render
    const rows = allDisplayRows();
    renderFriendBanner();

    // ── Loading or truly empty → dedicated welcome card ──────────────────────
    // In friendView, keep card-inv visible so the banner stays; show spinner there
    if (state.invLoading || (state.inventory !== null && state.rows.length === 0)) {
      // ── Rack view priority — even when the friend's inventory is empty or
      // still loading, we MUST hand off to renderRackView() so it can clear
      // the previously-rendered rack DOM (the owner's own racks). Without
      // this, the previous user's racks bleed through and remain interactive.
      // renderRackView() handles its own empty/loading states gracefully.
      if (state.viewMode === "rack") {
        $("card-welcome").classList.add("hidden");
        $("card-inv").classList.remove("hidden");
        $("invTableWrap").classList.add("hidden");
        $("invGrid").classList.add("hidden");
        $("invEmpty").classList.add("hidden");
        $("mainResult").innerHTML = "";
        $("invRackView").classList.remove("hidden");
        $("invPrinterView")?.classList.add("hidden");
        renderRackView();
        return;
      }
      // Same defensive handoff for printer view — the printer collection is
      // independent from the inventory rows, so an empty/loading inventory
      // is still a perfectly valid moment to show the user's printers.
      if (_isPrinterMode(state.viewMode)) {
        $("card-welcome").classList.add("hidden");
        $("card-inv").classList.remove("hidden");
        $("invTableWrap").classList.add("hidden");
        $("invGrid").classList.add("hidden");
        $("invRackView")?.classList.add("hidden");
        $("invEmpty").classList.add("hidden");
        $("mainResult").innerHTML = "";
        $("invPrinterView").classList.remove("hidden");
        renderPrintersView();
        return;
      }
      if (state.friendView) {
        $("card-welcome").classList.add("hidden");
        $("card-inv").classList.remove("hidden");
        $("invTableWrap").classList.add("hidden"); $("invGrid").classList.add("hidden");
        $("invEmpty").classList.add("hidden");
        if (state.invLoading) {
          $("mainResult").innerHTML = `<div class="inv-loading"><div class="inv-loading-spin"></div><span>${t("invLoading")}</span></div>`;
        } else if (state.friendView.error) {
          $("mainResult").innerHTML = `
            <div class="friend-inv-error">
              <div class="friend-inv-error-icon">⚠</div>
              <div class="friend-inv-error-title">${t("friendInvErrorTitle")}</div>
              <div class="friend-inv-error-msg">${esc(state.friendView.error)}</div>
              <div class="friend-inv-error-hint">${t("friendInvErrorHint")}</div>
              <div class="friend-inv-error-actions">
                <button class="fie-btn" id="fieRetry">
                  <span class="icon icon-refresh icon-13"></span>
                  ${t("friendInvErrorRetry")}
                </button>
                <button class="fie-btn fie-btn--danger" id="fieRemove">
                  <span class="icon icon-trash icon-13"></span>
                  ${t("friendInvErrorRemove")}
                </button>
              </div>
            </div>`;
          $("fieRetry")?.addEventListener("click", () => {
            const fv = state.friendView;
            if (fv) switchToFriendView(fv.uid, fv.displayName, fv.avatarColor);
          });
          $("fieRemove")?.addEventListener("click", async () => {
            const fv = state.friendView;
            if (!fv) return;
            const btn = $("fieRemove");
            if (btn) btn.disabled = true;
            try {
              await removeFriend(fv.uid);
              await loadFriendsList();
              switchBackToOwnView();
            } catch (e) {
              console.error("[FriendView] remove failed:", e);
              if (btn) btn.disabled = false;
            }
          });
        } else {
          $("mainResult").innerHTML = "";
          $("invEmpty").textContent = t("noInventory");
          $("invEmpty").classList.remove("hidden");
        }
        return;
      }
      // Keep card-inv visible so the search bar + toolbar remain accessible
      // even when the inventory is empty — the user must be able to Add product
      // or Auto Scan their first spool from this empty state.
      $("card-welcome").classList.add("hidden");
      $("card-inv").classList.remove("hidden");
      $("invTableWrap").classList.add("hidden");
      $("invGrid").classList.add("hidden");
      $("invEmpty").classList.add("hidden");
      $("invRackView")?.classList.add("hidden");
      $("invPrinterView")?.classList.add("hidden");

      if (state.invLoading) {
        $("mainResult").innerHTML = `<div class="inv-loading"><div class="inv-loading-spin"></div><span>${t("invLoading")}</span></div>`;
      } else {
        // Connected + 0 spools → Apple-style welcome with 2 QR cards
        const qrUniversal  = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Ftaap.it%2FDF1Aqt&bgcolor=ffffff&color=1d1d1f&margin=16&qzone=1`;
        const qrTestflight = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Ftestflight.apple.com%2Fjoin%2FjVHhmK4C&bgcolor=ffffff&color=1d1d1f&margin=16&qzone=1`;
        $("mainResult").innerHTML = `
          <div class="inv-welcome">
            <div class="inv-welcome-hero">
              <div class="inv-welcome-logo inv-welcome-logo--framed">
                <img src="../assets/img/icon.png" alt="TigerTag" />
              </div>
              <h1 class="inv-welcome-h1">${t("invWelcomeTitle")}</h1>
              <p class="inv-welcome-p">${t("invWelcomeSub")}</p>
            </div>
            <div class="inv-welcome-grid">
              <!-- Card 1 : App Store + Google Play (lien universel taap.it) -->
              <div class="inv-qr-card">
                <div class="inv-qr-card-head inv-qr-card-head--dark">
                  <span class="icon icon-apple icon-13"></span>
                  <span class="icon icon-android icon-13"></span>
                  App Store &amp; Google Play
                </div>
                <div class="inv-qr-card-body">
                  <img class="inv-qr-img" src="${qrUniversal}" alt="QR" onerror="this.style.opacity='.15'" />
                  <div class="inv-qr-store-row">
                    <a class="inv-qr-store-pill" href="https://taap.it/DF1Aqt" target="_blank" rel="noopener">
                      <span class="icon icon-apple icon-12"></span> App Store
                    </a>
                    <a class="inv-qr-store-pill" href="https://taap.it/DF1Aqt" target="_blank" rel="noopener">
                      <span class="icon icon-android icon-12"></span> Google Play
                    </a>
                  </div>
                </div>
                <div class="inv-qr-card-foot">${t("invQrScanHint")}</div>
              </div>
              <!-- Card 2 : TestFlight beta -->
              <div class="inv-qr-card">
                <div class="inv-qr-card-head inv-qr-card-head--orange">
                  <span class="icon icon-apple icon-13"></span>
                  TestFlight
                  <span class="inv-qr-beta-badge">BETA</span>
                </div>
                <div class="inv-qr-card-body">
                  <img class="inv-qr-img" src="${qrTestflight}" alt="QR" onerror="this.style.opacity='.15'" />
                  <div class="inv-qr-store-row">
                    <a class="inv-qr-store-pill" href="https://testflight.apple.com/join/jVHhmK4C" target="_blank" rel="noopener">
                      <span class="icon icon-apple icon-12"></span> TestFlight
                    </a>
                  </div>
                </div>
                <div class="inv-qr-card-foot">${t("invQrBetaNote")}</div>
              </div>
            </div>
          </div>`;
      }
      return;
    }

    // ── Has spools → inventory card ───────────────────────────────────────────
    $("card-welcome").classList.add("hidden");
    $("card-inv").classList.remove("hidden");
    $("mainResult").innerHTML = "";  // clear any spinner left by friendView loading

    // Rack view bypasses the rows-empty short-circuit (a rack can be useful even with 0 spools).
    // In friend view this renders read-only — no edit / drag / drop / kebab.
    if (state.viewMode === "rack") {
      $("invTableWrap").classList.add("hidden");
      $("invGrid").classList.add("hidden");
      $("invEmpty").classList.add("hidden");
      $("invRackView").classList.remove("hidden");
      $("invPrinterView")?.classList.add("hidden");
      renderRackView();
      return;
    }
    $("invRackView").classList.add("hidden");

    // Printer view — same deal as rack, decoupled from spool rows.
    if (_isPrinterMode(state.viewMode)) {
      $("invTableWrap").classList.add("hidden");
      $("invGrid").classList.add("hidden");
      $("invEmpty").classList.add("hidden");
      $("invPrinterView").classList.remove("hidden");
      renderPrintersView();
      return;
    }
    $("invPrinterView")?.classList.add("hidden");

    // Inventory really empty (no spools at all — `allDisplayRows` already
    // strips deleted/twin secondaries). `applyInventoryFilter()` handles the
    // "no match" case below for the active search/filter set.
    if (rows.length === 0) {
      $("invTableWrap").classList.add("hidden"); $("invGrid").classList.add("hidden");
      $("invEmpty").textContent = t("noInventory");
      $("invEmpty").classList.remove("hidden");
      return;
    }

    $("invEmpty").classList.add("hidden");
    if (state.viewMode === "grid") {
      $("invTableWrap").classList.add("hidden"); $("invGrid").classList.remove("hidden"); renderGrid(rows);
    } else {
      $("invGrid").classList.add("hidden"); $("invTableWrap").classList.remove("hidden"); renderTable(rows);
    }
    // Apply the search/brand/material/type filter on the freshly rendered DOM
    // (hide non-matching cards/rows). Keystroke-driven filter changes go
    // straight through applyInventoryFilter() to skip the rebuild entirely.
    applyInventoryFilter();
  }

  // Toggle `.hidden` on existing grid cards / table rows based on the current
  // search + brand + material + type filter. Cheaper than rebuilding the DOM
  // and crucially preserves the `<img>` decoding state, so typing in the
  // search box no longer flashes the whole grid.
  function applyInventoryFilter() {
    const q = (state.search || "").trim().toLowerCase();
    const brand = state.brandFilter || "";
    const material = state.materialFilter || "";
    const type = state.typeFilter || "";
    const noFilter = !q && !brand && !material && !type;
    const rowsById = new Map(state.rows.map(r => [r.spoolId, r]));
    const nodes = document.querySelectorAll("#invGrid .spool-card, #invBody tr");
    let visible = 0;
    nodes.forEach(el => {
      if (noFilter) { el.classList.remove("hidden"); visible++; return; }
      const r = rowsById.get(el.dataset.id);
      if (!r) { el.classList.add("hidden"); return; }
      const matchSearch = !q || [r.uid, r.material, r.brand, r.colorName]
        .some(v => String(v || "").toLowerCase().includes(q));
      const matchBrand = !brand || String(r.brand) === brand;
      const matchMaterial = !material || String(r.material) === material;
      const matchType = !type || String(r.protocol) === type;
      const matches = matchSearch && matchBrand && matchMaterial && matchType;
      el.classList.toggle("hidden", !matches);
      if (matches) visible++;
    });
    // Empty-state swap — only when a filter is active AND nothing matches.
    // Without a filter we always have at least one card; the no-inventory
    // path is handled by renderInventory() itself.
    if (visible === 0 && nodes.length > 0) {
      $("invEmpty").textContent = t("noMatch");
      $("invEmpty").classList.remove("hidden");
      if (state.viewMode === "grid") $("invGrid").classList.add("hidden");
      else $("invTableWrap").classList.add("hidden");
    } else if (nodes.length > 0) {
      $("invEmpty").classList.add("hidden");
      if (state.viewMode === "grid") {
        $("invGrid").classList.remove("hidden");
        $("invTableWrap").classList.add("hidden");
      } else if (state.viewMode === "table") {
        $("invTableWrap").classList.remove("hidden");
        $("invGrid").classList.add("hidden");
      }
    }
  }

  function colorBg(row) {
    const aspects = [row.aspect1, row.aspect2].map(a => (a || '').toLowerCase());
    const isRainbow  = aspects.some(a => a.includes('rainbow') || a.includes('multicolor'));
    const isTricolor = aspects.some(a => a.includes('tricolor') || a.includes('tri color') || a.includes('tricolore'));
    const isBicolor  = aspects.some(a => a.includes('bicolor')  || a.includes('bi color')  || a.includes('bicolore'));
    // Normalize each entry: strip optional # and 2-char alpha (only for 8-digit RRGGBBAA), add # for CSS
    const normalizeColor = c => {
      const s = (c || '').trim().replace(/^#/, '');
      const hex6 = s.length === 8 ? s.slice(0, 6) : s;
      return /^[0-9a-fA-F]{6}$/.test(hex6) ? `#${hex6}` : null;
    };
    const cls = (row.colorList || []).map(normalizeColor).filter(Boolean);
    const colorType = row.colorType || '';
    if (cls.length >= 2 && colorType === 'conic_gradient') {
      return `conic-gradient(from 0deg, ${cls.join(', ')}, ${cls[0]})`;
    } else if (cls.length >= 2 && colorType === 'gradient') {
      return `linear-gradient(90deg, ${cls.join(', ')})`;
    } else if (cls.length >= 2) {
      const step = 360 / cls.length;
      const stops = cls.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(', ');
      return `conic-gradient(${stops})`;
    } else if (cls.length === 1) {
      return cls[0];   // online_color_list mono — takes priority over RFID chip color
    } else if (isRainbow && isTricolor) {
      const [c1=`#ff4d4d`, c2=`#ffd93d`, c3=`#4da3ff`] = cls;
      return `linear-gradient(90deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`;
    } else if (isRainbow && isBicolor) {
      const [c1=`#ff7a00`, c2=`#8a2be2`] = cls;
      return `linear-gradient(90deg, ${c1} 0%, ${c2} 100%)`;
    } else if (isRainbow) {
      const colors = [row.colorHex, row.colorHex2, row.colorHex3].filter(Boolean);
      if (colors.length >= 2) return `linear-gradient(90deg, ${colors.join(', ')})`;
      if (colors.length === 1) return colors[0];
      return `linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00cc00, #0000ff, #8b00ff)`;
    } else if (isTricolor) {
      const colors = [row.colorHex, row.colorHex2, row.colorHex3].filter(Boolean);
      const [c1 = '#cccccc', c2 = '#888888', c3] = colors;
      const _c3 = c3 || c1;
      return `conic-gradient(${c1} 0deg 120deg, ${c2} 120deg 240deg, ${_c3} 240deg 360deg)`;
    } else if (isBicolor) {
      const colors = [row.colorHex, row.colorHex2, row.colorHex3].filter(Boolean);
      const [c1 = '#cccccc', c2 = '#ffffff'] = colors;
      return `conic-gradient(${c1} 0deg 180deg, ${c2} 180deg 360deg)`;
    } else {
      return row.colorHex || '#1c2030';
    }
  }

  function colorCircleHTML(row, size = 15) {
    const bg = colorBg(row);
    const borderColor = isColorDark(bg) ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)';
    return `<span class="color-circle" style="width:${size}px;height:${size}px;background:${bg};border-color:${borderColor}"></span>`;
  }

  // Returns true if the first color found in a CSS background string is dark.
  function isColorDark(bg) {
    const m = bg.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
    if (!m) return false;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  }

  // Dark bg → normal logo (white fill), light bg → contouring logo (black outline)
  function logoSrc(bg) {
    return isColorDark(bg) ? LOGO_PATH : LOGO_PATH_OUTLINE;
  }

  // Persisted url → local-httpUrl map. The local httpUrl (/img-cache/{md5})
  // is deterministic and the renderer's own HTTP server serves it straight
  // off disk, so persisting this map lets the NEXT cold start paint every
  // thumbnail from the local file in the first frame — no network, no IPC.
  const IMG_MAP_KEY = "tigertag.imgmap";
  function loadImgMap() {
    try {
      const obj = JSON.parse(localStorage.getItem(IMG_MAP_KEY) || "null");
      if (obj && typeof obj === "object") {
        for (const [url, local] of Object.entries(obj)) {
          if (local && !state.imgCache.has(url)) state.imgCache.set(url, local);
        }
      }
    } catch {}
  }
  function saveImgMap() {
    try {
      const obj = {};
      for (const [url, local] of state.imgCache) if (local) obj[url] = local;
      localStorage.setItem(IMG_MAP_KEY, JSON.stringify(obj));
    } catch {}
  }

  // Warm the on-disk image cache for any URL we don't already know. Already-
  // known URLs (hydrated from the persisted map) are skipped → no redundant
  // network at boot; the local file is already on disk and immutable for the
  // catalogue. Returns true if at least one NEW image was resolved (so the
  // caller can repaint the delta). NEVER call this on the first-paint path.
  async function preCacheImages(rows) {
    if (!window.electronAPI?.imgGet) return false;
    const urls = [...new Set(rows.map(r => r.imgUrl).filter(Boolean))];
    let changed = false;
    await Promise.all(urls.map(async url => {
      if (!state.imgCache.has(url)) {
        const local = await window.electronAPI.imgGet(url).catch(() => null);
        state.imgCache.set(url, local); // null = lien mort sans cache
        if (local) changed = true;
      }
    }));
    if (changed) saveImgMap();
    return changed;
  }

  function resolvedImg(url) {
    if (!url) return null;
    return state.imgCache.has(url) ? state.imgCache.get(url) : url;
  }

  const SVG_TWIN_SMALL = `<span class="icon icon-link icon-9"></span>`;
  function twinOverlayBadge(r) {
    return r.hasTwinPair ? `<span class="thumb-twin-badge" title="${t('twinBadge')} — ${t('twinTitle')}">${SVG_TWIN_SMALL}</span>` : "";
  }

  // Tier badge shown next to a row everywhere we display its origin:
  //   • TigerCloud — doc-only, no physical chip yet (CLOUD_ prefix)
  //   • TigerTag+      — chip linked to an online catalog product (url_img set)
  //   • TigerTag       — bare chip / DIY entry
  // Cloud takes precedence over Plus because a CLOUD_ doc cannot also be a
  // chip-on-shelf — the prefix flips to a real hex UID the moment a chip
  // is programmed.
  function tierBadgeHTML(r, extraClass = "") {
    if (r.isCloud) return `<span class="tag-cloud${extraClass ? " " + extraClass : ""}">TigerCloud</span>`;
    if (r.isPlus)  return `<span class="tag-plus${extraClass ? " " + extraClass : ""}">TigerTag+</span>`;
    return `<span class="tag-diy${extraClass ? " " + extraClass : ""}">TigerTag</span>`;
  }
  function thumbHTML(row, size = 28) {
    const src = row.imgUrl ? resolvedImg(row.imgUrl) : null;
    const overlay = twinOverlayBadge(row);
    const tdBadge = row.td != null ? `<span class="thumb-td-badge">TD ${row.td}</span>` : "";
    const chipBadge = row.needUpdateAt ? `<span class="chip-badge thumb-chip-badge" title="${t("chipPendingHint")}"><span class="icon icon-refresh icon-9"></span></span>` : "";
    // If `src` is a local /img-cache file that 404s (cache purged since the
    // map was persisted), fall back ONCE to the remote URL — which also
    // re-warms the disk cache for next time. No fallback when src already IS
    // the remote URL (avoids an error loop).
    const fb = (src && row.imgUrl && src !== row.imgUrl)
      ? ` data-remote="${esc(row.imgUrl)}" onerror="if(this.dataset.remote){this.src=this.dataset.remote;this.removeAttribute('data-remote')}"`
      : "";
    const inner = src
      ? `<img class="thumb" src="${esc(src)}" width="${size}" height="${size}" loading="lazy"${fb} />`
      : `<span class="thumb-color" style="width:${size}px;height:${size}px;background:${colorBg(row)}"><img src="${logoSrc(colorBg(row))}" /></span>`;
    return `<span class="thumb-wrap">${inner}${overlay}${tdBadge}${chipBadge}</span>`;
  }

  // ── Keyed-diff helpers for grid / table ────────────────────────────────────
  // Signature of every value rendered on a card/row. Any Firestore push that
  // doesn't change one of these fields produces a stable signature → the
  // diff path returns without touching the DOM at all.
  //
  // Before this refactor, every Firestore snapshot (a single weight edit on
  // one spool) triggered `tbody.innerHTML = ""` / `grid.innerHTML = ""` →
  // destruction + recreation of all 100-300 nodes including every `<img>`,
  // which the browser had to re-decode. That's the visible "everything
  // flashes" on a single-field write.
  function _rowSignature(r) {
    return [
      r.spoolId,
      state.selected === r.spoolId ? 1 : 0,
      r.deleted ? 1 : 0,
      r.imgUrl || "",
      r.weightAvailable ?? "",
      r.capacity ?? "",
      r.colorName || "",
      r.material || "",
      r.brand || "",
      r.aspect1 || "",
      r.aspect2 || "",
      r.td ?? "",
      r.needUpdateAt ? 1 : 0,
      r.hasTwinPair ? 1 : 0,
      r.isPlus ? 1 : 0,
      r.isCloud ? 1 : 0,
      r.colorHex || "",
      r.colorHex2 || "",
      r.colorHex3 || "",
      (r.colorList || []).join(","),
      r.colorType || "",
      r.lastUpdate ?? "",
    ].join("|");
  }

  // Build the inner HTML of a grid card from a row. Reused by create and
  // update paths so the markup stays single-source.
  function _gridCardInnerHTML(r) {
    const _resolvedCard = r.imgUrl ? resolvedImg(r.imgUrl) : null;
    // Colour-square base layer (logo watermark included), product image stacked
    // on top so a broken/slow image gracefully falls back to the colour square.
    const imgHtml = `<div class="card-img-color-placeholder" style="background:${colorBg(r)}"><img src="${logoSrc(colorBg(r))}" />${
      _resolvedCard ? `<img class="card-img--overlay" src="${esc(_resolvedCard)}" loading="lazy" onerror="this.style.display='none'" />` : ''
    }</div>`;
    const pct = (r.weightAvailable != null && r.capacity) ? Math.max(0,Math.min(100,Math.round(r.weightAvailable/r.capacity*100))) : null;
    const swatch = colorCircleHTML(r);
    const badge = tierBadgeHTML(r);
    const tdBadge = r.td != null ? `<span class="card-td-badge">TD ${r.td}</span>` : "";
    const chipDot = r.needUpdateAt ? `<span class="chip-badge card-chip-badge" title="${t("chipPendingHint")}"><span class="icon icon-refresh icon-11"></span></span>` : "";
    return `
      <div class="card-img-wrap">${imgHtml}${twinOverlayBadge(r)}${tdBadge}${chipDot}</div>
      <div class="card-body">
        <div class="card-name">${swatch}${esc(v(r.colorName) !== "-" ? r.colorName : [r.aspect1, r.aspect2].filter(a => a && a !== "-" && a !== "None").join(" ") || r.material)}</div>
        <div class="card-sub">${esc(v(r.material))} · ${esc(v(r.brand))}</div>
        <div class="card-footer">
          <span class="card-weight">${r.weightAvailable!=null ? r.weightAvailable+" g" : "-"}</span>
          <span style="display:flex;gap:3px;align-items:center">${badge}</span>
        </div>
        ${pct!==null ? `<div class="card-bar"><span style="width:${pct}%"></span></div>` : ""}
      </div>`;
  }

  function _createGridCard(r) {
    const card = document.createElement("div");
    card.className = "spool-card" + (state.selected===r.spoolId?" selected":"") + (r.deleted?" deleted":"");
    card.dataset.id = r.spoolId;
    card.innerHTML = _gridCardInnerHTML(r);
    card.addEventListener("click", () => openDetail(r.spoolId));
    card._sig = _rowSignature(r);
    return card;
  }

  // Fine-grained card update: never destroy the `<img>` unless its URL
  // actually changed. Touches only the fields that changed. This is what
  // makes a single-field Firestore push (e.g. a weight slider edit) cost
  // 1-2 textContent writes instead of a full innerHTML rebuild with image
  // re-decoding.
  function _updateGridCard(card, r) {
    card.classList.toggle("selected", state.selected === r.spoolId);
    card.classList.toggle("deleted", !!r.deleted);

    // .card-img-color-placeholder: update background + logo + optional product overlay
    const placeholder = card.querySelector(".card-img-color-placeholder");
    if (placeholder) {
      const newBg = colorBg(r);
      if (placeholder.style.background !== newBg) placeholder.style.background = newBg;
      const newLogo = logoSrc(newBg);
      const logoImg = placeholder.querySelector(":scope > img:not(.card-img--overlay)");
      if (logoImg && logoImg.getAttribute("src") !== newLogo) logoImg.setAttribute("src", newLogo);
      let overlay = placeholder.querySelector(".card-img--overlay");
      const _resolved = r.imgUrl ? resolvedImg(r.imgUrl) : null;
      if (_resolved) {
        if (!overlay) {
          overlay = document.createElement("img");
          overlay.className = "card-img--overlay";
          overlay.setAttribute("loading", "lazy");
          overlay.setAttribute("onerror", "this.style.display='none'");
          placeholder.appendChild(overlay);
          overlay.src = _resolved;
        } else if (overlay.getAttribute("src") !== _resolved) {
          overlay.src = _resolved;
        }
      } else if (overlay) {
        overlay.remove();
      }
    }

    // .card-img-wrap badges (twin / td / chip)
    const wrap = card.querySelector(".card-img-wrap");
    if (wrap) {
      wrap.querySelectorAll(".thumb-twin-badge, .card-td-badge, .card-chip-badge").forEach(el => el.remove());
      const badges = twinOverlayBadge(r)
        + (r.td != null ? `<span class="card-td-badge">TD ${r.td}</span>` : "")
        + (r.needUpdateAt ? `<span class="chip-badge card-chip-badge" title="${t("chipPendingHint")}"><span class="icon icon-refresh icon-11"></span></span>` : "");
      if (badges) wrap.insertAdjacentHTML("beforeend", badges);
    }

    // .card-body: rebuild — text-only, no `<img>` here so no flash
    const body = card.querySelector(".card-body");
    if (body) {
      const swatch = colorCircleHTML(r);
      const pct = (r.weightAvailable != null && r.capacity) ? Math.max(0,Math.min(100,Math.round(r.weightAvailable/r.capacity*100))) : null;
      const badge = tierBadgeHTML(r);
      const nameText = v(r.colorName) !== "-" ? r.colorName : [r.aspect1, r.aspect2].filter(a => a && a !== "-" && a !== "None").join(" ") || r.material;
      body.innerHTML = `
        <div class="card-name">${swatch}${esc(nameText)}</div>
        <div class="card-sub">${esc(v(r.material))} · ${esc(v(r.brand))}</div>
        <div class="card-footer">
          <span class="card-weight">${r.weightAvailable!=null ? r.weightAvailable+" g" : "-"}</span>
          <span style="display:flex;gap:3px;align-items:center">${badge}</span>
        </div>
        ${pct!==null ? `<div class="card-bar"><span style="width:${pct}%"></span></div>` : ""}`;
    }

    card._sig = _rowSignature(r);
  }

  function renderGrid(rows) {
    const grid = $("invGrid");
    // Index existing cards by spoolId so we can reuse them.
    const existing = new Map();
    grid.querySelectorAll(".spool-card").forEach(el => existing.set(el.dataset.id, el));
    const seen = new Set();
    rows.forEach((r, idx) => {
      seen.add(r.spoolId);
      let card = existing.get(r.spoolId);
      const newSig = _rowSignature(r);
      if (!card) {
        card = _createGridCard(r);
      } else if (card._sig !== newSig) {
        _updateGridCard(card, r);
      }
      // Place card at correct position (preserves order without DOM thrash:
      // insertBefore on an already-positioned node is a no-op in Chromium).
      const expected = grid.children[idx];
      if (expected !== card) grid.insertBefore(card, expected || null);
    });
    // Remove orphans (spools deleted from inventory)
    existing.forEach((el, id) => { if (!seen.has(id)) el.remove(); });
  }

  // Build the inner HTML of a table row from a row. Single-source for create + update.
  function _tableRowInnerHTML(r) {
    const swatch = colorCircleHTML(r, 28);
    let wCell = "-";
    if (r.weightAvailable != null) {
      wCell = `${r.weightAvailable} g`;
      if (r.capacity) { const p = Math.max(0,Math.min(100,Math.round(r.weightAvailable/r.capacity*100))); wCell += `<span class="bar" title="${p}%"><span style="width:${p}%"></span></span>`; }
    }
    return `
      <td class="thumb-cell">${thumbHTML(r, 50)}</td>
      <td>${tierBadgeHTML(r)}</td>
      <td>${esc(v(r.material))}</td>
      <td>${esc(v(r.brand))}</td>
      <td class="color-cell">${swatch}</td>
      <td>${esc(v(r.colorName) !== "-" ? r.colorName : [r.aspect1, r.aspect2].filter(a => a && a !== "-" && a !== "None").join(" ") || r.colorName)}</td>
      <td style="font-variant-numeric:tabular-nums">${wCell}</td>
      <td style="font-variant-numeric:tabular-nums">${v(r.capacity)}${r.capacity!=null?" g":""}</td>
      <td title="${esc(fmtTs(r.lastUpdate))}">${esc(timeAgo(r.lastUpdate))}</td>`;
  }

  function _createTableRow(r) {
    const tr = document.createElement("tr");
    tr.dataset.id = r.spoolId;
    if (state.selected === r.spoolId) tr.classList.add("selected");
    if (r.deleted) tr.classList.add("deleted");
    tr.innerHTML = _tableRowInnerHTML(r);
    tr.addEventListener("click", () => openDetail(r.spoolId));
    tr._sig = _rowSignature(r);
    return tr;
  }

  function _updateTableRow(tr, r) {
    tr.classList.toggle("selected", state.selected === r.spoolId);
    tr.classList.toggle("deleted", !!r.deleted);
    tr.innerHTML = _tableRowInnerHTML(r);
    tr._sig = _rowSignature(r);
  }

  function renderTable(rows) {
    const tbody = $("invBody");
    const existing = new Map();
    tbody.querySelectorAll("tr").forEach(el => existing.set(el.dataset.id, el));
    const seen = new Set();
    rows.forEach((r, idx) => {
      seen.add(r.spoolId);
      let tr = existing.get(r.spoolId);
      const newSig = _rowSignature(r);
      if (!tr) {
        tr = _createTableRow(r);
      } else if (tr._sig !== newSig) {
        _updateTableRow(tr, r);
      }
      const expected = tbody.children[idx];
      if (expected !== tr) tbody.insertBefore(tr, expected || null);
    });
    existing.forEach((el, id) => { if (!seen.has(id)) el.remove(); });
  }

  /* ── view toggle ── */
  function setViewMode(mode) {
    const prevMode = state.viewMode;
    state.viewMode = mode;
    localStorage.setItem("tigertag.view", mode);
    $("btnViewTable")?.classList.toggle("active", mode === "table");
    $("btnViewGrid")?.classList.toggle("active",  mode === "grid");
    $("btnViewRack")?.classList.toggle("active",  mode === "rack");
    $("btnViewPrinter")?.classList.toggle("active",      mode === "printer");
    $("btnViewPrinterTable")?.classList.toggle("active", mode === "printer-table");
    $("btnViewCam")?.classList.toggle("active",          mode === "printer-cam");
    // Force-open + animate the side panel ONLY when transitioning INTO rack
    // mode from another view. Re-clicking Storage while already in Storage
    // is a no-op for the panel.
    if (mode === "rack" && prevMode !== "rack" && getUnrackedSpools().length > 0) {
      localStorage.setItem("tigertag.unrackedPanelOpen", "true");
      _unrackedAnimateOpen = true;
    }
    // FlashForge allows only ONE concurrent MJPEG client. When leaving the cam
    // wall, tear down any stream it opened so the detail panel (or next cam-wall
    // render) gets a clean slot. Safe to call unconditionally — it's a no-op
    // when there are no active .ffg-camera-img elements.
    if (prevMode === "printer-cam") {
      try { ffgTearDownCamera(); } catch (_) {}
      try { acuReleaseCloudCameras(); } catch (_) {} // leave Agora channels when off the wall
    }
    renderInventory();
    // Safety re-subscribe when switching to rack mode (handles users connected before this feature)
    if (mode === "rack" && !state.unsubRacks && state.activeAccountId) {
      subscribeRacks(state.activeAccountId);
    }
    // Safety re-subscribe when switching to printer mode (handles users connected before this feature)
    if (_isPrinterMode(mode) && (!state.unsubPrinters || !state.unsubPrinters.length) && state.activeAccountId) {
      subscribePrinters(state.activeAccountId);
    }
    // Swap the header Add button label: "Add Product" (inventory) ↔
    // "Add Device" (printer modes) ↔ "Add Rack" (storage mode).
    const _addLbl = $("btnAddProduct")?.querySelector("[data-i18n]");
    if (_addLbl) {
      const _key = _isPrinterMode(mode) ? "addDeviceBtn"
                 : mode === "rack"        ? "addRackBtn"
                 :                          "addProductBtn";
      _addLbl.dataset.i18n = _key;
      _addLbl.textContent  = t(_key);
    }
  }
  $("btnViewTable").addEventListener("click", () => setViewMode("table"));
  $("btnViewGrid").addEventListener("click",  () => setViewMode("grid"));
  $("btnViewRack")?.addEventListener("click", () => setViewMode("rack"));
  $("btnViewPrinter")?.addEventListener("click",      () => setViewMode("printer"));
  $("btnViewPrinterTable")?.addEventListener("click", () => setViewMode("printer-table"));
  $("btnViewCam")?.addEventListener("click",          () => setViewMode("printer-cam"));
  // Restore active button on boot
  if (state.viewMode === "grid") { $("btnViewGrid").classList.add("active"); $("btnViewTable").classList.remove("active"); }
  else if (state.viewMode === "rack") {
    $("btnViewRack")?.classList.add("active"); $("btnViewTable").classList.remove("active");
    // Initialise Add button label for storage mode on first load
    const _al = $("btnAddProduct")?.querySelector("[data-i18n]");
    if (_al) { _al.dataset.i18n = "addRackBtn"; _al.textContent = t("addRackBtn"); }
  }
  else if (state.viewMode === "printer") {
    $("btnViewPrinter")?.classList.add("active"); $("btnViewTable").classList.remove("active");
    // Initialise Add button label for printer mode on first load
    const _al = $("btnAddProduct")?.querySelector("[data-i18n]");
    if (_al) { _al.dataset.i18n = "addDeviceBtn"; _al.textContent = t("addDeviceBtn"); }
  } else if (state.viewMode === "printer-table") {
    $("btnViewPrinterTable")?.classList.add("active"); $("btnViewTable").classList.remove("active");
    const _al = $("btnAddProduct")?.querySelector("[data-i18n]");
    if (_al) { _al.dataset.i18n = "addDeviceBtn"; _al.textContent = t("addDeviceBtn"); }
  } else if (state.viewMode === "printer-cam") {
    $("btnViewCam")?.classList.add("active"); $("btnViewTable").classList.remove("active");
    const _al = $("btnAddProduct")?.querySelector("[data-i18n]");
    if (_al) { _al.dataset.i18n = "addDeviceBtn"; _al.textContent = t("addDeviceBtn"); }
  }

  // Toggle the clear-button visibility in lock-step with the input
  // value — only shown when there's something to clear. The same pass
  // updates state.search and re-renders so typing feels native.
  function _refreshSearchClearVisibility(value) {
    const btn = $("searchInvClear");
    if (!btn) return;
    btn.hidden = !value || !value.length;
  }
  // Reset the search bar + all quick-filters when switching instance
  // (account switch or friend view). Called before rendering the new view
  // so the first render is always unfiltered.
  function _clearSearchFilters() {
    state.search        = "";
    state.brandFilter    = "";
    state.materialFilter = "";
    state.typeFilter     = "";
    const si = $("searchInv");
    if (si) { si.value = ""; _refreshSearchClearVisibility(""); }
    ["brandFilter", "materialFilter", "typeFilter"].forEach(id => {
      const sel = $(id);
      if (sel) { sel.value = ""; sel.classList.remove("is-active"); }
    });
  }

  // Skip the full DOM rebuild on filter changes and just toggle `.hidden`
  // (grid/table) or `rp-dim`/`rp-slot--match` (rack) on existing nodes —
  // rebuilding 100-300 cards/rows on every keystroke flashed the whole view
  // because every `<img>` was destroyed and re-decoded.
  // Stats (header counters) don't depend on the search, so the class toggle
  // is sufficient.
  function _onFilterChange() {
    if (state.viewMode === "rack") { applyRackSearchDim(); return; }
    if (state.viewMode === "grid" || state.viewMode === "table") {
      applyInventoryFilter();
      return;
    }
    renderInventory();
  }
  $("searchInv").addEventListener("input", e => {
    const v = e.target.value;
    state.search = v.trim();
    _refreshSearchClearVisibility(v);
    _onFilterChange();
  });
  // Clear button — wipes the input, refocuses for further typing, and
  // re-renders the inventory immediately. We dispatch an `input` event
  // too so anything else listening (e.g. future autocomplete) sees the
  // empty value through the same channel as a manual delete.
  $("searchInvClear")?.addEventListener("click", () => {
    const inp = $("searchInv");
    if (!inp) return;
    inp.value = "";
    state.search = "";
    _refreshSearchClearVisibility("");
    _onFilterChange();
    inp.focus();
  });
  // Initial sync — covers the case where the input was pre-populated
  // by a previous render or autofill (rare but possible).
  _refreshSearchClearVisibility($("searchInv")?.value);
  $("brandFilter")?.addEventListener("change", e => {
    state.brandFilter = e.target.value;
    e.target.classList.toggle("is-active", !!state.brandFilter);
    _onFilterChange();
  });
  $("materialFilter")?.addEventListener("change", e => {
    state.materialFilter = e.target.value;
    e.target.classList.toggle("is-active", !!state.materialFilter);
    _onFilterChange();
  });
  $("typeFilter")?.addEventListener("change", e => {
    state.typeFilter = e.target.value;
    e.target.classList.toggle("is-active", !!state.typeFilter);
    _onFilterChange();
  });

  // ── Stat tile click → quick type filter ────────────────────────────────────
  // Clicking a version tile (TigerTag / TigerTag+ / TigerCloud) sets the
  // typeFilter and highlights the tile. Clicking it again, or clicking a
  // "reset" tile (SPOOLS / STOCK), clears the filter back to "All versions".
  $("sbStats")?.addEventListener("click", e => {
    const tile = e.target.closest(".sb-stat[data-filter]");
    if (!tile) return;
    const f = tile.dataset.filter;
    if (f === "reset" || state.typeFilter === f) {
      state.typeFilter = "";
    } else {
      state.typeFilter = f;
    }
    const sel = $("typeFilter");
    if (sel) {
      sel.value = state.typeFilter;
      sel.classList.toggle("is-active", !!state.typeFilter);
    }
    _onFilterChange();
  });

  function updateSortIndicators() {
    document.querySelectorAll("th.sortable").forEach(th => {
      th.classList.toggle("sort-asc",  state.sortCol === th.dataset.sort && state.sortDir === "asc");
      th.classList.toggle("sort-desc", state.sortCol === th.dataset.sort && state.sortDir === "desc");
    });
  }
  document.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      if (state.sortCol === th.dataset.sort) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortCol = th.dataset.sort;
        state.sortDir = "asc";
      }
      updateSortIndicators();
      renderInventory();
    });
  });

  /* ── Burn RFID — write current doc to all readers that have a card present ──
     Single payload build → same timestamp on all chips. No Firestore doc
     migration (doc already exists with the right UID).
     Also clears needUpdateAt on success (chip is now in sync).               */
  async function _burnRfid(r) {
    if (!window.electronAPI || state.nfcCardPresent.size === 0) return;
    const cloudDoc = state.inventory[r.spoolId];
    if (!cloudDoc) return;

    // Only target readers that actually have a card
    const targets = [...state.nfcCardPresent.entries()]
      .map(([readerName, { uid }]) => ({ readerName, uid }));
    if (targets.length === 0) return;

    // Both buttons that can trigger this action — disable all during write
    const allBtns = [$("btnBurnRfid"), $("btnChipDone")].filter(Boolean);
    allBtns.forEach(b => { b.disabled = true; });
    // Progress label only applies to the toolbox row (has .toolbox-row-label child)
    const labelEl = $("btnBurnRfid")?.querySelector(".toolbox-row-label");
    if (labelEl) labelEl.textContent = t("encodeCloudInProgress");

    let result;
    try {
      result = await window.electronAPI.encodeCloudSpool({ cloudDoc, targets });
    } catch (e) {
      console.error("[burnRfid] IPC error:", e);
      allBtns.forEach(b => { b.disabled = false; });
      if (labelEl) labelEl.textContent = t("burnRfidBtn");
      return;
    }

    const okCount = (result.results || []).filter(x => x.ok).length;
    const total   = targets.length;

    allBtns.forEach(b => { b.disabled = false; });
    if (labelEl) {
      labelEl.textContent = okCount === total
        ? t("burnRfidSuccess", { n: okCount })
        : t("burnRfidError",   { ok: okCount, total });
      setTimeout(() => { if (labelEl) labelEl.textContent = t("burnRfidBtn"); }, 3000);
    }

    // Chip is now up to date — clear needUpdateAt on this spool + twin
    if (okCount > 0 && r.needUpdateAt) {
      const ownerUid = state.activeAccountId; if (!ownerUid) return;
      const db     = fbDb(ownerUid); // named instance — stable after async IPC call
      const invRef = db.collection("users").doc(ownerUid).collection("inventory");
      try {
        const batch = db.batch();
        batch.update(invRef.doc(r.spoolId), { needUpdateAt: null });
        if (r.twinUid) {
          const tr = state.rows.find(x =>
            x.spoolId !== r.spoolId &&
            (String(x.uid) === String(r.twinUid) || String(x.spoolId) === String(r.twinUid))
          );
          if (tr) batch.update(invRef.doc(tr.spoolId), { needUpdateAt: null });
        }
        await batch.commit();
      } catch (e) { console.error("[burnRfid] needUpdateAt clear failed:", e); }
    }
  }

  /* ── Cloud → chip encode — guided dual-chip burn modal ───────────────────────
     State machine: confirm → burning → success | failed. Presence-gated,
     sequential burn (100 ms gap) with per-chip read-back verification (the
     IPC `burnOneChip` only returns verified:true on a byte-match read-back),
     all-or-nothing Firestore migration. Modal closes only on success or
     explicit abort. See ROADMAP "Cloud → chip encode" for the full spec.   */
  const _CEM_EPOCH_MS = Date.UTC(2000, 0, 1);
  let _cemRow      = null;                 // spool row being encoded
  let _cemState    = "confirm";            // confirm | burning | failed
  let _cemChip     = new Map();            // readerName → "waiting"|"ready"|"writing"|"ok"|"fail"
  let _cemBlank    = new Map();            // readerName → true(blank)|false(non-blank)|undefined(unknown)
  let _cemTargets  = [];                   // [{ readerName, uid }] captured at burn launch
  let _cemAborted  = false;
  const _cemDelay  = (ms) => new Promise(res => setTimeout(res, ms));

  function _cemBeep(ok) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ac = new Ctx();
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = "sine";
      o.frequency.value = ok ? 880 : 220;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.22);
      o.start(); o.stop(ac.currentTime + 0.24);
      o.onended = () => { try { ac.close(); } catch (_) {} };
    } catch (_) {}
  }

  function openEncodeModal(r) {
    if (!window.electronAPI || !r?.isCloud) return;
    _cemRow = r; _cemState = "confirm"; _cemAborted = false;
    _cemChip = new Map(); _cemBlank = new Map(); _cemTargets = [];
    const ow = $("cemOwToggle"); if (ow) ow.checked = false;
    $("cloudEncodeOverlay")?.classList.add("open");
    _cemRender();
    _cemBlankCheck();   // read present chips to detect non-blank → overwrite warning
  }
  function closeEncodeModal() {
    // Closing = user abort. A write already in flight finishes but no migration runs.
    _cemAborted = true;
    $("cloudEncodeOverlay")?.classList.remove("open");
    _cemRow = null; _cemState = "confirm";
  }

  // True while the guided Encode modal is open. A chip presented for encoding
  // also fires the normal scan path; we use this to suppress the auto side-card
  // it would otherwise pop over the modal (the chip is about to be overwritten).
  function _encodeModalOpen() {
    return !!$("cloudEncodeOverlay")?.classList.contains("open");
  }

  // Present readers (connected + holding a card), with their UID, in stable order.
  function _cemPresentTargets() {
    return [...state.nfcReaders]
      .filter(n => state.nfcCardPresent.has(n))
      .map(n => ({ readerName: n, uid: state.nfcCardPresent.get(n)?.uid || null }));
  }

  async function _cemBlankCheck() {
    if (!window.electronAPI?.readRfidNow) return;
    for (const { readerName } of _cemPresentTargets()) {
      if (_cemBlank.has(readerName)) continue;
      try {
        const res = await window.electronAPI.readRfidNow(readerName);
        // Non-blank when the user pages aren't all 0x00 / 0xFF.
        const hex = (res?.rawPagesHex || "").toLowerCase();
        const blank = !hex || /^[0f]*$/.test(hex);
        _cemBlank.set(readerName, blank);
      } catch (_) { _cemBlank.set(readerName, undefined); }
    }
    if (_cemState === "confirm") _cemRender();
  }

  function _cemRender() {
    const overlay = $("cloudEncodeOverlay");
    if (!overlay || !overlay.classList.contains("open")) return;
    const readers = [...state.nfcReaders];
    const present = _cemPresentTargets();
    const burning = _cemState === "burning";

    // Chip cards — one per connected reader. State is conveyed entirely by
    // COLOUR (grey=waiting · blue=ready/writing · green=done · red=failed):
    // no per-chip text, no per-chip bar. Slot number shown only with 2 readers.
    const showNums = readers.length > 1;
    const cards = (readers.length ? readers : ["__none__"]).map((name, i) => {
      const hasReader = name !== "__none__";
      const card  = hasReader && state.nfcCardPresent.get(name);
      let st = _cemChip.get(name);
      if (!burning) st = hasReader ? (card ? "ready" : "waiting") : "none";
      st = st || "waiting";
      const numBadge = (hasReader && showNums) ? `<span class="cem-chip-num">${i + 1}</span>` : "";
      const dbgUid = (state.debugEnabled && card?.uid) ? `<div class="cem-chip-uid">${esc(card.uid)}</div>` : "";
      return `<div class="cem-chip cem-chip--${st}">
        ${numBadge}
        <div class="cem-chip-logo"></div>
        ${dbgUid}
      </div>`;
    }).join("");
    const chipsEl = $("cemChips"); if (chipsEl) chipsEl.innerHTML = cards;

    // Gate.
    const nonBlank = present.some(p => _cemBlank.get(p.readerName) === true);
    const sameUid  = present.length === 2 && present[0].uid && present[0].uid === present[1].uid;
    const gateReady = !burning && readers.length >= 1 && present.length === readers.length && !sameUid
      && (!nonBlank || $("cemOwToggle")?.checked);

    // Global progress bar — sequence-wide (NOT per chip). Shown while burning
    // or after a failure; hidden in confirm/ready (chip colour conveys state).
    const total      = burning ? _cemTargets.length : (readers.length || 1);
    const done       = [..._cemChip.values()].filter(s => s === "ok").length;
    const anyFail    = [..._cemChip.values()].includes("fail");
    const anyWriting = [..._cemChip.values()].includes("writing");
    const progEl = $("cemProgress");
    if (progEl) {
      progEl.classList.toggle("hidden", !(burning || _cemState === "failed"));
      progEl.classList.toggle("cem-progress--fail", anyFail);
      progEl.classList.toggle("cem-progress--done", total > 0 && done === total && !anyFail);
      progEl.classList.toggle("cem-progress--writing", anyWriting);
      const fill = progEl.querySelector(".cem-progress-fill");
      if (fill) fill.style.width = total ? Math.round((done / total) * 100) + "%" : "0%";
    }

    // The top hint ("Hold the RFID tags in front of the readers") is a fixed
    // instruction set once from i18n — never toggled here.

    // Overwrite section
    const owEl = $("cemOverwrite");
    if (owEl) owEl.classList.toggle("hidden", burning || !nonBlank);
    // Status line — only for exceptional states (failure / same chip twice /
    // no reader). Red for the error cases.
    const stEl = $("cemStatus");
    if (stEl) {
      const isErr = _cemState === "failed" || sameUid;
      stEl.textContent =
        _cemState === "failed" ? t("encFailed")
        : sameUid              ? t("encSameUid")
        : readers.length === 0 ? t("encNoReader")
        :                        "";
      stEl.classList.toggle("cem-status--fail", isErr);
    }
    // Burn button (Cancel removed — close via the ✕ or the backdrop). The whole
    // actions row is hidden during the burn so there's no dead button.
    const burnBtn = $("cemBurn");
    if (burnBtn) {
      burnBtn.disabled = !gateReady;
      burnBtn.textContent = _cemState === "failed" ? t("encRetry") : t("encBurn");
      burnBtn.closest(".cem-actions")?.classList.toggle("hidden", burning);
    }
  }

  // Card appeared/removed while the modal is open.
  function _cemPresenceChanged() {
    if (!_cemRow) return;
    if (_cemState === "burning") {
      // A launched chip leaving its reader mid-sequence = failure.
      for (const tgt of _cemTargets) {
        if (!state.nfcCardPresent.has(tgt.readerName)) {
          _cemAborted = true;
          if (_cemChip.get(tgt.readerName) !== "ok") _cemChip.set(tgt.readerName, "fail");
        }
      }
      _cemRender();
      return;
    }
    // Prune the blank-cache for readers that no longer hold a card, so a
    // swapped-in chip on the same reader is re-checked.
    for (const name of [..._cemBlank.keys()]) {
      if (!state.nfcCardPresent.has(name)) _cemBlank.delete(name);
    }
    _cemBlankCheck();
    _cemRender();
  }

  async function _cemStartBurn() {
    if (_cemState === "burning" || !_cemRow) return;
    const r = _cemRow;
    const cloudDoc = state.inventory[r.spoolId];
    if (!cloudDoc) return;

    // Lock in the chips present right now — the immutable N-chip contract.
    _cemTargets = _cemPresentTargets();
    if (_cemTargets.length === 0) return;
    if (_cemTargets.length === 2 && _cemTargets[0].uid && _cemTargets[0].uid === _cemTargets[1].uid) {
      _cemState = "failed"; _cemRender(); _cemBeep(false); return;
    }

    _cemState = "burning"; _cemAborted = false;
    _cemTargets.forEach(t => _cemChip.set(t.readerName, "waiting"));
    _cemRender();

    // One fixed chip-epoch timestamp for the whole sequence → identical bytes
    // on every chip → they pair as twins.
    const timestamp = Math.max(0, Math.floor((Date.now() - _CEM_EPOCH_MS) / 1000));
    const burned = [];   // { readerName, uid } verified-ok chips

    for (let i = 0; i < _cemTargets.length; i++) {
      const tgt = _cemTargets[i];
      if (_cemAborted) break;
      if (!state.nfcCardPresent.has(tgt.readerName)) {   // moved before its turn
        _cemChip.set(tgt.readerName, "fail"); _cemAborted = true; _cemRender(); break;
      }
      _cemChip.set(tgt.readerName, "writing"); _cemRender();
      let res;
      try {
        res = await window.electronAPI.burnOneChip({ cloudDoc, timestamp, readerName: tgt.readerName });
      } catch (e) { res = { ok: false, error: String(e) }; }
      const okv = !_cemAborted && res && res.ok && res.verified && state.nfcCardPresent.has(tgt.readerName);
      _cemChip.set(tgt.readerName, okv ? "ok" : "fail");
      _cemRender();
      if (!okv) { _cemAborted = true; break; }
      burned.push({ readerName: tgt.readerName, uid: res.uid || tgt.uid });
      if (i < _cemTargets.length - 1) await _cemDelay(100);   // 100 ms inter-chip gap
    }

    const fullSuccess = !_cemAborted && burned.length === _cemTargets.length;
    if (!fullSuccess) {
      _cemState = "failed"; _cemRender(); _cemBeep(false);
      return;
    }
    // Anti self-twin guard (defensive).
    if (burned.length === 2 && burned[0].uid && burned[0].uid === burned[1].uid) {
      _cemState = "failed"; _cemRender(); _cemBeep(false); return;
    }
    try {
      await _cemMigrate(r, cloudDoc, burned, timestamp);
      _cemBeep(true);
      closeEncodeModal();
      closeDetail();
    } catch (e) {
      console.error("[encodeModal] migration failed:", e);
      _cemState = "failed"; _cemRender(); _cemBeep(false);
    }
  }

  // Firestore migration — only after a full verified burn. Creates the physical
  // doc(s) (twin cross-linked) and deletes the Cloud doc, in one batch.
  async function _cemMigrate(r, cloudDoc, burned, timestamp) {
    const ownerUid = state.activeAccountId;
    if (!ownerUid) throw new Error("no account");
    const db     = fbDb(ownerUid);
    const invRef = db.collection("users").doc(ownerUid).collection("inventory");
    const FV     = firebase.firestore.FieldValue;
    const { needUpdateAt: _n, deleted: _d, deleted_at: _da, ...baseFields } = cloudDoc;
    const now = Date.now();
    const batch = db.batch();
    const [c1, c2] = burned;
    // CRITICAL: stamp the doc with the SAME chip-epoch timestamp that was just
    // burned onto the chip (line ~6123). On the next rescan the scan path
    // compares stored.timestamp vs the chip's timestamp; if they differ it
    // treats the chip as "rewritten for a different filament" and HARD-DELETES
    // the doc, wiping container_id / container_weight / the DB weight — which
    // auto-assign then refills with the generic-cardboard default. Keeping them
    // equal makes the rescan take the "same chip" branch (preserveDbWeight) and
    // leaves the user's container + weight intact. Override after the spread so
    // it wins over any stale cloudDoc.timestamp.
    batch.set(invRef.doc(c1.uid), {
      ...baseFields, uid: c1.uid, twin_tag_uid: c2 ? c2.uid : null,
      timestamp: timestamp ?? baseFields.timestamp ?? 0,
      last_update: now, updatedAt: FV.serverTimestamp(),
    });
    if (c2) {
      batch.set(invRef.doc(c2.uid), {
        ...baseFields, uid: c2.uid, twin_tag_uid: c1.uid,
        timestamp: timestamp ?? baseFields.timestamp ?? 0,
        last_update: now, updatedAt: FV.serverTimestamp(),
      });
    }
    batch.delete(invRef.doc(r.spoolId));
    await batch.commit();
    // One TigerCloud spool became a physical chip (a twin burn is still ONE
    // cloud converted, hence +1 regardless of burned.length).
    bumpStudioCounters({ cloudToTagTotal: 1 });
    console.log(`[encodeModal] migrated ${r.spoolId} → ${burned.map(b => b.uid).join(" + ")}`);
  }

  // ── Refresh TigerTag+ catalogue data from API ────────────────────────────
  // Calls rawApi() via IPC (same path as RFID scan), then applies _api fields
  // to the existing Firestore doc. silent=true suppresses "no change" toast
  // and error toast (used for automatic background refresh on panel open).
  async function _refreshApiData(r, { silent = false } = {}) {
    if (!window.electronAPI?.refreshApiData) return;
    const rawDoc = state.inventory[r.spoolId];
    if (!rawDoc) return;
    const btn = $("btnRefreshApi");
    if (btn) { btn.disabled = true; btn.querySelector(".toolbox-row-label").textContent = t("toolRefreshApiLoading"); }
    try {
      const res = await window.electronAPI.refreshApiData(rawDoc);
      if (!res.ok) throw new Error(res.error || "unknown");
      const api = res.api;
      const update = {};
      if (api.name)                          update.name               = api.name;
      if (api.sku)                           update.sku                = api.sku;
      if (api.barcode)                       update.barcode            = api.barcode;
      if (api.series)                        update.series             = api.series;
      if (api.images?.main_src)              update.url_img            = api.images.main_src;
      if (api.filament?.color)               update.online_color       = api.filament.color;
      if (api.filament?.color_info?.colors?.length)
                                             update.online_color_list  = api.filament.color_info.colors;
      if (api.filament?.color_info?.type)    update.online_color_type  = api.filament.color_info.type;
      if (api.links?.tds)                    update.LinkTDS            = api.links.tds;
      if (api.links?.msds)                   update.LinkMSDS           = api.links.msds;
      if (api.links?.rohs)                   update.LinkROHS           = api.links.rohs;
      if (api.links?.reach)                  update.LinkREACH          = api.links.reach;
      if (api.links?.tips)                   update.LinkTIPS           = api.links.tips;
      if (api.links?.food)                   update.LinkFOOD           = api.links.food;
      if (api.links?.youtube)                update.LinkYoutube        = api.links.youtube;
      if (api.filament?.refill)              update.info1              = true;
      if (api.filament?.recycled)            update.info2              = true;
      if (api.filament?.filled)              update.info3              = true;
      if (Object.keys(update).length === 0) {
        if (!silent) toast(t("toolRefreshApiNoChange"), "info");
        return;
      }
      update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      const uid = fbAuth().currentUser?.uid;
      if (!uid) return;
      await fbDb().collection("users").doc(uid).collection("inventory").doc(r.spoolId).update(update);
      toast(t("toolRefreshApiSuccess"), "success");
    } catch (e) {
      console.error("[refreshApi]", e);
      if (!silent) toast(t("toolRefreshApiError"), "error");
    } finally {
      if (btn) { btn.disabled = false; btn.querySelector(".toolbox-row-label").textContent = t("toolRefreshApi"); }
    }
  }

  // ── Convert TigerTag → TigerTag+ ─────────────────────────────────────────
  // Step 1: validate product_id against the catalogue API, show a preview.
  let _convertApiCache = null; // holds last valid api response for _convertToPlus
  async function _lookupPlusProduct(r) {
    const input   = $("upgradePlusInput");
    const preview = $("upgradePlusPreview");
    const confirm = $("upgradePlusConfirm");
    const checkBtn = $("upgradePlusCheck");
    if (!input || !preview) return;
    const productId = parseInt(input.value, 10);
    if (!productId || productId <= 0) return;
    _convertApiCache = null;
    confirm.style.display = "none";
    preview.innerHTML = `<span class="upgrade-plus-checking">${t("upgradeToPlusChecking")}</span>`;
    if (checkBtn) checkBtn.disabled = true;
    try {
      const res = await window.electronAPI.lookupProduct(productId);
      if (!res.ok || !res.api) {
        preview.innerHTML = `<span class="upgrade-plus-notfound">${t("upgradeToPlusNotFound")}</span>`;
        return;
      }
      _convertApiCache = { productId, api: res.api };
      const api   = res.api;
      const img   = api.images?.main_src || api.images?.thumb_src || "";
      // Build label: Brand · Series · Name · Weight · [Refill]
      // Use api.brand directly — more reliable than local id_brand lookup at check time.
      const brandLbl  = api.brand || brandName(r?.id_brand) || "";
      const seriesLbl = api.series || "";
      const nameLbl   = api.name   || `Product #${productId}`;
      const cap       = r?.capacity || 0;
      const weightLbl = cap >= 1000
        ? `${+(cap / 1000).toFixed(2).replace(/\.?0+$/, "")}kg`
        : cap > 0 ? `${cap}g` : "";
      const refillLbl = api.filament?.refill ? "Refill" : "";
      const label = [brandLbl, seriesLbl, nameLbl, weightLbl, refillLbl]
        .filter(Boolean).join(" ");
      preview.innerHTML = `
        <div class="upgrade-plus-result">
          ${img ? `<img class="upgrade-plus-thumb" src="${esc(img)}" alt="">` : ""}
          <span class="upgrade-plus-name">${esc(label)}</span>
        </div>`;
      confirm.style.display = "";
    } catch (e) {
      preview.innerHTML = `<span class="upgrade-plus-notfound">${t("upgradeToPlusNotFound")}</span>`;
    } finally {
      if (checkBtn) checkBtn.disabled = false;
    }
  }

  // Step 2: apply the validated API data to Firestore — spool becomes TigerTag+.
  async function _convertToPlus(r) {
    if (!_convertApiCache) return;
    const { productId, api } = _convertApiCache;
    const confirm = $("upgradePlusConfirm");
    if (confirm) confirm.disabled = true;
    try {
      const ID_TIGERTAG_PLUS = 0xBC0FCB97; // 3155151767
      const update = { id_product: productId, id_tigertag: ID_TIGERTAG_PLUS };
      if (api.name)                        update.name              = api.name;
      if (api.sku)                         update.sku               = api.sku;
      if (api.barcode)                     update.barcode           = api.barcode;
      if (api.series)                      update.series            = api.series;
      if (api.images?.main_src)            update.url_img           = api.images.main_src;
      if (api.filament?.color)             update.online_color      = api.filament.color;
      if (api.filament?.color_info?.colors?.length)
                                           update.online_color_list = api.filament.color_info.colors;
      if (api.filament?.color_info?.type)  update.online_color_type = api.filament.color_info.type;
      if (api.links?.tds)                  update.LinkTDS           = api.links.tds;
      if (api.links?.msds)                 update.LinkMSDS          = api.links.msds;
      if (api.links?.rohs)                 update.LinkROHS          = api.links.rohs;
      if (api.links?.reach)                update.LinkREACH         = api.links.reach;
      if (api.links?.tips)                 update.LinkTIPS          = api.links.tips;
      if (api.links?.food)                 update.LinkFOOD          = api.links.food;
      if (api.links?.youtube)              update.LinkYoutube       = api.links.youtube;
      if (api.filament?.refill)            update.info1             = true;
      if (api.filament?.recycled)          update.info2             = true;
      if (api.filament?.filled)            update.info3             = true;
      update.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      const uid = fbAuth().currentUser?.uid;
      if (!uid) return;
      await fbDb().collection("users").doc(uid).collection("inventory").doc(r.spoolId).update(update);
      // Conversion to TigerTag+ — classify by the source spool's type.
      bumpStudioCounters(r.isCloud ? { cloudToPlusTotal: 1 } : { tagToPlusTotal: 1 });
      _convertApiCache = null;
      toast(t("upgradeToPlusSuccess"), "success");
    } catch (e) {
      console.error("[convertToPlus]", e);
      toast(t("toolRefreshApiError"), "error");
      if (confirm) confirm.disabled = false;
    }
  }

  /* ── Duplicate a spool as fresh TigerCloud entries ──────────────────
     Clones the spool into `count` new docs, each with its own Cloud UID.
     The clones are always Cloud and IDENTICAL to each other (same
     id_tigertag, colour, material…) — only the UID and the timestamp
     differ. A basic TigerTag loses its physical chip identity (it needs
     a Cloud UID); TigerTag+ is never duplicable (the toolbox gates it).

     Nothing physical survives the clone — no twin link, no rack
     placement — because a Cloud entry has no physical existence.

     Twin-conflict avoidance via staggered timestamps: the chip timestamp
     doubles as the twin-pairing key (the auto-linker pairs two docs that
     share id_tigertag AND fall within a 2s window). Since the clones are
     deliberately identical (same id_tigertag), we space their timestamps
     +3s apart so no two clones — and no clone vs. the source — ever land
     inside that 2s window. The base is `now`, bumped past the source's
     own timestamp so even an freshly-created source can't pair with the
     first clone. These aren't real programming times, but it's the only
     lever that keeps identical copies from being auto-twinned. */
  async function duplicateSpoolAsCloud(r, count = 1) {
    if (state.friendView) return 0;
    const user = fbAuth().currentUser;
    if (!user) return 0;
    const n = Math.max(1, Math.min(50, parseInt(count, 10) || 1));
    const invRef = fbDb(user.uid).collection("users").doc(user.uid).collection("inventory");
    const batch  = fbDb(user.uid).batch();
    // Source timestamp in chip-epoch seconds. Normalise a legacy Unix-epoch
    // value (misencoded older Cloud docs) so the staggering math stays in one
    // unit. Base = now (chip epoch), nudged past the source so the 2s twin
    // auto-linker can't pair a clone back with its source.
    let srcTs = (typeof r.chipTimestamp === "number") ? r.chipTimestamp : 0;
    if (srcTs > 1400000000) srcTs -= CHIP_EPOCH_OFFSET;
    const baseTs = Math.max(nowChipTs(), srcTs + 3);
    const usedIds = new Set();
    for (let i = 0; i < n; i++) {
      let newId = _adpCloudId();
      while (usedIds.has(newId)) newId = _adpCloudId();   // no collision within the batch
      usedIds.add(newId);
      const data = { ...(r.raw || {}) };
      data.uid = newId;
      delete data.twin_tag_uid;
      delete data.rack; delete data.rack_id; delete data.level; delete data.position;
      delete data.needUpdateAt;
      data.timestamp  = baseTs + i * 3;                   // +3s per copy → outside the 2s twin window
      data.updatedAt  = firebase.firestore.FieldValue.serverTimestamp();
      data.deleted    = null;
      data.deleted_at = null;
      batch.set(invRef.doc(newId), data);
    }
    await batch.commit();
    bumpStudioCounters({ cloudAddedTotal: n });
    return n;
  }

  /* ── Inline edit of the spool message (= editable name) ─────────────
     Swaps the identity-block name button for a text input. Saves the
     `message` field to Firestore on Enter / blur, cancels on Escape.
     Enforces the same 28-byte UTF-8 cap as the chip's color_name slot.
     After the write we patch the in-memory row + re-render the panel so
     the new name shows immediately (before the live snapshot lands). */
  function startMessageInlineEdit(r) {
    const btn = $("piNameEdit");
    if (!btn || btn.dataset.editing === "1" || state.friendView) return;
    const user = fbAuth().currentUser;
    if (!user) return;
    btn.dataset.editing = "1";
    const raw    = btn.dataset.raw || "";
    const parent = btn.parentNode;
    // Wrapper holds the input + a thin byte-usage bar (no number shown):
    // it fills as the 28-byte UTF-8 budget is consumed, amber near the
    // limit, red when full.
    const wrap = document.createElement("span");
    wrap.className = "pi-name-editwrap";
    const input  = document.createElement("input");
    input.type = "text";
    input.className = "pi-name-input";
    input.value = raw;
    input.spellcheck = false;
    input.autocomplete = "off";
    input.placeholder = t("msgEditAdd");
    const bar  = document.createElement("span");
    bar.className = "pi-name-bar";
    const fill = document.createElement("span");
    fill.className = "pi-name-bar-fill";
    bar.appendChild(fill);
    wrap.appendChild(input);
    wrap.appendChild(bar);
    parent.replaceChild(wrap, btn);
    input.focus();
    input.select();
    // 28-byte UTF-8 cap — mirrors the Add Product colour-name field.
    // Updates the usage bar on every keystroke.
    const syncBar = () => {
      const used = _adpByteLength(input.value);
      const pct  = Math.min(100, (used / ADP_COLOR_NAME_MAX_BYTES) * 100);
      fill.style.width = pct + "%";
      bar.classList.toggle("is-high", pct >= 80 && pct < 100);
      bar.classList.toggle("is-full", pct >= 100);
    };
    input.addEventListener("input", () => {
      const capped = _adpTruncateToBytes(input.value, ADP_COLOR_NAME_MAX_BYTES);
      if (capped !== input.value) input.value = capped;
      syncBar();
    });
    syncBar();
    let done = false;
    const rerender = () => { try { openDetail(r.spoolId); } catch (_) {} };
    const cancel = () => { if (done) return; done = true; rerender(); };
    const commit = async () => {
      if (done) return; done = true;
      const newVal = input.value.trim();
      if (newVal === raw.trim()) { rerender(); return; }
      try {
        const update = {
          message:   newVal,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        // The message lives on the chip (color_name 28-byte slot), so
        // editing it needs a re-burn — flag needUpdateAt exactly like the
        // TD / colour edits do (CHIP_FIELDS in edit-modals.js). Physical
        // chips only: Cloud has no chip yet and normalizeRow nulls the flag.
        if (!r.isCloud) update.needUpdateAt = Date.now();
        const invRef = fbDb(user.uid).collection("users").doc(user.uid).collection("inventory");
        const batch  = fbDb(user.uid).batch();
        batch.update(invRef.doc(r.spoolId), update);
        // Twin-aware: mirror onto the paired spool so both chips re-burn.
        if (r.twinUid) {
          const tr = state.rows.find(x =>
            x.spoolId !== r.spoolId &&
            (String(x.uid) === String(r.twinUid) || String(x.spoolId) === String(r.twinUid))
          );
          if (tr) batch.update(invRef.doc(tr.spoolId), { ...update });
        }
        await batch.commit();
        // Patch the in-memory row so the immediate re-render reflects the
        // change; the live snapshot will re-normalize it shortly after.
        if (r.raw) { r.raw.message = newVal; if (!r.isCloud) r.raw.needUpdateAt = update.needUpdateAt; }
        if (!r.raw?.color_name && !r.raw?.name) r.colorName = newVal || "-";
        if (!r.isCloud) r.needUpdateAt = update.needUpdateAt;
      } catch (e) { reportError("spool.editMessage", e); }
      rerender();
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", () => commit());
  }

  /* ── detail panel ── */
  // Two-level signature for the spool currently displayed in the side panel:
  //   - _lastDetailSig: every visible field. Skipped entirely when identical
  //     (no-op on unrelated snapshots).
  //   - _lastDetailStructuralSig: every visible field EXCEPT weight + lastUpdate
  //     (the parts of the panel that need a full rebuild to update — image,
  //     badges, color, container, etc.). When this stays identical but the
  //     total sig changes, only the weight slider / display / fill bar AND the
  //     "Updated" timestamp row are patched in place — the product `<img>` and
  //     every SVG icon survive untouched, so editing the weight from the side
  //     card no longer flashes the panel.
  let _lastDetailSig = "";
  let _lastDetailStructuralSig = "";
  // _patchDetailWeight uses `slider.matches(":active")` to detect whether the
  // user is mid-drag (instead of a manual flag). Reason: pointerup does NOT
  // fire reliably on `<input type="range">` on Chromium/Electron — clicking
  // the track, releasing outside the slider, or alt-tabbing mid-drag can all
  // swallow the event. A manually-tracked flag would get stuck at true and
  // silently break every future snapshot until close/reopen.

  // Fields that, when changed, require a full panel rebuild. Weight, lastUpdate
  // and similar high-frequency fields are deliberately excluded so a Firestore
  // weight edit takes the surgical patch path.
  function _detailStructuralSig(r) {
    return [
      r.spoolId,
      r.deleted ? 1 : 0,
      r.imgUrl || "",
      r.userImg || "",
      r.material || "",
      r.brand || "",
      r.aspect1 || "",
      r.aspect2 || "",
      r.td ?? "",
      r.needUpdateAt ? 1 : 0,
      r.hasTwinPair ? 1 : 0,
      r.twinUid || "",
      r.isPlus ? 1 : 0,
      r.isCloud ? 1 : 0,
      r.isRefill ? 1 : 0,
      r.isRecycled ? 1 : 0,
      r.isFilled ? 1 : 0,
      r.containerId || "",
      r.containerWeight ?? "",
      r.capacity ?? "",
      r.colorHex || "",
      r.colorHex2 || "",
      r.colorHex3 || "",
      (r.colorList || []).join(","),
      r.colorType || "",
      r.colorName || "",
      r.rackId || "",
      r.rackLevel ?? "",
      r.rackPos ?? "",
      r.message || "",
      r.sku || "",
      r.barcode || "",
      r.series || "",
      r.uid || "",
      r.diameter || "",
      r.tagType || "",
      r.productType || "",
    ].join("|");
  }

  // Surgical patch of the weight UI in the open panel. Touches only:
  //   - #weightSlider .value
  //   - #sliderDisplay first text node (the big number)
  //   - #wbFill .style.width (progress fill)
  //   - #wbInlineInput .value (skipped while the manual-edit form is open —
  //     otherwise a remote snapshot would silently overwrite the value the
  //     user is typing and confirm would submit the server value instead)
  //   - friend-view read-only `.wb-val` (no slider)
  //   - #detUpdatedVal text (the "Updated" row inside the Details section)
  // Never touches images, SVG icons, badges, or any other panel content.
  //
  // Server is authoritative — when a Firestore snapshot arrives we always apply
  // the patch, even if the user is mid-drag or has a pending debounced write.
  // Two "force release" side effects make this safe:
  //   - If `:active` (user pressing the slider), we toggle `disabled` for one
  //     tick to drop the browser's pointer tracking + `:active` state, so the
  //     user's continued pointermove can't immediately overwrite the patched
  //     value. They can re-grab the slider if they want to edit again.
  //   - If a debounced write is pending, we cancel it. The server's new value
  //     supersedes whatever the user was about to commit; keeping the pending
  //     write would silently overwrite the fresh server value 500 ms later.
  function _patchDetailWeight(r) {
    const cap   = Number(r.capacity) || 1000;
    const curW  = r.weightAvailable != null ? r.weightAvailable : 0;
    const pct   = Math.max(0, Math.min(100, Math.round(curW / cap * 100)));
    const pctW  = `${pct}%`;
    const wStr  = String(curW);

    const slider     = $("weightSlider");
    const wasActive  = slider && slider.matches(":active");
    const hadPending = _sliderDebounce !== null;

    // Cancel any pending debounced write — the snapshot we're applying is now
    // the source of truth, and we don't want our pending stale value to land
    // on Firestore and overwrite it.
    if (hadPending) {
      clearTimeout(_sliderDebounce);
      _sliderDebounce = null;
      const fillNode = $("wbFill");
      if (fillNode) fillNode.classList.remove("wb-saving");
    }

    if (slider && slider.value !== wStr) slider.value = wStr;

    // Force-release the user's pointer interaction so their next pointermove
    // doesn't snap slider.value back. Toggling `disabled` for one task tick
    // clears `:active` + pointer capture without a visible style flash (the
    // re-enable lands before the next paint). The user can re-grab to edit.
    if (wasActive && slider) {
      slider.disabled = true;
      setTimeout(() => { slider.disabled = false; }, 0);
    }

    const display = $("sliderDisplay");
    if (display) {
      const txt = display.firstChild;
      if (txt && txt.nodeType === Node.TEXT_NODE) {
        if (txt.nodeValue !== wStr) txt.nodeValue = wStr;
      } else {
        // Defensive: structure mismatch (shouldn't happen) → minimal rebuild
        display.innerHTML = `${wStr}<span>g</span>`;
      }
    }

    const fill = $("wbFill");
    if (fill && fill.style.width !== pctW) fill.style.width = pctW;

    // The manual-edit form (#wbInlineEdit) is shown when the user clicks the
    // pencil; while it's visible they are actively typing into #wbInlineInput.
    // Skip the patch in that window — otherwise an unrelated snapshot replaces
    // their typed value silently and confirm submits the wrong number.
    const inlineEditOpen = !$("wbInlineEdit")?.classList.contains("hidden");
    if (!inlineEditOpen) {
      const inlineInput = $("wbInlineInput");
      if (inlineInput && inlineInput.value !== wStr) inlineInput.value = wStr;
    }

    // Friend-view read-only display has no #sliderDisplay; the `.wb-val` div
    // carries the number directly without an id.
    if (!display) {
      const friendVal = document.querySelector("#detailPanel .wb-val");
      if (friendVal) {
        const txt = friendVal.firstChild;
        if (txt && txt.nodeType === Node.TEXT_NODE && txt.nodeValue !== wStr) {
          txt.nodeValue = wStr;
        }
      }
    }

    // "Updated" row inside the (collapsible) Details section. lastUpdate is in
    // _rowSignature but not in the structural sig, so a weight-edit echo would
    // otherwise leave this label frozen until the next structural change.
    const updatedVal = $("detUpdatedVal");
    if (updatedVal) {
      const newTs = fmtTs(r.lastUpdate);
      if (updatedVal.textContent !== newTs) updatedVal.textContent = newTs;
    }
  }

  // Visual confirmation after a successful weight write — pops a green check
  // next to #wbEditOpen and lets the CSS animation fade it out. Safe no-op
  // when the detail panel isn't open (element doesn't exist) or in friend
  // view (no edit affordance). Reflow-trick restarts the animation if the
  // user saves multiple times in a row.
  function _wbShowSavedCheck() {
    const el = document.getElementById("wbSavedCheck");
    if (!el) return;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  // Lay out the two non-modal side cards + their `»` close tabs. When BOTH are
  // open the printer keeps the right edge and the spool card is pushed to its
  // left (so a spool can later be dragged into a printer slot). Each card's tab
  // is pinned to its OWN left edge using final (not mid-transition) positions, so
  // the .25s slide stays in sync. Re-run on open/close, panel resize, window resize.
  function _syncPanels() {
    const dp = $("detailPanel"), pp = $("printerPanel"), cp = $("printerAddPanel");
    const dOpen = !!dp?.classList.contains("open");
    const pOpen = !!pp?.classList.contains("open");
    const cOpen = !!cp?.classList.contains("open");
    const printerW = (pOpen && pp) ? pp.offsetWidth : 0;
    const configW  = (cOpen && cp) ? cp.offsetWidth : 0;
    // Printer config (add/edit form) tucks to the LEFT of the printer panel when
    // both are open (edit-from-panel) — visible beside it, like the spool card,
    // instead of hidden behind. In the add flow (no printer panel) it opens at
    // the right edge (offset 0).
    const configRight = (cOpen && pOpen) ? printerW : 0;
    if (cp) cp.style.right = configRight ? `${configRight}px` : "";
    // Spool card sits left of whatever else is open on the right (printer + config).
    const matRight = dOpen ? (printerW + configW) : 0;
    if (dp) dp.style.right = matRight ? `${matRight}px` : "";
    _setTab($("detailCloseTab"),     dOpen, matRight + (dp ? dp.offsetWidth : 0));
    _setTab($("printerCloseTab"),    pOpen, printerW);
    _setTab($("printerAddCloseTab"), cOpen, configRight + configW);
  }
  // Show/position/hide a card's close tab so it slides WITH the panel — its `right`
  // has the same .25s transition as the panel's slide and travels the same distance
  // (the panel's width), so the two stay glued instead of the tab popping at its
  // final spot. Opening: start at the panel's closed left edge (right:0), reflow,
  // then slide to target. Closing: slide back to the edge, then hide once gone.
  function _setTab(tab, open, target) {
    if (!tab) return;
    if (open) {
      clearTimeout(tab._hideT);
      if (tab.hidden) { tab.style.right = "0px"; tab.hidden = false; void tab.offsetWidth; }
      tab.style.right = `${Math.round(target)}px`;
    } else if (!tab.hidden) {
      tab.style.right = "0px";
      clearTimeout(tab._hideT);
      tab._hideT = setTimeout(() => { tab.hidden = true; }, 280);
    }
  }

  function openDetail(spoolId) {
    state.selected = spoolId;
    document.querySelectorAll("[data-id]").forEach(el => el.classList.toggle("selected", el.dataset.id === spoolId));
    const r = state.rows.find(x => x.spoolId === spoolId);
    if (!r) return;
    _lastDetailSig = _rowSignature(r);
    _lastDetailStructuralSig = _detailStructuralSig(r);
    $("panelBody").innerHTML = buildPanelHTML(r);
    // Hold-to-confirm "Delete spool" — 1.5s hold, irreversible hard delete.
    // Removes the Firestore doc (+ twin) permanently — ISO with printer deletion.
    // Flutter's cloudSync guard prevents resurrection on the phone.
    setupHoldToConfirm($("btnSpoolDelete"), 1500, async () => {
      try {
        await markSpoolDeleted(r.spoolId);
        closeDetail();
      } catch (e) { reportError("spool.delete", e); }
    });

    // Inline message edit — click the identity name to rename the spool
    // (writes the `message` chip field). Gated to editable (non-Plus /
    // Cloud) spools by the render.
    $("piNameEdit")?.addEventListener("click", () => startMessageInlineEdit(r));

    // Duplicate — hold 1s. Clones the spool into N new TigerCloud entries
    // (fresh Cloud UID each, no twin link, no rack placement, staggered
    // timestamps). The ± stepper picks N; the main label tracks it
    // ("Duplicate ×N"). A basic TigerTag becomes Cloud since a digital
    // clone carries no physical chip.
    let _dupCount = 1;
    const _dupSyncUI = () => {
      const valEl = $("dupCount");
      if (valEl) valEl.textContent = String(_dupCount);
      const lblEl = $("btnToolDuplicate")?.querySelector(".toolbox-row-label");
      if (lblEl) lblEl.textContent = _dupCount > 1 ? `${t("toolDuplicate")} ×${_dupCount}` : t("toolDuplicate");
    };
    $("btnDupDec")?.addEventListener("click", e => {
      e.stopPropagation();
      _dupCount = Math.max(1, _dupCount - 1);
      _dupSyncUI();
    });
    $("btnDupInc")?.addEventListener("click", e => {
      e.stopPropagation();
      _dupCount = Math.min(50, _dupCount + 1);
      _dupSyncUI();
    });
    setupHoldToConfirm($("btnToolDuplicate"), 1000, async () => {
      try {
        const made = await duplicateSpoolAsCloud(r, _dupCount);
        if (made) {
          // In-place confirmation: flash the result in the button label
          // (the global toast() needs a container element — there's none
          // in the detail panel — so we surface feedback right here). The
          // new copies appear in the inventory list via the live snapshot.
          const lblEl = $("btnToolDuplicate")?.querySelector(".toolbox-row-label");
          if (lblEl) {
            lblEl.textContent = t("toolDuplicateOk", { n: made });
            setTimeout(() => { _dupSyncUI(); }, 1600);
          }
        }
      } catch (e) { reportError("spool.duplicate", e); }
    });

    // Manual twin-pair repair button — opens the picker pre-filtered to
    // candidates compatible with this spool. Only present when the spool
    // is not already part of a twin pair (the panel render gates this).
    $("btnTwinLink")?.addEventListener("click", () => openTwinLinkPicker(r));

    // Debug-only "Unlink" — undoes a twin pairing. Same 1.5s hold-to-
    // confirm pattern used elsewhere for non-trivial actions.
    setupHoldToConfirm($("btnTwinUnlink"), 1500, async () => {
      try {
        await unlinkTwinPair(r);
      } catch (e) { reportError("spool.twinUnlink", e); }
    });

    // ── Toolbox actions ─────────────────────────────────────────────
    // TD1S — measure colour. If the device isn't connected we open
    // the connect modal first; once it's connected the colour-edit
    // modal is the natural next step.
    $("btnToolMeasureColor")?.addEventListener("click", () => {
      if (!state.td1sConnected) { openTd1sConnectModal(); return; }
      openColorEditModal(r);
    });
    // TD1S — measure TD. Same pattern as the colour tool.
    $("btnToolMeasureTd")?.addEventListener("click", () => {
      if (!state.td1sConnected) { openTd1sConnectModal(); return; }
      openTdEditModal(r);
    });
    // Clear TD value — hold-to-confirm trash button on the Scan TD row.
    // Deletes the `TD` field from Firestore and lets the snapshot listener
    // re-render the panel (the badge + tc-value row update automatically).
    setupHoldToConfirm($("btnToolClearTd"), 1200, async () => {
      try {
        const user = fbAuth().currentUser;
        if (!user) return;
        await fbDb(user.uid)
          .collection("users").doc(user.uid)
          .collection("inventory").doc(r.spoolId)
          .update({ TD: firebase.firestore.FieldValue.delete(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      } catch (e) { reportError("spool.clearTd", e); }
    });
    // Remove from rack — hold-to-confirm so an accidental tap doesn't
    // unrank a placed spool. Reuses the eject animation that void-drop
    // fires so the visual language stays consistent.
    setupHoldToConfirm($("btnToolRemoveFromRack"), 1500, async () => {
      try {
        // Snapshot the row before async — state.rows might rebuild
        // between the await and the animation trigger.
        const snapshot = { ...r };
        // Fire the eject animation FIRST (covers the gap until the
        // Firestore listener rebuilds the rack view), then unassign.
        playUnrankAnimation(snapshot).catch(() => {});
        await unassignSpool(r.spoolId);
        closeDetail();
      } catch (e) { reportError("spool.removeFromRack", e); }
    });
    // Locate-in-storage: clicking the placed-state storage-loc row jumps
    // to the Storage view with the search prefilled to the spool's RFID
    // UID, so all other slots are dimmed and the user sees this one in
    // its rack at a glance.
    $("btnLocateSpool")?.addEventListener("click", () => {
      const uid = $("btnLocateSpool")?.dataset.spoolUid || "";
      // Close the detail panel + reset selection so a re-click opens it
      closeDetail();
      // Apply the search to the global state + UI
      const searchInput = $("searchInv");
      if (searchInput) searchInput.value = uid;
      state.search = uid;
      // Switch view (forces a fresh rack render that calls applyRackSearchDim)
      setViewMode("rack");
    });
    // Auto-assign: place the spool in the first available unlocked slot.
    // Triggered from the storage-loc empty-state row when no rack assignment.
    $("btnStorageAutoAssign")?.addEventListener("click", async () => {
      const btn = $("btnStorageAutoAssign");
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      try {
        const result = await autoAssignSingleSpool(r.spoolId);
        if (!result) {
          // Out of slots — surface a small inline error in the row
          const row = btn.closest(".storage-loc-row");
          if (row) {
            const lbl = row.querySelector(".storage-loc-rack");
            if (lbl) {
              const orig = lbl.textContent;
              lbl.textContent = t("storageAutoAssignFull") || "All racks are full.";
              lbl.classList.add("storage-loc-rack--err");
              setTimeout(() => {
                lbl.textContent = orig;
                lbl.classList.remove("storage-loc-rack--err");
              }, 2500);
            }
          }
        }
        // Snapshot listener will re-render the panel with the new location.
      } catch (e) {
        reportError("spool.autoAssign", e);
      } finally {
        setTimeout(() => { if (btn) btn.disabled = false; }, 800);
      }
    });
    // Encode Cloud → chip: migrate Cloud doc to physical chip(s)
    $("btnEncodeCloud")?.addEventListener("click", () => openEncodeModal(r));

    // Burn RFID — write cloud doc to all connected readers, one by one
    $("btnBurnRfid")?.addEventListener("click", () => _burnRfid(r));

    // Refresh API — fetch fresh catalogue data for TigerTag+ spools
    $("btnRefreshApi")?.addEventListener("click", () => _refreshApiData(r));

    // Upgrade to TigerTag+ — banner opens inline form
    $("upgradePlusBanner")?.addEventListener("click", () => {
      const form = $("upgradePlusForm");
      if (form) { form.classList.toggle("open"); $("upgradePlusInput")?.focus(); }
    });
    $("upgradePlusCheck")?.addEventListener("click", () => _lookupPlusProduct(r));
    $("upgradePlusInput")?.addEventListener("keydown", e => { if (e.key === "Enter") _lookupPlusProduct(r); });
    $("upgradePlusConfirm")?.addEventListener("click", () => _convertToPlus(r));
    $("upgradePlusListBtn")?.addEventListener("click", () =>
      window.electronAPI?.openExternal("https://tigertag.io/pages/public-material-list?page=1"));
    $("upgradePlusHelpBtn")?.addEventListener("click", () =>
      $("productIdHelpOverlay")?.classList.add("open"));

    // collapsible "Details" section — toggle + persist preference
    const btnToggleDetails = $("btnToggleDetails");
    if (btnToggleDetails) {
      btnToggleDetails.addEventListener("click", () => {
        const section = btnToggleDetails.closest(".panel-details");
        const open = section.classList.toggle("open");
        localStorage.setItem("tigertag.detailsExpanded", open ? "1" : "0");
      });
    }
    // Custom image URL — inline edit for DIY / Cloud spools.
    // The Edit button lives in the colour square (no image) or in the
    // toolbox (btnToolEditImg, valid user image already set). Both open
    // the same #customImgForm bar (inside panel-img-wrap).
    const openCustomImgForm = () => {
      const form = $("customImgForm");
      if (!form) return;
      form.classList.add("open");
      $("customImgInput")?.focus();
    };
    const closeCustomImgForm = () => $("customImgForm")?.classList.remove("open");
    $("btnCustomImgEdit")?.addEventListener("click", e => {
      const form = $("customImgForm");
      if (form?.classList.contains("open")) { closeCustomImgForm(); e.stopPropagation(); }
      else openCustomImgForm();
    });
    $("btnToolEditImg")?.addEventListener("click", openCustomImgForm);
    $("customImgInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") $("btnCustomImgSave")?.click();
      if (e.key === "Escape") closeCustomImgForm();
    });
    $("btnCustomImgSave")?.addEventListener("click", async () => {
      const val = ($("customImgInput")?.value || "").trim();
      try {
        const user = fbAuth().currentUser;
        if (!user) return;
        const del = firebase.firestore.FieldValue.delete();
        const ts = firebase.firestore.FieldValue.serverTimestamp();
        const update = val
          ? { url_img: val, url_img_user: true, updatedAt: ts }
          : { url_img: del, url_img_user: del, updatedAt: ts };
        await fbDb(user.uid)
          .collection("users").doc(user.uid)
          .collection("inventory").doc(r.spoolId)
          .update(update);
        // onSnapshot re-renders the panel automatically
      } catch (e) { reportError("spool.customImgUrl", e); }
    });
    // copy raw JSON button
    const btnCopyRaw = $("btnCopyRaw");
    if (btnCopyRaw) {
      btnCopyRaw.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        const pre = $("rawJsonPre");
        const text = pre.textContent;
        navigator.clipboard.writeText(text).then(() => {
          btnCopyRaw.classList.add("copied");
          setTimeout(() => btnCopyRaw.classList.remove("copied"), 1800);
        });
      });
    }
    // twin raw JSON tab switching
    $("panelBody").querySelectorAll("[data-raw-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        $("panelBody").querySelectorAll("[data-raw-tab]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const pre = $("rawJsonPre");
        const raw = decodeURIComponent(btn.dataset.rawTab === "a" ? pre.dataset.rawA : pre.dataset.rawB);
        pre.innerHTML = highlight(raw);
      });
    });
    // video button — YouTube thumbnail opens in browser
    const panelVideoBtn = $("panelVideoBtn");
    if (panelVideoBtn) {
      panelVideoBtn.addEventListener("click", () => {
        window.open(panelVideoBtn.dataset.url);
      });
    }

    // Non-modal side card: don't dim/block the list behind it — clicking another
    // spool re-runs openDetail() and switches in place (highlight follows
    // `state.selected`). Close via the ✕ / Escape. (Overlay kept for the modal
    // panels — settings, pickers — but not opened for the detail card.)
    $("detailPanel").classList.add("open");
    _syncPanels();
    // slider ↔ display ↔ inline edit
    const slider  = $("weightSlider");
    const fill    = $("wbFill");
    const display = $("sliderDisplay");
    const cap     = Number(slider.max);

    function syncFromValue(val) {
      const w = Math.max(0, Math.min(val, cap));
      slider.value = w;
      fill.style.width = cap ? Math.round(w / cap * 100) + "%" : "0%";
      display.innerHTML = `${w}<span>g</span>`;
      // Keep inline input in sync if open
      const inp = $("wbInlineInput");
      if (inp && !$("wbInlineEdit").classList.contains("hidden")) inp.value = w;
    }

    // Cancel any pending auto-save from a previous panel open
    clearTimeout(_sliderDebounce); _sliderDebounce = null;

    function cancelSliderDebounce() {
      clearTimeout(_sliderDebounce); _sliderDebounce = null;
      fill.classList.remove("wb-saving");
    }

    // Inline weight editor: two modes.
    //   - "net":   user types the net filament weight (what we write to Firestore).
    //   - "gross": user types the scale reading (filament + container). Studio
    //              subtracts r.containerWeight and writes the result. Uses the
    //              existing doWeightUpdate(r, "raw", val) path which already
    //              does `weightAvailable = rawW - containerWeight` for us.
    // Mode persists in localStorage so kitchen-scale users don't have to switch
    // every time.
    const WB_MODE_KEY = "tigertag.wbInputMode";
    const _wbCw = Number(r.containerWeight) || 0;

    function _wbGetMode() {
      const m = localStorage.getItem(WB_MODE_KEY);
      return m === "gross" ? "gross" : "net";
    }
    function _wbApplyMode(mode) {
      const isGross = mode === "gross";
      // Toggle button highlight
      $("wbModeNet")  ?.classList.toggle("active", !isGross);
      $("wbModeGross")?.classList.toggle("active",  isGross);
      // Input bounds — gross can go up to capacity + container, net stops at cap.
      const inp = $("wbInlineInput");
      if (inp) {
        inp.max = String(isGross ? cap + _wbCw : cap);
        inp.min = "0";
      }
      _wbUpdateHint();
    }
    // Live tooltip on the Balance pill — always shows the conversion math, in
    // both modes, so the user can verify what will be written to Firestore at
    // any time:
    //   - No container set → "No container — net = balance"
    //   - Net mode    (input is net)     → net stays the input value
    //   - Balance mode (input is gross)  → net = max(0, input − cw)
    // Browser shows it on hover after ~500 ms. Recomputed on every input event
    // and on every mode switch.
    function _wbUpdateHint() {
      const btn = $("wbModeGross"); if (!btn) return;
      if (_wbCw <= 0) { btn.title = t("wbModeHintNoContainer"); return; }
      const inp = $("wbInlineInput");
      const raw = Number(inp?.value) || 0;
      const isGross = btn.classList.contains("active");
      const net = isGross ? Math.max(0, raw - _wbCw) : raw;
      btn.title = t("wbModeHintGross", { net, cw: _wbCw });
    }
    function _wbSeedInputForMode(mode) {
      // Seed the input with the relevant current value so the user starts from
      // a meaningful baseline (current net for net mode, current scale reading
      // for gross mode = net + container).
      const inp = $("wbInlineInput"); if (!inp) return;
      const curNet = Number(slider.value) || 0;
      inp.value = mode === "gross" ? String(curNet + _wbCw) : String(curNet);
    }

    function openInlineEdit() {
      cancelSliderDebounce();
      // Wipe any stale toast (e.g. a previous "out of range" error from before
      // the input-clamping landed) so the slate is clean on every open.
      const res = $("panelWeightResult"); if (res) res.innerHTML = "";
      $("sliderDisplay").classList.add("hidden");
      $("wbEditOpen").classList.add("hidden");
      $("wbInlineEdit").classList.remove("hidden");
      const mode = _wbGetMode();
      _wbApplyMode(mode);
      _wbSeedInputForMode(mode);
      _wbUpdateHint();
      $("wbInlineInput").focus();
      $("wbInlineInput").select();
    }
    function closeInlineEdit() {
      $("sliderDisplay").classList.remove("hidden");
      $("wbEditOpen").classList.remove("hidden");
      $("wbInlineEdit").classList.add("hidden");
    }
    function confirmInlineEdit() {
      const mode = _wbGetMode();
      // Belt-and-suspenders clamp at confirm time. Net mode caps at capacity;
      // Balance mode caps at capacity + container (so the *computed* net still
      // sits within [0, cap]). The input-event listener already caps as the
      // user types — this catch-all handles paste, programmatic sets, etc.
      const maxAllowed = mode === "gross" ? cap + _wbCw : cap;
      const valRaw = Number($("wbInlineInput").value) || 0;
      const val    = Math.max(0, Math.min(maxAllowed, valRaw));
      closeInlineEdit();
      const netPreview = mode === "gross" ? Math.max(0, val - _wbCw) : val;
      syncFromValue(netPreview);
      doWeightUpdate(r, mode === "gross" ? "raw" : "direct", val);
    }

    // Mode pill toggle — persist choice + reseed input so the displayed number
    // matches the new mode (user just clicked "Balance" → show gross weight,
    // not the net value left over from net mode).
    $("wbModeNet")?.addEventListener("click", () => {
      const inp = $("wbInlineInput");
      const prev = _wbGetMode();
      if (prev === "net") return;
      // Convert the typed value: user was in gross, switching to net → subtract cw.
      const raw = Number(inp?.value) || 0;
      if (inp) inp.value = String(Math.max(0, raw - _wbCw));
      localStorage.setItem(WB_MODE_KEY, "net");
      _wbApplyMode("net");
      inp?.focus(); inp?.select();
    });
    $("wbModeGross")?.addEventListener("click", () => {
      const inp = $("wbInlineInput");
      const prev = _wbGetMode();
      if (prev === "gross") return;
      // Convert: user was in net, switching to gross → add cw so the displayed
      // scale reading matches what their balance would show.
      const net = Number(inp?.value) || 0;
      if (inp) inp.value = String(net + _wbCw);
      localStorage.setItem(WB_MODE_KEY, "gross");
      _wbApplyMode("gross");
      inp?.focus(); inp?.select();
    });

    // `input` fires CONTINUOUSLY during drag — keep the local UI in sync, but
    // DO NOT send anything to Firestore yet (the user might still be moving the
    // thumb). Cancel any pending write from a prior interaction in case they
    // re-grabbed the slider during the 500 ms post-release window.
    slider.addEventListener("input", () => {
      syncFromValue(Number(slider.value));
      fill.classList.add("wb-saving");
      clearTimeout(_sliderDebounce); _sliderDebounce = null;
    });

    // `change` fires ONCE when the user releases the slider thumb (or, for a
    // single track click, immediately after the value commits). That's when we
    // schedule the Firestore write — 500 ms later, so the user can re-grab the
    // slider to cancel/refine without burning a request. Capture the value at
    // change time so a snapshot landing during the 500 ms window can't morph
    // what we end up writing.
    slider.addEventListener("change", () => {
      clearTimeout(_sliderDebounce);
      const valueToWrite = slider.value;
      _sliderDebounce = setTimeout(() => {
        fill.classList.remove("wb-saving");
        _sliderDebounce = null;
        doWeightUpdate(r, "direct", valueToWrite);
      }, 500);
    });

    // No manual drag-state tracking: _patchDetailWeight uses `:active` to
    // detect whether the user is pressing the slider — the browser's source
    // of truth, can't desync. If a snapshot arrives mid-drag, the patch
    // forces release via a one-tick `disabled` toggle.

    $("wbEditOpen").addEventListener("click", openInlineEdit);
    $("wbInlineConfirm").addEventListener("click", confirmInlineEdit);
    $("wbInlineCancel").addEventListener("click", closeInlineEdit);
    $("wbInlineInput").addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); confirmInlineEdit(); }
      if (e.key === "Escape") closeInlineEdit();
    });
    // Live hint refresh + typing clamp. Capping at `max` (Net = capacity,
    // Balance = capacity + container) means the user can never type a value
    // that doWeightUpdate would reject as out-of-range. They get instant
    // visual feedback (cursor sticks at the spool's capacity) instead of an
    // error toast that has no auto-dismiss.
    $("wbInlineInput").addEventListener("input", () => {
      const inp = $("wbInlineInput");
      const max = Number(inp.max);
      const val = Number(inp.value);
      if (max && val > max) inp.value = String(max);
      _wbUpdateHint();
    });

    if ($("btnChangeContainerCard")) {
      $("btnChangeContainerCard").addEventListener("click", () => openContainerPicker(r));
      // JS hover — shows both edit-container and edit-weight buttons on hover
      const ccSec = document.querySelector(".cc-section");
      const ccBtn = $("btnChangeContainerCard");
      if (ccSec && ccBtn) {
        ccSec.addEventListener("mouseenter", () => {
          ccBtn.classList.add("cc-visible");
          if ($("btnEditCw")) $("btnEditCw").classList.add("cc-visible");
        });
        ccSec.addEventListener("mouseleave", () => {
          ccBtn.classList.remove("cc-visible");
          if ($("btnEditCw")) $("btnEditCw").classList.remove("cc-visible");
        });
      }
    }

    // Inline container weight edit
    if ($("btnEditCw")) {
      const openCwEdit = () => {
        $("ccCwVal").style.display = "none";
        $("btnEditCw").style.display = "none";
        $("ccCwEditRow").style.display = "flex";
        $("ccCwInput").focus();
        $("ccCwInput").select();
      };
      const closeCwEdit = () => {
        $("ccCwVal").style.display = "";
        $("btnEditCw").style.display = "";
        $("ccCwEditRow").style.display = "none";
      };
      const confirmCwEdit = async () => {
        const val = parseInt($("ccCwInput").value, 10);
        if (isNaN(val) || val < 0) return;
        const uid = state.activeAccountId; if (!uid) return;
        const okBtn = $("ccCwOk"); if (okBtn) okBtn.disabled = true;
        try {
          await fbDb().collection("users").doc(uid).collection("inventory").doc(r.spoolId).update({
            container_weight: val,
            updatedAt:        firebase.firestore.FieldValue.serverTimestamp()
          });
          // onSnapshot propagates change and re-renders the panel automatically
        } catch (e) {
          console.error("[CW edit] update error:", e);
          if (okBtn) okBtn.disabled = false;
        }
      };
      $("btnEditCw").addEventListener("click", openCwEdit);
      $("ccCwOk").addEventListener("click", confirmCwEdit);
      $("ccCwCancel").addEventListener("click", closeCwEdit);
      $("ccCwInput").addEventListener("keydown", e => {
        if (e.key === "Enter")  { e.preventDefault(); confirmCwEdit(); }
        if (e.key === "Escape") closeCwEdit();
      });
    }

    // TD edit chip
    if ($("btnEditTd")) {
      $("btnEditTd").addEventListener("click", () => openTdEditModal(r));
    }
    // Color circle → open color edit modal
    if ($("btnEditColor")) {
      $("btnEditColor").addEventListener("click", () => openColorEditModal(r));
    }
    // Chip update banner — whole banner is clickable
    // If no reader is connected, redirect to TigerPOD discovery instead of trying to burn
    $("chipUpdateBanner")?.addEventListener("click", () => {
      if (state.nfcReaders.size === 0) {
        openTigerPodModal();
      } else {
        _burnRfid(r);
      }
    });
    // Cloud encode banner — open the guided encode modal when a reader is
    // connected (it handles the presence gate itself); otherwise guide to POD.
    $("cloudEncodeBanner")?.addEventListener("click", () => {
      if (state.nfcReaderCount > 0) openEncodeModal(r);
      else openTigerPodModal();
    });
  }
  function closeDetail() {
    // Cancel any pending auto-save (don't fire on close)
    clearTimeout(_sliderDebounce); _sliderDebounce = null;
    // Stop any playing video
    const vp = $("panelVideoPlayer"); if (vp) vp.innerHTML = "";
    $("detailPanel").classList.remove("open"); $("panelOverlay").classList.remove("open");
    _syncPanels(); // reset offset + hide the spool card's close tab
    _lastDetailSig = "";
    _lastDetailStructuralSig = "";
  }

  // Re-evaluate the open detail panel after a Firestore snapshot. Three paths:
  //   1. Nothing visible changed → return (most common: unrelated spool was
  //      edited elsewhere, or pending-write echo with no diff).
  //   2. Only weight and/or lastUpdate changed → surgical `_patchDetailWeight`
  //      updates the slider / display / fill bar AND the "Updated" row in the
  //      Details section. The product image and SVG icons survive untouched,
  //      so editing the weight from the side card no longer flashes the panel.
  //      Server is authoritative: if the user is mid-drag, the patch toggles
  //      `disabled` for one tick to force-release the slider, and if a local
  //      debounced write is pending it gets cancelled. The user can re-grab
  //      to edit again. Skips the inline-edit input only while the manual
  //      editor is open — so a typed value isn't silently overwritten.
  //   3. Structural change (color, container, twin paired, etc.) → full
  //      `openDetail` rebuild — rare.
  // Replaces the unconditional `openDetail(state.selected)` that fired on
  // every snapshot and rebuilt the whole panel.
  function refreshOpenDetail() {
    if (!state.selected) return;
    if (!$("detailPanel")?.classList.contains("open")) return;
    const r = state.rows.find(x => x.spoolId === state.selected);
    if (!r) {
      // Spool removed (hard delete) — close the panel instead of rebuilding.
      closeDetail();
      return;
    }
    const newSig = _rowSignature(r);
    if (newSig === _lastDetailSig) return; // path 1: visible content unchanged

    const newStructSig = _detailStructuralSig(r);
    if (newStructSig === _lastDetailStructuralSig) {
      // path 2: weight-only diff → patch in place, no flash
      _patchDetailWeight(r);
      _lastDetailSig = newSig;
      return;
    }
    // path 3: structural change → full rebuild
    openDetail(state.selected);
  }

  /* ── TD1S module init ────────────────────────────────────────────────────
     initEditModals must be called first so the sensor engine hooks are ready.
     openTd1sConnectModal / openTd1sTesterModal / openTdEditModal /
     openColorEditModal are all imported from their respective modules and
     called from the toolbox + ADP header button below.                    */
  initEditModals({ state, t, $, fbDb });

  // ── Usage telemetry — fire-and-forget, one write per session per milestone ──
  let _telTd1s    = false;  // have we already recorded TD1s usage this session?
  let _telRfidMax = 0;      // highest RFID reader count recorded this session

  function _recordUsage(fields) {
    const uid = state.activeAccountId;
    if (!uid) return;
    // Write into the dedicated telemetry sub-document, never into the user profile.
    fbDb(uid).collection("users").doc(uid)
      .collection("telemetry").doc("studio")
      .set(fields, { merge: true })
      .catch(() => {});
  }

  // Track TD1s first-ever use
  if (window.td1s) {
    window.td1s.onStatus(msg => {
      if (_telTd1s) return;
      if (msg !== "Status: Sensor connected") return;
      _telTd1s = true;
      _recordUsage({ td1sUsed: true });
    });
  }

  initTD1S({
    state,
    t,
    $,
    makePanelResizable,
    // Only the ADP panel sync remains here — edit modals are wired in edit-modals.js
    onAdpData(data) {
      const hex = (data.HEX || "").replace("#", "").toUpperCase();
      if ($("addProductPanel")?.classList.contains("open")) {
        if (/^[0-9A-Fa-f]{6}$/.test(hex)) _adpSyncColor("#" + hex);
        if (data.TD != null) {
          const tdInp = $("adpTd");
          if (tdInp) {
            tdInp.value = data.TD;
            tdInp.dataset.userEdited = "1";
            _adpUpdateBasicReadouts();
            _adpRefreshRfidPreview();
          }
        }
      }
    },
  });

  /* ── twin-link picker ──────────────────────────────────────────────────
     Manual repair flow for twin spool pairs the auto-linker missed.
     Opens with a list of candidates returned by findTwinCandidates(),
     each rendered as a clickable card. A click triggers linkTwinPair
     directly — no confirmation step (the action is reversible via
     debug Unlink, and the candidate list is already strict). */
  let _twinLinkSrc = null;
  function openTwinLinkPicker(srcRow) {
    if (!srcRow) return;
    _twinLinkSrc = srcRow;
    const sub  = $("twinLinkPickerSub");
    const list = $("twinLinkPickerList");
    const empty = $("twinLinkPickerEmpty");
    if (sub) sub.textContent = t("twinLinkPickerSub")
                            || "Pick the matching half of this spool.";
    const cands = findTwinCandidates(srcRow);
    if (list) list.innerHTML = "";
    if (empty) empty.hidden = cands.length > 0;
    if (cands.length && list) {
      for (const c of cands) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "twin-link-card";
        // Use the same colour rendering helper the inventory list does
        // so the candidate visually reads as the same product as the
        // source — same colour swatch + brand + material text.
        const swatch = `<span class="twin-link-card-swatch" style="background:${colorBg(c)}"></span>`;
        const subText = [c.colorName, c.material].filter(s => s && s !== "-").join(" · ");
        node.innerHTML = `
          ${swatch}
          <span class="twin-link-card-main">
            <span class="twin-link-card-title">${esc(c.brand || "—")}</span>
            <span class="twin-link-card-sub">${esc(subText || c.uid)}</span>
            <span class="twin-link-card-uid">${esc(c.uid)}</span>
          </span>
          <span class="icon icon-chevron-r icon-13 twin-link-card-chev"></span>
        `;
        node.addEventListener("click", async () => {
          if (node.classList.contains("is-loading")) return;
          node.classList.add("is-loading");
          try {
            await linkTwinPair(srcRow, c);
            closeTwinLinkPicker();
          } catch (e) {
            reportError("spool.twinLink", e);
            node.classList.remove("is-loading");
          }
        });
        list.appendChild(node);
      }
    }
    $("twinLinkPickerOverlay").classList.add("open");
  }
  function closeTwinLinkPicker() {
    $("twinLinkPickerOverlay")?.classList.remove("open");
    _twinLinkSrc = null;
  }
  $("twinLinkPickerClose")?.addEventListener("click", closeTwinLinkPicker);
  $("twinLinkPickerOverlay")?.addEventListener("click", e => {
    if (e.target.id === "twinLinkPickerOverlay") closeTwinLinkPicker();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && $("twinLinkPickerOverlay")?.classList.contains("open")) {
      closeTwinLinkPicker();
    }
  });

  /* ── TigerPOD discovery modal ── */
  const TIGERPOD_MAKERWORLD_URL = "https://makerworld.com/fr/models/1289152-tigertag-io-open-spool-pod-for-rfid-filament";

  function openTigerPodModal() {
    $("tigerPodModalOverlay").classList.add("open");
    const v = $("tigerPodVideo"); if (v) { v.currentTime = 0; v.play().catch(() => {}); }
  }
  function closeTigerPodModal() {
    $("tigerPodModalOverlay").classList.remove("open");
    const v = $("tigerPodVideo"); if (v) v.pause();
  }

  /* ── container picker ── */
  let _cpRow = null; // spool row currently being edited in the picker

  function openContainerPicker(r) {
    _cpRow = r;
    _renderCpList("");
    $("containerPickerSearch").value = "";
    $("containerPickerOverlay").classList.add("open");
    setTimeout(() => $("containerPickerSearch").focus(), 120);
  }
  function closeContainerPicker() {
    $("containerPickerOverlay").classList.remove("open");
    _cpRow = null;
  }
  function _renderCpList(query) {
    const q = query.trim().toLowerCase();
    const containers = (state.db.containers || []).filter(c =>
      !q ||
      c.brand.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.type.toLowerCase().includes(q) ||
      String(c.container_weight).includes(q)
    );
    // Group by brand
    const byBrand = {};
    containers.forEach(c => { (byBrand[c.brand] = byBrand[c.brand] || []).push(c); });
    const currentId = _cpRow?.containerId;
    const html = Object.entries(byBrand).map(([brand, items]) => `
      <div class="cp-group-label">${esc(brand)}</div>
      ${items.map(c => `
        <button class="cp-item${c.id === currentId ? " active" : ""}" data-cid="${esc(c.id)}">
          <img src="${esc(c.img)}" alt="${esc(c.label)}" onerror="this.style.display='none'" />
          <div class="cp-item-info">
            <div class="cp-item-name">${esc(c.label)}</div>
            <div class="cp-item-meta">${esc(c.type)}</div>
          </div>
          <span class="cp-item-cw">${c.container_weight} g</span>
          ${c.id === currentId ? '<span class="cp-check">✓</span>' : ""}
        </button>
      `).join("")}
    `).join("");
    $("containerPickerList").innerHTML = html || `<div class="cp-empty">—</div>`;
  }
  async function doContainerUpdate(r, newContainerId) {
    const uid = state.activeAccountId; if (!uid) return;
    const c = containerFind(newContainerId); if (!c) return;
    try {
      await fbDb().collection("users").doc(uid).collection("inventory").doc(r.spoolId).update({
        container_id:     newContainerId,
        container_weight: c.container_weight,
        updatedAt:        firebase.firestore.FieldValue.serverTimestamp()
      });
      closeContainerPicker();
      // onSnapshot propagates change; detail panel refreshes automatically
    } catch (e) {
      console.error("[Container] update error:", e);
    }
  }

  function parseVideoUrl(url) {
    if (!url) return null;
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
    if (yt) return { type: "youtube", id: yt[1] };
    if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return { type: "direct", src: url };
    return { type: "external", src: url };
  }
  $("panelOverlay").addEventListener("click", closeDetail);
  $("detailCloseTab")?.addEventListener("click", closeDetail); // » close tab (non-modal card)
  document.addEventListener("keydown", e => { if (e.key==="Escape") { closeDetail(); closeContainerPicker(); } });

  // Timelapse: 1051 response dispatches this event → show native save dialog directly.
  document.addEventListener("elg:timelapse-ready", e => {
    const { url } = e.detail || {};
    if (!url) return;
    window.electronAPI?.openExternal(url);
  });

  // TigerPOD modal events
  $("tigerPodClose").addEventListener("click", closeTigerPodModal);
  $("tigerPodModalOverlay").addEventListener("click", e => { if (e.target === $("tigerPodModalOverlay")) closeTigerPodModal(); });
  $("tigerPodMakerWorldBtn").addEventListener("click", () => window.electronAPI?.openExternal(TIGERPOD_MAKERWORLD_URL));

  // Cloud → chip encode modal events (wired once)
  $("cemClose")?.addEventListener("click", closeEncodeModal);
  $("cemBurn")?.addEventListener("click", _cemStartBurn);
  $("cemOwToggle")?.addEventListener("change", _cemRender);
  // Close on backdrop click (= abort). Allowed at any time, including mid-burn:
  // closeEncodeModal sets _cemAborted so the sequence stops and nothing migrates.
  $("cloudEncodeOverlay")?.addEventListener("click", e => {
    if (e.target === $("cloudEncodeOverlay")) closeEncodeModal();
  });

  // container picker events
  $("containerPickerClose").addEventListener("click", closeContainerPicker);
  $("containerPickerOverlay").addEventListener("click", e => { if (e.target === $("containerPickerOverlay")) closeContainerPicker(); });
  $("containerPickerSearch").addEventListener("input", e => _renderCpList(e.target.value));
  $("containerPickerList").addEventListener("click", e => {
    const btn = e.target.closest(".cp-item[data-cid]");
    if (btn && _cpRow) doContainerUpdate(_cpRow, btn.dataset.cid);
  });

  function buildPanelHTML(r) {
    const mat = r.materialData;

    // image + badge overlay
    const badgeLeft = tierBadgeHTML(r, "panel-img-badge panel-img-badge--tl");
    const badgeTwin = r.hasTwinPair
      ? `<span class="tag-twin panel-img-badge-tr-item panel-img-icon-badge" title="${t("twinBadge")} — ${t("twinTitle")}"><span class="icon icon-link icon-11"></span></span>`
      : "";
    const badgeChip = r.needUpdateAt
      ? `<span class="chip-badge panel-img-badge-tr-item panel-img-icon-badge" title="${t("chipPendingHint")}"><span class="icon icon-refresh icon-11"></span></span>`
      : "";
    const badgeTd = r.td != null
      ? `<span class="panel-img-badge panel-img-badge--bl panel-td-badge">TD ${r.td}</span>`
      : "";
    const badgeTrGroup = (badgeTwin || badgeChip)
      ? `<div class="panel-img-badge panel-img-badge--tr panel-img-badge-tr-group">${badgeTwin}${badgeChip}</div>`
      : "";
    const overlays = badgeLeft + badgeTrGroup + badgeTd;
    // The edit bar lives inside panel-img-wrap at the bottom.
    // The trigger (Edit icon) IS the left anchor of the bar — clicking it
    // expands the bar rightward to reveal the input + confirm button.
    // Only for DIY/Cloud, not for friend view.
    const canEditImg = (!r.isPlus || r.userImg) && !state.friendView;
    // Bar always rendered; starts collapsed (trigger only), opens on click.
    const customImgBar = canEditImg ? `
      <div class="custom-img-bar" id="customImgForm">
        <button class="custom-img-trigger" id="btnCustomImgEdit" title="${esc(t("customImgUrl"))}">
          <span class="icon icon-edit icon-13"></span>
        </button>
        <input type="url" class="custom-img-input" id="customImgInput"
               placeholder="${esc(t("customImgUrlPlaceholder"))}"
               value="${esc(r.imgUrl || "")}" />
        <button class="custom-img-ok" id="btnCustomImgSave" title="${esc(t("customImgUrlSave"))}">
          <span class="icon icon-check icon-14"></span>
        </button>
      </div>` : "";
    let imgSection = "";
    const _resolvedPanel = r.imgUrl ? resolvedImg(r.imgUrl) : null;
    const onerrorScript = canEditImg
      ? `this.closest('.panel-img-wrap').classList.add('img-broken');this.outerHTML='<div class=\\'panel-img-color-placeholder\\'style=\\'background:${colorBg(r)}\\'><img src=\\'${logoSrc(colorBg(r))}\\'class=\\'panel-img-logo\\'></div>'`
      : `this.outerHTML='<div class=\\'panel-img-color-placeholder\\'style=\\'background:${colorBg(r)}\\'><img src=\\'${logoSrc(colorBg(r))}\\'class=\\'panel-img-logo\\'></div>'`;
    if (_resolvedPanel) {
      imgSection = `<div class="panel-img-wrap">${overlays}<img class="panel-img" src="${esc(_resolvedPanel)}" onerror="${esc(onerrorScript)}" />${customImgBar}</div>`;
    } else {
      imgSection = `<div class="panel-img-wrap">${overlays}<div class="panel-img-color-placeholder" style="background:${colorBg(r)}"><img src="${logoSrc(colorBg(r))}" class="panel-img-logo" /></div>${customImgBar}</div>`;
    }

    // colors — same circle design as table rows
    const colorsHtml = colorCircleHTML(r, 56);

    // print settings — renamed local var to avoid shadowing t()
    const temps = r.temps;
    const hasDirect = temps.nozzleMin || temps.nozzleMax || temps.bedMin || temps.bedMax || temps.dryTemp || temps.dryTime;
    const rec = mat && mat.recommended;
    // TD chip — editable only when viewing own inventory
    const tdChipEl = state.friendView
      ? `<div class="temp-chip">
          <div class="tc-label">TD</div>
          <div class="tc-value">${r.td != null ? r.td : "—"}</div>
        </div>`
      : `<div class="temp-chip temp-chip--editable" id="btnEditTd" title="${t("tdEditTitle")}">
          <div class="tc-label">TD</div>
          <div class="tc-value">${r.td != null ? r.td : `<span class="tc-add">${t("tdNotSet")}</span>`}</div>
        </div>`;

    let tempHtml = "";
    {
      const nozzle = temps.nozzleMin && temps.nozzleMax ? `${temps.nozzleMin}–${temps.nozzleMax} °C`
                   : rec ? `${rec.nozzleTempMin}–${rec.nozzleTempMax} °C` : "—";
      const bed    = temps.bedMin && temps.bedMax ? `${temps.bedMin}–${temps.bedMax} °C`
                   : rec ? `${rec.bedTempMin}–${rec.bedTempMax} °C` : "—";
      const dryT   = temps.dryTemp ? `${temps.dryTemp} °C` : rec ? `${rec.dryTemp} °C` : "—";
      const dryH   = temps.dryTime ? `${temps.dryTime} h`  : rec ? `${rec.dryTime} h`  : "—";
      const density = mat && mat.density ? `<div style="margin-top:8px;font-size:12px;color:var(--muted)">${t("lbDensity")}: ${mat.density} g/cm³</div>` : "";
      const tempChips = (hasDirect || rec) ? `
          <div class="temp-chip"><div class="tc-label">${t("lbNozzle")}</div><div class="tc-value">${nozzle}</div></div>
          <div class="temp-chip"><div class="tc-label">${t("lbBed")}</div><div class="tc-value">${bed}</div></div>
          <div class="temp-chip"><div class="tc-label">${t("lbDryTemp")}</div><div class="tc-value">${dryT}</div></div>
          <div class="temp-chip"><div class="tc-label">${t("lbDryTime")}</div><div class="tc-value">${dryH}</div></div>` : "";
      tempHtml = `
      <div class="panel-section">
        <div class="panel-label">${t("sectionPrint")}</div>
        <div class="temp-grid">${tempChips}${tdChipEl}</div>
        ${density}
      </div>`;
    }

    // info badges (Refill / Recycled / Filled)
    const infoBadges = [
      r.isRefill   ? t("badgeRefill")   : null,
      r.isRecycled ? t("badgeRecycled") : null,
      r.isFilled   ? t("badgeFilled")   : null,
    ].filter(Boolean);
    const infoHtml2 = infoBadges.length ? `<div class="aspect-chips" style="margin-top:8px">${infoBadges.map(b=>`<span class="aspect-chip">${b}</span>`).join("")}</div>` : "";

    // video player (YouTube thumbnail→browser OR direct MP4 inline)
    const videoInfo = parseVideoUrl(r.links.youtube);
    let videoHtml = "";
    if (videoInfo) {
      if (videoInfo.type === "youtube") {
        // YouTube: embed bloqué (err 153) → miniature cliquable, s'ouvre dans le navigateur
        const thumb = `https://img.youtube.com/vi/${esc(videoInfo.id)}/hqdefault.jpg`;
        videoHtml = `
      <div class="panel-video-section">
        <button class="panel-yt-thumb" id="panelVideoBtn" data-url="${esc(r.links.youtube)}">
          <img src="${thumb}" alt="YouTube" loading="lazy" onerror="this.style.display='none'" />
          <div class="pvt-play"><span class="icon icon-play icon-22" style="background-color:#fff;margin-left:3px"></span></div>
        </button>
      </div>`;
      } else if (videoInfo.type === "direct") {
        // MP4/WebM direct → lecteur inline immédiat, pleine largeur
        videoHtml = `
      <div class="panel-video-section">
        <div class="panel-video-player">
          <video src="${esc(videoInfo.src)}" controls></video>
        </div>
      </div>`;
      }
      // type "external" → link-btn géré dans linkDefs ci-dessous
    }

    // doc links (MSDS, TDS, RoHS, REACH, food — video handled separately above)
    const SVG_PDF = `<span class="icon icon-pdf icon-13" style="width:11px"></span>`;
    const linkDefs = [
      { key: "msds",  label: "MSDS" },
      { key: "tds",   label: "TDS" },
      { key: "rohs",  label: "RoHS" },
      { key: "reach", label: "REACH" },
      { key: "food",  label: t("linkFood") },
      ...(videoInfo?.type === "external" ? [{ key: "youtube", label: t("linkYt") }] : []),
    ];
    const activeLinks = linkDefs.filter(l => r.links[l.key]);
    const linksHtml = activeLinks.length ? `
      <div class="panel-section">
        <div class="panel-label">${t("sectionLinks")}</div>
        <div class="links-row">${activeLinks.map(l => `<a class="link-btn" href="${esc(r.links[l.key])}" target="_blank" rel="noopener">${SVG_PDF}${l.label}</a>`).join("")}</div>
      </div>` : "";

    // weight
    const cap = r.capacity || 1000;
    const curW = r.weightAvailable != null ? r.weightAvailable : 0;
    // Clamp to 0-100 so a weightAvailable that exceeds capacity (e.g. manual
    // overrun, or capacity lowered after weighing) doesn't render past the
    // bar. Must match the clamp in _patchDetailWeight so the path-2 patch and
    // path-3 full rebuild produce identical widths.
    const pctFill = Math.max(0, Math.min(100, Math.round(curW / cap * 100)));
    const weightHtml = state.friendView ? `
      <div class="panel-section">
        <div class="panel-label">${t("sectionWeight")}</div>
        <div class="weight-bar-wrap">
          <div class="wb-labels">
            <div class="wb-val-group">
              <div class="wb-val">${curW}<span>g</span></div>
            </div>
            <div class="wb-cap">${cap >= 1000 ? (cap/1000).toFixed(cap % 1000 === 0 ? 0 : 1) + ' kg' : cap + ' g'} total</div>
          </div>
          <div class="wb-track wb-track--ro">
            <div class="wb-fill" style="width:${pctFill}%"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:5px">
            <span>0 g</span><span>${cap} g</span>
          </div>
        </div>
      </div>` : `
      <div class="panel-section">
        <div class="panel-label panel-label--weight">
          <span>${t("sectionWeight")}</span>
          <span class="wb-saved-check" id="wbSavedCheck" aria-hidden="true"></span>
        </div>
        <div class="weight-bar-wrap">
          <div class="wb-labels">
            <div class="wb-val-group">
              <div class="wb-val" id="sliderDisplay">${curW}<span>g</span></div>
              <button id="wbEditOpen" class="wb-edit-open" title="${t("btnEditManually")}">
                <span class="icon icon-edit icon-13"></span>
              </button>
              <div class="wb-inline-edit hidden" id="wbInlineEdit">
                <div class="wb-inline-row">
                  <input type="number" id="wbInlineInput" min="0" max="${cap}" step="1" value="${curW}" />
                  <button id="wbInlineConfirm" class="wb-inline-ok" title="Confirm">✓</button>
                  <button id="wbInlineCancel" class="wb-inline-cancel" title="Cancel">✕</button>
                  <div class="wb-mode-toggle" id="wbModeToggle">
                    <button type="button" class="wb-mode-btn active" data-mode="net" id="wbModeNet" title="${t('wbModeNetTitle')}">${t('wbModeNet')}</button>
                    <button type="button" class="wb-mode-btn"        data-mode="gross" id="wbModeGross" title="${t('wbModeGrossTitle')}">${t('wbModeGross')}</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="wb-cap">${cap >= 1000 ? (cap/1000).toFixed(cap % 1000 === 0 ? 0 : 1) + ' kg' : cap + ' g'} total</div>
          </div>
          <div class="wb-track">
            <div class="wb-fill" id="wbFill" style="width:${pctFill}%"></div>
            <input type="range" id="weightSlider" min="0" max="${cap}" step="1" value="${curW}" />
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:5px">
            <span>0 g</span><span>${cap} g</span>
          </div>
        </div>

        <div id="panelWeightResult"></div>
      </div>`;

    // info rows — optional 3rd tuple element is an id placed on the .pv span,
    // so _patchDetailWeight can refresh that cell without a full rebuild.
    const infoRows = [
      [t("detUid"),           r.uid],
      [t("detType"),          r.productType],
      [t("thName"),           r.colorName !== "-" ? r.colorName : null],
      [t("detSeries"),        r.series],
      [t("detBrand"),         r.brand],
      [t("detMaterial"),      r.material],
      [t("detDiameter"),      r.diameter],
      [t("detTagType"),       r.tagType],
      [t("detSku"),           r.sku],
      [t("detBarcode"),       r.barcode],
      [t("detContainer"),     r.containerId],
      [t("detTwin"),          r.twinUid],
      [t("detUpdated"),       fmtTs(r.lastUpdate), "detUpdatedVal"],
      ...(!r.isPlus && fmtChipTs(r.chipTimestamp) ? [[t("detManufactured"), fmtChipTs(r.chipTimestamp)]] : []),
    ].filter(([,val]) => val && val !== "-");

    // Details section is collapsible — state persisted in localStorage.
    // Defaults to collapsed (the user said it's rarely useful and takes space).
    const detailsOpen = localStorage.getItem("tigertag.detailsExpanded") === "1";
    const infoHtml = `
      <div class="panel-section panel-details${detailsOpen ? " open" : ""}">
        <button class="panel-details-head" type="button" id="btnToggleDetails">
          <span class="panel-label">${t("sectionDetails")}</span>
          <span class="panel-details-chevron">›</span>
        </button>
        <div class="panel-details-body">
          ${infoRows.map(([k,val,pvId]) => `<div class="panel-row"><span class="pk">${k}</span><span class="pv"${pvId ? ` id="${pvId}"` : ""}>${esc(String(val))}</span></div>`).join("")}
          <div style="margin-top:8px;display:flex;gap:6px">
            ${tierBadgeHTML(r)}
            ${r.deleted ? `<span class="badge bad" style="font-size:11px">${t("badgeDeleted")}</span>` : ""}
          </div>
        </div>
      </div>`;

    // ── Storage location row (rack name + coordinate, or auto-assign button)
    // Shown for any active spool. Two states:
    //   • Placed in a rack    → display the rack name + coordinate (A1, B5…)
    //   • Not placed yet      → display an "Auto-assign" button that drops
    //                           the spool into the first available unlocked
    //                           slot, scanning racks in display order.
    // Hidden in friend-view (read-only) and when there are no racks at all.
    const _rackForSpool = (r.rackId && r.rackLevel != null && r.rackPos != null)
      ? state.racks.find(x => x.id === r.rackId) : null;
    const _hasRacks = state.racks.length > 0;
    let storageHtml = "";
    if (_rackForSpool) {
      const coord = String.fromCharCode(65 + r.rackLevel) + (r.rackPos + 1);
      const lockedHere = isSlotLocked(_rackForSpool.id, r.rackLevel, r.rackPos);
      // Clickable row → closes the detail panel, switches to Storage view,
      // and prefills the search bar with the spool's RFID UID so the user
      // visually locates it (matching slot stays bright, others dim).
      storageHtml = `
        <div class="panel-section panel-storage-loc">
          <div class="panel-label">${t("sectionStorageLoc") || "Storage location"}</div>
          <button class="storage-loc-row storage-loc-row--clickable" id="btnLocateSpool"
                  data-spool-uid="${esc(r.uid || "")}"
                  data-spool-id="${esc(r.spoolId)}"
                  title="${esc(t("storageLocateTip") || "Show in Storage view")}">
            <span class="icon icon-package icon-14"></span>
            <span class="storage-loc-rack">${esc(_rackForSpool.name)}</span>
            <span class="storage-loc-coord">${coord}</span>
            ${lockedHere ? `<span class="storage-loc-locked icon icon-lock icon-13" title="${esc(t("rackPinnedTip"))}"></span>` : ""}
            <span class="storage-loc-locate icon icon-chevron-r icon-13" aria-hidden="true"></span>
          </button>
        </div>`;
    } else if (_hasRacks && !state.friendView && !r.deleted) {
      storageHtml = `
        <div class="panel-section panel-storage-loc">
          <div class="panel-label">${t("sectionStorageLoc") || "Storage location"}</div>
          <div class="storage-loc-row storage-loc-row--empty">
            <span class="icon icon-package icon-14"></span>
            <span class="storage-loc-rack storage-loc-rack--empty">${esc(t("storageNotPlaced") || "Not placed in a rack")}</span>
            <button class="ghost sm storage-loc-autobtn" id="btnStorageAutoAssign" data-spool-id="${esc(r.spoolId)}" title="${esc(t("storageAutoAssignTip") || "Place in the first available slot")}">
              <span class="icon icon-sparkle icon-13"></span>
              <span data-i18n="storageAutoAssign">${esc(t("storageAutoAssign") || "Auto-assign")}</span>
            </button>
          </div>
        </div>`;
    }

    // container card — flat layout (no border box)
    const container = r.containerId ? containerFind(r.containerId) : null;
    const containerHtml = container ? `
      <div class="panel-section cc-section">
        <div class="cc-body">
          <img src="${esc(container.img)}" alt="${esc(container.brand)}" onerror="this.style.display='none'" />
          <div class="cc-meta">
            <div class="cc-head">${esc(container.brand)} · ${esc(container.label)}</div>
            <div class="cc-type">${esc(container.type)}</div>
            <div class="cc-cw-row">
              <span id="ccCwVal" class="cc-cw">${r.containerWeight} g</span>
              ${state.friendView ? "" : `<button id="btnEditCw" class="cc-cw-btn" title="${t("cwEditWeight")}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`}
            </div>
            ${state.friendView ? "" : `<div id="ccCwEditRow" class="cc-cw-edit-row">
              <input id="ccCwInput" type="number" class="cc-cw-input" value="${r.containerWeight}" min="0" max="9999" step="1" />
              <button id="ccCwOk" class="cc-cw-ok">✓</button>
              <button id="ccCwCancel" class="cc-cw-cancel">✕</button>
            </div>`}
          </div>
          ${state.friendView ? "" : `<button id="btnChangeContainerCard" class="cc-edit" title="${t("btnChangeContainer")}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`}
        </div>
      </div>` : "";

    // aspects + badges — all chips in one wrapping row beside the color circle
    const aspectChips = [r.aspect1, r.aspect2].filter(a => a && a !== "-" && a !== "None");
    const allChips = [
      ...aspectChips.map(a => `<span class="aspect-chip">${esc(a)}</span>`),
      ...infoBadges.map(b => `<span class="aspect-chip">${b}</span>`)
    ];
    const aspectHtml = "";
    const badgeHtml = allChips.length
      ? `<div class="aspect-chips">${allChips.join("")}</div>`
      : "";

    // identity block — Brand + Series on line 1, Material + Name on line 2
    const hasBrand   = r.brand && r.brand !== "-";
    const hasSeries  = r.series && r.series !== "-";
    const hasMat     = r.material && r.material !== "-";
    const aspectFallback = [r.aspect1, r.aspect2].filter(a => a && a !== "-" && a !== "None").join(" ");
    // Catalogue name = color_name / name (NOT message). TigerTag+ spools
    // carry it (e.g. "Artic Teal"); Cloud / basic usually don't.
    const _cn = r.raw?.color_name, _nm = r.raw?.name;
    const catName = (_cn && _cn !== "--" && _cn !== "") ? String(_cn)
                  : (_nm && _nm !== "--" && _nm !== "") ? String(_nm)
                  : null;
    // The `message` chip slot is an editable label/name, available on every
    // spool type (Cloud, basic, TigerTag+) outside friend view. When a
    // catalogue name exists it renders below it as a secondary line; when
    // it doesn't (Cloud/basic) the message IS the spool's name.
    const canEditMsg = !state.friendView;
    const rawMsg     = (r.raw && r.raw.message != null) ? String(r.raw.message) : "";
    const nameInner = rawMsg.trim()
      ? `<span class="pi-name-text">${esc(rawMsg)}</span>`
      : `<span class="pi-name-text pi-name-placeholder">${esc(t("msgEditAdd"))}</span>`;
    const msgEditHtml = `<button type="button" class="pi-name-edit" id="piNameEdit" data-raw="${esc(rawMsg)}" title="${esc(t("msgEditTip"))}">${nameInner}<span class="icon icon-edit icon-12 pi-name-pencil"></span></button>`;
    // Line 1: Brand · Series · Material (the catalogue identity).
    // Then: catalogue name (read-only) if any, then the editable message.
    const row1Parts = [hasBrand ? esc(r.brand) : "", hasSeries ? esc(r.series) : "", hasMat ? esc(r.material) : ""].filter(Boolean);
    let nameLinesHtml = "";
    if (canEditMsg) {
      if (catName) nameLinesHtml += `<div class="pi-row2 pi-row2--name">${esc(catName)}</div>`;
      nameLinesHtml += `<div class="pi-row2 pi-row2--name pi-name-msgline${catName ? " pi-name-msgline--secondary" : ""}">${msgEditHtml}</div>`;
    } else {
      // Friend view — read-only: show the catalogue name, else the message.
      const ro = catName || (rawMsg.trim() ? rawMsg : null) || aspectFallback || null;
      if (ro) nameLinesHtml += `<div class="pi-row2 pi-row2--name">${esc(ro)}</div>`;
    }
    const identityHtml = `
      <div class="panel-section panel-identity">
        ${row1Parts.length ? `<div class="pi-row1">${row1Parts.join(" ")}</div>` : ""}
        ${nameLinesHtml}
      </div>`;

    let chipBannerHtml = "";
    if (r.isCloud) {
      // Cloud spool — never has a physical chip yet. Show a persistent encode CTA.
      // When a reader with a card is present: primary "Encode →" button.
      // Otherwise: ghost "TigerPOD →" button that links to the product page.
      const hasCard = window.electronAPI && (state.nfcCardPresent?.size ?? 0) > 0;
      chipBannerHtml = `
        <div class="chip-update-banner cloud-encode-banner" id="cloudEncodeBanner">
          <img class="rfid-material-icon" src="../assets/img/TigerTag_RFID_Material.png" alt="RFID">
          <span class="chip-update-text cloud-encode-text">${t("cloudNotEncoded")}</span>
          <span class="chip-encode-btn ${hasCard ? "chip-encode-active" : ""}">
            ${hasCard ? t("encodeCloudBtn") : t("tigerPodDiscover")}
          </span>
        </div>`;
    } else if (r.needUpdateAt) {
      chipBannerHtml = `
        <div class="chip-update-banner" id="chipUpdateBanner">
          <img class="rfid-material-icon" src="../assets/img/TigerTag_RFID_Material.png" alt="RFID">
          <span class="chip-update-text">${t("chipPendingHint")}</span>
          <span class="chip-encode-btn chip-encode-warning">${t("btnChipDone")}</span>
        </div>`;
    } else if (!r.isPlus && !state.friendView && window.electronAPI?.lookupProduct) {
      // Regular TigerTag (Maker) — offer upgrade to TigerTag+
      chipBannerHtml = `
        <div class="upgrade-plus-banner" id="upgradePlusBanner">
          <div class="upgrade-plus-banner-left">
            <span class="upgrade-plus-badge">TigerTag+</span>
            <span class="upgrade-plus-banner-text">${t("upgradeToPlusBanner")}</span>
          </div>
          <span class="upgrade-plus-banner-cta">${t("upgradeToPlusAction")} →</span>
        </div>
        <div class="upgrade-plus-form" id="upgradePlusForm">
          <div class="upgrade-plus-input-row">
            <input class="upgrade-plus-input" id="upgradePlusInput" type="number" min="1"
              placeholder="ID (ex: 60)" />
            <button class="upgrade-plus-check-btn" id="upgradePlusCheck">${t("upgradeToPlusCheck")}</button>
          </div>
          <div class="upgrade-plus-form-links">
            <button class="upgrade-plus-help-link" id="upgradePlusHelpBtn">
              <span class="icon icon-info icon-12"></span>${esc(t("upgradeToPlusHelpTip"))}
            </button>
            <button class="upgrade-plus-list-link" id="upgradePlusListBtn">
              <span class="icon icon-link icon-12"></span>${esc(t("upgradeToPlusListTip"))}
            </button>
          </div>
          <div class="upgrade-plus-preview" id="upgradePlusPreview"></div>
          <button class="upgrade-plus-confirm-btn" id="upgradePlusConfirm" style="display:none">${t("upgradeToPlusConvert")}</button>
        </div>`;
    }

    return `
      ${imgSection}
      ${chipBannerHtml}
      ${identityHtml}
      <div class="panel-section">
        <div class="panel-label">${t("sectionColors", {n: r.colorList.length})} &amp; Aspect</div>
        <div class="color-aspect-row">
          <div class="color-circles-col">
            <button class="color-edit-trigger" id="btnEditColor" title="${t("colorEditTitle")}">${colorsHtml || '<span style="color:var(--muted);font-size:13px">—</span>'}<span class="color-edit-plus">+</span></button>
          </div>
          <div class="aspect-col">
            ${aspectHtml}
            ${badgeHtml}
          </div>
        </div>
      </div>
      ${weightHtml}
      ${storageHtml}
      ${containerHtml}
      ${tempHtml}
      ${videoHtml}
      ${linksHtml}
      ${infoHtml}
      ${(() => {
        // ── Toolbox — bundles every action available on this spool.
        // Hidden in friend view (read-only) and on tombstoned rows
        // (deleted spools have nothing to act on).
        if (state.friendView || r.deleted) return "";
        const tools = [];

        // 0. Duplicate — always the first tool. Clones this spool as a new
        //    TigerCloud entry with a fresh UID. Shown for Cloud spools
        //    and basic TigerTag spools (a basic one necessarily becomes
        //    Cloud — a digital clone has no physical chip, so it needs a
        //    Cloud UID). TigerTag+ is never duplicable (gated by `!r.isPlus`;
        //    Cloud takes precedence so a Cloud doc stays duplicable). Hold 1s.
        if (r.isCloud || !r.isPlus) {
          tools.push({
            id: "btnToolDuplicate",
            icon: "icon-copy",
            label: t("toolDuplicate"),
            variant: "default",
            type: "split",
            holdConfirm: true,
            title: t("toolDuplicateTip"),
            // Quantity stepper — pick how many copies to mint in one shot.
            // The main button label tracks the count ("Duplicate ×N").
            trailing: `
              <div class="dup-stepper" title="${esc(t("toolDuplicateCount"))}">
                <button type="button" class="dup-step-btn" id="btnDupDec" aria-label="−">−</button>
                <span class="dup-step-val" id="dupCount">1</span>
                <button type="button" class="dup-step-btn" id="btnDupInc" aria-label="+">+</button>
              </div>`,
          });
        }

        // 1. TD1S — measure colour. Always shown; if the device isn't
        //    connected the click opens the connect modal first so the
        //    user has a clear path to fixing it.
        tools.push({
          id: "btnToolMeasureColor",
          icon: "icon-palette",
          label: t("toolMeasureColor"),
          variant: "default",
        });

        // 2. TD1S — measure TD (transparency). Same pattern.
        //    A trailing hold-to-confirm trash button clears the TD value
        //    from Firestore; only shown when a TD value is actually set.
        tools.push({
          id: "btnToolMeasureTd",
          icon: "icon-search",
          label: t("toolMeasureTd"),
          variant: "default",
          type: "split",
          trailing: r.td != null ? `
            <button type="button" class="toolbox-row-trailing toolbox-row--hold toolbox-row--danger-soft" id="btnToolClearTd" title="${esc(t("toolClearTd"))}">
              <span class="hold-progress"></span>
              <span class="icon icon-trash icon-14 toolbox-row-icon"></span>
            </button>` : "",
        });

        // 3. Edit image URL — only when a user-set image is already loaded
        //    (i.e. the Edit button has moved out of the colour square into
        //    the toolbox). Not shown for API-sourced TigerTag+ images.
        if (r.userImg && r.imgUrl) {
          tools.push({
            id: "btnToolEditImg",
            icon: "icon-edit",
            label: t("customImgUrl"),
            variant: "default",
          });
        }

        // 4. Twin pairing — three possible visibilities:
        //    - paired (normal user)        → row hidden (the twin
        //      badge on the photo + the raw-data tab already convey
        //      the paired state; an extra info row would just take
        //      vertical space without giving the user an action)
        //    - paired (debug user)         → "Unlink" tool (delete
        //      pairing, hold-to-confirm)
        //    - unpaired + has candidates   → "Link to a twin spool"
        //    - unpaired + no candidates    → row hidden
        if (r.hasTwinPair) {
          if (state.debugEnabled) {
            tools.push({
              id: "btnTwinUnlink",
              icon: "icon-link",
              label: t("twinLinkUnlink"),
              variant: "danger-soft",
              holdConfirm: true,
              title: t("twinLinkUnlinkHint"),
              dataAttrs: `data-spool-id="${esc(r.spoolId)}"`,
            });
          }
          // Normal users: no twin row at all when already paired.
        } else if (findTwinCandidates(r).length > 0) {
          tools.push({
            id: "btnTwinLink",
            icon: "icon-link",
            label: t("twinLinkAction"),
            variant: "default",
            dataAttrs: `data-spool-id="${esc(r.spoolId)}"`,
          });
        }

        // 4. Remove from rack — only when the spool IS placed in a
        //    rack. Hold-to-confirm + reuses the eject animation that
        //    void-drop fires.
        if (r.rackId) {
          tools.push({
            id: "btnToolRemoveFromRack",
            icon: "icon-package",
            label: t("toolRemoveFromRack"),
            variant: "danger-soft",
            holdConfirm: true,
            dataAttrs: `data-spool-id="${esc(r.spoolId)}"`,
          });
        }

        // 5a. Encode Cloud → chip: shown only for Cloud spools when at least one
        //     reader has a card present. Migrates the Cloud doc to a real RFID doc.
        if (r.isCloud && window.electronAPI && state.nfcCardPresent.size > 0) {
          tools.push({
            id: "btnEncodeCloud",
            icon: "icon-nfc",
            label: t("encodeCloudBtn"),
            variant: "primary",
          });
        }

        // 5b. Burn RFID — write cloud doc to all connected readers sequentially.
        //    Only shown for non-Cloud spools when at least one reader is connected.
        if (!r.isCloud && window.electronAPI && state.nfcReaderCount > 0) {
          tools.push({
            id: "btnBurnRfid",
            icon: "icon-nfc",
            label: t("burnRfidBtn"),
            variant: "default",
          });
        }

        // 5c. Refresh from API — TigerTag+ only (has id_product + apiUrl).
        if (r.isPlus && !r.isCloud && window.electronAPI?.refreshApiData) {
          tools.push({
            id: "btnRefreshApi",
            icon: "icon-refresh",
            label: t("toolRefreshApi"),
            variant: "default",
          });
        }

        // 6. Delete — moved out of its own section into the toolbox.
        tools.push({
          id: "btnSpoolDelete",
          icon: "icon-trash",
          label: t("spoolMarkDeleted"),
          variant: "danger",
          holdConfirm: true,
          title: t("spoolMarkDeletedTip"),
          dataAttrs: `data-spool-id="${esc(r.spoolId)}"`,
        });

        // Render — each tool is a row (button or div with trailing
        // button). Hold-confirm rows include the .hold-progress fill
        // span that setupHoldToConfirm targets for the animation.
        const rowsHtml = tools.map(tool => {
          const cls = `toolbox-row toolbox-row--${tool.variant}${tool.holdConfirm ? " toolbox-row--hold" : ""}${tool.inert ? " toolbox-row--inert" : ""}`;
          const titleAttr = tool.title ? ` title="${esc(tool.title)}"` : "";
          const dataAttrs = tool.dataAttrs || "";
          // Split rows: main clickable button on the left + trailing
          // secondary button (e.g. trash) on the right, both inside a
          // flex wrapper. Needed when two independent actions share a row.
          if (tool.type === "split") {
            // When holdConfirm is set the MAIN button becomes a
            // hold-to-confirm target (gets .hold-progress + the row gets
            // toolbox-row--hold for the fill animation).
            return `
              <div class="toolbox-row toolbox-row--split toolbox-row--${tool.variant}${tool.holdConfirm ? " toolbox-row--hold" : ""}">
                <button type="button" class="toolbox-row-main${tool.holdConfirm ? " toolbox-row-main--hold" : ""}" id="${esc(tool.id)}"${titleAttr}>
                  ${tool.holdConfirm ? '<span class="hold-progress"></span>' : ""}
                  <span class="icon ${esc(tool.icon)} icon-14 toolbox-row-icon"></span>
                  <span class="toolbox-row-label">${esc(tool.label)}</span>
                  <span class="icon icon-chevron-r icon-13 toolbox-row-chev"></span>
                </button>
                ${tool.trailing || ""}
              </div>`;
          }
          // Inert rows render as a <div> with a trailing <button> for the
          // action; clickable rows render as a <button> directly.
          if (tool.inert) {
            return `
              <div class="${cls}" id="${esc(tool.id)}"${titleAttr} ${dataAttrs}>
                <span class="icon ${esc(tool.icon)} icon-14 toolbox-row-icon"></span>
                <span class="toolbox-row-label">${esc(tool.label)}</span>
                ${tool.trailing || ""}
              </div>`;
          }
          return `
            <button type="button" class="${cls}" id="${esc(tool.id)}"${titleAttr} ${dataAttrs}>
              ${tool.holdConfirm ? '<span class="hold-progress"></span>' : ""}
              <span class="icon ${esc(tool.icon)} icon-14 toolbox-row-icon"></span>
              <span class="toolbox-row-label">${esc(tool.label)}</span>
              <span class="icon icon-chevron-r icon-13 toolbox-row-chev"></span>
            </button>`;
        }).join("");

        return `
          <div class="panel-section panel-section--toolbox">
            <div class="panel-label">${esc(t("toolboxTitle"))}</div>
            <div class="toolbox-list">${rowsHtml}</div>
          </div>`;
      })()}
      ${state.debugEnabled ? `
      <div class="panel-section">
        <details class="debug" id="rawDetails">
          <summary style="display:flex;align-items:center;justify-content:space-between">
            <strong>${t("sectionRaw")}</strong>
            <button class="stg-copy-btn" id="btnCopyRaw" title="Copy JSON" style="height:26px;width:26px;flex-shrink:0">${SVG_COPY}</button>
          </summary>
          ${(() => {
            if (!r.hasTwinPair) {
              return `<pre class="json" id="rawJsonPre" style="margin-top:10px;max-height:400px">${highlight(r.raw)}</pre>`;
            }
            const twin = state.rows.find(x => x.spoolId !== r.spoolId && (String(x.uid) === String(r.twinUid) || String(x.spoolId) === String(r.twinUid)));
            const twinRaw = twin ? twin.raw : {};
            return `
            <div class="raw-tabs" style="margin-top:10px">
              <button class="raw-tab active" data-raw-tab="a">${t("twinTabThis")}</button>
              <button class="raw-tab" data-raw-tab="b">${t("twinTabTwin")}</button>
            </div>
            <pre class="json" id="rawJsonPre" style="max-height:400px" data-raw-a="${encodeURIComponent(JSON.stringify(r.raw, null, 2))}" data-raw-b="${encodeURIComponent(JSON.stringify(twinRaw, null, 2))}">${highlight(r.raw)}</pre>`;
          })()}
        </details>
      </div>` : ""}`;
  }

  async function doWeightUpdate(r, mode = "direct", w = "") {
    // Studio Manager has the full inventory in memory — same model as the mobile app.
    // Tare and twin logic are client-side; we write directly to Firestore.
    const uid = state.activeAccountId; if (!uid) return;
    if (w === "" || isNaN(Number(w))) { toast($("panelWeightResult"), "bad", t("enterNumeric")); return; }

    const btn = $("panelWeightBtn"); // may be null when called from slider/inline edit
    try {
      setLoading(btn, true);
      const rawW = Number(w);
      const cw   = Number(r.containerWeight) || 0;
      const cap  = Number(r.capacity) || 1000;

      // Tare: raw mode = scale reading includes container; direct mode = net weight
      const weightRaw = mode === "raw" ? rawW - cw : rawW;

      // Silent clamp to [0, cap] — the slider has min/max enforced and the
      // inline editor clamps on `input` + confirm, so this path should never
      // see out-of-range values from the UI. If something slips through (e.g.
      // a future programmatic caller), clamp instead of toasting an error.
      // The user's mental model is "the spool is full" → showing 100 % fill
      // tells them everything they need. The previous error toast ("X g —
      // hors plage [0–Y g]") had no auto-dismiss and just sat there.
      const weightAvailable = Math.max(0, Math.min(cap, weightRaw));

      const update = { weight_available: weightAvailable, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      const invRef = fbDb().collection("users").doc(uid).collection("inventory");
      const batch  = fbDb().batch();
      batch.update(invRef.doc(r.spoolId), update);

      // Twin — client already knows the twin relationship (same as mobile app)
      let twinUpdated = false;
      if (r.twinUid) {
        const twinRow = state.rows.find(row =>
          row.spoolId !== r.spoolId &&
          (String(row.uid) === String(r.twinUid) || String(row.spoolId) === String(r.twinUid))
        );
        if (twinRow) { batch.update(invRef.doc(twinRow.spoolId), update); twinUpdated = true; }
      }

      await batch.commit();
      // onSnapshot propagates the change to the UI automatically — no
      // loadInventory() and no manual openDetail() needed. The surgical
      // path 2 in refreshOpenDetail() patches the slider/display/fill in
      // place; the product image and SVG icons survive untouched. The
      // previous `setTimeout(() => openDetail(r.spoolId), 500)` here was
      // a leftover from before that refactor — it tore down panelBody.innerHTML
      // on every save and made the product photo + TigerTag SVGs visibly flash.
      // Visual confirmation: green check pops next to the edit button and
      // fades out. Replaced the verbose "wa available (gross − cw container)
      // [· twin updated]" toast — the slider/display/fill already show the
      // new value, the user doesn't need the math spelled out every save.
      _wbShowSavedCheck();

    } catch (e) { toast($("panelWeightResult"), "bad", e.message || t("networkError")); }
    finally { setLoading(btn, false); }
  }

  /* ── resizable panels ── */
  function makePanelResizable(panelEl, handleEl, storageKey) {
    const MIN_W = 280;
    const MAX_W = () => Math.round(window.innerWidth * 0.85);

    // Restore saved width
    const saved = parseInt(localStorage.getItem(storageKey), 10);
    if (saved && saved >= MIN_W) panelEl.style.width = saved + "px";

    let startX, startW;

    function onMove(e) {
      const dx = startX - (e.clientX ?? e.touches?.[0]?.clientX ?? startX);
      const w  = Math.max(MIN_W, Math.min(MAX_W(), startW + dx));
      panelEl.style.width = w + "px";
    }
    function onUp() {
      handleEl.classList.remove("dragging");
      panelEl.classList.remove("resizing");
      document.body.style.cursor  = "";
      document.body.style.userSelect = "";
      const w = parseInt(panelEl.style.width, 10);
      if (w) localStorage.setItem(storageKey, w);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend",  onUp);
    }

    handleEl.addEventListener("mousedown", e => {
      e.preventDefault();
      startX = e.clientX;
      startW = panelEl.offsetWidth;
      handleEl.classList.add("dragging");
      panelEl.classList.add("resizing");
      document.body.style.cursor     = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup",   onUp);
    });
    // touch support
    handleEl.addEventListener("touchstart", e => {
      startX = e.touches[0].clientX;
      startW = panelEl.offsetWidth;
      handleEl.classList.add("dragging");
      panelEl.classList.add("resizing");
      document.addEventListener("touchmove", onMove, { passive: true });
      document.addEventListener("touchend",  onUp);
    }, { passive: true });
  }

  makePanelResizable($("detailPanel"), $("detailResize"), "tigertag.panelWidth.detail");
  makePanelResizable($("debugPanel"),  $("debugResize"),  "tigertag.panelWidth.debug");
  // Keep the material card glued to the left edge of the printer panel if the
  // latter's width changes (e.g. window resize on a narrow viewport).
  if (window.ResizeObserver) {
    const _panelRO = new ResizeObserver(_syncPanels);
    if ($("printerPanel"))    _panelRO.observe($("printerPanel"));
    if ($("detailPanel"))     _panelRO.observe($("detailPanel"));
    if ($("printerAddPanel")) _panelRO.observe($("printerAddPanel"));
  }
  window.addEventListener("resize", _syncPanels);
  // td1sPanel resize + panel open/close are handled by initTD1S (renderer/IoT/td1s/index.js)

  /* ── debug panel ── */
  function openDebug() {
    $("debugPanel").classList.add("open");
    $("debugOverlay").classList.add("open");
    fsExplRefresh();
  }
  function closeDebug() { $("debugPanel").classList.remove("open"); $("debugOverlay").classList.remove("open"); }
  $("btnDebug").addEventListener("click", openDebug);
  $("debugPanelClose").addEventListener("click", closeDebug);
  $("debugOverlay").addEventListener("click", closeDebug);

  /* ── RFID tester modal ── */
  initRfidTester();

  /* ── diagnostic / report-problem modal ── */
  $("btnReportProblem")?.addEventListener("click", openDiagnosticModal);
  $("btnReportProblemLogin")?.addEventListener("click", openDiagnosticModal);
  $("diagModalClose")?.addEventListener("click", closeDiagnosticModal);
  $("diagModalOverlay")?.addEventListener("click", e => { if (e.target === $("diagModalOverlay")) closeDiagnosticModal(); });

  // ── Product ID help modal ──────────────────────────────────────────────────
  const _closePidHelp = () => $("productIdHelpOverlay")?.classList.remove("open");
  $("productIdHelpOverlay")?.addEventListener("click", e => { if (e.target === $("productIdHelpOverlay")) _closePidHelp(); });
  $("productIdHelpListBtn")?.addEventListener("click", () => {
    window.electronAPI?.openExternal("https://tigertag.io/pages/public-material-list?page=1");
    _closePidHelp();
  });
  $("btnDiagCopy")?.addEventListener("click", async () => {
    const txt = $("diagBody").value;
    try {
      await navigator.clipboard.writeText(txt);
      const btn = $("btnDiagCopy"); const orig = btn.textContent;
      btn.textContent = t("errReportCopied"); btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1400);
    } catch {
      // Fallback: select the textarea so the user can copy manually
      $("diagBody").focus(); $("diagBody").select();
    }
  });
  $("btnDiagClear")?.addEventListener("click", () => {
    _errorLog.length = 0;
    $("diagBody").value = buildDiagnosticReport();
    renderDiagBadge();
  });
  $("btnDiagDownload")?.addEventListener("click", () => {
    const txt = $("diagBody").value || buildDiagnosticReport();
    // Filename: tigertag-diagnostic-YYYY-MM-DDTHH-MM-SS.md (path-safe ISO timestamp)
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
    const blob = new Blob([txt], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tigertag-diagnostic-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  // Pre-load app info as soon as possible so the first open is instant
  loadAppInfo();

  // Click-outside to close the "Spools not stored" side panel.
  // Registered once at startup — works even if the panel is recreated by
  // renderRackView snapshots (it queries by id at click time).
  document.addEventListener("mousedown", e => {
    const aside = document.getElementById("rpUnranked");
    if (!aside?.classList.contains("is-open")) return;
    // Click inside the panel itself — keep it open
    if (aside.contains(e.target)) return;
    // Whitelist: buttons that own/manage the panel state — let their
    // own handlers run instead of the click-outside closing behaviour.
    if (e.target.closest("#btnToggleUnranked")) return;  // header pill toggle
    if (e.target.closest("#btnViewRack")) return;        // Storage view button (toolbar)
    // Otherwise — close
    aside.classList.remove("is-open");
    localStorage.setItem("tigertag.unrackedPanelOpen", "false");
  });

  // Settings → About → "Copy" — copies a one-line summary to clipboard
  $("btnCopyAbout")?.addEventListener("click", async () => {
    const info = await loadAppInfo();
    const txt = `Tiger Studio Manager v${info.appVersion} · ${info.platform || "?"}${info.arch ? " " + info.arch : ""} · Electron ${info.electron} · Chrome ${info.chrome || "?"} · Node ${info.node || "?"}`;
    try {
      await navigator.clipboard.writeText(txt);
      const lbl = $("btnCopyAbout")?.querySelector("[data-i18n='aboutCopy']");
      if (lbl) {
        const orig = lbl.textContent;
        lbl.textContent = t("settingsCopied");
        setTimeout(() => { lbl.textContent = orig; }, 1400);
      }
    } catch {}
  });

  // ── Settings → About → Auto-update toggle ───────────────────────────
  // Persists in localStorage AND syncs to the main process (which gates
  // checkForUpdatesAndNotify on this preference). Default: ON.
  const _autoUpdateKey = "tigertag.autoUpdate.enabled";
  function readAutoUpdatePref() {
    return localStorage.getItem(_autoUpdateKey) !== "false";    // default true
  }
  function writeAutoUpdatePref(enabled) {
    localStorage.setItem(_autoUpdateKey, enabled ? "true" : "false");
    try { window.electronAPI?.setAutoUpdate?.(enabled); } catch (_) {}
  }
  // Initial state on first render: reflect the stored preference + push it
  // to main (so the file-on-disk preference matches the renderer's view).
  const _autoUpdateToggle = $("stgAutoUpdateToggle");
  if (_autoUpdateToggle) {
    const enabled = readAutoUpdatePref();
    _autoUpdateToggle.checked = enabled;
    try { window.electronAPI?.setAutoUpdate?.(enabled); } catch (_) {}
    _autoUpdateToggle.addEventListener("change", () => {
      writeAutoUpdatePref(_autoUpdateToggle.checked);
    });
  }

  // ── Settings → About → "Check for updates now" button ───────────────
  // Forces a check regardless of the auto-update preference. Status is
  // surfaced via update-status events handled below + an inline message.
  function showUpdateStatus(msg, kind) {
    const el = $("stgUpdateStatus");
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind || "info";   // "info" | "ok" | "warn" | "err"
    el.hidden = false;
    clearTimeout(showUpdateStatus._t);
    if (kind === "ok" || kind === "info") {
      showUpdateStatus._t = setTimeout(() => { el.hidden = true; }, 6000);
    }
  }
  $("btnCheckUpdate")?.addEventListener("click", async () => {
    const btn = $("btnCheckUpdate");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    showUpdateStatus(t("aboutCheckUpdateChecking") || "Checking for updates…", "info");
    try {
      const r = await window.electronAPI?.checkForUpdates?.();
      if (!r?.ok) {
        showUpdateStatus((t("aboutCheckUpdateErr") || "Could not check") + ": " + (r?.error || "?"), "err");
      }
      // Success cases (up-to-date / available / ready) are surfaced by the
      // 'update-status' event listener below — no extra UI here.
    } catch (e) {
      showUpdateStatus((t("aboutCheckUpdateErr") || "Could not check") + ": " + (e?.message || e), "err");
    } finally {
      setTimeout(() => { btn.disabled = false; }, 2000);
    }
  });

  // Forward the lifecycle events from main into the inline status line.
  // Existing 'update-ready' overlay (shown elsewhere) keeps its handling.
  if (window.electronAPI?.onUpdateStatus) {
    window.electronAPI.onUpdateStatus((info) => {
      const status = info?.status;
      if (status === "checking")    showUpdateStatus(t("aboutCheckUpdateChecking") || "Checking for updates…", "info");
      else if (status === "up-to-date") showUpdateStatus(t("aboutCheckUpdateUpToDate") || "You're on the latest version.", "ok");
      else if (status === "available")  showUpdateStatus((t("aboutCheckUpdateAvailable") || "New version available") + (info.version ? ` (v${info.version})` : "") + " — downloading…", "info");
      else if (status === "ready")      showUpdateStatus((t("aboutCheckUpdateReady") || "Update ready — restart to install") + (info.version ? ` (v${info.version})` : ""), "ok");
      else if (status === "error")      showUpdateStatus((t("aboutCheckUpdateErr") || "Could not check") + ": " + (info.error || "?"), "err");
    });
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDebug(); });

  // debug tab switching
  document.querySelectorAll(".dbg-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".dbg-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      $("dbgPaneApi").classList.toggle("hidden", tab !== "api");
      $("dbgPaneFs").classList.toggle("hidden",  tab !== "fs");
      if (tab === "fs") fsExplRefresh();
    });
  });

  /* ── Hard-delete a spool (and its twin) from Firestore ────────────────────
     ISO with the printer hard-delete pattern. No tombstone is written —
     the doc is gone for good. The Flutter app's cloudSync guard prevents
     resurrection: once a spool has cloudSync:true and disappears from the
     cloud, the phone treats it as remotely deleted and removes it locally.

     Legacy migration: purgeLegacyTombstones() is called on the first
     Firestore snapshot to hard-delete any pre-existing deleted:true docs
     left over from the old soft-delete scheme.                           */
  async function markSpoolDeleted(spoolId) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const r = state.rows.find(x => x.spoolId === spoolId);
    if (!r) return;
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    const batch = fbDb().batch();
    batch.delete(invRef.doc(spoolId));
    // Hard-delete the twin as well — if one half is gone the pair is gone.
    if (r.twinUid) {
      const twin = state.rows.find(x =>
        x.spoolId !== spoolId &&
        (String(x.uid) === String(r.twinUid) || String(x.spoolId) === String(r.twinUid))
      );
      if (twin) batch.delete(invRef.doc(twin.spoolId));
    }
    await batch.commit();
    console.log(`[markSpoolDeleted] hard-deleted ${spoolId}${r.twinUid ? " (+ twin)" : ""}`);
  }

  /* One-time migration: scan the current Firestore snapshot for any legacy
     deleted:true tombstone docs and hard-delete them. Fire-and-forget — the
     resulting Firestore writes trigger a clean snapshot that no longer
     contains those docs, so the migration is automatically idempotent.   */
  /* ── Auto-assign container to spools that have none ────────────────────────
     Mirrors Flutter's _resolveSpoolForBrand logic.
     Triggered on every live Firestore snapshot — once all spools have a
     container_id the filter finds nothing and the function is a no-op.
     Also fires implicitly after saveAddProduct() because that write triggers
     a fresh snapshot, so new spools are covered without touching that path.

     Resolution order (ISO with Flutter):
       1. First catalog entry whose brandId matches the spool's id_brand.
       2. Fallback: first entry with brandId == 0 (Generic / custom_cardboard).
       3. Safety net: very first entry in the catalog.                        */

  function resolveContainerForBrand(brandId) {
    const catalog = state.db.containers || [];
    if (!catalog.length) return null;
    // 1) Brand-specific match
    if (brandId != null) {
      const match = catalog.find(c => Number(c.brandId) === Number(brandId));
      if (match) return match;
    }
    // 2) Generic fallback (brandId == 0 → custom_cardboard)
    const generic = catalog.find(c => Number(c.brandId) === 0);
    if (generic) return generic;
    // 3) Safety net
    return catalog[0];
  }

  async function autoAssignMissingContainers(uid, inventoryRaw) {
    // Find spools that have no container_id yet (and are not deleted).
    const missing = Object.entries(inventoryRaw).filter(
      ([, data]) => !data.container_id && data.deleted !== true
    );
    if (!missing.length) return;

    const invRef = fbDb().collection("users").doc(uid).collection("inventory");
    let batch = fbDb().batch();
    let ops = 0;
    let assigned = 0;
    const ts = firebase.firestore.FieldValue.serverTimestamp();

    for (const [spoolId, data] of missing) {
      const container = resolveContainerForBrand(data.id_brand);
      if (!container) continue;
      batch.update(invRef.doc(spoolId), {
        container_id:     container.id,
        container_weight: container.container_weight,
        updatedAt:        ts,
      });
      assigned++;
      if (++ops >= 400) {
        await batch.commit();
        batch = fbDb().batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
    if (assigned > 0)
      console.log(`[autoAssignMissingContainers] assigned container to ${assigned} spool(s)`);
  }

  async function purgeLegacyTombstones(uid, inventoryRaw) {
    const toDelete = Object.keys(inventoryRaw).filter(id => inventoryRaw[id]?.deleted === true);
    if (!toDelete.length) return;
    const invRef = fbDb().collection("users").doc(uid).collection("inventory");
    // Cap at 500 (Firestore batch limit) — in practice there'll be < 50.
    const chunks = [];
    for (let i = 0; i < toDelete.length; i += 400) chunks.push(toDelete.slice(i, i + 400));
    for (const chunk of chunks) {
      const batch = fbDb().batch();
      chunk.forEach(id => batch.delete(invRef.doc(id)));
      await batch.commit();
    }
    console.log(`[purgeLegacyTombstones] hard-deleted ${toDelete.length} legacy tombstone(s)`);
  }

  /* ── Firestore explorer ── */
  let _fseLastResult = null;

  // Known paths — {uid} replaced at runtime
  const FSE_QUICK = [
    { label: "user doc",   path: "users/{uid}" },
    { label: "prefs",      path: "users/{uid}/prefs/app" },
    { label: "telemetry",  path: "users/{uid}/telemetry/studio" },
    { label: "inventory",  path: "users/{uid}/inventory",  col: true },
    { label: "printers",   path: "users/{uid}/printers",   col: true },
    { label: "tags",       path: "users/{uid}/tags",       col: true },
  ];

  function fseInit() {
    const uid = state.activeAccountId || "{uid}";
    // build quick-access chips
    $("fseChips").innerHTML = FSE_QUICK.map(q => {
      const p = q.path.replace("{uid}", uid);
      return `<button class="fse-chip" data-path="${esc(p)}">${esc(q.label)}</button>`;
    }).join("");
    // set default path to user doc
    $("fsePath").value = `users/${uid}`;
  }

  async function fseFetch() {
    const uid = state.activeAccountId;
    if (!uid) { fseSetResult(null, "Not signed in"); return; }
    const raw = $("fsePath").value.trim().replace("{uid}", uid);
    if (!raw) return;
    const parts = raw.split("/").filter(Boolean);
    fseSetResult(null, "Fetching…");
    try {
      let ref;
      if (parts.length % 2 === 0) {
        // even segments → document
        ref = fbDb().doc(raw);
        const snap = await ref.get();
        if (!snap.exists) { fseSetResult(null, `Document not found: ${raw}`); return; }
        _fseLastResult = { _path: raw, ...snap.data() };
        fseSetResult(_fseLastResult, `doc · ${raw}`);
      } else {
        // odd segments → collection
        ref = fbDb().collection(raw);
        const snap = await ref.limit(20).get();
        if (snap.empty) { fseSetResult(null, `Collection empty or not found: ${raw}`); return; }
        const result = {};
        snap.forEach(doc => { result[doc.id] = doc.data(); });
        _fseLastResult = result;
        fseSetResult(result, `collection · ${raw} (${snap.size} docs${snap.size === 20 ? ", limited to 20" : ""})`);
      }
    } catch (e) {
      fseSetResult(null, `Error: ${e.message}`);
    }
  }

  function fseSetResult(data, label) {
    $("fseLabel").textContent = label || "";
    $("fsExplPre").innerHTML = data != null
      ? highlight(data)
      : `<span style="color:var(--muted)">${esc(label || "—")}</span>`;
  }

  function fsExplRefresh() { fseInit(); }

  $("fseChips").addEventListener("click", e => {
    const chip = e.target.closest(".fse-chip[data-path]");
    if (!chip) return;
    $("fsePath").value = chip.dataset.path;
    fseFetch();
  });
  $("fseFetch").addEventListener("click", fseFetch);
  $("fsePath").addEventListener("keydown", e => { if (e.key === "Enter") fseFetch(); });
  $("fseCopy").addEventListener("click", () => {
    if (!_fseLastResult) return;
    navigator.clipboard.writeText(JSON.stringify(_fseLastResult, null, 2)).then(() => {
      const btn = $("fseCopy");
      const orig = btn.textContent;
      btn.textContent = "✓";
      setTimeout(() => btn.textContent = orig, 1800);
    });
  });

  /* ── community buttons ── */
  $("sbGithubBtn").addEventListener("click", () => window.open("https://github.com/TigerTag-Project/TigerTag-Studio-Manager/"));
  $("sbMakerWorldBtn").addEventListener("click", () => window.open("https://makerworld.com/fr/@TigerTag/upload"));
  $("sbDiscordBtn").addEventListener("click", () => window.open("https://discord.gg/3Qv5TSqnJH"));

  // Sign-in placeholder buttons
  $("btnSignInPlaceholder").addEventListener("click", openAddAccountModal);
  $("btnSignInPlaceholderGh").addEventListener("click", () => window.open("https://github.com/TigerTag-Project/TigerTag-Studio-Manager/"));
  $("btnSignInPlaceholderDiscord").addEventListener("click", () => window.open("https://discord.gg/3Qv5TSqnJH"));
  $("sbQrWrap").addEventListener("click", () => window.open("https://taap.it/DF1Aqt"));

  /* ── language select ── */
  function saveAccountLang(lang) {
    // 1. Local account object (localStorage)
    const accounts = getAccounts();
    const acc = accounts.find(a => a.id === getActiveId());
    if (acc) { acc.lang = lang; saveAccounts(accounts); }
    localStorage.setItem("tigertag.lang", lang);
    // 2. Firestore — users/{uid}/prefs/app { lang }  (synced to mobile app too)
    const user = fbAuth().currentUser;
    if (user) {
      fbDb().collection("users").doc(user.uid)
        .collection("prefs").doc("app")
        .set({ lang }, { merge: true })
        .catch(err => console.warn("[Firestore] saveAccountLang:", err.message));
    }
  }

  // Read language preference from Firestore and apply if different from local
  function applyDebugMode() {
    // Debug panel is now visible to all users (was admin-only gated by
    // state.debugEnabled). The panel exposes their OWN Firestore docs only,
    // limited by Security Rules — no escalation path.
    $("btnDebug").classList.remove("hidden");
  }

  /* ── Friends UI ───────────────────────────────────────────────────────── */

  // Quick-access friends list rendered directly under the "Friends" button
  // in the main sidebar. Each chip is clickable → switches the inventory
  // view to that friend (read-only). Hidden when there are no friends.
  // Highlights the currently-active friend with an "active" border.
  // Last-rendered signature of the sidebar friend chips. Like the header
  // banner, this list is re-rendered many times on cold start (setConnected,
  // every renderAccountDropdown, then loadFriendsList after the network). A
  // blind innerHTML reassign would destroy + recreate each friend's avatar
  // <img> → a 2-3× flash. The guard rebuilds the DOM only when the visible
  // content changes, so identical re-renders keep the existing <img>.
  let _sbFriendsSig = null;
  function renderSidebarFriends() {
    const el = $("sbFriendsList");
    if (!el) return;
    if (!state.friends || !state.friends.length) {
      if (_sbFriendsSig !== "empty") { el.classList.add("hidden"); el.innerHTML = ""; _sbFriendsSig = "empty"; }
      return;
    }
    // Signature captures exactly what each chip paints (avatar mode / photo /
    // initials / gradient + name) plus which friend is currently being viewed.
    const activeUid = state.friendView?.uid || "";
    const sig = "list|" + activeUid + "|" + state.friends.map(f => {
      const p = _buildAvatarParts(f);
      return `${f.uid}:${p.mode}:${p.photoURL || ""}:${p.initials}:${p.bg}:${_shortName(f.displayName, f.uid)}`;
    }).join(",");
    if (sig === _sbFriendsSig) return;  // identical → keep the <img>s, no flash
    _sbFriendsSig = sig;
    el.classList.remove("hidden");
    el.innerHTML = state.friends.map(f => {
      const initials = (f.displayName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
      const color = friendColor(f);
      const fg = readableTextOn(color);
      const isActive = state.friendView?.uid === f.uid;
      // `data-tooltip` powers the custom CSS bubble that shows the friend's
      // displayName when the sidebar is collapsed (avatar-only mode), since
      // the inline name span is then hidden. Native `title=` is also kept
      // as a fallback for accessibility / when the chip is keyboard-focused.
      return `<button class="sb-friend-chip${isActive ? " is-active" : ""}"
                      data-friend-uid="${esc(f.uid)}"
                      data-friend-name="${esc(_shortName(f.displayName, f.uid))}"
                      data-friend-color="${esc(color)}"
                      data-tooltip="${esc(_shortName(f.displayName, f.uid))}"
                      title="${esc(_shortName(f.displayName, f.uid))}">
        ${avatarMarkup(f, "sb-friend-avatar")}
        <span class="sb-friend-name">${esc(_shortName(f.displayName, f.uid))}</span>
        ${isActive ? '<span class="sb-friend-active-dot" aria-hidden="true"></span>' : ""}
      </button>`;
    }).join("");
    el.querySelectorAll(".sb-friend-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const uid = btn.dataset.friendUid;
        const name = btn.dataset.friendName;
        const color = btn.dataset.friendColor;
        if (state.friendView?.uid === uid) {
          // Already viewing this friend → click again to go back to own view
          switchBackToOwnView();
        } else {
          switchToFriendView(uid, name, color);
        }
      });
      // Custom tooltip on hover, only shown when the sidebar is collapsed
      // (avatar-only mode). Uses a body-appended singleton bubble so the
      // tooltip escapes the sidebar's `overflow: hidden`.
      btn.addEventListener("mouseenter", () => showSbFriendTip(btn));
      btn.addEventListener("mouseleave", hideSbFriendTip);
      btn.addEventListener("focus",      () => showSbFriendTip(btn));
      btn.addEventListener("blur",       hideSbFriendTip);
    });
  }

  function ensureSbFriendTipEl() {
    let tip = document.getElementById("sbFriendTip");
    if (tip) return tip;
    tip = document.createElement("div");
    tip.id = "sbFriendTip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
    return tip;
  }
  function showSbFriendTip(chip) {
    if (!document.querySelector(".sidebar.collapsed")) return;
    const text = chip.dataset.tooltip || chip.dataset.friendName || "";
    if (!text) return;
    const tip = ensureSbFriendTipEl();
    tip.textContent = text;
    const rect = chip.getBoundingClientRect();
    // Position 10px to the right of the chip, vertically centered on it
    tip.style.left = (rect.right + 10) + "px";
    tip.style.top  = (rect.top + rect.height / 2 - 14) + "px";
    tip.classList.add("is-open");
  }
  function hideSbFriendTip() {
    const tip = document.getElementById("sbFriendTip");
    if (tip) tip.classList.remove("is-open");
  }

  function renderFriendsList() {
    const list = $("stgFriendsList");
    const count = $("stgFriendsCount");
    if (!list) return;
    if (count) count.textContent = state.friends.length;

    if (!state.friends.length) {
      list.innerHTML = `
        <div class="fp-empty">
          <div class="fp-empty-icon"><span class="icon icon-user icon-14"></span></div>
          <div class="fp-empty-title">${t("friendsEmpty")}</div>
          <div class="fp-empty-sub">${t("friendsEmptySub")}</div>
        </div>`;
      return;
    }

    const search = ($("fpSearch")?.value || "").trim().toLowerCase();
    const filtered = search
      ? state.friends.filter(f => (_shortName(f.displayName, f.uid)).toLowerCase().includes(search))
      : state.friends;

    if (!filtered.length) {
      list.innerHTML = `<div class="fp-empty fp-empty--mini">${t("noMatch")}</div>`;
      return;
    }

    list.innerHTML = filtered.map(f => {
      const initials = (f.displayName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
      const color = friendColor(f);
      const fg = readableTextOn(color);
      const date = f.addedAt ? timeAgo(f.addedAt.seconds ? f.addedAt.seconds * 1000 : f.addedAt) : "";
      return `<div class="fp-friend" data-uid="${esc(f.uid)}" data-name="${esc(_shortName(f.displayName, f.uid))}" data-color="${esc(color)}">
        ${avatarMarkup(f, "fp-friend-avatar")}
        <div class="fp-friend-main">
          <div class="fp-friend-name">${esc(_shortName(f.displayName, f.uid))}</div>
          <div class="fp-friend-date">${date ? t("friendAddedOn", { date }) : ""}</div>
        </div>
        <div class="fp-friend-actions">
          <button class="fp-friend-btn fp-friend-view" data-action="view" title="${t('friendViewInv')}">
            <span class="icon icon-eye-on icon-13"></span>
          </button>
          <button class="fp-friend-btn fp-friend-remove" data-action="remove" title="${t('friendRemove')}">
            <span class="icon icon-trash icon-13"></span>
          </button>
        </div>
      </div>`;
    }).join("");

    // Click on the row body switches to that friend's inventory
    list.querySelectorAll(".fp-friend").forEach(row => {
      row.addEventListener("click", e => {
        if (e.target.closest("[data-action='remove']")) return;
        switchToFriendView(row.dataset.uid, row.dataset.name, row.dataset.color);
      });
    });
    list.querySelectorAll(".fp-friend-remove").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const row = btn.closest(".fp-friend");
        await removeFriend(row.dataset.uid);
        renderFriendsList();
      });
    });
    list.querySelectorAll(".fp-friend-view").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = btn.closest(".fp-friend");
        switchToFriendView(row.dataset.uid, row.dataset.name, row.dataset.color);
      });
    });
  }

  // Extract avatar color from a userProfiles document (single `color` hex field).
  function profileColor(data) {
    return data.color || null;
  }
  // Fallback color when no profile color is available.
  function friendColorFallback(uid) {
    return `hsl(${Math.abs(uid.split("").reduce((a,c) => a+c.charCodeAt(0), 0)) % 360}, 55%, 50%)`;
  }
  // Resolve the display color for a friend object (uses stored color, falls back to hash).
  function friendColor(f) {
    return f.color || friendColorFallback(f.uid);
  }

  // Compute a readable text color (black or white) for any CSS background
  // colour string. Uses a 1×1 canvas to coerce the input through the browser's
  // colour parser, then applies WCAG relative luminance. Returns "#1a1a1a"
  // for light backgrounds (white initials would be invisible) and "#fff" for
  // dark ones. Cached because the canvas hop is ~0.1 ms but we call it on
  // every render of the friends list.
  const _readableCache = new Map();
  function readableTextOn(bg) {
    if (!bg) return "#fff";
    const cached = _readableCache.get(bg);
    if (cached) return cached;
    let result = "#fff";
    try {
      const c = document.createElement("canvas");
      c.width = 1; c.height = 1;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000";          // reset, in case `bg` is rejected
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      // sRGB relative luminance (WCAG). Threshold ~0.6 puts pure orange
      // (#ff7a18, lum ≈ 0.42) on white initials, and #ffb056 (lum ≈ 0.74)
      // and pure white on dark initials — the cutoff most users expect.
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      result = lum > 0.6 ? "#1a1a1a" : "#fff";
    } catch { /* fall back to white */ }
    _readableCache.set(bg, result);
    return result;
  }

  // Load friends list from Firestore, then sync displayName + avatar color from userProfiles
  // (userProfiles/{uid} is the live source of truth for public profile data).
  async function loadFriendsList() {
    const user = fbAuth().currentUser;
    if (!user) return;
    const uid = user.uid;
    try {
      const db = fbDb(uid);   // use named instance — safe even if active account changes during await
      const snap = await db.collection("users").doc(uid).collection("friends").get();
      const friends = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

      // Fetch current public profiles in parallel
      const profileSnaps = await Promise.all(
        friends.map(f => db.collection("userProfiles").doc(f.uid).get().catch(() => null))
      );

      // Batch-update stale fields in our friends sub-collection (fire-and-forget)
      const batch = db.batch();
      let batchDirty = false;

      friends.forEach((f, i) => {
        const ps = profileSnaps[i];
        if (!ps || !ps.exists) return;
        const pd = ps.data();
        const liveDisplayName = pd.displayName || "";
        const liveColor       = profileColor(pd);   // "#rrggbb" or null
        const updates = {};

        if (liveDisplayName && liveDisplayName !== f.displayName) {
          f.displayName = liveDisplayName;
          updates.displayName = liveDisplayName;
        }
        if (liveColor && liveColor !== f.color) {
          f.color = liveColor;
          updates.color = liveColor;
        } else if (liveColor) {
          f.color = liveColor;   // always apply in-memory even if already stored
        }
        // Custom avatar URL. Stored ONLY in memory — denormalising the
        // download URL into our friends sub-collection would mean every
        // avatar change needs to fan-out to every friend's friend doc,
        // and the URL has a rotating token anyway. Cheap to refresh from
        // userProfiles on every friends-list load.
        const livePhoto = pd.photoURL || null;
        if (livePhoto !== (f.photoURL || null)) {
          f.photoURL = livePhoto;
        }

        if (Object.keys(updates).length) {
          batch.update(
            db.collection("users").doc(uid).collection("friends").doc(f.uid),
            updates
          );
          batchDirty = true;
        }
      });

      if (batchDirty) batch.commit().catch(() => {});

      // Guard: only update UI if this is still the active account
      if (uid !== state.activeAccountId) return;

      state.friends = friends;
      // Cache the friends list (with each friend's denormalised
      // displayName, color, photoURL) to localStorage. On the next
      // app open, `_hydrateFriendsCache` restores state.friends
      // SYNCHRONOUSLY before the first paint — same Discord-style
      // pattern as the user's own photoURL. No flicker between "no
      // friends yet" and "friends loaded".
      try {
        const minimal = friends.map(f => ({
          uid: f.uid, displayName: f.displayName || "",
          color: f.color || null, photoURL: f.photoURL || null,
        }));
        Cache.write("friends", uid, minimal);
      } catch (_) { /* quota / privacy mode — silent */ }

      renderFriendsList();
      // Refresh everywhere friends are shown
      renderAccountDropdown();
      if ($("profilesModalOverlay").classList.contains("open")) renderAccountList();
    } catch (e) { console.warn("[friends]", e.message); }
  }

  // Synchronous hydration of state.friends from the localStorage cache,
  // called from setConnected so the first render of the dropdown +
  // sidebar friend chips already has every friend (with their
  // displayName + photoURL). loadFriendsList runs after and pushes any
  // delta from Firestore.
  function _hydrateFriendsCache(uid) {
    if (!uid) return;
    const cached = Cache.read("friends", uid);
    if (Array.isArray(cached)) state.friends = cached;
  }

  /* ── Racks (storage shelves) ───────────────────────────────────────────── */
  function subscribeRacks(uid) {
    unsubscribeRacks();
    // No orderBy — Firestore would silently filter out docs without the field.
    // We sort client-side instead by `order` (fallback createdAt) for stability.
    state.unsubRacks = fbDb(uid)
      .collection("users").doc(uid).collection("racks")
      .onSnapshot(snap => {
        if (uid !== state.activeAccountId) return;
        // Same defense-in-depth as the inventory listener: an in-flight
        // snapshot can land after we've entered friend-view; ignoring it
        // keeps the friend's (one-shot) racks visible without the owner's
        // racks bleeding back in.
        if (state.friendView) return;
        const racks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        racks.sort((a, b) => {
          const oa = a.order ?? 999, ob = b.order ?? 999;
          if (oa !== ob) return oa - ob;
          const ta = a.createdAt?.seconds || 0;
          const tb = b.createdAt?.seconds || 0;
          return ta - tb;
        });
        state.racks = racks;
        console.log(`[racks] snapshot: ${racks.length} rack(s)`, racks.map(r => r.name));
        renderRacksList();
        scheduleStudioStateRecord();  // re-arm deferred telemetry (rack counts changed)
      }, err => console.warn("[racks]", err.code, err.message));
  }
  function unsubscribeRacks() {
    if (state.unsubRacks) { state.unsubRacks(); state.unsubRacks = null; }
  }

  /* ── Scales — subscribeScales / unsubscribeScales / renderScalesPanel /
     renderScaleHealth are imported from renderer/IoT/tigerscale/index.js.
     initTigerScale(ctx) is called during DOM setup (see above). */

  /* ── 3D Printers (per-brand subcollections) ─────────────────────────────
     Path: users/{uid}/printers/{brand}/devices/{deviceId}.
     There is no parent brand doc to enumerate, so we subscribe in parallel
     to one onSnapshot listener per known brand. State is rebuilt by the
     mergeBrandSnap callback so a snapshot for any brand updates only that
     brand's slice while preserving the others.
     See docs/03-data-model.md → users/{uid}/printers/{brand}/devices.       */
  const PRINTER_BRANDS = ["bambulab", "creality", "elegoo", "flashforge", "snapmaker", "anycubic"];

  function subscribePrinters(uid) {
    unsubscribePrinters();
    // Per-brand cache keyed by brand id; flattened into state.printers on every snapshot.
    const cache = Object.fromEntries(PRINTER_BRANDS.map(b => [b, []]));
    // Track which Elegoo printer keys are currently auto-connected so we can
    // detect deletions and tear down the MQTT session cleanly.
    const _elegooAutoKeys = new Set();
    // Same pattern for Bambu Lab — always-on MQTT so the card status badge is
    // live even without opening the sidecard. Camera is NOT started here; it is
    // started only when the sidecard opens (bambuConnect called without skipCam).
    const _bambuAutoKeys = new Set();
    // Same for Anycubic — always-on MQTT to the printer's local broker.
    const _acuAutoKeys = new Set();
    state._printerCache = cache;
    // Loading flag — flipped to false the FIRST time any brand listener
    // emits a snapshot (cached or live). Tracking per-brand "first
    // snapshot received" lets the empty state appear only once Firestore
    // has actually answered for every brand, instead of flickering as
    // brands trickle in. We also re-render once on flip so the spinner
    // fades to either the empty card or the printer grid.
    state.printersLoading = true;
    // Mirror the inventory pattern: trigger an immediate re-render so the
    // spinner appears the moment the subscription is fired, without
    // waiting for the first Firestore snapshot to round-trip. Otherwise
    // a fresh login lands on whatever stale content was in the host
    // (often the empty card from a previous session) until snapshots
    // populate, and the user never sees the loading state.
    if (_isPrinterMode(state.viewMode)) renderPrintersView();
    const firstSnapSeen = Object.fromEntries(PRINTER_BRANDS.map(b => [b, false]));
    state.unsubPrinters = PRINTER_BRANDS.map(brand => {
      return fbDb(uid)
        .collection("users").doc(uid)
        .collection("printers").doc(brand)
        .collection("devices")
        .onSnapshot(snap => {
          if (uid !== state.activeAccountId) return;
          if (state.friendView) return;
          // Mark this brand as "answered" — if all five have, drop the loading flag.
          if (!firstSnapSeen[brand]) {
            firstSnapSeen[brand] = true;
            if (Object.values(firstSnapSeen).every(Boolean)) {
              state.printersLoading = false;
            }
          }
          cache[brand] = snap.docs.map(d => {
            const data = d.data();
            // `updatedAt` is now written via serverTimestamp() — but legacy
            // docs from earlier versions may still hold a number (Unix ms).
            // Coerce to ms here once so timeAgo / fmtMs can stay simple.
            let updatedAtMs = data.updatedAt;
            if (updatedAtMs && typeof updatedAtMs === "object") {
              if (typeof updatedAtMs.toMillis === "function") updatedAtMs = updatedAtMs.toMillis();
              else if (updatedAtMs.seconds != null) updatedAtMs = updatedAtMs.seconds * 1000 + Math.round((updatedAtMs.nanoseconds || 0) / 1e6);
              else updatedAtMs = null;
            }
            return { id: d.id, brand, ...data, updatedAt: updatedAtMs };
          });
          // Flatten + sort by sortIndex (user-defined drag order), then by
          // printerName as a stable tie-breaker so unsorted items don't jitter.
          // sortIndex is now the primary signal — Active no longer pulls
          // cards to the top, the user owns the ordering.
          const all = [].concat(...PRINTER_BRANDS.map(b => cache[b]));
          all.sort((a, b) => {
            const sa = Number.isFinite(a.sortIndex) ? a.sortIndex : Number.MAX_SAFE_INTEGER;
            const sb = Number.isFinite(b.sortIndex) ? b.sortIndex : Number.MAX_SAFE_INTEGER;
            if (sa !== sb) return sa - sb;
            return String(a.printerName || "").localeCompare(String(b.printerName || ""));
          });
          state.printers = all;
          scheduleStudioStateRecord();  // re-arm deferred telemetry (printer count changed)
          // Elegoo: maintain persistent MQTT connections in the background so
          // the card status badge is always live, even without opening the sidecard.
          // Only connect when no connection exists yet, or when the IP changed.
          // Disconnect printers that have been removed from Firestore.
          {
            const elegooNow = all.filter(p => p.brand === 'elegoo' && p.ip);
            const elegooNowKeys = new Set(elegooNow.map(p => elegooKey(p)));
            for (const key of _elegooAutoKeys) {
              if (!elegooNowKeys.has(key)) { elegooDisconnect(key); _elegooAutoKeys.delete(key); }
            }
            for (const p of elegooNow) {
              const key = elegooKey(p);
              const conn = elegooGetConn(key);
              // Connect when: no conn yet, OR IP changed (forces a fresh attempt).
              // Skip if already connected/connecting with the same IP, if the
              // previous attempt was abandoned (bad IP), or if the user explicitly
              // disconnected via the sidecard button (forced-offline).
              if ((!conn || conn.ip !== p.ip) && !_ppForcedOfflineKeys.has(key)) {
                elegooConnect(p);
                _elegooAutoKeys.add(key);
              }
            }
          }
          // Bambu Lab: same always-on MQTT pattern — camera skipped here,
          // started only when the sidecard opens.
          {
            const bambuNow = all.filter(p => p.brand === 'bambulab' && (p.broker || p.ip));
            const bambuNowKeys = new Set(bambuNow.map(p => bambuKey(p)));
            for (const key of _bambuAutoKeys) {
              if (!bambuNowKeys.has(key)) { bambuDisconnect(key); _bambuAutoKeys.delete(key); }
            }
            for (const p of bambuNow) {
              const key = bambuKey(p);
              const conn = bambuGetConn(key);
              // Connect when: no conn yet, OR IP changed.
              const ip = p.broker || p.ip || "";
              if (!conn || conn.ip !== ip) {
                bambuConnect(p, { skipCam: true });
                _bambuAutoKeys.add(key);
              }
            }
          }
          // Anycubic: same always-on MQTT pattern (no camera to skip).
          {
            const acuNow = all.filter(p => p.brand === 'anycubic' && (p.ip || p.mode === 'cloud'));
            const acuNowKeys = new Set(acuNow.map(p => acuKey(p)));
            for (const key of _acuAutoKeys) {
              if (!acuNowKeys.has(key)) { acuDisconnect(key); _acuAutoKeys.delete(key); }
            }
            for (const p of acuNow) {
              const key = acuKey(p);
              const conn = acuGetConn(key);
              if ((!conn || conn.ip !== p.ip) && !_ppForcedOfflineKeys.has(key)) {
                acuConnect(p, { skipCam: true });
                _acuAutoKeys.add(key);
              }
            }
          }
          if (_isPrinterMode(state.viewMode)) {
            // In cam mode, patch CSS/order only — never rebuild DOM so live
            // iframe/WebRTC streams survive Firestore echoes (e.g. camSize writes).
            if (state.viewMode === "printer-cam") _patchCamWall();
            else renderPrintersView();
          }
          // Live-update an open detail panel if it shows one of the changed docs
          if ($("printerPanel")?.classList.contains("open")) refreshOpenPrinterDetail();
        }, err => console.warn(`[printers/${brand}]`, err.code, err.message));
    });
  }

  function unsubscribePrinters() {
    if (Array.isArray(state.unsubPrinters)) {
      for (const fn of state.unsubPrinters) { try { fn(); } catch (_) {} }
    }
    state.unsubPrinters = [];
    state._printerCache = null;
    // Mirror the inventory model: when no subscription is active we're
    // not "loading", we just have nothing to show. The flag is flipped
    // back to true on the next subscribePrinters() call.
    state.printersLoading = false;
    // Tear down all background Elegoo MQTT connections — they persist across
    // sidecard open/close but must stop when the session ends (logout / switch).
    (state.printers || []).filter(p => p.brand === 'elegoo').forEach(p => {
      try { elegooDisconnect(elegooKey(p)); } catch (_) {}
    });
    // Same for Bambu Lab — full disconnect (MQTT + camera).
    (state.printers || []).filter(p => p.brand === 'bambulab').forEach(p => {
      try { bambuDisconnect(bambuKey(p)); } catch (_) {}
    });
    // Same for Anycubic — close the local-broker MQTT sessions.
    (state.printers || []).filter(p => p.brand === 'anycubic').forEach(p => {
      try { acuDisconnect(acuKey(p)); } catch (_) {}
    });
    // Close any open printer detail panel — its data belonged to the
    // outgoing account/session.
    if ($("printerPanel")?.classList.contains("open")) {
      try { closePrinterDetail(); } catch (_) {}
    }
  }

  /* ── Brand metadata for display (label + accent color + connection hint) ── */
  // Brand metadata, form schemas and helper texts are now defined in
  // renderer/printers/{brand}/settings.js and registered via registerBrand().
  // These computed objects maintain the same shape so all downstream code
  // (openPrinterAddForm, renderPrintersView, etc.) works unchanged.
  const PRINTER_BRAND_META = Object.fromEntries([...brands].map(([id, b]) => [id, b.meta]));
  const PRINTER_ADD_SCHEMA = Object.fromEntries([...brands].map(([id, b]) => [id, b.schema]));
  const PRINTER_ADD_HELPER = Object.fromEntries([...brands].map(([id, b]) => [id, b.helper]));

  /**
   * Returns the current print job status for a printer, or null when idle.
   * Normalises progress to 0-100 across all brands.
   * @returns {{ state: string, pct: number } | null}
   */
  // States where a progress bar is meaningful (printer actively running a job).
  const _ACTIVE_STATES = new Set(["printing", "running", "paused", "heating", "preparing", "prepare", "leveling", "checking", "busy"]);

  function _getPrinterJob(p) {
    let d = null;
    if (p.brand === "snapmaker")  { const c = snapGetConn(snapKey(p));     if (c?.status === "connected") d = c.data; }
    if (p.brand === "flashforge") { const c = ffgGetConn(ffgKey(p));       if (c?.status === "connected") d = c.data; }
    if (p.brand === "creality")   { const c = creGetConn(creKey(p));       if (c?.status === "connected") d = c.data; }
    if (p.brand === "elegoo")     { const c = elegooGetConn(elegooKey(p)); if (c?.status === "connected") d = c.data; }
    if (p.brand === "bambulab")   { const c = bambuGetConn(bambuKey(p));   if (c?.status === "connected") d = c.data; }
    if (p.brand === "anycubic")   { const c = acuGetConn(acuKey(p));       if (c?.status === "connected") d = c.data; }
    if (!d) return null;

    // Normalize state across brands (Creality uses numeric state field)
    const state = p.brand === "creality"
      ? (d.state === 1 ? "printing" : d.state === 2 ? "complete" : "idle")
      : ((d.printState || "idle").toLowerCase());

    const isActive = _ACTIVE_STATES.has(state);

    // Progress normalised to 0–100
    let pct;
    if (p.brand === "elegoo")        pct = Math.round((d.printProgress || 0) * 100);
    else if (p.brand === "bambulab") pct = Math.round(d.progress || 0);
    else if (p.brand === "anycubic") pct = Math.round(d.progress || 0);
    else if (p.brand === "creality") pct = Math.round(d.printProgress || 0);
    else                             pct = Math.round((d.progress || 0) * 100);
    pct = Math.min(100, Math.max(0, pct));

    // Filename (brand-specific field name)
    const filename = (p.brand === "creality" ? d.printFileName : d.printFilename) || null;

    // Remaining time in seconds (normalised from brand-specific units)
    let remainSec = null;
    if (p.brand === "bambulab" && d.remainingTime > 0) remainSec = d.remainingTime * 60;
    else if (p.brand === "anycubic" && d.remainTime > 0)       remainSec = d.remainTime * 60;
    else if (p.brand === "elegoo"   && d.printRemainingMs > 0) remainSec = Math.round(d.printRemainingMs / 1000);
    else if (p.brand === "creality" && d.printLeftTime > 0)    remainSec = d.printLeftTime;

    return { state, pct, isActive, filename, remainSec };
  }

  function _fmtRemain(sec) {
    return snapFmtDuration(sec);
  }

  // Surgical patch: update only the .printer-card-job block inside each grid
  // card without replacing the card element itself. This lets clicks survive
  // live data ticks from brand WebSocket connections.
  // Per-card job signature → skip the outerHTML swap when the tick brought
  // no real change. Brand polls (FlashForge 2 s, Bambu pushall 5 s, Elegoo
  // 10 s, Snapmaker/Creality WS heartbeats) fire `_patchGridJobs` on every
  // tick, even when state/pct/remain/filename are identical to the previous
  // value — without this guard, the `.printer-card-job` block was destroyed
  // and rebuilt at every tick, flashing the progress bar / state pill /
  // filename on every card. Brand-agnostic: same guard helps all 5 brands.
  function _jobSignature(job) {
    if (!job) return "";
    return `${job.state}|${job.isActive ? 1 : 0}|${job.pct}|${job.remainSec ?? ""}|${job.filename ?? ""}`;
  }
  function _patchGridJobs() {
    if (!_isPrinterMode(state.viewMode)) return;
    state.printers.forEach(p => {
      const card = document.querySelector(`[data-printer-key="${esc(p.brand + ":" + p.id)}"]`);
      if (!card) return;
      const job = _getPrinterJob(p);
      const existing = card.querySelector(".printer-card-job");
      if (!job) {
        if (existing) { existing.remove(); card._lastJobSig = ""; }
        return;
      }
      const sig = _jobSignature(job);
      if (existing && card._lastJobSig === sig) return; // no real change, skip the rebuild
      card._lastJobSig = sig;
      const html = _jobCardHtml(job);
      if (existing) { existing.outerHTML = html; }
      else {
        const foot = card.querySelector(".printer-card-foot");
        if (foot) foot.insertAdjacentHTML("beforebegin", html);
      }
    });
  }

  // Table view: the job cell HTML. Shared by _renderPrinterTable (initial
  // build) and _patchTableJobs (live surgical update) so the two never drift.
  function _jobCellHtml(job) {
    if (!job) return `<span class="pt-job-idle">—</span>`;
    if (!job.isActive)
      return `<span class="snap-job-state snap-job-state--${esc(job.state)} snap-job-state--compact">${esc(t("snapState_" + job.state) || job.state)}</span>`;
    return `<div class="pt-job-bar"><span style="width:${job.pct}%"></span></div>
           <div class="pt-job-meta">
             <span class="snap-job-state snap-job-state--${esc(job.state)} snap-job-state--compact">${esc(t("snapState_" + job.state) || job.state)}</span>
             <span class="pt-job-pct">${job.pct}%${job.remainSec != null ? ` · ${esc(_fmtRemain(job.remainSec))}` : ""}</span>
           </div>${job.filename ? `<div class="pt-job-file">${esc(_truncFilename(job.filename))}</div>` : ""}`;
  }

  // Table-view counterpart to _patchGridJobs: surgically refresh just the
  // .pt-td--job cell of each row on a job update, so the table stays live
  // without a full renderPrintersView() rebuild (preserves sort + scroll).
  // The table <tr>s key off data-brand/data-id (not data-printer-key), which
  // is why _patchGridJobs alone never touched them.
  function _patchTableJobs() {
    if (state.viewMode !== "printer-table") return;
    state.printers.forEach(p => {
      const row = document.querySelector(`.pt-row[data-brand="${esc(p.brand)}"][data-id="${esc(p.id)}"]`);
      if (!row) return;
      const job = _getPrinterJob(p);
      const sig = _jobSignature(job);
      if (row._lastJobSig === sig) return; // no real change, skip the rewrite
      row._lastJobSig = sig;
      const td = row.querySelector(".pt-td--job");
      if (td) td.innerHTML = _jobCellHtml(job);
    });
  }

  // Table-view counterpart to _patchGridStatus: refresh each row's online dot,
  // status label, the Updated cell and the pt-row--online class in place. The
  // table is one flat sorted list (no CONNECTED/OFFLINE sections), so — unlike
  // the grid — a status change never needs a full rebuild; we patch the cells
  // and keep the existing sort order/scroll until the next render.
  function _patchTableStatus() {
    if (state.viewMode !== "printer-table") return;
    state.printers.forEach(p => {
      const row = document.querySelector(`.pt-row[data-brand="${esc(p.brand)}"][data-id="${esc(p.id)}"]`);
      if (!row) return;
      const online = _isPrinterOnline(p);
      const sig = `${online ? 1 : 0}|${p.updatedAt || 0}`;
      if (row._lastStatusSig === sig) return; // no real change, skip the rewrite
      row._lastStatusSig = sig;
      row.classList.toggle("pt-row--online", online);
      const st = row.querySelector(".pt-td--status");
      if (st) st.innerHTML =
        `<span class="pt-dot${online ? " pt-dot--on" : ""}"></span>
            ${esc(online ? t("snapStatusOnline") : t("snapStatusOffline"))}`;
      const up = row.querySelector(".pt-td--updated");
      if (up) up.textContent = p.updatedAt ? timeAgo(p.updatedAt) : "—";
    });
  }

  function _jobCardHtml(job) {
    const stateLabel = t("snapState_" + job.state) || job.state;
    const statePill = `<span class="snap-job-state snap-job-state--${esc(job.state)} snap-job-state--compact">${esc(stateLabel)}</span>`;
    if (!job.isActive) {
      return `<div class="printer-card-job printer-card-job--idle">${statePill}</div>`;
    }
    const fileHtml = job.filename
      ? `<div class="printer-card-job-file">${esc(_truncFilename(job.filename))}</div>`
      : "";
    return `<div class="printer-card-job">
      <div class="printer-card-job-bar"><span style="width:${job.pct}%"></span></div>
      <div class="printer-card-job-info">
        ${statePill}
        <span class="printer-card-job-right">${job.pct}%${job.remainSec != null ? ` · ${esc(_fmtRemain(job.remainSec))}` : ""}</span>
      </div>${fileHtml}
    </div>`;
  }

  function _truncFilename(f) {
    if (!f) return "";
    const base = f.split("/").pop().split("\\").pop();
    return base.length > 28 ? base.slice(0, 26) + "…" : base;
  }

  // Online check + badge HTML lifted out of renderPrintersView so the surgical
  // patch path (`_patchGridStatus`) can reuse them without rebuilding the
  // grid. Keeping these as module-scoped helpers also keeps `_makeCard`
  // single-source for badge rendering.
  function _isPrinterOnline(p) {
    if (p.brand === "snapmaker")  return snapIsOnline(p)   === true;
    if (p.brand === "flashforge") return ffgIsOnline(p)    === true;
    if (p.brand === "creality")   return creIsOnline(p)    === true;
    if (p.brand === "elegoo")     return elegooIsOnline(p) === true;
    if (p.brand === "bambulab")   return bambuIsOnline(p)  === true;
    if (p.brand === "anycubic")   return acuIsOnline(p)    === true;
    return false;
  }
  function _makeOnlineBadge(p) {
    if (p.brand === "flashforge") return renderFfgOnlineBadge(p, "card");
    if (p.brand === "creality")   return renderCreOnlineBadge(p, "card");
    if (p.brand === "bambulab")   return renderBambuOnlineBadge(p, "card");
    if (p.brand === "snapmaker")  return renderSnapOnlineBadge(p, "card");
    if (p.brand === "anycubic")   return renderAcuOnlineBadge(p, "card");
    if (p.brand === "elegoo") {
      const o = elegooIsOnline(p);
      const cls = o === true ? "is-online" : o === false ? "is-offline" : "is-checking";
      const lbl = o === true  ? t("snapStatusOnline")
                : o === false ? t("snapStatusOffline")
                :               t("snapStatusConnecting");
      return `<span class="printer-online printer-online--card ${cls}">
                <span class="printer-online-dot"></span>
                <span class="printer-online-lbl">${esc(lbl)}</span>
              </span>`;
    }
    return "";
  }

  // Signature of the current online set — used by `_patchGridStatus` to detect
  // when only the status badges need refreshing (no card needs to move between
  // the CONNECTED and OFFLINE sections, no new printer was added/removed).
  // Computed by joining sorted keys of the currently-online printers.
  let _lastPrinterGridSignature = "";
  function _printerGridSignature() {
    return state.printers
      .map(p => `${p.brand}:${p.id}:${_isPrinterOnline(p) ? 1 : 0}`)
      .sort()
      .join("|");
  }

  // Surgical refresh: swap the `.printer-online` badge inside each printer
  // card without touching the rest of the DOM (image, name, job block, foot).
  // Falls back to a full `renderPrintersView()` when the online set changed
  // (a card needs to move between CONNECTED and OFFLINE sections).
  function _patchGridStatus() {
    if (!_isPrinterMode(state.viewMode)) return;
    const sig = _printerGridSignature();
    if (sig !== _lastPrinterGridSignature) {
      _lastPrinterGridSignature = sig;
      renderPrintersView();
      return;
    }
    state.printers.forEach(p => {
      const card = document.querySelector(`[data-printer-key="${esc(p.brand + ":" + p.id)}"]`);
      if (!card) return;
      const badge = card.querySelector(".printer-online");
      if (!badge) return;
      badge.outerHTML = _makeOnlineBadge(p);
    });
  }

  /* ── Render the user's 3D printers in the main panel.
     Read-only listing — adding / editing / deleting printers happens in the
     mobile companion app. Sensitive fields (broker, password, ip, sn) are
     intentionally NEVER displayed; we project to the safe subset documented
     in docs/03-data-model.md → "If you only need to LIST printers".          */
  function renderPrintersView() {
    const host = $("invPrinterView");
    if (!host) return;

    // Friend view → print-friendly empty card (printers are owner-only via Firestore rules anyway)
    if (state.friendView) {
      host.innerHTML = `
        <div class="printers-empty-card">
          <span class="icon icon-printer icon-32"></span>
          <div class="printers-empty-title">${esc(t("printersFriendNATitle"))}</div>
          <div class="printers-empty-sub">${esc(t("printersFriendNASub"))}</div>
        </div>`;
      return;
    }

    // Loading — Firestore subscription is still warming up. We use the
    // same `.inv-loading` spinner the inventory view uses, just labelled
    // for printers. This avoids flashing the empty state while data
    // is on its way (cached snapshot can land in 50-100ms but a fresh
    // network round-trip can take several hundred ms).
    if (state.printersLoading && !state.printers.length) {
      host.innerHTML = `
        <div class="inv-loading printers-loading">
          <div class="inv-loading-spin"></div>
          <span>${esc(t("printersLoading") || t("invLoading"))}</span>
        </div>`;
      return;
    }

    if (!state.printers.length) {
      // Empty state — title + sub + 3 bullets explaining what printers
      // are for. Plus the same "Add a printer" call-to-action that
      // appears on the grid view, so a brand-new user has a one-click
      // path to their first printer right from the empty card.
      host.innerHTML = `
        <div class="printers-empty-card">
          <span class="icon icon-printer icon-32"></span>
          <div class="printers-empty-title">${esc(t("printersEmptyTitle"))}</div>
          <div class="printers-empty-sub">${esc(t("printersEmptySub"))}</div>
          <ul class="printers-empty-bullets">
            <li>${esc(t("printersEmptyBullet1"))}</li>
            <li>${esc(t("printersEmptyBullet2"))}</li>
            <li>${esc(t("printersEmptyBullet3"))}</li>
          </ul>
          <button type="button" class="adf-btn adf-btn--primary printers-empty-cta" id="printersEmptyAddBtn">
            <span class="icon icon-plus icon-13"></span>
            <span>${esc(t("printerAddTitle"))}</span>
          </button>
        </div>`;
      // Wire the CTA → same handler as the grid's "+" card.
      $("printersEmptyAddBtn")?.addEventListener("click", openPrinterBrandPicker);
      return;
    }

    // Sub-mode routing
    const _printerSub = state.viewMode === "printer-table" ? "table"
                      : state.viewMode === "printer-cam"   ? "cam"
                      : "grid";
    if (_printerSub === "table") { _renderPrinterTable(host); return; }
    if (_printerSub === "cam")   { _renderPrinterCam(host);   return; }

    // Auto-connect all printers so job status data is available in the grid.
    // All connect functions are idempotent — no-op if already connected or
    // connecting. Brand notify callbacks re-render the grid when data arrives.
    state.printers.forEach(p => {
      if (p.brand === "snapmaker"  && p.ip)               snapConnect(p);
      if (p.brand === "flashforge" && p.ip)               ffgConnect(p);
      if (p.brand === "creality"   && p.ip)               creConnect(p);
      if (p.brand === "bambulab"   && (p.broker || p.ip)) bambuConnect(p, { skipCam: true });
      if (p.brand === "elegoo" && !_ppForcedOfflineKeys.has(elegooKey(p))) elegooConnect(p);
      if (p.brand === "anycubic" && (p.ip || p.mode === "cloud") && !_ppForcedOfflineKeys.has(acuKey(p))) acuConnect(p, { skipCam: true });
    });

    // Helper: is this printer currently online? Returns boolean (false = offline or unknown).
    // Uses last-known status from each brand's connection map — no new network round-trip.
    const _isOnline = p => _isPrinterOnline(p);

    // Partition into connected / offline while preserving each group's sortIndex order.
    const _onlineList  = state.printers.filter(p =>  _isOnline(p));
    const _offlineList = state.printers.filter(p => !_isOnline(p));
    const _showSections = _onlineList.length > 0 && _offlineList.length > 0;
    // Render order: online first, then offline. Within each group, sortIndex is preserved.
    const _orderedPrinters = [..._onlineList, ..._offlineList];

    // One flat grid — all brands mixed, ordered strictly by user-defined
    // sortIndex (set via drag & drop). Each card carries its brand pill so
    // multi-brand inventories remain visually distinguishable without
    // forcing brand sections that fight the user's preferred order.
    const _makeCard = p => {
      const meta      = PRINTER_BRAND_META[p.brand] || { label: p.brand, accent: "#888", connection: "" };
      const modelName = printerModelName(p.brand, p.printerModelId);
      const imgUrl    = printerImageUrlFor(p.brand, p.printerModelId);
      const safeName  = esc(p.printerName || modelName);
      const updated   = p.updatedAt ? timeAgo(p.updatedAt) : "";
      // The thumbnail uses object-fit: contain so the printer photo always
      // shows in full. Falls back to the per-brand `no_printer.png` placeholder
      // (declared in every brand catalog as id "0") when modelId is missing.
      const fallback  = printerImageUrl(findPrinterModel(p.brand, "0"));
      const imgSrc    = imgUrl || fallback || "";
      // Trigger an HTTP ping for Snapmaker printers so the online dot
      // becomes accurate within ~2s of opening the printer view.
      if (p.brand === "snapmaker" && p.ip) snapPingPrinter(p);
      // Same for FlashForge — fires a 2.5s POST /detail probe.
      if (p.brand === "flashforge" && p.ip) ffgPingPrinter(p);
      // Same for Creality — opens a brief WS to port 9999.
      if (p.brand === "creality"   && p.ip) crePingPrinter(p);
      const onlineBadge = _makeOnlineBadge(p);
      return `
        <div class="printer-card${p.isActive ? " printer-card--active" : ""}"
             data-brand="${esc(p.brand)}" data-id="${esc(p.id)}"
             data-printer-key="${esc(`${p.brand}:${p.id}`)}"
             draggable="true">
          <div class="printer-card-drag" title="${esc(t("printerDragHint"))}" aria-hidden="true">
            <span class="printer-card-drag-dots"></span>
          </div>
          ${imgSrc ? `<div class="printer-card-thumb"><img src="${esc(imgSrc)}" alt="${esc(modelName)}" onerror="this.style.opacity='.15'"/></div>` : ""}
          <div class="printer-card-head">
            <span class="printer-brand-pill" style="--brand-accent:${meta.accent}">${esc(meta.label)}</span>
            ${p.isActive ? `<span class="printer-active-badge">${esc(t("printersActive"))}</span>` : ""}
          </div>
          <div class="printer-card-name">${safeName}</div>
          ${(() => { const job = _getPrinterJob(p); return job ? _jobCardHtml(job) : ""; })()}
          ${onlineBadge}
          <div class="printer-card-foot">
            <span class="printer-card-conn">${esc(p.mode === "cloud" ? t("printerConnCloud") : meta.connection)}</span>
            ${updated ? `<span class="printer-card-updated">${esc(t("printersUpdated"))} · ${esc(updated)}</span>` : ""}
          </div>
        </div>`;
    };

    // Assemble grid HTML: section headers only when both groups are non-empty.
    const _hdrOnline  = `<div class="printers-section-hdr">${esc(t("printersSectionOnline"))}</div>`;
    const _hdrOffline = `<div class="printers-section-hdr printers-section-hdr--offline">${esc(t("printersSectionOffline"))}</div>`;
    const cards = _showSections
      ? _hdrOnline  + _onlineList.map(_makeCard).join("")
      + _hdrOffline + _offlineList.map(_makeCard).join("")
      : _orderedPrinters.map(_makeCard).join("");

    // Trailing "+" card so users can add a new printer directly from the
    // grid. The card itself isn't draggable / sortable — it's a fixed
    // affordance that always sits at the end of the flex flow.
    const addCard = `
      <button type="button" class="printer-card printer-card--add" id="printerAddCard">
        <span class="printer-add-plus"><span class="icon icon-plus icon-18"></span></span>
        <span class="printer-add-title">${esc(t("printerAddTitle"))}</span>
        <span class="printer-add-sub">${esc(t("printerAddSub"))}</span>
      </button>`;

    host.innerHTML = `
      <div class="printers-header">
        <div class="printers-header-text">
          <h3 class="printers-h3">${esc(t("printersTitle"))}</h3>
          <p class="printers-sub">${esc(t("printersSub", { n: state.printers.length }))}</p>
        </div>
      </div>
      <div class="printers-grid printers-grid--flex">${cards}${addCard}</div>`;

    wirePrinterDnd(host);
    // Snapshot the online set so the next surgical patch can detect whether
    // a card needs to move between sections.
    _lastPrinterGridSignature = _printerGridSignature();
    // Seed each card's job signature so the first `_patchGridJobs` tick after
    // a full rebuild can short-circuit when nothing actually changed
    // (otherwise it would outerHTML-swap the job block once for no reason).
    state.printers.forEach(p => {
      const card = host.querySelector(`[data-printer-key="${esc(p.brand + ":" + p.id)}"]`);
      if (card) card._lastJobSig = _jobSignature(_getPrinterJob(p));
    });
  }

  // ── Printer table sub-view ───────────────────────────────────────────────
  function _renderPrinterTable(host) {
    // Auto-connect so _getPrinterJob() has live data (idempotent)
    state.printers.forEach(p => {
      if (p.brand === "snapmaker"  && p.ip)               snapConnect(p);
      if (p.brand === "flashforge" && p.ip)               ffgConnect(p);
      if (p.brand === "creality"   && p.ip)               creConnect(p);
      if (p.brand === "bambulab"   && (p.broker || p.ip)) bambuConnect(p, { skipCam: true });
      if (p.brand === "elegoo" && !_ppForcedOfflineKeys.has(elegooKey(p))) elegooConnect(p);
      if (p.brand === "anycubic" && (p.ip || p.mode === "cloud") && !_ppForcedOfflineKeys.has(acuKey(p))) acuConnect(p, { skipCam: true });
    });

    const _isOnline = p => {
      if (p.brand === "snapmaker")  return snapIsOnline(p)   === true;
      if (p.brand === "flashforge") return ffgIsOnline(p)    === true;
      if (p.brand === "creality")   return creIsOnline(p)    === true;
      if (p.brand === "elegoo")     return elegooIsOnline(p) === true;
      if (p.brand === "bambulab")   return bambuIsOnline(p)  === true;
      if (p.brand === "anycubic")   return acuIsOnline(p)    === true;
      return false;
    };

    // ── Sort ────────────────────────────────────────────────────────────
    const col = state.printerSortCol;
    const dir = state.printerSortDir === "asc" ? 1 : -1;
    const sorted = [...state.printers].sort((a, b) => {
      if (!col) return 0;
      const metaA = PRINTER_BRAND_META[a.brand] || { label: a.brand };
      const metaB = PRINTER_BRAND_META[b.brand] || { label: b.brand };
      let va, vb;
      if (col === "brand")   { va = metaA.label;                        vb = metaB.label; }
      if (col === "name")    { va = (a.printerName || "").toLowerCase(); vb = (b.printerName || "").toLowerCase(); }
      if (col === "model")   { va = printerModelName(a.brand, a.printerModelId).toLowerCase();
                               vb = printerModelName(b.brand, b.printerModelId).toLowerCase(); }
      if (col === "ip")      { va = a.ip || a.broker || "";              vb = b.ip || b.broker || ""; }
      if (col === "status")  { va = _isOnline(a) ? 1 : 0;               vb = _isOnline(b) ? 1 : 0; }
      if (col === "job")     { va = (_getPrinterJob(a)?.pct ?? -1);      vb = (_getPrinterJob(b)?.pct ?? -1); }
      if (col === "updated") { va = a.updatedAt || 0;                    vb = b.updatedAt || 0; }
      if (va === undefined)  return 0;
      return va < vb ? -dir : va > vb ? dir : 0;
    });

    // ── Helper: header cell with sort arrow ──────────────────────────────
    const th = (label, key) => {
      const active = col === key;
      const arrow  = active ? (state.printerSortDir === "asc" ? "sort-asc" : "sort-desc") : "";
      return `<th class="pt-th pt-th--sort${arrow ? ` ${arrow}` : ""}" data-pt-sort="${key}">${label}</th>`;
    };

    // ── Rows ─────────────────────────────────────────────────────────────
    const rows = sorted.map(p => {
      const meta    = PRINTER_BRAND_META[p.brand] || { label: p.brand, accent: "#888" };
      const model   = printerModelName(p.brand, p.printerModelId);
      const online  = _isOnline(p);
      const updated = p.updatedAt ? timeAgo(p.updatedAt) : "—";
      const imgSrc  = printerImageUrlFor(p.brand, p.printerModelId)
                   || printerImageUrl(findPrinterModel(p.brand, "0"))
                   || "";
      const job     = _getPrinterJob(p);
      const jobCell = _jobCellHtml(job);
      return `
        <tr class="pt-row${online ? " pt-row--online" : ""}"
            data-brand="${esc(p.brand)}" data-id="${esc(p.id)}">
          <td class="pt-td pt-td--thumb">
            ${imgSrc ? `<img class="pt-thumb" src="${esc(imgSrc)}" onerror="this.style.opacity='.12'" />` : ""}
          </td>
          <td class="pt-td pt-td--brand">
            <span class="printer-brand-pill" style="--brand-accent:${esc(meta.accent)}">${esc(meta.label)}</span>
          </td>
          <td class="pt-td pt-td--name">${esc(p.printerName || "(unnamed)")}</td>
          <td class="pt-td pt-td--model">${esc(model)}</td>
          <td class="pt-td pt-td--ip"><code>${esc(p.ip || p.broker || "—")}</code></td>
          <td class="pt-td pt-td--status">
            <span class="pt-dot${online ? " pt-dot--on" : ""}"></span>
            ${esc(online ? t("snapStatusOnline") : t("snapStatusOffline"))}
          </td>
          <td class="pt-td pt-td--job">${jobCell}</td>
          <td class="pt-td pt-td--updated">${esc(updated)}</td>
        </tr>`;
    }).join("");

    host.innerHTML = `
      <div class="pt-wrap">
        <table class="pt-table">
          <thead class="pt-head">
            <tr>
              <th class="pt-th pt-th--thumb"></th>
              ${th("Brand",   "brand")}
              ${th("Name",    "name")}
              ${th("Model",   "model")}
              ${th("IP",      "ip")}
              ${th("Status",  "status")}
              ${th("Job",     "job")}
              ${th("Updated", "updated")}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    // ── Wire sort clicks ──────────────────────────────────────────────────
    host.querySelectorAll("[data-pt-sort]").forEach(thEl => {
      thEl.addEventListener("click", () => {
        const key = thEl.dataset.ptSort;
        if (state.printerSortCol === key) {
          state.printerSortDir = state.printerSortDir === "asc" ? "desc" : "asc";
        } else {
          state.printerSortCol = key;
          state.printerSortDir = "asc";
        }
        _renderPrinterTable(host);
      });
    });

  }

  // ── Serialize online cameras for the detached cam window ────────────────
  // Returns an array of CamDescriptor objects understood by renderer/cam/cam.js.
  function _serializeCamerasForDetach() {
    return state.printers.flatMap(p => {
      const name = p.printerName || "(unnamed)";
      if (p.brand === "snapmaker") {
        const conn = snapGetConn(snapKey(p));
        if (!conn || conn.status !== "connected" || !conn.ip) return [];
        return [{ brand: "snapmaker", id: p.id, name, camType: "iframe",
                  url: `http://${conn.ip}/webcam/webrtc`, bblKey: null, ip: null }];
      }
      if (p.brand === "creality") {
        const conn = creGetConn(creKey(p));
        if (!conn || conn.status !== "connected" || !conn.ip) return [];
        return [{ brand: "creality", id: p.id, name, camType: "webrtc",
                  ip: conn.ip, url: null, bblKey: null }];
      }
      if (p.brand === "flashforge") {
        const url = ffgCamBaseUrl(p);
        if (!url) return [];
        // FlashForge allows only ONE MJPEG client — the mux already holds that
        // connection. Use BroadcastChannel to relay frames from the mux to the
        // cam window without opening a second HTTP connection.
        return [{ brand: "flashforge", id: p.id, name, camType: "ffg_bc",
                  ffgKey: ffgKey(p), url: null, bblKey: null, ip: null }];
      }
      if (p.brand === "bambulab") {
        const conn = bambuGetConn(bambuKey(p));
        if (!conn || conn.status !== "connected") return [];
        return [{ brand: "bambulab", id: p.id, name, camType: "bbl_ipc",
                  bblKey: bambuKey(p), url: null, ip: null }];
      }
      if (p.brand === "anycubic") {
        const conn = acuGetConn(acuKey(p));
        if (!conn || conn.status !== "connected") return [];
        // Make sure the ffmpeg FLV stream is running — the detached window
        // only consumes frames, it can't start the stream itself.
        acuConnect(p);
        return [{ brand: "anycubic", id: p.id, name, camType: "acu_ipc",
                  acuKey: acuKey(p), url: null, bblKey: null, ip: null }];
      }
      if (p.brand === "elegoo") {
        const conn = elegooGetConn(elegooKey(p));
        if (!conn || conn.status !== "connected" || !p.ip) return [];
        const streamUrl = conn.data?.cameraUrl || `http://${p.ip}:8080/?action=stream`;
        return [{ brand: "elegoo", id: p.id, name, camType: "mjpeg",
                  url: streamUrl, bblKey: null, ip: null }];
      }
      return [];
    });
  }

  // ── Printer cam wall sub-view ────────────────────────────────────────────
  function _renderPrinterCam(host) {
    // ── Step 0: Kick connections — idempotent, always safe to call ────────────
    state.printers.forEach(p => {
      if (p.brand === "snapmaker"  && p.ip)               snapConnect(p);
      if (p.brand === "flashforge" && p.ip)               ffgConnect(p);
      if (p.brand === "creality"   && p.ip)               creConnect(p);
      if (p.brand === "bambulab"   && (p.broker || p.ip)) bambuConnect(p);
      if (p.brand === "elegoo" && !_ppForcedOfflineKeys.has(elegooKey(p))) elegooConnect(p);
      if (p.brand === "anycubic" && (p.ip || p.mode === "cloud") && !_ppForcedOfflineKeys.has(acuKey(p))) acuConnect(p);
    });

    // ── Step 1: Determine the set of online printers with an active cam feed ──
    const _isOnline = p => {
      if (p.brand === "snapmaker")  return snapIsOnline(p)   === true;
      if (p.brand === "flashforge") return ffgIsOnline(p)    === true;
      if (p.brand === "creality")   return creIsOnline(p)    === true;
      if (p.brand === "elegoo")     return elegooIsOnline(p) === true;
      if (p.brand === "bambulab")   return bambuIsOnline(p)  === true;
      if (p.brand === "anycubic")   return acuIsOnline(p)    === true;
      return false;
    };
    const _camOrdered = [...state.printers].sort((a, b) => {
      const sa = Number.isFinite(a.camSortIndex) ? a.camSortIndex : Number.MAX_SAFE_INTEGER;
      const sb = Number.isFinite(b.camSortIndex) ? b.camSortIndex : Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      const ga = Number.isFinite(a.sortIndex) ? a.sortIndex : Number.MAX_SAFE_INTEGER;
      const gb = Number.isFinite(b.sortIndex) ? b.sortIndex : Number.MAX_SAFE_INTEGER;
      return ga - gb;
    });

    // Compute cam HTML once per printer (filter + cache — avoids double call)
    const _camHtmlMap = new Map();
    const _onlinePrinters = _camOrdered.filter(p => {
      if (!_isOnline(p)) return false;
      const html = p.brand === "flashforge" ? renderFfgCamWallBanner(p) : renderCamBanner(p);
      if (!html) return false;
      _camHtmlMap.set(`${p.brand}:${p.id}`, html);
      return true;
    });

    // ── Step 2: Empty state ────────────────────────────────────────────────────
    if (!_onlinePrinters.length) {
      host.innerHTML = `
        <div class="printers-empty-card">
          <span class="icon icon-eye-on icon-32"></span>
          <div class="printers-empty-title">${esc(t("camWallEmptyTitle") || "No cameras online")}</div>
          <div class="printers-empty-sub">${esc(t("camWallEmptySub") || "Add a printer with a camera to see live feeds here.")}</div>
        </div>`;
      return;
    }

    // ── Step 3: Patch mode — same set of printers, no DOM rebuild needed ──────
    // When only camSize or camSortIndex changed (e.g. Firestore echo after a
    // size-button click or a DnD drop), updating CSS classes and style.order on
    // existing cards preserves live iframe/MJPEG streams completely.
    const existingWall = host.querySelector(".cam-wall");
    if (existingWall) {
      const existingKeys = new Set(
        Array.from(existingWall.querySelectorAll(".cam-wall-card"))
          .map(c => `${c.dataset.brand}:${c.dataset.id}`)
      );
      const newKeys = new Set(_onlinePrinters.map(p => `${p.brand}:${p.id}`));
      const sameSet = existingKeys.size === newKeys.size &&
                      [...newKeys].every(k => existingKeys.has(k));
      if (sameSet) {
        _onlinePrinters.forEach((p, idx) => {
          const card = existingWall.querySelector(
            `[data-brand="${p.brand}"][data-id="${p.id}"]`
          );
          if (!card) return;
          const csize = p.camSize || _camSizes.get(`${p.brand}:${p.id}`) || "1x";
          _applyCamSize(card, csize);
          card.style.order = idx;
        });
        return;
      }
    }

    // ── Step 4: Full rebuild ───────────────────────────────────────────────────
    // Only reached when the set of online printers changed (new connection,
    // disconnect, or first render). Stop MJPEG streams before replacing the DOM.
    try { ffgTearDownCamera(); } catch (_) {}
    state.printers.forEach(p => {
      if (p.brand === "flashforge") {
        const conn = ffgGetConn(ffgKey(p));
        if (conn) conn.camFailed = false;
      }
    });

    const _sizeBtn = (csize, s, label) => {
      const titles = { sm: t("camSizeCompact") || "Compact (½×)", "1x": t("camSizeNormal") || "Normal", "2x": t("camSizeWide") || "Wide (2×)", fs: t("camSizeFullscreen") || "Fullscreen" };
      return `<button class="cam-size-btn${csize === s ? " cam-size-btn--active" : ""}" data-size="${s}" title="${titles[s] || s}">${label}</button>`;
    };
    const fsIcon = `<svg width="9" height="9" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const camCards = _onlinePrinters.map((p, idx) => {
      const camHtml = _camHtmlMap.get(`${p.brand}:${p.id}`);
      const meta    = PRINTER_BRAND_META[p.brand] || { label: p.brand, accent: "#888" };
      const ckey    = `${p.brand}:${p.id}`;
      const csize   = p.camSize || _camSizes.get(ckey) || "1x";
      const sizeCls = csize === "sm" ? " cam-wall-card--sm" : csize === "2x" ? " cam-wall-card--2x" : csize === "fs" ? " cam-wall-card--fs" : "";
      // style.order is set explicitly so DnD can reorder via CSS without moving DOM nodes.
      return `
        <div class="cam-wall-card${sizeCls}" data-brand="${esc(p.brand)}" data-id="${esc(p.id)}" draggable="true" style="order:${idx}">
          <div class="cam-wall-card-head">
            <span class="printer-brand-pill" style="--brand-accent:${esc(meta.accent)}">${esc(meta.label)}</span>
            <span class="cam-wall-card-name">${esc(p.printerName || "(unnamed)")}</span>
            <div class="cam-size-btns">${_sizeBtn(csize,"sm","½×")}${_sizeBtn(csize,"1x","1×")}${_sizeBtn(csize,"2x","2×")}${_sizeBtn(csize,"fs",fsIcon)}</div>
          </div>
          ${camHtml}
        </div>`;
    });

    const detachBtn = window.electronAPI?.openCamWindow
      ? `<button class="cam-wall-detach-btn" id="camWallDetach" title="Open in separate window">
           <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
             <path d="M6 2H2a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V8M9 1h4m0 0v4m0-4L7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>
           Detach
         </button>`
      : "";
    host.innerHTML = `
      <div class="cam-wall-toolbar">${detachBtn}</div>
      <div class="cam-wall">${camCards.join("")}</div>`;

    host.querySelectorAll("[data-ffg-cam-key]").forEach(img => {
      const key = img.dataset.ffgCamKey;
      const p   = state.printers.find(x => ffgKey(x) === key);
      const url = p ? ffgCamBaseUrl(p) : null;
      if (url) { ffgMuxStart(key, url); ffgMuxRegister(key, img); }
    });

    // Start (or reuse) the Creality WebRTC connection for each online Creality card,
    // then register ALL .cre-cam-video elements in the new DOM as stream consumers.
    // reAttachCreCamConsumers() handles both the "first render" and the "came back
    // after navigating to table/grid" cases without reopening a peer connection.
    {
      const crePrinters = _onlinePrinters.filter(p => p.brand === "creality" && p.ip);
      if (crePrinters.length) {
        startCreCam(crePrinters[0].ip); // idempotent; re-attaches if already live
      }
      reAttachCreCamConsumers();
    }

    // Detach button — opens / focuses the standalone camera window
    host.querySelector("#camWallDetach")?.addEventListener("click", () => {
      const cameras = _serializeCamerasForDetach();
      window.electronAPI?.openCamWindow(cameras);
    });

    wireCamWallDnd(host);
  }

  /* ── Printer drag & drop reordering ────────────────────────────────────
     Uses the native HTML5 DnD API on each card. On drop we persist the
     new order to Firestore by writing a fresh `sortIndex` (0, 1, 2, …)
     to every card's doc — a Firestore batch keeps the rewrite atomic
     even across the 5 brand subcollections. Each printer's brand is
     known from its `brand` property, which we set when ingesting the
     snapshot, so the path resolution is local.                            */
  let _printerJustDragged = false;
  let _printerDragId = null; // composite "brand:id" of the card being dragged

  // Per-card size preferences for the cam wall: "1x" | "2x" | "fs".
  // Persisted in localStorage so the layout survives app restarts.
  const _camSizes = (() => {
    const m = new Map();
    try { Object.entries(JSON.parse(localStorage.getItem("tigertag.camSizes") || "{}")).forEach(([k, v]) => m.set(k, v)); } catch {}
    return m;
  })();
  function _saveCamSizes() {
    try { localStorage.setItem("tigertag.camSizes", JSON.stringify(Object.fromEntries(_camSizes))); } catch {}
  }
  function _applyCamSize(card, size) {
    card.classList.remove("cam-wall-card--sm", "cam-wall-card--2x", "cam-wall-card--fs");
    if (size === "sm") card.classList.add("cam-wall-card--sm");
    if (size === "2x") card.classList.add("cam-wall-card--2x");
    if (size === "fs") card.classList.add("cam-wall-card--fs");
    card.querySelectorAll(".cam-size-btn").forEach(b => b.classList.toggle("cam-size-btn--active", b.dataset.size === size));
  }

  // Lightweight cam-wall patch — updates only CSS (size + order) on existing
  // .cam-wall-card elements.  Never rebuilds DOM / destroys live streams.
  // Used in cam mode whenever a Firestore echo or brand status tick arrives so
  // changing one card's size does not reload the iframes/WebRTC of all others.
  // If the wall does not exist yet (first render / empty state), delegates to
  // renderPrintersView() so the initial build still happens correctly.
  function _patchCamWall() {
    const host = $("invPrinterView");
    if (!host) return;
    const wall = host.querySelector(".cam-wall");
    if (!wall) { renderPrintersView(); return; }

    const _camOrdered = [...state.printers].sort((a, b) => {
      const sa = Number.isFinite(a.camSortIndex) ? a.camSortIndex : Number.MAX_SAFE_INTEGER;
      const sb = Number.isFinite(b.camSortIndex) ? b.camSortIndex : Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      const ga = Number.isFinite(a.sortIndex) ? a.sortIndex : Number.MAX_SAFE_INTEGER;
      const gb = Number.isFinite(b.sortIndex) ? b.sortIndex : Number.MAX_SAFE_INTEGER;
      return ga - gb;
    });

    let orderIdx = 0;
    _camOrdered.forEach(p => {
      const card = wall.querySelector(`[data-brand="${p.brand}"][data-id="${p.id}"]`);
      if (!card) return; // not currently displayed — skip (structural changes are
                         // handled by the onPrinterStatusChange debounce)
      const csize = p.camSize || _camSizes.get(`${p.brand}:${p.id}`) || "1x";
      _applyCamSize(card, csize);
      card.style.order = orderIdx++;
    });
  }

  // Write-through helper: updates localStorage cache + DOM + Firestore atomically.
  function _setCamSize(card, size) {
    const ckey = `${card.dataset.brand}:${card.dataset.id}`;
    _camSizes.set(ckey, size);
    _saveCamSizes();
    _applyCamSize(card, size);
    const p = state.printers.find(x => `${x.brand}:${x.id}` === ckey);
    if (p) { p.camSize = size; persistCamSize(p, size); }
  }

  function wirePrinterDnd(host) {
    const cards = Array.from(host.querySelectorAll(".printer-card"));
    cards.forEach(card => {
      card.addEventListener("dragstart", e => {
        _printerDragId = `${card.dataset.brand}:${card.dataset.id}`;
        // dataTransfer is required on some browsers for the drag image to render.
        try { e.dataTransfer.setData("text/plain", _printerDragId); } catch (_) {}
        try { e.dataTransfer.effectAllowed = "move"; } catch (_) {}
        card.classList.add("printer-card--dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("printer-card--dragging");
        host.querySelectorAll(".printer-card--drop-before, .printer-card--drop-after")
            .forEach(el => el.classList.remove("printer-card--drop-before", "printer-card--drop-after"));
        _printerDragId = null;
        // Suppress the click that fires right after a drop; reset on next tick
        _printerJustDragged = true;
        setTimeout(() => { _printerJustDragged = false; }, 50);
      });
      card.addEventListener("dragover", e => {
        if (!_printerDragId) return;
        const me = `${card.dataset.brand}:${card.dataset.id}`;
        if (me === _printerDragId) return; // can't drop on self
        e.preventDefault();
        try { e.dataTransfer.dropEffect = "move"; } catch (_) {}
        // Choose before/after based on cursor position relative to the card center.
        const rect = card.getBoundingClientRect();
        const isVertical = rect.height > rect.width;
        const before = isVertical
          ? (e.clientY < rect.top + rect.height / 2)
          : (e.clientX < rect.left + rect.width / 2);
        card.classList.toggle("printer-card--drop-before", before);
        card.classList.toggle("printer-card--drop-after", !before);
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("printer-card--drop-before", "printer-card--drop-after");
      });
      card.addEventListener("drop", e => {
        if (!_printerDragId) return;
        const me = `${card.dataset.brand}:${card.dataset.id}`;
        if (me === _printerDragId) return;
        e.preventDefault();
        const before = card.classList.contains("printer-card--drop-before");
        card.classList.remove("printer-card--drop-before", "printer-card--drop-after");
        applyPrinterReorder(_printerDragId, me, before);
      });
    });
  }

  // Reorder state.printers by moving `dragId` next to `targetId`, then
  // persist the new sortIndex 0..N-1 to Firestore.
  function applyPrinterReorder(dragId, targetId, before) {
    const all = state.printers.slice();
    const find = id => all.findIndex(p => `${p.brand}:${p.id}` === id);
    const di = find(dragId);
    if (di < 0) return;
    const [moved] = all.splice(di, 1);
    let ti = find(targetId);
    if (ti < 0) return; // shouldn't happen
    if (!before) ti += 1;
    all.splice(ti, 0, moved);
    // Apply new sortIndex 0..N-1 in-memory so the next render is instant.
    all.forEach((p, idx) => { p.sortIndex = idx; });
    state.printers = all;
    renderPrintersView();
    persistPrinterSortIndices(all);
  }

  async function persistPrinterSortIndices(orderedPrinters) {
    const uid = state.activeAccountId;
    if (!uid) return;
    try {
      const db = fbDb(uid);
      const batch = db.batch();
      const ts = firebase.firestore.FieldValue.serverTimestamp();
      orderedPrinters.forEach((p, idx) => {
        const ref = db.collection("users").doc(uid)
                      .collection("printers").doc(p.brand)
                      .collection("devices").doc(p.id);
        // serverTimestamp ensures `updatedAt` is monotonic across the
        // 5 brand subcollections even when several clients write at once.
        batch.update(ref, { sortIndex: idx, updatedAt: ts });
      });
      await batch.commit();
    } catch (e) {
      // The next snapshot will re-establish the persisted order; we just
      // log so the user sees something went wrong without breaking the UI.
      console.warn("[printers] persist sortIndex failed:", e?.code, e?.message);
    }
  }

  async function persistCamSize(printer, size) {
    const uid = state.activeAccountId;
    if (!uid) return;
    try {
      await fbDb(uid).collection("users").doc(uid)
        .collection("printers").doc(printer.brand)
        .collection("devices").doc(printer.id)
        .update({ camSize: size });
    } catch (e) {
      console.warn("[cam] persist camSize failed:", e?.message);
    }
  }

  // Persist a printer's resolved model id. Brand drivers call this (via
  // ctx.updatePrinterModel) to auto-correct the model after the first
  // authenticated connection — e.g. a FlashForge Creator 5 Pro added by IP
  // is stored as "Select Printer" because the unauthenticated probe can't
  // read its identity; once connected, /detail.model is reliable.
  async function persistPrinterModel(printer, modelId) {
    const uid = state.activeAccountId;
    if (!uid || !printer?.brand || !printer?.id) return;
    try {
      await fbDb(uid).collection("users").doc(uid)
        .collection("printers").doc(printer.brand)
        .collection("devices").doc(printer.id)
        .update({ printerModelId: String(modelId) });
    } catch (e) {
      console.warn("[printer] persist model failed:", e?.message);
    }
  }

  async function persistCamWallOrder(orderedKeys) {
    const uid = state.activeAccountId;
    if (!uid) return;
    try {
      const db = fbDb(uid);
      const batch = db.batch();
      orderedKeys.forEach(({ brand, id }, idx) => {
        const ref = db.collection("users").doc(uid)
          .collection("printers").doc(brand)
          .collection("devices").doc(id);
        batch.update(ref, { camSortIndex: idx });
      });
      await batch.commit();
    } catch (e) {
      console.warn("[cam] persist camSortIndex failed:", e?.message);
    }
  }

  function wireCamWallDnd(host) {
    const grid = host.querySelector(".cam-wall");
    if (!grid) return;
    let _camDragId = null;
    Array.from(grid.querySelectorAll(".cam-wall-card")).forEach(card => {
      card.addEventListener("dragstart", e => {
        _camDragId = `${card.dataset.brand}:${card.dataset.id}`;
        try { e.dataTransfer.setData("text/plain", _camDragId); } catch {}
        try { e.dataTransfer.effectAllowed = "move"; } catch {}
        card.classList.add("cam-wall-card--dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("cam-wall-card--dragging");
        grid.querySelectorAll(".cam-wall-card--drop-before, .cam-wall-card--drop-after")
            .forEach(el => el.classList.remove("cam-wall-card--drop-before", "cam-wall-card--drop-after"));
        _camDragId = null;
      });
      card.addEventListener("dragover", e => {
        if (!_camDragId) return;
        const me = `${card.dataset.brand}:${card.dataset.id}`;
        if (me === _camDragId) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = "move"; } catch {}
        const rect = card.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        card.classList.toggle("cam-wall-card--drop-before", before);
        card.classList.toggle("cam-wall-card--drop-after", !before);
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("cam-wall-card--drop-before", "cam-wall-card--drop-after");
      });
      card.addEventListener("drop", e => {
        if (!_camDragId) return;
        const me = `${card.dataset.brand}:${card.dataset.id}`;
        if (me === _camDragId) return;
        e.preventDefault();
        const before = card.classList.contains("cam-wall-card--drop-before");
        card.classList.remove("cam-wall-card--drop-before", "cam-wall-card--drop-after");
        _applyCamWallReorder(grid, _camDragId, me, before);
      });
    });
  }

  function _applyCamWallReorder(grid, dragId, targetId, before) {
    // Reorder using CSS `order` — never moves DOM nodes so iframe/WebRTC streams
    // are not interrupted (browsers reload iframes on any DOM detach+reattach).
    const cards = Array.from(grid.querySelectorAll(".cam-wall-card"))
      .sort((a, b) => (parseInt(a.style.order) || 0) - (parseInt(b.style.order) || 0));
    const dragIdx = cards.findIndex(c => `${c.dataset.brand}:${c.dataset.id}` === dragId);
    const tgtIdx  = cards.findIndex(c => `${c.dataset.brand}:${c.dataset.id}` === targetId);
    if (dragIdx === -1 || tgtIdx === -1) return;
    const [dragCard] = cards.splice(dragIdx, 1);
    const newTgt = cards.findIndex(c => `${c.dataset.brand}:${c.dataset.id}` === targetId);
    cards.splice(before ? newTgt : newTgt + 1, 0, dragCard);
    cards.forEach((card, idx) => {
      card.style.order = idx;
      const p = state.printers.find(x => x.brand === card.dataset.brand && x.id === card.dataset.id);
      if (p) p.camSortIndex = idx;
    });
    persistCamWallOrder(cards.map(c => ({ brand: c.dataset.brand, id: c.dataset.id })));
  }

  /* ── Printer detail side panel ─────────────────────────────────────────
     Slide-in panel mirroring the inventory detail panel. Shows everything
     the user has on file for one printer, with sensitive credentials
     (password, MQTT access code, account secrets) masked behind an
     explicit Show toggle. Sensitive fields are still readable by the
     owner — the masking is purely a shoulder-surfing / screen-share
     defense, NOT a security boundary (Firestore rules are).               */
  let _activePrinter    = null; // currently-open printer { brand, id, ...data }
  let _camStatusDebounce = null; // debounce handle for cam-wall refresh on status change
  // Tracks printers the user explicitly disconnected via the ⏻ button.
  // isOnline() functions check this to return false instead of null when
  // no conn exists after an intentional disconnect (vs. never connected).
  const _ppForcedOfflineKeys = new Set();

  function openPrinterDetail(brand, id) {
    const printer = state.printers.find(p => p.brand === brand && p.id === id);
    if (!printer) return;
    // Switching to a DIFFERENT printer's side-card closes the settings panel —
    // it edits one specific printer, so a stale form for the previous one must
    // not linger beside the new printer.
    if (_activePrinter && (_activePrinter.brand !== brand || _activePrinter.id !== id)) {
      closePrinterAddForm();
    }
    // FlashForge: unregister the previous sidecard img from the mux (if any).
    // The mux's fetch stays alive — the cam wall keeps receiving frames.
    // We do NOT call ffgTearDownCamera() here anymore; the mux is the single
    // HTTP connection and survives panel rebuilds.
    if (_activePrinter?.brand === "flashforge") {
      const oldImg = document.getElementById("ffgCamSideImg");
      if (oldImg) try { ffgMuxUnregister(ffgKey(_activePrinter), oldImg); } catch {}
    }
    _activePrinter = printer;
    // Opening the side card is an implicit "connect intent" — clear any
    // forced-offline flag so the badge and live blocks show the real state
    // as the brand module establishes (or re-establishes) the connection.
    const _openKey = printer.brand === "snapmaker"  ? snapKey(printer)
                   : printer.brand === "flashforge" ? ffgKey(printer)
                   : printer.brand === "creality"   ? creKey(printer)
                   : printer.brand === "bambulab"   ? bambuKey(printer)
                   : printer.brand === "anycubic"   ? acuKey(printer)
                   : printer.brand === "elegoo"     ? elegooKey(printer) : null;
    if (_openKey) _ppForcedOfflineKeys.delete(_openKey);
    renderPrinterDetail();
    // Non-modal: don't dim/block the grid behind it — clicking another printer
    // re-runs openPrinterDetail() and switches in place. Close via ✕ / Escape.
    $("printerPanel").classList.add("open");
    _syncPanels(); // lay out both cards + close tabs
    // Snapmaker U1 talks Moonraker over a local WebSocket — connect when
    // the sidebar opens so we can stream live temps + filament + job state.
    if (printer.brand === "snapmaker" && printer.ip) {
      snapConnect(printer);
    }
    // FlashForge — open the 2s HTTP polling loop on side-card open. The
    // poller stays alive until the side-card closes (closePrinterDetail).
    // Also register the sidecard img with the MJPEG mux (start if not yet running).
    if (printer.brand === "flashforge" && printer.ip) {
      ffgConnect(printer);
      const url = ffgCamBaseUrl(printer);
      if (url) {
        const key = ffgKey(printer);
        ffgMuxStart(key, url);
        const img = document.getElementById("ffgCamSideImg");
        if (img) ffgMuxRegister(key, img);
      }
    }
    // Creality — open the WebSocket on port 9999 and start 2 s polling.
    if (printer.brand === "creality" && printer.ip) {
      creConnect(printer);
    }
    // Elegoo — MQTT is connected automatically at startup by subscribePrinters()
    // and stays alive in the background; no need to reconnect on sidecard open.
    // Bambu Lab — connect MQTT TLS (and start JPEG camera if applicable).
    if (printer.brand === "bambulab" && (printer.broker || printer.ip)) {
      bambuConnect(printer);
    }
    // Anycubic — connect MQTT TLS to the printer's local broker (idempotent).
    if (printer.brand === "anycubic" && (printer.ip || printer.mode === "cloud")) {
      acuConnect(printer);
    }
  }
  function closePrinterDetail() {
    // The printer settings panel edits THIS printer — close it too, otherwise
    // it would linger after the printer side-card slid out.
    if ($("printerAddPanel")?.classList.contains("open")) {
      try { closePrinterAddForm(); } catch {}
    }
    // If the filament-edit bottom-sheet is open over this side-panel,
    // close it FIRST so the user doesn't end up with an orphaned
    // sheet floating over the rest of the app. Triggered when the
    // user clicks the dim area to the left of the panel — without
    // this, the panel slid out but the sheet stayed pinned to the
    // (now empty) right edge.
    if ($("snapFilEditSheet")?.classList.contains("open")) {
      try { closeSnapFilamentEdit(); } catch {}
    }
    // FlashForge — same precaution. Without this the sheet would stay
    // floating after the side-card slides out.
    if ($("ffgFilEditSheet")?.classList.contains("open")) {
      try { closeFlashforgeFilamentEdit(); } catch {}
    }
    // Creality file explorer sheet.
    if ($("creFilEditSheet")?.classList.contains("open")) {
      try { closeCreFilamentEdit(); } catch {}
    }
    if ($("creFileSheet")?.classList.contains("open")) {
      try { closeCreFileSheet(); } catch {}
    }
    // FlashForge MJPEG mux — unregister the sidecard img.
    // If the cam wall is also open (cam view), its img stays registered and the
    // mux stream continues uninterrupted. If no other consumer remains the mux
    // auto-stops the fetch (no open slot wasted).
    if (_activePrinter?.brand === "flashforge") {
      const img = document.getElementById("ffgCamSideImg");
      if (img) try { ffgMuxUnregister(ffgKey(_activePrinter), img); } catch {}
    }
    $("printerPanel").classList.remove("open");
    _syncPanels(); // re-lay-out + hide the printer close tab
    $("printerOverlay").classList.remove("open");
    // Creality — unregister the sidecard's <video> from the stream consumer set.
    // The WebRTC peer connection keeps running as long as the cam wall is also
    // showing this printer; stopCreCam() is only called when there are no more
    // consumers (the cam wall is also gone or the printer went offline).
    if (_activePrinter?.brand === "creality") {
      const _creSidecardVideo = $("creCamContainer")?.querySelector(".cre-cam-video");
      if (_creSidecardVideo) removeCreCamConsumer(_creSidecardVideo);
      // If no other consumer remains (cam wall not visible), close the connection.
      // We check via the exported _consumers size indirectly: stopCreCam() is
      // called from creCamStop context when the brand layer needs it; here we
      // simply drop the sidecard consumer and let the connection idle if the cam
      // wall still needs it.
    }
    // Bambu Lab — close filament-edit sheet if open.
    if ($("bblFilEditSheet")?.classList.contains("open")) {
      try { closeBambuFilamentEdit(); } catch {}
    }
    // Anycubic — close filament-edit sheet if open.
    if ($("acuFilEditSheet")?.classList.contains("open")) {
      try { closeAcuFilamentEdit(); } catch {}
    }
    // Anycubic — release the camera (tell the printer to stop capturing +
    // stop ffmpeg) since the panel is closing. The background MQTT session
    // stays alive; acuReleaseCamera no-ops if the cam wall is still showing.
    if (_activePrinter?.brand === "anycubic") {
      try { acuReleaseCamera(_activePrinter); } catch {}
    }
    // Elegoo — close filament-edit / file-history sheets if open.
    // MQTT connection stays alive in background (disconnected only on logout).
    if ($("elgFilEditSheet")?.classList.contains("open")) {
      try { closeElegooFilamentEdit(); } catch {}
    }
    if ($("elgFileSheet")?.classList.contains("open")) {
      try { closeElegooFileSheet(); } catch {}
    }
    // All other brands (Snapmaker WS, FlashForge poll, Creality WS, Bambu MQTT,
    // Bambu camera stream) stay alive in the background. Reconnecting is a no-op
    // if the connection is already up when the panel reopens.
    _activePrinter = null;
  }
  // Delegated click handler for all 3 printer sub-views (Grid / Table / Cam).
  // Brand callbacks call renderPrintersView() (innerHTML rebuild) while a
  // printer is connecting or printing. If a rebuild fires between mousedown
  // and mouseup the card DOM node may have shifted position (section headers
  // inserted/removed) so the click event no longer resolves to a .printer-card.
  // Fix: record brand+id at mousedown time and use it as a fallback in click.
  let _pendingPrinterOpen = null; // { brand, id } captured on mousedown
  $("invPrinterView")?.addEventListener("mousedown", e => {
    const card = e.target.closest(".printer-card:not(.printer-card--add)");
    const row  = e.target.closest(".pt-row");
    if (card) _pendingPrinterOpen = { brand: card.dataset.brand, id: card.dataset.id };
    else if (row) _pendingPrinterOpen = { brand: row.dataset.brand, id: row.dataset.id };
    else _pendingPrinterOpen = null;
  });
  // Last-resort fallback: if a DOM rebuild between mousedown and click caused
  // the click event to fire on a detached element (which does not bubble to
  // #invPrinterView), fire openPrinterDetail from the document mouseup instead.
  // A 0-ms timeout lets the synchronous click handler run first; if it already
  // consumed _pendingPrinterOpen (set it to null) this is a no-op.
  document.addEventListener("mouseup", () => {
    if (!_pendingPrinterOpen?.brand || !_pendingPrinterOpen?.id) return;
    const intent = _pendingPrinterOpen;
    setTimeout(() => {
      if (_pendingPrinterOpen !== intent) return; // click handler already handled it
      _pendingPrinterOpen = null;
      if (!_printerJustDragged) openPrinterDetail(intent.brand, intent.id);
    }, 0);
  });
  $("invPrinterView")?.addEventListener("click", e => {
    const card = e.target.closest(".printer-card:not(.printer-card--add)");
    if (card) {
      _pendingPrinterOpen = null;
      if (_printerJustDragged) return;
      const brand = card.dataset.brand, id = card.dataset.id;
      if (brand && id) openPrinterDetail(brand, id);
      return;
    }
    const row = e.target.closest(".pt-row");
    if (row) {
      _pendingPrinterOpen = null;
      const brand = row.dataset.brand, id = row.dataset.id;
      if (brand && id) openPrinterDetail(brand, id);
      return;
    }
    // Fallback: DOM was rebuilt between mousedown and click.
    if (_pendingPrinterOpen?.brand && _pendingPrinterOpen?.id) {
      const { brand, id } = _pendingPrinterOpen;
      _pendingPrinterOpen = null;
      if (!_printerJustDragged) openPrinterDetail(brand, id);
      return;
    }
    _pendingPrinterOpen = null;
    // Cam size buttons — checked before .cam-wall-card to prevent sidecard opening
    const sizeBtn = e.target.closest(".cam-size-btn");
    if (sizeBtn) {
      const camCard2 = sizeBtn.closest(".cam-wall-card");
      if (camCard2) _setCamSize(camCard2, sizeBtn.dataset.size);
      return;
    }
    const camCard = e.target.closest(".cam-wall-card");
    if (camCard) {
      if (camCard.classList.contains("cam-wall-card--fs")) {
        _setCamSize(camCard, "1x");
        return;
      }
      openPrinterDetail(camCard.dataset.brand, camCard.dataset.id);
      return;
    }
    if (e.target.closest("#printerAddCard")) openPrinterBrandPicker();
  });
  $("printerPanelClose")?.addEventListener("click", closePrinterDetail);
  $("printerCloseTab")?.addEventListener("click", closePrinterDetail);
  $("printerOverlay")?.addEventListener("click", closePrinterDetail);
  // Escape closes the (now non-modal) printer panel — unless an inline editor
  // (temp input, filament sheet, …) is focused, which handles Escape itself.
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !$("printerPanel")?.classList.contains("open")) return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "SELECT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
    closePrinterDetail();
  });
  // Escape key — closes the printer detail side-panel when it's open.
  // Replaces the role previously played by the visible ✕ button (now
  // removed). Backdrop click + Esc are the two close affordances.
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("printerPanel")?.classList.contains("open")) closePrinterDetail();
    const fsCard = document.querySelector(".cam-wall-card--fs");
    if (fsCard) _setCamSize(fsCard, "1x");
  });

  // Snapmaker Control card — step size + speed selectors (change event, delegated)
  document.addEventListener("change", e => {
    if (_activePrinter?.brand === "snapmaker") {
      const stepSel = e.target.closest("[data-snap-ctrl-step]");
      if (stepSel) {
        const s = parseFloat(stepSel.value);
        if (!isNaN(s)) {
          const conn = snapGetConn(snapKey(_activePrinter));
          if (conn) {
            conn._ctrlStep = s;
            const ctrlEl = document.getElementById("snapCtrlBlock");
            if (ctrlEl) ctrlEl.innerHTML = renderSnapControlCard(_activePrinter, conn);
          }
        }
        return;
      }
      const speedSel = e.target.closest("[data-snap-ctrl-speed]");
      if (speedSel) {
        const pct = parseInt(speedSel.value, 10);
        if (!isNaN(pct)) {
          const conn = snapGetConn(snapKey(_activePrinter));
          if (conn) snapSendGcode(conn, `M220 S${pct}`);
        }
        return;
      }
    }
  });

  // ── Snapmaker file sheet + print controls ────────────────────────────────
  document.addEventListener("click", e => {
    // Files button: [data-snap-open-files]
    const snapFilesBtn = e.target.closest("[data-snap-open-files]");
    if (snapFilesBtn && _activePrinter?.brand === "snapmaker") {
      e.preventDefault();
      openSnapFileSheet(_activePrinter);
      return;
    }

    // Pause/Resume: [data-snap-print-pause]
    const snapPauseBtn = e.target.closest("[data-snap-print-pause]");
    if (snapPauseBtn && _activePrinter?.brand === "snapmaker") {
      e.preventDefault();
      const conn = snapGetConn(snapKey(_activePrinter));
      if (conn) {
        const action = conn.data.printState === "paused" ? "resume" : "pause";
        snapPrintControl(conn, action);
      }
      return;
    }

    // Cancel: [data-snap-print-cancel]
    const snapCancelBtn = e.target.closest("[data-snap-print-cancel]");
    if (snapCancelBtn && _activePrinter?.brand === "snapmaker") {
      e.preventDefault();
      const conn = snapGetConn(snapKey(_activePrinter));
      if (conn) snapPrintControl(conn, "cancel");
      return;
    }

    // ── Filament Load/Unload mode ────────────────────────────────────────────

    // Enter selection mode: [data-snap-fil-mode="load"|"unload"]
    const snapFilModeBtn = e.target.closest("[data-snap-fil-mode]");
    if (snapFilModeBtn && _activePrinter?.brand === "snapmaker") {
      e.preventDefault();
      const conn = snapGetConn(snapKey(_activePrinter));
      if (conn) {
        conn._filSelectMode = snapFilModeBtn.dataset.snapFilMode; // "load" | "unload"
        conn._filSelected   = new Set();
        const filEl = $("snapFilBlock");
        if (filEl) filEl.innerHTML = brands.get("snapmaker")?.renderFilamentCard(_activePrinter, conn) || "";
      }
      return;
    }

    // Toggle extruder checkbox: [data-snap-fil-toggle="{extruderIdx}"]
    const snapFilToggle = e.target.closest("[data-snap-fil-toggle]");
    if (snapFilToggle && _activePrinter?.brand === "snapmaker") {
      e.preventDefault();
      const conn = snapGetConn(snapKey(_activePrinter));
      if (conn?._filSelectMode) {
        const idx = parseInt(snapFilToggle.dataset.snapFilToggle, 10);
        if (conn._filSelected.has(idx)) conn._filSelected.delete(idx);
        else                            conn._filSelected.add(idx);
        const filEl = $("snapFilBlock");
        if (filEl) filEl.innerHTML = brands.get("snapmaker")?.renderFilamentCard(_activePrinter, conn) || "";
      }
      return;
    }

    // Cancel selection mode: [data-snap-fil-cancel]
    const snapFilCancel = e.target.closest("[data-snap-fil-cancel]");
    if (snapFilCancel && _activePrinter?.brand === "snapmaker") {
      e.preventDefault();
      const conn = snapGetConn(snapKey(_activePrinter));
      if (conn) {
        conn._filSelectMode = null;
        conn._filSelected   = new Set();
        const filEl = $("snapFilBlock");
        if (filEl) filEl.innerHTML = brands.get("snapmaker")?.renderFilamentCard(_activePrinter, conn) || "";
      }
      return;
    }

    // Confirm load/unload: [data-snap-fil-confirm="load"|"unload"]
    const snapFilConfirm = e.target.closest("[data-snap-fil-confirm]");
    if (snapFilConfirm && _activePrinter?.brand === "snapmaker") {
      e.preventDefault();
      const conn = snapGetConn(snapKey(_activePrinter));
      if (conn && conn._filSelected?.size > 0) {
        const mode = snapFilConfirm.dataset.snapFilConfirm; // "load" | "unload"
        const sorted = [...conn._filSelected].sort();
        let script;
        if (mode === "load") {
          // Load sequence: STAGE=prepare (toolchange) then STAGE=extrude (heat + feed motor).
          // Both stages are sent as a single multi-line gcode script so Klipper
          // executes them sequentially without an extra round-trip from our side.
          script = sorted.map(idx =>
            `MANUAL_FEEDING EXTRUDER=${idx} STAGE=prepare\nMANUAL_FEEDING EXTRUDER=${idx} STAGE=extrude`
          ).join("\n");
        } else {
          // INNER_FILAMENT_UNLOAD has no EXTRUDER param — must toolchange first (T0-T3)
          // Use the filament type to pick the right unload temp from filament_parameters
          // (default 250°C covers PLA/PETG; the macro itself falls back to 250 too)
          script = sorted.map(idx => {
            const fil  = conn.data.filaments[idx] || {};
            const type = (fil.type || "PLA").toUpperCase();
            // filament_parameters.{TYPE}.vendor_generic.sub_generic.unload_temp
            const unloadTemp = 250; // reasonable default; printer macro also defaults to 250
            return `T${idx}\nINNER_FILAMENT_UNLOAD TEMP=${unloadTemp}`;
          }).join("\n");
        }
        snapSendGcode(conn, script);
      }
      // Exit mode regardless
      if (conn) {
        conn._filSelectMode = null;
        conn._filSelected   = new Set();
        const filEl = $("snapFilBlock");
        if (filEl) filEl.innerHTML = brands.get("snapmaker")?.renderFilamentCard(_activePrinter, conn) || "";
      }
      return;
    }

    // Print file: [data-snap-file-print="{path}"]
    const snapFilePrintBtn = e.target.closest("[data-snap-file-print]");
    if (snapFilePrintBtn && _activePrinter?.brand === "snapmaker") {
      e.preventDefault();
      const filename = snapFilePrintBtn.dataset.snapFilePrint;
      const conn = snapGetConn(snapKey(_activePrinter));
      if (conn && filename) {
        fetch(`http://${conn.ip}:7125/printer/print/start?filename=${encodeURIComponent(filename)}`, { method: "POST" })
          .then(() => closeSnapFileSheet())
          .catch(err => console.warn("[snap] print start failed:", err?.message));
      }
      return;
    }
  });

  // Elegoo Control card — step size + print speed selectors (change event, delegated)
  document.addEventListener("change", e => {
    if (_activePrinter?.brand !== "elegoo") return;
    // Step size dropdown
    const stepSel = e.target.closest("[data-elg-ctrl-step]");
    if (stepSel) {
      const s = parseFloat(stepSel.value);
      if (!isNaN(s)) {
        const conn = elegooGetConn(elegooKey(_activePrinter));
        if (conn) {
          conn._ctrlStep = s;
          const host = document.getElementById("elgLive");
          if (host) host.innerHTML = renderElegooLiveInner(_activePrinter);
        }
      }
      return;
    }
    // Print speed dropdown
    const speedSel = e.target.closest("[data-elg-ctrl-speed]");
    if (speedSel) {
      const mode = parseInt(speedSel.value, 10);
      if (!isNaN(mode)) elegooSendCmd(elegooKey(_activePrinter), 1031, { mode });
    }
  });

  // Elegoo file sheet — tab + print buttons live OUTSIDE #printerPanelBody,
  // so they must be delegated on document, not on the panel body.
  document.addEventListener("click", e => {
    // Tab switch
    const fsTab = e.target.closest("[data-elg-fs-tab]");
    if (fsTab) {
      e.preventDefault(); e.stopPropagation();
      elegooFileSheetSetTab(fsTab.dataset.elgFsTab);
      return;
    }
    // Print / re-print a file
    const fsPrint = e.target.closest("[data-elg-file-print]");
    if (fsPrint && _activePrinter?.brand === "elegoo") {
      e.preventDefault(); e.stopPropagation();
      const filename = fsPrint.dataset.elgFilePrint;
      const storage  = fsPrint.dataset.elgFileStorage || "local";
      if (filename) {
        elegooStartPrint(elegooKey(_activePrinter), filename, storage);
        closeElegooFileSheet();
      }
      return;
    }
    // Timelapse download — resolves picture/ URL to video/ URL via method 1051
    const dlBtn = e.target.closest("[data-elg-hist-dl]");
    if (dlBtn && _activePrinter?.brand === "elegoo") {
      e.preventDefault(); e.stopPropagation();
      const pictureUrl = dlBtn.dataset.elgHistDl;
      if (pictureUrl) elegooTimelapseDl(_activePrinter, pictureUrl);
      return;
    }
  });

  // Gear button — opens the Printers Settings modal pre-filled with the
  // current printer's data so the user can edit fields and confirm.
  $("printerEditBtn")?.addEventListener("click", () => {
    if (!_activePrinter) return;
    openPrinterAddForm(_activePrinter.brand, _activePrinter);
  });

  // Fluidd button — opens http://<ip>/ in the system browser (Snapmaker only).
  $("printerFluidBtn")?.addEventListener("click", () => {
    const ip = $("printerFluidBtn")?.dataset.fluidIp;
    if (!ip) return;
    window.electronAPI?.openExternal(`http://${ip}/`);
  });

  // Connect / Disconnect button — left of the gear button.
  // Updates its own appearance based on the live connection status.
  function _updatePrinterConnBtn() {
    const btn = $("printerConnBtn");
    if (!btn || !_activePrinter) return;
    const p = _activePrinter;
    let connStatus = null;
    if (p.brand === "snapmaker")  connStatus = snapGetConn(snapKey(p))?.status     ?? null;
    if (p.brand === "flashforge") connStatus = ffgGetConn(ffgKey(p))?.status       ?? null;
    if (p.brand === "creality")   connStatus = creGetConn(creKey(p))?.status       ?? null;
    if (p.brand === "bambulab")   connStatus = bambuGetConn(bambuKey(p))?.status   ?? null;
    if (p.brand === "elegoo")     connStatus = elegooGetConn(elegooKey(p))?.status ?? null;
    if (p.brand === "anycubic")   connStatus = acuGetConn(acuKey(p))?.status       ?? null;
    const active    = connStatus === "connected" || connStatus === "connecting";
    const labelKey  = active ? "printerDisconnect" : "printerConnect";
    btn.title       = t(labelKey);
    btn.ariaLabel   = btn.title;
    btn.dataset.conn = active ? "active" : "inactive";
  }

  $("printerConnBtn")?.addEventListener("click", () => {
    if (!_activePrinter) return;
    const p      = _activePrinter;
    const active = $("printerConnBtn")?.dataset.conn === "active";
    // Resolve the brand key used for the forced-offline tracking set.
    const _brKey = p.brand === "snapmaker"  ? snapKey(p)
                 : p.brand === "flashforge" ? ffgKey(p)
                 : p.brand === "creality"   ? creKey(p)
                 : p.brand === "bambulab"   ? bambuKey(p)
                 : p.brand === "anycubic"   ? acuKey(p)
                 : p.brand === "elegoo"     ? elegooKey(p) : null;
    if (active) {
      // Mark as explicitly offline BEFORE disconnecting so that any
      // badge refresh callbacks triggered during teardown show "Offline".
      if (_brKey) _ppForcedOfflineKeys.add(_brKey);
      if (p.brand === "snapmaker")  snapDisconnect(snapKey(p));
      if (p.brand === "flashforge") ffgDisconnect(ffgKey(p));
      if (p.brand === "creality")   { creDisconnect(creKey(p)); stopCreCam(); }
      if (p.brand === "bambulab")   bambuDisconnect(bambuKey(p));
      if (p.brand === "elegoo")     elegooDisconnect(elegooKey(p));
      if (p.brand === "anycubic")   acuDisconnect(acuKey(p));
    } else {
      // Clear forced-offline so isOnline() falls back to live conn status.
      if (_brKey) _ppForcedOfflineKeys.delete(_brKey);
      if (p.brand === "snapmaker"  && p.ip)               snapConnect(p);
      if (p.brand === "flashforge" && p.ip)               ffgConnect(p);
      if (p.brand === "creality"   && p.ip)               { creDisconnect(creKey(p)); creConnect(p); }
      if (p.brand === "bambulab"   && (p.broker || p.ip)) bambuConnect(p);
      if (p.brand === "elegoo")                           elegooConnect(p);
      if (p.brand === "anycubic"   && (p.ip || p.mode === "cloud")) acuConnect(p);
    }
    // Refresh the panel body and the printer grid immediately so the badge
    // dots in the card list also flip to offline/connecting right away.
    try { renderPrinterDetail(); } catch (_) {}
    if (_isPrinterMode(state.viewMode)) {
      if (state.viewMode === "printer-cam") try { _patchCamWall(); } catch (_) {}
      else try { renderPrintersView(); } catch (_) {}
    }
  });

  // Re-render the detail panel against the live state.printers (so a
  // Firestore snapshot that updates the open printer is reflected without
  // closing the panel). Called on every snapshot when the panel is open.
  function refreshOpenPrinterDetail() {
    if (!_activePrinter) return;
    const fresh = state.printers.find(p => p.brand === _activePrinter.brand && p.id === _activePrinter.id);
    if (!fresh) { closePrinterDetail(); return; } // doc was deleted
    _activePrinter = fresh;
    renderPrinterDetail();
    // renderPrinterDetail already calls _updatePrinterConnBtn at its end.
    // The extra call here covers surgical updates that skip renderPrinterDetail.
    _updatePrinterConnBtn();
  }

  // Populate the shared printer rendering context for brand card widgets.
  // Must come after all helpers are defined. Brand card functions read from
  // _printerCtx at call time (not at import time), so this is always ready.
  Object.assign(_printerCtx, {
    esc, t,
    toast: (msg, type) => toast(msg, type),
    isForcedOffline: (key) => _ppForcedOfflineKeys.has(key),
    snapFmtTempPair, snapFmtDuration, snapTextColor,
    findPrinterModel, printerImageUrl, printerImageUrlFor,
    snapFilenameRel,
    SNAP_ICON_NOZZLE, SNAP_ICON_BED, SNAP_ICON_CHAMBER, SNAP_ICON_CLOCK,
    SNAP_FIL_COLOR_PRESETS,
    getActivePrinter:      () => _activePrinter,
    getState:              () => state,
    onFullRender: () => {
      renderPrinterDetail();
      // Re-partition the printer grid (CONNECTED / OFFLINE sections) whenever
      // a brand status change triggers a full render — keeps the card position
      // in sync with the live connection state without waiting for a Firestore
      // snapshot.
      // In cam mode, patch CSS/order only — brand status ticks (e.g. MQTT
      // heartbeats) must not reload iframes or WebRTC streams.
      if (_isPrinterMode(state.viewMode)) {
        if (state.viewMode === "printer-cam") try { _patchCamWall(); } catch (_) {}
        else try { renderPrintersView(); } catch (_) {}
      }
    },
    onPrinterStatusChange: (key, status) => {
      // When a brand reaches "connected", auto-clear forced-offline so the
      // badge and panel return to their live state correctly.
      if (status === "connected" && key) _ppForcedOfflineKeys.delete(key);
      if (typeof refreshOpenPrinterDetail === "function") refreshOpenPrinterDetail();
      // In cam mode, a connection/disconnection must refresh the wall so new
      // feeds appear (or stale cards disappear) without the user leaving the view.
      // Debounced 500 ms — rapid status flaps coalesce into one rebuild.
      if (state.viewMode === "printer-cam") {
        clearTimeout(_camStatusDebounce);
        _camStatusDebounce = setTimeout(() => {
          try { renderPrintersView(); } catch (_) {}
        }, 500);
      }
    },
    onPrintersViewChange:  () => { if (state.viewMode === "printer-cam") _patchCamWall(); else renderPrintersView(); },
    // Status-only refresh: in grid/table view we just patch the per-card
    // online badges (cheap, preserves `<img>` decoding state). Falls back to
    // a full rebuild inside `_patchGridStatus` when the online set actually
    // changed (card needs to move between CONNECTED and OFFLINE sections).
    // Before this, every brand reconnect retry (2-30 s backoff, all 10
    // printers offline → bursts every few seconds) rebuilt the whole grid
    // and visibly flashed every card.
    onPrinterGridChange:   () => {
      if (state.viewMode === "printer-cam")   return;
      if (state.viewMode === "printer-table") _patchTableStatus(); // surgical, no rebuild
      else                                    _patchGridStatus();
    },
    onGridJobsChange:      () => {
      if (state.viewMode === "printer-table") _patchTableJobs();
      else                                    _patchGridJobs();
    },
    setupHoldToConfirm,
    creCamStart: ip => startCreCam(ip),
    creCamStop:  ()  => stopCreCam(),
  });
  _printerCtx.openPrinterSettings = (brand, printer, prefill) => openPrinterAddForm(brand, printer, prefill);
  _printerCtx.openBrandPicker     = () => openPrinterBrandPicker();
  _printerCtx.isDebugEnabled      = () => !!state.debugEnabled;
  _printerCtx.updatePrinterModel  = (printer, modelId) => persistPrinterModel(printer, modelId);
  _printerCtx.applyTranslations   = () => applyTranslations();
  // Persist an Anycubic CLOUD printer (provisioned via the slicer). Keyed by
  // cloudPrinterId so re-provisioning upserts (refreshing the token) instead of
  // creating duplicates. The token/email are denormalised onto the doc so the
  // driver has everything it needs (mirrors how LAN docs carry their creds).
  _printerCtx.addAnycubicCloudPrinter = async (rec) => {
    const uid = state.activeAccountId;
    if (!uid) return { ok: false, error: "no-account" };
    try {
      const ref = fbDb(uid).collection("users").doc(uid)
        .collection("printers").doc("anycubic")
        .collection("devices").doc("cloud_" + rec.cloudPrinterId);
      const existing = state.printers.find(p => p.brand === "anycubic" && p.id === ref.id);
      await ref.set({
        id:             ref.id,
        brand:          "anycubic",
        mode:           "cloud",
        cloudPrinterId: String(rec.cloudPrinterId),
        machineType:    Number(rec.machineType) || 0,
        acuModelId:     String(rec.machineType || ""), // cloud topic modelId = machineType
        key:            String(rec.key || ""),
        cloudToken:     String(rec.cloudToken || ""),
        cloudEmail:     String(rec.cloudEmail || ""),
        printerName:    String(rec.printerName || ("Anycubic " + rec.cloudPrinterId)),
        printerModelId: String(rec.printerModelId || "0"),
        isActive:       existing ? !!existing.isActive : false,
        sortIndex:      existing && Number.isFinite(existing.sortIndex) ? existing.sortIndex : state.printers.length,
        updatedAt:      firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { ok: true, id: ref.id };
    } catch (e) {
      console.warn("[anycubic] addAnycubicCloudPrinter failed:", e?.code, e?.message);
      return { ok: false, error: e?.message || String(e) };
    }
  };
  // Refresh the stored cloud token (+ email) on every Anycubic cloud printer —
  // called by the driver after re-grabbing a token from a bridge-mode slicer
  // when the old one was revoked. Updates Firestore + in-memory state so
  // reconnects use the fresh token.
  _printerCtx.updateAnycubicCloudToken = async (email, token) => {
    const uid = state.activeAccountId;
    if (!uid || !token) return { ok: false };
    try {
      const db = fbDb(uid);
      const cloudDocs = (state.printers || []).filter(p => p.brand === "anycubic" && p.mode === "cloud");
      await Promise.all(cloudDocs.map(p => {
        p.cloudToken = token; if (email) p.cloudEmail = email; // keep state in sync now
        return db.collection("users").doc(uid).collection("printers").doc("anycubic")
          .collection("devices").doc(p.id)
          .set({ cloudToken: token, ...(email ? { cloudEmail: email } : {}) }, { merge: true });
      }));
      return { ok: true, n: cloudDocs.length };
    } catch (e) {
      console.warn("[anycubic] updateAnycubicCloudToken failed:", e?.code, e?.message);
      return { ok: false, error: e?.message || String(e) };
    }
  };

  // Dispatch to the per-brand camera widget. Returns "" when the
  // printer is offline, has no camera, or the brand is unknown.
  // To add a new brand: create printers/<brand>/widget_camera.js,
  // import renderXxxCamBanner here, add a case below. inventory.js
  // itself never builds camera HTML.
  function renderCamBanner(p) {
    switch (p?.brand) {
      case "snapmaker":  return renderSnapCamBanner(p);
      case "creality":   return renderCreCamBanner(p);
      case "flashforge": return renderFfgCamBanner(p);
      case "elegoo":     return renderElegooCamBanner(p);
      case "bambulab":   return renderBambuCamBanner(p);
      case "anycubic":   return renderAcuCamBanner(p);
      default: return "";
    }
  }

  function renderPrinterDetail() {
    const p = _activePrinter;
    if (!p) return;
    const meta = PRINTER_BRAND_META[p.brand] || { label: p.brand, accent: "#888", connection: "" };

    // Title shown in the panel header. Brand + model pills are injected
    // next to it (was previously inside the hero — moved up so the user
    // doesn't see the printer name twice).
    $("printerPanelTitle").textContent = p.printerName || t("printerPanelTitle");

    // Resolve catalog metadata for the model. The legacy `featuresHtml`
    // (camera / multi-extruder / etc. pills under the photo) was
    // removed — it took vertical space without conveying anything the
    // user couldn't already see in the live blocks below the hero.
    const modelName    = printerModelName(p.brand, p.printerModelId);
    const heroImgUrl   = printerImageUrlFor(p.brand, p.printerModelId)
                      || printerImageUrl(findPrinterModel(p.brand, "0"));

    // Body — read-only summary. Identity / Connection / Credentials are
    // edited through the gear button which opens the Printers Settings
    // modal in edit mode. The remaining hero is purely informational and
    // the Raw data section is kept as a debug aid.
    // Per-brand connection refs — used by the log sections below.
    // (Camera logic no longer needs these here; it lives in widget_camera.js.)
    const snapConn = (p.brand === "snapmaker") ? snapGetConn(snapKey(p)) : null;
    const creConn  = (p.brand === "creality")  ? creGetConn(creKey(p))  : null;

    // Snapmaker WebRTC camera — lives in #ppPersistentCam (outside the
    // scrollable body) so innerHTML rebuilds never destroy the live <iframe>.
    // We only (re)build the iframe when the connected IP changes; if the IP
    // is the same as the last render we leave the element untouched so the
    // WebRTC session continues uninterrupted across panel re-renders / opens.
    const _snapCamConn  = (p.brand === "snapmaker") ? snapGetConn(snapKey(p)) : null;
    const _snapCamIp    = (_snapCamConn?.status === "connected" && _snapCamConn?.ip) || null;
    const _persistEl    = $("ppPersistentCam");
    if (_persistEl) {
      if (p.brand === "snapmaker") {
        const _prevIp = _persistEl.dataset.snapIp || "";
        if (_snapCamIp && _snapCamIp !== _prevIp) {
          // New connection or IP changed — build a fresh iframe.
          _persistEl.dataset.snapIp = _snapCamIp;
          _persistEl.innerHTML = renderSnapCamBanner(p);
        } else if (!_snapCamIp && _prevIp) {
          // Went offline — clear the camera.
          delete _persistEl.dataset.snapIp;
          _persistEl.innerHTML = "";
        }
        // Same IP → leave #ppPersistentCam entirely alone (WebRTC keeps running).
      } else {
        // Different brand — clear any residual Snapmaker camera.
        _persistEl.innerHTML = "";
        delete _persistEl.dataset.snapIp;
      }
    }
    const _snapCamVisible = p.brand === "snapmaker" && !!_snapCamIp;

    // Camera banner (non-Snapmaker brands) — delegated to per-brand widget_camera.js.
    // Snapmaker is handled above via #ppPersistentCam, so it returns "" here.
    // Creality: always inject the camera container so the <video> persists through
    // reconnects — statusChanged events only toggle cre-cam-hidden, never rebuild the panel.
    // Uses class + data-cre-id (not id="creCamVideo") so the sidecard and the cam wall
    // can coexist without duplicate-ID conflicts; the shared stream is distributed via
    // addCreCamConsumer() after the HTML is injected into the DOM.
    const camBannerHtml = (p.brand === "snapmaker") ? ""
      : (p.brand === "creality") ? `<div id="creCamContainer" class="pp-cam-full${creConn?.status === "connected" ? "" : " cre-cam-hidden"}"><video class="cre-cam-video" data-cre-id="${esc(p.id)}" autoplay muted playsinline></video></div>`
      : renderCamBanner(p);
    const showCam = _snapCamVisible || (p.brand === "creality" ? creConn?.status === "connected" : camBannerHtml !== "");

    // Hero photo — only when the camera is NOT taking over.
    const heroImgHtml = (!showCam && heroImgUrl)
      ? `<div class="pp-hero-img"><img src="${esc(heroImgUrl)}" alt="${esc(modelName)}" onerror="this.style.opacity='.15'"/></div>`
      : "";

    // Snapmaker live data block (no wrapping section — direct child of
    // the panel body, snap-head + temps + filaments inline). Re-rendered
    // partially via #snapLive on every WS frame.
    const snapLiveHtml = (p.brand === "snapmaker")
      ? `<div id="snapLive" class="snap-live-host">${renderSnapmakerLiveInner(p)}</div>`
      : "";

    // FlashForge live data block — same visual layout as Snapmaker (we
    // reuse the .snap-* CSS classes inside the inner HTML), but the
    // host id is `ffgLive` so the rAF-coalesced re-renders in
    // ffgNotifyChange land on the right node without crossing wires
    // with the Snapmaker dispatch above.
    const ffgLiveHtml = (p.brand === "flashforge")
      ? `<div id="ffgLive" class="snap-live-host">${renderFlashforgeLiveInner(p)}</div>`
      : "";

    // Creality live data block — same reusable .snap-* CSS classes.
    // We capture the rendered HTML and push it into the memo cache so the
    const creLiveHtml = (p.brand === "creality")
      ? `<div id="creLive" class="snap-live-host">${renderCrealityLiveInner(p)}</div>`
      : "";

    // Elegoo live data block — same reusable .snap-* CSS classes.
    const elgLiveHtml = (p.brand === "elegoo")
      ? `<div id="elgLive" class="snap-live-host">${renderElegooLiveInner(p)}</div>`
      : "";

    // Bambu Lab live data block — MQTT TLS, job state + temps + AMS.
    const bblLiveHtml = (p.brand === "bambulab")
      ? `<div id="bblLive" class="snap-live-host">${renderBambuLiveInner(p)}</div>`
      : "";

    // Anycubic live data block — MQTT TLS, ACE box/slot layout.
    const acuLiveHtml = (p.brand === "anycubic")
      ? `<div id="acuLive" class="snap-live-host">${renderAnycubicLiveInner(p)}</div>`
      : "";

    // FlashForge HTTP request log — same shape as the Snapmaker block
    // below, but driven by /detail polling. Surfaces every outgoing
    // POST + the printer's response so the user can pinpoint where the
    // connection breaks (no IP, bad SN, wrong password, network drop).
    // The user's expand/collapse choice is persisted on `conn.logExpanded`
    // (set by the toolbar click handler) so partial re-renders during
    // status flapping don't snap the section closed under their cursor.
    const ffgConnLogRef = (p.brand === "flashforge") ? ffgGetConn(ffgKey(p)) : null;
    const isFfgPaused = !!(ffgConnLogRef?.logPaused);
    const ffgLogExpanded = !!(ffgConnLogRef?.logExpanded);
    const ffgLogHtml = (p.brand === "flashforge")
      ? `<section class="pp-section pp-section--collapsible snap-log-section" data-collapsed="${ffgLogExpanded ? "false" : "true"}">
           <button class="pp-section-head pp-section-head--btn" type="button">
             <span>${esc(t("snapLogTitle"))}
                   <span class="snap-log-count" id="ffgLogCount">${(ffgConnLogRef?.log?.length) || 0}</span>
                   ${isFfgPaused ? `<span class="snap-log-paused-tag" id="ffgLogPausedTag">${esc(t("snapLogPaused"))}</span>` : ""}
             </span>
             <span class="pp-chev icon icon-chevron-r icon-14"></span>
           </button>
           <div class="pp-section-body">
             <div class="snap-log-toolbar">
               <button type="button" class="snap-log-btn snap-log-btn--pause${isFfgPaused ? " is-paused" : ""}" id="ffgLogPauseBtn"
                       data-paused="${isFfgPaused ? "true" : "false"}">
                 <span class="icon ${isFfgPaused ? "icon-play" : "icon-pause"} icon-13"></span>
                 <span class="label">${esc(t(isFfgPaused ? "snapLogResume" : "snapLogPause"))}</span>
               </button>
               <button type="button" class="snap-log-btn" id="ffgLogClearBtn">
                 <span class="icon icon-trash icon-13"></span>
                 <span>${esc(t("snapLogClear"))}</span>
               </button>
             </div>
             <div id="ffgLog">${renderFlashforgeLogInner(p)}</div>
           </div>
         </section>`
      : "";

    // Creality WS request log — same collapsible section shape.
    const isCrePaused   = !!(creConn?.logPaused);
    const creLogExpanded = !!(creConn?.logExpanded);
    const creLogHtml = (p.brand === "creality")
      ? `<section class="pp-section pp-section--collapsible snap-log-section" data-collapsed="${creLogExpanded ? "false" : "true"}">
           <button class="pp-section-head pp-section-head--btn" type="button">
             <span>${esc(t("snapLogTitle"))}
                   <span class="snap-log-count" id="creLogCount">${(creConn?.log?.length) || 0}</span>
                   ${isCrePaused ? `<span class="snap-log-paused-tag" id="creLogPausedTag">${esc(t("snapLogPaused"))}</span>` : ""}
             </span>
             <span class="pp-chev icon icon-chevron-r icon-14"></span>
           </button>
           <div class="pp-section-body">
             <div class="snap-log-toolbar">
               <button type="button" class="snap-log-btn snap-log-btn--pause${isCrePaused ? " is-paused" : ""}" id="creLogPauseBtn"
                       data-paused="${isCrePaused ? "true" : "false"}">
                 <span class="icon ${isCrePaused ? "icon-play" : "icon-pause"} icon-13"></span>
                 <span class="label">${esc(t(isCrePaused ? "snapLogResume" : "snapLogPause"))}</span>
               </button>
               <button type="button" class="snap-log-btn" id="creLogClearBtn">
                 <span class="icon icon-trash icon-13"></span>
                 <span>${esc(t("snapLogClear"))}</span>
               </button>
             </div>
             <div id="creLog">${renderCreLogInner(p)}</div>
           </div>
         </section>`
      : "";

    // Elegoo MQTT request log — same collapsible section shape.
    const elgConn = (p.brand === "elegoo") ? elegooGetConn(elegooKey(p)) : null;
    const isElgPaused   = !!(elgConn?.logPaused);
    const elgLogExpanded = !!(elgConn?.logExpanded);
    const elgLogHtml = (p.brand === "elegoo")
      ? `<section class="pp-section pp-section--collapsible snap-log-section" data-collapsed="${elgLogExpanded ? "false" : "true"}">
           <button class="pp-section-head pp-section-head--btn" type="button">
             <span>${esc(t("snapLogTitle"))}
                   <span class="snap-log-count" id="elgLogCount">${(elgConn?.log?.length) || 0}</span>
                   ${isElgPaused ? `<span class="snap-log-paused-tag" id="elgLogPausedTag">${esc(t("snapLogPaused"))}</span>` : ""}
             </span>
             <span class="pp-chev icon icon-chevron-r icon-14"></span>
           </button>
           <div class="pp-section-body">
             <div class="snap-log-toolbar">
               <button type="button" class="snap-log-btn snap-log-btn--pause${isElgPaused ? " is-paused" : ""}" id="elgLogPauseBtn"
                       data-paused="${isElgPaused ? "true" : "false"}">
                 <span class="icon ${isElgPaused ? "icon-play" : "icon-pause"} icon-13"></span>
                 <span class="label">${esc(t(isElgPaused ? "snapLogResume" : "snapLogPause"))}</span>
               </button>
               <button type="button" class="snap-log-btn" id="elgLogClearBtn">
                 <span class="icon icon-trash icon-13"></span>
                 <span>${esc(t("snapLogClear"))}</span>
               </button>
             </div>
             <div id="elgLog">${renderElegooLogInner(p)}</div>
           </div>
         </section>`
      : "";

    // Snapmaker WS request log — sibling collapsible section at the
    // bottom, same visual style as the Raw data section. Re-rendered
    // partially via #snapLog on every WS frame.
    const isPaused = !!(snapConn?.logPaused);
    const snapLogHtml = (p.brand === "snapmaker")
      ? `<section class="pp-section pp-section--collapsible snap-log-section" data-collapsed="true">
           <button class="pp-section-head pp-section-head--btn" type="button">
             <span>${esc(t("snapLogTitle"))}
                   <span class="snap-log-count" id="snapLogCount">${(snapConn?.log?.length) || 0}</span>
                   ${isPaused ? `<span class="snap-log-paused-tag" id="snapLogPausedTag">${esc(t("snapLogPaused"))}</span>` : ""}
             </span>
             <span class="pp-chev icon icon-chevron-r icon-14"></span>
           </button>
           <div class="pp-section-body">
             <div class="snap-log-toolbar">
               <button type="button" class="snap-log-btn snap-log-btn--pause${isPaused ? " is-paused" : ""}" id="snapLogPauseBtn"
                       data-paused="${isPaused ? "true" : "false"}">
                 <span class="icon ${isPaused ? "icon-play" : "icon-pause"} icon-13"></span>
                 <span class="label">${esc(t(isPaused ? "snapLogResume" : "snapLogPause"))}</span>
               </button>
               <button type="button" class="snap-log-btn" id="snapLogClearBtn">
                 <span class="icon icon-trash icon-13"></span>
                 <span>${esc(t("snapLogClear"))}</span>
               </button>
             </div>

             <!-- Custom JSON paste zone — for hand-crafted Moonraker calls. -->
             <details class="snap-log-paste">
               <summary>${esc(t("snapPasteTitle"))}</summary>
               <textarea class="snap-log-paste-input" id="snapLogPasteInput"
                         spellcheck="false" autocapitalize="off" autocomplete="off"
                         placeholder='{
  "jsonrpc": "2.0",
  "id": 999,
  "method": "printer.objects.query",
  "params": { "objects": { "extruder": ["temperature", "target"] } }
}'></textarea>
               <div class="snap-log-paste-row">
                 <span class="snap-log-paste-error" id="snapLogPasteError" hidden></span>
                 <button type="button" class="snap-log-btn snap-log-paste-send" id="snapLogPasteSendBtn">
                   <span class="icon icon-play icon-13"></span>
                   <span>${esc(t("snapPasteSend"))}</span>
                 </button>
               </div>
             </details>

             <div id="snapLog">${renderSnapmakerLogInner(p)}</div>
           </div>
         </section>`
      : "";

    // Bambu Lab MQTT request log — same collapsible section, debug-only.
    const bblConn = (p.brand === "bambulab") ? bambuGetConn(bambuKey(p)) : null;
    const isBblPaused   = !!(bblConn?.logPaused);
    const bblLogExpanded = !!(bblConn?.logExpanded);
    const bblLogHtml = (p.brand === "bambulab")
      ? `<section class="pp-section pp-section--collapsible snap-log-section" data-collapsed="${bblLogExpanded ? "false" : "true"}">
           <button class="pp-section-head pp-section-head--btn" type="button">
             <span>${esc(t("snapLogTitle"))}
                   <span class="snap-log-count" id="bblLogCount">${(bblConn?.log?.length) || 0}</span>
                   ${isBblPaused ? `<span class="snap-log-paused-tag" id="bblLogPausedTag">${esc(t("snapLogPaused"))}</span>` : ""}
             </span>
             <span class="pp-chev icon icon-chevron-r icon-14"></span>
           </button>
           <div class="pp-section-body">
             <div class="snap-log-toolbar">
               <button type="button" class="snap-log-btn snap-log-btn--pause${isBblPaused ? " is-paused" : ""}" id="bblLogPauseBtn"
                       data-paused="${isBblPaused ? "true" : "false"}">
                 <span class="icon ${isBblPaused ? "icon-play" : "icon-pause"} icon-13"></span>
                 <span class="label">${esc(t(isBblPaused ? "snapLogResume" : "snapLogPause"))}</span>
               </button>
               <button type="button" class="snap-log-btn" id="bblLogClearBtn">
                 <span class="icon icon-trash icon-13"></span>
                 <span>${esc(t("snapLogClear"))}</span>
               </button>
             </div>
             <div id="bblLog">${renderBambuLogInner(p)}</div>
           </div>
         </section>`
      : "";

    // Anycubic MQTT request log — same collapsible section, debug-only.
    const acuConn = (p.brand === "anycubic") ? acuGetConn(acuKey(p)) : null;
    const isAcuPaused    = !!(acuConn?.logPaused);
    const acuLogExpanded = !!(acuConn?.logExpanded);
    const acuLogHtml = (p.brand === "anycubic")
      ? `<section class="pp-section pp-section--collapsible snap-log-section" data-collapsed="${acuLogExpanded ? "false" : "true"}">
           <button class="pp-section-head pp-section-head--btn" type="button">
             <span>${esc(t("snapLogTitle"))}
                   <span class="snap-log-count" id="acuLogCount">${(acuConn?.log?.length) || 0}</span>
                   ${isAcuPaused ? `<span class="snap-log-paused-tag" id="acuLogPausedTag">${esc(t("snapLogPaused"))}</span>` : ""}
             </span>
             <span class="pp-chev icon icon-chevron-r icon-14"></span>
           </button>
           <div class="pp-section-body">
             <div class="snap-log-toolbar">
               <button type="button" class="snap-log-btn snap-log-btn--pause${isAcuPaused ? " is-paused" : ""}" id="acuLogPauseBtn"
                       data-paused="${isAcuPaused ? "true" : "false"}">
                 <span class="icon ${isAcuPaused ? "icon-play" : "icon-pause"} icon-13"></span>
                 <span class="label">${esc(t(isAcuPaused ? "snapLogResume" : "snapLogPause"))}</span>
               </button>
               <button type="button" class="snap-log-btn" id="acuLogClearBtn">
                 <span class="icon icon-trash icon-13"></span>
                 <span>${esc(t("snapLogClear"))}</span>
               </button>
             </div>
             <div id="acuLog">${renderAnycubicLogInner(p)}</div>
           </div>
         </section>`
      : "";

    // Pills (next to the printer name on the title row): brand + model.
    // The online/offline status badge is rendered SEPARATELY on its
    // own row beneath the title — see #printerPanelStatus below.
    const titlePillsHtml = `
      <span class="pp-brand-pill pp-brand-pill--sm" style="--brand-accent:${meta.accent}">${esc(meta.label)}</span>
      ${modelName && modelName !== "—" ? `<span class="pp-model-pill pp-model-pill--sm">${esc(modelName)}</span>` : ""}
    `;
    $("printerPanelPills").innerHTML = titlePillsHtml;
    // Status row UNDER the title — Snapmaker (WebSocket) + FlashForge (HTTP
    // poll) both provide reachability info. Other brands fall through to
    // an empty string so the row collapses to zero height.
    const statusEl = $("printerPanelStatus");
    if (statusEl) {
      if (p.brand === "elegoo") {
        const elgOnlineSide = elegooIsOnline(p);
        const cls = elgOnlineSide === true ? "is-online" : elgOnlineSide === false ? "is-offline" : "is-checking";
        const lbl = elgOnlineSide === true  ? t("snapStatusOnline")
                  : elgOnlineSide === false ? t("snapStatusOffline")
                  :                           t("snapStatusConnecting");
        statusEl.innerHTML = `<span class="printer-online printer-online--side ${cls}" id="ppOnlineRow">
                                <span class="printer-online-dot"></span>
                                <span class="printer-online-lbl">${esc(lbl)}</span>
                              </span>`;
      } else {
        statusEl.innerHTML = (p.brand === "flashforge")
          ? renderFfgOnlineBadge(p, "side")
          : (p.brand === "creality")
          ? renderCreOnlineBadge(p, "side")
          : (p.brand === "bambulab")
          ? renderBambuOnlineBadge(p, "side")
          : (p.brand === "anycubic")
          ? renderAcuOnlineBadge(p, "side")
          : renderSnapOnlineBadge(p, "side");
      }
    }

    // Online status now lives in the panel header (next to the pills),
    // not under the camera. Trigger a fresh ping anyway so the badge
    // updates as soon as the side card opens.
    if (p.brand === "snapmaker" && p.ip) snapPingPrinter(p);
    if (p.brand === "flashforge" && p.ip) ffgPingPrinter(p);
    if (p.brand === "creality"   && p.ip) crePingPrinter(p);

    // Unregister the previous sidecard img from the MJPEG mux before wiping
    // the panel body. The img element is about to be replaced — removing it
    // from the mux's consumer set prevents stale references and avoids
    // setting blob: URLs on a detached node. The cam wall's img (if any)
    // stays registered and the fetch continues uninterrupted.
    if (p?.brand === "flashforge") {
      const oldImg = document.getElementById("ffgCamSideImg");
      if (oldImg) try { ffgMuxUnregister(ffgKey(p), oldImg); } catch {}
    }
    $("printerPanelBody").innerHTML = `
      ${camBannerHtml}
      <div class="pp-hero">
        ${p.isActive ? `<span class="pp-active">${esc(t("printersActive"))}</span>` : ""}
        ${heroImgHtml}
      </div>

      ${snapLiveHtml}
      ${ffgLiveHtml}
      ${creLiveHtml}
      ${elgLiveHtml}
      ${bblLiveHtml}
      ${acuLiveHtml}

      ${elgLogHtml}

      ${state.debugEnabled ? `
      <section class="pp-section pp-section--collapsible" data-collapsed="true">
        <button class="pp-section-head pp-section-head--btn" type="button">
          <span>${esc(t("printerSecRaw"))}</span>
          <span class="pp-chev icon icon-chevron-r icon-14"></span>
        </button>
        <div class="pp-section-body">
          <div class="pp-raw-wrap">
            <button class="pp-raw-copy pp-copy" data-copy-raw="1" title="${esc(t("copyLabel"))}">
              <span class="icon icon-copy icon-13"></span>
              <span>${esc(t("copyLabel"))}</span>
            </button>
            <pre class="pp-raw">${esc(JSON.stringify(p, null, 2))}</pre>
          </div>
        </div>
      </section>

      ${snapLogHtml}
      ${ffgLogHtml}
      ${creLogHtml}
      ${bblLogHtml}
      ${acuLogHtml}` : ""}`;

    // Creality camera — register the sidecard's <video> as a stream consumer,
    // then start (or reuse) the WebRTC connection.  addCreCamConsumer() is
    // safe to call even before the stream arrives — it queues the element and
    // attaches srcObject the moment ontrack fires.
    if (p.brand === "creality") {
      const _creSidecardVideo = $("creCamContainer")?.querySelector(".cre-cam-video");
      if (_creSidecardVideo) addCreCamConsumer(_creSidecardVideo);
      if (creConn?.status === "connected" && creConn?.ip) startCreCam(creConn.ip);
    }

    // Wire interactions
    const body = $("printerPanelBody");
    body.querySelectorAll(".pp-eye").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const wrap = btn.closest(".pp-row-val");
        const sec  = wrap?.querySelector(".pp-secret");
        if (!sec) return;
        const revealed = sec.dataset.revealed === "true";
        if (revealed) {
          sec.dataset.revealed = "false";
          const val = sec.dataset.secret || "";
          sec.textContent = "•".repeat(Math.min(12, val.length));
          btn.title = t("printerSecretShow");
        } else {
          sec.dataset.revealed = "true";
          sec.textContent = sec.dataset.secret || "";
          btn.title = t("printerSecretHide");
        }
      });
    });
    body.querySelectorAll(".pp-copy").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        // Two flavors: per-row copy (data-copy="value") and the raw-JSON
        // copy in the collapsible Raw data section (data-copy-raw="1").
        // Reading the JSON from _activePrinter rather than a frozen
        // dataset string keeps the copy in sync with live snapshots.
        let v = "";
        if (btn.dataset.copyRaw === "1") {
          v = _activePrinter ? JSON.stringify(_activePrinter, null, 2) : "";
        } else {
          v = btn.dataset.copy || "";
        }
        if (!v) return;
        try {
          navigator.clipboard.writeText(v);
          btn.classList.add("pp-copy--ok");
          setTimeout(() => btn.classList.remove("pp-copy--ok"), 900);
        } catch (_) {}
      });
    });

    // Bambu RTSP "Open" button — opens the rtsps:// URL in VLC / default player.
    body.querySelectorAll(".bbl-rtsp-open-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const url = btn.dataset.openUrl || "";
        if (!url) return;
        try { window.electronAPI?.openExternal(url); } catch (_) {}
      });
    });
    body.querySelectorAll(".pp-section--collapsible .pp-section-head--btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const sec = btn.closest(".pp-section");
        const collapsed = sec.dataset.collapsed === "true";
        sec.dataset.collapsed = collapsed ? "false" : "true";
        // Persist the FlashForge Request log open state on the conn so
        // it survives partial / full re-renders triggered by polling.
        if (sec.classList.contains("snap-log-section")
            && _activePrinter?.brand === "flashforge") {
          const conn = ffgGetConn(ffgKey(_activePrinter));
          if (conn) conn.logExpanded = collapsed;  // newly expanded if was collapsed
        }
      });
    });

    // Snapmaker log interactions — delegated on the panel body so partial
    // re-renders of #snapLog don't lose the wiring. (The collapsible
    // section header itself is wired by the standard pass above — adding
    // it here would double-toggle and the section would never visibly open.)
    if (!body.dataset.snapDelegated) {
      body.dataset.snapDelegated = "1";
      // FlashForge MJPEG `<img>` error capture. Image-element error
      // events DON'T bubble, so we listen on the panel body in CAPTURE
      // phase to catch them. Triggers when the printer rejects the
      // stream (1-client limit), times out, or returns a non-image
      // response. We flip conn.camFailed and swap the banner inner —
      // user sees the printer photo + retry button instead of nothing.
      body.addEventListener("error", e => {
        const tgt = e.target;
        if (!(tgt instanceof HTMLElement)) return;
        if (!tgt.classList?.contains("ffg-camera-img")) return;
        if (!_activePrinter || _activePrinter.brand !== "flashforge") return;
        const conn = ffgGetConn(ffgKey(_activePrinter));
        if (!conn || conn.camFailed) return;
        conn.camFailed = true;
        ffgRefreshCamBanner();
      }, /*useCapture*/ true);
      // Anycubic — print-speed mode dropdown (Silent/Standard/Sport).
      body.addEventListener("change", e => {
        const speedSel = e.target.closest("[data-acu-speed]");
        if (speedSel && _activePrinter?.brand === "anycubic") {
          const conn = acuGetConn(acuKey(_activePrinter));
          if (conn) acuSetSpeedMode(conn, parseInt(speedSel.value, 10) || 0);
        }
        // Bambu Lab — print-speed level dropdown (Silent/Standard/Sport/Ludicrous).
        const bblSpeedSel = e.target.closest("[data-bbl-speed]");
        if (bblSpeedSel && _activePrinter?.brand === "bambulab") {
          const conn = bambuGetConn(bambuKey(_activePrinter));
          if (conn) bambuSetSpeedMode(conn, parseInt(bblSpeedSel.value, 10) || 0);
        }
      });
      body.addEventListener("click", e => {
        // ── Snapmaker temperature target — click pill to set consigne ────
        const tempTrigger = e.target.closest("[data-snap-set-temp]");
        if (tempTrigger && _activePrinter?.brand === "snapmaker") {
          if (tempTrigger.classList.contains("snap-temp--editing")) return;
          const heater  = tempTrigger.dataset.snapSetTemp;
          const initVal = parseInt(tempTrigger.dataset.snapTempTarget ?? "0", 10);
          const maxVal  = parseInt(tempTrigger.dataset.snapTempMax ?? "320", 10);
          const valEl   = tempTrigger.querySelector(".snap-temp-val");
          if (!valEl) return;

          const input = document.createElement("input");
          input.type = "number"; input.min = "0"; input.max = String(maxVal);
          input.value = initVal; input.className = "snap-temp-set-input";

          tempTrigger.classList.add("snap-temp--editing");
          tempTrigger.dataset.editing = "1";
          valEl.replaceWith(input);
          input.focus(); input.select();

          const restore = () => {
            if (!input.isConnected) return;
            input.replaceWith(valEl);
            tempTrigger.classList.remove("snap-temp--editing");
            delete tempTrigger.dataset.editing;
          };
          const confirm = () => {
            const val = parseInt(input.value, 10);
            if (!isNaN(val) && val >= 0 && val <= maxVal) {
              const conn = snapGetConn(snapKey(_activePrinter));
              if (conn) snapSendGcode(conn, `SET_HEATER_TEMPERATURE HEATER=${heater} TARGET=${val}`);
            }
            restore();
          };
          input.addEventListener("keydown", ev => {
            if (ev.key === "Enter")  { ev.preventDefault(); confirm(); }
            if (ev.key === "Escape") { ev.preventDefault(); restore(); }
          });
          input.addEventListener("blur", restore);
          return;
        }

        // Filament edit — color square or edit icon (only when editable).
        const filEditTrigger = e.target.closest("[data-snap-fil-edit]");
        if (filEditTrigger) {
          const card = filEditTrigger.closest(".snap-fil");
          const idx = parseInt(card?.dataset?.extruderIdx ?? "-1", 10);
          if (idx >= 0 && _activePrinter) openSnapFilamentEdit(_activePrinter, idx);
          return;
        }
        // FlashForge — same idea, distinct selector so Snapmaker's
        // bottom-sheet doesn't pop for FlashForge slots.
        const ffgFilTrigger = e.target.closest("[data-ffg-fil-edit]");
        if (ffgFilTrigger) {
          const card = ffgFilTrigger.closest(".snap-fil");
          const idx = parseInt(card?.dataset?.extruderIdx ?? "-1", 10);
          if (idx >= 0 && _activePrinter && _activePrinter.brand === "flashforge") {
            openFlashforgeFilamentEdit(_activePrinter, idx);
          }
          return;
        }
        // Creality — filament edit
        const creFilTrigger = e.target.closest("[data-cre-fil-edit]");
        if (creFilTrigger) {
          const card    = creFilTrigger.closest(".snap-fil");
          const boxId   = parseInt(card?.dataset?.boxId   ?? "-1", 10);
          const slotIdx = parseInt(card?.dataset?.slotIdx ?? "-1", 10);
          if (boxId >= 0 && slotIdx >= 0 && _activePrinter?.brand === "creality") {
            openCreFilamentEdit(_activePrinter, boxId, slotIdx);
          }
          return;
        }
        // Elegoo — filament edit (tray slot squares)
        const elgFilTrigger = e.target.closest("[data-elg-fil-edit]");
        if (elgFilTrigger) {
          const idx = parseInt(elgFilTrigger.dataset.trayIdx ?? "0", 10);
          if (_activePrinter?.brand === "elegoo") {
            openElegooFilamentEdit(_activePrinter, idx);
          }
          return;
        }
        // Bambu Lab — filament edit (AMS slot squares + Ext.)
        const bblFilTrigger = e.target.closest("[data-bbl-fil-edit]");
        if (bblFilTrigger) {
          const amsId  = parseInt(bblFilTrigger.dataset.amsId  ?? "255", 10);
          const trayId = parseInt(bblFilTrigger.dataset.trayId ?? "254", 10);
          if (_activePrinter?.brand === "bambulab") {
            openBambuFilamentEdit(_activePrinter, amsId, trayId);
          }
          return;
        }
        // Anycubic — filament edit (ACE slot squares + Ext. spool, box -1)
        const acuFilTrigger = e.target.closest("[data-acu-fil-edit]");
        if (acuFilTrigger) {
          const boxId  = parseInt(acuFilTrigger.dataset.boxId  ?? "0", 10);
          const slotId = parseInt(acuFilTrigger.dataset.slotId ?? "0", 10);
          if (_activePrinter?.brand === "anycubic") {
            openAcuFilamentEdit(_activePrinter, boxId, slotId);
          }
          return;
        }
        // Anycubic — print control (pause / resume / stop), PROTOCOL.md §5d.
        const acuPrintBtn = e.target.closest("[data-acu-print]");
        if (acuPrintBtn && _activePrinter?.brand === "anycubic") {
          const conn = acuGetConn(acuKey(_activePrinter));
          if (conn) acuPrintControl(conn, acuPrintBtn.dataset.acuPrint);
          return;
        }
        // Anycubic — temperature target: click pill → inline number input
        // (mirrors the Snapmaker set-consigne UX).
        const acuTempTrigger = e.target.closest("[data-acu-set-temp]");
        if (acuTempTrigger && _activePrinter?.brand === "anycubic") {
          if (acuTempTrigger.classList.contains("snap-temp--editing")) return;
          const which   = acuTempTrigger.dataset.acuSetTemp;
          const initVal = parseInt(acuTempTrigger.dataset.acuTempTarget ?? "0", 10);
          const maxVal  = parseInt(acuTempTrigger.dataset.acuTempMax ?? "300", 10);
          const valEl   = acuTempTrigger.querySelector(".snap-temp-val");
          if (!valEl) return;
          const input = document.createElement("input");
          input.type = "number"; input.min = "0"; input.max = String(maxVal);
          input.value = initVal; input.className = "snap-temp-set-input";
          acuTempTrigger.classList.add("snap-temp--editing");
          valEl.replaceWith(input);
          input.focus(); input.select();
          // `done` makes restore/confirm idempotent: removing the focused input
          // fires `blur` synchronously, so without this the Enter path would
          // re-enter and `replaceWith` would throw NotFoundError on a node that
          // was already swapped out.
          let done = false;
          const restore = () => {
            if (done) return;
            done = true;
            if (input.parentNode) { try { input.replaceWith(valEl); } catch (_) {} }
            acuTempTrigger.classList.remove("snap-temp--editing");
          };
          const confirmTemp = () => {
            if (done) return;
            const val = parseInt(input.value, 10);
            if (!isNaN(val) && val >= 0 && val <= maxVal) {
              const conn = acuGetConn(acuKey(_activePrinter));
              if (conn) acuSetTemp(conn, which, val);
            }
            restore();
          };
          input.addEventListener("keydown", ev => {
            if (ev.key === "Enter")  { ev.preventDefault(); confirmTemp(); }
            if (ev.key === "Escape") { ev.preventDefault(); restore(); }
          });
          // Clicking away applies the value (not cancels) — matches what users
          // expect; Escape still cancels.
          input.addEventListener("blur", confirmTemp);
          return;
        }
        // Anycubic — light toggle.
        const acuLightBtn = e.target.closest("[data-acu-light]");
        if (acuLightBtn && _activePrinter?.brand === "anycubic") {
          const conn = acuGetConn(acuKey(_activePrinter));
          if (conn) acuLight(conn, !conn.data?.lightOn);
          return;
        }
        // Anycubic — disable steppers.
        if (e.target.closest("[data-acu-motors-off]") && _activePrinter?.brand === "anycubic") {
          const conn = acuGetConn(acuKey(_activePrinter));
          if (conn) acuMotorsOff(conn);
          return;
        }
        // Anycubic — jog an axis (step read live from the #acuCtrlStep select).
        const acuJogBtn = e.target.closest("[data-acu-jog]");
        if (acuJogBtn && _activePrinter?.brand === "anycubic") {
          const conn = acuGetConn(acuKey(_activePrinter));
          const stepSel = document.getElementById("acuCtrlStep");
          const step = stepSel ? (parseFloat(stepSel.value) || 10) : 10;
          const dir  = acuJogBtn.dataset.acuDir === "-" ? -1 : 1;
          if (conn) acuMove(conn, acuJogBtn.dataset.acuJog, dir * step);
          return;
        }
        // Anycubic — home an axis / all.
        const acuHomeBtn = e.target.closest("[data-acu-home]");
        if (acuHomeBtn && _activePrinter?.brand === "anycubic") {
          const conn = acuGetConn(acuKey(_activePrinter));
          if (conn) acuHome(conn, acuHomeBtn.dataset.acuHome);
          return;
        }
        // Anycubic — fan toggle (0 ↔ 100%).
        if (e.target.closest("[data-acu-fan-toggle]") && _activePrinter?.brand === "anycubic") {
          const conn = acuGetConn(acuKey(_activePrinter));
          if (conn) acuFan(conn, (conn.data?.fanSpeedPct || 0) > 0 ? 0 : 100);
          return;
        }
        // Anycubic — fan step ±.
        const acuFanStepBtn = e.target.closest("[data-acu-fan-step]");
        if (acuFanStepBtn && _activePrinter?.brand === "anycubic") {
          const conn  = acuGetConn(acuKey(_activePrinter));
          const delta = parseInt(acuFanStepBtn.dataset.dist, 10) || 0;
          if (conn) acuFan(conn, Math.max(0, Math.min(100, (conn.data?.fanSpeedPct || 0) + delta)));
          return;
        }
        // ── Bambu Lab — machine controls (mirrors the Anycubic handlers) ─────
        // Print control (pause / resume / stop), PROTOCOL.md §5.1-5.3.
        const bblPrintBtn = e.target.closest("[data-bbl-print]");
        if (bblPrintBtn && _activePrinter?.brand === "bambulab") {
          const conn = bambuGetConn(bambuKey(_activePrinter));
          if (conn) bambuPrintControl(conn, bblPrintBtn.dataset.bblPrint);
          return;
        }
        // Temperature target: click pill → inline number input (preheat).
        const bblTempTrigger = e.target.closest("[data-bbl-set-temp]");
        if (bblTempTrigger && _activePrinter?.brand === "bambulab") {
          if (bblTempTrigger.classList.contains("snap-temp--editing")) return;
          const which   = bblTempTrigger.dataset.bblSetTemp;
          const initVal = parseInt(bblTempTrigger.dataset.bblTempTarget ?? "0", 10);
          const maxVal  = parseInt(bblTempTrigger.dataset.bblTempMax ?? "300", 10);
          const valEl   = bblTempTrigger.querySelector(".snap-temp-val");
          if (!valEl) return;
          const input = document.createElement("input");
          input.type = "number"; input.min = "0"; input.max = String(maxVal);
          input.value = initVal; input.className = "snap-temp-set-input";
          bblTempTrigger.classList.add("snap-temp--editing");
          valEl.replaceWith(input);
          input.focus(); input.select();
          let done = false;
          const restore = () => {
            if (done) return;
            done = true;
            if (input.parentNode) { try { input.replaceWith(valEl); } catch (_) {} }
            bblTempTrigger.classList.remove("snap-temp--editing");
          };
          const confirmTemp = () => {
            if (done) return;
            const val = parseInt(input.value, 10);
            if (!isNaN(val) && val >= 0 && val <= maxVal) {
              const conn = bambuGetConn(bambuKey(_activePrinter));
              if (conn) bambuSetTemp(conn, which, val);
            }
            restore();
          };
          input.addEventListener("keydown", ev => {
            if (ev.key === "Enter")  { ev.preventDefault(); confirmTemp(); }
            if (ev.key === "Escape") { ev.preventDefault(); restore(); }
          });
          input.addEventListener("blur", confirmTemp);
          return;
        }
        // Light toggle.
        const bblLightBtn = e.target.closest("[data-bbl-light]");
        if (bblLightBtn && _activePrinter?.brand === "bambulab") {
          const conn = bambuGetConn(bambuKey(_activePrinter));
          if (conn) bambuLight(conn, !conn.data?.lightOn);
          return;
        }
        // Disable steppers.
        if (e.target.closest("[data-bbl-motors-off]") && _activePrinter?.brand === "bambulab") {
          const conn = bambuGetConn(bambuKey(_activePrinter));
          if (conn) bambuMotorsOff(conn);
          return;
        }
        // Jog an axis (step read live from the #bblCtrlStep select).
        const bblJogBtn = e.target.closest("[data-bbl-jog]");
        if (bblJogBtn && _activePrinter?.brand === "bambulab") {
          const conn = bambuGetConn(bambuKey(_activePrinter));
          const stepSel = document.getElementById("bblCtrlStep");
          const step = stepSel ? (parseFloat(stepSel.value) || 10) : 10;
          const dir  = bblJogBtn.dataset.bblDir === "-" ? -1 : 1;
          if (conn) bambuMove(conn, bblJogBtn.dataset.bblJog, dir * step);
          return;
        }
        // Home an axis / all.
        const bblHomeBtn = e.target.closest("[data-bbl-home]");
        if (bblHomeBtn && _activePrinter?.brand === "bambulab") {
          const conn = bambuGetConn(bambuKey(_activePrinter));
          if (conn) bambuHome(conn, bblHomeBtn.dataset.bblHome);
          return;
        }
        // Fan toggle (0 ↔ 100%). fan 1 = part, 2 = auxiliary, 3 = chamber.
        const bblFanToggle = e.target.closest("[data-bbl-fan-toggle]");
        if (bblFanToggle && _activePrinter?.brand === "bambulab") {
          const conn = bambuGetConn(bambuKey(_activePrinter));
          const fan  = parseInt(bblFanToggle.dataset.bblFanToggle, 10) || 1;
          if (conn) bambuFan(conn, bambuFanPct(conn, fan) > 0 ? 0 : 100, fan);
          return;
        }
        // Fan step ±.
        const bblFanStepBtn = e.target.closest("[data-bbl-fan-step]");
        if (bblFanStepBtn && _activePrinter?.brand === "bambulab") {
          const conn  = bambuGetConn(bambuKey(_activePrinter));
          const fan   = parseInt(bblFanStepBtn.dataset.bblFanStep, 10) || 1;
          const delta = parseInt(bblFanStepBtn.dataset.dist, 10) || 0;
          if (conn) bambuFan(conn, Math.max(0, Math.min(100, bambuFanPct(conn, fan) + delta)), fan);
          return;
        }
        // FlashForge — Retry camera button. Restarts the MJPEG mux fetch
        // and swaps the camera banner so #ffgCamSideImg is fresh.
        // The rest of the sidecard (log, edits) stays untouched.
        if (e.target.closest("[data-ffg-cam-retry]")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter || _activePrinter.brand !== "flashforge") return;
          const conn = ffgGetConn(ffgKey(_activePrinter));
          if (!conn) return;
          // Unregister old sidecard img, rebuild banner, restart + re-register.
          const _retryKey = ffgKey(_activePrinter);
          const _oldRetryImg = document.getElementById("ffgCamSideImg");
          if (_oldRetryImg) try { ffgMuxUnregister(_retryKey, _oldRetryImg); } catch {}
          conn.camFailed = false;
          ffgRefreshCamBanner(); // injects fresh #ffgCamSideImg
          const _retryUrl = ffgCamBaseUrl(_activePrinter);
          if (_retryUrl) {
            ffgMuxStart(_retryKey, _retryUrl); // start or resume
            const _retryImg = document.getElementById("ffgCamSideImg");
            if (_retryImg) ffgMuxRegister(_retryKey, _retryImg);
          }
          return;
        }
        // Pause / Resume — surgical update. We deliberately AVOID a full
        // renderPrinterDetail() here because that resets the section's
        // `data-collapsed` attribute to its template default, which
        // would close the Request Log section right under the user.
        if (e.target.closest("#snapLogPauseBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = snapGetConn(snapKey(_activePrinter));
          if (!conn) return;
          conn.logPaused = !conn.logPaused;
          const btn  = $("snapLogPauseBtn");
          const icon = btn?.querySelector(".icon");
          const lbl  = btn?.querySelector(".label");
          if (btn) {
            btn.classList.toggle("is-paused", conn.logPaused);
            btn.dataset.paused = String(conn.logPaused);
          }
          if (icon) {
            icon.classList.toggle("icon-pause", !conn.logPaused);
            icon.classList.toggle("icon-play",   conn.logPaused);
          }
          if (lbl) lbl.textContent = t(conn.logPaused ? "snapLogResume" : "snapLogPause");
          // PAUSED tag next to the count — create / remove on the fly.
          let tag = $("snapLogPausedTag");
          if (conn.logPaused && !tag) {
            const headSpan = btn?.closest(".snap-log-section")
                                ?.querySelector(".pp-section-head--btn > span");
            if (headSpan) {
              tag = document.createElement("span");
              tag.id = "snapLogPausedTag";
              tag.className = "snap-log-paused-tag";
              tag.textContent = t("snapLogPaused");
              headSpan.appendChild(tag);
            }
          } else if (!conn.logPaused && tag) {
            tag.remove();
          }
          return;
        }
        // Clear — wipe the visible buffer in place.
        if (e.target.closest("#snapLogClearBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = snapGetConn(snapKey(_activePrinter));
          if (!conn) return;
          conn.log = [];
          const host = $("snapLog");
          if (host) host.innerHTML = renderSnapmakerLogInner(_activePrinter);
          const countEl = $("snapLogCount");
          if (countEl) countEl.textContent = "0";
          return;
        }
        // Send custom JSON — paste zone in the log section.
        if (e.target.closest("#snapLogPasteSendBtn")) {
          e.preventDefault();
          e.stopPropagation();
          snapSendCustomJson();
          return;
        }
        // FlashForge — Pause / Resume. Same surgical update pattern as
        // the Snapmaker handler above to avoid resetting the log
        // section's `data-collapsed` state under the user's cursor.
        if (e.target.closest("#ffgLogPauseBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = ffgGetConn(ffgKey(_activePrinter));
          if (!conn) return;
          conn.logPaused = !conn.logPaused;
          const btn  = $("ffgLogPauseBtn");
          const icon = btn?.querySelector(".icon");
          const lbl  = btn?.querySelector(".label");
          if (btn) {
            btn.classList.toggle("is-paused", conn.logPaused);
            btn.dataset.paused = String(conn.logPaused);
          }
          if (icon) {
            icon.classList.toggle("icon-pause", !conn.logPaused);
            icon.classList.toggle("icon-play",   conn.logPaused);
          }
          if (lbl) lbl.textContent = t(conn.logPaused ? "snapLogResume" : "snapLogPause");
          let tag = $("ffgLogPausedTag");
          if (conn.logPaused && !tag) {
            const headSpan = btn?.closest(".snap-log-section")
                                ?.querySelector(".pp-section-head--btn > span");
            if (headSpan) {
              tag = document.createElement("span");
              tag.id = "ffgLogPausedTag";
              tag.className = "snap-log-paused-tag";
              tag.textContent = t("snapLogPaused");
              headSpan.appendChild(tag);
            }
          } else if (!conn.logPaused && tag) {
            tag.remove();
          }
          return;
        }
        // FlashForge — Clear log buffer in place.
        if (e.target.closest("#ffgLogClearBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = ffgGetConn(ffgKey(_activePrinter));
          if (!conn) return;
          conn.log = [];
          const host = $("ffgLog");
          if (host) host.innerHTML = renderFlashforgeLogInner(_activePrinter);
          const countEl = $("ffgLogCount");
          if (countEl) countEl.textContent = "0";
          return;
        }
        // Creality — Pause / Resume log.
        if (e.target.closest("#creLogPauseBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = creGetConn(creKey(_activePrinter));
          if (!conn) return;
          conn.logPaused = !conn.logPaused;
          const btn = $("creLogPauseBtn");
          if (btn) {
            btn.dataset.paused = conn.logPaused ? "true" : "false";
            btn.classList.toggle("is-paused", conn.logPaused);
            const icon  = btn.querySelector(".icon");
            const label = btn.querySelector(".label");
            if (icon)  icon.className  = `icon ${conn.logPaused ? "icon-play" : "icon-pause"} icon-13`;
            if (label) label.textContent = t(conn.logPaused ? "snapLogResume" : "snapLogPause");
          }
          return;
        }
        // Creality — Clear log buffer.
        if (e.target.closest("#creLogClearBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = creGetConn(creKey(_activePrinter));
          if (!conn) return;
          conn.log = [];
          const host = $("creLog");
          if (host) host.innerHTML = renderCreLogInner(_activePrinter);
          const countEl = $("creLogCount");
          if (countEl) countEl.textContent = "0";
          return;
        }
        // Elegoo — Pause/Resume MQTT log.
        if (e.target.closest("#elgLogPauseBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = elegooGetConn(elegooKey(_activePrinter));
          if (!conn) return;
          conn.logPaused = !conn.logPaused;
          const btn = $("elgLogPauseBtn");
          if (btn) {
            btn.dataset.paused = conn.logPaused ? "true" : "false";
            btn.classList.toggle("is-paused", conn.logPaused);
            const icon  = btn.querySelector(".icon");
            const label = btn.querySelector(".label");
            if (icon)  icon.className  = `icon ${conn.logPaused ? "icon-play" : "icon-pause"} icon-13`;
            if (label) label.textContent = t(conn.logPaused ? "snapLogResume" : "snapLogPause");
          }
          return;
        }
        // Elegoo — Clear MQTT log buffer.
        if (e.target.closest("#elgLogClearBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = elegooGetConn(elegooKey(_activePrinter));
          if (!conn) return;
          conn.log = [];
          const host = $("elgLog");
          if (host) host.innerHTML = renderElegooLogInner(_activePrinter);
          const countEl = $("elgLogCount");
          if (countEl) countEl.textContent = "0";
          return;
        }
        // Bambu Lab — Pause / Resume MQTT log.
        if (e.target.closest("#bblLogPauseBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = bambuGetConn(bambuKey(_activePrinter));
          if (!conn) return;
          conn.logPaused = !conn.logPaused;
          const btn = $("bblLogPauseBtn");
          if (btn) {
            btn.dataset.paused = conn.logPaused ? "true" : "false";
            btn.classList.toggle("is-paused", conn.logPaused);
            const icon  = btn.querySelector(".icon");
            const label = btn.querySelector(".label");
            if (icon)  icon.className  = `icon ${conn.logPaused ? "icon-play" : "icon-pause"} icon-13`;
            if (label) label.textContent = t(conn.logPaused ? "snapLogResume" : "snapLogPause");
          }
          return;
        }
        // Bambu Lab — Clear MQTT log buffer.
        if (e.target.closest("#bblLogClearBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = bambuGetConn(bambuKey(_activePrinter));
          if (!conn) return;
          conn.log = [];
          const host = $("bblLog");
          if (host) host.innerHTML = renderBambuLogInner(_activePrinter);
          const countEl = $("bblLogCount");
          if (countEl) countEl.textContent = "0";
          return;
        }
        // Anycubic — Pause / Resume MQTT log.
        if (e.target.closest("#acuLogPauseBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = acuGetConn(acuKey(_activePrinter));
          if (!conn) return;
          conn.logPaused = !conn.logPaused;
          const btn = $("acuLogPauseBtn");
          if (btn) {
            btn.dataset.paused = conn.logPaused ? "true" : "false";
            btn.classList.toggle("is-paused", conn.logPaused);
            const icon  = btn.querySelector(".icon");
            const label = btn.querySelector(".label");
            if (icon)  icon.className  = `icon ${conn.logPaused ? "icon-play" : "icon-pause"} icon-13`;
            if (label) label.textContent = t(conn.logPaused ? "snapLogResume" : "snapLogPause");
          }
          return;
        }
        // Anycubic — Clear MQTT log buffer.
        if (e.target.closest("#acuLogClearBtn")) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter) return;
          const conn = acuGetConn(acuKey(_activePrinter));
          if (!conn) return;
          conn.log = [];
          const host = $("acuLog");
          if (host) host.innerHTML = renderAnycubicLogInner(_activePrinter);
          const countEl = $("acuLogCount");
          if (countEl) countEl.textContent = "0";
          return;
        }
        // Creality — LED toggle (click) + open file sheet (folder button).
        const creActionTrigger = e.target.closest("[data-cre-action]");
        if (creActionTrigger) {
          e.preventDefault();
          e.stopPropagation();
          if (!_activePrinter || _activePrinter.brand !== "creality") return;
          if (creActionTrigger.dataset.creAction === "led") creActionLed(_activePrinter);
          return;
        }
        if (e.target.closest("[data-cre-open-files]")) {
          e.preventDefault(); e.stopPropagation();
          if (_activePrinter?.brand === "creality") openCreFileSheet(_activePrinter);
          return;
        }
        if (e.target.closest("[data-elg-open-files]")) {
          e.preventDefault(); e.stopPropagation();
          if (_activePrinter?.brand === "elegoo") openElegooFileSheet(_activePrinter);
          return;
        }

        // ── Snapmaker Control card ──────────────────────────────────────────
        // Jog: [data-snap-ctrl-jog="x|y|z"] [data-dist="±N"]
        const snapJogBtn = e.target.closest("[data-snap-ctrl-jog]");
        if (snapJogBtn && _activePrinter?.brand === "snapmaker") {
          e.preventDefault();
          const axis = snapJogBtn.dataset.snapCtrlJog?.toLowerCase();
          const dist = parseFloat(snapJogBtn.dataset.dist);
          if (axis && !isNaN(dist)) {
            const conn = snapGetConn(snapKey(_activePrinter));
            const fr   = axis === "z" ? 600 : 6000;
            if (conn) snapSendGcode(conn,
              `G91\nG1 ${axis.toUpperCase()}${dist} F${fr}\nG90`);
          }
          return;
        }

        // Home: [data-snap-ctrl-home="X|Y|Z|XY|XYZ"]
        const snapHomeBtn = e.target.closest("[data-snap-ctrl-home]");
        if (snapHomeBtn && _activePrinter?.brand === "snapmaker") {
          e.preventDefault();
          const axes = snapHomeBtn.dataset.snapCtrlHome || "XYZ";
          const conn = snapGetConn(snapKey(_activePrinter));
          if (conn) snapSendGcode(conn, `G28 ${axes === "XYZ" ? "" : axes}`.trim());
          return;
        }

        // Fan toggle: [data-snap-fan-toggle="main|cavity"]
        const snapFanToggle = e.target.closest("[data-snap-fan-toggle]");
        if (snapFanToggle && _activePrinter?.brand === "snapmaker") {
          e.preventDefault();
          const fanKey = snapFanToggle.dataset.snapFanToggle;
          const conn   = snapGetConn(snapKey(_activePrinter));
          if (conn && fanKey) {
            if (fanKey === "main") {
              const cur  = conn.data.fanSpeed ?? 0;
              const newS = Math.round((cur > 0 ? 0 : 1) * 255);
              snapSendGcode(conn, newS === 0 ? "M107" : `M106 S${newS}`);
            } else if (fanKey === "cavity") {
              const cur     = conn.data.fanAuxSpeed ?? 0;
              const newSpeed = cur > 0 ? 0 : 1;
              snapSendGcode(conn, `SET_FAN_SPEED FAN=cavity_fan SPEED=${newSpeed}`);
            }
          }
          return;
        }

        // LED toggle: [data-snap-ctrl-led]
        const snapLedBtn = e.target.closest("[data-snap-ctrl-led]");
        if (snapLedBtn && _activePrinter?.brand === "snapmaker") {
          e.preventDefault();
          const conn = snapGetConn(snapKey(_activePrinter));
          if (conn) {
            const on = !conn.data.ledOn;
            conn.data.ledOn = on; // optimistic local toggle
            const v = on ? 1 : 0;
            snapSendGcode(conn, `SET_LED LED=cavity_led RED=${v} GREEN=${v} BLUE=${v} WHITE=${v} SYNC=0`);
          }
          return;
        }

        // Fan step ±: [data-snap-fan-step="main|cavity"] [data-dist="±10"]
        const snapFanStepBtn = e.target.closest("[data-snap-fan-step]");
        if (snapFanStepBtn && _activePrinter?.brand === "snapmaker") {
          e.preventDefault();
          const fanKey = snapFanStepBtn.dataset.snapFanStep;
          const delta  = parseInt(snapFanStepBtn.dataset.dist, 10);
          const conn   = snapGetConn(snapKey(_activePrinter));
          if (conn && fanKey && !isNaN(delta)) {
            if (fanKey === "main") {
              const newF = snapFanStep(conn.data.fanSpeed, delta);
              const newS = Math.round(newF * 255);
              snapSendGcode(conn, newS === 0 ? "M107" : `M106 S${newS}`);
            } else if (fanKey === "cavity") {
              const newF = snapFanStep(conn.data.fanAuxSpeed, delta);
              snapSendGcode(conn, `SET_FAN_SPEED FAN=cavity_fan SPEED=${newF.toFixed(4)}`);
            }
          }
          return;
        }

        // ── Elegoo Control card ─────────────────────────────────────────────
        // Jog axis: [data-elg-ctrl-jog="x|y|z"] [data-dist="±N"]
        const jogBtn = e.target.closest("[data-elg-ctrl-jog]");
        if (jogBtn && _activePrinter?.brand === "elegoo") {
          e.preventDefault(); e.stopPropagation();
          const axis = jogBtn.dataset.elgCtrlJog;
          const dist = parseFloat(jogBtn.dataset.dist);
          if (axis && !isNaN(dist)) {
            elegooSendCmd(elegooKey(_activePrinter), 1027, { axes: axis, distance: dist });
          }
          return;
        }

        // Home axes: [data-elg-ctrl-home="xy|z|xyz"]
        const homeBtn = e.target.closest("[data-elg-ctrl-home]");
        if (homeBtn && _activePrinter?.brand === "elegoo") {
          e.preventDefault(); e.stopPropagation();
          const axes = homeBtn.dataset.elgCtrlHome || "xyz";
          elegooSendCmd(elegooKey(_activePrinter), 1026, { homed_axes: axes });
          return;
        }

        // Fan toggle: [data-elg-ctrl-fan-toggle="fan|aux_fan|box_fan"]
        const fanToggle = e.target.closest("[data-elg-ctrl-fan-toggle]");
        if (fanToggle && _activePrinter?.brand === "elegoo") {
          e.preventDefault(); e.stopPropagation();
          const fanKey = fanToggle.dataset.elgCtrlFanToggle;
          const conn   = elegooGetConn(elegooKey(_activePrinter));
          if (conn && fanKey) {
            const cur = fanKey === "fan"     ? conn.data.fanModel
                      : fanKey === "aux_fan" ? conn.data.fanAux
                      :                       conn.data.fanBox;
            const newVal = (typeof cur === "number" && cur > 0) ? 0 : 255; // toggle: off→100%, on→off
            elegooSendCmd(elegooKey(_activePrinter), 1030, { [fanKey]: newVal });
          }
          return;
        }

        // Fan step ±: [data-elg-ctrl-fan-step="fan|aux_fan|box_fan"] [data-step="±26"]
        const fanStep = e.target.closest("[data-elg-ctrl-fan-step]");
        if (fanStep && _activePrinter?.brand === "elegoo") {
          e.preventDefault(); e.stopPropagation();
          const fanKey = fanStep.dataset.elgCtrlFanStep;
          const delta  = parseInt(fanStep.dataset.step, 10);
          const conn   = elegooGetConn(elegooKey(_activePrinter));
          if (conn && fanKey && !isNaN(delta)) {
            const cur = fanKey === "fan"     ? conn.data.fanModel
                      : fanKey === "aux_fan" ? conn.data.fanAux
                      :                       conn.data.fanBox;
            elegooSendCmd(elegooKey(_activePrinter), 1030, { [fanKey]: elgFanStep(cur, delta) });
          }
          return;
        }

        // LED toggle: [data-elg-ctrl-led]
        const ledToggle = e.target.closest("[data-elg-ctrl-led]");
        if (ledToggle && _activePrinter?.brand === "elegoo") {
          e.preventDefault(); e.stopPropagation();
          const conn = elegooGetConn(elegooKey(_activePrinter));
          const on   = conn?.data?.ledOn ?? false;
          elegooSendCmd(elegooKey(_activePrinter), 1029, { power: on ? 0 : 1 });
          return;
        }

        // Temp pill click — inline edit: [data-elg-set-temp="extruder"|"heater_bed"]
        // Method 1028: { extruder: N } ou { heater_bed: N } — 1 champ/commande.
        const tempPill = e.target.closest("[data-elg-set-temp]");
        if (tempPill && _activePrinter?.brand === "elegoo") {
          e.preventDefault(); e.stopPropagation();
          if (tempPill.dataset.editing === "1") return;   // already editing
          const field = tempPill.dataset.elgSetTemp;       // "extruder" | "heater_bed"
          const conn  = elegooGetConn(elegooKey(_activePrinter));
          if (!conn || conn.status !== "connected") return;
          const currentTarget = field === "extruder"
            ? (conn.data.nozzleTarget ?? 0)
            : (conn.data.bedTarget   ?? 0);
          const maxTemp = field === "extruder" ? 350 : 120;

          const valSpan = tempPill.querySelector(".snap-temp-val");
          if (!valSpan) return;

          // Inject inline input
          tempPill.dataset.editing = "1";
          const input = document.createElement("input");
          input.type      = "number";
          input.className = "snap-temp-input";
          input.value     = Math.round(currentTarget);
          input.min       = 0;
          input.max       = maxTemp;
          valSpan.replaceWith(input);
          input.focus();
          input.select();

          const commit = () => {
            delete tempPill.dataset.editing;
            const val = parseInt(input.value, 10);
            const restore = document.createElement("span");
            restore.className = "snap-temp-val";
            restore.textContent = isNaN(val) ? valSpan.textContent : `${Math.round(conn.data[field === "extruder" ? "nozzleTemp" : "bedTemp"] ?? 0)} / ${val}°C`;
            input.replaceWith(restore);
            if (!isNaN(val) && val >= 0 && val <= maxTemp) {
              elegooSendCmd(elegooKey(_activePrinter), 1028, { [field]: val });
            }
          };

          input.addEventListener("blur",    commit, { once: true });
          input.addEventListener("keydown", ev => {
            if (ev.key === "Enter")  { ev.preventDefault(); input.blur(); }
            if (ev.key === "Escape") { input.value = currentTarget; input.blur(); }
          });
          return;
        }

        // Creality file sheet — print button (delete uses hold-to-confirm, bound in sheet).
        const printTrigger = e.target.closest("[data-cre-file-print]");
        if (printTrigger) {
          e.preventDefault(); e.stopPropagation();
          if (_activePrinter?.brand === "creality") {
            creActionPrintFile(_activePrinter, printTrigger.dataset.creFilePrint);
          }
          return;
        }
        // Copy button inside an expanded row — copies the pretty JSON.
        const copyBtn = e.target.closest(".snap-log-detail-copy");
        if (copyBtn) {
          e.stopPropagation();
          const v = copyBtn.dataset.copy || "";
          if (!v) return;
          try {
            navigator.clipboard.writeText(v);
            copyBtn.classList.add("snap-log-detail-copy--ok");
            setTimeout(() => copyBtn.classList.remove("snap-log-detail-copy--ok"), 700);
          } catch (_) {}
          return;
        }
        // Row head click — toggle expansion. We persist the flag on the
        // log entry object so it survives the next partial re-render
        // (typical when paused — no new pushes mean the rows array is
        // stable and the index → entry mapping holds). Resolve the conn
        // from the brand of the active printer so FlashForge rows
        // expand against the ffg conn map and Snapmaker rows against
        // the snap conn map.
        const head = e.target.closest("[data-row-toggle]");
        if (head) {
          const rowEl = head.closest(".snap-log-row");
          if (!rowEl || !_activePrinter) return;
          const conn = (_activePrinter.brand === "flashforge")
            ? ffgGetConn(ffgKey(_activePrinter))
            : (_activePrinter.brand === "creality")
            ? creGetConn(creKey(_activePrinter))
            : snapGetConn(snapKey(_activePrinter));
          const idx = parseInt(rowEl.dataset.logIdx || "-1", 10);
          if (conn?.log?.[idx]) conn.log[idx].expanded = !conn.log[idx].expanded;
          // DOM swap — toggle the hidden attribute + the row's class
          rowEl.classList.toggle("snap-log-row--expanded");
          const detail = rowEl.querySelector(".snap-log-detail");
          if (detail) detail.toggleAttribute("hidden");
        }
      });
    }

    // Inline-edit wiring for every [data-edit-field] node — connection rows,
    // credentials, and the hero printerName.
    body.querySelectorAll("[data-edit-field]").forEach(el => {
      // Click on a child .pp-eye / .pp-copy / .pp-pencil should NOT enter
      // edit mode (the pencil is a visual hint; the row itself is the
      // hit target). The eye/copy buttons stop propagation themselves.
      el.addEventListener("click", e => {
        // Ignore clicks that originated on a button inside the cell —
        // those have their own behaviour (eye toggle, copy).
        if (e.target.closest(".pp-eye, .pp-copy")) return;
        startInlineEdit(el);
      });
      el.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startInlineEdit(el);
        }
      });
    });

    // Fluidd button — only for Snapmaker (Moonraker exposes http://<ip>/ as Fluidd).
    const fluidBtn = $("printerFluidBtn");
    if (fluidBtn) {
      const snapIp = (p.brand === "snapmaker" && p.ip) ? p.ip : null;
      fluidBtn.classList.toggle("hidden", !snapIp);
      fluidBtn.dataset.fluidIp = snapIp || "";
    }

    // Sync the Connect / Disconnect header button with the current status.
    _updatePrinterConnBtn();
  }

  // Replace the cell content with an <input>. Enter/blur saves, Escape cancels.
  function startInlineEdit(cellEl) {
    if (cellEl.classList.contains("pp-row-val--editing")) return;
    if (!_activePrinter) return;
    const field    = cellEl.dataset.editField;
    const isSecret = cellEl.dataset.editSecret === "1";
    const raw      = cellEl.dataset.editRaw || "";
    if (!field) return;

    cellEl.classList.add("pp-row-val--editing");

    // Stash original DOM so we can restore on cancel without re-rendering
    const originalHtml = cellEl.innerHTML;

    const input = document.createElement("input");
    input.type = "text"; // password fields stay text — the row already had a reveal toggle, which we drop while editing
    input.className = "pp-edit-input";
    input.value = raw;
    input.setAttribute("aria-label", t("printerEditHint"));
    input.spellcheck = false;
    input.autocomplete = "off";
    input.autocapitalize = "off";

    cellEl.innerHTML = "";
    cellEl.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    const cancel = () => {
      if (committed) return;
      committed = true;
      cellEl.innerHTML = originalHtml;
      cellEl.classList.remove("pp-row-val--editing");
    };
    const commit = async () => {
      if (committed) return;
      committed = true;
      const newVal = input.value.trim();
      if (newVal === raw) {
        // Nothing changed — just restore.
        cellEl.innerHTML = originalHtml;
        cellEl.classList.remove("pp-row-val--editing");
        return;
      }
      cellEl.classList.add("pp-row-val--saving");
      cellEl.innerHTML = `<span class="pp-edit-spin"></span><span>${esc(t("printerEditSaving"))}</span>`;
      try {
        await savePrinterField(_activePrinter.brand, _activePrinter.id, field, newVal);
        // The Firestore snapshot will trigger refreshOpenPrinterDetail() and
        // re-render the row with the new value. We just clean up the
        // intermediate state.
        cellEl.classList.remove("pp-row-val--editing", "pp-row-val--saving");
      } catch (e) {
        console.warn("[printers] save failed:", e?.code, e?.message);
        cellEl.classList.remove("pp-row-val--saving");
        cellEl.innerHTML = `<span class="pp-edit-error">${esc(t("printerEditError"))}</span>`;
        // After 1.4 s revert to the original so the user can try again.
        setTimeout(() => {
          cellEl.innerHTML = originalHtml;
          cellEl.classList.remove("pp-row-val--editing");
        }, 1400);
      }
    };

    input.addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", () => commit());
  }

  // Single Firestore write path. Always stamps `updatedAt` with a
  // server-side timestamp so cross-client ordering stays monotonic.
  async function savePrinterField(brand, deviceId, fieldName, newValue) {
    const uid = state.activeAccountId;
    if (!uid) throw new Error("no active account");
    const db  = fbDb(uid);
    const ref = db.collection("users").doc(uid)
                  .collection("printers").doc(brand)
                  .collection("devices").doc(deviceId);
    await ref.update({
      [fieldName]: newValue,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }


  // Creality Live integration moved to renderer/printers/creality.js


  /* ── Add a printer — two-step flow ─────────────────────────────────────
     Step 1 — brand picker: a small modal listing the 5 supported brands
     with their connection method, so the user picks the right type.
     Step 2 — form: a per-brand form with the documented field set
     (printerName + printerModelId always; brand-specific ip / sn /
     account / serialNumber / password / mqttPassword as needed).
     On submit we create a Firestore doc under
       users/{uid}/printers/{brand}/devices/{auto-id}
     with serverTimestamp updatedAt and a sortIndex equal to the current
     printer count (so the new card lands at the end).                     */
  let _printerAddBrand = null;        // brand selected in step 1, used by step 2
  let _printerEditContext = null;     // { brand, deviceId } when editing an existing printer (gear button)
  // Pending discovery payload captured by the Snapmaker scan / manual probe,
  // waiting to be written onto the Firestore device doc when the user
  // hits "Add". Cleared on close so a subsequent add (re-opened blank)
  // doesn't accidentally inherit the previous run's data.
  let _printerAddDiscovery = null;

  function openPrinterBrandPicker() {
    const list = $("printerBrandPickerList");
    if (!list) return;
    // Brands with a connection tutorial bundled. Adding a brand here requires
    // a renderer/printers/<brand>/tutorial.json file alongside its add-flow.js.
    const _PT_HAS_TUTO = { bambulab: true, flashforge: true, elegoo: true };
    // One card per brand — visual cue (color dot) + label + connection hint.
    // For brands with a tutorial.json, an inline "📖 Tutoriel de connexion"
    // pill sits inside the card between the labels and the chevron. Rendered
    // as a <span role="button"> (not a real <button>) because nesting buttons
    // is invalid HTML; the click handler is attached directly with
    // stopPropagation so it doesn't fall through to the brand-select action.
    list.innerHTML = PRINTER_BRANDS.map(brand => {
      const meta = PRINTER_BRAND_META[brand];
      const tutoLink = _PT_HAS_TUTO[brand]
        ? `<span class="pba-brand-tuto-link" data-printer-tuto="${esc(brand)}" role="button" tabindex="0">${t("tutoOpenBtn")}</span>`
        : "";
      return `
        <button type="button" class="pba-brand" data-brand="${esc(brand)}">
          <span class="pba-brand-dot" style="background:${meta.accent}"></span>
          <span class="pba-brand-text">
            <span class="pba-brand-label">${esc(meta.label)}</span>
            <span class="pba-brand-conn">${esc(meta.connection)}</span>
          </span>
          ${tutoLink}
          <span class="icon icon-chevron-r icon-14 pba-brand-chev"></span>
        </button>`;
    }).join("");
    // Direct listener on each tutorial pill — fires during bubble phase
    // BEFORE the parent .pba-brand handler, so stopPropagation prevents the
    // brand-select dispatch (Add Printer flow) from also firing.
    list.querySelectorAll(".pba-brand-tuto-link").forEach(pill => {
      const trigger = (e) => {
        e.preventDefault(); e.stopPropagation();
        openPrinterTutorial(pill.dataset.printerTuto, "");
      };
      pill.addEventListener("click", trigger);
      pill.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") trigger(e);
      });
    });
    list.querySelectorAll(".pba-brand").forEach(btn => {
      btn.addEventListener("click", () => {
        const brand = btn.dataset.brand;
        closePrinterBrandPicker();
        // Every brand now has a dedicated LAN-discovery flow (scan + manual IP).
        if (brand === "snapmaker") {
          openSnapAddFlow();
        } else if (brand === "flashforge") {
          openFfgAddFlow();
        } else if (brand === "creality") {
          openCreAddFlow();
        } else if (brand === "bambulab") {
          openBblAddFlow();
        } else if (brand === "elegoo") {
          openElgAddFlow();
        } else if (brand === "anycubic") {
          openAcuAddFlow();
        } else {
          openPrinterAddForm(brand);
        }
      });
    });
    $("printerBrandPickerOverlay").classList.add("open");
    $("printerBrandPickerPanel").classList.add("open");
  }
  function closePrinterBrandPicker() {
    $("printerBrandPickerOverlay")?.classList.remove("open");
    $("printerBrandPickerPanel")?.classList.remove("open");
  }
  $("printerBrandPickerClose")?.addEventListener("click", closePrinterBrandPicker);
  $("printerBrandPickerOverlay")?.addEventListener("click", closePrinterBrandPicker);

  /* ── Snapmaker discovery flow ────────────────────────────────────────────
     All add-flow UI (choice modal, LAN scanner, manual IP probe, scan log)
     lives in renderer/printers/snapmaker/add-flow.js. Entry point:
     openSnapAddFlow() — called from the brand picker above.               */
  // openPrinterAddForm doubles as the edit modal. When `editPrinter` is
  // provided, the form pre-fills every field with the existing values,
  // hides the Back button, switches the primary CTA to "Save changes",
  // and routes the submit through an UPDATE rather than an auto-id SET.
  //
  // `prefill` is for the discovery flow (Snapmaker scan / manual probe):
  // shape `{ ip?, printerName?, modelId? }`. It seeds the empty add form
  // with the values we just learned from the printer so the user only has
  // to confirm + add. Ignored when `editPrinter` is set (edit takes over).
  // ── Printer settings modal — shell ───────────────────────────────────────
  // The modal has a fixed header (title + brand label) and footer
  // (Back / Save / Delete). The body is delegated entirely to each brand's
  // renderSettingsWidget(), registered in the brands registry.
  // This keeps the orchestrator thin and lets brands diverge freely.
  function openPrinterAddForm(brand, editPrinter = null, prefill = null) {
    const brandEntry = brands.get(brand);
    if (!brand || !brandEntry?.renderSettingsWidget) return;
    _printerAddBrand    = brand;
    _printerEditContext = editPrinter ? { brand, deviceId: editPrinter.id } : null;
    _printerAddDiscovery = (!editPrinter && prefill?.discovery) ? prefill.discovery : null;
    const isEdit = !!editPrinter;

    // ── Shell: header sub-label (brand name) ────────────────────────────────
    $("printerAddSub").textContent = PRINTER_BRAND_META[brand].label;

    // ── Shell: footer — back / save / delete ────────────────────────────────
    const backBtn = $("printerAddBack");
    if (backBtn) backBtn.style.display = isEdit ? "none" : "";
    const saveLabel = $("printerAddSave")?.querySelector(".label");
    if (saveLabel) saveLabel.textContent = t(isEdit ? "printerEditSave" : "printerAddSave");
    const delBtn = $("printerAddDelete");
    if (delBtn) {
      delBtn.classList.toggle("hidden", !isEdit);
      delBtn.title = t("printerEditDeleteHint") || "Hold 1.5s to delete this printer";
    }

    // ── Widget context ───────────────────────────────────────────────────────
    // Model list: placeholder (id=0) pinned first so it always shows as the
    // top option. Edit mode resolves the current model; discovery prefill
    // resolves the scanned model; plain add defaults to the placeholder.
    const allModels        = state.db.printerModels?.[brand] || [];
    const placeholderModel = allModels.find(m => String(m.id) === "0");
    const otherModels      = allModels.filter(m => String(m.id) !== "0");
    const models           = placeholderModel ? [placeholderModel, ...otherModels] : otherModels;

    const prefillModel = (!isEdit && prefill?.modelId)
      ? findPrinterModel(brand, prefill.modelId) : null;
    const editModel    = isEdit
      ? findPrinterModel(brand, editPrinter.printerModelId) : null;
    const defaultModel = editModel || prefillModel || placeholderModel || models[0] || null;

    const widgetCtx = {
      models, defaultModel, isEdit, prefill,
      brand, t, esc, printerImageUrl, findPrinterModel,
    };

    // ── Delegate body to brand widget ────────────────────────────────────────
    const bodyEl = $("printerAddBody");
    brandEntry.renderSettingsWidget(editPrinter, bodyEl, widgetCtx);

    // ── Open + initial focus ─────────────────────────────────────────────────
    // Non-modal, like the spool sidecard: no dimming overlay so the list and the
    // printer panel stay visible/usable. The config tucks to the LEFT of the
    // printer panel (via _syncPanels) when edited from it, instead of opening
    // hidden behind it. Closes via ✕ / Back.
    $("printerAddPanel").classList.add("open");
    _syncPanels();
    setTimeout(() => {
      if (isEdit || prefill) {
        const ni = bodyEl.querySelector("input[name=printerName]");
        ni?.focus(); ni?.select();
      } else {
        bodyEl.querySelector("#pbaMpTrigger")?.focus();
      }
    }, 50);
  }

  function closePrinterAddForm() {
    $("printerAddOverlay")?.classList.remove("open");
    $("printerAddPanel")?.classList.remove("open");
    _printerAddBrand = null;
    _printerEditContext = null;
    _printerAddDiscovery = null;
    _syncPanels(); // reset the config offset + re-lay-out remaining panels
  }
  // ── Tutorial image bottom-sheet ──────────────────────────────────────────
  function openTutoSheet(src, title) {
    $("tutoSheetImg").src  = src;
    $("tutoSheetImg").alt  = title;
    $("tutoSheetTitle").textContent = title;
    $("tutoSheet").classList.add("open");
    $("tutoSheetBackdrop").classList.add("open");
  }
  function closeTutoSheet() {
    $("tutoSheet").classList.remove("open");
    $("tutoSheetBackdrop").classList.remove("open");
  }
  $("tutoSheetClose")?.addEventListener("click", closeTutoSheet);
  $("tutoSheetBackdrop")?.addEventListener("click", closeTutoSheet);

  // Delegate — catches triggers rendered inside dynamic panel bodies
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-tuto-src]");
    if (!btn) return;
    e.preventDefault();
    openTutoSheet(btn.dataset.tutoSrc, btn.dataset.tutoTitle || "");
  });

  // ── Printer connection tutorial (multi-step walkthrough) ──────────────────
  // Loaded from renderer/printers/<brand>/tutorial.json. Each brand can declare
  // multiple "models" (e.g. Bambu X1 / P1 / A1 / H2-P2) — if more than one,
  // we show a picker first; if just one, jump straight to step 1.
  //
  // Brand label → URL slug used to find the tutorial.json + asset folder.
  const _PT_BRAND_LABEL = {
    bambulab:   "Bambu Lab",
    flashforge: "FlashForge",
    elegoo:     "Elegoo",
    creality:   "Creality",
    snapmaker:  "Snapmaker",
    anycubic:   "Anycubic",
  };
  let _ptCache = {};           // brand → loaded tutorial.json (cached after first fetch)
  let _ptState = {             // active modal state
    brand: null,
    json: null,
    seriesId: null,            // active series (resolved from picked model)
    stepIdx: 0,
  };

  async function _ptLoad(brand) {
    if (_ptCache[brand]) return _ptCache[brand];
    try {
      const res = await fetch(`./printers/${brand}/tutorial.json`);
      if (!res.ok) return null;
      const json = await res.json();
      _ptCache[brand] = json;
      return json;
    } catch (_e) { return null; }
  }

  // The footer (Prev / dots / Next / Finish) is only relevant during step
  // walkthrough — hidden entirely in the model picker so its empty controls
  // don't clutter the layout.
  function _ptHideFooter() {
    $("printerTutoFoot")?.classList.add("hidden");
  }
  function _ptShowFooter() {
    $("printerTutoFoot")?.classList.remove("hidden");
  }

  function _ptShowEmpty() {
    $("printerTutoModels")?.classList.add("hidden");
    $("printerTutoStep")?.classList.add("hidden");
    $("printerTutoEmpty")?.classList.remove("hidden");
    _ptHideFooter();
    $("printerTutoCounter").textContent = "";
  }

  // Render the model picker — a grid of printer-model cards with a photo
  // thumbnail + label. Picking one resolves model.series → the steps list.
  // Mirrors the mobile app's "Select your model" sheet.
  function _ptShowModelPicker() {
    $("printerTutoModels")?.classList.remove("hidden");
    $("printerTutoStep")?.classList.add("hidden");
    $("printerTutoEmpty")?.classList.add("hidden");
    _ptHideFooter();
    $("printerTutoCounter").textContent = "";
    // Clean stale dots from a prior step-view session so they don't bleed
    // into a reopened picker mode.
    $("printerTutoDots") && ($("printerTutoDots").innerHTML = "");
    const grid = $("printerTutoModelsGrid"); if (!grid) return;
    grid.innerHTML = "";
    const models = _ptState.json?.models || [];
    models.forEach((m) => {
      const btn = document.createElement("button");
      btn.className = "printer-tuto-model-btn"; btn.type = "button";
      // Name on top, photo below — matches the mobile app and avoids the
      // step-count clutter (the count is shown once the user is inside the
      // step view, not in the picker).
      btn.innerHTML = `
        <span class="pt-model-name">${esc(m.label)}</span>
        <img class="pt-model-img" src="./../assets/img/tutorials/${esc(_ptState.brand)}/${esc(m.image)}" alt="" onerror="this.style.visibility='hidden'" />`;
      btn.addEventListener("click", () => {
        _ptState.seriesId = m.series;
        _ptState.stepIdx = 0;
        _ptRenderStep();
      });
      grid.appendChild(btn);
    });
    // Ensure the picker opens scrolled to the top — without this, a stale
    // scroll offset from a previous step view can hide the label + first row.
    const sc = $("printerTutoModels"); if (sc) sc.scrollTop = 0;
  }

  function _ptCurrentSeries() {
    if (!_ptState.json) return null;
    return (_ptState.json.series || []).find(s => s.id === _ptState.seriesId) || null;
  }

  function _ptRenderStep() {
    const series = _ptCurrentSeries();
    if (!series || !series.steps?.length) { _ptShowEmpty(); return; }
    const step = series.steps[_ptState.stepIdx];
    $("printerTutoModels")?.classList.add("hidden");
    $("printerTutoStep")?.classList.remove("hidden");
    $("printerTutoEmpty")?.classList.add("hidden");
    _ptShowFooter();
    $("printerTutoPrev").classList.remove("hidden");
    $("printerTutoNext").classList.remove("hidden");

    const img = $("printerTutoImg");
    img.src = `./../assets/img/tutorials/${_ptState.brand}/${step.image}`;
    img.alt = "";
    $("printerTutoBody").textContent = t(step.body);
    $("printerTutoCounter").textContent = t("tutoStepXOfY", {
      n: _ptState.stepIdx + 1, total: series.steps.length
    });
    $("printerTutoPrev").disabled = _ptState.stepIdx === 0;
    const isLast = _ptState.stepIdx === series.steps.length - 1;
    $("printerTutoNext").classList.toggle("hidden", isLast);
    $("printerTutoFinish").classList.toggle("hidden", !isLast);

    // Step dots
    const dots = $("printerTutoDots"); dots.innerHTML = "";
    for (let i = 0; i < series.steps.length; i++) {
      const d = document.createElement("span");
      d.className = "pt-dot" + (i === _ptState.stepIdx ? " active" : "");
      d.addEventListener("click", () => { _ptState.stepIdx = i; _ptRenderStep(); });
      dots.appendChild(d);
    }
  }

  async function openPrinterTutorial(brand, modelHint) {
    const json = await _ptLoad(brand);
    const brandLabel = _PT_BRAND_LABEL[brand] || brand;
    $("printerTutoTitle").textContent = t("tutoTitleFor", { brand: brandLabel });
    $("printerTutorialOverlay").classList.add("open");

    if (!json || !json.series?.length || !json.models?.length) {
      _ptState = { brand, json: null, seriesId: null, stepIdx: 0 };
      _ptShowEmpty();
      return;
    }
    _ptState = { brand, json, seriesId: null, stepIdx: 0 };

    // Try to auto-resolve from the model hint (e.g. "P1S" → matches model id "p1s")
    let matched = null;
    if (modelHint) {
      const lc = String(modelHint).toLowerCase();
      matched = json.models.find(m =>
        lc.includes(m.id.toLowerCase()) ||
        String(m.label).toLowerCase().includes(lc)
      );
    }
    // Brand with a single model → auto-pick.
    if (!matched && json.models.length === 1) matched = json.models[0];

    if (matched) {
      _ptState.seriesId = matched.series;
      _ptRenderStep();
    } else {
      _ptShowModelPicker();
    }
  }

  function closePrinterTutorial() {
    $("printerTutorialOverlay").classList.remove("open");
  }

  $("printerTutoClose")?.addEventListener("click", closePrinterTutorial);
  $("printerTutorialOverlay")?.addEventListener("click", e => {
    if (e.target === $("printerTutorialOverlay")) closePrinterTutorial();
  });
  $("printerTutoPrev")?.addEventListener("click", () => {
    if (_ptState.stepIdx > 0) { _ptState.stepIdx--; _ptRenderStep(); }
  });
  $("printerTutoNext")?.addEventListener("click", () => {
    const s = _ptCurrentSeries();
    if (s && _ptState.stepIdx < s.steps.length - 1) {
      _ptState.stepIdx++; _ptRenderStep();
    }
  });
  $("printerTutoFinish")?.addEventListener("click", closePrinterTutorial);
  // Keyboard nav when tutorial open
  document.addEventListener("keydown", e => {
    if (!$("printerTutorialOverlay")?.classList.contains("open")) return;
    if (e.key === "Escape")     { e.preventDefault(); closePrinterTutorial(); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); $("printerTutoPrev").click(); }
    if (e.key === "ArrowRight") { e.preventDefault(); $("printerTutoNext").click(); }
  });

  // Delegate — any `<button data-printer-tuto="bambulab" data-printer-tuto-model="P1S">`
  // anywhere in the DOM opens the tutorial for that brand (optionally pre-selecting
  // the matching series).
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-printer-tuto]");
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    openPrinterTutorial(btn.dataset.printerTuto, btn.dataset.printerTutoModel || "");
  });

  $("printerAddClose")?.addEventListener("click", closePrinterAddForm);
  $("printerAddCloseTab")?.addEventListener("click", closePrinterAddForm);
  $("printerAddBack")?.addEventListener("click", () => {
    closePrinterAddForm();
    openPrinterBrandPicker();
  });
  $("printerAddOverlay")?.addEventListener("click", closePrinterAddForm);
  $("printerAddSave")?.addEventListener("click", () => submitPrinterAdd());

  // Hold-to-confirm Delete — same 1.5s press-and-hold pattern + visual
  // fill animation as the rack delete in storage view. Only fires when
  // an edit context is active (the trash button is hidden in add mode
  // anyway, but we double-check here as a defensive guard against a
  // stale class-toggle race).
  setupHoldToConfirm($("printerAddDelete"), 1500, async () => {
    const ctx = _printerEditContext;
    if (!ctx) return;
    const uid = state.activeAccountId;
    if (!uid) return;
    const err = $("printerAddError");
    try {
      const ref = fbDb(uid).collection("users").doc(uid)
                    .collection("printers").doc(ctx.brand)
                    .collection("devices").doc(ctx.deviceId);
      await ref.delete();
      // Close the form — onSnapshot will refresh the list. We don't
      // explicitly remove the doc from `state.printers` because the
      // Firestore listener handles that within ~50 ms.
      closePrinterAddForm();
    } catch (e) {
      console.warn("[printers] delete failed:", e?.code, e?.message);
      if (err) {
        err.textContent = t("printerDeleteErr") || "Failed to delete the printer.";
        err.hidden = false;
      }
    }
  });

  async function submitPrinterAdd() {
    const brand = _printerAddBrand;
    if (!brand) return;
    const uid = state.activeAccountId;
    if (!uid) return;

    const isEdit = !!_printerEditContext;

    const body = $("printerAddBody");
    const err  = $("printerAddError");
    err.hidden = true;

    // ── Anycubic CLOUD edit guard ─────────────────────────────────────────
    // Cloud printers carry token/cloudPrinterId/machineType (not the LAN
    // schema fields shown in this form). Writing the empty LAN fields would
    // corrupt the doc (esp. acuModelId, which cloud uses for its topic), so a
    // cloud edit only updates the name + model photo and preserves everything
    // else. Re-provisioning (Add cloud printer) is how the token is refreshed.
    const _editingPrinter = isEdit
      ? state.printers.find(p => p.brand === brand && p.id === _printerEditContext.deviceId) : null;
    if (isEdit && _editingPrinter?.mode === "cloud") {
      const nm = (body.querySelector("input[name=printerName]")?.value || "").trim();
      if (!nm) { err.textContent = t("printerAddErrName"); err.hidden = false; return; }
      const mi = body.querySelector("input[name=printerModelId]");
      const patch = { printerName: nm, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (mi && mi.value) patch.printerModelId = mi.value.trim();
      const sb = $("printerAddSave"); sb.classList.add("loading"); sb.disabled = true;
      try {
        await fbDb(uid).collection("users").doc(uid).collection("printers").doc(brand)
          .collection("devices").doc(_printerEditContext.deviceId).update(patch);
        closePrinterAddForm();
      } catch (e) {
        err.textContent = (e?.message || "Save failed"); err.hidden = false;
      } finally { sb.classList.remove("loading"); sb.disabled = false; }
      return;
    }

    // Collect inputs. We capture EVERY field listed in the schema (even
    // if the user cleared an optional one) so an empty string can be
    // written back to wipe the previous value rather than leaving stale
    // data on the doc.
    const schema = PRINTER_ADD_SCHEMA[brand];
    const data = {};
    const nameInput = body.querySelector("input[name=printerName]");
    data.printerName = (nameInput?.value || "").trim();
    const modelInput = body.querySelector("input[name=printerModelId]");
    if (modelInput) data.printerModelId = (modelInput.value || "").trim();
    schema.sections.forEach(sec => sec.fields.forEach(f => {
      const el = body.querySelector(`input[name="${f.key}"]`);
      const v  = (el?.value || "").trim();
      data[f.key] = v;
    }));

    if (!data.printerName) {
      err.textContent = t("printerAddErrName");
      err.hidden = false;
      return;
    }
    // Required brand-specific fields
    const missing = schema.sections.flatMap(s => s.fields)
      .filter(f => f.required && !data[f.key]);
    if (missing.length) {
      err.textContent = t("printerAddErrMissing", { fields: missing.map(f => f.labelText || t(f.labelKey)).join(", ") });
      err.hidden = false;
      return;
    }

    const btn = $("printerAddSave");
    btn.classList.add("loading");
    btn.disabled = true;
    let addedId = null; // set on a successful ADD → open its side-card afterwards
    try {
      const db  = fbDb(uid);
      if (isEdit) {
        // ── EDIT: update the existing doc, leaving id/isActive/sortIndex
        //         untouched. We DO write empty strings so the user can
        //         clear an optional secret field (e.g. mqttPassword).
        const editId = _printerEditContext.deviceId;
        const ref = db.collection("users").doc(uid)
                      .collection("printers").doc(brand)
                      .collection("devices").doc(editId);
        await ref.update({
          ...data,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Reconnect Snapmaker live channel after a settings edit.
        // The user may have changed the IP (or any other connection
        // field) — the existing WebSocket is still wired to the OLD
        // address and would silently keep streaming stale data, so we
        // tear it down and reconnect with the freshly-saved values.
        // We wait briefly for the Firestore listener to refresh
        // state.printers, then call snapConnect with the new doc.
        // snapConnect itself is idempotent: if the IP didn't actually
        // change, it's a no-op.
        if (brand === "snapmaker") {
          const start = Date.now();
          let updated = null;
          while (Date.now() - start < 2000) {
            updated = state.printers.find(p => p.brand === "snapmaker" && p.id === editId);
            // Wait for a state with the post-update timestamp + matching ip
            if (updated && updated.ip === data.ip) break;
            await new Promise(r => setTimeout(r, 40));
          }
          if (updated && updated.ip) {
            snapDisconnect(snapKey(updated));
            snapConnect(updated);
            // Refresh any open detail panel so the live block re-renders
            // against the new connection state.
            if (_activePrinter && snapKey(_activePrinter) === snapKey(updated)) {
              _activePrinter = updated;
              try { renderPrinterDetail(); } catch {}
            }
          }
        }
      } else {
        // ── ADD: auto-id under the brand subcollection.
        const ref = db.collection("users").doc(uid)
                      .collection("printers").doc(brand)
                      .collection("devices").doc();
        const sortIndex = state.printers.length; // append to the end
        const docPayload = {
          ...data,
          id: ref.id,
          isActive: false,
          sortIndex,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        // Persist the full discovery payload when the printer was added
        // via Scan / Manual probe. The bundle holds the raw mDNS TXT
        // record + raw /printer/info, /server/info, /machine/system_info
        // responses + the derived identity fields, so future code can
        // re-parse without a re-scan and support tickets get a complete
        // snapshot of what the printer reported.
        if (_printerAddDiscovery) {
          docPayload.discovery = _printerAddDiscovery;
        }
        await ref.set(docPayload);
        addedId = ref.id;
      }
      closePrinterAddForm();
    } catch (e) {
      console.warn(`[printers] ${isEdit ? "update" : "create"} failed:`, e?.code, e?.message);
      err.textContent = t("printerAddErrSave");
      err.hidden = false;
    } finally {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
    // Freshly added printer → open its side-card once the Firestore listener
    // has propagated it into state.printers (the doc isn't there synchronously).
    if (addedId) _openPrinterWhenReady(brand, addedId);
  }

  // Poll state.printers (up to 3 s) for a just-written printer, then open its
  // side-card. Used after Add so the user lands straight on the new printer.
  async function _openPrinterWhenReady(brand, id) {
    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (state.printers.some(p => p.brand === brand && p.id === id)) {
        openPrinterDetail(brand, id);
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }
  // ── Scale functions have moved to renderer/IoT/tigerscale/index.js ─────
  // All scale rendering, WebSocket, RTDB, accessors, and helpers are now
  // managed by that module. subscribeScales / unsubscribeScales /          
  // renderScalesPanel / renderScaleHealth are imported at the top of this  
  // file and initTigerScale(ctx) is called during DOM setup.               

  async function createRack({ name, level, position }) {
    const user = fbAuth().currentUser;
    if (!user) { console.warn("[createRack] no user"); return null; }
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    const order = state.racks.length;
    const payload = {
      name: name.trim() || "Rack",
      level: Math.max(1, Math.min(15, parseInt(level, 10) || 1)),
      position: Math.max(1, Math.min(20, parseInt(position, 10) || 1)),
      order,
      createdAt: ts,
      lastUpdate: ts
    };
    console.log(`[createRack] writing to users/${user.uid}/racks/`, payload);
    const doc = await fbDb().collection("users").doc(user.uid)
      .collection("racks").add(payload);
    console.log(`[createRack] OK → id=${doc.id}`);
    return doc.id;
  }

  async function updateRack(rackId, fields) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    const rackRef = fbDb().collection("users").doc(user.uid).collection("racks").doc(rackId);
    const batch = fbDb().batch();
    batch.set(rackRef, {
      ...fields,
      lastUpdate: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // If dimensions shrink, every spool whose slot is out of the new bounds
    // is orphaned and must return to the unranked sidebar — same batch so
    // it's atomic. We iterate `state.rows` (already normalised, reads both
    // legacy flat and nested rack schemas) so the query stays schema-agnostic.
    const newLevel = fields.level;
    const newPos   = fields.position;
    if (newLevel != null || newPos != null) {
      let freed = 0;
      state.rows.forEach(row => {
        if (row.rackId !== rackId || row.deleted) return;
        const oobLevel = (newLevel != null && Number.isInteger(row.rackLevel) && row.rackLevel >= newLevel);
        const oobPos   = (newPos   != null && Number.isInteger(row.rackPos)   && row.rackPos   >= newPos);
        if (oobLevel || oobPos) {
          batch.update(invRef.doc(row.spoolId), { rack: null });
          freed++;
        }
      });
      if (freed > 0) console.log(`[updateRack] resized rack ${rackId} → freed ${freed} out-of-bounds spool(s)`);
    }

    await batch.commit();
  }

  // One-shot guard so the orphan sweep doesn't fire concurrently with itself
  // across rapid re-renders of the storage view.
  let _orphanCleanupInFlight = false;

  // Batch-clear `rack` / `rack_id` / `level` / `position` on a list of spools
  // whose rackId points to a rack that has been deleted. Same field-clear
  // semantics as `deleteRack` above, applied retroactively.
  async function _cleanupOrphanRackRefs(orphans) {
    if (!orphans?.length) return;
    const user = fbAuth().currentUser;
    if (!user) return;
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    const batch = fbDb().batch();
    const FV = firebase.firestore.FieldValue;
    orphans.forEach(row => {
      batch.update(invRef.doc(row.spoolId), {
        rack:     null,
        rack_id:  FV.delete(),
        level:    FV.delete(),
        position: FV.delete(),
      });
    });
    try {
      await batch.commit();
      console.log(`[rack-cleanup] cleared ${orphans.length} orphan rack reference(s)`);
    } catch (e) {
      console.warn("[rack-cleanup] batch failed:", e?.message || e);
    }
  }

  async function deleteRack(rackId) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    const batch = fbDb().batch();
    const FV = firebase.firestore.FieldValue;
    // Free all spools currently assigned to this rack — `state.rows` is
    // schema-agnostic so we catch both legacy (flat) and migrated (nested)
    // docs in one pass. Write BOTH shapes:
    //   - rack: null               (modern nested shape)
    //   - rack_id/level/position: FV.delete()   (legacy flat fields)
    // Without the legacy delete, `normalizeRow` still resolves rackId via the
    // flat fallback (`data.rack_id`) and the spool keeps pointing at the
    // now-deleted rack — orphan that inflates the storage stats.
    state.rows.forEach(row => {
      if (row.rackId === rackId && !row.deleted) {
        batch.update(invRef.doc(row.spoolId), {
          rack:     null,
          rack_id:  FV.delete(),
          level:    FV.delete(),
          position: FV.delete(),
        });
      }
    });
    batch.delete(fbDb().collection("users").doc(user.uid)
      .collection("racks").doc(rackId));
    await batch.commit();
  }

  // Unassign all spools from a rack but keep the rack itself.
  // Returns the number of spools that were freed.
  async function emptyRack(rackId) {
    const user = fbAuth().currentUser;
    if (!user) return 0;
    await playEmptyRackCascade(rackId);
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    // Locked slots are protected from Clear all — a spool in a locked slot can
    // only be removed by deleting the spool itself.
    const targets = state.rows.filter(r =>
      r.rackId === rackId && !r.deleted && !isSlotLocked(rackId, r.rackLevel, r.rackPos)
    );
    if (!targets.length) return 0;
    const batch = fbDb().batch();
    targets.forEach(row => batch.update(invRef.doc(row.spoolId), { rack: null }));
    await batch.commit();
    return targets.length;
  }

  // Visually animate every filled slot of a rack flying out to the unranked
  // panel, with a stagger. Resolves once the last slot has finished its
  // animation. Pure visual — does not touch Firestore.
  function playEmptyRackCascade(rackId) {
    return new Promise(resolve => {
      const card = document.querySelector(`#invRackView .rp-rack[data-rack-id="${CSS.escape(rackId)}"]`);
      if (!card) return resolve();
      const filled = Array.from(card.querySelectorAll(".rp-slot--filled:not(.rp-slot--locked)"));
      if (!filled.length) return resolve();
      // Sort top→bottom, left→right
      filled.sort((a, b) => {
        const lvA = parseInt(a.dataset.level, 10), lvB = parseInt(b.dataset.level, 10);
        if (lvA !== lvB) return lvB - lvA;
        return parseInt(a.dataset.pos, 10) - parseInt(b.dataset.pos, 10);
      });
      const STAGGER = 30;
      const ANIM_MS = 280;
      filled.forEach((el, i) => {
        el.style.animationDelay = (i * STAGGER) + "ms";
        el.classList.add("rp-slot--cascade-out");
      });
      const totalMs = (filled.length - 1) * STAGGER + ANIM_MS + 20;
      setTimeout(resolve, totalMs);
    });
  }

  // Set of spoolIds that just landed in a slot — used by renderRackView to
  // trigger a one-time "bounce-in" animation when the snapshot rebuilds the DOM.
  // Cleared as each animation fires.
  const _justPlacedSpools = new Set();
  // Set of "rackId|lv|pos" coordinates that should bounce on next render
  // (for empty-rack moves where the spoolId may have moved to unranked sidebar).
  const _justFilledSlots = new Set();

  // Some spools are physically two RFID tags glued to the same spool
  // (a "twin" pair). Their inventory docs are linked via `twin_tag_uid` /
  // `twinUid`. Storage location must mirror to BOTH docs so a scan of
  // either tag returns the correct rack/level/position. This helper
  // returns the twin's spoolId or null when there's no twin.
  function twinSpoolIdOf(row) {
    if (!row || !row.twinUid) return null;
    const twin = state.rows.find(r =>
      r.spoolId !== row.spoolId &&
      (String(r.uid) === String(row.twinUid) || String(r.spoolId) === String(row.twinUid))
    );
    return twin ? twin.spoolId : null;
  }

  // Assign / move / unassign a spool to a slot. Performs a swap if the target
  // slot is already occupied (in a single Firestore batch for atomicity).
  // Twin pairs (linked RFID tags) are written together so both docs stay
  // in sync.
  async function assignSpoolToSlot(spoolId, rackId, level, position) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    const batch  = fbDb().batch();

    // Find any spool currently in the target slot
    const occupant = state.rows.find(r =>
      !r.deleted && r.rackId === rackId && r.rackLevel === level && r.rackPos === position
      && r.spoolId !== spoolId
    );
    // Where the moved spool is coming from (may be null = unranked)
    const moving = state.rows.find(r => r.spoolId === spoolId);

    // Mirror an update to the twin's doc when the row has a twin.
    const writeWithTwin = (row, fields, fallbackId) => {
      const id = row?.spoolId || fallbackId;
      if (!id) return;
      batch.update(invRef.doc(id), fields);
      const twinId = row ? twinSpoolIdOf(row) : null;
      if (twinId) batch.update(invRef.doc(twinId), fields);
    };

    if (occupant && moving && moving.rackId) {
      // Swap: occupant moves to the moving spool's previous slot
      writeWithTwin(occupant, {
        rack: { id: moving.rackId, level: moving.rackLevel, position: moving.rackPos }
      });
    } else if (occupant) {
      // Coming from unranked → push the occupant out as unranked
      writeWithTwin(occupant, { rack: null });
    }
    // Place the new spool into the target slot (mirror to twin if any)
    writeWithTwin(moving, { rack: { id: rackId, level, position } }, spoolId);
    // Tag this spool for the next render — bounce-in animation
    _justPlacedSpools.add(spoolId);
    await batch.commit();
  }

  async function unassignSpool(spoolId) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
    const row = state.rows.find(r => r.spoolId === spoolId);
    const twinId = row ? twinSpoolIdOf(row) : null;
    const fields = { rack: null };
    if (twinId) {
      // Twin pair → atomic batch so both docs flip together.
      const batch = fbDb().batch();
      batch.update(invRef.doc(spoolId), fields);
      batch.update(invRef.doc(twinId),  fields);
      await batch.commit();
    } else {
      await invRef.doc(spoolId).update(fields);
    }
  }


  // Render the racks list inside the racks panel
  // Inner HTML for a chip / filled slot — uses colorBg(row) to support any
  // color style (mono / bicolor / tricolor / rainbow / conic_gradient) and
  // overlays a fill level matching the remaining weight.
  function slotFillInnerHTML(row) {
    const cap = row.capacity || 1000;
    const cur = row.weightAvailable != null ? row.weightAvailable : 0;
    const pct = Math.max(0, Math.min(100, Math.round((cur / cap) * 100)));
    const bg  = colorBg(row);  // CSS background expression (may be a gradient)
    // Depleted (≤ 0g): show a thin colored strip at the bottom + an "EMPTY"
    // indicator so the slot looks distinct from a free slot. Without this,
    // a 0% fill produces nothing visible and the slot looks unoccupied.
    if (pct <= 0) {
      return `<div class="rp-fill rp-fill--depleted" style="background:${bg}"></div>
              <div class="rp-fill-empty-tag" aria-hidden="true">0g</div>`;
    }
    return `<div class="rp-fill" style="height:${pct}%;background:${bg}"></div>`;
  }

  // Cache: which spool is currently in (rackId, level, position)?
  function findSpoolInSlot(rackId, level, position) {
    return state.rows.find(r =>
      !r.deleted && r.rackId === rackId &&
      r.rackLevel === level && r.rackPos === position
    );
  }

  /* ── Slot locking ───────────────────────────────────────────────────────
     A locked slot blocks drag-out (if filled) and drag-in (if empty).
     Stored as an array of "<level>:<position>" strings on the rack doc. */
  function slotLockKey(level, position) { return `${level}:${position}`; }
  function isSlotLocked(rackId, level, position) {
    const r = state.racks.find(x => x.id === rackId);
    if (!r) return false;
    return Array.isArray(r.lockedSlots)
      && r.lockedSlots.includes(slotLockKey(level, position));
  }
  async function toggleSlotLock(rackId, level, position) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const r = state.racks.find(x => x.id === rackId);
    if (!r) return;
    const key = slotLockKey(level, position);
    const cur = Array.isArray(r.lockedSlots) ? r.lockedSlots : [];
    const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
    await fbDb().collection("users").doc(user.uid)
      .collection("racks").doc(rackId)
      .update({
        lockedSlots: next,
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
      });
  }
  // Lock every slot in a rack (used by the kebab "Lock all" menu item).
  async function lockAllSlots(rackId) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const r = state.racks.find(x => x.id === rackId);
    if (!r) return;
    const all = [];
    for (let lv = 0; lv < (r.level || 0); lv++) {
      for (let pos = 0; pos < (r.position || 0); pos++) {
        all.push(slotLockKey(lv, pos));
      }
    }
    await fbDb().collection("users").doc(user.uid)
      .collection("racks").doc(rackId)
      .update({
        lockedSlots: all,
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
      });
  }
  async function unlockAllSlots(rackId) {
    const user = fbAuth().currentUser;
    if (!user) return;
    await fbDb().collection("users").doc(user.uid)
      .collection("racks").doc(rackId)
      .update({
        lockedSlots: [],
        lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
      });
  }
  // Position a kebab menu against its anchor button. Uses fixed positioning so
  // the menu escapes the rack card's overflow + the racks-col flex layout.
  // Flips to the left if the button is too close to the right edge.
  function positionRackMenu(menu, anchorBtn) {
    const rect = anchorBtn.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.zIndex = "1000";
    // Measure menu (it's now visible, so offsetWidth/Height are real)
    const mw = menu.offsetWidth || 180;
    const mh = menu.offsetHeight || 200;
    // Default: align right edge to anchor right edge, drop down from anchor
    let left = rect.right - mw;
    let top  = rect.bottom + 4;
    // Keep inside viewport
    const maxLeft = window.innerWidth - mw - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    // Flip up if not enough room below
    if (top + mh > window.innerHeight - 8) {
      top = rect.top - mh - 4;
      if (top < 8) top = 8;
    }
    menu.style.left = left + "px";
    menu.style.top  = top + "px";
  }

  /* ── Auto-fill: assign unranked spools to empty (and unlocked) slots,
     iterating racks in order, top→bottom, left→right.  Single Firestore
     batch so the snapshot updates atomically. */
  // If `rackId` is provided, fill ONLY that rack. Otherwise fill all racks.
  async function autoFillEmptySlots(rackId) {
    const user = fbAuth().currentUser;
    if (!user) return 0;
    // Exclude depleted spools from the pool — there's no point storing an
    // empty roll, and it would loop with auto-unstorage if both are ON.
    const pool = getUnrackedSpools().filter(r =>
      r.weightAvailable == null || Number(r.weightAvailable) > 0
    );
    if (!pool.length || !state.racks.length) return 0;
    const targets = rackId
      ? state.racks.filter(r => r.id === rackId)
      : state.racks;
    if (!targets.length) return 0;
    const batch = fbDb().batch();
    let placed = 0;
    outer:
    for (const r of targets) {
      for (let lv = r.level - 1; lv >= 0; lv--) {
        for (let pos = 0; pos < r.position; pos++) {
          if (!pool.length) break outer;
          if (isSlotLocked(r.id, lv, pos)) continue;
          if (findSpoolInSlot(r.id, lv, pos)) continue;
          const spool = pool.shift();
          const invCol = fbDb().collection("users").doc(user.uid).collection("inventory");
          const fields = { rack: { id: r.id, level: lv, position: pos } };
          batch.update(invCol.doc(spool.spoolId), fields);
          // Mirror the location to the linked twin tag, if any.
          const twinId = twinSpoolIdOf(spool);
          if (twinId) batch.update(invCol.doc(twinId), fields);
          // Mark each newly-filled slot for staggered bounce-in
          _justPlacedSpools.add(spool.spoolId);
          placed++;
        }
      }
    }
    if (!placed) return 0;
    await batch.commit();
    return placed;
  }

  /* Auto-storage feature — when the toggle in the "Spools not stored" side
     panel is ON, every fresh inventory snapshot triggers this routine to
     drop newly-detected unranked spools into the first free slot.
     Throttled to one run per snapshot batch (no recursion when our own
     writes propagate). */
  let _autoStoreInFlight = false;
  async function maybeAutoStoreUnrankedSpools() {
    if (_autoStoreInFlight) return;
    if (state.friendView) return;                 // never write on a friend's account
    if (localStorage.getItem("tigertag.autoStorage.enabled") !== "true") return;
    if (!state.racks.length) return;              // nothing to fill into
    _autoStoreInFlight = true;
    try {
      const placed = await autoFillEmptySlots();
      if (placed > 0) console.log(`[autoStorage] placed ${placed} spool(s) automatically`);
    } catch (e) {
      console.warn("[autoStorage] failed:", e?.message);
    } finally {
      // Hold the lock briefly so the resulting snapshot doesn't re-trigger
      // a no-op pass before our writes have settled.
      setTimeout(() => { _autoStoreInFlight = false; }, 1500);
    }
  }

  /* Auto-unstorage feature — when ON, any spool currently placed in a
     rack whose `weight_available` reached 0 is automatically removed from
     the rack (rack_id / level / position cleared). The spool is NOT
     deleted: it simply returns to the "Spools not stored" pile, ready to
     be replaced by a fresh roll or kept for re-use of the empty cardboard.
     One Firestore batch per snapshot, throttled identically to auto-store. */
  let _autoUnstoreInFlight = false;
  async function maybeAutoUnstoreDepletedSpools() {
    if (_autoUnstoreInFlight) return;
    if (state.friendView) return;
    if (localStorage.getItem("tigertag.autoUnstorage.enabled") !== "true") return;
    const targets = state.rows.filter(r =>
      !r.deleted &&
      r.rackId != null &&                                  // currently placed
      r.weightAvailable != null &&
      Number(r.weightAvailable) <= 0                       // depleted
    );
    if (!targets.length) return;
    _autoUnstoreInFlight = true;
    try {
      const user = fbAuth().currentUser;
      if (!user) return;
      const invRef = fbDb().collection("users").doc(user.uid).collection("inventory");
      const batch  = fbDb().batch();
      const clearFields = { rack: null };
      targets.forEach(t => {
        batch.update(invRef.doc(t.spoolId), clearFields);
        // Mirror the unstore to the linked twin tag, if any.
        const twinId = twinSpoolIdOf(t);
        if (twinId) batch.update(invRef.doc(twinId), clearFields);
      });
      await batch.commit();
      console.log(`[autoUnstorage] freed ${targets.length} depleted spool(s)`);
    } catch (e) {
      console.warn("[autoUnstorage] failed:", e?.message);
    } finally {
      setTimeout(() => { _autoUnstoreInFlight = false; }, 1500);
    }
  }

  /* Place ONE specific spool in the first available unlocked slot — used
     by the "Auto-assign" button in the spool detail panel when a spool
     isn't yet stored anywhere. Returns the {rackId, level, position}
     that was claimed, or null if all slots are taken. */
  async function autoAssignSingleSpool(spoolId) {
    const user = fbAuth().currentUser;
    if (!user) return null;
    const spool = state.rows.find(r => r.spoolId === spoolId);
    if (!spool || spool.deleted) return null;
    if (spool.rackId != null) return null;     // already placed
    for (const rack of state.racks) {
      for (let lv = (rack.level || 0) - 1; lv >= 0; lv--) {
        for (let pos = 0; pos < (rack.position || 0); pos++) {
          if (isSlotLocked(rack.id, lv, pos)) continue;
          if (findSpoolInSlot(rack.id, lv, pos)) continue;
          // Twin-aware write: when the spool has a paired twin tag we
          // mirror the location to the twin's doc inside one batch so
          // both stay synchronised.
          const invCol = fbDb().collection("users").doc(user.uid).collection("inventory");
          const fields = { rack: { id: rack.id, level: lv, position: pos } };
          const twinId = twinSpoolIdOf(spool);
          if (twinId) {
            const batch = fbDb().batch();
            batch.update(invCol.doc(spoolId), fields);
            batch.update(invCol.doc(twinId),  fields);
            await batch.commit();
          } else {
            await invCol.doc(spoolId).update(fields);
          }
          // Tag for the bounce-in animation on next render
          _justPlacedSpools.add(spoolId);
          return { rackId: rack.id, level: lv, position: pos, rackName: rack.name };
        }
      }
    }
    return null;
  }

  // Greys out filled rack slots whose spool doesn't match the main search bar
  // (#searchInv) AND/OR the brand/material quick-filters.
  function applyRackSearchDim() {
    const q = (state.search || "").trim().toLowerCase();
    const brand = state.brandFilter || "";
    const material = state.materialFilter || "";
    const noFilter = !q && !brand && !material;
    document.querySelectorAll("#invRackView .rp-slot--filled").forEach(el => {
      if (noFilter) {
        el.classList.remove("rp-dim");
        el.classList.remove("rp-slot--match");
        return;
      }
      const sid = el.dataset.spoolId;
      const r = state.rows.find(x => x.spoolId === sid);
      if (!r) { el.classList.add("rp-dim"); el.classList.remove("rp-slot--match"); return; }
      const matchSearch = !q || [r.uid, r.colorName, r.material, r.brand, r.series, r.sku, r.barcode]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
      const matchBrand = !brand || String(r.brand) === brand;
      const matchMaterial = !material || String(r.material) === material;
      const type = state.typeFilter || "";
      const matchType = !type || String(r.protocol) === type;
      const matches = matchSearch && matchBrand && matchMaterial && matchType;
      el.classList.toggle("rp-dim", !matches);
      // Positive match indicator on the slot CONTAINER (border + glow) —
      // makes depleted spools (whose .rp-fill is invisible at 0%) still
      // clearly findable when the user is searching.
      el.classList.toggle("rp-slot--match", matches);
    });
  }

  // True when a spool has been used up (weight_available ≤ 0). Used
  // to exclude empties from various COUNTS (unranked total, stats
  // tile, search counter) without removing them from the actual
  // display lists — the user still wants to SEE the empty spool.
  // Negative numbers are also treated as empty (some chips ship with
  // a slightly miscalibrated zero point).
  function isEmptyRow(r) {
    const w = Number(r?.weightAvailable);
    return Number.isFinite(w) && w <= 0;
  }

  // Filter unranked spools (rack_id is null/missing, not deleted).
  // Empty spools ARE kept visible (user can still see / manage them)
  // — they are only excluded from COUNTS via isEmptyRow().
  // Spools whose rackId points to a rack that no longer exists are surfaced
  // here too — they're effectively unstored, even if their `rackId` still
  // has a stale value (the background cleanup will null it shortly).
  function getUnrackedSpools() {
    const search = ($("rpUnrackedSearch")?.value || "").trim().toLowerCase();
    const liveRackIds = new Set(state.racks.map(rk => rk.id));
    const rows = state.rows.filter(r => {
      if (r.deleted) return false;
      // Already placed in a rack that still exists → not unranked.
      if (r.rackId && liveRackIds.has(r.rackId)) return false;
      if (!search) return true;
      return (
        (r.uid || "").toLowerCase().includes(search) ||
        String(r.material || "").toLowerCase().includes(search) ||
        String(r.brand || "").toLowerCase().includes(search) ||
        String(r.colorName || "").toLowerCase().includes(search)
      );
    });
    // Collapse twin pairs (one physical spool, two linked tags) so it shows
    // and counts once — not twice — in the unranked list, its count, and the
    // auto-fill pool.
    return deduplicateTwins(rows);
  }

  // Backwards-compat alias — older code paths called renderRacksList()
  function renderRacksList() { renderRackView(); }

  // Build a single unranked-spool row (for the right sidebar).
  // Layout: line 1 = brand (primary identity), line 2 = material · colorName
  // so the user can scan brands first then drill into the variant.
  // In read-only mode (friend view) the row is non-draggable.
  function unrackedRowHTML(row) {
    const readOnly = !!state.friendView;
    const tip = `${esc(row.brand || "")} · ${esc(row.material || "")}\n${esc(row.colorName || row.uid || "")}`;
    const titleLine = row.brand || row.material || row.uid || "—";
    const subLine   = [row.material, row.colorName].filter(Boolean).join(" · ");
    const wAvail    = row.weightAvailable != null ? row.weightAvailable : "—";
    const wCap      = row.capacity || 1000;
    return `<div class="rp-side-row" draggable="${readOnly ? "false" : "true"}" data-spool-id="${esc(row.spoolId)}" title="${tip}">
      <div class="rp-side-puck">${slotFillInnerHTML(row)}</div>
      <div class="rp-side-meta">
        <div class="rp-side-name">${esc(titleLine)}</div>
        <div class="rp-side-sub">${esc(subLine || "—")}</div>
      </div>
      <div class="rp-side-w">${wAvail}<span class="rp-side-w-unit">/${wCap}g</span></div>
    </div>`;
  }

  // Set by a side-row dragend, used to defer renderRackView so the panel
  // slide-back animation isn't cut off by an incoming Firestore snapshot.
  let _unrackedSettleUntil = 0;
  let _rackRenderDeferred = false;
  // Set by setViewMode("rack") when force-opening the panel — triggers a
  // slide-in animation on the next render instead of appearing already open.
  let _unrackedAnimateOpen = false;
  // Currently-dragged rack id for drag-and-drop reordering, or null.
  let _draggingRackId = null;

  /* ── Skyline-packing masonry layout ────────────────────────────────────
     Places each .rp-racks-col child at the leftmost-lowest free position
     so racks of varying widths AND heights pack tightly (Pinterest-style).
     Children become position:absolute; the container's height is set to
     match the tallest column so the page reflows correctly.
     Re-runs on:
       - every renderRackView (after innerHTML)
       - window resize (debounced)
       - ResizeObserver on the container (panel toggles, etc.)
     Skyline = sorted array of {x, end, y} segments representing the current
     bottom of every reserved horizontal interval.  */
  let _masonryRO = null;
  let _masonryResizeTimer = null;
  let _masonryLastWidth = 0;
  function layoutRacksMasonry() {
    const container = document.querySelector("#invRackView .rp-racks-col");
    if (!container) return;
    const items = Array.from(container.children);
    if (!items.length) { container.style.height = ""; return; }

    // Reset positioning so we can measure natural sizes
    container.style.position = "relative";
    items.forEach(el => {
      el.style.position = "";
      el.style.left = "";
      el.style.top = "";
    });

    const containerWidth = container.clientWidth;
    if (!containerWidth) return;
    const GAP_X = 14;
    const GAP_Y = 14;

    // Force a reflow to get accurate dimensions after the reset
    const dims = items.map(el => ({ el, w: el.offsetWidth, h: el.offsetHeight }));

    // Skyline: array of horizontal segments at given y
    let skyline = [{ x: 0, end: containerWidth, y: 0 }];

    function maxYInRange(x, end) {
      let m = 0;
      for (const seg of skyline) {
        if (seg.end <= x) continue;
        if (seg.x >= end) break;
        if (seg.y > m) m = seg.y;
      }
      return m;
    }
    function reserve(x, w, newY) {
      const end = x + w;
      const next = [];
      for (const seg of skyline) {
        if (seg.end <= x || seg.x >= end) {
          next.push(seg);
        } else {
          if (seg.x < x)   next.push({ x: seg.x, end: x,        y: seg.y });
          if (seg.end > end) next.push({ x: end, end: seg.end,  y: seg.y });
        }
      }
      next.push({ x, end, y: newY });
      next.sort((a, b) => a.x - b.x);
      // Merge adjacent segments at same y
      const merged = [];
      for (const seg of next) {
        const last = merged[merged.length - 1];
        if (last && last.end === seg.x && last.y === seg.y) last.end = seg.end;
        else merged.push(seg);
      }
      skyline = merged;
    }

    let totalHeight = 0;
    dims.forEach(({ el, w, h }) => {
      if (!w || !h) return;
      // Candidate x positions = skyline segment starts. Pick lowest y, then leftmost x.
      let best = null;
      for (const seg of skyline) {
        const x = seg.x;
        if (x + w > containerWidth) continue;
        const y = maxYInRange(x, x + w);
        if (best === null || y < best.y || (y === best.y && x < best.x)) best = { x, y };
      }
      if (!best) {
        // Doesn't fit horizontally — drop on a new row at x=0
        best = { x: 0, y: skyline.reduce((m, s) => Math.max(m, s.y), 0) };
      }
      el.style.position = "absolute";
      el.style.left = best.x + "px";
      el.style.top  = best.y + "px";
      // Reserve [x, x + w + GAP_X] at height (y + h + GAP_Y) so the next
      // item placed in this x-range has a vertical gap, and any item starting
      // immediately to the right is pushed out by GAP_X.
      reserve(best.x, w + GAP_X, best.y + h + GAP_Y);
      const bottom = best.y + h;
      if (bottom > totalHeight) totalHeight = bottom;
    });
    container.style.height = totalHeight + "px";
  }
  function scheduleMasonryRelayout() {
    clearTimeout(_masonryResizeTimer);
    _masonryResizeTimer = setTimeout(layoutRacksMasonry, 60);
  }
  // One global window-resize listener (registered lazily, never duplicated)
  if (typeof window !== "undefined" && !window._racksMasonryWired) {
    window._racksMasonryWired = true;
    window.addEventListener("resize", scheduleMasonryRelayout);
  }

  /* Reorder racks: move srcId before/after targetId in the visual order, then
     write the new `order` index back to Firestore for every rack that shifted.
     The state.racks array is sorted client-side by `order` so the next snapshot
     re-render reflects the new positions. */
  async function reorderRacks(srcId, targetId, beforeTarget) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const list = state.racks.slice();
    const srcIdx = list.findIndex(r => r.id === srcId);
    if (srcIdx === -1) return;
    const [moved] = list.splice(srcIdx, 1);
    let targetIdx = list.findIndex(r => r.id === targetId);
    if (targetIdx === -1) return;
    list.splice(beforeTarget ? targetIdx : targetIdx + 1, 0, moved);
    // Write new order indices in a single batch — only for racks whose index changed
    const ref = fbDb().collection("users").doc(user.uid).collection("racks");
    const batch = fbDb().batch();
    const ts = firebase.firestore.FieldValue.serverTimestamp();
    let writes = 0;
    list.forEach((r, i) => {
      if (r.order !== i) {
        batch.update(ref.doc(r.id), { order: i, lastUpdate: ts });
        writes++;
      }
    });
    if (writes) await batch.commit();
    console.log(`[reorderRacks] moved ${srcId} ${beforeTarget ? "before" : "after"} ${targetId} — wrote ${writes} order(s)`);
  }

  /* ── Rich hover tooltip for filled rack slots ──────────────────────────
     A single floating element (#rackHoverTip) is reused for every slot. On
     mouseenter we populate it with the spool data and position it above
     (or below) the hovered slot; mouseleave hides it. Hidden while a
     drag is in progress so the bubble doesn't fight the drag-target ring.
     Uses event delegation on #invRackView so it auto-applies to every
     re-render without re-wiring per slot. */
  function ensureRackTooltipEl() {
    let tip = document.getElementById("rackHoverTip");
    if (tip) return tip;
    tip = document.createElement("div");
    tip.id = "rackHoverTip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tip);
    return tip;
  }
  function buildRackTooltipHTML(row, coord, locked) {
    const cap = row.capacity || 1000;
    const cur = row.weightAvailable != null ? row.weightAvailable : 0;
    const pct = Math.max(0, Math.min(100, Math.round((cur / cap) * 100)));
    const bg  = colorBg(row);
    const brand = row.brand || "—";
    const material = row.material || "—";
    const colorName = row.colorName || "";
    // Two-column layout when a material image (TigerTag+ `url_img`) exists:
    // image fills the full height on the LEFT, all existing tooltip content
    // (head / weight / locked) stacks in a column on the RIGHT. When there's
    // no image, the image cell is simply absent — `.rht-row` collapses to a
    // single column so the rest of the layout is unchanged.
    // `onerror="this.remove()"` quietly drops the image cell if the URL fails
    // (cached URL no longer reachable, offline, etc.) — the tooltip then
    // reflows into the single-column layout without a broken-image icon.
    const matImgHtml = row.imgUrl
      ? `<img class="rht-mat-img" src="${esc(row.imgUrl)}" alt="" onerror="this.remove()"/>`
      : "";
    return `
      <div class="rht-row">
        ${matImgHtml}
        <div class="rht-col">
          <div class="rht-head">
            <div class="rht-puck"><div class="rht-puck-fill" style="height:${pct}%;background:${bg}"></div></div>
            <div class="rht-titles">
              <div class="rht-brand">${esc(brand)}</div>
              <div class="rht-mat">${esc(material)}${colorName ? ` · ${esc(colorName)}` : ""}</div>
            </div>
            ${coord ? `<div class="rht-coord">${esc(coord)}</div>` : ""}
          </div>
          <div class="rht-weight">
            <div class="rht-weight-line">
              <span class="rht-weight-cur">${cur}</span><span class="rht-weight-sep">/</span><span class="rht-weight-cap">${cap} g</span>
              <span class="rht-weight-pct">${pct}%</span>
            </div>
            <div class="rht-weight-bar"><div class="rht-weight-bar-fill" style="width:${pct}%"></div></div>
          </div>
          ${locked ? `<div class="rht-locked"><span class="icon icon-lock icon-13"></span>${esc(t("rackPinnedTip"))}</div>` : ""}
        </div>
      </div>
    `;
  }
  function positionRackTooltip(tip, slot) {
    const rect = slot.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const PAD = 8;
    // Default: above the slot, horizontally centered on it
    let left = rect.left + rect.width / 2 - tw / 2;
    let top  = rect.top - th - PAD;
    // Clamp horizontally
    if (left < PAD) left = PAD;
    if (left + tw > window.innerWidth - PAD) left = window.innerWidth - tw - PAD;
    // Flip below if not enough room above
    if (top < PAD) top = rect.bottom + PAD;
    tip.style.left = left + "px";
    tip.style.top  = top + "px";
  }
  function showRackTooltipFor(slot) {
    if (document.body.classList.contains("is-dragging-spool")) return;
    const sid = slot.dataset.spoolId;
    if (!sid) return;
    const row = state.rows.find(r => r.spoolId === sid);
    if (!row) return;
    const tip = ensureRackTooltipEl();
    const coord = slot.dataset.coord || "";
    const locked = slot.classList.contains("rp-slot--locked");
    tip.innerHTML = buildRackTooltipHTML(row, coord, locked);
    tip.classList.add("is-open");
    tip.setAttribute("aria-hidden", "false");
    // Defer positioning to next frame so we have correct measured size
    requestAnimationFrame(() => positionRackTooltip(tip, slot));
  }
  function hideRackTooltip() {
    const tip = document.getElementById("rackHoverTip");
    if (!tip) return;
    tip.classList.remove("is-open");
    tip.setAttribute("aria-hidden", "true");
  }
  // Wire delegated mouseover/mouseout on #invRackView ONCE — survives re-renders.
  function wireRackTooltipDelegation() {
    const root = $("invRackView");
    if (!root || root._tooltipWired) return;
    root._tooltipWired = true;
    root.addEventListener("mouseover", e => {
      const slot = e.target.closest(".rp-slot--filled");
      if (!slot) return;
      // Only fire when the cursor first enters the slot (not on child re-targets)
      if (e.relatedTarget && slot.contains(e.relatedTarget)) return;
      showRackTooltipFor(slot);
    });
    root.addEventListener("mouseout", e => {
      const slot = e.target.closest(".rp-slot--filled");
      if (!slot) return;
      if (e.relatedTarget && slot.contains(e.relatedTarget)) return;
      hideRackTooltip();
    });
    // Hide on scroll inside the rack view (the slot moves but the tip stays)
    root.addEventListener("scroll", hideRackTooltip, true);
  }

  // ── Instant tooltip for control buttons ([data-acu-tip]) ───────────────
  // A single <body>-level bubble positioned with position:fixed, so it is not
  // clipped by the .elg-jog-xy-circle overflow:hidden. Appears immediately on
  // hover (no native `title` delay), wording mirrors AnycubicSlicerNext.
  (function wireAcuTooltip() {
    let tipEl = null;
    const ensure = () => {
      if (!tipEl) {
        tipEl = document.createElement("div");
        tipEl.className = "acu-tip-pop";
        document.body.appendChild(tipEl);
      }
      return tipEl;
    };
    document.addEventListener("mouseover", e => {
      const host = e.target.closest("[data-acu-tip]");
      if (!host) return;
      if (e.relatedTarget && host.contains(e.relatedTarget)) return;
      const txt = host.getAttribute("data-acu-tip");
      if (!txt) return;
      const pop = ensure();
      pop.textContent = txt;
      const r = host.getBoundingClientRect();
      pop.style.left = `${r.left + r.width / 2}px`;
      pop.style.top  = `${r.top}px`;
      pop.classList.add("show");
    });
    document.addEventListener("mouseout", e => {
      const host = e.target.closest("[data-acu-tip]");
      if (!host || !tipEl) return;
      if (e.relatedTarget && host.contains(e.relatedTarget)) return;
      tipEl.classList.remove("show");
    });
  })();

  function renderRackView() {
    const list = $("invRackView");
    if (!list) return;
    // ── Read-only flag — true when viewing a friend's storage. Disables
    // create / edit / delete / drag / drop / lock-toggle. Kept as one variable
    // (vs scattering checks) so future call sites stay consistent.
    const readOnly = !!state.friendView;
    list.classList.toggle("is-read-only", readOnly);
    wireRackTooltipDelegation();
    // If a side-row drag just ended, defer rebuild until the slide-back finishes
    const remaining = _unrackedSettleUntil - Date.now();
    if (remaining > 0 && !_rackRenderDeferred) {
      _rackRenderDeferred = true;
      setTimeout(() => { _rackRenderDeferred = false; renderRackView(); }, remaining);
      return;
    }

    // ── Stats bar — global overview at the top of Storage. Shows: rack count,
    // filled-vs-total slots (with mini progress bar), empty count, locked count,
    // and the "Spools not stored" toggle on the right.
    // The count excludes empty spools (weight ≤ 0) — they stay visible in
    // the panel but don't inflate the headline number.
    const unrankedCount = getUnrackedSpools().filter(r => !isEmptyRow(r)).length;
    const racksCount   = state.racks.length;
    // A spool only counts as occupying a slot when:
    //   1. its `rackId` matches an existing rack (filters out orphans whose
    //      rack has been deleted);
    //   2. its `rackLevel` / `rackPos` are integers inside the rack's grid
    //      (filters out spools with stale / out-of-bounds coords).
    // Without these guards the count happily exceeds total capacity (e.g.
    // 130 filled / 117 total when a rack with 53 spools is deleted) and
    // FREE collapses to 0 via Math.max(0, total - filled).
    const racksById = new Map(state.racks.map(r => [r.id, r]));
    const _isInValidSlot = x => {
      if (x.deleted || !x.rackId) return false;
      const rk = racksById.get(x.rackId);
      if (!rk) return false;
      if (!Number.isInteger(x.rackLevel) || !Number.isInteger(x.rackPos)) return false;
      if (x.rackLevel < 0 || x.rackLevel >= (rk.level    || 0)) return false;
      if (x.rackPos   < 0 || x.rackPos   >= (rk.position || 0)) return false;
      return true;
    };
    let totalSlotsAll = 0, filledSlotsAll = 0, lockedSlotsAll = 0, lockedEmptyAll = 0;
    state.racks.forEach(r => {
      const lvN = r.level || 0, psN = r.position || 0;
      totalSlotsAll += lvN * psN;
      const locks = Array.isArray(r.lockedSlots) ? r.lockedSlots : [];
      lockedSlotsAll += locks.length;
      // A locked-but-EMPTY slot (case 1, "unusable") is dead space: it can't
      // hold material, so it's subtracted from the available count below.
      // A locked-but-FILLED slot (case 2, "pinned") is already counted as filled.
      locks.forEach(key => {
        const [klv, kpos] = key.split(":").map(Number);
        if (klv >= 0 && klv < lvN && kpos >= 0 && kpos < psN && !findSpoolInSlot(r.id, klv, kpos)) {
          lockedEmptyAll++;
        }
      });
    });
    // Count one slot per physical spool — a twin pair (2 linked tags) occupies
    // a single slot, so collapse it before counting.
    filledSlotsAll = deduplicateTwins(state.rows.filter(_isInValidSlot)).length;

    // One-shot cleanup of orphan rack references: spools whose rackId points
    // to a rack that no longer exists (typically left behind by an old
    // version of `deleteRack` that didn't FV.delete() the legacy flat
    // `rack_id` / `level` / `position` fields). Without this they'd stay
    // ghost-assigned forever — counted nowhere visible but bloating queries.
    // Guarded so it runs at most once per renderRackView call AND not at all
    // while inventory or racks are still loading (to avoid clearing valid
    // rackIds before the rack doc has arrived).
    if (!state.invLoading && state.racks.length > 0 && !_orphanCleanupInFlight) {
      const orphans = state.rows.filter(x =>
        !x.deleted && x.rackId && !racksById.has(x.rackId)
      );
      if (orphans.length > 0) {
        _orphanCleanupInFlight = true;
        _cleanupOrphanRackRefs(orphans).finally(() => { _orphanCleanupInFlight = false; });
      }
    }
    // Usable capacity = physical total minus locked-EMPTY (unusable) slots:
    // locking an empty slot takes it out of the rack's storable capacity, so
    // the "filled / total" denominator drops (198 → 197). Locked-FILLED
    // (pinned) slots stay counted — they still hold material.
    const usableSlotsAll = Math.max(0, totalSlotsAll - lockedEmptyAll);
    // "Available" = usable capacity not yet filled.
    const emptySlotsAll = Math.max(0, usableSlotsAll - filledSlotsAll);
    const fillPctAll = usableSlotsAll > 0 ? Math.round((filledSlotsAll / usableSlotsAll) * 100) : 0;
    // Depleted spools: active inventory items where the user has used up
    // all the filament (weightAvailable <= 0). They're still in the
    // database but ready to be discarded / replaced.
    const depletedSpoolsCount = state.rows.filter(x =>
      !x.deleted && (x.weightAvailable != null) && Number(x.weightAvailable) <= 0
    ).length;
    const racksLabel = t("rackStatsRacks", { n: racksCount });
    // The unranked panel is opened/closed by the "not stored" tile in the
    // stats bar (we still need this read here to set the tile's active state).
    // Forced closed when the active count is 0 — there's nothing actionable
    // to show, so the panel sliding in just wastes screen real estate. The
    // user's persisted preference is preserved (we don't overwrite it),
    // we just don't honour it when the panel would open empty.
    const userWantsPanelOpen = localStorage.getItem("tigertag.unrackedPanelOpen") !== "false";
    const panelOpenInit = userWantsPanelOpen && unrankedCount > 0;
    // Note: the in-stats "+ New Rack" tile was removed — the header
    // "+ Add Rack" button (same one that becomes "Add Product" / "Add
    // Device" in other views) now owns that action. The empty-state CTA
    // (`btnNewRackEmpty`) is still rendered when the user has zero racks.
    let html = `
      <div class="rv-header">
        <div class="rv-stats" role="group" aria-label="Storage overview">
          ${racksCount ? `
          <div class="rv-stat" data-stat="racks" title="${esc(racksLabel)}">
            <div class="rv-stat-num">${racksCount}</div>
            <div class="rv-stat-lbl">${esc(racksLabel)}</div>
          </div>
          <div class="rv-stat rv-stat--wide rv-stat--slots" data-stat="slots" title="${filledSlotsAll}/${usableSlotsAll} ${esc(t("rackStatsSlots"))}">
            <div class="rv-stat-line">
              <span class="rv-stat-num"><span class="rv-stat-num-strong">${filledSlotsAll}</span><span class="rv-stat-num-sep">/</span><span class="rv-stat-num-soft">${usableSlotsAll}</span></span>
              <span class="rv-stat-lbl rv-stat-lbl--inline">${esc(t("rackStatsSlots"))}</span>
            </div>
            <div class="rv-stat-bar"><div class="rv-stat-bar-fill" style="width:${fillPctAll}%"></div></div>
          </div>
          <div class="rv-stat rv-stat--clickable" data-stat="empty" title="Highlight empty slots">
            <div class="rv-stat-num">${emptySlotsAll}</div>
            <div class="rv-stat-lbl">${esc(t("rackStatsEmpty"))}</div>
          </div>
          <div class="rv-stat rv-stat--clickable" data-stat="locked" title="Highlight locked slots">
            <div class="rv-stat-num">${lockedSlotsAll}</div>
            <div class="rv-stat-lbl">${esc(t("rackStatsLocked"))}</div>
          </div>
          <div class="rv-stat rv-stat--clickable" data-stat="depleted" title="${esc(t("rackStatsDepletedTip") || "Spools with no filament left")}">
            <div class="rv-stat-num">${depletedSpoolsCount}</div>
            <div class="rv-stat-lbl">${esc(t("rackStatsDepleted"))}</div>
          </div>` : ``}
          <div id="btnToggleUnranked" class="rv-stat rv-stat--clickable rv-stat--orange${panelOpenInit ? " rv-stat--active" : ""}" data-stat="unranked" title="${esc(t("rackUnrackedTitle"))}" role="button" tabindex="0" aria-pressed="${panelOpenInit ? "true" : "false"}">
            <div class="rv-stat-body">
              <div class="rv-stat-num">${unrankedCount}</div>
              <div class="rv-stat-lbl">${esc(t("rackStatsUnranked"))}</div>
            </div>
            <span class="rv-stat-chev icon icon-chevrons-r icon-20" aria-hidden="true"></span>
          </div>
        </div>
      </div>`;

    // ── Two-column layout: left = racks (or empty-state when none),
    //    right = unranked sidebar (always shown so the user can see/manage
    //    their filaments even before creating a first rack).
    const unranked = getUnrackedSpools();
    const sideRows = unranked.map(unrackedRowHTML).join("")
                  || `<div class="rp-unranked-empty">${t("rackAllPlaced")}</div>`;

    // Empty-state card replaces the rack list when there's no rack yet.
    // In read-only (friend view) we hide the "+ Create rack" CTA — the user
    // can't create racks for someone else's account.
    const emptyHTML = !state.racks.length
      ? `<div class="rp-empty">
          <img class="rp-empty-img" src="../assets/img/Panda_Feed_Rack.png" alt="" />
          <div class="rp-empty-sub">${t(readOnly ? "racksEmptyFriendSub" : "racksEmptySub")}</div>
          ${readOnly ? "" : `<button class="rp-cta rp-empty-cta" id="btnNewRackEmpty">
            <span class="icon icon-plus icon-14"></span>
            <span data-i18n="rackNew">${t("rackNew")}</span>
          </button>`}
        </div>`
      : "";

    const racksHTML = state.racks.map(r => {
      const rows = [];
      // Coordinate system: bottom shelf = "A" (going up to B, C, …), slots
      // numbered 1..N from left. A slot is referenced as "B3" = shelf B, slot 3.
      const shelfLetter = (lv) => String.fromCharCode(65 + lv);
      // Column header: 1 2 3 … N (font mono, muted, small)
      const colHeaderCells = [];
      for (let pos = 0; pos < r.position; pos++) {
        colHeaderCells.push(`<span class="rp-col-label">${pos + 1}</span>`);
      }
      rows.push(`<div class="rp-row rp-row--header"><span class="rp-row-label"></span><div class="rp-row-slots" style="--slots:${r.position}">${colHeaderCells.join("")}</div></div>`);
      // Render top shelf first (level r.level-1 at top, level 0 at bottom — physical layout)
      for (let lv = r.level - 1; lv >= 0; lv--) {
        const cells = [];
        for (let pos = 0; pos < r.position; pos++) {
          const occ    = findSpoolInSlot(r.id, lv, pos);
          const locked = isSlotLocked(r.id, lv, pos);
          // Two locked sub-states with distinct meaning + visual:
          //   pinned   = locked + occupied → material can't be moved / cleared
          //   unusable = locked + empty    → dead slot, excluded from "available"
          const lockCls = locked ? (occ ? " rp-slot--locked rp-slot--pinned" : " rp-slot--locked rp-slot--unusable") : "";
          const coord = `${shelfLetter(lv)}${pos + 1}`;
          if (occ) {
            // Bounce-in marker if this spool was just placed (drop / auto-fill).
            // The class is consumed once and stripped after the animation.
            const justPlaced = _justPlacedSpools.has(occ.spoolId) || _justFilledSlots.has(`${r.id}|${lv}|${pos}`);
            const bounceCls = justPlaced ? " rp-slot--just-placed" : "";
            // No native title — the rich custom tooltip (#rackHoverTip) handles
            // the on-hover info bubble. draggable=false on locked filled slots.
            cells.push(`<div class="rp-slot rp-slot--filled${lockCls}${bounceCls}" draggable="${(readOnly || locked) ? "false" : "true"}"
                              data-rack="${esc(r.id)}" data-level="${lv}" data-pos="${pos}"
                              data-spool-id="${esc(occ.spoolId)}"
                              data-coord="${coord}">${slotFillInnerHTML(occ)}</div>`);
          } else {
            const tip = locked ? `[${coord}] ${t("rackUnusableTip")}` : `[${coord}]`;
            cells.push(`<div class="rp-slot${lockCls}" data-rack="${esc(r.id)}" data-level="${lv}" data-pos="${pos}" title="${tip}" data-coord="${coord}"></div>`);
          }
        }
        rows.push(`<div class="rp-row"><span class="rp-row-label">${shelfLetter(lv)}</span><div class="rp-row-slots" style="--slots:${r.position}">${cells.join("")}</div></div>`);
      }
      const totalSlots = r.level * r.position;
      // Twin pairs share one slot — collapse so the count can't exceed capacity.
      // Reuses `_isInValidSlot` from the stats block above so per-rack and
      // global numbers stay consistent (excludes orphans / out-of-bounds coords).
      const filled     = deduplicateTwins(
        state.rows.filter(x => x.rackId === r.id && _isInValidSlot(x))
      ).length;
      const lockedCnt  = Array.isArray(r.lockedSlots) ? r.lockedSlots.length : 0;
      const allLocked  = lockedCnt > 0 && lockedCnt === totalSlots;
      // Drop locked-empty (unusable) slots from this rack's denominator too,
      // mirroring the global "usable capacity" count in the stats bar.
      let lockedEmptyCnt = 0;
      (Array.isArray(r.lockedSlots) ? r.lockedSlots : []).forEach(key => {
        const [klv, kpos] = key.split(":").map(Number);
        if (klv >= 0 && klv < r.level && kpos >= 0 && kpos < r.position
            && !findSpoolInSlot(r.id, klv, kpos)) lockedEmptyCnt++;
      });
      const usableSlots = Math.max(0, totalSlots - lockedEmptyCnt);
      return `<div class="rp-rack" data-rack-id="${esc(r.id)}">
        <div class="rp-rack-head">
          ${readOnly ? "" : `<span class="rp-rack-grip" title="Drag to reorder" draggable="true" data-rack-drag-id="${esc(r.id)}">⋮⋮</span>`}
          <div class="rp-rack-info">
            <div class="rp-rack-name">
              <span class="rp-rack-name-text">${esc(r.name)}</span>
              <span class="rp-rack-count">·</span>
              <span class="rp-rack-count-num">${filled}/${usableSlots}</span>
            </div>
          </div>
          ${readOnly ? "" : `<div class="rp-rack-actions">
            <button class="rp-rack-btn rp-rack-kebab" data-action="kebab" title="${esc(t("rackActionMore"))}" aria-label="${esc(t("rackActionMore"))}" aria-haspopup="menu" aria-expanded="false"><span class="icon icon-kebab icon-18"></span></button>
            <div class="rp-menu" data-menu-for="${esc(r.id)}" hidden>
              <button class="rp-menu-item" data-action="edit"><span class="icon icon-edit icon-14"></span><span>${esc(t("rackActionEdit"))}</span></button>
              <button class="rp-menu-item" data-action="autofill"><span class="icon icon-sparkle icon-14"></span><span>${esc(t("rackActionAutofill"))}</span></button>
              <button class="rp-menu-item" data-action="${allLocked ? "unlockall" : "lockall"}"><span class="icon icon-lock icon-14"></span><span>${esc(allLocked ? t("rackActionUnlockAll") : t("rackActionLockAll"))}</span></button>
              <button class="rp-menu-item rp-menu-item--hold" data-action="empty"><span class="hold-progress hold-progress--primary"></span><span class="icon icon-broom icon-14"></span><span class="rp-menu-label">${esc(t("rackActionEmpty"))}</span></button>
              <div class="rp-menu-sep"></div>
              <button class="rp-menu-item rp-menu-item--danger rp-menu-item--hold" data-action="delete"><span class="hold-progress"></span><span class="icon icon-trash icon-14"></span><span class="rp-menu-label">${esc(t("rackActionDelete"))}</span></button>
            </div>
          </div>`}
        </div>
        <div class="rp-frame">
          <div class="rp-grid">${rows.join("")}</div>
        </div>
      </div>`;
    }).join("");

    // The unranked panel is now a slide-in (fixed positioning), opened on
    // demand via the "not stored" tile in the stats bar. The DOM stays inside
    // #invRackView so the existing drag/drop selectors keep working.
    // Contextual "+ Add Rack" CTA in the side panel — shown when the user
    // has more unranked spools than free slots (= not enough storage left
    // to absorb the backlog). Hidden when there's still room to drag spools
    // into existing racks.
    const _activeUnrankedCount = unranked.filter(r => !isEmptyRow(r)).length;
    const showSideAddRackCta   = !readOnly && _activeUnrankedCount > 0
                                 && _activeUnrankedCount > emptySlotsAll;

    html += `
      <div class="rp-racks-col">${racksHTML || emptyHTML}</div>
      <aside class="rp-side${panelOpenInit ? " is-open" : ""}" id="rpUnranked">
        <div class="rp-side-head">
          <span class="rp-side-count">${_activeUnrankedCount}</span>
          <span class="rp-side-title">${t("rackUnrackedTitle")}</span>
          <button class="rp-side-close" id="rpUnrackedClose" title="Hide panel" aria-label="Close">✕</button>
        </div>
        ${showSideAddRackCta ? `
        <div class="rp-side-add-rack" id="rpSideAddRackBlock">
          <button class="rp-side-add-rack-btn" id="rpSideAddRackBtn" type="button">
            <span class="icon icon-plus icon-13"></span>
            <span>${esc(t("addRackBtn"))}</span>
          </button>
          <div class="rp-side-add-rack-hint">${esc(t("rackNoSpaceHint"))}</div>
        </div>` : ""}
        ${readOnly ? "" : `
        <!-- Auto Storage / Auto Unstorage toggles. They live together in
             a single "Automation" card so the user sees the two opposing
             policies side-by-side.
             - Auto Storage    → place new unranked spools in the first free slot
             - Auto Unstorage  → free the rack slot when a spool reaches 0g
                                  (data is kept; the spool just returns to the
                                   "Spools not stored" pile, never deleted) -->
        <div class="rp-side-auto-card">
          <label class="rp-side-toggle">
            <span class="rp-side-toggle-text">
              <span class="rp-side-toggle-title" data-i18n="autoStorageTitle">Auto storage</span>
              <span class="rp-side-toggle-sub" data-i18n="autoStorageSub">Place new spools automatically</span>
            </span>
            <span class="eac-toggle">
              <input type="checkbox" id="rpAutoStorageToggle" />
              <span class="eac-toggle-track"><span class="eac-toggle-thumb"></span></span>
            </span>
          </label>
          <label class="rp-side-toggle">
            <span class="rp-side-toggle-text">
              <span class="rp-side-toggle-title" data-i18n="autoUnstorageTitle">Auto unstorage</span>
              <span class="rp-side-toggle-sub" data-i18n="autoUnstorageSub">Free the rack slot when a spool reaches 0g</span>
            </span>
            <span class="eac-toggle">
              <input type="checkbox" id="rpAutoUnstorageToggle" />
              <span class="eac-toggle-track"><span class="eac-toggle-thumb"></span></span>
            </span>
          </label>
        </div>`}
        <div class="rp-side-search">
          <input id="rpUnrackedSearch" type="text" placeholder="${t("searchShort")}" />
          <span class="icon icon-search icon-13"></span>
        </div>
        <div class="rp-side-list" id="rpUnrackedStrip">${sideRows}</div>
      </aside>`;

    list.innerHTML = html;

    // ── Run the masonry packing AFTER the DOM is in place. requestAnimationFrame
    // gives the browser a frame to compute natural dimensions, then we measure
    // and absolutely-position each rack at its skyline-best position.
    // Also (re)wire a ResizeObserver so panel toggles / viewport tweaks reflow.
    requestAnimationFrame(() => {
      layoutRacksMasonry();
      const target = document.querySelector("#invRackView .rp-racks-col");
      if (target && typeof ResizeObserver !== "undefined") {
        if (_masonryRO) _masonryRO.disconnect();
        // Only react to WIDTH changes — height changes are caused by US
        // setting container.style.height, which would loop.
        _masonryRO = new ResizeObserver(entries => {
          const w = Math.round(entries[0]?.contentRect?.width || 0);
          if (w && Math.abs(w - _masonryLastWidth) > 1) {
            _masonryLastWidth = w;
            scheduleMasonryRelayout();
          }
        });
        _masonryRO.observe(target);
        _masonryLastWidth = Math.round(target.clientWidth);
      }
    });

    // ── Staggered bounce-in for newly placed slots
    // For drag-drop: 1 slot pops in ~immediately (220ms anim).
    // For auto-fill: many slots pop in with a 30ms inter-slot delay so the
    // rack visibly fills "left to right, top to bottom" in waves.
    const justPlaced = list.querySelectorAll(".rp-slot--just-placed");
    if (justPlaced.length) {
      // Sort by visual order (rack order, then top→bottom, then left→right)
      const ordered = Array.from(justPlaced).sort((a, b) => {
        const ra = a.closest(".rp-rack"); const rb = b.closest(".rp-rack");
        if (ra !== rb) {
          // Use index in the racks col to break racks tie
          const allRacks = Array.from(list.querySelectorAll(".rp-rack"));
          return allRacks.indexOf(ra) - allRacks.indexOf(rb);
        }
        const lvA = parseInt(a.dataset.level, 10), lvB = parseInt(b.dataset.level, 10);
        if (lvA !== lvB) return lvB - lvA;   // top shelf first
        return parseInt(a.dataset.pos, 10) - parseInt(b.dataset.pos, 10);
      });
      ordered.forEach((el, i) => {
        const delay = Math.min(i * 30, 1200);   // cap so very long fills finish in reasonable time
        el.style.animationDelay = delay + "ms";
        // Strip the class once the animation has had time to run, so a
        // subsequent re-render doesn't replay the bounce.
        setTimeout(() => {
          el.classList.remove("rp-slot--just-placed");
          el.style.animationDelay = "";
        }, delay + 400);
      });
      _justPlacedSpools.clear();
      _justFilledSlots.clear();
    }

    // ── Stat-bar filter chips: clicking "empty" / "locked" / "depleted"
    // highlights all matching slots with a glow ring. Click the same chip
    // again to clear. The "unranked" tile has its own click handler (below)
    // — it toggles the side panel, so we explicitly skip it here.
    list.querySelectorAll(".rv-stat--clickable").forEach(tile => {
      if (tile.id === "btnToggleUnranked") return;
      tile.addEventListener("click", () => {
        const kind = tile.dataset.stat;   // "empty" | "locked" | "depleted"
        const wasActive = tile.classList.contains("rv-stat--active");
        // Reset all chips + clear all glow rings (but don't touch the
        // "unranked" tile's active state — its semantics differ).
        list.querySelectorAll(".rv-stat--active:not(#btnToggleUnranked)")
          .forEach(t => t.classList.remove("rv-stat--active"));
        list.querySelectorAll(".rp-slot--highlight").forEach(s => s.classList.remove("rp-slot--highlight"));
        if (wasActive) return;
        tile.classList.add("rv-stat--active");
        if (kind === "empty") {
          list.querySelectorAll(".rp-slot:not(.rp-slot--filled):not(.rp-slot--locked)")
            .forEach(s => s.classList.add("rp-slot--highlight"));
        } else if (kind === "locked") {
          list.querySelectorAll(".rp-slot--locked").forEach(s => s.classList.add("rp-slot--highlight"));
        } else if (kind === "depleted") {
          // Highlight every filled slot whose underlying spool is depleted
          // (weightAvailable <= 0). Lookup is by spoolId on the slot DOM.
          list.querySelectorAll(".rp-slot--filled").forEach(s => {
            const sid = s.dataset.spoolId;
            const row = sid ? state.rows.find(r => r.spoolId === sid) : null;
            if (row && row.weightAvailable != null && Number(row.weightAvailable) <= 0) {
              s.classList.add("rp-slot--highlight");
            }
          });
        }
      });
    });

    // If we just entered Storage mode with unranked spools, animate the side
    // panel sliding in (otherwise it would already be at translateX(0) on the
    // first paint — no transition). Render with .is-open OFF, then add it on
    // the next frame so the CSS transition fires.
    if (_unrackedAnimateOpen) {
      _unrackedAnimateOpen = false;
      const aside = $("rpUnranked");
      if (aside) {
        aside.classList.remove("is-open");
        // Two rAFs: first paints the closed state, second triggers the open.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => aside.classList.add("is-open"));
        });
      }
    }

    // ── Wire rack head kebab → opens contextual menu
    list.querySelectorAll(".rp-rack-kebab").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const card = btn.closest("[data-rack-id]");
        if (!card) return;
        const menu = card.querySelector(".rp-menu");
        if (!menu) return;
        const isOpen = !menu.hidden;
        // Close any other open menus first
        document.querySelectorAll(".rp-menu").forEach(m => { m.hidden = true; });
        document.querySelectorAll(".rp-rack-kebab[aria-expanded='true']").forEach(b => b.setAttribute("aria-expanded", "false"));
        if (isOpen) return;
        menu.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        // Position the menu — anchor to the kebab button. Use fixed positioning
        // so the menu can escape rack overflow. Compute on open and on resize.
        positionRackMenu(menu, btn);
      });
    });
    // Click-away → close any open kebab menu
    if (!list._kebabOutsideWired) {
      list._kebabOutsideWired = true;
      document.addEventListener("click", e => {
        if (e.target.closest(".rp-menu")) return;
        if (e.target.closest(".rp-rack-kebab")) return;
        document.querySelectorAll(".rp-menu").forEach(m => { m.hidden = true; });
        document.querySelectorAll(".rp-rack-kebab[aria-expanded='true']").forEach(b => b.setAttribute("aria-expanded", "false"));
      });
    }
    // Wire all menu items. Two flavours:
    //   • Regular click → action runs immediately (Edit, Auto-fill, Lock all)
    //   • Hold-to-confirm (.rp-menu-item--hold) → action only runs after a 1.2s
    //     press, with a fill animation. Used for irreversible / destructive
    //     actions (Clear all, Delete) so a misclick can't wipe the rack.
    list.querySelectorAll(".rp-menu-item").forEach(btn => {
      const card = btn.closest("[data-rack-id]");
      if (!card) return;
      const rackId = card.dataset.rackId;
      const action = btn.dataset.action;
      const closeMenu = () => {
        const menu = card.querySelector(".rp-menu");
        if (menu) menu.hidden = true;
        const kebab = card.querySelector(".rp-rack-kebab");
        if (kebab) kebab.setAttribute("aria-expanded", "false");
      };
      const runAction = async () => {
        const rack = state.racks.find(r => r.id === rackId);
        if (!rack) return;
        try {
          if (action === "edit")           openRackEditModal(rack);
          else if (action === "delete")    await deleteRack(rack.id);
          else if (action === "autofill")  await autoFillEmptySlots(rack.id);
          else if (action === "lockall")   await lockAllSlots(rack.id);
          else if (action === "unlockall") await unlockAllSlots(rack.id);
          else if (action === "empty")     await emptyRack(rack.id);
        } catch (err) { reportError("rack.menu." + action, err); }
      };
      if (btn.classList.contains("rp-menu-item--hold")) {
        // Hold-to-confirm: 1.2s press. Click without hold = no-op (the click
        // event still fires after pointerup, but the timer was cancelled).
        // We swallow the regular click to avoid triggering the action.
        btn.addEventListener("click", e => { e.stopPropagation(); e.preventDefault(); });
        setupHoldToConfirm(btn, 1200, () => {
          closeMenu();
          runAction();
        });
      } else {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          closeMenu();
          runAction();
        });
      }
    });

    // ── Live search — re-renders unranked sidebar AND dims non-matching rack slots
    const search = $("rpUnrackedSearch");
    if (search) {
      search.addEventListener("input", () => {
        const strip = $("rpUnrackedStrip");
        const cnt   = $("rpUnranked")?.querySelector(".rp-side-count");
        if (!strip) return;
        const filtered = getUnrackedSpools();
        // Both counters exclude empty spools — they're visible in the
        // list but shouldn't be tallied (consumed spools don't count
        // as "to be stored"). Keep the rendered list at full length.
        const activeCount = filtered.filter(r => !isEmptyRow(r)).length;
        if (cnt) cnt.textContent = activeCount;
        const tileNum = $("btnToggleUnranked")?.querySelector(".rv-stat-num");
        if (tileNum) tileNum.textContent = activeCount;
        strip.innerHTML = filtered.map(unrackedRowHTML).join("")
                       || `<div class="rp-unranked-empty">${t("noMatch")}</div>`;
        wireDragSources();
        // Re-wire click for newly rendered side rows
        strip.querySelectorAll(".rp-side-row").forEach(el => {
          el.addEventListener("click", () => {
            if (el._wasDragged) { el._wasDragged = false; return; }
            const sid = el.dataset.spoolId; if (sid) openDetail(sid);
          });
        });
      });
    }
    // Apply dim from the main search bar at every rack-view render
    applyRackSearchDim();

    // ── Click on a filled slot or unranked row → open the spool detail panel
    list.querySelectorAll(".rp-slot--filled, .rp-side-row").forEach(el => {
      el.addEventListener("click", e => {
        // Avoid firing if it was a drag (drag fires its own events)
        if (el._wasDragged) { el._wasDragged = false; return; }
        const sid = el.dataset.spoolId;
        if (!sid) return;
        openDetail(sid);
      });
    });

    // Empty-state CTA when the user has zero racks. The in-stats "+ New Rack"
    // tile is gone — the header "+ Add Rack" button is the primary entry point now.
    $("btnNewRackEmpty")?.addEventListener("click", () => openRackEditModal(null));
    // Contextual CTA inside the "not stored" side panel — appears when there
    // are more unstored spools than free slots.
    $("rpSideAddRackBtn")?.addEventListener("click", () => openRackEditModal(null));

    // ── Drag-and-drop to reorder racks (grip handle on the rack head)
    list.querySelectorAll(".rp-rack-grip").forEach(grip => {
      grip.addEventListener("dragstart", e => {
        const rackId = grip.dataset.rackDragId;
        if (!rackId) { e.preventDefault(); return; }
        e.dataTransfer.setData("application/x-rack-id", rackId);
        e.dataTransfer.effectAllowed = "move";
        _draggingRackId = rackId;
        grip.closest(".rp-rack")?.classList.add("rp-rack--dragging");
      });
      grip.addEventListener("dragend", () => {
        grip.closest(".rp-rack")?.classList.remove("rp-rack--dragging");
        _draggingRackId = null;
        document.querySelectorAll(".rp-rack--drop-before, .rp-rack--drop-after").forEach(el => {
          el.classList.remove("rp-rack--drop-before", "rp-rack--drop-after");
        });
      });
    });
    list.querySelectorAll(".rp-rack").forEach(card => {
      card.addEventListener("dragover", e => {
        if (!_draggingRackId) return;
        if (_draggingRackId === card.dataset.rackId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = card.getBoundingClientRect();
        const before = e.clientX < rect.left + rect.width / 2;
        card.classList.toggle("rp-rack--drop-before", before);
        card.classList.toggle("rp-rack--drop-after", !before);
      });
      card.addEventListener("dragleave", () => {
        card.classList.remove("rp-rack--drop-before", "rp-rack--drop-after");
      });
      card.addEventListener("drop", async e => {
        if (!_draggingRackId) return;
        e.preventDefault();
        const targetId = card.dataset.rackId;
        const before = card.classList.contains("rp-rack--drop-before");
        card.classList.remove("rp-rack--drop-before", "rp-rack--drop-after");
        if (_draggingRackId === targetId) return;
        const srcId = _draggingRackId;
        _draggingRackId = null;
        try { await reorderRacks(srcId, targetId, before); }
        catch (err) { reportError("rack.reorder", err); }
      });
    });

    // Toggle unranked panel (slide in/out from the right, NO backdrop overlay).
    // The trigger is the "not stored" tile in the stats bar (rv-stat--toggle).
    // We sync its aria-pressed + .rv-stat--active state so the tile reads as
    // selected while the panel is open.
    function setUnrackedOpen(open) {
      const aside = $("rpUnranked");
      if (aside) aside.classList.toggle("is-open", open);
      const tile = $("btnToggleUnranked");
      if (tile) {
        tile.classList.toggle("rv-stat--active", open);
        tile.setAttribute("aria-pressed", open ? "true" : "false");
      }
      localStorage.setItem("tigertag.unrackedPanelOpen", open ? "true" : "false");
    }
    $("btnToggleUnranked")?.addEventListener("click", () => {
      const aside = $("rpUnranked");
      const open = !aside?.classList.contains("is-open");
      setUnrackedOpen(open);
    });
    // The toggle is a <div role=button> — wire keyboard activation manually
    // (Enter / Space) so it stays accessible without a real <button> element.
    $("btnToggleUnranked")?.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.target.click();
      }
    });
    $("rpUnrackedClose")?.addEventListener("click", () => setUnrackedOpen(false));

    // Auto-storage toggle inside the side panel — persisted in localStorage.
    // When flipped ON, fire the auto-fill routine immediately to clear the
    // current pile, then let `maybeAutoStoreUnrankedSpools()` handle future
    // snapshots automatically.
    const _autoStoreToggle = $("rpAutoStorageToggle");
    if (_autoStoreToggle) {
      _autoStoreToggle.checked = localStorage.getItem("tigertag.autoStorage.enabled") === "true";
      _autoStoreToggle.addEventListener("change", () => {
        const enabled = _autoStoreToggle.checked;
        localStorage.setItem("tigertag.autoStorage.enabled", enabled ? "true" : "false");
        if (enabled) maybeAutoStoreUnrankedSpools();
      });
    }
    // Auto-unstorage toggle — same pattern, triggers a one-shot pass on flip
    // so any spool currently at 0g leaves its rack immediately.
    const _autoUnstoreToggle = $("rpAutoUnstorageToggle");
    if (_autoUnstoreToggle) {
      _autoUnstoreToggle.checked = localStorage.getItem("tigertag.autoUnstorage.enabled") === "true";
      _autoUnstoreToggle.addEventListener("change", () => {
        const enabled = _autoUnstoreToggle.checked;
        localStorage.setItem("tigertag.autoUnstorage.enabled", enabled ? "true" : "false");
        if (enabled) maybeAutoUnstoreDepletedSpools();
      });
    }

    // ── Right-click on a slot → toggle its lock state (skipped in read-only)
    if (!readOnly) {
      list.querySelectorAll(".rp-slot").forEach(slot => {
        slot.addEventListener("contextmenu", async e => {
          e.preventDefault();
          const rackId = slot.dataset.rack;
          const lv     = parseInt(slot.dataset.level, 10);
          const pos    = parseInt(slot.dataset.pos, 10);
          if (!rackId || isNaN(lv) || isNaN(pos)) return;
          try { await toggleSlotLock(rackId, lv, pos); }
          catch (err) { reportError("rack.toggleLock", err); }
        });
      });
    }

    // ── Drag-and-drop wiring (skipped entirely in read-only)
    if (!readOnly) {
      wireDragSources();
      wireDropTargets();
    }
  }

  function wireDragSources() {
    document.querySelectorAll("#invRackView .rp-side-row, #invRackView .rp-chip, #invRackView .rp-slot--filled").forEach(el => {
      el.addEventListener("dragstart", e => {
        const sid = el.dataset.spoolId;
        if (!sid) { e.preventDefault(); return; }
        // Block drag-out from a locked filled slot
        const rackId = el.dataset.rack;
        if (rackId) {
          const lv  = parseInt(el.dataset.level, 10);
          const pos = parseInt(el.dataset.pos, 10);
          if (isSlotLocked(rackId, lv, pos)) { e.preventDefault(); return; }
        }
        e.dataTransfer.setData("text/plain", sid);
        e.dataTransfer.effectAllowed = "move";
        el.classList.add("rp-dragging");
        el._wasDragged = true;
        // Globally signal "spool drag in progress" so the rack view can light
        // up valid drop targets, dim locked slots, and reveal coordinates to
        // help the user aim. Cleared on dragend.
        document.body.classList.add("is-dragging-spool");
        // Hide any visible hover tooltip so it doesn't fight the drop ring
        hideRackTooltip();
        // Hide the unranked side panel while dragging FROM it, so the racks
        // behind it become accessible as drop targets. Persistent open/close
        // state is left untouched — the panel slides back in on dragend.
        if (el.classList.contains("rp-side-row")) {
          $("rpUnranked")?.classList.add("is-dragging");
        }
        // Reset the click-suppression flag shortly after the drag completes
        setTimeout(() => { el._wasDragged = false; }, 400);
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("rp-dragging");
        document.body.classList.remove("is-dragging-spool");
        // Wipe any leftover drop-target highlight (e.g. user released outside
        // a slot, or dragleave didn't fire for some reason).
        document.querySelectorAll("#invRackView .rp-slot--drop, #invRackView .rp-slot--drop-deny").forEach(s => {
          s.classList.remove("rp-slot--drop");
          s.classList.remove("rp-slot--drop-deny");
        });
        // Only set the settle window if we dragged FROM the side panel — the
        // panel needs ~300ms to slide back in, and we mustn't let the Firestore
        // snapshot rebuild the DOM mid-animation. For inter-rack drags the
        // panel is untouched, so we don't want to delay the visual update.
        if (el.classList.contains("rp-side-row")) {
          $("rpUnranked")?.classList.remove("is-dragging");
          _unrackedSettleUntil = Date.now() + 320;
        }
      });
    });
  }

  // Helper: clear the "active drop target" highlight from every slot except
  // the one we're keeping. Prevents two slots being highlighted simultaneously
  // (which can happen because dragleave fires AFTER dragenter on the next slot,
  // and especially because we scale-up the active slot — so the cursor can be
  // briefly inside two overlapping slots at once).
  function clearOtherDropHighlights(keepSlot) {
    document.querySelectorAll("#invRackView .rp-slot--drop, #invRackView .rp-slot--drop-deny").forEach(s => {
      if (s !== keepSlot) {
        s.classList.remove("rp-slot--drop");
        s.classList.remove("rp-slot--drop-deny");
      }
    });
  }
  function wireDropTargets() {
    // Slots accept drops (filled = swap, empty = place). Locked slots reject all drops.
    document.querySelectorAll("#invRackView .rp-slot").forEach(slot => {
      // dragenter is the moment the cursor first crosses into the slot —
      // perfect place to flip the highlight ON and clear any stale highlight
      // on a previously-hovered slot.
      slot.addEventListener("dragenter", e => {
        const rackId = slot.dataset.rack;
        const lv  = parseInt(slot.dataset.level, 10);
        const pos = parseInt(slot.dataset.pos, 10);
        clearOtherDropHighlights(slot);
        if (isSlotLocked(rackId, lv, pos)) {
          slot.classList.remove("rp-slot--drop");
          slot.classList.add("rp-slot--drop-deny");
        } else {
          slot.classList.remove("rp-slot--drop-deny");
          slot.classList.add("rp-slot--drop");
        }
      });
      slot.addEventListener("dragover", e => {
        const rackId = slot.dataset.rack;
        const lv  = parseInt(slot.dataset.level, 10);
        const pos = parseInt(slot.dataset.pos, 10);
        if (isSlotLocked(rackId, lv, pos)) {
          e.dataTransfer.dropEffect = "none";
          // Keep dragenter's class set; don't toggle on every dragover frame
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // Make sure this slot still has the highlight (in case dragenter
        // got skipped, e.g. when the drag started on this very slot).
        if (!slot.classList.contains("rp-slot--drop")) {
          clearOtherDropHighlights(slot);
          slot.classList.add("rp-slot--drop");
        }
      });
      slot.addEventListener("dragleave", e => {
        // Ignore spurious leaves caused by entering child elements (.rp-fill)
        // or when the cursor moves from the slot to its scaled-up portion.
        // relatedTarget is the element being entered — if it's still inside
        // the slot, we ignore the leave.
        if (e.relatedTarget && slot.contains(e.relatedTarget)) return;
        slot.classList.remove("rp-slot--drop");
        slot.classList.remove("rp-slot--drop-deny");
      });
      slot.addEventListener("drop", async e => {
        e.preventDefault();
        // Stop the event from bubbling up to the rack-view's "drop in
        // empty space → unassign" fallback. Without this, a drop on a
        // slot would assign AND immediately unassign.
        e.stopPropagation();
        slot.classList.remove("rp-slot--drop");
        slot.classList.remove("rp-slot--drop-deny");
        const sid = e.dataTransfer.getData("text/plain");
        if (!sid) return;
        const rackId = slot.dataset.rack;
        const level  = parseInt(slot.dataset.level, 10);
        const pos    = parseInt(slot.dataset.pos, 10);
        if (isSlotLocked(rackId, level, pos)) return;   // locked target rejects
        try { await assignSpoolToSlot(sid, rackId, level, pos); }
        catch (err) { console.warn("[assignSpoolToSlot]", err.message); }
      });
    });

    // The unranked strip also accepts drops (= unassign)
    const strip = $("rpUnrackedStrip");
    if (strip) {
      strip.addEventListener("dragover", e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        strip.classList.add("rp-unranked-strip--drop");
      });
      strip.addEventListener("dragleave", () => strip.classList.remove("rp-unranked-strip--drop"));
      strip.addEventListener("drop", async e => {
        e.preventDefault();
        // Stop propagation so the rack-view fallback (below) doesn't ALSO
        // try to unassign the same spool a second time.
        e.stopPropagation();
        strip.classList.remove("rp-unranked-strip--drop");
        const sid = e.dataTransfer.getData("text/plain");
        if (!sid) return;
        try { await unassignSpool(sid); }
        catch (err) { console.warn("[unassignSpool]", err.message); }
      });
    }

    // ── Drop in TRUE empty space → unassign ───────────────────────────
    // The cursor must be OUTSIDE every rack card (not just outside a
    // slot). Dropping on rack padding / title / between slots inside
    // the same rack does NOT unassign — that prevents accidental
    // dismissal when the user lifts the spool a few pixels and drops
    // it back without crossing into another rack.
    //
    // Rule of thumb: if `closest(".rp-rack")` is null, we're in the
    // void. Same logic for the unranked strip and sidebar rows (still
    // skipped since those have their own handlers).
    const view = $("invRackView");
    if (view) {
      const isVoidTarget = (target) => {
        if (!target) return false;
        // Don't override when the cursor is over a real drop target.
        if (target.closest(".rp-slot, #rpUnrackedStrip, .rp-side-row")) return false;
        // The cursor must be outside ALL rack cards. If the user is
        // hovering rack padding / title bar / inter-slot gap — that's
        // INSIDE a rack and should NOT unassign.
        if (target.closest(".rp-rack")) return false;
        return true;
      };
      view.addEventListener("dragover", e => {
        if (!document.body.classList.contains("is-dragging-spool")) return;
        if (!isVoidTarget(e.target)) {
          // Drop the highlight if we just left the void into a rack.
          view.classList.remove("rp-view--drop-void");
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        view.classList.add("rp-view--drop-void");
      });
      view.addEventListener("dragleave", e => {
        if (e.relatedTarget && view.contains(e.relatedTarget)) return;
        view.classList.remove("rp-view--drop-void");
      });
      view.addEventListener("drop", async e => {
        view.classList.remove("rp-view--drop-void");
        // Only fire on a TRUE void — closest(".rp-rack") must be null.
        if (!isVoidTarget(e.target)) return;
        e.preventDefault();
        const sid = e.dataTransfer.getData("text/plain");
        if (!sid) return;
        const row = state.rows.find(r => r.spoolId === sid);
        if (!row || !row.rackId) return; // already unranked → no-op
        // Visual confirmation BEFORE the Firestore round-trip — so the
        // user sees their action register instantly even on slow links.
        // The animation is a ghost copy of the source slot that flies
        // toward the unranked panel and fades out, while the unranked
        // panel pulses briefly to signal "the spool just landed here".
        playUnrankAnimation(row).catch(() => {});
        try { await unassignSpool(sid); }
        catch (err) { console.warn("[unassignSpool void-drop]", err.message); }
      });
    }
  }

  // Animate a single spool leaving the rack via void-drop.
  // Reuses the existing `rp-slot--cascade-out` keyframe (the same one
  // playEmptyRackCascade fires on every slot when emptying a full
  // rack), so a single eject reads visually as "one slice of the
  // empty-rack animation". We also flag the spool with
  // `_justPlacedSpools` so it gets the bounce-in landing animation in
  // the unranked sidebar once the Firestore listener rebuilds.
  function playUnrankAnimation(row) {
    return new Promise(resolve => {
      if (!row || !row.rackId) { resolve(); return; }
      const sourceSlot = document.querySelector(
        `#invRackView .rp-slot[data-rack="${CSS.escape(row.rackId)}"][data-level="${row.rackLevel}"][data-pos="${row.rackPos}"]`
      );
      // Tag the spool so the next render bounces it in at its new home.
      // Same mechanism that auto-fill / auto-store use for landed spools.
      _justPlacedSpools.add(row.spoolId);
      if (!sourceSlot) { resolve(); return; }
      sourceSlot.classList.add("rp-slot--cascade-out");
      // 280 ms matches the keyframe duration; we resolve a hair later
      // so the slot has fully faded before Firestore rebuilds the row.
      setTimeout(resolve, 300);
    });
  }

  // (Old openRacks() removed — view switching is now handled by setViewMode("rack").
  //  Kept for callers from earlier code paths that might still reference it.)

  /* ── Rack create/edit modal ── */
  let _editingRackId = null;
  function openRackEditModal(rack) {
    _editingRackId = rack?.id || null;
    $("recTitle").textContent = rack ? t("rackEdit") : t("rackNew");
    // Default name for a new rack — "Rack N" where N = next index in the list
    const defaultName = `Rack ${(state.racks?.length || 0) + 1}`;
    $("rackNameInput").value = rack?.name ?? defaultName;
    $("rackLevelInput").value = rack?.level || 5;
    $("rackPositionInput").value = rack?.position || 8;
    $("rackEditResult").textContent = "";
    // Reset any leftover field-level error bubbles from a previous open
    document.querySelectorAll("#rackEditOverlay .rec-field.is-invalid").forEach(f => {
      f.classList.remove("is-invalid");
      f.querySelector(".rec-field-err")?.remove();
    });
    // Save button label depends on mode: edit → "Save", new → "Create".
    // We update only the inner .label span so the .spinner sibling stays intact.
    const saveBtn = $("rackEditSave");
    const saveLabel = saveBtn?.querySelector(".label");
    if (saveLabel) saveLabel.textContent = rack ? t("rackSave") : t("rackCreate");
    if (saveBtn) saveBtn.classList.remove("loading");   // reset any leftover state
    // Delete + Empty buttons only visible in edit mode.
    // Cancel button removed — the ✕ in the corner is the only way to dismiss.
    const delBtn = $("rackEditDelete");
    if (delBtn) delBtn.classList.toggle("hidden", !rack);
    const emptyBtn = $("rackEditEmpty");
    if (emptyBtn) emptyBtn.classList.toggle("hidden", !rack);
    renderRackPresets();
    updateRackTotalLabel();
    $("rackEditOverlay").classList.add("open");
    setTimeout(() => $("rackNameInput").focus(), 80);
  }
  function closeRackEditModal() {
    $("rackEditOverlay").classList.remove("open");
    _editingRackId = null;
  }

  function renderRackPresets() {
    const el = $("recPresets");
    if (!el) return;
    const currentLevel = parseInt($("rackLevelInput").value, 10);
    const currentPos   = parseInt($("rackPositionInput").value, 10);
    const presets = state.rackPresets || [];
    const presetMatches = presets.find(p => p.level === currentLevel && p.position === currentPos);
    const isCustom = !presetMatches;
    const IMG = "../assets/img/Panda_Feed_Rack.png";

    // Two-column layout: a single big Panda image on the left,
    // the 4 preset buttons stacked vertically on the right.
    const slotsLabel = t("rackSlots") || "slots";
    const imgFor = p => `../assets/img/${p?.image || "Panda_Feed_Rack.png"}`;
    // The big image on the left reflects the currently active preset.
    // Custom (no match) → generic Panda_Feed_Rack.png
    const activeImg = presetMatches ? imgFor(presetMatches) : IMG;

    let rows = presets.map(p => {
      const matches = p === presetMatches;
      const total = p.level * p.position;
      return `<button class="rec-preset${matches ? " rec-preset--active" : ""}" data-preset-id="${esc(p.id)}">
        <span class="rec-preset-name">${esc(p.name)}</span>
        <span class="rec-preset-dim">${p.level} × ${p.position} · <strong>${total}</strong> ${esc(slotsLabel)}</span>
      </button>`;
    }).join("");
    const customTotal = (Number.isFinite(currentLevel) && Number.isFinite(currentPos))
      ? currentLevel * currentPos : 0;
    rows += `<button class="rec-preset rec-preset--custom${isCustom ? " rec-preset--active" : ""}" data-preset-id="__custom__">
      <span class="rec-preset-name">${esc(t("rackPresetCustom"))}</span>
      <span class="rec-preset-dim">${isCustom ? `${currentLevel} × ${currentPos} · <strong>${customTotal}</strong> ${esc(slotsLabel)}` : "—"}</span>
    </button>`;

    el.innerHTML = `
      <div class="rec-presets-grid">
        <img class="rec-presets-img" id="recPresetsImg" src="${activeImg}" alt="" />
        <div class="rec-presets-list">${rows}</div>
      </div>`;
    el.querySelectorAll("[data-preset-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.presetId;
        // Custom is non-mutating — just mark it active visually; the user
        // adjusts the level / position inputs manually below.
        if (id === "__custom__") {
          $("rackLevelInput").focus();
          return;
        }
        const p = presets.find(x => x.id === id);
        if (!p) return;
        // Only update dimensions — never overwrite the name (per user spec)
        $("rackLevelInput").value = p.level;
        $("rackPositionInput").value = p.position;
        renderRackPresets();
        updateRackTotalLabel();   // setting .value programmatically doesn't fire 'input' — refresh manually
      });
    });
  }

  function confirmDeleteRack(rack) {
    const msg = t("rackDeleteConfirm", { name: rack.name });
    if (!confirm(msg)) return;
    deleteRack(rack.id).catch(e => console.warn("[deleteRack]", e.message));
  }

  // (Sidebar "Storage" button removed — Storage view is reached from the
  // view-toggle row above the inventory. `btnNewRack` is rendered
  // dynamically inside the rack view header — wired in renderRackView.)
  $("rackEditClose")?.addEventListener("click", closeRackEditModal);
  // Hold-to-confirm wiring — 1.5s press-and-hold replaces the confirm() dialog.
  // Prevents accidental clicks; shows a fill animation as the user holds.
  setupHoldToConfirm($("rackEditDelete"), 1500, () => {
    if (!_editingRackId) return;
    deleteRack(_editingRackId)
      .then(() => closeRackEditModal())
      .catch(e => { reportError("rack.delete", e); $("rackEditResult").textContent = "⚠ " + (e.message || t("networkError")); });
  });
  // Hold-to-confirm Clear all — same 1.5s press-and-hold pattern as Delete,
  // but uses the orange (primary) fill instead of red since the action is
  // reversible (spools just go back to Unranked, the rack stays).
  setupHoldToConfirm($("rackEditEmpty"), 1500, async () => {
    if (!_editingRackId) return;
    try {
      await emptyRack(_editingRackId);
    } catch (e) {
      reportError("rack.empty", e);
      $("rackEditResult").textContent = "⚠ " + (e.message || t("networkError"));
    }
  });
  $("rackEditOverlay")?.addEventListener("click", e => {
    if (e.target === $("rackEditOverlay")) closeRackEditModal();
  });
  function updateRackTotalLabel() {
    const lv = parseInt($("rackLevelInput")?.value, 10);
    const ps = parseInt($("rackPositionInput")?.value, 10);
    const num = $("recTotalNum");
    const lbl = $("recTotalLbl");
    if (!num || !lbl) return;
    const total = (Number.isFinite(lv) && Number.isFinite(ps) && lv > 0 && ps > 0) ? lv * ps : null;
    num.textContent = total != null ? String(total) : "—";
    lbl.textContent = t("rackSlots") || "slots";
  }
  $("rackLevelInput")?.addEventListener("input", () => { renderRackPresets(); updateRackTotalLabel(); });
  $("rackPositionInput")?.addEventListener("input", () => { renderRackPresets(); updateRackTotalLabel(); });

  // Field-level validation helpers — red border + tooltip bubble next to the field
  function setFieldError(input, msg) {
    if (!input) return;
    const field = input.closest(".rec-field");
    if (!field) return;
    field.classList.add("is-invalid");
    let bubble = field.querySelector(".rec-field-err");
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.className = "rec-field-err";
      field.appendChild(bubble);
    }
    bubble.textContent = msg;
  }
  function clearFieldError(input) {
    if (!input) return;
    const field = input.closest(".rec-field");
    if (!field) return;
    field.classList.remove("is-invalid");
    field.querySelector(".rec-field-err")?.remove();
  }
  // Auto-clear errors as soon as the user types in a field
  ["rackNameInput", "rackLevelInput", "rackPositionInput"].forEach(id => {
    $(id)?.addEventListener("input", () => clearFieldError($(id)));
  });

  $("rackEditSave")?.addEventListener("click", async () => {
    const name     = $("rackNameInput").value.trim();
    const level    = parseInt($("rackLevelInput").value, 10);
    const position = parseInt($("rackPositionInput").value, 10);
    // Clear any previous errors before re-validating
    [$("rackNameInput"), $("rackLevelInput"), $("rackPositionInput")].forEach(clearFieldError);
    let firstInvalid = null;
    if (!name) {
      setFieldError($("rackNameInput"), t("rackNameRequired"));
      firstInvalid ||= $("rackNameInput");
    }
    if (!level || level < 1 || level > 15) {
      setFieldError($("rackLevelInput"), t("rackLevelInvalid"));
      firstInvalid ||= $("rackLevelInput");
    }
    if (!position || position < 1 || position > 20) {
      setFieldError($("rackPositionInput"), t("rackPositionInvalid"));
      firstInvalid ||= $("rackPositionInput");
    }
    if (firstInvalid) { firstInvalid.focus(); return; }

    setLoading($("rackEditSave"), true);   // spinner + disabled until Firestore confirms
    try {
      if (_editingRackId) {
        await updateRack(_editingRackId, { name, level, position });
      } else {
        await createRack({ name, level, position });
      }
      closeRackEditModal();
    } catch (e) {
      // Network / Firestore failures stay in the global result line
      $("rackEditResult").textContent = "⚠ " + (e.message || t("networkError"));
    } finally {
      setLoading($("rackEditSave"), false);
    }
  });

  /* ── Friend inventory panel ──────────────────────────────────────────────── */
  function openFriendInventory(friendUid, friendName, avatarColor) {
    // Header
    const av = $("friendInvAvatar");
    if (av) {
      const initials = (friendName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
      av.textContent = initials;
      av.style.background = avatarColor || "#888";
    }
    if ($("friendInvName")) $("friendInvName").textContent = friendName || friendUid;

    // Reset body
    const grid    = $("friendInvGrid");
    const loading = $("friendInvLoading");
    const sub     = $("friendInvSub");
    if (grid)    { grid.innerHTML = ""; grid.classList.add("hidden"); }
    if (loading) loading.classList.remove("hidden");
    if (sub)     sub.textContent = "";

    // Open panel
    $("friendInvPanel").classList.add("open");
    $("friendInvOverlay").classList.add("open");

    // Fetch friend's inventory (Firestore rules allow access if friendship keys match)
    fbDb().collection("users").doc(friendUid).collection("inventory").get()
      .then(snap => {
        if (loading) loading.classList.add("hidden");
        const rows = snap.docs
          .map(d => normalizeRow(d.id, d.data()))
          .filter(r => !r.deleted)
          .sort((a, b) => (a.brand + a.material + a.colorName).localeCompare(b.brand + b.material + b.colorName));
        if (sub) sub.textContent = t("loadedSpools", { n: rows.length });
        if (!rows.length) {
          grid.innerHTML = `<div class="fi-empty">${t("noMatch")}</div>`;
        } else {
          grid.innerHTML = rows.map(r => {
            const swatch = r.colors?.length
              ? `background:linear-gradient(135deg,${r.colors.slice(0,2).join(",")})` : "background:#888";
            return `<div class="fi-spool-card">
              <div class="fi-spool-swatch" style="${swatch}"></div>
              <div class="fi-spool-info">
                <div class="fi-spool-name">${esc(r.colorName || r.brand)}</div>
                <div class="fi-spool-meta">${esc(r.material)} · ${esc(r.brand)}</div>
                <div class="fi-spool-weight">${r.weightAvailable != null ? r.weightAvailable + " g" : "—"}</div>
              </div>
            </div>`;
          }).join("");
        }
        grid.classList.remove("hidden");
      })
      .catch(err => {
        if (loading) loading.classList.add("hidden");
        if (sub) sub.textContent = "⚠ " + (err.message || t("networkError"));
      });
  }

  function closeFriendInventory() {
    $("friendInvPanel").classList.remove("open");
    $("friendInvOverlay").classList.remove("open");
  }

  $("friendInvBack").addEventListener("click", closeFriendInventory);
  $("friendInvOverlay").addEventListener("click", closeFriendInventory);

  /* ── Friend view: friend inventory in main interface ────────────────────── */
  // Renders the top header chip (left of the KPI stats). Two modes:
  //
  //   • Friend view  → avatar + name + "READ-ONLY" badge (or error)
  //   • Own view     → avatar + name + random welcome greeting
  //
  // Hidden when no account is connected. Both modes share the same
  // visual frame (avatar | stacked name+sub), so the user gets the same
  // reading rhythm whether they're on their own inventory or peeking at
  // a friend's. Originally Friend-only, hence the historical name.
  // Last-rendered content signature of the header banner. renderInventory()
  // calls renderFriendBanner() on every pass, and the cold start fires
  // several renders in a row (spinner → cache → snapshot → bg images). If we
  // blindly reassigned innerHTML each time, the avatar <img> would be
  // destroyed + recreated repeatedly → a 2-3× flash. The signature guard
  // rebuilds the DOM ONLY when the visible content actually changes, so the
  // <img> survives identical re-renders (no flash) — same idea as paintAvatar
  // updating the sidebar avatar in place.
  let _fvbSig = null;
  function renderFriendBanner() {
    const banner = $("friendViewBanner");
    // Toggle the sidebar avatar's "swap-back" affordance — visible only
    // while we're currently viewing a friend's inventory. The avatar's
    // click handler reads the same state to decide whether to act as a
    // dropdown trigger or as a one-click "return home" button.
    $("sbUser")?.classList.toggle("sb-user--viewing-friend", !!state.friendView);
    // A friend's inventory is read-only — hide the write actions (+ Scan and
    // Add product / Add device) since none of them can act on a friend's docs.
    $("btnAddScan")?.classList.toggle("hidden", !!state.friendView);
    $("btnAddProduct")?.classList.toggle("hidden", !!state.friendView);
    if (!banner) return;
    // ─── Friend view ───────────────────────────────────────────────
    if (state.friendView) {
      const { displayName, avatarColor, photoURL, error } = state.friendView;
      // Build a synthetic source so avatarMarkup can pull gradient
      // from the friend's avatarColor (a single hex, not an RGB
      // triplet like an account uses).
      const friendSource = { displayName, photoURL, color: avatarColor };
      const p = _buildAvatarParts(friendSource);
      const sig = `friend|${displayName || ""}|${p.mode}|${p.photoURL || ""}|${p.initials}|${p.bg}|${error || ""}|${state.lang}`;
      if (sig !== _fvbSig) {
        _fvbSig = sig;
        banner.innerHTML = `
          ${avatarMarkup(friendSource, "fvb-avatar")}
          <div class="fvb-inner">
            <span class="fvb-name">${esc(displayName || "—")}</span>
            ${error
              ? `<span class="fvb-badge fvb-badge--error" title="${esc(error)}">⚠ ${t("friendInvErrorBadge")}</span>`
              : `<span class="fvb-badge">${t("friendViewReadOnly")}</span>`}
          </div>`;
      }
      banner.classList.remove("fvb--own");
      banner.classList.toggle("fvb--error", !!error);
      banner.classList.remove("hidden");
      return;
    }
    // ─── Own view (signed in, not previewing a friend) ─────────────
    const acc = activeAccount();
    if (!acc) { banner.classList.add("hidden"); banner.classList.remove("fvb--own", "fvb--error"); _fvbSig = "none"; return; }
    // `own` is the chip's displayed text — falls back to the email
    // prefix when no name is known, so the chip never reads blank.
    // (Initials are handled separately by avatarMarkup — never from
    // email — see getInitials.)
    const own = _shortName(state.displayName || acc.displayName, acc.email);
    const p = _buildAvatarParts(acc);
    const sig = `own|${own}|${p.mode}|${p.photoURL || ""}|${p.initials}|${p.bg}`;
    if (sig !== _fvbSig) {
      _fvbSig = sig;
      banner.innerHTML = `
        ${avatarMarkup(acc, "fvb-avatar")}
        <div class="fvb-inner">
          <span class="fvb-name">${esc(own)}</span>
        </div>`;
    }
    banner.classList.remove("fvb--error");
    banner.classList.add("fvb--own");
    banner.classList.remove("hidden");
  }

  // ── Friend-view auth helper ───────────────────────────────────────────
  // Strategy: ALWAYS pre-warm the Firebase Auth ID token when entering a
  // friend view, but skip the network call if the last refresh was < 30 min
  // ago (cheap throttle to avoid hitting the auth backend on every click).
  // If a read still fails with permission-denied → force-refresh and retry
  // once as a safety net.
  let _lastTokenRefresh = 0;
  const TOKEN_THROTTLE_MS = 30 * 60 * 1000;   // 30 min
  async function prewarmAuthToken(ownerUid, { force = false } = {}) {
    const user = fbAuth(ownerUid).currentUser;
    if (!user) return;
    if (!force && Date.now() - _lastTokenRefresh < TOKEN_THROTTLE_MS) return;
    try {
      await user.getIdToken(true);
      _lastTokenRefresh = Date.now();
    } catch (e) {
      console.warn("[Auth] token refresh failed:", e?.code, e?.message);
    }
  }
  // Read a Firestore collection on a friend's account. The caller is expected
  // to have called prewarmAuthToken() once before opening the friend view.
  // If a read still fails with permission-denied, we force a hard refresh
  // and retry once as a belt-and-braces safety net.
  async function readFriendCollectionWithRetry(ownerUid, friendUid, collection) {
    const ref = fbDb(ownerUid).collection("users").doc(friendUid).collection(collection);
    try {
      return await ref.get();
    } catch (e) {
      if (e?.code !== "permission-denied") throw e;
      console.log(`[FriendView] permission-denied on ${collection}, force-refreshing token and retrying…`);
      await prewarmAuthToken(ownerUid, { force: true });
      return await ref.get();
    }
  }

  async function switchToFriendView(friendUid, friendName, avatarColor) {
    closeProfilesModal(); closeFriends();
    _clearSearchFilters();
    const ownerUid = state.activeAccountId;  // capture so async errors land on the right account
    // ── Tear down ALL live subscriptions on the OWNER's data BEFORE mutating
    // state. If we don't, a buffered onSnapshot can fire mid-switch and write
    // the owner's inventory back into state.* / re-render the owner's racks,
    // leaving the previous user's content visible while we wait for the
    // friend's read to complete. (The onSnapshot callbacks also have a
    // `state.friendView` guard as defence-in-depth — see subscribeInventory.)
    unsubscribeInventory();
    unsubscribeRacks();
    // Look up the friend's photoURL from state.friends (already populated
    // by loadFriendsList from userProfiles). Falls through to null →
    // friend banner renders the colour-circle + initials fallback.
    const friendPhoto = state.friends?.find(f => f.uid === friendUid)?.photoURL || null;
    state.friendView = { uid: friendUid, displayName: friendName, avatarColor, photoURL: friendPhoto, error: null };
    state.inventory = null; state.rows = [];
    state.racks = [];
    state.invLoading = true;
    renderFriendBanner();
    renderStats(); renderInventory();
    // Pre-warm the auth token ONCE on entering a friend view (throttled to
    // 30 min between actual refreshes). Avoids the "permission-denied → retry
    // succeeds" flash when the local ID token is close to expiry.
    await prewarmAuthToken(ownerUid);
    try {
      console.log(`[FriendView] reading users/${friendUid}/inventory as ${ownerUid}`);
      const snap = await readFriendCollectionWithRetry(ownerUid, friendUid, "inventory");
      console.log(`[FriendView] received ${snap.docs.length} docs`);
      const raw = {};
      snap.forEach(doc => { raw[doc.id] = doc.data(); });
      state.inventory = raw;
      state.rows = snap.docs.map(doc => normalizeRow(doc.id, doc.data()));
      await preCacheImages(state.rows);
      // Guard: user might have switched away during the await
      if (state.friendView?.uid !== friendUid) return;
      // Read the friend's racks (one-shot — no live subscription needed,
      // read-only view).  If permissions deny, we silently fall back to an
      // empty rack list — the Storage tab will just show "no racks yet".
      try {
        const racksSnap = await readFriendCollectionWithRetry(ownerUid, friendUid, "racks");
        if (state.friendView?.uid !== friendUid) return;
        const racks = racksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        racks.sort((a, b) => {
          const oa = a.order ?? 999, ob = b.order ?? 999;
          if (oa !== ob) return oa - ob;
          const ta = a.createdAt?.seconds || 0;
          const tb = b.createdAt?.seconds || 0;
          return ta - tb;
        });
        state.racks = racks;
        console.log(`[FriendView] received ${racks.length} rack(s)`);
      } catch (re) {
        console.warn("[FriendView] racks read failed:", re.code, re.message);
        state.racks = [];
      }
      state.invLoading = false;
      sortStateRows(); renderStats(); renderInventory();
    } catch (e) {
      console.error("[FriendView] read failed:", e.code, e.message, e);
      if (state.friendView?.uid !== friendUid) return;
      state.invLoading = false;
      state.inventory = {}; state.rows = [];
      // Surface the error in the banner + empty state
      state.friendView.error = e.code === "permission-denied"
        ? t("friendInvPermDenied")
        : (e.message || t("networkError"));
      renderFriendBanner();
      renderStats(); renderInventory();
    }
  }

  function switchBackToOwnView() {
    if (!state.friendView) return;
    _clearSearchFilters();
    state.friendView = null;
    state.inventory = null; state.rows = [];
    state.racks = [];                                   // wipe the friend's racks
    renderFriendBanner();
    // Clear the visible artefacts of the friend's view IMMEDIATELY (stats,
    // table/grid/rack rendering, detail panel). Without this, the friend's
    // numbers would linger in the header KPI cards and their racks would
    // remain rendered until the first own-snapshot arrives a few hundred
    // milliseconds later — exactly the "previous user's data still visible"
    // glitch we want to avoid.
    const uid = state.activeAccountId;
    if (uid) state.invLoading = true;
    renderStats();
    renderInventory();
    if (uid) {
      subscribeInventory(uid);
      subscribeRacks(uid);                              // re-attach own racks live-sync
    }
  }

  // Show public key and toggle in settings panel
  function renderFriendsSection() {
    const keyEl = $("stgPublicKey");
    if (keyEl) keyEl.textContent = state.publicKey || "—";
    const toggle = $("stgPublicToggle");
    if (toggle) toggle.checked = state.isPublic;
  }

  // Incoming friend request modal
  let _pendingRequest = null;
  const _requestQueue  = [];

  function showFriendRequestModal(uid, data) {
    _requestQueue.push({ uid, data });
    if (_requestQueue.length === 1) _showNextRequest();
  }

  function _showNextRequest() {
    if (!_requestQueue.length) return;
    _pendingRequest = _requestQueue[0];
    const { uid, data } = _pendingRequest;
    const initials = (data.displayName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    const color = friendColorFallback(uid);
    $("frqAvatar").textContent = initials;
    $("frqAvatar").style.background = color;
    $("frqAvatar").style.color = readableTextOn(color);
    $("frqName").textContent = data.displayName || uid;
    $("friendRequestOverlay").classList.add("open");
  }

  function _closeRequestModal() {
    $("friendRequestOverlay").classList.remove("open");
    _requestQueue.shift();
    setTimeout(_showNextRequest, 300);
  }

  $("frqAccept").addEventListener("click", async () => {
    if (!_pendingRequest) return;
    await acceptFriendRequest(_pendingRequest.uid, _pendingRequest.data.displayName);
    renderFriendsList();
    _closeRequestModal();
  });
  $("frqRefuse").addEventListener("click", async () => {
    if (!_pendingRequest) return;
    await refuseFriendRequest(_pendingRequest.uid);
    _closeRequestModal();
  });
  $("frqBlock").addEventListener("click", async () => {
    if (!_pendingRequest) return;
    await blockUser(_pendingRequest.uid, _pendingRequest.data.displayName);
    _closeRequestModal();
  });

  // Add friend modal — split-field XXX-XXX
  const ADF_CHARS = /[^A-Z0-9]/g;

  function adfValue() {
    return ($("adfA").value + "-" + $("adfB").value).toUpperCase();
  }

  function openAddFriendModal() {
    $("adfA").value = "";
    $("adfB").value = "";
    $("adfResult").textContent = "";
    $("adfPreview").classList.add("hidden");
    $("adfSend").disabled = true;
    $("addFriendOverlay").classList.add("open");
    setTimeout(() => $("adfA").focus(), 80);
  }
  function closeAddFriendModal() { $("addFriendOverlay").classList.remove("open"); }

  $("addFriendClose").addEventListener("click", closeAddFriendModal);
  $("adfCancel").addEventListener("click", closeAddFriendModal);

  let _adfDebounce = null;
  let _adfFoundUid = null;
  let _adfFoundName = null;

  function _adfChanged() {
    const val = adfValue();
    $("adfPreview").classList.add("hidden");
    $("adfSend").disabled = true;
    $("adfResult").textContent = "";
    _adfFoundUid = null;
    clearTimeout(_adfDebounce);
    if ($("adfA").value.length < 3 || $("adfB").value.length < 3) return;
    $("adfResult").textContent = "🔍 " + t("friendSearching");
    _adfDebounce = setTimeout(async () => {
      try {
        // O(1) lookup in publicKeys/{key}
        const keySnap = await fbDb().collection("publicKeys").doc(val).get();
        if (!keySnap.exists) { $("adfResult").textContent = "⚠ " + t("friendNotFound"); return; }
        const targetUid = keySnap.data().uid;
        if (targetUid === fbAuth().currentUser?.uid) { $("adfResult").textContent = "⚠ " + t("friendSelf"); return; }
        const profileSnap = await fbDb().collection("userProfiles").doc(targetUid).get();
        const p = profileSnap.exists ? profileSnap.data() : {};
        _adfFoundUid = targetUid; _adfFoundName = p.displayName;
        const initials = (p.displayName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
        const color = profileColor(p) || friendColorFallback(targetUid);
        $("adfPreviewAvatar").textContent = initials;
        $("adfPreviewAvatar").style.background = color;
        $("adfPreviewAvatar").style.color = readableTextOn(color);
        $("adfPreviewName").textContent = p.displayName || val;
        $("adfPreview").classList.remove("hidden");
        $("adfResult").textContent = "";
        $("adfResult").className = "adf-result";
        $("adfSend").disabled = false;
      } catch (e) {
        $("adfResult").textContent = "⚠ " + t("networkError");
        $("adfResult").className = "adf-result adf-result--error";
      }
    }, 500);
  }

  // Sanitise + auto-advance on adfA
  $("adfA").addEventListener("input", () => {
    $("adfA").value = $("adfA").value.toUpperCase().replace(ADF_CHARS, "");
    if ($("adfA").value.length === 3) $("adfB").focus();
    _adfChanged();
  });

  // Handle paste of full key "XXX-XXX" into adfA
  $("adfA").addEventListener("paste", e => {
    e.preventDefault();
    const raw = (e.clipboardData || window.clipboardData).getData("text").trim().toUpperCase();
    const parts = raw.replace(ADF_CHARS.source.replace("[^", "["), "").match(/^([A-Z0-9]{3})[^A-Z0-9]?([A-Z0-9]{3})$/);
    if (parts) {
      $("adfA").value = parts[1]; $("adfB").value = parts[2];
      $("adfB").focus(); _adfChanged();
    }
  });

  // Sanitise adfB; backspace when empty → go back to adfA
  $("adfB").addEventListener("input", () => {
    $("adfB").value = $("adfB").value.toUpperCase().replace(ADF_CHARS, "");
    _adfChanged();
  });
  $("adfB").addEventListener("keydown", e => {
    if (e.key === "Backspace" && $("adfB").value === "") $("adfA").focus();
    if (e.key === "Escape") closeAddFriendModal();
  });
  $("adfA").addEventListener("keydown", e => { if (e.key === "Escape") closeAddFriendModal(); });

  $("adfSend").addEventListener("click", async () => {
    if (!_adfFoundUid) return;
    $("adfSend").disabled = true;
    try {
      await sendFriendRequest(adfValue());
      $("adfResult").textContent = "✓ " + t("friendRequestSent");
      $("adfResult").className = "adf-result adf-result--success";
      $("adfPreview").classList.add("hidden");
      setTimeout(closeAddFriendModal, 1500);
    } catch (e) {
      console.warn("[sendFriendRequest]", e.code, e.message);
      // Firestore rejects when the target has blocked us OR isPublic check etc.
      // Most common case: blacklist → permission-denied. Show a clear, friendly message.
      const msg = e.code === "permission-denied"
        ? t("friendNotSharing")
        : t("networkError");
      $("adfResult").textContent = "⚠ " + msg;
      $("adfResult").className = "adf-result adf-result--error";
      $("adfSend").disabled = false;
    }
  });

  // Settings panel — friends section wiring
  $("btnAddFriend").addEventListener("click", openAddFriendModal);

  // Live search filter
  $("fpSearch")?.addEventListener("input", () => renderFriendsList());

  $("btnCopyPublicKey").addEventListener("click", () => {
    if (!state.publicKey) return;
    navigator.clipboard.writeText(state.publicKey).then(() => {
      const btn = $("btnCopyPublicKey");
      btn.classList.add("fp-hero-btn--copied");
      setTimeout(() => btn.classList.remove("fp-hero-btn--copied"), 1500);
    });
  });

  $("btnRegenPublicKey").addEventListener("click", async () => {
    await regeneratePublicKey();
  });

  $("stgPublicToggle").addEventListener("change", async () => {
    const isPublic = $("stgPublicToggle").checked;
    state.isPublic = isPublic;
    const user = fbAuth().currentUser;
    if (!user) return;
    await fbDb().collection("users").doc(user.uid).set({ isPublic }, { merge: true });
    await syncUserProfile(user.uid, { isPublic });
  });

  /* ── Display-name setup modal ─────────────────────────────────────────── */
  function openDisplayNameSetup() {
    $("dnsInput").value = "";
    $("dnsResult").textContent = "";
    $("displayNameSetupOverlay").classList.add("open");
    setTimeout(() => $("dnsInput").focus(), 80);
  }
  function closeDisplayNameSetup() {
    $("displayNameSetupOverlay").classList.remove("open");
  }

  $("dnsSave").addEventListener("click", async () => {
    const name = $("dnsInput").value.trim();
    if (name.length < 1) { $("dnsResult").textContent = "⚠ " + t("setupNamePlaceholder"); return; }
    $("dnsSave").disabled = true;
    $("dnsResult").textContent = "";
    try {
      const user = fbAuth().currentUser;
      if (!user) throw new Error("not signed in");
      await fbDb(user.uid).collection("users").doc(user.uid).set({ displayName: name }, { merge: true });
      syncUserProfile(user.uid, { displayName: name }); // make visible to friends immediately
      // Update local state
      const accounts = getAccounts();
      const acc = accounts.find(a => a.id === user.uid);
      if (acc) { acc.displayName = name; saveAccounts(accounts); }
      state.displayName       = name;
      $("sbName").textContent = name;
      // Centralised pipeline — gradient + initials + photo all atomic.
      paintAvatar($("sbAvatar"), acc);
      renderFriendBanner();
      renderAccountDropdown();
      closeDisplayNameSetup();
    } catch (err) {
      $("dnsResult").textContent = "⚠ " + (err.message || t("networkError"));
    } finally {
      $("dnsSave").disabled = false;
    }
  });

  $("dnsInput").addEventListener("keydown", e => {
    if (e.key === "Enter") $("dnsSave").click();
  });

  /* ── Friends system ───────────────────────────────────────────────────── */

  function subscribeFriendRequests(uid) {
    unsubscribeFriendRequests();
    state.unsubFriendRequests = fbDb()
      .collection("users").doc(uid)
      .collection("friendRequests")
      .onSnapshot(snap => {
        state.friendRequests = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        renderFriendRequestBadge();
        // Show modal for each new incoming request
        snap.docChanges().forEach(change => {
          if (change.type === "added") showFriendRequestModal(change.doc.id, change.doc.data());
        });
      }, err => console.warn("[friendRequests]", err.message));
  }

  function unsubscribeFriendRequests() {
    if (state.unsubFriendRequests) { state.unsubFriendRequests(); state.unsubFriendRequests = null; }
  }

  function renderFriendRequestBadge() {
    const count = state.friendRequests.length;
    const badge = $("friendsBadge");
    if (!badge) return;
    badge.textContent = count;
    badge.classList.toggle("hidden", count === 0);
  }

  // Accept a friend request → bidirectional add (rules verify only friendship presence,
  // no key check — see firestore.rules /inventory).
  async function acceptFriendRequest(requesterUid, displayName) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const db    = fbDb(user.uid); // named instance — stable across async operations
    const batch = db.batch();
    const myRef    = db.collection("users").doc(user.uid);
    const theirRef = db.collection("users").doc(requesterUid);
    // Add requester to MY friends list
    batch.set(myRef.collection("friends").doc(requesterUid), {
      displayName: displayName || requesterUid,
      addedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    // Add ME to THEIR friends list (allowed because I have a friendRequest from them)
    batch.set(theirRef.collection("friends").doc(user.uid), {
      displayName: state.displayName || user.email,
      addedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    // Remove the pending request
    batch.delete(myRef.collection("friendRequests").doc(requesterUid));
    await batch.commit();
    state.friends = [...state.friends.filter(f => f.uid !== requesterUid),
      { uid: requesterUid, displayName, addedAt: Date.now() }];
  }

  // Refuse a friend request (just delete it — they can request again)
  async function refuseFriendRequest(requesterUid) {
    const user = fbAuth().currentUser;
    if (!user) return;
    await fbDb().collection("users").doc(user.uid)
      .collection("friendRequests").doc(requesterUid).delete();
  }

  // Block → blacklist + delete request
  async function blockUser(requesterUid, displayName) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const batch = fbDb().batch();
    const myRef = fbDb().collection("users").doc(user.uid);
    batch.set(myRef.collection("blacklist").doc(requesterUid), {
      displayName: displayName || requesterUid,
      blockedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.delete(myRef.collection("friendRequests").doc(requesterUid));
    await batch.commit();
    // Update local state + UI immediately
    state.blacklist = [...state.blacklist.filter(b => b.uid !== requesterUid),
      { uid: requesterUid, displayName: displayName || requesterUid, blockedAt: Date.now() }];
    renderBlacklist();
  }

  // Remove a friend — deletes from both sides (symmetric)
  async function removeFriend(friendUid) {
    const user = fbAuth().currentUser;
    if (!user) return;
    const batch = fbDb().batch();
    batch.delete(fbDb().collection("users").doc(user.uid).collection("friends").doc(friendUid));
    batch.delete(fbDb().collection("users").doc(friendUid).collection("friends").doc(user.uid));
    await batch.commit();
    state.friends = state.friends.filter(f => f.uid !== friendUid);
    renderFriendsList();
  }

  // Load blacklisted users from Firestore
  async function loadBlacklist() {
    const user = fbAuth().currentUser;
    if (!user) return;
    const uid = user.uid;
    try {
      const snap = await fbDb(uid).collection("users").doc(uid).collection("blacklist").get();
      if (uid !== state.activeAccountId) return;
      state.blacklist = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      renderBlacklist();
    } catch (e) { console.warn("[blacklist]", e.message); }
  }

  // Remove a user from the blacklist (allows them to send friend requests again)
  async function unblockUser(blockedUid) {
    const user = fbAuth().currentUser;
    if (!user) return;
    await fbDb().collection("users").doc(user.uid)
      .collection("blacklist").doc(blockedUid).delete();
    state.blacklist = state.blacklist.filter(b => b.uid !== blockedUid);
    renderBlacklist();
  }

  // Render the blacklist section in the Friends panel
  function renderBlacklist() {
    const list = $("fpBlacklistList");
    const count = $("fpBlacklistCount");
    const block = $("fpBlacklistBlock");
    if (!list || !block) return;
    if (count) count.textContent = state.blacklist.length;
    // Hide entire section when empty
    if (!state.blacklist.length) { block.classList.add("hidden"); list.innerHTML = ""; return; }
    block.classList.remove("hidden");
    list.innerHTML = state.blacklist.map(b => {
      const initials = (b.displayName || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
      const color = friendColorFallback(b.uid);
      const fg = readableTextOn(color);
      const date = b.blockedAt ? timeAgo(b.blockedAt.seconds ? b.blockedAt.seconds * 1000 : b.blockedAt) : "";
      return `<div class="fp-friend fp-blocked" data-uid="${esc(b.uid)}">
        <div class="fp-friend-avatar" style="background:${color};color:${fg}">${initials}</div>
        <div class="fp-friend-main">
          <div class="fp-friend-name">${esc(b.displayName || b.uid)}</div>
          <div class="fp-friend-date">${date ? t("blockedOn", { date }) : ""}</div>
        </div>
        <button class="fp-friend-btn fp-friend-unblock" data-action="unblock" title="${t("unblockBtn")}">
          ${t("unblockBtn")}
        </button>
      </div>`;
    }).join("");
    list.querySelectorAll(".fp-friend-unblock").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const row = btn.closest(".fp-friend");
        btn.disabled = true;
        try { await unblockUser(row.dataset.uid); }
        catch (err) { console.error("[unblock]", err); btn.disabled = false; }
      });
    });
  }

  // Claim a unique publicKey via O(1) document lookup + transaction
  // Deletes the previous key from publicKeys if provided
  async function claimPublicKey(uid, oldKey) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generatePublicKey();
      const keyRef = fbDb().collection("publicKeys").doc(candidate);
      try {
        await fbDb().runTransaction(async tx => {
          const snap = await tx.get(keyRef);
          if (snap.exists) throw Object.assign(new Error("taken"), { code: "taken" });
          tx.set(keyRef, { uid, claimedAt: firebase.firestore.FieldValue.serverTimestamp() });
        });
        // Transaction succeeded — release old key if any
        if (oldKey) {
          try { await fbDb().collection("publicKeys").doc(oldKey).delete(); } catch (_) {}
        }
        return candidate;
      } catch (e) {
        if (e.code !== "taken") throw e;
        // collision — try a new candidate
      }
    }
    throw new Error("Could not generate a unique public key after 10 attempts");
  }

  // Regenerate publicKey and persist everywhere
  async function regeneratePublicKey() {
    const user = fbAuth().currentUser;
    if (!user) return;
    // Show loading state
    const el  = $("stgPublicKey");
    const btn = $("btnRegenPublicKey");
    if (el)  { el.textContent = ""; el.classList.add("pkey-loading"); }
    if (btn) btn.disabled = true;
    try {
      const newKey = await claimPublicKey(user.uid, state.publicKey);
      await fbDb().collection("users").doc(user.uid).update({ publicKey: newKey });
      await syncUserProfile(user.uid, { publicKey: newKey });
      state.publicKey = newKey;
      if (el) el.textContent = newKey;
    } finally {
      if (el)  el.classList.remove("pkey-loading");
      if (btn) btn.disabled = false;
    }
  }

  // Send a friend request to another user (by their publicKey)
  async function sendFriendRequest(targetPublicKey) {
    const user = fbAuth().currentUser;
    if (!user) return null;
    const db  = fbDb(user.uid); // named instance — stable across async operations
    const key = targetPublicKey.trim().toUpperCase();
    // O(1) lookup in publicKeys/{key} — no query, no index needed
    const keySnap = await db.collection("publicKeys").doc(key).get();
    if (!keySnap.exists) return { error: "notFound" };
    const targetUid = keySnap.data().uid;
    if (targetUid === user.uid) return { error: "self" };
    // Fetch display name from userProfiles
    const profileSnap = await db.collection("userProfiles").doc(targetUid).get();
    const displayName = profileSnap.exists ? profileSnap.data().displayName : targetUid;
    // Write request to their friendRequests subcollection.
    // No key needed — Firestore rules now verify friendship presence only (not key match).
    await db.collection("users").doc(targetUid)
      .collection("friendRequests").doc(user.uid).set({
        displayName: state.displayName || user.email,
        requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    return { ok: true, displayName, uid: targetUid };
  }

  /* ── Key helpers ──────────────────────────────────────────────────────── */
  function generatePublicKey() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let a = "", b = "";
    for (let i = 0; i < 3; i++) a += chars[Math.floor(Math.random() * chars.length)];
    for (let i = 0; i < 3; i++) b += chars[Math.floor(Math.random() * chars.length)];
    return `${a}-${b}`; // e.g. "4X7-K3M"
  }
  function generatePrivateKey() {
    return Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Write safe public fields to userProfiles/{uid} (readable by all authenticated users)
  async function syncUserProfile(uid, fields) {
    try {
      // Use fbDb(uid) — named instance — to avoid writing to the wrong project
      // if the active account changes while this async call is in flight.
      await fbDb(uid).collection("userProfiles").doc(uid).set(fields, { merge: true });
    } catch (e) { console.warn("[userProfiles] write:", e.message); }
  }

  // ══════════════════════════════════════════════════════════════════
  //   Custom avatar upload pipeline
  // ══════════════════════════════════════════════════════════════════
  // Storage path:  avatars/{uid}            ← predictable, single file
  // Firestore idx: userProfiles/{uid}.photoURL  ← URL with rotating token
  //
  // Full flow on upload:
  //   1. User picks a file (any image up to ~50 MB on disk).
  //   2. Decoded to an ImageBitmap (off-main-thread).
  //   3. Drawn cover-fit into a 512×512 canvas (square crop).
  //   4. Alpha channel detected by sampling edge pixels; if any are
  //      non-opaque → encode PNG, else JPEG quality 0.85.
  //   5. Blob uploaded to Storage with the right Content-Type. The
  //      200 KB rule on the Storage side is a safety net — at 512×512
  //      we land well under.
  //   6. getDownloadURL() returns a URL with a fresh access token.
  //   7. URL written to userProfiles/{uid}.photoURL (the friend-visible
  //      mirror) AND to state.photoURL for immediate render.
  //   8. applyAvatarStyle re-runs → `<img>` overlay appears over the
  //      colour circle.
  //
  // Errors are surfaced via a single throw — caller decides how to
  // toast/inline-message them. Cancellation (user closes picker) is a
  // no-op silent return, not an error.
  const AVATAR_TARGET_PX = 512;
  const AVATAR_MAX_BYTES = 500 * 1024;  // server-side rule limit (storage.rules)

  // Pick a file via a transient `<input type=file>`. Returns null if the
  // user cancels. Restricted to image/* MIME up front (the OS native
  // picker greys out non-images).
  function _pickAvatarFile() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";
      input.style.display = "none";
      document.body.appendChild(input);
      let resolved = false;
      const cleanup = () => { resolved = true; input.remove(); };

      // Primary path: native `change` (file picked) / `cancel` (user
      // dismissed). `cancel` is the HTML-spec-defined event for the
      // dismiss case — supported in Chromium 113+. Electron 41 uses
      // Chromium 134, so both events fire reliably across macOS,
      // Windows 10, Windows 11 and Linux. This is what fixes the Win10
      // race observed when the legacy focus/grace-timer approach was
      // used: on Win10 the OS could return `focus` to the renderer
      // BEFORE `change` arrived (slow I/O scheduler), causing the
      // 300 ms grace to expire and the picker to silently resolve
      // null — the cropper would never open.
      input.addEventListener("change", () => {
        if (resolved) return;
        cleanup();
        resolve(input.files?.[0] || null);
      });
      input.addEventListener("cancel", () => {
        if (resolved) return;
        cleanup();
        resolve(null);
      });

      // Belt-and-braces fallback for environments where neither
      // `change` nor `cancel` fires (unknown Electron build / WebView
      // shim). The focus listener arms 200 ms AFTER `input.click()` —
      // by then the native dialog has stolen focus, so the next
      // `focus` event truly means "dialog closed". 800 ms grace is
      // generous enough for the slowest Win10 I/O scheduler to deliver
      // `change` before this fires. macOS and Win11 always hit the
      // `change`/`cancel` path first, so this fallback is invisible
      // to them.
      setTimeout(() => {
        if (resolved) return;
        window.addEventListener("focus", () => {
          setTimeout(() => { if (!resolved) { cleanup(); resolve(null); } }, 800);
        }, { once: true });
      }, 200);

      input.click();
    });
  }

  // Decode a File/Blob to an ImageBitmap. Falls back to HTMLImageElement
  // for environments without createImageBitmap (Electron < 25 etc.).
  async function _decodeImageBlob(file) {
    if (typeof createImageBitmap === "function") {
      try { return await createImageBitmap(file); } catch (_) { /* fall through */ }
    }
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = e  => { URL.revokeObjectURL(url); rej(new Error("decode-failed")); };
      img.src = url;
    });
  }

  // Detect transparency by sampling the 4 corners + 4 edge midpoints of
  // a freshly-drawn canvas. A non-255 alpha anywhere → treat as
  // alpha-bearing → encode PNG. Otherwise JPEG (5× smaller for photos).
  function _hasAlpha(ctx, size) {
    const pts = [
      [0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1],
      [size >> 1, 0], [size >> 1, size - 1], [0, size >> 1], [size - 1, size >> 1],
    ];
    for (const [x, y] of pts) {
      if (ctx.getImageData(x, y, 1, 1).data[3] < 255) return true;
    }
    return false;
  }

  // Resize + crop cover-fit to AVATAR_TARGET_PX square, encode JPEG or
  // PNG depending on alpha presence. Returns { blob, contentType }.
  async function _resizeAvatarToBlob(bitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = AVATAR_TARGET_PX;
    const ctx = canvas.getContext("2d");
    // Cover-fit: scale so the smaller dimension fills the canvas, crop
    // the larger one centered. Mirrors `object-fit: cover` in CSS.
    const srcW = bitmap.width, srcH = bitmap.height;
    const scale = AVATAR_TARGET_PX / Math.min(srcW, srcH);
    const dw = srcW * scale, dh = srcH * scale;
    const dx = (AVATAR_TARGET_PX - dw) / 2;
    const dy = (AVATAR_TARGET_PX - dh) / 2;
    // Browser does its own resampling; for 512×512 the difference between
    // imageSmoothingQuality 'low'/'high' is invisible but 'medium' is the
    // default and fine.
    ctx.drawImage(bitmap, dx, dy, dw, dh);
    const useAlpha = _hasAlpha(ctx, AVATAR_TARGET_PX);
    return new Promise(resolve => {
      const type = useAlpha ? "image/png" : "image/jpeg";
      const quality = useAlpha ? undefined : 0.85;
      canvas.toBlob(blob => resolve({ blob, contentType: type }), type, quality);
    });
  }

  // Top-level entry point — pick + resize + upload + write. Resolves to
  // the new photoURL (already written to Firestore + state). Throws on
  // any failure other than user-cancel (which returns null).
  async function uploadCustomAvatar() {
    const user = fbAuth().currentUser;
    if (!user) throw new Error("not-signed-in");

    const file = await _pickAvatarFile();
    if (!file) return null;  // user cancelled — silent

    const bitmap = await _decodeImageBlob(file);
    const { blob, contentType } = await _resizeAvatarToBlob(bitmap);

    // Safety net — should never trigger after 512×512 resize, but the
    // server-side rule would reject it anyway. Friendlier to fail here.
    if (blob.size > AVATAR_MAX_BYTES) {
      throw new Error("too-large");
    }

    // Upload — Storage path is `avatars/{uid}` (no extension; the
    // Content-Type metadata carries the format). Overwrites any
    // previous file at that path, generating a fresh access token.
    const ref = fbStorage(user.uid).ref().child(`avatars/${user.uid}`);
    const snap = await ref.put(blob, { contentType });
    const url = await snap.ref.getDownloadURL();

    // Mirror in Firestore so friends see it without a Storage probe.
    await syncUserProfile(user.uid, { photoURL: url });

    // Reflect locally + re-render the sidebar avatar.
    state.photoURL = url;
    applyAvatarStyle(activeAccount());
    renderFriendBanner();   // header chip variant
    renderAccountDropdown();
    return url;
  }

  // Remove the custom avatar — deletes the Storage blob AND clears the
  // photoURL field. Idempotent (no error if either is already absent).
  async function removeCustomAvatar() {
    const user = fbAuth().currentUser;
    if (!user) throw new Error("not-signed-in");

    // Delete in two independent try/catches so partial failures still
    // leave the system in a consistent state. Worst case: a stale blob
    // remains in Storage with no Firestore reference — harmless.
    try {
      await fbStorage(user.uid).ref().child(`avatars/${user.uid}`).delete();
    } catch (e) {
      // object-not-found is the common case (user never uploaded) —
      // ignore. Other errors are non-fatal too; the Firestore clear
      // below is what matters for the UI fallback to kick in.
      if (e?.code !== "storage/object-not-found") {
        console.warn("[avatar.remove] storage delete:", e.message);
      }
    }
    await syncUserProfile(user.uid, { photoURL: firebase.firestore.FieldValue.delete() });

    state.photoURL = null;
    applyAvatarStyle(activeAccount());
    renderFriendBanner();
    renderAccountDropdown();
  }

  // ── Discord-style cropper ────────────────────────────────────────────
  // Replaces the original "auto-resize to 512" path so the user can zoom,
  // rotate (90°) and drag the source image inside a circular mask before
  // committing. Returns a Promise that resolves with { blob, contentType }
  // on Apply, or null on Cancel / Escape.
  //
  // Geometry:
  //   - The display canvas is 280 px CSS, but devSize = 280 × DPR for a
  //     crisp render on Retina.
  //   - "base scale" is whatever makes the source's smaller dimension
  //     fill devSize at zoom = 1 (cover-fit).
  //   - The user-facing zoom slider multiplies on top of that (1× → 3×).
  //   - Rotation is around the canvas centre; pan is in device pixels.
  //   - Pan is clamped so the rotated+scaled image always covers the
  //     circle (no transparent gap edges peeking in).
  function openAvatarCropper(bitmap) {
    return new Promise(resolve => {
      const overlay = $("avatarCropOverlay");
      const canvas  = $("avatarCropCanvas");
      const ctx     = canvas.getContext("2d");
      const zoomEl  = $("avatarCropZoom");
      const CSS_SIZE = 280;
      const DPR = window.devicePixelRatio || 1;
      const devSize = Math.round(CSS_SIZE * DPR);
      canvas.width = devSize; canvas.height = devSize;
      canvas.style.width = canvas.style.height = CSS_SIZE + "px";

      let zoom = 1, rotation = 0, panX = 0, panY = 0;
      let dragStart = null;

      const minDim   = Math.min(bitmap.width, bitmap.height);
      const baseScale = devSize / minDim;  // zoom 1 = cover-fit

      // Pan constraint: when the rotated+scaled image is laid down centred
      // at (devSize/2 + pan), make sure no edge of the image enters the
      // circle of radius devSize/2. With 90° rotations, w/h swap.
      function clampPan() {
        const rot = ((rotation % 360) + 360) % 360;
        const isSide = (rot === 90 || rot === 270);
        const imgW = (isSide ? bitmap.height : bitmap.width) * baseScale * zoom;
        const imgH = (isSide ? bitmap.width  : bitmap.height) * baseScale * zoom;
        const maxX = Math.max(0, (imgW - devSize) / 2);
        const maxY = Math.max(0, (imgH - devSize) / 2);
        if (panX >  maxX) panX =  maxX;
        if (panX < -maxX) panX = -maxX;
        if (panY >  maxY) panY =  maxY;
        if (panY < -maxY) panY = -maxY;
      }

      function render() {
        ctx.fillStyle = "#1a1a1a";  // backdrop visible only at zoom < 1
        ctx.fillRect(0, 0, devSize, devSize);
        ctx.save();
        ctx.translate(devSize / 2 + panX, devSize / 2 + panY);
        ctx.rotate(rotation * Math.PI / 180);
        const s = baseScale * zoom;
        ctx.scale(s, s);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        ctx.restore();
      }

      zoomEl.value = "1";
      const onZoom = () => { zoom = parseFloat(zoomEl.value); clampPan(); render(); };
      zoomEl.addEventListener("input", onZoom);

      const onRotate = () => { rotation = (rotation + 90) % 360; clampPan(); render(); };
      $("btnAvatarCropRotate").addEventListener("click", onRotate);

      const onReset = () => {
        zoom = 1; rotation = 0; panX = 0; panY = 0;
        zoomEl.value = "1"; render();
      };
      $("btnAvatarCropReset").addEventListener("click", onReset);

      // Drag-to-pan on the canvas. Pointer events handle mouse + touch.
      const onPointerDown = e => {
        dragStart = { x: e.clientX, y: e.clientY, panX, panY };
        canvas.setPointerCapture?.(e.pointerId);
      };
      const onPointerMove = e => {
        if (!dragStart) return;
        panX = dragStart.panX + (e.clientX - dragStart.x) * DPR;
        panY = dragStart.panY + (e.clientY - dragStart.y) * DPR;
        clampPan(); render();
      };
      const onPointerUp = e => {
        dragStart = null;
        canvas.releasePointerCapture?.(e.pointerId);
      };
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup",   onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);

      function cleanup() {
        overlay.classList.remove("open");
        zoomEl.removeEventListener("input", onZoom);
        $("btnAvatarCropRotate").removeEventListener("click", onRotate);
        $("btnAvatarCropReset").removeEventListener("click", onReset);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup",   onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
      }

      const onCancel = () => { cleanup(); resolve(null); };
      const onClose  = () => onCancel();
      $("btnAvatarCropCancel").onclick = onCancel;
      $("avatarCropClose").onclick     = onClose;
      const escHandler = e => {
        if (e.key === "Escape" && overlay.classList.contains("open")) {
          document.removeEventListener("keydown", escHandler);
          onCancel();
        }
      };
      document.addEventListener("keydown", escHandler);

      $("btnAvatarCropApply").onclick = () => {
        // Auto-detect alpha in the SOURCE bitmap so we pick the right
        // encoder per case (Slack / WeChat / Discord all do equivalent
        // probing — saves ~6× on photos while preserving memoji
        // transparency):
        //   - Source has alpha (memoji / illustration on transparent
        //     bg) → PNG square. ~50-150 KB. Display still clips to a
        //     circle via CSS, but the transparent corners are honoured
        //     so the avatar circle's gradient bleeds through the empty
        //     areas (matches what you see in Slack/Discord on memojis).
        //   - Source is opaque (photo) → JPEG q0.85. ~30-50 KB.
        //     White backdrop fill is harmless safety against any
        //     rounding gap at the edge after rotation.
        //
        // Output is always SQUARE 512×512 — the circle look is purely
        // a CSS `border-radius: 50%` decision at render time, not
        // baked into the file. Smaller AND simpler.
        //
        // Probe is a tiny 32×32 redraw that samples 8 edge pixels via
        // `_hasAlpha` — cheap enough that we can run it every Apply.
        const probe = document.createElement("canvas");
        probe.width = probe.height = 32;
        const probeCtx = probe.getContext("2d");
        probeCtx.drawImage(bitmap, 0, 0, 32, 32);
        const sourceHasAlpha = _hasAlpha(probeCtx, 32);

        const TARGET = AVATAR_TARGET_PX;
        const exp = document.createElement("canvas");
        exp.width = exp.height = TARGET;
        const ec = exp.getContext("2d");
        if (!sourceHasAlpha) {
          // JPEG path — fill white so any sub-pixel gap at rotation
          // edges reads as the surface colour rather than black.
          ec.fillStyle = "#ffffff";
          ec.fillRect(0, 0, TARGET, TARGET);
        }
        // PNG path: leave canvas transparent so source alpha is honoured.

        ec.save();
        // Same transform chain as the preview, scaled from devSize → TARGET.
        const k = TARGET / devSize;
        ec.translate(TARGET / 2 + panX * k, TARGET / 2 + panY * k);
        ec.rotate(rotation * Math.PI / 180);
        const s = (TARGET / minDim) * zoom;
        ec.scale(s, s);
        ec.imageSmoothingQuality = "high";
        ec.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        ec.restore();

        const contentType = sourceHasAlpha ? "image/png" : "image/jpeg";
        const quality = sourceHasAlpha ? undefined : 0.85;
        exp.toBlob(blob => {
          document.removeEventListener("keydown", escHandler);
          cleanup();
          resolve({ blob, contentType });
        }, contentType, quality);
      };

      overlay.classList.add("open");
      render();
    });
  }

  // Used by the avatar-menu Change handler after the cropper resolves.
  // Identical to the upload tail of the old uploadCustomAvatar — keeps
  // the Storage + Firestore + UI sync side effects in one place.
  async function uploadCroppedAvatar(blob, contentType) {
    const user = fbAuth().currentUser;
    if (!user) throw new Error("not-signed-in");
    if (blob.size > AVATAR_MAX_BYTES) throw new Error("too-large");
    const ref = fbStorage(user.uid).ref().child(`avatars/${user.uid}`);
    const snap = await ref.put(blob, { contentType });
    const url = await snap.ref.getDownloadURL();
    await syncUserProfile(user.uid, { photoURL: url });
    state.photoURL = url;
    applyAvatarStyle(activeAccount());
    renderFriendBanner();
    renderAccountDropdown();
    return url;
  }

  // Local-first hydration of the user doc — applies the cached roles /
  // debug / keys / isPublic synchronously so the debug button and public
  // flag are correct on the FIRST frame. Authoritative refresh still comes
  // from syncUserDoc(); this only primes state from localStorage. No-op if
  // nothing cached yet (first ever login).
  function hydrateUserDocCache(uid) {
    const c = Cache.read("userdoc", uid);
    if (!c) return;
    state.isAdmin      = c.roles === "admin";
    state.debugEnabled = state.isAdmin && !!c.Debug;
    if (c.publicKey)  state.publicKey  = c.publicKey;
    if (c.privateKey) state.privateKey = c.privateKey;
    state.isPublic     = !!c.isPublic;
    try { applyDebugMode(); } catch {}
  }

  // ── Country / timezone derivation (offline, no IP geolocation) ──────────
  function currentTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
    catch (_) { return null; }
  }
  // Country = region subtag of the browser locale ("fr-FR" → "FR"); when the
  // locale carries no region (plain "fr"), fall back to the IANA timezone
  // ("Europe/Paris" → "FR"). Pure offline lookup, never an IP call.
  function deriveCountry(tz = currentTimezone()) {
    try {
      const loc = navigator.language || "";
      if (typeof Intl !== "undefined" && Intl.Locale) {
        const region = new Intl.Locale(loc).region;
        if (region) return region.toUpperCase();
      }
      const parts = loc.split("-");
      if (parts.length > 1 && parts[1]) return parts[1].toUpperCase();
    } catch (_) {}
    return tzToCountry(tz);
  }

  // ── Current-state telemetry snapshot (Studio-Manager-dedicated) ─────────
  // Written to users/{uid}/telemetry/studio AFTER the data subscriptions have
  // settled — see scheduleStudioStateRecord for the deferred trigger. Fields
  // here are overwritten each session (current state), distinct from the
  // lifetime accumulators (sessionsCount, versionsUsed…) written in syncUserDoc.
  let _studioStateRecordedUid = null;
  let _studioStateTimer = null;

  function scheduleStudioStateRecord() {
    const uid = state.activeAccountId;
    if (!uid) return;
    if (state.friendView) return;                 // never record while viewing a friend
    if (_studioStateRecordedUid === uid) return;  // once per account per session
    clearTimeout(_studioStateTimer);
    // 7 s debounce: each subscription snapshot (inventory, racks, printers,
    // scales) re-arms the timer, so it fires once everything has settled.
    _studioStateTimer = setTimeout(() => recordStudioState(uid), 7000);
  }

  async function recordStudioState(uid) {
    if (uid !== state.activeAccountId || state.friendView) return;
    if (_studioStateRecordedUid === uid) return;
    _studioStateRecordedUid = uid;  // claim early — avoids double-write if re-armed mid-flight
    try {
      const db  = fbDb(uid);
      const ref = db.collection("users").doc(uid).collection("telemetry").doc("studio");
      const FV  = firebase.firestore.FieldValue;

      // Current-state counts (overwritten each session).
      const activeSpools = deduplicateTwins(state.rows.slice()).filter(r => !r.deleted);
      const rackSlots    = (state.racks || []).reduce(
        (sum, r) => sum + (r.level || 0) * (r.position || 0), 0);

      const payload = {
        lang:           state.lang || null,
        country:        deriveCountry(),
        hasAvatar:      !!state.photoURL,
        accountsCount:  getAccounts().length,
        friendsCount:   (state.friends   || []).length,
        spoolsCount:    activeSpools.length,
        racksCount:     (state.racks     || []).length,
        rackSlotsTotal: rackSlots,
        scalesCount:    (state.scales    || []).length,
        printerCount:   (state.printers  || []).length,
      };

      // Phase 2 — onboarding funnel: stamp each milestone once (the first
      // session where the user reaches it), plus firstSeen. Read the doc to
      // know which stamps already exist; never overwrite an existing one.
      let existing = {};
      try { existing = (await ref.get()).data() || {}; } catch (_) {}
      if (!existing.firstSeen)                                 payload.firstSeen    = FV.serverTimestamp();
      if (payload.spoolsCount  > 0 && !existing.firstSpoolAt)   payload.firstSpoolAt   = FV.serverTimestamp();
      if (payload.racksCount   > 0 && !existing.firstRackAt)    payload.firstRackAt    = FV.serverTimestamp();
      if (payload.printerCount > 0 && !existing.firstPrinterAt) payload.firstPrinterAt = FV.serverTimestamp();
      if (payload.friendsCount > 0 && !existing.firstFriendAt)  payload.firstFriendAt  = FV.serverTimestamp();

      await ref.set(payload, { merge: true });
    } catch (e) {
      _studioStateRecordedUid = null;  // allow a retry on the next trigger
      console.warn("[telemetry] studio state write failed:", e.code || e.message);
    }
  }

  // ── Lifetime spool-lifecycle counters (telemetry/studio) ────────────────
  // Increment-only accumulators that trace a user's spool history over time,
  // each counting SPOOLS (a twin pair = 1, consistent with the deduped stat):
  //   cloudAddedTotal  — TigerCloud spools created (Add Product / duplicate)
  //   tagAddedTotal    — DIY physical tags that arrived already-written
  //                      (factory/mobile), counted on first scan
  //   plusAddedTotal   — TigerTag+ tags that arrived already-written
  //   cloudToTagTotal  — TigerCloud burned to a physical chip (_cemMigrate)
  //   cloudToPlusTotal — TigerCloud converted to TigerTag+ (_convertToPlus)
  //   tagToPlusTotal   — DIY TigerTag converted to TigerTag+ (_convertToPlus)
  // Fire-and-forget; never blocks the user action that triggered it.
  function bumpStudioCounters(deltas) {
    const uid = state.activeAccountId;
    if (!uid || state.friendView) return;
    const FV = firebase.firestore.FieldValue;
    const payload = {};
    for (const k in deltas) {
      if (deltas[k]) payload[k] = FV.increment(deltas[k]);
    }
    if (!Object.keys(payload).length) return;
    fbDb(uid).collection("users").doc(uid)
      .collection("telemetry").doc("studio")
      .set(payload, { merge: true })
      .catch(e => console.warn("[telemetry] counter bump failed:", e.code || e.message));
  }

  async function syncUserDoc(uid) {
    // Always use the named Firestore instance for this specific uid,
    // never fbDb() without parameter — that depends on state.activeAccountId
    // at promise-resolution time and can point to the wrong account.
    const db = fbDb(uid);
    try {
      // Force-server read on first sync to avoid showing the "Set display
      // name" prompt based on a stale empty cache (the user could have set
      // the name on another device but the local cache hasn't synced yet).
      // Falls back to cache automatically if offline.
      let snap;
      try {
        snap = await db.collection("users").doc(uid).get({ source: "server" });
      } catch (_) {
        // Offline / blocked → fall back to default (cache OR server)
        snap = await db.collection("users").doc(uid).get();
      }
      if (!snap.exists) return;
      // Guard: by the time the Firestore round-trip completes, the active account
      // may have changed. Only apply UI side-effects for the current active account.
      if (uid !== state.activeAccountId) return;
      const data = snap.data();

      // Admin + debug
      state.isAdmin      = data.roles === "admin";
      state.debugEnabled = state.isAdmin && !!data.Debug;
      applyDebugMode();

      // Generate publicKey + privateKey on first login if missing
      const keysUpdate = {};
      if (!data.publicKey)  keysUpdate.publicKey  = await claimPublicKey(uid, null);
      if (!data.privateKey) keysUpdate.privateKey = generatePrivateKey();
      if (Object.keys(keysUpdate).length) {
        await db.collection("users").doc(uid).set(keysUpdate, { merge: true });
        Object.assign(data, keysUpdate);
      }
      // Store keys + public flag in state for easy access
      state.publicKey  = data.publicKey;
      state.privateKey = data.privateKey;
      state.isPublic   = data.isPublic || false;

      // Mirror the minimal user-doc shape to the local-first cache so the
      // NEXT cold start can hydrate roles / debug / keys / isPublic before
      // the first paint (see hydrateUserDocCache).
      Cache.write("userdoc", uid, {
        roles:      data.roles || null,
        Debug:      !!data.Debug,
        publicKey:  data.publicKey || null,
        privateKey: data.privateKey || null,
        isPublic:   !!data.isPublic,
        displayName: data.displayName || null,
      });

      // Extra subnets — load from Firestore + wire the persister so every
      // brand scan modal reads/writes a single shared list (Snapmaker,
      // Creality, Elegoo, FlashForge). Migration from the 4 legacy
      // per-brand localStorage keys happens automatically on first run.
      try {
        const ExtraSubnets = await import("./printers/extra-subnets.js");
        ExtraSubnets.setInitialList(Array.isArray(data.scanExtraSubnets) ? data.scanExtraSubnets : []);
        ExtraSubnets.setPersister(async (list) => {
          try {
            await db.collection("users").doc(uid).set(
              { scanExtraSubnets: list }, { merge: true }
            );
          } catch (e) { /* offline / rules — cache layer still keeps the value */ }
        });
        ExtraSubnets.migrateLegacyKeys();
      } catch (e) { console.warn("[extra-subnets] wire failed:", e); }

      // Firestore displayName + color are canonical — sync to localStorage
      const accounts = getAccounts();
      const acc = accounts.find(a => a.id === uid);
      let localDirty = false;

      // Resolve display name: Firestore is authoritative, localStorage is fallback
      const firestoreName = data.displayName || "";
      const localName     = acc?.displayName  || "";
      const resolvedName  = firestoreName || localName;

      if (resolvedName) {
        // We have a name — apply it everywhere
        if (acc && acc.displayName !== resolvedName) { acc.displayName = resolvedName; localDirty = true; }
        state.displayName         = resolvedName;
        $("sbName").textContent   = resolvedName;
        // Atomic avatar repaint via the centralised pipeline —
        // gradient, .av-initials text, and photo overlay are all
        // updated in one shot. Replaces the legacy textContent +
        // _renderAvatarPhotoOverlay dance that left a one-frame
        // window where the photo was wiped and only the initials
        // were showing.
        paintAvatar($("sbAvatar"), acc);
        renderFriendBanner(); // refresh header chip with authoritative Firestore name
        // If Firestore was missing the name but localStorage had it, write it back
        if (!firestoreName && localName) {
          db.collection("users").doc(uid).set({ displayName: localName }, { merge: true }).catch(() => {});
        }
      } else {
        // Defensive double-check before prompting: re-read from server one
        // last time after a short grace (1s) in case the doc is currently
        // being created/updated by another device. Only prompt if the
        // server STILL says the name is empty.
        setTimeout(async () => {
          if (uid !== state.activeAccountId) return;
          // If anything has set the name in the meantime, bail out
          if (state.displayName) return;
          try {
            const fresh = await db.collection("users").doc(uid).get({ source: "server" });
            if (fresh.exists && fresh.data().displayName) {
              const name = fresh.data().displayName;
              const accs = getAccounts();
              const a = accs.find(x => x.id === uid);
              if (a) { a.displayName = name; saveAccounts(accs); }
              state.displayName = name;
              $("sbName").textContent = name;
              // Atomic repaint via the centralised pipeline (same as
              // the main resolvedName branch above).
              paintAvatar($("sbAvatar"), a);
              renderFriendBanner(); // refresh header chip with authoritative Firestore name
              return;
            }
          } catch (_) {}
          // Truly nothing — prompt the user
          if (uid === state.activeAccountId && !state.displayName) {
            openDisplayNameSetup();
          }
        }, 1000);
      }

      if (acc && data.color_r !== undefined && data.color_g !== undefined && data.color_b !== undefined) {
        const h = n => n.toString(16).padStart(2, "0");
        const hex = `#${h(data.color_r)}${h(data.color_g)}${h(data.color_b)}`;
        // Try to match a named swatch, fall back to "custom"
        const match = Object.entries(ACCOUNT_COLORS).find(([, [c]]) => c.toLowerCase() === hex.toLowerCase());
        if (match) { acc.color = match[0]; delete acc.customColor; }
        else        { acc.color = "custom"; acc.customColor = hex; }
        localDirty = true;
      }

      if (localDirty && acc) { saveAccounts(accounts); }

      // Read custom avatar URL from userProfiles. Stored separately from
      // users/{uid} because userProfiles is public-to-signed-in (visible
      // to friends + friend-add preview), while users/{uid} is owner-
      // only. ALSO cache on the Account object so OTHER connected
      // accounts render their avatar in the dropdown / profiles modal
      // without an extra Firestore read at render time.
      //
      // Idempotency: state.photoURL was hydrated synchronously at
      // setConnected time from the cached Account. If the live
      // userProfiles value matches it, we DON'T touch state and DON'T
      // re-render — no flicker. Only if the URL actually changed
      // (avatar uploaded / removed from another device) do we push the
      // new value through.
      //
      // Failure path: transient network / offline errors must NOT null
      // state.photoURL — that would flick the user back to initials
      // for ~half a second on every flaky connection. Keep the cached
      // avatar showing; we'll pick up the real value on the next
      // successful read.
      try {
        const profSnap = await db.collection("userProfiles").doc(uid).get();
        const photoURL = profSnap.exists ? (profSnap.data().photoURL || null) : null;
        // Cache on the Account object in localStorage.
        const accsForPhoto = getAccounts();
        const accForPhoto = accsForPhoto.find(x => x.id === uid);
        if (accForPhoto && (accForPhoto.photoURL || null) !== photoURL) {
          accForPhoto.photoURL = photoURL;
          saveAccounts(accsForPhoto);
        }
        if (uid === state.activeAccountId &&
            (state.photoURL || null) !== photoURL) {
          state.photoURL = photoURL;
          // URL changed since hydration → push the update through the
          // existing render points (applyAvatarStyle below + the
          // renderFriendBanner / renderAccountDropdown calls right
          // after this block).
        }
      } catch (_) {
        // Keep the cached avatar — don't punish the user for a
        // transient Firestore blip.
      }

      applyAvatarStyle(acc);
      renderAccountDropdown();
      // The top-header "own" banner is rendered at connect time, BEFORE
      // this userProfiles read completes — re-render it now so the
      // custom photo (if any) appears in the OM chip too.
      renderFriendBanner();

      // Keep userProfiles in sync with latest public info.
      // profileName is never empty: fall back to Google first name then email
      // prefix so friends always see something meaningful even before the user
      // has chosen a display name.
      const profileName = resolvedName || (acc?.email || "").split("@")[0];
      syncUserProfile(uid, {
        publicKey:   data.publicKey,
        displayName: profileName,
        isPublic:    data.isPublic || false,
        color:       accPrimaryHex(acc),  // single hex field — simpler than color_r/g/b
      });

      // ── Client telemetry (fire-and-forget, non-critical) ──────────────────
      const info = await loadAppInfo();
      const FV   = firebase.firestore.FieldValue;

      // Country + timezone derived locally (no IP geolocation call — keeps it
      // offline and privacy-friendly). See deriveCountry() for the two-step
      // logic (locale region → timezone fallback).
      const timezone = currentTimezone();
      const country  = deriveCountry(timezone);

      // 1. users/{uid} — last-known client state (overwritten each session).
      //    Used for deployment targeting: "push to all darwin arm64 on < 1.8".
      db.collection("users").doc(uid).set({
        studioVersion:   info.appVersion       || null,
        studioElectron:  info.electron         || null,
        studioPlatform:  info.platform         || null,
        studioArch:      info.arch             || null,
        studioOsRelease: info.osRelease        || null,
        studioOsVersion: info.osVersion        || null,
        studioLang:      state.lang            || null,
        studioLocale:    navigator.language    || null,
        studioCountry:   country,
        studioTimezone:  timezone,
        studioLastSeen:  FV.serverTimestamp(),
      }, { merge: true }).catch(e => console.warn("[telemetry] user doc write failed:", e.code));

      // 2. users/{uid}/telemetry/studio — aggregated lifetime metrics.
      //    Never overwritten — only grows. Standard Firebase pattern:
      //    increment() for counters, arrayUnion() for sets, serverTimestamp() for events.
      const agg = {
        sessionsCount: FV.increment(1),
        versionsUsed:  FV.arrayUnion(info.appVersion || "?"),
        platformsUsed: FV.arrayUnion(info.platform   || "?"),
        lastSeen:      FV.serverTimestamp(),
      };
      db.collection("users").doc(uid)
        .collection("telemetry").doc("studio")
        .set(agg, { merge: true })
        .catch(e => console.warn("[telemetry] studio aggregate write failed:", e.code));

      // 3. Current-state snapshot + onboarding milestones — deferred until the
      //    inventory/racks/printers/scales subscriptions have delivered their
      //    first snapshot, otherwise the counts would all be 0 (see
      //    recordStudioState / scheduleStudioStateRecord).
      scheduleStudioStateRecord();

      // Reflect in open edit-account modal if already open
      if ($("editAccountModalOverlay").classList.contains("open")) {
        $("eacAdminBadge").classList.toggle("hidden", !state.isAdmin);
        $("eacDebugRow").classList.toggle("hidden",   !state.isAdmin);
        $("eacDebugToggle").checked = state.debugEnabled;
        $("eacName").textContent = resolvedName;
        $("eacDisplayNameInput").value = resolvedName;
      }
    } catch (err) {
      console.warn("[Firestore] syncUserDoc:", err.message);
    }
  }

  async function syncLangFromFirestore(uid) {
    try {
      const doc = await fbDb(uid).collection("users").doc(uid)
        .collection("prefs").doc("app").get();
      if (!doc.exists) return;
      const cloudLang = doc.data().lang;
      if (!cloudLang || !state.i18n[cloudLang] || cloudLang === state.lang) return;
      // Remote has a different (more recent) language — apply it
      state.lang = cloudLang;
      localStorage.setItem("tigertag.lang", cloudLang);
      const accounts = getAccounts();
      const acc = accounts.find(a => a.id === uid);
      if (acc) { acc.lang = cloudLang; saveAccounts(accounts); }
      applyLang(cloudLang);
    } catch (err) {
      console.warn("[Firestore] syncLang:", err.message);
    }
  }
  function applyLang(lang) {
    if (!lang || !state.i18n[lang]) return;
    state.lang = lang;
    applyTranslations();
    renderStats();
    renderInventory();
    if (state.selected && $("detailPanel").classList.contains("open")) openDetail(state.selected);
  }
  $("langSelect").addEventListener("change", () => {
    const lang = $("langSelect").value;
    saveAccountLang(lang);
    applyLang(lang);
  });

  /* ── init ── */
  loadLocales().then(() => {
    applyTranslations();
    ColdStart.mark("locales-ready");
    return loadLookups();
  }).then(() => {
    ColdStart.mark("lookups-ready");
    loadImgMap();  // hydrate url→local-file map so cached thumbnails paint instantly
    runMigration(); // wipe legacy API-key accounts before Firebase takes over
    initAuth();    // start Firebase auth state listener
    // Fallback first-paint signal: the signed-in fast path calls
    // signalFirstPaint() as soon as the cached avatar + inventory are
    // painted, but a signed-out (or very slow auth) launch has no such
    // trigger — reveal the window once the shell is on screen. Idempotent.
    requestAnimationFrame(signalFirstPaint);
  });

  // ── Electron RFID integration ──
  if (window.electronAPI) {

    // ── Reader indicator rendering (topbar) ─────────────────────────────────
    // One TigerPod icon (red = no reader · green = connected). The per-reader
    // detail (RFID #1 / #2 + the UID of any chip presented) shows on hover.
    function renderRfidReaderBadges() {
      const bar = $("rfidReadersBar");
      if (!bar) return;
      const readers = [...state.nfcReaders];
      const anyCard = readers.some(name => state.nfcCardPresent.get(name));
      const stateCls = readers.length === 0 ? "disconnected"
                     : anyCard               ? "connected card-present"
                     :                         "connected";
      const rows = readers.length === 0
        ? `<div class="rfid-pod-row"><span class="rrd-dot"></span><span class="rrd-name">${esc(t("rfidNoReader"))}</span></div>`
        : readers.map((name, idx) => {
            const card = state.nfcCardPresent.get(name);
            const uid  = card?.uid ? `<span class="rfid-pod-uid">${esc(card.uid)}</span>` : "";
            return `<div class="rfid-pod-row${card ? " card-present" : ""}">
              <span class="rrd-dot"></span>
              <span class="rrd-name">RFID #${idx + 1}</span>${uid}
            </div>`;
          }).join("");
      bar.innerHTML = `<div class="rfid-pod ${stateCls}">
        <span class="rfid-pod-icon"></span>
        <div class="rfid-pod-pop">${rows}</div>
      </div>`;
    }

    // ── Legacy onReaderStatus — noop (rfid-reader-update covers it) ─────────
    window.electronAPI.onReaderStatus(() => {});

    // ── "+ Auto-add" button ──────────────────────────────────────────────────
    $("btnAddScan")?.addEventListener("click", () => {
      if (state.nfcReaderCount === 0) { openTigerPodModal(); return; }
    });
    // Show disconnected badge immediately on load
    renderRfidReaderBadges();

    // Clicking the disconnected RFID pod opens TigerPOD discovery modal
    $("rfidReadersBar")?.addEventListener("click", e => {
      if (e.target.closest(".rfid-pod.disconnected")) {
        openTigerPodModal();
      }
    });

    // ── Reader connect / disconnect ──────────────────────────────────────────
    window.electronAPI.onRfidReaderUpdate(({ name, connected }) => {
      if (connected) {
        state.nfcReaders.add(name);
      } else {
        state.nfcReaders.delete(name);
        state.nfcCardPresent.delete(name);
      }
      state.nfcReaderCount = state.nfcReaders.size;
      const hasReader = state.nfcReaderCount > 0;
      const btn = $("btnAddScan");
      btn?.classList.toggle("has-reader", hasReader);
      btn?.classList.toggle("scanning",   hasReader);
      renderRfidReaderBadges();
      _cemPresenceChanged();   // reader count changed → refresh encode modal if open

      // Track max simultaneous RFID readers (TigerPOD usage telemetry)
      const n = state.nfcReaders.size;
      if (n > _telRfidMax) {
        _telRfidMax = n;
        _recordUsage({ rfidReadersMax: n });
      }
    });

    // ── Card present / removed — badge update ───────────────────────────────
    window.electronAPI.onRfidCardPresent(({ readerName, uid }) => {
      if (uid) state.nfcCardPresent.set(readerName, { uid });
      else     state.nfcCardPresent.delete(readerName);
      renderRfidReaderBadges();
      _cemPresenceChanged();   // live slot status + mid-burn presence watch
    });

    // Legacy uid event — open detail if already in inventory
    window.electronAPI.onRfid((uid) => {
      if (_encodeModalOpen()) return;   // don't pop a side-card over the encode modal
      const row = state.rows.find(r => r.uid === uid || r.spoolId === uid);
      if (row) openDetail(row.spoolId);
    });

    // ── Dual-scan buffer — collects up to 2 readers within 1.5 s ────────────
    // Both chips of a twin-tag spool arrive within ~500 ms; we wait 1.5 s so
    // a second scan is always included before processing.
    const _rfidScanBuffer = new Map(); // readerName → tagData
    let   _rfidScanTimer  = null;

    function _flushRfidScans() {
      _rfidScanTimer = null;
      if (_rfidScanBuffer.size === 0) return;
      const scans = new Map(_rfidScanBuffer);
      _rfidScanBuffer.clear();
      _processNfcScans(scans).catch(e => console.error('[RFID] processNfcScans:', e));
    }

    window.electronAPI.onRfidTagScanned((tagData) => {
      const readerName = tagData._readerName || 'reader';
      _rfidScanBuffer.set(readerName, tagData);
      clearTimeout(_rfidScanTimer);
      _rfidScanTimer = setTimeout(_flushRfidScans, 1500);
    });

    // ── Main NFC scan processor ──────────────────────────────────────────────
    // 1 or 2 chips simultaneously.
    // Twin detection: |timestamp1 − timestamp2| ≤ 2 s → same spool → auto-link.
    // Upsert:
    //   UID absent            → create
    //   UID present, same ts  → overwrite (data may have changed on chip)
    //   UID present, diff ts  → chip was erased & rewritten → delete + recreate
    async function _processNfcScans(scans) {
      const user = fbAuth().currentUser;
      if (!user) return;

      // Drop Init chips (blank, no material/brand)
      const validScans = [...scans.values()].filter(td => td.id_material || td.id_brand);
      if (validScans.length === 0) return;

      // Twin detection
      let twinMap = null;
      if (validScans.length === 2) {
        const [td1, td2] = validScans;
        if (Math.abs((td1.timestamp || 0) - (td2.timestamp || 0)) <= 2) {
          twinMap = { [td1.uid]: td2.uid, [td2.uid]: td1.uid };
          console.log('[RFID] Twin tags detected:', td1.uid, '↔', td2.uid);
        }
      }

      const processedUids = [];
      for (const tagData of validScans) {
        const uid = tagData.uid;
        if (!uid) continue;
        const twinUid = twinMap ? (twinMap[uid] ?? null) : null;
        const docRef  = fbDb().collection('users').doc(user.uid)
          .collection('inventory').doc(uid);
        try {
          const existing = await docRef.get();
          // Track whether this rescan is on an EXISTING doc with the SAME
          // chip timestamp — in that case the DB is the source of truth for
          // weight (the user updates it via the slider; nothing ever writes
          // back to the chip), so we must NOT overwrite it with the chip's
          // value on rescan. Fresh writes (new chip / chip rewritten) seed
          // the weight from the chip as before.
          let preserveDbWeight = false;
          if (existing.exists) {
            const stored = existing.data();
            if (stored.timestamp !== tagData.timestamp) {
              // Chip was fully erased & rewritten — clean slate
              console.log('[RFID] Chip rewritten (ts changed) — delete + recreate:', uid);
              await docRef.delete();
            } else {
              console.log('[RFID] Updating chip:', uid);
              preserveDbWeight = true;
              // Auto-sync: push the DB weight onto the chip when they diverge.
              // The slider only writes to Firestore — nothing else ever updates
              // the chip's "Measure Available" field — so on rescan the chip
              // value is usually stale. We rebuild the 80-byte payload from the
              // existing Firestore doc (which has the up-to-date weight) and
              // write surgically: only the single page containing the field
              // (page 0x17, +76, u24 BE) is actually written to the tag.
              // Fire-and-forget: the chip may be lifted before the write
              // completes — that's expected, the next scan will retry.
              const dbWeight   = Number(stored.weight_available ?? 0);
              const chipWeight = Number(tagData.measure_available_gr || tagData.measure_gr || 0);
              if (dbWeight !== chipWeight && tagData._readerName && window.electronAPI?.writeRfidTag) {
                window.electronAPI.writeRfidTag({
                  readerName: tagData._readerName,
                  cloudDoc:   stored,
                  surgical:   true,
                }).then(res => {
                  if (res?.ok) console.log(`[RFID] Weight synced to chip ${uid}: ${chipWeight}g → ${dbWeight}g (${res.pagesWritten} page(s))`);
                  else         console.warn(`[RFID] Weight sync to chip ${uid} failed:`, res?.error);
                }).catch(e => console.warn(`[RFID] Weight sync threw for ${uid}:`, e?.message || e));
              }
            }
          } else {
            console.log('[RFID] New chip — creating:', uid);
          }
          await _writeChipDoc(docRef, tagData, twinUid, { preserveDbWeight });
          processedUids.push(uid);
          // Lifetime "added" counter — a brand-new physical spool entered the
          // inventory by scan (i.e. it arrived already-written: factory/mobile;
          // chips born from a local burn already exist via _cemMigrate, so they
          // don't reach this branch). Twin dedup: only the first UID of a pair
          // increments → a freshly-scanned twin pair counts as one spool.
          if (!existing.exists && (!twinUid || String(uid) < String(twinUid))) {
            const isPlusChip = versionName(tagData.id_tigertag) === "TigerTag+";
            bumpStudioCounters(isPlusChip ? { plusAddedTotal: 1 } : { tagAddedTotal: 1 });
          }
        } catch (e) {
          console.error('[RFID] upsert failed for', uid, ':', e);
        }
      }

      // Open detail panel for the first chip (local cache fires fast) — but
      // never while the Encode modal is open (would pop a side-card over it).
      if (processedUids.length > 0 && !_encodeModalOpen()) {
        const firstUid = processedUids[0];
        const _tryOpen = () => {
          const row = state.rows.find(r => r.uid === firstUid || r.spoolId === firstUid);
          if (row) openDetail(row.spoolId);
        };
        setTimeout(_tryOpen, 150);
        setTimeout(_tryOpen, 600); // retry if snapshot was slow
      }
    }

    // ── Build and write one chip document to Firestore ───────────────────────
    // tagData  = toRawDict() output  (+ _api for TigerTag+, + _readerName)
    // twinUid  = partner chip UID, null if solo scan
    async function _writeChipDoc(docRef, tagData, twinUid, { preserveDbWeight = false } = {}) {
      // Write strictly what the chip reported via SDK toRawDict() — nothing invented.
      // Field name mapping: SDK snake_case → Firestore schema (data1-7 convention).
      const doc = {
        uid:              tagData.uid,
        id_tigertag:      tagData.id_tigertag  ?? 0,
        id_product:       tagData.id_product   ?? 0xFFFFFFFF,
        id_material:      tagData.id_material  ?? 0,
        id_aspect1:       tagData.id_aspect1   ?? 0,
        id_aspect2:       tagData.id_aspect2   ?? 0,
        id_type:          tagData.id_type      ?? 0,
        id_brand:         tagData.id_brand     ?? 0,
        id_unit:          tagData.id_unit      ?? 0,
        color_r:          tagData.color_r      ?? 0,
        color_g:          tagData.color_g      ?? 0,
        color_b:          tagData.color_b      ?? 0,
        color_a:          tagData.color_a      ?? 255,
        color_r2:         tagData.color_r2     ?? 0,
        color_g2:         tagData.color_g2     ?? 0,
        color_b2:         tagData.color_b2     ?? 0,
        color_r3:         tagData.color_r3     ?? 0,
        color_g3:         tagData.color_g3     ?? 0,
        color_b3:         tagData.color_b3     ?? 0,
        data1:            tagData.id_diameter  ?? 0,
        data2:            tagData.nozzle_min   ?? 0,
        data3:            tagData.nozzle_max   ?? 0,
        data4:            tagData.dry_temp     ?? 0,
        data5:            tagData.dry_time     ?? 0,
        data6:            tagData.bed_min      ?? 0,
        data7:            tagData.bed_max      ?? 0,
        measure:          tagData.measure      ?? 0,
        measure_gr:       tagData.measure_gr   ?? 0,
        td_raw:           tagData.td_raw       ?? 0,
        timestamp:        tagData.timestamp    ?? 0,
        // twin_tag_uid is a Studio relationship, not a chip field — preserve as-is
        twin_tag_uid:     twinUid || null,
        last_update:      Date.now(),
        updatedAt:        firebase.firestore.FieldValue.serverTimestamp(),
      };

      // Weight — the chip's `measure_available_gr` is NEVER written back when
      // the user adjusts the slider, so on a regular rescan the chip value is
      // almost always stale compared to the DB. Only seed the DB weight from
      // the chip on a fresh write (new chip, or after a clean-slate delete on
      // chip rewrite). Long-term direction: push the DB weight back to the
      // chip on demand so they stay in sync — until then, DB wins on rescan.
      if (!preserveDbWeight) {
        doc.weight_available = tagData.measure_available_gr || tagData.measure_gr || 0;
      }

      // message — chip field, but omit when empty (saves space, easier to spot real data)
      if (tagData.message) doc.message = tagData.message;

      // ── API fields — TigerTag+ only, written only when present in the response ─
      const api = tagData._api;
      if (api) {
        if (api.name)                          doc.name               = api.name;
        if (api.sku)                           doc.sku                = api.sku;
        if (api.barcode)                       doc.barcode            = api.barcode;
        if (api.series)                        doc.series             = api.series;
        if (api.images?.main_src)              doc.url_img            = api.images.main_src;
        if (api.filament?.color)               doc.online_color       = api.filament.color;
        if (api.filament?.color_info?.colors?.length)
                                               doc.online_color_list  = api.filament.color_info.colors;
        if (api.filament?.color_info?.type)    doc.online_color_type  = api.filament.color_info.type;
        if (api.links?.tds)                    doc.LinkTDS            = api.links.tds;
        if (api.links?.msds)                   doc.LinkMSDS           = api.links.msds;
        if (api.links?.rohs)                   doc.LinkROHS           = api.links.rohs;
        if (api.links?.reach)                  doc.LinkREACH          = api.links.reach;
        if (api.links?.tips)                   doc.LinkTIPS           = api.links.tips;
        if (api.links?.food)                   doc.LinkFOOD           = api.links.food;
        if (api.links?.youtube)                doc.LinkYoutube        = api.links.youtube;
        if (api.filament?.refill)              doc.info1              = true;
        if (api.filament?.recycled)            doc.info2              = true;
        if (api.filament?.filled)              doc.info3              = true;
      }

      // Merge — only overwrite the chip-sourced + API fields we just rebuilt.
      // Without `{ merge: true }` this would replace the entire document and
      // silently wipe every user-edited field (container_id, container_weight,
      // capacity, custom_message, etc.) that is NOT on the chip. The "chip
      // rewritten" branch above already handles the clean-slate case via
      // an explicit `delete()` followed by this set — merge is a no-op there.
      await docRef.set(doc, { merge: true });
    }

    // Auto-update notification
    window.electronAPI.onUpdateStatus(({ status }) => {
      const banner = $("updateBanner");
      const msg    = $("updateMsg");
      const btn    = $("btnInstallUpdate");
      const icon   = $("updateStatusIcon");
      if (status === 'available') {
        msg.innerHTML = t("updateDownloading");
        btn.classList.add("hidden");
        banner.classList.remove("hidden");
        // header icon: orange spinner
        icon?.classList.remove("hidden", "ready");
        icon?.classList.add("downloading");
        icon?.setAttribute("data-tooltip", t("updateDownloading").replace(/<[^>]*>/g, ""));
      } else if (status === 'ready') {
        msg.innerHTML = t("updateReady");
        btn.textContent = t("btnRestartUpdate");
        btn.classList.remove("hidden");
        banner.classList.remove("hidden");
        // header icon: green glow
        icon?.classList.remove("hidden", "downloading");
        icon?.classList.add("ready");
        icon?.setAttribute("data-tooltip", t("updateReady").replace(/<[^>]*>/g, ""));
      }
    });
    $("btnInstallUpdate").addEventListener("click", () => window.electronAPI.installUpdate());
    $("updateStatusIcon")?.addEventListener("click", () => {
      if ($("updateStatusIcon")?.classList.contains("ready"))
        window.electronAPI.installUpdate();
    });
  }

  // ── TD1S sensor engine (onSensorData/onStatus/onLog/onClear + panel + modals)
  //    moved to renderer/IoT/td1s/index.js — wired via initTD1S(ctx) above.   
