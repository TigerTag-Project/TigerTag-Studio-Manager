// A small colour picker that opens right where the user clicked (founder, 2026-11-14:
// macOS's own colour panel, opened by <input type="color">, pops far from the pointer).
// A saturation / brightness area, a hue strip and a HEX field; `onInput(hex)` follows
// every move, `onClose()` when it goes (a click outside, Escape, or opening another).
//   openColorPop(anchorEl, "#2563eb", { onInput, onClose, label })

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

export function openColorPop(anchor, hex, { onInput = () => {}, onClose = () => {}, label = "" } = {}) {
  closeColorPop();
  let hsv = hexToHsv(hex);
  const el = document.createElement("div");
  el.className = "color-pop";
  el.setAttribute("role", "dialog");
  if (label) el.setAttribute("aria-label", label);
  el.innerHTML = `
    <div class="color-pop-sv"><span class="color-pop-thumb"></span></div>
    <input class="color-pop-hue" type="range" min="0" max="359" step="1" aria-label="Hue">
    <div class="color-pop-row">
      <span class="color-pop-swatch"></span>
      <input class="color-pop-hex" type="text" maxlength="7" spellcheck="false" aria-label="HEX">
    </div>`;
  document.body.appendChild(el);
  const sv = el.querySelector(".color-pop-sv"), thumb = el.querySelector(".color-pop-thumb");
  const hue = el.querySelector(".color-pop-hue"), hexIn = el.querySelector(".color-pop-hex");
  const sw = el.querySelector(".color-pop-swatch");

  const paint = (fromHex = false) => {
    const cur = hsvToHex(hsv);
    sv.style.setProperty("--hue", `hsl(${Math.round(hsv.h)} 100% 50%)`);
    thumb.style.left = `${hsv.s * 100}%`;
    thumb.style.top = `${(1 - hsv.v) * 100}%`;
    hue.value = String(Math.round(hsv.h));
    sw.style.background = cur;
    if (!fromHex) hexIn.value = cur.toUpperCase();
    return cur;
  };
  let raf = 0;
  const emit = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => onInput(hsvToHex(hsv))); };
  paint();

  // Saturation / brightness: drag anywhere in the area.
  const pick = (e) => {
    const r = sv.getBoundingClientRect();
    hsv = { ...hsv, s: clamp((e.clientX - r.left) / r.width, 0, 1), v: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) };
    paint(); emit();
  };
  sv.addEventListener("pointerdown", (e) => {
    sv.setPointerCapture(e.pointerId); pick(e);
    const move = (ev) => pick(ev);
    const up = () => { sv.removeEventListener("pointermove", move); sv.removeEventListener("pointerup", up); };
    sv.addEventListener("pointermove", move); sv.addEventListener("pointerup", up);
  });
  hue.addEventListener("input", () => { hsv = { ...hsv, h: Number(hue.value) }; paint(); emit(); });
  hexIn.addEventListener("input", () => {
    const v = hexIn.value.trim();
    if (/^#?[0-9a-f]{6}$/i.test(v)) { hsv = hexToHsv(v.startsWith("#") ? v : "#" + v); paint(true); emit(); }
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
    cancelAnimationFrame(raf);
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
