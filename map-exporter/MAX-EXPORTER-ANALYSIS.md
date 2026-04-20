# max-exporter code analysis

> Note: there is no `max-exporter/` directory in this repository. This analysis is for `map-exporter/`, which is likely what was intended.

## Executive summary

`map-exporter` is a browser-only map-to-SVG export tool built around four modules:

1. `main.js` orchestrates UI, map setup, export workflow, progress, cancellation, retry, and a small in-memory cache.
2. `overpass.js` builds Overpass QL queries and fetches OSM data with fallback endpoints + timeout + abort support.
3. `frame.js` manages an optional draggable export frame to constrain the target bounding box.
4. `svg.js` transforms OSM geometries into layered SVG paths with optional clipping to the active frame.

Overall, the codebase is cleanly modular and practical for medium-size exports. The largest quality concerns are: bbox edge cases around antimeridian/polar regions, potentially expensive client-side processing on very large exports, and a few brittle assumptions around geometry structure.

## Architecture and flow

### 1) App bootstrap and state ownership

`bootstrapApp()` initializes date UI, map, search, frame controls, and export controls. State is mostly closure-scoped in `initPreviewExport()`, which keeps the global surface small and avoids accidental cross-module coupling.

### 2) Export pipeline

The export sequence is:

1. Read options (`getSelections`) and current bbox (`frameApi.getActiveBBox`).
2. Compute a cache key and attempt cache hit.
3. Fetch elements from Overpass if needed (`fetchElementsForBBox`).
4. Build layered SVG (`buildSVG`) while surfacing progress callbacks.
5. Trigger client-side download (`downloadSVG`).

This is a robust and understandable flow; the stage/progress design gives users confidence during long operations.

### 3) Frame system

`frame.js` overlays a draggable rectangle and two corner handles + one center handle. The implementation is straightforward and updates both map layer and marker positions continuously.

### 4) SVG generation model

`svg.js` projects lon/lat into Web Mercator meters, scales to fit the output canvas with padding, and emits SVG path elements by semantic layer (parks, water, buildings, major roads, minor roads).

It supports relation multipolygons with outer/inner rings and uses `fill-rule="evenodd"` where relevant.

## Strengths

- **Good separation of concerns:** UI orchestration, data fetching, frame control, and rendering are in separate modules.
- **Operational resilience:** Overpass endpoint fallback and per-request timeout improve reliability.
- **User experience:** export estimate, stage/progress log, cancel/retry, and preview are meaningful quality-of-life features.
- **Performance-minded touches:** small LRU-like cache (size 5), progress throttling by stages, and cancellation checks inside long loops.

## Risks and weaknesses

1. **Antimeridian and geographic edge cases**
   - BBox handling assumes `west <= east` and ordinary latitude ranges; crossing the dateline may produce incorrect area estimation and projection behavior.

2. **Projection robustness near poles**
   - `lat2y` uses a direct Mercator formula without clamping latitude (typically ±85.05113°), which can blow up near ±90°.

3. **Heavy client-side memory/CPU cost**
   - Large bbox + high resolution + many features can stress the browser because all filtering and path construction happen in JS on the main thread.

4. **Geometry assumptions**
   - Several paths expect `way.geometry` or relation member geometry to be well-formed. Nonstandard/incomplete payloads are mostly skipped, but not deeply validated.

5. **Cache key granularity**
   - Cache key rounds bbox to 5 decimals, which is reasonable, but can cause accidental misses/hits depending on user drag precision and expected determinism.

## Maintainability assessment

- **Readability:** high; naming and structure are clear.
- **Extensibility:** moderate-to-high; adding a new thematic layer is straightforward in both query and render stages.
- **Testability:** currently low because modules rely on DOM and browser globals; there is no test harness for pure logic (query generation, projection, layer classification).

## Recommended improvements (priority order)

1. **Harden geographic math**
   - Clamp latitude before Mercator conversion.
   - Explicitly guard antimeridian-crossing bbox logic in `frame`/`svg`/estimate code.

2. **Move expensive work off the main thread**
   - Build SVG in a Web Worker (or chunked microtasks) for better responsiveness on heavy exports.

3. **Add feature-count and node-count guardrails**
   - Warn or block when estimated element count exceeds safe thresholds.

4. **Improve cache policy**
   - Keep current behavior, but track rough element weight and evict heaviest/oldest blend instead of strict insertion order.

5. **Add lightweight tests for pure functions**
   - `buildOverpassBBox`, predicates, and projection helpers can be unit-tested without browser context.

## Quick module-by-module notes

- `main.js`: solid orchestration, good lifecycle handling in `try/catch/finally`.
- `overpass.js`: strong endpoint fallback design; could expose endpoint metrics for diagnostics.
- `frame.js`: simple and effective, but bbox normalization should become a shared utility.
- `svg.js`: good layer output and multipolygon support; needs latitude clamping and optional simplification for large path counts.

## Bottom line

`map-exporter` is a good-quality client-side exporter with thoughtful UX and practical reliability mechanisms. With geospatial edge-case hardening and worker-based rendering, it can become significantly more robust for large or unusual map selections.
