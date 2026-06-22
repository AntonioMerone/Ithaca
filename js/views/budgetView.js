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
import { ensureDashboardHandlers } from "./tripDashboardView.js";
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
  getPaymentBreakdown,
  getStayTypeLabel
} from "../utils.js";

const budgetFilters = new Map();
let budgetHandlersReady = false;
const ZERO_COST_WARNING_COPY = "Costo 0 € con pagamento segnato: controlla se il dato è corretto.";

const ORIGIN_ORDER = {
  manual: 0,
  flight: 1,
  stay: 2,
  activity: 3
};

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

function getStatusBadgeClass(status) {
  return getDossierPaymentStatusBadge(status);
}

function getStatusLabel(status) {
  return status === "partial" ? "Parziale" : getExpenseStatusLabel(status);
}

function cleanLabel(value) {
  return String(value || "").trim();
}

function getManualExpenseTypeLabel(category) {
  const normalizedCategory = cleanLabel(category);

  return normalizedCategory ? getExpenseCategoryLabel(normalizedCategory) : "";
}

function getFlightLedgerCopy(flight) {
  const identity = [flight.airline, flight.flightNumber].map(cleanLabel).filter(Boolean).join(" ");
  const route = [flight.from, flight.to].map(cleanLabel).filter(Boolean).join(" -> ");

  return {
    title: identity || route || "Volo",
    meta: identity && route ? route : ""
  };
}

function buildLedgerItems({ expenses, flights, stays, activities }) {
  const manualItems = expenses.map((expense) => {
    const breakdown = getPaymentBreakdown(expense, "amount", "status");
    const categoryLabel = getManualExpenseTypeLabel(expense.category);

    return {
      id: expense.id,
      origin: "manual",
      source: "expenses",
      originLabel: "Spesa",
      title: expense.name || "Spesa manuale",
      totalAmount: breakdown.totalAmount,
      paidAmount: breakdown.paidAmount,
      dueAmount: breakdown.dueAmount,
      status: breakdown.status,
      date: expense.date || "",
      createdAt: expense.createdAt || "",
      meta: categoryLabel,
      typeLabel: categoryLabel,
      notes: expense.notes || "",
      editable: true
    };
  });

  const flightItems = flights.map((flight) => {
    const breakdown = getPaymentBreakdown(flight);
    const copy = getFlightLedgerCopy(flight);

    return {
      id: flight.id,
      origin: "flight",
      source: "flights",
      originLabel: "Volo",
      title: copy.title,
      totalAmount: breakdown.totalAmount,
      paidAmount: breakdown.paidAmount,
      dueAmount: breakdown.dueAmount,
      status: breakdown.status,
      date: flight.departureDate || "",
      createdAt: flight.createdAt || "",
      meta: copy.meta,
      typeLabel: "Trasporto",
      notes: flight.notes || "",
      editable: true
    };
  });

  const stayItems = stays.map((stay) => {
    const breakdown = getPaymentBreakdown(stay);

    return {
      id: stay.id,
      origin: "stay",
      source: "stays",
      originLabel: "Alloggio",
      title: stay.structureName || "Alloggio",
      totalAmount: breakdown.totalAmount,
      paidAmount: breakdown.paidAmount,
      dueAmount: breakdown.dueAmount,
      status: breakdown.status,
      date: stay.checkInDate || "",
      createdAt: stay.createdAt || "",
      meta: stay.bookingNumber ? `Prenotazione ${stay.bookingNumber}` : getStayTypeLabel(stay.structureType),
      typeLabel: getStayTypeLabel(stay.structureType),
      notes: stay.notes || "",
      editable: true
    };
  });

  const activityItems = activities.map((activity) => {
    const breakdown = getPaymentBreakdown(activity);

    return {
      id: activity.id,
      origin: "activity",
      source: "activities",
      originLabel: "Attivita",
      title: activity.name || getActivityTypeLabel(activity.type),
      totalAmount: breakdown.totalAmount,
      paidAmount: breakdown.paidAmount,
      dueAmount: breakdown.dueAmount,
      status: breakdown.status,
      date: activity.date || "",
      createdAt: activity.createdAt || "",
      typeLabel: getActivityTypeLabel(activity.type),
      meta: [getActivityTypeLabel(activity.type), activity.location].filter(Boolean).join(" · "),
      notes: activity.notes || "",
      editable: true
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

function filterLedgerItems(items, filters) {
  return items.filter((item) => {
    const statusMatch = filters.status === "all" || item.status === filters.status;
    const sourceMatch = filters.source === "all" || item.source === filters.source;
    return statusMatch && sourceMatch;
  });
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
          ["unpaid", "Da pagare"],
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
          ["expenses", "Spese"]
        ]
      })}
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
      <p class="panel__body">Nessun elemento trovato per i filtri selezionati.</p>
    </article>
  `;
}

function renderLedgerPayment(item, currency) {
  return item.status === "partial"
    ? `
      <p class="payment-breakdown expense-card__payment">
        Pagato ${formatCurrency(item.paidAmount, currency)} &middot; Da pagare ${formatCurrency(item.dueAmount, currency)}
      </p>
    `
    : "";
}

function getLedgerDateLabel(item) {
  const labels = {
    flights: "Data volo",
    stays: "Check-in",
    activities: "Data attività",
    expenses: "Scadenza"
  };

  return labels[item.source] || "Data";
}

function renderLedgerActions(item) {
  if (!item.editable) {
    return "";
  }

  const editActions = {
    expenses: {
      action: "edit-expense",
      idName: "expense-id",
      label: "Azioni spesa manuale"
    },
    flights: {
      action: "edit-flight",
      idName: "flight-id",
      label: "Azioni volo"
    },
    stays: {
      action: "edit-stay",
      idName: "stay-id",
      label: "Azioni soggiorno"
    },
    activities: {
      action: "edit-activity",
      idName: "activity-id",
      label: "Azioni attivita"
    }
  };
  const editAction = editActions[item.source];

  if (!editAction) {
    return "";
  }

  return `
    <div class="trip-card__actions" aria-label="${editAction.label}">
      <button class="button button--small button--ghost" type="button" data-action="${editAction.action}" data-${editAction.idName}="${escapeHtml(item.id)}">Modifica</button>
      ${item.source === "expenses" ? `<button class="button button--small button--danger-ghost" type="button" data-action="delete-expense" data-expense-id="${escapeHtml(item.id)}">Elimina</button>` : ""}
    </div>
  `;
}

function renderLedgerCard(item, currency) {
  const notes = String(item.notes || "").trim();

  return `
    <article class="expense-card expense-card--${escapeHtml(item.source)}">
      <div class="expense-card__header">
        <p class="expense-card__meta">
          <span>${escapeHtml(item.originLabel)}</span>
          ${item.typeLabel ? `<span>${escapeHtml(item.typeLabel)}</span>` : ""}
        </p>
      </div>
      <div class="expense-card__main">
        <h2 class="expense-card__title">${escapeHtml(item.title)}</h2>
        <p class="expense-card__status">
          <span class="badge ${getStatusBadgeClass(item.status)}">${escapeHtml(getStatusLabel(item.status))}</span>
          <strong>${formatCurrency(item.totalAmount, currency)}</strong>
        </p>
      </div>
      ${renderLedgerPayment(item, currency)}
      ${item.date ? `<p class="expense-card__date">${getLedgerDateLabel(item)}: ${formatDate(item.date)}</p>` : `<p class="expense-card__date">Senza data</p>`}
      ${item.meta ? `<p class="expense-card__detail">${escapeHtml(item.meta)}</p>` : ""}
      ${notes ? `<p class="expense-card__notes">${escapeHtml(notes)}</p>` : ""}
      ${renderLedgerActions(item)}
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

function updateZeroCostWarning(form) {
  const warning = form.querySelector("[data-zero-cost-warning]");

  if (!warning) {
    return;
  }

  warning.hidden = !shouldShowZeroCostWarning(form.elements.amount?.value, form.elements.status?.value);
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
    setFilter(tripId, { status: actionTarget.dataset.filterValue || "all" });
    refreshView();
  }

  if (action === "filter-expense-source" && tripId) {
    setFilter(tripId, { source: actionTarget.dataset.filterValue || "all" });
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
  document.addEventListener("input", handleBudgetFormInput);
  document.addEventListener("change", handleBudgetFormInput);
  document.addEventListener("submit", handleExpenseFormSubmit);
  budgetHandlersReady = true;
}

export function renderBudgetView({ params }) {
  ensureBudgetHandlers();
  ensureDashboardHandlers();

  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const expenses = getExpensesByTripId(trip.id);
  const flights = getFlightsByTripId(trip.id);
  const stays = getStaysByTripId(trip.id);
  const activities = getActivitiesByTripId(trip.id);
  const ledgerItems = sortLedgerItems(buildLedgerItems({ expenses, flights, stays, activities }));
  const filters = getFilter(trip.id);
  const filteredItems = filterLedgerItems(ledgerItems, filters);
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
        ${renderFilters(trip.id, filters)}
      </div>

      ${renderLedgerList(ledgerItems, filteredItems, currency)}
    </section>
  `;
}
