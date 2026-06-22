import { escapeHtml } from "../utils.js";

export function renderAppBar({ subtitle = "", actionHtml = "", backHref = "" } = {}) {
  const backLink = backHref
    ? `<a class="appbar__back" href="${escapeHtml(backHref)}" aria-label="Torna indietro">&larr;</a>`
    : "";

  return `
    <header class="appbar" aria-label="Ithaca">
      <div class="appbar__brand">
        ${backLink}
        <img class="appbar__mark" src="./assets/brand/ithaca-logo.png" alt="" width="36" height="36">
        <div class="appbar__text">
          <strong>Ithaca</strong>
          ${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}
        </div>
      </div>
      ${actionHtml ? `<div class="appbar__actions">${actionHtml}</div>` : ""}
    </header>
  `;
}
