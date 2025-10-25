import {generateSvg} from './geometry.js';
import {colorPanels, mountSvg} from './renderer.js';
import {addLabels} from './labels.js';
import {initInfiniteGrid} from "./grid.js";
import {initRulers} from "./ruler.js";
import {pc_onGeometryChanged} from './panel-content.js';
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

    // NEW: slider + number pairs + badges
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
        // allow empty while the user is typing
        if (numEl.value === '' || numEl.value === '-' || numEl.value === '.' || numEl.value === '-.') {
            // don't touch the range or trigger generate
            updateBadges();
            return;
        }
        const v = Number(numEl.value);
        if (Number.isFinite(v)) {
            // mirror to range but DON'T clamp here
            rangeEl.value = String(v);
            updateBadges();
            // no generate here — wait until change/blur to avoid jumpy preview
        }
    });

    const commitNum = () => {
        // when the user commits (change/blur), clamp to min/max and generate
        const min = Number(numEl.min || 0);
        const max = Number(numEl.max || 1e9);

        // if still empty, fall back to current range value
        let v = numEl.value === '' ? Number(rangeEl.value) : Number(numEl.value);

        if (!Number.isFinite(v)) v = Number(rangeEl.value);
        v = clamp(v, min, max);

        numEl.value = String(v);
        rangeEl.value = String(v);

        updateBadges();
        onChange && onChange(); // now update the preview
    };

    numEl.addEventListener('change', commitNum);
    numEl.addEventListener('blur', commitNum);

    // initialize mirror once
    numEl.value = rangeEl.value;
}

// -------- params I/O --------
function readParams() {
    const data = new FormData(els.form);
    return {
        width: parseFloat(data.get('width')),
        depth: parseFloat(data.get('depth')),
        height: parseFloat(data.get('height')),
        thickness: parseFloat(data.get('thickness')),
        kerf: parseFloat(data.get('kerf')),
        tabWidth: parseFloat(data.get('tabWidth')),
        margin: parseFloat(data.get('margin')),
        showLabels: !!data.get('showLabels'),
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

        // set named fields (the ranges)
        Object.keys(p).forEach(k => {
            if (k === 'showLabels') {
                els.showLabels.checked = !!p.showLabels;
            } else {
                const el = els.form.elements.namedItem(k);
                if (el && 'value' in el) el.value = p[k];
            }
        });

        // mirror ranges into numbers
        if (els.widthRange && els.widthNum) els.widthNum.value = els.widthRange.value;
        if (els.depthRange && els.depthNum) els.depthNum.value = els.depthRange.value;
        if (els.heightRange && els.heightNum) els.heightNum.value = els.heightRange.value;
        if (els.tabRange && els.tabNum) els.tabNum.value = els.tabRange.value;

        updateBadges();
    } catch {
    }
}

// -------- preview helpers --------
function fitToContent(svg, pad = 10) {
    const content = svg.querySelector('#contentLayer');
    const b = content ? content.getBBox() : svg.getBBox();
    const vb = {x: b.x - pad, y: b.y - pad, w: Math.max(1, b.width + 2 * pad), h: Math.max(1, b.height + 2 * pad)};
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
        fitToContent(svg, 10);

        pc_onGeometryChanged(svg);
        pi_onGeometryChanged(svg);

        gridCtl = initInfiniteGrid(
            svg,
            () => (pz ? pz.getZoom() : 1),
            () => baseVbWidth || 1
        );
        if (els.gridInfo && gridCtl) els.gridInfo.textContent = `grid: ${fmt(gridCtl.currentMinor)} mm`;

        rulers = initRulers(els.out, svg, () => (pz ? pz.getZoom() : 1));
        rulers.update();

        if (params.showLabels) addLabels(svg);

        if (pz) {
            pz.destroy();
            pz = null;
        }
        // eslint-disable-next-line no-undef
        pz = svgPanZoom(svg, {
            zoomEnabled: true,
            controlIconsEnabled: false,
            fit: false, center: false,
            minZoom: 0.1, maxZoom: 20,
            zoomScaleSensitivity: 0.2,
            dblClickZoomEnabled: false,
            onZoom: () => {
                updateZoomLabel();
                rulers && rulers.update();
            },
            onPan: () => {
                rulers && rulers.update();
            }
        });
        if (pz.disableDblClickZoom) pz.disableDblClickZoom();
        updateZoomLabel();

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
        // parse to DOM to allow pre-export filtering
        const wrap = document.createElement('div');
        wrap.innerHTML = svgText;
        const svgNode = wrap.firstElementChild;

        // mount content into this clone as well, then filter
        // Note: reuse current panel-content state by rendering into a temporary container
        const tempContainer = document.createElement('div');
        tempContainer.appendChild(svgNode);
        pc_onGeometryChanged(svgNode.cloneNode(true)); // ensure layers exist in preview; not needed to mutate temp
        // Re-render into export node
        ['Bottom', 'Lid', 'Front', 'Back', 'Left', 'Right'].forEach(name => {
            // remove any old pcLayer from export node; will be rebuilt by current preview already
            // If you want exact current overlays, instead copy them from live DOM:
            const live = document.querySelector(`#contentLayer`)?.closest('svg');
            if (live) {
                const srcHost = live.querySelector(`[id$="${name}"]`);
                const dstHost = svgNode.querySelector(`[id$="${name}"]`);
                if (srcHost && dstHost) {
                    // copy/replace pcLayer
                    const srcLayer = srcHost.querySelector(`#pcLayer_${name}`);
                    if (srcLayer) {
                        const old = dstHost.querySelector(`#pcLayer_${name}`);
                        if (old) old.remove();
                        dstHost.appendChild(srcLayer.cloneNode(true));
                    }
                }
            }
        });

        // filter guides / outline (placeholder)
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
        els.form.reset();
        // mirror ranges into numbers
        if (els.widthRange && els.widthNum) els.widthNum.value = els.widthRange.value;
        if (els.depthRange && els.depthNum) els.depthNum.value = els.depthRange.value;
        if (els.heightRange && els.heightNum) els.heightNum.value = els.heightRange.value;
        if (els.tabRange && els.tabNum) els.tabNum.value = els.tabRange.value;
        els.showLabels.checked = true;
        updateBadges();
        setStatus('Parameters reset');
        els.out.innerHTML = '<div class="text-secondary">Generate to preview…</div>';
        els.download.disabled = true;
        localStorage.removeItem('pressfit_simple');
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
        const svg = els.out.querySelector('svg');
        if (!svg) return;
        pz && pz.destroy();
        fitToContent(svg, 10);
        gridCtl = initInfiniteGrid(svg, () => (pz ? pz.getZoom() : 1), () => baseVbWidth || 1);
        rulers = initRulers(els.out, svg, () => (pz ? pz.getZoom() : 1));
        rulers.update();
        // eslint-disable-next-line no-undef
        pz = svgPanZoom(svg, {
            zoomEnabled: true, controlIconsEnabled: false, fit: false, center: false,
            minZoom: 0.1, maxZoom: 20, zoomScaleSensitivity: 0.2,
            dblClickZoomEnabled: false,
            onZoom: () => {
                updateZoomLabel();
                rulers && rulers.update();
            },
            onPan: () => {
                rulers && rulers.update();
            }
        });
        if (pz.disableDblClickZoom) pz.disableDblClickZoom();
        window.pz = pz;
        window.addEventListener('resize', () => rulers && rulers.update());
        updateZoomLabel();
    });

    window.addEventListener('keydown', (e) => {
        if (!pz) return;
        if (e.key === '+') {
            pz.zoomBy(1.2);
            updateZoomLabel();
        }
        if (e.key === '-') {
            pz.zoomBy(1 / 1.2);
            updateZoomLabel();
        }
        if (e.key === '0') {
            pz.zoom(1);
            updateZoomLabel();
        }
        if (e.key.toLowerCase() === 'f') {
            els.fitBtn?.click();
        }
    });
})();
