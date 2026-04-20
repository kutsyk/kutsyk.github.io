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

export function buildSVG({
  width,
  height,
  bbox,
  elements,
  want,
  colors,
  roadSubTypeColors = {},
  clipToFrame = false,
  onProgress = null,
  cancelSignal = null
}) {
  const progress = (percent, label) => {
    if (onProgress) onProgress({ percent, label });
  };
  const ensureNotCanceled = () => {
    if (cancelSignal && cancelSignal.aborted) throw new Error('Export was canceled');
  };

  const { tx, ty, pad, innerW, innerH, west, south, east, north } = buildProjectors(bbox, width, height, 24);
  progress(30, 'Preparing SVG canvas');

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
  const gMajorRoads = group(); gMajorRoads.setAttribute('id', 'major_roads');
  const gMinorRoads = group(); gMinorRoads.setAttribute('id', 'minor_roads');

  const parks = want.parks ? elements.filter((e) => predicates.isPark(e.tags)) : [];
  const watersP = want.water ? elements.filter((e) => predicates.isWaterPolygon(e.tags)) : [];
  const watersL = want.water ? elements.filter((e) => predicates.isWaterLine(e.tags)) : [];
  const buildings = want.buildings ? elements.filter((e) => predicates.isBuilding(e.tags)) : [];
  progress(40, 'Classifying map features');

  const ways = elements.filter((e) => e.type === 'way' && e.geometry && e.geometry.length >= 2);
  const majorRoads = want.majorRoads
    ? ways.filter((e) => (
      predicates.highwayEq(e.tags, 'motorway')
      || predicates.highwayEq(e.tags, 'trunk')
      || predicates.highwayEq(e.tags, 'primary')
    ))
    : [];
  const minorRoads = want.minorRoads
    ? ways.filter((e) => (
      predicates.highwayEq(e.tags, 'secondary')
      || predicates.highwayEq(e.tags, 'tertiary')
      || predicates.isLocalRoad(e.tags)
    ))
    : [];
  progress(50, 'Preparing road layers');

  const roadColorForFeature = (feat) => {
    const roadType = feat.tags?.highway || '';
    if (roadType === 'motorway') return roadSubTypeColors.motorway || colors.majorRoads;
    if (roadType === 'trunk') return roadSubTypeColors.trunk || colors.majorRoads;
    if (roadType === 'primary') return roadSubTypeColors.primary || colors.majorRoads;
    if (roadType === 'secondary') return roadSubTypeColors.secondary || colors.minorRoads;
    if (roadType === 'tertiary') return roadSubTypeColors.tertiary || colors.minorRoads;
    if (predicates.isLocalRoad(feat.tags)) return roadSubTypeColors.local || colors.minorRoads;
    return colors.minorRoads;
  };

  for (let i = 0; i < parks.length; i++) {
    const feat = parks[i];
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
    if (i % 1000 === 0) ensureNotCanceled();
  }
  if (want.parks) progress(60, `Parks layer ready (${parks.length})`);

  for (let i = 0; i < watersP.length; i++) {
    const feat = watersP[i];
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
    if (i % 1000 === 0) ensureNotCanceled();
  }

  for (let i = 0; i < watersL.length; i++) {
    const feat = watersL[i];
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
    if (i % 1000 === 0) ensureNotCanceled();
  }
  if (want.water) progress(70, `Water layer ready (${watersP.length + watersL.length})`);

  if (want.buildings) {
    for (let i = 0; i < buildings.length; i++) {
      const feat = buildings[i];
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
      if (i % 1000 === 0) ensureNotCanceled();
    }
    progress(80, `Buildings layer ready (${buildings.length})`);
  }

  const addLine = (collection, g, strokeWidth) => {
    for (let i = 0; i < collection.length; i++) {
      const feat = collection[i];
      const d = lineString(feat.geometry, tx, ty);
      if (!d) continue;
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', roadColorForFeature(feat));
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('stroke-width', strokeWidth);
      g.appendChild(p);
      if (i % 1000 === 0) ensureNotCanceled();
    }
  };

  if (want.parks) svg.appendChild(gParks);
  if (want.water) svg.appendChild(gWater);
  if (want.buildings) svg.appendChild(gBldg);
  if (want.majorRoads) addLine(majorRoads, gMajorRoads, 2.8), svg.appendChild(gMajorRoads);
  if (want.minorRoads) addLine(minorRoads, gMinorRoads, 1.9), svg.appendChild(gMinorRoads);
  progress(90, `Road layers ready (${majorRoads.length + minorRoads.length})`);

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svg);
  const fileName = `map_export_${west.toFixed(4)}_${south.toFixed(4)}_${east.toFixed(4)}_${north.toFixed(4)}_${width}x${height}.svg`
    .replace(/[^\w.\-]+/g, '_');
  progress(100, 'SVG is ready for download');

  return { svgStr, fileName };
}
