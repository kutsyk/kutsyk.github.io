// js/panel/editor/svg-upload.js
// Upload + sanitize + persist SVG, and robust size controls. Null-safe.

import {
    panelState, getEditItemId, getSelectedItemId,
    repaint, saveState, getCurrentSvg, getCurrentPanel
} from './helpers.js';

function sanitizeSvg(src){
    const temp = document.createElement('div');
    temp.innerHTML = src || '';
    temp.querySelectorAll('script').forEach(n => n.remove());
    temp.querySelectorAll('*').forEach(n => {
        [...n.attributes].forEach(a => { if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
    });
    return temp.innerHTML;
}

export function bindSvgUpload(){
    const inputEl = document.getElementById('pc-svg-src');
    if (!inputEl || inputEl._pcBound) return; inputEl._pcBound = true;

    inputEl.addEventListener('change', async (ev) => {
        // capture node reference immediately; never rely on ev.currentTarget after await
        const input = inputEl; // stable reference
        const file = input?.files && input.files[0];
        if (!file) return;

        try {
            const txt = await file.text();

            const p = panelState(getCurrentPanel());
            const id = (getEditItemId?.() || getSelectedItemId?.());
            const it = p?.items?.find(i => i.id === id);
            if (!it) return;

            if (it.type !== 'svg') { it.type = 'svg'; delete it.text; it.svg = it.svg || {}; }

            it.svg.content = sanitizeSvg(txt);
            it.svg.name = file.name || it.svg.name;
            it.name = it.name || it.svg.name || 'SVG';

            const lbl = document.getElementById('pc-svg-filename');
            if (lbl) lbl.textContent = it.svg.name || '';

            saveState(); repaint(getCurrentSvg());
            document.dispatchEvent(new CustomEvent('pc:objectTypeChanged'));
        } finally {
            if (input) input.value = ''; // safe: uses captured node, not ev.currentTarget
        }
    });
}

// ---- Robust size controls (null-safe, survives DOM swaps) ----

export function bindSvgSizeControls(){
    if (document.body._pcSvgSizeBound) return;
    document.body._pcSvgSizeBound = true;

    document.addEventListener('change', (ev) => {
        const t = ev.target;
        if (!t || !(t instanceof HTMLInputElement)) return;

        if (t.id === 'pc-svg-w' || t.id === 'pc-svg-h' || t.id === 'pc-scale' || t.id === 'pc-preserve') {
            const p = panelState(getCurrentPanel());
            const id = (getEditItemId?.() || getSelectedItemId?.());
            const it = p?.items?.find(i => i.id === id);
            if (!it || it.type !== 'svg') return;

            it.svg = it.svg || {};
            if (t.id === 'pc-svg-w') {
                const v = Number(t.value);
                it.svg.w = (Number.isFinite(v) && v > 0) ? v : undefined;
            } else if (t.id === 'pc-svg-h') {
                const v = Number(t.value);
                it.svg.h = (Number.isFinite(v) && v > 0) ? v : undefined;
            } else if (t.id === 'pc-scale') {
                const v = Number(t.value);
                it.svg.scale = Math.max(1, Number.isFinite(v) ? v : 100);
            } else if (t.id === 'pc-preserve') {
                it.svg.preserveAspect = !!t.checked;
            }
            saveState(); repaint(getCurrentSvg());
        }
    }, true);

    const sync = () => {
        const p = panelState(getCurrentPanel());
        const id = (getEditItemId?.() || getSelectedItemId?.());
        const it = p?.items?.find(i => i.id === id);
        const sv = it?.svg || {};

        const W = document.getElementById('pc-svg-w');
        const H = document.getElementById('pc-svg-h');
        const S = document.getElementById('pc-scale');
        const P = document.getElementById('pc-preserve');
        const F = document.getElementById('pc-svg-filename');

        if (W) W.value = sv.w ?? '';
        if (H) H.value = sv.h ?? '';
        if (S) S.value = sv.scale ?? 100;
        if (P) P.checked = sv.preserveAspect !== false;
        if (F) F.textContent = sv.name || '';
    };

    ['pc:itemSelectionChanged','pc:enterEditChanged','pc:panelChanged','pc:stateRestored','pc:objectTypeChanged']
        .forEach(ev => document.addEventListener(ev, sync));
    requestAnimationFrame(sync);
}
