import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import vm from "node:vm";
import * as storage from "../js/storage.js";
import { selectTimeline, selectLedger, summarizeBudget, selectDashboard, selectRecords, searchRecords } from "../js/selectors.js";
import { determineTripStatus, sortTimelineItems } from "../js/utils.js";

class MemoryStorage {
  values = new Map(); failKey = null;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (key === this.failKey) throw new Error("QuotaExceededError"); this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
function reset() { globalThis.localStorage = new MemoryStorage(); }
function fixture() {
  reset();
  const trip = storage.createTrip({ name: "Tokyo", startDate: "2026-10-12", endDate: "2026-10-24", budgetTotal: 3000 });
  const stay = storage.createStay({ tripId: trip.id, structureName: "Hotel Gracery", checkInDate: "2026-10-12", checkOutDate: "2026-10-16", cost: 480 });
  const flight = storage.createFlight({ tripId: trip.id, from: "Roma", to: "Tokyo", flightNumber: "AZ123", departureDate: "2026-10-12", departureTime: "14:35", arrivalDate: "2026-10-13", cost: 250 });
  const activity = storage.createActivity({ tripId: trip.id, name: "Shibuya Sky", date: "2026-10-13", time: "16:30", cost: 32 });
  return { trip, stay, flight, activity };
}

test("A: a trip with only a name persists with safe defaults", () => {
  reset();
  const trip = storage.createTrip({ name: "Tokyo" });
  assert.equal(storage.getTripById(trip.id).name, "Tokyo");
  assert.equal(trip.currency, "EUR");
  assert.equal(trip.startDate, "");
  assert.equal(storage.getData().schemaVersion, 2);
});

test("B–F: source costs count once; timeline events point at the original record", () => {
  const { trip, stay, flight, activity } = fixture();
  storage.createExpense({ tripId: trip.id, name: "Metro", amount: 18, status: "paid" });
  const data = storage.getData(), events = selectTimeline(data, trip.id), ledger = selectLedger(data, trip.id);
  assert.equal(events.filter(event => event.sourceId === stay.id).length, 2);
  assert.equal(events.filter(event => event.sourceId === flight.id).length, 2);
  assert.equal(events.filter(event => event.sourceId === activity.id).length, 1);
  assert.equal(ledger.length, 4);
  assert.equal(summarizeBudget(trip, ledger).plannedTotal, 780);
  assert.equal(summarizeBudget(trip, ledger).paidTotal, 18);
  assert.equal(data.timelineItems.length, 0, "derived events must not be persisted");
  assert.equal(data.expenses.length, 1, "source costs must not create expenses");
});

test("C: later edits preserve old fields and propagate to all views", () => {
  const { trip, stay } = fixture();
  storage.updateStay(stay.id, { paymentStatus: "partial", paidAmount: 200, bookingNumber: "BOOK-42", address: "Shinjuku", checkInTime: "15:00", customLegacy: { floor: 9 } });
  storage.updateStay(stay.id, { notes: "Colazione inclusa" });
  const saved = storage.getStayById(stay.id);
  assert.equal(saved.cost, 480);
  assert.equal(saved.checkOutDate, "2026-10-16");
  assert.deepEqual(saved.customLegacy, { floor: 9 });
  const data = storage.getData();
  assert.equal(selectTimeline(data, trip.id).find(event => event.sourceId === stay.id).time, "15:00");
  assert.equal(selectLedger(data, trip.id).find(item => item.sourceId === stay.id).dueAmount, 280);
});

test("G–I: checklist, pins and personalization survive rereading storage", () => {
  const { trip, stay } = fixture();
  const task = storage.createChecklistItem({ tripId: trip.id, title: "Passaporto" });
  storage.toggleChecklistItem(task.id);
  storage.toggleRecordPinned("stays", stay.id);
  storage.updateTrip(trip.id, { dashboardPreferences: { budget: false, notes: true } });
  const model = selectDashboard(storage.getData(), storage.getTripById(trip.id), new Date(2026, 9, 14, 12));
  assert.equal(model.checklist.completed, 1);
  assert.equal(model.pinned[0].sourceId, stay.id);
  assert.equal(model.currentStays[0].sourceId, stay.id);
  assert.equal(model.status, "ongoing");
  assert.equal(model.preferences.budget, false);
  assert.equal(model.preferences.next, true);
});

test("L: legacy key migration is additive, idempotent and preserves orphan/unknown fields", () => {
  reset();
  const legacy = { customRoot: 7, trips: [{ id: "old", name: "Old", destinations: [{ id: "dest", name: "Kyoto", hotel: "Ryokan", notes: "Accesso", extra: "keep" }] }], flights: [{ id: "f", tripId: "old", stopover: { location: "Doha", gate: "Z" } }], notes: [{ id: "orphan", tripId: "missing", content: "Must survive" }] };
  const raw = JSON.stringify(legacy);
  localStorage.setItem("odysseus:data", raw);
  const data = storage.initializeStorage();
  assert.equal(data.notes.length, 1);
  assert.equal(data.trips[0].destinations[0].extra, "keep");
  assert.equal(data.flights[0].stopover.gate, "Z");
  assert.equal(data.customRoot, 7);
  assert.equal(localStorage.getItem("ithaca:data:before-v2"), raw);
  assert.equal(localStorage.getItem("odysseus:data"), raw);
  const first = localStorage.getItem("ithaca:data");
  storage.initializeStorage();
  assert.equal(localStorage.getItem("ithaca:data"), first);
});

test("M: old and new backups round-trip, malformed imports leave current data intact", () => {
  const { stay } = fixture();
  storage.toggleRecordPinned("stays", stay.id);
  const backup = storage.createBackupPayload();
  storage.resetAppData();
  assert.deepEqual(storage.importBackupPayload(JSON.stringify(backup)), backup.data);
  const before = localStorage.getItem(storage.STORAGE_KEY);
  for (const invalid of ["{", {}, { data: { trips: [], stays: "broken" } }, { version: 99, data: { trips: [] } }, { data: { trips: [{ id: "a" }, { id: "a" }] } }]) {
    assert.throws(() => storage.importBackupPayload(invalid));
    assert.equal(localStorage.getItem(storage.STORAGE_KEY), before);
  }
  assert.equal(storage.importBackupPayload({ version: 1, data: { trips: [{ id: "legacy", name: "Legacy" }], timelineItems: [{ id: "manual", tripId: "legacy", title: "Old", date: "2020-01-01", cost: 70 }] } }).timelineItems[0].cost, 70);
});

test("manual timeline costs are preserved and opt-in; explicit source references do not double-count", () => {
  const { trip, stay } = fixture();
  const item = storage.createTimelineItem({ tripId: trip.id, title: "Legacy hotel copy", cost: 480 });
  assert.equal(selectLedger(storage.getData(), trip.id).length, 3);
  storage.updateTimelineItem(item.id, { includeInBudget: true });
  assert.equal(selectLedger(storage.getData(), trip.id).length, 4);
  storage.createExpense({ tripId: trip.id, name: "Linked", amount: 480, sourceType: "stays", sourceId: stay.id });
  assert.equal(selectLedger(storage.getData(), trip.id).length, 4);
  assert.equal(storage.getData().timelineItems[0].cost, 480);
});

test("search covers booking codes, accents, notes, locations and trip isolation", () => {
  const { trip, stay } = fixture();
  storage.updateStay(stay.id, { bookingNumber: "Booking-AB", notes: "Caffè incluso" });
  storage.createNote({ tripId: "elsewhere", title: "Gracery" });
  const records = selectRecords(storage.getData(), trip.id);
  assert.equal(searchRecords(records, "AZ123")[0].source, "flights");
  assert.equal(searchRecords(records, "booking caffe")[0].sourceId, stay.id);
  assert.equal(searchRecords(records, "Gracery").length, 1);
});

test("deleting an original removes derived events and budget costs", () => {
  const { trip, stay } = fixture();
  storage.deleteStay(stay.id);
  const data = storage.getData();
  assert.equal(selectTimeline(data, trip.id).some(event => event.sourceId === stay.id), false);
  assert.equal(selectLedger(data, trip.id).some(record => record.sourceId === stay.id), false);
  storage.deleteTrip(trip.id);
  assert.equal(storage.getData().flights.length, 0);
});

test("storage quota errors never reset valid data during migration", () => {
  reset();
  const raw = JSON.stringify({ trips: [{ id: "a", name: "Keep me" }] });
  localStorage.setItem(storage.STORAGE_KEY, raw);
  localStorage.failKey = storage.STORAGE_KEY;
  assert.throws(() => storage.getData());
  assert.equal(localStorage.getItem(storage.STORAGE_KEY), raw);
});

test("corrupted JSON is backed up before recovery", () => {
  reset(); localStorage.setItem(storage.STORAGE_KEY, "{broken");
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(storage.getData().trips.length, 0); } finally { console.warn = warn; }
  assert.equal(JSON.parse(localStorage.getItem("ithaca:data:corrupted-backup")).rawValue, "{broken");
});

test("undated records stay last; undated trips are not mislabeled; cents are exact", () => {
  assert.equal(sortTimelineItems([{ date: "" }, { date: "2026-10-12" }])[0].date, "2026-10-12");
  assert.equal(determineTripStatus("", ""), "undated");
  assert.equal(summarizeBudget({}, [{ totalAmount: .1, paidAmount: .1 }, { totalAmount: .2, paidAmount: 0 }]).unpaidTotal, .2);
});

test("offline shell covers all production modules and deletes only Ithaca caches", async () => {
  const script = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const urls = [...script.matchAll(/"(\.\/[^"\n]+)"/g)].map(match => match[1]);
  function modules(path) { return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? modules(`${path}/${entry.name}`) : entry.name.endsWith(".js") ? [`${path}/${entry.name}`] : []); }
  for (const module of modules("js")) assert.ok(urls.includes(`./${module}`), `Missing from precache: ${module}`);
  for (const url of urls) assert.ok(existsSync(url), `Missing cached asset: ${url}`);
  const events = {}, deleted = [];
  vm.runInNewContext(script, { self: { addEventListener: (type, fn) => events[type] = fn, clients: { claim: async () => {} } }, caches: { keys: async () => ["ithaca-shell-old", "another-app"], delete: async key => deleted.push(key) } });
  await new Promise((resolve, reject) => events.activate({ waitUntil: promise => promise.then(resolve, reject) }));
  assert.deepEqual(deleted, ["ithaca-shell-old"]);
});

test("offline fetch serves cached modules and navigation fallback under a subdirectory", async () => {
  const events = {};
  const scope = "https://example.test/Ithaca/";
  const script = readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  let networkRequests = 0;
  const cached = new Map([[`${scope}js/app.js`, { body: "app" }], [`${scope}index.html`, { body: "shell" }]]);
  vm.runInNewContext(script, {
    URL,
    self: { addEventListener: (name, handler) => events[name] = handler, location: { origin: "https://example.test" }, registration: { scope } },
    caches: { open: async () => ({ match: async request => cached.get(typeof request === "string" ? request : request.url || request.href) }) },
    fetch: async () => { networkRequests++; throw new Error("offline"); }
  });
  async function request(url, mode) {
    let response;
    events.fetch({ request: { url, mode, method: "GET" }, respondWith: promise => { response = promise; } });
    return response;
  }
  assert.equal((await request(`${scope}js/app.js`, "cors")).body, "app");
  assert.equal((await request(`${scope}?reopen=1`, "navigate")).body, "shell");
  assert.equal(await request("https://elsewhere.test/asset", "cors"), undefined);
  assert.equal(networkRequests, 0);
});
