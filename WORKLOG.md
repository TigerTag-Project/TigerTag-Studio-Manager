# Worklog — v1.10.23 (in progress)

## Added

## Changed

## Fixed
- **Cross-account rack corruption (round 2): spools left their slots when bouncing between two signed-in accounts.** `handleSignedIn` never cleared `state.racks` on an account switch, so it still held the *previous* account's racks when the new account's first inventory snapshot fired from cache (before the new racks snapshot arrived). With Auto-organize ON, `getUnrackedSpools()` then saw every correctly-placed spool as "unranked" (its rackId wasn't in the stale rack-id set) and `autoFillEmptySlots` rewrote them into the old account's slot ids — real data corruption, not just display. Fix: reset `state.racks = []` at the top of `handleSignedIn` so Auto-organize is a no-op until the new account's racks load. `renderer/inventory.js`

## Removed

## i18n
