// fallow-ignore-file unused-file
// Offline-first app shell: every file of the build (all lazy route chunks, workers, the sqlite
// wasm) is downloaded on install, so a page never opened online still loads offline.
// `vite-plugin-build-integrity.ts` replaces the marker below with the build's files (each with its
// SRI hash) and version; in dev it stays empty (the SW is only registered in production).
const MANIFEST = self.__PRECACHE_MANIFEST__ ?? { version: "dev", files: {} };

const CACHE_PREFIX = "pass-mgr-";
const CACHE_NAME = `${CACHE_PREFIX}${MANIFEST.version}`;
const INDEX_URL = new URL("index.html", self.registration.scope).href;
const PRECACHED = new Map(
  Object.entries(MANIFEST.files).map(([file, integrity]) => [
    new URL(file, self.registration.scope).href,
    integrity,
  ]),
);

self.addEventListener("install", (event) => {
  // All or nothing: a missing file, or one that doesn't match its hash, fails the install and the
  // old version stays active. Everything is fetched before anything is cached.
  const entries = [...PRECACHED];
  event.waitUntil(
    Promise.all(entries.map(([url, integrity]) => fetchChecked(url, integrity))).then(
      async (responses) => {
        const cache = await caches.open(CACHE_NAME);
        try {
          await Promise.all(responses.map((response, i) => cache.put(entries[i][0], response)));
        } catch (error) {
          await caches.delete(CACHE_NAME);
          throw error;
        }
      },
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

// A content-hashed file never changes under its URL, so the copy the page just loaded (HTTP cache)
// will do. One that fails its hash there (a poisoned cache) is fetched again from the network, so it
// can't block every install for as long as it is cached.
async function fetchChecked(url, integrity) {
  if (new URL(url).pathname.startsWith("/assets/")) {
    const cached = await fetch(new Request(url, { integrity })).catch(() => null);
    if (cached?.ok) return cached;
  }
  const response = await fetch(new Request(url, { cache: "reload", integrity }));
  if (!response.ok) throw new Error(`precache: ${url} answered ${response.status}`);
  return response;
}

function fromCache(url) {
  return caches.open(CACHE_NAME).then((cache) => cache.match(url));
}
