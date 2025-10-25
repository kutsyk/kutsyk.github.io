// public/js/panel/edit.js
// Editor logic for Panel Content: layout + item editing, selection, uploads, bindings.
// Refactored to avoid type-clobbering, unify DnD + click-to-add flows, and keep UI in sync.

import {els, toggleLayoutGroups, toggleTypeProps} from './dom.js';
import {
    getStateRef, panelState, saveState,
    getCurrentPanel, setCurrentPanel,
    getSelectedItemId, setSelectedItemId,
    getEditItemId, setEditItemId,
    getEditOriginal, setEditOriginal,
    getCurrentSvg, setCurrentSvg, setActiveCell, getActiveCell,
    setUiMode, UIMODES
} from './state.js';
import {nid, bindSvgDeselect} from './utils.js';
import {renderAll} from './render.js';
import {bus} from './signal-bus.js';
import {pi_onGeometryChanged} from './../panel-interaction.js';
import {pc_getCellConfig} from "../panel-state-bridge.js";

// ---------- small utils ----------
const nowPanel = () => getCurrentPanel() || 'Front';
const activeSvg = () => getCurrentSvg();
const mmNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const normalizeKind = (k) => (String(k || '').toLowerCase().includes('svg') ? 'svg' : 'text');
const ensureActiveCellOrDefault = () => getActiveCell() || {panel: nowPanel(), row: 1, col: 1};

const PRESETS = {
    'center-1x1': (p) => ({rows: 1, cols: 1, gutter: 2, padding: Math.max(2, p?.layout?.padding ?? 4)}),
    'rows-2': (p) => ({rows: 2, cols: 1, gutter: 2, padding: p?.layout?.padding ?? 4}),
    'cols-2': (p) => ({rows: 1, cols: 2, gutter: 2, padding: p?.layout?.padding ?? 4}),
    'grid-2x2': (p) => ({rows: 2, cols: 2, gutter: 2, padding: p?.layout?.padding ?? 4}),
    'grid-3x3': (p) => ({rows: 3, cols: 3, gutter: 2, padding: p?.layout?.padding ?? 4}),
    'header-1-2': (p) => ({rows: 2, cols: 1, gutter: 2, padding: p?.layout?.padding ?? 4}), // set row heights via free mode if needed later
    'sidebar-1-2': (p) => ({rows: 1, cols: 2, gutter: 2, padding: p?.layout?.padding ?? 4}),
};

function applyPreset(key) {
    const maker = PRESETS[key];
    if (!maker) return;
    const p = panelState();
    const L = maker(p);
    p.layout.mode = 'grid';
    p.layout.rows = L.rows;
    p.layout.cols = L.cols;
    p.layout.gutter = L.gutter;
    p.layout.padding = L.padding;
    saveState();
    // optional: clear per-cell tweaks when shape changed
    if (p.cells) p.cells = {};
    // sync form + repaint
    syncLayoutForm();
    const svg = getCurrentSvg();
    if (svg) {
        renderAll(svg);
        pi_onGeometryChanged(svg);
    }
}

// ---------- selection ----------
function setEditUI(enabled) {
    const controls = [
        els.type, els.name,
        els.row, els.col, els.rowspan, els.colspan,
        els.x, els.y, els.w, els.h,
        els.alignH, els.alignV,
        els.textarea, els.font, els.fontFamilyDDL, els.fontSize, els.line,
        els.svgSrc, els.svgW, els.svgH, els.scale, els.preserve, els.invert,
        els.rotate, els.mirrorX, els.mirrorY, els.stroke, els.opacity
    ].filter(Boolean);
    controls.forEach(c => c.disabled = !enabled);
    if (els.confirm) els.confirm.disabled = !enabled;
    if (els.cancel) els.cancel.disabled = !enabled;
}

function clearSelection() {
    const hadAny = !!(getSelectedItemId() || getEditItemId());
    setSelectedItemId(null);
    setEditItemId(null);
    setEditOriginal(null);
    setEditUI(false);
    if (hadAny) {
        rebuildItemsList();
        renderAll(activeSvg());
    }
}

export function pc_clearSelection() {
    clearSelection();
}

// ---------- layout ----------
function commitLayout() {
    const p = panelState();
    p.layout.mode = els.layoutGrid?.checked ? 'grid' : 'free';
    p.layout.rows = Math.max(1, mmNum(els.rows?.value, 2));
    p.layout.cols = Math.max(1, mmNum(els.cols?.value, 2));
    p.layout.gutter = Math.max(0, mmNum(els.gutter?.value, 2));
    p.layout.padding = Math.max(0, mmNum(els.padding?.value, 4));
    saveState();

    const svg = activeSvg();
    if (svg) {
        renderAll(svg);
        pi_onGeometryChanged(svg);
    }
}

function syncLayoutForm() {
    const cur = nowPanel();
    const p = panelState(cur);

    if (els.panel) els.panel.value = cur;

    const mode = (p.layout?.mode || 'grid');
    if (els.layoutGrid) els.layoutGrid.checked = (mode === 'grid');
    if (els.layoutFree) els.layoutFree.checked = (mode === 'free');
    if (typeof toggleLayoutGroups === 'function') toggleLayoutGroups();

    if (els.rows) els.rows.value = Number(p.layout?.rows ?? 2);
    if (els.cols) els.cols.value = Number(p.layout?.cols ?? 2);
    if (els.gutter) els.gutter.value = Number(p.layout?.gutter ?? 2);
    if (els.padding) els.padding.value = Number(p.layout?.padding ?? 4);
}

// ---------- items list (legacy/simple) ----------
function rebuildItemsList() {
    const list = els.items;
    if (!list) return;
    const p = panelState();
    list.innerHTML = '';
    p.items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'pc-item-row';
        row.dataset.id = it.id;

        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'btn btn-sm btn-outline-secondary btn-icon';
        eye.innerHTML = it.visible === false ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
        eye.onclick = () => {
            it.visible = it.visible === false ? true : false;
            saveState();
            rebuildItemsList();
            renderAll(activeSvg());
        };

        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'btn btn-sm btn-link text-start name';
        name.textContent = it.name || (it.type === 'text' ? 'Text' : 'SVG');
        name.onclick = () => {
            setSelectedItemId(it.id);
            syncEditorsToItem(it);
            highlightSelection();
            renderAll(activeSvg());
        };

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn btn-sm btn-outline-primary btn-icon';
        edit.innerHTML = '<i class="bi bi-pencil-square"></i>';
        edit.onclick = () => {
            pc_activateEditorTab('object');
            pc_enterEdit(nowPanel(), it.id);
        };

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-sm btn-outline-danger btn-icon';
        del.innerHTML = '<i class="bi bi-trash"></i>';
        del.onclick = () => deleteItem(nowPanel(), it.id);

        row.append(eye, name, edit, del);
        list.appendChild(row);
    });
    highlightSelection();
}

function highlightSelection() {
    const id = getSelectedItemId();
    els.items?.querySelectorAll('.pc-item-row').forEach(r => {
        r.classList.toggle('bg-body-tertiary', r.dataset.id === id);
    });
}

// ---------- editor sync ----------
function activeItem() {
    const p = panelState();
    return p.items.find(x => x.id === getSelectedItemId()) || null;
}

export function syncEditorsToItem(item) {
    if (!item) return;

    // Reflect type first and toggle visible control groups
    if (els.type) els.type.value = item.type || 'text';
    toggleTypeProps(item?.type || 'text');

    els.name.value = item.name || '';

    const g = item.grid || {row: 1, col: 1, rowSpan: 1, colSpan: 1};
    els.row.value = g.row ?? 1;
    els.col.value = g.col ?? 1;
    els.rowspan.value = g.rowSpan ?? 1;
    els.colspan.value = g.colSpan ?? 1;

    const b = item.box || {};
    els.x.value = b.x ?? 0;
    els.y.value = b.y ?? 0;
    els.w.value = b.w ?? 20;
    els.h.value = b.h ?? 20;

    els.alignH.value = item.align?.h || 'center';
    els.alignV.value = item.align?.v || 'middle';

    const fam = item.text?.font || els.fontFamilyDDL?.value || 'Arial, Helvetica, sans-serif';
    if (els.fontFamilyDDL) els.fontFamilyDDL.value = fam;
    if (els.font) els.font.value = fam;
    if (els.textarea) {
        els.textarea.placeholder = 'enter your text';
        els.textarea.maxLength = 1000;
        els.textarea.value = (item.text?.value ?? '').slice(0, 1000);
    }
    if (els.fontSize) els.fontSize.value = item.text?.size ?? 4;
    if (els.line) els.line.value = item.text?.line ?? 1.2;

    if (els.scale) els.scale.value = item.svg?.scale ?? 100;
    if (els.preserve) els.preserve.checked = !!item.svg?.preserveAspect;
    if (els.svgW) els.svgW.value = item.svg?.w ?? '';
    if (els.svgH) els.svgH.value = item.svg?.h ?? '';
    if (els.invert) els.invert.checked = !!item.svg?.invert;
    // show persisted filename if the UI provides a label (do NOT try to set file input value)
    const nameLabel = document.getElementById('pc-svg-filename');
    if (nameLabel) nameLabel.textContent = item.svg?.name || '';

    if (els.rotate) els.rotate.value = item.transform?.rotate ?? 0;
    if (els.mirrorX) els.mirrorX.checked = !!item.transform?.mirrorX;
    if (els.mirrorY) els.mirrorY.checked = !!item.transform?.mirrorY;
    if (els.stroke) els.stroke.value = item.style?.strokeW ?? 0.35;
    if (els.opacity) els.opacity.value = (item.style?.opacity ?? 100);
}

// Switch item type only when the Type <select> changes or an operation explicitly asks for it
function switchItemType(newType) {
    const p = panelState();
    const it = p.items.find(i => i.id === (getEditItemId() || getSelectedItemId()));
    if (!it) return;
    const t = newType === 'svg' ? 'svg' : 'text';
    if (it.type === t) return;

    it.type = t;
    if (t === 'svg') {
        delete it.text;
        it.svg = it.svg || {content: '', scale: 100, preserveAspect: true, w: undefined, h: undefined, invert: false};
    } else {
        delete it.svg;
        const family = els.fontFamilyDDL?.value || els.font?.value || 'Inter';
        it.text = it.text || {value: 'enter your text', font: family, size: 4, line: 1.2};
    }
    saveState();
    toggleTypeProps(t);
    syncEditorsToItem(it);
    renderAll(activeSvg());
}

// ---------- edit workflow ----------
export function pc_enterEdit(panelName, itemId) {
    setCurrentPanel(panelName || nowPanel());
    setSelectedItemId(itemId);

    const p = panelState(nowPanel());
    const it = p.items.find(i => i.id === itemId);

    if (!it) return;

    setUiMode(UIMODES.OBJECT);
    setEditItemId(itemId);
    setEditOriginal(JSON.parse(JSON.stringify(it)));

    pc_activateEditorTab('object');
    toggleTypeProps(it.type || 'text');
    syncEditorsToItem(it); // sets type select + toggles controls
    setEditUI(true);
    renderAll(activeSvg());

    highlightSelection();
    setTimeout(() => {
        els.textarea?.focus();
        els.textarea?.select();
    }, 0);
}

function onConfirm() {
    if (!getEditItemId()) return;
    saveState();
    setUiMode(UIMODES.CELL);
    clearSelection();
}

function onCancel() {
    if (!getEditItemId() || !getEditOriginal()) return;
    const p = panelState(nowPanel());
    const idx = p.items.findIndex(i => i.id === getEditItemId());
    if (idx >= 0) p.items[idx] = getEditOriginal();
    saveState();
    setUiMode(UIMODES.CELL);
    clearSelection();
    if (idx >= 0) syncEditorsToItem(p.items[idx]);
}

// Live commit of current editor fields (does NOT touch layout or type)
function commitEditors() {
    const p = panelState();
    const it = p.items.find(i => i.id === (getEditItemId() || getSelectedItemId()));
    if (!it) return;

    const currentType = it.type || 'text';
    it.name = els.name.value || it.name;

    if ((p.layout.mode || 'grid') === 'grid') {
        it.grid = it.grid || {};
        it.grid.row = Number(els.row.value);
        it.grid.col = Number(els.col.value);
        it.grid.rowSpan = Number(els.rowspan.value);
        it.grid.colSpan = Number(els.colspan.value);
    } else {
        it.box = it.box || {};
        it.box.x = Number(els.x.value);
        it.box.y = Number(els.y.value);
        it.box.w = Number(els.w.value);
        it.box.h = Number(els.h.value);
    }

    it.align = {h: els.alignH.value, v: els.alignV.value};

    if (currentType === 'text') {
        it.text = it.text || {};
        const chosenFamily = els.fontFamilyDDL?.value || els.font?.value || it.text.font || 'Inter';
        it.text.value = (els.textarea?.value || '').slice(0, 1000);
        it.text.font = chosenFamily;
        it.text.size = Number(els.fontSize.value);
        it.text.line = Number(els.line.value);
    } else {
        it.svg = it.svg || {};
        it.svg.scale = Number(els.scale.value);
        it.svg.preserveAspect = !!(els.preserve && els.preserve.checked);
        it.svg.w = els.svgW && els.svgW.value !== '' ? Number(els.svgW.value) : undefined;
        it.svg.h = els.svgH && els.svgH.value !== '' ? Number(els.svgH.value) : undefined;
        it.svg.invert = !!els.invert?.checked;
    }

    it.transform = {
        rotate: Number(els.rotate.value),
        mirrorX: !!els.mirrorX.checked,
        mirrorY: !!els.mirrorY.checked
    };
    it.style = {
        strokeW: Number(els.stroke.value),
        opacity: Number(els.opacity.value)
    };

    renderAll(activeSvg());
    if (!getEditItemId()) saveState();
}

// ---------- uploads (SVG content) ----------
function sanitizeSvg(src) {
    const temp = document.createElement('div');
    temp.innerHTML = src || '';
    temp.querySelectorAll('script').forEach(n => n.remove());
    temp.querySelectorAll('*').forEach(n => {
        [...n.attributes].forEach(a => {
            if (/^on/i.test(a.name)) n.removeAttribute(a.name);
        });
    });
    return temp.innerHTML;
}

function bindSvgUpload() {
    els.svgSrc?.addEventListener('change', async (e) => {
        const f = e.currentTarget.files?.[0];
        if (!f) return;
        try {
            const txt = await f.text();
            const p = panelState();
            const id = (getEditItemId() || getSelectedItemId());
            const it = p.items.find(i => i.id === id);
            if (!it) return;

            if (it.type !== 'svg') switchItemType('svg');
            it.svg = it.svg || {scale: 100, preserveAspect: true, invert: false};
            it.svg.content = sanitizeSvg(txt);       // persist SVG
            it.svg.name = f.name || it.svg.name;     // persist filename (for label)
            it.name = it.name || it.svg.name || 'SVG';

            const lbl = document.getElementById('pc-svg-filename');
            if (lbl) lbl.textContent = it.svg.name || '';

            renderAll(getCurrentSvg());
            if (!getEditItemId()) saveState();
        } finally {
            e.currentTarget.value = '';
        }
    });

}

// ---------- deletion ----------
export function deleteItem(panelName, itemId) {
    const p = panelState(panelName);
    p.items = p.items.filter(i => i.id !== itemId);
    if (getSelectedItemId() === itemId) setSelectedItemId(null);
    if (getEditItemId() === itemId) {
        setEditItemId(null);
        setEditOriginal(null);
    }
    saveState();
    rebuildItemsList();
    renderAll(activeSvg());
}

// ---------- public helpers / API for other modules ----------
export function pc_activateEditorTab(which) {
    const btnLayout = document.getElementById('pc-tabbtn-layout');
    const btnObject = document.getElementById('pc-tabbtn-object');
    const paneLayout = document.getElementById('pc-tab-layout');
    const paneObject = document.getElementById('pc-tab-object');
    const useBS = !!window.bootstrap;

    const activate = (btnOn, paneOn, btnOff, paneOff) => {
        if (useBS && window.bootstrap.Tab) {
            try {
                new window.bootstrap.Tab(btnOn).show();
            } catch {
            }
        } else {
            btnOn.classList.add('active');
            paneOn.classList.add('show', 'active');
            btnOff.classList.remove('active');
            paneOff.classList.remove('show', 'active');
        }
        document.getElementById('pc-sec-editor')?.scrollIntoView({block: 'nearest'});
    };

    if (which === 'layout') {
        setUiMode(UIMODES.PANEL);
        syncLayoutForm();
        activate(btnLayout, paneLayout, btnObject, paneObject);
    } else {
        setUiMode(UIMODES.OBJECT);
        activate(btnObject, paneObject, btnLayout, paneLayout);
    }
}

function syncCellFormFromActive() {
    const ac = getActiveCell();
    const fs = document.getElementById('pc-cell-config');
    const rI = document.getElementById('pc-cell-row');
    const cI = document.getElementById('pc-cell-col');
    const pI = document.getElementById('pc-cell-pad');
    const ah = document.getElementById('pc-cell-align-h');
    const av = document.getElementById('pc-cell-align-v');
    if (!fs || !rI || !cI || !pI || !ah || !av) return;

    if (!ac || !ac.panel) {
        fs.disabled = true;
        rI.value = '';
        cI.value = '';
        pI.value = '';
        ah.value = '';
        av.value = '';
        return;
    }
    fs.disabled = false;
    rI.value = ac.row;
    cI.value = ac.col;
    const cfg = pc_getCellConfig(ac.panel, ac.row, ac.col) || {};
    pI.value = (cfg.pad ?? '');
    ah.value = cfg.ah || '';
    av.value = cfg.av || '';
}

function saveCellForm() {
    const ac = getActiveCell();
    if (!ac || !ac.panel) return;
    const pad = document.getElementById('pc-cell-pad')?.value;
    const ah = document.getElementById('pc-cell-align-h')?.value || '';
    const av = document.getElementById('pc-cell-align-v')?.value || '';
    pc_setCellConfig(ac.panel, ac.row, ac.col, {
        pad: pad === '' ? undefined : Number(pad),
        ah: ah || undefined,
        av: av || undefined
    });
    // repaint
    const svg = getCurrentSvg();
    if (svg) {
        renderAll(svg);
        pi_onGeometryChanged(svg);
    }
}

function clearCellForm() {
    const ac = getActiveCell();
    if (!ac || !ac.panel) return;
    pc_setCellConfig(ac.panel, ac.row, ac.col, null);
    syncCellFormFromActive();
    const svg = getCurrentSvg();
    if (svg) {
        renderAll(svg);
        pi_onGeometryChanged(svg);
    }
}

// Create item at a grid cell; kind: 'text' | 'svg'
export function pc_createItemInCell(panelName, kind, cell) {
    const p = panelState(panelName);
    const t = normalizeKind(kind);
    const id = nid();
    const base = {
        id,
        name: t === 'svg' ? 'SVG' : 'Text',
        grid: {row: cell.row, col: cell.col, rowSpan: 1, colSpan: 1},
        align: {h: 'center', v: 'middle'},
        transform: {rotate: 0, mirrorX: false, mirrorY: false},
        style: {strokeW: 0.35, opacity: 100},
        visible: true
    };
    const family = els.fontFamilyDDL?.value || els.font?.value || 'Inter';
    const item = (t === 'svg')
        ? {
            ...base,
            type: 'svg',
            svg: {content: '', scale: 100, preserveAspect: true, w: undefined, h: undefined, invert: false}
        }
        : {...base, type: 'text', text: {value: 'enter your text', font: family, size: 4, line: 1.2}};

    p.items.push(item);
    saveState();
    return id;
}

export function pc_renderAll(svg) {
    renderAll(svg || activeSvg());
}

export function pc_getStateRef() {
    return getStateRef();
}

export function pc_deleteItem(panelName, itemId) {
    deleteItem(panelName, itemId);
}

export function pc_save() {
    saveState();
}

export function pc_bindSvg(svg) {
    setCurrentSvg(svg);
    bindSvgDeselect(svg, clearSelection);
}

export function pc_setItemType(panelName, itemId, type) {
    const p = panelState(panelName);
    const it = p.items.find(i => i.id === itemId);
    if (!it) return;
    const isSvg = String(type).toLowerCase().includes('svg');
    if (isSvg && it.type !== 'svg') {
        it.type = 'svg';
        delete it.text;
        it.svg = it.svg || {content: '', scale: 100, preserveAspect: true, w: undefined, h: undefined, invert: false};
    } else if (!isSvg && it.type !== 'text') {
        it.type = 'text';
        delete it.svg;
        const family = els.fontFamilyDDL?.value || els.font?.value || 'Inter';
        it.text = it.text || {value: 'enter your text', font: family, size: 4, line: 1.2};
    }
    saveState();
    syncEditorsToItem(it);
    renderAll(activeSvg());
}

export function pc_forceType(newType) {
    switchItemType(newType);
}

// ---------- palette helpers (drag + click to add) ----------
function setPresetApplyPending(pending) {
    const btn = document.getElementById('pc-apply-preset');
    if (!btn) return;
    btn.disabled = !pending;
    btn.classList.toggle('btn-warning', pending);
    btn.classList.toggle('btn-outline-secondary', !pending);
}

function makeDraggable(el, kind) {
    if (!el) return;
    el.setAttribute('draggable', 'true');
    el.setAttribute('data-pc-drag', kind);
    el.addEventListener('dragstart', (e) => {
        try {
            e.dataTransfer.setData('text/plain', kind);
            e.dataTransfer.effectAllowed = 'copy';
        } catch {
        }
    });
}

function clickToAdd(el, kind) {
    if (!el) return;
    el.setAttribute('data-pc-add', kind);
    el.addEventListener('click', () => {
        const ac = ensureActiveCellOrDefault();
        const id = pc_createItemInCell(ac.panel, kind, {row: ac.row, col: ac.col});
        renderAll(activeSvg());
        import('./../panel-content.js').then(m => {
            if (m.pc_activateEditorTab) m.pc_activateEditorTab('object');
            if (m.pc_enterEdit) m.pc_enterEdit(ac.panel, id);
        }).catch(() => {
        });
    });
}

function bindPalette() {
    makeDraggable(els.presetTitle, 'text');
    clickToAdd(els.presetTitle, 'text');
    const svgBtn = document.querySelector('[data-pc-add="svg"]') || document.querySelector('#pc-preset-svg') || document.querySelector('[data-role="pc-add-svg"]');
    makeDraggable(svgBtn, 'svg');
    clickToAdd(svgBtn, 'svg');
}

// ---------- init ----------
export function initEditing() {
    // item controls → live commit
    [
        els.type, els.name, els.row, els.col, els.rowspan, els.colspan,
        els.x, els.y, els.w, els.h, els.alignH, els.alignV,
        els.textarea, els.font, els.fontFamilyDDL, els.fontSize, els.line,
        els.scale, els.preserve, els.svgW, els.svgH, els.invert,
        els.rotate, els.mirrorX, els.mirrorY, els.stroke, els.opacity
    ].forEach(el => el && el.addEventListener('input', commitEditors));

    // Type changes handled explicitly (avoid clobber)
    els.type?.addEventListener('change', () => {
        const val = els.type.value === 'svg' ? 'svg' : 'text';
        switchItemType(val);
    });

    // layout controls → commitLayout
    [els.rows, els.cols, els.gutter, els.padding].forEach(el => el && el.addEventListener('input', commitLayout));
    [els.layoutGrid, els.layoutFree, els.showGuides].forEach(el => el && el.addEventListener('change', () => {
        if (typeof toggleLayoutGroups === 'function') toggleLayoutGroups();
        commitLayout();
    }));

    // explicit layout save (optional)
    document.getElementById('pc-layout-save')?.addEventListener('click', () => commitLayout());

    // when layout tab becomes visible, resync its fields
    document.getElementById('pc-tabbtn-layout')?.addEventListener('shown.bs.tab', () => {
        syncLayoutForm();
    });

    document.getElementById('pc-apply-preset')?.addEventListener('click', () => {
        const sel = document.getElementById('pc-layout-preset');
        if (!sel) return;
        applyPreset(sel.value);
        setPresetApplyPending(false);
    });

    const presetSel = document.getElementById('pc-layout-preset');
    if (presetSel) {
        presetSel.addEventListener('change', () => {
            // color the button only if a preset is selected
            setPresetApplyPending(!!presetSel.value);
        });
        // initial state
        setPresetApplyPending(false);
    }

    document.getElementById('pc-cell-save')?.addEventListener('click', saveCellForm);
    document.getElementById('pc-cell-clear')?.addEventListener('click', clearCellForm);

// keep form in sync with clicks/drops on preview
    document.addEventListener('pc:activeCellChanged', syncCellFormFromActive);
// also run once at init
    syncCellFormFromActive();

    // panel selector
    els.panel?.addEventListener('change', () => {
        setActiveCell(null);
        setCurrentPanel(els.panel.value);
        clearSelection();
        rebuildItemsList();
        syncEditorsToItem(null);
        syncLayoutForm();
        commitLayout();
    });

    // keyboard: P / C / O modes
    document.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
        if (e.key === 'p' || e.key === 'P') setUiMode(UIMODES.PANEL);
        if (e.key === 'c' || e.key === 'C') setUiMode(UIMODES.CELL);
        if (e.key === 'o' || e.key === 'O') setUiMode(UIMODES.OBJECT);
    });

    document.addEventListener('pc:panelChanged', () => {
        if (els.panel) els.panel.value = getCurrentPanel();
        rebuildItemsList();
        syncEditorsToItem(null);
        syncLayoutForm();
    });

    document.addEventListener('pc:activeCellChanged', () => {
        syncLayoutForm();
    });

    (function bindDnDSources() {
        const btnText = document.getElementById('pc-drag-text');
        const btnSvg = document.getElementById('pc-drag-svg');

        if (btnText && !btnText._pcBound) {
            btnText._pcBound = true;
            btnText.setAttribute('draggable', 'true');
            btnText.addEventListener('dragstart', (e) => {
                try {
                    e.dataTransfer.setData('text/plain', 'text');   // critical: non-empty data
                    e.dataTransfer.effectAllowed = 'copy';
                } catch {
                }
                // fallback hint
                if (typeof window !== 'undefined') window._lastDragKind = 'text';
            }, {capture: true});
        }

        if (btnSvg && !btnSvg._pcBound) {
            btnSvg._pcBound = true;
            btnSvg.setAttribute('draggable', 'true');
            btnSvg.addEventListener('dragstart', (e) => {
                try {
                    e.dataTransfer.setData('text/plain', 'svg');    // critical: makes drop handler resolve to 'svg'
                    e.dataTransfer.effectAllowed = 'copy';
                } catch {
                }
                // fallback hint
                if (typeof window !== 'undefined') window._lastDragKind = 'svg';
            }, {capture: true});
        }
    })();

    // confirm / cancel
    els.confirm?.addEventListener('click', onConfirm);
    els.cancel?.addEventListener('click', onCancel);

    // showGuides instant repaint
    els.showGuides?.addEventListener('change', () => {
        const svg = activeSvg();
        if (svg) renderAll(svg);
    });

    // uploads
    bindSvgUpload();

    // expose to render module via bus
    bus.setEnterEdit(pc_enterEdit);
    bus.setCurrentPanelFn(() => nowPanel());
    bus.setDeleteRequest((panel, id) => deleteItem(panel, id));

    // initial UI
    toggleLayoutGroups();
    syncLayoutForm();

    const p = panelState();
    setSelectedItemId(p.items[0]?.id || null);
    rebuildItemsList();
    syncEditorsToItem(activeItem());
    toggleTypeProps(activeItem()?.type || 'text');
    setEditUI(false);
    setUiMode(UIMODES.CELL);

    // palette
    bindPalette();
}
