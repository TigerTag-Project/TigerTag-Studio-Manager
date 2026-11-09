# Firestore schema and rules changes

**Rule.** The backend repo `TigerTag_Firebase_Backend` is the single source of truth for `firestore.rules`, `storage.rules` and Cloud Functions. Any change to the data model or a rule is made there first, deployed, then propagated to every doc that restates it.

**Why.** Founder order (2026-07-12). Field-whitelisted collections reject unlisted fields silently on the client, which is how features "worked" locally and failed in production.

**How.**
- Edit `firestore.rules` in the backend repo; add new fields to the `hasOnly([...])` list; deploy `firebase deploy --only firestore:rules --project tigertag-connect`; commit on `main` when asked.
- Cross-user writes always require an existing relationship (friend, request), mirroring the existing rules.
- `userProfiles/{uid}` is written only by the `setProfile` Cloud Function; Studio never writes it directly.
- Propagate: `docs/firestore-schema.md` here, the backend `README.md` (Firestore Data Structure), the integration guide (`TigerTag_Firebase_Integration`, third-party surface only) and TigerHub. Keep `MCP_DATA_GUIDE` true (`mcp.md`).
