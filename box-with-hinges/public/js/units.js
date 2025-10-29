const IN_PER_MM = 1 / 25.4;

export function toMm(val, units) {
    if (units === 'mm') return val;
    if (units === 'cm') return val * 10;
    if (units === 'in') return val / IN_PER_MM;
    return val;
}

export function fromMm(mm, units) {
    if (units === 'mm') return mm;
    if (units === 'cm') return mm / 10;
    if (units === 'in') return mm * IN_PER_MM;
    return mm;
}

export function fmt(mm, units='mm', digits=2) {
    const v = fromMm(mm, units);
    return `${v.toFixed(digits)} ${units}`;
}

export function findPanelLayer(root, name) {
    return root.querySelector(`#pcLayer_${name}`) || null;
}
export function findPanelHost(root, name) {
    // prefer canonical id / data marker if you have them
    return root.querySelector(`#pcHost_${name}, [data-pc-host="${name}"]`)
        || root.querySelector(`g[id$="_${name}"], g[id$="-${name}"], g[id="${name}"]`)
        || root.querySelector(`[id$="_${name}"], [id$="-${name}"], [id="${name}"]`)
        || null;
}
export function prependLayer(host, layerClone) {
    // insert before first element child to keep layer under face fills
    const firstEl = [...host.childNodes].find(n => n.nodeType === 1);
    if (firstEl) host.insertBefore(layerClone, firstEl);
    else host.appendChild(layerClone);
}
export function unhideAllLayers(svg) {
    svg.querySelectorAll('g[id^="pcLayer_"]').forEach(g => {
        g.removeAttribute('display'); g.style.display = '';
        g.removeAttribute('visibility'); g.style.visibility = '';
        g.classList.remove('d-none','hidden','vis-hidden');
    });
}
export function inlineTextPaintFromLive(liveSvg, cloneSvg) {
    const toHex = c => {
        if (!c) return null;
        if (c === 'none' || c === 'transparent') return 'none';
        if (c.startsWith('#')) return c.length === 4
            ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`.toLowerCase()
            : c.toLowerCase();
        const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
        if (m) return `#${(+m[1]).toString(16).padStart(2,'0')}${(+m[2]).toString(16).padStart(2,'0')}${(+m[3]).toString(16).padStart(2,'0')}`;
        if (/^black$/i.test(c)) return '#000000';
        if (/^white$/i.test(c)) return '#ffffff';
        return null;
    };
    const liveMap = new Map();
    liveSvg.querySelectorAll('g.pc-item[data-item-id]').forEach(w => {
        const id = w.getAttribute('data-item-id');
        const t = w.querySelector('text'); if (!id || !t) return;
        const cs = getComputedStyle(t);
        liveMap.set(id, {
            fill:   t.getAttribute('fill')   || cs.fill   || '#000000',
            stroke: t.getAttribute('stroke') || cs.stroke || 'none',
            sw:     t.getAttribute('stroke-width') || cs.strokeWidth || ''
        });
    });
    cloneSvg.querySelectorAll('g.pc-item[data-item-id] text').forEach(t => {
        const id = t.closest('g.pc-item')?.getAttribute('data-item-id');
        const s = id ? liveMap.get(id) : null;
        let fill   = toHex(s?.fill)   || '#000000';
        let stroke = toHex(s?.stroke) || 'none';
        let sw     = s?.sw || '';
        t.setAttribute('fill', fill);
        if (stroke === 'none' || (+sw || 0) <= 0) {
            t.setAttribute('stroke','none'); t.removeAttribute('stroke-width');
        } else {
            t.setAttribute('stroke', stroke); t.setAttribute('stroke-width', String(sw));
        }
        if (!t.hasAttribute('paint-order')) t.setAttribute('paint-order','stroke fill');
        t.removeAttribute('class');
        const style = t.getAttribute('style') || '';
        if (style && /var\(/.test(style)) t.removeAttribute('style');
    });
}
