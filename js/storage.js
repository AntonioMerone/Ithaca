import { generateId, normalizeDestinations } from "./utils.js";
import { DEFAULT_DASHBOARD, RECORD_TYPES } from "./selectors.js";

export const STORAGE_KEY = "ithaca:data";
export const LEGACY_STORAGE_KEYS = ["odysseus:data"];
const CORRUPTED_BACKUP_KEY = "ithaca:data:corrupted-backup";
const DATA_KEY = "data";
export const SCHEMA_VERSION = 2;

function keyFor(key) {
  return key === DATA_KEY ? STORAGE_KEY : `ithaca:${key}`;
}

function getDefaultData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    trips: [],
    expenses: [],
    timelineItems: [],
    checklistItems: [],
    notes: [],
    flights: [],
    stays: [],
    activities: []
  };
}

function normalizeMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function normalizePaidAmount(value, total = Number.POSITIVE_INFINITY) {
  const amount = normalizeMoney(value);
  const rawTotal = Number(total);
  const safeTotal = Number.isFinite(rawTotal) ? normalizeMoney(rawTotal) : Number.POSITIVE_INFINITY;
  return Math.min(amount, safeTotal);
}

function normalizePaymentStatus(value) {
  return ["unpaid", "partial", "paid"].includes(value) ? value : "unpaid";
}

function normalizeTrip(trip) {
  const source = trip && typeof trip === "object" ? trip : {};

  return {
    ...source,
    id: String(source.id || generateId("trip")),
    dashboardPreferences: { ...DEFAULT_DASHBOARD, ...(source.dashboardPreferences && typeof source.dashboardPreferences === "object" ? source.dashboardPreferences : {}) },
    name: String(source.name || ""),
    destinations: normalizeDestinations(source.destinations, source),
    startDate: String(source.startDate || ""),
    endDate: String(source.endDate || ""),
    budgetTotal: Number.isFinite(Number(source.budgetTotal)) ? Number(source.budgetTotal) : 0,
    currency: String(source.currency || "EUR").toUpperCase(),
    notes: String(source.notes || ""),
    createdAt: source.createdAt || "",
    updatedAt: source.updatedAt || ""
  };
}

function normalizeData(data) {
  return {
    ...getDefaultData(),
    ...(data && typeof data === "object" ? data : {}),
    schemaVersion: Math.max(Number(data?.schemaVersion) || 1, SCHEMA_VERSION),
    trips: Array.isArray(data?.trips) ? data.trips.map(normalizeTrip) : [],
    expenses: Array.isArray(data?.expenses) ? data.expenses.map(normalizeExpense) : [],
    timelineItems: Array.isArray(data?.timelineItems) ? data.timelineItems.map(item => normalizeSimpleRecord(item, "timeline")) : [],
    checklistItems: Array.isArray(data?.checklistItems) ? data.checklistItems.map(item => normalizeSimpleRecord(item, "check")) : [],
    notes: Array.isArray(data?.notes) ? data.notes.map(item => normalizeSimpleRecord(item, "note")) : [],
    flights: Array.isArray(data?.flights) ? data.flights.map(normalizeFlight) : [],
    stays: Array.isArray(data?.stays) ? data.stays.map(normalizeStay) : [],
    activities: Array.isArray(data?.activities) ? data.activities.map(normalizeActivity) : []
  };
}

function normalizeSimpleRecord(item, prefix) {
  const source = item && typeof item === "object" ? item : {};
  return { ...source, id: String(source.id || generateId(prefix)), tripId: String(source.tripId || ""), pinned: source.pinned === true };
}

function normalizeFlight(flight) {
  const source = flight && typeof flight === "object" ? flight : {};
  const stopover = source.stopover && typeof source.stopover === "object" ? source.stopover : {};

  return {
    ...source,
    id: String(source.id || generateId("flight")),
    pinned: source.pinned === true,
    tripId: String(source.tripId || ""),
    type: String(source.type || "altro"),
    from: String(source.from || ""),
    to: String(source.to || ""),
    departureDate: String(source.departureDate || ""),
    departureTime: String(source.departureTime || ""),
    arrivalDate: String(source.arrivalDate || ""),
    arrivalTime: String(source.arrivalTime || ""),
    airline: String(source.airline || ""),
    flightNumber: String(source.flightNumber || ""),
    stopover: {
      ...stopover,
      location: String(stopover.location || source.stopoverLocation || ""),
      date: String(stopover.date || source.stopoverDate || ""),
      time: String(stopover.time || source.stopoverTime || "")
    },
    bookingNumber: String(source.bookingNumber || ""),
    baggage: String(source.baggage || ""),
    cost: normalizeMoney(source.cost),
    paymentStatus: normalizePaymentStatus(source.paymentStatus),
    paidAmount: normalizePaidAmount(source.paidAmount, source.cost),
    notes: String(source.notes || ""),
    createdAt: source.createdAt || "",
    updatedAt: source.updatedAt || ""
  };
}

function normalizeStay(stay) {
  const source = stay && typeof stay === "object" ? stay : {};

  return {
    ...source,
    id: String(source.id || generateId("stay")),
    pinned: source.pinned === true,
    tripId: String(source.tripId || ""),
    destinationId: String(source.destinationId || ""),
    structureName: String(source.structureName || ""),
    structureType: String(source.structureType || "altro"),
    checkInDate: String(source.checkInDate || ""),
    checkOutDate: String(source.checkOutDate || ""),
    checkInTime: String(source.checkInTime || ""),
    checkOutTime: String(source.checkOutTime || ""),
    address: String(source.address || ""),
    phone: String(source.phone || ""),
    link: String(source.link || ""),
    bookingNumber: String(source.bookingNumber || ""),
    cost: normalizeMoney(source.cost),
    paymentStatus: normalizePaymentStatus(source.paymentStatus),
    paidAmount: normalizePaidAmount(source.paidAmount, source.cost),
    mealsNotes: String(source.mealsNotes || ""),
    notes: String(source.notes || ""),
    createdAt: source.createdAt || "",
    updatedAt: source.updatedAt || ""
  };
}

function normalizeActivity(activity) {
  const source = activity && typeof activity === "object" ? activity : {};

  return {
    ...source,
    id: String(source.id || generateId("activity")),
    pinned: source.pinned === true,
    tripId: String(source.tripId || ""),
    destinationId: String(source.destinationId || ""),
    type: String(source.type || "altro"),
    name: String(source.name || ""),
    date: String(source.date || ""),
    time: String(source.time || ""),
    location: String(source.location || ""),
    bookingNumber: String(source.bookingNumber || ""),
    cost: normalizeMoney(source.cost),
    paymentStatus: normalizePaymentStatus(source.paymentStatus),
    paidAmount: normalizePaidAmount(source.paidAmount, source.cost),
    notes: String(source.notes || ""),
    createdAt: source.createdAt || "",
    updatedAt: source.updatedAt || ""
  };
}

function normalizeExpense(expense) {
  const source = expense && typeof expense === "object" ? expense : {};

  return {
    ...source,
    id: String(source.id || generateId("expense")),
    pinned: source.pinned === true,
    tripId: String(source.tripId || ""),
    name: String(source.name || ""),
    amount: normalizeMoney(source.amount),
    category: String(source.category || "other"),
    status: normalizePaymentStatus(source.status),
    paidAmount: normalizePaidAmount(source.paidAmount, source.amount),
    date: String(source.date || ""),
    notes: String(source.notes || ""),
    createdAt: source.createdAt || "",
    updatedAt: source.updatedAt || ""
  };
}

function preserveCorruptedData(rawValue) {
  if (!rawValue) return;
  const key = localStorage.getItem(CORRUPTED_BACKUP_KEY) ? `${CORRUPTED_BACKUP_KEY}:${generateId("recovery")}` : CORRUPTED_BACKUP_KEY;
  localStorage.setItem(key, JSON.stringify({
    capturedAt: new Date().toISOString(),
    key: STORAGE_KEY,
    rawValue
  }));
}

export function migrateStorageKey() {
  if (localStorage.getItem(STORAGE_KEY) !== null) {
    return false;
  }

  const legacyKey = LEGACY_STORAGE_KEYS.find((key) => localStorage.getItem(key) !== null);

  if (!legacyKey) {
    return false;
  }

  localStorage.setItem(STORAGE_KEY, localStorage.getItem(legacyKey));
  return true;
}

export function readStorage(key, fallbackValue = null) {
  migrateStorageKey();

  try {
    const rawValue = localStorage.getItem(keyFor(key));
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch (error) {
    console.warn("Ithaca: dati locali non validi, ripristino struttura vuota.", error);
    preserveCorruptedData(localStorage.getItem(keyFor(key)));
    return fallbackValue;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(keyFor(key), JSON.stringify(value));
  } catch (error) {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ithaca:storage-error"));
    throw error;
  }
  return value;
}

export function removeStorage(key) {
  localStorage.removeItem(keyFor(key));
}

export function clearIthacaStorage() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith("ithaca:"))
    .forEach((key) => localStorage.removeItem(key));
}

export function getData() {
  migrateStorageKey();

  const rawValue = localStorage.getItem(STORAGE_KEY);

  if (rawValue === null) {
    const emptyData = getDefaultData();
    saveData(emptyData);
    return emptyData;
  }

  let parsedData;
  try {
    parsedData = JSON.parse(rawValue);
    if (!parsedData || typeof parsedData !== "object" || !Array.isArray(parsedData.trips)) throw new Error("Struttura dati non valida");
  } catch (error) {
    console.warn("Ithaca: dati locali corrotti, backup di sicurezza creato.", error);
    preserveCorruptedData(rawValue);
    const emptyData = getDefaultData();
    saveData(emptyData);
    return emptyData;
  }
  const normalizedData = normalizeData(parsedData);
  if (JSON.stringify(parsedData) !== JSON.stringify(normalizedData)) {
    // A failed migration write must never enter corrupted-data recovery.
    if ((!parsedData.schemaVersion || parsedData.schemaVersion < SCHEMA_VERSION) && !localStorage.getItem("ithaca:data:before-v2")) {
      localStorage.setItem("ithaca:data:before-v2", rawValue);
    }
    writeStorage(DATA_KEY, normalizedData);
  }
  return normalizedData;
}

export function saveData(data) {
  return writeStorage(DATA_KEY, normalizeData(data));
}

export function initializeStorage() {
  migrateStorageKey();
  return getData();
}

export function cleanupOrphanData() {
  const data = getData();
  const validTripIds = new Set(data.trips.map((trip) => trip.id));
  const before = {
    expenses: data.expenses.length,
    timelineItems: data.timelineItems.length,
    checklistItems: data.checklistItems.length,
    notes: data.notes.length,
    flights: data.flights.length,
    stays: data.stays.length,
    activities: data.activities.length
  };

  data.expenses = data.expenses.filter((expense) => validTripIds.has(expense.tripId));
  data.timelineItems = data.timelineItems.filter((item) => validTripIds.has(item.tripId));
  data.checklistItems = data.checklistItems.filter((item) => validTripIds.has(item.tripId));
  data.notes = data.notes.filter((note) => validTripIds.has(note.tripId));
  data.flights = data.flights.filter((flight) => validTripIds.has(flight.tripId));
  data.stays = data.stays.filter((stay) => validTripIds.has(stay.tripId));
  data.activities = data.activities.filter((activity) => validTripIds.has(activity.tripId));

  const removed = {
    expenses: before.expenses - data.expenses.length,
    timelineItems: before.timelineItems - data.timelineItems.length,
    checklistItems: before.checklistItems - data.checklistItems.length,
    notes: before.notes - data.notes.length,
    flights: before.flights - data.flights.length,
    stays: before.stays - data.stays.length,
    activities: before.activities - data.activities.length
  };
  const changed = Object.values(removed).some((count) => count > 0);

  if (changed) {
    saveData(data);
  }

  return {
    changed,
    removed,
    data: normalizeData(data)
  };
}

export function createBackupPayload() {
  return {
    app: "Ithaca",
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: getData()
  };
}

export function getBackupFileName(date = new Date()) {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");

  return `ithaca-backup-${day}.json`;
}

export function importBackupPayload(payload) {
  let backup = payload;

  if (typeof payload === "string") {
    try {
      backup = JSON.parse(payload);
    } catch {
      throw new Error("Il file selezionato non contiene JSON valido.");
    }
  }

  if (!backup || typeof backup !== "object" || !backup.data || typeof backup.data !== "object") {
    throw new Error("Backup non valido: manca la sezione data.");
  }

  if (!Array.isArray(backup.data.trips)) {
    throw new Error("Backup non valido: data.trips deve essere un array.");
  }

  if (Number(backup.version || 1) > SCHEMA_VERSION || Number(backup.data.schemaVersion || 1) > SCHEMA_VERSION) {
    throw new Error("Questo backup richiede una versione più recente di Ithaca.");
  }
  for (const key of ["trips", ...Object.keys(RECORD_TYPES)]) {
    if (backup.data[key] === undefined) continue;
    if (!Array.isArray(backup.data[key]) || backup.data[key].some(item => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error(`Backup non valido: controlla la sezione ${key}. Nessun dato modificato.`);
    }
    const ids = backup.data[key].map(item => item.id).filter(Boolean).map(String);
    if (new Set(ids).size !== ids.length) throw new Error(`Backup non valido: ID duplicati in ${key}.`);
  }
  saveData(normalizeData(backup.data));
  return getData();
}

export function resetAppData() {
  localStorage.removeItem(STORAGE_KEY);
  saveData(getDefaultData());
  return getData();
}

export function getTrips() {
  return getData().trips;
}

export function getTripById(id) {
  return getTrips().find((trip) => trip.id === id) || null;
}

export function createTrip(tripData) {
  const data = getData();
  const now = new Date().toISOString();
  const trip = normalizeTrip({
    id: generateId("trip"),
    name: "",
    destinations: [],
    startDate: "",
    endDate: "",
    budgetTotal: 0,
    currency: "EUR",
    notes: "",
    ...tripData,
    createdAt: now,
    updatedAt: now
  });

  data.trips = [trip, ...data.trips];
  saveData(data);
  return trip;
}

export function updateTrip(id, updates) {
  const data = getData();
  let updatedTrip = null;

  data.trips = data.trips.map((trip) => {
    if (trip.id !== id) {
      return trip;
    }

    updatedTrip = normalizeTrip({
      ...trip,
      ...updates,
      id: trip.id,
      createdAt: trip.createdAt,
      updatedAt: new Date().toISOString()
    });

    return updatedTrip;
  });

  saveData(data);
  return updatedTrip;
}

export function deleteTrip(id) {
  const data = getData();
  const initialCount = data.trips.length;
  data.trips = data.trips.filter((trip) => trip.id !== id);
  data.expenses = data.expenses.filter((expense) => expense.tripId !== id);
  data.timelineItems = data.timelineItems.filter((item) => item.tripId !== id);
  data.checklistItems = data.checklistItems.filter((item) => item.tripId !== id);
  data.notes = data.notes.filter((note) => note.tripId !== id);
  data.flights = data.flights.filter((flight) => flight.tripId !== id);
  data.stays = data.stays.filter((stay) => stay.tripId !== id);
  data.activities = data.activities.filter((activity) => activity.tripId !== id);
  saveData(data);
  return data.trips.length !== initialCount;
}

export function toggleRecordPinned(source, id) {
  if (!Object.hasOwn(RECORD_TYPES, source)) return null;
  const data = getData();
  const record = data[source].find(item => item.id === id);
  if (!record) return null;
  record.pinned = !record.pinned;
  record.updatedAt = new Date().toISOString();
  saveData(data);
  return record;
}

export function getFlights() {
  return getData().flights;
}

export function getFlightsByTripId(tripId) {
  return getFlights().filter((flight) => flight.tripId === tripId);
}

export function getFlightById(id) {
  return getFlights().find((flight) => flight.id === id) || null;
}

export function createFlight(flightData) {
  const data = getData();
  const now = new Date().toISOString();
  const flight = normalizeFlight({
    id: generateId("flight"),
    tripId: "",
    ...flightData,
    createdAt: now,
    updatedAt: now
  });

  data.flights = [flight, ...data.flights];
  saveData(data);
  return flight;
}

export function updateFlight(id, updates) {
  const data = getData();
  let updatedFlight = null;

  data.flights = data.flights.map((flight) => {
    if (flight.id !== id) {
      return flight;
    }

    updatedFlight = normalizeFlight({
      ...flight,
      ...updates,
      stopover: { ...flight.stopover, ...(updates.stopover || {}) },
      id: flight.id,
      tripId: flight.tripId,
      createdAt: flight.createdAt,
      updatedAt: new Date().toISOString()
    });

    return updatedFlight;
  });

  saveData(data);
  return updatedFlight;
}

export function deleteFlight(id) {
  const data = getData();
  const initialCount = data.flights.length;
  data.flights = data.flights.filter((flight) => flight.id !== id);
  saveData(data);
  return data.flights.length !== initialCount;
}

export function getStays() {
  return getData().stays;
}

export function getStaysByTripId(tripId) {
  return getStays().filter((stay) => stay.tripId === tripId);
}

export function getStayById(id) {
  return getStays().find((stay) => stay.id === id) || null;
}

export function createStay(stayData) {
  const data = getData();
  const now = new Date().toISOString();
  const stay = normalizeStay({
    id: generateId("stay"),
    tripId: "",
    ...stayData,
    createdAt: now,
    updatedAt: now
  });

  data.stays = [stay, ...data.stays];
  saveData(data);
  return stay;
}

export function updateStay(id, updates) {
  const data = getData();
  let updatedStay = null;

  data.stays = data.stays.map((stay) => {
    if (stay.id !== id) {
      return stay;
    }

    updatedStay = normalizeStay({
      ...stay,
      ...updates,
      id: stay.id,
      tripId: stay.tripId,
      createdAt: stay.createdAt,
      updatedAt: new Date().toISOString()
    });

    return updatedStay;
  });

  saveData(data);
  return updatedStay;
}

export function deleteStay(id) {
  const data = getData();
  const initialCount = data.stays.length;
  data.stays = data.stays.filter((stay) => stay.id !== id);
  saveData(data);
  return data.stays.length !== initialCount;
}

export function getActivities() {
  return getData().activities;
}

export function getActivitiesByTripId(tripId) {
  return getActivities().filter((activity) => activity.tripId === tripId);
}

export function getActivityById(id) {
  return getActivities().find((activity) => activity.id === id) || null;
}

export function createActivity(activityData) {
  const data = getData();
  const now = new Date().toISOString();
  const activity = normalizeActivity({
    id: generateId("activity"),
    tripId: "",
    ...activityData,
    createdAt: now,
    updatedAt: now
  });

  data.activities = [activity, ...data.activities];
  saveData(data);
  return activity;
}

export function updateActivity(id, updates) {
  const data = getData();
  let updatedActivity = null;

  data.activities = data.activities.map((activity) => {
    if (activity.id !== id) {
      return activity;
    }

    updatedActivity = normalizeActivity({
      ...activity,
      ...updates,
      id: activity.id,
      tripId: activity.tripId,
      createdAt: activity.createdAt,
      updatedAt: new Date().toISOString()
    });

    return updatedActivity;
  });

  saveData(data);
  return updatedActivity;
}

export function deleteActivity(id) {
  const data = getData();
  const initialCount = data.activities.length;
  data.activities = data.activities.filter((activity) => activity.id !== id);
  saveData(data);
  return data.activities.length !== initialCount;
}

export function getExpenses() {
  return getData().expenses;
}

export function getExpensesByTripId(tripId) {
  return getExpenses().filter((expense) => expense.tripId === tripId);
}

export function getExpenseById(id) {
  return getExpenses().find((expense) => expense.id === id) || null;
}

export function createExpense(expenseData) {
  const data = getData();
  const now = new Date().toISOString();
  const expense = normalizeExpense({
    id: generateId("expense"),
    tripId: "",
    name: "",
    amount: 0,
    category: "other",
    status: "unpaid",
    paidAmount: 0,
    date: "",
    notes: "",
    ...expenseData,
    createdAt: now,
    updatedAt: now
  });

  data.expenses = [expense, ...data.expenses];
  saveData(data);
  return expense;
}

export function updateExpense(id, updates) {
  const data = getData();
  let updatedExpense = null;

  data.expenses = data.expenses.map((expense) => {
    if (expense.id !== id) {
      return expense;
    }

    updatedExpense = normalizeExpense({
      ...expense,
      ...updates,
      id: expense.id,
      tripId: expense.tripId,
      createdAt: expense.createdAt,
      updatedAt: new Date().toISOString()
    });

    return updatedExpense;
  });

  saveData(data);
  return updatedExpense;
}

export function deleteExpense(id) {
  const data = getData();
  const initialCount = data.expenses.length;
  data.expenses = data.expenses.filter((expense) => expense.id !== id);
  saveData(data);
  return data.expenses.length !== initialCount;
}

export function getTimelineItems() {
  return getData().timelineItems;
}

export function getTimelineItemsByTripId(tripId) {
  return getTimelineItems().filter((item) => item.tripId === tripId);
}

export function getTimelineItemById(id) {
  return getTimelineItems().find((item) => item.id === id) || null;
}

export function createTimelineItem(itemData) {
  const data = getData();
  const now = new Date().toISOString();
  const item = {
    id: generateId("timeline"),
    tripId: "",
    type: "other",
    title: "",
    date: "",
    time: "",
    location: "",
    cost: 0,
    paymentStatus: "none",
    notes: "",
    ...itemData,
    createdAt: now,
    updatedAt: now
  };

  data.timelineItems = [item, ...data.timelineItems];
  saveData(data);
  return item;
}

export function updateTimelineItem(id, updates) {
  const data = getData();
  let updatedItem = null;

  data.timelineItems = data.timelineItems.map((item) => {
    if (item.id !== id) {
      return item;
    }

    updatedItem = {
      ...item,
      ...updates,
      id: item.id,
      tripId: item.tripId,
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString()
    };

    return updatedItem;
  });

  saveData(data);
  return updatedItem;
}

export function deleteTimelineItem(id) {
  const data = getData();
  const initialCount = data.timelineItems.length;
  data.timelineItems = data.timelineItems.filter((item) => item.id !== id);
  saveData(data);
  return data.timelineItems.length !== initialCount;
}

export function getChecklistItems() {
  return getData().checklistItems;
}

export function getChecklistItemsByTripId(tripId) {
  return getChecklistItems().filter((item) => item.tripId === tripId);
}

export function getChecklistItemById(id) {
  return getChecklistItems().find((item) => item.id === id) || null;
}

export function createChecklistItem(itemData) {
  const data = getData();
  const now = new Date().toISOString();
  const item = {
    id: generateId("check"),
    tripId: "",
    title: "",
    section: "pre_departure",
    completed: false,
    dueDate: "",
    notes: "",
    ...itemData,
    createdAt: now,
    updatedAt: now
  };

  data.checklistItems = [item, ...data.checklistItems];
  saveData(data);
  return item;
}

export function updateChecklistItem(id, updates) {
  const data = getData();
  let updatedItem = null;

  data.checklistItems = data.checklistItems.map((item) => {
    if (item.id !== id) {
      return item;
    }

    updatedItem = {
      ...item,
      ...updates,
      id: item.id,
      tripId: item.tripId,
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString()
    };

    return updatedItem;
  });

  saveData(data);
  return updatedItem;
}

export function deleteChecklistItem(id) {
  const data = getData();
  const initialCount = data.checklistItems.length;
  data.checklistItems = data.checklistItems.filter((item) => item.id !== id);
  saveData(data);
  return data.checklistItems.length !== initialCount;
}

export function toggleChecklistItem(id) {
  const item = getChecklistItemById(id);

  if (!item) {
    return null;
  }

  return updateChecklistItem(id, {
    completed: !item.completed
  });
}

export function getNotes() {
  return getData().notes;
}

export function getNotesByTripId(tripId) {
  return getNotes().filter((note) => note.tripId === tripId);
}

export function getNoteById(id) {
  return getNotes().find((note) => note.id === id) || null;
}

export function createNote(noteData) {
  const data = getData();
  const now = new Date().toISOString();
  const note = {
    id: generateId("note"),
    tripId: "",
    title: "",
    destination: "",
    content: "",
    ...noteData,
    createdAt: now,
    updatedAt: now
  };

  data.notes = [note, ...data.notes];
  saveData(data);
  return note;
}

export function updateNote(id, updates) {
  const data = getData();
  let updatedNote = null;

  data.notes = data.notes.map((note) => {
    if (note.id !== id) {
      return note;
    }

    updatedNote = {
      ...note,
      ...updates,
      id: note.id,
      tripId: note.tripId,
      createdAt: note.createdAt,
      updatedAt: new Date().toISOString()
    };

    return updatedNote;
  });

  saveData(data);
  return updatedNote;
}

export function deleteNote(id) {
  const data = getData();
  const initialCount = data.notes.length;
  data.notes = data.notes.filter((note) => note.id !== id);
  saveData(data);
  return data.notes.length !== initialCount;
}
