export const predicates = {
  isPark: (t) => t && (t.leisure === 'park' || t.landuse === 'grass' || t.landuse === 'recreation_ground'),
  isWaterPolygon: (t) => t && (t.natural === 'water' || t.waterway === 'riverbank'),
  isWaterLine: (t) => t && /^(river|stream|canal)$/.test(t.waterway || ''),
  highwayEq: (t, val) => t && t.highway === val,
  isLocalRoad: (t) => t && /^(residential|unclassified|service|living_street)$/.test(t.highway || ''),
  isBuilding: (t) => t && !!t.building
};

export function buildOverpassBBox(b, want) {
  const west = b.getWest();
  const south = b.getSouth();
  const east = b.getEast();
  const north = b.getNorth();

  const parts = [];
  if (want.parks) {
    parts.push(
      `way["leisure"="park"](${south},${west},${north},${east});`,
      `relation["leisure"="park"](${south},${west},${north},${east});`,
      `way["landuse"="grass"](${south},${west},${north},${east});`,
      `relation["landuse"="grass"](${south},${west},${north},${east});`,
      `way["landuse"="recreation_ground"](${south},${west},${north},${east});`,
      `relation["landuse"="recreation_ground"](${south},${west},${north},${east});`
    );
  }

  if (want.water) {
    parts.push(
      `way["natural"="water"](${south},${west},${north},${east});`,
      `relation["natural"="water"](${south},${west},${north},${east});`,
      `way["waterway"="riverbank"](${south},${west},${north},${east});`,
      `relation["waterway"="riverbank"](${south},${west},${north},${east});`,
      `way["waterway"~"^(river|stream|canal)$"](${south},${west},${north},${east});`
    );
  }

  if (want.buildings) {
    parts.push(
      `way["building"](${south},${west},${north},${east});`,
      `relation["building"](${south},${west},${north},${east});`
    );
  }

  const roadClasses = [];
  if (want.majorRoads) roadClasses.push('motorway', 'trunk', 'primary');
  if (want.minorRoads) roadClasses.push('secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street');

  if (roadClasses.length) {
    const roadRegex = `^(${Array.from(new Set(roadClasses)).join('|')})$`;
    parts.push(`way["highway"~"${roadRegex}"](${south},${west},${north},${east});`);
  }

  const body = parts.join('\n  ');
  return `
[out:json][timeout:180];
(
  ${body}
);
out body geom;`;
}

function timeoutController(ms) {
  const c = new AbortController();
  const timerId = setTimeout(() => c.abort(new Error('Request timeout')), ms);
  return { controller: c, timerId };
}

function linkAbortSignals(primarySignal, secondarySignal) {
  if (!primarySignal && !secondarySignal) return { signal: null, cleanup: () => {} };
  if (!primarySignal) return { signal: secondarySignal, cleanup: () => {} };
  if (!secondarySignal) return { signal: primarySignal, cleanup: () => {} };

  const c = new AbortController();
  const onAbort = () => c.abort();
  primarySignal.addEventListener('abort', onAbort);
  secondarySignal.addEventListener('abort', onAbort);
  return {
    signal: c.signal,
    cleanup: () => {
      primarySignal.removeEventListener('abort', onAbort);
      secondarySignal.removeEventListener('abort', onAbort);
    }
  };
}

export async function fetchElementsForBBox(bbox, want, opts = {}) {
  const {
    signal: externalSignal = null,
    onAttempt = null,
    onChunk = null,
    forceChunking = false
  } = opts;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  const bounds = {
    west: bbox.getWest(),
    south: bbox.getSouth(),
    east: bbox.getEast(),
    north: bbox.getNorth()
  };

  const width = Math.abs(bounds.east - bounds.west);
  const height = Math.abs(bounds.north - bounds.south);
  const area = width * height;
  const shouldChunk = forceChunking || area > 1.8 || width > 1.8 || height > 1.8;
  const activeChunkEndpoints = endpoints.filter((e) => !e.includes('private.coffee'));
  const chunkEndpoints = activeChunkEndpoints.length ? activeChunkEndpoints : endpoints;

  if (!shouldChunk) {
    const ovp = buildOverpassBBox(bbox, want);
    try {
      return await fetchWithFallbackEndpoints(ovp, endpoints, {
        signal: externalSignal,
        timeoutMs: 120000,
        onAttempt
      });
    } catch (err) {
      // If a single request fails (typically 504/429 on busy endpoints),
      // fall back to adaptive chunking to improve reliability for larger cities.
      return fetchByAdaptiveChunks(bounds, want, {
        signal: externalSignal,
        onAttempt,
        onChunk,
        endpoints: chunkEndpoints,
        initialGrid: chooseChunkGrid(Math.max(width, 1.9), Math.max(height, 1.9)),
        maxDepth: 3,
        lastError: err
      });
    }
  }

  const chunkGrid = chooseChunkGrid(width, height);
  return fetchByAdaptiveChunks(bounds, want, {
    signal: externalSignal,
    onAttempt,
    onChunk,
    endpoints: chunkEndpoints,
    initialGrid: chunkGrid,
    maxDepth: 3
  });
}

async function fetchByAdaptiveChunks(bounds, want, opts = {}) {
  const {
    signal: externalSignal = null,
    onAttempt = null,
    onChunk = null,
    endpoints = [],
    initialGrid = { cols: 2, rows: 2 },
    maxDepth = 3,
    lastError = null
  } = opts;

  const queue = splitBBox(bounds, initialGrid.cols, initialGrid.rows)
    .map((bbox) => ({ bbox, depth: 0, cols: initialGrid.cols, rows: initialGrid.rows }));
  const merged = new Map();
  let processed = 0;

  while (queue.length) {
    if (externalSignal && externalSignal.aborted) throw new Error('Export was canceled');
    const current = queue.shift();
    processed += 1;

    if (onChunk) {
      onChunk({
        index: processed - 1,
        total: processed - 1 + queue.length + 1,
        bbox: current.bbox,
        cols: current.cols,
        rows: current.rows,
        depth: current.depth
      });
    }

    const chunkBBox = {
      getWest: () => current.bbox.west,
      getSouth: () => current.bbox.south,
      getEast: () => current.bbox.east,
      getNorth: () => current.bbox.north
    };

    try {
      const ovp = buildOverpassBBox(chunkBBox, want);
      const chunkElements = await fetchWithFallbackEndpoints(ovp, endpoints, {
        signal: externalSignal,
        timeoutMs: 90000,
        onAttempt: onAttempt
          ? ({ endpoint }) => onAttempt({
            endpoint,
            index: processed - 1,
            total: processed - 1 + queue.length + 1,
            isChunkAttempt: true,
            depth: current.depth
          })
          : null
      });

      for (const el of chunkElements) {
        const k = `${el.type}:${el.id}`;
        if (!merged.has(k)) merged.set(k, el);
      }
    } catch (err) {
      if (current.depth >= maxDepth) {
        const rootErr = lastError || err;
        throw new Error(
          `Failed to fetch a map chunk after ${maxDepth + 1} attempts. ${rootErr && rootErr.message ? rootErr.message : rootErr}`
        );
      }

      const subChunks = splitBBox(current.bbox, 2, 2)
        .map((bbox) => ({ bbox, depth: current.depth + 1, cols: 2, rows: 2 }));
      queue.unshift(...subChunks);
    }
  }

  return Array.from(merged.values());
}

function chooseChunkGrid(width, height) {
  const longest = Math.max(width, height);
  const area = width * height;
  if (area > 12 || longest > 6) return { cols: 6, rows: 6 };
  if (area > 6 || longest > 4) return { cols: 5, rows: 5 };
  if (area > 3 || longest > 2.6) return { cols: 4, rows: 4 };
  if (area > 1.8 || longest > 1.8) return { cols: 3, rows: 3 };
  return { cols: 2, rows: 2 };
}

function splitBBox(bounds, cols, rows) {
  const out = [];
  const dx = (bounds.east - bounds.west) / cols;
  const dy = (bounds.north - bounds.south) / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const west = bounds.west + dx * col;
      const east = col === cols - 1 ? bounds.east : bounds.west + dx * (col + 1);
      const south = bounds.south + dy * row;
      const north = row === rows - 1 ? bounds.north : bounds.south + dy * (row + 1);
      out.push({ west, south, east, north });
    }
  }
  return out;
}

async function fetchWithFallbackEndpoints(ovp, endpoints, opts = {}) {
  const { signal: externalSignal = null, timeoutMs = 120000, onAttempt = null } = opts;
  let lastErr = null;

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    if (externalSignal && externalSignal.aborted) throw new Error('Export was canceled');
    let timerId = null;
    let cleanup = () => {};
    try {
      if (onAttempt) onAttempt({ endpoint, index: i, total: endpoints.length });
      const timeout = timeoutController(timeoutMs);
      timerId = timeout.timerId;
      const linked = linkAbortSignals(externalSignal, timeout.controller.signal);
      cleanup = linked.cleanup;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `data=${encodeURIComponent(ovp)}`,
        signal: linked.signal || undefined
      });
      clearTimeout(timerId);

      if (resp.status === 429 || resp.status >= 500) throw new Error(`HTTP ${resp.status}`);
      if (!resp.ok) {
        const txt = (await resp.text()).slice(0, 180);
        throw new Error(`HTTP ${resp.status}${txt ? `: ${txt}` : ''}`);
      }

      const elements = (await resp.json()).elements || [];
      return elements;
    } catch (e) {
      if (externalSignal && externalSignal.aborted) throw new Error('Export was canceled');
      lastErr = `${endpoint} failed: ${e && e.message ? e.message : e}`;
      if (i < endpoints.length - 1) {
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    } finally {
      if (timerId) clearTimeout(timerId);
      cleanup();
    }
  }

  throw new Error(`All Overpass endpoints failed. ${lastErr || ''}`.trim());
}
