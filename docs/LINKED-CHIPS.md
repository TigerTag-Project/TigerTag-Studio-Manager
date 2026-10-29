# Linked chips — third-party RFID chips on Tiger spools

Many spools already carry a chip from their maker (Bambu Lab, Creality, …): MIFARE
Classic 1K, 4-byte UID, content encrypted or proprietary. Tiger Studio cannot read
them as TigerTags, but their **UID** is stable and unique. A *linked chip* maps such
a UID to a spool of the inventory, so scanning the maker's chip behaves like
scanning a TigerTag: the spool opens, the scale updates its weight.

## Data model

```
users/{uid}/rfidAliases/{UID_HEX}     (owner read / write, Firestore rules)
  spoolId   string     — the inventory doc the chip points to
  chip      string     — "mifare1k" | "mifare4k" | "unknown" (from the reader's ATR)
  vendor    string     — "bambu" | "creality" | "unknown" (phase 1: always "unknown")
  linkedAt  timestamp
```

- One document per **physical** third-party chip, keyed by its UID (uppercase hex):
  a chip points to **one** spool at a time.
- A spool may have **several** linked chips (a Bambu Lab spool has one per flange).
- Per account: the same chip can be linked on two accounts independently.
- Linked chips earn **no XP** and no TigerCoins envelope.

## Which spool doc is the target

The user picks a **spool**, never a chip. A TigerTag / TigerTag+ twin is shown as one
spool; the app picks the doc:

| Spool | Target |
|---|---|
| TigerData / TigerData+ | its only doc |
| TigerTag / TigerTag+ single | its chip's doc |
| TigerTag / TigerTag+ twin, both chips known | the chip with `tag_index` 1; indexes unknown (0, older chips) → the **smaller UID** |
| Twin with only one chip scanned so far | that chip |

The target is **never moved** afterwards: the twin link already mirrors everything
(Studio opens the pair, `setSpoolWeightByRfid` mirrors the weight through
`twin_tag_uid`), so either half works. One exception: when the target doc is deleted,
the alias moves to its twin if it has one, otherwise it is removed (done lazily when
the chip is next resolved).

## Studio flow (phase 1)

1. A card is placed and is not a TigerTag (no readable user pages: `main.js` "no
   dump") → `rfid-foreign-chip { readerName, uid, chip }`.
2. Scans within 1.5 s are buffered (the TigerPOD's two readers see both flanges'
   chips at once).
3. Any of them already linked → the spool opens, like a TigerTag scan.
4. None linked → the **new-chip side card** (`#chipChoicePanel`: a rail of choices, the chosen view in the pane beside it), minimal on purpose (no UID, no chip type); "Add from the catalogue" is opened straight away (most materials are in it):
   "What would you like to do?", three choices:
   - **Add from the catalogue** → the catalogue pick side card (brand + the catalogue
     search: words, SKU, barcode); a tap opens the product's catalogue card, whose "+ Inventory" creates a TigerData+.
   - **Add manually** → the usual "Add product" panel; saving creates a TigerData.
   - In both cases the chips wait 15 min (`linkPendingTo`) and are linked to the
     spool when it is saved; no burn is offered then. Any other creation clears them
     (`clearPendingLink`).
   - **Link to my inventory** → a grid of the spools that have no linked chip yet
     (twin pairs shown once, search on brand, material, colour and tags, plus a brand, a material and a tag filter — each lists what these spools carry, with its count; the tag filter is always there), drawn as the
     inventory grid's cards. A tap opens the material as in the inventory; its spool
     card then shows a held banner (1.5 s), "Link the proprietary third-party Tag" /
     "Link the N proprietary third-party Tags", which links every chip of the scan to it.
     Nothing is written into the chips.

   After a link (or a burn) succeeds, every side card closes and the material opens alone.

   While the new-chip card is up, a scan opens nothing and adds nothing (no spool
   opened, created or updated, no new-chip card reopened on another view): placing
   or removing a chip only updates the card itself (card-present events).

   The same side card opens for a **blank NTAG** (TigerTag Init or an erased / empty-NDEF
   chip, `_chipIsWritableBlank`) with the same three choices: a created spool is
   offered for burning onto that chip, and "Link to my inventory" lists the TigerData /
   TigerData+ spools, whose card then offers the burn. The search bar's "+" opens it
   too, with the same three choices: linking a TigerData / TigerData+ there means
   burning it onto a blank NTAG (TigerTag Init or empty NDEF), which turns it into a
   TigerTag / TigerTag+, so the Link choice stays greyed until a chip sits on the
   TigerPOD (`refreshChipChoice`). For a blank NTAG and from the "+" (not for a
   maker's chip) a fourth choice, **NFC tools**, shows `rfid_protocol/eraser` in
   the pane: while it is up a scan opens nothing; it shows the readers and offers
   "Format your RFID chip" (→ TigerTag Init, a red chip banner held 1.5 s like the
   burn, on any NTAG — even one already in that state) and "Write in NDEF", which
   unfolds a form (link, Wi‑Fi, contact, e‑mail, phone, SMS, encoded by
   `services/ndef.js`, or "Reset NDEF" — back to a blank NDEF tag) ending in a held
   "Write to the chip" (red "Recycle to NDEF" for the reset).
   With no chip a press shows the red TigerPOD bubble. A chip whose `id_tigertag`
   is not a TigerTag version (such an NDEF tag) is never taken for a spool.
5. The spool's detail panel lists its **linked chips** (its own and its twin's), each
   with ONE held "Unlink" (1.2 s) that removes every chip of the material together — never one chip on its own.

## Phase 2 — resolving a linked chip outside Studio

Every client follows the same rule: a UID that names no inventory doc is looked up in
`rfidAliases/{UID}`, and its `spoolId` is used from then on as if the spool's own chip
had been read (metadata, container, twin, weight).

- **TigerScale V3 firmware** (shipped in v3.11.0, `resolveLinkedChipUid()`): only a
  4-byte UID triggers the lookup; a 7-byte TigerTag UID never does. It reads
  `rfidAliases/{UID}` (field mask `spoolId`, 4 s timeout) where the UID leaves the
  reader, so both flange chips of a Bambu Lab spool resolve to the same id and count
  as one spool, never as a twin pair. A link is cached in RAM for 10 min, a miss or
  a network error for 60 s, so a link made in Studio is picked up within a minute.
  A linked spool's brand, material and colour are read fresh from its inventory doc,
  never from the chip, which has no TigerTag pages. A `spoolId` outside
  `[A-Za-z0-9_-]` is refused. Verified on a V3 with two Bambu Lab chips.
- **`setSpoolWeightByRfid`** (backend, deployed): when no inventory doc has the
  given id, it follows `rfidAliases/{ID.toUpperCase()}` and updates that spool (and
  its twin). The response adds `spool_id` (the doc actually updated) and
  `linked_chip` (the chip UID it was reached through, or `null`); `deviceLogs`
  records `linkedChip`.
- **Still to do:** the mobile app (TigerTag Connect) and the Tiger Touch firmware.
- **Known limits:** the PN532 reads a chip only in front of an antenna, so a spool
  sometimes has to be turned; the first lookup of an unknown 4-byte UID can block
  the scale's loop for up to 4 s. NTAG third-party chips (Anycubic ACE, ELEGOO
  Canvas, OpenSpool) are not linkable yet.

## Later phases

- **Phase 3 — optional, founder's call:** read the maker's chip content (Bambu Lab's
  format is documented publicly by the community) to prefill material, colour and
  weight and offer the matching catalogue product.
