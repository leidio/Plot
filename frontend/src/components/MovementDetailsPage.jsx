import React, { useCallback, useEffect, useState } from 'react';
import MovementView from './MovementView';
import HoverPreviewModal from './HoverPreviewModal';

const MovementDetailsPage = ({
  mapRef,
  markersRef,
  movement,
  ideas,
  currentUser,
  socket,
  isConnected,
  mapReady,
  onBack,
  onIdeaSelect,
  onLocationClick,
  onTagClick,
  onFollowChange,
  onRequestAddIdea,
  apiCall,
  loadIdeas
}) => {
  const [addIdeaMode, setAddIdeaMode] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);

  // Convert a mouse event (viewport coords) to lng/lat and request add idea.
  // Used by the map-area overlay so clicks are handled in React instead of relying on map click.
  const handleMapAreaClick = useCallback(
    (event) => {
      if (!mapRef?.current || !movement || !currentUser || !addIdeaMode) return;

      const mapInstance = mapRef.current;
      const container = mapInstance.getContainer();
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const point = [x, y];
      const ideaFeatures = mapInstance.queryRenderedFeatures(point, {
        layers: ['ideas-unclustered', 'ideas-clusters']
      });
      if (ideaFeatures && ideaFeatures.length > 0) return;

      const lngLat = mapInstance.unproject(point);
      onRequestAddIdea({ longitude: lngLat.lng, latitude: lngLat.lat });
      setAddIdeaMode(false);
    },
    [addIdeaMode, mapRef, movement, currentUser, onRequestAddIdea]
  );

  useEffect(() => {
    if (!mapRef?.current || !mapReady) return;
    const mapInstance = mapRef.current;

    if (addIdeaMode && mapInstance.getCanvas()) {
      mapInstance.getCanvas().style.cursor = 'crosshair';
    }

    return () => {
      if (mapInstance.getCanvas()) {
        mapInstance.getCanvas().style.cursor = '';
      }
    };
  }, [addIdeaMode, mapReady, mapRef]);

  return (
    <>
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
        onMapAreaClick={addIdeaMode ? handleMapAreaClick : undefined}
        onLocationClick={onLocationClick}
        onFollowChange={onFollowChange}
        onTagClick={onTagClick}
        apiCall={apiCall}
        loadIdeas={loadIdeas}
      />
      <HoverPreviewModal hoveredItem={hoveredItem} />
    </>
  );
};

export default MovementDetailsPage;

