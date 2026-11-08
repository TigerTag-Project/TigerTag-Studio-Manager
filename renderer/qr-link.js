/**
 * renderer/qr-link.js — the QR links of TigerSystem-Docs
 * docs/developers/spool-ids-and-qr-links.md: writing them (§3 spool, §5
 * product) and reading them back offline (§3 "Reading a link back", §4 values).
 * No dependency: imported by the app (inventory.js) and the labels
 * (labels/index.js).
 *
 *   spoolLink(spoolId)        — https://qr.tigertag.io/<id>, lowercase; null when not printable
 *   productLink(idProduct)    — https://qr.tigertag.io/p/<8 hex>; null without a real id
 *   spoolIdFromPath(text)     — a spool id in any accepted form → its doc id; null otherwise
 *   parseQrLink(text)         — a qr.tigertag.io link → { kind: "spool", id, weight, note }
 *                               | { kind: "product", idProduct } | { kind: "newer" } ; null
 *                               when the text is not such a link
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
  return `https://${QR_HOST}/p/` + (n >>> 0).toString(16).padStart(8, "0");
}

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
  const path = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "").replace(/\.(json|ttag)$/i, "");
  const p = /^p\/([0-9a-f]{8})$/i.exec(path);
  if (p) return { kind: "product", idProduct: parseInt(p[1], 16) };
  const id = spoolIdFromPath(path);
  if (id) return { kind: "spool", id, ...linkValues(url.searchParams) };
  return { kind: "newer" };   // another shape: a label from a newer version
}
