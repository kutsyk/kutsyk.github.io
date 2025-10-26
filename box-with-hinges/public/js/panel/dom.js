// Centralized DOM lookups for the Panel Content UI
export const els = {
    // panel + layout UI
    panel:        document.getElementById('pc-panel'),
    showGuides:   document.getElementById('pc-show-guides'),
    layoutGrid:   document.getElementById('pc-layout-grid'),
    layoutFree:   document.getElementById('pc-layout-free'),
    gridCtrls:    document.getElementById('pc-grid-controls'),
    freeCtrls:    document.getElementById('pc-free-controls'),
    rows:         document.getElementById('pc-rows'),
    cols:         document.getElementById('pc-cols'),
    gutter:       document.getElementById('pc-gutter'),
    padding:      document.getElementById('pc-padding'),

    // editor header
    type:         document.getElementById('pc-type'),
    name:         document.getElementById('pc-name'),

    // placement (grid)
    row:          document.getElementById('pc-row'),
    col:          document.getElementById('pc-col'),
    rowspan:      document.getElementById('pc-rowspan'),
    colspan:      document.getElementById('pc-colspan'),

    // placement (freeform)
    x:            document.getElementById('pc-x'),
    y:            document.getElementById('pc-y'),
    w:            document.getElementById('pc-w'),
    h:            document.getElementById('pc-h'),

    // alignment
    alignH:       document.getElementById('pc-align-h'),
    alignV:       document.getElementById('pc-align-v'),

    // text props
    textarea:     document.getElementById('pc-textarea'),
    font:         document.getElementById('pc-font'),
    fontFamilyDDL:document.getElementById('pc-font-family'),
    fontSize:     document.getElementById('pc-font-size'),
    line:         document.getElementById('pc-line'),

    // SVG props
    svgSrc:       document.getElementById('pc-svg-src'),
    svgW:         document.getElementById('pc-svg-w'),
    svgH:         document.getElementById('pc-svg-h'),
    scale:        document.getElementById('pc-scale'),
    preserve:     document.getElementById('pc-preserve'),
    invert:       document.getElementById('pc-svg-invert'),

    // transform / style
    rotate:       document.getElementById('pc-rotate'),
    mirrorX:      document.getElementById('pc-mirror-x'),
    mirrorY:      document.getElementById('pc-mirror-y'),
    stroke:       document.getElementById('pc-stroke'),
    opacity:      document.getElementById('pc-opacity'),

    // presets
    presetCards:  document.getElementById('pc-preset-cards'),
    presetTitle:  document.getElementById('pc-preset-title'),
    presetCenter: document.getElementById('pc-preset-center'),

    // export flags
    hideGuides:   document.getElementById('pc-hide-guides'),
    outlineText:  document.getElementById('pc-outline-text'),

    // editor actions
    confirm:      document.getElementById('pc-edit-confirm'),
    cancel:       document.getElementById('pc-edit-cancel'),

    // legacy list
    items:        document.getElementById('pc-items')
};

// UI helpers that need DOM:
export function toggleLayoutGroups() {
    const gridOn = els.layoutGrid?.checked;
    els.gridCtrls?.classList.toggle('d-none', !gridOn);
    els.freeCtrls?.classList.toggle('d-none', gridOn);
    document.getElementById('pc-place-grid')?.classList.toggle('d-none', !gridOn);
    document.getElementById('pc-place-free')?.classList.toggle('d-none', gridOn);
}
export function toggleTypeProps(type) {
    const t = type || els.type?.value || 'text';
    const showText = t === 'text';
    document.getElementById('pc-text-props')?.classList.toggle('d-none', !showText);
    document.getElementById('pc-svg-props')?.classList.toggle('d-none', showText);
}
