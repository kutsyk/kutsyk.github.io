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
  abort: null,
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
  // Search
  locQuery: document.getElementById('loc-query'),
  locResults: document.getElementById('loc-results'),
  locGo: document.getElementById('loc-go'),
  // Rectangle sizing
  rectW: document.getElementById('rect-w'),
  rectH: document.getElementById('rect-h'),
  rectApply: document.getElementById('rect-apply'),
  // Performance
  estTiles: document.getElementById('est-tiles'),
  estGrid: document.getElementById('est-grid'),
  perfHint: document.getElementById('perf-hint'),
  applyFast: document.getElementById('apply-fast'),
  // Control
  cancel: document.getElementById('cancel'),
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
  return { x, y };
}

function terrariumToMeters(r, g, b) {
  return (r * 256 + g + b / 256) - 32768;
}

function tileUrl(z, x, y) {
  return CONFIG.DEM_TERRARIUM_URL
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
}

async function fetchImageBitmap(url, signal) {
  const res = await fetch(url, signal ? { signal } : undefined);
  if (!res.ok) throw new Error(`Tile fetch failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

async function decodeTerrariumTileToFloatGrid(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  const out = new Float32Array(img.width * img.height);

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    out[j] = terrariumToMeters(data[i], data[i + 1], data[i + 2]);
  }
  return { values: out, width: img.width, height: img.height };
}

function bboxWidthMeters(bbox) {
  const [minLon, minLat, maxLon] = bbox;
  const p1 = lonLatToWebMercatorMeters([minLon, minLat]);
  const p2 = lonLatToWebMercatorMeters([maxLon, minLat]);
  return Math.abs(p2[0] - p1[0]);
}

function bboxHeightMeters(bbox) {
  const [minLon, minLat, , maxLat] = bbox;
  const p1 = lonLatToWebMercatorMeters([minLon, minLat]);
  const p2 = lonLatToWebMercatorMeters([minLon, maxLat]);
  return Math.abs(p2[1] - p1[1]);
}

function pickGridSizeForBbox(bbox) {
  const wM = bboxWidthMeters(bbox);
  const hM = bboxHeightMeters(bbox);
  const longest = Math.max(wM, hM);

  // heuristic: 1 sample per ~10m on long side, capped
  const target = clamp(Math.round(longest / 10), 80, CONFIG.GRID_MAX);
  const aspect = wM / hM;

  let nx = target;
  let ny = target;

  if (aspect > 1) ny = Math.max(30, Math.round(target / aspect));
  else nx = Math.max(30, Math.round(target * aspect));

  nx = clamp(nx, 30, CONFIG.GRID_MAX);
  ny = clamp(ny, 30, CONFIG.GRID_MAX);

  return { nx, ny };
}

async function sampleElevationGridForBbox(bbox) {
  const z = CONFIG.DEM_ZOOM;
  const [minLon, minLat, maxLon, maxLat] = bbox;

  const tMin = lonLatToTileXY(minLon, maxLat, z);
  const tMax = lonLatToTileXY(maxLon, minLat, z);

  const xs = [];
  const ys = [];
  for (let x = tMin.x; x <= tMax.x; x++) xs.push(x);
  for (let y = tMin.y; y <= tMax.y; y++) ys.push(y);

  const tileSize = 256;
  const tiles = new Map();

  for (const x of xs) {
    for (const y of ys) {
      if (State.abort?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const url = tileUrl(z, x, y);
      const img = await fetchImageBitmap(url, State.abort?.signal);
      const decoded = await decodeTerrariumTileToFloatGrid(img);
      tiles.set(`${x},${y}`, decoded);
    }
  }

  const { nx, ny } = pickGridSizeForBbox(bbox);
  const out = new Float32Array(nx * ny);

  function lonLatToGlobalPixel(lon, lat) {
    const n = 2 ** z * tileSize;
    const x = ((lon + 180) / 360) * n;
    const latRad = toRad(lat);
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return [x, y];
  }

  const [minPx, minPy] = lonLatToGlobalPixel(minLon, maxLat);
  const [maxPx, maxPy] = lonLatToGlobalPixel(maxLon, minLat);

  for (let j = 0; j < ny; j++) {
    const v = j / (ny - 1);
    const py = minPy + (maxPy - minPy) * v;

    for (let i = 0; i < nx; i++) {
      const u = i / (nx - 1);
      const px = minPx + (maxPx - minPx) * u;

      const tileX = Math.floor(px / tileSize);
      const tileY = Math.floor(py / tileSize);
      const key = `${tileX},${tileY}`;
      const tile = tiles.get(key);

      if (!tile) {
        out[j * nx + i] = NaN;
        continue;
      }

      const localX = clamp(Math.floor(px - tileX * tileSize), 0, tileSize - 1);
      const localY = clamp(Math.floor(py - tileY * tileSize), 0, tileSize - 1);
      out[j * nx + i] = tile.values[localY * tile.width + localX];
    }
  }

  return { values: out, nx, ny };
}

function contourGeoJSONFromD3(contours, bbox, nx, ny) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lonStep = (maxLon - minLon) / (nx - 1);
  const latStep = (maxLat - minLat) / (ny - 1);

  const lines = [];

  for (const c of contours) {
    // D3 contour is MultiPolygon coordinates in grid space
    // Convert rings to line strings in lon/lat
    for (const poly of c.coordinates) {
      for (const ring of poly) {
        const pts = ring.map(([x, y]) => [minLon + x * lonStep, maxLat - y * latStep]);
        if (pts.length >= 2) lines.push(pts);
      }
    }
  }

  return turf.multiLineString(lines, {});
}

function formatUnits(units) {
  return units === 'ft' ? 'ft' : 'm';
}

function metersToFeet(m) { return m * 3.280839895; }
function feetToMeters(ft) { return ft / 3.280839895; }

function colorForElevation(elev, min, max, palette) {
  if (palette === 'mono') return '#111111';

  const t = clamp((elev - min) / Math.max(1e-9, (max - min)), 0, 1);

  // Minimal, stable palettes (no external deps)
  // Map t to RGB ramps
  function lerp(a, b, x) { return a + (b - a) * x; }
  function rgb(r, g, b) {
    const rr = Math.round(clamp(r, 0, 255));
    const gg = Math.round(clamp(g, 0, 255));
    const bb = Math.round(clamp(b, 0, 255));
    return `rgb(${rr},${gg},${bb})`;
  }

  if (palette === 'terrain') {
    // green -> brown -> white
    if (t < 0.6) return rgb(lerp(30, 120, t / 0.6), lerp(80, 160, t / 0.6), lerp(30, 60, t / 0.6));
    return rgb(lerp(120, 245, (t - 0.6) / 0.4), lerp(160, 245, (t - 0.6) / 0.4), lerp(60, 245, (t - 0.6) / 0.4));
  }

  if (palette === 'ocean') {
    // dark blue -> light
    return rgb(lerp(10, 180, t), lerp(30, 220, t), lerp(80, 250, t));
  }

  if (palette === 'heat') {
    // purple -> red -> yellow
    if (t < 0.5) return rgb(lerp(90, 220, t / 0.5), lerp(0, 40, t / 0.5), lerp(120, 0, t / 0.5));
    return rgb(lerp(220, 250, (t - 0.5) / 0.5), lerp(40, 240, (t - 0.5) / 0.5), lerp(0, 20, (t - 0.5) / 0.5));
  }

  return '#111111';
}

function projectToScreen([lon, lat], bbox, widthPx, heightPx, marginPx) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const x = marginPx + (lon - minLon) / (maxLon - minLon) * (widthPx - 2 * marginPx);
  const y = marginPx + (maxLat - lat) / (maxLat - minLat) * (heightPx - 2 * marginPx);
  return [x, y];
}

function geojsonLineToSvgPath(lineFeature, bbox, widthPx, heightPx, marginPx) {
  const coords = lineFeature?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;

  let d = '';
  for (let i = 0; i < coords.length; i++) {
    const [x, y] = projectToScreen(coords[i], bbox, widthPx, heightPx, marginPx);
    d += (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return d;
}

function clearPreview() {
  while (el.previewSvg.firstChild) el.previewSvg.removeChild(el.previewSvg.firstChild);
}

function setPreviewViewBox() {
  const w = el.previewSvg.clientWidth || 800;
  const h = el.previewSvg.clientHeight || 800;
  el.previewSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
}

async function fetchOverpassFeatures(bbox, wantRoads, wantBuildings, signal) {
  if (!wantRoads && !wantBuildings) {
    return { roads: turf.featureCollection([]), buildings: turf.featureCollection([]) };
  }

  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  const parts = [];
  if (wantRoads) {
    parts.push(`way["highway"](${bboxStr});`);
  }
  if (wantBuildings) {
    parts.push(`way["building"](${bboxStr});`);
  }

  const query = `
[out:json][timeout:25];
(
  ${parts.join('\n  ')}
);
out geom;
`;

  const res = await fetch(CONFIG.OVERPASS_URL, {
    signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    if (res.status === 504) {
      return { roads: turf.featureCollection([]), buildings: turf.featureCollection([]) };
    }
    throw new Error(`Overpass failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const roads = [];
  const buildings = [];

  for (const el0 of json.elements || []) {
    if (el0.type !== 'way' || !Array.isArray(el0.geometry)) continue;
    const coords = el0.geometry.map(p => [p.lon, p.lat]);

    if (wantRoads && el0.tags?.highway) {
      roads.push(turf.lineString(coords, { highway: el0.tags.highway }));
    }
    if (wantBuildings && el0.tags?.building) {
      // ensure polygon closure
      const ring = coords.length ? [...coords] : coords;
      const a = ring[0];
      const b = ring[ring.length - 1];
      if (a && b && (a[0] !== b[0] || a[1] !== b[1])) ring.push(a);
      buildings.push(turf.polygon([ring], { building: el0.tags.building }));
    }
  }

  return {
    roads: turf.featureCollection(roads),
    buildings: turf.featureCollection(buildings),
  };
}

function buildSvg({ contours, roads, buildings, bbox, meta }) {
  const sizeMm = Number(el.sizeMm.value);
  const marginMm = Number(el.marginMm.value);

  const widthPx = Math.round(sizeMm * 3.7795275591);   // 96 dpi approx
  const heightPx = widthPx;
  const marginPx = Math.round(marginMm * 3.7795275591);

  const svg = document;
  const root = svg.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', `${sizeMm}mm`);
  root.setAttribute('height', `${sizeMm}mm`);
  root.setAttribute('viewBox', `0 0 ${widthPx} ${heightPx}`);

  const defs = svg.createElementNS('http://www.w3.org/2000/svg', 'defs');
  root.appendChild(defs);

  const gContours = svg.createElementNS('http://www.w3.org/2000/svg', 'g');
  const gLabels = svg.createElementNS('http://www.w3.org/2000/svg', 'g');
  const gRoads = svg.createElementNS('http://www.w3.org/2000/svg', 'g');
  const gBuildings = svg.createElementNS('http://www.w3.org/2000/svg', 'g');

  root.appendChild(gBuildings);
  root.appendChild(gRoads);
  root.appendChild(gContours);
  root.appendChild(gLabels);

  const units = el.units.value;
  const palette = el.palette.value;
  const reverse = el.reverse.value === '1';
  const singleOn = el.singleOn.value === '1';
  const singleColor = el.singleColor.value;

  const labelMode = el.labels.value;
  const boldEvery = Number(el.boldEvery.value);

  const minElev = meta.minElev;
  const maxElev = meta.maxElev;

  // Buildings
  for (const feat of buildings?.features || []) {
    if (feat.geometry.type !== 'Polygon') continue;
    const ring = feat.geometry.coordinates?.[0];
    if (!ring?.length) continue;

    let d = '';
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = projectToScreen(ring[i], bbox, widthPx, heightPx, marginPx);
      d += (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`);
    }
    d += 'Z';

    const p = svg.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#333');
    p.setAttribute('stroke-width', '0.8');
    gBuildings.appendChild(p);
  }

  // Roads
  for (const feat of roads?.features || []) {
    if (feat.geometry.type !== 'LineString') continue;
    const d = geojsonLineToSvgPath(feat, bbox, widthPx, heightPx, marginPx);
    if (!d) continue;

    const p = svg.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#222');
    p.setAttribute('stroke-width', '0.7');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('stroke-linecap', 'round');
    gRoads.appendChild(p);
  }

  // Contours + labels
  for (let i = 0; i < contours.levels.length; i++) {
    const lvl = contours.levels[i];
    const elev = lvl.elev;

    const isBold = boldEvery > 0 && (Math.round(elev / meta.intervalM) % boldEvery === 0);
    const strokeW = isBold ? 1.0 : 0.6;

    let color = singleOn ? singleColor : colorForElevation(elev, minElev, maxElev, palette);
    if (!singleOn && reverse) {
      // reverse via inversion around midpoint
      const t = (elev - minElev) / Math.max(1e-9, (maxElev - minElev));
      const inv = minElev + (1 - t) * (maxElev - minElev);
      color = colorForElevation(inv, minElev, maxElev, palette);
    }

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
      properties: { aoi_type: 'rect' },
      geometry: { type: 'Polygon', coordinates: [[]] },
    });

    this.addFeature(rectangle);
    this.clearSelectedFeatures();
    this.updateUIClasses({ mouse: 'add' });
    this.setActionableState({ trash: true });

    return { rectangle, start: null, current: null };
  },

  onClick(state, e) {
    const p = [e.lngLat.lng, e.lngLat.lat];

    if (!state.start) {
      state.start = p;
      state.current = p;
      this._updateRectangle(state);
      // emit update for AOI sync
      this.map.fire('draw.update', { features: [state.rectangle.toGeoJSON()] });
      return;
    }

    state.current = p;
    this._updateRectangle(state);
    this.map.fire('draw.create', { features: [state.rectangle.toGeoJSON()] });
    this.changeMode('simple_select', { featureIds: [state.rectangle.id] });
  },

  onMouseMove(state, e) {
    if (!state.start) return;
    state.current = [e.lngLat.lng, e.lngLat.lat];
    this._updateRectangle(state);
    this.map.fire('draw.update', { features: [state.rectangle.toGeoJSON()] });
  },

  onStop(state) {
    this.updateUIClasses({ mouse: 'none' });

    const ring = state.rectangle?.getCoordinates?.()?.[0] || [];
    const unique = new Set(ring.map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)}`));
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

    state.rectangle.properties = { ...(state.rectangle.properties || {}), aoi_type: 'rect' };
    state.rectangle.setCoordinates([ring]);
  },
};

const baseModes = (typeof MapboxDraw !== 'undefined' && MapboxDraw.modes) ? MapboxDraw.modes : {};

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

  const inRings = (f.geometry.coordinates || []).map(closeRingIfNeeded);
  if (!inRings.length || inRings[0].length < 4) return null;

  let poly = turf.polygon(inRings, { ...f.properties });
  poly = turf.cleanCoords(poly);

  // cleanCoords can remove closing coord => re-close
  const rings = (poly.geometry.coordinates || []).map(closeRingIfNeeded);
  if (!rings.length || rings[0].length < 4) return null;
  poly = turf.polygon(rings, { ...f.properties });

  const outer = poly.geometry.coordinates[0];
  const unique = new Set(outer.map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)}`));
  if (unique.size < 4) return null;

  const k = turf.kinks(poly);
  if ((k.features || []).length > 0) return null;

  return poly;
}

function isRectAOI(feature) {
  return feature?.properties?.aoi_type === 'rect';
}

function setAOIFromDraw() {
  const fc = draw.getAll();

  if (!fc?.features?.length) {
    State.aoiFeature = null;
    State.aoiBbox = null;
    el.bbox.textContent = '—';
    el.exportSvg.disabled = true;
    el.generate.disabled = true;
    el.rectApply.disabled = true;
    updatePerfEstimates();
    return;
  }

  const f0 = fc.features[0];
  const norm = normalizePolygonFeature(f0);

  // ignore transient invalid updates; keep last-good AOI
  if (!norm) {
    if (!State.aoiFeature) {
      State.aoiBbox = null;
      el.bbox.textContent = '—';
      el.exportSvg.disabled = true;
      el.generate.disabled = true;
      el.rectApply.disabled = true;
      log('AOI invalid: self-intersection or degenerate polygon');
      updatePerfEstimates();
    }
    return;
  }

  State.aoiFeature = norm;
  State.aoiBbox = turf.bbox(norm);

  const [minLon, minLat, maxLon, maxLat] = State.aoiBbox;
  el.bbox.textContent = `${minLon.toFixed(5)}, ${minLat.toFixed(5)}  →  ${maxLon.toFixed(5)}, ${maxLat.toFixed(5)}`;

  el.exportSvg.disabled = true;
  el.generate.disabled = false;

  trySyncRectInputsFromAOI();
  updatePerfEstimates();
}

map.on('draw.create', setAOIFromDraw);
map.on('draw.update', setAOIFromDraw);
map.on('draw.delete', setAOIFromDraw);

/* ---------- Search (Nominatim) ---------- */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function geocode(query) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '8');
  url.searchParams.set('addressdetails', '1');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
  return res.json();
}

function setLocationOptions(results) {
  el.locResults.innerHTML = '';
  for (const r of results) {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({
      lon: Number(r.lon),
      lat: Number(r.lat),
      bbox: r.boundingbox ? r.boundingbox.map(Number) : null,
      name: r.display_name,
    });
    opt.textContent = r.display_name;
    el.locResults.appendChild(opt);
  }
}

if (el.locQuery && el.locResults && el.locGo) {
  el.locQuery.addEventListener('input', debounce(async () => {
    const q = el.locQuery.value.trim();
    if (q.length < 3) return;
    try {
      log('Searching location…');
      const results = await geocode(q);
      setLocationOptions(results);
      log(results.length ? 'Select a result.' : 'No results.');
    } catch (e) {
      log(String(e?.message ?? e));
    }
  }, 350));

  el.locGo.addEventListener('click', () => {
    const raw = el.locResults.value;
    if (!raw) return;
    const v = JSON.parse(raw);

    if (Array.isArray(v.bbox) && v.bbox.length === 4) {
      // Nominatim: [south, north, west, east]
      const south = v.bbox[0], north = v.bbox[1], west = v.bbox[2], east = v.bbox[3];
      map.fitBounds([[west, south], [east, north]], { padding: 40, duration: 700 });
    } else {
      map.flyTo({ center: [v.lon, v.lat], zoom: 12, duration: 700 });
    }
  });
}

/* ---------- Performance estimation ---------- */
function estimateTileCount(bbox, z) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const tMin = lonLatToTileXY(minLon, maxLat, z);
  const tMax = lonLatToTileXY(maxLon, minLat, z);
  const nx = Math.max(0, (tMax.x - tMin.x + 1));
  const ny = Math.max(0, (tMax.y - tMin.y + 1));
  return nx * ny;
}

function updatePerfEstimates() {
  if (!el.estTiles || !el.estGrid || !el.perfHint) return;

  if (!State.aoiBbox) {
    el.estTiles.textContent = '—';
    el.estGrid.textContent = '—';
    el.perfHint.textContent = '';
    return;
  }

  const tiles = estimateTileCount(State.aoiBbox, CONFIG.DEM_ZOOM);
  const g = pickGridSizeForBbox(State.aoiBbox);

  el.estTiles.textContent = String(tiles);
  el.estGrid.textContent = `${g.nx}×${g.ny}`;

  const hints = [];
  if (tiles > 80) hints.push('High DEM tile count. Reduce AOI or lower DEM_ZOOM.');
  if (tiles > 120) hints.push('Disable Roads/Buildings to avoid Overpass 504.');
  if (g.nx >= CONFIG.GRID_MAX) hints.push('Grid capped. Expect slow preview.');
  el.perfHint.textContent = hints.join(' ');
}

if (el.applyFast) {
  el.applyFast.addEventListener('click', () => {
    el.interval.value = '25';
    el.boldEvery.value = '10';
    el.labels.value = 'none';
    el.roads.checked = false;
    el.buildings.checked = false;
    log('Fast settings applied.');
  });
}

/* ---------- Rectangle sizing ---------- */
function rectRingFromCenterSize(centerLonLat, widthM, heightM) {
  const [cx, cy] = lonLatToWebMercatorMeters(centerLonLat);
  const hw = widthM / 2;
  const hh = heightM / 2;

  const p1 = webMercatorMetersToLonLat([cx - hw, cy - hh]);
  const p2 = webMercatorMetersToLonLat([cx + hw, cy - hh]);
  const p3 = webMercatorMetersToLonLat([cx + hw, cy + hh]);
  const p4 = webMercatorMetersToLonLat([cx - hw, cy + hh]);

  return [p1, p2, p3, p4, p1];
}

function trySyncRectInputsFromAOI() {
  if (!el.rectApply || !el.rectW || !el.rectH) return;

  const f = State.aoiFeature;
  const enabled = !!f && isRectAOI(f);
  el.rectApply.disabled = !enabled;

  if (!enabled) {
    el.rectW.value = '';
    el.rectH.value = '';
    return;
  }

  const ring = f.geometry.coordinates[0];
  if (!ring || ring.length < 5) return;

  const w = turf.distance(turf.point(ring[0]), turf.point(ring[1]), { units: 'meters' });
  const h = turf.distance(turf.point(ring[1]), turf.point(ring[2]), { units: 'meters' });

  el.rectW.value = String(Math.round(w));
  el.rectH.value = String(Math.round(h));
}

if (el.rectApply) {
  el.rectApply.addEventListener('click', () => {
    if (!State.aoiFeature || !isRectAOI(State.aoiFeature)) return;

    const w = Number(el.rectW.value);
    const h = Number(el.rectH.value);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

    const center = turf.center(State.aoiFeature).geometry.coordinates;
    const ring = rectRingFromCenterSize(center, w, h);

    const all = draw.getAll();
    const id = all.features?.[0]?.id;
    if (!id) return;

    draw.setFeatureCoordinates(id, [ring]);
    map.fire('draw.update', { features: [draw.get(id)] });
  });
}

function renderPreview({ aoi, contours, roads, buildings, bbox, meta }) {
  clearPreview();
  setPreviewViewBox();

  const w = el.previewSvg.clientWidth || 800;
  const h = el.previewSvg.clientHeight || 800;
  const paddingPx = 24;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  el.previewSvg.appendChild(defs);

  const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clip.setAttribute('id', 'aoi-clip');
  defs.appendChild(clip);

  const ring = aoi?.geometry?.coordinates?.[0];
  if (ring && ring.length >= 4) {
    let d = '';
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = projectToScreen(ring[i], bbox, w, h, paddingPx);
      d += (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`);
    }
    d += 'Z';
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    clip.appendChild(p);
  }

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (ring && ring.length >= 4) g.setAttribute('clip-path', 'url(#aoi-clip)');
  g.setAttribute('opacity', String(CONFIG.PREVIEW_OPACITY));
  el.previewSvg.appendChild(g);

  // Buildings
  if (buildings) {
    for (const feat of buildings.features || []) {
      if (feat.geometry.type !== 'Polygon') continue;
      const ring0 = feat.geometry.coordinates?.[0];
      if (!ring0?.length) continue;

      let d = '';
      for (let i = 0; i < ring0.length; i++) {
        const [x, y] = projectToScreen(ring0[i], bbox, w, h, paddingPx);
        d += (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : `L${x.toFixed(2)},${y.toFixed(2)}`);
      }
      d += 'Z';

      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#333');
      p.setAttribute('stroke-width', '1');
      g.appendChild(p);
    }
  }

  // Roads
  if (roads) {
    for (const feat of roads.features || []) {
      if (feat.geometry.type !== 'LineString') continue;
      const d = geojsonLineToSvgPath(feat, bbox, w, h, paddingPx);
      if (!d) continue;

      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', '#222');
      p.setAttribute('stroke-width', '1');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('stroke-linecap', 'round');
      g.appendChild(p);
    }
  }

  // Contours
  if (contours?.levels) {
    const palette = el.palette.value;
    const reverse = el.reverse.value === '1';
    const singleOn = el.singleOn.value === '1';
    const singleColor = el.singleColor.value;
    const boldEvery = Number(el.boldEvery.value);
    const labelMode = el.labels.value;

    for (const lvl of contours.levels) {
      const elev = lvl.elev;
      const isBold = boldEvery > 0 && (Math.round(elev / meta.intervalM) % boldEvery === 0);
      const strokeW = isBold ? 1.2 : 0.8;

      let color = singleOn ? singleColor : colorForElevation(elev, meta.minElev, meta.maxElev, palette);
      if (!singleOn && reverse) {
        const t = (elev - meta.minElev) / Math.max(1e-9, (meta.maxElev - meta.minElev));
        const inv = meta.minElev + (1 - t) * (meta.maxElev - meta.minElev);
        color = colorForElevation(inv, meta.minElev, meta.maxElev, palette);
      }

      for (const feat of lvl.geojson.features) {
        if (feat.geometry.type !== 'MultiLineString') continue;
        for (const ls of feat.geometry.coordinates) {
          const f = turf.lineString(ls, { elev });
          const d = geojsonLineToSvgPath(f, bbox, w, h, paddingPx);
          if (!d) continue;

          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('d', d);
          p.setAttribute('fill', 'none');
          p.setAttribute('stroke', color);
          p.setAttribute('stroke-width', String(strokeW));
          p.setAttribute('stroke-linejoin', 'round');
          p.setAttribute('stroke-linecap', 'round');
          g.appendChild(p);

          const wantLabel = labelMode === 'all' || (labelMode === 'bold' && isBold);
          if (wantLabel && ls.length >= 2) {
            const mid = ls[Math.floor(ls.length / 2)];
            const [tx, ty] = projectToScreen(mid, bbox, w, h, paddingPx);
            const t0 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            t0.setAttribute('x', (tx + 2).toFixed(2));
            t0.setAttribute('y', ty.toFixed(2));
            t0.setAttribute('fill', color);
            t0.setAttribute('font-size', '10');
            t0.setAttribute('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace');
            t0.setAttribute('dominant-baseline', 'middle');
            t0.textContent = `${Math.round(elev)}${meta.units}`;
            g.appendChild(t0);
          }
        }
      }
    }
  }
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

el.generate.addEventListener('click', async () => {
  State.abort = new AbortController();
  el.cancel.disabled = false;

  try {
    assertAOI();
    const bbox = State.aoiBbox;

    log('Sampling elevation…');
    const grid = await sampleElevationGridForBbox(bbox);

    const units = el.units.value;
    const intervalRaw = Number(el.interval.value);
    const intervalM = units === 'ft' ? feetToMeters(intervalRaw) : intervalRaw;

    // D3 expects plain array
    const values = Array.from(grid.values, v => (Number.isFinite(v) ? v : 0));

    const thresholds = [];
    const minElev = Math.min(...values);
    const maxElev = Math.max(...values);

    const start = Math.floor(minElev / intervalM) * intervalM;
    const end = Math.ceil(maxElev / intervalM) * intervalM;
    for (let t = start; t <= end; t += intervalM) thresholds.push(t);

    log('Generating contours…');
    const contourGen = d3.contours().size([grid.nx, grid.ny]).thresholds(thresholds);
    const d3Contours = contourGen(values);

    const levels = [];
    for (const c of d3Contours) {
      const geo = contourGeoJSONFromD3([c], bbox, grid.nx, grid.ny);
      const simplified = turf.simplify(geo, { tolerance: 0.00008, highQuality: false });
      levels.push({ elev: c.value, geojson: turf.featureCollection([simplified]) });
    }

    const wantRoads = !!el.roads.checked;
    const wantBuildings = !!el.buildings.checked;

    log('Fetching overlays…');
    const { roads, buildings } = await fetchOverpassFeatures(bbox, wantRoads, wantBuildings, State.abort.signal);

    State.preview.contours = { levels };
    State.preview.roads = roads;
    State.preview.buildings = buildings;
    State.preview.meta = {
      intervalM,
      units: formatUnits(units),
      minElev,
      maxElev,
    };

    log('Rendering preview…');
    renderPreview({
      aoi: State.aoiFeature,
      contours: State.preview.contours,
      roads: State.preview.roads,
      buildings: State.preview.buildings,
      bbox,
      meta: State.preview.meta,
    });

    el.exportSvg.disabled = false;
    log('Done.');
  } catch (e) {
    if (e?.name === 'AbortError') {
      log('Cancelled.');
    } else {
      log(String(e?.message ?? e));
    }
  } finally {
    el.cancel.disabled = true;
    State.abort = null;
  }
});

el.exportSvg.addEventListener('click', () => {
  try {
    assertAOI();
    if (!State.preview?.contours || !State.preview?.meta) throw new Error('Preview missing');

    const svg = buildSvg({
      contours: State.preview.contours,
      roads: State.preview.roads,
      buildings: State.preview.buildings,
      bbox: State.aoiBbox,
      meta: State.preview.meta,
    });

    downloadTextFile('contours.svg', svg);
  } catch (e) {
    log(String(e?.message ?? e));
  }
});

if (el.cancel) {
  el.cancel.addEventListener('click', () => {
    if (State.abort) State.abort.abort();
  });
}

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