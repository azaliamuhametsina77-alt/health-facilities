const DATA_FILES = {
  states: './sudan_adm1_ru.geojson',
  stateLabels: './sudan_adm1_ru_label_points.geojson',
  points: './health_facilities_sudan_points.geojson'
};

const TYPE_META = {
  'аптека': { label: 'Аптека', color: '#6F8FA6'},
  'больница': { label: 'Больница', color: '#A05A5A'},
  'клиника': { label: 'Клиника', color: '#B08A57'}
};

const state = {
  hoveredPointId: null,
  tooltipFeatureId: null
};

const tooltipEl = document.getElementById('tooltip');
const statusEl = document.getElementById('status');

let map;

function setStatus(message, hide = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('is-hidden', hide);
}

function normalizeType(value) {
  const raw = String(value || '').trim().toLowerCase();

  if (raw === 'pharmacy' || raw === 'аптека') return 'аптека';
  if (raw === 'hospital' || raw === 'больница') return 'больница';
  if (raw === 'clinic' || raw === 'клиника') return 'клиника';

  return 'клиника';
}

function createMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#0a0d12'
      }
    }
  ]
},
    center: [30.3, 14.2],
    zoom: 4.35,
    minZoom: 3,
    maxZoom: 12,
    attributionControl: false,
    dragRotate: false,
    touchZoomRotate: true
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function buildBounds(geojson) {
  const bounds = new maplibregl.LngLatBounds();
  geojson.features.forEach((feature) => {
    const geom = feature.geometry;
    const parts = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    parts.forEach((poly) => {
      poly.forEach((ring) => {
        ring.forEach(([lng, lat]) => bounds.extend([lng, lat]));
      });
    });
  });
  return bounds;
}

function preparePoints(pointsGeoJSON) {
  return {
    ...pointsGeoJSON,
    features: pointsGeoJSON.features.map((feature, index) => ({
      ...feature,
      id: index,
      properties: {
        ...feature.properties,
        normalized_type: normalizeType(feature.properties.type)
      }
    }))
  };
}

function prepareStateLabels(labelsGeoJSON) {
  return {
    ...labelsGeoJSON,
    features: labelsGeoJSON.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        label: feature.properties.state_ru || feature.properties.state_en || ''
      }
    }))
  };
}

function installSources(statesGeoJSON, stateLabelsGeoJSON, pointsGeoJSON) {
  const statesWithIds = {
    ...statesGeoJSON,
    features: statesGeoJSON.features.map((feature, index) => ({ ...feature, id: index }))
  };

  map.addSource('states', {
    type: 'geojson',
    data: statesWithIds
  });

  map.addSource('state-labels', {
    type: 'geojson',
    data: stateLabelsGeoJSON
  });

  map.addSource('health-points', {
    type: 'geojson',
    data: pointsGeoJSON
  });

  return statesWithIds;
}

function typeColorExpression(defaultColorKey = 'color') {
  return [
    'match',
    ['get', 'normalized_type'],
    'аптека', TYPE_META['аптека'][defaultColorKey],
    'больница', TYPE_META['больница'][defaultColorKey],
    TYPE_META['клиника'][defaultColorKey]
  ];
}

function installLayers() {
  map.addLayer({
    id: 'states-fill',
    type: 'fill',
    source: 'states',
    paint: {
      'fill-color': '#12161b',
      'fill-opacity': 0.28
    }
  });

  map.addLayer({
    id: 'states-outline',
    type: 'line',
    source: 'states',
    paint: {
      'line-color': 'rgba(255,255,255,0.14)',
      'line-width': 1.0
    }
  });


  map.addLayer({
  id: 'state-labels',
  type: 'symbol',
  source: 'state-labels',
  minzoom: 3,
  layout: {
    'text-field': ['get', 'label'],
    'text-font': ['Montserrat Regular'],
    'text-size': 11,
    'text-allow-overlap': false,
    'text-ignore-placement': false,
    'text-anchor': 'center',
    'text-max-width': 8,
    'text-line-height': 1.05
  },
  paint: {
    'text-color': 'rgba(235, 241, 248, 0.84)',
    'text-halo-color': 'rgba(10, 13, 18, 0.96)',
    'text-halo-width': 1.6,
    'text-halo-blur': 0.3
  }
});

  map.addLayer({
  id: 'points',
  type: 'circle',
  source: 'health-points',
  paint: {
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      4, 5.5,
      6, 7,
      8, 8.5
    ],
    'circle-color': [
      'match',
      ['get', 'normalized_type'],
      'аптека', '#6F8FA6',
      'больница', '#A05A5A',
      'клиника', '#B08A57',
      '#B08A57'
    ],
    'circle-opacity': 1,
    'circle-stroke-width': 1.4,
    'circle-stroke-color': '#ffffff',
    'circle-blur': 0
  }
});

  map.addLayer({
    id: 'points-hitbox',
    type: 'circle',
    source: 'health-points',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 10, 6, 12, 8, 14],
      'circle-opacity': 0
    }
  });
}

function clearPointHover() {
  if (state.hoveredPointId !== null && map.getSource('health-points')) {
    map.setFeatureState({ source: 'health-points', id: state.hoveredPointId }, { hovered: false });
  }
  state.hoveredPointId = null;
}

function hideTooltip() {
  tooltipEl.classList.add('is-hidden');
  tooltipEl.setAttribute('aria-hidden', 'true');
  tooltipEl.textContent = '';
}

function showTooltip(feature, point) {
  const normalizedType = normalizeType(feature.properties.normalized_type || feature.properties.type);
  const meta = TYPE_META[normalizedType] || TYPE_META['клиника'];

  tooltipEl.textContent = meta.label;
  tooltipEl.style.setProperty('--dot-color', meta.color);
  tooltipEl.style.left = `${point.x}px`;
  tooltipEl.style.top = `${point.y}px`;
  tooltipEl.classList.remove('is-hidden');
  tooltipEl.setAttribute('aria-hidden', 'false');
}

function setHoveredPoint(feature, point) {
  if (!feature) return;

  if (state.hoveredPointId !== null && state.hoveredPointId !== feature.id) {
    clearPointHover();
  }

  if (state.hoveredPointId !== feature.id) {
    state.hoveredPointId = feature.id;
    map.setFeatureState({ source: 'health-points', id: feature.id }, { hovered: true });
  }

  state.tooltipFeatureId = feature.id;
  showTooltip(feature, point);
}

function installInteractions() {
  map.on('mouseenter', 'points-hitbox', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mousemove', 'points-hitbox', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    setHoveredPoint(feature, event.point);
  });

  map.on('mouseleave', 'points-hitbox', () => {
    map.getCanvas().style.cursor = '';
    clearPointHover();
    hideTooltip();
  });

  map.on('move', () => {
    if (state.tooltipFeatureId === null) return;
    hideTooltip();
    clearPointHover();
    state.tooltipFeatureId = null;
  });
}

async function init() {
  setStatus('Загрузка данных…');

  const [statesGeoJSON, stateLabelsGeoJSONRaw, pointsGeoJSONRaw] = await Promise.all([
    fetchJSON(DATA_FILES.states),
    fetchJSON(DATA_FILES.stateLabels),
    fetchJSON(DATA_FILES.points)
  ]);

  const stateLabelsGeoJSON = prepareStateLabels(stateLabelsGeoJSONRaw);
  const pointsGeoJSON = preparePoints(pointsGeoJSONRaw);

  createMap();

  map.on('load', () => {
    const statesWithIds = installSources(statesGeoJSON, stateLabelsGeoJSON, pointsGeoJSON);
    installLayers();

    const bounds = buildBounds(statesWithIds);
    map.fitBounds(bounds, {
      padding: { top: 44, right: 44, bottom: 44, left: 44 },
      duration: 0,
      maxZoom: 5.75
    });

    installInteractions();
    setStatus('Готово', true);
  });
}

window.addEventListener('resize', () => {
  if (map) map.resize();
});

init().catch((error) => {
  console.error(error);
  setStatus('Не удалось загрузить данные');
});
