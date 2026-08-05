
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


