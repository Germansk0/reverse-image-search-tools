import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('the file-size limit is applied before an oversized file is read',async()=>{
 const source=readFileSync(new URL('../src/utils/app.js',import.meta.url),'utf8');
 const start=source.indexOf('function isFileAccepted('),end=source.indexOf('\nfunction canShare(',start);
 assert.ok(start>=0&&end>start);
 const isFileAccepted=runInNewContext(`(${source.slice(start,end).trim()})`,{console:{log(){}}});
 assert.equal(isFileAccepted({size:300*1024*1024}),true);
 assert.equal(isFileAccepted({size:300*1024*1024+1}),false);
 const a=source.indexOf('async function normalizeImage('),b=source.indexOf('\nasync function normalizeImages(',a);
 const normalize=runInNewContext(`(${source.slice(a,b).trim()})`,{isFileAccepted});
 let read=false;
 const file={size:300*1024*1024+1,slice(){read=true;throw Error('must not read')}};
 assert.equal(await normalize(file),undefined);
 assert.equal(read,false);
});

test('a file with a truncated header leaves the other files usable',async()=>{
 const source=readFileSync(new URL('../src/utils/app.js',import.meta.url),'utf8');
 const start=source.indexOf('async function normalizeImage('),end=source.indexOf('\nasync function processImage(',start);
 assert.ok(start>=0&&end>start);
 const valid={size:5,type:'image/png',slice:()=>1};
 const damaged={size:3,type:'image/png',slice:()=>2};
 const normalize=runInNewContext(`${source.slice(start,end)}\nnormalizeImages`,{
  isFileAccepted:()=>true,
  blobToArray:async value=>value,
  fileTypeFromBuffer:async value=>{if(value===2)throw Error('truncated image');return {mime:'image/png'}},
  isImageMimeType:value=>value==='image/png',
  normalizeImageFileAttributes:file=>file
 });
 assert.deepEqual(Array.from(await normalize([damaged,valid])),[valid]);
});
