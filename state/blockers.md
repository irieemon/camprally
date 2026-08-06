
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

