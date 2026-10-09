// fallow-ignore-file unused-file
// Offline-first app shell: every file of the build (all lazy route chunks, workers, the sqlite
// wasm) is downloaded on install, so a page never opened online still loads offline.
// `vite-plugin-precache.ts` replaces the marker below with the build's file list and version;
// in dev it stays empty (the SW is only registered in production).
const MANIFEST = self.__PRECACHE_MANIFEST__ ?? { version: "dev", files: [] };

const CACHE_PREFIX = "pass-mgr-";
const CACHE_NAME = `${CACHE_PREFIX}${MANIFEST.version}`;
const INDEX_URL = new URL("index.html", self.registration.scope).href;
const PRECACHED = new Set(
  MANIFEST.files.map((file) => new URL(file, self.registration.scope).href),
);

self.addEventListener("install", (event) => {
  // All or nothing: a missing file fails the install and the old version stays active.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll([...PRECACHED].map((url) => new Request(url, { cache: "reload" }))),
      ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// The page asks for this at startup when a new version is waiting (`src/register-sw.ts`).
// Never activated mid-session: the running page may still lazy-load chunks of its own version.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/trpc")) return;

  // SPA navigation (deep links like /settings/security): the cached shell.
  if (request.mode === "navigate") {
    event.respondWith(fromCache(INDEX_URL).then((cached) => cached ?? fetch(request)));
    return;
  }

  url.search = "";
  if (!PRECACHED.has(url.href)) return;
  event.respondWith(fromCache(url.href).then((cached) => cached ?? fetch(request)));
});

function fromCache(url) {
  return caches.open(CACHE_NAME).then((cache) => cache.match(url));
}
