// Chip UID helpers — pure functions, no I/O (tested in scripts/test-uid-repair.mjs).
//
// Bug (issue #146): the decimal → hex UID migration converted with
// `BigInt(decimal).toString(16)`, which drops the leading zero. Every TigerTag chip is an NXP
// NTAG whose 7-byte UID starts with 0x04, so the decimal id 1363777707846273 became
// "4D8593DD42A81" (13 chars) instead of "04D8593DD42A81" (14 chars). TigerScale and every scan
// look the spool up under the 14-char id, miss it, and create a duplicate.
//
// The mobile app (TigerTag Connect, lib/services/uid_repair.dart) carries the same helpers and
// the same repair plan; keep the two in step.

/** Decimal big-endian chip UID → uppercase hex, padded to whole bytes (even length) so the
 *  leading zero of 0x04… survives. Null when `decimal` is not a non-negative integer. */
export function decimalSpoolIdToHex(decimal) {
  try {
    const big = BigInt(decimal);
    if (big < 0n) return null;
    let hex = big.toString(16).toUpperCase();
    if (hex.length % 2) hex = "0" + hex;
    return hex;
  } catch { return null; }
}

/** The chip UID of an analytics event: `Uid` in decimal, what Xano has always keyed on, and
 *  `UidHex`, the UID as printed (uppercase, whole bytes, 1 to 7 of them). Xano stores the UID
 *  as a 64-bit integer, and a decimal number past 2^53 loses digits on the way (JSON numbers,
 *  Xano's own header decoding), so Xano reads the exact `UidHex` first. A truncated NTAG id
 *  gets its 0 back and a legacy decimal spool id is converted, so `UidHex` is the real chip
 *  even where `Uid` (kept as it always was) is not. `{}` when there is no chip UID: TigerData,
 *  TigerData+ and anything else that is not 1 to 7 bytes of hex. */
export function analyticsUid(raw) {
  const s = String(raw ?? "").replace(/[:\s]/g, "").toUpperCase();
  if (!/^[0-9A-F]+$/.test(s)) return {};
  const hex = isDecimalSpoolId(s) ? decimalSpoolIdToHex(s)
            : repairTruncatedNtagUid(s) ?? (s.length % 2 ? "0" + s : s);
  if (!hex || hex.length > 14) return {};
  return { Uid: BigInt("0x" + s).toString(), UidHex: hex };
}

/** 13 hex chars starting with "4" = a 7-byte NTAG UID that lost the 0 of 0x04. No real chip
 *  has a 13-char hex UID, and no decimal UID has 13 digits (4-byte ≤ 10, 7-byte 0x04… = 16),
 *  so the pattern is unambiguous. Returns the repaired 14-char id, or null. */
export function repairTruncatedNtagUid(id) {
  const s = String(id ?? "").trim();
  return /^4[0-9A-Fa-f]{12}$/.test(s) ? "0" + s.toUpperCase() : null;
}

/** A legacy decimal spool id (the old Android app). Leading zeros are excluded (a BigInt's
 *  toString() never has one), and so is a truncated NTAG id that happens to be all digits —
 *  that one is repaired by planTruncatedUidRepair, never re-converted. So is a 14-digit id:
 *  that is a 7-byte chip UID in hex with no letter in it (generic NTAGs, issue #227). A
 *  decimal 7-byte UID has 14 digits only when its first byte is 0x00, which no chip has. */
export function isDecimalSpoolId(id) {
  return typeof id === "string" && /^\d+$/.test(id) && (id === "0" || id[0] !== "0")
    && id.length !== 14 && repairTruncatedNtagUid(id) === null;
}

/** `updatedAt`, falling back to `last_update`, in ms — Firestore Timestamp, {seconds}, number
 *  or numeric string. 0 when absent. */
export function spoolUpdatedMs(data) {
  const v = data?.updatedAt ?? data?.last_update;
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  const s = typeof v.seconds === "number" ? v.seconds : typeof v._seconds === "number" ? v._seconds : null;
  if (s != null) return s * 1000;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Plans the repair of an inventory given as `{ docId: data }`.
 *   renames:   [{ from, to, write }] — `write` is the data to set under `to` (the truncated
 *              doc, `uid` + `twin_tag_uid` repaired) when `to` does not exist or the truncated
 *              doc is newer; null when the existing `to` doc is newer and kept as is. `from`
 *              is deleted in every case.
 *   twinFixes: { docId: repairedTwin } — docs that keep their id, only their pointer moves.
 * An already clean inventory gives an empty plan (idempotent).
 */
export function planTruncatedUidRepair(docs, timestampOf = spoolUpdatedMs) {
  const renames = [];
  const twinFixes = {};
  for (const [id, raw] of Object.entries(docs || {})) {
    const fixedId = repairTruncatedNtagUid(id);
    const data = { ...(raw || {}) };
    const twin = data.twin_tag_uid;
    const fixedTwin = typeof twin === "string" ? repairTruncatedNtagUid(twin) : null;
    if (fixedId == null) {
      if (fixedTwin != null) twinFixes[id] = fixedTwin;
      continue;
    }
    data.uid = fixedId;
    if (fixedTwin != null) data.twin_tag_uid = fixedTwin;
    const existing = docs[fixedId];
    const keepTruncated = existing == null || timestampOf(data) > timestampOf(existing);
    renames.push({ from: id, to: fixedId, write: keepTruncated ? data : null });
  }
  // A truncated doc that wins a collision overwrites the repaired id, so a twin fix planned
  // for the doc it replaces no longer applies.
  for (const r of renames) if (r.write) delete twinFixes[r.to];
  return { renames, twinFixes };
}
