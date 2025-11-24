import React, { useEffect, useState } from 'react';
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
  apiCall
}) => {
  const [addIdeaMode, setAddIdeaMode] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);

  useEffect(() => {
    if (!mapRef?.current || !mapReady) return;
    const mapInstance = mapRef.current;

    const handleMapClick = (e) => {
      if (!addIdeaMode || !movement || !currentUser) return;
      const { lng, lat } = e.lngLat;
      onRequestAddIdea({ longitude: lng, latitude: lat });
      setAddIdeaMode(false);
    };

    if (addIdeaMode) {
      mapInstance.on('click', handleMapClick);
      if (mapInstance.getCanvas()) {
        mapInstance.getCanvas().style.cursor = 'crosshair';
      }
    }

    return () => {
      mapInstance.off('click', handleMapClick);
      if (mapInstance.getCanvas()) {
        mapInstance.getCanvas().style.cursor = '';
      }
    };
  }, [addIdeaMode, mapReady, mapRef, movement, currentUser, onRequestAddIdea]);

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
      />
      <HoverPreviewModal hoveredItem={hoveredItem} />
    </>
  );
};

export default MovementDetailsPage;

