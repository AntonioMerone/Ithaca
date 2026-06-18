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

function getNextAction({ trip, destinations, expenses, timelineItems, checklistItems, notes, basePath }) {
  if (destinations.length === 0) {
    return {
      title: "Aggiungi le destinazioni principali",
      description: "Definisci le tappe del viaggio per dare contesto al dossier.",
      cta: "Modifica viaggio",
      action: "edit-dashboard-trip",
      tripId: trip.id
    };
  }

  if (destinations.some((destination) => !destination.arrivalDate || !destination.departureDate)) {
    return {
      title: "Completa le date delle destinazioni",
      description: "Le date per destinazione rendono timeline e riepilogo piu chiari.",
      cta: "Modifica viaggio",
      action: "edit-dashboard-trip",
      tripId: trip.id
    };
  }

  if (expenses.length === 0) {
    return {
      title: "Aggiungi le prime spese",
      description: "Inizia da voli, alloggi o trasporti principali.",
      cta: "Apri budget",
      href: `${basePath}/budget`
    };
  }

  if (timelineItems.length === 0) {
    return {
      title: "Aggiungi la prima tappa",
      description: "Trasforma le date del viaggio in un piano giorno per giorno.",
      cta: "Apri timeline",
      href: `${basePath}/timeline`
    };
  }

  if (checklistItems.length === 0) {
    return {
      title: "Crea la checklist pre-partenza",
      description: "Prepara controlli, documenti e task prima di partire.",
      cta: "Apri checklist",
      href: `${basePath}/checklist`
    };
  }

  if (notes.length === 0) {
    return {
      title: "Scrivi la prima nota utile",
      description: "Salva appunti, indirizzi o dettagli da ritrovare in viaggio.",
      cta: "Apri note",
      href: `${basePath}/notes`
    };
  }

  return {
    title: "Dossier in preparazione",
    description: "Hai gia iniziato a costruire budget, timeline, checklist e note.",
    cta: "Rivedi timeline",
    href: `${basePath}/timeline`
  };
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
      <div class="destination-card__body">
        ${range ? `<p class="destination-card__meta">${escapeHtml(range)}</p>` : ""}
        ${nights ? `<p class="destination-card__meta">${nights} ${nights === 1 ? "notte" : "notti"}</p>` : ""}
        ${destination.hotel ? `<p class="destination-card__hotel">${escapeHtml(destination.hotel)}</p>` : ""}
      </div>
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

function renderNextAction(nextAction) {
  if (!nextAction) {
    return "";
  }

  return `
    <section class="panel panel--wide action-section action-section--priority" aria-labelledby="next-actions-title">
      <p class="page__eyebrow">Cosa fare adesso</p>
      <h2 class="panel__title" id="next-actions-title">Prossima azione</h2>
      <div class="next-action-card">
        <span class="next-action-card__label">Priorita del dossier</span>
        <p>${escapeHtml(nextAction.title)}</p>
        <span class="next-action-card__description">${escapeHtml(nextAction.description)}</span>
        ${nextAction.href ? `<a class="button button--primary button--small" href="${nextAction.href}">${escapeHtml(nextAction.cta)} &rarr;</a>` : ""}
        ${nextAction.action ? `<button class="button button--primary button--small" type="button" data-action="${escapeHtml(nextAction.action)}" data-trip-id="${escapeHtml(nextAction.tripId)}">${escapeHtml(nextAction.cta)}</button>` : ""}
      </div>
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
      <p class="dashboard-widget__label">${title}</p>
      <h2 class="dashboard-widget__title">${body}</h2>
      <p class="dashboard-widget__body">Sezione pronta per il dossier.</p>
      <a class="button button--ghost button--small" href="${href}">${cta} &rarr;</a>
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
      <p class="dashboard-widget__label">Timeline</p>
      <h2 class="dashboard-widget__title">${countText}</h2>
      ${nextItem ? `
        <div class="next-activity">
          <span>Prossima</span>
          <strong>${escapeHtml(nextItem.title)}</strong>
          <p>${formatDate(nextItem.date)}${nextItem.time ? `, ${escapeHtml(nextItem.time)}` : ""}${nextItem.location ? ` · ${escapeHtml(nextItem.location)}` : ""}</p>
        </div>
      ` : `<p class="dashboard-widget__body">Nessuna attivita futura</p>`}
      <a class="button button--ghost button--small" href="${basePath}/timeline">Vai alla timeline &rarr;</a>
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
      <p class="dashboard-widget__label">Checklist</p>
      <h2 class="dashboard-widget__title">${summary.completionRate}% pronto</h2>
      <p class="dashboard-widget__body">${summary.completed}/${summary.total} completati</p>
      <div class="budget-progress checklist-widget-progress" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.completionRate}">
        <span style="width: ${summary.completionRate}%"></span>
      </div>
      ${overdueCount > 0 ? `<p class="budget-warning">${overdueCount} task scaduti</p>` : ""}
      ${openItems.length > 0 ? `
        <ul class="mini-list" aria-label="Primi task aperti">
          ${openItems.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("")}
        </ul>
      ` : `<p class="dashboard-widget__body">Tutti i task sono completati.</p>`}
      <a class="button button--ghost button--small" href="${basePath}/checklist">Vai alla checklist &rarr;</a>
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
      <p class="dashboard-widget__label">Note</p>
      <h2 class="dashboard-widget__title">${sortedNotes.length} ${sortedNotes.length === 1 ? "nota" : "note"}</h2>
      <p class="dashboard-widget__body">Memoria viva del viaggio</p>
      <div class="next-activity">
        <span>${destinations.length} ${destinations.length === 1 ? "destinazione" : "destinazioni"}</span>
        <strong>Ultima: ${escapeHtml(latestNote.title)}</strong>
        <p>${escapeHtml(getNotePreview(latestNote.content, 90))}</p>
      </div>
      <a class="button button--ghost button--small" href="${basePath}/notes">Vai alle note &rarr;</a>
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
  const nextAction = getNextAction({
    trip,
    destinations: normalizedDestinations,
    expenses,
    timelineItems,
    checklistItems,
    notes,
    basePath
  });

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
          <p class="dashboard-hero__label">Centro dossier</p>
          <p class="dashboard-hero__count">${escapeHtml(countdown)}</p>
          <div class="dashboard-hero__meta">
            <span>${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</span>
            <span>${duration} giorni</span>
            <span>${destinations}</span>
          </div>
          <p class="dashboard-hero__message">${getHeroMessage(status)}</p>
        </div>
        <div class="dashboard-hero__budget">
          <span>Budget totale</span>
          <strong>${formatCurrency(budget.budgetTotal, trip.currency)}</strong>
          <button class="button button--ghost button--small" type="button" data-action="edit-dashboard-trip" data-trip-id="${escapeHtml(trip.id)}">Modifica viaggio</button>
        </div>
      </article>

      ${renderDestinationsSection(normalizedDestinations, trip.currency)}

      <section class="dashboard-grid" aria-label="Widget principali">
        <article class="dashboard-widget dashboard-widget--accent">
          <p class="dashboard-widget__label">Partenza</p>
          <p class="dashboard-widget__number">${escapeHtml(getCountdownNumber(status, trip.startDate))}</p>
          <p class="dashboard-widget__body">${escapeHtml(getCountdownCaption(status))}</p>
          <span class="status-pill">${escapeHtml(statusLabel)}</span>
        </article>

        <article class="dashboard-widget">
          <p class="dashboard-widget__label">Budget</p>
          <h2 class="dashboard-widget__title">${formatCurrency(budget.budgetTotal, trip.currency)}</h2>
          <p class="dashboard-widget__body">${formatCurrency(budget.paidTotal, trip.currency)} pagati &middot; ${formatCurrency(budget.remaining, trip.currency)} residui</p>
          <div class="metric-list">
            ${renderMetric("Pagato", formatCurrency(budget.paidTotal, trip.currency))}
            ${renderMetric("Da pagare", formatCurrency(budget.unpaidTotal, trip.currency))}
            ${renderMetric("Rimanente", formatCurrency(budget.remaining, trip.currency))}
          </div>
          ${budget.isOverBudget ? `<p class="budget-warning">Budget superato di ${formatCurrency(Math.abs(budget.difference), trip.currency)}</p>` : ""}
          <a class="button button--ghost button--small" href="${basePath}/budget">Apri budget &rarr;</a>
        </article>

        ${renderTimelineWidget(timelineItems, basePath)}

        ${renderChecklistWidget(checklistItems, basePath)}

        ${renderNotesWidget(notes, basePath)}
      </section>

      ${renderNextAction(nextAction)}
    </section>
  `;
}
