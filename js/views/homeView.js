import { closeModal, openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { createTrip, deleteTrip, getTripById, getTrips, updateTrip } from "../storage.js";
import {
  calculateCountdown,
  calculateTripDuration,
  escapeHtml,
  formatCurrency,
  formatDate
} from "../utils.js";

const DEFAULT_CURRENCY = "EUR";
let homeHandlersReady = false;

function parseDestinations(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDestinations(destinations) {
  if (!destinations || destinations.length === 0) {
    return "Destinazioni da definire";
  }

  return destinations.map(escapeHtml).join(" &middot; ");
}

function shortNotes(notes) {
  const cleanNotes = String(notes || "").trim();

  if (!cleanNotes) {
    return "";
  }

  return cleanNotes.length > 110 ? `${cleanNotes.slice(0, 107)}...` : cleanNotes;
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

function validateTripForm(formData) {
  const errors = {};
  const name = String(formData.get("name") || "").trim();
  const destinations = parseDestinations(formData.get("destinations"));
  const startDate = String(formData.get("startDate") || "").trim();
  const endDate = String(formData.get("endDate") || "").trim();
  const budgetValue = String(formData.get("budgetTotal") || "").trim();
  const currency = String(formData.get("currency") || "").trim().toUpperCase();
  const notes = String(formData.get("notes") || "").trim();
  const budgetTotal = budgetValue === "" ? "" : Number(budgetValue);

  if (!name) {
    errors.name = "Nome viaggio obbligatorio.";
  }

  if (!startDate) {
    errors.startDate = "Data inizio obbligatoria.";
  }

  if (!endDate) {
    errors.endDate = "Data fine obbligatoria.";
  }

  if (startDate && endDate && endDate < startDate) {
    errors.endDate = "La data fine non puo essere precedente alla data inizio.";
  }

  if (budgetValue === "") {
    errors.budgetTotal = "Budget totale obbligatorio.";
  } else if (!Number.isFinite(budgetTotal) || budgetTotal < 0) {
    errors.budgetTotal = "Budget totale deve essere un numero maggiore o uguale a 0.";
  }

  if (!currency) {
    errors.currency = "Valuta obbligatoria.";
  }

  return {
    errors,
    values: {
      name,
      destinations,
      startDate,
      endDate,
      budgetTotal,
      currency,
      notes
    }
  };
}

function renderTripForm({ trip = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (trip?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Crea viaggio";
  const destinations = trip?.destinations?.join(", ") || "";

  return `
    <form class="trip-form" id="trip-form" novalidate>
      <input type="hidden" name="mode" value="${mode}">
      <input type="hidden" name="tripId" value="${trip?.id ? escapeHtml(trip.id) : ""}">
      ${renderErrorList(errors)}

      <div class="form-field">
        <label for="trip-name">Nome viaggio</label>
        <input id="trip-name" name="name" type="text" value="${escapeHtml(trip?.name || "")}" autocomplete="off" required>
        ${fieldError(errors, "name")}
      </div>

      <div class="form-field">
        <label for="trip-destinations">Destinazioni</label>
        <input id="trip-destinations" name="destinations" type="text" value="${escapeHtml(destinations)}" placeholder="Singapore, Phu Quoc, Bali">
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="trip-start">Data inizio</label>
          <input id="trip-start" name="startDate" type="date" value="${escapeHtml(trip?.startDate || "")}" required>
          ${fieldError(errors, "startDate")}
        </div>

        <div class="form-field">
          <label for="trip-end">Data fine</label>
          <input id="trip-end" name="endDate" type="date" value="${escapeHtml(trip?.endDate || "")}" required>
          ${fieldError(errors, "endDate")}
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="trip-budget">Budget totale</label>
          <input id="trip-budget" name="budgetTotal" type="number" min="0" step="0.01" value="${escapeHtml(trip?.budgetTotal ?? 0)}" required>
          ${fieldError(errors, "budgetTotal")}
        </div>

        <div class="form-field">
          <label for="trip-currency">Valuta</label>
          <input id="trip-currency" name="currency" type="text" maxlength="3" value="${escapeHtml(trip?.currency || DEFAULT_CURRENCY)}" required>
          ${fieldError(errors, "currency")}
        </div>
      </div>

      <div class="form-field">
        <label for="trip-notes">Note generali opzionali</label>
        <textarea id="trip-notes" name="notes" rows="4">${escapeHtml(trip?.notes || "")}</textarea>
      </div>

      <div class="form-actions">
        <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
        <button class="button button--primary" type="submit">${submitLabel}</button>
      </div>
    </form>
  `;
}

function openTripForm(trip = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !trip?.id ? "Nuovo viaggio" : "Modifica viaggio",
    content: renderTripForm({ trip, errors, modeOverride })
  });
}

function openDeleteConfirmation(trip) {
  openModal({
    title: "Elimina viaggio",
    content: `
      <div class="confirm-dialog">
        <p>Vuoi eliminare <strong>${escapeHtml(trip.name)}</strong>? Questa azione rimuove il viaggio salvato in questa app.</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
          <button class="button button--danger" type="button" data-action="confirm-delete" data-trip-id="${escapeHtml(trip.id)}">Elimina</button>
        </div>
      </div>
    `
  });
}

function refreshView() {
  window.dispatchEvent(new CustomEvent("ithaca:refresh"));
}

function handleTripFormSubmit(event) {
  if (event.target.id !== "trip-form") {
    return;
  }

  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const { errors, values } = validateTripForm(formData);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");

  if (Object.keys(errors).length > 0) {
    openTripForm(mode === "edit" ? { ...getTripById(tripId), ...values } : values, errors, mode);
    return;
  }

  if (mode === "edit") {
    updateTrip(tripId, values);
    showToast("Viaggio aggiornato.");
  } else {
    createTrip(values);
    showToast("Viaggio creato.");
  }

  closeModal();
  refreshView();
}

function handleHomeClick(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const tripId = actionTarget.dataset.tripId;

  if (action === "open-trip-form") {
    openTripForm();
  }

  if (action === "edit-trip") {
    const trip = getTripById(tripId);

    if (trip) {
      openTripForm(trip);
    }
  }

  if (action === "delete-trip") {
    const trip = getTripById(tripId);

    if (trip) {
      openDeleteConfirmation(trip);
    }
  }

  if (action === "confirm-delete") {
    deleteTrip(tripId);
    closeModal();
    refreshView();
    showToast("Viaggio eliminato.");
  }

  if (action === "close-modal") {
    closeModal();
  }
}

function ensureHomeHandlers() {
  if (homeHandlersReady) {
    return;
  }

  document.addEventListener("click", handleHomeClick);
  document.addEventListener("submit", handleTripFormSubmit);
  homeHandlersReady = true;
}

function renderEmptyState() {
  return `
    <article class="empty-state">
      <h2>Nessun viaggio ancora</h2>
      <p>Crea il tuo primo dossier di viaggio e tieni sotto controllo budget, tappe e checklist.</p>
      <button class="button button--primary" type="button" data-action="open-trip-form">Crea viaggio</button>
    </article>
  `;
}

function renderTripCard(trip) {
  const duration = calculateTripDuration(trip.startDate, trip.endDate);
  const countdown = calculateCountdown(trip.startDate, trip.endDate);
  const notes = shortNotes(trip.notes);

  return `
    <article class="trip-card">
      <a class="trip-card__main" href="#/trip/${encodeURIComponent(trip.id)}" aria-label="Apri ${escapeHtml(trip.name)}">
        <h2 class="trip-card__title">${escapeHtml(trip.name)}</h2>
        <p class="trip-card__destinations">${formatDestinations(trip.destinations)}</p>
        <p class="trip-card__dates">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
        <p class="trip-card__meta">${duration} giorni &middot; ${escapeHtml(countdown)}</p>
        <p class="trip-card__budget">Budget: ${formatCurrency(trip.budgetTotal, trip.currency)} <span>${escapeHtml(trip.currency)}</span></p>
        ${notes ? `<p class="trip-card__notes">${escapeHtml(notes)}</p>` : ""}
      </a>
      <div class="trip-card__actions" aria-label="Azioni viaggio">
        <button class="button button--small button--ghost" type="button" data-action="edit-trip" data-trip-id="${escapeHtml(trip.id)}">Modifica</button>
        <button class="button button--small button--danger-ghost" type="button" data-action="delete-trip" data-trip-id="${escapeHtml(trip.id)}">Elimina</button>
      </div>
    </article>
  `;
}

function renderTripList(trips) {
  if (trips.length === 0) {
    return renderEmptyState();
  }

  return `
    <section class="trip-list" aria-label="Viaggi salvati">
      ${trips.map(renderTripCard).join("")}
    </section>
  `;
}

export function renderHomeView() {
  ensureHomeHandlers();
  const trips = getTrips();

  return `
    <section class="page" aria-labelledby="home-title">
      <header class="page__header home-hero">
        <div>
          <p class="page__eyebrow">Travel dossier</p>
          <h1 class="page__title" id="home-title">Ithaca</h1>
          <p class="page__summary">Il dossier digitale del tuo viaggio</p>
        </div>
        <button class="button button--primary" type="button" data-action="open-trip-form">Nuovo viaggio</button>
      </header>

      ${renderTripList(trips)}
    </section>
  `;
}
