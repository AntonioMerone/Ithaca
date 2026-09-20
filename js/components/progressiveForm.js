import { getTripById } from "../storage.js";

// Keep the existing form fields, validation and values; move optional fields
// into a native disclosure. Closed fields remain part of FormData.
const ESSENTIAL_FIELDS = {
  "trip-form": ["name", "startDate", "endDate"],
  "flight-form": ["from", "to", "departureDate", "departureTime"],
  "stay-form": ["structureName", "checkInDate", "checkOutDate", "cost"],
  "activity-form": ["name", "date", "time", "cost"],
  "expense-form": ["name", "amount", "status"],
  "timeline-form": ["title", "date", "time"],
  "checklist-form": ["title"],
  "note-form": ["title", "content"]
};

export function enhanceProgressiveForm(root) {
  const form = root.querySelector("form");
  const names = ESSENTIAL_FIELDS[form?.id];
  if (!names || form.dataset.progressive) return;
  form.dataset.progressive = "true";
  const primary = document.createElement("div");
  primary.className = "form-essentials";
  for (const name of names) {
    const field = form.querySelector(`[name="${name}"]`)?.closest(".form-field");
    if (field) primary.append(field);
  }
  const details = document.createElement("details");
  details.className = "form-details";
  details.innerHTML = '<summary>Aggiungi dettagli</summary><div class="form-details__body"></div>';
  const body = details.lastElementChild;
  for (const child of [...form.children]) {
    if (child.matches('input[type="hidden"], .form-errors, .form-actions')) continue;
    if (child.matches(".form-grid") && !child.children.length) { child.remove(); continue; }
    body.append(child);
  }
  // Payment amounts must be reachable when the essential status is partial.
  const payment = body.querySelector("[data-paid-amount-field]");
  if (form.id === "expense-form" && payment) primary.append(payment);
  if (body.querySelector(".field-error")) details.open = true;
  const errorSummary = form.querySelector(".form-errors");
  if (errorSummary) errorSummary.tabIndex = -1;
  if (form.elements.mode?.value === "edit") details.firstElementChild.textContent = "Dettagli e pagamenti";
  const actions = form.querySelector(".form-actions");
  form.insertBefore(primary, actions);
  form.insertBefore(details, actions);
  const currency = getTripById(form.elements.tripId?.value)?.currency || "EUR";
  for (const moneyInput of form.querySelectorAll('[name="cost"], [name="amount"], [name="paidAmount"]')) {
    const label = form.querySelector(`label[for="${moneyInput.id}"]`);
    if (label) label.textContent += ` (${currency})`;
  }
  if (form.elements.mode?.value === "edit") {
    const booking = form.querySelector('[name="bookingNumber"]')?.value;
    const flight = form.querySelector('[name="flightNumber"]')?.value;
    if (booking || flight) {
      const reference = document.createElement("p");
      reference.className = "form-reference";
      reference.textContent = [flight ? `Volo ${flight}` : "", booking ? `Prenotazione ${booking}` : ""].filter(Boolean).join(" · ");
      form.insertBefore(reference, primary);
    }
  } else if (["activity-form", "checklist-form"].includes(form.id)) {
    const repeat = actions.querySelector('[data-action="close-modal"]');
    repeat.removeAttribute("data-action");
    repeat.type = "submit";
    repeat.name = "saveAndAdd";
    repeat.value = "true";
    repeat.textContent = "Salva e aggiungi";
    const save = actions.querySelector(".button--primary");
    save.textContent = "Salva";
    // Enter keeps its usual meaning: save and close, not repeat.
    actions.prepend(save);
  }
}
