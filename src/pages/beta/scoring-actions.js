/**
 * Scoring action handlers — pause, resume, permission, state query.
 * @module pages/beta/scoring-actions
 */

import * as queue from '#utils/scoring-queue.js';
import { storeHandle, restoreAll } from '#utils/file-handle.js';

/** Pause the global queue. */
export async function handlePause() {
  localStorage.setItem('asili_paused', '1');
  await queue.pause();
}

/** Resume the global queue. */
export async function handleResume() {
  localStorage.removeItem('asili_paused');
  await queue.resume();
}

/** Request file permissions or re-upload, then restart. */
export async function handleResumePermission() {
  const restored = await restoreAll(true);
  for (const [id, file] of restored) queue.registerImputedFile(id, file);
  if (restored.size > 0) {
    localStorage.removeItem('asili_paused');
    await queue.scanAndQueue();
    await queue.start();
    return;
  }
  // No persisted handles — open file picker for all needed individuals
  const needIds = queue.getImputedNeedingReupload();
  if (needIds.length === 0) return;
  try {
    // @ts-ignore — showOpenFilePicker is Chrome-only
    const handles = await window.showOpenFilePicker({
      types: [{ accept: { 'application/octet-stream': ['.asili'] } }],
      multiple: needIds.length > 1,
    });
    for (let i = 0; i < Math.min(handles.length, needIds.length); i++) {
      const file = await handles[i].getFile();
      queue.registerImputedFile(needIds[i], file);
      storeHandle(needIds[i], handles[i]);
    }
    localStorage.removeItem('asili_paused');
    await queue.scanAndQueue();
    await queue.start();
  } catch {
    /* user cancelled picker */
  }
}

/** Get current queue state. */
export function getQueueState() {
  return queue.getState();
}
