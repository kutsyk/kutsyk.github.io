// Small SVG-only DOM adapter lets the existing renderer run off the UI thread.
class Element {
  constructor(tag){this.tag=tag;this.attributes={};this.childNodes=[];}
  setAttribute(k,v){this.attributes[k]=String(v);}
  appendChild(child){this.childNodes.push(child);return child;}
}
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const serialize=e=>`<${e.tag}${Object.entries(e.attributes).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>${e.childNodes.map(serialize).join('')}</${e.tag}>`;
globalThis.document={createElementNS:(_,tag)=>new Element(tag)};
globalThis.XMLSerializer=class {serializeToString(e){return serialize(e);}};
import {zipFiles} from './zip.js';
import {buildSVG} from './svg.js';
import {boundsObject} from './tiles.js';
self.onmessage=({data})=>{
  try {
    if(data.tiles){
      const features=new Map(data.elements.map(e=>[`${e.type}/${e.id}`,e]));
      const files=data.tiles.map((tile,i)=>{
        self.postMessage({progress:{percent:100*i/data.tiles.length,label:`Preparing tile ${i+1} of ${data.tiles.length}`}});
        const result=buildSVG({...data,bbox:boundsObject(tile.bounds),clipToFrame:true,elements:tile.featureKeys.map(k=>features.get(k)).filter(Boolean)});
        return {name:`tile_${tile.id}.svg`,text:result.svgStr};
      });
      files.push({name:'manifest.json',text:JSON.stringify({incomplete:data.incomplete,bounds:data.bounds,tiles:data.tiles.map(({id,bounds})=>({id,bounds})),attribution:'© OpenStreetMap contributors'},null,2)});
      self.postMessage({archive:zipFiles(files)});return;
    }
    const result=buildSVG({...data,bbox:boundsObject(data.bounds),onProgress:p=>self.postMessage({progress:p})});
    self.postMessage({result});
  } catch(e){self.postMessage({error:e.message});}
};
