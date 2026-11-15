import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../src/background/main.js', import.meta.url), 'utf8');
const panelPath = 'src/sidepanel/index.html';

function readFunctions(start, end, globals) {
  const offset = source.indexOf(start);
  const boundary = source.indexOf(end, offset);
  assert.ok(offset >= 0 && boundary > offset);
  return runInNewContext(`${source.slice(offset, boundary)}\n${start.match(/function (\w+)/)[1]}`, globals);
}

test('all manifests omit a toolbar popup and native sidebar manifests use the same page', () => {
  for (const target of ['chrome', 'edge', 'firefox', 'opera', 'safari', 'samsung']) {
    const manifest = JSON.parse(readFileSync(new URL(`../src/assets/manifest/${target}.json`, import.meta.url)));
    assert.equal((manifest.action ?? manifest.browser_action).default_popup, undefined, target);
    if (['chrome', 'edge', 'opera'].includes(target)) {
      assert.equal(manifest.side_panel?.default_path, panelPath, target);
      assert.ok(manifest.permissions.includes('sidePanel'), target);
    }
    if (target === 'firefox') {
      assert.equal(manifest.sidebar_action?.default_panel, panelPath);
      assert.equal(manifest.sidebar_action?.open_at_install, false);
    }
  }
});

test('toolbar setup clears a previously saved popup and configures the Chromium panel', async () => {
  const calls = [];
  const action = {
    async setPopup({popup}) { calls.push(['popup', popup]); },
    async setTitle({title}) { calls.push(['title', title]); }
  };
  const setBrowserAction = readFunctions('async function setBrowserAction(', 'async function getMessagePort(', {
    mv3: true,
    browser: {action},
    chrome: {sidePanel: {async setPanelBehavior({openPanelOnActionClick}) {
      calls.push(['openPanelOnActionClick', openPanelOnActionClick]);
    }}},
    getText: () => 'Reverse Image Search Tools'
  });
  await setBrowserAction();
  assert.deepEqual(calls, [
    ['popup', ''], ['title', 'Reverse Image Search Tools'], ['openPanelOnActionClick', true]
  ]);
});

test('toolbar actions invoke the native sidebar synchronously on Firefox and Chromium', async () => {
  const calls = [];
  const globals = {
    browser: {sidebarAction: {async toggle() { calls.push('Firefox'); }}},
    chrome: {sidePanel: {async open({windowId}) { calls.push(windowId); }}}
  };
  const onClick = readFunctions('function onActionButtonClick(', 'async function submitPanelSearch(', globals);
  const firefox = onClick({windowId: 7});
  assert.deepEqual(calls, ['Firefox']);
  await firefox;

  delete globals.browser.sidebarAction;
  const chromium = onClick({windowId: 7});
  assert.deepEqual(calls, ['Firefox', 7]);
  await chromium;
});

test('the tab workspace stays in the source window and is reused while opening', async () => {
  const url = `extension://test/${panelPath}?workspace=tab`;
  const calls = [];
  const tabs = [];
  const openWorkspace = readFunctions('async function openSearchWorkspace(', 'function onActionButtonClick(', {
    browser: {
      runtime: {getURL: path => 'extension://test' + path},
      tabs: {
        async query({windowId}) { assert.equal(windowId, 7); return tabs; },
        async update(id, {active}) { calls.push(['activate', id, active]); }
      }
    },
    createTab: async ({url, windowId}) => {
      calls.push(['create', url, windowId]);
      tabs.push({pendingUrl: url, id: 10});
    }
  });

  await openWorkspace({windowId: 7});
  await openWorkspace({windowId: 7});
  assert.deepEqual(calls, [['create', url, 7], ['activate', 10, true]]);
});
