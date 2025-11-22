import { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';

const MARKER_STYLE = `
  background-color: #16a34a;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  box-shadow: 0 4px 6px rgba(0,0,0,0.3);
`;

const clearMarkers = (mapInstance, markersRef) => {
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

const fitMapToMovements = (mapInstance, movements, showSearch) => {
  if (!mapInstance || movements.length === 0) {
    return;
  }

  const bounds = new mapboxgl.LngLatBounds();
  movements.forEach(movement => {
    if (typeof movement.longitude === 'number' && typeof movement.latitude === 'number') {
      bounds.extend([movement.longitude, movement.latitude]);
    }
  });

  if (bounds.isEmpty()) {
    return;
  }

  const topPadding = showSearch ? 130 : 80;
  mapInstance.fitBounds(bounds, {
    padding: {
      top: topPadding,
      bottom: 80,
      left: 80,
      right: 80
    },
    maxZoom: 12
  });
};

const createMovementMarker = ({ mapInstance, movement, setPreviewMovement, setHoveredItem }) => {
  if (typeof movement.longitude !== 'number' || typeof movement.latitude !== 'number') {
    return null;
  }

  const el = document.createElement('div');
  el.style.cssText = MARKER_STYLE;
  el.innerHTML = '●';

  el.onclick = (e) => {
    e.stopPropagation();
    setPreviewMovement(movement);
  };

  const marker = new mapboxgl.Marker({
    element: el,
    anchor: 'center'
  })
    .setLngLat([movement.longitude, movement.latitude])
    .addTo(mapInstance);

  const handleMouseEnter = () => {
    const updatePosition = () => {
      if (!mapInstance) return;
      const lngLat = [movement.longitude, movement.latitude];
      const point = mapInstance.project(lngLat);
      const mapContainerRect = mapInstance.getContainer().getBoundingClientRect();

      setHoveredItem({
        type: 'movement',
        item: movement,
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

export const useMovementMarkers = ({
  mapRef,
  markersRef,
  viewMode,
  movements = [],
  showSearch,
  setHoveredItem,
  setPreviewMovement
}) => {
  useEffect(() => {
    const mapInstance = mapRef?.current;
    if (!mapInstance) {
      return;
    }

    if (viewMode !== 'movements') {
      return () => clearMarkers(mapInstance, markersRef);
    }

    clearMarkers(mapInstance, markersRef);
    const hoverResetId = requestAnimationFrame(() => setHoveredItem(null));

    movements.forEach(movement => {
      const marker = createMovementMarker({
        mapInstance,
        movement,
        setPreviewMovement,
        setHoveredItem
      });
      if (marker) {
        markersRef.current.push(marker);
      }
    });

    fitMapToMovements(mapInstance, movements, showSearch);

    return () => {
      cancelAnimationFrame(hoverResetId);
      clearMarkers(mapInstance, markersRef);
    };
  }, [
    mapRef,
    markersRef,
    viewMode,
    movements,
    showSearch,
    setHoveredItem,
    setPreviewMovement
  ]);
};

