export const clearMarkers = (mapInstance, markersRef) => {
  if (!markersRef?.current) {
    return;
  }

  markersRef.current.forEach(marker => {
    if (marker._hoverCleanup) {
      marker._hoverCleanup();
    }

    if (marker._updateTimeout) {
      clearTimeout(marker._updateTimeout);
      marker._updateTimeout = null;
    }

    if (mapInstance && marker._moveHandler) {
      mapInstance.off('move', marker._moveHandler);
      mapInstance.off('zoom', marker._moveHandler);
      marker._moveHandler = null;
    }

    const element = marker.getElement ? marker.getElement() : null;
    if (element && marker._hoverEnterHandler) {
      element.removeEventListener('mouseenter', marker._hoverEnterHandler);
    }
    if (element && marker._hoverLeaveHandler) {
      element.removeEventListener('mouseleave', marker._hoverLeaveHandler);
    }

    marker._hoverEnterHandler = null;
    marker._hoverLeaveHandler = null;
    marker._hoverUpdateFn = null;

    marker.remove();
  });

  markersRef.current = [];
};

export const setupMarkerHover = ({
  mapInstance,
  marker,
  coordinates,
  onHover,
  onHoverEnd,
  throttleMs = 50
}) => {
  if (!mapInstance || !marker || !coordinates) {
    return;
  }

  const element = marker.getElement ? marker.getElement() : null;
  if (!element) {
    return;
  }

  const updatePosition = () => {
    if (!mapInstance) return;
    const point = mapInstance.project(coordinates);
    const mapContainerRect = mapInstance.getContainer().getBoundingClientRect();

    onHover({
      x: point.x + mapContainerRect.left,
      y: point.y + mapContainerRect.top
    });
  };

  const handleMouseEnter = () => {
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
      }, throttleMs);
    };

    mapInstance.on('move', marker._moveHandler);
    mapInstance.on('zoom', marker._moveHandler);
  };

  const cleanupHover = () => {
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
    if (onHoverEnd) {
      onHoverEnd();
    }
  };

  const handleMouseLeave = () => {
    cleanupHover();
  };

  element.addEventListener('mouseenter', handleMouseEnter);
  element.addEventListener('mouseleave', handleMouseLeave);

  marker._hoverEnterHandler = handleMouseEnter;
  marker._hoverLeaveHandler = handleMouseLeave;
  marker._hoverCleanup = cleanupHover;
};

