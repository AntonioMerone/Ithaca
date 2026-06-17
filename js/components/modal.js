export function openModal({ title = "Dettaglio", content = "" } = {}) {
  const root = document.querySelector("#modal-root");

  root.innerHTML = `
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal__header">
          <h2 class="modal__title" id="modal-title">${title}</h2>
          <button class="modal__close" type="button" aria-label="Chiudi">x</button>
        </header>
        <div class="modal__body">${content}</div>
      </section>
    </div>
  `;

  root.querySelector(".modal__close").addEventListener("click", closeModal);
  root.querySelector(".modal-backdrop").addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) {
      closeModal();
    }
  });
}

export function closeModal() {
  const root = document.querySelector("#modal-root");
  root.innerHTML = "";
}
