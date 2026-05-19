/**
 * Tests for queue-state.js — state management and mutation helpers.
 * @module utils/queue-state.test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  S,
  getState,
  notifyNow,
  subscribe,
  markDone,
  markError,
  markAllError,
  canScoreIndividual,
  pickNextIndividual,
} from './queue-state.js';

/** Reset S and set up a basic two-individual queue. */
function setup() {
  S.pendingByIndividual = new Map();
  S.doneByIndividual = new Map();
  S.errorByIndividual = new Map();
  S.individualMeta = new Map();
  S.imputedFiles = new Map();
  Object.assign(S, {
    activeIndividualId: '',
    currentScoringId: '',
    currentTraitName: '',
    startMs: 0,
    totalVariantsScored: 0,
    traitsCompleted: 0,
    paused: false,
    running: false,
    needsReprioritize: false,
  });
  S.individualMeta.set('alice', false);
  S.individualMeta.set('bob', true);
  S.pendingByIndividual.set('alice', new Set(['t1', 't2', 't3']));
  S.pendingByIndividual.set('bob', new Set(['t1', 't2']));
  S.doneByIndividual.set('alice', new Set());
  S.doneByIndividual.set('bob', new Set());
  S.errorByIndividual.set('alice', new Set());
  S.errorByIndividual.set('bob', new Set());
}

describe('queue-state', () => {
  beforeEach(setup);

  it('getState returns correct totals', () => {
    const s = getState();
    assert.equal(s.total, 5);
    assert.equal(s.pending, 5);
    assert.equal(s.done, 0);
    assert.equal(s.individualCount, 2);
  });

  it('markDone moves trait from pending to done', () => {
    markDone('alice', 't1', 100);
    const s = getState();
    assert.equal(s.done, 1);
    assert.equal(s.pending, 4);
    assert.equal(s.byIndividual.alice.done, 1);
    assert.equal(S.totalVariantsScored, 100);
  });

  it('markError moves trait from pending to error', () => {
    markError('alice', 't2');
    assert.equal(getState().errors, 1);
    assert.equal(getState().byIndividual.alice.errors, 1);
  });

  it('markAllError marks all pending for an individual', () => {
    markAllError('bob', 'test reason');
    assert.equal(getState().errors, 2);
    assert.equal(S.pendingByIndividual.get('bob').size, 0);
  });

  it('canScoreIndividual returns false for imputed without file', () => {
    assert.equal(canScoreIndividual('alice'), true);
    assert.equal(canScoreIndividual('bob'), false);
    S.imputedFiles.set('bob', /** @type {any} */ ({}));
    assert.equal(canScoreIndividual('bob'), true);
  });

  it('pickNextIndividual prefers active individual', () => {
    S.activeIndividualId = 'alice';
    assert.equal(pickNextIndividual(), 'alice');
  });

  it('pickNextIndividual picks largest pending when no active', () => {
    assert.equal(pickNextIndividual(), 'alice');
  });

  it('pickNextIndividual skips imputed without file', () => {
    S.activeIndividualId = 'bob';
    assert.equal(pickNextIndividual(), 'alice');
  });

  it('subscribe receives notifications via notifyNow', () => {
    const states = [];
    const unsub = subscribe((s) => states.push(s));
    markDone('alice', 't1', 50);
    notifyNow();
    assert.ok(states.length >= 1);
    assert.equal(states[states.length - 1].done, 1);
    unsub();
    const len = states.length;
    markDone('alice', 't2', 50);
    notifyNow();
    assert.equal(states.length, len);
  });
});
