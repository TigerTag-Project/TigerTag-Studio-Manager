# Chip and spool analytics (Xano)

Studio reports what it does with spools to the TigerTag Xano analytics table, the same table and
shape as the mobile app. The contract shared by every app is TigerTag-Manager `docs/analytics.md`
(v2, 2026-11-10). Code: `_sendTagAnalytics` / `_xanoSpoolEvent` in `renderer/inventory.js`, the
`analytics:tag` queue in `main.js`, the v2 stamping and the store of events to send again in
`services/analytics.js` (tests: `scripts/test-analytics.mjs`).

## Transport

- A GET whose payload is the JSON, base64-encoded, in the `X-TigerTag-Analytics` header.
- `online` goes to `product/get` (it records the catalogue product), everything else to
  `analytics/tag`.
- Sent from the main process (no CORS preflight there), through one queue:
  - at most 4 requests a second;
  - in memory, capped at 5 000 events, overflow counted;
  - fire-and-forget, never awaited by a chip action or the UI;
  - an event with no answer (network, timeout) or a 5xx is kept in `<userData>/analytics-resend.json`
    (5 000 at most) and queued again a minute after launch and every 10 minutes, for 7 days after
    it happened, with its `EventId` and `Timestamp`; a 4xx is never sent again, nor is `online`;
  - on quit, one burst of up to 20 events for at most 1.5 s; the rest is kept to send again
    (`online` counted as overflow).

## Contract v2 fields

Stamped by the main process when the event reaches it (`stampEvent`), never changed afterwards:

- `V: 2`, `EventId` (UUID v4), `Session`: a random id per launch, renewed when the app comes back
  after 30 minutes in the background (no window focused, the machine asleep or locked); never
  derived from the account.
- Chip events (`read`, `online`, `write`, `reset`, `nfc_init`, `repair`): `Reader: usb_reader` and
  `Device`, the model of the reader holding that UID (`ACR122U`, from the PC/SC name), else of the
  only reader plugged in; left out when unknown.
- `Platform`, `AppVersion`, `App: studio`.
- The shared rules, whatever the renderer sent: no `IdProduct` 0 / 4294967295, no `SpoolId: ""`.

## Operations

| Operation | When |
|---|---|
| `read` / `online` | a chip scanned (`online` = TigerTag+ with a catalogue product) |
| `write` | a chip burn verified |
| `reset` / `nfc_init` | chip formatted to TigerTag Init / recycled to plain NFC |
| `create` | a spool comes into this account by any path (add form, catalogue, duplicate, mint, `.ttag` import, first scan of a chip) |
| `edit` | this instance changes a spool doc; `Changed` = field names; coalesced per spool over 5 minutes |
| `delete` | this instance deletes a spool; fields from before the deletion |
| `repair` | a TigerTag+ rewritten from its `rfidList` backup and verified, `PagesWritten` > 0 (an intact chip or a failed repair sends nothing); `Protocol` "TigerTag+ Certified". Accepted by Xano since 2026-11-06; `ANALYTICS_REPAIR_EVENT` is its kill switch |
| `app_open` | the app started, or came back after 30 minutes in the background (a new `Session`); once per session, a window reload counts none. Sent once signed in, or after 10 s without an account. Accepted by Xano since 2026-11-10; `ANALYTICS_V2_OPERATIONS` is its kill switch |
| `catalog_view` | a catalogue product opened in Search (its product card): `IdProduct`, `Surface: studio`; the same product again within 5 minutes is not a new view. Same switch as `app_open` |
| `qr_read` | a qr.tigertag.io link pasted or scanned into the search (other text sends nothing), every kind: `Reader` paste (pasted or typed by hand) \| qr_scanner (a handheld scanner typing it, told apart by its speed); `LinkKind` spool \| product \| no_product \| newer; `Format` page \| json \| ttag (the link's ending); `IdProduct` for a product link or the spool's product when known. The user's own spool adds `SpoolId`, `Uid` / `UidHex` (chips) and `Protocol`; anyone else's spool sends its product only. Once per link over 5 minutes. Accepted by Xano since 2026-11-11; `ANALYTICS_QR_READ` is its kill switch |
| `print_label` | a label printed or saved (Print / PDF / PNG / SVG; a cancelled dialog sends nothing): `LabelKind` spool \| product, `Template` (classic, expanded, compact, slim, slicer, vertical, verticalBold, verticalCompact), `Output` print \| pdf \| png \| svg, `Dpi`, `Copies` 1, `IdProduct` when real (both kinds), `IdBrand` / `IdMaterial` / `IdType` / `IdDiameter` / `Color`; `SpoolId`, `Protocol` and, for chip formats, `Uid` / `UidHex` on a spool label. Deduped per (kind, spool or product, template, output) over 10 s. Xano stores the label fields in `label_kind` / `label_template` / `label_output` / `label_dpi` / `label_copies`. Accepted by Xano since 2026-11-08; `ANALYTICS_LABEL_EVENT` is its kill switch |

`create` / `edit` / `delete` are live since 2026-11-06, when Xano production accepted them with
its `protocol` / `spool_id` columns and started caching the IP lookup per IP for 24 h (a 500-spool
import costs one lookup; TigerTag-Project/TigerTag-Manager#112). `ANALYTICS_SPOOL_EVENTS`
(renderer) stays as a kill switch: false sends only the chip events. The contract was checked
against Xano's dry-run and then on production rows. Every event also carries:

- `Protocol`: `TigerData`, `TigerData+`, `TigerTag`, `TigerTag+`, `TigerTag+ Certified` or `unknown`.
  Certified = the factory signature checks out: known from the scan, otherwise the
  `rfidList/{uid}.backup` is verified once per chip and session (the backend's own test).
- `SpoolId`: the inventory doc id, left out (never `""`) when the chip's spool is not known. `Uid` (decimal) and `UidHex` only for chip formats. `UidHex` is
  the UID as printed (uppercase hex, whole bytes, 1 to 7, e.g. `04D8593DD42A81`, `36EE0FCA`), on
  every event that has a `Uid`, `online` included: Xano stores the UID as a 64-bit integer and a
  decimal past 2^53 loses digits, so it reads `UidHex` first (Xano change 43, live since 2026-11-10). `Uid` stays for
  older readers (`analyticsUid` in `renderer/uid-repair.js`, tested in `scripts/test-uid-repair.mjs`). Xano
  stores 0 for TigerData / TigerData+ (the column is not nullable).
- `Weight` is always the capacity (`measure_gr`); `WeightAvailable` is the remaining grams, on every
  spool event and on a chip event when the spool doc is known.
- `IdTigerTag` is left out for TigerData / TigerData+ (0 means "RFID Empty" in Xano).
- `UserId`: the Firebase uid of the signed-in account the event is about, on every operation;
  left out when no account is signed in. Xano keeps it in the row's `data` JSON for now (`data`
  is null for `reset` / `nfc_*`), a dedicated `user_id` column is planned under the same key.
- Never sent: the spool's free-text note (`message`, removed 2026-11-07) and the old `Emoji`.

## Rules

- Only what this instance does. The spool events come from wrapping the Firestore SDK write calls
  (`_xanoWatchWrites`); snapshot listeners write nothing, so a change made by the phone or the
  TigerScale is never counted twice. Writes the app makes on its own (mirrors, migrations, cleanup,
  the scan upsert, the re-key after a burn) are wrapped in `_xanoQuiet` / `_xanoQuietBatch`. A new
  automatic writer must be wrapped too.
- Never while viewing a friend's inventory.
- De-duplication: chip events per operation + UID over 60 s; `create` / `delete` per operation +
  `SpoolId` over 60 s; `edit` by the 5-minute coalescing; `catalog_view` per product over 5 minutes;
  `qr_read` per link over 5 minutes.
- `Location` is always `"0.0,0.0"` (no position, the convention shared with mobile); Xano locates
  the event from the request's IP, to the city, on its side. Studio sends no IP.
- Events are linked to the account (`UserId`), so an event can be joined with that account's own
  Firestore data (printers, prices, stock) instead of copying those data into the event. Nothing
  is sent in friend view, so it is always the owner's uid. *(Decided 2026-11-07.)*

## Failures

- A non-2xx answer is logged at `warn`: `[analytics] <op> rejected → HTTP <status> <code>: <message>`.
- The session counter `{ sent, failed, queued, overflow, resendPending, lastError }` (`sent` =
  accepted with a 2xx; `resendPending` = events kept to send again) is in `app:info` as `analytics`,
  in the diagnostic report ("Chip analytics" line) and, when something failed, first in the in-app
  report's `errors`.
- `online` failures cannot be seen: `product/get` records the event after answering 200.
