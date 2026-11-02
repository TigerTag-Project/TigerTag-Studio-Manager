# Token and time efficiency

**Rule.** Optimize total tokens and wall-clock without lowering quality: one subject per session, locate code through the CODEMAPs, read slices not files, hand repeatable work to the project's specialised agents (cheaper models, fixed briefs), never fan out parallel agents for generation, verify with text before images, and keep answers short.

**Why.** The founder pays per token; a 3-agent release fan-out cost ~190k tokens (93% waste), a sub-agent burned 131k tokens on a lookup the founder could have named in one file, and one conversation that chained ten unrelated subjects re-read its whole history on every message.

**How.**
- **One subject = one session.** Every message re-reads the whole conversation: when the work moves to an unrelated subject, propose a new session instead of carrying on (the founder may also open one). Long-running work the founder wants to steer himself (a feature over days) gets its own session; two sessions never write the same files.
- **Pick the cheapest tool that fits:**
  - a few tool calls (one search, one read, one edit) → do it yourself; an agent costs more than that;
  - locating code → `codemap-explorer` (Haiku), returns `file:line`;
  - one self-contained edit → `simple-task` (Sonnet);
  - Dark / Light theme fixes → `theme-fixer` (Sonnet);
  - strings in the 11 locales → `i18n-writer` (Sonnet);
  - release copy (CHANGELOG, release note, What's New) → `release-notes` (Sonnet), the ONE agent `release.md` allows;
  - a GitHub issue → `issue-triage` (Haiku): reads it, downloads its screenshots, locates the code, reports.
  Refactors, debugging, architecture, git/gh and deploys stay on the main loop.
- **Brief agents in a few lines:** the exact files, what done looks like, how to verify. An agent that has to rediscover the context burns the tokens it was meant to save. Ask the founder for the file when he can name it, before delegating a search.
- **Never fan out** parallel agents for one piece of work.
- `renderer/CODEMAP.md` (inventory.js) and `CODEMAP-main.md` (main.js) → `grep -n anchor` → `Read` with offset/limit. Never read either file whole.
- **Text before images:** check the dev app with `npm run drive -- eval …` first; one screenshot of the element (`shot <file> "<selector>"`) at the end, not of the whole window, not one per step.
- Short answers by default; detail only when asked. Warn when the context passes ~60k tokens.
