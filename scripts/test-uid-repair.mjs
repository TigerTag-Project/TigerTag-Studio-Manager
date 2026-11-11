import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decimalSpoolIdToHex, repairTruncatedNtagUid, isDecimalSpoolId, planTruncatedUidRepair, analyticsUid,
} from '../renderer/uid-repair.js';

// Same vectors as the mobile app (TigerTag Connect, test/uid_repair_test.dart) — issue #146.

test('decimal → hex keeps whole bytes (the 0 of 0x04 survives)', () => {
  assert.equal(decimalSpoolIdToHex('1363777707846273'), '04D8593DD42A81');
  assert.equal(decimalSpoolIdToHex(String(0x0ABCDEF1)), '0ABCDEF1');
  assert.equal(decimalSpoolIdToHex(String(0xDEADBEEF)), 'DEADBEEF');
  assert.equal(decimalSpoolIdToHex('-5'), null);
  assert.equal(decimalSpoolIdToHex('not a number'), null);
});

test('a truncated NTAG id is recognised and repaired', () => {
  assert.equal(repairTruncatedNtagUid('4D8593DD42A81'), '04D8593DD42A81');
  assert.equal(repairTruncatedNtagUid('4d8593dd42a81'), '04D8593DD42A81');
  assert.equal(repairTruncatedNtagUid('4123456789012'), '04123456789012');
  for (const ok of ['04D8593DD42A81', '1363777707846273', 'DEADBEEF', '5D8593DD42A81', ''])
    assert.equal(repairTruncatedNtagUid(ok), null, ok);
});

test('an all-digit truncated id is not a decimal id', () => {
  assert.equal(isDecimalSpoolId('4123456789012'), false);
  assert.equal(isDecimalSpoolId('1363777707846273'), true);
  assert.equal(isDecimalSpoolId('04D8593DD42A81'), false);
});

test('a 14-digit id is a hex chip UID, never a decimal id (issue #227)', () => {
  assert.equal(isDecimalSpoolId('53250983430001'), false);
  assert.equal(isDecimalSpoolId('12345678901234'), false);
  assert.equal(isDecimalSpoolId('123456789012345'), true);
});

// The X-TigerTag-Analytics header is base64 JSON; decode it the way Xano does.
const header = fields => JSON.parse(Buffer.from(
  Buffer.from(JSON.stringify({ Operation: 'read', ...fields }), 'utf8').toString('base64'), 'base64').toString('utf8'));

test('analytics: a 7-byte NTAG chip carries UidHex next to the decimal Uid', () => {
  const h = header(analyticsUid('04D8593DD42A81'));
  assert.equal(h.UidHex, '04D8593DD42A81');
  assert.equal(h.Uid, '1363777707846273');
  assert.equal(analyticsUid('04:d8:59:3d:d4:2a:81').UidHex, '04D8593DD42A81');
  assert.equal(analyticsUid('4D8593DD42A81').UidHex, '04D8593DD42A81');   // truncated id, repaired
  assert.equal(analyticsUid('36EE0FCA').UidHex, '36EE0FCA');              // 4-byte chip
  assert.equal(analyticsUid('1363777707846273').UidHex, '04D8593DD42A81'); // legacy decimal id
});

test('analytics: a UID past 2^53 stays exact in UidHex', () => {
  const h = header(analyticsUid('FFEEDDCCBBAA99'));
  assert.equal(h.UidHex, 'FFEEDDCCBBAA99');
  assert.equal(h.Uid, BigInt('0xFFEEDDCCBBAA99').toString());
  assert.notEqual(String(Number(h.Uid)), h.Uid);   // what a JSON number would have turned it into
});

test('analytics: a TigerData spool sends no UID at all', () => {
  for (const id of ['TigerData_17311234567891234', 'CLOUD_abc', '', null, undefined, '04D8593DD42A81FF'])
    assert.deepEqual(analyticsUid(id), {}, String(id));
  assert.equal('UidHex' in header({ SpoolId: 'TigerData_17311234567891234', ...analyticsUid('TigerData_17311234567891234') }), false);
});

const ts = d => d.updatedAt ?? 0;

test('issue #146 inventory: the truncated doc is re-keyed, the correct one untouched', () => {
  const plan = planTruncatedUidRepair({
    '4D8593DD42A81':  { uid: '4D8593DD42A81', twin_tag_uid: '4D8593DD42A81', weight_available: 1000, updatedAt: 100 },
    '04A9543DD42A81': { uid: '04A9543DD42A81', twin_tag_uid: '04D8593DD42A81', weight_available: 555 },
  }, ts);
  assert.equal(plan.renames.length, 1);
  const [r] = plan.renames;
  assert.equal(r.from, '4D8593DD42A81');
  assert.equal(r.to, '04D8593DD42A81');
  assert.equal(r.write.uid, '04D8593DD42A81');
  assert.equal(r.write.twin_tag_uid, '04D8593DD42A81');
  assert.equal(r.write.weight_available, 1000);
  assert.deepEqual(plan.twinFixes, {});
});

test('a correct doc whose twin is truncated: pointer fixed only', () => {
  const plan = planTruncatedUidRepair({
    '04A9543DD42A81': { uid: '04A9543DD42A81', twin_tag_uid: '4D8593DD42A81' },
  }, ts);
  assert.deepEqual(plan.renames, []);
  assert.deepEqual(plan.twinFixes, { '04A9543DD42A81': '04D8593DD42A81' });
});

test('collision: the newer doc wins (truncated newer)', () => {
  const plan = planTruncatedUidRepair({
    '4D8593DD42A81':  { uid: '4D8593DD42A81', weight_available: 700, updatedAt: 200 },
    '04D8593DD42A81': { uid: '04D8593DD42A81', weight_available: 900, updatedAt: 100 },
  }, ts);
  assert.equal(plan.renames.length, 1);
  assert.equal(plan.renames[0].write.weight_available, 700);
});

test('collision: the newer doc wins (repaired id newer)', () => {
  const plan = planTruncatedUidRepair({
    '4D8593DD42A81':  { uid: '4D8593DD42A81', weight_available: 700, updatedAt: 100 },
    '04D8593DD42A81': { uid: '04D8593DD42A81', weight_available: 900, updatedAt: 200 },
  }, ts);
  assert.equal(plan.renames.length, 1);
  assert.equal(plan.renames[0].write, null);
  assert.equal(plan.renames[0].from, '4D8593DD42A81');
});

test('a clean inventory gives an empty plan (idempotent)', () => {
  const plan = planTruncatedUidRepair({
    '04D8593DD42A81': { uid: '04D8593DD42A81', twin_tag_uid: '04A9543DD42A81' },
    '04A9543DD42A81': { uid: '04A9543DD42A81', twin_tag_uid: '04D8593DD42A81' },
    'TigerData_123':  { uid: 'TigerData_123' },
  }, ts);
  assert.deepEqual(plan, { renames: [], twinFixes: {} });
});
