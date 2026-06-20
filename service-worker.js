const CACHE_NAME = "ithaca-shell-v17-5-1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/icons/favicon.svg",
  "./assets/icons/icon-192.svg",
  "./assets/icons/icon-512.svg",
  "./css/reset.css",
  "./css/variables.css",
  "./css/base.css",
  "./css/components.css",
  "./css/layout.css",
  "./js/app.js",
  "./js/router.js",
  "./js/storage.js",
  "./js/utils.js",
  "./js/views/homeView.js",
  "./js/views/tripDashboardView.js",
  "./js/views/timelineView.js",
  "./js/views/budgetView.js",
  "./js/views/checklistView.js",
  "./js/views/notesView.js",
  "./js/components/modal.js",
  "./js/components/toast.js",
  "./js/components/bottomNav.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
