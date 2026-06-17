export function renderHomeView() {
  return `
    <section class="page" aria-labelledby="home-title">
      <header class="page__header">
        <p class="page__eyebrow">Shell iniziale</p>
        <h1 class="page__title" id="home-title">Odysseus Travel OS</h1>
        <p class="page__summary">Una base pulita per pianificare itinerari, spese, checklist e note di viaggio.</p>
      </header>

      <div class="page-grid">
        <article class="panel">
          <h2 class="panel__title">Viaggi</h2>
          <p class="panel__body">Il CRUD dei viaggi arrivera nella prossima fase.</p>
          <a class="action-link" href="#/trip/demo-trip">Apri viaggio demo</a>
        </article>

        <article class="panel">
          <h2 class="panel__title">Fondamenta PWA</h2>
          <p class="panel__body">Manifest, service worker, routing hash e struttura dati locale sono pronti.</p>
        </article>
      </div>
    </section>
  `;
}
