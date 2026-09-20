import { escapeHtml } from "../utils.js";

const PLUS_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14"/>
  </svg>
`;

export function renderFab(hash) {
  const match = hash.match(/^#\/trip\/([^/]+)/);
  let tripId = "";
  try { tripId = match ? decodeURIComponent(match[1]) : ""; } catch { return ""; }
  const action = tripId ? "open-quick-add" : "open-trip-form";
  return `<button class="fab" type="button" data-action="${action}" data-trip-id="${escapeHtml(tripId)}" aria-label="${tripId ? "Aggiungi informazione" : "Nuovo viaggio"}" aria-haspopup="dialog">${PLUS_ICON}</button>`;
}
