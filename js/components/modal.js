const UNSAVED_CONFIRM_TITLE = "Hai modifiche non salvate.";
const UNSAVED_CONFIRM_BODY = "Se esci ora, perderai i dati inseriti.";

let modalState = {
  confirmOnDirty: false,
  dirty: false,
  initialSnapshot: "",
  allowClose: false
};

function getProtectedForm() {
  return document.querySelector("#modal-root .modal form");
}

function getFormSnapshot(form) {
  if (!form) {
    return "";
  }

  const formData = new FormData(form);
  const entries = [];

  formData.forEach((value, key) => {
    entries.push([key, String(value)]);
  });

  return JSON.stringify(entries);
}

function isFormDirty() {
  if (!modalState.confirmOnDirty) {
    return false;
  }

  const form = getProtectedForm();

  if (!form) {
    return false;
  }

  return modalState.dirty || getFormSnapshot(form) !== modalState.initialSnapshot;
}

function hideUnsavedConfirmation() {
  document.querySelector("#modal-root .unsaved-confirm")?.remove();
}

function showUnsavedConfirmation() {
  const modal = document.querySelector("#modal-root .modal");

  if (!modal || document.querySelector("#modal-root .unsaved-confirm")) {
    return;
  }

  modal.insertAdjacentHTML("beforeend", `
    <div class="unsaved-confirm" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-confirm-title" aria-describedby="unsaved-confirm-body">
      <div class="unsaved-confirm__panel">
        <p class="unsaved-confirm__eyebrow">Modifiche non salvate</p>
        <h3 id="unsaved-confirm-title">${UNSAVED_CONFIRM_TITLE}</h3>
        <p id="unsaved-confirm-body">${UNSAVED_CONFIRM_BODY}</p>
        <div class="form-actions">
          <button class="button button--ghost" type="button" data-modal-action="continue-editing">Continua a modificare</button>
          <button class="button button--danger" type="button" data-modal-action="discard-changes">Esci senza salvare</button>
        </div>
      </div>
    </div>
  `);

  modal.querySelector("[data-modal-action='continue-editing']")?.focus();
}

function requestModalClose() {
  if (isFormDirty()) {
    showUnsavedConfirmation();
    return;
  }

  closeModal({ force: true });
}

function handleModalKeydown(event) {
  if (event.key === "Escape") {
    requestModalClose();
  }
}

function handleModalInput() {
  if (modalState.confirmOnDirty) {
    modalState.dirty = true;
  }
}

function handleModalClick(event) {
  const closeTarget = event.target.closest(".modal__close, [data-action='close-modal']");
  const isBackdropClick = event.target.classList.contains("modal-backdrop");
  const modalAction = event.target.closest("[data-modal-action]");

  if (closeTarget || isBackdropClick) {
    event.preventDefault();
    event.stopPropagation();
    requestModalClose();
    return;
  }

  if (modalAction?.dataset.modalAction === "continue-editing") {
    event.preventDefault();
    event.stopPropagation();
    hideUnsavedConfirmation();
    getProtectedForm()?.querySelector("input, select, textarea, button")?.focus();
    return;
  }

  if (modalAction?.dataset.modalAction === "discard-changes") {
    event.preventDefault();
    event.stopPropagation();
    closeModal({ force: true });
    return;
  }

  if (
    modalState.confirmOnDirty &&
    event.target.closest("form") &&
    event.target.closest("[data-action]") &&
    event.target.closest("[data-action]")?.dataset.action !== "close-modal"
  ) {
    modalState.dirty = true;
  }
}

function handleModalSubmit() {
  modalState.allowClose = true;
}

function resetModalState() {
  modalState = {
    confirmOnDirty: false,
    dirty: false,
    initialSnapshot: "",
    allowClose: false
  };
}

export function markModalDirty() {
  if (modalState.confirmOnDirty) {
    modalState.dirty = true;
  }
}

export function openModal({ title = "Dettaglio", content = "", confirmOnDirty = false } = {}) {
  const root = document.querySelector("#modal-root");
  const wasDirty = modalState.dirty || isFormDirty();

  document.removeEventListener("keydown", handleModalKeydown);
  root.removeEventListener("input", handleModalInput);
  root.removeEventListener("change", handleModalInput);
  root.removeEventListener("click", handleModalClick, true);
  root.removeEventListener("submit", handleModalSubmit, true);
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

  modalState = {
    confirmOnDirty,
    dirty: confirmOnDirty && wasDirty,
    initialSnapshot: "",
    allowClose: false
  };
  modalState.initialSnapshot = getFormSnapshot(getProtectedForm());

  root.querySelector(".modal__close").focus();
  root.addEventListener("input", handleModalInput);
  root.addEventListener("change", handleModalInput);
  root.addEventListener("click", handleModalClick, true);
  root.addEventListener("submit", handleModalSubmit, true);
  document.addEventListener("keydown", handleModalKeydown);
}

export function closeModal({ force = false } = {}) {
  if (!force && !modalState.allowClose && isFormDirty()) {
    showUnsavedConfirmation();
    return;
  }

  const root = document.querySelector("#modal-root");
  root.removeEventListener("input", handleModalInput);
  root.removeEventListener("change", handleModalInput);
  root.removeEventListener("click", handleModalClick, true);
  root.removeEventListener("submit", handleModalSubmit, true);
  root.innerHTML = "";
  document.removeEventListener("keydown", handleModalKeydown);
  resetModalState();
}
