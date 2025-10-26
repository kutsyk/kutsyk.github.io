// js/panel-content.js
// Facade wiring for your existing structure: js/panel/* modules + top-level overlays.

import { renderAll } from './panel/render.js';
import { pc_beforeDownload } from './panel/export.js';
import {
    initEditing,
    pc_enterEdit,
    pc_getStateRef,
    pc_deleteItem,
    pc_save,
    pc_bindSvg,
    pc_activateEditorTab
} from './panel/edit.js';
import { setCurrentSvg } from './panel/state.js';
import { pi_onGeometryChanged } from './panel-interaction.js';

export function pc_resetAll() {
    const S = pc_getStateRef();

    // drop all panels → they’ll be re-created with defaults on access
    S.panels = {};

    // clear UI-related selections if you keep any in state object
    if (!S._ui) S._ui = {};
    S._ui.activePanel = 'Front';
    S._ui.activeCell  = null;
    S._ui.selectedItemId = null;
    S._ui.editItemId     = null;

    pc_save();

    // notify UI and repaint
    document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: { panel: 'Front' } }));
    document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: { panel: null, row: null, col: null } }));

    const svg = document.querySelector('#out svg');
    if (svg) {
        renderAll(svg);
        pi_onGeometryChanged(svg);
    }
}

// Called by main geometry pipeline after the SVG is (re)built
export function pc_onGeometryChanged(svg) {
    setCurrentSvg(svg);
    pc_bindSvg(svg);          // hooks deselect, etc.
    renderAll(svg);           // draw panel content
    pi_onGeometryChanged(svg); // draw overlays (panel frame, active cell, drops)
}

// Optional convenience re-export
export { pc_beforeDownload, pc_enterEdit, pc_getStateRef, pc_deleteItem, pc_save, pc_activateEditorTab };

// Optional: expose renderAll in case callers need it
export function pc_renderAll(svg) { renderAll(svg); }

// One-time boot for editor bindings
initEditing();
