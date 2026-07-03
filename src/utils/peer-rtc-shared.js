/**
 * Peer RTC shared — config, listeners, and helpers used by both source and viewer.
 * @module utils/peer-rtc-shared
 */

import { compress, decompress } from './peer-sdp.js';

export { compress, decompress };

export const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
export const GATHER_TIMEOUT = 5000;

export const dcListeners = new Set();
export const openListeners = new Set();

/** @param {object} msg */
export function emit(msg) {
  for (const fn of dcListeners) fn(msg);
}

/**
 *
 */
export function emitOpen() {
  for (const fn of openListeners) fn();
}

/** Wait for ICE gathering to complete (or timeout). */
export function waitForICE(conn) {
  return new Promise((resolve) => {
    if (conn.iceGatheringState === 'complete') return resolve();
    const timer = setTimeout(resolve, GATHER_TIMEOUT);
    conn.onicegatheringstatechange = () => {
      if (conn.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    };
  });
}
