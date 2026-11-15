import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSelection, selectionForSave} from '../src/sidepanel/engineSelection.js';

test('all follows newly enabled engines, custom selection stays explicit and drops disabled engines', () => {
  const enabled = ['google', 'bing', 'tineye'];
  assert.deepEqual(resolveSelection(enabled, null), enabled);
  assert.deepEqual(resolveSelection(enabled, {mode:'recommended'}), ['google']);
  assert.deepEqual(resolveSelection([], {mode:'recommended'}), []);
  assert.deepEqual(resolveSelection(enabled, {mode:'all'}), enabled);
  assert.deepEqual(resolveSelection(enabled, {mode:'custom', engines:['tineye','disabled','google']}), ['google','tineye']);
  assert.deepEqual(resolveSelection(enabled, {mode:'custom', engines:[]}), []);
  assert.deepEqual(selectionForSave(enabled, ['google','bing','tineye']), {mode:'all'});
  assert.deepEqual(selectionForSave(enabled, ['google','google','disabled']), {mode:'custom',engines:['google']});
});
