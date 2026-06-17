const STORAGE_PREFIX = "odysseus";

function keyFor(key) {
  return `${STORAGE_PREFIX}:${key}`;
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

export function clearOdysseusStorage() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(`${STORAGE_PREFIX}:`))
    .forEach((key) => localStorage.removeItem(key));
}
