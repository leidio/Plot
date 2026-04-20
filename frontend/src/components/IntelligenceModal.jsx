import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { lineString as turfLineString, buffer as turfBuffer, simplify as turfSimplify } from '@turf/turf';
import { Search, Check, Paperclip, Send, Plus, ChevronUp, Paintbrush, X } from 'lucide-react';
import { BRUSH_SELECTION_CONFIG, POLYGON_LOCK_ANIMATION } from './intelligenceMapConfig';

const PLACEHOLDER = 'Ask Plot to analyze the map or generate movements';

const INTEL_BRUSH_STROKE_SOURCE = 'plot-intel-brush-stroke';
const INTEL_BRUSH_STROKE_LAYER = 'plot-intel-brush-stroke-line';
const INTEL_OVERLAY_SOURCE = 'plot-intel-overlay-polygon';
const INTEL_OVERLAY_FILL = 'plot-intel-overlay-fill';
const INTEL_OVERLAY_OUTLINE = 'plot-intel-overlay-outline';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

function findFirstSymbolLayerId(mapInstance) {
  const style = mapInstance.getStyle();
  if (!style?.layers) return undefined;
  const layer = style.layers.find((l) => l.type === 'symbol');
  return layer?.id;
}

function metersPerPixelAtLatitude(latitude, zoom) {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
}

function distanceMeters(a, b) {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const q = s1 * s1 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Screen-space bounce: 0 → peak (negative “up”) → overshoot → 0. */
function bounceTranslateY(t, cfg) {
  const { peakPx, overshootPx } = cfg.translate;
  const { rise, fall, settle } = cfg.phases;
  const p1 = rise;
  const p2 = rise + fall;
  if (t <= 0 || t >= 1) return 0;
  if (t < p1) {
    return peakPx * smoothstep01(t / p1);
  }
  if (t < p2) {
    const u = easeOutCubic((t - p1) / (p2 - p1 || 1e-6));
    return peakPx + (overshootPx - peakPx) * u;
  }
  const u = easeOutCubic((t - p2) / (1 - p2 || 1e-6));
  return overshootPx * (1 - u);
}

/**
 * Mapbox Draw duplicates every style layer per GeoJSON source: `.cold` and `.hot`.
 * Layer ids are e.g. `plot-draw-polygon-fill.cold`, not `plot-draw-polygon-fill`.
 */
function getPlotDrawPolygonLayerTriples(mapInstance) {
  const fillBase = 'plot-draw-polygon-fill';
  const outlineBase = 'plot-draw-polygon-outline';
  const glowBase = 'plot-draw-polygon-glow';
  const triples = [];
  for (const suffix of ['.cold', '.hot']) {
    const fillId = `${fillBase}${suffix}`;
    if (mapInstance.getLayer?.(fillId)) {
      triples.push({
        fill: fillId,
        outline: `${outlineBase}${suffix}`,
        glow: `${glowBase}${suffix}`
      });
    }
  }
  if (triples.length === 0 && mapInstance.getLayer?.(fillBase)) {
    triples.push({ fill: fillBase, outline: outlineBase, glow: glowBase });
  }
  return triples;
}

function runPolygonLockAnimation(mapInstance) {
  const cfg = POLYGON_LOCK_ANIMATION;
  if (!cfg.enabled || !mapInstance) return;

  const layerTriples = getPlotDrawPolygonLayerTriples(mapInstance);
  if (layerTriples.length === 0) return;

  const sampleFill = layerTriples[0].fill;
  const sampleOutline = layerTriples[0].outline;
  const sampleGlow = layerTriples[0].glow;

  let baseFillOp = 0.12;
  let baseGlowOp = 0.35;
  let baseOutlineW = cfg.outlineWidth.basePx;
  let baseGlowW = 12;
  let baseGlowBlur = 4;
  try {
    const f = mapInstance.getPaintProperty(sampleFill, 'fill-opacity');
    const g = mapInstance.getPaintProperty(sampleGlow, 'line-opacity');
    const w = mapInstance.getPaintProperty(sampleOutline, 'line-width');
    const gw = mapInstance.getPaintProperty(sampleGlow, 'line-width');
    const gb = mapInstance.getPaintProperty(sampleGlow, 'line-blur');
    if (typeof f === 'number') baseFillOp = f;
    if (typeof g === 'number') baseGlowOp = g;
    if (typeof w === 'number') baseOutlineW = w;
    if (typeof gw === 'number') baseGlowW = gw;
    if (typeof gb === 'number') baseGlowBlur = gb;
  } catch (_) {
    return;
  }

  const anchor = cfg.translateAnchor || 'viewport';
  try {
    for (const { fill, outline, glow } of layerTriples) {
      mapInstance.setPaintProperty(fill, 'fill-translate-anchor', anchor);
      if (mapInstance.getLayer(outline)) {
        mapInstance.setPaintProperty(outline, 'line-translate-anchor', anchor);
      }
      if (mapInstance.getLayer(glow)) {
        mapInstance.setPaintProperty(glow, 'line-translate-anchor', anchor);
      }
    }
  } catch (_) {}

  const { basePx, peakPx } = cfg.outlineWidth;
  const fillMin = cfg.fillOpacity.minMult;
  const fillPeak = cfg.fillOpacity.peakMult;
  const glowMin = cfg.glowOpacity.minMult;
  const glowPeak = cfg.glowOpacity.peakMult;
  const glowCfg = cfg.glowLine || {};
  const peakGlowW = typeof glowCfg.peakWidthPx === 'number' ? glowCfg.peakWidthPx : 32;
  const peakGlowBlur = typeof glowCfg.peakBlurPx === 'number' ? glowCfg.peakBlurPx : 18;
  const echoDelay = typeof glowCfg.echoDelay === 'number' ? glowCfg.echoDelay : 0.12;
  const echoStrength = typeof glowCfg.echoStrength === 'number' ? glowCfg.echoStrength : 0.5;
  const echoSpan = typeof glowCfg.echoSpan === 'number' ? glowCfg.echoSpan : 0.5;

  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let rafId = null;

  function frame(now) {
    const t = Math.min(1, (now - start) / cfg.durationMs);
    const ty = bounceTranslateY(t, cfg);
    const hullMain = Math.sin(Math.min(1, t / 0.4) * Math.PI);
    const echoT = Math.max(0, t - echoDelay);
    const hullEcho = echoStrength * Math.sin(Math.min(1, echoT / echoSpan) * Math.PI);
    const glowHull = Math.min(1.25, hullMain + hullEcho);

    const outlineW = basePx + (peakPx - basePx) * hullMain;
    const fillMult = fillMin + (fillPeak - fillMin) * hullMain;
    const glowMult = glowMin + (glowPeak - glowMin) * glowHull;
    const glowW = baseGlowW + (peakGlowW - baseGlowW) * glowHull;
    const glowBlur = baseGlowBlur + (peakGlowBlur - baseGlowBlur) * glowHull;

    try {
      for (const { fill, outline, glow } of layerTriples) {
        mapInstance.setPaintProperty(fill, 'fill-translate', [0, ty]);
        mapInstance.setPaintProperty(fill, 'fill-opacity', baseFillOp * fillMult);
        if (mapInstance.getLayer(outline)) {
          mapInstance.setPaintProperty(outline, 'line-translate', [0, ty]);
          mapInstance.setPaintProperty(outline, 'line-width', outlineW);
        }
        if (mapInstance.getLayer(glow)) {
          mapInstance.setPaintProperty(glow, 'line-translate', [0, ty]);
          mapInstance.setPaintProperty(glow, 'line-width', glowW);
          mapInstance.setPaintProperty(glow, 'line-blur', glowBlur);
          mapInstance.setPaintProperty(glow, 'line-opacity', baseGlowOp * glowMult);
        }
      }
    } catch (_) {
      rafId = null;
      return;
    }

    if (t < 1) {
      rafId = requestAnimationFrame(frame);
    } else {
      try {
        for (const { fill, outline, glow } of layerTriples) {
          mapInstance.setPaintProperty(fill, 'fill-translate', [0, 0]);
          mapInstance.setPaintProperty(fill, 'fill-opacity', baseFillOp);
          if (mapInstance.getLayer(outline)) {
            mapInstance.setPaintProperty(outline, 'line-translate', [0, 0]);
            mapInstance.setPaintProperty(outline, 'line-width', baseOutlineW);
          }
          if (mapInstance.getLayer(glow)) {
            mapInstance.setPaintProperty(glow, 'line-translate', [0, 0]);
            mapInstance.setPaintProperty(glow, 'line-width', baseGlowW);
            mapInstance.setPaintProperty(glow, 'line-blur', baseGlowBlur);
            mapInstance.setPaintProperty(glow, 'line-opacity', baseGlowOp);
          }
        }
      } catch (_) {}
      rafId = null;
    }
  }

  rafId = requestAnimationFrame(frame);
  return () => {
    if (rafId != null) cancelAnimationFrame(rafId);
  };
}

function ensureIntelOverlayInfrastructure(mapInstance) {
  if (!mapInstance.getSource(INTEL_OVERLAY_SOURCE)) {
    mapInstance.addSource(INTEL_OVERLAY_SOURCE, { type: 'geojson', data: EMPTY_FC });
  }
  const beforeId = findFirstSymbolLayerId(mapInstance);
  if (!mapInstance.getLayer(INTEL_OVERLAY_FILL)) {
    mapInstance.addLayer(
      {
        id: INTEL_OVERLAY_FILL,
        type: 'fill',
        source: INTEL_OVERLAY_SOURCE,
        paint: {
          'fill-color': '#6FFFCA',
          'fill-opacity': 0.14
        }
      },
      beforeId
    );
  }
  if (!mapInstance.getLayer(INTEL_OVERLAY_OUTLINE)) {
    mapInstance.addLayer(
      {
        id: INTEL_OVERLAY_OUTLINE,
        type: 'line',
        source: INTEL_OVERLAY_SOURCE,
        paint: {
          'line-color': '#22c55e',
          'line-width': 2
        }
      },
      beforeId
    );
  }
}

function ensureBrushStrokeLayer(mapInstance, brushPx) {
  if (!mapInstance.getSource(INTEL_BRUSH_STROKE_SOURCE)) {
    mapInstance.addSource(INTEL_BRUSH_STROKE_SOURCE, { type: 'geojson', data: EMPTY_FC });
  }
  const beforeId = findFirstSymbolLayerId(mapInstance);
  if (!mapInstance.getLayer(INTEL_BRUSH_STROKE_LAYER)) {
    mapInstance.addLayer(
      {
        id: INTEL_BRUSH_STROKE_LAYER,
        type: 'line',
        source: INTEL_BRUSH_STROKE_SOURCE,
        paint: {
          'line-color': BRUSH_SELECTION_CONFIG.previewLineColor,
          'line-width': Math.max(2, brushPx * 2),
          'line-opacity': BRUSH_SELECTION_CONFIG.previewLineOpacity,
          'line-blur': Math.max(0.5, brushPx * BRUSH_SELECTION_CONFIG.previewLineBlurRatio)
        }
      },
      beforeId
    );
  } else {
    mapInstance.setPaintProperty(INTEL_BRUSH_STROKE_LAYER, 'line-width', Math.max(2, brushPx * 2));
    mapInstance.setPaintProperty(
      INTEL_BRUSH_STROKE_LAYER,
      'line-blur',
      Math.max(0.5, brushPx * BRUSH_SELECTION_CONFIG.previewLineBlurRatio)
    );
  }
}

function setBrushStrokeGeoJSON(mapInstance, coordinates) {
  const src = mapInstance.getSource(INTEL_BRUSH_STROKE_SOURCE);
  if (!src) return;
  if (!coordinates.length) {
    src.setData(EMPTY_FC);
    return;
  }
  if (coordinates.length === 1) {
    src.setData(turfLineString([coordinates[0], coordinates[0]]));
    return;
  }
  src.setData(turfLineString(coordinates));
}

/** Avoid ~0.0 km² for small selections; use m² when km² would round to 0 at one decimal. */
function formatPolygonAreaForDisplay(areaKm2) {
  if (areaKm2 == null || !Number.isFinite(areaKm2)) return null;
  const kmOneDecimal = Number(areaKm2.toFixed(1));
  const useSquareMeters = areaKm2 < 0.01 || (areaKm2 < 1 && kmOneDecimal === 0);
  if (useSquareMeters) {
    const m2 = Math.round(areaKm2 * 1_000_000);
    const body = m2 < 1 ? '<1' : m2.toLocaleString();
    return `~${body} m²`;
  }
  if (areaKm2 >= 50) {
    return `~${Math.round(areaKm2).toLocaleString()} km²`;
  }
  return `~${areaKm2.toFixed(1)} km²`;
}

const IntelligenceModal = ({
  mapRef,
  mapReady,
  apiCall,
  isDark = false,
  onClose,
  onCreateMovementFromAI,
  onIntelligenceLoadingChange
}) => {
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [selectionMode, setSelectionMode] = useState('draw'); // 'draw' | 'brush' | 'click'
  const [prompt, setPrompt] = useState('');
  const [selection, setSelection] = useState(null); // { type: 'Point'|'Polygon', coordinates }
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { areaSummary?, suggestions?, movements? }
  const [showSelectionBubble, setShowSelectionBubble] = useState(false);
  const [polygonCenterLabel, setPolygonCenterLabel] = useState('');
  const [polygonAreaKm2, setPolygonAreaKm2] = useState(null);
  const drawRef = useRef(null);
  const drawEventHandlersRef = useRef(null);
  const deleteMarkerRef = useRef(null);
  const clickHandlerRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceRef = useRef(null);
  const promptInputRef = useRef(null);
  const brushPaintingRef = useRef(false);
  const brushPointsRef = useRef([]);
  const [brushRadiusPx, setBrushRadiusPx] = useState(BRUSH_SELECTION_CONFIG.defaultBrushRadiusPx);
  const [mapZoom, setMapZoom] = useState(0);
  /** Bumps when Draw is torn down while still in draw mode (e.g. Start over) so the draw effect re-mounts the control. */
  const [drawRemountEpoch, setDrawRemountEpoch] = useState(0);

  const hasSelection = selection && selection.coordinates;
  const hasPolygonSelection = selection?.type === 'Polygon';
  const showSelectionSetup = !hasSelection;
  const [activePane, setActivePane] = useState('chat'); // 'chat' | 'threads'
  const [isCollapsed, setIsCollapsed] = useState(false);

  function removePolygonDeleteMarker() {
    try {
      deleteMarkerRef.current?.remove();
    } catch (_) {}
    deleteMarkerRef.current = null;
    const container = mapRef?.current?.getContainer?.();
    if (container) {
      container.querySelectorAll('[data-plot-intel-polygon-remove="1"]').forEach((el) => {
        const markerEl = el.closest('.mapboxgl-marker');
        markerEl?.remove();
      });
    }
  }

  function getPolygonCenter(coordinates) {
    if (!Array.isArray(coordinates) || !coordinates[0]?.length) return null;
    const ring = coordinates[0];
    let minLng = ring[0][0];
    let maxLng = ring[0][0];
    let minLat = ring[0][1];
    let maxLat = ring[0][1];
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  }

  function getPolygonCentroid(coordinates) {
    if (!Array.isArray(coordinates) || !coordinates[0]?.length) return null;
    const ring = coordinates[0];
    let sumLng = 0;
    let sumLat = 0;
    let count = 0;
    for (const point of ring) {
      const lng = Array.isArray(point) ? point[0] : undefined;
      const lat = Array.isArray(point) ? point[1] : undefined;
      if (typeof lng === 'number' && typeof lat === 'number') {
        sumLng += lng;
        sumLat += lat;
        count += 1;
      }
    }
    if (count === 0) return null;
    return [sumLng / count, sumLat / count];
  }

  // Approximate polygon area in square kilometers using a simple projected shoelace formula.
  function getPolygonAreaKm2(coordinates) {
    if (!Array.isArray(coordinates) || !coordinates[0]?.length) return null;
    const ring = coordinates[0];
    if (ring.length < 3) return null;

    const R = 6371000; // Earth radius in meters
    // Use average latitude for projection
    let latSum = 0;
    let n = 0;
    for (const pt of ring) {
      if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
        latSum += (pt[1] * Math.PI) / 180;
        n += 1;
      }
    }
    if (n === 0) return null;
    const lat0 = latSum / n;

    const projected = ring.map(([lng, lat]) => {
      const lngRad = (lng * Math.PI) / 180;
      const latRad = (lat * Math.PI) / 180;
      const x = R * lngRad * Math.cos(lat0);
      const y = R * latRad;
      return [x, y];
    });

    let area = 0;
    for (let i = 0; i < projected.length - 1; i++) {
      const [x1, y1] = projected[i];
      const [x2, y2] = projected[i + 1];
      area += x1 * y2 - x2 * y1;
    }
    // close ring
    const [x1, y1] = projected[projected.length - 1];
    const [x2, y2] = projected[0];
    area += x1 * y2 - x2 * y1;

    const areaM2 = Math.abs(area) / 2;
    return areaM2 / 1_000_000; // km^2
  }

  function formatCenterLabel(features) {
    const all = [];
    for (const feature of features || []) {
      all.push(feature);
      if (Array.isArray(feature.context)) all.push(...feature.context);
    }

    function pick(type) {
      const match = all.find((item) => {
        const hasType = Array.isArray(item?.place_type) && item.place_type.includes(type);
        const hasPrefix = item?.id?.startsWith(`${type}.`);
        return hasType || hasPrefix;
      });
      return match?.text || match?.place_name || '';
    }

    const neighborhood = pick('neighborhood') || pick('locality') || pick('district');
    const city = pick('place');
    const region = pick('region');
    if (neighborhood && city) return `${neighborhood}, ${city}`;
    if (city && region) return `${city}, ${region}`;
    if (city) return city;
    if (region) return region;
    return features?.[0]?.place_name || features?.[0]?.text || '';
  }

  function clearDrawPolygon() {
    try {
      const draw = drawRef.current;
      if (draw) {
        const features = draw.getAll()?.features || [];
        const polygonIds = features
          .filter((feature) => feature.geometry?.type === 'Polygon')
          .map((feature) => feature.id)
          .filter(Boolean);
        if (polygonIds.length > 0) {
          draw.delete(polygonIds);
        }
        draw.changeMode('draw_polygon');
      }
    } catch (_) {}
    setSelection(null);
    setPolygonCenterLabel('');
    setPolygonAreaKm2(null);
    removePolygonDeleteMarker();
    try {
      mapRef?.current?.getSource(INTEL_OVERLAY_SOURCE)?.setData(EMPTY_FC);
    } catch (_) {}
  }

  function forcePolygonDrawMode() {
    try {
      drawRef.current?.changeMode('draw_polygon');
    } catch (_) {}
    requestAnimationFrame(() => {
      try {
        drawRef.current?.changeMode('draw_polygon');
      } catch (_) {}
    });
    setTimeout(() => {
      try {
        drawRef.current?.changeMode('draw_polygon');
      } catch (_) {}
    }, 120);
  }

  function upsertPolygonDeleteMarker(polygonCoordinates) {
    const mapInstance = mapRef?.current;
    if (!mapInstance) return;
    const center = getPolygonCenter(polygonCoordinates);
    if (!center) return;

    removePolygonDeleteMarker();
    const button = document.createElement('button');
    button.type = 'button';
    button.style.borderRadius = '9999px';
    button.style.background = '#ffffff';
    button.style.border = '1px solid #d1d5db';
    button.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18)';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.cursor = 'pointer';
    button.style.padding = '4px 10px';
    button.style.fontSize = '11px';
    button.style.fontWeight = '500';
    button.style.color = '#111827';
    button.style.whiteSpace = 'nowrap';
    button.setAttribute('aria-label', 'Remove polygon');
    button.setAttribute('data-plot-intel-polygon-remove', '1');

    button.innerHTML = `
      <span style="display:flex;align-items:center;gap:6px;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6L18 18" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M18 6L6 18" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/>
        </svg>
        <span>Remove</span>
      </span>
    `;
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearDrawPolygon();
    };

    deleteMarkerRef.current = new mapboxgl.Marker({ element: button, anchor: 'bottom' })
      .setLngLat(center)
      .addTo(mapInstance);
  }

  const fetchLocationSuggestions = (query) => {
    if (!query || query.length < 2) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await axios.get(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
          {
            params: {
              access_token: mapboxgl.accessToken,
              limit: 5,
              types: 'place,locality,neighborhood,address,postcode'
            }
          }
        );
        setLocationSuggestions(res.data.features || []);
        setShowLocationSuggestions(true);
      } catch (e) {
        setLocationSuggestions([]);
      }
    }, 250);
  };

  const handleLocationSelect = (feature) => {
    const [lng, lat] = feature.center;
    if (mapRef?.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 12 });
    }
    setLocationQuery(feature.place_name || '');
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  };

  const clearSelection = () => {
    setSelection(null);
    setPolygonCenterLabel('');
    setPolygonAreaKm2(null);
    if (selectionMode === 'draw' || selectionMode === 'click' || selectionMode === 'brush') {
      setShowSelectionBubble(true);
    }
    removePolygonDeleteMarker();
    brushPaintingRef.current = false;
    brushPointsRef.current = [];
    if (mapRef?.current) {
      const map = mapRef.current;
      try {
        map.getSource(INTEL_BRUSH_STROKE_SOURCE)?.setData(EMPTY_FC);
      } catch (_) {}
      try {
        map.getSource(INTEL_OVERLAY_SOURCE)?.setData(EMPTY_FC);
      } catch (_) {}
      try {
        map.dragPan?.enable();
      } catch (_) {}
    }
    if (mapRef?.current && drawRef.current) {
      try {
        mapRef.current.removeControl(drawRef.current);
      } catch (_) {}
      drawRef.current = null;
      if (selectionMode === 'draw') {
        setDrawRemountEpoch((n) => n + 1);
      }
    }
    if (clickHandlerRef.current && mapRef?.current) {
      mapRef.current.getCanvas().style.cursor = '';
    }
    clickHandlerRef.current = null;
  };

  const handleSelectionDone = () => {
    setShowSelectionBubble(false);
  };

  const loadThreads = async () => {
    setThreadsLoading(true);
    try {
      const response = await apiCall('get', '/ai/intelligence/threads');
      setThreads(response.data?.threads || []);
    } catch (_) {
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  };

  const startNewThread = async () => {
    try {
      const response = await apiCall('post', '/ai/intelligence/threads', {
        selection: hasSelection ? selection : null
      });
      const thread = response.data?.thread;
      if (!thread?.id) return;
      setActiveThreadId(thread.id);
      setThreadMessages([]);
      setResult(null);
      setThreads((prev) => {
        const without = prev.filter((item) => item.id !== thread.id);
        return [{ id: thread.id, title: thread.title || 'New intelligence session', createdAt: thread.createdAt, updatedAt: thread.updatedAt, messageCount: 0 }, ...without];
      });
    } catch (_) {}
  };

  const openThread = async (threadId) => {
    if (!threadId) return;
    try {
      const response = await apiCall('get', `/ai/intelligence/threads/${threadId}`);
      const thread = response.data?.thread;
      if (!thread) return;
      setActiveThreadId(thread.id);
      setThreadMessages(thread.messages || []);
      setSelection(thread.selection || null);
      const last = thread.messages?.[thread.messages.length - 1];
      setResult(last?.response || null);
    } catch (_) {}
  };

  function summarizeThreadResponse(response) {
    if (!response) return '';
    if (typeof response.answer === 'string' && response.answer.trim()) return response.answer.trim();
    if (typeof response.areaSummary === 'string' && response.areaSummary.trim()) return response.areaSummary.trim();
    if (Array.isArray(response.suggestions) && response.suggestions[0]?.title) return response.suggestions[0].title;
    if (Array.isArray(response.movements) && response.movements[0]?.name) return response.movements[0].name;
    return 'Response saved';
  }

  useEffect(() => {
    onIntelligenceLoadingChange?.(loading);
  }, [loading, onIntelligenceLoadingChange]);

  useEffect(() => {
    return () => {
      onIntelligenceLoadingChange?.(false);
    };
  }, [onIntelligenceLoadingChange]);

  useEffect(() => {
    if (selection?.type !== 'Polygon') {
      removePolygonDeleteMarker();
    }
  }, [selection]);

  useEffect(() => {
    let cancelled = false;
    const initThreads = async () => {
      await loadThreads();
      if (!cancelled) {
        await startNewThread();
      }
    };
    initThreads();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a new place selection is created after we've already been talking,
  // automatically start a fresh thread so each session is tied to a single place.
  useEffect(() => {
    if (!selection) return;
    if (!activeThreadId) return;
    if (threadMessages.length === 0) return;
    // Fire-and-forget; errors are handled inside startNewThread
    startNewThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const handleStartOver = async () => {
    clearSelection();
    setPrompt('');
    setResult(null);
    setThreadMessages([]);
    setActivePane('chat');
    await startNewThread();
  };

  useEffect(() => {
    if (!mapReady || !mapRef?.current || selectionMode !== 'draw') return;
    const mapInstance = mapRef.current;
    if (drawRef.current) return;

    const addDraw = () => {
      if (drawRef.current) return;
      try {
        const style = mapInstance.getStyle?.();
        if (!style?.sources) return;
        const draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: {},
          styles: [
            // Polygon fill - light green
            {
              id: 'plot-draw-polygon-fill',
              type: 'fill',
              filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
              paint: {
                'fill-color': '#6FFFCA',
                'fill-opacity': 0.12
              }
            },
            // Polygon glow outline (soft outer stroke)
            {
              id: 'plot-draw-polygon-glow',
              type: 'line',
              filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
              paint: {
                'line-color': '#6FFFCA',
                'line-width': 12,
                'line-opacity': 0.35,
                'line-blur': 4
              }
            },
            // Polygon outline - solid green line (sharp inner stroke)
            {
              id: 'plot-draw-polygon-outline',
              type: 'line',
              filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
              paint: {
                'line-color': '#22c55e',
                'line-width': 3
              }
            },
            // Line strings (during drawing)
            {
              id: 'plot-draw-line',
              type: 'line',
              filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
              paint: {
                'line-color': '#22c55e',
                'line-width': 3
              }
            },
            // Active vertices: keep a bold 4px stroke; smaller fill (radius) keeps overall node compact.
            {
              id: 'plot-draw-vertex-active',
              type: 'circle',
              filter: [
                'all',
                ['==', 'meta', 'vertex'],
                ['==', '$type', 'Point'],
                ['!=', 'mode', 'static']
              ],
              paint: {
                'circle-radius': 3,
                'circle-color': '#ffffff',
                'circle-stroke-color': '#000000',
                'circle-stroke-width': 4
              }
            },
            // Midpoints (edge handles; smaller than corners)
            {
              id: 'plot-draw-midpoint',
              type: 'circle',
              filter: [
                'all',
                ['==', 'meta', 'midpoint'],
                ['==', '$type', 'Point'],
                ['!=', 'mode', 'static']
              ],
              paint: {
                'circle-radius': 3,
                'circle-color': '#ffffff',
                'circle-stroke-color': '#22c55e',
                'circle-stroke-width': 1.5
              }
            }
          ]
        });
        mapInstance.addControl(draw, 'top-left');
        drawRef.current = draw;
        forcePolygonDrawMode();
        const onUpdate = () => {
          try {
            const features = draw.getAll();
            const polygon = features?.features?.find(f => f.geometry?.type === 'Polygon');
            if (polygon) {
              setSelection({ type: 'Polygon', coordinates: polygon.geometry.coordinates });
              upsertPolygonDeleteMarker(polygon.geometry.coordinates);
              setShowSelectionBubble(false);
            } else {
              setSelection(null);
              removePolygonDeleteMarker();
            }
          } catch (_) {}
        };
        const onCreate = () => {
          onUpdate();
          // Closing a polygon leaves Draw in simple_select with the feature selected, which shows
          // corner vertices. Deselect so only the outline/fill remains (user can click to edit again).
          try {
            draw.changeMode('simple_select', { featureIds: [] });
          } catch (_) {}
          // Run after Draw commits the closed polygon to the style, or the bounce won’t show.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => runPolygonLockAnimation(mapInstance));
          });
        };
        mapInstance.on('draw.create', onCreate);
        mapInstance.on('draw.update', onUpdate);
        mapInstance.on('draw.delete', onUpdate);
        drawEventHandlersRef.current = { map: mapInstance, onCreate, onUpdate };
      } catch (err) {
        console.error('Intelligence Draw init:', err);
      }
    };

    function tearDownDraw() {
      const h = drawEventHandlersRef.current;
      if (h?.map && h.onCreate) {
        try {
          h.map.off('draw.create', h.onCreate);
          h.map.off('draw.update', h.onUpdate);
          h.map.off('draw.delete', h.onUpdate);
        } catch (_) {}
      }
      drawEventHandlersRef.current = null;
      if (drawRef.current) {
        try {
          mapInstance.removeControl(drawRef.current);
        } catch (_) {}
        drawRef.current = null;
      }
      removePolygonDeleteMarker();
    }

    try {
      const style = mapInstance.getStyle?.();
      if (style?.sources) {
        addDraw();
      } else {
        mapInstance.once('load', addDraw);
        const t = setTimeout(addDraw, 500);
        return () => {
          clearTimeout(t);
          tearDownDraw();
        };
      }
    } catch (_) {}
    return tearDownDraw;
  }, [mapReady, selectionMode, mapRef, drawRemountEpoch]);

  useEffect(() => {
    if (selectionMode !== 'draw' || !showSelectionBubble || !drawRef.current) return;
    forcePolygonDrawMode();
  }, [selectionMode, showSelectionBubble, drawRemountEpoch]);

  useEffect(() => {
    if (!hasPolygonSelection || !selection?.coordinates) {
      setPolygonCenterLabel('');
      return;
    }
    const centroid = getPolygonCentroid(selection.coordinates);
    const bboxCenter = getPolygonCenter(selection.coordinates);
    const firstPoint = selection.coordinates?.[0]?.[0];
    const candidatePoints = [centroid, bboxCenter, firstPoint].filter(
      (point) => Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number'
    );
    if (candidatePoints.length === 0) {
      setPolygonCenterLabel('Location unavailable');
      return;
    }

    let cancelled = false;
    const lookupCenter = async () => {
      setPolygonCenterLabel('Locating...');
      for (const point of candidatePoints) {
        try {
          const [lng, lat] = point;
          const res = await axios.get(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`,
            {
              params: {
                access_token: mapboxgl.accessToken,
                language: 'en'
              }
            }
          );
          if (cancelled) return;
          const label = formatCenterLabel(res.data?.features || []);
          if (label) {
            setPolygonCenterLabel(label);
            return;
          }
        } catch (_) {}
      }
      if (!cancelled) setPolygonCenterLabel('Location unavailable');
    };

    // Compute approximate area immediately
    const areaKm2 = getPolygonAreaKm2(selection.coordinates);
    setPolygonAreaKm2(Number.isFinite(areaKm2) ? areaKm2 : null);

    lookupCenter();
    return () => {
      cancelled = true;
    };
  }, [hasPolygonSelection, selection]);

  useEffect(() => {
    if (!mapReady || !mapRef?.current || selectionMode !== 'click' || selection !== null) return;
    const mapInstance = mapRef.current;
    const handler = (e) => {
      try {
        const { lng, lat } = e.lngLat;
        setSelection({ type: 'Point', coordinates: [lng, lat] });
        setShowSelectionBubble(false);
        mapInstance.off('click', handler);
        const canvas = mapInstance.getCanvas?.();
        if (canvas) canvas.style.cursor = '';
        clickHandlerRef.current = null;
      } catch (_) {}
    };
    try {
      mapInstance.on('click', handler);
      const canvas = mapInstance.getCanvas?.();
      if (canvas) canvas.style.cursor = 'crosshair';
      clickHandlerRef.current = handler;
    } catch (_) {}
    return () => {
      try {
        mapInstance.off('click', handler);
        const canvas = mapInstance.getCanvas?.();
        if (canvas) canvas.style.cursor = '';
      } catch (_) {}
    };
  }, [mapReady, selectionMode, mapRef, selection]);

  useEffect(() => {
    if (!mapReady || !mapRef?.current) return undefined;
    const map = mapRef.current;
    const syncZoom = () => setMapZoom(map.getZoom());
    syncZoom();
    map.on('zoom', syncZoom);
    map.on('zoomend', syncZoom);
    return () => {
      map.off('zoom', syncZoom);
      map.off('zoomend', syncZoom);
    };
  }, [mapReady, mapRef]);

  useEffect(() => {
    const map = mapRef?.current;
    if (!mapReady || !map) return;
    try {
      if (!map.getStyle?.()?.sources) return;
      ensureIntelOverlayInfrastructure(map);
      const showOverlay = hasPolygonSelection && selectionMode !== 'draw';
      if (showOverlay && selection?.coordinates) {
        map.getSource(INTEL_OVERLAY_SOURCE).setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: selection.coordinates }
        });
      } else {
        map.getSource(INTEL_OVERLAY_SOURCE).setData(EMPTY_FC);
      }
    } catch (_) {}
  }, [mapReady, mapRef, hasPolygonSelection, selectionMode, selection]);

  useEffect(() => {
    if (!mapReady || !mapRef?.current || selectionMode !== 'brush') return undefined;
    const map = mapRef.current;
    const minZ = BRUSH_SELECTION_CONFIG.minZoom;
    if (!map.getStyle?.()?.sources) return undefined;

    ensureIntelOverlayInfrastructure(map);
    ensureBrushStrokeLayer(map, brushRadiusPx);

    function finalizeBrushStroke() {
      if (!brushPaintingRef.current) return;
      brushPaintingRef.current = false;
      try {
        map.dragPan.enable();
      } catch (_) {}

      const pts = brushPointsRef.current;
      brushPointsRef.current = [];
      setBrushStrokeGeoJSON(map, []);

      if (pts.length < 2) return;

      const line = turfLineString(pts);
      const z = map.getZoom();
      const lat = pts[0][1];
      const mPx = metersPerPixelAtLatitude(lat, z);
      const radiusMeters = brushRadiusPx * mPx;

      let poly;
      try {
        const buf = turfBuffer(line, radiusMeters, { units: 'meters', steps: 16 });
        poly = turfSimplify(buf, {
          tolerance: BRUSH_SELECTION_CONFIG.simplifyToleranceDeg,
          highQuality: true
        });
      } catch (err) {
        console.warn('Brush finalize:', err);
        return;
      }
      if (!poly?.geometry || poly.geometry.type !== 'Polygon') return;

      setSelection({ type: 'Polygon', coordinates: poly.geometry.coordinates });
      upsertPolygonDeleteMarker(poly.geometry.coordinates);
      setShowSelectionBubble(false);
    }

    function appendPoint(lngLat) {
      const pts = brushPointsRef.current;
      const p = [lngLat.lng, lngLat.lat];
      if (pts.length === 0) {
        pts.push(p);
        return;
      }
      const last = pts[pts.length - 1];
      if (distanceMeters(last, p) < BRUSH_SELECTION_CONFIG.strokeSampleMinMeters) return;
      pts.push(p);
    }

    function onMouseDown(e) {
      if (map.getZoom() < minZ) return;
      if (e.originalEvent?.button !== 0) return;
      if (e.originalEvent?.ctrlKey || e.originalEvent?.metaKey) return;
      brushPaintingRef.current = true;
      brushPointsRef.current = [[e.lngLat.lng, e.lngLat.lat]];
      try {
        map.dragPan.disable();
      } catch (_) {}
      e.preventDefault();
      setBrushStrokeGeoJSON(map, brushPointsRef.current);
    }

    function onMouseMove(e) {
      if (!brushPaintingRef.current) return;
      appendPoint(e.lngLat);
      setBrushStrokeGeoJSON(map, brushPointsRef.current);
    }

    function onMouseUp() {
      finalizeBrushStroke();
    }

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    document.addEventListener('mouseup', onMouseUp);
    const canvas = map.getCanvas();
    if (canvas) canvas.style.cursor = 'crosshair';

    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      document.removeEventListener('mouseup', onMouseUp);
      try {
        map.dragPan.enable();
      } catch (_) {}
      if (canvas) canvas.style.cursor = '';
      brushPaintingRef.current = false;
      brushPointsRef.current = [];
      setBrushStrokeGeoJSON(map, []);
    };
  }, [mapReady, selectionMode, mapRef, brushRadiusPx]);

  useEffect(() => {
    return () => {
      const m = mapRef?.current;
      try {
        m?.dragPan?.enable();
      } catch (_) {}
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const payload = { prompt: trimmed };
      if (hasSelection) payload.selection = selection;
      if (activeThreadId) payload.threadId = activeThreadId;
      const response = await apiCall('post', '/ai/intelligence', payload);
      if (response.data?.threadId && !activeThreadId) {
        setActiveThreadId(response.data.threadId);
      }
      if (response.data?.threadMessage) {
        setThreadMessages((prev) => [...prev, response.data.threadMessage]);
      }
      setResult(response.data);
      loadThreads();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePromptChange = (e) => {
    const value = e.target.value;
    setPrompt(value);
    const el = promptInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  if (showSelectionBubble) {
    const isDraw = selectionMode === 'draw';
    const isBrush = selectionMode === 'brush';
    const isClick = selectionMode === 'click';
    const liveZoom = mapRef?.current?.getZoom?.() ?? mapZoom;
    const brushZoomOk = liveZoom >= BRUSH_SELECTION_CONFIG.minZoom;
    return (
      <div
        className={`fixed left-1/2 -translate-x-1/2 top-6 z-[101] rounded-xl border-2 shadow-xl p-4 flex flex-col items-center gap-3 ${
          isDark ? 'bg-gray-800/95 border-gray-600' : 'bg-white/95 border-gray-300'
        }`}
        style={{ minWidth: isBrush ? 320 : 280 }}
        role="dialog"
        aria-label={
          isDraw ? 'Draw area instructions' : isBrush ? 'Paint area instructions' : 'Click location instructions'
        }
      >
        <p className={`text-sm text-center leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {isDraw &&
            'Click on the map to add polygon points; double-click to close the polygon.'}
          {isBrush &&
            (brushZoomOk
              ? 'Click and drag on the map to paint a highlight. Release the mouse to lock the area (snapped outline). Use the slider to change brush width.'
              : `Zoom in closer (level ${BRUSH_SELECTION_CONFIG.minZoom}+, city-block scale) to use the paintbrush.`)}
          {isClick && 'Click once on the map to set a location for analysis.'}
        </p>
        {isBrush && brushZoomOk && (
          <label className={`w-full flex flex-col gap-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            <span className="font-medium">Brush size</span>
            <input
              type="range"
              min={BRUSH_SELECTION_CONFIG.minBrushRadiusPx}
              max={BRUSH_SELECTION_CONFIG.maxBrushRadiusPx}
              value={brushRadiusPx}
              onChange={(e) => setBrushRadiusPx(Number(e.target.value))}
              className="w-full"
            />
          </label>
        )}
        {(isDraw || (isBrush && brushZoomOk)) && (
          <div className="w-full flex items-center gap-2">
            <button
              type="button"
              onClick={isDraw ? clearDrawPolygon : clearSelection}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleSelectionDone}
              className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-sm"
            >
              Done
            </button>
          </div>
        )}
      </div>
    );
  }

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setIsCollapsed(false)}
        className="fixed top-24 right-9 z-[101] rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 shadow-lg flex items-center gap-2"
        aria-label="Expand Intelligence"
      >
        <Send className="w-4 h-4" />
        Intelligence
      </button>
    );
  }

  return (
    <div
      className={`fixed right-9 z-[101] w-[min(600px,92vw)] rounded-2xl border shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)] flex flex-col overflow-hidden backdrop-blur-xl ${
        isDark ? 'bg-gray-900/50 border-white/10' : 'bg-white/50 border-white/60'
      }`}
      style={{
        minHeight: 260,
        top: 'var(--panel-top-offset, 88px)',
        maxHeight: 'calc(100vh - var(--panel-top-offset, 88px) - 36px)'
      }}
      role="dialog"
      aria-labelledby="intelligence-title"
    >
      <div className="px-4 pt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActivePane('threads')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              activePane === 'threads'
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                : isDark
                ? 'border-white/15 bg-gray-900/40 text-gray-200 hover:bg-gray-800/80'
                : 'border-white/70 bg-white/70 text-gray-700 hover:bg-white'
            }`}
          >
            Threads
          </button>
          <button
            type="button"
            onClick={handleStartOver}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              isDark
                ? 'border-white/15 bg-gray-900/30 text-gray-200 hover:bg-gray-800/70'
                : 'border-white/70 bg-white/60 text-gray-700 hover:bg-white'
            }`}
          >
            Start over
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className={`p-1.5 rounded-full border ${
              isDark
                ? 'border-white/15 bg-gray-900/40 text-gray-200 hover:bg-gray-800/80'
                : 'border-white/70 bg-white/70 text-gray-700 hover:bg-white'
            }`}
            aria-label="Collapse Intelligence"
          >
            <ChevronUp className="w-4 h-4 rotate-90" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-full ${
              isDark ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-white/70 text-gray-600'
            }`}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 pt-3 flex-1 flex flex-col space-y-4 overflow-hidden">
        {activePane === 'threads' && (
          <div className="flex-1 overflow-y-auto rounded-xl border border-white/60 dark:border-white/10 bg-white/40 dark:bg-gray-900/40 p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className={`text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Threads</p>
              <button
                type="button"
                onClick={startNewThread}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
                  isDark ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Plus className="w-3 h-3" />
                New
              </button>
            </div>
            {threadsLoading && (
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading threads…</p>
            )}
            {!threadsLoading && threads.length === 0 && (
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                No threads yet. Start a new session by asking a question.
              </p>
            )}
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  openThread(thread.id);
                  setActivePane('chat');
                }}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs ${
                  thread.id === activeThreadId
                    ? isDark
                      ? 'bg-emerald-600/30 text-emerald-100'
                      : 'bg-emerald-50 text-emerald-800'
                    : isDark
                    ? 'hover:bg-gray-800 text-gray-200'
                    : 'hover:bg-white text-gray-700'
                }`}
              >
                <p className="font-medium truncate">{thread.title || 'Untitled thread'}</p>
                {thread.lastPrompt && (
                  <p className="mt-0.5 text-[11px] truncate opacity-80">
                    {thread.lastPrompt}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        {activePane === 'chat' && (
          <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
            {showSelectionSetup && !hasPolygonSelection && (
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                <input
                  type="text"
                  placeholder="Find a location"
                  value={locationQuery}
                  onChange={(e) => {
                    setLocationQuery(e.target.value);
                    fetchLocationSuggestions(e.target.value);
                  }}
                  onFocus={() => locationQuery && setShowLocationSuggestions(true)}
                  className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm backdrop-blur ${
                    isDark
                      ? 'bg-gray-800/70 border-white/10 text-gray-100 placeholder-gray-400'
                      : 'bg-white/65 border-white/70 text-gray-800 placeholder-gray-500'
                  } focus:outline-none focus:ring-2 focus:ring-emerald-400/70`}
                />
                {showLocationSuggestions && locationSuggestions.length > 0 && (
                  <ul
                    ref={suggestionsRef}
                    className={`absolute z-50 left-0 right-0 mt-1 rounded-xl border shadow-lg max-h-48 overflow-y-auto ${
                      isDark ? 'bg-gray-800/95 border-white/10' : 'bg-white/95 border-white/70'
                    }`}
                  >
                    {locationSuggestions.map((f, i) => (
                      <li key={f.id || i}>
                        <button
                          type="button"
                          onClick={() => handleLocationSelect(f)}
                          className={`w-full text-left px-3 py-2 text-sm ${isDark ? 'hover:bg-gray-700 text-gray-100' : 'hover:bg-gray-50 text-gray-900'}`}
                        >
                          {f.place_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {showSelectionSetup && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setSelectionMode('draw'); clearSelection(); setShowSelectionBubble(true); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    selectionMode === 'draw'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : isDark
                      ? 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
                      : 'bg-white/70 text-gray-700 hover:bg-white'
                  }`}
                >
                  {selectionMode === 'draw' && <Check className="w-4 h-4" />}
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectionMode('brush'); clearSelection(); setShowSelectionBubble(true); }}
                  disabled={
                    Boolean(
                      mapReady &&
                        mapRef?.current &&
                        mapRef.current.getZoom() < BRUSH_SELECTION_CONFIG.minZoom
                    )
                  }
                  title={
                    mapRef?.current &&
                    mapRef.current.getZoom() < BRUSH_SELECTION_CONFIG.minZoom
                      ? `Zoom to level ${BRUSH_SELECTION_CONFIG.minZoom} or higher (city-block scale) to paint an area`
                      : 'Paint a highlighted area; release to lock the shape'
                  }
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                    selectionMode === 'brush'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : isDark
                      ? 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
                      : 'bg-white/70 text-gray-700 hover:bg-white'
                  }`}
                >
                  {selectionMode === 'brush' && <Check className="w-4 h-4" />}
                  <Paintbrush className="w-4 h-4 opacity-90" />
                  Paint
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectionMode('click'); clearSelection(); setShowSelectionBubble(true); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    selectionMode === 'click'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : isDark
                      ? 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
                      : 'bg-white/70 text-gray-700 hover:bg-white'
                  }`}
                >
                  {selectionMode === 'click' && <Check className="w-4 h-4" />}
                  Click
                </button>
              </div>
            )}

            {hasPolygonSelection && (
              <div
                className={`rounded-2xl border px-3 py-2 text-xs ${
                  isDark
                    ? 'bg-gray-900/70 border-white/10 text-gray-200'
                    : 'bg-white/95 border-gray-200 text-gray-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-semibold">Selected area</span>
                    {polygonCenterLabel && (
                      <span className="text-[11px] opacity-80">
                        Near {polygonCenterLabel}
                      </span>
                    )}
                  </div>
                  {polygonAreaKm2 != null && (
                    <span className="text-[11px] font-medium">
                      {formatPolygonAreaForDisplay(polygonAreaKm2)}
                    </span>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-2">
              <div
                className={`w-full rounded-2xl border text-sm backdrop-blur px-4 py-3 flex flex-col gap-2 ${
                  isDark
                    ? 'bg-gray-900/60 border-white/10'
                    : 'bg-white/95 border-white/70'
                }`}
              >
                <textarea
                  placeholder={PLACEHOLDER}
                  value={prompt}
                  onChange={handlePromptChange}
                  ref={promptInputRef}
                  rows={1}
                  className={`w-full resize-none bg-transparent border-none outline-none text-sm leading-relaxed max-h-40 ${
                    isDark ? 'text-gray-100 placeholder-gray-400' : 'text-gray-800 placeholder-gray-400'
                  }`}
                />
                <div className="flex items-center justify-end gap-2 pb-0.5">
                  <button
                    type="button"
                    className={`p-2 rounded-full ${
                      isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    aria-label="Attach"
                    title="Attach (coming soon)"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !prompt.trim()}
                    className="p-2 rounded-full bg-emerald-400 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center"
                    aria-label="Send"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </form>

            {threadMessages.length > 0 && (
              <div className={`rounded-lg border p-3 max-h-40 overflow-y-auto space-y-2 ${
                isDark ? 'border-gray-700 bg-gray-800/60' : 'border-gray-200 bg-gray-50'
              }`}>
                {threadMessages.slice(-6).map((message) => (
                  <div key={message.id} className={`rounded-md px-2 py-1.5 ${isDark ? 'bg-gray-700/60' : 'bg-white'}`}>
                    <p className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      You: {message.prompt}
                    </p>
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      AI: {summarizeThreadResponse(message.response)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {showSelectionSetup && selectionMode === 'draw' && !hasPolygonSelection && (
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Draw an area on the map to analyze.
              </p>
            )}
            {showSelectionSetup && selectionMode === 'brush' && (
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Paintbrush works at city-block scale (zoom {BRUSH_SELECTION_CONFIG.minZoom}+). Release the mouse to snap your stroke to a clean outline—the result is a normal area selection for Intelligence.
              </p>
            )}
            {showSelectionSetup && selectionMode === 'click' && (
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Click on the map to set a location for analysis.
              </p>
            )}
          </div>
        )}

        {error && (
          <div
            className={`mt-1 px-3 py-2 rounded-lg text-sm flex items-start justify-between gap-2 ${
              isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'
            }`}
            role="alert"
          >
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className={`shrink-0 rounded-md p-1 -m-1 -mr-0.5 ${isDark ? 'hover:bg-red-800/50 text-red-200' : 'hover:bg-red-100 text-red-800'}`}
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" strokeWidth={2.2} />
            </button>
          </div>
        )}

        {result && (
          <div className={`mt-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} p-3 max-h-48 overflow-y-auto space-y-4`}>
            {result.areaSummary && (
              <div>
                <p className={`font-medium text-sm mb-1 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Area summary</p>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{result.areaSummary}</p>
              </div>
            )}
            {result.suggestions?.length > 0 && (
              <div>
                <p className={`font-medium text-sm mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Suggested ideas</p>
                <ul className="space-y-2">
                  {result.suggestions.slice(0, 5).map((s, i) => (
                    <li key={i} className={`text-sm rounded-lg px-3 py-2 ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
                      <span className="font-medium">{s.title}</span>
                      <p className={`mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'} line-clamp-2`}>{s.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.movements?.length > 0 && (
              <div>
                <p className={`font-medium text-sm mb-2 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Suggested movements</p>
                <ul className="space-y-2">
                  {result.movements.slice(0, 5).map((m, i) => (
                    <li key={i} className={`text-sm rounded-lg px-3 py-2 ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <span className="font-medium block">{m.name}</span>
                          <p className={`mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'} line-clamp-2`}>{m.description}</p>
                          {m.city && m.state && (
                            <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                              {m.city}, {m.state}
                            </p>
                          )}
                        </div>
                        {onCreateMovementFromAI && (
                          <button
                            type="button"
                            onClick={() =>
                              onCreateMovementFromAI(
                                {
                                  name: m.name,
                                  description: m.description,
                                  city: m.city,
                                  state: m.state
                                },
                                selection
                              )
                            }
                            className={`ml-2 px-3 py-1 rounded-full text-xs font-semibold ${
                              isDark ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-500 text-white hover:bg-emerald-600'
                            }`}
                          >
                            Create
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.answer && !result.areaSummary && !result.suggestions?.length && !result.movements?.length && (
              <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{result.answer}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default IntelligenceModal;
