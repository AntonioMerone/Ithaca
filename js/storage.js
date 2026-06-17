import { generateId } from "./utils.js";

const STORAGE_PREFIX = "odysseus";
const DATA_KEY = "data";
const DEFAULT_DATA = {
  trips: [],
  expenses: [],
  timelineItems: [],
  checklistItems: []
};

function keyFor(key) {
  return `${STORAGE_PREFIX}:${key}`;
}

function normalizeData(data) {
  return {
    ...DEFAULT_DATA,
    ...(data && typeof data === "object" ? data : {}),
    trips: Array.isArray(data?.trips) ? data.trips : [],
    expenses: Array.isArray(data?.expenses) ? data.expenses : [],
    timelineItems: Array.isArray(data?.timelineItems) ? data.timelineItems : [],
    checklistItems: Array.isArray(data?.checklistItems) ? data.checklistItems : []
  };
}

export function readStorage(key, fallbackValue = null) {
  try {
    const rawValue = localStorage.getItem(keyFor(key));
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch {
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
    .filter((key) => key.startsWith(`${STORAGE_PREFIX}:`))
    .forEach((key) => localStorage.removeItem(key));
}

export function getData() {
  return normalizeData(readStorage(DATA_KEY, DEFAULT_DATA));
}

export function saveData(data) {
  return writeStorage(DATA_KEY, normalizeData(data));
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
  saveData(data);
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
