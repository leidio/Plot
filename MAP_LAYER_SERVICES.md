# Map layer services for Plot

Reference for **subscription / commercial mapping and GIS data** that can feed Mapbox GL JS overlays, plus the **technical plumbing** Plot typically needs. Plot already uses Mapbox for the basemap and patterns such as `geojson` sources and re-applying custom layers on `style.load` (see `frontend/src/App.jsx`).

---

## Integration patterns (Mapbox GL JS)

| Pattern | Mapbox GL | Typical use |
|--------|-----------|-------------|
| **Raster tiles** (PNG/WebP) | `type: 'raster'`, `tiles: [...]` + `raster` layer | Hillshade, weather, aerial basemap overlays |
| **Vector tiles** (MVT) | `type: 'vector'`, `url` or `tiles` + `fill` / `line` / `symbol` layers | Land use, boundaries, roads from vendors |
| **GeoJSON** | `type: 'geojson', data: <url or object>` | Small/clipped polygons, demos, API returns |
| **Mapbox-hosted tilesets** | `url: 'mapbox://username.tilesetid'` | Data uploaded via **Mapbox Tiling Service (MTS)** or legacy uploads |

Provider docs: [Mapbox Tiling Service](https://docs.mapbox.com/mapbox-tiling-service/), [Uploads / tilesets](https://docs.mapbox.com/help/getting-started/uploading-data/).

---

## Subscription-oriented providers (non-exhaustive)

### Tile / map APIs (often XYZ or vector)

- **[MapTiler](https://www.maptiler.com/)** — Cloud styles and datasets; raster and vector tile URLs; common alongside Mapbox GL.
- **[Stadia Maps](https://stadiamaps.com/)** — Raster and vector tiles (e.g. Alidade and other styles).
- **[Thunderforest](https://www.thunderforest.com/)** — Outdoor/hiking-oriented tiles; priced by request tier.
- **[Jawg](https://www.jawg.io/)** — Raster and vector tiles, API-keyed.
- **[TomTom](https://developer.tomtom.com/)** / **[HERE](https://developer.here.com/)** — Tiles, routing, enterprise-style plans; verify Mapbox GL + ToS for tile use.
- **[Azure Maps](https://azure.microsoft.com/en-us/products/azure-maps/)** — Microsoft-hosted tiles and APIs.
- **Google Maps Platform** — Strict ToS for mixing with other engines; often better for dedicated SDK or server-side static maps than ad hoc Mapbox GL raster sources.

### GIS catalogs / ArcGIS ecosystem

- **[Esri ArcGIS Online / Living Atlas](https://livingatlas.arcgis.com/)** — Large layer catalog. Layers often expose **MapServer**, **FeatureServer** (query GeoJSON), or **VectorTileServer** URLs. May need small adapters or a proxy rather than a raw `{z}/{x}/{y}` template.

### Imagery / analytics APIs

- **[Planet](https://www.planet.com/)**, **Sentinel Hub**, **UP42**, etc. — Subscriptions and APIs; delivery is often **WMTS**, **COG**, or bespoke tiles—usually **server-side** staging rather than a single browser tile URL.

### Elevation / terrain

- Plot already uses **Mapbox raster-dem** (`mapbox://mapbox.mapbox-terrain-dem-v1`) for 3D terrain. Other DEMs are commonly ingested as **GeoTIFF → tiles** (MTS, [TiTiler](https://developmentseed.org/titiler), self-hosted XYZ).

### Open vector planet / self-host

- **[OpenMapTiles](https://openmaptiles.org/)** — Schema and tooling; hosting often via **MapTiler Cloud** or your own tile server.

---

## Technical piping (how Plot should serve this)

### 1. Client-only (fastest)

- Add `raster` / `vector` / `geojson` sources and layers after the style is ready; **re-run on `style.load`** when `setStyle` runs (custom layers are dropped).
- **Risk:** API keys in tile URLs are visible in the browser and in DevTools.

### 2. Backend tile or metadata proxy (recommended for production)

- **Route example:** `GET /api/map-tiles/:provider/:z/:x/:y` (or signed redirect).
- **Benefits:** Hide secrets, throttle, log usage, optional CDN cache.
- **Frontend:** Only calls your API origin (fits existing `VITE_API_URL` patterns).

### 3. Preprocess → Mapbox tilesets

- Upload or pipeline GeoJSON / FlatGeobuf / GeoTIFF through **MTS** → `mapbox://…` tileset; client uses the Mapbox token you already ship for the map.
- **Best for:** Large polygons, heavy rasters, consistent performance.

### 4. WMS / WMTS / legacy OGC

- Mapbox GL does not natively act as a WMS client. Common approach: **server** (MapProxy, GeoServer, TiTiler, etc.) turns OGC into **XYZ** or **COG** tiles; Mapbox uses a **raster** source.

### 5. AI / interpretation (future)

- **Display:** tile or vector layers on the map.
- **Reasoning:** send **selection polygon** + **computed stats** (zonal majority, elevation range, intersecting flood zone %) from your backend; the LLM should **not** invent coordinates. Keep dataset name, resolution, and vintage in the payload for honest copy.

### 6. Compliance and UX

- **Attribution:** Mapbox + data provider in the UI where required.
- **Terms of service:** Mixing third-party tiles with a Mapbox basemap may have restrictions—verify each provider.
- **Layer registry:** Maintain a small config (JSON or DB): `id`, `type`, `url` or `tiles`, `minzoom`/`maxzoom`, `opacity`, `attribution`, `requiresProxy`, optional `sourceLayer` for vector tiles.

---

## Plot codebase touchpoints

- Map init and post-style hooks: `frontend/src/App.jsx` (e.g. land-cover overlay helpers).
- Intelligence sends **map selection** (GeoJSON-style coordinates) to the backend; extending AI with GIS should add **server-side analysis** and optionally **layer IDs** returned to the client for toggling.

---

*This document is research scaffolding—not legal or licensing advice. Confirm pricing and ToS with each vendor before production use.*
