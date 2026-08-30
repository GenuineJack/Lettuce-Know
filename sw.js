const SHELL_CACHE = "recall-shell-v3";
const SHELL_FILES = ["/", "/index.html", "/eu-us-data.js", "/manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // App shell: cache-first so the app opens instantly, even offline.
  if (url.origin === self.location.origin && SHELL_FILES.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
    return;
  }

  // Everything else (recall/product APIs): network-first, since stale
  // recall data is worse than no data. Cache as a fallback for true offline.
  if (e.request.method === "GET") {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
