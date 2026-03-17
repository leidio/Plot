import { useEffect, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { clearMarkers, normalizeCoordinate, projectToScreenPosition } from '../../utils/mapMarkers';

const IDEA_SOURCE_ID = 'ideas-source';
const IDEA_CLUSTER_LAYER_ID = 'ideas-clusters';
const IDEA_CLUSTER_COUNT_LAYER_ID = 'ideas-cluster-count';
const IDEA_UNCLUSTERED_LAYER_ID = 'ideas-unclustered';
const MOVEMENT_BOUNDARY_SOURCE_ID = 'movement-boundary-source';
const MOVEMENT_BOUNDARY_LAYER_ID = 'movement-boundary-layer';

const fitMapToIdeas = (mapInstance, features, headerCollapsed, movement) => {
  if (!mapInstance) {
    return;
  }

  const topPadding = headerCollapsed ? 100 : 370;
  const bufferSize = 150;

  // If we have idea features, fit to their bounds
  if (features.length > 0) {
    const bounds = new mapboxgl.LngLatBounds();
    features.forEach(feature => {
      const coordinates = feature?.geometry?.coordinates;
      if (Array.isArray(coordinates) && coordinates.length === 2) {
        bounds.extend(coordinates);
      }
    });

    if (!bounds.isEmpty()) {
      mapInstance.fitBounds(bounds, {
        padding: {
          top: topPadding + bufferSize,
          bottom: bufferSize,
          left: bufferSize,
          right: bufferSize
        }
      });
      return;
    }
  }

  // No ideas or no valid idea coordinates - zoom to movement's location
  if (movement?.longitude && movement?.latitude) {
    mapInstance.flyTo({
      center: [movement.longitude, movement.latitude],
      zoom: 13,
      padding: {
        top: topPadding,
        bottom: 0,
        left: 0,
        right: 0
      }
    });
  }
};

const removeIdeaLayers = (mapInstance) => {
  if (!mapInstance) {
    return;
  }

  if (mapInstance.getLayer(IDEA_CLUSTER_COUNT_LAYER_ID)) {
    mapInstance.removeLayer(IDEA_CLUSTER_COUNT_LAYER_ID);
  }
  if (mapInstance.getLayer(IDEA_CLUSTER_LAYER_ID)) {
    mapInstance.removeLayer(IDEA_CLUSTER_LAYER_ID);
  }
  if (mapInstance.getLayer(IDEA_UNCLUSTERED_LAYER_ID)) {
    mapInstance.removeLayer(IDEA_UNCLUSTERED_LAYER_ID);
  }
  if (mapInstance.getSource(IDEA_SOURCE_ID)) {
    mapInstance.removeSource(IDEA_SOURCE_ID);
  }

  if (mapInstance.getLayer(MOVEMENT_BOUNDARY_LAYER_ID)) {
    mapInstance.removeLayer(MOVEMENT_BOUNDARY_LAYER_ID);
  }
  if (mapInstance.getSource(MOVEMENT_BOUNDARY_SOURCE_ID)) {
    mapInstance.removeSource(MOVEMENT_BOUNDARY_SOURCE_ID);
  }
};

const createFeatureCollection = (ideas = [], movement) => {
  const lookup = new Map();
  const features = ideas
    .map((idea, index) => {
      const longitude = normalizeCoordinate(idea?.longitude);
      const latitude = normalizeCoordinate(idea?.latitude);
      if (longitude === null || latitude === null) {
        return null;
      }

      if (idea?.id) {
        lookup.set(idea.id, idea);
      }

      return {
        type: 'Feature',
        properties: {
          ideaId: idea?.id || '',
          ideaIndex: index,
          movementName: movement?.name || '',
          movementCity: movement?.city || '',
          movementState: movement?.state || ''
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

export const useIdeaMarkers = ({
  mapRef,
  markersRef,
  movement,
  ideas = [],
  headerCollapsed,
  onIdeaSelect,
  setHoveredItem
}) => {
  const { lookup: ideaLookup, featureCollection } = useMemo(
    () => createFeatureCollection(ideas, movement),
    [ideas, movement]
  );

  useEffect(() => {
    const mapInstance = mapRef?.current;
    if (!mapInstance || !movement) {
      return;
    }

    clearMarkers(mapInstance, markersRef);

    let isCancelled = false;
    const detachHandlers = [];

    const getIdeaFromFeature = (feature) => {
      if (!feature?.properties) {
        return null;
      }

      const ideaId = feature.properties.ideaId;
      if (ideaId && ideaLookup.has(ideaId)) {
        return ideaLookup.get(ideaId);
      }

      const ideaIndex = Number(feature.properties.ideaIndex);
      if (!Number.isNaN(ideaIndex) && ideas[ideaIndex]) {
        return ideas[ideaIndex];
      }

      return null;
    };

    const attachHandler = (type, layerId, handler) => {
      mapInstance.on(type, layerId, handler);
      detachHandlers.push(() => mapInstance.off(type, layerId, handler));
    };

    const renderClusters = () => {
      if (isCancelled) {
        return;
      }

      detachHandlers.forEach((off) => off());
      detachHandlers.length = 0;
      removeIdeaLayers(mapInstance);

      // Draw the movement boundary if this movement was created with a polygon.
      const boundary = movement?.boundary;
      if (boundary?.type === 'Polygon' && Array.isArray(boundary.coordinates)) {
        const boundaryFeatureCollection = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: boundary.coordinates
              }
            }
          ]
        };

        if (mapInstance.getSource(MOVEMENT_BOUNDARY_SOURCE_ID)) {
          mapInstance.getSource(MOVEMENT_BOUNDARY_SOURCE_ID).setData(boundaryFeatureCollection);
        } else {
          mapInstance.addSource(MOVEMENT_BOUNDARY_SOURCE_ID, {
            type: 'geojson',
            data: boundaryFeatureCollection
          });
        }

        if (!mapInstance.getLayer(MOVEMENT_BOUNDARY_LAYER_ID)) {
          mapInstance.addLayer({
            id: MOVEMENT_BOUNDARY_LAYER_ID,
            type: 'line',
            source: MOVEMENT_BOUNDARY_SOURCE_ID,
            paint: {
              'line-color': '#16a34a',
              'line-width': 3,
              'line-opacity': 0.9
            }
          });
        }
      }

      if (!featureCollection.features.length) {
        setHoveredItem(null);
        console.log('[useIdeaMarkers] No ideas to display, zooming to movement location.');
        // Still zoom to movement location even if no ideas
        fitMapToIdeas(mapInstance, [], headerCollapsed, movement);
        return;
      }

      if (mapInstance.getSource(IDEA_SOURCE_ID)) {
        mapInstance.getSource(IDEA_SOURCE_ID).setData(featureCollection);
      } else {
        mapInstance.addSource(IDEA_SOURCE_ID, {
          type: 'geojson',
          data: featureCollection,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50
        });
      }

      if (!mapInstance.getLayer(IDEA_CLUSTER_LAYER_ID)) {
        mapInstance.addLayer({
          id: IDEA_CLUSTER_LAYER_ID,
          type: 'circle',
          source: IDEA_SOURCE_ID,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#ffffff',
            'circle-opacity': 1,
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              12,
              10,
              16,
              25,
              20
            ],
            'circle-stroke-width': 8,
            'circle-stroke-color': '#000000'
          }
        });
      }

      if (!mapInstance.getLayer(IDEA_CLUSTER_COUNT_LAYER_ID)) {
        mapInstance.addLayer({
          id: IDEA_CLUSTER_COUNT_LAYER_ID,
          type: 'symbol',
          source: IDEA_SOURCE_ID,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 13
          },
          paint: {
            'text-color': '#ffffff'
          }
        });
      }

      if (!mapInstance.getLayer(IDEA_UNCLUSTERED_LAYER_ID)) {
        mapInstance.addLayer({
          id: IDEA_UNCLUSTERED_LAYER_ID,
          type: 'circle',
          source: IDEA_SOURCE_ID,
          filter: ['!', ['has', 'point_count']],
          paint: {
            // Unclustered idea marker: 24px total (8px circle with 8px stroke)
            'circle-color': '#ffffff',
            'circle-radius': 4,
            'circle-stroke-width': 8,
            'circle-stroke-color': '#000000'
          }
        });
      }

      const clusterClickHandler = (event) => {
        const features =
          event.features ||
          mapInstance.queryRenderedFeatures(event.point, {
            layers: [IDEA_CLUSTER_LAYER_ID]
          });

        if (!features?.length) {
          return;
        }

        const clusterId = features[0].properties?.cluster_id;
        const source = mapInstance.getSource(IDEA_SOURCE_ID);
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
            layers: [IDEA_UNCLUSTERED_LAYER_ID]
          });

        if (!features?.length) {
          return;
        }

        const idea = getIdeaFromFeature(features[0]);
        if (idea) {
          onIdeaSelect(idea);
        }
      };

      let hoverClearTimeout = null;
      const scheduleClearHover = () => {
        if (hoverClearTimeout) return;
        hoverClearTimeout = setTimeout(() => {
          hoverClearTimeout = null;
          setHoveredItem(null);
        }, 400);
      };

      const unclusteredMouseMoveHandler = (event) => {
        const features =
          event.features ||
          mapInstance.queryRenderedFeatures(event.point, {
            layers: [IDEA_UNCLUSTERED_LAYER_ID]
          });

        if (!features?.length) {
          mapInstance.getCanvas().style.cursor = '';
          scheduleClearHover();
          return;
        }

        mapInstance.getCanvas().style.cursor = 'pointer';
        if (hoverClearTimeout) {
          clearTimeout(hoverClearTimeout);
          hoverClearTimeout = null;
        }
        const feature = features[0];
        const idea = getIdeaFromFeature(feature);
        if (!idea) {
          setHoveredItem(null);
          return;
        }

        const position = projectToScreenPosition(
          mapInstance,
          feature.geometry?.coordinates || []
        );

        if (position) {
          setHoveredItem({
            type: 'idea',
            item: {
              ...idea,
              movement: {
                name: feature.properties?.movementName || movement.name,
                city: feature.properties?.movementCity || movement.city,
                state: feature.properties?.movementState || movement.state
              }
            },
            position
          });
        }
      };

      const unclusteredMouseLeaveHandler = () => {
        mapInstance.getCanvas().style.cursor = '';
        scheduleClearHover();
      };

      attachHandler('click', IDEA_CLUSTER_LAYER_ID, clusterClickHandler);
      attachHandler('click', IDEA_UNCLUSTERED_LAYER_ID, unclusteredClickHandler);
      attachHandler('mousemove', IDEA_UNCLUSTERED_LAYER_ID, unclusteredMouseMoveHandler);
      attachHandler('mouseleave', IDEA_UNCLUSTERED_LAYER_ID, unclusteredMouseLeaveHandler);

      fitMapToIdeas(mapInstance, featureCollection.features, headerCollapsed, movement);
    };

    const renderWhenReady = () => {
      if (mapInstance.isStyleLoaded?.()) {
        renderClusters();
      } else {
        const handleStyleData = () => {
          if (mapInstance.isStyleLoaded?.()) {
            mapInstance.off('styledata', handleStyleData);
            renderClusters();
          }
        };
        mapInstance.on('styledata', handleStyleData);
        detachHandlers.push(() => mapInstance.off('styledata', handleStyleData));
      }
    };

    renderWhenReady();

    return () => {
      isCancelled = true;
      detachHandlers.forEach((off) => off());
      detachHandlers.length = 0;
      mapInstance.getCanvas().style.cursor = '';
      removeIdeaLayers(mapInstance);
      setHoveredItem(null);
    };
  }, [
    mapRef,
    markersRef,
    movement,
    ideas,
    headerCollapsed,
    onIdeaSelect,
    setHoveredItem,
    ideaLookup,
    featureCollection
  ]);
};

