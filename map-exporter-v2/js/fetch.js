import {buildOverpassBBox} from './overpass.js';
import {boundsObject} from './tiles.js';
const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
const pause=(ms,signal)=>new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Canceled','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  if(signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true});
});
export async function fetchTile(bounds,want,signal) {
  let last;
  for(let i=0;i<endpoints.length;i++) {
    if(signal.aborted) throw new DOMException('Canceled','AbortError');
    const controller=new AbortController();
    const abort=()=>controller.abort(); signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await fetch(endpoints[i],{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:buildOverpassBBox(boundsObject(bounds),want)}),signal:controller.signal});
      if(response.status===429) {
        const seconds=Number(response.headers.get('Retry-After'));
        await pause(Number.isFinite(seconds)&&seconds>0?Math.min(seconds,60)*1000:3000*(i+1),signal);
        throw Object.assign(new Error('Map service rate limit; retry after a pause.'),{splittable:false});
      }
      if(!response.ok) throw Object.assign(new Error(`Map service returned HTTP ${response.status}`),{splittable:response.status>=500});
      // Bound each response before parsing, so oversized tiles can be subdivided.
      const reader=response.body.getReader(),chunks=[];let size=0;
      while(true){
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>16*1024*1024){await reader.cancel();throw Object.assign(new Error('Map section exceeds the response size limit'),{splittable:true});}
        chunks.push(value);
      }
      const data=JSON.parse(await new Blob(chunks).text());
      if(data.remark || !Array.isArray(data.elements)) throw Object.assign(new Error(data.remark || 'Invalid map service response'),{splittable:true});
      return data.elements;
    } catch(e) {
      if(signal.aborted) throw new DOMException('Canceled','AbortError');
      last=e;
      if(e.name==='AbortError') last=Object.assign(new Error('Map request timed out'),{splittable:true});
    } finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  throw last;
}
