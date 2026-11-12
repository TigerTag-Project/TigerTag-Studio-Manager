# Worklog — v2.56.0

## Added
- **Scan a TigerQR label with the computer's camera**: a QR-code button (`icon-qr`) in the search bar opens a window with the live picture and an aiming frame; the spool (or product) shown opens like a pasted link (`_qrLinkOpen`, reader `camera` in `qr_read`). Decoding by the browser's `BarcodeDetector` where it reads QR codes (macOS), else jsQR 1.4.0 (Apache-2.0, vendored in `renderer/lib/jsqr/`, loaded on first use); the camera stops when the window closes. New `renderer/qr-scan.js`, button `#searchQrScan` (`renderer/inventory.html`), `.inv-search-scan` / `.qr-scan-win` (`renderer/css/70-detail-misc.css`). Packaged macOS app: camera entitlement (`build/entitlements.mac.plist`) and `NSCameraUsageDescription` (`package.json` `build.mac.extendInfo`). `THIRD_PARTY_LICENSES.md`, `CLAUDE.md` file map. i18n keys `qrScanBtn`, `qrScanTitle`, `qrScanHint`, `qrScanDenied`, `qrScanNoCamera`, `qrScanNotOurs` (11 locales). Checked: both decoders read a real TigerQR label; the live camera is not tested (it needs a camera prompt on the founder's machine).
- **Golden references for the hosted connector's support and label tools.** Generated from Studio's own
  modules; `--check` fails on drift:
  - `docs/mcp-golden/support.json` (`scripts/mcp-golden-support.mjs`): `renderer/ai/support-tools.js`
    run on a fixed wiki index and request rows, 18 cases. It also holds the `online` texts: no request
    is sent online; `how_to_send` / `how_to_reply` give the steps in Tiger Studio).
  - `docs/mcp-golden/labels.json` (`scripts/mcp-golden-labels.mjs`): 150 `buildLabel` SVG hashes and
    4 `qrSvg` codes. The Hub's `lib/labels/build.ts` gives the same 150.
  - Docs: `docs/mcp-golden/README.md` §8, `docs/MCP.md` §5 and §9 item 3, `docs/MCP-HOSTED-WRITES.md`
    §"Support and labels". Live in Hub v1.75.0 (181/181 checks pass).
- **A new spool gets the empty spool its product is sold on.** `product/get` now names it by number
  (`id_container`, 1-65535; null = none); `_productContainerFields` (`renderer/inventory.js`) finds
  that number in the container list and sets `container_id` + `container_weight` (the account's
  weight correction applied). Applied by `_catalogDocFromApi` (catalogue / QR link / MCP
  `create_spools`), by `_writeChipDoc` on a fresh chip doc only (new or rewritten chip, never a
  rescan), and by `_convertToPlus` only on a spool with no container. A container the user chose is
  never replaced. `data/container_spool/spools_filament.json` carries each entry's `id_container`
  (copied from TigerTag-RFID-Guide `database/id_container.json`, same 57 ids). Live data: the 552
  Rosa3D filaments → `rosa3d_masterspool_white` (250 g).

## Changed
- **AI assistant: a request it prepares opens Studio's own request card (issue #238).**
  - Before, `open_ticket` and `reply_ticket` showed their own window, with no way to add a screenshot.
    Now `open_ticket` opens the *Improvements & suggestions* card filled with the topic, product,
    title and description, and the "public" box unticked. There the user adds screenshots (the
    capture button hides the card), annotates or blurs them, attaches files or a printer's data JSON,
    and sends it, or not.
  - `reply_ticket` opens the request's conversation with the reply in its box. The assistant takes no
    screenshot.
  - `openReport()` takes `{ title, body, onSent }` and `{ thread, reply, onSent }` (`renderer/report/index.js`).
  - `onSent` fires only on a real send: the draft becomes `sent` in `pending_drafts`, and the request
    or reply is journaled.
  - Removed: the tools' own window (`confirmWindow`, `.ai-ticket-*` in `renderer/ai/ai.css`) and the
    unused `reportSubmit` / `reportMeta` exports.
  - Tool descriptions, `docs/MCP.md` §5 and `FEATURES.md` are updated. Online is unchanged: the hosted
    connector sends nothing.
- **The empty-spool (container) list is read from the server** (founder, 2026-11-11): `CONTAINERS_FROM_SERVER` on, so a container added in the Manager reaches Studio without a new version, merged over the bundled list, fetched at most once a day (`renderer/inventory.js`). New `CONTAINERS_PRIMARY` picks the source read first — `"github"` (the TigerTag-RFID-Guide mirror) today, `"api"` (Xano `container/get/all` through main.js `containers:fetch`) once the API is validated — the other is the fallback; both serve the same 57 entries with `id_container`, checked in the app. With it, the automatic container of a catalogue product (`_productContainerFields`, `product/get` `id_container`) knows the containers added since the build.
- **AI assistant: clearer names for the two ways to plug in** (founder: the titles were unclear to a newcomer) — *Anywhere, online* ("the most flexible: in your browser or on your phone, even with Studio closed", with the app's existing "Recommended" pill, `.pba-brand-badge` + `recommendedBadge`, on the welcome) and *With Tiger Studio open* ("shows you around Studio and watches your printers live"); the long subtitles in the setup and Access and security say what each cannot do (online: no printers, no guide mode); tile tags "Online" / "With Studio", chip "With Tiger Studio · …"; an online change without a client name now shows "Online" in the history. `welcomeMain` in `renderer/ai/assistant.js`, `.aip-works-head b:has(.pba-brand-badge)` in `renderer/ai/ai.css`. Checked in the app with dev-drive.
  - *With Tiger Studio open* now carries a **More powerful** pill: the same `.pba-brand-badge` as
    Recommended, key `aiBadgeMorePowerful`.
  - A line under *Pick my assistant* (`aiUseBoth`, `.aip-works-both`) says both ways can be used at once,
    with as many assistants as wanted, the same or different ones (`renderer/ai/assistant.js`
    `welcomeMain`, `renderer/ai/ai.css`).
  - **Compare the two** opens a notice window (`openDialog`, `openCompare()` / `compareTable()` /
    `COMPARE` in `renderer/ai/assistant.js`, `.ai-cmp-win` in `renderer/ai/ai.css`), titled
    *Online or Local?*. Its robot is out of the tile: bare, bigger, in the window's text colour. It shows
    the product view's table (`.pv-table`) with three columns: *Anywhere, online* and *With Tiger Studio
    open*, ✓ or — on 9 rows, and *Both*, all ✓, set apart in the accent colour. The "use both" line comes
    after the table. It
    only claims what each server does today (hosted v1.75.0):
    - both: stock answers, changes with undo, wiki and requests read, labels;
    - Studio only: writing a request, printing labels, guide mode, live printers;
    - online only: works with Studio closed.
  - The ticks are green and bold, matching the Hub's table: a new `icon-check-bold` icon
    (`assets/svg/icons/icon_check_bold.svg`, `renderer/css/70-detail-misc.css`) in `--success-text`,
    20 px and 24 px in *Both*. The "no" dash is heavier.
  - The link and both pills open that window. The Recommended and More powerful pills are buttons
    (`.aip-cmp-pill`: pointer, hover, focus ring, `aria-label`).
  - The history card has no visible scrollbar (`.ai-hist-body` `scrollbar-width: none`), and its
    subtitle `aiHistorySub` now says "on this computer and online, over 30 days".
- **AI assistant: online comes first** (founder, 2026-11-11: online works anywhere, Studio closed included) — *On the web or my phone* now comes before *On this computer* on the welcome page (groups and their tiles), "Plug in another assistant", the setup card (the Assistant tiles, the Where cards), the dashboard's status chips and Access and security; a new setup starts on Claude online (`newFlow`), the demo's phone view button comes first (the phone view was already the default). `CLIENTS` reordered in `renderer/ai/assistant.js`. Docs: `docs/MCP.md` (setup), `FEATURES.md`. Checked in the app with dev-drive (welcome, dashboard, setup on Claude online), no access setting touched.
- **Label card: the nine formats sit three per row** (three rows instead of five) to save room: `.lbl-tpls` `repeat(3, 1fr)` in `renderer/labels/labels.css`.

## Fixed
- **No more "[DB] Failed to update containers: Unknown dataset key" at launch**: the server's update list now names `containers`, which Studio reads itself (GitHub mirror, `_containersLoad`), not through the dataset service; `updateIfNeeded` skips keys it has no dataset for (`services/tigertagDbService.js`).
- **Camera QR scan: a camera that sends no picture says so** instead of staying black: after 4 s without a frame the window shows "The camera sends no picture. Check that Tiger Studio is allowed to use it…" (`renderer/qr-scan.js`, `play()` no longer awaited since it never settles without frames). Seen in the dev app started from another app: macOS gives the camera to the app that launched it. i18n key `qrScanNoPicture` (11 locales).
- **Camera QR scan: a scanner look and a beep**: the window's icon loses its tile and is drawn white; the plain orange frame becomes a scanner overlay: four glowing orange corner brackets, a dot grid and a laser sweeping the target (the rest dimmed), with a "Scanning…" pill and its pulsing dot over the picture's top right corner. On a read the brackets snap in and turn green, the pill says "Found!", a two-tone beep plays like the Tiger POD's (`_playTones`, synthesised, via the new `onFound` callback), then the spool opens 0.65 s later (0.15 s with reduced motion, which also stops the laser and the pulse). `renderer/qr-scan.js`, `renderer/inventory.js` (`#searchQrScan` handler), `.qr-scan-win .qrs-*` in `renderer/css/70-detail-misc.css`. A QR code that is not a TigerTag link turns the brackets, laser, pill and message red (`--danger`) for 1 s (`WRONG_MS`), then scanning resumes; the old one-time warning is gone. i18n keys `qrScanScanning`, `qrScanFound` (11 locales). Checked in a page loading the app's CSS (scanning, found and wrong states, laser moving); not checked with the live camera, the founder's own instance held the app.
- **Add from QR code** in the add chooser (search bar "+", new-chip card): a sixth tile under "Add from the catalogue" opens a QR view in the card's pane, the same scanner as the camera window (`mountQrScanner`, split out of `openQrCameraScan` in `renderer/qr-scan.js`). A read product link switches the card to the catalogue view (`chooseChipView`, `renderer/rfid_protocol/linked/index.js`) with that product selected and its product card open, so "+ Inventory" adds it and any waiting maker chips are linked, as with a manual pick. Someone else's spool → its product (its `.json`); a spool of this inventory just opens; nothing to add → toast, scanning resumes 1.5 s later. `#qrScanPanel` (`renderer/inventory.html`), `openQrScanPanel` / `closeQrScanPanel` / `_qrAddFound` and `_resolveLinkedProduct` (split out of `_openLinkedProduct`) in `renderer/inventory.js`, pane rules in `linked.css`, `.qrs-side` in `70-detail-misc.css`. i18n keys `linkedChipAddQr`, `linkedChipQrTip` (11 locales). Checked in the dev app: the tile, the QR view in the pane, and a simulated product read (stubbed `BarcodeDetector`) switching to the catalogue with the product card open; closing the card closes everything, no console error. The live camera read is the founder's to try (an app started by another app gets no frames).
- **One QR side card for both entry points**: the search bar's scan button no longer opens a dialog; it opens `#qrScanPanel` on its own at the right edge (mode "find": what is read opens like a pasted link, then the card closes), the add chooser shows the same card in its pane (mode "add"). A second tap on the button closes it; Escape and the other side cards close it too; with the chooser open, the button switches it to its QR view. `openQrCameraScan` (the dialog) is gone from `renderer/qr-scan.js`, `.qr-scan-win .dlg-ico` rules replaced by `#qrScanPanel` (420 px) in `70-detail-misc.css`; `openQrScanPanel(mode)` / `closeQrScanPanel` in `renderer/inventory.js` (mode kept in `#qrScanPanel[data-mode]`). Checked in the dev app: the button opens the card alone (420 px, no dialog), a second tap and Escape close it, with the chooser open it switches the chooser to its QR view, closing the chooser hands the card back; no console error. Its header carries the QR icon (`icon-qr`, `.qrs-title`) beside the title, with the hint as the header's `pba-sub` (as the catalogue card), and on its own it has the orange » close tab (`#qrScanCloseTab`, placed by `_syncPanels`, hidden while the add chooser is up). On its own it gives way to any other side card: a `MutationObserver` on every `.detail-panel` (`_qrWatchOthers`, only in "find" mode) closes it and stops the camera as soon as another one opens (checked in the dev app with the notifications card).
- **AI comparison window: the ticks are green** (the window's icon colour turned them white): `.ai-cmp-win .aip-cmp-table .aip-cmp-yes` uses `--game-ok-text` (`renderer/ai/ai.css`).
- **AI support tools name the button as it is now**: *Improvements & suggestions* instead of
  *Bug or idea?*. This covers the `SQUAD_REQUIRED` tool error (`renderer/ai/support-tools.js`), the
  undo refusal of a request (`renderer/inventory.js`) and `docs/MCP.md`.

- **A QR link with a broken %-escape no longer throws** (`parseQrLink`, `renderer/qr-link.js`, e.g. `qr.tigertag.io/%E0%A4%A`): it reads as a label from a newer version, like the Hub's `qr-check` and the mobile port (found by TigerTag RFID Connect's 64-input comparison).
- **No more "Object has been destroyed" error when quitting with a USB scale plugged in** (issue #240, PR #241 by Ptitlouis6012): `_scaleBroadcast` sends only to a live window; `_scaleShutdown()` on `will-quit` closes the HID handle, stops the poll and watchdog timers and blocks any reopening (`_scaleStopped`), in `main.js`. Checked on macOS with a Dymo M25: three launches and quits, the scale seen each time, no error.

## Removed

## i18n
- Reworded `aiWhereWeb`, `aiGroupWebSub`, `aiWhereWebSub`, `aiWhereLocal`, `aiGroupLocalSub`, `aiWhereLocalSub`, `aiTileWeb`, `aiTileLocal`, `aiStatusLocal` (the two ways to plug in an assistant), 11 locales.
- Removed `aiTicketKicker`, `aiTicketTitle`, `aiTicketCleaned`, `aiTicketCancel`, `aiTicketClosed`, `aiTicketSent`, `aiReplyTitle`, `aiReplyOn`, `aiReplySend`, `aiReplySent` (the old request window), 11 locales.
- New `aiBadgeMorePowerful`, `aiUseBoth`, `aiCmpOpen`, `aiCmpTitle`, `aiCmpBoth`, `aiCmpClosed`, `aiCmpStock`, `aiCmpWrite`, `aiCmpWiki`, `aiCmpTicket`, `aiCmpLabels`, `aiCmpPrint`, `aiCmpGuide`, `aiCmpPrinters`, `aiCmpYes`, `aiCmpNo`; reworded `aiHistorySub`, 11 locales.
- `aiNoneHint` reworded web-first (Claude in the browser, on the phone or as a computer app), 11 locales.
