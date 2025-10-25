import { els } from './dom.js';
import { findPanelNode, ensureLayer, clear, computeGrid, buildCellBox } from './utils.js';
import { renderGuides } from './guides.js';
import { renderText, renderSvg, addDeleteCross } from './renderers.js';
import { getSelectedItemId, getEditItemId, panelState } from './state.js';
import { PANELS } from './constants.js';
import { bus } from './signal-bus.js';

function onLayerDblclick(e) {
    const node = e.target.closest?.('.pc-item');
    if (!node) return;
    const id = node.getAttribute('data-item-id');
    if (!id) return;
    const enter = bus.getEnterEdit();
    if (enter) enter(bus.getCurrentPanel(), id);
}

export function renderPanel(svg, name) {
    const host = findPanelNode(svg, name);
    if (!host) return;

    const layer = ensureLayer(svg, name, onLayerDblclick);
    if (!layer) return;
    clear(layer);

    const p = panelState(name);
    const bbox = host.getBBox();
    const mode = p.layout?.mode || 'grid';

    if (mode === 'grid') {
        const grid = computeGrid(bbox, p.layout || {});
        renderGuides(layer, bbox, grid, !!els.showGuides?.checked);

        p.items.filter(it => it.visible !== false).forEach(it => {
            const place = it.grid || { row:1, col:1, rowSpan:1, colSpan:1 };
            const cell = buildCellBox(grid, place);
            const box = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
            const node = (it.type === 'text') ? renderText(layer, box, it)
                : (it.type === 'svg')  ? renderSvg(layer, box, it)
                    : null;

            if (node && (it.id === getSelectedItemId() || it.id === getEditItemId())) {
                addDeleteCross(layer, node, () => bus.requestDeleteItem(name, it.id));
            }
        });
    } else {
        if (!!els.showGuides?.checked) {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            g.setAttribute('x', String(bbox.x));
            g.setAttribute('y', String(bbox.y));
            g.setAttribute('width', String(bbox.width));
            g.setAttribute('height', String(bbox.height));
            g.setAttribute('fill', 'none');
            g.setAttribute('stroke', '#60a5fa');
            g.setAttribute('stroke-width', '0.2');
            g.setAttribute('stroke-dasharray', '1.5 1.5');
            g.setAttribute('data-pc-guide', '1');
            layer.appendChild(g);
        }

        p.items.filter(it => it.visible !== false).forEach(it => {
            const box = it.box || { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
            const node = (it.type === 'text') ? renderText(layer, box, it)
                : (it.type === 'svg')  ? renderSvg(layer, box, it)
                    : null;

            if (node && (it.id === getSelectedItemId() || it.id === getEditItemId())) {
                addDeleteCross(layer, node, () => bus.requestDeleteItem(name, it.id));
            }
        });
    }
}

export function renderAll(svg) {
    if (!svg) return;
    PANELS.forEach(name => renderPanel(svg, name));
}
