const ITEMS = [
  {
    label: "Viaggio",
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
    label: "Archivio",
    icon: `<svg viewBox="0 0 24 24" focusable="false"><path d="M3 4h18v5H3V4Zm2 7h14v10H5V11Zm4 2v2h6v-2H9Z"/></svg>`,
    path: "/archive"
  }
];

export function renderBottomNav(tripId, currentHash) {
  const encodedTripId = encodeURIComponent(tripId);
  const basePath = `#/trip/${encodedTripId}`;

  const links = ITEMS.map((item) => {
    const href = `${basePath}${item.path}`;
    const suffix = currentHash.slice(basePath.length).replace(/\/$/, "");
    const isActive = item.path === "/archive" ? ["/archive", "/flights", "/stays", "/activities", "/notes", "/checklist"].includes(suffix) : item.path === "/budget" ? suffix.startsWith("/budget") : suffix === item.path;

    return `
      <a class="bottom-nav__link" href="${href}" ${isActive ? 'aria-current="page"' : ""}>
        <span class="bottom-nav__icon" aria-hidden="true">${item.icon}</span>
        <span>${item.label}</span>
      </a>
    `;
  }).join("");

  return `<nav class="bottom-nav" aria-label="Navigazione viaggio">${links}</nav>`;
}
