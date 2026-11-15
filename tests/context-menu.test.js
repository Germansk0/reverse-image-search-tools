import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../src/background/main.js', import.meta.url), 'utf8');
const extract = (start, end) => {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first);
  return source.slice(first, last).trim();
};

test('right-click menu groups image actions, search all, and ordered engines', async () => {
  let options = {
    engines: ['bing', 'yandex', 'tineye'],
    disabledEngines: ['yandex'],
    searchAllEnginesContextMenu: 'sub',
    viewImageContextMenu: true
  };
  const extensionPattern = 'chrome-extension://fixture/*';
  const context = {
    targetEnv: 'chrome',
    optionKeys: [],
    getPlatform: async () => ({}),
    storage: {get: async () => options},
    getExtensionUrlPattern: () => extensionPattern,
    canShare: () => false,
    getEnabledEngines: async o =>
      o.engines.filter(engine => !o.disabledEngines.includes(engine)),
    getText: key => key,
    getMenuItem: async item => item
  };
  const getMenuItems = runInNewContext(
    `(${extract('async function getMenuItems()', '\nasync function openContentView(')})`,
    context
  );
  const pageItems = items =>
    Array.from(items).filter(item => item.id.endsWith('_1'));
  const pageIds = async () => pageItems(await getMenuItems()).map(item => item.id);
  const menu = await getMenuItems();
  const grouped = [
    'view_1', 'sep_1', 'search_allEngines_1', 'sep_allEngines_1',
    'search_bing_1', 'search_tineye_1'
  ];
  assert.deepEqual(pageItems(menu).map(item => item.id), grouped);
  assert.deepEqual(
    pageItems(menu).filter(item => item.type === 'separator').map(item => item.id),
    ['sep_1', 'sep_allEngines_1']
  );
  const extensionItems = Array.from(menu).filter(item => item.id.endsWith('_2'));
  assert.deepEqual(
    extensionItems.map(item => item.id),
    grouped.map(id => id.replace(/1$/, '2'))
  );
  for (const item of extensionItems) {
    assert.deepEqual(Array.from(item.contexts), ['image']);
    assert.deepEqual(Array.from(item.documentUrlPatterns), [extensionPattern]);
  }

  options.engines = ['tineye', 'yandex', 'bing'];
  assert.deepEqual(await pageIds(), [
    ...grouped.slice(0, 4), 'search_tineye_1', 'search_bing_1'
  ]);
  options.searchAllEnginesContextMenu = 'main';
  assert.deepEqual(await pageIds(), ['view_1', 'sep_1', 'search_allEngines_1']);
  options.searchAllEnginesContextMenu = 'false';
  assert.deepEqual(await pageIds(), ['view_1', 'sep_1', 'search_tineye_1', 'search_bing_1']);

  options.disabledEngines.push('tineye');
  assert.deepEqual(await pageIds(), ['view_1', 'sep_1', 'search_bing_1']);
  options.viewImageContextMenu = false;
  const [onlyEngine] = pageItems(await getMenuItems());
  assert.equal(onlyEngine.id, 'search_bing_1');
  assert.equal(onlyEngine.title, 'mainMenuItemTitle_engine');
  assert.deepEqual(await pageIds(), ['search_bing_1']);

  options.searchAllEnginesContextMenu = 'sub';
  options.disabledEngines = ['yandex'];
  assert.deepEqual(await pageIds(), [
    'search_allEngines_1', 'sep_allEngines_1', 'search_tineye_1', 'search_bing_1'
  ]);
  options.viewImageContextMenu = true;
  options.shareImageContextMenu = true;
  context.canShare = () => true;
  assert.deepEqual((await pageIds()).slice(0, 3), ['view_1', 'share_1', 'sep_1']);
  context.getPlatform = async () => ({isSamsung: true});
  assert.deepEqual(await pageIds(), ['view_1', 'share_1', 'search_tineye_1', 'search_bing_1']);
  context.getPlatform = async () => ({});
  options.disabledEngines = [...options.engines];
  assert.deepEqual(await pageIds(), ['view_1', 'share_1']);
  options.viewImageContextMenu = false;
  options.shareImageContextMenu = false;
  assert.equal((await getMenuItems()).length, 0);
});

test('first install refreshes the menu after default engines are selected', async () => {
  const calls=[];
  let install = true;
  const context={
    targetEnv:'chrome',
    releaseBuild:false,
    setup:async ({event})=>{
      calls.push(`setup:${event}`);
      return {install};
    },
    storage:{get:async()=>({engines:['googleLens','bing','yandex','tineye','baidu']}),set:async value=>calls.push(value)},
    setupUI:async()=>calls.push('refresh'),
    configureExtensionPages:async ({reason})=>calls.push(`pages:${reason}`)
  };
  const onInstall=runInNewContext(`(${extract('async function onInstall(details)', '\nasync function onStartup()')})`,context);
  await onInstall({reason:'install'});
  assert.equal(calls[0],'setup:install');
  assert.deepEqual(Array.from(calls[1].disabledEngines),['baidu']);
  assert.equal(calls[1].viewImageContextMenu,true);
  assert.equal(calls[1].shareImageContextMenu,false);
  assert.equal(calls[1].sidebarEngineSelection.mode,'all');
  assert.equal(calls[1].appTheme,'auto');
  assert.equal(calls[1].searchModeAction,'browse');
  assert.equal(calls[1].tabInBackgound,false);
  assert.equal(calls[1].imgFullParse,true);
  assert.equal(calls[1].detectAltImageDimension,true);
  assert.equal(calls[1].searchAllEnginesContextMenu,'sub');
  assert.equal(calls[2],'refresh');
  assert.equal(calls[3],'pages:install');
  calls.length=0;
  await onInstall({reason:'update'});
  assert.deepEqual(calls,['setup:install','pages:update']);
  calls.length=0;
  install = false;
  await onInstall({reason:'install'});
  assert.deepEqual(calls,['setup:install','pages:update']);
});

test('right-click uses the clicked image directly only when the saved search options allow it', async () => {
  const calls = [];
  const context = {
    targetEnv:'chrome',
    getImageUrlFromContextMenuEvent:info=>info.srcUrl,
    processImageUrl:async (url, options)=>{
      calls.push(options.allowDownload === false ? 'direct' : 'fallback');
      return options.allowDownload === false && context.uploadOnly ? undefined : {imageUrl:url};
    },
    hasModule:async options=>options.module==='base' || context.canInstallParser,
    browser:{tabs:{sendMessage:async () => {
      calls.push('parse');
      if (context.loseReply) throw Error('Page changed');
    }}},
    console:{warn:()=>{}},
    initSearch:async (_session,image)=>calls.push(image.imageUrl),
    showNotification:async ({messageId})=>calls.push(messageId),
    getEnabledEngines:async()=>['bing'],
    createSession:async data=>({...session,engines:[data.engine]})
  };
  context.searchClickTarget = runInNewContext(`(${extract('async function searchClickTarget(', '\nasync function handleParseResults(')})`, context);
  const click = runInNewContext(`${extract('async function onContextMenuItemClick(', '\nasync function openSearchWorkspace(')}\nonContextMenuItemClick`, context);
  const image = 'https://example.com/photo.png?original=1';
  const session = {options:{}, searchMode:'selectUrl'};
  const run = (engine = 'bing') => click({srcUrl:image,menuItemId:`search_${engine}_1`},{id:1,index:0});
  await run();
  assert.deepEqual(calls.splice(0),['direct',image]);
  session.options.detectAltImageDimension = true;
  context.canInstallParser = true;
  await run();
  assert.deepEqual(calls.splice(0),['parse']);
  context.loseReply = true;
  await run();
  assert.deepEqual(calls.splice(0),['parse','error_pageParseError']);
  session.options.detectAltImageDimension = false;
  session.options.imgFullParse = true;
  context.loseReply = false;
  await run();
  assert.deepEqual(calls.splice(0),['parse']);
  session.options.imgFullParse = false;
  context.uploadOnly = true;
  context.canInstallParser = false;
  await run();
  assert.deepEqual(calls.splice(0),['direct','fallback',image]);
  await run('disabled');
  assert.deepEqual(calls.splice(0),['error_searchEngineDisabled']);
});

test('existing welcome and uninstall destinations are preserved without reopening welcome on update',async()=>{
  const calls=[];
  const context={targetEnv:'chrome',browser:{runtime:{setUninstallURL:async url=>calls.push(['uninstall',url])},tabs:{create:async data=>calls.push(['welcome',data.url])}},console};
  const configure=runInNewContext(`(${extract('async function configureExtensionPages(', '\nasync function onInstall(')})`,context);
  await configure({reason:'install'});
  assert.deepEqual(calls,[['uninstall','https://reverse-image-search-tools.tilda.ws/uninstall_feedback'],['welcome','http://reverse-image-search-tools.tilda.ws']]);
  calls.length=0;
  await configure({reason:'update'});
  assert.deepEqual(calls,[['uninstall','https://reverse-image-search-tools.tilda.ws/uninstall_feedback']]);
});

test('panel capture is one-off and only returns a preview for the originating tab', async () => {
  const tab = {id: 7, windowId: 3, active: true, url: 'https://example.com/photo'};
  const panelUrl = 'chrome-extension://fixture/src/sidepanel/index.html';
  const calls = [];
  let activationListener;
  let switchDuringCapture = false;
  const context = {
    browser: {
      runtime: {
        getURL: path => 'chrome-extension://fixture' + path,
        sendMessage: async message => calls.push(['result', message])
      },
      tabs: {
        get: async () => tab,
        sendMessage: async (id, message) => calls.push(['close', id, message]),
        onActivated: {
          addListener(listener) { activationListener = listener; },
          removeListener(listener) {
            assert.equal(listener, activationListener);
            activationListener = undefined;
          }
        }
      }
    },
    openContentView: async (message, view) => {
      calls.push(['open', view, message.session]);
      return true;
    },
    captureImage: async (area, tabId, windowId) => {
      calls.push(['capture', area, tabId, windowId]);
      if (switchDuringCapture) activationListener({windowId, tabId: 99});
      return {imageDataUrl: 'data:image/png;base64,test'};
    },
    registry: {
      addStorageItem: async (image, options) => {
        assert.equal(options.area, 'memory');
        assert.equal(options.receipts.expected, 1);
        calls.push(['store', image]);
        return 'image-id';
      }
    }
  };
  const {startPanelCapture, finishPanelCapture} = runInNewContext(
    extract('async function startPanelCapture(', '\nasync function showContentSelectionPointer(') +
    '\n({startPanelCapture, finishPanelCapture})', context
  );
  const request = {tabId: tab.id, captureRequestId: 'capture-id'};
  assert.equal(await startPanelCapture(request, {url:'https://example.com/'}), false);
  assert.equal(await startPanelCapture(request, {url: panelUrl}), true);
  const session = calls[0][2];
  assert.equal(session.sourceTabId, tab.id);
  assert.equal(session.capturePageUrl, tab.url);
  assert.equal(session.captureRequestId, request.captureRequestId);

  const area = {left: 20, top: 30, width: 40, height: 50};
  calls.length = 0;
  await finishPanelCapture({area, session}, 99);
  assert.equal(calls.length, 0);

  await finishPanelCapture({area, session}, tab.id);
  assert.deepEqual(calls.map(call => call[0]), ['close', 'capture', 'store', 'result']);
  assert.deepEqual(calls[1], ['capture', area, 7, 3]);
  assert.equal(calls[3][1].storageId, 'image-id');
  assert.equal(calls[3][1].captureRequestId, request.captureRequestId);
  assert.equal(activationListener, undefined);

  calls.length = 0;
  switchDuringCapture = true;
  await finishPanelCapture({area, session}, tab.id);
  assert.deepEqual(calls.map(call => call[0]), ['close', 'capture', 'result']);
  assert.equal(calls[2][1].error, true);
  assert.equal(activationListener, undefined);

  calls.length = 0;
  tab.url = 'https://example.com/different-page';
  await finishPanelCapture({area, session}, tab.id);
  assert.deepEqual(calls.map(call => call[0]), ['close', 'result']);
  assert.equal(calls[1][1].error, true);
});
