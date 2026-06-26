import { closeModal, openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import {
  createNote,
  deleteNote,
  getNoteById,
  getNotesByTripId,
  getTripById,
  updateNote
} from "../storage.js";
import {
  escapeHtml,
  filterNotesByDestination,
  formatDate,
  getNoteDestinations,
  getNotePreview,
  searchNotes,
  sortNotes
} from "../utils.js";

const notesFilters = new Map();
let notesHandlersReady = false;

function getFilters(tripId) {
  return notesFilters.get(tripId) || {
    query: "",
    destination: "all"
  };
}

function setFilters(tripId, updates) {
  notesFilters.set(tripId, {
    ...getFilters(tripId),
    ...updates
  });
}

function refreshView() {
  window.dispatchEvent(new CustomEvent("ithaca:refresh"));
}

function getFilteredNotes(notes, filters) {
  return searchNotes(
    filterNotesByDestination(notes, filters.destination),
    filters.query
  );
}

function formatUpdatedAt(value) {
  return formatDate(String(value || "").slice(0, 10));
}

function renderMissingTrip() {
  return `
    <section class="page" aria-labelledby="notes-missing-title">
      <article class="panel panel--wide error-card">
        <p class="page__eyebrow">Viaggio non trovato</p>
        <h1 class="page__title" id="notes-missing-title">Note non disponibili.</h1>
        <p class="page__summary">Il viaggio richiesto non e presente nei dati locali di Ithaca.</p>
        <a class="action-link" href="#/home">Torna alla Home</a>
      </article>
    </section>
  `;
}

function renderSummary(notes) {
  const destinations = getNoteDestinations(notes);
  const latestNote = sortNotes(notes)[0] || null;

  if (notes.length === 0) {
    return `
      <article class="notes-summary panel panel--wide">
        <div>
          <span>Note</span>
          <strong>Nessuna nota salvata</strong>
        </div>
      </article>
    `;
  }

  return `
    <article class="notes-summary panel panel--wide" aria-label="Riepilogo note">
      <div>
        <span>Note salvate</span>
        <strong>${notes.length} ${notes.length === 1 ? "nota salvata" : "note salvate"}</strong>
      </div>
      <div>
        <span>Destinazioni</span>
        <strong>${destinations.length} ${destinations.length === 1 ? "destinazione" : "destinazioni"}</strong>
      </div>
      <div>
        <span>Ultima modifica</span>
        <strong>${latestNote ? escapeHtml(latestNote.title) : "Nessuna nota salvata"}</strong>
      </div>
    </article>
  `;
}

function renderDestinationFilter(tripId, notes, activeDestination) {
  const destinations = getNoteDestinations(notes);

  if (destinations.length === 0) {
    return "";
  }

  return `
    <section class="notes-destination-filter" aria-label="Filtro destinazione">
      <button class="segmented-control__button" type="button" data-action="filter-note-destination" data-trip-id="${escapeHtml(tripId)}" data-filter-value="all" aria-pressed="${activeDestination === "all"}">Tutte</button>
      ${destinations.map((destination) => `
        <button class="segmented-control__button" type="button" data-action="filter-note-destination" data-trip-id="${escapeHtml(tripId)}" data-filter-value="${escapeHtml(destination)}" aria-pressed="${activeDestination === destination}">
          ${escapeHtml(destination)}
        </button>
      `).join("")}
    </section>
  `;
}

function renderToolbar(tripId, notes, filters) {
  return `
    <section class="notes-toolbar" aria-label="Strumenti note">
      <button class="button button--primary" type="button" data-action="open-note-form" data-trip-id="${escapeHtml(tripId)}">Aggiungi nota</button>
      <label class="notes-search">
        <span>Cerca note</span>
        <input type="search" value="${escapeHtml(filters.query)}" placeholder="Cerca nelle note..." data-action="search-notes" data-trip-id="${escapeHtml(tripId)}">
      </label>
      ${renderDestinationFilter(tripId, notes, filters.destination)}
    </section>
  `;
}

function renderEmptyState() {
  return `
    <article class="empty-state">
      <h2>Nessuna nota ancora</h2>
      <p>Salva idee, indirizzi, consigli e dettagli utili per ogni destinazione.</p>
      <button class="button button--primary" type="button" data-action="open-note-form">Scrivi nota</button>
    </article>
  `;
}

function renderNoResults() {
  return `
    <article class="panel panel--wide">
      <h2 class="panel__title">Nessun risultato</h2>
      <p class="panel__body">Prova a modificare ricerca o filtro destinazione.</p>
    </article>
  `;
}

function renderNoteCard(note) {
  const destination = String(note.destination || "").trim();
  const preview = getNotePreview(note.content, 150);

  return `
    <article class="note-card">
      <div class="note-card__header">
        <div>
          <h2 class="note-card__title">${escapeHtml(note.title)}</h2>
          ${destination ? `<p class="note-card__destination">${escapeHtml(destination)}</p>` : ""}
        </div>
        <p class="note-card__date">Aggiornata ${formatUpdatedAt(note.updatedAt)}</p>
      </div>
      <p class="note-card__preview">${escapeHtml(preview)}</p>
      <div class="trip-card__actions" aria-label="Azioni nota">
        <button class="button button--small button--ghost" type="button" data-action="edit-note" data-note-id="${escapeHtml(note.id)}">Modifica</button>
        <button class="button button--small button--danger-ghost" type="button" data-action="delete-note" data-note-id="${escapeHtml(note.id)}">Elimina</button>
      </div>
    </article>
  `;
}

function renderNotesList(allNotes, filteredNotes) {
  if (allNotes.length === 0) {
    return renderEmptyState();
  }

  if (filteredNotes.length === 0) {
    return renderNoResults();
  }

  return `
    <section class="notes-list" aria-label="Lista note">
      ${filteredNotes.map(renderNoteCard).join("")}
    </section>
  `;
}

function updateNotesResults(tripId) {
  const resultsRoot = document.querySelector("[data-notes-results]");
  const searchInput = document.querySelector("[data-action='search-notes']");

  if (!resultsRoot) {
    return;
  }

  const notes = sortNotes(getNotesByTripId(tripId));
  const filters = getFilters(tripId);
  const filteredNotes = getFilteredNotes(notes, filters);

  resultsRoot.innerHTML = renderNotesList(notes, filteredNotes);

  if (searchInput && searchInput.value !== filters.query) {
    searchInput.value = filters.query;
  }

  document.querySelectorAll("[data-action='filter-note-destination']").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filterValue === filters.destination));
  });
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

function renderNoteForm({ tripId, note = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (note?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Aggiungi nota";

  return `
    <form class="trip-form" id="note-form" novalidate>
      <input type="hidden" name="mode" value="${mode}">
      <input type="hidden" name="tripId" value="${escapeHtml(tripId)}">
      <input type="hidden" name="noteId" value="${note?.id ? escapeHtml(note.id) : ""}">
      ${renderErrorList(errors)}

      <div class="form-field">
        <label for="note-title-input">Titolo</label>
        <input id="note-title-input" name="title" type="text" value="${escapeHtml(note?.title || "")}" autocomplete="off" required>
        ${fieldError(errors, "title")}
      </div>

      <div class="form-field">
        <label for="note-destination-input">Destinazione opzionale</label>
        <input id="note-destination-input" name="destination" type="text" value="${escapeHtml(note?.destination || "")}" autocomplete="off">
      </div>

      <div class="form-field">
        <label for="note-content-input">Contenuto</label>
        <textarea id="note-content-input" class="note-content-input" name="content" rows="8" required>${escapeHtml(note?.content || "")}</textarea>
        ${fieldError(errors, "content")}
      </div>

      <div class="form-actions">
        <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
        <button class="button button--primary" type="submit">${submitLabel}</button>
      </div>
    </form>
  `;
}

function validateNoteForm(formData) {
  const errors = {};
  const title = String(formData.get("title") || "").trim();
  const destination = String(formData.get("destination") || "").trim();
  const content = String(formData.get("content") || "").trim();

  if (!title) {
    errors.title = "Titolo obbligatorio.";
  }

  if (!content) {
    errors.content = "Contenuto obbligatorio.";
  }

  return {
    errors,
    values: {
      title,
      destination,
      content
    }
  };
}

function openNoteForm(tripId, note = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !note?.id ? "Aggiungi nota" : "Modifica nota",
    content: renderNoteForm({ tripId, note, errors, modeOverride }),
    confirmOnDirty: true
  });
}

function openDeleteConfirmation(note) {
  openModal({
    title: "Elimina nota",
    content: `
      <div class="confirm-dialog">
        <p>Vuoi eliminare <strong>${escapeHtml(note.title)}</strong> dalle note?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
          <button class="button button--danger" type="button" data-action="confirm-delete-note" data-note-id="${escapeHtml(note.id)}">Elimina</button>
        </div>
      </div>
    `
  });
}

function handleNotesClick(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const tripId = actionTarget.dataset.tripId || document.querySelector("[data-notes-trip-id]")?.dataset.notesTripId;
  const noteId = actionTarget.dataset.noteId;

  if (action === "open-note-form" && tripId) {
    openNoteForm(tripId);
  }

  if (action === "edit-note") {
    const note = getNoteById(noteId);

    if (note) {
      openNoteForm(note.tripId, note);
    }
  }

  if (action === "delete-note") {
    const note = getNoteById(noteId);

    if (note) {
      openDeleteConfirmation(note);
    }
  }

  if (action === "confirm-delete-note") {
    deleteNote(noteId);
    closeModal();
    refreshView();
    showToast("Nota eliminata.");
  }

  if (action === "filter-note-destination" && tripId) {
    setFilters(tripId, { destination: actionTarget.dataset.filterValue || "all" });
    updateNotesResults(tripId);
  }

  if (action === "close-modal") {
    closeModal();
  }
}

function handleNotesInput(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget || actionTarget.dataset.action !== "search-notes") {
    return;
  }

  const tripId = actionTarget.dataset.tripId || document.querySelector("[data-notes-trip-id]")?.dataset.notesTripId;

  if (!tripId) {
    return;
  }

  setFilters(tripId, { query: actionTarget.value || "" });
  updateNotesResults(tripId);
}

function handleNoteSubmit(event) {
  if (event.target.id !== "note-form") {
    return;
  }

  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const { errors, values } = validateNoteForm(formData);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const noteId = String(formData.get("noteId") || "");

  if (Object.keys(errors).length > 0) {
    openNoteForm(
      tripId,
      mode === "edit" ? { ...getNoteById(noteId), ...values } : values,
      errors,
      mode
    );
    return;
  }

  if (mode === "edit") {
    updateNote(noteId, values);
    showToast("Nota aggiornata.");
  } else {
    createNote({ ...values, tripId });
    showToast("Nota aggiunta.");
  }

  closeModal();
  refreshView();
}

function ensureNotesHandlers() {
  if (notesHandlersReady) {
    return;
  }

  document.addEventListener("click", handleNotesClick);
  document.addEventListener("input", handleNotesInput);
  document.addEventListener("submit", handleNoteSubmit);
  notesHandlersReady = true;
}

export function renderNotesView({ params }) {
  ensureNotesHandlers();

  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const notes = sortNotes(getNotesByTripId(trip.id));
  const filters = getFilters(trip.id);
  const filteredNotes = getFilteredNotes(notes, filters);
  const encodedTripId = encodeURIComponent(trip.id);

  return `
    <section class="page notes-page" data-notes-trip-id="${escapeHtml(trip.id)}" aria-labelledby="notes-title">
      <header class="page__header">
        <div>
          <p class="page__eyebrow">Note</p>
          <h1 class="page__title" id="notes-title">${escapeHtml(trip.name)}</h1>
          <p class="page__summary">Appunti, idee e dettagli utili del viaggio.</p>
        </div>
        <a class="button button--ghost dossier-back-link" href="#/trip/${encodedTripId}">&larr; Dossier</a>
      </header>

      ${renderSummary(notes)}
      ${renderToolbar(trip.id, notes, filters)}

      <div data-notes-results>
        ${renderNotesList(notes, filteredNotes)}
      </div>
    </section>
  `;
}
