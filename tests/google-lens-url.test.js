import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('Google Lens keeps the complete image URL when local Google is disabled',async()=>{
 const source=readFileSync(new URL('../src/background/main.js',import.meta.url),'utf8');
 const a=source.indexOf('async function getTabUrl('),b=source.indexOf('\nasync function initSearch(',a);assert.ok(a>=0&&b>a);
 const context={engines:{googleLens:{url:{target:'https://lens.google.com/upload?url={imgUrl}'},image:{target:'https://www.google.com/webhp'}}},encodeURIComponent};
 const getTabUrl=runInNewContext(`(${source.slice(a,b).trim()})`,context);
 const imageUrl='https://example.com/photo.png?token=a%2Fb&size=large';
 const url=new URL(await getTabUrl({options:{localGoogle:false}},{engine:'googleLens',assetType:'url'},{imageUrl}));
 assert.equal(url.searchParams.get('url'),imageUrl);
 assert.equal(url.searchParams.get('gws_rd'),'cr');
 assert.equal(url.searchParams.get('gl'),'US');
 const upload=new URL(await getTabUrl({options:{localGoogle:false}},{engine:'googleLens',assetType:'image'},{}));
 assert.equal(upload.searchParams.get('gws_rd'),'cr');
});
