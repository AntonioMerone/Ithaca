import { escapeHtml } from "../utils.js";

const PLUS_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14"/>
  </svg>
`;

const ACTIONS = [
  {
    pattern: /^#\/home\/?$/,
    action: "open-trip-form",
    label: "Nuovo viaggio"
  },
  {
    pattern: /^#\/trip\/([^/]+)\/flights\/?$/,
    action: "open-flight-form",
    label: "Aggiungi volo"
  },
  {
    pattern: /^#\/trip\/([^/]+)\/stays\/?$/,
    action: "open-stay-form",
    label: "Aggiungi soggiorno"
  },
  {
    pattern: /^#\/trip\/([^/]+)\/activities\/?$/,
    action: "open-activity-form",
    label: "Aggiungi attivita"
  },
  {
    pattern: /^#\/trip\/([^/]+)\/budget\/?$/,
    action: "open-expense-form",
    label: "Aggiungi budget"
  },
  {
    pattern: /^#\/trip\/([^/]+)\/timeline\/?$/,
    action: "open-timeline-form",
    label: "Aggiungi tappa"
  },
  {
    pattern: /^#\/trip\/([^/]+)\/checklist\/?$/,
    action: "open-checklist-form",
    label: "Aggiungi task"
  },
  {
    pattern: /^#\/trip\/([^/]+)\/notes\/?$/,
    action: "open-note-form",
    label: "Nuova nota"
  }
];

export function renderFab(hash) {
  const match = ACTIONS
    .map((item) => ({ ...item, match: hash.match(item.pattern) }))
    .find((item) => item.match);

  if (!match) {
    return "";
  }

  const tripId = match.match[1] ? decodeURIComponent(match.match[1]) : "";
  const tripAttribute = tripId ? ` data-trip-id="${escapeHtml(tripId)}"` : "";

  return `
    <button class="fab" type="button" data-action="${match.action}"${tripAttribute} aria-label="${match.label}">
      ${PLUS_ICON}
    </button>
  `;
}
