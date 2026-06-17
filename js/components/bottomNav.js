const ITEMS = [
  { label: "Home", icon: "⌂", path: "" },
  { label: "Timeline", icon: "◇", path: "/timeline" },
  { label: "Budget", icon: "€", path: "/budget" },
  { label: "Checklist", icon: "✓", path: "/checklist" },
  { label: "Note", icon: "✎", path: "/notes" }
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
