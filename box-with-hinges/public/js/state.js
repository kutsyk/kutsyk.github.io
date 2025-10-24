export const state = {
    units: 'mm',            // 'mm' | 'cm' | 'in' (for grid/rulers/readouts)
    gridEnabled: true,
    gridMinorStep: 5,       // in current units (1, 5, 10, …)
    axesEnabled: true,
    snapEnabled: false,

    // viewBox (mm) – managed by viewport.js
    vb: { x: 0, y: 0, w: 0, h: 0 },
    vbInit: null,

    // DOM refs (set in main.js)
    els: { form: null, out: null, status: null, download: null },

    // last SVG content from server
    lastSvgText: ''
};
