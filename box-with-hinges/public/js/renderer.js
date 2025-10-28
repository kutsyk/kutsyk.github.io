// public/js/renderer.js
import {PANELS, UI_ATTR} from "./panel/constants.js";

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

export function colorTabs(svg) {
    // female tabs = blue
    svg.querySelectorAll('g[id$="__femaleTabs__"] rect, g[id$="__femaleTabs__"] path')
        .forEach(n => {
            n.setAttribute('stroke', '#1e3a8a');   // blue
            n.setAttribute('fill', 'none');
            n.setAttribute('opacity', '0.9');
            n.setAttribute('vector-effect', 'non-scaling-stroke');
            n.setAttribute('stroke-width', '0.6');
            n.setAttribute(UI_ATTR, '1');          // UI-only; stripped by export.js
            n.style.pointerEvents = 'none';
        });

    // male tabs = green
    svg.querySelectorAll('g[id$="__maleTabs__"] rect, g[id$="__maleTabs__"] path')
        .forEach(n => {
            n.setAttribute('stroke', '#065f46');   // green
            n.setAttribute('fill', 'none');
            n.setAttribute('opacity', '0.9');
            n.setAttribute('vector-effect', 'non-scaling-stroke');
            n.setAttribute('stroke-width', '0.6');
            n.setAttribute(UI_ATTR, '1');
            n.style.pointerEvents = 'none';
        });

    // lid bottom 2× tab = purple
    svg.querySelectorAll('#Lid g[id$="__lidBottomTab__"] rect, #Lid g[id$="__lidBottomTab__"] path')
        .forEach(n => {
            n.setAttribute('stroke', '#6b21a8');   // purple
            n.setAttribute('fill', 'none');
            n.setAttribute('opacity', '0.1');
            n.setAttribute('vector-effect', 'non-scaling-stroke');
            n.setAttribute('stroke-width', '1');
            n.setAttribute(UI_ATTR, '1');
            n.style.pointerEvents = 'none';
        });
}

export function colorPanels(svg) {
    Object.entries(PANELS).forEach(([id]) => {
        const g = svg.querySelector(`#${CSS.escape(id)}`);
        if (!g) return;
        // color group and all its strokes
        g.setAttribute('stroke', "#ef4444");
        g.querySelectorAll('[stroke]').forEach(n => n.setAttribute('stroke', color));
    });
}

function ensureOutlineRect(group, cls) {
    let r = group.querySelector(`:scope > rect.${cls}`);
    if (!r) {
        r = document.createElementNS(NS, 'rect');
        r.setAttribute('class', cls);
        group.appendChild(r); // last → on top
    }
    const b = group.getBBox();
    r.setAttribute('x', b.x);
    r.setAttribute('y', b.y);
    r.setAttribute('width', b.width);
    r.setAttribute('height', b.height);
    return r;
}



