import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTileFetcher,retryDelay} from '../js/fetch.js';
import {TileJob} from '../js/tiles.js';
const fetchTile=(...args)=>createTileFetcher({minInterval:0})(...args);
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

test('Retry-After supports seconds and HTTP dates without truncating long waits',()=>{
  assert.equal(retryDelay('120',0),120000);
  assert.equal(retryDelay('Thu, 01 Jan 1970 00:02:00 GMT',0),120000);
  assert.equal(retryDelay(null,0),60000);
});
test('rate-limited endpoints are skipped across tiles until Retry-After expires',async()=>{
  let clock=1000;const calls=[];
  const fetcher=createTileFetcher({minInterval:0,now:()=>clock,fetchImpl:async url=>{
    calls.push(url);
    if(url.includes('overpass-api.de'))return new Response('',{status:429,headers:{'Retry-After':'120'}});
    return new Response(JSON.stringify({elements:[]}));
  }});
  const args=[[0,0,.1,.1],{},new AbortController().signal];
  await fetcher(...args);await fetcher(...args);
  assert.equal(calls.filter(s=>s.includes('overpass-api.de')).length,1);
  clock+=120001;await fetcher(...args);
  assert.equal(calls.filter(s=>s.includes('overpass-api.de')).length,2);
});
test('502 failures pause a large job without multiplying tile requests',async()=>{
  let calls=0;
  const fetcher=createTileFetcher({minInterval:0,fetchImpl:async()=>{calls++;return new Response('',{status:502});}});
  const job=new TileJob([0,0,1,1],{},fetcher);
  await job.run(new AbortController().signal);
  assert.equal(calls,3);assert.ok(job.retryAt>Date.now());
  assert.ok(job.tiles.some(t=>t.status==='pending'));
  assert.ok(job.tiles.every(t=>t.depth===0));
  await job.run(new AbortController().signal,true);
  assert.equal(calls,3,'Immediate retry must respect the shared cooldown');
});
test('queued requests cancel promptly and never overlap',async()=>{
  let finish,started;
  const ready=new Promise(r=>started=r);let active=0,peak=0;
  const fetcher=createTileFetcher({minInterval:0,fetchImpl:async()=>{
    active++;peak=Math.max(peak,active);started();await new Promise(r=>finish=r);active--;
    return new Response(JSON.stringify({elements:[]}));
  }});
  const args=[[0,0,.1,.1],{}];
  const first=fetcher(...args,new AbortController().signal);await ready;
  const controller=new AbortController();const second=fetcher(...args,controller.signal);controller.abort();
  await assert.rejects(second,{name:'AbortError'});finish();await first;assert.equal(peak,1);
});
