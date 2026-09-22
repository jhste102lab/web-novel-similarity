// Offline cache. The app never talks to a server at runtime, so "works with the network off"
// is the honest test of that claim. The build fills PRECACHE with this build's hashed file
// names (scripts/sw-precache.ts); fonts and anything else are cached as they are requested.
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
  // A navigation to any path inside the app resolves to the one HTML shell.
  const key = e.request.mode === 'navigate' ? ROOT.pathname : e.request
  e.respondWith(
    caches.match(key).then((hit) => {
      const live = fetch(e.request)
        .then((res) => {
          // Clone now: by the time caches.open() resolves the page may have consumed the body.
          const copy = res.ok ? res.clone() : null
          if (copy) void caches.open(CACHE).then((c) => c.put(key, copy))
          return res
        })
        .catch(() => hit ?? Response.error())
      return hit ?? live
    }),
  )
})
