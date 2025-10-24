// public/js/grid.js
// Infinite background grid with 3 layers:
//  - minor: adaptive 1–2–5 stepped
//  - major: adaptive (10 × minor)
//  - hundreds: fixed 100 mm, aligned to (0,0) so it matches the rulers' zero

export function initInfiniteGrid(svg, getZoom, getBaseViewboxWidth) {
    // Cleanup previous instances
    svg.querySelector('#gridDefs')?.remove();
    svg.querySelector('#gridLayer')?.remove();

    // --- <defs> with three patterns (minor / major / hundreds) ---
    const defs = document.createElementNS(svg.namespaceURI, 'defs');
    defs.setAttribute('id', 'gridDefs');

    // Minor pattern
    const pMinor = document.createElementNS(svg.namespaceURI, 'pattern');
    pMinor.setAttribute('id', 'gridMinor');
    pMinor.setAttribute('patternUnits', 'userSpaceOnUse');

    const pmPath = document.createElementNS(svg.namespaceURI, 'path');
    pmPath.setAttribute('fill', 'none');
    pmPath.setAttribute('stroke', '#e5e7eb');     // light gray
    pmPath.setAttribute('stroke-width', '0.05');  // very thin

    pMinor.appendChild(pmPath);

    // Major pattern (10x minor)
    const pMajor = document.createElementNS(svg.namespaceURI, 'pattern');
    pMajor.setAttribute('id', 'gridMajor');
    pMajor.setAttribute('patternUnits', 'userSpaceOnUse');

    const pMPath = document.createElementNS(svg.namespaceURI, 'path');
    pMPath.setAttribute('fill', 'none');
    pMPath.setAttribute('stroke', '#cbd5e1');     // a bit darker
    pMPath.setAttribute('stroke-width', '0.1');

    pMajor.appendChild(pMPath);

    // Hundreds pattern (fixed 100 mm), aligned to origin
    const pHundreds = document.createElementNS(svg.namespaceURI, 'pattern');
    pHundreds.setAttribute('id', 'gridHundreds');
    pHundreds.setAttribute('patternUnits', 'userSpaceOnUse');

    const pHPath = document.createElementNS(svg.namespaceURI, 'path');
    pHPath.setAttribute('fill', 'none');
    pHPath.setAttribute('stroke', '#94a3b8');     // slate-400
    pHPath.setAttribute('stroke-width', '0.3');   // boldest of the three

    pHundreds.appendChild(pHPath);

    defs.appendChild(pMinor);
    defs.appendChild(pMajor);
    defs.appendChild(pHundreds);
    svg.insertBefore(defs, svg.firstChild);

    // --- Huge background rects (makes the grid look "infinite") ---
    const layer = document.createElementNS(svg.namespaceURI, 'g');
    layer.setAttribute('id', 'gridLayer');

    const BIG = 200000; // 200 meters in mm – effectively infinite

    const bgMajor = document.createElementNS(svg.namespaceURI, 'rect');
    bgMajor.setAttribute('x', String(-BIG));
    bgMajor.setAttribute('y', String(-BIG));
    bgMajor.setAttribute('width', String(2 * BIG));
    bgMajor.setAttribute('height', String(2 * BIG));
    bgMajor.setAttribute('fill', 'url(#gridMajor)');

    const bgMinor = document.createElementNS(svg.namespaceURI, 'rect');
    bgMinor.setAttribute('x', String(-BIG));
    bgMinor.setAttribute('y', String(-BIG));
    bgMinor.setAttribute('width', String(2 * BIG));
    bgMinor.setAttribute('height', String(2 * BIG));
    bgMinor.setAttribute('fill', 'url(#gridMinor)');

    const bgHundreds = document.createElementNS(svg.namespaceURI, 'rect');
    bgHundreds.setAttribute('x', String(-BIG));
    bgHundreds.setAttribute('y', String(-BIG));
    bgHundreds.setAttribute('width', String(2 * BIG));
    bgHundreds.setAttribute('height', String(2 * BIG));
    bgHundreds.setAttribute('fill', 'url(#gridHundreds)');

    // Order: major, minor, hundreds (hundreds on top so it's most visible)
    layer.appendChild(bgMajor);
    layer.appendChild(bgMinor);
    layer.appendChild(bgHundreds);

    // Insert grid *behind* geometry: before #contentLayer so it’s under the parts
    const content = svg.querySelector('#contentLayer');
    if (content) svg.insertBefore(layer, content); else svg.appendChild(layer);

    // --- Updater: set adaptive steps + fixed 100 mm grid ---
    function update() {
        const zoom = getZoom();                 // e.g. svgPanZoom.getZoom()
        const baseW = getBaseViewboxWidth();    // fitted viewBox width at zoom = 1
        const visibleW = baseW / Math.max(zoom, 1e-6);

        // Aim for ~60 minor cells across the visible width
        const targetLines = 60;
        const rawStep = visibleW / targetLines;

        const minor = niceStep(rawStep);        // 1–2–5 series
        const major = minor * 10;

        // Update minor pattern
        pMinor.setAttribute('width', String(minor));
        pMinor.setAttribute('height', String(minor));
        // Draw lines on right & bottom edges of the tile
        pmPath.setAttribute('d', `M ${minor} 0 L 0 0 0 ${minor}`);

        // Update major pattern
        pMajor.setAttribute('width', String(major));
        pMajor.setAttribute('height', String(major));
        pMPath.setAttribute('d', `M ${major} 0 L 0 0 0 ${major}`);

        // Fixed 100 mm bold grid, aligned to (0,0)
        const hundred = 100;
        pHundreds.setAttribute('width', String(hundred));
        pHundreds.setAttribute('height', String(hundred));
        pHPath.setAttribute('d', `M ${hundred} 0 L 0 0 0 ${hundred}`);

        // Return current minor step for UI readout
        return minor;
    }

    // Initialize once
    const currentMinor = update();

    return {
        update,
        currentMinor
    };
}

// 1–2–5 step chooser for pleasing grid spacing
function niceStep(step) {
    const pow = Math.pow(10, Math.floor(Math.log10(step)));
    const n = step / pow;
    let m;
    if (n < 1.5) m = 1;
    else if (n < 3.5) m = 2;
    else if (n < 7.5) m = 5;
    else m = 10;
    return m * pow;
}
