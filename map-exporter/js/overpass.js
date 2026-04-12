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
  if (want.motorway) roadClasses.push('motorway');
  if (want.trunk) roadClasses.push('trunk');
  if (want.primary) roadClasses.push('primary');
  if (want.secondary) roadClasses.push('secondary');
  if (want.tertiary) roadClasses.push('tertiary');
  if (want.local) roadClasses.push('residential', 'unclassified', 'service', 'living_street');

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

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export async function fetchElementsForBBox(bbox, want) {
  const ovp = buildOverpassBBox(bbox, want);
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  let lastErr = null;
  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `data=${encodeURIComponent(ovp)}`,
        signal: timeoutSignal(120000)
      });

      if (resp.status === 429 || resp.status >= 500) throw new Error(`HTTP ${resp.status}`);
      if (!resp.ok) {
        const txt = (await resp.text()).slice(0, 180);
        throw new Error(`HTTP ${resp.status}${txt ? `: ${txt}` : ''}`);
      }

      const elements = (await resp.json()).elements || [];
      return elements;
    } catch (e) {
      lastErr = `${endpoint} failed: ${e && e.message ? e.message : e}`;
      if (i < endpoints.length - 1) {
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
  }

  throw new Error(`All Overpass endpoints failed. ${lastErr || ''}`.trim());
}
