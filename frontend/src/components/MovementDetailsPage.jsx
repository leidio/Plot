import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MovementView from './MovementView';
import HoverPreviewModal from './HoverPreviewModal';

const MovementDetailsPage = ({
  movement,
  ideas,
  currentUser,
  socket,
  isConnected,
  onBack,
  onIdeaSelect,
  onLocationClick,
  onTagClick,
  onFollowChange,
  onRequestAddIdea
}) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [addIdeaMode, setAddIdeaMode] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);

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
    if (!mapRef.current || !mapReady) return;
    const mapInstance = mapRef.current;

    const handleMapClick = (e) => {
      if (addIdeaMode && movement && currentUser) {
        const { lng, lat } = e.lngLat;
        onRequestAddIdea({ longitude: lng, latitude: lat });
        setAddIdeaMode(false);
      }
    };

    if (addIdeaMode) {
      if (mapInstance.getCanvas()) {
        mapInstance.getCanvas().style.cursor = 'crosshair';
      }
      mapInstance.on('click', handleMapClick);
    } else {
      if (mapInstance.getCanvas()) {
        mapInstance.getCanvas().style.cursor = '';
      }
    }

    return () => {
      mapInstance.off('click', handleMapClick);
      if (mapInstance.getCanvas()) {
        mapInstance.getCanvas().style.cursor = '';
      }
    };
  }, [addIdeaMode, movement, currentUser, mapReady, onRequestAddIdea]);

  return (
    <div className="flex-1 relative">
      <div ref={mapContainerRef} className="absolute inset-0" />
      <MovementView
        movement={movement}
        ideas={ideas}
        currentUser={currentUser}
        map={mapRef}
        markersRef={markersRef}
        socket={socket}
        isConnected={isConnected}
        setHoveredItem={setHoveredItem}
        onBack={onBack}
        onIdeaSelect={onIdeaSelect}
        onCreateIdea={() => setAddIdeaMode(true)}
        addIdeaMode={addIdeaMode}
        onLocationClick={onLocationClick}
        onFollowChange={onFollowChange}
        onTagClick={onTagClick}
        onCancelAddIdea={() => setAddIdeaMode(false)}
      />
      <HoverPreviewModal hoveredItem={hoveredItem} />
    </div>
  );
};

export default MovementDetailsPage;

