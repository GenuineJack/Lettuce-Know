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
