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
