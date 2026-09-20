import { enhanceProgressiveForm } from "./progressiveForm.js";
import { createModalHistory } from "./modalHistory.js";

let returnFocus = null;
let modalHistory = null;

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
    modalHistory?.open();
    showUnsavedConfirmation();
    return;
  }

  closeModal({ force: true });
}

function handleModalKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    if (document.querySelector(".unsaved-confirm")) { hideUnsavedConfirmation(); getProtectedForm()?.querySelector("input:not([type='hidden'])")?.focus(); return; }
    requestModalClose();
  }
  if (event.key === "Tab") {
    const scope = document.querySelector(".unsaved-confirm") || document.querySelector("#modal-root .modal");
    const focusable = [...scope.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
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
    getProtectedForm()?.querySelector("input:not([type='hidden']), select, textarea, button")?.focus();
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

export function markModalSaved() {
  modalState.dirty = false;
  modalState.initialSnapshot = getFormSnapshot(getProtectedForm());
}

export function openModal({ title = "Dettaglio", content = "", confirmOnDirty = false } = {}) {
  modalHistory ||= createModalHistory(window, requestModalClose);
  modalHistory.open();
  const root = document.querySelector("#modal-root");
  if (!root.children.length) returnFocus = document.activeElement;
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
  enhanceProgressiveForm(root);
  modalState.initialSnapshot = getFormSnapshot(getProtectedForm());

  document.body.classList.add("modal-open");
  document.querySelector(".app-shell").inert = true;
  (root.querySelector(".form-errors") || root.querySelector(".modal__close")).focus();
  root.addEventListener("input", handleModalInput);
  root.addEventListener("change", handleModalInput);
  root.addEventListener("click", handleModalClick, true);
  root.addEventListener("submit", handleModalSubmit, true);
  document.addEventListener("keydown", handleModalKeydown);
}

export function closeModal({ force = false, navigateTo = "" } = {}) {
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
  document.body.classList.remove("modal-open");
  document.querySelector(".app-shell").inert = false;
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  document.removeEventListener("keydown", handleModalKeydown);
  resetModalState();
  modalHistory?.close(navigateTo ? () => { window.location.hash = navigateTo; } : undefined);
}

