# Worklog — v1.8.22 (in progress)

## Added
- **Custom avatar — Discord-style edit flow with crop, zoom and rotate.** Replaces the colour-circle + initials avatar with a user-supplied photo, everywhere the colour circle is rendered today (sidebar, top header "OM" chip, edit-account modal, account dropdown, profiles modal, friends list in the sidebar, friends panel, friend banner when viewing a friend). Edit flow lives inside the edit-account modal:
  - The avatar circle becomes clickable with a hover state (dimming overlay + edit-pen icon, pure CSS).
  - Clicking it opens a popover menu with **Change avatar** (always) and **Remove avatar** (only when a custom photo is currently set — matches Discord's UX).
  - **Change avatar** opens the system file picker (JPEG/PNG/WebP only), then a new "Edit image" modal lets the user fine-tune the crop with a zoom slider (1×–3×), a 90° rotate button, drag-to-pan inside a circular preview mask (style Discord), a Reset link, and Cancel / Apply buttons. The preview canvas runs at device-pixel-ratio for crisp Retina display; pan is clamped so the rotated+scaled image always covers the crop circle (no transparent gaps).
  - **Auto-format selection on Apply**: a 32×32 alpha probe is run on the source bitmap. Sources with transparency (memojis, illustrations) → PNG square (typically 60–180 KB, preserves source alpha so the avatar's colour gradient bleeds through transparent areas at render time, just like Slack/Discord). Sources without transparency (photos) → JPEG quality 0.85 (typically 30–50 KB). Output is always square 512×512 — the circular look is purely a CSS `border-radius: 50%` decision at render time, not baked into the file.
  - Upload to Firebase Storage at `avatars/{uid}` (predictable path, overwrites previous file on re-upload, cache-busts via rotating download token). URL mirrored to `userProfiles/{uid}.photoURL` so friends + friend-add preview can render it without a Storage probe. Server-side cap at 500 KB (rules) gives headroom for detailed transparent PNGs while still rejecting raw multi-MB phone photos.
  - Render integration via two helpers: a DOM-imperative `_renderAvatarPhotoOverlay(el, url)` (used for elements whose initials are set via `textContent`, like the sidebar avatar) and a template-string `_avatarPhotoTag(url)` (used inside `innerHTML`-built avatar variants). Both return early when `photoURL` is null, so the colour circle + initials show through as the natural fallback.
  - **Friends' avatars** auto-refresh from `userProfiles` on every `loadFriendsList` cycle. Stored in-memory only — denormalising the rotating-token URL into the friends sub-collection would mean every avatar change needs to fan-out to every friend's friend doc.
  - **Other connected accounts' avatars** (non-active) are cached on the `Account` localStorage object during `syncUserDoc` — that way the dropdown / profiles modal render their photo for free at display time, without an extra Firestore read per visible row. Cache refreshes every time that account becomes active again.
  - **9 new i18n keys × 9 locales** (avatarPictureLabel, avatarPickBtn, avatarRemoveBtn, avatarUploading, avatarUploadOk, avatarUploadFailed, avatarTooLarge, avatarRemoving, avatarRemoveOk, avatarRemoveFailed, avatarChangeOpt, avatarRemoveOpt, avatarCropTitle, avatarCropReset, avatarCropCancel, avatarCropApply, avatarCropRotate). All synchronised via `i18n:check`.
  - **New SDK file**: `renderer/lib/firebase/firebase-storage-compat.js` (v9.23.0, 41 KB) loaded alongside the existing Firebase compat libs. Pairs with the new `fbStorage(id)` helper, scoped per-account like `fbDb` / `fbAuth`.

## Changed

## Fixed

## Removed

## i18n
- Added: `avatarPictureLabel`, `avatarPickBtn`, `avatarRemoveBtn`, `avatarUploading`, `avatarUploadOk`, `avatarUploadFailed`, `avatarTooLarge`, `avatarRemoving`, `avatarRemoveOk`, `avatarRemoveFailed`, `avatarChangeOpt`, `avatarRemoveOpt`, `avatarCropTitle`, `avatarCropReset`, `avatarCropCancel`, `avatarCropApply`, `avatarCropRotate` — 17 keys × 9 locales = 153 strings.
