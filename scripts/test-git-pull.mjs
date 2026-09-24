#!/usr/bin/env node
/**
 * Controls for run-cycle's step 1b — fast-forward to main, never fail the cycle.
 *
 *   node scripts/test-git-pull.mjs
 *
 * Every repo is a throwaway: a bare "origin", a "rail" clone (what ~/camprally
 * is) and a "dev" clone (where hand edits are made and pushed). No network — a
 * hung remote is a local TCP port that accepts and never answers.
 *
 * Two halves:
 *   1. scripts/lib/git-pull.mjs directly: fast-forward, diverged, and the
 *      dirty-state cases, where the thing asserted is that NOTHING local is
 *      lost — contents byte-identical, no stash entry, HEAD where it was.
 *   2. run-cycle.mjs itself, end to end. It executes on import, so — as in
 *      test-cycle-backfill.mjs — its REAL source is read at test time and cut
 *      at step 2, with a finish() appended; the fixture runs that. This is what
 *      proves the re-exec runs the NEW code, the lock hand-off works, and a
 *      failed pull still ends in exit 0 with the failure on the receipt.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pullFastForward } from "./lib/git-pull.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const TMP = mkdtempSync(join(tmpdir(), "git-pull-"));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"] }).trim();
const put = (dir, rel, text) => { mkdirSync(join(dir, rel, ".."), { recursive: true }); writeFileSync(join(dir, rel), text); };
const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");
/* The lib runs git with the caller's environment, so point that at the same
 * isolated config the fixtures use — a developer's global hooks or autostash
 * must not decide these results. */
Object.assign(process.env, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" });

let seq = 0;
/** origin (bare) + rail + dev, all at one shared first commit. `files` seeds it. */
function fixture(files = {}) {
  const base = join(TMP, `fx${++seq}`);
  const origin = join(base, "origin.git"), rail = join(base, "rail"), dev = join(base, "dev");
  mkdirSync(base, { recursive: true });
  git(base, "init", "-q", "--bare", "-b", "main", origin);
  git(base, "clone", "-q", origin, dev);
  git(dev, "checkout", "-q", "-b", "main");
  put(dev, ".gitignore", "state/cycle.lock\n");
  put(dev, "state/last-run.json", '{"n":0}\n');
  put(dev, "src/data/articles.ts", "v1\n");
  for (const [rel, text] of Object.entries(files)) put(dev, rel, text);
  git(dev, "add", "-A");
  git(dev, "commit", "-q", "-m", "init");
  git(dev, "push", "-q", "-u", "origin", "main");
  git(base, "clone", "-q", origin, rail);
  return { origin, rail, dev };
}
/** A commit made in dev and pushed — "an edit pushed to main from another clone". */
function devPush(dev, changes, msg = "edit") {
  for (const [rel, text] of Object.entries(changes)) put(dev, rel, text);
  git(dev, "add", "-A");
  git(dev, "commit", "-q", "-m", msg);
  git(dev, "push", "-q", "origin", "main");
}
const head = (repo) => git(repo, "rev-parse", "HEAD");
const stashes = (repo) => git(repo, "stash", "list");
/** pullFastForward must return, never throw — a throw here is itself a failure. */
function pullAt(rail, opts = {}) {
  try { return pullFastForward({ cwd: rail, ...opts }); }
  catch (err) { return { threw: err?.message ?? String(err) }; }
}

/* ── 1. the lib ─────────────────────────────────────────────────────────── */
{
  const { rail } = fixture();
  const r = pullAt(rail);
  check("nothing upstream → up-to-date, ok", r.ok === true && r.status === "up-to-date", JSON.stringify(r));
}
{
  const { rail, dev } = fixture();
  devPush(dev, { "src/data/articles.ts": "v2\n" });
  const r = pullAt(rail);
  check("upstream ahead → fast-forwarded to the upstream commit",
    r.status === "fast-forwarded" && head(rail) === head(dev) && read(rail, "src/data/articles.ts") === "v2\n", JSON.stringify(r));
  check("…and names the files it moved", JSON.stringify(r.files) === '["src/data/articles.ts"]', JSON.stringify(r.files));
}
{
  /* The normal dirty case: a run died before its heartbeat, so state/ holds
   * uncommitted receipts — and main moved on in files state/ does not touch. */
  const { rail, dev } = fixture();
  put(rail, "state/last-run.json", '{"n":"dirty"}\n');
  put(rail, "state/runs/2026-09-24.json", '{"untracked":true}\n');
  devPush(dev, { "src/data/articles.ts": "v2\n" });
  const r = pullAt(rail);
  check("dirty state/, disjoint upstream change → fast-forwards anyway", r.status === "fast-forwarded" && head(rail) === head(dev), JSON.stringify(r));
  check("…the modified receipt is exactly as it was", read(rail, "state/last-run.json") === '{"n":"dirty"}\n');
  check("…the untracked receipt is exactly as it was", read(rail, "state/runs/2026-09-24.json") === '{"untracked":true}\n');
  check("…and nothing was stashed", stashes(rail) === "");
}
for (const autostash of [false, true]) {
  /* The dangerous dirty case: main changed the SAME state file. Git must refuse
   * the whole fast-forward and touch nothing. Run a second time with
   * merge.autoStash on, because `git pull` would honour it and stash the change
   * — the path this step must never take. */
  const label = autostash ? " (merge.autoStash=true in config)" : "";
  const { rail, dev } = fixture();
  if (autostash) git(rail, "config", "merge.autoStash", "true");
  const before = head(rail);
  put(rail, "state/last-run.json", '{"n":"dirty"}\n');
  devPush(dev, { "state/last-run.json": '{"n":"from-dev"}\n', "src/data/articles.ts": "v2\n" });
  const r = pullAt(rail);
  check(`dirty state/ that upstream also changed → refused as local-changes${label}`, r.ok === false && r.status === "local-changes", JSON.stringify(r));
  check(`…HEAD did not move, and no half-applied file${label}`, head(rail) === before && read(rail, "src/data/articles.ts") === "v1\n");
  check(`…the local change survives byte-identical, nothing stashed${label}`,
    read(rail, "state/last-run.json") === '{"n":"dirty"}\n' && stashes(rail) === "", stashes(rail));
}
{
  const { rail, dev } = fixture();
  put(rail, "state/new.json", "local\n");
  devPush(dev, { "state/new.json": "upstream\n" });
  const r = pullAt(rail);
  check("an untracked file upstream would overwrite → refused, file kept",
    r.status === "local-changes" && read(rail, "state/new.json") === "local\n", JSON.stringify(r));
}
{
  const { rail, dev } = fixture();
  put(rail, "state/last-run.json", '{"n":"heartbeat"}\n');
  git(rail, "commit", "-qam", "chore(heartbeat): local");
  const local = head(rail);
  devPush(dev, { "src/data/articles.ts": "v2\n" });
  const r = pullAt(rail);
  check("local commit + upstream commit → diverged, not merged", r.ok === false && r.status === "diverged" && r.ahead === 1 && r.behind === 1, JSON.stringify(r));
  check("…the local commit is untouched", head(rail) === local);
}
{
  const { rail } = fixture();
  put(rail, "state/last-run.json", '{"n":"heartbeat"}\n');
  git(rail, "commit", "-qam", "chore(heartbeat): push failed");
  const r = pullAt(rail);
  check("only ahead (a heartbeat whose push failed) → ok, reports ahead", r.ok === true && r.status === "up-to-date" && r.ahead === 1, JSON.stringify(r));
}
{
  const { rail } = fixture();
  git(rail, "remote", "set-url", "origin", join(TMP, "no-such-remote.git"));
  const r = pullAt(rail);
  check("remote unreachable → fetch-failed, no throw", r.ok === false && r.status === "fetch-failed", JSON.stringify(r));
}
{
  const { rail } = fixture();
  git(rail, "checkout", "-q", "--detach");
  check("detached HEAD → named, no throw", pullAt(rail).status === "detached");
  git(rail, "checkout", "-q", "-b", "loose");
  check("branch with no upstream → named, no throw", pullAt(rail).status === "no-upstream");
}
check("not a repo at all → error status, no throw", pullAt(join(TMP, "nowhere")).status === "error");

/* A remote that accepts the connection and never says a word — the hung
 * network. The listen backlog completes the TCP handshake even while
 * execFileSync blocks this process's event loop, which is exactly the shape of
 * a stalled server. */
{
  const server = createServer(() => { /* accept, then silence */ });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { rail } = fixture();
  git(rail, "remote", "set-url", "origin", `http://127.0.0.1:${server.address().port}/camprally.git`);
  const t0 = Date.now();
  const r = pullAt(rail, { fetchTimeoutMs: 2_000 });
  const secs = (Date.now() - t0) / 1000;
  server.close();
  check(`hung remote → fetch-failed "timed out" within the timeout (${secs.toFixed(1)} s)`,
    r.status === "fetch-failed" && /timed out/.test(r.why) && secs < 5, JSON.stringify(r));
}

/* ── 2. run-cycle.mjs end to end ────────────────────────────────────────── */
/* The REAL file, cut just before step 2 (which is where Amazon, builds and
 * publishing begin) and closed with a finish() whose reason names the code
 * version — so a receipt reading "v2" proves the re-exec ran the NEW code. */
const REAL = readFileSync(join(HERE, "run-cycle.mjs"), "utf8");
const CUT = REAL.indexOf("// ── step 2: link health gate");
if (CUT < 0) {
  console.error("FAIL: could not find step 2 in run-cycle.mjs to cut the harness at");
  process.exit(1);
}
const harness = (ver) => `${REAL.slice(0, CUT)}\nfinish("idle", { reason: "harness-${ver}" }, EXIT.OK);\n`;
const LIBS = ["amazon.mjs", "run-lock.mjs", "run-history.mjs", "git-pull.mjs"];

function cycleFixture() {
  const fx = fixture({ "scripts/run-cycle.mjs": harness("v1") });
  for (const lib of LIBS) {
    for (const repo of [fx.dev]) {
      mkdirSync(join(repo, "scripts/lib"), { recursive: true });
      copyFileSync(join(HERE, "lib", lib), join(repo, "scripts/lib", lib));
    }
  }
  git(fx.dev, "add", "-A");
  git(fx.dev, "commit", "-q", "-m", "libs");
  git(fx.dev, "push", "-q", "origin", "main");
  git(fx.rail, "pull", "-q", "--ff-only");
  return fx;
}
/** Run the harnessed cycle in the rail. HOME is a temp dir so the real pause flag is never read. */
function cycle(rail) {
  const home = join(rail, "..", "home");
  mkdirSync(home, { recursive: true });
  const env = { ...ENV, HOME: home };
  delete env.CAMPRALLY_CYCLE_REEXEC;
  delete env.CAMPRALLY_CYCLE_PULL;
  const r = spawnSync(process.execPath, [join(rail, "scripts/run-cycle.mjs"), "--no-push"], { cwd: rail, env, encoding: "utf8" });
  const last = existsSync(join(rail, "state/last-run.json")) ? JSON.parse(read(rail, "state/last-run.json")) : null;
  const receipts = existsSync(join(rail, "state/runs")) ? readdirSync(join(rail, "state/runs")) : [];
  return { code: r.status, out: `${r.stdout}${r.stderr}`, last, receipts };
}

{
  const { rail, dev } = cycleFixture();
  devPush(dev, { "scripts/run-cycle.mjs": harness("v2"), "src/data/articles.ts": "v2\n" }, "new code");
  const r = cycle(rail);
  check("cycle after a push: exit 0", r.code === 0, r.out.slice(-600));
  check("…the receipt records the fast-forward", r.last?.pull?.status === "fast-forwarded" && r.last.pull.files === 2, JSON.stringify(r.last?.pull));
  check("…and the re-executed child ran the NEW run-cycle (reason harness-v2)", r.last?.reason === "harness-v2" && r.last?.pull?.reexecuted === true, r.last?.reason);
  check("…the child adopted the lock rather than reading it as busy", /adopting the cycle lock/.test(r.out) && !/already-running/.test(r.out), r.out.slice(-600));
  check("…exactly ONE receipt for the run, not one per process", r.receipts.length === 1, r.receipts.join(","));
  check("…and the lock is gone afterwards", !existsSync(join(rail, "state/cycle.lock")));
}
{
  const { rail } = cycleFixture();
  const r = cycle(rail);
  check("cycle with nothing to pull: runs in-process, receipt says up-to-date",
    r.code === 0 && r.last?.pull?.status === "up-to-date" && r.last?.reason === "harness-v1" && !r.last.pull.reexecuted, JSON.stringify(r.last));
}
{
  const { rail, dev } = cycleFixture();
  put(rail, "state/last-run.json", '{"n":"dirty"}\n');
  git(rail, "commit", "-qam", "chore(heartbeat): push failed");
  devPush(dev, { "src/data/articles.ts": "v2\n" });
  const r = cycle(rail);
  check("cycle on a diverged rail: still exit 0, carries on with the local tree",
    r.code === 0 && r.last?.reason === "harness-v1", r.out.slice(-600));
  check("…and the receipt says diverged, with both counts", r.last?.pull?.status === "diverged" && r.last.pull.ahead === 1 && r.last.pull.behind === 1, JSON.stringify(r.last?.pull));
}
{
  const { rail } = cycleFixture();
  git(rail, "remote", "set-url", "origin", join(TMP, "gone.git"));
  const r = cycle(rail);
  check("cycle with the remote unreachable: exit 0, receipt says fetch-failed",
    r.code === 0 && r.last?.pull?.status === "fetch-failed" && r.last?.reason === "harness-v1", JSON.stringify(r.last?.pull ?? r.out.slice(-400)));
}

rmSync(TMP, { recursive: true, force: true });
if (failures) {
  console.error(`\n${failures} control(s) failed`);
  process.exit(1);
}
console.log("\nall git-pull controls passed");
