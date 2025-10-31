// Bridge between panel-interaction and panel-content state/render functions.
// Import your actual state from panel-content.js.

import { pc_onGeometryChanged as _renderAll, pc_getStateRef, pc_save as _save } from './panel-content.js';
import { pc_createItemInCell, pc_setItemType as _setItemType } from './panel/edit.js';
import {panelState, pc_getLayout} from "./panel/state.js";


// export function pc_getPanelState(name){
//     return panelState(name);
// }

export function pc_addItemAtGridCell(panelName, kind, cell) {
    return pc_createItemInCell(panelName, kind, cell);
}

export function pc_ensurePanel(name){
    const S = pc_getStateRef();
    S.panels = S.panels || {};
    if(!S.panels[name]) S.panels[name] = { layout:{mode:'grid',rows:2,cols:2,padding:4,gutter:2}, items:[] };
    if(!S.panels[name].layout) S.panels[name].layout = {mode:'grid',rows:2,cols:2,padding:4,gutter:2};
    return S.panels[name];
}
export function pc_getPanelState(name){ return pc_ensurePanel(name); }

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

function _normalize(arr, n) {
    const v = (arr||[]).slice(0, n).map(Number).map(x => (Number.isFinite(x) && x >= 0) ? x : 0);
    while (v.length < n) v.push(0);
    const sum = v.reduce((a,b)=>a+b,0);
    if (sum <= 0) return Array.from({length:n}, () => 100/n);
    return v.map(x => x * 100 / sum);
}
function _resizeKeepRatios(oldArr, newN) {
    const n0 = oldArr.length;
    if (newN === n0) return _normalize(oldArr, newN);
    // downsample/upsample with proportional mapping
    const prefix = [0]; for (let i=0;i<n0;i++) prefix[i+1] = prefix[i] + oldArr[i];
    const total = prefix[n0] || 1;
    const target = [];
    for (let k=0;k<newN;k++){
        const a = total * (k / newN);
        const b = total * ((k+1) / newN);
        // integrate old bins over [a,b]
        let acc = 0;
        for (let i=0;i<n0;i++){
            const s = prefix[i], e = prefix[i+1];
            const left = Math.max(a, s), right = Math.min(b, e);
            if (right > left) acc += (right - left);
        }
        target.push(acc);
    }
    return _normalize(target, newN);
}
export function pc_setRowPercents(name, arr) {
    const L = pc_getLayout(name);
    L.rowPercents = _normalize(arr, L.rows);
    pc_save(); return L.rowPercents;
}
export function pc_setColPercents(name, arr) {
    const L = pc_getLayout(name);
    L.colPercents = _normalize(arr, L.cols);
    pc_save(); return L.colPercents;
}
export function pc_resizeRowCount(name, newRows) {
    const L = pc_getLayout(name);
    const n = Math.max(1, Number(newRows) || 1);
    L.rowPercents = _resizeKeepRatios(L.rowPercents || [100], n);
    L.rows = n; pc_save(); return L.rowPercents;
}
export function pc_resizeColCount(name, newCols) {
    const L = pc_getLayout(name);
    const n = Math.max(1, Number(newCols) || 1);
    L.colPercents = _resizeKeepRatios(L.colPercents || [100], n);
    L.cols = n; pc_save(); return L.colPercents;
}
