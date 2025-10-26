// public/js/labels.js
// Centered labels: find each panel's <g>/<path> by id, get its bbox, and put text at the centroid.
//
// Works with Maker.js export because it keeps model names as IDs.
// We search with an "ends-with" selector so both "Bottom" and "models_Bottom" match.

// Try to find a node for a named panel (g / path / any element) by id suffix.
import {NS} from "./panel/constants.js";

function findPanelNode(svg, name) {
    return (
        svg.querySelector(`g[id$="${name}"]`) ||
        svg.querySelector(`path[id$="${name}"]`) ||
        svg.querySelector(`[id$="${name}"]`)
    );
}

export function addLabels(svg, _params) {
    // Remove any previous labels layer to avoid duplicates
    svg.querySelector('#labelsLayer')?.remove();

    const layer = document.createElementNS(NS, 'g');
    layer.setAttribute('id', 'labelsLayer');
    svg.appendChild(layer);

    const names = ['Bottom', 'Lid', 'Front', 'Back', 'Left', 'Right'];

    names.forEach((name) => {
        const node = findPanelNode(svg, name);
        if (!node) return;

        const b = node.getBBox();

        // top-left corner just above panel bbox
        const fs = 4;                 // mm
        const gap = 1;                // mm vertical offset above the panel
        const x = b.x;                // left edge
        const y = b.y - gap;          // just above

        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', String(x));
        t.setAttribute('y', String(y));
        t.setAttribute('text-anchor', 'start');          // left-aligned
        t.setAttribute('dominant-baseline', 'alphabetic');

        // readable styling with thin non-scaling outline
        t.setAttribute('fill', '#6c6c6c');
        t.setAttribute('font-size', String(fs));
        t.setAttribute('font-family', 'ui-sans-serif, system-ui, Arial, Helvetica, sans-serif');
        t.setAttribute('stroke', 'white');
        t.setAttribute('stroke-width', '0.2');
        t.setAttribute('paint-order', 'stroke');
        t.setAttribute('vector-effect', 'non-scaling-stroke');

        t.textContent = name;
        layer.appendChild(t);
    });
}
