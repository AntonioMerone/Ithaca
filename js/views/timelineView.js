import { escapeHtml } from "../utils.js";

export function renderTimelineView({ params }) {
  const tripId = escapeHtml(params.tripId);

  return `
    <section class="page" aria-labelledby="timeline-title">
      <header class="page__header">
        <p class="page__eyebrow">Itinerario</p>
        <h1 class="page__title" id="timeline-title">Timeline</h1>
        <p class="page__summary">Placeholder per tappe giornaliere, orari e spostamenti del viaggio <strong>${tripId}</strong>.</p>
      </header>

      <div class="placeholder-list" aria-label="Timeline placeholder">
        <div class="placeholder-row">
          <span class="placeholder-row__label">Giorno 1</span>
          <span class="placeholder-row__meta">Da pianificare</span>
        </div>
        <div class="placeholder-row">
          <span class="placeholder-row__label">Giorno 2</span>
          <span class="placeholder-row__meta">Da pianificare</span>
        </div>
      </div>
    </section>
  `;
}
