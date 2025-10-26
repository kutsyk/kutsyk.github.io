// js/panel/fonts.js
// Catalog + lazy loader using WebFont Loader (Google Fonts)

const CATALOG = [
    // curated, add/remove freely; names must be Google Fonts family names
    'Inter','Roboto','Montserrat','Open Sans','Lato','Poppins','Nunito',
    'Source Sans 3','Work Sans','Fira Sans','Noto Sans','Raleway','Merriweather',
    'Playfair Display','Oswald','Rubik','Archivo','Asap','Kanit','Manrope'
];

const _loaded = new Set();
function _normalize(name){ return String(name||'').trim(); }

export function listFonts(){ return CATALOG.slice(); }

export function ensureFontLoaded(family){
    return new Promise((resolve) => {
        const fam = _normalize(family) || 'Inter';
        if (_loaded.has(fam)) { resolve(true); return; }
        if (!window.WebFont) { _loaded.add(fam); resolve(true); return; }

        window.WebFont.load({
            google: { families: [fam + ':400,600'] },
            active: () => { _loaded.add(fam); resolve(true); },
            inactive: () => { _loaded.add(fam); resolve(false); }
        });
    });
}
