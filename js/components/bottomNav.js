const ITEMS = [
  {
    label: "Dashboard",
    icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-5H4v5Z"/></svg>`,
    path: ""
  },
  {
    label: "Timeline",
    icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M6 4h2v5h8V4h2v5a2 2 0 0 1-2 2h-3v2h3a2 2 0 0 1 2 2v5h-2v-5H8v5H6v-5a2 2 0 0 1 2-2h3v-2H8a2 2 0 0 1-2-2V4Z"/></svg>`,
    path: "/timeline"
  },
  {
    label: "Budget",
    icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3a7 7 0 0 0-7 7v1H3v2h2v1H3v2h2.3A7 7 0 1 0 12 3Zm0 2a5 5 0 1 1-4.6 7H13v-2H7a5 5 0 0 1 5-5Z"/></svg>`,
    path: "/budget"
  },
  {
    label: "Checklist",
    icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="m9 7-1.4 1.4L10.2 11l5.2-5.2L14 4.4 10.2 8.2 9 7Zm-3 7h12v2H6v-2Zm0 4h12v2H6v-2Z"/></svg>`,
    path: "/checklist"
  },
  {
    label: "Note",
    icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M6 3h9l3 3v15H6V3Zm8 2H8v14h8V7h-2V5Zm-4 6h4v2h-4v-2Zm0 4h4v2h-4v-2Z"/></svg>`,
    path: "/notes"
  }
];

export function renderBottomNav(tripId, currentHash) {
  const encodedTripId = encodeURIComponent(tripId);
  const basePath = `#/trip/${encodedTripId}`;

  const links = ITEMS.map((item) => {
    const href = `${basePath}${item.path}`;
    const isActive = currentHash === href || (!item.path && currentHash === `${basePath}/`);

    return `
      <a class="bottom-nav__link" href="${href}" ${isActive ? 'aria-current="page"' : ""}>
        <span class="bottom-nav__icon" aria-hidden="true">${item.icon}</span>
        <span>${item.label}</span>
      </a>
    `;
  }).join("");

  return `<nav class="bottom-nav" aria-label="Navigazione viaggio">${links}</nav>`;
}
