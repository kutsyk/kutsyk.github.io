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
import {resetAllPanelsInModule, setCurrentSvg} from './panel/state.js';
import { pi_onGeometryChanged } from './panel-interaction.js';
import {STORAGE_KEY} from "./panel/constants.js";

export function pc_resetAll() {
    // 1) persistent
    try { localStorage.removeItem(STORAGE_KEY); } catch {}

    // 2) in-memory: editor state object
    const S = pc_getStateRef();
    S.panels = {};                // will be lazily re-created with defaults
    S._ui = { activePanel: 'Front', activeCell: null, selectedItemId: null, editItemId: null };
    pc_save();

    // 3) in-memory: panel/state.js module internals
    resetAllPanelsInModule();

    // 4) DOM cleanup: remove all panel-content layers and UI overlays
    const svg = document.querySelector('#out svg');
    if (svg) {
        svg.querySelectorAll('g[id^="pcLayer_"]').forEach(n => n.remove());   // per-panel item layers
        svg.querySelectorAll('#pcOverlaysRoot').forEach(n => n.remove());      // overlays (grid, hits, highlights)
        svg.querySelectorAll('.pc-item,[data-pc-ui]').forEach(n => n.remove()); // any strays
    }

    // 5) notify + repaint
    document.dispatchEvent(new CustomEvent('pc:stateReset'));
    document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: { panel: 'Front' } }));
    document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: { panel: null, row: null, col: null } }));
    document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail: { id: null } }));

    if (svg) {
        renderAll(svg);            // empty defaults per panel
        pi_onGeometryChanged(svg); // rebuild overlays for fresh defaults
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
