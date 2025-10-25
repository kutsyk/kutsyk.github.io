// js/panel/render.js
// Renders per-panel items (text/SVG) onto the target SVG panel layer.
// Adds dblclick on items → activate Object tab + enter edit.

import { panelState } from './state.js';
import { renderText, renderSvg } from './renderers.js';
import { findPanelNode, ensureLayer, clear } from './utils.js';
import { pc_applyCellBoxTweaks } from './../panel-state-bridge.js';

const NS = 'http://www.w3.org/2000/svg';

export function renderPanel(svg, name) {
    const host = findPanelNode(svg, name);
    if (!host) return;

    const layer = ensureLayer(svg, name);
    if (!layer) return;
    clear(layer);

    const p = panelState(name);
    const bbox = host.getBBox();
    const mode = p.layout?.mode || 'grid';

    if (mode === 'grid') {
        const grid = computeGrid(bbox, p.layout || {});
        p.items.filter(it => it.visible !== false).forEach(it => {
            const place = it.grid || { row:1, col:1, rowSpan:1, colSpan:1 };
            const cell = buildCellBox(grid, place);
            let box = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };

            // apply per-cell tweaks (inner padding, align overrides)
            box = pc_applyCellBoxTweaks(name, it, box);

            const node = (it.type === 'text')
                ? renderText(layer, box, it)
                : (it.type === 'svg')
                    ? renderSvg(layer, box, it)
                    : null;

            if (node) decorateItemNodeForEditing(node, name, it.id);
        });
    } else {
        p.items.filter(it => it.visible !== false).forEach(it => {
            let box = it.box || { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };

            // apply per-cell tweaks (noop for free items unless configured)
            box = pc_applyCellBoxTweaks(name, it, box);

            const node = (it.type === 'text')
                ? renderText(layer, box, it)
                : (it.type === 'svg')
                    ? renderSvg(layer, box, it)
                    : null;

            if (node) decorateItemNodeForEditing(node, name, it.id);
        });
    }
}

export function renderAll(svg) {
    if (!svg) return;
    ['Bottom','Lid','Front','Back','Left','Right'].forEach(name => renderPanel(svg, name));
}

// ---- helpers (duplicated from pre-refactor content) ----
function computeGrid(panelBBox, layout) {
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
function buildCellBox(grid, place) {
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

// ---- dblclick hook for items ----
function decorateItemNodeForEditing(node, panelName, itemId) {
    node.classList.add('pc-item');
    node.setAttribute('data-item-id', itemId);
    node.setAttribute('pointer-events', 'all');

    node.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        import('../panel-content.js').then(mod => {
            if (mod.pc_activateEditorTab) mod.pc_activateEditorTab('object');
            if (mod.pc_enterEdit) mod.pc_enterEdit(panelName, itemId);
        }).catch(()=>{});
    }, { capture: true });
}
