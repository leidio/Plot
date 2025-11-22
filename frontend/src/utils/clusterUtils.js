import Supercluster from 'supercluster';

export const createCluster = (points, options = {}) => {
  const cluster = new Supercluster({
    radius: options.radius || 60,
    maxZoom: options.maxZoom || 16,
    minZoom: options.minZoom || 0,
    minPoints: options.minPoints || 2,
    ...options
  });

  // Format points for supercluster
  const formattedPoints = points.map((point, index) => ({
    type: 'Feature',
    properties: {
      ...point,
      index,
      cluster: false
    },
    geometry: {
      type: 'Point',
      coordinates: [point.longitude, point.latitude]
    }
  }));

  cluster.load(formattedPoints);
  return cluster;
};

export const getClusterData = (cluster, bounds, zoom) => {
  const bbox = bounds ? [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth()
  ] : null;

  return cluster.getClusters(bbox, Math.floor(zoom));
};

