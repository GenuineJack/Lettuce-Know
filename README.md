# Lettuce Know

Scan a food barcode to check it against FDA and USDA recalls, and see where US and EU food additive rules disagree. Watch products for future recalls, flag your own allergens, browse the recall index, and pantry-check a shelf of items in one go. Built as a single-page PWA — no build step, no framework, no backend required (two small serverless proxies, see below). Everything personal (watchlist, flags, history) lives in localStorage on the device.

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

## App surfaces

Hash-based routing (`#/product/<code>`, `#/recalls`, `#/saved`, `#/settings`, `#/search/<query>`) makes results shareable URLs and gives the browser Back button real meaning. A bottom tab bar covers the four top-level screens:

- **Home** — scan/type CTAs, live source status, a recall-count teaser, recent checks, and alert banners when a watched product newly matches a recall.
- **Recalls** — the full index the scans are checked against, newest first, filterable by source and searchable by brand/product/reason.  Rows lead with the recalled *product*, because that's the only field that reliably tells one record from the next; firm and reason ride underneath.
- **Saved** — the watchlist. Watching a product from its result screen re-checks it against every data refresh; a new match raises a Home banner until the user views the result (which acknowledges it).
- **Settings** — allergen switches (the 9 major US allergens, each showing the terms it matches) plus free-text avoid terms, a state picker (recalls that don't list your state get a "may not have reached you" note and sort lower — never hidden), and data controls. All stored on-device.

The scan screen adds a pantry-check mode (scan several items in a row, get a summary), scan-from-photo, and a torch toggle on cameras that support it. The manifest declares app shortcuts and a GET share target, so sharing text containing a barcode into the installed PWA jumps straight to that product's result.

## Reading a recall record

The two feeds agree on shape but not on meaning, and the cards are built around that.

FDA's `reason_for_recall` is a written sentence ("may be contaminated with *Listeria monocytogenes*"). USDA's `field_recall_reason` is one of a small fixed set of categories, sometimes several comma-joined ("Misbranding,Unreported Allergens"). Rendered identically — as the card's headline, which is what the app used to do — the USDA ones read as vague boilerplate and make unrelated recalls look like the same event. So USDA reasons are split, mapped to a plain-language label and one explanatory line (`REASON_GLOSS`), and shown as tags under "Why it was recalled"; FDA reasons are printed as written. The classification badge gets the same treatment (`CLASS_GLOSS`) — Class I/II/III is a code nobody carries around in their head.

The headline is the *product*, on both the list row and the card. Everything else on the record — firm, class, contact, distribution — exists to help someone decide whether that headline is the box in their kitchen. Two consequences worth knowing:

- FSIS falls back to the notice title when a record has no product items, and that title is often just the category again, so `productText()` drops a "product" that only restates the reason and the card says the record doesn't name one. Never print the category twice and call one of them a product.
- FSIS leaves `field_establishment` blank on a fair share of records even though the company name is sitting in the contact blob (`Company Contact Shanghai Ravioli Corporation Jordan Wu, QC Manager 617-989-3833 …`). `parseContact()` splits that into firm / person / phone / email; the recovered firm is written back to `firm` at fetch time rather than used display-only, so it's searchable and available to brand matching too. It only accepts a name anchored on a corporate suffix — a bare personal name is not a company.

## Look and feel

Light by default, with a full dark theme the user can choose. Appearance is a three-way preference in Settings — Light (the default), Dark, or System — stored on-device and applied as `data-theme` on the root element by a small script in `<head>` that runs before first paint. Both palettes are the same set of CSS custom properties on `:root`, so every rule below the token block is theme-agnostic.

Keying the dark palette off `[data-theme="dark"]` rather than `prefers-color-scheme` directly is deliberate: an earlier build applied dark straight from the media query, which meant anyone whose device was in dark mode could never reach the light theme at all, on any browser, no matter what they cleared. `System` is opt-in and only then follows the device. Two greens are kept separate on purpose: `--green-ink` is the only one allowed to carry text (it clears 4.5:1 on cards, on the page and on the green tint), while `--green` is reserved for fills, focus rings and graphics, where 3:1 is the bar. `--green-fill` is the darker fill the primary button needs to hold white text at 4.5:1. Every foreground/background pair in both themes is verified against WCAG AA — if you change a token, re-check the pair rather than eyeballing it.

Surfaces use soft shadows (`--shadow`, `--shadow-lg`) over hard borders. Headings are Plus Jakarta Sans, body is Inter. The scan screen stays dark in both themes: a light UI around a live camera feed washes out the viewfinder.

List rows show the product photo when a source supplied one, falling back to a food emoji guessed from the product name (`emojiFor()`), so a row never renders as an empty grey square.

## Before deploying

- **FDC_API_KEY**: get a free key at https://api.data.gov/signup/ and set it as an environment variable named `FDC_API_KEY` in the Vercel project settings — it is read server-side by `api/fdc.js`, so it never reaches the browser and never goes in git. With no key set, the proxy falls back to `DEMO_KEY` (30 req/hr), so the app still works, just rate-limited. There is no key to edit in `index.html`; it calls `/api/fdc` instead of FoodData Central directly, and a failed lookup degrades to Open Food Facts as before.
- **USDA FSIS CORS**: the FSIS recall API blocked at least one direct fetch attempt during development (bot detection). If the "USDA" status tag on the home screen shows red/unavailable after deploying, switch on the included proxy: set `const PROXY = "/api/recalls";` near the top of `index.html`. The proxy in `api/recalls.js` is written for Vercel's serverless function format.
- **HTTPS required for camera**: barcode scanning needs `https://` — won't work from a local `file://` open. Test on the deployed URL, not locally, if checking camera behavior.
- **EU/US watch page**: `eu-us-watch.html` is a standalone static page (crawlable by social link previews and search engines, unlike the hash-routed app) listing every entry in `eu-us-data.js`. After editing that data, run `node scripts/build-eu-us-page.mjs` to regenerate it, and commit the regenerated file.

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
