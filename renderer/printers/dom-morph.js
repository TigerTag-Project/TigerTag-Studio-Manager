/**
 * printers/dom-morph.js — in-place DOM reconciler for live printer cards.
 *
 * Why: every brand re-renders its live block from an HTML string on each
 * incoming telemetry message. Doing `host.innerHTML = html` tears the whole
 * subtree down and rebuilds it, which:
 *   • closes any open inline editor / <select> and drops keyboard focus,
 *   • resets scroll position,
 *   • repaints the whole card (visible flicker).
 *
 * morphInner() diffs the freshly-rendered HTML against the live DOM and mutates
 * only what actually changed (text nodes + attributes). Stable nodes are kept,
 * so focus, open editors, <select> state and scroll all survive and there's no
 * flicker. Crucially, any element the user is currently interacting with —
 * focus inside it, or an open inline editor (`.snap-temp--editing`) — is left
 * completely untouched, so an incoming MQTT message can never close an edit.
 *
 * Drop-in: replace `host.innerHTML = render()` with `morphInner(host, render())`.
 * The render functions stay exactly as they are.
 */

/** Reconcile `host`'s children to match `html`, mutating in place. */
export function morphInner(host, html) {
  if (!host) return;
  // First paint (or an emptied host) — nothing to diff against, just set it.
  if (!host.firstChild) { host.innerHTML = html; return; }
  const tmp = document.createElement(host.tagName);
  tmp.innerHTML = html;
  _morphChildren(host, tmp);
}

function _morphChildren(oldParent, newParent) {
  const oldNodes = Array.from(oldParent.childNodes);
  const newNodes = Array.from(newParent.childNodes);
  const n = Math.max(oldNodes.length, newNodes.length);
  for (let i = 0; i < n; i++) {
    const o = oldNodes[i];
    const w = newNodes[i];
    if (!w) { if (o) o.remove(); continue; }       // removed tail node
    if (!o) { oldParent.appendChild(w); continue; } // new tail node (moves w in)
    _morphNode(o, w, oldParent);
  }
}

function _morphNode(o, w, parent) {
  // Different node kind, or different element tag → replace outright.
  if (o.nodeType !== w.nodeType || (o.nodeType === 1 && o.nodeName !== w.nodeName)) {
    parent.replaceChild(w, o);
    return;
  }
  // Text (3) / comment (8) — update the value only when it changed.
  if (o.nodeType === 3 || o.nodeType === 8) {
    if (o.nodeValue !== w.nodeValue) o.nodeValue = w.nodeValue;
    return;
  }
  if (o.nodeType !== 1) return; // anything else (rare) — leave as-is
  // Leave alone only what the user is actively EDITING: an open inline editor
  // (`.snap-temp--editing`) or a focused form control (input / select being
  // changed / textarea / contenteditable). A merely-focused <button> must NOT
  // freeze its container — otherwise clicking e.g. the LED button keeps focus
  // on it and the card stops refreshing until you click elsewhere.
  if (_isEditing(o)) return;
  _morphAttrs(o, w);
  _morphChildren(o, w);
}

// True when `node` is, or contains, something the user is actively editing:
// an open inline editor, or a focused input / select / textarea / contenteditable.
// A focused <button> deliberately does NOT count — it must not freeze the card.
function _isEditing(node) {
  if (node.classList && node.classList.contains("snap-temp--editing")) return true;
  const ae = document.activeElement;
  if (!ae || ae === document.body || !node.contains(ae)) return false;
  const tag = ae.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || ae.isContentEditable;
}

function _morphAttrs(o, w) {
  const oa = o.attributes;
  for (let i = oa.length - 1; i >= 0; i--) {
    if (!w.hasAttribute(oa[i].name)) o.removeAttribute(oa[i].name);
  }
  const wa = w.attributes;
  for (let i = 0; i < wa.length; i++) {
    const a = wa[i];
    if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  }
}
