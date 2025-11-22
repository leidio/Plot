import { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { clearMarkers, setupMarkerHover } from '../utils/mapMarkers';

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

  setupMarkerHover({
    mapInstance,
    marker,
    coordinates: [movement.longitude, movement.latitude],
    onHover: (position) => {
      setHoveredItem({
        type: 'movement',
        item: movement,
        position
      });
    },
    onHoverEnd: () => setHoveredItem(null)
  });

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

