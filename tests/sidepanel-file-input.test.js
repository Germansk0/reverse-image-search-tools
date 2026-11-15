import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeSelectedFiles} from '../src/sidepanel/fileInput.js';

test('files remain available after clearing and the same image can be chosen again', () => {
  const image = {name: 'same-image.png'};
  let selected = [image];
  const input = {
    get files() { return selected; },
    set value(value) { assert.equal(value, ''); selected = []; }
  };
  const first = consumeSelectedFiles(input);
  assert.deepEqual(first, [image]);
  assert.deepEqual(selected, []);
  selected = [image];
  assert.deepEqual(consumeSelectedFiles(input), [image]);
});

test('clearing an empty input does not fail', () => {
  const input = {files: null, value: 'unused'};
  assert.deepEqual(consumeSelectedFiles(input), []);
  assert.equal(input.value, '');
});
