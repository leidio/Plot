import { useEffect, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { clearMarkers, normalizeCoordinate, projectToScreenPosition } from '../utils/mapMarkers';

const MOVEMENT_SOURCE_ID = 'movements-source';
const MOVEMENT_CLUSTER_LAYER_ID = 'movements-clusters';
const MOVEMENT_CLUSTER_COUNT_LAYER_ID = 'movements-cluster-count';
const MOVEMENT_UNCLUSTERED_LAYER_ID = 'movements-unclustered';

const fitMapToMovements = (mapInstance, features, showSearch) => {
  if (!mapInstance || features.length === 0) {
    return;
  }

  const bounds = new mapboxgl.LngLatBounds();
  features.forEach(feature => {
    const coordinates = feature?.geometry?.coordinates;
    if (Array.isArray(coordinates) && coordinates.length === 2) {
      bounds.extend(coordinates);
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

const removeMovementLayers = (mapInstance) => {
  if (!mapInstance) {
    return;
  }

  if (mapInstance.getLayer(MOVEMENT_CLUSTER_COUNT_LAYER_ID)) {
    mapInstance.removeLayer(MOVEMENT_CLUSTER_COUNT_LAYER_ID);
  }
  if (mapInstance.getLayer(MOVEMENT_CLUSTER_LAYER_ID)) {
    mapInstance.removeLayer(MOVEMENT_CLUSTER_LAYER_ID);
  }
  if (mapInstance.getLayer(MOVEMENT_UNCLUSTERED_LAYER_ID)) {
    mapInstance.removeLayer(MOVEMENT_UNCLUSTERED_LAYER_ID);
  }
  if (mapInstance.getSource(MOVEMENT_SOURCE_ID)) {
    mapInstance.removeSource(MOVEMENT_SOURCE_ID);
  }
};

const createFeatureCollection = (movements = []) => {
  const lookup = new Map();
  const features = movements
    .map((movement, index) => {
      const longitude = normalizeCoordinate(movement?.longitude);
      const latitude = normalizeCoordinate(movement?.latitude);
      if (longitude === null || latitude === null) {
        return null;
      }

      if (movement?.id) {
        lookup.set(movement.id, movement);
      }

      return {
        type: 'Feature',
        properties: {
          movementId: movement?.id || '',
          movementIndex: index
        },
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        }
      };
    })
    .filter(Boolean);

  return {
    lookup,
    featureCollection: {
      type: 'FeatureCollection',
      features
    }
  };
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
  const { lookup: movementLookup, featureCollection } = useMemo(
    () => createFeatureCollection(movements),
    [movements]
  );

  useEffect(() => {
    const mapInstance = mapRef?.current;
    if (!mapInstance) {
      return;
    }

    console.log('[useMovementMarkers] Effect running', { 
      viewMode, 
      movementsCount: movements?.length || 0,
      featuresCount: featureCollection?.features?.length || 0 
    });

    clearMarkers(mapInstance, markersRef);

    if (viewMode !== 'movements') {
      removeMovementLayers(mapInstance);
      return () => removeMovementLayers(mapInstance);
    }

    let isCancelled = false;
    const detachHandlers = [];

    const getMovementFromFeature = (feature) => {
      if (!feature?.properties) {
        return null;
      }

      const movementId = feature.properties.movementId;
      if (movementId && movementLookup.has(movementId)) {
        return movementLookup.get(movementId);
      }

      const movementIndex = Number(feature.properties.movementIndex);
      if (!Number.isNaN(movementIndex) && movements[movementIndex]) {
        return movements[movementIndex];
      }

      return null;
    };

    const attachHandler = (type, layerId, handler) => {
      mapInstance.on(type, layerId, handler);
      detachHandlers.push(() => mapInstance.off(type, layerId, handler));
    };

    const renderClusters = () => {
      if (isCancelled) {
        console.log('[useMovementMarkers] renderClusters cancelled');
        return;
      }

      console.log('[useMovementMarkers] renderClusters called', {
        movementsCount: movements?.length || 0
      });

      // Check if style is loaded before trying to add sources/layers
      try {
        const style = mapInstance.getStyle();
        if (!style || !style.sources) {
          console.warn('[useMovementMarkers] Style not ready, cannot render markers');
          return;
        }
      } catch (error) {
        console.warn('[useMovementMarkers] Cannot access style, not ready yet:', error);
        return;
      }

      detachHandlers.forEach((off) => off());
      detachHandlers.length = 0;
      removeMovementLayers(mapInstance);

      // Recreate featureCollection from current movements to ensure we have latest data
      // This is important because featureCollection in closure might be stale
      const currentCollection = createFeatureCollection(movements);
      
      if (!currentCollection.featureCollection || !currentCollection.featureCollection.features || !currentCollection.featureCollection.features.length) {
        setHoveredItem(null);
        console.warn('[useMovementMarkers] No valid movement coordinates to display.', { 
          movementsCount: movements?.length || 0,
          featuresCount: currentCollection.featureCollection?.features?.length || 0
        });
        return;
      }
      
      const currentFeatureCollection = currentCollection.featureCollection;

      try {
        // Double-check style is ready before adding source
        const style = mapInstance.getStyle();
        if (!style || !style.sources) {
          console.warn('[useMovementMarkers] Style not ready, cannot add source');
          return;
        }
        
        if (mapInstance.getSource(MOVEMENT_SOURCE_ID)) {
          mapInstance.getSource(MOVEMENT_SOURCE_ID).setData(currentFeatureCollection);
        } else {
          mapInstance.addSource(MOVEMENT_SOURCE_ID, {
            type: 'geojson',
            data: currentFeatureCollection,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 60
          });
        }
      } catch (error) {
        console.error('[useMovementMarkers] Error adding source:', error);
        // If error is because style isn't ready, try again after a delay
        if (error.message && error.message.includes('style')) {
          setTimeout(() => {
            if (!isCancelled && viewMode === 'movements') {
              renderClusters();
            }
          }, 200);
        }
        return;
      }

      if (!mapInstance.getLayer(MOVEMENT_CLUSTER_LAYER_ID)) {
        mapInstance.addLayer({
          id: MOVEMENT_CLUSTER_LAYER_ID,
          type: 'circle',
          source: MOVEMENT_SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#16a34a',
            'circle-opacity': 0.85,
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              18,
              15,
              26,
              30,
              34
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
      }

      if (!mapInstance.getLayer(MOVEMENT_CLUSTER_COUNT_LAYER_ID)) {
        mapInstance.addLayer({
          id: MOVEMENT_CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: MOVEMENT_SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 14
          },
          paint: {
            'text-color': '#ffffff'
          }
        });
      }

      if (!mapInstance.getLayer(MOVEMENT_UNCLUSTERED_LAYER_ID)) {
        mapInstance.addLayer({
          id: MOVEMENT_UNCLUSTERED_LAYER_ID,
          type: 'circle',
          source: MOVEMENT_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#16a34a',
            'circle-radius': 9,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
      }

      const clusterClickHandler = (event) => {
        const features =
          event.features ||
          mapInstance.queryRenderedFeatures(event.point, {
            layers: [MOVEMENT_CLUSTER_LAYER_ID]
          });

        if (!features?.length) {
          return;
        }

        const clusterId = features[0].properties?.cluster_id;
        const source = mapInstance.getSource(MOVEMENT_SOURCE_ID);
        if (!source || typeof source.getClusterExpansionZoom !== 'function') {
          return;
        }

        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error) return;
          mapInstance.easeTo({
            center: features[0].geometry.coordinates,
            zoom
          });
        });
      };

      const unclusteredClickHandler = (event) => {
        const features =
          event.features ||
          mapInstance.queryRenderedFeatures(event.point, {
            layers: [MOVEMENT_UNCLUSTERED_LAYER_ID]
          });

        if (!features?.length) {
          return;
        }

        const movement = getMovementFromFeature(features[0]);
        if (movement) {
          setPreviewMovement(movement);
        }
      };

      const unclusteredMouseMoveHandler = (event) => {
        const features =
          event.features ||
          mapInstance.queryRenderedFeatures(event.point, {
            layers: [MOVEMENT_UNCLUSTERED_LAYER_ID]
          });

        if (!features?.length) {
          mapInstance.getCanvas().style.cursor = '';
          setHoveredItem(null);
          return;
        }

        mapInstance.getCanvas().style.cursor = 'pointer';
        const feature = features[0];
        const movement = getMovementFromFeature(feature);
        if (!movement) {
          setHoveredItem(null);
          return;
        }

        const position = projectToScreenPosition(
          mapInstance,
          feature.geometry?.coordinates || []
        );

        if (position) {
          setHoveredItem({
            type: 'movement',
            item: movement,
            position
          });
        }
      };

      const unclusteredMouseLeaveHandler = () => {
        mapInstance.getCanvas().style.cursor = '';
        setHoveredItem(null);
      };

      attachHandler('click', MOVEMENT_CLUSTER_LAYER_ID, clusterClickHandler);
      attachHandler('click', MOVEMENT_UNCLUSTERED_LAYER_ID, unclusteredClickHandler);
      attachHandler('mousemove', MOVEMENT_UNCLUSTERED_LAYER_ID, unclusteredMouseMoveHandler);
      attachHandler('mouseleave', MOVEMENT_UNCLUSTERED_LAYER_ID, unclusteredMouseLeaveHandler);

      fitMapToMovements(mapInstance, currentFeatureCollection.features, showSearch);
    };

    // Function to render markers - will be called on initial load and after style changes
    const renderMarkers = () => {
      if (isCancelled || viewMode !== 'movements') {
        return;
      }
      
      // Check if style is ready
      const isStyleReady = () => {
        try {
          // isStyleLoaded returns a boolean
          if (mapInstance.isStyleLoaded && typeof mapInstance.isStyleLoaded() === 'boolean') {
            return mapInstance.isStyleLoaded();
          }
          // Fallback: check if we can access style and it has sources
          const style = mapInstance.getStyle();
          return !!(style && style.sources);
        } catch (error) {
          return false;
        }
      };
      
      if (!isStyleReady()) {
        // Style not ready, wait for it
        let retryCount = 0;
        const maxRetries = 20;
        const checkReady = () => {
          if (isCancelled || retryCount >= maxRetries) {
            if (retryCount >= maxRetries) {
              console.warn('[useMovementMarkers] Style ready check timed out, attempting render anyway');
              renderClusters();
            }
            return;
          }
          retryCount++;
          if (isStyleReady()) {
            renderClusters();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        setTimeout(checkReady, 100);
        return;
      }
      
      // Style is ready, render markers
      renderClusters();
    };

    // Initial render
    renderMarkers();

    // Listen for style changes - when setStyle() is called, Mapbox removes ALL sources/layers
    // We need to re-add them after the new style is fully loaded
    // Use both 'styledata' and 'load' events to catch style changes
    let styleChangeTimeout = null;
    
    const handleStyleData = () => {
      if (isCancelled || viewMode !== 'movements') return;
      
      console.log('[useMovementMarkers] styledata event received');
      
      // Clear any pending timeout
      if (styleChangeTimeout) {
        clearTimeout(styleChangeTimeout);
      }
      
      // Wait for style to be ready, then re-render
      styleChangeTimeout = setTimeout(() => {
        if (isCancelled || viewMode !== 'movements') return;
        console.log('[useMovementMarkers] Attempting to re-render after styledata');
        renderMarkers();
      }, 500); // Wait 500ms after styledata event
    };
    
    const handleLoad = () => {
      if (!isCancelled && viewMode === 'movements') {
        console.log('[useMovementMarkers] load event received, re-rendering markers');
        renderMarkers();
      }
    };

    // Attach listeners for style changes
    // IMPORTANT: These should NOT be in detachHandlers because renderClusters() clears detachHandlers
    // If we put them there, the first style change would remove them and subsequent changes wouldn't work
    mapInstance.on('load', handleLoad);
    mapInstance.on('styledata', handleStyleData);

    return () => {
      isCancelled = true;
      // Clean up style change timeout
      if (styleChangeTimeout) {
        clearTimeout(styleChangeTimeout);
      }
      // Remove style listeners (managed separately from detachHandlers)
      mapInstance.off('load', handleLoad);
      mapInstance.off('styledata', handleStyleData);
      // Clean up layer-specific handlers
      detachHandlers.forEach((off) => off());
      detachHandlers.length = 0;
      mapInstance.getCanvas().style.cursor = '';
      removeMovementLayers(mapInstance);
      setHoveredItem(null);
    };
  }, [
    mapRef,
    markersRef,
    viewMode,
    movements,
    showSearch,
    setHoveredItem,
    setPreviewMovement,
    movementLookup,
    featureCollection
  ]);
};

