# ADR-0001: Remediating a dead affiliate product in published articles

## Status
Accepted (2026-09-22). Proposed the same day; Sean approved it with all four recommended open decisions (see "Decisions recorded" below).

## Context
`scripts/run-cycle.mjs` step 2 (lines 269-281) runs `refresh-asins.mjs`. If that exits 1, the cycle ends `blocked / dead-links` with the message "Fix before publishing more." Commit 507e57e changed `refresh-asins` to fail on any *cached* DEAD verdict among referenced ASINs, not only on ASINs re-checked in the current run. The gate now clears in only two ways: a later check records the ASIN LIVE, or no file under `src/` or `specs/` references it any more. As a detector, this is correct. As a publish gate, it means one discontinued product stops all new publishing until a human edits three files by hand.

Live case: **B07F2VP353** (Fire-Maple Fixed Star 1), DEAD since 2026-09-19. **The brief undercounts the damage. Three guides reference it, not two.** `budget-camping-cookware-that-works` links it too (`articles.ts:3093-3097`, `article-sections.ts:484`), and that guide has **no spec file**. Its last committed catalog price was **$49.95** (`git show 21eb5e8^:src/data/catalog.json`), not ~$60-70. `asin-cache.record()` keeps no price, so the only price anchor for a dead product is git history. The `dispersed-camping-beginners-guide` spec stores a truncated label (`"Fire-Maple Fixed Star 1 Backpackin"`), so name matching cannot rely on spec labels.

Existing machinery this builds on:
- **Canopy search:** `scripts/lib/discover.mjs` `discover(term,{min,max})` enforces the price band and drops products with fewer than 50 ratings. Results are cached in `state/discovery-cache.json`, and the quota is recorded in `canopy-quota.mjs`. This is the only source of new products, because PA-API is closed (`price-source.mjs` header).
- **Link checks:** `verifyAsin` returns LIVE, DEAD or UNKNOWN.
- **Content review:** `content-review.mjs` provides `hazardFlags` (deterministic, blocking) and `reviewContent` (the 3-seat `panel("reviewer")`, 2-of-3 vote, returns null when fewer than 2 passes come back).
- **Cycle plumbing:** atomic three-file edit with restore-on-build-failure in `publish-article.mjs`, the `content-skips.json` attempt pattern, and the receipt → `announce-run.mjs` → Telegram path.

Sean decided the policy, and it is not reopened here: **auto-swap, gated by review.** If no good match exists or review fails, unlink the product, keep the text, and alert him. New articles keep publishing either way.

## Options Considered
**A. Keep the gate and alert only.** This is today's behaviour plus a louder message. It contradicts Sean's decision and leaves publishing stalled for as long as a human takes to act. Rejected.

**B. Unlink only, no swap.** Deterministic, free, and it cannot fail review. It clears the gate in one cycle. The cost: every dead product permanently loses affiliate revenue, and the article keeps recommending something readers cannot buy. It is the right *fallback*, but it is not the decision Sean made.

**C. A separate remediation step in the cycle: swap first, then unlink, bounded by attempts and a deadline (chosen).** A new `scripts/remediate-dead-asins.mjs` runs when `refresh-asins` reports DEAD. It handles at most one dead ASIN per cycle and ends in one of three states: swapped, unlinked, or pending with a deadline. It never ends in "blocked". New articles publish in the same cycle.

## Decision
When `refresh-asins` reports a DEAD referenced ASIN, `run-cycle` stops blocking. It calls `remediate-dead-asins.mjs` for the oldest unresolved dead ASIN, commits whatever that produced, then continues to the publish step. The run is reported as `warn`, not `blocked`. The detailed rules are below.

**Detection and ledger.** A new file, `state/dead-link-remediation.json`, is keyed by dead ASIN and holds:
- `detectedAt`
- `anchorPrice` and its source commit
- `aliases`
- `attempts`
- `triedCandidates[]`
- `perArticle{slug: {outcome, replacement, commit, findings}}`
- `status`: `pending`, `swapped`, `unlinked` or `mixed`
- `deadline`: `detectedAt` + 72h

An ASIN that is referenced **only** by an unpublished spec is not swapped. It is dropped from that spec, and that spec's own publish review covers the text.

**Candidate selection. Canopy is the only source; the catalog is not a source.**
- **Search term:** built deterministically from the cached Amazon title. Drop the colour and size text after the comma, the leading brand, and model tokens (anything with digits or in all caps). "Fire-Maple Fixed Star 1 … Stove System, Black 18oz" becomes "backpacking camping stove system". No model is used, because the `cheap` role leads with MiniMax.
- **Price band:** 0.7× to 1.3× `anchorPrice`, and no higher than the article's own `priceCeiling(title)`. For B07F2VP353 that is $35-$65, which correctly excludes the $109.99 Jetboil Zip.
- **Filters:**
  - Type check: the candidate title must contain the head noun and the qualifier from the dead title ("stove" plus "system", "pot" or "integrated").
  - Form-factor check: when the full dead title names a form factor the head noun does not pin down, the candidate must keep it. Today there is one, the integrated cook system (burner and heat-exchanger pot as one unit, Jetboil-class), detected by "stove/cooking system", "integrated", "heat exchanger" or "all-in-one". A qualifying candidate must carry one of those signals and none of the look-alike signals of a pot set sold with a separate stove ("cooking set", "cookware", "mess kit", "pots and pans", "N pcs", "pot & … stove", "set … with … stove"). The look-alike signals veto, because those sets often carry integrated-sounding words too. The rule is derived from the dead title, never keyed to an ASIN, and a dead product with no form factor is unaffected. If nothing in the band qualifies, the ASIN is unlinked; the band is not widened to force a match. Added 2026-09-22 after a dry run picked the Fire-Maple Petrel G3 pot + Greenpeak 1 stove set for the Fixed Star 1 and two review seats flagged it.
  - Rating ≥ 4.2.
  - Not already linked from the same article.
  - Never in `triedCandidates`, never DEAD in the ASIN cache.
- **Freshness:** a Canopy search older than 7 days is refetched (one request). Before any rewrite, the chosen candidate must come back LIVE from `verifyAsin` and that verdict is written to the ASIN cache, because the publish path fails closed on anything not LIVE.
- **One candidate per attempt.** A second attempt takes the next-ranked candidate.

**Where the swap reaches. Resolve every place the product appears before any rewrite.** Aliases are the full label from `article-sections.ts`, then brand+model ("Fire-Maple Fixed Star 1"), then the model name alone ("Fixed Star 1"). They are matched case-insensitively across every article. For each referencing slug:
1. Inline `/dp/ASIN` links in `articles.ts` content, both anchor text and target.
2. The product's `###` section: heading, paragraphs, and the "Check the X on Amazon" call-to-action line.
3. Every other sentence that names an alias, including comparison and verdict paragraphs (`articles.ts:3412`, `:3107`).
4. `excerpt`, `title`, `gridTitle`, and hero alt text, if they name the product.
5. The product grid entry in `article-sections.ts`.
6. `specs/<slug>.json`: `products[]` and `body`, when a spec exists. Otherwise a later spec re-render would bring the dead product back.
7. Other guides that name the product in anchor text. There are none today, but the check must run every time (see the title-change sweep lesson).

Generated files are rebuilt, never hand-edited: `catalog.json` (`build-catalog`), `product-images.json` (`backfillPhotos`), and `public/search-index.json` (`build-search-index`).

**Rewrite.** One `callRole("writer")` call per article. The model receives only the segments found above, each with the neighbouring paragraph as context, plus the candidate's title, rating and review count, and **no price**. It returns replacements keyed by segment ID. It may also answer "not the same kind of product", which rejects the candidate. The rewrite is then checked mechanically:
- Only the segments that were sent come back.
- Text outside those segments is unchanged, byte for byte.
- No aliases of the dead product remain.
- No `$x.xx` cent prices and no backticks.
- Length stays within ±40% per segment.
- The new link uses the `camprally-20` tag.
- Splicing the rewrite back in neither adds nor removes a paragraph break.

These checks all run before the review panel, so a rewrite that would be refused never costs three review calls. `applySwap` repeats the splice check as the last word before anything is written.

**Review gate. It fails closed for swaps.** The review input is a small spec built from the article title plus the rewritten segments and their context, with the new product in `products[]`.
- Pass requires `hazardFlags` to be empty, `reviewContent` to be non-null, and `blocking` to be empty.
- A null review (fewer than 2 passes came back) counts as a **deferral**, not a pass. This is the opposite of the new-article policy, and deliberately so: here the fallback is a safe unlink, so there is no pressure to wave a swap through.
- Each article gets its own verdict. One product can end up swapped in two guides and unlinked in the third.

**Publish path.** All edits are applied with the same backup and restore-on-failure approach `publish-article.mjs` uses. After editing, `check-internal-links` and `check-price-claims` run on the touched articles, then the full build. A swapped article gets `updated` set to today; an unlinked one does not. `run-cycle` commits it as `fix(links): <dead> → <new> in N guides` (or `unlink <dead>`), pushes, and checks the deploy, all before the new-article step.

**Unlink fallback. Deterministic, no model.** It covers these cases:
- No candidate found.
- The candidate failed the type check or was not LIVE.
- The review rejected the swap.
- 2 attempts have been used.
- The 72h deadline has passed with the ASIN still pending. Deferrals don't use up attempts, but they do run down the clock.
- The ASIN being dead is itself a replacement this pipeline swapped in within the last 30 days. This rule stops swap churn.

The unlink removes the link markup and keeps the anchor text. It deletes the call-to-action line and the grid and spec entries. Once no file under `src/` or `specs/` references the ASIN, `refresh-asins` clears on its own. No new exemption list is needed.

**Alerts.** `announce-run.mjs` gets two new reasons:
- `dead-link-swapped`: informational. Names the old and new product, the guides changed, and the commit.
- `dead-link-unlinked`: action item. Names the product, the guides, and why it was unlinked, and notes that the text still names a product readers cannot buy.

The receipt carries `deadLinks[]`, each with status, attempts and deadline, so the dashboard shows a pending remediation as a warning.

**Gate change.** A dead link blocks the cycle only when remediation leaves the tree dirty, or when the unlink itself fails to build. It no longer blocks while a swap is pending, after a swap, or after an unlink. `refresh-asins` stays exactly as 507e57e left it.

**Budget per cycle.**
- At most 1 dead ASIN.
- At most 1 Canopy search (usually a cache hit).
- Per affected article: 1 writer call and 3 reviewer calls, plus at most ONE retry (1 writer call and 3 reviewer calls) when the first draft is refused — so at most **8 metered calls per article per attempt** (amended 2026-09-22 with the writer retry, below; was 4). B07F2VP353 has 3 guides, so that is at most **24 metered calls per attempt and 48 per ASIN over its lifetime** (was 12 and 24). A retry whose draft fails the free mechanical check costs 1 call, not 4.
- The unlink path makes zero model calls.

Behavioural tests Colby writes, each for a stated reason:
- **Sabotaged swap (positive control).** Feed a rewrite that says to run the stove inside the tent for warmth, and a second that invents a cent price. Both must be rejected and must fall through to unlink, because a gate that has never rejected anything is unverified.
- **Wrong-type candidate.** A lantern ASIN in band must fail the type check, because a mismatched product that reads fluently is exactly what review would miss.
- **Review returns null.** A 1-of-3 panel must defer, not pass.
- **Spec re-render.** After a swap or unlink, no referenced file contains `B07F2VP353`, so re-rendering a spec cannot bring it back.
- **Deadline.** A ledger entry older than 72h goes straight to unlink with no model calls.

**First live run:** B07F2VP353, band $35-$65, three guides (including the spec-less cookware guide). Run `--dry-run` first and compare its reported locations against the 7-point list above, then run it for real.

### Factual Claims
- `scripts/run-cycle.mjs:269-281` finishes `blocked/dead-links` when `refresh-asins.mjs` exits `EXIT.FAIL`
- `scripts/refresh-asins.mjs` `stillDead()` gates on cached DEAD verdicts across ASINs scanned from `src/` and `specs/` (excluding `quarantine/`)
- `scripts/lib/asin-cache.mjs` `record()` stores only verdict/title/checkedAt — no price
- `scripts/lib/discover.mjs` exports `discover(term,{min,max,force,nowIso})` and `priceCeiling(text)`; it throws `code:"QUOTA"` on Canopy exhaustion
- `scripts/lib/content-review.mjs` exports `hazardFlags(spec)` and `reviewContent(spec)`; `reviewContent` returns null when fewer than 2 passes answer
- `scripts/lib/llm.mjs` `roleCandidates.cheap` leads with MiniMax (not free); `writer` is MiniMax-M3 → Gemini → M2.7
- `specs/budget-camping-cookware-that-works.json` does not exist; the guide references B07F2VP353 at `articles.ts:3093-3097` and `article-sections.ts:484`
- `specs/dispersed-camping-beginners-guide.json` stores the label truncated as "Fire-Maple Fixed Star 1 Backpackin"
- B07F2VP353's last catalog record (`21eb5e8^`) is `priceValue: 49.95`, rating 4.5, 2594 ratings
- `scripts/announce-run.mjs` maps receipt `reason` to Telegram text and has a `dead-links` entry

### LOC Estimate
~550 lines changed across 6 files (new remediation script ~350, tests ~150, run-cycle/announce-run/receipt ~50).

## Rationale
Option C keeps every piece of existing judgement: Canopy's band enforcement, the fail-closed LIVE check, and the cross-lineage panel. It adds one bounded step that is guaranteed to finish. The 72h deadline together with a deterministic unlink means **no failure mode can stall publishing again**. Quota exhaustion, a MiniMax weekly cap, and Amazon throttling all end, at worst, in an unlink three days later. Option B would give up revenue on every dead product just to save 12 model calls. Failing closed on a null review costs little because the fallback is safe. Failing open would mean an unreviewed product claim goes live on an article that is already indexed.

Risk shape:
- **Search term too loose.** If the deterministic term is too broad, the type check will reject every candidate and everything will unlink. Revisit the term logic if the unlink-to-swap ratio passes about 50% over the first five dead ASINs.
- **Alias list too narrow.** If it misses a short form ("the Fire-Maple"), a stale sentence survives the swap and names a product no longer linked. The dry-run location report on B07F2VP353 is the check.
- **Excluded from scope:** re-verifying the prose accuracy of the rest of a swapped article, and the lazlo-ops Exception Handler taking unlinked products as a new exception class. That is a reasonable follow-up once unlinks exist to handle.

## Falsifiability
Revisit this decision if any of the following happens:
- Any cycle after rollout ends `blocked/dead-links` for a reason other than a failed unlink build.
- A swapped guide ships a product of the wrong type, or a claim Sean corrects by hand.
- One ASIN uses more than 48 model calls (24 before the writer retry was added).
- A dead ASIN comes back after a spec re-render.

## Decisions recorded (Sean, 2026-09-22)
All four open decisions were settled as recommended:
1. **Price band:** ±30% of the last known price, capped by the article's own "under $N" (the lowest cap when one replacement serves several guides). `PRICE_BAND` in `scripts/lib/dead-link-remediation.mjs`.
2. **`updated` on an unlinked article:** not set. A swap sets it to today; an unlink does not.
3. **Unlink handling:** remove only the "Check the X on Amazon" call-to-action and the link markup (anchor text kept); the product's `###` section text stays.
4. **Swap deadline:** 72 hours from detection, then a deterministic unlink. `DEADLINE_HOURS`.

## Implementation notes (2026-09-22)
Places where the ADR left room and the code took a position:
- **Attempts vs deferrals.** A candidate that verifies DEAD, or that the writer says is "not the same kind of product", is a *rejected candidate*: it goes into `triedCandidates` and uses one attempt; the next cycle takes the next-ranked result. Amazon throttling (UNKNOWN), Canopy quota, an unreachable writer and a null review are *deferrals*: no attempt used, clock still running. No candidate passing the filters unlinks immediately.
- **Per-article gate failure unlinks that article.** A rewrite that fails the mechanical checks, trips `hazardFlags`, or gets a blocking review finding is unlinked in that guide; the others can still swap (`mixed`). A deferred guide keeps the same candidate for the next cycle.
- **Headings are exempt from the ±40% length rule** and held to "one line, no longer than the new name plus ~30 characters" instead. A heading is the product name, so it grows with the replacement's name; the first real dry run unlinked a correct swap for exactly that.
- **Swap that fails the build** is restored and replaced, in the same run, by the deterministic unlink. Only an unlink that fails to build exits 1 and blocks the cycle.
- **Spec body drift.** Segments are replaced in `specs/<slug>.json` verbatim; any remaining `/dp/<dead>` link is rewritten to the replacement, and a leftover alias counts as residue, which unlinks that guide.
- **Receipt/alert shape.** The run keeps its normal outcome (`published`, `idle`, …) and carries `deadLinks[]` (every pending entry) and `deadLinkEvent` (only when this run changed a guide). `announce-run` appends the swap (informational) or unlink (action item) sentence to the run's one message. Showing `deadLinks[]` as a dashboard warning is a lazlo-ops change and has not been made.

- **Grounding rule: a swap may only say what the replacement's own listing says** (added 2026-09-22 after dry run 4). Dry run 4 swapped B07F2VP353 for the Odoland B0GQZ5D1HR and all nine seats passed, but the rewrite carried the Fire-Maple's specifics onto the Odoland: "hard-anodized pot, lid", "piezo igniter", "cannot use over a campfire". The listing says none of them. The seats could not catch this because they had never seen the listing. The fix has four parts:
  - **Facts are fetched and kept with the candidate.** `fetchListingFacts()` in `scripts/lib/discover.mjs` makes one Canopy `amazonProduct` request for `title brand featureBullets itemWeight isInStock`. It asks for scalar fields only, never the paginated or estimated ones, so it costs one request, the same as a search (100 a month free, $0.01 each after that). The result is cached in `state/discovery-cache.json` as `product:<asin>` for 7 days and stored on `entry.candidate.facts` in the ledger, next to the title Amazon's page served when the link was checked.
  - **No facts means no swap.** A failed lookup or Canopy quota defers the swap without using an attempt, and the 72h deadline still ends in an unlink. A listing with no feature bullets rejects the candidate and uses one attempt.
  - **The writer** gets the facts as `newProduct.listing`. It is told that every product-specific claim (materials and finishes, included parts, ignition, packing and nesting, capacity, weight, boil time, fuel, compatibility, use restrictions) must be stated in the listing. Specifics carried over from the dead product must be removed or generalized.
  - **The checks.** First, a free mechanical check, `ungroundedClaims()`, run inside `checkRewrite`. It has a high-precision table of claim words (hard-anodized, anodized, titanium, piezo, igniter, lid, nests, campfire, windscreen, regulator, compatibility, folding handle, fuel types) and rules for numbers with units. Each must be backed by the listing text. It reads every sentence in the product's own `###` section, and in other paragraphs only the sentences that name the product or refer back to it with a pronoun. A failure unlinks that guide before any reviewer is paid. Second, the reviewers get the same facts. Each seat is told to report any product-specific claim in an edit that the listing does not state as **high**, and to quote the one full sentence that holds it, so that two seats can agree on the same quote. 2-of-3, fail-closed and edit-scoped are unchanged.
  - The table has a known gap: it does not see claims outside its word list ("dishwasher safe"). Those rest on the reviewers. It also has a known cost: a real feature that the listing puts in different words gets the guide unlinked rather than swapped. That is the safe direction.

- **One writer retry per guide, fed the exact refusal reason** (added 2026-09-22; Sean: "Add retry, then ship"). Dry run 6 unlinked all three guides for B07F2VP353 → B0GQZ5D1HR before any reviewer was asked, on refusals a second draft could fix: a stray blank line in the dispersed guide ("a rewrite added or removed a paragraph break"), "campfire" in the cookware guide, and "the ergonomic C-grip handle folds out cleanly for pouring" in the stoves guide against a listing that says only "Ergonomic C-grip handle".
  - **What gets a retry:** a mechanical refusal (`checkRewrite`, including grounding), or a panel rejection whose blocking findings are all edit-scoped (after `editScope`) and each quote the text they object to. A `hazardFlags` rejection is **not** retried: a writer that introduced dangerous advice does not get a second go at that guide. A null review still defers.
  - **What the retry is told** (`retryPrompt()`): the original prompt (segments, context, `newProduct.listing`, all rules), plus `previousDraft` (the refused text) and `refusedBecause` (every reason verbatim, each quoting the offending sentence, e.g. `content#24: "folding handle" not in the listing — "…"`; panel findings as `review: "<quote>" — <problem>`), plus a reminder of each rule that was broken. The paragraph-break refusal now names the segment that holds the blank line, so it is actionable.
  - **Then** the retried draft goes through the mechanical check again and, only if that passes, the panel again. A second failure of any kind — mechanical, review, a retry that answers "not the same kind", or a retry writer that does not answer — is the existing fallback: unlink that guide and alert. A retry never uses a candidate attempt.
  - **Bound:** at most one retry per guide per cycle, structurally (the retry's own verdict is never checked for retryability); both writer calls and both panel runs are counted in `report.calls`, with `report.calls.retry` for the retries. Both attempts and their reasons are recorded on `perArticle[slug].retry` in the ledger and the report, the unlink reason says "after one writer retry; first draft refused (…)", and the receipt's `deadLinkEvent.retries` feeds a "Writer retried once in … (mechanical refusal → fixed / still …)" line in the Telegram note.

## Open decisions (resolved — kept for the record)
1. **Price band width (±30%).** Recommend keeping it. At ±50%, the "budget" guides would start drifting toward the Jetboil price tier.
2. **Mark an unlinked article `updated`?** Recommend no. Removing a link is not an editorial rewrite, which matches the rule on `articles.ts` `updated`.
3. **Unlink call-to-action handling.** Recommend deleting the "Check the X on Amazon" line and keeping the product's `###` section. The alternative is to delete the whole section, which reads cleaner but removes content Sean might want to keep. It is also the natural thing for an Exception Handler proposal to offer later.
4. **Swap deadline (72h).** Recommend 72h. Three days of cycles covers a MiniMax daily blip, but not the weekly-cap reset, so a cap that lands mid-remediation will end in an unlink.

## Sources
`scripts/run-cycle.mjs:262-281,352-360,446-470`; `scripts/refresh-asins.mjs:73-88`; `scripts/lib/discover.mjs`; `scripts/lib/asin-cache.mjs:38-46`; `scripts/lib/content-review.mjs:349-386`; `scripts/lib/llm.mjs:185-246`; `scripts/publish-article.mjs:1-30`; `scripts/lib/price-source.mjs:1-25`; `~/lazlo-ops/scripts/exceptions.mjs` header.
