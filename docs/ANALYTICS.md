# Chip and spool analytics (Xano)

Studio reports what it does with spools to the TigerTag Xano analytics table, the same table and
shape as the mobile app. Code: `_sendTagAnalytics` / `_xanoSpoolEvent` in `renderer/inventory.js`,
the `analytics:tag` queue in `main.js`.

## Transport

- A GET whose payload is the JSON, base64-encoded, in the `X-TigerTag-Analytics` header.
- `online` goes to `product/get` (it records the catalogue product), everything else to
  `analytics/tag`.
- Sent from the main process (no CORS preflight there), through one queue:
  - at most 4 requests a second;
  - in memory, capped at 5 000 events, overflow counted;
  - fire-and-forget, never retried, never awaited by a chip action or the UI;
  - on quit, one burst of up to 20 events for at most 1.5 s, then the rest is counted as overflow.

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
| `print_label` | a label printed or saved (Print / PDF / PNG / SVG; a cancelled dialog sends nothing): `LabelKind` spool \| product, `Template` (classic, expanded, compact, slim, slicer, vertical, verticalBold, verticalCompact), `Output` print \| pdf \| png \| svg, `Dpi`, `Copies` 1, `IdProduct` when real (both kinds), `IdBrand` / `IdMaterial` / `IdType` / `IdDiameter` / `Color`; `SpoolId`, `Protocol` and, for chip formats, `Uid` on a spool label. Deduped per (kind, spool or product, template, output) over 10 s. Xano stores the label fields in `label_kind` / `label_template` / `label_output` / `label_dpi` / `label_copies`. Accepted by Xano since 2026-11-08; `ANALYTICS_LABEL_EVENT` is its kill switch |

`create` / `edit` / `delete` are live since 2026-11-06, when Xano production accepted them with
its `protocol` / `spool_id` columns and started caching the IP lookup per IP for 24 h (a 500-spool
import costs one lookup; TigerTag-Project/TigerTag-Manager#112). `ANALYTICS_SPOOL_EVENTS`
(renderer) stays as a kill switch: false sends only the chip events. The contract was checked
against Xano's dry-run and then on production rows. Every event also carries:

- `Protocol`: `TigerData`, `TigerData+`, `TigerTag`, `TigerTag+`, `TigerTag+ Certified` or `unknown`.
  Certified = the factory signature checks out: known from the scan, otherwise the
  `rfidList/{uid}.backup` is verified once per chip and session (the backend's own test).
- `SpoolId`: the inventory doc id. `Uid` (decimal) only for chip formats; Xano stores 0 for
  TigerData / TigerData+ (the column is not nullable).
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
  `SpoolId` over 60 s; `edit` by the 5-minute coalescing.
- `Location` is always `"0.0,0.0"` (no position, the convention shared with mobile); Xano locates
  the event from the request's IP, to the city, on its side. Studio sends no IP.
- Events are linked to the account (`UserId`), so an event can be joined with that account's own
  Firestore data (printers, prices, stock) instead of copying those data into the event. Nothing
  is sent in friend view, so it is always the owner's uid. *(Decided 2026-11-07.)*

## Failures

- A non-2xx answer is logged at `warn`: `[analytics] <op> rejected → HTTP <status> <code>: <message>`.
- The session counter `{ sent, failed, queued, overflow, lastError }` is in `app:info` as `analytics`,
  in the diagnostic report ("Chip analytics" line) and, when something failed, first in the in-app
  report's `errors`.
- `online` failures cannot be seen: `product/get` records the event after answering 200.
