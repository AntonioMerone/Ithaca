let toastTimeout;

export function showToast(message, duration = 2800, action = null) {
  const root = document.querySelector("#toast-root");

  if (!root) {
    return;
  }

  clearTimeout(toastTimeout);
  root.replaceChildren();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(text);
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", action.run, { once: true });
    toast.append(button);
  }
  root.append(toast);

  toastTimeout = window.setTimeout(() => {
    root.innerHTML = "";
  }, duration);
}
