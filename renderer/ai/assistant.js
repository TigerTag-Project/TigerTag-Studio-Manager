/**
 * renderer/ai/assistant.js — the AI assistant page (sidebar button under the
 * notifications). A beginner's way in to the MCP servers (docs/MCP.md):
 *
 *   • a welcome with the assistants it works with (a logo starts the setup on
 *     that assistant), then a guided first connection in the page itself, one
 *     question per screen: which assistant →
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
 *   openAiAssistant()     — starts the setup in the page (from its first choice)
 *   aiAccountChanged()    — repaint the sidebar button for the signed-in account
 * Per account, `tigertag.ai.<uid>` = { connectedAt, via: "local" | "online", client }.
 */

let ctx = null;
const HOSTED_URL = "https://mcp.tigersystem.io/mcp";
const CLAUDE_DOWNLOAD = "https://claude.ai/download";
// Which assistant, where it runs (local = Studio's server, web = the Hub's), its logo class.
const CLIENTS = [
  // Online first (founder, 2026-11-11): it works anywhere, Studio closed included.
  // Claude runs in both places: two tiles, so where it is used is picked with it.
  { id: "claudeweb", name: "Claude", logo: "claude",  web: true, tag: "aiTileWeb", guide: "claude", open: "https://claude.ai/settings/connectors" },
  { id: "chatgpt", name: "ChatGPT",  logo: "chatgpt", web: true, open: "https://chatgpt.com/#settings/Connectors" },
  { id: "lechat",  name: "Le Chat",  logo: "mistral", web: true, open: "https://chat.mistral.ai/" },
  { id: "grok",    name: "Grok",     logo: "grok",    web: true, open: "https://grok.com/connectors" },
  // Gemini: the app online (custom apps, US-only for now), the CLI on this
  // computer (a command it pastes in a terminal). `doc` = Google's own steps.
  { id: "gemini",  name: "Gemini",   logo: "gemini",  web: true, doc: "https://support.google.com/gemini/answer/17209137", open: "https://gemini.google.com/" },
  // Any other MCP client: online by the connector address, on this computer by
  // a configuration it pastes in its own MCP settings (no one-click install).
  { id: "otherweb", name: "",        logo: "other",   web: true, tag: "aiTileWeb" },
  { id: "claude",  name: "Claude",   logo: "claude",  local: "claude-desktop", tag: "aiTileLocal" },
  { id: "cursor",  name: "Cursor",   logo: "cursor",  local: "cursor" },
  { id: "vscode",  name: "VS Code",  logo: "vscode",  local: "vscode" },
  { id: "geminicli", name: "Gemini CLI", logo: "gemini", local: "gemini-cli", doc: "https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html" },
  { id: "other",   name: "",         logo: "other",   local: "manual", tag: "aiTileLocal" },
];
// `open` (online): the page where its connectors are added (else its home page).
// On this computer, the apps Studio can open (main.js `mcp:can-open`), read once.
let openable = null;
// "Other assistant" on its tile, "your assistant" in the sentences.
const isOther = (x) => x?.id === "other" || x?.id === "otherweb";
const tileName = (x) => (isOther(x) ? ctx.t("aiOtherTile") : x.name);
const appName = (x) => (isOther(x) ? ctx.t("aiOtherApp") : x?.name || "");
// The suggested questions, and the tool call that ticks each one.
const TRY_TOOLS = { stock: ["search_inventory", "inventory_summary"], print: ["match_filaments"], low: ["inventory_summary"], weight: ["set_spool_weight"] };

let win = null;          // { card, close }: the page card the setup is painted in
let flow = null;         // the wizard's answers: { step, client, where, rights, since }
let pollT = null;        // online wait: the grants poll
const feed = [];         // this session's tool calls, newest first (30)
const tried = new Set(); // suggested questions already answered by a tool call

const $q = (sel, root) => (root || document).querySelector(sel);
const prefsKey = () => `tigertag.ai.${ctx.uid()}`;
function prefs() { try { return JSON.parse(localStorage.getItem(prefsKey()) || "null") || {}; } catch (_) { return {}; } }
function savePrefs(p) { try { localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch (_) {} }
const plugged = () => !!prefs().connectedAt;
// What can actually answer now: this computer's access, and the online
// assistants still alive (a Hub grant lives 90 days after its last use —
// its refresh window). Read when the page opens (at most once a minute); the last one seen is kept in
// prefs so the page and the sidebar dot paint at once.
const GRANT_LIFE_MS = 90 * 86400e3;
let live = null;         // { local, online, listed } of this visit
const usable = (l) => !!(l && (l.local || l.online > 0));
const lastLive = () => live || prefs().live || null;
async function readLive() {
  const cfg = await ctx.api.getConfig().catch(() => null);
  let online = 0, listed = 0;
  try {
    const token = await ctx.idToken();
    const res = token ? await ctx.api.hostedGrants(token) : null;
    const grants = res?.ok && Array.isArray(res.json?.grants) ? res.json.grants : [];
    listed = grants.length;
    online = grants.filter(g => Date.now() - (Date.parse(g.lastUsedAt || g.createdAt) || 0) < GRANT_LIFE_MS).length;
  } catch (_) {}
  live = { local: !!cfg?.enabled, write: !!cfg?.write, online, listed, at: Date.now() };
  webCount = online;
  savePrefs({ ...prefs(), live });
  paintDot();
  return live;
}
function paintDot() {
  const l = lastLive(), on = ctx.uid() && (l ? usable(l) : plugged());
  const pill = document.getElementById("aiNewPill"), dot = document.getElementById("aiDot");
  if (pill) pill.hidden = !ctx.uid() || plugged() || usable(l);
  if (dot) dot.hidden = !on;
}

export function initAiAssistant(c) {
  ctx = c;
  const btn = document.getElementById("btnOpenAi");
  if (!btn || !ctx.api) return;   // no local MCP (Studio Web): no window
  btn.hidden = false;
  btn.addEventListener("click", () => ctx.openPage());
  wireHistoryCard();
  wireSetupCard();
}

// Leaving the TigerSquad ends the perk: this computer's access goes off (read,
// changes, screen) and every assistant connected online is cut.
export async function aiDisconnectAll() {
  if (!ctx?.api) return;
  await ctx.api.setScreen?.(false).catch(() => {});
  await ctx.api.setWrite(false).catch(() => {});
  await ctx.api.setEnabled(false).catch(() => {});
  try {
    const token = await ctx.idToken();
    const res = token ? await ctx.api.hostedGrants(token) : null;
    for (const g of (res?.ok && Array.isArray(res.json?.grants) ? res.json.grants : [])) await ctx.api.hostedGrants(token, g.id).catch(() => {});
  } catch (_) {}
  live = null;
  closeAiSetup(); pageMode = "main";
  savePrefs({ ...prefs(), live: { local: false, write: false, online: 0, listed: 0, at: Date.now() } });
  paintDot();
  if (pageHost && ctx.pageShown()) renderAiPage(pageHost);
}

export function aiAccountChanged() {
  if (!ctx) return;
  live = null;
  paintDot();
  closeAiHistory();
  stopPoll();
  flow = null;
  webCount = null;
  pageMode = "main";
  closeAiSetup();
}

// The setup in a wide side card on the right (#aiSetupPanel): the first
// connection, or another assistant. The page (welcome and demo) stays as it
// is, the chosen assistant's tile marked. `win.card` is the card's body.
const setupPanel = () => document.getElementById("aiSetupPanel");
const setupOpen = () => !!setupPanel()?.classList.contains("open");
export function openAiAssistant() {
  if (!ctx?.uid()) return;
  if (!flow) flow = newFlow("who");
  const p = setupPanel();
  if (!p) return;
  if (!setupOpen()) {
    const keep = flow; ctx.closeAllSide?.(); flow = keep;
    p.classList.add("open"); ctx.syncPanels?.();
  } else {
    // Another assistant while a card is open: the new card slides in over a
    // copy of the old one, which is removed once the new one is in place.
    const old = p.cloneNode(true);
    old.removeAttribute("id");
    old.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
    old.classList.add("ai-setup-ghost");
    p.after(old);
    p.style.transition = "none";
    p.classList.remove("open");
    void p.offsetWidth;
    p.style.transition = "";
    requestAnimationFrame(() => p.classList.add("open"));
    setTimeout(() => old.remove(), 320);
  }
  win = { card: document.getElementById("aiSetupBody"), close: closeAiSetup };
  paint();
  // The page stays as it is (its demo keeps playing): only the tiles' marks move.
  if (ctx.pageShown()) markTiles(); else ctx.openPage();
}
// The chosen assistant's tile, marked while its card is open.
function markTiles() {
  document.querySelectorAll(".aip-works-logo[data-aip-client]").forEach(b => {
    const on = !!win && flow?.client === b.dataset.aipClient;   // win: the card being shown
    b.classList.toggle("is-sel", on);
    b.setAttribute("aria-pressed", String(on));
  });
}
export function closeAiSetup() {
  // Only an open card resets the flow (closing the other cards on the way in must not).
  const p = setupPanel();
  if (!p || !setupOpen()) return;
  stopPoll(); win = null; flow = null;
  p.classList.remove("open");
  ctx?.syncPanels?.();
  markTiles();
  // Set up from the dashboard's "Plug in another assistant": closing goes back to the dashboard.
  if (pageMode === "welcome") { pageMode = "main"; if (pageHost && ctx.pageShown()) renderAiPage(pageHost); }
}
function wireSetupCard() {
  const p = setupPanel();
  if (!p || p.dataset.wired) return;
  p.dataset.wired = "1";
  document.getElementById("aiSetupClose")?.addEventListener("click", closeAiSetup);
  document.getElementById("aiSetupCloseTab")?.addEventListener("click", closeAiSetup);
  document.getElementById("aiSetupBody")?.addEventListener("click", onClick);
}
// What each way can do, in a window (founder, 2026-11-11). Only what the
// tools do today — and a third column, Both, all ticks: the two run side by side. Online = Hub lib/mcp (v1.75.0: no request sent, no printing, no screen,
// no live printers); with Studio = this server, guide mode included. [row key, online, local].
const COMPARE = [
  ["aiCmpClosed", 1, 0], ["aiCmpStock", 1, 1], ["aiCmpWrite", 1, 1], ["aiCmpWiki", 1, 1],
  ["aiCmpTicket", 0, 1], ["aiCmpLabels", 1, 1], ["aiCmpPrint", 0, 1], ["aiCmpGuide", 0, 1], ["aiCmpPrinters", 0, 1],
];
function compareTable() {
  const { t, esc } = ctx;
  const mark = (on) => on
    ? `<span class="icon icon-check-bold aip-cmp-yes" role="img" aria-label="${esc(t("aiCmpYes"))}"></span>`
    : `<span class="aip-cmp-no" role="img" aria-label="${esc(t("aiCmpNo"))}">—</span>`;
  return `<div class="pv-table-wrap aip-cmp-wrap"><table class="pv-table aip-cmp-table">
      <thead><tr><th></th><th>${esc(t("aiWhereWeb"))}</th><th>${esc(t("aiWhereLocal"))}</th><th class="aip-cmp-all">${esc(t("aiCmpBoth"))}</th></tr></thead>
      <tbody>${COMPARE.map(([k, web, local]) => `<tr><td>${esc(t(k))}</td><td>${mark(web)}</td><td>${mark(local)}</td><td class="aip-cmp-all">${mark(1)}</td></tr>`).join("")}</tbody>
    </table></div>`;
}
// Opened by "Compare the two" and by either group's pill (Recommended, More powerful).
function openCompare() {
  const { t, esc } = ctx;
  ctx.openDialog({ look: "notice", cls: "ai-cmp-win", icon: "robot", title: t("aiCmpTitle"),
    body: `${compareTable()}<p class="ai-hint aip-cmp-both">${esc(t("aiUseBoth"))}</p>` });
}

// The welcome's left column: what it is, and one tile per assistant (the one
// being set up marked) — beside the demo, or beside the setup once one is picked.
function welcomeMain(l, histBtn) {
  const { t, esc } = ctx;
  // Opened from the dashboard ("Plug in another assistant"): a way back to it.
  const back = pageMode === "welcome" && usable(l)
    ? `<button type="button" class="secondary aip-welcome-back" data-aip="back"><span class="icon icon-chevron-l icon-14" aria-hidden="true"></span>${esc(t("aiBack"))}</button>` : "";
  return `<div class="aip-welcome-main">
          ${back}<div class="aip-welcome-top"><span class="aip-robot aip-robot--big" aria-hidden="true"><span class="icon icon-robot"></span></span>${histBtn}</div>
          <span class="sqn-kicker">${esc(t("aiWelcomeKicker"))}</span>
          <h2 class="aip-empty-title">${esc(t("aiWelcomeTitle"))}</h2><p>${esc(t("aiWelcomeText"))}</p>
          <div class="aip-works">
            <span class="aip-works-label">${esc(t("aiPickAssistant"))}</span>
            <p class="ai-hint aip-works-both">${esc(t("aiUseBoth"))}</p>
            ${[["web", "smartphone", "aiWhereWeb", "aiGroupWebSub", "recommendedBadge"], ["local", "monitor", "aiWhereLocal", "aiGroupLocalSub", "aiBadgeMorePowerful"]].map(([where, icon, title, sub, badge]) => `
            <div class="aip-works-group">
              <div class="aip-works-head"><span class="aip-works-ico" aria-hidden="true"><span class="icon icon-${icon}"></span></span><span><b>${esc(t(title))}<button type="button" class="pba-brand-badge aip-cmp-pill" data-aip="compare" aria-label="${esc(`${t(badge)} · ${t("aiCmpOpen")}`)}">${esc(t(badge))}</button></b><small>${esc(t(sub))}</small></span></div>
              <div class="aip-works-logos">${CLIENTS.filter(x => (where === "local" ? !!x.local : !!x.web)).map(x => `<button type="button" class="aip-works-logo${setupOpen() && flow?.client === x.id ? " is-sel" : ""}" data-aip-client="${x.id}" aria-pressed="${setupOpen() && flow?.client === x.id}" aria-label="${esc(`${tileName(x)} · ${t(title)}`)}">
                <span class="eac-mcp-logo eac-mcp-logo--${x.logo}" aria-hidden="true"></span><small>${esc(tileName(x))}</small></button>`).join("")}</div>
            </div>`).join("")}
            <button type="button" class="ai-link aip-cmp-link" data-aip="compare">${esc(t("aiCmpOpen"))}</button>
          </div>
          ${l.listed ? `<p class="aip-empty-links"><button type="button" class="ai-link" data-aip="access">${esc(t("aiManageAccess"))}</button></p>` : ""}
        </div>`;
}

// ── The setup (first connection) ──────────────────────────────────────────
// One question per screen, under named markers. "where" only when the
// assistant runs in both places; "rights" only on this computer (online, Read
// or Read & write is picked on tigersystem.io's consent screen). The connect screen is also the wait: once the button is pressed
// it says what to do in the assistant and waits, with a way out if nothing opens.
const MARKS = { who: "aiMarkWho", where: "aiMarkWhere", rights: "aiMarkRights", connect: "aiMarkConnect" };
// A new setup starts on Claude online: a real path from the first screen and
// "Continue" ready at once; any other choice redraws the line.
const newFlow = (step) => ({ step, client: "claudeweb", where: "web" });
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
  // A metro line: the stations of the selected assistant's path, the first at the start, the last at the end, the others evenly
  // between — three stations put the second in the middle. Each dot carries its
  // number in this path (a check once done); the track fills up to the current one.
  const marks = () => {
    const list = steps(), cur = list.indexOf(flow.step), last = list.length - 1;
    const at = (n) => (last ? (n / last) * 100 : 50);
    return `<div class="ai-metro"><div class="ai-metro-track" aria-hidden="true"><span style="width:${at(Math.max(0, cur))}%"></span></div>
      <ol>${list.map((k, n) => `<li class="${n === cur ? "is-on" : n < cur ? "is-done" : ""}" style="left:${at(n)}%"${n === cur ? ` aria-current="step"` : ""}>
        <span class="ai-metro-dot" aria-hidden="true">${n < cur ? `<span class="icon icon-check icon-12"></span>` : n + 1}</span><span class="ai-metro-label">${esc(t(MARKS[k]))}</span></li>`).join("")}</ol></div>`;
  };
  // On top: the chosen assistant's logo, large (the art of its tile), and the question; the step line under them.
  const title = (text) => (c && flow.step !== "who"
    ? `<div class="ai-setup-logo"><span class="eac-mcp-logo eac-mcp-logo--${c.logo}" aria-hidden="true"></span>
        <b class="ai-setup-name">${esc(tileName(c))}</b><small>${esc(t(where() === "local" ? "aiWhereLocal" : "aiWhereWeb"))}</small></div>` : "")
    + `<h2 class="tsq-title ai-q">${esc(text)}</h2>` + marks();
  const nav = (next = true, nextOk = true) => `<div class="ai-nav">
      <button type="button" class="secondary" data-ai="back">${esc(t("aiBack"))}</button>
      ${next ? `<button type="button" class="primary" data-ai="next"${nextOk ? "" : " disabled"}>${esc(t("aiNext"))}</button>` : ""}
    </div>`;
  const card = (id, sel, head, sub, icon) => `<button type="button" class="ai-choice${sel ? " is-sel" : ""}" data-ai-pick="${id}" aria-pressed="${sel}">
      <span class="icon icon-${icon} icon-18" aria-hidden="true"></span><span class="ai-choice-text"><b>${esc(head)}</b><small>${esc(sub)}</small></span></button>`;
  // The logo and the title already say which assistant and where: only the
  // access chosen on this computer is said again on the connect screen.
  const summary = () => where() === "local" ? `<div class="ai-status">
      <span class="ai-chip"><span class="icon icon-${flow.rights === "write" ? "edit" : "eye-on"} icon-12" aria-hidden="true"></span>${esc(t(flow.rights === "write" ? "aiRightsWrite" : "aiRightsRead"))}</span>
    </div>` : "";
  const s = flow.step;

  if (s === "who") {
    body.innerHTML = title(t("aiQWho")) + `
      <div class="ai-tiles ai-tiles--3">${CLIENTS.map(x => `<button type="button" class="ai-tile${flow.client === x.id ? " is-sel" : ""}" data-ai-client="${x.id}" aria-pressed="${flow.client === x.id}">
          <span class="eac-mcp-logo eac-mcp-logo--${x.logo}" aria-hidden="true"></span><span>${esc(tileName(x))}</span>${x.tag ? `<em>${esc(t(x.tag))}</em>` : ""}</button>`).join("")}
      </div>
      ${flow.client === "none" ? `<div class="ai-help"><p class="ai-hint">${esc(t("aiNoneHint"))}</p>
          <button type="button" class="secondary ai-wide" data-ai="getclaude"><span class="icon icon-download icon-14" aria-hidden="true"></span>${esc(t("aiGetClaude"))}</button></div>`
        : `<button type="button" class="ai-link" data-ai-client="none">${esc(t("aiNoneLink"))}</button>`}
      ${nav(true, !!c)}`;
  } else if (s === "where") {
    body.innerHTML = title(t("aiQWhere")) + `<div class="ai-choices">
        ${card("web", flow.where === "web", t("aiWhereWeb"), t("aiWhereWebSub"), "globe")}
        ${card("local", flow.where === "local", t("aiWhereLocal"), t("aiWhereLocalSub"), "home")}</div>` + nav(true, !!flow.where);
  } else if (s === "rights") {
    // Read | Read & write, the app's sliding two-way switch (like Dark | Light); Read by default.
    body.innerHTML = title(t("aiQRights")) + `<div class="eac-seg eac-seg--slide ai-rights-seg" role="radiogroup" aria-label="${esc(t("aiQRights"))}">
          <button type="button" class="eac-seg-btn${flow.rights === "write" ? "" : " active"}" data-ai-pick="read" role="radio" aria-checked="${!(flow.rights === "write")}">${esc(t("aiSegRead"))}</button>
          <button type="button" class="eac-seg-btn${flow.rights === "write" ? " active" : ""}" data-ai-pick="write" role="radio" aria-checked="${flow.rights === "write"}">${esc(t("aiRightsWrite"))}</button></div>
        <p class="ai-hint ai-rights-on"><span class="icon icon-home icon-12" aria-hidden="true"></span>${esc(t("aiRightsTurnsOn"))}</p>` + nav();
  } else if (s === "connect") {
    const local = where() === "local", app = appName(c), cli = c.local === "gemini-cli", manual = c.local === "manual" || cli;
    const guideLabel = isOther(c) ? t("aiOpenGuideAny") : t("aiOpenGuide", { app });
    const prompt = `<button type="button" class="ai-prompt" data-ai-copy="${esc(t("aiWaitPrompt"))}"><span class="ai-prompt-text">« ${esc(t("aiWaitPrompt"))} »</span><span class="icon icon-copy icon-14" aria-hidden="true"></span></button>`;
    const waiting = `<p class="ai-waiting" role="status">${esc(t("aiWaitingFor", { app }))}</p>`;
    // "Open Cursor" / "Open the terminal" / "Open ChatGPT": only what can really be opened.
    if (local && !openable) ctx.api.canOpen?.().then(m => { openable = m || {}; if (flow?.step === "connect") paint(); }).catch(() => { openable = {}; });
    const canOpen = local ? !!openable?.[c.local] : !!c.open;
    const openBtn = canOpen ? `<button type="button" class="secondary ai-wide" data-ai="openapp"><span class="icon icon-arrow-up-right icon-14" aria-hidden="true"></span>${esc(cli ? t("aiOpenTerminal") : t("aiOpenApp", { app }))}</button>` : "";
    body.innerHTML = title(t(local ? "aiConnectTitleLocal" : "aiConnectTitleWeb", { app })) + summary() + (local
      ? (!flow.waiting
        ? (manual
          ? `<p class="tsq-desc">${esc(t(cli ? "aiConnectGeminiCli" : "aiConnectManual"))}</p>
             <div class="ai-nav ai-nav--even">
               <button type="button" class="primary" data-ai="localcopy"><span class="icon icon-copy icon-14" aria-hidden="true"></span>${esc(t(cli ? "aiCopyCommand" : "aiCopyConfig"))}</button>
               <button type="button" class="secondary" data-ai="guide"><span class="icon icon-book icon-14" aria-hidden="true"></span>${esc(guideLabel)}</button>
             </div>
             <p class="ai-hint">${esc(t("aiConfigSecret"))}</p>`
          : `<p class="tsq-desc">${esc(t("aiConnectLocal", { app }))}</p>
           <button type="button" class="primary ai-wide" data-ai="install"><span class="eac-mcp-logo eac-mcp-logo--${c.logo}" aria-hidden="true"></span>${esc(t("aiConnectLocalBtn", { app }))}</button>`)
        : `${openBtn}<p class="tsq-desc">${esc(t(cli ? "aiWaitGeminiCli" : manual ? "aiWaitManual" : "aiWaitLocal", { app }))}</p>${prompt}${waiting}
           ${flow.trouble
             ? `<div class="ai-help"><p class="ai-hint">${esc(t(cli ? "aiTroubleGeminiCliHelp" : manual ? "aiTroubleManualHelp" : "aiTroubleHelp", { app }))}</p>
                 <div class="ai-nav"><button type="button" class="secondary" data-ai="${manual ? "localcopy" : "install"}">${esc(t("aiRetry"))}</button>
                   <button type="button" class="secondary" data-ai="guide">${esc(guideLabel)}</button></div></div>`
             : `<button type="button" class="ai-link" data-ai="trouble">${esc(t(manual ? "aiTroubleManual" : "aiTroubleLocal", { app }))}</button>`}`)
      : `<p class="tsq-desc">${esc(t("aiConnectWeb", { app }))}</p>
         ${c.id === "gemini" ? `<p class="ai-hint">${esc(t("aiGeminiWebLimits"))}</p>` : ""}
         <div class="ai-url"><code>${esc(HOSTED_URL)}</code></div>
         <div class="ai-nav ai-nav--even">
           <button type="button" class="${flow.copied ? "secondary is-done" : "primary"}" data-ai="webcopy"><span class="icon icon-${flow.copied ? "check" : "copy"} icon-14" aria-hidden="true"></span>${esc(t(flow.copied ? "aiAddressCopied" : "aiCopyAddress"))}</button>
           <button type="button" class="secondary" data-ai="guide"><span class="icon icon-book icon-14" aria-hidden="true"></span>${esc(guideLabel)}</button>
         </div>
         ${flow.waiting ? `${openBtn}<p class="tsq-desc">${esc(t("aiWaitWeb", { app }))}</p>${prompt}${waiting}` : ""}`)
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
let pageMode = "main";   // "main" | "access" (access and security) | "welcome" (the first-time page, from "Plug in another assistant"); the setup and the history are side cards
export async function renderAiPage(host) {
  if (!host || !ctx?.uid()) return;
  pageHost = host;
  if (!host.dataset.wired) { host.dataset.wired = "1"; host.addEventListener("click", onPageClick); }
  const { t, esc } = ctx;
  const nHist = ctx.journal().length;
  const histBtn = nHist ? `<button type="button" class="secondary${histOpen() ? " is-on" : ""}" data-aip="history" aria-pressed="${histOpen()}"><span class="icon icon-clock icon-14" aria-hidden="true"></span>${esc(t("aiHistoryBtn"))}<span class="aip-count">${nHist}</span></button>` : "";
  const head = `<header class="aip-head">
      <span class="aip-robot" aria-hidden="true"><span class="icon icon-robot"></span></span>
      <div class="aip-head-text"><h1>${esc(t("aiTitle"))}</h1><p>${esc(t("aiPageSub"))}</p></div>
      ${usable(lastLive()) || nHist ? `<div class="aip-head-acts">
        ${usable(lastLive()) && pageMode !== "setup" ? `<button type="button" class="secondary" data-aip="another"><span class="icon icon-plus icon-14" aria-hidden="true"></span>${esc(t("aiAnother"))}</button>
        <button type="button" class="secondary" data-aip="access"><span class="icon icon-shield-check icon-14" aria-hidden="true"></span>${esc(t("aiManageAccess"))}</button>` : ""}
        ${histBtn}
      </div>` : ""}
    </header>`;
  // Out of the TigerSquad (left it meanwhile): no setup or access screen stays open.
  if (ctx.squadActive && !ctx.squadActive()) { if (setupOpen()) closeAiSetup(); pageMode = "main"; }
  if (pageMode === "access") return paintAccess(host);
  // Paint what was last seen, then read the real state once per visit and
  // repaint if it differs. Nothing usable (this computer off, no online
  // assistant alive) → only the way to plug the first one in.
  const l = lastLive() || { local: false, write: false, online: 0, listed: 0 };
  const same = (x, y) => !!x && !!y && usable(x) === usable(y) && x.local === y.local && x.write === y.write && x.online === y.online && x.listed === y.listed;
  if (!live || Date.now() - live.at > 60e3) readLive().then(n => { if (pageHost === host && ctx.pageShown() && pageMode === "main" && !same(n, l)) renderAiPage(host); });
  const journal = ctx.journal();
  if (!usable(l) || pageMode === "welcome") {
    // The welcome speaks for itself: no page head; History sits beside the robot.
    host.innerHTML = `<div class="aip aip--welcome">
      <section class="aip-welcome">
        ${welcomeMain(l, histBtn)}
        <div class="ai-demo-col${demoView === "phone" ? " is-phone" : ""}">
        <div class="ai-demo-views" role="group">
            <button type="button" class="ai-demo-view" data-demo-view="phone" aria-label="${esc(t("aiDemoPhone"))}"><span class="icon icon-smartphone icon-14" aria-hidden="true"></span></button>
            <button type="button" class="ai-demo-view" data-demo-view="desktop" aria-label="${esc(t("aiDemoDesktop"))}"><span class="icon icon-monitor icon-14" aria-hidden="true"></span></button>
        </div>
        <div class="ai-demo-tabs" role="tablist">${DEMO_CASES.map((c, n) => `<button type="button" class="ai-demo-tab" role="tab" data-demo-case="${n}"><span class="icon icon-${c.icon} icon-12" aria-hidden="true"></span>${esc(t(c.label))}<span class="ai-demo-tab-bar" aria-hidden="true"><i></i></span></button>`).join("")}</div>
        <div class="ai-demo-device"><span class="ai-dev-btn ai-dev-btn--action" aria-hidden="true"></span><span class="ai-dev-btn ai-dev-btn--up" aria-hidden="true"></span><span class="ai-dev-btn ai-dev-btn--down" aria-hidden="true"></span><span class="ai-dev-btn ai-dev-btn--side" aria-hidden="true"></span>
        <div class="ai-demo" aria-label="${esc(t("aiDemoLabel"))}">
          <div class="ai-dev-status" aria-hidden="true"><span class="ai-dev-time">9:41</span><span class="ai-dev-island"></span>
            <span class="ai-dev-icons"><svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
              <svg viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.3 6.8a6.6 6.6 0 0 1 9.4 0l-1.2 1.2a4.9 4.9 0 0 0-7 0zM1 4.5a9.9 9.9 0 0 1 14 0l-1.2 1.2a8.2 8.2 0 0 0-11.6 0z"/></svg>
              <span class="ai-dev-battery"><i></i></span></span></div>
          <div class="ai-dev-titlebar" aria-hidden="true"><span class="ai-dev-lights"><i></i><i></i><i></i></span><b>${esc(t("aiOtherApp"))}</b></div>
          <div class="ai-dev-apphead" aria-hidden="true"><span class="icon icon-chevron-l icon-14"></span><b>${esc(t("aiOtherApp"))}</b><span class="icon icon-plus icon-14"></span></div>
          <div class="ai-demo-msgs"></div>
          <div class="ai-demo-composer" aria-hidden="true">
            <div class="ai-demo-attach"></div>
            <div class="ai-demo-row">
              <span class="icon icon-plus icon-16 ai-demo-plus"></span>
              <div class="ai-demo-input"><span class="ai-demo-typed"></span><span class="ai-demo-caret"></span><span class="ai-demo-ph">${esc(t("aiDemoPlaceholder"))}</span></div>
              <span class="ai-demo-send"><span class="icon icon-send icon-14"></span></span>
            </div>
          </div>
          <span class="ai-dev-home" aria-hidden="true"></span>
        </div>
        </div>
        </div>
      </section></div>`;
    playDemo(host.querySelector(".ai-demo-msgs"));
    return;
  }
  const cfg = { enabled: l.local, write: l.write };
  const rights = !cfg.enabled ? t("aiStatusOff") : cfg.write ? t("aiStatusWrite") : t("aiStatusRead");
  const sample = ctx.sample();
  const tries = [
    { id: "stock", text: t("aiTryStock", { what: sample.what }) },
    { id: "print", text: t("aiTry3mf"), hint: t("aiTry3mfHint") },
    cfg?.write && sample.spool ? { id: "weight", text: t("aiTryWeight", { name: sample.spool }) } : { id: "low", text: t("aiTryLow") },
  ];
  const changes = journal.slice(-3).reverse();
  host.innerHTML = `<div class="aip">${head}
    <div class="ai-status aip-status">
      <span class="ai-chip" id="aipWebChip"><span class="icon icon-globe icon-12" aria-hidden="true"></span>${esc(t("aiStatusWeb", { n: l.online }))}</span>
      <span class="ai-chip${cfg?.enabled ? " is-on" : ""}"><span class="icon icon-home icon-12" aria-hidden="true"></span>${esc(t("aiStatusLocal", { rights }))}</span>
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
        ${cfg.enabled ? `<p class="ai-hint">${esc(t("aiFeedWebNote"))}</p>
        <div class="ai-feed aip-feed" id="aiFeed">${feedHtml()}</div>`
        : `<p class="ai-hint">${esc(t("aiFeedLocalOff"))}</p>
        <button type="button" class="secondary aip-local-on" data-aip="access"><span class="icon icon-home icon-14" aria-hidden="true"></span>${esc(t("aiFeedLocalOn"))}</button>`}
      </section>
    </div>
    ${cfg.enabled || journal.length ? `<section class="aip-card">
      <h3 class="aip-title"><span class="icon icon-edit icon-14" aria-hidden="true"></span>${esc(t("aiChangesTitle"))}</h3>
      ${changes.length ? `<div class="ai-feed">${changes.map(c => changeHtml(c)).join("")}</div>` : `<p class="ai-empty">${esc(t("aiNoChanges"))}</p>`}
    </section>` : ""}
  </div>`;
}
async function onPageClick(e) {
  const el = e.target.closest("[data-aip], [data-aip-level], [data-grant-write], [data-aip-client], [data-ai-copy], [data-ai-undo]");
  if (!el) return;
  // A logo of the welcome: that assistant is chosen, the setup opens on its next step —
  // for a TigerSquad member; anyone else is offered to join first.
  if (el.dataset.aipClient) {
    if (ctx.squadOnly && !ctx.squadOnly()) return;
    flow = { ...newFlow("who"), client: el.dataset.aipClient };
    flow.step = flow.entry = steps()[1];
    return openAiAssistant();
  }
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
  if (el.dataset.aipLevel) { segPick(el); return setLevel(el.dataset.aipLevel); }
  if (el.dataset.grantWrite) return setGrantWrite(el);
  switch (el.dataset.aip) {
    // Another assistant: back to the first-time page (tiles + demo); a tile opens the setup card.
    case "another": if (ctx.squadOnly && !ctx.squadOnly()) return; pageMode = "welcome"; return renderAiPage(pageHost);
    case "access": pageMode = "access"; return renderAiPage(pageHost);
    case "history": return histOpen() ? closeAiHistory() : openAiHistory();
    case "compare": return openCompare();
    case "back": pageMode = "main"; return renderAiPage(pageHost);
  }
}
// ── The welcome's demo: made-up chats, one per case study ─────────────
// Five cases (help — first —, at home, family & friends, a business with several sites, fablabs / schools
// run as friend accounts, help from the wiki and a request). Like an assistant's own window: the user's file
// lands in the composer as a thumbnail, the question is typed there and sent,
// the assistant shows what it is calling, then answers as plain text. A case
// plays through, then the next; a tab starts one. Static when the system asks
// for reduced motion; it stops by itself once its box leaves the page.
const DEMO_CASES = [
  // Help: the wiki first; a request when the wiki has no answer (the user sends it).
  { id: "help", label: "aiCaseHelp", icon: "question", steps: [
    { q: "aiDemoHelpQ1", a: "aiDemoHelpA1", tool: "search_wiki → read_wiki_page" },
    { q: "aiDemoHelpQ2", a: "aiDemoHelpA2", tool: "search_wiki → read_wiki_page", card: { img: "https://wiki.tigersystem.io/assets/ntag-chip.png", line: "wiki.tigersystem.io" } },
    { q: "aiDemoHelpQ3", a: "aiDemoHelpA3", tool: "search_wiki → list_tickets → open_ticket" },
  ] },
  { id: "home", label: "aiCaseHome", icon: "home", steps: [
    { q: "aiDemoQ1", a: "aiDemoA1", tool: "inventory_summary", card: { img: "https://cdn.tigertag.io/img?id=1178930540&v=1&size=medium", line: "eSun · PETG · Black", grams: 180, colors: ["#101820"] } },
    { q: "aiDemoQ2", a: "aiDemoA2", tool: "match_filaments", file: "benchy.3mf", kind: "printer", card: { img: "https://cdn.tigertag.io/img?id=2603230677&v=3&size=medium", line: "Rosa3D · PLA Starter · Red", grams: 640, colors: ["#CC0605"] } },
    { q: "aiDemoQ3", a: "aiDemoA3", tool: "identify_spool", file: "IMG_2041.jpg", kind: "image", card: { img: "https://cdn.tigertag.io/img?id=137927&v=1&size=medium", line: "Polymaker · PolyLite PLA Pro · Metallic Chrome", grams: 1000, colors: ["#CCCCCC"] } },
    { q: "aiDemoHomeQ4", a: "aiDemoHomeA4", tool: "list_printers" },
  ] },
  { id: "friends", label: "aiCaseFriends", icon: "user", steps: [
    { q: "aiDemoFriendsQ1", a: "aiDemoFriendsA1", tool: "friend_inventory", card: { img: "https://cdn.tigertag.io/img?id=40391303&v=1&size=medium", line: "Rosa3D · PLA-Silk · Gold", grams: 820, colors: ["#EAC866"] } },
    { q: "aiDemoFriendsQ2", a: "aiDemoFriendsA2", tool: "list_wishlists", cards: [{ img: "https://cdn.tigertag.io/img?id=3107718018&v=2&size=medium", line: "Bambu Lab · PLA Matte · Ivory White", colors: ["#FFFFFF"] }, { img: "https://cdn.tigertag.io/img?id=9945637&v=1&size=medium", line: "Rosa3D · PET-G CarbonLook · Carbon Black", colors: ["#161817"] }] },
    { q: "aiDemoFriendsQ3", a: "aiDemoFriendsA3", tool: "update_spool" },
  ] },
  // Business: several sites run as friend accounts, B2B purchase requests through their wishlists.
  { id: "pro", label: "aiCasePro", icon: "briefcase", steps: [
    { q: "aiDemoBizQ1", a: "aiDemoBizA1", tool: "friend_inventory ×3" },
    { q: "aiDemoBizQ2", a: "aiDemoBizA2", tool: "list_wishlists" },
    { q: "aiDemoBizQ3", a: "aiDemoBizA3", tool: "friend_inventory ×2" },
    { q: "aiDemoProQ1", a: "aiDemoProA1", tool: "search_catalog → create_spools", file: "facture-atome3d.pdf", kind: "pdf" },
    { q: "aiDemoBizQ4", a: "aiDemoBizA4", tool: "update_product ×8" },
    { q: "aiDemoProQ5", a: "aiDemoProA5", tool: "inventory_summary → search_catalog" },
    { q: "aiDemoProQ6", a: "aiDemoProA6", tool: "match_filaments", file: "support-moteur.3mf", kind: "printer", card: { img: "https://cdn.tigertag.io/img?id=1178930540&v=1&size=medium", line: "eSun · PETG · Black", grams: 640, colors: ["#101820"] } },
  ] },
  { id: "sites", label: "aiCaseSites", icon: "globe", steps: [
    { q: "aiDemoSitesQ1", a: "aiDemoSitesA1", tool: "friend_inventory ×3" },
    { q: "aiDemoSitesQ2", a: "aiDemoSitesA2", tool: "list_wishlists" },
    { q: "aiDemoSitesQ3", a: "aiDemoSitesA3", tool: "search_catalog" },
  ] },
];
let demoRun = 0, demoCase = 0;
let demoView = "phone";     // "phone" (default: it works from a phone too) | "desktop"
function demoAdd(box, cls, html) {
  const el = document.createElement("div");
  el.className = cls;
  el.innerHTML = html;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}
function demoTabs(demo) {
  demo.querySelectorAll("[data-demo-case]").forEach(b => {
    const on = Number(b.dataset.demoCase) === demoCase;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", String(on));
    // Only the tab strip scrolls to show it, never the page.
    if (on) { const strip = b.parentElement; strip.scrollLeft = Math.max(0, b.offsetLeft - (strip.clientWidth - b.offsetWidth) / 2); }
  });
  demo.querySelectorAll("[data-demo-view]").forEach(b => {
    const on = b.dataset.demoView === demoView;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  });
}
async function playDemo(box) {
  if (!box) return;
  const { t, esc } = ctx;
  const run = ++demoRun;
  const demo = box.closest(".ai-demo"), col = box.closest(".ai-demo-col") || demo;
  const typed = demo.querySelector(".ai-demo-typed"), attach = demo.querySelector(".ai-demo-attach"), send = demo.querySelector(".ai-demo-send");
  if (!col.dataset.wired) {
    col.dataset.wired = "1";
    col.addEventListener("click", (e) => {
      const link = e.target.closest("[data-demo-link]");
      if (link) { e.preventDefault(); return ctx.openExternal(link.dataset.demoLink); }
      const v = e.target.closest("[data-demo-view]");
      if (v) {
        demoView = v.dataset.demoView;
        col.classList.toggle("is-phone", demoView === "phone");
        demoTabs(col);
        box.scrollTop = box.scrollHeight;
        return;
      }
      const b = e.target.closest("[data-demo-case]");
      if (!b) return;
      demoCase = Number(b.dataset.demoCase);
      playDemo(box);
    });
  }
  const alive = () => run === demoRun && box.isConnected;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const thumb = (x) => x.file ? `<span class="ai-demo-thumb"><span class="icon icon-${x.kind} icon-18" aria-hidden="true"></span><small>${esc(x.file)}</small></span>` : "";
  // The robot beside every answer says who is talking.
  const ava = `<span class="ai-demo-ava" aria-hidden="true"><span class="icon icon-robot"></span></span>`;
  // The product as an assistant shows it from image_url (data_guide → presenting):
  // the photo, then brand · material · colour — grams.
  // The photo framed by its colour, painted the way Studio paints it (ctx.swatchBg → colorBg).
  const card = (c) => c ? `<figure class="ai-demo-card"><span class="ai-demo-swatch" style="background:${esc(c.colors?.length ? ctx.swatchBg?.(c.colors) || "transparent" : "transparent")}"><img src="${esc(c.img)}" alt="" loading="lazy" /></span><figcaption><b>${esc(c.line)}</b>${c.grams != null ? ` — ${esc(c.grams.toLocaleString(ctx.lang()))} g` : ""}</figcaption></figure>` : "";
  // One answer can show several products, side by side.
  const cards = (x) => { const list = [].concat(x.cards || x.card || []); return list.length ? `<div class="ai-demo-cards">${list.map(card).join("")}</div>` : ""; };
  // Links in an answer are clickable, as the assistant is told to give them (data_guide → presenting).
  const linkify = (txt) => esc(txt).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)»]|\b(?:[Aa]tome3D\.com|wiki\.tigersystem\.io|tigersystem\.io)\b/g,
    (m) => `<a href="#" class="ai-demo-link" data-demo-link="${/^https?:/.test(m) ? m : `https://${m.toLowerCase()}`}">${m}</a>`);
  const answer = (x) => `${ava}<div><div class="ai-demo-done"><span class="icon icon-check icon-12" aria-hidden="true"></span>TigerSystem · ${esc(x.tool)}</div><p>${linkify(t(x.a))}</p>${cards(x)}</div>`;
  const user = (x) => `${thumb(x)}<p>${esc(t(x.q))}</p>`;
  const setTyped = (txt) => { typed.textContent = txt; demo.classList.toggle("is-typing", !!txt || !!attach.innerHTML); };
  // The open case's tab fills up as its exchanges play: full when the next case starts.
  const setBar = (frac, ms = 0) => {
    col.querySelectorAll("[data-demo-case]").forEach(b => {
      const i = b.querySelector(".ai-demo-tab-bar i");
      if (!i) return;
      const on = Number(b.dataset.demoCase) === demoCase;
      i.style.transition = on && ms ? `width ${ms}ms linear` : "none";
      i.style.width = on ? `${Math.round(frac * 100)}%` : "0%";
    });
  };
  demoTabs(col);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    box.innerHTML = "";
    DEMO_CASES[demoCase].steps.forEach(x => { demoAdd(box, "ai-demo-user", user(x)); demoAdd(box, "ai-demo-ai", answer(x)); });
    return;
  }
  while (alive()) {
    box.innerHTML = ""; attach.innerHTML = ""; setTyped("");
    demoTabs(col);
    const steps = DEMO_CASES[demoCase].steps;
    setBar(0);
    for (const [k, x] of steps.entries()) {
      // This exchange's share of the bar fills over about the time it takes to play.
      setBar((k + 1) / steps.length, 600 + (x.file ? 500 : 0) + t(x.q).length * 30 + 320 + 160 + 350 + 1400 + 2600);
      await sleep(600);
      if (!alive()) return;
      // The file first, as a thumbnail in the composer; then the question, typed.
      if (x.file) { attach.innerHTML = thumb(x); setTyped(""); await sleep(500); }
      const q = t(x.q);
      for (let n = 1; n <= q.length && alive(); n++) { setTyped(q.slice(0, n)); await sleep(30); }
      if (!alive()) return;
      await sleep(320);
      send.classList.add("is-press");
      await sleep(160);
      send.classList.remove("is-press");
      attach.innerHTML = ""; setTyped("");
      demoAdd(box, "ai-demo-user is-in", user(x));
      await sleep(350);
      // What it is calling, with the moving dots, then the answer in plain text.
      const ai = demoAdd(box, "ai-demo-ai", `${ava}<div class="ai-demo-work"><span class="ai-demo-dots"><i></i><i></i><i></i></span>TigerSystem · ${esc(x.tool)}</div>`);
      await sleep(1400);
      if (!alive()) return;
      ai.innerHTML = answer(x);
      ai.classList.add("is-in");
      box.scrollTop = box.scrollHeight;
      // The product photo arrives a moment later: keep the thread at its end.
      ai.querySelectorAll("img").forEach(img => img.addEventListener("load", () => { box.scrollTop = box.scrollHeight; }, { once: true }));
      await sleep(2600);
      if (!alive()) return;
    }
    await sleep(2200);
    demoCase = (demoCase + 1) % DEMO_CASES.length;
  }
}

// ── History: a side card on the right (#aiHistoryPanel) ─────────────────
// Every change of the journal (30 days on this computer), newest first, by
// day, with Undo — opened from the page head's "History".
const histPanel = () => document.getElementById("aiHistoryPanel");
const histOpen = () => !!histPanel()?.classList.contains("open");
function paintHistoryCard() {
  const box = document.getElementById("aiHistoryBody");
  if (!box) return;
  const { t, esc } = ctx;
  const all = ctx.journal().slice().reverse();
  const days = new Map();
  for (const c of all) {
    const day = new Date(c.at).toLocaleDateString(ctx.lang(), { weekday: "long", day: "numeric", month: "long" });
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(c);
  }
  box.innerHTML = all.length ? [...days].map(([day, list]) => `<section class="ai-hist-day">
      <h3 class="aip-title aip-day">${esc(day)}</h3>
      <div class="ai-feed aip-feed--all">${list.map(c => changeHtml(c)).join("")}</div></section>`).join("")
    : `<p class="ai-empty">${esc(t("aiNoChanges"))}</p>`;
}
export function openAiHistory() {
  const p = histPanel();
  if (!p || histOpen()) return;
  ctx.closeAllSide?.();
  paintHistoryCard();
  p.classList.add("open");
  ctx.syncPanels?.();
  if (pageHost) renderAiPage(pageHost);
}
export function closeAiHistory() {
  const p = histPanel();
  if (!p || !histOpen()) return;
  p.classList.remove("open");
  ctx?.syncPanels?.();
  markTiles();
}
function wireHistoryCard() {
  const p = histPanel();
  if (!p || p.dataset.wired) return;
  p.dataset.wired = "1";
  document.getElementById("aiHistoryClose")?.addEventListener("click", closeAiHistory);
  document.getElementById("aiHistoryCloseTab")?.addEventListener("click", closeAiHistory);
  p.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-ai-undo]");
    if (!el) return;
    el.disabled = true;
    try { await ctx.undo(el.dataset.aiUndo); paintHistoryCard(); repaintPage(); }
    catch (_) { el.disabled = false; ctx.flash(ctx.t("aiUndoFailed")); }
  });
}
// ── Access and security: the one place for what assistants may do ────────
// Online first: one row per assistant with its right, when it was connected
// and last used, and a held "Cut access". This computer: one switch turns the
// local server on (read only first), then read only / read and change while it
// is on; the key renewal under "Advanced".
async function paintAccess(host) {
  const { t, esc } = ctx;
  const cfg = await ctx.api.getConfig().catch(() => null);
  if (pageHost !== host || pageMode !== "access") return;
  const on = !!cfg?.enabled, level = cfg?.write ? "write" : "read";
  host.innerHTML = `<div class="aip">
    <header class="aip-head">
      <button type="button" class="secondary" data-aip="back"><span class="icon icon-chevron-l icon-14" aria-hidden="true"></span>${esc(t("aiBack"))}</button>
      <div class="aip-head-text"><h1>${esc(t("aiAccessTitle"))}</h1><p>${esc(t("aiAccessSub"))}</p></div>
    </header>
    <p class="aip-privacy"><span class="icon icon-info icon-14" aria-hidden="true"></span>${esc(t("aiAccessPrivacy"))}</p>
    <div class="aip-grid">
      <section class="aip-card">
        <h3 class="aip-title"><span class="icon icon-globe icon-14" aria-hidden="true"></span>${esc(t("aiWhereWeb"))}</h3>
        <p class="ai-hint">${esc(t("aiWhereWebSub"))}</p>
        <div class="aip-grants" id="aipGrants"><p class="ai-empty">${esc(t("eacMcpGrantsLoading"))}</p></div>
      </section>
      <section class="aip-card">
        <h3 class="aip-title"><span class="icon icon-home icon-14" aria-hidden="true"></span>${esc(t("aiWhereLocal"))}</h3>
        <p class="ai-hint">${esc(t("aiWhereLocalSub"))}</p>
        <div class="eac-row aip-switch"><span class="eac-row-label">${esc(t("aiToggleRead"))}</span>
          <label class="eac-toggle"><input type="checkbox" role="switch" id="aipLocalOn"${on ? " checked" : ""} aria-label="${esc(t("aiToggleRead"))}" /><span class="eac-toggle-track"><span class="eac-toggle-thumb"></span></span></label></div>
        ${on ? `<div class="eac-row aip-switch"><span class="eac-row-label">${esc(t("aiMarkRights"))}</span>
          <div class="eac-seg eac-seg--slide ai-rights-seg" role="radiogroup" aria-label="${esc(t("aiQRights"))}">
          <button type="button" class="eac-seg-btn${level === "write" ? "" : " active"}" data-aip-level="read" role="radio" aria-checked="${!(level === "write")}">${esc(t("aiSegRead"))}</button>
          <button type="button" class="eac-seg-btn${level === "write" ? " active" : ""}" data-aip-level="write" role="radio" aria-checked="${level === "write"}">${esc(t("aiRightsWrite"))}</button></div></div>
        <div class="aip-screen">
          <div class="eac-row aip-switch"><span class="eac-row-label">${esc(t("aiScreenToggle"))}</span>
            <label class="eac-toggle"><input type="checkbox" role="switch" id="aipScreenOn"${cfg?.screen ? " checked" : ""} aria-label="${esc(t("aiScreenToggle"))}" /><span class="eac-toggle-track"><span class="eac-toggle-thumb"></span></span></label></div>
          <p class="ai-hint">${esc(t("aiScreenToggleSub"))}</p>
        </div>
        <div class="aip-renew">
          <p class="ai-hint">${esc(t("aiRenewKeyHint"))}</p>
          <button type="button" class="secondary aip-hold" id="aipRenewKey" data-hold-tip="aiRenewKeyHint">
            <span class="hold-progress"></span><span class="icon icon-key icon-14" aria-hidden="true"></span><span>${esc(t("aiRenewKey"))}</span>
          </button>
        </div>
        ` : ""}
      </section>
    </div>
  </div>`;
  host.querySelector("#aipLocalOn").addEventListener("change", (e) => setAccess(e.target.checked));
  host.querySelector("#aipScreenOn")?.addEventListener("change", async (e) => { await ctx.api.setScreen(e.target.checked); renderAiPage(pageHost); });
  const renew = host.querySelector("#aipRenewKey");
  if (renew) ctx.holdToConfirm(renew, 1500, async () => {
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
  // A Hub that knows writes sends each grant's `write` (boolean; `scope` "read" |
  // "read write" also read): then the row carries the Read | Read & write switch;
  // an older one stays read only.
  const canWrite = (g) => typeof g.write === "boolean" || typeof g.scope === "string";
  const writes = (g) => g.write === true || /\bwrite\b/.test(g.scope || "");
  box.innerHTML = grants.map(g => `<div class="aip-grant" data-id="${esc(g.id)}">
      <div class="ai-ev-main">
        <div class="ai-ev-text"><b>${esc(g.clientName || t("eacMcpGrantUnnamed"))}</b>${canWrite(g) ? "" : ` · ${esc(t("aiRightsRead"))}`}</div>
        ${canWrite(g) ? `<div class="eac-seg eac-seg--slide ai-rights-seg ai-grant-seg" role="radiogroup" aria-label="${esc(t("aiQRights"))}">
          <button type="button" class="eac-seg-btn${writes(g) ? "" : " active"}" data-grant-write="read" role="radio" aria-checked="${!writes(g)}">${esc(t("aiSegRead"))}</button>
          <button type="button" class="eac-seg-btn${writes(g) ? " active" : ""}" data-grant-write="write" role="radio" aria-checked="${writes(g)}">${esc(t("aiRightsWrite"))}</button></div>` : ""}
        <small>${esc(t("eacMcpGrantSince", { date: day(g.createdAt) }))}${g.lastUsedAt && !isNaN(Date.parse(g.lastUsedAt)) ? ` · ${esc(t("eacMcpGrantUsed", { ago: ctx.timeAgo(Date.parse(g.lastUsedAt)) }))}` : ""}</small>
      </div>
      <button type="button" class="secondary sm aip-hold" data-hold-tip="eacMcpGrantCutTip"><span class="hold-progress"></span><span>${esc(t("eacMcpGrantCut"))}</span></button>
    </div>`).join("")
    // The assistant reads its tool list when a chat starts: a switch shows from the next one.
    + (grants.some(canWrite) ? `<p class="ai-hint">${esc(t("aiGrantSwitchNote"))}</p>` : "");
  box.querySelectorAll(".aip-grant").forEach(row => ctx.holdToConfirm(row.querySelector(".aip-hold"), 1500, async () => {
    // 204 = cut; 404 = already gone — either way the row leaves.
    try {
      const token = await ctx.idToken();
      const res = token ? await ctx.api.hostedGrants(token, row.dataset.id) : null;
      if (!res || (!res.ok && res.status !== 404)) { row.querySelector("small").textContent = t("eacMcpGrantsErr"); return; }
      row.remove();
      live = null;
      webCount = box.querySelectorAll(".aip-grant").length;
      if (!webCount) line("eacMcpGrantsNone");
    } catch (_) {}
  }));
}
// On starts read only and counts for Tiger Quests; off turns changes off too.
async function setAccess(on) {
  live = null;
  await ctx.api.setEnabled(on);
  await ctx.api.setWrite(false);
  if (!on) await ctx.api.setScreen?.(false);
  if (on) ctx.aiEnabled();
  renderAiPage(pageHost);
}
// The sliding Read | Read & write switch: light the picked half in place (no repaint, so the pill slides).
function segPick(btn) {
  btn.parentElement.querySelectorAll(".eac-seg-btn").forEach(b => { const on = b === btn; b.classList.toggle("active", on); b.setAttribute("aria-checked", on); });
}
async function setLevel(level) {
  live = null;
  await ctx.api.setWrite(level === "write");
}
// An online assistant's access, changed on the Hub (its grant's scope); back to what it was if refused.
async function setGrantWrite(btn) {
  const row = btn.closest(".aip-grant"), was = row?.querySelector(".eac-seg-btn.active");
  if (!row || btn === was) return;
  segPick(btn);
  let res = null;
  try { const token = await ctx.idToken(); res = token ? await ctx.api.hostedGrantWrite?.(token, row.dataset.id, btn.dataset.grantWrite === "write") : null; } catch (_) {}
  if (!res?.ok) { if (was) segPick(was); const s = row.querySelector("small"); if (s) s.textContent = ctx.t("eacMcpGrantsErr"); }
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
    case "search_wiki": return { icon: "book", action: t("aiEvWiki"), detail: found((result.pages || []).length) };
    case "read_wiki_page": return { icon: "book", action: t("aiEvWikiPage"), object: result.title || "" };
    case "list_tickets": return { icon: "chat", action: t("aiEvTickets"), detail: t("aiEvResults", { n: result.total ?? 0 }) };
    case "get_ticket": return { icon: "chat", action: t("aiEvTicket"), object: result.number ? `#${result.number} · ${result.title}` : "" };
    case "open_ticket": return { icon: "send", action: t("aiEvTicketDraft"), object: result.shown_to_user?.title || "" };
    case "show_view": return { icon: "eye-on", action: t("aiEvShowView") };
    case "open_spool": case "open_printer": return { icon: "eye-on", action: t("aiEvOpenCard"), object: result.name || "" };
    case "highlight": return { icon: "eye-on", action: t("aiEvHighlight", { n: result.highlighted ?? 0 }) };
    case "screenshot": return { icon: "image", action: t("aiEvShot"), detail: result.hidden_zones ? t("aiEvShotHidden", { n: result.hidden_zones }) : "" };
    case "read_screen": return { icon: "eye-on", action: t("aiEvReadScreen") };
    case "reply_ticket": return { icon: "send", action: t("aiEvReplyDraft"), object: result.request ? `#${result.request.number} · ${result.request.title}` : "" };
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
  if (c.kind === "ticket") return { icon: "send", object: t("aiEvTicketOpened", { n: c.number }), field: c.title };
  if (c.kind === "ticket_reply") return { icon: "send", object: t("aiEvTicketReplied", { n: c.number }), field: c.title };
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
    <time>${c.via === "online" ? `<span class="ai-via"><span class="icon icon-globe icon-12" aria-hidden="true"></span>${esc(c.client || t("aiTileWeb"))}</span> · ` : ""}${esc(clock(c.at))}</time>
    ${undoable ? undoBtn(c.id, !!c.undoneAt) : ""}</div>`;
}
function undoBtn(id, done = false) {
  const { t, esc } = ctx;
  return done ? `<small class="ai-undone">${esc(t("aiUndone"))}</small>`
    : `<button type="button" class="secondary sm ai-undo" data-ai-undo="${esc(id)}">${esc(t("aiUndo"))}</button>`;
}

// The shared journal moved (a change made online, an undo on another
// computer): repaint the history and the page's latest changes.
export function aiJournalChanged() {
  if (!ctx) return;
  if (histOpen()) paintHistoryCard();
  if (ctx.pageShown() && pageMode === "main") repaintPage();
}

// ── A tool call relayed by main (local server) ────────────────────────────
export function aiOnToolCall(ev) {
  if (!ctx) return;
  if (histOpen()) setTimeout(paintHistoryCard, 0);   // a change it just made joins the list
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
  if (!plugged() && ev.ok) { savePrefs({ ...prefs(), connectedAt: Date.now(), via: "local", client: null }); aiAccountChanged(); return repaintPage(); }
  if (ctx.pageShown()) {
    // A question newly ticked or a change made repaints the page; otherwise only the feed moves.
    const box = document.getElementById("aiFeed");
    if (tried.size !== before || ev.result?.change_id || !box) repaintPage(); else box.innerHTML = feedHtml();
  }
}

function connected(via) {
  stopPoll();
  const app = appName(CLIENTS.find(x => x.id === flow?.client));
  savePrefs({ ...prefs(), connectedAt: Date.now(), via, client: flow?.client || null });
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
  // Each step checks the TigerSquad again: leaving it ends the setup on the spot.
  if (ctx.squadActive && !ctx.squadActive()) { win?.close(); ctx.squadOnly?.(); return; }
  const el = e.target.closest("[data-ai], [data-ai-client], [data-ai-pick], [data-ai-copy], [data-ai-undo]");
  if (!el) return;
  const list = steps(), i = list.indexOf(flow.step);
  // Leaving the connect screen ends its wait; a new screen starts clean.
  const go = (s) => { flow.step = s; flow.waiting = flow.copied = flow.trouble = false; stopPoll(); paint(); };
  const wait = () => { if (!flow.waiting) { flow.waiting = true; flow.since = Date.now(); if (where() === "web") startPoll(); } paint(); };
  if (el.dataset.aiClient) { flow.client = el.dataset.aiClient; flow.where = "web"; return paint(); }
  if (el.dataset.aiPick) {
    if (flow.step === "where") { flow.where = el.dataset.aiPick; return paint(); }
    flow.rights = el.dataset.aiPick; return segPick(el);   // in place: the pill slides
  }
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
    case "getclaude": return ctx.openExternal(CLAUDE_DOWNLOAD);
    // Back on the screen the setup started on (the first one, or the one a logo
    // opened) leaves it: the page is the welcome again — a step back, not a new page.
    case "back": if (i > 0 && flow.step !== flow.entry) return go(list[i - 1]); return win?.close();
    case "next":
      // Picking what it may do on this computer IS turning it on: no access
      // level ever sits on a switched-off computer.
      if (flow.step === "rights") {
        el.disabled = true;
        await ctx.api.setEnabled(true);
        await ctx.api.setWrite(flow.rights === "write");
        live = null;
        ctx.aiEnabled();
      }
      return go(list[i + 1]);
    case "manual": return connected(where() === "web" ? "online" : "local");
    case "trouble": flow.trouble = true; return paint();
    case "guide": {
      const c = CLIENTS.find(x => x.id === flow.client);
      ctx.openExternal(c?.doc || ctx.guideUrl(c?.guide || flow.client));
      return where() === "web" ? wait() : undefined;
    }
    case "openapp": {
      const c = CLIENTS.find(x => x.id === flow.client);
      if (where() === "web") { if (c?.open) ctx.openExternal(c.open); }
      else await ctx.api.openApp?.(c.local).catch(() => null);
      return;
    }
    case "install": {
      const c = CLIENTS.find(x => x.id === flow.client);
      el.disabled = true;
      await ctx.api.install(c.local).catch(() => null);
      flow.trouble = false;
      return wait();
    }
    case "localcopy": {
      // The local server's address and key, in the "mcpServers" form most MCP
      // clients read; copied, never shown on screen.
      const cfg = await ctx.api.getConfig().catch(() => null);
      if (!cfg?.url) return;
      const conf = { mcpServers: { "tiger-studio": { type: "http", url: cfg.url, headers: { Authorization: `Bearer ${cfg.token}` } } } };
      // Gemini CLI: one terminal command that writes the same server into
      // ~/.gemini/settings.json (user scope, Streamable HTTP).
      const text = CLIENTS.find(x => x.id === flow.client)?.local === "gemini-cli"
        ? `gemini mcp add -s user --transport http tiger-studio ${cfg.url} --header "Authorization: Bearer ${cfg.token}"`
        : JSON.stringify(conf, null, 2);
      try { await navigator.clipboard.writeText(text); } catch (_) {}
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
