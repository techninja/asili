/**
 * Badge atom — inline status/priority indicator.
 * @module components/atoms/app-badge
 */

import { html, define } from 'hybrids';

/**
 * @typedef {Object} AppBadgeHost
 * @property {string} label - Badge text
 * @property {'info'|'success'|'warning'|'danger'} color - Color variant
 */

/** @type {import('hybrids').Component<AppBadgeHost>} */
export default define({
  tag: 'app-badge',
  label: '',
  color: 'info',
  render: {
    value: ({ label, color }) => html` <span class="badge badge-${color}">${label}</span> `,
    shadow: false,
  },
});
