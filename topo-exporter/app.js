// app.js
/* global maplibregl, MapboxDraw, turf, d3 */

'use strict';

const CONFIG = {
  // Terrarium elevation tiles. Encoding:
  // elevation(m) = (R * 256 + G + B / 256) - 32768
  // Source commonly used for demos; availability is not guaranteed.
  DEM_TERRARIUM_URL: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',

  // DEM sampling controls
  DEM_ZOOM: 12,           // increase for more detail, more load
  GRID_MAX: 420,          // cap grid resolution (square) to control runtime/memory

  // OSM Overpass endpoint
  OVERPASS_URL: 'https://overpass-api.de/api/interpreter',

  // Preview styling
  PREVIEW_OPACITY: 0.95,
};

const State = {
  aoiFeature: null,     // GeoJSON Feature (Polygon)
  aoiBbox: null,        // [minLon, minLat, maxLon, maxLat]
  preview: {
    contours: null,     // { levels: [{elev, geojson}], ... }
    roads: null,        // GeoJSON FeatureCollection
    buildings: null,    // GeoJSON FeatureCollection
    meta: null,
  },
};

const el = {
  bbox: document.getElementById('aoi-bbox'),
  log: document.getElementById('log'),
  units: document.getElementById('units'),
  interval: document.getElementById('interval'),
  boldEvery: document.getElementById('bold-every'),
  labels: document.getElementById('labels'),
  palette: document.getElementById('palette'),
  reverse: document.getElementById('reverse'),
  singleOn: document.getElementById('single-color-on'),
  singleColor: document.getElementById('single-color'),
  roads: document.getElementById('roads'),
  buildings: document.getElementById('buildings'),
  sizeMm: document.getElementById('size-mm'),
  marginMm: document.getElementById('margin-mm'),
  generate: document.getElementById('generate'),
  exportSvg: document.getElementById('export-svg'),
  previewSvg: document.getElementById('preview'),
};

function log(msg) {
  el.log.textContent = String(msg ?? '');
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function assertAOI() {
  if (!State.aoiFeature || !State.aoiBbox) throw new Error('AOI missing');
}

function toRad(d) { return d * Math.PI / 180; }

function lonLatToWebMercatorMeters([lon, lat]) {
  // EPSG:3857
  const R = 6378137;
  const x = R * toRad(lon);
  const y = R * Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2));
  return [x, y];
}

function webMercatorMetersToLonLat([x, y]) {
  const R = 6378137;
  const lon = (x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
}

function lonLatToTileXY(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = toRad(lat);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y, z };
}

function tileXYToLonLatBounds(x, y, z) {
  const n = 2 ** z;
  const lon1 = x / n * 360 - 180;
  const lon2 = (x + 1) / n * 360 - 180;
  const lat1 = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const lat2 = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
  // Note: lat1 > lat2
  return [lon1, lat2, lon2, lat1]; // [minLon, minLat, maxLon, maxLat]
}

function replaceUrlTemplate(tpl, { z, x, y }) {
  return tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

async function fetchImageBitmap(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Tile fetch failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

function decodeTerrariumPixel(r, g, b) {
  return (r * 256 + g + b / 256) - 32768;
}

async function loadTerrariumTilesForBbox(bbox, z) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const tMin = lonLatToTileXY(minLon, maxLat, z); // top-left
  const tMax = lonLatToTileXY(maxLon, minLat, z); // bottom-right

  const tiles = [];
  for (let x = tMin.x; x <= tMax.x; x++) {
    for (let y = tMin.y; y <= tMax.y; y++) {
      tiles.push({ x, y, z });
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const tileData = new Map(); // key -> { boundsLonLat, imageData(Uint8ClampedArray) }

  let loaded = 0;
  for (const t of tiles) {
    const url = replaceUrlTemplate(CONFIG.DEM_TERRARIUM_URL, t);
    const bmp = await fetchImageBitmap(url);
    ctx.clearRect(0, 0, 256, 256);
    ctx.drawImage(bmp, 0, 0, 256, 256);
    const img = ctx.getImageData(0, 0, 256, 256).data;
    const bounds = tileXYToLonLatBounds(t.x, t.y, t.z);
    tileData.set(`${t.z}/${t.x}/${t.y}`, { t, bounds, img });
    loaded++;
    if (loaded % 4 === 0) log(`Loaded DEM tiles: ${loaded}/${tiles.length}`);
  }

  return { z, tileData };
}

function pickGridSizeForBbox(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const [x1, y1] = lonLatToWebMercatorMeters([minLon, minLat]);
  const [x2, y2] = lonLatToWebMercatorMeters([maxLon, maxLat]);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  const maxDim = Math.max(w, h);

  // heuristic: ~2km per sample at low zoom, ~500m per sample at higher zoom
  const target = clamp(Math.round(maxDim / 600), 140, CONFIG.GRID_MAX);
  return { nx: target, ny: target };
}

function buildMaskedElevationGrid({ bbox, aoiFeature, tiles, grid }) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const { nx, ny } = grid;

  const aoiPoly = aoiFeature;
  const values = new Float32Array(nx * ny);

  const lonStep = (maxLon - minLon) / (nx - 1);
  const latStep = (maxLat - minLat) / (ny - 1);

  // Precompute point-in-polygon test (turf booleanPointInPolygon)
  let idx = 0;
  for (let j = 0; j < ny; j++) {
    const lat = maxLat - j * latStep;
    for (let i = 0; i < nx; i++) {
      const lon = minLon + i * lonStep;

      // Mask outside polygon: set NaN; later replaced with sentinel
      const inside = turf.booleanPointInPolygon(turf.point([lon, lat]), aoiPoly);

      const elev = inside ? sampleTerrariumElevationAtLonLat(tiles, lon, lat) : NaN;
      values[idx++] = elev;
    }
  }

  // d3-contour does not robustly handle NaN in all paths; replace with a sentinel.
  // Using min-1km to keep isolines from connecting through masked regions.
  let min = Infinity;
  for (let k = 0; k < values.length; k++) {
    const v = values[k];
    if (!Number.isNaN(v)) min = Math.min(min, v);
  }
  const sentinel = (min === Infinity ? -10000 : (min - 10000));
  for (let k = 0; k < values.length; k++) {
    if (Number.isNaN(values[k])) values[k] = sentinel;
  }

  return { values, nx, ny, domain: { min: min === Infinity ? 0 : min, sentinel } };
}

function sampleTerrariumElevationAtLonLat(tiles, lon, lat) {
  const z = tiles.z;
  const { x, y } = lonLatToTileXY(lon, lat, z);
  const key = `${z}/${x}/${y}`;
  const entry = tiles.tileData.get(key);
  if (!entry) return 0;

  const [tMinLon, tMinLat, tMaxLon, tMaxLat] = entry.bounds;
  // bounds are [minLon, minLat, maxLon, maxLat] where maxLat is north edge
  const u = (lon - tMinLon) / (tMaxLon - tMinLon);
  const v = (tMaxLat - lat) / (tMaxLat - tMinLat);

  const px = clamp(Math.floor(u * 255), 0, 255);
  const py = clamp(Math.floor(v * 255), 0, 255);

  const off = (py * 256 + px) * 4;
  const r = entry.img[off];
  const g = entry.img[off + 1];
  const b = entry.img[off + 2];
  return decodeTerrariumPixel(r, g, b);
}

function computeThresholds({ min, max, intervalMeters }) {
  const start = Math.ceil(min / intervalMeters) * intervalMeters;
  const arr = [];
  for (let t = start; t <= max; t += intervalMeters) arr.push(t);
  return arr;
}

function contourGeoJSONFromD3(contour, bbox, grid) {
  // contour from d3.contours() produces MultiPolygon in grid coords.
  // Convert to GeoJSON MultiLineString by tracing polygon rings as lines.
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const { nx, ny } = grid;

  const lonStep = (maxLon - minLon) / (nx - 1);
  const latStep = (maxLat - minLat) / (ny - 1);

  const lines = [];
  // contour.coordinates: array of polygons, each polygon: array of rings, ring: array of [x,y] in grid space
  for (const poly of contour.coordinates) {
    for (const ring of poly) {
      const coords = ring.map(([gx, gy]) => {
        const lon = minLon + gx * lonStep;
        const lat = maxLat - gy * latStep;
        return [lon, lat];
      });
      lines.push(coords);
    }
  }

  return turf.multiLineString(lines, { elev: contour.value });
}

async function fetchOverpassFeatures(bbox, wantRoads, wantBuildings) {
  const [minLon, minLat, maxLon, maxLat] = bbox;

  // Roads: highway ways
  // Buildings: ways/relations with building tag
  const parts = [];
  if (wantRoads) {
    parts.push(`way["highway"](${minLat},${minLon},${maxLat},${maxLon});`);
  }
  if (wantBuildings) {
    parts.push(`way["building"](${minLat},${minLon},${maxLat},${maxLon});relation["building"](${minLat},${minLon},${maxLat},${maxLon});`);
  }
  if (parts.length === 0) return { roads: turf.featureCollection([]), buildings: turf.featureCollection([]) };

  const query = `
    [out:json][timeout:25];
    (
      ${parts.join('\n')}
    );
    out body;
    >;
    out skel qt;
  `.trim();

  const res = await fetch(CONFIG.OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: query }).toString(),
  });

  if (!res.ok) throw new Error(`Overpass failed: ${res.status} ${res.statusText}`);
  const data = await res.json();

  // Minimal OSM JSON -> GeoJSON conversion (limited: ways to LineString/Polygon).
  // For production: use osmtogeojson. This is kept dependency-light.
  const { roads, buildings } = osmJsonToGeojson(data);
  return { roads, buildings };
}

function osmJsonToGeojson(osm) {
  const nodes = new Map();
  const ways = [];
  const relations = [];

  for (const el of osm.elements ?? []) {
    if (el.type === 'node') nodes.set(el.id, [el.lon, el.lat]);
    if (el.type === 'way') ways.push(el);
    if (el.type === 'relation') relations.push(el);
  }

  const roadFeatures = [];
  const buildingFeatures = [];

  for (const w of ways) {
    const coords = (w.nodes ?? []).map(id => nodes.get(id)).filter(Boolean);
    if (coords.length < 2) continue;

    const tags = w.tags ?? {};
    const isBuilding = !!tags.building;
    const isRoad = !!tags.highway;

    if (!isBuilding && !isRoad) continue;

    const isClosed = coords.length >= 4 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1];

    if (isBuilding && isClosed) {
      buildingFeatures.push(turf.polygon([coords], { ...tags }));
    } else if (isRoad) {
      roadFeatures.push(turf.lineString(coords, { ...tags }));
    } else if (isBuilding) {
      // fallback
      buildingFeatures.push(turf.lineString(coords, { ...tags }));
    }
  }

  // Relations ignored in this minimal converter.

  return {
    roads: turf.featureCollection(roadFeatures),
    buildings: turf.featureCollection(buildingFeatures),
  };
}

function getMetersInterval() {
  const units = el.units.value;
  const v = Number(el.interval.value);
  if (!Number.isFinite(v) || v <= 0) throw new Error('Invalid interval');
  return units === 'ft' ? (v * 0.3048) : v;
}

function paletteFor(paletteName, reverse) {
  const base = {
    mono: ['#111111'],
    terrain: ['#0b3d2e', '#1e6e3a', '#6aa84f', '#ffd966', '#c27ba0', '#674ea7'],
    ocean: ['#001f3f', '#003f7f', '#1d6fa5', '#6fa8dc'],
    heat: ['#2c003e', '#7b1fa2', '#e91e63', '#ff9800', '#ffe082'],
  }[paletteName] ?? ['#111111'];

  if (!reverse) return base;
  return [...base].reverse();
}

function colorForElevation(elev, min, max, palette) {
  if (palette.length === 1) return palette[0];
  const t = (elev - min) / Math.max(1e-9, (max - min));
  const idx = clamp(Math.floor(t * palette.length), 0, palette.length - 1);
  return palette[idx];
}

function clearPreview() {
  while (el.previewSvg.firstChild) el.previewSvg.removeChild(el.previewSvg.firstChild);
}

function setPreviewViewBox() {
  el.previewSvg.setAttribute('viewBox', `0 0 ${el.previewSvg.clientWidth} ${el.previewSvg.clientHeight}`);
}

function projectToScreen(lonLat, bbox, screenW, screenH, paddingPx = 20) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const [x1, y1] = lonLatToWebMercatorMeters([minLon, minLat]);
  const [x2, y2] = lonLatToWebMercatorMeters([maxLon, maxLat]);
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  const [x, y] = lonLatToWebMercatorMeters(lonLat);

  const sx = (x - minX) / (maxX - minX);
  const sy = 1 - (y - minY) / (maxY - minY);

  const w = Math.max(1, screenW - paddingPx * 2);
  const h = Math.max(1, screenH - paddingPx * 2);

  return [paddingPx + sx * w, paddingPx + sy * h];
}

function geojsonLineToSvgPath(line, bbox, screenW, screenH, paddingPx) {
  const coords = line.geometry.coordinates;
  if (!coords || coords.length < 2) return '';
  let d = '';
  for (let i = 0; i < coords.length; i++) {
    const [x, y] = projectToScreen(coords[i], bbox, screenW, screenH, paddingPx);
    d += (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return d;
}

function appendPath(d, stroke, width, opacity, parent) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', stroke);
  p.setAttribute('stroke-width', String(width));
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('opacity', String(opacity));
  parent.appendChild(p);
  return p;
}

function appendText(x, y, text, fill, parent) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('fill', fill);
  t.setAttribute('font-size', '10');
  t.setAttribute('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace');
  t.setAttribute('dominant-baseline', 'middle');
  t.textContent = text;
  parent.appendChild(t);
  return t;
}

function renderPreview({ contours, roads, buildings, bbox, meta }) {
  clearPreview();
  setPreviewViewBox();

  const w = el.previewSvg.clientWidth;
  const h = el.previewSvg.clientHeight;
  const paddingPx = 24;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('opacity', String(CONFIG.PREVIEW_OPACITY));
  el.previewSvg.appendChild(g);

  const gContours = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const gRoads = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const gBuildings = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const gLabels = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.appendChild(gBuildings);
  g.appendChild(gRoads);
  g.appendChild(gContours);
  g.appendChild(gLabels);

  const reverse = el.reverse.value === '1';
  const paletteName = el.palette.value;
  const singleOn = el.singleOn.value === '1';
  const singleColor = el.singleColor.value;
  const palette = singleOn ? [singleColor] : paletteFor(paletteName, reverse);

  const boldEvery = Number(el.boldEvery.value);
  const labelMode = el.labels.value;

  // Buildings
  if (buildings && buildings.features.length) {
    for (const f of buildings.features) {
      if (f.geometry.type === 'Polygon') {
        const ring = f.geometry.coordinates[0];
        if (!ring || ring.length < 4) continue;
        let d = '';
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = projectToScreen(ring[i], bbox, w, h, paddingPx);
          d += (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`);
        }
        d += 'Z';
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', '#6b7280');
        p.setAttribute('stroke-width', '1');
        p.setAttribute('opacity', '0.8');
        gBuildings.appendChild(p);
      }
    }
  }

  // Roads
  if (roads && roads.features.length) {
    for (const f of roads.features) {
      if (f.geometry.type !== 'LineString') continue;
      const d = geojsonLineToSvgPath(f, bbox, w, h, paddingPx);
      if (!d) continue;
      appendPath(d, '#94a3b8', 1, 0.85, gRoads);
    }
  }

  // Contours
  for (let i = 0; i < contours.levels.length; i++) {
    const lvl = contours.levels[i];
    const elev = lvl.elev;
    const color = singleOn ? singleColor : colorForElevation(elev, meta.minElev, meta.maxElev, palette);

    const isBold = boldEvery > 0 && (Math.round(elev / meta.intervalM) % boldEvery === 0);
    const strokeW = isBold ? 2 : 1;
    const opacity = isBold ? 1.0 : 0.9;

    for (const feat of lvl.geojson.features) {
      if (feat.geometry.type !== 'MultiLineString') continue;
      for (const ls of feat.geometry.coordinates) {
        const f = turf.lineString(ls, { elev });
        const d = geojsonLineToSvgPath(f, bbox, w, h, paddingPx);
        if (!d) continue;
        appendPath(d, color, strokeW, opacity, gContours);

        const wantLabel =
          labelMode === 'all' || (labelMode === 'bold' && isBold);

        if (wantLabel && ls.length >= 2) {
          const mid = ls[Math.floor(ls.length / 2)];
          const [tx, ty] = projectToScreen(mid, bbox, w, h, paddingPx);
          appendText(tx + 3, ty, `${Math.round(elev)}${meta.units}`, color, gLabels);
        }
      }
    }
  }
}

function buildSVGExport({ contours, roads, buildings, bbox, meta }) {
  const sizeMm = Number(el.sizeMm.value);
  const marginMm = Number(el.marginMm.value);
  const mmToPx = (mm) => (mm * 96) / 25.4; // nominal; SVG is vector; used for viewBox convenience.

  const widthPx = mmToPx(sizeMm);
  const heightPx = mmToPx(sizeMm);
  const marginPx = mmToPx(marginMm);

  const reverse = el.reverse.value === '1';
  const paletteName = el.palette.value;
  const singleOn = el.singleOn.value === '1';
  const singleColor = el.singleColor.value;
  const palette = singleOn ? [singleColor] : paletteFor(paletteName, reverse);

  const boldEvery = Number(el.boldEvery.value);
  const labelMode = el.labels.value;

  const svg = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
  const root = svg.documentElement;

  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', `${sizeMm}mm`);
  root.setAttribute('height', `${sizeMm}mm`);
  root.setAttribute('viewBox', `0 0 ${widthPx.toFixed(0)} ${heightPx.toFixed(0)}`);

  const gContours = svg.createElementNS('http://www.w3.org/2000/svg', 'g');
  gContours.setAttribute('id', 'contours');

  const gRoads = svg.createElementNS('http://www.w3.org/2000/svg', 'g');
  gRoads.setAttribute('id', 'roads');

  const gBuildings = svg.createElementNS('http://www.w3.org/2000/svg', 'g');
  gBuildings.setAttribute('id', 'buildings');

  const gLabels = svg.createElementNS('http://www.w3.org/2000/svg', 'g');
  gLabels.setAttribute('id', 'labels');

  root.appendChild(gBuildings);
  root.appendChild(gRoads);
  root.appendChild(gContours);
  root.appendChild(gLabels);

  // Buildings
  if (buildings && buildings.features.length) {
    for (const f of buildings.features) {
      if (f.geometry.type === 'Polygon') {
        const ring = f.geometry.coordinates[0];
        if (!ring || ring.length < 4) continue;

        let d = '';
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = projectToScreen(ring[i], bbox, widthPx, heightPx, marginPx);
          d += (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`);
        }
        d += 'Z';

        const p = svg.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', '#6b7280');
        p.setAttribute('stroke-width', '0.8');
        p.setAttribute('stroke-linejoin', 'round');
        p.setAttribute('stroke-linecap', 'round');
        gBuildings.appendChild(p);
      }
    }
  }

  // Roads
  if (roads && roads.features.length) {
    for (const f of roads.features) {
      if (f.geometry.type !== 'LineString') continue;
      const d = geojsonLineToSvgPath(f, bbox, widthPx, heightPx, marginPx);
      if (!d) continue;

      const p = svg.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#94a3b8');
      p.setAttribute('stroke-width', '0.6');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('stroke-linecap', 'round');
      gRoads.appendChild(p);
    }
  }

  // Contours + labels
  for (let i = 0; i < contours.levels.length; i++) {
    const lvl = contours.levels[i];
    const elev = lvl.elev;

    const isBold = boldEvery > 0 && (Math.round(elev / meta.intervalM) % boldEvery === 0);
    const strokeW = isBold ? 1.0 : 0.6;

    const color = singleOn ? singleColor : colorForElevation(elev, meta.minElev, meta.maxElev, palette);

    for (const feat of lvl.geojson.features) {
      if (feat.geometry.type !== 'MultiLineString') continue;
      for (const ls of feat.geometry.coordinates) {
        const f = turf.lineString(ls, { elev });
        const d = geojsonLineToSvgPath(f, bbox, widthPx, heightPx, marginPx);
        if (!d) continue;

        const p = svg.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', color);
        p.setAttribute('stroke-width', String(strokeW));
        p.setAttribute('stroke-linejoin', 'round');
        p.setAttribute('stroke-linecap', 'round');
        gContours.appendChild(p);

        const wantLabel = labelMode === 'all' || (labelMode === 'bold' && isBold);
        if (wantLabel && ls.length >= 2) {
          const mid = ls[Math.floor(ls.length / 2)];
          const [tx, ty] = projectToScreen(mid, bbox, widthPx, heightPx, marginPx);
          const t = svg.createElementNS('http://www.w3.org/2000/svg', 'text');
          t.setAttribute('x', (tx + 2).toFixed(2));
          t.setAttribute('y', (ty).toFixed(2));
          t.setAttribute('fill', color);
          t.setAttribute('font-size', '10');
          t.setAttribute('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace');
          t.setAttribute('dominant-baseline', 'middle');
          t.textContent = `${Math.round(elev)}${meta.units}`;
          gLabels.appendChild(t);
        }
      }
    }
  }

  const xml = new XMLSerializer().serializeToString(root);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

// Map init
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  },
  center: [0, 20],
  zoom: 2,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');

const DrawRectangleMode = {
  onSetup() {
    const rectangle = this.newFeature({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[]] },
    });

    this.addFeature(rectangle);
    this.clearSelectedFeatures();
    this.updateUIClasses({ mouse: 'add' });
    this.setActionableState({ trash: true });

    return {
      rectangle,
      start: null,   // [lng, lat]
      current: null, // [lng, lat]
    };
  },

  onClick(state, e) {
    const p = [e.lngLat.lng, e.lngLat.lat];

    if (!state.start) {
      state.start = p;
      state.current = p;
      this._updateRectangle(state);

// emit create so your map.on('draw.create', setAOIFromDraw) runs
      this.map.fire('draw.create', { features: [state.rectangle.toGeoJSON()] });

      this.changeMode('simple_select', { featureIds: [state.rectangle.id] });
      return;
    }

    state.current = p;
    this._updateRectangle(state);
    this.changeMode('simple_select', { featureIds: [state.rectangle.id] });
  },

  onMouseMove(state, e) {
    if (!state.start) return;
    state.current = [e.lngLat.lng, e.lngLat.lat];
    this._updateRectangle(state);

    // emit update so your map.on('draw.update', setAOIFromDraw) runs
    this.map.fire('draw.update', { features: [state.rectangle.toGeoJSON()] });
  },

  onStop(state) {
    this.updateUIClasses({ mouse: 'none' });

    const ring = state.rectangle?.getCoordinates?.()?.[0] || [];
    const unique = new Set(ring.map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)}`));

    // Reject degenerate rectangles (click without drag)
    if (unique.size < 4) {
      try { this.deleteFeature([state.rectangle.id], { silent: true }); } catch {}
    }
  },

  onTrash(state) {
    try { this.deleteFeature([state.rectangle.id], { silent: true }); } catch {}
    this.changeMode('simple_select');
  },

  toDisplayFeatures(state, geojson, display) {
    display(geojson);
  },

  _updateRectangle(state) {
    const [x1, y1] = state.start;
    const [x2, y2] = state.current;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const ring = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ];

    state.rectangle.setCoordinates([ring]);
  },
};

const baseModes = (MapboxDraw && MapboxDraw.modes) ? MapboxDraw.modes : {};

const draw = new MapboxDraw({
  displayControlsDefault: false,
  controls: { polygon: true, trash: true },
  modes: Object.assign({}, baseModes, { draw_rectangle: DrawRectangleMode }),
  defaultMode: 'simple_select',
});
map.addControl(draw, 'top-left');

function closeRingIfNeeded(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a && b && a[0] === b[0] && a[1] === b[1]) return ring;
  return [...ring, a];
}

function normalizePolygonFeature(f) {
  if (!f || f.geometry?.type !== 'Polygon') return null;

  // 1) Close rings from Draw output
  const inRings = (f.geometry.coordinates || []).map(closeRingIfNeeded);
  if (!inRings.length || inRings[0].length < 4) return null;

  // 2) Create polygon
  let poly = turf.polygon(inRings, { ...f.properties });

  // 3) Clean duplicates; this can REMOVE the closing point => re-close after cleaning
  poly = turf.cleanCoords(poly);
  const cleanedRings = (poly.geometry.coordinates || []).map(closeRingIfNeeded);
  if (!cleanedRings.length || cleanedRings[0].length < 4) return null;
  poly = turf.polygon(cleanedRings, { ...f.properties });

  // 4) Degeneracy guard: require enough unique vertices on outer ring
  const outer = poly.geometry.coordinates[0];
  const unique = new Set(outer.map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)}`));
  if (unique.size < 4) return null;

  // 5) Self-intersection guard
  // kinks.features contains intersection points; any => invalid polygon for masking operations
  const k = turf.kinks(poly);
  if ((k.features || []).length > 0) return null;

  return poly;
}

function setAOIFromDraw() {
  const fc = draw.getAll();

  if (!fc?.features?.length) {
    State.aoiFeature = null;
    State.aoiBbox = null;
    el.bbox.textContent = '—';
    el.exportSvg.disabled = true;
    return;
  }

  const f0 = fc.features[0];
  const norm = normalizePolygonFeature(f0);

  // Critical change:
  // Ignore transient invalid updates from Draw instead of clearing last-good AOI.
  if (!norm) {
    if (!State.aoiFeature) {
      el.bbox.textContent = '—';
      el.exportSvg.disabled = true;
      log('AOI invalid: self-intersection or degenerate polygon');
    }
    return;
  }

  State.aoiFeature = norm;
  State.aoiBbox = turf.bbox(norm);

  const [minLon, minLat, maxLon, maxLat] = State.aoiBbox;
  el.bbox.textContent = `${minLon.toFixed(5)}, ${minLat.toFixed(5)}  →  ${maxLon.toFixed(5)}, ${maxLat.toFixed(5)}`;
  el.exportSvg.disabled = true;
}

map.on('draw.create', setAOIFromDraw);
map.on('draw.update', setAOIFromDraw);
map.on('draw.delete', setAOIFromDraw);

document.getElementById('draw-rect').addEventListener('click', () => {
  draw.changeMode('draw_rectangle');
});

document.getElementById('draw-poly').addEventListener('click', () => {
  draw.changeMode('draw_polygon');
});

document.getElementById('clear-aoi').addEventListener('click', () => {
  draw.deleteAll();
  setAOIFromDraw();
  clearPreview();
  log('');
});

el.generate.addEventListener('click', async () => {
  try {
    assertAOI();
    clearPreview();
    el.exportSvg.disabled = true;
    log('Preparing inputs...');

    const bbox = State.aoiBbox;
    const intervalM = getMetersInterval();
    const units = el.units.value;
    const intervalForLabel = units === 'ft' ? (intervalM / 0.3048) : intervalM;

    // 1) DEM tiles
    log('Loading DEM tiles...');
    const tiles = await loadTerrariumTilesForBbox(bbox, CONFIG.DEM_ZOOM);

    // 2) Grid + masked elevation values
    log('Building elevation grid...');
    const grid = pickGridSizeForBbox(bbox);
    const { values, nx, ny, domain } = buildMaskedElevationGrid({
      bbox,
      aoiFeature: State.aoiFeature,
      tiles,
      grid,
    });

    // Estimate min/max on unmasked values
    let minElev = Infinity;
    let maxElev = -Infinity;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v <= domain.sentinel + 1) continue;
      minElev = Math.min(minElev, v);
      maxElev = Math.max(maxElev, v);
    }
    if (!Number.isFinite(minElev) || !Number.isFinite(maxElev)) throw new Error('No elevation samples');

    // 3) Contours
    log('Generating contours...');
    const thresholds = computeThresholds({ min: minElev, max: maxElev, intervalMeters: intervalM });

    const contourGen = d3.contours()
      .size([nx, ny])
      .thresholds(thresholds);

    const rawContours = contourGen(values);

    const levels = [];
    for (const c of rawContours) {
      const geo = contourGeoJSONFromD3(c, bbox, { nx, ny });
      // Small simplify for preview
      const simplified = turf.simplify(geo, { tolerance: 0.00008, highQuality: false });
      levels.push({ elev: c.value, geojson: turf.featureCollection([simplified]) });
    }

    // 4) OSM overlays (optional)
    let roadsFC = turf.featureCollection([]);
    let buildingsFC = turf.featureCollection([]);
    if (el.roads.checked || el.buildings.checked) {
      log('Loading OSM overlays...');
      const ov = await fetchOverpassFeatures(bbox, el.roads.checked, el.buildings.checked);
      roadsFC = ov.roads;
      buildingsFC = ov.buildings;
    }

    State.preview = {
      contours: { levels },
      roads: roadsFC,
      buildings: buildingsFC,
      meta: {
        bbox,
        intervalM,
        intervalLabel: intervalForLabel,
        units: units === 'ft' ? 'ft' : 'm',
        minElev,
        maxElev,
        grid: { nx, ny },
        demZoom: CONFIG.DEM_ZOOM,
      },
    };

    log(`Preview ready. Grid ${nx}×${ny}. Levels: ${levels.length}.`);
    renderPreview({
      contours: State.preview.contours,
      roads: State.preview.roads,
      buildings: State.preview.buildings,
      bbox,
      meta: State.preview.meta,
    });

    el.exportSvg.disabled = false;
  } catch (e) {
    log(String(e?.message ?? e));
    el.exportSvg.disabled = true;
  }
});

el.exportSvg.addEventListener('click', () => {
  try {
    if (!State.preview?.contours) throw new Error('No preview data');

    const svgText = buildSVGExport({
      contours: State.preview.contours,
      roads: State.preview.roads,
      buildings: State.preview.buildings,
      bbox: State.preview.meta.bbox,
      meta: State.preview.meta,
    });

    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'contours.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    log('SVG exported.');
  } catch (e) {
    log(String(e?.message ?? e));
  }
});

// Keep overlay SVG sized
function resizeOverlay() {
  el.previewSvg.setAttribute('width', String(el.previewSvg.clientWidth));
  el.previewSvg.setAttribute('height', String(el.previewSvg.clientHeight));
  setPreviewViewBox();
  if (State.preview?.contours) {
    renderPreview({
      contours: State.preview.contours,
      roads: State.preview.roads,
      buildings: State.preview.buildings,
      bbox: State.preview.meta.bbox,
      meta: State.preview.meta,
    });
  }
}

window.addEventListener('resize', resizeOverlay);
map.on('load', resizeOverlay);