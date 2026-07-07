# Worklog — v2.0.1 (in progress)

## Added

## Changed
- README: title is now "Tiger Studio Manager 2" (version-2 milestone); refreshed the outdated "Project structure" tree (services/nfc-process.js, IoT/, rfid_protocol/, anycubic + shared printer files, 10 CSS files, data/ subfolders, scripts/, docs/, CODEMAP-main.md, ROADMAP.md, updated CI comment) and fixed "5 → 6 supported brands"; also documented the printer `tags` field in `docs/firestore-schema.md` (+ mirrored a cross-app note into the backend repo README) — `README.md`, `docs/firestore-schema.md`
- Documented an automatic SemVer bump policy in `CLAUDE.md` (release ritual): decide MINOR (new feature/capability in Added) vs PATCH (only fixes/tweaks/i18n/internal) from the WORKLOG contents, MAJOR stays human-confirmed; the post-release bump is now framed as a PATCH placeholder corrected at the next release if warranted — `CLAUDE.md`

## Fixed
- Release naming: the new `prepare-release` job created the GitHub Release with its name defaulting to the tag (`v2.0.0`) instead of the historical `2.0.0`. Both `softprops/action-gh-release` steps now set `name:` to the version with the leading `v` stripped (`${GITHUB_REF_NAME#v}`, `shell: bash` on the Windows runner) — `.github/workflows/build.yml`. (The already-published v2.0.0 release was renamed to `2.0.0` via the API.)

## Removed

## i18n
