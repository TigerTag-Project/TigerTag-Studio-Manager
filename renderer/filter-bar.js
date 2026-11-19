/* The filter bar — ONE search field holding filter chips, the Shopify admin
   pattern (Polaris "Filters"), as Atome3D's Galaxy does it. The chips are written
   in the field, before the text. A click in the field (or its Filter button, or
   ↓) lists the fields; typing searches as before and narrows that list, and a
   field's name then Enter adds it. A click on a chip reopens its editor, its
   cross removes it.

   The model is plain data and owned by the host (renderer/inventory.js):
     condition = { field, op, values }
       op "is" / "isNot" — values: the reference-table IDs (as strings) kept or
                           excluded; several values = OR inside the chip
       op "between"      — values: [min | null, max | null]
   Chips combine with AND. One chip per field. Applied as soon as they change —
   there is no Apply button.

   The host describes its fields (`fields()`), reads and writes the condition
   list (`conds()` / `setConds()`), and may add chips it edits itself
   (`extraChips()`: the colour search, the colour bars). `onFieldTyped()`, when
   given, is told a field was added by typing its name then Enter (a trophy). This module only draws
   and edits; it never filters anything. The look is the app's own dropdown
   (`.csel-pop` / `.csel-opt` / `.csel-search`) and the colour chip
   (`.cv-color-chip`), so nothing here is a new style of control. */

const FILTER_FROM = 8;   // a search field in a list only when it is long enough to need one
const flat = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function mountFilterBar(o) {
  const { bar, input, searchBox, t, esc } = o;
  let pending = null;      // a chip being created: shown, not applied until it holds a value
  let pop = null, popSlot = null, popField = null, cursor = -1;
  let lastSig = "";

  const fieldById = id => o.fields().find(f => f.id === id) || null;
  const condFor = id => (pending && pending.field === id) ? pending : o.conds().find(c => c.field === id) || null;

  // ── Chips ──────────────────────────────────────────────────────────────
  function chipText(f, c) {
    if (f.kind === "range") {
      const [a, b] = c.values, u = f.unit ? " " + f.unit : "";
      const v = a != null && b != null ? `${a}–${b}${u}` : a != null ? `≥ ${a}${u}` : `≤ ${b}${u}`;
      return `${f.label} ${v}`;
    }
    if (!c.values.length) return t(c.op === "isNot" ? "fbChipIsNot" : "fbChipIs", { field: f.label, values: "…" });
    const names = c.values.slice(0, 2).map(v => f.labelOf(v));
    const more = c.values.length > 2 ? ` +${c.values.length - 2}` : "";
    return t(c.op === "isNot" ? "fbChipIsNot" : "fbChipIs", { field: f.label, values: names.join(", ") + more });
  }
  const chipHTML = (key, text, swatch, editable) =>
    `<span class="csel fb-slot" data-fb="${esc(key)}"><span class="cv-color-chip fb-chip${pending && pending.field === key ? " is-pending" : ""}">`
    + (editable
      ? `<button type="button" class="cv-color-chip-main" data-fb-edit aria-label="${esc(text)}">`
      : `<span class="cv-color-chip-main">`)
    + (swatch ? `<span class="cv-color-chip-swatch" style="background:${esc(swatch)}" aria-hidden="true"></span>` : "")
    + `<span class="cv-color-chip-text">${esc(text)}</span>`
    + (editable ? `</button>` : `</span>`)
    + `<button type="button" class="cv-color-chip-x" data-fb-x aria-label="${esc(t("fbRemove"))}">`
    + `<span class="icon icon-close icon-12" aria-hidden="true"></span></button></span></span>`;

  function render() {
    const extras = o.extraChips?.() || [];
    const list = o.conds().slice();
    if (pending && !list.some(c => c.field === pending.field)) list.push(pending);
    const parts = [];
    extras.forEach(x => parts.push(chipHTML("x:" + x.key, x.text, x.swatch, !!x.onEdit)));
    list.forEach(c => { const f = fieldById(c.field); if (f) parts.push(chipHTML(c.field, chipText(f, c), null, true)); });
    const html = parts.join("");
    bar.hidden = !o.active();
    if (o.addBtn) o.addBtn.hidden = !o.active();
    if (html === lastSig) return;          // nothing changed: leave the DOM alone
    lastSig = html;
    const keep = pop && popSlot && popSlot !== searchBox ? popSlot.dataset.fb : null;
    bar.innerHTML = html;
    // An open editor stays (it lives in the field, not in the strip): it only
    // follows its chip, which may have moved.
    if (keep) {
      popSlot = bar.querySelector(`[data-fb="${CSS.escape(keep)}"]`);
      if (popSlot) place(); else close();
    }
  }

  // ── Popups ─────────────────────────────────────────────────────────────
  // `keep`: the popup goes but a chip still being created stays (another popup
  // is about to open).
  function close(keep = false) {
    if (pop) {
      pop.remove(); pop = null;
      o.registry?.delete(close);
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
    }
    popSlot = null; popField = null; cursor = -1;
    if (!keep && pending) { pending = null; render(); }
  }
  // `key`: the chip slot to hang the popup on ("search" = under the text cursor).
  function open(key, html, field = null) {
    close(true);
    if (pending && pending.field !== field) { pending = null; render(); }
    const slot = key === "search" ? searchBox : bar.querySelector(`[data-fb="${CSS.escape(key)}"]`);
    if (!slot) return;
    o.registry?.forEach(c => c());      // the app's own dropdowns go first
    pop = document.createElement("div");
    pop.className = "csel-pop fb-pop";
    pop.innerHTML = html;
    // Every popup hangs in the field: the chips' strip scrolls, and a scroller
    // clips what is positioned inside it.
    searchBox.appendChild(pop);
    popSlot = slot; popField = field;
    place();
    o.registry?.add(close);
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    pop.querySelector(".csel-search, .fb-num")?.focus();
  }
  // Under its chip (the field list: under the text cursor), kept inside
  // the card that would clip it.
  function place() {
    if (!pop) return;
    let left = 0;
    if (popSlot !== searchBox) {
      // Bring the chip into the strip's view by scrolling the strip alone
      // (scrollIntoView would scroll every ancestor, the view with it).
      const b = bar.getBoundingClientRect(), r = popSlot.getBoundingClientRect();
      if (r.left < b.left) bar.scrollLeft -= b.left - r.left;
      else if (r.right > b.right) bar.scrollLeft += r.right - b.right;
      left = popSlot.getBoundingClientRect().left - searchBox.getBoundingClientRect().left;
    } else {
      // The field list opens under the text cursor: where the text starts, plus
      // what is typed before the caret (measured in the field's own font).
      const ctx = (place.ctx ||= document.createElement("canvas").getContext("2d"));
      ctx.font = getComputedStyle(input).font;
      const pad = parseFloat(getComputedStyle(input).paddingLeft) || 0;
      const typed = ctx.measureText(input.value.slice(0, input.selectionStart ?? input.value.length)).width;
      left = input.getBoundingClientRect().left - searchBox.getBoundingClientRect().left
           + pad + Math.min(typed - input.scrollLeft, input.clientWidth - pad);
    }
    pop.style.left = Math.max(0, left) + "px";
    const host = searchBox.closest("#card-inv") || document.body;
    const over = pop.getBoundingClientRect().right - (host.getBoundingClientRect().right - 4);
    if (over > 0) pop.style.left = Math.max(0, left - over) + "px";
  }
  // A press on a chip is the bar's own click to handle (another chip, the same
  // chip's toggle): closing here would rebuild the chips under the pointer. The
  // text and the Filter button keep the field list open.
  function onOutside(e) {
    if (!pop || pop.contains(e.target) || bar.contains(e.target)) return;
    if (popSlot === searchBox && (e.target === input || e.target === searchBox || o.addBtn?.contains(e.target))) return;
    close();
  }
  const visibleOpts = () => pop ? [...pop.querySelectorAll(".csel-opt")].filter(x => !x.hidden) : [];
  function moveCursor(i) {
    const opts = visibleOpts();
    pop.querySelectorAll(".is-cursor").forEach(x => x.classList.remove("is-cursor"));
    if (!opts.length) { cursor = -1; return; }
    cursor = Math.max(0, Math.min(opts.length - 1, i));
    opts[cursor].classList.add("is-cursor");
    opts[cursor].scrollIntoView({ block: "nearest" });
  }
  function onKey(e) {
    if (!pop) return;
    // Escape closes the popup and nothing else: the app's own Escape cascade
    // (side cards, panels) must not also fire.
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); const back = popSlot === searchBox; close(); if (back) input.focus(); return; }
    if (popSlot === searchBox && e.target === input) return;   // the field list follows the field's own keys (below)
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); moveCursor(cursor + (e.key === "ArrowDown" ? 1 : -1)); }
    else if (e.key === "Enter" && !e.target.classList?.contains("fb-num")) {
      e.preventDefault(); (visibleOpts()[cursor] || visibleOpts()[0])?.click();
    }
  }
  const searchHead = n => n >= FILTER_FROM
    ? `<input type="search" class="csel-search" placeholder="${esc(t("searchShort"))}" aria-label="${esc(t("searchShort"))}">` : "";
  function wireSearch() {
    const s = pop?.querySelector(".csel-search");
    s?.addEventListener("input", () => {
      const q = flat(s.value).trim();
      pop.querySelectorAll(".csel-opt").forEach(x => { x.hidden = !!q && !flat(x.dataset.label || x.textContent).includes(q); });
      moveCursor(0);
    });
  }

  // The field list, under the text cursor (Galaxy / Shopify admin): opened by a
  // click in the field, the Filter button or ↓; the text typed narrows it, its
  // first row keeping that text as a plain search. A field already in use
  // reopens its chip.
  function matchingFields(q) {
    const s = flat(q).trim();
    if (!s) return o.fields();
    if (s.length < 2 || /\s/.test(s)) return [];
    return o.fields().filter(f => flat(f.label).startsWith(s));
  }
  function openMenu() {
    if (!o.active()) return;
    const q = input.value.trim();
    const fields = matchingFields(q);
    if (q && !fields.length) { if (popSlot === searchBox) close(); return; }
    const used = new Set(o.conds().map(c => c.field));
    const html = `<div class="csel-pop-list">`
      + (q ? `<button type="button" class="csel-opt" data-fb-text>${esc(t("fbSearchFor", { q }))}</button>` : "")
      + (fields.length
        ? fields.map(f => `<button type="button" class="csel-opt${used.has(f.id) ? " is-sel" : ""}" data-field="${esc(f.id)}">`
            + `${esc(q ? t("fbFilterBy", { field: f.label }) : f.label)}</button>`).join("")
        : `<div class="fb-empty">${esc(t("fbNothing"))}</div>`) + `</div>`;
    cursor = -1;
    if (popSlot === searchBox && pop) { pop.innerHTML = html; place(); return; }
    open("search", html);
    if (!pop) return;
    pop.addEventListener("click", e => {
      if (e.target.closest("[data-fb-text]")) { close(); input.focus(); return; }
      const b = e.target.closest("[data-field]");
      if (b) pickField(b.dataset.field);
    });
  }
  // A field picked from the list: the text that named it goes, its chip opens.
  function pickField(id) {
    close();
    if (input.value && matchingFields(input.value).some(f => f.id === id)) {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));   // the host clears its search the usual way
    }
    editField(id);
  }

  // Open a field's editor; a new field gets a pending chip first.
  function editField(id) {
    const f = fieldById(id);
    if (!f) return;
    if (!o.conds().some(c => c.field === id) && pending?.field !== id) {
      close(true);
      pending = { field: id, op: f.kind === "range" ? "between" : "is", values: f.kind === "range" ? [null, null] : [] };
      render();
    }
    if (f.kind === "range") openRange(f); else openValues(f);
  }

  function commit(c) {
    const others = o.conds().filter(x => x.field !== c.field);
    const empty = c.op === "between" ? c.values.every(v => v == null) : !c.values.length;
    if (empty) {
      // Emptied: the chip stays (pending) while its editor is open, so the user
      // can pick again without starting over.
      pending = { ...c, values: c.op === "between" ? [null, null] : [] };
      o.setConds(others);
    } else {
      pending = null;
      o.setConds([...others, { field: c.field, op: c.op, values: c.values.slice() }]);
    }
    render();
  }

  function openValues(f) {
    const c = condFor(f.id);
    if (!c) return;
    const opts = f.options();
    const sel = new Set(c.values);
    // Nothing to tick: no is / is not switch either.
    const head = (f.neg && opts.length ? `<div class="fb-op" role="group">`
        + ["is", "isNot"].map(op => `<button type="button" class="fb-op-btn${c.op === op ? " is-on" : ""}" data-op="${op}" aria-pressed="${c.op === op}">${esc(t(op === "is" ? "fbIs" : "fbIsNot"))}</button>`).join("")
        + `</div>` : "") + searchHead(opts.length);
    open(f.id,
      (head ? `<div class="csel-pop-head fb-head">${head}</div>` : "")
      + `<div class="csel-pop-list">` + (opts.length ? opts.map(x =>
        `<button type="button" class="csel-opt fb-opt${sel.has(x.value) ? " is-sel" : ""}" data-v="${esc(x.value)}" data-label="${esc(x.label)}" role="menuitemcheckbox" aria-checked="${sel.has(x.value)}">`
        + `<span class="fb-check" aria-hidden="true"></span>`
        + (x.swatch ? `<span class="cv-color-chip-swatch" style="background:${esc(x.swatch)}" aria-hidden="true"></span>` : "")
        + `<span class="fb-opt-label">${esc(x.label)}</span>`
        + (x.count != null ? `<span class="fb-count">${x.count}</span>` : "") + `</button>`).join("")
        : `<div class="fb-empty">${esc(t("fbNothing"))}</div>`) + `</div>`, f.id);
    if (!pop) return;
    wireSearch();
    pop.addEventListener("click", e => {
      const cur = condFor(f.id) || { field: f.id, op: "is", values: [] };
      const opBtn = e.target.closest("[data-op]");
      if (opBtn) {
        pop.querySelectorAll("[data-op]").forEach(b => { const on = b === opBtn; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
        commit({ ...cur, op: opBtn.dataset.op });
        return;
      }
      const b = e.target.closest("[data-v]");
      if (!b) return;
      const v = b.dataset.v;
      const values = cur.values.includes(v) ? cur.values.filter(x => x !== v) : [...cur.values, v];
      b.classList.toggle("is-sel", values.includes(v));
      b.setAttribute("aria-checked", values.includes(v));
      commit({ ...cur, values });
    });
  }

  function openRange(f) {
    const c = condFor(f.id);
    if (!c) return;
    const num = (k, i) => `<label class="fb-range-field"><span>${esc(t(k))}</span>`
      + `<input type="number" min="0" inputmode="numeric" class="csel-search fb-num" data-i="${i}" value="${c.values[i] ?? ""}"></label>`;
    open(f.id, `<div class="fb-range">${num("fbMin", 0)}<span class="fb-range-sep">–</span>${num("fbMax", 1)}`
      + (f.unit ? `<span class="fb-range-unit">${esc(f.unit)}</span>` : "") + `</div>`, f.id);
    if (!pop) return;
    // Read from this popup even once it is closed: a number typed just before a
    // click elsewhere still lands.
    const box = pop;
    let timer = null;
    box.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const vals = [...box.querySelectorAll(".fb-num")].map(i => i.value.trim() === "" ? null : Math.max(0, Number(i.value)));
        commit({ field: f.id, op: "between", values: vals.map(v => Number.isFinite(v) ? v : null) });
      }, 250);
    });
    box.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); close(); } });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────
  bar.addEventListener("click", e => {
    // A click inside a popup is the popup's own — including one that just
    // replaced the popup it came from (picking a field opens its editor), whose
    // target is no longer in the page.
    if (!e.target.isConnected || pop?.contains(e.target)) return;
    const slot = e.target.closest(".fb-slot");
    if (!slot) { close(); return; }
    const key = slot.dataset.fb;
    if (key.startsWith("x:")) {
      const x = (o.extraChips?.() || []).find(c => "x:" + c.key === key);
      if (e.target.closest("[data-fb-x]")) x?.onRemove(); else if (e.target.closest("[data-fb-edit]")) x?.onEdit?.();
      return;
    }
    if (e.target.closest("[data-fb-x]")) {
      if (pending?.field === key) pending = null;
      close();
      o.setConds(o.conds().filter(c => c.field !== key));
      render();
      return;
    }
    if (e.target.closest("[data-fb-edit]")) { pop && popField === key ? close() : editField(key); }
  });

  // The field itself. A click (or the Filter button, or ↓) lists the fields;
  // typing narrows the list; Enter adds the one field the text names, or keeps
  // the text as a search; ↑ ↓ walk the list; Backspace in the empty field
  // removes the last chip.
  input.addEventListener("click", () => { if (popSlot !== searchBox) openMenu(); });
  searchBox.addEventListener("click", e => { if (e.target === searchBox) { input.focus(); openMenu(); } });
  o.addBtn?.addEventListener("click", () => { if (popSlot === searchBox) close(); else { input.focus(); openMenu(); } });
  input.addEventListener("input", () => { if (o.active() && (input.value.trim() || popSlot === searchBox)) openMenu(); });
  input.addEventListener("keydown", e => {
    if (!o.active() || e.defaultPrevented) return;
    const menu = popSlot === searchBox && pop;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!menu) { if (e.key === "ArrowDown") { e.preventDefault(); openMenu(); } return; }
      e.preventDefault(); moveCursor(cursor + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter") {
      if (menu && cursor >= 0) { e.preventDefault(); visibleOpts()[cursor]?.click(); return; }
      const hits = input.value.trim() ? matchingFields(input.value) : [];
      if (hits.length === 1) { e.preventDefault(); pickField(hits[0].id); o.onFieldTyped?.(); }
      else if (menu) close();
    } else if (e.key === "Backspace" && !input.value && input.selectionStart === 0) {
      const list = o.conds();
      if (!list.length) return;
      e.preventDefault();
      close();
      o.setConds(list.slice(0, -1));
      render();
    }
  });

  return {
    render,
    close,
    // Toggle one value of a field from outside (the stat tiles).
    toggle(field, value) {
      const cur = o.conds().find(c => c.field === field);
      const on = cur && cur.op === "is" && cur.values.length === 1 && cur.values[0] === value;
      o.setConds([...o.conds().filter(c => c.field !== field), ...(on ? [] : [{ field, op: "is", values: [value] }])]);
      render();
    },
  };
}
