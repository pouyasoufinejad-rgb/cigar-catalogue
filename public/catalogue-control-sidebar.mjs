const STYLE_ID = 'catalogue-control-sidebar-style-v1';
const SIDEBAR_ID = 'catalogue-control-sidebar';
const DESKTOP_QUERY = '(min-width: 1660px)';
const placements = new WeakMap();

function rememberPlacement(node) {
  if (!node?.parentNode || placements.has(node)) return;
  const marker = node.ownerDocument.createComment(` ${SIDEBAR_ID} origin `);
  node.parentNode.insertBefore(marker, node);
  placements.set(node, marker);
}

function restoreNode(node) {
  const marker = placements.get(node);
  if (!marker?.parentNode) return;
  marker.parentNode.insertBefore(node, marker.nextSibling);
  marker.remove();
  placements.delete(node);
}

function ensureSidebar(root = document) {
  let sidebar = root.getElementById?.(SIDEBAR_ID);
  if (sidebar) return sidebar;
  sidebar = root.createElement('aside');
  sidebar.id = SIDEBAR_ID;
  sidebar.className = 'catalogue-control-sidebar';
  sidebar.setAttribute('aria-label', 'Catalogue controls');
  (root.body || root.documentElement).appendChild(sidebar);
  return sidebar;
}

function controlNodes(root = document) {
  return [
    root.getElementById?.('catalogue-convenience-toolbar'),
    root.querySelector?.('.controls')
  ].filter(Boolean);
}

export function moveControlsToSidebar(root = document) {
  const sidebar = ensureSidebar(root);
  for (const node of controlNodes(root)) {
    rememberPlacement(node);
    sidebar.appendChild(node);
  }
  return sidebar;
}

export function restoreControlsFromSidebar(root = document) {
  for (const node of controlNodes(root)) restoreNode(node);
  const sidebar = root.getElementById?.(SIDEBAR_ID);
  if (sidebar && !sidebar.children.length) sidebar.remove();
}

function ensureStyles(root = document) {
  if (root.getElementById?.(STYLE_ID)) return;
  const style = root.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${SIDEBAR_ID}{
  position:fixed;
  z-index:44;
  top:18px;
  right:calc(50vw + 650px);
  width:min(230px,calc(50vw - 660px));
  max-height:calc(100vh - 36px);
  overflow:auto;
  display:flex;
  flex-direction:column;
  gap:10px;
  scrollbar-width:thin;
}
#${SIDEBAR_ID} .catalogue-convenience-toolbar{
  position:static!important;
  top:auto!important;
  width:100%!important;
  margin:0!important;
  padding:9px!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  gap:8px!important;
}
#${SIDEBAR_ID} .catalogue-convenience-toolbar .convenience-toolbar-group{
  width:100%!important;
  display:flex!important;
  align-items:center!important;
  gap:5px!important;
  flex-wrap:wrap!important;
}
#${SIDEBAR_ID} .controls{
  width:100%!important;
  margin:0!important;
  padding:10px!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  gap:10px!important;
  border:1px solid rgba(195,162,80,.35);
  border-radius:10px;
  background:rgba(10,9,7,.94);
}
#${SIDEBAR_ID} .sort-pair{
  width:100%!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  gap:8px!important;
}
#${SIDEBAR_ID} .controls label{display:block!important;width:100%!important}
#${SIDEBAR_ID} .controls select{
  display:block!important;
  width:100%!important;
  min-width:0!important;
  margin:4px 0 0!important;
  padding:7px 26px 7px 8px!important;
  font-size:12px!important;
}
#${SIDEBAR_ID} .toggle{
  width:100%!important;
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:5px!important;
}
#${SIDEBAR_ID} .toggle button{
  width:100%!important;
  padding:7px 8px!important;
  text-align:left!important;
  line-height:1.25!important;
}
@media(max-width:1659px){
  #${SIDEBAR_ID}{display:none!important}
}
`;
  (root.head || root.documentElement).appendChild(style);
}

export function installControlSidebar(root = document, view = globalThis.window) {
  if (!root?.querySelector) return;
  ensureStyles(root);
  const media = view?.matchMedia?.(DESKTOP_QUERY);
  let retries = 0;

  const apply = () => {
    if (media?.matches) moveControlsToSidebar(root);
    else restoreControlsFromSidebar(root);

    if (media?.matches && !root.getElementById?.('catalogue-convenience-toolbar') && retries < 20) {
      retries += 1;
      view?.setTimeout?.(apply, 50);
    }
  };

  apply();
  media?.addEventListener?.('change', apply);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => installControlSidebar(document, window), { once:true });
  } else {
    installControlSidebar(document, window);
  }
}

export { DESKTOP_QUERY, SIDEBAR_ID };
