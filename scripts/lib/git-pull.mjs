/**
 * Bring the rail's checkout up to date with its upstream, fast-forward only.
 *
 * WHY THIS EXISTS. run-cycle never pulled. The rail runs in ~/camprally, while
 * hand edits (SEO rewrites, brief fixes, script changes) are made in another
 * clone and pushed to main — so they reached the rail only when someone pulled
 * by hand. Until then the rail published from a stale tree, step 2g could not
 * announce edits it could not see, and every heartbeat push was rejected as
 * non-fast-forward because the remote had moved on.
 *
 * NEVER THROWS, NEVER FAILS THE CYCLE. A pull that cannot happen — diverged
 * history, local commits, the network down, a credential prompt, a hang — is
 * returned as a named status, the caller writes it on the receipt, and the
 * cycle carries on with the tree it already has. Publishing from yesterday's
 * tree is the status quo; stopping the pipeline over a pull would not be.
 *
 * NEVER DISCARDS ANYTHING. Fast-forward only, no reset, no stash. Git's own
 * merge machinery is the safety here: a fast-forward that would overwrite an
 * uncommitted change (state/ left dirty by a run that died before its
 * heartbeat) or an untracked file is REFUSED by git with nothing touched, and
 * one that only moves files the local changes do not touch goes ahead and
 * leaves those changes exactly where they were. The heartbeat then commits
 * them as it always has. The controls in scripts/test-git-pull.mjs pin both.
 *
 * Why fetch + `merge --ff-only` and not `git pull --ff-only`: the same
 * operation, but `pull` also consults pull.rebase and merge.autoStash from the
 * user's config, and autostash is precisely the stash-and-maybe-conflict path
 * this must never take. Spelled out, the behaviour does not depend on config.
 */

import { execFileSync } from "node:child_process";

/* The network half. Long enough for a slow fetch of a repo this size, short
 * enough that a dead network costs one cron cycle a minute, not the cycle. */
export const FETCH_TIMEOUT_MS = 60_000;
/* The local half. A fast-forward is a checkout of changed files; seconds. */
export const LOCAL_TIMEOUT_MS = 20_000;

/**
 *   { ok: true,  status: "up-to-date" | "fast-forwarded", from, to, files }
 *   { ok: false, status: "diverged" | "local-changes" | "fetch-failed" |
 *                        "no-upstream" | "detached" | "merge-failed" | "error", why }
 *
 * `ok` means "the checkout matches upstream, or is only AHEAD of it" (a
 * heartbeat whose push failed; the next push carries it). `ahead` is reported
 * either way, because an unpushed commit plus a moved remote is how
 * "diverged" starts.
 */
export function pullFastForward({ cwd, fetchTimeoutMs = FETCH_TIMEOUT_MS, localTimeoutMs = LOCAL_TIMEOUT_MS } = {}) {
  const git = (args, timeout = localTimeoutMs) =>
    execFileSync("git", args, {
      cwd, encoding: "utf8", timeout, killSignal: "SIGKILL",
      stdio: ["ignore", "pipe", "pipe"],
      // No credential prompt: there is nobody at a cron's terminal to answer
      // it, and a prompt waits until the timeout kills it.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trim();
  const why = (err) => {
    if (err?.signal === "SIGKILL" || err?.code === "ETIMEDOUT") return "timed out";
    // Git leads with the "fatal:"/"error:" line and pads with advice; keep the lead.
    return String(err?.stderr || err?.message || err).split("\n").map((l) => l.trim()).filter(Boolean)
      .slice(0, 2).join(" ").slice(0, 240);
  };

  try {
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch === "HEAD") return { ok: false, status: "detached", why: "HEAD is detached — nothing to pull into" };

    let upstream;
    try { upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]); }
    catch { return { ok: false, status: "no-upstream", why: `${branch} has no upstream branch` }; }

    try { git(["fetch", "--quiet", "--no-tags"], fetchTimeoutMs); }
    catch (err) { return { ok: false, status: "fetch-failed", why: why(err) }; }

    const from = git(["rev-parse", "HEAD"]);
    const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...@{u}"]).split(/\s+/).map(Number);
    if (!behind) return { ok: true, status: "up-to-date", from, to: from, files: [], ...(ahead ? { ahead } : {}) };
    if (ahead) {
      return {
        ok: false, status: "diverged", ahead, behind,
        why: `${ahead} local commit(s) not on ${upstream} and ${behind} upstream commit(s) not here — needs a human rebase or merge`,
      };
    }

    try {
      git(["merge", "--ff-only", "--no-autostash", "--quiet", "@{u}"]);
    } catch (err) {
      const msg = why(err);
      // Git refused before touching anything: an incoming commit changes a file
      // that is modified (or untracked) here. Nothing to clean up.
      const blocked = /would be overwritten|untracked working tree files/i.test(String(err?.stderr ?? ""));
      return { ok: false, status: blocked ? "local-changes" : "merge-failed", behind, why: msg };
    }
    const to = git(["rev-parse", "HEAD"]);
    const files = to === from ? [] : git(["diff", "--name-only", from, to]).split("\n").filter(Boolean);
    return { ok: true, status: "fast-forwarded", from, to, behind, files };
  } catch (err) {
    return { ok: false, status: "error", why: why(err) };
  }
}
