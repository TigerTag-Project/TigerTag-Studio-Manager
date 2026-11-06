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

| Operation | When | Sent by |
|---|---|---|
| `read` / `online` | a chip scanned (`online` = TigerTag+ with a catalogue product) | always |
| `write` | a chip burn verified | always |
| `reset` / `nfc_init` | chip formatted to TigerTag Init / recycled to plain NFC | always |
| `create` | a spool comes into this account by any path (add form, catalogue, duplicate, mint, `.ttag` import, first scan of a chip) | flag only |
| `edit` | this instance changes a spool doc; `Changed` = field names; coalesced per spool over 5 minutes | flag only |
| `delete` | this instance deletes a spool; fields from before the deletion | flag only |

`create` / `edit` / `delete` are behind `ANALYTICS_SPOOL_EVENTS` (renderer, off) until Xano's
`operation` column accepts them and has its `protocol` / `spool_id` columns
(TigerTag-Project/TigerTag-Manager#112). With the flag on, every event also carries:

- `Protocol`: `TigerData`, `TigerData+`, `TigerTag`, `TigerTag+`, `TigerTag+ Certified` or `unknown`.
  Certified = the factory signature checks out: known from the scan, otherwise the
  `rfidList/{uid}.backup` is verified once per chip and session (the backend's own test).
- `SpoolId`: the inventory doc id. `Uid` (decimal) only for chip formats.
- `Weight` is always the capacity (`measure_gr`); `WeightAvailable` is the remaining grams, on every
  spool event and on a chip event when the spool doc is known.
- `IdTigerTag` is left out for TigerData / TigerData+ (0 means "RFID Empty" in Xano).

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

## Contract test (dev only, temporary)

`ANALYTICS_TEST_ENDPOINT = true` in `main.js` sends every operation, `online` included, to Xano's
dry-run copy `https://api.tigertag.io/api:tigertag/analytics/tag_v2_test`, which computes the row
and writes nothing, and logs each returned `record` at debug level. It is forced off in a packaged
build (`app.isPackaged`); a release never ships with it on. It goes away with the endpoint once the
spool events are live in production.

## Failures

- A non-2xx answer is logged at `warn`: `[analytics] <op> rejected → HTTP <status> <code>: <message>`.
- The session counter `{ sent, failed, queued, overflow, lastError }` is in `app:info` as `analytics`,
  in the diagnostic report ("Chip analytics" line) and, when something failed, first in the in-app
  report's `errors`.
- `online` failures cannot be seen: `product/get` records the event after answering 200.
