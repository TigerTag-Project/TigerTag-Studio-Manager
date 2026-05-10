# Bambu Lab MQTT — Agent Skill

> Référence complète pour implémenter l'intégration Bambu Lab dans une app Node.js/Electron.
> Extraite de l'app Flutter TigerTag Connect (tigertag_connect1).

---

## 1. Prérequis sur l'imprimante

L'API locale Bambu Lab est verrouillée derrière deux modes que l'utilisateur doit activer **sur l'écran de l'imprimante** avant toute connexion :

| Étape | Modèle | Chemin de l'interface |
|-------|--------|-----------------------|
| 1 | X1 / X1C / X1E | Settings → LAN Only Mode → activer |
| 1 | P1P / P1S | Settings → WLAN → LAN Only Mode → Yes |
| 1 | A1 / A1 Mini | Settings → LAN Only Mode → activer |
| 1 | P2S / H2x | Settings → LAN Only Mode → activer |
| 2 | Tous | Developer Mode → activer (accepter l'avertissement de risque) |

Une fois Developer Mode activé, l'imprimante affiche son **IP**, son **Serial Number** et son **Access Code** (= mot de passe MQTT).

---

## 2. Paramètres de connexion MQTT

| Paramètre | Valeur |
|-----------|--------|
| **Host** | IP de l'imprimante (ex. `192.168.1.42`) |
| **Port** | `8883` |
| **TLS** | Oui — TLS sur TCP, certificat auto-signé de l'imprimante |
| **Vérification certificat** | Désactivée (`rejectUnauthorized: false`) |
| **Username** | `bblp` (fixe, toujours identique) |
| **Password** | Access Code affiché sur l'écran de l'imprimante (ex. `12345678`) |
| **Client ID** | Chaîne quelconque, ex. `studio_${Date.now()}` |
| **keepAlive** | `20` secondes |
| **Clean session** | `true` |
| **Protocole** | MQTT 3.1.1 |

```js
// Exemple Node.js avec mqtt.js
const mqtt = require('mqtt');

const client = mqtt.connect({
  host: '192.168.1.42',
  port: 8883,
  protocol: 'mqtts',
  rejectUnauthorized: false,
  username: 'bblp',
  password: '12345678',   // Access Code
  clientId: `studio_${Date.now()}`,
  keepalive: 20,
  clean: true,
});
```

---

## 3. Structure des topics MQTT

| Direction | Topic | Description |
|-----------|-------|-------------|
| **Subscribe** | `device/{serialNumber}/report` | Toutes les données poussées par l'imprimante |
| **Publish** | `device/{serialNumber}/request` | Commandes envoyées à l'imprimante |

`{serialNumber}` est le numéro de série de l'imprimante (ex. `00M09A123456789`).

---

## 4. Séquence d'initialisation

Après connexion MQTT réussie, exécuter dans cet ordre :

### Étape 1 — Subscribe au topic report

```js
client.subscribe(`device/${serialNumber}/report`, { qos: 1 });
```

### Étape 2 — get_version (info burst)

```json
{
  "info": {
    "sequence_id": "0",
    "command": "get_version"
  }
}
```

Topic : `device/{serialNumber}/request`

### Étape 3 — pushall (état complet)

```json
{
  "pushing": {
    "sequence_id": "0",
    "command": "pushall"
  }
}
```

Topic : `device/{serialNumber}/request`

L'imprimante répond avec un message `print` complet contenant tout l'état (températures, AMS, progression, fichier en cours, etc.).

### Étape 4 — Refresh périodique (optionnel)

Après `pushall`, l'imprimante envoie des mises à jour **partielles** en temps réel. Si une mise à jour partielle arrive sans champ AMS alors qu'un champ `vt_tray` est présent, relancer un `pushall` pour récupérer l'état AMS complet :

```json
{
  "pushing": {
    "sequence_id": "42",
    "command": "pushall",
    "version": 1,
    "push_target": 1
  }
}
```

**Règle pratique** : programmer un timer de 5 secondes après chaque message reçu. Si aucun nouveau message n'arrive pendant 5 s, envoyer un `pushall`.

---

## 5. Commandes de contrôle (publish)

### 5.1 Pause impression

```json
{
  "print": {
    "sequence_id": "1",
    "command": "pause"
  }
}
```

### 5.2 Reprendre impression

```json
{
  "print": {
    "sequence_id": "2",
    "command": "resume"
  }
}
```

### 5.3 Stopper/annuler impression

```json
{
  "print": {
    "sequence_id": "3",
    "command": "stop"
  }
}
```

### 5.4 Modifier le filament AMS (ams_filament_setting)

Envoyé après lecture d'un tag NFC pour enregistrer la couleur et le type de filament dans un slot AMS ou dans la bobine externe.

```json
{
  "print": {
    "sequence_id": "10",
    "command": "ams_filament_setting",
    "ams_id": 0,
    "tray_id": 2,
    "slot_id": 2,
    "tray_color": "FF0000FF",
    "nozzle_temp_min": 190,
    "nozzle_temp_max": 220,
    "tray_type": "PLA",
    "tray_info_idx": "GFA00"
  }
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `ams_id` | int | ID du module AMS (0-based). `255` = bobine externe |
| `tray_id` | int | ID du slot dans l'AMS (0-based). `254` = bobine externe |
| `slot_id` | int | Même que `tray_id`. `0` pour la bobine externe |
| `tray_color` | string | Couleur RRGGBBAA en hexadécimal majuscule (ex. `"FF0000FF"`) |
| `nozzle_temp_min` | int | Température minimale buse (°C) |
| `nozzle_temp_max` | int | Température maximale buse (°C) |
| `tray_type` | string | Type de filament Bambu (ex. `"PLA"`, `"PETG"`, `"ABS"`, `"PLA-CF"`) |
| `tray_info_idx` | string | Identifiant interne Bambu du matériau (ex. `"GFA00"`) |

**Bobine externe** :
```json
{
  "print": {
    "sequence_id": "11",
    "command": "ams_filament_setting",
    "ams_id": 255,
    "tray_id": 254,
    "slot_id": 0,
    "tray_color": "00FF00FF",
    "nozzle_temp_min": 200,
    "nozzle_temp_max": 240,
    "tray_type": "PETG",
    "tray_info_idx": "GFB00"
  }
}
```

### 5.5 Gestion du sequence_id

Compteur entier incrémenté à chaque publish, réinitialisé à `0` quand il atteint `4086` :

```js
let seqId = 0;
function nextSeqId() {
  if (seqId >= 4086) seqId = 0;
  return String(seqId++);
}
```

---

## 6. Format des messages PUSH (report)

Tous les messages reçus sur `device/{serialNumber}/report` sont du JSON. La racine contient généralement une clé `print` avec les données d'état.

### 6.1 Structure générale

```json
{
  "print": {
    "command": "push_status",
    "sequence_id": "0",
    "msg": 0,
    "gcode_state": "RUNNING",
    "mc_percent": 45,
    "mc_print_stage": 2,
    "mc_remaining_time": 3600,
    "remaining_time": 3600,
    "layer_num": 120,
    "total_layer_num": 300,
    "subtask_name": "my_print.gcode",
    "gcode_file": "/sdcard/cache/my_print.3mf",
    "nozzle_temper": 220.5,
    "nozzle_target_temper": 220,
    "bed_temper": 60.2,
    "bed_target_temper": 60,
    "chamber_temper": 35.0,
    "ams": {
      "ams": [
        {
          "id": "0",
          "tray": [
            {
              "id": "0",
              "tray_color": "FF0000FF",
              "tray_type": "PLA",
              "is_active": true,
              "state": 11
            }
          ]
        }
      ],
      "ams_exist_bits": "1",
      "version": 3
    },
    "vt_tray": {
      "id": "254",
      "tray_color": "00FF00FF",
      "tray_type": "PETG",
      "is_active": false
    },
    "ipcam": {
      "rtsp_url": "rtsps://bblp:password@192.168.1.42:322/streaming/live/1",
      "file_name": "my_print"
    },
    "device": {
      "extruder": {
        "state": 16,
        "info": [
          {
            "id": 0,
            "temp": 14417376
          }
        ]
      },
      "bed": {
        "info": {
          "temp": 3932220
        }
      },
      "ctc": {
        "info": {
          "temp": 2293760
        }
      }
    }
  }
}
```

### 6.2 Table des champs `print`

| Champ | Type | Description |
|-------|------|-------------|
| `gcode_state` | string | État principal (voir §7) |
| `print_type` | string | Alternative à `gcode_state` (anciens firmwares) |
| `state` | string | Alternative à `gcode_state` |
| `status` | string | Alternative à `gcode_state` |
| `mc_percent` | int/string | Progression 0–100 (%) |
| `mc_print_stage` | int | Étape interne. `0` = pas d'impression en cours |
| `mc_remaining_time` | int | Temps restant en secondes (alias de `remaining_time`) |
| `remaining_time` | int | Temps restant en secondes |
| `layer_num` | int | Couche actuelle |
| `total_layer_num` | int | Nombre total de couches |
| `subtask_name` | string | Nom du sous-job / fichier en cours |
| `gcode_file` | string | Chemin du fichier gcode |
| `project_file` | string | Chemin du fichier projet |
| `nozzle_temper` | float | Température buse actuelle (°C) — anciens firmwares |
| `nozzle_target_temper` | float | Température buse cible (°C) — anciens firmwares |
| `bed_temper` | float | Température plateau actuelle (°C) — anciens firmwares |
| `bed_target_temper` | float | Température plateau cible (°C) — anciens firmwares |
| `chamber_temper` | float | Température enceinte actuelle (°C) — anciens firmwares |
| `ams` | object | Données AMS complètes (voir §8) |
| `vt_tray` | object | Bobine externe (anciens firmwares) |
| `vir_slot` | array | Bobine externe (nouveaux firmwares, 1er élément) |
| `ams_exist_bits` | string | Bits indiquant les modules AMS présents |
| `ipcam` | object | Informations caméra (voir §10) |
| `device` | object | Températures packed 32-bit nouveaux firmwares (voir §9.2) |
| `upgrade_state` | object | État de mise à jour firmware |

---

## 7. États d'impression (`gcode_state`)

Logique de priorité : `gcode_state` > `print_type` > `state` > `status` > `upgrade_state.status`

| Valeur (minuscules normalisées) | Signification |
|---------------------------------|---------------|
| `running` | Impression en cours |
| `printing` | Impression en cours (alias) |
| `prepare` | Préparation (chauffage, leveling) |
| `preparing` | Préparation (alias) |
| `heating` | Chauffage en cours |
| `busy` | Occupé (générique) |
| `pause` | Pause manuelle |
| `paused` | Pause (alias) |
| `idle` | Aucune impression |
| `finish` | Impression terminée avec succès |
| `finished` | Terminée (alias) |
| `failed` | Échec de l'impression |
| `failure` | Échec (alias) |
| `error` | Erreur |
| `slicing` | Découpage en cours (rare, cloud) |
| `init` | Initialisation imprimante |
| `offline` | Hors-ligne |

**Règle spéciale** : si `gcode_state` == `failed`/`failure`/`error` ET qu'un autre champ (`print_type`, `state`, `status`) vaut `idle`, retourner `idle` (le firmware laisse parfois `gcode_state=FAILED` après un print qui s'est bien terminé ensuite).

**Spinner UI** : afficher un indicateur de progression pour `printing`, `prepare`, `preparing`, `busy`, `heating`.

---

## 8. Structure AMS et filaments

### 8.1 JSON complet AMS

```json
{
  "ams": {
    "ams": [
      {
        "id": "0",
        "humidity": "3",
        "temp": "28.0",
        "tray": [
          {
            "id": "0",
            "tray_color": "FF0000FF",
            "tray_type": "PLA",
            "tray_sub_brands": "",
            "tray_weight": "1000",
            "tray_diameter": "1.75",
            "tray_temp": "190",
            "tray_time": "8",
            "bed_temp_type": "1",
            "bed_temp": "60",
            "nozzle_temp_max": "220",
            "nozzle_temp_min": "190",
            "is_active": true,
            "state": 11
          },
          {
            "id": "1",
            "tray_color": "FFFFFFFF",
            "tray_type": "PLA",
            "is_active": false,
            "state": 0
          },
          {
            "id": "2",
            "tray_color": "00000000",
            "tray_type": "",
            "is_active": false,
            "state": 0
          },
          {
            "id": "3",
            "tray_color": "0000FFFF",
            "tray_type": "PETG",
            "is_active": false,
            "state": 2
          }
        ]
      }
    ],
    "ams_exist_bits": "1",
    "tray_exist_bits": "15",
    "tray_is_bbl_bits": "15",
    "tray_read_done_bits": "15",
    "tray_reading_bits": "0",
    "version": 3,
    "insert_flag": true,
    "power_on_flag": false
  }
}
```

### 8.2 Table des champs d'un slot AMS (`tray`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string/int | Index du slot dans ce module (0-based) |
| `tray_color` | string | Couleur RRGGBBAA hex (ex. `"FF0000FF"`) |
| `tray_type` | string | Type de filament (`"PLA"`, `"PETG"`, `"ABS"`, etc.) |
| `tray_sub_brands` | string | Sous-marque |
| `is_active` | bool | `true` si ce slot est actif/en cours d'utilisation |
| `state` | int | `11` = actif/en cours, `0` = inactif, `2` = chargé non actif |
| `nozzle_temp_min` | string/int | Temp. buse min recommandée (°C) |
| `nozzle_temp_max` | string/int | Temp. buse max recommandée (°C) |
| `bed_temp` | string/int | Temp. plateau recommandée (°C) |

### 8.3 Parsing de la couleur

Format : `RRGGBBAA` (8 hex chars) ou `RRGGBB` (6 hex chars).

```js
function parseFilamentColor(hex) {
  const h = hex.replace('#', '').toUpperCase();
  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = parseInt(h.slice(6, 8), 16);
    return { r, g, b, a };
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b, a: 255 };
  }
  return null;
}
```

### 8.4 Bobine externe

Deux formats selon firmware :

| Clé | Firmware | Valeur |
|-----|----------|--------|
| `vt_tray` | Anciens firmwares | Object direct |
| `vir_slot` | Nouveaux firmwares | Array, lire `[0]` |

Les deux peuvent être à la racine du `print` block ou directement dans le payload.

```js
function extractExternalTray(printBlock) {
  if (printBlock?.vt_tray && typeof printBlock.vt_tray === 'object') {
    return printBlock.vt_tray;
  }
  if (Array.isArray(printBlock?.vir_slot) && printBlock.vir_slot.length > 0) {
    return printBlock.vir_slot[0];
  }
  return null;
}
```

### 8.5 Slot actif

Un slot est considéré actif si : `tray.is_active === true` **OU** `tray.state === 11`.

---

## 9. Températures

### 9.1 Anciens firmwares (champs directs dans `print`)

| Champ | Température |
|-------|-------------|
| `nozzle_temper` | Buse actuelle (°C, float) |
| `nozzle_target_temper` | Buse cible (°C) |
| `bed_temper` | Plateau actuel (°C, float) |
| `bed_target_temper` | Plateau cible (°C) |
| `chamber_temper` | Enceinte actuelle (°C, float) |

### 9.2 Nouveaux firmwares (packed 32-bit dans `print.device`)

Les firmwares récents encodent température actuelle + cible dans un entier 32 bits.

**Format packed** : `temp = current | (target << 16)` (little-endian 16 bits chaque)

```js
function decodePackedTemp32(raw) {
  const v = typeof raw === 'number' ? raw : parseInt(raw);
  if (isNaN(v)) return { current: null, target: null };
  const current = v & 0xFFFF;
  const target = (v >> 16) & 0xFFFF;
  return { current, target };
}
```

**Structure `device`** :

```json
{
  "device": {
    "extruder": {
      "state": 16,
      "info": [
        { "id": 0, "temp": 14417376 }
      ]
    },
    "bed": {
      "info": { "temp": 3932220 }
    },
    "ctc": {
      "info": { "temp": 2293760 }
    }
  }
}
```

| Clé `device` | Capteur |
|--------------|---------|
| `extruder.info[].temp` | Buse (packed 32-bit, choisir le nozzle actif par `state >> 4 & 0xF`) |
| `bed.info.temp` | Plateau (packed 32-bit) |
| `ctc.info.temp` | Enceinte/CTC (packed 32-bit) |

**Algorithme complet de lecture des températures** (priorité nouveaux firmwares) :

```js
function parseTemperatures(print) {
  let nozzleCurrent = null, nozzleTarget = null;
  let bedCurrent = null, bedTarget = null;
  let chamberCurrent = null, chamberTarget = null;

  const device = print?.device;

  // 1. Buse — nouveaux firmwares
  const extruder = device?.extruder;
  if (extruder) {
    const state = typeof extruder.state === 'number' ? extruder.state : null;
    const activeNozzleIndex = state !== null ? (state >> 4) & 0xF : null;
    const info = extruder.info;
    if (Array.isArray(info)) {
      let activeNozzle = info.find(e => e?.id === activeNozzleIndex) ?? info[0];
      if (activeNozzle?.temp != null) {
        const p = decodePackedTemp32(activeNozzle.temp);
        nozzleCurrent = p.current;
        nozzleTarget = p.target;
      }
    }
  }
  // Fallback
  if (nozzleCurrent == null && print.nozzle_temper != null)
    nozzleCurrent = Math.round(print.nozzle_temper);
  if (nozzleTarget == null && print.nozzle_target_temper != null)
    nozzleTarget = Math.round(print.nozzle_target_temper);

  // 2. Plateau — nouveaux firmwares
  const bed = device?.bed;
  if (bed?.info?.temp != null) {
    const p = decodePackedTemp32(bed.info.temp);
    bedCurrent = p.current; bedTarget = p.target;
  }
  // Fallback
  if (bedCurrent == null && print.bed_temper != null)
    bedCurrent = Math.round(print.bed_temper);
  if (bedTarget == null && print.bed_target_temper != null)
    bedTarget = Math.floor(print.bed_target_temper);

  // 3. Enceinte — nouveaux firmwares
  const ctc = device?.ctc;
  if (ctc?.info?.temp != null) {
    const p = decodePackedTemp32(ctc.info.temp);
    chamberCurrent = p.current; chamberTarget = p.target;
  }
  // Fallback
  if (chamberCurrent == null && print.chamber_temper != null)
    chamberCurrent = Math.round(print.chamber_temper);

  return { nozzleCurrent, nozzleTarget, bedCurrent, bedTarget, chamberCurrent, chamberTarget };
}
```

---

## 10. Caméra

Bambu Lab utilise **deux protocoles différents** selon la famille de modèle.

### 10.1 Détermination du protocole par modèle

| Famille (model IDs) | Protocole |
|---------------------|-----------|
| `1` (A1 Mini), `2` (A1), `3` (P1S), `4` (P1P) | **JPEG TCP** (port 6000) |
| `5` (X1C), `6` (X1E), `7` (H2S), `8` (H2D), `9` (H2D Pro), `10` (P2S), `11` (H2C) | **RTSP** (port 322) |
| Modèle inconnu | Fallback : lire `print.ipcam.rtsp_url` (RTSP si non vide et non `"disable"`) |

### 10.2 Flux RTSP (X1, P2S, H2x)

URL construite localement :

```
rtsps://bblp:{accessCode}@{ip}:322/streaming/live/1
```

```js
function buildRtspUrl(ip, accessCode) {
  const pass = encodeURIComponent(accessCode);
  return `rtsps://bblp:${pass}@${ip}:322/streaming/live/1`;
}
```

L'URL `rtsp_url` dans `print.ipcam.rtsp_url` peut être présente mais ne contient pas le mot de passe. **Toujours reconstruire l'URL** avec les credentials locaux.

Si `rtsp_url` == `"disable"`, la caméra LAN est désactivée sur cette session.

### 10.3 Flux JPEG TCP (A1, A1 Mini, P1P, P1S)

**Port** : `6000` (TLS, certificat auto-signé ignoré)

**Protocole** :
1. Ouvrir `SecureSocket` vers `{ip}:6000` (`rejectUnauthorized: false`)
2. Envoyer le paquet d'authentification (80 octets) immédiatement après connexion
3. Lire en boucle des frames JPEG encapsulées

**Paquet d'authentification** (80 octets) :

```
Bytes  0-15  : Header (16 octets)
  [0-3]   = 0x40000000   (uint32 LE)
  [4-7]   = 0x00003000   (uint32 LE)
  [8-11]  = 0x00000000   (uint32 LE)
  [12-15] = 0x00000000   (uint32 LE)
Bytes 16-47 : Username (32 octets, UTF-8 zero-padded) — "bblp"
Bytes 48-79 : Password (32 octets, UTF-8 zero-padded) — Access Code
```

```js
function buildBambuVideoAuthPacket(username, password) {
  const buf = Buffer.alloc(80, 0);
  buf.writeUInt32LE(0x40, 0);
  buf.writeUInt32LE(0x3000, 4);
  buf.writeUInt32LE(0, 8);
  buf.writeUInt32LE(0, 12);
  const userBytes = Buffer.from(username, 'utf8').slice(0, 32);
  const passBytes = Buffer.from(password, 'utf8').slice(0, 32);
  userBytes.copy(buf, 16);
  passBytes.copy(buf, 48);
  return buf;
}
```

**Format d'une frame** :

```
Bytes  0-3  : payloadSize (uint32 LE) — taille du JPEG suivant
Bytes  4-15 : 12 octets inconnus (padding/header)
Bytes 16-N  : données JPEG brutes (SOI=0xFF 0xD8, EOI=0xFF 0xD9)
```

```js
async function readJpegFrame(socket) {
  const header = await readExactly(socket, 16);
  const payloadSize = header.readUInt32LE(0);
  if (payloadSize <= 0 || payloadSize > 8 * 1024 * 1024) return null; // frame invalide

  const payload = await readExactly(socket, payloadSize);

  // Vérifier signature JPEG
  const isJpeg = payload[0] === 0xFF && payload[1] === 0xD8 &&
                 payload[payload.length - 2] === 0xFF && payload[payload.length - 1] === 0xD9;
  if (!isJpeg) return null; // ignorer, lire la suivante

  return payload; // Buffer JPEG complet, affichable directement
}
```

---

## 11. Miniature d'impression (FTPS)

La miniature de l'impression en cours est extraite via **FTPS implicite** depuis le fichier `.3mf` stocké sur l'imprimante.

### 11.1 Paramètres FTPS

| Paramètre | Valeur |
|-----------|--------|
| **Host** | IP de l'imprimante |
| **Port** | `990` (FTPS implicite — TLS dès la connexion) |
| **Username** | `bblp` |
| **Password** | Access Code |
| **TLS** | Oui, certificat auto-signé ignoré |
| **Mode données** | PASV (passif) |
| **Type transfert** | Binaire (`TYPE I`) |
| **Protection canal données** | `PBSZ 0` + `PROT P` |

### 11.2 Séquence FTPS

```
→ Connexion TLS sur port 990
← 220 Welcome
→ USER bblp
← 331 Password required
→ PASS {accessCode}
← 230 Logged in
→ TYPE I
← 200 OK
→ PBSZ 0
← 200 OK
→ PROT P
← 200 OK
→ PASV
← 227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)
→ NLST /cache         (ou NLST /)
← 150 Opening transfer
← [liste des fichiers]
← 226 Transfer complete
→ PASV
→ RETR /cache/{filename}.3mf
← 150 Opening transfer
← [données binaires .3mf]
← 226 Transfer complete
→ QUIT
```

Port données passif : `(p1 * 256) + p2` extrait de la réponse PASV.

### 11.3 Extraction de la miniature depuis le `.3mf`

Un fichier `.3mf` est un **ZIP**. La miniature est un PNG dans le dossier `metadata/` :

```
metadata/plate_1.png   (plateau 1)
metadata/plate_2.png   (plateau 2)
metadata/plate_N.png   (plateau N)
```

**Algorithme de sélection** :
1. Récupérer `plateIndex` depuis `print.plate_idx` / `print.plate_index` / `print.cur_plate`
2. Tenter `metadata/plate_{plateIndex}.png` puis `metadata/plate_{plateIndex+1}.png`
3. Si pas trouvé, prendre le premier fichier `metadata/plate_*.png` disponible

**Correspondance fichier .3mf** :
- Lister `/cache` et `/` via NLST
- Comparer le basename (sans extension) du champ `gcode_file`/`subtask_name`/`project_file` avec les fichiers `.3mf` disponibles
- Prendre le fichier `/cache/*.3mf` en priorité si plusieurs correspondent

```js
function pickCurrent3mfPath(allPaths, fileHint) {
  const files = allPaths.filter(p => p.toLowerCase().endsWith('.3mf'));
  if (!files.length) return null;

  const hintNoExt = basenameNoExt(fileHint).toLowerCase();
  if (hintNoExt) {
    const match = files.find(p => {
      const f = basenameNoExt(p).toLowerCase();
      return f === hintNoExt || f.includes(hintNoExt) || hintNoExt.includes(f);
    });
    if (match) return match;
  }

  const cacheFile = files.find(p => p.startsWith('/cache/'));
  return cacheFile ?? files[0];
}
```

**Fréquence de rafraîchissement** : ne re-fetcher que si le nom de fichier a changé, ou toutes les 30 secondes minimum.

---

## 12. Découverte réseau (SSDP + TLS scan)

Le scan utilise deux méthodes en parallèle.

### 12.1 SSDP (UPnP multicast)

| Paramètre | Valeur |
|-----------|--------|
| **Adresse multicast** | `239.255.255.250` |
| **Port** | `1900` (UDP) |
| **Search Target** | `urn:bambulab-com:device:3dprinter:1` |

**Requête M-SEARCH** (envoyée 2 fois à 120 ms d'intervalle) :

```
M-SEARCH * HTTP/1.1\r\n
HOST: 239.255.255.250:1900\r\n
MAN: "ssdp:discover"\r\n
MX: 1\r\n
ST: urn:bambulab-com:device:3dprinter:1\r\n
\r\n
\r\n
```

**Fenêtre d'écoute** : 4 secondes.

**Parsing de la réponse SSDP** (headers HTTP-like) :

| Header | Alias | Contenu |
|--------|-------|---------|
| `usn` | — | Serial number (après stripping UUID prefix et `::`) |
| `serial` | — | Serial number (fallback) |
| `devname.bambu.com` | `devname`, `friendlyname` | Nom de l'imprimante |
| `devmodel.bambu.com` | `devmodel`, `model` | Code modèle (ex. `C12`, `N2S`) |
| `devversion.bambu.com` | `devversion`, `firmware` | Version firmware |
| `devconnect.bambu.com` | `devconnect` | Mode connexion |
| `devbind.bambu.com` | `devbind` | État de bind |
| `devseclink.bambu.com` | `devseclink` | Lien sécurité |
| `devsignal.bambu.com` | `devsignal` | Force signal WiFi |
| `location` | — | IP (extraire du header Location URL) |

Normalisation du serial : supprimer tout caractère non alphanumérique.
Stripping USN : retirer le préfixe `uuid:` et tout ce qui suit `::`.

### 12.2 Scan TLS actif

Pour chaque IP à scanner, tenter une connexion TLS sur port `8883` (timeout 260 ms). Si le certificat contient dans son `subject` ou `issuer` le mot `bambu` ou `bbl`, c'est une imprimante Bambu.

Extraire le serial depuis le CN du certificat :
```
Subject: CN=00M09A123456789, O=Bambu Lab
```

**Sous-réseaux par défaut scannés** :
- Le sous-réseau de l'interface WiFi active
- `192.168.0.x`
- `192.168.1.x`
- `192.168.40.x`

**Taille des batches** : 24 connexions parallèles.

### 12.3 Résolution modèle depuis code ou serial

**Par code modèle SSDP** :

| Code | Modèle ID | Nom |
|------|-----------|-----|
| `N2S` | 2 | A1 |
| `N1` | 1 | A1 Mini |
| `C11` | 4 | P1P |
| `C12` | 3 | P1S |
| `C13` | 6 | X1E |
| `N7` | 10 | P2S |
| `00M` | 5 | X1C |
| `O1D` | 8 | H2D |
| `O1C` | 11 | H2C |
| `O1S` | 7 | H2S |
| `O1E` | 9 | H2D Pro |

**Par préfixe du serial (3 premiers chars)** :

| Préfixe | Modèle ID | Nom |
|---------|-----------|-----|
| `039` | 2 | A1 |
| `030` | 1 | A1 Mini |
| `01S` | 4 | P1P |
| `01P` | 3 | P1S |
| `22E` | 10 | P2S |
| `03W` | 6 | X1E |
| `00M` | 5 | X1C |

---

## 13. Persistance et synchronisation des configurations

La configuration de chaque imprimante est stockée localement (JSON) et optionnellement synchronisée dans Firebase Firestore sous `users/{uid}/printers/bambulab/devices/{printerId}`.

### 13.1 Objet `PrinterConfig`

```json
{
  "id": "1700000000000_5432",
  "printerName": "Mon X1C",
  "broker": "192.168.1.42",
  "serialNumber": "00M09A123456789",
  "password": "12345678",
  "printerModelId": "5",
  "isActive": true,
  "sortIndex": 0,
  "updatedAt": 1700000000000
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string | ID unique local (timestamp + random) |
| `printerName` | string | Nom affiché |
| `broker` | string | IP de l'imprimante |
| `serialNumber` | string | Numéro de série (utilisé dans les topics MQTT) |
| `password` | string | Access Code |
| `printerModelId` | string | ID du modèle (1–11, voir §12.3) |
| `isActive` | bool | `true` = connexion active |
| `sortIndex` | int | Ordre dans la liste |
| `updatedAt` | int | Timestamp ms (pour merge local/cloud) |

### 13.2 Merge hybride local / Firestore

Règle de résolution de conflit : **le plus récent (`updatedAt`) gagne**.

---

## 14. Gestion des erreurs

| Situation | Action |
|-----------|--------|
| Connexion MQTT timeout (> 10 s) | Afficher état `Disconnected`, ne pas retry automatiquement |
| `client.onDisconnected` | Mettre `isConnected = false`, afficher status |
| Certificat TLS invalide | Ignorer (`rejectUnauthorized: false`), toujours accepter |
| Message MQTT non parsable (JSON invalide) | Logger l'erreur, ignorer le message |
| `gcode_state=FAILED` + autre champ `idle` | Retourner `idle` (règle spéciale §7) |
| `vt_tray` présent sans `ams` dans un message partiel | Envoyer un `pushall` pour récupérer l'état AMS complet |
| FTPS connexion timeout (> 8 s) | Logger, ignorer, réessayer au prochain changement de fichier |
| Thumbnail fetch : frame JPEG invalide (pas 0xFF 0xD8) | Ignorer la frame, continuer la lecture |
| Scan TLS : faux positifs port 8883 | Ne garder que les certs avec `bambu` ou `bbl` dans subject/issuer, ou modèle résolu |
| `pushall` sans réponse | Timer 5 s puis retry `pushall` |

---

## 15. Checklist d'implémentation

### Connexion
- [ ] TLS sur port 8883, `rejectUnauthorized: false`
- [ ] Username fixe `bblp`, password = Access Code
- [ ] Subscribe `device/{serialNumber}/report` (QoS 1)
- [ ] Envoyer `get_version` après connexion
- [ ] Envoyer `pushall` après connexion
- [ ] Timer 5 s de refresh si aucun message reçu

### Parsing des messages
- [ ] Extraire `print` block
- [ ] Parser `gcode_state` avec fallbacks et règle FAILED/idle
- [ ] Parser `mc_percent` (progression 0–100)
- [ ] Parser `mc_print_stage` (`0` = pas d'impression)
- [ ] Parser `layer_num` / `total_layer_num`
- [ ] Parser `remaining_time` ou `mc_remaining_time`
- [ ] Parser `subtask_name` / `gcode_file` / `project_file`
- [ ] Parser `plate_idx` / `plate_index` / `cur_plate`

### Températures
- [ ] Supporter les deux formats (direct et packed 32-bit)
- [ ] Décodage `decodePackedTemp32()` pour device.extruder/bed/ctc
- [ ] Fallback sur `nozzle_temper`, `bed_temper`, `chamber_temper`

### AMS / Filaments
- [ ] Parser `ams.ams[]` (liste de modules)
- [ ] Parser `ams.ams[].tray[]` (slots, couleur, type)
- [ ] Détecter slot actif : `is_active === true` OU `state === 11`
- [ ] Supporter `vt_tray` (anciens firmwares) et `vir_slot[0]` (nouveaux)
- [ ] Décoder couleur RRGGBBAA hex
- [ ] Commande `ams_filament_setting` (AMS et bobine externe)

### Caméra
- [ ] Déterminer transport par modèle ID (JPEG TCP vs RTSP)
- [ ] RTSP : construire URL `rtsps://bblp:{pass}@{ip}:322/streaming/live/1`
- [ ] JPEG TCP : TLS port 6000, auth packet 80 octets, lire frames
- [ ] Vérifier signature JPEG (0xFF 0xD8 / 0xFF 0xD9)

### Miniature
- [ ] FTPS implicite port 990, TLS, `bblp` / Access Code
- [ ] Séquence : `TYPE I` → `PBSZ 0` → `PROT P` → `PASV` → `NLST /cache` → `NLST /` → `RETR`
- [ ] Unzip `.3mf` → extraire `metadata/plate_{N}.png`
- [ ] Ne pas re-fetcher si même fichier dans les 30 dernières secondes

### Découverte
- [ ] SSDP multicast UDP `239.255.255.250:1900`, ST `urn:bambulab-com:device:3dprinter:1`
- [ ] Envoyer M-SEARCH 2 fois (intervalle 120 ms), écouter 4 s
- [ ] Parser headers SSDP (devname, devmodel, devversion, etc.)
- [ ] TLS scan port 8883 par batches de 24, timeout 260 ms
- [ ] Valider par certificat (bambu/bbl dans subject/issuer)
- [ ] Résoudre modèle par code SSDP ou préfixe serial

### Contrôle
- [ ] Implémenter pause / resume / stop
- [ ] Incrémenter `sequence_id`, reset à 4086

### Persistance
- [ ] Stocker `PrinterConfig` en JSON local
- [ ] Merge hybride local/Firestore par `updatedAt`

---

## Annexe A — Modèles et IDs

| Model ID | Nom | Protocole caméra | Préfixe serial | Code SSDP |
|----------|-----|------------------|----------------|-----------|
| 1 | A1 Mini | JPEG TCP | `030` | `N1` |
| 2 | A1 | JPEG TCP | `039` | `N2S` |
| 3 | P1S | JPEG TCP | `01P` | `C12` |
| 4 | P1P | JPEG TCP | `01S` | `C11` |
| 5 | X1C | RTSP | `00M` | `00M` / `3DPRINTER-X1-CARBON` |
| 6 | X1E | RTSP | `03W` | `C13` |
| 7 | H2S | RTSP | — | `O1S` |
| 8 | H2D | RTSP | — | `O1D` |
| 9 | H2D Pro | RTSP | — | `O1E` |
| 10 | P2S | RTSP | `22E` | `N7` |
| 11 | H2C | RTSP | — | `O1C` |

---

## Annexe B — Champs de nom de fichier imprimé

Chercher dans cet ordre dans le bloc `print` :

1. `gcode_file`
2. `subtask_name`
3. `project_file`
4. `project_name`
5. `filename`
6. `file`
7. `task_name`
8. `job_name`
9. `ipcam.file_name` (fallback)

Décoder URI (`decodeURIComponent`) avant utilisation.
