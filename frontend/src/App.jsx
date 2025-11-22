import React, { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Search, Plus, Heart, Share2, DollarSign, Users, MapPin, Filter, Bell, User, X, Check, ChevronUp, ChevronDown, Lightbulb, Star, LogOut, Settings, Trash2, Mail, Lock, Moon, Sun, MessageSquare, Activity } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { useWebSocket } from './hooks/useWebSocket';
import { useMovementMarkers } from './hooks/useMovementMarkers';
import HoverPreviewModal from './components/HoverPreviewModal';
import MovementView from './components/MovementView';
import IdeaModal from './components/IdeaModal';
import MovementPreviewModal from './components/MovementPreviewModal';
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
  const { isDark, toggleTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState(null);
  const [viewMode, setViewMode] = useState('movements');
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [previewMovement, setPreviewMovement] = useState(null);
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [movements, setMovements] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState({ movements: [], ideas: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [wasSearching, setWasSearching] = useState(false); // Track if we were searching before viewing movement
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState('movement');
  const [clickedCoordinates, setClickedCoordinates] = useState(null);
  const [addIdeaMode, setAddIdeaMode] = useState(false);
  const markersRef = useRef([]);
  const searchDebounceTimerRef = useRef(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const profileDropdownRef = useRef(null);
  const [hoveredItem, setHoveredItem] = useState(null); // { type: 'movement' | 'idea', item: {}, position: { x, y } }
  
  // WebSocket setup - get token from cookies via API call
  const [wsToken, setWsToken] = useState(null);
  const { socket, isConnected } = useWebSocket(wsToken, true);

  const loadMovements = useCallback(async (city = null, state = null) => {
    try {
      const params = new URLSearchParams();
      if (city) params.append('city', city);
      if (state) params.append('state', state);
      const queryString = params.toString();
      const url = `/movements${queryString ? `?${queryString}` : ''}`;
      const response = await apiCall('get', url);
      setMovements(response.data.movements || []);
    } catch (error) {
      console.error('Error loading movements:', error);
      setMovements([]);
    }
  }, []);

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
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-90.0715, 29.9511], // Default to New Orleans
      zoom: 12
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-left');

    const handleLoad = () => setMapReady(true);
    map.current.on('load', handleLoad);

    return () => {
      if (map.current) {
        map.current.off('load', handleLoad);
      }
    };
  }, []);

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

  // Add/update click handler for creating ideas
  useEffect(() => {
    if (!map.current) return;

    const handleMapClick = (e) => {
      // Only allow clicking to create ideas when in add idea mode
      if (addIdeaMode && viewMode === 'movement-details' && selectedMovement && currentUser) {
        const { lng, lat } = e.lngLat;
        setClickedCoordinates({ longitude: lng, latitude: lat });
        setCreateType('idea');
        setShowCreateModal(true);
        setAddIdeaMode(false); // Exit add idea mode after clicking
      }
    };

    // Change cursor style when in add idea mode to indicate map is clickable
    if (addIdeaMode && viewMode === 'movement-details' && selectedMovement && currentUser) {
      if (map.current.getCanvas()) {
        map.current.getCanvas().style.cursor = 'crosshair';
      }
    } else {
      if (map.current.getCanvas()) {
        map.current.getCanvas().style.cursor = '';
      }
    }

    // Only add click handler if we're in movement-details view
    if (viewMode === 'movement-details') {
      map.current.on('click', handleMapClick);
    }

    return () => {
      if (map.current) {
        map.current.off('click', handleMapClick);
        if (map.current.getCanvas()) {
          map.current.getCanvas().style.cursor = '';
        }
      }
    };
  }, [viewMode, selectedMovement, currentUser, addIdeaMode]);

  useMovementMarkers({
    mapRef: map,
    markersRef,
    viewMode,
    movements,
    showSearch,
    setHoveredItem,
    setPreviewMovement
  });

  // Global search with debouncing
  useEffect(() => {
    let refreshRafId = null;
    // Clear previous timer
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }

    // If search query is empty, load all movements and clear search results
    if (!searchQuery.trim()) {
      refreshRafId = requestAnimationFrame(() => {
        loadMovements();
      });
      setSearchResults({ movements: [], ideas: [] });
      setIsSearching(false);
      return;
    }

    // Debounce search API call
    setIsSearching(true);
    searchDebounceTimerRef.current = setTimeout(async () => {
      try {
        // Search for both movements and ideas
        const response = await apiCall('get', `/search?q=${encodeURIComponent(searchQuery)}`);
        const results = {
          movements: response.data.movements || [],
          ideas: response.data.ideas || []
        };
        setSearchResults(results);
        // Update movements for map markers
        setMovements(results.movements);
        setIsSearching(false);
      } catch (error) {
        console.error('Error searching:', error);
        setSearchResults({ movements: [], ideas: [] });
        setIsSearching(false);
        // Fallback to local filtering if API fails
      }
    }, 300); // 300ms debounce

    // Cleanup function
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
      if (refreshRafId) {
        cancelAnimationFrame(refreshRafId);
      }
    };
  }, [searchQuery, loadMovements]);

  const loadIdeas = async (movementId) => {
    try {
      console.log('Loading ideas for movement:', movementId);
      const response = await apiCall('get', `/ideas?movementId=${movementId}`);
      const loadedIdeas = response.data.ideas || [];
      console.log('Ideas loaded:', loadedIdeas.length, 'ideas', loadedIdeas);
      setIdeas(loadedIdeas);
      // Force a small delay to ensure state update propagates
      setTimeout(() => {
        console.log('Ideas state should be updated now');
      }, 100);
    } catch (error) {
      console.error('Error loading ideas:', error);
      console.error('Error details:', {
        response: error.response?.data,
        status: error.response?.status
      });
      // Fallback to empty array on error
      setIdeas([]);
    }
  };

  const handleMovementSelect = async (movement) => {
    // Track if we were searching before viewing movement
    const wasInSearch = searchQuery.trim().length > 0;
    setWasSearching(wasInSearch);
    
    // Hide search bar when viewing movement
    if (wasInSearch) {
      setShowSearch(false);
    }
    
    // Fetch full movement details with membership info
    try {
      const response = await apiCall('get', `/movements/${movement.id}`);
      if (response.data.movement) {
        setSelectedMovement(response.data.movement);
        setViewMode('movement-details');
        // Load ideas for this movement
        await loadIdeas(movement.id);
      } else {
        // Fallback to basic movement data
        setSelectedMovement(movement);
        setViewMode('movement-details');
        await loadIdeas(movement.id);
      }
    } catch (error) {
      console.error('Error loading movement details:', error);
      // Fallback to basic movement data
      setSelectedMovement(movement);
      setViewMode('movement-details');
      await loadIdeas(movement.id);
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
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-green-600">Plot</h1>
          {viewMode === 'movement-details' && selectedMovement && (
            <>
              <button 
                onClick={() => {
                  setViewMode('movements');
                  setSelectedMovement(null);
                  setIdeas([]);
                  // Restore search bar and results if we were searching before
                  if (wasSearching) {
                    setShowSearch(true);
                    setWasSearching(false);
                  }
                  if (map.current) {
                    map.current.flyTo({ center: [-98.5795, 39.8283], zoom: 3.5 });
                  }
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← All Movements
              </button>
              <span className="text-gray-300">|</span>
              <span className="font-medium">{selectedMovement.name}</span>
            </>
          )}
        </div>
        
        <div className="flex items-center space-x-3">
          <button 
            onClick={toggleTheme}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <Search className="w-5 h-5" />
          </button>
          
          {currentUser ? (
            <>
              <button className="p-2 hover:bg-gray-100 rounded-lg relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <button 
                onClick={() => {
                  setShowCreateModal(true);
                  setCreateType('movement');
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create</span>
              </button>
              <div className="relative" ref={profileDropdownRef}>
                <button 
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  className="p-2 hover:bg-gray-100 rounded-lg relative"
                >
                  <User className="w-5 h-5" />
                </button>
                {showProfileDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <button
                      onClick={() => {
                        setShowProfileModal(true);
                        setShowProfileDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                    >
                      <User className="w-4 h-4" />
                      <span>Profile</span>
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {showSearch && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
          </form>
        </div>
      )}

      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />

        {viewMode === 'movement-details' && selectedMovement ? (
          <MovementView
            movement={selectedMovement}
            ideas={ideas}
            currentUser={currentUser}
            map={map}
            markersRef={markersRef}
            socket={socket}
            isConnected={isConnected}
            setHoveredItem={setHoveredItem}
            apiCall={apiCall}
            onBack={() => {
              setViewMode('movements');
              setSelectedMovement(null);
              setIdeas([]);
              // Restore search bar and results if we were searching before
              if (wasSearching) {
                setShowSearch(true);
                setWasSearching(false);
              }
            }}
            onIdeaSelect={handleIdeaSelect}
            onCreateIdea={() => {
              setAddIdeaMode(true);
            }}
            addIdeaMode={addIdeaMode}
            onLocationClick={(city, state) => {
              // Navigate back to main page and search by location
              setViewMode('movements');
              setSelectedMovement(null);
              setIdeas([]);
              setSearchQuery(`${city}, ${state}`);
              setShowSearch(true); // Show search box with the location query
              setWasSearching(false); // Reset since we're starting a new search
              // The search effect will automatically trigger and search for movements
            }}
            onTagClick={(tag) => {
              // Navigate back to main page and search by tag
              setViewMode('movements');
              setSelectedMovement(null);
              setIdeas([]);
              setSearchQuery(tag);
              setShowSearch(true); // Show search box with the tag query
              // The search effect will automatically trigger and search for movements
            }}
            onFollowChange={async (movementId) => {
              // Reload movement to get updated member count
              try {
                const response = await apiCall('get', `/movements/${movementId}`);
                if (response.data.movement) {
                  setSelectedMovement(response.data.movement);
                }
                // Also reload movements list to update counts
                loadMovements();
              } catch (error) {
                console.error('Error reloading movement:', error);
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 pointer-events-none flex">
            <div className="flex-1" />
            <div className="pointer-events-auto w-96 bg-white border-l border-gray-200 overflow-y-auto">
              {searchQuery.trim() ? (
                <SearchResultsPanel
                  searchQuery={searchQuery}
                  results={searchResults}
                  isSearching={isSearching}
                  onMovementSelect={handleMovementSelect}
                  onIdeaSelect={handleIdeaSelect}
                />
              ) : (
                <MovementsList 
                  movements={filteredMovements}
                  onSelect={handleMovementSelect}
                  onTagClick={(tag) => {
                    setSearchQuery(tag);
                    setShowSearch(true);
                    // The search effect will automatically trigger and search for movements
                  }}
                />
              )}
            </div>
          </div>
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
        />
      )}

      {showCreateModal && (
        <CreateModal
          type={createType}
          movement={selectedMovement}
          initialCoordinates={clickedCoordinates}
          onClose={() => {
            setShowCreateModal(false);
            setClickedCoordinates(null);
            setAddIdeaMode(false);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setClickedCoordinates(null);
            setAddIdeaMode(false);
            loadMovements();
            // Reload ideas if viewing a movement
            if (selectedMovement) {
              loadIdeas(selectedMovement.id);
            }
          }}
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
        />
      )}

      {/* Hover Preview Modal */}
      <HoverPreviewModal hoveredItem={hoveredItem} />
    </div>
  );
};

const MovementsList = ({ movements, onSelect, onTagClick }) => (
  <div className="p-4">
    <h2 className="text-lg font-semibold mb-4">
      Movements ({movements.length})
    </h2>
    <div className="space-y-3">
      {movements.map(movement => (
        <div
          key={movement.id}
          onClick={() => onSelect(movement)}
          className="p-4 border border-gray-200 rounded-lg hover:border-green-400 cursor-pointer hover:bg-green-50 transition-all"
        >
          <h3 className="font-medium text-gray-900">{movement.name}</h3>
          <p className="text-sm text-gray-600 mt-1">{movement.description}</p>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center space-x-3 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <Users className="w-4 h-4" />
                <span>{movement._count.members}</span>
              </div>
              <div className="flex items-center space-x-1">
                <MapPin className="w-4 h-4" />
                <span>{movement._count.ideas}</span>
              </div>
            </div>
            <span className="text-xs text-gray-400">{movement.city}, {movement.state}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {movement.tags.map(tag => (
              <button
                key={tag}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent triggering movement selection
                  if (onTagClick) onTagClick(tag);
                }}
                className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200 cursor-pointer transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// SearchResultsPanel component
const SearchResultsPanel = ({ searchQuery, results, isSearching, onMovementSelect, onIdeaSelect }) => {
  const movementsCount = results.movements?.length || 0;
  const ideasCount = results.ideas?.length || 0;
  const totalCount = movementsCount + ideasCount;

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Search Results</h2>
        {isSearching ? (
          <p className="text-sm text-gray-500">Searching...</p>
        ) : (
          <p className="text-sm text-gray-600">
            Found <span className="font-medium">Movements ({movementsCount})</span>, <span className="font-medium">Ideas ({ideasCount})</span>
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">for "{searchQuery}"</p>
      </div>

      {isSearching ? (
        <div className="text-center py-8 text-gray-500">
          <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin"></div>
          <p className="mt-2">Searching...</p>
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No results found for "{searchQuery}"</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Movements Section */}
          {movementsCount > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Movements ({movementsCount})
              </h3>
              <div className="space-y-3">
                {results.movements.map(movement => (
                  <div
                    key={movement.id}
                    onClick={() => onMovementSelect(movement)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-green-400 cursor-pointer hover:bg-green-50 transition-all"
                  >
                    <h4 className="font-medium text-gray-900">{movement.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{movement.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center space-x-3 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Users className="w-4 h-4" />
                          <span>{movement._count?.members || 0}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-4 h-4" />
                          <span>{movement._count?.ideas || 0}</span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{movement.city}, {movement.state}</span>
                    </div>
                    {movement.tags && movement.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {movement.tags.map(tag => (
                          <span
                            key={tag}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ideas Section */}
          {ideasCount > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Ideas ({ideasCount})
              </h3>
              <div className="space-y-3">
                {results.ideas.map(idea => (
                  <div
                    key={idea.id}
                    onClick={() => onIdeaSelect(idea)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer hover:bg-blue-50 transition-all"
                  >
                    <h4 className="font-medium text-gray-900">{idea.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{idea.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center space-x-3 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Heart className="w-4 h-4" />
                          <span>{idea._count?.supporters || 0}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <DollarSign className="w-4 h-4" />
                          <span>${((idea.fundingRaised || 0) / 100).toLocaleString()}</span>
                        </div>
                      </div>
                      {idea.movement && (
                        <span className="text-xs text-gray-400">{idea.movement.name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MovementDetails = ({ movement, ideas, currentUser, addIdeaMode, onIdeaSelect, onCreateIdea, onCancelAddIdea }) => {
  // Check if current user is the owner of the movement
  const isOwner = currentUser && (movement.ownerId === currentUser.id || movement.owner?.id === currentUser.id);
  
  return (
    <div className="p-4">
      <div className="mb-4 pb-4 border-b">
        <h2 className="text-lg font-semibold">{movement.name}</h2>
        <p className="text-sm text-gray-600 mt-1">{movement.description}</p>
        <div className="flex items-center space-x-4 mt-3 text-sm">
          <div className="flex items-center space-x-1 text-gray-500">
            <Users className="w-4 h-4" />
            <span>{movement._count.members} members</span>
          </div>
          <span className="text-gray-400">by {movement.owner.firstName} {movement.owner.lastName}</span>
        </div>
        {!isOwner && (
          <button className="w-full mt-3 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700">
            Join Movement
          </button>
        )}
      </div>
    
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-medium">Ideas ({ideas.length})</h3>
      {!addIdeaMode ? (
        <button 
          onClick={onCreateIdea}
          className="text-sm text-green-600 hover:text-green-700 flex items-center space-x-1"
        >
          <Plus className="w-4 h-4" />
          <span>Add Idea</span>
        </button>
      ) : (
        <button 
          onClick={onCancelAddIdea}
          className="text-sm text-gray-600 hover:text-gray-700 flex items-center space-x-1"
        >
          <X className="w-4 h-4" />
          <span>Cancel</span>
        </button>
      )}
    </div>
    {addIdeaMode && currentUser && (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
        <p className="text-sm text-blue-800 font-medium mb-1">
          💡 Add Idea Mode Active
        </p>
        <p className="text-xs text-blue-700">
          Click anywhere on the map to place your idea at that location
        </p>
      </div>
    )}
    
    <div className="space-y-3">
      {ideas.map(idea => (
        <div
          key={idea.id}
          onClick={() => onIdeaSelect(idea)}
          className="p-3 border border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer hover:bg-blue-50 transition-all"
        >
          <h4 className="font-medium">{idea.title}</h4>
          <p className="text-sm text-gray-600 mt-1">{idea.description}</p>
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>${((idea.fundingRaised || 0) / 100).toLocaleString()}</span>
              <span>${((idea.fundingGoal || 0) / 100).toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-green-600 h-1.5 rounded-full"
                style={{ width: `${idea.fundingGoal > 0 ? Math.min(((idea.fundingRaised || 0) / idea.fundingGoal) * 100, 100) : 0}%` }}
              />
            </div>
          </div>
          <div className="flex items-center space-x-3 mt-2 text-sm text-gray-500">
            <div className="flex items-center space-x-1">
              <Heart className="w-4 h-4" />
              <span>{idea._count?.supporters || 0}</span>
            </div>
            <div className="flex items-center space-x-1">
              <DollarSign className="w-4 h-4" />
              <span>{idea._count?.donations || 0}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
  );
};

const AuthModal = ({ mode, onClose, onSuccess, onSwitchMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const data = mode === 'login' 
        ? { email, password }
        : { email, password, firstName, lastName };

      const response = await apiCall('post', endpoint, data);

      if (response.data.token) {
        // Store token in localStorage
        localStorage.setItem('authToken', response.data.token);
        // Store user data
        if (response.data.user) {
          onSuccess(response.data.user);
        } else {
          onSuccess({ id: '1', firstName: 'User', lastName: '', email });
        }
      } else {
        throw new Error('No token received');
      }
    } catch (err) {
      console.error('Auth error:', err);
      
      // Handle network errors
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        setError('Cannot connect to server. Make sure the backend is running on port 3001.');
      } else if (err.response) {
        // Server responded with error
        const errorMessage = err.response.data?.error?.message || 
                           err.response.data?.message ||
                           `Failed to ${mode === 'login' ? 'sign in' : 'create account'}`;
        setError(errorMessage);
      } else {
        // Other errors
        setError(
          err.message || 
          `Failed to ${mode === 'login' ? 'sign in' : 'create account'}. Please try again.`
        );
      }
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-2xl font-bold mb-4">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <input
                type="text"
                placeholder="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <input
                type="text"
                placeholder="Last Name *"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email *"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          />
          <input
            type="password"
            placeholder="Password *"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            required
          />
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? (mode === 'login' ? 'Signing In...' : 'Creating Account...') : (mode === 'login' ? 'Sign In' : 'Sign Up')}
          </button>
        </form>
        <div className="mt-3 text-center">
          <button 
            onClick={onClose} 
            disabled={loading}
            className="text-gray-600 hover:text-gray-800 disabled:opacity-50 mr-4"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
            disabled={loading}
            className="text-green-600 hover:text-green-700 disabled:opacity-50 text-sm"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

const CreateModal = ({ type, movement, initialCoordinates, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    location: '',
    tags: '',
    address: '',
    fundingGoal: ''
  });
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reverseGeocodedAddress, setReverseGeocodedAddress] = useState('');
  const locationInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Reverse geocode coordinates when provided (for map clicks)
  useEffect(() => {
    if (initialCoordinates && type === 'idea') {
      const reverseGeocode = async () => {
        try {
          const response = await axios.get(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${initialCoordinates.longitude},${initialCoordinates.latitude}.json`,
            {
              params: {
                access_token: mapboxgl.accessToken,
                limit: 1
              }
            }
          );

          if (response.data.features && response.data.features.length > 0) {
            const address = response.data.features[0].place_name;
            setReverseGeocodedAddress(address);
            setFormData(prev => ({ ...prev, address: address }));
          }
        } catch (err) {
          console.error('Reverse geocoding error:', err);
        }
      };
      reverseGeocode();
    }
  }, [initialCoordinates, type]);

  // Fetch location suggestions from Mapbox with debouncing
  const fetchLocationSuggestions = async (query) => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query || query.length < 2) {
      setLocationSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Debounce API calls
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const response = await axios.get(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
          {
            params: {
              access_token: mapboxgl.accessToken,
              country: 'us', // Limit to US
              types: 'place,neighborhood,locality,district,postcode', // Include neighborhoods, cities, etc.
              autocomplete: true,
              limit: 5
            }
          }
        );

        if (response.data.features) {
          setLocationSuggestions(response.data.features);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.error('Location search error:', err);
        setLocationSuggestions([]);
      }
    }, 300); // 300ms debounce
  };

  // Parse location feature to extract city, state, and coordinates
  const parseLocation = (feature) => {
    const context = feature.context || [];
    let city = '';
    let state = '';
    let neighborhood = '';
    
    // Extract city, state, and neighborhood from context
    context.forEach(item => {
      if (item.id.startsWith('place.')) {
        city = item.text;
      } else if (item.id.startsWith('region.')) {
        state = item.short_code?.replace('US-', '') || item.text;
      } else if (item.id.startsWith('neighborhood.')) {
        neighborhood = item.text;
      }
    });

    // Handle different location types
    if (feature.place_type?.includes('neighborhood')) {
      // For neighborhoods, use neighborhood name as city if no city found
      if (!city && feature.text) {
        city = feature.text;
      }
      // Keep neighborhood name if available
      if (neighborhood) {
        city = neighborhood;
      }
    } else if (feature.place_type?.includes('place')) {
      // For cities/towns, use the feature text as city
      city = feature.text;
    }

    // If still no city, use the feature text
    if (!city) {
      city = feature.text;
    }

    // Extract state code
    if (!state) {
      const stateItem = context.find(item => item.id.startsWith('region.'));
      if (stateItem) {
        state = stateItem.short_code?.replace('US-', '') || stateItem.text;
      }
    }

    const [longitude, latitude] = feature.center;
    
    return {
      city,
      state,
      latitude,
      longitude,
      fullName: feature.place_name
    };
  };

  // Handle location input change
  const handleLocationChange = (value) => {
    setFormData(prev => ({ ...prev, location: value }));
    setSelectedLocation(null);
    fetchLocationSuggestions(value);
  };

  // Handle location selection
  const handleLocationSelect = (feature) => {
    const parsed = parseLocation(feature);
    setSelectedLocation(parsed);
    setFormData(prev => ({ ...prev, location: parsed.fullName }));
    setLocationSuggestions([]);
    setShowSuggestions(false);
  };

  // Close suggestions when clicking outside and cleanup
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        locationInputRef.current &&
        !locationInputRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      // Cleanup debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (type === 'movement') {
        // Validate required fields
        if (!formData.name || !formData.description || !selectedLocation) {
          setError('Please fill in all required fields and select a location from the suggestions');
          setLoading(false);
          return;
        }

        // Prepare tags
        const tags = formData.tags
          ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
          : [];

        // Create movement using selected location data
        const response = await apiCall('post', '/movements', {
          name: formData.name,
          description: formData.description,
          city: selectedLocation.city,
          state: selectedLocation.state,
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          tags
        });

        if (response.data.movement) {
          onSuccess();
        } else {
          throw new Error('Failed to create movement');
        }
      } else if (type === 'idea') {
        // Validate required fields
        if (!formData.name || !formData.description || !movement) {
          setError('Please fill in all required fields');
          setLoading(false);
          return;
        }

        // Use coordinates from map click or require them
        const latitude = initialCoordinates?.latitude;
        const longitude = initialCoordinates?.longitude;

        if (!latitude || !longitude) {
          setError('Location is required. Please click on the map to set the location.');
          setLoading(false);
          return;
        }

        // Create idea
        // Convert funding goal from dollars to cents
        const fundingGoalInCents = formData.fundingGoal ? Math.round(parseFloat(formData.fundingGoal) * 100) : 0;
        
        const response = await apiCall('post', '/ideas', {
          title: formData.name,
          description: formData.description,
          movementId: movement.id,
          latitude,
          longitude,
          address: formData.address || reverseGeocodedAddress || '',
          fundingGoal: fundingGoalInCents
        });

        if (response.data.idea) {
          console.log('Idea created successfully:', response.data.idea);
          onSuccess();
        } else {
          console.error('Unexpected response format:', response.data);
          throw new Error('Failed to create idea - invalid response');
        }
      }
    } catch (err) {
      console.error(`Error creating ${type}:`, err);
      console.error('Error details:', {
        response: err.response?.data,
        status: err.response?.status,
        message: err.message
      });
      
      // Handle network errors
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        setError('Cannot connect to server. Make sure the backend is running on port 3001.');
      } else if (err.response) {
        // Server responded with error
        const errorMessage = err.response.data?.error?.message || 
                           err.response.data?.message ||
                           `Failed to create ${type}`;
        setError(errorMessage);
      } else {
        // Other errors
        setError(
          err.message || 
          `Failed to create ${type}. Please try again.`
        );
      }
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
          Create {type === 'movement' ? 'Movement' : 'Idea'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder={type === 'movement' ? 'Movement Name *' : 'Idea Title'}
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          <div>
            <textarea
              placeholder="Description *"
              rows={4}
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          {type === 'movement' ? (
            <div className="relative" ref={locationInputRef}>
              <input
                type="text"
                placeholder="Location (neighborhood, city, state) *"
                value={formData.location}
                onChange={(e) => handleLocationChange(e.target.value)}
                onFocus={() => formData.location && setShowSuggestions(true)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
                autoComplete="off"
              />
              {showSuggestions && locationSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                >
                  {locationSuggestions.map((feature, index) => (
                    <button
                      key={feature.id || index}
                      type="button"
                      onClick={() => handleLocationSelect(feature)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{feature.text}</div>
                      <div className="text-sm text-gray-500 mt-0.5">
                        {feature.place_name?.replace(feature.text + ', ', '')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {selectedLocation && (
                <p className="text-xs text-gray-500 mt-1">
                  Selected: {selectedLocation.city}, {selectedLocation.state}
                </p>
              )}
            </div>
          ) : (
            <>
              {initialCoordinates && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-blue-800">
                    <strong>Location:</strong> {reverseGeocodedAddress || `${initialCoordinates.latitude.toFixed(4)}, ${initialCoordinates.longitude.toFixed(4)}`}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">Click on the map to change location</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input
                    type="text"
                    placeholder="Address (optional)"
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Funding Goal ($)"
                    value={formData.fundingGoal}
                    onChange={(e) => handleChange('fundingGoal', e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            </>
          )}
          {type === 'movement' && (
            <div>
              <input
                type="text"
                placeholder="Tags (comma-separated, optional)"
                value={formData.tags}
                onChange={(e) => handleChange('tags', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-500 mt-1">e.g., sustainability, climate, food justice</p>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          <div className="flex space-x-3">
            <button 
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : `Create ${type === 'movement' ? 'Movement' : 'Idea'}`}
            </button>
            <button 
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 border border-gray-300 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ProfileModal component
const ProfileModal = ({ currentUser, onClose, onUserUpdate, onSignOut, onMovementSelect, onIdeaSelect }) => {
  const [activeTab, setActiveTab] = useState('account');
  const [email, setEmail] = useState(currentUser.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userMovements, setUserMovements] = useState({ created: [], joined: [] });
  const [userIdeas, setUserIdeas] = useState({ created: [], supported: [] });
  const [loadingData, setLoadingData] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadUserData = useCallback(async () => {
    setLoadingData(true);
    try {
      if (activeTab === 'movements') {
        const response = await apiCall('get', '/users/me/movements');
        setUserMovements(response.data);
      } else if (activeTab === 'ideas') {
        const response = await apiCall('get', '/users/me/ideas');
        setUserIdeas(response.data);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoadingData(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'movements' || activeTab === 'ideas') {
      loadUserData();
    }
    // Clear error/success messages when switching tabs
    setError('');
    setSuccess('');
  }, [activeTab, loadUserData]);

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await apiCall('put', '/auth/me/email', { email });
      if (response.data.user) {
        onUserUpdate(response.data.user);
        setSuccess('Email updated successfully');
        setEmail(response.data.user.email);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update email');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await apiCall('put', '/auth/me/password', { currentPassword, newPassword });
      setSuccess('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setLoading(true);
    try {
      await apiCall('delete', '/auth/me');
      onSignOut();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to delete account');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold">Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-gray-200 bg-gray-50 p-4">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('account')}
                className={`w-full text-left px-4 py-2 rounded-lg ${
                  activeTab === 'account' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                Account
              </button>
              <button
                onClick={() => setActiveTab('movements')}
                className={`w-full text-left px-4 py-2 rounded-lg ${
                  activeTab === 'movements' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                My Movements
              </button>
              <button
                onClick={() => setActiveTab('ideas')}
                className={`w-full text-left px-4 py-2 rounded-lg ${
                  activeTab === 'ideas' ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                My Ideas
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Account Information</h3>
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-1">Name</p>
                    <p className="font-medium">{currentUser.firstName} {currentUser.lastName}</p>
                  </div>
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-1">Member since</p>
                    <p className="font-medium">
                      {new Date(currentUser.createdAt).toLocaleDateString('en-US', { 
                        month: 'long', 
                        year: 'numeric' 
                      })}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    Update Email
                  </h3>
                  <form onSubmit={handleUpdateEmail} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        required
                      />
                    </div>
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                        {success}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {loading ? 'Updating...' : 'Update Email'}
                    </button>
                  </form>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Lock className="w-5 h-5" />
                    Change Password
                  </h3>
                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        required
                      />
                    </div>
                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                        {error}
                      </div>
                    )}
                    {success && (
                      <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                        {success}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {loading ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-lg font-semibold mb-4 text-red-600 flex items-center gap-2">
                    <Trash2 className="w-5 h-5" />
                    Delete Account
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Once you delete your account, there is no going back. Please be certain.
                  </p>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                    >
                      Delete Account
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-red-600">Are you sure? This action cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeleteAccount}
                          disabled={loading}
                          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                        >
                          {loading ? 'Deleting...' : 'Yes, Delete Account'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'movements' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">My Movements</h3>
                {loadingData ? (
                  <p className="text-gray-500">Loading...</p>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-medium mb-3">Created ({userMovements.created.length})</h4>
                      {userMovements.created.length > 0 ? (
                        <div className="space-y-2">
                          {userMovements.created.map(movement => (
                            <div
                              key={movement.id}
                              onClick={() => {
                                onMovementSelect(movement);
                                onClose();
                              }}
                              className="p-4 border border-gray-200 rounded-lg hover:border-green-400 cursor-pointer hover:bg-green-50 transition-all"
                            >
                              <h5 className="font-medium">{movement.name}</h5>
                              <p className="text-sm text-gray-600 mt-1">{movement.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span>{movement._count.members} members</span>
                                <span>{movement._count.ideas} ideas</span>
                                <span>{movement.city}, {movement.state}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">You haven't created any movements yet.</p>
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium mb-3">Joined ({userMovements.joined.length})</h4>
                      {userMovements.joined.length > 0 ? (
                        <div className="space-y-2">
                          {userMovements.joined.map(movement => (
                            <div
                              key={movement.id}
                              onClick={() => {
                                onMovementSelect(movement);
                                onClose();
                              }}
                              className="p-4 border border-gray-200 rounded-lg hover:border-green-400 cursor-pointer hover:bg-green-50 transition-all"
                            >
                              <h5 className="font-medium">{movement.name}</h5>
                              <p className="text-sm text-gray-600 mt-1">{movement.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span>{movement._count.members} members</span>
                                <span>{movement._count.ideas} ideas</span>
                                <span>{movement.city}, {movement.state}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">You haven't joined any movements yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'ideas' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">My Ideas</h3>
                {loadingData ? (
                  <p className="text-gray-500">Loading...</p>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-medium mb-3">Created ({userIdeas.created.length})</h4>
                      {userIdeas.created.length > 0 ? (
                        <div className="space-y-2">
                          {userIdeas.created.map(idea => (
                            <div
                              key={idea.id}
                              onClick={() => {
                                onIdeaSelect(idea);
                                onClose();
                              }}
                              className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer hover:bg-blue-50 transition-all"
                            >
                              <h5 className="font-medium">{idea.title}</h5>
                              <p className="text-sm text-gray-600 mt-1">{idea.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span>{idea.movement?.name}</span>
                                <span>{idea._count?.supporters || 0} supporters</span>
                                <span>${((idea.fundingRaised || 0) / 100).toLocaleString()} raised</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">You haven't created any ideas yet.</p>
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium mb-3">Supported ({userIdeas.supported.length})</h4>
                      {userIdeas.supported.length > 0 ? (
                        <div className="space-y-2">
                          {userIdeas.supported.map(idea => (
                            <div
                              key={idea.id}
                              onClick={() => {
                                onIdeaSelect(idea);
                                onClose();
                              }}
                              className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 cursor-pointer hover:bg-blue-50 transition-all"
                            >
                              <h5 className="font-medium">{idea.title}</h5>
                              <p className="text-sm text-gray-600 mt-1">{idea.description}</p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <span>{idea.movement?.name}</span>
                                <span>{idea._count?.supporters || 0} supporters</span>
                                <span>${((idea.fundingRaised || 0) / 100).toLocaleString()} raised</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-gray-500">You haven't supported any ideas yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlotApp;