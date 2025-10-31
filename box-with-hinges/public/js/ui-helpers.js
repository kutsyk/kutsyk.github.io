export function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined) continue;
        if (k === 'class') n.className = v;
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v);
    }
    for (const c of children) n.append(c && typeof c === 'object' ? c : document.createTextNode(String(c)));
    return n;
}

export const I = {
    caretR: 'bi bi-caret-right-fill',
    caretD: 'bi bi-caret-down-fill',
    svg: 'bi bi-filetype-svg',
    text: 'bi bi-type',
    panel: 'bi bi-layout-wtf'
};

export function makeBranch(summaryNode, bodyUl, open = false) {
    const li = el('li');
    const toggle = el('i', {class: `toggle ${open ? I.caretD : I.caretR}`});
    const wrap = el('span', {class: 'label d-inline-flex align-items-center w-100'});
    wrap.appendChild(toggle);
    wrap.appendChild(summaryNode);
    li.appendChild(wrap);
    if (bodyUl) {
        bodyUl.style.display = open ? '' : 'none';
        li.appendChild(bodyUl);
        wrap.addEventListener('click', (e) => {
            e.preventDefault();
            const opened = bodyUl.style.display !== 'none';
            bodyUl.style.display = opened ? 'none' : '';
            toggle.className = `toggle ${opened ? I.caretR : I.caretD}`;
        });
    }
    return li;
}