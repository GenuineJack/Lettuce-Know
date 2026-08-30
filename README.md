# Lettuce Know

Scan a food barcode to check it against FDA and USDA recalls, and see where US and EU food additive rules disagree. Built as a single-page PWA — no build step, no framework, no backend required (one optional serverless proxy, see below).

## What's here

```
index.html              — the entire app: markup, styles, and JS in one file
eu-us-data.js            — sourced reference table of US/EU additive divergence (loaded by index.html)
manifest.webmanifest     — PWA manifest
sw.js                    — service worker (app-shell caching + install support)
api/recalls.js           — optional Vercel serverless function, proxies the USDA FSIS API
api/fdc.js               — Vercel serverless function, proxies USDA FoodData Central and holds the API key
icons/                   — app icons (regular + maskable, for Android adaptive icons)
brand/                   — logo source files (mark.svg, lockup.svg) for anything outside the app (store listing, README, etc.)
test/                    — browser test suite (dev only; excluded from the deploy by .vercelignore)
```

## How it works

1. User scans a barcode (camera via `html5-qrcode`) or types one in.
2. App fetches product identity from two sources in parallel — Open Food Facts and USDA FoodData Central — and merges whichever has real ingredient data, since neither source alone has full coverage.
3. App checks the product/brand against a locally cached index of recent FDA (`api.fda.gov/food/enforcement`) and USDA FSIS recalls, refreshed every 12 hours and stored in `localStorage`.
4. If ingredient data was found, it's checked against `eu-us-data.js` for known US/EU regulatory divergence (titanium dioxide, potassium bromate, etc.) — stated as regulatory fact, not a safety score.
5. Result renders as one of: recalled (strong or possible match), clear, no data, or offline/error — each state is visually and textually distinct so an outage never gets confused with a clean result.
6. If the product's brand appears in two or more recall records in the window, the result also shows a brand recall history: how many records, the date span, and the most recent reason.

## Before deploying

- **FDC_API_KEY**: get a free key at https://api.data.gov/signup/ and set it as an environment variable named `FDC_API_KEY` in the Vercel project settings — it is read server-side by `api/fdc.js`, so it never reaches the browser and never goes in git. With no key set, the proxy falls back to `DEMO_KEY` (30 req/hr), so the app still works, just rate-limited. There is no key to edit in `index.html`; it calls `/api/fdc` instead of FoodData Central directly, and a failed lookup degrades to Open Food Facts as before.
- **USDA FSIS CORS**: the FSIS recall API blocked at least one direct fetch attempt during development (bot detection). If the "USDA" status tag on the home screen shows red/unavailable after deploying, switch on the included proxy: set `const PROXY = "/api/recalls";` near the top of `index.html`. The proxy in `api/recalls.js` is written for Vercel's serverless function format.
- **HTTPS required for camera**: barcode scanning needs `https://` — won't work from a local `file://` open. Test on the deployed URL, not locally, if checking camera behavior.

## Tests

```
cd test && npm install && npm test
```

Drives the real app in Chromium with every external API stubbed, so it runs
offline and hermetically. Covers the flows, each verdict and failure state,
injection through feed data, corrupt storage, the navigation race conditions,
four breakpoints, and the service worker. `api/fdc.js` runs in-process the way
Vercel would run it, with only its upstream call stubbed.

## Known limitations (by design, not oversights)

- Ingredient/recall matching is name-based fuzzy matching, not a UPC-to-recall exact join (no such public database exists). It's graded into "strong," "possible," and "brand-only" matches — see the `score()` function in `index.html` if tuning is needed.
- Ingredient coverage is not 100%. Store brands and very new products often aren't in either Open Food Facts or FoodData Central. The app says "no data" explicitly rather than implying a clean result.
- The EU/US panel is intentionally a short, sourced list (~8 ingredients) rather than a comprehensive database or a 1–5 "safety score." Each entry in `eu-us-data.js` has a source link — extend this list carefully and keep sourcing.

## Not yet built

- **Longer history window** — brand recall history is now on the result screen, but it only spans `WINDOW_DAYS` (400), because that's all the index holds. Showing a multi-year pattern would mean a second, coarser fetch kept separately from the main index.

## Origin

Named after a grocery store moment: someone joking "so which ones do you think won't kill us" while both looking at lettuce. The logo works the pun in — the leaf's veins double as barcode lines, and the checkmark badge does the app's actual job (verdict, not a vague "trending up" arrow).
