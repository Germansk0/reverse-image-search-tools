import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('custom sidebar selection launches only enabled engines in one search session', async () => {
  const source = readFileSync(new URL('../src/background/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function submitPanelSearch(');
  const end = source.indexOf('\nasync function initShare()', start);
  assert.ok(start >= 0 && end > start);
  let launched, lastFocusedLookups = 0;
  const context = {
    getActiveTab:async () => {
      lastFocusedLookups++;
      return {id:1,index:0,url:'https://example.com'};
    },
    browser:{tabs:{get:async id => ({id,index:3,windowId:5})}},
    createSession:async data => ({...data,engines:[],options:{}}),
    getEnabledEngines:async () => ['google','bing','tineye'],
    initSearch:async (session,images) => {launched = {session,images};return {openedCount:2,failed:[],unsupported:[]}}
  };
  const call=runInNewContext(`(${source.slice(start,end).trim()})`,context);
  const success = await call({images:[{name:'photo'}],searchModeOverride:'browse',selectedEngines:['google','tineye','google','disabled'],sourceTabId:42});
  assert.equal(success.accepted,true);
  assert.equal(success.openedCount,2);
  assert.deepEqual(Array.from(launched.session.engines),['google','tineye']);
  assert.equal(launched.images.length,1);
  assert.equal(launched.session.sourceTabId,42);
  assert.equal(launched.session.sourceTabIndex,3);
  assert.equal(lastFocusedLookups,0);
  launched=undefined;
  const unavailable = await call({images:[{name:'photo'}],searchModeOverride:'browse',selectedEngines:['disabled']});
  assert.equal(unavailable.accepted,false);
  assert.equal(unavailable.openedCount,0);
  assert.equal(launched,undefined);
  assert.equal(lastFocusedLookups,1);
});
