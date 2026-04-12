export function initSearch(map) {
  const searchEl = document.getElementById('search');
  const suggestEl = document.getElementById('suggest');

  let suggestItems = [];
  let activeIndex = -1;
  let debounceId = null;
  let suggestAbort = null;
  let suggestSeq = 0;

  function clearSuggest() {
    suggestEl.innerHTML = '';
    suggestEl.classList.remove('show');
    suggestItems = [];
    activeIndex = -1;
  }

  function selectResult(i) {
    const d = suggestItems[i];
    if (!d) return;
    searchEl.value = d.display_name;
    clearSuggest();

    if (d.boundingbox) {
      const south = +d.boundingbox[0];
      const north = +d.boundingbox[1];
      const west = +d.boundingbox[2];
      const east = +d.boundingbox[3];
      map.fitBounds([[west, south], [east, north]], { padding: 60, duration: 600 });
    } else if (d.lat && d.lon) {
      map.flyTo({ center: [+d.lon, +d.lat], zoom: 11, speed: 0.6 });
    }
  }

  function renderSuggest(results) {
    suggestEl.innerHTML = '';
    results.forEach((r, i) => {
      const a = document.createElement('a');
      a.className = 'dropdown-item';
      a.role = 'option';
      a.dataset.index = String(i);
      a.textContent = r.display_name;
      a.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectResult(i);
      });
      suggestEl.appendChild(a);
    });

    suggestItems = results;
    if (results.length) suggestEl.classList.add('show');
    else clearSuggest();
  }

  async function fetchSuggest(q) {
    if (suggestAbort) suggestAbort.abort();
    suggestAbort = new AbortController();

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=8&addressdetails=0`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: suggestAbort.signal
    });

    if (!res.ok) return [];
    return res.json();
  }

  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim();
    if (!q) {
      clearSuggest();
      return;
    }

    clearTimeout(debounceId);
    debounceId = setTimeout(async () => {
      const seq = ++suggestSeq;
      try {
        const results = await fetchSuggest(q);
        if (seq !== suggestSeq) return;
        renderSuggest(results);
      } catch (e) {
        if (e.name !== 'AbortError') clearSuggest();
      }
    }, 250);
  });

  searchEl.addEventListener('keydown', (e) => {
    const c = suggestItems.length;
    if (!c) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % c;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + c) % c;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) selectResult(activeIndex);
    } else if (e.key === 'Escape') {
      clearSuggest();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.suggest-wrap')) clearSuggest();
  });

  document.getElementById('btnSearch').addEventListener('click', async () => {
    const q = searchEl.value.trim();
    if (!q) return;

    try {
      const data = await fetchSuggest(q);
      if (data && data.length) selectResult(0);
    } catch (e) {
      if (e.name !== 'AbortError') alert('Search request failed. Please try again.');
    }
  });
}
