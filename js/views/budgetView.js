import { escapeHtml, formatCurrency } from "../utils.js";

export function renderBudgetView({ params }) {
  const tripId = escapeHtml(params.tripId);

  return `
    <section class="page" aria-labelledby="budget-title">
      <header class="page__header">
        <p class="page__eyebrow">Spese</p>
        <h1 class="page__title" id="budget-title">Budget</h1>
        <p class="page__summary">Placeholder per previsioni, pagamenti e consuntivo del viaggio <strong>${tripId}</strong>.</p>
      </header>

      <div class="page-grid">
        <article class="panel">
          <h2 class="panel__title">Budget previsto</h2>
          <p class="panel__body">${formatCurrency(0)} da configurare.</p>
        </article>
        <article class="panel">
          <h2 class="panel__title">Spese registrate</h2>
          <p class="panel__body">${formatCurrency(0)} in questa shell iniziale.</p>
        </article>
      </div>
    </section>
  `;
}
