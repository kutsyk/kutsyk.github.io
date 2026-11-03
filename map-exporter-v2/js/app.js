import {TileJob,initialTiles,validateBounds} from './tiles.js';
import {fetchTile} from './fetch.js';
const $=id=>document.getElementById(id);
const definitions=[
  ['Transport',[['majorRoads','Major roads','#ff8c00',true],['minorRoads','Minor roads','#333333',true],['railways','Train rails','#6f42c1',true],['airports','Airport infrastructure','#607d8b',false]]],
  ['Nature',[['water','Water areas','#4b64e1',true],['waterLines','River / stream centerlines','#4b64e1',false],['parks','Parks and grass','#00aa65',true]]],
  ['Buildings',[['buildings','Buildings','#d44b4b',true]]]
];
let saved={};try{saved=JSON.parse(localStorage.getItem('map-exporter-v2')||'{}');}catch{}
for(const [group,items] of definitions){
  const h=document.createElement('h3');h.textContent=group;$('layers').append(h);
  for(const [key,name,color,checked] of items){
    const row=document.createElement('div');row.className='layer';
    const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.id=`layer-${key}`;check.checked=saved.want?.[key]??checked;
    label.append(check,document.createTextNode(name));
    const picker=document.createElement('input');picker.type='color';picker.id=`color-${key}`;picker.value=saved.colors?.[key]||color;picker.setAttribute('aria-label',`${name} color`);
    row.append(label,picker);$('layers').append(row);
    row.addEventListener('change',()=>{try{localStorage.setItem('map-exporter-v2',JSON.stringify(selections()));}catch{}updateAreaInfo();});
  }
}
function selections(){const want={},colors={};for(const [,items] of definitions)for(const [key]of items){want[key]=$(`layer-${key}`).checked;colors[key]=$(`color-${key}`).value;}return{want,colors};}
let selected=[23.95,49.8,24.1,49.9],map,mapReady=false,job,controller,worker,busy=false,outputURL,snapshot,drawStart,drawing=false;
const message=text=>{$('status').textContent=text;};
function readBounds(){return ['west','south','east','north'].map(id=>Number($(id).value.trim()||NaN));}
function updateAreaInfo(){
  try{
    const tiles=initialTiles(selected),[w,s,e,n]=selected;
    const area=(e-w)*111.32*Math.cos((s+n)/2*Math.PI/180)*(n-s)*111.32;
    $('areaInfo').textContent=`${area.toLocaleString(undefined,{maximumFractionDigits:0})} km² · ${tiles.length} initial sections${tiles.length>16?' · Large area: fewer layers will reduce export size.':''}`;
  }catch(e){$('areaInfo').textContent=e.message;}
}
function setBounds(b){validateBounds(b);initialTiles(b);selected=[...b];['west','south','east','north'].forEach((id,i)=>$(id).value=b[i].toFixed(6));updateAreaInfo();paint();}
function polygon(b){const[w,s,e,n]=b;return{type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]};}
function paint(){
  if(!mapReady)return;
  const features=[{type:'Feature',properties:{status:'selected'},geometry:polygon(selected)}];
  if(job)for(const t of job.tiles)if(t.status!=='split')features.push({type:'Feature',properties:{status:t.status},geometry:polygon(t.bounds)});
  const data={type:'FeatureCollection',features};
  if(map.getSource('selection'))map.getSource('selection').setData(data);
  else{
    map.addSource('selection',{type:'geojson',data});
    map.addLayer({id:'tile-fill',type:'fill',source:'selection',paint:{'fill-color':['match',['get','status'],'done','#279374','failed','#c33b42','loading','#e0a12d','#247c9b'],'fill-opacity':['match',['get','status'],'selected',.04,.18]}});
    map.addLayer({id:'tile-outline',type:'line',source:'selection',paint:{'line-color':['match',['get','status'],'failed','#b92230','done','#23785f','#145e74'],'line-width':['match',['get','status'],'selected',3,1]}});
  }
}
try{
  map=new maplibregl.Map({container:'map',center:[24.025,49.85],zoom:11,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]}});
  map.addControl(new maplibregl.NavigationControl());map.on('load',()=>{mapReady=true;paint();});
  map.on('click',e=>{
    if(!drawing||busy)return;
    if(!drawStart){drawStart=[e.lngLat.lng,e.lngLat.lat];message('Click the opposite corner of your export rectangle.');return;}
    const a=drawStart,b=[e.lngLat.lng,e.lngLat.lat];
    try{setBounds([Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]);message('Area selected. Ready to build SVG.');}catch(error){message(error.message);}
    drawing=false;drawStart=null;map.getCanvas().style.cursor='';$('draw').textContent='Draw rectangle';
  });
}catch(e){message('Map unavailable. You can still enter bounds and export.');$('useView').disabled=true;$('draw').disabled=true;}
$('applyBounds').onclick=()=>{try{setBounds(readBounds());if(map)map.fitBounds([[selected[0],selected[1]],[selected[2],selected[3]]],{padding:30});message('Area selected.');}catch(e){message(e.message);}};
$('useView').onclick=()=>{try{const b=map.getBounds();setBounds([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);message('Current view selected.');}catch(e){message(e.message);}};
$('draw').onclick=()=>{drawing=!drawing;drawStart=null;map.getCanvas().style.cursor=drawing?'crosshair':'';$('draw').textContent=drawing?'Cancel drawing':'Draw rectangle';message(drawing?'Click two opposite corners on the map.':'Drawing canceled.');};
let searchController;
$('searchForm').onsubmit=async e=>{
  e.preventDefault();searchController?.abort();searchController=new AbortController();$('searchResults').replaceChildren();
  try{
    const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent($('search').value)}`,{signal:searchController.signal});
    if(!response.ok)throw new Error(`Search unavailable (HTTP ${response.status})`);
    const results=await response.json();
    if(!results.length)message('No matching places. Try another name.');
    for(const r of results){const b=document.createElement('button');b.textContent=r.display_name;b.onclick=()=>{map?.flyTo({center:[+r.lon,+r.lat],zoom:12});message('Moved to place. Use current view or draw an area to select it.');$('searchResults').replaceChildren();};$('searchResults').append(b);}
  }catch(error){if(error.name!=='AbortError')message(error.message);}
};
function lock(value){
  busy=value;
  for(const el of document.querySelectorAll('aside input,aside button'))el.disabled=value;
  if(!map){$('useView').disabled=true;$('draw').disabled=true;}
  $('cancel').hidden=!value;$('retry').disabled=value;$('partial').disabled=value;$('download').disabled=value||!outputURL;$('downloadTiles').disabled=value||!job?.tiles.some(t=>t.status==='done');
  if(value){drawing=false;drawStart=null;$('draw').textContent='Draw rectangle';if(map)map.getCanvas().style.cursor='';}
}
function renderJob(){
  const active=job.tiles.filter(t=>t.status!=='split'),done=active.filter(t=>t.status==='done').length;
  $('progress').value=active.length?done/active.length*70:0;
  const failed=active.filter(t=>t.status==='failed');
  message(`${done} of ${active.length} sections complete · ${job.features.size.toLocaleString()} unique features\nGreen: complete · Amber: fetching · Red: needs retry. Large sections may split into smaller ones.`);
  $('errors').hidden=!failed.length;$('errorList').replaceChildren();
  for(const t of failed){const li=document.createElement('li');li.textContent=`Section ${t.id}: ${t.error}`;$('errorList').append(li);}
  paint();
}
function clearResult(){if(outputURL)URL.revokeObjectURL(outputURL);outputURL=null;$('download').disabled=true;$('preview').replaceChildren();$('resultInfo').textContent='';$('previewPanel').open=false;}
async function run(retry=false){
  if(busy)return;
  try{
    if(!retry){
      const bounds=readBounds();setBounds(bounds);const {want,colors}=selections();
      if(!Object.values(want).some(Boolean))throw new Error('Select at least one layer.');
      const width=Number($('width').value),height=Number($('height').value);
      if(![width,height].every(n=>Number.isInteger(n)&&n>=512&&n<=8192))throw new Error('Output dimensions must be whole numbers from 512 to 8192.');
      snapshot={want,colors,width,height,clipToFrame:$('clip').checked,bounds:[...bounds]};
      job=new TileJob(bounds,want,fetchTile,renderJob);
    }
    clearResult();lock(true);$('retry').hidden=true;$('partial').hidden=true;
    $('jobTitle').textContent=retry?'Resuming map data':'Fetching map data';
    controller=new AbortController();await job.run(controller.signal,retry);
    if(controller.signal.aborted){$('jobTitle').textContent='Export paused';message('Canceled. Completed sections are retained. Retry unfinished sections to resume.');}
    const unfinished=job.tiles.some(t=>['pending','failed','loading'].includes(t.status));
    $('retry').hidden=!unfinished||job.limited;
    $('partial').hidden=!unfinished||job.features.size===0;
    if(!unfinished&&!controller.signal.aborted)await generate(false);
    else if(job.limited){$('jobTitle').textContent='Area exceeds export limit';message('Reached the 150,000-feature safety limit. Preview the completed sections, or start a new export with a smaller area or fewer layers.');}
    else if(!controller.signal.aborted)$('jobTitle').textContent='Some sections need retry';
  }catch(e){message(e.message);$('jobTitle').textContent='Export needs attention';}
  finally{lock(false);}
}
async function generate(incomplete){
  if(!job.features.size){message('No features found for the selected layers and area.');$('jobTitle').textContent='No map features found';return;}
  $('jobTitle').textContent='Generating SVG';
  worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  try{
    const result=await new Promise((resolve,reject)=>{
      worker.onmessage=({data})=>{
        if(data.error)reject(new Error(data.error));
        else if(data.result)resolve(data.result);
        else if(data.progress){$('progress').value=70+data.progress.percent*.3;message(data.progress.label);}
      };
      worker.onerror=()=>reject(new Error('SVG generation failed. Try fewer layers or a smaller area.'));
      worker.onmessageerror=()=>reject(new Error('Unable to read generated SVG.'));
      worker.cancel=()=>reject(new Error('SVG generation canceled. Fetched data is retained; use Preview again.'));
      worker.postMessage({...snapshot,elements:[...job.features.values()]});
    });
    const blob=new Blob([result.svgStr],{type:'image/svg+xml'});outputURL=URL.createObjectURL(blob);
    $('download').dataset.filename=(incomplete?'INCOMPLETE_':'')+result.fileName;
    // Render generated SVG only; the renderer does not include remote markup or scripts.
    const parsed=new DOMParser().parseFromString(result.svgStr,'image/svg+xml');
    if(parsed.querySelector('parsererror'))throw new Error('Generated SVG is invalid.');
    $('preview').replaceChildren(document.importNode(parsed.documentElement,true));$('previewPanel').open=true;
    $('progress').value=100;$('jobTitle').textContent=incomplete?'Incomplete export ready':'Export ready';
    const completed=job.tiles.filter(t=>t.status==='done').length,total=job.tiles.filter(t=>t.status!=='split').length;
    $('resultInfo').textContent=`${incomplete?'INCOMPLETE · ':''}${completed}/${total} sections · ${job.features.size.toLocaleString()} features · ${(blob.size/1024/1024).toFixed(2)} MB · Bounds ${snapshot.bounds.join(', ')}`;
    message(incomplete?'Missing sections are excluded. The file is labeled INCOMPLETE.':'Your layered SVG is ready to preview and download.');
  }finally{worker.terminate();worker=null;$('partial').hidden=job.features.size===0;$('partial').textContent='Regenerate preview';}
}
$('start').onclick=()=>run();$('retry').onclick=()=>run(true);
$('cancel').onclick=()=>{controller?.abort();worker?.cancel();worker?.terminate();};
$('partial').onclick=async()=>{if(busy)return;lock(true);try{await generate(job.tiles.some(t=>!['done','split'].includes(t.status)));}catch(e){message(e.message);}finally{lock(false);}};
$('download').onclick=()=>{if(!outputURL)return;const a=document.createElement('a');a.href=outputURL;a.download=$('download').dataset.filename;a.click();};
updateAreaInfo();

$('downloadTiles').onclick=async()=>{
  if(busy||!job)return;
  const incomplete=job.tiles.some(t=>!['done','split'].includes(t.status));
  lock(true);worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  try{
    const blob=await new Promise((resolve,reject)=>{
      worker.onmessage=({data})=>{if(data.archive)resolve(data.archive);else if(data.error)reject(new Error(data.error));else if(data.progress)message(data.progress.label);};
      worker.onerror=()=>reject(new Error('Tile archive failed. Try a smaller area.'));
      worker.cancel=()=>reject(new Error('Archive canceled. Fetched data is retained.'));
      worker.postMessage({...snapshot,elements:[...job.features.values()],tiles:job.tiles.filter(t=>t.status==='done'),incomplete});
    });
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${incomplete?'INCOMPLETE_':''}map_tiles.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    message(incomplete?'Downloaded completed sections only. Missing sections are identified in the progress panel; the archive is labeled INCOMPLETE.':'Tile archive downloaded. Each SVG is clipped to its section; manifest.json lists bounds.');
  }catch(e){message(e.message);}finally{worker.terminate();worker=null;lock(false);}
};
