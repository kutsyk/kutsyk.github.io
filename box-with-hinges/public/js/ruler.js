// public/js/ruler.js
// Top & left rulers synced with svg-pan-zoom. Values are model-space (mm).

import {NS} from "./panel/constants.js";

const BOX = 26;          // ruler thickness in px
const TARGET_PX = 70;    // desired pixels between minor ticks

export function initRulers(containerEl, svgEl) {
    // Ensure container can anchor absolutely-positioned overlays
    const s = containerEl.style;
    if (getComputedStyle(containerEl).position === 'static') {
        s.position = 'relative';
    }

    // Clean previous overlays
    containerEl.querySelectorAll('.ruler-overlay').forEach(n => n.remove());

    // --- Overlays -------------------------------------------------------
    const corner = document.createElement('div');
    corner.className = 'ruler-overlay ruler-corner ruler-box';
    corner.textContent = 'mm';
    applyCornerStyles(corner);
    containerEl.appendChild(corner);

    const topWrap = document.createElement('div');
    topWrap.className = 'ruler-overlay ruler-top ruler-box';
    applyTopStyles(topWrap);
    const topSvg = document.createElementNS(NS, 'svg');
    topSvg.classList.add('ruler-svg');
    topSvg.style.width = '100%';
    topSvg.style.height = '100%';
    topWrap.appendChild(topSvg);
    containerEl.appendChild(topWrap);

    const leftWrap = document.createElement('div');
    leftWrap.className = 'ruler-overlay ruler-left ruler-box';
    applyLeftStyles(leftWrap);
    const leftSvg = document.createElementNS(NS, 'svg');
    leftSvg.classList.add('ruler-svg');
    leftSvg.style.width = '100%';
    leftSvg.style.height = '100%';
    leftWrap.appendChild(leftSvg);
    containerEl.appendChild(leftWrap);

    function clear(el){ while (el.firstChild) el.removeChild(el.firstChild); }

    function getViewportCTM() {
        // Use the pan/zoom wrapper if present; else fallback to the root <svg>
        const vp = svgEl.querySelector('.svg-pan-zoom_viewport');
        return (vp || svgEl).getScreenCTM();
    }

    function update() {
        const rect = svgEl.getBoundingClientRect();

        // Size rulers to visible panel (excluding the opposite ruler band)
        const topWidth   = Math.max(0, rect.width  - BOX);
        const leftHeight = Math.max(0, rect.height - BOX);
        topSvg.setAttribute('viewBox', `0 0 ${topWidth} ${BOX}`);
        leftSvg.setAttribute('viewBox', `0 0 ${BOX} ${leftHeight}`);

        // Inverse CTM maps screen pixels -> model mm
        const ctm = getViewportCTM();
        if (!ctm) {
            // Draw empty guides so overlays are visible even before CTM is ready
            drawEmpty(topSvg, topWidth, BOX);
            drawEmpty(leftSvg, BOX, leftHeight);
            return;
        }
        const inv = ctm.inverse();
        const pt = svgEl.createSVGPoint();

        // Compute visible model-space ranges strictly inside the rulers:
        // Top ruler measures from (left + BOX) to (right) at a y just below the top band.
        pt.x = rect.left + BOX; pt.y = rect.top + BOX + 1;
        const ux0 = pt.matrixTransform(inv).x;
        pt.x = rect.right; pt.y = rect.top + BOX + 1;
        const ux1 = pt.matrixTransform(inv).x;

        // Left ruler measures from (top + BOX) to (bottom) at an x just right of the left band.
        pt.x = rect.left + BOX + 1; pt.y = rect.top + BOX;
        const uy0 = pt.matrixTransform(inv).y;
        pt.x = rect.left + BOX + 1; pt.y = rect.bottom;
        const uy1 = pt.matrixTransform(inv).y;

        // Normalize ranges
        const xMin = Math.min(ux0, ux1), xMax = Math.max(ux0, ux1);
        const yMin = Math.min(uy0, uy1), yMax = Math.max(uy0, uy1);

        // Choose nice steps so ticks ~TARGET_PX apart
        const unitsPerPxX = (xMax - xMin) / Math.max(1, topWidth);
        const unitsPerPxY = (yMax - yMin) / Math.max(1, leftHeight);
        const stepXminor = niceStep(unitsPerPxX * TARGET_PX);
        const stepYminor = niceStep(unitsPerPxY * TARGET_PX);
        const stepXmajor = stepXminor * 10;
        const stepYmajor = stepYminor * 10;

        // Draw
        clear(topSvg);
        drawTop(topSvg, xMin, xMax, stepXminor, stepXmajor, topWidth);

        clear(leftSvg);
        drawLeft(leftSvg, yMin, yMax, stepYminor, stepYmajor, leftHeight);
    }

    // Initial draw
    update();

    // Also update on window resize (in case container size changes)
    const onResize = () => update();
    window.addEventListener('resize', onResize);

    // Return controller; caller should call .update() on pan/zoom
    return { update };
}

// ---- Inline fallback styles (so it works even if CSS didn’t load) ----
function applyTopStyles(el) {
    el.style.position = 'absolute';
    el.style.zIndex = '20';
    el.style.pointerEvents = 'none';
    el.style.left = `${BOX}px`;
    el.style.right = '0';
    el.style.top = '0';
    el.style.height = `${BOX}px`;
    el.style.background = 'rgba(255,255,255,0.85)';
    el.style.border = '1px solid #e5e7eb';
}

function applyLeftStyles(el) {
    el.style.position = 'absolute';
    el.style.zIndex = '20';
    el.style.pointerEvents = 'none';
    el.style.left = '0';
    el.style.top = `${BOX}px`;
    el.style.bottom = '0';
    el.style.width = `${BOX}px`;
    el.style.background = 'rgba(255,255,255,0.85)';
    el.style.border = '1px solid #e5e7eb';
}

function applyCornerStyles(el) {
    el.style.position = 'absolute';
    el.style.zIndex = '20';
    el.style.pointerEvents = 'none';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = `${BOX}px`;
    el.style.height = `${BOX}px`;
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.background = 'rgba(255,255,255,0.85)';
    el.style.border = '1px solid #e5e7eb';
    el.style.font = '12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    el.style.color = '#6b7280';
}

// ---- Drawing helpers -------------------------------------------------

function drawEmpty(svg, w, h) {
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(w)); bg.setAttribute('height', String(h));
    bg.setAttribute('fill', 'transparent');
    svg.appendChild(bg);
}

function drawTop(svg, umin, umax, minor, major, widthPx) {
    const g = document.createElementNS(NS, 'g');
    svg.appendChild(g);

    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(widthPx)); bg.setAttribute('height', String(BOX));
    bg.setAttribute('fill', 'transparent');
    g.appendChild(bg);

    const start = Math.floor(umin / minor) * minor;
    const end   = Math.ceil(umax / minor) * minor;

    for (let v = start; v <= end + 1e-6; v += minor) {
        const x = ((v - umin) / (umax - umin)) * widthPx;
        const isMajor = nearlyMultiple(v, major);
        const tickH = isMajor ? 14 : 8;

        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', String(x)); line.setAttribute('x2', String(x));
        line.setAttribute('y1', String(BOX)); line.setAttribute('y2', String(BOX - tickH));
        line.setAttribute('stroke', '#9ca3af');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('shape-rendering', 'crispEdges');
        g.appendChild(line);

        if (isMajor) {
            const label = document.createElementNS(NS, 'text');
            label.setAttribute('x', String(x + 2));
            label.setAttribute('y', '11');
            label.setAttribute('fill', '#6b7280');
            label.setAttribute('font-size', '11');
            label.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial');
            label.textContent = fmt(v);
            g.appendChild(label);
        }
    }
}

function drawLeft(svg, umin, umax, minor, major, heightPx) {
    const g = document.createElementNS(NS, 'g');
    svg.appendChild(g);

    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(BOX)); bg.setAttribute('height', String(heightPx));
    bg.setAttribute('fill', 'transparent');
    g.appendChild(bg);

    const start = Math.floor(umin / minor) * minor;
    const end   = Math.ceil(umax / minor) * minor;

    for (let v = start; v <= end + 1e-6; v += minor) {
        const y = ((v - umin) / (umax - umin)) * heightPx; // downward
        const isMajor = nearlyMultiple(v, major);
        const tickW = isMajor ? 14 : 8;

        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', String(BOX)); line.setAttribute('x2', String(BOX - tickW));
        line.setAttribute('y1', String(y));   line.setAttribute('y2', String(y));
        line.setAttribute('stroke', '#9ca3af');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('shape-rendering', 'crispEdges');
        g.appendChild(line);

        if (isMajor) {
            const label = document.createElementNS(NS, 'text');
            label.setAttribute('x', '4');
            label.setAttribute('y', String(y - 2));
            label.setAttribute('fill', '#6b7280');
            label.setAttribute('font-size', '11');
            label.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial');
            label.textContent = fmt(v);
            g.appendChild(label);
        }
    }
}

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

function nearlyMultiple(value, step, eps = 1e-6) {
    const r = Math.abs(value / step - Math.round(value / step));
    return r < eps;
}

function fmt(n) {
    const s = (Math.round(n * 100) / 100).toFixed(2);
    return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}
