// js/panel/editor/textcase.js
import { pc_getPanelState, pc_renderAll } from '../../panel-state-bridge.js';
import { getCurrentPanel, getSelectedItemId, getEditItemId } from '../../panel/state.js';
import { pc_save } from '../../panel-content.js';
import { pi_onGeometryChanged } from '../../panel-interaction.js';

// --- transforms ---
function toLower(s) { return (s || '').toLowerCase(); }
function toUpper(s) { return (s || '').toUpperCase(); }

// Capitalize first letter of each word; keep interior apostrophes properly (“john's”)
function toCapitalized(s) {
    return (s || '').toLowerCase().replace(/\b([A-Za-zÀ-ÖØ-öø-ÿ])([A-Za-zÀ-ÖØ-öø-ÿ']*)/g, (_, a, b) => a.toUpperCase() + b);
}

// Sentence case: split on . ! ? (with quotes / spaces), capitalize first A–Z/latin letter
function toSentence(s) {
    const txt = (s || '').toLowerCase();
    const parts = txt.split(/([.!?]\s+|$)/);
    for (let i = 0; i < parts.length; i += 2) {
        parts[i] = parts[i].replace(/^(\s*["'([{]*)([A-Za-zÀ-ÖØ-öø-ÿ])/, (m, pre, ch) => pre + ch.toUpperCase());
    }
    return parts.join('');
}

function applyCase(mode, value) {
    switch (mode) {
        case 'lower': return toLower(value);
        case 'upper': return toUpper(value);
        case 'capitalized': return toCapitalized(value);
        case 'sentence':
        default: return toSentence(value);
    }
}

function currentTextItem() {
    const panel = getCurrentPanel();
    const id = (typeof getEditItemId === 'function' && getEditItemId()) || (typeof getSelectedItemId === 'function' && getSelectedItemId());
    if (!panel || !id) return null;
    const p = pc_getPanelState(panel);
    const it = p?.items?.find(i => i.id === id);
    if (!it || it.type !== 'text') return null;
    return { panel, item: it };
}

function markApplyDirty(on) {
    const btn = document.getElementById('pc-apply-case');
    if (!btn) return;
    btn.classList.toggle('btn-warning', !!on);
    btn.classList.toggle('btn-outline-secondary', !on);
    btn.classList.toggle('pc-needs-apply', !!on); // optional pulse via CSS below
}

function evalDirty() {
    const sel = document.getElementById('pc-text-case');
    if (!sel) return markApplyDirty(false);

    const hit = currentTextItem();
    if (!hit) { markApplyDirty(false); return; }

    const mode = sel.value || 'sentence';
    const v = hit.item.text?.value || '';
    const nv = applyCase(mode, v);
    markApplyDirty(nv !== v);
}

// --- UI binding ---
function onApply() {
    const sel = document.getElementById('pc-text-case');
    if (!sel) return;
    const hit = currentTextItem();
    if (!hit) return;

    const mode = sel.value || 'sentence';
    const v = hit.item.text?.value || '';
    const nv = applyCase(mode, v);
    if (nv === v) { markApplyDirty(false); return; }

    hit.item.text = hit.item.text || {};
    hit.item.text.value = nv;

    pc_save();
    const svg = document.querySelector('#out svg');
    if (svg) { pc_renderAll(svg); pi_onGeometryChanged(svg); }

    document.dispatchEvent(new CustomEvent('pc:itemSelectionChanged', { detail: { id: hit.item.id, panel: hit.panel } }));
    markApplyDirty(false);
}

function syncDisabled() {
    const btn = document.getElementById('pc-apply-case');
    const sel = document.getElementById('pc-text-case');
    const hit = currentTextItem();
    const on = !!hit;
    if (btn) btn.disabled = !on;
    if (sel) sel.disabled = !on;
    if (!on) markApplyDirty(false); else evalDirty();
}

export function bindTextCaseControls() {
    const btn = document.getElementById('pc-apply-case');
    if (btn && !btn._pcBound) {
        btn._pcBound = true;
        btn.addEventListener('click', onApply);
    }
    const sel = document.getElementById('pc-text-case');
    if (sel && !sel._pcBound) {
        sel._pcBound = true;
        sel.addEventListener('change', evalDirty);
    }

    // also watch the main text value field, so changing text re-evaluates dirty
    const txt = document.getElementById('pc-textarea');
    if (txt && !txt._pcBoundForCase) {
        txt._pcBoundForCase = true;
        txt.addEventListener('input', evalDirty);
    }

    ['pc:itemSelectionChanged','pc:enterEditChanged','pc:panelChanged','pc:stateRestored','pc:panelReset']
        .forEach(ev => document.addEventListener(ev, syncDisabled));

    requestAnimationFrame(syncDisabled);
}
