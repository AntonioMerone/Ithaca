import { closeModal, openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import {
  createExpense,
  deleteExpense,
  getActivitiesByTripId,
  getExpenseById,
  getExpensesByTripId,
  getFlightsByTripId,
  getStaysByTripId,
  getTripById,
  updateExpense
} from "../storage.js";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  calculateDossierBudgetSummary,
  escapeHtml,
  formatCurrency,
  formatDate,
  getActivityTypeLabel,
  getDossierPaymentStatusBadge,
  getDossierPaymentStatusLabel,
  getExpenseCategoryLabel,
  getExpenseStatusLabel,
  getPaymentBreakdown
} from "../utils.js";

const budgetFilters = new Map();
let budgetHandlersReady = false;

const ORIGIN_ORDER = {
  manual: 0,
  flight: 1,
  stay: 2,
  activity: 3
};

function getFilter(tripId) {
  return budgetFilters.get(tripId) || "all";
}

function setFilter(tripId, status) {
  budgetFilters.set(tripId, status || "all");
}

function refreshView() {
  window.dispatchEvent(new CustomEvent("ithaca:refresh"));
}

function normalizeCost(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function parseOptionalAmount(value) {
  const cleanValue = String(value ?? "").trim();

  if (!cleanValue) {
    return 0;
  }

  const amount = Number(cleanValue);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function renderMissingTrip() {
  return `
    <section class="page" aria-labelledby="budget-missing-title">
      <article class="panel panel--wide error-card">
        <p class="page__eyebrow">Viaggio non trovato</p>
        <h1 class="page__title" id="budget-missing-title">Registro spese non disponibile.</h1>
        <p class="page__summary">Il viaggio richiesto non e presente nei dati locali di Ithaca.</p>
        <a class="action-link" href="#/home">Torna alla Home</a>
      </article>
    </section>
  `;
}

function renderSummaryCard(label, value) {
  return `
    <article class="budget-summary-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function getStatusBadgeClass(status) {
  return getDossierPaymentStatusBadge(status);
}

function getStatusLabel(status) {
  return status === "partial" ? "Parziale" : getExpenseStatusLabel(status);
}

function buildLedgerItems({ expenses, flights, stays, activities }) {
  const manualItems = expenses.map((expense) => {
    const breakdown = getPaymentBreakdown(expense, "amount", "status");

    return {
      id: expense.id,
      origin: "manual",
      originLabel: "Manuale",
      title: expense.name || "Spesa manuale",
      totalAmount: breakdown.totalAmount,
      paidAmount: breakdown.paidAmount,
      dueAmount: breakdown.dueAmount,
      status: breakdown.status,
      date: expense.date || "",
      createdAt: expense.createdAt || "",
      meta: getExpenseCategoryLabel(expense.category),
      notes: expense.notes || "",
      editable: true
    };
  });

  const flightItems = flights.map((flight) => {
    const breakdown = getPaymentBreakdown(flight);
    const identity = [flight.airline, flight.flightNumber].filter(Boolean).join(" ");
    const route = [flight.from, flight.to].filter(Boolean).join(" -> ");

    return {
      id: flight.id,
      origin: "flight",
      originLabel: "Volo",
      title: identity || route || "Volo",
      totalAmount: breakdown.totalAmount,
      paidAmount: breakdown.paidAmount,
      dueAmount: breakdown.dueAmount,
      status: breakdown.status,
      date: flight.departureDate || "",
      createdAt: flight.createdAt || "",
      meta: route,
      notes: flight.notes || "",
      editable: false
    };
  });

  const stayItems = stays.map((stay) => {
    const breakdown = getPaymentBreakdown(stay);

    return {
      id: stay.id,
      origin: "stay",
      originLabel: "Soggiorno",
      title: stay.structureName || "Soggiorno",
      totalAmount: breakdown.totalAmount,
      paidAmount: breakdown.paidAmount,
      dueAmount: breakdown.dueAmount,
      status: breakdown.status,
      date: stay.checkInDate || "",
      createdAt: stay.createdAt || "",
      meta: stay.bookingNumber ? `Prenotazione ${stay.bookingNumber}` : "",
      notes: stay.notes || "",
      editable: false
    };
  });

  const activityItems = activities.map((activity) => {
    const breakdown = getPaymentBreakdown(activity);

    return {
      id: activity.id,
      origin: "activity",
      originLabel: "Attivita",
      title: activity.name || getActivityTypeLabel(activity.type),
      totalAmount: breakdown.totalAmount,
      paidAmount: breakdown.paidAmount,
      dueAmount: breakdown.dueAmount,
      status: breakdown.status,
      date: activity.date || "",
      createdAt: activity.createdAt || "",
      meta: [getActivityTypeLabel(activity.type), activity.location].filter(Boolean).join(" · "),
      notes: activity.notes || "",
      editable: false
    };
  });

  return [...manualItems, ...flightItems, ...stayItems, ...activityItems];
}

function sortLedgerItems(items) {
  return [...items].sort((a, b) => {
    const aHasDate = Boolean(a.date);
    const bHasDate = Boolean(b.date);

    if (aHasDate !== bHasDate) {
      return aHasDate ? -1 : 1;
    }

    if (aHasDate && bHasDate) {
      const dateComparison = a.date.localeCompare(b.date);

      if (dateComparison !== 0) {
        return dateComparison;
      }
    }

    const originComparison = ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin];

    if (originComparison !== 0) {
      return originComparison;
    }

    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

function filterLedgerItems(items, activeStatus) {
  if (activeStatus === "all") {
    return items;
  }

  return items.filter((item) => item.status === activeStatus);
}

function renderFilters(tripId, activeStatus) {
  return `
    <section class="segmented-control budget-status-filter" aria-label="Filtri registro spese">
      ${[
        ["all", "Tutte"],
        ["unpaid", "Da pagare"],
        ["partial", "Parziali"],
        ["paid", "Pagate"]
      ].map(([value, label]) => `
        <button class="segmented-control__button" type="button" data-action="filter-expense-status" data-trip-id="${escapeHtml(tripId)}" data-filter-value="${value}" aria-pressed="${activeStatus === value}">
          ${label}
        </button>
      `).join("")}
    </section>
  `;
}

function renderEmptyState() {
  return `
    <article class="empty-state">
      <h2>Nessuna spesa ancora</h2>
      <p>Aggiungi una spesa manuale oppure compila costi in voli, soggiorni e attivita.</p>
      <button class="button button--primary" type="button" data-action="open-expense-form">Aggiungi spesa</button>
    </article>
  `;
}

function renderNoFilterResults() {
  return `
    <article class="panel panel--wide">
      <h2 class="panel__title">Nessun risultato</h2>
      <p class="panel__body">Nessuna voce corrisponde al filtro selezionato.</p>
    </article>
  `;
}

function renderLedgerPayment(item, currency) {
  if (item.status === "partial") {
    return `
      <p class="expense-card__payment">
        <span class="badge ${getStatusBadgeClass(item.status)}">Parziale</span>
        <span>Pagato ${formatCurrency(item.paidAmount, currency)}</span>
        <span>Da pagare ${formatCurrency(item.dueAmount, currency)}</span>
      </p>
    `;
  }

  return `
    <p class="expense-card__payment">
      <span class="badge ${getStatusBadgeClass(item.status)}">${escapeHtml(getStatusLabel(item.status))}</span>
      <span>${item.status === "paid" ? "Gia pagato" : "Da pagare"} ${formatCurrency(item.status === "paid" ? item.paidAmount : item.dueAmount, currency)}</span>
    </p>
  `;
}

function renderLedgerCard(item, currency) {
  const notes = String(item.notes || "").trim();

  return `
    <article class="expense-card">
      <div class="expense-card__main">
        <div>
          <p class="expense-card__meta">
            <span class="badge">${escapeHtml(item.originLabel)}</span>
            ${item.meta ? `<span>${escapeHtml(item.meta)}</span>` : ""}
          </p>
          <h2 class="expense-card__title">${escapeHtml(item.title)}</h2>
        </div>
        <strong class="expense-card__amount">${formatCurrency(item.totalAmount, currency)}</strong>
      </div>
      <div class="metric-list">
        <div class="metric-row">
          <span>Costo</span>
          <strong>${formatCurrency(item.totalAmount, currency)}</strong>
        </div>
      </div>
      ${renderLedgerPayment(item, currency)}
      ${item.date ? `<p class="expense-card__date">Data / scadenza: ${formatDate(item.date)}</p>` : `<p class="expense-card__date">Senza data</p>`}
      ${notes ? `<p class="expense-card__notes">${escapeHtml(notes)}</p>` : ""}
      ${item.editable ? `
        <div class="trip-card__actions" aria-label="Azioni spesa manuale">
          <button class="button button--small button--ghost" type="button" data-action="edit-expense" data-expense-id="${escapeHtml(item.id)}">Modifica</button>
          <button class="button button--small button--danger-ghost" type="button" data-action="delete-expense" data-expense-id="${escapeHtml(item.id)}">Elimina</button>
        </div>
      ` : ""}
    </article>
  `;
}

function renderLedgerList(allItems, filteredItems, currency) {
  if (allItems.length === 0) {
    return renderEmptyState();
  }

  if (filteredItems.length === 0) {
    return renderNoFilterResults();
  }

  return `
    <section class="expense-list" aria-label="Registro spese viaggio">
      ${filteredItems.map((item) => renderLedgerCard(item, currency)).join("")}
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

function renderExpenseForm({ tripId, expense = null, errors = {}, modeOverride = null } = {}) {
  const mode = modeOverride || (expense?.id ? "edit" : "create");
  const submitLabel = mode === "edit" ? "Salva modifiche" : "Aggiungi spesa";

  return `
    <form class="trip-form" id="expense-form" novalidate>
      <input type="hidden" name="mode" value="${mode}">
      <input type="hidden" name="tripId" value="${escapeHtml(tripId)}">
      <input type="hidden" name="expenseId" value="${expense?.id ? escapeHtml(expense.id) : ""}">
      ${renderErrorList(errors)}

      <div class="form-field">
        <label for="expense-name">Nome spesa</label>
        <input id="expense-name" name="name" type="text" value="${escapeHtml(expense?.name || "")}" autocomplete="off" required>
        ${fieldError(errors, "name")}
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="expense-category">Categoria</label>
          <select id="expense-category" name="category" required>
            ${EXPENSE_CATEGORIES.map((category) => `
              <option value="${category}" ${expense?.category === category ? "selected" : ""}>${getExpenseCategoryLabel(category)}</option>
            `).join("")}
          </select>
          ${fieldError(errors, "category")}
        </div>

        <div class="form-field">
          <label for="expense-amount">Importo</label>
          <input id="expense-amount" name="amount" type="number" min="0" step="0.01" value="${escapeHtml(expense?.amount ?? "")}" data-select-on-focus onfocus="this.select()" onclick="this.select()" required>
          ${fieldError(errors, "amount")}
        </div>
      </div>

      <div class="form-grid">
        <div class="form-field">
          <label for="expense-status">Stato pagamento</label>
          <select id="expense-status" name="status" required>
            ${EXPENSE_STATUSES.map((status) => `
              <option value="${status}" ${expense?.status === status ? "selected" : ""}>${getExpenseStatusLabel(status)}</option>
            `).join("")}
          </select>
          ${fieldError(errors, "status")}
        </div>

        <div class="form-field">
          <label for="expense-paid-amount">Importo pagato, se parziale</label>
          <input id="expense-paid-amount" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(expense?.paidAmount || "")}">
          ${fieldError(errors, "paidAmount")}
        </div>
      </div>

      <div class="form-field">
        <label for="expense-date">Data / scadenza pagamento opzionale</label>
        <input id="expense-date" name="date" type="date" value="${escapeHtml(expense?.date || "")}">
      </div>

      <div class="form-field">
        <label for="expense-notes">Note opzionali</label>
        <textarea id="expense-notes" name="notes" rows="4">${escapeHtml(expense?.notes || "")}</textarea>
      </div>

      <div class="form-actions">
        <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
        <button class="button button--primary" type="submit">${submitLabel}</button>
      </div>
    </form>
  `;
}

function validateExpenseForm(formData) {
  const errors = {};
  const name = String(formData.get("name") || "").trim();
  const amountValue = String(formData.get("amount") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const status = String(formData.get("status") || "").trim();
  const paidAmount = parseOptionalAmount(formData.get("paidAmount"));
  const date = String(formData.get("date") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const amount = amountValue === "" ? "" : Number(amountValue);

  if (!name) {
    errors.name = "Nome spesa obbligatorio.";
  }

  if (amountValue === "") {
    errors.amount = "Importo obbligatorio.";
  } else if (!Number.isFinite(amount) || amount < 0) {
    errors.amount = "Importo deve essere un numero maggiore o uguale a 0.";
  }

  if (!EXPENSE_CATEGORIES.includes(category)) {
    errors.category = "Categoria obbligatoria.";
  }

  if (!EXPENSE_STATUSES.includes(status)) {
    errors.status = "Stato pagamento obbligatorio.";
  }

  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    errors.paidAmount = "Importo pagato deve essere un numero maggiore o uguale a 0.";
  }

  return {
    errors,
    values: {
      name,
      amount,
      category,
      status,
      paidAmount: Number.isNaN(paidAmount) ? 0 : Math.min(paidAmount, normalizeCost(amount)),
      date,
      notes
    }
  };
}

function openExpenseForm(tripId, expense = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !expense?.id ? "Aggiungi spesa" : "Modifica spesa",
    content: renderExpenseForm({ tripId, expense, errors, modeOverride }),
    confirmOnDirty: true
  });
}

function openDeleteConfirmation(expense) {
  openModal({
    title: "Elimina spesa",
    content: `
      <div class="confirm-dialog">
        <p>Vuoi eliminare <strong>${escapeHtml(expense.name)}</strong> dal registro spese?</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-action="close-modal">Annulla</button>
          <button class="button button--danger" type="button" data-action="confirm-delete-expense" data-expense-id="${escapeHtml(expense.id)}">Elimina</button>
        </div>
      </div>
    `
  });
}

function handleBudgetClick(event) {
  if (event.target.matches("[data-select-on-focus]")) {
    event.target.select();
    return;
  }

  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const tripId = actionTarget.dataset.tripId || document.querySelector("[data-budget-trip-id]")?.dataset.budgetTripId;
  const expenseId = actionTarget.dataset.expenseId;

  if (action === "open-expense-form" && tripId) {
    openExpenseForm(tripId);
  }

  if (action === "edit-expense") {
    const expense = getExpenseById(expenseId);

    if (expense) {
      openExpenseForm(expense.tripId, expense);
    }
  }

  if (action === "delete-expense") {
    const expense = getExpenseById(expenseId);

    if (expense) {
      openDeleteConfirmation(expense);
    }
  }

  if (action === "confirm-delete-expense") {
    deleteExpense(expenseId);
    closeModal();
    refreshView();
    showToast("Spesa eliminata.");
  }

  if (action === "filter-expense-status" && tripId) {
    setFilter(tripId, actionTarget.dataset.filterValue || "all");
    refreshView();
  }

  if (action === "close-modal") {
    closeModal();
  }
}

function handleBudgetFocus(event) {
  if (event.target.matches("[data-select-on-focus]")) {
    event.target.dataset.replaceOnInput = event.target.value ? "true" : "false";
    event.target.select();
  }
}

function handleBudgetBeforeInput(event) {
  if (
    event.target.matches("[data-select-on-focus]") &&
    event.target.dataset.replaceOnInput === "true" &&
    event.inputType?.startsWith("insert")
  ) {
    event.target.value = "";
    event.target.dataset.replaceOnInput = "false";
  }
}

function handleBudgetKeydown(event) {
  if (!event.target.matches("[data-select-on-focus]") || event.target.dataset.replaceOnInput !== "true") {
    return;
  }

  if (/^[0-9.,]$/.test(event.key)) {
    event.preventDefault();
    event.target.value = event.key === "," ? "." : event.key;
    event.target.dataset.replaceOnInput = "false";
  }
}

function handleExpenseFormSubmit(event) {
  if (event.target.id !== "expense-form") {
    return;
  }

  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const { errors, values } = validateExpenseForm(formData);
  const mode = String(formData.get("mode") || "create");
  const tripId = String(formData.get("tripId") || "");
  const expenseId = String(formData.get("expenseId") || "");

  if (Object.keys(errors).length > 0) {
    openExpenseForm(
      tripId,
      mode === "edit" ? { ...getExpenseById(expenseId), ...values } : values,
      errors,
      mode
    );
    return;
  }

  if (mode === "edit") {
    updateExpense(expenseId, values);
    showToast("Spesa aggiornata.");
  } else {
    createExpense({ ...values, tripId });
    showToast("Spesa aggiunta.");
  }

  closeModal();
  refreshView();
}

function ensureBudgetHandlers() {
  if (budgetHandlersReady) {
    return;
  }

  document.addEventListener("click", handleBudgetClick);
  document.addEventListener("focusin", handleBudgetFocus);
  document.addEventListener("beforeinput", handleBudgetBeforeInput);
  document.addEventListener("keydown", handleBudgetKeydown);
  document.addEventListener("submit", handleExpenseFormSubmit);
  budgetHandlersReady = true;
}

export function renderBudgetView({ params }) {
  ensureBudgetHandlers();

  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const expenses = getExpensesByTripId(trip.id);
  const flights = getFlightsByTripId(trip.id);
  const stays = getStaysByTripId(trip.id);
  const activities = getActivitiesByTripId(trip.id);
  const ledgerItems = sortLedgerItems(buildLedgerItems({ expenses, flights, stays, activities }));
  const activeStatus = getFilter(trip.id);
  const filteredItems = filterLedgerItems(ledgerItems, activeStatus);
  const summary = calculateDossierBudgetSummary(trip, expenses, flights, stays, activities);
  const currency = trip.currency || "EUR";
  const encodedTripId = encodeURIComponent(trip.id);

  return `
    <section class="page budget-page" data-budget-trip-id="${escapeHtml(trip.id)}" aria-labelledby="budget-title">
      <header class="page__header home-hero">
        <div>
          <p class="page__eyebrow">Registro spese</p>
          <h1 class="page__title" id="budget-title">${escapeHtml(trip.name)}</h1>
          <p class="page__summary">Quanto costa il viaggio, quanto hai gia pagato e quanto resta da pagare.</p>
          ${summary.budgetTotal > 0 ? `<p class="dashboard-header__meta">Budget indicativo: ${formatCurrency(summary.budgetTotal, currency)}</p>` : ""}
        </div>
        <a class="button button--ghost dossier-back-link" href="#/trip/${encodedTripId}">&larr; Dossier</a>
      </header>

      <section class="budget-summary-grid" aria-label="Riepilogo registro spese">
        ${renderSummaryCard("Totale viaggio", formatCurrency(summary.plannedTotal, currency))}
        ${renderSummaryCard("Gia pagato", formatCurrency(summary.paidTotal, currency))}
        ${renderSummaryCard("Da pagare", formatCurrency(summary.unpaidTotal, currency))}
      </section>

      <div class="budget-toolbar">
        <button class="button button--primary" type="button" data-action="open-expense-form" data-trip-id="${escapeHtml(trip.id)}">Aggiungi spesa</button>
        ${renderFilters(trip.id, activeStatus)}
      </div>

      ${renderLedgerList(ledgerItems, filteredItems, currency)}
    </section>
  `;
}
