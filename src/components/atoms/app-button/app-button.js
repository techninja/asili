/**
 * Button atom — single-purpose action element.
 * @module components/atoms/app-button
 */

import { html, define, dispatch } from 'hybrids';

/**
 * @typedef {Object} AppButtonHost
 * @property {string} label - Button display text
 * @property {'primary'|'secondary'|'ghost'|'danger'} variant - Visual style
 * @property {boolean} disabled - Disabled state
 */

/**
 * @param {AppButtonHost & HTMLElement} host
 * @param {MouseEvent} event
 */
function handleClick(host, event) {
  if (host.disabled) {
    event.preventDefault();
    return;
  }
  dispatch(host, 'press', { bubbles: true });
}

/** @type {import('hybrids').Component<AppButtonHost>} */
export default define({
  tag: 'app-button',
  label: '',
  variant: 'primary',
  disabled: false,
  render: {
    value: ({ label, variant, disabled }) => html`
      <button class="btn btn-${variant}" disabled="${disabled}" onclick="${handleClick}">
        ${label}
      </button>
    `,
    shadow: false,
  },
});
