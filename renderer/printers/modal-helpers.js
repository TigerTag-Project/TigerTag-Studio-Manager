/**
 * printers/modal-helpers.js — Shared helpers for printer settings widgets.
 *
 * These functions render the interior body of the "Printer Settings" modal.
 * Each brand's renderSettingsWidget() calls them to avoid duplicating markup.
 *
 * Nothing in this file references inventory.js state directly — all context
 * is passed in via the `ctx` object so brand widgets stay fully isolated.
 */

// ── Field / section renderers ────────────────────────────────────────────────

/** Render a single input field (text or password+eye-toggle). */
export function renderField(f, { t, esc }) {
  const labelHtml = f.labelText ? esc(f.labelText) : esc(t(f.labelKey));
  const reqMark   = f.optional  ? `<span class="pba-field-opt">${esc(t("printerOptional"))}</span>`
                  : f.required  ? '<span class="pba-field-req">*</span>'
                  : "";
  const hint      = f.hintKey   ? `<span class="pba-field-hint">${esc(t(f.hintKey))}</span>` : "";

  if (f.secret) {
    return `
      <label class="pba-field">
        <span class="pba-field-label">${labelHtml} ${reqMark}</span>
        <span class="pba-input-wrap pba-input-wrap--secret">
          <input type="password"
                 class="pba-input${f.mono ? " pba-input--mono" : ""}"
                 name="${esc(f.key)}"
                 placeholder="${esc(f.placeholder)}"
                 autocomplete="off" autocapitalize="off" spellcheck="false"
                 ${f.required ? "required" : ""}/>
          <button type="button" class="pba-input-eye" data-eye-target="${esc(f.key)}"
                  title="${esc(t("printerSecretShow"))}">
            <span class="pba-eye-stack">
              <span class="pba-eye-icon pba-eye-icon--on  icon icon-eye-on  icon-14"></span>
              <span class="pba-eye-icon pba-eye-icon--off icon icon-eye-off icon-14"></span>
            </span>
          </button>
        </span>
        ${hint}
      </label>`;
  }
  return `
    <label class="pba-field">
      <span class="pba-field-label">${labelHtml} ${reqMark}</span>
      <input type="text"
             class="pba-input${f.mono ? " pba-input--mono" : ""}"
             name="${esc(f.key)}"
             placeholder="${esc(f.placeholder)}"
             autocomplete="off" autocapitalize="off" spellcheck="false"
             ${f.required ? "required" : ""}/>
      ${hint}
    </label>`;
}

/** Render one schema section (optional small-caps header + fields).
 *  A section may omit `titleKey` (e.g. a single trailing block under the
 *  Connection section) — in that case no header is rendered. The fields
 *  still get the visual spacing of `.pba-section`. */
export function renderSection(s, { t, esc }) {
  const headerHtml = s.titleKey
    ? `<header class="pba-section-head">${esc(t(s.titleKey))}</header>`
    : "";
  return `
    <section class="pba-section">
      ${headerHtml}
      ${s.fields.map(f => renderField(f, { t, esc })).join("")}
    </section>`;
}

/** Render all sections of a schema as a concatenated HTML string. */
export function renderSectionsHtml(schema, { t, esc }) {
  return schema.sections.map(s => renderSection(s, { t, esc })).join("");
}

// ── Model picker ─────────────────────────────────────────────────────────────

/**
 * Generate the HTML for the model picker (trigger button + hidden input + dropdown).
 * @param {object[]} models          - ordered array, placeholder (id="0") first
 * @param {object|null} defaultModel - pre-selected model
 * @param {object} ctx               - { t, esc, printerImageUrl }
 */
export function modelPickerHtml(models, defaultModel, { t, esc, printerImageUrl }) {
  const defaultModelId   = defaultModel ? String(defaultModel.id) : "";
  const defaultModelName = defaultModel ? defaultModel.name : t("printerAddModelPh");
  const defaultImg       = defaultModel ? printerImageUrl(defaultModel) : null;
  const defaultThumbHtml = defaultImg
    ? `<img src="${esc(defaultImg)}" alt="" onerror="this.style.opacity='.15'"/>`
    : "";

  const optionsHtml = models.map(m => {
    const url     = printerImageUrl(m);
    const imgHtml = url ? `<img src="${esc(url)}" alt="" onerror="this.style.opacity='.15'"/>` : "";
    return `
      <button type="button" class="pba-mp-opt" data-id="${esc(m.id)}" data-name="${esc(m.name)}">
        <span class="pba-mp-thumb">${imgHtml}</span>
        <span class="pba-mp-name">${esc(m.name)}</span>
      </button>`;
  }).join("");

  return `
    <div class="pba-field">
      <span class="pba-field-label">${esc(t("printerLblModel"))} <span class="pba-field-req">*</span></span>
      <div class="pba-modelpicker" id="pbaModelPicker">
        <button type="button" class="pba-mp-trigger" id="pbaMpTrigger"
                aria-haspopup="listbox" aria-expanded="false">
          <span class="pba-mp-thumb pba-mp-thumb--trigger" id="pbaMpTriggerThumb">${defaultThumbHtml}</span>
          <span class="pba-mp-trigger-text" id="pbaMpTriggerText">${esc(defaultModelName)}</span>
          <span class="icon icon-chevron-r icon-13 pba-mp-chev"></span>
        </button>
        <input type="hidden" name="printerModelId" id="pbaMpValue" value="${esc(defaultModelId)}" />
        <div class="pba-mp-list" id="pbaMpList" role="listbox" hidden>
          ${optionsHtml}
        </div>
      </div>
    </div>`;
}

/**
 * Wire the model picker dropdown (open/close, selection, name auto-fill).
 * Must be called AFTER the HTML produced by modelPickerHtml() is in the DOM.
 * @param {Element} bodyEl  - the form body element containing #pbaModelPicker
 * @param {object[]} models - same list passed to modelPickerHtml()
 * @param {object} ctx      - { esc, printerImageUrl }
 */
export function wireModelPicker(bodyEl, models, { esc, printerImageUrl }) {
  const trigger = bodyEl.querySelector("#pbaMpTrigger");
  const list    = bodyEl.querySelector("#pbaMpList");
  const value   = bodyEl.querySelector("#pbaMpValue");
  const text    = bodyEl.querySelector("#pbaMpTriggerText");
  const thumb   = bodyEl.querySelector("#pbaMpTriggerThumb");
  if (!trigger || !list) return;

  const open  = () => { list.hidden = false; trigger.setAttribute("aria-expanded", "true");  trigger.classList.add("pba-mp-trigger--open"); };
  const close = () => { list.hidden = true;  trigger.setAttribute("aria-expanded", "false"); trigger.classList.remove("pba-mp-trigger--open"); };

  trigger.addEventListener("click", e => { e.stopPropagation(); list.hidden ? open() : close(); });
  document.addEventListener("click", e => {
    if (!list.hidden && !list.contains(e.target) && e.target !== trigger) close();
  });

  list.querySelectorAll(".pba-mp-opt").forEach(opt => {
    opt.addEventListener("click", () => {
      const id   = opt.dataset.id;
      const name = opt.dataset.name;
      const m    = models.find(x => String(x.id) === id);
      const url  = printerImageUrl(m);
      value.value        = id;
      text.textContent   = name;
      thumb.innerHTML    = url ? `<img src="${esc(url)}" alt="" onerror="this.style.opacity='.15'"/>` : "";
      const nameInput = bodyEl.querySelector("input[name=printerName]");
      if (nameInput && id !== "0" && !nameInput.value.trim()) nameInput.value = name;
      close();
      nameInput?.focus();
      nameInput?.select();
    });
  });
}

// ── Password eye toggles ─────────────────────────────────────────────────────

/**
 * Wire the show/hide eye button for every .pba-input-wrap--secret in scope.
 * @param {Element} bodyEl - element containing the secret inputs
 * @param {Function} t     - i18n translator
 */
export function wirePasswordEyes(bodyEl, t) {
  bodyEl.querySelectorAll(".pba-input-eye").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const wrap = btn.closest(".pba-input-wrap--secret");
      const inp  = wrap?.querySelector("input");
      if (!inp) return;
      const showing = inp.type === "text";
      inp.type  = showing ? "password" : "text";
      btn.title = showing ? t("printerSecretShow") : t("printerSecretHide");
      btn.classList.toggle("pba-input-eye--on", !showing);
    });
  });
}

// ── Pre-fill ─────────────────────────────────────────────────────────────────

/**
 * Pre-fill named inputs inside bodyEl from a plain key→value map.
 * Null / undefined values are skipped.
 */
export function prefillFields(bodyEl, data) {
  Object.entries(data).forEach(([name, v]) => {
    if (v == null) return;
    const el = bodyEl.querySelector(`input[name="${name}"]`);
    if (el) el.value = String(v);
  });
}

// ── Schema-driven widget factory ─────────────────────────────────────────────

/**
 * Build a standard renderSettingsWidget() for brands whose settings form
 * is fully described by a schema object (sections + fields).
 *
 * Usage in a brand file:
 *   export const renderSettingsWidget = schemaWidget(schema);
 *
 * @param {object} schema - { sections: [{ titleKey, fields: [...] }] }
 * @returns {Function}    - renderSettingsWidget(printer, bodyEl, ctx)
 */
// Brands shipping a `renderer/printers/<brand>/tutorial.json` — these get a
// "Tutoriel de connexion" pill at the top of their settings panel so a user
// who skipped the tutorial during scan can still consult it later. Click is
// routed by the global `[data-printer-tuto]` delegate in inventory.js → opens
// the multi-step tutorial modal with the printer's series pre-selected.
const _BRANDS_WITH_TUTO = new Set(["bambulab", "flashforge", "elegoo"]);

// The pill stays *un-pinned* to a specific model — the model hint is filled
// in dynamically by wireTutorialPill() right before the click bubbles up to
// the global delegate, so the tutorial always opens for whichever model the
// user has currently selected in the picker (was stuck on defaultModel before,
// notably for Bambu where 11 models map to 3 different tutorials).
function tutorialPillHtml(brand, { t, esc }) {
  if (!_BRANDS_WITH_TUTO.has(brand)) return "";
  return `
    <button type="button" class="pba-tuto-pill" data-printer-tuto="${esc(brand)}">
      ${esc(t("tutoOpenBtn"))}
    </button>`;
}

/**
 * Bind a click listener that snapshots the live model selection (read from
 * `#pbaMpTriggerText.textContent`, which the model picker updates on every
 * change) into the pill's `data-printer-tuto-model` attribute BEFORE the
 * event bubbles to the global delegate in inventory.js. Bubble order
 * guarantees this listener fires first.
 */
function wireTutorialPill(bodyEl) {
  const pill = bodyEl.querySelector(".pba-tuto-pill");
  if (!pill) return;
  pill.addEventListener("click", () => {
    const trigger = bodyEl.querySelector("#pbaMpTriggerText");
    const name = trigger?.textContent?.trim() || "";
    if (name) pill.dataset.printerTutoModel = name;
    else      delete pill.dataset.printerTutoModel;
  });
}

export function schemaWidget(schema) {
  return function renderSettingsWidget(printer, bodyEl, ctx) {
    const { models, defaultModel, isEdit, prefill, t, esc, printerImageUrl, brand } = ctx;

    // ── 1. Render ──────────────────────────────────────────────────────────
    const identitySection = `
      <section class="pba-section">
        <header class="pba-section-head">${esc(t("printerSecIdentity"))}</header>
        ${modelPickerHtml(models, defaultModel, { t, esc, printerImageUrl })}
        <label class="pba-field">
          <span class="pba-field-label">${esc(t("printerLblName"))} <span class="pba-field-req">*</span></span>
          <input type="text" class="pba-input" name="printerName"
                 placeholder="${esc(t("printerAddNamePh"))}" required />
        </label>
      </section>`;

    bodyEl.innerHTML = tutorialPillHtml(brand, { t, esc })
      + identitySection
      + renderSectionsHtml(schema, { t, esc })
      + `<div class="pba-error" id="printerAddError" hidden></div>`;

    // ── 2. Wire ────────────────────────────────────────────────────────────
    wireModelPicker(bodyEl, models, { esc, printerImageUrl });
    wirePasswordEyes(bodyEl, t);
    wireTutorialPill(bodyEl);

    // ── 3. Pre-fill ────────────────────────────────────────────────────────
    if (isEdit && printer) {
      const data = { printerName: printer.printerName };
      schema.sections.forEach(sec =>
        sec.fields.forEach(f => { data[f.key] = printer[f.key]; })
      );
      prefillFields(bodyEl, data);
    } else if (prefill) {
      const data = {};
      if (prefill.printerName) data.printerName = prefill.printerName;
      // Prefill every schema field whose key is also present in the prefill
      // payload. Lets brand discovery flows set arbitrary fields
      // (Bambu `broker` + `serialNumber`, Elegoo `ip` + `sn`, etc.) without
      // each having to pass through a hard-coded branch here.
      schema.sections.forEach(sec => sec.fields.forEach(f => {
        if (prefill[f.key] != null && prefill[f.key] !== "") data[f.key] = prefill[f.key];
      }));
      // Back-compat: legacy flows pass `ip` even when the schema's IP field
      // uses a different key (e.g. Bambu's `broker`). Map it onto the field.
      if (prefill.ip && data.ip == null && data.broker == null) data.ip = prefill.ip;
      prefillFields(bodyEl, data);
    }
  };
}
