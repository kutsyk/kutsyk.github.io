var makerjs = require('makerjs');

let MakerJs, mm;

function initMaker() {
    if (!MakerJs) {
        MakerJs = makerjs;
        if (!MakerJs) {
            throw new Error('Maker.js not loaded. Include browser.maker.js BEFORE your modules.');
        }
        mm = makerjs.unitType.Millimeter;
    }
}

function mergeModels(target, name, model) {
    if (!target.models) target.models = {};
    target.models[name] = model;
}

function cloneModel(m) {
    return JSON.parse(JSON.stringify(m));
}

/** Params: { width, depth, height, thickness, kerf, tabWidth, margin, addRightHole } */
export function generateSvg(p) {
    initMaker();
    const model = generateModel(p);
    return MakerJs.exporter.toSVG(model, {
        units: mm,
        strokeWidth: 1,
        useSvgPathOnly: false
    });
}

/* ---- Everything below is your geometry.ts logic, converted to plain JS ---- */

function unionAll(models) {
    if (!models.length) return null;
    return models.reduce((a, m) => MakerJs.model.combineUnion(a, m));
}

function subtractAll(base, holes) {
    if (!holes.length) return base;
    const u = unionAll(holes);
    return u ? MakerJs.model.combineSubtraction(base, u) : base;
}

function footprintSize(w, h, edges, t) {
    const extraX = (edges.left === 'male' ? t : 0) + (edges.right === 'male' ? t : 0);
    const extraY = (edges.bottom === 'male' ? t : 0) + (edges.top === 'male' ? t : 0);
    return {width: w + extraX, height: h + extraY};
}

function placeAt(model, w, h, edges, t, x0, y0) {
    const shiftX = x0 - (edges.left === 'male' ? -t : 0);
    const shiftY = y0 - (edges.bottom === 'male' ? -t : 0);
    model.origin = [shiftX, shiftY];
}

function evenCountLockedWidth(edgeLen, tabWidth, minGap) {
    if (!isFinite(edgeLen) || edgeLen <= 0 || !isFinite(tabWidth) || tabWidth <= 0) return 0;
    let n = Math.floor(edgeLen / (tabWidth + minGap));
    if (n % 2 === 1) n -= 1;
    if (n < 2) return 0;
    return n;
}

function buildEdgeFeatures(w, h, role, edge, tabNominal, thickness, kerf) {
    const res = {males: [], females: []};
    if (role === 'plain') return res;

    const len = (edge === 'top' || edge === 'bottom') ? w : h;
    const minGap = Math.max(0.4, kerf);
    const n = evenCountLockedWidth(len, tabNominal, minGap);
    if (n < 2) return res;

    const pitch = len / n;
    const featureW0 = Math.min(tabNominal, pitch - minGap);
    if (featureW0 <= 0.2) return res;

    const maleW = Math.max(0.2, featureW0 - kerf);
    const femW = Math.max(0.2, featureW0 + kerf);
    const over = Math.max(kerf * 0.5, 0.05);

    const endClear = Math.max(thickness, minGap);
    const halfVis = featureW0 / 2;

    const k0 = Math.round((len / 2 - pitch / 2) / pitch);
    const c0 = k0 * pitch + pitch / 2;
    const delta = (len / 2) - c0;

    for (let i = 0; i < n; i++) {
        const center = i * pitch + pitch / 2 + delta;
        if (center < endClear + halfVis - 1e-6 || center > (len - endClear - halfVis) + 1e-6) continue;
        if (((i - k0) & 1) !== 0) continue;

        if (role === 'male') {
            if (edge === 'top') {
                const r = new MakerJs.models.Rectangle(maleW, thickness);
                r.origin = [center - maleW / 2, h];
                res.males.push(r);
            } else if (edge === 'bottom') {
                const r = new MakerJs.models.Rectangle(maleW, thickness);
                r.origin = [center - maleW / 2, -thickness];
                res.males.push(r);
            } else if (edge === 'left') {
                const r = new MakerJs.models.Rectangle(thickness, maleW);
                r.origin = [-thickness, center - maleW / 2];
                res.males.push(r);
            } else { // right
                const r = new MakerJs.models.Rectangle(thickness, maleW);
                r.origin = [w, center - maleW / 2];
                res.males.push(r);
            }
        }

        if (role === 'female') {
            if (edge === 'top') {
                const r = new MakerJs.models.Rectangle(femW, thickness + over);
                r.origin = [clamp(center - femW / 2, 0, w - femW), h - thickness];
                res.females.push(r);
            } else if (edge === 'bottom') {
                const r = new MakerJs.models.Rectangle(femW, thickness + over);
                r.origin = [clamp(center - femW / 2, 0, w - femW), -over];
                res.females.push(r);
            } else if (edge === 'left') {
                const r = new MakerJs.models.Rectangle(thickness + over, femW);
                r.origin = [-over, clamp(center - femW / 2, 0, h - femW)];
                res.females.push(r);
            } else { // right
                const r = new MakerJs.models.Rectangle(thickness + over, femW);
                r.origin = [w - thickness, clamp(center - femW / 2, 0, h - femW)];
                res.females.push(r);
            }
        }
    }
    return res;

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}

function panelWithEdges(w, h, edges, tabWidth, thickness, kerf) {
    let panel = new MakerJs.models.Rectangle(w, h);
    const allM = [], allF = [];
    ['top', 'right', 'bottom', 'left'].forEach(edge => {
        const role = edges[edge];
        const {males, females} = buildEdgeFeatures(w, h, role, edge, tabWidth, thickness, kerf);
        allM.push(...males);
        allF.push(...females);
    });
    const maleOverlay = {models: {}};
    allM.forEach((m, i) => {
        maleOverlay.models['m' + i] = m;
    });
    const femaleOverlay = {models: {}};
    allF.forEach((f, i) => {
        femaleOverlay.models['f' + i] = f;
    });

    if (panel.models) {
        panel.models.__maleTabs__ = maleOverlay;
        panel.models.__femaleTabs__ = femaleOverlay;
    } else {
        panel.models = {};
    }

// boolean ops still apply to panel itself:
    const uM = unionAll(allM);
    if (uM) panel = MakerJs.model.combineUnion(panel, uM);
    panel = subtractAll(panel, allF);
    return panel;

}

function addLidHinges(lid, W, D, T) {
    const leftH = new MakerJs.models.Rectangle(T, T);
    const rightH = new MakerJs.models.Rectangle(T, T);
    const y = D - 2 * T;
    leftH.origin = [-T, y];
    rightH.origin = [W, y];
    let merged = MakerJs.model.combineUnion(lid, leftH);
    merged = MakerJs.model.combineUnion(merged, rightH);
    return merged;
}

function addHingeEarWithHoleOnSide(panel, panelW, panelH, T, side, clearance = 1.0) {
    const dHole = T + clearance, rHole = dHole / 2;
    const dOuter = dHole + 2 * T, rOuter = dOuter / 2;
    const cx = (side === 'left') ? (2.5 * T) : (panelW - 2.5 * T);
    const cy = panelH - 0.5 * T;
    const outerEar = {paths: {ear: new MakerJs.paths.Circle([cx, cy], rOuter)}};
    const holeCut = {paths: {hole: new MakerJs.paths.Circle([cx, cy], rHole)}};
    let withEar = MakerJs.model.combineUnion(panel, outerEar);
    withEar = MakerJs.model.combineSubtraction(withEar, holeCut);
    return withEar;
}

// three-sided tab: open on one edge, selectable rounded corners
function threeSidedTab(tw, th, r, open, round) {
    const m = { paths: {} };
    const P = { tl:[0,th], tr:[tw,th], bl:[0,0], br:[tw,0] };
    const T = {
        tlx:[r, th], tly:[0, th - r],
        trx:[tw - r, th], try:[tw, th - r],
        blx:[r, 0], bly:[0, r],
        brx:[tw - r, 0], bry:[tw, r]
    };
    const need = { top:open!=='top', right:open!=='right', bottom:open!=='bottom', left:open!=='left' };
    const add = (k,a,b)=> m.paths[k]=new MakerJs.paths.Line(a,b);

    if (need.top)    add('top',    round.tl?T.tlx:P.tl, round.tr?T.trx:P.tr);
    if (need.right)  add('right',  round.tr?T.try:P.tr, round.br?T.bry:P.br);
    if (need.bottom) add('bottom', round.bl?T.blx:P.bl, round.br?T.brx:P.br);
    if (need.left)   add('left',   round.tl?T.tly:P.tl, round.bl?T.bly:P.bl);

    if (round.tl) m.paths.tl = new MakerJs.paths.Arc([r, th - r], r, 180, 90);
    if (round.tr) m.paths.tr = new MakerJs.paths.Arc([tw - r, th - r], r, 90, 0);
    if (round.br) m.paths.br = new MakerJs.paths.Arc([tw - r, r], r, 360, 270);
    if (round.bl) m.paths.bl = new MakerJs.paths.Arc([r, r], r, 270, 180);

    return m;
}

function addLidBottomTab(lid, W, D, T, tabWidth) {
    const tabW = 2 * tabWidth;
    const tabH = 1.5 * T;
    const r = Math.min(0.35 * tabH, 0.4 * tabW); // clamp radius

    // closed solid; Maker.js RoundRectangle spans [0..w]×[0..h]
    const tab = new MakerJs.models.RoundRectangle(tabW, tabH, r);

    // align top edge of tab at y=0 (lid’s bottom edge), centered horizontally
    tab.origin = [W / 2 - tabW / 2, -tabH];

    // boolean first → returns new model
    const lidOut = MakerJs.model.combineUnion(lid, tab);

    // overlay clone for coloring
    const tabOverlay = { models: { t: cloneModel(tab) } };
    mergeModels(lidOut, '__lidBottomTab__', tabOverlay);

    return lidOut;
}

function addFrontPanelSlot(front, W, H, T, tabWidth, kerf) {
    const slotW = 2 * tabWidth;
    const slotH = T + kerf * 2;
    const slot = new MakerJs.models.Rectangle(slotW, slotH + kerf);
    slot.origin = [W / 2 - slotW / 2, H - slotH + kerf];
    return MakerJs.model.combineSubtraction(front, slot);
}

function subtractCircularHole(panel, cx, cy, r) {
    const hole = {paths: {h: new MakerJs.paths.Circle([cx, cy], r)}};
    return MakerJs.model.combineSubtraction(panel, hole);
}

function generateModel(p) {
    const {width: W, depth: D, height: H, thickness: T, kerf, tabWidth, margin, addRightHole} = p;

    const root = {models: {}, paths: {}};
    const BD = Math.max(1, D - 2 * T);

    const bottom = panelWithEdges(
        W, BD,
        {top: 'male', right: 'male', bottom: 'male', left: 'male'},
        tabWidth, T, kerf
    );

    let front = panelWithEdges(
        W, H,
        {top: 'plain', right: 'male', bottom: 'female', left: 'male'},
        tabWidth, T, kerf
    );
    const back = panelWithEdges(
        W, H,
        {top: 'plain', right: 'male', bottom: 'female', left: 'male'},
        tabWidth, T, kerf
    );
    let left = panelWithEdges(
        D, H,
        {top: 'plain', right: 'female', bottom: 'female', left: 'female'},
        tabWidth, T, kerf
    );
    let right = panelWithEdges(
        D, H,
        {top: 'plain', right: 'female', bottom: 'female', left: 'female'},
        tabWidth, T, kerf
    );

    let lid = new MakerJs.models.Rectangle(W, BD);
    lid = addLidHinges(lid, W, BD, T);
    lid = addLidBottomTab(lid, W, BD, T, tabWidth);

    const holeClearance = 1.0;
    left = addHingeEarWithHoleOnSide(left, D, H, T, 'left', holeClearance);
    right = addHingeEarWithHoleOnSide(right, D, H, T, 'right', holeClearance);

    front = addFrontPanelSlot(front, W, H, T, tabWidth, kerf);

    if (addRightHole) {
        const cx = D - 12; // right panel width is D
        const cy = 25;
        const r = 4;      // Ø8
        right = subtractCircularHole(right, cx, cy, r);
    }

    const gEff = Math.max(margin, T + 2);

    const fpBottom = footprintSize(W, D, {top: 'male', right: 'male', bottom: 'male', left: 'male'}, T);
    const fpFront = footprintSize(W, H, {top: 'plain', right: 'male', bottom: 'female', left: 'male'}, T);
    const fpBack = footprintSize(W, H, {top: 'plain', right: 'male', bottom: 'female', left: 'male'}, T);
    const fpLeft = footprintSize(D, H, {top: 'plain', right: 'female', bottom: 'female', left: 'female'}, T);
    const fpRight = footprintSize(D, H, {top: 'plain', right: 'female', bottom: 'female', left: 'female'}, T);
    const fpLid = {width: W + 2 * T, height: D};

    let x = gEff, y = gEff;
    placeAt(bottom, W, D, {top: 'male', right: 'male', bottom: 'male', left: 'male'}, T, x, y);
    x += fpBottom.width + gEff;
    lid.origin = [x + T, y];

    x = gEff;
    y += Math.max(fpBottom.height, fpLid.height) + gEff;
    placeAt(front, W, H, {top: 'plain', right: 'male', bottom: 'female', left: 'male'}, T, x, y);

    x += fpFront.width + gEff;
    placeAt(back, W, H, {top: 'plain', right: 'male', bottom: 'female', left: 'male'}, T, x, y);

    x += fpBack.width + gEff;
    placeAt(left, D, H, {top: 'plain', right: 'female', bottom: 'female', left: 'female'}, T, x, y);

    x += fpLeft.width + gEff;
    placeAt(right, D, H, {top: 'plain', right: 'female', bottom: 'female', left: 'female'}, T, x, y);

    root.models = {Bottom: bottom, Lid: lid, Front: front, Back: back, Left: left, Right: right};
    MakerJs.model.zero(root);
    root.units = mm;
    return root;
}
