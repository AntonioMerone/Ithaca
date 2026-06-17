let toastTimeout;

export function showToast(message, duration = 2800) {
  const root = document.querySelector("#toast-root");

  if (!root) {
    return;
  }

  clearTimeout(toastTimeout);
  root.innerHTML = `<div class="toast" role="status">${message}</div>`;

  toastTimeout = window.setTimeout(() => {
    root.innerHTML = "";
  }, duration);
}
