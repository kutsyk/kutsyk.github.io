// js/panel/render.js
// Renders per-panel items (text/SVG) onto the target SVG panel layer.
// Adds dblclick on items → activate Object tab + enter edit.

import {panelState, pc_getLayout} from './state.js';
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

    const bbox = host.getBBox();

    // get validated, up-to-date layout (includes rowPercents/colPercents)
    const L = pc_getLayout(name);
    const mode = L.mode || 'grid';

    if (mode === 'grid') {
        const grid = computeGrid(bbox, L);
        panelState(name).items
            .filter(it => it.visible !== false)
            .forEach(it => {
                const place = it.grid || { row:1, col:1, rowSpan:1, colSpan:1 };
                const cell = buildCellBox(grid, place);
                let box = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
                box = pc_applyCellBoxTweaks(name, it, box);

                const node = it.type === 'text' ? renderText(layer, box, it)
                    : it.type === 'svg'  ? renderSvg(layer, box, it)
                        : null;
                if (node) decorateItemNodeForEditing(node, name, it.id);
            });
    } else {
        const p = panelState(name);
        p.items.filter(it => it.visible !== false).forEach(it => {
            let box = it.box || { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
            box = pc_applyCellBoxTweaks(name, it, box);

            const node = it.type === 'text' ? renderText(layer, box, it)
                : it.type === 'svg'  ? renderSvg(layer, box, it)
                    : null;
            if (node) decorateItemNodeForEditing(node, name, it.id);
        });
    }
}

export function renderAll(svg) {
    if (!svg) return;
    ['Bottom','Lid','Front','Back','Left','Right'].forEach(name => renderPanel(svg, name));
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

function computeGrid(panelBBox, layout) {
    const { x, y, width, height } = panelBBox;
    const pad = Math.max(0, Number(layout.padding) || 0);
    const rows = Math.max(1, Number(layout.rows) || 1);
    const cols = Math.max(1, Number(layout.cols) || 1);
    const gutter = Math.max(0, Number(layout.gutter) || 0);

    const inner = { x: x + pad, y: y + pad, w: Math.max(1, width - 2 * pad), h: Math.max(1, height - 2 * pad) };
    const availW = Math.max(0, inner.w - gutter * (cols - 1));
    const availH = Math.max(0, inner.h - gutter * (rows - 1));

    const rowP = (Array.isArray(layout.rowPercents) && layout.rowPercents.length === rows)
        ? layout.rowPercents : Array.from({length:rows}, () => 100 / rows);
    const colP = (Array.isArray(layout.colPercents) && layout.colPercents.length === cols)
        ? layout.colPercents : Array.from({length:cols}, () => 100 / cols);

    const rowPx = rowP.map(p => availH * (Math.max(0, Number(p)) / 100));
    const colPx = colP.map(p => availW * (Math.max(0, Number(p)) / 100));

    const rowY = new Array(rows).fill(0);
    for (let r = 1; r < rows; r++) rowY[r] = rowY[r - 1] + rowPx[r - 1] + gutter;

    const colX = new Array(cols).fill(0);
    for (let c = 1; c < cols; c++) colX[c] = colX[c - 1] + colPx[c - 1] + gutter;

    return { inner, rows, cols, gutter, rowPx, colPx, rowY, colX };
}

function buildCellBox(grid, place) {
    const r0 = Math.max(1, place.row) - 1;
    const c0 = Math.max(1, place.col) - 1;
    const rs = Math.max(1, place.rowSpan || 1);
    const cs = Math.max(1, place.colSpan || 1);

    const x = grid.inner.x + grid.colX[c0];
    const y = grid.inner.y + grid.rowY[r0];

    let w = 0; for (let c = 0; c < cs; c++) w += grid.colPx[c0 + c] || 0;
    let h = 0; for (let r = 0; r < rs; r++) h += grid.rowPx[r0 + r] || 0;

    w += grid.gutter * (cs - 1);
    h += grid.gutter * (rs - 1);

    return { x, y, w, h };
}

