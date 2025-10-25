// public/js/panel-tree.js
// Collapsible tree: Panels → (Grid) Rows → Cells → Items OR (Freeform) Items
// Shows active cell, lets you activate a cell, rename/edit/delete items,
// and drag new Text/SVG from "Add Elements".

import {
    pc_enterEdit,
    pc_deleteItem,
    pc_save, pc_activateEditorTab
} from './panel-content.js';
import { setActiveCell, getActiveCell, setCurrentPanel, getCurrentSvg } from './panel/state.js';
import { PANELS } from './panel/constants.js';
import {pc_getPanelState, pc_renderAll} from "./panel-state-bridge.js";

// ------- DOM -------
const mount = document.getElementById('pc-tree');
if (!mount) throw new Error('#pc-tree not found');

// ------- UI builders -------
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

function makeBranch(summaryNode, bodyUl, open=false) {
    const li = el('li');
    const toggle = el('i', { class: `toggle ${open ? I.caretD : I.caretR}` });
    const wrap = el('span', { class: 'label d-inline-flex align-items-center' });
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

function icon(kind) {
    // minimal text icons to avoid dependencies; replace with <i class="bi ..."> if you use bootstrap-icons
    return el('span', { class: 'pc-tree-ico' }, kind === 'text' ? '𝓣' : '▣');
}

function details(open, summaryText, summaryRight = null) {
    const d = el('details', open ? { open: '' } : {});
    const s = el('summary', { class: 'pc-tree-sum d-flex justify-content-between align-items-center' },
        el('span', { class: 'pc-tree-sum-txt' }, summaryText),
        summaryRight ? el('span', { class: 'pc-tree-sum-rt' }, summaryRight) : ''
    );
    d.appendChild(s);
    return d;
}

function addElementsBar() {
    const bar = el('div', { class: 'pc-tree-add mb-2' },
        el('span', { class: 'me-2 fw-semibold text-secondary' }, 'Add Elements:'),
        el('button', { id: 'pc-drag-text', class: 'btn btn-sm btn-outline-primary pc-drag-el', draggable: 'true' }, 'Text'),
        el('button', { id: 'pc-drag-svg',  class: 'btn btn-sm btn-outline-secondary ms-2 pc-drag-el', draggable: 'true' }, 'SVG')
    );
    // drag data type; panel-interaction.js already hooks ids #pc-drag-text / #pc-drag-svg
    bar.querySelector('#pc-drag-text')?.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', 'text');
    });
    bar.querySelector('#pc-drag-svg')?.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', 'svg');
    });
    return bar;
}

// ------- Tree render -------
function render() {
    mount.innerHTML = '';
    const tree = el('div', { class: 'tree' });
    mount.appendChild(tree);

    const rootUL = el('ul');
    tree.appendChild(rootUL);

    const body = el('ul');
    const header = el('span', { class: 'fw-semibold' }, 'Panel Content');
    const rootLI = makeBranch(header, body, true);
    rootUL.appendChild(rootLI);

    PANELS.forEach((panelName) => {
        const p = pc_getPanelState(panelName);
        const isGrid = (p.layout?.mode || 'grid') === 'grid';
        const total = (p.items || []).length;
        const meta = isGrid
            ? `${p.layout.rows}×${p.layout.cols} · gutter ${p.layout.gutter} · pad ${p.layout.padding}`
            : 'freeform';

        const sum = el('div', { class: 'd-flex align-items-center justify-content-between w-100' },
            el('span', {},
                el('i', { class: I.panel }),
                el('span', { class: 'ms-1 fw-semibold' }, panelName),
                el('span', { class: 'badge text-bg-info ms-2' }, String((p.items || []).length)),
                el('span', { class: 'meta ms-2' }, meta)
            ),
            el('span', { class:'actions' },
                el('button', {
                    class:'btn-action', 'data-bs-toggle':'tooltip', title:'Panel layout',
                    onclick: () => { setCurrentPanel(panelName); import('./panel-content.js').then(m => m.pc_activateEditorTab?.('layout')); }
                }, el('i', { class:'bi bi-columns' })),
                el('button', {
                    class:'btn-action', 'data-bs-toggle':'tooltip', title:'Object edit',
                    onclick: () => { setCurrentPanel(panelName); import('./panel-content.js').then(m => m.pc_activateEditorTab?.('object')); }
                }, el('i', { class:'bi bi-pencil-square' }))
            )
        );

        const panelBody = isGrid ? buildGridPanel(panelName, p) : buildFreePanel(panelName, p);
        const pli = makeBranch(sum, panelBody, panelName === 'Front');
        body.appendChild(pli);
    });
}

function renderGridPanel(container, panelName, p) {
    const ac = getActiveCell();
    const rows = Number(p.layout.rows) || 1;
    const cols = Number(p.layout.cols) || 1;

    for (let r = 1; r <= rows; r++) {
        const rowUL = el('ul');
        const rowLI = makeBranch(el('span', {}, `Row ${r}`), rowUL, false);
        container.appendChild(rowLI);

        for (let c = 1; c <= cols; c++) {
            const isActive = !!ac && ac.panel === panelName && ac.row === r && ac.col === c;

            const itemsInCell = (p.items || []).filter(it => {
                const g = it.grid || {};
                return g.row === r && g.col === c;
            });
            const count = itemsInCell.length;

            const cellHdr = el('div', {},
                el('button', {
                    class: `btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'} me-2`,
                    onclick: () => {
                        setCurrentPanel(panelName);
                        setActiveCell({ panel: panelName, row: r, col: c });
                        refreshPreview();
                        render();
                    }
                }, `r${r}c${c}`),
                el('span', { class: 'text-secondary small me-2' }, 'cell'),
                el('span', { class: 'badge text-bg-light' }, String(count))
            );

            const cd = makeBranch(cellHdr, el('ul'), false);
            rowUL.appendChild(cd);

            if (!itemsInCell.length) {
                cd.lastChild.appendChild(el('li', { class: 'meta' }, '— empty —'));
            } else {
                itemsInCell.forEach((it, idx) => cd.lastChild.appendChild(itemRow(panelName, it, idx)));
            }
        }
    }
}

// replaces/creates: buildGridPanel(panelName, p)
function buildGridPanel(panelName, p) {
    const ac = getActiveCell();
    const rows = Number(p.layout?.rows || 1);
    const cols = Number(p.layout?.cols || 1);

    const rootUL = el('ul');

    for (let r = 1; r <= rows; r++) {
        const rowUL = el('ul');
        const rowLI = makeBranch(el('span', {}, `Row ${r}`), rowUL, false);
        rootUL.appendChild(rowLI);

        for (let c = 1; c <= cols; c++) {
            const isActive = !!ac && ac.panel === panelName && ac.row === r && ac.col === c;

            // items in this cell
            const itemsInCell = (p.items || []).filter(it => {
                const g = it.grid || {};
                return g.row === r && g.col === c;
            });
            const count = itemsInCell.length;

            // header with active badge + counter
            const cellHdr = el('div', {},
                el('button', {
                    class: `btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'} me-2`,
                    onclick: () => {
                        setCurrentPanel(panelName);
                        setActiveCell({ panel: panelName, row: r, col: c });
                        refreshPreview();
                        render();
                    }
                }, `r${r}c${c}`),
                el('span', { class: 'text-secondary small me-2' }, 'cell'),
                el('span', { class: 'badge text-bg-light' }, String(count))
            );

            const cellUL = el('ul');
            const cellLI = makeBranch(cellHdr, cellUL, false);
            rowUL.appendChild(cellLI);

            if (!itemsInCell.length) {
                cellUL.appendChild(el('li', { class: 'meta' }, '— empty —'));
            } else {
                itemsInCell.forEach((it, idx) => cellUL.appendChild(itemRow(panelName, it, idx)));
            }
        }
    }

    return rootUL;
}

// replaces/creates: buildFreePanel(panelName, p)
function buildFreePanel(panelName, p) {
    const rootUL = el('ul');
    const items = p.items || [];
    if (!items.length) {
        rootUL.appendChild(el('li', { class: 'meta' }, '— empty —'));
    } else {
        items.forEach((it, idx) => rootUL.appendChild(itemRow(panelName, it, idx)));
    }
    return rootUL;
}

function itemRow(panelName, it, idx) {
    const kindIcon = el('i', { class: it.type === 'svg' ? I.svg : I.text });
    const displayName = it?.name?.trim() || (it.type === 'svg' ? `SVG #${idx+1}` : `Text #${idx+1}`);
    const meta = it.type === 'text'
        ? ((it.text?.value || '').replace(/\s+/g,' ').trim().slice(0,40) + ((it.text?.value||'').length>40?'…':''))
        : (it.name || '').toString();

    const li = el('li');
    const label = el('span', { class: 'd-inline-flex align-items-center w-100' });
    const left = el('span', { class:'d-inline-flex align-items-center flex-grow-1 text-truncate' },
        kindIcon,
        el('span', { class:'ms-1 text-truncate' }, displayName),
        el('span', { class:'meta ms-2 text-truncate' }, meta)
    );
    const actions = el('span', { class:'actions' },
        el('button', {
            class:'btn-action', 'data-bs-toggle':'tooltip', title:'Edit',
            onclick: () => pc_enterEdit(panelName, it.id)
        }, el('i', { class:'bi bi-pencil' })),
        el('button', {
            class:'btn-action', 'data-bs-toggle':'tooltip', title:'Rename',
            onclick: () => {
                const nn = prompt('Rename item', displayName);
                if (nn && nn.trim()) { it.name = nn.trim(); pc_save(); render(); }
            }
        }, el('i', { class:'bi bi-input-cursor-text' })),
        el('button', {
            class:'btn-action text-danger', 'data-bs-toggle':'tooltip', title:'Delete',
            onclick: () => { pc_deleteItem(panelName, it.id); render(); }
        }, el('i', { class:'bi bi-trash' }))
    );

    label.append(left, actions);
    li.appendChild(label);
    return li;
}

function safeName(it, idx) {
    if (it?.name && it.name.trim()) return it.name.trim();
    // fallbacks by creation order
    return (it.type === 'svg') ? `SVG #${idx + 1}` : `Text #${idx + 1}`;
}
function trimPreview(s, n) {
    const t = (s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// ------- preview refresh -------
function refreshPreview() {
    const svg = getCurrentSvg();
    if (!svg) return;
    pc_renderAll(svg);
    // refresh overlays so the active cell highlight moves
    import('./panel-interaction.js').then(mod => {
        if (typeof mod.pi_onGeometryChanged === 'function') mod.pi_onGeometryChanged(svg);
    }).catch(()=>{});
}

// ------- boot -------
render();
