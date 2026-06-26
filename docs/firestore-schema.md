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
      studio/                 — aggregated lifetime metrics (standard Firebase pattern)
        sessionsCount number  — total sessions (FieldValue.increment)
        versionsUsed  string[]— all app versions ever used (FieldValue.arrayUnion)
        platformsUsed string[]— all platforms ever used (FieldValue.arrayUnion)
        langsUsed     string[]— all app languages ever used (FieldValue.arrayUnion)
        countriesUsed string[]— all country codes ever seen (FieldValue.arrayUnion; only when derivable)
        lastSeen      timestamp — server timestamp of last session
        td1sUsed      boolean — true once a TD1s sensor was ever connected
        rfidReadersMax number — max simultaneous RFID readers ever seen (1 or 2)

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
        last_update         number   — timestamp ms
        deleted             boolean
        deleted_at          number?
        twin_uid            string?  — linked RFID tag UID

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
