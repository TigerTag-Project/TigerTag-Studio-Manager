# Worklog — v1.10.12 (in progress)

## Added
- **Notification center** — a **bell** in the sidebar (unread badge) opens a slide-in panel that aggregates: (1) **pending friend requests** as actionable items that **can't be dismissed without Accept / Decline / Block** (they only clear when the underlying request is handled), and (2) general **notifications** from `users/{uid}/notifications` (dismissible, marked read on open). First general type: **"X accepted your friend request"** — written (fire-and-forget, outside the accept batch so a missing rule can't roll back the friendship) to the requester's notifications on accept. Live-subscribed (`subscribeNotifications`), reusable for future notification types. New `icon_bell.svg`. ⚠️ needs a Firestore rule for the cross-user notification create (provided to the user). `renderer/inventory.html`, `renderer/inventory.js`, `css/20-friends.css`, `css/00-base.css`, `css/70-detail-misc.css`, `assets/svg/icons/icon_bell.svg`
- **Pending friend requests** are now listed in the Friends panel (new section above the friends list, hidden when empty) with **Accept / Decline / Block** per row — so a request can be handled even after its popup modal was closed. Each row shows the requester's real avatar (resolved from `userProfiles`). `renderer/inventory.html`, `renderer/inventory.js`, `css/20-friends.css`

## Changed
- Sidebar **Friends button badge** now shows the **number of friends** (neutral count), or a **"+"** when the user has none yet — instead of the pending-request count. Pending requests moved entirely to the **notification bell** (count) and the notification center (full info + actions). `renderer/inventory.js`, `css/60-modals.css`
- Friend **request modal** gained a **close (✕)** button (top-right) that dismisses it without acting — the request stays pending (badge keeps it) and the next queued request, if any, shows. `renderer/inventory.html`, `renderer/inventory.js`, `css/60-modals.css`
- Friend **request modal** now shows the requester's real **avatar** (+ name/colour), resolved from `userProfiles/{uid}` before the modal opens, with **no initials-letter flash**: when the requester has a photo the letter is never drawn (the coloured circle shows behind the image, then the photo paints); only a friend with no avatar shows initials. Decode-fail falls back to initials. `renderer/inventory.js`, `css/60-modals.css`
- Friends list is now **live** (Firestore `onSnapshot` on `users/{uid}/friends` via new `subscribeFriends`/`unsubscribeFriends`, replacing the one-shot `loadFriendsList` get on the connect path). An accepted or removed friend now appears/disappears **on the fly for both users** (requester & accepter, remover & removed) without reopening the panel. Each friend also gets a per-friend `userProfiles/{uid}` listener so their **avatar / display name / colour update live** (and our own already did). `renderer/inventory.js`

## Fixed

## Removed

## i18n
- Added: `friendReqsTitle`, `notifsTitle`, `notifsEmptyTitle`, `notifsEmptySub`, `notifAcceptedFriend` — 9 locales
