// js/panel-interaction.js
// Overlays: panel frame, layout grid lines, active-cell highlight, cell hit-rects,
// drag-and-drop targets. Renders on ALL detected panels. Percent-aware grid.

import {
    getCurrentPanel,
    setCurrentPanel,
    getActiveCell,
    setActiveCell,
    setSelectedItemId,
    pc_getLayout, pc_clearSelection, getSelectedItemId
} from './panel/state.js';
import {
    pc_addItemAtGridCell,
    pc_renderAll,
    pc_setItemSvg,
    pc_setItemType,
    pc_save, pc_getPanelState
} from './panel-state-bridge.js';
import {UI_ATTR, NS} from "./panel/constants.js";
import {pc_activateEditorTab, pc_getStateRef} from "./panel-content.js";
import {hideHoverOutline, showActiveOutline, showHoverOutline} from "./panel/renderers.js";

// --- global hint about what the user started dragging (palette) ---
let _lastDragKind = null; // 'text' | 'svg' | null
window.removeEventListener('dragstart', window._pcDragStartCap, true);
window._pcDragStartCap = (e) => {
    const t = e.target;
    const k = (t && (t.getAttribute('data-pc-drag') || t.getAttribute('data-pc-add') || t.dataset?.pcDrag || '')).toLowerCase();
    _lastDragKind = /svg/.test(k) ? 'svg' : /text/.test(k) ? 'text' : _lastDragKind;
};
window.addEventListener('dragstart', window._pcDragStartCap, true);
window.addEventListener('dragend', () => { _lastDragKind = null; }, true);

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
        // only visuals are non-interactive
        if (id === 'pcOverlaysRoot') {
            ov.setAttribute('pointer-events', 'none');
        } else if (id === 'pcHitsRoot') {
            // interactive root must accept events
            ov.removeAttribute('pointer-events');
            svg.appendChild(ov); // keep on top
            return ov;
        }
        svg.appendChild(ov);
    }
    return ov;
}

function safeLen(v, min = 0.01) { const n = Number(v); return Number.isFinite(n) ? Math.max(min, n) : min; }
function pointInSvgUserSpace(svg, clientX, clientY) {
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const viewport = svg.querySelector('.svg-pan-zoom_viewport') || svg;
    const ctm = viewport.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
}
function hexToRgba(hex, a) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return `rgba(96,165,250,${a})`;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${a})`;
}
// detect panels from the live SVG (don’t rely on a static list)
function listFoundPanels(svg) {
    const CANDIDATES = ['Bottom', 'Lid', 'Front', 'Back', 'Left', 'Right'];
    const out = [];
    for (const n of CANDIDATES) {
        const host =
            svg.querySelector(`g[id$="${n}"]`) ||
            svg.querySelector(`path[id$="${n}"]`) ||
            svg.querySelector(`[id$="${n}"]`);
        if (host) out.push({ name: n, host });
    }
    return out;
}

(function bindTabAutoSwitchOnce() {
    if (window._pcTabAutoBound) return; window._pcTabAutoBound = true;

    document.addEventListener('pc:itemSelectionChanged', (e) => {
        const id = e.detail?.id || null;
        if (id) {
            pc_activateEditorTab('object');   // object always wins
        } else {
            // only fall back to layout if some cell is active
            const ac = getActiveCell?.();
            if (ac && ac.panel) pc_activateEditorTab('layout');
        }
    });

    document.addEventListener('pc:activeCellChanged', (e) => {
        // do NOT switch to layout if an item is selected
        const sel = getSelectedItemId?.();
        if (sel) return;
        const panel = e.detail?.panel;
        if (panel) pc_activateEditorTab('layout');
    });
})();

// ---------- percent-aware grid ----------
function computeGridPct(panelBBox, layout) {
    const { x, y, width, height } = panelBBox;
    const pad = Math.max(0, Number(layout.padding) || 0);
    const rows = Math.max(1, Number(layout.rows) || 1);
    const cols = Math.max(1, Number(layout.cols) || 1);
    const gutter = Math.max(0, Number(layout.gutter) || 0);

    const inner = { x: x + pad, y: y + pad, w: Math.max(1, width - 2 * pad), h: Math.max(1, height - 2 * pad) };
    const availW = Math.max(0, inner.w - gutter * (cols - 1));
    const availH = Math.max(0, inner.h - gutter * (rows - 1));

    const rowP = (Array.isArray(layout.rowPercents) && layout.rowPercents.length === rows)
        ? layout.rowPercents.map(n => Number(n) || 0) : Array.from({ length: rows }, () => 100 / rows);
    const colP = (Array.isArray(layout.colPercents) && layout.colPercents.length === cols)
        ? layout.colPercents.map(n => Number(n) || 0) : Array.from({ length: cols }, () => 100 / cols);

    const rowPx = rowP.map(p => availH * Math.max(0, p) / 100);
    const colPx = colP.map(p => availW * Math.max(0, p) / 100);

    const rowY = new Array(rows).fill(0);
    for (let r = 1; r < rows; r++) rowY[r] = rowY[r - 1] + rowPx[r - 1] + gutter;

    const colX = new Array(cols).fill(0);
    for (let c = 1; c < cols; c++) colX[c] = colX[c - 1] + colPx[c - 1] + gutter;

    return { inner, rows, cols, gutter, rowPx, colPx, rowY, colX };
}
function cellRectPct(grid, r, c, rs = 1, cs = 1) {
    const r0 = r - 1, c0 = c - 1;
    const x = grid.inner.x + grid.colX[c0];
    const y = grid.inner.y + grid.rowY[r0];
    let w = 0; for (let i = 0; i < cs; i++) w += grid.colPx[c0 + i] || 0; w += grid.gutter * (cs - 1);
    let h = 0; for (let i = 0; i < rs; i++) h += grid.rowPx[r0 + i] || 0; h += grid.gutter * (rs - 1);
    return { x, y, w, h };
}

// ---------- drawing ----------
function drawPanelFrame(ov, host, name) {
    const color = panelColor(name);
    let bb; try { bb = host.getBBox(); } catch { return; }
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
function drawGridLinesPct(ov, grid, layout) {
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

    for (let c = 1; c < grid.cols; c++) {
        const x = grid.inner.x + grid.colX[c] - layout.gutter / 2;
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('y1', grid.inner.y);
        line.setAttribute('y2', grid.inner.y + safeLen(grid.inner.h));
        line.setAttribute('x1', x);
        line.setAttribute('x2', x);
        g.appendChild(line);
    }
    for (let r = 1; r < grid.rows; r++) {
        const y = grid.inner.y + grid.rowY[r] - layout.gutter / 2;
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', grid.inner.x);
        line.setAttribute('x2', grid.inner.x + safeLen(grid.inner.w));
        line.setAttribute('y1', y);
        line.setAttribute('y2', y);
        g.appendChild(line);
    }
    ov.appendChild(g);
}

function clientToSvgPoint(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// function onDropToCell(panelName, row, col, svg) {
//     return async function handleDrop(e) {
//         e.preventDefault();
//         e.stopPropagation();
//
//         // clear any hover stroke on the drop target if you added one
//         const tgt = e.currentTarget;
//         if (tgt && tgt.setAttribute) tgt.setAttribute('stroke', 'none');
//
//         // resolve intended type
//         const dt = e.dataTransfer;
//         const hint = dt?.getData('text/plain') || '';
//         const files = dt?.files ? [...dt.files] : [];
//         const svgFile = files.find(f =>
//             (f.type && f.type.toLowerCase().includes('svg')) ||
//             (f.name && /\.svg$/i.test(f.name))
//         );
//         let type = svgFile ? 'svg' : (/svg/i.test(hint) ? 'svg' : 'text');
//
//         // guard: panel + grid mode
//         const pane = pc_getPanelState(panelName);
//         if (!pane || (pane.layout?.mode || 'grid') !== 'grid') return;
//
//         // final target cell
//         const rr = Number(tgt?.getAttribute?.('data-pc-cell-row')) || row;
//         const cc = Number(tgt?.getAttribute?.('data-pc-cell-col')) || col;
//
//         // create item
//         const newId = pc_addItemAtGridCell(panelName, type, { row: rr, col: cc });
//         if (!newId) return;
//
//         if (type === 'svg') {
//             pc_setItemType(panelName, newId, 'svg');
//             if (svgFile) {
//                 try {
//                     const txt = await svgFile.text();
//                     pc_setItemSvg(panelName, newId, txt, svgFile.name);
//                 } catch {}
//             }
//         }
//
//         // state + selection
//         setCurrentPanel(panelName);
//         setActiveCell({ panel: panelName, row: rr, col: cc }); // keep cell context for editor
//
//         document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: { panel: panelName } }));
//         document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: { panel: panelName, row: rr, col: cc } }));
//         document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail: { id: newId, panel: panelName } }));
//
//         setSelectedItemId(newId);
//
//         // repaint
//         pc_activateEditorTab('object');
//         pc_save();
//         pc_renderAll(svg);
//         pi_onGeometryChanged(svg);
//     };
// }
function onDropToCell(panelName, row, col, svg) {
    return async function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        const tgt = e.currentTarget;
        if (tgt?.setAttribute) tgt.setAttribute('stroke', 'none');

        // Resolve intended type
        const dt = e.dataTransfer;
        const hint = dt?.getData('text/plain') || '';
        const files = dt?.files ? [...dt.files] : [];
        const svgFile = files.find(f =>
            (f.type && f.type.toLowerCase().includes('svg')) ||
            (f.name && /\.svg$/i.test(f.name))
        );
        let type = svgFile ? 'svg' : (/svg/i.test(hint) ? 'svg' : 'text');

        // Guard: panel exists and in grid mode
        const pane = pc_getPanelState(panelName);
        if (!pane || (pane.layout?.mode || 'grid') !== 'grid') return;

        // Target cell (attrs win; fallback to provided coords)
        const rr = Number(tgt?.getAttribute?.('data-pc-cell-row')) || row;
        const cc = Number(tgt?.getAttribute?.('data-pc-cell-col')) || col;

        // 1) Create item in state
        const newId = pc_addItemAtGridCell(panelName, type, { row: rr, col: cc });
        if (!newId) return;

        if (type === 'svg') {
            pc_setItemType(panelName, newId, 'svg');
            if (svgFile) {
                try {
                    const txt = await svgFile.text();
                    pc_setItemSvg(panelName, newId, txt, svgFile.name);
                } catch {}
            }
        }

        // 2) Persist now to avoid stale reads in editor
        pc_save();

        // 3) Render DOM so the wrapper [data-item-id] exists
        setCurrentPanel(panelName);
        setActiveCell({ panel: panelName, row: rr, col: cc });
        document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: { panel: panelName } }));
        document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: { panel: panelName, row: rr, col: cc } }));
        pc_renderAll(svg);
        pi_onGeometryChanged(svg);

        // 4) Select item (fires pc:itemSelectionChanged)
        setSelectedItemId(newId);

        // 5) Activate Object tab immediately; enter edit on next frame
        pc_activateEditorTab('object');
        requestAnimationFrame(async () => {
            try {
                const mod = await import('./panel-content.js');
                if (typeof mod.pc_enterEdit === 'function') mod.pc_enterEdit(panelName, newId);
            } catch {}
        });
    };
}


function hitTestItemAtClient(svgEl, panelName, clientX, clientY) {
    const layer = svgEl.querySelector(`#pcLayer_${panelName}`);
    if (!layer) return null;

    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
        // skip UI overlays / hits layers
        if (el.getAttribute && el.getAttribute(UI_ATTR) === '1') continue;

        const container = el.closest?.(`[data-item-id]`);
        if (container && layer.contains(container)) return container;

        // stop if we bubbled up to this panel’s hit layer
        if (el.id === `pcOverlayHits_${panelName}`) break;
    }
    return null;
}


// ---------- overlay per panel (host passed in) ----------
function renderPanelOverlay(svg, name, host, showGrid) {
    const L = pc_getLayout(name);
    const overlaysRoot = ensureOverlay(svg, 'pcOverlaysRoot');     // visual only
    const hitsRoot     = ensureOverlay(svg, 'pcHitsRoot');          // interactive
    const root = ensureOverlay(svg, 'pcOverlaysRoot');

    let ov = svg.querySelector(`#pcOverlay_${name}`);
    if (!ov) {
        ov = document.createElementNS(NS, 'g');
        ov.setAttribute('id', `pcOverlay_${name}`);
        ov.setAttribute(UI_ATTR, '1');
        ov.setAttribute('pointer-events', 'none'); // safe here: only visuals will be appended
        overlaysRoot.appendChild(ov);
    } else {
        while (ov.firstChild) ov.removeChild(ov.firstChild);
    }

    if (getCurrentPanel() === name) drawPanelFrame(ov, host, name);

    // only grid mode draws cells
    if ((L.mode || 'grid') !== 'grid') return;

    const bbox = host.getBBox();
    const G = computeGridPct(bbox, L);

    if (showGrid) drawGridLinesPct(ov, G, L);

    const S = pc_getStateRef?.();
    const selectedOnThisPanel = !!(S && S._ui?.selectedItemId && S._ui.activePanel === name);

    const ac = getActiveCell();
    const color = panelColor(name);

    // Events-enabled layer for hits
    let hitLayer = svg.querySelector(`#pcOverlayHits_${name}`);
    if (!hitLayer) {
        hitLayer = document.createElementNS(NS, 'g');
        hitLayer.setAttribute('id', `pcOverlayHits_${name}`);
        hitLayer.setAttribute(UI_ATTR, '1');
        // NOTE: do not set pointer-events:none here
        hitsRoot.appendChild(hitLayer);
    } else {
        while (hitLayer.firstChild) hitLayer.removeChild(hitLayer.firstChild);
    }

    for (let r = 1; r <= G.rows; r++) {
        for (let c = 1; c <= G.cols; c++) {
            const rect = cellRectPct(G, r, c);

            // active cell highlight (suppressed if item is selected on this panel)
            if (!selectedOnThisPanel && ac && ac.panel === name && ac.row === r && ac.col === c) {
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

            // INNER hit: object-first selection, DnD; never activates cell
            const inner = document.createElementNS(NS, 'rect');
            inner.setAttribute('x', rect.x);
            inner.setAttribute('y', rect.y);
            inner.setAttribute('width', safeLen(rect.w));
            inner.setAttribute('height', safeLen(rect.h));
            inner.setAttribute('fill', 'rgba(0,0,0,0.001)');
            inner.style.pointerEvents = 'all';
            inner.setAttribute('stroke', 'none');
            inner.setAttribute(UI_ATTR, '1');
            inner.setAttribute('data-pc-cell-row', String(r));
            inner.setAttribute('data-pc-cell-col', String(c));
            // DnD on inner
            inner.addEventListener('dragenter', () => { inner.setAttribute('stroke', hexToRgba(color, .7)); });
            inner.addEventListener('dragleave', () => { inner.setAttribute('stroke', 'none'); });
            inner.addEventListener('dragover', (e) => {
                const t = e.dataTransfer?.getData('text/plain');
                const hasFiles = !!(e.dataTransfer?.files && e.dataTransfer.files.length);
                if (t === 'text' || t === 'svg' || !t || hasFiles) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; }
            });
            inner.addEventListener('drop', onDropToCell(name, r, c, svg));
            inner.addEventListener('mousemove', (e) => {
                const p = clientToSvgPoint(svg, e.clientX, e.clientY);
                // const g = hitTestItemsInPanel(svg, name, p.x, p.y);
                // cursor
                const g = hitTestItemAtClient(svg, name, e.clientX, e.clientY);
                inner.style.cursor = g ? 'pointer' : 'default';
                // optional: outline while hovering (no selection)
                const hoverIdPrev = svg.getAttribute('data-pc-hover-id') || '';
                const hoverIdNext = g ? (g.getAttribute('data-item-id') || '') : '';
                if (hoverIdPrev !== hoverIdNext) {
                    if (hoverIdPrev) {
                        const prev = svg.querySelector(`g.pc-item[data-item-id="${hoverIdPrev}"]`);
                        if (prev) hideHoverOutline(prev);
                    }
                    if (hoverIdNext) {
                        const selId = pc_getStateRef()?._ui?.selectedItemId || null;
                        if (selId !== hoverIdNext) showHoverOutline(g);
                    }
                    if (hoverIdNext) svg.setAttribute('data-pc-hover-id', hoverIdNext);
                    else svg.removeAttribute('data-pc-hover-id');
                }
            });
            inner.addEventListener('click', (e) => {
                e.preventDefault();
                const p = clientToSvgPoint(svg, e.clientX, e.clientY);
                // const g = hitTestItemsInPanel(svg, name, p.x, p.y);
                const g = hitTestItemAtClient(svg, name, e.clientX, e.clientY);
                if (g) {
                    const id = g.getAttribute('data-item-id');
                    if (id) {
                        setCurrentPanel(name);
                        setActiveCell(null);
                        setSelectedItemId(id);
                        document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: { panel: name } }));
                        document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail: { id, panel: name } }));
                        pc_activateEditorTab('object');
                        pi_onGeometryChanged(svg);
                    }
                }
                // else: do nothing; inner click without object doesn’t activate cell
            });

            inner.addEventListener('mouseleave', () => {
                inner.style.cursor = 'default';
                const prevId = svg.getAttribute('data-pc-hover-id') || '';
                if (prevId) {
                    const prev = svg.querySelector(`g.pc-item[data-item-id="${prevId}"]`);
                    if (prev) hideHoverOutline(prev);
                    svg.removeAttribute('data-pc-hover-id');
                }
            });

            // BORDER hit: activates cell; pointer-events on stroke only
            const border = document.createElementNS(NS, 'rect');
            border.setAttribute('x', rect.x);
            border.setAttribute('y', rect.y);
            border.setAttribute('width', safeLen(rect.w));
            border.setAttribute('height', safeLen(rect.h));
            border.setAttribute('fill', 'none');
            border.setAttribute('stroke', 'transparent');
            border.setAttribute('stroke-width', '8');
            border.setAttribute('vector-effect', 'non-scaling-stroke');
            border.setAttribute('pointer-events', 'stroke');
            border.setAttribute(UI_ATTR, '1');
            border.setAttribute('data-pc-cell-row', String(r));
            border.setAttribute('data-pc-cell-col', String(c));
            border.style.pointerEvents = 'stroke';
            border.style.cursor = 'pointer';

            border.addEventListener('mouseenter', () => border.setAttribute('stroke', hexToRgba(color, .5)));
            border.addEventListener('mouseleave', () => border.setAttribute('stroke', 'transparent'));

            border.addEventListener('click', (e) => {
                e.preventDefault();
                pc_clearSelection();
                setCurrentPanel(name);
                setActiveCell({ panel: name, row: r, col: c });
                document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: { panel: name } }));
                document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: { panel: name, row: r, col: c } }));
                pi_onGeometryChanged(svg);
            });

            // order matters: inner below, border above
            hitLayer.appendChild(inner);
            hitLayer.appendChild(border);
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
    panels.forEach(({ name, host }) => {
        host.addEventListener('dragover', (e) => { e.preventDefault(); });
        host.addEventListener('drop', async (e) => {
            e.preventDefault();
            const files = e.dataTransfer?.files;
            const hasSvgFile = !!(files && [...files].some(f => (f.type && f.type.includes('svg')) || (f.name && /\.svg$/i.test(f.name))));
            let type = e.dataTransfer?.getData('text/plain') || (_lastDragKind || (hasSvgFile ? 'svg' : 'text'));

            const pane = pc_getPanelState(name);
            const L = pc_getLayout(name);
            if (!pane || (L.mode || 'grid') !== 'grid') return;

            const pxy = pointInSvgUserSpace(svg, e.clientX, e.clientY);
            const G = computeGridPct(host.getBBox(), L);
            let hit = { row: 1, col: 1 };
            for (let rr = 1; rr <= G.rows; rr++) {
                for (let cc = 1; cc <= G.cols; cc++) {
                    const rect = cellRectPct(G, rr, cc);
                    if (pxy.x >= rect.x && pxy.x <= rect.x + rect.w && pxy.y >= rect.y && pxy.y <= rect.y + rect.h) {
                        hit = { row: rr, col: cc };
                    }
                }
            }

            const newId = pc_addItemAtGridCell(name, /svg/i.test(type) ? 'svg' : 'text', hit);

            if (hasSvgFile && files && files.length && newId) {
                const file = [...files].find(f => (f.type && f.type.includes('svg')) || (f.name && /\.svg$/i.test(f.name)));
                if (file) { try { const txt = await file.text(); pc_setItemSvg(name, newId, txt, file.name); } catch {} }
            }

            setCurrentPanel(name);
            setActiveCell({ panel: name, row: hit.row, col: hit.col });
            document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: { panel: name } }));
            document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: { panel: name, row: hit.row, col: hit.col } }));

            if (newId) {
                setSelectedItemId(newId);
                document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail: { id: newId, panel: name } }));
                pc_activateEditorTab('object');
            }

            pc_renderAll(svg);
            pi_onGeometryChanged(svg);
            pc_save();
        });
    });
}

// ---------- background deselect ----------
function _pointInSvg(svg, clientX, clientY) {
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const vp = svg.querySelector('.svg-pan-zoom_viewport') || svg;
    const m = vp.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x:0, y:0 };
}
function _isInsideAnyPanel(svg, x, y) {
    const names = ['Bottom','Lid','Front','Back','Left','Right'];
    for (const n of names) {
        const host = svg.querySelector(`g[id$="${n}"], path[id$="${n}"], [id$="${n}"]`);
        if (!host) continue;
        let b; try { b = host.getBBox(); } catch { continue; }
        if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return true;
    }
    return false;
}
function bindBackgroundDeselect(svg) {
    if (svg._pcBgDeselectBound) return; svg._pcBgDeselectBound = true;

    svg.addEventListener('mousedown', (e) => {
        if (e.target && (e.target.getAttribute('data-pc-ui') === '1')) return;
        const p = _pointInSvg(svg, e.clientX, e.clientY);
        if (_isInsideAnyPanel(svg, p.x, p.y)) return;

        setActiveCell(null);
        setSelectedItemId(null);
        document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: { panel: null, row: null, col: null } }));
        pc_renderAll(svg);
        pi_onGeometryChanged(svg);
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        setActiveCell(null);
        setSelectedItemId(null);
        document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: { panel: null, row: null, col: null } }));
        const curSvg = document.querySelector('#out svg') || svg;
        if (curSvg) { pc_renderAll(curSvg); pi_onGeometryChanged(curSvg); }
    }, { once: false });
}

// ---------- public ----------
export function pi_onGeometryChanged(svg) {
    if (!svg) return;
    bindGlobalTogglesOnce();

    const root = ensureOverlay(svg, 'pcOverlaysRoot');
    while (root.firstChild) root.removeChild(root.firstChild);

    const showGrid = getShowGridFlag();
    const panels = listFoundPanels(svg);
    for (const { name, host } of panels) {
        renderPanelOverlay(svg, name, host, showGrid);
    }

    attachDrops(svg);
    bindBackgroundDeselect(svg);

    const ac = getActiveCell();
    const selId = getSelectedItemId?.();

    if (!ac && selId) pc_activateEditorTab('object');
    else if (ac && ac.panel) pc_activateEditorTab('layout');
}
export function pi_beforeDownload(svgClone) { svgClone.querySelectorAll(`[${UI_ATTR}]`).forEach(n => n.remove()); }
