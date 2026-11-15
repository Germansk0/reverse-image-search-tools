import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('a lost search response is not replayed automatically',async()=>{
 const source=readFileSync(new URL('../src/utils/app.js',import.meta.url),'utf8');
 const a=source.indexOf('async function sendLargeMessage('),b=source.indexOf('\nasync function processLargeMessage(',a);
 assert.ok(a>=0 && b>a);
 let sends=0;
 const context={getMaxExtensionMessageSize:()=>1024,browser:{runtime:{sendMessage:async()=>{sends++;throw Error('response lost')}}}};
 const send=runInNewContext(`(${source.slice(a,b).trim()})`,context);
 await assert.rejects(()=>send({message:{id:'panelSearchSubmit'},avoidReplay:true}),/response lost/);
 assert.equal(sends,1);
});

test('large searches use chunking before any ordinary send',async()=>{
 const source=readFileSync(new URL('../src/utils/app.js',import.meta.url),'utf8');
 const a=source.indexOf('async function sendLargeMessage('),b=source.indexOf('\nasync function processLargeMessage(',a);
 let connect,listener,resolveSend,sends=0,payload='',header;
 const port={name:'request-id',onMessage:{addListener(fn){listener=fn},removeListener(){}},disconnect(){},postMessage(msg){
   const part=msg.transfer;
   if(part?.type==='connection')queueMicrotask(()=>listener({transfer:{id:'request-id',type:'chunkedMessage'}}));
   if(part?.type==='chunkedMessage' && part.data)payload+=part.data;
   if(part?.type==='chunkedMessage' && part.complete)resolveSend({accepted:true});
 }};
 const context={getMaxExtensionMessageSize:()=>20,uuidv4:()=> 'request-id',self:{setTimeout},
  splitAsciiString:(text,size)=>Array.from({length:Math.ceil(text.length/size)},(_,i)=>text.slice(i*size,(i+1)*size)),
  browser:{runtime:{onConnect:{addListener(fn){connect=fn},removeListener(){}},sendMessage:async msg=>{sends++;header=msg;return new Promise(resolve=>{resolveSend=resolve;connect(port)})}}}
 };
 const send=runInNewContext(`(${source.slice(a,b).trim()})`,context);
 const message={id:'panelSearchSubmit',imageData:'x'.repeat(80)};
 const result=await send({message,avoidReplay:true});
 assert.equal(sends,1);
 assert.equal(header.transfer.transferMessage,true);
 assert.deepEqual(JSON.parse(payload),message);
 assert.equal(result.accepted,true);
});
