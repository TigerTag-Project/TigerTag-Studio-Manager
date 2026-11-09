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
  btn.addEventListener("click", () => ctx.openPage());
}

export function aiAccountChanged() {
  if (!ctx) return;
  const on = ctx.uid() && plugged();
  const pill = document.getElementById("aiNewPill"), dot = document.getElementById("aiDot");
  if (pill) pill.hidden = !ctx.uid() || on;
  if (dot) dot.hidden = !on;
  stopPoll();
  flow = null;
  webCount = null;
  pageMode = "main";
  win?.close(); win = null;
}

// The setup window: the first connection, or another assistant once one is plugged in.
export function openAiAssistant() {
  if (!ctx?.uid()) return;
  win?.close();
  if (!flow) flow = { step: plugged() ? "who" : "welcome" };
  win = ctx.openDialog({
    // The robot alone on top (no tinted tile), then the screen the flow is on.
    look: "notice", cls: "ai-win", body: `<div class="ai-hero" aria-hidden="true"><span class="icon icon-robot"></span></div><div class="ai-body"></div>`,
    onDismiss: () => { win = null; stopPoll(); },
    // openDialog calls wire() before it returns: keep the handle here so paint() finds it.
    wire: (card, close) => { win = { card, close }; card.addEventListener("click", onClick); paint(); },
  });
}

// ── The setup (first connection) ──────────────────────────────────────────
// One question per screen, under named markers. "where" only when the
// assistant runs in both places; "rights" only on this computer (online is
// read only). The connect screen is also the wait: once the button is pressed
// it says what to do in the assistant and waits, with a way out if nothing opens.
const MARKS = { who: "aiMarkWho", where: "aiMarkWhere", rights: "aiMarkRights", connect: "aiMarkConnect" };
function steps() {
  const c = CLIENTS.find(x => x.id === flow.client);
  const s = ["who"];
  if (c?.local && c?.web) s.push("where");
  if (where() === "local") s.push("rights");
  return [...s, "connect"];
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
  const c = CLIENTS.find(x => x.id === flow.client);
  const marks = () => {
    const list = steps(), i = list.indexOf(flow.step);
    return `<ol class="ai-marks">${list.map((k, n) => `<li class="${n < i ? "is-done" : n === i ? "is-on" : ""}"${n === i ? ` aria-current="step"` : ""}>${esc(t(MARKS[k]))}</li>`).join("")}</ol>`;
  };
  const title = (text) => marks() + `<h2 class="tsq-title ai-q">${esc(text)}</h2>`;
  const nav = (next = true, nextOk = true) => `<div class="ai-nav">
      <button type="button" class="secondary" data-ai="back">${esc(t("aiBack"))}</button>
      ${next ? `<button type="button" class="primary" data-ai="next"${nextOk ? "" : " disabled"}>${esc(t("aiNext"))}</button>` : ""}
    </div>`;
  const card = (id, sel, head, sub, icon) => `<button type="button" class="ai-choice${sel ? " is-sel" : ""}" data-ai-pick="${id}" aria-pressed="${sel}">
      <span class="icon icon-${icon} icon-18" aria-hidden="true"></span><span class="ai-choice-text"><b>${esc(head)}</b><small>${esc(sub)}</small></span></button>`;
  // What was chosen so far, said once on the connect screen.
  const summary = () => `<div class="ai-status">
      <span class="ai-chip"><span class="eac-mcp-logo eac-mcp-logo--${c.logo}" aria-hidden="true"></span>${esc(c.name)}</span>
      <span class="ai-chip"><span class="icon icon-${where() === "local" ? "home" : "globe"} icon-12" aria-hidden="true"></span>${esc(t(where() === "local" ? "aiWhereLocal" : "aiWhereWeb"))}</span>
      <span class="ai-chip"><span class="icon icon-${flow.rights === "write" ? "edit" : "eye-on"} icon-12" aria-hidden="true"></span>${esc(t(flow.rights === "write" ? "aiRightsWrite" : "aiRightsRead"))}</span>
    </div>`;
  const s = flow.step;

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
    body.innerHTML = title(t("aiQWho")) + `
      <div class="ai-tiles ai-tiles--3">${CLIENTS.map(x => `<button type="button" class="ai-tile${flow.client === x.id ? " is-sel" : ""}" data-ai-client="${x.id}" aria-pressed="${flow.client === x.id}">
          <span class="eac-mcp-logo eac-mcp-logo--${x.logo}" aria-hidden="true"></span><span>${esc(x.name)}</span></button>`).join("")}
      </div>
      ${flow.client === "none" ? `<div class="ai-help"><p class="ai-hint">${esc(t("aiNoneHint"))}</p>
          <button type="button" class="secondary ai-wide" data-ai="getclaude"><span class="icon icon-download icon-14" aria-hidden="true"></span>${esc(t("aiGetClaude"))}</button></div>`
        : `<button type="button" class="ai-link" data-ai-client="none">${esc(t("aiNoneLink"))}</button>`}
      ${nav(true, !!c)}`;
  } else if (s === "where") {
    body.innerHTML = title(t("aiQWhere")) + `<div class="ai-choices">
        ${card("local", flow.where === "local", t("aiWhereLocal"), t("aiWhereLocalSub"), "home")}
        ${card("web", flow.where === "web", t("aiWhereWeb"), t("aiWhereWebSub"), "globe")}</div>` + nav(true, !!flow.where);
  } else if (s === "rights") {
    body.innerHTML = title(t("aiQRights")) + `<div class="ai-choices">
        ${card("read", flow.rights !== "write", t("aiRightsRead"), t("aiRightsReadSub"), "eye-on")}
        ${card("write", flow.rights === "write", t("aiRightsWrite"), t("aiRightsWriteSub"), "edit")}</div>` + nav();
  } else if (s === "connect") {
    const local = where() === "local", app = c.name;
    const prompt = `<button type="button" class="ai-prompt" data-ai-copy="${esc(t("aiWaitPrompt"))}"><span class="ai-prompt-text">« ${esc(t("aiWaitPrompt"))} »</span><span class="icon icon-copy icon-14" aria-hidden="true"></span></button>`;
    const waiting = `<p class="ai-waiting" role="status">${esc(t("aiWaitingFor", { app }))}</p>`;
    body.innerHTML = title(t(local ? "aiConnectTitleLocal" : "aiConnectTitleWeb", { app })) + summary() + (local
      ? (!flow.waiting
        ? `<p class="tsq-desc">${esc(t("aiConnectLocal", { app }))}</p>
           <button type="button" class="primary ai-wide" data-ai="install"><span class="eac-mcp-logo eac-mcp-logo--${c.logo}" aria-hidden="true"></span>${esc(t("aiConnectLocalBtn", { app }))}</button>`
        : `<p class="tsq-desc">${esc(t("aiWaitLocal", { app }))}</p>${prompt}${waiting}
           ${flow.trouble
             ? `<div class="ai-help"><p class="ai-hint">${esc(t("aiTroubleHelp", { app }))}</p>
                 <div class="ai-nav"><button type="button" class="secondary" data-ai="install">${esc(t("aiRetry"))}</button>
                   <button type="button" class="secondary" data-ai="guide">${esc(t("aiOpenGuide", { app }))}</button></div></div>`
             : `<button type="button" class="ai-link" data-ai="trouble">${esc(t("aiTroubleLocal", { app }))}</button>`}`)
      : `<p class="tsq-desc">${esc(t("aiConnectWeb", { app }))}</p>
         <div class="ai-url"><code>${esc(HOSTED_URL)}</code></div>
         <div class="ai-nav ai-nav--even">
           <button type="button" class="${flow.copied ? "secondary is-done" : "primary"}" data-ai="webcopy"><span class="icon icon-${flow.copied ? "check" : "copy"} icon-14" aria-hidden="true"></span>${esc(t(flow.copied ? "aiAddressCopied" : "aiCopyAddress"))}</button>
           <button type="button" class="secondary" data-ai="guide"><span class="icon icon-book icon-14" aria-hidden="true"></span>${esc(t("aiOpenGuide", { app }))}</button>
         </div>
         ${flow.waiting ? `<p class="tsq-desc">${esc(t("aiWaitWeb", { app }))}</p>${prompt}${waiting}` : ""}`)
      + `<div class="ai-nav"><button type="button" class="secondary" data-ai="back">${esc(t("aiBack"))}</button>
         ${flow.waiting ? `<button type="button" class="secondary" data-ai="manual">${esc(t("aiWaitDone"))}</button>` : ""}</div>`;
  }
}

// ── The AI assistant page (a view of the main window) ────────────────────
// Status and the two ways in at the top; the suggested questions beside the
// live activity; the latest changes underneath. Not plugged in yet: one card
// that opens the setup window.
let pageHost = null;
let webCount = null;     // online assistants, read once per page visit
let pageMode = "main";   // "main" | "history" (every journaled change, by day) | "access" (access and security)
export async function renderAiPage(host) {
  if (!host || !ctx?.uid()) return;
  pageHost = host;
  if (!host.dataset.wired) { host.dataset.wired = "1"; host.addEventListener("click", onPageClick); }
  const { t, esc } = ctx;
  const head = `<header class="aip-head">
      <span class="aip-robot" aria-hidden="true"><span class="icon icon-robot"></span></span>
      <div class="aip-head-text"><h1>${esc(t("aiTitle"))}</h1><p>${esc(t("aiPageSub"))}</p></div>
      ${plugged() ? `<div class="aip-head-acts">
        <button type="button" class="secondary" data-aip="another"><span class="icon icon-plus icon-14" aria-hidden="true"></span>${esc(t("aiAnother"))}</button>
        <button type="button" class="secondary" data-aip="access"><span class="icon icon-shield-check icon-14" aria-hidden="true"></span>${esc(t("aiManageAccess"))}</button>
      </div>` : ""}
    </header>`;
  if (pageMode === "history") return paintHistory(host);
  if (pageMode === "access") return paintAccess(host);
  if (!plugged()) {
    host.innerHTML = `<div class="aip">${head}
      <section class="aip-card aip-empty">
        <span class="aip-robot aip-robot--big" aria-hidden="true"><span class="icon icon-robot"></span></span>
        <h2 class="aip-empty-title">${esc(t("aiEmptyTitle"))}</h2><p>${esc(t("aiEmptyText"))}</p>
        <button type="button" class="primary" data-aip="connect">${esc(t("aiStart"))}</button>
      </section></div>`;
    return;
  }
  const cfg = await ctx.api.getConfig().catch(() => null);
  if (pageHost !== host || !ctx.pageShown()) return;
  const rights = !cfg?.enabled ? t("aiStatusOff") : cfg.write ? t("aiStatusWrite") : t("aiStatusRead");
  const sample = ctx.sample();
  const tries = [
    { id: "stock", text: t("aiTryStock", { what: sample.what }) },
    { id: "print", text: t("aiTry3mf"), hint: t("aiTry3mfHint") },
    cfg?.write && sample.spool ? { id: "weight", text: t("aiTryWeight", { name: sample.spool }) } : { id: "low", text: t("aiTryLow") },
  ];
  const journal = ctx.journal();
  const changes = journal.slice(-3).reverse();
  host.innerHTML = `<div class="aip">${head}
    <div class="ai-status aip-status">
      <span class="ai-chip${cfg?.enabled ? " is-on" : ""}"><span class="icon icon-home icon-12" aria-hidden="true"></span>${esc(t("aiStatusLocal", { rights }))}</span>
      <span class="ai-chip" id="aipWebChip"><span class="icon icon-globe icon-12" aria-hidden="true"></span>${esc(t("aiStatusWeb", { n: webCount ?? "…" }))}</span>
    </div>
    <div class="aip-grid">
      <section class="aip-card">
        <h3 class="aip-title"><span class="icon icon-chat icon-14" aria-hidden="true"></span>${esc(t("aiTryTitle"))}</h3>
        ${tries.map(x => `<div class="aip-try">
          <button type="button" class="ai-prompt${tried.has(x.id) ? " is-done" : ""}" data-ai-copy="${esc(x.text)}">
            <span class="icon icon-${tried.has(x.id) ? "check" : "circle"} icon-14" aria-hidden="true"></span><span class="ai-prompt-text">« ${esc(x.text)} »</span>
            ${tried.has(x.id) ? `<small>${esc(t("aiTryDone"))}</small>` : ""}<span class="icon icon-copy icon-14" aria-hidden="true"></span></button>
          ${x.hint ? `<p class="ai-hint">${esc(x.hint)}</p>` : ""}</div>`).join("")}
      </section>
      <section class="aip-card">
        <h3 class="aip-title"><span class="icon icon-bolt icon-14" aria-hidden="true"></span>${esc(t("aiFeedTitle"))}</h3>
        <p class="ai-hint">${esc(t("aiFeedWebNote"))}</p>
        <div class="ai-feed aip-feed" id="aiFeed">${feedHtml()}</div>
      </section>
    </div>
    <section class="aip-card">
      <h3 class="aip-title"><span class="icon icon-edit icon-14" aria-hidden="true"></span>${esc(t("aiChangesTitle"))}</h3>
      ${changes.length ? `<div class="ai-feed">${changes.map(c => changeHtml(c)).join("")}</div>` : `<p class="ai-empty">${esc(t("aiNoChanges"))}</p>`}
      ${journal.length > 3 ? `<button type="button" class="ai-link aip-more" data-aip="history">${esc(t("aiSeeHistory", { n: journal.length }))}</button>` : ""}
    </section>
  </div>`;
  // Online assistants: one call to the Hub's list per visit (the same as My profile).
  if (webCount == null) {
    try {
      const token = await ctx.idToken();
      const res = token ? await ctx.api.hostedGrants(token) : null;
      const grants = res?.ok ? res.json?.grants : null;
      if (Array.isArray(grants)) webCount = grants.length;
    } catch (_) {}
  }
  const chip = document.getElementById("aipWebChip");
  if (chip && webCount != null) chip.lastChild.textContent = t("aiStatusWeb", { n: webCount });
}
async function onPageClick(e) {
  const el = e.target.closest("[data-aip], [data-aip-level], [data-ai-copy], [data-ai-undo]");
  if (!el) return;
  if (el.dataset.aipLevel) return setLevel(el.dataset.aipLevel);
  if (el.dataset.aiCopy != null) {
    try { await navigator.clipboard.writeText(el.dataset.aiCopy); el.classList.add("is-copied"); setTimeout(() => el.classList.remove("is-copied"), 1200); } catch (_) {}
    return;
  }
  if (el.dataset.aiUndo) {
    el.disabled = true;
    try { await ctx.undo(el.dataset.aiUndo); renderAiPage(pageHost); }
    catch (_) { el.disabled = false; ctx.flash(ctx.t("aiUndoFailed")); }
    return;
  }
  switch (el.dataset.aip) {
    case "connect": flow = { step: "welcome" }; return openAiAssistant();
    case "another": flow = { step: "who" }; return openAiAssistant();
    case "access": pageMode = "access"; return renderAiPage(pageHost);
    case "history": pageMode = "history"; return renderAiPage(pageHost);
    case "back": pageMode = "main"; return renderAiPage(pageHost);
  }
}
// Every change of the journal (30 days on this computer), newest first, by day.
function paintHistory(host) {
  const { t, esc } = ctx;
  const all = ctx.journal().slice().reverse();
  const days = new Map();
  for (const c of all) {
    const day = new Date(c.at).toLocaleDateString(ctx.lang(), { weekday: "long", day: "numeric", month: "long" });
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(c);
  }
  host.innerHTML = `<div class="aip">
    <header class="aip-head">
      <button type="button" class="secondary" data-aip="back"><span class="icon icon-chevron-l icon-14" aria-hidden="true"></span>${esc(t("aiBack"))}</button>
      <div class="aip-head-text"><h1>${esc(t("aiHistoryTitle"))}</h1><p>${esc(t("aiHistorySub"))}</p></div>
    </header>
    ${all.length ? [...days].map(([day, list]) => `<section class="aip-card">
        <h3 class="aip-title aip-day">${esc(day)}</h3>
        <div class="ai-feed aip-feed--all">${list.map(c => changeHtml(c)).join("")}</div></section>`).join("")
      : `<section class="aip-card"><p class="ai-empty">${esc(t("aiNoChanges"))}</p></section>`}
  </div>`;
}
// ── Access and security: the one place for what assistants may do ────────
// This computer: off / read only / read and change (the two switches of the
// local server), the key renewal under "Advanced". Online: one row per
// assistant with its right, when it was connected and last used, and a held
// "Cut access".
async function paintAccess(host) {
  const { t, esc } = ctx;
  const cfg = await ctx.api.getConfig().catch(() => null);
  if (pageHost !== host || pageMode !== "access") return;
  const level = !cfg?.enabled ? "off" : cfg.write ? "write" : "read";
  const opt = (id, head, sub, icon) => `<button type="button" class="ai-choice${level === id ? " is-sel" : ""}" data-aip-level="${id}" aria-pressed="${level === id}">
      <span class="icon icon-${icon} icon-18" aria-hidden="true"></span><span class="ai-choice-text"><b>${esc(head)}</b><small>${esc(sub)}</small></span></button>`;
  host.innerHTML = `<div class="aip">
    <header class="aip-head">
      <button type="button" class="secondary" data-aip="back"><span class="icon icon-chevron-l icon-14" aria-hidden="true"></span>${esc(t("aiBack"))}</button>
      <div class="aip-head-text"><h1>${esc(t("aiAccessTitle"))}</h1><p>${esc(t("aiAccessSub"))}</p></div>
    </header>
    <p class="aip-privacy"><span class="icon icon-info icon-14" aria-hidden="true"></span>${esc(t("aiAccessPrivacy"))}</p>
    <div class="aip-grid">
      <section class="aip-card">
        <h3 class="aip-title"><span class="icon icon-home icon-14" aria-hidden="true"></span>${esc(t("aiWhereLocal"))}</h3>
        <p class="ai-hint">${esc(t("aiWhereLocalSub"))}</p>
        <div class="ai-choices">
          ${opt("off", t("aiAccessOff"), t("aiAccessOffSub"), "lock")}
          ${opt("read", t("aiRightsRead"), t("aiRightsReadSub"), "eye-on")}
          ${opt("write", t("aiRightsWrite"), t("aiRightsWriteSub"), "edit")}
        </div>
        <details class="aip-adv">
          <summary>${esc(t("aiAdvanced"))}</summary>
          <p class="ai-hint">${esc(t("aiRenewKeyHint"))}</p>
          <button type="button" class="secondary aip-hold" id="aipRenewKey" data-hold-tip="aiRenewKeyHint">
            <span class="hold-progress"></span><span class="icon icon-key icon-14" aria-hidden="true"></span><span>${esc(t("aiRenewKey"))}</span>
          </button>
        </details>
      </section>
      <section class="aip-card">
        <h3 class="aip-title"><span class="icon icon-globe icon-14" aria-hidden="true"></span>${esc(t("aiWhereWeb"))}</h3>
        <p class="ai-hint">${esc(t("aiWhereWebSub"))}</p>
        <div class="aip-grants" id="aipGrants"><p class="ai-empty">${esc(t("eacMcpGrantsLoading"))}</p></div>
      </section>
    </div>
  </div>`;
  const renew = host.querySelector("#aipRenewKey");
  ctx.holdToConfirm(renew, 1500, async () => {
    await ctx.api.newToken();
    renew.lastElementChild.textContent = t("aiRenewKeyDone");
    renew.classList.add("is-done");
  });
  paintGrants(host.querySelector("#aipGrants"));
}
async function paintGrants(box) {
  const { t, esc } = ctx;
  const line = (key) => { box.innerHTML = `<p class="ai-empty">${esc(t(key))}</p>`; };
  let grants = null;
  try {
    const token = await ctx.idToken();
    const res = token ? await ctx.api.hostedGrants(token) : null;
    grants = res?.ok && Array.isArray(res.json?.grants) ? res.json.grants : null;
  } catch (_) {}
  if (!box.isConnected) return;
  if (!grants) return line("eacMcpGrantsErr");
  webCount = grants.length;
  if (!grants.length) return line("eacMcpGrantsNone");
  const day = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString(ctx.lang()) : "—"; };
  box.innerHTML = grants.map(g => `<div class="aip-grant" data-id="${esc(g.id)}">
      <div class="ai-ev-main">
        <div class="ai-ev-text"><b>${esc(g.clientName || t("eacMcpGrantUnnamed"))}</b> · ${esc(t("aiRightsRead"))}</div>
        <small>${esc(t("eacMcpGrantSince", { date: day(g.createdAt) }))}${g.lastUsedAt && !isNaN(Date.parse(g.lastUsedAt)) ? ` · ${esc(t("eacMcpGrantUsed", { ago: ctx.timeAgo(Date.parse(g.lastUsedAt)) }))}` : ""}</small>
      </div>
      <button type="button" class="secondary sm aip-hold" data-hold-tip="eacMcpGrantCutTip"><span class="hold-progress"></span><span>${esc(t("eacMcpGrantCut"))}</span></button>
    </div>`).join("");
  box.querySelectorAll(".aip-grant").forEach(row => ctx.holdToConfirm(row.querySelector(".aip-hold"), 1500, async () => {
    // 204 = cut; 404 = already gone — either way the row leaves.
    try {
      const token = await ctx.idToken();
      const res = token ? await ctx.api.hostedGrants(token, row.dataset.id) : null;
      if (!res || (!res.ok && res.status !== 404)) { row.querySelector("small").textContent = t("eacMcpGrantsErr"); return; }
      row.remove();
      webCount = box.querySelectorAll(".aip-grant").length;
      if (!webCount) line("eacMcpGrantsNone");
    } catch (_) {}
  }));
}
async function setLevel(level) {
  await ctx.api.setEnabled(level !== "off");
  await ctx.api.setWrite(level === "write");
  if (level !== "off") ctx.aiEnabled();
  renderAiPage(pageHost);
}

const repaintPage = () => { if (pageHost && ctx.pageShown()) renderAiPage(pageHost); };

// ── Activity and changes, in plain words ─────────────────────────────────
// A read is "what it did · on what", with its result underneath. A change is
// "which spool / product / rack · which field", then "before → after", with
// Undo (or Undone). Every line carries its time.
const clock = (at) => new Date(at).toLocaleTimeString(ctx.lang(), { hour: "2-digit", minute: "2-digit" });
const num = (v, d = 0) => Number(v).toLocaleString(ctx.lang(), { maximumFractionDigits: d });
const short = (v, n = 32) => { const x = String(v ?? "").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };

function feedHtml() {
  const { t, esc } = ctx;
  if (!feed.length) return `<p class="ai-empty">${esc(t("aiFeedEmpty"))}</p>`;
  const journal = ctx.journal();
  return feed.map(ev => {
    // A change it made: the same line as in its journal (before → after, Undo).
    const entry = ev.ok && ev.result?.change_id ? journal.find(c => c.id === ev.result.change_id) : null;
    if (entry) return changeHtml(entry, ev.fresh);
    const d = describe(ev);
    return `<div class="ai-ev${ev.fresh ? " is-fresh" : ""}${ev.ok ? "" : " is-refused"}">
      <span class="icon icon-${d.icon} icon-14" aria-hidden="true"></span>
      <div class="ai-ev-main"><div class="ai-ev-text"><b>${esc(d.action)}</b>${d.object ? ` · ${esc(d.object)}` : ""}</div>
        ${d.detail ? `<small>${esc(d.detail)}</small>` : ""}</div>
      <time>${esc(clock(ev.at))}</time></div>`;
  }).join("");
}

// What a read did, and what it found.
function describe({ name, args = {}, ok, result = {}, error = "" }) {
  const t = ctx.t, nm = id => ctx.spoolName(id) || id || "";
  if (!ok) {
    const why = /not allowed/i.test(error) ? "aiReasonReadOnly" : /limit|at most/i.test(error) ? "aiReasonLimit"
      : /^no |not found|no longer/i.test(error) ? "aiReasonNotFound" : "aiReasonOther";
    return { icon: "lock", action: t("aiEvRefused"), detail: t(why) };
  }
  const q = args.query || args.material || args.brand || args.ean || args.sku;
  const found = (n) => (q ? t("aiEvResultsFor", { n, q }) : t("aiEvResults", { n }));
  switch (name) {
    case "search_inventory": return { icon: "search", action: t("aiEvSearch"), detail: found(result.total_matches ?? 0) };
    case "get_spool": return { icon: "eye-on", action: t("aiEvSpool"), object: [result.brand, result.name].filter(Boolean).join(" ") || nm(args.spool_id) };
    case "inventory_summary": return { icon: "bars", action: t("aiEvSummary"), detail: t("aiEvSpoolsKg", { n: result.spools ?? 0, kg: num(result.remaining_kg ?? 0, 2) }) };
    case "list_racks": return { icon: "rack-grid", action: t("aiEvRacks") };
    case "find_free_slots": return { icon: "rack-grid", action: t("aiEvFree"), detail: t("aiEvFreeN", { n: result.total_free ?? 0 }) };
    case "list_printers": case "list_devices": return { icon: "printer", action: t("aiEvPrinters") };
    case "search_catalog": return { icon: "search", action: t("aiEvCatalog"), detail: found(result.total_matches ?? 0) };
    case "match_filaments": return { icon: "printer", action: t("aiEvMatch"), detail: t("aiEvMatchN", { ok: (result.slots || []).filter(s => s.covered).length, n: (result.slots || []).length }) };
    case "identify_spool": return { icon: "qr", action: t("aiEvIdentify"), object: result.spool ? [result.spool.brand, result.spool.name].filter(Boolean).join(" ") : result.product?.title || "" };
    case "get_label": return { icon: "qr", action: t("aiEvLabel"), object: nm(result.spool_id) };
    case "create_spools": return { icon: "plus", action: t("aiEvCreated", { n: (result.created || result.spool_ids || []).length }) };
    case "create_rack": return { icon: "plus", action: t("aiEvRackCreated"), object: result.name || "" };
    default: return { icon: "eye-on", action: t("aiEvOther") };
  }
}

// One journaled change → "object · field", "before → after", time, Undo / Undone.
const FIELD = { weight_available: "aiFieldWeight", message: "aiFieldNote", tags: "aiFieldTags", TD: "aiFieldTd", container_id: "aiFieldContainer",
  rack: "aiFieldPlace", buyPriceHt: "aiFieldPriceHt", buyUrl: "aiFieldBuyLink", minStockSpools: "aiFieldMinStock", note: "aiFieldProductNote",
  attachments: "aiFieldLinks", name: "aiFieldRackName", subtitle: "aiFieldRackSub" };
function value(field, v) {
  const t = ctx.t;
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return field === "rack" ? t("aiValNotStored") : "—";
  switch (field) {
    case "weight_available": return `${num(v)} g`;
    case "TD": return num(v, 1);
    case "tags": return v.join(", ");
    case "container_id": return ctx.containerName(v) || v;
    case "rack": return `${ctx.rackName(v.id) || "?"} ${v.level + 1}/${v.position + 1}${v.depth ? `/${v.depth + 1}` : ""}`;
    case "buyPriceHt": return ctx.money(v);
    case "buyUrl": try { return new URL(v).hostname.replace(/^www\./, ""); } catch (_) { return short(v); }
    case "attachments": return t("aiValLinks", { n: v.length });
    default: return `« ${short(v)} »`;
  }
}
function changeParts(c) {
  const t = ctx.t;
  if (c.kind === "create") return { icon: "plus", object: t("aiEvCreated", { n: c.count || (c.created || []).length }) };
  if (c.kind === "rack_create") return { icon: "plus", object: t("aiEvRackCreated"), field: c.rack_name };
  const doc = c.docs?.[0] || {};
  const before = doc.before || c.before || {}, after = doc.after || c.after || {};
  const fields = Object.keys(after).filter(f => FIELD[f]);
  const object = c.kind === "rack" ? (ctx.rackName(c.rack_id) || before.name || "")
    : c.kind === "product" ? `${ctx.spoolName(c.spool_id) || c.spool_id} (${t("aiValProduct")})` : (ctx.spoolName(doc.id) || doc.id || "");
  const icon = { set_spool_weight: "scale", move_spool: "move", update_product: "tag", rename_rack: "edit" }[c.tool] || "edit";
  return { icon, object, field: fields.map(f => t(FIELD[f])).join(", "),
    diffs: fields.map(f => ({ before: value(f, before[f]), after: value(f, after[f]) })) };
}
function changeHtml(c, fresh = false) {
  const { t, esc } = ctx;
  const list = ctx.journal();
  // An undo is told as the change it undid.
  const undone = c.kind === "undo" ? list.find(x => x.id === c.undoes) : null;
  const p = changeParts(undone || c);
  const undoable = ["spool", "product", "rack"].includes(c.kind);
  return `<div class="ai-ev ai-ch${fresh ? " is-fresh" : ""}">
    <span class="icon icon-${undone ? "undo" : p.icon} icon-14" aria-hidden="true"></span>
    <div class="ai-ev-main">
      <div class="ai-ev-text">${undone ? `<b>${esc(t("aiEvUndone"))}</b> · ` : ""}<b>${esc(p.object)}</b>${p.field ? ` · ${esc(p.field)}` : ""}</div>
      ${(p.diffs || []).length && !undone ? `<small class="ai-diff">${p.diffs.map(d => `${esc(d.before)} <span class="ai-arrow">→</span> ${esc(d.after)}`).join(" · ")}</small>` : ""}
    </div>
    <time>${esc(clock(c.at))}</time>
    ${undoable ? undoBtn(c.id, !!c.undoneAt) : ""}</div>`;
}
function undoBtn(id, done = false) {
  const { t, esc } = ctx;
  return done ? `<small class="ai-undone">${esc(t("aiUndone"))}</small>`
    : `<button type="button" class="secondary sm ai-undo" data-ai-undo="${esc(id)}">${esc(t("aiUndo"))}</button>`;
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
  // (inventory_summary's `spools` is a count, not a list.)
  const list = v => (Array.isArray(v) ? v : []);
  const ids = [r.spool_id, r.spool?.id, ...list(r.spools).slice(0, 20).map(s => s.id), ...list(r.created).map(c => c.spool_id)].filter(Boolean);
  if (ev.ok && ids.length) ctx.glow(ids);
  // Waiting for the first call on this computer: that is the connection.
  if (flow?.step === "connect" && flow.waiting && where() === "local" && ev.ok) return connected("local");
  if (!plugged() && ev.ok) { savePrefs({ connectedAt: Date.now(), via: "local", client: null }); aiAccountChanged(); return repaintPage(); }
  if (ctx.pageShown()) {
    // A question newly ticked or a change made repaints the page; otherwise only the feed moves.
    const box = document.getElementById("aiFeed");
    if (tried.size !== before || ev.result?.change_id || !box) repaintPage(); else box.innerHTML = feedHtml();
  }
}

function connected(via) {
  stopPoll();
  const app = CLIENTS.find(x => x.id === flow?.client)?.name || "";
  savePrefs({ connectedAt: Date.now(), via, client: flow?.client || null });
  aiAccountChanged();   // also closes the setup window
  webCount = null;
  const { t, esc } = ctx;
  ctx.openDialog({
    look: "ceremony", cls: "ai-cere", title: t("aiConnectedTitle"),
    body: `<div class="ai-cere-robot" aria-hidden="true"><span class="icon icon-robot"></span></div>
      <p class="qfs-line">${esc(via === "local" ? t("aiConnectedLocal", { app, n: ctx.spoolCount() }) : t("aiConnectedWeb", { app }))}</p>`,
    actions: [{ id: "go", label: t("aiConnectedGo"), kind: "primary", focus: true }],
    onAction: (_id, close) => { close(); ctx.openPage(); repaintPage(); },
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
    if (flow?.step === "connect" && flow.waiting && where() === "web" && win) pollT = setTimeout(tick, 5000);
  };
  pollT = setTimeout(tick, 5000);
}
function stopPoll() { clearTimeout(pollT); pollT = null; }

// ── Clicks ────────────────────────────────────────────────────────────────
async function onClick(e) {
  const el = e.target.closest("[data-ai], [data-ai-client], [data-ai-pick], [data-ai-copy], [data-ai-undo]");
  if (!el) return;
  const list = steps(), i = list.indexOf(flow.step);
  // Leaving the connect screen ends its wait; a new screen starts clean.
  const go = (s) => { flow.step = s; flow.waiting = flow.copied = flow.trouble = false; stopPoll(); paint(); };
  const wait = () => { if (!flow.waiting) { flow.waiting = true; flow.since = Date.now(); if (where() === "web") startPoll(); } paint(); };
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
    case "getclaude": return ctx.openExternal(CLAUDE_DOWNLOAD);
    case "back": if (i > 0) return go(list[i - 1]); if (plugged()) { win?.close(); win = null; flow = null; return; } return go("welcome");
    case "next": return go(list[i + 1]);
    case "manual": return connected(where() === "web" ? "online" : "local");
    case "trouble": flow.trouble = true; return paint();
    case "guide": ctx.openExternal(ctx.guideUrl(flow.client)); return where() === "web" ? wait() : undefined;
    case "install": {
      const c = CLIENTS.find(x => x.id === flow.client);
      el.disabled = true;
      await ctx.api.setEnabled(true);
      await ctx.api.setWrite(flow.rights === "write");
      ctx.aiEnabled();
      await ctx.api.install(c.local).catch(() => null);
      flow.trouble = false;
      return wait();
    }
    case "webcopy": {
      try { await navigator.clipboard.writeText(HOSTED_URL); } catch (_) {}
      flow.copied = true;
      return wait();
    }
  }
}
