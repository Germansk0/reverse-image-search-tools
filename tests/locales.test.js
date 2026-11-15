import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';

const root=new URL('../src/assets/locales/',import.meta.url);
test('preserves the previous release locale files and current search labels',()=>{
 const dirs=readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name);
 assert.equal(dirs.length,52);
 const en=JSON.parse(readFileSync(new URL('en/messages.json',root),'utf8'));
 const keys=['engineName_googleLens','menuItemTitle_googleLens','optionValue_searchAllEnginesContextMenu_main','optionValue_searchAllEnginesContextMenu_sub','optionValue_searchAllEnginesContextMenu_false'];
 for(const locale of dirs){
  const data=JSON.parse(readFileSync(new URL(`${locale}/messages.json`,root),'utf8'));
  assert.ok(data.extensionName?.message,`${locale} lacks extension name`);
  for(const key of keys)assert.equal(data[key]?.message,en[key].message,`${locale}: ${key} differs`);
 }
});
