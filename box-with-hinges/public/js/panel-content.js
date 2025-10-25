// public/js/panel-content.js
// Facade module. Re-exports the same API as before, using internal modules.

import { renderAll } from './panel/render.js';
import { pc_beforeDownload } from './panel/export.js';
import {
    initEditing, pc_enterEdit, pc_getStateRef,
    pc_deleteItem, pc_save, pc_bindSvg, pc_activateEditorTab
} from './panel/edit.js';
import { setCurrentSvg } from './panel/state.js';

// PUBLIC API (unchanged names)
export function pc_onGeometryChanged(svg) {
    setCurrentSvg(svg);
    pc_bindSvg(svg);
    renderAll(svg);
}
export { pc_beforeDownload, pc_enterEdit, pc_getStateRef, pc_deleteItem, pc_save, pc_activateEditorTab };
// one-time init
initEditing();
