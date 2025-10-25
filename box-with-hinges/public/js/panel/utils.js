import { NS, UI_ATTR } from './constants.js';

export function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

export function findPanelNode(svg, name) {
    return (
        svg.querySelector(`g[id$="${name}"]`) ||
        svg.querySelector(`path[id$="${name}"]`) ||
        svg.querySelector(`[id$="${name}"]`)
    );
}
export function ensureLayer(svg, panelName, dblHandler) {
    const host = findPanelNode(svg, panelName);
    if (!host) return null;
    let layer = host.querySelector(`#pcLayer_${panelName}`);
    if (!layer) {
        layer = document.createElementNS(NS, 'g');
        layer.setAttribute('id', `pcLayer_${panelName}`);
        host.appendChild(layer);
    }
    layer.removeEventListener('dblclick', dblHandler);
    if (dblHandler) layer.addEventListener('dblclick', dblHandler);
    return layer;
}

export function computeGrid(panelBBox, layout) {
    const { x, y, width, height } = panelBBox;
    const pad = Math.max(0, Number(layout.padding) || 0);
    const inner = { x: x + pad, y: y + pad, w: Math.max(1, width - 2 * pad), h: Math.max(1, height - 2 * pad) };
    const rows = Math.max(1, Number(layout.rows) || 1);
    const cols = Math.max(1, Number(layout.cols) || 1);
    const gutter = Math.max(0, Number(layout.gutter) || 0);
    const cellW = (inner.w - gutter * (cols - 1)) / cols;
    const cellH = (inner.h - gutter * (rows - 1)) / rows;
    return { inner, rows, cols, gutter, cellW, cellH };
}
export function buildCellBox(grid, place) {
    const r0 = Math.max(1, place.row) - 1;
    const c0 = Math.max(1, place.col) - 1;
    const rs = Math.max(1, place.rowSpan || 1);
    const cs = Math.max(1, place.colSpan || 1);
    const x = grid.inner.x + c0 * (grid.cellW + grid.gutter);
    const y = grid.inner.y + r0 * (grid.cellH + grid.gutter);
    const w = grid.cellW * cs + grid.gutter * (cs - 1);
    const h = grid.cellH * rs + grid.gutter * (rs - 1);
    return { x, y, w, h };
}
export function alignInBox(box, node, alignH, alignV) {
    const b = node.getBBox();
    let tx = 0, ty = 0;
    if (alignH === 'left')   tx = box.x - b.x;
    if (alignH === 'center') tx = (box.x + box.w/2) - (b.x + b.width/2);
    if (alignH === 'right')  tx = (box.x + box.w) - (b.x + b.width);
    if (alignV === 'top')    ty = box.y - b.y;
    if (alignV === 'middle') ty = (box.y + box.h/2) - (b.y + b.height/2);
    if (alignV === 'bottom') ty = (box.y + box.h) - (b.y + b.height);
    const prev = node.getAttribute('transform') || '';
    node.setAttribute('transform', `${prev} translate(${tx} ${ty})`.trim());
}
export function mm(val, def = 0) {
    const v = Number(val);
    return Number.isFinite(v) ? v : def;
}
export function nid() { return 'it-' + Math.random().toString(36).slice(2, 9); }

export function bindSvgDeselect(svg, handler) {
    svg.removeEventListener('click', svg._pcAnyClick);
    svg._pcAnyClick = (e) => {
        if (e.target.closest('.pc-item')) return;
        if (e.target.closest(`[${UI_ATTR}]`)) return;
        handler();
    };
    svg.addEventListener('click', svg._pcAnyClick);
}
