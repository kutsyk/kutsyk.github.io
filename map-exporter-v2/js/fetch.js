import {buildOverpassBBox} from './overpass.js';
import {boundsObject} from './tiles.js';
const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
const pause=(ms,signal)=>new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Canceled','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  if(signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true});
});
export function retryDelay(header,now=Date.now()) {
  if(header?.trim()) {
    const seconds=Number(header);
    if(Number.isFinite(seconds)&&seconds>=0)return seconds*1000;
    const date=Date.parse(header);
    if(Number.isFinite(date))return Math.max(0,date-now);
  }
  return 60000;
}
// One shared request slot across tiles, retries, and exports. Queued work is cancellable.
function requestLock(){
  let busy=false;const queue=[];
  function next(){const waiter=queue.shift();if(!waiter){busy=false;return;}waiter.signal.removeEventListener('abort',waiter.abort);waiter.resolve(next);}
  return signal=>new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Canceled','AbortError'));return;}
    if(!busy){busy=true;resolve(next);return;}
    const waiter={signal,resolve,abort:()=>{const index=queue.indexOf(waiter);if(index>=0)queue.splice(index,1);reject(new DOMException('Canceled','AbortError'));}};
    queue.push(waiter);signal.addEventListener('abort',waiter.abort,{once:true});
  });
}
export function createTileFetcher({fetchImpl=(...args)=>fetch(...args),now=()=>Date.now(),sleep=pause,minInterval=2000}={}) {
  const states=endpoints.map(url=>({url,until:0,failures:0}));
  const acquire=requestLock();let nextRequest=0;
  const unavailable=()=>{
    const cooling=states.filter(s=>s.until>now());
    const retryAt=cooling.length?Math.min(...cooling.map(s=>s.until)):now();
    return Object.assign(new Error(`Map services are cooling down after rate limits or service failures. Completed sections are saved. Retry in ${Math.max(1,Math.ceil((retryAt-now())/1000))} seconds.`),{unavailable:true,retryAt,splittable:false});
  };
  return async function fetchTile(bounds,want,signal) {
    const release=await acquire(signal);
    try {
      let last,overloaded=false;
      for(const state of states) {
        if(signal.aborted)throw new DOMException('Canceled','AbortError');
        if(state.until>now()){overloaded=true;continue;}
        if(nextRequest>now())await sleep(nextRequest-now(),signal);
        if(signal.aborted)throw new DOMException('Canceled','AbortError');
        const controller=new AbortController(),abort=()=>controller.abort();
        signal.addEventListener('abort',abort,{once:true});
        const timer=setTimeout(abort,45000);
        nextRequest=now()+minInterval;
        const cooldown=delay=>{state.failures++;state.until=now()+Math.max(delay,Math.min(300000,30000*2**(state.failures-1)));overloaded=true;};
        try {
          const response=await fetchImpl(state.url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:buildOverpassBBox(boundsObject(bounds),want)}),signal:controller.signal});
          if(response.status===429 || response.status>=500) {
            cooldown(response.status===429?retryDelay(response.headers.get('Retry-After'),now()):30000);
            await response.body?.cancel();
            throw Object.assign(new Error(`Map service returned HTTP ${response.status}; endpoint temporarily paused.`),{serviceFailure:true,splittable:false});
          }
          if(!response.ok){await response.body?.cancel();throw new Error(`Map service returned HTTP ${response.status}`);}
          const reader=response.body.getReader(),chunks=[];let size=0;
          while(true){
            const {done,value}=await reader.read();if(done)break;
            size+=value.byteLength;
            if(size>16*1024*1024){await reader.cancel();throw Object.assign(new Error('Map section exceeds the response size limit'),{splittable:true});}
            chunks.push(value);
          }
          const data=JSON.parse(await new Blob(chunks).text());
          if(data.remark || !Array.isArray(data.elements)) {
            const remark=data.remark || 'Invalid map service response';
            if(/rate|too many|dispatcher|slots|server.*busy/i.test(remark)){
              cooldown(60000);throw Object.assign(new Error(remark),{serviceFailure:true});
            }
            throw Object.assign(new Error(remark),{splittable:/timeout|timed out|memory|out of memory/i.test(remark)});
          }
          state.until=0;state.failures=0;return data.elements;
        }catch(e){
          if(signal.aborted)throw new DOMException('Canceled','AbortError');
          last=e;
          if(e.name==='AbortError'||e instanceof TypeError){cooldown(30000);last=new Error('Map service timed out or could not be reached.');}
        }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
      }
      if(overloaded)throw unavailable();
      throw last || new Error('No map service is available.');
    }finally{release();}
  };
}
export const fetchTile=createTileFetcher();
