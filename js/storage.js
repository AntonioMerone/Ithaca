import { generateId } from "./utils.js";

export const STORAGE_KEY = "ithaca:data";
export const LEGACY_STORAGE_KEYS = ["odysseus:data"];
const CORRUPTED_BACKUP_KEY = "ithaca:data:corrupted-backup";
const DATA_KEY = "data";
const DEFAULT_DATA = {
  trips: [],
  expenses: [],
  timelineItems: [],
  checklistItems: [],
  notes: []
};

function keyFor(key) {
  return key === DATA_KEY ? STORAGE_KEY : `ithaca:${key}`;
}

function getDefaultData() {
  return {
    trips: [],
    expenses: [],
    timelineItems: [],
    checklistItems: [],
    notes: []
  };
}

function normalizeData(data) {
  return {
    ...getDefaultData(),
    ...(data && typeof data === "object" ? data : {}),
    trips: Array.isArray(data?.trips) ? data.trips : [],
    expenses: Array.isArray(data?.expenses) ? data.expenses : [],
    timelineItems: Array.isArray(data?.timelineItems) ? data.timelineItems : [],
    checklistItems: Array.isArray(data?.checklistItems) ? data.checklistItems : [],
    notes: Array.isArray(data?.notes) ? data.notes : []
  };
}

function preserveCorruptedData(rawValue) {
  if (!rawValue || localStorage.getItem(CORRUPTED_BACKUP_KEY)) {
    return;
  }

  localStorage.setItem(CORRUPTED_BACKUP_KEY, JSON.stringify({
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
  localStorage.setItem(keyFor(key), JSON.stringify(value));
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

  try {
    return normalizeData(JSON.parse(rawValue));
  } catch (error) {
    console.warn("Ithaca: dati locali corrotti, backup di sicurezza creato.", error);
    preserveCorruptedData(rawValue);
    const emptyData = getDefaultData();
    saveData(emptyData);
    return emptyData;
  }
}

export function saveData(data) {
  return writeStorage(DATA_KEY, normalizeData(data));
}

export function initializeStorage() {
  migrateStorageKey();
  const data = getData();
  saveData(data);
  cleanupOrphanData();
  return getData();
}

export function cleanupOrphanData() {
  const data = getData();
  const validTripIds = new Set(data.trips.map((trip) => trip.id));
  const before = {
    expenses: data.expenses.length,
    timelineItems: data.timelineItems.length,
    checklistItems: data.checklistItems.length,
    notes: data.notes.length
  };

  data.expenses = data.expenses.filter((expense) => validTripIds.has(expense.tripId));
  data.timelineItems = data.timelineItems.filter((item) => validTripIds.has(item.tripId));
  data.checklistItems = data.checklistItems.filter((item) => validTripIds.has(item.tripId));
  data.notes = data.notes.filter((note) => validTripIds.has(note.tripId));

  const removed = {
    expenses: before.expenses - data.expenses.length,
    timelineItems: before.timelineItems - data.timelineItems.length,
    checklistItems: before.checklistItems - data.checklistItems.length,
    notes: before.notes - data.notes.length
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
  cleanupOrphanData();

  return {
    app: "Ithaca",
    version: 1,
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

  saveData(normalizeData(backup.data));
  cleanupOrphanData();
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
  const trip = {
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
  };

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

    updatedTrip = {
      ...trip,
      ...updates,
      id: trip.id,
      createdAt: trip.createdAt,
      updatedAt: new Date().toISOString()
    };

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
  saveData(data);
  cleanupOrphanData();
  return data.trips.length !== initialCount;
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
  const expense = {
    id: generateId("expense"),
    tripId: "",
    name: "",
    amount: 0,
    category: "other",
    status: "unpaid",
    date: "",
    notes: "",
    ...expenseData,
    createdAt: now,
    updatedAt: now
  };

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

    updatedExpense = {
      ...expense,
      ...updates,
      id: expense.id,
      tripId: expense.tripId,
      createdAt: expense.createdAt,
      updatedAt: new Date().toISOString()
    };

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
