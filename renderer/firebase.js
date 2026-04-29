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
