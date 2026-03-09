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

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Helper function to make authenticated API calls
// Cookies are automatically sent with requests when credentials: 'include' is set
const apiCall = async (method, endpoint, data = null) => {
  const config = {
    method,
    url: `${API_BASE_URL}${endpoint}`,
    headers: {
      'Content-Type': 'application/json'
    },
    withCredentials: true, // Include cookies in requests
    ...(data && { data })
  };
  return axios(config);
};

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
  const movementMarkersRef = useRef([]);
  const ideaMarkersRef = useRef([]);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const profileDropdownRef = useRef(null);
  const [isMovementLoading, setIsMovementLoading] = useState(false);
  const [previewMovement, setPreviewMovement] = useState(null);
  const [returnToMovement, setReturnToMovement] = useState(null);
  const [showIntelligenceLayer, setShowIntelligenceLayer] = useState(false);

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

    // Previous isDark-based styles (revert by uncommenting and removing custom style):
    // const initialStyle = isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12';
    const initialStyle = 'mapbox://styles/leidio/cmlbfxs1i003101quh2aah4sb';

    setMapInitStarted(true);
    setMapError(null);
    map.current = new mapboxgl.Map({
      container,
      style: initialStyle,
      center: [-90.0715, 29.9511], // Default to New Orleans
      zoom: 12
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
        if (layer.id.includes('poi-label')) {
          // Show landmarks & civic places, hide restaurants/shops/lodging
          map.current.setFilter(layer.id, [
            'all',
            ['match',
              ['get', 'class'],
              ['landmark', 'park', 'cemetery', 'place_of_worship', 'school', 
               'college', 'hospital', 'library', 'museum', 'stadium', 
               'zoo', 'aquarium', 'golf', 'historic', 'arts_centre',
               'monument', 'education', 'medical', 'attraction',
               'arts_and_entertainment', 'tourist_attraction', 'visitor_centre',
               'gallery', 'theatre', 'cinema', 'general'],
              true,
              false
            ]
          ]);
        }
      });
    };

    // Run on idle (after all rendering complete) for initial load
    map.current.once('idle', filterPOILayers);
    
    // Run on style changes (theme toggle)
    map.current.on('style.load', filterPOILayers);

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
        map.current.off('style.load', filterPOILayers);
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

  // Set map container height explicitly based on available space
  useEffect(() => {
    const updateMapHeight = () => {
      if (headerRef.current && mapContainer.current?.parentElement) {
        const headerHeight = headerRef.current.offsetHeight;
        const searchBarHeight = viewMode !== 'movements' && showSearch
          ? document.querySelector('[data-search-bar]')?.offsetHeight || 0
          : 0;
        const availableHeight = Math.max(
          200,
          window.innerHeight - headerHeight - searchBarHeight
        );
        mapContainer.current.parentElement.style.height = `${availableHeight}px`;
        if (map.current) {
          map.current.resize();
        }
      }
    };

    updateMapHeight();
    window.addEventListener('resize', updateMapHeight);
    return () => window.removeEventListener('resize', updateMapHeight);
  }, [viewMode, showSearch, mapReady]);

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
      <div ref={headerRef}>
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

      {showSearch && viewMode !== 'movements' && (
        <div data-search-bar className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 relative flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // If on movement page, close it and show search results
              if (viewMode === 'movement-details' && searchQuery.trim()) {
                setViewMode('movements');
                setSelectedMovement(null);
                setIdeas([]);
              }
            }}
            className="relative"
          >
            <input
              type="text"
              placeholder="Search movements, ideas, locations..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // If on movement page and user starts typing, close it and show search results
                if (viewMode === 'movement-details' && e.target.value.trim()) {
                  setViewMode('movements');
                  setSelectedMovement(null);
                  setIdeas([]);
                }
              }}
              className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
              autoFocus
            />
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              aria-label="Close search"
            >
              <X className="w-5 h-5" />
            </button>
          </form>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden w-full" style={{ minHeight: 200 }}>
        <div ref={mapContainer} className="absolute inset-0 z-0" style={{ width: '100%', height: '100%' }} />

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
            // Ensure we're on the Movement page (if we were viewing a movement)
            if (viewMode === 'movement-details' && selectedMovement) {
              // Already on movement page, just close the modal
            } else if (selectedMovement) {
              // If we have a selected movement but not in movement-details view, go back to it
              setViewMode('movement-details');
            }
          }}
          onSupport={handleSupportIdea}
          socket={socket}
          isConnected={isConnected}
          apiCall={apiCall}
          onIdeaUpdate={(updatedIdea) => {
            setSelectedIdea(updatedIdea);
            // Also update in ideas list if viewing movement details
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
          mapRef={map}
          apiCall={apiCall}
          onClose={() => {
            setShowCreateModal(false);
            setClickedCoordinates(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setClickedCoordinates(null);
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
