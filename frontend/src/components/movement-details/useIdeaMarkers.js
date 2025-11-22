import { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';

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

const clearIdeaMarkers = (mapInstance, markersRef) => {
  if (!markersRef?.current) {
    return;
  }

  markersRef.current.forEach(marker => {
    if (marker._updateTimeout) {
      clearTimeout(marker._updateTimeout);
    }
    if (mapInstance && marker._moveHandler) {
      mapInstance.off('move', marker._moveHandler);
      mapInstance.off('zoom', marker._moveHandler);
    }
    marker._hoverUpdateFn = null;
    marker._moveHandler = null;
    marker._updateTimeout = null;
    marker.remove();
  });

  markersRef.current = [];
};

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

  const handleMouseEnter = () => {
    const updatePosition = () => {
      if (!mapInstance) return;
      const lngLat = [idea.longitude, idea.latitude];
      const point = mapInstance.project(lngLat);
      const mapContainerRect = mapInstance.getContainer().getBoundingClientRect();

      setHoveredItem({
        type: 'idea',
        item: ideaWithMovement,
        position: {
          x: point.x + mapContainerRect.left,
          y: point.y + mapContainerRect.top
        }
      });
    };

    updatePosition();
    marker._hoverUpdateFn = updatePosition;
    marker._updateTimeout = null;
    marker._moveHandler = () => {
      if (marker._updateTimeout) {
        clearTimeout(marker._updateTimeout);
      }
      marker._updateTimeout = setTimeout(() => {
        if (marker._hoverUpdateFn) {
          marker._hoverUpdateFn();
        }
      }, 50);
    };

    mapInstance.on('move', marker._moveHandler);
    mapInstance.on('zoom', marker._moveHandler);
  };

  const handleMouseLeave = () => {
    if (marker._updateTimeout) {
      clearTimeout(marker._updateTimeout);
      marker._updateTimeout = null;
    }
    if (mapInstance && marker._moveHandler) {
      mapInstance.off('move', marker._moveHandler);
      mapInstance.off('zoom', marker._moveHandler);
      marker._moveHandler = null;
    }
    marker._hoverUpdateFn = null;
    setHoveredItem(null);
  };

  el.addEventListener('mouseenter', handleMouseEnter);
  el.addEventListener('mouseleave', handleMouseLeave);

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

    if (!mapInstance.loaded()) {
      return;
    }

    clearIdeaMarkers(mapInstance, markersRef);

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

    return () => clearIdeaMarkers(mapInstance, markersRef);
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

