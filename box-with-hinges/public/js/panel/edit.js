import { els, toggleLayoutGroups, toggleTypeProps } from './dom.js';
import {
    getStateRef, panelState, saveState,
    getCurrentPanel, setCurrentPanel,
    getSelectedItemId, setSelectedItemId,
    getEditItemId, setEditItemId,
    getEditOriginal, setEditOriginal,
    getCurrentSvg, setCurrentSvg
} from './state.js';
import { nid } from './utils.js';
import { renderAll } from './render.js';
import { bindSvgDeselect } from './utils.js';
import { bus } from './signal-bus.js';

// Selection
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
export function pc_clearSelection() { clearSelection(); }

// List (legacy)
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
        eye.onclick = () => { it.visible = it.visible === false ? true : false; saveState(); rebuildItemsList(); renderAll(getCurrentSvg()); };

        const handle = document.createElement('span');
        handle.className = 'handle';
        handle.innerHTML = '<i class="bi bi-grip-vertical"></i>';

        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'btn btn-sm btn-link text-start name';
        name.textContent = it.name || (it.type === 'text' ? 'Text' : 'SVG');
        name.onclick = () => { setSelectedItemId(it.id); syncEditorsToItem(it); highlightSelection(); renderAll(getCurrentSvg()); };

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn btn-sm btn-outline-primary btn-icon';
        edit.innerHTML = '<i class="bi bi-pencil-square"></i>';
        edit.onclick = () => pc_enterEdit(getCurrentPanel(), it.id);

        const dup = document.createElement('button');
        dup.type = 'button';
        dup.className = 'btn btn-sm btn-outline-secondary btn-icon';
        dup.innerHTML = '<i class="bi bi-files"></i>';
        dup.onclick = () => {
            const copy = JSON.parse(JSON.stringify(it));
            copy.id = nid();
            p.items.push(copy);
            saveState(); rebuildItemsList(); renderAll(getCurrentSvg());
        };

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-sm btn-outline-danger btn-icon';
        del.innerHTML = '<i class="bi bi-trash"></i>';
        del.onclick = () => deleteItem(getCurrentPanel(), it.id);

        row.append(eye, handle, name, edit, dup, del);
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

// Editor sync
function activeItem() {
    const p = panelState();
    return p.items.find(x => x.id === getSelectedItemId()) || null;
}
export function syncEditorsToItem(item) {
    if (!item) return;

    els.type.value = item.type || 'text';
    els.name.value = item.name || '';

    const g = item.grid || { row:1, col:1, rowSpan:1, colSpan:1 };
    els.row.value     = g.row ?? 1;
    els.col.value     = g.col ?? 1;
    els.rowspan.value = g.rowSpan ?? 1;
    els.colspan.value = g.colSpan ?? 1;

    const b = item.box || {};
    els.x.value = b.x ?? 0; els.y.value = b.y ?? 0; els.w.value = b.w ?? 20; els.h.value = b.h ?? 20;

    els.alignH.value = item.align?.h || 'center';
    els.alignV.value = item.align?.v || 'middle';

    const fam = item.text?.font || els.fontFamilyDDL?.value || 'Arial, Helvetica, sans-serif';
    if (els.fontFamilyDDL) els.fontFamilyDDL.value = fam;
    if (els.font) els.font.value = fam;
    if (els.textarea) {
        els.textarea.placeholder = 'enter your text';
        els.textarea.maxLength = 1000;
        els.textarea.value = (item.text?.value || '').slice(0, 1000);
    }
    els.fontSize.value = item.text?.size ?? 4;
    els.line.value     = item.text?.line ?? 1.2;

    els.scale.value    = item.svg?.scale ?? 100;
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

// Edit workflow
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
    if (els.cancel)  els.cancel.disabled  = !enabled;
}
export function pc_enterEdit(panelName, itemId) {
    setCurrentPanel(panelName || getCurrentPanel());
    setSelectedItemId(itemId);
    const p = panelState(getCurrentPanel());
    const it = p.items.find(i => i.id === itemId);
    if (!it) return;
    setEditItemId(itemId);
    setEditOriginal(JSON.parse(JSON.stringify(it)));
    setEditUI(true);
    syncEditorsToItem(it);
    highlightSelection();
    renderAll(getCurrentSvg());
    setTimeout(() => { els.textarea?.focus(); els.textarea?.select(); }, 0);
}
function onConfirm() {
    if (!getEditItemId()) return;
    saveState();
    clearSelection();
}
function onCancel() {
    if (!getEditItemId() || !getEditOriginal()) return;
    const p = panelState(getCurrentPanel());
    const idx = p.items.findIndex(i => i.id === getEditItemId());
    if (idx >= 0) p.items[idx] = getEditOriginal();
    saveState();
    clearSelection();
    if (idx >= 0) syncEditorsToItem(p.items[idx]);
}

// Live commit
function commitEditors() {
    const p = panelState();
    let it = p.items.find(i => i.id === (getEditItemId() || getSelectedItemId()));
    if (!it) return;

    it.type = els.type.value;
    it.name = els.name.value || it.name;

    if (it.type === 'svg') { delete it.text; }

    p.layout.mode = els.layoutGrid?.checked ? 'grid' : 'free';
    p.layout.rows = Number(els.rows.value);
    p.layout.cols = Number(els.cols.value);
    p.layout.gutter = Number(els.gutter.value);
    p.layout.padding = Number(els.padding.value);

    if (p.layout.mode === 'grid') {
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

    it.align = { h: els.alignH.value, v: els.alignV.value };

    if (it.type === 'text') {
        it.text = it.text || {};
        const chosenFamily = els.fontFamilyDDL?.value || els.font?.value || it.text.font || 'Inter';
        it.text.value = (els.textarea?.value || '').slice(0, 1000);
        it.text.font  = chosenFamily;
        it.text.size  = Number(els.fontSize.value);
        it.text.line  = Number(els.line.value);
    } else {
        it.svg = it.svg || {};
        it.svg.scale = Number(els.scale.value);
        it.svg.preserveAspect = !!els.preserve.checked;
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

// File import
function sanitizeSvg(src) {
    const temp = document.createElement('div');
    temp.innerHTML = src;
    temp.querySelectorAll('script').forEach(n => n.remove());
    temp.querySelectorAll('*').forEach(n => {
        [...n.attributes].forEach(a => { if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
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
            let it = p.items.find(i => i.id === id);
            if (!it) return;
            if (it.type !== 'svg') {
                it.type = 'svg';
                it.svg = it.svg || { scale:100, preserveAspect:true, invert:false };
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

// Deletion
export function deleteItem(panelName, itemId) {
    const p = panelState(panelName);
    p.items = p.items.filter(i => i.id !== itemId);
    if (getSelectedItemId() === itemId) setSelectedItemId(null);
    if (getEditItemId() === itemId) { setEditItemId(null); setEditOriginal(null); }
    saveState();
    rebuildItemsList();
    renderAll(getCurrentSvg());
}

// Init + bindings
export function initEditing() {
    // listeners
    [
        els.type, els.name, els.row, els.col, els.rowspan, els.colspan,
        els.x, els.y, els.w, els.h, els.alignH, els.alignV,
        els.textarea, els.font, els.fontFamilyDDL, els.fontSize, els.line,
        els.scale, els.preserve, els.svgW, els.svgH, els.invert,
        els.rotate, els.mirrorX, els.mirrorY, els.stroke, els.opacity,
        els.rows, els.cols, els.gutter, els.padding, els.layoutGrid, els.layoutFree
    ].forEach(el => el && el.addEventListener('input', commitEditors));

    els.type?.addEventListener('change', () => { toggleTypeProps(els.type.value); commitEditors(); });

    els.panel?.addEventListener('change', () => {
        setCurrentPanel(els.panel.value);
        clearSelection();
        rebuildItemsList();
        syncEditorsToItem(null);
        if (getCurrentSvg()) renderAll(getCurrentSvg());
    });

    [els.layoutGrid, els.layoutFree].forEach(el => el && el.addEventListener('change', () => { toggleLayoutGroups(); commitEditors(); }));

    els.presetCards?.addEventListener('click', () => {
        const p = panelState();
        p.layout = { mode:'grid', rows:2, cols:2, gutter:2, padding:4 };
        saveState();
        els.rows.value = 2; els.cols.value = 2; els.gutter.value = 2; els.padding.value = 4;
        renderAll(getCurrentSvg());
    });
    els.presetTitle?.addEventListener('click', () => {
        const p = panelState();
        p.layout = { mode:'grid', rows:3, cols:1, gutter:2, padding:6 };
        saveState();
        els.rows.value = 3; els.cols.value = 1; els.gutter.value = 2; els.padding.value = 6;
        renderAll(getCurrentSvg());
    });
    els.presetCenter?.addEventListener('click', () => {
        const p = panelState();
        p.layout = { mode:'grid', rows:1, cols:1, gutter:0, padding:10 };
        saveState();
        els.rows.value = 1; els.cols.value = 1; els.gutter.value = 0; els.padding.value = 10;
        renderAll(getCurrentSvg());
    });

    document.addEventListener('keydown', (e) => {
        if (!(e.key === 'Delete' || e.key === 'Backspace')) return;
        const ae = document.activeElement;
        const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
        if (typing) return;
        const id = getEditItemId() || getSelectedItemId();
        if (!id) return;
        e.preventDefault();
        deleteItem(getCurrentPanel(), id);
    });

    els.showGuides?.addEventListener('change', () => { const svg = getCurrentSvg(); if (svg) renderAll(svg); });

    bindSvgUpload();

    // expose to render module via bus
    bus.setEnterEdit(pc_enterEdit);
    bus.setCurrentPanelFn(() => getCurrentPanel());
    bus.setDeleteRequest((panel, id) => deleteItem(panel, id));

    // initial UI
    toggleLayoutGroups();
    const p = panelState();
    if (els.rows)    els.rows.value = p.layout.rows;
    if (els.cols)    els.cols.value = p.layout.cols;
    if (els.gutter)  els.gutter.value = p.layout.gutter;
    if (els.padding) els.padding.value = p.layout.padding;

    setSelectedItemId(p.items[0]?.id || null);
    rebuildItemsList();
    syncEditorsToItem(activeItem());
    toggleTypeProps(activeItem()?.type || 'text');
    setEditUI(false);
}

export function pc_getPanelState(panelName) {
    return panelState(panelName);
}

// create item at a grid cell
export function pc_createItemInCell(panelName, kind, cell) {
    const p = panelState(panelName);
    const id = nid();
    const base = {
        id,
        name: kind === 'svg' ? 'SVG' : 'Text',
        grid: { row: cell.row, col: cell.col, rowSpan: 1, colSpan: 1 },
        align: { h: 'center', v: 'middle' },
        transform: { rotate: 0, mirrorX: false, mirrorY: false },
        style: { strokeW: 0.35, opacity: 100 },
        visible: true
    };
    const family = els.fontFamilyDDL?.value || els.font?.value || 'Inter';
    const item = (kind === 'svg')
        ? { ...base, type: 'svg', svg: { content: '', scale: 100, preserveAspect: true, w: undefined, h: undefined, invert: false } }
        : { ...base, type: 'text', text: { value: '', font: family, size: 4, line: 1.2 } };

    p.items.push(item);
    saveState(); // optional; remove if you don’t want auto-persist here
    return id;
}

export function pc_renderAll(svg) { renderAll(svg || getCurrentSvg()); }
export function pc_getStateRef() { return getStateRef(); }
export function pc_deleteItem(panelName, itemId) { deleteItem(panelName, itemId); }
export function pc_save() { saveState(); }
export function pc_bindSvg(svg) {
    setCurrentSvg(svg);
    bindSvgDeselect(svg, clearSelection);
}
