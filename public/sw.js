// Offline cache. The app never talks to a server at runtime, so "works with the network off"
// is the honest test of that claim. The build fills PRECACHE and CACHE with this build's hashed
// file names (scripts/sw-precache.ts); fonts and anything else are cached as they are requested.
const CACHE = 'novel-similarity-v1'
/** Paths relative to the app root; '' is the HTML shell. */
const PRECACHE = /*PRECACHE*/ ['']
const ROOT = new URL('./', location.href)

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((p) => new URL(p, ROOT).pathname)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  // The HTML shell names the hashed assets of its build, so serving a cached one pins the whole
  // app to an old version. Navigations go to the network first and fall back to cache offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.ok ? res.clone() : null
          if (copy) void caches.open(CACHE).then((c) => c.put(ROOT.pathname, copy))
          return res
        })
        .catch(() => caches.match(ROOT.pathname).then((hit) => hit ?? Response.error())),
    )
    return
  }
  // Asset names carry a content hash, so a cache hit is never the wrong file.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const live = fetch(e.request)
        .then((res) => {
          // Clone now: by the time caches.open() resolves the page may have consumed the body.
          const copy = res.ok ? res.clone() : null
          if (copy) void caches.open(CACHE).then((c) => c.put(e.request, copy))
          return res
        })
        .catch(() => hit ?? Response.error())
      return hit ?? live
    }),
  )
})
