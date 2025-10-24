// public/js/api.js
export async function fetchSvg(queryStringOrParams) {
    const qs = typeof queryStringOrParams === 'string'
        ? queryStringOrParams
        : new URLSearchParams(queryStringOrParams).toString();

    const res = await fetch(`/api/svg?${qs}`);
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return text;
}
