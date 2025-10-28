// ui-leftnav.js
export function pc_leftnav_activate(which /* 'params' | 'content' */ = 'content') {
    // un-collapse sidebar if your layout uses this flag
    const layout = document.getElementById('appLayout');
    if (layout) layout.classList.remove('collapsed');

    const useBS = !!(window.bootstrap && window.bootstrap.Tab);

    const sel = (which === 'content')
        ? {
            btn: '#content-tab, [data-bs-target="#content"], a[href="#content"]',
            pane: '#content, .tab-pane[id="content"]'
        }
        : {
            btn: '#params-tab, [data-bs-target="#params"], a[href="#params"]',
            pane: '#params, .tab-pane[id="params"]'
        };

    const btnOn  = document.querySelector(sel.btn);
    const paneOn = document.querySelector(sel.pane);
    if (!btnOn || !paneOn) return;

    const btnOff  = document.querySelector(which === 'content'
        ? '#params-tab, [data-bs-target="#params"], a[href="#params"]'
        : '#content-tab, [data-bs-target="#content"], a[href="#content"]');

    const paneOff = document.querySelector(which === 'content'
        ? '#params, .tab-pane[id="params"]'
        : '#content, .tab-pane[id="content"]');

    if (useBS) { try { new window.bootstrap.Tab(btnOn).show(); return; } catch {} }

    // manual toggle fallback
    btnOn.classList.add('active');
    paneOn.classList.add('show','active');
    if (btnOff)  btnOff.classList.remove('active');
    if (paneOff) paneOff.classList.remove('show','active');

    // ensure sidebar scrolls to the tab content
    paneOn.scrollIntoView({ block: 'nearest' });
}
