import { getChecklistItemsByTripId, getExpensesByTripId, getNotesByTripId, getTimelineItemsByTripId, getTripById } from "../storage.js";
import { openTripForm } from "./homeView.js";
import {
  calculateBudgetSummary,
  calculateChecklistSummary,
  calculateCountdown,
  calculateTripDuration,
  calcNights,
  determineTripStatus,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDestinationRange,
  getOpenChecklistItems,
  getNoteDestinations,
  getNotePreview,
  getDaysUntilTrip,
  getNextTimelineItem,
  isChecklistItemOverdue,
  sortNotes,
  normalizeDestinations,
  sortTimelineItems
} from "../utils.js";

let dashboardHandlersReady = false;

function handleDashboardClick(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget || actionTarget.dataset.action !== "edit-dashboard-trip") {
    return;
  }

  const trip = getTripById(actionTarget.dataset.tripId);

  if (trip) {
    openTripForm(trip);
  }
}

function ensureDashboardHandlers() {
  if (dashboardHandlersReady) {
    return;
  }

  document.addEventListener("click", handleDashboardClick);
  dashboardHandlersReady = true;
}

function formatDestinations(destinations = []) {
  const normalized = normalizeDestinations(destinations);

  if (normalized.length === 0) {
    return "Destinazioni da definire";
  }

  return normalized.map((destination) => escapeHtml(destination.name)).join(" &rarr; ");
}

function getStatusLabel(status) {
  const labels = {
    future: "Futuro",
    starts_today: "Parte oggi",
    ongoing: "In corso",
    past: "Concluso"
  };

  return labels[status] || "Futuro";
}

function getHeroMessage(status) {
  const messages = {
    future: "Hai ancora tempo per completare preparativi, budget e checklist.",
    starts_today: "Controlla documenti, check-in e prime tappe.",
    ongoing: "Tieni sott'occhio tappe, spese e note del giorno.",
    past: "Rivedi il riepilogo e conserva il dossier del viaggio."
  };

  return messages[status] || messages.future;
}

function getCountdownNumber(status, startDate) {
  const days = getDaysUntilTrip(startDate);

  if (status === "future" && days !== null) {
    return String(days);
  }

  if (status === "starts_today") {
    return "0";
  }

  if (status === "ongoing") {
    return "live";
  }

  return "done";
}

function getCountdownCaption(status) {
  const captions = {
    future: "giorni alla partenza",
    starts_today: "partenza oggi",
    ongoing: "viaggio in corso",
    past: "viaggio concluso"
  };

  return captions[status] || captions.future;
}

function getDestinationStatus(destination) {
  const status = determineTripStatus(destination.arrivalDate, destination.departureDate);

  if (!destination.arrivalDate && !destination.departureDate) {
    return "";
  }

  if (status === "ongoing" || status === "starts_today") {
    return "In corso";
  }

  if (status === "past") {
    return "Conclusa";
  }

  return "Futura";
}

function getDestinationStatusClass(label) {
  const classes = {
    "In corso": "badge--success",
    Conclusa: "",
    Futura: "badge--warning"
  };

  return classes[label] || "";
}

function getNextActions(status, destinations = []) {
  const normalizedDestinations = normalizeDestinations(destinations);
  const destinationActions = [];

  if (normalizedDestinations.length === 0) {
    destinationActions.push("Aggiungi le destinazioni principali del viaggio.");
  } else {
    if (normalizedDestinations.some((destination) => !destination.arrivalDate || !destination.departureDate)) {
      destinationActions.push("Completa le date delle destinazioni.");
    }

    if (normalizedDestinations.some((destination) => destination.budgetEstimate === null)) {
      destinationActions.push("Aggiungi un budget indicativo per le destinazioni principali.");
    }
  }

  if (status === "ongoing") {
    return [
      ...destinationActions,
      "Controlla le attivita di oggi.",
      "Aggiorna le spese.",
      "Consulta le note di viaggio."
    ];
  }

  if (status === "past") {
    return [
      ...destinationActions,
      "Rivedi il budget finale.",
      "Conserva le note del viaggio.",
      "Duplica il viaggio come template futuro."
    ];
  }

  if (status === "starts_today") {
    return [
      ...destinationActions,
      "Controlla documenti e check-in.",
      "Apri la timeline per le prime tappe.",
      "Tieni le note utili a portata di mano."
    ];
  }

  return [
    ...destinationActions,
    "Aggiungi le prime tappe alla timeline.",
    "Inserisci le spese principali nel budget.",
    "Crea la checklist pre-partenza.",
    "Salva note utili sulle destinazioni."
  ];
}

function renderDestinationCard(destination, index, currency) {
  const range = formatDestinationRange(destination.arrivalDate, destination.departureDate);
  const nights = calcNights(destination.arrivalDate, destination.departureDate);
  const statusLabel = getDestinationStatus(destination);
  const statusClass = getDestinationStatusClass(statusLabel);

  return `
    <article class="destination-card">
      <div class="destination-card__header">
        <span class="destination-card__index">${index + 1}</span>
        ${statusLabel ? `<span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span>` : ""}
      </div>
      <h3>${escapeHtml(destination.name)}</h3>
      ${range ? `<p class="destination-card__meta">${escapeHtml(range)}</p>` : ""}
      ${nights ? `<p class="destination-card__meta">${nights} ${nights === 1 ? "notte" : "notti"}</p>` : ""}
      ${destination.hotel ? `<p class="destination-card__hotel">${escapeHtml(destination.hotel)}</p>` : ""}
      ${destination.budgetEstimate !== null ? `<p class="destination-card__budget">${formatCurrency(destination.budgetEstimate, currency)}</p>` : ""}
    </article>
  `;
}

function renderDestinationsSection(destinations = [], currency = "EUR") {
  const normalizedDestinations = normalizeDestinations(destinations);

  if (normalizedDestinations.length === 0) {
    return `
      <section class="panel panel--wide destinations-section" aria-labelledby="destinations-title">
        <div class="destinations-section__header">
          <h2 class="panel__title" id="destinations-title">Destinazioni</h2>
          <p class="panel__body">Aggiungi le destinazioni principali dal form viaggio.</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="destinations-section" aria-labelledby="destinations-title">
      <div class="destinations-section__header">
        <h2 class="panel__title" id="destinations-title">Destinazioni</h2>
        <p class="panel__body">${normalizedDestinations.length} ${normalizedDestinations.length === 1 ? "fase" : "fasi"} del viaggio</p>
      </div>
      <div class="destinations-strip" aria-label="Destinazioni del viaggio">
        ${normalizedDestinations.map((destination, index) => renderDestinationCard(destination, index, currency)).join("")}
      </div>
    </section>
  `;
}

function getActionHref(action, basePath) {
  const cleanAction = String(action || "").toLowerCase();

  if (cleanAction.includes("budget") || cleanAction.includes("spese")) {
    return `${basePath}/budget`;
  }

  if (cleanAction.includes("timeline") || cleanAction.includes("tappe")) {
    return `${basePath}/timeline`;
  }

  if (cleanAction.includes("checklist")) {
    return `${basePath}/checklist`;
  }

  if (cleanAction.includes("note") || cleanAction.includes("nota")) {
    return `${basePath}/notes`;
  }

  return "";
}

function renderNextActions(actions, basePath) {
  const [primaryAction, ...secondaryActions] = actions;
  const primaryHref = getActionHref(primaryAction, basePath);

  if (!primaryAction) {
    return "";
  }

  return `
    <section class="panel panel--wide action-section action-section--priority" aria-labelledby="next-actions-title">
      <p class="page__eyebrow">Cosa fare adesso</p>
      <h2 class="panel__title" id="next-actions-title">Prossima azione</h2>
      <div class="next-action-card">
        <p>${escapeHtml(primaryAction)}</p>
        ${primaryHref ? `<a class="button button--primary button--small" href="${primaryHref}">Apri sezione</a>` : ""}
      </div>
      ${secondaryActions.length > 0 ? `
        <ul class="action-list action-list--secondary" aria-label="Altri passi consigliati">
          ${secondaryActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}
        </ul>
      ` : ""}
    </section>
  `;
}

function renderMissingTrip() {
  return `
    <section class="page" aria-labelledby="trip-missing-title">
      <article class="panel panel--wide error-card">
        <p class="page__eyebrow">Viaggio non trovato</p>
        <h1 class="page__title" id="trip-missing-title">Questo dossier non esiste.</h1>
        <p class="page__summary">Il viaggio richiesto non e presente nei dati locali di Ithaca.</p>
        <a class="action-link" href="#/home">Torna alla Home</a>
      </article>
    </section>
  `;
}

function renderMetric(label, value) {
  return `
    <div class="metric-row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderTripNotes(notes) {
  const cleanNotes = String(notes || "").trim();

  if (!cleanNotes) {
    return "";
  }

  return `<p class="dashboard-note">${escapeHtml(cleanNotes)}</p>`;
}

function renderSectionWidget({ title, body, href, cta }) {
  return `
    <article class="dashboard-widget">
      <h2 class="dashboard-widget__title">${title}</h2>
      <p class="dashboard-widget__body">${body}</p>
      <a class="button button--ghost button--small" href="${href}">${cta}</a>
    </article>
  `;
}

function renderTimelineWidget(items, basePath) {
  const sortedItems = sortTimelineItems(items);
  const nextItem = getNextTimelineItem(sortedItems);
  const countText = sortedItems.length === 1 ? "1 tappa inserita" : `${sortedItems.length} tappe inserite`;

  if (sortedItems.length === 0) {
    return renderSectionWidget({
      title: "Timeline",
      body: "Nessuna tappa inserita",
      href: `${basePath}/timeline`,
      cta: "Vai alla timeline"
    });
  }

  return `
    <article class="dashboard-widget">
      <h2 class="dashboard-widget__title">Timeline</h2>
      <p class="dashboard-widget__body">${countText}</p>
      ${nextItem ? `
        <div class="next-activity">
          <span>Prossima</span>
          <strong>${escapeHtml(nextItem.title)}</strong>
          <p>${formatDate(nextItem.date)}${nextItem.time ? `, ${escapeHtml(nextItem.time)}` : ""}${nextItem.location ? ` · ${escapeHtml(nextItem.location)}` : ""}</p>
        </div>
      ` : `<p class="dashboard-widget__body">Nessuna attivita futura</p>`}
      <a class="button button--ghost button--small" href="${basePath}/timeline">Vai alla timeline</a>
    </article>
  `;
}

function renderChecklistWidget(items, basePath) {
  const summary = calculateChecklistSummary(items);
  const openItems = getOpenChecklistItems(items, 3);
  const overdueCount = items.filter(isChecklistItemOverdue).length;

  if (items.length === 0) {
    return renderSectionWidget({
      title: "Checklist",
      body: "Checklist non ancora configurata",
      href: `${basePath}/checklist`,
      cta: "Vai alla checklist"
    });
  }

  return `
    <article class="dashboard-widget">
      <h2 class="dashboard-widget__title">Checklist</h2>
      <p class="dashboard-widget__body">${summary.completed}/${summary.total} completati &middot; ${summary.completionRate}%</p>
      <div class="budget-progress checklist-widget-progress" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.completionRate}">
        <span style="width: ${summary.completionRate}%"></span>
      </div>
      ${overdueCount > 0 ? `<p class="budget-warning">${overdueCount} task scaduti</p>` : ""}
      ${openItems.length > 0 ? `
        <ul class="mini-list" aria-label="Primi task aperti">
          ${openItems.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("")}
        </ul>
      ` : `<p class="dashboard-widget__body">Tutti i task sono completati.</p>`}
      <a class="button button--ghost button--small" href="${basePath}/checklist">Vai alla checklist</a>
    </article>
  `;
}

function renderNotesWidget(notes, basePath) {
  const sortedNotes = sortNotes(notes);
  const latestNote = sortedNotes[0] || null;
  const destinations = getNoteDestinations(notes);

  if (sortedNotes.length === 0) {
    return renderSectionWidget({
      title: "Note",
      body: "Nessuna nota inserita",
      href: `${basePath}/notes`,
      cta: "Vai alle note"
    });
  }

  return `
    <article class="dashboard-widget">
      <h2 class="dashboard-widget__title">Note</h2>
      <p class="dashboard-widget__body">${sortedNotes.length} ${sortedNotes.length === 1 ? "nota salvata" : "note salvate"}</p>
      <div class="next-activity">
        <span>${destinations.length} ${destinations.length === 1 ? "destinazione" : "destinazioni"}</span>
        <strong>Ultima: ${escapeHtml(latestNote.title)}</strong>
        <p>${escapeHtml(getNotePreview(latestNote.content, 90))}</p>
      </div>
      <a class="button button--ghost button--small" href="${basePath}/notes">Vai alle note</a>
    </article>
  `;
}

export function renderTripDashboardView({ params }) {
  ensureDashboardHandlers();
  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const encodedTripId = encodeURIComponent(trip.id);
  const basePath = `#/trip/${encodedTripId}`;
  const normalizedDestinations = normalizeDestinations(trip.destinations, trip);
  const destinations = formatDestinations(normalizedDestinations);
  const duration = calculateTripDuration(trip.startDate, trip.endDate);
  const countdown = calculateCountdown(trip.startDate, trip.endDate);
  const status = determineTripStatus(trip.startDate, trip.endDate);
  const statusLabel = getStatusLabel(status);
  const expenses = getExpensesByTripId(trip.id);
  const budget = calculateBudgetSummary(trip, expenses);
  const timelineItems = getTimelineItemsByTripId(trip.id);
  const checklistItems = getChecklistItemsByTripId(trip.id);
  const notes = getNotesByTripId(trip.id);
  const openChecklistActions = getOpenChecklistItems(checklistItems, 3);
  const destinationAwareActions = getNextActions(status, normalizedDestinations);
  const nextActions = openChecklistActions.length > 0
    ? [...destinationAwareActions.slice(0, 3), ...openChecklistActions.map((item) => item.title)]
    : destinationAwareActions;

  return `
    <section class="page dashboard-page" aria-labelledby="trip-title">
      <header class="page__header dashboard-header">
        <p class="page__eyebrow">Dashboard viaggio</p>
        <h1 class="page__title" id="trip-title">${escapeHtml(trip.name)}</h1>
        <p class="page__summary">${destinations}</p>
        <p class="dashboard-header__meta">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
        <p class="dashboard-header__meta">${duration} giorni &middot; ${escapeHtml(countdown)}</p>
        ${renderTripNotes(trip.notes)}
      </header>

      <article class="dashboard-hero">
        <div>
          <p class="dashboard-hero__label">Stato viaggio</p>
          <p class="dashboard-hero__count">${escapeHtml(countdown)}</p>
          <p class="dashboard-hero__message">${getHeroMessage(status)}</p>
        </div>
        <div class="dashboard-hero__budget">
          <span>Budget totale</span>
          <strong>${formatCurrency(budget.budgetTotal, trip.currency)}</strong>
        </div>
      </article>

      ${renderDestinationsSection(normalizedDestinations, trip.currency)}

      <section class="dashboard-grid" aria-label="Widget principali">
        <article class="dashboard-widget dashboard-widget--accent">
          <h2 class="dashboard-widget__title">Countdown</h2>
          <p class="dashboard-widget__number">${escapeHtml(getCountdownNumber(status, trip.startDate))}</p>
          <p class="dashboard-widget__body">${escapeHtml(getCountdownCaption(status))}</p>
          <span class="status-pill">${escapeHtml(statusLabel)}</span>
        </article>

        <article class="dashboard-widget">
          <h2 class="dashboard-widget__title">Budget</h2>
          <div class="metric-list">
            ${renderMetric("Budget totale", formatCurrency(budget.budgetTotal, trip.currency))}
            ${renderMetric("Pagato", formatCurrency(budget.paidTotal, trip.currency))}
            ${renderMetric("Da pagare", formatCurrency(budget.unpaidTotal, trip.currency))}
            ${renderMetric("Rimanente", formatCurrency(budget.remaining, trip.currency))}
          </div>
          ${budget.isOverBudget ? `<p class="budget-warning">Budget superato di ${formatCurrency(Math.abs(budget.difference), trip.currency)}</p>` : ""}
          <a class="button button--ghost button--small" href="${basePath}/budget">Apri budget</a>
        </article>

        ${renderTimelineWidget(timelineItems, basePath)}

        ${renderChecklistWidget(checklistItems, basePath)}

        ${renderNotesWidget(notes, basePath)}
      </section>

      ${renderNextActions(nextActions, basePath)}

      <section class="panel panel--wide action-section" aria-labelledby="quick-actions-title">
        <h2 class="panel__title" id="quick-actions-title">Azioni rapide</h2>
        <div class="quick-actions">
          <a class="button button--ghost" href="${basePath}/timeline">Apri timeline</a>
          <a class="button button--ghost" href="${basePath}/budget">Apri budget</a>
          <a class="button button--ghost" href="${basePath}/checklist">Apri checklist</a>
          <a class="button button--ghost" href="${basePath}/notes">Apri note</a>
          <button class="button button--primary" type="button" data-action="edit-dashboard-trip" data-trip-id="${escapeHtml(trip.id)}">Modifica viaggio</button>
        </div>
      </section>
    </section>
  `;
}
