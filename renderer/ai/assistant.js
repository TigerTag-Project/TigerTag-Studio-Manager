/**
 * renderer/ai/assistant.js — the AI assistant window (sidebar button under the
 * notifications). A beginner's way in to the MCP servers (docs/MCP.md):
 *
 *   • a guided first connection, one question per screen: which assistant →
 *     where (this computer / web and phone, skipped when only one applies) →
 *     what it may do (look / tidy up, local only) → plug it in → wait for it;
 *   • the wait ends by itself: on this computer the first tool call relayed by
 *     main (aiOnToolCall), online a new grant in the Hub's list (polled every
 *     5 s, only while that screen is open);
 *   • a ceremony when it is plugged in, then the dashboard: status, three
 *     suggested questions built from the user's own stock (ticked when the
 *     matching tool is called), the live feed of what the assistant does (local
 *     server only — online calls run on the Hub), and its journaled changes,
 *     each undoable from here.
 *
 *   initAiAssistant(ctx)  — ctx: t, esc, openDialog, api (window.mcpBridge),
 *                           uid(), spoolCount(), spoolName(id), sample(),
 *                           idToken(), openExternal(url), guideUrl(client),
 *                           journal(), undo(changeId), openSettings(),
 *                           glow(spoolIds), flash(msg)
 *   aiOnToolCall(ev)      — { name, args, ok, result } after every local tool call
 *   openAiAssistant()     — opens the window (wizard until plugged in, else dashboard)
 *   aiAccountChanged()    — repaint the sidebar button for the signed-in account
 * Per account, `tigertag.ai.<uid>` = { connectedAt, via: "local" | "online", client }.
 */

let ctx = null;
const HOSTED_URL = "https://mcp.tigersystem.io/mcp";
const CLAUDE_DOWNLOAD = "https://claude.ai/download";
// Which assistant, where it runs (local = Studio's server, web = the Hub's), its logo class.
const CLIENTS = [
  { id: "claude",  name: "Claude",   logo: "claude",  local: "claude-desktop", web: true },
  { id: "chatgpt", name: "ChatGPT",  logo: "chatgpt", web: true },
  { id: "cursor",  name: "Cursor",   logo: "cursor",  local: "cursor" },
  { id: "vscode",  name: "VS Code",  logo: "vscode",  local: "vscode" },
  { id: "lechat",  name: "Le Chat",  logo: "mistral", web: true },
  { id: "grok",    name: "Grok",     logo: "grok",    web: true },
];
// The suggested questions, and the tool call that ticks each one.
const TRY_TOOLS = { stock: ["search_inventory", "inventory_summary"], print: ["match_filaments"], low: ["inventory_summary"], weight: ["set_spool_weight"] };

let win = null;          // { card, close } of the open window
let flow = null;         // the wizard's answers: { step, client, where, rights, since }
let pollT = null;        // online wait: the grants poll
const feed = [];         // this session's tool calls, newest first (30)
const tried = new Set(); // suggested questions already answered by a tool call

const $q = (sel, root) => (root || document).querySelector(sel);
const prefsKey = () => `tigertag.ai.${ctx.uid()}`;
function prefs() { try { return JSON.parse(localStorage.getItem(prefsKey()) || "null") || {}; } catch (_) { return {}; } }
function savePrefs(p) { try { localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch (_) {} }
const plugged = () => !!prefs().connectedAt;

export function initAiAssistant(c) {
  ctx = c;
  const btn = document.getElementById("btnOpenAi");
  if (!btn || !ctx.api) return;   // no local MCP (Studio Web): no window
  btn.hidden = false;
  btn.addEventListener("click", openAiAssistant);
}

export function aiAccountChanged() {
  if (!ctx) return;
  const on = ctx.uid() && plugged();
  const pill = document.getElementById("aiNewPill"), dot = document.getElementById("aiDot");
  if (pill) pill.hidden = !ctx.uid() || on;
  if (dot) dot.hidden = !on;
  stopPoll();
  flow = null;
  win?.close(); win = null;
}

export function openAiAssistant() {
  if (!ctx?.uid()) return;
  win?.close();
  if (!flow || flow.step === "done") flow = plugged() ? { step: "dash" } : { step: "welcome" };
  win = ctx.openDialog({
    look: "notice", cls: "ai-win", icon: "robot", body: `<div class="ai-body"></div>`,
    onDismiss: () => { win = null; stopPoll(); },
    // openDialog calls wire() before it returns: keep the handle here so paint() finds it.
    wire: (card, close) => { win = { card, close }; card.addEventListener("click", onClick); paint(); },
  });
}

// ── The wizard's screens ──────────────────────────────────────────────────
// The steps actually shown for these answers: "where" only when the assistant
// runs in both places, "rights" only on this computer (online is read only).
function steps() {
  const c = CLIENTS.find(x => x.id === flow.client);
  const s = ["who"];
  if (c?.local && c?.web) s.push("where");
  if (where() === "local") s.push("rights");
  return [...s, "connect", "wait"];
}
function where() {
  const c = CLIENTS.find(x => x.id === flow.client);
  if (!c) return null;
  if (c.local && c.web) return flow.where || null;
  return c.local ? "local" : "web";
}

function paint() {
  const body = win && $q(".ai-body", win.card);
  if (!body) return;
  const { t, esc } = ctx;
  const head = (title) => {
    const list = steps(), i = list.indexOf(flow.step);
    return `<div class="ai-steps" aria-hidden="true">${list.map((_, k) => `<span class="${k <= i ? "is-on" : ""}"></span>`).join("")}</div>
      <p class="ai-stepof">${esc(t("aiStepOf", { n: i + 1, total: list.length }))}</p>
      <h2 class="tsq-title ai-q">${esc(title)}</h2>`;
  };
  const nav = (next = true, nextOk = true) => `<div class="ai-nav">
      <button type="button" class="secondary" data-ai="back">${esc(t("aiBack"))}</button>
      ${next ? `<button type="button" class="primary" data-ai="next"${nextOk ? "" : " disabled"}>${esc(t("aiNext"))}</button>` : ""}
    </div>`;
  const card = (id, sel, title, sub, icon) => `<button type="button" class="ai-choice${sel ? " is-sel" : ""}" data-ai-pick="${id}" aria-pressed="${sel}">
      <span class="icon icon-${icon} icon-18" aria-hidden="true"></span><span class="ai-choice-text"><b>${esc(title)}</b><small>${esc(sub)}</small></span></button>`;
  const s = flow.step;
  win.card.classList.toggle("ai-win--dash", s === "dash");

  if (s === "welcome") {
    body.innerHTML = `
      <span class="sqn-kicker">${esc(t("aiWelcomeKicker"))}</span>
      <h2 class="tsq-title">${esc(t("aiWelcomeTitle"))}</h2>
      <p class="tsq-desc">${esc(t("aiWelcomeText"))}</p>
      <ul class="ai-examples">
        <li><span class="icon icon-printer icon-16" aria-hidden="true"></span>${esc(t("aiEx3mf"))}</li>
        <li><span class="icon icon-qr icon-16" aria-hidden="true"></span>${esc(t("aiExQr"))}</li>
        <li><span class="icon icon-pdf icon-16" aria-hidden="true"></span>${esc(t("aiExInvoice"))}</li>
      </ul>
      <button type="button" class="primary ai-wide" data-ai="start">${esc(t("aiStart"))}</button>`;
  } else if (s === "who") {
    body.innerHTML = head(t("aiQWho")) + `
      <div class="ai-tiles">${CLIENTS.map(c => `<button type="button" class="ai-tile${flow.client === c.id ? " is-sel" : ""}" data-ai-client="${c.id}" aria-pressed="${flow.client === c.id}">
          <span class="eac-mcp-logo eac-mcp-logo--${c.logo}" aria-hidden="true"></span><span>${esc(c.name)}</span></button>`).join("")}
        <button type="button" class="ai-tile${flow.client === "none" ? " is-sel" : ""}" data-ai-client="none" aria-pressed="${flow.client === "none"}">
          <span class="icon icon-question icon-24" aria-hidden="true"></span><span>${esc(t("aiNone"))}</span></button>
      </div>
      ${flow.client === "none" ? `<p class="ai-hint">${esc(t("aiNoneHint"))}</p>
        <button type="button" class="secondary ai-wide" data-ai="getclaude"><span class="icon icon-download icon-14" aria-hidden="true"></span>${esc(t("aiGetClaude"))}</button>` : ""}
      ${nav(true, !!flow.client && flow.client !== "none")}`;
  } else if (s === "where") {
    body.innerHTML = head(t("aiQWhere")) + `<div class="ai-choices">
        ${card("local", flow.where === "local", t("aiWhereLocal"), t("aiWhereLocalSub"), "home")}
        ${card("web", flow.where === "web", t("aiWhereWeb"), t("aiWhereWebSub"), "globe")}</div>` + nav(true, !!flow.where);
  } else if (s === "rights") {
    body.innerHTML = head(t("aiQRights")) + `<div class="ai-choices">
        ${card("read", flow.rights !== "write", t("aiRightsRead"), t("aiRightsReadSub"), "eye-on")}
        ${card("write", flow.rights === "write", t("aiRightsWrite"), t("aiRightsWriteSub"), "edit")}</div>` + nav();
  } else if (s === "connect") {
    const c = CLIENTS.find(x => x.id === flow.client);
    body.innerHTML = head(t("aiQConnect")) + (where() === "local"
      ? `<p class="tsq-desc">${esc(t("aiConnectLocal", { app: c.name }))}</p>
         <button type="button" class="primary ai-wide" data-ai="install"><span class="eac-mcp-logo eac-mcp-logo--${c.logo}" aria-hidden="true"></span>${esc(t("aiConnectLocalBtn", { app: c.name }))}</button>`
      : `<p class="tsq-desc">${esc(t("aiConnectWeb", { app: c.name }))}</p>
         <div class="ai-url"><code>${esc(HOSTED_URL)}</code></div>
         <button type="button" class="primary ai-wide" data-ai="webcopy"><span class="icon icon-copy icon-14" aria-hidden="true"></span>${esc(t("aiConnectWebBtn"))}</button>`) + nav(false);
  } else if (s === "wait") {
    body.innerHTML = head(t("aiWaitTitle")) + `
      <div class="ai-wait"><span class="ai-wait-robot" aria-hidden="true"><span class="icon icon-robot"></span></span>
        <p class="tsq-desc">${esc(t("aiWaitText"))}</p>
        <button type="button" class="ai-prompt" data-ai-copy="${esc(t("aiWaitPrompt"))}"><span>« ${esc(t("aiWaitPrompt"))} »</span><span class="icon icon-copy icon-14" aria-hidden="true"></span></button>
        <p class="ai-waiting" role="status">${esc(t("aiWaiting"))}</p></div>
      <div class="ai-nav"><button type="button" class="secondary" data-ai="back">${esc(t("aiBack"))}</button>
        <button type="button" class="secondary" data-ai="manual">${esc(t("aiWaitDone"))}</button></div>`;
  } else {
    paintDash(body);
  }
}

// ── The dashboard (once plugged in) ───────────────────────────────────────
async function paintDash(body) {
  const { t, esc } = ctx;
  const cfg = await ctx.api.getConfig().catch(() => null);
  const rights = !cfg?.enabled ? t("aiStatusOff") : cfg.write ? t("aiStatusWrite") : t("aiStatusRead");
  const sample = ctx.sample();
  const tries = [
    { id: "stock", text: t("aiTryStock", { what: sample.what }) },
    { id: "print", text: t("aiTry3mf") },
    cfg?.write && sample.spool ? { id: "weight", text: t("aiTryWeight", { name: sample.spool }) } : { id: "low", text: t("aiTryLow") },
  ];
  const changes = ctx.journal().filter(c => c.kind !== "undo").slice(-6).reverse();
  if (!win || flow.step !== "dash") return;
  body.innerHTML = `
    <h2 class="tsq-title">${esc(t("aiTitle"))}</h2>
    <div class="ai-status">
      <span class="ai-chip${cfg?.enabled ? " is-on" : ""}"><span class="icon icon-home icon-12" aria-hidden="true"></span>${esc(t("aiStatusLocal", { rights }))}</span>
      <span class="ai-chip" id="aiWebChip"><span class="icon icon-globe icon-12" aria-hidden="true"></span>${esc(t("aiStatusWeb", { n: "…" }))}</span>
    </div>
    <div class="panel-label">${esc(t("aiTryTitle"))}</div>
    ${tries.map(x => `<button type="button" class="ai-prompt${tried.has(x.id) ? " is-done" : ""}" data-ai-copy="${esc(x.text)}">
        <span class="icon icon-${tried.has(x.id) ? "check" : "circle"} icon-14" aria-hidden="true"></span><span class="ai-prompt-text">« ${esc(x.text)} »</span>
        ${tried.has(x.id) ? `<small>${esc(t("aiTryDone"))}</small>` : `<span class="icon icon-copy icon-14" aria-hidden="true"></span>`}</button>`).join("")}
    <div class="panel-label">${esc(t("aiFeedTitle"))}</div>
    <div class="ai-feed" id="aiFeed">${feedHtml()}</div>
    <p class="ai-hint">${esc(t("aiFeedWebNote"))}</p>
    ${changes.length ? `<div class="panel-label">${esc(t("aiChangesTitle"))}</div><div class="ai-feed">${changes.map(changeHtml).join("")}</div>` : ""}
    <div class="ai-nav">
      <button type="button" class="secondary" data-ai="another">${esc(t("aiAnother"))}</button>
      <button type="button" class="secondary" data-ai="settings"><span class="icon icon-settings icon-14" aria-hidden="true"></span>${esc(t("aiSettings"))}</button>
    </div>`;
  // Online assistants: one call to the Hub's list (the same as My profile).
  try {
    const token = await ctx.idToken();
    const res = token ? await ctx.api.hostedGrants(token) : null;
    const chip = document.getElementById("aiWebChip");
    const grants = res?.ok ? res.json?.grants : null;
    if (chip && Array.isArray(grants)) {
      chip.lastChild.textContent = t("aiStatusWeb", { n: grants.length });
      chip.classList.toggle("is-on", grants.length > 0);
    }
  } catch (_) {}
}

function feedHtml() {
  const { t, esc } = ctx;
  if (!feed.length) return `<p class="ai-empty">${esc(t("aiFeedEmpty"))}</p>`;
  return feed.map(ev => {
    const d = describe(ev);
    return `<div class="ai-ev${ev.fresh ? " is-fresh" : ""}${ev.ok ? "" : " is-refused"}">
      <span class="icon icon-${d.icon} icon-14" aria-hidden="true"></span><span class="ai-ev-text">${esc(d.text)}</span>
      ${d.undo ? undoBtn(d.undo) : ""}</div>`;
  }).join("");
}
// A journaled change, worded like the live feed (the journal's own summary is
// for the assistant, in English).
function changeHtml(c) {
  const doc = c.docs?.[0] || {};
  const result = { spool_id: doc.id || c.spool_id, before: doc.before || c.before, after: doc.after || c.after,
    created: c.created, name: c.rack_name };
  const d = describe({ name: c.tool, ok: true, result });
  return `<div class="ai-ev"><span class="icon icon-${d.icon} icon-14" aria-hidden="true"></span>
    <span class="ai-ev-text">${ctx.esc(d.text)}</span>${["spool", "product", "rack"].includes(c.kind) ? undoBtn(c.id, !!c.undoneAt) : ""}</div>`;
}
function undoBtn(id, done = false) {
  const { t, esc } = ctx;
  return done ? `<small class="ai-undone">${esc(t("aiUndone"))}</small>`
    : `<button type="button" class="secondary sm ai-undo" data-ai-undo="${esc(id)}">${esc(t("aiUndo"))}</button>`;
}

// One tool call → a line people read. Names come from the result, else the spool id.
function describe({ name, args = {}, ok, result = {} }) {
  const t = ctx.t, nm = id => ctx.spoolName(id) || id || "";
  if (!ok) return { icon: "lock", text: t("aiAct_refused") };
  const q = args.query || args.material || args.brand || args.ean || args.sku;
  switch (name) {
    case "search_inventory": return { icon: "search", text: t("aiAct_search", { q: q ? ` « ${q} »` : "", n: result.total_matches ?? 0 }) };
    case "get_spool": return { icon: "eye-on", text: t("aiAct_spool", { name: result.name || nm(args.spool_id) }) };
    case "inventory_summary": return { icon: "bars", text: t("aiAct_summary", { n: result.spools ?? "?", kg: result.remaining_kg ?? "?" }) };
    case "list_racks": return { icon: "rack-grid", text: t("aiAct_racks") };
    case "find_free_slots": return { icon: "rack-grid", text: t("aiAct_free", { n: result.total_free ?? 0 }) };
    case "list_printers": case "list_devices": return { icon: "printer", text: t("aiAct_printers") };
    case "search_catalog": return { icon: "search", text: t("aiAct_catalog", { n: result.total_matches ?? 0 }) };
    case "match_filaments": return { icon: "printer", text: t("aiAct_match", { ok: (result.slots || []).filter(s => s.covered).length, n: (result.slots || []).length }) };
    case "identify_spool": return { icon: "qr", text: t("aiAct_identify", { name: result.spool?.name || result.product?.title || "?" }) };
    case "set_spool_weight": return { icon: "scale", undo: result.change_id, text: t("aiAct_weight", { name: nm(result.spool_id), after: result.after?.weight_available, before: result.before?.weight_available }) };
    case "update_spool": return { icon: "edit", undo: result.change_id, text: t("aiAct_edit", { name: nm(result.spool_id) }) };
    case "move_spool": return { icon: "move", undo: result.change_id, text: t(result.after?.rack ? "aiAct_move" : "aiAct_unstore", { name: nm(result.spool_id) }) };
    case "update_product": return { icon: "tag", undo: result.change_id, text: t("aiAct_product", { name: nm(result.spool_id) }) };
    case "create_spools": return { icon: "plus", text: t("aiAct_create", { n: (result.created || result.spool_ids || []).length }) };
    case "create_rack": return { icon: "plus", text: t("aiAct_rack", { name: result.name || "" }) };
    case "rename_rack": return { icon: "edit", undo: result.change_id, text: t("aiAct_rename", { name: result.after?.name || "" }) };
    case "undo_change": return { icon: "undo", text: t("aiAct_undo") };
    case "get_label": return { icon: "qr", text: t("aiAct_label", { name: nm(result.spool_id) }) };
    default: return { icon: "eye-on", text: t("aiAct_other") };
  }
}

// ── A tool call relayed by main (local server) ────────────────────────────
export function aiOnToolCall(ev) {
  if (!ctx) return;
  feed.forEach(e => { e.fresh = false; });
  feed.unshift({ ...ev, fresh: true, at: Date.now() });
  feed.length = Math.min(feed.length, 30);
  const before = tried.size;
  if (ev.ok) for (const [id, tools] of Object.entries(TRY_TOOLS)) if (tools.includes(ev.name)) tried.add(id);
  // The spools it looked at or changed light up in the main view.
  const r = ev.result || {};
  const ids = [r.spool_id, r.spool?.id, ...(r.spools || []).slice(0, 20).map(s => s.id), ...(r.created || []).map(c => c.spool_id)].filter(Boolean);
  if (ev.ok && ids.length) ctx.glow(ids);
  // Waiting for the first call on this computer: that is the connection.
  if (flow?.step === "wait" && where() === "local" && ev.ok) return connected("local");
  if (!plugged() && ev.ok) { savePrefs({ connectedAt: Date.now(), via: "local", client: null }); aiAccountChanged(); }
  if (win && flow?.step === "dash") {
    // A question newly ticked repaints the screen; otherwise only the feed moves.
    const box = document.getElementById("aiFeed");
    if (tried.size !== before || !box) paint(); else box.innerHTML = feedHtml();
  }
}

function connected(via) {
  stopPoll();
  savePrefs({ connectedAt: Date.now(), via, client: flow?.client || null });
  aiAccountChanged();   // also closes the wizard
  flow = { step: "dash" };
  const { t, esc } = ctx;
  ctx.openDialog({
    look: "ceremony", cls: "ai-cere", title: t("aiConnectedTitle"),
    body: `<div class="ai-cere-robot" aria-hidden="true"><span class="icon icon-robot"></span></div>
      <p class="qfs-line">${esc(via === "local" ? t("aiConnectedLocal", { n: ctx.spoolCount() }) : t("aiConnectedWeb"))}</p>`,
    actions: [{ id: "go", label: t("aiConnectedGo"), kind: "primary", focus: true }],
    onAction: (_id, close) => { close(); openAiAssistant(); },
    // The big moment: a huge translucent robot swells behind the window.
    wire: (card) => { const bg = document.createElement("div"); bg.className = "ai-cere-bg"; bg.innerHTML = `<span class="icon icon-robot"></span>`; card.parentElement?.insertBefore(bg, card); },
  });
}

// ── Online wait: a new grant on the Hub (only while the wait screen is open) ──
function startPoll() {
  stopPoll();
  const tick = async () => {
    try {
      const token = await ctx.idToken();
      const res = token ? await ctx.api.hostedGrants(token) : null;
      const since = (flow?.since || Date.now()) - 60000;
      const fresh = (res?.ok ? res.json?.grants || [] : []).some(g => Date.parse(g.createdAt) > since || Date.parse(g.lastUsedAt) > since);
      if (fresh) return connected("online");
    } catch (_) {}
    if (flow?.step === "wait" && where() === "web" && win) pollT = setTimeout(tick, 5000);
  };
  pollT = setTimeout(tick, 5000);
}
function stopPoll() { clearTimeout(pollT); pollT = null; }

// ── Clicks ────────────────────────────────────────────────────────────────
async function onClick(e) {
  const el = e.target.closest("[data-ai], [data-ai-client], [data-ai-pick], [data-ai-copy], [data-ai-undo]");
  if (!el) return;
  const list = steps(), i = list.indexOf(flow.step);
  const go = (s) => { flow.step = s; if (s === "wait") { flow.since = Date.now(); if (where() === "web") startPoll(); } else stopPoll(); paint(); };
  if (el.dataset.aiClient) { flow.client = el.dataset.aiClient; flow.where = null; return paint(); }
  if (el.dataset.aiPick) { if (flow.step === "where") flow.where = el.dataset.aiPick; else flow.rights = el.dataset.aiPick; return paint(); }
  if (el.dataset.aiCopy != null) {
    try { await navigator.clipboard.writeText(el.dataset.aiCopy); el.classList.add("is-copied"); setTimeout(() => el.classList.remove("is-copied"), 1200); } catch (_) {}
    return;
  }
  if (el.dataset.aiUndo) {
    el.disabled = true;
    try { await ctx.undo(el.dataset.aiUndo); el.outerHTML = undoBtn("", true); }
    catch (_) { el.disabled = false; ctx.flash(ctx.t("aiUndoFailed")); }
    return;
  }
  switch (el.dataset.ai) {
    case "start": return go("who");
    case "another": flow = { step: "who" }; return paint();
    case "settings": win?.close(); return ctx.openSettings();
    case "getclaude": return ctx.openExternal(CLAUDE_DOWNLOAD);
    case "back": return go(i > 0 ? list[i - 1] : (plugged() ? "dash" : "welcome"));
    case "next": return go(list[i + 1]);
    case "manual": return connected(where() === "web" ? "online" : "local");
    case "install": {
      const c = CLIENTS.find(x => x.id === flow.client);
      el.disabled = true;
      await ctx.api.setEnabled(true);
      await ctx.api.setWrite(flow.rights === "write");
      await ctx.api.install(c.local).catch(() => null);
      return go("wait");
    }
    case "webcopy": {
      try { await navigator.clipboard.writeText(HOSTED_URL); } catch (_) {}
      ctx.openExternal(ctx.guideUrl(flow.client));
      return go("wait");
    }
  }
}
