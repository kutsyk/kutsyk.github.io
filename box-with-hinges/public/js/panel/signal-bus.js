// Tiny dependency bus to avoid circular imports.
const _bus = {
    enterEdit: null,
    currentPanel: () => 'Front',
    deleteItem: (panel, id) => {}
};

export const bus = {
    setEnterEdit(fn)     { _bus.enterEdit = fn; },
    getEnterEdit()       { return _bus.enterEdit; },
    setCurrentPanelFn(fn){ _bus.currentPanel = fn; },
    getCurrentPanel()    { return _bus.currentPanel(); },
    setDeleteRequest(fn) { _bus.deleteItem = fn; },
    requestDeleteItem(panel, id) { _bus.deleteItem(panel, id); }
};
