// editor-object-guard.js
import { getCurrentPanel, getSelectedItemId } from './panel/state.js';
import { pc_getPanelState } from './panel-state-bridge.js';
import { pc_getStateRef } from './panel-content.js';

// resolve active item safely (selected OR edit), fallback to state if getters absent
function currentItem() {
    const S = pc_getStateRef?.();
    const panel = getCurrentPanel?.() || S?._ui?.activePanel;
    const selId = (typeof getSelectedItemId === 'function' ? getSelectedItemId() : null) || S?._ui?.selectedItemId;
    const editId = S?._ui?.editItemId || null;
    const id = editId || selId;
    if (!panel || !id) return null;
    const p = pc_getPanelState?.(panel);
    if (!p || !Array.isArray(p.items)) return null;
    return p.items.find(i => i.id === id) || null;
}

function objectPaneRoot() {
    // support both IDs seen in your templates
    return document.querySelector('#pc-tab-object, #objectEditor');
}

function clearVisibleFields(root) {
    // clear only user-facing inputs; harmless if some ids don’t exist
    const vals = [
        'pc-name','pc-textarea','pc-font-size','pc-line',
        'pc-font-select','pc-font-preview','pc-scale',
        'pc-svg-w','pc-svg-h','pc-svg-filename',
        'pc-stroke','pc-opacity'
    ];
    vals.forEach(id => {
        const el = root.querySelector('#' + id);
        if (el && 'value' in el) el.value = '';
    });
    ['pc-preserve','pc-svg-invert','pc-fill-none','pc-stroke-none','pc-invert','pc-mirror-x','pc-mirror-y']
        .forEach(id => { const c = root.querySelector('#' + id); if (c) c.checked = false; });
}

function setObjectFormDisabled(disabled) {
    const root = objectPaneRoot();
    if (!root) return;

    root.classList.toggle('pc-form-disabled', !!disabled);

    // disable all controls inside the pane; keep the right-side tab buttons (they’re outside this root)
    root.querySelectorAll('input, select, textarea, button').forEach(el => { el.disabled = !!disabled; });

    if (disabled) {
        clearVisibleFields(root);
    } else {
        // allow your existing binders to repopulate
        document.dispatchEvent(new CustomEvent('pc:objectFormEnable'));
    }
}

function refresh() {
    setObjectFormDisabled(!currentItem());
}

// bind once
(function bindOnce(){
    if (document._pcObjFormGuardBound) return;
    document._pcObjFormGuardBound = true;

    ['pc:itemSelectionChanged',
        'pc:enterEditChanged',
        'pc:panelChanged',
        'pc:stateRestored',
        'pc:panelReset'
    ].forEach(ev => document.addEventListener(ev, refresh));

    // initial
    requestAnimationFrame(refresh);
})();
