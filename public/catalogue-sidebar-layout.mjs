const STYLE_ID = 'catalogue-sidebar-layout-v1';

export const DESKTOP_SIDEBAR_MAX_WIDTH = 300;

export function ensureSidebarLayout(root = document) {
  if (!root?.createElement || root.getElementById?.(STYLE_ID)) return;
  const style = root.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#catalogue-control-sidebar{
  width:min(${DESKTOP_SIDEBAR_MAX_WIDTH}px,calc(50vw - 660px))!important;
}
`;
  (root.head || root.documentElement).appendChild(style);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ensureSidebarLayout(document), { once:true });
  else ensureSidebarLayout(document);
}
