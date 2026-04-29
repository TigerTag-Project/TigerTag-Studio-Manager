(() => {
  const API_BASE         = "https://cdn.tigertag.io";

  // ── Firebase helpers (SDK initialised in firebase.js) ──────────────────────
  const fbAuth = () => firebase.auth();
  const fbDb   = () => firebase.firestore();
  let _unsubInventory = null; // active Firestore onSnapshot unsubscribe handle

  const ACCOUNT_COLORS = {
    orange: ["#f97316","#fb923c"],   // orange vif
    amber:  ["#d97706","#f59e0b"],   // ambre doré
    yellow: ["#ca8a04","#eab308"],   // jaune
    lime:   ["#65a30d","#84cc16"],   // vert citron
    green:  ["#16a34a","#22c55e"],   // vert nature
    teal:   ["#0d9488","#14b8a6"],   // bleu-vert
    sky:    ["#0284c7","#0ea5e9"],   // bleu ciel
    blue:   ["#2563eb","#3b82f6"],   // bleu roi
    violet: ["#7c3aed","#8b5cf6"],   // violet
    fuchsia:["#c026d3","#d946ef"],   // fuchsia
    rose:   ["#e11d48","#f43f5e"],   // rose vif
    red:    ["#dc2626","#ef4444"],   // rouge
    slate:  ["#475569","#64748b"],   // ardoise
  };
  // Compute a two-stop gradient from a single hex colour
  function hexToGradientPair(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const mix = (c) => Math.min(255, c + Math.round((255-c)*0.38));
    const h = n => n.toString(16).padStart(2,"0");
    return [hex, `#${h(mix(r))}${h(mix(g))}${h(mix(b))}`];
  }
  function getAccGradient(acc) {
    if (acc?.color === "custom" && acc.customColor) {
      const [c1,c2] = hexToGradientPair(acc.customColor);
      return `linear-gradient(135deg,${c1},${c2})`;
    }
    const [c1,c2] = ACCOUNT_COLORS[acc?.color] || ACCOUNT_COLORS.orange;
    return `linear-gradient(135deg,${c1},${c2})`;
  }
  function getAccShadow(acc) {
    if (acc?.color === "custom" && acc.customColor) return acc.customColor;
    return (ACCOUNT_COLORS[acc?.color] || ACCOUNT_COLORS.orange)[0];
  }
  function applyAvatarStyle(acc) {
    const grad = getAccGradient(acc); const sh = getAccShadow(acc);
    $("sbAvatar").style.background = grad;
    $("sbAvatar").style.boxShadow = `0 0 0 3px ${sh}40,0 4px 20px ${sh}33`;
  }

  const STORAGE_ACCOUNTS = "tigertag.accounts";
  const STORAGE_ACTIVE   = "tigertag.activeAccount";
  const invKey = id => `tigertag.inv.${id}`;
  const LOGO_PATH          = "../assets/svg/tigertag_logo.svg";
  const LOGO_PATH_OUTLINE  = "../assets/svg/tigertag_logo_contouring.svg";

  const state = {
    inventory: null,
    rows: [],
    selected: null,
    keyValid: null,
    displayName: null,
    showDeleted: false,
    search: "",
    viewMode: localStorage.getItem("tigertag.view") || "table",
    lang: localStorage.getItem("tigertag.lang") || "en",
    sortCol: null,
    sortDir: "asc",
    activeAccountId: null,
    i18n: {},
    imgCache: new Map(),
    db: { brand: [], material: [], aspect: [], type: [], diameter: [], unit: [], version: [], containers: [] }
  };

  const $ = id => document.getElementById(id);

  // t(key, params?) — looks up a translation key in the loaded locale.
  // Supports: plain strings, {{param}} interpolation, ["array"] random pick,
  // and {"one": "…", "other": "…"} plurals (uses params.n to select form).
  function t(key, params = {}) {
    const lang = state.i18n[state.lang] || {};
    const en   = state.i18n.en || {};
    const val  = (key in lang) ? lang[key] : (key in en ? en[key] : key);
    if (Array.isArray(val)) {
      return val[Math.floor(Math.random() * val.length)];
    }
    if (val && typeof val === "object" && ("one" in val || "other" in val)) {
      const n = params.n ?? 0;
      const str = n === 1 ? (val.one ?? val.other) : (val.other ?? val.one);
      return (str || "").replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? "");
    }
    if (typeof val === "string") {
      return val.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? "");
    }
    return key;
  }

  function applyTranslations() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    if ($("langSelect")) $("langSelect").value = state.lang;
  }

  /* ── helpers ── */
  function v(val) { return (val === undefined || val === null || val === "" || val === "--") ? "-" : val; }
  function toHex(r, g, b) {
    if ([r,g,b].some(c => typeof c !== "number")) return null;
    const h = n => Math.max(0,Math.min(255,n|0)).toString(16).padStart(2,"0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  function timeAgo(secOrMs) {
    if (!secOrMs) return "-";
    const ms = secOrMs > 1e12 ? secOrMs : secOrMs * 1000;
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60)                    return t("agoNow");
    const m = Math.floor(s / 60);  if (m < 60)   return t("agoMin",   {n: m});
    const h = Math.floor(m / 60);  if (h < 24)   return t("agoHour",  {n: h});
    const d = Math.floor(h / 24);  if (d < 30)   return t("agoDay",   {n: d});
    const mo = Math.floor(d / 30); if (mo < 12)  return t("agoMonth", {n: mo});
    return t("agoYear", {n: Math.floor(mo / 12)});
  }
  function fmtTs(secOrMs) {
    if (!secOrMs) return "-";
    const ms = secOrMs > 1e12 ? secOrMs : secOrMs * 1000;
    const d = new Date(ms); return isNaN(d.getTime()) ? "-" : d.toLocaleString();
  }
  // TigerTag chip timestamps use epoch = Jan 1 2000 (946684800 s offset from Unix)
  const CHIP_EPOCH_OFFSET = 946684800;
  function fmtChipTs(ts) {
    if (!ts) return null;
    const d = new Date((ts + CHIP_EPOCH_OFFSET) * 1000);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString();
  }
  function setLoading(btn, on) { btn.classList.toggle("loading", !!on); btn.disabled = !!on; }
  function toast(el, kind, msg) {
    if (!el) return; el.innerHTML = "";
    const div = document.createElement("div"); div.className = `alert ${kind}`; div.textContent = msg; el.appendChild(div);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  }
  function highlight(json) {
    if (typeof json !== "string") json = JSON.stringify(json, null, 2);
    json = esc(json);
    return json.replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, m => {
      let c = "n";
      if (/^"/.test(m)) c = /:$/.test(m) ? "k" : "s";
      else if (/true|false|null/.test(m)) c = "b";
      return `<span class="${c}">${m}</span>`;
    });
  }
  function debug(meta, body) { $("debugMeta").textContent = meta; $("debugBody").innerHTML = highlight(body); }
  async function apiFetch(url, opts = {}) {
    const t0 = performance.now(); let res, text, body;
    try { res = await fetch(url, opts); text = await res.text(); }
    catch (e) { debug(`${opts.method||"GET"} ${url}\n${e.message}`, {error: String(e)}); throw e; }
    try { body = JSON.parse(text); } catch { body = text; }
    debug(`${opts.method||"GET"} ${url}\n→ ${res.status} ${res.statusText}  ·  ${Math.round(performance.now()-t0)} ms`, body);
    return { ok: res.ok, status: res.status, body };
  }

  /* ── lookups ── */
  async function loadLocales() {
    await Promise.all(["en", "fr", "de", "es", "it", "zh", "pt"].map(async lang => {
      try {
        const r = await fetch(`locales/${lang}.json`);
        if (r.ok) state.i18n[lang] = await r.json();
      } catch {}
    }));
  }

  async function loadLookups() {
    const files = ["id_brand","id_material","id_aspect","id_type","id_diameter","id_measure_unit","id_version"];
    const keys  = ["brand",   "material",   "aspect",   "type",   "diameter",   "unit",            "version"];
    await Promise.all(files.map(async (f, i) => {
      try {
        const r = await fetch(`../data/${f}.json`);
        if (r.ok) state.db[keys[i]] = await r.json();
      } catch {}
    }));
    try {
      const r = await fetch('../data/container_spool/spools_filament.json');
      if (r.ok) state.db.containers = await r.json();
    } catch {}
  }
  function dbFind(key, id) { return state.db[key].find(x => x.id === id) || null; }
  function containerFind(id) { return (state.db.containers || []).find(c => c.id === id) || null; }
  function brandName(id) { const b = dbFind("brand", id); return b ? b.name : "-"; }
  function materialLabel(id) { const m = dbFind("material", id); return m ? m.label : "-"; }
  function aspectLabel(id) { const a = dbFind("aspect", id); return a ? a.label : null; }
  function diamLabel(id) { const d = dbFind("diameter", id); return d ? d.label + " mm" : null; }
  function versionName(id) { const vv = dbFind("version", id); return vv ? vv.name : null; }
  function materialFull(id) { return dbFind("material", id); }
  function typeName(id) { const tp = dbFind("type", id); return tp ? tp.label : null; }

  /* ── Firestore Timestamp → epoch ms (accepts number, Timestamp, or {_seconds}) ── */
  function tsToMs(v) {
    if (!v) return null;
    if (typeof v === "number") return v > 1e12 ? v : v * 1000;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (v._seconds != null) return v._seconds * 1000;
    return null;
  }

  /* ── normalize ── */
  function normalizeRow(spoolId, data) {
    const hex  = toHex(data.color_r,  data.color_g,  data.color_b);
    const hex2 = toHex(data.color_r2, data.color_g2, data.color_b2);
    const hex3 = toHex(data.color_r3, data.color_g3, data.color_b3);
    const isPlus = data.url_img && data.url_img !== "--" && data.url_img !== "";
    const mat = materialFull(data.id_material);
    return {
      spoolId: String(spoolId),
      uid: data.uid != null ? String(data.uid) : String(spoolId),
      material: mat ? mat.label : (data.material || data.series || "-"),
      materialData: mat,
      brand: brandName(data.id_brand),
      colorName: data.color_name || data.name || data.message || "-",
      colorHex: hex,
      colorHex2: hex2,
      colorHex3: hex3,
      colorList: Array.isArray(data.online_color_list) ? data.online_color_list : [],
      colorType: data.online_color_type || null,
      aspect1: aspectLabel(data.id_aspect1),
      aspect2: aspectLabel(data.id_aspect2),
      diameter: diamLabel(data.data1),
      tagType: versionName(data.id_tigertag),
      weightAvailable: data.weight_available,
      containerWeight: data.container_weight,
      capacity: data.measure_gr || data.measure,
      imgUrl: isPlus ? data.url_img : null,
      isPlus,
      series: data.series || null,
      label: data.label && data.label !== "--" ? data.label : null,
      productName: data.name && data.name !== "--" ? data.name : null,
      sku: data.sku && data.sku !== "--" ? data.sku : null,
      barcode: data.barcode && data.barcode !== "--" ? data.barcode : null,
      isRefill:   !!data.info1,
      isRecycled: !!data.info2,
      isFilled:   !!data.info3,
      temps: {
        nozzleMin: data.data2 || null,
        nozzleMax: data.data3 || null,
        dryTemp:   data.data4 || null,
        dryTime:   data.data5 || null,
        bedMin:    data.data6 || null,
        bedMax:    data.data7 || null,
      },
      links: {
        youtube: data.LinkYoutube && data.LinkYoutube !== "--" ? data.LinkYoutube : null,
        msds:    data.LinkMSDS    && data.LinkMSDS    !== "--" ? data.LinkMSDS    : null,
        tds:     data.LinkTDS     && data.LinkTDS     !== "--" ? data.LinkTDS     : null,
        rohs:    data.LinkROHS    && data.LinkROHS    !== "--" ? data.LinkROHS    : null,
        reach:   data.LinkREACH   && data.LinkREACH   !== "--" ? data.LinkREACH   : null,
        food:    data.LinkFOOD    && data.LinkFOOD    !== "--" ? data.LinkFOOD    : null,
      },
      twinUid: data.twin_tag_uid || null,
      containerId: data.container_id || null,
      lastUpdate: tsToMs(data.last_update) || tsToMs(data.updated_at),
      deleted: !!data.deleted || !!data.deleted_at,
      productType: typeName(data.id_type),
      chipTimestamp: data.timestamp || null,
      raw: data,
    };
  }

  /* ── health ── */
  async function pingHealth() {
    try {
      const r = await fetch(`${API_BASE}/healthz/`);
      $("health").classList.toggle("ok", r.ok);
      $("health").classList.toggle("bad", !r.ok);
      $("health").dataset.tooltip = r.ok ? t("backendOk") : t("backendErr", {n: r.status});
    } catch { $("health").classList.add("bad"); $("health").dataset.tooltip = t("backendOffline"); }
  }
  pingHealth();

  /* ── connected state ── */
  function setConnected(displayName, email) {
    state.displayName = displayName;
    const initials = displayName
      ? displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
      : (email || "?")[0].toUpperCase();
    $("sbAvatar").textContent = initials;   // removes child nodes incl. SVG "+"
    $("sbWelcome").textContent = t("welcomeBack");
    $("sbName").textContent = displayName || email || "—";
    $("sbUser").classList.remove("sb-user--empty");
    applyAvatarStyle(activeAccount());
  }
  function setDisconnected() {
    state.displayName = null; state.keyValid = null;
    // Restore "+" SVG inside avatar
    const av = $("sbAvatar");
    av.textContent = "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "sb-avatar-plus");
    svg.setAttribute("width", "22"); svg.setAttribute("height", "22");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
    av.appendChild(svg);
    av.style.background = ""; av.style.boxShadow = "";
    $("sbUser").classList.add("sb-user--empty");
    $("sbStats").classList.add("hidden");
  }
  /* ── account dropdown ── */
  function openAccountDropdown() {
    renderAccountDropdown();
    const dropdown  = $("acctDropdown");
    const sidebar   = document.querySelector(".sidebar");
    const rect      = $("sbAvatar").getBoundingClientRect();
    dropdown.classList.add("dropdown-fixed");
    // toujours collé au bord droit du sidebar, aligné sur l'avatar
    const sbRect = sidebar ? sidebar.getBoundingClientRect() : rect;
    dropdown.style.left = (sbRect.right + 8) + "px";
    dropdown.style.top  = rect.top + "px";
    dropdown.classList.add("open");
    $("sbAvatar").style.opacity = ".8";
    setTimeout(() => document.addEventListener("click", _dropOutside), 0);
  }
  function closeAccountDropdown() {
    const dropdown = $("acctDropdown");
    dropdown.classList.remove("open", "dropdown-fixed");
    dropdown.style.left = "";
    dropdown.style.top  = "";
    $("sbAvatar").style.opacity = "";
    document.removeEventListener("click", _dropOutside);
  }
  function _dropOutside(e) {
    if (!$("acctDropdown").contains(e.target) && e.target !== $("sbAvatar")) closeAccountDropdown();
  }
  function renderAccountDropdown() {
    const accounts = getAccounts();
    const activeId = state.activeAccountId;
    const list = $("acctDropdownList");
    list.innerHTML = accounts.map(acc => `
      <button class="acct-drop-item${acc.id===activeId?' active':''}" data-drop-id="${esc(acc.id)}">
        <span class="acct-drop-avatar" style="background:${getAccGradient(acc)}">${esc(getInitials(acc))}</span>
        <span class="acct-drop-name">${esc(acc.displayName || acc.email)}</span>
        ${acc.id===activeId ? '<span class="acct-drop-check">✓</span>' : ''}
      </button>`).join("");
    list.querySelectorAll("[data-drop-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.dropId;
        closeAccountDropdown();
        if (id !== activeId) switchAccountUI(id);
      });
    });
  }

  /* ── profiles modal ── */
  function openProfilesModal() {
    closeAccountDropdown();
    renderAccountList();
    $("profilesModalOverlay").classList.add("open");
  }
  function closeProfilesModal() {
    $("profilesModalOverlay").classList.remove("open");
  }

  /* ── settings panel ── */
  const SVG_COPY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  function openSettings() {
    if ($("langSelect")) $("langSelect").value = state.lang;
    $("settingsPanel").classList.add("open"); $("settingsOverlay").classList.add("open");
  }
  function closeSettings() {
    $("settingsPanel").classList.remove("open"); $("settingsOverlay").classList.remove("open");
  }
  $("btnOpenSettings").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", closeSettings);
  $("settingsOverlay").addEventListener("click", closeSettings);

  const SVG_CHECK = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  $("btnStgExport").addEventListener("click", () => {
    if (!state.inventory) return;
    const blob = new Blob([JSON.stringify(state.inventory,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `tigertag-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSettings(); });
  $("btnSbReload").addEventListener("click", () => loadInventory());

  const SVG_EYE_OFF = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  const SVG_EYE_ON  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  function makeEyeToggle(btnId, fieldId) {
    const btn = $(btnId), field = $(fieldId);
    if (!btn || !field) return;
    // preventDefault sur mousedown : garde le focus sur l'input → pas de reflow → pas de saut
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => {
      const reveal = !field.classList.contains("revealed");
      field.classList.toggle("revealed", reveal);
      // style direct = repaint immédiat (quirk Chromium avec valeurs définies programmatiquement)
      field.style.webkitTextSecurity = reveal ? "none" : "disc";
      btn.innerHTML = reveal ? SVG_EYE_ON : SVG_EYE_OFF;
    });
  }
  function makeCopyBtn(btnId, fieldId) {
    const btn = $(btnId), field = $(fieldId);
    if (!btn || !field) return;
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => {
      const val = field.value; if (!val) return;
      navigator.clipboard.writeText(val).then(() => {
        btn.innerHTML = SVG_CHECK; btn.classList.add("copied");
        setTimeout(() => { btn.innerHTML = SVG_COPY; btn.classList.remove("copied"); }, 1800);
      });
    });
  }

  /* ── modal: disconnect account ── */
  /* ── modal: edit account ── */
  let _editingAccount = null;
  function openEditAccountModal(acc) {
    _editingAccount = acc || activeAccount(); if (!_editingAccount) return;
    $("eacAvatar").textContent  = getInitials(_editingAccount);
    $("eacName").textContent    = _editingAccount.displayName || "";
    $("eacName").style.display  = _editingAccount.displayName ? "" : "none";
    $("eacEmail").textContent   = _editingAccount.email || "";
    $("eacAvatar").style.background = getAccGradient(_editingAccount);
    const isCustom = _editingAccount?.color === "custom";
    if (isCustom && _editingAccount.customColor) {
      $("eacCustomColor").value = _editingAccount.customColor;
      $("eacSwatchCustom").style.background = getAccGradient(_editingAccount);
    }
    $("eacSwatches").querySelectorAll(".eac-swatch[data-color]").forEach(sw =>
      sw.classList.toggle("active", !isCustom && sw.dataset.color === (_editingAccount?.color || "orange"))
    );
    $("eacSwatchCustom").classList.toggle("active", isCustom);
    $("editAccountModalOverlay").classList.add("open");
  }
  function closeEditAccountModal() {
    $("editAccountModalOverlay").classList.remove("open");
  }
  // avatar dropdown
  $("sbAvatar").addEventListener("click", e => {
    e.stopPropagation();
    if ($("sbUser").classList.contains("sb-user--empty")) {
      openAddAccountModal();
    } else {
      $("acctDropdown").classList.contains("open") ? closeAccountDropdown() : openAccountDropdown();
    }
  });
  $("btnAddFirstAccount").addEventListener("click", openAddAccountModal);
  $("btnManageProfiles").addEventListener("click", () => { closeAccountDropdown(); openProfilesModal(); });
  $("btnDropdownSettings").addEventListener("click", () => { closeAccountDropdown(); openSettings(); });

  // profiles modal
  $("profilesModalClose").addEventListener("click", closeProfilesModal);
  $("profilesModalOverlay").addEventListener("click", e => { if (e.target === $("profilesModalOverlay")) closeProfilesModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("profilesModalOverlay").classList.contains("open")) closeProfilesModal(); });

  // preset color swatches
  $("eacSwatches").querySelectorAll(".eac-swatch[data-color]").forEach(sw => {
    sw.addEventListener("click", () => {
      if (!_editingAccount) return;
      const color = sw.dataset.color;
      $("eacSwatches").querySelectorAll(".eac-swatch").forEach(s => s.classList.remove("active"));
      sw.classList.add("active");
      const accounts = getAccounts();
      const idx = accounts.findIndex(a => a.id === _editingAccount.id);
      if (idx >= 0) { accounts[idx].color = color; delete accounts[idx].customColor; saveAccounts(accounts); _editingAccount = accounts[idx]; }
      $("eacAvatar").style.background = getAccGradient(_editingAccount);
      if (_editingAccount.id === state.activeAccountId) applyAvatarStyle(_editingAccount);
      renderAccountDropdown();
    });
  });
  // custom color picker
  $("eacCustomColor").addEventListener("input", () => {
    if (!_editingAccount) return;
    const hex = $("eacCustomColor").value;
    const accounts = getAccounts();
    const idx = accounts.findIndex(a => a.id === _editingAccount.id);
    if (idx >= 0) { accounts[idx].color = "custom"; accounts[idx].customColor = hex; saveAccounts(accounts); _editingAccount = accounts[idx]; }
    $("eacSwatches").querySelectorAll(".eac-swatch").forEach(s => s.classList.remove("active"));
    $("eacSwatchCustom").classList.add("active");
    $("eacSwatchCustom").style.background = getAccGradient(_editingAccount);
    $("eacAvatar").style.background = getAccGradient(_editingAccount);
    if (_editingAccount.id === state.activeAccountId) applyAvatarStyle(_editingAccount);
    renderAccountDropdown();
  });

  $("editAccountModalClose").addEventListener("click", closeEditAccountModal);
  $("editAccountModalOverlay").addEventListener("click", e => { if (e.target === $("editAccountModalOverlay")) closeEditAccountModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("editAccountModalOverlay").classList.contains("open")) closeEditAccountModal(); });
  // Disconnect = Firebase sign-out
  $("btnEditModalDisconnect").addEventListener("click", async () => {
    if (!_editingAccount) return;
    closeEditAccountModal();
    await fbSignOut();
  });

  /* ── modal: login (Firebase) ── */
  function openAddAccountModal() {
    $("stgEmail").value = ""; $("stgPassword").value = "";
    $("stgPassword").classList.remove("revealed");
    $("btnToggleStgPassword").innerHTML = SVG_EYE_OFF;
    $("addModalResult").innerHTML = "";
    $("addAccountModalOverlay").classList.add("open");
    setTimeout(() => $("stgEmail").focus(), 180);
  }
  function closeAddAccountModal() {
    $("addAccountModalOverlay").classList.remove("open");
  }
  $("addModalClose").addEventListener("click", closeAddAccountModal);
  $("addAccountModalOverlay").addEventListener("click", e => { if (e.target === $("addAccountModalOverlay")) closeAddAccountModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $("addAccountModalOverlay").classList.contains("open")) closeAddAccountModal(); });

  // eye toggle for password field
  makeEyeToggle("btnToggleStgPassword", "stgPassword");

  // Google sign-in via popup (opens inside Electron, see main.js)
  $("btnGoogleSignIn").addEventListener("click", async () => {
    setLoading($("btnGoogleSignIn"), true);
    $("addModalResult").innerHTML = "";
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await fbAuth().signInWithPopup(provider);
      // onAuthStateChanged handles the rest
      closeAddAccountModal();
    } catch (err) {
      const code = err.code || "";
      if (code !== "auth/popup-closed-by-user") {
        toast($("addModalResult"), "bad", t("addAccountAuthError"));
      }
    } finally { setLoading($("btnGoogleSignIn"), false); }
  });

  // Email/password sign-in
  $("btnStgSave").addEventListener("click", async () => {
    const email = $("stgEmail").value.trim(), password = $("stgPassword").value;
    if (!email || !password) return;
    setLoading($("btnStgSave"), true);
    $("addModalResult").innerHTML = "";
    try {
      await fbAuth().signInWithEmailAndPassword(email, password);
      // onAuthStateChanged handles the rest
      closeAddAccountModal();
    } catch (err) {
      const code = err.code || "";
      const msg = (code === "auth/wrong-password" || code === "auth/user-not-found" || code === "auth/invalid-credential")
        ? t("addAccountAuthError")
        : (err.message || t("networkError"));
      toast($("addModalResult"), "bad", msg);
    }
    setLoading($("btnStgSave"), false);
  });

  // Allow Enter key in password field to submit
  $("stgPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") $("btnStgSave").click();
  });

  /* ── sidebar collapse toggle ── */
  (function() {
    const sidebar = $("sidebar");
    if (localStorage.getItem("tigertag.sidebar") === "collapsed") {
      sidebar.classList.add("collapsed");
    }
    $("btnSidebarToggle").addEventListener("click", () => {
      const collapsed = sidebar.classList.toggle("collapsed");
      localStorage.setItem("tigertag.sidebar", collapsed ? "collapsed" : "expanded");
    });
  })();

  /* ── account storage helpers ── */
  function getAccounts() { try { return JSON.parse(localStorage.getItem(STORAGE_ACCOUNTS) || "[]"); } catch { return []; } }
  function saveAccounts(arr) { localStorage.setItem(STORAGE_ACCOUNTS, JSON.stringify(arr)); }
  function getActiveId() { return localStorage.getItem(STORAGE_ACTIVE) || null; }
  function setActiveId(id) { localStorage.setItem(STORAGE_ACTIVE, id); state.activeAccountId = id; }
  function activeAccount() { const id = getActiveId(); return getAccounts().find(a => a.id === id) || null; }

  /* ── persistence ── */
  function saveInventory(raw) {
    if (!state.activeAccountId) return;
    try { localStorage.setItem(invKey(state.activeAccountId), JSON.stringify(raw)); } catch {}
  }

  /* ── forced migration: wipe pre-Firebase accounts (those that have apiKey field) ── */
  function runMigration() {
    const accounts = getAccounts();
    const hasLegacy = accounts.some(a => "apiKey" in a);
    if (!hasLegacy) return;
    accounts.forEach(a => localStorage.removeItem(invKey(a.id)));
    localStorage.removeItem(STORAGE_ACCOUNTS);
    localStorage.removeItem(STORAGE_ACTIVE);
    localStorage.removeItem("tigertag.creds");
    localStorage.removeItem("tigertag.inventory");
    console.info("[Migration] Legacy API-key accounts wiped. Please sign in with Firebase Auth.");
  }

  /* ── Firebase sign-out ── */
  async function fbSignOut() {
    unsubscribeInventory();
    await fbAuth().signOut();
    // onAuthStateChanged(null) will call setDisconnected() and show login
  }

  /* ── Firestore inventory subscription ── */
  function subscribeInventory(uid) {
    unsubscribeInventory();
    _unsubInventory = fbDb()
      .collection("users").doc(uid)
      .collection("inventory")
      .onSnapshot(snapshot => {
        const raw = {};
        snapshot.forEach(doc => { raw[doc.id] = doc.data(); });
        state.inventory = raw;
        state.rows = snapshot.docs.map(doc => normalizeRow(doc.id, doc.data()));
        saveInventory(raw);
        preCacheImages(state.rows).then(() => { sortRows(); renderStats(); renderInventory(); });
        // clear any loading state
        setLoading($("btnSbReload"), false);
      }, err => {
        console.error("[Firestore] onSnapshot error:", err.code, err.message);
        setLoading($("btnSbReload"), false);
      });
  }
  function unsubscribeInventory() {
    if (_unsubInventory) { _unsubInventory(); _unsubInventory = null; }
  }

  /* ── Firebase auth state → app state ── */
  function initAuth() {
    fbAuth().onAuthStateChanged(async (user) => {
      if (user) {
        const uid    = user.uid;
        const email  = user.email  || "";
        const dispName = user.displayName || "";
        const photo  = user.photoURL || null;

        // Upsert account in localStorage
        const accounts = getAccounts();
        let acc = accounts.find(a => a.id === uid);
        if (!acc) {
          acc = { id: uid, email, displayName: dispName, photoURL: photo };
          accounts.push(acc);
          saveAccounts(accounts);
        } else {
          // Refresh display info from Firebase
          let changed = false;
          if (dispName && acc.displayName !== dispName) { acc.displayName = dispName; changed = true; }
          if (photo && acc.photoURL !== photo) { acc.photoURL = photo; changed = true; }
          if (changed) saveAccounts(accounts);
        }
        setActiveId(uid);

        // Restore this account's language preference
        if (acc.lang && state.i18n[acc.lang]) {
          state.lang = acc.lang;
          localStorage.setItem("tigertag.lang", acc.lang);
          applyTranslations();
        }

        // Show connected state immediately
        setConnected(acc.displayName || dispName || email, email);

        // Display cached inventory while Firestore connects
        try {
          const raw = JSON.parse(localStorage.getItem(invKey(uid)) || "null");
          if (raw && typeof raw === "object") {
            state.inventory = raw;
            state.rows = Object.entries(raw).map(([k,vv]) => normalizeRow(k, vv || {}));
            await preCacheImages(state.rows);
            sortRows(); renderStats(); renderInventory();
          }
        } catch {}

        // Subscribe to live Firestore data
        subscribeInventory(uid);

      } else {
        // Signed out
        unsubscribeInventory();
        state.inventory = null; state.rows = [];
        renderStats(); renderInventory();
        setDisconnected();
        // Show login modal if no accounts stored
        if (!getAccounts().length) setTimeout(() => openAddAccountModal(), 300);
      }
    });
  }


  /* ── account section UI ── */
  function getInitials(a) {
    const src = a.displayName || a.email || "?";
    return src.split(/[\s@]+/).filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "?";
  }

  function renderAccountList() {
    const el = $("profilesList"); if (!el) return;
    const accounts = getAccounts();
    const activeId = state.activeAccountId;
    const sorted = [...accounts].sort((a, b) => (b.id === activeId ? 1 : 0) - (a.id === activeId ? 1 : 0));
    const SVG_PLUS = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const SVG_CHEVRON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

    let html = "";
    if (!sorted.length) {
      html = `<div style="font-size:12px;color:var(--muted);padding:12px 0;text-align:center">${t("noAccounts")}</div>`;
    } else {
      html = `<div class="prf-list">${sorted.map(acc => {
        const name = esc(acc.displayName || acc.email.split("@")[0]);
        return `
        <button class="prf-account-card" data-prf-id="${esc(acc.id)}">
          <span class="prf-account-avatar" style="background:${getAccGradient(acc)}">${esc(getInitials(acc))}</span>
          <span class="prf-account-info">
            <span class="prf-account-name">${name}</span>
            <span class="prf-account-email">${esc(acc.email)}</span>
          </span>
          <span class="prf-account-chevron">${SVG_CHEVRON}</span>
        </button>`;
      }).join("")}</div>`;
    }
    html += `<button class="stg-add-btn" id="btnShowAddAccount">${SVG_PLUS} ${t("addAccountLabel")}</button>`;
    el.innerHTML = html;

    el.querySelectorAll("[data-prf-id]").forEach(card => {
      card.addEventListener("click", () => {
        const acc = getAccounts().find(a => a.id === card.dataset.prfId);
        if (acc) { closeProfilesModal(); openEditAccountModal(acc); }
      });
    });
    $("btnShowAddAccount").addEventListener("click", openAddAccountModal);
  }

  async function switchAccountUI(id) {
    // With Firebase Auth there is only one active session at a time.
    // Switching to a different account signs out the current user and opens the login modal.
    const currentUser = fbAuth().currentUser;
    if (currentUser && currentUser.uid === id) {
      // Already signed in as this account — just close any open panels
      closeProfilesModal(); closeSettings(); return;
    }
    // Sign out and let onAuthStateChanged open the login modal
    await fbSignOut();
    closeProfilesModal(); closeSettings();
    setTimeout(() => openAddAccountModal(), 250);
  }

  function deleteAccountUI(id) {
    let accounts = getAccounts();
    const wasActive = state.activeAccountId === id;
    accounts = accounts.filter(a => a.id !== id);
    saveAccounts(accounts);
    localStorage.removeItem(invKey(id));
    if (wasActive) {
      fbSignOut(); // triggers onAuthStateChanged(null) which cleans up
    } else {
      renderAccountList();
    }
  }

  /* ── key status (state only — no DOM badge) ── */
  function setKeyStatus(s) {
    state.keyValid = (s === "ok") ? true : (s === "bad") ? false : null;
  }

  /* ── inventory load ── */
  function sortRows() {
    state.rows.sort((a, b) => {
      if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
      return a.uid.localeCompare(b.uid);
    });
  }
  // loadInventory: re-attaches the Firestore listener (called by the Refresh button).
  // The listener itself calls renderInventory/renderStats via onSnapshot.
  function loadInventory() {
    const uid = state.activeAccountId;
    if (!uid) return;
    setLoading($("btnSbReload"), true);
    subscribeInventory(uid); // re-subscribe; listener calls setLoading(false) on first snapshot
  }

  /* ── stats ── */
  function renderStats() {
    const all = deduplicateTwins(state.rows.slice()); const active = all.filter(r => !r.deleted);
    const plus = active.filter(r => r.isPlus);
    const totalW = active.reduce((s, r) => s + (Number(r.weightAvailable)||0), 0);
    const el = $("sbStats");
    if (!all.length) { el.classList.add("hidden"); return; }
    const kgFull = (totalW / 1000).toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:2});
    const kgMini = `${Math.round(totalW / 1000)} kg`;
    el.innerHTML = [
      { label: t("statActive"), mini: t("statActiveMini"), value: active.length,           miniVal: active.length },
      { label: t("statPlus"),   mini: t("statPlusMini"),   value: plus.length,              miniVal: plus.length },
      { label: t("statDiy"),    mini: t("statDiyMini"),    value: active.length-plus.length, miniVal: active.length-plus.length },
      { label: t("statTotal"),  mini: t("statTotalMini"),  value: `${kgFull} kg`,           miniVal: kgMini },
    ].map(s => `<div class="sb-stat" data-mini="${s.mini}" data-mini-val="${s.miniVal}"><div class="label">${s.label}</div><div class="value">${s.value}</div></div>`).join("");
    el.classList.remove("hidden");
  }

  /* ── filter ── */
  function deduplicateTwins(rows) {
    const skip = new Set();
    const result = [];
    for (const row of rows) {
      if (skip.has(row.spoolId)) continue;
      if (row.twinUid) {
        const twinId = String(row.twinUid);
        const twin = rows.find(r =>
          !skip.has(r.spoolId) &&
          r.spoolId !== row.spoolId &&
          (String(r.uid) === twinId || String(r.spoolId) === twinId)
        );
        if (twin) {
          row.hasTwinPair = true;
          skip.add(twin.spoolId);
        }
      }
      skip.add(row.spoolId);
      result.push(row);
    }
    return result;
  }

  function sortRows(rows) {
    if (!state.sortCol) return rows;
    const dir = state.sortDir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      let va = a[state.sortCol], vb = b[state.sortCol];
      if (va == null && vb == null) return 0;
      if (va == null) return dir;
      if (vb == null) return -dir;
      if (typeof va === "boolean") return dir * ((va ? 1 : 0) - (vb ? 1 : 0));
      if (typeof va === "number" && typeof vb === "number") return dir * (va - vb);
      return dir * String(va).localeCompare(String(vb), undefined, { sensitivity: "base" });
    });
  }

  function filteredRows() {
    let rows = state.rows.slice();
    if (!state.showDeleted) rows = rows.filter(r => !r.deleted);
    if (state.search) {
      const q = state.search.toLowerCase();
      rows = rows.filter(r =>
        r.uid.toLowerCase().includes(q) ||
        String(r.material).toLowerCase().includes(q) ||
        String(r.brand).toLowerCase().includes(q) ||
        String(r.colorName).toLowerCase().includes(q)
      );
    }
    return sortRows(deduplicateTwins(rows));
  }

  /* ── render ── */
  function renderInventory() {
    const rows = filteredRows();
    if (rows.length === 0) {
      $("invTableWrap").classList.add("hidden"); $("invGrid").classList.add("hidden");
      $("invEmpty").textContent = state.rows.length === 0 ? t("noInventory") : t("noMatch");
      $("invEmpty").classList.remove("hidden"); return;
    }
    $("invEmpty").classList.add("hidden");
    if (state.viewMode === "grid") {
      $("invTableWrap").classList.add("hidden"); $("invGrid").classList.remove("hidden"); renderGrid(rows);
    } else {
      $("invGrid").classList.add("hidden"); $("invTableWrap").classList.remove("hidden"); renderTable(rows);
    }
  }

  function colorBg(row) {
    const aspects = [row.aspect1, row.aspect2].map(a => (a || '').toLowerCase());
    const isRainbow  = aspects.some(a => a.includes('rainbow') || a.includes('multicolor'));
    const isTricolor = aspects.some(a => a.includes('tricolor') || a.includes('tri color') || a.includes('tricolore'));
    const isBicolor  = aspects.some(a => a.includes('bicolor')  || a.includes('bi color')  || a.includes('bicolore'));
    const stripAlpha = c => (c || '').replace(/FF$/i, '').trim();
    const cls = (row.colorList || []).map(stripAlpha).filter(Boolean);
    const colorType = row.colorType || '';
    if (cls.length >= 2 && colorType === 'conic_gradient') {
      return `conic-gradient(from 0deg, ${cls.join(', ')}, ${cls[0]})`;
    } else if (cls.length >= 2 && colorType === 'gradient') {
      return `linear-gradient(90deg, ${cls.join(', ')})`;
    } else if (cls.length >= 2) {
      const step = 360 / cls.length;
      const stops = cls.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(', ');
      return `conic-gradient(${stops})`;
    } else if (isRainbow && isTricolor) {
      const [c1=`#ff4d4d`, c2=`#ffd93d`, c3=`#4da3ff`] = cls;
      return `linear-gradient(90deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`;
    } else if (isRainbow && isBicolor) {
      const [c1=`#ff7a00`, c2=`#8a2be2`] = cls;
      return `linear-gradient(90deg, ${c1} 0%, ${c2} 100%)`;
    } else if (isRainbow) {
      const colors = [row.colorHex, row.colorHex2, row.colorHex3].filter(Boolean);
      if (colors.length >= 2) return `linear-gradient(90deg, ${colors.join(', ')})`;
      if (colors.length === 1) return colors[0];
      return `linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00cc00, #0000ff, #8b00ff)`;
    } else if (isTricolor) {
      const colors = [row.colorHex, row.colorHex2, row.colorHex3].filter(Boolean);
      const [c1 = '#cccccc', c2 = '#888888', c3] = colors;
      const _c3 = c3 || c1;
      return `conic-gradient(${c1} 0deg 120deg, ${c2} 120deg 240deg, ${_c3} 240deg 360deg)`;
    } else if (isBicolor) {
      const colors = [row.colorHex, row.colorHex2, row.colorHex3].filter(Boolean);
      const [c1 = '#cccccc', c2 = '#ffffff'] = colors;
      return `conic-gradient(${c1} 0deg 180deg, ${c2} 180deg 360deg)`;
    } else {
      return row.colorHex || '#1c2030';
    }
  }

  function colorCircleHTML(row, size = 15) {
    const bg = colorBg(row);
    const borderColor = isColorDark(bg) ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)';
    return `<span class="color-circle" style="width:${size}px;height:${size}px;background:${bg};border-color:${borderColor}"></span>`;
  }

  // Returns true if the first color found in a CSS background string is dark.
  function isColorDark(bg) {
    const m = bg.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
    if (!m) return false;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
  }

  // Dark bg → normal logo (white fill), light bg → contouring logo (black outline)
  function logoSrc(bg) {
    return isColorDark(bg) ? LOGO_PATH : LOGO_PATH_OUTLINE;
  }

  async function preCacheImages(rows) {
    if (!window.electronAPI?.imgGet) return;
    const urls = [...new Set(rows.map(r => r.imgUrl).filter(Boolean))];
    await Promise.all(urls.map(async url => {
      if (!state.imgCache.has(url)) {
        const local = await window.electronAPI.imgGet(url).catch(() => null);
        state.imgCache.set(url, local); // null = lien mort sans cache
      }
    }));
  }

  function resolvedImg(url) {
    if (!url) return null;
    return state.imgCache.has(url) ? state.imgCache.get(url) : url;
  }

  const SVG_TWIN_SMALL = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
  function twinOverlayBadge(r) {
    return r.hasTwinPair ? `<span class="thumb-twin-badge" title="${t('twinBadge')} — ${t('twinTitle')}">${SVG_TWIN_SMALL}</span>` : "";
  }
  function thumbHTML(row, size = 28) {
    const src = row.imgUrl ? resolvedImg(row.imgUrl) : null;
    const overlay = twinOverlayBadge(row);
    const inner = src
      ? `<img class="thumb" src="${esc(src)}" width="${size}" height="${size}" loading="lazy" />`
      : `<span class="thumb-color" style="width:${size}px;height:${size}px;background:${colorBg(row)}"><img src="${logoSrc(colorBg(row))}" /></span>`;
    return `<span class="thumb-wrap">${inner}${overlay}</span>`;
  }

  function renderTable(rows) {
    const tbody = $("invBody"); tbody.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.dataset.id = r.spoolId;
      if (state.selected === r.spoolId) tr.classList.add("selected");
      if (r.deleted) tr.classList.add("deleted");
      const swatch = colorCircleHTML(r, 28);
      let wCell = "-";
      if (r.weightAvailable != null) {
        wCell = `${r.weightAvailable} g`;
        if (r.capacity) { const p = Math.max(0,Math.min(100,Math.round(r.weightAvailable/r.capacity*100))); wCell += `<span class="bar" title="${p}%"><span style="width:${p}%"></span></span>`; }
      }
      tr.innerHTML = `
        <td class="thumb-cell">${thumbHTML(r, 50)}</td>
        <td>${r.isPlus ? '<span class="tag-plus">TigerTag+</span>' : '<span class="tag-diy">TigerTag</span>'}</td>
        <td>${esc(v(r.material))}</td>
        <td>${esc(v(r.brand))}</td>
        <td class="color-cell">${swatch}</td>
        <td>${esc(v(r.colorName))}</td>
        <td style="font-variant-numeric:tabular-nums">${wCell}</td>
        <td style="font-variant-numeric:tabular-nums">${v(r.capacity)}${r.capacity!=null?" g":""}</td>
        <td title="${esc(fmtTs(r.lastUpdate))}">${esc(timeAgo(r.lastUpdate))}</td>`;
      tr.addEventListener("click", () => openDetail(r.spoolId));
      tbody.appendChild(tr);
    }
  }

  function renderGrid(rows) {
    const grid = $("invGrid"); grid.innerHTML = "";
    for (const r of rows) {
      const card = document.createElement("div");
      card.className = "spool-card" + (state.selected===r.spoolId?" selected":"") + (r.deleted?" deleted":"");
      card.dataset.id = r.spoolId;
      const _resolvedCard = r.imgUrl ? resolvedImg(r.imgUrl) : null;
      const imgHtml = _resolvedCard
        ? `<img class="card-img" src="${esc(_resolvedCard)}" loading="lazy" onerror="this.outerHTML='<div class=\\'card-img-color-placeholder\\'style=\\'background:${colorBg(r)}\\'><img src=\\'${logoSrc(colorBg(r))}\\'></div>'" />`
        : `<div class="card-img-color-placeholder" style="background:${colorBg(r)}"><img src="${logoSrc(colorBg(r))}" /></div>`;
      const pct = (r.weightAvailable != null && r.capacity) ? Math.max(0,Math.min(100,Math.round(r.weightAvailable/r.capacity*100))) : null;
      const swatch = colorCircleHTML(r);
      const badge = r.isPlus ? '<span class="tag-plus">TigerTag+</span>' : '<span class="tag-diy">TigerTag</span>';
      card.innerHTML = `
        <div class="card-img-wrap">${imgHtml}${twinOverlayBadge(r)}</div>
        <div class="card-body">
          <div class="card-name">${swatch}${esc(v(r.colorName) !== "-" ? r.colorName : r.material)}</div>
          <div class="card-sub">${esc(v(r.material))} · ${esc(v(r.brand))}</div>
          <div class="card-footer">
            <span class="card-weight">${r.weightAvailable!=null ? r.weightAvailable+" g" : "-"}</span>
            <span style="display:flex;gap:3px;align-items:center">${badge}</span>
          </div>
          ${pct!==null ? `<div class="card-bar"><span style="width:${pct}%"></span></div>` : ""}
        </div>`;
      card.addEventListener("click", () => openDetail(r.spoolId));
      grid.appendChild(card);
    }
  }

  /* ── view toggle ── */
  $("btnViewTable").addEventListener("click", () => {
    state.viewMode = "table"; localStorage.setItem("tigertag.view","table");
    $("btnViewTable").classList.add("active"); $("btnViewGrid").classList.remove("active");
    renderInventory();
  });
  $("btnViewGrid").addEventListener("click", () => {
    state.viewMode = "grid"; localStorage.setItem("tigertag.view","grid");
    $("btnViewGrid").classList.add("active"); $("btnViewTable").classList.remove("active");
    renderInventory();
  });
  if (state.viewMode === "grid") { $("btnViewGrid").classList.add("active"); $("btnViewTable").classList.remove("active"); }

  $("searchInv").addEventListener("input", e => { state.search = e.target.value.trim(); renderInventory(); });

  function updateSortIndicators() {
    document.querySelectorAll("th.sortable").forEach(th => {
      th.classList.toggle("sort-asc",  state.sortCol === th.dataset.sort && state.sortDir === "asc");
      th.classList.toggle("sort-desc", state.sortCol === th.dataset.sort && state.sortDir === "desc");
    });
  }
  document.querySelectorAll("th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      if (state.sortCol === th.dataset.sort) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortCol = th.dataset.sort;
        state.sortDir = "asc";
      }
      updateSortIndicators();
      renderInventory();
    });
  });

  /* ── detail panel ── */
  function openDetail(spoolId) {
    state.selected = spoolId;
    document.querySelectorAll("[data-id]").forEach(el => el.classList.toggle("selected", el.dataset.id === spoolId));
    const r = state.rows.find(x => x.spoolId === spoolId);
    if (!r) return;
    $("panelTitle").textContent = r.colorName && r.colorName !== "-" ? r.colorName : r.material;
    $("panelBody").innerHTML = buildPanelHTML(r);
    // copy raw JSON button
    const btnCopyRaw = $("btnCopyRaw");
    if (btnCopyRaw) {
      btnCopyRaw.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        const pre = $("rawJsonPre");
        const text = pre.textContent;
        navigator.clipboard.writeText(text).then(() => {
          btnCopyRaw.classList.add("copied");
          setTimeout(() => btnCopyRaw.classList.remove("copied"), 1800);
        });
      });
    }
    // twin raw JSON tab switching
    $("panelBody").querySelectorAll("[data-raw-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        $("panelBody").querySelectorAll("[data-raw-tab]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const pre = $("rawJsonPre");
        const raw = decodeURIComponent(btn.dataset.rawTab === "a" ? pre.dataset.rawA : pre.dataset.rawB);
        pre.innerHTML = highlight(raw);
      });
    });
    // video button — YouTube thumbnail opens in browser
    const panelVideoBtn = $("panelVideoBtn");
    if (panelVideoBtn) {
      panelVideoBtn.addEventListener("click", () => {
        window.open(panelVideoBtn.dataset.url);
      });
    }

    $("detailPanel").classList.add("open"); $("panelOverlay").classList.add("open");
    // slider ↔ display ↔ manual input
    const slider    = $("weightSlider");
    const fill      = $("wbFill");
    const display   = $("sliderDisplay");
    const manualIn  = $("panelWeightInput");
    const manualRow = $("manualRow");
    const cap       = Number(slider.max);

    function syncFromValue(val) {
      const w = Math.max(0, Math.min(val, cap));
      slider.value = w;
      fill.style.width = cap ? Math.round(w / cap * 100) + "%" : "0%";
      display.innerHTML = `${w}<span>g</span>`;
    }

    slider.addEventListener("input", () => {
      syncFromValue(Number(slider.value));
      if (!manualRow.classList.contains("hidden")) manualIn.value = slider.value;
    });

    manualIn && manualIn.addEventListener("input", () => {
      syncFromValue(Number(manualIn.value) || 0);
    });

    $("btnManualEdit").addEventListener("click", () => {
      const nowHidden = manualRow.classList.toggle("hidden");
      $("btnManualEdit").textContent = nowHidden ? t("btnEditManually") : t("btnCloseManual");
      if (!nowHidden) { manualIn.value = slider.value; manualIn.focus(); manualIn.select(); }
    });

    $("panelWeightBtn").addEventListener("click", () =>
      doWeightUpdate(r, "direct", slider.value)
    );
    $("panelWeightRawBtn") && $("panelWeightRawBtn").addEventListener("click", () =>
      doWeightUpdate(r, "raw", $("panelWeightRaw").value)
    );
  }
  function closeDetail() {
    // stop any playing video
    const vp = $("panelVideoPlayer"); if (vp) vp.innerHTML = "";
    $("detailPanel").classList.remove("open"); $("panelOverlay").classList.remove("open");
  }
  function parseVideoUrl(url) {
    if (!url) return null;
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
    if (yt) return { type: "youtube", id: yt[1] };
    if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return { type: "direct", src: url };
    return { type: "external", src: url };
  }
  $("panelClose").addEventListener("click", closeDetail);
  $("panelOverlay").addEventListener("click", closeDetail);
  document.addEventListener("keydown", e => { if (e.key==="Escape") closeDetail(); });

  function buildPanelHTML(r) {
    const mat = r.materialData;

    // image + badge overlay
    const badgeLeft = r.isPlus
      ? '<span class="tag-plus panel-img-badge panel-img-badge--tl">TigerTag+</span>'
      : '<span class="tag-diy panel-img-badge panel-img-badge--tl">TigerTag</span>';
    const badgeTwin = r.hasTwinPair
      ? `<span class="tag-twin panel-img-badge panel-img-badge--tr"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>${t("twinBadge")}</span>`
      : "";
    const overlays = badgeLeft + badgeTwin;
    let imgSection = "";
    const _resolvedPanel = r.imgUrl ? resolvedImg(r.imgUrl) : null;
    if (_resolvedPanel) {
      imgSection = `<div class="panel-img-wrap">${overlays}<img class="panel-img" src="${esc(_resolvedPanel)}" onerror="this.outerHTML='<div class=\\'panel-img-color-placeholder\\'style=\\'background:${colorBg(r)}\\'><img src=\\'${logoSrc(colorBg(r))}\\'class=\\'panel-img-logo\\'></div>'" /></div>`;
    } else {
      imgSection = `<div class="panel-img-wrap">${overlays}<div class="panel-img-color-placeholder" style="background:${colorBg(r)}"><img src="${logoSrc(colorBg(r))}" class="panel-img-logo" /></div></div>`;
    }

    // colors — same circle design as table rows
    const colorsHtml = colorCircleHTML(r, 40);

    // print settings — renamed local var to avoid shadowing t()
    const temps = r.temps;
    const hasDirect = temps.nozzleMin || temps.nozzleMax || temps.bedMin || temps.bedMax || temps.dryTemp || temps.dryTime;
    const rec = mat && mat.recommended;
    let tempHtml = "";
    if (hasDirect || rec) {
      const nozzle = temps.nozzleMin && temps.nozzleMax ? `${temps.nozzleMin}–${temps.nozzleMax} °C`
                   : rec ? `${rec.nozzleTempMin}–${rec.nozzleTempMax} °C` : "—";
      const bed    = temps.bedMin && temps.bedMax ? `${temps.bedMin}–${temps.bedMax} °C`
                   : rec ? `${rec.bedTempMin}–${rec.bedTempMax} °C` : "—";
      const dryT   = temps.dryTemp ? `${temps.dryTemp} °C` : rec ? `${rec.dryTemp} °C` : "—";
      const dryH   = temps.dryTime ? `${temps.dryTime} h`  : rec ? `${rec.dryTime} h`  : "—";
      const density = mat && mat.density ? `<div style="margin-top:8px;font-size:12px;color:var(--muted)">${t("lbDensity")}: ${mat.density} g/cm³</div>` : "";
      tempHtml = `
      <div class="panel-section">
        <div class="panel-label">${t("sectionPrint")}</div>
        <div class="temp-grid">
          <div class="temp-chip"><div class="tc-label">${t("lbNozzle")}</div><div class="tc-value">${nozzle}</div></div>
          <div class="temp-chip"><div class="tc-label">${t("lbBed")}</div><div class="tc-value">${bed}</div></div>
          <div class="temp-chip"><div class="tc-label">${t("lbDryTemp")}</div><div class="tc-value">${dryT}</div></div>
          <div class="temp-chip"><div class="tc-label">${t("lbDryTime")}</div><div class="tc-value">${dryH}</div></div>
        </div>
        ${density}
      </div>`;
    }

    // info badges (Refill / Recycled / Filled)
    const infoBadges = [
      r.isRefill   ? t("badgeRefill")   : null,
      r.isRecycled ? t("badgeRecycled") : null,
      r.isFilled   ? t("badgeFilled")   : null,
    ].filter(Boolean);
    const infoHtml2 = infoBadges.length ? `<div class="aspect-chips" style="margin-top:8px">${infoBadges.map(b=>`<span class="aspect-chip">${b}</span>`).join("")}</div>` : "";

    // video player (YouTube thumbnail→browser OR direct MP4 inline)
    const videoInfo = parseVideoUrl(r.links.youtube);
    let videoHtml = "";
    if (videoInfo) {
      if (videoInfo.type === "youtube") {
        // YouTube: embed bloqué (err 153) → miniature cliquable, s'ouvre dans le navigateur
        const thumb = `https://img.youtube.com/vi/${esc(videoInfo.id)}/hqdefault.jpg`;
        videoHtml = `
      <div class="panel-video-section">
        <button class="panel-yt-thumb" id="panelVideoBtn" data-url="${esc(r.links.youtube)}">
          <img src="${thumb}" alt="YouTube" loading="lazy" onerror="this.style.display='none'" />
          <div class="pvt-play"><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" style="margin-left:3px"><path d="M8 5v14l11-7z"/></svg></div>
        </button>
      </div>`;
      } else if (videoInfo.type === "direct") {
        // MP4/WebM direct → lecteur inline immédiat, pleine largeur
        videoHtml = `
      <div class="panel-video-section">
        <div class="panel-video-player">
          <video src="${esc(videoInfo.src)}" controls></video>
        </div>
      </div>`;
      }
      // type "external" → link-btn géré dans linkDefs ci-dessous
    }

    // doc links (MSDS, TDS, RoHS, REACH, food — video handled separately above)
    const SVG_PDF = `<svg width="11" height="13" viewBox="0 0 11 13" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M2 1h5l3 3v8H2V1z"/><path d="M7 1v3h3" stroke-width="1"/><path d="M3.5 7h4M3.5 9h2.5" stroke-width="1.1"/></svg>`;
    const linkDefs = [
      { key: "msds",  label: "MSDS" },
      { key: "tds",   label: "TDS" },
      { key: "rohs",  label: "RoHS" },
      { key: "reach", label: "REACH" },
      { key: "food",  label: t("linkFood") },
      ...(videoInfo?.type === "external" ? [{ key: "youtube", label: t("linkYt") }] : []),
    ];
    const activeLinks = linkDefs.filter(l => r.links[l.key]);
    const linksHtml = activeLinks.length ? `
      <div class="panel-section">
        <div class="panel-label">${t("sectionLinks")}</div>
        <div class="links-row">${activeLinks.map(l => `<a class="link-btn" href="${esc(r.links[l.key])}" target="_blank" rel="noopener">${SVG_PDF}${l.label}</a>`).join("")}</div>
      </div>` : "";

    // weight
    const cap = r.capacity || 1000;
    const curW = r.weightAvailable != null ? r.weightAvailable : 0;
    const weightHtml = `
      <div class="panel-section">
        <div class="panel-label">${t("sectionWeight")}</div>
        <div class="weight-bar-wrap">
          <div class="wb-labels">
            <div class="wb-val" id="sliderDisplay">${curW}<span>g</span></div>
            <div class="wb-cap">${t("weightTotal", {cap})}</div>
          </div>
          <div class="wb-track">
            <div class="wb-fill" id="wbFill" style="width:${Math.round(curW/cap*100)}%"></div>
            <input type="range" id="weightSlider" min="0" max="${cap}" step="1" value="${curW}" />
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:5px">
            <span>0 g</span><span>${cap} g</span>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button id="panelWeightBtn" class="primary sm"><span class="spinner"></span><span class="label">${t("btnUpdate")}</span></button>
          <button id="btnManualEdit" class="ghost sm">${t("btnEditManually")}</button>
          <span style="font-size:11px;color:var(--muted)">${t("weightContainer", {cw: v(r.containerWeight)})}</span>
        </div>

        <div class="weight-manual-row hidden" id="manualRow">
          <input type="number" id="panelWeightInput" min="0" max="${cap}" step="1" placeholder="exact g" />
          <span style="font-size:12px;color:var(--muted)">g net</span>
        </div>

        <details style="margin-top:10px">
          <summary style="font-size:12px;color:var(--muted);cursor:pointer;user-select:none">${t("rawScaleLabel")}</summary>
          <div style="margin-top:8px">
            <div class="weight-mode-hint">${t("rawScaleHint")}</div>
            <div class="weight-form">
              <input type="number" id="panelWeightRaw" min="0" step="1" placeholder="e.g. ${r.containerWeight ? curW + Number(r.containerWeight) : 800} g" />
              <button id="panelWeightRawBtn" class="primary sm"><span class="spinner"></span><span class="label">${t("btnUpdate")}</span></button>
            </div>
          </div>
        </details>

        <div id="panelWeightResult"></div>
      </div>`;

    // info rows
    const infoRows = [
      [t("detUid"),           r.uid],
      [t("detType"),          r.productType],
      [t("detSeries"),        r.series],
      [t("detBrand"),         r.brand],
      [t("detMaterial"),      r.material],
      [t("detDiameter"),      r.diameter],
      [t("detTagType"),       r.tagType],
      [t("detSku"),           r.sku],
      [t("detBarcode"),       r.barcode],
      [t("detContainer"),     r.containerId],
      [t("detTwin"),          r.twinUid],
      [t("detUpdated"),       fmtTs(r.lastUpdate)],
      ...(!r.isPlus && fmtChipTs(r.chipTimestamp) ? [[t("detManufactured"), fmtChipTs(r.chipTimestamp)]] : []),
    ].filter(([,val]) => val && val !== "-");

    const infoHtml = `
      <div class="panel-section">
        <div class="panel-label">${t("sectionDetails")}</div>
        ${infoRows.map(([k,val]) => `<div class="panel-row"><span class="pk">${k}</span><span class="pv">${esc(String(val))}</span></div>`).join("")}
        <div style="margin-top:8px;display:flex;gap:6px">
          ${r.isPlus ? '<span class="tag-plus">TigerTag+</span>' : '<span class="tag-diy">TigerTag</span>'}
          ${r.deleted ? `<span class="badge bad" style="font-size:11px">${t("badgeDeleted")}</span>` : ""}
        </div>
      </div>`;

    // container card (no title)
    const container = r.containerId ? containerFind(r.containerId) : null;
    const containerHtml = container ? `
      <div class="panel-section">
        <div class="container-card">
          <img src="${esc(container.img)}" alt="${esc(container.brand)}" onerror="this.style.display='none'" />
          <div class="container-card-info">
            <div class="container-card-line1">${esc(container.brand)} · ${esc(container.label)}</div>
            <div class="container-card-line2">${esc(container.type)} · ${container.container_weight} g</div>
          </div>
        </div>
      </div>` : "";

    // aspects + badges that go to the right of the color circles
    const aspectChips = [r.aspect1, r.aspect2].filter(a => a && a !== "-" && a !== "None");
    const aspectHtml = aspectChips.length
      ? `<div class="aspect-chips">${aspectChips.map(a => `<span class="aspect-chip">${esc(a)}</span>`).join("")}</div>`
      : "";
    const badgeHtml = infoBadges.length
      ? `<div class="aspect-chips">${infoBadges.map(b => `<span class="aspect-chip">${b}</span>`).join("")}</div>`
      : "";

    return `
      ${imgSection}
      <div class="panel-section">
        <div class="panel-label">${t("sectionColors", {n: r.colorList.length})} &amp; Aspect</div>
        <div class="color-aspect-row">
          <div class="color-circles-col">
            ${colorsHtml || '<span style="color:var(--muted);font-size:13px">—</span>'}
          </div>
          <div class="aspect-col">
            ${aspectHtml}
            ${badgeHtml}
          </div>
        </div>
      </div>
      ${weightHtml}
      ${containerHtml}
      ${tempHtml}
      ${videoHtml}
      ${linksHtml}
      ${infoHtml}
      <div class="panel-section">
        <details class="debug" id="rawDetails">
          <summary style="display:flex;align-items:center;justify-content:space-between">
            <strong>${t("sectionRaw")}</strong>
            <button class="stg-copy-btn" id="btnCopyRaw" title="Copy JSON" style="height:26px;width:26px;flex-shrink:0">${SVG_COPY}</button>
          </summary>
          ${(() => {
            if (!r.hasTwinPair) {
              return `<pre class="json" id="rawJsonPre" style="margin-top:10px;max-height:400px">${highlight(r.raw)}</pre>`;
            }
            const twin = state.rows.find(x => x.spoolId !== r.spoolId && (String(x.uid) === String(r.twinUid) || String(x.spoolId) === String(r.twinUid)));
            const twinRaw = twin ? twin.raw : {};
            return `
            <div class="raw-tabs" style="margin-top:10px">
              <button class="raw-tab active" data-raw-tab="a">${t("twinTabThis")}</button>
              <button class="raw-tab" data-raw-tab="b">${t("twinTabTwin")}</button>
            </div>
            <pre class="json" id="rawJsonPre" style="max-height:400px" data-raw-a="${encodeURIComponent(JSON.stringify(r.raw, null, 2))}" data-raw-b="${encodeURIComponent(JSON.stringify(twinRaw, null, 2))}">${highlight(r.raw)}</pre>`;
          })()}
        </details>
      </div>`;
  }

  async function doWeightUpdate(r, mode = "direct", w = "") {
    // Studio Manager has the full inventory in memory — same model as the mobile app.
    // Tare and twin logic are client-side; we write directly to Firestore.
    const uid = state.activeAccountId; if (!uid) return;
    if (w === "" || isNaN(Number(w))) { toast($("panelWeightResult"), "bad", t("enterNumeric")); return; }

    const btn = mode === "raw" ? $("panelWeightRawBtn") : $("panelWeightBtn");
    setLoading(btn, true);
    try {
      const rawW = Number(w);
      const cw   = Number(r.containerWeight) || 0;
      const cap  = Number(r.capacity) || 1000;

      // Tare: raw mode = scale reading includes container; direct mode = net weight
      const weightAvailable = mode === "raw" ? rawW - cw : rawW;
      const weightDisplay   = mode === "raw" ? rawW : rawW + cw; // gross for toast

      if (weightAvailable < 0 || weightAvailable > cap) {
        toast($("panelWeightResult"), "bad", t("weightErr", { r: `${weightAvailable} g — hors plage [0–${cap} g]` }));
        setLoading(btn, false); return;
      }

      const update = { weight_available: weightAvailable, last_update: Date.now() };
      const invRef = fbDb().collection("users").doc(uid).collection("inventory");
      const batch  = fbDb().batch();
      batch.update(invRef.doc(r.spoolId), update);

      // Twin — client already knows the twin relationship (same as mobile app)
      let twinUpdated = false;
      if (r.twinUid) {
        const twinRow = state.rows.find(row =>
          row.spoolId !== r.spoolId &&
          (String(row.uid) === String(r.twinUid) || String(row.spoolId) === String(r.twinUid))
        );
        if (twinRow) { batch.update(invRef.doc(twinRow.spoolId), update); twinUpdated = true; }
      }

      await batch.commit();
      // onSnapshot propagates the change to the UI automatically — no loadInventory() needed
      toast($("panelWeightResult"), "ok",
        t("weightOk", { wa: weightAvailable, w: weightDisplay, cw }) +
        (twinUpdated ? t("weightOkTwin") : "")
      );
      // Refresh detail panel once onSnapshot fires (give Firestore ~500 ms)
      setTimeout(() => {
        if ($("detailPanel").classList.contains("open") && state.selected === r.spoolId) openDetail(r.spoolId);
      }, 500);

    } catch (e) { toast($("panelWeightResult"), "bad", e.message || t("networkError")); }
    finally { setLoading(btn, false); }
  }

  /* ── debug panel ── */
  function openDebug()  { $("debugPanel").classList.add("open");  $("debugOverlay").classList.add("open"); }
  function closeDebug() { $("debugPanel").classList.remove("open"); $("debugOverlay").classList.remove("open"); }
  $("btnDebug").addEventListener("click", openDebug);
  $("debugPanelClose").addEventListener("click", closeDebug);
  $("debugOverlay").addEventListener("click", closeDebug);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDebug(); });

  /* ── community buttons ── */
  $("sbGithubBtn").addEventListener("click", () => window.open("https://github.com/TigerTag-Project/TigerTag_Studio_Manager/"));
  $("sbMakerWorldBtn").addEventListener("click", () => window.open("https://makerworld.com/fr/@TigerTag/upload"));
  $("sbDiscordBtn").addEventListener("click", () => window.open("https://discord.gg/3Qv5TSqnJH"));
  $("sbQrWrap").addEventListener("click", () => window.open("https://taap.it/DF1Aqt"));

  /* ── language select ── */
  function saveAccountLang(lang) {
    // persist on the active account object so switching accounts restores its language
    const accounts = getAccounts();
    const acc = accounts.find(a => a.id === getActiveId());
    if (acc) { acc.lang = lang; saveAccounts(accounts); }
    localStorage.setItem("tigertag.lang", lang); // global fallback
  }
  function applyLang(lang) {
    if (!lang || !state.i18n[lang]) return;
    state.lang = lang;
    applyTranslations();
    renderStats();
    renderInventory();
    if (state.selected && $("detailPanel").classList.contains("open")) openDetail(state.selected);
  }
  $("langSelect").addEventListener("change", () => {
    const lang = $("langSelect").value;
    saveAccountLang(lang);
    applyLang(lang);
    pingHealth();
  });

  /* ── init ── */
  loadLocales().then(() => {
    applyTranslations();
    return loadLookups();
  }).then(() => {
    runMigration(); // wipe legacy API-key accounts before Firebase takes over
    initAuth();    // start Firebase auth state listener
  });

  // ── Electron RFID integration ──
  if (window.electronAPI) {

    // Reader connect / disconnect
    window.electronAPI.onReaderStatus(({ connected, name }) => {
      const el = $("rfidStatus");
      const lbl = $("rfidLabel");
      el.style.display = "flex";
      el.classList.toggle("ok",  connected);
      el.classList.toggle("bad", !connected);
      lbl.textContent = connected ? t("rfidConnected", {name: name || "—"}) : t("rfidNoReader");
    });

    // Card scanned → find spool and open detail panel
    window.electronAPI.onRfid((uid, rawHex) => {
      console.log('[RFID] scanned uid:', uid, 'raw:', rawHex);

      // Flash the RFID indicator
      const el = $("rfidStatus");
      el.style.display = "flex";
      el.classList.add("ok");
      $("rfidLabel").textContent = t("rfidScanned", {uid: uid.slice(-6)});

      // Search in loaded inventory
      const row = state.rows.find(r => r.uid === uid || r.spoolId === uid);
      if (row) {
        openDetail(row.spoolId);
        return;
      }

      // Unknown UID — show a toast and pre-fill RFID field if panel is open
      toast($("mainResult"), "warn", t("rfidNotFound", {uid}));
    });

    // Auto-update notification
    window.electronAPI.onUpdateStatus(({ status }) => {
      const banner = $("updateBanner");
      const msg    = $("updateMsg");
      const btn    = $("btnInstallUpdate");
      if (status === 'available') {
        msg.innerHTML = t("updateDownloading");
        btn.classList.add("hidden");
        banner.classList.remove("hidden");
      } else if (status === 'ready') {
        msg.innerHTML = t("updateReady");
        btn.textContent = t("btnRestartUpdate");
        btn.classList.remove("hidden");
        banner.classList.remove("hidden");
      }
    });
    $("btnInstallUpdate").addEventListener("click", () => window.electronAPI.installUpdate());
  }
})();
