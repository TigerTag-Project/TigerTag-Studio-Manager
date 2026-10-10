/**
 * report/replies.js — which of "My requests" received a reply since the user last
 * looked. Pure functions (no DOM, no storage): the module keeps the `seen` map in
 * localStorage and raises the notifications.
 *
 * `seen` is { [reportId]: replyCount } as it was the last time the user opened
 * "My requests". The server already returns each request's current reply count
 * (`comments`), so a reply is simply a count above the one remembered. It cannot
 * tell WHO wrote the comment — a reply the user wrote on GitHub counts too.
 */

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
    const n = Number(r.comments) || 0;
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
  for (const r of list || []) if (r && r.id != null) m[r.id] = Number(r.comments) || 0;
  return m;
}
