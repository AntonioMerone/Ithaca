import test from "node:test";
import assert from "node:assert/strict";
import { entryDefaults, nextEntryDefaults, quickAddOptions } from "../js/entryContext.js";
import { createModalHistory } from "../js/components/modalHistory.js";
import { asRecord, selectLedger, summarizeBudget } from "../js/selectors.js";
import { renderRecordRow, recordAction } from "../js/components/recordRow.js";
import * as storage from "../js/storage.js";

const trip = { id: "trip", startDate: "2026-10-12", endDate: "2026-10-24", destinations: [{ id: "tokyo", name: "Tokyo", arrivalDate: "2026-10-12", departureDate: "2026-10-17" }, { id: "kyoto", name: "Kyoto", arrivalDate: "2026-10-17", departureDate: "2026-10-24" }] };

test("contextual menu changes order without hiding types", () => {
  assert.equal(quickAddOptions("budget")[0][0], "expense");
  assert.equal(quickAddOptions("timeline")[0][0], "activity");
  assert.equal(quickAddOptions("stays")[0][0], "stay");
  assert.equal(new Set(quickAddOptions("timeline").map(option => option[0])).size, 7);
});

test("selected day prefills dates and a single matching destination", () => {
  assert.deepEqual(entryDefaults("activity", trip, "2026-10-15"), { date: "2026-10-15", destinationId: "tokyo" });
  assert.deepEqual(entryDefaults("stay", trip, "2026-10-17"), { checkInDate: "2026-10-17", destinationId: "kyoto" });
  assert.deepEqual(entryDefaults("flight", trip, "2026-10-12"), { departureDate: "2026-10-12" });
  assert.deepEqual(entryDefaults("activity", { destinations: [] }, "2026-02-31"), {});
});

test("in-trip defaults use today; undated trips do not invent dates or payments", () => {
  assert.equal(entryDefaults("expense", trip, "", new Date(2026, 9, 15)).date, "2026-10-15");
  assert.deepEqual(entryDefaults("expense", { destinations: [] }), {});
  assert.equal(entryDefaults("expense", trip).status, undefined);
  assert.deepEqual(entryDefaults("activity", { ...trip, destinations: [...trip.destinations, trip.destinations[0]] }, "2026-10-15"), { date: "2026-10-15" });
});

test("consecutive entries retain only context, never cost/title/booking/payment", () => {
  const values = { date: "2026-10-15", destinationId: "tokyo", type: "visita", name: "Museo", time: "10:30", cost: 35, paidAmount: 35, paymentStatus: "paid", bookingNumber: "REF" };
  assert.deepEqual(nextEntryDefaults("activity", values), { date: "2026-10-15", destinationId: "tokyo", type: "visita" });
  assert.deepEqual(nextEntryDefaults("checklist", { title: "Passaporto", section: "pre_departure", dueDate: "2026-10-01" }), { section: "pre_departure", dueDate: "2026-10-01" });
});

test("quick payment updates original, does not create expenses, and can be undone", () => {
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  const savedTrip = storage.createTrip({ name: "Tokyo" });
  const stay = storage.createStay({ tripId: savedTrip.id, structureName: "Gracery", cost: 480, paymentStatus: "partial", paidAmount: 200 });
  const previous = storage.updateRecordPayment("stays", stay.id, "paid");
  assert.equal(storage.getStayById(stay.id).paidAmount, 480);
  assert.equal(storage.getData().expenses.length, 0);
  assert.equal(summarizeBudget(savedTrip, selectLedger(storage.getData(), savedTrip.id)).unpaidTotal, 0);
  storage.updateRecordPayment(previous.source, previous.id, previous.status, previous.paidAmount);
  assert.equal(summarizeBudget(savedTrip, selectLedger(storage.getData(), savedTrip.id)).unpaidTotal, 280);
  storage.deleteStay(stay.id);
  assert.equal(storage.updateRecordPayment("stays", stay.id, "paid"), null, "undo must not resurrect deleted records");
});

test("every view uses the same original editor attributes; rare deletion lives in a menu", () => {
  const record = asRecord("stays", { id: 'hotel"unsafe', structureName: "Gracery", checkInDate: "2026-10-12", checkOutDate: "2026-10-16", bookingNumber: "BOOK-42" });
  const html = renderRecordRow(record, "EUR", { deletable: true });
  assert.match(html, /data-action="edit-stay"/);
  assert.match(recordAction(record), /data-stay-id="hotel&quot;unsafe"/);
  assert.match(html, /<details class="record-menu">/);
  assert.match(html, /Prenotazione BOOK-42/);
  assert.match(html, /16 ott 2026/);
});

function historyEnvironment() {
  const listeners = new Map();
  const entries = [{ route: "home" }];
  let index = 0;
  const environment = {
    location: { href: "https://local.test/#/trip/t" },
    addEventListener: (name, callback) => listeners.set(name, callback),
    history: {
      get state() { return entries[index]; },
      pushState(state) { entries.splice(index + 1); entries.push(state); index++; },
      replaceState(state) { entries[index] = state; },
      back() { if (index) { index--; queueMicrotask(() => listeners.get("popstate")?.()); } }
    },
    get length() { return entries.length; },
    get index() { return index; }
  };
  return environment;
}
const tick = () => new Promise(resolve => queueMicrotask(resolve));

test("Back closes a clean modal without leaving the source route or stacking editors", async () => {
  const env = historyEnvironment(); let backs = 0;
  const history = createModalHistory(env, () => { backs++; history.close(); });
  history.open(); history.open(); history.open();
  assert.equal(env.length, 2);
  env.history.back(); await tick();
  assert.equal(backs, 1);
  assert.equal(env.index, 0);
});

test("dirty Back restores one modal entry; discard consumes it once", async () => {
  const env = historyEnvironment(); let confirmations = 0;
  const history = createModalHistory(env, () => { confirmations++; history.open(); });
  history.open(); env.history.back(); await tick();
  assert.equal(confirmations, 1);
  assert.equal(env.index, 1);
  assert.equal(env.length, 2);
  history.close(); await tick();
  assert.equal(env.index, 0);
  assert.equal(confirmations, 1);
});

test("creating a trip navigates only after dismissing its modal history entry", async () => {
  const env = historyEnvironment(); let navigated = false;
  const history = createModalHistory(env, () => assert.fail("programmatic close must not request confirmation"));
  history.open();
  history.close(() => { assert.equal(env.index, 0); navigated = true; });
  assert.equal(navigated, false);
  await tick();
  assert.equal(navigated, true);
});
