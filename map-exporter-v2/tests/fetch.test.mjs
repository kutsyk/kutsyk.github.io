import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchTile} from '../js/fetch.js';
const originalFetch=globalThis.fetch;
test('Overpass remarks are errors, not successful empty exports',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({remark:'runtime error: timeout',elements:[]}));};
  try{await assert.rejects(fetchTile([0,0,.1,.1],{airports:true},new AbortController().signal),e=>e.splittable&&e.message.includes('timeout'));assert.equal(calls,3);}finally{globalThis.fetch=originalFetch;}
});
test('fallback endpoint can recover from a failed request',async()=>{
  let calls=0;globalThis.fetch=async()=>++calls===1?new Response('',{status:503}):new Response(JSON.stringify({elements:[{type:'way',id:1}]}));
  try{assert.equal((await fetchTile([0,0,.1,.1],{airports:true},new AbortController().signal)).length,1);assert.equal(calls,2);}finally{globalThis.fetch=originalFetch;}
});
test('oversized responses request adaptive subdivision',async()=>{
  globalThis.fetch=async()=>new Response(new Uint8Array(16*1024*1024+1));
  try{await assert.rejects(fetchTile([0,0,.1,.1],{airports:true},new AbortController().signal),e=>e.splittable&&e.message.includes('size limit'));}finally{globalThis.fetch=originalFetch;}
});
test('pre-canceled requests never access the network',async()=>{
  globalThis.fetch=async()=>{throw new Error('unexpected fetch');};
  const controller=new AbortController();controller.abort();
  try{await assert.rejects(fetchTile([0,0,.1,.1],{airports:true},controller.signal),{name:'AbortError'});}finally{globalThis.fetch=originalFetch;}
});
