const EXTRA_ID = 'catalogue-sidebar-extra-controls';

function brandSectionFor(root = document) {
  const extra = root.getElementById?.(EXTRA_ID);
  if (!extra) return null;
  return Array.from(extra.children || []).find(node =>
    node?.classList?.contains('catalogue-sidebar-section')
    && node.querySelector?.('.catalogue-sidebar-heading')?.textContent?.trim() === 'BRANDS'
  ) || null;
}

export function compactBrandSidebar(root = document) {
  const existing = root.querySelector?.('details[data-brand-sidebar]');
  if (existing) return existing;

  const section = brandSectionFor(root);
  if (!section) return null;

  const details = root.createElement('details');
  details.className = section.className;
  details.dataset.brandSidebar = '';

  const heading = section.querySelector('.catalogue-sidebar-heading');
  const summary = root.createElement('summary');
  summary.className = heading?.className || 'catalogue-sidebar-heading';
  summary.textContent = 'BRANDS';
  details.appendChild(summary);

  for (const child of Array.from(section.children)) {
    if (child === heading) continue;
    details.appendChild(child);
  }

  section.replaceWith(details);
  return details;
}

function install(root = document) {
  compactBrandSidebar(root);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => install(document), { once:true });
  } else {
    install(document);
  }
}
