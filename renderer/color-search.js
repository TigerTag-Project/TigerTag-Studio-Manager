/**
 * renderer/color-search.js — find a catalogue product by colour: a HEX code, a
 * RAL Classic code or a point of a photo, kept within a colour difference (ΔE).
 *
 * The same matching as tigersystem.io's colour finder (TigerTag_Hub
 * lib/colorMatch.ts, features/colorFinder/ColorFinder.tsx), so both surfaces
 * rank the catalogue identically:
 *   • CIEDE2000 (Sharma, Wu & Dalal 2005, kL = kC = kH = 1) over CIELAB, sRGB D65;
 *   • a colour's alpha is dropped (#RRGGBBAA → #RRGGBB);
 *   • a multicolour product counts its closest colour, and is left out unless
 *     multicolour is asked for or its brand declared the RAL searched for;
 *   • a product whose brand declared that RAL comes first, then ΔE ascending;
 *   • a photo point is the plain-sRGB average of the 5×5 pixels under it, the
 *     photo downscaled to 1200 px at most — it never leaves the computer.
 * Studio adds what the site does not have: a ΔE ceiling (the slider), since the
 * catalogue view is a filtered list rather than a ranking page.
 *
 *   mountColorSearch(root, { t, esc, swatchBg, openColorPop, value, onChange })
 *     → { setValue(value) }
 *   value = { mode: "hex" | "ral" | "photo", hex: "#rrggbb" | null, ral: "RAL 9005" | "", max, multi }
 *
 * Drawn in ONE side card, #colorSearchPanel (inventory.js openColorSearch),
 * opened by the search bar's colour button in the Search views.
 */
import { RAL_CLASSIC } from './ral-classic.js';

export const DE_DEFAULT = 10;   // keeps everything the site does not call "Different"
export const DE_MIN = 1, DE_MAX = 30;
const PHOTO_MAX = 1200;         // longest side of the photo once drawn
// The site's quick picks (ColorFinder.tsx PRESETS).
const PRESETS = ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#3949ab", "#8e24aa", "#ec407a",
  "#6d4c41", "#d7ccc8", "#9e9e9e", "#212121", "#ffffff", "#c0c0c0"];

/* ── Maths: lib/colorMatch.ts, ported as is ─────────────────────────────── */

/** "#RRGGBB", "#RRGGBBAA", "RRGGBB" or "#RGB" → "#rrggbb"; null otherwise. */
export function normHex(v) {
  const s = String(v ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${s.split("").map(c => c + c).join("").toLowerCase()}`;
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return `#${s.slice(0, 6).toLowerCase()}`;
  return null;
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}
/** sRGB → CIELAB, D65 white. */
export function hexToLab(hex) {
  const lin = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = hexToRgb(hex).map(lin);
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** CIEDE2000 (Sharma, Wu & Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (b, a) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hp(b1, a1p), h2p = hp(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
    else hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad)
    + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}
/** The site's labels for a ΔE (ColorFinder.tsx `level`) → the i18n key suffix. */
export function deltaBand(de) {
  return de < 1 ? "same" : de < 2 ? "veryClose" : de < 5 ? "close" : de < 10 ? "near" : "far";
}

/* ── RAL Classic ─────────────────────────────────────────────────────────── */

/** "RAL 9005", "ral-9005" or "9005" → { code: "RAL 9005", name, hex } ; null otherwise. */
export function ralColor(v) {
  const m = /^\s*(?:ral[\s-]*)?(\d{4})\s*$/i.exec(String(v ?? ""));
  if (!m) return null;
  const code = `RAL ${m[1]}`, e = RAL_CLASSIC[code];
  return e ? { code, name: e[0], hex: normHex(e[1]) } : null;
}
/* The RAL names are English only. A colour word typed in the app's language
   ("rouge", "grün", "红色") is read as the English one too, through the
   translated word list `colorSearchRalWords` ("rouge=red|vert=green|…"). A word
   the list does not know is searched as typed. */
function ralWordList(str) {
  const m = new Map();
  String(str || "").split("|").forEach(pair => {
    const [k, en] = pair.split("=").map(x => String(x || "").trim().toLowerCase());
    if (k && en) m.set(k, en);
  });
  return m;
}
function ralAlternatives(word, words) {
  const alts = [word];
  if (words.has(word)) alts.push(words.get(word));
  else {
    for (const [k, en] of words) {
      // A word still being typed ("roug"), or one written with a suffix in a
      // script without spaces ("红色" for 红).
      if ((word.length >= 3 && k.startsWith(word)) || (/[^\x00-\x7f]/.test(k) && word.startsWith(k))) { alts.push(en); break; }
    }
  }
  return alts;
}
/** Every RAL Classic colour whose code or name holds every word typed — all 215
    while nothing is typed, so the list can be browsed (it scrolls). */
function ralSuggest(q, words = new Map()) {
  const typed = String(q || "").toLowerCase().replace(/\bral\b/g, " ").split(/\s+/).filter(Boolean);
  const alts = typed.map(w => ralAlternatives(w, words));
  const out = [];
  for (const [code, [name, hex]] of Object.entries(RAL_CLASSIC)) {
    const hay = `${code} ${name}`.toLowerCase();
    if (alts.every(a => a.some(w => hay.includes(w)))) out.push({ code, name, hex: normHex(hex) });
  }
  return out;
}

/* ── The side card's body ────────────────────────────────────────────────── */

export function mountColorSearch(root, { t, esc, swatchBg, openColorPop, value, onChange }) {
  let v = { mode: "hex", hex: null, ral: "", max: DE_DEFAULT, multi: false, ...value };
  const emit = () => onChange({ ...v });

  root.innerHTML = `
    <div class="eac-seg csr-modes" role="tablist">
      <button type="button" class="eac-seg-btn" role="tab" data-csr-mode="hex">${esc(t("colorSearchHex"))}</button>
      <button type="button" class="eac-seg-btn" role="tab" data-csr-mode="ral">${esc(t("colorSearchRal"))}</button>
      <button type="button" class="eac-seg-btn" role="tab" data-csr-mode="photo">${esc(t("colorSearchPhoto"))}</button>
    </div>

    <!-- The colour chosen, right under the modes: in RAL and photo modes it is
         what the list or the photo gave (in HEX mode the field shows it). -->
    <div class="csr-current">
      <span class="csr-swatch csr-swatch--big" aria-hidden="true"></span>
      <div class="csr-current-text">
        <div class="csr-current-hex"></div>
        <div class="csr-current-sub"></div>
      </div>
    </div>
    <div class="csr-pane" data-csr-pane="hex">
      <div class="csr-hex-row">
        <button type="button" class="csr-swatch csr-swatch--pick" aria-label="${esc(t("colorSearchPick"))}"></button>
        <input class="pba-input csr-hex-input" type="text" maxlength="7" spellcheck="false" placeholder="#1E88E5"
               aria-label="${esc(t("colorSearchHex"))}" />
      </div>
      <div class="csr-presets">${PRESETS.map(h => `<button type="button" class="csr-swatch csr-preset" data-hex="${h}"
          aria-label="${h.toUpperCase()}"></button>`).join("")}</div>
    </div>

    <div class="csr-pane" data-csr-pane="ral" hidden>
      <input class="pba-input csr-ral-input" type="text" spellcheck="false"
             placeholder="${esc(t("colorSearchRalSearch"))}" aria-label="${esc(t("colorSearchRalSearch"))}" />
      <div class="csr-ral-list" role="listbox"></div>
    </div>

    <div class="csr-pane" data-csr-pane="photo" hidden>
      <label class="csr-drop">
        <span class="icon icon-image" aria-hidden="true"></span>
        <span class="csr-drop-text">${esc(t("colorSearchPhotoDrop"))}</span>
        <input type="file" accept="image/*" class="csr-file" hidden />
      </label>
      <div class="csr-photo" hidden>
        <canvas class="csr-canvas"></canvas>
        <span class="csr-dot" aria-hidden="true" hidden></span>
      </div>
      <div class="csr-photo-actions" hidden>
        <label class="csr-photo-btn">
          <span class="icon icon-image icon-14" aria-hidden="true"></span>${esc(t("colorSearchPhotoChoose"))}
          <input type="file" accept="image/*" class="csr-file" hidden />
        </label>
        <button type="button" class="csr-photo-btn csr-photo-clear">${esc(t("colorSearchPhotoClear"))}</button>
      </div>
      <div class="pba-field-hint">${esc(t("colorSearchPhotoHint"))}</div>
    </div>


    <div class="pba-field csr-max">
      <div class="csr-max-head">
        <span class="pba-field-label csr-max-label"></span>
        <span class="csr-band"></span>
      </div>
      <input type="range" class="csr-range" min="${DE_MIN}" max="${DE_MAX}" step="1" aria-label="${esc(t("colorSearchMaxAria"))}" />
      <div class="pba-field-hint">${esc(t("colorSearchHelp"))}</div>
    </div>

    <label class="csr-multi">
      <span class="eac-toggle">
        <input type="checkbox" class="csr-multi-input" />
        <span class="eac-toggle-track"><span class="eac-toggle-thumb"></span></span>
      </span>
      <span>${esc(t("colorSearchMulti"))}</span>
    </label>`;

  const $ = s => root.querySelector(s);
  const hexInput = $(".csr-hex-input"), ralInput = $(".csr-ral-input"), range = $(".csr-range");
  const canvas = $(".csr-canvas"), dot = $(".csr-dot");
  let hasPhoto = false;

  // ── Paint everything from `v` (also after an outside change: setValue).
  const paint = () => {
    root.querySelectorAll("[data-csr-mode]").forEach(b => {
      const on = b.dataset.csrMode === v.mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    root.querySelectorAll("[data-csr-pane]").forEach(p => { p.hidden = p.dataset.csrPane !== v.mode; });
    // In HEX mode the field and its swatch already show the colour: said once.
    $(".csr-current").hidden = v.mode === "hex";
    const pick = $(".csr-swatch--pick"), big = $(".csr-swatch--big");
    [pick, big].forEach(el => {
      el.classList.toggle("is-empty", !v.hex);
      el.style.background = v.hex ? swatchBg(v.hex) : "";
    });
    if (document.activeElement !== hexInput) hexInput.value = v.hex ? v.hex.toUpperCase() : "";
    const ral = v.ral ? ralColor(v.ral) : null;
    $(".csr-current").classList.toggle("is-empty", !v.hex);
    $(".csr-current-hex").textContent = v.hex ? (ral ? ral.code : v.hex.toUpperCase()) : t("colorSearchNone");
    $(".csr-current-sub").textContent = v.hex ? (ral ? `${ral.name} · ${v.hex.toUpperCase()}` : "") : "";
    range.value = String(v.max);
    $(".csr-max-label").textContent = t("colorSearchMax", { n: v.max });
    $(".csr-band").textContent = t(`colorSearchBand_${deltaBand(v.max - 0.01)}`);
    $(".csr-band").dataset.band = deltaBand(v.max - 0.01);
    $(".csr-multi-input").checked = !!v.multi;
    root.querySelectorAll(".csr-preset").forEach(b => b.classList.toggle("is-on", !v.ral && b.dataset.hex === v.hex));
    paintRal();
    root.querySelector(".csr-drop").hidden = hasPhoto;
    $(".csr-photo").hidden = !hasPhoto;
    $(".csr-photo-actions").hidden = !hasPhoto;
  };
  const paintRal = () => {
    const list = ralSuggest(ralInput.value, ralWordList(t("colorSearchRalWords")));
    $(".csr-ral-list").innerHTML = list.length
      ? list.map(r => `<button type="button" class="csr-ral-row${r.code === v.ral ? " is-on" : ""}" role="option"
          aria-selected="${r.code === v.ral}" data-ral="${esc(r.code)}">
          <span class="csr-swatch" style="background:${swatchBg(r.hex)}"></span>
          <span class="csr-ral-code">${esc(r.code)}</span><span class="csr-ral-name">${esc(r.name)}</span></button>`).join("")
      : `<div class="pba-field-hint">${esc(t("colorSearchRalNone"))}</div>`;
  };
  // A colour from the picker, a preset, the HEX field or a photo: no longer a RAL's.
  const setHex = hex => { v = { ...v, hex, ral: "" }; paint(); emit(); };

  // ── Modes
  root.querySelectorAll("[data-csr-mode]").forEach(b => b.addEventListener("click", () => {
    v = { ...v, mode: b.dataset.csrMode };
    paint();
    if (v.mode === "ral") ralInput.focus();
    if (v.mode === "hex") hexInput.focus();
  }));

  // ── HEX: the field applies once six digits are there (#RGB too, like the site).
  hexInput.addEventListener("input", () => {
    const raw = hexInput.value.trim().replace(/^#/, "");
    const h = normHex(raw);
    if (h && (raw.length === 6 || raw.length === 3)) setHex(h);
  });
  hexInput.addEventListener("blur", () => paint());
  $(".csr-swatch--pick").addEventListener("click", e => {
    openColorPop(e.currentTarget, v.hex || PRESETS[4], { label: t("colorSearchPick"), onInput: h => { const n = normHex(h); if (n) setHex(n); } });
  });
  root.querySelectorAll(".csr-preset").forEach(b => { b.style.background = swatchBg(b.dataset.hex); });
  $(".csr-presets").addEventListener("click", e => {
    const b = e.target.closest(".csr-preset");
    if (b) setHex(b.dataset.hex);
  });

  // ── RAL: search by code or name; a pick sets the colour to that RAL's.
  ralInput.addEventListener("input", paintRal);
  ralInput.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const r = ralColor(ralInput.value) || ralSuggest(ralInput.value, 1)[0];
    if (r) { v = { ...v, hex: r.hex, ral: r.code }; paint(); emit(); }
  });
  $(".csr-ral-list").addEventListener("click", e => {
    const row = e.target.closest("[data-ral]");
    const r = row && ralColor(row.dataset.ral);
    if (r) { v = { ...v, hex: r.hex, ral: r.code }; paint(); emit(); }
  });

  // ── Photo: opened here, drawn in a canvas; a click or a drag takes the
  // average of the 5×5 pixels under the pointer. Nothing is uploaded.
  const openPhoto = file => {
    if (!file || !String(file.type).startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      hasPhoto = true;
      dot.hidden = true;
      v = { ...v, mode: "photo" };
      paint();
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };
  let timer = 0, pending = null;
  const sample = e => {
    const r = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * canvas.width);
    const y = Math.round(((e.clientY - r.top) / r.height) * canvas.height);
    const d = canvas.getContext("2d", { willReadFrequently: true })
      .getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
    if (!n) return;
    dot.hidden = false;
    dot.style.left = `${(x / canvas.width) * 100}%`;
    dot.style.top = `${(y / canvas.height) * 100}%`;
    // A drag fires far more often than the catalogue can be re-ranked: one per ~frame.
    pending = rgbToHex(R / n, G / n, B / n);
    dot.style.background = swatchBg(pending);
    if (!timer) timer = setTimeout(() => { timer = 0; if (pending) setHex(pending); pending = null; }, 16);
  };
  canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); sample(e); });
  canvas.addEventListener("pointermove", e => { if (e.buttons) sample(e); });
  root.querySelectorAll(".csr-file").forEach(inp => inp.addEventListener("change", () => { openPhoto(inp.files?.[0]); inp.value = ""; }));
  $(".csr-photo-clear").addEventListener("click", () => {
    hasPhoto = false;
    canvas.width = canvas.height = 0;
    dot.hidden = true;
    paint();
  });
  // A photo dropped or pasted anywhere on the card opens in the Photo mode.
  root.addEventListener("dragover", e => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); root.classList.add("is-drag"); } });
  root.addEventListener("dragleave", e => { if (!root.contains(e.relatedTarget)) root.classList.remove("is-drag"); });
  root.addEventListener("drop", e => { e.preventDefault(); root.classList.remove("is-drag"); openPhoto(e.dataTransfer?.files?.[0]); });
  root.addEventListener("paste", e => {
    const f = [...(e.clipboardData?.files || [])].find(x => String(x.type).startsWith("image/"));
    if (f) { e.preventDefault(); openPhoto(f); }
  });

  // ── Ceiling and multicolour.
  range.addEventListener("input", () => { v = { ...v, max: Number(range.value) || DE_DEFAULT }; paint(); if (v.hex) emit(); });
  $(".csr-multi-input").addEventListener("change", e => { v = { ...v, multi: e.target.checked }; if (v.hex) emit(); });

  paint();
  return {
    setValue(next) { v = { mode: "hex", hex: null, ral: "", max: DE_DEFAULT, multi: false, ...v, ...next }; paint(); },
  };
}
