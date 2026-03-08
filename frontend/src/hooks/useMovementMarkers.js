import { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { clearMarkers, normalizeCoordinate, projectToScreenPosition } from '../utils/mapMarkers';

const MOVEMENT_SOURCE_ID = 'movements-source';
const MOVEMENT_CLUSTER_LAYER_ID = 'movements-clusters';
const MOVEMENT_CLUSTER_COUNT_LAYER_ID = 'movements-cluster-count';
const MOVEMENT_UNCLUSTERED_LAYER_ID = 'movements-unclustered';
const MOVEMENT_POLYGON_SOURCE_ID = 'movements-polygons-source';
const MOVEMENT_POLYGON_LAYER_ID = 'movements-polygons';

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

  if (mapInstance.getLayer(MOVEMENT_POLYGON_LAYER_ID)) {
    mapInstance.removeLayer(MOVEMENT_POLYGON_LAYER_ID);
  }
  if (mapInstance.getSource(MOVEMENT_POLYGON_SOURCE_ID)) {
    mapInstance.removeSource(MOVEMENT_POLYGON_SOURCE_ID);
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

/** Build a FeatureCollection of polygon features for movements that have a boundary. */
const createPolygonFeatureCollection = (movements = []) => {
  const lookup = new Map();
  const features = movements
    .map((movement, index) => {
      const boundary = movement?.boundary;
      if (!boundary?.coordinates || !Array.isArray(boundary.coordinates)) {
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
          type: 'Polygon',
          coordinates: boundary.coordinates
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

  useEffect(() => {
    const mapInstance = mapRef?.current;
    if (!mapInstance) {
      return;
    }

    console.log('[useMovementMarkers] Effect running', { 
      viewMode, 
      movementsCount: movements?.length || 0
    });

    clearMarkers(mapInstance, markersRef);

    if (viewMode !== 'movements') {
      removeMovementLayers(mapInstance);
      return () => removeMovementLayers(mapInstance);
    }

    let isCancelled = false;
    const detachHandlers = [];

    // This will be set when we create the feature collection
    let currentLookup = null;
    
    const getMovementFromFeature = (feature) => {
      if (!feature?.properties) {
        return null;
      }

      const movementId = feature.properties.movementId;
      if (movementId && currentLookup?.has(movementId)) {
        return currentLookup.get(movementId);
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

      const currentCollection = createFeatureCollection(movements);
      const polygonCollection = createPolygonFeatureCollection(movements);
      currentLookup = currentCollection.lookup;
      polygonCollection.lookup.forEach((m, id) => currentLookup.set(id, m));

      const hasPoints = currentCollection.featureCollection?.features?.length > 0;
      const hasPolygons = polygonCollection.featureCollection?.features?.length > 0;
      if (!hasPoints && !hasPolygons) {
        console.warn('[useMovementMarkers] No valid movement coordinates or boundaries to display.', {
          movementsCount: movements?.length || 0
        });
        return;
      }

      try {
        const style = mapInstance.getStyle();
        if (!style || !style.sources) {
          console.warn('[useMovementMarkers] Style not ready, cannot add source');
          return;
        }

        if (hasPolygons) {
          if (mapInstance.getSource(MOVEMENT_POLYGON_SOURCE_ID)) {
            mapInstance.getSource(MOVEMENT_POLYGON_SOURCE_ID).setData(polygonCollection.featureCollection);
          } else {
            mapInstance.addSource(MOVEMENT_POLYGON_SOURCE_ID, {
              type: 'geojson',
              data: polygonCollection.featureCollection
            });
          }
          if (!mapInstance.getLayer(MOVEMENT_POLYGON_LAYER_ID)) {
            mapInstance.addLayer({
              id: MOVEMENT_POLYGON_LAYER_ID,
              type: 'fill',
              source: MOVEMENT_POLYGON_SOURCE_ID,
              paint: {
                'fill-color': '#16a34a',
                'fill-opacity': 0.25,
                'fill-outline-color': '#16a34a'
              }
            });
          }
        }

        if (!hasPoints) {
          return;
        }

        const currentFeatureCollection = currentCollection.featureCollection;
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

        const coords = feature.geometry?.type === 'Polygon'
          ? feature.geometry.coordinates?.[0]?.[0]
          : feature.geometry?.coordinates;
        const position = projectToScreenPosition(mapInstance, coords || []);

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
      if (hasPolygons) {
        attachHandler('click', MOVEMENT_POLYGON_LAYER_ID, unclusteredClickHandler);
        attachHandler('mousemove', MOVEMENT_POLYGON_LAYER_ID, unclusteredMouseMoveHandler);
        attachHandler('mouseleave', MOVEMENT_POLYGON_LAYER_ID, unclusteredMouseLeaveHandler);
      }

      // Don't automatically fit bounds - let the map stay at user's location or default center
      // This prevents overriding the browser geolocation
      // If explicit fit to bounds is needed, it should be triggered by user action
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

    // Track if we're currently rendering to avoid infinite loops from styledata events
    let isRendering = false;
    let hasRenderedOnce = false;
    
    // Listen for style changes - when setStyle() is called, Mapbox removes ALL sources/layers
    // We need to re-add them after the new style is fully loaded
    // Only use 'style.load' event which fires when a new style is fully loaded (not on layer changes)
    const handleStyleLoad = () => {
      if (isCancelled || viewMode !== 'movements' || isRendering) return;
      
      // Only re-render if we've already rendered once (meaning this is a style change)
      if (hasRenderedOnce) {
        console.log('[useMovementMarkers] style.load event received, re-rendering markers');
        isRendering = true;
        renderMarkers();
        isRendering = false;
      }
    };
    
    const handleLoad = () => {
      if (isCancelled || viewMode !== 'movements' || isRendering) return;
      console.log('[useMovementMarkers] load event received, re-rendering markers');
      isRendering = true;
      renderMarkers();
      hasRenderedOnce = true;
      isRendering = false;
    };

    // Attach listeners for style changes
    // Use 'style.load' instead of 'styledata' to avoid infinite loops
    // 'style.load' only fires when a completely new style is loaded
    mapInstance.on('load', handleLoad);
    mapInstance.on('style.load', handleStyleLoad);

    return () => {
      isCancelled = true;
      // Remove style listeners (managed separately from detachHandlers)
      mapInstance.off('load', handleLoad);
      mapInstance.off('style.load', handleStyleLoad);
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
    setPreviewMovement
  ]);
};

