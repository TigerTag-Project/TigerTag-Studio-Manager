/**
 * printers/scan-pick.js — tick one or several printers found by a LAN scan, then
 * add them all in one go. Shared by every brand's scan card, so the gesture is
 * the same whatever the brand (and the same as Bambu Lab's cloud picker).
 *
 *   • one ticked    → the prefilled settings form, exactly as a single click
 *                     used to do: the user reviews the name, types a code.
 *   • several ticked → added straight away. A required field the scan could not
 *                     provide (an access code, a check code…) is asked for ON
 *                     the ticked card itself — every machine has its own.
 *
 * The brand keeps its own card markup and its own single-add path; it hands
 * over three things: how to build the form prefill from a candidate, what to do
 * for a single add, and how to stop its scan before committing.
 */

/**
 * @param {object}   o
 * @param {object}   o.ctx        printers context (t, esc, printerRequiredFields,
 *                                addScannedPrinters, finishPrinterAdd)
 * @param {string}   o.brand
 * @param {string}   o.resultsId  id of the `.snap-scan-results` list
 * @param {(c) => object|Promise<object>} o.prefillFor  the form prefill for a candidate
 * @param {(c) => void} o.onSingle   the brand's existing single-printer path
 * @param {() => void}  [o.beforeAdd] stop the scan etc. before a multi-add
 */
export function createScanPicker({ ctx, brand, resultsId, prefillFor, onSingle, beforeAdd }) {
  const picked = new Map();          // card element → { c, prefill, values }
  let busy = false;

  const _results = () => document.getElementById(resultsId);
  const _card    = () => _results()?.closest('.pba-card');

  /* The key and the note live in the scan card's own footer / body, created on
     first use so no brand's markup has to change. */
  function _btn() {
    const footer = _card()?.querySelector(':scope > .pba-footer');
    if (!footer) return null;
    let b = footer.querySelector(':scope > .scan-pick-add');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'adf-btn adf-btn--primary scan-pick-add';
      b.hidden = true;
      b.innerHTML = '<span class="icon icon-plus icon-13"></span><span class="label"></span>';
      b.addEventListener('click', _commit);
      footer.appendChild(b);
    }
    return b;
  }
  function _note(msgKey) {
    const list = _results();
    if (!list) return;
    let n = list.parentElement.querySelector(':scope > .scan-pick-note');
    if (!msgKey) { n?.remove(); return; }
    if (!n) {
      n = document.createElement('div');
      n.className = 'bbl-cloud-note is-error scan-pick-note';
      list.after(n);
    }
    n.textContent = ctx.t(msgKey);
  }

  function _sync() {
    const b = _btn();
    const n = picked.size;
    if (b) {
      b.hidden = n === 0;
      b.disabled = busy;
      const lbl = b.querySelector('.label');
      if (lbl) lbl.textContent = ctx.t('printerScanAddSelected', { n });
    }
    _syncFields();
  }

  /* The missing fields only matter for a multi-add — with one ticked, the form
     asks for them, and asking twice would be noise. */
  function _syncFields() {
    const multi = picked.size > 1;
    const required = ctx.printerRequiredFields(brand);
    for (const [card, entry] of picked) {
      let box = card.querySelector(':scope > .scan-pick-fields');
      const missing = entry.prefill ? required.filter(f => !String(entry.prefill[f.key] ?? '').trim()) : [];
      if (!multi || !missing.length) { box?.remove(); continue; }
      if (box) continue;
      box = document.createElement('div');
      box.className = 'scan-pick-fields';
      box.innerHTML = missing.map(f => `
        <label class="scan-pick-field">
          <span class="scan-pick-field-lbl">${ctx.esc(f.label)}</span>
          <input type="${f.secret ? 'password' : 'text'}" data-key="${ctx.esc(f.key)}"
                 class="snap-add-ip-input${f.mono ? ' is-mono' : ''}" placeholder="${ctx.esc(f.placeholder)}"
                 autocomplete="off" spellcheck="false" value="${ctx.esc(entry.values[f.key] || '')}">
        </label>`).join('');
      // Typing in a field must not un-tick the card it sits on.
      box.addEventListener('click', e => e.stopPropagation());
      box.addEventListener('keydown', e => e.stopPropagation());
      box.addEventListener('input', e => {
        const k = e.target.dataset?.key;
        if (k) { entry.values[k] = e.target.value; e.target.classList.remove('is-missing'); }
      });
      card.appendChild(box);
    }
  }

  function _toggle(card, c) {
    if (busy) return;
    _note(null);
    if (picked.has(card)) {
      picked.delete(card);
      card.querySelector(':scope > .scan-pick-fields')?.remove();
    } else {
      const entry = { c, prefill: null, values: {} };
      picked.set(card, entry);
      // Anycubic looks its credentials up in the slicer's config — async.
      Promise.resolve(prefillFor(c)).then(pf => {
        entry.prefill = pf || {};
        if (picked.get(card) === entry) _syncFields();
      }).catch(() => { entry.prefill = {}; });
    }
    const on = picked.has(card);
    card.classList.toggle('is-picked', on);
    card.setAttribute('aria-checked', String(on));
    _sync();
  }

  async function _commit() {
    if (busy || !picked.size) return;
    const entries = [...picked.values()];
    if (entries.length === 1) { onSingle(entries[0].c); return; }

    // Every card's missing field has to be filled before anything is written.
    let firstEmpty = null;
    for (const card of picked.keys()) {
      for (const inp of card.querySelectorAll('.scan-pick-fields input')) {
        if (!inp.value.trim()) { inp.classList.add('is-missing'); firstEmpty ||= inp; }
      }
    }
    if (firstEmpty) { _note('printerScanFillMissing'); firstEmpty.focus(); return; }

    busy = true; _sync();
    try {
      const prefills = await Promise.all(entries.map(async e => ({
        ...(e.prefill || await prefillFor(e.c) || {}),
        ...Object.fromEntries(Object.entries(e.values).map(([k, v]) => [k, String(v).trim()])),
      })));
      beforeAdd?.();
      const r = await ctx.addScannedPrinters(brand, prefills);
      if (!r?.ok) { _note('printerScanAddFailed'); return; }
      picked.clear();
      ctx.finishPrinterAdd(brand, r.ids[r.ids.length - 1]);
    } finally {
      busy = false; _sync();
    }
  }

  return {
    /** Forget every pick — call when the scan (re)starts and the list is emptied. */
    reset() {
      picked.clear();
      busy = false;
      _note(null);
      _sync();
    },
    /** Turn a freshly-built result card into a tickable one. */
    attach(card, c) {
      card.classList.add('scan-pick-card');
      card.setAttribute('role', 'checkbox');
      card.setAttribute('aria-checked', 'false');
      const chev = card.querySelector('.snap-scan-card-chev');
      const tick = document.createElement('span');
      tick.className = 'scan-pick-tick';
      tick.setAttribute('aria-hidden', 'true');
      tick.innerHTML = '<span class="icon icon-check icon-13"></span>';
      if (chev) chev.replaceWith(tick); else card.appendChild(tick);
      card.addEventListener('click', () => _toggle(card, c));
      card.addEventListener('keydown', e => {
        if (e.target !== card) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _toggle(card, c); }
      });
    },
  };
}
