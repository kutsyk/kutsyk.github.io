import { STORAGE_KEY } from './constants.js';
import { els } from './dom.js';

const defaultPanelState = () => ({
    layout: { mode: 'grid', rows: 2, cols: 2, gutter: 2, padding: 4 },
    items: [] // item: { id, type, name, grid|box, align, text|svg, transform, style, visible }
});

let state = loadState();
let currentPanel = els.panel?.value || 'Front';
let selectedItemId = null;
let editItemId = null;
let editOriginal = null;
let currentSvg = null;

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch {}
    return {
        panels: {
            Bottom: defaultPanelState(),
            Lid:    defaultPanelState(),
            Front:  defaultPanelState(),
            Back:   defaultPanelState(),
            Left:   defaultPanelState(),
            Right:  defaultPanelState()
        }
    };
}
export function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
export function panelState(name = currentPanel) {
    if (!state.panels[name]) state.panels[name] = defaultPanelState();
    return state.panels[name];
}

// getters/setters for cross-module access
export function getStateRef()        { return state; }
export function setCurrentPanel(v)   { currentPanel = v; }
export function getCurrentPanel()    { return currentPanel; }
export function setSelectedItemId(v) { selectedItemId = v; }
export function getSelectedItemId()  { return selectedItemId; }
export function setEditItemId(v)     { editItemId = v; }
export function getEditItemId()      { return editItemId; }
export function setEditOriginal(v)   { editOriginal = v; }
export function getEditOriginal()    { return editOriginal; }
export function setCurrentSvg(v)     { currentSvg = v; }
export function getCurrentSvg()      { return currentSvg; }
