import { getPaymentBreakdown, sortTimelineItems, getNextTimelineItem, calculateChecklistSummary, determineTripStatus, getNotePreview, getExpenseCategoryLabel } from "./utils.js";

export const RECORD_TYPES = {
  flights: { label: "Volo", plural: "Voli", action: "flight", idAttribute: "flight-id" },
  stays: { label: "Soggiorno", plural: "Soggiorni", action: "stay", idAttribute: "stay-id" },
  activities: { label: "Attività", plural: "Attività", action: "activity", idAttribute: "activity-id" },
  expenses: { label: "Spesa", plural: "Spese", action: "expense", idAttribute: "expense-id" },
  notes: { label: "Nota", plural: "Note", action: "note", idAttribute: "note-id" },
  checklistItems: { label: "Checklist", plural: "Checklist", action: "checklist-item", idAttribute: "item-id" },
  timelineItems: { label: "Evento", plural: "Eventi manuali", action: "timeline-item", idAttribute: "item-id" }
};

export const DASHBOARD_BLOCKS = {
  next: "Prossimo evento e oggi", stay: "Soggiorno attuale", pinned: "In evidenza",
  due: "Da pagare", checklist: "Checklist", budget: "Budget", notes: "Note"
};
export const DEFAULT_DASHBOARD = Object.fromEntries(Object.keys(DASHBOARD_BLOCKS).map(key => [key, key !== "notes"]));

export function localDateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function selectTripData(data, tripId) {
  return Object.fromEntries(Object.keys(RECORD_TYPES).map(source => [source, (data[source] || []).filter(item => item && item.tripId === tripId)]));
}

export function recordTitle(source, item) {
  if (source === "flights") return [item.from, item.to].filter(Boolean).join(" → ") || item.flightNumber || item.airline || "Volo da completare";
  if (source === "stays") return item.structureName || "Soggiorno da completare";
  return item.name || item.title || RECORD_TYPES[source]?.label || "Informazione";
}

export function recordDate(source, item) {
  return (source === "flights" ? item.departureDate : source === "stays" ? item.checkInDate : source === "checklistItems" ? item.dueDate : item.date) || "";
}

export function asRecord(source, item) {
  return { source, sourceId: item.id, title: recordTitle(source, item), date: recordDate(source, item), time: item.departureTime || item.time || "", item };
}

export function selectRecords(data, tripId) {
  const tripData = selectTripData(data, tripId);
  return Object.keys(RECORD_TYPES).flatMap(source => tripData[source].map(item => asRecord(source, item)));
}

function searchableValues(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(searchableValues).join(" ");
  if (value && typeof value === "object") return Object.entries(value)
    .filter(([key]) => !["id", "tripId", "createdAt", "updatedAt"].includes(key))
    .map(([, child]) => searchableValues(child)).join(" ");
  return "";
}

const fold = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
export function searchRecords(records, query = "") {
  const words = fold(query).trim().split(/\s+/).filter(Boolean);
  return words.length ? records.filter(record => {
    const text = fold(`${RECORD_TYPES[record.source].label} ${record.title} ${searchableValues(record.item)}`);
    return words.every(word => text.includes(word));
  }) : records;
}

// Every event points to its original record. Nothing is persisted or synchronized.
export function selectTimeline(data, tripId) {
  const records = selectTripData(data, tripId);
  const events = records.timelineItems.map(item => ({ ...item, ...asRecord("timelineItems", item), id: `manual:${item.id}`, type: item.type || "other", label: "Evento manuale" }));
  function add(source, item, suffix, date, time, type, label, location = "") {
    if (!date) return;
    events.push({ ...asRecord(source, item), id: `${source}:${item.id}:${suffix}`, date, time: time || "", type, label, location });
  }
  for (const flight of records.flights) {
    add("flights", flight, "departure", flight.departureDate, flight.departureTime, "flight", "Partenza", flight.from);
    add("flights", flight, "stopover", flight.stopover?.date, flight.stopover?.time, "flight", "Scalo", flight.stopover?.location);
    add("flights", flight, "arrival", flight.arrivalDate, flight.arrivalTime, "flight", "Arrivo", flight.to);
  }
  for (const stay of records.stays) {
    add("stays", stay, "in", stay.checkInDate, stay.checkInTime, "hotel", "Check-in", stay.address);
    add("stays", stay, "out", stay.checkOutDate, stay.checkOutTime, "hotel", "Check-out", stay.address);
  }
  for (const activity of records.activities) add("activities", activity, "event", activity.date, activity.time, activity.type === "trasporto" ? "transport" : "activity", "Attività", activity.location);
  return sortTimelineItems(events);
}

// Manual legacy events only contribute when explicitly enabled: old users may
// already have recorded the same amount as an independent expense.
export function selectLedger(data, tripId) {
  const records = selectRecords(data, tripId);
  const financialSources = ["flights", "stays", "activities", "expenses"];
  const originals = new Set(records.filter(r => financialSources.includes(r.source) && r.source !== "expenses").map(r => `${r.source}:${r.sourceId}`));
  return records.filter(({ source, item }) => {
    if (source === "timelineItems") return item.includeInBudget === true;
    if (!financialSources.includes(source)) return false;
    // Only explicit, valid references are deduplicated; never guess by name/cost.
    return !(source === "expenses" && originals.has(`${item.sourceType}:${item.sourceId}`));
  }).map(record => {
    const { source, item } = record;
    const payment = getPaymentBreakdown(item, source === "expenses" ? "amount" : "cost", source === "expenses" ? "status" : "paymentStatus");
    const category = source === "flights" ? "flights" : source === "stays" ? "accommodation" : source === "activities" ? (item.type === "trasporto" ? "transport" : "activities") : item.category || "other";
    return { ...record, ...payment, category, categoryLabel: getExpenseCategoryLabel(category) === "Altro" && category !== "other" ? category : getExpenseCategoryLabel(category) };
  }).filter(record => record.totalAmount > 0 || record.source === "expenses");
}

const cents = amount => Math.round(Number(amount || 0) * 100);
export function summarizeBudget(trip, ledger) {
  const planned = ledger.reduce((sum, item) => sum + cents(item.totalAmount), 0);
  const paid = ledger.reduce((sum, item) => sum + cents(item.paidAmount), 0);
  const budgetTotal = Math.max(Number(trip.budgetTotal) || 0, 0);
  return { budgetTotal, plannedTotal: planned / 100, paidTotal: paid / 100, unpaidTotal: (planned - paid) / 100, remaining: budgetTotal - planned / 100, isOverBudget: budgetTotal > 0 && planned > cents(budgetTotal) };
}

export function selectDashboard(data, trip, now = new Date()) {
  const records = selectRecords(data, trip.id);
  const timeline = selectTimeline(data, trip.id);
  const ledger = selectLedger(data, trip.id);
  const today = localDateKey(now);
  return {
    records, timeline, ledger, today,
    next: getNextTimelineItem(timeline, now),
    todayEvents: timeline.filter(event => event.date === today),
    currentStays: records.filter(r => r.source === "stays" && r.item.checkInDate && r.item.checkOutDate && r.item.checkInDate <= today && today < r.item.checkOutDate),
    nextStay: records.filter(r => r.source === "stays" && r.item.checkInDate >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null,
    pinned: records.filter(r => r.item.pinned),
    checklist: calculateChecklistSummary(records.filter(r => r.source === "checklistItems").map(r => r.item)),
    budget: summarizeBudget(trip, ledger),
    preferences: { ...DEFAULT_DASHBOARD, ...trip.dashboardPreferences },
    status: determineTripStatus(trip.startDate, trip.endDate, now)
  };
}

export function sortTripsForHome(trips) {
  const rank = trip => ({ ongoing: 0, starts_today: 0, future: 1, undated: 2, past: 3 })[determineTripStatus(trip.startDate, trip.endDate)];
  return [...trips].sort((a, b) => rank(a) - rank(b) || (rank(a) === 3 ? String(b.endDate || b.startDate).localeCompare(String(a.endDate || a.startDate)) : String(a.startDate || "9999").localeCompare(String(b.startDate || "9999"))));
}

export function recordPreview(record) {
  const item = record.item;
  return getNotePreview([item.flightNumber, item.bookingNumber ? `Prenotazione ${item.bookingNumber}` : "", item.location || item.address, item.content || item.notes].filter(Boolean).join(" · "), 150);
}
