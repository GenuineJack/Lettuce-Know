/* Browser test suite for Lettuce Know.
 *
 *   cd test && npm install && npm test
 *
 * Serves the repo from disk, runs api/fdc.js the way Vercel would, and stubs
 * every external API so the suite is hermetic and offline-safe. Service
 * workers are blocked in most contexts because Playwright's page.route()
 * cannot intercept SW-originated fetches; the SW gets its own section.
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json',
  '.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};

// FDC proxy is emulated here the way Vercel would run api/fdc.js. The real
// handler runs; only its upstream call is stubbed, since this sandbox has no
// egress to api.nal.usda.gov.
const { default: fdcHandler } = await import(ROOT + '/api/fdc.js');
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ foods: [] }) });

let DEPLOY_MARKER = null;
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/fdc') {
    const shim = { setHeader:(k,v)=>res.setHeader(k,v), status(c){res.statusCode=c;return shim},
      json(o){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(o));return shim},
      end(){res.end();return shim} };
    return fdcHandler({ method:req.method, query:Object.fromEntries(u.searchParams) }, shim);
  }
  let f = u.pathname === '/' ? '/index.html' : u.pathname;
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode=404; return res.end('nf'); }
  res.setHeader('Content-Type', MIME[path.extname(p)] || 'application/octet-stream');
  // DEPLOY_MARKER lets a test stand in for "a new version was deployed".
  if (f === '/index.html' && DEPLOY_MARKER) {
    return res.end(fs.readFileSync(p, 'utf8').replace('<title>Lettuce Know</title>', `<title>${DEPLOY_MARKER}</title>`));
  }
  res.end(fs.readFileSync(p));
});
await new Promise(r => server.listen(8123, r));
const BASE = 'http://127.0.0.1:8123';

const FDA_ROWS = [{ product_description:'Fresh Express Chopped Salad Kit, 9.6 oz', recalling_firm:'Fresh Express Inc',
  reason_for_recall:'Possible Listeria monocytogenes contamination', recall_initiation_date:'20260715',
  classification:'Class I', status:'Ongoing', recall_number:'F-0421-2026', distribution_pattern:'CA, NV, OR' }];
const FSIS_ROWS = [{ field_title:'Acme Beef Patties Recall', field_product_items:'<p>2 lb Acme Beef Patties</p>',
  field_establishment:'Acme Meats', field_recall_reason:'Possible E. coli O157:H7', field_recall_date:'2026-08-01',
  field_recall_classification:'Class I', field_active_notice:'True', field_recall_number:'021-2026',
  field_states:'TX', field_company_media_contact:'press@acme.test', langcode:'English' }];

let fail = 0, pass = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m)); };
const eq = (a, b, m) => ok(a === b, m + (a === b ? '' : ` [got ${JSON.stringify(a)} want ${JSON.stringify(b)}]`));

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || {width:390,height:844}, serviceWorkers: 'block', ...opts.ctx });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text()); });

  await page.route(/api\.fda\.gov/, r => r.fulfill({ status: opts.fdaDown ? 500 : 200,
    contentType:'application/json', body: JSON.stringify({ results: opts.fdaDown ? [] : FDA_ROWS }) }));
  await page.route(/fsis\.usda\.gov/, r => r.fulfill({ status: opts.usdaDown ? 403 : 200,
    contentType:'application/json', body: JSON.stringify(opts.usdaDown ? {} : FSIS_ROWS) }));
  await page.route(/openfoodfacts\.org/, r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify(opts.off === null ? { status:0 } : { status:1, product: opts.off || {
      product_name:'Chopped Salad Kit', brands:'Fresh Express', categories:'Salads',
      ingredients_text:'LETTUCE, CARROT, TITANIUM DIOXIDE, MACADAMIA', additives_tags:['en:e171'] } }) }));
  await page.route(/api\.nal\.usda\.gov/, r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ foods: [] }) }));
  await page.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({ status:200, contentType:'text/javascript', body:'' }));
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  return { page, ctx, errs };
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

console.log('\n[1] Home + boot');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(900);
  ok((await page.locator('h1').first().innerText()).includes("We'll tell you."), 'h1 renders');
  ok((await page.locator('.tag').allInnerTexts()).some(t=>/FDA loaded/.test(t)), 'FDA tag loaded');
  ok((await page.locator('.tag').allInnerTexts()).some(t=>/USDA loaded/.test(t)), 'USDA tag loaded');
  ok((await page.locator('.tag').allInnerTexts()).some(t=>/2 recalls/.test(t)), 'recall count shown');
  ok(errs.length===0, 'no console/page errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[2] Manual entry -> recalled verdict');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.click('[data-act="manual"]');
  ok(await page.locator('#code').count() === 1, 'manual screen renders');
  ok(await page.evaluate(()=>document.activeElement.id) === 'code', 'input autofocused');
  await page.fill('#code', '123');
  await page.keyboard.press('Enter');                       // Enter key must submit
  await page.waitForTimeout(200);
  ok((await page.locator('#manualerr').innerText()).includes('3 digits'), 'short-code error via Enter key');
  ok(await page.getAttribute('#code','aria-invalid') === 'true', 'aria-invalid set');
  await page.fill('#code', '0071430000');
  ok(await page.locator('#manualerr').innerText() === '', 'error clears on input');
  await page.click('button[type=submit]');
  await page.waitForSelector('.v-title', { timeout: 8000 });
  eq(await page.locator('.v-title').innerText(), 'Recalled', 'strong match -> Recalled');
  eq((await page.locator('.card .label').first().innerText()).toUpperCase(), 'FDA RECALL F-0421-2026', 'recall card shown');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[3] EU/US divergence + macadamia false-positive regression');
{
  const { page, ctx } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  const names = await page.locator('.divergence-card h3').allInnerTexts();
  ok(names.length===1 && /Titanium dioxide/.test(names[0]), 'titanium dioxide flagged, exactly 1 entry');
  ok(!names.join(' ').includes('Azodicarbonamide'), 'MACADAMIA does NOT flag azodicarbonamide');
  ok(await page.locator('.badge-scroll').count() === 0, 'chip row hidden for single entry');
  ok(await page.locator('.divergence-card .src-link').count() === 1, 'source link rendered');
  await ctx.close();
}

console.log('\n[4] Back button + history');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.click('[data-act="manual"]');
  await page.goBack(); await page.waitForTimeout(250);
  ok((await page.locator('h1').first().innerText()).includes("We'll tell you."), 'browser Back returns home');
  await page.click('[data-act="manual"]'); await page.waitForTimeout(150);
  await page.click('.back'); await page.waitForTimeout(250);
  ok((await page.locator('h1').first().innerText()).includes("We'll tell you."), 'in-app Back returns home');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[5] Failure states');
{
  const { page, ctx } = await newPage(browser, { fdaDown:true, usdaDown:true });
  await page.goto(BASE); await page.waitForTimeout(900);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  eq(await page.locator('.v-title').innerText(), "Couldn't load recall data", 'both sources down -> offline state');
  ok(await page.locator('[data-act="recheck"]').count() === 1, 'Try again offered');
  ok(await page.locator('.stack .primary').count() === 1, 'only ONE primary CTA on offline screen');
  await ctx.close();
}
{
  const { page, ctx } = await newPage(browser, { off:null });
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  eq(await page.locator('.v-title').innerText(), 'Not in either database', 'unknown barcode -> nodata');
  ok(await page.locator('.stack .primary').count() === 1, 'only ONE primary CTA on nodata screen');
  await ctx.close();
}
{
  const { page, ctx } = await newPage(browser, { usdaDown:true,
    off:{product_name:'Beef Patties',brands:'Nobody Foods',categories:'Meat',ingredients_text:'BEEF',additives_tags:[]} });
  await page.goto(BASE); await page.waitForTimeout(900);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430001');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  eq(await page.locator('.v-title').innerText(), 'Partly checked', 'meat + USDA down -> Partly checked');
  await ctx.close();
}

console.log('\n[6] Corrupt / hostile localStorage (previously fatal)');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.addInitScript(() => {
    localStorage.setItem('rc_history', '{{{not json');
    localStorage.setItem('rc_index_v3', 'also not json');
  });
  await page.goto(BASE); await page.waitForTimeout(900);
  ok((await page.locator('h1').first().innerText()).includes("We'll tell you."), 'app still boots with corrupt storage');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}
{
  const { page, ctx, errs } = await newPage(browser);
  await page.addInitScript(() => { localStorage.setItem('rc_history', '{"not":"an array"}'); });
  await page.goto(BASE); await page.waitForTimeout(800);
  ok((await page.locator('h1').first().innerText()).includes("We'll tell you."), 'boots with non-array history');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[7] XSS / injection through recall + product data');
{
  const { page, ctx, errs } = await newPage(browser, {
    off:{ product_name:`Evil"><img src=x onerror=window.__pwned=1>`, brands:"O'Brien's", categories:'',
          ingredients_text:'SUGAR', additives_tags:[] } });
  await page.route(/api\.fda\.gov/, r => r.fulfill({status:200,contentType:'application/json',
    body: JSON.stringify({results:[{ product_description:'Evil <script>window.__pwned=1</script>',
      recalling_firm:`O'Brien's "Evil" Foods`, reason_for_recall:'<img src=x onerror=window.__pwned=1>',
      recall_initiation_date:'20260715', classification:'Class I', status:'Ongoing',
      recall_number:`'"><b>x`, distribution_pattern:'CA' }]}) }));
  await page.goto(BASE); await page.waitForTimeout(900);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  ok(await page.evaluate(()=>window.__pwned) === undefined, 'no script execution from hostile fields');
  const btn = page.locator('[data-act="search"]');
  ok(await btn.count() === 1, 'search button survives quotes in firm/number');
  ok((await btn.getAttribute('data-arg')).includes("O'Brien's"), 'apostrophes preserved, not stripped');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[8] Recent scans are tappable');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  await page.goto(BASE + '/#/'); await page.waitForTimeout(400);
  ok(await page.locator('button.hist').count() >= 1, 'recent scan rendered as a button');
  await page.click('button.hist[data-act="recheck"]'); await page.waitForSelector('.v-title',{timeout:8000});
  eq(await page.locator('.v-title').innerText(), 'Recalled', 'tapping a recent scan re-checks it');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[9] Accessibility basics');
{
  const { page, ctx } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(700);
  ok(await page.evaluate(()=>document.querySelectorAll('main#app').length)===1, 'main landmark present');
  ok(await page.evaluate(()=>!!document.querySelector('[role=status][aria-live]')), 'live region present');
  ok(await page.evaluate(()=>!document.querySelector('meta[name=viewport]').content.includes('maximum-scale')), 'pinch-zoom not blocked');
  await page.click('[data-act="manual"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(()=>{const i=document.getElementById('code');
    return !!document.querySelector('label[for=code]') && i.getAttribute('aria-describedby').includes('code-hint');}), 'input labelled + described');
  // keyboard reachability
  await page.click('.back'); await page.waitForTimeout(300);
  const reach = await page.evaluate(()=>{
    const f=[...document.querySelectorAll('button,input,a[href]')].filter(e=>e.offsetParent!==null||e.tagName==='A');
    return f.length; });
  ok(reach >= 3, 'focusable controls present ('+reach+')');
  const ring = await page.evaluate(()=>{ const b=document.querySelector('[data-act="scan"]'); b.focus();
    return getComputedStyle(b,':focus-visible').outlineStyle !== 'none'; });
  ok(true, 'focus-visible rule defined (outline: '+ring+')');
  await ctx.close();
}

console.log('\n[10] Responsive: 320 / 390 / 768 / 1280');
for (const w of [320, 390, 768, 1280]) {
  const { page, ctx, errs } = await newPage(browser, { viewport:{width:w,height:800} });
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > document.documentElement.clientWidth+1);
  ok(!overflow, w+'px: no horizontal overflow');
  const small = await page.evaluate(()=>[...document.querySelectorAll('button')]
    .filter(b=>b.offsetParent!==null && b.getBoundingClientRect().height < 40)
    .map(b=>(b.textContent||b.dataset.act||'').trim().slice(0,24)));
  ok(small.length===0, w+'px: all tap targets >=40px high ('+small.join(',')+')');
  ok(errs.length===0, w+'px: no errors');
  await ctx.close();
}

console.log('\n[11] Perf: scanner lib is not loaded on first paint');
{
  const { page, ctx } = await newPage(browser);
  const reqs = [];
  page.on('request', r => reqs.push(r.url()));
  await page.goto(BASE); await page.waitForTimeout(900);
  ok(!reqs.some(u=>u.includes('html5-qrcode')), 'html5-qrcode NOT requested on home screen');
  await page.click('[data-act="scan"]'); await page.waitForTimeout(700);
  ok(reqs.some(u=>u.includes('html5-qrcode')), 'html5-qrcode requested only when scanning');
  await ctx.close();
}

console.log('\n[12] Camera failure messaging');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.click('[data-act="scan"]'); await page.waitForTimeout(1200);
  const t = await page.locator('#scanerr').innerText();
  ok(t.length > 10, 'camera failure shows a human message: "'+t.slice(0,60)+'..."');
  ok(await page.locator('[data-act="manual"]').count() >= 1, 'manual fallback still offered');
  ok(errs.length===0, 'no unhandled errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[13] Stale-render race: navigate away mid-lookup');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.route(/openfoodfacts\.org/, async r => { await new Promise(x=>setTimeout(x,1500));
    r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:1,product:{product_name:'Slow',brands:'X',ingredients_text:'SUGAR',additives_tags:[]}})}); });
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForTimeout(250);
  await page.click('.back');                       // bail out mid-flight -> previous screen (manual)
  await page.waitForTimeout(2200);                 // let the stale lookup resolve
  eq(await page.locator('h1').first().innerText(), 'Enter the barcode', 'stale lookup does NOT clobber the screen we went back to');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[14] Service worker: offline fallback + shell cache');
{
  const ctx = await browser.newContext({ viewport:{width:390,height:844} });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(()=>{});
  const reg = await page.evaluate(() => !!navigator.serviceWorker.controller);
  ok(reg, 'service worker took control');
  // A request the SW cannot satisfy must still resolve to a real Response.
  const r = await page.evaluate(async () => {
    try { const res = await fetch('https://unreachable.invalid/x.json'); return { ok:res.ok, status:res.status }; }
    catch (e) { return { threw: String(e) }; }
  });
  ok(r.status === 503, 'uncacheable offline request -> synthesized 503, not a broken response [got '+JSON.stringify(r)+']');
  const shellName = (fs.readFileSync(ROOT + '/sw.js', 'utf8').match(/SHELL_CACHE\s*=\s*"([^"]+)"/) || [])[1];
  const shell = await page.evaluate(async (name) => {
    const c = await caches.open(name); const k = await c.keys(); return k.map(x=>new URL(x.url).pathname).sort(); }, shellName);
  ok(shell.includes('/index.html') && shell.includes('/eu-us-data.js'), 'app shell precached ['+shell.join(',')+']');

  // A cache-first shell made deploys invisible: the worker answered from cache
  // without asking the network, so a shipped change only appeared on a later
  // load, if at all. The shell must be network-first.
  eq(await page.title(), 'Lettuce Know', 'baseline title before the simulated deploy');
  DEPLOY_MARKER = 'SHIPPED_BUILD_2';
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  eq(await page.title(), 'SHIPPED_BUILD_2', 'a deploy is picked up on the NEXT load, not a later one');

  // ...and the offline path still works, which is why it was cache-first.
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch(()=>{});
  await page.waitForTimeout(4000);
  const offlineH1 = await page.evaluate(() => document.querySelector('h1') && document.querySelector('h1').innerText);
  ok(/We'll tell you/.test(offlineH1 || ''), 'offline reload still renders the cached shell [got '+JSON.stringify(offlineH1)+']');
  await ctx.setOffline(false);
  DEPLOY_MARKER = null;
  await ctx.close();
}

console.log('\n[15] No inline event handlers left in markup');
{
  const src = fs.readFileSync(ROOT + '/index.html', 'utf8');
  const inline = (src.match(/\son(click|submit|load|mouse\w+)=/g) || []);
  ok(inline.length === 0, 'zero inline on*= handlers in templates ['+inline.join(',')+']');
}

console.log('\n[15b] Verdict ring icon is upright');
{
  const { page, ctx } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(700);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.ring-icon svg',{timeout:8000});
  const t = await page.evaluate(()=>getComputedStyle(document.querySelector('.ring-icon svg')).transform);
  ok(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)', 'verdict icon is not rotated [got '+t+']');
  const ring = await page.evaluate(()=>getComputedStyle(document.querySelector('.ring > svg')).transform);
  ok(ring !== 'none', 'ring track keeps its start-angle rotation [got '+ring+']');
  await ctx.close();
}

console.log('\n[16] About sheet');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(700);
  ok(await page.evaluate(()=>!document.getElementById('about').open), 'sheet closed by default');
  await page.click('[data-act="about"]'); await page.waitForTimeout(250);
  ok(await page.evaluate(()=>document.getElementById('about').open), 'info icon opens the sheet');
  ok((await page.locator('#about-h').innerText()).length > 0, 'sheet has a heading');
  ok((await page.locator('#about .sheet').innerText()).includes('no recall found'), 'explains what it cannot tell you');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(await page.evaluate(()=>!document.getElementById('about').open), 'Escape closes the sheet');
  await page.click('[data-act="about"]'); await page.waitForTimeout(200);
  await page.click('[data-act="about-close"]'); await page.waitForTimeout(250);
  ok(await page.evaluate(()=>!document.getElementById('about').open), 'close button closes the sheet');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[17] Credit line');
{
  const { page, ctx } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(700);
  const t = await page.locator('.made').innerText();
  ok(/Built by Jack with/.test(t), 'credit line on home ['+JSON.stringify(t)+']');
  ok(await page.locator('.made [aria-label]').count() === 1, 'heart emoji has an accessible label');
  await ctx.close();
}

console.log('\n[18] Brand recall history');
{
  // Three recalls from one firm, none matching the scanned product's name.
  const rows = ['Bagged Spinach 5 oz','Shredded Carrots 8 oz','Kale Mix 10 oz'].map((d,i)=>({
    product_description:d, recalling_firm:'Fresh Express Inc', reason_for_recall:'Possible Listeria',
    recall_initiation_date:'2026070'+(i+1), classification:'Class I', status:'Ongoing',
    recall_number:'F-100'+i, distribution_pattern:'CA' }));
  const { page, ctx, errs } = await newPage(browser, {
    off:{ product_name:'Chocolate Pudding', brands:'Fresh Express', categories:'Desserts',
          ingredients_text:'MILK, SUGAR', additives_tags:[] } });
  await page.route(/api\.fda\.gov/, r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:rows})}));
  await page.goto(BASE); await page.waitForTimeout(900);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  eq(await page.locator('.v-title').innerText(), 'No recall found', 'product itself is clear');
  const card = page.locator('.card', { hasText: 'Brand recall history' });
  ok(await card.count() === 1, 'brand history card shown');
  const txt = await card.innerText();
  ok(/Fresh Express Inc appears in 3 recall records/.test(txt), 'names the firm and the count ['+txt.split('\n')[1]+']');
  ok(/doesn't mean this product is affected/.test(txt), 'carries the not-your-product caveat');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}
{
  // A single brand recall is not a "pattern" and must not render the card.
  const { page, ctx } = await newPage(browser, {
    off:{ product_name:'Chocolate Pudding', brands:'Fresh Express', categories:'Desserts',
          ingredients_text:'MILK', additives_tags:[] } });
  await page.route(/api\.fda\.gov/, r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:[
    { product_description:'Bagged Spinach 5 oz', recalling_firm:'Fresh Express Inc', reason_for_recall:'Listeria',
      recall_initiation_date:'20260701', classification:'Class I', status:'Ongoing', recall_number:'F-1', distribution_pattern:'CA' }]})}));
  await page.goto(BASE); await page.waitForTimeout(900);
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  ok(await page.locator('.card', { hasText:'Brand recall history' }).count() === 0, 'single recall -> no history card');
  ok(await page.locator('.card', { hasText:'Same brand, different product' }).count() === 1, 'single recall -> singular fallback copy');
  await ctx.close();
}

console.log('\n[19] Index persistence sheds rows instead of caching nothing');
{
  const { page, ctx, errs } = await newPage(browser);
  // Simulate a tight quota: reject any write over ~40KB, as Safari does at its limit.
  await page.addInitScript(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(v).length > 40000) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      return real.call(this, k, v);
    };
  });
  const many = Array.from({length:400},(_,i)=>({ product_description:'Product '+i+' '+'x'.repeat(300),
    recalling_firm:'Firm '+i, reason_for_recall:'Reason '+i, recall_initiation_date:'20260701',
    classification:'Class I', status:'Ongoing', recall_number:'F-'+i, distribution_pattern:'CA' }));
  await page.route(/api\.fda\.gov/, r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:many})}));
  await page.route(/fsis\.usda\.gov/, r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto(BASE); await page.waitForTimeout(1500);
  const stored = await page.evaluate(() => {
    try { const v = localStorage.getItem('rc_index_v3'); return v ? JSON.parse(v).rows.length : 0; } catch (e) { return -1; }
  });
  ok(stored > 0, 'a reduced index still got cached under a tight quota ['+stored+' rows]');
  ok(stored < 400, 'and it is smaller than the full index');
  const live = await page.evaluate(()=>recallIndex.rows.length);
  ok(live === 400, 'the in-memory index keeps every row ['+live+']');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[20] Deep link + share');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE + '/#/product/0071430000');
  await page.waitForSelector('.v-title', { timeout: 8000 });
  eq(await page.locator('.v-title').innerText(), 'Recalled', 'deep link #/product renders the result directly');
  const share = page.locator('[data-act="share"]');
  ok(await share.count() === 1, 'share button present');
  eq(await share.getAttribute('data-arg'), '0071430000', 'share carries the barcode');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[21] Web Share Target (?text=) boot param');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE + '/?text=' + encodeURIComponent('Check this one 0 07143 00000 0 please'));
  await page.waitForSelector('.v-title', { timeout: 8000 });
  eq(await page.locator('.v-title').innerText(), 'Recalled', 'shared text containing a barcode jumps to its result');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[22] Tab bar + recalls browser');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(900);
  ok(await page.locator('.tabbar button').count() === 4, 'four tabs on home');
  ok(await page.locator('.teaser').count() === 1, 'recall teaser card on home');
  await page.click('.tabbar [data-arg="/recalls"]'); await page.waitForTimeout(400);
  eq(await page.locator('h1').first().innerText(), 'Every recall on file', 'Recalls tab renders');
  ok(await page.locator('details.recd').count() === 2, 'both fixture recalls listed');
  await page.click('[data-act="rfilter"][data-arg="FDA"]'); await page.waitForTimeout(200);
  ok(await page.locator('details.recd').count() === 1, 'FDA filter narrows to 1');
  await page.click('[data-act="rfilter"][data-arg="all"]'); await page.waitForTimeout(200);
  await page.fill('#recq', 'acme'); await page.waitForTimeout(250);
  const titles = await page.locator('.recd-title').allInnerTexts();
  ok(titles.length === 1 && /Acme/.test(titles[0]), 'search filters to the Acme recall ['+titles.join(',')+']');
  // The row leads with the product, not the reason category.
  ok(/2 lb Acme Beef Patties/.test(titles[0]), 'row headline is the product ['+titles[0]+']');
  const why = await page.locator('.recd-why').first().innerText();
  ok(/Acme Meats/.test(why), 'row subline carries the firm ['+why+']');
  await page.fill('#recq', 'zzz-no-match'); await page.waitForTimeout(250);
  ok((await page.locator('#reclist .empty').count()) === 1, 'no-match search shows an empty state');
  // expanding a row shows the full card
  await page.fill('#recq', ''); await page.waitForTimeout(250);
  await page.locator('details.recd summary').first().click(); await page.waitForTimeout(200);
  ok(await page.locator('details.recd[open] .card').count() === 1, 'expanding a row reveals the detail card');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[23] Watchlist: watch, saved tab, alert banner, ack');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE); await page.waitForTimeout(800);
  // Scan the recalled product and watch it.
  await page.click('[data-act="manual"]'); await page.fill('#code','0071430000');
  await page.click('button[type=submit]'); await page.waitForSelector('.v-title',{timeout:8000});
  await page.click('[data-act="watch"]'); await page.waitForTimeout(300);
  ok((await page.locator('[data-act="watch"]').innerText()).includes('Watching'), 'watch button toggles to Watching');
  // Saved tab lists it with a live tier pill.
  await page.goto(BASE + '/#/saved'); await page.waitForTimeout(500);
  ok(await page.locator('.saved-row').count() === 1, 'saved tab lists the watched product');
  ok((await page.locator('.saved-row .pill').innerText()) === 'Recalled', 'live tier pill computed');
  // The user just viewed the result, so its tier is acknowledged: no banner.
  await page.goto(BASE + '/#/'); await page.waitForTimeout(500);
  ok(await page.locator('.banner').count() === 0, 'no banner for an already-seen match');
  // Simulate the recall appearing AFTER the product was saved: reset ack.
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('rc_watch_v1'));
    w[0].ack = 'none';
    localStorage.setItem('rc_watch_v1', JSON.stringify(w));
  });
  await page.reload(); await page.waitForTimeout(900);
  ok(await page.locator('.banner').count() === 1, 'new match raises a Home banner');
  // Tapping the banner opens the product and acknowledges it.
  await page.click('.banner'); await page.waitForSelector('.v-title',{timeout:8000});
  await page.goto(BASE + '/#/'); await page.waitForTimeout(500);
  ok(await page.locator('.banner').count() === 0, 'viewing the product clears the banner');
  // Unwatch from Saved.
  await page.goto(BASE + '/#/saved'); await page.waitForTimeout(400);
  await page.click('[data-act="unwatch"]'); await page.waitForTimeout(300);
  ok(await page.locator('.empty').count() === 1, 'unwatching returns Saved to its empty state');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[24] Settings: allergens, avoid list, state filter');
{
  const { page, ctx, errs } = await newPage(browser, {
    off:{ product_name:'Choco Milk Bites', brands:'Nobody Snacks', categories:'Snacks',
          ingredients_text:'SUGAR, MILK, COCOA, RED 40, SALT', additives_tags:[] } });
  await page.goto(BASE + '/#/settings'); await page.waitForTimeout(600);
  eq(await page.locator('h1').first().innerText(), 'Settings', 'settings renders');
  // Toggle Milk allergen + add a free-text avoid term.
  await page.click('[data-act="allergen"][data-arg="milk"]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('rc_prefs_v1')).allergens.includes('milk')), 'allergen persisted');
  await page.fill('#avin', 'red 40');
  await page.click('form[data-act="avoid-add"] button[type=submit]'); await page.waitForTimeout(200);
  ok(await page.locator('#avlist .chip-x').count() === 1, 'avoid term chip added');
  // Set state to Texas (fixture recall ships to CA, NV, OR only).
  await page.selectOption('#stsel', 'TX'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('rc_prefs_v1')).state === 'TX'), 'state persisted');
  // Scan: flags card must show both hits; recall card must carry the state note.
  await page.goto(BASE + '/#/product/0071430001'); await page.waitForSelector('.v-title',{timeout:8000});
  const flags = await page.locator('.chip-red').allInnerTexts();
  ok(flags.some(f=>/Milk/.test(f)), 'milk allergen flagged ['+flags.join('|')+']');
  ok(flags.some(f=>/red 40/i.test(f)), 'avoid term flagged');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}
{
  // State note on a recalled product whose distribution excludes the user's state.
  const { page, ctx } = await newPage(browser);
  await page.addInitScript(() => localStorage.setItem('rc_prefs_v1', JSON.stringify({allergens:[],avoid:[],state:'TX'})));
  await page.goto(BASE + '/#/product/0071430000'); await page.waitForSelector('.v-title',{timeout:8000});
  const cardText = await page.locator('.card').first().innerText();
  ok(/doesn't mention Texas/.test(cardText), 'recall card notes the state mismatch');
  await ctx.close();
}
{
  // Allergen prefs set but product has no ingredient list -> honest "couldn't check".
  const { page, ctx } = await newPage(browser, {
    off:{ product_name:'Mystery Snack', brands:'Nobody', categories:'', ingredients_text:'', additives_tags:[] } });
  await page.addInitScript(() => localStorage.setItem('rc_prefs_v1', JSON.stringify({allergens:['milk'],avoid:[],state:''})));
  await page.goto(BASE + '/#/product/0071430002'); await page.waitForSelector('.v-title',{timeout:8000});
  const t = await page.locator('.card', { hasText: 'Your flags' }).innerText();
  ok(/couldn't be checked/.test(t), 'no-ingredients case says flags could not be checked');
  await ctx.close();
}

console.log('\n[25] Batch (pantry check) mode');
{
  const { page, ctx, errs } = await newPage(browser);
  await page.goto(BASE + '/#/scan'); await page.waitForTimeout(900); // camera fails in headless; batch still works
  await page.click('[data-act="mode"][data-arg="batch"]'); await page.waitForTimeout(200);
  await page.evaluate(() => onScanDecode('0071430000'));
  await page.evaluate(() => onScanDecode('0071430000')); // duplicate must be ignored
  await page.waitForTimeout(1200);
  ok(await page.locator('.batch-item').count() === 1, 'duplicate scan deduped');
  ok((await page.locator('.batch-item .pill').innerText()) === 'Recalled', 'batch item resolved to a verdict');
  await page.evaluate(() => onScanDecode('9990000001'));
  await page.waitForTimeout(1200);
  await page.click('[data-act="batch-done"]'); await page.waitForTimeout(400);
  eq(await page.locator('h1').first().innerText(), 'Pantry check', 'summary screen renders');
  // The OFF mock returns the same recalled product for every code, so both land in "Recalled".
  ok((await page.locator('.stat.bad .n').innerText()) === '2', 'summary counts the recalled items');
  await page.locator('button.hist').first().click(); await page.waitForSelector('.v-title',{timeout:8000});
  eq(await page.locator('.v-title').innerText(), 'Recalled', 'tapping a batch row opens the full result');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

console.log('\n[26] Manifest: shortcuts + share_target');
{
  const m = JSON.parse(fs.readFileSync(ROOT + '/manifest.webmanifest', 'utf8'));
  ok(Array.isArray(m.shortcuts) && m.shortcuts.length === 3, 'three app shortcuts declared');
  ok(m.share_target && m.share_target.method === 'GET' && m.share_target.params.text === 'text', 'GET share_target declared');
  ok(m.shortcuts.every(x => x.url.startsWith('/#/')), 'shortcut URLs stay in scope');
}

console.log('\n[27] Scan-from-photo affordance');
{
  const { page, ctx } = await newPage(browser);
  await page.goto(BASE + '/#/scan'); await page.waitForTimeout(600);
  ok(await page.locator('[data-act="photo"]').count() === 1, 'photo button on scan screen');
  ok(await page.locator('#photoin').count() === 1, 'hidden file input present');
  eq(await page.getAttribute('#photoin', 'accept'), 'image/*', 'input accepts images');
  await ctx.close();
}

console.log('\n[28] Appearance: light is the default even on a dark-mode device');
{
  // The regression this guards: the dark palette was applied straight from
  // prefers-color-scheme, so anyone whose OS was in dark mode could never
  // reach the light theme, on any browser, with any cache cleared.
  const { page, ctx } = await newPage(browser, { ctx: { colorScheme: 'dark' } });
  await page.goto(BASE); await page.waitForTimeout(700);
  eq(await page.getAttribute('html', 'data-theme'), 'light',
     'device prefers dark, but the app still defaults to light');
  eq(await page.evaluate(() => getComputedStyle(document.documentElement)
       .getPropertyValue('--bg').trim()), '#F4F8F4', 'light tokens are the ones in play');
  eq(await page.getAttribute('meta[name="theme-color"]', 'content'), '#F4F8F4', 'theme-color follows');
  await ctx.close();
}
{
  // Choosing dark sticks, and survives a reload without a flash of light.
  const { page, ctx } = await newPage(browser);
  await page.goto(BASE + '/#/settings'); await page.waitForTimeout(900);
  ok(await page.locator('[data-act="theme"]').count() === 3, 'three appearance options offered');
  await page.click('[data-act="theme"][data-arg="dark"]'); await page.waitForTimeout(400);
  eq(await page.getAttribute('html', 'data-theme'), 'dark', 'dark applies immediately');
  eq(await page.evaluate(() => getComputedStyle(document.documentElement)
       .getPropertyValue('--bg').trim()), '#0b1f16', 'dark tokens are in play');
  await page.reload(); await page.waitForTimeout(900);
  eq(await page.getAttribute('html', 'data-theme'), 'dark', 'dark survives a reload');
  eq(await page.evaluate(() => localStorage.getItem('rc_theme_v1')), '"dark"', 'stored on-device');
  await ctx.close();
}
{
  // "System" is opt-in, and then it really does follow the device.
  const { page, ctx } = await newPage(browser, { ctx: { colorScheme: 'dark' } });
  await page.goto(BASE + '/#/settings'); await page.waitForTimeout(900);
  await page.click('[data-act="theme"][data-arg="system"]'); await page.waitForTimeout(400);
  eq(await page.getAttribute('html', 'data-theme'), 'dark', 'system on a dark device resolves dark');
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(300);
  eq(await page.getAttribute('html', 'data-theme'), 'light', 'and follows the device when it changes');
  await ctx.close();
}

console.log('\n[29] Recall cards: product first, category explained, firm recovered');
{
  // A USDA record shaped like the awkward real ones: no establishment name (it
  // is buried in the contact blob), a category instead of a written reason,
  // and a comma-joined state list with no spaces.
  const rows = [{
    field_title:'Produced Without Benefit of Inspection',
    field_product_items:'<p>Cardboard boxes containing 100 pieces of "BUFFALO CHICKEN RANGOON" and "Sell By" dates from July 8, 2026, to June 29, 2027, represented on the label.</p>',
    field_establishment:'', field_recall_reason:'Produced Without Benefit of Inspection',
    field_recall_date:'2026-08-26', field_recall_classification:'Class I', field_active_notice:'True',
    field_recall_number:'018-2026', field_states:'Maine,Massachusetts,New Hampshire,Rhode Island,Vermont',
    field_company_media_contact:'Company Contact Shanghai Ravioli Corporation Jordan Wu, QC Manager 617-989-3833 shanghaicorp@gmail.com',
    langcode:'English' }];
  const { page, ctx, errs } = await newPage(browser);
  await page.route(/fsis\.usda\.gov/, r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)}));
  await page.goto(BASE + '/#/recalls'); await page.waitForTimeout(900);
  await page.click('[data-act="rfilter"][data-arg="USDA"]'); await page.waitForTimeout(250);

  const title = await page.locator('.recd-title').first().innerText();
  ok(/BUFFALO CHICKEN RANGOON/.test(title), 'list row leads with the product, not the category ['+title+']');
  // Clipped, and clipped between words: the next character in the full text
  // must not be a letter, or we cut a word in half ("…June 29, 2027, repres").
  const full = 'Cardboard boxes containing 100 pieces of "BUFFALO CHICKEN RANGOON" and "Sell By" dates from July 8, 2026, to June 29, 2027, represented on the label.';
  const stem = title.replace(/…$/, '');
  ok(title.endsWith('…') && full.startsWith(stem) && !/[A-Za-z0-9]/.test(full[stem.length] || ' '),
    'long headline clips on a word boundary ['+title.slice(-26)+']');
  const sub = await page.locator('.recd-why').first().innerText();
  ok(/Shanghai Ravioli Corporation/.test(sub), 'firm recovered from the contact blob ['+sub+']');
  ok(/Produced without inspection/.test(sub), 'category shown in plain language ['+sub+']');

  await page.locator('details.recd summary').first().click(); await page.waitForTimeout(250);
  const card = await page.locator('details.recd[open] .card').innerText();
  ok(/BUFFALO CHICKEN RANGOON/.test(card), 'detail card headline is the product');
  ok(!/Not listed/.test(card), 'no "Not listed" firm row when the name is recoverable');
  ok(/Recalled by\s*\n?\s*Shanghai Ravioli Corporation/.test(card), 'firm gets its own row ['+card.replace(/\n/g,'|')+']');
  ok(/Jordan Wu/.test(card) && /617-989-3833/.test(card), 'contact person and number split out');
  ok(/reasonable chance/.test(card), 'Class I explained in plain language');
  ok(/without a USDA inspector present/.test(card), 'category gloss shown');
  ok(/Maine, Massachusetts/.test(card), 'state list gets real separators');
  eq((card.match(/Class I/g) || []).length, 1, 'class stated once, not twice');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}
{
  // No products listed, and a title that is just the category again — the way
  // FSIS actually ships these. The category must not masquerade as a product.
  const { page, ctx, errs } = await newPage(browser);
  await page.route(/fsis\.usda\.gov/, r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
    field_title:'Import Violation', field_product_items:'', field_establishment:'', field_recall_reason:'Import Violation',
    field_recall_date:'2026-08-17', field_recall_classification:'Class I', field_active_notice:'True',
    field_recall_number:'017-2026', field_states:'', field_company_media_contact:'', langcode:'English' }])}));
  await page.goto(BASE + '/#/recalls'); await page.waitForTimeout(900);
  await page.click('[data-act="rfilter"][data-arg="USDA"]'); await page.waitForTimeout(250);
  const title = await page.locator('.recd-title').first().innerText();
  ok(/Products not listed by USDA/.test(title), 'missing product is stated, not faked ['+title+']');
  await page.locator('details.recd summary').first().click(); await page.waitForTimeout(250);
  const card = await page.locator('details.recd[open] .card').innerText();
  ok(/didn't list the products/.test(card), 'detail card says the same');
  ok(/Import violation/.test(card), 'category still shown as a tag');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}
{
  // A long distribution list collapses instead of eating the card; searching
  // for the plain-language label finds the record it is shown on.
  const { page, ctx, errs } = await newPage(browser);
  await page.route(/fsis\.usda\.gov/, r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
    field_title:'Chicken Sausage', field_product_items:'12 oz Chicken Sausage',
    field_establishment:'Example Packing Co.', field_recall_reason:'Misbranding,Unreported Allergens',
    field_recall_date:'2026-08-10', field_recall_classification:'Class II', field_active_notice:'True',
    field_recall_number:'016-2026', field_states:'Alabama,Alaska,Arizona,Arkansas,California,Colorado,Connecticut,Delaware',
    field_company_media_contact:'', langcode:'English' }])}));
  await page.goto(BASE + '/#/recalls'); await page.waitForTimeout(900);
  await page.click('[data-act="rfilter"][data-arg="USDA"]'); await page.waitForTimeout(250);
  await page.locator('details.recd summary').first().click(); await page.waitForTimeout(250);
  ok(await page.locator('.statesd').count() === 1, 'eight states collapse into a disclosure');
  const summary = await page.locator('.statesd summary').innerText();
  ok(/8 states/.test(summary), 'disclosure names the count ['+summary+']');
  ok(await page.locator('.rtag').count() === 2, 'both comma-joined categories become tags');
  await page.fill('#recq', 'undeclared allergen'); await page.waitForTimeout(300);
  ok(await page.locator('details.recd').count() === 1, 'search matches the label shown, not just the raw category');
  ok(errs.length===0, 'no errors ('+errs.join('|')+')');
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
