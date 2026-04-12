import { predicates } from './overpass.js';

const R = 6378137;
const lon2x = (lon) => (R * lon * Math.PI) / 180;
const lat2y = (lat) => {
  const r = (lat * Math.PI) / 180;
  return R * Math.log(Math.tan(Math.PI / 4 + r / 2));
};

function buildProjectors(bbox, width, height, pad = 24) {
  const west = bbox.getWest();
  const south = bbox.getSouth();
  const east = bbox.getEast();
  const north = bbox.getNorth();

  const minX = Math.min(lon2x(west), lon2x(east));
  const maxX = Math.max(lon2x(west), lon2x(east));
  const minY = Math.min(lat2y(south), lat2y(north));
  const maxY = Math.max(lat2y(south), lat2y(north));

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(innerW / (maxX - minX), innerH / (maxY - minY));
  const tx = (X) => pad + (X - minX) * scale;
  const ty = (Y) => pad + (maxY - Y) * scale;

  return { tx, ty, pad, innerW, innerH, west, south, east, north };
}

function lineString(coords, tx, ty) {
  if (!coords || !coords.length) return '';
  let d = '';
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    const X = tx(lon2x(c.lon));
    const Y = ty(lat2y(c.lat));
    d += i === 0 ? `M${X.toFixed(2)},${Y.toFixed(2)}` : `L${X.toFixed(2)},${Y.toFixed(2)}`;
  }
  return d;
}

function polygonPath(geom, tx, ty) {
  if (!geom || !geom.length) return '';
  const first = geom[0];
  const last = geom[geom.length - 1];
  let d = lineString(geom, tx, ty);
  if (first && last && first.lat === last.lat && first.lon === last.lon) d += 'Z';
  return d;
}

function relationMultipolygonPath(members, tx, ty) {
  if (!members || !members.length) return '';

  const outers = [];
  const inners = [];
  const unknown = [];

  for (const mem of members) {
    if (!mem.geometry || !mem.geometry.length) continue;
    if (mem.role === 'outer') outers.push(mem.geometry);
    else if (mem.role === 'inner') inners.push(mem.geometry);
    else unknown.push(mem.geometry);
  }

  const ordered = [...outers, ...unknown, ...inners];
  return ordered.map((ring) => polygonPath(ring, tx, ty)).filter(Boolean).join(' ');
}

export function buildSVG({ width, height, bbox, elements, want, colors, clipToFrame = false }) {
  const { tx, ty, pad, innerW, innerH, west, south, east, north } = buildProjectors(bbox, width, height, 24);

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', width);
  bg.setAttribute('height', height);
  bg.setAttribute('fill', '#ffffff');
  svg.appendChild(bg);

  if (clipToFrame) {
    const defs = document.createElementNS(SVG_NS, 'defs');
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', 'clip');
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', pad);
    rect.setAttribute('y', pad);
    rect.setAttribute('width', innerW);
    rect.setAttribute('height', innerH);
    clip.appendChild(rect);
    defs.appendChild(clip);
    svg.appendChild(defs);
  }

  const group = () => {
    const g = document.createElementNS(SVG_NS, 'g');
    if (clipToFrame) g.setAttribute('clip-path', 'url(#clip)');
    return g;
  };

  const gParks = group(); gParks.setAttribute('id', 'parks');
  const gWater = group(); gWater.setAttribute('id', 'water');
  const gBldg = group(); gBldg.setAttribute('id', 'buildings');
  const gMotor = group(); gMotor.setAttribute('id', 'motorway');
  const gTrunk = group(); gTrunk.setAttribute('id', 'trunk');
  const gPrim = group(); gPrim.setAttribute('id', 'primary');
  const gSec = group(); gSec.setAttribute('id', 'secondary');
  const gTert = group(); gTert.setAttribute('id', 'tertiary');
  const gLocal = group(); gLocal.setAttribute('id', 'local');

  const parks = want.parks ? elements.filter((e) => predicates.isPark(e.tags)) : [];
  const watersP = want.water ? elements.filter((e) => predicates.isWaterPolygon(e.tags)) : [];
  const watersL = want.water ? elements.filter((e) => predicates.isWaterLine(e.tags)) : [];
  const buildings = want.buildings ? elements.filter((e) => predicates.isBuilding(e.tags)) : [];

  const ways = elements.filter((e) => e.type === 'way' && e.geometry && e.geometry.length >= 2);
  const mtr = want.motorway ? ways.filter((e) => predicates.highwayEq(e.tags, 'motorway')) : [];
  const trk = want.trunk ? ways.filter((e) => predicates.highwayEq(e.tags, 'trunk')) : [];
  const pry = want.primary ? ways.filter((e) => predicates.highwayEq(e.tags, 'primary')) : [];
  const sec = want.secondary ? ways.filter((e) => predicates.highwayEq(e.tags, 'secondary')) : [];
  const ter = want.tertiary ? ways.filter((e) => predicates.highwayEq(e.tags, 'tertiary')) : [];
  const loc = want.local ? ways.filter((e) => predicates.isLocalRoad(e.tags)) : [];

  for (const feat of parks) {
    const p = document.createElementNS(SVG_NS, 'path');
    if (feat.type === 'way' && feat.geometry) {
      p.setAttribute('d', polygonPath(feat.geometry, tx, ty));
    } else if (feat.type === 'relation' && feat.members) {
      const d = relationMultipolygonPath(feat.members, tx, ty);
      if (!d) continue;
      p.setAttribute('d', d);
      p.setAttribute('fill-rule', 'evenodd');
    } else continue;
    p.setAttribute('fill', colors.parks);
    p.setAttribute('stroke', 'none');
    gParks.appendChild(p);
  }

  for (const feat of watersP) {
    const p = document.createElementNS(SVG_NS, 'path');
    if (feat.type === 'way' && feat.geometry) {
      p.setAttribute('d', polygonPath(feat.geometry, tx, ty));
    } else if (feat.type === 'relation' && feat.members) {
      const d = relationMultipolygonPath(feat.members, tx, ty);
      if (!d) continue;
      p.setAttribute('d', d);
      p.setAttribute('fill-rule', 'evenodd');
    } else continue;
    p.setAttribute('fill', colors.water);
    p.setAttribute('stroke', colors.water);
    p.setAttribute('stroke-width', '0.8');
    gWater.appendChild(p);
  }

  for (const feat of watersL) {
    if (feat.type !== 'way' || !feat.geometry) continue;
    const d = lineString(feat.geometry, tx, ty);
    if (!d) continue;
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', colors.water);
    p.setAttribute('stroke-width', '1.2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    gWater.appendChild(p);
  }

  if (want.buildings) {
    for (const feat of buildings) {
      const p = document.createElementNS(SVG_NS, 'path');
      if (feat.type === 'way' && feat.geometry) {
        p.setAttribute('d', polygonPath(feat.geometry, tx, ty));
      } else if (feat.type === 'relation' && feat.members) {
        const d = relationMultipolygonPath(feat.members, tx, ty);
        if (!d) continue;
        p.setAttribute('d', d);
        p.setAttribute('fill-rule', 'evenodd');
      } else continue;
      p.setAttribute('fill', colors.buildings);
      p.setAttribute('stroke', '#fd0000');
      p.setAttribute('stroke-width', '0.4');
      gBldg.appendChild(p);
    }
  }

  const addLine = (collection, g, color, strokeWidth) => {
    for (const feat of collection) {
      const d = lineString(feat.geometry, tx, ty);
      if (!d) continue;
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('stroke-width', strokeWidth);
      g.appendChild(p);
    }
  };

  if (want.parks) svg.appendChild(gParks);
  if (want.water) svg.appendChild(gWater);
  if (want.buildings) svg.appendChild(gBldg);
  if (want.motorway) addLine(mtr, gMotor, colors.motorway, 3.2), svg.appendChild(gMotor);
  if (want.trunk) addLine(trk, gTrunk, colors.trunk, 3.0), svg.appendChild(gTrunk);
  if (want.primary) addLine(pry, gPrim, colors.primary, 2.6), svg.appendChild(gPrim);
  if (want.secondary) addLine(sec, gSec, colors.secondary, 2.2), svg.appendChild(gSec);
  if (want.tertiary) addLine(ter, gTert, colors.tertiary, 2.0), svg.appendChild(gTert);
  if (want.local) addLine(loc, gLocal, colors.local, 1.6), svg.appendChild(gLocal);

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svg);
  const fileName = `map_export_${west.toFixed(4)}_${south.toFixed(4)}_${east.toFixed(4)}_${north.toFixed(4)}_${width}x${height}.svg`
    .replace(/[^\w.\-]+/g, '_');

  return { svgStr, fileName };
}
