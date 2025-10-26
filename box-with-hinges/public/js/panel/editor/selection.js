// js/panel/editor/selection.js
// Selection + tab activation + entering edit mode.

import {
    panelState, saveState, nowPanel, getCurrentSvg, repaint,
    getSelectedItemId, setSelectedItemId,
    getEditItemId, setEditItemId,
    getEditOriginal, setEditOriginal,
    setUiMode, UIMODES
} from './helpers.js';

export function rebuildItemsList(){
    const list = document.getElementById('pc-items');
    if (!list) return;
    const p = panelState(nowPanel());
    list.innerHTML = '';
    p.items.forEach(it => {
        const row = document.createElement('div'); row.className='pc-item-row'; row.dataset.id=it.id;
        const btn = document.createElement('button'); btn.type='button'; btn.className='btn btn-sm btn-link text-truncate'; btn.textContent = it.name || (it.type==='text'?'Text':'SVG');
        btn.onclick = () => {
            setSelectedItemId(it.id);
            document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail:{ id: it.id } }));
            repaint(getCurrentSvg());
        };
        row.appendChild(btn); list.appendChild(row);
    });
    highlightRows();
}

function highlightRows(){
    const id = getSelectedItemId?.();
    document.querySelectorAll('.pc-item-row').forEach(r => r.classList.toggle('bg-body-tertiary', r.dataset.id === id));
}

export function pc_enterEdit(panelName, itemId){
    const p = panelState(panelName || nowPanel());
    const it = p.items.find(i => i.id === itemId); if (!it) return;

    setSelectedItemId(itemId);
    setEditItemId(itemId);
    setEditOriginal(JSON.parse(JSON.stringify(it)));
    setUiMode(UIMODES.OBJECT);

    pc_activateEditorTab('object');

    document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail:{ id: itemId } }));
    document.dispatchEvent(new CustomEvent('pc:enterEditChanged', { detail:{ id: itemId } }));

    repaint(getCurrentSvg());
}

export function pc_activateEditorTab(which){
    const btnLayout = document.getElementById('pc-tabbtn-layout');
    const btnObject = document.getElementById('pc-tabbtn-object');
    const paneLayout = document.getElementById('pc-tab-layout');
    const paneObject = document.getElementById('pc-tab-object');
    const useBS = !!window.bootstrap;

    const activate = (btnOn, paneOn, btnOff, paneOff) => {
        if (useBS && window.bootstrap.Tab) { try { new window.bootstrap.Tab(btnOn).show(); } catch{} }
        else {
            btnOn.classList.add('active'); paneOn.classList.add('show','active');
            btnOff.classList.remove('active'); paneOff.classList.remove('show','active');
        }
        document.getElementById('pc-sec-editor')?.scrollIntoView({block:'nearest'});
    };

    if (which === 'layout') activate(btnLayout, paneLayout, btnObject, paneObject);
    else                   activate(btnObject, paneObject, btnLayout, paneLayout);
}
