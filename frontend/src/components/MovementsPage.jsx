import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MovementsList from './MovementsList';
import SearchResultsPanel from './SearchResultsPanel';
import MovementPreviewModal from './MovementPreviewModal';
import HoverPreviewModal from './HoverPreviewModal';
import { useMovementMarkers } from '../hooks/useMovementMarkers';

const MovementsPage = ({
  movements,
  searchResults,
  isSearching,
  searchQuery,
  onSearchChange,
  onMovementSelect,
  onIdeaSelect,
  currentUser,
  showSearch,
  onClearSearch
}) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [previewMovement, setPreviewMovement] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-90.0715, 29.9511],
      zoom: 12
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'bottom-left');

    const handleLoad = () => setMapReady(true);
    mapRef.current.on('load', handleLoad);

    return () => {
      if (mapRef.current) {
        mapRef.current.off('load', handleLoad);
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady || userLocation) return;
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });
        mapRef.current.flyTo({
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

  useMovementMarkers({
    mapRef,
    markersRef,
    viewMode: 'movements',
    movements,
    showSearch,
    setHoveredItem,
    setPreviewMovement
  });

  const handleSearchSubmit = (e) => {
    e.preventDefault();
  };

  return (
    <>
      {showSearch && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <form onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Search movements, ideas, locations..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
          </form>
        </div>
      )}

      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="absolute inset-0" />

        <div className="absolute inset-0 pointer-events-none flex">
          <div className="flex-1" />
          <div className="pointer-events-auto w-96 bg-white border-l border-gray-200 overflow-y-auto">
            {searchQuery.trim() ? (
              <SearchResultsPanel
                searchQuery={searchQuery}
                results={searchResults}
                isSearching={isSearching}
                onMovementSelect={onMovementSelect}
                onIdeaSelect={onIdeaSelect}
                onClear={onClearSearch}
              />
            ) : (
              <MovementsList
                movements={movements}
                onSelect={onMovementSelect}
                onTagClick={(tag) => onSearchChange(tag)}
              />
            )}
          </div>
        </div>
      </div>

      {previewMovement && (
        <MovementPreviewModal
          movement={previewMovement}
          onClose={() => setPreviewMovement(null)}
          onViewFullPage={async () => {
            setPreviewMovement(null);
            await onMovementSelect(previewMovement);
          }}
        />
      )}

      <HoverPreviewModal hoveredItem={hoveredItem} />
    </>
  );
};

export default MovementsPage;

