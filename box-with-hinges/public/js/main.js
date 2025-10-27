// js/main.js
import {generateSvg} from './geometry.js';
import {colorPanels, colorTabs, mountSvg} from './renderer.js';
import {addLabels} from './labels.js';
import {initInfiniteGrid} from "./grid.js";
import {initRulers} from "./ruler.js";
import {pc_onGeometryChanged, pc_resetAll} from './panel-content.js';
import {pi_onGeometryChanged, pi_beforeDownload} from './panel-interaction.js';

const $ = (s) => document.querySelector(s);

const els = {
    form: $('#form'),
    out: $('#out'),
    status: $('#status'),
    download: $('#download'),
    resetBtn: $('#resetBtn'),
    zoomIn: $('#zoomIn'),
    zoomOut: $('#zoomOut'),
    zoomReset: $('#zoomReset'),
    fitBtn: $('#fitBtn'),
    showLabels: $('#showLabels'),
    gridInfo: $('#gridInfo'),

    // slider + number pairs + badges
    widthRange: $('#width'),
    widthNum: $('#widthNum'),
    widthBadge: $('#widthBadge'),
    depthRange: $('#depth'),
    depthNum: $('#depthNum'),
    depthBadge: $('#depthBadge'),
    heightRange: $('#height'),
    heightNum: $('#heightNum'),
    heightBadge: $('#heightBadge'),
    tabRange: $('#tabWidth'),
    tabNum: $('#tabWidthNum'),
    tabBadge: $('#tabWidthBadge'),
};

let pz = null;
let gridCtl = null;
let baseVbWidth = null;
let rulers = null;

// -------- helpers --------
const fmt = (n) => (Math.round(n * 100) / 100).toString();
const mm = (n) => `${Number(n).toFixed(0)} mm`;

function setStatus(s) {
    els.status && (els.status.textContent = s);
}

function updateBadges() {
    if (els.widthBadge) els.widthBadge.textContent = mm(els.widthRange?.value ?? 0);
    if (els.depthBadge) els.depthBadge.textContent = mm(els.depthRange?.value ?? 0);
    if (els.heightBadge) els.heightBadge.textContent = mm(els.heightRange?.value ?? 0);
    if (els.tabBadge) els.tabBadge.textContent = mm(els.tabRange?.value ?? 0);
}

function debounce(fn, ms) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function syncPair(rangeEl, numEl, onChange) {
    if (!rangeEl || !numEl) return;

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    // RANGE -> NUMBER (live)
    rangeEl.addEventListener('input', () => {
        numEl.value = rangeEl.value;
        updateBadges();
        onChange && onChange(); // live preview when moving the slider
    });

    // NUMBER -> RANGE (allow empty while typing; clamp only on change/blur)
    numEl.addEventListener('input', () => {
        if (numEl.value === '' || numEl.value === '-' || numEl.value === '.' || numEl.value === '-.') {
            updateBadges();
            return;
        }
        const v = Number(numEl.value);
        if (Number.isFinite(v)) {
            rangeEl.value = String(v);
            updateBadges();
        }
    });

    const commitNum = () => {
        const min = Number(numEl.min || 0);
        const max = Number(numEl.max || 1e9);
        let v = numEl.value === '' ? Number(rangeEl.value) : Number(numEl.value);
        if (!Number.isFinite(v)) v = Number(rangeEl.value);
        v = clamp(v, min, max);
        numEl.value = String(v);
        rangeEl.value = String(v);
        updateBadges();
        onChange && onChange();
    };

    numEl.addEventListener('change', commitNum);
    numEl.addEventListener('blur', commitNum);

    // initialize mirror once
    numEl.value = rangeEl.value;
}

// -------- params I/O --------
function readParams() {
    const data = new FormData(els.form);
    const showLabelsEl = document.getElementById('showLabels');
    return {
        width: parseFloat(data.get('width')),
        depth: parseFloat(data.get('depth')),
        height: parseFloat(data.get('height')),
        thickness: parseFloat(data.get('thickness')),
        kerf: parseFloat(data.get('kerf')),
        tabWidth: parseFloat(data.get('tabWidth')),
        margin: parseFloat(data.get('margin')),
        showLabels: !!showLabelsEl?.checked,
        addRightHole: !!data.get('addRightHole')
    };
}

function saveParams(p) {
    localStorage.setItem('pressfit_simple', JSON.stringify(p));
}

function loadParams() {
    try {
        const raw = localStorage.getItem('pressfit_simple');
        if (!raw) return;
        const p = JSON.parse(raw);

        Object.keys(p).forEach(k => {
            if (k === 'showLabels') {
                const s = document.getElementById('showLabels');
                if (s) s.checked = !!p.showLabels;
            } else {
                const el = els.form.elements.namedItem(k);
                if (el && 'value' in el) el.value = p[k];
            }
        });

        // mirror range/number pairs
        if (els.widthRange && els.widthNum) els.widthNum.value = els.widthRange.value;
        if (els.depthRange && els.depthNum) els.depthNum.value = els.depthRange.value;
        if (els.heightRange && els.heightNum) els.heightNum.value = els.heightRange.value;
        if (els.tabRange && els.tabNum) els.tabNum.value = els.tabRange.value;
        updateBadges();
    } catch {}
}

// redraw bridge (keep this function and call it once after the SVG exists)
function bindPcRedrawHook() {
    if (bindPcRedrawHook._bound) return;
    bindPcRedrawHook._bound = true;

    document.addEventListener('pc:requestRedraw', () => {
        const svg = document.querySelector('#out svg');
        if (!svg) return;

        try {
            // full rebuild; respects #showLabels in readParams()
            generate();
        } catch (err) { console.error(err); }

        import('./panel-interaction.js')
            .then(m => m.pi_onGeometryChanged(svg))
            .catch(()=>{});
    });
}

// -------- preview helpers --------
function getUnionBBox(svg) {
    // include: base geometry, per-panel layers, labels, axes, any opt-in
    const sel = [
        '#contentLayer',
        '[id^="pcLayer_"]',
        '#labelsLayer',
        '#axesLayer',
        '[data-fit="1"]'
    ].join(',');

    const nodes = [...svg.querySelectorAll(sel)];
    let U = null;

    const expand = (b) => {
        if (!U) { U = { x: b.x, y: b.y, w: b.width, h: b.height }; return; }
        const x1 = Math.min(U.x, b.x);
        const y1 = Math.min(U.y, b.y);
        const x2 = Math.max(U.x + U.w, b.x + b.width);
        const y2 = Math.max(U.y + U.h, b.y + b.height);
        U.x = x1; U.y = y1; U.w = Math.max(1, x2 - x1); U.h = Math.max(1, y2 - y1);
    };

    // accumulate bboxes; ignore zero-size
    nodes.forEach(n => {
        try {
            const b = n.getBBox();
            if (b && b.width > 0 && b.height > 0) expand(b);
        } catch {}
    });

    // fallback to whole svg bbox if nothing matched
    if (!U) {
        try {
            const b = svg.getBBox();
            U = { x: b.x, y: b.y, w: Math.max(1,b.width), h: Math.max(1,b.height) };
        } catch {
            U = { x: 0, y: 0, w: 100, h: 100 };
        }
    }
    return U;
}

function fitToContent(svg, pad = 10) {
    const b = getUnionBBox(svg);
    const vb = {
        x: b.x - pad,
        y: b.y - pad,
        w: Math.max(1, b.w + 2 * pad),
        h: Math.max(1, b.h + 2 * pad)
    };
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    baseVbWidth = vb.w;
}

function updateZoomLabel() {
    if (!els.zoomReset || !pz) return;
    els.zoomReset.textContent = `${Math.round(pz.getZoom() * 100)}%`;
    if (gridCtl && baseVbWidth) {
        const minor = gridCtl.update();
        if (els.gridInfo) els.gridInfo.textContent = `grid: ${fmt(minor)} mm`;
    }
}

// -------- core generate --------
const debouncedGenerate = debounce(generate, 120);

async function generate() {
    const params = readParams();
    saveParams(params);
    setStatus('Generating…');
    els.download.disabled = true;

    try {
        const svgText = generateSvg(params);
        const svg = mountSvg(svgText, els.out);
        colorPanels(svg);
        colorTabs(svg);
        fitToContent(svg, 10);

        // render panel content + overlays
        pc_onGeometryChanged(svg);
        pi_onGeometryChanged(svg);

        // grid + rulers
        gridCtl = initInfiniteGrid(
            svg,
            () => (pz ? pz.getZoom() : 1),
            () => baseVbWidth || 1
        );
        if (els.gridInfo && gridCtl) els.gridInfo.textContent = `grid: ${fmt(gridCtl.currentMinor)} mm`;

        rulers = initRulers(els.out, svg, () => (pz ? pz.getZoom() : 1));
        rulers.update();

        // labels according to checkbox
        if (params.showLabels) addLabels(svg);

        // pan/zoom
        if (pz) { pz.destroy(); pz = null; }
        // eslint-disable-next-line no-undef
        pz = svgPanZoom(svg, {
            zoomEnabled: true,
            controlIconsEnabled: false,
            fit: false, center: false,
            minZoom: 0.1, maxZoom: 20,
            zoomScaleSensitivity: 0.2,
            dblClickZoomEnabled: false,
            onZoom: () => { updateZoomLabel(); rulers && rulers.update(); },
            onPan: () => { rulers && rulers.update(); }
        });
        if (pz.disableDblClickZoom) pz.disableDblClickZoom();
        updateZoomLabel();

        // late-bind redraw bridge (idempotent)
        bindPcRedrawHook();

        els.download.disabled = false;
        setStatus('Done');
    } catch (err) {
        setStatus('Error');
        els.out.innerHTML = `<div class="alert alert-danger">Failed to generate SVG.<br><pre class="mb-0 small">${String(err)}</pre></div>`;
    }
}

// -------- wiring --------
(function wire() {
    loadParams();

    // ensure redraw hook exists even before first generate (idempotent)
    bindPcRedrawHook();

    els.showLabels?.addEventListener('change', () => {
        // trigger full rebuild (labels layer added/removed inside generate())
        document.dispatchEvent(new Event('pc:requestRedraw'));
    });

    // Pair sliders with number inputs + live preview
    syncPair(els.widthRange, els.widthNum, debouncedGenerate);
    syncPair(els.depthRange, els.depthNum, debouncedGenerate);
    syncPair(els.heightRange, els.heightNum, debouncedGenerate);
    syncPair(els.tabRange, els.tabNum, debouncedGenerate);
    updateBadges();

    // Submit still works
    els.form.addEventListener('submit', (e) => {
        e.preventDefault();
        generate();
    });

    // Other fields live-update on change
    els.form.thickness.addEventListener('change', debouncedGenerate);
    els.form.kerf.addEventListener('change', debouncedGenerate);
    els.form.margin.addEventListener('change', debouncedGenerate);
    els.showLabels.addEventListener('change', debouncedGenerate);

    // Download (clean server SVG)
    els.download.addEventListener('click', async () => {
        const params = readParams();
        const svgText = generateSvg(params);
        const wrap = document.createElement('div');
        wrap.innerHTML = svgText;
        const svgNode = wrap.firstElementChild;

        // copy pc layers from live preview into export clone
        const live = document.querySelector('#out svg');
        if (live) {
            ['Bottom','Lid','Front','Back','Left','Right'].forEach(name => {
                const srcHost = live.querySelector(`[id$="${name}"]`);
                const dstHost = svgNode.querySelector(`[id$="${name}"]`);
                if (srcHost && dstHost) {
                    const srcLayer = srcHost.querySelector(`#pcLayer_${name}`);
                    if (srcLayer) {
                        const old = dstHost.querySelector(`#pcLayer_${name}`);
                        if (old) old.remove();
                        dstHost.appendChild(srcLayer.cloneNode(true));
                    }
                }
            });
        }

        // filter overlays etc.
        pi_beforeDownload(svgNode);

        const cleaned = new XMLSerializer().serializeToString(svgNode);
        const blob = new Blob([cleaned], {type: 'image/svg+xml;charset=utf-8'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `box_with_hinges_w${params.width}_h${params.height}_d${params.depth}_k${params.kerf}.svg`;
        a.click();
        URL.revokeObjectURL(a.href);
    });

    els.resetBtn?.addEventListener('click', () => {
        const btn = document.getElementById('resetBtn');

        if (!btn || btn._pcBoundReset) return;
        btn._pcBoundReset = true;
        els.form.reset();

        if (els.widthRange && els.widthNum) els.widthNum.value = els.widthRange.value;
        if (els.depthRange && els.depthNum) els.depthNum.value = els.depthRange.value;
        if (els.heightRange && els.heightNum) els.heightNum.value = els.heightRange.value;
        if (els.tabRange && els.tabNum) els.tabNum.value = els.tabRange.value;
        els.showLabels.checked = true;
        updateBadges();
        pc_resetAll();
        setStatus('Parameters reset');
        els.out.innerHTML = '<div class="text-secondary">Generate to preview…</div>';
        els.download.disabled = true;
        localStorage.removeItem('pressfit_simple');
        // regenerate immediately after reset to show default preview
        generate();
    });

    // Zoom controls
    els.zoomIn && (els.zoomIn.onclick = () => {
        pz && pz.zoomBy(1.2);
        updateZoomLabel();
    });
    els.zoomOut && (els.zoomOut.onclick = () => {
        pz && pz.zoomBy(1 / 1.2);
        updateZoomLabel();
    });
    els.zoomReset && (els.zoomReset.onclick = () => {
        pz && pz.zoom(1);
        updateZoomLabel();
    });
    els.fitBtn && (els.fitBtn.onclick = () => {
        const content = els.out.querySelector('#contentLayer');
        const root = (content && content.ownerSVGElement) || els.out.querySelector('svg');
        if (!root) return;

        if (pz) { try { pz.destroy(); } catch {} pz = null; }

        fitToContent(root, 10);

        gridCtl = initInfiniteGrid(root, () => (pz ? pz.getZoom() : 1), () => baseVbWidth || 1);
        rulers = initRulers(els.out, root, () => (pz ? pz.getZoom() : 1));
        rulers.update();

        // eslint-disable-next-line no-undef
        pz = svgPanZoom(root, {
            zoomEnabled: true, controlIconsEnabled: false, fit: false, center: false,
            minZoom: 0.1, maxZoom: 20, zoomScaleSensitivity: 0.2,
            dblClickZoomEnabled: false,
            onZoom: () => { updateZoomLabel(); rulers && rulers.update(); },
            onPan: () => { rulers && rulers.update(); }
        });
        if (pz.disableDblClickZoom) pz.disableDblClickZoom();
        updateZoomLabel();
    });

    window.addEventListener('keydown', (e) => {
        if (!pz) return;
        if (e.key === '+') { pz.zoomBy(1.2); updateZoomLabel(); }
        if (e.key === '-') { pz.zoomBy(1 / 1.2); updateZoomLabel(); }
        if (e.key === '0') { pz.zoom(1); updateZoomLabel(); }
        if (e.key.toLowerCase() === 'f') { els.fitBtn?.click(); }
    });

    // INITIAL PREVIEW ON PAGE LOAD
    generate();
})();
