/**
 * Scoring action handlers — pause, resume, permission, state query.
 * @module pages/app/scoring-actions
 */

import * as queue from '#utils/scoring-queue.js';
import { storeHandle, restoreAll } from '#utils/file-handle.js';
import { set, remove } from '#utils/storage.js';

/** Pause the global queue. */
export async function handlePause() {
  set('paused', '1');
  await queue.pause();
}

/** Resume the global queue. */
export async function handleResume() {
  remove('paused');
  await queue.resume();
}

/** Request file permissions or re-upload, then restart. */
export async function handleResumePermission() {
  console.log('[permission] attempting restore...');
  const restored = await restoreAll(true);
  console.log('[permission] restored:', restored.size, 'handles');
  for (const [id, file] of restored) queue.registerImputedFile(id, file);
  if (restored.size > 0) {
    remove('paused');
    await queue.scanAndQueue();
    await queue.start();
    return;
  }
  // No persisted handles — open file picker for all needed individuals
  const needIds = queue.getImputedNeedingReupload();
  console.log('[permission] need reupload:', needIds.length);
  if (needIds.length === 0) return;
  try {
    // @ts-ignore — showOpenFilePicker is Chrome-only
    if (!window.showOpenFilePicker) {
      console.warn('[permission] showOpenFilePicker not supported');
      alert('File access not available on this browser. Please re-upload your .asili file.');
      return;
    }
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
    remove('paused');
    await queue.scanAndQueue();
    await queue.start();
  } catch (e) {
    console.warn('[permission] picker cancelled or failed:', e);
  }
}

/** Get current queue state. */
export function getQueueState() {
  return queue.getState();
}
