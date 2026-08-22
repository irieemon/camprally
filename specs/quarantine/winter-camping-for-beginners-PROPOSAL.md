# Proposal: winter-camping-for-beginners

## What the panel flagged — the findings in plain language

Two issues, both about the writer treating "winter" as a marketing label rather than a structural requirement:

1. **Self-contradicting bullet** (model 2/3 hard fail). The body lists "Few guy-out points" as a feature beginners should look for in a winter shelter, then in the same sentence explains that winter shelters need anchor points for high wind and snow load. Fewer guy-out points is the *opposite* of what winter conditions demand — a winter shelter needs *many* anchor points so it can be tied out against wind and shed snow load. As written, the bullet actively teaches beginners the wrong thing.

2. **Wrong product for the use case** (model 1/3 note, severity-adjacent). The lead recommendation, the GEERTOP 2 Person Backpacking Tent, is a 3-season backpacking/cabin-style shelter despite its listing using "4-Season" copy. Putting it forward as a beginner's winter pick risks tent collapse or snow-load failure at even a mild drive-in winter site. The other five products in the list appear to be genuine 4-season builds, so the issue is concentrated on that first pick and the framing around it.

## Root cause — why this topic keeps failing the gate

The topic itself is legitimate — beginners genuinely need a winter-camping primer, and CampRally already has related cold-weather content (how-to-stay-warm, budget cold-weather bags, fall-camping gear). What keeps failing is two writer-side habits, not the topic:

- **Treating "winter" features as a checklist of words** instead of as physical requirements. The guy-out-point bullet is the clearest symptom: the writer matched the checklist shape (one feature per line) without checking that the feature direction was correct.
- **Trusting product "4-Season" copy** instead of verifying the shelter's actual geometry (pole structure, snow skirt, fabric coverage, weight class). A 3-season backpacking tent marketed as 4-season slips through the product picker and ends up as the lead recommendation.

The first failure is a copy-direction bug; the second is a product-filter bug. Both are upstream of the writer, so both are addressable via the queue's `notes` field — the same lane that worked for `best-camping-socks`.

## Brief fix — the exact "notes" text to add to this slug's entry in article-queue.json

Add this to the `winter-camping-for-beginners` entry's `notes` field (preserve any existing notes; append):

```
CRITICAL WINTER-SHELTER RULES (prior gate failures on this slug):
- Winter shelters require MANY guy-out / anchor points (not few) so they can be tied out against high wind and snow load. Never list "few guy-out points" as a desirable feature in any winter context.
- Only recommend shelters genuinely rated for winter / snow-load conditions: real 4-season geometry with a robust pole structure, a snow skirt or generous vestibule, and double-wall construction. A "4-Season" marketing claim is not sufficient — verify the shelter's actual design class (pole gauge, snow skirt, fabric weight, intended use) before including it.
- Do not lead the picks list with, or feature as a primary winter pick, any 3-season backpacking tent or cabin tent (e.g. the GEERTOP 2 Person was previously rejected for this reason). 3-season shelters may be mentioned only as a clearly-labeled fallback for sheltered forest sites in moderate conditions, never for snow-load or alpine terrain.
- Lead the product picks only after the sleep-system framing (pad R-value, dry layers, bag) — the tent is the windbreak, the sleep system is the warmth. The article already does this; keep it.
```

## Recommendation — **retry with the fixed brief**

The topic is on-strategy (beginner cold-weather gear, well-supported by the related guides in the body), the panel failures are specific and locatable, and both are exactly the kind of upstream-writer hazards the `notes` field is designed to prevent — same pattern that unblocked `best-camping-socks`. Re-queueing the slug with the notes above gives the writer the guardrails for the guy-out bullet and the product filter without forcing a human rewrite of a topic that doesn't need one. Drop or human-rewrite would be overkill for two copy/filter bugs.