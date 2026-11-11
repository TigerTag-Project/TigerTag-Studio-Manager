'use strict';
// Analytics event contract v2 — the main-process half (TigerTag-Manager docs/analytics.md).
// Pure helpers plus the on-disk store of events to send again; main.js wires them to the
// queue, the windows and the NFC readers. Tested in scripts/test-analytics.mjs.
//
//  • stampEvent  — what every event carries from the moment it happens: `V: 2`, an
//                  `EventId` (UUID v4) and the `Session`, kept as they are when the event
//                  is sent again; `Reader` / `Device` on chip events.
//  • AnalyticsSession — one random id per launch, renewed when the app comes back after
//                  30 minutes in the background; each new session owes one `app_open`.
//                  Never derived from the account.
//                  The shared rules hold here whatever the renderer sent: no `IdProduct`
//                  0 / 0xFFFFFFFF ("no product"), no `SpoolId: ""`.
//  • readerModel — the PC/SC reader name cut down to its model ("ACS ACR122U PICC
//                  Interface 0" → "ACR122U").
//  • shouldResend — a network failure or a 5xx is sent again later, a 4xx never, and
//                  `online` never (product/get is a lookup, its row is a side effect).
//  • ResendStore — those events on disk, with their EventId and Timestamp, for 7 days.

const fs = require('fs');
const crypto = require('crypto');

const CONTRACT_VERSION = 2;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const RESEND_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const RESEND_MAX = 5000;

// Operations about a physical chip: they carry `Reader` (and `Device` when the reader is known).
const CHIP_OPERATIONS = new Set(['read', 'online', 'write', 'init', 'reset', 'repair',
  'nfc_read', 'nfc_write', 'nfc_init', 'nfc_reset']);

/** "ACS ACR122U PICC Interface 0" / "… 00 00" → "ACR122U"; "ACS ACR1252 1S CL Reader PICC 0"
 *  → "ACR1252 1S CL Reader". Free text, 64 characters at most; "" for no name. */
function readerModel(name) {
  let s = String(name ?? '').trim();
  s = s.replace(/(\s+\d+)+$/, '');                    // PC/SC slot numbers (Windows, Linux)
  s = s.replace(/\s+PICC(\s+Interface)?$/i, '');      // the contactless interface's suffix
  s = s.replace(/^ACS\s+/i, '');                      // the vendor ahead of an ACR model
  return s.trim().slice(0, 64);
}

/** The event as it is queued: what the renderer built, plus the contract fields and what only
 *  the main process knows. Fields already there (an event sent again) are kept as they are. */
function stampEvent(payload, { session, platform, appVersion, deviceName = '', now = Date.now() } = {}) {
  const ev = {
    ...payload,
    V: CONTRACT_VERSION,
    EventId: payload.EventId || crypto.randomUUID(),
    Session: payload.Session || session,
    Timestamp: payload.Timestamp ?? Math.floor(now / 1000),
    Platform: payload.Platform || platform,
    AppVersion: payload.AppVersion || appVersion,
    App: 'studio',                                    // tells Studio rows apart from mobile ones
  };
  const pid = Number(ev.IdProduct);
  if ('IdProduct' in ev && (!Number.isFinite(pid) || pid === 0 || pid === 0xFFFFFFFF)) delete ev.IdProduct;
  if ('SpoolId' in ev && (ev.SpoolId == null || ev.SpoolId === '')) delete ev.SpoolId;
  if (CHIP_OPERATIONS.has(ev.Operation)) {
    ev.Reader = payload.Reader || 'usb_reader';
    const device = payload.Device || readerModel(deviceName);
    if (device) ev.Device = device; else delete ev.Device;
  }
  return ev;
}

/** `status` null = no answer (network, timeout). */
function shouldResend(operation, status) {
  if (operation === 'online') return false;
  return status == null || status >= 500;
}

class AnalyticsSession {
  constructor(now = Date.now(), idleMs = SESSION_IDLE_MS) {
    this.idleMs = idleMs;
    this.id = crypto.randomUUID();
    this.startedAt = now;
    this.appOpenDue = true;          // a new session owes one `app_open`
    this.backgroundSince = null;
  }
  background(now = Date.now()) {
    if (this.backgroundSince == null) this.backgroundSince = now;
  }
  /** Back in the foreground: true when that renewed the session (away 30 minutes or more). */
  foreground(now = Date.now()) {
    const away = this.backgroundSince != null && now - this.backgroundSince >= this.idleMs;
    this.backgroundSince = null;
    if (away) {
      this.id = crypto.randomUUID();
      this.startedAt = now;
      this.appOpenDue = true;
    }
    return away;
  }
  /** True once per session: the caller sends that session's `app_open`. */
  takeAppOpen() {
    if (!this.appOpenDue) return false;
    this.appOpenDue = false;
    return true;
  }
}

class ResendStore {
  constructor(file, { maxAgeMs = RESEND_MAX_AGE_MS, max = RESEND_MAX } = {}) {
    this.file = file;
    this.maxAgeMs = maxAgeMs;
    this.max = max;
    this.events = [];
    this.dropped = 0;                // too old, or past `max`
    this._timer = null;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data)) this.events = data.filter(e => e && typeof e === 'object' && e.EventId);
    } catch (_) {}                   // no file yet, or unreadable: start empty
  }
  get size() { return this.events.length; }
  /** Keep events to send again; the oldest go first past `max`. Saved a moment later. */
  add(events) {
    const known = new Set(this.events.map(e => e.EventId));
    for (const e of [].concat(events)) if (e?.EventId && !known.has(e.EventId)) { this.events.push(e); known.add(e.EventId); }
    if (this.events.length > this.max) this.dropped += this.events.splice(0, this.events.length - this.max).length;
    this._saveSoon();
  }
  /** Hand back up to `limit` events still within 7 days of their Timestamp; older ones go. */
  take(limit = Infinity, now = Date.now()) {
    const fresh = this.events.filter(e => now - Number(e.Timestamp) * 1000 < this.maxAgeMs);
    this.dropped += this.events.length - fresh.length;
    const out = fresh.slice(0, limit);
    this.events = fresh.slice(out.length);
    this._saveSoon();
    return out;
  }
  _saveSoon() {
    if (this._timer) return;
    this._timer = setTimeout(() => this.flush(), 2000);
    this._timer.unref?.();
  }
  /** Write now (quit). An empty store removes the file. */
  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    try {
      if (!this.events.length) { fs.rmSync(this.file, { force: true }); return; }
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.events));
      fs.renameSync(tmp, this.file);
    } catch (_) {}                   // a full or read-only disk loses the events, never the app
  }
}

module.exports = {
  CONTRACT_VERSION, SESSION_IDLE_MS, RESEND_MAX_AGE_MS, CHIP_OPERATIONS,
  readerModel, stampEvent, shouldResend, AnalyticsSession, ResendStore,
};
