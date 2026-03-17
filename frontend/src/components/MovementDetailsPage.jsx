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
  loadIdeas,
  isIdeaOpen = false
}) => {
  const [addIdeaMode, setAddIdeaMode] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);

  // In add-idea mode, handle clicks directly on the Mapbox map so pan/zoom still work.
  useEffect(() => {
    if (!mapRef?.current || !mapReady || !addIdeaMode || !movement || !currentUser) return;
    const mapInstance = mapRef.current;

    const handleMapClick = (e) => {
      // Ignore clicks on existing idea markers/clusters
      const ideaFeatures = mapInstance.queryRenderedFeatures(e.point, {
        layers: ['ideas-unclustered', 'ideas-clusters']
      });
      if (ideaFeatures && ideaFeatures.length > 0) return;

      onRequestAddIdea({ longitude: e.lngLat.lng, latitude: e.lngLat.lat });
      setAddIdeaMode(false);
    };

    mapInstance.on('click', handleMapClick);

    return () => {
      mapInstance.off('click', handleMapClick);
    };
  }, [addIdeaMode, mapReady, mapRef, movement, currentUser, onRequestAddIdea]);

  useEffect(() => {
    if (!mapRef?.current || !mapReady) return;
    const mapInstance = mapRef.current;

    if (addIdeaMode && mapInstance.getCanvas()) {
      mapInstance.getCanvas().style.cursor = 'crosshair';
    } else if (mapInstance.getCanvas()) {
      mapInstance.getCanvas().style.cursor = '';
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
        onLocationClick={onLocationClick}
        onFollowChange={onFollowChange}
        onTagClick={onTagClick}
        apiCall={apiCall}
        loadIdeas={loadIdeas}
        isIdeaOpen={isIdeaOpen}
      />
      <HoverPreviewModal
        hoveredItem={hoveredItem}
        onViewIdea={onIdeaSelect}
      />
    </>
  );
};

export default MovementDetailsPage;

