export function generateId(prefix = "id") {
  const randomPart = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${randomPart}`;
}

export const createId = generateId;

export const EXPENSE_CATEGORIES = [
  "flights",
  "accommodation",
  "transport",
  "activities",
  "food",
  "extras",
  "emergencies",
  "other"
];

export const EXPENSE_STATUSES = ["paid", "unpaid"];

function parseDate(value) {
  if (!value) {
    return null;
  }

  const [year, month, day] = String(value).split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function daysBetween(start, end) {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.round((end - start) / millisecondsPerDay);
}

export function formatDate(value, locale = "it-IT") {
  const date = parseDate(value);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function formatCurrency(value, currency = "EUR", locale = "it-IT") {
  const amount = Number(value || 0);
  const symbol = {
    EUR: "\u20ac",
    USD: "$",
    GBP: "\u00a3"
  }[currency] || currency;

  if (locale !== "it-IT") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency
    }).format(amount);
  }

  const sign = amount < 0 ? "-" : "";
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const hasDecimals = !Number.isInteger(rounded);
  const parts = rounded.toFixed(hasDecimals ? 2 : 0).split(".");
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimalPart = parts[1] ? `,${parts[1]}` : "";

  return `${sign}${integerPart}${decimalPart} ${symbol}`;
}

export function calculateBudgetSummary(trip, expenses = []) {
  const budgetTotal = Number(trip?.budgetTotal || 0);
  const paidTotal = expenses.reduce((total, expense) => {
    return total + (expense.status === "paid" ? Number(expense.amount || 0) : 0);
  }, 0);
  const unpaidTotal = expenses.reduce((total, expense) => {
    return total + (expense.status === "unpaid" ? Number(expense.amount || 0) : 0);
  }, 0);
  const plannedTotal = paidTotal + unpaidTotal;
  const difference = budgetTotal - plannedTotal;

  return {
    budgetTotal,
    paidTotal,
    unpaidTotal,
    plannedTotal,
    remaining: difference,
    difference,
    isOverBudget: plannedTotal > budgetTotal
  };
}

export function groupExpensesByCategory(expenses = []) {
  return expenses.reduce((groups, expense) => {
    const category = EXPENSE_CATEGORIES.includes(expense.category) ? expense.category : "other";
    groups[category] = groups[category] || [];
    groups[category].push(expense);
    return groups;
  }, {});
}

export function getExpenseCategoryLabel(category) {
  const labels = {
    flights: "Voli",
    accommodation: "Alloggi",
    transport: "Trasporti",
    activities: "Attivita",
    food: "Cibo",
    extras: "Extra",
    emergencies: "Emergenze",
    other: "Altro"
  };

  return labels[category] || labels.other;
}

export function getExpenseStatusLabel(status) {
  const labels = {
    paid: "Pagato",
    unpaid: "Da pagare"
  };

  return labels[status] || labels.unpaid;
}

export function calculateTripDuration(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (!start || !end || end < start) {
    return 0;
  }

  return daysBetween(start, end) + 1;
}

export function getDaysUntilTrip(startDate) {
  const start = parseDate(startDate);

  if (!start) {
    return null;
  }

  return daysBetween(startOfToday(), start);
}

export function determineTripStatus(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (!start) {
    return "future";
  }

  const today = startOfToday();
  const daysToStart = daysBetween(today, start);

  if (daysToStart > 0) {
    return "future";
  }

  if (daysToStart === 0) {
    return "starts_today";
  }

  if (end && today <= end) {
    return "ongoing";
  }

  return "past";
}

export function calculateCountdown(startDate, endDate = null) {
  const status = determineTripStatus(startDate, endDate);
  const daysToStart = getDaysUntilTrip(startDate);

  if (daysToStart === null) {
    return "";
  }

  if (status === "future" && daysToStart > 1) {
    return `Partenza tra ${daysToStart} giorni`;
  }

  if (status === "future") {
    return "Parte domani";
  }

  if (status === "starts_today") {
    return "Parte oggi";
  }

  if (status === "ongoing") {
    return "In corso";
  }

  return "Concluso";
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
