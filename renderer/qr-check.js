/**
 * renderer/qr-check.js — is the person scanning a spool link its owner?
 *
 * The Hub's /qr/spool page (tigersystem.io) has no sign-in of its own. When it
 * sees no session, or one that does not own the spool, it frames this page,
 * hidden: https://studio.tigersystem.io/studio/renderer/qr-check.html?spool=<id>
 * Same site as the Hub, so the frame reads Studio Web's own sign-ins (the
 * accounts list in localStorage, each account's Firebase Auth session in
 * IndexedDB).
 *
 * For each signed-in account it looks the spool up in that account's inventory,
 * then in its uidMigrationMap (a chipless id burned since), and answers the Hub
 * once:  { type: "tt-qr-owner", v: 1, spool, owner, docId }
 *   spool — the `spool` parameter, as received
 *   owner — true when one of the accounts owns the spool (a deleted one too)
 *   docId — the spool's doc id then (the chip UID after a burn), else null
 * The answer goes to https://tigersystem.io only; nothing else is said, and only
 * the owner's own reads are made (two per account in one request, a third after
 * a burn). The Hub gives up waiting after 3 s and takes the visitor path.
 *
 * The reads go straight to the Firestore REST API with the account's ID token;
 * the Firestore SDK is not loaded here. Its multi-tab IndexedDB cache made this
 * frame wait for the primary Studio Web tab, and a tab left in the background
 * never answered: every read hung past the Hub's 3 s. The token never leaves
 * the frame and the Security Rules apply as they do to the app.
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

// The account's named app (it holds that account's auth session), auth only.
function accountApp(id) {
  try { return firebase.app(id); } catch (_) { return firebase.initializeApp(firebase.app().options, id); }
}

// The account's user once its session is restored, or null.
function signedIn(id) {
  return new Promise(resolve => {
    let app;
    try { app = accountApp(id); } catch (_) { resolve(null); return; }
    const timer = setTimeout(() => { off(); resolve(null); }, AUTH_WAIT_MS);
    const off = app.auth().onAuthStateChanged(user => {
      clearTimeout(timer); off();
      resolve(user && user.uid === id ? user : null);
    });
  });
}

// One documents:batchGet. Returns { path: fields | null } (null = no such doc);
// throws when the request fails (the account then counts as not owning it).
async function batchGet(user, paths) {
  const { projectId } = firebase.app().options;
  const root = `projects/${projectId}/databases/(default)/documents`;
  const res = await fetch(`https://firestore.googleapis.com/v1/${root}:batchGet`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    // Only hex_uid is needed: an inventory doc comes back "found" with no fields.
    body: JSON.stringify({ documents: paths.map(p => `${root}/${p}`), mask: { fieldPaths: ["hex_uid"] } }),
  });
  if (!res.ok) throw new Error(`batchGet ${res.status}`);
  const out = {};
  for (const r of await res.json()) {
    if (r.found) out[r.found.name.slice(root.length + 1)] = r.found.fields || {};
    else if (r.missing) out[r.missing.slice(root.length + 1)] = null;
  }
  return out;
}

// The doc id of the spool in this account: the id itself, or where its
// uidMigrationMap entry points. null when the account does not own it.
async function ownedDocId(user, id) {
  const base = `users/${user.uid}`;
  const first = await batchGet(user, [`${base}/inventory/${id}`, `${base}/uidMigrationMap/${id}`]);
  if (first[`${base}/inventory/${id}`]) return id;
  const hexField = first[`${base}/uidMigrationMap/${id}`]?.hex_uid;
  const hex = hexField?.stringValue ?? hexField?.integerValue;
  if (!hex) return null;
  const moved = await batchGet(user, [`${base}/inventory/${hex}`]);
  return moved[`${base}/inventory/${hex}`] ? String(hex) : null;
}

async function check() {
  const id = spoolIdFromPath(asked);
  if (!id) return null;
  const owned = await Promise.all(accountIds().map(async acc => {
    const user = await signedIn(acc);
    return user ? ownedDocId(user, id).catch(() => null) : null;
  }));
  return owned.find(Boolean) || null;
}

if (framedByHub()) {
  check().catch(() => null).then(docId => {
    window.parent.postMessage({ type: "tt-qr-owner", v: 1, spool: asked, owner: !!docId, docId: docId || null }, HUB);
  });
}
