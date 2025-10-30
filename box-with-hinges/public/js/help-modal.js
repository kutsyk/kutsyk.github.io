// help-modal.js
(function bindHelpOnce(){
  if (document._pcHelpBound) return;
  document._pcHelpBound = true;

  // keyboard shortcut: '?' (Shift+/)
  document.addEventListener('keydown', (e) => {
    if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const btn = document.getElementById('btnHelp');
      if (btn) btn.click();
    }
  });

  // focus header when shown
  document.addEventListener('shown.bs.modal', (ev) => {
    if (ev.target && ev.target.id === 'helpModal') {
      const h = ev.target.querySelector('.modal-title');
      if (h) h.focus?.();
    }
  });
})();
