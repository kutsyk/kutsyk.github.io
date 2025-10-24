// public/js/labels.js
// Centered labels: find each panel's <g>/<path> by id, get its bbox, and put text at the centroid.
//
// Works with Maker.js export because it keeps model names as IDs.
// We search with an "ends-with" selector so both "Bottom" and "models_Bottom" match.

const NAMESPACE = 'http://www.w3.org/2000/svg';

// Try to find a node for a named panel (g / path / any element) by id suffix.
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

    const layer = document.createElementNS(NAMESPACE, 'g');
    layer.setAttribute('id', 'labelsLayer');
    svg.appendChild(layer);

    const names = ['Bottom', 'Lid', 'Front', 'Back', 'Left', 'Right'];

    names.forEach((name) => {
        const node = findPanelNode(svg, name);
        if (!node) return;

        // Get the panel's bbox in current user units (mm)
        const b = node.getBBox();
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;

        // Create centered text
        const t = document.createElementNS(NAMESPACE, 'text');
        t.setAttribute('x', String(cx));
        t.setAttribute('y', String(cy));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');

        // Styling: readable, blue fill, subtle white outline (non-scaling stroke)
        t.setAttribute('fill', '#0d6efd'); // bootstrap-ish blue
        t.setAttribute('font-size', '4');  // mm; tweak if you like
        t.setAttribute('font-family', 'ui-sans-serif, system-ui, Arial, Helvetica, sans-serif');
        t.setAttribute('stroke', 'white');
        t.setAttribute('stroke-width', '0.2');
        t.setAttribute('paint-order', 'stroke'); // draw stroke under fill
        t.setAttribute('vector-effect', 'non-scaling-stroke'); // keep outline thin when zooming

        t.textContent = name;
        layer.appendChild(t);
    });
}
