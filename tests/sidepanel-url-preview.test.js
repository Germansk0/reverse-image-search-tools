import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrlPreviewController, isValidWebUrl} from '../src/sidepanel/urlPreview.js';

test('only valid HTTP and HTTPS addresses can be used for a URL search or preview', () => {
  assert.equal(isValidWebUrl('https://example.com/image.png'), true);
  assert.equal(isValidWebUrl('http://example.com/image.png'), true);
  for (const value of ['', 'not a URL', 'javascript:alert(1)', 'data:image/png;base64,abc', `https://a.co/${'x'.repeat(2050)}`]) {
    assert.equal(isValidWebUrl(value), false, value);
  }
});

test('preview requests are debounced and stale results cannot replace the latest URL', () => {
  const states = [];
  const pending = new Map();
  let id = 0;
  const c = createUrlPreviewController({onState: state => states.push(state), setTimer: fn => {pending.set(++id, fn); return id;}, clearTimer: key => pending.delete(key)});
  c.update('https://example.com/old.png');
  c.update('https://example.com/new.png');
  assert.equal(pending.size, 1);
  [...pending.values()][0]();
  assert.deepEqual(states.at(-1), {src: 'https://example.com/new.png', status: 'loading'});
  c.result('https://example.com/old.png', 'ready');
  assert.equal(states.at(-1).status, 'loading');
  c.result('https://example.com/new.png', 'unavailable');
  assert.deepEqual(states.at(-1), {src: 'https://example.com/new.png', status: 'unavailable'});
  c.update('');
  assert.deepEqual(states.at(-1), {src: '', status: 'empty'});
  c.dispose();
});

test('disposing prevents a delayed request from updating the interface', () => {
  const states = [];
  let callback;
  const c = createUrlPreviewController({onState: value => states.push(value), setTimer: fn => {callback = fn; return 1;}, clearTimer: () => {}});
  c.update('https://example.com/image.png');
  c.dispose();
  callback();
  c.result('https://example.com/image.png', 'ready');
  assert.deepEqual(states, [{src: '', status: 'loading'}]);
});

test('a stalled preview becomes unavailable without preventing a late load or letting stale timers replace a newer URL', () => {
  const states = [];
  const pending = new Map();
  let id = 0;
  const c = createUrlPreviewController({onState: s => states.push(s), setTimer: (fn, ms) => {pending.set(++id, {fn, ms}); return id;}, clearTimer: key => pending.delete(key)});
  const fire = ms => {const [key, item] = [...pending].find(([, value]) => value.ms === ms); pending.delete(key); item.fn();};
  c.update('https://example.com/slow.png');
  fire(350);
  fire(10000);
  assert.deepEqual(states.at(-1), {src:'https://example.com/slow.png',status:'unavailable'});
  c.result('https://example.com/slow.png', 'ready');
  assert.equal(states.at(-1).status, 'ready');
  c.update('https://example.com/old.png');
  fire(350);
  c.update('https://example.com/new.png');
  assert.equal([...pending.values()].filter(item => item.ms === 10000).length, 0);
  fire(350);
  c.result('https://example.com/new.png', 'ready');
  assert.equal(pending.size, 0);
  c.dispose();
});
