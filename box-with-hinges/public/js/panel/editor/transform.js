// js/panel/editor/transform.js
// Rotate & mirror controls — updates only item.transform.

import { currentItem, repaint, saveState, getCurrentSvg } from './helpers.js';

export function bindTransformControls(){
    const rot    = document.getElementById('pc-rotate');        // range [-180..180]
    const rotNum = document.getElementById('pc-rotate-num');    // number
    const rotBtns= document.querySelectorAll('.pc-rot-p');      // preset buttons
    const mxBtn  = document.getElementById('pc-mirror-x-btn');
    const myBtn  = document.getElementById('pc-mirror-y-btn');
    const mxChk  = document.getElementById('pc-mirror-x');      // hidden checkbox
    const myChk  = document.getElementById('pc-mirror-y');      // hidden checkbox

    if (!rot || rot._pcBound) return; rot._pcBound = true;

    const clamp = v => Math.max(-180, Math.min(180, Number(v)||0));
    const syncInputs = v => {
        const vv = String(clamp(v));
        if (rot)    { rot.value = vv;    rot.setAttribute('value', vv); }
        if (rotNum) { rotNum.value = vv; rotNum.setAttribute('value', vv); }
    };
    const patchTransform = t => {
        const it = currentItem(); if (!it) return;
        it.transform = { ...(it.transform||{}), ...t };
        saveState(); repaint(getCurrentSvg());
    };
    const syncFromItem = () => {
        const it = currentItem(); const tr = it?.transform || {};
        syncInputs(Number.isFinite(tr.rotate) ? tr.rotate : 0);
        const mx = !!tr.mirrorX, my = !!tr.mirrorY;
        if (mxChk) mxChk.checked = mx;
        if (myChk) myChk.checked = my;
        if (mxBtn) mxBtn.classList.toggle('active', mx);
        if (myBtn) myBtn.classList.toggle('active', my);
    };

    rot.addEventListener('input', (e) => {
        e.stopImmediatePropagation(); e.stopPropagation();
        const v = clamp(rot.value);
        syncInputs(v);
        patchTransform({ rotate: v });
    });
    rot.addEventListener('change', (e) => {
        e.stopImmediatePropagation(); e.stopPropagation();
        const v = clamp(rot.value);
        syncInputs(v);
        patchTransform({ rotate: v });
    });
    rotNum?.addEventListener('change', (e) => {
        e.stopImmediatePropagation(); e.stopPropagation();
        const v = clamp(rotNum.value);
        syncInputs(v);
        patchTransform({ rotate: v });
    });

    rotBtns.forEach(b => b.addEventListener('click', () => {
        const v = clamp(b.dataset.val);
        syncInputs(v);
        patchTransform({ rotate: v });
    }));
    mxBtn?.addEventListener('click', () => {
        const next = !(mxChk?.checked); if (mxChk) mxChk.checked = next;
        mxBtn.classList.toggle('active', next);
        patchTransform({ mirrorX: next });
    });
    myBtn?.addEventListener('click', () => {
        const next = !(myChk?.checked); if (myChk) myChk.checked = next;
        myBtn.classList.toggle('active', next);
        patchTransform({ mirrorY: next });
    });

    ['pc:panelChanged','pc:activeCellChanged','pc:itemSelectionChanged','pc:enterEditChanged','pc:stateRestored']
        .forEach(ev => document.addEventListener(ev, syncFromItem));
    requestAnimationFrame(syncFromItem);
}
