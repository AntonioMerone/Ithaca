import { closeModal, openModal } from "../components/modal.js";
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
  getNotesByTripId,
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
  FLIGHT_TYPES,
  STAY_TYPES,
  applyTripSeasonTheme,
  calculateChecklistSummary,
  calculateCountdown,
  calculateDossierBudgetSummary,
  calculateTripDuration,
  calcNights,
  clearTripSeasonTheme,
  determineTripStatus,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDestinationRange,
  getActivityTypeLabel,
  getDaysUntilTrip,
  getDossierPaymentStatusBadge,
  getDossierPaymentStatusLabel,
  getFlightTypeLabel,
  getNextTimelineItem,
  getNoteDestinations,
  getNotePreview,
  getOpenChecklistItems,
  getPaymentBreakdown,
  getStayTypeLabel,
  isChecklistItemOverdue,
  normalizeDestinations,
  sortNotes,
  sortTimelineItems
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
  if (!["cost", "paymentStatus"].includes(event.target.name)) {
    return;
  }

  const form = event.target.closest("#flight-form, #stay-form, #activity-form");

  if (form) {
    updateZeroCostWarning(form);
  }
}

function ensureDashboardHandlers() {
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
  const route = [flight.from, flight.to].filter(Boolean).map(escapeHtml).join(" &rarr; ") || "Tratta da completare";
  const flightIdentity = [
    flight.airline,
    flight.flightNumber
  ].filter(Boolean).join(" · ");
  const dateLine = [
    flight.departureDate ? `${formatDate(flight.departureDate)}${flight.departureTime ? ` ${escapeHtml(flight.departureTime)}` : ""}` : "",
    flight.arrivalDate ? `${formatDate(flight.arrivalDate)}${flight.arrivalTime ? ` ${escapeHtml(flight.arrivalTime)}` : ""}` : ""
  ].filter(Boolean).join(" &rarr; ");
  const referenceParts = [
    flightIdentity,
    flight.bookingNumber ? `Prenotazione ${flight.bookingNumber}` : "",
    flight.baggage ? `Bagaglio: ${flight.baggage}` : ""
  ].filter(Boolean);

  return `
    <article class="dossier-card">
      <div class="dossier-card__topline">
        <p class="dossier-card__eyebrow">${escapeHtml(getFlightTypeLabel(flight.type))}</p>
        ${renderDossierPaymentSummary(flight, currency)}
      </div>
      <h3 class="dossier-card__title">${route}</h3>
      ${dateLine ? `<p class="dossier-card__meta">${dateLine}</p>` : ""}
      ${referenceParts.length ? `<p class="dossier-card__meta">${referenceParts.map(escapeHtml).join(" &middot; ")}</p>` : ""}
      ${renderDossierPartialPayment(flight, currency)}
      ${flight.notes ? `<p class="dossier-card__notes">${escapeHtml(flight.notes)}</p>` : ""}
      <div class="trip-card__actions" aria-label="Azioni volo">
        <button class="button button--small button--ghost" type="button" data-action="edit-flight" data-flight-id="${escapeHtml(flight.id)}">Modifica</button>
        <button class="button button--small button--danger-ghost" type="button" data-action="delete-flight" data-flight-id="${escapeHtml(flight.id)}">Elimina</button>
      </div>
    </article>
  `;
}

function renderStayCard(stay, trip) {
  const destinationName = getDestinationName(trip.destinations, stay.destinationId);
  const title = stay.structureName || "Soggiorno da completare";
  const range = [stay.checkInDate ? formatDate(stay.checkInDate) : "", stay.checkOutDate ? formatDate(stay.checkOutDate) : ""].filter(Boolean).join(" &rarr; ");
  const referenceParts = [
    destinationName ? `Destinazione: ${destinationName}` : "",
    `Tipo: ${getStayTypeLabel(stay.structureType)}`,
    stay.bookingNumber ? `Prenotazione ${stay.bookingNumber}` : ""
  ].filter(Boolean);

  return `
    <article class="dossier-card">
      <div class="dossier-card__topline">
        <p class="dossier-card__eyebrow">Soggiorno</p>
        ${renderDossierPaymentSummary(stay, trip.currency || "EUR")}
      </div>
      <h3 class="dossier-card__title">${escapeHtml(title)}</h3>
      ${range ? `<p class="dossier-card__meta">${range}</p>` : ""}
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
    <article class="dossier-card">
      <div class="dossier-card__topline">
        <p class="dossier-card__eyebrow">${escapeHtml(getActivityTypeLabel(activity.type))}</p>
        ${renderDossierPaymentSummary(activity, trip.currency || "EUR")}
      </div>
      <h3 class="dossier-card__title">${escapeHtml(title)}</h3>
      ${dateLine ? `<p class="dossier-card__meta">${dateLine}</p>` : ""}
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

function updateZeroCostWarning(form) {
  const warning = form.querySelector("[data-zero-cost-warning]");

  if (!warning) {
    return;
  }

  warning.hidden = !shouldShowZeroCostWarning(form.elements.cost?.value, form.elements.paymentStatus?.value);
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

  return `
    <form class="trip-form dossier-form" id="flight-form" novalidate>
      <input type="hidden" name="mode" value="${mode}">
      <input type="hidden" name="tripId" value="${escapeHtml(trip.id)}">
      <input type="hidden" name="flightId" value="${flight?.id ? escapeHtml(flight.id) : ""}">
      ${renderErrorList(errors)}

      <div class="form-grid">
        <div class="form-field">
          <label for="flight-type-input">Tipo volo</label>
          <select id="flight-type-input" name="type">${renderOptions(FLIGHT_TYPES, flight?.type || "altro", getFlightTypeLabel)}</select>
        </div>
        <div class="form-field">
          <label for="flight-airline-input">Compagnia aerea</label>
          <input id="flight-airline-input" name="airline" type="text" value="${escapeHtml(flight?.airline || "")}" autocomplete="off">
        </div>
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

      <div class="form-field">
        <label for="flight-paid-amount-input">Importo pagato, se parziale</label>
        <input id="flight-paid-amount-input" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(flight?.paidAmount || "")}">
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
  const errors = {};

  if (Number.isNaN(cost) || cost < 0) {
    errors.cost = "Costo deve essere un numero maggiore o uguale a 0.";
  }

  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    errors.paidAmount = "Importo pagato deve essere un numero maggiore o uguale a 0.";
  }

  return {
    errors,
    values: {
      type: FLIGHT_TYPES.includes(formData.get("type")) ? formData.get("type") : "altro",
      airline: String(formData.get("airline") || "").trim(),
      from: String(formData.get("from") || "").trim(),
      to: String(formData.get("to") || "").trim(),
      departureDate: String(formData.get("departureDate") || "").trim(),
      departureTime: String(formData.get("departureTime") || "").trim(),
      arrivalDate: String(formData.get("arrivalDate") || "").trim(),
      arrivalTime: String(formData.get("arrivalTime") || "").trim(),
      flightNumber: String(formData.get("flightNumber") || "").trim(),
      bookingNumber: String(formData.get("bookingNumber") || "").trim(),
      baggage: String(formData.get("baggage") || "").trim(),
      cost: Number.isNaN(cost) ? 0 : cost,
      paymentStatus: DOSSIER_PAYMENT_STATUSES.includes(formData.get("paymentStatus")) ? formData.get("paymentStatus") : "unpaid",
      paidAmount: Number.isNaN(paidAmount) ? 0 : Math.min(paidAmount, Number.isNaN(cost) ? 0 : cost),
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
      ${renderErrorList(errors)}

      <div class="form-field">
        <label for="stay-destination-input">Destinazione collegata</label>
        <select id="stay-destination-input" name="destinationId">${renderDestinationOptions(trip, stay?.destinationId || "")}</select>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="stay-name-input">Nome struttura</label>
          <input id="stay-name-input" name="structureName" type="text" value="${escapeHtml(stay?.structureName || "")}" autocomplete="off">
        </div>
        <div class="form-field">
          <label for="stay-type-input">Tipo struttura</label>
          <select id="stay-type-input" name="structureType">${renderOptions(STAY_TYPES, stay?.structureType || "altro", getStayTypeLabel)}</select>
        </div>
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

      <div class="form-field">
        <label for="stay-paid-amount-input">Importo pagato, se parziale</label>
        <input id="stay-paid-amount-input" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(stay?.paidAmount || "")}">
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
  const errors = {};
  const checkInDate = String(formData.get("checkInDate") || "").trim();
  const checkOutDate = String(formData.get("checkOutDate") || "").trim();

  if (Number.isNaN(cost) || cost < 0) {
    errors.cost = "Costo deve essere un numero maggiore o uguale a 0.";
  }

  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    errors.paidAmount = "Importo pagato deve essere un numero maggiore o uguale a 0.";
  }

  if (checkInDate && checkOutDate && checkOutDate < checkInDate) {
    errors.checkOutDate = "Il check-out non puo precedere il check-in.";
  }

  return {
    errors,
    values: {
      destinationId: String(formData.get("destinationId") || "").trim(),
      structureName: String(formData.get("structureName") || "").trim(),
      structureType: STAY_TYPES.includes(formData.get("structureType")) ? formData.get("structureType") : "altro",
      checkInDate,
      checkOutDate,
      bookingNumber: String(formData.get("bookingNumber") || "").trim(),
      cost: Number.isNaN(cost) ? 0 : cost,
      paymentStatus: DOSSIER_PAYMENT_STATUSES.includes(formData.get("paymentStatus")) ? formData.get("paymentStatus") : "unpaid",
      paidAmount: Number.isNaN(paidAmount) ? 0 : Math.min(paidAmount, Number.isNaN(cost) ? 0 : cost),
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

      <div class="form-field">
        <label for="activity-paid-amount-input">Importo pagato, se parziale</label>
        <input id="activity-paid-amount-input" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(activity?.paidAmount || "")}">
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
  const errors = {};

  if (Number.isNaN(cost) || cost < 0) {
    errors.cost = "Costo deve essere un numero maggiore o uguale a 0.";
  }

  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    errors.paidAmount = "Importo pagato deve essere un numero maggiore o uguale a 0.";
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
      paymentStatus: DOSSIER_PAYMENT_STATUSES.includes(formData.get("paymentStatus")) ? formData.get("paymentStatus") : "unpaid",
      paidAmount: Number.isNaN(paidAmount) ? 0 : Math.min(paidAmount, Number.isNaN(cost) ? 0 : cost),
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
    clearTripSeasonTheme();
    return renderMissingTrip();
  }

  applyTripSeasonTheme(trip.startDate);

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
  const notes = getNotesByTripId(trip.id);
  const flights = getFlightsByTripId(trip.id);
  const stays = getStaysByTripId(trip.id);
  const activities = getActivitiesByTripId(trip.id);
  const budget = calculateDossierBudgetSummary(trip, expenses, flights, stays, activities);

  return `
    <section class="page dashboard-page" data-dashboard-trip-id="${escapeHtml(trip.id)}" aria-labelledby="trip-title">
      <header class="dashboard-hero">
        <div>
          <p class="dashboard-hero__label">Dashboard viaggio</p>
          <h1 class="page__title" id="trip-title">${escapeHtml(trip.name)}</h1>
          <p class="page__summary">${destinations}</p>
          <div class="dashboard-hero__meta">
            <span>${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</span>
            <span>${duration} giorni</span>
            <span>${escapeHtml(countdown)}</span>
            <span>${escapeHtml(statusLabel)}</span>
          </div>
          <p class="dashboard-hero__message">${getHeroMessage(status)}</p>
          ${renderTripNotes(trip.notes)}
        </div>
        <div class="dashboard-hero__budget">
          <div class="metric-list">
            ${renderMetric("Totale viaggio", formatCurrency(budget.plannedTotal, trip.currency))}
            ${renderMetric("Gia pagato", formatCurrency(budget.paidTotal, trip.currency))}
            ${renderMetric("Da pagare", formatCurrency(budget.unpaidTotal, trip.currency))}
          </div>
          <button class="button button--ghost button--small" type="button" data-action="edit-dashboard-trip" data-trip-id="${escapeHtml(trip.id)}">Modifica viaggio</button>
        </div>
      </header>

      ${renderDestinationsSection(normalizedDestinations, trip.currency)}
      ${renderDossierSections(trip, flights, stays, activities)}
      ${renderDossierRecap({ timelineItems, flights, stays, activities })}

      <section class="dashboard-grid" aria-label="Widget principali">
        <article class="dashboard-widget dashboard-widget--accent">
          <p class="dashboard-widget__label">Partenza</p>
          <p class="dashboard-widget__number">${escapeHtml(getCountdownNumber(status, trip.startDate))}</p>
          <p class="dashboard-widget__body">${escapeHtml(getCountdownCaption(status))}</p>
          <span class="status-pill">${escapeHtml(statusLabel)}</span>
        </article>

        <article class="dashboard-widget">
          <p class="dashboard-widget__label">Budget</p>
          <h2 class="dashboard-widget__title">Totale viaggio</h2>
          <p class="dashboard-widget__body">Registro spese e pagamenti del viaggio.</p>
          <div class="metric-list">
            ${renderMetric("Totale viaggio", formatCurrency(budget.plannedTotal, trip.currency))}
            ${renderMetric("Gia pagato", formatCurrency(budget.paidTotal, trip.currency))}
            ${renderMetric("Da pagare", formatCurrency(budget.unpaidTotal, trip.currency))}
          </div>
          <a class="button button--ghost button--small" href="${basePath}/budget">Apri budget &rarr;</a>
        </article>

        ${renderTimelineWidget(timelineItems, basePath)}

        ${renderChecklistWidget(checklistItems, basePath)}

        ${renderNotesWidget(notes, basePath)}
      </section>
    </section>
  `;
}
