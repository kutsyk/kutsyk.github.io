import { state } from './state.js';

const ZOOM_STEP = 1.2;
const MIN_W = 10;

export function seedFromSvg(svg) {
    const v = svg.viewBox.baseVal;
    state.vb = { x: v.x, y: v.y, w: v.width, h: v.height };
    state.vbInit = { ...state.vb };
    apply(svg);
}

export function apply(svg) {
    const { x, y, w, h } = state.vb;
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    // Resize any grid rects to cover vb (grid.js reuses this)
    const gl = svg.querySelector('#gridLayer');
    if (gl) gl.querySelectorAll('rect').forEach(r => {
        r.setAttribute('x', x); r.setAttribute('y', y);
        r.setAttribute('width', w); r.setAttribute('height', h);
    });
}

export function fitToContent(svg, paddingMm=10) {
    const content = svg.querySelector('#contentLayer');
    const b = content.getBBox();
    state.vb = {
        x: b.x - paddingMm,
        y: b.y - paddingMm,
        w: b.width + 2*paddingMm,
        h: b.height + 2*paddingMm
    };
    state.vbInit = { ...state.vb };
    apply(svg);
}

export function zoomAt(svg, factor, clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top)  / rect.height;

    const newW = Math.max(MIN_W, state.vb.w / factor);
    const newH = Math.max((MIN_W * state.vb.h / state.vb.w), state.vb.h / factor);

    state.vb.x = state.vb.x + px * (state.vb.w - newW);
    state.vb.y = state.vb.y + py * (state.vb.h - newH);
    state.vb.w = newW; state.vb.h = newH;

    apply(svg);
}

export function attachPanZoom(svg, onZoomLabel) {
    let isPanning = false;
    let panStart = { x:0, y:0 };
    let panVbStart = { x:0, y:0 };

    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomAt(svg, e.deltaY < 0 ? ZOOM_STEP : (1/ZOOM_STEP), e.clientX, e.clientY);
        if (onZoomLabel) onZoomLabel();
    }, { passive: false });

    svg.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        panVbStart = { x: state.vb.x, y: state.vb.y };
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        const rect = svg.getBoundingClientRect();
        const dxPx = e.clientX - panStart.x;
        const dyPx = e.clientY - panStart.y;
        const sx = state.vb.w / rect.width;
        const sy = state.vb.h / rect.height;
        state.vb.x = panVbStart.x - dxPx * sx;
        state.vb.y = panVbStart.y - dyPx * sy;
        apply(svg);
    });

    window.addEventListener('mouseup', () => { isPanning = false; });
}

export function reset(svg) {
    if (!state.vbInit) return;
    state.vb = { ...state.vbInit };
    apply(svg);
}
