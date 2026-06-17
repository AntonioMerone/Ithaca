import { escapeHtml } from "../utils.js";

export function renderChecklistView({ params }) {
  const tripId = escapeHtml(params.tripId);

  return `
    <section class="page" aria-labelledby="checklist-title">
      <header class="page__header">
        <p class="page__eyebrow">Preparazione</p>
        <h1 class="page__title" id="checklist-title">Checklist</h1>
        <p class="page__summary">Placeholder per documenti, bagagli e attivita prima della partenza del viaggio <strong>${tripId}</strong>.</p>
      </header>

      <div class="placeholder-list" aria-label="Checklist placeholder">
        <div class="placeholder-row">
          <span class="placeholder-row__label">Documenti</span>
          <span class="placeholder-row__meta">Da definire</span>
        </div>
        <div class="placeholder-row">
          <span class="placeholder-row__label">Bagaglio</span>
          <span class="placeholder-row__meta">Da definire</span>
        </div>
      </div>
    </section>
  `;
}
