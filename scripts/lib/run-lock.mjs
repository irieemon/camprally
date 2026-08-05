/**
 * A single-holder lock so two cycles never share the working tree.
 *
 * Nothing prevented overlap before this. The cron fires at 09:00, 14:00 and
 * 19:00, and a normal cycle finishes in seconds — but a cycle that stalls on a
 * slow Amazon fetch or a long build is still holding the repo when the next one
 * starts, and both then run `git add`/`git commit` against the same worktree.
 * The failure is rare and ugly: interleaved commits, a publish rolled back by
 * the other run's checkout, or a spec written by one cycle committed by the
 * other under a different slug's message.
 *
 * Deliberately not flock(2): the lock has to survive being inspected by a human
 * asking "why is nothing publishing", so it is a readable JSON file naming the
 * pid and the start time.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";

/**
 * A crashed run must not wedge the pipeline forever, so a lock is reclaimable
 * two ways: the owning process is gone, or the lock is older than any honest
 * cycle. Two hours is far beyond the minutes a real cycle takes and far below
 * the five hours until the next cron, so a stolen lock never races a live run.
 */
const STALE_MS = 2 * 60 * 60 * 1000;

function alive(pid) {
  try {
    // Signal 0 performs the permission and existence check without delivering
    // anything. Throws ESRCH when no such process exists.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, owned by someone else
  }
}

/**
 * Take the lock, or explain who holds it.
 *
 * Returns { ok: true, release } or { ok: false, holder, reason }. Callers are
 * expected to record the refusal as an outcome rather than throw — "another
 * cycle is running" is a legitimate thing for a cron to discover.
 */
export function acquire(path) {
  if (existsSync(path)) {
    let holder = null;
    try {
      holder = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // A truncated lock file is itself evidence of a crash mid-write.
      holder = null;
    }
    const age = holder?.startedAt ? Date.now() - Date.parse(holder.startedAt) : Infinity;
    const held = holder?.pid && alive(holder.pid) && age < STALE_MS;
    if (held) {
      return { ok: false, holder, reason: `pid ${holder.pid} started ${holder.startedAt}` };
    }
    // Stale or orphaned — reclaim it, but say so. A cycle that silently steals
    // locks hides the crash that left one behind.
    console.log(
      `(reclaiming stale lock: ${holder?.pid ? `pid ${holder.pid} ` : ""}` +
      `${Number.isFinite(age) ? `${Math.round(age / 60000)}m old` : "unreadable"})`,
    );
  }

  writeFileSync(path, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2) + "\n");

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      // Only remove a lock we still own. If ours went stale and another cycle
      // reclaimed it, deleting on the way out would strand that one unlocked.
      const cur = JSON.parse(readFileSync(path, "utf8"));
      if (cur.pid === process.pid) unlinkSync(path);
    } catch { /* already gone */ }
  };

  // finish() calls process.exit(), which still runs exit handlers.
  process.on("exit", release);
  return { ok: true, release };
}
