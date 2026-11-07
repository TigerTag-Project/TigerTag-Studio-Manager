/**
 * renderer/qr-check.js — is the person scanning a spool link its owner?
 *
 * The Hub's /qr/spool page (tigersystem.io) has no sign-in of its own. When it
 * sees no session, or one that does not own the spool, it frames this page,
 * hidden: https://studio.tigersystem.io/studio/renderer/qr-check.html?spool=<id>
 * Same site as the Hub, so the frame reads Studio Web's own sign-ins (the
 * accounts list in localStorage, each account's Firebase session in IndexedDB).
 *
 * For each signed-in account it looks the spool up in that account's inventory,
 * then in its uidMigrationMap (a chipless id burned since), and answers the Hub
 * once:  { type: "tt-qr-owner", v: 1, spool, owner, docId }
 *   spool — the `spool` parameter, as received
 *   owner — true when one of the accounts owns the spool (a deleted one too)
 *   docId — the spool's doc id then (the chip UID after a burn), else null
 * The answer goes to https://tigersystem.io only; nothing else is said, and only
 * the owner's own reads are made (one per account, two after a burn). The Hub
 * gives up after 3 s and takes the visitor path.
 */
import { spoolIdFromPath } from "./qr-link.js";

const HUB = "https://tigersystem.io";
const AUTH_WAIT_MS = 1500;   // an account whose session is not restored by then is skipped

const asked = new URLSearchParams(location.search).get("spool") || "";

function framedByHub() {
  if (window.parent === window) return false;
  const origin = location.ancestorOrigins?.[0]
    ?? (() => { try { return new URL(document.referrer).origin; } catch (_) { return ""; } })();
  return origin === HUB;
}

function accountIds() {
  try {
    const list = JSON.parse(localStorage.getItem("tigertag.accounts") || "[]");
    return Array.isArray(list) ? list.map(a => a?.id).filter(id => typeof id === "string" && id) : [];
  } catch (_) { return []; }
}

// The account's user once its session is restored, or null.
function signedIn(id) {
  return new Promise(resolve => {
    let app;
    try { app = ensureFirebaseApp(id); } catch (_) { resolve(null); return; }
    const timer = setTimeout(() => { off(); resolve(null); }, AUTH_WAIT_MS);
    const off = app.auth().onAuthStateChanged(user => {
      clearTimeout(timer); off();
      resolve(user && user.uid === id ? user : null);
    });
  });
}

// The doc id of the spool in this account: the id itself, or where its
// uidMigrationMap entry points. null when the account does not own it.
async function ownedDocId(uid, id) {
  const user = firebase.app(uid).firestore().collection("users").doc(uid);
  if ((await user.collection("inventory").doc(id).get()).exists) return id;
  const hex = (await user.collection("uidMigrationMap").doc(id).get()).get("hex_uid");
  if (hex && (await user.collection("inventory").doc(String(hex)).get()).exists) return String(hex);
  return null;
}

async function check() {
  const id = spoolIdFromPath(asked);
  if (!id) return null;
  const owned = await Promise.all(accountIds().map(async acc => {
    const user = await signedIn(acc);
    return user ? ownedDocId(user.uid, id).catch(() => null) : null;
  }));
  return owned.find(Boolean) || null;
}

if (framedByHub()) {
  check().catch(() => null).then(docId => {
    window.parent.postMessage({ type: "tt-qr-owner", v: 1, spool: asked, owner: !!docId, docId: docId || null }, HUB);
  });
}
