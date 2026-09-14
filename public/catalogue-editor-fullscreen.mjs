const STYLE_ID = 'catalogue-editor-fullscreen-v9';
const MODAL_ID = 'catalogue-admin';
const TOGGLE_ID = 'catalogue-admin-toggle';

function resetEditorTop(modal) {
  const panel = modal?.querySelector?.('.catalogue-admin-panel');
  if (panel) panel.scrollTop = 0;
  return panel;
}

function installStyle(root = document) {
  if (root.getElementById?.(STYLE_ID)) return;
  const style = root.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${MODAL_ID} .catalogue-admin-panel{width:100vw!important;max-width:none!important;border-left:0!important;box-shadow:none!important}
`;
  root.head?.appendChild(style);
}

export function installCatalogueEditorFullscreen(root = document) {
  if (!root) return;
  installStyle(root);
  const modal = root.getElementById?.(MODAL_ID);
  const toggle = root.getElementById?.(TOGGLE_ID);

  toggle?.addEventListener?.('click', () => {
    resetEditorTop(modal);
    setTimeout(() => resetEditorTop(modal), 0);
  }, true);

  if (modal && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (!modal.hidden) resetEditorTop(modal);
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => installCatalogueEditorFullscreen(document), { once: true });
  else installCatalogueEditorFullscreen(document);
}
