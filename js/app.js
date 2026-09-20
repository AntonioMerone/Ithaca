import { initRouter } from "./router.js";
import { showToast } from "./components/toast.js";
import { initializeStorage } from "./storage.js";
import { ensureHomeHandlers } from "./views/homeView.js";
import { ensureDashboardHandlers } from "./views/dossierForms.js";
import { ensureBudgetHandlers } from "./views/budgetView.js";
import { ensureTimelineHandlers } from "./views/timelineView.js";
import { ensureChecklistHandlers } from "./views/checklistView.js";
import { ensureNotesHandlers } from "./views/notesView.js";
import { initTripActions } from "./components/tripActions.js";

const app = document.querySelector("#app");
const routeStatus = document.querySelector("#route-status");

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      showToast("Cache offline non disponibile in questa sessione.");
    });
  });
}

window.addEventListener("ithaca:storage-error", () => showToast("Salvataggio non riuscito. I dati inseriti sono ancora nel modulo: libera spazio e riprova."));
try {
  initializeStorage();
  ensureHomeHandlers();
  ensureDashboardHandlers();
  ensureBudgetHandlers();
  ensureTimelineHandlers();
  ensureChecklistHandlers();
  ensureNotesHandlers();
  initTripActions();
  initRouter({ app, routeStatus });
} catch (error) {
  console.error("Ithaca: apertura non riuscita", error);
  app.innerHTML = '<section class="empty-state"><h1>Archivio locale non disponibile</h1><p>Consenti il salvataggio nel browser o libera spazio, poi ricarica. I dati esistenti non sono stati cancellati.</p><button class="button button--primary" type="button" id="retry-app">Riprova</button></section>';
  document.querySelector("#retry-app").addEventListener("click", () => location.reload());
}
window.addEventListener("storage", event => {
  if (event.key === "ithaca:data" && !document.querySelector("#modal-root form")) window.dispatchEvent(new CustomEvent("ithaca:refresh"));
});
registerServiceWorker();
