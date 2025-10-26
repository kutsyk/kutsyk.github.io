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
    // sidebar toggle + remember state
    (function () {
        const root = document.getElementById('appLayout');
        const btn = document.getElementById('btnToggleSidebar');
        if (!root || !btn) return;
        const key = 'ui_sidebar_collapsed';
        const collapsed = localStorage.getItem(key) === '1';
        if (collapsed) root.classList.add('collapsed');
        btn.addEventListener('click', () => {
            root.classList.toggle('collapsed');
            localStorage.setItem(key, root.classList.contains('collapsed') ? '1' : '0');
        });
    })();
    // tooltips
    if (window.bootstrap?.Tooltip) {
        document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
    }
}
