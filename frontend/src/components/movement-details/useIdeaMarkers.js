import { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { clearMarkers, setupMarkerHover } from '../../utils/mapMarkers';

const IDEA_MARKER_STYLE = `
  background-color: #2563eb;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
`;

const fitMapToIdeas = ({ mapInstance, ideas, headerCollapsed }) => {
  if (!mapInstance || ideas.length === 0) {
    return;
  }

  const bounds = new mapboxgl.LngLatBounds();
  ideas.forEach(idea => {
    if (typeof idea.longitude === 'number' && typeof idea.latitude === 'number') {
      bounds.extend([idea.longitude, idea.latitude]);
    }
  });

  if (bounds.isEmpty()) {
    return;
  }

  const topPadding = headerCollapsed ? 100 : 370;
  const bufferSize = 150;

  mapInstance.fitBounds(bounds, {
    padding: {
      top: topPadding + bufferSize,
      bottom: bufferSize,
      left: bufferSize,
      right: bufferSize
    }
  });
};

const createIdeaMarker = ({
  mapInstance,
  idea,
  movement,
  onIdeaSelect,
  setHoveredItem
}) => {
  if (typeof idea.longitude !== 'number' || typeof idea.latitude !== 'number') {
    return null;
  }

  const el = document.createElement('div');
  el.style.cssText = IDEA_MARKER_STYLE;
  el.innerHTML = '💡';

  el.onclick = (e) => {
    e.stopPropagation();
    onIdeaSelect(idea);
  };

  const marker = new mapboxgl.Marker({
    element: el,
    anchor: 'center'
  })
    .setLngLat([idea.longitude, idea.latitude])
    .addTo(mapInstance);

  const ideaWithMovement = {
    ...idea,
    movement: {
      name: movement?.name,
      city: movement?.city,
      state: movement?.state
    }
  };

  setupMarkerHover({
    mapInstance,
    marker,
    coordinates: [idea.longitude, idea.latitude],
    onHover: (position) => {
      setHoveredItem({
        type: 'idea',
        item: ideaWithMovement,
        position
      });
    },
    onHoverEnd: () => setHoveredItem(null)
  });

  return marker;
};

export const useIdeaMarkers = ({
  mapRef,
  markersRef,
  movement,
  ideas = [],
  headerCollapsed,
  onIdeaSelect,
  setHoveredItem
}) => {
  useEffect(() => {
    const mapInstance = mapRef?.current;
    if (!mapInstance || !movement) {
      return;
    }

    let isCancelled = false;

    const renderMarkers = () => {
      if (isCancelled) return;
      clearMarkers(mapInstance, markersRef);

      ideas.forEach(idea => {
        const marker = createIdeaMarker({
          mapInstance,
          idea,
          movement,
          onIdeaSelect,
          setHoveredItem
        });

        if (marker) {
          markersRef.current.push(marker);
        }
      });

      fitMapToIdeas({ mapInstance, ideas, headerCollapsed });
    };

    if (mapInstance.loaded()) {
      renderMarkers();
    } else {
      const handleLoad = () => {
        renderMarkers();
      };
      mapInstance.once('load', handleLoad);

      return () => {
        isCancelled = true;
        mapInstance.off('load', handleLoad);
        clearMarkers(mapInstance, markersRef);
      };
    }

    return () => {
      isCancelled = true;
      clearMarkers(mapInstance, markersRef);
    };
  }, [
    mapRef,
    markersRef,
    movement,
    ideas,
    headerCollapsed,
    onIdeaSelect,
    setHoveredItem
  ]);
};

