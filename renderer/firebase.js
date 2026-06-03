// TigerTag Firebase initialisation
// Must be loaded AFTER firebase-app-compat.js, firebase-auth-compat.js,
// and firebase-firestore-compat.js (see inventory.html script tags).

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCkxPTs_Cv0KVLqsZj-UKWWqIY0OtfVpnw",
  authDomain:        "tigertag-connect.firebaseapp.com",
  projectId:         "tigertag-connect",
  storageBucket:     "tigertag-connect.firebasestorage.app",
  messagingSenderId: "298062874545",
};

firebase.initializeApp(FIREBASE_CONFIG);

// Enable IndexedDB offline persistence on every Firestore instance — default
// app + every per-account named app. Each snapshot listener replays from the
// cache on cold start, and only deltas hit the network — cuts cold-start
// reads from ~130 (100 spools + 10 racks + 5×printers + scales + friends) to
// near-zero on repeat boots, makes the UI usable offline, and removes the
// blank-grid moment while the first snapshot rounds-trips. Must run before
// ANY other Firestore call on the instance — that's why it sits right next
// to initializeApp.
// `failed-precondition` (already enabled) and `unimplemented` (no IDB) are
// both expected on some platforms and silently ignored.
function _enablePersistenceQuiet(app, label) {
  try {
    app.firestore().enablePersistence({ synchronizeTabs: true }).catch(err => {
      console.warn(`[firebase] enablePersistence (${label}) failed:`, err.code, err.message);
    });
  } catch (e) {
    console.warn(`[firebase] enablePersistence (${label}) threw:`, e.message);
  }
}
_enablePersistenceQuiet(firebase.app(), "default");

// Return (or create) a named Firebase app instance for a given account uid.
// Each instance maintains its own independent auth session in IndexedDB.
function ensureFirebaseApp(id) {
  try   { return firebase.app(id); }
  catch {
    const app = firebase.initializeApp(FIREBASE_CONFIG, id);
    _enablePersistenceQuiet(app, id);
    return app;
  }
}
