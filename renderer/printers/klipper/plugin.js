/**
 * printers/klipper/plugin.js — Klipper plugin, entry point (BETA).
 *
 * Any printer running Klipper + Moonraker (Voron, RatRig, Sovol SV08, Qidi,
 * rooted Creality K1…). Self-contained: this folder holds its connection core,
 * cards, camera, discovery, add flow, styles, model catalogue, strings and its
 * main-process side (main.cjs). It imports host services only — never another
 * brand's files. Contract: docs/PRINTER-PLUGINS.md. Protocol: ./PROTOCOL.md.
 */
import { ctx } from '../context.js';
import { registerPrinterPlugin } from '../plugins.js';
import { schemaWidget } from '../modal-helpers.js';
import { betaBadgeHtml } from '../beta-badge.js';
import {
  BRAND, klipperKey, klipperGetConn, klipperIsOnline, klipperPing, klipperConnect,
  klipperDisconnect, klipperDisconnectAll, klipperJobControl, klipperWriteSlot,
  onKlipperChange, remainingSec, klipperSetTemp,
} from './core.js';
import { wireTempEdit } from '../temp-edit.js';
import { openKlipperFilamentEdit } from './filament-edit.js';
import { morphInner } from '../dom-morph.js';
import {
  renderKlipperJobCard, renderKlipperTempCard, renderKlipperFilamentCard,
  renderKlipperSensorsCard, wireKlipperSensors,
} from './cards.js';
import { renderKlipperCamBanner, renderKlipperCamWallBanner, klipperCamStopAll, klipperHasCamera } from './camera.js';
import { openKlipperAddFlow } from './add-flow.js';
import { renderKlipperLogo } from './logo.js';
import { renderControlCard, patchControlCard, controlSig, wireControl } from './control.js';

const HERE = new URL('./', import.meta.url).href;
const $ = id => document.getElementById(id);

const meta = {
  label: "Klipper",
  accent: "#b12f36",
  connection: "Moonraker (LAN)",
  beta: true,
};

const schema = {
  docsUrl: "https://moonraker.readthedocs.io/en/latest/configuration/#authorization",
  sections: [
    { titleKey: "printerSecConnection", fields: [
      { key: "ip", labelKey: "printerLblIP", hintKey: "printerHintKlipperIP",
        placeholder: "192.168.1.50", mono: true, required: true },
      { key: "port", labelKey: "klipperManualPortLabel", hintKey: "klipperManualPortHint",
        placeholder: "7125", mono: true, toggleKey: "klipperCustomPort", toggleDefault: "7125" },
    ]},
    { fields: [
      { key: "apiKey", labelKey: "printerLblKlipperApiKey", hintKey: "printerHintKlipperApiKey",
        placeholder: "••••••••", mono: true, required: false, secret: true },
    ]},
  ],
  // The port is shown in its own box but STORED inside `ip` ("host:port") —
  // the one field Studio and the Tiger Touch firmware both read.
  toForm: d => {
    const m = /^(.*?):(\d{1,5})$/.exec(String(d.ip || "").trim());
    return m ? { ...d, ip: m[1], port: m[2] } : d;
  },
  fromForm: d => {
    const { port: raw = "", ...rest } = d;
    const host = String(rest.ip || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    const port = String(raw).trim();
    if (port && !(/^\d{1,5}$/.test(port) && +port >= 1 && +port <= 65535)) throw new Error("klipperManualPortInvalid");
    return { ...rest, ip: port && +port !== 7125 && !/:\d+$/.test(host) ? `${host}:${port}` : host };
  },
};

const helper = { titleKey: "printerHelperKlipperTitle", bulletsKey: "printerHelperKlipperBullets" };

// ── Live block (side card) ──────────────────────────────────────────────────
const banner = (icon, text, extra = "") =>
  `<div class="ffg-error-banner${extra}"><span class="icon icon-${icon} icon-14"></span><span>${ctx.esc(text)}</span></div>`;

function renderLiveInner(p) {
  const conn = klipperGetConn(p);
  if (!conn) return `
    <div class="snap-empty"><span class="icon icon-cloud icon-18"></span><span>${ctx.esc(ctx.t("snapNoConnection"))}</span></div>`;
  const beta = betaBadgeHtml();
  if (conn.status === "error") return beta + banner("info", conn.lastError === "auth" ? ctx.t("klipperErrAuth") : String(conn.lastError || ""));
  if (conn.status === "connected" && !conn.ready) {
    const msg = conn.data.stateMessage ? String(conn.data.stateMessage).split("\n")[0] : (conn.data.klippyState || "");
    return beta + banner("alert", ctx.t("klipperErrKlippy", { msg }));
  }
  // Three hosts so a poll can patch the control card instead of rebuilding it.
  return `<div data-klp-part="top">${renderTop(p, conn)}</div>
    <div data-klp-part="ctrl" data-sig="${ctx.esc(controlSig(conn))}">${renderControlCard(p, conn)}</div>
    <div data-klp-part="bottom">${renderBottom(p, conn)}</div>`;
}

function renderTop(p, conn) {
  const d = conn.data;
  const beta = betaBadgeHtml();
  const err = d.printState === "error" && d.stateMessage ? banner("alert", String(d.stateMessage).split("\n")[0]) : "";
  return `${beta}${err}${renderKlipperJobCard(p, conn)}`;
}

// Same order as every other brand: job · control · temperature · filament.
const renderBottom = (p, conn) => `${renderKlipperTempCard(conn)}${renderKlipperSensorsCard(conn)}${renderKlipperFilamentCard(p, conn)}`;

/** Poll refresh: top + bottom re-rendered, the control card patched in place. */
function refreshLive(live, p) {
  const conn = klipperGetConn(p);
  const top = live.querySelector('[data-klp-part="top"]'), ctrl = live.querySelector('[data-klp-part="ctrl"]');
  if (!conn || conn.status !== "connected" || !conn.ready || !top || !ctrl) {
    live.innerHTML = renderLiveInner(p); wireLive(live, p); return;
  }
  top.innerHTML = renderTop(p, conn);
  morphInner(live.querySelector('[data-klp-part="bottom"]'), renderBottom(p, conn));   // keeps an open temperature editor
  const sig = controlSig(conn);
  if (ctrl.dataset.sig !== sig) { ctrl.dataset.sig = sig; ctrl.innerHTML = renderControlCard(p, conn); }
  else patchControlCard(ctrl, conn);
  wireLive(live, p);
}

function renderLogInner(p) {
  const log = klipperGetConn(p)?.log || [];
  if (!log.length) return `<div class="snap-log-empty">${ctx.esc(ctx.t("snapLogEmpty"))}</div>`;
  return log.slice().reverse().map((e, i) => {
    let pretty = e.raw;
    try { pretty = JSON.stringify(JSON.parse(e.raw), null, 2); } catch (_) {}
    return `
      <div class="snap-log-row snap-log-row--${e.dir === "→" ? "out" : "in"}" data-log-idx="${log.length - 1 - i}">
        <button type="button" class="snap-log-row-head" data-row-toggle="1">
          <span class="snap-log-dir">${ctx.esc(e.dir)}</span>
          <span class="snap-log-ts">${ctx.esc(e.ts)}</span>
          <span class="snap-log-summary">${ctx.esc(e.summary)}</span>
          <span class="snap-log-row-chev icon icon-chevron-r icon-13"></span>
        </button>
        <div class="snap-log-detail" hidden>
          <button type="button" class="snap-log-detail-copy" data-copy="${ctx.esc(pretty)}">${ctx.esc(ctx.t("copyLabel"))}</button>
          <pre>${ctx.esc(pretty)}</pre>
        </div>
      </div>`;
  }).join("");
}

function wireLive(root, p) {
  if (!root || !p) return;
  wireControl(root, () => ctx.getActivePrinter());
  wireTempEdit(root, (heater, v) => { const ap = ctx.getActivePrinter(); if (ap) klipperSetTemp(ap, heater, v); });
  wireKlipperSensors(root);
  if (!root.dataset.klpFilWired) {
    root.dataset.klpFilWired = "1";
    const open = e => {
      const el = e.target.closest("[data-klp-fil]"), ap = ctx.getActivePrinter();
      if (el && ap) openKlipperFilamentEdit(ap, el.dataset.klpFil);
    };
    root.addEventListener("click", open);
    root.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { if (e.target.closest("[data-klp-fil]")) { e.preventDefault(); open(e); } } });
  }
  root.querySelectorAll("[data-klipper-job]").forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    const action = btn.dataset.klipperJob;
    ctx.setupHoldToConfirm(btn, action === "stop" ? 1500 : 1200, () => klipperJobControl(p, action));
  });
}

function renderOnlineBadge(p, where) {
  const online = klipperIsOnline(p);
  const cls = online === true ? "is-online" : online === false ? "is-offline" : "is-checking";
  const lbl = online === true ? ctx.t("snapStatusOnline") : online === false ? ctx.t("snapStatusOffline") : ctx.t("snapStatusConnecting");
  return `<span class="printer-online printer-online--${ctx.esc(where)} ${cls}"${where === "side" ? ` id="ppOnlineRow"` : ""}>
            <span class="printer-online-dot"></span><span class="printer-online-lbl">${ctx.esc(lbl)}</span>
          </span>`;
}

// ── Change propagation (rAF-coalesced, like the HTTP brands) ────────────────
let _gridRaf = null, _statusRaf = null, _liveRaf = null;
onKlipperChange((kind, key) => {
  if (kind === "status" || kind === "online") {
    if (!_statusRaf) _statusRaf = requestAnimationFrame(() => { _statusRaf = null; ctx.onPrinterGridChange(); });
    document.querySelectorAll(`[data-printer-key="${CSS.escape(key)}"] .printer-online`).forEach(el => {
      const p = (ctx.getState().printers || []).find(x => klipperKey(x) === key);
      if (p) el.outerHTML = renderOnlineBadge(p, "card");
    });
    if (kind === "status") ctx.onPrinterStatusChange(key, klipperGetConn(key)?.status ?? null);
  }
  if (!_gridRaf) _gridRaf = requestAnimationFrame(() => { _gridRaf = null; ctx.onGridJobsChange(); });
  const active = ctx.getActivePrinter();
  if (!active || klipperKey(active) !== key || _liveRaf) return;
  _liveRaf = requestAnimationFrame(() => {
    _liveRaf = null;
    const live = $("klipperLive");
    if (live) refreshLive(live, active);
    const logHost = $("klipperLog");
    if (logHost) logHost.innerHTML = renderLogInner(active);
    const count = $("klipperLogCount");
    if (count) count.textContent = String(klipperGetConn(active)?.log?.length || 0);
    const side = $("ppOnlineRow");
    if (side) side.outerHTML = renderOnlineBadge(active, "side");
  });
});

// ── Slots (the host's generic slot/unit model) ─────────────────────────────
function getSlots(p) {
  const conn = klipperGetConn(p);
  if (!conn || conn.status !== "connected" || !conn.ready) return [];
  return conn.data.filaments.map((f, i) => ({
    key: f.key, label: f.label, color: f.color, material: f.material, vendor: null,
    empty: !!f.empty || (!f.color && !f.material), loaded: !f.empty && !!(f.color || f.material), index: i,
  }));
}
function getUnits(p) {
  const slots = getSlots(p);
  if (!slots.length) return [];
  const sys = klipperGetConn(p)?.data?.slotSystem;
  if (sys === "mmu" || sys === "afc" || slots.length > 1) {
    return [{ kind: "holder", index: 0, label: sys === "mmu" ? "MMU" : sys === "afc" ? "AFC" : "", hwId: null,
      rows: 1, cols: slots.length, slots: slots.map((s, i) => ({ ...s, index: i, hw: { slot: s.key } })) }];
  }
  return [{ kind: "ext", index: 0, label: "", hwId: null, rows: 1, cols: 1,
    slots: slots.map((s, i) => ({ ...s, index: i, hw: { external: true } })) }];
}

/** The host's normalized job shape (board cards, job bar, notifications). */
function job(p) {
  const conn = klipperGetConn(p);
  if (!conn || conn.status !== "connected" || !conn.ready) return null;
  const d = conn.data;
  return {
    conn, state: d.printState || "idle", pct: Math.round((d.progress || 0) * 100),
    filename: d.printFilename, remainSec: remainingSec(d), thumbUrl: d.printPreviewUrl || null,
    layer: d.currentLayer, layerTotal: d.totalLayer, paused: d.printState === "paused",
  };
}

// ── Strings (merged into the app's locales by the host) ────────────────────
const i18n = {
  klipperCtrlFan: { en: "Part fan", fr: "Ventilo pièce", de: "Bauteillüfter", es: "Ventilador de pieza", it: "Ventola pezzo", zh: "模型风扇", pt: "Ventoinha da peça", "pt-pt": "Ventoinha da peça", pl: "Wentylator wydruku", ru: "Обдув детали", nl: "Onderdeelventilator" },
  klipperCtrlSpeed: { en: "Speed", fr: "Vitesse", de: "Tempo", es: "Velocidad", it: "Velocità", zh: "速度", pt: "Velocidade", "pt-pt": "Velocidade", pl: "Prędkość", ru: "Скорость", nl: "Snelheid" },
  klipperCtrlStep: { en: "Step", fr: "Pas", de: "Schritt", es: "Paso", it: "Passo", zh: "步长", pt: "Passo", "pt-pt": "Passo", pl: "Krok", ru: "Шаг", nl: "Stap" },
  klipperCtrlLight: { en: "Light", fr: "Lumière", de: "Licht", es: "Luz", it: "Luce", zh: "灯光", pt: "Luz", "pt-pt": "Luz", pl: "Światło", ru: "Свет", nl: "Licht" },
  klipperCtrlHome: { en: "Home {{axes}}", fr: "Origine {{axes}}", de: "{{axes}} referenzieren", es: "Origen {{axes}}", it: "Home {{axes}}", zh: "{{axes}} 归零", pt: "Home {{axes}}", "pt-pt": "Origem {{axes}}", pl: "Bazuj {{axes}}", ru: "Домой {{axes}}", nl: "{{axes}} homen" },
  klipperCtrlLocked: { en: "Hands off the axes while it prints — fan and speed still answer.", fr: "On ne touche pas aux axes pendant l'impression — ventilo et vitesse répondent toujours.", de: "Finger weg von den Achsen, solange gedruckt wird — Lüfter und Tempo hören trotzdem.", es: "Los ejes no se tocan mientras imprime; ventilador y velocidad siguen respondiendo.", it: "Giù le mani dagli assi mentre stampa: ventola e velocità rispondono comunque.", zh: "打印中请勿动轴 —— 风扇和速度依然可调。", pt: "Nada de mexer nos eixos durante a impressão — ventoinha e velocidade continuam respondendo.", "pt-pt": "Nada de mexer nos eixos durante a impressão — ventoinha e velocidade continuam a responder.", pl: "Osie nie do ruszania w trakcie druku — wentylator i prędkość dalej słuchają.", ru: "Оси не трогаем, пока идёт печать — обдув и скорость по-прежнему слушаются.", nl: "Handen af van de assen tijdens het printen — ventilator en snelheid luisteren nog wel." },
  klipperAddChoiceTitle: {
    en: "Add a Klipper printer", fr: "Ajouter une imprimante Klipper", de: "Klipper-Drucker hinzufügen",
    es: "Añadir una impresora Klipper", it: "Aggiungi una stampante Klipper", zh: "添加 Klipper 打印机",
    pt: "Adicionar uma impressora Klipper", "pt-pt": "Adicionar uma impressora Klipper",
    pl: "Dodaj drukarkę Klipper", ru: "Добавить принтер Klipper", nl: "Klipper-printer toevoegen",
  },
  klipperScanEmpty: {
    en: "No Klipper in sight — is Moonraker running on port 7125?",
    fr: "Aucun Klipper en vue — Moonraker tourne bien sur le port 7125 ?",
    de: "Kein Klipper in Sicht — läuft Moonraker auf Port 7125?",
    es: "Ni rastro de Klipper — ¿Moonraker está en marcha en el puerto 7125?",
    it: "Nessun Klipper all'orizzonte — Moonraker gira sulla porta 7125?",
    zh: "没找到 Klipper —— Moonraker 是否在 7125 端口运行？",
    pt: "Nenhum Klipper à vista — o Moonraker está rodando na porta 7125?",
    "pt-pt": "Nenhum Klipper à vista — o Moonraker está a correr na porta 7125?",
    pl: "Ani śladu Klippera — czy Moonraker działa na porcie 7125?",
    ru: "Klipper не видно — Moonraker запущен на порту 7125?",
    nl: "Geen Klipper te zien — draait Moonraker op poort 7125?",
  },
  klipperCustomPort: { en: "Custom port", fr: "Port personnalisé", de: "Eigener Port", es: "Puerto personalizado", it: "Porta personalizzata", zh: "自定义端口", pt: "Porta personalizada", "pt-pt": "Porta personalizada", pl: "Własny port", ru: "Свой порт", nl: "Eigen poort" },
  klipperManualPortLabel: { en: "Port", fr: "Port", de: "Port", es: "Puerto", it: "Porta", zh: "端口", pt: "Porta", "pt-pt": "Porta", pl: "Port", ru: "Порт", nl: "Poort" },
  klipperManualPortHint: {
    en: "7125 is Moonraker's usual. Behind Mainsail or Fluidd on its own? Often 80.",
    fr: "7125, c'est le port habituel de Moonraker. Derrière Mainsail ou Fluidd tout seul ? Souvent 80.",
    de: "7125 ist Moonrakers Standard. Hinter Mainsail oder Fluidd allein? Oft 80.",
    es: "7125 es el de siempre de Moonraker. ¿Detrás de Mainsail o Fluidd solo? Suele ser 80.",
    it: "7125 è la solita di Moonraker. Dietro Mainsail o Fluidd da solo? Spesso 80.",
    zh: "7125 是 Moonraker 的默认端口。单独藏在 Mainsail 或 Fluidd 后面?通常是 80。",
    pt: "7125 é a de sempre do Moonraker. Atrás do Mainsail ou Fluidd sozinho? Muitas vezes é 80.",
    "pt-pt": "7125 é a habitual do Moonraker. Atrás do Mainsail ou Fluidd sozinho? Muitas vezes é 80.",
    pl: "7125 to zwykły port Moonrakera. Schowany za samym Mainsailem lub Fluiddem? Często 80.",
    ru: "7125 — обычный порт Moonraker. Спрятан за Mainsail или Fluidd? Часто это 80.",
    nl: "7125 is de gewone van Moonraker. Zit hij alleen achter Mainsail of Fluidd? Vaak 80.",
  },
  klipperManualPortInvalid: {
    en: "A port is a number between 1 and 65535 — that one isn't.",
    fr: "Un port, c'est un nombre entre 1 et 65535 — celui-là n'en est pas un.",
    de: "Ein Port ist eine Zahl zwischen 1 und 65535 — der hier nicht.",
    es: "Un puerto es un número entre 1 y 65535, y este no lo es.",
    it: "Una porta è un numero tra 1 e 65535: questo no.",
    zh: "端口是 1 到 65535 之间的数字 —— 这个不是。",
    pt: "Uma porta é um número entre 1 e 65535 — essa não é.",
    "pt-pt": "Uma porta é um número entre 1 e 65535 — essa não é.",
    pl: "Port to liczba od 1 do 65535 — ta nią nie jest.",
    ru: "Порт — это число от 1 до 65535, а это не оно.",
    nl: "Een poort is een getal tussen 1 en 65535 — deze niet.",
  },
  klipperManualNoReply: {
    en: "Nobody answered at {{ip}}. Check the address — Moonraker listens on port 7125 unless told otherwise.",
    fr: "Personne n'a répondu à {{ip}}. Vérifie l'adresse — Moonraker écoute sur le port 7125, sauf avis contraire.",
    de: "Unter {{ip}} hat niemand geantwortet. Prüf die Adresse — Moonraker lauscht standardmäßig auf Port 7125.",
    es: "Nadie respondió en {{ip}}. Revisa la dirección: Moonraker escucha en el puerto 7125 salvo que digas lo contrario.",
    it: "Nessuno ha risposto a {{ip}}. Controlla l'indirizzo: Moonraker ascolta sulla porta 7125, salvo diversa indicazione.",
    zh: "{{ip}} 没有回应。请检查地址 —— Moonraker 默认监听 7125 端口。",
    pt: "Ninguém respondeu em {{ip}}. Confira o endereço — o Moonraker escuta na porta 7125, salvo indicação contrária.",
    "pt-pt": "Ninguém respondeu em {{ip}}. Verifica o endereço — o Moonraker escuta na porta 7125, salvo indicação em contrário.",
    pl: "Pod {{ip}} nikt nie odpowiedział. Sprawdź adres — Moonraker domyślnie słucha na porcie 7125.",
    ru: "По адресу {{ip}} никто не ответил. Проверь адрес — Moonraker по умолчанию слушает порт 7125.",
    nl: "Niemand antwoordde op {{ip}}. Check het adres — Moonraker luistert standaard op poort 7125.",
  },
  printerHintKlipperIP: {
    en: "The address you type to open Mainsail or Fluidd. Add :port if Moonraker isn't on 7125.",
    fr: "L'adresse que tu tapes pour ouvrir Mainsail ou Fluidd. Ajoute :port si Moonraker n'est pas sur 7125.",
    de: "Die Adresse, mit der du Mainsail oder Fluidd öffnest. Häng :Port an, wenn Moonraker nicht auf 7125 läuft.",
    es: "La dirección que escribes para abrir Mainsail o Fluidd. Añade :puerto si Moonraker no está en el 7125.",
    it: "L'indirizzo che digiti per aprire Mainsail o Fluidd. Aggiungi :porta se Moonraker non è sulla 7125.",
    zh: "就是你打开 Mainsail 或 Fluidd 时输入的地址。若 Moonraker 不在 7125 端口，请加上 :端口。",
    pt: "O endereço que você digita para abrir o Mainsail ou o Fluidd. Adicione :porta se o Moonraker não estiver na 7125.",
    "pt-pt": "O endereço que escreves para abrir o Mainsail ou o Fluidd. Junta :porta se o Moonraker não estiver na 7125.",
    pl: "Adres, który wpisujesz, żeby otworzyć Mainsail lub Fluidd. Dopisz :port, jeśli Moonraker nie siedzi na 7125.",
    ru: "Адрес, по которому ты открываешь Mainsail или Fluidd. Допиши :порт, если Moonraker не на 7125.",
    nl: "Het adres waarmee je Mainsail of Fluidd opent. Zet er :poort achter als Moonraker niet op 7125 zit.",
  },
  printerLblKlipperApiKey: {
    en: "API key", fr: "Clé API", de: "API-Schlüssel", es: "Clave API", it: "Chiave API", zh: "API 密钥",
    pt: "Chave de API", "pt-pt": "Chave de API", pl: "Klucz API", ru: "API-ключ", nl: "API-sleutel",
  },
  printerHintKlipperApiKey: {
    en: "Only if Moonraker asks for one (most home setups don't). Mainsail: Settings → General → API key.",
    fr: "Seulement si Moonraker en réclame une (la plupart des installs maison, non). Mainsail : Réglages → Général → Clé API.",
    de: "Nur wenn Moonraker danach fragt (die meisten Heim-Setups nicht). Mainsail: Einstellungen → Allgemein → API-Schlüssel.",
    es: "Solo si Moonraker la pide (la mayoría de instalaciones caseras no). Mainsail: Ajustes → General → Clave API.",
    it: "Solo se Moonraker la chiede (quasi nessuna installazione di casa lo fa). Mainsail: Impostazioni → Generale → Chiave API.",
    zh: "仅当 Moonraker 要求时填写（大多数家用环境不需要）。Mainsail：设置 → 常规 → API 密钥。",
    pt: "Só se o Moonraker pedir (a maioria das instalações caseiras não pede). Mainsail: Configurações → Geral → Chave de API.",
    "pt-pt": "Só se o Moonraker a pedir (a maioria das instalações caseiras não pede). Mainsail: Definições → Geral → Chave de API.",
    pl: "Tylko jeśli Moonraker o nią prosi (większość domowych instalacji nie). Mainsail: Ustawienia → Ogólne → Klucz API.",
    ru: "Только если Moonraker его просит (дома обычно нет). Mainsail: Настройки → Общие → API-ключ.",
    nl: "Alleen als Moonraker erom vraagt (de meeste thuisinstallaties niet). Mainsail: Instellingen → Algemeen → API-sleutel.",
  },
  printerHelperKlipperTitle: {
    en: "Before you start", fr: "Avant de commencer", de: "Bevor du loslegst", es: "Antes de empezar",
    it: "Prima di iniziare", zh: "开始之前", pt: "Antes de começar", "pt-pt": "Antes de começar",
    pl: "Zanim zaczniesz", ru: "Перед началом", nl: "Voordat je begint",
  },
  printerHelperKlipperBullets: {
    en: ["Works with any printer running Klipper + Moonraker — if Mainsail or Fluidd opens, you're good.",
         "Same network as this computer. Moonraker answers on port 7125.",
         "Happy Hare and AFC filament changers show up on their own.",
         "Still in beta: tell us what your machine does that we don't."],
    fr: ["Marche avec toute imprimante sous Klipper + Moonraker — si Mainsail ou Fluidd s'ouvre, c'est bon.",
         "Même réseau que cet ordinateur. Moonraker répond sur le port 7125.",
         "Les changeurs de filament Happy Hare et AFC apparaissent tout seuls.",
         "Encore en bêta : dis-nous ce que ta machine fait et qu'on ne voit pas."],
    de: ["Läuft mit jedem Drucker mit Klipper + Moonraker — wenn Mainsail oder Fluidd aufgeht, passt alles.",
         "Gleiches Netzwerk wie dieser Computer. Moonraker antwortet auf Port 7125.",
         "Happy-Hare- und AFC-Filamentwechsler tauchen von selbst auf.",
         "Noch Beta: Sag uns, was deine Maschine kann und wir noch nicht sehen."],
    es: ["Funciona con cualquier impresora con Klipper + Moonraker: si abre Mainsail o Fluidd, vas bien.",
         "Misma red que este ordenador. Moonraker responde en el puerto 7125.",
         "Los cambiadores de filamento Happy Hare y AFC aparecen solos.",
         "Aún en beta: cuéntanos qué hace tu máquina que nosotros no vemos."],
    it: ["Funziona con qualsiasi stampante con Klipper + Moonraker: se Mainsail o Fluidd si apre, ci siamo.",
         "Stessa rete di questo computer. Moonraker risponde sulla porta 7125.",
         "I cambia-filamento Happy Hare e AFC compaiono da soli.",
         "Ancora in beta: dicci cosa fa la tua macchina che noi non vediamo."],
    zh: ["适用于任何运行 Klipper + Moonraker 的打印机 —— 能打开 Mainsail 或 Fluidd 就行。",
         "与这台电脑在同一网络。Moonraker 在 7125 端口应答。",
         "Happy Hare 和 AFC 换料器会自动出现。",
         "仍在测试中：告诉我们你的机器有什么功能我们还没显示。"],
    pt: ["Funciona com qualquer impressora com Klipper + Moonraker — se o Mainsail ou o Fluidd abre, está certo.",
         "Mesma rede deste computador. O Moonraker responde na porta 7125.",
         "Trocadores de filamento Happy Hare e AFC aparecem sozinhos.",
         "Ainda em beta: conte pra gente o que sua máquina faz e a gente não mostra."],
    "pt-pt": ["Funciona com qualquer impressora com Klipper + Moonraker — se o Mainsail ou o Fluidd abre, está feito.",
              "Mesma rede deste computador. O Moonraker responde na porta 7125.",
              "Os trocadores de filamento Happy Hare e AFC aparecem sozinhos.",
              "Ainda em beta: diz-nos o que a tua máquina faz e nós não mostramos."],
    pl: ["Działa z każdą drukarką na Klipper + Moonraker — jeśli otwiera się Mainsail albo Fluidd, jest dobrze.",
         "Ta sama sieć co ten komputer. Moonraker odpowiada na porcie 7125.",
         "Zmieniacze filamentu Happy Hare i AFC pojawią się same.",
         "Wciąż beta: powiedz nam, co robi twoja maszyna, a czego nie widzimy."],
    ru: ["Работает с любым принтером на Klipper + Moonraker — открывается Mainsail или Fluidd, значит всё ок.",
         "Та же сеть, что и у этого компьютера. Moonraker отвечает на порту 7125.",
         "Сменщики филамента Happy Hare и AFC появятся сами.",
         "Пока бета: расскажи, что умеет твоя машина, а мы не показываем."],
    nl: ["Werkt met elke printer met Klipper + Moonraker — opent Mainsail of Fluidd, dan zit je goed.",
         "Zelfde netwerk als deze computer. Moonraker antwoordt op poort 7125.",
         "Happy Hare- en AFC-filamentwisselaars verschijnen vanzelf.",
         "Nog in bèta: vertel ons wat jouw machine doet dat wij niet zien."],
  },
  klipperErrAuth: {
    en: "Moonraker wants an API key — add it in this printer's settings.",
    fr: "Moonraker réclame une clé API — ajoute-la dans les réglages de cette imprimante.",
    de: "Moonraker will einen API-Schlüssel — trag ihn in den Einstellungen dieses Druckers ein.",
    es: "Moonraker pide una clave API: añádela en los ajustes de esta impresora.",
    it: "Moonraker vuole una chiave API: aggiungila nelle impostazioni di questa stampante.",
    zh: "Moonraker 需要 API 密钥 —— 请在此打印机的设置中添加。",
    pt: "O Moonraker quer uma chave de API — adicione nas configurações desta impressora.",
    "pt-pt": "O Moonraker quer uma chave de API — junta-a nas definições desta impressora.",
    pl: "Moonraker chce klucza API — dodaj go w ustawieniach tej drukarki.",
    ru: "Moonraker хочет API-ключ — добавь его в настройках этого принтера.",
    nl: "Moonraker wil een API-sleutel — zet hem in de instellingen van deze printer.",
  },
  klipperErrKlippy: {
    en: "Moonraker is up, Klipper isn't ready yet: {{msg}}",
    fr: "Moonraker répond, Klipper n'est pas encore prêt : {{msg}}",
    de: "Moonraker läuft, Klipper ist noch nicht bereit: {{msg}}",
    es: "Moonraker responde, Klipper aún no está listo: {{msg}}",
    it: "Moonraker risponde, Klipper non è ancora pronto: {{msg}}",
    zh: "Moonraker 已在线，Klipper 尚未就绪：{{msg}}",
    pt: "O Moonraker responde, o Klipper ainda não está pronto: {{msg}}",
    "pt-pt": "O Moonraker responde, o Klipper ainda não está pronto: {{msg}}",
    pl: "Moonraker działa, Klipper jeszcze nie gotowy: {{msg}}",
    ru: "Moonraker на связи, Klipper ещё не готов: {{msg}}",
    nl: "Moonraker draait, Klipper is nog niet klaar: {{msg}}",
  },
  klipperErrCommand: {
    en: "The printer didn't take that one. Try again in a moment.",
    fr: "L'imprimante n'a pas voulu de celle-là. Réessaie dans un instant.",
    de: "Der Drucker wollte das nicht. Versuch's gleich nochmal.",
    es: "La impresora no aceptó esa. Prueba otra vez en un momento.",
    it: "La stampante non l'ha presa. Riprova tra un attimo.",
    zh: "打印机没接受这条指令，稍后再试。",
    pt: "A impressora não aceitou essa. Tente de novo daqui a pouco.",
    "pt-pt": "A impressora não aceitou essa. Tenta outra vez daqui a pouco.",
    pl: "Drukarka tego nie przyjęła. Spróbuj za chwilę.",
    ru: "Принтер это не принял. Попробуй чуть позже.",
    nl: "De printer pikte die niet. Probeer het zo nog eens.",
  },
};

registerPrinterPlugin({
  id: BRAND,
  meta, schema, helper,
  css: new URL('klipper.css', HERE).href,
  models: new URL('models.json', HERE).href,
  logo: true,
  renderLogo: renderKlipperLogo,
  i18n,
  // ARP MAC only (a Pi has no printer serial worth matching); see identity.js.
  identity: { field: "macAddress", fromDiscovery: () => null, probe: async () => null },

  // Lifecycle — called generically by the host.
  key: klipperKey,
  getConn: klipperGetConn,
  isOnline: klipperIsOnline,
  connect: p => { if (p?.ip) klipperConnect(p); },
  disconnect: p => klipperDisconnect(typeof p === "string" ? p : klipperKey(p)),
  reconnect: p => { klipperDisconnect(klipperKey(p)); if (p?.ip) klipperConnect(p); },
  ping: p => { if (p?.ip) klipperPing(p); },
  stopAll: () => { klipperDisconnectAll(); klipperCamStopAll(); },
  status: p => klipperGetConn(p)?.status ?? null,
  job,

  // UI — the host gives the live block the id `klipperLive`, the log `klipperLog`.
  renderLive: p => renderLiveInner(p),
  wireLive,
  renderLog: p => renderLogInner(p),
  logCount: p => klipperGetConn(p)?.log?.length || 0,
  renderOnlineBadge,
  renderCamBanner: (p, wall) => (wall ? renderKlipperCamWallBanner(p) : renderKlipperCamBanner(p)),
  hasCamera: klipperHasCamera,
  openAddFlow: openKlipperAddFlow,

  // Registry hooks shared with the hand-wired brands.
  controlJob: (p, a) => klipperJobControl(p, a === "stop" ? "stop" : a === "resume" ? "resume" : "pause"),
  getTempHtml: p => renderKlipperTempCard(klipperGetConn(p)),
  getSlots, getUnits,
  writeSlot: klipperWriteSlot,
  renderJobCard: renderKlipperJobCard,
  renderTempCard: renderKlipperTempCard,
  renderFilamentCard: renderKlipperFilamentCard,
  renderSettingsWidget: schemaWidget(schema),
});
