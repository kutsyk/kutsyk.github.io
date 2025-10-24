// public/js/renderer.js
export function mountSvg(rawSvgText, outEl) {
    outEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.innerHTML = rawSvgText;
    const svg = wrap.firstElementChild;

    // flex sizing for the preview panel
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = '100%';

    // sane defaults
    svg.setAttribute('stroke', '#111');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke-width', '0.35');
    svg.setAttribute('stroke-linejoin', 'miter');
    svg.setAttribute('stroke-miterlimit', '8');

    // ensure viewBox exists
    if (!svg.getAttribute('viewBox')) {
        const w = parseFloat(svg.getAttribute('width') || '1000');
        const h = parseFloat(svg.getAttribute('height') || '1000');
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }

    // collect all children into contentLayer (for bbox fit)
    const contentLayer = document.createElementNS(svg.namespaceURI, 'g');
    contentLayer.setAttribute('id', 'contentLayer');
    while (svg.firstChild) contentLayer.appendChild(svg.firstChild);
    svg.appendChild(contentLayer);

    outEl.appendChild(svg);
    return svg;
}

export function colorPanels(svg) {
    // const palette = {
    //     Bottom: '#ef4444',  // red
    //     Lid:    '#10b981',  // emerald
    //     Front:  '#3b82f6',  // blue
    //     Back:   '#8b5cf6',  // violet
    //     Left:   '#f59e0b',  // amber
    //     Right:  '#f43f5e'   // rose
    // };
    const panels = ['bottom', 'lid', 'front', 'back', 'left', 'right'];
    Object.entries(panels).forEach(([id]) => {
        const g = svg.querySelector(`#${CSS.escape(id)}`);
        if (!g) return;
        // color group and all its strokes
        g.setAttribute('stroke', "#ef4444");
        g.querySelectorAll('[stroke]').forEach(n => n.setAttribute('stroke', color));
    });
}

