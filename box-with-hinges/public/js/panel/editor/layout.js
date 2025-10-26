// js/panel/editor/layout.js
// Sync Panel Layout form with the truly active panel. Render row/col % chips.
// Match IDs in sidebar.html exactly (pc-panel, pc-row-chips, pc-col-chips, …).

import {
    panelState,
    getCurrentPanel,
    setCurrentPanel,
    getActiveCell,
    repaint,
    getCurrentSvg,
    nowPanel
} from './helpers.js';

import {
    pc_setRowPercents,
    pc_setColPercents,
    pc_resizeRowCount,
    pc_resizeColCount,
} from '../../panel-state-bridge.js';
import {pc_getLayout, pc_rebalancePercents} from "../state.js";

const fmt = (n) => Math.round((Number(n) || 0) * 10) / 10;

export function bindLayoutForm() {
    // DOM
    const panelSel  = byId('pc-panel');            // <select> with Bottom/Lid/Front/…
    const rowsInp   = byId('pc-rows');
    const colsInp   = byId('pc-cols');
    const gutterInp = byId('pc-gutter');
    const padInp    = byId('pc-padding');

    const presetSel = byId('pc-layout-preset');
    const presetBtn = byId('pc-apply-preset');

    const rowChips  = byId('pc-row-chips');
    const colChips  = byId('pc-col-chips');

    // Modals
    const rowsBody  = byId('pcm-rows-body');
    const colsBody  = byId('pcm-cols-body');
    const rowsSum   = byId('pcm-rows-sum');
    const colsSum   = byId('pcm-cols-sum');
    const rowsSave  = byId('pcm-rows-save');
    const colsSave  = byId('pcm-cols-save');
    const rowsBal   = byId('pcm-rows-balance');
    const colsBal   = byId('pcm-cols-balance');

    // ---- wiring

    // change panel from dropdown
    panelSel?.addEventListener('change', () => {
        const name = panelSel.value;
        setCurrentPanel(name);
        dispatchPanelChanged(name);
        syncForm(name);
    });

    // live commit numeric inputs
    [rowsInp, colsInp, gutterInp, padInp].forEach(el => el?.addEventListener('input', commitLayoutFromInputs));

    // preset handling
    presetSel?.addEventListener('change', () => {
        const on = !!presetSel.value;
        if (presetBtn) {
            presetBtn.disabled = !on;
            presetBtn.classList.toggle('btn-warning', on);
            presetBtn.classList.toggle('btn-outline-secondary', !on);
        }
    });

    presetBtn?.addEventListener('click', () => {
        const name = activeName();
        const maker = PRESETS[presetSel.value];
        if (!maker) return;
        const p = panelState(name);
        const L = maker(p);

        p.layout = p.layout || {};
        p.layout.mode = 'grid';
        p.layout.rows = L.rows;
        p.layout.cols = L.cols;
        p.layout.gutter = L.gutter;
        p.layout.padding = L.padding;

        // reset per-cell overrides and percentages to sane shape
        if (p.cells) p.cells = {};
        pc_resizeRowCount(name, L.rows);
        pc_resizeColCount(name, L.cols);
        pc_rebalancePercents(name);

        repaint(getCurrentSvg());
        presetBtn.disabled = true;
        presetBtn.classList.remove('btn-warning');
        presetBtn.classList.add('btn-outline-secondary');
        syncForm(name);
    });

    // modal: open rows editor
    byId('pc-edit-row-sizes')?.addEventListener('click', () => {
        const { rowPercents, rows } = pc_getLayout(activeName());
        fillPercModal(rowsBody, rowsSum, rowPercents ?? eq(rows));
    });

    // modal: open cols editor
    byId('pc-edit-col-sizes')?.addEventListener('click', () => {
        const { colPercents, cols } = pc_getLayout(activeName());
        fillPercModal(colsBody, colsSum, colPercents ?? eq(cols));
    });

    // modal: balance buttons
    rowsBal?.addEventListener('click', () => {
        const n = Number(rowsInp?.value || 1);
        fillPercModal(rowsBody, rowsSum, eq(n));
    });
    colsBal?.addEventListener('click', () => {
        const n = Number(colsInp?.value || 1);
        fillPercModal(colsBody, colsSum, eq(n));
    });

    // modal: save buttons
    rowsSave?.addEventListener('click', () => {
        const name = activeName();
        const vals = readPercModal(rowsBody);
        pc_setRowPercents(name, vals);
        pc_rebalancePercents(name);
        repaint(getCurrentSvg());
        syncChips(name);
    });
    colsSave?.addEventListener('click', () => {
        const name = activeName();
        const vals = readPercModal(colsBody);
        pc_setColPercents(name, vals);
        pc_rebalancePercents(name);
        repaint(getCurrentSvg());
        syncChips(name);
    });

    // keep layout form synced to currently active panel no matter how it’s selected
    document.addEventListener('pc:panelChanged', (e) => {
        const name = e?.detail?.name || activeName();
        syncForm(name);
    });
    document.addEventListener('pc:activeCellChanged', (e) => {
        const name = e?.detail?.panel || getActiveCell()?.panel;
        if (name) {
            if (panelSel && panelSel.value !== name) panelSel.value = name;
            syncForm(name);
        }
    });
    document.addEventListener('pc:stateRestored', () => syncForm(activeName()));

    // initial
    syncForm(activeName());

    // ---- helpers

    function activeName() {
        return getCurrentPanel() || nowPanel();
    }

    function commitLayoutFromInputs() {
        const name = activeName();
        const p = panelState(name);
        p.layout = p.layout || { mode: 'grid' };
        p.layout.rows    = Math.max(1, Number(rowsInp?.value   || 1));
        p.layout.cols    = Math.max(1, Number(colsInp?.value   || 1));
        p.layout.gutter  = Math.max(0, Number(gutterInp?.value || 0));
        p.layout.padding = Math.max(0, Number(padInp?.value    || 0));

        // keep percentages arrays in the correct length and normalized
        pc_resizeRowCount(name, p.layout.rows);
        pc_resizeColCount(name, p.layout.cols);
        pc_rebalancePercents(name);

        repaint(getCurrentSvg());
        syncChips(name);
    }

    function syncForm(name) {
        // select field
        if (panelSel && panelSel.value !== name) panelSel.value = name;

        // numeric fields
        const p = panelState(name);
        const L = p.layout || { rows: 1, cols: 1, gutter: 0, padding: 0 };
        if (rowsInp)   rowsInp.value   = String(Math.max(1, Number(L.rows)    || 1));
        if (colsInp)   colsInp.value   = String(Math.max(1, Number(L.cols)    || 1));
        if (gutterInp) gutterInp.value = String(Math.max(0, Number(L.gutter)  || 0));
        if (padInp)    padInp.value    = String(Math.max(0, Number(L.padding) || 0));

        // chips
        syncChips(name);
    }

    function syncChips(name) {
        const L = pc_getLayout(name);
        const rp = Array.isArray(L.rowPercents) ? L.rowPercents : eq(L.rows || 1);
        const cp = Array.isArray(L.colPercents) ? L.colPercents : eq(L.cols || 1);
        renderChips(rowChips, rp);
        renderChips(colChips, cp);
    }
}

// ----- UI helpers -----

const PRESETS = {
    'center-1x1': (p) => ({ rows: 1, cols: 1, gutter: 2, padding: Math.max(2, p?.layout?.padding ?? 4) }),
    'rows-2':     (p) => ({ rows: 2, cols: 1, gutter: 2, padding: p?.layout?.padding ?? 4 }),
    'cols-2':     (p) => ({ rows: 1, cols: 2, gutter: 2, padding: p?.layout?.padding ?? 4 }),
    'grid-2x2':   (p) => ({ rows: 2, cols: 2, gutter: 2, padding: p?.layout?.padding ?? 4 }),
    'grid-3x3':   (p) => ({ rows: 3, cols: 3, gutter: 2, padding: p?.layout?.padding ?? 4 }),
    'header-1-2': (p) => ({ rows: 2, cols: 1, gutter: 2, padding: p?.layout?.padding ?? 4 }),
    'sidebar-1-2':(p) => ({ rows: 1, cols: 2, gutter: 2, padding: p?.layout?.padding ?? 4 }),
};

function renderChips(host, arr) {
    if (!host) return;
    host.innerHTML = '';
    arr.forEach((n, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = `${fmt(n)}%`;
        chip.title = `#${i + 1}`;
        host.appendChild(chip);
    });
}

function fillPercModal(container, sumLabel, values) {
    if (!container) return;
    container.innerHTML = '';
    values.forEach((v, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'mb-1';
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.min  = '0';
        input.className = 'form-control form-control-sm';
        input.value = String(fmt(v));
        input.dataset.index = String(i);
        input.addEventListener('input', () => updateSum(sumLabel, container));
        wrap.appendChild(input);
        container.appendChild(wrap);
    });
    updateSum(sumLabel, container);
}

function readPercModal(container) {
    if (!container) return [];
    return [...container.querySelectorAll('input')].map(i => Number(i.value) || 0);
}

function updateSum(label, container) {
    if (!label || !container) return;
    const total = readPercModal(container).reduce((a, b) => a + b, 0);
    label.textContent = `sum: ${fmt(total)}%`;
}

function eq(n) {
    const count = Math.max(1, Number(n) || 1);
    const val = 100 / count;
    return Array.from({ length: count }, () => fmt(val));
}

function byId(id) { return document.getElementById(id); }

function dispatchPanelChanged(name) {
    document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: { name } }));
}

function mkNumberInput(v, idx){
    const div = document.createElement('div'); div.className='mb-1';
    const input=document.createElement('input'); input.type='number'; input.step='0.1'; input.min='0'; input.className='form-control form-control-sm'; input.value=String(Math.round(v*10)/10); input.dataset.index=String(idx);
    div.appendChild(input); return {div,input};
}

function sumTo(el, bodySel){
    const total = [...document.querySelectorAll(`${bodySel} input`)].map(i=>Number(i.value)||0).reduce((a,b)=>a+b,0);
    el.textContent = `sum: ${Math.round(total*10)/10}%`;
}

export function bindSizeModals(){
    const rowsBody = document.getElementById('pcm-rows-body');
    const colsBody = document.getElementById('pcm-cols-body');
    const rowsSum  = document.getElementById('pcm-rows-sum');
    const colsSum  = document.getElementById('pcm-cols-sum');

    document.getElementById('pc-edit-row-sizes')?.addEventListener('click', () => {
        const L = pc_getLayout(nowPanel()); rowsBody.innerHTML='';
        L.rowPercents.forEach((p,i)=>{ const {div,input}=mkNumberInput(p,i); input.addEventListener('input',()=>sumTo(rowsSum,'#pcm-rows-body')); rowsBody.appendChild(div); });
        sumTo(rowsSum,'#pcm-rows-body');
    });
    document.getElementById('pc-edit-col-sizes')?.addEventListener('click', () => {
        const L = pc_getLayout(nowPanel()); colsBody.innerHTML='';
        L.colPercents.forEach((p,i)=>{ const {div,input}=mkNumberInput(p,i); input.addEventListener('input',()=>sumTo(colsSum,'#pcm-cols-body')); colsBody.appendChild(div); });
        sumTo(colsSum,'#pcm-cols-body');
    });

    document.getElementById('pcm-rows-save')?.addEventListener('click', () => {
        const vals = [...rowsBody.querySelectorAll('input')].map(i => Number(i.value)||0);
        pc_setRowPercents(nowPanel(), vals); repaint(getCurrentSvg());
    });
    document.getElementById('pcm-cols-save')?.addEventListener('click', () => {
        const vals = [...colsBody.querySelectorAll('input')].map(i => Number(i.value)||0);
        pc_setColPercents(nowPanel(), vals); repaint(getCurrentSvg());
    });

    document.getElementById('pc-rows')?.addEventListener('change', (e) => {
        pc_resizeRowCount(nowPanel(), Number(e.currentTarget.value||1));
        pc_rebalancePercents(nowPanel());
        repaint(getCurrentSvg());
    });
    document.getElementById('pc-cols')?.addEventListener('change', (e) => {
        pc_resizeColCount(nowPanel(), Number(e.currentTarget.value||1));
        pc_rebalancePercents(nowPanel());
        repaint(getCurrentSvg());
    });
}