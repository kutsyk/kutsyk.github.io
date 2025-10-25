import {NS, UI_ATTR} from './constants.js';
import {mm, alignInBox} from './utils.js';
import {els} from './dom.js';

// TEXT
export function renderText(layer, box, item) {
    const t = document.createElementNS(NS, 'text');
    t.classList.add('pc-item');
    t.setAttribute('data-item-id', item.id);

    t.setAttribute('x', String(box.x));
    t.setAttribute('y', String(box.y));
    t.setAttribute('text-anchor', 'start');
    t.setAttribute('dominant-baseline', 'alphabetic');

    t.setAttribute('fill', 'none');
    t.setAttribute('stroke', 'currentColor');
    t.setAttribute('stroke-width', String(mm(item.style?.strokeW, 0.35)));
    t.setAttribute('opacity', String(mm(item.style?.opacity ?? 100, 100) / 100));

    const family = item.text?.font || els.fontFamilyDDL?.value || 'Arial, Helvetica, sans-serif';
    t.setAttribute('font-family', family);
    t.setAttribute('font-size', String(mm(item.text?.size, 4)));

    const textVal = (item.text?.value || '').slice(0, 1000);
    if (textVal.includes('\n')) {
        textVal.split(/\r?\n/).forEach((line, i) => {
            const ts = document.createElementNS(NS, 'tspan');
            if (i > 0) ts.setAttribute('x', String(box.x));
            if (i > 0) ts.setAttribute('dy', String(mm(item.text?.size, 4) * (item.text?.line ?? 1.2)));
            ts.textContent = line;
            t.appendChild(ts);
        });
    } else {
        t.textContent = textVal;
    }

    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const mirX = item.transform?.mirrorX ? -1 : 1;
    const mirY = item.transform?.mirrorY ? -1 : 1;
    const rot = mm(item.transform?.rotate, 0);
    const transforms = [];
    if (mirX !== 1 || mirY !== 1) transforms.push(`translate(${cx} ${cy}) scale(${mirX} ${mirY}) translate(${-cx} ${-cy})`);
    if (rot) transforms.push(`rotate(${rot} ${cx} ${cy})`);
    if (transforms.length) t.setAttribute('transform', transforms.join(' '));

    layer.appendChild(t);
    alignInBox(box, t, item.align?.h || 'center', item.align?.v || 'middle');
    return t;
}

// SVG
export function renderSvg(layer, box, item) {
    const wrap = document.createElementNS(NS, 'g');
    wrap.classList.add('pc-item');
    wrap.setAttribute('data-item-id', item.id);
    const inner = document.createElementNS(NS, 'g');
    wrap.appendChild(inner);
    layer.appendChild(wrap);

    const invert = item.svg?.invert === true;
    // paint on wrapper so children inherit after we strip inline paints
    wrap.setAttribute('fill', invert ? 'currentColor' : 'none');
    wrap.setAttribute('stroke', invert ? 'none' : 'currentColor');
    wrap.setAttribute('stroke-width', String(mm(item.style?.strokeW, 0.35)));
    wrap.setAttribute('opacity', String(mm(item.style?.opacity ?? 100, 100) / 100));

    if (!item.svg?.content) return wrap;

    const temp = document.createElement('div');
    temp.innerHTML = item.svg.content.trim();
    let root = temp.querySelector('svg') || temp.firstElementChild;
    if (!root) return wrap;

    let imported;
    if (root.nodeName.toLowerCase() === 'svg') {
        imported = document.importNode(root, true);
        if (!imported.getAttribute('viewBox')) {
            const w = parseFloat(imported.getAttribute('width') || '0');
            const h = parseFloat(imported.getAttribute('height') || '0');
            if (w && h) imported.setAttribute('viewBox', `0 0 ${w} ${h}`);
        }
        const g = document.createElementNS(NS, 'g');
        const vb = imported.viewBox && imported.viewBox.baseVal ? imported.viewBox.baseVal : null;
        if (vb) g.setAttribute('transform', `translate(${-vb.x} ${-vb.y})`);
        [...imported.childNodes].forEach(n => {
            if (n.nodeType === 1) g.appendChild(document.importNode(n, true));
        });
        imported = g;
    } else {
        imported = document.importNode(root, true);
    }

    wrap.appendChild(imported);
    let b = safeBBox(inner);
    if (!b || b.width === 0 || b.height === 0) {
        wrap.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line').forEach(el => {
            if (el.getAttribute('stroke') === 'none') el.removeAttribute('stroke');
            if (invert && el.getAttribute('fill') === 'none') el.removeAttribute('fill');
        });
        b = safeBBox(wrap);
    }

    const wOverride = Number(item.svg?.w) || 0;
    const hOverride = Number(item.svg?.h) || 0;
    let sx, sy;
    if (wOverride > 0 || hOverride > 0) {
        if (wOverride > 0 && hOverride > 0) {
            sx = wOverride / Math.max(1e-6, b.width);
            sy = hOverride / Math.max(1e-6, b.height);
        } else if (wOverride > 0) {
            sx = wOverride / Math.max(1e-6, b.width);
            sy = sx;
        } else {
            sy = hOverride / Math.max(1e-6, b.height);
            sx = sy;
        }
    } else {
        const preserve = !!item.svg?.preserveAspect;
        const scalePct = mm(item.svg?.scale, 100) / 100;
        sx = (box.w / Math.max(1e-6, b.width)) * scalePct;
        sy = (box.h / Math.max(1e-6, b.height)) * scalePct;
        if (preserve) {
            const s = Math.min(sx, sy);
            sx = s;
            sy = s;
        }
    }

    const tf0 = `translate(${-b.x} ${-b.y}) scale(${sx} ${sy})`;
    inner.setAttribute('transform', tf0);

    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const mirX = item.transform?.mirrorX ? -1 : 1;
    const mirY = item.transform?.mirrorY ? -1 : 1;
    const rot = mm(item.transform?.rotate, 0);
    const extra = [];
    if (mirX !== 1 || mirY !== 1) extra.push(`translate(${cx} ${cy}) scale(${mirX} ${mirY}) translate(${-cx} ${-cy})`);
    if (rot) extra.push(`rotate(${rot} ${cx} ${cy})`);
    if (extra.length) wrap.setAttribute('transform', extra.join(' '));

    alignInBox(box, wrap, item.align?.h || 'center', item.align?.v || 'middle');
    return wrap;

    function safeBBox(node) {
        try {
            return node.getBBox();
        } catch {
            return {x: 0, y: 0, width: 0, height: 0};
        }
    }
}

// Delete cross
export function addDeleteCross(layer, node, onClick) {
    const b = node.getBBox();
    const size = 6, pad = 1.5;
    const cx = b.x + b.width - pad - size / 2;
    const cy = b.y + pad + size / 2;

    const g = document.createElementNS(NS, 'g');
    g.setAttribute(UI_ATTR, '1');
    g.setAttribute('cursor', 'pointer');

    const bg = document.createElementNS(NS, 'circle');
    bg.setAttribute('cx', cx);
    bg.setAttribute('cy', cy);
    bg.setAttribute('r', size / 2);
    bg.setAttribute('fill', '#ffffff');
    bg.setAttribute('fill-opacity', '0.9');
    bg.setAttribute('stroke', '#ef4444');
    bg.setAttribute('stroke-width', '0.3');
    g.appendChild(bg);

    const mk = (x1, y1, x2, y2) => {
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', x1);
        l.setAttribute('y1', y1);
        l.setAttribute('x2', x2);
        l.setAttribute('y2', y2);
        l.setAttribute('stroke', '#ef4444');
        l.setAttribute('stroke-width', '0.5');
        return l;
    };
    const d = size * 0.35;
    g.appendChild(mk(cx - d, cy - d, cx + d, cy + d));
    g.appendChild(mk(cx - d, cy + d, cx + d, cy - d));

    g.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    layer.appendChild(g);
}
