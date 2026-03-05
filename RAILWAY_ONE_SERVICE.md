# Deploy Plot with one Railway service (backend serves frontend)

Use this when you want a single URL for the whole app (no separate frontend service).

## 1. Railway: use only the backend service

- You can **remove or ignore** the **frontend** service on Railway (or delete it).
- Use only the **plot-backend** service. All steps below refer to that service.

## 2. Backend service settings (plot-backend)

In **Settings** for **plot-backend**:

| Setting | Value |
|--------|--------|
| **Root Directory** | Leave empty (repo root). |
| **Custom Build Command** | `npm ci && npm run build --workspace=frontend` |
| **Custom Start Command** | `npm run start --workspace=backend` |

## 3. Backend service variables (plot-backend → Variables)

Keep what you have and add the two for the frontend build:

| Key | Value |
|-----|--------|
| `DATABASE_URL` | (already set) |
| `DIRECT_URL` | (already set) |
| `JWT_SECRET` | (already set) |
| `FRONTEND_URL` | `https://plot-backend-prod.up.railway.app` (your backend’s public URL) |
| `VITE_API_URL` | `/api` |
| `VITE_MAPBOX_ACCESS_TOKEN` | Your Mapbox token (same as in frontend/.env) |

`VITE_API_URL=/api` makes the built frontend call the same origin; no CORS issues.

## 4. One URL for everything

After deploy, open:

**https://plot-backend-prod.up.railway.app**

- `/` → your app (built frontend)
- `/api/...` → API
- `/health` → health check

## 5. Local development (unchanged)

- Run backend: `cd backend && npm run dev`
- Run frontend: `cd frontend && npm run dev`
- Backend does not serve the frontend locally unless you’ve run `npm run build` in the frontend; use the Vite dev server as usual.
