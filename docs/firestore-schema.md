# Firestore data structure (TigerTag)

> Extracted from `CLAUDE.md` to keep the always-loaded instructions lean. Read this on demand when touching Firestore reads/writes or the data model. Security rules live in the **backend repo** (`TigerTag_Firebase_Backend/firestore.rules`) — see CLAUDE.md → *Firestore Security Rules*.

```
publicKeys/
  {key}/                    — key = public code e.g. "4X7-K3M" (XXX-XXX format)
    uid         string      — owner uid
    claimedAt   timestamp   — when claimed

userProfiles/
  {uid}/                    — public profile, readable by all authenticated users
    publicKey   string      — same as publicKeys entry (denormalised for display)
    displayName string      — user's chosen pseudo
    isPublic    boolean     — whether inventory is publicly visible
    (color fields for avatar)

users/
  {uid}/
    displayName   string   — user's chosen pseudo
    googleName    string   — real name from Google Auth (admin reference only, never displayed)
    firstName     string   — first word of googleName
    lastName      string   — remainder of googleName
    email         string
    roles         string   — "admin" | undefined
    Debug         boolean  — debug mode enabled
    supporter     map?     — SERVER-ONLY (payment webhooks, functions/supportWebhooks.js): { since, lastAt, sources: ["kofi"…], monthly, count } — set once a Ko-fi (…) payment is tied to the account; drives the Supporter badge, never a feature. Refused from any client like `roles` / `tier`
    publicKey     string   — discovery code XXX-XXX (also in publicKeys/{key})
    privateKey    string   — 40-char hex access token (used by Firestore rules)
    apiKey6       string?  — 6-char public API key, display mirror of apiKeys/{docId}.keyId (used by the public weight/export HTTP endpoints)
    isPublic      boolean  — inventory publicly visible
    studioVersion   string    — last known app version (e.g. "1.8.0"), overwritten each session
    studioElectron  string    — Electron runtime version (e.g. "33.2.1")
    studioPlatform  string    — OS platform: "darwin" | "win32" | "linux"
    studioArch      string    — CPU arch: "arm64" | "x64"
    studioOsRelease string    — kernel version (e.g. "23.5.0" = macOS Sonoma)
    studioOsVersion string    — human-readable OS (e.g. "macOS 15.4", "Windows 11 Pro")
    studioLang      string    — app language setting (e.g. "fr")
    studioLocale    string    — system locale (e.g. "fr-FR")
    studioCountry   string    — country code derived from the locale region (e.g. "FR"); null when the locale has no region. Offline-derived, no IP geolocation
    studioTimezone  string    — IANA timezone (e.g. "Europe/Paris"), from Intl.DateTimeFormat
    studioLastSeen  timestamp — server timestamp of last login (deployment targeting / churn)

    ── Studio's OWN settings ─────────────────────────────────────────────────
    They live here, on the user doc, and NOT in `prefs/app`: that document is the
    CROSS-APP one, shared with the mobile app, which has none of these screens.
    They also ride along with the `users/{uid}` read the app already does at boot
    instead of costing a second fetch. Each is cached in localStorage as well, so
    a cold start with no network paints the right thing immediately.
    studioTheme            string  — "light" | "dark"
    studioRackDepthOffset  map     — { zy, zx } in px: how far apart Storage draws the rows BEHIND
                                     (zy 12-52 vertical, zx -30..30 sideways, negative leans left).
                                     Follows the account, since it describes how you want to READ
                                     your racks, not the screen you happen to be on.
    vatCountry             string? — ISO country code, drives the VAT rate + currency
    priceInputMode         string  — "HT" | "TTC": how the user types prices (the stored value stays HT)

    telemetry/
      studio/                 — Studio Manager metrics. The field set MUST match the
                              telemetry `hasOnly()` whitelist in firestore.rules
                              (add a field there + redeploy before the client writes it).
        ── Lifetime accumulators ──
        sessionsCount  number   — total sessions (FieldValue.increment)
        versionsUsed   string[] — all app versions ever used (arrayUnion)
        platformsUsed  string[] — all platforms ever used (arrayUnion)
        td1sUsed       boolean  — true once a TD1s sensor was connected (rules: only `true` accepted)
        hasPod         boolean  — TigerPOD ownership (Pod-owner census). Set true
                                  either by the user ("I own a TigerPOD" toggle) OR
                                  AUTO on the first successful RFID read. Not
                                  derivable — a declaration can precede any scan.
        rfidReadersMax number   — Pod reader count: max readers during a SUCCESSFUL
                                  RFID read (rules: 1 or 2), kept at lifetime max.
        rfidChipsTotal number   — lifetime unique physical chips recorded (increment; see rfidList/ below)
        cloudAddedTotal, tagAddedTotal, plusAddedTotal,
        cloudToTagTotal, cloudToPlusTotal, tagToPlusTotal  number — spool-lifecycle counters (increment)
        ── Current state (overwritten each session) ──
        lang string ; country string ; hasAvatar boolean
        accountsCount, friendsCount, spoolsCount, racksCount,
        rackSlotsTotal, scalesCount, printerCount  number
        lastSeen       timestamp — server timestamp of last session
        ── Onboarding funnel (timestamps stamped once) ──
        firstSeen, firstSpoolAt, firstRackAt, firstPrinterAt,
        firstFriendAt, firstRfidReaderAt, firstScaleAt  timestamp
        ── Community-link clicks (stamped once) ──
        discordClickedAt, githubClickedAt, makerworldClickedAt  timestamp
        ── Legacy (no longer written, still whitelisted for merge-write safety) ──
        langsUsed string[] ; countriesUsed string[]

    inventory/
      {spoolId}/            — one document per spool
        uid                 string   — RFID tag UID
        id_brand            number
        id_material         number
        color_name          string
        online_color_list   string[] — hex colors
        weight_available    number   — grams net
        container_weight    number   — grams
        container_id        string   — references data/container_spool/spools_filament.json
        capacity            number   — total spool capacity in grams
        updatedAt           timestamp — server timestamp of last write (current field; all writes use FieldValue.serverTimestamp())
        last_update         number?  — LEGACY ms timestamp (normalizeRow still falls back to it; `updated_at` is another legacy variant)
        deleted             boolean
        deleted_at          number?
        twin_tag_uid        string?  — linked twin chip's UID (the OTHER RFID chip on the same physical spool). NOTE: the field is `twin_tag_uid`, not `twin_uid`
        tag_index           number   — which chip of the object this is, from 1 (chip byte +39 high nibble, protocol v2.2). 0 = unknown (chip written before v2.2, or chipless doc). Written on scan (from the chip) and on a guided burn.
        tag_count           number   — how many chips the object carries (byte +39 low nibble): 1 = single, 2 = twin. 0 = unknown. A `tag_count` of 2 with no `twin_tag_uid` = the other chip has not been scanned yet.
        message             string?  — user note (also the colour name for DIY/Cloud)
        tags                string[]? — user-defined free-form labels (Shopify-style). Studio metadata only, never written to the physical chip. Normalised (trimmed, ≤32 chars, case-insensitive dedup, ≤20/spool). Mirrored onto the twin spool so both chips of one physical spool share the same tags. Owner-write, no rule change needed (inventory has no field whitelist). Cross-app field — mobile ignores it until it implements tags
        rfidListed          boolean? — true once this UID has been recorded in rfidList/ (dedup marker; absent = not yet). Set by Studio's chip census / scan path. See rfidList/ below
        rfidBackup          boolean? — true once a TigerTag+ signature backup has been stored in rfidList/{UID}.backup. Stays false for maker (standard) tags and for tag+ not yet physically read

    rfidList/
      {UID_HEX}/             — one document per PHYSICAL RFID chip the user has
                              used, keyed by its hex UID (CLOUD_* spools are
                              excluded). Auto-dedup: re-using a chip maps to the
                              same doc. Lets the user count unique chips they've
                              made and back up the repairable TigerTag+ signature.
                              Owner-only.
        firstSeenAt timestamp — stamped once, on first sighting; never overwritten
        lastSeenAt  timestamp — last write to the entry (creation / backup)
        seenCount   number     — physical-scan counter (census seeds 1)
        backup      string?    — TAG+ ONLY: full chip payload, hex of pages
                                0x04-0x27, signature included. Captured the first
                                time the tag+ is physically read (the census has
                                no raw pages). Write-once. Its PRESENCE is the
                                TigerTag+ indicator — no separate type field is
                                stored. Safe to store: the signature is over
                                UID + product id, so a clone is detectable
                                (invalid signature) — the backup opens no new risk

    products/
      {keyHash}/             — one doc per PRODUCT IDENTITY (keyHash = hash of the
                              product signature, NOT a spoolId), so the info applies
                              to every identical spool and survives a spool's deletion.
                              READ: owner / public inventory / accepted friend (SAME
                              policy as inventory & racks) — a friend reads this
                              directly (no duplicated collection), always ISO with
                              the owner. WRITE: owner. NOTE: the `note` field is
                              included here and is therefore technically readable by a
                              friend (assumed product choice to avoid duplication; the
                              app never surfaces it on a friend's side). Fields: key,
                              label{brand,series,material,colorName,colorHex,aspect,imgUrl},
                              cloudSeed, buyUrl, buyPriceHt (PRE-TAX; TTC derived at
                              display), minStockSpools, onOrder/orderQty, note, tags[],
                              liked, favorite, sku, ean, importedFrom{uid,name}, updatedAt.
                              (`cloudSeed` = sanitised material data — colours, temps,
                              id_material, diameter, sku/ean, product id — lets a
                              friend's read-only product card render full material info
                              without a live spool.)

    productShares/            — DEPRECATED (superseded by the direct friend read of
      {keyHash}/               products/ above). No longer written by the app; legacy
                              docs may linger until a cleanup. Was a friend-readable
                              projection of the shareable slice.

    apiKeys/
      {docId}/               — public-API access keys (owner-only)
        keyId       string    — 6-char public key (mirrored to users/{uid}.apiKey6)
        active      boolean
        hash        string    — sha256(key + salt)
        salt        string
        scopes      string[]  — e.g. ["update_weight"]
        createdAt   timestamp
        lastUsedAt  timestamp

    printers/
      {brand}/                — brand = bambulab | creality | elegoo | flashforge | snapmaker | anycubic.
                              The brand doc itself is a FIELDLESS parent (only holds
                              the subcollections below) — invisible to a collection
                              query; enumerate brands from the known list, not a get().
        devices/
          {deviceId}/         — one document per printer
            id, brand, printerName  string
            ip               string?   — LAN address (absent for cloud-mode printers)
            mode             string?   — "cloud" for cloud-only printers (LAN otherwise)
            printerModelId   string    — catalog model id (per-brand)
            isActive         boolean
            sortIndex, camSortIndex  number — user ordering (grid + cam wall)
            camSize          string?   — "1x" | "2x" cam-wall tile size
            units            map?      — the machine's filament storage, keyed by unit
              {unitId}/        id: one entry per physical unit (an AMS / CFS / ACE box, a
                               holder pair, the external arm). A MAP, so Firestore can
                               update one unit's keys without rewriting its neighbours
                               (`units.ams_0.planRacks`) — an array could not. The key is
                               derived from the machine's own identity for the unit, so
                               the same box is recognised on reconnect and can never be
                               seeded twice.
                kind      string   — ams | amsHt | cfs | ace | holder | ext
                index     number   — the n-th unit of that kind on this machine
                label     string   — user-renamable; seeded empty
                rows,cols number   — the unit's shape (2 x 1 for a stacked pair)
                hwId      string?  — the machine's own id for the unit, when it has one
                present   boolean  — the ACCESSORY is plugged in. NOT "the machine is
                                     online": an absent unit is never deleted, because
                                     unplugging an Elegoo Canvas hub must not discard
                                     what was assigned in it.
                planPrinters map? — { x, y, z } on the Printers board
                planRacks    map? — { x, y, z } on the Storage board
                planPrintersCluster string? — the cluster this unit's widget belongs to
                                     on the Printers board (see `planCluster` below)
                slots     array    — [{ index, label, hw, uids, seenAt, color, material,
                                     subType, vendor, … }]. `hw` is strictly what
                                     addresses the slot on the wire (Bambu amsId/trayId,
                                     Creality boxId/slotId…). `uids` is what the USER
                                     assigned — two entries for a twin spool, one
                                     physical spool with two chips. The remaining fields
                                     are what the MACHINE last reported, stamped with
                                     `seenAt` so a reader can tell whether it is ten
                                     seconds or three weeks old. Brand specifics are
                                     named fields (`bambuTrayInfoIdx`, `crealityRfid`),
                                     never a blob.
                                     Vocabulary + rationale: docs/printer-storage-terms.md
            plan             map?      — where the machine's CARD sits on the printer
                                          board: { x, y, z } in board pixels.
            unitsPlan        map?      — where its units sit on that board WHEN GROUPED:
                                          { x, y, z }. Kept even while split, so grouping
                                          again finds the group where it was left.
            planCluster      string?   — the cluster this machine's CARD belongs to on the
                                          printer board: several objects the user bound
                                          together, so selecting any one selects the whole
                                          set and dragging one moves them all. The binding
                                          lives on the MEMBERS, beside the coordinates it
                                          binds, never in a collection of its own — so
                                          deleting a machine takes its membership with it
                                          and a cluster can never point at a card that no
                                          longer exists. Absent = not bound to anything;
                                          a cluster left with a single member is no
                                          cluster. Deliberately not called a group: that
                                          word is already the inventory's spool grouping,
                                          the user's Lists, and `unitsPlan` below.
            unitsPlanCluster string?   — same, for its units widget when they are grouped.
            widgets          map?      — which of the machine's widgets are on the
                                          board: { units, temp } → boolean. ABSENT
                                          MEANS SHOWN, so a machine nobody has touched
                                          puts everything up and only a deliberate
                                          choice is ever written. The switches live on
                                          the machine's ⋮ — a hidden widget has no menu
                                          of its own left to bring it back with.
            tempPlan         map?      — where its TEMPERATURE widget sits on that
                                          board: { x, y, z }. Not storage — the board
                                          addresses every kind through one
                                          `data-board-id`, so a further widget needs no
                                          new machinery, only a case.
            unitsSplit       boolean?  — the user chose to place each unit separately.
                                          Absent/false = grouped, which is the default
                                          because that is how most benches look. The two
                                          arrangements are stored apart (this position for
                                          the group, `units.{id}.planPrinters` for each
                                          unit), so flipping between them never discards
                                          the other.
            tags             string[]? — user-defined free-form labels (Shopify-style), same editor as spool tags but a separate namespace (printer tags never mix with spool tags). Studio metadata only. Owner-write, no rule change needed (printers subtree has no field whitelist). Cross-app field — mobile ignores it until it implements printer tags
            updatedAt        timestamp
            discovery        map?       — last mDNS/HTTP discovery snapshot (raw + derived)
            …                           — other per-brand fields (deviceId, model topic id, etc.)
        secrets/              — OWNER-ONLY, never friend/public (credentials)
          cloud_session/      — account cloud token (shared across devices)
          {deviceId}/         — LAN dev_access_code + future per-device secrets

    notifications/
      {notifId}/              — notification centre. Owner reads / marks-read / deletes;
                              a FRIEND may CREATE one (field-whitelisted in rules).
        type        string    — whitelisted; 1st value: "friend_accepted"
        fromUid     string    — sender uid (anti-spoof: must equal auth.uid)
        fromName    string
        photoURL    string?
        createdAt   timestamp
        read        boolean

    racks/                    — storage shelves. Read: owner / public / accepted friend (like inventory). Write: owner.
      {rackId}/
        name        string
        level       number    — row count (1-15)
        position    number    — column count (1-20)
        createdAt   timestamp
        lastUpdate  timestamp
        printer     map?      — set ONLY on a rack that IS a machine's feed bays
                                (AMS / CFS / ACE / tool-changer): { brand, id, unit }.
                                `id` is the printer device id; `unit` numbers the
                                units of one machine (0, 1, …) so two AMS on the same
                                printer are two racks, each placeable where its box
                                really stands. Its presence is what marks the rack as
                                derived: no separate flag, and the document id is
                                derived from the binding (`printer_{brand}_{id}_u{unit}`)
                                so it can never be created twice. Such a rack is not
                                resizable (its shape is the hardware's) and is deleted
                                with its printer.
        …                     — slot locks / sortIndex as used by the storage view
      (a spool references its slot via inventory.{spoolId}.rack = { id, level, position })

    scales/                   — TigerScale heartbeats. Owner-only — the ESP32 scale
      {mac}/                  authenticates AS the owner and writes its own heartbeat.
        ip          string?   — last known LAN address
        …                     — heartbeat fields written by the ESP32 (last-seen, etc.)

    uidMigrationMap/          — decimal→hex UID migration table (legacy mobile wrote
      {decimalUid}/           decimal spool ids; Studio migrates to hex uppercase).
        …                     — maps the legacy decimal UID → its hex equivalent.
                              Read: owner + accepted friend (resolve an old decimal UID).
                              Write: owner only.

    friends/
      {friendUid}/
        displayName string
        addedAt     timestamp
        key         string   — friend's privateKey at time of accept (used to verify access)

    friendRequests/
      {requesterUid}/
        displayName string
        requestedAt timestamp
        key         string   — requester's privateKey (used for bidirectional accept)

    blacklist/
      {blockedUid}/
        displayName string
        blockedAt   timestamp

    prefs/
      app/
        lang      string   — language code, synced across devices
        groupInv  boolean  — Studio inventory "group identical spools" toggle (Studio-only, synced across devices)
        autoManage    boolean — Storage "Auto-organize" toggle (drives both auto-place + auto-free; per-account, synced across devices; localStorage `tigertag.autoManage.enabled` is the fast read cache). Migrated from the legacy split fields below (unified = either-was-on).
        autoStorage   boolean — LEGACY (pre-merge) "Auto storage" toggle — read only for one-time migration into `autoManage`
        autoUnstorage boolean — LEGACY (pre-merge) "Auto unstorage" toggle — read only for one-time migration into `autoManage`

    stats/
      current/              — SERVER-WRITTEN rollup (client: read-only). Current state, recomputed by the reconciler.
        <all dataHistory fields below, minus `at`/`trigger`>
        dirty         boolean   — set by the Firestore triggers, consumed by the 15-min reconciler
        dirtyAt       timestamp
        dirtyTrigger  string
        lastHistoryId string    — anchor of the 15-min history window (see below)
        lastHistoryAt timestamp
        lastPrunedAt  timestamp — lazy per-account downsampling, at most weekly
        updatedAt     timestamp

    dataHistory/
      {autoId}/             — SERVER-WRITTEN time-series point (client: read-only). Full snapshot, throttled to ≤1 point / 15 min.
        at              timestamp
        trigger         string   — spool_add | spool_remove | weight | price | printer | list
        valueHt         number   — stock value, ALWAYS tax-free (Σ price × remaining-weight fraction)
        currency        string   — resolved from vatCountry
        vatCountry      string   — raw ISO code (ground truth; currency is re-derivable from it)
        country         string   — REAL country, derived from locale/timezone (studioCountry) — distinct from vatCountry (the TAX selection)
        lang            string   — the app language the user picked (studioLang)
        taxMode         string   — "HT" | "TTC" — how the user displays prices (default TTC)
        scales          number   — TigerScale devices owned
        hasPod          boolean  — owns a TigerPOD (explicit declaration)
        podReaders      number   — Pod reader count at best reading: 0 (never measured) | 1 | 2
        materialsPriced  number  — materials that HAVE a price → covered by valueHt
        materialsUnpriced number — materials with NO price → the gap in valueHt (never let the value lie)
        chips           number   — active NFC chips (a twin pair = 2 chips)
        materials       number   — physical material items, twins merged ("spools/bobines" today; resin/accessories/… later)
        materialsSingleChip number — materials carrying 1 chip
        materialsTwinChip  number  — materials carrying 2 linked chips (chips = single + 2×twin)
        productsDistinct number  — distinct product identities among those materials
        weightG         number   — remaining filament, grams
        byBrandId       map      — { "<id_brand>": count } — RAW ids, names resolved by the dashboards
        byMaterialId    map      — { "<id_material>": count } — RAW ids, names resolved by the dashboards
        byTypeId        map      — { "<id_type>": count } — Filament / Resin / … (RAW ids)
        byProtocol      map      — { TigerTag: n, "TigerTag+": n, TigerCloud: n, unknown: n } — from the mirrored `protocol`
                                   + "TigerData+" since v2.16.0 — FIVE keys in all.
                                   ⚠️ SERIES BREAK: before v2.16.0 "TigerCloud" held ALL chipless
                                   spools; it now holds the PLAIN TigerData only, so it drops at the
                                   first recompute. Pre-2.16.0 definition = TigerCloud + "TigerData+".
        cloudCount      number   — ALL chipless spools, TigerData+ INCLUDED — unchanged, no break;
                                   prefer it for any long series
        cloudPlusCount  number   — of which TigerData+ (plain TigerData = cloudCount - cloudPlusCount)
        printers        number
        printersByBrand map      — { bambulab: n, creality: n, … }
        favorites       number   — ★ products
        cartItems       number   — ❤ products in the active cart (savedForLater excluded)
        cartUnits       number   — Σ orderQty
        lists           number   — wishlists
```

## Stats & history — how the numbers are produced

**Server-side only.** A business figure (stock value, admin totals) can't be written by the client: it may be offline for weeks (gaps in the curve), run an old build, or simply lie — the backend is publicly connectable. So `stats/` and `dataHistory/` are **read-only for the client** (`allow write: if false`); Cloud Functions write them via the Admin SDK, which bypasses rules.

**Flag + reconciler — no account scanning.** Writes to `inventory` / `products` / `printers` / `lists` fire a trigger that only sets `stats/current.dirty = true` (one write, zero reads — so a print job pushing a spool's weight down costs almost nothing). A scheduled function then queries `collectionGroup("stats").where("dirty","==",true)` every 15 min: it reads **only the accounts that moved**. Dormant accounts are never read or billed. It clears the flag *before* recomputing, so a write landing mid-recompute re-marks the account and is picked up next cycle — at worst one extra recompute, never a lost update.

**Full recompute, not increments.** An incremental counter that misses a delta drifts *permanently and silently*. Recomputing the whole snapshot is self-healing, and only runs for active accounts, at most once per 15 min.

**Two mirrored fields make the server-side stats possible** (`syncSpoolMirrors` in the Studio client). Both are DERIVED from the TigerTag reference DB, which the backend does not have, so it cannot recompute either from the raw fields:
- **`catalogProduct`** (object, catalogue spools only — Studio v2.35.0) — the FULL catalogue record of the product, kept locally even though the chip only carries what the TigerTag protocol defines. Base = the local catalogue entry (`id_catalog.json` / the synced catalogue: `id`, `title`, `brand`, `material`, `measure`, `img_src`, `color`, `color_info`, `RFID_Data`…), enriched field by field with whatever the `product/get` detail adds (`description`, `links`, `images`, `filament`, `nozzle`, `dryer`, `bed`, `fan`, `metadata` — slicer profiles `bambuID`/`bambuLabel`, `crealityID`/`crealityLabel` —, `brand_logo`, `brand_url`, `created_at`, `updated_at`, `active`…); the entry's own values win on overlap. Written when a spool is created from the catalogue, converted to TigerTag+, or refreshed from the API. Informational: nothing derives identity or tier from it, and its URLs are untrusted (see below).
- **`productKey`** — the product identity hash. It is the join key to `products/{keyHash}`; without it the backend could never find a spool's price and the stock value would come out as 0. Two spools share it when they are the same PRODUCT: a real `id_product` when the spool carries one, otherwise the resolved names (brand / material / colour signature / both aspects / `id_type`).
  > ⚠️ **Since v2.17.0 the tier is NOT part of it.** A `TigerData+` and the `TigerTag+` of the same `id_product` now hash to the SAME `productKey`, so one price, one buy link and one stock threshold cover both — the chip is a property of the spool, not of the product. Same for a plain `TigerTag` and a plain `TigerData` of one filament. Before v2.17.0 a `TigerData+` hashed on its attributes and so landed on a different key from its own `TigerTag+`.
  > **Only `TigerData+` documents change value**; every other tier keeps the hash it already had. They are rewritten lazily — the Studio mirror compares stored vs computed and corrects on mismatch, once, the next time the owner opens the app — so **both values are in the wild during the rollout**, exactly like `protocol`. A reader that must be exact should group by `id_product` itself when one is present; a reader that can tolerate lag can join on `productKey` directly.
- **`protocol`** — `TigerTag` / `TigerTag+` / `TigerCloud`, resolved via `versionName(id_tigertag)`. The raw `id_tigertag` is NOT a usable substitute: only a couple of values map to a known version and the rest are a long tail of unrecognised ids, so counting raw ids server-side yields noise and no TigerTag-vs-TigerTag+ split at all.
  > ⚠️ `TigerCloud` is the **stored value and must never be renamed** — every existing document, the `byProtocol` map and the backend aggregation key off this exact string. Since v2.12.1 the UI displays this tier as **"TigerData"**; that rebrand is display-only and stops at the presentation layer.

### TigerData+ — a DERIVED tier, with nothing of its own stored (v2.15.0)

A spool's tier is **derived** from two things it already carries, then **mirrored onto the doc** so no reader has to re-derive it:

```
isTigerDataPlus = isChipless(spoolId)            // "TigerData_…" or the legacy "CLOUD_…"
                  && id_product ∉ { 0, 0xFFFFFFFF }   // i.e. a REAL catalogue product id
```

Meaning: a fully-digital spool that is nonetheless tied to a real product in the official catalogue, so it knows the exact brand, colour, material, temperatures, diameter, SKU and EAN instead of only what the user typed. It is created by adding a catalogue product from Studio's Search view.

> ### ⚠️ Unexplained: the `MAN_` doc-id prefix
>
> Real inventories contain documents whose id starts **`MAN_`** (e.g. `MAN_19DF7E0ACC9`), carrying
> `manual_entry: true`. **That prefix appears nowhere in any code** — not Studio, not the backend —
> so nothing creates it today and nothing recognises it either. Consequences while it stays
> unmodelled: `_isChiplessId` sees only `TigerData_` / `CLOUD_`, so a `MAN_` doc is treated as
> CHIP-BACKED — it lands in `byProtocol.unknown`, never in `cloudCount`, and the `.ttag` importer
> demands an `id_tigertag` it will never have. The one observed sample was missing 15 of the 20
> required fields (no `id_type`, no `data*`, no `timestamp`), so it is not exportable either.
>
> Origin unknown as of v2.16.0 — possibly a manual entry from the mobile app, possibly a legacy
> import. **Deliberately left alone**: guessing wrong would either hide real spools from the stats or
> mislabel them. Decide what it is before touching `_isChiplessId`.

**`protocol` is the stored answer — four values since v2.16.0.** `normalizeRow` computes `TigerData+` for these spools and `syncSpoolMirrors` writes it onto the doc, so the Hub, the mobile app and any third party can **read the tier directly** instead of re-deriving it:

| `protocol` | Meaning |
|---|---|
| `TigerData` | chipless, no catalogue product |
| `TigerData+` | chipless, real catalogue product |
| `TigerTag` | a written chip |
| `TigerTag+` | a certified chip |

**Three things every client and integrator must still respect:**

- **Old documents lag.** Every doc written before v2.16.0 still says `TigerData`. They migrate themselves — the mirror compares stored vs computed and rewrites on mismatch, once, the next time the owner opens Studio. Until then **both values are in the wild**, so a reader that must be exact should derive rather than trust the field; a reader that can tolerate lag can use it directly.
- **Deriving needs BOTH conditions.** `id_product` alone is not enough: a TigerTag+ carries one too, and it is not chipless.
- **It is NOT a TigerTag+.** No chip, no UID — and no `id_tigertag` at all, so it cannot be resolved as a Plus by `versionName()`. Never render it with the TigerTag+ badge.
**No `id_tigertag` on a chipless spool (v2.16.0).** That field names the chip's version in `id_version.json`, and only four values are legal — `0` RFID Empty, `1542820452` TigerTag, `1816240865` TigerTag Init, `3155151767` TigerTag+. A chipless spool has no chip and therefore no version, so **the field is absent**; it is written for the first time when a real chip is programmed. Until v2.16.0 a random u32 was stored there as a "nonce" (Add Product since v1.4.12, `.ttag` import since v2.14.0, the catalogue path in v2.15.0): it served nothing and put an out-of-referential value on every chipless document, which any reader resolving it against `id_version.json` would choke on. Existing documents clean themselves — the client mirror deletes the stray field on its next pass. **So: never resolve `id_tigertag` without checking the spool has a chip, and never write one onto a chipless doc.**


The two sentinel values matter: `0` means "unset" and `0xFFFFFFFF` (4294967295) is the all-ones erased state. Treat either as "no product".

The backend then does plain lookups: no reference DB server-side, no duplicated logic, no drift when the catalogue changes.

**Retention.** Raw points older than 90 days are downsampled to one point per day (the day's last), pruned lazily per account (at most weekly, only for accounts that are actually writing) — never a global sweep.

**`adminStats/{YYYY-MM-DD}`** (top-level, admin-read-only) — the daily global rollup, summed from the per-account `stats/current` docs (one small doc per account; spools are never re-read). Monetary totals live in `valueHtByCurrency` — different currencies are **never** summed together, that would make the global figure meaningless.

## RFID chip census + TigerTag+ backup — sync contract

Goal: record every **physical** chip a user has used (UID hex, `!CLOUD_*`) under `users/{uid}/rfidList/{UID_HEX}` to count unique chips, dedup re-uses, and back up the repairable TigerTag+ signature. Both Studio and the **mobile app** must follow the same rules so they stay aligned (any client may run either path; the doc id = the chip's hex UID is the single source of dedup). A chip is a TigerTag+ iff its entry has a `backup` — no type field is stored.

Two booleans on the **inventory** doc are the dedup signals — read them from the already-loaded inventory, no `rfidList` read needed in the steady state:

- `rfidListed === true` → this UID already has a `rfidList/{UID}` entry.
- `rfidBackup === true` → its tag+ signature `backup` has been stored.

The markers live on the inventory doc, so they vanish if that doc is deleted; a **delete-then-rescan** therefore re-enters unmarked → always re-verify the `rfidList` entry's existence before creating it, so an existing `firstSeenAt`/`backup` is never overwritten.

**Census** (run once per session, e.g. on the first inventory snapshot): for each physical spool whose inventory doc has no `rfidListed`, create `rfidList/{UID}` with `firstSeenAt`/`lastSeenAt = serverTimestamp` and `seenCount = 1`, and set `{ rfidListed: true, rfidBackup: false }` on the inventory doc. No `backup` here (no raw pages at snapshot time). On the first-ever run the collection is empty so a merge-create can't clobber anything.

**On physical scan** (raw pages 0x04-0x27 in hand):
- `rfidListed && (rfidBackup || maker)` → fully synced → do nothing.
- `rfidListed && tag+ && !rfidBackup` → write `backup` to `rfidList/{UID}` (merge), then set `rfidBackup: true`.
- `!rfidListed` (new or delete-rescan) → `get()` the `rfidList` doc; if absent create it (incl. `backup` when tag+), else only fill a missing `backup` (never touch `firstSeenAt`); then set `{ rfidListed: true, rfidBackup: <tag+ && backup now present> }`.

`firstSeenAt` and `backup` are **write-once**. The lifetime unique-chip counter `telemetry/studio.rfidChipsTotal` is incremented by the number of newly-created entries.

## URL fields are attacker-controlled — validate the scheme in every client

Any URL a user stores in their own document is data an **attacker chose**, and several of those
documents are readable by other people. The fields, and who can read them:

| Field | Lives on | Readable by |
|---|---|---|
| `buyUrl` | `users/{uid}/products/{keyHash}` | owner, accepted friends, anyone if `isPublic` |
| `attachments[].url` | `users/{uid}/products/{keyHash}` | same |
| `LinkMSDS`, `LinkYoutube`, `LinkTuto`, … | `users/{uid}/inventory/{spoolId}` | same |
| `url_img` / custom product image | `users/{uid}/inventory/{spoolId}`, `products` | same |
| `catalogProduct.brand_url`, `.links.*`, `.images.*`, `.brand_logo` | `users/{uid}/inventory/{spoolId}` (and a product's `cloudSeed`) | same |
| `items[].buyUrl` | `publicLists/{token}` | **the entire internet** |

**Rules are not the control here.** A field whitelist decides *which* fields may be written, never
what a string contains — the owner writes these values into their own document with a legitimate
credential, so nothing server-side rejects `javascript:alert(1)`. A client-side sanitiser is not the
control either: it can be bypassed by writing to Firestore directly.

**So every client that renders one of these must validate the scheme itself, at render time.**
Requiring a provable `http(s)` URL and refusing everything else is the whole fix — fail closed, so a
scheme nobody anticipated is refused rather than needing to be listed. Escaping is not enough:
HTML-escaping stops tag injection and leaves `javascript:` in an `href` completely intact.

This bit Tiger Studio in v2.13.1 — two stored-XSS holes reachable from a friend's product links and
attachments (see `docs/reviews/2026-07-19-full-project.md`). Current state per client: Studio uses
`safeHref()` in the renderer and `isSafeExternalUrl()` in the main process; Tiger Hub uses `cleanUrl()`
in `lib/data/*.ts`; the mobile app checks before `launchUrl`. **A new client starts with none of this**
— which is why it is written down here rather than left in three codebases.

---

## Connecting from a third-party app

```js
// 1. Fetch config
const config = await fetch("https://tigertag-cdn.web.app/__/firebase/init.json").then(r => r.json());
firebase.initializeApp(config);

// 2. Sign in (user must have a TigerTag account)
await firebase.auth().signInWithEmailAndPassword(email, password);
// or: firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())

// 3. Read inventory
const uid = firebase.auth().currentUser.uid;
const snap = await firebase.firestore()
  .collection("users").doc(uid)
  .collection("inventory")
  .get();
snap.forEach(doc => console.log(doc.id, doc.data()));

// 4. Update spool weight
await firebase.firestore()
  .collection("users").doc(uid)
  .collection("inventory").doc(spoolId)
  .update({ weight_available: 450, last_update: Date.now() });
```
