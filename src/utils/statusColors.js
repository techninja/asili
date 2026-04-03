/**
 * Maps entity status/priority values to badge colors and display titles.
 * @module utils/statusColors
 */

/** @type {Record<string, 'info'|'success'|'warning'|'danger'>} */
const STATUS_COLORS = {
  active: 'success',
  archived: 'info',
  todo: 'info',
  doing: 'warning',
  done: 'success',
};

/** @type {Record<string, string>} */
const STATUS_TITLES = {
  active: 'Active',
  archived: 'Archived',
  todo: 'To Do',
  doing: 'In Progress',
  done: 'Done',
};

/** @type {Record<string, 'info'|'success'|'warning'|'danger'>} */
const PRIORITY_COLORS = {
  low: 'info',
  med: 'warning',
  high: 'danger',
};

/** @type {Record<string, string>} */
const PRIORITY_TITLES = {
  low: 'Low',
  med: 'Medium',
  high: 'High',
};

/**
 * @param {string} status
 * @returns {'info'|'success'|'warning'|'danger'}
 */
export const statusColor = (status) => STATUS_COLORS[status] || 'info';

/**
 * @param {string} status
 * @returns {string}
 */
export const statusTitle = (status) => STATUS_TITLES[status] || status;

/**
 * @param {string} priority
 * @returns {'info'|'success'|'warning'|'danger'}
 */
export const priorityColor = (priority) => PRIORITY_COLORS[priority] || 'info';

/**
 * @param {string} priority
 * @returns {string}
 */
export const priorityTitle = (priority) => PRIORITY_TITLES[priority] || priority;
