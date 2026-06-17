import { closeModal, openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import {
  createExpense,
  deleteExpense,
  getExpenseById,
  getExpensesByTripId,
  getTripById,
  updateExpense
} from "../storage.js";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  calculateBudgetSummary,
  escapeHtml,
  formatCurrency,
  formatDate,
  getExpenseCategoryLabel,
  getExpenseStatusLabel
} from "../utils.js";

const budgetFilters = new Map();
let budgetHandlersReady = false;

function getFilters(tripId) {
  return budgetFilters.get(tripId) || {
    status: "all",
    category: "all"
  };
}

function setFilters(tripId, updates) {
  budgetFilters.set(tripId, {
    ...getFilters(tripId),
    ...updates
  });
}

function refreshView() {
  window.dispatchEvent(new CustomEvent("ithaca:refresh"));
}

function sortExpenses(expenses) {
  return [...expenses].sort((a, b) => {
    const dateComparison = String(b.date || "").localeCompare(String(a.date || ""));

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function filterExpenses(expenses, filters) {
  return expenses.filter((expense) => {
    const statusMatch = filters.status === "all" || expense.status === filters.status;
    const categoryMatch = filters.category === "all" || expense.category === filters.category;
    return statusMatch && categoryMatch;
  });
}

function renderMissingTrip() {
  return `
    <section class="page" aria-labelledby="budget-missing-title">
      <article class="panel panel--wide error-card">
        <p class="page__eyebrow">Viaggio non trovato</p>
        <h1 class="page__title" id="budget-missing-title">Budget non disponibile.</h1>
        <p class="page__summary">Il viaggio richiesto non e presente nei dati locali di Ithaca.</p>
        <a class="action-link" href="#/home">Torna alla Home</a>
      </article>
    </section>
  `;
}

function renderSummaryCard(label, value, modifier = "") {
  return `
    <article class="budget-summary-card ${modifier}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function getProgress(summary) {
  if (summary.budgetTotal <= 0) {
    return summary.plannedTotal > 0 ? 100 : 0;
  }

  return Math.min((summary.plannedTotal / summary.budgetTotal) * 100, 100);
}

function renderBudgetProgress(summary, currency) {
  const progress = getProgress(summary);
  const progressLabel = summary.budgetTotal > 0
    ? `${formatCurrency(summary.plannedTotal, currency)} / ${formatCurrency(summary.budgetTotal, currency)}`
    : `${formatCurrency(summary.plannedTotal, currency)} pianificati`;

  return `
    <section class="panel panel--wide budget-progress-card" aria-labelledby="budget-progress-title">
      <div class="budget-progress-card__header">
        <h2 class="panel__title" id="budget-progress-title">Avanzamento budget</h2>
        <span>${progressLabel}</span>
      </div>
      <div class="budget-progress ${summary.isOverBudget ? "is-over" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}">
        <span style="width: ${progress}%"></span>
      </div>
      ${summary.isOverBudget ? `<p class="budget-warning">Budget superato di ${formatCurrency(Math.abs(summary.difference), currency)}</p>` : ""}
    </section>
  `;
}

function renderFilters(tripId, filters) {
  return `
    <section class="budget-filters" aria-label="Filtri budget">
      <div class="segmented-control" role="group" aria-label="Stato pagamento">
        ${[
          ["all", "Tutte"],
          ["paid", "Pagate"],
          ["unpaid", "Da pagare"]
        ].map(([value, label]) => `
          <button class="segmented-control__button" type="button" data-action="filter-expense-status" data-trip-id="${escapeHtml(tripId)}" data-filter-value="${value}" aria-pressed="${filters.status === value}">
            ${label}
          </button>
        `).join("")}
      </div>

      <label class="select-filter">
        <span>Categoria</span>
        <select data-action="filter-expense-category" data-trip-id="${escapeHtml(tripId)}">
          <option value="all" ${filters.category === "all" ? "selected" : ""}>Tutte le categorie</option>
          ${EXPENSE_CATEGORIES.map((category) => `
            <option value="${category}" ${filters.category === category ? "selected" : ""}>${getExpenseCategoryLabel(category)}</option>
          `).join("")}
        </select>
      </label>
    </section>
  `;
}

function renderEmptyState() {
  return `
    <article class="empty-state">
      <h2>Nessuna spesa ancora</h2>
      <p>Aggiungi voli, hotel, trasporti e attivita per tenere il budget sotto controllo.</p>
      <button class="button button--primary" type="button" data-action="open-expense-form">Aggiungi prima spesa</button>
    </article>
  `;
}

function renderNoFilterResults() {
  return `
    <article class="panel panel--wide">
      <h2 class="panel__title">Nessun risultato</h2>
      <p class="panel__body">Nessuna spesa corrisponde ai filtri selezionati.</p>
    </article>
  `;
}

function renderExpenseCard(expense, currency) {
  const notes = String(expense.notes || "").trim();

  return `
    <article class="expense-card">
      <div class="expense-card__main">
        <div>
          <h2 class="expense-card__title">${escapeHtml(expense.name)}</h2>
          <p class="expense-card__meta">
            <span class="badge">${getExpenseCategoryLabel(expense.category)}</span>
            <span class="badge ${expense.status === "paid" ? "badge--success" : "badge--warning"}">${getExpenseStatusLabel(expense.status)}</span>
          </p>
        </div>
        <strong class="expense-card__amount">${formatCurrency(expense.amount, currency)}</strong>
      </div>
      <p class="expense-card__date">${formatDate(expense.date)}</p>
      ${notes ? `<p class="expense-card__notes">${escapeHtml(notes)}</p>` : ""}
      <div class="trip-card__actions" aria-label="Azioni spesa">
        <button class="button button--small button--ghost" type="button" data-action="edit-expense" data-expense-id="${escapeHtml(expense.id)}">Modifica</button>
        <button class="button button--small button--danger-ghost" type="button" data-action="delete-expense" data-expense-id="${escapeHtml(expense.id)}">Elimina</button>
      </div>
    </article>
  `;
}

function renderExpenseList(expenses, filteredExpenses, currency) {
  if (expenses.length === 0) {
    return renderEmptyState();
  }

  if (filteredExpenses.length === 0) {
    return renderNoFilterResults();
  }

  return `
    <section class="expense-list" aria-label="Spese viaggio">
      ${filteredExpenses.map((expense) => renderExpenseCard(expense, currency)).join("")}
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
          <label for="expense-amount">Importo</label>
          <input id="expense-amount" name="amount" type="number" min="0" step="0.01" value="${escapeHtml(expense?.amount ?? "")}" data-select-on-focus onfocus="this.select()" onclick="this.select()" required>
          ${fieldError(errors, "amount")}
        </div>

        <div class="form-field">
          <label for="expense-date">Data</label>
          <input id="expense-date" name="date" type="date" value="${escapeHtml(expense?.date || "")}" required>
          ${fieldError(errors, "date")}
        </div>
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
          <label for="expense-status">Stato pagamento</label>
          <select id="expense-status" name="status" required>
            ${EXPENSE_STATUSES.map((status) => `
              <option value="${status}" ${expense?.status === status ? "selected" : ""}>${getExpenseStatusLabel(status)}</option>
            `).join("")}
          </select>
          ${fieldError(errors, "status")}
        </div>
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

  if (!date) {
    errors.date = "Data obbligatoria.";
  }

  return {
    errors,
    values: {
      name,
      amount,
      category,
      status,
      date,
      notes
    }
  };
}

function openExpenseForm(tripId, expense = null, errors = {}, modeOverride = null) {
  openModal({
    title: modeOverride === "create" || !expense?.id ? "Aggiungi spesa" : "Modifica spesa",
    content: renderExpenseForm({ tripId, expense, errors, modeOverride })
  });
}

function openDeleteConfirmation(expense) {
  openModal({
    title: "Elimina spesa",
    content: `
      <div class="confirm-dialog">
        <p>Vuoi eliminare <strong>${escapeHtml(expense.name)}</strong> dal budget?</p>
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
    setFilters(tripId, { status: actionTarget.dataset.filterValue || "all" });
    refreshView();
  }

  if (action === "close-modal") {
    closeModal();
  }
}

function handleBudgetChange(event) {
  const actionTarget = event.target.closest("[data-action]");

  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;
  const tripId = actionTarget.dataset.tripId;

  if (action === "filter-expense-category" && tripId) {
    setFilters(tripId, { category: actionTarget.value || "all" });
    refreshView();
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
  document.addEventListener("change", handleBudgetChange);
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

  const expenses = sortExpenses(getExpensesByTripId(trip.id));
  const filters = getFilters(trip.id);
  const filteredExpenses = filterExpenses(expenses, filters);
  const summary = calculateBudgetSummary(trip, expenses);
  const currency = trip.currency || "EUR";
  const encodedTripId = encodeURIComponent(trip.id);

  return `
    <section class="page budget-page" data-budget-trip-id="${escapeHtml(trip.id)}" aria-labelledby="budget-title">
      <header class="page__header home-hero">
        <div>
          <p class="page__eyebrow">Budget</p>
          <h1 class="page__title" id="budget-title">${escapeHtml(trip.name)}</h1>
          <p class="page__summary">Budget previsto: ${formatCurrency(summary.budgetTotal, currency)}</p>
        </div>
        <a class="button button--ghost" href="#/trip/${encodedTripId}">Torna alla dashboard</a>
      </header>

      <section class="budget-summary-grid" aria-label="Riepilogo budget">
        ${renderSummaryCard("Budget totale", formatCurrency(summary.budgetTotal, currency))}
        ${renderSummaryCard("Pagato", formatCurrency(summary.paidTotal, currency))}
        ${renderSummaryCard("Da pagare", formatCurrency(summary.unpaidTotal, currency))}
        ${renderSummaryCard("Rimanente", formatCurrency(summary.remaining, currency), summary.isOverBudget ? "is-negative" : "")}
      </section>

      ${renderBudgetProgress(summary, currency)}

      <div class="budget-toolbar">
        <button class="button button--primary" type="button" data-action="open-expense-form" data-trip-id="${escapeHtml(trip.id)}">Aggiungi spesa</button>
        ${renderFilters(trip.id, filters)}
      </div>

      ${renderExpenseList(expenses, filteredExpenses, currency)}
    </section>
  `;
}
