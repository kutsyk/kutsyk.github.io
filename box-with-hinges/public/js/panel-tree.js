// public/js/panel-tree.js
// Folder-like management tree: panels as roots, items as children with rename/edit/delete.

import {
    pc_getStateRef,     // state ref
    pc_onGeometryChanged,
    pc_enterEdit,       // (panelName, itemId)
    pc_deleteItem,      // export added below
    pc_save             // export added below
} from './panel-content.js';

const PANELS = ['Bottom','Lid','Front','Back','Left','Right'];
const els = {
    tree: document.getElementById('pc-tree'),
    panelSel: document.getElementById('pc-panel')
};

function h(tag, attrs={}, ...kids) {
    const el = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v);
    }
    for (const k of kids) el.append(k);
    return el;
}

function render() {
    const S = pc_getStateRef();
    const root = els.tree;
    if (!root) return;
    root.innerHTML = '';

    PANELS.forEach(panelName => {
        const p = S.panels[panelName] || { items: [] };
        const isActive = (els.panelSel?.value || 'Front') === panelName;

        const head = h('div', { class: 'node' },
            h('i', { class: 'bi bi-folder2-open text-warning' }),
            h('button', { class:'btn btn-sm btn-link text-start label', onclick:()=>selectPanel(panelName) }, panelName),
            h('span', { class:'badge text-bg-secondary' }, String(p.items.length))
        );

        const children = h('div', { class: 'children' });
        p.items.forEach(it => {
            const row = itemRow(panelName, it);
            children.appendChild(row);
        });

        const group = h('div', { class: 'mb-1' }, head, children);
        if (isActive) head.classList.add('bg-body-tertiary');
        root.appendChild(group);
    });
}

function itemRow(panelName, it) {
    const icon = it.type === 'text' ? 'bi-type' : 'bi-filetype-svg';
    const row = h('div', { class:'node', 'data-id': it.id });

    const iconEl = h('i', { class: `bi ${icon} text-info` });
    const labelBtn = h('button', {
        class: 'btn btn-sm btn-link text-start label',
        onclick: () => pc_enterEdit(panelName, it.id)
    }, it.name || (it.type === 'text' ? 'Text' : 'SVG'));

    const renameBtn = h('button', { class:'btn btn-sm btn-outline-secondary btn-icon', title:'Rename' },
        h('i', { class:'bi bi-pencil' })
    );
    renameBtn.addEventListener('click', () => startRename(panelName, it, row, labelBtn));

    const editBtn = h('button', { class:'btn btn-sm btn-outline-primary btn-icon', title:'Edit' },
        h('i', { class:'bi bi-sliders' })
    );
    editBtn.addEventListener('click', () => pc_enterEdit(panelName, it.id));

    const delBtn = h('button', { class:'btn btn-sm btn-outline-danger btn-icon', title:'Delete' },
        h('i', { class:'bi bi-trash' })
    );
    delBtn.addEventListener('click', () => {
        pc_deleteItem(panelName, it.id);
        pc_save();
        pc_onGeometryChanged(document.querySelector('#out svg'));
        render();
    });

    row.append(iconEl, labelBtn, renameBtn, editBtn, delBtn);
    return row;
}

function startRename(panelName, it, row, labelBtn) {
    const input = h('input', { class:'form-control form-control-sm rename', type:'text', value: it.name || '' });
    const ok = h('button', { class:'btn btn-sm btn-primary btn-icon ms-1' }, h('i', { class:'bi bi-check2' }));
    const cancel = h('button', { class:'btn btn-sm btn-outline-secondary btn-icon ms-1' }, h('i', { class:'bi bi-x-lg' }));

    const slot = h('div', { class:'d-flex align-items-center gap-1 flex-grow-1' }, input, ok, cancel);
    // replace label button with rename slot
    labelBtn.replaceWith(slot);
    input.focus();
    input.select();

    const commit = () => {
        const val = input.value.trim().slice(0, 120);
        it.name = val || it.name || (it.type === 'text' ? 'Text' : 'SVG');
        pc_save();
        render();
    };
    const rollback = () => render();

    ok.addEventListener('click', commit);
    cancel.addEventListener('click', rollback);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') rollback();
    });
}

function selectPanel(panelName) {
    if (els.panelSel) {
        els.panelSel.value = panelName;
        els.panelSel.dispatchEvent(new Event('change', { bubbles:true }));
    }
    render();
}

// initial render + simple observer (re-render when form panel changes)
render();
els.panelSel?.addEventListener('change', render);

// expose rerender for other modules if needed
export function pt_render() { render(); }
