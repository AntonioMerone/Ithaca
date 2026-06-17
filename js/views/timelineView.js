import { closeModal, openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import {
  createTimelineItem,
  deleteTimelineItem,
  getTimelineItemById,
  getTimelineItemsByTripId,
  getTripById,
  updateTimelineItem
} from "../storage.js";
import {
  TIMELINE_PAYMENT_STATUSES,
  TIMELINE_TYPES,
  escapeHtml,
  formatCurrency,
  formatDate,
  getNextTimelineItem,
  getTimelinePaymentStatusLabel,
  getTimelineTypeIcon,
  getTimelineTypeLabel,
  groupTimelineItemsByDate,
  sortTimelineItems
} from "../utils.js";

const timelineFilters = new Map();
let timelineHandlersReady = false;

function getFilter(tripId) {
  return timelineFilters.get(tripId) || "all";
}

function setFilter(tripId, type) {
  timelineFilters.set(tripId, type || "all");
}

function refreshView() {
  window.dispatchEvent(new CustomEvent("ithaca:refresh"));
}

function isDateOutsideTrip(date, trip) {
  if (!date || !trip?.startDate || !trip?.endDate) {
    return false;
  }

  return date < trip.startDate || date > trip.endDate;
}

function renderMissingTrip() {
  return `
    <section class="page" aria-labelledby="timeline-missing-title">
      <article class="panel panel--wide error-card">
        <p class="page__eyebrow">Viaggio non trovato</p>
        <h1 class="page__title" id="timeline-missing-title">Timeline non disponibile.</h1>
        <p class="page__summary">Il viaggio richiesto non e presente nei dati locali di Ithaca.</p>
        <a class="action-link" href="#/home">Torna alla Home</a>
      </article>
    </section>
  `;
}

function renderSummary(trip, items) {
  const nextItem = getNextTimelineItem(items);
  const countText = items.length === 1 ? "1 elemento pianificato" : `${items.length} elementi pianificati`;

  return `
    <article class="timeline-summary">
      <div>
        <span>Timeline</span>
        <strong>${items.length ? countText : "Nessuna tappa inserita"}</strong>
      </div>
      <div>
        <span>Prossima attivita</span>
        <strong>${nextItem ? escapeHtml(nextItem.title) : "Nessuna attivita futura"}</strong>
      </div>
      <div>
        <span>Date viaggio</span>
        <strong>${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</strong>
      </div>
    </article>
  `;
}

function renderFilters(tripId, activeType) {
  return `
    <section class="timeline-filters" aria-label="Filtri timeline">
      <button class="segmented-control__button" type="button" data-action="filter-timeline-type" data-trip-id="${escapeHtml(tripId)}" data-filter-value="all" aria-pressed="${activeType === "all"}">Tutti</button>
      ${TIMELINE_TYPES.map((type) => `
        <button class="segmented-control__button" type="button" data-action="filter-timeline-type" data-trip-id="${escapeHtml(tripId)}" data-filter-value="${type}" aria-pressed="${activeType === type}">
          ${getTimelineTypeLabel(type)}
        </button>
      `).join("")}
    </section>
  `;
}

function renderEmptyState() {
  return `
    <article class="empty-state">
      <h2>Nessuna tappa ancora</h2>
      <p>Aggiungi voli, hotel, trasporti e attivita per costruire il dossier del viaggio giorno per giorno.</p>
      <button class="button button--primary" type="button" data-action="open-timeline-form">Aggiungi prima tappa</button>
    </article>
  `;
}

function renderNoFilterResults() {
  return `
    <article class="panel panel--wide">
      <h2 class="panel__title">Nessun risultato</h2>
      <p class="panel__body">Nessuna tappa corrisponde al filtro selezionato.</p>
    </article>
  `;
}

function renderTimelinePayment(item, currency) {
  const hasCost = Number(item.cost || 0) > 0;
  const hasPayment = item.paymentStatus && item.paymentStatus !== "none";

  if (!hasCost && !hasPayment) {
    return "";
  }

  const parts = [];

  if (hasCost) {
    parts.push(formatCurrency(item.cost, currency));
  }

  if (hasPayment) {
    parts.push(getTimelinePaymentStatusLabel(item.paymentStatus));
  }

  return `<p class="timeline-item__payment">${parts.map(escapeHtml).join(" &middot; ")}</p>`;
}

function renderTimelineItem(item, currency) {
  const notes = String(item.notes || "").trim();
  const location = String(item.location || "").trim();

  return `
    <article class="timeline-item-card">
      <div class="timeline-item-card__time">${item.time ? escapeHtml(item.time) : "Senza ora"}</div>
      <div class="timeline-item-card__body">
        <div class="timeline-item-card__header">
          <span class="timeline-type-icon" aria-hidden="true">${getTimelineTypeIcon(item.type)}</span>
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="expense-card__meta">
              <span class="badge">${getTimelineTypeLabel(item.type)}</span>
              ${item.paymentStatus !== "none" ? `<span class="badge ${item.paymentStatus === "paid" ? "badge--success" : "badge--warning"}">${getTimelinePaymentStatusLabel(item.paymentStatus)}</span>` : ""}
            </p>
          </div>
        </div>
        ${location ? `<p class="timeline-item__location">${escapeHtml(location)}</p>` : ""}
        ${renderTimelinePayment(item, currency)}
        ${notes ? `<p class="expense-card__notes">${escapeHtml(notes)}</p>` : ""}
        <div class="trip-card__actions" aria-label="Azioni tappa">
          <button class="button button--small button--ghost" type="button" data-action="edit-timeline-item" data-item-id="${escapeHtml(item.id)}">Modifica</button>
          <button class="button button--small button--danger-ghost" type="button" data-action="delete-timeline-item" data-item-id="${escapeHtml(item.id)}">Elimina</button>
        </div>
      </div>
    </article>
  `;
}

function renderTimelineList(allItems, filteredItems, trip) {
  if (allItems.length === 0) {
    return renderEmptyState();
  }

  if (filteredItems.length === 0) {
    return renderNoFilterResults();
  }

  const groups = groupTimelineItemsByDate(filteredItems);

  return `
    <section class="timeline-list" aria-label="Lista timeline">
      ${Object.entries(groups).map(([date, items]) => `
        <section class="timeline-day" aria-labelledby="timeline-day-${escapeHtml(date)}">
          <h2 class="timeline-day__title" id="timeline-day-${escapeHtml(date)}">${formatDate(date)}</h2>
          <div class="timeline-day__items">
            ${items.map((item) => renderTimelineItem(item, trip.currency || "EUR")).join("")}
          </div>
        </section>
      `).join("")}
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

function renderTimelineForm({ trip, item = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (item?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Aggiungi tappa";
  const showDateWarning = isDateOutsideTrip(item?.date, trip);

  return `
    <form class="trip-form" id="timeline-form" novalidate>
      <input type="hidden" name="mode" value="${mode}">
      <input type="hidden" name="tripId" value="${escapeHtml(trip.id)}">
      <input type="hidden" name="itemId" value="${item?.id ? escapeHtml(item.id) : ""}">
      ${renderErrorList(errors)}

      <div class="form-field">
        <label for="timeline-title-input">Titolo</label>
        <input id="timeline-title-input" name="title" type="text" value="${escapeHtml(item?.title || "")}" autocomplete="off" required>
        ${fieldError(errors, "title")}
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="timeline-type-input">Tipo</label>
          <select id="timeline-type-input" name="type" required>
            ${TIMELINE_TYPES.map((type) => `
              <option value="${type}" ${item?.type === type ? "selected" : ""}>${getTimelineTypeLabel(type)}</option>
            `).join("")}
          </select>
          ${fieldError(errors, "type")}
        </div>

        <div class="form-field">
          <label for="timeline-date-input">Data</label>
          <input id="timeline-date-input" name="date" type="date" value="${escapeHtml(item?.date || "")}" data-trip-start="${escapeHtml(trip.startDate)}" data-trip-end="${escapeHtml(trip.endDate)}" required>
          <p class="field-warning ${showDateWarning ? "" : "is-hidden"}" id="timeline-date-warning">Questa data e fuori dalle date del viaggio.</p>
          ${fieldError(errors, "date")}
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="timeline-time-input">Ora opzionale</label>
          <input id="timeline-time-input" name="time" type="time" value="${escapeHtml(item?.time || "")}">
        </div>

        <div class="form-field">
          <label for="timeline-location-input">Luogo opzionale</label>
          <input id="timeline-location-input" name="location" type="text" value="${escapeHtml(item?.location || "")}" autocomplete="off">
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="timeline-cost-input">Costo opzionale</label>
          <input id="timeline-cost-input" name="cost" type="number" min="0" step="0.01" value="${escapeHtml(item?.cost || "")}">
          ${fieldError(errors, "cost")}
        </div>

        <div class="form-field">
          <label for="timeline-payment-input">Stato pagamento</label>
          <select id="timeline-payment-input" name="paymentStatus" required>
            ${TIMELINE_PAYMENT_STATUSES.map((status) => `
              <option value="${status}" ${item?.paymentStatus === status ? "selected" : ""}>${getTimelinePaymentStatusLabel(status)}</option>
            `).join("")}
          </select>
          ${fieldError(errors, "paymentStatus")}
        </div>
      </div>

      <div class="form-field">
        <label for="timeline-notes-input">Note opzionali</label>
        <textarea id="timeline-notes-input" name="notes" rows="4">${escapeHtml(item?.notes || "")}</textarea>
      </div>

      <div class="form-actions">
        <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
        <button class="button button--primary" type="submit">${submitLabel}</button>
      </div>
    </form>
  `;
}

function validateTimelineForm(formData) {
  const errors = {};
  const title = String(formData.get("title") || "").trim();
  const type = String(formData.get("type") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const time = String(formData.get("time") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const costValue = String(formData.get("cost") || "").trim();
  const paymentStatus = String(formData.get("paymentStatus") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const cost = costValue === "" ? 0 : Number(costValue);

  if (!title) {
    errors.title = "Titolo obbligatorio.";
  }

  if (!TIMELINE_TYPES.includes(type)) {
    errors.type = "Tipo obbligatorio.";
  }

  if (!date) {
    errors.date = "Data obbligatoria.";
  }

  if (costValue !== "" && (!Number.isFinite(cost) || cost < 0)) {
    errors.cost = "Costo deve essere un numero maggiore o uguale a 0.";
  }

  if (!TIMELINE_PAYMENT_STATUSES.includes(paymentStatus)) {
    errors.paymentStatus = "Stato pagamento obbligatorio.";
  }

  return {
    errors,
    values: {
      title,
      type,
      date,
      time,
      location,
      cost,
      paymentStatus,
      notes
    }
  };
}

function openTimelineForm(trip, item = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !item?.id ? "Aggiungi tappa" : "Modifica tappa",
    content: renderTimelineForm({ trip, item, errors, modeOverride })
  });
}

function openDeleteConfirmation(item) {
  openModal({
    title: "Elimina tappa",
    content: `
      <div class="confirm-dialog">
        <p>Vuoi eliminare <strong>${escapeHtml(item.title)}</strong> dalla timeline?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
          <button class="button button--danger" type="button" data-action="confirm-delete-timeline-item" data-item-id="${escapeHtml(item.id)}">Elimina</button>
        </div>
      </div>
    `
  });
}

function handleTimelineClick(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const tripId = actionTarget.dataset.tripId || document.querySelector("[data-timeline-trip-id]")?.dataset.timelineTripId;
  const itemId = actionTarget.dataset.itemId;

  if (action === "open-timeline-form" && tripId) {
    const trip = getTripById(tripId);
    if (trip) openTimelineForm(trip);
  }

  if (action === "edit-timeline-item") {
    const item = getTimelineItemById(itemId);
    const trip = item ? getTripById(item.tripId) : null;
    if (item && trip) openTimelineForm(trip, item);
  }

  if (action === "delete-timeline-item") {
    const item = getTimelineItemById(itemId);
    if (item) openDeleteConfirmation(item);
  }

  if (action === "confirm-delete-timeline-item") {
    deleteTimelineItem(itemId);
    closeModal();
    refreshView();
    showToast("Tappa eliminata.");
  }

  if (action === "filter-timeline-type" && tripId) {
    setFilter(tripId, actionTarget.dataset.filterValue || "all");
    refreshView();
  }

  if (action === "close-modal") {
    closeModal();
  }
}

function handleTimelineChange(event) {
  if (event.target.id !== "timeline-date-input") {
    return;
  }

  const warning = document.querySelector("#timeline-date-warning");
  const value = event.target.value;
  const start = event.target.dataset.tripStart;
  const end = event.target.dataset.tripEnd;
  const isOutside = value && start && end && (value < start || value > end);
  warning?.classList.toggle("is-hidden", !isOutside);
}

function handleTimelineSubmit(event) {
  if (event.target.id !== "timeline-form") {
    return;
  }

  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const { errors, values } = validateTimelineForm(formData);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const itemId = String(formData.get("itemId") || "");
  const trip = getTripById(tripId);

  if (!trip) {
    closeModal();
    return;
  }

  if (Object.keys(errors).length > 0) {
    openTimelineForm(
      trip,
      mode === "edit" ? { ...getTimelineItemById(itemId), ...values } : values,
      errors,
      mode
    );
    return;
  }

  if (mode === "edit") {
    updateTimelineItem(itemId, values);
    showToast("Tappa aggiornata.");
  } else {
    createTimelineItem({ ...values, tripId });
    showToast("Tappa aggiunta.");
  }

  closeModal();
  refreshView();
}

function ensureTimelineHandlers() {
  if (timelineHandlersReady) {
    return;
  }

  document.addEventListener("click", handleTimelineClick);
  document.addEventListener("input", handleTimelineChange);
  document.addEventListener("change", handleTimelineChange);
  document.addEventListener("submit", handleTimelineSubmit);
  timelineHandlersReady = true;
}

export function renderTimelineView({ params }) {
  ensureTimelineHandlers();

  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const items = sortTimelineItems(getTimelineItemsByTripId(trip.id));
  const activeType = getFilter(trip.id);
  const filteredItems = activeType === "all" ? items : items.filter((item) => item.type === activeType);
  const encodedTripId = encodeURIComponent(trip.id);

  return `
    <section class="page timeline-page" data-timeline-trip-id="${escapeHtml(trip.id)}" aria-labelledby="timeline-title">
      <header class="page__header home-hero">
        <div>
          <p class="page__eyebrow">Timeline</p>
          <h1 class="page__title" id="timeline-title">${escapeHtml(trip.name)}</h1>
          <p class="page__summary">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
        </div>
        <a class="button button--ghost" href="#/trip/${encodedTripId}">Torna alla dashboard</a>
      </header>

      ${renderSummary(trip, items)}

      <div class="budget-toolbar">
        <button class="button button--primary" type="button" data-action="open-timeline-form" data-trip-id="${escapeHtml(trip.id)}">Aggiungi tappa</button>
        ${renderFilters(trip.id, activeType)}
      </div>

      ${renderTimelineList(items, filteredItems, trip)}
    </section>
  `;
}
