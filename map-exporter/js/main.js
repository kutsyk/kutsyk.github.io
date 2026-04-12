import { initSearch } from './search.js';
import { initFrameControls } from './frame.js';
import { fetchElementsForBBox } from './overpass.js';
import { buildSVG } from './svg.js';

function initFooterDate() {
  const el = document.getElementById('footerDate');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  el.textContent = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initMap() {
  return new maplibregl.Map({
    container: 'mapCanvas',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }]
    },
    center: [0, 20],
    zoom: 2
  });
}

function getSelections() {
  return {
    width: Math.max(512, (+document.getElementById('w').value | 0) || 4096),
    height: Math.max(512, (+document.getElementById('h').value | 0) || 4096),
    want: {
      motorway: document.getElementById('chkMotorway').checked,
      trunk: document.getElementById('chkTrunk').checked,
      primary: document.getElementById('chkPrimary').checked,
      secondary: document.getElementById('chkSecondary').checked,
      tertiary: document.getElementById('chkTertiary').checked,
      local: document.getElementById('chkLocal').checked,
      water: document.getElementById('chkWater').checked,
      parks: document.getElementById('chkParks').checked,
      buildings: document.getElementById('chkBuildings').checked
    },
    colors: {
      motorway: document.getElementById('colMotorway').value || '#dd00ff',
      trunk: document.getElementById('colTrunk').value || '#ff7f00',
      primary: document.getElementById('colPrimary').value || '#ffd000',
      secondary: document.getElementById('colSecondary').value || '#00ffcf',
      tertiary: document.getElementById('colTertiary').value || '#bbbbbb',
      local: document.getElementById('colLocal').value || '#333333',
      water: document.getElementById('colWater').value || '#4b64e1',
      parks: document.getElementById('colParks').value || '#00ff32',
      buildings: document.getElementById('colBuildings').value || '#fd0000'
    }
  };
}

function downloadSVG(svgStr, fileName) {
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

function initPreviewExport(map, frameApi) {
  const modal = new bootstrap.Modal(document.getElementById('previewModal'));
  const previewBusy = document.getElementById('previewBusy');
  const previewSvg = document.getElementById('previewSvg');
  const previewWrap = document.getElementById('previewSvgWrap');
  const btnDownloadModal = document.getElementById('btnDownloadModal');
  const pageBusy = document.getElementById('pageBusy');

  function openPreviewBusy() {
    btnDownloadModal.disabled = true;
    previewBusy.classList.remove('d-none');
    previewSvg.classList.add('d-none');
    previewWrap.innerHTML = '';
    modal.show();
  }

  function showPreviewSvg(svgStr, fileName) {
    previewWrap.innerHTML = svgStr;
    previewBusy.classList.add('d-none');
    previewSvg.classList.remove('d-none');
    btnDownloadModal.disabled = false;
    btnDownloadModal.onclick = () => downloadSVG(svgStr, fileName);
  }

  document.getElementById('btnPreview').addEventListener('click', async () => {
    openPreviewBusy();
    try {
      const { width, height, want, colors } = getSelections();
      const bbox = frameApi.getActiveBBox();
      const elements = await fetchElementsForBBox(bbox, want);
      const { svgStr, fileName } = buildSVG({
        width,
        height,
        bbox,
        elements,
        want,
        colors,
        clipToFrame: frameApi.isFrameActive()
      });
      showPreviewSvg(svgStr, fileName);
    } catch (e) {
      previewBusy.innerHTML = `<div class="text-muted">Failed to generate SVG. ${e && e.message ? e.message : ''}</div>`;
    }
  });

  document.getElementById('btnExport').addEventListener('click', async () => {
    pageBusy.classList.remove('d-none');
    const btn = document.getElementById('btnExport');
    const oldHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Exporting…';

    try {
      const { width, height, want, colors } = getSelections();
      const bbox = frameApi.getActiveBBox();
      const elements = await fetchElementsForBBox(bbox, want);
      const { svgStr, fileName } = buildSVG({
        width,
        height,
        bbox,
        elements,
        want,
        colors,
        clipToFrame: frameApi.isFrameActive()
      });
      downloadSVG(svgStr, fileName);
    } catch (e) {
      alert(`Failed to generate SVG: ${e && e.message ? e.message : e}`);
    } finally {
      pageBusy.classList.add('d-none');
      btn.disabled = false;
      btn.innerHTML = oldHTML;
    }
  });
}

function bootstrapApp() {
  initFooterDate();
  const map = initMap();
  initSearch(map);
  const frameApi = initFrameControls(map);
  initPreviewExport(map, frameApi);
}

bootstrapApp();
