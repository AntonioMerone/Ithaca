import { closeModal, markModalDirty, openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import {
  createBackupPayload,
  createFlight,
  createTrip,
  deleteTrip,
  getBackupFileName,
  getActivitiesByTripId,
  getExpensesByTripId,
  getFlightsByTripId,
  getStaysByTripId,
  getTripById,
  getTrips,
  importBackupPayload,
  resetAppData,
  updateTrip
} from "../storage.js";
import {
  calculateDossierBudgetSummary,
  calculateCountdown,
  calculateTripDuration,
  DOSSIER_PAYMENT_STATUSES,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDestinationRange,
  generateId,
  getDossierPaymentStatusLabel,
  normalizeDestinations,
  validatePaymentAllocation
} from "../utils.js";

const DEFAULT_CURRENCY = "EUR";
const SUPPORTED_CURRENCIES = [
  ["EUR", "EUR - Euro (€)"],
  ["USD", "USD - Dollaro USA ($)"]
];
let homeHandlersReady = false;
let pendingImportText = "";

function createBlankDestination() {
  return {
    id: generateId("dest"),
    name: "",
    arrivalDate: "",
    departureDate: "",
    hotel: "",
    hotelCheckIn: "",
    hotelCheckOut: "",
    budgetEstimate: null,
    notes: ""
  };
}

function createBlankInitialFlight() {
  return {
    id: generateId("flight_draft"),
    type: "altro",
    from: "",
    to: "",
    departureDate: "",
    departureTime: "",
    arrivalDate: "",
    arrivalTime: "",
    bookingNumber: "",
    baggage: "",
    cost: "",
    paymentStatus: "unpaid",
    paidAmount: "",
    stopover: {
      location: "",
      date: "",
      time: ""
    },
    notes: ""
  };
}

function normalizeDestinationForForm(destination) {
  return {
    ...createBlankDestination(),
    ...(destination && typeof destination === "object" ? destination : {}),
    name: typeof destination === "string" ? destination : destination?.name || "",
    budgetEstimate: destination?.budgetEstimate ?? ""
  };
}

function getDestinationsForForm(trip) {
  const rawDestinations = Array.isArray(trip?.destinations) ? trip.destinations : [];
  const hasBlankDraft = rawDestinations.some((destination) => {
    return destination && typeof destination === "object" && !String(destination.name || "").trim();
  });
  const normalized = hasBlankDraft
    ? rawDestinations.map(normalizeDestinationForForm)
    : normalizeDestinations(rawDestinations, trip);

  return normalized.length > 0 ? normalized.map(normalizeDestinationForForm) : [createBlankDestination()];
}

function formatDestinations(destinations = []) {
  const normalized = normalizeDestinations(destinations);

  if (normalized.length === 0) {
    return "Nessuna destinazione inserita";
  }

  if (normalized.length > 3) {
    return `${normalized.slice(0, 3).map((destination) => escapeHtml(destination.name)).join(" &rarr; ")} &rarr; +${normalized.length - 3}`;
  }

  return normalized.map((destination) => escapeHtml(destination.name)).join(" &rarr; ");
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

function getExistingDestinationsById(trip) {
  return new Map(
    normalizeDestinations(trip?.destinations || [], trip)
      .map((destination) => [destination.id, destination])
  );
}

function parseDestinationsFromForm(formData, trip = null) {
  const ids = formData.getAll("destinationId");
  const names = formData.getAll("destinationName");
  const arrivalDates = formData.getAll("destinationArrivalDate");
  const departureDates = formData.getAll("destinationDepartureDate");
  const existingDestinations = getExistingDestinationsById(trip);

  return ids.map((id, index) => {
    const destinationId = String(id || generateId("dest"));
    const existingDestination = existingDestinations.get(destinationId) || createBlankDestination();

    return {
      ...existingDestination,
      id: destinationId,
      name: String(names[index] || "").trim(),
      arrivalDate: String(arrivalDates[index] || "").trim(),
      departureDate: String(departureDates[index] || "").trim()
    };
  });
}

function parseOptionalCost(value) {
  const rawValue = String(value ?? "").trim();

  return rawValue === "" ? 0 : Number(rawValue);
}

function getInitialFlightsForForm(trip, mode = "create") {
  if (mode !== "create") {
    return [];
  }

  return Array.isArray(trip?.initialFlights)
    ? trip.initialFlights.map((flight) => ({
      ...createBlankInitialFlight(),
      ...(flight && typeof flight === "object" ? flight : {}),
      stopover: {
        ...createBlankInitialFlight().stopover,
        ...(flight?.stopover && typeof flight.stopover === "object" ? flight.stopover : {})
      }
    }))
    : [];
}

function parseInitialFlightsFromForm(formData) {
  const ids = formData.getAll("initialFlightId");
  const fromValues = formData.getAll("initialFlightFrom");
  const toValues = formData.getAll("initialFlightTo");
  const departureDates = formData.getAll("initialFlightDepartureDate");
  const departureTimes = formData.getAll("initialFlightDepartureTime");
  const arrivalDates = formData.getAll("initialFlightArrivalDate");
  const arrivalTimes = formData.getAll("initialFlightArrivalTime");
  const bookingNumbers = formData.getAll("initialFlightBookingNumber");
  const baggageValues = formData.getAll("initialFlightBaggage");
  const costs = formData.getAll("initialFlightCost");
  const paymentStatuses = formData.getAll("initialFlightPaymentStatus");
  const paidAmounts = formData.getAll("initialFlightPaidAmount");
  const stopoverEnabledValues = new Set(formData.getAll("initialFlightStopoverEnabled").map(String));
  const stopoverLocations = formData.getAll("initialFlightStopoverLocation");
  const stopoverDates = formData.getAll("initialFlightStopoverDate");
  const stopoverTimes = formData.getAll("initialFlightStopoverTime");
  const notesValues = formData.getAll("initialFlightNotes");

  return ids.map((id, index) => {
    const draftId = String(id || generateId("flight_draft"));
    const hasStopover = stopoverEnabledValues.has(draftId);

    return {
      id: draftId,
      type: "altro",
      from: String(fromValues[index] || "").trim(),
      to: String(toValues[index] || "").trim(),
      departureDate: String(departureDates[index] || "").trim(),
      departureTime: String(departureTimes[index] || "").trim(),
      arrivalDate: String(arrivalDates[index] || "").trim(),
      arrivalTime: String(arrivalTimes[index] || "").trim(),
      bookingNumber: String(bookingNumbers[index] || "").trim(),
      baggage: String(baggageValues[index] || "").trim(),
      cost: String(costs[index] || "").trim(),
      paymentStatus: DOSSIER_PAYMENT_STATUSES.includes(paymentStatuses[index]) ? paymentStatuses[index] : "unpaid",
      paidAmount: String(paidAmounts[index] || "").trim(),
      stopover: hasStopover
        ? {
          location: String(stopoverLocations[index] || "").trim(),
          date: String(stopoverDates[index] || "").trim(),
          time: String(stopoverTimes[index] || "").trim()
        }
        : {
          location: "",
          date: "",
          time: ""
        },
      notes: String(notesValues[index] || "").trim()
    };
  });
}

function destinationHasAnyValue(destination) {
  return [
    destination.name,
    destination.arrivalDate,
    destination.departureDate
  ].some((value) => String(value ?? "").trim());
}

function initialFlightHasAnyValue(flight) {
  return [
    flight.from,
    flight.to,
    flight.departureDate,
    flight.departureTime,
    flight.arrivalDate,
    flight.arrivalTime,
    flight.bookingNumber,
    flight.baggage,
    flight.cost,
    flight.paymentStatus !== "unpaid" ? flight.paymentStatus : "",
    flight.paidAmount,
    flight.stopover?.location,
    flight.stopover?.date,
    flight.stopover?.time,
    flight.notes
  ].some((value) => String(value ?? "").trim());
}

function validateTripForm(formData, trip = null) {
  const errors = {};
  const mode = String(formData.get("mode") || "create");
  const name = String(formData.get("name") || "").trim();
  const destinationDrafts = parseDestinationsFromForm(formData, trip);
  const destinations = destinationDrafts.filter(destinationHasAnyValue);
  const initialFlightDrafts = mode === "create" ? parseInitialFlightsFromForm(formData) : [];
  const initialFlights = initialFlightDrafts.filter(initialFlightHasAnyValue);
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

  if (!SUPPORTED_CURRENCIES.some(([value]) => value === currency)) {
    errors.currency = "Valuta obbligatoria.";
  }

  destinations.forEach((destination, index) => {
    if (!destination.name) {
      errors[`destination_${index}_name`] = `Nome destinazione ${index + 1} obbligatorio.`;
    }

    if (destination.arrivalDate && destination.departureDate && destination.departureDate < destination.arrivalDate) {
      errors[`destination_${index}_dates`] = `La partenza della destinazione ${index + 1} non puo precedere l'arrivo.`;
    }
  });

  initialFlightDrafts.forEach((flight, index) => {
    if (!initialFlightHasAnyValue(flight)) {
      return;
    }

    const cost = parseOptionalCost(flight.cost);
    const paidAmount = parseOptionalCost(flight.paidAmount);

    if (!Number.isFinite(cost) || cost < 0) {
      errors[`initialFlight_${index}_cost`] = `Costo volo ${index + 1} deve essere un numero maggiore o uguale a 0.`;
    }

    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      errors[`initialFlight_${index}_paidAmount`] = `Importo pagato volo ${index + 1} deve essere un numero maggiore o uguale a 0.`;
    }

    const paymentValidation = validatePaymentAllocation({
      totalAmount: Number.isFinite(cost) ? cost : 0,
      paymentStatus: flight.paymentStatus,
      paidAmount: Number.isFinite(paidAmount) ? paidAmount : 0
    });

    if (!errors[`initialFlight_${index}_paidAmount`] && paymentValidation.error) {
      errors[`initialFlight_${index}_paidAmount`] = paymentValidation.error;
    }
  });

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
    },
    initialFlightDrafts,
    initialFlights
  };
}

function collectTripFormDraft(form) {
  const formData = new FormData(form);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const currentTrip = mode === "edit" ? getTripById(tripId) : null;
  const { values, initialFlightDrafts } = validateTripForm(formData, currentTrip);

  return {
    ...values,
    id: tripId,
    destinations: parseDestinationsFromForm(formData, currentTrip),
    initialFlights: initialFlightDrafts,
    mode
  };
}

function renderDestinationFields(destination, index, count, errors) {
  const range = formatDestinationRange(destination.arrivalDate, destination.departureDate);
  const destinationName = String(destination.name || "").trim();
  const label = [
    `Destinazione ${index + 1}`,
    destinationName,
    range
  ].filter(Boolean).map(escapeHtml).join(" &middot; ");

  return `
    <article class="destination-form-card">
      <div class="destination-form-card__header">
        <h3>${label}</h3>
        <div class="destination-form-card__actions">
          <button class="button button--small button--ghost" type="button" data-action="move-destination-up" data-destination-index="${index}" ${index === 0 ? "disabled" : ""}>Su</button>
          <button class="button button--small button--ghost" type="button" data-action="move-destination-down" data-destination-index="${index}" ${index === count - 1 ? "disabled" : ""}>Giu</button>
          <button class="button button--small button--danger-ghost" type="button" data-action="remove-destination" data-destination-index="${index}">Rimuovi</button>
        </div>
      </div>

      <input type="hidden" name="destinationId" value="${escapeHtml(destination.id || generateId("dest"))}">

      <div class="form-field">
        <label for="destination-name-${index}">Nome destinazione *</label>
        <input id="destination-name-${index}" name="destinationName" type="text" value="${escapeHtml(destination.name || "")}" autocomplete="off">
        ${fieldError(errors, `destination_${index}_name`)}
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="destination-arrival-${index}">Arrivo</label>
          <input id="destination-arrival-${index}" name="destinationArrivalDate" type="date" value="${escapeHtml(destination.arrivalDate || "")}">
        </div>
        <div class="form-field">
          <label for="destination-departure-${index}">Partenza</label>
          <input id="destination-departure-${index}" name="destinationDepartureDate" type="date" value="${escapeHtml(destination.departureDate || "")}">
          ${fieldError(errors, `destination_${index}_dates`)}
        </div>
      </div>
    </article>
  `;
}

function renderDestinationsFormSection(trip, errors) {
  const destinations = getDestinationsForForm(trip);

  return `
    <section class="destinations-form" aria-labelledby="destinations-form-title">
      <div class="destinations-form__header">
        <div>
          <h2 id="destinations-form-title">Destinazioni del viaggio</h2>
          <p>Aggiungi le fasi principali del viaggio. Solo il nome e obbligatorio.</p>
        </div>
        <button class="button button--ghost button--small" type="button" data-action="add-destination">+ Aggiungi destinazione</button>
      </div>

      <div class="destinations-form__list">
        ${destinations.map((destination, index) => renderDestinationFields(destination, index, destinations.length, errors)).join("")}
      </div>
    </section>
  `;
}

function renderPaymentOptions(selectedValue = "unpaid") {
  return DOSSIER_PAYMENT_STATUSES.map((status) => `
    <option value="${status}" ${selectedValue === status ? "selected" : ""}>${getDossierPaymentStatusLabel(status)}</option>
  `).join("");
}

function isPaidAmountVisible(paymentStatus) {
  return paymentStatus === "partial";
}

function getPaidAmountFieldValue(paymentStatus, costValue, paidAmount) {
  if (paymentStatus === "paid") {
    return costValue || "";
  }

  if (paymentStatus === "unpaid") {
    return "";
  }

  return paidAmount || "";
}

function renderInitialFlightFields(flight, index, errors) {
  const draft = {
    ...createBlankInitialFlight(),
    ...(flight && typeof flight === "object" ? flight : {})
  };
  const stopover = draft.stopover && typeof draft.stopover === "object" ? draft.stopover : {};
  const hasStopover = Boolean(stopover.location || stopover.date || stopover.time);
  const paymentStatus = DOSSIER_PAYMENT_STATUSES.includes(draft.paymentStatus) ? draft.paymentStatus : "unpaid";
  const paidAmountVisible = isPaidAmountVisible(paymentStatus);

  return `
    <article class="destination-form-card initial-flight-card" data-initial-flight-index="${index}">
      <div class="destination-form-card__header">
        <h3>Volo ${index + 1}</h3>
        <div class="destination-form-card__actions">
          <button class="button button--small button--danger-ghost" type="button" data-action="remove-initial-flight" data-initial-flight-index="${index}">Rimuovi</button>
        </div>
      </div>

      <input type="hidden" name="initialFlightId" value="${escapeHtml(draft.id || generateId("flight_draft"))}">

      <div class="form-grid">
        <div class="form-field">
          <label for="initial-flight-from-${index}">Da</label>
          <input id="initial-flight-from-${index}" name="initialFlightFrom" type="text" value="${escapeHtml(draft.from || "")}" autocomplete="off">
        </div>
        <div class="form-field">
          <label for="initial-flight-to-${index}">A</label>
          <input id="initial-flight-to-${index}" name="initialFlightTo" type="text" value="${escapeHtml(draft.to || "")}" autocomplete="off">
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="initial-flight-departure-date-${index}">Data partenza</label>
          <input id="initial-flight-departure-date-${index}" name="initialFlightDepartureDate" type="date" value="${escapeHtml(draft.departureDate || "")}">
        </div>
        <div class="form-field">
          <label for="initial-flight-departure-time-${index}">Ora partenza</label>
          <input id="initial-flight-departure-time-${index}" name="initialFlightDepartureTime" type="time" value="${escapeHtml(draft.departureTime || "")}">
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="initial-flight-arrival-date-${index}">Data arrivo</label>
          <input id="initial-flight-arrival-date-${index}" name="initialFlightArrivalDate" type="date" value="${escapeHtml(draft.arrivalDate || "")}">
        </div>
        <div class="form-field">
          <label for="initial-flight-arrival-time-${index}">Ora arrivo</label>
          <input id="initial-flight-arrival-time-${index}" name="initialFlightArrivalTime" type="time" value="${escapeHtml(draft.arrivalTime || "")}">
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="initial-flight-booking-${index}">Numero prenotazione</label>
          <input id="initial-flight-booking-${index}" name="initialFlightBookingNumber" type="text" value="${escapeHtml(draft.bookingNumber || "")}" autocomplete="off">
        </div>
        <div class="form-field">
          <label for="initial-flight-baggage-${index}">Bagaglio</label>
          <input id="initial-flight-baggage-${index}" name="initialFlightBaggage" type="text" value="${escapeHtml(draft.baggage || "")}" autocomplete="off">
        </div>
      </div>

      <div class="form-field">
        <label class="checkbox-row" for="initial-flight-stopover-enabled-${index}">
          <input id="initial-flight-stopover-enabled-${index}" name="initialFlightStopoverEnabled" type="checkbox" value="${escapeHtml(draft.id)}" ${hasStopover ? "checked" : ""}>
          <span>Questo volo ha uno scalo</span>
        </label>
      </div>

      <div data-stopover-fields ${hasStopover ? "" : "hidden"}>
        <div class="form-field">
          <label for="initial-flight-stopover-location-${index}">Scalo</label>
          <input id="initial-flight-stopover-location-${index}" name="initialFlightStopoverLocation" type="text" value="${escapeHtml(stopover.location || "")}" autocomplete="off">
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="initial-flight-stopover-date-${index}">Data scalo</label>
            <input id="initial-flight-stopover-date-${index}" name="initialFlightStopoverDate" type="date" value="${escapeHtml(stopover.date || "")}">
          </div>
          <div class="form-field">
            <label for="initial-flight-stopover-time-${index}">Ora scalo</label>
            <input id="initial-flight-stopover-time-${index}" name="initialFlightStopoverTime" type="time" value="${escapeHtml(stopover.time || "")}">
          </div>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="initial-flight-cost-${index}">Costo</label>
          <input id="initial-flight-cost-${index}" name="initialFlightCost" type="number" min="0" step="0.01" value="${escapeHtml(draft.cost ?? "")}">
          ${fieldError(errors, `initialFlight_${index}_cost`)}
        </div>
        <div class="form-field">
          <label for="initial-flight-payment-${index}">Stato pagamento</label>
          <select id="initial-flight-payment-${index}" name="initialFlightPaymentStatus">${renderPaymentOptions(paymentStatus)}</select>
        </div>
      </div>

      <div class="form-field" data-paid-amount-field ${paidAmountVisible ? "" : "hidden"}>
        <label for="initial-flight-paid-${index}">Importo pagato</label>
        <input id="initial-flight-paid-${index}" name="initialFlightPaidAmount" type="number" min="0" step="0.01" value="${escapeHtml(getPaidAmountFieldValue(paymentStatus, draft.cost ?? "", draft.paidAmount))}">
        ${fieldError(errors, `initialFlight_${index}_paidAmount`)}
      </div>

      <div class="form-field">
        <label for="initial-flight-notes-${index}">Note</label>
        <textarea id="initial-flight-notes-${index}" name="initialFlightNotes" rows="3">${escapeHtml(draft.notes || "")}</textarea>
      </div>
    </article>
  `;
}

function renderInitialFlightsFormSection(trip, errors, mode) {
  if (mode !== "create") {
    return "";
  }

  const flights = getInitialFlightsForForm(trip, mode);

  return `
    <section class="destinations-form initial-flights-form" aria-labelledby="initial-flights-form-title">
      <div class="destinations-form__header">
        <div>
          <h2 id="initial-flights-form-title">Voli iniziali</h2>
          <p>Aggiungi subito i voli principali del viaggio. Puoi farlo anche dopo dal dossier.</p>
        </div>
        <button class="button button--ghost button--small" type="button" data-action="add-initial-flight">+ Aggiungi volo</button>
      </div>

      ${flights.length > 0 ? `
        <div class="destinations-form__list">
          ${flights.map((flight, index) => renderInitialFlightFields(flight, index, errors)).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderTripForm({ trip = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (trip?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Crea viaggio";
  const selectedCurrency = SUPPORTED_CURRENCIES.some(([value]) => value === String(trip?.currency || "").toUpperCase())
    ? String(trip?.currency || "").toUpperCase()
    : DEFAULT_CURRENCY;

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

      ${renderDestinationsFormSection(trip, errors)}

      ${renderInitialFlightsFormSection(trip, errors, mode)}

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
          <select id="trip-currency" name="currency" required>
            ${SUPPORTED_CURRENCIES.map(([value, label]) => `
              <option value="${value}" ${selectedCurrency === value ? "selected" : ""}>${label}</option>
            `).join("")}
          </select>
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

export function openTripForm(trip = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !trip?.id ? "Nuovo viaggio" : "Modifica viaggio",
    content: renderTripForm({ trip, errors, modeOverride }),
    confirmOnDirty: true
  });
}

function replaceOpenTripForm(trip = null, errors = {}, modeOverride = null) {
  const modalBody = document.querySelector("#modal-root .modal__body");

  if (!modalBody) {
    openTripForm(trip, errors, modeOverride);
    return;
  }

  modalBody.innerHTML = renderTripForm({ trip, errors, modeOverride });
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

function downloadBackupJson() {
  try {
    const payload = createBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getBackupFileName();
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("Copia salvata.");
  } catch {
    showToast("Salvataggio copia non riuscito. Riprova.");
  }
}

function renderDataManagementContent(error = "") {
  return `
    <div class="data-management">
      ${error ? `<div class="form-errors" role="alert"><p>${escapeHtml(error)}</p></div>` : ""}
      <div class="data-card-grid">
        <button class="data-card" type="button" data-action="export-backup">
          <span class="data-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"/></svg></span>
          <span><strong>Salva una copia</strong><small>Esporta tutti i dati come file JSON.</small></span>
        </button>
        <button class="data-card" type="button" data-action="choose-import-file">
          <span class="data-card__icon data-card__icon--amber" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21V9m0 0 4 4m-4-4-4 4M5 5h14"/></svg></span>
          <span><strong>Ripristina una copia</strong><small>Importa un backup JSON salvato in precedenza.</small></span>
        </button>
        <button class="data-card" type="button" data-action="open-reset-confirmation">
          <span class="data-card__icon data-card__icon--coral" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg></span>
          <span><strong>Cancella tutto</strong><small>Rimuove tutti i dati dall'app. Irreversibile.</small></span>
        </button>
        <article class="data-card data-card--static">
          <span class="data-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z"/></svg></span>
          <span><strong>I tuoi dati</strong><small>Ithaca salva tutto nel browser, solo sul tuo dispositivo. Nessun account, nessun server.</small></span>
        </article>
      </div>

      <input class="visually-hidden" id="backup-file-input" type="file" accept="application/json,.json" data-action="import-backup-file">
    </div>
  `;
}

function openDataManagementModal(error = "") {
  openModal({
    title: "Gestione dati",
    content: renderDataManagementContent(error)
  });
}

function openImportConfirmation() {
  openModal({
    title: "Ripristina una copia",
    content: `
      <div class="confirm-dialog">
        <p>L'import sostituira i dati attuali di Ithaca. Vuoi continuare?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="open-data-management">Annulla</button>
          <button class="button button--primary" type="button" data-action="confirm-import-backup">Importa</button>
        </div>
      </div>
    `
  });
}

function openResetConfirmation() {
  openModal({
    title: "Cancella dati",
    content: `
      <div class="confirm-dialog">
        <p>Questa azione cancellera tutti i viaggi e i dati salvati in Ithaca. Continuare?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="open-data-management">Annulla</button>
          <button class="button button--danger" type="button" data-action="confirm-reset-data">Cancella dati</button>
        </div>
      </div>
    `
  });
}

function readImportFile(file) {
  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.addEventListener("load", () => {
    pendingImportText = String(reader.result || "");
    openImportConfirmation();
  });

  reader.addEventListener("error", () => {
    openDataManagementModal("Non e stato possibile leggere il file selezionato.");
  });

  reader.readAsText(file);
}

function refreshView() {
  window.dispatchEvent(new CustomEvent("ithaca:refresh"));
}

function updateDestinationsInOpenForm(actionTarget) {
  const form = actionTarget.closest("form");

  if (!form || form.id !== "trip-form") {
    return;
  }

  markModalDirty();

  const draft = collectTripFormDraft(form);
  const destinations = draft.destinations.length > 0 ? draft.destinations : [createBlankDestination()];
  const index = Number(actionTarget.dataset.destinationIndex || -1);

  if (actionTarget.dataset.action === "add-destination") {
    destinations.push(createBlankDestination());
  }

  if (actionTarget.dataset.action === "remove-destination" && index >= 0) {
    destinations.splice(index, 1);
  }

  if (actionTarget.dataset.action === "move-destination-up" && index > 0) {
    [destinations[index - 1], destinations[index]] = [destinations[index], destinations[index - 1]];
  }

  if (actionTarget.dataset.action === "move-destination-down" && index >= 0 && index < destinations.length - 1) {
    [destinations[index + 1], destinations[index]] = [destinations[index], destinations[index + 1]];
  }

  replaceOpenTripForm({
    ...draft,
    destinations: destinations.length > 0 ? destinations : [createBlankDestination()]
  }, {}, draft.mode);
}

function updateInitialFlightsInOpenForm(actionTarget) {
  const form = actionTarget.closest("form");

  if (!form || form.id !== "trip-form") {
    return;
  }

  markModalDirty();

  const draft = collectTripFormDraft(form);
  const initialFlights = Array.isArray(draft.initialFlights) ? [...draft.initialFlights] : [];
  const index = Number(actionTarget.dataset.initialFlightIndex || -1);

  if (actionTarget.dataset.action === "add-initial-flight") {
    initialFlights.push(createBlankInitialFlight());
  }

  if (actionTarget.dataset.action === "remove-initial-flight" && index >= 0) {
    initialFlights.splice(index, 1);
  }

  replaceOpenTripForm({
    ...draft,
    initialFlights
  }, {}, draft.mode);
}

function updateInitialFlightStopoverFields(input) {
  const card = input.closest(".initial-flight-card");
  const fields = card?.querySelector("[data-stopover-fields]");

  if (!fields) {
    return;
  }

  fields.hidden = !input.checked;

  if (!input.checked) {
    fields.querySelectorAll("input").forEach((field) => {
      field.value = "";
    });
  }
}

function updateInitialFlightPaymentField(input) {
  const card = input.closest(".initial-flight-card");
  const field = card?.querySelector("[data-paid-amount-field]");
  const paidInput = field?.querySelector("input");
  const costInput = card?.querySelector('[name="initialFlightCost"]');
  const paymentSelect = card?.querySelector('[name="initialFlightPaymentStatus"]');
  const paymentStatus = paymentSelect?.value || "unpaid";

  if (!field || !paidInput) {
    return;
  }

  const isPartial = paymentStatus === "partial";
  field.hidden = !isPartial;

  if (paymentStatus === "unpaid") {
    paidInput.value = "";
  }

  if (paymentStatus === "paid") {
    paidInput.value = costInput?.value || "";
  }

  if (input.name === "initialFlightCost" && paymentStatus === "paid") {
    paidInput.value = input.value;
  }
}

function handleTripFormSubmit(event) {
  if (event.target.id !== "trip-form") {
    return;
  }

  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const currentTrip = mode === "edit" ? getTripById(tripId) : null;
  const { errors, values, initialFlightDrafts, initialFlights } = validateTripForm(formData, currentTrip);

  if (Object.keys(errors).length > 0) {
    openTripForm(mode === "edit" ? { ...getTripById(tripId), ...values } : { ...values, initialFlights: initialFlightDrafts }, errors, mode);
    return;
  }

  if (mode === "edit") {
    updateTrip(tripId, values);
    showToast("Viaggio aggiornato.");
  } else {
    const trip = createTrip(values);
    initialFlights.forEach((flight) => {
      const cost = parseOptionalCost(flight.cost);
      const paidAmount = parseOptionalCost(flight.paidAmount);
      const paymentValidation = validatePaymentAllocation({
        totalAmount: Number.isFinite(cost) ? cost : 0,
        paymentStatus: flight.paymentStatus,
        paidAmount: Number.isFinite(paidAmount) ? paidAmount : 0
      });

      createFlight({
        type: "altro",
        tripId: trip.id,
        from: flight.from,
        to: flight.to,
        departureDate: flight.departureDate,
        departureTime: flight.departureTime,
        arrivalDate: flight.arrivalDate,
        arrivalTime: flight.arrivalTime,
        bookingNumber: flight.bookingNumber,
        baggage: flight.baggage,
        cost: Number.isFinite(cost) ? cost : 0,
        paymentStatus: paymentValidation.paymentStatus,
        paidAmount: paymentValidation.paidAmount,
        stopover: flight.stopover,
        notes: flight.notes
      });
    });
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

  if ([
    "add-destination",
    "remove-destination",
    "move-destination-up",
    "move-destination-down"
  ].includes(action)) {
    event.preventDefault();
    event.stopPropagation();
    updateDestinationsInOpenForm(actionTarget);
    return;
  }

  if ([
    "add-initial-flight",
    "remove-initial-flight"
  ].includes(action)) {
    event.preventDefault();
    event.stopPropagation();
    updateInitialFlightsInOpenForm(actionTarget);
    return;
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

  if (action === "open-data-management") {
    pendingImportText = "";
    openDataManagementModal();
  }

  if (action === "export-backup") {
    downloadBackupJson();
  }

  if (action === "choose-import-file") {
    document.querySelector("#backup-file-input")?.click();
  }

  if (action === "confirm-import-backup") {
    try {
      importBackupPayload(pendingImportText);
      pendingImportText = "";
      closeModal();
      window.location.hash = "#/home";
      refreshView();
      showToast("Copia ripristinata.");
    } catch (error) {
      pendingImportText = "";
      openDataManagementModal(error.message || "Backup non valido.");
    }
  }

  if (action === "open-reset-confirmation") {
    openResetConfirmation();
  }

  if (action === "confirm-reset-data") {
    resetAppData();
    closeModal();
    window.location.hash = "#/home";
    refreshView();
    showToast("Dati cancellati.");
  }

  if (action === "close-modal") {
    closeModal();
  }
}

function handleHomeChange(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (event.target.name === "initialFlightStopoverEnabled") {
    markModalDirty();
    updateInitialFlightStopoverFields(event.target);
    return;
  }

  if (["initialFlightCost", "initialFlightPaymentStatus"].includes(event.target.name)) {
    markModalDirty();
    updateInitialFlightPaymentField(event.target);
    return;
  }

  if (!actionTarget || actionTarget.dataset.action !== "import-backup-file") {
    return;
  }

  readImportFile(actionTarget.files?.[0]);
  actionTarget.value = "";
}

function ensureHomeHandlers() {
  if (homeHandlersReady) {
    return;
  }

  document.addEventListener("click", handleHomeClick);
  document.addEventListener("change", handleHomeChange);
  document.addEventListener("submit", handleTripFormSubmit);
  homeHandlersReady = true;
}

function renderEmptyState() {
  return `
    <article class="empty-state empty-state--home">
      <div class="empty-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M4 19c4-5 12-5 16 0M6 15c3-3 9-3 12 0M8 11c2-2 6-2 8 0M12 5v8"/></svg>
      </div>
      <h2>Il tuo primo dossier di viaggio</h2>
      <p>Organizza budget, tappe, checklist e note in un unico posto. Anche offline.</p>
      <button class="button button--primary" type="button" data-action="open-trip-form">Crea il primo dossier</button>
      <button class="button button--ghost button--small" type="button" data-action="choose-import-file">Importa backup esistente</button>
      <input class="visually-hidden" id="backup-file-input" type="file" accept="application/json,.json" data-action="import-backup-file">
    </article>
  `;
}

const TRIP_CARD_ACCENT_COUNT = 6;

function getTripBudgetLabel(budget, currency) {
  return Number(budget.plannedTotal || 0) > 0
    ? `Totale viaggio ${formatCurrency(budget.plannedTotal, currency)}`
    : "Nessuna spesa inserita";
}

function renderTripCard(trip, index = 0) {
  const duration = calculateTripDuration(trip.startDate, trip.endDate);
  const countdown = calculateCountdown(trip.startDate, trip.endDate);
  const destinationCount = normalizeDestinations(trip.destinations).length;
  const accentClass = `trip-card--accent-${(index % TRIP_CARD_ACCENT_COUNT) + 1}`;
  const budget = calculateDossierBudgetSummary(
    trip,
    getExpensesByTripId(trip.id),
    getFlightsByTripId(trip.id),
    getStaysByTripId(trip.id),
    getActivitiesByTripId(trip.id)
  );

  return `
    <article class="trip-card ${accentClass}">
      <a class="trip-card__main" href="#/trip/${encodeURIComponent(trip.id)}" aria-label="Apri ${escapeHtml(trip.name)}">
        <div class="trip-card__topline">
          <span>Dossier viaggio</span>
          <span>${escapeHtml(countdown)}</span>
        </div>
        <h2 class="trip-card__title">${escapeHtml(trip.name)}</h2>
        <p class="trip-card__destinations">${formatDestinations(trip.destinations)}</p>
        <div class="trip-card__divider" aria-hidden="true"></div>
        <div class="trip-card__details">
          <span>${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</span>
          <span>${duration} giorni</span>
        </div>
        <div class="trip-card__meta-row">
          <p class="trip-card__budget">${getTripBudgetLabel(budget, trip.currency)}</p>
          <p class="trip-card__destination-count">${destinationCount} ${destinationCount === 1 ? "destinazione" : "destinazioni"}</p>
        </div>
      </a>
      <div class="trip-card__actions" aria-label="Azioni viaggio">
        <a class="button button--primary trip-card__open" href="#/trip/${encodeURIComponent(trip.id)}">Apri dossier &rarr;</a>
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
      ${trips.map((trip, index) => renderTripCard(trip, index)).join("")}
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
          <p class="page__eyebrow">Dossier viaggio</p>
          <h1 class="page__title" id="home-title">Ithaca</h1>
          <p class="page__summary">Ithaca organizza budget, tappe, checklist e note del viaggio in un unico dossier.</p>
        </div>
        <div class="home-actions">
          <button class="button button--primary" type="button" data-action="open-trip-form">Nuovo viaggio</button>
        </div>
      </header>

      ${renderTripList(trips)}
    </section>
  `;
}
