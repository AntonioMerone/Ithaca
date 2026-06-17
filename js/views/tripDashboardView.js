import { escapeHtml } from "../utils.js";

export function renderTripDashboardView({ params }) {
  const tripId = escapeHtml(params.tripId);

  return `
    <section class="page" aria-labelledby="trip-title">
      <header class="page__header">
        <p class="page__eyebrow">Viaggio</p>
        <h1 class="page__title" id="trip-title">Dashboard viaggio</h1>
        <p class="page__summary">Placeholder per panoramica, prossime tappe e stato operativo del viaggio <strong>${tripId}</strong>.</p>
      </header>

      <div class="page-grid">
        <article class="panel">
          <h2 class="panel__title">Prossima tappa</h2>
          <p class="panel__body">Qui compariranno date, luoghi e priorita del viaggio.</p>
        </article>
        <article class="panel">
          <h2 class="panel__title">Stato viaggio</h2>
          <p class="panel__body">Spazio riservato per riepiloghi e alert futuri.</p>
        </article>
      </div>
    </section>
  `;
}
