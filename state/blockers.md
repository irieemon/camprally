
## 2026-08-04T18:16:26.042Z — working-tree-dirty

Refusing to run with uncommitted changes:
?? state/cycle.err.log
?? state/cycle.log

## 2026-08-04T19:14:18.872Z — spec-generation-failed

Could not generate a spec for how-to-camp-in-hot-weather.
discovering "camping in hot weather"...


## 2026-08-04T19:38:39.992Z — working-tree-dirty

Refusing to run with uncommitted changes:
M src/data/prices.json
?? specs/how-to-camp-in-hot-weather.json

## 2026-08-05T13:00:00.125Z — publish-failed

link gate: 6 ASIN(s) all cached LIVE
wrote articles.ts, heroes.ts and article-sections.ts

ROLLED BACK — build failed

> camprally@0.1.0 build
> next build

▲ Next.js 16.2.2 (Turbopack)

  Creating an optimized production build ...
✓ Compiled successfully in 1461ms
  Running TypeScript ...
Failed to type check.

./src/data/heroes.ts:74:3
Type error: An object literal cannot have multiple properties with the same name.

  [90m72 |[0m   [32m"how-to-camp-in-rain"[0m:            [32m"/images/heroes/how-to-camp-in-rain.jpg"[0m,
  [90m73 |[0m
[31m[1m>[0m [90m74 |[0m   [32m"how-to-camp-in-rain"[0m: [32m"/images/heroes/how-to-camp-in-rain.jpg"[0m,
  [90m   |[0m   [31m[1m^[0m
  [90m75 |[0m   [36mdefault[0m: [32m"https://images.unsplash.com/photo-1598507690808-57594afea85f?w=1200&q=80"[0m,
  [90m76 |[0m };
  [90m77 |[0m
Next.js build worker exited with code: 1 and signal: null



## 2026-08-05T18:19:25.347Z — content-review

Content review rejected how-to-camp-in-rain (attempt 1 of 2).
Spec quarantined to specs/quarantine/how-to-camp-in-rain-2026-08-05T18-19-25-347Z.json


how-to-camp-in-rain
  ✗ [model 2/3] Mylar/space blankets conduct cold from wet ground through the user and trap moisture against the body, increasing hypothermia risk rather than preventing it. They reflect radiant body heat but provide virtually no insulation against conductive heat loss. This is dangerous advice in a rain camping context where hypothermia is a real risk.
      "These blankets also work as ground insulation when sitting on wet terrain"
  · note (1/3): Placing a non-breathable tarp directly under a tent footprint traps groundwater and moisture between the tarp and tent floor. This creates a soaked environment that degrades insulation and promotes mold. Proper tent footprint protection should use a breathable ground cloth that is slightly smaller than the tent floor, not a full-coverage tarp.


## 2026-08-06T13:00:00.117Z — spec-generation-failed

Could not generate a spec for dispersed-camping-beginners-guide.
discovering "dispersed camping"...
  picked 6:
    B07MKBKN4H  $11.04    4.6 ★  FLY2SKY Portable LED Gear Camping Lights with Clip H
    B083TXB5QY  $14.99    4.6 ★  Lepro LED Camping Lantern with 3 Light Modes, Batter
    B0CW4QLRPQ  $18.18    4.6 ★  Eveready LED Camping Lantern X-250 (2-Pack), Super B
    1885464851  $22.95    4.6 ★  National Forest Camping: Directory of 4,108 Designat
    B0DYV7KX92  $39.99    4.5 ★  4-Pack Solar Camping Lanterns,Rechargeable LED with 
    B07F2VP353  $49.95    4.5 ★  Fire-Maple Fixed Star 1 Backpacking and Camping Stov
generating "Dispersed Camping for Beginners — How to Camp Free on Public Land" with MiniMax-M2.7...
  first attempt failed: MiniMax API 529: {"type":"error","error":{"type":"overloaded_error","message":"overloaded_error (529)"},"request_id":"06c3b8586944a07a6870869cf2cfb2c5"}
  retrying once...


## 2026-08-09T13:00:00.098Z — content-review

Content review rejected best-camping-socks (attempt 1 of 2).
Spec quarantined to specs/quarantine/best-camping-socks-2026-08-09T13-00-00-098Z.json


best-camping-socks
  ✗ [high] cotton-for-warmth (body)
      recommends cotton for warmth — cotton holds moisture and loses insulation when damp, the classic cold-weather mistake
      "Material matters more than anything else. Cotton absorbs sweat and holds it, which is why a cotton sock in a wet boot feels like wearing a cold washcloth."
  · note (1/3): Recommends a cotton blend sock after the article states that cotton absorbs sweat, holds it, and creates a cold, wet feeling in boots. A cotton blend was presented as the material to avoid.


## 2026-08-09T18:00:00.138Z — content-review

Content review rejected best-camping-socks (attempt 2 of 2).
Spec quarantined to specs/quarantine/best-camping-socks-2026-08-09T18-00-00-138Z.json


best-camping-socks
  ✗ [high] cotton-for-warmth (body)
      recommends cotton for warmth — cotton holds moisture and loses insulation when damp, the classic cold-weather mistake
      "Synthetic blends dry faster and cost less, which makes them a smart pick for warm-weather trips or as a backup pair. Cotton is comfortable on the couch, but it "
  · note (1/3): "Trash bag foot" is not a standard term for the maceration/blistering caused by cotton socks; the common term is "trench foot" when prolonged wet/cold exposure is involved, or simply severe blistering. This invented or non-standard term could confuse readers.
  · note (1/3): A single midweight wool hiking sock typically weighs around 1.5–3 ounces (roughly 40–85 grams), so "around an ounce or two" understates the typical weight, which could mislead backpackers counting grams.


## 2026-08-10T13:00:00.161Z — content-review

Content review rejected fall-camping-gear-essentials (attempt 1 of 2).
Spec quarantined to specs/quarantine/fall-camping-gear-essentials-2026-08-10T13-00-00-161Z.json

ther mistake
      "The gear that earns its place is the gear that handles three things summer kit doesn't: colder ground, stronger wind, and longer nights. A higher R-value pad, a"
  ✗ [high] food-in-tent (body)
      stores food or scented items in the tent — attracts bears and rodents
      "The tents in this list — from the roomy Core 9 Person Instant Cabin down to the blackout-equipped EVER ADVANCED 4 Person — give you fast setup, weather handling"
  · note (1/3): This is plausible in cool mountain regions but not generally true for most of the U.S. (e.g., Southeast, Southwest, or coastal areas). Presenting it as a typical scenario could mislead campers in warmer climates about what to expect.
  · note (1/3): Sunrise actually comes later in the year as autumn progresses, but the article frames it as if shortened fall days still work against you in the morning, which is true. However, the main claim about blackout tents is fine — the issue is that the article later says 'sunrise comes later in the morning' as if this is a good reason for blackout fabric, but longer/earlier sunrises in early fall and shorter days overall make this claim confusing. This is a minor contradiction.


## 2026-08-11T13:00:00.140Z — content-review

Content review rejected fall-camping-gear-essentials (attempt 2 of 2).
Spec quarantined to specs/quarantine/fall-camping-gear-essentials-2026-08-11T13-00-00-140Z.json


fall-camping-gear-essentials
  ✗ [high] cotton-for-warmth (body)
      recommends cotton for warmth — cotton holds moisture and loses insulation when damp, the classic cold-weather mistake
      "Base layers in fall should be synthetic or merino. Cotton absorbs sweat, holds it against your skin, and stops insulating the moment it gets damp."
  · note (1/3): A 4000mm hydrostatic head rating is typical for rainfly fabric, but a '4000mm water resistance rating' for the tent overall is a misleading claim as it conflates fabric test results with real-world waterproofing and can mislead buyers about performance.
  · note (1/3): A 10-degree buffer is generally insufficient for fall camping; most sleep system guides recommend 15-20 degrees of buffer to account for pad R-value, shelter drafts, and personal metabolism variation, which could leave campers underprepared.
  · note (1/3): Closing tent vents when temperatures drop traps body moisture and causes heavy condensation, which contradicts the article's earlier advice that cold-weather camping requires increased ventilation.

