# Map Exporter v2

A separate static app; the original `/map-exporter/` is unchanged.

Serve the repository root with Python 3:

```sh
python3 -m http.server 8000 --directory /workspace/kutsyk.github.io
```

Open `/map-exporter-v2/` on your development server. No build or package installation is required.

## Workflow

Search for a place, select the current viewport, draw a rectangle by clicking two opposite corners, or enter west/south/east/north bounds. Choose layers and colors, then Build SVG. Selection and output settings are captured for the job; moving the map does not change it. Layer settings persist in local storage.

The map shows completed sections in green, fetching sections in amber, and failed sections in red. Cancel preserves completed sections in memory. Retry unfinished sections resumes the same job and settings. Starting a new job or closing the page discards that cache. Incomplete previews require an explicit action and their downloads are prefixed `INCOMPLETE_`.

Download a single layered SVG, or download independently clipped SVG tiles in a ZIP with a bounds manifest. Partial ZIP archives contain only completed tiles. ZIP uses uncompressed storage to avoid third-party dependencies. All output retains full geometry detail; simplification and URL-based settings sharing are deferred.

## Reliability and limits

- Initial grid: at most 0.12° per axis per tile, up to 256 initial tiles.
- Two concurrent tile fetches, three Overpass endpoint fallbacks, 45-second request timeout.
- Timeouts, oversized responses, and Overpass error remarks subdivide tiles, to depth 3 and at most 1,024 total tile records.
- Rate limits pause before fallback, honoring numeric Retry-After values up to 60 seconds; permission/network failures remain retryable without subdivision.
- Responses are capped at 16 MiB before JSON parsing; jobs are capped at 150,000 unique features. These safety limits are conservative, not guarantees of arbitrary-area support.
- Features deduplicate by OSM type and ID. Tile borders are clipped on export. Relations spanning tile boundaries use Overpass-provided member geometry.
- SVG generation and ZIP packaging run in a module Web Worker. Cancel terminates generation without losing fetched data.
- Longitude must stay within ±180°, latitude within ±85°. Date-line-crossing regions require separate exports.
- A single large SVG, preview, or ZIP can still use significant memory. Use smaller areas or fewer layers if the job reaches a limit.

External dependencies: MapLibre from unpkg.com; OpenStreetMap raster tiles and Nominatim; Overpass endpoints at overpass-api.de, overpass.kumi.systems, and overpass.private.coffee. No API key or backend is required. If the map library is unavailable, manual bounds and export still work.

## Validation

```sh
node map-exporter-v2/tests/tiles.test.mjs
node map-exporter-v2/tests/fetch.test.mjs
python3 map-exporter-v2/tests/browser_smoke.py
```

The browser smoke test requires Python Playwright, `/usr/bin/chromium`, and the local server on port 8000. It mocks external requests to deterministically exercise failures, resumable retry, deduplication, worker SVG output, partial downloads, ZIP integrity, preferences, and mobile layout. Real MapLibre initialization, rectangle selection, and a live Overpass export (63 building features near Lviv) were also checked separately through the configured proxy.
