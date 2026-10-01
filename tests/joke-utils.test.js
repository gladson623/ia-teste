import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJokeResponse } from '../src/joke-utils.js';

test('normalizes single jokes', () => {
  const result = normalizeJokeResponse({ type: 'single', joke: 'A single joke.' });

  assert.deepEqual(result, {
    setup: '',
    delivery: 'A single joke.',
  });
});

test('normalizes two-part jokes', () => {
  const result = normalizeJokeResponse({
    type: 'twopart',
    setup: 'Why?',
    delivery: 'Because.',
  });

  assert.deepEqual(result, {
    setup: 'Why?',
    delivery: 'Because.',
  });
});

test('returns null for missing joke content', () => {
  assert.equal(normalizeJokeResponse({ type: 'single', joke: '' }), null);
});

test('throws when API reports an error', () => {
  assert.throws(
    () => normalizeJokeResponse({ error: true, message: 'Service unavailable' }),
    /Service unavailable/
  );
});
