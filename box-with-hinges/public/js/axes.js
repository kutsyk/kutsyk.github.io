import { state } from './state.js';

export function rebuildAxes(svg) {
    svg.querySelector('#axesLayer')?.remove();
    if (!state.axesEnabled) return;

    const g = document.createElementNS(svg.namespaceURI, 'g');
    g.setAttribute('id', 'axesLayer');
    g.setAttribute('stroke', '#6e7781');
    g.setAttribute('stroke-width', '0.15');

    const xLine = document.createElementNS(svg.namespaceURI, 'line');
    xLine.setAttribute('x1', String(state.vb.x));
    xLine.setAttribute('y1', '0');
    xLine.setAttribute('x2', String(state.vb.x + state.vb.w));
    xLine.setAttribute('y2', '0');

    const yLine = document.createElementNS(svg.namespaceURI, 'line');
    yLine.setAttribute('x1', '0');
    yLine.setAttribute('y1', String(state.vb.y));
    yLine.setAttribute('x2', '0');
    yLine.setAttribute('y2', String(state.vb.y + state.vb.h));

    g.appendChild(xLine); g.appendChild(yLine);

    // origin dot
    const dot = document.createElementNS(svg.namespaceURI, 'circle');
    dot.setAttribute('cx', '0'); dot.setAttribute('cy', '0'); dot.setAttribute('r', '0.6');
    dot.setAttribute('fill', '#6e7781');
    g.appendChild(dot);

    // place after grid
    const after = svg.querySelector('#gridLayer');
    if (after) after.after(g); else svg.insertBefore(g, svg.firstChild);
}
