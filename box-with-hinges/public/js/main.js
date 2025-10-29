// js/main.js
import {generateSvg} from './geometry.js';
import {colorPanels, colorTabs, mountSvg} from './renderer.js';
import {addLabels} from './labels.js';
import {initInfiniteGrid} from "./grid.js";
import {initRulers} from "./ruler.js";
import {pc_onGeometryChanged, pc_resetAll} from './panel-content.js';
import {pi_onGeometryChanged, pi_beforeDownload} from './panel-interaction.js';
import {findPanelHost, findPanelLayer, inlineTextPaintFromLive, prependLayer, unhideAllLayers} from "./units.js";

const $ = (s) => document.querySelector(s);

const els = {
    form: $('#form'),
    out: $('#out'),
    status: $('#status'),
    download: $('#download'),
    resetBtn: $('#confirmResetYes'),
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
const PARAM_DEFAULTS = {
    width: 80,
    depth: 50,
    height: 40,
    thickness: 3,
    kerf: 0.12,
    tabWidth: 10,
    margin: 12,
    showLabels: true,
    addRightHole: true
};

function readParams() {
    const form = document.getElementById('form');

    // helper: read numeric by name with fallback
    const num = (name, def) => {
        if (!form || !form.elements) return def;
        const el = form.elements.namedItem(name);
        if (!el || !('value' in el)) return def;
        const v = parseFloat(el.value);
        return Number.isFinite(v) ? v : def;
    };

    // helper: read checkbox by id or name with fallback
    const bool = (idOrName, def) => {
        const byId = document.getElementById(idOrName);
        if (byId && 'checked' in byId) return !!byId.checked;
        if (form && form.elements) {
            const el = form.elements.namedItem(idOrName);
            if (el && 'checked' in el) return !!el.checked;
        }
        return def;
    };

    return {
        width:     num('width',     PARAM_DEFAULTS.width),
        depth:     num('depth',     PARAM_DEFAULTS.depth),
        height:    num('height',    PARAM_DEFAULTS.height),
        thickness: num('thickness', PARAM_DEFAULTS.thickness),
        kerf:      num('kerf',      PARAM_DEFAULTS.kerf),
        tabWidth:  num('tabWidth',  PARAM_DEFAULTS.tabWidth),
        margin:    num('margin',    PARAM_DEFAULTS.margin),
        showLabels: bool('showLabels',  PARAM_DEFAULTS.showLabels),
        addRightHole: bool('addRightHole', PARAM_DEFAULTS.addRightHole)
    };
}


function saveParams(p) {
    localStorage.setItem('pressfit_simple', JSON.stringify(p));
}

function loadParams() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem('pressfit_simple') || 'null'); } catch {}
    if (!p) return;

    const form = document.getElementById('form');
    if (!form || !form.elements) return;

    const setNum = (name, val) => {
        const el = form.elements.namedItem(name);
        if (el && 'value' in el && Number.isFinite(Number(val))) el.value = String(val);
    };
    setNum('width', p.width);
    setNum('depth', p.depth);
    setNum('height', p.height);
    setNum('thickness', p.thickness);
    setNum('kerf', p.kerf);
    setNum('tabWidth', p.tabWidth);
    setNum('margin', p.margin);

    const s = document.getElementById('showLabels');
    if (s) s.checked = !!p.showLabels;

    // mirror range ↔ number if pairs exist
    const id = (x) => document.getElementById(x);
    if (id('width') && id('widthNum'))   id('widthNum').value  = id('width').value;
    if (id('depth') && id('depthNum'))   id('depthNum').value  = id('depth').value;
    if (id('height') && id('heightNum')) id('heightNum').value = id('height').value;
    if (id('tabWidth') && id('tabWidthNum')) id('tabWidthNum').value = id('tabWidth').value;

    updateBadges && updateBadges();
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
function bindLeftSidebarOnce() {
    if (bindLeftSidebarOnce._bound) return;

    const doBind = () => {
        const form = document.getElementById('form');
        if (!form) return false;

        // submit
        form.addEventListener('submit', (e) => { e.preventDefault(); generate(); });

        // field changes
        const on = (name) => {
            const el = form.elements.namedItem(name);
            if (el && el.addEventListener) el.addEventListener('change', debouncedGenerate);
        };
        on('thickness'); on('kerf'); on('margin');

        // show labels (if present)
        const showLabelsEl = document.getElementById('showLabels');
        if (showLabelsEl) showLabelsEl.addEventListener('change', debouncedGenerate);

        // slider-number pairs
        const WR = document.getElementById('width');
        const WN = document.getElementById('widthNum');
        const DR = document.getElementById('depth');
        const DN = document.getElementById('depthNum');
        const HR = document.getElementById('height');
        const HN = document.getElementById('heightNum');
        const TR = document.getElementById('tabWidth');
        const TN = document.getElementById('tabWidthNum');

        if (WR && WN) syncPair(WR, WN, debouncedGenerate);
        if (DR && DN) syncPair(DR, DN, debouncedGenerate);
        if (HR && HN) syncPair(HR, HN, debouncedGenerate);
        if (TR && TN) syncPair(TR, TN, debouncedGenerate);

        // initial badges mirror
        updateBadges();

        bindLeftSidebarOnce._bound = true;
        return true;
    };

    // try immediately
    if (doBind()) return;

    // wait once for partials to land
    const mo = new MutationObserver(() => {
        if (doBind()) mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true });
}

(function wire() {
    loadParams();

    // ensure redraw hook exists even before first generate (idempotent)
    bindPcRedrawHook();
    bindLeftSidebarOnce();

    els.showLabels?.addEventListener('change', () => {
        // trigger full rebuild (labels layer added/removed inside generate())
        document.dispatchEvent(new Event('pc:requestRedraw'));
    });

    // Pair sliders with number inputs + live preview
    // syncPair(els.widthRange, els.widthNum, debouncedGenerate);
    // syncPair(els.depthRange, els.depthNum, debouncedGenerate);
    // syncPair(els.heightRange, els.heightNum, debouncedGenerate);
    // syncPair(els.tabRange, els.tabNum, debouncedGenerate);
    updateBadges();

    // Submit still works
    // els.form.addEventListener('submit', (e) => {
    //     e.preventDefault();
    //     generate();
    // });

    // Other fields live-update on change
    // els.form.thickness.addEventListener('change', debouncedGenerate);
    // els.form.kerf.addEventListener('change', debouncedGenerate);
    // els.form.margin.addEventListener('change', debouncedGenerate);
    els.showLabels.addEventListener('change', debouncedGenerate);

    // Download (clean server SVG)
    els.download.addEventListener('click', async () => {
        const params = readParams();
        const svgText = generateSvg(params);
        const wrap = document.createElement('div'); wrap.innerHTML = svgText;
        const svgNode = wrap.firstElementChild;

        const live = document.querySelector('#out svg');
        if (live) {
            ['Bottom','Lid','Front','Back','Left','Right'].forEach(name => {
                const srcLayer = findPanelLayer(live, name);
                const dstHost  = findPanelHost(svgNode, name);
                if (!srcLayer || !dstHost) return;

                const clone = srcLayer.cloneNode(true);
                const old = dstHost.querySelector(`#pcLayer_${name}`); if (old) old.remove();

                // PREPEND, not append → keep under face fills
                prependLayer(dstHost, clone);
            });
        }

        // make sure layers are visible
        unhideAllLayers(svgNode);

        // inline text colors so black text doesn’t vanish
        if (live) inlineTextPaintFromLive(live, svgNode);

        // scrub only overlays / UI
        pi_beforeDownload(svgNode);

        // ensure size attributes
        const vb = svgNode.getAttribute('viewBox');
        if (vb) {
            const m = vb.match(/^\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
            if (m) {
                if (!svgNode.getAttribute('width'))  svgNode.setAttribute('width',  `${m[1]}mm`);
                if (!svgNode.getAttribute('height')) svgNode.setAttribute('height', `${m[2]}mm`);
            }
        }

        const cleaned = new XMLSerializer().serializeToString(svgNode);
        const blob = new Blob([cleaned], {type: 'image/svg+xml;charset=utf-8'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `box_with_hinges_w${params.width}_h${params.height}_d${params.depth}_k${params.kerf}.svg`;
        a.click();
        URL.revokeObjectURL(a.href);
    });


    els.resetBtn?.addEventListener('click', () => {
        const m = bootstrap?.Modal?.getInstance(document.getElementById('confirmResetModal'));
        if (m) m.hide();

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
