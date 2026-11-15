import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('clipboard reader can detect more than three files without changing its default',async()=>{
 const source=readFileSync(new URL('../src/utils/app.js',import.meta.url),'utf8');
 const a=source.indexOf('function getClipboardFiles('),b=source.indexOf('\nasync function getImagesFromClipboard(',a);assert.ok(a>=0&&b>a);
 let listener;
 const window={setTimeout,clearTimeout,addEventListener(_event,fn){listener=fn},removeEventListener(){listener=null}};
 let textReads = 0;
 const document={execCommand(){listener({preventDefault(){},stopImmediatePropagation(){},clipboardData:{files:[1,2,3,4],getData(){textReads++;return ' https://example.com/image.png '}}})}};
 const {getFilesFromClipboard, getClipboardContent} = runInNewContext(`${source.slice(a,b)}\n({getFilesFromClipboard, getClipboardContent})`,{window,document});
 assert.equal((await getFilesFromClipboard()).length,3);
 assert.equal((await getFilesFromClipboard({maxFiles:4})).length,4);
 assert.equal(textReads,0);
 const content = await getClipboardContent({maxFiles:4,includeText:true});
 assert.equal(content.files.length,4);
 assert.equal(content.text,'https://example.com/image.png');
 assert.equal(textReads,1);
 document.execCommand=()=>listener({
  preventDefault(){},stopImmediatePropagation(){},
  clipboardData:{files:[],items:[{kind:'string'},{kind:'file',getAsFile:()=>null},{kind:'file',getAsFile:()=>5}]}
 });
 assert.deepEqual(Array.from(await getFilesFromClipboard()),[5]);
 document.execCommand=()=>{throw Error('paste unavailable')};
 await assert.rejects(getClipboardContent(),/paste unavailable/);
 assert.equal(listener,null);
});
