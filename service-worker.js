const CACHE_NAME = "ithaca-shell-v22-2";

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
  "./css/workspace.css",
  "./js/selectors.js",
  "./js/views/dossierForms.js",
  "./js/views/archiveView.js",
  "./js/components/recordRow.js",
  "./js/components/progressiveForm.js",
  "./js/components/tripActions.js",
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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("ithaca-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // The entire module graph belongs to one release, including offline loads.
    const cached = await cache.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") {
      const shell = await cache.match(new URL("./index.html", self.registration.scope));
      if (shell) return shell;
    }
    return fetch(event.request);
  })());
});
