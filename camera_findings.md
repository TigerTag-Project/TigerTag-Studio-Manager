# Bambu Lab X1C — Cloud camera transport identification

> Scope: **observation only** — my own network traffic + binary metadata (dynamic deps, strings).
> Architecture identification for interoperability. No decryption, no pinning bypass, no key
> extraction, no impersonation client. Nothing is re-implemented here — only identified.

- **Device**: Bambu Lab X1C — SN `00M09A322200726`, LAN IP `192.168.20.154`
- **Account**: cloud OK, MQTT cloud `us.mqtt.bambulab.com:8883` (user `u_1504114800`)
- **Printer `ipcam` telemetry (given)**: `agora_service:"disable"`, `brtc_service:"enable"`, `tutk_server:"disable"`
- **Date**: 2026-06-24
- **Tooling**: `otool -L`, `strings`, `lsof`, `dig`, `whois` (read-only)

---

## 1. Verdict

**Cloud camera transport on this X1C firmware = BRTC** (Bambu's own WebRTC stack), signaled
through `DevSignal.bambu.com`.

Confidence by evidence type:
- **Binary capability**: ✅ strong — Bambu Studio ships and supports **all three** transports and
  selects one per-device at runtime.
- **Per-device selection**: ✅ strong (telemetry) — the X1C itself reports `brtc_service:"enable"`
  with Agora **and** TUTK disabled.
- **Per-device network proof**: ⏳ **pending** — the LAN capture caught no camera stream (printer
  was LAN-reachable → Studio prefers the local path; see §2.3). The decisive cloud capture must be
  run **off the LAN** (iPhone 4G hotspot). Expectation below in §2.4.

Bambu Studio links **three** camera transports and picks one based on what the printer advertises:

| URI scheme (in plugin) | Transport | SDK / endpoint | State on this X1C |
|------------------------|-----------|----------------|-------------------|
| `bambu:///agora?app=`  | **Agora** SD-RTN | `AgoraRtcKit.framework` v4.2.6.248, `*.edge.agora.io` / `*.edge.sd-rtn.com` | `agora_service: disable` |
| `bambu:///tutk?uid=`   | **TUTK** (ThroughTek) | REST `…/iot-service/api/user/ttcode` | `tutk_server: disable` |
| `brtc://emmc/%1%`      | **BRTC** (Bambu RTC) | signaling `DevSignal.bambu.com` (proprietary) | **`brtc_service: enable`** ✅ |
| `bambu:///local/`      | LAN RTSP | `liblive555.dylib`, `rtsps://…:322` | used when on-LAN |

Reading: **Agora is bundled as a legacy / fallback transport** (older firmware & other models), but
it is **disabled on this device**. The current X1C firmware has migrated the cloud camera to
**BRTC**, Bambu's in-house WebRTC.

---

## 2. Evidence

### 2.1 Bundled SDKs (`~/Library/Application Support/BambuStudio/plugins/`)

```
AgoraCore.framework        AgoraRtcKit.framework
AgoraSoundTouch.framework   Agoraffmpeg.framework
libbambu_networking.dylib  (46 MB, closed network plugin)
libBambuSource.dylib       liblive555.dylib  (RTSP, LAN camera)
```

- `AgoraRtcKit` identifies as Agora RTC SDK **4.2.6.248**, with edge hosts
  `*.edge.agora.io`, `*.edge.sd-rtn.com` (Agora's Software-Defined RTN).
- `otool -L libbambu_networking.dylib` does **not** statically link the Agora frameworks →
  they are `dlopen`'d at runtime only when the Agora transport is selected. Consistent with
  per-device transport switching.

### 2.2 Transport selectors & REST endpoints (strings in `libbambu_networking.dylib`)

```
bambu:///agora?app=          ← Agora channel join
bambu:///tutk?uid=           ← TUTK P2P by device UID
brtc://emmc/%1%              ← BRTC stream
bambu:///local/              ← LAN
…/iot-service/api/user/ttcode               ← TUTK TTCode credential endpoint
…/iot-service/api/user/applications/%2%/cert?aes256=%3%  ← device cert (Agora/BRTC auth)
https://api.bambulab.com/v1                 ← cloud REST base
ssl://us.mqtt.bambulab.com:8883             ← cloud MQTT
```

Signaling / device-service host family (none resolve publicly → internal split-horizon DNS):

```
DevSignal.bambu.com   ← BRTC signaling (camera)
DevConnect.bambu.com  DevBind.bambu.com  Devseclink.bambu.com
DevInf.bambu.com  DevModel.bambu.com  DevName.bambu.com  DevVersion.bambu.com
```

`DeviceSubscribeManager` strings confirm an **auto local/cloud channel switch**: Studio creates a
local channel when the printer IP is reachable and only falls back to the cloud channel when the
local one is missing or stale ("local channel doesn't provide data for a long time, switch to
cloud").

### 2.3 LAN network capture (2026-06-24, ~75 s, `lsof` loop, no sudo)

While Bambu Studio ran on the LAN, sampled every 2 s:

```
UDP  *:2021                                  (discovery / SSDP listen)
UDP  *:58424                                 (media/listen)
TCP  192.168.20.165 → 54.185.138.159:8883    (cloud MQTT — AWS / EMQX Cloud Pro)
TCP  192.168.20.165 → 192.168.20.154:8883    (LOCAL printer MQTT)
```

No new socket appeared — **no `:322` RTSP, no Agora edge, no DevSignal** — i.e. the camera live
view was **not streaming** during the window, and with the printer LAN-reachable Studio would have
used the local path anyway. **Inconclusive for the cloud transport by design.**

### 2.4 Cloud capture — procedure for the off-LAN (4G) test ⏳

Goal: make the printer **unreachable on the LAN** so Studio is forced onto the cloud channel, then
open the camera and classify the hosts contacted.

1. Switch the Mac's network to the **iPhone 4G hotspot** (printer no longer routable).
2. Confirm the local MQTT link is gone, only the cloud one remains:
   `lsof -nP -iTCP -a -c BambuStudio | grep 8883` → should show only the AWS IP, not `192.168.20.154`.
3. Start the host monitor (no sudo needed — we only need the remote IPs):
   `for i in $(seq 1 45); do lsof -nP -i -a -c BambuStudio | awk 'NR>1{print $9}'; echo ---; sleep 2; done | tee ~/bambu_cloud_conns.log`
4. **Open the camera live view** in Bambu Studio for ~30 s.
5. Reverse/whois every new remote IP:
   `dig +short -x <IP>; whois <IP> | grep -iE 'OrgName|netname'`

**Interpretation:**
- New UDP flow + `DevSignal.bambu.com` / Bambu-owned IPs, **no** `agora.io`/`sd-rtn.com` →
  confirms **BRTC**.
- Hosts under `*.edge.agora.io` / `*.edge.sd-rtn.com` → Agora (would contradict the telemetry).
- `ThroughTek` / `iotcplatform` ASN → TUTK.

---

## 3. Third-party integration feasibility (legal, by transport)

| Transport | Path to a legal third-party client | Verdict |
|-----------|-----------------------------------|---------|
| **Agora** | Fetch per-session token from Bambu cloud endpoint + official Agora SDK | Tractable — but **disabled** on this device |
| **TUTK**  | `POST /v1/iot-service/api/user/ttcode` + ThroughTek SDK (license, heavy) | Heavy — and **disabled** |
| **BRTC** (active) | Proprietary signaling (`DevSignal.bambu.com`), no public SDK, internal DNS, no documented API | **Dead end** for a clean third-party cloud client |

Because the active transport is **BRTC** — undocumented, no SDK, internal-only signaling — there is
**no viable, legal way** to consume the **cloud** camera from a third-party app without
reverse-engineering Bambu's signaling and impersonating their client, which is explicitly
out of scope.

---

## 4. Recommendation

**Use the LAN relay, not the cloud.** For a product, stream the printer's local RTSPS feed and
re-publish it:

- Source: `rtsps://bblp:<access_code>@192.168.20.154:322/streaming/live/1`
- Relay: **go2rtc** or **ffmpeg** (→ WebRTC/HLS/MJPEG for the app UI), optionally behind your own
  tunnel for remote access.

Rationale:
- The cloud transport (BRTC) is proprietary and a realistic dead end (§3).
- The LAN RTSPS feed is stable, documented in `renderer/printers/bambulab/PROTOCOL.md`, requires
  only the access code the user already holds, and stays entirely within the user's network — no
  legal/ToS exposure, no dependency on Bambu's cloud signaling.
- For "remote" viewing, tunnel the relay (your infra) rather than touching Bambu's cloud path.

> Status: cloud verdict established by binary + device telemetry; **network confirmation pending the
> 4G test (§2.4)**. This file will be updated with the captured cloud hosts once that run is done.
