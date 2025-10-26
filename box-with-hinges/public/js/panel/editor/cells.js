// js/panel/editor/cells.js
// Per-cell config modal: pad and alignment overrides.

import { getActiveCell, repaint, getCurrentSvg } from './helpers.js';
import { pc_getCellConfig, pc_setCellConfig } from '../../panel-state-bridge.js';

export function bindCellConfig(){
    const btn = document.getElementById('pc-cell-config-open');
    if (btn && !btn._pcBound){
        btn._pcBound = true;
        document.addEventListener('pc:activeCellChanged', () => {
            const ac = getActiveCell(); const enabled = !!(ac && ac.panel && ac.row && ac.col);
            btn.disabled = !enabled; btn.title = enabled ? `Edit cell R${ac?.row} C${ac?.col}` : 'Select a cell';
        });
    }

    const rI = document.getElementById('pcm-cell-row');
    const cI = document.getElementById('pcm-cell-col');
    const pI = document.getElementById('pcm-cell-pad');
    const ah = document.getElementById('pcm-cell-align-h');
    const av = document.getElementById('pcm-cell-align-v');

    const fill = () => {
        const ac = getActiveCell(); if (!ac) return;
        if (rI) rI.value = ac.row||''; if (cI) cI.value = ac.col||'';
        const cfg = pc_getCellConfig(ac.panel, ac.row, ac.col) || {};
        if (pI) pI.value = (cfg.pad ?? '');
        if (ah) ah.value = cfg.ah || '';
        if (av) av.value = cfg.av || '';
    };

    const save = () => {
        const ac = getActiveCell(); if (!ac) return;
        pc_setCellConfig(ac.panel, ac.row, ac.col, {
            pad: (pI && pI.value !== '') ? Number(pI.value) : undefined,
            ah:  (ah?.value || undefined),
            av:  (av?.value || undefined)
        });
        repaint(getCurrentSvg());
    };

    const clear = () => {
        const ac = getActiveCell(); if (!ac) return;
        pc_setCellConfig(ac.panel, ac.row, ac.col, null);
        fill(); repaint(getCurrentSvg());
    };

    document.getElementById('pcm-cell-save')?.addEventListener('click', save);
    document.getElementById('pcm-cell-clear')?.addEventListener('click', clear);
    document.addEventListener('pc:activeCellChanged', fill);
    fill();
}
