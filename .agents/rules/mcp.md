# MCP servers (local + hosted)

**Rule.**
- **Reads** never return a credential and return decoded, named values instead of raw ids.
- **Writes** go only through dedicated write tools, never a raw Firestore write: a closed allowlist of
  fields on the user's own spools, products and rack placement. Every write is journaled with the state
  before it and can be undone. Writing is its own opt-in, per profile and per assistant, off by default.
  Built in the local server (`docs/MCP.md` §5 "Write tools"); the hosted connector is still read-only.
- **An assistant never deletes anything.** It empties a spool by setting its weight to 0.
- **Never writable**: credentials, printers, devices, scales, friends, the profile and the `users/{uid}`
  root, chip records (`rfidList`, `rfidAliases`), XP, TigerCoins, trophies and quests. A write made by an
  assistant earns no reward.
- **Numbers a model gets wrong** (colour distance, quantities) are computed in the tool and returned as
  results.
- **The local server and the hosted connector** (TigerHub `lib/mcp/`) keep the same tools, schemas and
  outputs.

**Why.** Every tool result goes into the assistant's conversation and reaches its vendor, and an assistant
reads untrusted text (an invoice, a `.3mf`, a friend's note) that can try to steer it. What it can change
must be bounded, visible and reversible — and the Firestore rules do not bound it: `inventory` is
owner-write with no field allowlist, so the tool layer is the only gate.

**How.** Read `docs/MCP.md` before touching MCP code. `secrets` / `apiKeys` are refused and
`MCP_SECRET_FIELD` masks the rest; keep `MCP_DATA_GUIDE` true whenever a Firestore field or collection
changes. A tool added or changed in Studio (`MCP_TOOLS` / `MCP_HANDLERS`) is mirrored in the Hub
(`lib/mcp/schemas.ts`, `lib/mcp/guide.ts`).
