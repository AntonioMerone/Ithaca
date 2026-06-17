import { generateId } from "./utils.js";

const STORAGE_PREFIX = "odysseus";
const DATA_KEY = "data";
const DEFAULT_DATA = {
  trips: []
};

function keyFor(key) {
  return `${STORAGE_PREFIX}:${key}`;
}

function normalizeData(data) {
  return {
    ...DEFAULT_DATA,
    ...(data && typeof data === "object" ? data : {}),
    trips: Array.isArray(data?.trips) ? data.trips : []
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
  saveData(data);
  return data.trips.length !== initialCount;
}
