import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Search, Check, Paperclip, Send } from 'lucide-react';

const PLACEHOLDER = 'Ask Plot to analyze the map or generate movements';

const IntelligenceModal = ({ mapRef, mapReady, apiCall, isDark = false, onClose }) => {
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [selectionMode, setSelectionMode] = useState(null); // null | 'draw' | 'click'
  const [prompt, setPrompt] = useState('');
  const [selection, setSelection] = useState(null); // { type: 'Point'|'Polygon', coordinates }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { areaSummary?, suggestions?, movements? }
  const [showSelectionBubble, setShowSelectionBubble] = useState(false);
  const [polygonCenterLabel, setPolygonCenterLabel] = useState('');
  const drawRef = useRef(null);
  const deleteMarkerRef = useRef(null);
  const clickHandlerRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceRef = useRef(null);

  const hasSelection = selection && selection.coordinates;
  const hasPolygonSelection = selection?.type === 'Polygon';

  function removePolygonDeleteMarker() {
    if (!deleteMarkerRef.current) return;
    try {
      deleteMarkerRef.current.remove();
    } catch (_) {}
    deleteMarkerRef.current = null;
  }

  function getPolygonTopLeft(coordinates) {
    if (!Array.isArray(coordinates) || !coordinates[0]?.length) return null;
    const ring = coordinates[0];
    let minLng = ring[0][0];
    let maxLat = ring[0][1];
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    return [minLng, maxLat];
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
      if (!draw) return;
      const features = draw.getAll()?.features || [];
      const polygonIds = features
        .filter((feature) => feature.geometry?.type === 'Polygon')
        .map((feature) => feature.id)
        .filter(Boolean);
      if (polygonIds.length > 0) {
        draw.delete(polygonIds);
      }
      draw.changeMode('draw_polygon');
    } catch (_) {}
    setSelection(null);
    setPolygonCenterLabel('');
    removePolygonDeleteMarker();
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
    const topLeft = getPolygonTopLeft(polygonCoordinates);
    if (!topLeft) return;

    removePolygonDeleteMarker();
    const button = document.createElement('button');
    button.type = 'button';
    button.style.width = '22px';
    button.style.height = '22px';
    button.style.borderRadius = '9999px';
    button.style.background = '#ffffff';
    button.style.border = '1px solid #d1d5db';
    button.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18)';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.cursor = 'pointer';
    button.style.padding = '0';
    button.setAttribute('aria-label', 'Delete polygon');
    button.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6L18 18" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/><path d="M18 6L6 18" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/></svg>';
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearDrawPolygon();
    };

    deleteMarkerRef.current = new mapboxgl.Marker({ element: button, anchor: 'bottom-right' })
      .setLngLat(topLeft)
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
    if (selectionMode === 'draw' || selectionMode === 'click') setShowSelectionBubble(true);
    removePolygonDeleteMarker();
    if (mapRef?.current && drawRef.current) {
      try {
        mapRef.current.removeControl(drawRef.current);
      } catch (_) {}
      drawRef.current = null;
    }
    if (clickHandlerRef.current && mapRef?.current) {
      mapRef.current.getCanvas().style.cursor = '';
    }
    clickHandlerRef.current = null;
  };

  const handleSelectionDone = () => {
    setShowSelectionBubble(false);
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
          controls: {}
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
        mapInstance.on('draw.create', onUpdate);
        mapInstance.on('draw.update', onUpdate);
        mapInstance.on('draw.delete', onUpdate);
      } catch (err) {
        console.error('Intelligence Draw init:', err);
      }
    };

    try {
      const style = mapInstance.getStyle?.();
      if (style?.sources) {
        addDraw();
      } else {
        mapInstance.once('load', addDraw);
        const t = setTimeout(addDraw, 500);
        return () => {
          clearTimeout(t);
          if (drawRef.current) {
            try {
              mapInstance.removeControl(drawRef.current);
            } catch (_) {}
            drawRef.current = null;
            removePolygonDeleteMarker();
          }
        };
      }
    } catch (_) {}
    return () => {
      if (drawRef.current) {
        try {
          mapInstance.removeControl(drawRef.current);
        } catch (_) {}
        drawRef.current = null;
      }
      removePolygonDeleteMarker();
    };
  }, [mapReady, selectionMode, mapRef]);

  useEffect(() => {
    if (selectionMode !== 'draw' || !showSelectionBubble || !drawRef.current) return;
    forcePolygonDrawMode();
  }, [selectionMode, showSelectionBubble]);

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
    return () => {
      clearSelection();
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
      const response = await apiCall('post', '/ai/intelligence', payload);
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  if (showSelectionBubble) {
    const isDraw = selectionMode === 'draw';
    return (
      <div
        className={`fixed left-1/2 -translate-x-1/2 top-6 z-[101] rounded-xl border-2 shadow-xl p-4 flex flex-col items-center gap-3 ${
          isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'
        }`}
        style={{ minWidth: 280 }}
        role="dialog"
        aria-label={isDraw ? 'Draw area instructions' : 'Click location instructions'}
      >
        <p className={`text-sm text-center ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {isDraw
            ? 'Click on the map to add polygon points; double-click to close the polygon.'
            : 'Click once on the map to set a location for analysis.'}
        </p>
        <div className="w-full flex items-center gap-2">
          {isDraw && (
            <button
              type="button"
              onClick={clearDrawPolygon}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={handleSelectionDone}
            className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {!hasPolygonSelection && <div className="fixed inset-0 z-[100] bg-black/20 pointer-events-none" aria-hidden />}
      <div
        className={`fixed right-6 top-24 z-[101] w-full max-w-md rounded-xl border-2 shadow-2xl flex flex-col overflow-hidden ${
          isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'
        }`}
        style={{ minHeight: 320 }}
        role="dialog"
        aria-labelledby="intelligence-title"
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 id="intelligence-title" className={`font-semibold text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Intelligence
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!hasPolygonSelection && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Find a location"
                value={locationQuery}
                onChange={(e) => {
                  setLocationQuery(e.target.value);
                  fetchLocationSuggestions(e.target.value);
                }}
                onFocus={() => locationQuery && setShowLocationSuggestions(true)}
                className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm ${
                  isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
              />
              {showLocationSuggestions && locationSuggestions.length > 0 && (
                <ul
                  ref={suggestionsRef}
                  className={`absolute z-50 left-0 right-0 mt-1 rounded-lg border shadow-lg max-h-48 overflow-y-auto ${
                    isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {locationSuggestions.map((f, i) => (
                    <li key={f.id || i}>
                      <button
                        type="button"
                        onClick={() => handleLocationSelect(f)}
                        className={`w-full text-left px-3 py-2 text-sm ${isDark ? 'hover:bg-gray-600 text-gray-100' : 'hover:bg-gray-50 text-gray-900'}`}
                      >
                        {f.place_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setSelectionMode('draw'); clearSelection(); setShowSelectionBubble(true); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                selectionMode === 'draw'
                  ? 'bg-emerald-600 text-white'
                  : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {selectionMode === 'draw' && <Check className="w-4 h-4" />}
              Draw
            </button>
            <button
              type="button"
              onClick={() => { setSelectionMode('click'); clearSelection(); setShowSelectionBubble(true); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                selectionMode === 'click'
                  ? 'bg-emerald-600 text-white'
                  : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {selectionMode === 'click' && <Check className="w-4 h-4" />}
              Click
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <textarea
              placeholder={PLACEHOLDER}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${
                isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' : 'border-gray-300'
              } focus:outline-none focus:ring-2 focus:ring-green-500`}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className={`p-2 rounded-lg ${isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
                aria-label="Attach"
                title="Attach (coming soon)"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500 text-white font-medium text-sm hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send
                  </>
                )}
              </button>
            </div>
          </form>

          {selectionMode === 'draw' && !hasPolygonSelection && (
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Draw an area on the map to analyze.
            </p>
          )}
          {selectionMode === 'click' && (
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Click on the map to set a location for analysis.
            </p>
          )}
          {hasSelection && (
            <div className="flex items-center justify-between gap-2">
              <div>
                {hasPolygonSelection && (
                  <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Centered in {polygonCenterLabel}.
                  </p>
                )}
                <p className={`text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  Selection set. Enter your prompt above and send.
                </p>
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className={`text-xs font-medium ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className={`mx-4 mb-4 px-3 py-2 rounded-lg text-sm ${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
            {error}
          </div>
        )}

        {result && (
          <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} p-4 max-h-72 overflow-y-auto space-y-4`}>
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
                      <span className="font-medium">{m.name}</span>
                      <p className={`mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'} line-clamp-2`}>{m.description}</p>
                      {m.city && m.state && <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{m.city}, {m.state}</p>}
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
    </>
  );
};

export default IntelligenceModal;
