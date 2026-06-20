import { closeModal, openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import {
  createChecklistItem,
  deleteChecklistItem,
  getChecklistItemById,
  getChecklistItemsByTripId,
  getTripById,
  toggleChecklistItem,
  updateChecklistItem
} from "../storage.js";
import {
  CHECKLIST_SECTIONS,
  applyTripSeasonTheme,
  calculateChecklistSummary,
  clearTripSeasonTheme,
  escapeHtml,
  formatDate,
  getChecklistSectionLabel,
  groupChecklistItemsBySection,
  isChecklistItemOverdue,
  sortChecklistItems
} from "../utils.js";

const checklistFilters = new Map();
let checklistHandlersReady = false;

const CHECKLIST_TEMPLATE = [
  ["pre_departure", "Controllare validita passaporto"],
  ["pre_departure", "Assicurazione viaggio"],
  ["pre_departure", "Check-in online"],
  ["pre_departure", "Scaricare mappe offline"],
  ["pre_departure", "Salvare prenotazioni offline"],
  ["pre_departure", "Controllare visti/documenti richiesti"],
  ["pre_departure", "Preparare adattatore presa"],
  ["pre_departure", "Cambio valuta o carta di viaggio"],
  ["pre_departure", "Farmacia da viaggio"],
  ["during_trip", "Tenere traccia delle spese"],
  ["during_trip", "Controllare prossima tappa"],
  ["during_trip", "Salvare note importanti"],
  ["after_trip", "Riepilogare spese finali"],
  ["after_trip", "Salvare appunti utili per viaggi futuri"]
];

function getFilter(tripId) {
  return checklistFilters.get(tripId) || "all";
}

function setFilter(tripId, filter) {
  checklistFilters.set(tripId, filter || "all");
}

function refreshView() {
  window.dispatchEvent(new CustomEvent("ithaca:refresh"));
}

function filterItems(items, filter) {
  if (filter === "open") {
    return items.filter((item) => !item.completed);
  }

  if (filter === "completed") {
    return items.filter((item) => item.completed);
  }

  return items;
}

function renderMissingTrip() {
  return `
    <section class="page" aria-labelledby="checklist-missing-title">
      <article class="panel panel--wide error-card">
        <p class="page__eyebrow">Viaggio non trovato</p>
        <h1 class="page__title" id="checklist-missing-title">Checklist non disponibile.</h1>
        <p class="page__summary">Il viaggio richiesto non e presente nei dati locali di Ithaca.</p>
        <a class="action-link" href="#/home">Torna alla Home</a>
      </article>
    </section>
  `;
}

function renderSummary(items) {
  const summary = calculateChecklistSummary(items);
  const progressText = items.length === 0
    ? "Checklist non ancora configurata"
    : `${summary.completed}/${summary.total} completati`;

  return `
    <section class="budget-summary-grid checklist-summary-grid" aria-label="Riepilogo checklist">
      <article class="budget-summary-card">
        <span>Stato checklist</span>
        <strong>${progressText}</strong>
      </article>
      <article class="budget-summary-card">
        <span>Completamento</span>
        <strong>${summary.completionRate}%</strong>
      </article>
      <article class="budget-summary-card">
        <span>Da fare</span>
        <strong>${summary.open}</strong>
      </article>
      <article class="budget-summary-card">
        <span>Task totali</span>
        <strong>${summary.total}</strong>
      </article>
    </section>
  `;
}

function renderProgress(items) {
  const summary = calculateChecklistSummary(items);

  return `
    <section class="panel panel--wide budget-progress-card" aria-labelledby="checklist-progress-title">
      <div class="budget-progress-card__header">
        <h2 class="panel__title" id="checklist-progress-title">Avanzamento checklist</h2>
        <span>${summary.completed}/${summary.total} completati</span>
      </div>
      <div class="budget-progress ${summary.completionRate === 100 && summary.total > 0 ? "is-complete" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.completionRate}">
        <span style="width: ${summary.completionRate}%"></span>
      </div>
    </section>
  `;
}

function renderFilters(tripId, activeFilter) {
  return `
    <section class="segmented-control" aria-label="Filtri checklist">
      ${[
        ["all", "Tutti"],
        ["open", "Da fare"],
        ["completed", "Completati"]
      ].map(([value, label]) => `
        <button class="segmented-control__button" type="button" data-action="filter-checklist" data-trip-id="${escapeHtml(tripId)}" data-filter-value="${value}" aria-pressed="${activeFilter === value}">
          ${label}
        </button>
      `).join("")}
    </section>
  `;
}

function renderEmptyState() {
  return `
    <article class="empty-state">
      <h2>Nessun task ancora</h2>
      <p>Crea la checklist del viaggio o carica un template pre-partenza pronto da adattare.</p>
      <div class="template-actions">
        <button class="button button--primary" type="button" data-action="open-checklist-form">Aggiungi task</button>
        <button class="button button--ghost" type="button" data-action="load-checklist-template">Usa template</button>
      </div>
    </article>
  `;
}

function renderNoFilterResults() {
  return `
    <article class="panel panel--wide">
      <h2 class="panel__title">Nessun risultato</h2>
      <p class="panel__body">Nessun task corrisponde al filtro selezionato.</p>
    </article>
  `;
}

function renderChecklistItem(item) {
  const notes = String(item.notes || "").trim();
  const overdue = isChecklistItemOverdue(item);

  return `
    <article class="checklist-item ${item.completed ? "is-completed" : ""}">
      <label class="checklist-checkbox" aria-label="Completa ${escapeHtml(item.title)}">
        <input type="checkbox" data-action="toggle-checklist-item" data-item-id="${escapeHtml(item.id)}" ${item.completed ? "checked" : ""}>
        <span aria-hidden="true"></span>
      </label>
      <div class="checklist-item__body">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="checklist-item__meta">
            ${item.dueDate ? `<span>Scadenza: ${formatDate(item.dueDate)}</span>` : `<span>Nessuna scadenza</span>`}
            ${overdue ? `<span class="badge badge--danger">Scaduto</span>` : ""}
            ${item.completed ? `<span class="badge badge--success">Completato</span>` : `<span class="badge badge--warning">Da fare</span>`}
          </p>
        </div>
        ${notes ? `<p class="expense-card__notes">${escapeHtml(notes)}</p>` : ""}
        <div class="trip-card__actions" aria-label="Azioni task">
          <button class="button button--small button--ghost" type="button" data-action="edit-checklist-item" data-item-id="${escapeHtml(item.id)}">Modifica</button>
          <button class="button button--small button--danger-ghost" type="button" data-action="delete-checklist-item" data-item-id="${escapeHtml(item.id)}">Elimina</button>
        </div>
      </div>
    </article>
  `;
}

function renderChecklistSections(allItems, filteredItems) {
  if (allItems.length === 0) {
    return renderEmptyState();
  }

  if (filteredItems.length === 0) {
    return renderNoFilterResults();
  }

  const allGroups = groupChecklistItemsBySection(allItems);
  const filteredGroups = groupChecklistItemsBySection(filteredItems);

  return `
    <section class="checklist-sections" aria-label="Task checklist">
      ${CHECKLIST_SECTIONS.map((section) => {
        const sectionItems = filteredGroups[section] || [];
        const sectionSummary = calculateChecklistSummary(allGroups[section] || []);

        if (sectionItems.length === 0) {
          return "";
        }

        return `
          <section class="checklist-section" aria-labelledby="checklist-section-${section}">
            <header class="checklist-section__header">
              <h2 id="checklist-section-${section}">${getChecklistSectionLabel(section)}</h2>
              <span>${sectionSummary.completed}/${sectionSummary.total} completati</span>
            </header>
            <div class="checklist-items">
              ${sectionItems.map(renderChecklistItem).join("")}
            </div>
          </section>
        `;
      }).join("")}
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

function renderChecklistForm({ tripId, item = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (item?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Aggiungi task";

  return `
    <form class="trip-form" id="checklist-form" novalidate>
      <input type="hidden" name="mode" value="${mode}">
      <input type="hidden" name="tripId" value="${escapeHtml(tripId)}">
      <input type="hidden" name="itemId" value="${item?.id ? escapeHtml(item.id) : ""}">
      ${renderErrorList(errors)}

      <div class="form-field">
        <label for="checklist-title-input">Titolo</label>
        <input id="checklist-title-input" name="title" type="text" value="${escapeHtml(item?.title || "")}" autocomplete="off" required>
        ${fieldError(errors, "title")}
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="checklist-section-input">Sezione</label>
          <select id="checklist-section-input" name="section" required>
            ${CHECKLIST_SECTIONS.map((section) => `
              <option value="${section}" ${item?.section === section ? "selected" : ""}>${getChecklistSectionLabel(section)}</option>
            `).join("")}
          </select>
          ${fieldError(errors, "section")}
        </div>

        <div class="form-field">
          <label for="checklist-due-date-input">Scadenza opzionale</label>
          <input id="checklist-due-date-input" name="dueDate" type="date" value="${escapeHtml(item?.dueDate || "")}">
          ${fieldError(errors, "dueDate")}
        </div>
      </div>

      <div class="form-field">
        <label for="checklist-notes-input">Note opzionali</label>
        <textarea id="checklist-notes-input" name="notes" rows="4">${escapeHtml(item?.notes || "")}</textarea>
      </div>

      <div class="form-actions">
        <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
        <button class="button button--primary" type="submit">${submitLabel}</button>
      </div>
    </form>
  `;
}

function validateChecklistForm(formData) {
  const errors = {};
  const title = String(formData.get("title") || "").trim();
  const section = String(formData.get("section") || "").trim();
  const dueDate = String(formData.get("dueDate") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!title) {
    errors.title = "Titolo obbligatorio.";
  }

  if (!CHECKLIST_SECTIONS.includes(section)) {
    errors.section = "Sezione obbligatoria.";
  }

  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    errors.dueDate = "Data non valida.";
  }

  return {
    errors,
    values: {
      title,
      section,
      dueDate,
      notes
    }
  };
}

function openChecklistForm(tripId, item = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !item?.id ? "Aggiungi task" : "Modifica task",
    content: renderChecklistForm({ tripId, item, errors, modeOverride }),
    confirmOnDirty: true
  });
}

function openDeleteConfirmation(item) {
  openModal({
    title: "Elimina task",
    content: `
      <div class="confirm-dialog">
        <p>Vuoi eliminare <strong>${escapeHtml(item.title)}</strong> dalla checklist?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
          <button class="button button--danger" type="button" data-action="confirm-delete-checklist-item" data-item-id="${escapeHtml(item.id)}">Elimina</button>
        </div>
      </div>
    `
  });
}

function openTemplateConfirmation(tripId) {
  openModal({
    title: "Carica template base",
    content: `
      <div class="confirm-dialog">
        <p>Hai gia task in checklist. Vuoi aggiungere comunque il template?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
          <button class="button button--primary" type="button" data-action="confirm-load-checklist-template" data-trip-id="${escapeHtml(tripId)}">Aggiungi template</button>
        </div>
      </div>
    `
  });
}

function loadTemplateForTrip(tripId) {
  const existingItems = getChecklistItemsByTripId(tripId);
  const existingKeys = new Set(existingItems.map((item) => `${item.section}::${String(item.title || "").trim().toLowerCase()}`));
  let createdCount = 0;

  CHECKLIST_TEMPLATE.forEach(([section, title]) => {
    const key = `${section}::${title.toLowerCase()}`;

    if (existingKeys.has(key)) {
      return;
    }

    createChecklistItem({
      tripId,
      title,
      section,
      completed: false,
      dueDate: "",
      notes: ""
    });
    existingKeys.add(key);
    createdCount += 1;
  });

  return createdCount;
}

function handleChecklistClick(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const tripId = actionTarget.dataset.tripId || document.querySelector("[data-checklist-trip-id]")?.dataset.checklistTripId;
  const itemId = actionTarget.dataset.itemId;

  if (action === "open-checklist-form" && tripId) {
    openChecklistForm(tripId);
  }

  if (action === "edit-checklist-item") {
    const item = getChecklistItemById(itemId);

    if (item) {
      openChecklistForm(item.tripId, item);
    }
  }

  if (action === "delete-checklist-item") {
    const item = getChecklistItemById(itemId);

    if (item) {
      openDeleteConfirmation(item);
    }
  }

  if (action === "confirm-delete-checklist-item") {
    deleteChecklistItem(itemId);
    closeModal();
    refreshView();
    showToast("Task eliminato.");
  }

  if (action === "filter-checklist" && tripId) {
    setFilter(tripId, actionTarget.dataset.filterValue || "all");
    refreshView();
  }

  if (action === "load-checklist-template" && tripId) {
    const existingItems = getChecklistItemsByTripId(tripId);

    if (existingItems.length > 0) {
      openTemplateConfirmation(tripId);
      return;
    }

    const createdCount = loadTemplateForTrip(tripId);
    refreshView();
    showToast(createdCount > 0 ? `Template caricato: ${createdCount} task aggiunti.` : "Template gia presente.");
  }

  if (action === "confirm-load-checklist-template" && tripId) {
    const createdCount = loadTemplateForTrip(tripId);
    closeModal();
    refreshView();
    showToast(createdCount > 0 ? `Template caricato: ${createdCount} task aggiunti.` : "Nessun duplicato aggiunto.");
  }

  if (action === "close-modal") {
    closeModal();
  }
}

function handleChecklistChange(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget || actionTarget.dataset.action !== "toggle-checklist-item") {
    return;
  }

  const updatedItem = toggleChecklistItem(actionTarget.dataset.itemId);

  if (!updatedItem) {
    return;
  }

  refreshView();
  showToast(updatedItem.completed ? "Task completato." : "Task riaperto.");
}

function handleChecklistSubmit(event) {
  if (event.target.id !== "checklist-form") {
    return;
  }

  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const { errors, values } = validateChecklistForm(formData);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const itemId = String(formData.get("itemId") || "");

  if (Object.keys(errors).length > 0) {
    openChecklistForm(
      tripId,
      mode === "edit" ? { ...getChecklistItemById(itemId), ...values } : values,
      errors,
      mode
    );
    return;
  }

  if (mode === "edit") {
    updateChecklistItem(itemId, values);
    showToast("Task aggiornato.");
  } else {
    createChecklistItem({ ...values, tripId });
    showToast("Task aggiunto.");
  }

  closeModal();
  refreshView();
}

function ensureChecklistHandlers() {
  if (checklistHandlersReady) {
    return;
  }

  document.addEventListener("click", handleChecklistClick);
  document.addEventListener("change", handleChecklistChange);
  document.addEventListener("submit", handleChecklistSubmit);
  checklistHandlersReady = true;
}

export function renderChecklistView({ params }) {
  ensureChecklistHandlers();

  const trip = getTripById(params.tripId);

  if (!trip) {
    clearTripSeasonTheme();
    return renderMissingTrip();
  }

  applyTripSeasonTheme(trip.startDate);

  const items = sortChecklistItems(getChecklistItemsByTripId(trip.id));
  const activeFilter = getFilter(trip.id);
  const filteredItems = filterItems(items, activeFilter);
  const encodedTripId = encodeURIComponent(trip.id);

  return `
    <section class="page checklist-page" data-checklist-trip-id="${escapeHtml(trip.id)}" aria-labelledby="checklist-title">
      <header class="page__header home-hero">
        <div>
          <p class="page__eyebrow">Checklist</p>
          <h1 class="page__title" id="checklist-title">${escapeHtml(trip.name)}</h1>
          <p class="page__summary">Preparazione, controlli durante il viaggio e chiusura al rientro.</p>
        </div>
        <a class="button button--ghost dossier-back-link" href="#/trip/${encodedTripId}">&larr; Dossier</a>
      </header>

      ${renderSummary(items)}
      ${renderProgress(items)}

      <div class="budget-toolbar">
        <div class="template-actions">
          <button class="button button--primary" type="button" data-action="open-checklist-form" data-trip-id="${escapeHtml(trip.id)}">Aggiungi task</button>
          <button class="button button--ghost" type="button" data-action="load-checklist-template" data-trip-id="${escapeHtml(trip.id)}">Carica template base</button>
        </div>
        ${renderFilters(trip.id, activeFilter)}
      </div>

      ${renderChecklistSections(items, filteredItems)}
    </section>
  `;
}
