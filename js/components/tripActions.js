import { openModal, closeModal } from "./modal.js";
import { showToast } from "./toast.js";
import { getTripById, updateTrip, toggleRecordPinned, updateRecordPayment } from "../storage.js";
import { DASHBOARD_BLOCKS, DEFAULT_DASHBOARD } from "../selectors.js";
import { escapeHtml, formatDate } from "../utils.js";
import { quickAddOptions } from "../entryContext.js";
import { startArchiveSearch } from "../views/archiveView.js";
export function initTripActions() {
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, tripId } = button.dataset;
    if (action === "open-quick-add") {
      const date = formatDate(button.dataset.date) ? button.dataset.date : "";
      const context = location.hash.includes("/budget") ? "budget" : location.hash.endsWith("/timeline") ? "timeline" : document.querySelector('.archive-filters [aria-pressed="true"]')?.dataset.category || location.hash.split("/").at(-1);
      openModal({ title: date ? `Aggiungi · ${formatDate(date)}` : "Cosa vuoi salvare?", content: `<div class="quick-add-menu">${quickAddOptions(context).map(([type, title, hint]) => `<button class="quick-add-option" type="button" data-action="open-${type}-form" data-trip-id="${escapeHtml(tripId)}" data-date="${date}"><strong>${title}</strong><span>${hint}</span><span aria-hidden="true">+</span></button>`).join("")}</div>` });
    }
    if (action === "toggle-pin") {
      const record = toggleRecordPinned(button.dataset.source, button.dataset.recordId);
      if (!record) return;
      button.setAttribute("aria-pressed", String(record.pinned));
      button.textContent = record.pinned ? "★" : "☆";
      button.setAttribute("aria-label", record.pinned ? "Rimuovi da evidenza" : "In evidenza");
      showToast(record.pinned ? "Aggiunto alla dashboard." : "Rimosso da evidenza.");
      if (!button.closest("#modal-root")) window.dispatchEvent(new CustomEvent("ithaca:refresh"));
    }
    if (action === "customize-dashboard") {
      const trip = getTripById(tripId);
      if (!trip) return;
      const prefs = { ...DEFAULT_DASHBOARD, ...trip.dashboardPreferences };
      openModal({ title: "La tua dashboard", confirmOnDirty: true, content: `<form id="dashboard-preferences-form" class="trip-form"><input type="hidden" name="tripId" value="${escapeHtml(trip.id)}"><p>Mostra le informazioni che vuoi avere davanti. I blocchi vuoti rimangono nascosti.</p>${Object.entries(DASHBOARD_BLOCKS).map(([key, label]) => `<label class="preference-row"><input type="checkbox" name="${key}" ${prefs[key] ? "checked" : ""}><span>${label}</span></label>`).join("")}<div class="form-actions"><button class="button button--primary" type="submit">Salva preferenze</button></div></form>` });
    }
    if (action === "mark-record-paid") {
      const previous = updateRecordPayment(button.dataset.source, button.dataset.recordId, "paid");
      if (!previous) return;
      window.dispatchEvent(new CustomEvent("ithaca:refresh"));
      document.querySelector('.budget-page [data-filter-value="due"]')?.focus({ preventScroll: true });
      showToast("Pagamento registrato.", 7000, { label: "Annulla", run: () => {
        updateRecordPayment(previous.source, previous.id, previous.status, previous.paidAmount);
        window.dispatchEvent(new CustomEvent("ithaca:refresh"));
        showToast("Pagamento ripristinato.");
      }});
    }
    if (action === "open-trip-search") startArchiveSearch(tripId);
  });
  document.addEventListener("submit", event => {
    if (event.target.id !== "dashboard-preferences-form") return;
    event.preventDefault();
    const form = new FormData(event.target);
    const trip = getTripById(form.get("tripId"));
    updateTrip(trip.id, { dashboardPreferences: { ...trip.dashboardPreferences, ...Object.fromEntries(Object.keys(DASHBOARD_BLOCKS).map(key => [key, form.has(key)])) } });
    closeModal();
    window.dispatchEvent(new CustomEvent("ithaca:refresh"));
    showToast("Dashboard aggiornata.");
  });
}
