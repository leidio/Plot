import { useEffect, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { clearMarkers, normalizeCoordinate, projectToScreenPosition } from '../../utils/mapMarkers';

const IDEA_SOURCE_ID = 'ideas-source';
const IDEA_CLUSTER_LAYER_ID = 'ideas-clusters';
const IDEA_CLUSTER_COUNT_LAYER_ID = 'ideas-cluster-count';
const IDEA_UNCLUSTERED_LAYER_ID = 'ideas-unclustered';

const fitMapToIdeas = (mapInstance, features, headerCollapsed) => {
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

      if (!featureCollection.features.length) {
        setHoveredItem(null);
        console.warn('[useIdeaMarkers] No valid idea coordinates to display.');
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
            'circle-color': '#2563eb',
            'circle-opacity': 0.85,
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              14,
              10,
              20,
              25,
              28
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
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
            'circle-color': '#2563eb',
            'circle-radius': 8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
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

      const unclusteredMouseMoveHandler = (event) => {
        const features =
          event.features ||
          mapInstance.queryRenderedFeatures(event.point, {
            layers: [IDEA_UNCLUSTERED_LAYER_ID]
          });

        if (!features?.length) {
          mapInstance.getCanvas().style.cursor = '';
          setHoveredItem(null);
          return;
        }

        mapInstance.getCanvas().style.cursor = 'pointer';
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
        setHoveredItem(null);
      };

      attachHandler('click', IDEA_CLUSTER_LAYER_ID, clusterClickHandler);
      attachHandler('click', IDEA_UNCLUSTERED_LAYER_ID, unclusteredClickHandler);
      attachHandler('mousemove', IDEA_UNCLUSTERED_LAYER_ID, unclusteredMouseMoveHandler);
      attachHandler('mouseleave', IDEA_UNCLUSTERED_LAYER_ID, unclusteredMouseLeaveHandler);

      fitMapToIdeas(mapInstance, featureCollection.features, headerCollapsed);
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

