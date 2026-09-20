import { formatDate } from "./utils.js";
import { localDateKey } from "./selectors.js";

export const ADD_OPTIONS = [
  ["flight", "Volo", "Tratta e orari"], ["stay", "Soggiorno", "Dove dormirai"],
  ["activity", "Attività", "Visita, ristorante, trasporto"], ["expense", "Spesa", "Un costo da annotare"],
  ["note", "Nota", "Un appunto da ritrovare"], ["checklist", "Checklist", "Una cosa da fare"],
  ["timeline", "Altro", "Un evento libero"]
];

export function quickAddOptions(context = "") {
  const preferred = { budget: "expense", timeline: "activity", flights: "flight", stays: "stay", activities: "activity", expenses: "expense", notes: "note", checklistItems: "checklist", checklist: "checklist", timelineItems: "timeline" }[context];
  return [...ADD_OPTIONS].sort((a, b) => Number(b[0] === preferred) - Number(a[0] === preferred));
}

export function entryDefaults(type, trip, selectedDate = "", now = new Date()) {
  if (!trip) return {};
  // Only a selected day, or today's in-trip context, supplies a date. Never
  // infer travel dates from a booking title or a previously entered record.
  const today = localDateKey(now);
  const active = trip.startDate && trip.startDate <= today && (!trip.endDate || trip.endDate >= today);
  const date = formatDate(selectedDate) ? selectedDate : active && ["activity", "expense", "timeline"].includes(type) ? localDateKey(now) : "";
  const destinations = trip.destinations || [];
  const matches = destinations.filter(destination => date && destination.arrivalDate && destination.departureDate && destination.arrivalDate <= date && date < destination.departureDate);
  const destination = matches.length === 1 ? matches[0] : destinations.length === 1 ? destinations[0] : null;
  const defaults = {};
  if (date) defaults[type === "flight" ? "departureDate" : type === "stay" ? "checkInDate" : type === "checklist" ? "dueDate" : "date"] = date;
  if (destination && ["activity", "stay"].includes(type)) defaults.destinationId = destination.id;
  return defaults;
}

export function nextEntryDefaults(type, values) {
  if (type === "activity") return { date: values.date, destinationId: values.destinationId, type: values.type };
  if (type === "checklist") return { section: values.section, dueDate: values.dueDate };
  return {};
}
