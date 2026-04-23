// js/panel-tree.js
// Collapsible tree: Panels → Rows → Cells → Items (grid) or Items (freeform).
// Small icon actions on the right; highlights active cell.

import {
    pc_enterEdit,
    pc_deleteItem,
    pc_save,
    pc_activateEditorTab,
    pc_renderAll // NEW: for live SVG repaint after drop
} from './panel-content.js';
import {setActiveCell, getActiveCell, setCurrentPanel, setSelectedItemId, getSelectedItemId} from './panel/state.js'; // NEW: setSelectedItemId
import {PANELS} from './panel/constants.js';
import {
    pc_getPanelState,
    pc_addItemAtGridCell,   // NEW: create in cell
    pc_setItemSvg,         // NEW: attach SVG content if a file was dropped
    pc_setItemType         // NEW: force item type when needed
} from './panel-state-bridge.js';
import {el, I, makeBranch} from "./ui-helpers.js";

const mount = document.getElementById('pc-tree');
if (!mount) throw new Error('#pc-tree not found');

document.addEventListener('pc:activeCellChanged', () => render());
document.addEventListener('pc:panelChanged', () => render());

// ---------- UI helpers ----------
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

// ---------- DnD helpers (NEW) ----------
function _kindFromDataTransfer(dt, fallback) {
    let k = dt?.getData?.('text/plain') || '';
    if (!k && typeof window !== 'undefined') k = window._lastDragKind || '';
    return /svg/i.test(k) ? 'svg' : 'text';
}
function _hasSvgFile(dt) {
    const files = dt?.files ? [...dt.files] : [];
    return files.some(f => (f.type && /svg/i.test(f.type)) || /\.svg$/i.test(f.name || ''));
}
function _findFirstSvgFile(dt) {
    const files = dt?.files ? [...dt.files] : [];
    return files.find(f => (f.type && /svg/i.test(f.type)) || /\.svg$/i.test(f.name || ''));
}
async function _handleDropToCell({panelName, row, col, dataTransfer}) {
    if (!panelName || !row || !col) return;

    const svg = document.querySelector('#out svg');
    const hasSvg = _hasSvgFile(dataTransfer);
    let kind = _kindFromDataTransfer(dataTransfer);
    if (hasSvg) kind = 'svg';

    const newId = pc_addItemAtGridCell(panelName, kind, { row, col });
    if (kind === 'svg' && newId) pc_setItemType(panelName, newId, 'svg');

    if (hasSvg && newId) {
        const file = _findFirstSvgFile(dataTransfer);
        if (file) {
            try {
                const txt = await file.text();
                pc_setItemSvg(panelName, newId, txt, file.name);
            } catch {}
        }
    }

    setCurrentPanel(panelName);
    setActiveCell({ panel: panelName, row, col });
    if (newId) setSelectedItemId(newId);

    if (svg) pc_renderAll(svg);
    pc_save();

    try {
        const mod = await import('./panel-content.js');
        if (newId && typeof mod.pc_activateEditorTab === 'function') mod.pc_activateEditorTab('object');
        if (newId && typeof mod.pc_enterEdit === 'function') mod.pc_enterEdit(panelName, newId);
    } catch {}
}

// ---------- render ----------
function render() {
    mount.innerHTML = '';
    const tree = el('div', { class: 'tree' });
    mount.appendChild(tree);

    const bar = el('div', { class: 'tree-toolbar d-flex gap-1 mb-2' },
        el('button', { class: 'btn btn-sm btn-outline-secondary', onclick: collapseAll }, 'Collapse all'),
        el('button', { class: 'btn btn-sm btn-outline-secondary', onclick: expandAll }, 'Expand all'),
    );
    tree.appendChild(bar);

    const rootUL = el('ul'); tree.appendChild(rootUL);
    const body = el('ul');
    const header = el('span', { class: 'fw-semibold' }, 'Panel Content');
    const rootLI = makeBranch(header, body, true);
    rootUL.appendChild(rootLI);

    const ac = getActiveCell();
    const selId = getSelectedItemId?.() || null;

    // locate selected item’s panel/row/col
    let selPanel = null, selRow = null, selCol = null;
    if (selId) {
        for (const panelName of PANELS) {
            const p = pc_getPanelState(panelName);
            const hit = (p.items || []).find(it => it.id === selId);
            if (hit) {
                selPanel = panelName;
                if (hit.grid) { selRow = hit.grid.row || null; selCol = hit.grid.col || null; }
                break;
            }
        }
    }

    PANELS.forEach((panelName) => {
        const p = pc_getPanelState(panelName);
        const isGrid = (p.layout?.mode || 'grid') === 'grid';
        const total = (p.items || []).length;

        const sum = el('div', { class: 'd-flex align-items-center justify-content-between w-100' },
            el('span', {},
                el('i', { class: I.panel }),
                el('span', { class: 'ms-1 fw-semibold' }, panelName),
                el('span', { class: 'badge text-bg-info ms-2' }, String(total))
            ),
            el('span', { class: 'actions' },
                el('button', { class: 'btn-action', title: 'Panel layout',
                    onclick: () => { setCurrentPanel(panelName); pc_activateEditorTab('layout'); }
                }, el('i', { class: 'bi bi-columns' })),
                el('button', { class: 'btn-action', title: 'Object edit',
                    onclick: () => { setCurrentPanel(panelName); pc_activateEditorTab('object'); }
                }, el('i', { class: 'bi bi-pencil-square' }))
            )
        );

        const panelBody = isGrid
            ? buildGridPanel(panelName, p, ac, selId, selRow, selCol)
            : buildFreePanel(panelName, p, selId);

        const openPanel =
            (!!ac && ac.panel === panelName) ||
            (selPanel === panelName);

        const pli = makeBranch(sum, panelBody, openPanel);
        body.appendChild(pli);
    });

    // ensure selected item is visible
    if (selId) {
        const node = mount.querySelector(`[data-item-id="${selId}"]`);
        if (node) node.scrollIntoView({ block: 'nearest' });
    }
}

function buildGridPanel(panelName, p, ac, selId, selRow, selCol) {
    const rows = Number(p.layout?.rows || 1);
    const cols = Number(p.layout?.cols || 1);
    const rootUL = el('ul');

    for (let r = 1; r <= rows; r++) {
        const rowUL = el('ul');
        const openRow = (!!ac && ac.panel === panelName && ac.row === r) || (selRow === r);
        const rowLI = makeBranch(el('span', {}, `Row ${r}`), rowUL, openRow);
        rootUL.appendChild(rowLI);

        for (let c = 1; c <= cols; c++) {
            const isActiveCell = !!ac && ac.panel === panelName && ac.row === r && ac.col === c;

            const itemsInCell = (p.items || []).filter(it => (it.grid?.row === r && it.grid?.col === c));
            const count = itemsInCell.length;

            const cellHdr = el('div', {});
            const badge = el('span', {
                class: `badge rounded-pill ${isActiveCell ? 'text-bg-primary active-cell' : 'text-bg-secondary'} badge-cell`,
                dataset: { pcCellBadge: `${panelName}-${r}-${c}` }
            }, `r${r}c${c}`);
            const title = el('span', { class: 'text-secondary small me-2' }, 'cell');
            const cnt = el('span', { class: 'badge text-bg-light' }, String(count));
            cellHdr.append(badge, title, cnt);

            const cellUL = el('ul');
            const cellHasSelection = !!selId && itemsInCell.some(it => it.id === selId);
            const cellLI = makeBranch(cellHdr, cellUL, isActiveCell || cellHasSelection);
            rowUL.appendChild(cellLI);

            cellHdr.addEventListener('click', (e) => {
                e.preventDefault();
                setCurrentPanel(panelName);
                setActiveCell({ panel: panelName, row: r, col: c });
                pc_activateEditorTab('layout');
            });

            if (!itemsInCell.length) {
                cellUL.appendChild(el('li', { class: 'meta' }, '— empty —'));
            } else {
                itemsInCell.forEach((it, idx) => cellUL.appendChild(itemRow(panelName, it, idx, selId)));
            }
        }
    }
    return rootUL;
}

function buildFreePanel(panelName, p, selId) {
    const rootUL = el('ul');
    const items = p.items || [];
    if (!items.length) {
        rootUL.appendChild(el('li', { class: 'meta' }, '— empty —'));
    } else {
        items.forEach((it, idx) => rootUL.appendChild(itemRow(panelName, it, idx, selId)));
    }
    return rootUL;
}

function itemRow(panelName, it, idx, selId) {
    const icon = el('i', { class: it.type === 'svg' ? I.svg : I.text });
    const displayName = it?.name?.trim() || (it.type === 'svg' ? `SVG #${idx + 1}` : `Text #${idx + 1}`);
    const meta = it.type === 'text' ? trimPreview(it.text?.value || '', 40) : (it.name || '').toString();

    const li = el('li', { 'data-item-id': it.id, 'data-panel': panelName });
    if (selId && it.id === selId) li.classList.add('is-active');

    const label = el('span', {
        class: 'd-inline-flex align-items-center w-100',
        onclick: async (e) => {
            e.preventDefault();
            setCurrentPanel(panelName);
            setSelectedItemId(it.id);
            pc_activateEditorTab('object');
            pc_enterEdit(panelName, it.id);
        }
    });

    const left = el('span', { class: 'd-inline-flex align-items-center flex-grow-1 text-truncate' },
        icon,
        el('span', { class: 'ms-1 text-truncate' }, displayName),
        el('span', { class: 'meta ms-2 text-truncate' }, meta)
    );

    const actions = el('span', { class: 'actions' },
        el('button', {
            class: 'btn btn-sm btn-outline-primary ms-2',
            onclick: async () => {
                setCurrentPanel(panelName);
                setSelectedItemId(it.id);
                pc_activateEditorTab('object');
                pc_enterEdit(panelName, it.id);
            }
        }, el('i', { class: 'bi bi-pencil' })),
        el('button', {
            class: 'btn-action', title: 'Rename',
            onclick: () => {
                const nn = prompt('Rename item', displayName);
                if (nn && nn.trim()) { it.name = nn.trim(); pc_save(); render(); }
            }
        }, el('i', { class: 'bi bi-input-cursor-text' })),
        el('button', {
            class: 'btn-action text-danger', title: 'Delete',
            onclick: () => { pc_deleteItem(panelName, it.id); render(); }
        }, el('i', { class: 'bi bi-trash' }))
    );

    label.append(left, actions);
    li.appendChild(label);
    return li;
}

// boot
render();
