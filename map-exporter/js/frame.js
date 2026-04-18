export function initFrameControls(map) {
  let frame = null;
  let handleNW = null;
  let handleSE = null;
  let handleMID = null;

  const elNW = document.createElement('div');
  elNW.className = 'handle nw';
  const elSE = document.createElement('div');
  elSE.className = 'handle se';
  const elMID = document.createElement('div');
  elMID.className = 'handle mid';

  function midOf(a, b) {
    return { lng: (a[0] + b[0]) / 2, lat: (a[1] + b[1]) / 2 };
  }

  function clamp(ll) {
    return [ll.lng, ll.lat];
  }

  function drawFrame() {
    if (!frame) return;

    const coords = [
      frame.nw,
      [frame.se[0], frame.nw[1]],
      frame.se,
      [frame.nw[0], frame.se[1]],
      frame.nw
    ];

    const data = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }]
    };

    if (!map.getSource('frame-src')) {
      map.addSource('frame-src', { type: 'geojson', data });
      map.addLayer({
        id: 'frame-line',
        type: 'line',
        source: 'frame-src',
        paint: { 'line-color': '#ff6d00', 'line-width': 2.5, 'line-dasharray': [2, 2] }
      });
    } else {
      map.getSource('frame-src').setData(data);
    }

    if (!handleNW) {
      handleNW = new maplibregl.Marker({ element: elNW, draggable: true }).setLngLat(frame.nw).addTo(map);
      handleSE = new maplibregl.Marker({ element: elSE, draggable: true }).setLngLat(frame.se).addTo(map);
      handleMID = new maplibregl.Marker({ element: elMID, draggable: true }).setLngLat(midOf(frame.nw, frame.se)).addTo(map);

      handleNW.on('drag', () => {
        frame.nw = clamp(handleNW.getLngLat());
        drawFrame();
      });
      handleSE.on('drag', () => {
        frame.se = clamp(handleSE.getLngLat());
        drawFrame();
      });
      handleMID.on('drag', () => {
        const mid = clamp(handleMID.getLngLat());
        const dx = mid[0] - (frame.nw[0] + frame.se[0]) / 2;
        const dy = mid[1] - (frame.nw[1] + frame.se[1]) / 2;
        frame.nw = [frame.nw[0] + dx, frame.nw[1] + dy];
        frame.se = [frame.se[0] + dx, frame.se[1] + dy];
        handleNW.setLngLat(frame.nw);
        handleSE.setLngLat(frame.se);
        handleMID.setLngLat(midOf(frame.nw, frame.se));
        drawFrame();
      });
    } else {
      handleNW.setLngLat(frame.nw);
      handleSE.setLngLat(frame.se);
      handleMID.setLngLat(midOf(frame.nw, frame.se));
    }
  }

  function addFrame() {
    const b = map.getBounds();
    const padLng = (b.getEast() - b.getWest()) * 0.15;
    const padLat = (b.getNorth() - b.getSouth()) * 0.15;
    frame = {
      nw: [b.getWest() + padLng, b.getNorth() - padLat],
      se: [b.getEast() - padLng, b.getSouth() + padLat]
    };
    drawFrame();
  }

  function setFrameFromBounds(bounds) {
    const padLng = (bounds.getEast() - bounds.getWest()) * 0.15;
    const padLat = (bounds.getNorth() - bounds.getSouth()) * 0.15;
    frame = {
      nw: [bounds.getWest() + padLng, bounds.getNorth() - padLat],
      se: [bounds.getEast() - padLng, bounds.getSouth() + padLat]
    };
    drawFrame();
  }

  function snapFrameToViewport() {
    if (!frame) {
      addFrame();
      return;
    }
    setFrameFromBounds(map.getBounds());
  }

  function resetFrame() {
    if (!frame) return;
    setFrameFromBounds(map.getBounds());
  }

  function removeFrame() {
    frame = null;
    if (map.getLayer('frame-line')) map.removeLayer('frame-line');
    if (map.getSource('frame-src')) map.removeSource('frame-src');

    if (handleNW) {
      handleNW.remove();
      handleNW = null;
    }
    if (handleSE) {
      handleSE.remove();
      handleSE = null;
    }
    if (handleMID) {
      handleMID.remove();
      handleMID = null;
    }
  }

  function getActiveBBox() {
    if (!frame) return map.getBounds();

    const west = Math.min(frame.nw[0], frame.se[0]);
    const east = Math.max(frame.nw[0], frame.se[0]);
    const south = Math.min(frame.se[1], frame.nw[1]);
    const north = Math.max(frame.se[1], frame.nw[1]);

    return {
      getWest: () => west,
      getEast: () => east,
      getSouth: () => south,
      getNorth: () => north
    };
  }

  function getFrameInfo() {
    if (!frame) return null;
    const west = Math.min(frame.nw[0], frame.se[0]);
    const east = Math.max(frame.nw[0], frame.se[0]);
    const south = Math.min(frame.se[1], frame.nw[1]);
    const north = Math.max(frame.se[1], frame.nw[1]);
    return {
      west,
      east,
      south,
      north,
      widthDeg: east - west,
      heightDeg: north - south
    };
  }

  document.getElementById('btnToggleFrame').addEventListener('click', () => {
    if (frame) removeFrame();
    else addFrame();
  });

  map.on('move', () => {
    if (frame) drawFrame();
  });

  return {
    getActiveBBox,
    getFrameInfo,
    resetFrame,
    snapFrameToViewport,
    isFrameActive: () => !!frame
  };
}
