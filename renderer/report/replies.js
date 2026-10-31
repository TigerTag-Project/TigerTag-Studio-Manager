/**
 * report/replies.js — which of "My requests" received a reply since the user last
 * looked. Pure functions (no DOM, no storage): the module keeps the `seen` map in
 * localStorage and raises the notifications.
 *
 * `seen` is { [reportId]: replyCount } as it was the last time the user opened
 * "My requests". A reply is a count above the one remembered. The count is the
 * server's `replies` — comments from the TEAM only (owner / members /
 * collaborators, never the app's own account), so the user's own comments on
 * GitHub and the app's "closed by the reporter" note are not announced. A
 * server that predates it only sends `comments` (every comment): fallback.
 */
const replyCount = r => Number(r.replies ?? r.comments) || 0;

/**
 * @param {Array<{id:string, comments?:number}>} list  the requests, as synced
 * @param {Object<string,number>} seen                  last-seen reply counts
 * @returns {{ fresh: Array, next: Object<string,number> }}
 *   fresh — requests with more replies than remembered
 *   next  — `seen` plus a silent baseline for requests met for the first time
 *           (so the whole history is not announced at once). The count of a
 *           request in `fresh` is NOT advanced: it stays unseen until the user
 *           looks, so the notice survives a restart.
 */
export function repliesSince(list, seen, { skipStatus = ["cancelled"] } = {}) {
  const next = { ...(seen || {}) };
  const fresh = [];
  for (const r of list || []) {
    if (!r || r.id == null) continue;
    const n = replyCount(r);
    if (!(r.id in next)) { next[r.id] = n; continue; }   // first sighting: baseline, silent
    // A request the user closed himself: nothing to announce, and its count follows
    // so that a comment left on it does not pile up as "unseen".
    if (skipStatus.includes(r.status)) { next[r.id] = n; continue; }
    if (n > next[r.id]) fresh.push(r);
  }
  return { fresh, next };
}

/** Every request marked as seen at its current reply count. */
export function seenAll(list) {
  const m = {};
  for (const r of list || []) if (r && r.id != null) m[r.id] = replyCount(r);
  return m;
}

/** Unseen team replies on one request (0 when never seen: first sightings are silent). */
export function unseenReplies(r, seen) {
  return r && seen && r.id in seen ? Math.max(0, replyCount(r) - seen[r.id]) : 0;
}

/**
 * What the alert window announces after a sync: requests with an unseen team
 * reply or a status the user has not seen yet, and not already announced in that
 * same state (`alerted` = { [id]: "status:replies" } as last shown).
 * @returns {{ news: Array<{r, reply: boolean, status: boolean}>, statusNext: Object, alertedNext: Object }}
 *   statusNext — `statusSeen` plus a silent baseline for requests met for the first time.
 */
export function alertNews(list, seen, statusSeen, alerted, { skipStatus = ["cancelled"] } = {}) {
  const statusNext = { ...(statusSeen || {}) }, alertedNext = { ...(alerted || {}) };
  const news = [];
  for (const r of list || []) {
    if (!r || r.id == null) continue;
    if (!(r.id in statusNext)) { statusNext[r.id] = r.status; continue; }
    if (skipStatus.includes(r.status)) { statusNext[r.id] = r.status; continue; }
    const reply = unseenReplies(r, seen) > 0, status = statusNext[r.id] !== r.status;
    const key = `${r.status}:${replyCount(r)}`;
    if ((reply || status) && alertedNext[r.id] !== key) { news.push({ r, reply, status }); alertedNext[r.id] = key; }
  }
  return { news, statusNext, alertedNext };
}
