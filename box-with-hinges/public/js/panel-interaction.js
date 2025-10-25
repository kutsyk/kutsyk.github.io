// js/panel-interaction.js
// Overlays: panel frame, global layout grid lines, active-cell highlight, cell hit-rects,
// drag-and-drop targets. Renders on ALL detected panels.

import {getCurrentPanel, setCurrentPanel, getActiveCell, setActiveCell, setSelectedItemId} from './panel/state.js';
import {pc_getPanelState, pc_addItemAtGridCell, pc_renderAll} from './panel-state-bridge.js';

const NS = 'http://www.w3.org/2000/svg';
const UI_ATTR = 'data-pc-ui';

const PANEL_COLORS = {
    Front: '#6366f1', Back: '#06b6d4', Left: '#84cc16',
    Right: '#f59e0b', Lid: '#ec4899', Bottom: '#22c55e'
};
const panelColor = n => PANEL_COLORS[n] || '#60a5fa';

// ---------- helpers ----------
function ensureOverlay(svg, id) {
    let ov = svg.querySelector(`#${id}`);
    if (!ov) {
        ov = document.createElementNS(NS, 'g');
        ov.setAttribute('id', id);
        ov.setAttribute(UI_ATTR, '1');
        ov.setAttribute('pointer-events', 'none');
        svg.appendChild(ov);
    }
    return ov;
}

function safeLen(v, min = 0.01) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, n) : min;
}

function pointInSvgUserSpace(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const viewport = svg.querySelector('.svg-pan-zoom_viewport') || svg;
    const ctm = viewport.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : {x: 0, y: 0};
}

function hexToRgba(hex, a) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return `rgba(96,165,250,${a})`;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${a})`;
}

// detect panels from the live SVG (don’t rely on PANELS import)
function listFoundPanels(svg) {
    const CANDIDATES = ['Bottom', 'Lid', 'Front', 'Back', 'Left', 'Right'];
    const out = [];
    for (const n of CANDIDATES) {
        const host =
            svg.querySelector(`g[id$="${n}"]`) ||
            svg.querySelector(`path[id$="${n}"]`) ||
            svg.querySelector(`[id$="${n}"]`);
        if (host) out.push({name: n, host});
    }
    return out;
}

// grid math (clamped)
function buildGrid(panelBBox, layout) {
    const {x, y, width, height} = panelBBox;

    const pad = Math.max(0, Number(layout.padding) || 0);
    const rows = Math.max(1, Number(layout.rows) || 1);
    const cols = Math.max(1, Number(layout.cols) || 1);
    const gutter = Math.max(0, Number(layout.gutter) || 0);

    const rawInnerW = Math.max(0, width - 2 * pad);
    const rawInnerH = Math.max(0, height - 2 * pad);

    const totalGutterW = gutter * (cols - 1);
    const totalGutterH = gutter * (rows - 1);

    const usableW = Math.max(0, rawInnerW - Math.max(0, totalGutterW));
    const usableH = Math.max(0, rawInnerH - Math.max(0, totalGutterH));

    const cellW = safeLen(usableW / cols);
    const cellH = safeLen(usableH / rows);

    return {
        inner: {x: x + pad, y: y + pad, w: safeLen(rawInnerW), h: safeLen(rawInnerH)},
        rows, cols, gutter, cellW, cellH
    };
}

function cellRect(grid, r, c) {
    const x = grid.inner.x + (c - 1) * (grid.cellW + grid.gutter);
    const y = grid.inner.y + (r - 1) * (grid.cellH + grid.gutter);
    return {x, y, w: safeLen(grid.cellW), h: safeLen(grid.cellH)};
}

// ---------- drawing ----------
function drawPanelFrame(ov, host, name) {
    const color = panelColor(name);
    let bb;
    try {
        bb = host.getBBox();
    } catch {
        return;
    }
    const pad = 0.6;
    const rx = document.createElementNS(NS, 'rect');
    rx.setAttribute('x', String(bb.x - pad));
    rx.setAttribute('y', String(bb.y - pad));
    rx.setAttribute('width', String(bb.width + pad * 2));
    rx.setAttribute('height', String(bb.height + pad * 2));
    rx.setAttribute('fill', 'none');
    rx.setAttribute('stroke', color);
    rx.setAttribute('stroke-width', '1.2');
    rx.setAttribute('stroke-dasharray', '4 2');
    ov.appendChild(rx);
}

function drawGridLines(ov, grid) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('stroke', '#60a5fa');
    g.setAttribute('stroke-width', '0.2');
    g.setAttribute('stroke-dasharray', '1.5 1.5');
    g.setAttribute('fill', 'none');

    const outer = document.createElementNS(NS, 'rect');
    outer.setAttribute('x', grid.inner.x);
    outer.setAttribute('y', grid.inner.y);
    outer.setAttribute('width', safeLen(grid.inner.w));
    outer.setAttribute('height', safeLen(grid.inner.h));
    g.appendChild(outer);

    for (let r = 1; r < grid.rows; r++) {
        const y = grid.inner.y + r * grid.cellH + (r - 1) * grid.gutter + (grid.gutter / 2);
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', grid.inner.x);
        line.setAttribute('x2', grid.inner.x + safeLen(grid.inner.w));
        line.setAttribute('y1', y);
        line.setAttribute('y2', y);
        g.appendChild(line);
    }
    for (let c = 1; c < grid.cols; c++) {
        const x = grid.inner.x + c * grid.cellW + (c - 1) * grid.gutter + (grid.gutter / 2);
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('y1', grid.inner.y);
        line.setAttribute('y2', grid.inner.y + safeLen(grid.inner.h));
        line.setAttribute('x1', x);
        line.setAttribute('x2', x);
        g.appendChild(line);
    }
    ov.appendChild(g);
}

// ---------- overlay per panel (host passed in) ----------
function renderPanelOverlay(svg, name, host, showGrid) {
    const p = pc_getPanelState(name) || {layout: {rows: 1, cols: 1, gutter: 0, padding: 0}};
    const root = ensureOverlay(svg, 'pcOverlaysRoot');

    let ov = svg.querySelector(`#pcOverlay_${name}`);
    if (!ov) {
        ov = document.createElementNS(NS, 'g');
        ov.setAttribute('id', `pcOverlay_${name}`);
        ov.setAttribute(UI_ATTR, '1');
        ov.setAttribute('pointer-events', 'none');
        root.appendChild(ov);
    } else {
        while (ov.firstChild) ov.removeChild(ov.firstChild);
    }

    if (getCurrentPanel() === name) drawPanelFrame(ov, host, name);

    const grid = buildGrid(host.getBBox(), p.layout || {});
    if (showGrid) drawGridLines(ov, grid);

    const ac = getActiveCell();
    const color = panelColor(name);

    for (let r = 1; r <= grid.rows; r++) {
        for (let c = 1; c <= grid.cols; c++) {
            const rect = cellRect(grid, r, c);

            // active highlight
            if (ac && ac.panel === name && ac.row === r && ac.col === c) {
                const hi = document.createElementNS(NS, 'rect');
                hi.setAttribute('x', rect.x);
                hi.setAttribute('y', rect.y);
                hi.setAttribute('width', safeLen(rect.w));
                hi.setAttribute('height', safeLen(rect.h));
                hi.setAttribute('fill', hexToRgba(color, 0.14));
                hi.setAttribute('stroke', color);
                hi.setAttribute('stroke-width', '0.8');
                ov.appendChild(hi);

                const notch = document.createElementNS(NS, 'path');
                notch.setAttribute('d', `M ${rect.x} ${rect.y + 3} L ${rect.x} ${rect.y} L ${rect.x + 3} ${rect.y}`);
                notch.setAttribute('fill', 'none');
                notch.setAttribute('stroke', color);
                notch.setAttribute('stroke-width', '0.8');
                ov.appendChild(notch);
            }

            // hit area
            const hit = document.createElementNS(NS, 'rect');
            hit.setAttribute('x', rect.x);
            hit.setAttribute('y', rect.y);
            hit.setAttribute('width', safeLen(rect.w));
            hit.setAttribute('height', safeLen(rect.h));
            hit.setAttribute('fill', 'transparent');
            hit.setAttribute('stroke', 'transparent');
            hit.setAttribute('stroke-width', '0.3');
            hit.setAttribute(UI_ATTR, '1');
            hit.setAttribute('data-pc-cell-row', String(r));
            hit.setAttribute('data-pc-cell-col', String(c));
            hit.style.cursor = 'pointer';
            hit.setAttribute('pointer-events', 'all');

            // IMPORTANT: refresh overlays immediately on selection
            hit.addEventListener('click', (e) => {
                e.preventDefault();
                setCurrentPanel(name);
                setActiveCell({panel: name, row: r, col: c});
                // refresh overlays + keep content intact
                pi_onGeometryChanged(svg);
            });

            hit.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentPanel(name);
                setActiveCell({panel: name, row: r, col: c});
                // refresh overlays immediately
                pi_onGeometryChanged(svg);
            });

            // --- DnD: allow dropping "text" or "svg" onto a specific cell ---
            hit.addEventListener('dragenter', () => {
                hit.setAttribute('stroke', hexToRgba(color, .7));
            });
            hit.addEventListener('dragleave', () => {
                hit.setAttribute('stroke', 'transparent');
            });
            hit.addEventListener('dragover', (e) => {
                // accept only known types; default to text if unspecified
                const t = e.dataTransfer?.getData('text/plain');
                if (t === 'text' || t === 'svg' || !t) {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                }
            });
            hit.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const type = e.dataTransfer?.getData('text/plain') || 'text';

                const rr = Number(hit.getAttribute('data-pc-cell-row')) || r;
                const cc = Number(hit.getAttribute('data-pc-cell-col')) || c;
                const pane = pc_getPanelState(name);
                if (!pane || pane.layout?.mode !== 'grid') return;
                // create item at this cell
                const newId = pc_addItemAtGridCell(name, type, {row: rr, col: cc});
                setCurrentPanel(name);
                setActiveCell({panel: name, row: rr, col: cc});
                if (newId) setSelectedItemId(newId);
                pc_renderAll(svg);
                pi_onGeometryChanged(svg);
                try {
                    const mod = await import('./panel-content.js');
                    if (newId && typeof mod.pc_activateEditorTab === 'function') mod.pc_activateEditorTab('object');
                    if (newId && typeof mod.pc_enterEdit === 'function') mod.pc_enterEdit(name, newId);
                } catch {
                }
            });

            hit.addEventListener('mouseenter', () => hit.setAttribute('stroke', hexToRgba(color, .5)));
            hit.addEventListener('mouseleave', () => hit.setAttribute('stroke', 'transparent'));

            ov.appendChild(hit);
        }
    }
}

// ---------- global toggle ----------
function getShowGridFlag() {
    const g = document.getElementById('pc-show-guides-global');
    return !!(g && g.checked);
}

function bindGlobalTogglesOnce() {
    const grid = document.getElementById('pc-show-guides-global');
    if (grid && !grid._pcBound) {
        grid._pcBound = true;
        grid.addEventListener('change', () => {
            const svg = document.querySelector('#out svg');
            if (svg) pi_onGeometryChanged(svg);
        });
    }
}

// ---------- drops (enumerate actual hosts) ----------
function attachDrops(svg) {
    const panels = listFoundPanels(svg);
    panels.forEach(({name, host}) => {
        host.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        host.addEventListener('drop', async (e) => {
            e.preventDefault();
            const type = e.dataTransfer?.getData('text/plain') || 'text';

            const pane = pc_getPanelState(name);
            if (!pane || pane.layout?.mode !== 'grid') return;

            const pxy = pointInSvgUserSpace(svg, e.clientX, e.clientY);
            const grid = buildGrid(host.getBBox(), pane.layout);
            let hit = {row: 1, col: 1};
            for (let rr = 1; rr <= grid.rows; rr++) {
                for (let cc = 1; cc <= grid.cols; cc++) {
                    const rect = cellRect(grid, rr, cc);
                    if (pxy.x >= rect.x && pxy.x <= rect.x + rect.w && pxy.y >= rect.y && pxy.y <= rect.y + rect.h) {
                        hit = {row: rr, col: cc};
                    }
                }
            }

            // create item at cell
            const newId = pc_addItemAtGridCell(name, type, hit);

            // set focus + refresh content + overlays
            setCurrentPanel(name);
            setActiveCell({panel: name, row: hit.row, col: hit.col});
            if (newId) setSelectedItemId(newId);

            pc_renderAll(svg);
            pi_onGeometryChanged(svg);

            // enter edit immediately so user sees form with placeholder
            try {
                const mod = await import('./panel-content.js');
                if (newId && typeof mod.pc_activateEditorTab === 'function') mod.pc_activateEditorTab('object');
                if (newId && typeof mod.pc_enterEdit === 'function') mod.pc_enterEdit(name, newId);
            } catch {
            }
        });
    });
}

// ---------- public ----------
export function pi_onGeometryChanged(svg) {
    if (!svg) return;
    bindGlobalTogglesOnce();

    const root = ensureOverlay(svg, 'pcOverlaysRoot');
    while (root.firstChild) root.removeChild(root.firstChild);

    const showGrid = getShowGridFlag();

    // enumerate actual panels present in the live SVG
    const panels = listFoundPanels(svg);
    for (const {name, host} of panels) {
        renderPanelOverlay(svg, name, host, showGrid);
    }

    attachDrops(svg);
}

export function pi_refreshAllOverlays(svg) {
    pi_onGeometryChanged(svg);
}

export function pi_beforeDownload(svgClone) {
    svgClone.querySelectorAll(`[${UI_ATTR}]`).forEach(n => n.remove());
}
