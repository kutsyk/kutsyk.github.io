// public/js/state.js
// Central state: panels, selection, active cell, UI mode, SVG ref, events.

const STORAGE_KEY = 'pc_state_v1';

export const PANELS = ['Bottom', 'Lid', 'Front', 'Back', 'Left', 'Right'];

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

function defaultPanelState() {
    return { layout: { mode: 'grid', rows: 2, cols: 2, gutter: 2, padding: 4 }, items: [] };
}

let _state = loadState();
let _currentPanel = 'Front';
let _selectedItemId = null;
let _editItemId = null;
let _editOriginal = null;
let _activeCell = null;               // {panel,row,col} or null
let _currentSvg = null;               // bound preview <svg>
let _uiMode = UIMODES.CELL;           // default mode

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    const panels = {};
    PANELS.forEach(p => panels[p] = defaultPanelState());
    return { panels };
}
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
