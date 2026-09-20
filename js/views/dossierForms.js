import { closeModal, openModal, markModalSaved } from "../components/modal.js";
import { entryDefaults, nextEntryDefaults } from "../entryContext.js";
import { showToast } from "../components/toast.js";
import { createActivity, createFlight, createStay, deleteActivity, deleteFlight, deleteStay, getActivityById, getFlightById, getStayById, getTripById, updateActivity, updateFlight, updateStay } from "../storage.js";
import { openTripForm } from "./homeView.js";
import { ACTIVITY_TYPES, FLIGHT_TYPES, STAY_TYPES, DOSSIER_PAYMENT_STATUSES, escapeHtml, getActivityTypeLabel, getFlightTypeLabel, getStayTypeLabel, getDossierPaymentStatusLabel, normalizeDestinations, validatePaymentAllocation } from "../utils.js";
let dashboardHandlersReady = false;
const ZERO_COST_WARNING_COPY = "Costo 0 € con pagamento segnato: controlla se il dato è corretto.";
function refreshView() { window.dispatchEvent(new CustomEvent("ithaca:refresh")); }

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

  if (action === "open-flight-form" && tripId) {
    const trip = getTripById(tripId);
    if (trip) openFlightForm(trip, entryDefaults("flight", trip, actionTarget.dataset.date));
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
    if (trip) openStayForm(trip, entryDefaults("stay", trip, actionTarget.dataset.date));
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
    if (trip) openActivityForm(trip, entryDefaults("activity", trip, actionTarget.dataset.date));
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
      <div class="form-field"><label for="flight-type">Tipo di volo</label><select id="flight-type" name="type">${renderOptions(FLIGHT_TYPES, flight?.type || "altro", getFlightTypeLabel)}</select></div>
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
          <span>Questo volo ha uno scalo</span>
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
      <div class="form-field"><label for="stay-type">Tipo di struttura</label><select id="stay-type" name="structureType">${renderOptions(STAY_TYPES, stay?.structureType || "altro", getStayTypeLabel)}</select></div>
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

      <div class="form-grid">
        <div class="form-field"><label for="stay-checkin-time">Ora check-in</label><input id="stay-checkin-time" name="checkInTime" type="time" value="${escapeHtml(stay?.checkInTime || "")}"></div>
        <div class="form-field"><label for="stay-checkout-time">Ora check-out</label><input id="stay-checkout-time" name="checkOutTime" type="time" value="${escapeHtml(stay?.checkOutTime || "")}"></div>
      </div>
      <div class="form-field"><label for="stay-address">Indirizzo</label><input id="stay-address" name="address" value="${escapeHtml(stay?.address || "")}"></div>
      <div class="form-field"><label for="stay-phone">Telefono</label><input id="stay-phone" name="phone" type="tel" value="${escapeHtml(stay?.phone || "")}"></div>
      <div class="form-field"><label for="stay-link">Link</label><input id="stay-link" name="link" type="url" value="${escapeHtml(stay?.link || "")}"></div>
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
      ...Object.fromEntries(["checkInTime", "checkOutTime", "address", "phone", "link"].map(key => [key, String(formData.get(key) || "").trim()])),
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

  if (mode === "create" && event.submitter?.name === "saveAndAdd") {
    markModalSaved();
    openActivityForm(trip, nextEntryDefaults("activity", values));
    document.querySelector("#activity-name-input")?.focus();
  } else {
    closeModal();
  }
  refreshView();
}

