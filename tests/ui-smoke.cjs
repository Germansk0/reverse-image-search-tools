const {chromium}=require(process.env.PLAYWRIGHT_NODE_MODULES ? process.env.PLAYWRIGHT_NODE_MODULES+'/playwright' : 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {version}=require('../package.json');
const msgs=JSON.parse(fs.readFileSync('dist/chrome/_locales/en/messages.json'));
const initial={storageVersion:'20261112000001_remove_lenso',appTheme:'light',engines:['googleLens','bing','yandex','tineye','baidu','pinterest'],disabledEngines:['baidu','pinterest'],showInContextMenu:true,searchAllEnginesContextMenu:'sub',searchAllEnginesAction:'sub',searchModeAction:'browse',autoPasteAction:true,searchModeContextMenu:'selectUrl',yandexHost:'yandex_com',showEngineIcons:true,sidebarEngineSelection:{mode:'all'}};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZ0AAAAASUVORK5CYII=','base64');
(async()=>{const browser=await chromium.launch({executablePath:process.env.RIS_CHROMIUM_PATH || undefined,headless:true,ignoreDefaultArgs:['--hide-scrollbars'],args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:380,height:750}});
await ctx.addInitScript(({msgs,initial,version})=>{
 const data={local:JSON.parse(localStorage.getItem('settings')||'null')||{...initial},session:{storageVersion:'20240514122825_initial_version'},sync:{}};let listeners=[];
 window.__clipboardReads=0;
 document.execCommand=command=>{if(command==='paste') window.__clipboardReads++;return false;};
 const event=()=>({addListener(fn){listeners.push(fn)},removeListener(){}});
 const runtimeEvent=()=>{
  const callbacks=new Set();
  return {addListener(fn){callbacks.add(fn)},removeListener(fn){callbacks.delete(fn)},emit(...args){for(const fn of callbacks)fn(...args)}};
 };
 const panelMessages=runtimeEvent(), connections=runtimeEvent(), tabActivated=runtimeEvent();
 window.__captureResult=message=>panelMessages.emit(message);
 window.__activateTab=info=>tabActivated.emit(info);

 function area(name){return {async get(keys){
 if(Array.isArray(keys) && keys.includes('engines') && localStorage.getItem('test-settings-storage-error')) throw Error('simulated options read failure');
 let d=data[name];if(keys==null)return {...d};if(typeof keys==='string')return {[keys]:d[keys]};if(Array.isArray(keys))return Object.fromEntries(keys.map(k=>[k,d[k]]));return Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,d[k]??v]));},async set(obj){if(name==='local' && obj.sidebarEngineSelection && window.__selectionDelay)await new Promise(resolve=>setTimeout(resolve,window.__selectionDelay));if(window.__failNextSave){window.__failNextSave=false;throw Error('simulated storage failure')};let changes={};for(let [k,v] of Object.entries(obj)){changes[k]={oldValue:data[name][k],newValue:v};data[name][k]=v;}if(name==='local')localStorage.setItem('settings',JSON.stringify(data.local));for(const fn of listeners)fn(changes,name);},async remove(keys){for(const k of [].concat(keys))delete data[name][k];},async clear(){data[name]={};}};}
 const platform={os:'linux',arch:'amd64',targetEnv:'chrome',isChrome:true,isLinux:true,isWindows:false,isMacos:false,isMobile:false,isFirefox:false,isSafari:false,isSamsung:false,isAndroid:false};window.__data=data;window.__messages=[];window.__tabs=[];window.__externalSelection=value=>{const oldValue=data.local.sidebarEngineSelection;data.local.sidebarEngineSelection=value;localStorage.setItem('settings',JSON.stringify(data.local));for(const fn of listeners)fn({sidebarEngineSelection:{oldValue,newValue:value}},'local')};
 const b={runtime:{id:'mock-extension',getURL(p){return new URL(p,location.origin).href},getManifest(){return {version}},async sendMessage(msg){window.__messages.push(msg);if(msg.id==='getPlatform'){
 if(localStorage.getItem('test-startup-error')===location.pathname) throw Error('simulated startup failure');
 return platform;
 }if(msg.id==='getBrowser')return {name:'chrome',version:'153'};if(msg.id==='panelSearchSubmit'){
 if(window.__holdSearch) return new Promise(resolve=>{window.__finishSearch=resolve});
 return window.__searchResult || {accepted:!window.__rejectSearch};
 }
 if(msg.id==='startPanelCapture') return !window.__captureRejected;
 if(msg.id==='storageRequest' && msg.transfer && window.__captureImage){
  if(window.__holdCaptureTransfer) await new Promise(resolve=>{window.__finishCaptureTransfer=resolve});
  const transferId=msg.transfer.transferId;
  const channel=runtimeEvent();
  connections.emit({name:transferId,onMessage:channel,postMessage(){},disconnect(){}});
  channel.emit({transfer:{id:transferId,type:'response',data:window.__captureImage}});
 }
 return true;},onMessage:panelMessages,onConnect:connections},storage:{local:area('local'),session:area('session'),sync:area('sync'),onChanged:event()},i18n:{getMessage(name,subs){let m=msgs[name]?.message||name;let values=[].concat(subs||[]);return m.replace(/\$(\d+)/g,(_,i)=>values[Number(i)-1]||'');},getUILanguage(){return 'en'}},tabs:{onActivated:tabActivated,
 async captureVisibleTab(){return null},
 async query(props){
 window.__activeTabQuery=props;
 if (props.windowId && window.__settingsTabId) return [{id:window.__settingsTabId,url:location.origin+'/src/options/index.html'}];
 return window.__noActiveTab ? [] : [{id:1,index:0,windowId:window.__tabWindow,url:'https://example.com'}];
 },
 async getCurrent(){return {id:1}},
 connect(){return {onMessage:{addListener(fn){window.__deliverConfirm=request=>fn(request,{url:'https://example.com/'})}}}},
 async get(){return {id:1,index:0,url:'https://example.com'}},async create(x){if(window.__failTabCreate)throw Error('simulated tab creation failure');window.__tabs.push(x);return x},async update(id,properties){window.__activeResultTab={id,...properties};return window.__activeResultTab}},permissions:{async contains(){return true},async request(){if(window.__holdClipboard) return new Promise(resolve=>{window.__releaseClipboard=resolve});return !!window.__grantClipboard}},extension:{inIncognitoContext:false}};window.browser=b;window.chrome={runtime:b.runtime};
},{msgs,initial,version});
const page=await ctx.newPage();let errors=[];page.on('pageerror',err=>errors.push(err.message));await page.route('https://example.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:png}));
async function open(path){await page.goto('http://127.0.0.1:8765/'+path);await page.waitForSelector(path.includes('sidepanel') ? '.sidebar-prototype:visible' : '.options-shell:visible');}
const panel='src/sidepanel/index.html', options='src/options/index.html';
await open(panel);
assert.equal(await page.locator('.sidebar-tabs').count(), 0);
assert.equal(await page.locator('#sidebar-image-url').isVisible(), true);
assert.equal(await page.getByRole('button', {name:'Preview link',exact:true}).count(), 0);
assert.equal(await page.getByRole('button', {name:'Choose file', exact:true}).isVisible(), true);
const engineSelector = page.locator('#engine-selector-button');
const urlInput = page.locator('#sidebar-image-url');
const newSearch = page.getByRole('button', {name:'New search', exact:true});

async function pasteLink(url) {
  await urlInput.evaluate((el, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData, bubbles:true, cancelable:true}));
  }, url);
}
const allEngines = page.getByLabel('All enabled engines');
const engineChoice = name => page.getByRole('checkbox', {name, exact:true});
const checkedEngines = page.locator('.engine-choices input:checked');

async function chooseOnlyEngine(name) {
  await engineSelector.click();
  await allEngines.uncheck();
  await engineChoice(name).check();
  await page.keyboard.press('Escape');
}

assert.equal(await page.locator('.theme-light').count(), 1);
assert.equal(await engineSelector.isVisible(), false);
assert.equal(await page.locator('.sidebar-all').count(), 0);
await page.evaluate(() => {
  const read=Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer=async function () {
    Response.prototype.arrayBuffer=read;
    await new Promise(resolve=>{window.__releaseFile=resolve});
    return read.call(this);
  };
});
await page.locator('input[type=file]').setInputFiles({name:'engine-choice.png',mimeType:'image/png',buffer:png});
await page.getByText('Preparing images…',{exact:true}).waitFor();
await page.evaluate(()=>window.__releaseFile());
await engineSelector.waitFor();
assert.match(await engineSelector.innerText(), /Google Lens\s+\+3/);
await engineSelector.click();
assert.equal(await page.getByRole('searchbox').count(), 0);
assert.equal(await engineChoice('Google Lens').evaluate(el=>el === document.activeElement), true);
const choiceBounds = await page.locator('.engine-choices').boundingBox();
const doneBounds = await page.getByRole('button', {name:/Done/}).boundingBox();
assert.ok(doneBounds.y - choiceBounds.y - choiceBounds.height < 12);
await page.getByRole('button', {name:'Manage engines'}).click();
assert.match(await page.evaluate(() => window.__tabs.at(-1).url), /src\/options\/index\.html$/);
const bingChoice = engineChoice('Bing');
const googleChoice = engineChoice('Google Lens');
await bingChoice.focus();
await page.keyboard.press('Space');
assert.equal(await bingChoice.isChecked(), false);
await page.keyboard.press('Space');
assert.equal(await bingChoice.isChecked(), true);
await allEngines.uncheck();
assert.equal(await checkedEngines.count(), 0);
await bingChoice.check();
assert.equal(await checkedEngines.count(), 1);
await allEngines.check();
assert.equal(await checkedEngines.count(), 4);
await page.keyboard.press('Escape');
assert.equal(await page.evaluate(() => document.activeElement.id), 'engine-selector-button');
assert.equal(await page.locator('.sidebar-all').isVisible(), true);
assert.equal(await page.evaluate(() => window.__clipboardReads), 0);

await page.waitForTimeout(150);
await page.evaluate(() => window.__externalSelection({mode:'custom',engines:['bing']}));
await page.getByRole('button', {name:/Search engines Bing/}).waitFor();
await engineSelector.click();
assert.equal(await checkedEngines.count(), 1);
assert.equal(await bingChoice.isChecked(), true);
await page.evaluate(() => window.__externalSelection({mode:'all'}));
await page.waitForTimeout(40);
assert.equal(await checkedEngines.count(), 4);

await page.evaluate(() => window.__selectionDelay = 80);
await googleChoice.uncheck();
await bingChoice.uncheck();
assert.equal(await googleChoice.isChecked(), false);
assert.equal(await bingChoice.isChecked(), false);
await page.waitForTimeout(250);
assert.deepEqual(await page.evaluate(() => window.__data.local.sidebarEngineSelection.engines), ['yandex','tineye']);
assert.equal(await checkedEngines.count(), 2);
await page.evaluate(() => window.__selectionDelay = 0);
await allEngines.check();
await page.waitForTimeout(100);

await page.evaluate(() => window.__selectionDelay = 1000);
await googleChoice.uncheck();
await page.evaluate(() => window.__externalSelection({mode:'custom',engines:['bing']}));
await page.waitForFunction(() => window.__data.local.sidebarEngineSelection.engines?.length === 3);
assert.deepEqual(await page.evaluate(() => window.__data.local.sidebarEngineSelection.engines), ['bing','yandex','tineye']);
assert.equal(await checkedEngines.count(), 3);
await page.evaluate(() => window.__selectionDelay = 0);
await allEngines.check();
await page.waitForTimeout(100);

await page.evaluate(() => window.__failNextSave = true);
await bingChoice.uncheck();
await page.locator('.engine-dialog .selection-save-error').waitFor();
await page.evaluate(() => window.__externalSelection({mode:'custom',engines:['googleLens']}));
await page.waitForTimeout(40);
assert.equal(await checkedEngines.count(), 3);
await page.getByRole('button', {name:'Retry'}).click();
await page.locator('.engine-dialog .selection-save-error').waitFor({state:'hidden'});
assert.deepEqual(await page.evaluate(() => window.__data.local.sidebarEngineSelection.engines), ['googleLens','yandex','tineye']);
await allEngines.check();
await page.keyboard.press('Escape');
await page.evaluate(() => window.browser.storage.local.set({disabledEngines:['bing','yandex','tineye','baidu','pinterest']}));
await page.getByRole('button', {name:/Search engines Google Lens/}).click();
assert.equal(await allEngines.count(), 0);
assert.equal(await googleChoice.evaluate(el => document.activeElement === el), true);
await page.keyboard.press('Escape');
await page.evaluate(() => window.browser.storage.local.set({disabledEngines:['baidu','pinterest']}));
await page.getByRole('button', {name:/Search engines Google Lens \+3/}).waitFor();
await newSearch.click();
await page.evaluate(bytes=>{window.__grantClipboard=true;document.execCommand=()=>{const data=new DataTransfer();for(let i=1;i<=4;i++)data.items.add(new File([new Uint8Array(bytes)],`clip${i}.png`,{type:'image/png'}));window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));return true;};},Array.from(png));await page.getByRole('button',{name:'Paste image or link'}).click();await page.waitForTimeout(100);assert.match(await page.locator('.selection-notice').innerText(),/up to 3 images/i);assert.equal(await page.locator('.sidebar-source:visible .preview-image').count(),0);
const chooserReady=page.waitForEvent('filechooser');await page.getByRole('button', {name:'Choose file',exact:true}).click();const chooser=await chooserReady;await chooser.setFiles({name:'photo.png',mimeType:'image/png',buffer:png});await page.waitForSelector('.sidebar-source:visible .preview-image');assert.match(await page.locator('.preview-image').getAttribute('alt'),/photo.png/);
assert.equal(await page.getByRole('heading',{name:'photo.png',exact:true}).isVisible(),true);assert.equal(await newSearch.isVisible(),true);assert.equal(await urlInput.isVisible(),false);assert.equal(await page.locator('.sidebar-all').isEnabled(),true);assert.match(await page.locator('#sidebar-privacy').innerText(),/up to 4 tabs/i);
await page.locator('input[type=file]').setInputFiles([1,2,3,4].map(i=>({name:`photo${i}.png`,mimeType:'image/png',buffer:png})));await page.waitForTimeout(100);assert.match(await page.locator('.selection-notice').innerText(),/up to 3 images/i);assert.equal(await page.locator('.sidebar-source:visible .preview-image').count(),1);
await page.locator('input[type=file]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('This file claims to be an image but cannot be displayed in a browser.')});await page.waitForSelector('.preview-message');assert.match(await page.locator('.preview-message').innerText(),/still search/);assert.equal(await page.locator('.sidebar-all').isEnabled(),true);
await page.locator('input[type=file]').setInputFiles([1, 2, 3].map(i => ({
  name: `photo${i}.png`, mimeType: 'image/png', buffer: png
})));
await page.waitForSelector('.preview-thumbnails');
assert.equal(await page.locator('.preview-thumbnails button').count(), 3);
assert.equal(await page.locator('.preview-thumbnail[aria-pressed=true]').getAttribute('aria-label'), 'photo1.png');
assert.match(await page.locator('#sidebar-privacy').innerText(), /up to 12 tabs/i);
await page.setViewportSize({width:290,height:420});

async function previewLayout() {
  return page.evaluate(() => {
    const panel = document.querySelector('.sidebar-prototype');
    const frame = document.querySelector('.preview-frame').getBoundingClientRect();
    const privacy = document.querySelector('#sidebar-privacy').getBoundingClientRect();
    const controls = [...document.querySelectorAll('.preview-thumbnails button, .image-link-entry')].filter(el => el.getClientRects().length);
    const selector = document.querySelector('.engine-selector-button');
    return {
      frameSize: [frame.width, frame.height],
      fits: panel.scrollHeight <= panel.clientHeight && document.documentElement.scrollHeight <= innerHeight,
      privacyVisible: privacy.bottom <= innerHeight,
      controlsOutside: controls.every(el => {
        const rect = el.getBoundingClientRect();
        return rect.left >= frame.left && rect.right <= frame.right &&
          (rect.top >= frame.bottom || rect.bottom <= frame.top);
      }),
      engineControlFits: selector.scrollWidth <= selector.clientWidth &&
        selector.getBoundingClientRect().right <= innerWidth
    };
  });
}

const uploadedLayout = await previewLayout();
assert.deepEqual(uploadedLayout, {
  frameSize: [266, uploadedLayout.frameSize[1]], fits:true, privacyVisible:true, controlsOutside:true, engineControlFits:true
});
assert.ok(uploadedLayout.frameSize[1] > 140);
await newSearch.click();
assert.equal(await page.getByRole('button', {name:/Choose file/}).evaluate(el => el === document.activeElement), true);
assert.equal(await page.locator('.sidebar-all').count(), 0);
assert.equal(await page.locator('.sidebar-source').isVisible(), false);
await pasteLink('https://example.com/preview.png');
assert.equal(await urlInput.isVisible(), false);
assert.equal(await page.locator('.sidebar-all').evaluate(el => el === document.activeElement), true);
await page.waitForSelector('.url-preview-image:visible');
assert.deepEqual(await previewLayout(), uploadedLayout);
assert.match(await page.locator('#sidebar-privacy').innerText(), /up to 4 tabs/i);

await page.locator('input[type=file]').setInputFiles([1,2,3,4].map(i => ({
  name:`extra${i}.png`, mimeType:'image/png', buffer:png
})));
await page.getByText('Choose up to 3 images. Your previous selection is unchanged.', {exact:true}).waitFor();
assert.equal(await page.locator('.url-preview-image').getAttribute('src'), 'https://example.com/preview.png');
await pasteLink('https://example.com/other-preview.png');
await page.locator('.selection-notice').waitFor({state:'hidden'});

await page.evaluate(() => window.browser.storage.local.set({disabledEngines:['pinterest']}));
await page.getByRole('button', {name:/Search engines Google Lens \+3/}).waitFor();
assert.equal(await page.getByRole('heading',{name:'example.com',exact:true}).isVisible(),true);
assert.match(await page.locator('.engine-compatibility').innerText(), /Baidu requires a file upload/);
assert.equal(await page.locator('.sidebar-all').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true);
assert.deepEqual(await previewLayout(), uploadedLayout);
await page.evaluate(() => window.browser.storage.local.set({disabledEngines:['baidu','pinterest']}));
await page.locator('.engine-compatibility').waitFor({state:'hidden'});

await page.route('https://example.com/preview-failure.png', route => route.fulfill({
  status: 404, body: 'Missing'
}));
await pasteLink('https://example.com/preview-failure.png');
await page.getByText('Preview unavailable. You can still search this link.', {exact:true}).waitFor();
assert.deepEqual(await previewLayout(), uploadedLayout);
assert.equal(await page.locator('.sidebar-all').isEnabled(), true);
await newSearch.click();
assert.equal(await page.getByRole('button', {name:'Preview link', exact:true}).count(), 0);
assert.equal(await page.locator('#link-hint').count(), 0);
assert.equal(await urlInput.evaluate(el => el === document.activeElement && el.value === ''), true);
assert.equal(await page.locator('.sidebar-all').count(), 0);
assert.equal(await page.locator('.sidebar-source').isVisible(), false);

await page.setViewportSize({width:380,height:750});
await page.locator('input[type=file]').setInputFiles([1, 2, 3].map(i => ({
  name: `photo${i}.png`, mimeType: 'image/png', buffer: png
})));
await page.getByRole('button', {name:'photo2.png', exact:true}).click();
assert.equal(await page.locator('.preview-thumbnail[aria-pressed=true]').getAttribute('aria-label'), 'photo2.png');
assert.equal(await page.getByRole('button', {name:/^Remove image/}).count(), 0);
await newSearch.press('Enter');
assert.equal(await page.locator('.preview-thumbnails').count(), 0);
assert.equal(await urlInput.isVisible(), true);
const newChooser = page.waitForEvent('filechooser');
await page.getByRole('button', {name:'Choose file', exact:true}).click();
await (await newChooser).setFiles({name:'photo.png', mimeType:'image/png', buffer:png});
await page.getByAltText('Preview: photo.png').waitFor();

await page.evaluate(()=>window.browser.storage.local.set({disabledEngines:['pinterest']}));await page.waitForTimeout(80);await page.locator('#engine-selector-button').click();assert.equal(await page.locator('[role=dialog]').count(),1);assert.equal(await page.locator('#engine-search').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.type),'checkbox');await page.keyboard.press('Escape');assert.equal(await page.locator('[role=dialog]').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.id),'engine-selector-button');
await page.evaluate(()=>window.browser.storage.local.set({disabledEngines:[]}));await page.waitForTimeout(100);await page.setViewportSize({width:290,height:420});await page.locator('#engine-selector-button').click();assert.equal(await page.locator('#engine-search').count(),0);assert.equal(await page.locator('.engine-choices label.engine-row').count(),6);assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.engine-choices .engine-name')].every(e=>e.scrollWidth<=e.clientWidth)),true);assert.equal(await page.evaluate(()=>{const d=document.querySelector('.engine-dialog'), c=document.querySelector('.engine-choices');return d.scrollHeight<=d.clientHeight && c.scrollHeight<=c.clientHeight}),true);const pinterestChoice=page.locator('.engine-choices label').filter({hasText:'Pinterest'}).locator('input');await pinterestChoice.focus();await page.keyboard.press('Space');assert.equal(await pinterestChoice.isChecked(),false);await page.getByLabel('All enabled engines').check();await page.evaluate(()=>window.browser.storage.local.set({disabledEngines:['googleLens','bing','yandex','tineye','baidu','pinterest']}));await page.waitForTimeout(100);assert.match(await page.locator('.engine-no-results').innerText(),/No engines enabled/);assert.equal(await allEngines.count(),0);await page.locator('.engine-no-results').getByRole('button',{name:'Open settings'}).click();await page.waitForTimeout(60);assert.match((await page.evaluate(()=>window.__tabs.at(-1).url)),/src\/options\/index\.html$/);await page.evaluate(()=>window.browser.storage.local.set({disabledEngines:[]}));await page.waitForTimeout(100);assert.equal(await page.locator('.engine-choices label.engine-row').count(),6);assert.equal(await page.evaluate(()=>document.activeElement.type),'checkbox');await page.keyboard.press('Escape');assert.equal(await page.locator('[role=dialog]').count(),0);await page.setViewportSize({width:380,height:750});
const thirteenEngines = ['googleLens','bing','yandex','tineye','baidu','sogou','whatanime','saucenao','iqdb','ascii2d','getty','istock','shutterstock'];
const twentyEngines = [...thirteenEngines,'adobestock','depositphotos','pinterest','alamy','qihoo','taobao','auTrademark'];
await page.evaluate(engines => window.browser.storage.local.set({engines, disabledEngines: [], sidebarEngineSelection: {mode:'all'}}), thirteenEngines);
await page.waitForTimeout(100);

async function pickerLayout() {
  return page.evaluate(() => {
    const dialog = document.querySelector('.engine-dialog');
    const choices = document.querySelector('.engine-choices');
    const done = document.querySelector('.dialog-done').getBoundingClientRect();
    return {
      dialogFits: dialog.scrollHeight <= dialog.clientHeight,
      choicesFit: choices.scrollHeight <= choices.clientHeight,
      doneVisible: done.bottom <= innerHeight,
      doneTop: done.top,
      listTop: choices.scrollTop
    };
  });
}

for (const height of [420,500,551,600]) {
  await page.setViewportSize({width:290,height});
  await page.locator('#engine-selector-button').click();
  assert.equal(await page.locator('#engine-search').count(), 0);
  assert.equal(await page.locator('.engine-choices label.engine-row').count(), 13);
  const {dialogFits, choicesFit, doneVisible} = await pickerLayout();
  assert.ok(dialogFits && choicesFit && doneVisible);
  await page.keyboard.press('Escape');
}

await page.locator('#engine-selector-button').click();
await page.setViewportSize({width:290,height:320});
await page.waitForSelector('#engine-search:visible');
assert.equal(await page.locator('.engine-choices input').count(), 13);
assert.equal((await pickerLayout()).choicesFit, false);
await page.keyboard.press('Escape');

await page.setViewportSize({width:290,height:420});
await page.evaluate(engines => window.browser.storage.local.set({engines, disabledEngines: [], sidebarEngineSelection: {mode:'all'}}), twentyEngines);
await page.waitForTimeout(100);
await page.getByRole('button', {name:/Search engines Google Lens \+19/}).click();
const filter = page.getByRole('searchbox', {name:'Filter enabled search engines'});
await filter.waitFor();
const choices = page.locator('.engine-choices');
const checkboxes = choices.getByRole('checkbox');
assert.equal(await checkboxes.count(), 20);
assert.deepEqual((await choices.locator('.engine-name').allTextContents()).slice(0,4), ['Google Lens','Bing','Yandex','TinEye']);
assert.equal(await choices.getByText('Google Lens', {exact:true}).evaluate(el => {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getClientRects().length;
}), 1);
assert.equal(await choices.getByText('Australian Trade Mark Search', {exact:true}).evaluate(el => {
  return getComputedStyle(el).whiteSpace === 'nowrap' &&
    el.closest('label').title === 'Australian Trade Mark Search';
}), true);
const initialPicker = await pickerLayout();
assert.ok(initialPicker.dialogFits && initialPicker.doneVisible && !initialPicker.choicesFit);

await choices.hover();
await page.mouse.wheel(0, 1200);
await page.waitForFunction(() => document.querySelector('.engine-choices').scrollTop > 0);
assert.equal((await pickerLayout()).doneTop, initialPicker.doneTop);

await page.getByRole('button', {name:'Manage engines'}).focus();
await page.keyboard.press('Shift+Tab');
assert.equal(await page.evaluate(() => document.activeElement.classList.contains('dialog-done')), true);
await page.keyboard.press('Shift+Tab');
assert.equal(await checkboxes.last().evaluate(el => document.activeElement === el), true);
await page.keyboard.press('Space');
assert.equal(await checkboxes.last().isChecked(), false);

await filter.fill('tInEyE');
assert.equal(await checkboxes.count(), 1);
assert.match(await choices.innerText(), /TinEye/);
assert.equal((await pickerLayout()).listTop, 0);
assert.equal((await pickerLayout()).doneTop, initialPicker.doneTop);
await filter.clear();
assert.equal(await checkboxes.count(), 20);
assert.equal(await checkboxes.last().isChecked(), false);
await filter.fill('nothing-matches-this'.repeat(40));
assert.match(await page.locator('.engine-no-results').innerText(), /No enabled engines match this filter/);
assert.equal(await choices.evaluate(el=>el.clientWidth === el.scrollWidth),true);
await page.getByRole('button',{name:'Clear filter',exact:true}).click();
assert.equal(await filter.evaluate(el=>el===document.activeElement),true);
assert.equal(await checkboxes.count(),20);
await filter.fill('nothing matches');
await page.keyboard.press('Escape');
assert.equal(await filter.inputValue(),'');
assert.equal(await checkboxes.count(),20);
await filter.fill('TinEye');
await page.getByLabel('All enabled engines').check();
await page.getByLabel('All enabled engines').uncheck();
await checkboxes.check();
await page.getByRole('button', {name:/Done/}).click();
await page.waitForTimeout(150);
assert.match(await page.locator('#engine-selector-button').innerText(), /Bing|TinEye/);
await page.locator('#engine-selector-button').click();
assert.equal(await filter.inputValue(), '');
assert.equal(await checkboxes.count(), 20);
assert.equal(await choices.locator('input:checked').count(), 1);
await page.keyboard.press('Escape');
assert.equal(await page.evaluate(() => document.activeElement.id), 'engine-selector-button');
await page.setViewportSize({width:380,height:750});
await page.evaluate(()=>window.browser.storage.local.set({engines:['googleLens','bing','yandex','tineye','baidu','pinterest'],disabledEngines:['baidu','pinterest']}));await page.waitForTimeout(100);await engineSelector.click();await allEngines.check();await page.keyboard.press('Escape');
await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','https://example.com/pasted.png');window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});await page.waitForTimeout(100);assert.equal(await page.locator('.url-preview-image').getAttribute('src'),'https://example.com/pasted.png');
await page.evaluate(bytes=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(bytes)],'pasted.png',{type:'image/png'}));document.querySelector('#sidebar-image-url').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},Array.from(png));await page.waitForTimeout(100);assert.match(await page.locator('.preview-image').getAttribute('alt'),/pasted.png/);
await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/uri-list','# original image\nhttps://example.com/dragged.png');document.querySelector('.sidebar-prototype').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));});await page.waitForTimeout(80);assert.equal(await page.locator('.url-preview-image').getAttribute('src'),'https://example.com/dragged.png');
await page.evaluate(bytes=>{const data=new DataTransfer();for(let i=1;i<=3;i++)data.items.add(new File([new Uint8Array(bytes)],`dropped${i}.png`,{type:'image/png'}));document.querySelector('.sidebar-prototype').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));data.items.clear();},Array.from(png));await page.waitForSelector('.preview-thumbnails');assert.equal(await page.locator('.preview-thumbnails button').count(),3);
await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','not an image');document.querySelector('.sidebar-prototype').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));});await page.waitForTimeout(80);assert.match(await page.locator('.selection-notice').innerText(),/Could not use that drop/);
await newSearch.click();
await urlInput.press('h');
assert.equal(await urlInput.getAttribute('aria-invalid'),null);
await urlInput.fill('javascript:alert(1)');
const useLink = page.getByRole('button', {name:'Preview link',exact:true});
assert.equal(await useLink.isEnabled(),true);
assert.equal(await urlInput.getAttribute('aria-invalid'),null);
await useLink.click();
assert.equal(await urlInput.getAttribute('aria-invalid'),'true');
assert.equal(await urlInput.evaluate(input=>input===document.activeElement),true);
await urlInput.fill('https://example.com/'+ 'a'.repeat(2100));
await page.getByText('Use an image link with 2,048 characters or fewer.',{exact:true}).waitFor();
assert.equal(await useLink.isEnabled(),true);
assert.equal(await page.locator('.sidebar-all').count(),0);
await urlInput.fill('https://example.com/example.png');
await urlInput.press('Enter');
assert.equal(await page.locator('.sidebar-all').isEnabled(),true);
assert.equal(await page.evaluate(() => window.__messages.some(message => message.id === 'panelSearchSubmit')), false);
await chooseOnlyEngine('Bing');await page.waitForTimeout(100);await page.locator('.sidebar-all').click();await page.waitForTimeout(150);const sent=await page.evaluate(()=>window.__messages.filter(m=>m.id==='panelSearchSubmit').at(-1));assert.deepEqual(sent.selectedEngines,['bing']);assert.equal(sent.imageUrl,'https://example.com/example.png');assert.match(await page.locator('.search-feedback').innerText(),/Search requested/);
await page.evaluate(()=>window.__rejectSearch=true);await page.locator('.sidebar-all').click();await page.waitForTimeout(100);assert.match(await page.locator('.search-feedback').innerText(),/Could not start/);
await open(options);
assert.equal(await page.getByText('Sponsors',{exact:true}).count(), 0);
assert.equal(await page.locator('img[src*="/sponsors/"]').count(), 0);
assert.equal(await page.locator('.settings-card').count(), 3);
assert.equal(await page.locator('.engine-option:visible').count(), 4);
assert.equal(await page.locator('#engine-filter').count(), 0);
assert.equal(await page.locator('[data-engine=baidu]').count(), 0);

const contextCard = page.locator('.section-context-menu');
const menuAdvanced = page.getByText('Advanced menu options', {exact:true});
const openImageOption = contextCard.getByRole('combobox', {name:'Open image'});
assert.equal(await openImageOption.isVisible(), true);
assert.equal(await contextCard.getByRole('combobox', {name:'Image input'}).isVisible(), false);

const advancedPreferences = page.getByText('Advanced settings', {exact:true});
await advancedPreferences.click();
await advancedPreferences.click();

const menuChoices = contextCard.getByRole('combobox', {name:'Menu layout'});
await menuChoices.selectOption('off');
await page.waitForFunction(() => window.__data.local.showInContextMenu === false);
assert.equal(await menuAdvanced.count(), 0);
await menuChoices.focus();
await menuChoices.selectOption('sub');
await page.waitForFunction(() => window.__data.local.searchAllEnginesContextMenu === 'sub' && window.__data.local.showInContextMenu);
assert.equal(await menuAdvanced.isVisible(), true);
assert.equal(await menuChoices.getByRole('option', {name:'First enabled engine'}).count(), 0);
await menuAdvanced.click();
assert.equal(await contextCard.getByRole('combobox',{name:'Image input'}).getByRole('option',{name:'Upload selected image'}).count(),1);
await menuAdvanced.click();
await menuChoices.selectOption('main');
await page.waitForFunction(() => window.__data.local.searchAllEnginesContextMenu === 'main');
await menuChoices.selectOption('sub');
await page.waitForFunction(() => window.__data.local.searchAllEnginesContextMenu === 'sub');
await page.setViewportSize({width:290,height:450});
assert.equal(await menuChoices.evaluate(el=>{
  const style=getComputedStyle(el);
  const context=document.createElement('canvas').getContext('2d');
  context.font=style.font;
  const available=el.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-16;
  return [...el.options].every(option=>context.measureText(option.text).width<=available);
}),true);
await page.setViewportSize({width:380,height:750});
async function dragEngine(fromId,toId,slow=false){const handle=page.locator(`[data-engine="${fromId}"] .drag-handle`), dest=page.locator(`[data-engine="${toId}"]`);await handle.scrollIntoViewIfNeeded();const from=await handle.boundingBox(),to=await dest.boundingBox();const fx=from.x+from.width/2,fy=from.y+from.height/2,tx=to.x+30,ty=to.y+5;await page.mouse.move(fx,fy);await page.mouse.down();if(slow){for(let i=1;i<=8;i++){await page.mouse.move(fx+(tx-fx)*i/8,fy+(ty-fy)*i/8);await page.waitForTimeout(60)}await page.waitForTimeout(250)}else{await page.mouse.move(tx,ty,{steps:8})}await page.mouse.up();await page.waitForTimeout(350)}
await dragEngine('bing','googleLens');assert.deepEqual((await page.evaluate(()=>window.__data.local.engines)).slice(0,2),['bing','googleLens']);assert.match(await page.locator('.save-status').innerText(),/saved/);assert.match(await page.locator('[role=status]').filter({hasText:'moved to position'}).innerText(),/position 1 of 4/);await open(options);assert.deepEqual((await page.evaluate(()=>window.__data.local.engines)).slice(0,2),['bing','googleLens']);
await page.getByRole('button',{name:'Move Bing down'}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(150);assert.deepEqual((await page.evaluate(()=>window.__data.local.engines)).slice(0,2),['googleLens','bing']);
const catalogButton = page.getByRole('button', {name:'Add engines', exact:true});
await catalogButton.click();
assert.equal(await page.evaluate(() => document.activeElement.id), 'engine-filter');
assert.equal(await page.locator('.engine-option:visible').count(), 6);
await page.locator('#engine-filter').fill('long-search'.repeat(40));
await page.getByText('No engines match this filter.',{exact:true}).waitFor();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
await page.getByRole('button',{name:'Clear filter',exact:true}).click();
assert.equal(await page.evaluate(()=>document.activeElement.id),'engine-filter');
await page.locator('#engine-filter').fill('image');await dragEngine('baidu','bing',true);assert.deepEqual(await page.evaluate(()=>window.__data.local.engines),['googleLens','baidu','bing','yandex','tineye','pinterest']);await page.locator('#engine-filter').fill('Bing');assert.equal(await page.locator('.engine-option:visible').count(),1);await page.locator('#engine-filter').clear();
const y=page.locator('.engine-option').filter({hasText:'Yandex'});await y.getByText('Yandex',{exact:true}).click();await page.waitForTimeout(100);assert.equal((await page.evaluate(()=>window.__data.local.disabledEngines)).includes('yandex'),true);assert.match(await page.locator('.engine-help').innerText(),/3 enabled/);
await page.evaluate(()=>window.__failNextSave=true);await y.getByText('Yandex',{exact:true}).click();await page.waitForTimeout(100);assert.match(await page.locator('.save-status').innerText(),/could not/);await page.getByRole('button',{name:'Retry'}).click();await page.waitForTimeout(100);assert.match(await page.locator('.save-status').innerText(),/saved/);
assert.equal(await y.getByRole('checkbox').evaluate(el=>el===document.activeElement),true);
await page.getByRole('button', {name:'Show enabled only'}).click();
assert.equal(await page.locator('#engine-filter').count(), 0);
assert.equal(await page.locator('.engine-option:visible').count(), 4);
const enabledYandex = page.getByRole('checkbox', {name:'Yandex',exact:true});
await enabledYandex.focus();
await page.keyboard.press('Space');
await enabledYandex.waitFor({state:'detached'});
assert.equal(await page.evaluate(() => document.activeElement.closest('.engine-option')?.dataset.engine), 'tineye');
assert.equal(await page.getByText('Yandex disabled.', {exact:true}).isVisible(), true);
await page.getByRole('button', {name:'Undo',exact:true}).click();
await page.waitForFunction(() => !window.__data.local.disabledEngines.includes('yandex'));
assert.equal(await enabledYandex.isChecked(), true);
assert.equal(await enabledYandex.evaluate(el => document.activeElement === el), true);
await catalogButton.click();
await page.getByRole('checkbox', {name:'Yandex',exact:true}).check();
await page.getByRole('button', {name:'Show enabled only'}).click();
assert.equal(await page.locator('.engine-option:visible').count(), 4);
await advancedPreferences.click();
await page.setViewportSize({width:290,height:450});
assert.equal(await page.evaluate(()=>{
  const labels = [...document.querySelectorAll('.advanced-options .vn-switch .v-label')].filter(el=>el.getClientRects().length);
  return labels.length > 0 && labels.every(el=>el.scrollWidth <= el.clientWidth) &&
    document.documentElement.scrollWidth <= document.documentElement.clientWidth;
}),true);
await page.getByRole('combobox',{name:'Keyboard focus when the side panel opens'}).selectOption('url');await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.__data.local.searchModeAction),'url');
await open(panel);assert.equal(await page.evaluate(()=>document.activeElement.id),'sidebar-image-url');await page.setViewportSize({width:290,height:420});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('settings'));s.appTheme='light';s.engines=['bing','baidu'];s.disabledEngines=[];s.searchModeAction='url';s.sidebarEngineSelection={mode:'all'};localStorage.setItem('settings',JSON.stringify(s));});await open(panel);await page.locator('#sidebar-image-url').fill('https://example.com/test.png');await useLink.click();await page.waitForTimeout(100);assert.match(await page.locator('.engine-compatibility').innerText(),/Baidu requires a file upload/);assert.match(await engineSelector.innerText(),/Bing/);
assert.doesNotMatch(await engineSelector.innerText(),/Baidu/);await page.evaluate(()=>window.__searchResult={accepted:true,openedCount:1,failed:[],unsupported:[]});await page.locator('.sidebar-all').click();await page.waitForTimeout(100);assert.match(await page.locator('.search-feedback').innerText(),/Opened 1 search tab/);assert.deepEqual((await page.evaluate(()=>window.__messages.filter(m=>m.id==='panelSearchSubmit').at(-1))).selectedEngines,['bing']);await pasteLink('https://example.com/partial.png');await page.evaluate(()=>window.__searchResult={accepted:true,openedCount:1,failed:['bing'],unsupported:[]});await page.locator('.sidebar-all').click();await page.waitForTimeout(100);assert.match(await page.locator('.search-feedback').innerText(),/Could not confirm Bing/);await chooseOnlyEngine('Baidu');
const linkEngineRecovery = page.getByRole('button', {name:'Search engines Baidu',exact:true});
assert.equal(await page.locator('.sidebar-all').count(), 0);
await linkEngineRecovery.click();
assert.equal(await engineChoice('Baidu').getAttribute('aria-describedby'), 'link-requirement-baidu');
assert.equal(await page.getByText('Upload only', {exact:true}).isVisible(), true);
assert.equal(await page.getByRole('button',{name:'Done · Upload needed',exact:true}).isVisible(),true);
await engineChoice('Bing').check();
assert.equal(await page.getByRole('button',{name:'Done · 1 available',exact:true}).isVisible(),true);
await engineChoice('Bing').uncheck();
await page.keyboard.press('Escape');
const urlModeChooser = page.waitForEvent('filechooser');
await page.getByRole('button', {name:'Upload image', exact:true}).click();
await (await urlModeChooser).setFiles({name:'switch-from-link.png', mimeType:'image/png', buffer:png});
await page.waitForSelector('.sidebar-source:visible .preview-image');
assert.equal(await page.locator('#sidebar-image-url').inputValue(), '');
assert.equal(await urlInput.isVisible(), false);
assert.equal(await page.locator('.sidebar-all').isEnabled(), true);
await page.locator('.sidebar-all').click();
await page.waitForFunction(() => window.__messages.some(message => message.searchModeOverride === 'browse'));
const fileSearch = await page.evaluate(() => window.__messages.find(message => message.searchModeOverride === 'browse'));
assert.deepEqual(fileSearch.selectedEngines, ['baidu']);
assert.equal(fileSearch.images.length, 1);
assert.equal(fileSearch.imageUrl, undefined);
await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('settings'));s.engines=['googleLens','bing','yandex','tineye','baidu'];s.disabledEngines=[];s.searchModeAction='browse';s.sidebarEngineSelection={mode:'all'};localStorage.setItem('settings',JSON.stringify(s));});await page.setViewportSize({width:380,height:750});await open(panel);await page.locator('input[type=file]').setInputFiles([1,2,3].map(i=>({name:`bulk${i}.png`,mimeType:'image/png',buffer:png})));await page.waitForSelector('.preview-thumbnails');await page.locator('.sidebar-all').click();assert.match(await page.locator('.bulk-confirm').innerText(),/Up to 15 tabs/);assert.equal(await page.evaluate(()=>window.__messages.filter(m=>m.id==='panelSearchSubmit').length),0);await page.evaluate(()=>window.__externalSelection({mode:'custom',engines:['bing']}));await page.waitForTimeout(80);assert.equal(await page.locator('.bulk-confirm').count(),0);assert.match(await engineSelector.innerText(), /Bing|TinEye/);await page.evaluate(()=>window.__externalSelection({mode:'all'}));await page.waitForTimeout(80);await page.locator('.sidebar-all').click();assert.match(await page.locator('.bulk-confirm').innerText(),/Up to 15 tabs/);await page.evaluate(()=>window.browser.storage.local.set({disabledEngines:['baidu']}));await page.waitForTimeout(100);assert.equal(await page.locator('.bulk-confirm').count(),0);await page.evaluate(()=>window.browser.storage.local.set({disabledEngines:[]}));await page.waitForTimeout(100);await page.locator('.sidebar-all').click();assert.match(await page.locator('.bulk-confirm').innerText(),/Up to 15 tabs/);await page.keyboard.press('Escape');assert.equal(await page.locator('.bulk-confirm').count(),0);assert.equal(await page.locator('.sidebar-all').evaluate(el => el === document.activeElement),true);await page.locator('.sidebar-all').click();await page.evaluate(() => window.__searchResult = {accepted:true,openedCount:15,grouped:true,failed:[],unsupported:[]});await page.getByRole('button',{name:'Open tabs'}).click();await page.getByText('Opened 15 search tabs in a group.', {exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__messages.filter(m=>m.id==='panelSearchSubmit').length),1);
await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('settings'));s.appTheme='dark';s.disabledEngines=[...s.engines];localStorage.setItem('settings',JSON.stringify(s));});await open(panel);assert.equal(await page.locator('.theme-dark').count(),1);assert.equal(await page.locator('.sidebar-all').count(),0);await page.locator('input[type=file]').setInputFiles({name:'no-engines.png',mimeType:'image/png',buffer:png});await page.getByRole('button', {name:'Enable search engines'}).waitFor();assert.equal(await page.locator('.sidebar-all').count(),0);await page.evaluate(()=>window.browser.storage.local.set({engines:['googleLens','bing','yandex','tineye','baidu','sogou','whatanime','saucenao','iqdb','ascii2d','getty','istock','shutterstock'],disabledEngines:[],sidebarEngineSelection:{mode:'all'}}));await page.waitForTimeout(100);await page.setViewportSize({width:290,height:420});await page.locator('#engine-selector-button').click();assert.equal(await page.locator('.theme-dark .engine-choice-grid label.engine-row').count(),13);assert.equal(await page.evaluate(()=>{const d=document.querySelector('.engine-dialog'),c=document.querySelector('.engine-choices');return d.scrollHeight<=d.clientHeight&&c.scrollHeight<=c.clientHeight}),true);await page.keyboard.press('Escape');await page.setViewportSize({width:320,height:700});await open(options);assert.equal(await page.locator('.settings-theme-dark').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.getByRole('button',{name:'Find engines',exact:true}).isVisible(),true);

// A new user can paste a copied link, search with the suggested engine, and find the result.
await page.evaluate(settings => localStorage.setItem('settings',JSON.stringify({
  ...settings,sidebarEngineSelection:{mode:'recommended'},tabInBackgound:true
})), initial);
await open(panel);
assert.equal(await engineSelector.isVisible(),false);
const pasteButton = page.getByRole('button',{name:'Paste image or link',exact:true});
await page.evaluate(()=>window.__holdClipboard=true);
await pasteButton.click();
await page.getByText('Reading clipboard…',{exact:true}).waitFor();
await page.evaluate(()=>{window.__holdClipboard=false;window.__releaseClipboard(false)});
await page.getByText(/Clipboard access was not granted/).waitFor();
assert.equal(await pasteButton.evaluate(el=>el===document.activeElement),true);
await page.evaluate(() => {
  window.__grantClipboard = true;
  document.execCommand = () => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain','https://example.com/first-image.png?size=large');
    window.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
    return true;
  };
});
await pasteButton.click();
await page.locator('.url-preview-image:visible').waitFor();
assert.match(await engineSelector.innerText(),/Google Lens/);
assert.doesNotMatch(await engineSelector.innerText(),/Bing/);
assert.doesNotMatch(await page.locator('#sidebar-privacy').innerText(),/up to/i);
await page.evaluate(() => window.__searchResult = {accepted:true,openedCount:1,resultTabIds:[41]});
await page.getByRole('button',{name:'Search image',exact:true}).click();
await page.getByText('Opened 1 search tab.', {exact:true}).waitFor();
assert.equal(await newSearch.count(), 1);
assert.equal(await page.locator('#sidebar-privacy').count(), 0);
const firstSearch = await page.evaluate(() => window.__messages.find(message => message.id === 'panelSearchSubmit'));
assert.deepEqual(firstSearch.selectedEngines, ['googleLens']);
assert.equal(firstSearch.imageUrl, 'https://example.com/first-image.png?size=large');

await engineSelector.click();
await bingChoice.check();
await page.keyboard.press('Escape');
await page.evaluate(() => window.__searchResult = {accepted:true,openedCount:2,grouped:true});
await page.getByRole('button', {name:'Search image', exact:true}).click();
await page.getByText('Opened 2 search tabs in a group.', {exact:true}).waitFor();
await engineSelector.click();
await engineChoice('Google Lens').uncheck();
await page.keyboard.press('Escape');
await page.evaluate(() => window.__searchResult = {accepted:false,openedCount:0,failed:['bing']});
await page.getByRole('button', {name:'Search image', exact:true}).click();
await page.getByText(/Could not confirm Bing/).waitFor();
assert.equal(await page.getByRole('button', {name:'Search image', exact:true}).isEnabled(), true);
await engineSelector.click();
await engineChoice('Google Lens').check();
await page.keyboard.press('Escape');
await newSearch.click();
assert.equal(await urlInput.inputValue(), '');
assert.equal(await page.evaluate(() => window.__messages.filter(message => message.id === 'panelSearchSubmit').length), 3);
assert.equal(await newSearch.isVisible(), false);
await pasteLink('https://example.com/replacement.png');

await engineSelector.click();
await allEngines.check();
await allEngines.uncheck();
await page.keyboard.press('Escape');
const chooseEngines = page.getByRole('button', {name:'Choose search engines',exact:true});
assert.equal(await chooseEngines.evaluate(el => document.activeElement === el), true);
assert.equal(await page.locator('.sidebar-all').count(), 0);
await chooseEngines.click();
await bingChoice.check();
await page.keyboard.press('Escape');
assert.equal(await page.getByRole('button', {name:'Search image',exact:true}).isEnabled(), true);

await page.evaluate(() => window.browser.storage.local.set({
  engines:['bing','baidu'], disabledEngines:['bing'], sidebarEngineSelection:{mode:'all'}
}));
const chooseFileInstead = page.getByRole('button', {name:'Upload image',exact:true});
await chooseFileInstead.waitFor();
assert.equal(await page.locator('.sidebar-all').count(), 0);
const recoveryChooser = page.waitForEvent('filechooser');
await chooseFileInstead.click();
await (await recoveryChooser).setFiles({name:'saved-image.png',mimeType:'image/png',buffer:png});
await page.locator('.sidebar-source:visible .preview-image').waitFor();
assert.equal(await page.getByRole('button', {name:'Search image',exact:true}).isEnabled(), true);

await page.evaluate(() => window.browser.storage.local.set({disabledEngines:['bing','baidu']}));
await page.getByRole('button', {name:'Enable search engines',exact:true}).waitFor();
await open(options);
assert.equal(await page.getByRole('searchbox', {name:'Search all engines'}).isVisible(), true);
assert.equal(await page.getByRole('checkbox', {name:'Bing',exact:true}).isVisible(), true);

for (const [path, title] of [[panel, 'the search panel'], [options, 'Settings']]) {
  await page.evaluate(({path,panel}) => {
    if (path === panel) localStorage.setItem('test-startup-error', '/' + path);
    else localStorage.setItem('test-settings-storage-error', '1');
  },{path,panel});
  await page.goto('http://127.0.0.1:8765/' + path);
  await page.getByText(`Couldn’t open ${title}.`, {exact:true}).waitFor();
  await page.evaluate(() => {
    localStorage.removeItem('test-startup-error');
    localStorage.removeItem('test-settings-storage-error');
  });
  await page.getByRole('button', {name:'Reload',exact:true}).click();
  await page.locator('#page-startup').waitFor({state:'hidden'});
}

await page.evaluate(() => window.browser.storage.local.set({
  engines:['bing'], disabledEngines:[], sidebarEngineSelection:{mode:'all'}
}));
await open(panel);
const settingsShortcut = page.getByRole('button', {name:'Settings',exact:true});
await page.evaluate(() => { window.__tabWindow = 8; window.__settingsTabId = 22; });
await settingsShortcut.click();
await page.waitForFunction(() => window.__activeResultTab?.id === 22);
assert.equal(await page.evaluate(() => window.__tabs.length),0);
await page.evaluate(() => { window.__settingsTabId = null; window.__failTabCreate = true; });
await settingsShortcut.click();
await page.getByText('Could not open Settings. Try again.', {exact:true}).waitFor();
await page.evaluate(() => window.__failTabCreate = false);
await settingsShortcut.click();
await page.waitForFunction(() => window.__tabs.length === 1);
assert.equal(await page.evaluate(() => window.__tabs[0].windowId),8);
await page.getByText('Could not open Settings. Try again.', {exact:true}).waitFor({state:'hidden'});
await page.evaluate(bytes => {
  window.__grantClipboard = true;
  document.execCommand = () => {
    const file = new File([new Uint8Array(bytes)], 'items.png', {type:'image/png'});
    const event = new Event('paste', {bubbles:true,cancelable:true});
    Object.defineProperty(event,'clipboardData',{value:{
      files:[], items:[{kind:'file',getAsFile:()=>file}], getData:()=>''
    }});
    window.dispatchEvent(event);
  };
}, Array.from(png));
await page.getByRole('button', {name:'Paste image or link',exact:true}).click();
await page.getByAltText('Preview: items.png').waitFor({state:'attached'});
await page.waitForFunction(() => document.activeElement.classList.contains('sidebar-all'));

await page.locator('.sidebar-prototype').evaluate(el => {
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/uri-list','https://example.com/article');
  dataTransfer.setData('text/html','<a href="https://example.com/article"><img src="https://example.com/linked-image.png"></a>');
  el.dispatchEvent(new DragEvent('drop',{dataTransfer,bubbles:true,cancelable:true}));
});
await page.locator('.url-preview-image:visible').waitFor();
assert.equal(await page.locator('.url-preview-image').getAttribute('src'),'https://example.com/linked-image.png');

await page.evaluate(() => window.__holdSearch = true);
await page.getByRole('button', {name:'Search image',exact:true}).click();
await page.getByRole('button', {name:'Searching…',exact:true}).waitFor();
assert.equal(await page.locator('.search-feedback[role=status]').textContent(),'Searching…');
assert.equal(await page.locator('.sidebar-prototype').evaluate(el=>{
 const transfer=new DataTransfer();
 transfer.setData('text/uri-list','https://example.com/other.png');
 el.dispatchEvent(new DragEvent('dragover',{dataTransfer:transfer,bubbles:true,cancelable:true}));
 return Boolean(el.querySelector('.is-dragging'));
}),false);
assert.equal(await newSearch.isDisabled(),true);
assert.equal(await engineSelector.isDisabled(),true);
await page.waitForFunction(() => typeof window.__finishSearch === 'function');
assert.deepEqual(await page.evaluate(() => window.__activeTabQuery), {active:true,currentWindow:true});
assert.equal(await page.evaluate(() => window.__messages.at(-1).sourceTabId),1);
await page.evaluate(() => {
  window.__holdSearch = false;
  window.__finishSearch({accepted:true,openedCount:1});
});
await page.getByText('Opened 1 search tab.', {exact:true}).waitFor();
assert.equal(await newSearch.isEnabled(),true);

await newSearch.click();
const captureButton = page.getByRole('button',{name:'Capture area',exact:true});
await captureButton.click();
await page.getByText('Drag a box on the page, then click Use capture.',{exact:true}).waitFor();
assert.equal(await page.getByRole('button',{name:'Choose file',exact:true}).isVisible(),false);
const firstCapture = await page.evaluate(()=>window.__messages.find(message=>message.id==='startPanelCapture'));
assert.equal(firstCapture.tabId,1);
await page.keyboard.press('Escape');
await captureButton.waitFor();
assert.equal(await captureButton.evaluate(el=>el===document.activeElement),true);
assert.equal(await page.evaluate(()=>window.__messages.some(message=>message.id==='cancelPanelCapture')),true);

await page.evaluate(()=>window.__captureRejected=true);
await captureButton.click();
await page.getByText('Capture is unavailable on this page. Try a regular webpage.',{exact:true}).waitFor();
await page.evaluate(()=>{window.__captureRejected=false;window.__tabWindow=9});
await captureButton.click();
await page.getByText('Drag a box on the page, then click Use capture.',{exact:true}).waitFor();
await page.evaluate(()=>window.__activateTab({tabId:44,windowId:9}));
await page.getByText('The active tab changed. Start a new capture on the page you want.',{exact:true}).waitFor();

const originalSearchCount = await page.evaluate(()=>window.__messages.filter(m=>m.id==='panelSearchSubmit').length);
await captureButton.click();
await page.getByText('Drag a box on the page, then click Use capture.',{exact:true}).waitFor();
await page.evaluate(({oldId,imageDataUrl})=>{
 window.__captureImage={imageDataUrl};
 window.__captureResult({id:'panelCaptureResult',captureRequestId:oldId,storageId:'obsolete'});
},{oldId:firstCapture.captureRequestId,imageDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAICAIAAABChommAAAAFUlEQVR4nGN0SlrCQAgwEVQx7BUBAILFAVh6Q5oxAAAAAElFTkSuQmCC'});
assert.equal(await page.getByText('Drag a box on the page, then click Use capture.',{exact:true}).isVisible(),true);
await page.evaluate(()=>{
 const request=window.__messages.findLast(message=>message.id==='startPanelCapture');
 window.__holdCaptureTransfer=true;
 window.__captureResult({id:'panelCaptureResult',captureRequestId:request.captureRequestId,storageId:'fresh'});
});
await page.getByText('Preparing capture…',{exact:true}).waitFor();
await page.evaluate(()=>window.__finishCaptureTransfer());
await page.getByRole('heading',{name:'Page capture.png',exact:true}).waitFor();
await page.getByAltText('Preview: Page capture.png').waitFor();
await page.waitForFunction(()=>document.querySelector('img[alt="Preview: Page capture.png"]')?.naturalWidth===12);
assert.equal(await page.evaluate(()=>window.__messages.filter(m=>m.id==='panelSearchSubmit').length),originalSearchCount);
await page.getByRole('button',{name:'Search image',exact:true}).click();
await page.waitForFunction(count=>window.__messages.filter(m=>m.id==='panelSearchSubmit').length>count,originalSearchCount);
assert.equal(await page.evaluate(()=>window.__messages.findLast(m=>m.id==='panelSearchSubmit').images[0].imageFilename),'Page capture.png');
assert.equal(await page.evaluate(()=>window.__data.local.searchModeContextMenu),'selectUrl');

await page.goto('http://127.0.0.1:8765/src/confirm/index.html');
await page.waitForFunction(() => typeof window.__deliverConfirm === 'function');
await page.evaluate(() => window.__deliverConfirm({
  id:'openView',
  session:{sessionType:'search',options:{}},
  images:['one','two'].map(name=>({
    imageUrl:`https://example.com/${name}.png`,
    imageFilename:name === 'one' ? '' : `${name}.png`,
    imageType:'image/png'
  }))
}));
await page.getByRole('dialog', {name:'Select an image'}).waitFor();
assert.equal(await page.getByRole('button',{name:'Select image 1',exact:true}).isVisible(),true);
const imageChoice = page.getByRole('button', {name:/two\.png/});
assert.equal(await page.locator('.image-dimension-icon').count(),0);
await imageChoice.focus();
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__messages.some(message => message.id === 'imageConfirmationSubmit'));
assert.equal(await page.evaluate(() => window.__messages.filter(m=>m.id==='imageConfirmationSubmit').length),1);

assert.deepEqual(errors,[]);console.log('PASS: startup and settings recovery, linked-image drag, clipboard items, pending search protection, current-window search, keyboard confirmation, first-use paste link, single-provider default, fresh search and failure recovery, new search resets the source, named engine summary, unified file and link entry, clickable upload, unavailable-preview recovery, keyboard batch reset, keyboard and button paste, web-image and multi-file drops, URL compatibility and launch, large-search confirmation, compact non-scrolling layout, single engine entry, settings discovery, flat engine picker with confined scrolling and filtering, cross-window selection updates, rapid changes and save retry, compact keyboard dialog, failure feedback, normal and filtered mouse dragging with persistence, keyboard reordering, engine toggles, save retry, persisted default, dark theme, empty state and narrow layout');await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
