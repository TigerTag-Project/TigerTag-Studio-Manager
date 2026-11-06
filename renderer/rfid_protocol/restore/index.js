/**
 * rfid_protocol/restore — the "Restore TigerTag+" card (#chipRestorePanel), a
 * choice of the new-chip card (rfid_protocol/linked), shown in its pane like the
 * NFC tools (rfid_protocol/eraser).
 *
 * A TigerTag+ keeps a backup of its pages in rfidList/{UID}.backup (stored at
 * its first scan). Each reader's chip is looked up there; the card shows the
 * reader plates and, for each chip that has a backup, what will be written back
 * (decoded by the SDK in main, `rfid:decode-backup`). Held 1.5 s, the banner
 * writes every backup back onto its chip, verified (`rfid:repair`).
 *
 * While it is open a chip placed on the TigerPOD opens nothing: the scan routing
 * in inventory.js hands it here (chipRestoreOpen()).
 *
 *   initChipRestore(ctx)          — t, esc, state, chipBackup, restoreChip, describeChip, chipBanner, wireChipBanner, …
 *   openChipRestore() / closeChipRestore() / chipRestoreOpen()
 *   restoreCardPresent(readerName, uid)   — a chip placed / taken off
 *   restoreReadersChanged()               — a reader plugged / unplugged
 */

let ctx = null;
let busy = false;
// readerName → { uid, kind, hex, info, result }
//   kind: reading | ready | nobackup
//   result: undefined | "writing" | "done" | "already" | "fail"
const slots = new Map();

const $ = id => document.getElementById(id);
const norm = u => String(u || "").replace(/[^0-9a-f]/gi, "").toUpperCase();

export function initChipRestore(c) {
  ctx = c;
  $("chipRestoreClose")?.addEventListener("click", closeChipRestore);
}

export function chipRestoreOpen() { return !!$("chipRestorePanel")?.classList.contains("open"); }

export function openChipRestore() {
  if (!window.electronAPI?.repairRfidTag) return;
  slots.clear();
  busy = false;
  $("chipRestorePanel")?.classList.add("open");
  renderActions();
  for (const [readerName, card] of ctx.state.nfcCardPresent) probe(readerName, card.uid);
  render();
  ctx.syncPanels?.();
}

export function closeChipRestore() {
  if (!chipRestoreOpen()) return;
  ctx.hideTip?.();
  $("chipRestorePanel").classList.remove("open");
  slots.clear();
  ctx.syncPanels?.();
}

export function restoreCardPresent(readerName, uid) {
  if (!chipRestoreOpen() || slots.get(readerName)?.result === "writing") return;
  if (uid) probe(readerName, uid);
  else slots.delete(readerName);
  render();
}

export function restoreReadersChanged() {
  if (!chipRestoreOpen()) return;
  for (const name of [...slots.keys()]) if (!ctx.state.nfcReaders.has(name)) slots.delete(name);
  render();
}

// Is there a backup for this chip, and what does it hold?
async function probe(readerName, uid) {
  uid = norm(uid);
  if (slots.get(readerName)?.uid === uid) return;
  const s = { uid, kind: "reading" };
  slots.set(readerName, s);
  render();
  const hex = await ctx.chipBackup(uid).catch(() => null);
  let info = null;
  if (hex) {
    const res = await window.electronAPI.decodeChipBackup?.(uid, hex).catch(() => null);
    if (res?.ok) info = await ctx.describeChip(uid, res.raw, res.certified).catch(() => null);
  }
  if (slots.get(readerName) !== s) return;   // the chip moved meanwhile
  Object.assign(s, hex && info ? { kind: "ready", hex, info } : { kind: "nobackup" });
  render();
}

function render() {
  if (!chipRestoreOpen()) return;
  const { t, esc } = ctx;
  const readers = [...ctx.state.nfcReaders];
  // The reader plates of the NFC tools (.cem-chip): the plate's colour says the
  // state — waiting · reading / writing · ready · done · red without a backup.
  $("chipRestoreChips").innerHTML = (readers.length ? readers : ["__none__"]).map((name, i) => {
    const s = slots.get(name);
    const st = !s ? "waiting" : s.result === "fail" ? "fail" : s.result === "done" || s.result === "already" ? "ok"
      : s.kind === "reading" || s.result === "writing" ? "writing" : s.kind === "nobackup" ? "mismatch" : "ready";
    return `<div class="cer-slot">
      <div class="cem-chip cem-chip--${st}">
        ${readers.length ? `<span class="cem-chip-num">${i + 1}</span>` : ""}
        <div class="cem-chip-logo"></div>
      </div>
    </div>`;
  }).join("");

  // What each backup writes back, as a light product card (photo, names, chips).
  // The two chips of a twin spool carry the same data: one card. The UIDs, the
  // chip's fields and the raw pages written back are for Debug mode only.
  const ready = readers.map((name, i) => [i + 1, slots.get(name)]).filter(([, s]) => s?.kind === "ready");
  const sheets = new Map();   // the data → { info, chips: [[n, slot]] }
  for (const [n, s] of ready) {
    if (!sheets.has(s.info.key)) sheets.set(s.info.key, { info: s.info, chips: [] });
    sheets.get(s.info.key).chips.push([n, s]);
  }
  const debug = !!ctx.debug?.();
  const sig = JSON.stringify([debug, ...[...sheets.values()].map(x => [x.info.key, x.chips.map(([n, s]) => n + s.uid)])]);
  const data = $("chipRestoreData");
  // Rebuilt only when the cards change: a photo is not reloaded on every chip event.
  if (data._sig !== sig) {
    data._sig = sig;
    data.innerHTML = [...sheets.values()].map(({ info: f, chips }) => `<div class="crs-card">${f.html(chips.length > 1)}</div>`).join("");
    // Under the banner, so the action stays in reach.
    $("chipRestoreDebug").innerHTML = debug ? [...sheets.values()].map(({ info: f, chips }) => `
      <div class="crs-debug-sheet">
        ${chips.map(([n, s]) => `<div class="rfid-uid-row"><span class="rfid-uid-lbl">${readers.length > 1 ? n + " · " : ""}UID</span><code>${esc(s.uid)}</code></div>`).join("")}
        <dl class="rfid-fields-grid">${f.fields.map(([label, val]) =>
          `<div class="rfid-field"><dt>${esc(label)}</dt><dd>${esc(val)}</dd></div>`).join("")}</dl>
        ${chips.map(([n, s]) => `<details class="rfid-raw-block"><summary>${readers.length > 1 ? n + " · " : ""}Raw pages · ${s.hex.length / 2} bytes</summary><pre class="rfid-raw-hex">${esc(s.hex.match(/.{1,32}/g).join("\n"))}</pre></details>`).join("")}
      </div>`).join("") : "";
  }

  const list = [...slots.values()];
  const hint = $("chipRestoreHint");
  const failed = list.some(s => s.result === "fail");
  hint.textContent = readers.length === 0 ? t("encNoReader")
    : failed ? t("toolRepairFailed")
    : list.some(s => s.result === "done") ? t("toolRepairDone")
    : list.some(s => s.result === "already") ? t("toolRepairAlready")
    : !list.length ? t("chipRestoreNeedChip")
    : !ready.length && list.every(s => s.kind === "nobackup") ? t("toolRepairNoBackup")
    : "";
  hint.classList.toggle("cer-hint--fail", failed);
}

// The banner: the burn banner's look and 1.5 s hold, like the NFC tools.
function renderActions() {
  const { t } = ctx;
  const box = $("chipRestoreActions");
  if (!box) return;
  box.innerHTML = ctx.chipBanner("chipRestoreGo", t("toolRepairPlus"), t("toolRepairPlusTip"), { plus: true, holdTip: "toolRepairPlusTip" });
  const ready = () => !busy && [...slots.values()].some(s => s.kind === "ready" && s.result !== "writing");
  ctx.wireChipBanner($("chipRestoreGo"), run, ready);
  const info = box.querySelector(".tool-info");
  if (info) {
    info.addEventListener("mouseenter", () => ctx.showTip?.(info));
    info.addEventListener("mouseleave", () => ctx.hideTip?.());
  }
}

async function run() {
  if (busy) return;
  busy = true;
  const todo = [...slots].filter(([, s]) => s.kind === "ready");
  for (const [, s] of todo) s.result = "writing";
  render();
  for (const [readerName, s] of todo) {
    let res = null;
    try { res = await ctx.restoreChip({ readerName, uid: s.uid, hex: s.hex }); } catch (e) { ctx.reportError?.("chip.restore", e); }
    s.result = !res?.ok ? "fail" : res.pagesWritten === 0 ? "already" : "done";
    render();
  }
  busy = false;
}
