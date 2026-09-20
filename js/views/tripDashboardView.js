import { getData } from "../storage.js";
import { selectDashboard } from "../selectors.js";
import { escapeHtml, formatCurrency, formatDate, formatDestinationRange, calculateCountdown, calculateTripDuration, isChecklistItemOverdue } from "../utils.js";
import { renderRecordRow } from "../components/recordRow.js";

function block(title, content, action = "", className = "") {
  return `<section class="dashboard-block ${className}"><header><h2>${title}</h2>${action}</header>${content}</section>`;
}

export function renderTripDashboardView({ params }) {
  const data = getData(), trip = data.trips.find(item => item.id === params.tripId);
  if (!trip) return '<section class="empty-state"><h1>Viaggio non trovato</h1><a href="#/home">Torna ai viaggi</a></section>';
  const model = selectDashboard(data, trip);
  const { preferences, budget, checklist, status } = model;
  const base = `#/trip/${encodeURIComponent(trip.id)}`;
  const money = value => formatCurrency(value, trip.currency);
  const rows = records => records.map(record => renderRecordRow(record, trip.currency)).join("");
  const inProgress = status === "ongoing" || status === "starts_today";
  const past = status === "past";
  const countdown = status === "undated" ? "Date da definire" : calculateCountdown(trip.startDate, trip.endDate);
  const duration = calculateTripDuration(trip.startDate, trip.endDate);
  const due = model.ledger.filter(record => record.dueAmount > 0);
  const openChecklist = model.records.filter(record => record.source === "checklistItems" && !record.item.completed)
    .sort((a, b) => (a.item.dueDate || "9999").localeCompare(b.item.dueDate || "9999"));
  const notes = model.records.filter(record => record.source === "notes").sort((a, b) => String(b.item.updatedAt || "").localeCompare(String(a.item.updatedAt || "")));
  const blocks = [];
  if (preferences.next && !past) {
    if (model.next) blocks.push(block("Prossimo", rows([model.next]), `<a href="${base}/timeline" class="text-link">Timeline →</a>`, "dashboard-block--next"));
    if (inProgress) {
      const today = model.todayEvents.filter(event => event.id !== model.next?.id);
      if (today.length) blocks.push(block("Oggi", rows(today), "", "dashboard-block--today"));
      else if (!model.todayEvents.length) blocks.push('<p class="quiet-message">Nessuna attività per oggi.</p>');
    }
  }
  if (preferences.stay && inProgress && model.currentStays.length) blocks.push(block("Il tuo soggiorno", rows(model.currentStays)));
  if (preferences.pinned && model.pinned.length) blocks.push(block("In evidenza", rows(model.pinned)));
  if (preferences.due && due.length) blocks.push(block("Da pagare", `<p class="dashboard-total">${money(budget.unpaidTotal)}</p><p class="quiet-message">${due.length} ${due.length === 1 ? "pagamento da completare" : "pagamenti da completare"}</p>`, `<a class="text-link" href="${base}/budget/due">Vedi pagamenti →</a>`));
  if (preferences.checklist && checklist.total && (!past || checklist.open)) blocks.push(block("Checklist", `<div class="dashboard-checklist-summary"><strong>${checklist.completed} / ${checklist.total} completati</strong><progress max="${checklist.total}" value="${checklist.completed}" aria-label="Checklist completata"></progress></div>${openChecklist.slice(0, 3).map(record => `<label class="dashboard-task"><input type="checkbox" data-action="toggle-checklist-item" data-item-id="${escapeHtml(record.sourceId)}"><span>${escapeHtml(record.title)}${record.item.dueDate ? `<small class="${isChecklistItemOverdue(record.item) ? "overdue" : ""}">${isChecklistItemOverdue(record.item) ? "Scaduto · " : ""}${formatDate(record.item.dueDate)}</small>` : ""}</span></label>`).join("")}`, `<a class="text-link" href="${base}/checklist">Apri →</a>`));
  if (preferences.budget && (budget.plannedTotal || budget.budgetTotal)) blocks.push(block(past ? "Riepilogo del viaggio" : "Budget", `<p class="dashboard-total">${money(budget.plannedTotal)}${budget.budgetTotal ? `<small> / ${money(budget.budgetTotal)}</small>` : ""}</p><p class="quiet-message">${past && duration ? `${duration} giorni · ` : ""}Pagato ${money(budget.paidTotal)}${budget.isOverBudget ? ` · Oltre il budget di ${money(-budget.remaining)}` : ""}</p>${budget.budgetTotal ? `<progress class="${budget.isOverBudget ? "is-over-budget" : ""}" max="${budget.budgetTotal}" value="${Math.min(budget.plannedTotal, budget.budgetTotal)}" aria-label="Budget utilizzato"></progress>` : ""}`, `<a class="text-link" href="${base}/budget">Dettaglio →</a>`));
  if (preferences.notes && (notes.length || trip.notes)) blocks.push(block("Note", `${trip.notes ? `<p class="preserve-lines">${escapeHtml(trip.notes)}</p>` : ""}${rows(notes.slice(0, 3))}`, `<a class="text-link" href="${base}/notes">Tutte →</a>`));
  return `<section class="page trip-overview" data-dashboard-trip-id="${escapeHtml(trip.id)}" aria-labelledby="trip-title">
    <div class="overview-toolbar"><a class="text-link" href="#/home">← Viaggi</a><div><button class="button button--ghost button--small" type="button" data-action="edit-trip" data-trip-id="${escapeHtml(trip.id)}">Modifica</button><button class="button button--ghost button--small" type="button" data-action="customize-dashboard" data-trip-id="${escapeHtml(trip.id)}">Personalizza</button></div></div>
    <header class="trip-heading"><p class="page__eyebrow">${escapeHtml(countdown)}</p><h1 id="trip-title">${escapeHtml(trip.name)}</h1>${trip.destinations.length ? `<p>${trip.destinations.map(destination => escapeHtml(destination.name)).join(" → ")}</p>` : ""}<p class="trip-heading__dates">${formatDestinationRange(trip.startDate, trip.endDate)}${duration ? ` · ${duration} giorni` : ""}</p></header>
    <button class="search-shortcut" type="button" data-action="open-trip-search" data-trip-id="${escapeHtml(trip.id)}"><span aria-hidden="true">⌕</span> Cerca nel viaggio</button>
    <div class="dashboard-content">${blocks.join("") || `<div class="empty-state"><h2>${model.records.length ? "Il viaggio è nel tuo Archivio" : "Da dove vuoi iniziare?"}</h2><p>${model.records.length ? "Puoi consultare tutto nell’Archivio o scegliere cosa mostrare con Personalizza." : "Salva un volo, un soggiorno o un semplice appunto."}</p><button class="button button--primary" type="button" data-action="open-quick-add" data-trip-id="${escapeHtml(trip.id)}">+ Aggiungi un’informazione</button></div>`}</div>
  </section>`;
}
