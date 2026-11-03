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
