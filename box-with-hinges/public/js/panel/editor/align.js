// js/panel/editor/align.js
// Bind Align controls to current item's align.h / align.v

import {
    panelState, getEditItemId, getSelectedItemId,
    repaint, saveState, getCurrentSvg, getCurrentPanel
} from './helpers.js';

function currentItem() {
    const p = panelState(getCurrentPanel());
    const id = (getEditItemId?.() || getSelectedItemId?.());
    return p?.items?.find(i => i.id === id) || null;
}

function syncFromItem() {
    const it = currentItem();
    const ah = document.getElementById('pc-align-h');
    const av = document.getElementById('pc-align-v');
    if (!ah || !av) return;

    const h = it?.align?.h ?? 'center';
    const v = it?.align?.v ?? 'middle';

    if (ah.value !== h) ah.value = h;
    if (av.value !== v) av.value = v;

    // enable/disable based on selection
    const on = !!it;
    ah.disabled = !on;
    av.disabled = !on;
}

function commitAlign(which) {
    const it = currentItem();
    if (!it) return;
    it.align = it.align || { h: 'center', v: 'middle' };

    const ah = document.getElementById('pc-align-h');
    const av = document.getElementById('pc-align-v');

    if (which === 'h' && ah) it.align.h = (ah.value || 'center');
    if (which === 'v' && av) it.align.v = (av.value || 'middle');

    saveState();
    repaint(getCurrentSvg());
}

export function bindAlignControls() {
    const ah = document.getElementById('pc-align-h');
    const av = document.getElementById('pc-align-v');

    // guard once
    if (ah && !ah._pcBound) {
        ah._pcBound = true;
        ah.addEventListener('change', () => commitAlign('h'));
    }
    if (av && !av._pcBound) {
        av._pcBound = true;
        av.addEventListener('change', () => commitAlign('v'));
    }

    // keep in sync with selection/mode changes
    ['pc:itemSelectionChanged','pc:enterEditChanged','pc:panelChanged','pc:stateRestored']
        .forEach(ev => document.addEventListener(ev, syncFromItem));

    // initial paint
    requestAnimationFrame(syncFromItem);
}
