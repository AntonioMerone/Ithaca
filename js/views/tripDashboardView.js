import { getExpensesByTripId, getTripById } from "../storage.js";
import {
  calculateBudgetSummary,
  calculateCountdown,
  calculateTripDuration,
  determineTripStatus,
  escapeHtml,
  formatCurrency,
  formatDate,
  getDaysUntilTrip
} from "../utils.js";

function formatDestinations(destinations) {
  if (!destinations || destinations.length === 0) {
    return "Destinazioni da definire";
  }

  return destinations.map(escapeHtml).join(" &middot; ");
}

function getStatusLabel(status) {
  const labels = {
    future: "Futuro",
    starts_today: "Parte oggi",
    ongoing: "In corso",
    past: "Concluso"
  };

  return labels[status] || "Futuro";
}

function getHeroMessage(status) {
  const messages = {
    future: "Hai ancora tempo per completare preparativi, budget e checklist.",
    starts_today: "Controlla documenti, check-in e prime tappe.",
    ongoing: "Tieni sott'occhio tappe, spese e note del giorno.",
    past: "Rivedi il riepilogo e conserva il dossier del viaggio."
  };

  return messages[status] || messages.future;
}

function getCountdownNumber(status, startDate) {
  const days = getDaysUntilTrip(startDate);

  if (status === "future" && days !== null) {
    return String(days);
  }

  if (status === "starts_today") {
    return "0";
  }

  if (status === "ongoing") {
    return "live";
  }

  return "done";
}

function getCountdownCaption(status) {
  const captions = {
    future: "giorni alla partenza",
    starts_today: "partenza oggi",
    ongoing: "viaggio in corso",
    past: "viaggio concluso"
  };

  return captions[status] || captions.future;
}

function getNextActions(status) {
  if (status === "ongoing") {
    return [
      "Controlla le attivita di oggi.",
      "Aggiorna le spese.",
      "Consulta le note di viaggio."
    ];
  }

  if (status === "past") {
    return [
      "Rivedi il budget finale.",
      "Conserva le note del viaggio.",
      "Duplica il viaggio come template futuro."
    ];
  }

  if (status === "starts_today") {
    return [
      "Controlla documenti e check-in.",
      "Apri la timeline per le prime tappe.",
      "Tieni le note utili a portata di mano."
    ];
  }

  return [
    "Aggiungi le prime tappe alla timeline.",
    "Inserisci le spese principali nel budget.",
    "Crea la checklist pre-partenza.",
    "Salva note utili sulle destinazioni."
  ];
}

function renderMissingTrip() {
  return `
    <section class="page" aria-labelledby="trip-missing-title">
      <article class="panel panel--wide error-card">
        <p class="page__eyebrow">Viaggio non trovato</p>
        <h1 class="page__title" id="trip-missing-title">Questo dossier non esiste.</h1>
        <p class="page__summary">Il viaggio richiesto non e presente nei dati locali di Ithaca.</p>
        <a class="action-link" href="#/home">Torna alla Home</a>
      </article>
    </section>
  `;
}

function renderMetric(label, value) {
  return `
    <div class="metric-row">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderTripNotes(notes) {
  const cleanNotes = String(notes || "").trim();

  if (!cleanNotes) {
    return "";
  }

  return `<p class="dashboard-note">${escapeHtml(cleanNotes)}</p>`;
}

function renderSectionWidget({ title, body, href, cta }) {
  return `
    <article class="dashboard-widget">
      <h2 class="dashboard-widget__title">${title}</h2>
      <p class="dashboard-widget__body">${body}</p>
      <a class="button button--ghost button--small" href="${href}">${cta}</a>
    </article>
  `;
}

export function renderTripDashboardView({ params }) {
  const trip = getTripById(params.tripId);

  if (!trip) {
    return renderMissingTrip();
  }

  const encodedTripId = encodeURIComponent(trip.id);
  const basePath = `#/trip/${encodedTripId}`;
  const destinations = formatDestinations(trip.destinations);
  const duration = calculateTripDuration(trip.startDate, trip.endDate);
  const countdown = calculateCountdown(trip.startDate, trip.endDate);
  const status = determineTripStatus(trip.startDate, trip.endDate);
  const statusLabel = getStatusLabel(status);
  const expenses = getExpensesByTripId(trip.id);
  const budget = calculateBudgetSummary(trip, expenses);

  return `
    <section class="page dashboard-page" aria-labelledby="trip-title">
      <header class="page__header dashboard-header">
        <p class="page__eyebrow">Dashboard viaggio</p>
        <h1 class="page__title" id="trip-title">${escapeHtml(trip.name)}</h1>
        <p class="page__summary">${destinations}</p>
        <p class="dashboard-header__meta">${formatDate(trip.startDate)} - ${formatDate(trip.endDate)}</p>
        <p class="dashboard-header__meta">${duration} giorni &middot; ${escapeHtml(countdown)}</p>
        ${renderTripNotes(trip.notes)}
      </header>

      <article class="dashboard-hero">
        <div>
          <p class="dashboard-hero__label">Stato viaggio</p>
          <p class="dashboard-hero__count">${escapeHtml(countdown)}</p>
          <p class="dashboard-hero__message">${getHeroMessage(status)}</p>
        </div>
        <div class="dashboard-hero__budget">
          <span>Budget totale</span>
          <strong>${formatCurrency(budget.budgetTotal, trip.currency)}</strong>
        </div>
      </article>

      <section class="dashboard-grid" aria-label="Widget principali">
        <article class="dashboard-widget dashboard-widget--accent">
          <h2 class="dashboard-widget__title">Countdown</h2>
          <p class="dashboard-widget__number">${escapeHtml(getCountdownNumber(status, trip.startDate))}</p>
          <p class="dashboard-widget__body">${escapeHtml(getCountdownCaption(status))}</p>
          <span class="status-pill">${escapeHtml(statusLabel)}</span>
        </article>

        <article class="dashboard-widget">
          <h2 class="dashboard-widget__title">Budget</h2>
          <div class="metric-list">
            ${renderMetric("Budget totale", formatCurrency(budget.budgetTotal, trip.currency))}
            ${renderMetric("Pagato", formatCurrency(budget.paidTotal, trip.currency))}
            ${renderMetric("Da pagare", formatCurrency(budget.unpaidTotal, trip.currency))}
            ${renderMetric("Rimanente", formatCurrency(budget.remaining, trip.currency))}
          </div>
          ${budget.isOverBudget ? `<p class="budget-warning">Budget superato di ${formatCurrency(Math.abs(budget.difference), trip.currency)}</p>` : ""}
          <a class="button button--ghost button--small" href="${basePath}/budget">Apri budget</a>
        </article>

        ${renderSectionWidget({
          title: "Timeline",
          body: "Nessuna tappa inserita",
          href: `${basePath}/timeline`,
          cta: "Vai alla timeline"
        })}

        ${renderSectionWidget({
          title: "Checklist",
          body: "Checklist non ancora configurata",
          href: `${basePath}/checklist`,
          cta: "Vai alla checklist"
        })}

        ${renderSectionWidget({
          title: "Note",
          body: "Nessuna nota inserita",
          href: `${basePath}/notes`,
          cta: "Vai alle note"
        })}
      </section>

      <section class="panel panel--wide action-section" aria-labelledby="next-actions-title">
        <h2 class="panel__title" id="next-actions-title">Prossime azioni</h2>
        <ul class="action-list">
          ${getNextActions(status).map((action) => `<li>${escapeHtml(action)}</li>`).join("")}
        </ul>
      </section>

      <section class="panel panel--wide action-section" aria-labelledby="quick-actions-title">
        <h2 class="panel__title" id="quick-actions-title">Azioni rapide</h2>
        <div class="quick-actions">
          <a class="button button--ghost" href="${basePath}/timeline">Apri timeline</a>
          <a class="button button--ghost" href="${basePath}/budget">Apri budget</a>
          <a class="button button--ghost" href="${basePath}/checklist">Apri checklist</a>
          <a class="button button--ghost" href="${basePath}/notes">Apri note</a>
          <a class="button button--primary" href="#/home">Modifica viaggio</a>
        </div>
      </section>
    </section>
  `;
}
