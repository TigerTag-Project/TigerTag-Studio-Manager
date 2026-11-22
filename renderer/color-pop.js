// A small colour picker that opens right where the user clicked (founder, 2026-11-14:
// macOS's own colour panel, opened by <input type="color">, pops far from the pointer).
// A saturation / brightness area, a hue strip and a HEX field; `onInput(hex)` follows
// every move, `onClose()` when it goes (a click outside, Escape, or opening another).
//   openColorPop(anchorEl, "#2563eb", { onInput, onClose, label })
// The area and strip alone, inline in a card: mountColorArea (below).

let _open = null;   // { el, close }

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function hexToHsv(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  const n = m ? parseInt(m[1], 16) : 0x2563eb;
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function hsvToHex({ h, s, v }) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

export function closeColorPop() { _open?.close(); }

// The picker itself — the saturation / brightness area and the hue strip — built
// in `host`: inside the popover below, or straight in a card (the colour search's
// HEX pane). `onInput(hex)` follows every move; `set(hex)` shows a colour chosen
// elsewhere (a grey keeps the hue the strip was on) — `set(hex, { animate: true })`
// glides the thumbs and the area there instead of jumping.
//   const area = mountColorArea(host, "#2563eb", { onInput, onPaint })
export function mountColorArea(host, hex, { onInput = () => {}, onPaint = () => {} } = {}) {
  let hsv = hexToHsv(hex);
  host.insertAdjacentHTML("beforeend", `
    <div class="color-pop-sv"><span class="color-pop-thumb"></span></div>
    <input class="color-pop-hue" type="range" min="0" max="359" step="1" aria-label="Hue">`);
  const sv = host.querySelector(".color-pop-sv"), thumb = host.querySelector(".color-pop-thumb");
  const hue = host.querySelector(".color-pop-hue");
  const paint = () => {
    const cur = hsvToHex(hsv);
    sv.style.setProperty("--hue", `hsl(${Math.round(hsv.h)} 100% 50%)`);
    thumb.style.left = `${hsv.s * 100}%`;
    thumb.style.top = `${(1 - hsv.v) * 100}%`;
    hue.value = String(Math.round(hsv.h));
    onPaint(cur);
    return cur;
  };
  let raf = 0;
  const emit = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => onInput(hsvToHex(hsv))); };
  // Saturation / brightness: drag anywhere in the area.
  const pick = (e) => {
    const r = sv.getBoundingClientRect();
    hsv = { ...hsv, s: clamp((e.clientX - r.left) / r.width, 0, 1), v: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) };
    paint(); emit();
  };
  let anim = 0;   // a set(…, { animate }) under way — a hand on the picker stops it
  sv.addEventListener("pointerdown", (e) => {
    cancelAnimationFrame(anim);
    sv.setPointerCapture(e.pointerId); pick(e);
    const move = (ev) => pick(ev);
    const up = () => { sv.removeEventListener("pointermove", move); sv.removeEventListener("pointerup", up); };
    sv.addEventListener("pointermove", move); sv.addEventListener("pointerup", up);
  });
  hue.addEventListener("input", () => { cancelAnimationFrame(anim); hsv = { ...hsv, h: Number(hue.value) }; paint(); emit(); });
  paint();
  return {
    set(h, { animate = false } = {}) {
      const n = hexToHsv(h), to = n.s === 0 || n.v === 0 ? { ...n, h: hsv.h } : n;
      cancelAnimationFrame(anim);
      if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) { hsv = to; paint(); return; }
      // 280 ms, ease-out; the hue goes the short way round the wheel.
      const from = { ...hsv }, dh = ((to.h - from.h + 540) % 360) - 180, t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 280), e = 1 - (1 - k) ** 3;
        hsv = k < 1 ? { h: (from.h + dh * e + 360) % 360, s: from.s + (to.s - from.s) * e, v: from.v + (to.v - from.v) * e } : to;
        paint();
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    },
    stop() { cancelAnimationFrame(raf); cancelAnimationFrame(anim); },
  };
}

export function openColorPop(anchor, hex, { onInput = () => {}, onClose = () => {}, label = "" } = {}) {
  closeColorPop();
  const el = document.createElement("div");
  el.className = "color-pop";
  el.setAttribute("role", "dialog");
  if (label) el.setAttribute("aria-label", label);
  document.body.appendChild(el);
  let typing = false;   // the HEX field is being typed in: not rewritten under the caret
  const row = document.createElement("div");
  row.className = "color-pop-row";
  row.innerHTML = `<span class="color-pop-swatch"></span>
      <input class="color-pop-hex" type="text" maxlength="7" spellcheck="false" aria-label="HEX">`;
  const sw = row.querySelector(".color-pop-swatch"), hexIn = row.querySelector(".color-pop-hex");
  const area = mountColorArea(el, hex, { onInput, onPaint: (cur) => { sw.style.background = cur; if (!typing) hexIn.value = cur.toUpperCase(); } });
  el.appendChild(row);
  hexIn.addEventListener("input", () => {
    const v = hexIn.value.trim();
    if (!/^#?[0-9a-f]{6}$/i.test(v)) return;
    const h = v.startsWith("#") ? v : "#" + v;
    typing = true; area.set(h); typing = false;
    onInput(hsvToHex(hexToHsv(h)));
  });

  // Beside the anchor (below it, else above), kept inside the window.
  const place = () => {
    const a = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, m = 8;
    let x = a.left + a.width / 2 - w / 2, y = a.bottom + m;
    if (y + h > innerHeight - m) y = a.top - h - m;
    el.style.left = `${clamp(x, m, innerWidth - w - m)}px`;
    el.style.top = `${clamp(y, m, innerHeight - h - m)}px`;
  };
  place();

  const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  function close() {
    if (_open?.el !== el) return;
    _open = null;
    area.stop();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", key, true);
    removeEventListener("resize", place);
    el.remove();
    onClose();
  }
  setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
  document.addEventListener("keydown", key, true);
  addEventListener("resize", place);
  _open = { el, close };
  return close;
}
