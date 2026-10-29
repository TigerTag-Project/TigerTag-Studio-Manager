/**
 * rfid_protocol/linked — linked chips (spec: docs/LINKED-CHIPS.md).
 *
 * A third-party RFID chip (Bambu Lab, Creality… MIFARE Classic) that is not a
 * TigerTag is mapped to one spool of the inventory through
 * users/{uid}/rfidAliases/{UID_HEX} { spoolId, chip, vendor, linkedAt }. Scanning
 * it then opens that spool. Phase 1: Studio only.
 *
 *   initLinkedChips({ t, esc, state, fbDb, thumbHTML, gridCard, openDetail, setupHoldToConfirm,
 *                     toast, reportError, onChange, openCatalogue, openManual })
 *   linkedChipsSignIn(uid) / linkedChipsSignOut()   — follow the account's aliases
 *   onForeignChip({ readerName, uid, chip })        — a scan (buffered 1.5 s)
 *   linkPendingTo(spoolId) / clearPendingLink()     — after a creation started from the window
 *   openBlankChipWindow(n) / closeChipChoice()      — a blank NTAG: catalogue or manual (side card)
 *   openAddChooser()                                — the search bar's "+": the same card, no chip
 *   closeChipLink()                                 — the link grid side card
 *   linkedChipsHtml(row) / wireLinkedChips(root)    — the detail panel's section
 */

let ctx = null;
let accountUid = null;
let unsub = null;
const aliases = new Map();   // UID_HEX → { spoolId, chip, vendor }
const buffer = new Map();    // readerName → { uid, chip }
let bufferTimer = null;
let pending = null;          // { until } — the spool being created links the maker chips on the TigerPOD
let offer = null;            // {} — the link grid is up: spool cards offer to link the maker chips on the TigerPOD
let choiceKind = null;       // kind of the open chooser ("foreign" | "blank" | "add")

const UID_RE = /^[0-9A-F]{8,20}$/;
const norm = u => String(u || "").replace(/[^0-9a-f]/gi, "").toUpperCase();

export function initLinkedChips(c) { ctx = c; wireBrandColumn(); }

// The chooser's decorative brand column (.lc-brands, linked.css): a mouse that
// only brushes a logo still plays its whole effect — the logo is lit (.is-lit)
// on enter and goes out LIT_MS after the mouse has left; the column is awake
// (.is-awake, the tiger grows) the same way. CSS :hover alone dropped the effect
// the instant a fast sweep moved on.
const LIT_MS = 900;
function wireBrandColumn() {
  const col = document.querySelector("#chipChoicePanel .lc-brands");
  if (!col) return;
  const later = (el, cls) => { clearTimeout(el._litT); el._litT = setTimeout(() => el.classList.remove(cls), LIT_MS); };
  col.addEventListener("pointerover", e => {
    const b = e.target.closest(".lc-brand");
    if (b) { clearTimeout(b._litT); b.classList.add("is-lit"); }
  });
  col.addEventListener("pointerout", e => {
    const b = e.target.closest(".lc-brand");
    if (b && !b.contains(e.relatedTarget)) later(b, "is-lit");
  });
  col.addEventListener("pointerenter", () => { clearTimeout(col._litT); col.classList.add("is-awake"); });
  col.addEventListener("pointerleave", () => later(col, "is-awake"));
  // Garland: each time the card opens, the makers light up once, one after the
  // other top to bottom, with the very hover effect (.is-lit for LIT_MS) — one
  // pass, then it rests until the card is opened again. Skipped with reduced
  // motion; a logo the mouse is on is simply left lit.
  const makers = [...col.querySelectorAll('.lc-brand:not([data-brand="tigertag"])')];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let k = -1, wasOpen = false;   // k: next logo of the running pass, -1 = no pass
  const step = () => {
    const open = !!document.getElementById("chipChoicePanel")?.classList.contains("open");
    if (open && !wasOpen && !reduced.matches) k = 0;   // just opened: start a pass
    if (!open) k = -1;
    wasOpen = open;
    if (k >= 0) {
      const b = makers[k];
      if (!b.classList.contains("is-lit")) { b.classList.add("is-lit"); later(b, "is-lit"); }
      k = k + 1 < makers.length ? k + 1 : -1;
    }
    setTimeout(step, k >= 0 ? 1100 : 400);   // 1.1 s between logos; idle, a cheap check
  };
  step();
}

export function linkedChipsSignIn(uid) {
  linkedChipsSignOut();
  accountUid = uid;
  unsub = ctx.fbDb(uid).collection("users").doc(uid).collection("rfidAliases").onSnapshot(snap => {
    aliases.clear();
    snap.forEach(d => aliases.set(d.id, d.data()));
    ctx.onChange?.();
  }, e => ctx.reportError?.("linkedChips.subscribe", e));
}
export function linkedChipsSignOut() {
  try { unsub?.(); } catch (_) {}
  unsub = null; accountUid = null; aliases.clear(); buffer.clear(); pending = null; offer = null;
}

const ref = u => ctx.fbDb(accountUid).collection("users").doc(accountUid).collection("rfidAliases").doc(u);
const rowById = id => (ctx.state.rows || []).find(r => r.spoolId === id || r.uid === id) || null;
const twinOf = r => r?.twinUid ? rowById(String(r.twinUid)) : null;

// The doc a spool's chips point to (spec: "Which spool doc is the target").
function targetOf(row) {
  const twin = twinOf(row);
  if (!twin || twin.deleted) return row;
  if (row.tagIndex && twin.tagIndex && row.tagIndex !== twin.tagIndex) return row.tagIndex < twin.tagIndex ? row : twin;
  try { return BigInt(row.spoolId) <= BigInt(twin.spoolId) ? row : twin; } catch (_) { return row.spoolId <= twin.spoolId ? row : twin; }
}

// The live spool a chip leads to; a deleted target hands over to its twin (and
// the alias is rewritten), else the alias goes.
async function resolve(uid) {
  const a = aliases.get(uid);
  if (!a) return null;
  const row = rowById(a.spoolId);
  if (row && !row.deleted) return row;
  const twin = row ? twinOf(row) : null;
  try {
    if (twin && !twin.deleted) { await ref(uid).set({ ...a, spoolId: twin.spoolId }); return twin; }
    await ref(uid).delete();
  } catch (e) { ctx.reportError?.("linkedChips.resolve", e); }
  return null;
}

/** Every chip linked to this spool (its own doc and its twin's). */
export function linkedChipsOf(row) {
  if (!row) return [];
  const ids = new Set([row.spoolId, twinOf(row)?.spoolId].filter(Boolean));
  return [...aliases].filter(([, a]) => ids.has(a.spoolId)).map(([uid, a]) => ({ uid, ...a }));
}

// Every maker's chip seen this session (uid → chip type): with the chips on the
// TigerPOD (ctx.state.nfcCardPresent) it says which maker chips sit there now.
const makerUids = new Map();

export function onForeignChip({ readerName, uid, chip }, { held = false } = {}) {
  const u = norm(uid);
  if (UID_RE.test(u)) makerUids.set(u, chip || "unknown");
  if (!accountUid || !UID_RE.test(u)) return;
  buffer.set(readerName || "reader", { uid: u, chip: chip || "unknown" });
  bufferHeld = held;
  clearTimeout(bufferTimer);
  bufferTimer = setTimeout(flush, 1500);   // the TigerPOD's two readers see both flanges' chips together
}
let bufferHeld = false;

/** A maker's chip placed while the new-chip card is up (opened by "+"): nothing
 *  opens and nothing is added — the card switches to the maker-chip choices and
 *  the chip waits there, so what the card then creates is linked to it. A chip
 *  already linked to a spool is left alone. */
export function holdForeignChip(data) { onForeignChip(data, { held: true }); }

/** Maker chips waiting for the spool being created (the product card offers no
 *  burn while there are: such a chip is linked, never written). What counts is
 *  what sits on the TigerPOD NOW: chips swapped while the card is up replace the
 *  earlier ones, they are not added to them. */
export function pendingMakerChips() { return pending && Date.now() <= pending.until ? presentMakerChips().length : 0; }

/** The maker chips on the TigerPOD right now that no spool is linked to yet. */
export function presentMakerChips() {
  const on = [...(ctx.state?.nfcCardPresent?.values() || [])].map(c => norm(c?.uid));
  // A link to a spool that no longer exists (deleted before links went with
  // their spool) does not count: that chip is free again.
  const linked = u => aliases.has(u) && !!rowById(aliases.get(u).spoolId);
  return [...new Set(on)].filter(u => makerUids.has(u) && !linked(u)).map(u => ({ uid: u, chip: makerUids.get(u) }));
}

/** "Link the proprietary third-party Tag(s)" — the held banner shown instead of a
 *  burn when maker chips are there (a maker's chip is linked, never written). */
export function makerLinkBannerHtml(id, n) {
  const { t, esc } = ctx;
  return `
    <button type="button" class="chip-update-banner lc-offer-banner" id="${esc(id)}" data-hold-tip="linkedChipOfferTip">
      <span class="hold-progress" aria-hidden="true"></span>
      <span class="lc-offer-ic"><span class="icon icon-link icon-18" aria-hidden="true"></span></span>
      <span class="chip-update-text">${esc(n > 1 ? t("linkedChipOfferMany", { n }) : t("linkedChipOffer"))}</span>
      <span class="tool-info" data-tip="${esc(t("linkedChipOfferInfo"))}" aria-label="${esc(t("linkedChipOfferInfo"))}"><span class="icon icon-info icon-13"></span></span>
    </button>`;
}

/** Links the maker chips on the TigerPOD (unlinked ones) to an existing spool. */
export async function linkMakerChipsTo(spoolId) {
  const chips = presentMakerChips(), row = rowById(spoolId);
  if (!chips.length || !row) return false;
  try { await link(chips, row); ctx.toast?.(ctx.t("linkedChipDone")); return true; }
  catch (e) { ctx.reportError?.("linkedChips.linkMaker", e); ctx.toast?.(ctx.t("squadDealsErr")); return false; }
}

async function flush() {
  const chips = [...new Map([...buffer.values()].map(c => [c.uid, c])).values()];
  const held = bufferHeld;
  buffer.clear(); bufferHeld = false;
  if (!chips.length) return;
  // The card is up: the view the user is in stays as it is — its banners follow
  // what now sits on the TigerPOD (Link for a maker's chip, Burn for a blank).
  if (held) { ctx.chipsChanged?.(); return; }
  for (const c of chips) {
    const row = await resolve(c.uid);
    if (row) { if (!held) ctx.openDetail(row.spoolId, { animateSwap: true }); return; }
  }
  openLinkWindow(chips);
}

async function link(chips, row) {
  const target = targetOf(row);
  const at = firebase.firestore.FieldValue.serverTimestamp();
  const batch = ctx.fbDb(accountUid).batch();
  for (const c of chips) batch.set(ref(c.uid), { spoolId: target.spoolId, chip: c.chip || "unknown", vendor: "unknown", linkedAt: at });
  await batch.commit();
  for (const c of chips) aliases.set(c.uid, { spoolId: target.spoolId, chip: c.chip, vendor: "unknown" });
}

export async function unlinkChip(uid) {
  await ref(uid).delete();
  aliases.delete(uid);
}

// ── The new-chip window ─────────────────────────────────────────────────────
// Minimal on purpose: no UID, no chip type. One window for every chip that has
// nothing on it yet, opened BEFORE any creation panel:
//   • a maker's chip (MIFARE…): Catalogue / Manually / Link to my inventory —
//     the first two create a TigerData+ / TigerData and the chips are linked to
//     it when it is saved (linkPendingTo), the third picks an existing spool;
//   • a blank NTAG (TigerTag Init, empty NDEF): Catalogue / Manually — the
//     created spool is then offered for burning onto that chip, as before.

/** Called right after a chipless creation: links the waiting chips to it. */
export async function linkPendingTo(spoolId) {
  const p = pending;
  pending = null;
  if (!p || Date.now() > p.until || !accountUid) return false;
  const row = rowById(spoolId), chips = presentMakerChips();
  if (!row || !chips.length) return false;
  try { await link(chips, row); closeChipChoice(); ctx.toast?.(ctx.t("linkedChipDone")); return true; }
  catch (e) { ctx.reportError?.("linkedChips.linkPending", e); return false; }
}
/** A creation started anywhere else must not pick up chips left waiting. */
export function clearPendingLink() { pending = null; }

/** A blank NTAG (TigerTag Init / empty NDEF) was placed: ask what to make of it. */
export function openBlankChipWindow(count = 1) {
  if (!accountUid) return;
  openChipWindow(Array.from({ length: Math.max(1, count) }, () => ({})), "blank");
}

function openLinkWindow(chips) { openChipWindow(chips, "foreign"); }

/** The "+" of the search bar: the same card and the same choices as a blank
 *  chip — catalogue, manually, a TigerData / TigerData+ to burn onto a blank NTAG
 *  (TigerTag Init or empty NDEF), which turns it into a TigerTag / TigerTag+, or
 *  the chip eraser (rfid_protocol/eraser), during which a scan opens nothing. */
export function openAddChooser() {
  if (!accountUid) return;
  // Maker chips already on the TigerPOD and linked to nothing: the same choices
  // as one placed while the card is up, so what it creates is linked, not burned.
  const makers = presentMakerChips();
  if (makers.length) openChipWindow(makers, "foreign");
  else openChipWindow([], "add");
}

function openChipWindow(chips, kind) {
  const { t, esc } = ctx;
  const foreign = kind === "foreign";
  // ONE side card (#chipChoicePanel, inventory.html): a rail of square choices,
  // and the chosen view (catalogue pick, Add product or the link grid — 400 px)
  // in the pane beside it (embed).
  const el = document.getElementById("chipChoicePanel");
  if (!el) return;
  if (!el.classList.contains("open")) ctx.clearSide?.();
  closeChipLink();
  el.querySelector("#chipChoiceTitle").textContent = t("linkedChipTitle");
  const body = el.querySelector("#chipChoiceBody");
  el._lcClick && el.removeEventListener("click", el._lcClick);
  // ⓘ: the same hover bubble as the toolbox and the "+ Material" picker.
  const tile = (id, icon, label, tip, off = false) => `
    <button type="button" class="lc-choice${off ? " is-off" : ""}" data-lc-go="${id}"${off ? ' aria-disabled="true"' : ""}>
      <span class="tool-info" data-tip="${esc(tip)}" aria-label="${esc(tip)}"><span class="icon icon-info icon-13"></span></span>
      <span class="lc-choice-ic"><span class="icon icon-${icon} icon-32" aria-hidden="true"></span></span>
      <b>${esc(label)}</b>
    </button>`;
  ctx.hideTip?.();
  body.innerHTML = `<div class="lc-choices">${tile("catalogue", "search", t("linkedChipAddCatalogue"), t("linkedChipCatalogueTip"))}${tile("manual", "edit", t("linkedChipAddManual"), t("linkedChipManualTip"))}${tile("pick", "link", t("linkedChipExisting"), _pickTip(kind), _pickOff(kind))}${foreign ? "" : tile("erase", "recycle", t("chipEraserTitle"), t("chipEraserTip"))}</div>`;
  choiceKind = kind;
  body.classList.remove("lc-in"); void body.offsetWidth; body.classList.add("lc-in");

  const NEXT = { pick: "chipLinkPanel", catalogue: "catalogPickPanel", manual: "addProductPanel", erase: "chipEraserPanel" };
  const choose = to => {
    ctx.hideTip?.();
    // Into the pane BEFORE it opens: opened outside it, the card would count as
    // a neighbour for a frame and push the whole card left (_syncPanels).
    adopt(document.getElementById(NEXT[to]));
    if (to !== "erase") ctx.closeEraser?.();
    if (to === "pick") openChipLink(chips, kind);
    else if (to === "erase") {
      // Nothing is created here: no chip waits for a spool.
      closeChipLink();
      ctx.clearCreate?.();
      pending = null;
      ctx.openEraser?.();
    } else {
      closeChipLink();
      // Opening a creation panel clears any waiting chips, so set them after.
      if (to === "catalogue") ctx.openCatalogue(); else ctx.openManual();
      pending = foreign ? { until: Date.now() + 15 * 60e3 } : null;
    }
    embed(document.getElementById(NEXT[to]));
    // Last: closing the previous view clears the selected look.
    body.querySelectorAll(".lc-choice").forEach(x => x.classList.toggle("is-active", x.dataset.lcGo === to));
  };
  el._lcClick = e => {
    const b = e.target.closest("[data-lc-go]");
    if (!b) return;
    // Greyed "Link": say why, in the red bubble, right over its link icon.
    if (b.getAttribute("aria-disabled") === "true") {
      ctx.errorTip?.(b.querySelector(".lc-choice-ic") || b, ctx.t("linkedChipLinkNeedPod"), { img: "../assets/img/tigersquad/loot/tigerpod.webp" });
      return;
    }
    // The chosen view is already open: a second tap leaves it as it is (it
    // would otherwise be rebuilt and slide in again).
    if (b.classList.contains("is-active") && document.getElementById(NEXT[b.dataset.lcGo])?.classList.contains("open")) return;
    choose(b.dataset.lcGo);
  };
  el.addEventListener("click", el._lcClick);
  if (!body._lcTips) {
    body._lcTips = true;
    body.addEventListener("mouseover", e => { const i = e.target.closest?.(".tool-info"); if (i) ctx.showTip?.(i); });
    body.addEventListener("mouseout", e => { const i = e.target.closest?.(".tool-info"); if (i && !i.contains(e.relatedTarget)) ctx.hideTip?.(); });
    // The ⓘ sits inside the choice button: pressing it must not pick that choice.
    const swallow = e => { if (e.target.closest?.(".tool-info")) { e.stopPropagation(); e.preventDefault(); } };
    body.addEventListener("pointerdown", swallow, true);
    body.addEventListener("click", swallow, true);
  }
  el.classList.add("open");
  ctx.syncPanels?.();
  // Nine times out of ten the material is in the catalogue: open it straight
  // away; the other choices stay one tap away.
  choose("catalogue");
}

// Linking a TigerData / TigerData+ to a blank NTAG means burning it: without a
// chip on the TigerPOD there is nothing to burn onto, so "Link" waits, greyed.
// A maker's chip (foreign) is always there when its window opens.
function _pickOff(kind) { return kind !== "foreign" && !ctx.chipPresent?.(); }
function _pickTip(kind) {
  const { t } = ctx;
  if (kind === "foreign") return t("linkedChipLinkTip");
  return t(_pickOff(kind) ? "linkedChipLinkNeedTag" : "linkedChipLinkBlankTip");
}
/** A chip was placed on / taken off the TigerPOD: re-grey "Link" in place. */
export function refreshChipChoice() {
  const el = document.getElementById("chipChoicePanel");
  if (!el?.classList.contains("open") || !choiceKind || choiceKind === "foreign") return;
  const b = el.querySelector('[data-lc-go="pick"]');
  if (!b) return;
  const off = _pickOff(choiceKind), tip = _pickTip(choiceKind);
  b.classList.toggle("is-off", off);
  if (off) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled");
  const i = b.querySelector(".tool-info");
  if (i) { i.dataset.tip = tip; i.setAttribute("aria-label", tip); }
}

export function closeChipChoice() {
  const el = document.getElementById("chipChoicePanel");
  if (!el?.classList.contains("open")) return;
  ctx.hideTip?.();
  el.classList.remove("open");
  closeChipLink();
  ctx.closeEraser?.();
  ctx.clearCreate?.();
  // Hand the borrowed cards back once the card has slid out.
  setTimeout(() => { if (!el.classList.contains("open")) unembedAll(); }, 280);
  ctx.syncPanels?.();
  ctx.chipsChanged?.();   // the spool card left open gets back its upgrade offer
}

// ── The pane: the chosen card, borrowed ─────────────────────────────────────
// The catalogue pick, Add product and link grid stay the app's own cards (their
// ids, listeners and save logic untouched); while chosen, the element is moved
// into #chipChoicePane, where linked.css lays it out as the right half of the
// one card. It goes back to its own place when another view is chosen or the
// card closes.
const homes = new Map();   // element → { parent, next }
function embed(card) {
  const pane = document.getElementById("chipChoicePane");
  if (!card || !pane) return;
  // The new view slides in OVER the one shown, which is then dropped at once
  // behind it — its own slide-out would never be seen.
  const prev = [...pane.children].filter(c => c !== card);
  prev.forEach(c => c.classList.add("lc-leaving"));
  card.classList.remove("lc-leaving");
  adopt(card);
  // Every choice — even the one already shown — slides its view in from the right.
  // Parked off to the right first, and the slide started two frames later: a
  // view that builds a long list (the catalogue) would otherwise spend the
  // slide's first frames rendering and simply appear in place.
  card.classList.remove("lc-enter");
  card.classList.add("lc-pre");
  clearTimeout(card._lcEnterT);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    card.classList.remove("lc-pre");
    void card.offsetWidth;
    card.classList.add("lc-enter");
    card._lcEnterT = setTimeout(() => {
      prev.forEach(c => { if (c.classList.contains("lc-leaving")) { c.classList.remove("lc-leaving"); unembed(c); } });
      card.classList.remove("lc-enter");
    }, 300);
  }));
  // Inside the card there is no click-outside to catch: Add product's overlay
  // would only close it behind the user's back.
  document.getElementById("addProductOverlay")?.classList.remove("open");
  ctx.syncPanels?.();
}
function adopt(card) {
  const pane = document.getElementById("chipChoicePane");
  if (!card || !pane || card.parentElement === pane) return;
  homes.set(card, { parent: card.parentElement, next: card.nextSibling });
  pane.appendChild(card);
}
function unembed(card) {
  const h = homes.get(card);
  if (!h) return;
  card.classList.remove("lc-leaving", "lc-enter", "lc-pre");
  homes.delete(card);
  h.parent.insertBefore(card, h.next && h.next.parentElement === h.parent ? h.next : null);
}
function unembedAll() { for (const c of [...homes.keys()]) unembed(c); }

// ── The link grid (#chipLinkPanel) ──────────────────────────────────────────
// The materials that have no linked chip yet (a twin pair once).
// A maker's chip: the materials with no linked chip yet (linked by UID, the
// banner in their spool card). A blank NTAG: the chipless materials (TigerData /
// TigerData+) — their spool card's own "burn" banner writes them onto it.
function openChipLink(chips, kind = "foreign") {
  const { t, esc } = ctx;
  const el = document.getElementById("chipLinkPanel");
  if (!el) return;
  ctx.clearCreate?.();
  el.querySelector("#chipLinkTitle").textContent = t("linkedChipExisting");
  const body = el.querySelector("#chipLinkBody");
  body.innerHTML = `<div class="lc-filters">
      <span class="lc-qbox"><input type="text" data-lc-q placeholder="${esc(t("linkedChipSearch"))}"><button type="button" class="inv-search-clear" data-lc-qclear hidden aria-label="${esc(t("clearSearch"))}"><span class="icon icon-close icon-13" aria-hidden="true"></span></button><span class="icon icon-search icon-13" aria-hidden="true"></span></span>
    </div>
    <div class="lc-filters lc-filters--selects">
      <select data-lc-brand data-csel-short="thBrand"></select>
      <select data-lc-material data-csel-short="filterShortMaterial"></select>
      <select data-lc-tag data-csel-short="filterShortTag"></select>
    </div>
    <div class="lc-grid" data-lc-list></div>`;
  // Read from the live inventory on every search: a tag (or anything else)
  // edited while the grid is open is found at the next keystroke.
  const eligible = () => {
    const seen = new Set();
    return (ctx.state.rows || []).filter(r => !r.deleted && !r.isFriend).filter(r => {
      const tw = twinOf(r);
      const key = tw ? [r.spoolId, tw.spoolId].sort().join("|") : r.spoolId;
      if (seen.has(key)) return false;
      seen.add(key); return kind === "foreign" ? !linkedChipsOf(r).length : !!r.isCloud;
    });
  };
  const spools = eligible();
  // Searched: brand, material, colour name and the spool's own tags (a tag
  // "customer" finds every spool carrying it).
  const text = r => [r.brand, r.material, r.colorName, ...(r.tags || [])].filter(s => s && s !== "-").join(" ").toLowerCase();
  const list = body.querySelector("[data-lc-list]");
  // Brand, material and tag filters: what these materials carry, each value with
  // its count (a tag once per spool). Compared without case, as the inventory's
  // own filters are. The tag filter is always there, even while no spool has a tag.
  const norm = s => String(s ?? "").trim().toLowerCase();
  const filterOf = (attr, allKey, valuesOf) => {
    const sel = body.querySelector(`[data-${attr}]`);
    const tally = new Map();   // lowercase → { label (first casing seen), n }
    for (const r of spools) {
      const seen = new Set();
      for (const v of valuesOf(r)) {
        const k = norm(v);
        if (!k || k === "-" || seen.has(k)) continue;
        seen.add(k);
        const e = tally.get(k) || { label: String(v).trim(), n: 0 };
        e.n++; tally.set(k, e);
      }
    }
    sel.innerHTML = `<option value="">${esc(t(allKey))}</option>` +
      [...tally.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
        .map(e => `<option value="${esc(e.label)}">${esc(e.label)} (${e.n})</option>`).join("");
    ctx.enhanceSelect?.(sel);
    return sel;
  };
  const brandSel = filterOf("lc-brand", "filterAllBrands", r => [r.brand]);
  const materialSel = filterOf("lc-material", "filterAllMaterials", r => [r.material]);
  const tagSel = filterOf("lc-tag", "filterAllTags", r => r.tags || []);
  const qInput = body.querySelector("[data-lc-q]");
  const paint = () => {
    const words = qInput.value.toLowerCase().split(/\s+/).filter(Boolean);
    const brand = norm(brandSel.value), material = norm(materialSel.value), tag = norm(tagSel.value);
    const rows = eligible().filter(r => (!brand || norm(r.brand) === brand) && (!material || norm(r.material) === material)
      && (!tag || (r.tags || []).some(x => norm(x) === tag)) && words.every(w => text(r).includes(w))).slice(0, 200);
    // The inventory grid's own cards (ctx.gridCard / ctx.groupCard), grouped the
    // same way: identical copies are ONE deck card, as in the inventory.
    const items = ctx.groupItems ? ctx.groupItems(rows) : rows.map(row => ({ type: "single", row }));
    // Surgical (.agents/rules/surgical-dom-updates.md): each card is keyed; a card
    // still found is KEPT as it is (no rebuild, its photo stays), the ones gone
    // are removed and the new ones inserted, in the result's order. A keystroke
    // that finds the same spools touches nothing; one that narrows the list only
    // removes cards — the full rebuild used to make every card blink.
    const keyOf = it => it.type === "group" ? `g:${it.key}:${it.members?.length ?? ""}` : `s:${it.row.spoolId}`;
    const cardHtml = it => it.type === "group"
      ? `<div class="spool-card group-card lc-spool" role="button" tabindex="0" data-lc-key="${esc(keyOf(it))}" data-lc-group="${esc(it.key)}">${ctx.groupCard(it)}</div>`
      : `<div class="spool-card lc-spool" role="button" tabindex="0" data-lc-key="${esc(keyOf(it))}" data-lc-spool="${esc(it.row.spoolId)}">${ctx.gridCard(it.row)}</div>`;
    const have = new Map([...list.querySelectorAll(":scope > .lc-spool")].map(el => [el.dataset.lcKey, el]));
    list.querySelector(":scope > .lc-grid-empty")?.remove();
    const next = items.map(it => {
      const k = keyOf(it), kept = have.get(k);
      if (kept) { have.delete(k); return kept; }
      const tpl = document.createElement("template");
      tpl.innerHTML = cardHtml(it).trim();
      return tpl.content.firstElementChild;
    });
    have.forEach(el => el.remove());
    next.forEach((el, i) => { if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null); });
    if (!rows.length) list.insertAdjacentHTML("beforeend", `<p class="lc-grid-empty">${esc(t("linkedChipNone"))}</p>`);
  };
  paint();
  qInput.addEventListener("input", paint);
  wireSearchBox(body);
  [brandSel, materialSel, tagSel].forEach(sel => sel.addEventListener("change", paint));
  // A tap opens the material exactly as a tap in the inventory does (its spool
  // card, and its group deck when it has copies); the spool card then carries a
  // "Link the detected chips" banner (linkOfferHtml) — the link is made there,
  // on purpose, never by the tap itself.
  list.addEventListener("click", e => {
    const b = e.target.closest("[data-lc-spool], [data-lc-group]");
    if (!b) return;
    list.querySelectorAll(".lc-spool.is-selected").forEach(x => x.classList.remove("is-selected"));
    b.classList.add("is-selected");
    // A deck opens its group card (pick the copy there), a single its spool card.
    if (b.dataset.lcGroup) ctx.openGroup?.(b.dataset.lcGroup);
    else ctx.openSpool?.(b.dataset.lcSpool);
  });
  offer = kind === "foreign" ? {} : null;
  el.classList.add("open");
  ctx.syncPanels?.();
  setTimeout(() => body.querySelector("[data-lc-q]")?.focus(), 80);
}

/** A search pill (.lc-qbox): the magnifier on the right turns into a clear ✕
 *  while there is text. Shared with the catalogue pick card. */
export function wireSearchBox(root) {
  root.querySelectorAll(".lc-qbox").forEach(box => {
    if (box._lcWired) return;
    box._lcWired = true;
    const input = box.querySelector("input"), clear = box.querySelector("[data-lc-qclear]");
    const sync = () => { clear.hidden = !input.value; };
    input.addEventListener("input", sync);
    clear.addEventListener("click", () => { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus(); });
    sync();
  });
}

/** The spool card's banner while the link grid is up (a material without
 *  linked chips): the whole banner is the button — held 1.5 s, with the
 *  .hold-progress fill, it links the detected chips to this material. */
export function linkOfferHtml(row) {
  // The maker chips on the TigerPOD now — none (a blank NTAG put there instead):
  // no Link offer, the card falls back to its own banner (the burn).
  const n = offer ? presentMakerChips().length : 0;
  if (!n || !row || row.deleted || row.isFriend || linkedChipsOf(row).length) return "";
  const { t, esc } = ctx;
  return `
    <button type="button" class="chip-update-banner lc-offer-banner" id="lcOfferBanner" data-lc-offer="${esc(row.spoolId)}" data-hold-tip="linkedChipOfferTip">
      <span class="hold-progress" aria-hidden="true"></span>
      <span class="lc-offer-ic"><span class="icon icon-link icon-18" aria-hidden="true"></span></span>
      <span class="chip-update-text">${esc(n > 1 ? t("linkedChipOfferMany", { n }) : t("linkedChipOffer"))}</span>
      <span class="tool-info" data-tip="${esc(t("linkedChipOfferInfo"))}" aria-label="${esc(t("linkedChipOfferInfo"))}"><span class="icon icon-info icon-13"></span></span>
    </button>`;
}
export function wireLinkOffer(root) {
  const btn = root?.querySelector("[data-lc-offer]");
  if (!btn || btn._lcWired) return;
  btn._lcWired = true;
  // The ⓘ explains, it never starts the hold.
  const info = btn.querySelector(".tool-info");
  if (info) {
    info.addEventListener("mouseenter", () => ctx.showTip?.(info));
    info.addEventListener("mouseleave", () => ctx.hideTip?.());
    for (const ev of ["pointerdown", "mousedown", "touchstart", "click"]) info.addEventListener(ev, e => { e.stopPropagation(); e.preventDefault(); });
  }
  ctx.setupHoldToConfirm(btn, 1500, async () => {
    const row = rowById(btn.dataset.lcOffer), chips = presentMakerChips();
    if (!offer || !row || !chips.length) return;
    try {
      await link(chips, row);
      // Done: every side card closes, then the linked material's card opens alone.
      closeChipChoice();
      ctx.closeAllSide?.();
      ctx.toast?.(ctx.t("linkedChipDone"));
      setTimeout(() => ctx.openDetail(row.spoolId), 280);
    } catch (err) {
      ctx.reportError?.("linkedChips.link", err);
      ctx.toast?.(ctx.t("squadDealsErr"));
    }
  }, { hint: true });
}

export function closeChipLink() {
  offer = null;
  const el = document.getElementById("chipLinkPanel");
  if (!el?.classList.contains("open")) return;
  el.classList.remove("open");
  document.querySelectorAll("#chipChoiceBody .lc-choice.is-active").forEach(x => x.classList.remove("is-active"));
  ctx.syncPanels?.();
}

// ── Detail panel section ────────────────────────────────────────────────────
export function linkedChipsHtml(row) {
  const { t, esc } = ctx;
  const chips = linkedChipsOf(row);
  if (!chips.length) return "";
  // The chips of one material go together (both flanges of a spool): one held
  // button unlinks them all — never one chip on its own.
  return `
    <div class="lc-section">
      <div class="lc-section-h"><span class="icon icon-nfc icon-13" aria-hidden="true"></span>${esc(t("linkedChipsTitle"))}</div>
      <div class="lc-linked">
        <span class="lc-linked-uids">${chips.map(c => `<code>${esc(c.uid)}</code>`).join("")}</span>
        <button type="button" class="lc-unlink" data-lc-unlink="${esc(chips.map(c => c.uid).join(","))}" data-hold-tip="linkedChipUnlinkTip">
          <span class="hold-progress" aria-hidden="true"></span><span>${esc(t("linkedChipUnlink"))}</span>
        </button>
      </div>
    </div>`;
}

export function wireLinkedChips(root) {
  root?.querySelectorAll("[data-lc-unlink]").forEach(b => {
    if (b._lcWired) return;
    b._lcWired = true;
    ctx.setupHoldToConfirm(b, 1200, async () => {
      try {
        const uids = b.dataset.lcUnlink.split(",").filter(Boolean);
        const batch = ctx.fbDb(accountUid).batch();
        uids.forEach(u => batch.delete(ref(u)));
        await batch.commit();
        uids.forEach(u => aliases.delete(u));
        b.closest(".lc-section")?.remove();
        ctx.onChange?.();
      } catch (e) { ctx.reportError?.("linkedChips.unlink", e); ctx.toast?.(ctx.t("squadDealsErr")); }
    }, { hint: true });
  });
}
