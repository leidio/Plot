import React, { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Heart, Share2, DollarSign, Users, MapPin, Filter, X, Check, ChevronUp, ChevronDown, Lightbulb, Star, Settings, Trash2, Mail, Lock, MessageSquare, Activity, Sparkles } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { useWebSocket } from './hooks/useWebSocket';
import { useMovements } from './hooks/useMovements';
import { useIdeas } from './hooks/useIdeas';
import IdeaModal from './components/IdeaModal';
import MovementsPage from './components/MovementsPage';
import MovementDetailsPage from './components/MovementDetailsPage';
import AuthModal from './components/AuthModal';
import CreateModal from './components/CreateModal';
import ProfileModal from './components/ProfileModal';
import MovementPreviewModal from './components/MovementPreviewModal';
import IntelligenceModal from './components/IntelligenceModal';
import Header from './components/Header';
import axios from 'axios';
import { getApiBaseUrl } from './apiConfig';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

// Helper function to make authenticated API calls
// Cookies are automatically sent with requests when credentials: 'include' is set
const apiCall = async (method, endpoint, data = null) => {
  const config = {
    method,
    url: `${getApiBaseUrl()}${endpoint}`,
    headers: {
      'Content-Type': 'application/json'
    },
    withCredentials: true, // Include cookies in requests
    ...(data && { data })
  };
  return axios(config);
};

/**
 * Vector tiles (incl. 3D building extrusions) load for the current view frustum.
 * Rotating or pitching changes which tiles are visible; a larger cache keeps recently
 * viewed tiles in memory so buildings are less likely to pop out/in. Tradeoff: RAM.
 * @see https://docs.mapbox.com/mapbox-gl-js/api/map/#map-parameters
 */
const MAP_MAX_TILE_CACHE_TILES = 384;

/** Minimum time the Intelligence map sweep stays on screen (ms). Keeps it visible for design even when the POST returns instantly; tune down for production. */
const INTELLIGENCE_SWEEP_MIN_MS = 1400;

/** Set true to show the land-cover map toggle again (overlay plumbing stays in place). */
const SHOW_LAND_COVER_TOGGLE = false;

/** Michigan block groups: tree canopy % from `mi_geojson/mi_tes.geojson` (symlink under `public/overlays/`). */
const SHOW_MI_CANOPY_TOGGLE = true;

/** Stable IDs for the optional preprocessed land-cover overlay (GeoJSON). */
const LAND_COVER_SOURCE_ID = 'plot-land-cover';
const LAND_COVER_FILL_LAYER_ID = 'plot-land-cover-fill';
const LAND_COVER_LINE_LAYER_ID = 'plot-land-cover-line';

/** Stable IDs for Michigan canopy (same GeoJSON as Tree Equity export; paints `treecanopy` 0–1). */
const MI_CANOPY_SOURCE_ID = 'plot-mi-canopy';
const MI_CANOPY_FILL_LAYER_ID = 'plot-mi-canopy-fill';
const MI_CANOPY_LINE_LAYER_ID = 'plot-mi-canopy-line';

function overlayPublicUrl(filename) {
  const base = import.meta.env.BASE_URL || '/';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}overlays/${filename}`;
}

function landCoverSampleUrl() {
  return overlayPublicUrl('land-cover-sample.geojson');
}

function miBlockgroupsGeojsonUrl() {
  return overlayPublicUrl('mi_tes.geojson');
}

function mapControlButtonCount() {
  return 1 + (SHOW_LAND_COVER_TOGGLE ? 1 : 0) + (SHOW_MI_CANOPY_TOGGLE ? 1 : 0);
}

function intelligenceBackButtonTopClass() {
  const n = mapControlButtonCount();
  if (n >= 3) return 'top-[8.5rem]';
  if (n === 2) return 'top-[5.75rem]';
  return 'top-12';
}

function findFirstSymbolLayerId(mapInstance) {
  const style = mapInstance.getStyle();
  if (!style?.layers) return undefined;
  const layer = style.layers.find((l) => l.type === 'symbol');
  return layer?.id;
}

/**
 * Ensures land-cover source/layers exist and sets visibility.
 * Call after style loads (setStyle wipes custom layers).
 * Inserts below the first symbol layer so base-map labels stay readable; app layers added later stack on top.
 */
function syncLandCoverOverlay(mapInstance, visible) {
  if (!mapInstance?.getStyle?.()?.layers) return;

  const visibility = visible ? 'visible' : 'none';

  try {
    if (!mapInstance.getSource(LAND_COVER_SOURCE_ID)) {
      mapInstance.addSource(LAND_COVER_SOURCE_ID, {
        type: 'geojson',
        data: landCoverSampleUrl()
      });
    }

    const beforeId = findFirstSymbolLayerId(mapInstance);

    if (!mapInstance.getLayer(LAND_COVER_FILL_LAYER_ID)) {
      mapInstance.addLayer(
        {
          id: LAND_COVER_FILL_LAYER_ID,
          type: 'fill',
          source: LAND_COVER_SOURCE_ID,
          paint: {
            'fill-color': [
              'match',
              ['get', 'class'],
              'forest',
              '#166534',
              'water',
              '#0369a1',
              'wetland',
              '#15803d',
              'urban',
              '#a16207',
              '#64748b'
            ],
            'fill-opacity': 0.42
          }
        },
        beforeId
      );
    }

    if (!mapInstance.getLayer(LAND_COVER_LINE_LAYER_ID)) {
      mapInstance.addLayer(
        {
          id: LAND_COVER_LINE_LAYER_ID,
          type: 'line',
          source: LAND_COVER_SOURCE_ID,
          paint: {
            'line-color': '#0f172a',
            'line-opacity': 0.25,
            'line-width': 1
          }
        },
        beforeId
      );
    }

    mapInstance.setLayoutProperty(LAND_COVER_FILL_LAYER_ID, 'visibility', visibility);
    mapInstance.setLayoutProperty(LAND_COVER_LINE_LAYER_ID, 'visibility', visibility);
  } catch (err) {
    console.warn('[Plot] Land cover overlay sync failed:', err);
  }
}

function syncMiCanopyOverlay(mapInstance, visible) {
  if (!mapInstance?.getStyle?.()?.layers) return;

  const visibility = visible ? 'visible' : 'none';

  try {
    if (!mapInstance.getSource(MI_CANOPY_SOURCE_ID)) {
      mapInstance.addSource(MI_CANOPY_SOURCE_ID, {
        type: 'geojson',
        data: miBlockgroupsGeojsonUrl()
      });
    }

    const beforeId = findFirstSymbolLayerId(mapInstance);

    if (!mapInstance.getLayer(MI_CANOPY_FILL_LAYER_ID)) {
      mapInstance.addLayer(
        {
          id: MI_CANOPY_FILL_LAYER_ID,
          type: 'fill',
          source: MI_CANOPY_SOURCE_ID,
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'treecanopy'], 0],
              0,
              '#e8e0d4',
              0.25,
              '#c8d6a6',
              0.5,
              '#6bae4a',
              0.75,
              '#2e7d32',
              1,
              '#1b4d1e'
            ],
            'fill-opacity': 0.52
          }
        },
        beforeId
      );
    }

    if (!mapInstance.getLayer(MI_CANOPY_LINE_LAYER_ID)) {
      mapInstance.addLayer(
        {
          id: MI_CANOPY_LINE_LAYER_ID,
          type: 'line',
          source: MI_CANOPY_SOURCE_ID,
          paint: {
            'line-color': '#1e293b',
            'line-opacity': 0.18,
            'line-width': 0.5
          }
        },
        beforeId
      );
    }

    mapInstance.setLayoutProperty(MI_CANOPY_FILL_LAYER_ID, 'visibility', visibility);
    mapInstance.setLayoutProperty(MI_CANOPY_LINE_LAYER_ID, 'visibility', visibility);
  } catch (err) {
    console.warn('[Plot] MI canopy overlay sync failed:', err);
  }
}

const PlotApp = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const headerRef = useRef(null);
  const initialMapView = useRef(null); // center + zoom at load, restored on "All Movements"
  const { isDark, toggleTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState(null);
  const [viewMode, setViewMode] = useState('movements');
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [selectedIdea, setSelectedIdea] = useState(null);
  const {
    movements,
    searchResults,
    isSearching,
    searchQuery,
    setSearchQuery,
    loadMovements
  } = useMovements(apiCall);
  const { ideas, setIdeas, loadIdeas } = useIdeas(apiCall);
  const [userLocation, setUserLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [mapInitStarted, setMapInitStarted] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [wasSearching, setWasSearching] = useState(false); // Track if we were searching before viewing movement
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState('movement');
  const [clickedCoordinates, setClickedCoordinates] = useState(null);
  const [aiMovementDraft, setAiMovementDraft] = useState(null);
  const movementMarkersRef = useRef([]);
  const ideaMarkersRef = useRef([]);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const profileDropdownRef = useRef(null);
  const [isMovementLoading, setIsMovementLoading] = useState(false);
  const [previewMovement, setPreviewMovement] = useState(null);
  const [returnToMovement, setReturnToMovement] = useState(null);
  const [showIntelligenceLayer, setShowIntelligenceLayer] = useState(false);
  const [intelligenceMapLoading, setIntelligenceMapLoading] = useState(false);
  const [intelligenceSweepVisible, setIntelligenceSweepVisible] = useState(false);
  const intelligenceSweepStartRef = useRef(0);
  const [is3DMode, setIs3DMode] = useState(false);
  const [showLandCoverOverlay, setShowLandCoverOverlay] = useState(false);
  const showLandCoverOverlayRef = useRef(false);
  const [showMiCanopyOverlay, setShowMiCanopyOverlay] = useState(false);
  const showMiCanopyOverlayRef = useRef(false);

  // WebSocket setup - get token from cookies via API call
  const [wsToken, setWsToken] = useState(null);
  const { socket, isConnected } = useWebSocket(wsToken, true);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      loadMovements();
    });
    // Check if user is already logged in (via cookie)
    // If they have old localStorage token but no cookie, they need to log in again
    const oldToken = localStorage.getItem('authToken');
    if (oldToken) {
      // Clear old token - we're using cookies now
      localStorage.removeItem('authToken');
    }
    
    apiCall('get', '/auth/me')
      .then(response => {
        if (response.data.user) {
          setCurrentUser(response.data.user);
          // For WebSocket, we'll use null token and let server check cookies
          // Socket.IO will send cookies automatically with withCredentials
          setWsToken(null);
        }
      })
      .catch(() => {
        // Not logged in or token invalid - this is fine
        // User will need to log in again
        setWsToken(null);
      });

    return () => cancelAnimationFrame(rafId);
  }, [loadMovements]);

  useEffect(() => {
    showLandCoverOverlayRef.current = showLandCoverOverlay;
  }, [showLandCoverOverlay]);

  useEffect(() => {
    showMiCanopyOverlayRef.current = showMiCanopyOverlay;
  }, [showMiCanopyOverlay]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setShowProfileDropdown(false);
      }
    };

    if (showProfileDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileDropdown]);

  const handleSignOut = async () => {
    try {
      await apiCall('post', '/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    // Reset app state
    setCurrentUser(null);
    setShowProfileDropdown(false);
    setShowProfileModal(false);
  };

  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;
    const container = mapContainer.current;
    const parent = container.parentElement;
    if (!parent) return;

    // Mapbox needs the container to have non-zero size at creation, or the map can stay blank.
    // Set parent height now so layout is ready; updateMapHeight will refine it later.
    const headerHeight = headerRef.current?.offsetHeight ?? 0;
    const availableHeight = Math.max(200, window.innerHeight - headerHeight);
    parent.style.height = `${availableHeight}px`;

    // Use a stable built-in Mapbox style to avoid custom iconset/source issues
    const initialStyle = isDark
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/streets-v12';

    setMapInitStarted(true);
    setMapError(null);
    map.current = new mapboxgl.Map({
      container,
      style: initialStyle,
      center: [-90.0715, 29.9511], // Default to New Orleans
      zoom: 12,
      maxTileCacheSize: MAP_MAX_TILE_CACHE_TILES
    });

    // Resize after layout so Mapbox picks up container dimensions (handles slow layout / flex).
    const rafId = requestAnimationFrame(() => {
      map.current?.resize();
    });

    map.current.on('error', (e) => {
      setMapError(e.error?.message || 'Map failed to load');
    });

    // TEMP: expose map for debugging
    if (typeof window !== 'undefined') {
      window._map = map.current;
    }

    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-left');

    // Filter POI labels to show only landmarks, hide commercial businesses
    const filterPOILayers = () => {
      const style = map.current.getStyle();
      if (!style || !style.layers) return;

      style.layers.forEach((layer) => {
        // Keep landmarks/civic POIs, hide business/other POIs.
        // (Uses the layer feature "class" field.)
        if (layer.id.includes('poi-label')) {
          map.current.setFilter(layer.id, [
            'all',
            [
              'match',
              ['get', 'class'],
              [
                'landmark',
                'park',
                'cemetery',
                'place_of_worship',
                'school',
                'college',
                'hospital',
                'library',
                'museum',
                'stadium',
                'zoo',
                'aquarium',
                'golf',
                'historic',
                'arts_centre',
                'monument',
                'education',
                'medical',
                'attraction',
                'arts_and_entertainment',
                'tourist_attraction',
                'visitor_centre',
                'gallery',
                'theatre',
                'cinema',
                'general'
              ],
              true,
              false
            ]
          ]);
        }

        // Raise the zoom level at which *any* road labels (and shields) appear.
        // Many styles use different source-layer names; be broad and catch
        // layers whose source-layer mentions "road".
        if (
          layer.type === 'symbol' &&
          typeof layer['source-layer'] === 'string' &&
          layer['source-layer'].toLowerCase().includes('road')
        ) {
          // Only show from zoom ~16 and closer.
          map.current.setLayerZoomRange(layer.id, 16, 24);
        }
      });
    };

    const applyPostStyleTweaks = () => {
      filterPOILayers();
      syncLandCoverOverlay(map.current, showLandCoverOverlayRef.current);
      syncMiCanopyOverlay(map.current, showMiCanopyOverlayRef.current);
    };

    // Run on idle (after all rendering complete) for initial load
    map.current.once('idle', applyPostStyleTweaks);

    // Run on style changes (theme toggle) — custom sources/layers are cleared by setStyle
    map.current.on('style.load', applyPostStyleTweaks);

    const handleLoad = () => {
      setMapReady(true);
      setMapError(null);
      // Store initial geography so "All Movements" returns here instead of zooming out
      const c = map.current.getCenter();
      initialMapView.current = {
        center: [c.lng, c.lat],
        zoom: map.current.getZoom()
      };
    };
    map.current.on('load', handleLoad);

    return () => {
      cancelAnimationFrame(rafId);
      if (map.current) {
        map.current.off('load', handleLoad);
        map.current.off('style.load', applyPostStyleTweaks);
        map.current.remove();
        map.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only once; initialStyle uses captured isDark

  // Update map style when theme changes
  useEffect(() => {
    if (!map.current) return;
    
    // Previous isDark-based styles (revert by uncommenting and removing custom style):
    // const newStyle = isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12';
    const newStyle = 'mapbox://styles/leidio/cmlbfxs1i003101quh2aah4sb';
    
    // setStyle doesn't return a Promise in this version of Mapbox GL JS
    // When setStyle is called, Mapbox removes ALL custom sources and layers
    // The useMovementMarkers hook will listen for style changes and re-add them
    try {
      map.current.setStyle(newStyle);
      // Resize after style loads
      map.current.once('styledata', () => {
        if (map.current) {
          map.current.resize();
        }
      });
    } catch (err) {
      console.error('Error updating map style:', err);
    }
  }, [isDark, mapReady]);

  // Resize map when layout changes (e.g., when header height changes)
  useEffect(() => {
    if (map.current && mapReady) {
      // Use requestAnimationFrame to ensure DOM has updated
      const resizeMap = () => {
        if (map.current) {
          map.current.resize();
        }
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(resizeMap);
      });
    }
  }, [viewMode, mapReady, searchQuery]);

  // Also resize when window resizes or layout changes
  useEffect(() => {
    if (!map.current || !mapReady) return;
    
    const handleResize = () => {
      if (map.current) {
        map.current.resize();
      }
    };
    
    // Resize on window resize
    window.addEventListener('resize', handleResize);
    
    // Also resize after a short delay to catch layout changes
    const timer = setTimeout(handleResize, 100);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [mapReady]);

  // Keep map and panels aligned under the header as it expands/collapses
  useEffect(() => {
    const updateMapHeight = () => {
      if (headerRef.current && mapContainer.current?.parentElement) {
        const headerHeight = headerRef.current.offsetHeight;
        // Keep movement/idea panels snug under the header, regardless of collapsed/expanded height
        document.documentElement.style.setProperty(
          '--panel-top-offset',
          `${headerHeight + 8}px`
        );
        if (map.current) {
          map.current.resize();
        }
      }
    };

    updateMapHeight();
    window.addEventListener('resize', updateMapHeight);
    return () => window.removeEventListener('resize', updateMapHeight);
  }, [viewMode, showSearch, mapReady]);

  // Toggle 2D / 3D map mode (terrain + camera pitch)
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const mapInstance = map.current;

    if (is3DMode) {
      if (!mapInstance.getSource('mapbox-dem')) {
        mapInstance.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        });
      }
      mapInstance.setTerrain({ source: 'mapbox-dem', exaggeration: 1.3 });
      mapInstance.easeTo({
        pitch: 60,
        bearing: mapInstance.getBearing(),
        duration: 800
      });
    } else {
      mapInstance.setTerrain(null);
      mapInstance.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 600
      });
    }
  }, [is3DMode, mapReady]);

  // Land cover overlay visibility (layers re-created on style.load; ref supplies value inside map init)
  useEffect(() => {
    if (!map.current || !mapReady) return;
    syncLandCoverOverlay(map.current, showLandCoverOverlay);
  }, [showLandCoverOverlay, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady) return;
    syncMiCanopyOverlay(map.current, showMiCanopyOverlay);
  }, [showMiCanopyOverlay, mapReady]);

  // Hold map sweep for at least INTELLIGENCE_SWEEP_MIN_MS after each submit so it’s visible even on instant errors.
  useEffect(() => {
    if (intelligenceMapLoading) {
      intelligenceSweepStartRef.current = Date.now();
      setIntelligenceSweepVisible(true);
      return undefined;
    }
    const started = intelligenceSweepStartRef.current;
    if (!started) {
      setIntelligenceSweepVisible(false);
      return undefined;
    }
    const elapsed = Date.now() - started;
    const wait = Math.max(0, INTELLIGENCE_SWEEP_MIN_MS - elapsed);
    if (wait === 0) {
      intelligenceSweepStartRef.current = 0;
      setIntelligenceSweepVisible(false);
      return undefined;
    }
    const t = setTimeout(() => {
      intelligenceSweepStartRef.current = 0;
      setIntelligenceSweepVisible(false);
    }, wait);
    return () => clearTimeout(t);
  }, [intelligenceMapLoading]);

  useEffect(() => {
    if (!showIntelligenceLayer) {
      intelligenceSweepStartRef.current = 0;
      setIntelligenceSweepVisible(false);
    }
  }, [showIntelligenceLayer]);

  // Map container size can change when Intelligence sweep class toggles; keep GL canvas in sync.
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const id = requestAnimationFrame(() => {
      try {
        map.current?.resize();
      } catch (_) {}
    });
    return () => cancelAnimationFrame(id);
  }, [mapReady, intelligenceSweepVisible]);

  // Light sweep: mount inside Mapbox’s canvas container so it stacks above the WebGL canvas.
  // Double rAF defers until after layout/paint so the canvas container exists and dimensions are stable.
  useEffect(() => {
    if (!map.current || !mapReady || !showIntelligenceLayer || !intelligenceSweepVisible) {
      return undefined;
    }
    const mapInstance = map.current;
    let cancelled = false;
    let el = null;
    let raf2Id = 0;

    const raf1Id = requestAnimationFrame(() => {
      raf2Id = requestAnimationFrame(() => {
        if (cancelled || !map.current) return;
        const canvasWrap = mapInstance.getContainer()?.querySelector('.mapboxgl-canvas-container');
        if (!canvasWrap) return;
        el = document.createElement('div');
        el.className = 'plot-map-intel-sweep-overlay';
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText =
          'position:absolute;inset:0;pointer-events:none;z-index:20;overflow:hidden;';
        canvasWrap.appendChild(el);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1Id);
      if (raf2Id) cancelAnimationFrame(raf2Id);
      try {
        el?.remove();
      } catch (_) {}
    };
   }, [mapReady, showIntelligenceLayer, intelligenceSweepVisible]);

  // Also resize on window resize
  useEffect(() => {
    if (!map.current || !mapReady) return;
    
    const handleResize = () => {
      if (map.current) {
        map.current.resize();
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady || userLocation) return;
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        map.current.flyTo({
          center: [longitude, latitude],
          zoom: 13,
          speed: 1.2,
          essential: true
        });
      },
      (error) => {
        console.warn('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }, [mapReady, userLocation]);


  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setShowSearch(false);
    setWasSearching(false);
    setReturnToMovement(null);
    loadMovements();
  }, [setSearchQuery, setShowSearch, setWasSearching, loadMovements]);

  const handleBackFromTagSearch = useCallback(() => {
    if (!returnToMovement) return;
    setViewMode('movement-details');
    setSelectedMovement(returnToMovement.movement);
    setIdeas(returnToMovement.ideas || []);
    setSearchQuery('');
    setShowSearch(false);
    setReturnToMovement(null);
  }, [returnToMovement]);

  // Fit map to geographic extent of closest 5 search results when tag/search is active
  useEffect(() => {
    if (!map.current || !mapReady || !searchQuery.trim()) return;
    const mov = searchResults.movements || [];
    const ide = searchResults.ideas || [];
    const points = [];
    mov.slice(0, 5).forEach(m => {
      if (m.latitude != null && m.longitude != null) points.push([m.longitude, m.latitude]);
    });
    ide.slice(0, 5).forEach(i => {
      if (i.latitude != null && i.longitude != null) points.push([i.longitude, i.latitude]);
    });
    const toFit = points.slice(0, 5);
    if (toFit.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    toFit.forEach(p => bounds.extend(p));
    if (bounds.isEmpty()) return;
    map.current.fitBounds(bounds, {
      padding: { top: 130, bottom: 80, left: 80, right: 400 },
      maxZoom: 12,
      duration: 800
    });
  }, [searchQuery, searchResults.movements, searchResults.ideas, mapReady]);

  const handleBackToMovements = useCallback(() => {
    setViewMode('movements');
    setSelectedMovement(null);
    setIdeas([]);
    // Restore search bar and results if we were searching before
    if (wasSearching) {
      setShowSearch(true);
      setWasSearching(false);
    }
    if (map.current && initialMapView.current) {
      map.current.flyTo({
        center: initialMapView.current.center,
        zoom: initialMapView.current.zoom
      });
    }
  }, [wasSearching, setIdeas]);

  const handleCreateClick = useCallback(() => {
    setShowCreateModal(true);
    setCreateType('movement');
  }, []);

  const handleProfileClick = useCallback(() => {
    setShowProfileModal(true);
    setShowProfileDropdown(false);
  }, []);

  const handleRequestAddIdea = useCallback(({ longitude, latitude }) => {
    setClickedCoordinates({ longitude, latitude });
        setCreateType('idea');
        setShowCreateModal(true);
  }, []);

  const handleCreateMovementFromAI = useCallback((draft, selectionFromAI) => {
    setAiMovementDraft({
      name: draft?.name || '',
      description: draft?.description || '',
      city: draft?.city || '',
      state: draft?.state || '',
      selection: selectionFromAI || null
    });
    setCreateType('movement');
    setShowCreateModal(true);
    setShowIntelligenceLayer(false);
  }, []);

  const handleMovementSelect = async (movement) => {
    // Track if we were searching before viewing movement
    const wasInSearch = searchQuery.trim().length > 0;
    setWasSearching(wasInSearch);
    
    // Hide search bar when viewing movement
    if (wasInSearch) {
      setShowSearch(false);
    }
    
    // Show loading state
    setIsMovementLoading(true);
    setViewMode('movement-details');
    
    // Fetch full movement details with membership info
    try {
      const response = await apiCall('get', `/movements/${movement.id}`);
      if (response.data.movement) {
        setSelectedMovement(response.data.movement);
        // Load ideas for this movement
        await loadIdeas(movement.id);
      } else {
        // Fallback to basic movement data
        setSelectedMovement(movement);
        await loadIdeas(movement.id);
      }
    } catch (error) {
      console.error('Error loading movement details:', error);
      // Fallback to basic movement data
      setSelectedMovement(movement);
      await loadIdeas(movement.id);
    } finally {
      setIsMovementLoading(false);
    }
  };

  const handleIdeaSelect = useCallback(async (idea) => {
    try {
      // Fetch full idea details from API
      const response = await apiCall('get', `/ideas/${idea.id}`);
      if (response.data.idea) {
        setSelectedIdea({
          ...response.data.idea,
          isSupporting: response.data.isSupporting || false
        });
      } else {
        // Fallback to basic idea data if API fails
        setSelectedIdea({ ...idea, isSupporting: false });
      }
    } catch (error) {
      console.error('Error loading idea details:', error);
      // Fallback to basic idea data
      setSelectedIdea({ ...idea, isSupporting: false });
    }
  }, []);

  const handleSupportIdea = async (ideaId) => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }

    try {
      const response = await apiCall('post', `/ideas/${ideaId}/support`);
      const isSupporting = response.data.supported;
      const supporterCount = response.data.supporterCount || 0;
      
      // Update the selected idea's support status and count
      if (selectedIdea && selectedIdea.id === ideaId) {
        setSelectedIdea({
          ...selectedIdea,
          isSupporting,
          _count: {
            ...selectedIdea._count,
            supporters: supporterCount
          }
        });
      }

      // Also update the idea in the ideas list
      setIdeas(prevIdeas => 
        prevIdeas.map(idea => {
          if (idea.id === ideaId) {
            return {
              ...idea,
              isSupporting,
              _count: {
                ...idea._count,
                supporters: supporterCount
              }
            };
          }
          return idea;
        })
      );
    } catch (error) {
      console.error('Error supporting idea:', error);
    }
  };

  // Since we're using API search, movements are already filtered
  // But we can still do client-side filtering as a fallback or for additional refinement
  const filteredMovements = movements;

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden" style={{ height: '100vh' }}>
      <div ref={headerRef} className="relative z-[200]">
        <Header
        isDark={isDark}
        toggleTheme={toggleTheme}
        viewMode={viewMode}
        selectedMovement={selectedMovement}
        onBackToMovements={handleBackToMovements}
        showSearch={showSearch}
        onToggleSearch={() => setShowSearch(!showSearch)}
        currentUser={currentUser}
        onCreateClick={handleCreateClick}
        showProfileDropdown={showProfileDropdown}
        onToggleProfileDropdown={() => setShowProfileDropdown(!showProfileDropdown)}
        profileDropdownRef={profileDropdownRef}
        onProfileClick={handleProfileClick}
        onSignOut={handleSignOut}
        onSignInClick={() => setShowAuthModal(true)}
        searchQuery={searchQuery}
        onSearchChange={(value) => {
          setSearchQuery(value);
          if (!showSearch) {
            setShowSearch(true);
          }
        }}
        onTagClick={(tag) => {
          if (viewMode === 'movement-details' && selectedMovement) {
            setReturnToMovement({ movement: selectedMovement, ideas: ideas || [] });
          }
          setSearchQuery(tag);
          if (!showSearch) setShowSearch(true);
          if (viewMode === 'movement-details') {
            setViewMode('movements');
            setSelectedMovement(null);
            setIdeas([]);
          }
        }}
        onClearSearch={handleClearSearch}
        showIntelligenceLayer={showIntelligenceLayer}
        onToggleIntelligence={() => setShowIntelligenceLayer(prev => !prev)}
        />
      </div>

      <div className="flex-1 relative min-h-0 overflow-hidden w-full" style={{ minHeight: 200 }}>
        <div className="absolute inset-0 z-0 overflow-hidden">
          <div
            ref={mapContainer}
            className="absolute inset-0 z-0 h-full w-full min-h-0 min-w-0"
          />
        </div>

        {/* Map controls: 3D + optional land-cover overlay (Phase 1: sample GeoJSON) */}
        {mapInitStarted && !mapError && (
          <div className="absolute left-4 top-4 z-[90] flex flex-col gap-2 pointer-events-none">
            <button
              type="button"
              onClick={() => setIs3DMode(prev => !prev)}
              className={`pointer-events-auto px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm ${
                is3DMode
                  ? 'bg-gray-900 text-white border-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-200'
                  : 'bg-white/95 text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900/95 dark:text-gray-200 dark:border-gray-600'
              }`}
              aria-pressed={is3DMode}
            >
              {is3DMode ? '3D view on' : '3D view off'}
            </button>
            {SHOW_LAND_COVER_TOGGLE && (
              <button
                type="button"
                onClick={() => setShowLandCoverOverlay(prev => !prev)}
                className={`pointer-events-auto px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm ${
                  showLandCoverOverlay
                    ? 'bg-emerald-800 text-white border-emerald-900'
                    : 'bg-white/95 text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900/95 dark:text-gray-200 dark:border-gray-600'
                }`}
                aria-pressed={showLandCoverOverlay}
                title="Demo land-cover polygons near New Orleans (preprocessed GeoJSON)"
              >
                {showLandCoverOverlay ? 'Land cover on' : 'Land cover off'}
              </button>
            )}
            {SHOW_MI_CANOPY_TOGGLE && (
              <button
                type="button"
                onClick={() => setShowMiCanopyOverlay(prev => !prev)}
                className={`pointer-events-auto px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm ${
                  showMiCanopyOverlay
                    ? 'bg-lime-800 text-white border-lime-900'
                    : 'bg-white/95 text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900/95 dark:text-gray-200 dark:border-gray-600'
                }`}
                aria-pressed={showMiCanopyOverlay}
                title="Michigan block-group tree canopy % (Tree Equity GeoJSON)"
              >
                {showMiCanopyOverlay ? 'MI canopy on' : 'MI canopy off'}
              </button>
            )}
          </div>
        )}

        {/* Intelligence mode back button */}
        {showIntelligenceLayer && viewMode === 'movements' && (
          <button
            type="button"
            onClick={() => setShowIntelligenceLayer(false)}
            className={`absolute left-4 z-[90] pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-white/95 dark:bg-gray-900/95 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-md hover:shadow-lg ${intelligenceBackButtonTopClass()}`}
          >
            <span className="-ml-1">&lt;</span>
            <span>Explore</span>
          </button>
        )}

        {mapInitStarted && !mapReady && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800/90 z-[1]" aria-live="polite">
            <div className="flex flex-col items-center gap-3 text-gray-600 dark:text-gray-300">
              <div className="w-10 h-10 border-2 border-gray-300 border-t-gray-600 dark:border-gray-500 dark:border-t-gray-200 rounded-full animate-spin" />
              <p className="text-sm font-medium">Loading map…</p>
              <p className="text-xs opacity-80">Slow connection? This may take a moment.</p>
            </div>
          </div>
        )}

        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800/95 z-[1] p-4" role="alert">
            <div className="flex flex-col items-center gap-3 text-center max-w-sm">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Map couldn’t load</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{mapError}</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">Check your connection and refresh the page.</p>
            </div>
          </div>
        )}

        {viewMode === 'movement-details' && selectedMovement ? (
          <>
            {isMovementLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm z-10">
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
                  <p className="text-sm text-gray-600">Loading movement details…</p>
                </div>
              </div>
            )}
            <MovementDetailsPage
              mapRef={map}
              markersRef={ideaMarkersRef}
              movement={selectedMovement}
              ideas={ideas}
              currentUser={currentUser}
              socket={socket}
              isConnected={isConnected}
              mapReady={mapReady}
              apiCall={apiCall}
              onBack={() => {
                setViewMode('movements');
                setSelectedMovement(null);
                setIdeas([]);
                if (wasSearching) {
                  setShowSearch(true);
                  setWasSearching(false);
                }
              }}
              onIdeaSelect={handleIdeaSelect}
              onLocationClick={(city, state) => {
                setViewMode('movements');
                setSelectedMovement(null);
                setIdeas([]);
                setSearchQuery(`${city}, ${state}`);
                setShowSearch(true);
                setWasSearching(false);
              }}
              onTagClick={(tag) => {
                setReturnToMovement({ movement: selectedMovement, ideas: ideas || [] });
                setViewMode('movements');
                setSelectedMovement(null);
                setIdeas([]);
                setSearchQuery(tag);
                setShowSearch(true);
              }}
              onFollowChange={async (movementId) => {
                try {
                  const response = await apiCall('get', `/movements/${movementId}`);
                  if (response.data.movement) {
                    setSelectedMovement(response.data.movement);
                  }
                  loadMovements();
                } catch (error) {
                  console.error('Error reloading movement:', error);
                }
              }}
              onRequestAddIdea={handleRequestAddIdea}
              loadIdeas={loadIdeas}
              isIdeaOpen={!!selectedIdea}
            />
          </>
        ) : (
          <MovementsPage
            mapRef={map}
            markersRef={movementMarkersRef}
            movements={filteredMovements}
            searchResults={searchResults}
            isSearching={isSearching}
            searchQuery={searchQuery}
            onSearchChange={(value) => {
              setSearchQuery(value);
              if (!showSearch) setShowSearch(true);
              if (viewMode === 'movement-details' && value.trim()) {
                setViewMode('movements');
                setSelectedMovement(null);
                setIdeas([]);
              }
            }}
            onMovementSelect={handleMovementSelect}
            onIdeaSelect={handleIdeaSelect}
            showSearch={showSearch}
            onClearSearch={handleClearSearch}
            setPreviewMovement={setPreviewMovement}
            returnToMovement={returnToMovement}
            onBackFromTagSearch={handleBackFromTagSearch}
            showIntelligenceLayer={showIntelligenceLayer}
            onToggleIntelligence={() => setShowIntelligenceLayer(prev => !prev)}
          />
        )}
      </div>

      {previewMovement && (
        <MovementPreviewModal
          movement={previewMovement}
          onClose={() => setPreviewMovement(null)}
          onViewFullPage={async () => {
            setPreviewMovement(null);
            await handleMovementSelect(previewMovement);
          }}
          onTagClick={(tag) => {
            setPreviewMovement(null);
            setSearchQuery(tag);
            setShowSearch(true);
          }}
        />
      )}

      {selectedIdea && (
        <IdeaModal 
          idea={selectedIdea}
          currentUser={currentUser}
          onClose={() => {
            setSelectedIdea(null);
            if (viewMode !== 'movement-details' && selectedMovement) {
              setViewMode('movement-details');
            }
          }}
          onSupport={handleSupportIdea}
          socket={socket}
          isConnected={isConnected}
          apiCall={apiCall}
          onIdeaUpdate={(updatedIdea) => {
            setSelectedIdea(updatedIdea);
            if (selectedMovement) {
              setIdeas(prevIdeas =>
                prevIdeas.map(i => i.id === updatedIdea.id ? updatedIdea : i)
              );
            }
          }}
        />
      )}

      {showAuthModal && (
        <AuthModal 
          mode={authMode}
          onClose={() => setShowAuthModal(false)}
          onSwitchMode={(newMode) => setAuthMode(newMode)}
          onSuccess={(user) => {
            setCurrentUser(user);
            setShowAuthModal(false);
          }}
          apiCall={apiCall}
        />
      )}

      {showCreateModal && (
        <CreateModal
          type={createType}
          movement={selectedMovement}
          initialCoordinates={clickedCoordinates}
          initialMovementDraft={aiMovementDraft}
          mapRef={map}
          apiCall={apiCall}
          onClose={() => {
            setShowCreateModal(false);
            setClickedCoordinates(null);
            setAiMovementDraft(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setClickedCoordinates(null);
            setAiMovementDraft(null);
            loadMovements();
            // Reload ideas if viewing a movement
            if (selectedMovement) {
              loadIdeas(selectedMovement.id);
            }
          }}
        />
      )}

      {showIntelligenceLayer && (
        <IntelligenceModal
          mapRef={map}
          mapReady={mapReady}
          apiCall={apiCall}
          isDark={isDark}
          onClose={() => setShowIntelligenceLayer(false)}
          onCreateMovementFromAI={handleCreateMovementFromAI}
          onIntelligenceLoadingChange={setIntelligenceMapLoading}
        />
      )}

      {showProfileModal && currentUser && (
        <ProfileModal
          currentUser={currentUser}
          onClose={() => setShowProfileModal(false)}
          onUserUpdate={(updatedUser) => setCurrentUser(updatedUser)}
          onSignOut={handleSignOut}
          onMovementSelect={handleMovementSelect}
          onIdeaSelect={handleIdeaSelect}
          apiCall={apiCall}
        />
      )}
    </div>
  );
};

export default PlotApp;
