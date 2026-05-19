/**
 * Confidence badge atom — shows data confidence level.
 * Maps to coverage tiers from SCORING_PIPELINE.md.
 * @module components/atoms/confidence-badge
 */

import { html, define } from 'hybrids';

const LABELS = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  insufficient: 'Insufficient data',
  none: 'No data',
};

const COLORS = {
  high: 'success',
  medium: 'info',
  low: 'warning',
  insufficient: 'danger',
  none: 'danger',
};

export default define({
  tag: 'confidence-badge',
  level: 'none',
  render: {
    value: ({ level }) => {
      const label = LABELS[level] || level;
      const color = COLORS[level] || 'info';
      return html` <span class="confidence-badge confidence-badge--${color}"> ${label} </span> `;
    },
    shadow: false,
  },
});
