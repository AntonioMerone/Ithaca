import { escapeHtml, formatDate, formatCurrency, formatDestinationRange } from "../utils.js";
import { RECORD_TYPES, recordPreview } from "../selectors.js";

export function recordAction(record, verb = "edit") {
  const type = RECORD_TYPES[record.source];
  return `data-action="${verb}-${type.action}" data-${type.idAttribute}="${escapeHtml(record.sourceId)}"`;
}

export function renderPin(record) {
  return `<button class="pin-button" type="button" data-action="toggle-pin" data-source="${record.source}" data-record-id="${escapeHtml(record.sourceId)}" aria-pressed="${Boolean(record.item.pinned)}" aria-label="${record.item.pinned ? "Rimuovi da evidenza" : "In evidenza"}: ${escapeHtml(record.title)}" title="${record.item.pinned ? "Rimuovi da evidenza" : "In evidenza"}">${record.item.pinned ? "★" : "☆"}</button>`;
}

export function renderRecordRow(record, currency = "EUR", { deletable = false, detail = "", showPin = true } = {}) {
  const amount = record.totalAmount ?? (record.source === "expenses" ? record.item.amount : record.item.cost);
  const date = record.source === "stays" && !record.label ? formatDestinationRange(record.item.checkInDate, record.item.checkOutDate) : record.date ? formatDate(record.date) : "";
  const meta = [record.label || RECORD_TYPES[record.source].label, date, record.time].filter(Boolean).join(" · ");
  const preview = detail || recordPreview(record);
  return `<article class="record-row">
    <button class="record-row__main" type="button" ${recordAction(record)}>
      <span class="record-row__meta">${escapeHtml(meta)}</span>
      <strong>${escapeHtml(record.title)}</strong>
      ${preview ? `<span class="record-row__detail">${escapeHtml(preview)}</span>` : ""}
      ${Number(amount) > 0 ? `<span class="record-row__cost">${formatCurrency(amount, currency)}</span>` : ""}
    </button>
    <div class="record-row__actions">${showPin ? renderPin(record) : ""}${deletable ? `<button class="button button--small button--danger-ghost" type="button" ${recordAction(record, "delete")} aria-label="Elimina ${escapeHtml(record.title)}">Elimina</button>` : ""}</div>
  </article>`;
}
