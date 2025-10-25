// public/js/edit.js
// Editor logic: layout + item editing, selection, uploads, bindings.
// Adds: explicit layout sync, mode-aware behaviors, and tab activation helpers.

import {els, toggleLayoutGroups, toggleTypeProps} from './dom.js';
import {
    getStateRef, panelState, saveState,
    getCurrentPanel, setCurrentPanel,
    getSelectedItemId, setSelectedItemId,
    getEditItemId, setEditItemId,
    getEditOriginal, setEditOriginal,
    getCurrentSvg, setCurrentSvg, setActiveCell,
    setUiMode, getUiMode, UIMODES
} from './state.js';
import {nid} from './utils.js';
import {renderAll} from './render.js';
import {bindSvgDeselect} from './utils.js';
import {bus} from './signal-bus.js';
import {pi_onGeometryChanged} from './../panel-interaction.js';

// ---------- selection ----------
function clearSelection() {
    const hadAny = !!(getSelectedItemId() || getEditItemId());
    setSelectedItemId(null);
    setEditItemId(null);
    setEditOriginal(null);
    setEditUI(false);
    if (hadAny) {
        rebuildItemsList();
        renderAll(getCurrentSvg());
    }
}

export function pc_clearSelection() {
    clearSelection();
}

// ---------- layout: commit + form sync ----------
function commitLayout() {
    const p = panelState();
    p.layout.mode = els.layoutGrid?.checked ? 'grid' : 'free';
    p.layout.rows = Math.max(1, Number(els.rows?.value || 1));
    p.layout.cols = Math.max(1, Number(els.cols?.value || 1));
    p.layout.gutter = Math.max(0, Number(els.gutter?.value || 0));
    p.layout.padding = Math.max(0, Number(els.padding?.value || 0));
    saveState();

    const svg = getCurrentSvg();
    if (svg) {
        renderAll(svg);
        pi_onGeometryChanged(svg);
    }
}

function syncLayoutForm() {
    const cur = getCurrentPanel?.() || 'Front';
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

// ---------- legacy list (optional UI) ----------
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
            renderAll(getCurrentSvg());
        };

        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'btn btn-sm btn-link text-start name';
        name.textContent = it.name || (it.type === 'text' ? 'Text' : 'SVG');
        name.onclick = () => {
            setSelectedItemId(it.id);
            syncEditorsToItem(it);
            highlightSelection();
            renderAll(getCurrentSvg());
        };

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn btn-sm btn-outline-primary btn-icon';
        edit.innerHTML = '<i class="bi bi-pencil-square"></i>';
        edit.onclick = () => {
            pc_activateEditorTab('object');   // ensure Object tab is active
            pc_enterEdit(getCurrentPanel(), it.id);
        }

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-sm btn-outline-danger btn-icon';
        del.innerHTML = '<i class="bi bi-trash"></i>';
        del.onclick = () => deleteItem(getCurrentPanel(), it.id);

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

    els.type.value = item.type || 'text';
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
    els.fontSize.value = item.text?.size ?? 4;
    els.line.value = item.text?.line ?? 1.2;

    els.scale.value = item.svg?.scale ?? 100;
    els.preserve.checked = !!item.svg?.preserveAspect;
    if (els.svgW) els.svgW.value = item.svg?.w ?? '';
    if (els.svgH) els.svgH.value = item.svg?.h ?? '';
    if (els.invert) els.invert.checked = !!item.svg?.invert;

    els.rotate.value = item.transform?.rotate ?? 0;
    els.mirrorX.checked = !!item.transform?.mirrorX;
    els.mirrorY.checked = !!item.transform?.mirrorY;
    els.stroke.value = item.style?.strokeW ?? 0.35;
    els.opacity.value = (item.style?.opacity ?? 100);

    toggleTypeProps(item?.type || 'text');
}

// ---------- edit workflow ----------
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

export function pc_enterEdit(panelName, itemId) {
    pc_activateEditorTab('object');
    setCurrentPanel(panelName || getCurrentPanel());
    setSelectedItemId(itemId);
    const p = panelState(getCurrentPanel());
    const it = p.items.find(i => i.id === itemId);
    if (!it) return;
    setUiMode(UIMODES.OBJECT); // lock into object mode while editing
    setEditItemId(itemId);
    setEditOriginal(JSON.parse(JSON.stringify(it)));
    setEditUI(true);
    syncEditorsToItem(it);
    highlightSelection();
    renderAll(getCurrentSvg());
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
    const p = panelState(getCurrentPanel());
    const idx = p.items.findIndex(i => i.id === getEditItemId());
    if (idx >= 0) p.items[idx] = getEditOriginal();
    saveState();
    setUiMode(UIMODES.CELL);
    clearSelection();
    if (idx >= 0) syncEditorsToItem(p.items[idx]);
}

// ---------- live commit (layout always, then item if any) ----------
function commitEditors() {
    const p = panelState();
    const it = p.items.find(i => i.id === (getEditItemId() || getSelectedItemId()));
    if (!it) return;

    it.type = els.type.value;
    it.name = els.name.value || it.name;

    if (it.type === 'svg') {
        delete it.text;
    }

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

    if (it.type === 'text') {
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

    renderAll(getCurrentSvg());
    if (!getEditItemId()) saveState();
}

// ---------- uploads ----------
function sanitizeSvg(src) {
    const temp = document.createElement('div');
    temp.innerHTML = src;
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
        const input = e.currentTarget;
        const f = input.files && input.files[0];
        if (!f) return;
        try {
            const txt = await f.text();
            const p = panelState();
            const id = (getEditItemId() || getSelectedItemId());
            const it = p.items.find(i => i.id === id);
            if (!it) return;
            if (it.type !== 'svg') {
                it.type = 'svg';
                it.svg = it.svg || {scale: 100, preserveAspect: true, invert: false};
                delete it.text;
                els.type && (els.type.value = 'svg');
                toggleTypeProps('svg');
            }
            it.svg.content = sanitizeSvg(txt);
            it.name = f.name || it.name;
            renderAll(getCurrentSvg());
            if (!getEditItemId()) saveState();
        } catch (err) {
            console.error('SVG read failed', err);
        } finally {
            input.value = '';
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
    renderAll(getCurrentSvg());
}

// ---------- init ----------
export function initEditing() {
    // item controls → commitEditors
    [
        els.type, els.name, els.row, els.col, els.rowspan, els.colspan,
        els.x, els.y, els.w, els.h, els.alignH, els.alignV,
        els.textarea, els.font, els.fontFamilyDDL, els.fontSize, els.line,
        els.scale, els.preserve, els.svgW, els.svgH, els.invert,
        els.rotate, els.mirrorX, els.mirrorY, els.stroke, els.opacity
    ].forEach(el => el && el.addEventListener('input', commitEditors));
    els.type?.addEventListener('change', () => {
        toggleTypeProps(els.type.value);
        commitEditors();
    });

    // layout controls → commitLayout
    [els.rows, els.cols, els.gutter, els.padding].forEach(el => el && el.addEventListener('input', commitLayout));
    [els.layoutGrid, els.layoutFree, els.showGuides].forEach(el => el && el.addEventListener('change', () => {
        if (typeof toggleLayoutGroups === 'function') toggleLayoutGroups();
        commitLayout();
    }));

    // explicit save button for layout (optional explicit commit)
    document.getElementById('pc-layout-save')?.addEventListener('click', () => commitLayout());

    // when layout tab becomes visible, resync its fields
    document.getElementById('pc-tabbtn-layout')?.addEventListener('shown.bs.tab', () => {
        syncLayoutForm();
    });

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

    // confirm / cancel
    els.confirm?.addEventListener('click', onConfirm);
    els.cancel?.addEventListener('click', onCancel);

    // showGuides instant repaint
    els.showGuides?.addEventListener('change', () => {
        const svg = getCurrentSvg();
        if (svg) renderAll(svg);
    });

    bindSvgUpload();

    // expose to render module via bus
    bus.setEnterEdit(pc_enterEdit);
    bus.setCurrentPanelFn(() => getCurrentPanel());
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

    // keep Layout form in sync when panel is changed via mouse in preview / tree
    document.addEventListener('pc:panelChanged', () => {
        // reflect current panel in selector
        if (els.panel) els.panel.value = getCurrentPanel();
        // refresh list + editors to panel’s context
        rebuildItemsList();
        syncEditorsToItem(null);
        // update rows/cols/gutter/padding + grid/free toggle
        syncLayoutForm();
        if (typeof toggleLayoutGroups === 'function') toggleLayoutGroups();
    });

    // optional: when active cell changes via mouse, ensure layout controls reflect mode
    document.addEventListener('pc:activeCellChanged', () => {
        syncLayoutForm();
    });
}

// ---------- public helpers ----------
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

// create item at a grid cell
export function pc_createItemInCell(panelName, kind, cell) {
    const p = panelState(panelName);
    const id = nid();
    const base = {
        id,
        name: kind === 'svg' ? 'SVG' : 'Text',
        grid: {row: cell.row, col: cell.col, rowSpan: 1, colSpan: 1},
        align: {h: 'center', v: 'middle'},
        transform: {rotate: 0, mirrorX: false, mirrorY: false},
        style: {strokeW: 0.35, opacity: 100},
        visible: true
    };
    const family = els.fontFamilyDDL?.value || els.font?.value || 'Inter';
    const item = (kind === 'svg')
        ? {
            ...base,
            type: 'svg',
            svg: {content: '', scale: 100, preserveAspect: true, w: undefined, h: undefined, invert: false}
        }
        : {...base, type: 'text', text: {value: '', font: family, size: 4, line: 1.2}};

    p.items.push(item);
    saveState();
    return id;
}

export function pc_renderAll(svg) {
    renderAll(svg || getCurrentSvg());
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
