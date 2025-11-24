import React, { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { Search, Plus, Heart, Share2, DollarSign, Users, MapPin, Filter, Bell, User, X, Check, ChevronUp, ChevronDown, Lightbulb, Star, LogOut, Settings, Trash2, Mail, Lock, Moon, Sun, MessageSquare, Activity } from 'lucide-react';
import { useTheme } from './hooks/useTheme';
import { useWebSocket } from './hooks/useWebSocket';
import { useMovementMarkers } from './hooks/useMovementMarkers';
import { useMovements } from './hooks/useMovements';
import { useIdeas } from './hooks/useIdeas';
import HoverPreviewModal from './components/HoverPreviewModal';
import MovementView from './components/MovementView';
import IdeaModal from './components/IdeaModal';
import MovementPreviewModal from './components/MovementPreviewModal';
import MovementsList from './components/MovementsList';
import SearchResultsPanel from './components/SearchResultsPanel';
import AuthModal from './components/AuthModal';
import CreateModal from './components/CreateModal';
import ProfileModal from './components/ProfileModal';
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
  const [showSearch, setShowSearch] = useState(false);
  const [wasSearching, setWasSearching] = useState(false); // Track if we were searching before viewing movement
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState('movement');
  const [clickedCoordinates, setClickedCoordinates] = useState(null);
  const [addIdeaMode, setAddIdeaMode] = useState(false);
  const markersRef = useRef([]);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const profileDropdownRef = useRef(null);
  const [hoveredItem, setHoveredItem] = useState(null); // { type: 'movement' | 'idea', item: {}, position: { x, y } }
  
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

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setShowSearch(false);
    setWasSearching(false);
        loadMovements();
  }, [setSearchQuery, setShowSearch, setWasSearching, loadMovements]);

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
                  onClear={handleClearSearch}
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
          apiCall={apiCall}
        />
      )}

      {showCreateModal && (
        <CreateModal
          type={createType}
          movement={selectedMovement}
          initialCoordinates={clickedCoordinates}
          apiCall={apiCall}
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
          apiCall={apiCall}
        />
      )}

      {/* Hover Preview Modal */}
      <HoverPreviewModal hoveredItem={hoveredItem} />
    </div>
  );
};

export default PlotApp;
