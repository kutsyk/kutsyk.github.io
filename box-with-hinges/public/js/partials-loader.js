// fetch + inject HTML partials before app modules run
export async function loadPartials() {
    const nodes = [...document.querySelectorAll('[data-include]')];
    await Promise.all(nodes.map(async (el) => {
        const url = el.getAttribute('data-include');
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`include failed: ${url}`);
        el.innerHTML = await res.text();
        el.removeAttribute('data-include');
    }));

    // LEFT SIDEBAR: toggle + remember state
    (function () {
        const root = document.getElementById('appLayout');
        const btnSidebar = document.getElementById('btnToggleSidebar');
        if (!root || !btnSidebar) return; // fix bug: was `btn`
        const key = 'ui_sidebar_collapsed';
        const collapsed = localStorage.getItem(key) === '1';
        if (collapsed) root.classList.add('collapsed');
        btnSidebar.addEventListener('click', () => {
            root.classList.toggle('collapsed');
            localStorage.setItem(key, root.classList.contains('collapsed') ? '1' : '0');
        });
    })();

    // RIGHT EDITORBAR: toggle + remember state (works for both navbar and panel buttons)
    (function () {
        const key = 'ui_editor_open';
        if (localStorage.getItem(key) === '1') {
            document.body.classList.add('editor-open');
        }

        const toggle = () => {
            document.body.classList.toggle('editor-open');
            localStorage.setItem(key, document.body.classList.contains('editor-open') ? '1' : '0');
        };

        // delegate to handle buttons present in injected partials
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#btnToggleEditorNavbar, #btnToggleEditor');
            if (btn) toggle();
        });
    })();

    // tooltips
    if (window.bootstrap?.Tooltip) {
        document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
    }
}
