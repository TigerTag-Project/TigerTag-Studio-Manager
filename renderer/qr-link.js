/**
 * renderer/qr-link.js — the QR links of TigerSystem-Docs
 * docs/developers/spool-ids-and-qr-links.md: writing them (§3 spool, §5
 * product) and reading them back offline (§3 "Reading a link back", §4 values).
 * No dependency: imported by the app (inventory.js) and the labels
 * (labels/index.js).
 *
 *   spoolLink(spoolId)        — https://qr.tigertag.io/<id>, lowercase; null when not printable
 *   productLink(idProduct)    — https://qr.tigertag.io/p/<10 digits>; null without a real id
 *   productShareLink(id, lang) — https://qr.tigertag.io/<lang>/p/<10 digits>: the product page in
 *                               the sharer's language (shared links, never printed)
 *   spoolShareLink(id, lang)   — https://qr.tigertag.io/<lang>/<spool id>: a spool shared by its owner
 *                               (shown to friends / a public inventory, else its product)
 *   spoolIdFromPath(text)     — a spool id in any accepted form → its doc id; null otherwise
 *   parseQrLink(text)         — a qr.tigertag.io link → { kind: "spool", id, weight, note }
 *                               | { kind: "product", idProduct, idProductDecimal? } | { kind: "newer" } ; null
 *                               when the text is not such a link. Each also carries `format`, the link's
 *                               ending: "page" | "json" | "ttag"
 *   linkValues(params)        — the §4 values of a query string, each null when absent or refused
 */

export const QR_HOST = "qr.tigertag.io";
const HEX14 = /^[0-9A-F]{14}$/i;
const NOTE_MAX_BYTES = 28;   // the chip's message slot

export function spoolLink(spoolId) {
  const id = String(spoolId || "");
  const m = /^TigerData_(\d{17}|\d{10})$/.exec(id);
  if (m) return `https://${QR_HOST}/` + m[1];
  if (HEX14.test(id)) return `https://${QR_HOST}/` + id.toLowerCase();
  return null;   // CLOUD_…, legacy decimal: printed without a QR code
}

export function productLink(idProduct) {
  const n = Number(idProduct);
  if (!Number.isFinite(n) || n <= 0 || n >= 0xFFFFFFFF) return null;
  // The decimal id_product on 10 digits (zeros in front), since 2026-11-11: two lengths
  // (10 digits now, 8 hex on older labels) that a reader never confuses.
  return `https://${QR_HOST}/p/` + String(n >>> 0).padStart(10, "0");
}

// A shared product link opens the page in the sharer's language: the UI language as
// a path prefix. Printed labels keep the language-neutral productLink.
const LANGS = ["en", "fr", "de", "es", "it", "zh", "pt", "pt-pt", "pl", "ru", "nl"];
const withLang = (link, lang) => {
  const l = String(lang || "").toLowerCase();
  return link && LANGS.includes(l) ? link.replace(`${QR_HOST}/`, `${QR_HOST}/${l}/`) : link;
};
export const productShareLink = (idProduct, lang) => withLang(productLink(idProduct), lang);
export const spoolShareLink = (spoolId, lang) => withLang(spoolLink(spoolId), lang);
const LANG_PREFIX = /^(?:en|fr|de|es|it|zh|pt|pt-pt|pl|ru|nl)\//i;   // a shared link's /<lang>/

// The short form (17 or 10 digits, 14 hex, a truncated 13-hex NTAG UID) and the
// long form (`TigerData` in any case, `_` or `-`, the digits). The length always
// decides: a UID may be all digits, but it is 14 characters long.
export function spoolIdFromPath(text) {
  const s = String(text || "").trim().replace(/\/+$/, "");
  let m = /^(?:tigerdata[_-])?(\d{17}|\d{10})$/i.exec(s);
  if (m) return "TigerData_" + m[1];
  if (HEX14.test(s)) return s.toUpperCase();
  if (/^4[0-9A-F]{12}$/i.test(s)) return "0" + s.toUpperCase();   // issue #146
  return null;
}

export function linkValues(params) {
  const get = name => { for (const [k, v] of params) if (k.toLowerCase() === name) return v; return null; };
  const w = get("weight"), n = get("note");
  const weight = w != null && /^\d{1,6}$/.test(w.trim()) ? Number(w.trim()) : null;   // the capacity is checked by the app
  const note = n != null && n.trim() && new TextEncoder().encode(n.trim()).length <= NOTE_MAX_BYTES ? n.trim() : null;
  return { weight, note };
}

export function parseQrLink(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : "https://" + s); } catch (_) { return null; }
  if (!/^https?:$/i.test(url.protocol) || url.hostname.toLowerCase() !== QR_HOST) return null;
  // A `.json` / `.ttag` ending asks for the answer for tools: the same spool or product.
  const raw = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "");
  const ext = /\.(json|ttag)$/i.exec(raw);
  const format = ext ? ext[1].toLowerCase() : "page";   // the link's ending, for the analytics
  const path = ext ? raw.slice(0, -ext[0].length) : raw;
  // A product: 10 digits = the decimal id_product as printed (productLink); 8
  // characters = the hex form of labels printed before 2026-11-11; any other
  // length of digits = a decimal typed by hand. 8 plain digits read both ways:
  // hex first (older labels), the decimal reading as `idProductDecimal`, for the
  // caller to try when the hex one is no known product (the server does the same).
  const bare = path.replace(LANG_PREFIX, "");   // a shared link carries the sharer's /<lang>/
  const p = /^p\/([0-9a-f]{1,10})$/i.exec(bare);
  if (p) {
    const x = p[1];
    if (x.length === 8) {
      const hex = { kind: "product", idProduct: parseInt(x, 16) };
      return /^\d{8}$/.test(x) ? { ...hex, idProductDecimal: Number(x), format } : { ...hex, format };
    }
    // 0 and 4294967295 mean "no product", read as such like their hex forms.
    if (/^\d{1,10}$/.test(x) && Number(x) <= 0xFFFFFFFF) return { kind: "product", idProduct: Number(x), format };
  }
  const id = spoolIdFromPath(bare);
  if (id) return { kind: "spool", id, ...linkValues(url.searchParams), format };
  return { kind: "newer", format };   // another shape: a label from a newer version
}
