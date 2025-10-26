// js/panel/editor/svg-upload.js
// Upload SVG, sanitize, persist, show filename.

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

// ---------- Inline GLUE: SVG width/height/scale/preserve controls ----------
export function bindSvgSizeControls(){
    const W = document.getElementById('pc-svg-w');
    const H = document.getElementById('pc-svg-h');
    const S = document.getElementById('pc-scale');
    const P = document.getElementById('pc-preserve');

    function patch(fn){
        const p = panelState(getCurrentPanel());
        const id = getEditItemId?.() || getSelectedItemId?.();
        const it = p?.items?.find(i => i.id === id);
        if (!it || it.type !== 'svg') return;
        it.svg = it.svg || {};
        fn(it.svg);
        saveState(); repaint(getCurrentSvg());
    }

    W?.addEventListener('change', () => patch(svg => {
        const v = Number(W.value); svg.w = Number.isFinite(v) && v > 0 ? v : undefined;
    }));
    H?.addEventListener('change', () => patch(svg => {
        const v = Number(H.value); svg.h = Number.isFinite(v) && v > 0 ? v : undefined;
    }));
    S?.addEventListener('change', () => patch(svg => {
        const v = Number(S.value); svg.scale = Math.max(1, Number.isFinite(v) ? v : 100);
    }));
    P?.addEventListener('change', () => patch(svg => { svg.preserveAspect = !!P.checked; }));

    function pull(){
        const p = panelState(getCurrentPanel());
        const id = getEditItemId?.() || getSelectedItemId?.();
        const it = p?.items?.find(i => i.id === id);
        const sv = it?.svg || {};
        if (W) W.value = sv.w ?? '';
        if (H) H.value = sv.h ?? '';
        if (S) S.value = sv.scale ?? 100;
        if (P) P.checked = sv.preserveAspect !== false;
    }
    ['pc:itemSelectionChanged','pc:enterEditChanged','pc:panelChanged','pc:stateRestored'].forEach(ev =>
        document.addEventListener(ev, pull)
    );
    pull();
}

export function bindSvgUpload(){
    const input = document.getElementById('pc-svg-src');
    if (!input || input._pcBound) return; input._pcBound = true;

    input.addEventListener('change', async (e) => {
        const f = e.currentTarget.files?.[0]; if (!f) return;
        try {
            const txt = await f.text();
            const p = panelState(getCurrentPanel());
            const id = (getEditItemId?.() || getSelectedItemId?.());
            const it = p.items.find(i => i.id === id);
            if (!it) return;

            if (it.type !== 'svg') { it.type = 'svg'; delete it.text; it.svg = it.svg || {}; }
            it.svg.content = sanitizeSvg(txt);
            it.svg.name = f.name || it.svg.name;
            it.name = it.name || it.svg.name || 'SVG';
            const lbl = document.getElementById('pc-svg-filename'); if (lbl) lbl.textContent = it.svg.name || '';

            saveState(); repaint(getCurrentSvg());
        } finally {
            e.currentTarget.value = '';
        }
    });
}
