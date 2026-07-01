/**
 * Beta view action handlers — switch, cancel, toggle upload.
 * @module pages/app/beta-actions
 */

import { switchIndividual } from './scoring-controller.js';

/** @param {object} host @param {string} id */
export async function handleSwitch(host, id) {
  await switchIndividual(host, id);
}

/**
 *
 */
export function closeOrToggleUpload(host) {
  if (host.showUpload) {
    host.closingUpload = true;
    setTimeout(() => {
      host.showUpload = false;
      host.closingUpload = false;
    }, 200);
  } else {
    host.showUpload = true;
  }
}

/**
 *
 */
export function cancelSetup(host) {
  host.parseStatus = '';
  host.parsedCount = 0;
  host._variants = [];
  host._manifest = '';
  host.parseError = '';
  host.showUpload = false;
}
