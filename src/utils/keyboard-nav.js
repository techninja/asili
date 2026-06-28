/**
 * Keyboard navigation — unified key command handler for detail pages.
 * Supports vim-style (h/j/k/l) and arrow keys for paging.
 * @module utils/keyboard-nav
 */

const BINDINGS = {
  prev: ['ArrowLeft', 'ArrowUp', 'h', 'k'],
  next: ['ArrowRight', 'ArrowDown', 'l', 'j'],
};

let activeHandler = null;

/**
 * Register keyboard navigation for a detail page.
 * @param {{ getPrev: () => string, getNext: () => string }} opts
 * @returns {() => void} cleanup function
 */
export function registerKeyNav(opts) {
  unregisterKeyNav();
  activeHandler = (e) => {
    // Don't intercept when typing in inputs
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    let href = null;
    if (BINDINGS.prev.includes(e.key)) href = opts.getPrev();
    else if (BINDINGS.next.includes(e.key)) href = opts.getNext();

    if (href) {
      e.preventDefault();
      window.history.pushState(null, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };
  window.addEventListener('keydown', activeHandler);
  return unregisterKeyNav;
}

/** Remove active keyboard navigation handler. */
export function unregisterKeyNav() {
  if (activeHandler) {
    window.removeEventListener('keydown', activeHandler);
    activeHandler = null;
  }
}
