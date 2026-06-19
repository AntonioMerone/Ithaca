import { closeModal, markModalDirty, openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import {
  createBackupPayload,
  createTrip,
  deleteTrip,
  getBackupFileName,
  getTripById,
  getTrips,
  importBackupPayload,
  resetAppData,
  updateTrip
} from "../storage.js";
import {
  calculateCountdown,
  calculateTripDuration,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDestinationRange,
  generateId,
  normalizeDestinations
} from "../utils.js";

const DEFAULT_CURRENCY = "EUR";
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
    return "Itinerario da completare";
  }

  if (normalized.length > 3) {
    return `${normalized.slice(0, 3).map((destination) => escapeHtml(destination.name)).join(" &rarr; ")} &rarr; +${normalized.length - 3}`;
  }

  return normalized.map((destination) => escapeHtml(destination.name)).join(" &rarr; ");
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

function destinationHasAnyValue(destination) {
  return [
    destination.name,
    destination.arrivalDate,
    destination.departureDate
  ].some((value) => String(value ?? "").trim());
}

function validateTripForm(formData, trip = null) {
  const errors = {};
  const name = String(formData.get("name") || "").trim();
  const destinationDrafts = parseDestinationsFromForm(formData, trip);
  const destinations = destinationDrafts.filter(destinationHasAnyValue);
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

  destinations.forEach((destination, index) => {
    if (!destination.name) {
      errors[`destination_${index}_name`] = `Nome destinazione ${index + 1} obbligatorio.`;
    }

    if (destination.arrivalDate && destination.departureDate && destination.departureDate < destination.arrivalDate) {
      errors[`destination_${index}_dates`] = `La partenza della destinazione ${index + 1} non puo precedere l'arrivo.`;
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
    }
  };
}

function collectTripFormDraft(form) {
  const formData = new FormData(form);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const currentTrip = mode === "edit" ? getTripById(tripId) : null;
  const values = validateTripForm(formData, currentTrip).values;

  return {
    ...values,
    id: tripId,
    destinations: parseDestinationsFromForm(formData, currentTrip),
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
          <label for="destination-arrival-${index}">Data arrivo</label>
          <input id="destination-arrival-${index}" name="destinationArrivalDate" type="date" value="${escapeHtml(destination.arrivalDate || "")}">
        </div>
        <div class="form-field">
          <label for="destination-departure-${index}">Data partenza</label>
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

function renderTripForm({ trip = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (trip?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Crea viaggio";

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

export function openTripForm(trip = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !trip?.id ? "Nuovo viaggio" : "Modifica viaggio",
    content: renderTripForm({ trip, errors, modeOverride }),
    confirmOnDirty: true
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
      <p class="panel__body">Salva una copia di sicurezza, ripristina una copia precedente o cancella i dati locali di Ithaca.</p>

      <div class="data-management__actions">
        <button class="button button--primary" type="button" data-action="export-backup">Salva una copia</button>
        <button class="button button--ghost" type="button" data-action="choose-import-file">Ripristina una copia</button>
        <button class="button button--danger-ghost" type="button" data-action="open-reset-confirmation">Cancella dati</button>
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

  openTripForm({
    ...draft,
    destinations: destinations.length > 0 ? destinations : [createBlankDestination()]
  }, {}, draft.mode);
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
  const { errors, values } = validateTripForm(formData, currentTrip);

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

  if ([
    "add-destination",
    "remove-destination",
    "move-destination-up",
    "move-destination-down"
  ].includes(action)) {
    updateDestinationsInOpenForm(actionTarget);
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
    <article class="empty-state">
      <h2>Nessun dossier ancora</h2>
      <p>Crea il tuo primo viaggio e organizza destinazioni, budget, timeline, checklist e note in un unico posto.</p>
      <button class="button button--primary" type="button" data-action="open-trip-form">Crea primo viaggio</button>
    </article>
  `;
}

function renderTripCard(trip) {
  const duration = calculateTripDuration(trip.startDate, trip.endDate);
  const countdown = calculateCountdown(trip.startDate, trip.endDate);
  const notes = shortNotes(trip.notes);
  const destinationCount = normalizeDestinations(trip.destinations).length;

  return `
    <article class="trip-card">
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
          <p class="trip-card__budget">Budget ${formatCurrency(trip.budgetTotal, trip.currency)} <span>${escapeHtml(trip.currency)}</span></p>
          <p class="trip-card__destination-count">${destinationCount} ${destinationCount === 1 ? "destinazione" : "destinazioni"}</p>
        </div>
        ${notes ? `<p class="trip-card__notes">Nota: ${escapeHtml(notes)}</p>` : ""}
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
          <p class="page__eyebrow">Dossier viaggio</p>
          <h1 class="page__title" id="home-title">Ithaca</h1>
          <p class="page__summary">Ithaca organizza budget, tappe, checklist e note del viaggio in un unico dossier.</p>
        </div>
        <div class="home-actions">
          <button class="button button--ghost" type="button" data-action="open-data-management">Gestione dati</button>
          <button class="button button--primary" type="button" data-action="open-trip-form">Nuovo viaggio</button>
        </div>
      </header>

      ${renderTripList(trips)}
    </section>
  `;
}
