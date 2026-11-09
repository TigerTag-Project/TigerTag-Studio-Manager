# MCP — AI assistants read your Studio data

This is the reference for Tiger Studio Manager's **local MCP server**: what it is, how a
user connects an assistant, what it exposes, the rules it follows, and how to extend it
without breaking them. Read it before touching any `mcp` code.

---

## 1. What MCP is, in two minutes

The **Model Context Protocol** (<https://modelcontextprotocol.io>) is the open standard AI
assistants use to call external **tools**. An assistant (the *client*: Claude Desktop,
Claude Code, Cursor, VS Code…) connects to a *server*, asks it for its tool list
(`tools/list`), and calls a tool (`tools/call`) when a question needs it. Each tool has a
name, a description the model reads to decide when to use it, and a JSON Schema for its
arguments. Messages are JSON-RPC 2.0.

Two transports matter here:

- **stdio** — the client launches the server as a subprocess and talks on stdin/stdout
  (how Claude Desktop runs local extensions).
- **Streamable HTTP** — the client POSTs JSON-RPC to a URL (how Claude Code, Cursor and
  VS Code reach an HTTP server).

Studio is an **HTTP server on this computer**, and ships a tiny **stdio bridge** for
clients that only launch subprocesses.

**Local means local.** ChatGPT, and Claude on the web or mobile, call tools *from their own
cloud*; they cannot reach `127.0.0.1`. They use the **hosted connector** instead —
`https://mcp.tigersystem.io/mcp`, shipped 2026-10-05 (see §9).

---

## 2. For the user — turning it on

**My profile** (account menu → *My profile*) → **AI assistants** → *Let an AI read my
inventory*. It is a **per-profile** choice, off by default: the server serves the account
that is signed in, so it runs only while THAT account has opted in — switching to a
profile that has not turns it off, and signing out stops it. The ⓘ next to the toggle
explains what an assistant can see. Three tiles with each app's logo sit underneath —
greyed and inert until the toggle is on:

| Tile / link | What happens |
|---|---|
| **Claude** | Studio builds a `.mcpb` bundle and opens it → Claude Desktop shows its extension install dialog |
| **Cursor** | opens Cursor's MCP install link |
| **VS Code** | opens VS Code's MCP install link |
| **Let it make changes too** | second switch, per profile, off by default, inert while reading is off: lists the write tools (§5) to the assistant |
| **Renew the key** (hold 1.5 s) | rotates the token — every assistant must be added again |

The block only appears on the signed-in account's own profile.

**Claude Code** (developer tool) has no one-click install and is not offered in the UI:
run `claude mcp add --transport http tiger-studio http://127.0.0.1:5795/mcp --header "Authorization: Bearer <token>"`
with the token from `<userData>/mcp.json`. Logos: Simple Icons SVGs in
`assets/svg/brands/` (`claude.svg`, `cursor.svg`, `vscode.svg`), tinted in CSS.

Studio must be running (and signed in) for an assistant to get answers.

### The online connector (hosted by the Tiger Hub)

Below the tiles, a **From the web and your phone** sub-block presents the Hub's
hosted server — `https://mcp.tigersystem.io/mcp` (OAuth 2.1, same 14 read-only tools,
credentials masked; design: `MCP-HOSTED.md` in the `TigerTag_Hub` repo). It does **not**
depend on the local toggle and is never greyed: it works without Studio.

| Element | What happens |
|---|---|
| **Claude / ChatGPT / Grok / Le Chat** tiles | copy the address and open that assistant's section of the guide (`#claude-web-desktop-mobile`, `#chatgpt`, `#grok`, `#le-chat-mistral`; French anchors on `/fr/`), with a toast |
| Address + **Copy** | copies `https://mcp.tigersystem.io/mcp`, to paste as a custom connector in Claude.ai / ChatGPT / Codex / Cursor |
| **How to connect** | opens the public guide externally — `wiki.tigersystem.io/guides/connect-an-ai-assistant/` (`/fr/` edition when Studio is in French) |
| Info bubbles | on the online card's title: what it is (`eacMcpWebSub`); on the local "AI assistants" card's title: local = only while Studio is open, sees live printer state; online = anywhere without Studio, no live printer state (`eacMcpWebDiff`) |
| **Connected online assistants** | `GET https://tigersystem.io/api/account/mcp-grants` with the signed-in account's Firebase ID token → one row per grant (name, connected date, last used) |
| **Cut access** (hold 1.5 s) | `DELETE …/mcp-grants?id=<id>` — 204 or 404 both remove the row |

The Hub route sends no CORS headers, so both calls go through the main process
(`mcp:hosted-grants` IPC → `mcpBridge.hostedGrants(idToken, revokeId?)`, fixed URL, GET/DELETE
only). The list is fetched each time the profile opens; empty → a short "none yet" line,
failure → one quiet error line (never a dialog). Same visibility rule as the rest of the block:
the signed-in account's own profile only.

---

### The AI assistant window (sidebar)

`renderer/ai/assistant.js` + `ai.css`, opened by **AI assistant** (robot icon) under Notifications
and Tiger Quests — desktop only (no `mcpBridge` in Studio Web). A beginner's way in, on `openDialog`:

1. Welcome (three things it can do) → **which assistant** (Claude, ChatGPT, Cursor, VS Code, Le Chat,
   Grok, or none → download Claude) → **where** (this computer / web and phone — asked only for Claude)
   → **what it may do** (look / tidy up, this computer only: sets the two switches of My profile)
   → **plug it in** (local: `mcpBridge.install`; online: the address is copied and the wiki guide
   opens on that assistant) → **wait**.
2. The wait ends by itself: on this computer the first tool call (every call is passed to
   `aiOnToolCall` by the `mcp:call` relay); online a grant created or used since the wait started
   (`hostedGrants`, every 5 s, only while that screen is open). "It answered, carry on" ends it by hand.
3. A ceremony ("Plugged in", a robot swelling behind the window), then the **dashboard**: status
   chips, three questions built from the user's own stock (ticked when the matching tool is called),
   the live feed of this session's calls in plain words (`aiAct_*`; online calls run on the Hub and
   do not show), and the journaled changes with **Undo** (`_mcpUndo` — the user's undo needs no write
   switch). A spool the assistant looked at or changed glows in the main view (`.ai-glow`).
4. Per account, `tigertag.ai.<uid>` remembers it is plugged in (the sidebar's "New" pill becomes a dot).

## 3. Architecture

```
AI client ──HTTP POST /mcp──▶ main process: services/mcpServer.js (protocol, auth guard)
   │                                │ tools/call → IPC `mcp:call`
   └─stdio─▶ mcpStdioBridge.js ─────┘          ▼
             (Claude Desktop)        renderer: MCP_TOOLS / MCP_HANDLERS (inventory.js)
                                     reads state + Firestore as the signed-in user
                                               │ IPC `mcp:result`
                                               ▼ answer
```

- **`services/mcpServer.js`** — JSON-RPC: `initialize` (server info + `instructions`),
  `ping`, `tools/list`, `tools/call`; notifications are accepted silently. JSON responses
  only (no SSE: nothing here needs server-initiated messages). Tool failures are returned
  as a result with `isError: true` (readable by the model), not as protocol errors.
- **`services/mcpStdioBridge.js`** — stdin line ⇄ HTTP POST relay. Dependency-free.
- **`main.js`** (section *Local MCP server* in `CODEMAP-main.md`) — prefs, start/stop,
  `mcp:*` IPC, relay to the renderer (15 s timeout), `.mcpb` builder (`_mcpBuildBundle`,
  dependency-free `_zip`) and install links (`mcp:install`).
- **`renderer/inventory.js`** (section *Local MCP server* in `renderer/CODEMAP.md`) — the
  tools, the notice (`MCP_DATA_GUIDE`), the decoder, and the Settings card.

**Why the tools live in the renderer:** that is where the signed-in Firebase session and
the already-loaded inventory are. Reads go through the same Firestore Security Rules as
the rest of the app — the server never holds credentials of its own.

Prefs: `<userData>/mcp.json` = `{ enabledFor: [uid…], port (5795), token }`, file mode 600.
The renderer reports the signed-in account (`mcp:set-account`, from `setConnected` /
`setDisconnected`); main starts the server only if that uid is in `enabledFor`.
Bundle + bridge copies: `<userData>/mcp/`.

---

## 4. Security — the rules this server keeps

| Rule | How |
|---|---|
| **Read by default** | the query tools carry `readOnlyHint: true`; the write tools (`readOnlyHint: false`) exist for the assistant only while the account allows changes, never delete, and are journaled + undoable |
| **Loopback only** | listens on `127.0.0.1` — never another interface |
| **Token** | `Authorization: Bearer <48 hex>` required, else **401** — compared in constant time (`crypto.timingSafeEqual`); rotatable (hold 1.5 s) |
| **Batch cap** | a JSON-RPC batch holds 1–20 messages, else **400** — each `tools/call` is relayed to the app |
| **Files** | `mcp.json` `0600`; the `.mcpb` carries the token, so `<userData>/mcp/` is `0700` and the bundle `0600` |
| **No DNS rebinding** | `Host` must be `127.0.0.1:<port>` / `localhost:<port>`, else **403** |
| **No browser** | any `Origin` header → **403** (a web page cannot call it) |
| **Scope** | the account's own `users/{uid}/…`, an accepted friend's `inventory` / `racks` / `products` / `lists`, and `userProfiles/…` — anything else is refused (`_mcpCheckPath`); Firestore rules apply on top |
| **No credentials, ever** | `secrets` and `apiKeys` subtrees refused; fields matching `MCP_SECRET_FIELD` masked as `"[redacted]"` — passwords, access / check codes, tokens, keys, certs, cloud logins |
| **Identity privacy** | e-mail and the Google real name (`googleName`, `firstName`, `lastName`) are masked — the app never displays them either |
| **Off by default, per profile** | each account opts in from *My profile*; the server runs only while the signed-in account has — another profile's data is never exposed by someone else's choice |

Why masking matters: **the server is local, the data is not** — every tool result becomes part
of the assistant's conversation and is sent to its vendor (Anthropic, Cursor, Microsoft…),
friends' shared stock included. The ⓘ bubble in *My profile* says so; never word it as
"stays on this computer".

**Untrusted text.** Names, notes, messages and list text are user data — a friend's included —
and may carry instructions aimed at the model. The server `instructions` and the notice
(`untrusted_text`) tell the model to report such text, never follow it, and friend results carry
`authored_by: "friend"`. This is labelling, not a guarantee: an assistant that also has outbound
tools (web, e-mail) is the user's choice.

**Where the token also lives.** Claude Desktop keeps the extension's `env`, and Cursor / VS Code
keep the `Authorization` header, in their own config files in clear — standard for MCP
clients. *Renew the key* revokes every copy at once.

Security review: `docs/reviews/2026-09-29-mcp-security.md`.

---

## 5. The tools

High-level (preferred — shaped for questions people ask):

| Tool | Returns |
|---|---|
| `data_guide` | **the notice** — what every field, id and collection means (see §6) |
| `account_overview` | account doc (masked), preferences, server stats, counts, friends, the uid |
| `search_inventory` | spools filtered by `query`, `brand`, `material`, `max/min_remaining_g`, `stored`, `limit` |
| `get_spool` | one spool in full: colours, weights, location, temperatures (own, else the material's recommendation — `temperatures_source` says which), twin |
| `inventory_summary` | totals, by material, by brand, low stock, not stored |
| `list_racks` | racks, size (levels, positions, depth), printer-feed racks, spools stored |
| `list_printers` | printers, model name, online now (live, from Studio) |
| `list_friends` | accepted friends |
| `friend_inventory` | a friend's spools (same filters) |
| `list_wishlists` | own or a friend's lists with items |
| `data_history` | history points (stock value, counts), newest first |
| `list_devices` | TigerScale scales + printer documents (masked) |

Catalogue and print planning (the assistant reads the invoice / photo / `.3mf` itself and passes
structured values; the tool does the colour and gram arithmetic):

| Tool | Returns |
|---|---|
| `search_catalog` | catalogue products by `ean` / `sku` (exact), words, `brand`, `material` (by ID: same material or family), `color_hex` (CIEDE2000 `delta_e`, ≤ 3 identical · ≤ 8 close · ≤ 15 similar) — `product_id`, colours, measure, EAN, SKU |
| `lookup_reference` | a reference table (`brand`, `material` with family / density / recommended temps, `aspect`, `type`, `diameter`, `container` with its empty weight), filtered by `text` |
| `identify_spool` | the spool a QR code (`qr.tigertag.io/<id>`, read with `qr-link.js` `parseQrLink`) or a chip UID / spool id designates — inventory, twin, linked maker chip, then `uidMigrationMap`; a product QR (`/p/…`) gives the product and the user's spools of it; `?weight=` / `?note=` come back as `proposed_values`, never applied |
| `match_filaments` | for each filament of a print `{slot, color_hex, material, grams}`: ranked spools of the stock (material by ID, colour by ΔE, needed = grams × (1 + margin) + 5 g, a spool never counted twice), the pick, `enough` / `shortfall_g`, location, and catalogue products to buy for what is missing |

Write tools — listed to the assistant only when the signed-in account turned on **Let it make
changes too** (My profile › AI assistants; `writeFor` in `mcp.json`, filtered in `main.js`
`listTools` and checked again by `_mcpWriteGate`):

| Tool | Does |
|---|---|
| `set_spool_weight` | `weight_available` from grams `remaining` / `gross` (empty-spool weight subtracted) / `consumed`, clamped 0…capacity; 0 = an empty spool |
| `update_spool` | note (`message`, 28 bytes) and TD (0.1…100, `null` removes it) — both chip data, so `needUpdateAt` is flagged on a chip — tags (replace / add / remove, `_normalizeTag`), empty-spool model (`container_id` + `container_weight`) |
| `move_spool` | `rack` = a free, unlocked slot (level, position and row within the rack's size and `rackDepthOf` depth; never a swap), or `unstore` |
| `update_product` | through `_writeProduct`: price (VAT converted, stored HT), `buyUrl`, `minStockSpools`, note, SKU, EAN, `attachments` (plan limit) |
| `create_spools` | chipless TigerData+ from catalogue `product_id`s (`_catalogDocFromApi` + `_createChipless`), optional weight and note; `idempotency_key` required; 20 per call, 100 a day |
| `create_rack` / `rename_rack` | a plain shelf (1…15 levels, 1…20 positions, depth 1…4, `createRack`; a name already used is refused; 5 a day), or a new name / subtitle (`updateRack`, undoable) |
| `list_changes` / `undo_change` | the journal; undo puts the values before back, refused when the spool (or rack) changed again since, and for a creation (spools or rack) |

`get_label` (read-only, always listed): a spool's label or its product's, built by `labels/index.js`
`labelFor` exactly as the label card draws it (template, up to 4 value slots, 203 / 300 dpi). `print`,
`pdf`, `png`, `svg` open Studio's print / save dialog through `saveLabel` (the user confirms; the tool
does not wait), `svg_text` returns the SVG in the answer, `qr_svg` only its QR code (`qrSvg`, same
encoding, 4-module quiet zone) with its link. `find_free_slots` (read-only) lists the free, unlocked
slots per rack, depth included — where `move_spool` can store a spool.

Every write is twin-mirrored, journaled in localStorage `tigertag.agentChanges.<uid>` (300 newest,
30 days) and runs inside `questsMuted()` — no quest, XP or TigerCoins for an assistant's change.
**Nothing is ever deleted** by an assistant: a finished spool is set to 0 g, a spool created by
mistake is deleted by the user. 500 changes a day per account. The hosted connector has no write
tool yet.

`data_guide` → `reading_files` tells the model where a `.3mf` keeps its filaments (Bambu / Orca
`Metadata/slice_info.config` `used_g`; unsliced = no grams) and how to read an invoice or a photo.
The hosted connector serves the same four (Hub v1.40.0, `lib/mcp/`).

Raw access (anything else in scope):

| Tool | Returns |
|---|---|
| `firestore_get` | one document by path |
| `firestore_query` | a collection, with `where` / `order_by` / `limit` (≤ 200) |

Counts are per **physical spool**: a twin-chip pair is one spool (`deduplicateTwins`,
same as the header stats).

---

## 6. The notice — why decoding matters

A raw spool document is unreadable to a model: `id_brand: 26145`, `id_aspect2: 252`,
`data2: 190`. Two mechanisms fix that:

1. **Decoding** — every document returned (`_mcpDocOut`) carries `data` (raw, masked)
   and, for spool-shaped docs, `decoded`: brand, material, aspects, type, diameter, chip
   version, colours as hex, nozzle / bed / drying temperatures, capacity, remaining grams…
   Labels are resolved **by ID** through the reference DB, never by string matching
   (CLAUDE.md rule).
2. **`data_guide`** — the notice (`MCP_DATA_GUIDE`): tiers, every spool field, every
   collection, friends, units. The server's `instructions` tell the model to call it first.

**`data1`-`data7` mean different things per product type** (`docs/TTAG-FIELDS.md`,
*Chip data slots*), so both the decoder (`_mcpDecodeDataSlots`, keyed on the `id_type`
ID) and the notice follow the type:

| Slot | Filament (142, or no `id_type` = legacy filament) | Resin (173) | Accessories (116), Spare Part (41) |
|---|---|---|---|
| `data1` | diameter id (56 = 1.75 mm) | mixing time, min | unused |
| `data2` / `data3` | nozzle temp min / max °C | work temp min / max °C | unused |
| `data4` / `data5` | drying °C / hours | curing °C / min | unused |
| `data6` / `data7` | bed temp min / max °C | washing °C / min | unused |

`info1` / `info2` / `info3` are material **flags** set from the catalogue — refill (no
spool), recycled, filled (a filler besides the polymer — stone, wood, carbon / glass fibre, metal…) — and are not written on the chip.
*Open point:* `docs/TTAG-FIELDS.md` still calls them "free-text slots"; the code and the
data use them as booleans. The notice follows the data until the contract is ratified.

**Keep them true.** When a field or collection is added or changes meaning, update
`MCP_DATA_GUIDE` (and `_mcpDecodeSpool` if it is a spool field) in the same change —
same reflex as `docs/firestore-schema.md`.

---

## 7. Adding or changing a tool — checklist

1. **Is it read-only?** If it writes, stop: writes follow `.agents/rules/mcp.md` (allowlisted fields, journal + undo,
   opt-in per assistant, never a delete) and the flow of §9.
2. Add the definition to `MCP_TOOLS` — `name` (snake_case verb), `title`, a
   **description written for the model** (what it returns, when to use it, units),
   `inputSchema` (JSON Schema, describe every property), `annotations: { readOnlyHint: true }`.
3. Add the handler to `MCP_HANDLERS`. Start with `_mcpRows()` / `_mcpMe()` (signed-in and
   own-account guards). Return a **plain object** (it becomes `structuredContent` and a
   JSON text block). Throw an `Error` with a human sentence for "not found" cases.
4. Return **decoded, named values** (grams, °C, labels) — never make the model interpret
   ids. Pass documents through `_mcpDocOut` / `_mcpPlain` so masking applies.
5. Never return a credential. If a new sensitive field name appears, extend
   `MCP_SECRET_FIELD`.
6. Cap list sizes (`limit`, ≤ 200) — a model's context is finite.
7. Update this file (§5), `MCP_DATA_GUIDE` if the data changes, `renderer/CODEMAP.md`.
8. Test (§8). A new tool reaches Claude Desktop only after the user re-adds the bundle
   (its manifest lists the tools).

**Descriptions are the API.** The model chooses tools from their descriptions alone: be
explicit about units, what "empty" means, and which tool to prefer.

---

## 8. Testing

```bash
npm run start:drive                       # dev app, then Settings → AI assistants → on
TOK=$(npm run -s drive -- eval "(async()=>(await window.mcpBridge.getConfig()).token)()")
curl -s -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" \
  http://127.0.0.1:5795/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
curl -s -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" \
  http://127.0.0.1:5795/mcp -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"inventory_summary","arguments":{}}}'
```

- **Guards**: no token → 401; `-H "Origin: https://x"` → 403; a path outside the scope →
  `isError` with the reason.
- **Masking audit**: walk `list_devices` / `account_overview` output for key names like
  `key|code|pass|token|cert|mail|name` and check each is either harmless or `[redacted]`.
- **stdio bridge**: pipe JSON-RPC lines into
  `ELECTRON_RUN_AS_NODE=1 TIGER_MCP_URL=… TIGER_MCP_TOKEN=… <electron> <userData>/mcp/tiger-mcp-bridge.js`.
- **Bundle**: `unzip -t "<userData>/mcp/Tiger Studio Manager.mcpb"` and read its `manifest.json`.
- The official **MCP Inspector** (`npx @modelcontextprotocol/inspector`) gives a UI to
  browse and call tools against `http://127.0.0.1:5795/mcp` with the bearer header.

---

## 9. Roadmap (see `ROADMAP.md`)

1. ~~**Hosted TigerTag connector**~~ — **shipped 2026-10-05** at `https://mcp.tigersystem.io/mcp`,
   served by the Tiger Hub (repo TigerTag-Hub, `docs/MCP-HOSTED.md`). OAuth 2.1 sign-in on the
   TigerTag account, reads Firestore **as the user** (their ID token, so the rules apply),
   same 14 tools / schemas / outputs as this server — **the two must change together**
   (Hub `lib/mcp/schemas.ts` + `lib/mcp/guide.ts` mirror `MCP_TOOLS` + `MCP_DATA_GUIDE`).
   Works without Studio running; live printer state stays Studio-only. Users see and revoke
   connected assistants on tigersystem.io → account → Data.
2. **Writes** — local server built (§5 "Write tools"). Left: the hosted connector (an OAuth
   scope `inventory.write` chosen at consent, the journal moved to Firestore
   `users/{uid}/agentChanges` with its rule, so a change made online can be undone anywhere),
   colour / TD edits, spools outside the catalogue, a "changes by assistants" list in My profile.
3. **In-app agent** sharing the same tool registry (local model, Ollama, or the user's key).

---

## 10. Formats referenced

- `.mcpb` — MCP Bundle, manifest `0.3`: a zip with `manifest.json` at the root
  (`name`, `version`, `description`, `author`, `server { type: "node", entry_point,
  mcp_config { command, args ["${__dirname}/server/index.js"], env } }`, `icon`, `tools`).
  Spec: <https://github.com/modelcontextprotocol/mcpb>.
- Cursor install link: `cursor://anysphere.cursor-deeplink/mcp/install?name=<n>&config=<base64 JSON>`.
- VS Code install link: `vscode:mcp/install?<url-encoded JSON {name, type, url, headers}>`.
