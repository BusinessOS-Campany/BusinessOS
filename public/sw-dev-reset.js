/**
 * Removes a service worker left behind by a production build.
 *
 * Development serves from `.next-dev` with Serwist disabled, so it never emits
 * `sw.js` and never registers a worker — but a worker installed from an earlier
 * `next start` on the same origin keeps controlling the page and answers for
 * `sw.js` and the precached hashed chunks, which the dev server does not have.
 * The visible symptom is a page that renders its HTML and then silently never
 * hydrates, plus 404s in the console for its own JavaScript.
 *
 * There is no code path that unregisters it: the browser only drops a worker when
 * the page is closed and the worker is found redundant, and here the fetch that
 * would prove it redundant is the one 404ing.
 *
 * Loaded only when NODE_ENV === "development" (see the root layout). Outside dev
 * it must never run — unregistering in production would break offline support
 * for every installed client.
 */
(function () {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    registrations.forEach(function (registration) {
      registration.unregister();
    });
    if (registrations.length > 0 && typeof caches !== "undefined") {
      caches.keys().then(function (keys) {
        keys.forEach(function (key) {
          caches.delete(key);
        });
      });
    }
  });
})();
