// js/panel/editor/appearance.js
// Fill / Stroke / Opacity / Invert — updates only item.style (+invert flag).

import { currentItem, repaint, saveState, getCurrentSvg } from './helpers.js';

const DEF_FILL   = '#000000';
const DEF_STROKE = '#000000';
const PALETTE = ['#000000','#ffffff','#e11d48','#f59e0b','#84cc16','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#14b8a6','#ef4444','#f97316'];

function commitStyle(patch){
    const it = currentItem(); if (!it) return;
    it.style = { ...(it.style||{}), ...patch };
    saveState(); repaint(getCurrentSvg());
}

function sync(){
    const it = currentItem(); const st = it?.style || {};
    const f = st.fill ?? DEF_FILL;
    const s = st.stroke ?? DEF_STROKE;

    const fill       = document.getElementById('pc-fill');
    const fillNone   = document.getElementById('pc-fill-none');
    const strokeC    = document.getElementById('pc-stroke-color');
    const strokeNone = document.getElementById('pc-stroke-none');
    const strokeW    = document.getElementById('pc-stroke');
    const opac       = document.getElementById('pc-opacity');
    const invert     = document.getElementById('pc-invert');

    if (fill)      { fill.disabled = (f==='none'); if (f!=='none' && /^#/.test(f)) fill.value=f; }
    if (fillNone)  fillNone.checked = (f==='none');

    if (strokeC)   { strokeC.disabled = (s==='none'); if (s!=='none' && /^#/.test(s)) strokeC.value=s; }
    if (strokeNone) strokeNone.checked = (s==='none');

    if (strokeW)   { strokeW.disabled = (s==='none'); strokeW.value=String(st.strokeW ?? 0.35); }
    if (opac)      opac.value = String(st.opacity ?? 100);
    if (invert)    invert.checked = !!(it?.svg?.invert || it?.text?.invert);
}

function buildSwatches(){
    document.querySelectorAll('.pc-swatches').forEach(box => {
        if (box._pcBuilt) return; box._pcBuilt = true;

        const none = document.createElement('div');
        none.className = 'sw'; none.dataset.none = '1'; none.title = 'None';
        none.addEventListener('click', () => {
            const t = box.getAttribute('data-for');
            if (t === 'pc-fill')        document.getElementById('pc-fill-none')?.click();
            if (t === 'pc-stroke-color')document.getElementById('pc-stroke-none')?.click();
        });
        box.appendChild(none);

        PALETTE.forEach(hex => {
            const sw = document.createElement('div'); sw.className='sw'; sw.style.background=hex; sw.title=hex;
            sw.addEventListener('click', () => {
                const id = box.getAttribute('data-for');
                const input = document.getElementById(id);
                if (!input) return;
                if (id === 'pc-fill') {
                    const cb = document.getElementById('pc-fill-none'); if (cb?.checked){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); }
                } else if (id === 'pc-stroke-color'){
                    const cb = document.getElementById('pc-stroke-none'); if (cb?.checked){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); }
                }
                input.value = hex;
                input.dispatchEvent(new Event('change',{bubbles:true}));
            });
            box.appendChild(sw);
        });
    });
}

export function bindAppearance(){
    buildSwatches();

    const fill       = document.getElementById('pc-fill');
    const fillNone   = document.getElementById('pc-fill-none');
    const strokeC    = document.getElementById('pc-stroke-color');
    const strokeNone = document.getElementById('pc-stroke-none');
    const strokeW    = document.getElementById('pc-stroke');
    const opac       = document.getElementById('pc-opacity');
    const invert     = document.getElementById('pc-invert');

    fill?.addEventListener('change', () => commitStyle({ fill: fill.value || DEF_FILL }));
    strokeC?.addEventListener('change', () => commitStyle({ stroke: strokeC.value || DEF_STROKE }));
    strokeW?.addEventListener('change', () => commitStyle({ strokeW: Number(strokeW.value)||0 }));
    opac?.addEventListener('change', () => commitStyle({ opacity: Math.max(0, Math.min(100, Number(opac.value)||0)) }));

    fillNone?.addEventListener('change', () => {
        const on = !!fillNone.checked; if (fill) fill.disabled = on;
        commitStyle({ fill: on ? 'none' : (fill?.value || DEF_FILL) });
    });
    strokeNone?.addEventListener('change', () => {
        const on = !!strokeNone.checked;
        if (strokeC) strokeC.disabled = on;
        if (strokeW) strokeW.disabled = on;
        commitStyle({ stroke: on ? 'none' : (strokeC?.value || DEF_STROKE) });
    });

    invert?.addEventListener('change', () => {
        const it = currentItem(); if (!it) return;
        if (it.type === 'svg') { it.svg = it.svg || {}; it.svg.invert = !!invert.checked; }
        else { it.text = it.text || {}; it.text.invert = !!invert.checked; }
        saveState(); repaint(getCurrentSvg());
    });

    ['pc:activeCellChanged','pc:itemSelectionChanged','pc:enterEditChanged'].forEach(ev =>
        document.addEventListener(ev, sync)
    );
    sync();
}
