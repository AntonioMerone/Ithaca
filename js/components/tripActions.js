import { openModal, closeModal } from "./modal.js";
import { showToast } from "./toast.js";
import { getData, getTripById, updateTrip, toggleRecordPinned } from "../storage.js";
import { DASHBOARD_BLOCKS, DEFAULT_DASHBOARD, selectRecords, searchRecords } from "../selectors.js";
import { escapeHtml } from "../utils.js";
import { renderRecordRow } from "./recordRow.js";

const ADD_OPTIONS = [["flight", "Volo", "Tratta, orari, prenotazione"], ["stay", "Soggiorno", "Hotel, appartamento, ospitalità"], ["activity", "Attività", "Visita, ristorante, trasporto"], ["expense", "Spesa", "Un costo indipendente"], ["note", "Nota", "Un appunto da ritrovare"], ["checklist", "Checklist", "Una cosa da fare"], ["timeline", "Altro evento", "Un momento da ricordare"]];
let searchContext = null;

export function initTripActions() {
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, tripId } = button.dataset;
    if (action === "open-quick-add") {
      openModal({ title: "Cosa vuoi salvare?", content: `<div class="quick-add-menu">${ADD_OPTIONS.map(([type, title, hint]) => `<button class="quick-add-option" type="button" data-action="open-${type}-form" data-trip-id="${escapeHtml(tripId)}"><strong>${title}</strong><span>${hint}</span><span aria-hidden="true">+</span></button>`).join("")}</div>` });
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
    if (action === "open-trip-search") {
      const data = getData(), trip = data.trips.find(item => item.id === tripId);
      if (!trip) return;
      searchContext = { trip, records: selectRecords(data, tripId) };
      openModal({ title: "Cerca nel viaggio", content: '<label class="trip-search" for="global-trip-search"><span>Nome, luogo o prenotazione</span><input id="global-trip-search" type="search" autocomplete="off" placeholder="Gracery, AZ123, Booking…"></label><div id="global-search-results"><p class="quiet-message">Cerca tra voli, soggiorni, attività, spese, note e checklist.</p></div>' });
      document.querySelector("#global-trip-search").focus();
    }
  });
  document.addEventListener("input", event => {
    if (event.target.id !== "global-trip-search" || !searchContext) return;
    const query = event.target.value.trim();
    const results = query ? searchRecords(searchContext.records, query) : [];
    document.querySelector("#global-search-results").innerHTML = `<p class="search-count" role="status">${query ? `${results.length} risultati` : "Scrivi per cercare"}</p>${results.map(record => renderRecordRow(record, searchContext.trip.currency, { showPin: false })).join("")}`;
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
