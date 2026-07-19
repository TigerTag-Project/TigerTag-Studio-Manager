# Code reviews

One file per review, kept permanently. A review is only worth the hour it takes if the
next one can see what the last one found — which of its findings were fixed, which were
judged not worth fixing, and whether the same weakness keeps coming back.

## Naming

`YYYY-MM-DD-<scope>.md` — date first so the directory sorts chronologically.
Scope is `full-project`, or the area reviewed (`security`, `printers`, `firestore-rules`).

## Running one

Point the reviewer at `../REVIEW-BRIEF.md` — it carries the standing scope, the six axes,
and the output format. The report lands here; nothing else in the repo is modified.

## Cadence

Run a full review at least every few releases, and always before a release that changes
the data model, the security rules, or anything a third party integrates against.
A targeted review (one axis, one subsystem) is cheaper and worth running more often.

## After a review

Work the *Quick wins* table first — it is ranked and each item is scoped to about an hour.
Then record what happened: mark each finding fixed, deferred with a reason, or rejected as
wrong. An unannotated report reads to the next reviewer as if nothing was ever done about it.

## History

| Date | Scope | Headline |
|---|---|---|
| [2026-07-19](2026-07-19-full-project.md) | Full project — code, process, brand/IP | Healthy and unusually mature for a solo project. Two stored-XSS holes reachable from a friend's data are the one urgent fix; no CSP; `shell.openExternal` unrestricted. Business/IP foundations already further along than expected. **Six of nine quick wins fixed same day (`909ffc0`, `ab9922b`); CSP deferred pending a camera pass; two need the founder.** |
