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

    telemetry/
      studio/                 — Studio Manager metrics. The field set MUST match the
                              telemetry `hasOnly()` whitelist in firestore.rules
                              (add a field there + redeploy before the client writes it).
        ── Lifetime accumulators ──
        sessionsCount  number   — total sessions (FieldValue.increment)
        versionsUsed   string[] — all app versions ever used (arrayUnion)
        platformsUsed  string[] — all platforms ever used (arrayUnion)
        td1sUsed       boolean  — true once a TD1s sensor was connected (rules: only `true` accepted)
        rfidReadersMax number   — max simultaneous RFID readers ever seen (rules: 1 or 2)
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
```

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
