// js/panel/editor/palette.js
// “Add Elements” palette: drag-and-click create items.

import { getActiveCell, repaint, getCurrentSvg, getCurrentPanel, panelState } from './helpers.js';
import { nid } from '../utils.js';
import { pc_activateEditorTab, pc_enterEdit } from './selection.js';

function normalize(kind){ return String(kind||'').includes('svg') ? 'svg' : 'text'; }

export function bindPalette(){
    const btnText = document.getElementById('pc-drag-text');
    const btnSvg  = document.getElementById('pc-drag-svg');

    const makeDraggable = (el, kind) => {
        if (!el || el._pcBound) return; el._pcBound = true;
        el.setAttribute('draggable','true');
        el.addEventListener('dragstart', (e) => {
            try{ e.dataTransfer.setData('text/plain', kind); e.dataTransfer.effectAllowed='copy'; }catch{}
            window._lastDragKind = kind;
        }, {capture:true});
        el.addEventListener('click', () => addToActive(kind));
    };

    function addToActive(kind){
        const ac = getActiveCell() || { panel: getCurrentPanel() || 'Front', row:1, col:1 };
        const p  = panelState(ac.panel);
        const id = nid();
        const t  = normalize(kind);
        const item = {
            id, type: t, name: t==='svg'?'SVG':'Text',
            grid: {row: ac.row, col: ac.col, rowSpan:1, colSpan:1},
            align: {h:'center', v:'middle'},
            transform: {rotate:0, mirrorX:false, mirrorY:false},
            style: {fill:'#000000', stroke:'#000000', strokeW:0.35, opacity:100},
            visible: true,
            ...(t==='svg'
                ? { svg:{ content:'', scale:100, preserveAspect:true, invert:false } }
                : { text:{ value:'enter your text', fontFamily:'Inter', size:4, line:1.2 } })
        };
        p.items.push(item);
        repaint(getCurrentSvg());
        pc_activateEditorTab('object'); pc_enterEdit(ac.panel, id);
    }

    makeDraggable(btnText, 'text');
    makeDraggable(btnSvg, 'svg');
}
