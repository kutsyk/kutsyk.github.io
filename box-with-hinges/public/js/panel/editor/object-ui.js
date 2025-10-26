// Toggle Object-edit form sections (Text vs SVG) from the current item type.
import { currentItem } from './helpers.js';

function applyTypeUI() {
    const it = currentItem();
    const type = (it?.type === 'svg') ? 'svg' : 'text';

    const typeInput = document.getElementById('pc-type');        // hidden, kept for compat
    const textProps = document.getElementById('pc-text-props');
    const svgProps  = document.getElementById('pc-svg-props');
    const svgName   = document.getElementById('pc-svg-filename');

    if (typeInput) typeInput.value = type;

    // show one, hide the other
    if (textProps) textProps.classList.toggle('d-none', type !== 'text');
    if (svgProps)  svgProps.classList.toggle('d-none',  type !== 'svg');

    // optional: show current file name when SVG selected
    if (svgName) svgName.textContent = (it?.svg?.name || '');
}

export function bindObjectTypeUI(){
    const sync = () => applyTypeUI();

    // re-evaluate whenever the edited/selected item changes or type flips
    ['pc:itemSelectionChanged','pc:enterEditChanged','pc:panelChanged','pc:stateRestored','pc:objectTypeChanged']
        .forEach(ev => document.addEventListener(ev, sync));

    // first paint
    requestAnimationFrame(sync);
}
