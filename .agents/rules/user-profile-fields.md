# User document fields

**Rule.** Display the pseudo from Firestore `users/{uid}.displayName`, never Firebase Auth `user.displayName` (the Google real name). `roles` (`"admin"` / `"tigermaster"`) and `tier` are privileges written only by the Admin SDK / Cloud Functions (roles granted by the owner from the TigerHub admin); `Debug` is a user preference the client writes on its own document.

**Why.** The Google name is private; privileges written by the client would be self-granted. Debug mode used to be admin-gated, which only stopped bug reporters from producing useful reports — the Security Rules, not the toggle, protect the data.

**How.** Avatar colour is one field, `color: "#rrggbb"` (legacy `customColor` is read for old profiles and never written). Public profile changes go through `setProfile` (`firestore-changes.md`).
