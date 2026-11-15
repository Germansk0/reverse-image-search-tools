import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../src/background/main.js',import.meta.url),'utf8');
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0 && b>a);return source.slice(a,b).trim();}

test('one failing engine does not prevent others and the panel owns inline feedback',async()=>{
 const attempts=[];
 const notifications=[];
 const context={targetEnv:'chrome',checkSearchEngineAccess:()=>{},browser:{tabs:{get:async()=>({index:0})}},getSupportedEngines:async(_image,engines)=>engines.filter(e=>e!=='unsupported'),
  showNotification:async notification=>notifications.push(notification),getSearches:async(_image,engines)=>engines.map(engine=>({engine,isAltImage:false,sendsReceipt:false})),
  isIndexedDbSupported:()=>false,isAndroid:async()=>false,
  searchEngine:async(_session,search)=>{attempts.push(search.engine);if(search.engine==='broken')throw Error('simulated failure')},
  console:{error:()=>{},warn:()=>{}}
 };
 context.searchImage=runInNewContext(`(${extract('async function searchImage(', '\nasync function searchEngine(')})`,context);
 const init=runInNewContext(`(${extract('async function initSearch(', '\nasync function searchImage(')})`,context);
 const result=await init({sourceTabId:1,engines:['working','broken','unsupported'],options:{},inlineFeedback:true},[{imageDataUrl:'one'},{imageDataUrl:'two'}]);
 assert.equal(result.openedCount,2);
 assert.deepEqual(Array.from(result.failed),['broken','broken']);
 assert.deepEqual(Array.from(result.unsupported),['unsupported','unsupported']);
 assert.deepEqual(attempts,['working','broken','working','broken']);
 assert.deepEqual(notifications,[]);
 await init({sourceTabId:1,engines:['broken','unsupported'],options:{}},{imageDataUrl:'one'});
 assert.deepEqual(notifications.map(item=>item.messageId),['error_invalidSearchMethod','error_internalError']);
});

test('groups successful Chrome side-panel results from one search and keeps results when grouping fails', async () => {
  const attempts = [];
  const resultTabs = [{id:2,windowId:9}, {id:3,windowId:9}];
  const context = {
    targetEnv:'chrome',
    checkSearchEngineAccess:() => {},
    browser:{tabs:{
      get:async () => ({index:0,windowId:9}),
      group:async options => { attempts.push(options); }
    }},
    searchImage:async session => {
      assert.equal(session.sourceWindowId,9);
      return {openedCount:2, failed:['failed'], unsupported:[], tabs:resultTabs};
    },
    console:{warn:() => {}}
  };
  const init = runInNewContext(`(${extract('async function initSearch(', '\nasync function searchImage(')})`, context);
  const run = () => init({sourceTabId:1}, {imageUrl:'https://example.com/image.png'});

  const result = await run();
  assert.equal(result.grouped, true);
  assert.deepEqual(Array.from(result.resultTabIds), [2,3]);
  assert.deepEqual(Array.from(attempts[0].tabIds), [2,3]);
  assert.equal(attempts[0].createProperties.windowId, 9);
  assert.deepEqual(Array.from(result.failed), ['failed']);

  resultTabs[1].windowId = 10;
  assert.equal((await run()).grouped, undefined);
  assert.equal(attempts.length, 1);

  resultTabs[1].windowId = 9;
  context.browser.tabs.group = async () => { throw Error('A result tab closed'); };
  const fallback = await run();
  assert.equal(fallback.grouped, undefined);
  assert.equal(fallback.openedCount, 2);
  assert.deepEqual(Array.from(fallback.resultTabIds), [2,3]);
  assert.deepEqual(Array.from(fallback.failed), ['failed']);
});

test('failed conversion reports only affected engines and still runs the others',async()=>{
 for (const conversion of [async()=>undefined, async()=>{throw Error('decode error')}]) {
  const attempts=[];
  const context={getSupportedEngines:async(_image,engines)=>engines,
   getSearches:async()=>[{engine:'needs-conversion',isAltImage:true,sendsReceipt:true},{engine:'compatible',isAltImage:false,sendsReceipt:false}],
   convertProcessedImage:conversion,isIndexedDbSupported:()=>false,isAndroid:async()=>false,showNotification:async()=>{},
   registry:{addStorageItem:async()=>{throw Error('unexpected storage call')}},
   searchEngine:async(_session,search)=>attempts.push(search.engine),console:{error:()=>{},warn:()=>{}}
  };
  const search=runInNewContext(`(${extract('async function searchImage(', '\nasync function searchEngine(')})`,context);
  const result=await search({engines:['needs-conversion','compatible'],options:{},inlineFeedback:true,sourceTabIndex:0},{imageDataUrl:'x'});
  assert.equal(result.openedCount,1);
  assert.deepEqual(Array.from(result.failed),['needs-conversion']);
  assert.deepEqual(attempts,['compatible']);
 }
});

test('successful conversion is passed only to engines that need it',async()=>{
 const attempts=[];
 const original={imageDataUrl:'original'},converted={imageDataUrl:'converted'};
 const context={getSupportedEngines:async(_image,engines)=>engines,
  getSearches:async()=>[{engine:'needs-conversion',isAltImage:true,sendsReceipt:true},{engine:'compatible',isAltImage:false,sendsReceipt:true}],
  convertProcessedImage:async()=>converted,isIndexedDbSupported:()=>false,isAndroid:async()=>false,showNotification:async()=>{},
  registry:{addStorageItem:async image=>image===converted?'converted-id':'original-id'},
  searchEngine:async(_session,search,image,id)=>attempts.push([search.engine,image.imageDataUrl,id]),console:{error:()=>{},warn:()=>{}}
 };
 const search=runInNewContext(`(${extract('async function searchImage(', '\nasync function searchEngine(')})`,context);
 const result=await search({engines:['needs-conversion','compatible'],options:{},inlineFeedback:true,sourceTabIndex:0},original);
 assert.equal(result.openedCount,2);
 assert.deepEqual(Array.from(result.failed),[]);
 assert.deepEqual(attempts,[['needs-conversion','converted','converted-id'],['compatible','original','original-id']]);
});

test('storage failure does not block an engine that does not need stored image data',async()=>{
 const attempts=[];
 const context={getSupportedEngines:async(_image,engines)=>engines,
  getSearches:async()=>[{engine:'needs-storage',isAltImage:false,sendsReceipt:true},{engine:'direct',isAltImage:false,sendsReceipt:false}],
  isIndexedDbSupported:()=>false,isAndroid:async()=>false,showNotification:async()=>{},registry:{addStorageItem:async()=>{throw Error('storage full')}},
  searchEngine:async(_session,search)=>attempts.push(search.engine),console:{error:()=>{},warn:()=>{}}
 };
 const search=runInNewContext(`(${extract('async function searchImage(', '\nasync function searchEngine(')})`,context);
 const result=await search({engines:['needs-storage','direct'],options:{},inlineFeedback:true,sourceTabIndex:0},{imageDataUrl:'x'});
 assert.equal(result.openedCount,1);
 assert.deepEqual(Array.from(result.failed),['needs-storage']);
 assert.deepEqual(attempts,['direct']);
});

test('Chrome creates result tabs in the source window', async () => {
  let created;
  const context = {
    targetEnv:'chrome',
    uuidv4:()=> 'token',
    getTabUrl:async()=> 'https://example.com/result',
    getRequiredUserAgent:async()=>undefined,
    registry:{addStorageItem:async()=>{}},
    createTab:async props=>{created=props;return {id:2,windowId:9}}
  };
  const run = runInNewContext(`(${extract('async function searchEngine(', '\nasync function setupTab(')})`,context);
  const tab = await run({sourceWindowId:9,sourceTabIndex:4,inlineFeedback:true},{engine:'bing'},{},undefined,false);
  assert.equal(created.windowId,9);
  assert.equal(created.index,4);
  assert.equal(created.active,false);
  assert.equal(tab.id,2);
});
