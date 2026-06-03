# Audit performance Tiger Studio Manager — v1.8.13

Rapport généré par un agent IA Claude Opus, juin 2026.
**Statut** : findings vérifiés sur le code actuel. Aucune modification effectuée.

---

## 1. Diagnostic en 3 phrases

1. **Chaque snapshot Firestore** (inventory + racks + 5 brand printers) déclenche un **`innerHTML` rebuild complet** de la vue active. Avec des `<img>` en `data:URL` base64 (jamais réutilisés), n'importe quel switch de vue ou changement de status printer redécoode chaque image visible — d'où le flash.
2. **Firestore `enablePersistence()` n'est jamais appelé** — donc chaque cold start refait tous les reads (pas d'IndexedDB, pas d'offline-first). ~130 reads facturés par boot pour un setup typique (100 spools + 10 printers + 10 racks).
3. **Les intégrations live brand** (FlashForge HTTP poll 2s, Bambu pushall 5s, Elegoo MQTT 10s, Snapmaker/Creality WS) **continuent de tourner même quand l'utilisateur n'est pas sur la vue Printer** et déclenchent des cascades de repaint dès qu'un printer reconnecte.

---

## 2. Top 3 quick wins (effort < 1h chacun)

### QW1 — Firestore IndexedDB persistence (30 min)
Ajouter `firebase.firestore().enablePersistence({ synchronizeTabs: true })` au boot avant tout `subscribe*`.
- **Fichier** : `renderer/inventory.js` ~L4022 (avant le premier `subscribe`)
- **Aussi** : pour les instances Firebase nommées (per-account), faire pareil dans `setupNamedAuth`
- **Gain** : reads cold-start ~0 sur docs déjà cachés. Snapshots rejouent depuis IndexedDB instantanément.

### QW2 — Switch image cache `data:URL` → `file://` (1h30)
Le `data:URL` base64 force le re-decode à chaque `<img>` créé. Une `file:///...` (ou `blob:`) permet à Chromium de retenir le bitmap décodé.
- **Fichiers** : `main.js:1713-1736` (retourner file path), `renderer/inventory.js:180, 4856-4869` (utiliser file URL directement)
- **Gain** : plus de flash sur switch view même AVANT le keyed-diff refactor. Stopgap immédiat.

### QW3 — Signature guard sur `subscribeRacks` (1h)
Le listener `subscribeRacks` n'a aucun guard "did anything change?" — chaque echo Firestore (server timestamp confirmation, metadata-only) → full `renderRackView()`.
- **Fichier** : `renderer/inventory.js:7834-7858`
- **Implémentation** : `if (JSON.stringify(sortedRacks) === _lastRacksSig) return;`
- **Gain** : stop les rebuilds après chaque write d'utilisateur.

---

## 3. Top 3 refactors structurants (effort > 4h chacun)

### REF1 — Keyed-diff render pour `renderGrid()` / `renderTable()` (4h)
Pattern : `Map<spoolId, HTMLElement>` pour les cards existantes. Pour chaque row :
- Si card existe → update les champs (`textContent`, `style`, classes) sans toucher au `<img>`
- Si manquante → créer
- Si orphan → supprimer

**Critique** : ne JAMAIS détruire le `<img>` — update `src` seulement quand `r.imgUrl` change réellement (préserve le bitmap décodé).
- **Fichiers** : `renderer/inventory.js:4900-4961`
- **Gain** : clic sur Grid ne flash plus. Edit de poids depuis Firestore update uniquement la card concernée.

### REF2 — Keyed-diff render pour `renderRackView()` (4h)
Cache la rack frame comme element stable. Per slot : compare nouveau fill avec `el.dataset.spoolId`, swap uniquement si changé.
- **Fichier** : `renderer/inventory.js:11882-12390`
- **Gain** : snapshots rack ne flash plus. Masonry layout devient incrémental.

### REF3 — Persister racks + printers + scales en localStorage (2h)
Aujourd'hui SEUL l'inventaire est cache-restored (`tigertag.inv.<uid>`). Étendre le pattern aux 3 autres.
- **Fichiers** : `renderer/inventory.js:3301-3304` (étendre), `7834, 7877` (read cache avant subscribe)
- **Gain** : rack + printer view apparaissent instantanément au cold start.

---

## 4. Inventaire complet des full rebuilds

> Estimations pour un user typique : 100 spools, 10 printers (5 brands), 10 racks × 30 slots, 5 friends.

| Fonction | Fichier:L | Trigger | Fréquence | DOM produits | `<img>` ? | Patch possible ? |
|---|---|---|---|---|---|---|
| `renderGrid(rows)` | `inventory.js:4928` | `renderInventory()` view "grid" | Chaque snapshot inventory + switch view + switch account | ~1200 nodes, 100 `<img>` data:URL | OUI | Keyed diff `spoolId` |
| `renderTable(rows)` | `inventory.js:4900` | Idem mode "table" | Idem | ~1000 nodes, 100 `<img>` | OUI | Idem |
| `renderInventory()` | `inventory.js:4528` | `subscribeInventory.onSnapshot` (L3949), `setViewMode` (L4988), debug toggle (L4062, L4202), friend switch (L13136, L13184, L13204), account switch (L4028), reload btn (L4239) | Per Firestore push + per view click | Cascade vers renderGrid/Table | OUI via enfants | Signature `rows` hash early-out |
| `renderRackView()` | `inventory.js:11882` | `subscribeRacks.onSnapshot` (L7857), `subscribeInventory.onSnapshot` (L3955 si rack panel ouvert), `setViewMode`, filter changes, weight save | Chaque racks snapshot + inventory snapshot + "+ Rack" save | ~600 nodes | NON | Keyed diff per slot |
| `renderPrintersView()` | `inventory.js:8194` | `_patchGridStatus()` fallback, `subscribePrinters.onSnapshot`, `onFullRender` brand callback, `onPrintersViewChange` (Elegoo), `applyPrinterReorder`, view click, camera debounce | Haute: tout retry brand, surtout au boot quand 10 Elegoo se reconnectent | ~170 nodes, 10 `<img>` | OUI | Keyed diff `brand:id` — `_patchGridStatus` existe mais pour badges seuls |
| `_renderPrinterCam(host)` | `inventory.js:8522` | Idem en mode cam | Chaque snapshot printer | 5-10 cards `<img>` MJPEG / `<video>` WebRTC | OUI + streams actifs | Partiel: patches CSS quand set inchangé. Full rebuild kill FFG MJPEG (1-client limit) |
| `renderFriendBanner()` | `inventory.js:13038` | `setConnected`, `renderInventory`, friend open/close, displayName save | Chaque snapshot via renderInventory | ~5-12 nodes | 1 (avatar) | Cheap mais trop appelé |
| `renderStats()` | `inventory.js:4243` | Chaque `renderInventory()` | Per snapshot | 5 tuiles | NON | Cheap. Early-out sur `(active, plus, cloud, kg)` tuple |
| `populateBrandFilter()` | `inventory.js:1866` | Chaque `renderInventory()` | Per snapshot, per keystroke (when full path) | 6 `<select>` `innerHTML` | NON | Cache keyset, rebuild que si nouveau brand |
| FlashForge live | `printers/flashforge/index.js:693` | `ffgNotifyChange` data path | Toutes les 2s tant que sidecard ouvert | `#ffgLive` | Possible (thumb job) | Déjà rAF-coalesced |
| Snapmaker live | `printers/snapmaker/index.js:495` | `notify_status_update` WS frame | 1/s printing, 1/30s idle | Surgical déjà séparé (`snapJobBlock`/`snapCtrlBlock`/etc) | OUI (preview) | Déjà surgical |
| Bambu live | `printers/bambulab/index.js:478` | MQTT report + pushall 5s | Variable | `#bblLive` | OUI (preview) | rAF coalesced, pourrait être per-card |
| Elegoo live | `printers/elegoo/index.js:195` | MQTT message (refresh 10s, ping 10s) | Idle: 6/min | Sub-blocks séparés | OUI | **BUG** : status change appelle `ctx.onPrintersViewChange()` (L178) → full rebuild printer grid |
| Spool detail panel | `inventory.js:5775` | `openDetail()` + chaque inventory snapshot tant qu'ouvert | Per snapshot panel-open | ~50 nodes weight slider | OUI (thumb + color) | Diff weight/color séparément |

---

## 5. Inventaire des subscriptions Firestore

| Listener | Doc/Collection | `enablePersistence` ? | Render path | Surgical alt ? |
|---|---|---|---|---|
| `subscribeInventory(uid)` | `users/{uid}/inventory` | **NON** — jamais appelé | renderStats + renderInventory + (si panel ouvert) renderRacksList/renderPrintersView + openDetail si open + preCacheImages | Short-circuit metadata-only existe (L3901). Full rebuild via renderInventory. Aussi déclenche `purgeLegacyTombstones`, `autoAssignMissingContainers`, `autoLinkTwinsByTimestamp`, `maybeAutoUnstoreDepletedSpools`, `maybeAutoStoreUnrankedSpools`, `maybeMigrateDecimalSpoolIds`, `maybeMigrateFlatRackToNested` — qui à leur tour émettent des writes Firestore qui rebondissent en snapshots |
| `subscribeRacks(uid)` | `users/{uid}/racks` | NON | `renderRacksList()` = full renderRackView | **Aucun guard.** Rebuild même si byte-identical à la snapshot précédente. À fixer en P0 |
| `subscribePrinters(uid)` × 5 brands | `users/{uid}/printers/{brand}/devices` × 5 sub-coll | NON | Per-brand cache puis flatten/sort puis `_patchCamWall()` (cam) ou `renderPrintersView()` (grid/table). `refreshOpenPrinterDetail()` si panel ouvert | Per-brand cache OK, flatten/sort OK, **mais full rebuild grid quand ANY field change** (updatedAt, camSize, sortIndex echoes). Devrait utiliser `_patchGridStatus`/`_patchGridJobs` pour data-only, full rebuild seulement quand set ou order change |
| `subscribeFriendRequests(uid)` | `users/{uid}/friendRequests` | NON | renderFriendRequestBadge + `_showNextRequest` | Cheap |
| `subscribeScales(uid)` | `users/{uid}/scales` | NON | `renderScalesPanel()` | Module externe |
| Friend inventory one-shot | `users/{friendUid}/inventory` | NON | renderInventory puis pas de live updates | OK — explicit one-shot |

**Coût cold-start estimé sans persistence** :
- inventory: 100 reads
- racks: 10 reads
- printers: 5 × ~2 = 10 reads
- scales: ~3 reads
- friendRequests: ~5 reads
- user doc + prefs: 2 reads
- **Total : ~130 reads par boot**

Free tier Firebase : 50k reads/jour → ~400 boots/jour budget. Survivable solo mais multiplié par friends views ça grossit. **Avec persistence : reads ne se font QUE sur les deltas.**

---

## 6. Inventaire des polling / setInterval

| Source | Interval | Stop quand vue cachée ? | Trigger render ? |
|---|---|---|---|
| `snapPingAllPrinters` | 30s (`snapmaker/index.js:97`) | **NON** global setInterval | Surgical `snapRefreshOnlineUI` |
| `ffgPingAllPrinters` | 30s (`flashforge/index.js:153`) | **NON** | Surgical `ffgRefreshOnlineUI` |
| `crePingAllPrinters` | 30s (`creality/index.js:88`) | **NON** | Surgical `creRefreshOnlineUI` |
| **FlashForge per-printer poll** | **2s** (`flashforge/index.js:252, 281`) | **NON — gros problème** | `ffgConnect` appelé par `renderPrintersView` (L8260) et `_renderPrinterCam` (L8526) pour CHAQUE printer FFG, jamais stopped sauf si `closePrinterDetail` → un printer FFG ajouté = poll 2s pour la session entière même hors printer view |
| Bambu pushall refresh | 5s (`bambulab/index.js:218-225`) | NON | rAF coalesced |
| Bambu MQTT push frames | Variable (1-3/s printing) | NON | rAF coalesced |
| Elegoo print_status refresh | 10s per printer (`elegoo/index.js:256`) | NON | `elgNotifyChange` status → **full `renderPrintersView()`** (BUG, voir L178) |
| Elegoo PING/PONG | 10s per printer (`elegoo/index.js:344`) | NON | Pousse log row, no grid impact |
| Snapmaker WS frames | Printer-driven 1/s printing, 1/30s idle | NON | rAF coalesced |
| Creality WS heartbeat | Printer-driven 1/s | NON | rAF coalesced, heartbeat "ok" early-return L241 |
| Masonry resize | Debounced 60ms (`inventory.js:11726`) | N/A | repositionne enfants absolus, no rebuild |
| `_camStatusDebounce` | 500ms (`inventory.js:9475`) | N/A | Full `renderPrintersView()` cam wall |

**Le plus problématique** : FlashForge 2s poll qui tourne en permanence. Avec 3 imprimantes FFG configurées (même hors ligne), c'est 1 requête HTTP toutes les 2s × 3 printers = 1.5 req/s en background pour rien.

---

## 7. Cache image — état des lieux

### État actuel
- `state.imgCache = Map<url, dataUrl>` en RAM renderer (`inventory.js:180`)
- Disk cache : `app.getPath('userData')/img_cache/{md5}.{ext}` écrit par main process (`main.js:1713-1736`)
- Renderer appelle `window.electronAPI.imgGet(url)` → main fetch + écrit le buffer sur disque, **retourne un `data:URL` base64**
- Renderer stocke le `data:URL` dans `state.imgCache` et render `<img src="data:image/jpeg;base64,...">`
- `preCacheImages()` appelé à chaque snapshot inventory avant le render

### Problèmes
1. **`data:URL` force un full decode à chaque insertion `<img>`**. Chromium peut retenir un bitmap décodé pour un `<img>` stable, mais `innerHTML = ...` détruit l'ancien et crée un nouveau → décodeur retourne. **C'est ÇA la source du flash sur switch Grid.**
2. **`state.imgCache` est RAM only**. Perdu au reload. Re-rempli au snapshot suivant en lisant le disque (OK) — mais les `data:URL` du renderer ne survivent pas le reload.
3. **Cache disque jamais purgé**. Grossit sans limite.
4. **Pas de max age / invalidation**. Une image upstream qui change n'est jamais re-fetched.

### Recommandations
| Effort | Approche |
|---|---|
| **Easy (1h30)** | Main retourne `file:///.../img_cache/{md5}.jpg` ; renderer utilise `<img src="file:///...">`. Chromium cache le bitmap décodé par URL stable. |
| Medium (2h) | Persister `state.imgCache` (url → file path) en localStorage. Au boot, restaurer la map immédiatement avant le 1er render. |
| Plus large (4h) | Servir `image_cache` via `protocol.registerFileProtocol('tigerimg://')` — HTTP-cache semantics + smaller URLs |

**Fichiers à modifier** : `main.js:1713-1736` (return file URL ou expose via protocol), `renderer/inventory.js:180, 4856-4869` (utiliser file URL directement, drop data URL conversion), `preload.js` (no change needed).

---

## 8. Roadmap priorisée complète

Format : `[Priority] [Effort] Titre — Description — Fichiers — Gain`

### P0 — Quick wins user-visible (~3h30 total)
- **[P0] [30 min] Enable Firestore IndexedDB persistence** — `firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {})` avant tout `onSnapshot`. Aussi sur instances nommées. — `renderer/inventory.js` ~L100 + `setupNamedAuth` ~L4050 — **Gain** : cold-start reads ~130 → ~0
- **[P0] [4h] Keyed-diff `renderGrid()` / `renderTable()`** — `Map<spoolId, HTMLElement>`, mutate fields, never destroy `<img>` — `renderer/inventory.js:4900-4961` — **Gain** : plus de flash au clic Grid, Firestore weight-edit update une seule card
- **[P0] [1h] Signature guard `subscribeRacks()`** — `JSON.stringify(racks) === _lastRacksSig` bail-out — `renderer/inventory.js:7834-7858` — **Gain** : stop rebuilds sur Firestore echoes
- **[P0] [2h] Stop FlashForge polling hors printer view** — Dans `setViewMode`, leaving printer modes → `ffgDisconnect` per FFG printer pas en sidecard. Idem Creality/Snapmaker WS. — `renderer/inventory.js:4964-5007`, `renderer/printers/flashforge/index.js:241-262` — **Gain** : 1 req/2s × N printers stoppé sur autres vues

### P1 — Optimisations importantes (~17h total)
- **[P1] [6h] Keyed-diff `renderPrintersView()`** — Wrap `_makeCard` en `createCard(p)` + `updateCard(card, p)`. Déplacer cards entre CONNECTED/OFFLINE via `appendChild` (move, pas destroy). — `renderer/inventory.js:8084-8354` — **Gain** : status flap ne redécode plus les 10 thumbs, drag-drop reorder O(N) DOM moves
- **[P1] [4h] Keyed-diff `renderRackView()`** — Cache rack frame stable. Per slot : compare new fill vs `el.dataset.spoolId`. Sidebar `#rpUnrackedStrip` extend partial path L12367. — `renderer/inventory.js:11882-12390` — **Gain** : snapshots rack ne flash plus
- **[P1] [2h] Image cache `data:URL` → `file://`** — Voir section 7 — `main.js:1713-1736`, `renderer/inventory.js:4856-4869`
- **[P1] [2h] Persister racks/printers/scales en localStorage** — Mirror `saveInventory()`/`invKey()` pour les 3 autres. Hydrate avant subscribes. — `renderer/inventory.js:3301-3304, 7834, 7877` — **Gain** : rack + printer view instant au cold start
- **[P1] [1h] `renderStats()` early-out** — Tuple `(active, plus, cloud, kg, typeFilter)` ; bail si unchanged — `renderer/inventory.js:4243-4265`
- **[P1] [1h] Cache `populateBrandFilter()` keyset** — `lastBrandKeys`/`lastMaterialKeys`/`lastTypeKeys` ; rebuild `<select>` seulement quand keyset change — `renderer/inventory.js:4529, 1866-1876` — **Gain** : 6 `<select>` innerHTML wipes évités par snapshot
- **[P1] [1h] Elegoo: `onPrintersViewChange()` → `onPrinterGridChange()` sur status** — Le full rebuild grid sur status flap fait shaker la grille pendant boot reconnects — `renderer/printers/elegoo/index.js:172-180`

### P2 — Nice-to-have (~9h total)
- **[P2] [2h] Prune `img_cache` directory** — Boot main : drop files > 30 jours. Cap dir à 100 MB par LRU — `main.js:2214-2216`
- **[P2] [3h] Page Visibility API pour polling** — `document.hidden` → throttle 4× tous les brand intervals. Resume sur `visibilitychange` — tous `printers/*/index.js`
- **[P2] [4h] Debounce Firestore writes auto-triggered par inventory snapshot** — Guard "did anything actually change" pour les 7 fonctions `purgeLegacyTombstones`/`autoAssignMissingContainers`/`autoLinkTwinsByTimestamp`/`maybeAutoUnstoreDepletedSpools`/`maybeAutoStoreUnrankedSpools`/`maybeMigrateDecimalSpoolIds`/`maybeMigrateFlatRackToNested` — `renderer/inventory.js:3916-3946` — **Gain** : coupe la boucle snapshot-write-snapshot après migrations
- **[P2] [2h] `subscribePrinters` metadata short-circuit** — Skip brand callback quand `snapshot.docChanges().length === 0` et pas de pending writes (mirror L3901 inventory) — `renderer/inventory.js:7877-7995`
- **[P2] [1h] Tear down RFID/TD1S listeners au logout** — `ipcRenderer.on('rfid-uid', ...)` reste actif après logout

---

## 9. Annexe — commandes utiles

```bash
# Confirmer enablePersistence pas utilisé
grep -rn "enablePersistence\|enableIndexedDb" renderer --include="*.js" | grep -v "renderer/lib/firebase"

# Tous les Firestore subscriptions
grep -n "onSnapshot\b" renderer/inventory.js

# Tous les innerHTML wipes
grep -n 'innerHTML\s*=' renderer/inventory.js

# Tous les polling timers
grep -n "setInterval" renderer/inventory.js renderer/printers/*/index.js

# Brand callbacks qui trigger full rebuilds
grep -n "onFullRender\|onPrintersViewChange" renderer/printers/*/index.js

# renderPrintersView call sites
grep -n "renderPrintersView()" renderer/inventory.js

# Image cache plumbing
grep -n "state.imgCache\|preCacheImages\|imgGet\|img:get\|imgCacheDir" renderer/inventory.js main.js

# renderRackView triggers
grep -n "renderRackView\b\|renderRacksList\b" renderer/inventory.js

# Confirmer que seul inventory est localStorage-cached
grep -n "tigertag.inv\.\|invKey(" renderer/inventory.js

# Lifetime du FlashForge poll
grep -n "ffgConnect\|ffgDisconnect" renderer/inventory.js | head -20

# Writes side-effect du snapshot inventory
grep -n "purgeLegacyTombstones\|autoAssignMissingContainers\|autoLinkTwinsByTimestamp\|maybeAutoUnstoreDepletedSpools\|maybeAutoStoreUnrankedSpools\|maybeMigrateDecimalSpoolIds\|maybeMigrateFlatRackToNested" renderer/inventory.js
```

---

## 10. Fichiers clés (chemins absolus)

- `/Users/benglut/Documents/TigerTag_Studio_Manager/renderer/inventory.js` — main renderer (14 268 lignes)
- `/Users/benglut/Documents/TigerTag_Studio_Manager/renderer/printers/flashforge/index.js` — 2s HTTP poll
- `/Users/benglut/Documents/TigerTag_Studio_Manager/renderer/printers/snapmaker/index.js` — Moonraker WS
- `/Users/benglut/Documents/TigerTag_Studio_Manager/renderer/printers/creality/index.js` — port-9999 WS
- `/Users/benglut/Documents/TigerTag_Studio_Manager/renderer/printers/elegoo/index.js` — MQTT
- `/Users/benglut/Documents/TigerTag_Studio_Manager/renderer/printers/bambulab/index.js` — MQTTS
- `/Users/benglut/Documents/TigerTag_Studio_Manager/main.js` — Electron main + image cache IPC
