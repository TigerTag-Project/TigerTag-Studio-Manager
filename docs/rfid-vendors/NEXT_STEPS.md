# Multi-vendor RFID — handoff / resume notes

> Memo to pick up the multi-vendor RFID work where it was paused.
> Read this first when resuming the topic in a new session.

## Where we are

- **OpenRFID vendored as a Git submodule** at `OpenRFID/` (source untouched, sync via `git submodule update --remote OpenRFID`).
- **8 vendor spec sheets** ready in `docs/rfid-vendors/`:
  `tigertag.md`, `bambu.md`, `creality.md`, `anycubic.md`, `elegoo.md`, `snapmaker.md`, `qidi.md`, `openspool.md`.
- **README** has a "Multi-vendor RFID (planned)" section linking each spec.
- **JS parsers**: only **TigerTag** is implemented today (in `renderer/inventory.js` → `normalizeRow`). The other 7 vendors are NOT parsed yet.
- **Reader stack** already in place: USB ACR122U via `nfc-pcsc` in `main.js`. Hardware side is done — only the decoders are missing.

## Goal

Port each vendor's parsing logic from the Python source (in `OpenRFID/src/tag/<vendor>/`) into JS modules under `renderer/lib/rfid/<vendor>.js`, **read-only** (no clone, no write, no format).

The spec sheets are detailed enough that the JS port can be done **without re-reading the Python source** — they include block layouts, field offsets, lookup tables transcribed verbatim, encoding pitfalls, and ready-to-paste JS reference decoders for the simpler ones.

## Recommended porting order (easy → hard)

1. **Openspool** *(simplest)* — pure NDEF JSON, no crypto, no auth.
   Spec already contains a runnable JS reference decoder. Start here.
2. **Anycubic** — Mifare Ultralight, no auth, fixed ASCII offsets.
   Spec contains a `decodeAnycubic(buf)` JS function ready to adapt.
3. **Elegoo** — Mifare Ultralight + magic bytes + BCD-as-ASCII quirk.
   Spec contains a `decodeElegoo(buf)` reference + `makeMaterial` helper.
4. **Qidi** — Mifare Classic 1K with default keys (`FF×6`).
   Trivial auth, just 3 meaningful bytes carrying material/color/manufacturer codes.
5. **Creality** — Mifare Classic 1K, AES-128-ECB on sector 1, optional payload encryption.
   Lookup table for 24 materials transcribed in spec. Crypto heuristic + key hashes documented.
6. **Bambu** — Mifare Classic 1K, HKDF-SHA256 per-sector keys.
   Salt is operator-provisioned (not in source). Crypto path: `crypto.hkdfSync` in Node.
7. **Snapmaker** *(hardest)* — Mifare Classic 1K, HKDF + RSA-2048 PKCS#1 v1.5 signature.
   10 PEM keys versioned in `constants.py`. WebCrypto `RSASSA-PKCS1-v1_5` for verification.

## Suggested module layout

```
renderer/lib/rfid/
├── index.js          # Dispatcher: detect vendor from UID/header, route to parser
├── openspool.js      # Step 1
├── anycubic.js       # Step 2
├── elegoo.js         # Step 3
├── qidi.js           # Step 4
├── creality.js       # Step 5
├── bambu.js          # Step 6
└── snapmaker.js      # Step 7
```

The dispatcher should:
- Read the first block / header to identify the format
- Try Openspool first (NDEF JSON with `protocol: "openspool"` is unambiguous)
- Fall back to vendor heuristics (magic bytes, sector layout, etc.)
- Return a normalised object matching our existing `state.rows` shape so the inventory UI can render it without changes

## Things to decide before porting

- **Where the parsed tags live**: a separate "scanned but not in inventory" view? Direct insertion into Firestore? Local-only "scratch" list?
- **Conflict resolution** with TigerTag tags: if the same physical spool has both a TigerTag and a vendor RFID, do we merge?
- **Vendor lookup tables**: bundled at build time, or fetched from `cdn.tigertag.io`? OpenRFID embeds them inline; we could do the same in `data/vendors/`.

## Quick-start prompt for next session

> "On reprend la partie multi-vendor RFID. Lis `docs/rfid-vendors/NEXT_STEPS.md` pour le contexte. Je veux commencer par Openspool — sa spec est dans `docs/rfid-vendors/openspool.md`. Génère `renderer/lib/rfid/openspool.js` à partir de la spec, sans toucher à OpenRFID/. Puis on branchera le dispatcher."

## Source of truth

- **Submodule pointer**: tracked in `.gitmodules`
- **Latest commit on this topic**: `ccf9a48` (docs: README — mention OpenRFID submodule + multi-vendor RFID roadmap)
- **Specs commit**: `440d855` (docs: vendor OpenRFID + extract RFID vendor specs)

If specs are stale (after `git submodule update --remote`), regenerate the affected vendor sheet by re-reading `OpenRFID/src/tag/<vendor>/*.py` and updating `docs/rfid-vendors/<vendor>.md`.
