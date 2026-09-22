# Changelog

All notable changes to Tiger Studio Manager are documented here.
Versions follow [Semantic Versioning](https://semver.org/).

---

## v2.28.0 — 2026-09-23

### Added

- **Two new locales, contributed: Russian (#31) and Dutch (#32).** `ru.json` and `nl.json`, 1523 keys each, merged as their author's own work and wired into the language picker, the onboarding language step, the renderer's locale loader and the i18n scripts. Both were reviewed against `en.json` before merging — identical key set, no empty value, every `{{param}}` preserved, the 19 plural objects and 6 arrays kept as such — and both were run in the app before shipping. Two fixes came out of that: the Russian translation's counts use the impersonal form its author already used elsewhere (`Материалов: {{n}}`) because the app's engine has two plural forms where Russian has three, and the printer speed dropdown now sizes to its own widest option — a width tuned to the English "Standard" clipped `Сбалансированная`. `scripts/check-docs-drift.mjs` also stopped holding the locale count as a constant and COUNTS the files, which is what makes the next locale cheap — `renderer/locales/{ru,nl}.json`, `renderer/inventory.{html,js}`, `scripts/{i18n-add,check-i18n-consistency,check-docs-drift}.mjs`, `renderer/css/57-elegoo.css`, `renderer/printers/anycubic/anycubic.css`.

### Changed

- **Debug mode is every account's switch, not the admins'.** The toggle in the account modal was rendered only for `roles: "admin"`, and `state.debugEnabled` was itself `isAdmin && !!Debug`, so a normal user could never turn on the one view that makes a bug report useful — their own raw Firestore documents, the last call to the API, the per-card "copy ref" helper. The gate bought no safety: the panel reads the SIGNED-IN user's own documents and every path goes through the same Security Rules as the rest of the app; the checkbox was never what stood between a user and someone else's data. The row is always rendered now and `Debug` is read as the plain user preference it is. `roles` still gates the Admin badge, and nothing else — `renderer/inventory.js`, `CLAUDE.md`.
- **The Firebase Explorer reaches the devices, and the Realtime database.** Quick chips added for `scales`, `racks`, `lists` and `tigerspools` — the last being where a TigerSpool writes itself from firmware 1.65.0, keyed by its Wi-Fi MAC (`printers_active`, `printer_ids`, `last_used_at` beside the scale's own identity/liveness fields). Reading it is how we found the deployed rules denied that path entirely; fixed in the backend repo (`tigerspools`, plural — the rule had been written singular and matched nothing) and deployed. A **Realtime** tab joins Firestore: two services, and only the first was reachable, so a scale's command channel could not be looked at from the app at all. It is read over REST with the signed-in user's ID token, each node probed with `shallow=true` first — a branch of 25 children or fewer is then read whole, anything larger stays a list of names to drill into, so no stray click pulls a tree. Measured against the live database: its rules are per-NODE (`scales/{mac}/cmd` reads, `scales/{mac}` and `scales` do not), so the chips are built from the account's own scales and point at the readable node — `renderer/inventory.{html,js}`, `renderer/css/70-detail-misc.css`.
- **The "What's New" tooling knows about locales that arrived late.** Adding a locale to the three `whatsnew-*.mjs` scripts alone would fail the whole back-catalogue: the check demands that an item carrying ANY non-English locale carries them all, and the 507 items written before Russian and Dutch existed carry neither. A `LOCALE_SINCE` map (`{ ru: "2.28.0", nl: "2.28.0" }`) records which version a locale shipped in, and each version block is held to the locales that existed then — history stays valid, everything from this release must be complete in all 11. `whatsnew:add` scaffolds 11 locales and `whatsnew:import` recognises an entry in either new locale as hand-localised — `scripts/whatsnew-{add,check,import-changelog}.mjs`.

---

## v2.27.3 — 2026-09-18

### Changed

- **A Bambu Lab printer reached through the CLOUD is presented as read-only.** Measured on an X1C: of everything the driver publishes through the account broker, only the light answers — setpoints, jog, homing, fans, a slot's filament and the job controls are all ignored, silently, because a refused command is never reported back and the cards only ever show what the machine says. A cloud connection now renders without them: the filament slots drop the pencil and `data-bbl-fil-edit`, the temperature pills lose `snap-temp--editable` and their `data-bbl-set-temp` (a heated chamber's pill renders as the passive one), and the control card keeps the light and the fan READINGS while dropping the jog pad, the three homing buttons, disable-motors, the jog step, the speed mode, and the fans' toggle and −/+ steps. Pause / resume / stop go too, in the panel's job card and on the board card — where the choice is not the driver's alone to make, the board being brand-agnostic: it asks the registry through a new OPTIONAL `isReadOnly(printer)` that only Bambu answers, so every other brand stays controllable by omission. Layout follows: `.acu-jog-extra--alone` aligns the light column left instead of pushing it to the right edge of a jog pad that is no longer there, and the fan icon becomes a static marker (`.elg-fan-icon-btn--static`) rather than a button that looks pressable. LAN is untouched — `renderer/printers/bambulab/{cards.js,index.js,bambulab.css}`, `renderer/inventory.js`.

### Fixed

- **Bambu Lab: an AMS HT's slot was written at the wrong address.** A machine reports each AMS by its OWN id and an AMS HT is id **128**, not the next number in the row — confirmed on a reporter's X1C (two AMS v1 + an AMS HT: `ams.ams[]` = `"0"`, `"1"`, `"128"`) and on ours (one AMS reported as id **1**, plus the HT as 128). The filament card passed each unit's POSITION as `data-ams-id`, so `ams_filament_setting` went to `ams_id: 2` on the first machine — a module that does not exist — and to the REAL AMS on the second, where the single AMS is id 1 and the HT sits at index 1. The row now carries `Number(mod.id)`. The edit sheet looked the module up by array index (`ams[128]` in a 3-entry list) and so opened on defaults instead of the loaded filament; it resolves by id now. `bambuGetSlots` emitted a fixed four bays per unit while `bambuGetUnits` beside it already derived the count from the tray list — both derive it. Verified through the app's own filament card: the HT slot carries `ams_id 128`, its sheet opens on the PETG `#2850E0` actually loaded, and applying `#1CB01C` came back green from the machine with the AMS untouched; slot restored and read back identical — `renderer/printers/bambulab/{cards.js,index.js}`.
- **The Bambu filament sheet never pre-filled a slot's colour, on any model.** `_parseColor` already returns `"#RRGGBB"` and the sheet prefixed a second `#`, producing `"##2850E"` — an invalid colour that the OS picker silently reads as black and that paints no swatch. Whatever the slot held, the sheet showed grey and opened the picker on black, so applying without touching the colour wrote BLACK onto the slot. The hex is normalised (strip `#`, keep six hex digits, fall back to the default) — `renderer/printers/bambulab/index.js`.
- `PROTOCOL.md` §8.3 records the id-128 rule, the `info: "2004"` marker that distinguishes an AMS HT from an AMS v1's `"1001"`, and the `ams_exist_bits` reading (`"13"` = bits 0, 1 and 4) — `renderer/printers/bambulab/PROTOCOL.md`.

---

## v2.27.2 — 2026-09-15

### Changed

- **Erasing or recycling a chip goes through the guided chip window.** "Erase the TigerTag / TigerTag+" and "Recycle to NFC" were hold-to-confirm toolbox rows that unlocked only once the chip(s) were already on the readers, and reported progress in their own label. They are now plain toolbox buttons, usable as soon as a reader is connected, opening the window already used to burn a TigerData or update a chip: one card per reader — blue when THIS spool's chip sits on it, red when a foreign chip does — the action gated until every chip of the spool (both, for a twin pair) is present with no foreign chip in the way, then the sequence-wide progress bar while writing. The window's title is the action ("Erase the TigerTag+" / "Recycle to NFC"); its red Erase / Recycle button is held 1.5 s with the hold hint on hover — a dedicated `#cemReset` wired through `setupHoldToConfirm`, since Burn and Update stay plain clicks. Implemented as two more modes of the update flow (`openUpdateModal(r, "format" | "recycle")`, `_cemStartUpdate` routing to `formatRfidTag` / `eraseRfidTag`) rather than a third copy of the UID gating. On a verified write the Xano events fire per verified chip (`reset` / `nfc_init`, unchanged) and the spool is removed from the inventory as before; a failure keeps the window open on Retry — `renderer/inventory.{html,js}`, `renderer/css/60-modals.css`.
  - **Every chip window (burn, update, erase, recycle) keeps its size.** A message (wrong chip, failure, same chip twice, no reader) now REPLACES the "Hold the NFC tags in front of the readers" instruction in red instead of being added on a line of its own; the progress bar is always on screen, empty until a chip is written; the button row gives way to it with `visibility: hidden` rather than `display: none`. The wrong-chip message speaks of the material, not the spool, and the chip cards no longer print the UID debug mode used to show.
- **Red hold-to-confirm buttons say they must be held.** People clicked Delete, saw nothing happen and gave up before the 1.5 s hold completed. `setupHoldToConfirm(btn, ms, cb, { hint: true })` stores only the duration (`data-hold-ms`) and writes "Hold N s to confirm" when the shared `#toolInfoPop` bubble shows, so the text cannot announce a different hold than the one enforced and follows a language change. Applied to every red hold: bulk and spool Delete, delete a list, stop tracking a reorder product, remove a product from a list, stop a print, delete a printer (menu + form), delete a rack (menu + form), and the chip window's Erase / Recycle. In the context menus it is keyed on `rp-menu-item--danger`, so the non-red "Empty the rack" is unchanged; the amber `danger-soft` holds do not show it. The native `title` tooltips that explained the hold on the rack and printer Delete buttons (the rack's hard-coded in English) are removed, since two bubbles would stack. The spool toolbox's "Remove from inventory" is renamed **Delete** (`spoolMarkDeleted` aligned on `bulkDelete`) and shares one CSS rule with the selection bar's Delete — solid red, dark hold sweep — `renderer/inventory.{html,js}`, `renderer/css/70-detail-misc.css`.
- **Duplicating spools: a dropdown instead of a stepper.** The `− N +` stepper meant thirty clicks for thirty spools. `#dupQtySel` offers 1–9, then **10+** swaps in a free field (`#dupQtyFree`). Both stop at `DUP_MAX = 50`, the ceiling `duplicateSpoolAsCloud` already enforced but the UI could not state — now one named constant for both. The free field corrects as you type, and leaves an empty field alone mid-edit. The ⓘ tip names a TigerData instead of "a copy in the cloud". Requested in #26 — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`, `renderer/locales/*.json`.

### Fixed

- **Creality: the nozzle temperatures set on a filament slot never reached the printer.** The firmware keeps `minTemp` / `maxTemp` from `modifyMaterial` ONLY when the JSON number carries a decimal point and drops an integer silently, still answering without error. The frame was built with `JSON.stringify`, which can never write `190.0` — in JavaScript it is the same Number as `190` — so every temperature was stored as 0 (the mobile app was unaffected: Dart serialises a double as `190.0`). `buildModifyMaterialFrame` (new pure module `material-frame.js`) swaps the three float fields for placeholders, stringifies, then writes them back as decimal literals; escaping of every other field stays JSON.stringify's. Measured on an Ender-3 V4 + CFS, slot 1D, read back with `get boxsInfo`: new frame `211.0 / 236.0` → 211 / 236; the old serialisation → 0 / 0.
  - **The material a slot declares now matches the firmware's library.** The edit sheet sent the picked LABEL as `type` and built `name` as vendor + label, so `type` was often invalid and `name` matched no profile — `rfid` was reset to "0". `type` is now the family from the material database (`material_type` + `-filled_type`), and vendor / type / name / rfid are taken verbatim from the printer's own `retMaterials` library when a profile fits (`resolveCrealityMaterial`: by Creality id under the chosen brand, then the brand's "<vendor> <family>" profile, then the exact name under another brand); no fit sends `rfid "0"` on purpose. The library was already requested at connection and its reply never read; it is now kept on the connection. Against the Ender-3's 18-profile library, `rfid` is keepable for 11 of the picker's 23 combinations (4 before) and `type` valid for all 23 (18 before).
  - Verified through the app's own Save button with the WebSocket `send` intercepted: *Generic + PETG* → read back 220 / 270, rfid `00003`; *Creality + PLA High Speed* → `01001 · Hyper PLA`; slot restored and read back identical. `PROTOCOL.md` and `docs/creality-websocket-protocol.md` now carry the measurements and the rfid / type / pressure rules — `renderer/printers/creality/{material-frame.js,index.js,PROTOCOL.md}`, `docs/creality-websocket-protocol.md`.

### i18n

- Added `holdToConfirmTip`, `encErase`, `encRecycle`; changed `spoolMarkDeleted`, `toolDuplicateTip`, `encMismatch`; removed `toolFormatWriting`, `toolFormatDone`, `toolFormatFailed`, `toolEraseWriting`, `toolEraseDone`, `toolEraseFailed` — 9 locales.

---

## v2.27.1 — 2026-09-13

### Fixed

- **Catalogue images stopped loading permanently after using the search box.** The product-image loader caps in-flight requests at six, and the counter was only decremented from the `load` / `error` handlers. An `<img>` destroyed mid-flight fires neither, and `_catViewSearch()` wipes and rebuilds `#catalogViewBody` on every keystroke — so six images torn down that way held all six slots for the lifetime of the session: `_imgPump()` found no free slot, the queue never drained, and no image loaded again until restart. In-flight images are now tracked in a `Set` instead of a counter, and `_imgPump()` reclaims the slots of any entry no longer `isConnected` before filling. Same shape of leak would have been possible from any list that rebuilds itself; holding the elements rather than counting them removes the class, not just the instance — `renderer/inventory.js`.
- **The macOS release build could no longer sign itself.** electron-builder passes the certificate's IMPORT password to `security set-key-partition-list -k`, but that flag authenticates against the KEYCHAIN — a different secret. macOS did not previously verify it; the runner image carrying macOS 26 does, so the v2.27.0 build failed with `SecKeychainUnlock: The user name or passphrase you entered is not correct` with nothing changed on our side (same certificate, valid to 2031; same secrets, untouched since May; same electron-builder, 26.15.3 — only the image, 20260728 → 20260907). Fixed upstream in PR #10101, which is in `27.0.0-alpha.8` and in no stable release (26.15.7 and 26.16.1 both lack it). The workflow therefore builds the signing keychain itself — create, import, authorise `codesign` with the keychain's OWN generated password — and passes `CSC_KEYCHAIN` so electron-builder skips its own path; `CSC_LINK` is deliberately unset, since passing it makes electron-builder rebuild its keychain and take that path again. The step states its own removal condition — `.github/workflows/build.yml`.

---

## v2.27.0 — 2026-09-12

### Added

- **Custom tax rate.** A *Custom* entry at the foot of the account's country picker reveals a panel carrying three fields — rate, ISO 4217 currency code, symbol — each with a label and an example. The rate alone would not cover the case it exists for: a user whose country is absent from the table would keep a euro sign on every price, so the currency travels with it. Resolution goes through a sentinel code tested BEFORE the table lookup, because `_vatEntryFor()` does not find `CUSTOM` and falls back to France — an unrecognised code does not fail, it silently applies 20 %. Values are clamped and shaped at READ time rather than trusted from the document (rate to 0–100, currency to at most three letters), since `currency` also reaches the telemetry roll-up, which expects ISO 4217. Field seeding skips whichever input has focus and commits on blur, so a save never rewrites what is being typed. Stored as three flat fields on `users/{uid}` beside `vatCountry`; no rules change, that document is not field-whitelisted — `renderer/inventory.{html,js}`, `renderer/css/60-modals.css`, `renderer/locales/*.json`.
- **Canada, with CAD and a per-province rate.** All 13 provinces and territories. No province selector was built and none was needed: `_vatEntryFor()` matches `code` as an opaque string, never parsing it or assuming two letters, so `CA-QC` is as valid a key as `FR`, and the picker's existing `label · rate% · symbol` template renders `Canada (Quebec) · 14.975% · CA$` unchanged. Data-only: `vatCountry` is a free field on `users/{uid}`, and the telemetry's `country` is derived from the locale rather than from this, so a sub-national code cannot reach the roll-up that expects ISO-2. `rate` is the COMBINED rate the buyer pays — Canada has no national one, GST being federal with HST, PST, RST or QST layered per province — and a new `note` field records each rate's composition. Rates taken from the CRA rate table rather than from the request; Nova Scotia had moved 15 % → 14 % on 2025-04-01. Symbol is `CA$`, not `$`. Requested in #23 — `data/vat-rates.json`.
- **Wiki button in the sidebar's community footer**, linking to `wiki.tigersystem.io`. Driven by the shared `COMMUNITY` table, so the badge, the one-shot notification and the per-account `wikiSeen` flag come from the table entry itself rather than from new wiring. Contributed in #24 — `renderer/inventory.{html,js}`, `renderer/css/{00-base,10-settings,20-friends,70-detail-misc}.css`, `renderer/locales/*.json`.
- **Bambu Lab A2L and X2D.** Both were in the printer catalogue but reached no connection tutorial, and the X2D carried an X1C photograph. The A2L joins the A-series walkthrough, the X2D the shared X / H / P one. Both are now resolved on discovery: the `DevModel` codes `N9` (A2L) and `N6` (X2D) were unmapped, so either machine arrived as "Select Printer" with a "?" thumbnail and no camera transport selected. Codes read from Bambu Studio's own `resources/printers/<CODE>.json`, whose `display_name` and `printer_series` also confirm the tutorial grouping (`series_n` / `series_x1`) and the camera transports (A2L advertises a local liveview like an A1 → JPEG/TCP; X2D none, like a P2S → RTSP). No serial prefix is recorded for either — a prefix can only be read off real hardware, and the code is the path both discovery and the cloud take — `data/printers/bbl_printer_models.json`, `renderer/printers/bambulab/{tutorial.json,probe.js}`.

### Changed

- **The "Search" view is renamed "Catalogue"**, and the i18n key with it (`viewGroupSearch` → `viewGroupCatalog`). Every identifier around it already said catalogue — `vtgCatalog`, `catalogGrid` / `catalogTable`, `_isCatalogMode`, "From Catalogue" — only the user-facing label disagreed — `renderer/inventory.html`, `renderer/locales/*.json`.
- **Inventory search resolves a scanned code to a single spool.** `sku` and `barcode` were already in the haystack but matched by plain substring: Rosa3D's range shares the prefix `590775313`, so that scan returned 27 rows. A query that looks like a code (≥ 6 characters, contains a digit, no spaces) is now matched exactly first against SKU, barcode and UID, and only exact hits are returned. The predicate that decides "looks like a code" moved above both searches so the inventory and catalogue rules cannot drift. With no exact match the ordinary search still runs; anything under six characters (`1000`, `220`, `1.75`) is never treated as a code — `renderer/inventory.js`.
- **`searchPlaceholder` now names SKU and barcode** — both had been searchable all along with nothing to say so — `renderer/locales/*.json`.
- **A rack shelf can be four spools deep**, up from three. The ceiling lived in three places and only one was a number: the stylesheet ENUMERATED the rows, so a fourth would have been drawn flat on the others — no offset, no shadow — and silently, since an unmatched selector fails nothing. The renderer writes each row's index as `--plane` and one rule places any depth from it, reproducing the enumerated ladder because the shelf above depends on that exact scale to paint over the row below — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/30-racks.css`.
- **X1E shows an X1E** in the add form instead of an X1C; its artwork had been unused in the folder since the model was added — `data/printers/bbl_printer_models.json`.
- **Bundled TigerTag database refreshed** — 13 239 products, 65 brands. Two `id_version.json` rows were renamed upstream (`TIGER_TAG_MAKER_V1.0` → `TIGER_TAG_V1.0`, `TIGER_TAG_PRO_V1.0` → `TIGER_TAG_PLUS_V1.0`); nothing matches on those strings and the ids and signing keys are unchanged, but `docs/rfid-vendors/tigertag.md` quoted the old ones — `assets/db/tigertag/*`, `docs/rfid-vendors/tigertag.md`.

### Fixed

- **Product images: a load queue, a rendition that fits the slot, and two retries.** Three faults on one path. (a) BURST — opening the catalogue mounts ~166 cards at once and `loading="lazy"` does not throttle it: measured, 163 of 166 were fetched while 24 were on screen. Over HTTP/1.1 the six-connections-per-origin cap did this for free; the CDN speaks HTTP/2, where each request is a concurrent stream on one connection. An IntersectionObserver (600 px margin) decides when an image is wanted and a queue caps six in flight — a cap adapts where a fixed inter-request delay cannot. (b) RENDITION — the CDN serves seven square sizes (`icon` 16 px … `master` 1024 px) selected with `&size=`, and the endpoint defaults to `large`; the app took the default everywhere, spending a 512 px image on a 28 px table chip. Nine call sites now request the first rendition covering their slot at the screen's pixel density, rounding up. A grid card measures 326 device px and still legitimately asks for `large`. Only `cdn.tigertag.io/img` links are rewritten; the two detail-panel images keep `large` deliberately. (c) GIVE-UP — the three sites drawing a photo hid or removed it on the FIRST error, making a momentary failure permanent for the session; every failed URL measured here loaded on a second request in 223–636 ms. Two retries backing off 400 ms / 1400 ms, then the placeholder, on a byte-identical URL so the CDN cache still answers. `load` and `error` do not bubble, hence capture listeners, which also lets one rule replace three inline handlers; a MutationObserver adopts images wherever they appear rather than relying on five render sites to call a scan — `renderer/inventory.js`.
- **Opening the printer brand picker while a printer's side-card was open put the picker BEHIND it**, invisible, with nothing to indicate the click had registered. The two are laid out by functions unaware of each other — `_syncPrinterAddPanels()` for the picker and its choice cards, `_syncPanels()` for the printer/spool/container stack — both docking to the same right edge. The picker now closes that stack on open, edit form included, which also tears down the panel's camera rather than leaving it streaming behind another card — `renderer/inventory.js`.
- **In dark mode every community notification wore a black logo on its brand colour.** The glyph was painted with `--surface` (the card background): `#ffffff` in light, `#171a22` in dark — white by coincidence, not by intent, while the comment two lines above claimed "white logo". Now `--on-accent`, the fixed-polarity token for content sitting on a filled colour, already used by the low-stock chip below and by the sidebar buttons — which is why those were correct in both themes. Discord, GitHub, MakerWorld and Shop were all affected — `renderer/css/20-friends.css`.
- **A Bambu H2C reporting `O1C2` was not recognised.** The machine answers with either of two model codes and only one was mapped, so the same printer resolved to its catalogue entry or to "Select Printer" depending on which it sent — and unresolved means a "?" thumbnail and no camera transport — `renderer/printers/bambulab/probe.js`.
- **`wikiClickedAt` was silently rejected by the Firestore rules.** The community buttons stamp a `*ClickedAt` field on `users/{uid}/telemetry/studio`, a field-whitelisted collection where the new field was unlisted; `hasOnly()` evaluates the POST-MERGE document, so the write failed wholesale rather than dropping one field, and the client swallows the rejection. Not user-visible — the nudge's `wikiSeen` flag lives on `users/{uid}`, which is not whitelisted — but the click analytics were lost. Fixed and deployed in the backend repo's `firestore.rules`; no app-side change.

---

## v2.26.1 — 2026-08-31

### Fixed

- **A cloud Bambu printer never showed the print's preview away from home.** There was exactly one way to fetch it — implicit FTPS to the printer's own LAN address, pulling `metadata/plate_N.png` out of the active `.3mf` — which works only on the printer's network. A machine added by signing in, whose whole point is reporting from anywhere, therefore had no preview anywhere else, indefinitely rather than as a start-up delay. Cloud printers now read the account's task list (`GET /v1/user-service/my/tasks`), where each entry carries `cover`: a plain HTTPS image on Bambu's CDN needing no auth of its own. They take that route and ONLY that one — FTPS to a machine on another network does not fail fast, it hangs to its timeout, once per retry window, for nothing. The endpoint and its payload shape were taken from the maintained Home Assistant integration rather than inferred; the first endpoint tried here, lifted from our own protocol notes, was the wrong one. `hits` holds the ACCOUNT's ~20 most recent tasks rather than this machine's current one, so it is filtered by `deviceId` and then narrowed by the job's own name — already known from telemetry — falling back to the most recently started, since taking the first match would eventually show a previous print — `main.js`, `preload.js`, `renderer/printers/bambulab/index.js`.
- **A cloud printer keeps showing what it last made, and what it was called.** The preview and the job name now survive the print, on the board card and in the side panel, instead of the card reverting to a stock photo of the printer the moment the machine goes quiet. Both come from the cloud for a cloud machine — `cover` and `title` off the task list, which still hold them once telemetry has stopped naming anything. A LAN printer still loses its preview when it goes idle: the `.3mf` it was read from does not outlive the job, so keeping the image would eventually be a lie. The board card was gating on print state too and had to learn the same rule — the driver decides, the view trusts the field — `renderer/inventory.js`, `renderer/printers/bambulab/{index,cards}.js`.
- **The cloud preview blinked out and back on every redraw.** The FTPS route always handed the renderer image BYTES, so the preview field held something instant and self-contained; the cloud route handed it a CDN URL instead, and every DOM rebuild re-requested it, leaving the frame blank for the length of the round-trip — the media-reload trap the surgical-update rules warn about, arriving through the data rather than through the markup. The image is fetched once in the main process and returned as a data-URI, cached by source URL (64 entries, 4 MB ceiling), so both routes deliver the same kind of value. The fetch decision compares the SOURCE URL, not the stored value, or the decoded image would never match and every pass would fetch again. If the decode fails for any reason the raw URL is used instead: the worst case is then the flicker this set out to remove, never a blank card — `main.js`, `preload.js`, `renderer/printers/bambulab/index.js`.

---

## v2.26.0 — 2026-08-31

### Added

- **Add a Bambu Lab printer with your account** — a third way in beside scanning the network and typing an IP, and the easy one. An email address, the code Bambu sends back, and every machine on the account appears, each already carrying its own LAN access code because the cloud simply hands it over: nothing has to be read off the printer's screen. Machines added this way are reached through Bambu's cloud, so they report from anywhere rather than only from the same network. The decisive economy is that the cloud broker sends the very same `print.push_status` the LAN one does, so cloud telemetry is emitted on the SAME renderer channel and the parser, the cards, the job block, the temperatures, the AMS and every control are reused untouched; what differs is ONE client for the ACCOUNT rather than one per printer, and an account token instead of a per-machine code. REST goes through Electron's `net` rather than node or global fetch, deliberately: `api.bambulab.com` sits behind Cloudflare, which judges callers by their TLS fingerprint and answers plain HTTP clients with a 403 challenge (the reference Python implementation reaches for `cloudscraper`/`curl_cffi` for exactly this) — Electron's `net` IS Chromium's stack, so no impersonation is needed. Region is `us` first with an `eu` fallback on refusal, and `pushall` is asked for on every (re)connection because a P1 sends only deltas. Expired and wrong codes are told apart (`code: 1` vs `code: 2`), one needing a new code and the other a better one. The account session — token, uid, region — is stored ONCE under `printers/bambulab/secrets/`, never on a machine's own record: Firestore serves documents whole, so a secret sitting in a printer's record would travel with it the day printers become friend-visible. Sign-in, uid resolution and the machine list are verified end to end against a live account. Protocol reference: `renderer/printers/bambulab/PROTOCOL.md` §17 — `main.js`, `preload.js`, `renderer/printers/bambulab/{index,add-flow,probe,settings}.js`, `renderer/printers/context.js`, `renderer/inventory.js`, `renderer/css/40-printers.css`.
  - Machines are **ticked, one or several, and added together** by a single key carrying the count. Adding one per click closed the panel each time, so taking three meant signing in three times over — and the emailed code is single-use. A run where some fail says so and stays open rather than closing over a half-done job.
  - They are offered **with their picture**, laid out like a network-scan result, so an X1C is told from a P1P at a glance rather than by reading serials. A raw dump of the account's machine list sits beneath them in debug mode only, with a copy key.
  - **A cloud printer picks up its own LAN credentials, and its camera comes on by itself.** The cloud hands over the access code and the serial; the machine's own telemetry carries its address — advertised in its camera URL, or as a LITTLE-ENDIAN integer in `net.info[0].ip`, where the first byte of the address is the low byte of the number (`1846847680` → `192.168.20.110`, agreeing with the camera URL in the same payload). The address is re-checked on every report rather than adopted once, because it is a DHCP lease; on a real change the stream is torn down before it is restarted.
  - A cloud printer arrives with its **real model**, resolved from the code the cloud reports with the serial's prefix as fallback — it decides both the picture and the camera transport. `BL-P001`, what the cloud calls an X1 Carbon, was missing from the code table. A printer whose model never resolved now corrects itself from its serial on the first report.

### Changed

- **A printer reached through the cloud says so: its status dot IS a cloud.** Same colour code — green when it answers, grey when it does not — a different shape, on the board card and in the side panel, for BOTH brands that have a cloud mode (Bambu Lab and Anycubic), keyed off the `mode: "cloud"` they both already store. Nothing distinguished them before in either brand, and the two do not behave alike once you leave the house: a LAN machine simply becomes unreachable while a cloud one keeps answering, so when one goes quiet, knowing which you are looking at is what says whether anything is wrong. The glyph is drawn by a pseudo-element rather than by the dot itself — masking is applied AFTER filtering, so a glow put on a masked element (`box-shadow` or `drop-shadow` alike) is clipped away with everything outside the silhouette; left unmasked, the dot carries the halo it already had and reuses `printer-name-dot-pulse` unchanged. The icon is a new FILLED cloud (`icon_cloud_filled.svg`): masking the outline one painted only the outline, giving a hollow ring. Anycubic carried a `connLan` field whose comment claimed the card already did this; nothing read it — `renderer/inventory.js`, `renderer/css/40-printers.css`, `renderer/css/70-detail-misc.css`.
- **Add-a-product refuses a zero where a zero is not a measurement.** Weight, both nozzle temperatures, both bed temperatures and the drying pair floor at 1, corrected AS YOU TYPE rather than refused at save: a lone `0` becomes `1` on the spot. The floor is read from each field's own `min`, mirroring the ceiling already applied from `max`, so a field's bounds stay declared in one place; typing is not fought, since reaching 50 by typing `5` then `0` leaves `50`, already above the floor. Empty stays empty — the drying pair is optional and blank is how "needs no drying" is said. The save path enforces the same floor for values that never passed through the keyboard: picking a material seeds these fields, and 7 of the 113 recommend a 0 — `renderer/inventory.js`, `renderer/inventory.html`.
- The **+ beside the inventory search is a filled accent button** with a white glyph (`--primary` / `--on-accent`) instead of a grey `+` on nothing. It is the way in to adding a spool and it sits inside a field that reads as somewhere to type, so it has to look like a button — `renderer/css/70-detail-misc.css`.

### Fixed

- **A Bambu printer stopped reporting anything the moment a print FAILED** — filament, temperatures, job, all of it. `print.state` is a NUMBER on this firmware (7 on an X1C) and the state normaliser called `.toLowerCase()` on it, from the FIRST line of the merge, so the exception took the whole message down and nothing after it was ever read; the board fell back to the external spool alone. It only fires in the branch that looks for a second opinion when the printer reports FAILED or ERROR, which is why it lay dormant for months and surfaced the day a print failed. Only string candidates are considered now — `renderer/printers/bambulab/index.js`.
- **A Bambu printer's AMS was recorded as ABSENT and stayed that way across restarts.** The units a driver reports are treated as the whole truth by the layer that stores them: anything unmentioned is written `present: false` onto the machine's record. But a printer sends one complete state and then DELTAS, and a delta carries no filament — so a connection questioned before its full state arrived answered with the external spool alone and the AMS was filed as gone, in Firestore, where reloading could not undo it. Units are reported only once AMS data is held or a full state has been seen (`msg: 0`, or any payload carrying an AMS block, since some firmwares omit the field); the stored record is shown meanwhile, marked stale, and repairs itself on the next complete state — `renderer/printers/bambulab/index.js`.
- **A Bambu print showed no preview, and carried the wrong name.** The hint used to find the model was `gcode_file` — a path INSIDE the archive, `/data/Metadata/plate_1.gcode` — while the `.3mf` on the printer is named after the job (`TigerPod_Mini_A1.3mf`). The lookup searched for `plate_1.3mf`, which exists nowhere; the same value put `plate_1.gcode` on the card where Bambu's own app shows the project name. The job name comes first now, the gcode path remaining the fallback — `renderer/printers/bambulab/index.js`.
- **A cloud printer's filament slots vanished moments after connecting.** Learning its own address made the renderer read it as a different machine on the next tick — the record held no address until Firestore echoed the write back — so the session was torn down and rebuilt with empty data, repeatedly, writing to Firestore on every status push. A cloud connection is now exempt from the address check outright: it runs on the account's broker, never on an address. The address is written only when it actually differs from the record — `renderer/inventory.js`, `renderer/printers/bambulab/index.js`.
- **Resizing a camera opened — or closed — its machine's side panel.** The drag already guarded against this; the resize grip never did, so the click the release produces landed on the card. The guard goes up on the first MOVEMENT and is lowered on a timer scheduled BEFORE the write is awaited — lowered after it, a slow write would leave the guard up and swallow the next honest click — `renderer/inventory.js`.
- The shared cloud MQTT client is re-pointed at the window that asks for it: it lives in the main process and outlives a renderer reload, so it went on posting telemetry to a page that no longer existed — `main.js`.
- **`npm run i18n:add --json` was silently writing `"[object Object]"` into all nine locales.** Its JSON path coerced every value with `String(v)`, which turns a `{one, other}` plural into that literal text — no error, no warning, nine files corrupted at once. It now emits plurals as real multi-line objects, REFUSES anything that is neither a string nor a plural rather than coercing it, and replaces an existing plural as a whole block so a second run cannot orphan its remaining lines — `scripts/i18n-add.mjs`.
- **`bulkHiddenWarn` shipped broken in v2.16.0 and stayed broken for nine releases**, caught by the fix above: selecting rows and then filtering showed the literal text `[object Object]` where the warning belongs — the warning that stands between you and a destructive action aimed at items you cannot see. Restored as a proper plural in 9 locales — `renderer/locales/*.json`.

### i18n

- Added: `printerCloudMode`, `bblCloudChoice`, `bblCloudChoiceHint`, `bblCloudTitle`, `bblCloudSub`, `bblCloudEmailPh`, `bblCloudSendCode`, `bblCloudCodePh`, `bblCloudSignIn`, `bblCloudChangeEmail`, `bblCloudCodeSent`, `bblCloudErrCode`, `bblCloudErrExpired`, `bblCloudErrBlocked`, `bblCloudErrGeneric`, `bblCloudNoPrinters`, `bblCloudPick`, `bblCloudAddSelected`, `bblCloudAddFailed` — 9 locales.
- Repaired: `bulkHiddenWarn` — 9 locales.

---

## v2.25.0 — 2026-08-30

### Changed

- **The camera view is a plan, like the storage and printer boards.** Cameras are placed by hand on a surface you pan and zoom instead of flowing in a grid, and they are RESIZED FREELY by a corner grip — the ½× / 1× / 2× presets are gone, three answers to a question the user can now answer exactly. A camera's width travels with its position (`camWallPlan: {x, y, z, w}`, its own field because the printer board's camera widget already owns `camPlan` and the two are placed independently); only the width is stored, since the picture is 16:9 and the head is fixed, so one number describes the card. It has an **Arrange mode**: the storage plan's own 24 px mesh scaled by the zoom, a card's HEAD as a handle in both modes (it is the part that is not the picture, so taking hold of it can never be read as a click on the video), and arranging extends the handle to the whole card while giving the LEFT BUTTON to the rubber band — sweeping and panning both start on empty surface, so one has to yield, and arranging is precisely when you mean to pick cards rather than travel; the wheel button pans in both modes, so the view is never trapped. Its plan bar is the other plans' bar to the character — same classes, same order, same numeric field with its own `%` beside it — and its zoom is their zoom down to the arithmetic: same bounds, same round-ten ladder, the point under the cursor held still, wheel with no modifier, stray notches from a held-down wheel ignored. Dragging uses the storage plan's magnetism and its guides, the grabbed card being the one the magnetism speaks for while the rest of a group follow at their own offsets; the mesh appears the moment anything is taken or resized, in or out of Arrange, because outside it nothing else says a gesture has become an edit. A card taken in the hand comes to the FRONT and dropped last stays on top — depth is written inline by the layout, which no stylesheet rule can outrank, so the lift is done on the element and restored from the record on release. A swept selection is ringed in the accent, 2 px at the boards' offset, written as one ordered block carrying the view's id because the plain border arranging draws also carries it and silently outranked the selection at lower weight. Moving a camera no longer opens its machine's side panel: arranging suppresses it outright, and outside it the guard goes up the instant the gesture becomes a move — raised on release it was raised after the writes were awaited, and the click following a release fires long before a round-trip to Firestore resolves. Widths are applied in their own pass before any position is computed, since the free-spot search MEASURES a card to find room for it and a card not yet given its width measures whatever the stylesheet last left it. ONE RULE GOVERNS IT: a card holds a live stream, so it is never recreated, only moved — every path positions existing elements, the drag writes the element and only the release touches the record. The drag-to-reorder went with the grid it served; `camSortIndex` now only orders cameras that have never been placed, on their first render. **A placed camera keeps its place when its machine goes quiet** — same spot, same size, dimmed and empty, still movable and resizable; only a camera never placed is absent, there being nothing of it to preserve — `renderer/inventory.js`, `renderer/css/40-printers.css`.
- **A camera sent fullscreen now fills the SCREEN.** `position: fixed` only ever covered the app window, so the title bar, the menu bar and the dock stayed in front of a view whose entire point is to fill the screen. The card is handed to the Fullscreen API instead, which puts it in the top layer at screen size and MOVES NO ELEMENT, so the stream inside it is not interrupted; the window-filling card remains as the fallback when the platform refuses, with an explicit background, a fullscreen element being painted against nothing. Leaving is believed rather than assumed — Escape, the green button and the system all end fullscreen behind the app's back, so the card's state is written from `fullscreenchange` rather than from what was asked for. The layout still refuses to write inline geometry on a card while it is up there: position, size and depth are written inline and no stylesheet, UA sheet included, can outrank that — `renderer/inventory.js`, `renderer/css/40-printers.css`.

### Fixed

- **The app no longer dies on an Intel Mac when a camera starts.** Three defects in a line, each sufficient alone. (1) The Intel build shipped an Apple-Silicon ffmpeg: `ffmpeg-static` downloads ONE binary, for the machine doing the install, and GitHub's macOS runners are Apple Silicon — both DMGs carried the arm64 binary. `scripts/prepare-ffmpeg.mjs` now fetches one per architecture before packaging and `build/afterPack.js` installs the matching one, before signing so it is signed with the bundle; both read the Mach-O header and refuse to continue on a mismatch. The staging also defeats the installer's habit of skipping a download whenever a binary is present, without ever checking its architecture. (2) Detection trusted `fs.accessSync(X_OK)`, which answers "is this file executable" and never "can THIS cpu execute it", so the unusable bundled binary was adopted and the Homebrew one next in line was never reached; each candidate is now probed with `spawnSync(p, ['-version'])` before it is trusted, which also catches a missing library, a quarantined file or a truncated download. (3) Both spawn sites were unguarded: `spawn` throws SYNCHRONOUSLY on a bad CPU type (`EBADARCH`, errno −86), on the assignment itself, so the `proc.on('error')` handler registered on the next line did not yet exist and the failure reached the main process as an uncaught exception — a crash dialog, for a camera. Both are wrapped, and a camera that will not start is now just a camera that will not start — `main.js`, `scripts/prepare-ffmpeg.mjs`, `build/afterPack.js`, `build/sign-and-notarize.sh`, `package.json`.
- **The camera view's fullscreen key is a switch again.** It was hard-wired to `data-size="fs"`, so pressing it while already fullscreen asked for fullscreen a second time — which is nothing; Escape and a click on the picture were the only ways back, and a key that visibly does nothing reads as broken. It now carries the size it will PUT YOU IN, icon and label included, and is flipped in place rather than re-rendered, the card it sits on holding a live stream — `renderer/inventory.js`.
- The bare `ffmpeg` fallback on PATH was never reachable: it was tested with `accessSync`, which resolves a bare name against the working directory rather than PATH — `main.js`.

### i18n

- Added: `camSizeExitFullscreen` — 9 locales.

---

## v2.24.0 — 2026-08-30

### Added

- **A print widget on the board** — the side panel's job block, placeable like anything else: preview, file name, percentage, progress bar, state, remaining time, finish clock and layer count. It reads the same normalised job the table and the card already use; the six firmwares' six names for the layer pair (`layerNum`, `currLayer`, `printLayerCur`, `layer`, `currentLayer`) are folded into `_getPrinterJob` rather than at each call site. With no preview — an idle machine, or a firmware that offers none — it falls back to the printer's own photo through the panel hero's chain, drawn `contain` and set back. It holds an image, so it supplies its own `refresh`: each field is written individually and the preview only when its URL changes, since replacing the body on every percent would re-set the background image — `renderer/inventory.js`, `renderer/css/40-printers.css`.
- **A camera widget on the board**, in a 16:9 frame that keeps its size whether the machine is there or not. It is the one widget switched OFF by default (`defaultOff`), and even once shown it stays quiet until you press play: every other widget is free to draw, but a camera opens a connection per machine. `_camPlaying` is session-only — wanting to look now is not a setting. It reuses `renderCamBanner`, so MJPEG, WebRTC and iframe arrive solved, and the shared multiplexer keeps a feed shown twice to ONE upstream connection — `renderer/inventory.js`, `renderer/css/40-printers.css`.
- **A machine's camera on its own card** — a play key over the printer's photo swaps it for the live feed in the same frame. Pressing play anywhere lights both the card and the widget for that machine, and WAKES the machine's link first (one idempotent kick per brand, as `_renderPrinterCam` does): a feed cannot be shown that nothing has asked for, and Bambu streams only on request, which is why its picture previously appeared solely after opening the side panel. The link is rarely up by then, so a catch-up on the board's own tick puts the picture in place as soon as there is one. FlashForge gets the camera wall's banner rather than the panel's: it holds ONE stream, and the panel's banner opens that stream itself and carries a fixed element id — `renderer/inventory.js`.
- **Pause and stop on a machine's board card while a print runs**, stacked down the right edge of the photo, mirroring the brand badge on the left. Every brand now answers a uniform `controlJob(printer, action)` — six three-line adapters over the transports they already had — so a card acts on the machine it belongs to instead of on `_activePrinter`, the machine whose side panel happens to be open. Stop is hold-to-confirm (1.5 s): it ends a print that may be hours in, and a board shows many machines at once. The key turns over in place when the machine pauses; a print starting or ending goes through the board's rebuild, since that changes the card's shape — `renderer/inventory.js`, `renderer/printers/*/index.js`, `renderer/css/40-printers.css`.

### Changed

- The widget switches in a machine's ⋮ are ordered Print, Temperature, Filament storage, Camera. `BOARD_WIDGETS` is the menu's order now — nothing reads that table by position, so its order is free to mean something — `renderer/inventory.js`.
- **A group's outline is shown only while something is being moved.** At rest the rings describe a state you already know and cover a busy board in orange; during a move every ring appears, so you can see both what is coming with you and what you are about to land among — `renderer/css/40-printers.css`.
- The **filament widget is drawn even when the machine has reported nothing** — a placeholder with one unknown bay. It used to draw nothing, so a user who switched it on had it on and nowhere to be seen. Three gates asked the same wrong question (render, live patch, and the list of a machine's board objects); the last is why it also stayed out of its machine's cluster. Being switched ON is what makes it one of the machine's objects — `renderer/inventory.js`.

### Fixed

- **A camera feed reached only whichever surface registered for it LAST.** `camStart` handed a restarted stream an empty consumer set, and every surface registers once — when it opens — so it never learned the stream underneath had been replaced. Consumers are carried across a restart now, minus any element no longer in the document; that prune is also what lets a stream notice its last consumer has gone, the condition that arms its stop — `renderer/printers/cam_manager.js`.
- **A feed opened correctly, then became a broken-image icon.** A teardown blanks its consumers and revokes the frame they show — right when a stream ends, wrong when it is merely replaced: the elements just carried over were emptied underneath. The last frame is handed over with them, so a restart is invisible — `renderer/printers/cam_manager.js`.
- **A camera that failed to start was never retried**, and a stream is only re-asked for by a render — which the side panel does once and never again. A printer accepting ONE client refuses every attempt made in the gap between a view handing the stream back and the printer closing it, which a view switch lands in almost every time. A failed stream now retries while a consumer is on screen — `renderer/printers/cam_manager.js`.
- **A camera went black for seconds on every change of view.** `GRACE_MS` was 2 s — less than a view change takes — so the stream died between the two and the arriving view rebuilt it from nothing. It now outlives a switch and the new view is handed the last frame at once — `renderer/printers/cam_manager.js`.
- The board never handed its camera consumers back — neither on a rebuild nor on LEAVING the printer view — so a FlashForge feed started there kept that printer's single client slot for ever and the camera wall could not have it afterwards — `renderer/inventory.js`.
- A board widget needing post-render wiring was wired only when switched on, never after a full render: it worked once and was dead after the next rebuild. The hook was documented and half-implemented — `renderer/inventory.js`.
- A widget changed width depending on where it stood — a Snapmaker's five temperature pills folding onto two rows near the board's right edge. `fit-content` on an absolutely positioned box is capped by the space left to the container's edge; `max-content` asks only what the content needs — `renderer/css/40-printers.css`.
- A widget switched on for a printer that has NEVER connected stayed loose instead of binding to its machine, and could not be swept into a selection. Both the position and the binding are written by an adoption step that waited for the machine's `units` map — right for a unit, whose position lives inside that map, wrong for a widget, whose position is a field on the machine's own document. The rubber band also falls back to where an object is DRAWN when the record has none — `renderer/inventory.js`.
- The colour finder was drawn over the camera wall, offering to select a spool colour on a screen that holds no spools: it was hidden on printer views by the same switch that hides the printer FILTERS, which the wall drops deliberately — `renderer/inventory.js`, `renderer/css/30-racks.css`.

---

## v2.23.1 — 2026-08-28

### Added

- **A `Refill` container** at the top of the picker (type *Without MasterSpool*, `container_weight: 0`), for a spool stored with no masterspool at all — the net weight is then the spool's own. Illustrated by a bare refill coil rather than a crossed-out spool: every other row shows the object you have, and without a masterspool the object is the filament itself. Uncoloured on purpose — a coil's colour is the filament's, not the container's, so any real colour would be wrong for most spools. Cut out to a transparent 256×256 like the rest of the catalogue. Contributed by [@Ptitlouis6012](https://github.com/Ptitlouis6012) ([#17](https://github.com/TigerTag-Project/TigerTag-Studio-Manager/pull/17)) — `data/container_spool/spools_filament.json`.

### Changed

- **The TigerScale live card mirrors the scale's own weigh screen**: weight and vertical divider on the left, container and filament values plus the spool's rack location on the right, on a dark inner panel using the firmware's palette (`LVCOL_GREEN/ACCENT/YELLOW/RED/ORANGE`) so a status badge reads the same on both screens. The rack location is real Firestore data in the detail panel's coordinate format, not a placeholder. The hand-rolled cellular-bars WiFi indicator gives way to the app's own `icon-wifi` glyph, and the redundant "last known spool" row goes, superseded by the block's own brand/material display. Contributed by [@Ptitlouis6012](https://github.com/Ptitlouis6012) ([#16](https://github.com/TigerTag-Project/TigerTag-Studio-Manager/pull/16)) — `renderer/IoT/tigerscale/index.js`, `renderer/IoT/tigerscale/tigerscale.css`.
- **Tare is a key beneath the screen**, inside the card, instead of a button floating under it — where it sits on the scale itself, wearing the firmware's tones and its two-line face (the fixed `0.0` above the word, as the device prints it; it is part of the key's face, not a reading). The `.sc2-live-card` frame moved out of the live block to make room: the button stays a SIBLING of `.scale-card-local`, never a child, because that block is replaced wholesale on every WS delta (10 Hz) and a hold in progress would be cancelled. Disconnecting now hides the whole card, Tare included, rather than leaving an empty bordered box around a dead button — `renderer/IoT/tigerscale/index.js`, `renderer/IoT/tigerscale/tigerscale.css`.
- `scaleTareBtn` is the operation's name in capitals, as the firmware prints it (TARE / TARA / 去皮), replacing the conjugated forms (Tarer, Tarieren, Taruj) — the key belongs to the device and should speak its language.

### Fixed

- **Every Creality CFS slot came out grey on the printer board** while the machine's own panel showed the right colours. Creality broadcasts a colour as bare hex with no `#`, sometimes with a stray leading zero (`0FF5722`) — neither is a CSS colour. `parseCreHex` was defined INSIDE `renderCreFilamentCard`, so `creGetSlots`/`creGetUnits`, written later, read `boxsInfoRaw` and published a value no stylesheet could interpret. The parser is module-scope now and both feeds use it. Creality was the only brand whose board feed read the raw payload rather than the driver's normalised state; the other five were checked. Reported by a user — `renderer/printers/creality/index.js`.
- Switching language left an open Scales panel in the previous one: its cards are built once by `renderScalesPanel()` and only patched surgically afterwards, so nothing revisited their text — it is rebuilt with the rest of the reactive chain now. Contributed by [@Ptitlouis6012](https://github.com/Ptitlouis6012) ([#16](https://github.com/TigerTag-Project/TigerTag-Studio-Manager/pull/16)) — `renderer/inventory.js`.
- The TigerScale's name was invisible in light theme: it sits on the card's shell, which follows the theme, but was painted a hardcoded white meant for the firmware's dark inner screen — `renderer/IoT/tigerscale/tigerscale.css`.
- The Tare button's hold fill could not be seen in light theme: it was painted `var(--ink-40)`, which flips to a dark ink there, over a key that keeps the firmware's dark tone in both themes. An invisible fill reads as a broken button, since nothing else happens until the hold completes — `renderer/IoT/tigerscale/tigerscale.css`.

---

## v2.22.0 — 2026-08-28

### Added

- **The printer view is a board.** Machines are placed by hand on a permanent grid with the storage plan's magnetism and guides — the geometry, panning and zoom were made board-agnostic rather than duplicated, so one implementation serves both views. Wheel to zoom, middle-drag to pan, buttons and a typed value from 30 % up, with the point under the cursor held fixed. The board carries its own zoom (`tigertag.printer.planZoom`); a machine's position lives on its document as `plan: {x, y, z}`. A machine never placed flows below the arrangement; the one moved last sits in front — `renderer/inventory.js`, `renderer/css/40-printers.css`.
- **A connected machine's filament storage is shown as UNITS**, one named block per physical object (Ext., AMS 1, AMS 2…), rendered from the record at startup — dimmed and desaturated until the brand's link comes up — and split onto the board individually via **Split units** in the widget's ⋮. Grouped and split arrangements are stored apart (the group's position on the machine, each unit's on the unit) so switching never discards the other — `renderer/inventory.js`, `renderer/printers/*/index.js`.
- **Filament storage is stored on the machine**, as a `units` map on its own device document — one entry per physical unit (AMS, CFS, ACE box, holder pair, external arm), each carrying its shape, a user-renamable label, a position on *each* board, and slots holding what the user assigned (`uids`) and what the machine last reported, stamped with `seenAt`. A map rather than an array so one unit is written without rewriting its neighbours; on the document rather than in a subcollection because units are few and always read with the machine. The seeder never overwrites label, shape, positions or assignments, and a unit that stops being reported is marked `present: false` rather than deleted. Every brand now describes its units, not just a flat slot list. Vocabulary and shape: `docs/printer-storage-terms.md` — `renderer/inventory.js`, `renderer/printers/*/index.js`, `docs/firestore-schema.md`.
- **Feed slots as a movable board object**, showing the same coloured squares as the machine's own panel at exactly a rack slot's size and scale in picture view (64 × 64, 6 px apart), in balanced rows of at most five. Four states: unknown reads `?`; assigned but not loaded shows its colour as a ring with a hollow `?`; a colour with no declared material reads `—`; a loaded bay is filled with its material family. Hover names the bay, brand and variant. Each brand normalises AMS trays, CFS materials, ACE slots and tool-changer nozzles behind one `getSlots` on the registry — `renderer/inventory.js`, `renderer/printers/*/index.js`.
- **A temperature widget on the printer board**, with its own position (`tempPlan`). It renders each brand's existing temperature card via `getTempHtml` rather than a seventh copy of it, read-only; it stays on the board when the machine is silent, dimmed with an em dash per reading. Only the numbers are swapped on a live tick, never the frame — `renderer/inventory.js`, `renderer/printers/*/index.js`, `renderer/css/40-printers.css`.
- **Cards can be bound together on the board, permanently.** Select (rubber band or shift-click), right-click, group: touching any member then carries the whole set at its existing offsets. A dashed outline rings the set and follows it. The binding lives on the members beside the coordinates it binds — `planCluster` on the machine's document, `unitsPlanCluster` for the units widget, `units.{id}.planPrintersCluster` for a single unit — rather than in a collection of its own: no new rules block, and deleting a machine takes its membership with it. Called a *cluster* in code because "group" already means three other things here. The board also gained its first right-click menu, built from the kebab menu's own component — `renderer/inventory.js`, `docs/firestore-schema.md`.
- **Widgets are switched per machine from its ⋮**, as toggles. `widgets.{kind}` on the device — **absent means shown**, so only a deliberate choice is written. A widget is bound to its machine from the start, takes the first free place going down its own machine's column when switched on (another printer's card is not an obstacle), and forgets its position when switched off so it returns beside its machine rather than wherever it last stood — `renderer/inventory.js`, `renderer/css/30-racks.css`.
- **Rubber-band selection and group moves on both boards** — sweep empty board to select machines (Printers) or racks (Storage, Arrange only), shift to extend, then drag any selected card to move the set at its existing offsets. One shared implementation (`wirePlanMarquee`) — `renderer/inventory.js`.
- **A move handle on every card**, left of the ⋮. Outside Arrange it is the only thing that moves a machine or a rack; in Arrange the whole card stays a handle. New `icon_move` glyph — `renderer/inventory.js`, `assets/svg/icons/icon_move.svg`.
- Groundwork for assigning an inventory spool to a machine slot: `renderer/printers/filament.js` resolves a TigerTag spool into the values any of the six brands accept — Bambu's catalogue id and tray type, Creality's id and pressure, the family/fill split, the vendor token, temperatures, and each brand's colour format. Never refuses: an unknown brand or material becomes a Generic stand-in at the right colour and temperature, with a flag for whether the identity is exact. Internal, no user-facing change yet.

### Changed

- **Adding a board widget is one entry in `BOARD_WIDGETS`.** It was thirteen edits in eleven places, each naming the kind explicitly. The prefix resolver, position, stacking order, cluster binding and its pre-pass, board-id list, switch-off cleanup, render and patch all read the table; widgets share one frame (`_widgetFrame`) so a new one supplies only its body. Storage stays out on purpose — its units are a map with their own keys. Documented in `docs/printer-board-widgets.md` — `renderer/inventory.js`.
- The printer board dropped its "Connected" / "Offline" partition: a machine losing its link no longer changes place. With it went the `sortIndex` drag-and-drop that rewrote order behind the arrangement, the section headers, the full grid rebuild on every state blink (a connect now touches one dot), the sort grip, and the trailing "+ add a printer" card. `sortIndex` survives as the table view's order — `renderer/inventory.js`.
- Arrange and zoom float over the board's top-right corner instead of a strip above it, anchored to the view so panning does not carry them off — `renderer/inventory.js`, `renderer/css/40-printers.css`.
- Everything on the printer board shares one derived width — exactly what a four-slot unit measures, padding and border included — so a machine card and the unit beside it line up, and changing a slot's size carries it along — `renderer/css/40-printers.css`.
- The group/ungroup menu opens on a right-click anywhere, including inside a cluster's ring (drawn without pointer events, hit-tested by geometry) and over bare board, where it acts on the current selection — `renderer/inventory.js`.
- A printer card is a switch: clicking the machine whose panel is open closes it — `renderer/inventory.js`.
- Panning both boards is the wheel button only; the left button on empty board draws a selection — `renderer/inventory.js`.
- Several racks can be selected at once in Arrange mode — `renderer/inventory.js`, `renderer/css/30-racks.css`.
- In a group move each carried card answers for its own landing spot, so the red overlap edge names the card actually sitting on something. Still a warning; a drop is never refused — `renderer/inventory.js`.

### Fixed

- **An in-place chip update destroyed the spool's own record on the next read** — the weight fell back to nominal capacity and the masterspool, rack and TD were lost, while the inventory count stayed put. A chip's timestamp is stamped once, at creation: it is the creation date and, as `twin_tag_pairing_id`, the key pairing a twin with its other half. `rfid:encode-cloud` stamped `_nowChipTs()` on every write, and the timestamp is also what the renderer compares to decide a chip was reprogrammed elsewhere — so the document kept the old value, the next read saw a mismatch and ran `docRef.delete()` before recreating from the chip alone, which carries none of those fields. The creation date is now unwritable by construction: `_keepChipTimestamp` overlays the chip's own timestamp (payload offset 32, u32 BE, one page) onto the payload before the surgical diff, on both write paths, so that page is identical and can never be among the pages sent. Reported on v2.21.1; the defect dates to v1.8.5 — `main.js`.
- **A spool's TD vanished whenever its record was rebuilt from its chip** — a delete-and-rescan, or any chip rewrite — although the chip carried it throughout. The chip stores `td_raw` (TD × 10) and the record kept that faithfully, but every screen reads `TD`, which only the TD1S ever wrote. `TD` is now derived from `td_raw` on any scan that finds none in the record; a record already holding one keeps it, so a TD measured but not yet burned is never overwritten by the chip's older value — `renderer/inventory.js`.
- **Switching to the printer board could silently do nothing.** Cards and widgets are assembled into one string before `host.innerHTML` is assigned, so anything throwing in one widget meant the assignment never happened and the view kept whatever it had. Every builder is wrapped in `_safe`, and a deferred rebuild gets a two-second watchdog — a deferral that can last for ever is a frozen screen — `renderer/inventory.js`.
- Switching view could stop working entirely: any stray menu parked on `body` held the board's rebuild deferral for ever. Only a menu belonging to a machine on this board holds it back now, and changing view closes menus first — `renderer/inventory.js`.
- **Group moves on the printer board, audited end to end.** Cards flashed back to their old position before landing, from five causes, all about order: overlapping gestures unlocked the board early (holds are counted now); a held object answers for its own position and the record is not consulted; cards were released on button-up rather than when the writes landed; the guard protecting a just-written position was cleared by our own optimistic patch, so it evaporated before the snapshot arrived; and a rebuild deferred during the drag was flushed before the new positions were written. A release outside the window was heard by nothing and froze the board, since anything held suppresses the rebuild. A group was clamped card by card at the board edge, flattening the spacing; the set is shifted as one. The cluster outline was destroyed and recreated on every layout pass, blinking twice per move, and is patched in place — `renderer/inventory.js`.
- A card dragged on the printer board could teleport mid-move: every brand rebuilds the view on any live state change, detaching the node under the pointer, so the hand carried a ghost and the release wrote its coordinates. Nothing rebuilds or re-places the board while something is held; the rebuild is deferred, not dropped — `renderer/inventory.js`.
- Toggling a widget closed the machine's ⋮. Four causes, the last being the real one: writing the setting comes back as a Firestore snapshot that re-renders the view. An open menu now defers the rebuild the way a held card does, and the debt is paid when it closes. The others: the action runner closing for every item; the full re-render taking down the menu itself; and the dismiss-on-scroll guard, since re-laying the board fires `scroll` — judged by position now, not by timing, because the events a resize provokes are delivered on a later frame — `renderer/inventory.js`.
- A group's outline stayed behind other machines' cards when moved over them. The board spaces its cards two apart in the stacking order, leaving one slot under each for a ring — `renderer/inventory.js`, `renderer/css/40-printers.css`.
- Rebuilding the printer view threw the board back to its top-left corner. The scroll is restored after the layout that gives the board its size — `renderer/inventory.js`.
- The temperature widget did not follow its cluster: the list of a machine's board objects knew about its card and its storage but not about it. That list is also where a widget switched off drops out — `renderer/inventory.js`.
- Grouping cards nudged them out of place: grouping writes no position but triggers a layout, and a card never given coordinates is re-placed by every pass. Members are pinned to where they are drawn before the binding is written — `renderer/inventory.js`.
- Arrange mode no longer opens a machine's side panel; the ⋮ still answers — `renderer/inventory.js`.
- Right-clicking a printer card opened its side panel behind the menu, and armed a card grab that cleared the very selection the menu was about to act on. Only the left button moves a card — `renderer/inventory.js`.
- Clicking the ⋮ on a printer card also opened the side panel behind it, armed through the rebuild-safety fallback — `renderer/inventory.js`.
- A rubber-band sweep leaving the board froze its box and left it behind, so the next attempt drew a second one. Leaving abandons the sweep and restores the selection, with the window catching a release outside it — `renderer/inventory.js`.
- A card dragged past the board edge is dropped where it last stood, on both boards: pointer capture meant nothing told it the cursor had left — `renderer/inventory.js`.
- Grabbing a card on either board rings it in the accent colour; the three states are one ordered block per board (held < selected < colliding) so a collision is never outranked by a lift. The closed-hand cursor appears on press rather than after the first pixels of travel — `renderer/inventory.js`, `renderer/css/30-racks.css`, `renderer/css/40-printers.css`.
- Overlap warning on the Storage board is a red outline again, and only that — it used to recolour an outline Arrange alone declared, and the red wash replaced the drag shadow — `renderer/css/30-racks.css`.
- Placing the board no longer sweeps up the marks drawn on it (cluster outline, rubber band) and gives them a spot among the cards; saving a position without an explicit stacking order no longer throws — `renderer/inventory.js`.
- Anycubic showed an unreported temperature setpoint as a dash in both the panel and the board widget, while the pill's own editor assumed zero when clicked — `renderer/printers/anycubic/cards.js`.

---

## v2.21.1 — 2026-08-24

### Fixed

- **Every spool in a back row was unranked on launch.** A two-deep rack came back with only its front row filled and the rest sitting in "Not stored" — written straight to Firestore, so the arrangement was gone for good. `healDuplicateSlots` finds two spools sharing one slot and evicts the extras, and its slot key was `rackId | level | position` — **without the depth**. A spool behind therefore shared a key with the spool in front of it, so a full two-deep column read as a pile of duplicates and everything but the front one was written back to `rack: null`. Caught in the app's own log: `[racks] self-heal: 57 spool(s) in already-occupied slots → unranked`. The depth is part of the key now: two rows deep is not a collision, it is the feature. It fired ~2 s after launch, behind the "What's New" window, so the damage only surfaced when that window was dismissed — which made it look like closing it was the cause — `renderer/inventory.js`.
- **One half of a twin pair was unranked on launch, at random.** A twin pair is ONE physical spool wearing two chips, so both halves legitimately share a slot, and the heal groups them before it counts. But only one of the two documents carries `twin_tag_uid` — which is exactly why `_markTwinPairs` flags both sides rather than trusting the field — while `twinSpoolIdOf` only ever read that one direction. The pair therefore read as a legitimate couple or as two rivals depending on which half the heal visited first. The lookup now resolves both ways. This was never confined to the heal: **nine** call sites resolve a twin, including `assignSpoolToSlot`'s twin mirror, which reached only one of the two documents depending on the direction — the asymmetry predates rack depth and was merely surfaced by it — `renderer/inventory.js`.
- **Two heuristics that write `rack: null` on real spools now refuse to run when they would clear a large share of the stock.** The duplicate-slot heal and the orphan-reference sweep both act on a guess — "you are on top of someone" / "your rack no longer exists" — and a guess that erases where a user put a quarter of their collection has misread something rather than found that much genuine mess. Both step aside and say so in the log instead of writing the mistake to every document they can reach. The orphan sweep additionally waits for a racks snapshot **confirmed by the server** (`!snap.metadata.fromCache`): a cold start is served from a local cache that may name fewer racks than exist, and acting on it would unrank everything living in the racks it forgot — `renderer/inventory.js`.

---

## v2.21.0 — 2026-08-23

### Added

- **Shelf depth — a rack can hold spools one behind the other (1 to 3 rows).** Storage draws the depth in perspective: each row back is the same grid, pushed up and sideways so the spool behind stays readable, front row on top. The rack doc gains `depth`, written only when > 1; a spool's slot gains `rack.depth`, written only when > 0. A rack or spool without them is depth 1 / front row, so nothing needs migrating and a depth-1 rack renders byte-for-byte what it rendered before. A "Rows deep" stepper joins the create/edit panel, on its own line under levels and slots per level (three abreast did not fit and the values clipped); slot totals and the preview caption account for it. Shrinking the depth orphans what was behind, the same rule `updateRack` already applies to rows and columns. Back rows paint a solid colour tile instead of a weight bar — the bar is anchored to the bottom of a slot, exactly the part a back row hides; picture view is unchanged. Auto-fill fills the whole front row first. Slot locks, drag-and-drop, swap-on-drop, the hover tooltip, the rich stats, the surgical slot patcher, "Clear all", auto-unstore, single-spool auto-assign and the detail panel's "Storage location" all carry the third coordinate — `renderer/inventory.js`, `renderer/css/30-racks.css`, `renderer/inventory.html`. New `rackDepth` / `rackDepthView` / `rackDepthSpacing` / `rackDepthSpacingV` / `rackDepthSpacingH` / `rackDepthReset` / `rackDepthHint` / `rackPreviewDimsDeep` i18n (9 locales).
- **Depth spacing setting** — a "Depth" button in the Storage header opens two sliders (vertical 12–52 px, sideways −30 to +30 px, negative leaning the rows left). Stored on the account as `users/{uid}.studioRackDepthOffset`, beside `studioTheme` and the other Studio-only settings — NOT in `prefs/app`, which is the cross-app document shared with the mobile app; it rides along with the user-doc read at boot rather than costing a second fetch, and `users/{uid}` takes it without a rules change (owner-only, blacklist write). Still cached in `tigertag.rack.depthOffset` so a cold start with no network paints the right spacing at once. Applied as two CSS custom properties, so moving a slider repaints without rebuilding a node; picture view scales the offsets by tile size. The button appears only when a rack actually has depth — `renderer/inventory.js`, `renderer/css/30-racks.css`.
- **The storage plan — racks are placed by hand instead of packed in creation order.** Moving a rack needs no mode: grab its header and drag, at any time. "Arrange" is kept for what is neither frequent nor harmless — the resize grips, which edit the rack itself and can send spools back to Not stored — plus a permanent grid and Tidy up. Positions are stored in pixels as `plan: {x, y, z}` on the rack (the first version's cell-based `bento: {x, y}` is still read as a fallback, so no arrangement is lost). **Nothing on the plan moves except the rack you are holding**: every version that pushed neighbours aside wrote other racks' positions to the database behind their back. Free placement, kept tidy by magnetism — a dragged rack looks for a nearby edge (flush against a neighbour, or aligned on its left / right / centre) and falls back to the grid when nothing is within 8 px; a thin guide shows which edge it caught. Overlap is allowed but never silent: the card outlines in red, and the rack moved last sits in front, the stacking order stored with the position. While a grip is held, a dashed outline shows the footprint the resize is heading for. The width observer on the racks column is gone — it re-packed on every width change, and the width is now something the plan itself writes, so zooming past the window edge fed back into a full re-pack; a window resize re-applies stored positions instead of packing. Only "Tidy up" re-packs — `renderer/inventory.js`, `renderer/css/30-racks.css`.
- **Colour range filter, shared by every view that shows material.** A rainbow bar carrying a hue window plus a second bar running white → grey → black for colours below 15 % saturation, on their own row under the search band. Drag the middle to change the shade, pull either edge to widen it, wheel inside to widen or narrow around the centre; spools in range stay lit and the rest fade, so the rack keeps its shape and you see *where* the colour is. Neither bar is ever dimmed or tinted — the choice is marked by **height**: the selection is a bubble sitting on the bar, carrying a copy of its bar's gradient sized to the whole bar and slid into place. Approach an edge and the bubble's own border thickens; double-click inside it to put that bar back to sleep. Only ever one selector on screen — it moves to whichever bar you touch, since a spool cannot be "that orange AND that grey". The hue window wraps red (360°/0°) as one range and never narrows past 10°. Matching runs on the colours a spool is actually painted with, in `colorBg`'s precedence (a mono spool's two spare chip slots read back as a valid `#000000`, which had every spool answering to "show me the blacks"), on a product identity's colour, and on a catalogue entry's whole `color_info.colors` list — through one shared rule over a single hex normaliser, since colours arrive as `#RRGGBB` **and** `#RRGGBBAA` and the second is the common shape (9 548 of 12 211 catalogue entries; 16 brands had no six-digit colour at all and could never match). Wired once at boot from the page shell, so the window survives switching views. Hidden in the printer views and Lists, where it could filter nothing — `renderer/inventory.js`, `renderer/css/30-racks.css`.
- **A filter field inside the long filter dropdowns** (Brand, Material, Aspect, Type, Tag, and the Search views' own selectors). Replacing a native `<select>` with a styled popup had quietly cost type-to-reach; with 124 brands that meant scrolling past a hundred names. Matches **anywhere** in the name, not just the start ("sun" finds Sunlu and eSun), ignores case and accents, lands the cursor on the first survivor so Enter means "the obvious one", and the arrow keys walk what is left. Rendered only for lists of 8 or more — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **Two more masterspool containers** — Elegoo White (232 g) and eSun eSpool+ 2.0 (210 g), each with its artwork — `data/container_spool/spools_filament.json` (PRs #15 and #14, @Ptitlouis6012).
- **Three new synthesised cues** — a bright rising two-note when a spool joins the inventory (hung off the inventory subscription, so it fires however the spool arrived: scanned, typed, imported, or pushed from another device; never on the first snapshot, once per snapshot, and announced ids are remembered since a local write surfaces twice), a light tick when a rack is picked up off the plan, and a low thunk when it is set down — pitched well below the spool cues so a whole rack landing does not sound like one spool clicking into a slot — `renderer/inventory.js`.

### Changed

- **The search row is one family of controls.** The field is a pill with an inline "+" on its left that **replaces the header's "+ Material" button entirely** — one add control instead of two, dispatching by view (the two material sources in a small menu, the brand picker in Printers, the new-rack modal in Storage), named after what it will do, and hidden in a friend's read-only inventory. Its icon-only neighbours are round and the filter dropdowns are pills. The reset is a single refresh glyph at the head of the row that clears **every** filter — search, Brand / Material / Aspect / Type / Tag, the ❤ ★ flags and the Search views' own selectors — dimmed until it has something to undo, and turning one full turn over three falling notes when it does — `renderer/inventory.html`, `renderer/css/70-detail-misc.css`, `renderer/inventory.js`.
- **"Not stored" lists the most recently added spool first**, empties still sinking to the bottom and ordered newest-first among themselves. The date is the one the card already shows, carried by every spool: a chipless TigerData entry gets the same `timestamp` at creation — `renderer/inventory.js`.
- **Racks are no longer reordered by dragging a grip** — where a rack sits is where you put it on the plan, not its rank in a list. The `⋮⋮` handle, the reorder writer and their styles are gone; `order` survives as the iteration order used when tidying up — `renderer/inventory.js`, `renderer/css/30-racks.css`.
- Legacy `lockedSlots` keys (`"level:position"`) are read as "locked at every depth" while new locks are written as `"level:position:depth"`. Unlocking one row of a legacy-locked column keeps the others locked. No document is rewritten — `renderer/inventory.js`.
- The TigerPOD glyph in the header is redrawn from new artwork, its mask cropped to the icon's own bounding box and sized to 34 px of ink so it matches the TigerScale glyph beside it — `assets/svg/icons/Icon_tigerpod_3d.svg`, `renderer/css/60-modals.css` (PR #12, @Ptitlouis6012).
- Sunlu Midnight Blue masterspools are relabelled one generation up (V1→V2, V2→V3). The container ids and image filenames are deliberately left alone: ids are stored on users' spools, and renaming one would orphan every spool referencing it — `data/container_spool/spools_filament.json` (PR #13, @Ptitlouis6012).
- README points at both TigerPOD models (Standard and Mini) and centres its images — `README.md` (PR #11, @Ptitlouis6012).
- The "To order" filter keeps one glyph whether on or off — a plain cart. It swapped between cart-with-a-plus and plain cart, making the same button look like two controls; colour alone marks it now — `renderer/inventory.html`, `renderer/css/70-detail-misc.css`.

### Fixed

- **A spool's chip was written with its remaining weight multiplied by a thousand** — a 1 kg spool read back as `1000000 g`. The chip carries ONE unit byte for BOTH quantities (a real 1 kg tag reads `measure: 1, measure_available: 1, id_unit: 35`), while the Firestore document does not follow that convention: `measure` is in the product's unit but `weight_available` is always in grams. `TigerTag.fromCloudDoc` takes one of each and stamps the document's unit on both, so every kg product — 11 242 of 12 211 — went onto the chip a thousandfold too heavy, and it compounded, since each rescan rewrites a chip whose weight disagrees with the database. Converted at the one boundary where a document becomes a chip, covering all three write paths; the field is always set and never dropped, because the SDK's own fallback (`measure_gr`) is in grams too and reintroduced the error by another route. A unit coarser than the value rounds and logs it. A stock entry seeded from a chip is also **capped at the spool's capacity** — a guard rail independent of cause, which only ever pulls a value down — `main.js`, `renderer/inventory.js`.
- **The Brand filter listed printer brands instead of filament brands**, with no way back. Those selects are shared with the Printers view, which repurposes them; that view refreshed them on every render, and a connected printer pushing a status update re-renders it through a brand callback whatever the user is looking at — so the filters were rewritten behind the user's back seconds after leaving Printers. The refresh now runs only while the Printers view is on screen — `renderer/inventory.js`.
- **A rack's ⋮ menu opened far from its rack** — at 60 % plan zoom the right-hand rack's menu appeared three columns away and drawn small. It is positioned in viewport coordinates to escape the rack's overflow, but a CSS transform makes its scaled ancestor the containing block for `position: fixed`. Measured on a reproduction: a button at x=1264 opened its menu at x=809, 108 px wide instead of 180. The menu is parked on `<body>` while open and put back on its card when it closes, and it dismisses itself as soon as the view moves — wheel, scroll, middle-click pan, outside click or resize — since a viewport-anchored menu cannot follow its rack — `renderer/inventory.js`.
- **A disconnected scale no longer shows a battery level.** The glyph kept the last percentage received, true only when the scale went quiet — minutes or days earlier. The red glyph already says the device is out of touch — `renderer/IoT/tigerscale/index.js`.
- **In dark mode the selected view was invisible.** The view selector's sliding bubble conveys its lift with a black drop shadow over a raised face — which does nothing on a dark ground (contrast 1.08). It now carries a hairline drawn with `--border-strong`, a dark line on light and a light one on dark; composited it renders rgb(79,83,96) over a rgb(30,34,44) track, a 2:1 edge — `renderer/css/70-detail-misc.css`.
- **Every view started at a different distance from the filter rows** — six copies of the same margin chasing each other, two already drifted (4 px of padding in Storage and Printers against a 12 px margin elsewhere), plus a grid class carrying its own top margin that doubled the gap wherever it is reused inside another view. All now read one `--view-gap` token — `renderer/css/00-base.css`, `30-racks.css`, `40-printers.css`, `70-detail-misc.css`.
- **Icons nested in the search field's buttons were positioned as if they belonged to the field.** `.inv-search .icon` is meant for the magnifier; as a descendant rule it pinned every icon inside every button to the field's right edge. Scoped to a direct child — `renderer/css/70-detail-misc.css`.
- **Three filter dropdowns could sit open at once.** Each closes on an outside click, but the opening button stops propagation — it must, or the click would reach that handler and shut the list at once — so the others never heard about it. Opening one now closes the rest explicitly — `renderer/inventory.js`.
- **A move that only changed the depth did not show.** The Storage render signature listed a spool's rack, level and position but not its depth, so front↔back within one column produced an identical signature and the early-return fired. The write had gone through all along — `renderer/inventory.js`.
- **Back rows were unreachable in picture view** — `rp-slotview-photo` lands on `#invRackView` itself, so the id rule setting the scale to 1 beat the class rule setting it to 2; rows stayed 34 px apart against 64 px tiles, leaving a ~20 px sliver. The row's top padding read the resolved spacing from a custom property defined on a child and ignored the scale too. Measured after: the whole 61 px back tile is hittable — `renderer/css/30-racks.css`.
- The top-most slot sits at the same height whatever the depth: the column-number line is a row too, so it was getting depth padding it has no back rows to use. Measured 20 px from grid to first slot at depth 1 and 2 — `renderer/css/30-racks.css`.
- Back rows draw at the same size and opacity as the front row, and each shelf isolates its own depth planes so a front row cannot paint over the back row of the shelf below — `renderer/css/30-racks.css`.
- Changing the depth spacing re-runs the masonry: the cards get taller and the packer works from measured heights — `renderer/inventory.js`.

---

## v2.20.0 — 2026-08-22

### Added

- **The header scale icon is now one glyph per scale (capped at two), each coloured by its own connection state.** A single aggregate icon became `renderScaleHealth`'s per-scale render: 1 scale → 1 glyph, 2+ → 2 (never more), each `.scale-glyph` carrying `scale-active` (green) / `scale-standby` (blue) / `scale-offline` (red), and muted grey when no scale is paired. A hover popover (`.scale-health-pop`, mirroring the RFID-pod popover) lists **every** scale — one row each with a matching status dot + `Scale #N` + status label — so 3+ scales still surface fully even though the glyph count is capped. The rebuild is signature-guarded (`_scaleHealthSig`) so the live-ping animation isn't restarted on every 10 s tick / snapshot — `renderer/IoT/tigerscale/index.js`, `renderer/IoT/tigerscale/tigerscale.css`, `renderer/inventory.html`. New `scaleStatusStandby` / `scaleHealthStandby` / `scaleHealthRow` i18n (9 locales).
- **Standby is a first-class connection state.** `scaleConnState` returns `active` / `standby` / `offline`; a screen-off scale (`power_state === "screen_off"`, firmware ≥ 3.6.0) with a heartbeat inside the standby window shows **blue "standby"** rather than offline. Offline detection is regime-aware — `SCALE_ONLINE_ACTIVE_MS` 90 s (30 s cadence) vs `SCALE_ONLINE_STANDBY_MS` 11 min (5 min cadence) — so a fully-awake scale with its backlight off is never shown disconnected; a genuinely silent scale still flips to offline once its heartbeat ages past the window (needed because a scale that dies in standby keeps its last `screen_off` forever) — `renderer/IoT/tigerscale/index.js`.
- **Battery on the header scale glyph — an iOS-style pill.** Coloured outline + terminal nub, proportional fill, and the value inside: reads `XX%` while discharging and `XX` + a charging bolt while charging. Colour precedence **charging (green) → low < 20 % (red) → neutral**; `battery_present === false` shows no gauge, and `battery_percent` null is treated as "no cell" (≠ 0) — `renderer/IoT/tigerscale/index.js`, `renderer/IoT/tigerscale/tigerscale.css`.
- **The TigerPOD modal offers both Pod models to print.** Two buttons — **Standard** and **Mini (OpenSpool)** — each opening its own MakerWorld model. The badge now opens the modal whether a reader is connected or not — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/60-modals.css`. New `tigerPodPrintCta` / `tigerPodPrintNormalBtn` / `tigerPodPrintMiniBtn` / `tigerPodOwnLabel` / `tigerPodOwnSub` i18n (9 locales).
- **TigerTag+ reference database refreshed to 12 211 products.** `db_update.py` re-synced every reference JSON from the live API — `assets/db/tigertag/id_catalog.json` + `last_update.json` (and the id_* datasets).

### Changed

- **The scale Wi-Fi indicator follows connectivity, not raw RSSI.** It was a red single bar for a perfectly working link because the thresholds were router-adjacent (excellent ≥ -50 dBm). Colour is now green while online / muted while offline (matching the scale's own screen, which is green whenever connected), with realistic bar-count thresholds; the exact dBm + quality label stay in the tooltip — `renderer/IoT/tigerscale/index.js`, `renderer/IoT/tigerscale/tigerscale.css`.
- **`rfidReadersMax` (TigerPOD reader count) is recorded on a successful read, not a bare connect,** and kept at the lifetime max — seeded from the persisted value at login so a fresh session (counter reset to 0) can no longer write a lower count over a stored 2 — `renderer/IoT/tigerscale/index.js`.
- **The backend "cloud" indicator only appears on a real network problem.** Hidden while all is well, and shown only after **3 s of continuous disconnection** (offline / serving from cache) — suppressing the flash at startup while the cloud is still connecting. The Firestore-metadata logic and hover ping are unchanged — `renderer/inventory.html`, `renderer/inventory.js`.
- **The tare button reads the response now that the firmware returns CORS headers.** It shows success only on a 2xx and an error state otherwise, instead of adding the "success" class before the fetch and swallowing the error (which reported success even when the scale was unreachable) — `renderer/IoT/tigerscale/index.js`, `renderer/IoT/tigerscale/tigerscale.css`.
- **Debug-mode telemetry instrumentation** in the scales Firestore subscription: a timestamped log of every `power_state` / `power_source` / `is_charging` transition (with `from_cache`) plus a `snapshot → render` timing, to measure plug/unplug and wake latency — `renderer/IoT/tigerscale/index.js`.

### Fixed

- **A scale in standby was wrongly marked offline after 90 s.** Since firmware 3.6.0 a screen-off scale heartbeats every 5 min, but the flat 90 s threshold treated all scales alike — it now uses the standby window (see Added) — `renderer/IoT/tigerscale/index.js`.
- **`containerWeight` of `-1` (unknown, per the firmware contract) rendered as "-1 g".** Weights are now guarded `> 0`, so an unknown container/net weight shows "—" — `renderer/IoT/tigerscale/index.js`.
- **Light-theme contrast in the TigerPOD modal.** The title and badges on the fixed purple header, and the numerals in the orange feature circles, used theme ink tokens that turn dark in light mode → unreadable; they are forced to white/light — `renderer/css/60-modals.css`.

---

## v2.19.1 — 2026-08-19

### Fixed

- **Both printer side cards that showed "0m" remaining next to the clock, for two different reasons and one shared cause.** Each brand card derived the remaining time itself instead of reading the one the printers table uses (`_getPrinterJob`), so the two surfaces disagreed. *Bambu Lab*: `mc_remaining_time` is reported in **minutes** and was fed straight into a seconds formatter, so a 32-minute job floored to `0m`; `PROTOCOL.md` documented the field as seconds — the source of the mistake — and is corrected with the value observed on hardware. *Snapmaker*: the card printed `printDuration`, which is the time **elapsed**, so a job that had just started read `0m` beside a table saying `21m`; Moonraker sends no remaining time, so the card now reads the shared normalised job (slicer estimate − elapsed, else extrapolated from progress) and shows `—` rather than a wrong `0m` while it has nothing to derive from. The normalised reading is exposed to every brand card as `ctx.getPrinterJob` so this class of drift has one place to live; the other four brands were audited and their units are correct, so they were left alone — `renderer/printers/bambulab/cards.js`, `renderer/printers/bambulab/PROTOCOL.md`, `renderer/printers/snapmaker/cards.js`, `renderer/printers/context.js`, `renderer/inventory.js`.
- **Six column headers in the Printers table stayed in English in every language** — Brand, Name, Model, Status, Job, Last seen were hardcoded literals sitting between two neighbours (Preview, Ends at) that did go through `t()`. They now reuse the existing table-header key family; `applyLang()` already re-renders this view, so they follow a language switch immediately — `renderer/inventory.js`.
- **Dependency refresh — 18 advisories (1 critical, 17 high) down to 0**, entirely within the existing semver ranges: `package.json` is untouched, only the lockfile was stale. `builder-util-runtime` 9.5.1 → 9.7.0 closes GHSA-p2f4-r6v6-j797 / CVE-2026-54673 (electron-updater leaked `Authorization` and `PRIVATE-TOKEN` headers across a cross-origin redirect — `electron-updater` is a runtime dependency here, though this app's update feed is a public GitHub release that carries no credentials, so there was nothing to leak in practice); electron-builder / app-builder-lib 26.8.1 → 26.15.3 closes the AppImage uncontrolled-search-path advisory (GHSA-7g7r-gx96-252g); electron 41.3.0 → 41.10.6 closes three; plus tar (critical), undici, ws, js-yaml, tmp, form-data and ip-address. Supersedes external PR #10, which pinned the single package through an `overrides` entry — the ranges already allowed the fixed releases, so the pin was unnecessary — `package-lock.json`.

### Changed

- The on-demand test build covers **all three platforms** instead of Windows only (`test-build-win.yml` → `test-build.yml`): a matrix with `fail-fast: false` so one platform breaking still reports the other two, the Linux system dependencies `nfc-pcsc` needs, `CSC_IDENTITY_AUTO_DISCOVERY: false` so macOS does not hunt the keychain for an identity it will not find, a `concurrency` group that supersedes an earlier run on the same branch, and 7-day artifacts. Adds the `build:mac:nopublish` and `build:linux:nopublish` scripts it needs — `build:linux` was `--publish always`, so a test build would have tried to publish — `.github/workflows/test-build.yml`, `package.json`.

---

## v2.19.0 — 2026-08-13

### Added

- **Adding a material starts with one question instead of two buttons.** `+ Material` no longer opens the manual form directly: it opens `#matSourcePanel`, a side card offering the two sources — **From Catalogue** (`setViewMode("catalogGrid")`) and **Manually** (`openAddProductPanel()`). They were both already reachable, the catalogue from its own top-bar button, but nothing said they were the same task nor what each one yields, so each row now carries the tier pair its path leads to, drawn with the header stats' own capsules: `.tag-cloud.tag-cloud-plus` + `.tag-plus` for the catalogue (a real `id_product` behind the entry, so it burns to a **TigerTag+**), `.tag-cloud` + `.tag-diy` for the manual one (**TigerData → TigerTag**). Built on the printer add-flow's own component (`.pba-panel` / `.pba-brand`) rather than a new one, down to the masked row icon, which is keyed on the shared `[id$="Choice…"]` id-suffix convention (`…ChoiceCatalogue` → `icon_search.svg` was added to that list; `…ChoiceManual` already resolved to the pencil). Rows are rendered by `openMaterialSourcePicker()` on every open, not written in `inventory.html`, because each row's hint lives in a `data-tip` ⓘ bubble (the shared `#toolInfoPop`, delegated exactly as the toolbox and reorder cards do) and `applyTranslations()` reaches `data-i18n` attributes only — rendering on open is what keeps the bubbles in the current language. **From Catalogue always lands on the catalogue GRID**, whatever layout the inventory was in: recognising an unfamiliar product is done by its photo and its colour, and the table shows neither. The card carries **no `.panel-overlay`** — like the spool detail card it leaves the app visible and clickable behind it — and it therefore joins the `_syncPanels()` cascade as its **leftmost** member (`z-index: 97`, below reorder 98 › product 99 › group/container 100 › material 101 › printer 103/105), so opening a spool or a printer takes the right edge and *pushes* it left instead of burying it. Its `»` tab is glued by `_setTab` like every other card's, inherits the hold-to-close-all wiring from `_setupCloseTabHold`, and the picker was added to `_closeAllSidePanels()` so that hold closes it too — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/40-printers.css`, `renderer/css/70-detail-misc.css`.
- **"Get it on MakerWorld" in the TigerScale onboarding card**, beside "View on GitHub" — the printable V3 body. Both CTAs stack full-width rather than sitting side by side: the panel is 420 px and the two labels fit on one line in no locale, so a deliberate stack beats a wrap that differs per language. Each keeps the brand colour it already has in the sidebar (`#2d333b` GitHub, `#00BCA0` MakerWorld with the `icon-package` cube), so one destination looks the same everywhere in the app. The URL is locale-less (`makerworld.com/models/…`, not `/fr/models/…`) so MakerWorld redirects to the visitor's own language — `renderer/IoT/tigerscale/index.js`, `renderer/IoT/tigerscale/tigerscale.css`.

### Changed

- **The TigerScale onboarding card was rebuilt around the V3 machine.** The photo sits on a lit stage (a radial `color-mix` pool in `--primary`) with a **V3** capsule, because a V2 owner has to see at a glance that this is different hardware and not a firmware update. The three ✓ lines became **six icon-led feature rows** — dual NFC readers, real remaining weight, large touchscreen with the calibration wizard, account sync, offline brand/material recognition from the device's own flash, and runs unattended (battery optional) — each with a real masked icon in a tinted slot instead of a ✓ glyph. Copy rewritten for V3 in 9 locales — `renderer/IoT/tigerscale/index.js`, `renderer/IoT/tigerscale/tigerscale.css`.
- **The TigerScale illustration and header icon are now the V3 body** (onboarding card, scale card thumbnail, README, header health icon). The header icon needed more than a file swap: the new trace is cropped tight — its ink fills 100 % of its viewBox, where TigerPod fills ~75 % and TD1S ~47 % of theirs — so at the shared 44 px box it drew far bigger than its two neighbours. The glyph is scaled inside an **unchanged** 44 px box (`-webkit-mask-size: auto 34px`, matching TigerPod's 33 px of ink) so the header row keeps its spacing and alignment. Masters archived under `assets-src/` — `assets/img/TigerScale_Photo.png`, `assets/svg/icons/icon_tigerscale_3d.svg`, `renderer/IoT/tigerscale/tigerscale.css`.
- The TigerScale **"View on GitHub" pointed at the V2 repository** (`TigerTag-Project/TigerTag-Scale`, which redirects to `Tiger-Scale`, "no longer developed"); it now opens `Tiger-Scale-V3`. `README.md` and `llms.txt` already pointed at V3 — only the in-app button had been left behind — `renderer/IoT/tigerscale/index.js`.

### Fixed

- **Printer photos rendered as black silhouettes in the Printers list view in dark mode.** `.pt-thumb` carried a `mix-blend-mode: multiply` left over from when the catalogue images had a white background to knock out; they are transparent PNGs now (27–96 % transparent pixels, corner alpha 0), so the blend served nothing and multiplied each photo with the row background instead. Permanent on Windows, `:hover`-only on macOS, since the blend only bites once the row's background is actually painted. Blend mode dropped, not replaced — `renderer/css/40-printers.css`.
- **Windows virtual smart-card readers were detected as NFC readers.** `Windows Hello for Business` — auto-created by Windows on any TPM-backed / Entra-ID managed PC for certificate logon — is enumerated by PC/SC exactly like an ACR122U and permanently reports `SCARD_STATE_PRESENT` with an `Identity Device (Microsoft Generic Profile)` card. A user with 2× ACR122U therefore saw **three** slots in the multi-reader burn window, the third never turning green, which left the Burn button disabled for good. Added to the existing name filter at the reader-registration gate (`nfc.on('reader')`), alongside the generic `Microsoft Virtual Smart Card` of the same family. This is the second real report of the same PC/SC over-enumeration after the YubiKey one, which is noted in the brief — the user-controlled reader panel it describes is worth prioritising — `services/nfc-process.js`, `docs/READER-SELECTION-BRIEF.md`.

### Removed

- The standalone **"From Catalogue"** button in the inventory action bar, its click handler and its `_syncInvBarButtons` visibility line — it is the first choice of the `+ Material` side card now, so adding a material has one entry point instead of two. i18n key `catalogBtn` dropped from 9 locales — `renderer/inventory.html`, `renderer/inventory.js`.

---

## v2.18.0 — 2026-08-11

### Added

- **Dark mode, and a theme the user chooses.** Dark is the shipped default; Light is picked in *Edit profile → Theme*. The theme is carried by `data-theme` on `<html>`, written **statically** in `inventory.html` so the correct palette is in force at first paint — reading it from storage in JS would flash the wrong theme on every launch. An IPC channel (`app:native-theme` → `nativeTheme.themeSource`) keeps the window chrome in step, since the title bar and the native dialogs belong to the main process and CSS cannot reach them; `main.js` still forces dark at startup as the default and the renderer corrects it when the stored choice is Light. Persistence is three-tier and each tier has a distinct job: `localStorage` (`tigertag.theme`) is the boot-time read source, so the choice survives a cold, offline start; `users/{uid}.studioTheme` is the preference itself, on the user document beside `vatCountry` and `priceInputMode` (this app's own settings — `prefs/app` is the CROSS-APP document shared with the mobile app, which is why `lang` lives there and the theme does not), and it rides along with `syncUserDoc`'s existing read instead of costing a second fetch; `users/{uid}/telemetry/studio.theme` records the same value as **usage** so the Hub can report the dark/light split — `renderer/inventory.html`, `renderer/inventory.js`, `preload.js`, `main.js`.
- **A design-token layer, and `npm run theme:check` to defend it.** `:root` went from 12 colour variables to ~75 semantic tokens plus a `:root[data-theme="dark"]` override, in four groups: surfaces/text/borders (invert), brand + semantic accents (hue constant, `-soft` tints recomputed with `color-mix()` against `--surface` so a tint sits correctly on whatever it is painted over), fixed-polarity (`--on-accent` is white in BOTH themes — it is the label ON a filled orange button, and this codebase wrote `#fff` for both that and "card background"), and always-dark (tooltips, media, and the Add-Product panel, which mirrors the mobile app's product screen on purpose). Adds an **ink ladder** (`--ink-04`…`--ink-85`) whose polarity flips with the theme, replacing ~450 hand-written `rgba(255,255,255,x)` / `rgba(0,0,0,x)` alphas with one scale. 1 297 of 1 567 raw colours across 17 stylesheets now resolve through tokens; shadows and third-party brand colours stay literal on purpose. `scripts/check-theme-tokens.mjs` fails on any raw colour or any `var(--x)` naming an undeclared variable, and reports its exemptions rather than hiding them — `renderer/css/00-base.css`, `scripts/check-theme-tokens.mjs`, `package.json`.
- **Portable Windows build — no installation, runs from a USB key.** A second Windows target (`portable`) produces `Tiger-Studio-Manager-<version>-portable.exe` beside the installer and unpacks to a stable folder rather than a fresh temp dir each launch. It also **keeps its data on the stick**: when electron-builder sets `PORTABLE_EXECUTABLE_DIR`, `main.js` redirects `userData`, `sessionData` and `logs` into `TigerStudioData/` next to the .exe — otherwise a "portable" build still writes accounts, cache and logs to `%APPDATA%` on the host, leaving a signed-in session behind on a shared PC and losing the inventory from one machine to the next. A read-only or locked folder falls back to the default location instead of refusing to start. The CI needed no change — its signing filter and upload globs already match every `dist/*.exe` — `package.json`, `main.js`.

### Changed

- **Edit profile is a side card sliding in from the left, and its interface was rebuilt.** The account lives in the left sidebar, so its editor now unfolds from the side you clicked instead of jumping to the centre of the screen; it reuses the `.detail-panel` idiom (fixed, 8 px inset top/bottom, rounded on the inner edge, slide on `transform`) mirrored horizontally. The overlay keeps its id and its `.open` class, so the open/close code was untouched. Eleven stacked fields became a pinned title bar + identity hero + grouped sections — Display name, Links, Appearance, Language & region, Advanced (admin-only) — with one row per setting, label left and control right. Header and hero stay pinned while the body scrolls; sign-out is pinned in a footer. The avatar-background swatches moved into the identity block (they paint the avatar, so they belong with it) and went from two rows of seven to one row of fourteen. Existing social links are listed under the row rather than hidden behind an add affordance, each carrying its auto-detected platform icon, with the trailing empty slot dashed; a line now states they are visible to friends and on the public profile, which `syncUserProfile` has always done silently. The card's dropdowns reuse `_enhanceSelect()` — a native `<select>` opens an OS list no CSS can reach — and drop the orange `is-active` treatment inherited from the inventory filters, where it signals a live filter and here signalled nothing. The Dark/Light and HT/TTC switches became sliding pills: a single `::before` positioned by `:has()`, so the markup and the JS keep toggling `.active` and know nothing about it. Confirmation of a name change moved ONTO the save button (green flash, shake on refusal) instead of a line of text appearing under the field and shifting the layout; errors still print words, because only they have something to say beyond "done" — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/60-modals.css`.
- The Country help paragraph became an ⓘ hover/focus bubble reusing the shared `#toolInfoPop` (the rack view's `.rp-info` component, extended by one selector rather than copied), and `priceInputLabel` was retitled from "Price entry" to **"Prices"** — `priceInputMode` drives both how prices are TYPED and how they are DISPLAYED (inventory price column, reorder), so the old label described half of what the setting does — 9 locales.
- `playground/profile-sidecard/index.html` — a standalone, dependency-free bench carrying the app's real tokens, for iterating on the card's design without restarting Electron.

### Fixed

- **27 CSS variables were used but never declared** (`--fg`, `--bg-2`, `--surface2`, `--surface-hover`, `--accent`, `--ok`, `--hairline`…). Those with a fallback silently rendered it — often a *dark* value inside a light UI, i.e. rules written for a theme that did not exist. Those without one (`color: var(--fg)`, `background: var(--bg-2)` ×5, `var(--surface2)` ×3, `var(--surface-hover)`) were simply invalid, so the element had no background or colour at all. All 27 now resolve to canonical tokens, and 101 dead `var(--token, fallback)` fallbacks were removed — the variables always resolved, so the fallbacks were unreachable code that also mis-stated the intended colour — `renderer/css/*.css`, `renderer/IoT/*/*.css`.
- **The sliding bubble in the view selector stopped sliding, and had become invisible in dark.** Two independent causes. (1) `renderInventory()` — which runs on every view change — scheduled an **instant** re-fit of the indicator; the click started the slide and the render snapped the bubble to its destination in the same tick. That guard exists only for boot (the card is `display: none` until sign-in, so every button measures 0 px) and is now one-shot, retried until a bubble actually measures a width. (2) The action row is `flex-wrap`, so switching view changes which filters are visible and can rewrap the row; the `ResizeObserver` then re-fitted instantly a few ms after the click. It now snaps only when the reflow was NOT caused by the user's own switch (400 ms window), so a genuine window resize still places the bubble without a trailing animation. Separately the bubble was painted `--surface`, which is the LIGHTEST step in light but DARKER than its own `--surface-2` track in dark — it sank into its background. Re-based on `--surface-raised`, which means "above the surface" in both themes; two other components had the same defect and were fixed with it — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **X, TikTok and GitHub logos vanished on a dark background.** They were pinned to `#111111` in `_SOCIAL_MAP`, so on the account and friend banners they rendered near-black on a near-black card. These three brands have monochrome identities built to invert, so they now resolve to `var(--text)`; every other entry is a genuinely chromatic brand colour and stays literal — `renderer/inventory.js`.
- **The ✕ on a social link emptied the field but left the row on screen.** `_saveSocials` only re-renders the editor once focus has left it — and the ✕ lives inside it — so the blanked row lingered, still showing its old platform icon and its own ✕, beside the empty add-row: two empty fields and a delete that looked broken. The handler now removes the row outright, and merely resets the trailing add-row, which must always exist. Removing the node is also the surgical move: no `innerHTML` rebuild, so the other fields keep their caret and selection. Pressing **Enter** in a link field now commits and leaves it — it blurs, because the existing focus-out path is the one save route and calling the save directly as well would race it — `renderer/inventory.js`.
- **App-styled dropdowns were clipped when they opened near the bottom of a scroll box.** An absolutely-positioned popup cannot escape a scrolling ancestor, so the Country list opened downward into `.eac-body`'s clip and half of it was cut away. `_enhanceSelect` already flipped horizontally against `#card-inv`; it now also flips vertically (`.csel-pop--up`) against the nearest ancestor that actually clips, found by walking up for a non-visible `overflow` — so every app-styled select benefits, not just this card. Also: 51 masked icons were painted with `var(--surface)`, which only ever looked right because `--surface` used to be white — on a filled accent button in dark they would have turned near-black. They now use `--on-accent` (and the inventory action bar's icons use `currentColor`, so glyph and label move together) — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`, `renderer/css/*.css`.
- Stray extra parenthesis in `color: var(--muted));` made the TigerScale WebSocket log text fall back to the inherited colour — `renderer/IoT/tigerscale/tigerscale.css`.

### Removed

- The "Type prices this way — we always store them tax-free…" hint under the price control, and its `priceInputHint` key in 9 locales. `Prices` over an `HT | TTC` choice cannot mean anything else.

---

## v2.17.2 — 2026-08-02

### Added

- **Product card: colour, quantity, and a raw-JSON block in debug mode.** DÉTAILS gained a **Color** row listing every slot as `#RRGGBBAA`, one per line (a dual/tri product shows all of them, not just the first) and a **Quantity** row showing the product's own `measure` with its unit — `2 kg`, not the `2000 g` the gauge uses. The alpha is never invented: a catalogue colour given as `RRGGBB` is completed from the chip's own `color_a` byte when the record has one, and left as-is otherwise — a TigerTag+ can be factory-set to any alpha, so padding with `FF` would have been a guess. With debug mode on, the card ends with the same collapsible **raw JSON** block (and copy button) the material side-card has — `renderer/inventory.js`.
- **Bundled catalogue refreshed to 7 552 products** (was 4 807), plus a brand-table update, via `assets/db/tigertag/db_update.py` — `assets/db/tigertag/`.

### Fixed

- **The product card always showed a 1 kg spool, whatever the real size.** `_renderProductCard` hardcoded `const cap = 1000, curW = 1000`, so a 500 g, 750 g or 2 kg product all read "1000 g / 1 kg total" with a full bar — while the grid card right beside it showed the correct `500 g`. The capacity was never missing: the catalogue seed already carries it and `normalizeRow` exposes it as `r.capacity`. The card now uses that, falling back to parsing the catalogue item's display string (`"500 g"` / `"2 kg"`, new `_catMeasureToGrams`) for a preview opened before the API detail lands. The spool still renders FULL — a product identity has no per-spool weight — only its capacity is now real. **One render function serves all six product-card entry points** (catalogue, favourites, lists, cart, friend view, groups), so every card in the app was affected and is fixed by this — `renderer/inventory.js`.
- **Catalogue seed: `measure_value` and `grams` are two different quantities and were read into one variable.** `_catalogDocFromApi` did `Number(fil.measure_value ?? fil.grams)` and ran the result through the unit conversion — but `measure_value` is unitless and only means something with `measure_unit` (500 + "g", or 2 + "kg"), while `grams` is ALREADY normalised by the API. A missing `measure_value` on a kg product would have yielded 2000 × 1000 g. `grams` is now the authority for `measure_gr`; the raw `measure_value` (paired with `id_unit`) is kept for the chip payload as the `.ttag` contract requires, and the conversion only runs when the API omits `grams` — `renderer/inventory.js`.
- **The Refill / Recycled / Filled badges were never displayed anywhere.** The spool detail card computed `infoBadges` and built `infoHtml2` from them, then never inserted it into its template — dead code (eslint had been flagging the unused variable), which is why a "PLA Basic Refill" spool showed no badge at all. Inserted into the Details body, and the same three chips added to the **product card** — same `.aspect-chip` markup and the same existing `badgeRefill`/`badgeRecycled`/`badgeFilled` keys, already translated in all 9 locales. They read `info1`/`info2`/`info3` through `normalizeRow` — `renderer/inventory.js`.
- **Side-card detail rows: a long value ran off the edge, and a medium one wrapped with half the row empty.** `.panel-row .pv` was capped at `max-width: 60%`, so a SKU broke onto two lines even when the label beside it was short and the space free; and nothing could break an unbreakable string (a SKU or barcode has no spaces), so a long one overflowed past the right edge. The label is now `flex: 0 0 auto` and the value `flex: 1 1 auto; min-width: 0`, plus `overflow-wrap: anywhere` for the no-space case. Applies to every panel row, so the material card benefits too — `renderer/css/70-detail-misc.css`.
- **`build:mac:unsigned` and `build:all` shipped without Google OAuth credentials** — the generator added in v2.17.1 was only wired into the publishing builds, so a local or unsigned build had no `oauth-config.json` on a clean checkout — `package.json`.

---

## v2.17.1 — 2026-08-02

### Fixed

- **Signing in with Google works again — a regression live since v1.10.0.** Commit `a94b4aa` (2026-05-20) moved the Google Desktop OAuth credentials to `process.env.…` with no fallback. `main.js` reads them at **runtime**, on the user's machine, where they never exist: CI only sets them at **build** time and, with no bundler and no `afterPack` hook, nothing ever inlined them — so **every shipped build** ran with empty credentials. The loopback flow (RFC 8252 + PKCE, system browser) reported "not configured" and the renderer silently fell back to `signInWithPopup`, which Google refuses from an embedded Electron webview ("browser not compatible with JavaScript"). Credentials are now written by `scripts/gen-oauth-config.mjs` into a gitignored `oauth-config.json` that electron-builder packs into the app, and `main.js` resolves them **env → generated file → hardcoded public client id**. The client id keeps a hardcoded fallback (public by design, and already in the repo's history); the **client secret has none** — it must never enter the public repository, even though it necessarily ships inside the binary (RFC 8252 §8.5: an installed app cannot keep a secret — PKCE is what protects the exchange). Google **requires** that secret for this Desktop client: the live endpoint answers `invalid_request / client_secret is missing.` without it, so the `client_secret` field stays in the token exchange with a comment saying why. The "not configured" guard now checks **both** credentials and names the missing one, so a misconfiguration fails fast in the log instead of surfacing as an unexplained popup — `main.js`, `scripts/gen-oauth-config.mjs`, `package.json`, `.gitignore`.

### Changed

- **Google sign-in is near-instant when the browser already holds a session.** The loopback flow forced `prompt=select_account` on every sign-in, making Google re-authenticate from scratch each time — account chooser plus a full identity challenge (passkey / security key / password) even with a live session. Dropped the parameter; an existing session now completes the round-trip with little or no interaction. Multi-account users are unaffected in practice: Google shows the chooser on its own whenever the browser holds more than one session — `main.js`.
- **`productKey` changed meaning in v2.17.0 and no data-model doc said so.** It is the join key third parties, the Hub and the backend statistics use, and since the tier left the key a `TigerData+` document now hashes to the same value as the `TigerTag+` of its `id_product`. Documented in `docs/firestore-schema.md` and propagated to the public integration reference (the backend repo's README): which documents change value (only `TigerData+`), that every other tier keeps its hash, that the mirror rewrites them lazily so BOTH values are in the wild during the rollout — the same caveat `protocol` already carries — and what a reader should do about it — `docs/firestore-schema.md`.

---

## v2.17.0 — 2026-07-30

### Changed

- **One card per tier, one deck per product — for all four tiers.** The two keys were pulled apart and given one job each. `_spoolProductKey` is the PRODUCT: `id_product` when there is one, the attribute signature otherwise (brand + material + the full colour signature + both aspects + `id_type`). `_spoolGroupKey` is the CARD: the product key plus the tier. So the grid and the table show a TigerTag card beside a TigerData one, and a TigerTag+ beside a TigerData+ — a card means "these spools are interchangeable", and a chipless spool cannot be written, weighed on a TigerScale or proven — while the deck, keyed on the product, gathers every one of them behind those cards. A bucket now holds exactly ONE tier, so every card carries a single unambiguous badge with no special case.
  - **The product state follows the product, not the tier.** Buy link, price, minimum stock, ★/❤ and the note hang off `_productKeyHash`, which now hashes the product key — so a price set on a chipped spool applies to the chipless one of the same filament, and "In stock" counts them together. The two decks of one product previously showed a different "In stock: 1 / 3" and a different ★ depending on the card opened.
  - **Nothing already stored moved.** `_spoolProductKey` deliberately emits the same `tt:<id_product>` string the old TigerTag+ branch produced and the same attribute string everything else produced, so every existing record keeps its hash. Only a TigerData+ changes casing, and `_legacyProduct` reads through to its original hash — a read-through, not a migration: no Firestore write, and no window where a buy link is missing.
  - **`_syncGroupPanelToSpool` gained `keepSingletons`** and counts the widened deck: a lone chipped spool is a one-member bucket, and counting the strict bucket closed the deck on exactly the pairing it exists to show.
  - **The live refresh widened too.** `_refreshGroupPanelIfOpen`, fired by the Firestore snapshot, re-resolved the bucket and rendered THAT — so adding a spool from the deck made the chipped one vanish until the panel was closed and reopened. The slider's live total follows the same rule: the card shows its bucket's sum, the deck the whole product's. A structural assertion fails the harness if a future render path skips the widening.
  - The unset-id guard stays where it belongs — on the WRITE side. Grouping productless spools together is what the attribute key has always done. 34 assertions across two harnesses — `renderer/inventory.js`.
- **Catalogue search reaches the whole record, and a scanned barcode lands on one product.** The index carried brand, title, material, SKU and measure; it now also carries the series and colour name on their own, both aspects ("translucent", "bicolor", "silk" are how people actually look), the product type, and the barcode. Codes are kept in a SEPARATE field from the words: folding a 13-digit EAN into the text haystack would make "1000" match every barcode containing 1000, so `_catCodeish` only consults them for a token of 6+ characters carrying a digit. A query that is one code and matches a `barcode`/`sku`/`id` exactly returns only those — a barcode gun fires the digits and an Enter, and a scan that lands on the right product plus nine coincidental cousins is a scan you have to read; it falls through to the ordinary search when nothing matches, so a typo still finds something. Weight is indexed in grams as whole tokens (`_catMeasureAliases`), which replaces an accident: "1000" used to return 284 products, every one matched through its SKU because some brands encode the weight there (`G00-W00-1.75-1000-spl`) — it now returns the spools that actually weigh 1 kg, and unifies the catalogue's own "0.5 kg" with its "500 g". Tokens, not substrings, because "2500g" ends in "500g". 18 assertions — `renderer/inventory.js`, i18n `catalogSearchPh`.
- **The series and the colour name are read from the catalogue, never derived from the title.** The list endpoint returns `series` and `name` as their own fields on every product, so `_catSplitTitle` — which cut `title` on its LAST " - " — is gone, renamed `_catSeriesName` because it no longer splits anything. The split guessed wrong whenever the colour name itself contains a dash: measured against the live 4 922-product catalogue it disagreed with the API on 6 products ("PLA Basic - CMYK - Magenta" is series `PLA Basic` + name `CMYK - Magenta`, not series `PLA Basic - CMYK`; same for Panchroma™ Galaxy PLA and the two PolyLite™ Version A/B). It survived only as a fallback for caches written before the API returned the fields, so the **local cache schema moved to v2**, which rejects those payloads outright: a rejected cache falls through to the bundled catalogue and a real sync follows, leaving the fallback nothing to protect. 0 empty series or names across the 4 922 products — `renderer/inventory.js`.
- **Bundled catalogue refreshed: 3 218 → 4 922 products** (32 brands, 2.6 MB, 4 919 filaments + 3 resins). `db_update.py` pulled 1 704 new entries; 1 966 records had changed upstream. The reference tables were already current — only the catalogue and its `last_update` stamp moved — `assets/db/tigertag/id_catalog.json`, `assets/db/tigertag/last_update.json`.
- **The README opened on the chip's logo and pointed at the wrong site.** The header showed `logo_tigertag_contouring.svg` — the ecosystem's chip mark rather than this app's identity — and it vanished into GitHub's dark theme. It now uses the app's own icon (`assets/img/icon.png`), which is opaque white inside with only the rounded corners transparent, so it reads on `#ffffff` and `#0d1117` alike. The site links were sorted out at the same time: the ecosystem, the catalogue and the account point to **tigersystem.io** (which serves `/catalog`, `/account`, `/download`), while `tigertag.io` is named for what it is — the shop — and keeps the TD1S product link — `README.md`.

### Fixed

- **Adding a spool made the TigerTag+ card flash a second, wrong badge.** `duplicateSpoolAsCloud` copied the source's `raw` wholesale and `_sanitizeCloudSeed` had no opinion on it either, so a spool minted from a TigerTag+ inherited its `id_tigertag`. That field names the CHIP's version in `id_version.json` and only four ids are legal; a chipless spool has no chip and therefore no version, which v2.16.0 already established — but these two mint paths kept writing one. The new document was read as `isPlus` until the mirror deleted the stray field, and for that moment it shared the TigerTag+ grouping bucket, so the card showed "TigerTag+ ×1  TigerData+ ×1" before settling. Both paths now strip a shared `CHIP_ONLY_FIELDS` list before writing — the tier is DERIVED from that field, so copying it makes the spool lie about what it is, and the flash was only the visible half of writing an out-of-referential value onto a fresh document. 10 assertions, including a replay of the old behaviour — `renderer/inventory.js`.
- **A product with no photo was drawn as a generic sketch instead of its own colour.** `product/get` never answers "no image": for a product without a photo it returns a shared placeholder — a line drawing of an empty spool hosted on Shopify (`DefaultFilament.jpg`) — and because that is a real image serving a 200, the `onerror` fallback every surface relies on never fired. The LIST endpoint is honest (`img_src` null or ""), only the DETAIL endpoint substitutes, so the same spool showed its colour in the grid and a stock sketch in the product card. `_isRealProductImg` recognises it in `normalizeRow`, the single funnel every surface reads `imgUrl` through, so the grid card, table thumbnail, detail panel and product card fall back together — including on documents that already stored the URL. The three ingest paths stop persisting it as well, so a TigerData+ created from an imageless product no longer carries a dead placeholder for good. 52 catalogue products are affected — `renderer/inventory.js`.

### i18n

- Changed: `catalogSearchPh` — 9 locales (now names weight and barcode).

---

## v2.16.0 — 2026-07-28

### Added

- **The product catalogue ships with the app.** `assets/db/tigertag/id_catalog.json` (~3 000 products, 1.5 MB) is now refreshed by `db_update.py` alongside the reference tables, so one command keeps the whole bundled database current. A fresh install has a searchable catalogue on FIRST LAUNCH, offline, instead of an empty Search view until the first sync lands; the bundle is read only when nothing is cached and `_catalogFetchedAt` stays 0, so a real sync still happens as soon as there is a network — it is a floor, not a substitute. Keeping it in git also makes the catalogue's own evolution reviewable. The fetch needs its own path inside `db_update.py`: a paged POST, and no `products` key in `all/last_update` to compare against — so it downloads in full and rewrites only when the normalised output (sorted by id, keys sorted) actually differs, which keeps a 1.5 MB file from churning the repo — `assets/db/tigertag/db_update.py`, `assets/db/tigertag/id_catalog.json`, `renderer/inventory.js`.
- **The catalogue keeps TigerData+ and TigerTag+ spools up to date by itself.** A new `catalogSyncedAt` stamp records when a spool was last reconciled with the catalogue — a field of its own, because `last_update` already means "when the chip was read or written" and `updatedAt` moves on every write including a weight change. After each catalogue sync, `_catalogStaleRows` compares it against the product's own `updated_at` (absent = never changed since creation = current) and `_catalogRefreshStale` refreshes the ones that moved: in the background, sequentially, capped per sync, and never in a friend's inventory (guarded at both the scan and the write — a friend's account is strictly read-only). Spools predating the mechanism carry no stamp and are swept once, which reconciles the installed base. The refresh goes through the same path as the manual button, so the consequence is decided in one place: the record updates either way, and the chip-pending flag is raised only when the change touched something the chip carries — a TigerData+ has no chip and updates in complete silence. `_refreshApiData` gained a second fetch route for that: its IPC builds the URL from the chip UID (`BigInt("0x" + uid)`), which throws on a chipless id, so chipless spools go through `lookupProduct(id_product)` as their creation did — `renderer/inventory.js`.
- **`series` and `name` come from the catalogue instead of being guessed.** The list endpoint returns them as their own fields; Studio split `title` on the last " - ", which gets a dashed colour name backwards — "PLA Basic - CMYK - Magenta" is series `PLA Basic` + name `CMYK - Magenta`, not series `PLA Basic - CMYK`. Measured on a live 1 000-product page: the split disagreed with the API on 2. The split survives only as a fallback for a cache written by an older build — `renderer/inventory.js`.
- **`playground/material-swatch/`** — a standalone dependency-free page that ratifies the colour convention against the shipped code, same status as the `.ttag` fields editor. It crosses all 17 colour cases with the 11 surfaces that paint a spool (swatches 56/28/15/13/12 px, table thumbnail, grid card, side-card illustration, catalogue row, both rack slot views, twin link, Add-Product preview), each case carrying a live colour picker; it links the SHIPPED stylesheets and copies the branch logic verbatim, so what it shows is what the app draws. Internal tool — `playground/material-swatch/index.html`.

### Changed

- **Spool colours follow one ratified convention instead of per-surface habits — everything is a camembert except a ramp, and every ramp is at 135°.** Two shared helpers own it (`_pieSplit`, `RAMP_ANGLE`) and every surface goes through them, including the Add-Product preview, which used to open-code its own gradients: a bicolor drew a 50/50 linear split there and a 180°/180° conic in the inventory — the same vertical line MIRRORED, so the spool swapped sides between the preview and Save. Bicolor is no longer a special case but a consequence: two equal conic sectors put the boundary on the vertical axis, so the vertical split is guaranteed on a round swatch, a square tile and a clipped fill bar alike. Ramps (rainbow in all four variants, and the catalogue's declared `gradient` type) moved from 90° to a shared 135° diagonal. Ratified as an ecosystem-wide convention whose canonical home is **TigerSystem-Docs** (`docs/developers/material-swatch.md`) rather than this repo, since the Hub, the mobile app and third parties implement it too — `renderer/inventory.js`, `docs/MATERIAL-SWATCH.md`, `CLAUDE.md`, `playground/material-swatch/index.html`.
- **"To order" moved from Favorites to Lists.** Favorites answers "what do I own"; the To-order cart answers "what am I about to buy" — the same question the wishlists ask, and they feed it. Nothing else moved: the button keeps its id, so the sliding indicator lights the Lists segment on its own, the boot restore still finds it, and it still hides in a friend view — `renderer/inventory.html`.
- **"From the catalogue" lands in the layout you were already in** — inventory grid opens the catalogue grid, inventory list opens the catalogue list. It always opened the list before, so leaving a wall of cards dropped you into rows and the Search segment read as a different feature rather than the same shelf seen from the catalogue side — `renderer/inventory.js`.
- **The catalogue thumbnail's TigerTag watermark was faded while every other one was solid** (`opacity: .55` against 1). All watermarks are now identical: top-right, full opacity, sized as a percentage of the tile — `renderer/css/70-detail-misc.css`.

### Fixed

- **DATA LOSS — the chipless id migration could destroy the spool it had just migrated.** `syncSpoolMirrors` was the one inventory write using `set(merge)`, so it could RESURRECT a `CLOUD_` document microseconds after `migrateOneSpoolCloudToTigerData` deleted it — as a two-field husk carrying only `productKey` and `protocol`. The next snapshot saw a `CLOUD_` id again, re-ran the migration, and `batch.set(newRef, …)` — a FULL overwrite, not a merge — replaced the correctly migrated document with the husk. One account lost the brand, material, colour, weight and price of **136 spools** in five seconds (2026-07-23T16:56Z, on v2.14.0; 136 kg and 563 € off its books). Because the husks all hash to the same `productKey` they collapsed into a single stack of 136 blank spools, which is how it surfaced — and because the material count barely moved (317 → 318) it read as an addition rather than a loss until the per-document `createTime` was checked. Three fixes, each sufficient alone: the mirror uses `update()`, which fails on a missing document instead of creating one; the migration REFUSES to propagate a source carrying no identity field (`id_brand`/`id_material`/`id_type`/`id_product`/`weight_available` all absent), dropping the husk instead; and it now retargets twin pointers — its own, and those aimed at it, queried rather than read from the local snapshot — which the old code omitted on the strength of a comment claiming a chipless spool can have no twin, disproved by two twinned chipless spools in that same account — `renderer/inventory.js`.
- **A chip re-write was asked for when nothing on the chip had changed.** The staleness test ran off a hand-written list of 18 fields that included `name`, `series`, `sku` and `barcode` — none of which are on the chip — so a brand renaming a product sent the user to the reader to write bytes identical to the ones already there. It now uses `TTAG_ON_CHIP_FIELDS`, the ratified `On chip` column of `docs/TTAG-FIELDS.md`, and `npm run docs:check` fails the commit if the two drift in either direction — `renderer/inventory.js`, `scripts/check-docs-drift.mjs`.
- **The `.ttag` contract demanded three fields no document has ever had, so NOTHING was exportable.** `TTAG_REQUIRED_NUM` was written from the names of the REFERENCE FILES rather than from the document schema: `id_measure_unit` is the file, the field is `id_unit`; `id_diameter` is not a field at all (the diameter id travels in `data1`, which Studio reads as `id_diameter ?? data1` and writes back as `data1`); and `id_version` is derived from `id_tigertag`, never stored. Every real material therefore failed validation and was counted as refused — silently, since the user only sees a rejection count. Caught by running the shipped validator against real inventory documents (0/168 accepted before, 166/168 after). The contract was re-ratified in `playground/ttag-fields-editor` and `docs/TTAG-FIELDS.md` regenerated from it — `renderer/inventory.js`, `playground/ttag-fields-editor/index.html`, `docs/TTAG-FIELDS.md`.
- **`db_update.py` could destroy a good reference file, and was still GPL.** A 200 response was treated as proof of a good payload — an API answering `[]` during a migration, `{"error": …}` on a soft failure, or an HTML page from a proxy would have been written straight over live data — and `open(path, "w")` truncates BEFORE writing, so a crash or a full disk left a truncated JSON the app cannot parse. Added a non-empty-array guard and temp-file + `fsync` + `os.replace` writes, and surfaced our own errors as a message rather than a traceback (the script runs in CI, where the message is the diagnosis). Verified by attack: a sandbox holding a good file survives 404, 500, an HTML page, an empty array, an error object and a bare string, leaves no `.tmp`, and still accepts a valid payload. The header moved from GPL v3 to **Apache-2.0**, matching the public Guide and the repo's own MIT licence — GPL on a sync script contradicts "implementing TigerTag requires no licence" — `assets/db/tigertag/db_update.py`.
- **`isColorDark` read every 8-digit colour as light.** Its regex tried `{6}` before `{8}`, so on an `#RRGGBBAA` it matched the first six digits and then failed the trailing `\b` (the alpha digits are word chars) — no match at all, and the helper's "unknown → light" default kicked in. `#000000FF`, the raw form the product catalogue serves, therefore chose the black-outline logo to draw on a black spool. Not reachable from Studio's own screens today (`colorBg` normalises to six digits before every call), but the helper is shared — TigerScale imports it, the Hub reimplements it. Alternatives reordered longest-first and the alpha is now dropped for both `#RRGGBBAA` and `#RGBA`; found by TigerHub, which hit it live on unnormalised catalogue colours — `renderer/inventory.js`.
- **Bulk delete could fire at spools the filter had hidden.** The count on the bar is the whole selection, but the table only shows what passes the current filter — so selecting everything and then searching left "Delete (143)" sitting under a single row, aimed at 142 spools the user could not see. The selection is kept on purpose (filtering is how you build one), so the bar now says the quiet part: an amber chip naming how many of the selected rows are hidden, shown only when the two counts differ — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/70-detail-misc.css`, i18n `bulkHiddenWarn`.
- **Opening a filter dropdown shoved the whole view sideways.** `_enhanceSelect` brought the selected option into view with `scrollIntoView`, which scrolls EVERY scrollable ancestor — and `overflow: hidden` still scrolls programmatically, so `#card-inv` slid across and clipped its own left edge. The list now scrolls itself, and the popup flips to right-aligned when left-aligning would push it past the card (measured, since how far the last filter sits depends on the locale's label widths) — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **The Search list lost its column header on scroll.** `.cv-body`, the only element between the view and the table, carried no rules at all — so `flex: 1; min-height: 0` on the table wrap resolved against a plain block, the wrap grew to its full content height, and the sticky `<thead>` sat pinned inside a box taller than the screen, sliding away with the rows while the OUTER view did the scrolling. Making the body a flex column that fills the view lets the bordered box actually be the scroller, the same recipe Inventory and Favorites already use. Scoped to `--table`: in grid mode the body IS the `.inv-grid`, and the cards must still size to their content — `renderer/css/70-detail-misc.css`.
- **Nothing looked selected in the view selector at first launch.** The selector lives inside `#card-inv`, which is `display: none` until sign-in completes — so at boot every button measures 0 px wide, the sliding bubble hides itself, and nothing put it back when the card finally appeared. An earlier attempt placed the bubble in the boot block, which is exactly the moment the card is still hidden; it was verified in a harness that had already revealed the card, so the test could not see the bug. `renderInventory` now positions it — the first moment the card is reliably on screen — `renderer/inventory.js`.
- **Closing the Product card left the Search row still highlighted.** The link ran one way — picking a row opened the card, but shutting the card (its ✕, opening another, leaving the view) left the row lit, pointing at a panel that was no longer there. `closeProductCard` now releases the selection, so every route out of the card agrees. Split into a side-effect-free painter plus a clear, which is what stops the two from calling each other — `renderer/inventory.js`.
- **The repo published the maintainer's home folder to GitHub.** Sixteen absolute `/Users/<account>/Documents/…` paths sat in five committed files — `CLAUDE.md`, `PERF_AUDIT_v1.8.13.md`, `docs/REVIEW-BRIEF.md`, `docs/spool-grouping-prompt.md` and `.env.example` — leaking the account name and the local checkout layout on a public repository, and wrong on any other machine anyway. Committed docs now name a sibling repo (`TigerTag_Firebase_Backend`) or reach it relatively. The machine-specific half moved to a new **gitignored `CLAUDE.local.md`** — where each checkout lives, which clone is live and which are stale decoys, and the per-repo commit policy — with `CLAUDE.md` carrying the standing rule that it is public and must never contain an absolute path. The other five Tiger repos were swept and are clean — `CLAUDE.md`, `CLAUDE.local.md`, `.gitignore`, `.env.example`, `PERF_AUDIT_v1.8.13.md`, `docs/REVIEW-BRIEF.md`, `docs/spool-grouping-prompt.md`.

---

## v2.15.0 — 2026-07-27

### Added

- **New app icon, generated from the TigerSystem vector master.** `assets-src/svg/tigersystem_icon.svg` is the single source for every icon the project ships, and it is never rescaled or redrawn: Windows `.ico` (all 7 sizes, 16 → 256), the favicons and the in-app SVG take it exactly as designed, while the macOS `.icns` and the Linux `.png` take the same full-size artwork with only its four corners clipped to a radius — macOS applies no mask of its own, so a raw square would sit in the Dock with hard corners next to every rounded sibling. Regenerate with `node scripts/make-icons.mjs`: it rasterises through headless Chrome (the only renderer here that preserves the alpha the clipped corners need — `qlmanage` flattens onto white) and packs the `.ico` itself, since `app-builder` emits a single 256 px entry from one PNG and crashes on a directory — `assets/img/icon.{icns,ico,png}`, `assets/svg/tigersystem_icon.svg`, `assets/favicon/`, `scripts/make-icons.mjs`.
- **Catalogue search → create a TigerData+.** A new **Search** view segment (grid + table) browses the official TigerTag+ product catalogue; selecting a product opens its Product card, and one button turns it into a chipless spool already filled with that product's data. Implements `docs/CATALOG-SEARCH-BRIEF.md` — `main.js`, `preload.js`, `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/40-printers.css`, `renderer/css/70-detail-misc.css`.
  - **New tier — TigerData+**: a TigerData carrying a real `id_product`. **Derived, never stored** (`isCloud && id_product ∉ {0, 0xFFFFFFFF}` → `_hasRealProductId`, `normalizeRow.isCloudPlus`); explicitly **not** a TigerTag+ — no chip, no UID, so `id_tigertag` keeps the chipless nonce (`_catChiplessNonce` re-rolls off the version table so the row can never read as Plus). Own badge via `tierBadgeHTML` (`.tag-cloud-plus`: chipless white capsule, amber accent — never a gold fill, which would read as a TigerTag+).
  - **Import-all-once**: new IPC `catalog:fetch-all` (`main.js`) pages `product/get/all` (`per_page` 1000, follows `nextPage` until null, no hard-coded catalogue size) → cached in `localStorage` (`tigertag.catalog`). The copy refreshes itself once it passes **24 h**, and **Settings → Tools** carries a *Re-sync the catalogue* button that forces it, with a line reporting how many products are held and how old the copy is. Search, filters and sort then run **entirely in memory**; after the first sync nothing but a cache rebuild touches the network — plus one `product/get` per product actually opened, cached for the session.
  - **The views reuse the app's own shells**: the grid is `.inv-grid` + `.spool-card` built by `_gridCardInnerHTML`; the table is a real `<table>` in `.table-wrap` with the always-on `.sel-cell` pastille, columns illustration · type · material · brand · series · colour · name · capacity; the filter dropdowns are the app's `_enhanceSelect` custom select.
  - **Filters at parity with the public catalogue page** (`tigersystem.io/…/catalog`): **Type · Brand · Series · Material · Sort**, every option carrying its count, Series scoped to the selected brand and disabled until one is picked, sort by brand / name / material with a stable tiebreak.
  - **The Product card is fed by `_catalogDocFromApi`** — the SAME builder the creation uses — as a `cloudSeed`, so the card previews exactly what an add would store (colours, nozzle/bed/dryer temps, diameter, SKU, EAN, catalogue link).
  - **A click selects, it never creates**: the only control that writes is the square `+` in the Product card's actions row (`.flag-toggle--addmat`).
  - **Every product type is browsable, only Filament (142) is creatable** (`_catIsCreatable`): `data1`–`data7` are per-type and only Filament is ratified, and a resin ships a `resin` block with no nozzle / dryer / bed. Anything else gets a plain-language "browse-only for now" message rather than silently-wrong data.
  - **Reuse, not duplication**: the `product/get` → doc mapping was extracted out of `_convertToPlus` into `_productApiFields`, the full doc build into `_catalogDocFromApi`; the detail call reuses the existing `rfid:lookup-product` IPC.
  - **Telemetry**: new `cloudPlusAddedTotal` counter, separate from `cloudAddedTotal`. The stored `TigerCloud` analytics bucket key is untouched.
- **`.ttag` record contract, enforced at import.** A `.ttag` exists to **create TigerTag / TigerTag+ chips**, so a record must carry the full **chip payload**; everything else is enrichment metadata. Studio now refuses any material that doesn't (`TTAG_REQUIRED_NUM`, `_ttagRecordValid`, `_ttagMaterialValid`): 24 required fields (`uid` + the 10 identity ids + `measure` + the 4 colour bytes + `data1`–`data7` + `timestamp`), with `null`/`""` not counting as present. A **material is atomic** — a twin pair passes only if both sides do, so a half-twin is refused whole. Refused materials never reach the preview and are **counted and shown** (`ttagRejected`), never silently dropped; the write builder re-filters as a last line of defence — `renderer/inventory.js`.
- **`playground/ttag-fields-editor/`** — the dev tool that AUTHORS the `.ttag` field contract, documented in `CLAUDE.md` (new *".ttag field contract"* section) as the source-of-truth editor so no future session hand-edits the Markdown. Standalone dependency-free page: per-**product-type** tabs (142 Filament ratified · 116 Accessories · 41 Spare Part · 173 Resin), three independent axes per field (wire **type** with the real chip min/max ranges read from `parser.js`, **on-chip** flag, **Required/Optional/N-A** per type), per-type "Why" notes (incl. the per-type meaning of `data1`–`data7`), live counters, filter, localStorage autosave, and a Download that regenerates `docs/TTAG-FIELDS.md` verbatim.
- **`docs/TTAG-FIELDS.md`** — the ratified contract: **28 required · 44 optional**, of which **24/24 chip-payload fields required**. Documents the envelope, the chip payload, the enrichment metadata, the minimal well-formed record and the enforcement rules. Companion to the TigerSystem-Docs `ttag-format` spec.
- **The spool detail card gained the Product card's two actions** — the square `+` (add another spool of this material, then open the grouped-spools deck on it) and the shopping button — so the three cards that describe one product (spool detail, Product card, grouped-spools deck) now offer one set of actions in one order. Both are delegated handlers and `.pi-flags-row` joined `_maybeRefreshPanelForCard`'s surgical swap, so the shopping button flips green the moment a buy link is saved, without rebuilding the panel — `renderer/inventory.js`.
- **A shopping button on the Product card and the spool detail.** One button, two jobs, told apart by colour: `.flag-toggle--buy.is-buy` (shop green) when the product has a buy link and the click opens it, plain when it has none and the click lands on the Reorder card's buy-link field (`openReorderPanel(r, { editBuyLink: true })`). Uses `icon-cart`, never the `icon-cart-plus` of the to-order flag beside it — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **The grouped-spools deck says when each spool was added.** Every member of a deck is the same filament, so the arrival date is the only thing telling them apart — each member row carries an "Added <ago>" line under its weight bar (`just now`, `3 days ago`, `2 months ago`) with the exact date on hover, read from the doc's own `timestamp`. `chipTsToMs` converts the chip epoch (seconds since 2000) and carries `fmtChipTs`'s guard against old docs that stored a plain Unix stamp there, which would otherwise read three decades into the future — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **Two more spool containers**: Inslogic Masterspool Black (232 g) and Jayo Plastic Black (127 g) — 49 → 51 entries. The bundled TigerTag reference data was regenerated at the same time (`db_update.py`), which is where both brand ids come from (Inslogic 2049, Jayo 7812) — `data/container_spool/spools_filament.json`, `assets/db/tigertag/id_brand.json`, `assets/img/spool_filament/`.

### Changed

- **Scroll fade ("scroll shadow") is now a reusable utility, and every scrolling list uses it.** The `.ttag` import list had a one-off bottom fade; it is generalised as `.scroll-fade` (`00-base.css`) + `_wireScrollFade(el, { top })` (`renderer/inventory.js`), applied to both edges of the option list of every dropdown (`.csel-pop-list`), the container picker (`.cp-list`), and every full-height list view: Inventory table (`#invTableWrap`) and grid (`#invGrid`), Favorites (`#invProductsView`), Printers (`#invPrinterView` + the table's own `.pt-wrap`) and Search (`#invCatalogView`). Deliberately **off in the To-order view**: it is a card plus a sticky side panel, so masking the scroller would fade a panel that hides nothing. Where a sticky `<thead>` owns the top of the scrollport the top fade starts BELOW it — `--sf-top-offset` is measured from the header (not hard-coded, so it follows font and locale) and re-measured on every call, since switching a view between grid and table makes the header appear or vanish. Note the app has two sticky conventions — the inventory tables make the header CELLS sticky (`thead th`), the printers table makes the `<thead>` itself sticky (`.pt-head`) — so the check accepts either, and it walks up to the scroller to make sure no intermediate wrapper traps the sticky. Implemented as a `mask-image` on the scroller itself rather than a coloured overlay on a wrapper: a mask is relative to the element's own box so it never scrolls away with the content, needs no extra DOM, and fades to transparent so it works on any background. The helper returns its updater — call it after re-rendering, since neither `scroll` nor a resize fires when only the content height changed.
- **Long dropdown lists show a scrollbar again.** The Brand / Material lists run to 25+ entries but the app hides scrollbars everywhere. A fade alone does not fix it — it only reads as "there is more" when an item is visibly cut in half, and says nothing when the cut lands between two rows. `.csel-pop-list` is therefore the one list in the app that KEEPS its scrollbar (slim, on-theme, darkening on hover); it also answers "where am I" and "how much is left", which a fade cannot. The fade stays on both edges as a softener — `renderer/css/70-detail-misc.css`, `renderer/inventory.js`.
- **The container picker groups brands alphabetically.** They came out in the order containers had been ADDED to the catalogue, so finding one meant reading all 37 groups. Sorted with `localeCompare(…, { sensitivity: "base", numeric: true })` — case never decides the order and `3DXTECH` sorts as a number — with the generic "Customizable" containers pinned first, keyed on `brandId == 0` (the same sentinel `resolveContainerForBrand` uses), not on the label — `renderer/inventory.js`.
- **The grid-view picto is a real icon.** Every "grid" view button used the `⊞` text glyph — it now uses `assets/svg/icons/icon_grid.svg` via the standard `.icon-grid` mask at `icon-13`, like its list sibling. Applied to all five: Inventory, Favorites, Printers, Search and the Lists view's own layout toggle. The now-unused `.vt-glyph` rules are gone — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **Every user-facing web link moved off `tigertag.io` to the `tigersystem.io` domains** (API endpoints `cdn`/`api.tigertag.io` unchanged). Catalogue: the two "browse the TigerTag+ material list" buttons (`productIdHelpListBtn`, `upgradePlusListBtn`) open `https://tigersystem.io/fr/catalog`, and the clickable **Product ID** (spool detail + product-info cards) opens `https://tigersystem.io/fr/catalog/<id>` (was `tigertag.io/pages/product-infos/<id>`). Shop: the "buy TigerTag RFID Maker" CTAs open `https://shop.tigersystem.io/collections/tigertag-rfid-maker` — `renderer/inventory.js`.
- **`.ttag` export now uses the canonical vendor MIME `application/vnd.tigertag.ttag+json`** (was `application/json`) — aligns Studio with the TigerSystem-Docs `ttag-format` spec. Import is unaffected (it validates by content, never by MIME/extension) — `renderer/inventory.js` (`_saveTtagFile`).
- **`_syncTtagBarButtons` → `_syncInvBarButtons`** — it governs all three inventory action-bar buttons (.ttag Export/Import + "+ From Catalogue"), which share one visibility rule (material inventory, own account), so the name no longer claims to be .ttag-only — `renderer/inventory.js`.
- **Three container brand names pointed at the wrong record**: `Formfutura` carried Sunlu's brand id (`51857` → `53043`), and `GIANTARN` / `Prusa` were spellings the reference data doesn't use (`GIANTARM` / `Prusament`); `eSun` also appeared under two casings. Every brand in the file now resolves to its own id — `data/container_spool/spools_filament.json`.

### Fixed

- **The shop button was missing on a friend's spool.** Its whole point — "where do I buy this?" — matters most on someone else's shelf, but the button was gated owner-only along with "+ Material". It now shows in a friend view too, reading THEIR shared product rather than mine, and only when they actually have a link: with none, the empty-state route is the Reorder card, which is owner-only, so the button is dropped rather than left leading nowhere. "+ Material" stays owner-only — `renderer/inventory.js`.
- **The Search segment showed up while browsing a friend's shelf.** It exists to add a spool to YOUR inventory, so on a friend's account it was an offer the view can't honour (the "+ From Catalogue" button was already gated, the view switch was not). The group and its separator now hide like Printers does, and entering a friend while Search is open bounces you to the inventory grid rather than stranding you in a view whose buttons just disappeared — `renderer/inventory.js`.
- **Adding a spool now shows you the spool.** The Product card's `+` opens the grouped-spools deck for that filament once the write comes back, instead of letting the new spool vanish into the inventory. Keyed by product IDENTITY rather than doc id (the "+ Material" path only returns a count), with `keepSingletons` so the deck opens even for the first spool of that filament — `renderer/inventory.js`.
- **The Product card looked different depending on where it was opened from.** It is one card and one renderer, but the content is built from `p.cloudSeed`: the Search views always hand it a full one (from `product/get`) while a favorite only carries what was captured the day it was starred, and the `+` was gated to catalogue previews. Every product card now renders the same layout — the `+`, the result line and the footer note are unconditional, only the click ROUTE differs (a catalogue preview mints a TigerData+ via `_catalogCreate`, an owned product uses the existing `_createCloudFromProduct`) — and a card whose product carries a real `id_product` tops its seed up from the catalogue on open. The stored product is never mutated: the enriched seed goes into a copy — `renderer/inventory.js`.
- **The Product card hid the catalogue link for anything chipless.** The "Product ID" row (which links to `tigersystem.io/…/catalog/<id>`) was gated on `isPlus`, so a TigerData+ — or a catalogue product previewed from the Search views — never showed it despite carrying a real `id_product`. Gated on the id being real (neither `0` nor `0xFFFFFFFF`) and nothing else — `renderer/inventory.js`.
- **The Favorites list lost its header on scroll.** `.pv-table-wrap` was a bordered box with `overflow: hidden` sitting inside the scrolling view, so the sticky `<thead>` pinned to that never-scrolling box and slid away with the content. It now follows the inventory `.table-wrap` recipe exactly — the bordered, rounded box IS the scroller (`flex: 1; min-height: 0; overflow: auto`) — which pins the header inside it, keeps the corners rounded while scrolling, and lets the fade sit on the element that actually overflows — `renderer/css/70-detail-misc.css`.
- **The Search list squared off its rounded corners on scroll**, same cause: `.cv-table-wrap` was `overflow: visible`, so the sticky header pinned to the outer view and escaped the rounded box. It now keeps `.table-wrap`'s own `overflow: auto` and is the scroller — `renderer/css/70-detail-misc.css`.
- **The Search views could not be scrolled with the wheel.** The page itself never scrolls (`html, body { overflow: hidden }`), so each view has to be its own scroller — `.inv-catalog-view` was missing the `flex: 1; min-height: 0; overflow-y: auto` recipe the other full-height views use, and its list was simply clipped — `renderer/css/70-detail-misc.css`.
- **The printer list had no scroll fade at all.** `renderPrintersView` returns early for the table mode, so the wiring at its end never ran; it now lives inside `_renderPrinterTable`, where `.pt-wrap` actually exists — `renderer/inventory.js`.
- **Printer-list checkboxes painted over the sticky header.** `.pt-head` was `z-index: 1` while the row `.sel-check` is `z-index: 4`, so a row scrolling under the header showed its checkbox on top of it. Raised to 20, the value the inventory table's own thead uses — `renderer/css/40-printers.css`.
- **Catalogue thumbnails showed nothing while loading, and stayed blank on a dead link.** `thumbHTML` renders the photo OR the colour square, never both. The Search table now stacks them like the inventory grid card does — the filament colour paints immediately and remains if the image errors out — and the Product card's illustration carries the colour behind it during load — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.

### i18n

- Added `catalogBtn`, `catalogSearchPh`, `catalogSyncing`, `catalogSyncError`, `catalogCount`, `catalogCreateOk`, `catalogCreateError`, `catalogAdd`, `catalogTypeUnsupported`, `catFilterSeriesPick`, `viewGroupSearch`, `thSeries`, `filterAllSeries`, `stgCatalogResync`, `stgCatalogSyncedAgo`, `stgCatalogNeverSynced`, `gpAdded`, `statCloudPlusMini` — 9 locales (1403 → 1422 keys). The Search views otherwise reuse the app's existing `th*` / `filterAll*` / `sortBy` keys rather than adding near-duplicates.

---

## v2.14.1 — 2026-07-23

### Changed

- **The reorder card's minimum-stock control now matches the buy-link / price buttons.** It was a read-only text field + an always-visible pencil; it is now the same full-width `.ro-shop-btn` (`#roMinBtn`) — a bell icon + "Add a minimum" when empty (click to add), the value when set, with the pencil (`#roMinEdit`) revealed only once a minimum is set and the button flipping to `.ro-shop-btn--active`. Clicking anywhere on the button opens the inline editor, like `#roPriceBtn`. Dropped the now-unused `.ro-price-shown` / `.ro-price-shown--empty` CSS — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.

### Fixed

- **Spool / product thumbnails can no longer be picked up and dragged as a ghost image** in the inventory grid/list or Favorites (no drag is intended there). `<img>` elements are native drag sources by default, so a thumbnail could be grabbed and dragged with no drop, looking broken. Disabled globally via `img { -webkit-user-drag: none }`; every intended drag (rack slots, list/cart reorder, friends) uses a draggable `<div>`/`<span>` handle, never an `<img>`, so nothing else is affected — `renderer/css/00-base.css`.
- **Rack view: the whole panel no longer glows amber while dragging a spool between racks.** Hovering a dragged spool over any empty area of the rack view (gaps between racks, the zone edges) added `rp-view--drop-void` to `#invRackView`, whose `box-shadow: inset 0 0 0 2px rgba(234,179,8,.35)` lit up the entire panel — a "drop here to un-rack" cue that fired constantly during a normal rack-to-rack move. Removed the glow; the void-drop *function* (release on empty space → un-rack) is unchanged, and un-racking also stays available via the unranked side panel and the toolbox "remove from rack" button — `renderer/css/40-printers.css`.
- **Rack view: dragging a spool no longer paints every empty slot orange.** The ambient "drop-zone" treatment gave each empty unlocked slot an orange dashed border + soft-orange fill + a `rp-slot-pulse` animation, so a card full of empty slots read as one big orange glow. Empty slots now stay neutral during a drag; only the slot directly under the cursor (`.rp-slot--drop`) highlights. Locked slots still dim. Also removed the dead `body.is-dragging-spool .rp-rack { transition: box-shadow }` — `renderer/css/30-racks.css`.
- **The `.ttag` import overlay no longer pops up mid-drag when moving a spool in Grid/Rack view (Windows).** The full-window drop hint used `dataTransfer.types.includes("Files")` to tell a real file drag from the storage view's internal spool DnD, but on Windows/Chromium dragging an element containing an `<img>` (a spool thumbnail) leaks `"Files"` into the drag types, so an internal drag was mistaken for a dropped file (intermittent, image-load-dependent; never reproduced on macOS). Added a `dragstart`/`dragend` guard — an OS file drag never fires `dragstart` inside the document, so any active internal drag now suppresses the overlay reliably — `renderer/inventory.js` (`_wireTtagDropZone`).

---

## v2.14.0 — 2026-07-23

### Added

- **`.ttag` inventory interchange — export.** A new "Export .ttag" action in the spool detail toolbox writes a `.ttag` file (`{ format:"tigertag", kind:"ttag", version:1, exportedAt, exportedBy, records[], rfidBackups? }`): the inventory doc(s) carried **verbatim** (Firestore Timestamps normalised to epoch-ms), plus — for a TigerTag+ chip — its signed `rfidList/{chipUid}.backup` doc keyed by chip uid. **Twins are atomic** — exporting one side resolves and includes its `twin_tag_uid` partner (one material → 2 records, never a half-twin). **Invariant #2 enforced** — a legacy `CLOUD_` id is refused (only the current `TigerData_` chipless prefix may leave in a file); `exportedBy` (owner uid) is stamped so import can pre-pick its mode. Own inventory only (hidden in friend view), renderer-side Blob download, filename `brand-material-color.ttag`. Plus a **selection export**: an "Export" toolbar button writes the currently-selected materials (each + twin, deduped, same `CLOUD_` refusal) into one `tigertag-selection-<date>.ttag`, disabled while nothing is selected — `renderer/inventory.js` (`_ttagMaterialRecords`, `_ttagCollectBackups`, `_buildTtag`, `_exportMaterialTtag`, `_exportSelectedTtag`, `_syncTtagExportBtn`).
- **`.ttag` inventory interchange — import (validate → preview → accept).** An "Import" button (inventory toolbar + Settings → Data) opens a source modal that stages `.ttag` sources as removable chips — **Upload files** (multi-select), **Upload from URL** (scheme-checked http(s)), and a drop zone — plus **drag-and-drop a `.ttag` anywhere on the window**. Several files import at once, each keeping its own detected mode (a Restore file and an Import file ride together → the batch reads "mixed"); invalid files are skipped-and-counted (fatal only if all fail). Each source is parsed, **validated** (`format`/`kind`/`version ≤ 1`; rejects non-`.ttag`, newer version, empty) and **sanitised** (untrusted file: non-http(s) URL fields dropped via `_looksLikeUrl`, colour/weight/TD values clamped), then shown in a **preview table** — column headers, a tri-state select-all checkbox, spool thumbnail with twin badge, material, a weight column (value + fill bar) that live-switches to 100 % in Import mode, and a tier badge; per-row include checkboxes (all on by default). The user chooses the add mode (pre-hinted from `exportedBy`, freely switchable, Accept gated until picked): **Restore** rewrites every record verbatim under its original id + restores each TigerTag+ `rfidList` backup; **Import** writes each as a fresh chipless material you own (new `TigerData_` uid, fresh `id_tigertag` nonce, `id_product` unset, `rfidBackup:false`, `twin_tag_uid` remapped, backups dropped, weight reset to full capacity). Batched writes chunked under Firestore's 500 cap, additive in import mode — `renderer/inventory.js` (`openTtagImportPicker`, `_ttagResolveAndPreview`, `_ttagValidate`, `_ttagSanitizeRecord`, `_ttagDetectMode`, `_ttagGroupMaterials`, `_ttagApplyImportAll`, `openTtagImport`), `renderer/inventory.html`, `renderer/css/60-modals.css`.
- **USB scale (Dymo M-series) live weighing.** Plug a Dymo USB scale and spool weights update themselves. The main process opens the HID device (vid `0x0922`, usage page `0x8D`; `node-hid` + electron-rebuild), decodes frames (status/unit/exponent, oz/lb→g), polls hot-plug every 5 s, and streams `usb-scale-update` / `usb-scale-data` over IPC (+ `usb-scale:state` seed, preload `onUsbScaleUpdate` / `onUsbScaleData` / `getUsbScaleState`). Renderer module `IoT/usbscale/` runs a one-write-per-pose state machine (≥50 g starts a session; 3 consecutive identical stable frames ≈ 3 s = stabilised): **POD mode** — reader chip UID(s) identify the spool → silent `doWeightUpdate` (gross→net via `container_weight`, twin synced), cancelled if the UID set changes; **side-card mode** — a detail panel open with no chip → an inline confirm card (missing container routes to the container picker). The live UI lives inside the side card's WEIGHT section (`#usbScaleDock`; 1 Hz frames patch the grams node in place); a disconnected scale shows an "asleep — tap to wake" hint, gated behind `_everConnected`. Live readout uses a real Dymo product photo (`assets/img/spool_filament/dymo_usb_scale.png`), which also replaces the container-weight modal illustration. 14 i18n keys × 9 locales — `main.js`, `preload.js`, `renderer/IoT/usbscale/`, `renderer/inventory.js`, `renderer/inventory.html`.
- **Dymo M5 USB-scale protocol playground** (dev-only) — a standalone `node-hid` reader validating the HID protocol (vid `0x0922`/pid `0x8009`, 6-byte reports at ~1 Hz) before the integration — `playground/dymo-m5/`.

### Changed

- **The chipless `protocol` value is now `TigerData`, not `TigerCloud`.** `normalizeRow` computes `protocol: "TigerData"` for chipless spools (display, filter, and — via `syncSpoolMirrors` — the stored doc field), so the raw doc matches its `TigerData_` id; the cloud stat tile filters on `"TigerData"`. Hub aligned (`lib/data/inventory.ts`). **One value deliberately stays `TigerCloud`: the `byProtocol` telemetry rollup key** in the stats Cloud Function (derived from the id prefix, kept stable to avoid fragmenting historical analytics) — `renderer/inventory.js`, `llms.txt`.
- **Chipless spool ids migrate silently from `CLOUD_` to `TigerData_` on login.** Client-side (not a server sweep, which would rename docs under clients that still read `TigerData_` as a real chip): a chipless doc is self-contained, so each migration is an atomic id-rename (`create TigerData_<suffix>` + `delete CLOUD_<suffix>` in one batch, `uid` field renamed, `updatedAt` preserved). Idempotent, guarded against double-fire, runs in the inventory snapshot handler beside the decimal→hex and rack migrations — `renderer/inventory.js`.
- **The reorder / "To order" card's "Add a price" control** is now a full-width icon+label button matching "Add a buy link": it shows the account's currency symbol (`_vatInfo().symbol`) in place of an icon when empty, and switches to the value + a pencil edit affordance once a price is set (`.ro-shop-btn` / `.ro-price-cur` / `#roPriceBtn`, `_reorderUpdatePriceDisplay`) — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **A "+ Material" (manually-entered spool) now starts at full weight (100 % capacity).** A brand-new filament entered by hand is a full spool, so `weight_available` is seeded from `measure_gr`/`measure` at creation — `renderer/inventory.js`.

### Fixed

- **Rack view: couldn't scroll to off-screen racks while dragging a spool (Windows).** During an HTML5 drag, Windows/Chromium blocks the wheel and doesn't auto-scroll the inner rack column (`.rp-racks-scroll`). Added a cursor-driven **edge auto-scroll** (within 64 px of the top/bottom edge → 16 px/frame), started on drag and stopped on drop/dragend, **gated to non-macOS** so it never doubles macOS's native drag-scroll — `renderer/inventory.js` (`_wireRackAutoScroll`).
- **Rack view: the "outside a rack" drop zone no longer lights up orange** across the whole card while dragging a spool. The ambient `primary`/`primary-soft` glow + `rpDropInvite` pulse on `.rp-unranked-empty` was removed; the zone still shows and accepts the unrack drop, it just stays neutral — `renderer/css/30-racks.css`.
- **The reorder / "To order" side card couldn't be scrolled.** Its `.panel-body` was only as tall as its content (the base `flex:1` was lost when `display:flex` was overridden), so the "+ Add material" row and the lower fields were unreachable — and squashed on a short panel. The body now fills the panel's flex column and scrolls (`flex:1; min-height:0`, `24px` bottom padding to clear the debug pill), with `> * { flex-shrink:0 }` keeping the rows at their natural height — `renderer/css/70-detail-misc.css`.
- **The multi-select "Select" button didn't appear on launch** — it only showed after switching views, because the boot restore didn't set the `sel-btn-view` body class that `setViewMode` normally applies. Boot now toggles it for grid/printer views — `renderer/inventory.js`.
- **Grouped-deck side-card: click-to-toggle + no auto-open during multi-select.** Clicking an inventory row/card opens the grouped deck and clicking it again closes it (`_toggleGroupPanelForSpool`); in multi-select the deck no longer pops open on each pick — the checkbox selects, the row/card body toggles the deck. Grid view is now iso with the table (per-card checkbox selects, card click toggles the deck) — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.

---

## v2.13.1 — 2026-07-21

### Added

- **Length-limit feedback.** A `[maxlength]` field silently swallowed the over-the-limit keystroke; it now shakes (`fieldBump` keyframe) so the rejection is seen — the desktop analogue of a phone's haptic "no". One delegated `beforeinput` listener + `bumpField()` covers every `[maxlength]` input/textarea (present and future), firing only on a genuinely rejected insert (accounts for selected text a keystroke/paste would replace). Honours `prefers-reduced-motion` (a `--danger-soft` border flash instead of movement) — `renderer/inventory.js`, `renderer/css/00-base.css`.
- **Debug-only reader readout** in the TigerPOD modal (admin/`state.debugEnabled` only), replacing the removed "I own a TigerPOD" toggle. Shows the readers the app currently treats as **active** (name + chip UID or "empty") and the account TigerPOD telemetry (`current` vs `max` reader count, `hasPod`). Reads live state and repaints on reader plug/unplug, card present/removed, and telemetry hydration (`hydratePodSignal`) — `renderer/inventory.js`.
- **`docs/TTAG-EXPORT-BRIEF.md`, `docs/READER-SELECTION-BRIEF.md`, `docs/REVIEW-BRIEF.md`** — frozen implementation/audit briefs (`.ttag` inventory backup format; per-reader active/inactive selection panel; standing read-only review scope). `docs/reviews/` now keeps one permanent file per code review.
- **`assets-src/img/partners/`** — retail-box photos from eSun, SUNLU and ROSA3D whose spools carry the TigerTag badge (masters only, not bundled).

### Changed

- **New chipless spools mint a `TigerData_` id prefix** (was `CLOUD_`). The prefix is a discriminator, not a display value: rather than migrate existing docs, `_isChiplessId` now accepts **both** prefixes forever. The same both-prefixes generalisation was applied across the ecosystem — mobile (`main_inventory.dart`), Hub (`lib/data/inventory.ts`), the stats Cloud Function (`functions/index.js`) — and documented (`llms.txt`, backend README). Studio has one discriminator point (`normalizeRow`) and one mint point (`_adpCloudId`).
- **The stock-value tile shows its HT/TTC qualifier on the price line** (`236.60 € excl. tax`), not under the label. The figure is wrapped in `.sb-stat-num` so the count-up tween no longer wipes the suffix; the qualifier has its own colour so the up/down tint never tints it.
- **The Add-Product "NFC Data" preview label is now "TigerData"**; the rack **"Subtitle" field is now "Description"** (both value-only, 9 locales). **List name/occasion capped at 40** characters (were 80/60).
- **Documented that URL fields are attacker-controlled** (`buyUrl`, `attachments[].url`, inventory `Link*`, `publicLists` items) — the Firestore rules cannot filter string contents, so every client scheme-checks at render; written into `docs/firestore-schema.md`, the backend README and the third-party integration guide, and the mobile app + Hub `cleanUrl` were aligned. README gained a *"A sandbox, not the product"* section; `llms.txt` Firestore map completed (24 collections) and `docs:check` now validates it plus image paths.

### Fixed

- **Two stored-XSS holes reachable from another user's data** (2026-07-19 review). `esc()` escapes HTML but never validated the URL scheme, so `javascript:`/`file://`/`smb://` passed through friend-supplied product links and attachments untouched. New `safeHref()` (composes `_looksLikeUrl` + `esc`) collapses any non-http(s) value to `#`, applied at all 8 `href` sites. In the main process `isSafeExternalUrl()` gates every `shell.openExternal`, plus a `will-navigate` lock — a renderer foothold can no longer hand the OS a `file://` or leave the app origin.
- **`img:get` SSRF with readback** — it fetched a Firestore-sourced image URL (incl. a friend's `photoURL`) with no validation/timeout and served the body back. Now refuses non-public destinations (resolves the hostname first; rejects loopback/RFC1918/link-local/CGNAT/IPv6-ULA), re-validates each redirect hop, 8 s deadline.
- **A YubiKey (or other Yubico security key) is no longer treated as an RFID reader** — over USB it exposes a PC/SC CCID interface, so `nfc-pcsc` enumerated it like an ACR122U. The reader-registration gate skips names matching `yubico`/`yubikey` (kept narrow; the reader-selection panel is the general control).
- **Printer connections no longer leak on account switch / sign-out** — `unsubscribePrinters` now sweeps Snapmaker, FlashForge and Creality (was Elegoo/Bambu/Anycubic only), stopping the Creality camera with its socket.
- **`_checkLowStockNotifs` no longer re-scans the inventory per product** on every render (now one `_stockCountByKey()` pass).
- **The Add-Product NFC Data preview is filled on open** (was empty until the first field change — the refresh ran before the section un-hid). **Calibration "How to measure" step badges sit at the top of every card** (`align-items: flex-start` + a 2px optical nudge) regardless of caption wrap.

### Removed

- **The "I own a TigerPOD" toggle** and its `tigerPodOwn*` i18n keys / `.tigerpod-own-card` CSS. `hasPod` is telemetry-only, auto-set on the first successful scan, so the manual toggle was redundant; the auto-set and the 1-or-2-reader write path are untouched.

---

## v2.13.0 — 2026-07-19

### Added

- **Per-account container-weight calibration.** The bundled catalogue (`data/container_spool/spools_filament.json`) carries manufacturer empty-weights; a user who actually weighs their spool can now correct the figure. A pencil sits to the LEFT of the weight in the "Choose a container" side-card (discreet until the row is hovered) and opens a dedicated **calibration modal** (`#cwModalOverlay`): the container shown large (photo + brand/type), the value as a grouped `[− value +]` stepper with the unit inside, a "How to measure" strip, an amber strip naming how many spools inherit the weight, a catalogue-vs-yours comparison whose right-hand figure follows the field as you type, and a save-mode choice.
  - Stored in a NEW **`users/{uid}/containerOverrides/{containerId}`** doc (`{ containerWeight, updatedAt }`; owner-only rule added to `firestore.rules` and deployed) and applied over the bundled JSON **at read time — the JSON is never modified**.
  - Resolution happens in `containerFind()`, the single accessor every consumer already routes through, so the corrected weight reaches the picker, the detail panel and future spool writes at once.
  - Each spool stores a *snapshot* of the weight it was given, so a correction does not reach existing spools on its own. The **"When saving"** choice ("Update all N spools with this value" — the default — or "Keep current spool values") is offered before committing rather than as a second screen; the alignment runs after the dialog closes and is twin-mirrored so both chips of one physical spool stay in agreement. It only writes to spools whose weight actually differs, so leaving it on when nothing changed costs nothing. Shown/hidden **once on open** rather than live against the typed value: a live gate resized the modal mid-typing.
  - The **"How to measure" strip** reads as an equation — the container's photo **+** the cardboard core **=** the scale. The middle term and its joint drop out for containers with no core (`type` ≠ Masterspool), the remaining joint flips `+` → `=` and the last step renumbers, so the equation stays true. Operators are plain white discs sitting as flex items *between* the cards; `margin: calc(-1 * (var(--op-size) + var(--how-gap)) / 2)` gives a disc a net flow width of exactly `-gap`, so the cards keep their spacing while the disc centres on the gap's midpoint (0.0000 px offset). New assets `oem_carton_core.png` and `oem_kitchen_scale.png`, cropped on an **alpha threshold of ~24, not 1** — a render's diffuse shadow carries a couple of alpha units across most of the canvas, so a threshold-1 trim framed a 1017×590 subject in a 1492×1023 box.
  - Picker rows became `div[role=button]` (a `<button>` cannot legally contain the edit `<button>`), with Enter/Space selection restored — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/60-modals.css`, `renderer/css/70-detail-misc.css`, backend `firestore.rules`. i18n: 23 new keys × 9 locales.
- **`npm run docs:check`** — a validator for the documentation facts that restate the code, wired into the pre-commit hook beside `i18n:check` and `codemap:check`. Several docs repeat numbers the code owns (version, renderer line count, printer-brand count, i18n key count, folder paths) and rot silently: `llms.txt`, the file an agent reads first, had reached **v1.8.2 / ~12 000 lines / 5 brands** against a real v2.12.0 / 28 500 / 6, with Anycubic missing from its protocol table entirely. It compares each stated fact to its source of truth (with tolerances where the number moves constantly), flags doc references to paths that no longer exist, skips templates and globs, and never reviews prose — `scripts/check-docs-drift.mjs`, `.githooks/pre-commit`, `package.json`, `CLAUDE.md`.
- **`assets-src/`** — one versioned home for every full-resolution image that must never be bundled (`build.files` is an allowlist and does not list it), mirroring each asset's path under `assets/`. Optimising an asset in place destroys its original; this gives it somewhere to live first, so a later re-export starts from the master rather than an already-compressed file. **`brand/` was folded into it** and removed: both existed for the same reason, and the "does the app load it?" distinction was not worth a second folder — `assets-src/README.md`.
- **`.circle-center`** — a utility for content optically centred in a round badge (`renderer/css/00-base.css`). `flex + align-items:center` drifts on numerals: it centres the *line box*, whose height includes ascender and descender, and a digit has no descender; an inherited line-height worsens it and monospace faces worst of all. The utility uses `place-items:center` on a grid, `line-height:1`, `tabular-nums` so a counter never widens between 1 and 11, and a `.06em` nudge for the half-descender digits never use.

### Changed

- **The fully-digital tier is now displayed as "TigerData"** (was "TigerCloud") — a **display-only** rebrand covering the spool badge, the header stat tile, the encode-flow title, the protocol quick-filter, `statCloud` / `productCloudCreated` in all 9 locales, README / `FEATURES.md` / `ROADMAP.md`, and the browsable What's New history (29 strings across 8 past versions — that modal is live UI, not an archive).
  - **The stored value stays `TigerCloud` wherever it is data**: the Firestore `protocol` field written by `normalizeRow` and `syncSpoolMirrors`, the stat tile's `filter: "TigerCloud"`, every filter comparison, and the backend's `byProtocol` map key. Renaming any of those would silently orphan the tier for every existing spool of every user; `docs/firestore-schema.md` now carries an explicit warning beside the field.
  - `populateOneQuickFilter` gained an optional `labelOf` projection so an option's **value** stays the stored string while its visible text changes.
  - Frozen records keep the original wording (`CHANGELOG.md`, `data/release-notes/*`, `DEVLOG.md`). Tiger Hub was updated in the same pass (separate repo); the backend repo is untouched and no data migration was run.
- **The three tier badges reworked — order, geometry and colour.** Tiles now follow the capability ladder, **TigerData → TigerTag → TigerTag+**. The three share one capsule (18 px, fully rounded, 1 px hairline border, 10 px/650 type) and one construction borrowed from the wishlist buy button (`.lv-buy`): a top-lit vertical gradient, a matching border, dark type. Only the metal changes — white → silver → gold. `.tag-diy` was `--surface-2` on `--muted`, a grey pill on a grey card and effectively invisible; `.tag-plus` moved off orange, which frees the app's ACTION colour (a tier badge wearing the same orange as every button competed with every call to action); `.tag-cloud` dropped a purple picked years ago only to "differ from orange". All three clear **WCAG AA**. An earlier faux-metal pass (five-stop gradient + text-shadow) was abandoned: it simulated a material in an otherwise flat UI and read as dull beige at 10 px.
- **The "Stock value" tile states whether it is excl. or incl. tax.** The figure already followed the account's HT/TTC preference but never named it, and the two readings differ by the VAT rate. Reuses the existing `reorderHT` / `reorderTTC` wording. It must sit on the tile's `label` (rendered as HTML) and not on `mini`, which is piped into a `data-mini` attribute — that attribute is now escaped so markup there can no longer break the card.
- **The inventory's "Protocol" filter is labelled "Type"** in all 9 locales (`filterShortProtocol` plus the hardcoded HTML fallback). The key name is unchanged — it still filters the `protocol` field.
- **No dimming scrim behind the "Add product" side-card**, matching the rack editor. Both are editors acting on the inventory behind them, not blocking dialogs. The overlay stays in the DOM and keeps its `pointer-events`, so click-outside still closes.
- **Ecosystem cross-links + `llms.txt` refresh.** README now points TigerPOD at its own repository in both the ecosystem table and its section; `llms.txt` was corrected on every drifted fact and gained an **Ecosystem repositories** table plus `FEATURES.md` / `CODEMAP-main.md` in its docs list.

### Fixed

- **Custom links were not stored at all.** Attaching a link is the only entry point that can fire on a product with no `users/{uid}/products/{keyHash}` doc yet — every other `_writeProductField` caller acts on an already-created product. It created a doc carrying just `{updatedAt, attachments}` with **no `key` / `label` / `cloudSeed` identity**, and its optimistic local update is guarded by `if (rec)`, so with no record in `state.products` nothing was applied and the immediate re-render read back an empty product: the link vanished on save. Both attachment writes now go through `_writeProduct(r, …)`, which seeds the identity from the row, and that writer's optimistic patch covers `attachments` and creates the local record when missing. Not a rules problem — `products` has no field whitelist.
- **The custom-colour swatch's pencil vanished on a white or pale colour** in the Add-product picker. The icon was hardcoded white with a double drop-shadow halo trying to keep it legible on any background — a workaround that failed on light colours and read as a smudge on the rest. It now flips black/white against the swatch via `readableTextOn()`, the same relative-luminance helper the avatars use; the halo is gone.
- **Stepper − / + buttons did not fill their control.** The global `button { height: 40px }` is more than a default here: neither `.cw-step` nor `.rec-step` set a height, so both sat top-aligned inside a taller wrapper with a hover fill stopping short of the edges — visible on the calibration stepper and latent on the rack side-card's. Both now use `height: auto` + `align-self: stretch`.

---

## v2.12.0 — 2026-07-18

### Added

- **First-connection profile onboarding — a two-step flow, now run once by EVERY account.** The old "choose your display name" modal became a 520 px portrait card with a floating step counter + dot-line-dot progress, big centred titles and the ecosystem hero illustration. **Step 1 — Language**: the 9 locales in one app-styled dropdown (`_enhanceSelect`, native names only — a flag is a country, not a language); picking one applies immediately and persists via `saveAccountLang` (local account + `users/{uid}/prefs/app.lang`, shared with the mobile app). **Step 2 — Profile**: a 118 px avatar preview that is never empty (glossy sphere treatment over the account gradient, live initials following the typed name, user-icon placeholder when there are none), a "Generate another colour" shuffle and an "Import a photo" pick→crop→upload flow; the name field enforces 3–20 characters with a green check past the minimum. Steps slide horizontally (`.dns-track`), the hidden step is `inert`, `prefers-reduced-motion` disables the motion, and the flow is non-dismissible by design. Gating moved from "the display name is empty" to a version flag in a NEW per-application state doc `users/{uid}/apps/studio.onboardingVersion` compared against a code constant `ONBOARDING_VERSION` — so existing named accounts run it once too, and a future revamp re-runs everyone by bumping the constant. The doc is deliberately neither the shared root user doc nor `telemetry/studio` (whose `studio*` fields stay on the root so the Hub and Cloud Functions keep aggregating them cheaply across users); owner-only rule `match /users/{userId}/apps/{appId}` added and deployed — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/70-detail-misc.css`, backend `firestore.rules`.
- **Product web-link attachments.** Links-only attachments carried by the product identity (`users/{uid}/products/{keyHash}.attachments: [{url,label,kind}]`), shared across every spool of that filament and tier-gated **free 1 / plus 2 / premium 5**. Server-enforced: `linkLimit()` caps the array on the `products` write from the owner's `users/{uid}.tier`, and `roles` + `tier` became server-only on the user doc — which also closes a self-promotion hole (`roles:"admin"` → read `adminStats`). Renderer: `state.tier` read in `syncUserDoc`, `LINK_LIMITS`/`_linkLimit()` as the UI mirror of the rule, `_attachmentsOf`/`_attachKind`/`_sanitizeAttachments`, and `attachments` handled by both product writers. UI: a **"Custom links"** field in the product side-card with a `count/limit` badge, each link rendered as a buy-link-style button + edit pencil, a dedicated modal (`#attachModalOverlay`) for add/edit/delete with URL validation (`_looksLikeUrl` — http/https + a plausible host), a locked "+1" teaser at the plan limit, and a `kind`-based icon (pdf/video/image/link). Read-only display in the spool detail panel and the product card, resolved through `_displayProduct` so a friend's inventory shows it — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/`.
- **Product info (ⓘ) button on the spool detail side-card**, left-aligned on the row that carries the add-to-list / cart / favourite toggles, toggling the reorder card beside the panel (`_toggleReorderPanel`). Added at the detail panel's call site rather than inside the shared `_flagTogglesHTML()` helper, which also feeds the reorder card's own header; wired through a delegated handler so it survives the panel's surgical section rebuilds. The product card's own ⓘ moved to match (it was last in its row), and its `.pc-flags` container was aligned with `.pi-flags` — a `flex-shrink: 0` there would have beaten `.pi-flags`'s `flex: 1` on source order. All three product side-cards now share one layout — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **Clear (✕) button in the rack view's "not stored" search field**, reusing the `.inv-search-clear` component. Clearing dispatches a synthetic `input` event so the list, the side count and the view tile all refresh through the single existing handler, and it fires on `mousedown` so it lands before the field's own blur reset could remove it from under the cursor — `renderer/inventory.js`, `renderer/css/30-racks.css`.
- **Optional subtitle on racks** — a second line under the rack name (`subtitle` on `users/{uid}/racks/{rackId}`; no rules change, `racks` writes are owner-only and unwhitelisted), read/written through `openRackEditModal` / `createRack` / `updateRack` and rendered as a muted ellipsised line in the Storage header. Added to BOTH rack render signatures (`_rackViewSig()` **and** `_rackStructureSig()`) — without the latter the in-place slot patch (`_tryPatchRackSlots`) succeeded as a no-op and skipped the header rebuild — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/30-racks.css`.
- **Filament colour editing is back, for TigerCloud spools only.** The detail panel's colour circle is a button again (`#btnEditColor`, "+" fading in on hover) opening `openColorEditModal`, gated on `r.isCloud` and own-view: a TigerCloud spool is fully digital so its colour lives in Firestore (`online_color_list` + `color_r/g/b`, twin-mirrored) and can be re-edited, whereas a burned TigerTag/TigerTag+ chip stays read-only. Unlike the toolbox "measure colour" action this entry point needs no connected TD1S — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.

### Changed

- **Signed-out welcome screen rebuilt.** `#signInPlaceholder` said what the app *is*, never what it does for you. The flat gradient "T" square is replaced by the `Hero-TigerSystem-ecosystem` illustration, the reused login subtitle by a benefit-first tagline (title 22→26 px), and three plain claims with real masked icons (NFC scan / live printers / sharing) sit UNDER the call to action so the button stays the first thing reachable. The Sign-in button gained an accent shadow with hover-lift/press states, the GitHub / Discord pills were demoted (spaced apart, dimmed to .75), and the TigerPOD line-up banner closes the screen. Both artworks are capped by viewport height (`38vh` hero, `16vh` banner, the banner hidden under 760 px) so neither can ever push the Sign-in button out of reach — `renderer/inventory.html`, `renderer/css/70-detail-misc.css`.
- **The login modal never opens by itself.** All four automatic openings were dropped — cold start with no saved account, the active account's session expiring, and both sign-out branches. The app lands on the signed-out welcome screen instead, whose Sign-in button opens the modal. Remaining call sites are all direct responses to a click, including picking an account whose session has expired (kept on purpose: the click would otherwise appear to do nothing) — `renderer/inventory.js`.
- **Login modal header stripped and re-anchored.** The branded hero (gradient "T" tile + title + subtitle) and the language selector are gone; the card opens on the ecosystem hero (capped at `26vh`) followed straight by "Continue with Google". Language stays reachable from Settings and the onboarding step — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/60-modals.css`.
- **"New rack / Edit rack" is now a RIGHT SIDE-CARD**, matching the material / printer / Add-product panels: `.panel-overlay` (`#rackEditOverlay`, click-outside still closes, but with **no scrim** so the Storage grid stays readable), the `»` close tab (`#rackEditCloseTab`, glued via `_setTab`) and an `<aside class="detail-panel rec-panel">`. Opening it closes every other side card first. Its content was glued to the edges because the global `.panel-body { padding: 0 0 24px }` (70-detail-misc.css, loaded after 60-modals.css) beat `.rec-body` on source order — fixed with a `--rec-side-padding` token and 3-class-deep selectors, the trap the Add-product panel already documents — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/60-modals.css`.
- **Rack side-card restructured into three numbered steps.** *1 Identity* — Name and Subtitle with an icon inside each field (new `icon_rack_grid.svg` / `icon_pin.svg`) and tightened limits (name 60→**20**, subtitle 80→**30**, so a rack header always fits one line). *2 Layout* — the two dimensions became one grouped `[− value +]` stepper each, side by side. *3 Preview* — a live slot grid redrawn as the numbers change (`renderRackPreview()`, guarded by an `LxP` + occupancy signature), echoing the rack's name/subtitle and, when editing, filling occupied slots with the same artwork the Storage view draws (`_slotInnerHTML`). Slot geometry matches the real grid (4 px / 6 px gaps, `min(5px, 22%)` radius so dense racks don't round into dots) — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/60-modals.css`.
- **Rack presets removed entirely.** The preset picker (Box 6 / Mini / Standard / Extended / Custom) and its illustration are gone, along with everything that existed only for it: `renderRackPresets()`, `state.rackPresets`, the `data/rack-presets.json` fetch **and the file**, the `.rec-preset*` / `.rec-presets*` / `.rec-dim-row` CSS, the `rackPreset` / `rackPresetCustom` keys and the now-meaningless header subtitle. Four artworks became dead and were deleted (`Panda_Feed_Rack_Mini/Standard/Extended.png`, `Box_6_Spools.png`) — **−2.1 MB** off the build; `Panda_Feed_Rack.png` stays, it is still the "no racks yet" empty state — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/60-modals.css`, `data/`, `assets/img/`.
- **The rack grid reads top-down.** Level 0 — "A" — is the TOP shelf, so **A1 is the top-left slot** and the grid reads like text; new levels append at the bottom. The render loop and the auto-fill placement loop were both flipped from descending to ascending so they stay in step. Stored data is untouched (`rack.level` indexes unchanged): this only remaps a level index to a row, so existing spools keep their slot and appear mirrored vertically.
- **The search field's ✕ replaces the magnifier instead of sitting beside it** — main search bar and the rack view's "not stored" filter alike. One glyph, always in the same spot, so nothing shifts as you type and the field keeps a single padding; the magnifier is hidden purely in CSS off the button's own `hidden` attribute, so there is no second state to sync. The main button's `title=` tooltip was dropped (project rule: `aria-label` only) and localised via `data-i18n-aria` — `renderer/inventory.html`, `renderer/css/70-detail-misc.css`, `renderer/css/30-racks.css`.
- **Avatar colour on account creation — random HSL, generated once.** The onboarding no longer picks from the 13-swatch palette: one random colour is generated in HSL (hue 0–360, S 65–85 %, L 42–58 % → vivid but legible) and converted to HEX (`generateRandomAvatarColor`/`hslToHex`). Generated once when the profile step opens (never re-rolled on typing or re-render), re-rolled only by the button, saved as the account's custom HEX (`customColor` + `color_r/g/b`) so future launches and Tiger Hub read it back, and kept as the fallback when a photo is imported. Initials text colour is auto-contrasted by relative luminance (`readableTextOn`, threshold 0.58).
- **Avatar initials — new shared contract** (`getInitials`): trim + collapse spaces + ignore punctuation; **≥2 words → first letter of the first two** (Benoît Michaut → BM); **1 word → its first two characters** (Benoît → BE, previously just "B"); accents preserved (Łukasz → ŁU). The gradient still derives from `acc.color`, never the name, so typing never shuffles the colour. Mirrored in the mobile app and Tiger Hub.
- **Avatar cropper — desktop-native interaction polish.** Mouse-wheel + trackpad-pinch zoom on the image (the slider becomes its secondary mirror), Enter/Escape/Delete keys, double-click to reset, Apply focused on open, a darker crop scrim (55 → 66 %), and **free rotation** via a −180…180° slider with a detent at 0°. `clampPan` was generalised from the 0/90/180/270° width/height swap to a rotated-bounding-box constraint (circle inside rotated rectangle) so any angle keeps the crop covered with no empty corner — verified to match the old formula exactly at the cardinals. Apply is idempotent so keyboard and click can't double-fire — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/60-modals.css`.
- **To-order line actions reworked.** "Stop tracking" as a text link is gone: every line (cart and "saved for later") carries a trailing ✕ icon with a 1 s hold — the single way to drop a line. The text link is now the MOVE action only ("Save for later" / "Move to cart"), and the saved shelf shows its own informational subtotal. The **cart-＋ button became add-only**: pressing it on a product already listed takes you to the To-order view and flashes "Already in your cart" (`_flashMessage`, a new minimal global snackbar) instead of silently un-listing it; removal happens only from that view, whose hold now clears `liked` too. The saved shelf is no longer rendered at 82 % opacity — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`, `renderer/css/00-base.css`.
- **App icon rebuilt from the founder's new master artwork** (overflow style). All three targets regenerated from `logo_tiger_icon_overflow.svg`: `icon.icns` (full 16→1024 iconset via iconutil), `icon.ico` (7 sizes) and `icon.png` (1024², corner transparency verified). The three neutral masters (overflow / contained / square — no wordmark) live in the repo, plus a branded trio carrying the "TIGER TAG" wordmark — `assets/img/`, `assets/svg/logos/`.
- **Splash-screen logo replaced** (`logo_tigertag_head.svg`; the previous contour artwork kept as `logo_tigertag_contouring_head.svg`, its in-app usages repointed). Bigger title (16 → 22 px, weight 700) and a squash-and-stretch drop with two decaying rebounds, then a gentle float. Kept compositor-only so it stays smooth while startup pegs the CPU: the animation lives on a `translate3d`-promoted wrapper while the drop-shadow filter stays static on the svg (animating a filtered element re-rasterises the filter every frame), and the splash window sets `backgroundThrottling:false` — `assets/svg/logos/`, `renderer/css/70-detail-misc.css`, `renderer/inventory.js`, `main.js`.
- **New ecosystem hero artwork** (`Hero-TigerSystem-ecosystem.png`, transparent) replaces the laptop+phone mockup everywhere it was used. Its aspect ratio is far taller than the old one (1.41 vs 1.82), so every usage got a `max-height` + `object-fit: contain` guard. A cut-out TigerPOD line-up banner (`hero-TigerPOD-Banner-Lineup-Rainbow-9.png`, ~3:1 with alpha) was added to the TigerPOD discovery modal and the welcome screen; the 7-colour variant stays a brand-only asset in `brand/` (not bundled) — `renderer/inventory.html`, `renderer/inventory.js`, `renderer/css/`.

### Fixed

- **Custom links weren't being stored.** Attaching a link is the only entry point that can fire on a product with no `products/{keyHash}` doc yet — every other `_writeProductField` caller acts on an already-created product. Two consequences: the write created a doc carrying just `{updatedAt, attachments}` with **no `key`/`label`/`cloudSeed` identity**, and the optimistic local update (guarded by `if (rec)`) was skipped, so the immediate `_refreshAttachField()` re-render read back an empty product and the link vanished on save. Both attachment writes now go through `_writeProduct(r, …)`, which seeds the identity from the row, and `_writeProduct`'s optimistic patch covers `attachments` and creates the local record when missing. Not a rules problem — `products` has no field whitelist — `renderer/inventory.js`.
- **The "not stored" filter cleared itself when you racked a spool.** The text lived only in the DOM input, and every inventory snapshot rebuilds the rack view with `innerHTML` (scroll was preserved there, the search value wasn't). It is now mirrored in `_unrackedSearch`, which `getUnrackedSpools()` reads from, re-emitted as the input's `value` on rebuild with focus and caret restored. It clears in exactly one case: when racking the last spool matching the term would leave an empty list under a term that no longer selects anything — a term typed with no match goes through the input handler rather than the rebuild, so a typo is never erased mid-keystroke — `renderer/inventory.js`.
- **Searches that match nothing now reset when you leave the field.** While the caret is in the field the term is kept (so a typo can be corrected); on blur an empty result set clears it, because a dead search is otherwise an unexplained empty view. Emptiness is read from the signal each view already computes rather than re-deriving the predicate: `#invEmpty` for the grid/table, all `[data-printer-key]` hidden for the printer views, the **top-level** `.pv-empty` for Favorites and To-order (To-order also renders a `.pv-empty--inline` hint inside each drop zone, which must not count), `.lv-rows > .pv-empty` for Lists (its top-level empty states mean "no lists at all"), and the absence of any `.rp-slot--match` in the Storage view, which dims non-matches instead of emptying — `renderer/inventory.js`.
- **Onboarding step 2 showed initials even when the account already had an avatar.** The preview does pass the photo, but the modal opens earlier in `syncUserDoc()` than the `userProfiles/{uid}` read that resolves `state.photoURL`, so an account with no cached avatar was painted with initials and never revisited. The preview is repainted when that read lands; accounts already hydrated from cache don't repaint, so there is no flicker.
- **Onboarding deleted a just-imported avatar photo** when the user shuffled a colour after importing: the flow tracked a `_dnsAvatarMode` and called `removeCustomAvatar()` on finish if the mode was "generated". Reworked to a non-destructive model — an imported photo always wins, the generated colour is only its fallback, and nothing is ever deleted.
- **Onboarding avatar initials stayed stuck on the saved pseudo while typing a new one.** `_paintDnsAvatar` passed the account object *including its `id`*, and `_avatarSubject()` treats a source whose id matches the active account as "the live user", resolving the name as `state.displayName || source.displayName`. The preview source now omits `id` and passes `photoURL` explicitly.
- **The avatar cropper opened BEHIND the onboarding modal.** All `.modal-overlay` share z-index 9999 so DOM order decided the stacking; the cropper is a tool modal opened from other modals and now sits at 10000 — `renderer/css/60-modals.css`.
- **An open "Product info" card kept describing the previous product** when you switched products in the product side-card — only the reverse link existed. `openProductCard` now re-seeds it in place (`_reorderRow` + `_renderReorderPanel`) rather than through `openReorderPanel`, which would replay the open animation and steal focus; `_productCardData` is assigned first so the reverse stale-card guard can't close the card that just opened. The product card's ⓘ also **toggles** now (it called `openReorderPanel` unconditionally), matching the spool detail and grouped-spools cards.
- **The Add-product `»` close tab left the colour picker floating over nothing** — it was the only close path calling the bare `closeAddProductPanel()`, while the ✕, Cancel and click-outside all use `_adpCloseAllSheetsAndPanel()`. It now closes on **pointer release** rather than `click`, so any press duration works: the tab re-pins to the panel's live edge every frame, so a press that drifted lost its click and the button felt dead. Pointer capture binds the gesture to the tab; no hold timer (one would fire mid-press and tear the panel down while it was still animating). The `click` listener stays for keyboard activation, guarded against double-firing.
- **The rack subtitle didn't refresh on edit** — fixing `_rackViewSig()` alone wasn't enough: `_rackStructureSig()` feeds `_tryPatchRackSlots`, which succeeded as a no-op and skipped the header rebuild.
- **Clicking a header stat card (TigerTag / TigerTag+ / TigerCloud) filtered the inventory and desynced the protocol dropdown.** The handler assigned `#typeFilter.value` directly, but that `<select>` is wrapped by `_enhanceSelect`, whose visible button only refreshes on a real change event. The mini-dashboard is now informational only; protocol filtering stays in the controls beside the search field — `renderer/inventory.js`, `renderer/css/00-base.css`.
- **"Add price" did nothing in the Favorites GRID** (it worked in the table): the card rendered the prompt as an inert `<span>` with no `data-addprice`, so the click fell through to opening the card. It now carries the attribute, kept as plain text with `role="button"`, and opens the Product-info side-card straight into the focused price editor.
- **Debug "⌥-click a card → copy ref" pill stayed visible after turning Debug off** — its id-level `display: inline-flex` outranked the UA `[hidden]` rule, so `hidden = true` had no effect — `renderer/css/70-detail-misc.css`.
- **Adding a Snapmaker U1 in LAN mode failed with "save failed".** Nothing tests the printer at add time — the Firestore write was being rejected (`invalid-argument`): in LAN mode the scan's `discovery` bundle carries `undefined` / nested-array values Firestore refuses. The bundle is now deep-cleaned before the write (`_fireSafe`), and the error message appends the technical code so a payload rejection no longer masquerades as a network problem.
- **The `»` close tabs now stay glued to their side card while it slides.** They were separate fixed elements animating `right` over `dock-offset + width` in the same .25 s the card slid only its own width, so on stacked cards the tab visibly outran its panel. `_setTab` now takes the panel element and pins the tab to its LIVE left edge every frame (rAF + `getBoundingClientRect`) — same speed by construction for open, close, dock shifts and live resizes; all 16 call sites pass their panel.
- Opening **"Add product"** now closes every other side card first, and it carries the same `»` close tab as the rest.
- **To-order: clicking a line toggles its product card** — a second click on the same line closes it, a click on another swaps to that product.
- **The reorder / "Product info" card updates its header thumbnail live** when a custom image is set on the displayed spool: the card only auto-refreshed on product snapshots, but the header uses the spool's `imgUrl` and `_reorderRow` was a stale reference.

### Removed

- `data/rack-presets.json` and the four rack preset artworks (see *Rack presets removed entirely*).
- i18n: `loginSignInTitle`, `loginCreateTitle`, `loginSignInSubtitle`, `loginCreateSubtitle` (orphaned by the login-modal header removal), `rackPreset`, `rackPresetCustom`, `rackEditSub`, `setupNameTitle` — 9 locales.

---

## v2.11.3 — 2026-07-15

### Changed

- **Twin-spool repair — source of truth is now the most-recently-updated chip.** The one-shot reconciliation (`reconcileTwinFields`) previously took whichever chip the inventory *displayed* (the smaller-UID one `deduplicateTwins` keeps) as authoritative. It now picks the chip with the greater `updatedAt` — the one you touched last (a fresh weigh-in, a just-set container) — so a conflict resolves to your latest intent even when the displayed chip held a stale value; ties fall back to the displayed chip for determinism. `updatedAt` parsing handles a live Firestore `Timestamp`, the serialized `{seconds}` / `{_seconds}` forms and a raw epoch — `renderer/inventory.js`.
- **Twin repair now guards on product identity and breaks bad links.** A pair is force-synced only when both chips share the same `_spoolGroupKey` (`id_product` for Tiger Tag+, brand/material/colour/aspect for maker). Two chips that are genuinely *different* products were mis-linked (see the auto-linker fix below); the pass now clears `twin_tag_uid` on both docs so they become independent spools again — timestamp-neutral, counted as `unlinked` and shown in the Debug repair line. This stops one spool's fields overwriting an unrelated one's, and un-merges two different products that were shown (and valued) as one — `renderer/inventory.js`.
- **Spool detail panel — storage-location card redesigned.** The auto-store control is now an icon-only button: a larger (16 px) sparkle with an `aria-label` (no text label, no hover title), a clear hover state (soft-primary background + border, icon turns primary and scales up), and — via `:has()` — hovering it lights up the whole location card (border, fill, label, box icon) so it is obvious what the action will fill. The not-stored status is a one-word label ("Unracked" / "Non rangée" / …) instead of "Pas rangée dans un rack". `icon_sparkle.svg` was redrawn from a magic-wand-plus-sparkles into a filled **3-star "AI" glyph** (also used by the rack autofill menu item) — `renderer/inventory.js`, `renderer/css/10-settings.css`, `assets/svg/icons/icon_sparkle.svg`.

### Fixed

- **The two chips of a twin spool now agree on remaining weight and container weight.** The repair mirrored image / container-id / rack / tags / note between twins but never the **weight**, so one physical spool's two chips could report different grams (e.g. 194 g vs 1000 g) — making the stock value swing with whichever chip was displayed, and diverge between your view and a friend's. Weight (`weight_available`) and container weight are now aligned to the freshest chip (timestamp-neutral); the container field compares `container_weight`, not just `container_id`, so a weight-only drift is repaired. Repair flag bumped to `tigertag.twinFix.v5.*` so every account re-runs the pass once — `renderer/inventory.js` (`reconcileTwinFields`, `_TWIN_FIELDS`).
- **The twin auto-linker no longer merges two different products.** `autoLinkTwinsByTimestamp` paired chips by `id_tigertag` + chip-timestamp proximity (≤ 2 s) alone, so two unrelated spools programmed seconds apart at the factory were glued into one twin — and re-glued on every snapshot, undoing the repair's unlink. It now also requires an identical `_spoolGroupKey`. This is the root cause of the mis-linked pairs the repair breaks — `renderer/inventory.js`.
- **The twin repair is now idempotent on the rack slot.** The rack field compared both the modern `rack` object and the legacy flat `rack_id`, but the copy only ever wrote the object, so a pair with mixed shapes never converged and the repair rewrote it on every pass (the "docs filled" count ping-ponging on repeated Debug runs). Comparison now uses a canonical slot key (`_twinRackSlot`) tolerant of both shapes — `renderer/inventory.js`.
- **The detail panel reflects an auto-store immediately, and surgically.** Clicking "Ranger auto" wrote only the `rack` field (no timestamp), which `_rowSignature` ignores, so the "Emplacement" section did not repaint until the panel was reopened; forcing a full rebuild instead reset the panel scroll (a visible jump to the top) and reloaded the image/video. The structural signature is now split into a core (everything except the slot) and a location signature, so a location-only change swaps just the `.panel-storage-loc` node and re-wires it (`_patchDetailLocation` / `_wireStorageLoc`), leaving scroll and media intact — `renderer/inventory.js`.

## v2.11.2 — 2026-07-15

### Changed

- **The twin-spool repair now also resolves conflicts, not just fills gaps.** v2.11.1's one-shot repair copied a spool's custom data (image, container, rack, tags, note) onto its twin's *hollow* chip, but left genuine conflicts — the two chips carrying a *different* container or image, each set before the mirror existed — untouched. Some of those differed in container **weight**, so the displayed net weight depended on which chip the inventory happened to show. The repair now treats the twin the inventory actually **displays** (the one `deduplicateTwins` keeps — chosen before the sort, so independent of the user's sort column) as the source of truth: its fields overwrite the other chip's, resolving conflicts to exactly what the user sees (a hollow displayed chip is still filled from its twin). Re-armed for accounts that already ran the earlier pass (`tigertag.twinFix.v2.*`); still timestamp-neutral (never writes the chip `timestamp` or `updatedAt`) — `renderer/inventory.js` (`reconcileTwinFields`).

## v2.11.1 — 2026-07-15

### Added

- **Groundwork for an upcoming stats & history dashboard.** Studio now records anonymous, aggregated usage and stock data — **no personal information, no location** — so a future release can chart your inventory's evolution over time (value, spools, materials, tag types) and its breakdowns. No visible change in this version yet.
- **New `cart-plus` icon** — a cart with a **＋**, drawn in the same style as the existing cart, used to mark the "add to your To-order list" action apart from the plain "buy at the shop" cart.

### Changed

- **The "add to To-order" action and the "buy at the shop" action no longer share the same cart glyph.** They were indistinguishable side by side (notably on the product card, where they sit inches apart). The add-to-list action (the ❤ "To order" toggles across the product card / spool detail panel / grouped-spools side-card, the bulk "To order" button, the state badge on the illustration, and the To-order quick filter) now uses the **cart-＋** glyph; every buy link and purchase-source header keeps the plain cart. The To-order view tab and empty-cart illustrations keep the plain cart too (they depict the cart itself, not the "add" action) — `renderer/inventory.js`, `renderer/inventory.html`, `renderer/css/70-detail-misc.css`, `assets/svg/icons/icon_cart_plus.svg`.

### Fixed

- **A twin-tag spool (two linked NFC chips) could open the wrong side-card, showing blank/reset details.** A twin spool is two independent inventory docs (one per chip); the per-spool custom data (custom image, container) was saved on only one, leaving the other "hollow", and a scan could open the card on the hollow chip — glaring on plain Tiger Tag (per-chip image/container), invisible on Tiger Tag+ (shared catalogue data). Three-part fix: custom image and container now **mirror onto the twin** at write time (via `_updateSpoolTwinned`), joining the weight / rack / tags that already did; the scan-open guard treats the second chip as the same spool when it shares the open card's product identity (`_spoolGroupKey`), gated to the ~1.6 s twin-arrival burst so a later scan of a different identical spool still opens its own card (no added delay, instant open preserved); and a one-shot repair (`reconcileTwinFields`, fill-gaps only — never overwrites a present value) fixes existing inconsistent twins once per account, re-runnable from an admin Debug button that reports the count. The repair is timestamp-neutral (writes neither the chip `timestamp` nor `updatedAt`) — `renderer/inventory.js`, `renderer/inventory.html`.
- **A friend's "Stock value" was far too low.** `_getProduct(r)` resolves against your OWN product records, but in friend-view the rows are the friend's spools, so the value loop skipped every spool for which you had no priced product of your own — collapsing the total to the intersection of your two shelves (and the price column / price sort showed "-" for the friend's spools). Added `_displayProduct(r)` (the friend's products in friend-view, yours otherwise) and switched the six "displayed price" sites to it; the friend-products snapshot now also re-runs the stats + inventory render so a late arrival no longer leaves the value stuck. `_getProduct()` stays yours where it must (❤/★ toggles, min stock, tags…) — `renderer/inventory.js` (`_displayProduct`, `renderStats`, `subscribeFriendProducts`).

## v2.11.0 — 2026-07-14

### Added

- **"To order" line — "Stop tracking" action to drop an item from the reorder list.** Each cart / saved-shelf line gains a press-and-hold "Stop tracking" button (1 s, red fill sweep) that resets the product's `minStockSpools` to 0, which clears the whole reorder state (`minStockSpools` / `savedForLater` / `orderQty` via `FieldValue.delete`) and removes the line from the To-order view entirely. Hold-to-confirm (a plain click is swallowed) since it discards the min-stock setting — `renderer/inventory.js` (`_orderLineHTML` `stopLink` + `.hold-progress`, wired via `setupHoldToConfirm(btn, 1000, → _writeProductField(hash, { minStockSpools: 0 }))`), `renderer/css/70-detail-misc.css` (`.pv-move-link--stop`).
- **"To order" cart — each purchase source is its own card with a subtotal footer.** The cart, previously one continuous list with sticky source headers, now renders each purchase source (buy-link host) as a separate bordered card: header (source + count), its lines, then a subtotal footer (Σ unit price × qty over its priced items, in the account's HT/TTC mode, shown only when the group has ≥1 priced item) tagged with a localised HT / TTC label (`reorderHT` / `reorderTTC`). Complements the global Payment card — `renderer/inventory.js` (`_renderOrderTab`: `.pv-cart-card` + `.pv-cart-card-foot`, cart zone → `.pv-cart-cards`), `renderer/css/70-detail-misc.css`.
- **"To order" cart — reorder the purchase-source cards by drag-and-drop.** Each source card's header carries a grip; dragging it reorders the source groups (persisted in `localStorage tigertag.cartSrcOrder`). The no-link card stays pinned last; new sources appear after the saved ones (alphabetical). Reuses the shared make-room DnD helper gated to `.pv-cart-grip` so it never collides with the within-card line reorder (`.pv-grip`) — `renderer/inventory.js` (`_getCartSrcOrder` / `_setCartSrcOrder`, `_cartKeys` sort, `_wireMakeRoomDnd` on `#invProductsView`), `renderer/css/70-detail-misc.css`.
- **"To order" cart — a personal note per purchase source.** Each source card gains an editable free-text note under its header (amber strip when set, a quiet "Add a note" prompt when empty). Inline edit (Enter saves, Shift+Enter newline, Escape cancels); stored locally keyed by host (`tigertag.cartSrcNotes`) so it follows a reordered card. Owner-only (read-only in friend-view) — `renderer/inventory.js` (`_getCartSrcNotes` / `_setCartSrcNote` / `_startCartNoteEdit`), `renderer/css/70-detail-misc.css` (`.pv-cart-note*`). New `cartAddNote` / `cartNotePh` i18n.
- **Loading spinner on the Favorites / To-order, Lists and Storage views.** These views read Firestore subscriptions, so before the first snapshot they briefly flashed "nothing here" / "no lists yet" / "no racks yet". Added `state.productsLoading` / `state.listsLoading` / `state.racksLoading` (default true; set true again whenever the matching subscription (re)starts, until its first snapshot); the render functions now show the shared `.inv-loading` spinner while loading and fall through to the data / empty illustration only once it has arrived. Storage gates on `state.racksLoading` (own) / `state.invLoading` (friend, racks come with the one-shot friend read). A denied/errored read drops the spinner instead of spinning forever — `renderer/inventory.js` (`subscribeProducts` / `subscribeLists` / `subscribeRacks` + friend variants, `renderProductsView`, `renderListsView`, `renderRackView`, `switchBackToOwnView`). New `loadingGeneric` i18n.

### Changed

- **Grouped-spools side-card — one icon-only action row with favourite + to-order toggles; shown in friend-view too.** The deck panel now exposes the same flag toggles as the product card: Product-info (left), then add-to-cart (❤ "to order"), favourite (★) and add-to-a-list (＋) grouped on the right, each a `.flag-toggle` reflecting/writing via `_toggleProductFlag`. The three toggles also render in friend-view (importing the friend's product into your account — provenance + price/link carried by `_toggleProductFlag`), without the Product-info button (owner-only, as are the below-min-stock alert + read-only note); with no info button they stay right-aligned (`justify-content: flex-end`). The old text "Add to a list" row and the standalone Buy button are gone — `renderer/inventory.js` (`_renderGroupPanelContents`), `renderer/css/70-detail-misc.css` (`.gp-actions--flags`).
- **"Add to a list" works in friend-view — it adds a friend's material to one of your own lists.** The lists flow was owner-gated. The "Add to a list" popup now always targets your own lists (new `_ownLists` / `_ownListsArray` / `_ownListHas`, used for the popup rows + tick state instead of `_listsSource()` which flips to the friend's lists in friend-view), and picking a list imports the friend's product into your account first (carrying their price / buy link / SKU-EAN + stamping provenance, like favouriting) before `arrayUnion`-ing its key to your list; creating a new list on the spot works too. Removed the `state.friendView` early-returns on `_addToList` / `_removeFromList` / `_createList` / `openCreateListModal` / `_submitCreateList` / `_openAddToListMenu` (all write to your own account via `getActiveId`; the Lists-view edit/new controls stay unrendered in friend-view, so no friend list can be mutated). The ＋ button now shows in friend-view on the grouped-spools side-card and the spool detail panel too, not just the product card — `renderer/inventory.js` (`_flagTogglesHTML`, `_renderGroupPanelContents`, `_addToList`, `_openAddToListMenu`).
- **Loading animation restyled to a comet-trail loader + playful phrase carousel.** The shared `.inv-loading-spin` is now a rotating comet (five `box-shadow` dots forming a fading tail; `load6` + a dedicated `round` 0°→360° keyframe, adapted from Luke Haas' css-loaders, MIT; brand-orange). Under it, a carousel of playful phrases slides in from the right and out to the left, one at a time, edges fading through a gradient mask; phrase order shuffled (Fisher-Yates) each time the loader first appears. All loading states share one `_loadingHTML()` helper, shown via `_showLoading(host)` which only builds the loader when absent — so a re-render while still loading no longer restarts the spinner + carousel — `renderer/inventory.js` (`_loadingHTML` + render sites), `renderer/css/70-detail-misc.css` (`.inv-loading-spin`, `load6`, `.ld-phrases`), `renderer/css/40-printers.css`. New `loadingFun1`–`loadingFun4` i18n.
- **Product card — the buy link sits under the price, styled like the reorder card's shop button.** The buy link, previously a detached grey button below the price section, now lives inside the same price section (directly under the price line) and adopts the reorder / To-order card's active-shop-button look — Shopify green with a white cart icon + shop name — for a consistent buy affordance across the two side-cards — `renderer/inventory.js` (`_renderProductCard`), `renderer/css/70-detail-misc.css` (`.pc-buy`, `.pc-rows`).
- **"To order" view — the Payment card top-aligns with the first source card** (a `margin-top` matching the "Panier" section-title height, reset in the stacked mobile layout) — `renderer/css/70-detail-misc.css` (`.pv-order-side`).
- **Open-list Details card — the Event (gift) and Message (mail) icons are larger** (`icon-16` instead of `icon-12`) — `renderer/inventory.js` (`infoCardHTML`).

### Fixed

- **Right-click menu (Cut / Copy / Paste / Select All) now follows the in-app language, not the OS locale.** The native context menu was built in the main process from Electron `role`s, whose labels come from the OS locale. The renderer now pushes the translated labels to the main process on startup and on every language change (new `app:ctx-menu-labels` IPC + `electronAPI.setContextMenuLabels`), and the menu overrides each role's label with them (role default until the first push) — `main.js`, `preload.js`, `renderer/inventory.js` (`applyTranslations`). New `ctxCut` / `ctxCopy` / `ctxPaste` / `ctxSelectAll` i18n.
- **Lists count badge lingered on the wrong context (own ↔ friend).** The context-aware count pill was only refreshed by the lists snapshots — which don't fire on a view switch, and never fire when a friend's lists read is denied or arrives empty — so it kept the previous count (your own when opening such a friend; the friend's after returning). Recomputed at both transitions: `switchBackToOwnView` from your own lists after clearing friend-view, and `subscribeFriendLists` up front from the reset friend context before the async snapshot — `renderer/inventory.js`.
- **Friend with an empty inventory — the decorative rack lingered after leaving the Storage view.** Switching from the Storage view to table/grid on a friend with no stock left the empty-rack illustration (+ its stats pill and unranked side-panel, all inside `#invRackView`) visible behind the empty state. The friend-view empty-inventory branch of `renderInventory` hid the table/grid containers but not `#invRackView` (nor the printer/products/lists containers); it now hides them all, mirroring the own-view branch — `renderer/inventory.js` (`renderInventory`).
- **Sidebar "Mobile Apps" QR flashed a broken-image icon on cold start.** The QR `<img>` ships with no `src` (generated locally and set after the module loads), so the browser's broken-image placeholder + "QR" alt text flashed for a beat on launch. The image is now hidden until it has a `src` (`.sb-qr-img:not([src])`), its fixed box keeping the layout stable — `renderer/css/10-settings.css`.

## v2.10.0 — 2026-07-13

### Added

- **Drag-and-drop organisation of the "Your lists" sidebar.** Owners can reorder their lists by dragging (persisted `sortRank`) AND drag a list from one visibility group to another (Private / Friends / Public) to **change its type** — the drop reconciles the public snapshot automatically (publish on → public / tear down on → private, via the existing lists-snapshot sync). All three groups always render as drop zones (grab-grip per row; an empty group shows a dashed "Drop a list here" hint that lights up while dragging). Three-zone "make-room" DnD mirroring the cart, optimistic re-render + batched Firestore write (`_applyListDrop` / `_persistListOrder` / `_listZoneIdsFromDom`, delegated on `#invListsView`). Friend-view stays read-only — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`. New `listTypeDropHint` i18n (9 locales).
- **Info button in the product side-card → opens the in-app reorder / To-order side-card.** The product business card (`openProductCard`) gains an info button next to add-to-list / cart / favourite that opens the product's reorder side-card (`openReorderPanel` — editable price / buy-link / min-stock) **alongside the card, without closing it** (both stack via `_syncPanels`). Owner-only. The external TigerTag catalogue link stays as a clickable "Product ID" row — `renderer/inventory.js` (`_renderProductCard`, `#productCardBody` wiring), `renderer/css/70-detail-misc.css` (`.flag-toggle--info`). New `productInfoPage` i18n (9 locales).
- **Debug "copy view ref" tool (admin debug mode only).** With debug mode on, ⌥(Alt)-clicking any card / panel / view copies a paste-ready descriptor to the clipboard — the current view mode (+ friend-view), the surface (human name · DOM id · render function · file, via a `_DBG_SURFACES` registry tagging every side-card panel), the data ids in scope (product hash, list id, selected spool/list), one `openCard:` line per open side-card, and the clicked element. A hint pill (`#dbgRefHint`) plus a per-panel `.dbg-card-btn` (kept alive by a MutationObserver) copy the current/that card's ref; confirmed with the shared "Copied!" flash. Admin-only, English-only — `renderer/inventory.js` (`_dbgBuildRef` / `_dbgRefHintSync` in `applyDebugMode`), `renderer/css/70-detail-misc.css`.

### Changed

- **Open-list view reworked into a "Details" recap card + a slimmer header.** A right-rail `.lv-info-card` above the Payment summary now consolidates the list's meta: a header ("Details" + an icon-only **Manage list** button), a two-up strip with the **type** (a gradient pill badge) and the **item count**, then **event** and **message** rows. Fields use bare coloured accent icons (no rounded-square icon boxes). The view header is reduced to the list name — the type badge, item-count pill and edit action all moved into the card. Removed the now-unused `.lv-actions` / `.lv-act` / `.lv-count` / `.lv-occasion` / `.lv-message` — `renderer/inventory.js` (`renderListsView`, `infoCardHTML`), `renderer/css/70-detail-misc.css`.
- **A single gradient "type badge" identifies list visibility everywhere.** One pill badge family (like the TigerTag+ / TigerCloud badges — gradient fill, white icon + label, one colour per type: purple Private / blue Friends / green Public) is used across the sidebar group headers, the Details card, and (as coloured cards) the create/edit type selector. The Private glyph is the eye-off used elsewhere (the padlock read as "encrypted"); Friends = person; Public = globe — `renderer/inventory.js` (`_listVisMeta`), `renderer/css/70-detail-misc.css`, `renderer/css/60-modals.css` (per-type `--vc`), `renderer/inventory.html`.
- **The "Your lists" sidebar is grouped by visibility** (Private / Friends / Public), each group a badge header + drop zone; the "Create a list" button moved to the top. The **Public** icon changed from an eye to a globe across the group header, the title badge and the public-share card — `renderer/inventory.js` (`renderListsView`), `renderer/css/70-detail-misc.css`.
- **Create/edit-list modal reworked around the list type.** The visibility choice moved from a bottom dropdown to a prominent 3-card segmented selector (icon + title + description) under the name; new-list default is now **Private** (was Friends). The message field is always shown but reframes by type — "Message for your friends" (shared) vs "A note to future you" (private). The old `<select id="clmVisibility">` became a hidden input driven by the cards — `renderer/inventory.html`, `renderer/inventory.js` (`_clmSetVis`, `_submitCreateList`), `renderer/css/60-modals.css`.
- **"To order" view: clicking a material opens the product side-card.** A click on the material (thumbnail / name / row body) now opens the product business card (`openProductCard`), the same entry point as a wishlist row (before, a line-body click did nothing). The ⓘ button still opens the reorder side-card; the quantity selector, drag grip, buy / add-price / copy-SKU and set-aside controls keep their behaviour — `renderer/inventory.js` (`.pv-order-line` branch of the `#invProductsView` handler).
- **List row layout tightened — per-item actions moved to the right of the row.** The quantity selector + buy-link + remove button used to stack as a fourth line under the thumbnail/title/price block (~140px rows); they now sit on the right, vertically centred on one line, so height is driven by the thumbnail (~113px, ‑20%). No element resized — `.lv-row-actions` lifted out of `.lv-row-body`, `.lv-row` gets `align-items:center` — `renderer/inventory.js` (`_listRowHTML`), `renderer/css/70-detail-misc.css`.
- **List grid card: the buy-link button moved below the quantity** (own full-width row) and a long shop domain now ellipsizes inside the button instead of overflowing (`.lv-buy-txt` `min-width:0` + `text-overflow:ellipsis`; `.lv-card-buybar` stacks) — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`.
- **Disambiguated the two meanings of "items" on the open-list screen.** The Details card counts distinct products while the Payment summary sums quantities — the shared word made "3" and "17" look contradictory. The Payment quantity counter (`pvItems`, used by the list and To-order summaries) is renamed to **"units"** (unités / Einheiten / unidades / unità / szt. …) — `renderer/inventory.js`, 9 locales.

### Fixed

- **Cam view showed the same Creality camera for every connected Creality.** The Creality WebRTC widget was a global singleton — one peer connection, one stream, and a consumer set populated by `document.querySelectorAll(".cre-cam-video")` regardless of which printer each `<video>` belonged to; the cam wall also only started the stream for `crePrinters[0]`. So every Creality card received the first/last-started printer's feed (the sidecard looked correct only because it shows one video at a time). Reworked to keep **one WebRTC session per printer IP** (`_sessions` map), route each `<video>` to its session via a new `data-cre-ip` tag, start a session for **every** online Creality, and stop sessions per-IP (disconnecting one no longer tears down the others); the reconnect path stamps `data-cre-ip` on the sidecard video (the panel isn't rebuilt on reconnect) — `renderer/printers/creality/widget_camera.js` (rewrite), `renderer/inventory.js`, `renderer/printers/creality/index.js`, `renderer/printers/context.js`.
- **Lists view couldn't scroll with many items — each column now scrolls on its own.** The open-list view grew with its content but `#card-inv` clips overflow, so a long list (or tall right rail) was cut off. The view now fills the remaining height and splits into three independently-scrolling columns (sidebar, item list with a pinned header, right rail), mirroring the products view's `flex:1; min-height:0; overflow-y:auto` pattern; the rail's `position:sticky` is dropped for its own scroll, and scrollbars are hidden (`scrollbar-width:none`) — `renderer/css/70-detail-misc.css`.
- **Two spools could end up assigned to the same rack slot — now auto-healed + prevented.** Rack-slot uniqueness was client-side only, so a cross-device race or Auto-organize against an incomplete/cache snapshot could drop a second spool onto an occupied slot. Added `healDuplicateSlots(uid)` — on each authoritative, settled SERVER snapshot it detects any slot holding >1 spool-unit (a linked twin pair counts as one) and evicts extras to `rack: null` deterministically (keeps the smallest spoolId) and idempotently. GUARD: auto-store now only runs on a SERVER snapshot (never cache/partial). The evicted spool re-files on the next pass — `renderer/inventory.js` (`healDuplicateSlots` + `subscribeInventory`).
- **Lists view — grid cards now open the product side-card on click, like the rows do.** The click handler only matched `.lv-row[data-hash]`; grid cards (`.lv-card[data-hash]`) fell through. Extended the selector to match both — `renderer/inventory.js`.

### Removed

- **Public-list share card: dropped the "Public link" header row** — the "Copy link" button moved up into its place (top of the card, above the QR) since it already names the action. Dead `.lv-public-title` CSS + the unused `listSharePublicTitle` i18n key removed — `renderer/inventory.js`, `renderer/css/70-detail-misc.css`, 9 locales.

---

## v2.9.1 — 2026-07-13

### Fixed

- **macOS: the "Restart" button after an update download hid the window instead of installing the update.** `autoUpdater.quitAndInstall()` (Squirrel.Mac) emits the `before-quit-for-update` app event, not the regular `before-quit`, so the `_isQuitting` latch stayed `false`; the macOS `close` handler (which hides the window rather than destroying it, to keep the auth/inventory/camera session alive on a red-button close) then called `mainWindow.hide()` instead of letting the window close — the app kept running in the dock and the downloaded update was never applied. `_isQuitting` is now latched on `before-quit-for-update` and set in the `install-update` IPC before `quitAndInstall()`, so the window actually closes and Squirrel installs the update — `main.js`. (The fix only takes effect from the *next* update: a client already on the broken 2.9.0 must quit/relaunch once for 2.9.1 to install.)

### Changed

- **The "What's New" entry for 2.9.1 resurfaces the 2.9.0 highlights** so users the broken macOS updater skipped straight past 2.9.0 still see the wishlist-quantities / per-list totals / cart-by-store / offline-QR / TigerPOD news — `data/whatsnew.json`.

---

## v2.9.0 — 2026-07-13

### Added

- **Per-item quantities in wishlists (Amazon-cart style).** Each list item gains an Amazon-style quantity selector (owner) / read-only `× N` (friend): a dropdown 1–9 + "10+", where picking "10+" swaps to a hand-typed number input (no spinner arrows). The dropdown is a body-appended `#qselPop` positioned in JS (`position: fixed`) so it overlays everything and never clips inside / grows the card; it closes on outside-click, scroll or resize, and blocks drag-reorder while a value is being edited (re-enabled on the next pointer-up). Shared `_qtySelHTML` / `_commitQty` / `_qselOpen` / `_qselClose` widget, reused by the "To order" cart. Quantities persist in a new `itemQty` map (`keyHash → n`, default 1) on the list doc — deep-merged so items don't clobber each other; the payment total and article count multiply by quantity, and the public snapshot (`publicLists/{token}.items[].qty`) carries it. Backend: `itemQty` added to the `lists` `hasOnly()` whitelist (deployed).
- **Payment-summary card in the Lists view** — a right-rail card (Subtotal · N articles, estimated VAT, Total), identical to the "To order" cart's payment card (reuses `.pv-summary` + `pvPayment`/`pvSubtotal`/`pvItems`/`pvTax`/`reorderVat`/`pvOrderTotal`). Total = Σ `buyPriceHt × qty` over priced items, in the account's HT/TTC mode + currency; only rendered when at least one item has a price. Stacked above the public-share card in a new `.lv-rail` right column (works in friend-view). `renderListsView`.
- **The "To order" cart is auto-grouped by purchase source.** The active cart splits into one group per buy-link host (sticky header labelled "atome3d.com", "amazon.fr", … + per-group count); link-less items fall into a "No buy link" group shown last. One drag zone (headers ignored by the make-room reorder), but a drag-reorder inside the cart is constrained to its own group's index range — an item can only be re-ordered among items sharing the same buy source. Cart⇄saved moves (set aside / bring back) and reordering within the saved shelf are unchanged. `_renderOrderTab`. New `reorderNoLink` i18n.
- **QR codes are generated locally (offline) — no external service.** Replaced every `api.qrserver.com` call (public-list card + downloadable PNG, friend-invite card, sidebar mobile-apps QR, onboarding QR cards) with local generation via the vendored `qrcode-generator` (MIT, `renderer/lib/qrcode/qrcode.js`, loaded before `inventory.js`). New `_makeQrDataUrl()` renders the module matrix to a canvas → PNG data URL, no network / no third-party dependency. Sidebar QR init deferred via `queueMicrotask` to avoid a module-init TDZ on the `tigertag.qrStyle` constant.
- **Customisable QR style** — the "Public link" card (owner) gains a 5-preset colour-swatch row; the choice is stored per device (`localStorage tigertag.qrStyle`) and applied to all shareable QRs (public list + friend invite). `_qrStyle` / `_setQrStyle`. New `qrCustomizeLabel` / `qrLogoToggle` i18n. (A centre tiger-head logo option — contouring mark on a white backing, ECC bumped to H — is built but disabled for now: the toggle is hidden and `_qrStyle().logo` is forced `false`; code + `assets/svg/logos/logo_tigertag_head.svg` kept for later.)
- **Download button on the public-list QR code** — a square download button beside "Copy link" on the "Public link" card saves the QR as a high-res PNG via a native Save dialog. The `image:download` IPC now also accepts a `data:` URL (locally-generated QR, decoded + written directly) alongside the remote-URL path. `main.js`, `preload.js`. New `listShareDownloadQr` i18n (aria-label).
- **TigerPOD-owner census — dual ownership signal in `telemetry/studio`.** `hasPod` (boolean): owns a Pod — set by a new "I own a TigerPOD" toggle in the TigerPOD modal, OR auto on the first successful RFID read (not derivable — a declaration can precede any scan). `rfidReadersMax` (1|2): reader count kept at lifetime max. Both seeded at login (`hydratePodSignal`) so the toggle reflects reality and the session never overwrites a stored higher reader count. The RFID badge now opens the TigerPOD modal whether or not a reader is connected. `saveHasPod`; new `tigerPodOwnLabel` / `tigerPodOwnSub` i18n. (Backend rule: `hasPod` added to the `telemetry` `hasOnly()` whitelist with a `is bool` guard — already deployed.)
- **Apple/Bambu-style version carousel in the "What's New" modal** — a page-control of round dots (one per version) in the footer where the active dot is an elongated orange capsule kept permanently centred: the whole track slides under it (animated `translateX`) so browsing back/forth never drifts the pill to an edge, at any position. Fixed 7-slot viewport with faded edges (mask gradient); each dot is a 20×30 px hit target with a small round `::before`. Clicking a dot jumps; the title-bar picker still jumps anywhere; browsing doesn't change the acknowledged version. `_wnRenderDots` / `_wnGoTo`.

### Changed

- **`rfidReadersMax` is recorded on a real read + never lowers.** The Pod reader count is measured on a SUCCESSFUL RFID read (not on reader plug/unplug), and `_telRfidMax` is seeded from the persisted `telemetry/studio.rfidReadersMax` at login so a fresh session can't overwrite a stored higher count.
- **The "To order" cart's quantity control is now the same Amazon-style dropdown selector as the wishlist** (replaced the number input) — dropdown 1–9 + "10+" (→ free-entry input), persisting an explicit `orderQty` override. Removed the old `.pv-qty-input` + its change handler. The cart buy button reverted to a green icon-only square (the shop domain now lives in the group header); removed the `.pv-buy-host` domain label. New `pvQty` i18n.
- **Hover tooltips are now comic-style speech bubbles.** The shared `#toolInfoPop` (detail-panel action buttons — add-to-list / cart / favourite — and the ⓘ icons) gained a tail that points at the hovered control (flips up when the bubble sits below), rounder corners, bolder centred text, a pop-in animation; `_showToolInfoTip` sets `--tail-x` so the tail tracks the control even when the bubble is clamped to the viewport edge. Product-card flags moved from native `title=` to `data-tip=` so they get the bubble too. Still no native `title` tooltips.
- **Switching the top view SEGMENT resets the active search + filters.** Moving between Inventory / Favorites / Lists / Printers clears the search box and Brand/Material/Aspect/Tag/flag filters (they belong to the segment you left); switching WITHIN a segment (grid↔table↔cart) keeps them. `_clearSearchFilters` now also refreshes each filter's custom dropdown button (`sel._cselRefresh()`) so the styled `.csel-btn` label resets too.
- **The "What's New" version picker now uses the app's custom dropdown** (`_enhanceSelect`) instead of the OS-native `<select>` — same app-styled option list as the inventory filters; compact titlebar pill, list opens right-aligned so it isn't clipped by the window's rounded overflow, label refreshes when the version list is (re)populated.
- **The "Public link" share card now also shows when viewing a friend's public list** — the public snapshot link is world-readable, so a friend's public list exposes the same QR + copy-link + download + social-share card (dropped the `!ro` gate).
- **Friend-invite share link now points to `tigersystem.io/friend/<code>`** (was `cdn.tigertag.io/friend/<code>`) — the TigerHub public web landing page. All three link sites (Friends-panel share button, banner Share badge, social-share intent + QR) route through a single `_friendShareUrl()`; renamed `LIST_PUBLIC_BASE` → `PUBLIC_WEB_BASE` (shared host for `/wishlist/<token>` and `/friend/<code>`).
- **The banner "Share" badge shows the same "Copied!" flash pill as copying a SKU / EAN** (`_flashCopied`) instead of swapping its own label; `.fvb-badge--share` is now `position: relative` to anchor the flash.
- **The ❤ "Like/Love" product flag is now an "Add to cart" action** with the shopping-cart glyph — same behaviour (adds to the "To order" cart, forces min stock ≥1 via `_coupleFlags`), rebranded to match the "To order" view selector. Every `liked` render swapped `icon-heart`/`icon-heart-fill` → `icon-cart` (detail toggle, product-card toggle, illustration badge, sidebar quick-filter, bulk button); on-state conveyed via the `.active` tint. Active/badge/filter colour is cart green `#5e8e3e` (off the heart-pink and off the To-order red, which now stays only on the cart count badge). Labels reworded to the add-to-cart concept.

### Fixed

- **False "low stock" notification fired at launch even when the spool was in stock.** `_checkLowStockNotifs()` runs on every `renderInventory()`, including the initial loading pass — before the first snapshot `state.rows` is empty, so every product with a minimum counted as 0-in-stock and a persisted "low stock 0/min" notification was pushed (and stayed, since notifications aren't deleted). The check now bails while `state.invLoading` is true or `state.inventory` is null.
- **Friend / follower count didn't update live when someone added you.** `_renderFriendsEverywhere()` repainted the friends list + badge but never the header banner where the count lives, so gaining a friend/follower (e.g. auto-accept on a public account) left the number stale until an unrelated repaint. It now also calls `renderFriendBanner()` (signature-guarded).

### Removed

- **The cart "has a buy link" badge on product illustrations** — the small `prod-badge--shop` cart icon overlaid on a thumbnail whenever it had a `buyUrl` (cluttered the illustrations; the buy link still shows as the "amazon.fr"-style buy button). Dropped from `_productBadgesHTML`; removed the `.prod-badge--shop` CSS and the `reorderHasLink` i18n key.

### i18n

- Added: `listShareDownloadQr`, `pvQty`, `qrCustomizeLabel`, `qrLogoToggle`, `reorderNoLink`, `tigerPodOwnLabel`, `tigerPodOwnSub` — 9 locales.
- Removed: `reorderHasLink` — 9 locales.
- Changed: `productLike` ("Liked" → "To order"), `bulkLike` ("Love" → "To order"), `productLikeTip` (reworded to the add-to-cart concept) — 9 locales.

---

## v2.8.0 — 2026-07-12

### Added

- **Social-profile links on the account.** The edit-account panel gains a social-links editor (paste any profile URL, add/remove rows, auto-saved). Links are stored as an ordered `socials` array on the private `users/{uid}` doc and mirrored to the public `userProfiles/{uid}.socials` (both owner-write, no rules change). The brand icon is inferred from the URL host (X, Instagram, YouTube, TikTok, Facebook, LinkedIn, Twitch, Discord, GitHub, WhatsApp; globe fallback) — no fixed platform enum. A row of brand-coloured icon links renders on your own banner and a visited friend's banner, and the owner's links ride along in the public wishlist snapshot (`publicLists/{token}.ownerSocials`). New brand SVGs + `.icon-*` classes; `_socialMeta` / `_cleanSocials` / `_socialsRowHTML` helpers + `_renderSocialsEditor` / `_saveSocials` / `_wireSocialsEditor`. New `editSocialsLabel` / `editSocialsPlaceholder` i18n.
- **Friend / follower count on profiles (social proof).** Each account publishes its accepted-friends count to `userProfiles/{uid}.friendsCount`. Friendship is bidirectional, so this equals the number of people who have the account as a friend. A visited friend's banner and the add-friend preview show it; for a public account it reads "followers" (`followerCount`), otherwise "friends" (`friendCount`). Written by the owner's client when the friends list changes, and recounted + written server-side by the `autoAcceptFriendRequestForPublic` Cloud Function for public accounts (offline owner) — `_syncFriendsCountToProfile`.
- **Own account banner shows Public / Private + Share + count.** Your own header now carries the same relationship badges as a friend banner — a green **Public** or a **Private** pill so you see your own status — plus a **Share** badge that copies your invite link, and your own follower/friend count.
- **Friend-view relationship badge + shareable public link.** A visited friend's banner shows one pill next to the name: green **Public** if their inventory is public, else **Friend**. For public accounts a **Share** badge copies that person's invite link (`cdn.tigertag.io/friend/<code>`) to pass on. The visited friend's `publicKey` is read from `userProfiles` on entering the view. New `friendViewPublic` / `friendViewFriend` / `friendShareInvite` i18n; removed the unused `friendViewReadOnly` key.
- **Wishlist count pill on the "Lists" view button** — a small brand-orange badge shows how many lists you have (the friend's shared-list count in friend-view), live-updated from the lists subscription (mirrors the "To order" cart badge) — `_updateListsBadge`.

### Changed

- Split the v2.7.1 "What's New" entry into two topic-scoped items (friends' lists showing / buy-button label) — `data/whatsnew.json`.
- Re-synced `renderer/CODEMAP.md` section line ranges after the social-links additions shifted `inventory.js`.

### Fixed

- **A public friend showed as "Friend" on a cold-start quick-click.** `switchToFriendView` seeded `isPublic` from `state.friends[].isPublic` (populated asynchronously at startup, still empty on a fast click), and the follow-up `userProfiles` read updated `publicKey` / `friendsCount` / `socials` but not `isPublic`, so the banner stayed "Friend" until a manual back-and-forth. The `userProfiles` read now reconciles `isPublic` authoritatively: fixes the banner, heals the cached friend record (next click is instant), and corrects the landing view mode while still loading.
- **Public accounts' follower count was never updated (offline owner).** The count was only published by the owner's client on a friends-list change, but a public account is auto-friended server-side while offline, so its `userProfiles.friendsCount` stayed stale. The `autoAcceptFriendRequestForPublic` Cloud Function now recounts both sides (via a `count()` aggregation) and writes `friendsCount` after every auto-accept; Studio also force-publishes the count when the account is flipped to public.
- **Couldn't reorder friends while viewing a friend.** A too-broad `state.friendView` guard blocked the friends drag-reorder (sidebar chips + Friends panel) in friend-view. Reordering your own friends writes to your own account, so it's now allowed there; the cart / printers / racks reorder stays blocked (friend's read-only data).

## v2.7.1 — 2026-07-12

### Changed

- **Buy-button host label collapses subdomains to the registrable domain** — "eu.store.bambulab.com" → "bambulab.com", "www.amazon.fr" → "amazon.fr" — so long shop hostnames stay short (keeps three labels for known two-level suffixes like `.co.uk`). New `_registrableDomain` helper used by `_buyHost`.

### Fixed

- **A friend's shared lists didn't show in friend-view.** `subscribeFriendLists` ran an unconstrained `collection("lists")` query, which the security rules reject for a non-owner (it could return a `private` list), so the whole query failed and no lists appeared. It now queries `where("visibility", "!=", "private")` to match what the rule allows; the owner's `subscribeLists` backfills legacy lists missing the `visibility` field to `"friends"` so they're included. No rules change.

## v2.7.0 — 2026-07-12

### Added

- **Lists — shareable wishlists.** A new **Lists** view (segment in the view selector): create several named lists, each with an optional **occasion**, a free-text **message to viewers** (≤500 chars), and a **privacy** level. A list stores product identities (`users/{uid}/lists/{listId}`, `itemKeys` → product `keyHash`), so buy links / prices / images come from `products` for free and a list can hold a filament you don't own. Amazon-style layout: a left sidebar of lists (name + count + visibility icon) and a main column of items with a per-view **rows / grid** toggle (persisted in `tigertag.listLayout`). Add filaments to a list from the **Material card**, **Product card** and the **grouped (deck) card** via a shared "Add to a list" popup (`_openAddToListMenu`). Friends see your lists **live** in friend-view (read-only). New `subscribeLists` / `subscribeFriendLists` + CRUD (`_createList` / `_renameList` / `_deleteList` / `_addToList` / `_removeFromList`), `renderListsView`. Backend: `users/{uid}/lists/{listId}` rules block (owner / public / friend read, owner write + `hasOnly` whitelist).
- **List privacy (`visibility`): private / friends / public.** Per-list dropdown in the Manage-list panel, stored as `visibility` on the list. Backend read rule respects it: `private` = owner only, `public` = any signed-in user (+ world via the public snapshot below), `friends`/absent = friends + `isPublic` profiles. A colour-coded status badge (🔒 / 👤 / 👁) shows next to the list title and on each sidebar list; clicking it opens the edit modal.
- **Public wishlist web link (Phase 2 write side).** Setting a list to *Public* mirrors it into a world-readable top-level `publicLists/{token}` snapshot (denormalised, display-only, **no personal note**), so a visitor with **no account** can open it on the web. The token is minted + stored on the list (`publicToken`); the snapshot is kept in sync from the lists **and** products `onSnapshot` (signature-cached — only writes on real change) and deleted when the list leaves Public. The Lists view shows a right-rail **share card**: QR + "Copy link" (no raw URL) + **social share buttons** (Facebook / X / LinkedIn / WhatsApp / Email) that open each network's share intent (or a pre-filled `mailto:`). Base URL is the config const `LIST_PUBLIC_BASE = "https://tigersystem.io"` → links are `https://tigersystem.io/wishlist/<token>`; tokens are 13-char base36. Backend: world-readable `publicLists/{token}` rule (owner-only writes via `ownerUid == auth.uid` + `hasOnly`, existing-owner check on update) + `publicToken` added to the lists whitelist.
- **Public account auto-accepts friends.** A Firestore-trigger Cloud Function (`autoAcceptFriendRequestForPublic`, backend repo) accepts incoming friend requests to a public account **instantly, server-side** (owner offline OK): writes both `friends/{…}` entries, deletes the request, and notifies both sides (`friend_accepted` to the requester, `friend_added` to the owner). Studio suppresses the accept/refuse modal on a public account and renders the new `friend_added` notification.
- **Reorder friends by drag & drop.** The Friends panel rows and the sidebar friend chips are draggable; the order persists as `sortRank` on each `users/{uid}/friends/{fid}` doc and applies everywhere (panel + sidebar kept in sync, cached with the friends list).
- **"Make room" drag animation everywhere.** A shared `_wireMakeRoomDnd(host, opts)` helper: the dragged item is lifted (OS drag image follows) and the others slide (2D `translate`) to open the drop gap. Used by the wishlist items (rows + grid), the reorder cart (two zones — source closes, target opens), the **printers grid**, the **camera wall** (CSS-`order` only — live WebRTC/iframe streams keep running), the **racks** (drag from the head grip via a `handleSel` option; spools stay draggable for storage), and the friends lists. Items are ordered by on-screen position each drag, so it handles wrapping grids and CSS-`order` layouts alike.
- **Right-click context menu** on any editable field (native Cut / Copy / Paste / Select-all, plus Copy on a selection) — `main.js` (`webContents 'context-menu'`).
- **Account stock summary stored server-side.** `recordStudioState` writes the aggregate stock (`valueHt`, `weightG`, `currency`, `spools`) to a `stock` object on the shared root `users/{uid}` doc (for TigerSystem / TigerHub roll-up) as well as `telemetry/studio` (3 new whitelisted fields: `stockValueHt`, `stockWeightG`, `stockCurrency`).

### Changed

- **Buy buttons show the shop's host** (cart icon + e.g. "amazon.fr", "atome3d.com") instead of a generic "Buy", so the destination is visible before clicking. Applied across the wishlist (rows + grid), the Product card, the grouped deck buy button and the Reorder card's shop button (shared `_buyHost()`, hostname minus `www.`).
- **Header stats count-animate** (ticker/odometer roll): on app open they roll up from zero, and later changes tween from the previous value with a brief green (up) / red (down) tint. Respects `prefers-reduced-motion`. The **Stock** weight now shows 2 decimals (locale-aware).
- **Material & Product cards** now put **📋 add-to-list / ❤ like / ★ favorite** in a single right-aligned inline row between the illustration and the name (list button first; above the "Burn/Update NFC" banner on the material card).
- **Material (spool) card** shows the **price + buy link** both as a prominent "Price & buy" block and as Details rows — from the owner's product record or a friend's shared slice.
- **View selector** buttons are **icon-only** (text dropped; a custom hover bubble names each view after a 1 s dwell via a new `data-i18n-aria` attribute); each group's label sits **above** its toggle.
- **Filter dropdowns** show the **short field name** ("Brand", "Material", "Aspect", "Protocol", "Tag", printer "State") when nothing is selected, and a bare **"All" / "Toutes" / "Tous"** reset row (via `data-csel-short` in `_enhanceSelect`).
- **App-update notification is now a cloud event** (`type: "announcement"`, doc id `update-<version>`): it persists, syncs across devices, sits in the feed, opens What's New, and gets a **Restart** button only on the device where the update is downloaded.
- **Removing a wishlist item is hold-to-confirm** (row trash + grid ✕, 1200 ms) so a misclick can't silently drop a product. **Delete-list** is a compact hold-to-confirm trash icon in the modal footer.
- Detail row label `detTwin` renamed "Twin tag" → **"Dual NFC"** to match the `addProductDualLink` button (9 locales).

### Fixed

- **Friend drag order was lost when opening the Friends panel** — `loadFriendsList` rebuilt `state.friends` in Firestore doc-id order, wiping `sortRank`. It now sorts by `sortRank`, and the localStorage cache carries + re-sorts it (no pre-snapshot flash).
- **Lists view didn't hide when switching to Printers/Rack** — the printer & rack branches of both render dispatchers hid the Products view but not the newer Lists view.
- **Side-card z-index** — the Product card painted in front of the group deck (both `z 100`). Re-numbered the cascade to match `_syncPanels` order: detail (101) > container/group (100) > Product (99) > reorder (98).
- **"To order" reorder state got stuck** — un-favoriting kept the min-stock (item stuck in the cart), and a sticky `savedForLater`/`orderQty` kept a re-favorited item out of the cart. Un-favoriting (★ off) now stops reorder tracking; clearing the min (→0) clears the reorder-only fields. `_healProductReorderState` self-heals already-affected accounts on the first products snapshot.
- Changing a material's **image** now also updates its **Favorites grid/table illustration** + product card (syncs `label.imgUrl` + `cloudSeed` on the product doc).
- The header **"Stock value"** stat updates live on a price change and on the **HT↔TTC** switch; added an ⓘ bubble explaining the weight-prorated value.
- Editing a filament's **price or buy link** refreshes the open **material card live** (surgical swap of the "Price & buy" block + Details rows, media preserved).
- Long-pressing the Friends panel's `»` close tab now closes it (the hold action didn't include the Friends slide-in).

### Removed

- Ephemeral local app-update notice (superseded by the cloud notification).

## v2.6.0 — 2026-07-11

Notifications become a persistent, social-style feed (starting with low-stock alerts synced across devices), the inventory table gains an inline "Add price", and the "To order" button gets a live cart badge.

### Added

- **"Add price" in the inventory Table view.** The Price column now shows an inline **Add price** action for filaments with no price (single rows *and* group headers) that opens the product price editor straight into the input; read-only in a friend view.
- **Live cart badge on the "To order" view button** — a red bubble with the number of products currently in the active cart (below min-stock, not set aside), updated on inventory / product / order-view changes (hidden at 0, "99+" past 99).

### Changed

- **Notification centre → persistent, social-style feed (phase 1).** **Low-stock alerts are now Firestore events** (`users/{uid}/notifications`, type `low_stock`) instead of ephemeral local notices: they **persist, sync across devices, carry a time-ago, and stay in history**. One event per genuine dip below min — a per-account `localStorage` active-set re-arms on restock and prevents re-firing while still below (or on app restart). The feed is **capped at 40** (newest first), notifications are **no longer deletable**, event rows are clickable to their action, and a **"Mark all read"** button + open-marks-all-read drop the unread badge to 0 (badge = pending friend requests + unread Firestore; local device notices — community / paxx / app-update — show but don't inflate it). New `_pushNotif` helper; backend `firestore.rules` gains an owner-`create` branch for `["low_stock","community","announcement"]` (deployed). Community/announcement sources land in a later phase.
- Notification centre: material/product illustrations now render as a **rounded square** (matching the cart thumbnails) instead of a circular chip.

### Fixed

- The "Buy me a coffee" notification now uses the official cup SVG and is a proper community nudge — `"coffee"` was missing from the community set, so the entry had no yellow chip and **wasn't clickable** (couldn't open the support page). Now branded + clickable like Discord/Shop.
- Opening the Product-info card (or reorder card) while the notification centre was open no longer leaves the panel on top hiding the card — the notif centre is dismissed first, like the other right-side cards.

### Removed

- Dead `assets/svg/icons/icon_coffee.svg` (feather cup) + its `.icon-coffee` CSS — the coffee cup everywhere now uses the official brand SVG.

## v2.5.0 — 2026-07-11

The reorder list becomes a proper shopping cart (active cart + a "saved for later" shelf, drag-and-drop), filament pricing surfaces across the app (a **Stock Value** stat and a **sortable Price** column), the Add-product panel is reorganised with app-styled dropdowns, every user-facing **"RFID" becomes "NFC"**, and **"Buy me a coffee"** support lands. Plus a batch of fixes.

### Added

- **Reorder "To order" view is now a two-zone cart.** An **active cart** (products below their min-stock) plus a **"saved for later" shelf**. A non-destructive `savedForLater` flag moves a line between zones — either via a text action ("Buy later" / "Add to cart", no ambiguous icon beside the buy-cart) or by **drag-and-drop**: a grip handle reorders within a zone or drags a line across to the other, persisting a per-product `sortRank` (native HTML5 DnD). Both zones stay droppable even when empty; the payment total counts the active cart only.
- **"Stock Value" header stat card** (after "Stock" kg) — the total worth of the current stock in the account's currency: each spool valued at its product's `buyPriceHt`, prorated by remaining-weight fraction, shown in the account's HT/TTC mode.
- **Sortable "Price" column in the inventory Table view** (after Capacity), showing each spool's product price in the account's currency + HT/TTC mode ("-" when unpriced); sortable asc/desc (`sortRows` + `_sortGroupedItems` read the price off the product) with a matching "Price" option in the grid sort select.
- **"Buy me a coffee" support** at four entry points (sidebar button, Settings → About, What's New footer, and a delayed nudge after 3 days of use), using the official Buy Me a Coffee brand assets and the existing community-nudge system (per-account, Firestore-synced).

### Changed

- **Loving a product (❤) forces a minimum stock of ≥1** so it's automatically tracked for reorder and lands in the cart once out of stock. Coupled in `_coupleFlags`; never lowers an existing higher min, and the forced min is carried into the persisted patch so it survives the Firestore echo.
- **Add-product panel reorganised:** Type, Diameter, Weight and Unit are now always visible (below the Nozzle/Drying cards) instead of buried in Advanced; the duplicate advanced Type select was removed (single canonical `adpType`). The plain identity dropdowns (Type, Aspect 1/2, Diameter, Unit) now use the app-styled popup (`_enhanceSelect`) instead of the native OS menu; the "None" material and the TigerTag banner were dropped.
- **Terminology: every user-facing "RFID" is now "NFC"** (the tech is NFC/NTAG) across all 9 locales + the hardcoded UI labels; internal identifiers (i18n keys, IPC channels, Firestore fields, icons, comments) are untouched, and the `OpenRFID` firmware name is preserved verbatim.
- **Header device indicators rebranded + unified:** the NFC-reader pod hover reads **"TigerPOD not connected"**, the scale **"TigerScale not connected"**; the four header status hovers now share one bubble style with a state-coloured dot + full text.
- Windows code-signing CI now targets the rebuilt Azure Trusted Signing account (`TigerTagStudioSigning`, North Europe endpoint); signing stays a no-op until `TRUSTED_SIGNING_CERT_PROFILE` is set (pending Microsoft identity validation of 3D FRANCE).
- The "created" toast now says **TigerCloud** (matching the stats badge).

### Fixed

- Add-product: picking a bicolor/tricolor/rainbow colour mode now updates the visible **Aspect 2** dropdown in real time (the app-styled dropdown's button label wasn't refreshed after a programmatic value set; same fix for the Aspect 1 mirror).
- Add-product: the Material selector now shows **PLA** (the real default) on open instead of a stale **ABS**.
- Reorder: removing a line no longer **deletes the whole product doc** (favorite, buy link, price, SKU/EAN, min-stock) — it moves to "saved for later" instead. The destructive delete path is gone.
- macOS: closing the window with the red button now hides it (Firebase session, inventory and cameras kept alive); a Dock-click brings it straight back instead of leaving an invisible window.
- Opening the Friends panel now closes every other side card instead of stacking them underneath.

### Removed

- The TD1S status icon from the header — TigerPod and TigerScale now sit side by side (TD1S stays reachable via its panel button).
- The "RFID" banner image at the top of the Add-product side card.
- The destructive `_deleteProductByHash()` product-delete path from the reorder view.

## v2.4.0 — 2026-07-10

A read-only Product "business card" for out-of-stock favorites, an Aspect filter, épuré click-to-copy for SKU/EAN, app-styled dropdowns, and a data-model refactor: friends' favorites are now read straight from their `products` (the `productShares` projection is gone). Plus a batch of Product-info card refinements.

### Added

- **Product "business card" side card (`#productCardPanel`).** Clicking a favorite that has **no live spool** (e.g. a friend's favorite they don't stock) opens a read-only card mirroring the **Materials** side card: illustration, identity, **★/❤**, **Colours & Aspect** (56 px circle + aspect chips), a full **Weight** bar (1 kg / 100 %), **Print parameters** (nozzle / bed / drying / TD / density) and **Details** (Product ID, Type, Brand, Series, Name, Material, Diameter, SKU, Barcode) — omitting spool-only fields and all RFID/weight-edit actions. It also surfaces the material **video** + **document links** (MSDS / TDS / RoHS / REACH / food) from the seed's `LinkXXX`. Rendered from the product's **`cloudSeed`** via `normalizeRow` (`openProductCard`/`_renderProductCard`). The **★/❤ are tied to MY account** (`_toggleProductCardFlag` → `_toggleProductFlag`): they reflect/import whether *I* favorited it. Docked in `_syncPanels` to the RIGHT of the reorder card (which tucks left) and layered above it; no title bar (closed via the `»` tab). New i18n `pcNoStock`.
- **Aspect filter in the search toolbar.** A new "All aspects" selector (between Material and Version) filters by finish/aspect, matching **either Aspect 1** (Matte, Silk, Carbon…) **or Aspect 2** (Bicolor, Tricolor, Rainbow…). The list is the union of both aspect columns present (empty `-`/`None` dropped); works in grid/table/rack and the Favorites views (scoped to favorites via `label.aspect` + new `label.aspect2`), hidden in printer views. New i18n `filterAllAspects`.
- **Click-to-copy SKU & EAN in the Product-info card (no button chrome).** The read-only auto TigerTag+ ref is itself the click target (faint copy glyph on hover + floating "Copied!"); an editable ref shows a click-to-copy value plus a **single toggle button** flipping a grey edit pencil ⇄ a green ✓ (no separate input, no separate validate) — commit with Enter or the ✓, click an empty value to jump into edit. Shared `_wireRef` + `_reorderUpdateRefDisplay` + `_flashCopied`. New i18n `reorderEditRef`.
- **Click-to-copy SKU in the "To order" list.** The SKU value is the click target (hover glyph + "Copied!" flash), no persistent per-line button (`[data-copysku]` → `_flashCopied`). New i18n `copiedFlash`.
- **The "To order" ⓘ button toggles the Product-info card** (reclick on the same product closes it) and is sized 34×34 to match the cart/× actions.

### Changed

- **Friends' favorites are read DIRECTLY from their `products`.** `products` is now friend-readable (owner/public/friend, same policy as inventory & racks), so browsing a friend subscribes to their real product docs (`subscribeFriendProducts` → `state.friendProducts`) and everything — the favorites grid/table, price/buy link, the Product card, and import — reads their live doc, always in sync. Removed the entire `productShares` projection and its mirroring (`_syncProductShare`, `_backfillProductShares`, `subscribeFriendShares`). **Tradeoff (user-chosen):** the product `note` now lives in a friend-readable doc (never displayed). **Backend:** `products` read opened to owner/public/friend (deployed); `productShares` rule deprecated. Mirror docs updated (`docs/firestore-schema.md`, backend README, public integration repo).
- **Toolbar filter dropdowns + grid Sort are app-styled** (custom, not the OS-native menu). Brand / Material / Aspect / Version / Tag and the grid **Sort** (`#gridSort`) keep their `<select>` (value + populate/change logic) but are driven by a styled button + popup (`_enhanceSelect`); the label resyncs on programmatic sort (`_syncGridSort`) and language switch (`applyTranslations` refreshes every `.csel`).
- **Favorites-view filters list only what's in the favorites.** In the Products views the Brand / Material / Aspect / Tag selectors are populated from the favorites (own or the friend's, liked/favorite only) via `_favesForFilters`, not the whole inventory.
- **A friend's favorite opens the Product card first** (whether or not in stock), and the Product-info identity header **toggles** that Product card for the same product (`_openProductCardFromRow` keyed on `_productCardData.id`).
- **Cleaner Product-info (reorder) card header** — text column truncates each line cleanly, colour name gets a real swatch (`colorCircleHTML`, handles bi/tri/rainbow), the open-card chevron became a round button, 58 px thumbnail, and the separator line under the title was dropped.
- **Simpler stock line in "To order"** — "5 required · 2 in stock" → compact "Stock: 2 / 5" (new i18n `pvStockRatio`).
- **Bulk ★/❤ buttons** match the other bulk buttons (icon + label, same height).
- **Product card provenance** uses the prominent "Added from …" block (avatar + name, clickable) and shows the product's own `importedFrom` (who its owner grabbed it from), not the friend currently viewed.

### Fixed

- **Importing a friend's favorite no longer duplicates / loses provenance** — the Product card's ★/❤ stored the product WITHOUT its `cloudSeed`, so a later write from your own favorites re-derived a different keyHash (from the lossy label) and created a second, provenance-less product. It now delegates to the shared `_toggleProductFlag` (full row from `cloudSeed` → matching keyHash, cloudSeed stored, provenance stamped, price/link/SKU-EAN carried).
- **Own favorite with no spool now opens the editable Product-info card** — synthesises the row from `cloudSeed` (else label) via `_productAsRow` so price / min / note / link / tags stay editable even with no live spool.
- **Favorites Material filter lists plain materials** (not "PLA Basic") — populated from the raw material (`_faveMaterialRaw`: new `label.materialRaw`, else `cloudSeed.id_material`, else label) instead of the aspect-suffixed `label.material`.
- **Favorites grid & table show prices in the user's tax mode** — `_favePriceHTML` derives the TTC figure from the country VAT when TTC is selected (was always the stored HT).
- **Switching favorite closes a stale Product card** — `openReorderPanel` closes the Product card when it's open for a different product identity.
- **Editable SKU/EAN input no longer stays always-visible** — `[hidden]` guards on the display/editor (a `display:flex` rule had been overriding the `hidden` attribute).
- **Product-info header hover glitch** — clean full-bleed hover (`box-sizing:border-box`, margins = the body padding) instead of overflowing negative margins.

### Removed

- **`productShares` projection** and its client mirroring (superseded by direct friend-readable `products`).
- i18n keys `pvRequired`, `pvInStock` (folded into `pvStockRatio`).

### Docs

- **`docs/sidecard-zindex.md`** — reference for every right-side panel's z-index, close-tab z-index, width and docking order, the interleaved panel/tab ladder, the three stacks, the `_syncPanels` math, and a checklist for adding a new card.

## v2.3.0 — 2026-07-09

Friends can now see each other's favorites (with price + buy link), bulk-favorite spools, and manage favorites while browsing a friend — plus a sliding view-selector, a cart icon for reorder actions, and fixes.

### Added

- **Public favorites shared between friends (`productShares`).** Favoriting a product now publishes a friend-readable slice to a new `users/{uid}/productShares/{keyHash}` collection (`favorite, liked, key, label, sku, ean, buyUrl, buyPriceHt`). In a friend's view the **Favorites grid & table** show that friend's ★/❤ materials read-only (their stock via `_stockCountByKey`, price in the viewer's tax mode, clickable buy link), each material's details show the friend's price + buy link + manual SKU/EAN, and importing (favoriting) a friend's material carries those over. Because a Firestore read is all-or-nothing per doc, `/products` stays owner-only (the **note is never exposed**). Mirrored on every product write (`_syncProductShare` from `_writeProduct`/`_writeProductField`/delete; removed when no longer a favorite nor carrying price/link/code) + a one-time backfill (`_backfillProductShares`); read live via `subscribeFriendShares` → `state.friendShares`; imported via `_carryFriendShare`. **Backend:** new `productShares` rule (read owner/public/friend, write owner + field-whitelist) deployed.
- **Bulk ★ Favorite / ❤ Love.** With spools multi-selected (grid or table), two icon-only `.flag-toggle`-style buttons add or remove the flag across the whole selection at once — a real toggle keyed on the selection's aggregate state (`_bulkApplyFlag`/`_syncBulkFlagButtons`), deduped by group key. In a friend view, adding imports with provenance.
- **Multi-select in a friend's inventory.** Checkboxes + the Select button are enabled in a friend view for bulk ★/❤ only (Tags/Price/Delete hidden via `is-friendview`; `_bulkDeleteSelected` hard-guards a friend's spools). Removed the friend-view early-returns in `_enterSelectMode`/`_toggleSelectAllVisible`.
- **New masterspool:** PrintoMax 3D — Grey (195 g) in the container picker.

### Changed

- **Favorites views available inside a friend's view.** The Favorites group (Grid + Table) stays visible while browsing a friend; only "To order" is hidden there.
- **Sliding selection bubble in the view selector.** Within a segment (Inventory / Favorites / Printers) the active highlight slides between buttons (`_positionViewIndicators`, one absolutely-positioned `.view-toggle-ind` per segment, re-fit on first paint / language switch / resize).
- **Reorder actions use the cart icon.** Buy-link buttons (Product-info card, deck header, favorites grid/table, buy-link badge, toolbox reorder-buy, "To order" empty state) and the "To order" view-selector entry switch `icon-shopify` → `icon-cart`; the goodies-shop buttons keep the Shopify icon.
- **"Product info" button toggles the card** (`_toggleReorderPanel`, compared by `_spoolGroupKey`).
- **Product-info "+ Material" button** rendered as a real `.toolbox-row` (icon + label + trailing ⓘ), matching the toolbox; `_wireReorderInfoTips` swallows the ⓘ press.
- **Clicking your name in the sidebar** now runs the same identity action as the avatar (`_onSidebarIdentityClick`).

### Fixed

- **In-stock count double-counted twin pairs** — a twin pair (two chips, one physical spool) counted as 2. `_countPhysicalSpools` now collapses twins for the stock badge (`_filamentStockCount`), favorites/"To order" (`_stockCountByKey`) and the low-stock notification.
- **"Detach" button leaked into non-cam views** (incl. friend view) — `.inv-add-btn { display:inline-flex }` overrode the UA `[hidden]`; added `.inv-add-btn[hidden] { display:none }` so the attribute hides it again.

---

## v2.2.0 — 2026-07-09

Follow-up to the Products/Favorites release: friend-import provenance (with live profile resolution that survives un-friending), a reworked Product-info card, and cross-view bulk price editing.

### Added

- **Favorite provenance.** Favoriting a friend's material (from a friend view) now stamps `importedFrom {uid,name}` on the product once at import time (never overwritten) via `_toggleProductFlag`, persisted by `_writeProduct`. The Product-info card renders an "Added from" identity block: the friend's avatar + pseudo are resolved LIVE — `state.friends` first (carries the inventory key), else a direct `userProfiles/{uid}` subscription (`_subscribeImportedProfile`, world-readable to any signed-in user) so name/photo stay current **even after the friendship ends**; the stored `name` is only a last-resort frozen fallback. The block is clickable → `switchToFriendView` when still a friend or the inventory is public, otherwise inert; it greys only when even the profile is unreadable (deleted account). `_refreshReorderProvenance` swaps just the block on any friends/profile change (no panel rebuild).
- **Bulk price from the Inventory view.** The bulk bar's Price action now shows for a materials (spool) selection, not just the Products table; applying writes the price to each selected spool's product identity (deduped by `_spoolGroupKey`, created through `_writeProduct`). `_bulkEnterPriceMode`/`_bulkApplyPrice` are context-aware (`is-materials` vs `is-products`; printers excluded).
- **Sortable Favorites table.** Clicking a header (Brand · Material · Name · Stock · Min. qty · To order · Price) sorts asc/desc with the shared chevron indicator; persisted via `state.favesSortCol`/`favesSortDir` (`tigertag.sort.faves`), wired through a delegated `th[data-fsort]` handler on `#invProductsView`.
- **9 new illustration SVG icons** (`mail`, `tag`, `list-check`, `cart`, `coins`, `bug`, `filter`, `gift`, `shield-check`) with `.icon-<name>` mask classes (24×24), for wider What's New / general use.

### Changed

- **Product-info card reworked.** The material illustration is larger (64 px); the colour name moved to its own line below the material (no longer truncated inline); the ❤ Liked / ★ Favorite toggles moved into the panel header, left of the ✕ (the delegated flag handler now resolves the reorder row from the whole `#reorderPanel`). The "Create a TigerTag Cloud" button is relabelled **"+ Material"** with an ⓘ info affordance whose hover tooltip (`_wireReorderInfoTips`, delegated on `#reorderPanelBody`, reusing the toolbox tooltip) explains it adds a spool of the exact filament without an RFID chip.
- **Low-stock reorder notification** now opens the "To order" list (`setViewMode("order")`) instead of the single product's card.
- **What's New illustrations use real icon names.** The modal renders `it.icon` as a masked `.icon-<name>` and strips non-class tokens, so the emoji icons used previously silently fell back to `sparkle`; the v2.1.0 entries and every older emoji entry (🏷️🖼️🛍️👀🎨⏰🗑️ → `tag`/`image`/`shopify`/`eye-on`/`palette`/`clock`/`trash`) were remapped so each item shows its own illustration.

### Fixed

- **Renaming a rack updates the Storage view immediately.** `_rackStructureSig` didn't include the rack name, so a name-only change let the no-op slot patch skip the header rebuild while advancing the render signature; the name is now part of the signature.
- **The grouped deck no longer hides behind the printer side card.** `_syncPanels` positioned the group/container/reorder cards off the spool-detail width only; with a printer panel open but no spool detail they opened at `right:0`, behind the printer panel. They now cascade off the printer stack width (`printerW + configW`).

---

## v2.1.0 — 2026-07-09

A big release built around a new **Products / Favorites / Reorder** system: turn a filament into a long-lived product you track (min stock, buy link, price) independently of whether a physical spool is currently in your inventory. Plus bulk editing, Bambu print thumbnails, email verification at sign-up, and a stack of fixes.

### Added

- **Per-product records (`products` collection).** A new per-user `users/{uid}/products/{keyHash}` table stores, once per **product identity** (keyed by a cyrb53 hash of `_spoolGroupKey` — TigerTag+ `tt:<id>`, else `diy:brand|material|id_type|colourSig|aspects`, now including the Type so filament and resin never collide) and shared by every identical spool (surviving spool deletion): a buy link, a purchase price (**always stored tax-free**, `buyPriceHt`), a minimum stock (in spools), a free note, tags, SKU + EAN, `liked`/`favorite` flags, a display snapshot (`label` incl. product image) and a sanitized `cloudSeed` (so a TigerTag Cloud can be minted with no source spool). Owner-only Firestore rule; `_writeProduct` does a partial merge so each slice updates independently. Live-synced into `state.products` via `subscribeProducts`.
- **"Product info" side card** — per-product management (buy link, price, stock/min, note, tags, SKU/EAN, ❤/★, "Create a TigerTag Cloud"). Opens from a toolbox row in the spool detail and from a button atop the group deck; docks as a distinct 3rd card. Everything auto-saves (no Save button). The buy link is edited via a Shopify button that never shows the URL as text; the price shows in the account's HT/TTC mode and is edited inline.
- **VAT country + HT/TTC price mode** in the account modal — a country picker (`users/{uid}.vatCountry`, drives rate + currency from `data/vat-rates.json`, 30 entries) and a HT/TTC price-entry preference (`users/{uid}.priceInputMode`). Prices are stored HT; the TTC figure is derived at display time (`_vatPrices`), so changing country never rewrites the DB.
- **Favorites view** — a dedicated header group (renamed from "Products") next to Inventory, with **Grid**, **Table** and **To order** buttons (view modes `favesGrid`/`favesTable`/`order`). Favorites Grid reuses the inventory spool-card (stripped of chip-only markers, price in the footer); the Table is a spreadsheet-style view (illustration · Brand · Material · Color swatch · Name · Stock · Min. qty · To order · Price · Shop) with an always-on selection column. **To order** is a Shopify draft-order-style cart (identity on one line, editable order qty, unit/line total, a sticky Payment card on the right with Subtotal / Estimated tax / Total that follow the HT/TTC mode).
- **Bulk product editing** — the products table's selection column feeds the shared bulk bar with **Delete** (removes product records only, decoupled from spools), **Tags** (writes `products/{keyHash}.tags`) and **Price** (one HT/TTC value applied to every selected product, converted to HT). Min. qty is pencil-editable inline; "Add a price" / the greyed Shopify button open the card straight into the matching editor with the input focused.
- **Low-stock alerts** — a product whose live spool count drops below its minimum shows an amber pill on its group deck and raises a local notification (product illustration, "X/min left", chimes once, clears on restock, clickable to open the product card).
- **Bulk tag editing** from the multi-select bar (spools + printers) — a **Tags** button opens the tags modal for the whole selection; save applies the diff (added-to-all / removed-from-all, per-item extras untouched).
- **Header master checkbox** in both tables (materials + printers) — selects/deselects all currently-visible (filtered) rows, with checkmark / dash states.
- **Bambu Lab print thumbnails** — the current (or just-finished) print's plate preview now shows in the printer table and Bambu side card, fetched over FTPS + `.3mf` (ZIP) extraction (`basic-ftp` + `yauzl`), with the PASV `0.0.0.0` rewrite and a fuzzy filename match. Validated against a real A1.
- **Email verification for email/password sign-up (strict)** — sign-up now sends a verification email and does not open a session; sign-in is gated on `emailVerified` with an inline "resend" action. Google sign-in is exempt. Closes the long-standing gap where no verification email was ever sent.

### Changed

- **Inventory grid/table click opens the grouped deck first — even for a lone spool** (`_openGroupPanel(..., { keepSingletons: true })`); picking a member inside the deck opens its detail. Bulk-select clicks are unaffected.
- **Interest hierarchy ❤ Love ⊆ ★ Favorite ⊆ tracked** (`_coupleFlags`, applied in both product write paths): setting a min auto-favorites; loving auto-favorites; un-favoriting drops the Love but **preserves the min** (a mis-click must never wipe a typed threshold).
- **Products views are driven by the shared search bar + selectors** (Brand / Material / Tag / ❤); the materials-only Version filter and the redundant ★ filter are hidden there.
- **To-order prices follow the account HT/TTC mode**; the Payment card subtotal shows HT or TTC accordingly (tax math always on the HT base). The Payment card moved to the right of the list and is sticky.
- **Editing a spool's TD** now opens a dedicated "Update TD" modal that changes only the TD (never the colour), with a hold-to-confirm "Clear TD value".
- **Print preview persists when a job is finished** (not just active) across every brand.
- **Native-app feel** — the UI is no longer text-selectable (except form fields / code blocks / opted-in `.selectable`), so clicking never leaves a blue highlight.
- README refreshed to the v2 title + structure; a SemVer bump policy was documented in `CLAUDE.md`.
- The ❤/★ toggles now explain themselves on hover.

### Fixed

- A faint **dark shadow leaked onto the window's right edge** at all times — the always-in-DOM Firebase-explorer panels applied their `box-shadow` unconditionally while parked off-screen right; gated on `.open`.
- **Slot-lock padlocks no longer show when browsing a friend's Storage** (`isSlotLocked` returns false in friend view).
- Storage view's **"Auto-organize"** label now localises correctly.
- The rack view's ⓘ info tips no longer get clipped (reuse the body-appended `#toolInfoPop`).
- FlashForge open-frame printers no longer show a bogus "Door closed" badge (gated on the model's `Enclosed` feature).
- Printer table **"Ends at"** is no longer blank for Snapmaker / FlashForge (derived from the slicer estimate / firmware remaining time).
- Printer table Preview column keeps consistent padding on finished vs printing rows.
- The multi-select **Delete** button now shows a visible hold-to-confirm sweep (was red-on-red).
- Launching straight into a printer view now shows the printer filters, not the materials ones.
- GitHub Release name drops the leading `v` (`2.1.0`, not `v2.1.0`).

### Removed

- Multi-select bar slimmed to **Delete + ×** (dropped the "Clear" and "Select all" buttons; their i18n keys removed).
- The detail panel's colour circle is no longer an edit trigger (colour editing stays via TD edit / TD1S / cloud encode).

---

## v2.0.0 — 2026-07-07

Tiger Studio Manager turns **2.0** — a big round of printer-table upgrades, a proper guided flow for updating a chip, and a pile of fixes.

### Added

- **See what's printing, right in the table.** The Printers table now has a **Preview** column showing the model on the bed for whatever's currently printing — pulled live from each printer.
- **Know when the printer's free.** A new **"Ends at"** column shows the wall-clock time the current job finishes (e.g. `21:23`), so you know exactly when to come back. Click the header to sort by soonest finish.
- **Tags for your printers.** Give your printers labels the same way you tag spools — chips, autocomplete, the works — right in each printer's side card.
- **Search & filter your printers.** The search bar now works in the Printers view (name, brand, model, IP…), and the filters next to it become **Brand · State (online/offline) · Tags** so you can zero in fast.
- **Delete several at once.** A new multi-select mode lets you tick a bunch of spools — or printers — and remove them together, with a press-and-hold confirm. In the table, the tick column is always there (Shopify-style); click, shift-click a range, or Select all.

### Changed

- **Updating a chip is now guided.** Tapping "Please update RFID" opens a clear panel that shows your reader(s) waiting for the chip: place the right one and it lights up green, a wrong chip lights up red with a heads-up, and the update only runs once everything matches — no more guessing, and never a write to the wrong chip.
- **Fresh chip, straight to work.** Scan a blank TigerTag chip and the "+ Material" panel opens right away so you can set it up on the spot.

### Fixed

- **Editing a filament's colour now actually reaches the chip.** Changing a colour and hitting Update used to leave the chip on its old colour (a rescan proved it) — the new colour is now written for real, and reads back correctly.
- **Elegoo progress behaves.** The print percentage no longer jumps around between wild values mid-print — it climbs smoothly like it should.
- **"Storage location" lights up again.** Clicking a spool's storage location jumps to Storage and highlights its slot, with everything else dimmed — as it used to.
- **The "not stored" panel keeps up.** Recolour a spool that isn't in a rack and its picture refreshes immediately.
- **Snapmaker firmware guide, in your language.** The recommended-firmware setup steps for the Snapmaker U1 are now translated across all 9 languages.

### Removed

- The redundant "N selected" label in the multi-select bar — the Delete (N) button already shows the count.

---

## v1.10.31 — 2026-07-06

### Added

- **Grab some goodies.** A new Shop button — in the sidebar and at the bottom of Friends — opens the official TigerTag store in your browser: RFID makers, merch and more, to support the project. Like the GitHub / 3D Files / Discord buttons, it gives you a little heads-up once until you've had a look.
- **Tags, reworked.** Adding tags to a spool now works the way you'd expect: start typing to filter your existing tags (tick the ones you want) or create a new one on the fly, with the chips sitting neatly below. A pencil opens a full editor when you'd rather manage them all in one place.
- **Two ways to see your racks.** A new switch in Storage flips each slot between the usual colour fill (with the remaining-weight bar) and a clean **picture** view — big square tiles showing each material's illustration, or its colour, for a gallery-like overview that's easy on the eyes.
- **Little sounds when you organise.** Dropping a spool into a rack gives a crisp "snap into place"; pulling one back out to "not stored" gives a gentle downward cue.
- **Public inventories look their best.** Open a friend who's made their inventory public and you land straight on a clean picture-mode gallery of their racks.

### Changed

- **Friend view is tidier.** Viewing a friend no longer shows the Printers view switch — their printers aren't shared. It's back on your own inventory.
- **Rack swaps read better.** Drag a spool onto an occupied slot and the ⇄ swap arrow now shows on both spools that will trade places, not just the one underneath.
- **Cleaner notifications.** Printer notices (like the Snapmaker firmware alert) now show the brand's logo on its own, without the white circle around it.

### Fixed

- **Multi-colour swatches are round again.** Bicolour, tricolour and rainbow filaments were showing a broken square poking out of their colour dot — the pie / rainbow now renders as a clean circle everywhere: table, details, grid cards, groups.
- **Grouping is smarter.** Identical spools still group together, but a white, a red and a rainbow spool of the same brand and material no longer get lumped into one group.
- **The Storage view no longer flickers.** Moving spools around, adding a tag, or any background change no longer rebuilds the whole rack view or jumps it back to the top.
- **The table matches the grid.** A grouped set of spools shows as a single line in the table, just as it shows as a single card in the grid.
- **The notifications tab stays put.** Its close handle no longer briefly floats over a panel you open right after.

### Removed

- The little orange dot next to the friend you're viewing — the accent bar already shows it, and the dot sometimes got stuck on the wrong friend.

---

## v1.10.30 — 2026-07-04

### Added

- **See what a TigerTag Player unlocks.** A spool's chip actions (write, restore, erase, recycle) now always appear in its toolbox — active when the right chip is on your reader, greyed out otherwise. With no reader plugged in, clicking a greyed action shows you what a TigerTag Player would let you do. For a twin-tagged spool (two chips), those actions only light up when both chips are on readers, since they act on the pair.

### Changed

- **Tidier spool details.** The tag type (TigerTag+, TigerTag, TigerCloud) now shows as its badge at the top of the Details, instead of being repeated as plain text lower down.

### Fixed

- **Windows: readers are detected the moment you plug them in.** ACR122U / TigerPOD readers connected while the app is already open are now picked up automatically within a few seconds — no more restarting Tiger Studio to make them appear.
- **The notifications panel steps aside** when you open a spool, a printer, Friends, Settings, or any other side panel, so they never overlap.
- **Twin chips stay linked** even when you scan just one of the pair — a single-chip scan no longer breaks the pairing.
- **The material video keeps playing** when you place or lift a chip while a spool is open — the card no longer flashes or restarts the clip.
- **Scanning a spool that's already open** no longer pops a second card on top.

---

## v1.10.29 — 2026-07-03

### Added

- **Reuse your RFID chips.** Three new toolbox actions for a spool's physical chip: **Erase** reinitialises it to a fresh blank TigerTag (a TigerTag+ becomes a plain reusable TigerTag), **Recycle to NFC** wipes it back to a generic NFC tag, and **Restore TigerTag+** rewrites a backed-up TigerTag+ exactly as it was. Each is guarded to the exact chip on the reader, verifies what it wrote, and needs a press-and-hold to confirm.
- **Snapmaker firmware helper.** For the community Paxx firmware on the Snapmaker U1: the download button always points at the latest release, the printer's settings show whether it's up to date, and you get a notification — named after your printer — when a newer firmware is out. One click jumps straight to that printer.
- **Notification sounds.** A soft chime plays when something actually arrives — a friend request, a friend accepting yours, or a firmware update — never for the history that loads when you open the app. Notifications coming from a printer now show that brand's logo, the way a friend's notice shows their avatar.
- **Every tool explains itself.** Each action in a spool's toolbox now has a small ⓘ that, on hover, tells you in plain words what it does — no more guessing.
- **"Backed up" badge.** A green shield marks each TigerTag+ whose signature is safely backed up, on grid cards, thumbnails and the storage view.
- **Product ID.** A TigerTag+ detail panel now shows its on-chip product ID, as a link to the product page.

### Changed

- **Clearer rack tooltips.** Hovering a spool in a rack shows its remaining-filament bar in the usual red / orange / green, matching the rest of the app.

### Fixed

- **Twin and backup icons appear instantly** on a freshly-scanned TigerTag+, without having to close and reopen the card.
- **Chip actions update live** — toolbox actions that need a chip on the reader now appear and disappear as you place or remove the chip, while the panel stays open.
- **Honest wording** on "Remove from inventory": it's a permanent delete, and your physical chip keeps its data (erase or recycle it to reuse).

---

## v1.10.28 — 2026-06-29

### Added

- **Tags.** Label your spools with free-form tags. Add or remove them from a spool's detail panel (with autocomplete from tags you already use), filter the inventory with the new **All tags** dropdown, and find them from the search bar. A spool's tags stay in sync across both chips of a twin pair.
- **Grid view sorting.** The grid now has its own sort menu (brand, material, name, type, weight, capacity, updated) with an ascending/descending toggle — previously only the table view could sort.
- **Your chip history, kept safe.** The app now keeps a private list of every physical chip you've programmed — to count your unique chips — and backs up the repairable signature of each TigerTag+ the first time it's read.

### Changed

- **The notifications panel no longer blocks the rest of the app** — you can keep clicking around while it's open, it has a chevron to close it, and opening it tidies away any other open side panel.
- **Cleaner grouped spools in the grid** — a group now looks like a normal card with its ×N count badge, without the stacked-paper effect.
- **Clearer wording when pairing chips** — "Link a second RFID chip" instead of "Link to a twin spool", since you're linking two chips of one spool.
- **New Firebase Explorer (admin).** For debug-enabled accounts, a dedicated dark tool to browse your own Firestore data — breadcrumb navigation, clickable drill-down, readable values and a raw-JSON view.

### Fixed

- **"Show in Storage" now just highlights the spool's slot** instead of filling the search bar; clicking anywhere clears the highlight.
- **The chip list builds for everyone now**, including accounts whose inventory loads from cache (it previously skipped them).

---

## v1.10.27 — 2026-06-28

### Added

- **A nudge to join the community.** A little badge and a friendly notification invite you to join our Discord, drop a star on the project's GitHub, and discover our free 3D files on MakerWorld — each shows once, and clicking through is enough (it never nags again).

### Changed

- **The printer control panel got a visual refresh.** Cleaner, dedicated icons for the nozzle / bed / chamber temperatures, fan, homing and disable-motors, plus the Step and Speed selectors (now compact icons instead of text). All the control icons share one consistent colour.
- **Creality printers can set their print speed** from the control panel now, like the other brands.
- **Notifications are easier to read.** Each one shows an icon, a title and a one-line message, and the whole notification is clickable — no more cramped, cut-off text next to a tiny button.
- **Tidier sidebar community buttons** (GitHub / 3D Files / Discord) — same size, square when the sidebar is collapsed, with bigger logos.
- **"Spools not stored" lists empty spools last**, so the rolls you still need to rack stay at the top.

### Fixed

- **No more flash of placeholder text** in the sidebar as the app loads — labels show their final wording on the very first frame.
- **Notifications no longer cut off** — friend-request and app notifications wrap to show the full text.
- **Elegoo:** the chamber temperature no longer shows the bed icon.

---

## v1.10.26 — 2026-06-27

### Added

- **Add Anycubic cloud printers without leaving the app.** Signing in to your Anycubic account now happens right inside the add-printer panel — no separate window pops up. Once you're in, your cloud printers show up ready to add.
- **A little "welcome back" sound** when you return from a friend's inventory to your own — the upbeat counterpart to the sound you hear peeking into a friend's.

### Changed

- **The whole "Add a printer" flow is calmer and more consistent.** Pick a brand and its options dock neatly beside the list instead of replacing it; every brand now looks and behaves the same, with a tidy header carrying a Back button and a Connection tutorial. Adding a printer drops you straight onto it.
- **Anycubic: "Add from Anycubic Cloud" is the recommended, top option** when you add an Anycubic printer.
- **Sidebar footer tidy-up.** The Mobile Apps QR code sits above the GitHub / 3D Files / Discord buttons, the whole block stays pinned to the bottom, and everything keeps its size and place smoothly whether the sidebar is open or collapsed.

### Fixed

- **Anycubic's Files button is back where it belongs** — tucked next to the light in the controls, like the other printers, instead of floating off on its own.
- **No more tiny size jumps in the sidebar** — the version number, the community buttons, and the notifications bell stay the same size whether the sidebar is open or collapsed, and the avatar no longer hops around when you toggle it.
- **Buttons that are working show just a spinner now**, not a spinner next to a leftover icon.
- **Opening a friend's inventory no longer leaves a previous spool or group card hanging around** from a different view.

---

## v1.10.25 — 2026-06-26

### Added

- **See whose inventory you're viewing at a glance.** A bright bar on the left edge slides to the avatar of the view you're currently in — your own, or a friend's — so you always know where you are.
- **Little sounds when you switch.** A quick blip when you hop between your own accounts, and a softer, distinct one when you peek into a friend's inventory.

### Changed

- **Friendlier wording** across a few empty states and confirmations.
- **Clearer inventory table.** The remaining-weight bar now sits under the value with room to breathe, grouped rows highlight properly on hover again, and the sort arrow is a cleaner chevron.

### Fixed

- **Clicking the friend you're already viewing now does nothing** — it used to bounce you back to your own inventory.
- **Scanning a two-chip (twin) spool no longer opens its card twice.**
- **Grouped rows now sort by their combined weight and capacity**, so the order matches what you see.

---

## v1.10.24 — 2026-06-26

### Added

- **Invite QR code.** The Friends panel's "My code" card now shows a QR of your shareable invite link — a friend can scan it to add you.
- **A friendly nudge to add an avatar.** If you haven't set a profile avatar, a playful prompt (plus a notification) invites you to add one; both disappear the moment you do.
- **Update download progress.** The auto-update toast now shows a filling progress bar (with a rough time-left estimate) while a new version downloads.

### Changed

- **Account menu reimagined (Discord-style).** It now shows you at the top, with a hover **Switch account** fly-out listing your connected accounts, plus Edit profile, Friends and Settings. **Manage accounts** opens a redesigned dark modal where each account has a Switch button and a "…" menu to disconnect.
- **Friends panel refresh.** The friends list moved to its own companion card that opens beside the Friends panel, each friend row has a clear chevron to view their inventory, and removing a friend now asks for confirmation (showing their avatar).
- **Cleaner sidebar.** The avatar and friend chips stay the same size whether the sidebar is collapsed or expanded (no more vertical jump), stray separator lines are gone, and the community buttons are simplified to **GitHub / 3D Files / Discord**.
- **Tidier views.** Scrollbars are hidden across the Materials and Printers grids/tables, the "My printers" header is gone, and the empty-printers screen now invites you to add your first printer.
- **Live "ready to scan" indicator.** A small pulsing green dot shows when a TigerPod reader or a TigerScale is connected — the old "+ Auto Scan" button is gone (scanning is automatic).
- **Edit your avatar from the header** — hover your avatar next to your name to change it.
- Toolbar "+" button labels shortened to **Material / Device**.

### Fixed

- **Scanning a spool while viewing a friend** now returns you to your own inventory and opens the scanned spool's card.
- **Buttons no longer turn invisible (white-on-white) on hover** — fixed at the root, so every coloured button stays readable.
- **Cross-account rack safety.** Auto-organize now waits for your racks to load and never rewrites a spool whose rack is still loading — no more spools "leaving" their slots when bouncing between accounts.
- The blocked-users list now refreshes when you open the Friends panel.

---

## v1.10.23 — 2026-06-25

### Fixed

- **Switching between two signed-in accounts could knock your spools out of their racks.** If you placed spools in a rack on one account, then jumped to another account and came back, Auto-organize could mistakenly treat those spools as "not stored" and even reassign them to the wrong slots. Fixed — the app now fully resets the previous account's racks on every switch, so your storage layout stays exactly where you put it.

---

## v1.10.22 — 2026-06-25

### Changed

- **Refreshed the "empty inventory" welcome screen.** It now shows a product mockup (Studio + the TigerTag RFID app) with the headline above the image, and the wording highlights that you can scan and manage both your inventory and your 3D printers from your phone.
- **One beta install card for everyone.** The beta card now mirrors the App Store & Google Play card and carries a single universal link — scanning it sends iPhone users to TestFlight and Android users to the Android beta automatically.
- **Change your avatar straight from the header.** Hover your own avatar (top-left) and click the little edit badge to pick, crop and upload a new photo — or use the new "Add/Change photo" entry in the account menu.
- **QR codes are no longer clickable** — they're there to be scanned with your phone camera.
- The camera **"Detach"** button is now hidden when viewing a friend.

---

## v1.10.21 — 2026-06-25

### Added

### Changed

- **Auto storage and Auto unstorage merged into one "Auto-organize" toggle.** It's a single automation: new spools are auto-placed and emptied slots are auto-freed. Lock a slot to make an exception. The setting is now per-account and follows you across devices.
- **Creality fan controls are now cards with −/+ 10% steppers** (like the other printers), instead of sliders — one card per fan the printer actually has.
- **Tidier toolbar.** The view switcher (Materials / Printers) sits above the search bar in every view, and the "Spools not stored" header is more compact with hover info bubbles instead of long help text.
- **Cleaner Cam view.** The search bar and the Scan / Add-device buttons (which don't apply to the camera wall) are hidden, and "Detach" moved up next to the other actions.

### Fixed

- **Switching between accounts could empty your racks.** Bouncing between two accounts while toggling the automation could clear every spool from its rack on the account you came back to, leaving the slot locks behind. Fixed — stale background updates from the previous account are now ignored, the automation only writes to the matching account, and Auto-organize never frees a spool that's in a locked slot.
- The RFID reader indicator no longer shows a raw text key in its tooltip, and the printer table now lines up with the materials table under the search bar.

---

## v1.10.20 — 2026-06-24

### Added

- **Bambu Lab A2L** added to the printer catalog, so you can add and track the new A-series machine.

### Changed

- **"Spools not stored" is now a permanent shelf.** In Storage it's a fixed, always-visible column on the right (it no longer slides in and out as you drag) — a clear "bin" for spools that aren't in a rack. Drop a rack spool onto it to take it out of its rack; while you drag, it lights up to show it accepts the drop, and when empty it shows a "Drop a spool here" zone so it's obvious where un-stored spools go. The Storage header now stays put while the racks scroll.
- **Clearer view switcher.** The two Grid/Table button groups are now labelled **Materials** and **Printers**, so it's obvious which one switches your filament inventory and which one switches your printers.
- **Friends always open on the Materials grid.** Opening a friend — or switching between friends — now lands on their materials in Grid view instead of a leftover Storage/printer view. Your own preferred view is restored when you go back to your account.
- **Smarter automation guards.** With **Auto storage** on, a rack's "Clear all" is hidden (it would just re-scatter everything) and dropping a spool into the bin now simply turns Auto storage off so the spool actually stays there. With **Auto unstorage** on, empty (0 g) spools in the bin are locked with a lock badge and a tooltip, since they can't be stored anyway.
- The "Not stored" counter only turns orange when there's actually a backlog, the printer settings gear now toggles its panel closed, and the container picker / detail card sizing got minor polish.

---

## v1.10.19 — 2026-06-23

### Added

- **Smoother card transitions.** Switching from one spool — or one printer — to another now slides the new card in over the old one instead of swapping instantly, with the previous card frozen underneath until the new one settles. Spool cards also open scrolled to the top.

### Changed

- **Grouped view is now the default.** Identical spools are collapsed together by default. The on/off switch has moved out of the toolbar into **Settings → Data** ("Group identical spools") for anyone who prefers a flat list.
- **"Choose a container" is now a side panel** instead of a pop-up: it slides in beside the spool card, with bigger container images and the weight shown under each container type.
- **Inventory "Refresh" moved to Settings → Data** ("Resync inventory"). Your inventory already syncs live, so the manual refresh is now a discreet safety net rather than a prominent sidebar button.
- **Tidier Settings.** Cleaner buttons and hover states, emoji-free tool icons, and the Debug panel now opens neatly to the left of Settings instead of on top of it.
- **"Spools not stored" entries redesigned** to match the group panel — product image and tier badge on the left; name, material, brand, and a colour-coded weight bar on the right.

### Fixed

- **"Spools not stored" panel handle.** The chevron now follows the panel at a consistent speed however it's opened or closed, no longer lags when the panel reopens after a drag-and-drop, reliably closes the panel when clicked, and dragging a spool now grabs the whole row (with a clean square thumbnail) instead of just the image.

---

## v1.10.18 — 2026-06-22

### Added

- **Spool grouping in the Grid + a group panel.** Identical spools now also collapse in **Grid** view into one "deck" card with a count badge. Clicking a group (in Grid or Table) opens a side panel: a **dashboard overview** — a speedometer gauge of the group's remaining filament, brand, material, combined weight and spool count — above the list of the individual spools. Opening a spool from there slides its detail card in beside the panel.
- **Live group totals.** A group's weight (gauge, totals, deck card and table row) now updates in **real time** as you change a spool's weight from the slider or a connected scale.
- **Close all side panels at once.** Press and hold any panel's `»` close tab for half a second to dismiss every open side card (a vertical fill shows the progress).

### Fixed

- **Group toggle tooltip is now translated** in every language (it previously showed a raw key on first launch).

---

## v1.10.17 — 2026-06-22

### Fixed

- **Creality: fan controls now match each printer's hardware.** The live control card was showing the part-cooling, case, and side fan sliders on every Creality model, but only the enclosed K-series (K1 and K2 families) actually has all three. Open-frame printers — **Hi, Ender-3 V4, SparkX i7** — and any unidentified model now show only the **part-cooling fan**, so you no longer get sliders for fans the machine doesn't have.

---

## v1.10.16 — 2026-06-22

### Added

- **"What's New" screen.** After an update, a tidy floating window shows what's new in plain language — move it around, resize it, and browse the notes of any past version from the dropdown. Reopen it anytime from **Settings → About → "What's New"**.

### Changed

- **Cleaner, emoji-free interface.** Emojis across the app are now crisp SVG icons (or removed where they were purely decorative), for a more consistent, professional look.

### Fixed

- **Grouping now includes cloud spools.** A TigerCloud spool and a TigerTag (Maker) spool of the same filament now collapse into the same group, instead of the cloud one staying on its own.
- **The "Set Color & TD Value" dialog can be moved.** Drag it by its header to reposition it.

---

## v1.10.15 — 2026-06-21

### Added

- **Group identical spools.** The inventory **Table** can now fold identical spools into a single expandable row with a count badge — a shelf full of the same filament reads as one line instead of many. Click a group to open its spools (each still opens its own detail card); searching auto-opens matching groups. A switch in the toolbar turns grouping on/off, and your choice is remembered across your devices. TigerTag+ spools group by product; your own spools group by brand + material + colour + finish. Display-only — nothing in your data changes.
- **Update notifications.** When an app update is downloading or ready to install, you now get a notice in the notification bell — the "ready" one has a one-click **Restart** button.

### Changed

- **"Refresh from API" now updates everything.** Refreshing a TigerTag+ spool from the catalogue now also corrects its **brand, material, finish, print temperatures and colour** — not just the name, image and documents — fixing spools whose details had drifted from the catalogue. If a value stored on the physical tag changes, the spool is flagged so you know to re-write the chip.
- **Colour-coded filament gauge.** The "weight available" bar now changes colour with how much filament is left — red below 20%, orange below 50%, green above — matching the mobile app. Applied across the table, grid, groups and the spool detail panel.

### Fixed

- **No more blinking weight bar.** The weight gauge in the spool detail panel no longer pulses while you drag the slider.

---

## v1.10.14 — 2026-06-21

### Added

- **Shareable friend links.** The Friends panel has a new **"Share link"** button — it copies a link (`cdn.tigertag.io/friend/…`) you can send anywhere. When a friend opens it on their computer, Tiger Studio Manager pops to the front with the **Add-friend search already filled in** — they just press **Send request**. (A link can never add or accept anyone on its own — you always confirm.) If they don't have the app yet, the page offers a download; on a phone it shows the code to add manually.

### Fixed

- **Friend avatars show up right away.** The add-friend search preview — and a friend you just accepted — now display their real profile photo immediately, instead of only after restarting the app.
- **The notification center responds instantly.** Accepting / declining / blocking a friend request, or dismissing a notification, now clears it the moment you click instead of lingering for a second.

---

## v1.10.13 — 2026-06-19

### Added

- **Creality: live machine controls.** The Creality side panel can now drive the printer, not just monitor it. Tap a temperature to set the **nozzle, bed, or chamber** target; **jog** X/Y/Z and **home** the axes; **disable the motors**; and control the **part-cooling, case, and side fans** with 1%-precision sliders. The motion pad is hidden during an active print so a stray move can't disturb a job (temperatures stay adjustable). _Tested on a real K2 Plus._
- **Creality: filament slot selection + CFS load/unload.** Click a filament slot to select it as the active filament — it's highlighted, and **Feed** and **Unload** buttons appear that load or unload that slot through the CFS (the printer auto-heats, cuts and feeds). Slots now clearly show three states — identified (coloured), loaded-but-unidentified, and empty — and RFID-identified slots are locked from editing (the tag defines them); editing moved to a dedicated pencil button, so clicking a slot selects it instead of opening the editor.

### Fixed

- **Creality: starting a print and deleting on-printer files from the app now work** on K-series printers. These actions were silently failing; they now reach the printer correctly.

---

## v1.10.12 — 2026-06-19

### Added

- **Notification center.** A new **bell** in the sidebar (with an unread badge) gathers your incoming friend requests and updates in one place. Friend requests shown there are actionable — **Accept / Decline / Block** — and stay until you choose one, so a request is never lost. First update type: **"X accepted your friend request."**
- **Friend requests are easier to handle.** Pending requests now also appear in the **Friends panel** and the notification center (not just the popup), each showing the requester's real avatar with Accept / Decline / Block.

### Changed

- **Friends list updates live.** Accepting or removing a friend now appears **instantly for both people** without reopening the panel, and a friend's avatar / name / colour changes show up live too.
- **Friends button** now shows your **number of friends** (or a **"+"** when you have none) instead of the pending-request count — requests moved to the bell.
- **Friend request popup**: added a **close (✕)** button to dismiss it for later (the request stays pending and can be handled from the bell or Friends panel), and it now shows the requester's **real avatar immediately** — no initials flash.

---

## v1.10.11 — 2026-06-19

### Added

- **Anycubic: file management.** The Anycubic printer panel now has a **Files** button that opens a browser for the printer's stored files. Browse **on-printer storage** and a **USB stick** (the USB tab appears once a stick is detected), and — for cloud-connected printers — a **Cloud** tab listing the files you saved to Anycubic Cloud, complete with thumbnails. From any tab you can **start a print** or **delete** a file (both press-and-hold to confirm). Cloud files are shared across all your printers, so a sliced file is only printable on the model it was made for: incompatible files show which printer they belong to and their Print button is disabled (you can still delete them). Works on both LAN- and cloud-connected Anycubic printers. _(Tested on a Kobra 3 V2 and a Kobra X.)_
- **Printer brand logos.** The printer list, grid, and the "add a printer" picker now show each manufacturer's logo (Bambu Lab, Anycubic, Creality, Elegoo, FlashForge, Snapmaker).

### Changed

- **Clearer online status.** A printer's online/offline state is now a small coloured dot next to its name — pulsing green when online, flat grey when offline — in both the grid and the side panel. The old "Online / Offline" badge has been removed as redundant.
- **"Last seen" instead of "Updated".** The printers list and grid now show when each printer was last seen **online** ("just now" while connected, otherwise how long ago), and it's remembered across restarts.
- **Tables remember your sort.** The filament and printer tables now keep your last sort column and direction across restarts. By default filaments sort by **Brand** and printers by **status** (online first).
- **Printers table polish.** The printers table now has the same rounded, scrollable finish — with a pinned header — as the filament table.
- **Connection labels** now always note **"(LAN)"** for local connections (e.g. "WebSocket (LAN)", "MQTT (LAN)", "HTTP (LAN)").
- **Snapmaker setup:** updated the Paxx U1 Extended firmware link to **v1.4.1-paxx12-19** and removed the now-unnecessary `openrfid_user.cfg` configuration step.

### Fixed

- **Anycubic: fan speed and target temperatures now load on startup.** On a LAN-connected Anycubic printer the cooling fan always read 0% and the nozzle/bed targets showed blank right after launch even when they were actually set — they now appear immediately on connect.
- **File browser close button no longer cut off.** The ✕ in the file sheet header was rendered partly off the right edge of the window.
- **Bambu Lab: the filament/AMS card no longer appears empty when the printer is offline.**

---

## v1.10.10 — 2026-06-18

### Added

- **FlashForge: live monitoring & machine controls.** The FlashForge side panel now shows per-nozzle temperatures (tool-changers like the Creator 5 Pro list each tool **T1…Tn** with the active one highlighted; single-nozzle models show **E1**), plus bed and — on enclosed models — chamber, each as current/target. There's a fan strip, a door open/closed indicator, and a red error banner. You can toggle the **chamber light**, **pause / resume / stop** an active print, and open an on-board **file browser** (with thumbnails) to start a stored print. A new **printer-info button (ⓘ)** opens lifetime stats (filament used, total print time, free disk) and machine specs (model, firmware, nozzle, build volume, …). _Tested on real AD5X + Creator 5 Pro hardware._
- **FlashForge Creator 5 / 5 Pro: official colour palette.** Setting a filament slot's colour now offers only the printer's 24 built-in "Color Library" swatches — the firmware silently rejects anything else (the slot reverts to white) — so every pick is one the printer actually keeps. Other models keep the free colour picker.

### Changed

- **Bambu Lab H2-series dual nozzle.** Printers with two heads (H2C / H2D / X2D) now show **both** nozzles — tagged **R** (right) and **L** (left), with the active head highlighted — each with its own temperature you can tap to set, instead of only the active head.

### Fixed

- **Filament colour/material editor no longer opens hidden behind the printer panel.** A recent layering change had pushed the printer side-panel above the edit sheet; the sheet now sits above it again. Affects all brands (Snapmaker / Creality / Elegoo / FlashForge).

### Notes

- **FlashForge temperatures and fans are read-only** — the firmware doesn't expose a command to set them, so they're shown for monitoring only.

---

## v1.10.9 — 2026-06-18

### Added

- **Anycubic cloud camera — everywhere now.** The cloud (Agora) camera shows in the **camera wall** and the **detached camera window** too, not just the printer's side panel, and it keeps streaming through long sessions (automatic RTC-token refresh). _Thanks to [@ennisj](https://github.com/ennisj) (PR #4)._
- **Bambu Lab heated-chamber control.** On models with an actively heated chamber (X1E, the H2 series, X2D), the chamber temperature is now a setpoint you can tap to set — like the nozzle and bed. Passive-chamber models (X1C) stay read-only.

### Fixed

- **Bambu Lab AMS humidity & temperature now show for every AMS unit.** Machines with more than one AMS (e.g. the H2C, which has two) previously showed nothing; each unit's real humidity % and temperature now appear (labelled A / B / … when there are several). AMS Lite has no sensor and stays blank.

---

## v1.10.8 — 2026-06-18

### Added

- **Anycubic cloud-mode camera.** Printers connected in **cloud mode** now show their live camera in the side panel (an Agora WebRTC stream), not just LAN-connected printers. _Thanks to [@ennisj](https://github.com/ennisj) (PR #3)._

### Changed

- **Adding a printer opens its panel automatically.** Once you finish adding a printer, its side-card now opens straight away instead of leaving you on the list.
- **Closing a printer also closes its settings.** If a printer's Settings form was open, closing the printer now closes that form too — no leftover panel floating on the side.

### Fixed

- **Settings close tab no longer hidden.** With a spool card, a printer's Settings, and a printer panel all open side by side, the spool card painted over the Settings panel's close tab — the tab is now always reachable.

---

## v1.10.7 — 2026-06-17

### Added

- **Bambu Lab: full machine controls in the printer panel.** The Bambu side-card now has the same live controls as the other brands — pause / resume / stop the current print, jog the X/Y/Z axes, home any axis, toggle the chamber light, disable the motors, set nozzle and bed target temperatures (preheat while idle), choose the print-speed level (Silent / Standard / Sport / Extreme), and control the cooling fans: part-cooling, the auxiliary "assist" fan, and the chamber ("Case") fan on enclosed models such as the X1C. _Pause / resume / stop use Bambu's documented commands; the other controls rely on community-documented commands and may behave differently on some models._
- **FlashForge Creator 5 & Creator 5 Pro support.** Both models are now recognised. Network discovery and "Add by IP" read the printer's serial number automatically, and the exact model is detected on first connection so the correct name and picture appear without picking them by hand. The Creator 5 Pro is shown as a tool-changer — each of its tools (T1–T4) appears with its own filament slot and its own hotend temperature — and assigning filament to a slot works. _(Tested on real hardware.)_

### Changed

- **Bambu Lab: smoother, flicker-free live cards.** The printer card no longer rebuilds itself every time the printer sends an update — only the values that actually changed are refreshed. Editing a field (temperature, a dropdown…) is no longer interrupted when new data arrives, and the light / fan / speed buttons now react instantly.
- **Printer settings open beside the printer card.** Opening a printer's settings (gear) now slides the form in next to the printer panel instead of hidden behind it, without dimming the rest of the app, and it has the same `»` close tab as the other side-cards. Switching to another printer closes a leftover settings form.

### Fixed

- **Bambu Lab: correct AMS humidity & temperature.** The A1's AMS Lite has no humidity/temperature sensor, so it no longer shows made-up values. On AMS units that do have a sensor (AMS HT, AMS 2 Pro), humidity now shows the real percentage instead of the internal 1–5 dryness grade, and the temperature is shown as a whole number.
- **FlashForge: newer models are no longer dropped during discovery.** Printers that don't reveal their identity to the first probe (e.g. Creator 5) now appear in the scan and can be set up via "Add by IP".
- **FlashForge Creator 5 Pro: filament slots no longer disappear,** and the enclosure ("Case") temperature now uses the correct icon. Fixed the Creator 5 Pro catalog image.

### Notes

- **FlashForge Creator 5 / 5 Pro filament colour** follows the printer's built-in colour palette: a colour outside the manufacturer's official set is rejected by the firmware (it reverts to white). This is a printer-side constraint, not an app issue.

---

## v1.10.6 — 2026-06-17

### Changed

- **Spool and printer side-cards no longer dim the screen.** Opening a spool's or printer's detail card used to drop a dark overlay behind it that you had to dismiss first. Now the list stays fully usable — click another spool or printer and the card switches in place, no close-then-reselect. Each card has a clear orange `»` tab on its left edge to close it, and the tab slides in and out attached to the card instead of popping into place.
- **Spool and printer cards can now sit side by side.** Open a spool's card and a printer's card at the same time and the printer keeps the right edge while the spool card tucks in just to its left (passing neatly behind it), instead of one replacing the other — groundwork for dragging a spool straight onto a printer slot.

### Fixed

- **Buttons no longer jump down when clicked.** Some buttons — most visibly the show/hide-password eye — shifted downward on press. Fixed everywhere.
- **Spool card's close tab now slides behind the printer card.** When both cards were open and you closed the spool card, its orange `»` tab briefly swept in front of the printer card instead of behind it like the card itself. Fixed.

---

## v1.10.5 — 2026-06-16

### Added

- **Anycubic Kobra X: live camera now works (LAN).** The Kobra X's camera is now supported over the local network, reusing the same video pipeline as the Kobra 3 V2 — it was previously left off because the Kobra X advertises its stream differently. _Thanks to [@ennisj](https://github.com/ennisj) (PR #2)._

---

## v1.10.4 — 2026-06-16

### Added

- **Anycubic: printer error alerts.** When the printer refuses a command (for example "Home the axis before moving" if you jog before homing), an alert now pops up with the printer's message and error code, so you know why nothing happened.

### Fixed

- **Anycubic (cloud): the fan, temperatures and speed mode now work at any time** — not only while a print is running. They were previously sent in a way the printer only applied to an active job, so at idle nothing happened. They now use the same realtime channel as the official slicer.
- **Anycubic (cloud): the light now turns on the right LED.** It was toggling the camera light (which the printer rejects); it now controls the chamber/part light.
- **Anycubic: editing a nozzle/bed temperature is fixed.** The input no longer errors out, and clicking away now applies the value (Escape still cancels).

---

## v1.10.3 — 2026-06-16

### Fixed

- **Bambu Lab: adding a printer by IP now works reliably.** Typing your printer's IP could fail with "No reply from …" even when the printer was online and reachable — the check gave up too quickly before the printer finished answering. It now waits long enough, and it also fills in the serial number and detects the model automatically, so you only need to enter the Access Code.

---

## v1.10.2 — 2026-06-16

### Changed

- **Bambu Lab camera is smoother and more responsive** on RTSP models (X1C, X1E, P2S, H2x…). The live view now runs at 30 fps instead of 5 and starts almost instantly — the several-second delay before the first image is gone.

### Fixed

- **Bambu Lab camera no longer gets stuck on a black screen / spinner** on A1, A1 Mini, P1P and P1S. It now reconnects on its own after a printer reboot, a Wi-Fi drop or a slow start, and gives up quickly (a few seconds instead of up to a minute) when the camera port is blocked or unreachable.
- **Bambu Lab: the camera stays off when you disable it on the printer.** If you turn the LAN camera off from the printer's own screen, the app no longer keeps trying to open it.
- **Anycubic: setting a nozzle or bed temperature no longer closes the input.** The value field used to close every time the printer sent a status update; it now stays open while you type.
- **Anycubic (cloud): the job preview thumbnail no longer flickers.** It no longer reloads on every refresh — the preview stays steady.
- **Printer Table view: print progress, status and "Updated" now refresh live.** The table used to stay frozen until you clicked Refresh; each row now updates on its own (progress %, remaining time, online status). Affects Bambu Lab, Creality, FlashForge and Snapmaker.

---

## v1.10.1 — 2026-06-16

### Added

- **Anycubic control panel now works in cloud mode too.** Homing, jogging, disabling the motors, the light, nozzle/bed temperatures, the fan, the speed mode and pause/resume/stop now reach cloud-connected printers (they previously only worked over the local network). Temperature, fan, speed and pause/stop apply to the printer's **active job**, so use them while a print is running.

### Fixed

- **Anycubic: editing a filament slot no longer flickers.** When changing a slot's material or colour, the square briefly flashed back to the old value before settling on the new one. It now switches once, cleanly.

---

## v1.10.0 — 2026-06-15

### Added

- **Anycubic cloud mode now works everywhere — including macOS and Linux.** Adding a cloud printer used to need a Windows-only trick (running the slicer in a special debug mode); now you just click **Sign in to Anycubic Cloud**, log in on Anycubic's own page in a pop-up window, and your cloud printers appear. Once added, a cloud printer shows live status, print progress and layers, **nozzle & bed temperatures**, the ACE filament slots, and — while printing — a **preview thumbnail of the actual job**. Your password is never seen by the app (you sign in on Anycubic's page) and only the session token is kept.

### Fixed

- **Anycubic (cloud): no longer stuck on "Idle" at the start of a print.** While the printer was auto-levelling before the first layer, the card wrongly showed "Idle"; it now shows "Preparing" until printing begins.

> ℹ️ The live **camera** is not available over the cloud — Anycubic gated their video service behind a newer slicer ("Video service upgraded. Update the slicer to enable.").

---

## v1.9.0 — 2026-06-15

### Added

- **Anycubic printers are now supported** — the 6th brand, alongside Bambu Lab, Creality, Elegoo, FlashForge and Snapmaker. Connect over your local network **or** through Anycubic's cloud (a mixed fleet works in one list), see the ACE multi-colour box and its slots, set a slot's filament (type + colour), and follow live job and temperature info — plus a camera feed on models that expose a local stream. Catalog: Kobra 3 / 3 Combo / 3 V2 / 3 Max / S1 / X. The Anycubic integration was contributed by **[@ennisj](https://github.com/ennisj)** (John Ennis) — huge thanks 🙌 — and extended into the full control panel below.

- **Anycubic live control panel** — drive a connected Anycubic printer straight from its side card, like Snapmaker and Elegoo: home the axes (XYZ / XY / Z) or disable the motors to move them by hand, jog X/Y/Z by 1 / 10 / 50 mm, set the nozzle and bed targets, toggle the light, control the part-cooling fan, and choose the print-speed mode (Silent / Standard / Sport). Every icon button shows an instant hover bubble that mirrors Anycubic Slicer's own wording.

- **Anycubic filament management.** Each ACE slot now reflects its real state: a present spool keeps its colour, while an empty (not-mounted) slot shows a grey “?” with the colour kept as an outline so it stays recognisable, and the material name still shows underneath. From a slot you can **Load**, **Unload** or **Stop** the filament feed — and each action is enabled only when it applies (Unload only for the spool currently in the extruder, Load only when a spool is present). The E1–E4 slots now span the full width of the card. Editing a slot no longer makes the filament card flash — it stays in place and updates only when the printer reports the change.

---

## v1.8.28 — 2026-06-14

### Fixed

- **Bambu Lab camera: smoother, lower-latency video.** The camera stream now carries frames as raw binary instead of Base64 text — that removes image-encoding work from the app's main thread (which also handles the printer connection) and shrinks the data passed around internally, so the picture updates faster and stutters less. Most noticeable on the RTSP models (X1, H2, P2S…). Builds on the frame-smoothing already added in v1.8.27.

---

## v1.8.27 — 2026-06-14

### Added

- **Locked storage slots now have two clear states.** Locking an *empty* slot marks it as unusable — it gets a grey hatched look and is removed from the rack's available capacity (so `130/198` becomes `130/197`). Locking a *filled* slot pins the material in place — it keeps the spool's colour with an amber lock badge, and is protected from moving and from "Clear all", without changing the slot count.

### Fixed

- **Bambu Lab camera: fewer micro-freezes.** Camera frames are now coalesced to one repaint per frame instead of piling up when the app is busy, which removes the stutter bursts on the printer camera view (P2S, H2C, X1 and the rest of the RTSP range, plus the JPEG models).

---

## v1.8.26 — 2026-06-13

### Added

- **Two new spool containers** in the container picker: **Anycubic** masterspool (Black, 218 g) and **DEEPLEE** cardboard spool (Standard, 143 g).

### Changed

- **Internal:** anonymous usage statistics now track spool-lifecycle counts over time (how many TigerCloud / TigerTag / TigerTag+ spools are created, and conversions between them). No personal data, no IP geolocation — same privacy-preserving, aggregate approach as before. No user-facing changes.

---

## v1.8.25 — 2026-06-13

### Fixed

- **Encoding a custom or third-party spool no longer resets it on the next scan.** When you wrote a tag for a custom spool — or a spool from another manufacturer — and then read it again, the spool reverted to the generic cardboard container and its weight changed back to the value stored on the chip. The app now keeps the container and the weight you set when you re-read an encoded tag.

---

## v1.8.24 — 2026-06-12

### Changed

- **The app now opens already populated — like Discord or Slack.** On launch, your inventory, your friends and your avatar appear in the very first frame, painted instantly from the previous session's local cache; the live data from the server then merges on top silently, repainting only what actually changed. Before, the window waited on the network — the inventory showed a spinner until the server replied, and the friends list popped in late. Product thumbnails are now served from a local on-disk cache too, so they no longer re-download on every launch.
- **New launch splash screen.** A small TigerTag splash with the logo and the app version shows the instant you open the app, and the main window only appears once it's ready to display fully — no more watching the interface assemble itself piece by piece.
- **Your sidebar friends list now scrolls** when you have more friends than fit on screen, with no visible scrollbar (Discord-style). The avatar, the Refresh / Friends buttons and the community footer stay fixed in place.

### Fixed

- **No more flickering avatars on launch.** Your avatar in the inventory header and your friends' avatars in the sidebar used to flash / reload 2–3 times on every cold start. They now paint once and stay put.
- **No more "loading shine" sweeping across every image.** A shimmer animation used to glide left-to-right over every image while it loaded (avatars, inventory, printers). Since images now load instantly from the local cache, that effect was removed — images simply appear.
- **Your initials can no longer show behind or beside your avatar photo,** and the "+" sign-in badge can no longer leak next to your initials. The avatar now always shows exactly one of: the "+" (signed out), your initials (no photo), or your photo — never a mix.

---

## v1.8.23 — 2026-06-12

### Fixed

- **No more flicker on app open — your avatar (and your friends' avatars) now appear in the very first frame.** Previously the sidebar avatar went through "empty circle → wrong letter from your email → real letter from your name → photo" on every cold start, and the friends list in the sidebar dropdown showed up empty until Firestore round-tripped. Now the app paints the cached state (your photo, your name initials, your friends with their photos and colours) instantly from local storage, and only repaints if Firestore returns something genuinely different. Same approach Discord and Slack use.
- **No more "B" or random wrong letter in your avatar circle.** Before this fix, until Firestore loaded your display name, the avatar fell back to the first letter of your email address — so for `benoit@…` the sidebar briefly showed a "B" in your colour, then jumped to your real "OM" (or whatever your initials are). The avatar now waits silently — gradient only, no letter — until your real display name is known. Cleaner and faster.
- **No more Google placeholder photo overwriting your custom avatar.** A long-standing bug was overwriting your uploaded avatar with Google's auto-generated profile picture (the "letter on coloured circle" you see when a Google account has no photo) on every sign-in. If you saw a stranger letter / colour combination instead of your uploaded photo, this is fixed; a one-time cleanup runs the next time the app opens for affected users.
- **No more "+" badge bleeding next to your initials.** A CSS specificity bug was causing the "sign in" plus-icon to show next to your initials in the sidebar avatar when you were already signed in.
- **Avatar upload on Windows 10 now opens the crop modal reliably.** A race between the file-picker's `focus` and `change` events on Windows 10's I/O scheduler was silently resolving the picker with no file, so the crop modal never opened and the upload silently failed. Switched to the modern `cancel` event for dismiss detection (kept the `focus` listener with a longer grace window as a backstop). macOS and Windows 11 were never affected.

### Changed

- **Avatar rendering centralised.** All eight places in the UI that show a coloured-circle avatar (sidebar, the "OM" header chip, dropdown, profile-management modal, edit-account modal, sidebar friend chips, friends panel, friend-view header) now go through a single rendering pipeline. The visible result: every avatar everywhere matches what's in your account exactly, with no inconsistencies between the same avatar in two places.
- **Friend chips now use a proper gradient,** matching the look of your own avatar (instead of a flat colour) — cosmetic-only, no behavioural change.

---

## v1.8.22 — 2026-06-11

### Added

- **Custom profile picture — upload your own avatar.** The colour-circle + initials avatar everywhere in Studio (sidebar, top "OM" header chip, edit-account modal, account dropdown, profiles modal, friends list, friends panel, friend banner when previewing a friend's inventory) now shows your uploaded photo when you set one. The edit flow lives in the edit-account modal: hover the avatar circle to see an edit pen overlay, click to open a menu with **Change avatar** and **Remove avatar** — same UX as Discord. Picking a file opens a dedicated "Edit image" modal with a circular preview where you can **zoom (1×–3×), rotate by 90°, and drag-to-pan** the source image until the framing is right, then Apply. The cropper auto-picks the best format on Apply: photos go out as JPEG ~30–50 KB, transparent memojis / illustrations go out as PNG that preserves the source's transparent areas (so the avatar's coloured gradient bleeds through, just like Slack and Discord). Removing the photo reverts to the legacy colour circle + your initials. Visible to your friends and to anyone previewing your friend code before sending a request (consistent with how your display name is already shown in that flow). Server-side cap at 500 KB rejects raw multi-megabyte phone photos.

---

## v1.8.21 — 2026-06-11

### Fixed

- **No more flashes or disappearing grid on the built-in Retina display.** On a MacBook's built-in Retina screen in full-screen, opening a spool side card used to make the grid flicker, lose its cards, or leave the side card as a blank rectangle — every interaction in the inventory area would trigger another wave of flashes. The cause was Chromium's compositor running out of tile memory while painting the dense grid + side panel + overlays at 2× pixel density (external monitors at 1× density never tripped the limit). The app now requests a 1 GB compositor budget from the GPU on launch, eight times the default — flashes disappear and the side card opens cleanly over an intact grid. No change for users on external monitors, on Windows, or on Linux; they were already fine.

---

## v1.8.20 — 2026-06-10

### Added

- **Open the connection tutorial straight from the printer settings.** The pencil/configure panel for a Bambu Lab, FlashForge or Elegoo printer now has a "📖 Tutoriel de connexion" button at the top — for the moment you realise you skipped the tutorial during the scan and still need to find the access code or flip LAN-only mode. The tutorial that opens follows whichever model you have selected in the dropdown, so changing from "X1 Carbon" to "P1S" to "A1 mini" walks you through three different procedures.
- **Scan results show the printer photo.** A FlashForge tile in the scan results now shows the printer's product photo on the left, like the mobile app — easier to recognise your AD5X vs your 5M Pro at a glance.

### Changed

- **One shared "extra subnets" list across every brand, synced to your account.** The Power-user "Autres réseaux à scanner" widget that appeared inside Snapmaker, Creality, Elegoo and FlashForge now also appears in Bambu Lab, and the list is the **same one** everywhere — declared once, honoured by every scan. The list is saved in your Firebase account so it's there on any device you sign in to. Existing entries from the four old per-brand stores are merged automatically on first launch.

### Fixed

- **FlashForge LAN scan finds printers on routed subnets again.** If your FlashForge sits on a different /24 than your Mac (typical multi-VLAN home network), Studio now finds it the same way the mobile app does. Three small fixes stack: the probe now talks to the printer's TCP `~M115` identity endpoint as a fallback when the HTTP probe returns the firmware's "SN is different" placeholder; the per-host timeout for user-declared subnets jumped from 350 ms to 900 ms (cross-VLAN RTT was clipping replies); and the per-subnet sweep is back to a sensible 16-probe parallelism instead of the over-engineered 4-with-50ms-gap that made a single /24 take 25 s. Live-tested against an AD5X at `192.168.20.141`: now found in seconds.
- **Connection tutorial in the printer settings now follows the selected model.** Was always opening the same tutorial regardless of the model dropdown — most visible on Bambu Lab where 11 models share 3 different tutorials.

---

## v1.8.19 — 2026-06-09

### Added

- **Printer connection tutorials, brought over from the mobile app.** Connecting a Bambu Lab — LAN-only mode, developer mode, IP + serial + access code — takes seven steps and a lot of context. The mobile app already walked users through it; the desktop app now does too. Open the Add Printer panel, and any brand with a tutorial (Bambu Lab, FlashForge, Elegoo) shows a "📖 Tutoriel de connexion" pill on its card. Click it and pick your model from the visual grid (A1 mini, A1, P1P, P1S, P2S, X1 Carbon, X1E, H2S, H2D, H2D Pro, H2C — sorted entry-level → flagship) — Studio matches your model to the right step series, walks you through each step with a screenshot and a one-sentence explanation, and lets you navigate with Prev/Next, the dots, or the arrow keys. Localised in all nine languages.

### Changed

- **Printer table sorts by status by default.** Open the Printers view as Tableau and the connected printers come up first, offline ones at the bottom. Click any column header to sort differently, like before.
- **Cleaner printer cards.** Removed the grey rectangle behind the printer photo in the Printers Grille view — the photo now sits directly on the card.

---

## v1.8.18 — 2026-06-08

### Fixed

- **Auto-update is now more robust against transient GitHub outages.** The app was hitting GitHub with the old project URL (`TigerTag_Studio_Manager`, with underscores) and relying on GitHub to silently redirect to the canonical URL (`TigerTag-Studio-Manager`, with hyphens). Every check therefore made two round-trips instead of one — and any GitHub edge hiccup on the redirect aborted the whole update check. The app now talks to the canonical URL directly, halving the requests and removing a frequent failure surface. Same fix applied to the "GitHub" buttons in the sidebar and the About dialog.

---

## v1.8.17 — 2026-06-08

### Added

- **New "Balance" weight input mode for kitchen-scale users.** Open the spool detail panel, click the pencil next to the weight, and a small **Net / Balance** toggle now sits next to the ✓/✕ buttons. In Balance mode you type the value your scale shows (filament + container); Studio subtracts the container weight automatically and writes the net to the cloud — no mental math. Hovering the Balance pill shows the live conversion ("= 736 g net (contenant : 165 g)") and the math updates as you type. The chosen mode is remembered across sessions, and you can never type a value that exceeds the spool's capacity: the input is hard-clamped at the spool's max (Net) or the spool's max + container (Balance), on every keystroke.

### Changed

- **Saving a weight no longer reloads the side panel.** Editing the weight from the slider or the manual input used to flash the product image, the "Mettre à jour le RFID" banner, the TigerTag SVG badges, and every other icon for a fraction of a second because the panel rebuilt itself after every save. The visible state now updates in place and the rest of the panel stays exactly where it was.
- **The verbose green save toast is gone.** Instead of "✓ N g disponibles (G g − C g contenant) · jumeau mis à jour" sitting under the weight bar for a full second, a small green check now pops to the right of the "POIDS" section title and gently fades out. The new value is already on the slider and in the displayed number — the math doesn't need to be spelled out every time.
- **The weight slider waits for you to actually release before saving to the cloud.** Pausing mid-drag for half a second (still holding the slider) used to burn a Firestore write at every pause; now the write only fires once you release the thumb, and re-grabbing the slider within 500 ms cancels the pending request. Fewer cloud writes, less risk of overwriting an in-progress edit from another device.
- **If someone else edits the same spool while you're dragging, the server wins.** If your phone — or another logged-in device — updates the weight on the same spool while you have the desktop slider held down, the slider now releases your grip and snaps to the value that just arrived from the cloud (and your pending save is cancelled). The display, the fill bar, and the slider thumb all line up on the new value instead of fighting each other.
- **Container card layout — the container name now sits in the same column as "Customizable" and the weight in grams**, beside the container thumbnail, instead of sitting on its own line above the card.

### Fixed

- **The "X g — hors plage" error toast can no longer get stuck under the weight bar.** Trying to type a value larger than the spool's capacity used to flash a red error message that had no auto-dismiss and just sat there until you reopened the panel. The input is now clamped at the spool's maximum on the fly — type "9999" on a 1 kg spool and the field sticks at "1000" (or "1165" in Balance mode if your container weighs 165 g). The error toast is gone for good.
- **The manual-edit input is no longer silently overwritten while you're typing.** Opening the pencil, typing "234", and having the mobile app or another device push an edit to the same spool used to silently replace your "234" with the server's value mid-keystroke; pressing ✓ would then submit the wrong number. The input now keeps what you typed until you confirm or cancel.
- **The slider thumb no longer jumps out from under your finger.** A remote weight update arriving mid-drag used to make the thumb snap to the server's value while you were still pressing it.
- **The "Mise à jour" date in the side panel now refreshes after a weight save** instead of showing an old timestamp until the next unrelated change.

---

## v1.8.16 — 2026-06-03

### Fixed

- **Spool detail side panel no longer flashes when something else changes in Firestore.** Editing a different spool — from the mobile app, from another device, or even just a write echo coming back — used to tear down and rebuild the entire side panel, flashing the product photo and every SVG icon (badges, twin link, chip status). The panel now compares the displayed spool against the last render and skips the rebuild when the visible fields haven't changed. Editing the open spool's own weight still triggers one rebuild instead of two or three, because the server-commit echo carries the same signature as the pending-write update and is now ignored.

---

## v1.8.15 — 2026-06-03

### Changed

- **Cold start is now instant from cache.** Tiger Studio now stores every Firestore snapshot in a local IndexedDB cache, so on the next launch your inventory, racks and printers appear immediately — even before the network round-trip completes — and the app stays usable when offline. Only the actual changes since your last session hit the network, which also drops your Firebase read bill close to zero on repeat boots.
- **Product thumbnails no longer flash on view switches.** Cached product images are now served as proper HTTP responses from the local app server instead of being inlined as base64 data URLs. The browser keeps the decoded bitmap alive across DOM operations, so clicking Grid, opening the detail panel, or any Firestore push no longer makes every thumbnail blink while the GPU re-decodes it.

---

## v1.8.14 — 2026-06-03

### Fixed

- **Filaments Grid and Table views no longer flash when one spool changes.** Editing a single field on a spool — moving the weight slider, picking a container, linking a twin, changing the color — used to flash the whole Filaments view because every card or row was destroyed and rebuilt from scratch on every Firestore push. Now only the spool that actually changed is touched, the product image of every other spool stays exactly where it was, and even the affected card keeps its product image intact (only the value that changed is updated). The visible flash on save is gone.
- **Printer Grid view: the per-printer job block (state pill, progress bar, filename) stops rebuilding on every brand poll tick when nothing actually changed.** FlashForge polls every 2 seconds, Bambu every 5, Elegoo every 10 — and the job block was being destroyed and re-created on every one of those, even when the printer was idle or offline. Now the block is only touched when state, progress, remaining time or filename actually changes — eliminating the residual micro-flash on the printer card.

---

## v1.8.13 — 2026-06-02

### Fixed

- **Filaments Grid and Table views no longer flash on every search keystroke.** Typing in the search bar with the Filaments view open (in Grid mode or Table mode) used to flash the whole view at every letter — every spool card or row was destroyed and rebuilt from scratch, and every `<img>` had to be re-decoded by the browser. The search now toggles a `.hidden` class on the existing cards / rows instead, so the images stay put and the filter feels instant. The same instant behaviour now also applies to the Brand / Material / Version dropdown filters and to the TigerTag / TigerTag+ / TigerCloud stat tiles.
- **Printer Grid view no longer refreshes constantly when printers are offline.** Every printer reconnect retry (every 2 to 30 seconds, per printer) used to rebuild the whole printer grid — every card image was destroyed and re-decoded, producing a visible refresh flash several times per minute on a 10-printer setup. The grid now updates only the small "online / offline" badge inside each card and leaves the rest of the card alone; the full rebuild only happens when a card actually needs to move between the "Connected" and "Offline" sections.

---

## v1.8.12 — 2026-05-31

### Fixed

- **Storage view no longer flashes on every search keystroke or rack hover.** Typing in the search bar with the Storage view open used to flash the whole grid at every letter, and sweeping the mouse between racks that both contained search matches produced a visible flash too — most noticeably on large inventories like a friend's read-only view. Both issues are now gone. The root causes were CSS animations on properties that force a per-frame GPU repaint (the orange "match" ring pulse), a hover-triggered reflow that decaled every match-slot by 14 px (the column-number coords row used to expand from 0 to 14 px on rack hover), and a full DOM rebuild of all rack slots on every keystroke. Side effect: each rack reserves a small space above the first shelf for the column-number coords in permanence (they still only become visible when you hover the rack), so racks are ever-so-slightly taller than before.

---

## v1.8.11 — 2026-05-31

### Added

- **Contextual "+ Add Rack" inside the "Spools not stored" side panel.** When you have more unstored spools than free slots — i.e. you actually need more rack capacity — an orange-accented CTA appears right inside the side panel with a short explanation. Hidden when there's still room to drag spools into existing racks, so it doesn't pollute the panel when it isn't needed.

### Changed

- **"+ Add Rack" moved into the main header.** The small "+ New Rack" tile that lived inside the rack stats bar is gone — the standard header "Add" button (which says "Add Product" in inventory views and "Add Device" in printer views) now says **"Add Rack"** when you're in Storage, and clicking it opens the new-rack modal. One consistent place to add things, whichever view you're in. The empty-state CTA when you have zero racks is unchanged.

### Fixed

- **Storage stats no longer count ghost spools.** Both the global header (filled / total slots, free) and the per-rack header (filled/total) used to include any spool that still had a rackId set — even if the rack had been deleted or the spool's level/position were out of bounds. That allowed the filled count to exceed total capacity (e.g. "130/117 slots", "0 free") and per-rack numbers to be larger than what was actually visible in the slots. Stats now require the rackId to match a current rack and the level/position to fall inside its grid, so the numbers always match what you see.
- **Deleting a rack now fully unassigns the spools that were inside it.** The old code only nulled the new-style `rack` field, leaving the legacy flat `rack_id` / `level` / `position` fields intact — so the spool stayed ghost-assigned to a rack that no longer existed and silently inflated the storage stats. Both shapes are now cleared on rack deletion. Pre-existing orphans from older deletions are also auto-cleaned the first time you open the Storage view, and they show up in **"Spools not stored"** in the meantime so you can see and re-assign them immediately.
- **Cam view empty state was showing raw key names** ("camWallEmptyTitle" / "camWallEmptySub") instead of localized text after switching back and forth between Cam and Printer Grid. The two missing translations were added across all 9 locales — the empty state now reads "No cameras online — Add a printer with a camera to see live feeds here." in English (and the equivalent in every other language).

---

## v1.8.10 — 2026-05-30

### Added

- **Bambu Lab and Elegoo printers now show up in the network scan.** *Add printer → Bambu Lab → Scan network* discovers Bambu printers via SSDP — they announce themselves on the LAN, no setup needed. *Add printer → Elegoo → Scan network* discovers Elegoo printers (Centauri Carbon 2 and later) by sending a quick UDP probe to every host on your local subnets. Each scan offers one-click add with the serial number, model, IP and name already filled in. There's also a manual *Enter IP address* path and an inline *Add by IP* shortcut for printers the scan can't reach directly; the common Elegoo subnets (192.168.1.x, 192.168.40.x) are always scanned, and any extra subnets you add persist across a *Restart scan*. With Creality, Snapmaker and FlashForge already shipping discovery, every supported brand now has it.
- **Storage view: the hover tooltip on a rack slot now shows the spool's material image** as a full-height left column (for TigerTag+ spools that have a product photo). The bubble keeps everything that was already there — brand, material, color, weight bar, coordinate, lock indicator — on the right. Falls back to the previous single-column layout when no image is available.

### Changed

- **Printers are reported online only once the connection is really established** — i.e. after the first real frame/report/heartbeat arrives — not the instant the network socket opens. Previously Snapmaker and Creality flipped to "online" the moment the WebSocket connected, and Bambu / Elegoo the moment the MQTT broker accepted them, even before the printer itself had answered. Now every brand waits for real data first, so a printer that's reachable but not yet responding stays "offline" exactly as you'd expect. Elegoo printers in "connecting" state are also correctly shown offline instead of "checking", in line with the other brands.
- **Elegoo: the MQTT credential field is now required and properly named.** What used to be labelled "MQTT password (optional)" in *Printer Settings → Elegoo* is now **"Access code"** and is required — matching the label the printer itself uses on its network settings screen. The hint tells you where to find it (factory default is still `123456`).
- **Cleaner Printer Settings form.** The small-caps "Credentials" section header and the horizontal divider line between sections are gone across all brands. The form now reads as one continuous block of connection fields instead of looking like several separate cards stacked on each other.
- **Read-only mode in a friend's inventory hides the write-action buttons.** The *+ Scan* and *Add* buttons no longer appear when you're viewing a friend's inventory — they can't act on someone else's collection anyway. They reappear automatically when you return to your own view.
- **Header backend-health indicator** uses a new 3D cloud icon design (the other cloud icons elsewhere in the app are unchanged).

### Fixed

- **RFID rescan no longer erases your spool data, and the chip weight now syncs automatically to the database value.** Re-scanning a spool used to silently wipe every Firestore field that wasn't on the chip — container assignment, custom note, capacity, etc. — and replace the current weight with whatever the chip held, which is almost always stale because the weight slider only writes to the database and nothing was ever updating the chip back. Three-part fix: user-edited fields are now preserved on rescan; the weight is no longer rolled back to the chip's value on a regular rescan; and when the database weight differs from what the chip shows, the app writes the new value directly onto the chip while it's still on the reader (only the 3 bytes that hold "Measure Available" are touched). Chip and database now converge every time you tap a spool. New chips and chip-rewrite flows are unchanged.
- **Password-eye and clear-input buttons no longer jump down** when clicked — a global CSS rule was overriding the absolute-positioning transform on these icon buttons, making them drop ~14 px on every click in Printer Settings, the login modal, and the Add printer form.
- **Printer Settings inputs no longer change size when you click the eye toggle** to show/hide a password — the field now stays the exact same dimension regardless of whether the password is hidden or shown (was jumping from 36 → 40 px tall and 13 → 14 px text on every toggle).

---

## v1.8.9 — 2026-05-29

### Added

- **Creality printers now show up in the network scan** — *Add printer → Creality → Scan network* discovers Creality machines on your LAN (K-series, K2, and current-gen Enders running Klipper, e.g. the Ender-3 V4) and adds them in one click, just like Snapmaker and FlashForge. There's also a manual *Enter IP address* path and an inline *Add by IP* shortcut for printers the scan can't reach directly. The common Creality home subnets (192.168.1.x, 192.168.40.x) are always scanned, and any extra subnets you add now persist across a *Restart scan*. Verified live against an Ender-3 V4.

### Changed

- **Adding a Creality printer no longer requires a username/password** — the *Root* account and password fields are now optional. Most Creality printers expose their control channel without authentication, so you can add and connect to them without entering anything; only fill them in if your printer's firmware enforces a login.
- **A friend's inventory is cleaner in read-only mode** — when viewing a friend's inventory, the *+ Scan* and *Add* buttons are now hidden, since those actions can't apply to someone else's collection.

---

## v1.8.8 — 2026-05-29

### Fixed

- **Bambu RTSP cameras (X1C / X1E / P2S / H2x) now actually stream** — the camera launched ffmpeg with `-tls_verify 0`, an option the bundled ffmpeg doesn't recognise, so it errored out and showed nothing as soon as it reached a reachable printer. Removed the flag — TLS verification is off by default, so the printer's self-signed certificate is still accepted. This completes the cross-platform camera fix (Windows + macOS), verified live against a P2S.

---

## v1.8.7 — 2026-05-29

### Fixed

- **Bambu RTSP cameras (X1C / X1E / P2S / H2x) now actually work on Windows** — v1.8.6 bundled ffmpeg, but the app resolved its path inside the read-only `app.asar` archive, which Windows can't launch, so the live camera stayed black. The app now uses the real on-disk binary, so the stream works. (macOS / Linux were unaffected.)

---

## v1.8.6 — 2026-05-29

### Fixed

- **3D-printer RTSP cameras now work on Windows** (Bambu X1C / X1E / P2S / H2x) — ffmpeg is now bundled with the app on every platform, so the live camera works out of the box with nothing extra to install. Previously Windows had no ffmpeg available, so the RTSP camera stayed disabled.
- **Update notification tooltip showed raw HTML** — the auto-update status icon no longer displays literal `<strong>` tags in its tooltip.

### Changed

- **Encode modal (TigerCloud → TigerTag) — cleaner and safer**
  - Centred title; the redundant Cancel button is gone (close via the ✕ or a backdrop click — allowed any time, including mid-burn to abort); a permanent instruction sits above the readers.
  - Each reader is now drawn as a TigerTag "reader plate" carrying the white logo, with a corner status LED (red = no chip · green = chip detected), mirroring the ACR122U.
  - Presenting a chip while the modal is open no longer pops a spool side-card over it.
- **Header status icons unified** — TigerScale, TD1S and the RFID readers now share larger, consistent 3D icons. The two RFID reader badges are replaced by a single TigerPod icon (red = no reader · green = connected); hovering reveals each reader (RFID #1 / #2) and the UID of any chip presented.
- **Storage — "Clear all" now protects locked slots** — spools in a locked slot stay put when you clear a rack; the only way to remove one is to delete the spool itself.

---

## v1.8.5 — 2026-05-28

### TigerCloud → TigerTag — guided encode

- Encoding a TigerCloud spool to a physical chip now opens a **guided modal** (titled by the migration itself, *TigerCloud → TigerTag*) instead of a one-shot click.
- **Presence-gated**: the burn stays locked until every connected reader holds a chip; each reader's state is shown live by colour (no clutter text), with a single global progress bar.
- **Sequential, verified burn**: chips are written one after another (100 ms apart) and **each write is read back and verified byte-for-byte** — a chip only turns green on a confirmed match.
- **All-or-nothing**: the Firestore migration (create the physical spool, delete the Cloud one) runs **only after every chip verifies**. Any failure — including a chip moved off the reader mid-write — fails the whole sequence with nothing written to the cloud, and the modal stays open to retry from scratch.
- Safety: warns before overwriting a non-blank chip (with an "I understand" toggle), refuses two identical chips, and a single chip-epoch timestamp is shared so a twin pair is written identically.

### Fixed

- **Physical chip "Manufactured" date wrong (~2056) on burn** — the chip timestamp was written as Unix seconds instead of the TigerTag chip epoch (seconds since 2000); now corrected, so a freshly-burned chip reports the right manufacturing date.

---

## v1.8.4 — 2026-05-28

### Fixed

- **TigerCloud "Manufactured" date wrong (~2056)** — Cloud spools stored their creation time as a Unix timestamp instead of the TigerTag chip epoch (seconds since 2000), so the decoded manufacturing date overshot by ~30 years. Fixed at creation (Add Product, Duplicate); the display also defensively corrects already-created spools. The stored value is now correct when a Cloud spool is later burned to a physical chip.
- **Storage — linked (twin) spools counted twice** — a twin pair (one physical spool, two tags) now shows and counts **once** in the "not stored" list, the not-stored count, the free-slot count, and each rack's header count (no more over-capacity like `28/27`). Auto-fill no longer scatters the two tags of a twin into separate slots.

### Changed

- **View toggles — consistent icons + order** — the materials toggle is now **Grid · Table · Storage**; both toggle groups share the same Grid (`⊞`) and Table (list) icons and the same translations (fixes the FR mismatch where the printer "Table" stayed untranslated). The printer "Cam" label is now localised.

### Added

- **Usage telemetry — geographic dimension** — alongside the existing version / OS / language / session metrics, the app now records a locale-derived country code and IANA timezone (offline, no IP geolocation), plus lifetime `langsUsed` / `countriesUsed` aggregates, for future usage statistics.

---

## v1.8.3 — 2026-05-28

### Spool detail — Duplicate (×N)

- New **Duplicate** tool at the top of the spool toolbox (hold 1 s to confirm) with a **− N + quantity stepper** (1–50): mint one or many copies in a single write. The button label tracks the count ("Duplicate ×N").
- Available for **TigerCloud** and basic **TigerTag** spools; **TigerTag+** can't be duplicated. A basic TigerTag necessarily becomes TigerCloud (a digital clone has no physical chip), so each copy gets a fresh Cloud UID.
- Copies are identical to the source but carry **no twin link and no rack placement** (nothing physical exists in a Cloud entry). Copy timestamps are staggered **+3 s** apart so identical copies are never auto-paired as twins.

### Spool detail — editable note

- The spool's `message` is now an **inline-editable free-text note**: click the name in the detail panel, type, Enter/blur to save, Escape to cancel. Placeholder "Add a note" when empty.
- Available on **every spool type** (TigerCloud, basic, TigerTag+) — on TigerTag+ the catalogue name (e.g. "Artic Teal") stays read-only with the editable note below it; on TigerCloud/basic the note is the spool's name.
- **28-byte UTF-8 cap** (the chip's name slot) with a thin usage bar that fills as the budget is consumed (blue → amber → red), no number shown.
- Editing the note is a **chip change**: it now flags the spool (and its twin) for re-burn — the chip-update badge + banner appear, exactly like editing TD or colour. Skipped for TigerCloud (no physical chip).
- Identity block restructured: **Brand · Series · Material on one line**, the note on its own full-width line below.

### TigerCloud — renamed from "TigerTag Cloud"

- The third tier is now called **TigerCloud** everywhere (badge, stat tile, filters).

### Bambu Lab — camera transport

- Camera transport (JPEG-TCP vs RTSP) is now driven by a `camera_transport` field in the printer model catalogue instead of hardcoded serial/ID sets — more robust across the lineup. Added the **X2D** model.

### Fixed

- **Bambu printers — IP now shows in the printers table** (it's stored as the MQTT broker address, which the table/sort now read).

---

## v1.8.2 — 2026-05-24

### TigerPOD modal — full visual redesign

- **Hero video** — replaced the NFC SVG icon with the product helper video (`assets/video/tiger_pod/helper_tiger_pod_movies.mp4`); plays on modal open, pauses on close. Rings animation kept behind the video.
- **Layout** — title "Tiger POD Free STL" moved above the video; hero `padding-top: 16px` for breathing room; hero height 240 px (was 200 px); video height 156 px (+30 %).
- **Copy overhaul** (all 9 locales):
  - Modal title: "Build your TigerPOD" → "Print your TigerPOD Now !"
  - Description: "program" → "Burn TigerTag RFID chips"
  - CTA button: "Print on MakerWorld" → "Download & Print STL Free"
  - Stats bar (⚡12 Boosts · ❤21 Likes · Free) → "Please ⚡Boost & ❤Like"
  - Brand label "TigerTag.io" removed; product name "Open Spool Pod" → "Tiger POD Free STL"
  - Print spec strip (`0.2 mm · 8% infill · ~7 h`) removed
- **Feature cards** — icons replaced by numbered orange gradient badges ①②③④; updated copy: Dual RFID Reader / Dual Link / Print in Place / 1kg Standard spool with matching sub-labels.
- **AutoScan without reader** — `+ Scan` button now opens the TigerPOD modal when no reader is connected (previously opened the Pod Scan panel).

### Pod Scan side-panel — removed

- `<aside id="scanPanel">`, overlay, and all associated DOM were removed — the panel had no remaining triggers.
- JS: `_openScanPanel`, `_closeScanPanel`, `_updateScanPanel` and their listeners deleted.
- CSS: full `.scan-dp` / `.sdnr-*` block removed from `70-detail-misc.css`.
- i18n: 4 orphan keys removed (`scanPanelTitle`, `scanPanelWaiting`, `scanPanelNoReader`, `scanPanelNoReaderSub`). **791 keys × 9 locales.**
- Debug panel: "⌥ Open Pod Scan" button removed.

### Bambu Lab MQTT — stability fixes

- **No more data wipe on reconnect** — `bambuConnect` preserves `conn.data` when reconnecting to the same IP; the UI no longer flashes to zero while the MQTT handshake completes.
- **No more false "idle" overwrite** — `_normState` returns `null` (not `"idle"`) when the message contains no state field; `_bblMerge` only updates `d.printState` when a real state is present (`!= null`).
- **AMS / external tray merge already correct** — merge-by-ID loop introduced in v1.8.0 preserved; old-firmware temp fallback gated on `!dev`.

### Printer grid/table — click reliability

- **Bambu status changes no longer cause full grid rebuild** — `_bblNotify` only passes `statusChanged=true` (→ `renderPrintersView()`) when the printer actually crosses the online/offline section boundary; intermediate connecting-state transitions just update the badge in-place via `_bambuRefreshOnlineUI`. Eliminates the DOM-rebuild race that swallowed clicks during connection.
- **Document-level mouseup fallback** — if a DOM rebuild happens between `mousedown` and the `click` event (causing the click to land on a detached element that doesn't bubble), `_pendingPrinterOpen` is consumed by a `document mouseup` + `setTimeout(0)` safety net. Works for both grid and table views.

### Color edit modal (TD1S) — swatch pencil icon

- Edit pencil always visible at 65 % opacity, 95 % on hover.
- **Light-color detection** (`_ceIsLight`) — perceptual luminance formula `(0.299R + 0.587G + 0.114B)/255 > 0.55`; black icon + dark hover ring applied via `ce-swatch--light` class when the swatch background is light.
- `_ceUpdateSwatch(swatchEl, hex)` centralises background + icon color + class updates.

### Add Product modal — TD1S integration

- TD1S button in ADP now opens "Set Color & TD Value" modal (was the tester modal).
- Save writes back to `_adpColorSlots` + `adpTd` input (not Firestore) via the `onSave` callback on `openColorEditModal`.

### Product ID help modal

- ✕ close button removed (backdrop click remains the close affordance).
- "Explore the TigerTag+ material list" button closes the modal after opening the external link.
- Label updated: "Browse the TigerTag material list" → "Explore the TigerTag+ material list" (all 9 locales).

### Mini dashboard — badge labels

- Stat chip labels now render actual badge HTML (`<span class="tag-diy">`, `<span class="tag-plus">`, `<span class="tag-cloud">`) instead of plain text.
- TigerCloud chip styled identically to the other chips (removed purple override).

### RFID reader badges — filled pill redesign

- **Disconnected** — filled red gradient `#be2d2d→#d83b3b`, white text, `opacity: .85`.
- **Connected** — subtle green tint background, `color: var(--success)`.
- **Card present** — filled green gradient `#0d8a52→#1aaf6c`, white text.

### Tiger Scales — header badge

- `⚖` emoji replaced by a "Tiger Scales" text pill badge in the header status bar.
- Three CSS states: gray/transparent (no scale), green tinted (connected), red tinted (no scale paired).

### TigerTag+ product preview

- After clicking "Check" with a product ID, the preview now shows the full label: **Brand · Series · Name · Weight · Refill** (e.g. "R3D PLA High Speed Orange 1kg Refill").
- Brand name sourced from `api.brand` (catalogue field) — more reliable than the local numeric `id_brand` lookup at check time.
- "Refill" token only shown when `api.filament.refill === true`.
- Thumbnail enlarged (44 × 44 px, border added).

### Detached Camera Wall

- New standalone window (`renderer/cam/`) showing all online printer cameras simultaneously — open via the "Detach" toolbar button in the cam view.
- Supports all camera types: Bambu Lab (MJPEG over IPC), Creality (WebRTC), Snapmaker / FlashForge (iframe).
- MJPEG and Bambu frames forwarded to the detached window via `BroadcastChannel('cam-frames')` with zero-copy `ArrayBuffer` transfer.
- Creality WebRTC uses a single `RTCPeerConnection` shared across the cam wall card, the printer sidecard, and the detached window — prevents duplicate connections (firmware only accepts one peer at a time).

### Image loading — skeleton animation

- All web-sourced images now display a shimmer skeleton while loading (TigerTag+ preview, add-from-web, product check, etc.).
- Auto-applied via `MutationObserver` — no per-site instrumentation needed.
- Smooth fade-in once the image loads.

---

## v1.8.1 — 2026-05-23

### Build fix
- Rebuild to fix CI artifact mismatch (v1.8.0 GitHub release had stale `latest-mac.yml` checksums from an earlier partial build — auto-updater would have failed checksum verification)
- No code changes from v1.8.0

---

## v1.8.0 — 2026-05-23

### Cloud spool → physical chip encoding

- **`rfid:encode-cloud` IPC handler** — builds the TigerTag payload once from a Cloud spool Firestore doc, then writes the same bytes (same timestamp) to every target reader. Up to 2 readers (one per TigerPOD slot) receive identical chips atomically.
- **`_encodeCloud(r)` in renderer** — on success, promotes the Cloud spool: replaces the `CLOUD_…` spoolId with the first chip UID, establishes a twin link when two chips were written, and hard-deletes the Cloud doc. Inventory refreshes via onSnapshot.
- **`_burnRfid(r)`** — writes updated data (weight, color, …) back to a physical chip that is already linked to a spool. Clears `needUpdateAt` on success.

### NFC process — NTAG page-read fix

- **`blockSize=4`** — the nfc-pcsc `reader.read()` increment formula was producing overlapping pages with `blockSize=16`. Setting it to 4 (one NTAG page = 4 bytes) makes reads fully sequential (pages 4–39, 144 bytes). All chips now parse correctly from first insertion.
- Reader registry refactored to a `Map` for cleaner per-reader lifecycle.
- `readerName` forwarded with every `rfid-tag-scanned` event for multi-reader disambiguation.

### TD1s — unified color + TD modal

- `openTdEditModal` now redirects to `openColorEditModal` — a single flow handles both color and TD scanning.
- Multi-slot support (1–3 colors): slot-switching UI, per-slot hex values, active-slot indicator.

### Telemetry — professional two-level architecture

- **`users/{uid}` (last-known client state)** — `studioVersion`, `studioElectron`, `studioPlatform`, `studioArch`, `studioOsRelease`, `studioOsVersion`, `studioLang`, `studioLocale`, `studioLastSeen`. Overwritten on every session.
- **`users/{uid}/telemetry/studio` (lifetime aggregates)** — `sessionsCount` (`FieldValue.increment`), `versionsUsed` / `platformsUsed` (`FieldValue.arrayUnion`), `lastSeen`, `td1sUsed` (latched to `true` on first TD1s connection), `rfidReadersMax` (high-water mark of simultaneous readers). Never decremented.
- `app:info` IPC extended with `osVersion` (human-readable via `os.version()`).
- Firestore Security Rules updated: `users/{uid}/telemetry/{docId}` enforces `hasOnly()` field guard, `td1sUsed == true` constraint, `rfidReadersMax in [1, 2]` constraint. Deployed.

### TigerPOD modal — complete redesign

- Content sourced from the real MakerWorld page ([#1289152](https://makerworld.com/fr/models/1289152)).
- **Hero** — gradient purple, animated pulsing rings, "TIGERTAG.IO" brand + "Open Spool Pod" product name.
- **Stats bar** — `⚡ 12 Boosts · ❤ 21 Likes · Free` overlay at hero bottom.
- **Feature grid 2×2** — Dual reader slots / Encode 2 chips / No supports / Any 1 kg spool; each cell has an icon + title + subtitle.
- **Print spec strip** — `🖨 0.2 mm · 8% infill · ~7 h`.
- **CTA button** — orange primary "Print on MakerWorld" with printer icon. Card width 400 px (was 340 px).
- **Three triggers** — modal opens from: cloud banner (no reader), "Please update RFID" banner (no reader), red RFID disconnected badge in header.

### RFID badge — always visible

- Badge is always rendered; **disconnected state** shows a red pulsing dot, `cursor: pointer`; clicking opens TigerPOD.
- Connected states unchanged (green dot; card-present variant for chip-on-reader).

### Banners — fully clickable + smart routing

- **Cloud encode banner** and **chip update banner** are now fully clickable (whole row, not just the button).
- When no reader is connected, both banners route to the TigerPOD modal instead of silently no-op-ing.

### i18n — 13 new keys (TigerPOD redesign)

`tigerPodBoosts` · `tigerPodLikes` · `tigerPodFree` · `tigerPodFeat1Title/Desc` · `tigerPodFeat2Title/Desc` · `tigerPodFeat3Title/Desc` · `tigerPodFeat4Title/Desc` · `tigerPodPrintSpec`. All 9 locales. `tigerPodModalDesc` updated to shorter copy. Total: 778 keys.

---

## v1.7.7 — 2026-05-20

### Google sign-in — no more broken passkey popup on loopback failure

- When the loopback OAuth flow fails (user closed the browser tab, network error, etc.), the app no longer silently falls back to `signInWithPopup`. That popup opens a Chromium BrowserWindow which cannot talk to the macOS authd daemon — Google's "Use your passkey" UI appears but is inert, leaving the user stuck.
- Instead a clear error toast is shown: **"Google sign-in via browser failed — please try again or use email/password."** The user stays on the login form and can retry the loopback flow or switch to email/password.

---

## v1.7.6 — 2026-05-20

### Windows — renderer server bind fix (definitive)

- **Root cause**: `startRendererServer` tried to bind to `'localhost'` first. On Windows 10/11 with Node.js 17+ (Electron 41+), `localhost` can resolve to `::1` (IPv6). If IPv6 is disabled on the machine, `server.listen` fails with `EADDRNOTAVAIL`. The v1.7.2 / v1.7.3 fallback logic partially addressed this but still sent `http://127.0.0.1:PORT` to `loadURL`, breaking Firebase Google sign-in (`auth/unauthorized-domain`).
- **Fix**: the server now **always binds to `127.0.0.1`** (explicit IPv4 loopback — never ambiguous, works on all Windows versions regardless of IPv6 state). `BrowserWindow.loadURL` always uses **`http://localhost:PORT`** (Chromium resolves `localhost` → `127.0.0.1` at TCP level, Firebase Auth accepts the named host). The two responsibilities — server bind address and browser origin — are now cleanly separated.
- `tryBind` simplified: no more host parameter, no more localhost→127.0.0.1 fallback branch. Only the EADDRINUSE (port taken) case is handled, by retrying on port 0.

---

## v1.7.5 — 2026-05-20

### Persistent logging

- **`electron-log`** added — all `console.log / warn / error` calls are now automatically written to a rotating log file (5 MB max):
  - **Windows** : `%APPDATA%\Tiger Studio Manager\logs\main.log`
  - **macOS**   : `~/Library/Logs/Tiger Studio Manager/main.log`
  - **Linux**   : `~/.config/Tiger Studio Manager/logs/main.log`
- First log line on every launch: `Tiger Studio Manager starting — vX.Y.Z`
- Useful for diagnosing launch failures on user machines (e.g. Windows IPv6 issues) without requiring users to run from a terminal.

---

## v1.7.4 — 2026-05-20

### Spool sync — ISO with printer pattern

- **Hard delete for spools** — `markSpoolDeleted` now issues a Firestore `batch.delete()` instead of writing a `deleted: true` tombstone. Twin is hard-deleted in the same batch. No resurrection possible once the doc is gone.
- **Anti-resurrection guard** — `cloudSync` flag (local-only, never pushed to Firestore) marks every spool that has ever reached the cloud. If Tiger Studio later hard-deletes it and Flutter reconnects, Flutter's push path skips the entry instead of sending it back. ISO with the existing printer pattern.
- **`purgeLegacyTombstones`** — on every live Firestore snapshot, any remaining `deleted: true` docs (written by pre-v1.7.4 clients) are automatically hard-deleted. One-shot migration; no-op once migration is complete.
- **Removed "Show deleted" feature** — spools are now always hard-deleted; the debug panel "Deleted" tab and its HTML/CSS/JS were removed entirely. Cleaner architecture, no stale data accumulation.
- **`updatedAt` field** — renamed `last_update` → `updatedAt` (ISO with the printer data model). All Firestore writes now use `FieldValue.serverTimestamp()` for `updatedAt`. `normalizeRow` reads `updatedAt` first with fallback to `last_update` for legacy documents already in Firestore.

### Container auto-assignment

- **`resolveContainerForBrand(brandId)`** — mirrors Flutter `_resolveSpoolForBrand`: (1) brand-specific match, (2) Generic fallback (`brandId == 0` → `custom_cardboard`), (3) first catalog entry.
- **`autoAssignMissingContainers(uid, inventoryRaw)`** — called on every live Firestore snapshot. Finds spools without `container_id`, resolves the container from brand, and batch-writes `container_id` + `container_weight` + `updatedAt`. Self-healing: new spools added via "Add Product" get a container automatically on the next snapshot. No-op once all spools have a container.

---

## v1.7.3 — 2026-05-19

### Hotfix — Firebase Auth broken after v1.7.2 Windows fix

The v1.7.2 fix bound the renderer HTTP server to `127.0.0.1` instead of `localhost`. Firebase Authentication only authorises named hosts — `localhost` is whitelisted by default, raw IP addresses are not. Every user on v1.7.2 received `auth/unauthorized-domain` on Google sign-in.

**Root cause / v1.7.2 mistake**: both the server *bind* host and the `loadURL` origin were changed to `127.0.0.1`. The server bind change was correct; the URL origin change was not.

**Fix**: `startRendererServer` now implements a proper multi-step bind strategy and returns `{ port, host }` instead of just the port number:

1. Try `localhost:5784` — preferred. Origin = `http://localhost:5784`, which Firebase recognises → Google sign-in works.
2. If `EADDRINUSE` → retry `localhost:0` (any available port, same origin hostname).
3. If `localhost` bind fails altogether (Windows 10 + IPv6 disabled → `EADDRNOTAVAIL`) → fall back to `127.0.0.1:0`. Google sign-in won't work on this configuration, but the process no longer crashes and email/password auth is unaffected.

`createWindow` uses the actual `host` returned by the server (`http://${host}:${port}/…`) so the two are always in sync.

---

## v1.7.2 — 2026-05-18

### Camera wall — size controls & stream stability

- **½× compact size mode** — new first button in every cam-wall card header. A ½× card spans one sub-column (~160 px min), so four compact cameras fit in the horizontal space of one 2× card. The card header adapts automatically (smaller padding, brand pill hidden, reduced button size).
- **Overlay headers** — cam-wall card headers are now `position: absolute` and float over the top of the camera feed with a dark gradient, hidden at rest and revealed on hover. This removes the fixed header height from the card's layout, so card height is determined purely by the 16:9 camera content. Two ½× cameras stacked no longer exceed the height of one 2× camera.
- **`align-items: start` on the cam wall grid** — cards are sized to their content only; cards in the same grid row no longer stretch to match the tallest neighbour (which caused large black voids below 1× cameras placed next to 2× ones).
- **Patch-mode render — no stream restart on size/order change** — `_renderPrinterCam` now detects when only `camSize` or `camSortIndex` changed (Firestore echo after a button click or DnD drop). It updates CSS classes and `style.order` in-place on the existing DOM nodes, never touching `host.innerHTML`. iframe WebRTC sessions and MJPEG streams survive size changes and reordering completely.
- **CSS `order`-based DnD reorder** — drag-and-drop reorder now reassigns `card.style.order` values instead of moving DOM nodes (`insertBefore` / `insertAdjacentElement`). Browsers reload iframes on any DOM detach+reattach; the CSS `order` approach keeps every node in its original DOM position so WebRTC and MJPEG streams are never interrupted.
- **Fullscreen header** — in `--fs` mode the header reverts to normal document flow (visible, background `--surface`, border-bottom) so the flex column layout fills the viewport correctly.
- **i18n** — 4 new keys across all 9 locales: `camSizeCompact`, `camSizeNormal`, `camSizeWide`, `camSizeFullscreen`.

### Windows 10 — crash on launch fix

- **Root cause**: `startRendererServer` bound the dev HTTP server to `'localhost'`. On Windows 10 with Node.js 17+ (bundled in Electron 41), `localhost` resolves to `::1` (IPv6). If IPv6 is disabled on the machine, `server.listen` fails with `EADDRNOTAVAIL` — not `EADDRINUSE` — which hit the `else { reject(err); }` branch and raised an unhandled promise rejection. In Node.js 15+, unhandled rejections terminate the process, causing the app to crash silently at every launch.
- **Fix**: the server now binds to `'127.0.0.1'` explicitly across all code paths (initial listen, EADDRINUSE fallback, other-error fallback). All error branches now call `resolve()` with a fallback random port — the process can never be crashed by a server-bind failure. Added `.catch()` on the `startRendererServer().then()` call in `createWindow()`.

### MJPEG cam_manager — generic mux module

- **`renderer/printers/cam_manager.js`** (new) — brand-agnostic MJPEG stream multiplexer extracted from `flashforge/cam_mux.js`. One `fetch()` per printer key, N consumer `<img>` elements receive each JPEG frame as a `blob:` URL. A 2-second grace period on last-consumer-unregister avoids unnecessary reconnections when the user switches between views (sidecard open/close, cam wall / grid toggle).
- **`flashforge/cam_mux.js`** now delegates entirely to `cam_manager` via six re-exported aliases (`camStart` → `ffgMuxStart`, etc.). The FlashForge-named public API is preserved for callers.

### Creality — connection stability

- **`creConnect` IP guard** — early-return if no `printer.ip` is configured (avoids silently opening a WebSocket to an empty string).
- **Abandoned connection fast-path** — `crePingPrinter` skips the HTTP probe and immediately returns `offline` for connections flagged `_abandoned` (3+ consecutive failures), avoiding redundant network round-trips.
- **Already-managed IP** — `creConnect` now treats any existing conn with the same IP as "already managing" (even if `_abandoned`), deferring to an explicit user reconnect instead of silently replacing it.

---

## v1.7.1 — 2026-05-17

### Printer grid & table — live status and progress

- **Status pills in grid cards and table** — every connected printer now shows its live state (Idle, Printing, Paused, Preparing, Complete, Error, …) directly in the grid card and table row without opening the sidecard. Offline printers show nothing; connected-but-idle printers show a muted grey pill; active jobs show the progress bar + `XX% · 1h 23m`.
- **ISO visual style** — the state pills in cards and table use the exact same `snap-job-state snap-job-state--{state}` classes as the sidecard, scaled via `.snap-job-state--compact`. Spinning ring animation on `printing` and `preparing`, colour-coded per state (blue=printing, amber=paused/preparing, green=complete/finished, red=error/failed, grey=idle/standby/ready).
- **Online badge pill** in grid cards now matches the sidecard pill: rounded background + coloured border (green for online, amber for connecting, grey for offline).
- **Filename + remaining time** — when a job is active, the truncated filename appears below the progress bar and remaining time is shown alongside the percentage (`42% · 1h 23m`). BambuLab, Elegoo, and Creality expose remaining time; all brands expose the filename when printing.
- **Cross-brand normalisation** — `_getPrinterJob` now returns a uniform `{ state, pct, isActive, filename, remainSec }` for all five brands. Creality's numeric `d.state` is normalised to `idle`/`printing`/`complete`; remaining time converted from brand-specific units (BambuLab minutes, Elegoo ms, Creality seconds).
- **New i18n keys** across all 9 locales: `snapState_finished`, `snapState_preparing`, `snapState_failed`, `snapState_ready`.

### Printer grid — Online/Offline partition fix (all brands)

- **Root cause**: `ctx.onPrinterGridChange` referenced `_printerSub`, a `const` scoped inside `renderPrintersView()`. In strict mode (ES modules) this threw a silent `ReferenceError` on every RAF tick, swallowing the re-partition call — printers that connected after the initial render were stuck in the Offline section indefinitely. Fixed: `state.viewMode !== "printer-cam"`.
- **RAF coalescing race** (all 4 brand drivers): the shared RAF flag for `statusChanged=true` (re-partition) and `statusChanged=false` (surgical job patch) could block the connected-status RAF on a fast LAN. Fixed by splitting into two independent flags (`_xxxStatusRaf` / `_xxxGridRaf`) per brand.

### Camera improvements

- **Cam wall card → click → sidecard** — clicking any camera wall card opens the sidecard for that printer. CSS `cursor: pointer` + `border-color` hover feedback on `.cam-wall-card`.
- **FlashForge MJPEG multiplexer** (`cam_mux.js`) — a single `fetch()` reads the MJPEG stream and distributes JPEG frames to all registered `<img>` consumers (cam wall + sidecard simultaneously) with zero extra connections. Respects FlashForge's 1-client limit. Stream auto-stops when the last consumer unregisters.
- **Creality camera persistence** — `_activeIp` tracking prevents redundant WebRTC restarts on WS reconnect. `#creCamContainer` persists in the DOM; `.cre-cam-hidden` toggled by CSS instead of DOM removal.

---

## v1.7.0 — 2026-05-15

### DB pipeline — unified reference data layer
- **`tigertagDbService`** is now the single source of truth for all TigerTag reference JSON files (brands, materials, aspects, types, diameters, units, versions). The renderer loads these via IPC (`window.electronAPI.db.getLookups()`) instead of direct `fetch()` calls, so both the inventory view and the live printer integrations draw from the same data.
- **`assets/db/tigertag/`** — reference files relocated to `assets/db/tigertag/id_*.json` (official TigerTag naming). A `last_update.json` timestamp file is bundled alongside so the app knows the embedded data's age from day one.
- **GitHub mirror fallback** — `tigertagDbService` tries the TigerTag API first; if unreachable it falls back to the auto-synced GitHub mirror (≤ 6 h stale). Offline users still get their last cached copy from `userData/db/tigertag/`.
- **Atomic writes with JSON validation** — every dataset is validated (non-empty array, each entry has `id`) before overwriting the local cache file. A truncated or malformed API response is rejected; the previous good file is kept intact.
- **First-launch seed** — on a fresh install, `tigertagDbService` reads `last_update.json` bundled in `assets/db/tigertag/` and seeds the metadata store so the app skips unnecessary network downloads for data that shipped with the installer.

### Bambu Lab — filament edit sheet redesign
- **ISO layout** — the Bambu filament edit bottom-sheet now matches the Snapmaker / FlashForge / Elegoo design: two rows only (Filament + Color), no summary bar, no close ✕ button, no horizontal separators.
- **Auto-close on color select** — picking a color from the preset grid or the OS color picker closes the color sub-sheet automatically (150 ms delay, same behavior as other brands).
- **Title corrected** — sheet is now labeled "Edit filament" instead of the previous "Change filament".

### i18n
- Added **`snapState_idle`** key across all 9 locales (EN/FR/DE/ES/IT/ZH/PT/PT-PT/PL) — resolves the raw-key label that was showing in the Bambu Lab printer state badge.

---

## v1.6.0 — 2026-05-14

### Elegoo — full MQTT live integration
- **Real-time MQTT connection** on port 1883 (plain TCP). UDP discovery on port 52700 auto-detects Elegoo printers; manual IP entry is the fallback.
- **Job card** — active filename, progress bar + percentage, estimated remaining time, layer counter (`current / total`), print thumbnail, and state badge (`printing`, `paused`, `complete`, `standby`, …).
- **Temperature card** — nozzle `current / target°C`, bed `current / target°C`, chamber temperature; heating indicator when target is set and sensor is below threshold.
- **Filament card** — mono-extruder mode (`Ext.`) and Canvas hub 4-slot mode (`S1`–`S4`); each slot shows colour square, material type, vendor, and filament name. Partial MQTT updates (method 6000 `mono_filament_info`) merge only the fields present in the payload — existing data is preserved.
- **Control card** — jog pad with XY circle (4-direction buttons + sector highlight + centre home-XY), Z pill (Z↑ / home-Z / Z↓), X/Y home pill, step selector (0.1 / 1 / 10 / 30 mm), print-speed selector (Silent / Normal / Sport / Ludicrous), current-position display (X / Y / Z), LED toggle, and folder button.
- **Fan cards** — Model / Aux / Case fans as three compact column cards each with icon toggle, − / % / + step buttons (±10% per step).
- **Files sheet** — two tabs: Print History (thumbnails + filename + duration) and Files (printer-side file list). Refresh reloads the active tab without closing the sheet.
- **Filament edit sheet** — colour preset grid + custom hex picker, material type list, vendor picker, summary preview, sends correct MQTT payloads (method 1055 for mono, method 2003 for Canvas).
- **No-flash control card** — surgical DOM patch on every MQTT tick: fan percentages, LED state, and XYZ position are updated in-place without re-creating the control card DOM.
- **i18n** — all UI strings covered across 9 locales (EN / FR / DE / ES / IT / ZH / PT / PT-PT / PL).

### Bambu Lab — live integration
- **MQTTS connection** on port 8883 (TLS). Auth via printer access code (entered once). Requires "LAN mode" enabled on the printer.
- **Job card** — filename, progress bar, estimated remaining time, layer counter, and print state.
- **Temperature card** — nozzle, bed, and chamber temperatures with heating indicators.
- **Filament / AMS card** — row 1 is `[Ext.] [A1][A2][A3][A4]`; additional rows for extra AMS units. AMS humidity and temperature shown when a single module is connected.
- **Camera widget** — JPEG stream from the printer's built-in camera.
- **Online badge** — driven by the MQTT connection state, shown in the printer grid and side panel.

### UI polish — printer live blocks
- Elegoo control card — borders removed for a cleaner look; home buttons keep orange hover/active state.
- Fan cards — columns layout (one card per fan), no borders, 8 px gap between cards.
- Filament mono slot — `Ext.` alone capped to `max-width: calc((100% - 32px) / 5)` so it renders at the same size as one slot in a full Ext. + AMS row.

---

## v1.5.0 — 2026-05-11

### TigerScale — live WebSocket panel
- **Connect / disconnect toggle** on each scale card. Manual disconnect suppresses auto-reconnect.
- **WS event log** — collapsible strip showing the last 80 events (connect, raw frames, errors, retries) with direction arrows and per-line timestamps.
- **CORS fix** — removed the pre-connect `fetch()` ping (blocked by Chromium CORS in Electron). `connectScaleWs` now opens the WebSocket directly; `onclose` handles retries.
- **Field-name fix** — WS parser corrected from snake_case to the actual camelCase fields the firmware sends (`netWeight`, `scaleStatus`).
- **Gradient live card** — shows live data with a purple gradient matching the TigerScale mobile app. Hidden when WS is disconnected; reappears on reconnect.
- **Send-status badge** — maps `scaleStatus` firmware values (`idle`, `scanning:N`, `stable:N`, `send`, `success`, `error`, `done`, `ready`) to emoji + text with per-state background colours.
- **Filament mini-panel** — colour dot, brand, and material. Appears only when the firmware sends non-empty brand or material; clears automatically when `scaleStatus` becomes `"ready"`.
- **Weight display** — 56 px bold weight number with unit.
- **UID reader grid** — 2-column grid (Left reader / Right reader). `resolve()` fills the empty slot with the twin UID in green.
- **TARE hold-to-confirm** — 1-second press fills a white progress bar then POSTs `/api/tare`. Button hidden when disconnected.

### Elegoo — thumbnail correlation fix
- History thumbnail responses are now correlated by `_historyThumbPendingFn !== null` rather than by request ID. The Elegoo firmware echoes the method number (1045) as the response `id` — not our incremental request ID — so ID-based matching never worked and thumbnails were silently dropped.

---

## v1.4.15 — 2026-05-09

### Creality live integration
- Real-time WebSocket connection on port 9999 with automatic heartbeat (polling every 2 s).
- Live nozzle, bed, and enclosure temperatures; print state (`idle` / `printing` / `finished`), job progress bar, layer counter, estimated duration.
- **CFS colour grid** — activated when `cfsConnect=1` and `materialBoxs[]` is non-empty; shows each slot's assigned colour pill and material label.
- **WebRTC camera** — inline `<iframe>` at `http://$ip/webcam/webrtc` when `webrtcSupport=1`.
- **Print thumbnail** — fetched from `http://$ip/downloads/original/current_print_image.png` while a job is active.
- WS event log with Pause / Clear / row-expand, same UI as Snapmaker and FlashForge.
- Online / Offline badge driven by a lightweight WS probe (30 s TTL).

---

## v1.4.14 — 2026-05-08

### Add Product — multi-colour picker (Mono / Dual / Tri / Rainbow)
- New **Mono / Dual / Tri / Rainbow** selector in the colour picker bottom-sheet. Tap a colour square to switch the active slot, then pick its colour.
- The colour circle updates in real time: solid (Mono), hard half-split (Dual), conic-gradient sectors (Tri), smooth linear-gradient (Rainbow).
- Selecting a mode auto-sets `id_aspect2` to the matching aspect. The link is bidirectional — changing the aspect2 dropdown also flips the mode selector.
- `color_r2/g2/b2` and `color_r3/g3/b3` now written from the actual slot colours picked.

### Version / protocol filter
- The **Type** quick-filter in the inventory toolbar now filters by **protocol version** (TigerTag / TigerTag+ / TigerCloud / TigerTag Init / …) instead of filament product type.

### Search & filter reset on instance switch
- The search bar and all quick-filters are now automatically cleared when switching between accounts or entering / leaving a friend's inventory view.

---

## v1.4.13 — 2026-05-07

### Custom product image for DIY & Cloud spools
- **`url_img` + `url_img_user: true`** — DIY and Cloud spools can now carry a product image from an external URL. TigerTag+ spools are not editable.
- **Edit pill in the colour square** — expands rightward on click to reveal the URL input and a confirm button. `Enter` = confirm, `Escape` = dismiss.
- **Toolbox entry** — when a valid user image is already set, the edit action moves to the spool toolbox.
- **Broken-link recovery** — `onerror` handler detects failed image loads, swaps in the colour placeholder, and surfaces the edit trigger.
- **Add Product integration** — the ADP advanced section has an image URL field.

### Toolbox — Clear TD value
- New split-button on the "Scan TD" toolbox row: a hold-to-confirm trash button (1 200 ms) appears to the right when `r.td != null`. Holding it deletes the `TD` field via `FieldValue.delete()`.

### Add Product panel — TD1S sensor button
- TD1S icon added to the ADP header. **Not connected** → opens the TD1S connect modal. **Connected** → glows green; scanning a filament auto-fills the colour HEX and TD value fields.

### Stats bar — TigerCloud counter
- New purple stat tile ("TigerCloud") always visible in the inventory header bar. DIY count now correctly excludes Cloud entries.

### Window chrome
- **Dark title bar** — `nativeTheme.themeSource = 'dark'` forces the native macOS/Windows title bar to dark mode.
- **No window shadow** — `hasShadow: false` removes the OS-level drop shadow along window edges.
- **Update status icon** — sits to the right of the cloud health indicator. Orange + spinning during download; green + glow when ready. Clicking the green icon triggers the install.
- **Panel shadow bleed fix** — `detail-panel`, `sfe-sheet`, and `rp-side` were leaking `box-shadow` outside the viewport when off-screen. Shadow now applied only on `.open` / `.is-open` state.

---

## v1.4.12 — 2026-05-06

> 🌥️ **The big one: TigerTag goes Cloud.** Create a filament in your inventory without owning an RFID chip. When you eventually program a chip, the doc is atomically renamed to its real hex UID — all fields, twins, rack assignments, and friend ACLs follow with no manual effort.

### TigerCloud — third tier
- **100 % digital filaments** — the Add Product side panel writes a complete inventory entry with a `CLOUD_<10-digit>` doc id. Same schema, same fields, same display surfaces, same friend-sharing rules as chip-backed spools.
- **Promotion path** — when a physical chip is programmed, the `uidMigrationMap` rename pipeline carries the document over atomically. Twin pointers, rack assignments, weight history, friend ACLs — everything follows the rename. Idempotent.
- **New tier label "TigerCloud"** — sits alongside TigerTag+ (orange) and TigerTag (grey). Cloud takes precedence when both signals would apply. Shown across table row, grid card, panel image overlay, and panel details footer.
- New CSS class `.tag-cloud` — purple gradient (`#7c4dff → #a37bff`).

### Add Product — full HSV colour picker
- Anthracite preset sheet matching the Brand / Material sheets.
- Custom slot shows the current colour as background.
- Custom-colour bottom-sheet rebuilt as an HSV picker: hex input row, saturation × value rectangle, hue slider, colour preview circle, OK button.
- Live main-circle update while dragging the SV thumb / hue slider / typing.

### Add Product — RFID Data debug surface
- Gated to `state.debugEnabled` (admin only). Non-admin users never see the section.
- Moved out of Advanced mode — always visible to debug users.
- Switched to the canonical `<details class="debug">` pattern with `pre.json` dark theme.

---

## v1.4.11 — 2026-05-05

### FlashForge live integration
- **HTTP polling** — 2 s tick on `POST /detail`, bridged through the Electron main process to bypass CORS. Capped exponential backoff on network errors (2 s → 30 s).
- **Camera (MJPEG)** — edge-to-edge `<img>` stream. Handles mjpg-streamer's 1-client limit: cache-buster on open, explicit tear-down on close, graceful fallback + Retry button on error.
- **5-slot matlStation grid** — `[Ext.] [1A] [1B] [1C] [1D]`. Ext. → `indepMatlInfo`; bays → `slotInfos[1..4]`. Three visual states per slot: filled (solid fill), configured-but-empty (coloured inset ring), unconfigured (grey hatch).
- **Auto SN-prefix** — auto-prefixes `SN` when the entered serial is missing it. Idempotent.
- **Request log (debug mode)** — every poll pushes an outbound + inbound entry. Click to expand JSON; Pause / Clear toolbar; capped at 100 entries (FIFO).

### UX — Inventory toolbar redesign
- **View selector moved below the search bar** — own dedicated row under the search, keeping its full width regardless of how wide the filters above end up.
- **Search input — clear button (✕)** — appears on the left of the magnifier icon as soon as the input contains a value.

---

## v1.4.10 — 2026-05-05

Hot-fix release for the Windows auto-updater.

- **Windows auto-update fixed.** `build.publish.publisherName: null` set to skip publisher-name verification on Windows (the SHA-512 hash check from `latest.yml` still enforces integrity). Fixes the `Could not check: New version is not signed by the application owner` error that blocked v1.4.9 auto-updates.
- **Mobile-app prerequisite warning** added to the inventory format upgrade consent modal — a small amber banner reminds the user to update their TigerTag mobile app to v1.0.3+ before continuing.

---

## v1.4.9 — 2026-05-04

Quality-of-life release. Three internal-tooling improvements and one user-visible bug fix found by the new tooling on its first run.

### i18n bug fixes
- `autoUnstorageTitle` and `autoUnstorageSub` were missing from `zh.json` and `pt-pt.json`.
- Five duration keys (`agoMin`, `agoHour`, `agoDay`, `agoMonth`, `agoYear`) now use the same plural-object structure (`{one, other}`) across all 9 locales.

### Internal tooling
- **`npm run i18n:add`** — single command adds or updates one i18n key across all 9 locale files.
- **`npm run i18n:check` + pre-commit hook** — validates locale consistency on every commit. Wired automatically via `core.hooksPath=.githooks/` from the `prepare` script.
- **CSS modularization** — the 8047-line monolithic `inventory.css` split into 8 themed files under `renderer/css/` (`00-base.css` through `70-detail-misc.css`).

---

## v1.4.8 — 2026-05-04

Discovery, repair & ergonomics release.

### Snapmaker LAN discovery
- **Side-panel scan** — slides in from the right. mDNS browse of `_snapmaker._tcp.local.` via `bonjour-service` (IPC bridge `mdns:browse-snapmaker`), plus port-scan fallback on Moonraker port 7125.
- **Per-source batch sizing** — local subnets with batch=24, user-declared extra subnets with batch=4 + 80 ms inter-batch gap.
- **One-click add** — writes the printer doc to Firestore and opens the new printer's detail card with the WebSocket already connecting.
- **Add by IP** collapsible — live IPv4 validation, "Validate" probe, "Continue anyway" fallback.
- **Debug-only scan log** — full journal exportable as JSON.
- **Settings reconnect** — saving an IP change tears down the old WebSocket and reconnects.

### Twin-pair manual repair
- **Repair tool** in the spool detail panel toolbox when the spool isn't paired AND at least one compatible candidate exists.
- **Strict candidate filter** — same `id_brand` + `id_material` + `id_type` + `id_tigertag` + exact RGB. Excludes already-paired and tombstoned rows.
- **Atomic batch write** — `twin_tag_uid` cross-referenced on both docs in a single Firestore batch.
- **Debug-only Unlink** — hold-to-confirm "Unlink" tool when Debug mode is on.

### Spool toolbox (detail panel)
- Bundles: Scan colour (TD1S), Scan TD (TD1S), Link/Unlink twin, Remove from rack, Delete.
- Apple-style row design — borderless soft surface, capsule shapes, hold-to-confirm fill animation for destructive actions.

### Rack management
- **Drop-to-void unassign** — dragging a spool outside any rack card sends it back to the unranked panel.
- **Eject animation** reuses `rp-slot-cascade-out`, matching auto-store / auto-fill visual grammar.
- **Empty-spool handling in unranked** — visible but excluded from every count.
- **Per-spool "Remove from rack"** in the toolbox (hold 1.5 s).

### Filament slot UI (Snapmaker live block)
- Cleaner colour square layout — BASE material only in the square, full identity below.
- **Read-only filament sheet** — same layout as editable mode; `<select>` and "Apply" are `disabled`.

---

## v1.4.7 — 2026-05-04

Major release — 3D Printer integration as a first-class citizen.

### Printer management
- **New "Printers" tab** — drag & drop grid of all printers across 5 brands. Per-card: photo, brand pill, model, online/offline indicator (HTTP ping every 30 s).
- **Side card** — slides from the right; hero shows static photo or live WebRTC camera for Snapmaker.
- **"Add a printer" flow** — brand picker → form. Brand-aware model picker with thumbnails. Written to `users/{uid}/printers/{brand}/devices/{auto-id}` in Firestore.
- **Inline editing in the side card** — every field editable on click; Enter / blur saves to Firestore.

### Snapmaker live integration (Moonraker WebSocket)
- WebSocket to `ws://{ip}:7125/websocket`, JSON-RPC subscribe, capped exponential backoff.
- **Camera** — full-width WebRTC iframe at the top of the side card.
- **Print job card** — preview thumbnail, filename, percentage, elapsed time, progress bar, state pill, layer counter.
- **Temperature row** — compact pills per extruder + bed, red when heating.
- **Filament grid** — 4 large coloured squares (one per extruder), tap-to-edit with pencil / eye icon.
- **Inline filament editor** — bottom sheet: Summary, Filament picker (vendor × material), Color picker (5×5 grid + OS-native custom), Sub-type `<select>`.
- **Request log** (debug mode) — every WS frame in / out, pause / clear, custom JSON send.

### Storage data — schema migration
- `rack_id` / `level` / `position` top-level fields repackaged into a nested `rack: { id, level, position }` sub-object. Same UX pattern as the v1.4.5 UID migration. Twin-aware — every rack write mirrors to the linked twin's doc in the same atomic batch.

---

## v1.4.6 — 2026-05-03

Hot-fix — Windows packaging.

- **Windows artifact name standardised.** `win.artifactName` set to `Tiger-Studio-Manager-Setup-${version}.${ext}` (space-free). Fixes the auto-updater 404 that resulted from GitHub's space→dot rewrite disagreeing with electron-builder's dash encoding in `latest.yml`.
- **Windows code-signature check temporarily disabled.** `nsis.publisherName: []` added. electron-builder was auto-deriving the publisher name from the macOS Apple Developer ID, which never matches the unsigned `.exe`. SHA-512 + size check from `latest.yml` is still enforced.

---

## v1.4.5 — 2026-05-03

- **Google sign-in via Touch ID / passkey.** Loopback OAuth flow (RFC 8252 + PKCE) — the system browser opens for auth so Touch ID, passkeys, and hardware keys work natively. System browser brought back to foreground automatically after the handshake.
- **Lazy on-the-fly migration of legacy decimal spool ids → hex uppercase.** Idempotent, atomic per spool (single Firestore batch per migration), polite (250-500 ms gap between writes). `users/{uid}/uidMigrationMap/{decimal_uid}` serves as a bridge for in-flight legacy UIDs.
- **Migration consent + progress UI.** Consent modal shows spool count + estimated duration; lock-screen progress modal during the sweep. Cmd+Q during migration intercepted by main process — native dialog asks for confirmation before quitting.
- **TigerScale v2 schema cutover.** New field names: `last_heartbeat_at`, `display_name`, `current_spool_uid_1/2`, `wifi_signal_dbm`, `power_source`, `battery_percent`, `is_charging`, `hardware_revision`.
- **Twin-pair display on the TigerScale side-card.** Two tags that reference each other via `twin_tag_uid` render as a single physical spool card.
- **Friend banner repositioned** — the READ-ONLY pill now lives in the top header (left of KPI stats). Own-user mode shows a random welcome greeting instead.
- **Sidebar avatar — swap-back affordance** — a ⇄ badge appears when a friend's inventory is being previewed. The whole avatar acts as a one-click "return to my own inventory" button.

---

## v1.4.4 — 2026-05-02

- **Auto-update toggle.** New "Updates" section in Settings — enable / disable automatic update downloads, and a "Check for updates now" button. Preference persisted to `<userData>/auto-update.json`.
- **Settings panel rebuilt.** Flat panel with hairline-separated sections — Updates / Data / Tools / About — replacing the old card-in-card layout.
- **Top header KPI stats.** 4 stat tiles (Spools / Stock / TigerTag / TigerTag+) moved from the sidebar to the top of the main pane.
- **Storage — `EMPTY` stat for depleted spools.** Slot "Empty" → "Free"; spool "Depleted" → "Empty".
- **Spool detail — Storage location row.** Shows `Rack name · A3` for placed spools; **Auto-assign** button for unplaced spools.
- **Auto Storage + Auto Unstorage** toggles — snapshot-driven, `_inFlight` flag prevents loops.
- **Sidebar — friends quick-access list.** Friends appear under the Friends button as flat rows (avatar + name); click switches the inventory view to that friend's read-only inventory.
- **Readable initials on light avatar colours.** `readableTextOn(bg)` helper computes WCAG relative luminance and switches initials to `#1a1a1a` on light backgrounds.

---

## v1.4.3 — 2026-05-02

Storage view major UX overhaul.

- **Stats bar** — pill tiles: total racks, filled-vs-total slots (mini progress bar), empty count, locked count, clickable "Not Stored" tile. Empty / Locked tiles double as filter chips.
- **Inline rack header** — `Rack 4 · 5/5` on a single line.
- **Kebab menu (⋮)** — per-rack actions: Edit · Auto-fill · Lock all / Unlock all · Clear all · Delete.
- **Press-and-hold for destructive actions** — 1.2-second hold for Clear all and Delete.
- **Visible drop zones during drag** — valid slots pulse, locked slots dim, target slot pops with orange ring + scale-up. Swap targets show `⇄` glyph overlay.
- **Slot animations** — bounce-in on land, staggered 30 ms auto-fill wave, cascade-out for clear-all.
- **Skyline masonry layout** — racks pack tightly into available width; recomputes on resize via `ResizeObserver`.
- **Rich hover tooltip on filled slots** — brand, material · color name, coordinate badge, weight bar.
- **+ New Rack as a stat tile** — first tile of the stats bar, dashed border, `+` glyph.

---

## v1.4.2 — 2026-05-02

- **CI — macOS code signing + notarization.** Releases signed with Apple Developer ID Application + notarized via `notarytool`. No Gatekeeper warning on download. Certificate and App Store Connect API Key decoded from GitHub Secrets at build time.
- **Native modules** (`@pokusew/pcsclite`, `@serialport/bindings-cpp`) correctly signed inside the bundle via `entitlementsInherit` and `cs.disable-library-validation`.
- New `build:mac:unsigned` script for fast local builds without Apple credentials.

---

## v1.4.1 — 2026-05-01

- **Fix — silent login failure on email/password** sign-in. Auth listener was gated on `getActiveId()` matching the new uid, but `setActiveId()` only ran inside the listener. Reordered: `setActiveId` runs after `updateCurrentUser` and before `setupNamedAuth`.
- **Diagnostic report system.** Every caught auth/network error and every `window.error` / `unhandledrejection` captured into a circular buffer. Copy a Markdown report from **Settings → Debug → Report a problem** — includes app version, Electron/Chrome/Node, OS, locale, account count, and the last 50 errors with stack traces.
- Storage / Rack feature gated off in this build until the visualisation skeleton is finalised.
