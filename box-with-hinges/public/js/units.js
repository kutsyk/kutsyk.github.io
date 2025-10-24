const IN_PER_MM = 1 / 25.4;

export function toMm(val, units) {
    if (units === 'mm') return val;
    if (units === 'cm') return val * 10;
    if (units === 'in') return val / IN_PER_MM;
    return val;
}

export function fromMm(mm, units) {
    if (units === 'mm') return mm;
    if (units === 'cm') return mm / 10;
    if (units === 'in') return mm * IN_PER_MM;
    return mm;
}

export function fmt(mm, units='mm', digits=2) {
    const v = fromMm(mm, units);
    return `${v.toFixed(digits)} ${units}`;
}
