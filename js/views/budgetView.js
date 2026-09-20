import { entryDefaults } from "../entryContext.js";
import { selectLedger, summarizeBudget } from "../selectors.js";
import { renderRecordRow } from "../components/recordRow.js";
import { getData } from "../storage.js";
import { closeModal, openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { createExpense, deleteExpense, getExpenseById, getTripById, updateExpense } from "../storage.js";
import { ensureDashboardHandlers } from "./dossierForms.js";
import { EXPENSE_STATUSES, escapeHtml, formatCurrency, getExpenseStatusLabel, validatePaymentAllocation } from "../utils.js";

const budgetFilters = new Map();
let budgetHandlersReady = false;
const ZERO_COST_WARNING_COPY = "Costo 0 € con pagamento segnato: controlla se il dato è corretto.";

function getFilter(tripId) {
  return budgetFilters.get(tripId) || {
    status: "all",
    source: "all"
  };
}

function setFilter(tripId, updates) {
  budgetFilters.set(tripId, {
    ...getFilter(tripId),
    ...updates
  });
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

function filterLedgerItems(items, filters) {
  return items.filter(item => (filters.status === "all" || (filters.status === "due" ? item.dueAmount > 0 : item.status === filters.status)) && (filters.source === "all" || item.source === filters.source));
}

function renderSegmentedFilter({ tripId, label, action, activeValue, options, className = "" }) {
  return `
    <div class="budget-filter-group">
      <span>${label}</span>
      <section class="segmented-control ${className}" aria-label="${escapeHtml(label)}">
        ${options.map(([value, optionLabel]) => `
          <button class="segmented-control__button" type="button" data-action="${action}" data-trip-id="${escapeHtml(tripId)}" data-filter-value="${value}" aria-pressed="${activeValue === value}">
            ${optionLabel}
          </button>
        `).join("")}
      </section>
    </div>
  `;
}

function renderFilters(tripId, filters) {
  return `
    <section class="budget-filters" aria-label="Filtri registro spese">
      ${renderSegmentedFilter({
        tripId,
        label: "Stato pagamento",
        action: "filter-expense-status",
        activeValue: filters.status,
        className: "budget-status-filter",
        options: [
          ["all", "Tutte"],
          ["due", "Da pagare"],
          ["partial", "Parziali"],
          ["paid", "Pagate"]
        ]
      })}
      ${renderSegmentedFilter({
        tripId,
        label: "Tipologia",
        action: "filter-expense-source",
        activeValue: filters.source,
        className: "budget-source-filter",
        options: [
          ["all", "Tutte"],
          ["flights", "Voli"],
          ["stays", "Alloggi"],
          ["activities", "Attivita"],
          ["expenses", "Spese"], ["timelineItems", "Eventi"]
        ]
      })}
    </section>
  `;
}

function renderEmptyState() {
  return `
    <article class="empty-state">
      <h2>Nessuna voce nel registro</h2>
      <p>Aggiungi una spesa o inserisci voli, soggiorni e attivita.</p>
      <button class="button button--primary" type="button" data-action="open-expense-form">Aggiungi spesa</button>
    </article>
  `;
}

function renderNoFilterResults() {
  return `
    <article class="panel panel--wide">
      <h2 class="panel__title">Nessun risultato</h2>
      <p class="panel__body">Nessun elemento trovato per i filtri selezionati.</p>
    </article>
  `;
}

function renderLedgerList(allItems, filteredItems, currency) {
  if (!allItems.length) return renderEmptyState();
  if (!filteredItems.length) return renderNoFilterResults();
  return `<div class="record-list">${filteredItems.map(item => renderRecordRow(item, currency, { quickPayment: true, deletable: item.source === "expenses", detail: `${item.categoryLabel} · Pagato ${formatCurrency(item.paidAmount, currency)} · Da pagare ${formatCurrency(item.dueAmount, currency)}` })).join("")}</div>`;
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

function shouldShowZeroCostWarning(amountValue, status) {
  const cleanValue = String(amountValue ?? "").trim();

  if (!cleanValue) {
    return false;
  }

  const amount = Number(cleanValue);
  return Number.isFinite(amount) && amount === 0 && ["paid", "partial"].includes(status);
}

function renderZeroCostWarning(amountValue, status) {
  const hidden = shouldShowZeroCostWarning(amountValue, status) ? "" : " hidden";

  return `<p class="form-warning" data-zero-cost-warning${hidden}>${ZERO_COST_WARNING_COPY}</p>`;
}

function isPaidAmountVisible(status) {
  return status === "partial";
}

function renderPaidAmountAttributes(status, amountValue) {
  if (isPaidAmountVisible(status)) {
    return "";
  }

  return " disabled";
}

function getPaidAmountFieldValue(status, amountValue, paidAmount) {
  if (status === "paid") {
    return normalizeCost(amountValue);
  }

  if (status === "unpaid") {
    return 0;
  }

  return paidAmount || "";
}

function updateZeroCostWarning(form) {
  const warning = form.querySelector("[data-zero-cost-warning]");

  if (!warning) {
    return;
  }

  warning.hidden = !shouldShowZeroCostWarning(form.elements.amount?.value, form.elements.status?.value);
}

function updatePaidAmountField(form) {
  const field = form.querySelector("[data-paid-amount-field]");
  const input = form.elements.paidAmount;

  if (!field || !input) {
    return;
  }

  const status = form.elements.status?.value || "unpaid";
  field.hidden = !isPaidAmountVisible(status);
  input.disabled = !isPaidAmountVisible(status);

  if (status === "unpaid") {
    input.value = "0";
  }

  if (status === "paid") {
    input.value = String(normalizeCost(form.elements.amount?.value));
  }
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
          <input id="expense-category" name="category" type="text" value="${escapeHtml(expense?.category || "")}" autocomplete="off">
          ${fieldError(errors, "category")}
        </div>

        <div class="form-field">
          <label for="expense-amount">Importo</label>
          <input id="expense-amount" name="amount" type="number" min="0" step="0.01" value="${escapeHtml(expense?.amount ?? "")}" data-select-on-focus onfocus="this.select()" onclick="this.select()">
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

        <div class="form-field" data-paid-amount-field ${isPaidAmountVisible(expense?.status || "unpaid") ? "" : "hidden"}>
          <label for="expense-paid-amount">Importo pagato, se parziale</label>
          <input id="expense-paid-amount" name="paidAmount" type="number" min="0" step="0.01" value="${escapeHtml(getPaidAmountFieldValue(expense?.status || "unpaid", expense?.amount ?? "", expense?.paidAmount))}"${renderPaidAmountAttributes(expense?.status || "unpaid", expense?.amount ?? "")}>
          ${fieldError(errors, "paidAmount")}
        </div>
      </div>
      ${renderZeroCostWarning(expense?.amount ?? "", expense?.status || "unpaid")}

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
  const category = String(formData.get("category") || "other").trim();
  const status = String(formData.get("status") || "").trim();
  const paidAmount = parseOptionalAmount(formData.get("paidAmount"));
  const date = String(formData.get("date") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const amount = amountValue === "" ? 0 : Number(amountValue);

  if (!name) {
    errors.name = "Nome spesa obbligatorio.";
  }

  if (!Number.isFinite(amount) || amount < 0) {
    errors.amount = "Importo deve essere un numero maggiore o uguale a 0.";
  }

  if (!category) {
    errors.category = "Categoria obbligatoria.";
  }

  if (!EXPENSE_STATUSES.includes(status)) {
    errors.status = "Stato pagamento obbligatorio.";
  }

  if (Number.isNaN(paidAmount) || paidAmount < 0) {
    errors.paidAmount = "Importo pagato deve essere un numero maggiore o uguale a 0.";
  }

  const paymentValidation = validatePaymentAllocation({
    totalAmount: Number.isFinite(amount) ? amount : 0,
    paymentStatus: status,
    paidAmount
  });

  if (!errors.paidAmount && paymentValidation.error) {
    errors.paidAmount = paymentValidation.error;
  }

  return {
    errors,
    values: {
      name,
      amount,
      category,
      status,
      paidAmount: Number.isNaN(paidAmount) ? 0 : paymentValidation.paidAmount,
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
    openExpenseForm(tripId, entryDefaults("expense", getTripById(tripId), actionTarget.dataset.date));
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
    setFilter(tripId, { status: actionTarget.dataset.filterValue || "all" });
    if (location.hash.endsWith("/due")) location.hash = `#/trip/${encodeURIComponent(tripId)}/budget`;
    refreshView();
  }

  if (action === "filter-expense-source" && tripId) {
    setFilter(tripId, { source: actionTarget.dataset.filterValue || "all", ...(location.hash.endsWith("/due") ? { status: "due" } : {}) });
    if (location.hash.endsWith("/due")) location.hash = `#/trip/${encodeURIComponent(tripId)}/budget`;
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

function handleBudgetFormInput(event) {
  if (!["amount", "status"].includes(event.target.name)) {
    return;
  }

  const form = event.target.closest("#expense-form");

  if (form) {
    updateZeroCostWarning(form);
    updatePaidAmountField(form);
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
    showToast("Budget aggiornato.");
  } else {
    createExpense({ ...values, tripId });
    showToast("Budget aggiunto.");
  }

  closeModal();
  refreshView();
}

export function ensureBudgetHandlers() {
  if (budgetHandlersReady) {
    return;
  }

  document.addEventListener("click", handleBudgetClick);
  document.addEventListener("focusin", handleBudgetFocus);
  document.addEventListener("beforeinput", handleBudgetBeforeInput);
  document.addEventListener("keydown", handleBudgetKeydown);
  document.addEventListener("input", handleBudgetFormInput);
  document.addEventListener("change", handleBudgetFormInput);
  document.addEventListener("submit", handleExpenseFormSubmit);
  budgetHandlersReady = true;
}

export function renderBudgetView({ params, dueOnly = false }) {
  ensureBudgetHandlers();
  ensureDashboardHandlers();

  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const data = getData();
  const ledgerItems = selectLedger(data, trip.id).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const filters = dueOnly ? { ...getFilter(trip.id), status: "due", source: "all" } : getFilter(trip.id);
  const filteredItems = filterLedgerItems(ledgerItems, filters);
  const summary = summarizeBudget(trip, ledgerItems);
  const categories = new Map();
  ledgerItems.forEach(item => categories.set(item.categoryLabel, (categories.get(item.categoryLabel) || 0) + Math.round(item.totalAmount * 100)));
  const currency = trip.currency || "EUR";
  const encodedTripId = encodeURIComponent(trip.id);

  return `
    <section class="page budget-page" data-budget-trip-id="${escapeHtml(trip.id)}" aria-labelledby="budget-title">
      <header class="page__header">
        <div>
          <p class="page__eyebrow">${escapeHtml(trip.name)}</p>
          <h1 class="page__title" id="budget-title">Budget</h1>
          <p class="page__summary">Quanto costa il viaggio, quanto hai gia pagato e quanto resta da pagare.</p>
        </div>
        <a class="button button--ghost dossier-back-link" href="#/trip/${encodedTripId}">&larr; Viaggio</a>
      </header>

      <section class="budget-summary-grid" aria-label="Riepilogo registro spese">
        ${renderSummaryCard("Totale previsto", formatCurrency(summary.plannedTotal, currency))}
        ${renderSummaryCard("Gia pagato", formatCurrency(summary.paidTotal, currency))}
        ${renderSummaryCard("Da pagare", formatCurrency(summary.unpaidTotal, currency))}
      </section>

      ${summary.budgetTotal ? `<div class="budget-limit"><p>Budget: <strong>${formatCurrency(summary.budgetTotal, currency)}</strong> · ${summary.isOverBudget ? `Oltre di ${formatCurrency(-summary.remaining, currency)}` : `Disponibili ${formatCurrency(summary.remaining, currency)}`}</p><progress max="${summary.budgetTotal}" value="${Math.min(summary.plannedTotal, summary.budgetTotal)}" aria-label="Budget utilizzato"></progress></div>` : ""}
      <button class="text-link" type="button" data-action="edit-trip" data-trip-id="${escapeHtml(trip.id)}">${summary.budgetTotal ? "Modifica limite" : "Imposta un budget"}</button>
      ${categories.size ? `<details class="budget-categories"><summary>Per categoria</summary><dl>${[...categories].map(([label, amount]) => `<div><dt>${escapeHtml(label)}</dt><dd>${formatCurrency(amount / 100, currency)}</dd></div>`).join("")}</dl></details>` : ""}
      <div class="budget-toolbar">
        <button class="button button--primary" type="button" data-action="open-expense-form" data-trip-id="${escapeHtml(trip.id)}">Aggiungi spesa</button>
        ${renderFilters(trip.id, filters)}
      </div>

      ${renderLedgerList(ledgerItems, filteredItems, currency)}
    </section>
  `;
}
