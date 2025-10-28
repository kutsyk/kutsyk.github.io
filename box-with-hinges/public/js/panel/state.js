// public/js/state.js
// Central state: panels, selection, active cell, UI mode, SVG ref, events.

import {pc_getStateRef, pc_save} from "./edit.js";
import {PANELS, STORAGE_KEY} from "./constants.js";

// UI modes
export const UIMODES = Object.freeze({ PANEL: 'panel', CELL: 'cell', OBJECT: 'object' });

// Consistent per-panel colors
const PANEL_COLORS = {
    Front:  '#6366f1', // indigo
    Back:   '#06b6d4', // cyan
    Left:   '#84cc16', // lime
    Right:  '#f59e0b', // amber
    Lid:    '#ec4899', // pink
    Bottom: '#22c55e'  // green
};

export function panelColor(name) { return PANEL_COLORS[name] || '#60a5fa'; }

let _state = loadState();
let _currentPanel = 'Front';
let _selectedItemId = null;
let _editItemId = null;
let _editOriginal = null;
let _activeCell = null;               // {panel,row,col} or null
let _currentSvg = null;               // bound preview <svg>
let _uiMode = UIMODES.CELL;           // default mode

export function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); }
export function getStateRef() { return _state; }

export function getCurrentPanel() { return _currentPanel; }
export function setCurrentPanel(name) {
    if (!name || !_state.panels[name]) return;
    if (_currentPanel === name) return;
    _currentPanel = name;
    document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: name }));
}

export function panelState(name = _currentPanel) {
    if (!_state.panels[name]) _state.panels[name] = defaultPanelState();
    return _state.panels[name];
}

export function getSelectedItemId() { return _selectedItemId; }
export function setSelectedItemId(v) { _selectedItemId = v; }

export function getEditItemId() { return _editItemId; }
export function setEditItemId(v) { _editItemId = v; }

export function getEditOriginal() { return _editOriginal; }
export function setEditOriginal(v) { _editOriginal = v; }

export function getActiveCell() { return _activeCell; }
export function setActiveCell(v) {
    _activeCell = v ? { panel: v.panel, row: v.row, col: v.col } : null;
    document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: _activeCell }));
}

export function getCurrentSvg() { return _currentSvg; }
export function setCurrentSvg(svg) { _currentSvg = svg; }

export function getUiMode() { return _uiMode; }
export function setUiMode(mode) {
    if (!mode || mode === _uiMode) return;
    _uiMode = mode;
    document.dispatchEvent(new CustomEvent('pc:modeChanged', { detail: mode }));
}
export function pc_getLayout(name) {
    const S = pc_getStateRef();
    const P = S.panels[name] || (S.panels[name] = { layout:{mode:'grid',rows:2,cols:2,gutter:2,padding:4}, items:[] });
    const L = P.layout;
    if (!Array.isArray(L.rowPercents) || L.rowPercents.length !== L.rows) {
        L.rowPercents = Array.from({length:L.rows}, ()=> 100 / L.rows);
    }
    if (!Array.isArray(L.colPercents) || L.colPercents.length !== L.cols) {
        L.colPercents = Array.from({length:L.cols}, ()=> 100 / L.cols);
    }
    return L;
}
export function pc_setRowPercents(name, arr) {
    const L = pc_getLayout(name);
    const n = L.rows;
    const v = (arr||[]).slice(0, n).map(Number);
    while (v.length < n) v.push(0);
    const sum = v.reduce((a,b)=>a+(isFinite(b)?b:0),0) || 100;
    const norm = v.map(x => Math.max(0, (isFinite(x)?x:0) * 100 / sum));
    L.rowPercents = norm;
    pc_save();
    return norm;
}
export function pc_setColPercents(name, arr) {
    const L = pc_getLayout(name);
    const n = L.cols;
    const v = (arr||[]).slice(0, n).map(Number);
    while (v.length < n) v.push(0);
    const sum = v.reduce((a,b)=>a+(isFinite(b)?b:0),0) || 100;
    const norm = v.map(x => Math.max(0, (isFinite(x)?x:0) * 100 / sum));
    L.colPercents = norm;
    pc_save();
    return norm;
}
export function pc_rebalancePercents(name) {
    const L = pc_getLayout(name);
    L.rowPercents = Array.from({length:L.rows}, ()=> 100 / L.rows);
    L.colPercents = Array.from({length:L.cols}, ()=> 100 / L.cols);
    pc_save();
}

export function defaultPanelState() {
    return { layout: { mode: 'grid', rows: 2, cols: 1, gutter: 2, padding: 4 }, items: [] };
}

export function pc_selectItem(panelName, itemId) {
    const S = pc_getStateRef();
    if (!S._ui) S._ui = {};
    S._ui.activePanel = panelName;
    S._ui.selectedItemId = itemId;
    S._ui.editItemId = null;
    pc_save();
    document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail: { id: itemId, panel: panelName }}));
}

export function pc_clearSelection() {
    const S = pc_getStateRef();
    if (!S._ui) S._ui = {};
    S._ui.selectedItemId = null;
    S._ui.editItemId = null;
    pc_save();
    document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail: { id: null, panel: S._ui.activePanel }}));
}
// change loadState to accept a fresh flag
function loadState(fresh = false) {
    if (!fresh) {
        try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch {}
    }
    const panels = {};
    PANELS.forEach(p => panels[p] = defaultPanelState());
    return { panels };
}

// NEW: fully reset this module’s internal state
export function resetAllPanelsInModule() {
    _state = loadState(true);
    _currentPanel = 'Front';
    _selectedItemId = null;
    _editItemId = null;
    _editOriginal = null;
    _activeCell = null;
    saveState();
}


