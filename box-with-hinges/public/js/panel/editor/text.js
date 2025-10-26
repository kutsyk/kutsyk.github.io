// js/panel/editor/text.js
// Text props: content, font dropdown, size/line.

import {
    panelState, getEditItemId, getSelectedItemId,
    repaint, saveState, getCurrentSvg, getCurrentPanel
} from './helpers.js';
import { listFonts, ensureFontLoaded } from '../fonts.js';

export function bindTextProps(){
    const sel = document.getElementById('pc-font-select');
    if (sel && !sel._pcBound){
        sel._pcBound = true;
        sel.innerHTML = '';
        listFonts().forEach(f => {
            const opt = document.createElement('option'); opt.value=f; opt.textContent=f; sel.appendChild(opt);
        });
        sel.addEventListener('change', async () => {
            const fam = sel.value;
            await ensureFontLoaded(fam);
            const prev = document.getElementById('pc-font-preview');
            if (prev) prev.style.fontFamily = `"${fam}", system-ui, -apple-system, Arial, sans-serif`;

            const p = panelState(getCurrentPanel());
            const id = (getEditItemId?.() || getSelectedItemId?.());
            const it = p.items.find(i => i.id === id);
            if (it && it.type === 'text') {
                it.text = it.text || {};
                it.text.fontFamily = fam;
                saveState(); repaint(getCurrentSvg());
            }
        });
    }

    const txt  = document.getElementById('pc-textarea');
    const size = document.getElementById('pc-font-size');
    const line = document.getElementById('pc-line');

    const syncFromItem = () => {
        const p = panelState(getCurrentPanel());
        const id = (getEditItemId?.() || getSelectedItemId?.());
        const it = p.items.find(i => i.id === id);
        if (!it || it.type !== 'text') return;
        if (txt)  txt.value  = it.text?.value ?? '';
        if (size) size.value = String(it.text?.size ?? 4);
        if (line) line.value = String(it.text?.line ?? 1.2);
        const fam = it.text?.fontFamily || 'Inter';
        if (sel) {
            let opt = [...sel.options].find(o => o.value === fam);
            if (!opt) { const o = document.createElement('option'); o.value=fam; o.textContent=fam; sel.appendChild(o); }
            sel.value = fam;
            ensureFontLoaded(fam).then(() => {
                const prev = document.getElementById('pc-font-preview');
                if (prev) prev.style.fontFamily = `"${fam}", system-ui, -apple-system, Arial, sans-serif`;
            });
        }
    };

    txt?.addEventListener('input', () => {
        const p = panelState(getCurrentPanel());
        const id = (getEditItemId?.() || getSelectedItemId?.());
        const it = p.items.find(i => i.id === id); if (!it || it.type!=='text') return;
        it.text = it.text || {};
        it.text.value = txt.value;
        saveState(); repaint(getCurrentSvg());
    });
    size?.addEventListener('change', () => {
        const p = panelState(getCurrentPanel());
        const id = (getEditItemId?.() || getSelectedItemId?.());
        const it = p.items.find(i => i.id === id); if (!it || it.type!=='text') return;
        it.text = it.text || {};
        it.text.size = Number(size.value)||4;
        saveState(); repaint(getCurrentSvg());
    });
    line?.addEventListener('change', () => {
        const p = panelState(getCurrentPanel());
        const id = (getEditItemId?.() || getSelectedItemId?.());
        const it = p.items.find(i => i.id === id); if (!it || it.type!=='text') return;
        it.text = it.text || {};
        it.text.line = Number(line.value)||1.2;
        saveState(); repaint(getCurrentSvg());
    });

    ['pc:activeCellChanged','pc:itemSelectionChanged','pc:enterEditChanged'].forEach(ev =>
        document.addEventListener(ev, syncFromItem)
    );
    syncFromItem();
}
