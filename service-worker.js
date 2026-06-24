const CACHE_NAME = "ithaca-shell-v21-2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.ico",
  "./assets/icons/favicon-32x32.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-192.png",
  "./assets/icons/maskable-512.png",
  "./assets/brand/ithaca-logo.png",
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
  "./js/components/bottomNav.js",
  "./js/components/appBar.js",
  "./js/components/fab.js"
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
