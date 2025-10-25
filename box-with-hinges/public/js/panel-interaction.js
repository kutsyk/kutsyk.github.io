// public/js/panel-interaction.js
// Clickable/dblclickable per-cell overlay, drag-from-palette drop-to-panel,
// active-cell highlight, font-change trigger, and export-time stripping of UI-only nodes.

import {getActiveCell, setActiveCell} from "./panel/state.js";

const NS = 'http://www.w3.org/2000/svg';
const UI_ATTR = 'data-pc-ui';

// ------- DOM refs -------
const els = {
    panelSel:   document.getElementById('pc-panel'),
    rows:       document.getElementById('pc-rows'),
    cols:       document.getElementById('pc-cols'),
    gutter:     document.getElementById('pc-gutter'),
    padding:    document.getElementById('pc-padding'),
    showGuides: document.getElementById('pc-show-guides'),

    // drag palette badges
    dragText:   document.getElementById('pc-drag-text'),
    dragSvg:    document.getElementById('pc-drag-svg'),

    // font dropdown (optional)
    fontFamily: document.getElementById('pc-font-family'),
    fontSize:   document.getElementById('pc-font-size'),
    line:       document.getElementById('pc-line'),

    // grid placement inputs
    row:        document.getElementById('pc-row'),
    col:        document.getElementById('pc-col')
};

// ------- state/render bridge -------
import {
    pc_getPanelState,     // (panelName) -> panel state object
    pc_addItemAtGridCell, // (panelName, type, {row,col}) -> new item id (string)
    pc_renderAll          // (svg) -> re-render items layer
} from './panel-state-bridge.js';

// lazy import for edit entry point
let _pcModule = null;
async function ensurePC() {
    if (_pcModule) return _pcModule;
    _pcModule = await import('./panel-content.js'); // must export pc_enterEdit
    return _pcModule;
}

// ------- grid math -------
function buildGrid(panelBBox, layout) {
    const { x, y, width, height } = panelBBox;
    const pad = Math.max(0, Number(layout.padding) || 0);
    const inner = { x: x + pad, y: y + pad, w: Math.max(1, width - 2 * pad), h: Math.max(1, height - 2 * pad) };
    const rows = Math.max(1, Number(layout.rows) || 1);
    const cols = Math.max(1, Number(layout.cols) || 1);
    const gutter = Math.max(0, Number(layout.gutter) || 0);
    const cellW = (inner.w - gutter * (cols - 1)) / cols;
    const cellH = (inner.h - gutter * (rows - 1)) / rows;
    return { inner, rows, cols, gutter, cellW, cellH };
}
function cellRect(grid, r, c) {
    const x = grid.inner.x + (c - 1) * (grid.cellW + grid.gutter);
    const y = grid.inner.y + (r - 1) * (grid.cellH + grid.gutter);
    return { x, y, w: grid.cellW, h: grid.cellH };
}

// ------- svg helpers -------
function findPanelNode(svg, name) {
    return (
        svg.querySelector(`g[id$="${name}"]`) ||
        svg.querySelector(`path[id$="${name}"]`) ||
        svg.querySelector(`[id$="${name}"]`)
    );
}
function ensureOverlayHost(host, name) {
    let ov = host.querySelector(`#pcGridOverlay_${name}`);
    if (!ov) {
        ov = document.createElementNS(NS, 'g');
        ov.setAttribute('id', `pcGridOverlay_${name}`);
        ov.setAttribute(UI_ATTR, '1'); // strip on export
        host.appendChild(ov);
    } else {
        while (ov.firstChild) ov.removeChild(ov.firstChild);
    }
    return ov;
}
function pointInSvgUserSpace(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const viewport = svg.querySelector('.svg-pan-zoom_viewport') || svg;
    const ctm = viewport.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
}

// ------- form sync helpers -------
function selectPanelInForm(panelName) {
    if (els.panelSel && els.panelSel.value !== panelName) {
        els.panelSel.value = panelName;
        els.panelSel.dispatchEvent(new Event('change', { bubbles: true }));
    }
}
function setCellInForm(row, col) {
    if (els.row) { els.row.value = String(row); els.row.dispatchEvent(new Event('input', { bubbles: true })); }
    if (els.col) { els.col.value = String(col); els.col.dispatchEvent(new Event('input', { bubbles: true })); }
}

// ------- overlay painting -------
function renderOverlayForPanel(svg, panelName) {
    const host = findPanelNode(svg, panelName);
    if (!host) return;

    const p = pc_getPanelState(panelName);
    if (p.layout?.mode !== 'grid') {
        host.querySelector(`#pcGridOverlay_${panelName}`)?.remove();
        return;
    }

    const ov = ensureOverlayHost(host, panelName);
    const bbox = host.getBBox();
    const grid = buildGrid(bbox, p.layout);
    const ac = getActiveCell();
    const active = (ac && ac.panel === panelName) ? { row: ac.row, col: ac.col } : null;


    // per-cell overlay, click = select cell, dblclick = select panel+cell into form
    for (let r = 1; r <= grid.rows; r++) {
        for (let c = 1; c <= grid.cols; c++) {
            const rect = cellRect(grid, r, c);
            const cell = document.createElementNS(NS, 'rect');
            cell.setAttribute('x', rect.x);
            cell.setAttribute('y', rect.y);
            cell.setAttribute('width', rect.w);
            cell.setAttribute('height', rect.h);
            cell.setAttribute('stroke', 'transparent');
            cell.setAttribute('stroke-width', '0.3');
            cell.setAttribute(UI_ATTR, '1');

            const isActive = !!active && active.row === r && active.col === c;
            cell.setAttribute('fill', isActive ? 'rgba(99,102,241,.18)' : 'transparent');

            cell.dataset.row = String(r);
            cell.dataset.col = String(c);

            cell.addEventListener('mouseenter', () => cell.setAttribute('stroke', '#93c5fd'));
            cell.addEventListener('mouseleave', () => cell.setAttribute('stroke', 'transparent'));

            cell.addEventListener('click', async () => {
                setActiveCell({ panel: panelName, row: r, col: c });
                pi_refreshAllOverlays(svg);
                renderOverlayForPanel(svg, panelName);
                const mod = await ensurePC();
                mod.pc_clearSelection?.();                 // NEW: hide delete cross
                renderOverlayForPanel(svg, panelName);
            });

            cell.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                selectPanelInForm(panelName);
                setActiveCell({ panel: panelName, row: r, col: c });
                pi_refreshAllOverlays(svg);
                setCellInForm(r, c);
                renderOverlayForPanel(svg, panelName);
            });

            ov.appendChild(cell);
        }
    }

    // host background dblclick → compute hit cell and activate in form
    attachPanelBackgroundDblclick(svg, host, panelName, grid);
}

function attachPanelBackgroundDblclick(svg, host, panelName, grid) {
    // ensure only one listener
    host.removeEventListener('dblclick', host._pcBgDbl);
    host._pcBgDbl = (e) => {
        if (e.target && e.target.hasAttribute && e.target.hasAttribute(UI_ATTR)) return; // overlay handled
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // hit-test → set active cell
        // if (e.target && e.target.hasAttribute && e.target.hasAttribute(UI_ATTR)) return;
        const p = pointInSvgUserSpace(svg, e.clientX, e.clientY);
        let hit = { row: 1, col: 1 };
        for (let r = 1; r <= grid.rows; r++) {
            for (let c = 1; c <= grid.cols; c++) {
                const rect = cellRect(grid, r, c);
                if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
                    hit = { row: r, col: c };
                }
            }
        }
        selectPanelInForm(panelName);
        setActiveCell({ panel: panelName, row: hit.row, col: hit.col });
        pi_refreshAllOverlays(svg);
        setCellInForm(hit.row, hit.col);
        renderOverlayForPanel(svg, panelName);
    };
    host.addEventListener('dblclick', host._pcBgDbl);

    host.removeEventListener('click', host._pcBgClick);
    host._pcBgClick = (e) => {
        if (e.target && e.target.hasAttribute && e.target.hasAttribute(UI_ATTR)) return;
        setActiveCell(null);
        pi_refreshAllOverlays(svg);
        renderOverlayForPanel(svg, panelName);
    };
    host.addEventListener('click', host._pcBgClick);

}

// ------- drag palette -------
function setupDragPalette(svg) {
    const start = (type) => (e) => {
        e.dataTransfer?.setData('text/plain', type);
        e.dataTransfer?.setDragImage(ghost(type), 8, 8);
    };
    els.dragText?.addEventListener('dragstart', start('text'));
    els.dragSvg?.addEventListener('dragstart', start('svg'));

    ['Bottom', 'Lid', 'Front', 'Back', 'Left', 'Right'].forEach(name => attachDropToPanel(svg, name));
}
function ghost(label) {
    const g = document.createElement('canvas');
    g.width = 64; g.height = 24;
    const ctx = g.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, g.width, g.height);
    ctx.fillStyle = '#fff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(label.toUpperCase(), 6, 16);
    return g;
}
function attachDropToPanel(svg, name) {
    const host = findPanelNode(svg, name);
    if (!host) return;

    host.addEventListener('dragover', (e) => { e.preventDefault(); });

    host.addEventListener('drop', async (e) => {
        e.preventDefault();

        const type = e.dataTransfer?.getData('text/plain') || 'text';
        const pane = pc_getPanelState(name);
        if (pane.layout?.mode !== 'grid') return;

        const pxy  = pointInSvgUserSpace(svg, e.clientX, e.clientY);
        const grid = buildGrid(host.getBBox(), pane.layout);

        // hit-test
        let hit = { row: 1, col: 1 };
        for (let rr = 1; rr <= grid.rows; rr++) {
            for (let cc = 1; cc <= grid.cols; cc++) {
                const rect = cellRect(grid, rr, cc);
                if (pxy.x >= rect.x && pxy.x <= rect.x + rect.w && pxy.y >= rect.y && pxy.y <= rect.y + rect.h) {
                    hit = { row: rr, col: cc };
                }
            }
        }

        // create item in that cell
        let newId = pc_addItemAtGridCell(name, type, hit);
        if (!newId) {
            const items = pc_getPanelState(name).items;
            newId = items.length ? items[items.length - 1].id : null;
        }

        // sync UI and active cell (global)
        selectPanelInForm(name);
        setActiveCell({ panel: name, row: hit.row, col: hit.col });   // <-- global active cell
        setCellInForm(hit.row, hit.col);                               // <-- FIX: use hit.row/col

        // refresh
        pi_refreshAllOverlays(svg);
        pc_renderAll(svg);

        // enter edit mode
        const mod = await ensurePC();
        if (newId && typeof mod.pc_enterEdit === 'function') mod.pc_enterEdit(name, newId);
    });

}

// ------- font change hooks (optional) -------
if (els.fontFamily) {
    els.fontFamily.addEventListener('change', () => {
        const svg = document.querySelector('#out svg');
        if (svg) pc_renderAll(svg);
    });
}
if (els.fontSize) {
    els.fontSize.addEventListener('input', () => {
        const svg = document.querySelector('#out svg');
        if (svg) pc_renderAll(svg);
    });
}
if (els.line) {
    els.line.addEventListener('input', () => {
        const svg = document.querySelector('#out svg');
        if (svg) pc_renderAll(svg);
    });
}

// ------- public API -------
export function pi_onGeometryChanged(svg) {
    ['Bottom', 'Lid', 'Front', 'Back', 'Left', 'Right'].forEach(name => renderOverlayForPanel(svg, name));
    setupDragPalette(svg);
}
export function pi_beforeDownload(svgClone) {
    svgClone.querySelectorAll(`[${UI_ATTR}]`).forEach(n => n.remove());
}

import { PANELS } from './panel/constants.js';
export function pi_refreshAllOverlays(svg) {
    PANELS.forEach(name => renderOverlayForPanel(svg, name));
}