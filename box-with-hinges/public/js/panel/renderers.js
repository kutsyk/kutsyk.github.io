import {NS, UI_ATTR} from './constants.js';
import {mm, alignInBox} from './utils.js';
import {els} from './dom.js';

function _styleVals(item) {
    const st = item.style || {};
    const f = normalizePaint(st.fill ?? '#000000');
    const s = normalizePaint(st.stroke ?? '#000000');
    const sw = Number(st.strokeW ?? 0.35) || 0.35;
    const op = Math.max(0, Math.min(100, Number(st.opacity ?? 100))) / 100;
    return { fill: f.color, fillOp: f.chanOpacity, stroke: s.color, strokeOp: s.chanOpacity, sw, op };
}

function normalizePaint(v) {
    if (v === 'none') return { color: 'none', chanOpacity: null };
    if (v === 'transparent') return { color: '#000000', chanOpacity: 0 }; // “transparent” → 0 channel opacity
    if (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return { color: v, chanOpacity: null };
    return { color: '#000000', chanOpacity: null };
}

// TEXT
export function renderText(layer, box, item) {
    const t = document.createElementNS(NS, 'text');
    t.classList.add('pc-item');
    t.setAttribute('data-item-id', item.id);

    t.setAttribute('x', String(box.x));
    t.setAttribute('y', String(box.y));
    t.setAttribute('text-anchor', 'start');
    t.setAttribute('dominant-baseline', 'alphabetic');

    const { fill, fillOp, stroke, strokeOp, sw, op } = _styleVals(item);
    const invert = item.text?.invert === true;

    const wrap = document.createElementNS(NS, 'g');
    wrap.classList.add('pc-item');
    wrap.setAttribute('data-item-id', item.id);
    wrap.setAttribute('opacity', String(op));

// drive the actual <text> element paints
    t.setAttribute('fill', invert ? stroke : fill);
    if (fill === 'none') t.setAttribute('fill', 'none');
    if (fillOp !== null) t.setAttribute('fill-opacity', String(fillOp));

    t.setAttribute('stroke', invert ? 'none' : stroke);
    if (stroke === 'none' || invert) t.setAttribute('stroke', 'none');
    else t.setAttribute('stroke-width', String(sw));

// make strokes render *around* glyphs, not over-fill → looks less “bloated”
    t.setAttribute('paint-order', 'stroke fill');
    t.setAttribute('stroke-linejoin', 'round');
    t.setAttribute('stroke-linecap', 'round');

// optional: keep stroke width visual constant under zoom transforms
    t.setAttribute('vector-effect', 'non-scaling-stroke');

    const family = item.text?.fontFamily || 'Inter';
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
    const wrap = document.createElementNS(NS, 'g');          // OUTER: align + rotate/mirror
    wrap.classList.add('pc-item');
    wrap.setAttribute('data-item-id', item.id);

    const inner = document.createElementNS(NS, 'g');         // INNER: viewBox translate + scale
    wrap.appendChild(inner);
    layer.appendChild(wrap);

    const { fill, fillOp, stroke, strokeOp, sw, op } = _styleVals(item);
    const invert = item.svg?.invert === true;

    wrap.setAttribute('opacity', String(op));
    wrap.setAttribute('fill', invert ? (stroke === 'none' ? 'none' : stroke) : fill);
    wrap.setAttribute('stroke', invert ? 'none' : stroke);
    wrap.setAttribute('stroke-width', String(sw));
    if (fillOp !== null)   wrap.setAttribute('fill-opacity',   String(fillOp));
    if (strokeOp !== null) wrap.setAttribute('stroke-opacity', String(strokeOp));

    if (!item.svg?.content) {
        const phW = Math.max(6, Math.min(box.w, box.h) * 0.8);
        const phH = phW;

        const frame = document.createElementNS(NS, 'rect');
        frame.setAttribute('x', '0');
        frame.setAttribute('y', '0');
        frame.setAttribute('width', String(phW));
        frame.setAttribute('height', String(phH));
        frame.setAttribute('rx', '2');
        frame.setAttribute('fill', 'none');
        frame.setAttribute('stroke-dasharray', '2 1');
        inner.appendChild(frame);

        // image icon (24x24 -> center @ 50% scale of box)
        const icon = document.createElementNS(NS, 'path');
        // simple "image" glyph: mountain + sun
        icon.setAttribute('d',
            'M3 5h18v14H3z M6 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M4 17l6-6 4 4 3-3 4 5'); // multiple subpaths ok
        icon.setAttribute('fill', 'none');

        const s = (phW * 0.5) / 24;                 // scale icon to 50% of placeholder
        const tx = phW * 0.5 - 12 * s;              // center
        const ty = phH * 0.5 - 12 * s;
        const gIcon = document.createElementNS(NS, 'g');
        gIcon.setAttribute('transform', `translate(${tx} ${ty}) scale(${s})`);
        gIcon.appendChild(icon);
        inner.appendChild(gIcon);

        // align wrapper inside the cell; no rotation/mirror for empty state
        alignInBox(box, wrap, item.align?.h || 'center', item.align?.v || 'middle');
        return wrap;
    }

    const temp = document.createElement('div');
    temp.innerHTML = item.svg.content.trim();
    let root = temp.querySelector('svg') || temp.firstElementChild;
    if (!root) {
        alignInBox(box, wrap, item.align?.h || 'center', item.align?.v || 'middle');
        return wrap;
    }

    let imported;
    if (root.nodeName.toLowerCase() === 'svg') {
        const svgEl = document.importNode(root, true);
        if (!svgEl.getAttribute('viewBox')) {
            const w = parseFloat(svgEl.getAttribute('width') || '0');
            const h = parseFloat(svgEl.getAttribute('height') || '0');
            if (w && h) svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
        }
        const g = document.createElementNS(NS, 'g');
        const vb = svgEl.viewBox && svgEl.viewBox.baseVal ? svgEl.viewBox.baseVal : null;
        if (vb) g.setAttribute('transform', `translate(${-vb.x} ${-vb.y})`);
        [...svgEl.childNodes].forEach(n => { if (n.nodeType === 1) g.appendChild(document.importNode(n, true)); });
        imported = g;
    } else {
        imported = document.importNode(root, true);
    }

    imported.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,g,use,text').forEach(el => {
        el.removeAttribute('stroke');
        el.removeAttribute('fill');
        el.removeAttribute('stroke-width');
        const style = el.getAttribute('style') || '';
        if (style) {
            const cleaned = style
                .replace(/(?:^|;)\s*stroke\s*:[^;]*/gi, '')
                .replace(/(?:^|;)\s*fill\s*:[^;]*/gi, '')
                .replace(/(?:^|;)\s*stroke-width\s*:[^;]*/gi, '')
                .replace(/^\s*;|\s*;$/g, '');
            if (cleaned) el.setAttribute('style', cleaned); else el.removeAttribute('style');
        }
    });

    inner.appendChild(imported);
    let b = safeBBox(inner);
    if (!b || b.width === 0 || b.height === 0) b = { x:0, y:0, width:1, height:1 };

    const wOverride = Number(item.svg?.w) || 0;
    const hOverride = Number(item.svg?.h) || 0;
    let sx, sy;
    if (wOverride > 0 || hOverride > 0) {
        if (wOverride > 0 && hOverride > 0) { sx = wOverride / b.width; sy = hOverride / b.height; }
        else if (wOverride > 0) { sx = wOverride / b.width; sy = sx; }
        else { sy = hOverride / b.height; sx = sy; }
    } else {
        const preserve = item.svg?.preserveAspect !== false; // default true
        const scalePct = mm(item.svg?.scale, 100) / 100;
        sx = (box.w / b.width) * scalePct;
        sy = (box.h / b.height) * scalePct;
        if (preserve) { const s = Math.min(sx, sy); sx = s; sy = s; }
    }

    inner.setAttribute('transform', `translate(${-b.x} ${-b.y}) scale(${sx} ${sy})`);

    const cx = box.x + box.w/2;
    const cy = box.y + box.h/2;
    const mirX = item.transform?.mirrorX ? -1 : 1;
    const mirY = item.transform?.mirrorY ? -1 : 1;
    const rot  = mm(item.transform?.rotate, 0);
    const extra = [];
    if (mirX !== 1 || mirY !== 1) extra.push(`translate(${cx} ${cy}) scale(${mirX} ${mirY}) translate(${-cx} ${-cy})`);
    if (rot) extra.push(`rotate(${rot} ${cx} ${cy})`);
    if (extra.length) wrap.setAttribute('transform', extra.join(' '));

    alignInBox(box, wrap, item.align?.h || 'center', item.align?.v || 'middle');
    return wrap;

    function safeBBox(node) { try { return node.getBBox(); } catch { return { x:0, y:0, width:0, height:0 }; } }
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

export function addSelectionRect(groupNode) {
    const bbox = groupNode.getBBox();
    let r = groupNode.querySelector(':scope > rect.pc-selection');
    if (!r) {
        r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('class', 'pc-selection');
        groupNode.appendChild(r);
    }
    r.setAttribute('x', bbox.x);
    r.setAttribute('y', bbox.y);
    r.setAttribute('width', bbox.width);
    r.setAttribute('height', bbox.height);
    r.setAttribute('fill', 'none');
    r.setAttribute('stroke', '#0d6efd');
    r.setAttribute('stroke-dasharray', '4 2');
    r.setAttribute('vector-effect', 'non-scaling-stroke');
    r.setAttribute('pointer-events', 'none');
}

export function removeSelectionRect(groupNode) {
    groupNode.querySelectorAll(':scope > rect.pc-selection').forEach(n => n.remove());
}

export function ensureOutlineRect(group, className) {
    let r = group.querySelector(`:scope > rect.pc-outline`);
    const bb = group.getBBox();
    if (!r) {
        r = document.createElementNS(NS, 'rect');
        r.setAttribute('class', `pc-outline ${className || ''}`.trim());
        r.setAttribute(UI_ATTR, '1');                               // stripped on export
        r.setAttribute('fill', 'none');
        r.setAttribute('vector-effect', 'non-scaling-stroke');
        r.setAttribute('pointer-events', 'none');
        group.appendChild(r);
    } else {
        // ensure class contains pc-outline + current mode-specific class
        r.setAttribute('class', `pc-outline ${className || ''}`.trim());
    }
    r.setAttribute('x', bb.x);
    r.setAttribute('y', bb.y);
    r.setAttribute('width',  bb.width  || 0);
    r.setAttribute('height', bb.height || 0);
    return r;
}

export function showHoverOutline(group) {
    const r = ensureOutlineRect(group, 'pc-outline-hover');
    r.setAttribute('stroke', '#0d6efd');
    r.setAttribute('stroke-dasharray', '4 2');
    r.setAttribute('stroke-width', '0.9');
    r.setAttribute('opacity', '0.9');
}

export function hideHoverOutline(group) {
    group.querySelectorAll(':scope > rect.pc-outline-hover').forEach(n => n.remove());
}

export function showActiveOutline(group) {
    const r = ensureOutlineRect(group, 'pc-outline-active');
    r.setAttribute('stroke', '#0d6efd');
    r.setAttribute('stroke-dasharray', '4 2');
    r.setAttribute('stroke-width', '1.6');
    r.setAttribute('opacity', '1');
}

export function hideActiveOutline(group) {
    group.querySelectorAll(':scope > rect.pc-outline-active').forEach(n => n.remove());
}
