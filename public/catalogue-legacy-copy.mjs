const SUBSTANTIAL_SELECTOR = '[data-noteworthy-section="substantial"]';
const LEGACY_HEADING = 'Substantial format';
const LEGACY_NOTE = 'Size Gold, Value not Gold. Bigger smokes at mid prices.';

export function removeLegacySubstantialCopy(root = document) {
  const mount = root?.querySelector?.(SUBSTANTIAL_SELECTOR);
  if (!mount) return 0;

  let removed = 0;
  const heading = mount.querySelector?.(':scope > .subtier-heading');
  if (heading?.textContent?.trim() === LEGACY_HEADING) {
    heading.remove();
    removed += 1;
  }

  const note = mount.querySelector?.(':scope > .subtier-note');
  if (note?.textContent?.trim() === LEGACY_NOTE) {
    note.remove();
    removed += 1;
  }

  return removed;
}

export function installLegacyCatalogueCopyCleanup(root = document) {
  return removeLegacySubstantialCopy(root);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installLegacyCatalogueCopyCleanup(document), { once: true });
  } else {
    installLegacyCatalogueCopyCleanup(document);
  }
}
