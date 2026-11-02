/**
 * art.js — illustrations at the size they are painted (docs/ART-DIRECTION.md, "Size").
 *
 * A laddered picture (scripts/build-art-ladder.mjs, index in art-ladder.js) has four
 * WebP renditions, 128 / 256 / 512 / 1024 px wide. artImg() writes an <img> with all of
 * them in srcset and sizes="auto": Chromium measures the rendered width × the screen
 * density and loads the smallest rendition that covers it — no size decided view by
 * view. width / height carry the master's proportions so the box is laid out (and
 * measured) before the file arrives.
 *
 *   artImg("tigersquad/squad-notice/tiger-back", { cls: "sqn-art" })
 *   artSrc(key, 512)       → one rendition's URL (a CSS background, a canvas)
 *   isLaddered(key)        → true when the picture has its ladder
 */
import LADDER, { ART_WIDTHS } from "./art-ladder.js";

const ROOT = "../assets/img/";
const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export const isLaddered = key => Object.prototype.hasOwnProperty.call(LADDER, key);
export const artSrc = (key, w = 512) => `${ROOT}${key}-${w}.webp`;

export function artImg(key, { cls = "", alt = "", extra = "" } = {}) {
  const dims = LADDER[key];
  // Not laddered (yet): the plain file, as before.
  if (!dims) return `<img${cls ? ` class="${attr(cls)}"` : ""} src="${ROOT}${key}.webp" alt="${attr(alt)}" draggable="false"${extra ? ` ${extra}` : ""}>`;
  const srcset = ART_WIDTHS.map(w => `${artSrc(key, w)} ${w}w`).join(", ");
  return `<img${cls ? ` class="${attr(cls)}"` : ""} src="${artSrc(key, 512)}" srcset="${srcset}" sizes="auto" loading="lazy" decoding="async"`
    + ` width="${dims[0]}" height="${dims[1]}" alt="${attr(alt)}" draggable="false"${alt ? "" : ` aria-hidden="true"`}${extra ? ` ${extra}` : ""}>`;
}
