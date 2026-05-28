# Worklog — v1.8.5 (in progress)

## Added

- **Cloud → chip encode — guided dual-chip burn modal** — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/60-modals.css`, `main.js`, `services/nfc-process.js`, `preload.js`
  - New modal (`#cloudEncodeOverlay`) replacing the one-shot `_encodeCloud`. Flow: confirm → presence gate (Burn disabled until every connected reader holds a card; live slot status) → sequential burn with a **100 ms** inter-chip gap → per-chip RFID-chip SVG + progress bar (green=verified / red=fail) → **all-or-nothing** Firestore migration (create physical doc(s) + delete Cloud doc only after every chip verifies).
  - **Read-back verification** = the success criterion: new `rfid:burn-one` IPC writes one chip then re-reads the written pages and compares byte-for-byte (signature region implicitly excluded — never written); green only on a verified match.
  - Safety: immutable N-chip contract; presence-loss-mid-burn = failure; overwrite guard (warn + "accept overwrite" toggle when a chip is non-blank, via `readRfidNow`); anti self-twin (same UID = fail); retry restarts from zero; modal closes only on success or abort; discreet success/error beep; detected UIDs shown in debug.
  - Single chip-epoch timestamp reused for both chips (→ identical bytes → twins). Removed the now-dead `_encodeCloud`.
  - Polished, light modal UI: title is the migration itself (**TigerCloud → TigerTag** pills + arrow); chip state conveyed purely by **colour** (grey/blue/green/red) — no per-reader text; a **single global progress bar** (not one per reader, blue→green/red); slot numbers only with 2 readers; failure shake; clearly-disabled (grey) Burn; minimal copy (a one-line hint only while waiting, nothing when ready/burning).

## Changed

- **ROADMAP: "Cloud → chip encode" marked shipped (v1.8.5)** — `ROADMAP.md` (full spec retained as the implementation reference).

## Fixed

- **Physical chip "Manufactured" date wrong on burn (~2056)** — `main.js`
  - The Cloud→chip burn stamped the chip `timestamp` with Unix seconds; the SDK writes it raw and the TigerTag chip epoch is seconds-since-2000, so a compliant reader decoded the physical chip's manufacturing date ~30 years late. Now stamps chip-epoch seconds (`_nowChipTs()`). Same class of bug as the v1.8.4 Cloud-doc fix, here on the chip-write path.

## Removed

## i18n
