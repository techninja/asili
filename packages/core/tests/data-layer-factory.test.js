import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDataLayer, getDataLayer } from '../src/data-layer/create.js';

describe('data layer factory', () => {
  beforeEach(() => { resetDataLayer(); });

  it('getDataLayer throws before initialization', () => {
    assert.throws(
      () => getDataLayer(),
      { message: /not initialized/i },
    );
  });

  it('resetDataLayer clears the singleton', () => {
    resetDataLayer();
    assert.throws(() => getDataLayer(), { message: /not initialized/i });
  });
});
