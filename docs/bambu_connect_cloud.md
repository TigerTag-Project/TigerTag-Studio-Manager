# Protocol Cloud Bambu Lab — Spéc d'intégration

> Document destiné à l'agent de dev (Claude/Codex) qui implémente la connexion **100 % cloud** au
> cloud Bambu Lab : connexion compte → récupération auto des imprimantes → setup → stockage
> Firebase → contrôle total → caméra.
>
> **Source de vérité canonique** : [Doridian/OpenBambuAPI](https://github.com/Doridian/OpenBambuAPI)
> (`cloud-http.md`, `mqtt.md`, `tls.md`). Ce document **ne remplace pas** OpenBambuAPI : il le
> référence, et ajoute ce qu'il ne couvre pas — les validations terrain de juin 2026, les pièges
> rencontrés, le modèle de données Firebase, et l'orchestration d'auto-setup.

---

## 0. TL;DR architecture

```
┌──────────────┐   REST (login, devices)   ┌────────────────────┐
│  App cliente │ ────────────────────────▶ │  api.bambulab.com  │
│  (Flutter /  │                            └────────────────────┘
│   backend)   │   MQTT/TLS (télémétrie +
│              │ ◀──── contrôle) ─────────▶  us|eu.mqtt.bambulab.com:8883
│              │
│              │   RTSPS (caméra LAN)  ────▶  rtsps://printer_ip:322
└──────┬───────┘
       │  écrit / lit
       ▼
┌──────────────┐
│   Firebase   │  (compte user, imprimantes, tokens chiffrés, dernier état)
└──────────────┘
```

Deux canaux seulement :
1. **REST HTTPS** `api.bambulab.com` → auth + liste des machines + métadonnées (one-shot).
2. **MQTT/TLS** broker cloud → flux temps réel **et** envoi des commandes (permanent).

La caméra est le seul élément qui **n'est pas** dans ces deux canaux (voir §7).

---

## 1. Authentification

### 1.1 Demander un code de connexion (compte sans mot de passe / SSO Google)

```
POST https://api.bambulab.com/v1/user-service/user/sendemail/code
Content-Type: application/json

{ "email": "<EMAIL>", "type": "codeLogin" }
```

> ⚠️ **Validé juin 2026** : le code email est **à usage unique** et **expire vite** (~quelques min).
> Chaque nouvel envoi **invalide le précédent**. En cas de réutilisation → `HTTP 400 {}`.
> Pour les comptes liés Google (cas réel : `benoit@atome3d.com`), c'est la **seule** voie : pas de
> mot de passe à réinitialiser.

### 1.2 Login

```
POST https://api.bambulab.com/v1/user-service/user/login
Content-Type: application/json

// avec code (recommandé)  :  { "account": "<EMAIL>", "code": "<CODE>" }
// avec mot de passe       :  { "account": "<EMAIL>", "password": "<PWD>" }
```

Réponse : on récupère `accessToken` (et `refreshToken`, souvent identique). Validité ~**3 mois**
(`expiresIn` ≈ 7 776 000 s).

> ⚠️ 2FA : si `loginType: "verifyCode"` ou présence d'un `tfaKey` → étape supplémentaire
> (cf. `/v1/user-service/user/tfa/login`). Le flow par **code email évite généralement le 2FA**.

### 1.3 Résoudre l'`uid` (indispensable pour le MQTT)

> ⚠️ **Piège majeur validé** : l'`accessToken` **n'est plus un JWT** (format opaque `AQC...`). On ne
> peut donc PAS en extraire l'uid. Il faut l'appeler :

```
GET https://api.bambulab.com/v1/design-user-service/my/preference
Authorization: Bearer <accessToken>
→ { "uid": 1504114800, ... }
```

Le **username MQTT** = `"u_" + uid` (ex. `u_1504114800`).

> ⚠️ **Piège validé** : l'endpoint `/v1/user-service/my/preference` (sans `design-`) répond **404**
> avec un corps **non-JSON** → un `json.loads` naïf crashe (`Extra data: line 1 column 5`).
> **Toujours** parser les réponses d'erreur en mode tolérant (try/except → `{}`), et utiliser
> `design-user-service`.

### 1.4 Refresh token

`POST /v1/user-service/user/refreshtoken` est **quasi inutile** (renvoie 401, refresh == access).
En pratique : **re-login par code** quand le token expire (≈ tous les 3 mois). Prévoir ce refresh
dans le flow Firebase (§6).

---

## 2. Récupération automatique des imprimantes

```
GET https://api.bambulab.com/v1/iot-service/api/user/bind
Authorization: Bearer <accessToken>
```

Réponse réelle (validée, 2 machines du compte) :

```json
{
  "devices": [
    {
      "dev_id": "00M09A322200726",
      "name": "X1C Home",
      "online": true,
      "print_status": "ACTIVE",
      "dev_model_name": "BL-P001",
      "dev_product_name": "X1 Carbon",
      "dev_access_code": "da64c712",   // ⭐ access code LAN fourni PAR LE CLOUD
      "nozzle_diameter": 0.4,
      "dev_structure": "CoreXY"
    },
    {
      "dev_id": "01S00C351300198",
      "name": "P1P Office",
      "online": false,
      "dev_model_name": "C11",
      "dev_product_name": "P1P",
      "dev_access_code": "25841488",
      "nozzle_diameter": 0.4
    }
  ]
}
```

> ⭐ **Point clé pour l'auto-setup** : `dev_access_code` est **livré par le cloud**. Tu n'as donc
> **rien à demander à l'utilisateur** pour configurer la caméra LAN et le MQTT local éventuel — tout
> est dérivable du login. C'est ce qui rend le setup « sans effort ».

Endpoints complémentaires utiles pour enrichir la fiche machine :
- `GET /v1/iot-service/api/user/device/version?dev_id=<id>` → versions firmware + modules.
- `GET /v1/iot-service/api/user/print?force=true` → statut courant + `task_id`, `thumbnail`, progression.
- `PATCH /v1/iot-service/api/user/device/info` → renommer la machine (`{ dev_id, name }`).

---

## 3. Connexion MQTT cloud

```
Host  : us.mqtt.bambulab.com   (US/global)   |   eu.mqtt.bambulab.com   (EU)
Port  : 8883   (TLS obligatoire)
User  : u_<uid>
Pass  : <accessToken>          (le token entier, sans préfixe)
```

- **TLS** : le serveur présente un cert valide, mais en pratique on connecte avec vérification
  désactivée (`tls_insecure`) pour éviter les soucis de chaîne. Cf. `tls.md` d'OpenBambuAPI pour le
  faire proprement (CA pinning).
- **Topics** :
  - `device/<dev_id>/report` → **abonnement** (état + réponses aux commandes).
  - `device/<dev_id>/request` → **publication** (commandes).
- **client_id** : aléatoire. Plusieurs connexions simultanées tolérées (app + backend).

> ⚠️ **Région validée** : compte FR fonctionne sur **`us`** (testé OK). Si `CONNACK rc=5`
> (non autorisé) → basculer sur **`eu`**. Rendre la région **configurable** et la stocker côté user.

> ⚠️ **Piège validé** : si la résolution de l'uid (§1.3) échoue, le username est `null` → la
> connexion MQTT est refusée silencieusement. Toujours vérifier `uid` avant de connecter.

### 3.1 Forcer un état complet à la connexion (`pushall`)

```json
publish device/<dev_id>/request
{ "pushing": { "sequence_id": "0", "command": "pushall", "version": 1, "push_target": 1 } }
```

> ⚠️ **X1 vs P1** (validé + doc) : la **X1** renvoie l'objet **complet** à chaque message. La **P1**
> n'envoie que les **deltas** → il FAUT un `pushall` initial puis fusionner les deltas dans un état
> local. **Ne pas spammer `pushall` sur P1** (< 1 / 5 min) sous peine de lag.

---

## 4. Télémétrie (`print.push_status`)

Schéma complet : voir `mqtt.md#pushingpushall`. Champs réellement exploités (validés sur X1C),
avec leur emplacement exact :

| Donnée | Chemin JSON | Note validée |
|---|---|---|
| État | `print.gcode_state` | `IDLE / RUNNING / PAUSE / FINISH / FAILED` |
| Progression % | `print.mc_percent` | |
| Temps restant (min) | `print.mc_remaining_time` | |
| Couche | `print.layer_num` / `print.total_layer_num` | |
| Buse °C | `print.nozzle_temper` / `print.nozzle_target_temper` | |
| Plateau °C | `print.bed_temper` / `print.bed_target_temper` | |
| **Chambre °C** | `print.chamber_temper` **ou** `print.device.ctc.info.temp` | sur X1C récent, présent dans `device.ctc` |
| Ventilo pièce | `print.cooling_fan_speed` | P1 |
| Ventilo auxiliaire | `print.big_fan1_speed` | P2 |
| Ventilo chambre | `print.big_fan2_speed` | P3 |
| WiFi | `print.wifi_signal` | ex. `"-42dBm"` |
| Buse type/diam | `print.nozzle_type` / `print.nozzle_diameter` | ex. `HX01` / `0.4` |
| Lumières | `print.lights_report[]` | `{node: chamber_light|work_light, mode}` |
| Erreurs HMS | `print.hms[]` | vide = OK |
| Vitesse | `print.spd_lvl` | 1–4 |

### 4.1 AMS & couleurs filament (validé)

```
print.ams.ams[]            → unités AMS  ({ id, humidity, temp, tray[] })
print.ams.ams[].tray[]     → slots       ({ id, tray_type, tray_color, remain, tray_info_idx, ... })
print.vt_tray              → bobine externe (id 254/255)
```

- `tray_color` = **`RRGGBBAA`** (alpha toujours `FF`) → couleur CSS = `#` + 6 premiers caractères.
  Validé : `2850E0FF` → `#2850E0` (PETG bleu).
- `remain` = `-1` → **pas de RFID** (filament tiers/générique, ex. TigerTag) ; `tag_uid` à `0`.
- `tray_now` : `254/255` = bobine externe ; sinon `ams_id*4 + tray_id`.

### 4.2 IP locale (utile caméra) — depuis le cloud

- Direct : `print.ipcam.rtsp_url` = `rtsps://192.168.20.154:322/streaming/live/1`.
- Sinon : `print.net.info[0].ip` est un **entier little-endian**.
  Décodage validé : `2585045184` → `192.168.20.154` via
  `ip = f"{n&255}.{(n>>8)&255}.{(n>>16)&255}.{(n>>24)&255}"`.

---

## 5. Contrôle complet (publish sur `device/<id>/request`)

Liste exhaustive + payloads : `mqtt.md`. Les commandes clés (validées / prêtes à l'emploi) :

```jsonc
// Lumière chambre
{ "system": { "sequence_id":"0", "command":"ledctrl", "led_node":"chamber_light",
  "led_mode":"on", "led_on_time":500, "led_off_time":500, "loop_times":0, "interval_time":0 } }

// Ventilateurs (P1=pièce, P2=auxiliaire, P3=chambre) — via gcode brut, S = 0..255
{ "print": { "sequence_id":"0", "command":"gcode_line", "param":"M106 P2 S255\n" } }

// Vitesse : 1=silencieux 2=standard 3=sport 4=ludicrous
{ "print": { "sequence_id":"0", "command":"print_speed", "param":"2" } }

// Job (QoS 1 conseillé pour pause/resume/stop)
{ "print": { "sequence_id":"0", "command":"pause",  "param":"" } }
{ "print": { "sequence_id":"0", "command":"resume", "param":"" } }
{ "print": { "sequence_id":"0", "command":"stop",   "param":"" } }

// Températures (gcode)
{ "print": { "sequence_id":"0", "command":"gcode_line", "param":"M104 S220\n" } }  // buse
{ "print": { "sequence_id":"0", "command":"gcode_line", "param":"M140 S60\n"  } }  // plateau

// Home
{ "print": { "sequence_id":"0", "command":"gcode_line", "param":"G28\n" } }

// AMS : changement de filament / contrôle / réglage couleur
{ "print": { "sequence_id":"0", "command":"ams_change_filament", "target":0, "curr_temp":0, "tar_temp":0 } }
{ "print": { "sequence_id":"0", "command":"ams_control", "param":"resume" } }   // resume|reset|pause

// Lancer une impression (fichier déjà sur la machine / SD / FTP)
{ "print": { "sequence_id":"0", "command":"project_file", "param":"Metadata/plate_1.gcode",
  "url":"ftp:///myfile.3mf", "use_ams":true, "ams_mapping":[-1,-1,-1,1,0], ... } }
```

> Règles validées : `sequence_id` **incrémenté** à chaque commande ; la **réponse** revient sur
> `/report` avec le même `sequence_id` et `result: "success"` (insensible à la casse). Toujours
> matcher requête↔réponse par `sequence_id`.

> ⚠️ `ams_mapping` : tableau de **5 éléments**, rempli **par la droite**, `-1` = inutilisé,
> `use_ams:true` obligatoire. Mapping faux → l'imprimante reste en pause. Cf. `mqtt.md`.

---

## 6. Modèle de données Firebase (la partie « stock dans la firebase de l'user »)

OpenBambuAPI ne couvre pas le stockage — voici le modèle retenu. **Choix clé : on se range
sous la collection `printers/{brand}/` existante** (déjà `isOwner()` via la règle
`match /printers/{brand}/{document=**}` côté backend). `secrets/` est rangé **PAR BRAND, en sibling
exact de `devices/`** (`printers/{brand}/secrets/…` ⟷ `printers/{brand}/devices/…`), et on
**sépare l'affichage des secrets** dans ces deux sous-chemins distincts. Une règle **explicite**
`match /printers/{brand}/secrets/{document=**}` (owner-only) est posée côté backend pour ancrer
l'intention « jamais ami/public ».

```
users/{uid}/printers/bambulab/
  devices/{dev_id}              ← AFFICHAGE SEUL (jamais de secret ici)
    devId: "00M09A322200726"
    name: "X1C Home"
    model: "X1 Carbon"          // dev_product_name
    modelCode: "BL-P001"        // dev_model_name
    structure: "CoreXY"
    nozzleDiameter: 0.4
    online: bool
    firmware: string
    cameraIp: "192.168.20.154"  // dérivable, pas secret
    lastState:                  // dernier push_status « aplati » (cache d'affichage)
      gcodeState, mcPercent, remainingMin, layerNum, totalLayerNum,
      nozzleTemp, bedTemp, chamberTemp, wifi, ams: [...], updatedAt

  secrets/                      ← TOUS LES SECRETS, isolés (extensible : futurs secrets ici)
    cloud_session               ← doc : jeton COMPTE (account-level, partagé multi-device)
      email, region: "us"|"eu", bambuUid, mqttUsername: "u_<uid>",
      accessToken, refreshToken, tokenExpiresAt, refreshInProgress?, updatedAt
    {dev_id}                    ← doc par machine : secrets LAN
      dev_access_code: "da64c712"   // caméra RTSPS / FTP / MQTT LAN
```

> **Pourquoi `secrets/` à part de `devices/`** : Firestore lit en **tout-ou-rien par document** (pas
> de filtre par champ). Si un jour les amis lisent `devices/**` (item ROADMAP **P6**), tout doc lu est
> lu **en entier** — un secret laissé dans `devices/{id}` fuirait. En l'isolant dans `secrets/`, le
> futur grant ami se scope sur `printers/bambulab/devices/**` **seul**, et `secrets/**` n'est
> **jamais** dans le chemin matché → protégé par construction. Voir §6.2.

### 6.1 Stratégie token multi-device (le cœur du « depuis n'importe où »)

Besoin produit : **état + contrôle accessibles partout** (Flutter mobile, Studio maison, Studio
boulot) **même PC maison éteint**. La caméra, elle, reste gérée à part (relai LAN, §7.1) — elle
**n'a pas besoin** du cloud token. Tout le reste passe par le token.

**Principe : UN seul token, généré UNE fois, partagé. Les appareils le LISENT, ne le régénèrent
jamais.** `users/{uid}/printers/bambulab/secrets/cloud_session.accessToken` est la **source de vérité
unique**.

```
Login Bambu (1 fois, n'importe quel appareil)
        │  écrit le token
        ▼
   Firestore  .../printers/bambulab/secrets/cloud_session   ◀── source de vérité unique
        │  onSnapshot / lecture one-shot
   ┌────┼─────────────────────┬─────────────────────┐
   ▼                          ▼                      ▼
Flutter (4G)         Studio maison           Studio boulot
 cache keychain       cache keychain          cache keychain
   │                          │                      │
   └── connexion DIRECTE Bambu (MQTT état + REST contrôle), clientId UNIQUE chacun ──┘
```

Pourquoi le **même** token marche sur N appareils :
- **REST** : bearer **stateless** → illimité en parallèle.
- **MQTT** : mêmes identifiants OK en simultané **à condition d'un `client_id` aléatoire/unique par
  appareil** (déjà noté §3 — sinon le broker kicke la connexion précédente).

**Pourquoi PAS un login par appareil** : il faudrait soit re-saisir le login Bambu sur chaque device
(friction), soit stocker le **mot de passe** (pire que le token). Le token partagé évite les deux.

**Re-login coordonné (le seul vrai piège — la course à l'expiration).** À ~3 mois le token meurt
(`refreshToken` quasi inutile, §1.4). Si deux appareils détectent l'expiration en même temps et
reloggent en parallèle, le second login peut invalider le token tout frais du premier. Donc :
- soit un flag `refreshInProgress` (+ timestamp) posé **en transaction** Firestore → le premier qui
  l'obtient relogge, les autres **attendent** le nouveau token via `onSnapshot` ;
- soit **un seul appareil désigné** a le droit de relogger (ex. le Studio host) ; les autres ne font
  **que lire**.

> Inconnue à valider terrain : un nouveau login Bambu invalide-t-il les tokens précédents, ou
> coexistent-ils ? (Handy + Studio simultanés suggèrent qu'ils coexistent.) **Sans importance pour ce
> design** : avec un seul login coordonné, on n'est jamais en situation de deux tokens concurrents.

### 6.2 Sécurité (non négociable)

- `accessToken` et `accessCode` sont des **secrets** (contrôle total imprimante pendant 3 mois,
  caméra, FTP). **Ne jamais** les stocker/exposer en clair côté client, ni en log/analytics.
- **Important** : les *Security Rules* Firestore décident **QUI** lit un champ, elles ne **chiffrent
  rien**. Un token en `isOwner()` reste **en clair** pour le client. « Sécuriser » = choisir *où* il
  vit et *qui* peut le déchiffrer :
  - **V1 — pragmatique (modèle de Bambu lui-même), retenu** : secrets sous
    `users/{uid}/printers/bambulab/secrets/**`, **déjà `isOwner()`** via la règle existante
    `match /printers/{brand}/{document=**}` → **aucune nouvelle règle à écrire/déployer**. Chaque
    appareil **lit puis met en cache dans son coffre OS** (`flutter_secure_storage` = iOS Keychain /
    Android Keystore ; Electron `safeStorage` = Keychain / DPAPI). Connexion directe Bambu ensuite. Le
    token n'est exposé qu'à **tes propres appareils de confiance**.
  - **V2 — durci (si un jour token « zéro client »)** : un **backend permanent** (pas une Cloud
    Function : le MQTT Bambu est persistant) détient le token, maintient la connexion et relaie l'état
    aux clients via Firebase/WebSocket ; les clients ne voient jamais le token. Plus sûr, mais service
    always-on à héberger.
- **⚠️ Garde-fou P6 (friend-read sur `printers`)** : les règles Firestore sont une **UNION** de
  permissions — une règle stricte sur `secrets/**` **ne révoque PAS** un grant plus large. Donc si
  l'item ROADMAP **P6** ajoute la lecture amie des imprimantes, il **DOIT** être scopé au sous-chemin
  d'affichage **uniquement** :
  ```
  match /printers/{brand}/devices/{document=**} {   // devices/ SEULEMENT — jamais secrets/
    allow read: if isOwner() || <friend gate + sharePrinters == true>;
  }
  ```
  Ne **jamais** poser un friend-read sur `printers/{brand}/{document=**}` (il engloberait `secrets/`).
- Ne **jamais** committer `bambu_session.json` / tokens (ajouter au `.gitignore`).

---

## 7. Caméra

### 7.1 Mode LAN (recommandé pour commencer — validé)

```
rtsps://bblp:<dev_access_code>@<printer_ip>:322/streaming/live/1
```

- `bblp` = user fixe ; `<dev_access_code>` vient du `bind` (déjà en Firebase) ; `<printer_ip>` vient
  de la télémétrie (`ipcam.rtsp_url` ou `net.info[0].ip`). **100 % auto, rien à saisir.**
- Le navigateur **ne lit pas** le RTSPS → transcoder côté serveur (ffmpeg `-f mpjpeg` → `<img>`,
  ou **go2rtc** source `bambu` pour WebRTC/HLS).
- ⚠️ **Validé 2026** : nécessite d'activer **« LAN Mode Liveview »** sur l'écran de l'imprimante
  (n'active PAS le LAN-only). Sans ça, le flux ne s'ouvre pas.
- Ne marche que sur le **même réseau** que l'imprimante (ou via VPN/relai).

### 7.2 Mode Cloud (documenté mais lourd — `ttcode` + TUTK)

```
POST https://api.bambulab.com/v1/iot-service/api/user/ttcode
Authorization: Bearer <accessToken>
{ "dev_id": "<dev_id>" }
→ { "ttcode": "...", "passwd": "...", "authkey": "..." }
```

Ces identifiants servent à s'authentifier au flux caméra **via le SDK TUTK (ThroughTek Kalay)**,
en P2P : libs natives `libIOTCAPIs` / `libAVAPIs` / `libTUTKGlobalAPIs`, appels
`IOTC_Connect_ByUID_Parallel`, auth `AV_AUTH_TOKEN` / `AV_SECURITY_DTLS`.

> ⚠️ **Réalité d'implémentation** : il n'existe **pas** de réimplémentation libre propre du transport
> vidéo TUTK/BRTC. Les firmwares récents (X1C testé : `tutk_server:disable`, `brtc_service:enable`)
> sont passés à **BRTC** (WebRTC propriétaire Bambu), encore moins documenté. Le seul logiciel qui
> fait la vidéo distante par le cloud est **Bambu Connect** (officiel), dont le reverse est sous
> **cease-and-desist** (mai 2026).
>
> **Recommandation produit** : pour « caméra partout », ne PAS tenter de reverser TUTK/BRTC.
> Utiliser le **mode LAN (§7.1) + un relai** (go2rtc / ffmpeg) chez l'utilisateur, exposé via
> tunnel (Tailscale/Cloudflare Tunnel). Légal, robuste, indépendant de Bambu.

---

## 8. Flow d'auto-setup « sans effort »

Objectif : l'utilisateur entre **email + code**, tout le reste est automatique.

```
1. sendemail/code(email)                      → user reçoit le code
2. login(email, code)                         → accessToken (+ expiresAt)
3. GET design-user-service/my/preference      → uid → mqttUsername = u_<uid>
4. GET iot-service/api/user/bind              → liste machines (avec dev_access_code !)
5. Pour chaque machine :
   - GET device/version?dev_id                → firmware
   - écrire users/{uid}/bambu/printers/{id}   → fiche complète, secrets chiffrés
6. Connexion MQTT (u_<uid> / token) sur la bonne région
   - subscribe device/<id>/report  +  publish pushall
7. on_message → aplatir push_status → maj lastState en Firebase (throttle ~2–5 s)
8. Caméra : dériver l'URL RTSPS depuis (dev_access_code + ip télémétrie) → prête sans saisie
9. Token : planifier un check tokenExpiresAt ; à J-7, re-login par code (notifier l'user)
```

Idempotence : ré-exécuter ce flow doit **mettre à jour** les fiches sans dupliquer (clé = `dev_id`).

---

## 9. Checklist des pièges (tous validés cette session)

- [ ] Parser **tolérant** sur toutes les réponses REST (les erreurs ne sont pas du JSON) → sinon crash.
- [ ] `uid` via **`design-user-service`** (l'autre endpoint = 404). Token **≠ JWT**.
- [ ] Région **us par défaut**, fallback **eu** sur `rc=5`. La stocker.
- [ ] Code email **usage unique**, expire vite → en demander un et l'utiliser **immédiatement**.
- [ ] **P1 = deltas** (fusionner) ; **X1 = full**. `pushall` initial obligatoire.
- [ ] `tray_color` = `RRGGBBAA` → couper à 6 ; `remain:-1` = pas de RFID.
- [ ] `net.info[0].ip` = entier **little-endian**.
- [ ] Caméra LAN nécessite **LAN Mode Liveview** activé sur l'écran.
- [ ] Caméra cloud (TUTK/BRTC) = non réalisable proprement → **relai LAN**.
- [ ] Secrets (`accessToken`, `dev_access_code`) **chiffrés**, idéalement **côté backend**.

---

## 10. Références

- **OpenBambuAPI** (source de vérité) : https://github.com/Doridian/OpenBambuAPI
  - `cloud-http.md` (REST, dont `ttcode`), `mqtt.md` (toutes les commandes + `push_status`), `tls.md`.
- **pybambu** (impl. Python mature, base de Home Assistant) : https://github.com/greghesp/ha-bambulab
- **bambulabs_api** (lib pip, **mode LAN**) : https://github.com/mchrisgm/bambulabs_api
- **go2rtc** (source caméra `bambu`, relai WebRTC/HLS) : https://github.com/AlexxIT/go2rtc
```
