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

export const EXPENSE_STATUSES = ["unpaid", "partial", "paid"];

export const TIMELINE_TYPES = [
  "flight",
  "hotel",
  "transport",
  "activity",
  "food",
  "note",
  "other"
];

export const TIMELINE_PAYMENT_STATUSES = ["paid", "unpaid", "none"];

export const CHECKLIST_SECTIONS = [
  "pre_departure",
  "during_trip",
  "after_trip"
];

export const DOSSIER_PAYMENT_STATUSES = ["unpaid", "partial", "paid"];

export const FLIGHT_TYPES = ["andata", "ritorno", "interno", "scalo", "altro"];

export const STAY_TYPES = ["hotel", "appartamento", "bnb", "ostello", "resort", "altro"];

export const ACTIVITY_TYPES = ["escursione", "visita", "ristorante", "trasporto", "altro"];

export const PAYMENT_VALIDATION_MESSAGES = {
  unpaidWithPaidAmount: 'Hai selezionato "Da pagare". Se hai gia pagato una parte, imposta lo stato su "Parziale".',
  invalidPartial: "Per un pagamento parziale, l'importo pagato deve essere maggiore di 0 e inferiore al totale."
};

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

function normalizeBudgetEstimate(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function normalizeDateValue(value) {
  return parseDate(value) ? String(value) : "";
}

function createDestinationFromString(value, index, trip = {}) {
  const name = String(value || "").trim();
  const isSingleDestination = Array.isArray(trip?.destinations) && trip.destinations.length === 1;

  return {
    id: generateId("dest"),
    name,
    arrivalDate: isSingleDestination ? normalizeDateValue(trip.startDate) : "",
    departureDate: isSingleDestination ? normalizeDateValue(trip.endDate) : "",
    hotel: "",
    hotelCheckIn: "",
    hotelCheckOut: "",
    budgetEstimate: null,
    notes: ""
  };
}

export function normalizeDestinations(destinations = [], trip = {}) {
  const source = Array.isArray(destinations)
    ? destinations
    : String(destinations || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return source
    .map((destination, index) => {
      if (typeof destination === "string") {
        return createDestinationFromString(destination, index, {
          ...trip,
          destinations: source
        });
      }

      if (!destination || typeof destination !== "object") {
        return null;
      }

      return {
        id: String(destination.id || generateId("dest")),
        name: String(destination.name || "").trim(),
        arrivalDate: normalizeDateValue(destination.arrivalDate),
        departureDate: normalizeDateValue(destination.departureDate),
        hotel: String(destination.hotel || "").trim(),
        hotelCheckIn: normalizeDateValue(destination.hotelCheckIn),
        hotelCheckOut: normalizeDateValue(destination.hotelCheckOut),
        budgetEstimate: normalizeBudgetEstimate(destination.budgetEstimate),
        notes: String(destination.notes || "").trim()
      };
    })
    .filter((destination) => destination && destination.name);
}

export function calcNights(arrivalDate, departureDate) {
  const arrival = parseDate(arrivalDate);
  const departure = parseDate(departureDate);

  if (!arrival || !departure || departure <= arrival) {
    return null;
  }

  return daysBetween(arrival, departure);
}

export function calcDestinationsBudget(destinations = []) {
  return normalizeDestinations(destinations).reduce((total, destination) => {
    return total + (destination.budgetEstimate === null ? 0 : destination.budgetEstimate);
  }, 0);
}

export function formatDestinationRange(arrivalDate, departureDate) {
  if (arrivalDate && departureDate) {
    return `${formatDate(arrivalDate)} - ${formatDate(departureDate)}`;
  }

  if (arrivalDate) {
    return `Da ${formatDate(arrivalDate)}`;
  }

  if (departureDate) {
    return `Fino a ${formatDate(departureDate)}`;
  }

  return "";
}

function toDateKey(value) {
  const date = value ? parseDate(value) || new Date(value) : startOfToday();

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export function getCurrentDestination(destinations = [], today = null) {
  const todayKey = toDateKey(today);

  if (!todayKey) {
    return null;
  }

  return normalizeDestinations(destinations).find((destination) => {
    return destination.arrivalDate && destination.departureDate
      && destination.arrivalDate <= todayKey
      && destination.departureDate >= todayKey;
  }) || null;
}

export function getNextDestination(destinations = [], today = null) {
  const todayKey = toDateKey(today);

  if (!todayKey) {
    return null;
  }

  return normalizeDestinations(destinations)
    .filter((destination) => destination.arrivalDate && destination.arrivalDate >= todayKey)
    .sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate))[0] || null;
}

export function calculateBudgetSummary(trip, expenses = []) {
  const budgetTotal = Number(trip?.budgetTotal || 0);
  const paidTotal = expenses.reduce((total, expense) => total + getPaymentBreakdown(expense, "amount", "status").paidAmount, 0);
  const unpaidTotal = expenses.reduce((total, expense) => total + getPaymentBreakdown(expense, "amount", "status").dueAmount, 0);
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

function getDossierItemCost(item) {
  const amount = Number(item?.cost || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function normalizeLedgerAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function getPaymentBreakdown(item, amountField = "cost", statusField = "paymentStatus") {
  const totalAmount = normalizeLedgerAmount(item?.[amountField]);
  const status = DOSSIER_PAYMENT_STATUSES.includes(item?.[statusField]) ? item[statusField] : "unpaid";
  const rawPaidAmount = normalizeLedgerAmount(item?.paidAmount);

  if (status === "paid") {
    return {
      totalAmount,
      paidAmount: totalAmount,
      dueAmount: 0,
      status
    };
  }

  if (status === "partial") {
    const paidAmount = Math.min(rawPaidAmount, totalAmount);

    return {
      totalAmount,
      paidAmount,
      dueAmount: Math.max(totalAmount - paidAmount, 0),
      status
    };
  }

  return {
    totalAmount,
    paidAmount: 0,
    dueAmount: totalAmount,
    status
  };
}

export function validatePaymentAllocation({ totalAmount = 0, paymentStatus = "unpaid", paidAmount = 0 } = {}) {
  const safeTotal = normalizeLedgerAmount(totalAmount);
  const status = DOSSIER_PAYMENT_STATUSES.includes(paymentStatus) ? paymentStatus : "unpaid";
  const safePaid = normalizeLedgerAmount(paidAmount);

  if (status === "unpaid") {
    return {
      error: safePaid > 0 ? PAYMENT_VALIDATION_MESSAGES.unpaidWithPaidAmount : "",
      paidAmount: 0,
      paymentStatus: status
    };
  }

  if (status === "partial") {
    const isValidPartial = safePaid > 0 && safePaid < safeTotal;

    return {
      error: isValidPartial ? "" : PAYMENT_VALIDATION_MESSAGES.invalidPartial,
      paidAmount: Math.min(safePaid, safeTotal),
      paymentStatus: status
    };
  }

  return {
    error: "",
    paidAmount: safeTotal,
    paymentStatus: status
  };
}

export function calculateDossierBudgetSummary(trip, expenses = [], flights = [], stays = [], activities = []) {
  const budgetTotal = Number(trip?.budgetTotal || 0);
  const manualPaidTotal = expenses.reduce((total, expense) => total + getPaymentBreakdown(expense, "amount", "status").paidAmount, 0);
  const manualUnpaidTotal = expenses.reduce((total, expense) => total + getPaymentBreakdown(expense, "amount", "status").dueAmount, 0);
  const dossierItems = [...flights, ...stays, ...activities];
  const dossierPaidTotal = dossierItems.reduce((total, item) => total + getPaymentBreakdown(item).paidAmount, 0);
  const dossierUnpaidTotal = dossierItems.reduce((total, item) => total + getPaymentBreakdown(item).dueAmount, 0);
  const paidTotal = manualPaidTotal + dossierPaidTotal;
  const unpaidTotal = manualUnpaidTotal + dossierUnpaidTotal;
  const plannedTotal = paidTotal + unpaidTotal;

  return {
    budgetTotal,
    paidTotal,
    unpaidTotal,
    plannedTotal,
    totalTrip: plannedTotal,
    dueTotal: unpaidTotal,
    manualPlannedTotal: manualPaidTotal + manualUnpaidTotal,
    dossierPlannedTotal: dossierPaidTotal + dossierUnpaidTotal
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
    partial: "Parziale",
    unpaid: "Da pagare"
  };

  return labels[status] || labels.unpaid;
}

export function getTimelineTypeLabel(type) {
  const labels = {
    flight: "Volo",
    hotel: "Hotel",
    transport: "Trasporto",
    activity: "Attivita",
    food: "Cibo",
    note: "Nota",
    other: "Altro"
  };

  return labels[type] || labels.other;
}

export function getTimelineTypeIcon(type) {
  const icons = {
    flight: "FL",
    hotel: "HT",
    transport: "TR",
    activity: "AC",
    food: "FD",
    note: "NT",
    other: "OT"
  };

  return icons[type] || icons.other;
}

export function getTimelinePaymentStatusLabel(status) {
  const labels = {
    paid: "Pagato",
    unpaid: "Da pagare",
    none: "Nessun pagamento"
  };

  return labels[status] || labels.none;
}

export function getDossierPaymentStatusLabel(status) {
  const labels = {
    unpaid: "Non pagato",
    partial: "Parziale",
    paid: "Pagato"
  };

  return labels[status] || labels.unpaid;
}

export function getDossierPaymentStatusBadge(status) {
  if (status === "paid") {
    return "badge--success";
  }

  if (status === "partial") {
    return "badge--warning";
  }

  return "badge--danger";
}

export function getFlightTypeLabel(type) {
  const labels = {
    andata: "Andata",
    ritorno: "Ritorno",
    interno: "Interno",
    scalo: "Scalo",
    altro: "Altro"
  };

  return labels[type] || labels.altro;
}

export function getStayTypeLabel(type) {
  const labels = {
    hotel: "Hotel",
    appartamento: "Appartamento",
    bnb: "B&B",
    ostello: "Ostello",
    resort: "Resort",
    altro: "Altro"
  };

  return labels[type] || labels.altro;
}

export function getActivityTypeLabel(type) {
  const labels = {
    escursione: "Escursione",
    visita: "Visita",
    ristorante: "Ristorante",
    trasporto: "Trasporto",
    altro: "Altro"
  };

  return labels[type] || labels.altro;
}

export function getChecklistSectionLabel(section) {
  const labels = {
    pre_departure: "Pre-partenza",
    during_trip: "Durante il viaggio",
    after_trip: "Al rientro"
  };

  return labels[section] || labels.pre_departure;
}

export function calculateChecklistSummary(items = []) {
  const total = items.length;
  const completed = items.filter((item) => item.completed).length;
  const open = total - completed;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    total,
    completed,
    open,
    completionRate
  };
}

export function sortChecklistItems(items = []) {
  return [...items].sort((a, b) => {
    const sectionComparison = CHECKLIST_SECTIONS.indexOf(a.section) - CHECKLIST_SECTIONS.indexOf(b.section);

    if (sectionComparison !== 0) {
      return sectionComparison;
    }

    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }

    const aDue = a.dueDate || "9999-12-31";
    const bDue = b.dueDate || "9999-12-31";
    const dueComparison = aDue.localeCompare(bDue);

    if (dueComparison !== 0) {
      return dueComparison;
    }

    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

export function groupChecklistItemsBySection(items = []) {
  return sortChecklistItems(items).reduce((groups, item) => {
    const section = CHECKLIST_SECTIONS.includes(item.section) ? item.section : "pre_departure";
    groups[section] = groups[section] || [];
    groups[section].push(item);
    return groups;
  }, {});
}

export function getOpenChecklistItems(items = [], limit = 3) {
  return sortChecklistItems(items)
    .filter((item) => !item.completed)
    .slice(0, limit);
}

export function isChecklistItemOverdue(item) {
  if (!item?.dueDate || item.completed) {
    return false;
  }

  const dueDate = parseDate(item.dueDate);

  if (!dueDate) {
    return false;
  }

  return dueDate < startOfToday();
}

export function sortNotes(notes = []) {
  return [...notes].sort((a, b) => {
    const updatedComparison = String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));

    if (updatedComparison !== 0) {
      return updatedComparison;
    }

    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

export function searchNotes(notes = [], query = "") {
  const cleanQuery = String(query || "").trim().toLowerCase();

  if (!cleanQuery) {
    return notes;
  }

  return notes.filter((note) => {
    const searchableText = [
      note.title,
      note.destination,
      note.content
    ].join(" ").toLowerCase();

    return searchableText.includes(cleanQuery);
  });
}

export function getNoteDestinations(notes = []) {
  return [...new Set(
    notes
      .map((note) => String(note.destination || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

export function filterNotesByDestination(notes = [], destination = "all") {
  const cleanDestination = String(destination || "all").trim();

  if (cleanDestination === "all") {
    return notes;
  }

  return notes.filter((note) => String(note.destination || "").trim() === cleanDestination);
}

export function getNotePreview(content = "", maxLength = 120) {
  const cleanContent = String(content || "").replace(/\s+/g, " ").trim();
  const limit = Number(maxLength || 0);

  if (!limit || cleanContent.length <= limit) {
    return cleanContent;
  }

  return `${cleanContent.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

export function sortTimelineItems(items = []) {
  return [...items].sort((a, b) => {
    const dateComparison = String(a.date || "").localeCompare(String(b.date || ""));

    if (dateComparison !== 0) {
      return dateComparison;
    }

    const aTime = String(a.time || "");
    const bTime = String(b.time || "");

    if (aTime && !bTime) {
      return -1;
    }

    if (!aTime && bTime) {
      return 1;
    }

    const timeComparison = aTime.localeCompare(bTime);

    if (timeComparison !== 0) {
      return timeComparison;
    }

    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

export function groupTimelineItemsByDate(items = []) {
  return sortTimelineItems(items).reduce((groups, item) => {
    const date = item.date || "senza-data";
    groups[date] = groups[date] || [];
    groups[date].push(item);
    return groups;
  }, {});
}

function timelineComparableValue(item) {
  if (!item?.date) {
    return null;
  }

  return `${item.date}T${item.time || "23:59"}`;
}

export function getNextTimelineItem(items = [], todayDate = null) {
  const now = todayDate ? new Date(todayDate) : new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const currentTime = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0")
  ].join(":");
  const currentComparable = `${today}T${currentTime}`;

  return sortTimelineItems(items).find((item) => {
    const comparable = timelineComparableValue(item);
    return comparable ? comparable >= currentComparable : false;
  }) || null;
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
