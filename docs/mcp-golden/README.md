# MCP tools — golden reference (write tools, support, labels)

The reference the hosted connector (TigerHub, `lib/mcp/`) ports from, so both servers behave the same.
Source of truth: `renderer/inventory.js`, block **"MCP — write tools"** (`MCP_TOOLS.push(...)` +
`MCP_HANDLERS`), and `_mcpUndo`. When this file and the code disagree, the code wins and this file is
fixed. The plan and the shared contract are in `docs/MCP-HOSTED-WRITES.md`; the journal rule is in
the backend `firestore.rules` (`match /agentChanges/{changeId}`). Golden cases: `cases.json` (below).

Paths: `{uid}` is the signed-in account. Sentinels used in this file and in `cases.json`:
`<serverTimestamp>` = `FieldValue.serverTimestamp()`, `<delete>` = `FieldValue.delete()`,
`<now_ms>` = `Date.now()` as a plain number (not a Timestamp).

## 1. Gates, in the order they run

| # | Gate | Where | Refusal (exact text) |
|---|---|---|---|
| 1 | TigerSquad (every tool, read ones too) | `mcpBridge.onCall` | `This connection is signed in to the TigerSystem account "<displayName>", which is not in the TigerSquad, and the AI assistant is for TigerSquad members. Tell the user which account this is. If it is not the one they meant, they switch the connection to their TigerSquad account. Otherwise invite them to join the TigerSquad (free) and give them the link as a clickable Markdown link: [Join the TigerSquad](https://tigersystem.io/account) — or in Tiger Studio, TigerSquad view.` — without a `displayName`: `…signed in to a TigerSystem account not in the TigerSquad, and…` (the cases) |
| 2 | Unknown tool | `onCall` | `Unknown tool: <name>` |
| 3 | Signed in / own inventory / loaded | `_mcpRows()` | `Nobody is signed in to Tiger Studio Manager.` · `Studio is showing a friend's inventory — switch back to your own to query it.` · `The inventory is still loading — try again in a moment.` |
| 4 | Writes allowed | `_mcpWriteGate` | Local: `Changes are not allowed. The user sets this computer's access to "Read and change" in Studio › AI assistant › Manage access.` Online: the grant's `scope` (text is the Hub's own) |
| 5 | Daily change cap | `_mcpWriteGate(count)` | `Daily limit of 500 changes reached — try again tomorrow.` |

**TigerSquad test** (`_squadActive()`): member ⇔ `users/{uid}.supportPublicly === true` **and**
`users/{uid}.squadLockedUntil` (server-only Timestamp, `functions/squadLock.js`) is absent or not in the
future (`_squadLockDays()` = `ceil((squadLockedUntil − now) / 86 400 000)`, member only when 0). Studio
adds a third, client-only condition: its own version ≥ `config/studio.minSquadVersion`
(`_squadOutdated`) — irrelevant online. `tier`, `supporter` and `userProfiles` play no part.

**Caps** (`MCP_CAPS = { spoolsPerCall: 20, createPerDay: 100, changesPerDay: 500 }`), counted on the
journal (§3) from **00:00 UTC** today (`_mcpToday()` = `new Date().setUTCHours(0,0,0,0)`):

| Cap | Counted as | Checked by |
|---|---|---|
| 500 changes / day | Σ `(entry.count \|\| 1)` over every journal entry with `at ≥ today` — every kind (spool, product, rack, create, rack_create, undo, ticket…), undone or not, local and online; refused when `done + count > 500` (`count` = 1, or the spool total for `create_spools`) | every write tool, `undo_change` |
| 20 spools / call | Σ `max(1, floor(Number(quantity) \|\| 1))` over `items` | `create_spools` |
| 100 new spools / day | Σ `(entry.count \|\| 0)` over `tool == "create_spools"` entries today; refused when `today + total > 100` | `create_spools` |
| 5 racks / day | number of `kind == "rack_create"` entries today; refused when `≥ 5` | `create_rack` |

## 2. Shared mechanics

**Spool lookup** (`_mcpRowFor(id)`): case-insensitive (`toUpperCase`) match of the trimmed id on a
row's `spoolId` **or** its `twinUid`, among `_mcpRows()` = non-deleted rows with twin pairs folded to one
(`deduplicateTwins`: the first row of the pair in `state.rows` order is kept). Not found →
`No spool <id as given> — use search_inventory or identify_spool for its id.` The output's `spool_id` is the
kept row's id, which may be the other chip than the one asked.

**Twin mirroring** (`_mcpPatchSpool` → `_twinRowOf(r)`): when the row has `twin_tag_uid`, the other row
whose `uid` or `spoolId` equals it is written in the same batch, with the same fields. `before` is read
per doc. (`move_spool`'s occupancy check uses `twinSpoolIdOf`, which also finds a half that only
the *other* doc points at — see §7.)

**Spool write** (one batch, `update`, never `set`): each touched field + `updatedAt: <serverTimestamp>`.
A `null` value is written as `<delete>`, except `rack: null`, which is written as `null` ("not stored").

**Text** (`_mcpText(s, max)`): `String(s ?? "")`, every control char `U+0000–U+001F` and `U+007F` → a
space, `trim()`, then `slice(0, max)` (UTF-16 code units, not bytes).

**needUpdateAt** (re-burn flag): set to `<now_ms>` when a **chip** field changes (`message` = note, `TD`)
on a spool that is not chipless (`isCloud` = id starts with `TigerData_` or `CLOUD_`). It is a touched
field: it goes into the journal's `before`/`after` and is written on both twins.

**Racks** (`_mcpRackOf(ref)`): exact `id` first, else trimmed case-insensitive `name`. Not found →
`No rack "<ref>" — call list_racks.` `rackDepthOf(k)` = `parseInt(k.depth)` clamped to 1…4, else 1.
Locked (`isSlotLocked`): `k.lockedSlots` contains `"L:P:D"` **or** the legacy `"L:P"` (= the whole column,
every depth). The stored coordinate (`_rackCoord`) is `{ id, level, position }` plus `depth` only when
`depth > 0`. A spool's slot is read from `rack.{id,level,position,depth}` (depth absent = 0), or the legacy
flat `rack_id` / `level` / `position`.

**Product doc** = `users/{uid}/products/{hash}`, `hash = _flHash(_spoolProductKey(r))`:
- `_spoolProductKey(r)` = `"tt:" + id_product` when the spool is a TigerTag+ (`id_tigertag` names
  "TigerTag+" in `id_version.json`, i.e. 3155151767) or a TigerData+ (chipless id + real `id_product`)
  **and** `id_product` is real (not 0, not 4294967295); otherwise the attribute key
  `"diy:" + brand + "|" + material + "|" + id_type + "|" + colorHex + "|" + colorHex2 + "|" + colorHex3 + "|" + online_color_list.join(",") + "|" + aspect1 + "|" + aspect2`
  where brand / material / aspects are **labels** from the reference tables and `colorHex*` are
  `#rrggbb` (lower case) from `color_r/g/b(2/3)` (`toHex`). When missing, `colorHex` is `null` and the key
  holds the literal text `null`, while `colorHex2` / `colorHex3` give `""` (`|| ""` in `_attrKey`). Keep it
  so: existing product docs are keyed with it.
- `_flHash` = cyrb53 → base36 (copy the function verbatim; e.g. `"tt:84213"` → `1f1m43ujeco`).
- The spool doc's mirrored `productKey` field holds this hash once Studio has opened the account
  (`syncSpoolMirrors`); a spool never opened in Studio may lack it or carry a stale one.

Every product write (`_writeProduct`, `set(…, {merge: true})`) also writes, beside the tool's fields:
`key: _spoolGroupKey(r)` (= product key + `"|" + tier`, tier ∈ `tt` `ttplus` `td` `tdplus`),
`label: _productLabel(r)` (`{brand, series, material, materialRaw, colorName, colorHex, aspect, aspect2, imgUrl}`),
`cloudSeed` (the spool's raw doc minus `uid, twin_tag_uid, rack, rack_id, level, position, weight_available,
weight, timestamp, updatedAt, needUpdateAt, deleted, deleted_at, container_id, container_weight,
id_tigertag, tag_index, tag_count`), `wishlist: <delete>`, `updatedAt: <serverTimestamp>`; and
`buyPrice: <delete>`, `priceMode: <delete>` whenever `buyPriceHt` is written. Field shaping:
`buyPriceHt` → `null` or `round(x·10000)/10000`; `buyUrl` → value or `""`; `note`/`sku`/`ean` → trimmed;
`attachments` → `_sanitizeAttachments` (keeps `{url, label, kind}`, max = plan limit);
`minStockSpools` → `max(0, round(x))`, and when ≤ 0 also `savedForLater: <delete>`, `orderQty: <delete>`.
`_coupleFlags`: a `minStockSpools > 0` without `favorite` in the patch adds **`favorite: true`**
(not journaled). A product write the server refuses fails the tool (the error is returned; nothing is journaled).

**VAT** (`_vatPrices(price, mode, code)`): `code` = `users/{uid}.vatCountry`, else `default` of
`data/vat-rates.json` (`"FR"`). Rate from that table's `countries[code].rate` (unknown code → the FR
entry; no FR → rate 0). `code == "CUSTOM"`: rate = `users/{uid}.vatCustomRate` (a number, clamped 0…100,
else 0), currency = `vatCustomCurrency` upper-cased, letters only, 3 chars, default `EUR`.
`mode` = `"HT"` when `tax_included === false`, `"TTC"` when `true`, else `users/{uid}.priceInputMode`
(`"HT"` only when exactly `"HT"`, otherwise `"TTC"`). Stored value: `ht = mode == "HT" ? p : p / (1 + rate/100)`,
then `Math.round(ht * 10000) / 10000` (4 decimals; `_writeProduct` rounds the same way again).
Prices are always stored without VAT; the answer's `currency` is the country's ISO code.

**Attachments**: `users/{uid}/products/{hash}.attachments` = `[{url, label, kind}]`, `kind` from the URL
(`_attachKind`): `pdf` (`.pdf` before end / `?` / `#`), `video` (YouTube, youtu.be, Google Drive file,
`.mp4|webm|ogg|mov|m4v`, vimeo.com), `image` (`.png|jpg|jpeg|gif|webp|svg`), else `link`. Plan limit
`LINK_LIMITS = { free: 1, plus: 2, premium: 5 }` on `users/{uid}.tier` (server-only; absent or unknown → 1).
The backend rule enforces the same on the post-merge doc (`linkLimit()`: `premium` 5, `plus` 2, else 1;
`attachments.size() <= linkLimit()`).

## 3. Journal

`users/{uid}/agentChanges/{id}` (rule: `hasOnly` + `hasAll(id, at, expireAt, via, tool, kind)`, `at` within
±1 h of the request, `expireAt ≤ at + 31 d`, `docs` ≤ 2, `created` ≤ 20; the only update is setting
`undoneAt` once). Studio also keeps a localStorage copy (600 newest, 30 days; the Firestore listener reads the same 600) and merges both by id
(newer `undoneAt` wins); caps, idempotency and undo read the merged list, `at ≥ now − 30 days`.
Entry: `{ id: "chg_" + base36(ms) + 4 random base36, at, expireAt: at + 30 d, via: "local" | "online", tool, kind, summary, … }`
with `undefined` values dropped. Touched fields only, never whole docs:

| kind | extra fields |
|---|---|
| `spool` | `docs: [{ id, before: {field: raw value ?? null}, after: {fields written} }]` — one per twin doc |
| `product` | `spool_id`, `product_key` (= hash), `before: {field: prod[field] ?? null}`, `after: patch` |
| `rack` | `rack_id`, `before: {field: rack[field] ?? ""}`, `after` |
| `create` | `idempotency_key`, `count`, `created: [spool ids]` |
| `rack_create` | `rack_id`, `rack_name` |
| `undo` | `undoes: <change id>` (and the original gets `undoneAt`) |

## 4. The tools

### set_spool_weight — kind `spool`
| Input | Type | Validation |
|---|---|---|
| `spool_id` | string, required | §2 lookup |
| `grams` | number, required | `Number(grams)` finite and ≥ 0, else `grams must be a number ≥ 0.` |
| `mode` | `"remaining"` (default) \| `"gross"` \| `"consumed"` | anything else behaves as `remaining` |

`cap = Number(measure_gr || measure) || 1000`, `cw = Number(container_weight) || 0`.
`raw = gross ? g − cw : consumed ? (Number(weight_available) || 0) − g : g`;
`w = Math.round(max(0, min(cap, raw)))`. Writes `{ weight_available: w }` on the spool + twin.
Summary `"<name>: <old weight_available ?? "?"> g → <w> g"` (name = colour name, else aspects, else material:
`_mcpName`). Output: `{ change_id, applied: true, spool_id, twin_updated, before, after, remaining_g: w, capacity_g: cap, clamped_from_g?: raw }`
(`clamped_from_g: raw` only when `w !== Math.round(raw)`: a decimal that is merely rounded, 250.4 → 250, carries none).

### update_spool — kind `spool`
| Input | Type | Validation / effect |
|---|---|---|
| `spool_id` | string, required | §2 |
| `note` | string (ignored when null/absent) | `_mcpText(note, 200)`; UTF-8 bytes > 28 → `The note is written on the chip: 28 bytes max.`; writes `message`; `""` clears; + `needUpdateAt` (chip spool) |
| `tags` | string[] | the whole new list (else the current `tags`) |
| `add_tags` / `remove_tags` | string[] | list = (tags or current) + add_tags, each `_normalizeTag` (whitespace runs → one space, trim, 32 chars), empties dropped, minus `remove_tags` (normalised, case-insensitive), case-insensitive dedup keeping the first, first 20 |
| `container_id` | string (ignored when null) | catalogue entry (`spools_filament.json` / server list) with the account's `users/{uid}/containerOverrides/{id}.containerWeight` applied when it is a finite number; unknown → `No empty-spool model "<id>" — use lookup_reference kind container.`; writes `container_id`, `container_weight` |
| `td` | number \| null (only when the key is present) | `null` → `TD` deleted; else `Number(td)` not finite → `td must be a number (0.1…100) or null.`; otherwise clamped to 0.1…100 and rounded to one decimal (as the tool description says); + `needUpdateAt` (chip spool) |

Nothing given → `Nothing to change: give note, tags, add_tags, remove_tags, container_id or td.`
Summary `"<name>: note, tags, container, TD"` (the parts given, in that order). Output = `_mcpPatchSpool`'s
`{ change_id, applied: true, spool_id, twin_updated, before, after }`.

### move_spool — kind `spool`
| Input | Type | Validation (in this order) |
|---|---|---|
| `spool_id` | string, required | §2 |
| `unstore` | boolean | truthy → writes `{ rack: null }`, nothing else checked; summary `"<name>: taken out of its rack"` |
| `rack` | string | §2 rack lookup |
| `level` | integer | `Number(level)` integer, `0 ≤ level < rack.level`, else `level must be 0…<rack.level−1> in "<rack.name>".` |
| `position` | integer | `0 ≤ position < rack.position`, else `position must be 0…<rack.position−1> in "<rack.name>".` |
| `depth` | integer, default 0 (`Number(depth) \|\| 0`) | `0 ≤ depth < rackDepthOf(rack)`, else `depth must be 0…<depth−1> in "<rack.name>" (rows one behind the other).` |
| — | locked | `That slot is locked by the user.` |
| — | occupied (a non-deleted spool other than this one and its twin on that rack/level/position/depth) | `That slot holds <name> (<its spoolId>) — pick a free one.` — never a swap |

Writes `{ rack: _rackCoord(...) }` on the spool + twin. Summary `"<name> → <rack name || id> <level>/<position>"`.
Printer-feed racks (`rack.printer`) are not refused.

### update_product — kind `product`
| Input | Type | Validation / stored field |
|---|---|---|
| `spool_id` | string, required | §2; the product doc is §2's hash |
| `price` | number \| null (when the key is present) | `null` → `buyPriceHt: null`; else finite and ≥ 0, else `price must be a number ≥ 0, or null.`; → `buyPriceHt` (§2 VAT) |
| `tax_included` | boolean | see VAT |
| `buy_url` | string (ignored when null) | `_mcpText(…, 2000)`, `https://` prefixed when it has no `http(s)://`; non-empty and not a valid http(s) URL with `name.tld` / `localhost` / IPv4 host → `buy_url is not an http(s) address.`; → `buyUrl` (`""` clears) |
| `min_stock` | integer (ignored when null) | integer 0…999, else `min_stock must be a whole number 0…999.`; → `minStockSpools` |
| `note` / `sku` / `ean` | string (ignored when null) | `_mcpText` 500 / 64 / 64 → `note` / `sku` / `ean` |
| `add_links` | `[{url, label?}]` | each url: `_mcpText(2000)` + `https://` prefix, invalid → `"<url as given>" is not an http(s) address.`; added when not already there (exact url): `{ url, label: _mcpText(label, 80), kind }` |
| `remove_links` | string[] | drops attachments whose `url` equals one exactly (not normalised) |
| — | links after the change > plan limit | `This account's plan allows <n> link(s) per product.` (checked on the resulting list, so it also fires on a remove when the list was already over a lowered limit) |

Nothing given → `Nothing to change.` `before` = `{k: products[hash][k] ?? null}` for each key of the patch.
Output `{ change_id, applied: true, spool_id, before, after: patch, currency, prices_stored: "without VAT" }`.
Summary `"<name> (product): <patch keys joined by ", ">"`.

### create_spools — kind `create`, not undoable
| Input | Type | Validation (in this order) |
|---|---|---|
| `idempotency_key` | string, required | `_mcpText(key, 120)` empty → `idempotency_key is required (e.g. the invoice number).` |
| — | key already in the journal (`tool == "create_spools"` and same key) | **not an error**: `{ change_id: <that entry's id>, applied: false, already_created: true, spool_ids: <its created>, note: "This key was already used: nothing new was created." }` — answered before the write and cap gates |
| `items` | array, 1…20 in the schema | empty / not an array → `items is empty.` |
| `items[].quantity` | integer, default 1 | counted as `max(1, floor(Number(q) \|\| 1))`; total > 20 → `At most 20 spools per call (asked: <total>).` |
| — | daily | `At most 100 new spools a day (<today> already today).`, then the write gate with `count = total` |
| `items[].product_id` | integer, required | per item, in order: `floor(Number(id))`, looked up with `GET https://api.tigertag.io/api:tigertag/product/get?uid=123456789&product_id=<id>` (7 s timeout); not ok → `Catalogue product <id as given> not found — use search_catalog.`; `product_type` other than `Filament` (absent = Filament) → `Product <id> is a <product_type> Studio cannot add as a spool.`; then `note` (when truthy): UTF-8 bytes of `_mcpText(note, 200)` > 28 → `The note is written on the chip: 28 bytes max.` — every item checked before anything is written |
| `items[].weight_g` | number | absent or `null` → full (`measure_gr`); else when `Number(weight_g)` is finite: `weight_available = round(max(0, min(measure_gr \|\| 1000, weight_g)))` |
| `items[].note` | string | when truthy: `message = _mcpText(note, 200)` (≤ 28 bytes, checked above) |

Each spool: a new doc `users/{uid}/inventory/TigerData_<13-digit ms><4 random digits>` written in a
transaction that fails when the id exists (3 tries), body = `_catalogDocFromApi(api, pid, id)` (the
catalogue mapping: `uid` = the id, `id_brand`, `id_material`, `id_type`, `id_aspect1/2`, `id_unit`, `id_product`,
colours, `data1…7`, `measure`, `measure_gr`, `weight_available`, `message: ""`, `TD`, `timestamp`,
`updatedAt`, `catalogSyncedAt`, `deleted: null`, `deleted_at: null`, + `_productApiFields`). A failure
part-way journals the spools already created under the key, then throws
`<error> — <n> spool(s) were created before the error and are journaled under this idempotency_key: <ids joined by ", ">.`
(the bare error when none were created). Journal
`{ kind: "create", idempotency_key, count, created, summary: "<n> spool(s) added from the catalogue" }`.
Output `{ change_id, applied: true, created: [{spool_id, product_id}], next: "Set price / buy link with update_product and storage with move_spool on these ids." }`.

### create_rack — kind `rack_create`, not undoable
Order: write gate → `name` = `_mcpText(name, 40)`, empty → `name is required.` → a rack with the same
trimmed case-insensitive name → `A rack is already called "<name>" — pick another name.` → 5/day →
`At most 5 new racks a day.` → `levels` integer 1…15 (`levels must be 1…15.`) → `positions` integer 1…20
(`positions must be 1…20.`) → `depth` (absent/null = 1) integer 1…4 (`depth must be 1…4.`). Writes
`users/{uid}/racks/<auto id>` (`add`): `{ name, subtitle: _mcpText(subtitle, 60), level, position, order: <number of racks>, createdAt, lastUpdate }`
(+ `depth` only when > 1). Failure → `The rack could not be created.` Summary
`new rack "<name>" <L>×<P>` (+ `×<D>` when D > 1). Output `{ change_id, applied: true, rack_id, name, levels, positions_per_level, depth, slots: L·P·D }`.

### rename_rack — kind `rack`
`rack` required (§2). `name` (when not null): `_mcpText(40)`, empty → `name cannot be empty.`; used by
another rack → `A rack is already called "<name>".` `subtitle` (when not null): `_mcpText(60)`. Neither →
`Give a new name and / or subtitle.` Writes `users/{uid}/racks/{id}` `set(merge)` `{ ...after, lastUpdate: <serverTimestamp> }`.
`before = {f: rack[f] ?? ""}`. Summary `rack "<before.name ?? rack.name>" → <JSON.stringify(after)>`.
Output `{ change_id, applied: true, rack_id, before, after }`.

### find_free_slots (read, no write gate)
`rack` optional (§2), `limit` = `max(1, min(200, Number(limit) || 20))`. A slot is taken when a
non-deleted spool (twins included) sits on it; locked slots are not free. Iteration level → position →
depth. Output `{ total_free, racks: [{ rack: name || id, rack_id, printer_feed: !!rack.printer, free_count, slots_total: L·P·D, free: [{level, position, depth}] (first <limit>) }] }`.

### list_changes (read, no write gate)
`limit` = `max(1, min(100, Number(limit) || 20))`. Output `{ total, changes: [{ change_id, at: ISO string, tool, summary, undone: !!undoneAt, created? }] }`, newest first.

### undo_change — kind `undo`
Write gate (counts 1), then, in order: unknown → `No change <id> — call list_changes.`; `undoneAt` set →
`That change was already undone.`; `create` → `A creation is not undone by an assistant (it never deletes). The user deletes these spools in Studio: <ids joined by ", ">.`;
`rack_create` → `A new rack is not undone by an assistant (it never deletes). The user deletes "<rack_name>" in Studio.`;
`undo` → `An undo is not undone — make the change again instead.`; `ticket`/`ticket_reply` → the ticket text.

**"Changed since"** — each touched field of `after` is compared with the live value, key-order free
(`canon`: maps re-built with sorted keys, recursively; `undefined` → `null`; `JSON.stringify` equality):
- `spool`: per doc in `docs`, every key of `after` except `needUpdateAt`, against the doc's current raw
  value (doc missing from the inventory → `Spool <id> is no longer in the inventory.`; a tombstoned
  `deleted: true` doc still counts as present) → `Spool <id> changed again since (<fields>) — not undone.`
  Restores `before` in one batch (`null` → `<delete>`, so `rack: null` before becomes a deleted `rack`) + `updatedAt`.
- `product`: against `products[hash]` (`attachments` also accepted when equal to the cleaned list) →
  `The product changed again since (<fields>) — not undone.`; spool gone → `Spool <id> is no longer in the inventory — its product cannot be reached.`
  Restores through the product write with `null` replaced by `[]` (attachments), `0` (minStockSpools),
  `null` (buyPriceHt), `""` (everything else).
- `rack`: `rack[f] ?? ""` vs `after[f]` → `The rack changed again since (<fields>) — not undone.`; rack gone → `That rack no longer exists.`

Then the original gets `undoneAt`, a new entry `{ tool: "undo_change", kind: "undo", undoes, summary: "undo: <original summary>" }` is logged.
Output `{ change_id: <the undo's id>, applied: true, undid: <id>, restored: spool ? docs[0].before : before }`.

## 5. Not written by an assistant
No delete of a spool, product or rack (empty = weight 0). No reward, quest bump or telemetry
(`questsMuted`). No other field than the ones above.

## 6. `cases.json`

An array of `{ name, tool, input, before, expect, note? }`.
- `before.inventory` — `users/{uid}/inventory` docs by id, in `state.rows` order (twin dedup keeps the first);
  `before.products`, `before.racks` (by id, in `order`), `before.journal` (merged journal entries; `at` as ISO;
  `"_repeat": n` = n copies with distinct ids). Extensions: `before.now` (ISO, default `2026-11-11T10:00:00.000Z`),
  `before.user` (`users/{uid}` fields; default below), `before.write_allowed` (default `true`),
  `before.containers` / `before.containerOverrides`, `before.catalog` (`product/get` answers by product id).
- Default `before.user`: `{ "supportPublicly": true, "tier": "free", "vatCountry": "FR", "priceInputMode": "TTC" }`; uid `uGoldenOwner01`.
- `expect.writes` — data writes in order, `{ path, op, fields }`; `fields` is exact unless `"subset": true`.
  `<label>` / `<cloudSeed>` stand for §2's computed values, `<new_id:TigerData_>` for a minted id,
  `<auto_id>` for a Firestore auto id, `<change_id>` for a generated journal id. A refusal has `writes: []`.
- `expect.journal` — the journal entry to create (subset: `id`, `at`, `expireAt`, `via` are generated);
  `expect.journal_update` — the `undoneAt` update of an undone entry.
- `expect.error` — the exact text; `expect.output` — the exact answer.
- `note` — where the code's behaviour is ambiguous or worth a second look.

## 7. Open points — copy the current behaviour, keep the note

- Twins: `_mcpPatchSpool` uses the one-way `_twinRowOf` (needs `twin_tag_uid` on the kept row), while the
  slot check uses the two-way `twinSpoolIdOf`. A pair linked on one side shows as two spools and a
  write through the unlinked half reaches one doc.
- Product docs store `key` with the tier (`_spoolGroupKey`) although the doc id hashes the tier-free
  product key; the comment at `_productKeyHash` says only older writes did that.
- `min_stock > 0` silently adds `favorite: true` (not journaled, not undone).
- A rule rejection of a product write (e.g. attachments over the server limit) fails the tool, nothing
  journaled — fixed in Studio 2026-11-11 (`_writeProduct(…, { throwOnError: true })`), as the Hub does.
- Undo of a move to a slot that had no rack restores by **deleting** `rack` (not writing `null`); legacy
  flat `rack_id` / `level` / `position` fields are never cleared by `move_spool`, so a legacy doc
  "unstored" with `rack: null` still reads as stored through `rack_id`.
- Also worth knowing: `move_spool` with no `rack` looks up `""`, which matches a rack whose name is
  empty; `spool_id` in an answer is the kept twin, possibly not the id the assistant sent; the 500/day
  cap counts every kind, undone or not.
- `create_spools` checks every item's note (28 bytes) before anything is created, including a later
  item of a product already looked up (fixed 2026-11-11).

## 8. Support and labels — `support.json`, `labels.json`

The hosted connector's read tools `search_wiki`, `read_wiki_page`, `list_tickets`, `get_ticket` and
`get_label`. Both files are **generated** from Studio's own modules. Never edit them by hand: run the
script after a change and commit the result with the change.

- `node scripts/mcp-golden-support.mjs [--check]`: `renderer/ai/support-tools.js` run under Node
  against a fixed wiki index and fixed request rows. Each case is `{ tool, input, output | error }`,
  where `output` is Studio's exact answer. `service_error` is the error code the request service
  (`myReports`) threw for that case.
- `node scripts/mcp-golden-labels.mjs [--check]`: `renderer/labels/index.js` `buildLabel`, with five
  label texts × every template (qrOnly included) × 203 / 300 dpi × slot sets. The file gives the SHA-256
  of each SVG, the full SVG of the classic 203-dpi label, and the SHA-256 of `qrSvg(link)` for each link.
  Slot words come from the en locale. Checked on 2026-11-11: the Hub's `lib/labels/build.ts` gives the
  same 150 SVGs, byte for byte.

**Online differences** (`support.json` › `online`, founder 2026-11-11):
- **No request is sent from the connector.** `open_ticket` and `reply_ticket` are not listed online.
  The user sends requests and replies in Tiger Studio (Studio Web at
  [studio.tigersystem.io](https://studio.tigersystem.io/) or the desktop app).
- Online adds a few fields to Studio's answers:
  - `search_wiki` › `if_not_solved`;
  - `list_tickets` › `how_to_send`, the exact steps of the *Improvements & suggestions* card;
  - `get_ticket` › `how_to_reply`.
- An assistant that can open a browser itself, where the user is signed in, takes them to Studio Web's
  form; otherwise it walks them through the steps.
- `pending_drafts` is always `[]` online.
- The online tool descriptions and the support part of the server instructions are
  `online.descriptions` / `online.instructions_support`.
- `get_label`:
  - `svg_text` and `qr_svg` answer as locally.
  - `png`, `pdf` and `svg` answer `status: "waiting_for_user"` and a `download_url` instead of `opened`.
    The URL is a signed-in page, `https://tigersystem.io/<lang>/labels/spool/<spool_id>?kind=…&template=…&dpi=…&slots=…&format=png|pdf|svg`, that reads the spool as the visitor and draws and rasterises
    the label in the browser. There is no server-side PNG: `sharp` / librsvg ignores `textLength`.
    A product label also answers `public_svg_url` (the public `/api/public/v1/label/<id>.svg`). Since Hub v1.75.0 (live 2026-11-11).
  - `print` is refused with a tool error: printing to a label printer goes through Studio on the computer.
- The row → label text mapping is Studio's `labelInfo` (`renderer/inventory.js`, `initLabels`):
  - every text field goes through the "empty when `-` or `None`" rule;
  - temperature ranges are written `a–b °C`, with `?` for a missing end;
  - drying is written `T °C · H h`;
  - `protocol` is `TigerQR+` for a catalogue product or a TigerTag+ spool, else `TigerQR`;
  - `hexes` are cut to 7 characters;
  - `name` is the colour name, else the product name, else the aspects.
