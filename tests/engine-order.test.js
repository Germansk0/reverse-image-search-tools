import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVisibleOrder} from '../src/options/engineOrder.js';

test('reorders filtered engines without displacing hidden engines', () => {
  assert.deepEqual(applyVisibleOrder(['a','b','c','d','e'], ['b','d','e'], ['e','b','d']), ['a','e','c','b','d']);
});

test('rejects incomplete or duplicate orders without losing engines', () => {
  const original=['a','b','c','d'];
  assert.deepEqual(applyVisibleOrder(original,['b','d'],['b']), original);
  assert.deepEqual(applyVisibleOrder(original,['b','d'],['b','b']), original);
  assert.deepEqual(applyVisibleOrder(original,['b','d'],['b','x']), original);
});
