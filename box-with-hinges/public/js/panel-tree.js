// js/panel-tree.js
// Collapsible tree: Panels → Rows → Cells → Items (grid) or Items (freeform).
// Small icon actions on the right; highlights active cell.

import {
    pc_enterEdit,
    pc_deleteItem,
    pc_save,
    pc_activateEditorTab
} from './panel-content.js';
import {setActiveCell, getActiveCell, setCurrentPanel} from './panel/state.js';
import {PANELS} from './panel/constants.js';
import {pc_getPanelState} from './panel-state-bridge.js';

const mount = document.getElementById('pc-tree');
if (!mount) throw new Error('#pc-tree not found');

document.addEventListener('pc:activeCellChanged', () => render());
document.addEventListener('pc:panelChanged', () => render());

// ---------- UI helpers ----------
function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined) continue;
        if (k === 'class') n.className = v;
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v);
    }
    for (const c of children) n.append(c && typeof c === 'object' ? c : document.createTextNode(String(c)));
    return n;
}

const I = {
    caretR: 'bi bi-caret-right-fill',
    caretD: 'bi bi-caret-down-fill',
    svg: 'bi bi-filetype-svg',
    text: 'bi bi-type',
    panel: 'bi bi-layout-wtf'
};

function makeBranch(summaryNode, bodyUl, open = false) {
    const li = el('li');
    const toggle = el('i', {class: `toggle ${open ? I.caretD : I.caretR}`});
    const wrap = el('span', {class: 'label d-inline-flex align-items-center w-100'});
    wrap.appendChild(toggle);
    wrap.appendChild(summaryNode);
    li.appendChild(wrap);
    if (bodyUl) {
        bodyUl.style.display = open ? '' : 'none';
        li.appendChild(bodyUl);
        wrap.addEventListener('click', (e) => {
            e.preventDefault();
            const opened = bodyUl.style.display !== 'none';
            bodyUl.style.display = opened ? 'none' : '';
            toggle.className = `toggle ${opened ? I.caretR : I.caretD}`;
        });
    }
    return li;
}

function trimPreview(s, n) {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function setBranchOpen(li, open) {
    const body = li.querySelector(':scope > ul');
    const toggle = li.querySelector(':scope > .label .toggle');
    if (!body || !toggle) return;
    body.style.display = open ? '' : 'none';
    toggle.className = `toggle ${open ? 'bi bi-caret-down-fill' : 'bi bi-caret-right-fill'}`;
}
function expandAll() {
    document.querySelectorAll('#pc-tree .tree > ul > li').forEach(li => setBranchOpen(li, true));        // root
    document.querySelectorAll('#pc-tree .tree li').forEach(li => setBranchOpen(li, true));               // all
}
function collapseAll() {
    document.querySelectorAll('#pc-tree .tree li').forEach(li => setBranchOpen(li, false));
}

// ---------- render ----------
function render() {
    mount.innerHTML = '';
    const tree = el('div', { class: 'tree' });
    mount.appendChild(tree);

    // toolbar
    const bar = el('div', { class: 'tree-toolbar d-flex gap-1 mb-2' },
        el('button', { class: 'btn btn-sm btn-outline-secondary', onclick: collapseAll }, 'Collapse all'),
        el('button', { class: 'btn btn-sm btn-outline-secondary', onclick: expandAll }, 'Expand all'),
    );
    tree.appendChild(bar);

    const rootUL = el('ul');
    tree.appendChild(rootUL);

    const body = el('ul');
    const header = el('span', { class: 'fw-semibold' }, 'Panel Content');
    const rootLI = makeBranch(header, body, true);
    rootUL.appendChild(rootLI);

    const ac = getActiveCell();
    PANELS.forEach((panelName) => {
        const p = pc_getPanelState(panelName);
        const isGrid = (p.layout?.mode || 'grid') === 'grid';
        const total = (p.items || []).length;

        // summary WITHOUT layout/gutter/padding meta
        const sum = el('div', { class: 'd-flex align-items-center justify-content-between w-100' },
            el('span', {},
                el('i', { class: I.panel }),
                el('span', { class: 'ms-1 fw-semibold' }, panelName),
                el('span', { class: 'badge text-bg-info ms-2' }, String(total))
            ),
            el('span', { class: 'actions' },
                el('button', {
                    class: 'btn-action', title: 'Panel layout',
                    onclick: () => { setCurrentPanel(panelName); pc_activateEditorTab('layout'); }
                }, el('i', { class: 'bi bi-columns' })),
                el('button', {
                    class: 'btn-action', title: 'Object edit',
                    onclick: () => { setCurrentPanel(panelName); pc_activateEditorTab('object'); }
                }, el('i', { class: 'bi bi-pencil-square' }))
            )
        );

        const panelBody = isGrid ? buildGridPanel(panelName, p, ac) : buildFreePanel(panelName, p);
        const openPanel = !!ac && ac.panel === panelName;
        const pli = makeBranch(sum, panelBody, openPanel);
        body.appendChild(pli);
    });
}


function buildGridPanel(panelName, p, ac) {
    const rows = Number(p.layout?.rows || 1);
    const cols = Number(p.layout?.cols || 1);
    const rootUL = el('ul');

    for (let r = 1; r <= rows; r++) {
        const rowUL = el('ul');
        const openRow = !!ac && ac.panel === panelName && ac.row === r;
        const rowLI = makeBranch(el('span', {}, `Row ${r}`), rowUL, openRow);
        rootUL.appendChild(rowLI);

        for (let c = 1; c <= cols; c++) {
            const isActive = !!ac && ac.panel === panelName && ac.row === r && ac.col === c;

            const itemsInCell = (p.items || []).filter(it => {
                const g = it.grid || {};
                return g.row === r && g.col === c;
            });
            const count = itemsInCell.length;

            const cellHdr = el('div', {});
            const badge = el('span', {
                class: `badge rounded-pill ${isActive ? 'text-bg-primary active-cell' : 'text-bg-secondary'} badge-cell`,
                dataset: {pcCellBadge: `${panelName}-${r}-${c}`}
            }, `r${r}c${c}`);
            const title = el('span', {class: 'text-secondary small me-2'}, 'cell');
            const cnt = el('span', {class: 'badge text-bg-light'}, String(count));
            cellHdr.append(badge, title, cnt);

            const cellUL = el('ul');
            const cellLI = makeBranch(cellHdr, cellUL, isActive);
            rowUL.appendChild(cellLI);

            cellHdr.addEventListener('click', (e) => {
                e.preventDefault();
                setCurrentPanel(panelName);
                setActiveCell({panel: panelName, row: r, col: c});
            });

            if (!itemsInCell.length) {
                cellUL.appendChild(el('li', {class: 'meta'}, '— empty —'));
            } else {
                itemsInCell.forEach((it, idx) => cellUL.appendChild(itemRow(panelName, it, idx)));
            }
        }
    }
    return rootUL;
}

function buildFreePanel(panelName, p) {
    const rootUL = el('ul');
    const items = p.items || [];
    if (!items.length) {
        rootUL.appendChild(el('li', {class: 'meta'}, '— empty —'));
    } else {
        items.forEach((it, idx) => rootUL.appendChild(itemRow(panelName, it, idx)));
    }
    return rootUL;
}

function itemRow(panelName, it, idx) {
    const icon = el('i', {class: it.type === 'svg' ? I.svg : I.text});
    const displayName = it?.name?.trim() || (it.type === 'svg' ? `SVG #${idx + 1}` : `Text #${idx + 1}`);
    const meta = it.type === 'text' ? trimPreview(it.text?.value || '', 40) : (it.name || '').toString();

    const li = el('li');
    const label = el('span', {class: 'd-inline-flex align-items-center w-100'});
    const left = el('span', {class: 'd-inline-flex align-items-center flex-grow-1 text-truncate'},
        icon,
        el('span', {class: 'ms-1 text-truncate'}, displayName),
        el('span', {class: 'meta ms-2 text-truncate'}, meta)
    );
    const actions = el('span', {class: 'actions'},
        el('button', {
            class: 'btn btn-sm btn-outline-primary ms-2',
            onclick: async () => {
                pc_enterEdit(panelName, it.id);
                const mod = await import('./panel/edit.js');
                if (typeof mod.edit_openTab === 'function') mod.edit_openTab('object');
                if (typeof mod.edit_focusPrimary === 'function') mod.edit_focusPrimary(); // optional focus
            }
        }, el('i', { class:'bi bi-pencil' })),
        el('button', {
            class: 'btn-action', title: 'Rename',
            onclick: () => {
                const nn = prompt('Rename item', displayName);
                if (nn && nn.trim()) {
                    it.name = nn.trim();
                    pc_save();
                    render();
                }
            }
        }, el('i', {class: 'bi bi-input-cursor-text'})),
        el('button', {
            class: 'btn-action text-danger', title: 'Delete', onclick: () => {
                pc_deleteItem(panelName, it.id);
                render();
            }
        }, el('i', {class: 'bi bi-trash'}))
    );

    label.append(left, actions);
    li.appendChild(label);
    return li;
}

// boot
render();
