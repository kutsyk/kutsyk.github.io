export const boundsObject = ([west, south, east, north]) => ({
  getWest: () => west, getSouth: () => south, getEast: () => east, getNorth: () => north
});
export function validateBounds(b) {
  if (b.length !== 4 || !b.every(Number.isFinite) || b[0] >= b[2] || b[1] >= b[3]
    || b[0] < -180 || b[2] > 180 || b[1] < -85 || b[3] > 85) {
    throw new Error('Enter west < east and south < north, within ±180° longitude and ±85° latitude. Areas crossing the date line must be exported separately.');
  }
}
export function splitBounds([w,s,e,n]) {
  const x=(w+e)/2, y=(s+n)/2;
  return [[w,s,x,y],[x,s,e,y],[w,y,x,n],[x,y,e,n]];
}
export function initialTiles(bounds, maxSpan=.12) {
  validateBounds(bounds);
  const [w,s,e,n]=bounds;
  const cols=Math.ceil((e-w)/maxSpan), rows=Math.ceil((n-s)/maxSpan);
  if (cols*rows>256) throw new Error('This area needs more than 256 initial tiles. Select a smaller region.');
  return Array.from({length:cols*rows},(_,i)=>{
    const x=i%cols, y=Math.floor(i/cols);
    return {id:String(i),bounds:[w+(e-w)*x/cols,s+(n-s)*y/rows,w+(e-w)*(x+1)/cols,s+(n-s)*(y+1)/rows],depth:0,status:'pending'};
  });
}
export class TileJob {
  constructor(bounds, want, fetchTile, onUpdate=()=>{}) {
    this.bounds=[...bounds]; this.want={...want}; this.tiles=initialTiles(bounds);
    this.fetchTile=fetchTile; this.onUpdate=onUpdate; this.features=new Map();
    this.maxFeatures=150000; this.limited=false;
  }
  async run(signal, retry=false) {
    if(retry) for(const t of this.tiles) if(t.status==='failed') t.status='pending';
    const take=()=>this.tiles.find(t=>t.status==='pending');
    const worker=async()=>{
      while(!signal.aborted && !this.limited) {
        const tile=take(); if(!tile) return;
        tile.status='loading'; this.onUpdate(this);
        try {
          const data=await this.fetchTile(tile.bounds,this.want,signal);
          if(signal.aborted) throw new DOMException('Canceled','AbortError');
          const unique=new Map(data.map(e=>[`${e.type}/${e.id}`,e]));
          const additions=[...unique.keys()].filter(k=>!this.features.has(k)).length;
          if(this.features.size+additions>this.maxFeatures) {
            this.limited=true; throw new Error('Feature limit reached. Select a smaller area or fewer layers.');
          }
          for(const [key,e] of unique) {
            const prev=this.features.get(key);
            if(!prev || JSON.stringify(e).length>JSON.stringify(prev).length) this.features.set(key,e);
          }
          tile.featureKeys=[...unique.keys()];
          tile.status='done'; delete tile.error;
        } catch(e) {
          if(signal.aborted) tile.status='pending';
          else if(e.splittable && tile.depth<3 && this.tiles.length+4<=1024) {
            tile.status='split';
            this.tiles.push(...splitBounds(tile.bounds).map((bounds,i)=>({id:`${tile.id}.${i}`,bounds,depth:tile.depth+1,status:'pending'})));
          } else {tile.status='failed';tile.error=e.message;}
        }
        this.onUpdate(this);
      }
    };
    await Promise.all([worker(),worker()]); this.onUpdate(this);
  }
}
