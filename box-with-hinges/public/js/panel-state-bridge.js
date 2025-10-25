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

function sanitizeSvg(src) {
    const temp = document.createElement('div');
    temp.innerHTML = src || '';
    temp.querySelectorAll('script').forEach(n => n.remove());
    temp.querySelectorAll('*').forEach(n => {
        [...n.attributes].forEach(a => {
            if (/^on/i.test(a.name)) n.removeAttribute(a.name);
        });
    });
    return temp.innerHTML;
}

export function pc_setActivePanel(name) {
    const S = pc_getStateRef();
    S._ui = S._ui || {};
    S._ui.activePanel = name;
}

export function pc_getActivePanel() {
    const S = pc_getStateRef();
    return S._ui?.activePanel || 'Front';
}

export function pc_markDirtyTextFont(family) {
    // Flag to re-render text with new family/metrics; rely on panel-content to read editor values.
    const svg = document.querySelector('#out svg');
    if (svg) _renderAll(svg);
}

function _ensureDefaults(name) {
    const S = pc_getStateRef();
    if (!S.panels[name]) S.panels[name] = {layout: {mode: 'grid', rows: 2, cols: 2, gutter: 2, padding: 4}, items: []};
}
