import { getData } from "../storage.js";
import { RECORD_TYPES, selectRecords, searchRecords } from "../selectors.js";
import { escapeHtml, formatDestinationRange, formatCurrency } from "../utils.js";
import { renderRecordRow } from "../components/recordRow.js";

const filters = new Map();
const createActions = { flights: "flight", stays: "stay", activities: "activity", expenses: "expense", notes: "note", checklistItems: "checklist", timelineItems: "timeline" };

function renderResults(trip, records, filter) {
  const selected = filter.category === "all" ? records : records.filter(record => record.source === filter.category);
  const results = searchRecords(selected, filter.query);
  const create = filter.category === "all" ? "open-quick-add" : `open-${createActions[filter.category]}-form`;
  return `${filter.query ? `<p class="search-count" role="status">${results.length} risultati</p>` : ""}
    ${results.length ? `<div class="record-list">${results.map(record => renderRecordRow(record, trip.currency, { deletable: true })).join("")}</div>` : `<div class="empty-state"><h2>${filter.query ? "Nessun risultato" : "Nessuna informazione salvata"}</h2><p>${filter.query ? "Prova un altro nome, luogo o numero di prenotazione." : "Bastano poche parole. Puoi aggiungere i dettagli in seguito."}</p>${filter.query ? "" : `<button class="button button--primary" type="button" data-action="${create}" data-trip-id="${escapeHtml(trip.id)}">${filter.category === "all" ? "+ Aggiungi" : `+ ${RECORD_TYPES[filter.category].label}`}</button>`}</div>`}`;
}

function legacyDetails(trip) {
  if (!trip.destinations.length && !trip.notes) return "";
  return `<details class="archive-trip-details"><summary>Destinazioni e informazioni del viaggio</summary>
    ${trip.destinations.map(destination => `<article class="destination-archive"><h3>${escapeHtml(destination.name)}</h3>
      <p>${formatDestinationRange(destination.arrivalDate, destination.departureDate)}</p>
      ${destination.hotel ? `<p>Soggiorno: ${escapeHtml(destination.hotel)} · ${formatDestinationRange(destination.hotelCheckIn, destination.hotelCheckOut)}</p>` : ""}
      ${destination.budgetEstimate != null ? `<p>Stima destinazione: ${formatCurrency(destination.budgetEstimate, trip.currency)}</p>` : ""}
      ${destination.notes ? `<p class="preserve-lines">${escapeHtml(destination.notes)}</p>` : ""}</article>`).join("")}
    ${trip.notes ? `<p class="preserve-lines">${escapeHtml(trip.notes)}</p>` : ""}
    <button class="button button--ghost" type="button" data-action="edit-trip" data-trip-id="${escapeHtml(trip.id)}">Modifica viaggio</button>
  </details>`;
}

let ready = false;
function ensureArchiveHandlers() {
  if (ready) return;
  ready = true;
  document.addEventListener("input", event => {
    if (event.target.id !== "archive-search") return;
    const page = event.target.closest("[data-archive-trip-id]");
    const tripId = page.dataset.archiveTripId;
    const data = getData(), trip = data.trips.find(item => item.id === tripId);
    const filter = { ...(filters.get(tripId) || { category: "all" }), query: event.target.value };
    filters.set(tripId, filter);
    page.querySelector("[data-archive-results]").innerHTML = renderResults(trip, selectRecords(data, tripId), filter);
  });
  document.addEventListener("click", event => {
    const button = event.target.closest('[data-action="filter-archive"]');
    if (!button) return;
    filters.set(button.dataset.tripId, { query: document.querySelector("#archive-search")?.value || "", category: button.dataset.category });
    const archiveHash = `#/trip/${encodeURIComponent(button.dataset.tripId)}/archive`;
    if (location.hash !== archiveHash) location.hash = archiveHash;
    window.dispatchEvent(new CustomEvent("ithaca:refresh"));
  });
}

export function renderArchiveView({ params, category }) {
  ensureArchiveHandlers();
  const data = getData(), trip = data.trips.find(item => item.id === params.tripId);
  if (!trip) return '<section class="empty-state"><h1>Viaggio non trovato</h1><a href="#/home">Torna ai viaggi</a></section>';
  const filter = filters.get(trip.id) || { category: category || "all", query: "" };
  if (category) filter.category = category;
  filters.set(trip.id, filter);
  const records = selectRecords(data, trip.id);
  return `<section class="page archive-page" data-archive-trip-id="${escapeHtml(trip.id)}" aria-labelledby="archive-title">
    <header class="page__header"><p class="page__eyebrow">${escapeHtml(trip.name)}</p><h1 class="page__title" id="archive-title">Archivio</h1><p class="page__summary">Tutto quello che hai salvato per questo viaggio.</p></header>
    <label class="trip-search" for="archive-search"><span>Cerca nel viaggio</span><input id="archive-search" type="search" placeholder="Nome, luogo, prenotazione…" value="${escapeHtml(filter.query)}" autocomplete="off"></label>
    <div class="archive-filters" aria-label="Categorie archivio">${[["all", "Tutto"], ...Object.entries(RECORD_TYPES).map(([key, type]) => [key, type.plural])].map(([key, label]) => `<button class="segmented-control__button" type="button" data-action="filter-archive" data-trip-id="${escapeHtml(trip.id)}" data-category="${key}" aria-pressed="${filter.category === key}">${label} <span>${key === "all" ? records.length : records.filter(record => record.source === key).length}</span></button>`).join("")}</div>
    ${filter.category === "checklistItems" ? `<a class="action-link" href="#/trip/${encodeURIComponent(trip.id)}/checklist">Apri checklist e modelli →</a>` : ""}
    <div data-archive-results>${renderResults(trip, records, filter)}</div>
    ${legacyDetails(trip)}
  </section>`;
}
