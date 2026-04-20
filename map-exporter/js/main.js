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
  const majorRoadsColor = document.getElementById('colMajorRoads').value || '#ff8c00';
  const minorRoadsColor = document.getElementById('colMinorRoads').value || '#000000';
  const overrideColor = (toggleId, colorId, fallback) => (
    document.getElementById(toggleId).checked
      ? (document.getElementById(colorId).value || fallback)
      : fallback
  );

  return {
    width: Math.max(512, (+document.getElementById('w').value | 0) || 4096),
    height: Math.max(512, (+document.getElementById('h').value | 0) || 4096),
    want: {
      majorRoads: document.getElementById('chkMajorRoads').checked,
      minorRoads: document.getElementById('chkMinorRoads').checked,
      water: document.getElementById('chkWater').checked,
      parks: document.getElementById('chkParks').checked,
      buildings: document.getElementById('chkBuildings').checked
    },
    colors: {
      majorRoads: majorRoadsColor,
      minorRoads: minorRoadsColor,
      water: document.getElementById('colWater').value || '#4b64e1',
      parks: document.getElementById('colParks').value || '#00ff32',
      buildings: document.getElementById('colBuildings').value || '#ff2d2d'
    },
    roadSubTypeColors: {
      motorway: overrideColor('ovrMotorway', 'colMotorway', majorRoadsColor),
      trunk: overrideColor('ovrTrunk', 'colTrunk', majorRoadsColor),
      primary: overrideColor('ovrPrimary', 'colPrimary', majorRoadsColor),
      secondary: overrideColor('ovrSecondary', 'colSecondary', minorRoadsColor),
      tertiary: overrideColor('ovrTertiary', 'colTertiary', minorRoadsColor),
      local: overrideColor('ovrLocal', 'colLocal', minorRoadsColor)
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

  const exportProgressPanel = document.getElementById('exportProgressPanel');
  const exportProgressBar = document.getElementById('exportProgressBar');
  const exportProgressPercent = document.getElementById('exportProgressPercent');
  const exportProgressStatus = document.getElementById('exportProgressStatus');
  const exportProgressStage = document.getElementById('exportProgressStage');
  const exportProgressElapsed = document.getElementById('exportProgressElapsed');
  const exportProgressLog = document.getElementById('exportProgressLog');
  const exportErrorBox = document.getElementById('exportErrorBox');
  const btnCancelExport = document.getElementById('btnCancelExport');
  const btnRetryExport = document.getElementById('btnRetryExport');

  const frameInfoEl = document.getElementById('frameInfo');
  const btnSnapFrame = document.getElementById('btnSnapFrame');
  const btnResetFrame = document.getElementById('btnResetFrame');
  const estimateBadge = document.getElementById('estimateBadge');
  const estimateText = document.getElementById('estimateText');

  const STAGE_TOTAL = 5;
  let elapsedTimer = null;
  let exportStartedAt = 0;
  let stageIndex = 0;
  let lastLogLine = '';
  let exportAbortController = null;
  let isExporting = false;
  let lastExportRequest = null;
  const overpassCache = new Map();

  function getElapsedSec() {
    return Math.floor((Date.now() - exportStartedAt) / 1000);
  }

  function setProgress(percent, status, opts = {}) {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    const { indeterminate = false } = opts;

    if (indeterminate) {
      exportProgressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
      exportProgressBar.style.width = '100%';
      exportProgressBar.textContent = '…';
      exportProgressPercent.textContent = '…';
    } else {
      exportProgressBar.classList.add('progress-bar-striped', 'progress-bar-animated');
      exportProgressBar.style.width = `${p}%`;
      exportProgressBar.textContent = `${p}%`;
      exportProgressPercent.textContent = `${p}%`;
    }

    if (status) exportProgressStatus.textContent = status;
    exportProgressStage.textContent = `Stage ${Math.min(stageIndex, STAGE_TOTAL)}/${STAGE_TOTAL}`;
  }

  function logProgress(status, type = 'done') {
    if (!status || status === lastLogLine) return;
    lastLogLine = status;
    const row = document.createElement('div');
    row.className = `log-item ${type}`.trim();
    row.innerHTML = `<span class="dot"></span><span>${status}</span>`;
    exportProgressLog.appendChild(row);
    exportProgressLog.scrollTop = exportProgressLog.scrollHeight;
  }

  function showError(message) {
    exportErrorBox.classList.remove('d-none');
    exportErrorBox.textContent = message;
    btnRetryExport.classList.remove('d-none');
  }

  function clearError() {
    exportErrorBox.classList.add('d-none');
    exportErrorBox.textContent = '';
    btnRetryExport.classList.add('d-none');
  }

  function startElapsedTimer() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    exportProgressElapsed.textContent = '0s';
    elapsedTimer = setInterval(() => {
      exportProgressElapsed.textContent = `${getElapsedSec()}s`;
    }, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function resetProgressPanel() {
    exportProgressLog.innerHTML = '';
    lastLogLine = '';
    stageIndex = 0;
    exportProgressPanel.classList.remove('d-none');
    clearError();
    setProgress(0, 'Preparing export request…');
  }

  function buildCacheKey({ bbox, want, width, height }) {
    return JSON.stringify({
      west: +bbox.getWest().toFixed(5),
      south: +bbox.getSouth().toFixed(5),
      east: +bbox.getEast().toFixed(5),
      north: +bbox.getNorth().toFixed(5),
      want,
      width,
      height
    });
  }

  function updateFrameInfo() {
    const info = frameApi.getFrameInfo();
    if (!info) {
      frameInfoEl.textContent = 'Frame inactive (using current viewport)';
      return;
    }
    frameInfoEl.textContent = `W:${info.west.toFixed(4)} E:${info.east.toFixed(4)} S:${info.south.toFixed(4)} N:${info.north.toFixed(4)} · ${info.widthDeg.toFixed(4)}° x ${info.heightDeg.toFixed(4)}°`;
  }

  function updateExportEstimate() {
    const { width, height, want } = getSelections();
    const bbox = frameApi.getActiveBBox();
    const bboxArea = Math.max(0.00001, (bbox.getEast() - bbox.getWest()) * (bbox.getNorth() - bbox.getSouth()));
    const pixelMp = (width * height) / 1_000_000;
    const layerCount = Object.values(want).filter(Boolean).length;
    const score = bboxArea * 85 + pixelMp * 16 + layerCount * 8;

    if (score < 30) {
      estimateBadge.className = 'badge text-bg-success';
      estimateBadge.textContent = 'Fast';
      estimateText.textContent = `Light export (~${score.toFixed(1)}).`;
    } else if (score < 75) {
      estimateBadge.className = 'badge text-bg-warning';
      estimateBadge.textContent = 'Moderate';
      estimateText.textContent = `Might take a while (~${score.toFixed(1)}). Consider reducing area or size.`;
    } else {
      estimateBadge.className = 'badge text-bg-danger';
      estimateBadge.textContent = 'Heavy';
      estimateText.textContent = `High load (~${score.toFixed(1)}). Reduce map extent/output dimensions for better reliability.`;
    }
  }

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

  async function executeExport(options = {}) {
    if (isExporting) return;

    const btn = document.getElementById('btnExport');
    const oldHTML = btn.innerHTML;

    isExporting = true;
    exportAbortController = new AbortController();
    exportStartedAt = Date.now();

    pageBusy.classList.remove('d-none');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Exporting…';

    resetProgressPanel();
    startElapsedTimer();

    try {
      stageIndex = 1;
      setProgress(8, 'Reading export options');
      logProgress('Reading export settings');
      const { width, height, want, colors, roadSubTypeColors } = options.overrideSelections || getSelections();
      const bbox = frameApi.getActiveBBox();
      const cacheKey = buildCacheKey({ bbox, want, width, height });

      stageIndex = 2;
      setProgress(20, 'Fetching data from Overpass', { indeterminate: true });

      let elements = overpassCache.get(cacheKey);
      if (elements) {
        logProgress(`Using cached Overpass data (${elements.length} elements)`);
      } else {
        logProgress('Requesting OSM features from Overpass API');
        elements = await fetchElementsForBBox(bbox, want, {
          signal: exportAbortController.signal,
          onAttempt: ({ endpoint, index, total }) => {
            logProgress(`Overpass endpoint ${index + 1}/${total}: ${endpoint}`);
          }
        });
        overpassCache.set(cacheKey, elements);
        if (overpassCache.size > 5) {
          const firstKey = overpassCache.keys().next().value;
          overpassCache.delete(firstKey);
        }
      }

      stageIndex = 3;
      setProgress(35, `Building vector layers from ${elements.length} features`);
      logProgress(`Fetched ${elements.length} elements`);

      const { svgStr, fileName } = buildSVG({
        width,
        height,
        bbox,
        elements,
        want,
        colors,
        roadSubTypeColors,
        clipToFrame: frameApi.isFrameActive(),
        cancelSignal: exportAbortController.signal,
        onProgress: ({ percent, label }) => {
          const mapped = 35 + Math.round((percent / 100) * 55);
          setProgress(mapped, label);
          logProgress(label);
        }
      });

      stageIndex = 4;
      setProgress(93, 'Preparing download');
      logProgress('Preparing SVG download');
      downloadSVG(svgStr, fileName);

      stageIndex = 5;
      setProgress(100, 'Export completed');
      logProgress(`Export completed in ${getElapsedSec()}s`);

      lastExportRequest = { width, height, want, colors };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      setProgress(100, msg === 'Export was canceled' ? 'Export canceled' : 'Export failed');
      logProgress(msg, msg === 'Export was canceled' ? 'warning' : 'error');
      showError(`Export failed: ${msg}`);
      lastExportRequest = options.overrideSelections || getSelections();
    } finally {
      stopElapsedTimer();
      pageBusy.classList.add('d-none');
      btn.disabled = false;
      btn.innerHTML = oldHTML;
      exportAbortController = null;
      isExporting = false;
    }
  }

  document.getElementById('btnPreview').addEventListener('click', async () => {
    openPreviewBusy();
    try {
      const { width, height, want, colors, roadSubTypeColors } = getSelections();
      const bbox = frameApi.getActiveBBox();
      const elements = await fetchElementsForBBox(bbox, want);
      const { svgStr, fileName } = buildSVG({
        width,
        height,
        bbox,
        elements,
        want,
        colors,
        roadSubTypeColors,
        clipToFrame: frameApi.isFrameActive(),
        onProgress: null
      });
      showPreviewSvg(svgStr, fileName);
    } catch (e) {
      previewBusy.innerHTML = `<div class="text-muted">Failed to generate SVG. ${e && e.message ? e.message : ''}</div>`;
    }
  });

  document.getElementById('btnExport').addEventListener('click', () => executeExport());

  btnCancelExport.addEventListener('click', () => {
    if (!exportAbortController) return;
    exportAbortController.abort();
    logProgress('Cancel requested by user', 'warning');
  });

  btnRetryExport.addEventListener('click', () => {
    if (!lastExportRequest) return;
    clearError();
    executeExport({ overrideSelections: lastExportRequest });
  });

  btnSnapFrame.addEventListener('click', () => {
    frameApi.snapFrameToViewport();
    updateFrameInfo();
    updateExportEstimate();
  });

  btnResetFrame.addEventListener('click', () => {
    frameApi.resetFrame();
    updateFrameInfo();
    updateExportEstimate();
  });

  [
    'w',
    'h',
    'chkMajorRoads',
    'chkMinorRoads',
    'chkWater',
    'chkParks',
    'chkBuildings'
  ].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateExportEstimate);
    document.getElementById(id).addEventListener('change', updateExportEstimate);
  });

  const overridePairs = [
    ['ovrMotorway', 'colMotorway'],
    ['ovrTrunk', 'colTrunk'],
    ['ovrPrimary', 'colPrimary'],
    ['ovrSecondary', 'colSecondary'],
    ['ovrTertiary', 'colTertiary'],
    ['ovrLocal', 'colLocal']
  ];
  overridePairs.forEach(([toggleId, colorId]) => {
    const toggleEl = document.getElementById(toggleId);
    const colorEl = document.getElementById(colorId);
    const syncState = () => {
      colorEl.disabled = !toggleEl.checked;
      updateExportEstimate();
    };
    toggleEl.addEventListener('change', syncState);
    colorEl.addEventListener('input', updateExportEstimate);
    syncState();
  });

  document.getElementById('btnToggleFrame').addEventListener('click', () => {
    setTimeout(() => {
      updateFrameInfo();
      updateExportEstimate();
    }, 0);
  });

  map.on('moveend', () => {
    updateFrameInfo();
    updateExportEstimate();
  });

  updateFrameInfo();
  updateExportEstimate();
}

function bootstrapApp() {
  initFooterDate();
  const map = initMap();
  initSearch(map);
  const frameApi = initFrameControls(map);
  initPreviewExport(map, frameApi);
}

bootstrapApp();
