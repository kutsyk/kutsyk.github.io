import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TileJob,initialTiles,validateBounds} from '../js/tiles.js';
const bounds=[0,0,.1,.1];
test('validates unsafe bounds and caps initial tile counts',()=>{
  for(const b of [[1,0,0,1],[0,-90,1,0],[170,0,-170,1],[0,0,NaN,1]])assert.throws(()=>validateBounds(b));
  assert.throws(()=>initialTiles([-100,0,100,50]),/256/);
  assert.equal(initialTiles(bounds).length,1);
});
test('subdivides timeouts, deduplicates type/id, and limits concurrency',async()=>{
  let calls=0,active=0,peak=0;
  const job=new TileJob(bounds,{airports:true},async()=>{
    active++;peak=Math.max(peak,active);const n=++calls;
    await new Promise(r=>setTimeout(r,2));active--;
    if(n===1)throw Object.assign(new Error('timeout'),{splittable:true});
    return [{type:'way',id:1},{type:'relation',id:1}];
  });
  await job.run(new AbortController().signal);
  assert.equal(calls,5);assert.equal(job.features.size,2);assert.ok(peak<=2);
  assert.equal(job.tiles.filter(t=>t.status==='done').length,4);
});
test('retry only fetches failed sections and retains completed data',async()=>{
  const calls=new Map();let fail=true;
  const job=new TileJob([0,0,.2,.1],{},async b=>{
    const key=b[0];calls.set(key,(calls.get(key)||0)+1);
    if(key>0&&fail)throw new Error('network');
    return [{type:'way',id:key}];
  });
  await job.run(new AbortController().signal);fail=false;
  await job.run(new AbortController().signal,true);
  assert.equal(calls.get(0),1);assert.equal(calls.get(.1),2);assert.equal(job.features.size,2);
});
test('cancellation leaves sections resumable',async()=>{
  const controller=new AbortController();
  const job=new TileJob(bounds,{},async()=>{controller.abort();throw new DOMException('Canceled','AbortError');});
  await job.run(controller.signal);
  assert.equal(job.tiles[0].status,'pending');
});
test('feature safety limit preserves previous completed work',async()=>{
  const job=new TileJob(bounds,{},async()=>[{type:'way',id:1},{type:'way',id:2}]);job.maxFeatures=1;
  await job.run(new AbortController().signal);
  assert.equal(job.features.size,0);assert.equal(job.tiles[0].status,'failed');assert.equal(job.limited,true);
});
test('adaptive strategy separates expensive queries by layer before geographic subdivision',async()=>{
  const calls=[];
  const job=new TileJob(bounds,{buildings:true,airports:true},async(b,w)=>{
    calls.push({b,w});
    if(Object.keys(w).length>1 || (w.buildings && b[2]-b[0]>.05))throw Object.assign(new Error('query memory limit'),{splittable:true});
    return [{type:'way',id:w.airports?1:2}];
  },()=>{},{strategy:'adaptive'});
  await job.run(new AbortController().signal);
  assert.equal(calls.length,7);
  assert.equal(calls.filter(c=>c.w.airports&&!c.w.buildings).length,1);
  assert.equal(job.features.size,2);
  assert.equal(job.tiles.filter(t=>t.status==='done').length,5);
});
test('combined strategy keeps enabled layers together when subdividing',async()=>{
  let first=true;const queries=[];
  const job=new TileJob(bounds,{buildings:true,airports:true},async(b,w)=>{
    queries.push(w);if(first){first=false;throw Object.assign(new Error('memory limit'),{splittable:true});}return [];
  },()=>{},{strategy:'combined'});
  await job.run(new AbortController().signal);
  assert.equal(queries.length,5);assert.ok(queries.every(w=>w.buildings&&w.airports));
});
test('separate-layer strategy retries only the failing layer',async()=>{
  let fail=true;const calls=[];
  const job=new TileJob(bounds,{buildings:true,airports:true,parks:false},async(b,w)=>{
    calls.push(Object.keys(w)[0]);assert.equal(Object.keys(w).length,1);
    if(w.buildings&&fail)throw new Error('unavailable');return [{type:'way',id:w.airports?1:2}];
  },()=>{},{strategy:'layers'});
  await job.run(new AbortController().signal);fail=false;await job.run(new AbortController().signal,true);
  assert.deepEqual(calls.sort(),['airports','buildings','buildings']);assert.equal(job.features.size,2);
});
test('adaptive strategy never splits overload failures into layer queries',async()=>{
  const job=new TileJob(bounds,{buildings:true,airports:true},async()=>{throw Object.assign(new Error('cooldown'),{unavailable:true,retryAt:Date.now()+60000});},()=>{},{strategy:'adaptive'});
  await job.run(new AbortController().signal);assert.equal(job.tiles.length,1);assert.equal(job.tiles[0].status,'failed');
});
