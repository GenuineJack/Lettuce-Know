const SHELL_CACHE = "recall-shell-v7";
const DATA_CACHE  = "recall-data-v1";
const KEEP = [SHELL_CACHE, DATA_CACHE];
const SHELL_FILES = ["/", "/index.html", "/eu-us-data.js", "/manifest.webmanifest"];
const DATA_MAX = 60; // cap the offline fallback cache so it can't grow forever

self.addEventListener("install", e => {
  // addAll fails the whole install if any single file 404s, so fetch them
  // individually and let the shell install even if one is missing.
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Oldest-first eviction. Cache API keys() returns insertion order.
async function trim(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}

// A cache miss while offline must still resolve to a Response — returning
// undefined from respondWith surfaces as an opaque network error, which the
// app can't tell apart from a real failure.
const offlineResponse = () => new Response(
  JSON.stringify({ error: "offline", message: "No network and no cached copy." }),
  { status: 503, statusText: "Offline", headers: { "Content-Type": "application/json" } }
);

const SHELL_TIMEOUT = 3000;

async function shellResponse(req) {
  const cache = await caches.open(SHELL_CACHE);
  // A navigation must end up with HTML, so fall back to the cached document
  // rather than to a JSON error body.
  const cached = (await cache.match(req))
    || (req.mode === "navigate" ? await cache.match("/index.html") : undefined);

  const net = fetch(req).then(res => {
    if (res && res.ok && res.status === 200) cache.put(req, res.clone()).catch(() => {});
    return res;
  });

  // Nothing cached yet (first visit): the network is the only option.
  if (!cached) return net.catch(() => offlineResponse());

  try {
    return await Promise.race([
      net,
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), SHELL_TIMEOUT))
    ]);
  } catch (err) {
    // Slow or offline: open from cache now. `net` keeps running and refreshes
    // the cache underneath, so the next load gets the new shell.
    return cached;
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // App shell: network-first with a short timeout, then cache.
  //
  // This used to be cache-first, which meant a deploy was invisible: the old
  // worker answered from its cache without ever asking the network, so the
  // page rendered stale HTML and the new worker only took effect on a later
  // load. Racing a timer keeps the app opening fast on a bad connection
  // (a store aisle) while still picking up a deploy on the next load.
  if (url.origin === self.location.origin && SHELL_FILES.includes(url.pathname)) {
    e.respondWith(shellResponse(req));
    return;
  }

  // Everything else (recall/product APIs): network-first, since stale
  // recall data is worse than no data. Cache as a fallback for true offline.
  e.respondWith(
    fetch(req)
      .then(res => {
        // Only store real, complete, non-opaque responses.
        if (res && res.ok && res.type !== "opaque" && res.status === 200) {
          const copy = res.clone();
          caches.open(DATA_CACHE)
            .then(c => c.put(req, copy).then(() => trim(c, DATA_MAX)))
            .catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || offlineResponse()))
  );
});

/* ============================================================
   Periodic background sync: best-effort watchlist notifications
   ============================================================
   Only fires where the browser supports it (Chrome/Edge, installed PWA,
   site-engagement gated) — index.html feature-detects before registering,
   so this handler simply does nothing anywhere else.

   The watchlist itself lives in localStorage, which service workers can't
   reach, so index.html mirrors it into IndexedDB (db "lettuce-know", store
   "kv", key "watchlist") on every save. Matching here is deliberately
   coarse — a lowercase word-overlap check, not the full scoring engine the
   app uses on-screen — because duplicating that engine here would be a
   second copy to keep in sync. A false positive just sends the user to the
   app to see the real, precise verdict; it's a nudge, not a claim. */

const FDA_URL = "https://api.fda.gov/food/enforcement.json";
const FSIS_URL = "https://www.fsis.usda.gov/fsis/api/recall/v/1";
const NOTIFY_STOP = new Set(["the","and","with","for","from","organic","natural","original","fresh","brand","inc","llc","ltd","co","corp","company","foods","food","products","product"]);

function notifyWords(s) {
  return [...new Set(String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 2 && !NOTIFY_STOP.has(w)))];
}

function idbGet(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("lettuce-know", 1);
    req.onupgradeneeded = () => { req.result.createObjectStore("kv"); };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("kv", "readonly");
      const getReq = tx.objectStore("kv").get(key);
      getReq.onsuccess = () => { resolve(getReq.result); db.close(); };
      getReq.onerror = () => { reject(getReq.error); db.close(); };
    };
    req.onerror = () => reject(req.error);
  });
}

function idbSet(key, value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("lettuce-know", 1);
    req.onupgradeneeded = () => { req.result.createObjectStore("kv"); };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => { resolve(); db.close(); };
      tx.onerror = () => { reject(tx.error); db.close(); };
    };
    req.onerror = () => reject(req.error);
  });
}

async function checkWatchlist() {
  const watchlist = await idbGet("watchlist").catch(() => null);
  if (!Array.isArray(watchlist) || !watchlist.length) return;

  const notified = (await idbGet("notified").catch(() => null)) || [];
  const notifiedSet = new Set(notified);

  let recalls = [];
  try {
    const [fda, fsis] = await Promise.allSettled([
      fetch(`${FDA_URL}?limit=200&sort=report_date:desc`).then(r => r.ok ? r.json() : null),
      fetch(`${FSIS_URL}?field_archive_recall=0`).then(r => r.ok ? r.json() : null)
    ]);
    if (fda.status === "fulfilled" && fda.value && Array.isArray(fda.value.results)) {
      recalls.push(...fda.value.results.map(x => ({
        id: "fda:" + (x.recall_number || x.event_id || x.product_description || Math.random()),
        text: `${x.product_description || ""} ${x.recalling_firm || ""}`.toLowerCase()
      })));
    }
    const fsisRows = fsis.status === "fulfilled" && fsis.value
      ? (Array.isArray(fsis.value) ? fsis.value : (Array.isArray(fsis.value.results) ? fsis.value.results : []))
      : [];
    recalls.push(...fsisRows.map(x => ({
      id: "fsis:" + (x.field_recall_number || x.field_title || Math.random()),
      text: `${x.field_product_items || ""} ${x.field_title || ""} ${x.field_establishment || ""}`.toLowerCase()
    })));
  } catch (e) { return; }

  if (!recalls.length) return;

  const newlyNotified = [];
  for (const w of watchlist) {
    const brandWords = notifyWords(w.brand);
    const nameWords = notifyWords(w.name);
    if (!brandWords.length && !nameWords.length) continue;
    for (const rec of recalls) {
      if (notifiedSet.has(rec.id)) continue;
      const brandHit = brandWords.length && brandWords.some(word => rec.text.includes(word));
      const nameHit = nameWords.filter(word => rec.text.includes(word)).length >= 2;
      if (brandHit || nameHit) {
        newlyNotified.push(rec.id);
        await self.registration.showNotification("Possible recall on your watchlist", {
          body: `${w.name || w.brand} may match a new FDA/USDA recall — open Lettuce Know to check.`,
          icon: "/icons/icon-192.png",
          badge: "/icons/favicon-32.png",
          tag: "watchlist-" + (w.code || w.name),
          data: { url: "/#/product/" + (w.code || "") }
        });
        break; // one notification per watched item per tick is enough
      }
    }
  }
  if (newlyNotified.length) {
    // Cap the dedupe set so it can't grow forever across weeks of ticks.
    await idbSet("notified", [...notifiedSet, ...newlyNotified].slice(-200));
  }
}

self.addEventListener("periodicsync", e => {
  if (e.tag === "watchlist-check") e.waitUntil(checkWatchlist());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) { if ("focus" in c) return c.focus().then(() => c.navigate ? c.navigate(url) : null); }
      return self.clients.openWindow(url);
    })
  );
});
