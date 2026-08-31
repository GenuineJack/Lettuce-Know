#!/usr/bin/env node
/* Builds eu-us-watch.html — a standalone, crawlable static page listing every
 * entry in eu-us-data.js. It exists because the app itself is a client-side
 * hash router living in one index.html: a social link-preview crawler
 * (LinkedIn/Facebook/Reddit) only ever fetches the initial HTML of a URL and
 * never runs JS, so a hash route like #/eu-us can never be what gets shared
 * or indexed. This script bakes the same data into real, static markup at
 * its own URL instead.
 *
 * Run: node scripts/build-eu-us-page.mjs
 * Regenerates eu-us-watch.html at the repo root every time — no CLI args,
 * no network access, no dependencies beyond Node's built-ins. Source of
 * truth is eu-us-data.js, read fresh on every run so this never drifts out
 * of sync with it.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// eu-us-data.js has no package.json in scope, so Node's default module
// resolution treats it as CommonJS. Importing a CommonJS file from ESM
// exposes its `module.exports` object as the default export — there is no
// named `EU_US_DIVERGENCE` export to destructure directly.
const dataModule = await import(path.join(repoRoot, "eu-us-data.js"));
const { EU_US_DIVERGENCE } = dataModule.default ?? dataModule;

if (!Array.isArray(EU_US_DIVERGENCE) || EU_US_DIVERGENCE.length === 0) {
  throw new Error("EU_US_DIVERGENCE is missing or empty in eu-us-data.js — refusing to write an empty page.");
}

const SITE_URL = "https://lettuce-know.vercel.app/eu-us-watch.html"; // TODO: must match the real deployed domain
const APP_URL = "https://lettuce-know.vercel.app/";
const OG_IMAGE = "https://lettuce-know.vercel.app/brand/lockup.svg"; // TODO: must match the real deployed domain

const PAGE_TITLE = "Food Additives: Banned in the EU, Legal in the US";
const PAGE_DESCRIPTION =
  "Eight food additives — titanium dioxide, potassium bromate, BHA and more — with a documented difference in US and EU regulatory status. Sourced, not a danger score.";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function renderEntry(entry) {
  const eNumberHtml = entry.eNumber
    ? `<span class="e-number">${escapeHtml(entry.eNumber)}</span>`
    : "";
  return `
      <article class="entry" id="${escapeHtml(entry.id)}">
        <header class="entry-head">
          <h2>${escapeHtml(entry.name)}</h2>
          ${eNumberHtml}
        </header>
        <dl class="status-grid">
          <div class="status-row">
            <dt>US status</dt>
            <dd>${escapeHtml(entry.usStatus)}</dd>
          </div>
          <div class="status-row">
            <dt>EU status</dt>
            <dd>${escapeHtml(entry.euStatus)}</dd>
          </div>
        </dl>
        <p class="note">${escapeHtml(entry.note)}</p>
        <a class="source" href="${escapeHtml(entry.source)}" rel="noopener noreferrer" target="_blank">Source &rarr;</a>
      </article>`;
}

const entriesHtml = EU_US_DIVERGENCE.map(renderEntry).join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F4F8F4">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(PAGE_TITLE)}</title>
<meta name="description" content="${escapeHtml(PAGE_DESCRIPTION)}">
<link rel="canonical" href="${SITE_URL}">

<meta property="og:title" content="${escapeHtml(PAGE_TITLE)}">
<meta property="og:description" content="${escapeHtml(PAGE_DESCRIPTION)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${OG_IMAGE}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(PAGE_TITLE)}">
<meta name="twitter:description" content="${escapeHtml(PAGE_DESCRIPTION)}">

<link rel="icon" href="icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

<style>
/* Same token values as index.html's :root / [data-theme="dark"] blocks, but
 * self-contained — this page must render correctly standalone, with no
 * runtime dependency on index.html or its theme-toggle script. Since this
 * page has no toggle, light/dark follows the OS via prefers-color-scheme
 * rather than the app's data-theme attribute. */
:root{
  --bg:#F4F8F4; --bg-2:#EDF3EE; --card:#FFFFFF; --card-2:#F7FAF7;
  --line:#E1EAE3; --line-soft:#EDF3EE;
  --fg:#10231A; --dim:#54685E; --dim-2:#5F7369;
  --green:#16A34A; --green-ink:#0B6E30; --green-fill:#0F7C36;
  --green-bg:#E7F6ED; --green-line:#C7E9D5;
  --shadow:0 1px 2px rgba(16,35,26,.04), 0 10px 28px -14px rgba(16,35,26,.16);
  --shadow-lg:0 2px 4px rgba(16,35,26,.05), 0 18px 40px -18px rgba(16,35,26,.22);
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px; --s6:24px; --s7:32px; --s8:40px;
  --r-sm:12px; --r-md:16px; --r-lg:20px; --r-xl:26px; --r-pill:99px;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0b1f16; --bg-2:#0f261b; --card:#123122; --card-2:#16392a;
    --line:#1e4632; --line-soft:#173a29;
    --fg:#eef7f0; --dim:#9cb8a7; --dim-2:#8fac9a;
    --green:#4ade80; --green-ink:#4ade80; --green-fill:#4ade80;
    --green-bg:#11331f; --green-line:#2f7a52;
    --shadow:0 1px 2px rgba(0,0,0,.20), 0 10px 28px -14px rgba(0,0,0,.55);
    --shadow-lg:0 2px 4px rgba(0,0,0,.25), 0 18px 40px -18px rgba(0,0,0,.65);
  }
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%}
body{
  font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
  background:radial-gradient(120% 90% at 50% -8%, var(--bg-2), var(--bg) 62%);
  background-attachment:fixed;
  color:var(--fg); min-height:100dvh;
  -webkit-font-smoothing:antialiased;
  line-height:1.5;
}
.wrap{max-width:640px;margin:0 auto;padding:var(--s6) var(--s5) calc(var(--s8) + env(safe-area-inset-bottom))}
.display{font-family:'Plus Jakarta Sans',sans-serif}
header.page-head{margin-bottom:var(--s7)}
.eyebrow{
  display:inline-block;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;
  font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--green-ink);
  background:var(--green-bg);border:1px solid var(--green-line);border-radius:var(--r-pill);
  padding:var(--s1) var(--s3);margin-bottom:var(--s4);
}
h1{
  font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:clamp(28px,6vw,38px);
  letter-spacing:-.02em;line-height:1.12;margin-bottom:var(--s4);color:var(--fg);
}
.intro{color:var(--dim);font-size:16px;max-width:56ch}
.intro strong{color:var(--fg)}
main{display:flex;flex-direction:column;gap:var(--s5)}
.entry{
  background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  box-shadow:var(--shadow);padding:var(--s5);
}
.entry-head{display:flex;align-items:baseline;gap:var(--s3);flex-wrap:wrap;margin-bottom:var(--s4)}
.entry-head h2{font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:20px;letter-spacing:-.01em;color:var(--fg)}
.e-number{
  font-size:12px;font-weight:600;color:var(--dim);background:var(--card-2);
  border:1px solid var(--line);border-radius:var(--r-sm);padding:2px var(--s2);
}
.status-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--s3);margin-bottom:var(--s4)}
.status-row{background:var(--card-2);border:1px solid var(--line-soft);border-radius:var(--r-md);padding:var(--s3)}
.status-row dt{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--dim-2);margin-bottom:2px}
.status-row dd{font-size:14px;color:var(--fg);font-weight:500}
.note{color:var(--dim);font-size:14.5px;margin-bottom:var(--s4)}
.source{
  display:inline-flex;align-items:center;gap:4px;font-size:13.5px;font-weight:600;
  color:var(--green-ink);text-decoration:none;
}
.source:hover,.source:focus{text-decoration:underline}
footer.cta{
  margin-top:var(--s8);padding:var(--s6);text-align:center;
  background:var(--green-bg);border:1px solid var(--green-line);border-radius:var(--r-xl);
}
footer.cta p{color:var(--fg);font-size:16px;margin-bottom:var(--s4)}
.btn{
  display:inline-block;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:15px;
  color:#FFFFFF;background:var(--green-fill);border-radius:var(--r-pill);
  padding:var(--s3) var(--s6);text-decoration:none;box-shadow:var(--shadow-lg);
}
.btn:hover,.btn:focus{filter:brightness(1.05)}
.fineprint{margin-top:var(--s6);color:var(--dim-2);font-size:12.5px;text-align:center}
@media (max-width:420px){
  .status-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="wrap">
  <header class="page-head">
    <span class="eyebrow">Lettuce Know &middot; EU/US Watch</span>
    <h1>Food additives banned in the EU, still legal in the US</h1>
    <p class="intro">
      This page lists ${EU_US_DIVERGENCE.length} food additives with a documented,
      citable difference in US and EU regulatory status &mdash; things like
      titanium dioxide, which the EU banned from food in 2022 and the FDA still
      permits up to 1% by weight. <strong>It states what each regulator
      currently permits and why they diverged, and leaves the judgment to
      you.</strong> It is not a danger score, and a legal additive is not
      automatically a hazard &mdash; regulators can and do reach different
      conclusions from the same evidence, for reasons ranging from differing
      risk thresholds to how each cites its own data. Every entry below links
      its primary source.
    </p>
  </header>

  <main>${entriesHtml}
  </main>

  <footer class="cta">
    <p>Curious whether something in your pantry is on this list?</p>
    <a class="btn" href="${APP_URL}">Scan a product to check it yourself &rarr;</a>
  </footer>

  <p class="fineprint">Sourced from eu-us-data.js in the Lettuce Know app repository. Regulatory status changes &mdash; recheck the linked sources periodically.</p>
</div>
</body>
</html>
`;

const outPath = path.join(repoRoot, "eu-us-watch.html");
fs.writeFileSync(outPath, html, "utf8");
console.log(`Wrote ${EU_US_DIVERGENCE.length} entries to ${path.relative(repoRoot, outPath)} (${(html.length / 1024).toFixed(1)} KB)`);
