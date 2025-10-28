// js/panel/editor/selection.js
// Selection + tab activation + entering edit mode.

import {
    panelState, saveState, nowPanel, getCurrentSvg, repaint,
    getSelectedItemId, setSelectedItemId,
    getEditItemId, setEditItemId,
    getEditOriginal, setEditOriginal,
    setUiMode, UIMODES, setActiveCell
} from './helpers.js';

export function rebuildItemsList() {
    const list = document.getElementById('pc-items');
    if (!list) return;
    const p = panelState(nowPanel());
    list.innerHTML = '';
    p.items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'pc-item-row';
        row.dataset.id = it.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-link text-truncate';
        btn.textContent = it.name || (it.type === 'text' ? 'Text' : 'SVG');
        btn.onclick = () => {
            setSelectedItemId(it.id);
            document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', {detail: {id: it.id}}));
            repaint(getCurrentSvg());
        };
        row.appendChild(btn);
        list.appendChild(row);
    });
    highlightRows();
}

function highlightRows() {
    const id = getSelectedItemId?.();
    document.querySelectorAll('.pc-item-row').forEach(r => r.classList.toggle('bg-body-tertiary', r.dataset.id === id));
}

export function pc_enterEdit(panelName, itemId) {
    const p = panelState(panelName || nowPanel());
    const it = p.items.find(i => i.id === itemId);
    if (!it) return;

    setSelectedItemId(itemId);
    setEditItemId(itemId);
    setEditOriginal(JSON.parse(JSON.stringify(it)));
    setUiMode(UIMODES.OBJECT);

    pc_activateEditorTab('object');

    document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', {detail: {id: itemId}}));
    document.dispatchEvent(new CustomEvent('pc:enterEditChanged', {detail: {id: itemId}}));

    repaint(getCurrentSvg());
}

export function pc_activateEditorTab(which) {
    const useBS = !!(window.bootstrap && window.bootstrap.Tab);

    // tolerant selector sets
    const sel = (which === 'layout')
        ? {
            btn: '#pc-tabbtn-layout, [data-pc-tab="layout"], [data-bs-target="#pc-tab-layout"], a[href="#pc-tab-layout"]',
            pane: '#pc-tab-layout, #panelContent, .tab-pane[data-pc-pane="layout"]'
        }
        : {
            btn: '#pc-tabbtn-object, [data-pc-tab="object"], [data-bs-target="#pc-tab-object"], a[href="#pc-tab-object"]',
            pane: '#pc-tab-object, #objectEditor, .tab-pane[data-pc-pane="object"]'
        };

    const btnOn = document.querySelector(sel.btn);
    const paneOn = document.querySelector(sel.pane);
    if (!btnOn || !paneOn) return;

    // resolve the opposite tab (for manual toggle fallback)
    const btnOff = document.querySelector(which === 'layout' ?
        '#pc-tabbtn-object, [data-pc-tab="object"]' :
        '#pc-tabbtn-layout, [data-pc-tab="layout"]');
    const paneOff = document.querySelector(which === 'layout' ?
        '#pc-tab-object, .tab-pane[data-pc-pane="object"]' :
        '#pc-tab-layout, .tab-pane[data-pc-pane="layout"]');

    if (useBS) {
        try {
            new window.bootstrap.Tab(btnOn).show();
            return;
        } catch {
        }
    }

    // fallback manual toggle
    btnOn.classList.add('active');
    paneOn.classList.add('show', 'active');
    if (btnOff) btnOff.classList.remove('active');
    if (paneOff) paneOff.classList.remove('show', 'active');

    document.getElementById('pc-sec-editor')?.scrollIntoView({block: 'nearest'});
}

