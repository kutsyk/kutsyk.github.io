import { UI_ATTR } from './constants.js';
import { els } from './dom.js';

export function pc_beforeDownload(svgRootClone) {
    if (els.hideGuides?.checked) {
        svgRootClone.querySelectorAll('[data-pc-guide="1"]').forEach(n => n.remove());
    }
    svgRootClone.querySelectorAll(`[${UI_ATTR}]`).forEach(n => n.remove());
    // Outline-to-path not implemented.
}
