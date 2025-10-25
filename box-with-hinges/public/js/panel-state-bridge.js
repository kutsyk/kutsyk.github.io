// Bridge between panel-interaction and panel-content state/render functions.
// Import your actual state from panel-content.js.

import { pc_onGeometryChanged as _renderAll, pc_getStateRef } from './panel-content.js';
import { pc_createItemInCell } from './panel/edit.js';

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
    if (!S.panels[name]) S.panels[name] = { layout: { mode:'grid', rows:2, cols:2, gutter:2, padding:4 }, items: [] };
}
