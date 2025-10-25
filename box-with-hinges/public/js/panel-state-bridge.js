// Bridge between panel-interaction and panel-content state/render functions.
// Import your actual state from panel-content.js.

import { pc_onGeometryChanged as _renderAll, pc_getStateRef, pc_save as _save } from './panel-content.js';
import { pc_createItemInCell, pc_setItemType as _setItemType } from './panel/edit.js';

export function pc_getPanelState(name) {
    const S = pc_getStateRef();
    if (!S.panels[name]) S.panels[name] = { layout: { mode:'grid', rows:2, cols:2, gutter:2, padding:4 }, items: [] };
    return S.panels[name];
}

export function pc_addItemAtGridCell(panelName, kind, cell) {
    return pc_createItemInCell(panelName, kind, cell);
}

export function pc_renderAll(svg) {
    _renderAll(svg);
}

export function pc_save() {
    _save();
}

export function pc_setItemSvg(panelName, itemId, rawContent, name) {
    const S = pc_getStateRef();
    const p = S.panels[panelName];
    if (!p) return;
    const it = p.items.find(i => i.id === itemId);
    if (!it) return;
    _setItemType(panelName, itemId, 'svg');
    it.type = 'svg';
    it.svg = it.svg || {content: '', scale: 100, preserveAspect: true, w: undefined, h: undefined, invert: false};
    it.svg.content = sanitizeSvg(rawContent || '');
    if (name) {
        it.name = name;
    } else if (!it.name || it.name === 'Text') {
        it.name = 'SVG';
    }
    _save();
}

export function pc_setItemType(panelName, itemId, type) { _setItemType(panelName, itemId, type); }

export function pc_getCellConfig(panelName, row, col) {
    const S = pc_getStateRef();
    const P = S.panels[panelName]; if (!P) return null;
    const M = P.cells || (P.cells = {});
    return M[`${row},${col}`] || null;
}
export function pc_setCellConfig(panelName, row, col, cfg) {
    const S = pc_getStateRef();
    const P = S.panels[panelName] || (S.panels[panelName] = { layout:{mode:'grid',rows:2,cols:2,gutter:2,padding:4}, items:[] });
    const M = P.cells || (P.cells = {});
    if (!cfg || (cfg.pad==null && !cfg.ah && !cfg.av)) { delete M[`${row},${col}`]; }
    else {
        const c = M[`${row},${col}`] || {};
        if (cfg.pad != null) c.pad = Math.max(0, Number(cfg.pad) || 0);
        if ('ah' in cfg) c.ah = cfg.ah || undefined;
        if ('av' in cfg) c.av = cfg.av || undefined;
        M[`${row},${col}`] = c;
    }
    pc_save();
    return pc_getCellConfig(panelName, row, col);
}

// box shrinker used by render: apply per-cell padding and optional align overrides
export function pc_applyCellBoxTweaks(panelName, item, box) {
    const cfg = pc_getCellConfig(panelName, item.grid?.row, item.grid?.col);
    if (!cfg) return box;
    let { x, y, w, h } = box;
    if (cfg.pad && cfg.pad > 0) {
        const p = cfg.pad;
        x += p; y += p; w = Math.max(0, w - 2*p); h = Math.max(0, h - 2*p);
    }
    if (cfg.ah || cfg.av) {
        item = item || {};
        item.align = { h: cfg.ah || item.align?.h || 'center', v: cfg.av || item.align?.v || 'middle' };
    }
    return { x, y, w, h };
}
