# Release

**Rule.** A release follows one fixed sequence, generated inline on the main loop: decide the version → refresh bundled data → CHANGELOG → release note → What's New → FEATURES / llms.txt / README / CODEMAP → validators → commit → tag → push → watch build → publish latest → reset WORKLOG + bump version.

**Why.** Skipped steps shipped stale data (v2.37.0 almost shipped a month-old catalogue); a 3-agent fan-out of the generation cost ~190k tokens for no quality gain.

**How.**
- Version (SemVer, decide yourself): PATCH by default; MINOR when `Added` holds a real new capability; MAJOR only after the founder confirms. Correct the placeholder everywhere (`package.json`, CHANGELOG heading, `data/release-notes/vX.Y.Z.md`, whatsnew key, FEATURES tags).
- Data: `cd assets/db/tigertag && python3 db_update.py` before every build; commit what it changed.
- Copy: the three registers (`copy-registers.md`); What's New rules in `whats-new.md`. Release note footer copied from the previous version's file.
- Trophies: the release adds its batch of trophies (`trophies.md`), listed in the copy.
- FEATURES.md: new capabilities only, tagged `(vX.Y.Z)`. llms.txt: when the data model, architecture or vocabulary changed. README: when a visitor should know the new capability exists.
- Validators: `npm run i18n:check`, `whatsnew:check`, `codemap:check`, `docs:check`, `node --check`.
- Generate inline; if the context is too large, ONE general-purpose agent at most, never a fan-out. The version decision, validators and all git/gh stay on the main loop.
- After the tag: reset `WORKLOG.md`, bump `package.json` to the next patch, both uncommitted.
