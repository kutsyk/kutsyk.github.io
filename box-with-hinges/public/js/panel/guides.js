import { NS } from './constants.js';

export function renderGuides(layer, _panelBBox, grid, visible) {
    if (!visible) return;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('id', 'pcGuides');
    g.setAttribute('data-pc-guide', '1');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', '#60a5fa');
    g.setAttribute('stroke-width', '0.2');
    g.setAttribute('stroke-dasharray', '1.5 1.5');

    const outer = document.createElementNS(NS, 'rect');
    outer.setAttribute('x', String(grid.inner.x));
    outer.setAttribute('y', String(grid.inner.y));
    outer.setAttribute('width', String(grid.inner.w));
    outer.setAttribute('height', String(grid.inner.h));
    g.appendChild(outer);

    for (let r = 1; r < grid.rows; r++) {
        const y = grid.inner.y + r * grid.cellH + (r - 1) * grid.gutter + (grid.gutter / 2);
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', String(grid.inner.x));
        line.setAttribute('x2', String(grid.inner.x + grid.inner.w));
        line.setAttribute('y1', String(y));
        line.setAttribute('y2', String(y));
        g.appendChild(line);
    }
    for (let c = 1; c < grid.cols; c++) {
        const x = grid.inner.x + c * grid.cellW + (c - 1) * grid.gutter + (grid.gutter / 2);
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('y1', String(grid.inner.y));
        line.setAttribute('y2', String(grid.inner.y + grid.inner.h));
        line.setAttribute('x1', String(x));
        line.setAttribute('x2', String(x));
        g.appendChild(line);
    }

    layer.appendChild(g);
}
