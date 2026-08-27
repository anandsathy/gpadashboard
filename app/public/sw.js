/*
 * Service worker — offline support for GPA Dashboard.
 *
 * Two strategies, chosen so a deploy can never strand someone on a stale build:
 *
 *   - Navigations go network-first. A fresh index.html is always preferred, and
 *     the cache is only consulted when the network genuinely fails. This is the
 *     rule that keeps an update from being invisible.
 *   - Hashed build assets go cache-first, which is free to do safely: their
 *     filenames change whenever their contents do.
 *
 * Anything else — Firebase, fonts, the wider internet — is left alone entirely.
 */

const VERSION = "v2";
const SHELL_CACHE = `gpa-shell-${VERSION}`;
const ASSET_CACHE = `gpa-assets-${VERSION}`;

const SHELL_URLS = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `reload` bypasses the HTTP cache so a fresh install never precaches a
      // stale copy of the shell.
      .then((cache) => cache.addAll(SHELL_URLS.map((url) => new Request(url, { cache: "reload" }))))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("gpa-") && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch another origin: Firestore's streaming requests in particular
  // must not pass through a cache.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html").then((hit) => hit ?? Response.error())),
    );
    return;
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});
