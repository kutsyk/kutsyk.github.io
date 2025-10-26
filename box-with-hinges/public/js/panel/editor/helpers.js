// js/panel/editor/helpers.js
// Shared utilities + re-exports from app state/render APIs.

import {
    panelState,
    saveState,
    getCurrentPanel,
    setCurrentPanel,
    getSelectedItemId,
    setSelectedItemId,
    getEditItemId,
    setEditItemId,
    getEditOriginal,
    setEditOriginal,
    getCurrentSvg,
    setCurrentSvg,
    setActiveCell,
    getActiveCell,
    UIMODES,
    setUiMode
} from '../state.js';

import { renderAll } from '../render.js';
import { pi_onGeometryChanged } from '../../panel-interaction.js';

export {
    panelState, saveState, getCurrentPanel, setCurrentPanel,
    getSelectedItemId, setSelectedItemId, getEditItemId, setEditItemId,
    getEditOriginal, setEditOriginal, getCurrentSvg, setCurrentSvg,
    setActiveCell, getActiveCell, UIMODES, setUiMode
};

export const nowPanel  = () => getCurrentPanel() || 'Front';
export const activeSvg = () => getCurrentSvg();
export const mmNum     = (v, d=0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function repaint(svg = activeSvg()) {
    if (!svg) return;
    renderAll(svg);
    pi_onGeometryChanged(svg);
}

export function currentItem() {
    const p = panelState(getCurrentPanel());
    const id =
        (typeof getEditItemId === 'function' && getEditItemId()) ||
        (typeof getSelectedItemId === 'function' && getSelectedItemId());
    return id ? p.items.find(i => i.id === id) : null;
}

export function deepMerge(dst, src){
    for (const k in src){
        const sv = src[k], dv = dst[k];
        if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
            dst[k] = deepMerge(dv && typeof dv==='object' ? dv : {}, sv);
        } else {
            dst[k] = sv;
        }
    }
    return dst;
}
