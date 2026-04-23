// js/panel/editor/index.js
// Single-file orchestrator with inlined glue to avoid edits elsewhere.

import { bindLayoutForm, bindSizeModals } from './layout.js';
import { bindTransformControls } from './transform.js';
import { bindAppearance } from './appearance.js';
import { bindTextProps } from './text.js';
import {bindSvgSizeControls, bindSvgUpload} from './svg-upload.js';
import { bindCellConfig } from './cells.js';
import { bindPalette } from './palette.js';
import { pc_enterEdit, pc_activateEditorTab } from './selection.js';

import {
    panelState, getCurrentSvg, saveState, repaint,
    getCurrentPanel, setCurrentSvg, setActiveCell,
    getSelectedItemId, setSelectedItemId,
    getEditItemId, getActiveCell, setCurrentPanel
} from './helpers.js';

import { nid, bindSvgDeselect } from '../utils.js';
import {bindAlignControls} from "./align.js";
import {pc_clearSelection} from "../state.js";
import {bindTextCaseControls} from "./textcase.js";

// ---------- Inline GLUE: Object type UI toggle (Text vs SVG) ----------
function bindObjectTypeUI(){
    function sync(){
        const pctype   = document.getElementById('pc-type'); // hidden, kept for compat
        const textWrap = document.getElementById('pc-text-props');
        const svgWrap  = document.getElementById('pc-svg-props');
        const svgName  = document.getElementById('pc-svg-filename');

        const p = panelState(getCurrentPanel());
        const id = getEditItemId?.() || getSelectedItemId?.();
        const it = p?.items?.find(i => i.id === id);
        const type = (it?.type === 'svg') ? 'svg' : 'text';

        if (pctype) pctype.value = type;
        if (textWrap) textWrap.classList.toggle('d-none', type !== 'text');
        if (svgWrap)  svgWrap.classList.toggle('d-none',  type !== 'svg');
        if (svgName)  svgName.textContent = it?.svg?.name || '';
    }

    ['pc:itemSelectionChanged','pc:enterEditChanged','pc:panelChanged','pc:stateRestored','pc:objectTypeChanged']
        .forEach(ev => document.addEventListener(ev, sync));
    requestAnimationFrame(sync);
}

// ---------- Optional: ensure layout form tracks active panel ----------
function emitPanelChangedIfNeeded(){
    function announce(name){
        if (!name) return;
        if (getCurrentPanel?.() !== name) setCurrentPanel(name);
        document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail:{ name } }));
    }

    // 1) From active cell changes (clicking in preview)
    document.addEventListener('pc:activeCellChanged', (e) => {
        announce(e.detail?.panel || getActiveCell()?.panel);
    });

    // 2) From tree selection (structure tree usually emits one of these)
    ['pc:treePanelSelected','pc:panelSelected','pc:treeSelectionChanged'].forEach(ev => {
        document.addEventListener(ev, (e) => {
            announce(e.detail?.panel || e.detail?.name || e.detail);
        });
    });

    // 3) On state restore / initial load
    document.addEventListener('pc:stateRestored', () => announce(getCurrentPanel?.()));

    // 4) Fire once at startup to sync the Layout form immediately
    requestAnimationFrame(() => announce(getCurrentPanel?.()));
}

// ---------- Public init ----------
export function initEditing(){
    bindLayoutForm();
    bindSizeModals();
    bindTransformControls();
    bindAppearance();
    bindTextProps();
    bindSvgUpload();
    bindSvgSizeControls();   // inline glue
    bindCellConfig();
    bindPalette();
    bindAlignControls();
    bindTextCaseControls();
    bindObjectTypeUI();      // inline glue
    emitPanelChangedIfNeeded();
}

export { pc_enterEdit, pc_activateEditorTab };

// ----- Back-compat surface (legacy entry points other modules expect) -----
export function pc_renderAll(svg){ const s = svg || getCurrentSvg(); if (s) repaint(s); }

let _S = window.__PC_STATE__ || { panels:{}, _ui:{} };
export function pc_getStateRef(){ return _S; }
export function pc_setStateRef(next){
    _S = next || { panels:{}, _ui:{} };
    if(!_S.panels) _S.panels = {};
    if(!_S._ui) _S._ui = {};
}

// export function pc_getStateRef(){
//     return {
//         panels: {
//             Bottom: panelState('Bottom'),
//             Lid:    panelState('Lid'),
//             Front:  panelState('Front'),
//             Back:   panelState('Back'),
//             Left:   panelState('Left'),
//             Right:  panelState('Right')
//         }
//     };
// }
export function pc_getPanelState(name){ return panelState(name); }
export function pc_save(){ saveState(); }

export function pc_deleteItem(panelName, itemId){
    const p = panelState(panelName);
    p.items = p.items.filter(i => i.id !== itemId);
    if (getSelectedItemId() === itemId) setSelectedItemId(null);
    saveState(); repaint(getCurrentSvg());
}

export function pc_bindSvg(svg){
    setCurrentSvg(svg);
    // click-outside deselect: if your utils has a better hook, it can remain; otherwise minimal:
    bindSvgDeselect?.(svg, () => {
        pc_clearSelection();
        setActiveCell(null);
        setSelectedItemId(null);
        document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail:{ id: null } }));
        repaint(svg);
    });
}

export function pc_createItemInCell(panelName, kind, cell, initial = {}){
    const p = panelState(panelName);
    if (!p) return null;
    const type = String(kind||'').toLowerCase().includes('svg') ? 'svg' : 'text';
    const id = nid();
    const item = {
        id, type,
        name: initial.name || (type === 'svg' ? 'SVG' : 'Text'),
        visible: true,
        grid: { row: Number(cell?.row)||1, col: Number(cell?.col)||1, rowSpan: Number(initial.rowSpan)||1, colSpan: Number(initial.colSpan)||1 },
        align: { h: initial.alignH || 'center', v: initial.alignV || 'middle' },
        transform: { rotate: Number(initial.rotate)||0, mirrorX: !!initial.mirrorX, mirrorY: !!initial.mirrorY },
        style: {
            fill:   typeof initial.fill   === 'string' ? initial.fill   : '#000000',
            stroke: typeof initial.stroke === 'string' ? initial.stroke : '#000000',
            strokeW: Number(initial.strokeW) || 0.35,
            opacity: Math.max(0, Math.min(100, Number(initial.opacity ?? 100)))
        },
        ...(type==='svg'
            ? { svg:{ content:String(initial.svgContent||''), name: initial.svgName||'', scale:Number(initial.scale)||100, preserveAspect: initial.preserveAspect !== false, invert: !!initial.invert } }
            : { text:{ value:String(initial.textValue||'enter your text'), fontFamily: initial.fontFamily||'Inter', size:Number(initial.size)||4, line:Number(initial.line)||1.2 } })
    };
    p.items.push(item);
    saveState(); repaint(getCurrentSvg());
    document.dispatchEvent(new CustomEvent('pc:objectTypeChanged'));
    return id;
}

export function pc_setItemType(panelName, itemId, type) {
    const p = panelState(panelName);
    const it = p.items.find(i => i.id === itemId);
    if (!it) return;
    const toSvg = String(type).toLowerCase().includes('svg');
    if (toSvg && it.type !== 'svg') {
        it.type = 'svg'; delete it.text; it.svg = it.svg || {content:'', scale:100, preserveAspect:true, invert:false};
    } else if (!toSvg && it.type !== 'text') {
        it.type = 'text'; delete it.svg; it.text = it.text || {value:'enter your text', fontFamily:'Inter', size:4, line:1.2};
    }
    saveState(); repaint(getCurrentSvg());
    document.dispatchEvent(new CustomEvent('pc:objectTypeChanged'));
}

// no-op kept for compatibility
export function pc_forceType(_type){  }
