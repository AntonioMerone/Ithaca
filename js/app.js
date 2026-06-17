import { initRouter } from "./router.js";
import { showToast } from "./components/toast.js";

const app = document.querySelector("#app");
const routeStatus = document.querySelector("#route-status");

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      showToast("Cache offline non disponibile in questa sessione.");
    });
  });
}

initRouter({ app, routeStatus });
registerServiceWorker();
