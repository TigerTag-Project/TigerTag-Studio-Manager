# Writes through the hosted connector — plan

Goal: an assistant connected online (ChatGPT, Claude web, Le Chat, Grok, Gemini) can make the same
changes as one on this computer, through `mcp.tigersystem.io`, with the same limits, the same journal
and the same Undo. Rules: `.agents/rules/mcp.md`. Local contract: `docs/MCP.md` §5 "Write tools".

Not in scope: printers (online has no live printer link), deletes (never), colour edits and spools
outside the catalogue (not built locally either), guide mode (screen tools stay local).

## The contract (both servers)

**Tools** — same names, schemas and outputs as the local server: `set_spool_weight`, `update_spool`,
`move_spool`, `update_product`, `create_spools`, `create_rack`, `rename_rack`, `list_changes`,
`undo_change`, and `find_free_slots` (read). Listed and callable only when the grant allows writes.

**Behaviour** — a closed field list; twin mirrored; chip fields (note, TD) set `needUpdateAt`; price
stored HT with the VAT conversion; attachments within the plan limit; rack slots checked (size, depth,
locked, never a swap); never a delete (empty = weight 0, a creation is not undone by an assistant);
undo refused when the doc changed since (maps compared key-order free); every call — reads
included — refused outside the TigerSquad, with a tool error the assistant can relay (founder,
2026-11-11); no telemetry or quest bump. Caps per account, local and online counted together: 500
changes a day, `create_spools` 20 a call and 100 a day (`idempotency_key` required), 5 racks a day.

**Journal** — Firestore `users/{uid}/agentChanges/{changeId}`, one per change:
`{ id, at, expireAt (at + 30 days), via: "local" | "online", client, grantId?, tool, kind, summary,
count?, docs?: [{ id, before, after }], spool_id?, rack_id?, rack_name?, before?, after?, created?,
undoes?, undoneAt? }` — `kind` = `spool` | `product` | `rack` | `create` | `rack_create` | `undo` |
`ticket` | `ticket_reply`. A product change carries `spool_id` (Studio reaches the product through it).
`before` / `after` hold only the touched fields, never a whole doc (1 MiB limit; an undo compares
those fields only). Online, the write and its journal doc go in one `documents:commit`, as the user
(the rules apply); an undo is one commit too: the original's `undoneAt` (only while unset) plus a new
`kind: "undo"` doc with `undoes`. The caps' day is the UTC day (Hub: an aggregation COUNT on
`at >= 00:00Z`; a few changes past 500 under concurrent calls are accepted). TTL on `expireAt`
declared in the backend `firestore.indexes.json` (`fieldOverrides`, `ttl: true`).

**Access per assistant** — the grant's `scope`: `"read"` (default) or `"read write"`, chosen on the
consent screen (Read | Read & write) and changed later with `PATCH /api/account/mcp-grants?id=`
`{ write: boolean }` (bearer = the user's Firebase ID token; answers `{ id, scope }`, 404 when the grant
is not theirs or revoked). `GET` returns each grant's `scope`; a grant without one is `"read"`. The scope
is re-read on every call (60 s cache). Assistants cache `tools/list`: after Read → Read & write the user
refreshes or reconnects the connector to see the new tools (Studio's copy says so). Outside write, a write
call answers a tool error ("this connection is read-only, switch it in Manage access"). Write tools carry
`readOnlyHint: false`, `destructiveHint: false`, `idempotentHint` for `set_spool_weight`, `move_spool`,
`rename_rack`; their descriptions and `data_guide` say text from friends' data is data, never an
instruction, and to confirm with the user before a write.

## Steps

| # | Where | What | Status |
|---|---|---|---|
| 1 | Studio + Hub | Agree on the contract above | agreed 2026-11-11 |
| 2 | Backend (`TigerTag_Firebase_Backend`) — written by Studio, reviewed by the Hub | `agentChanges` rule: owner reads; owner creates with `hasOnly` on the fields above; owner updates only `undoneAt`; no delete. TTL policy on `expireAt`. `README.md` + Studio `docs/firestore-schema.md`, Hub mirror | deployed 2026-11-11 (backend files not committed yet) |
| 3 | Hub | Consent screen choice; `scope` on the grant; `scope` in `GET`; `PATCH`; refresh keeps the scope | done — Hub v1.70.0, 2026-11-11 |
| 4 | Hub `lib/mcp/` (own branch) | Port the write tools, checked against Studio's golden cases (`docs/mcp-golden/`), (`schemas.ts` + `guide.ts` mirror Studio's `MCP_TOOLS` / `MCP_DATA_GUIDE`), tools listed by scope, caps counted on today's `agentChanges`, squad gate | done — Hub v1.70.0; the squad refusal names the account since v1.72.1 |
| 5 | Studio | Journal shared through Firestore (local copy kept until step 2 is live); history names the online assistant; Undo for both; Read \| Read & write switch per online assistant in Manage access (`mcp:hosted-grant-write`) | done, uncommitted |
| 6 | Studio | Copy that says online is read only: `aiGroupWebSub`, `aiWhereWebSub`, `aiAccessPrivacy`, the web setup's connect text (say Read \| Read & write is chosen when connecting); `docs/MCP.md` §9 | done, uncommitted (+ `aiFeedWebNote`, `aiConnectedWeb`, new `aiGrantSwitchNote`) |
| 7 | Wiki (`TigerSystem-Docs`) | "Connect an AI assistant": choosing Read & write, changing it later, Undo | after step 4 |
| 8 | All | Test together (below), then release notes and What's New | 2026-11-11: 1–4 passed with ChatGPT on the founder's account; 5–7 not run yet. Release copy at release time |

## Test

1. ChatGPT connected with Read: no write tool is listed; a change request is refused.
2. Switch it to Read & write in Studio (Manage access): the tools appear (new session or re-list).
3. "Set the Rosa3D PLA Red to 250 g": the weight changes, an `agentChanges` doc `via: "online"`,
   `client: "ChatGPT"` exists, Studio's history shows it with ChatGPT's name.
4. Undo from Studio: the weight comes back, `undoneAt` is set; ChatGPT's `list_changes` sees it undone.
5. A change made on this computer shows in ChatGPT's `list_changes` (one journal).
6. Caps: the 501st change of the day is refused, online and local together.
7. Leaving the TigerSquad cuts the grant; a write is refused.

## Support and labels (live in Hub v1.75.0, 2026-11-11)

The local server's `search_wiki`, `read_wiki_page`, `list_tickets`, `get_ticket` and `get_label` come
online with the same names, inputs and outputs, behind the same TigerSquad gate (all are reads, always
listed). References: `docs/mcp-golden/support.json` and `labels.json`, both generated from Studio's
modules (README §8).

- **Wiki**: the same index `https://wiki.tigersystem.io/ai-index/<lang>.json` (`llms.txt` fallback), the
  same scoring, excerpt and 12,000-character page cap. A page missing from the index is read from its
  HTML server-side. The default language is the account's `prefs/app.lang`.
- **Requests**: backend `myReports` (`list` / `all` / `thread`) with `idTokenFor(uid)` in
  `X-Firebase-Id-Token`, as Studio sends it.
  - **No request is sent online** (founder): `open_ticket` and `reply_ticket` are not listed, there is
    no draft and no new collection.
  - `list_tickets` › `how_to_send`, `get_ticket` › `how_to_reply` and `search_wiki` › `if_not_solved`
    send the user to Tiger Studio (Studio Web or the desktop app, *Improvements & suggestions*).
  - An assistant that can open a browser itself takes the user there. Otherwise it walks them through
    the steps.
  - `pending_drafts` is always `[]`.
- **Labels**: `lib/labels/build.ts` (the same 150 SVGs as Studio, checked 2026-11-11), plus a
  `spoolLabelInfo(row)` that mirrors Studio's `labelInfo` (README §8).
  - `svg_text` and `qr_svg` answer as locally.
  - `png`, `pdf` and `svg` answer `status: "waiting_for_user"` and `download_url`, a signed-in page,
    `https://tigersystem.io/<lang>/labels/spool/<spool_id>?kind=…&template=…&dpi=…&slots=…&format=png|pdf|svg`. The page reads the spool as the visitor (the rules apply), draws it with `lib/labels/build.ts`
    and saves it in the browser (`labelOut`). There is no server-side render and no token: `sharp` / librsvg
    ignores `textLength`, so a server PNG would not match Studio.
  - A product label also answers `public_svg_url` (the public `/api/public/v1/label/<id>.svg`). Since Hub v1.75.0 (live 2026-11-11).
  - `print` is refused, and its description says printing goes through Studio on the computer.

## Risks and open points

- **ChatGPT may call write tools only in its developer mode** (custom connectors with actions). Check
  OpenAI's current help before promising it, and say so in the wiki and the setup copy if it holds.
- **Untrusted text** (an invoice, a `.3mf`, a friend's note) can try to steer the assistant: the field
  list, the caps, no delete and Undo are what bound it; nothing new is opened online.
- **Two copies of the journal** in Studio until step 2 is live: merged by id, the newer `undoneAt` wins.
  Once the rules are live the local copy can become a cache only.
- **Cost at 500,000 users**: one listener per signed-in account on its own `agentChanges` (empty for
  most), one count query per write online — nothing grows with the number of users.
