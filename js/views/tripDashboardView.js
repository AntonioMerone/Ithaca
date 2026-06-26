import { closeModal, openModal } from "../components/modal.js";
import { renderAppBar } from "../components/appBar.js";
import { showToast } from "../components/toast.js";
import {
  createActivity,
  createFlight,
  createStay,
  deleteActivity,
  deleteFlight,
  deleteStay,
  getActivitiesByTripId,
  getActivityById,
  getChecklistItemsByTripId,
  getExpensesByTripId,
  getFlightById,
  getFlightsByTripId,
  getStayById,
  getStaysByTripId,
  getTimelineItemsByTripId,
  getTripById,
  updateActivity,
  updateFlight,
  updateStay
} from "../storage.js";
import { openTripForm } from "./homeView.js";
import {
  ACTIVITY_TYPES,
  DOSSIER_PAYMENT_STATUSES,
  calculateChecklistSummary,
  calculateCountdown,
  calculateDossierBudgetSummary,
  calculateTripDuration,
  calcNights,
  determineTripStatus,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDestinationRange,
  getActivityTypeLabel,
  getDaysUntilTrip,
  getDossierPaymentStatusBadge,
  getDossierPaymentStatusLabel,
  getNextTimelineItem,
  getNoteDestinations,
  getNotePreview,
  getOpenChecklistItems,
  getPaymentBreakdown,
  isChecklistItemOverdue,
  normalizeDestinations,
  sortNotes,
  sortTimelineItems,
  validatePaymentAllocation
} from "../utils.js";

let dashboardHandlersReady = false;
const DASHBOARD_SECTION_PREVIEW_LIMIT = 3;
const ZERO_COST_WARNING_COPY = "Costo 0 € con pagamento segnato: controlla se il dato è corretto.";
const expandedDashboardSections = new Set();

function refreshView() {
  window.dispatchEvent(new CustomEvent("ithaca:refresh"));
}

function getDashboardSectionKey(tripId, section) {
  return `${tripId}:${section}`;
}

function isDashboardSectionExpanded(tripId, section) {
  return expandedDashboardSections.has(getDashboardSectionKey(tripId, section));
}

function toggleDashboardSection(tripId, section) {
  const key = getDashboardSectionKey(tripId, section);

  if (expandedDashboardSections.has(key)) {
    expandedDashboardSections.delete(key);
  } else {
    expandedDashboardSections.add(key);
  }
}

function handleDashboardClick(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const tripId = actionTarget.dataset.tripId || document.querySelector("[data-dashboard-trip-id]")?.dataset.dashboardTripId;

  if (action === "edit-dashboard-trip") {
    const trip = getTripById(tripId);
    if (trip) openTripForm(trip);
  }

  if (action === "toggle-dossier-section" && tripId) {
    toggleDashboardSection(tripId, actionTarget.dataset.section || "");
    refreshView();
  }

  if (action === "open-flight-form" && tripId) {
    const trip = getTripById(tripId);
    if (trip) openFlightForm(trip);
  }

  if (action === "edit-flight") {
    const flight = getFlightById(actionTarget.dataset.flightId);
    const trip = flight ? getTripById(flight.tripId) : null;
    if (flight && trip) openFlightForm(trip, flight);
  }

  if (action === "delete-flight") {
    const flight = getFlightById(actionTarget.dataset.flightId);
    if (flight) openFlightDeleteConfirmation(flight);
  }

  if (action === "confirm-delete-flight") {
    deleteFlight(actionTarget.dataset.flightId);
    closeModal();
    refreshView();
    showToast("Volo eliminato.");
  }

  if (action === "open-stay-form" && tripId) {
    const trip = getTripById(tripId);
    if (trip) openStayForm(trip);
  }

  if (action === "edit-stay") {
    const stay = getStayById(actionTarget.dataset.stayId);
    const trip = stay ? getTripById(stay.tripId) : null;
    if (stay && trip) openStayForm(trip, stay);
  }

  if (action === "delete-stay") {
    const stay = getStayById(actionTarget.dataset.stayId);
    if (stay) openStayDeleteConfirmation(stay);
  }

  if (action === "confirm-delete-stay") {
    deleteStay(actionTarget.dataset.stayId);
    closeModal();
    refreshView();
    showToast("Soggiorno eliminato.");
  }

  if (action === "open-activity-form" && tripId) {
    const trip = getTripById(tripId);
    if (trip) openActivityForm(trip);
  }

  if (action === "edit-activity") {
    const activity = getActivityById(actionTarget.dataset.activityId);
    const trip = activity ? getTripById(activity.tripId) : null;
    if (activity && trip) openActivityForm(trip, activity);
  }

  if (action === "delete-activity") {
    const activity = getActivityById(actionTarget.dataset.activityId);
    if (activity) openActivityDeleteConfirmation(activity);
  }

  if (action === "confirm-delete-activity") {
    deleteActivity(actionTarget.dataset.activityId);
    closeModal();
    refreshView();
    showToast("Attivita eliminata.");
  }
}

function handleDashboardSubmit(event) {
  if (event.target.id === "flight-form") {
    handleFlightFormSubmit(event);
  }

  if (event.target.id === "stay-form") {
    handleStayFormSubmit(event);
  }

  if (event.target.id === "activity-form") {
    handleActivityFormSubmit(event);
  }
}

function handleDashboardFormInput(event) {
  const form = event.target.closest("#flight-form, #stay-form, #activity-form");

  if (event.target.name === "stopoverEnabled" && form) {
    updateStopoverFields(form);
    return;
  }

  if (!["cost", "paymentStatus"].includes(event.target.name)) {
    return;
  }

  if (form) {
    updateZeroCostWarning(form);
    updatePaidAmountField(form);
  }
}

export function ensureDashboardHandlers() {
  if (dashboardHandlersReady) {
    return;
  }

  document.addEventListener("click", handleDashboardClick);
  document.addEventListener("input", handleDashboardFormInput);
  document.addEventListener("change", handleDashboardFormInput);
  document.addEventListener("submit", handleDashboardSubmit);
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
    starts_today: "Controlla check-in, voli e prime tappe.",
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

function getCountdownCaption(status, startDate = "") {
  const days = getDaysUntilTrip(startDate);
  const futureCaption = days === 1 ? "giorno alla partenza" : "giorni alla partenza";
  const captions = {
    future: futureCaption,
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

function renderDashboardInfoRow(label, value) {
  if (!value) {
    return "";
  }

  return `
    <div class="dashboard-countdown-strip__row">
      <span class="dashboard-countdown-strip__dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)} <strong>${escapeHtml(value)}</strong></span>
    </div>
  `;
}

function renderDashboardCountdownStrip({ trip, status, statusLabel, timelineItems, checklistItems, flights, stays }) {
  const sortedFlights = sortByDateTime(flights, "departureDate", "departureTime");
  const sortedStays = sortByDateTime(stays, "checkInDate");
  const nextTimelineItem = getNextTimelineItem(sortTimelineItems(timelineItems));
  const checklistSummary = calculateChecklistSummary(checklistItems);
  const firstFlight = sortedFlights[0] || null;
  const firstStay = sortedStays[0] || null;
  const firstFlightRoute = firstFlight ? [firstFlight.from, firstFlight.to].filter(Boolean).join(" -> ") : "";
  const firstStayLabel = firstStay ? firstStay.structureName || getDestinationName(trip.destinations, firstStay.destinationId) : "";
  const countdownNumber = getCountdownNumber(status, trip.startDate);
  const countdownCaption = getCountdownCaption(status, trip.startDate);

  return `
    <section class="dashboard-countdown-strip" aria-label="Sintesi operativa viaggio">
      <div class="dashboard-countdown-strip__count" aria-label="${escapeHtml(`${countdownNumber} ${countdownCaption}`)}">
        <span class="dashboard-countdown-strip__number">${escapeHtml(countdownNumber)}</span>
        <strong class="dashboard-countdown-strip__caption">${escapeHtml(countdownCaption)}</strong>
      </div>
      <div class="dashboard-countdown-strip__separator" aria-hidden="true"></div>
      <div class="dashboard-countdown-strip__details">
        ${renderDashboardInfoRow("Partenza", trip.startDate ? formatDate(trip.startDate) : "")}
        ${renderDashboardInfoRow("Primo volo", firstFlightRoute)}
        ${renderDashboardInfoRow("Primo soggiorno", firstStayLabel)}
        ${renderDashboardInfoRow("Prossima tappa", nextTimelineItem?.title || "")}
        ${checklistItems.length ? renderDashboardInfoRow("Checklist", `${checklistSummary.completionRate}% pronta`) : ""}
      </div>
    </section>
  `;
}

function renderDashboardBudgetRow(budget, currency) {
  return `
    <section class="dashboard-budget-row" aria-label="Riepilogo economico viaggio">
      <article class="dashboard-budget-row__item">
        <span>Totale viaggio</span>
        <strong>${formatCurrency(budget.plannedTotal, currency)}</strong>
      </article>
      <article class="dashboard-budget-row__item">
        <span>Gia pagato</span>
        <strong>${formatCurrency(budget.paidTotal, currency)}</strong>
      </article>
      <article class="dashboard-budget-row__item">
        <span>Da pagare</span>
        <strong>${formatCurrency(budget.unpaidTotal, currency)}</strong>
      </article>
    </section>
  `;
}

function renderDashboardHero({ trip, destinations, duration, countdown, status, statusLabel }) {
  return `
    <header class="dashboard-hero">
      <div class="dashboard-hero__header">
        <div class="dashboard-hero__copy">
          <p class="dashboard-hero__label">Dashboard viaggio</p>
          <h1 class="page__title" id="trip-title">${escapeHtml(trip.name)}</h1>
          <p class="dashboard-hero__route">${destinations}</p>
          <div class="dashboard-hero__meta">
            <span class="dashboard-hero__meta-hot">${escapeHtml(countdown)}</span>
            <span>${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</span>
            <span>${duration} giorni di viaggio</span>
            <span>${escapeHtml(statusLabel)}</span>
          </div>
          <p class="dashboard-hero__message">${getHeroMessage(status)}</p>
        </div>
        <div class="dashboard-hero__aside">
          <button class="button button--ghost button--small" type="button" data-action="edit-dashboard-trip" data-trip-id="${escapeHtml(trip.id)}">Modifica viaggio</button>
        </div>
      </div>
    </header>
  `;
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
          <p>${formatDate(nextItem.date)}${nextItem.time ? `, ${escapeHtml(nextItem.time)}` : ""}${nextItem.location ? ` &middot; ${escapeHtml(nextItem.location)}` : ""}</p>
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

function renderDashboardWidgets({ trip, status, budget, timelineItems, notes, basePath }) {
  const sortedTimelineItems = sortTimelineItems(timelineItems);
  const nextItem = getNextTimelineItem(sortedTimelineItems);
  const sortedNotes = sortNotes(notes);
  const latestNote = sortedNotes[0] || null;

  return `
    <section class="dashboard-widget-grid" aria-label="Riepilogo dossier">
      <article class="dashboard-widget">
        <p class="dashboard-widget__label">Partenza</p>
        <h2 class="dashboard-widget__title">${escapeHtml(getCountdownNumber(status, trip.startDate))}</h2>
        <p class="dashboard-widget__body">${escapeHtml(getCountdownCaption(status))}</p>
        <a class="button button--ghost button--small" href="${basePath}/timeline">Apri timeline &rarr;</a>
      </article>
      <article class="dashboard-widget">
        <p class="dashboard-widget__label">Budget</p>
        <h2 class="dashboard-widget__title">${formatCurrency(budget.plannedTotal, trip.currency || "EUR")}</h2>
        <p class="dashboard-widget__body">Registro spese e pagamenti del viaggio.</p>
        <a class="button button--ghost button--small" href="${basePath}/budget">Apri budget &rarr;</a>
      </article>
      <article class="dashboard-widget">
        <p class="dashboard-widget__label">Timeline</p>
        <h2 class="dashboard-widget__title">${sortedTimelineItems.length === 1 ? "1 tappa" : `${sortedTimelineItems.length} tappe`}</h2>
        ${nextItem ? `<p class="dashboard-widget__body">${escapeHtml(nextItem.title)}${nextItem.date ? ` &middot; ${formatDate(nextItem.date)}` : ""}</p>` : `<p class="dashboard-widget__body">Nessuna tappa inserita.</p>`}
        <a class="button button--ghost button--small" href="${basePath}/timeline">Vai alla timeline &rarr;</a>
      </article>
      <article class="dashboard-widget">
        <p class="dashboard-widget__label">Note</p>
        <h2 class="dashboard-widget__title">${sortedNotes.length === 1 ? "1 nota" : `${sortedNotes.length} note`}</h2>
        ${latestNote ? `<p class="dashboard-widget__body">${escapeHtml(getNotePreview(latestNote.content, 80))}</p>` : `<p class="dashboard-widget__body">Nessuna nota inserita.</p>`}
        <a class="button button--ghost button--small" href="${basePath}/notes">Vai alle note &rarr;</a>
      </article>
    </section>
  `;
}

function renderChecklistPreview(items, basePath) {
  const summary = calculateChecklistSummary(items);
  const previewItems = items.slice(0, 4);

  return `
    <section class="dashboard-checklist-preview" aria-labelledby="dashboard-checklist-title">
      <header class="dashboard-checklist-preview__header">
        <div>
          <p class="page__eyebrow">Checklist</p>
          <h2 class="panel__title" id="dashboard-checklist-title">${summary.completionRate}% completata</h2>
        </div>
        <span>${summary.completed}/${summary.total} completati</span>
      </header>
      <div class="budget-progress checklist-widget-progress" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.completionRate}">
        <span style="width: ${summary.completionRate}%"></span>
      </div>
      ${previewItems.length ? `
        <div class="dashboard-checklist-preview__items">
          ${previewItems.map((item) => `
            <article class="dashboard-checklist-preview__item ${item.completed ? "is-completed" : ""}">
              <span class="dashboard-checklist-preview__check" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                ${item.dueDate ? `<p>${formatDate(item.dueDate)}</p>` : ""}
              </div>
            </article>
          `).join("")}
        </div>
      ` : `<p class="dashboard-widget__body">Checklist non ancora configurata.</p>`}
      <a class="button button--ghost button--small" href="${basePath}/checklist">Apri checklist &rarr;</a>
    </section>
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

function sortByDateTime(items, dateField, timeField = "") {
  return [...items].sort((a, b) => {
    const aDate = String(a[dateField] || "9999-12-31");
    const bDate = String(b[dateField] || "9999-12-31");
    const dateComparison = aDate.localeCompare(bDate);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return String(a[timeField] || "23:59").localeCompare(String(b[timeField] || "23:59"));
  });
}

function renderDossierPayment(item, currency) {
  const hasCost = Number(item.cost || 0) > 0;
  const status = getDossierPaymentStatusLabel(item.paymentStatus);
  const badgeClass = getDossierPaymentStatusBadge(item.paymentStatus);
  const breakdown = getPaymentBreakdown(item);

  return `
    <p class="dossier-card__payment">
      <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
      ${hasCost ? `<strong>${formatCurrency(item.cost, currency)}</strong>` : ""}
      ${item.paymentStatus === "partial" ? `<span>Pagato ${formatCurrency(breakdown.paidAmount, currency)} · Da pagare ${formatCurrency(breakdown.dueAmount, currency)}</span>` : ""}
    </p>
  `;
}

function renderDossierPaymentSummary(item, currency) {
  const hasCost = Number(item.cost || 0) > 0;
  const status = getDossierPaymentStatusLabel(item.paymentStatus);
  const badgeClass = getDossierPaymentStatusBadge(item.paymentStatus);

  return `
    <p class="dossier-card__payment">
      <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
      ${hasCost ? `<strong>${formatCurrency(item.cost, currency)}</strong>` : ""}
    </p>
  `;
}

function renderDossierPartialPayment(item, currency) {
  const breakdown = getPaymentBreakdown(item);

  if (item.paymentStatus !== "partial") {
    return "";
  }

  return `
    <p class="payment-breakdown dossier-card__payment-detail">
      Pagato ${formatCurrency(breakdown.paidAmount, currency)} &middot; Da pagare ${formatCurrency(breakdown.dueAmount, currency)}
    </p>
  `;
}

function getDestinationName(destinations, destinationId) {
  return normalizeDestinations(destinations).find((destination) => destination.id === destinationId)?.name || "";
}

function renderFlightCard(flight, currency) {
  const from = flight.from || "Da definire";
  const to = flight.to || "Da definire";
  const route = [flight.from, flight.to].filter(Boolean).map(escapeHtml).join(" &rarr; ") || "Tratta da completare";
  const stopover = flight.stopover && typeof flight.stopover === "object" ? flight.stopover : {};
  const stopoverParts = [
    stopover.location ? `Scalo: ${stopover.location}` : "",
    stopover.date ? formatDate(stopover.date) : "",
    stopover.time || ""
  ].filter(Boolean);
  const flightIdentity = [
    flight.airline,
    flight.flightNumber
  ].filter(Boolean).join(" · ");
  const dateLine = [
    flight.departureDate ? `${formatDate(flight.departureDate)}${flight.departureTime ? ` ${escapeHtml(flight.departureTime)}` : ""}` : "",
    flight.arrivalDate ? `${formatDate(flight.arrivalDate)}${flight.arrivalTime ? ` ${escapeHtml(flight.arrivalTime)}` : ""}` : ""
  ].filter(Boolean).join(" &rarr; ");
  const referenceParts = [
    flight.bookingNumber ? `Prenotazione ${flight.bookingNumber}` : "",
    flight.baggage ? `Bagaglio: ${flight.baggage}` : ""
  ].filter(Boolean);

  return `
    <article class="dossier-card dossier-card--flight">
      <div class="dossier-card__topline">
        <p class="dossier-card__eyebrow">Volo</p>
      </div>
      <div class="flight-ticket__route" aria-label="${escapeHtml(route)}">
        <div class="flight-ticket__point">
          <span>Da</span>
          <strong>${escapeHtml(from)}</strong>
        </div>
        <span class="flight-ticket__arrow" aria-hidden="true">&rarr;</span>
        <div class="flight-ticket__point">
          <span>A</span>
          <strong>${escapeHtml(to)}</strong>
        </div>
      </div>
      ${dateLine ? `<p class="dossier-card__meta flight-ticket__time">${dateLine}</p>` : ""}
      ${flightIdentity ? `<p class="dossier-card__meta flight-ticket__identity">${escapeHtml(flightIdentity)}</p>` : ""}
      ${stopoverParts.length ? `<p class="dossier-card__meta">${stopoverParts.map(escapeHtml).join(" &middot; ")}</p>` : ""}
      ${referenceParts.length ? `<p class="dossier-card__meta flight-ticket__details">${referenceParts.map(escapeHtml).join(" &middot; ")}</p>` : ""}
      ${flight.notes ? `<p class="dossier-card__notes">${escapeHtml(flight.notes)}</p>` : ""}
      <div class="flight-ticket__footer">
        ${renderDossierPaymentSummary(flight, currency)}
        ${renderDossierPartialPayment(flight, currency)}
        <div class="trip-card__actions" aria-label="Azioni volo">
          <button class="button button--small button--ghost" type="button" data-action="edit-flight" data-flight-id="${escapeHtml(flight.id)}">Modifica</button>
          <button class="button button--small button--danger-ghost" type="button" data-action="delete-flight" data-flight-id="${escapeHtml(flight.id)}">Elimina</button>
        </div>
      </div>
    </article>
  `;
}

function renderStayCard(stay, trip) {
  const destinationName = getDestinationName(trip.destinations, stay.destinationId);
  const title = stay.structureName || "Soggiorno da completare";
  const referenceParts = [
    destinationName ? `Destinazione: ${destinationName}` : "",
    stay.bookingNumber ? `Prenotazione ${stay.bookingNumber}` : ""
  ].filter(Boolean);

  return `
    <article class="dossier-card dossier-card--stay">
      <div class="dossier-card__topline">
        <p class="dossier-card__eyebrow">Soggiorno</p>
        ${renderDossierPaymentSummary(stay, trip.currency || "EUR")}
      </div>
      <h3 class="dossier-card__title">${escapeHtml(title)}</h3>
      <div class="stay-document__dates">
        <div class="stay-document__date-block">
          <span>Check-in</span>
          <strong>${stay.checkInDate ? formatDate(stay.checkInDate) : "Da definire"}</strong>
        </div>
        <div class="stay-document__date-block">
          <span>Check-out</span>
          <strong>${stay.checkOutDate ? formatDate(stay.checkOutDate) : "Da definire"}</strong>
        </div>
      </div>
      ${referenceParts.length ? `<p class="dossier-card__meta">${referenceParts.map(escapeHtml).join(" &middot; ")}</p>` : ""}
      ${stay.mealsNotes ? `<p class="dossier-card__meta">${escapeHtml(stay.mealsNotes)}</p>` : ""}
      ${renderDossierPartialPayment(stay, trip.currency || "EUR")}
      ${stay.notes ? `<p class="dossier-card__notes">${escapeHtml(stay.notes)}</p>` : ""}
      <div class="trip-card__actions" aria-label="Azioni soggiorno">
        <button class="button button--small button--ghost" type="button" data-action="edit-stay" data-stay-id="${escapeHtml(stay.id)}">Modifica</button>
        <button class="button button--small button--danger-ghost" type="button" data-action="delete-stay" data-stay-id="${escapeHtml(stay.id)}">Elimina</button>
      </div>
    </article>
  `;
}

function renderActivityCard(activity, trip) {
  const destinationName = getDestinationName(trip.destinations, activity.destinationId);
  const title = activity.name || "Attivita da completare";
  const dateLine = [
    activity.date ? formatDate(activity.date) : "",
    activity.time,
    activity.location
  ].filter(Boolean).map(escapeHtml).join(" &middot; ");
  const referenceParts = [
    getActivityTypeLabel(activity.type),
    destinationName,
    activity.bookingNumber ? `Prenotazione ${activity.bookingNumber}` : ""
  ].filter(Boolean);

  return `
    <article class="dossier-card dossier-card--activity">
      <div class="dossier-card__topline">
        <p class="dossier-card__eyebrow">${escapeHtml(getActivityTypeLabel(activity.type))}</p>
        ${renderDossierPaymentSummary(activity, trip.currency || "EUR")}
      </div>
      <div class="activity-document__body">
        <span class="activity-document__stamp" aria-hidden="true">A</span>
        <div>
          <h3 class="dossier-card__title">${escapeHtml(title)}</h3>
          ${dateLine ? `<p class="dossier-card__meta">${dateLine}</p>` : ""}
        </div>
      </div>
      ${referenceParts.length ? `<p class="dossier-card__meta">${referenceParts.map(escapeHtml).join(" &middot; ")}</p>` : ""}
      ${renderDossierPartialPayment(activity, trip.currency || "EUR")}
      ${activity.notes ? `<p class="dossier-card__notes">${escapeHtml(activity.notes)}</p>` : ""}
      <div class="trip-card__actions" aria-label="Azioni attivita">
        <button class="button button--small button--ghost" type="button" data-action="edit-activity" data-activity-id="${escapeHtml(activity.id)}">Modifica</button>
        <button class="button button--small button--danger-ghost" type="button" data-action="delete-activity" data-activity-id="${escapeHtml(activity.id)}">Elimina</button>
      </div>
    </article>
  `;
}

function renderDossierSection({ title, summary, tripId, section, action, emptyText, emptyDescription = "", itemsHtml, totalCount = 0 }) {
  const isExpandable = totalCount > DASHBOARD_SECTION_PREVIEW_LIMIT;
  const isExpanded = isDashboardSectionExpanded(tripId, section);

  return `
    <section class="dossier-section" aria-labelledby="${action}-title">
      <header class="dossier-section__header">
        <div>
          <h2 class="panel__title" id="${action}-title">${title}</h2>
          <p class="panel__body">${summary}</p>
        </div>
        <button class="button button--primary button--small" type="button" data-action="${action}" data-trip-id="${escapeHtml(tripId)}">Aggiungi</button>
      </header>
      ${itemsHtml ? `<div class="dossier-list">${itemsHtml}</div>` : `
        <article class="dossier-empty">
          <p>${escapeHtml(emptyText)}</p>
          ${emptyDescription ? `<p>${escapeHtml(emptyDescription)}</p>` : ""}
        </article>
      `}
      ${isExpandable ? `
        <button class="button button--ghost button--small dossier-section__toggle" type="button" data-action="toggle-dossier-section" data-trip-id="${escapeHtml(tripId)}" data-section="${escapeHtml(section)}">
          ${isExpanded ? "Mostra meno" : "Mostra tutti"}
        </button>
      ` : ""}
    </section>
  `;
}

function getVisibleDossierItems(tripId, section, items) {
  if (isDashboardSectionExpanded(tripId, section) || items.length <= DASHBOARD_SECTION_PREVIEW_LIMIT) {
    return items;
  }

  return items.slice(0, DASHBOARD_SECTION_PREVIEW_LIMIT);
}

function renderDossierSections(trip, flights, stays, activities) {
  const sortedFlights = sortByDateTime(flights, "departureDate", "departureTime");
  const sortedStays = sortByDateTime(stays, "checkInDate");
  const sortedActivities = sortByDateTime(activities, "date", "time");
  const visibleFlights = getVisibleDossierItems(trip.id, "flights", sortedFlights);
  const visibleStays = getVisibleDossierItems(trip.id, "stays", sortedStays);
  const visibleActivities = getVisibleDossierItems(trip.id, "activities", sortedActivities);

  return `
    <section class="dossier-sections" aria-label="Sezioni dossier">
      ${renderDossierSection({
        title: "Voli",
        summary: flights.length === 1 ? "1 volo" : `${flights.length} voli`,
        tripId: trip.id,
        section: "flights",
        action: "open-flight-form",
        emptyText: "Nessun volo inserito.",
        itemsHtml: visibleFlights.map((flight) => renderFlightCard(flight, trip.currency || "EUR")).join(""),
        totalCount: sortedFlights.length
      })}
      ${renderDossierSection({
        title: "Soggiorni",
        summary: stays.length === 1 ? "1 soggiorno" : `${stays.length} soggiorni`,
        tripId: trip.id,
        section: "stays",
        action: "open-stay-form",
        emptyText: "Nessun soggiorno inserito.",
        itemsHtml: visibleStays.map((stay) => renderStayCard(stay, trip)).join(""),
        totalCount: sortedStays.length
      })}
      ${renderDossierSection({
        title: "Attivita",
        summary: activities.length === 1 ? "1 attivita" : `${activities.length} attivita`,
        tripId: trip.id,
        section: "activities",
        action: "open-activity-form",
        emptyText: "Nessuna attivita inserita.",
        emptyDescription: "Aggiungi escursioni, visite, ristoranti prenotati o attivita con data e costo.",
        itemsHtml: visibleActivities.map((activity) => renderActivityCard(activity, trip)).join(""),
        totalCount: sortedActivities.length
      })}
    </section>
  `;
}

function buildDossierRecap({ timelineItems, flights, stays, activities }) {
  const entries = [];

  timelineItems.forEach((item) => {
    if (item.date) {
      entries.push({
        date: item.date,
        time: item.time || "",
        label: "Timeline",
        title: item.title,
        meta: item.location || "",
        order: entries.length
      });
    }
  });

  flights.forEach((flight) => {
    if (flight.departureDate) {
      const flightIdentity = [flight.airline, flight.flightNumber].filter(Boolean).join(" ");
      const route = [flight.from, flight.to].filter(Boolean).join(" -> ");

      entries.push({
        date: flight.departureDate,
        time: flight.departureTime || "",
        label: "Volo",
        title: [flightIdentity, route].filter(Boolean).join(" · ") || "Volo",
        meta: "",
        order: entries.length
      });
    }
  });

  stays.forEach((stay) => {
    if (stay.checkInDate) {
      entries.push({
        date: stay.checkInDate,
        time: "",
        label: "Check-in",
        title: stay.structureName || "Alloggio",
        meta: "",
        order: entries.length
      });
    }

    if (stay.checkOutDate) {
      entries.push({
        date: stay.checkOutDate,
        time: "",
        label: "Check-out",
        title: stay.structureName || "Alloggio",
        meta: "",
        order: entries.length
      });
    }
  });

  activities.forEach((activity) => {
    if (activity.date) {
      entries.push({
        date: activity.date,
        time: activity.time || "",
        label: getActivityTypeLabel(activity.type) || "Attivita",
        title: activity.name || "Attivita",
        meta: activity.location || "",
        order: entries.length
      });
    }
  });

  return entries.sort((a, b) => {
    const dateComparison = a.date.localeCompare(b.date);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    if (a.time && b.time && a.time !== b.time) {
      return a.time.localeCompare(b.time);
    }

    if (a.time !== b.time) {
      return a.time ? -1 : 1;
    }

    return a.order - b.order;
  });
}

function groupDossierRecapByDate(entries) {
  return entries.reduce((groups, entry) => {
    const currentGroup = groups.find((group) => group.date === entry.date);

    if (currentGroup) {
      currentGroup.items.push(entry);
    } else {
      groups.push({
        date: entry.date,
        items: [entry]
      });
    }

    return groups;
  }, []);
}

function renderDossierRecap(context) {
  const entries = buildDossierRecap(context);
  const groups = groupDossierRecapByDate(entries);

  return `
    <section class="panel panel--wide dossier-recap" aria-labelledby="dossier-recap-title">
      <div>
        <p class="page__eyebrow">Recap viaggio</p>
        <h2 class="panel__title" id="dossier-recap-title">Timeline per giorno</h2>
      </div>
      ${groups.length ? `
        <div class="dossier-recap__list">
          ${groups.map((group) => `
            <section class="dossier-recap__day" aria-label="${formatDate(group.date)}">
              <h3>${formatDate(group.date)}</h3>
              <div class="dossier-recap__items">
                ${group.items.map((entry) => `
                  <article class="dossier-recap__item">
                    <span class="dossier-recap__type">${escapeHtml(entry.label)}</span>
                    <div>
                      <strong>${entry.time ? `${escapeHtml(entry.time)} · ` : ""}${escapeHtml(entry.title)}</strong>
                      ${entry.meta ? `<p>${escapeHtml(entry.meta)}</p>` : ""}
                    </div>
                  </article>
                `).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      ` : `
        <div class="dossier-empty">
          <p>Nessun evento datato nel recap.</p>
          <p>Aggiungi voli, alloggi, attivita o tappe nella timeline.</p>
        </div>
      `}
    </section>
  `;
}

function getTodayComparable() {
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0")
  ].join(":");

  return `${today}T${time}`;
}

function getEntryComparable(entry) {
  return `${entry.date}T${entry.time || "23:59"}`;
}

function getQuickRecapEntries(context, limit = 5) {
  const entries = buildDossierRecap(context);
  const now = getTodayComparable();
  const futureEntries = entries.filter((entry) => getEntryComparable(entry) >= now);
  const source = futureEntries.length ? futureEntries : [...entries].reverse();

  return source.slice(0, limit);
}

function renderQuickRecap(context, basePath) {
  const entries = getQuickRecapEntries(context, 5);

  return `
    <section class="panel panel--wide dashboard-quick-recap" aria-labelledby="quick-recap-title">
      <header class="dashboard-section-heading">
        <div>
          <p class="page__eyebrow">Recap veloce</p>
          <h2 class="panel__title" id="quick-recap-title">Prossimi momenti</h2>
        </div>
        <a class="button button--ghost button--small" href="${basePath}/timeline">Vedi timeline completa &rarr;</a>
      </header>
      ${entries.length ? `
        <div class="quick-recap-list">
          ${entries.map((entry) => `
            <article class="quick-recap-item">
              <time datetime="${escapeHtml(entry.date)}">${formatDate(entry.date)}</time>
              <span>${escapeHtml(entry.label)}</span>
              <strong>${entry.time ? `${escapeHtml(entry.time)} &middot; ` : ""}${escapeHtml(entry.title)}</strong>
              ${entry.meta ? `<p>${escapeHtml(entry.meta)}</p>` : ""}
            </article>
          `).join("")}
        </div>
      ` : `
        <article class="dossier-empty">
          <p>Nessun momento datato nel dossier.</p>
          <p>Aggiungi voli, soggiorni, attivita o tappe nella timeline.</p>
        </article>
      `}
    </section>
  `;
}

function countLabel(count, singular, plural) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function getNextDatedItem(items, dateField, timeField = "") {
  const sortedItems = sortByDateTime(items, dateField, timeField).filter((item) => item[dateField]);
  const today = getTodayComparable().slice(0, 10);
  return sortedItems.find((item) => String(item[dateField]) >= today) || sortedItems[0] || null;
}

function getPartialPaymentCount(items) {
  return items.filter((item) => item.paymentStatus === "partial").length;
}

function getAccessIcon(key) {
  const icons = {
    flights: `<svg viewBox="0 0 24 24"><path d="M3 12h18M12 3l4 9-4 9-4-9 4-9Z"/></svg>`,
    stays: `<svg viewBox="0 0 24 24"><path d="M4 11h16v8M6 11V7h12v4M8 15h8"/></svg>`,
    activities: `<svg viewBox="0 0 24 24"><path d="M12 3v18M5 8h14M7 16h10"/></svg>`,
    budget: `<svg viewBox="0 0 24 24"><path d="M15 6a5 5 0 1 0 0 12M6 10h8M6 14h8"/></svg>`,
    timeline: `<svg viewBox="0 0 24 24"><path d="M7 5v14M7 7h10M7 12h7M7 17h11"/></svg>`,
    checklist: `<svg viewBox="0 0 24 24"><path d="m5 12 3 3 5-6M15 7h4M15 12h4M15 17h4"/></svg>`
  };

  return icons[key] || icons.timeline;
}

function renderAccessCard({ title, label, detail, href, cta, icon }) {
  return `
    <a class="dashboard-access-card" href="${href}">
      <span class="dashboard-access-card__icon" aria-hidden="true">${getAccessIcon(icon)}</span>
      <span class="dashboard-access-card__label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
      <span class="dashboard-access-card__cta">${escapeHtml(cta)} &rarr;</span>
    </a>
  `;
}

function renderDashboardAccessGrid({ trip, flights, stays, activities, budget, timelineItems, checklistItems, basePath }) {
  const currency = trip.currency || "EUR";
  const nextFlight = getNextDatedItem(flights, "departureDate", "departureTime");
  const nextStay = getNextDatedItem(stays, "checkInDate");
  const nextActivity = getNextDatedItem(activities, "date", "time");
  const recapEntries = buildDossierRecap({ timelineItems, flights, stays, activities });
  const nextRecapEntry = getQuickRecapEntries({ timelineItems, flights, stays, activities }, 1)[0] || null;
  const checklistSummary = calculateChecklistSummary(checklistItems);
  const flightRoute = nextFlight ? [nextFlight.from, nextFlight.to].filter(Boolean).join(" -> ") : "";
  const stayName = nextStay ? nextStay.structureName || getDestinationName(trip.destinations, nextStay.destinationId) || "Soggiorno" : "";
  const activityName = nextActivity ? nextActivity.name || "Attivita" : "";
  const activityPartialCount = getPartialPaymentCount(activities);

  return `
    <section class="dashboard-access-section" aria-labelledby="dashboard-access-title">
      <header class="dashboard-section-heading">
        <div>
          <p class="page__eyebrow">Sezioni dossier</p>
          <h2 class="panel__title" id="dashboard-access-title">Apri una sezione</h2>
        </div>
      </header>
      <div class="dashboard-access-grid">
        ${renderAccessCard({
          title: "Voli",
          label: flights.length ? countLabel(flights.length, "volo inserito", "voli inseriti") : "Nessun volo inserito",
          detail: flightRoute ? `Prossimo: ${flightRoute}` : "Aggiungi il primo volo",
          href: `${basePath}/flights`,
          cta: "Apri Voli",
          icon: "flights"
        })}
        ${renderAccessCard({
          title: "Soggiorni",
          label: stays.length ? countLabel(stays.length, "soggiorno", "soggiorni") : "Nessun soggiorno inserito",
          detail: stayName ? `Prossimo check-in: ${stayName}` : "Aggiungi il primo soggiorno",
          href: `${basePath}/stays`,
          cta: "Apri Soggiorni",
          icon: "stays"
        })}
        ${renderAccessCard({
          title: "Attivita",
          label: activities.length ? countLabel(activities.length, "attivita", "attivita") : "Nessuna attivita inserita",
          detail: activityName || (activityPartialCount ? `${activityPartialCount} pagamenti parziali` : "Aggiungi la prima attivita"),
          href: `${basePath}/activities`,
          cta: "Apri Attivita",
          icon: "activities"
        })}
        ${renderAccessCard({
          title: "Budget",
          label: `Totale ${formatCurrency(budget.plannedTotal, currency)}`,
          detail: `Da pagare ${formatCurrency(budget.unpaidTotal, currency)}`,
          href: `${basePath}/budget`,
          cta: "Apri Budget",
          icon: "budget"
        })}
        ${renderAccessCard({
          title: "Timeline",
          label: recapEntries.length ? countLabel(recapEntries.length, "evento", "eventi") : "Nessun evento inserito",
          detail: nextRecapEntry ? `Prossimo: ${nextRecapEntry.label} ${nextRecapEntry.title}` : "Aggiungi tappe e momenti",
          href: `${basePath}/timeline`,
          cta: "Apri Timeline",
          icon: "timeline"
        })}
        ${renderAccessCard({
          title: "Checklist",
          label: checklistItems.length ? `${checklistSummary.completionRate}% pronta` : "Checklist vuota",
          detail: checklistItems.length ? `${checklistSummary.completed}/${checklistSummary.total} completati` : "Aggiungi il primo task",
          href: `${basePath}/checklist`,
          cta: "Apri Checklist",
          icon: "checklist"
        })}
      </div>
    </section>
  `;
}

function renderDedicatedDossierSection({ title, summary, tripId, action, emptyText, emptyDescription, itemsHtml }) {
  return `
    <section class="dossier-section dossier-section--dedicated" aria-labelledby="${action}-title">
      <header class="dossier-section__header">
        <div>
          <h2 class="panel__title" id="${action}-title">${escapeHtml(title)}</h2>
          <p class="panel__body">${escapeHtml(summary)}</p>
        </div>
        <button class="button button--primary button--small" type="button" data-action="${action}" data-trip-id="${escapeHtml(tripId)}">Aggiungi</button>
      </header>
      ${itemsHtml ? `<div class="dossier-list">${itemsHtml}</div>` : `
        <article class="dossier-empty">
          <p>${escapeHtml(emptyText)}</p>
          ${emptyDescription ? `<p>${escapeHtml(emptyDescription)}</p>` : ""}
          <button class="button button--ghost button--small" type="button" data-action="${action}" data-trip-id="${escapeHtml(tripId)}">${escapeHtml(emptyDescription || "Aggiungi")}</button>
        </article>
      `}
    </section>
  `;
}

function renderDedicatedDossierPage({ trip, title, summary, sectionHtml }) {
  const encodedTripId = encodeURIComponent(trip.id);

  return `
    <section class="page dossier-section-page" data-dashboard-trip-id="${escapeHtml(trip.id)}" aria-labelledby="dossier-section-title">
      ${renderAppBar({
        subtitle: title,
        backHref: `#/trip/${encodedTripId}`
      })}
      <a class="button button--ghost dossier-back-link" href="#/trip/${encodedTripId}">&larr; Dossier</a>
      <header class="page__header">
        <p class="page__eyebrow">Dossier viaggio</p>
        <h1 class="page__title" id="dossier-section-title">${escapeHtml(title)}</h1>
        <p class="page__summary">${escapeHtml(summary)}</p>
      </header>
      ${sectionHtml}
    </section>
  `;
}

function renderErrorList(errors) {
  const entries = Object.values(errors);

  if (entries.length === 0) {
    return "";
  }

  return `
    <div class="form-errors" role="alert">
      ${entries.map((error) => `<p>${escapeHtml(error)}</p>`).join("")}
    </div>
  `;
}

function fieldError(errors, field) {
  return errors[field] ? `<p class="field-error">${escapeHtml(errors[field])}</p>` : "";
}

function shouldShowZeroCostWarning(costValue, paymentStatus) {
  const cleanValue = String(costValue ?? "").trim();

  if (!cleanValue) {
    return false;
  }

  const cost = Number(cleanValue);
  return Number.isFinite(cost) && cost === 0 && ["paid", "partial"].includes(paymentStatus);
}

function renderZeroCostWarning(costValue, paymentStatus) {
  const hidden = shouldShowZeroCostWarning(costValue, paymentStatus) ? "" : " hidden";

  return `<p class="form-warning" data-zero-cost-warning${hidden}>${ZERO_COST_WARNING_COPY}</p>`;
}

function isPaidAmountVisible(paymentStatus) {
  return paymentStatus === "partial";
}

function normalizeFormCost(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function renderPaidAmountAttributes(paymentStatus) {
  return isPaidAmountVisible(paymentStatus) ? "" : " disabled";
}

function getPaidAmountFieldValue(paymentStatus, costValue, paidAmount) {
  if (paymentStatus === "paid") {
    return normalizeFormCost(costValue);
  }

  if (paymentStatus === "unpaid") {
    return 0;
  }

  return paidAmount || "";
}

function hasStopover(flight) {
  const stopover = flight?.stopover && typeof flight.stopover === "object" ? flight.stopover : {};

  return Boolean(
    stopover.location ||
    stopover.date ||
    stopover.time ||
    flight?.stopoverLocation ||
    flight?.stopoverDate ||
    flight?.stopoverTime
  );
}

function getStopoverValue(flight, field) {
  const stopover = flight?.stopover && typeof flight.stopover === "object" ? flight.stopover : {};
  const legacyField = `stopover${field.charAt(0).toUpperCase()}${field.slice(1)}`;

  return stopover[field] || flight?.[legacyField] || "";
}

function updateStopoverFields(form) {
  const fields = form.querySelector("[data-stopover-fields]");
  const enabled = form.elements.stopoverEnabled?.checked;

  if (fields) {
    fields.hidden = !enabled;
  }
}

function updateZeroCostWarning(form) {
  const warning = form.querySelector("[data-zero-cost-warning]");

  if (!warning) {
    return;
  }

  warning.hidden = !shouldShowZeroCostWarning(form.elements.cost?.value, form.elements.paymentStatus?.value);
}

function updatePaidAmountField(form) {
  const field = form.querySelector("[data-paid-amount-field]");
  const input = form.elements.paidAmount;

  if (!field || !input) {
    return;
  }

  const paymentStatus = form.elements.paymentStatus?.value || "unpaid";
  field.hidden = !isPaidAmountVisible(paymentStatus);
  input.disabled = !isPaidAmountVisible(paymentStatus);

  if (paymentStatus === "unpaid") {
    input.value = "0";
  }

  if (paymentStatus === "paid") {
    input.value = String(normalizeFormCost(form.elements.cost?.value));
  }
}

function parseOptionalCost(value) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue) {
    return 0;
  }

  const amount = Number(cleanValue);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function renderOptions(values, selectedValue, labelGetter) {
  return values.map((value) => `
    <option value="${value}" ${selectedValue === value ? "selected" : ""}>${escapeHtml(labelGetter(value))}</option>
  `).join("");
}

function renderPaymentOptions(selectedValue) {
  return renderOptions(DOSSIER_PAYMENT_STATUSES, selectedValue || "unpaid", getDossierPaymentStatusLabel);
}

function renderDestinationOptions(trip, selectedValue = "") {
  const destinations = normalizeDestinations(trip.destinations, trip);

  return `
    <option value="" ${!selectedValue ? "selected" : ""}>Nessuna destinazione collegata</option>
    ${destinations.map((destination) => `
      <option value="${escapeHtml(destination.id)}" ${selectedValue === destination.id ? "selected" : ""}>${escapeHtml(destination.name)}</option>
    `).join("")}
  `;
}

function renderFlightForm({ trip, flight = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (flight?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Aggiungi volo";
  const stopoverEnabled = hasStopover(flight);

  return `
    <form class="trip-form dossier-form" id="flight-form" novalidate>
      <input type="hidden" name="mode" value="${mode}">
      <input type="hidden" name="tripId" value="${escapeHtml(trip.id)}">
      <input type="hidden" name="flightId" value="${flight?.id ? escapeHtml(flight.id) : ""}">
      <input type="hidden" name="type" value="${escapeHtml(flight?.type || "altro")}">
      ${renderErrorList(errors)}

      <div class="form-field">
        <label for="flight-airline-input">Compagnia aerea</label>
        <input id="flight-airline-input" name="airline" type="text" value="${escapeHtml(flight?.airline || "")}" autocomplete="off">
      </div>

      <div class="form-field">
        <label for="flight-number-input">Numero volo</label>
        <input id="flight-number-input" name="flightNumber" type="text" value="${escapeHtml(flight?.flightNumber || "")}" autocomplete="off">
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="flight-from-input">Da</label>
          <input id="flight-from-input" name="from" type="text" value="${escapeHtml(flight?.from || "")}" autocomplete="off">
        </div>
        <div class="form-field">
          <label for="flight-to-input">A</label>
          <input id="flight-to-input" name="to" type="text" value="${escapeHtml(flight?.to || "")}" autocomplete="off">
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="flight-departure-date-input">Data partenza</label>
          <input id="flight-departure-date-input" name="departureDate" type="date" value="${escapeHtml(flight?.departureDate || "")}">
        </div>
        <div class="form-field">
          <label for="flight-departure-time-input">Ora partenza</label>
          <input id="flight-departure-time-input" name="departureTime" type="time" value="${escapeHtml(flight?.departureTime || "")}">
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="flight-arrival-date-input">Data arrivo</label>
          <input id="flight-arrival-date-input" name="arrivalDate" type="date" value="${escapeHtml(flight?.arrivalDate || "")}">
        </div>
        <div class="form-field">
          <label for="flight-arrival-time-input">Ora arrivo</label>
          <input id="flight-arrival-time-input" name="arrivalTime" type="time" value="${escapeHtml(flight?.arrivalTime || "")}">
        </div>
      </div>

      <div class="form-field">
        <label for="flight-booking-input">Numero prenotazione</label>
        <input id="flight-booking-input" name="bookingNumber" type="text" value="${escapeHtml(flight?.bookingNumber || "")}" autocomplete="off">
      </div>

      <div class="form-field">
        <label for="flight-baggage-input">Bagaglio</label>
        <input id="flight-baggage-input" name="baggage" type="text" value="${escapeHtml(flight?.baggage || "")}" autocomplete="off">
      </div>

      <div class="form-field">
        <label class="checkbox-row" for="flight-stopover-enabled-input">
          <input id="flight-stopover-enabled-input" name="stopoverEnabled" type="checkbox" ${stopoverEnabled ? "checked" : ""}>
          <span>Aggiungi scalo</span>
        </label>
      </div>

      <div data-stopover-fields ${stopoverEnabled ? "" : "hidden"}>
        <div class="form-field">
          <label for="flight-stopover-location-input">Scalo</label>
          <input id="flight-stopover-location-input" name="stopoverLocation" type="text" value="${escapeHtml(getStopoverValue(flight, "location"))}" autocomplete="off">
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="flight-stopover-date-input">Data scalo</label>
            <input id="flight-stopover-date-input" name="stopoverDate" type="date" value="${escapeHtml(getStopoverValue(flight, "date"))}">
          </div>
          <div class="form-field">
            <label for="flight-stopover-time-input">Ora scalo</label>
            <input id="flight-stopover-time-input" name="stopoverTime" type="time" value="${escapeHtml(getStopoverValue(flight, "time"))}">
          </div>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="flight-cost-input">Costo</label>
          <input id="flight-cost-input" name="cost" type="number" min="0" step="0.01" value="${escapeHtml(flight?.cost ?? "")}">
          ${fieldError(errors, "cost")}
        </div>
        <div class="form-field">
          <label for="flight-payment-input">Stato pagamento</label>
          <select id="flight-payment-input" name="paymentStatus">${renderPaymentOptions(flight?.paymentStatus)}</select>
        </div>
      </div>

      <div class="form-field" data-paid-amount-field ${isPaidAmountVisible(flight?.paymentStatus || "unpaid") ? "" : "hidden"}>
        <label for="flight-paid-amount-input">Importo pagato, se parziale</label>
        <input id="flight-paid-amount-input" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(getPaidAmountFieldValue(flight?.paymentStatus || "unpaid", flight?.cost ?? "", flight?.paidAmount))}"${renderPaidAmountAttributes(flight?.paymentStatus || "unpaid")}>
        ${fieldError(errors, "paidAmount")}
      </div>
      ${renderZeroCostWarning(flight?.cost ?? "", flight?.paymentStatus || "unpaid")}

      <div class="form-field">
        <label for="flight-notes-input">Note</label>
        <textarea id="flight-notes-input" name="notes" rows="4">${escapeHtml(flight?.notes || "")}</textarea>
      </div>

      <div class="form-actions">
        <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
        <button class="button button--primary" type="submit">${submitLabel}</button>
      </div>
    </form>
  `;
}

function validateFlightForm(formData) {
  const cost = parseOptionalCost(formData.get("cost"));
  const paidAmount = parseOptionalCost(formData.get("paidAmount"));
  const paymentStatus = DOSSIER_PAYMENT_STATUSES.includes(formData.get("paymentStatus")) ? formData.get("paymentStatus") : "unpaid";
  const errors = {};

  if (Number.isNaN(cost) || cost < 0) {
    errors.cost = "Costo deve essere un numero maggiore o uguale a 0.";
  }

  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    errors.paidAmount = "Importo pagato deve essere un numero maggiore o uguale a 0.";
  }

  const paymentValidation = validatePaymentAllocation({
    totalAmount: Number.isNaN(cost) ? 0 : cost,
    paymentStatus,
    paidAmount
  });

  if (!errors.paidAmount && paymentValidation.error) {
    errors.paidAmount = paymentValidation.error;
  }

  return {
    errors,
    values: {
      type: String(formData.get("type") || "altro"),
      airline: String(formData.get("airline") || "").trim(),
      from: String(formData.get("from") || "").trim(),
      to: String(formData.get("to") || "").trim(),
      departureDate: String(formData.get("departureDate") || "").trim(),
      departureTime: String(formData.get("departureTime") || "").trim(),
      arrivalDate: String(formData.get("arrivalDate") || "").trim(),
      arrivalTime: String(formData.get("arrivalTime") || "").trim(),
      flightNumber: String(formData.get("flightNumber") || "").trim(),
      stopover: formData.get("stopoverEnabled")
        ? {
          location: String(formData.get("stopoverLocation") || "").trim(),
          date: String(formData.get("stopoverDate") || "").trim(),
          time: String(formData.get("stopoverTime") || "").trim()
        }
        : {
          location: "",
          date: "",
          time: ""
        },
      bookingNumber: String(formData.get("bookingNumber") || "").trim(),
      baggage: String(formData.get("baggage") || "").trim(),
      cost: Number.isNaN(cost) ? 0 : cost,
      paymentStatus,
      paidAmount: Number.isNaN(paidAmount) ? 0 : paymentValidation.paidAmount,
      notes: String(formData.get("notes") || "").trim()
    }
  };
}

function openFlightForm(trip, flight = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !flight?.id ? "Aggiungi volo" : "Modifica volo",
    content: renderFlightForm({ trip, flight, errors, modeOverride }),
    confirmOnDirty: true
  });
}

function openFlightDeleteConfirmation(flight) {
  const title = [flight.from, flight.to].filter(Boolean).join(" -> ") || flight.flightNumber || "questo volo";

  openModal({
    title: "Elimina volo",
    content: `
      <div class="confirm-dialog">
        <p>Vuoi eliminare <strong>${escapeHtml(title)}</strong> dal dossier?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
          <button class="button button--danger" type="button" data-action="confirm-delete-flight" data-flight-id="${escapeHtml(flight.id)}">Elimina</button>
        </div>
      </div>
    `
  });
}

function handleFlightFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const { errors, values } = validateFlightForm(formData);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const flightId = String(formData.get("flightId") || "");
  const trip = getTripById(tripId);

  if (!trip) {
    closeModal();
    return;
  }

  if (Object.keys(errors).length > 0) {
    openFlightForm(trip, mode === "edit" ? { ...getFlightById(flightId), ...values } : values, errors, mode);
    return;
  }

  if (mode === "edit") {
    updateFlight(flightId, values);
    showToast("Volo aggiornato.");
  } else {
    createFlight({ ...values, tripId });
    showToast("Volo aggiunto.");
  }

  closeModal();
  refreshView();
}

function renderStayForm({ trip, stay = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (stay?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Aggiungi soggiorno";

  return `
    <form class="trip-form dossier-form" id="stay-form" novalidate>
      <input type="hidden" name="mode" value="${mode}">
      <input type="hidden" name="tripId" value="${escapeHtml(trip.id)}">
      <input type="hidden" name="stayId" value="${stay?.id ? escapeHtml(stay.id) : ""}">
      <input type="hidden" name="structureType" value="${escapeHtml(stay?.structureType || "altro")}">
      ${renderErrorList(errors)}

      <div class="form-field">
        <label for="stay-destination-input">Destinazione collegata</label>
        <select id="stay-destination-input" name="destinationId">${renderDestinationOptions(trip, stay?.destinationId || "")}</select>
      </div>

      <div class="form-field">
        <label for="stay-name-input">Nome struttura</label>
        <input id="stay-name-input" name="structureName" type="text" value="${escapeHtml(stay?.structureName || "")}" autocomplete="off">
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="stay-checkin-input">Check-in</label>
          <input id="stay-checkin-input" name="checkInDate" type="date" value="${escapeHtml(stay?.checkInDate || "")}">
        </div>
        <div class="form-field">
          <label for="stay-checkout-input">Check-out</label>
          <input id="stay-checkout-input" name="checkOutDate" type="date" value="${escapeHtml(stay?.checkOutDate || "")}">
          ${fieldError(errors, "checkOutDate")}
        </div>
      </div>

      <div class="form-field">
        <label for="stay-booking-input">Numero prenotazione</label>
        <input id="stay-booking-input" name="bookingNumber" type="text" value="${escapeHtml(stay?.bookingNumber || "")}" autocomplete="off">
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="stay-cost-input">Costo</label>
          <input id="stay-cost-input" name="cost" type="number" min="0" step="0.01" value="${escapeHtml(stay?.cost ?? "")}">
          ${fieldError(errors, "cost")}
        </div>
        <div class="form-field">
          <label for="stay-payment-input">Stato pagamento</label>
          <select id="stay-payment-input" name="paymentStatus">${renderPaymentOptions(stay?.paymentStatus)}</select>
        </div>
      </div>

      <div class="form-field" data-paid-amount-field ${isPaidAmountVisible(stay?.paymentStatus || "unpaid") ? "" : "hidden"}>
        <label for="stay-paid-amount-input">Importo pagato, se parziale</label>
        <input id="stay-paid-amount-input" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(getPaidAmountFieldValue(stay?.paymentStatus || "unpaid", stay?.cost ?? "", stay?.paidAmount))}"${renderPaidAmountAttributes(stay?.paymentStatus || "unpaid")}>
        ${fieldError(errors, "paidAmount")}
      </div>
      ${renderZeroCostWarning(stay?.cost ?? "", stay?.paymentStatus || "unpaid")}

      <div class="form-field">
        <label for="stay-meals-input">Pasti / note cibo</label>
        <input id="stay-meals-input" name="mealsNotes" type="text" value="${escapeHtml(stay?.mealsNotes || "")}" autocomplete="off">
      </div>

      <div class="form-field">
        <label for="stay-notes-input">Note</label>
        <textarea id="stay-notes-input" name="notes" rows="4">${escapeHtml(stay?.notes || "")}</textarea>
      </div>

      <div class="form-actions">
        <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
        <button class="button button--primary" type="submit">${submitLabel}</button>
      </div>
    </form>
  `;
}

function validateStayForm(formData) {
  const cost = parseOptionalCost(formData.get("cost"));
  const paidAmount = parseOptionalCost(formData.get("paidAmount"));
  const paymentStatus = DOSSIER_PAYMENT_STATUSES.includes(formData.get("paymentStatus")) ? formData.get("paymentStatus") : "unpaid";
  const errors = {};
  const checkInDate = String(formData.get("checkInDate") || "").trim();
  const checkOutDate = String(formData.get("checkOutDate") || "").trim();

  if (Number.isNaN(cost) || cost < 0) {
    errors.cost = "Costo deve essere un numero maggiore o uguale a 0.";
  }

  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    errors.paidAmount = "Importo pagato deve essere un numero maggiore o uguale a 0.";
  }

  const paymentValidation = validatePaymentAllocation({
    totalAmount: Number.isNaN(cost) ? 0 : cost,
    paymentStatus,
    paidAmount
  });

  if (!errors.paidAmount && paymentValidation.error) {
    errors.paidAmount = paymentValidation.error;
  }

  if (checkInDate && checkOutDate && checkOutDate < checkInDate) {
    errors.checkOutDate = "Il check-out non puo precedere il check-in.";
  }

  return {
    errors,
    values: {
      destinationId: String(formData.get("destinationId") || "").trim(),
      structureName: String(formData.get("structureName") || "").trim(),
      structureType: String(formData.get("structureType") || "altro"),
      checkInDate,
      checkOutDate,
      bookingNumber: String(formData.get("bookingNumber") || "").trim(),
      cost: Number.isNaN(cost) ? 0 : cost,
      paymentStatus,
      paidAmount: Number.isNaN(paidAmount) ? 0 : paymentValidation.paidAmount,
      mealsNotes: String(formData.get("mealsNotes") || "").trim(),
      notes: String(formData.get("notes") || "").trim()
    }
  };
}

function openStayForm(trip, stay = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !stay?.id ? "Aggiungi soggiorno" : "Modifica soggiorno",
    content: renderStayForm({ trip, stay, errors, modeOverride }),
    confirmOnDirty: true
  });
}

function openStayDeleteConfirmation(stay) {
  openModal({
    title: "Elimina soggiorno",
    content: `
      <div class="confirm-dialog">
        <p>Vuoi eliminare <strong>${escapeHtml(stay.structureName || "questo soggiorno")}</strong> dal dossier?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
          <button class="button button--danger" type="button" data-action="confirm-delete-stay" data-stay-id="${escapeHtml(stay.id)}">Elimina</button>
        </div>
      </div>
    `
  });
}

function handleStayFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const { errors, values } = validateStayForm(formData);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const stayId = String(formData.get("stayId") || "");
  const trip = getTripById(tripId);

  if (!trip) {
    closeModal();
    return;
  }

  if (Object.keys(errors).length > 0) {
    openStayForm(trip, mode === "edit" ? { ...getStayById(stayId), ...values } : values, errors, mode);
    return;
  }

  if (mode === "edit") {
    updateStay(stayId, values);
    showToast("Soggiorno aggiornato.");
  } else {
    createStay({ ...values, tripId });
    showToast("Soggiorno aggiunto.");
  }

  closeModal();
  refreshView();
}

function renderActivityForm({ trip, activity = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (activity?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Aggiungi attivita";

  return `
    <form class="trip-form dossier-form" id="activity-form" novalidate>
      <input type="hidden" name="mode" value="${mode}">
      <input type="hidden" name="tripId" value="${escapeHtml(trip.id)}">
      <input type="hidden" name="activityId" value="${activity?.id ? escapeHtml(activity.id) : ""}">
      ${renderErrorList(errors)}

      <div class="form-field">
        <label for="activity-destination-input">Destinazione collegata</label>
        <select id="activity-destination-input" name="destinationId">${renderDestinationOptions(trip, activity?.destinationId || "")}</select>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="activity-type-input">Tipo attivita</label>
          <select id="activity-type-input" name="type">${renderOptions(ACTIVITY_TYPES, activity?.type || "altro", getActivityTypeLabel)}</select>
        </div>
        <div class="form-field">
          <label for="activity-name-input">Nome</label>
          <input id="activity-name-input" name="name" type="text" value="${escapeHtml(activity?.name || "")}" autocomplete="off">
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="activity-date-input">Data</label>
          <input id="activity-date-input" name="date" type="date" value="${escapeHtml(activity?.date || "")}">
        </div>
        <div class="form-field">
          <label for="activity-time-input">Ora</label>
          <input id="activity-time-input" name="time" type="time" value="${escapeHtml(activity?.time || "")}">
        </div>
      </div>

      <div class="form-field">
        <label for="activity-location-input">Luogo</label>
        <input id="activity-location-input" name="location" type="text" value="${escapeHtml(activity?.location || "")}" autocomplete="off">
      </div>

      <div class="form-field">
        <label for="activity-booking-input">Numero prenotazione</label>
        <input id="activity-booking-input" name="bookingNumber" type="text" value="${escapeHtml(activity?.bookingNumber || "")}" autocomplete="off">
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="activity-cost-input">Costo</label>
          <input id="activity-cost-input" name="cost" type="number" min="0" step="0.01" value="${escapeHtml(activity?.cost ?? "")}">
          ${fieldError(errors, "cost")}
        </div>
        <div class="form-field">
          <label for="activity-payment-input">Stato pagamento</label>
          <select id="activity-payment-input" name="paymentStatus">${renderPaymentOptions(activity?.paymentStatus)}</select>
        </div>
      </div>

      <div class="form-field" data-paid-amount-field ${isPaidAmountVisible(activity?.paymentStatus || "unpaid") ? "" : "hidden"}>
        <label for="activity-paid-amount-input">Importo pagato, se parziale</label>
        <input id="activity-paid-amount-input" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(getPaidAmountFieldValue(activity?.paymentStatus || "unpaid", activity?.cost ?? "", activity?.paidAmount))}"${renderPaidAmountAttributes(activity?.paymentStatus || "unpaid")}>
        ${fieldError(errors, "paidAmount")}
      </div>
      ${renderZeroCostWarning(activity?.cost ?? "", activity?.paymentStatus || "unpaid")}

      <div class="form-field">
        <label for="activity-notes-input">Note</label>
        <textarea id="activity-notes-input" name="notes" rows="4">${escapeHtml(activity?.notes || "")}</textarea>
      </div>

      <div class="form-actions">
        <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
        <button class="button button--primary" type="submit">${submitLabel}</button>
      </div>
    </form>
  `;
}

function validateActivityForm(formData) {
  const cost = parseOptionalCost(formData.get("cost"));
  const paidAmount = parseOptionalCost(formData.get("paidAmount"));
  const paymentStatus = DOSSIER_PAYMENT_STATUSES.includes(formData.get("paymentStatus")) ? formData.get("paymentStatus") : "unpaid";
  const errors = {};

  if (Number.isNaN(cost) || cost < 0) {
    errors.cost = "Costo deve essere un numero maggiore o uguale a 0.";
  }

  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    errors.paidAmount = "Importo pagato deve essere un numero maggiore o uguale a 0.";
  }

  const paymentValidation = validatePaymentAllocation({
    totalAmount: Number.isNaN(cost) ? 0 : cost,
    paymentStatus,
    paidAmount
  });

  if (!errors.paidAmount && paymentValidation.error) {
    errors.paidAmount = paymentValidation.error;
  }

  return {
    errors,
    values: {
      destinationId: String(formData.get("destinationId") || "").trim(),
      type: ACTIVITY_TYPES.includes(formData.get("type")) ? formData.get("type") : "altro",
      name: String(formData.get("name") || "").trim(),
      date: String(formData.get("date") || "").trim(),
      time: String(formData.get("time") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      bookingNumber: String(formData.get("bookingNumber") || "").trim(),
      cost: Number.isNaN(cost) ? 0 : cost,
      paymentStatus,
      paidAmount: Number.isNaN(paidAmount) ? 0 : paymentValidation.paidAmount,
      notes: String(formData.get("notes") || "").trim()
    }
  };
}

function openActivityForm(trip, activity = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !activity?.id ? "Aggiungi attivita" : "Modifica attivita",
    content: renderActivityForm({ trip, activity, errors, modeOverride }),
    confirmOnDirty: true
  });
}

function openActivityDeleteConfirmation(activity) {
  openModal({
    title: "Elimina attivita",
    content: `
      <div class="confirm-dialog">
        <p>Vuoi eliminare <strong>${escapeHtml(activity.name || "questa attivita")}</strong> dal dossier?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
          <button class="button button--danger" type="button" data-action="confirm-delete-activity" data-activity-id="${escapeHtml(activity.id)}">Elimina</button>
        </div>
      </div>
    `
  });
}

function handleActivityFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const { errors, values } = validateActivityForm(formData);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const activityId = String(formData.get("activityId") || "");
  const trip = getTripById(tripId);

  if (!trip) {
    closeModal();
    return;
  }

  if (Object.keys(errors).length > 0) {
    openActivityForm(trip, mode === "edit" ? { ...getActivityById(activityId), ...values } : values, errors, mode);
    return;
  }

  if (mode === "edit") {
    updateActivity(activityId, values);
    showToast("Attivita aggiornata.");
  } else {
    createActivity({ ...values, tripId });
    showToast("Attivita aggiunta.");
  }

  closeModal();
  refreshView();
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
  const timelineItems = getTimelineItemsByTripId(trip.id);
  const checklistItems = getChecklistItemsByTripId(trip.id);
  const flights = getFlightsByTripId(trip.id);
  const stays = getStaysByTripId(trip.id);
  const activities = getActivitiesByTripId(trip.id);
  const budget = calculateDossierBudgetSummary(trip, expenses, flights, stays, activities);

  return `
    <section class="page dashboard-page" data-dashboard-trip-id="${escapeHtml(trip.id)}" aria-labelledby="trip-title">
      ${renderDashboardHero({ trip, destinations, duration, countdown, status, statusLabel })}
      ${renderDashboardCountdownStrip({ trip, status, statusLabel, timelineItems, checklistItems, flights, stays })}
      ${renderDashboardBudgetRow(budget, trip.currency || "EUR")}
      ${renderDashboardAccessGrid({ trip, flights, stays, activities, budget, timelineItems, checklistItems, basePath })}
      ${renderQuickRecap({ timelineItems, flights, stays, activities }, basePath)}
    </section>
  `;
}

export function renderFlightsView({ params }) {
  ensureDashboardHandlers();
  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const flights = sortByDateTime(getFlightsByTripId(trip.id), "departureDate", "departureTime");
  const sectionHtml = renderDedicatedDossierSection({
    title: "Voli",
    summary: flights.length === 1 ? "1 volo nel dossier" : `${flights.length} voli nel dossier`,
    tripId: trip.id,
    action: "open-flight-form",
    emptyText: "Nessun volo inserito",
    emptyDescription: "Aggiungi il primo volo",
    itemsHtml: flights.map((flight) => renderFlightCard(flight, trip.currency || "EUR")).join("")
  });

  return renderDedicatedDossierPage({
    trip,
    title: "Voli",
    summary: "Lista completa dei voli del viaggio.",
    sectionHtml
  });
}

export function renderStaysView({ params }) {
  ensureDashboardHandlers();
  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const stays = sortByDateTime(getStaysByTripId(trip.id), "checkInDate");
  const sectionHtml = renderDedicatedDossierSection({
    title: "Soggiorni",
    summary: stays.length === 1 ? "1 soggiorno nel dossier" : `${stays.length} soggiorni nel dossier`,
    tripId: trip.id,
    action: "open-stay-form",
    emptyText: "Nessun soggiorno inserito",
    emptyDescription: "Aggiungi il primo soggiorno",
    itemsHtml: stays.map((stay) => renderStayCard(stay, trip)).join("")
  });

  return renderDedicatedDossierPage({
    trip,
    title: "Soggiorni",
    summary: "Lista completa degli alloggi e soggiorni del viaggio.",
    sectionHtml
  });
}

export function renderActivitiesView({ params }) {
  ensureDashboardHandlers();
  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const activities = sortByDateTime(getActivitiesByTripId(trip.id), "date", "time");
  const sectionHtml = renderDedicatedDossierSection({
    title: "Attivita",
    summary: activities.length === 1 ? "1 attivita nel dossier" : `${activities.length} attivita nel dossier`,
    tripId: trip.id,
    action: "open-activity-form",
    emptyText: "Nessuna attivita inserita",
    emptyDescription: "Aggiungi la prima attivita",
    itemsHtml: activities.map((activity) => renderActivityCard(activity, trip)).join("")
  });

  return renderDedicatedDossierPage({
    trip,
    title: "Attivita",
    summary: "Lista completa delle attivita del viaggio.",
    sectionHtml
  });
}
