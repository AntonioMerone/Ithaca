import { renderHomeView } from "./views/homeView.js";
import {
  renderActivitiesView,
  renderFlightsView,
  renderStaysView,
  renderTripDashboardView
} from "./views/tripDashboardView.js";
import { renderTimelineView } from "./views/timelineView.js";
import { renderBudgetView } from "./views/budgetView.js";
import { renderChecklistView } from "./views/checklistView.js";
import { renderNotesView } from "./views/notesView.js";
import { renderBottomNav } from "./components/bottomNav.js";
import { renderFab } from "./components/fab.js";
import { getTripById } from "./storage.js";

const ROUTES = [
  {
    name: "Home",
    pattern: /^#\/home\/?$/,
    render: renderHomeView,
    tripPage: false
  },
  {
    name: "Viaggio",
    pattern: /^#\/trip\/([^/]+)\/?$/,
    render: renderTripDashboardView,
    tripPage: true
  },
  {
    name: "Voli",
    pattern: /^#\/trip\/([^/]+)\/flights\/?$/,
    render: renderFlightsView,
    tripPage: true
  },
  {
    name: "Soggiorni",
    pattern: /^#\/trip\/([^/]+)\/stays\/?$/,
    render: renderStaysView,
    tripPage: true
  },
  {
    name: "Attivita",
    pattern: /^#\/trip\/([^/]+)\/activities\/?$/,
    render: renderActivitiesView,
    tripPage: true
  },
  {
    name: "Timeline",
    pattern: /^#\/trip\/([^/]+)\/timeline\/?$/,
    render: renderTimelineView,
    tripPage: true
  },
  {
    name: "Budget",
    pattern: /^#\/trip\/([^/]+)\/budget\/?$/,
    render: renderBudgetView,
    tripPage: true
  },
  {
    name: "Checklist",
    pattern: /^#\/trip\/([^/]+)\/checklist\/?$/,
    render: renderChecklistView,
    tripPage: true
  },
  {
    name: "Note",
    pattern: /^#\/trip\/([^/]+)\/notes\/?$/,
    render: renderNotesView,
    tripPage: true
  }
];

function getCurrentHash() {
  return window.location.hash || "#/home";
}

function matchRoute(hash) {
  for (const route of ROUTES) {
    const match = hash.match(route.pattern);

    if (match) {
      return {
        ...route,
        params: {
          tripId: match[1] ? decodeURIComponent(match[1]) : null
        }
      };
    }
  }

  return null;
}

function renderNotFound(hash) {
  return `
    <section class="page" aria-labelledby="not-found-title">
      <header class="page__header">
        <p class="page__eyebrow">Rotta non trovata</p>
        <h1 class="page__title" id="not-found-title">Qui non c'e ancora una mappa.</h1>
        <p class="page__summary">La rotta <strong>${hash}</strong> non esiste nella shell iniziale.</p>
      </header>
      <a class="action-link" href="#/home">Torna alla home</a>
    </section>
  `;
}

function renderRouteStatus(routeStatus, routeName) {
  if (routeName === "Home") {
    routeStatus.classList.add("app-header__status--actions");
    routeStatus.innerHTML = `
      <span class="app-header__status-label">Home</span>
      <button class="button button--ghost button--small app-header__data-button" type="button" data-action="open-data-management">Gestione dati</button>
    `;
    return;
  }

  routeStatus.classList.remove("app-header__status--actions");
  routeStatus.textContent = routeName;
}

export function initRouter({ app, routeStatus }) {
  function render() {
    const hash = getCurrentHash();
    const route = matchRoute(hash);

    if (!route) {
      app.classList.remove("has-bottom-nav");
      app.innerHTML = renderNotFound(hash);
      renderRouteStatus(routeStatus, "Non trovata");
      app.focus({ preventScroll: true });
      return;
    }

    const viewHtml = route.render({ params: route.params, hash });
    const showTripNav = route.tripPage && getTripById(route.params.tripId);
    const navHtml = showTripNav ? renderBottomNav(route.params.tripId, hash) : "";
    const fabHtml = renderFab(hash);

    app.classList.toggle("has-bottom-nav", Boolean(showTripNav));
    app.innerHTML = viewHtml + navHtml + fabHtml;
    renderRouteStatus(routeStatus, route.name);
    app.focus({ preventScroll: true });
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("ithaca:refresh", render);

  if (!window.location.hash) {
    window.location.hash = "#/home";
  }

  render();
}
