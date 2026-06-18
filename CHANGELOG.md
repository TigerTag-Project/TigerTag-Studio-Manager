# Changelog

All notable changes to Tiger Studio Manager are documented here.
Versions follow [Semantic Versioning](https://semver.org/).

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
