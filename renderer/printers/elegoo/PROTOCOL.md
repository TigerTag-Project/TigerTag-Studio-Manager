# Elegoo MQTT — Agent Skill

**Rôle de ce document** : référence autonome pour qu'un agent IA implémente l'intégration Elegoo dans Tiger Studio Manager sans avoir besoin du fichier Flutter source. Toutes les valeurs, structures et règles viennent de `elegoo_mqtt_page.dart` + `elegoo_scan_printers.dart` (TigerTag Connect Flutter).

---

## 1. Paramètres de connexion

| Paramètre | Valeur |
|---|---|
| Transport | MQTT plain TCP (pas de TLS) |
| Port | **1883** |
| Username | `"elegoo"` (fixe pour tous les modèles) |
| Password | `"123456"` par défaut — peut être surchargé par l'utilisateur ("Access Code") |
| keepAlive | 60 s |
| clientId | `"TTG_XXXX"` — préfixe `TTG_` + 4 chiffres aléatoires (1000–9999) |
| requestId | `"${clientId}_req"` — utilisé comme suffixe dans le topic register_response |
| SN requis | Oui — le numéro de série est obligatoire avant toute connexion |

Génération du clientId (JS) :
```js
const clientId = `TTG_${Math.floor(1000 + Math.random() * 9000)}`;
const requestId = `${clientId}_req`;
```

---

## 2. Structure des topics

Toutes les variables :
- `{sn}` = serial number de l'imprimante
- `{cid}` = clientId généré (`TTG_XXXX`)
- `{rid}` = requestId (`TTG_XXXX_req`)

### Subscribe (à l'ouverture de connexion)

| Topic | Rôle |
|---|---|
| `elegoo/{sn}/api_status` | **Push live** — broadcaster vers tous les clients ; méthode 6000 en continu |
| `elegoo/{sn}/{cid}/api_response` | **Réponses unicast** — réponses aux commandes envoyées par ce client |
| `elegoo/{sn}/{rid}/register_response` | **Ack registration** — observé live : topic = `{sn}/{requestId}/register_response` (ex. `F01PLJ.../TTG_1234_reg/register_response`) |

### Publish (commandes vers l'imprimante)

| Topic | Rôle |
|---|---|
| `elegoo/{sn}/api_register` | Envoyer la demande d'enregistrement |
| `elegoo/{sn}/{cid}/api_request` | Envoyer toutes les commandes/requêtes |

---

## 3. Séquence d'initialisation

> **Observée live par sniffer MQTT** — le slicer Elegoo officiel utilise deux clients distincts.
> Tiger Studio n'en utilise qu'un seul (plus simple, suffisant).

### Séquence du slicer Elegoo (référence ISO, observée live)

Le slicer ouvre **deux connexions MQTT simultanées** :

**Client 1 — contrôle imprimante** (client_id = `"1_PC_4447"`, PING toutes les ~10 s)
```
PUB elegoo/{sn}/api_register  {"client_id":"1_PC_4447","request_id":"1_PC_4447_req"}
SUB elegoo/{sn}/1_PC_4447_req/register_response  → {"client_id":"1_PC_4447","error":"ok"}

PUB method:1043  {"hostname":"Elegoo Centauri Carbon 2"}   ← PREMIÈRE commande obligatoire
PUB method:1002  {}
PUB method:1001  {}
```

**Client 2 — fichiers + filaments** (client_id = `"0cli7ebbb5"`, PING toutes les ~45 s)
```
PUB elegoo/{sn}/api_register  {"request_id":"0cli7ebbb5","client_id":"0cli7ebbb5"}
                                ↑ request_id == client_id (format différent du client 1)
SUB elegoo/{sn}/0cli7ebbb5/register_response  → {"client_id":"0cli7ebbb5","error":"ok"}

PUB method:1036  {}                                      ← historique
PUB method:2005  {}                                      ← canvas filaments
PUB method:1044  {"storage_media":"local","offset":0,"limit":20}
PUB method:1002  {}
PUB method:1044  {"storage_media":"u-disk","dir":"/","offset":0,"limit":20}
PUB method:1001  {}
PUB method:1042  {}                                      ← URL caméra
PUB method:1061  {}                                      ← mono filament
```

### Séquence Tiger Studio (client unique)

```
1. Créer clientId + requestId
   clientId  = "TTG_XXXX"  (4 chiffres aléatoires)
   requestId = "TTG_XXXX_req"

2. Connecter MQTT (host, port 1883, user="elegoo", password, keepAlive=60s)

3. SUB elegoo/{sn}/api_status
   SUB elegoo/{sn}/{cid}/api_response
   SUB elegoo/{sn}/{cid}_req/register_response
   SUB elegoo/{sn}/{rid}/register_response

4. PUB elegoo/{sn}/api_register
   { "client_id": "{cid}", "request_id": "{rid}" }

5. Sur register_response OU timeout 1200 ms → envoyer la rafale initiale (§4)
   (La rafale ne s'envoie qu'une fois par connexion — guard _initSnapshotSent)

6. PING/PONG toutes les 10 s (voir §11 Règles communes)
```

**Register_response observé live** (CC2, SN F01PLJ817DP6Y5Z) :

```
PUB  elegoo/F01PLJ.../api_register
     { "client_id": "TTG_1234", "request_id": "TTG_1234_req" }

SUB  elegoo/F01PLJ.../TTG_1234_req/register_response
     { "client_id": "TTG_1234", "error": "ok" }
```

`"error": "ok"` signifie succès (champ nommé de manière contre-intuitive). Toute valeur différente de `"ok"` indique un refus.

---

## 4. Rafale d'initialisation (snapshot burst)

> **⚠️ Attention** : les IDs de méthodes du document Flutter source ne correspondent pas
> au firmware Centauri Carbon 2 (testé en live). Tableau corrigé ci-dessous.
> **Ordre calé sur le slicer Elegoo officiel** — observé live par sniffer MQTT.

Envoyer dans l'ordre, avec **50 ms de délai entre chaque** :

| Ordre | Method | Params | Rôle réel (vérifié live) |
|---|---|---|---|
| 1 | `1043` | `{"hostname":"TigerTag Studio"}` | **Obligatoire en premier** — annonce l'identité du client ; le slicer l'envoie toujours avant toute autre commande |
| 2 | `1002` | `{}` | Status complet : extruder/bed/chamber temp + targets + fans + print_status + machine_status (§5.1) |
| 3 | `1005` | `{}` | print_status seul (state, filename, uuid, current_layer, remaining_time_sec) (§5.2) |
| 4 | `2005` | `{}` | Filament canvas 4-slots — ou vide si Canvas déconnecté (§8) |
| 5 | `1061` | `{}` | Filament mono-extruder — fallback quand Canvas absent (§8.2) |
| 6 | `1042` | `{}` | URL caméra dynamique → `{"url":"http://{ip}:8080/?action=stream"}` (§12) |
| 7 | `1001` | `{}` | Info machine : hostname, ip, sn, firmware (§4.1) |
| 8 | `1044` | `{"storage_media":"local","offset":0,"limit":50}` | Liste fichiers + total layers (§10) |

### 4.1 Method 1001 — Machine info

**Payload response** (observé live CC2) :
```json
{
  "id": 6,
  "method": 1001,
  "result": {
    "error_code": 0,
    "hardware_version": "",
    "hostname": "Elegoo Centauri Carbon 2",
    "ip": "192.168.40.113",
    "machine_model": "Centauri Carbon 2",
    "protocol_version": "1.0.0",
    "sn": "F01PLJ817DP6Y5Z",
    "software_version": {
      "mcu_version": "00.00.00.00",
      "ota_version": "01.03.02.51",
      "soc_version": ""
    }
  }
}
```

Utile pour afficher la version firmware (`ota_version`) et confirmer le modèle.

### 4.2 Method 1043 — Set hostname

Annonce l'identité du client à l'imprimante. Le slicer l'envoie **en premier**, avant toute autre requête.

```json
{ "id": 1, "method": 1043, "params": { "hostname": "TigerTag Studio" } }
```

Réponse : `{"error_code": 0}`. L'imprimante connaît désormais le nom du client connecté.

### 4.3 Autres méthodes connues

| Method | Retour réel observé |
|---|---|
| `1003` | machine_status seul (progress, status, sub_status) |
| `1004` | État des ventilateurs |
| `1020` | Démarrer une impression — voir §15 |
| `1021` | Pause impression — voir §15 |
| `1022` | Reprise impression — voir §15 |
| `1023` | Annuler impression — voir §15 |
| `1024` | Inconnu — appelé lors de l'inspection/édition filament — voir §18 |
| `1025` | Inconnu — appelé lors de l'inspection/édition filament — voir §18 |
| `1026` | Homing axes — voir §16 |
| `1027` | Jog axes — voir §16 |
| `1029` | Contrôle LED — voir §17 |
| `1030` | Contrôle ventilateurs — voir §17 |
| `1031` | Mode vitesse — voir §17 |
| `1036` | Historique des tâches d'impression (30 dernières) — voir §4.4 |
| `1046` | Métadonnées d'un fichier individuel (color_map, layers, size…) — voir §4.5 |

### 4.4 Method 1036 — Historique

Retourne les 30 dernières tâches d'impression. Chaque entrée :
```json
{
  "task_id":    "2250ae9f-04fb-4057-...",
  "task_name":  "ECC2_0.4_Hook_Elegoo PLA Matte_0.2_39m3s.gcode",
  "task_status": 1,
  "begin_time": 1771806960,
  "end_time":   1771810040,
  "time_lapse_video_url": "picture/ECC2_0.4_Hook...gcode20260223083602"
}
```
`task_status` : `1` = succès, `2` = annulé/échoué.

### 4.5 Method 1046 — Métadonnées fichier individuel

Retourne les détails d'un seul fichier (sans télécharger le gcode).

**Request** :
```json
{
  "id": 15,
  "method": 1046,
  "params": {
    "storage_media": "u-disk",
    "filename": "/3.Model/7.Scraper/ECC2_0.4_Scraper_Elegoo PLA _0.2_1h22m.gcode"
  }
}
```

**Response** :
```json
{
  "id": 15,
  "method": 1046,
  "result": {
    "error_code": 0,
    "color_map": [
      {"color": "#000000", "name": "PLA", "t": 0},
      {"color": "#FFFFFF", "name": "PLA", "t": 1}
    ],
    "create_time": 1760665590,
    "filename": "ECC2_0.4_Scraper_Elegoo PLA _0.2_1h22m.gcode",
    "layer": 225,
    "print_time": 4942,
    "size": 6003025,
    "total_filament_used": 42.11
  }
}
```

Enveloppe d'une requête :
```json
{ "id": <int incrémental>, "method": <int>, "params": {} }
```

**Polling périodique recommandé :** re-demander method `1005` toutes les **10 s**
car le push 6000 n'envoie jamais print_status — seulement les températures.

---

## 5. Méthodes de poll — Payloads live observés

### 5.1 Method 1002 — Snapshot complet (CC2, imprimante idle)

> Observé live sur Centauri Carbon 2 (SN F01PLJ817DP6Y5Z, firmware production).

```json
{
  "id": 3,
  "method": 1002,
  "result": {
    "error_code": 0,
    "external_device": {
      "camera": true,
      "type": "0",
      "u_disk": true
    },
    "extruder": {
      "filament_detect_enable": 1,
      "filament_detected": 0,
      "target": 0,
      "temperature": 28
    },
    "fans": {
      "aux_fan":        { "speed": 0.0 },
      "box_fan":        { "speed": 0.0 },
      "controller_fan": { "speed": 0.0 },
      "fan":            { "speed": 0.0 },
      "heater_fan":     { "speed": 0.0 }
    },
    "gcode_move": {
      "extruder":   0.0,
      "speed":      1500,
      "speed_mode": 1,
      "x": 5.0,
      "y": 5.0,
      "z": 0.122114
    },
    "heater_bed": { "target": 0, "temperature": 23 },
    "led":        { "status": 1 },
    "machine_status": {
      "exception_status": [],
      "progress": 0,
      "status": 1,
      "sub_status": 0,
      "sub_status_reason_code": 0
    },
    "print_status": {
      "bed_mesh_detect":   false,
      "current_layer":     0,
      "enable":            false,
      "filament_detect":   false,
      "filename":          "",
      "print_duration":    0,
      "remaining_time_sec": 0,
      "state":             "",
      "total_duration":    0,
      "uuid":              ""
    },
    "tool_head": { "homed_axes": "" },
    "ztemperature_sensor": {
      "measured_max_temperature": 0,
      "measured_min_temperature": 0,
      "temperature": 24
    }
  }
}
```

**Champs notables** :
- `external_device.camera` — `true` si caméra connectée ; `type:"0"` = USB cam
- `external_device.u_disk` — `true` si clé USB insérée
- `extruder.filament_detect_enable` / `filament_detected` — détection filament (`0` = absent)
- `gcode_move.speed_mode` — `1` = normal, `2` = silencieux, `3` = sport (hypothèse)
- `led.status` — `1` = LED allumée
- `tool_head.homed_axes` — `"xyz"` si homé, `""` si pas encore homé
- `ztemperature_sensor.measured_max/min_temperature` — extremes chambre historiques

### 5.2 Method 1005 — print_status seul (CC2, imprimante idle)

```json
{
  "id": 84,
  "method": 1005,
  "result": {
    "error_code": 0,
    "print_status": {
      "bed_mesh_detect":    false,
      "current_layer":      0,
      "enable":             false,
      "filament_detect":    false,
      "filename":           "",
      "print_duration":     0,
      "remaining_time_sec": 0,
      "state":              "",
      "total_duration":     0,
      "uuid":               ""
    }
  }
}
```

`print_status.enable` vaut `false` quand aucune impression n'est en cours.  
`print_status.state = ""` → mapper vers `"standby"` (voir §7.1).

---

## 6. Method 6000 — Push live `api_status`

Le push principal. L'imprimante l'envoie en continu sur `elegoo/{sn}/api_status`.

> **⚠️ Comportement réel (vérifié live)** : le push 6000 n'envoie que les champs
> dont la valeur **vient de changer**. En pratique : uniquement les températures
> (`extruder.temperature`, `heater_bed.temperature`). Les champs `print_status`,
> `machine_status.progress`, et `ztemperature_sensor` ne sont jamais poussés.
> Utiliser method `1005` (poll 10 s) pour print_status et method `1002` pour le snapshot complet.

### Payload observé en idle (imprimante en veille)

```json
{ "id": 4217, "method": 6000, "result": { "heater_bed": { "temperature": 24 } } }
```

En idle, seule la température du plateau est poussée (toutes les secondes). L'extrudeur à température ambiante n'est pas inclus quand sa valeur est stable.

### Payload observé (pendant une impression active)

```json
{
  "id": 1087,
  "method": 6000,
  "result": {
    "extruder":       { "temperature": 210 },
    "gcode_move":     { "extruder": 1.26, "speed": 7474, "x": 122.1, "y": 138.3, "z": 9.0 },
    "machine_status": { "progress": 27 },
    "print_status":   {
      "current_layer": 45,
      "print_duration": 472,
      "remaining_time_sec": 1166,
      "total_duration": 529
    }
  }
}
```

> **Correction par rapport à la doc Flutter** : le push 6000 envoie bien plus que les températures.
> Il pousse `machine_status.progress` (progression %), `print_status.current_layer`,
> `remaining_time_sec`, `total_duration` et `gcode_move.*` à chaque seconde.
> Ce qui n'est **jamais** dans le push 6000 : `print_status.state`, `print_status.uuid`,
> `print_status.filename`, `heater_bed` (quand le bed est à température stable).

### Push filament — changement depuis l'écran tactile

**Observé live** : quand l'utilisateur change le filament depuis l'écran de l'imprimante (sans passer par le slicer), l'imprimante pousse immédiatement un message 6000 via `api_status` contenant `mono_filament_info` :

```json
{
  "id": 3083,
  "method": 6000,
  "result": {
    "mono_filament_info": {
      "filament_code":  "0x0A00",
      "filament_color": "#A03BF7",
      "filament_name":  "EVA",
      "filament_type":  "EVA",
      "max_nozzle_temp": 220,
      "min_nozzle_temp": 220
    }
  }
}
```

→ Traiter ce cas dans le handler `api_status` : si `result.mono_filament_info` est présent, appeler `_mergeMonoFilament` en plus de `_mergeStatus`.  
→ De même pour `result.canvas_info` si le Canvas est connecté et que l'utilisateur change un slot depuis l'écran.

### Champs poussés par method 6000 (observés en live)

Le push 6000 n'envoie que les champs dont la valeur vient de changer. Les champs absents conservent leur dernière valeur connue.

| Chemin JSON | Clé interne | Fréquence |
|---|---|---|
| `result.extruder.temperature` | `nozzleTemp` | À chaque changement °C |
| `result.heater_bed.temperature` | `bedTemp` | À chaque changement °C (absent quand stable) |
| `result.ztemperature_sensor.temperature` | `chamberTemp` | À chaque changement °C |
| `result.machine_status.progress` | `printProgress` (÷100) | **Quand le % change** — toutes les ~15–17 s en pratique |
| `result.print_status.current_layer` | `printLayerCur` | **Quand la couche change** uniquement |
| `result.print_status.remaining_time_sec` | `printRemainingMs` (×1000) | La plupart des pushes (absent si inchangé) |
| `result.print_status.total_duration` | `printDuration` | La plupart des pushes |
| `result.print_status.print_duration` | *(non stocké)* | Durée écoulée (s) |
| `result.gcode_move.x/y/z` | *(non stocké)* | Position tête mm (présent quand change) |
| `result.gcode_move.speed` | *(non stocké)* | Vitesse mm/min (présent quand change) |
| `result.gcode_move.extruder` | *(non stocké)* | Position extrudeur mm |

> **Correction** : `print_status.state`, `print_status.uuid` et `print_status.filename` **sont** poussés par 6000 au démarrage d'une impression (transition d'état). En cours d'impression, seuls les champs qui changent apparaissent (progress, layer, remaining). Ne jamais les considérer comme "absents définitivement" — les mettre en cache à la première réception.
> `machine_status.progress` est le seul champ progress disponible — `print_status.progress` n'existe pas.

### Champs disponibles seulement via poll (method 1002 / 1005)

| Chemin JSON (method 1002 result) | Clé interne |
|---|---|
| `result.extruder.temperature` / `.target` | `nozzleTemp` |
| `result.heater_bed.temperature` / `.target` | `bedTemp` |
| `result.ztemperature_sensor.temperature` | `chamberTemp` |
| `result.print_status.state` | `printState` |
| `result.print_status.current_layer` | `printLayerCur` |
| `result.print_status.remaining_time_sec` | `printRemainingMs` (×1000) |
| `result.print_status.total_duration` | `printDuration` (secondes) |
| `result.print_status.filename` | `printFilename` |
| `result.print_status.uuid` | `printUuid` |
| `result.machine_status.status` | *(derive printState — voir §7.2)* |
| `result.machine_status.sub_status` | *(derive printState — voir §7.2)* |
| `result.machine_status.progress` | `printProgress` (0–1) |
| `result.machine_status.exception_status` | `lastException` (tableau int) |
| `result.external_device.camera` | *(non stocké)* | `true` si caméra connectée |
| `result.extruder.filament_detected` | *(non stocké)* | `1` = filament présent |
| `result.extruder.target` | *(non stocké)* | Température cible buse (°C) |
| `result.heater_bed.target` | *(non stocké)* | Température cible plateau (°C) |
| `result.led.status` | *(non stocké)* | `1` = LED allumée |
| `result.tool_head.homed_axes` | *(non stocké)* | `"xyz"` si axes homés |
| `result.ztemperature_sensor.measured_max_temperature` | *(non stocké)* | Max chambre historique |

### 6.1 Champs additionnels poussés occasionnellement par 6000

Le push 6000 peut inclure d'autres champs lors de changements — tous ignorés sauf temperatures.
Documentés ici pour référence :

```json
{
  "result": {
    "extruder":            { "temperature": 210 },
    "heater_bed":          { "temperature": 60 },
    "ztemperature_sensor": { "temperature": 28 },
    "gcode_move":          { "extruder": 1.26, "speed": 7474, "x": 122.1, "y": 138.3, "z": 9.0 },
    "machine_status":      { "progress": 28 },
    "print_status": {
      "current_layer": 46,
      "print_duration": 491,
      "remaining_time_sec": 1149,
      "total_duration": 548
    }
  }
}
```

> Tous ces champs sont **optionnels** dans chaque push — seuls les champs qui ont changé sont inclus.
> Un push typique ne contient que 2–4 champs (ex. température + gcode_move + print_status partiel).

**Fans** — présents dans method 1002 ET poussés par 6000 quand la vitesse change :
```json
{
  "fans": {
    "aux_fan":        { "speed": 0.0   },
    "box_fan":        { "speed": 25.5  },
    "controller_fan": { "speed": 255.0 },
    "fan":            { "speed": 252.0 },
    "heater_fan":     { "speed": 255.0 }
  }
}
```
**LED** — également poussée par 6000 quand l'état change : `{"result":{"led":{"status":1}}}`

**Targets températures** — `extruder.target` et `heater_bed.target` sont poussés par 6000 au démarrage de la chauffe.

Ces champs sont **ignorés** dans l'implémentation actuelle — seules températures + progress + layer sont extraits.

---

## 7. États d'impression

### 7.1 `print_status.state` (method 1002 / 1005)

> **⚠️ Observation critique (live)** : quand l'impression est terminée ou que l'imprimante est en veille,
> `print_status.state` vaut `""` (chaîne vide), **pas** `"standby"` ou `"idle"`.
> Toujours utiliser `'state' in ps` pour détecter la présence du champ, et mapper `""` → `"standby"`.

```js
// Code correct
if ('state' in ps) {
  const rawState = String(ps.state).toLowerCase().trim();
  d.printState = rawState || 'standby';   // '' → 'standby'
}
```

| Valeur `print_status.state` | Signification | UI |
|---|---|---|
| `"printing"` | Impression en cours | Barre de progression + spinner |
| `"running"` | Alias printing | Idem |
| `"busy"` | Alias actif | Idem |
| `"paused"` | En pause | Badge "Paused" |
| `"preparing"` | Préparation / chauffe | Spinner |
| `"heating"` | Phase de chauffe | Spinner |
| `"complete"` | Terminé | Masquer progress card |
| `"completed"` | Alias complete | Idem |
| `"cancelled"` / `"canceled"` | Annulé | Masquer progress card |
| `"standby"` / `""` | Inactif / veille (≈ even empty string) | Masquer progress card |
| `"error"` / `"failed"` | Erreur | Badge "Error" |

Regroupements utiles :
```js
const ELEGOO_ACTIVE  = ["printing","running","busy","preparing","heating"];
const ELEGOO_PAUSED  = ["paused"];
const ELEGOO_DONE    = ["complete","completed","cancelled","canceled","standby"];
```

### 7.2 `machine_status` — codes observés en live

Disponible via method 1002 et 1003. Utiliser en fallback quand `print_status.state` est absent.

**`machine_status.status`**

| Code | Signification | printState dérivé |
|------|--------------|------------------|
| `1`  | Standby / idle | `"standby"` |
| `2`  | Actif (impression / chauffe) | voir `sub_status` |
| `3`  | Séquence de fin (purge, nettoyage) | `"printing"` (encore actif) |
| `14` | Erreur / exception | `"error"` |

**`machine_status.sub_status`**

| Code | Phase | printState dérivé |
|------|-------|------------------|
| `0`    | Idle | `"standby"` |
| `1066` | Impression active (phase 1) | `"printing"` |
| `2075` | Impression active (phase 2 / vitesse variable) | `"printing"` |
| `1155` | Finishing | `"printing"` |
| `1156` | Purge / wipe | `"printing"` |
| `1157` | Nettoyage final | `"printing"` |
| `2901` | Phase de chauffe | `"heating"` |

> **Note** : plusieurs codes `sub_status` correspondent à "impression active" (1066, 2075…).
> Ne pas tester l'égalité exacte pour détecter une impression — utiliser `machine_status.status === 2`.
> `sub_status_reason_code` est toujours `0` dans les observations.

**Champs complets de `machine_status` (method 1002)**

```json
{
  "machine_status": {
    "exception_status": [],
    "progress": 35,
    "status": 2,
    "sub_status": 2075,
    "sub_status_reason_code": 0
  }
}
```

**`machine_status.exception_status`** — tableau d'entiers, vide en temps normal.

| Code observé | Situation |
|---|---|
| `[803]` | Erreur pendant l'impression (possiblement détection filament) |

### 7.3 Cycle de vie complet (observé en live — Centauri Carbon 2)

```
Démarrage impression :
  machine_status.status=2, sub_status=2901
  print_status.state="printing", progress=0, current_layer=0
  → nozzle target monte à 140°, bed à 60°

Impression active :
  machine_status.status=2, sub_status=1066
  6000 push : uniquement températures (nozzle/bed)
  → poll 1005 toutes les 10 s pour progress + current_layer

Séquence de fin :
  machine_status.exception_status=[803]     ← erreur / alerte
  machine_status.status=14                  ← état erreur
  machine_status.status=3, sub_status=1155  ← finishing
  machine_status.status=3, sub_status=1156  ← purge / wipe
  machine_status.status=3, sub_status=1157  ← nettoyage final
  machine_status.status=1, sub_status=0     ← retour standby
  print_status.state=""                     ← chaîne vide = done
```

---

## 8. Filament — Method 2005 response

### Payload response

```json
{
  "method": 2005,
  "result": {
    "canvas_info": {
      "canvas_list": [
        {
          "canvas_id": 0,
          "tray_list": [
            {
              "tray_id": 0,
              "filament_color": "#FF5733",
              "filament_type": "PLA",
              "brand": "ELEGOO",
              "filament_name": "PLA Silk",
              "filament_code": "0x0000",
              "min_nozzle_temp": 190,
              "max_nozzle_temp": 230,
              "status": 1
            }
          ]
        }
      ]
    }
  }
}
```

Lire `canvas_list[0].tray_list` (4 entrées, tray_id 0–3).  
Si `canvas_list` est absent → fallback sur arrays plats dans `params` (§8.1).

### Canvas déconnecté — champ `connected`

Quand le hub Canvas multi-filament est débranché, `canvas_list[0].connected = 0` et tous les slots ont des chaînes vides :

```json
{
  "method": 2005,
  "result": {
    "canvas_info": {
      "active_canvas_id": 0,
      "active_tray_id": -1,
      "auto_refill": false,
      "canvas_list": [{
        "canvas_id": 0,
        "connected": 0,
        "tray_list": [
          {"brand":"","filament_code":"","filament_color":"","filament_name":"","filament_type":"","max_nozzle_temp":0,"min_nozzle_temp":0,"status":0,"tray_id":0},
          {"brand":"","filament_code":"","filament_color":"","filament_name":"","filament_type":"","max_nozzle_temp":0,"min_nozzle_temp":0,"status":0,"tray_id":0},
          {"brand":"","filament_code":"","filament_color":"","filament_name":"","filament_type":"","max_nozzle_temp":0,"min_nozzle_temp":0,"status":0,"tray_id":0},
          {"brand":"","filament_code":"","filament_color":"","filament_name":"","filament_type":"","max_nozzle_temp":0,"min_nozzle_temp":0,"status":0,"tray_id":0}
        ]
      }]
    },
    "error_code": 0
  }
}
```

Dans ce cas : ne pas utiliser les données du `tray_list` vide. Envoyer la méthode **1061** à la place pour obtenir les infos de l'extrudeur unique (§8.2).

### Champs par slot

| JSON key | Type | Rôle |
|---|---|---|
| `tray_id` | `int` 0–3 | Index du slot |
| `filament_color` | `string` `#RRGGBB` | Couleur |
| `filament_type` | `string` | Type de base (`PLA`, `PETG`, …) |
| `brand` | `string` | Vendeur |
| `filament_name` | `string` | Nom complet / série |
| `filament_code` | `string` | Code matériau (`0x0000` = inconnu) |
| `min_nozzle_temp` | `int` °C | Température minimum buse |
| `max_nozzle_temp` | `int` °C | Température maximum buse |
| `status` | `int` | 1 = slot actif, 0 = vide |

### 8.1 Fallback — arrays plats (certains firmwares)

Certains firmwares poussent les données filament sous forme de tableaux de 4 éléments dans `params` :
```json
{
  "params": {
    "filament_color":    ["#FF5733","#00FF00","",""],
    "filament_type":     ["PLA","PETG","",""],
    "filament_vendor":   ["ELEGOO","Generic","",""],
    "filament_name":     ["PLA Silk","","",""],
    "filament_code":     ["0x0000","","",""],
    "filament_min_temp": [190, 200, 0, 0],
    "filament_max_temp": [230, 250, 0, 0],
    "filament_status":   [1, 1, 0, 0]
  }
}
```
Toujours 4 éléments. Slot vide = string vide ou 0.

### 8.2 Mono-extruder — Method 1061 (Canvas déconnecté)

**Observé sur CC2 (hardware live, Canvas débranché) :**

```json
{
  "id": 2,
  "method": 1061,
  "result": {
    "error_code": 0,
    "mono_filament_info": {
      "brand": "ELEGOO",
      "filament_code": "0x0000",
      "filament_color": "#FFFFFF",
      "filament_name": "PLA",
      "filament_type": "PLA",
      "max_nozzle_temp": 230,
      "min_nozzle_temp": 190,
      "status": 0,
      "tray_id": 0
    }
  }
}
```

**Logique d'intégration :**
1. Toujours inclure `1061` dans le SNAPSHOT_BURST initial.
2. Dans le handler `2005` : si `canvas_list[0].connected === 0`, ne pas utiliser `tray_list`, déclencher `1061`.
3. Dans le handler `1061` : si `_canvasConnected !== true`, écrire `conn.data.filaments` comme un tableau d'un seul slot (traité comme `active: true`).
4. Format couleur : `#RRGGBB` (pas RRGGBBAA — contrairement à Snapmaker).

> **✅ Écriture possible via méthode 1055** — voir §11.2. `mono_filament_info` est bien
> modifiable via MQTT : le slicer Elegoo utilise la méthode `1055` (pas `2003` ni `1061`).
> Le refresh post-save doit envoyer `1061` (pas `2005`) pour lire la valeur mise à jour.

---

## 9. Thumbnail — Method 1045

> **⚠️ Observation live** : pendant la phase de chauffe, method 1045 retourne
> `{"error_code": 1003}` (not found). La miniature n'est disponible qu'une fois
> l'impression démarrée. Ne pas afficher d'erreur — réessayer après transition d'état.

### Request

```json
{
  "id": 4,
  "method": 1045,
  "params": {
    "file_name": "ECC2_0.4_The Buddha_Elegoo PLA _0.2_25m47s.gcode",
    "storage_media": "local"
  }
}
```

> **Note** : le paramètre correct est **`file_name`** + **`storage_media:"local"`**, pas `uuid`.
> `uuid` retourne toujours `error_code:1003`. Utiliser `print_status.filename` du snapshot 1005.
> Déclencher sur changement de `filename` (plus fiable que `uuid`).

### Response (succès)

```json
{
  "method": 1045,
  "result": {
    "thumbnail": "<base64 PNG string>"
  }
}
```

### Response (erreur — phase de chauffe ou aucune impression)

```json
{ "id": 1045, "method": 1045, "result": { "error_code": 1003 } }
```

**Règles de déclenchement** :
- Déclencher quand `print_status.uuid` change (nouvelle impression détectée)
- Throttle : minimum 1500 ms entre deux tentatives
- Sur `error_code 1003` : ne pas logguer comme erreur — simplement ignorer et réessayer au prochain changement d'UUID
- Mettre en cache le dernier thumbnail valide par imprimante

---

## 10. Total layers — Method 1044

> **⚠️ Observation live (Centauri Carbon 2)** : method 1044 retourne
> `{"error_code": 0}` avec une liste vide sur ce firmware. `total_layers`
> n'est pas disponible via cette méthode sur les firmwares observés.
> Afficher `— / —` pour les couches si la réponse est vide.

### Request

```json
{
  "id": 3,
  "method": 1044,
  "params": { "storage_media": "local", "offset": 0, "limit": 20 }
}
```

### Response (firmware avec layer list)

```json
{
  "method": 1044,
  "result": {
    "file_list": [
      { "filename": "benchy.gcode", "layer": 120, "size": 2048000 }
    ]
  }
}
```

### Response (Centauri Carbon 2 — firmware testé)

```json
{ "error_code": 0 }
```

Si `file_list` est absent ou vide, ne pas afficher de couche totale.
`current_layer` reste disponible via method 1005 → `print_status.current_layer`.

---

## 11. Écriture filament

Deux méthodes selon si le Canvas est connecté ou non — **observées live par sniffer MQTT sur le trafic du slicer Elegoo officiel**.

### 11.1 Canvas connecté — Method 2003

Écrit dans un slot du hub Canvas. Requiert que le Canvas soit physiquement branché — sans Canvas, `error_code: 1003` (INVALID_PARAMETER).

```json
{
  "id": 1,
  "method": 2003,
  "params": {
    "canvas_id": 0,
    "tray_id": 0,
    "brand": "ELEGOO",
    "filament_type": "PLA",
    "filament_name": "PLA",
    "filament_code": "0x0000",
    "filament_color": "#FF5733",
    "filament_min_temp": 190,
    "filament_max_temp": 230
  }
}
```

Après succès (`error_code === 0`), envoyer `2005` après 1000 ms pour rafraîchir.

### 11.2 Sans Canvas (mono-extruder) — Method 1055

**Observé live** : le slicer Elegoo utilise la méthode **1055** pour écrire le filament de l'extrudeur unique quand le Canvas n'est pas connecté. `error_code: 0` confirmé.

```json
{
  "id": 29,
  "method": 1055,
  "params": {
    "canvas_id": 0,
    "tray_id": 0,
    "brand": "ELEGOO",
    "filament_type": "PLA",
    "filament_name": "PLA",
    "filament_code": "0x0000",
    "filament_color": "#D4B1DD",
    "filament_min_temp": 190,
    "filament_max_temp": 230
  }
}
```

Après succès, envoyer `1061` après 1000 ms pour lire la valeur mise à jour.

**Exemples observés (sniffer) :**
```
method:1055  PLA  #D4B1DD  → error_code:0  ✅
method:1055  PETG #FFF242  filament_code:0x0100 → error_code:0  ✅
method:1055  PLA  #433089  → error_code:0  ✅
```

### Règles communes (2003 et 1055)
- `canvas_id` : toujours `0`
- `tray_id` : `0`–`3` (Canvas) ou `0` (mono)
- `filament_type` : type de base uniquement — supprimer les modificateurs. Ex. `"PLA+ Silk"` → `"PLA"`. Logique : split sur `/[\s+\-_\/]+/`, prendre le premier token.
- `filament_color` : `#RRGGBB` majuscules
- `filament_code` : `"0x0000"` si inconnu, `"0x0100"` = PETG observé
- `brand` : `"ELEGOO"` par défaut si inconnu
- `filament_name` : même valeur que `filament_type` si pas de nom complet

### PING/PONG — heartbeat applicatif

Le slicer envoie un heartbeat custom **en plus** du keepAlive MQTT standard.
**Recommandé** : sans PING/PONG, certains brokers Elegoo peuvent fermer la session.

```
PUB elegoo/{sn}/{cid}/api_request  {"type":"PING"}
SUB elegoo/{sn}/{cid}/api_response {"type":"PONG"}
```

Intervalles observés :
- Client contrôle (slicer principal) : **~10 s**
- Client fichiers/filaments : **~45 s**

Tiger Studio : implémenter à **10 s** (calé sur le client principal du slicer).
Ignorer les messages `{"type":"PONG"}` dans `_routeMessage` (pas de méthode numérique → `default: break`).

---

## 12. Caméra

### URL dynamique via Method 1042

Ne jamais hardcoder l'URL — la demander via method 1042 au démarrage :

```json
// Request
{ "id": 7, "method": 1042, "params": {} }

// Response (observé live CC2)
{ "id": 7, "method": 1042, "result": { "error_code": 0, "url": "http://192.168.40.113:8080/?action=stream" } }
```

Stocker l'URL retournée dans `conn.data.cameraUrl`. L'utiliser pour le flux vidéo.

### Flux

Flux MJPEG standard, pas d'authentification. Afficher avec un `<img src="...">` en streaming (même approche que FlashForge). Pas de WebRTC, pas d'iframe — juste un `<img>`.

Format observé : `http://{ip}:8080/?action=stream`

---

## 13. Découverte LAN — UDP port 52700

### Envoi (probe)

Envoyer en UDP sur le port `52700` à chaque IP du réseau :
```json
{"id": 0, "method": 7000}
```
Envoyer **deux fois** par IP, avec **60 ms d'intervalle**.

### Réponse (datagramme UDP de l'imprimante)

```json
{
  "host_name": "MyElegooPrinter",
  "machine_model": "Centauri Carbon 2",
  "sn": "EG12345678",
  "protocol_version": "1.0",
  "software_version": { "ota_version": "1.2.3" },
  "token_status": 1,
  "lan_status": 1
}
```

Les champs peuvent être à la racine ou imbriqués sous `result`, `params`, `data` ou `msg` — les aplatir.

### Variantes de clés à accepter

| Champ interne | JSON keys acceptées |
|---|---|
| `hostName` | `host_name`, `hostName`, `hostname` |
| `machineModel` | `machine_model`, `machineModel`, `model` |
| `serialNumber` | `sn`, `serial`, `serial_number` |
| `protocolVersion` | `protocol_version`, `protocolVersion` |
| `otaVersion` | `software_version.ota_version` |

### Stratégie de scan

1. Dériver le subnet `/24` des IPs déjà connues + IP Wi-Fi locale
2. Ajouter toujours : `192.168.1.x`, `192.168.40.x` (`includeCommonSubnets` = **true** par défaut)
3. Ouvrir **un seul socket UDP** partagé (bind port 0, `reuseAddress: true`)
4. Sprayer toutes les IPs `.1`–`.254` en séquence rapide — **1 envoi par IP**
   - Yield toutes les **16 IPs** (`await Future.delayed(Duration.zero)`) pour laisser les réponses entrer
5. Fenêtre d'écoute : **2400 ms** après le dernier envoi (full scan) / **1400 ms** (probe rapide)
6. Dédupliquer par IP — si deux réponses arrivent pour la même IP, garder le score le plus élevé

> **Différence probe vs scan** : en mode `probe(ip)` direct, la trame est envoyée **deux fois** avec 60 ms d'intervalle. En mode `scan()`, chaque IP ne reçoit qu'**une seule** trame (la fenêtre d'écoute compense).

### Score de qualité d'un candidat

```dart
// Tri : score décroissant, puis IP croissante
int qualityScore(candidate) {
  if (hostName?.trim().isNotEmpty)     score += 4;
  if (machineModel?.trim().isNotEmpty) score += 3;
  if (serialNumber?.trim().isNotEmpty) score += 5;  // champ le plus utile
  if (protocolVersion?.trim().isNotEmpty) score += 1;
  if (otaVersion?.trim().isNotEmpty)   score += 1;
  if (tokenStatus != null)             score += 1;
  if (lanStatus != null)               score += 1;
  // max théorique : 16
}
```

### Fallback réponse non-JSON

Si le datagramme reçu n'est pas un JSON valide, il est conservé **uniquement** si le texte brut contient `"elegoo"` ou `"centauri"` (insensible à la casse). Dans ce cas, le payload est stocké sous `{ "message": "<texte brut>" }` pour diagnostic.

---

## 14. Gestion d'erreurs

| Situation | Comportement |
|---|---|
| SN manquant | Bloquer la connexion, afficher erreur |
| IP manquante | Bloquer la connexion, afficher erreur |
| MQTT connexion échouée | `throw` → log + badge offline |
| Disconnect | Vider flags `connected`/`connecting`, retirer guard `initSnapshot`, reconnexion auto |
| Publish sans connexion | Log `"MQTT not connected"`, ignorer sans crash |
| Base64 thumbnail invalide | Retirer du cache, afficher placeholder |
| `filament_type` absent | Defaulter à string vide, afficher `?` dans le slot |
| État inconnu | Capitaliser la première lettre et afficher tel quel |
| `print_status.state = ""` | Mapper → `"standby"` (cas observé après fin d'impression) |

### Codes `error_code` observés en live

| Code | Méthode | Signification |
|------|---------|--------------|
| `0`  | toutes  | Succès |
| `1003` | 1045 (thumbnail) | Miniature non trouvée (print pas encore démarrée, ou chauffe) |
| `1003` | 2003 (write canvas filament) | INVALID_PARAMETER — Canvas non connecté ; utiliser 1055 en mode mono |

---

## 15. Contrôle d'impression — Methods 1020 / 1021 / 1022 / 1023

**Observées live** par sniffer MQTT (`elegoo/{sn}/{cid}/api_request`) lors d'une session d'impression complète. Toutes renvoient `{"error_code": 0}` en cas de succès.

### 15.1 Démarrer une impression — Method 1020

```json
{
  "id": 1,
  "method": 1020,
  "params": {
    "filename": "ECC2_0.4_ELEGOO Nameplate_Elegoo PLA _0.2_17m21s.gcode",
    "storage_media": "local",
    "config": {
      "delay_video": true,
      "printer_check": true,
      "print_layout": "A"
    }
  }
}
```

| Champ | Type | Description |
|---|---|---|
| `filename` | string | Nom du fichier gcode sur l'imprimante |
| `storage_media` | string | `"local"` (stockage interne) ou `"u-disk"` (USB) |
| `config.delay_video` | bool | Activer le time-lapse vidéo |
| `config.printer_check` | bool | Vérification de l'imprimante avant impression |
| `config.print_layout` | string | Layout `"A"` (valeur observée, signification inconnue) |

**Note** : dès le démarrage, le push 6000 émet immédiatement `print_status.state`, `print_status.filename` et `print_status.uuid`.

### 15.2 Pause — Method 1021

```json
{ "id": 2, "method": 1021, "params": {} }
```

Aucun paramètre. `error_code: 0` confirmé live.

### 15.3 Reprise (Resume) — Method 1022

```json
{ "id": 3, "method": 1022, "params": {} }
```

Aucun paramètre. `error_code: 0` confirmé live.

### 15.4 Annuler — Method 1023

```json
{ "id": 4, "method": 1023, "params": {} }
```

Aucun paramètre. `error_code: 0` confirmé live. Après annulation, `print_status.state` passe à `""` (mappé → `"standby"` en UI).

---

## 16. Contrôle des axes — Methods 1026 / 1027

**Observées live** lors de commandes de déplacement manuel envoyées via le slicer Elegoo.

### 16.1 Homing — Method 1026

Renvoie tous les axes à la position d'origine.

```json
{
  "id": 5,
  "method": 1026,
  "params": {
    "homed_axes": "xyz"
  }
}
```

| Champ | Valeur observée | Description |
|---|---|---|
| `homed_axes` | `"xyz"` | Axes à hommer (peut être sous-ensemble, ex. `"z"`) |

### 16.2 Jog (déplacement relatif) — Method 1027

Déplace un axe d'une distance relative en millimètres.

```json
{
  "id": 6,
  "method": 1027,
  "params": {
    "axes": "z",
    "distance": -1
  }
}
```

| Champ | Type | Description |
|---|---|---|
| `axes` | string | Axe cible : `"x"`, `"y"`, `"z"` (un seul axe par commande observé) |
| `distance` | number | Distance en mm, signée (positif = sens +, négatif = sens −) |

**Valeurs observées** : `distance: -1` (descente Z de 1 mm). Pas d'unité autre que mm observée.

---

## 17. LED, ventilateurs, vitesse — Methods 1029 / 1030 / 1031

**Observées live** lors de contrôles manuels via le slicer Elegoo. Toutes renvoient `error_code: 0`. Le push 6000 émet les nouvelles valeurs dès que l'imprimante les applique.

### 17.1 LED — Method 1029

```json
{
  "id": 7,
  "method": 1029,
  "params": { "power": 1 }
}
```

| `power` | Effet |
|---|---|
| `1` | LED allumée |
| `0` | LED éteinte |

### 17.2 Ventilateurs — Method 1030

Chaque ventilateur est contrôlé indépendamment dans un payload séparé.

```json
{ "id": 8,  "method": 1030, "params": { "fan":     255 } }
{ "id": 9,  "method": 1030, "params": { "aux_fan": 255 } }
{ "id": 10, "method": 1030, "params": { "box_fan": 255 } }
```

| Champ | Description |
|---|---|
| `fan` | Ventilateur principal (refroidissement pièce) |
| `aux_fan` | Ventilateur auxiliaire |
| `box_fan` | Ventilateur de boîtier (filtration) |

**Plage** : `0` (arrêt) à `255` (pleine vitesse). Les paliers observés du slicer sont des multiples de `25.5` (0, 25, 51, 76, 102, 127, 153, 178, 204, 229, 255 — correspondant à 0 % à 100 % par pas de 10 %).

### 17.3 Mode vitesse d'impression — Method 1031

```json
{
  "id": 11,
  "method": 1031,
  "params": { "mode": 0 }
}
```

| `mode` | Vitesse |
|---|---|
| `0` | Normale |
| `1` | Silencieuse (supposé) |
| `2` | Sport (supposé) |
| `3` | Ludicrous (supposé) |

Seul `mode: 0` a été observé live. Les autres valeurs sont extrapolées par analogie avec d'autres firmwares Klipper-dérivés.

---

## 18. Méthodes inconnues — 1024 / 1025

Appelées **séquentiellement** (1024 puis 1025) lors de l'ouverture du panneau d'inspection ou d'édition du filament dans le slicer Elegoo. Aucun paramètre envoyé dans les deux cas. Elles retournent `error_code: 0`.

```json
{ "id": 12, "method": 1024, "params": {} }
{ "id": 13, "method": 1025, "params": {} }
```

**Hypothèse** : 1024 pourrait demander un lock d'accès filament ou initialiser un mode édition ; 1025 pourrait acquitter ou confirmer. À reverse-engineer lors d'une prochaine session de sniffer ciblée sur la réponse complète.

---

## 19. Checklist d'implémentation pour Tiger Studio

- [ ] Paquet npm `mqtt` (déjà présent si Bambu est implémenté)
- [ ] `printers/elegoo/index.js` — lifecycle MQTT (connect / disconnect / reconnect)
- [ ] `printers/elegoo/widget_camera.js` — `renderElegooCamBanner(p)` → `<img>` MJPEG (port 8080)
- [ ] `printers/elegoo/cards.js` — `renderElegooJobCard`, `renderElegooTempCard`, `renderElegooFilamentCard`
- [ ] CSS dans `renderer/css/57-elegoo.css` — classes dédiées, pas de dépendance à `.snap-camera-frame`
- [ ] `renderCamBanner` dans `inventory.js` : ajouter `case "elegoo": return renderElegooCamBanner(p)`
- [ ] Discovery UDP port 52700 → intégrer dans le flow scan printers
- [ ] Normalisation progress : si `value > 1` → `value / 100`
- [ ] Cache `Map<filename, totalLayers>` depuis réponse 1044
- [ ] Throttle thumbnail 1045 : 1500 ms ou changement de `uuid`
