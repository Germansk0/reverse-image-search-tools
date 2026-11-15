import test from 'node:test';
import assert from 'node:assert/strict';
import {getDroppedWebUrl} from '../src/sidepanel/dropInput.js';
const transfer=values=>({getData:type=>values[type]||''});

test('uses a web image address from the browser drag payload',()=>{
 assert.equal(getDroppedWebUrl(transfer({'text/uri-list':'# source\nhttps://example.com/photo.png\n','text/plain':'ignored'})),'https://example.com/photo.png');
 assert.equal(getDroppedWebUrl(transfer({'text/plain':'  https://example.com/image.jpg  '})),'https://example.com/image.jpg');
});
test('rejects non-web addresses and malformed drag payloads',()=>{
 assert.equal(getDroppedWebUrl(transfer({'text/uri-list':'file:///tmp/photo.png','text/plain':'blob:123'})),'');
 assert.equal(getDroppedWebUrl(transfer({'text/plain':'read this https://example.com'})),'');
 assert.equal(getDroppedWebUrl(null),'');
 assert.equal(getDroppedWebUrl({getData(){throw Error('unavailable')}}),'');
});
