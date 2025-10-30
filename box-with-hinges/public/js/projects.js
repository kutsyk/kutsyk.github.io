// js/projects.js
// LocalStorage-backed “Projects” with Preview vs Edit modes.
// Clean defaults on New. Single apply-to-UI path. Slim tree rendering.

import { pc_getStateRef } from './panel-content.js';
import { pc_renderAll } from './panel-state-bridge.js';
import { pi_onGeometryChanged } from './panel-interaction.js';
import { setActiveCell, setSelectedItemId, setCurrentPanel } from './panel/state.js';

// -------------------- storage keys --------------------
const LS_KEY            = 'pc_projects_v1';
const LS_ACTIVE_PREVIEW = 'pc_projects_preview_id';
const LS_ACTIVE_EDIT    = 'pc_projects_edit_id';
const LS_OPEN           = 'pc_projects_open_v1';

// -------------------- storage helpers -----------------
function _loadStore() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function _saveStore(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
}
function _loadOpen() {
    try { return JSON.parse(localStorage.getItem(LS_OPEN) || '{}'); } catch { return {}; }
}
function _saveOpen(m) {
    localStorage.setItem(LS_OPEN, JSON.stringify(m));
}

export function getPreviewProjectId() { return localStorage.getItem(LS_ACTIVE_PREVIEW) || null; }
function _getPreviewId() { return localStorage.getItem(LS_ACTIVE_PREVIEW) || null; }
function _setPreviewId(id) { if (id) localStorage.setItem(LS_ACTIVE_PREVIEW, id); else localStorage.removeItem(LS_ACTIVE_PREVIEW); }
export function getEditProjectId() { return localStorage.getItem(LS_ACTIVE_EDIT) || null; }
function _getEditId() { return localStorage.getItem(LS_ACTIVE_EDIT) || null; }
function _setEditId(id) { if (id) localStorage.setItem(LS_ACTIVE_EDIT, id); else localStorage.removeItem(LS_ACTIVE_EDIT); }

// -------------------- defaults ------------------------
function _defaultParams() {
    return {
        width: 80,
        depth: 50,
        height: 40,
        tabWidth: 10,
        thickness: 3,
        kerf: 0.12,
        margin: 12,
        addRightHole: true
    };
}
function _defaultState() {
    return {
        panels: {},                    // no items by default
        _ui: { activePanel: 'Front', selectedItemId: null, editItemId: null }
    };
}

// -------------------- utils ---------------------------
function _emitActiveChanged() {
    document.dispatchEvent(new CustomEvent('projects:activeChanged'));
}

function _applyParamsToForm(p){
    const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value=String(v); };
    set('width',p.width); set('widthNum',p.width);
    set('depth',p.depth); set('depthNum',p.depth);
    set('height',p.height); set('heightNum',p.height);
    set('tabWidth',p.tabWidth); set('tabWidthNum',p.tabWidth);
    document.querySelector('input[name="thickness"]')?.setAttribute('value', p.thickness);
    document.querySelector('input[name="kerf"]')?.setAttribute('value', p.kerf);
    document.querySelector('input[name="margin"]')?.setAttribute('value', p.margin);
    const chk = document.getElementById('addRightHole'); if (chk) chk.checked = !!p.addRightHole;
}


export async function app_regenerate(params) {
    // optional params → drive form, then call the same code your submit handler uses
    if (params) {
        const set = (id, val) => { const el = document.getElementById(id); if (!el) return;
            el.value = String(val); el.dispatchEvent(new Event('input', {bubbles:true}));
            el.dispatchEvent(new Event('change', {bubbles:true}));
        };
        const pair = (r, n, v) => { set(r, v); set(n, v); };
        pair('width', 'widthNum', params.width);
        pair('depth', 'depthNum', params.depth);
        pair('height', 'heightNum', params.height);
        pair('tabWidth', 'tabWidthNum', params.tabWidth);
        document.querySelector('input[name="thickness"]').value = String(params.thickness);
        document.querySelector('input[name="kerf"]').value = String(params.kerf);
        document.querySelector('input[name="margin"]').value = String(params.margin);
        const chk = document.getElementById('addRightHole');
        if (chk) chk.checked = !!params.addRightHole;
    }

    // call your existing generate function directly; do NOT rely on clicking a button
    // assume you have a function generate() already; if it’s nested, export it
    if (typeof generate === 'function') await generate(); // must produce #out svg
}

export function app_waitForSvg() {
    return new Promise(resolve => {
        const now = document.querySelector('#out svg');
        if (now) return resolve(now);
        const obs = new MutationObserver(() => {
            const svg = document.querySelector('#out svg');
            if (svg) { obs.disconnect(); resolve(svg); }
        });
        obs.observe(document.getElementById('out') || document.body, { childList: true, subtree: true });
    });
}

function _uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// form IO used for Save
function _readParamsFromForm() {
    const g = (id) => document.getElementById(id);
    const num = (el) => Number(el?.value ?? '');
    const chk = (id) => !!g(id)?.checked;

    const width  = num(g('widthNum'))  || num(g('width'))  || 80;
    const depth  = num(g('depthNum'))  || num(g('depth'))  || 50;
    const height = num(g('heightNum')) || num(g('height')) || 40;
    const tabW   = num(g('tabWidthNum')) || num(g('tabWidth')) || 10;

    const thickness = Number(document.querySelector('input[name="thickness"]')?.value ?? 3);
    const kerf      = Number(document.querySelector('input[name="kerf"]')?.value ?? 0.12);
    const margin    = Number(document.querySelector('input[name="margin"]')?.value ?? 12);

    return { width, depth, height, tabWidth: tabW, thickness, kerf, margin, addRightHole: chk('addRightHole') };
}
function _snapshotState() {
    const S = pc_getStateRef();
    return JSON.parse(JSON.stringify(S));
}

// -------------------- CRUD API ------------------------
export function listProjects() { return _loadStore(); }
export function getProject(id) { return _loadStore().find(p => p.id === id) || null; }

export function createProject(name) {
    const id  = _uuid();
    const now = new Date().toISOString();
    const proj = {
        id, name: (name || 'Untitled'),
        createdAt: now, updatedAt: now,
        params: _defaultParams(),      // defaults
        state:  _defaultState()        // empty panels, no items
    };
    const list = _loadStore(); list.push(proj); _saveStore(list);
    _setEditId(null);
    _setPreviewId(id);
    previewProject(id);              // apply immediately
    return proj;
}

export function saveEditedProject() {
    const id = _getEditId(); if (!id) return null;
    const list = _loadStore();
    const p = list.find(x => x.id === id); if (!p) return null;
    p.params = _readParamsFromForm();
    p.state  = _snapshotState();
    p.updatedAt = new Date().toISOString();
    _saveStore(list);
    return p;
}

export function renameProject(id, newName) {
    if (!newName || !newName.trim()) return false;
    const list = _loadStore(); const p = list.find(x => x.id === id); if (!p) return false;
    p.name = newName.trim();
    p.updatedAt = new Date().toISOString();
    _saveStore(list);
    return true;
}

export function deleteProject(id) {
    const list = _loadStore();
    const p = list.find(x => x.id === id); if (!p) return false;
    if (!confirm(`Delete project “${p.name}”? This cannot be undone.`)) return false;
    const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list.splice(idx, 1);
    _saveStore(list);
    if (_getPreviewId() === id) _setPreviewId(null);
    if (_getEditId() === id) _setEditId(null);
    return true;
}

// -------------------- apply to UI ---------------------
async function _applyProjectToUI(proj) {
    // hard-purge current preview
    const live = document.querySelector('#out svg');
    if (live) {
        ['Bottom','Lid','Front','Back','Left','Right'].forEach(n => {
            const host = live.querySelector(`[id$="${n}"]`);
            host?.querySelector(`#pcLayer_${n}`)?.remove();
        });
        live.querySelectorAll('#pcOverlaysRoot, #pcHitsRoot').forEach(n => n.remove());
    }

    // rebuild geometry from project params
    _applyParamsToForm(proj.params);
    await app_regenerate(proj.params);
    const svg = await app_waitForSvg();

    // load project state
    const S = pc_getStateRef();
    Object.keys(S).forEach(k => delete S[k]);
    Object.assign(S, JSON.parse(JSON.stringify(proj.state || _defaultState())));

    // normalize UI + clear selection
    if (!S._ui) S._ui = { activePanel: 'Front', selectedItemId: null, editItemId: null };
    setActiveCell(null);
    setSelectedItemId(null);
    setCurrentPanel(S._ui.activePanel || 'Front');
    document.dispatchEvent(new CustomEvent('pc:stateRestored'));

    // paint fresh and rebuild overlays
    pc_renderAll(svg);
    pi_onGeometryChanged(svg);
}

// view-only
export async function previewProject(id) {
    const p = getProject(id); if (!p) return;
    _setPreviewId(id);
    await _applyProjectToUI(p);
    _emitActiveChanged();
    document.dispatchEvent(new CustomEvent('pc:modeChanged', { detail: { mode: (_getEditId() === id ? 'edit' : 'preview'), projectId: id } }));
}

// edit intent
export async function editProject(id) {
    const p = getProject(id); if (!p) return;
    _setPreviewId(id);
    _setEditId(id);
    await _applyProjectToUI(p);
    _emitActiveChanged();
    document.dispatchEvent(new CustomEvent('pc:modeChanged', { detail: { mode: 'edit', projectId: id } }));
}

// -------------------- list rendering ------------------
function _panelCounts(state) {
    const out = {};
    const P = state?.panels || {};
    ['Bottom','Lid','Front','Back','Left','Right'].forEach(n => { out[n] = (P[n]?.items || []).length; });
    return out;
}
function _clone(obj){ return JSON.parse(JSON.stringify(obj ?? {})); }

// Duplicate → creates a new project with copied params/state, previews it
export async function duplicateProject(srcId) {
    const list = _loadStore();
    const src  = list.find(p => p.id === srcId);
    if (!src) return null;

    const now = new Date().toISOString();
    const dup = {
        id: _uuid(),
        name: (src.name ? `${src.name} (copy)` : 'Untitled (copy)'),
        createdAt: now,
        updatedAt: now,
        params: _clone(src.params),
        state:  _clone(src.state)
    };

    list.push(dup); _saveStore(list);
    _setEditId(null);
    _setPreviewId(dup.id);

    await _applyProjectToUI(dup);
    _emitActiveChanged?.();
    return dup.id;
}

export async function saveProjectAs(srcId, newName) {
    const list = _loadStore();
    const src  = list.find(p => p.id === srcId);
    if (!src) return null;

    const now = new Date().toISOString();
    const dup = {
        id: _uuid(),
        name: (newName && newName.trim()) || (src.name ? `${src.name} (copy)` : 'Untitled'),
        createdAt: now,
        updatedAt: now,
        params: _clone(src.params),
        state:  _clone(src.state)
    };

    list.push(dup);
    _saveStore(list);

    // make the “Save As” result the active, editable project
    _setPreviewId(dup.id);
    _setEditId(dup.id);

    await _applyProjectToUI(dup);
    _emitActiveChanged?.();
    return dup.id;
}

export function renderProjectsList() {
    _renderList();
}

function _renderList() {
    const mount = document.getElementById('proj-list'); if (!mount) return;
    mount.innerHTML = '';

    const list = listProjects().sort((a,b) => (b.updatedAt||'').localeCompare(a.updatedAt||''));
    const openMap = _loadOpen();
    const curPreview = _getPreviewId();
    const curEdit = _getEditId();

    if (!list.length) {
        mount.innerHTML = '<div class="text-secondary small py-2">No projects yet.</div>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'proj-tree slim';
    mount.appendChild(ul);

    list.forEach(p => {
        const li = document.createElement('li'); li.className = 'proj-node';

        // header row
        const row = document.createElement('div');
        row.className = 'proj-row slim d-flex align-items-center';
        row.setAttribute('tabindex','0'); row.setAttribute('role','button');

        const caret = document.createElement('i');
        caret.className = 'bi bi-caret-right-fill caret';
        row.appendChild(caret);

        const name = document.createElement('span');
        name.className = 'label text-truncate';
        name.textContent = p.name;
        row.appendChild(name);

        if (p.id === curEdit) {
            const b = document.createElement('span');
            b.className = 'badge rounded-pill bg-primary-subtle text-primary ms-2';
            b.textContent = 'Editing';
            row.appendChild(b);
        } else if (p.id === curPreview) {
            const b = document.createElement('span');
            b.className = 'badge rounded-pill bg-secondary-subtle text-secondary ms-2';
            b.textContent = 'Preview';
            row.appendChild(b);
        }

        // actions
        const actions = document.createElement('span');
        actions.className = 'd-inline-flex align-items-center gap-1 ms-auto';

        const btnPrev = document.createElement('button');
        btnPrev.type='button'; btnPrev.className='btn btn-xs btn-ghost'; btnPrev.title='Preview';
        btnPrev.innerHTML='<i class="bi bi-eye"></i>';
        btnPrev.addEventListener('click', async (e)=>{ e.stopPropagation(); _setEditId(null); await previewProject(p.id); _renderList(); });
        actions.appendChild(btnPrev);

        const btnEdit = document.createElement('button');
        btnEdit.type='button'; btnEdit.className='btn btn-xs btn-ghost'; btnEdit.title='Edit';
        btnEdit.innerHTML='<i class="bi bi-pencil-square"></i>';
        btnEdit.addEventListener('click', async (e)=>{ e.stopPropagation(); await editProject(p.id); _renderList(); });
        actions.appendChild(btnEdit);

        const btnRename = document.createElement('button');
        btnRename.type='button'; btnRename.className='btn btn-xs btn-ghost'; btnRename.title='Rename';
        btnRename.innerHTML='<i class="bi bi-input-cursor-text"></i>';
        btnRename.addEventListener('click',(e)=>{ e.stopPropagation(); const nn = prompt('Rename project', p.name); if (nn && nn.trim()) { renameProject(p.id, nn); _renderList(); } });
        actions.appendChild(btnRename);

        const btnDel = document.createElement('button');
        btnDel.type='button'; btnDel.className='btn btn-xs btn-ghost text-danger'; btnDel.title='Delete';
        btnDel.innerHTML='<i class="bi bi-trash"></i>';
        btnDel.addEventListener('click',(e)=>{
            e.stopPropagation();
            if (deleteProject(p.id)) {
                _renderList();
                _emitActiveChanged();
            }
        });
        actions.appendChild(btnDel);

        row.appendChild(actions);

        // children: per-panel counts
        const kids = document.createElement('ul'); kids.className = 'proj-children slim';
        const counts = _panelCounts(p.state || {});
        ['Bottom','Lid','Front','Back','Left','Right'].forEach(n => {
            const li2 = document.createElement('li'); li2.className = 'proj-leaf';
            li2.innerHTML = `<span class="leaf-label">${n}</span><span class="badge bg-light text-dark ms-auto">${counts[n] || 0}</span>`;
            kids.appendChild(li2);
        });

        const isOpen = !!openMap[p.id];
        if (isOpen) { kids.style.display = ''; caret.classList.add('open'); }
        else { kids.style.display = 'none'; }

        const toggle = () => {
            const opened = kids.style.display !== 'none';
            kids.style.display = opened ? 'none' : '';
            caret.classList.toggle('open', !opened);
            openMap[p.id] = !opened; _saveOpen(openMap);
        };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

        li.appendChild(row);
        li.appendChild(kids);
        ul.appendChild(li);
    });
}

// -------------------- wiring --------------------------
export function wireProjectsUI() {
    const btnNew    = document.getElementById('proj-new');

    btnNew?.addEventListener('click', () => {
        const nm = prompt('Project name', 'Untitled');
        if (!nm) return;
        createProject(nm);
        previewProject(_getPreviewId()).then(_renderList);
    });

    // keep list fresh on notable app events
    ['pc:stateRestored','pc:itemSelectionChanged','pc:panelChanged']
        .forEach(ev => document.addEventListener(ev, () => _renderList()));

    _renderList();
}
