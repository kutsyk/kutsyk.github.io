// js/projects.js
// Projects CRUD + preview/edit switching + list rendering
// Backward-compat exports preserved: deleteProject, duplicateProject,
// getEditProjectId, getPreviewProjectId, listProjects, previewProject,
// renderProjectsList, saveEditedProject, saveProjectAs, wireProjectsUI

// ---------- storage keys ----------
import {pc_getStateRef} from './panel-content.js';
import {pc_renderAll} from './panel-state-bridge.js';
import {pi_onGeometryChanged} from './panel-interaction.js';
import {generateSvg} from "./geometry.js";
import {mountSvg} from "./renderer.js";
import {setReadonly} from "./panel/state.js";

const K_STORE = 'pc_projects';
const K_PREVIEW = 'pc_projects_preview_id';
const K_EDIT = 'pc_projects_edit_id';
window.PC_EDITABLE = true; // default after reload

export function setEditable(on) {
    window.PC_EDITABLE = !!on;
    const out = document.getElementById('out');
    if (out) {
        if (on) out.removeAttribute('data-pc-readonly');
        else out.setAttribute('data-pc-readonly', '1');
    }
    document.dispatchEvent(new CustomEvent('proj:editModeChanged', { detail: { editable: !!on } }));

    const svg = document.querySelector('#out svg');
    if (svg && typeof window.pi_onGeometryChanged === 'function') window.pi_onGeometryChanged(svg);
}

// ---------- utils ----------
function _nowISO() {
    return new Date().toISOString();
}

function _uuid() {
    return 'p_' + Math.random().toString(36).slice(2, 10);
}

function _loadStore() {
    try {
        return JSON.parse(localStorage.getItem(K_STORE) || '[]');
    } catch {
        return [];
    }
}

function _saveStore(list) {
    localStorage.setItem(K_STORE, JSON.stringify(list));
}

function _setPreviewId(id) {
    if (id) localStorage.setItem(K_PREVIEW, id); else localStorage.removeItem(K_PREVIEW);
}

function _setEditId(id) {
    if (id) localStorage.setItem(K_EDIT, id);
    else localStorage.removeItem(K_EDIT);
}

// public getters (kept same names)
export function getPreviewProjectId() {
    const v = localStorage.getItem(K_PREVIEW);
    return v && v !== 'null' ? v : null;
}

export function getEditProjectId() {
    const v = localStorage.getItem(K_EDIT);
    return v && v !== 'null' ? v : null;
}

export function proj_isEditing() {
    return !!getEditProjectId();
}

// ---------- defaults ----------
function _defaultParams() {
    return {width: 80, depth: 50, height: 40, tabWidth: 10, thickness: 3, kerf: 0.12, margin: 12, addRightHole: true};
}

function _defaultPanelLayout() {
    return {mode: 'grid', rows: 1, cols: 1, gutter: 0, padding: 0, rowPercents: [100], colPercents: [100]};
}

function _emptyPanel() {
    return {layout: _defaultPanelLayout(), items: []};
}

function _defaultState() {
    return {
        panels: {
            Bottom: _emptyPanel(),
            Lid: _emptyPanel(),
            Front: _emptyPanel(),
            Back: _emptyPanel(),
            Left: _emptyPanel(),
            Right: _emptyPanel()
        },
        _ui: {activePanel: 'Front', selectedItemId: null, editItemId: null}
    };
}

function _applySnapshotToRuntime(proj) {
    const S = pc_getStateRef();
    const snap = proj?.state || {};

    // update only model parts; do NOT nuke the object identity used by other modules
    S.panels = JSON.parse(JSON.stringify(snap.panels || {}));
    S._ui = {
        activePanel: (snap._ui && snap._ui.activePanel) || 'Front',
        selectedItemId: null,
        editItemId: null
    };

    const svg = document.querySelector('#out svg');
    if (svg) {
        pc_renderAll(svg);        // redraw item layers only
        pi_onGeometryChanged(svg);// redraw overlays (frame, grid, hits)
    }

    document.dispatchEvent(new CustomEvent('pc:panelChanged', { detail: { panel: S._ui.activePanel } }));
    document.dispatchEvent(new CustomEvent('pc:activeCellChanged', { detail: { panel: null, row: null, col: null } }));
    document.dispatchEvent(new CustomEvent('pc:stateRestored'));
}

// tiny helper
function _loadProjectById(id) {
    const all = listProjects();           // your existing export
    return all.find(p => p.id === id) || null;
}

// PREVIEW → read-only; no DOM remount
export async function previewProject(id) {
    const p = _loadProjectById(id); if (!p) return;
    _setPreviewId(id);
    _setEditId(null);
    _applySnapshotToRuntime(p);
    setReadonly(true);                    // one bit; listeners handle interactivity
}

// EDIT → editable; no DOM remount
export async function editProject(id) {
    const p = _loadProjectById(id); if (!p) return;
    _setPreviewId(null);
    _setEditId(id);
    _applySnapshotToRuntime(p);
    setReadonly(false);
}

async function _ensureBaseSvgForParams(params) {
    const outEl = document.getElementById('out');
    if (!outEl) return;
    // sync form controls so UI reflects the project’s params
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    set('width', params.width);       set('widthNum', params.width);
    set('depth', params.depth);       set('depthNum', params.depth);
    set('height', params.height);     set('heightNum', params.height);
    set('tabWidth', params.tabWidth); set('tabWidthNum', params.tabWidth);
    const t = document.querySelector('input[name="thickness"]'); if (t) t.value = String(params.thickness);
    const k = document.querySelector('input[name="kerf"]');       if (k) k.value = String(params.kerf);
    const m = document.querySelector('input[name="margin"]');     if (m) m.value = String(params.margin);
    const chk = document.getElementById('addRightHole');          if (chk) chk.checked = !!params.addRightHole;

    // build base SVG and mount via renderer so pan/zoom, rulers, and base layers are wired
    const svgText = generateSvg(params);
    const svg = mountSvg(svgText, outEl);           // <-- critical: do NOT use innerHTML

    // if your mountSvg returns the <svg>, refresh overlays right away
    if (svg) {
        pc_renderAll(svg);                     // draw panel item layers
        pi_onGeometryChanged(svg);             // draw overlays (frame, grid, hit rects)
    }
}

// ---------- public CRUD ----------
export function listProjects() {
    return _loadStore();
}

export function ensureDefaultProject() {
    const list = _loadStore();
    if (list.length) return;
    const def = {
        id: 'def_project',
        name: 'Default',
        createdAt: _nowISO(),
        updatedAt: _nowISO(),
        params: _defaultParams(),
        state: _defaultState()
    };
    _saveStore([def]);
    _setPreviewId(def.id);
    _setEditId(null);
    _emitListChanged();
    _emitActiveChanged();
    setEditable(false);
}

export function createProject(name) {
    const list = _loadStore();
    const p = {
        id: _uuid(),
        name: (name && name.trim()) || 'Untitled',
        createdAt: _nowISO(),
        updatedAt: _nowISO(),
        params: _defaultParams(),
        state: _defaultState()
    };
    list.push(p);
    _saveStore(list);
    _setPreviewId(p.id);
    _setEditId(null);
    _ensureBaseSvgForParams(p.params).then(() => _applySnapshotToRuntime(p));
    _emitListChanged();
    _emitActiveChanged();
    setEditable(false);
    return p.id;
}

export function renameProject(id, newName) {
    const list = _loadStore();
    const p = list.find(x => x.id === id);
    if (!p) return false;
    p.name = (newName || '').trim() || p.name;
    p.updatedAt = _nowISO();
    _saveStore(list);
    _emitListChanged();
    _emitActiveChanged();
    return true;
}

export function deleteProject(id) {
    const list = _loadStore();
    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return false;
    const prevId = getPreviewProjectId();
    const editId = getEditProjectId();
    list.splice(idx, 1);
    _saveStore(list);
    if (prevId === id) _setPreviewId(null);
    if (editId === id) _setEditId(null);
    const rest = _loadStore();
    if (!getPreviewProjectId() && rest.length) _setPreviewId(rest[0].id);
    const curPrev = getPreviewProjectId();
    if (curPrev) {
        const p = rest.find(x => x.id === curPrev);
        if (p) _ensureBaseSvgForParams(p.params).then(() => _applySnapshotToRuntime(p));
    }
    _emitListChanged();
    _emitActiveChanged();
    _emitEditability();
    return true;
}

// save current edited project snapshot
export function saveEditedProject() { // kept old name
    const id = getEditProjectId();
    if (!id) return false;
    const list = _loadStore();
    const p = list.find(x => x.id === id);
    if (!p) return false;

    const readNum = (id, def) => {
        const el = document.getElementById(id);
        const v = el ? Number(el.value) : NaN;
        return Number.isFinite(v) ? v : def;
    };
    p.params = {
        width: readNum('width', p.params.width),
        depth: readNum('depth', p.params.depth),
        height: readNum('height', p.params.height),
        tabWidth: readNum('tabWidth', p.params.tabWidth),
        thickness: (() => {
            const el = document.querySelector('input[name="thickness"]');
            const v = el ? Number(el.value) : NaN;
            return Number.isFinite(v) ? v : p.params.thickness;
        })(),
        kerf: (() => {
            const el = document.querySelector('input[name="kerf"]');
            const v = el ? Number(el.value) : NaN;
            return Number.isFinite(v) ? v : p.params.kerf;
        })(),
        margin: (() => {
            const el = document.querySelector('input[name="margin"]');
            const v = el ? Number(el.value) : NaN;
            return Number.isFinite(v) ? v : p.params.margin;
        })(),
        addRightHole: !!document.getElementById('addRightHole')?.checked
    };

    const S = pc_getStateRef();
    p.state = JSON.parse(JSON.stringify(S));
    p.updatedAt = _nowISO();
    _saveStore(list);
    _emitListChanged();
    _emitActiveChanged();
    return true;
}

export function saveProjectAs(name) { // kept old name
    const list = _loadStore();
    const newId = _uuid();

    const readNum = (id, def) => {
        const el = document.getElementById(id);
        const v = el ? Number(el.value) : NaN;
        return Number.isFinite(v) ? v : def;
    };
    const curParams = {
        width: readNum('width', 80),
        depth: readNum('depth', 50),
        height: readNum('height', 40),
        tabWidth: readNum('tabWidth', 10),
        thickness: (() => {
            const el = document.querySelector('input[name="thickness"]');
            const v = el ? Number(el.value) : NaN;
            return Number.isFinite(v) ? v : 3;
        })(),
        kerf: (() => {
            const el = document.querySelector('input[name="kerf"]');
            const v = el ? Number(el.value) : NaN;
            return Number.isFinite(v) ? v : 0.12;
        })(),
        margin: (() => {
            const el = document.querySelector('input[name="margin"]');
            const v = el ? Number(el.value) : NaN;
            return Number.isFinite(v) ? v : 12;
        })(),
        addRightHole: !!document.getElementById('addRightHole')?.checked
    };

    const S = pc_getStateRef();
    const clone = {
        id: newId,
        name: (name && name.trim()) || 'Untitled',
        createdAt: _nowISO(),
        updatedAt: _nowISO(),
        params: curParams,
        state: JSON.parse(JSON.stringify(S))
    };
    list.push(clone);
    _saveStore(list);
    _emitListChanged();
    return newId;
}

export function duplicateProject(srcId, newName) { // kept old name
    const list = _loadStore();
    const src = list.find(x => x.id === srcId);
    if (!src) return null;
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = _uuid();
    clone.name = (newName && newName.trim()) || (src.name + ' copy');
    clone.createdAt = _nowISO();
    clone.updatedAt = _nowISO();
    list.push(clone);
    _saveStore(list);
    _emitListChanged();
    return clone.id;
}

// ---------- list UI (kept renderProjectsList, wireProjectsUI) ----------

function _panelCounts(state) {
    const out = {Bottom: 0, Lid: 0, Front: 0, Back: 0, Left: 0, Right: 0};
    const P = state?.panels || {};
    Object.keys(out).forEach(k => {
        out[k] = (P[k]?.items || []).length;
    });
    return out;
}

function _loadOpen() {
    try {
        return JSON.parse(localStorage.getItem('pc_proj_open') || '{}');
    } catch {
        return {};
    }
}

function _saveOpen(m) {
    localStorage.setItem('pc_proj_open', JSON.stringify(m || {}));
}

export function renderProjectsList() { // kept old name
    const mount = document.getElementById('proj-list');
    if (!mount) return;
    mount.innerHTML = '';

    const list = listProjects().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const openMap = _loadOpen();
    const curPreview = getPreviewProjectId();
    const curEdit = getEditProjectId();

    if (!list.length) {
        mount.innerHTML = '<div class="text-secondary small py-2">No projects yet.</div>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'proj-tree slim';
    mount.appendChild(ul);

    list.forEach(p => {
        const li = document.createElement('li');
        li.className = 'proj-node';

        const row = document.createElement('div');
        row.className = 'proj-row slim';
        row.setAttribute('tabindex', '0');
        row.setAttribute('role', 'button');

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

        const actions = document.createElement('span');
        actions.className = 'd-inline-flex align-items-center ms-auto gap-1';

        const btnPrev = document.createElement('button');
        btnPrev.type = 'button';
        btnPrev.className = 'btn btn-xs btn-ghost';
        btnPrev.title = 'Preview';
        btnPrev.innerHTML = '<i class="bi bi-eye"></i>';
        btnPrev.addEventListener('click', async (e) => {
            e.stopPropagation();
            await previewProject(p.id);
            renderProjectsList();
        });
        actions.appendChild(btnPrev);

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'btn btn-xs btn-ghost';
        btnEdit.title = 'Edit';
        btnEdit.innerHTML = '<i class="bi bi-pencil-square"></i>';
        btnEdit.addEventListener('click', async (e) => {
            e.stopPropagation();
            await editProject(p.id);
            renderProjectsList();
        });
        actions.appendChild(btnEdit);

        const btnRename = document.createElement('button');
        btnRename.type = 'button';
        btnRename.className = 'btn btn-xs btn-ghost';
        btnRename.title = 'Rename';
        btnRename.innerHTML = '<i class="bi bi-input-cursor-text"></i>';
        btnRename.addEventListener('click', (e) => {
            e.stopPropagation();
            const nn = prompt('Rename project', p.name);
            if (nn && nn.trim()) {
                renameProject(p.id, nn);
                renderProjectsList();
            }
        });
        actions.appendChild(btnRename);

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'btn btn-xs btn-ghost text-danger';
        btnDel.title = 'Delete';
        btnDel.innerHTML = '<i class="bi bi-trash"></i>';
        btnDel.addEventListener('click', (e) => {
            e.stopPropagation();
            const ok = confirm(`Delete project “${p.name}”?`);
            if (ok) {
                if (deleteProject(p.id)) renderProjectsList();
            }
        });
        actions.appendChild(btnDel);

        row.appendChild(actions);

        const kids = document.createElement('ul');
        kids.className = 'proj-children slim';
        const counts = _panelCounts(p.state || {});
        ['Bottom', 'Lid', 'Front', 'Back', 'Left', 'Right'].forEach(n => {
            const li2 = document.createElement('li');
            li2.className = 'proj-leaf';
            li2.innerHTML = `<span class="leaf-label">${n}</span><span class="badge bg-light text-dark ms-auto">${counts[n] || 0}</span>`;
            kids.appendChild(li2);
        });

        const isOpen = !!openMap[p.id];
        if (isOpen) {
            kids.style.display = '';
            caret.classList.add('open');
        } else {
            kids.style.display = 'none';
        }

        const toggle = () => {
            const opened = kids.style.display !== 'none';
            kids.style.display = opened ? 'none' : '';
            caret.classList.toggle('open', !opened);
            openMap[p.id] = !opened;
            _saveOpen(openMap);
        };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });

        li.appendChild(row);
        li.appendChild(kids);
        ul.appendChild(li);
    });
}

// wire top buttons (kept old name)
export function wireProjectsUI() {
    ensureDefaultProject();
    setEditable(!!getEditProjectId());
    _wireButtonsOnce();
    renderProjectsList();
    document.addEventListener('projects:listChanged', renderProjectsList);
    document.addEventListener('projects:activeChanged', renderProjectsList);
    document.addEventListener('proj:editModeChanged', () => {
        const svg = document.querySelector('#out svg');
        if (svg && typeof window.pi_onGeometryChanged === 'function') window.pi_onGeometryChanged(svg);
    });
}

// ---------- internal button wiring ----------
function _emitListChanged() {
    document.dispatchEvent(new CustomEvent('projects:listChanged'));
}

function _emitActiveChanged() {
    document.dispatchEvent(new CustomEvent('projects:activeChanged'));
}

function _emitEditability() {
    document.dispatchEvent(new CustomEvent('proj:editModeChanged', {detail: {editable: proj_isEditing()}}));
}

function _wireButtonsOnce() {
    if (document._pcProjBtnsWired) return;
    document._pcProjBtnsWired = true;
    const q = (id) => document.getElementById(id);

    q('proj-new')?.addEventListener('click', () => {
        const nn = prompt('New project name', 'Untitled');
        createProject(nn || 'Untitled');
        renderProjectsList();
    });

    q('proj-save')?.addEventListener('click', () => {
        saveEditedProject();
        renderProjectsList();
    });

    q('proj-saveas')?.addEventListener('click', () => {
        const nn = prompt('Save as…', 'Copy');
        if (nn && nn.trim()) {
            saveProjectAs(nn.trim());
            renderProjectsList();
        }
    });

    q('proj-duplicate')?.addEventListener('click', () => {
        const id = getPreviewProjectId() || getEditProjectId();
        if (!id) return;
        const src = listProjects().find(p => p.id === id);
        const nn = prompt('Duplicate name', (src?.name || 'Untitled') + ' copy');
        duplicateProject(id, nn || ((src?.name || 'Untitled') + ' copy'));
        renderProjectsList();
    });

    q('proj-delete')?.addEventListener('click', () => {
        const id = getPreviewProjectId() || getEditProjectId();
        if (!id) return;
        const p = listProjects().find(x => x.id === id);
        const ok = confirm(`Delete project “${p?.name || id}”?`);
        if (ok) {
            deleteProject(id);
            renderProjectsList();
        }
    });
}

// auto-init if container exists
if (document.getElementById('proj-list')) {
    try {
        wireProjectsUI();
    } catch {
    }
}
