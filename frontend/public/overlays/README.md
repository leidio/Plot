# Map overlays (Phase 1)

This folder holds **static GeoJSON** used as optional map layers.

- **`land-cover-sample.geojson`** — Demo polygons near New Orleans with a `class` property (`forest`, `water`, `wetland`, `urban`). Replace or extend with your own preprocessed land-cover (or other) data; keep the same `class` values or update the `fill-color` match in `App.jsx` (`applyLandCoverOverlay`).

**Production path:** preprocess authoritative datasets (e.g. NLCD, ESA WorldCover) into GeoJSON or vector tiles, host them, and point the source `data` URL at that asset.
