/**
 * Accordion panel — expandable section with optional async content generation and copy.
 *
 * Usage:
 *   <accordion-panel
 *     label="🔬 Score diagnostics"
 *     onrun="${handler}"        <!-- dispatched on open; set host.content in handler -->
 *     content="${text}"         <!-- pre-rendered content (or set via onrun) -->
 *     copyable                  <!-- show copy button when open -->
 *   ></accordion-panel>
 *
 * Events:
 *   run - Dispatched when accordion opens. Use to generate content async.
 *         Set the `content` property on the element to display output.
 *
 * @module components/molecules/accordion-panel
 */

import { html, define, dispatch } from 'hybrids';

/**
 *
 */
function toggle(host) {
  if (host.content) {
    host.content = '';
  } else {
    dispatch(host, 'run');
  }
}

/**
 *
 */
function copy(host) {
  if (host.content) {
    navigator.clipboard.writeText(host.content).catch(() => {});
  }
}

export default define({
  tag: 'accordion-panel',
  label: '',
  content: '',
  copyable: false,
  render: {
    value: ({ label, content, copyable }) => {
      const isOpen = !!content;
      return html`
        <div class="accordion-panel ${isOpen ? 'accordion-panel--open' : ''}">
          <button class="accordion-panel__trigger" onclick="${toggle}">
            <span>${label}</span>
            <app-icon name="${isOpen ? 'chevron-up' : 'chevron-down'}" size="sm"></app-icon>
          </button>
          ${isOpen
            ? html`
                <div class="accordion-panel__body">
                  <pre class="accordion-panel__content">${content}</pre>
                  ${copyable
                    ? html`
                        <button
                          class="accordion-panel__copy"
                          title="Copy to clipboard"
                          onclick="${copy}"
                        >
                          <app-icon name="copy" size="sm"></app-icon>
                        </button>
                      `
                    : html``}
                </div>
              `
            : html``}
        </div>
      `;
    },
    shadow: false,
  },
});
