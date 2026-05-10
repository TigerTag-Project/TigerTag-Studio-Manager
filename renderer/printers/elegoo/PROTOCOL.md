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
| `elegoo/{sn}/{cid}_req/register_response` | **Ack registration** — pattern observé dans le slicer Elegoo (primaire) |
| `elegoo/{sn}/{rid}/register_response` | **Ack registration** — fallback compat ancienne version |

### Publish (commandes vers l'imprimante)

| Topic | Rôle |
|---|---|
| `elegoo/{sn}/api_register` | Envoyer la demande d'enregistrement |
| `elegoo/{sn}/{cid}/api_request` | Envoyer toutes les commandes/requêtes |

---

## 3. Séquence d'initialisation

```
1. Créer clientId + requestId
2. Connecter MQTT (host, port 1883, user/pass, keepAlive 60s)
3. SUB elegoo/{sn}/api_status
   SUB elegoo/{sn}/{cid}/api_response
   SUB elegoo/{sn}/{cid}_req/register_response
   SUB elegoo/{sn}/{rid}/register_response
4. PUB elegoo/{sn}/api_register
   { "client_id": "{cid}", "request_id": "{rid}" }
5. Sur register_response OU timeout 1200 ms → envoyer la rafale initiale (§4)
   (La rafale ne s'envoie qu'une fois par connexion — guard _initSnapshotSent)
```

---

## 4. Rafale d'initialisation (snapshot burst)

Envoyer dans l'ordre, avec **50 ms de délai entre chaque** :

| Ordre | Method | Params | Rôle |
|---|---|---|---|
| 1 | `1042` | `{}` | Print status snapshot (progress / state / layers / filename) |
| 2 | `1061` | `{}` | Temperature snapshot (nozzle / bed / chamber) |
| 3 | `1044` | `{"storage_media":"local","offset":0,"limit":20}` | File list → total layers par fichier |
| 4 | `1036` | `{}` | Machine / system info |
| 5 | `2005` | `{}` | Filament / matériaux (4 slots) |
| 6 | `1001` | `{}` | Config extruder / nozzle |
| 7 | `1002` | `{}` | Settings globaux |

Enveloppe d'une requête :
```json
{ "id": <int incrémental>, "method": <id>, "params": {} }
```

---

## 5. Method 6000 — Push live `api_status`

Le push principal. L'imprimante l'envoie en continu sur `elegoo/{sn}/api_status`.

### Payload complet

```json
{
  "method": 6000,
  "result": {
    "extruder": {
      "temperature": 210.5
    },
    "heater_bed": {
      "temperature": 60.0
    },
    "ztemperature_sensor": {
      "temperature": 28.3
    },
    "machine_status": {
      "progress": 0.42
    },
    "print_status": {
      "filename": "benchy.gcode",
      "uuid": "abc123",
      "state": "printing",
      "progress": 0.42,
      "current_layer": 48,
      "remaining_time_sec": 3720
    }
  }
}
```

### Extraction des champs

| Chemin JSON | Clé interne | Type | Notes |
|---|---|---|---|
| `result.extruder.temperature` | `nozzle_temp` | `number` | °C |
| `result.heater_bed.temperature` | `bed_temp` | `number` | °C |
| `result.ztemperature_sensor.temperature` | `chamber_temp` | `number` | °C — absent si pas d'enceinte |
| `result.print_status.progress` OU `result.machine_status.progress` | `print_progress` | `number` 0.0–1.0 | Normaliser : si valeur > 1 → diviser par 100 |
| `result.print_status.current_layer` | `print_layer_cur` | `int` | |
| `result.print_status.remaining_time_sec` | `print_remaining_sec` | `int` | Secondes |
| `result.print_status.state` | `print_state` | `string` | Voir §6 |
| `result.print_status.filename` | `print_filename` | `string` | |
| `result.print_status.uuid` | `print_uuid` | `string` | Dédup pour throttle thumbnail |

---

## 6. États d'impression

| Valeur `print_state` | Signification | UI |
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
| `"standby"` | Inactif | Masquer progress card |
| `"error"` / `"failed"` | Erreur | Badge "Error" |

Regroupements utiles :
```js
const ELEGOO_ACTIVE  = ["printing","running","busy","preparing","heating"];
const ELEGOO_PAUSED  = ["paused"];
const ELEGOO_DONE    = ["complete","completed","cancelled","canceled","standby"];
```

---

## 7. Filament — Method 2005 response

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
Si `canvas_list` est absent → fallback sur arrays plats dans `params` (§7.1).

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

### 7.1 Fallback — arrays plats (certains firmwares)

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

---

## 8. Thumbnail — Method 1045

### Request

```json
{
  "id": 4,
  "method": 1045,
  "params": {
    "storage_media": "local",
    "file_name": "benchy.gcode"
  }
}
```

### Response

```json
{
  "method": 1045,
  "result": {
    "thumbnail": "<base64 PNG string>"
  }
}
```

**Règles de déclenchement** :
- Sur chaque push 6000 avec `print_filename` non vide
- Throttle : seulement si `uuid` a changé OU plus de 1500 ms depuis le dernier pull
- Mettre en cache par imprimante ; ne rafraîchir que si la valeur Base64 change

---

## 9. Total layers — Method 1044

Le push 6000 ne contient pas `total_layers`. Il faut croiser avec la file list.

### Request

```json
{
  "id": 3,
  "method": 1044,
  "params": { "storage_media": "local", "offset": 0, "limit": 20 }
}
```

### Response

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

Construire un cache `Map<filename, totalLayers>` et résoudre `print_layer_total` en croisant avec `print_filename` du 6000.

---

## 10. Écriture filament — Method 2003

Publié sur `elegoo/{sn}/{cid}/api_request`.

```json
{
  "id": 1,
  "method": 2003,
  "params": {
    "canvas_id": 0,
    "tray_id": 0,
    "brand": "ELEGOO",
    "filament_type": "PLA",
    "filament_name": "PLA Silk",
    "filament_code": "0x0000",
    "filament_color": "#FF5733",
    "filament_min_temp": 190,
    "filament_max_temp": 230
  }
}
```

**Règles** :
- `canvas_id` : toujours `0`
- `tray_id` : `0`–`3`
- `filament_type` : type de base uniquement — supprimer les modificateurs. Ex. `"PLA+ Silk"` → `"PLA"`. Logique : split sur `/[\s+\-_/]+/`, prendre le premier token.
- `filament_color` : `#RRGGBB` majuscules
- `filament_code` : `"0x0000"` si inconnu

Après un 2003, envoyer un 2005 avec 1000 ms de délai pour rafraîchir le snapshot.

---

## 11. Caméra

Flux MJPEG standard, pas d'authentification.

```
http://{ip}:8080/?action=stream
```

Afficher avec un `<img src="...">` en streaming (même approche que FlashForge). Pas de WebRTC, pas d'iframe — juste un `<img>`.

---

## 12. Découverte LAN — UDP port 52700

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
2. Ajouter toujours : `192.168.1.x`, `192.168.40.x`
3. Sprayer toutes les IPs `.1`–`.254` en parallèle
4. Fenêtre de découverte : **2400 ms** (full scan) / **1400 ms** (probe rapide)
5. Dédupliquer par IP

---

## 13. Gestion d'erreurs

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

---

## 14. Commandes d'impression (non implémentées dans Flutter)

Les commandes pause / resume / stop **ne sont pas dans le code Flutter source**. Elles devront être reverse-engineered depuis le trafic du slicer Elegoo. Les method IDs pour le contrôle d'impression sont **inconnus** à ce stade.

---

## 15. Checklist d'implémentation pour Tiger Studio

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
