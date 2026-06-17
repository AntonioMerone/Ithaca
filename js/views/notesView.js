import { escapeHtml } from "../utils.js";

export function renderNotesView({ params }) {
  const tripId = escapeHtml(params.tripId);

  return `
    <section class="page" aria-labelledby="notes-title">
      <header class="page__header">
        <p class="page__eyebrow">Memoria</p>
        <h1 class="page__title" id="notes-title">Note</h1>
        <p class="page__summary">Placeholder per appunti, idee e riferimenti del viaggio <strong>${tripId}</strong>.</p>
      </header>

      <article class="panel">
        <h2 class="panel__title">Taccuino</h2>
        <p class="panel__body">Le note saranno salvate in localStorage nelle fasi successive.</p>
      </article>
    </section>
  `;
}
