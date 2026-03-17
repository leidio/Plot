import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Search, Check, Paperclip, Send, Plus, ChevronUp } from 'lucide-react';

const PLACEHOLDER = 'Ask Plot to analyze the map or generate movements';

const IntelligenceModal = ({ mapRef, mapReady, apiCall, isDark = false, onClose, onCreateMovementFromAI }) => {
  const [locationQuery, setLocationQuery] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [selectionMode, setSelectionMode] = useState(null); // null | 'draw' | 'click'
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
  const drawRef = useRef(null);
  const deleteMarkerRef = useRef(null);
  const clickHandlerRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceRef = useRef(null);
  const promptInputRef = useRef(null);

  const hasSelection = selection && selection.coordinates;
  const hasPolygonSelection = selection?.type === 'Polygon';
  const showSelectionSetup = !hasSelection;
  const [activePane, setActivePane] = useState('chat'); // 'chat' | 'threads'
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    return (
      <div
        className={`fixed left-1/2 -translate-x-1/2 top-6 z-[101] rounded-xl border-2 shadow-xl p-4 flex flex-col items-center gap-3 ${
          isDark ? 'bg-gray-800/95 border-gray-600' : 'bg-white/95 border-gray-300'
        }`}
        style={{ minWidth: 280 }}
        role="dialog"
        aria-label={isDraw ? 'Draw area instructions' : 'Click location instructions'}
      >
        <p className={`text-sm text-center leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {isDraw
            ? 'Click on the map to add polygon points; double-click to close the polygon.'
            : 'Click once on the map to set a location for analysis.'}
        </p>
        {isDraw && (
          <div className="w-full flex items-center gap-2">
            <button
              type="button"
              onClick={clearDrawPolygon}
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
              <div className="flex gap-3">
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
            {showSelectionSetup && selectionMode === 'click' && (
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Click on the map to set a location for analysis.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className={`mt-1 px-3 py-2 rounded-lg text-sm ${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
            {error}
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
