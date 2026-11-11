import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Analytics contract v2 (TigerTag-Manager docs/analytics.md), main-process half: services/analytics.js.
const {
  stampEvent, readerModel, shouldResend, AnalyticsSession, ResendStore, RESEND_MAX_AGE_MS,
} = createRequire(import.meta.url)('../services/analytics.js');

const CTX = { session: 'S-1', platform: 'macos', appVersion: '2.54.1' };
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// The X-TigerTag-Analytics header as Xano decodes it.
const onTheWire = ev => JSON.parse(Buffer.from(Buffer.from(JSON.stringify(ev), 'utf8').toString('base64'), 'base64').toString('utf8'));

test('app_open carries V, EventId, Session and no reader', () => {
  const ev = onTheWire(stampEvent({ Operation: 'app_open', Timestamp: 1762770000 }, CTX));
  assert.equal(ev.V, 2);
  assert.match(ev.EventId, UUID_V4);
  assert.equal(ev.Session, 'S-1');
  assert.equal(ev.App, 'studio');
  assert.equal(ev.Timestamp, 1762770000);
  assert.equal('Reader' in ev, false);
  assert.equal('Device' in ev, false);
});

test('catalog_view carries its product and surface', () => {
  const ev = onTheWire(stampEvent({ Operation: 'catalog_view', IdProduct: 12345, Surface: 'studio' }, CTX));
  assert.equal(ev.IdProduct, 12345);
  assert.equal(ev.Surface, 'studio');
  assert.equal(ev.V, 2);
  assert.equal('Reader' in ev, false);
});

test('a chip event names the reader and its model', () => {
  const ev = stampEvent({ Operation: 'read', UidHex: '04D8593DD42A81' }, { ...CTX, deviceName: 'ACS ACR122U PICC Interface 0' });
  assert.equal(ev.Reader, 'usb_reader');
  assert.equal(ev.Device, 'ACR122U');
  const none = stampEvent({ Operation: 'write', UidHex: '04D8593DD42A81' }, CTX);
  assert.equal(none.Reader, 'usb_reader');
  assert.equal('Device' in none, false);
  assert.equal(stampEvent({ Operation: 'read', Reader: 'printer' }, CTX).Reader, 'printer');
});

test('reader names cut down to the model', () => {
  assert.equal(readerModel('ACS ACR122U PICC Interface'), 'ACR122U');
  assert.equal(readerModel('ACS ACR122U PICC Interface 00 00'), 'ACR122U');
  assert.equal(readerModel('ACS ACR1252 1S CL Reader PICC 0'), 'ACR1252 1S CL Reader');
  assert.equal(readerModel(''), '');
  assert.equal(readerModel('x'.repeat(100)).length, 64);
});

test('no IdProduct 0 or 0xFFFFFFFF, no empty SpoolId', () => {
  for (const pid of [0, 4294967295, '0']) {
    const ev = stampEvent({ Operation: 'read', IdProduct: pid, SpoolId: '' }, CTX);
    assert.equal('IdProduct' in ev, false, String(pid));
    assert.equal('SpoolId' in ev, false);
  }
  assert.equal(stampEvent({ Operation: 'online', IdProduct: 501, SpoolId: '04D8593DD42A81' }, CTX).IdProduct, 501);
});

test('an event sent again keeps its EventId and Timestamp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-analytics-'));
  const file = path.join(dir, 'analytics-resend.json');
  const first = stampEvent({ Operation: 'edit', SpoolId: 'TigerData_1', Changed: ['note'] }, { ...CTX, now: Date.now() - 3600e3 });
  const store = new ResendStore(file);
  store.add(first);
  store.add(first);                                   // the same event twice is kept once
  store.flush();
  const reopened = new ResendStore(file);             // next launch
  assert.equal(reopened.size, 1);
  const [again] = reopened.take();
  const resent = stampEvent(again, { ...CTX, session: 'S-2', appVersion: '9.9.9' });
  assert.equal(resent.EventId, first.EventId);
  assert.equal(resent.Timestamp, first.Timestamp);
  assert.equal(resent.Session, 'S-1');                // the session it happened in
  assert.equal(resent.AppVersion, '2.54.1');
  reopened.flush();
  assert.equal(fs.existsSync(file), false);           // nothing left → no file
  fs.rmSync(dir, { recursive: true, force: true });
});

test('kept events expire after 7 days', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-analytics-'));
  const store = new ResendStore(path.join(dir, 'r.json'));
  const now = Date.now();
  store.add(stampEvent({ Operation: 'delete' }, { ...CTX, now: now - RESEND_MAX_AGE_MS - 1000 }));
  store.add(stampEvent({ Operation: 'delete' }, { ...CTX, now: now - 1000 }));
  assert.equal(store.take(Infinity, now).length, 1);
  assert.equal(store.dropped, 1);
  store.flush();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('network failures and 5xx are sent again, a 4xx and online never', () => {
  assert.equal(shouldResend('edit', null), true);
  assert.equal(shouldResend('read', 503), true);
  assert.equal(shouldResend('read', 400), false);
  assert.equal(shouldResend('online', null), false);
  assert.equal(shouldResend('online', 502), false);
});

test('the session is renewed after 30 minutes in the background, and owes one app_open', () => {
  const t0 = 1_000_000;
  const s = new AnalyticsSession(t0);
  const first = s.id;
  assert.equal(s.takeAppOpen(), true);
  assert.equal(s.takeAppOpen(), false);               // a window reload counts no second one
  s.background(t0 + 1000);
  assert.equal(s.foreground(t0 + 1000 + 29 * 60e3), false);
  assert.equal(s.id, first);
  s.background(t0 + 3600e3);
  assert.equal(s.foreground(t0 + 3600e3 + 30 * 60e3), true);
  assert.notEqual(s.id, first);
  assert.match(s.id, UUID_V4);
  assert.equal(s.takeAppOpen(), true);
});
